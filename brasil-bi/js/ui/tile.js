/**
 * Brasil BI — componente de tile (cartão do dashboard).
 * Cuida do ciclo: resolver dados → consultar → desenhar → interagir.
 */

import { el, render, clamp, debounce, fmtRelative } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { modal, popover, toast, confirmDialog, skeletonBlock } from "./feedback.js";
import { resolveDataset, runQuery, computeKpi } from "../data/query.js";
import { renderChart, renderKpiCard, CHART_TYPES, chartLabel } from "../charts/index.js";
import { getState, toggleSelection, updateTile, activeDashboard, upsertDashboard } from "../core/store.js";
import { exportChartPng, exportCsv, chartDataToRows } from "../export/exporters.js";

const hiddenSeriesByTile = new Map();

/**
 * Monta um tile.
 * @param {Object} tile
 * @param {{editing?:boolean, onEdit?:Function, onChanged?:Function, dashboard?:Object}} opts
 * @returns {{node:HTMLElement, refresh:Function, tile:Object}}
 */
export function mountTile(tile, opts = {}) {
  const layout = tile.layout || CHART_TYPES[tile.type]?.defaultSize || { col: 4, h: 3 };
  const node = el("section.tile", {
    style: { "--col": String(layout.col || 4) },
    "data-h": String(layout.h || 3),
    "data-tile": tile.id,
    "data-locked": String(Boolean(tile.locked)),
    "aria-label": tile.title || chartLabel(tile.type),
  });

  const titleEl = el("div.tile__title", { text: tile.title || chartLabel(tile.type) });
  const subEl = el("div.tile__sub");
  const viz = el("div.viz", { role: "group" });

  const tools = el("div.tile__tools", {}, [
    el("button.btn.btn--ghost.btn--icon.btn--sm.tile__handle", {
      "aria-label": "Mover componente",
      "data-tip": "Arrastar",
      title: "Arrastar para reordenar",
    }, [icon("drag", { size: 14 })]),
    el("button.btn.btn--ghost.btn--icon.btn--sm", {
      "aria-label": "Tela cheia",
      "data-tip": "Tela cheia",
      "on:click": () => openFullscreen(),
    }, [icon("expand", { size: 14 })]),
    el("button.btn.btn--ghost.btn--icon.btn--sm", {
      "aria-label": "Mais ações",
      "data-tip": "Ações",
      "on:click": (e) => openMenu(e.currentTarget),
    }, [icon("settings", { size: 14 })]),
  ]);

  node.append(
    el("header.tile__head", {}, [el("div.tile__titles", {}, [titleEl, subEl]), tools]),
    el("div.tile__body", {}, [viz])
  );

  if (!tile.locked) {
    node.append(
      el("div.tile__resize", { "aria-hidden": "true", title: "Redimensionar" }, [icon("chevronRight", { size: 14 })])
    );
    enableResize(node, tile, opts);
    enableDrag(node, tile, opts);
  }

  let lastCtx = null;
  let lastData = null;

  async function refresh() {
    if (!tile.datasetId) {
      render(viz, el("div.empty", { style: { padding: "16px" } }, [el("p", { text: "Selecione uma fonte de dados para este componente." })]));
      return;
    }
    render(viz, skeletonBlock(Math.max(90, (layout.h || 3) * 84)));

    const source = await resolveDataset(tile.datasetId);
    if (!source) {
      render(viz, el("div.empty", { style: { padding: "16px" } }, [el("p", { text: "A fonte deste componente não existe mais." })]));
      return;
    }

    const state = getState();
    const selection = [...state.filters.selection, ...state.filters.global];
    const params = { rows: source.rows, fields: source.fields, datasetId: tile.datasetId };

    subEl.textContent = buildSubtitle(tile, source);

    if (tile.type === "kpi" || tile.type === "gauge") {
      const measure = tile.measures?.[0];
      if (!measure) {
        render(viz, el("div.empty", { style: { padding: "12px" } }, [el("p", { text: "Escolha uma medida para o indicador." })]));
        return;
      }
      const kpi = computeKpi(params, {
        measure,
        goal: tile.options?.goal,
        higherIsBetter: tile.options?.higherIsBetter,
        tileId: tile.id,
        label: tile.title,
      });
      lastData = kpi;
      if (tile.type === "kpi") {
        renderKpiCard(viz, kpi, tile);
      } else {
        const { width, height } = measureViz(viz, layout);
        lastCtx = renderChart(viz, {
          tile,
          data: { kind: "scalar", series: [], categories: [] },
          fields: source.fields,
          width,
          height,
          gauge: {
            value: kpi.value,
            goal: kpi.goal,
            max: tile.options?.gaugeMax,
            status: kpi.status,
            label: tile.title,
            measure: { type: kpi.type },
          },
          selection,
        });
      }
      return;
    }

    if (tile.type === "table") {
      const rows = runQuery(params, { measures: [], tileId: tile.id }).rows;
      const { width, height } = measureViz(viz, layout);
      lastData = { rows, kind: "rows" };
      lastCtx = renderChart(viz, {
        tile,
        data: { rows, kind: "rows", series: [], categories: [] },
        fields: source.fields,
        tableFields: (tile.options?.columns?.length
          ? source.fields.filter((f) => tile.options.columns.includes(f.name))
          : source.fields
        ).slice(0, 14),
        width,
        height,
        selection,
      });
      return;
    }

    if (tile.type === "histogram") {
      const measure = tile.measures?.[0];
      const values = runQuery(params, { measures: [], tileId: tile.id })
        .rows.map((r) => Number(r[measure?.field]))
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => a - b);
      const { buildHistogram } = await import("../data/profile.js");
      const { width, height } = measureViz(viz, layout);
      lastData = { histogram: buildHistogram(values) };
      lastCtx = renderChart(viz, {
        tile,
        data: { ...lastData, kind: "grouped", series: [], categories: [] },
        fields: source.fields,
        width,
        height,
        selection,
      });
      return;
    }

    const data = runQuery(params, {
      dimension: tile.dimension,
      grain: tile.grain,
      breakdown: tile.breakdown,
      measures: tile.measures || [],
      limit: tile.limit,
      sort: tile.sort,
      groupOthers: tile.options?.groupOthers,
      tileId: tile.id,
      crossFilterSelf: true,
    });
    lastData = data;

    const { width, height } = measureViz(viz, layout);
    lastCtx = renderChart(viz, {
      tile,
      data,
      fields: source.fields,
      width,
      height,
      selection,
      hiddenSeries: hiddenSeriesByTile.get(tile.id),
      onToggleSeries: (key) => {
        const set = hiddenSeriesByTile.get(tile.id) || new Set();
        if (set.has(key)) set.delete(key);
        else set.add(key);
        hiddenSeriesByTile.set(tile.id, set);
        refresh();
      },
      onSelect: (filter) => {
        if (!filter) return;
        toggleSelection(filter);
      },
    });

    node.classList.toggle("is-cross-filtered", selection.some((f) => f.sourceTile === tile.id));
  }

  function openFullscreen() {
    const body = el("div", { style: { height: "min(70vh, 620px)", display: "flex" } });
    const ref = modal({ title: tile.title || chartLabel(tile.type), wide: true, body });
    const bigViz = el("div.viz", { style: { flex: "1", minHeight: "0" } });
    body.append(bigViz);
    requestAnimationFrame(() => {
      const rect = bigViz.getBoundingClientRect();
      if (lastData && tile.type !== "kpi") {
        renderChart(bigViz, {
          tile,
          data: lastData.kind ? lastData : { ...lastData, kind: "grouped" },
          fields: [],
          width: rect.width,
          height: rect.height,
          selection: [],
          tableFields: lastCtx?.tableFields,
        });
      } else if (lastData) {
        renderKpiCard(bigViz, lastData, tile);
      }
    });
    void ref;
  }

  function openMenu(anchor) {
    const dashboard = activeDashboard();
    popover(anchor, [
      opts.onEdit ? { label: "Editar componente", icon: "editor", onClick: () => opts.onEdit(tile) } : null,
      { label: "Tela cheia", icon: "expand", onClick: openFullscreen },
      "-",
      {
        label: "Exportar imagem (PNG)",
        icon: "download",
        onClick: () => exportChartPng(viz, { filename: `${(tile.title || "grafico").replace(/\s+/g, "-").toLowerCase()}.png` }),
      },
      {
        label: "Exportar dados (CSV)",
        icon: "table",
        onClick: () => {
          if (lastData?.kind === "grouped") {
            const { columns, rows } = chartDataToRows(lastData);
            exportCsv(columns, rows, `${(tile.title || "dados").replace(/\s+/g, "-").toLowerCase()}.csv`);
          } else if (lastData?.rows?.length) {
            const columns = Object.keys(lastData.rows[0]);
            exportCsv(columns, lastData.rows, "registros.csv");
          } else {
            toast("Nada para exportar neste componente", { level: "warn" });
          }
        },
      },
      "-",
      {
        label: tile.locked ? "Desbloquear" : "Bloquear posição",
        icon: tile.locked ? "unlock" : "lock",
        onClick: () => {
          updateTile(tile.id, (t) => {
            t.locked = !t.locked;
          });
          opts.onChanged?.();
        },
      },
      {
        label: "Duplicar",
        icon: "copy",
        onClick: () => {
          if (!dashboard) return;
          const copy = { ...JSON.parse(JSON.stringify(tile)), id: `tile_${Date.now().toString(36)}` };
          const idx = dashboard.tiles.findIndex((t) => t.id === tile.id);
          dashboard.tiles.splice(idx + 1, 0, copy);
          upsertDashboard(dashboard);
          opts.onChanged?.();
        },
      },
      {
        label: "Excluir",
        icon: "trash",
        onClick: async () => {
          const ok = await confirmDialog({
            title: "Excluir componente",
            message: `Remover "${tile.title || chartLabel(tile.type)}" do dashboard? Os dados da fonte não são afetados.`,
            confirmLabel: "Excluir",
            danger: true,
          });
          if (!ok || !dashboard) return;
          dashboard.tiles = dashboard.tiles.filter((t) => t.id !== tile.id);
          upsertDashboard(dashboard);
          opts.onChanged?.();
        },
      },
    ].filter(Boolean));
  }

  return { node, refresh, tile, getData: () => lastData };
}

function measureViz(viz, layout) {
  const rect = viz.getBoundingClientRect();
  return {
    width: Math.max(220, rect.width || 320),
    height: Math.max(120, rect.height || (layout.h || 3) * 92),
  };
}

function buildSubtitle(tile, source) {
  if (tile.subtitle) return tile.subtitle;
  const parts = [];
  if (tile.dimension) parts.push(`por ${tile.dimension}`);
  if (tile.breakdown) parts.push(`dividido por ${tile.breakdown}`);
  if (source.dataset?.isDemo) parts.push("dados de demonstração");
  return parts.join(" · ");
}

/* ------------------------------------------------------ arrastar e soltar */

let draggedTileId = null;

function enableDrag(node, tile, opts) {
  const handle = node.querySelector(".tile__handle");
  if (!handle) return;

  handle.addEventListener("mousedown", () => {
    node.setAttribute("draggable", "true");
  });
  handle.addEventListener("mouseup", () => node.removeAttribute("draggable"));

  node.addEventListener("dragstart", (e) => {
    draggedTileId = tile.id;
    node.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tile.id);
  });
  node.addEventListener("dragend", () => {
    draggedTileId = null;
    node.classList.remove("is-dragging");
    node.removeAttribute("draggable");
    document.querySelectorAll(".tile.is-drop-target").forEach((n) => n.classList.remove("is-drop-target"));
  });
  node.addEventListener("dragover", (e) => {
    if (!draggedTileId || draggedTileId === tile.id) return;
    e.preventDefault();
    node.classList.add("is-drop-target");
  });
  node.addEventListener("dragleave", () => node.classList.remove("is-drop-target"));
  node.addEventListener("drop", (e) => {
    e.preventDefault();
    node.classList.remove("is-drop-target");
    const dashboard = activeDashboard();
    if (!dashboard || !draggedTileId || draggedTileId === tile.id) return;
    const from = dashboard.tiles.findIndex((t) => t.id === draggedTileId);
    const to = dashboard.tiles.findIndex((t) => t.id === tile.id);
    if (from < 0 || to < 0) return;
    const [moved] = dashboard.tiles.splice(from, 1);
    dashboard.tiles.splice(to, 0, moved);
    upsertDashboard(dashboard);
    opts.onChanged?.();
  });
}

/* -------------------------------------------------------- redimensionar -- */

function enableResize(node, tile, opts) {
  const handle = node.querySelector(".tile__resize");
  if (!handle) return;

  const commit = debounce(() => {
    updateTile(tile.id, (t) => {
      t.layout = { ...(t.layout || {}), col: currentCol, h: currentH };
    });
    opts.onChanged?.({ silent: true });
  }, 320);

  let startX = 0;
  let startY = 0;
  let baseCol = tile.layout?.col || 4;
  let baseH = tile.layout?.h || 3;
  let currentCol = baseCol;
  let currentH = baseH;
  let gridUnit = 100;

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    currentCol = clamp(Math.round(baseCol + dx / gridUnit), 2, 12);
    currentH = clamp(Math.round(baseH + dy / 92), 1, 5);
    node.style.setProperty("--col", String(currentCol));
    node.setAttribute("data-h", String(currentH));
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.body.style.userSelect = "";
    commit();
  };

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    baseCol = Number(node.style.getPropertyValue("--col")) || 4;
    baseH = Number(node.getAttribute("data-h")) || 3;
    const grid = node.closest(".dash-grid");
    gridUnit = grid ? grid.clientWidth / 12 : 100;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

export { fmtRelative };
