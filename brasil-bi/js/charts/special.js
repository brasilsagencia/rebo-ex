/**
 * Brasil BI — visualizações especiais: treemap, heatmap, calendário,
 * mapa esquemático de UFs, nuvem de palavras, tabela, matriz e sankey.
 */

import { svg, truncate, bindTip, linePath } from "./svg.js";
import { el } from "../core/utils.js";
import { sequentialColor } from "../core/theme.js";
import { fmtPercent, fmtDate, toDate, truncDate, isFiniteNumber, norm } from "../core/utils.js";

/* -------------------------------------------------------------- treemap --- */

/** Algoritmo squarify simplificado. */
function squarify(items, x, y, w, h) {
  const result = [];
  const total = items.reduce((acc, i) => acc + i.value, 0);
  if (!total) return result;

  let remaining = [...items];
  let area = { x, y, w, h };

  while (remaining.length) {
    const areaTotal = remaining.reduce((acc, i) => acc + i.value, 0);
    const vertical = area.w >= area.h;
    const side = vertical ? area.h : area.w;
    const otherSide = vertical ? area.w : area.h;

    // Escolhe quantos itens entram na faixa mantendo a razão de aspecto boa.
    let best = 1;
    let bestRatio = Infinity;
    let acc = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      acc += remaining[i].value;
      const bandThickness = (acc / areaTotal) * otherSide;
      const ratios = remaining.slice(0, i + 1).map((item) => {
        const length = (item.value / acc) * side;
        return Math.max(bandThickness / (length || 1), (length || 1) / bandThickness);
      });
      const worst = Math.max(...ratios);
      if (worst <= bestRatio) {
        bestRatio = worst;
        best = i + 1;
      } else break;
    }

    const band = remaining.slice(0, best);
    const bandValue = band.reduce((a, i) => a + i.value, 0);
    const thickness = (bandValue / areaTotal) * otherSide;
    let offset = 0;
    for (const item of band) {
      const length = (item.value / bandValue) * side;
      result.push(
        vertical
          ? { item, x: area.x, y: area.y + offset, w: thickness, h: length }
          : { item, x: area.x + offset, y: area.y, w: length, h: thickness }
      );
      offset += length;
    }
    if (vertical) {
      area = { x: area.x + thickness, y: area.y, w: area.w - thickness, h: area.h };
    } else {
      area = { x: area.x, y: area.y + thickness, w: area.w, h: area.h - thickness };
    }
    remaining = remaining.slice(best);
  }
  return result;
}

export function renderTreemap(ctx) {
  const { data, width, height } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const measure = series[0];
  const items = categories
    .map((cat, i) => ({ cat, value: measure.values[i] }))
    .filter((i) => isFiniteNumber(i.value) && i.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!items.length) return ctx.emptyMessage("Não há valores positivos para o treemap.");

  const total = items.reduce((a, i) => a + i.value, 0);
  const boxes = squarify(items, 0, 0, width, height);
  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", role: "img" });

  boxes.forEach((box, i) => {
    const color = ctx.colorFor(i);
    const node = svg("rect", {
      class: "mark",
      x: box.x + 1,
      y: box.y + 1,
      width: Math.max(0, box.w - 2),
      height: Math.max(0, box.h - 2),
      rx: 5,
      fill: color,
      "fill-opacity": 0.92,
    });
    ctx.decorateMark(node, box.item.cat, measure, box.item.value, {
      extraRows: [{ label: "Participação", value: fmtPercent((box.item.value / total) * 100) }],
    });
    root.append(node);

    if (box.w > 54 && box.h > 26) {
      const group = svg("g", { style: "pointer-events:none" });
      group.append(
        svg("text", { x: box.x + 8, y: box.y + 17, class: "value-label", fill: "#08130c", style: "paint-order:stroke;stroke:rgba(255,255,255,.5);stroke-width:2.5px" }, truncate(box.item.cat.label, box.w - 14, 10.5))
      );
      if (box.h > 40) {
        group.append(
          svg("text", { x: box.x + 8, y: box.y + 31, class: "axis-label", fill: "#08130c" }, ctx.fmtValue(box.item.value, measure.measure, { compact: true }))
        );
      }
      root.append(group);
    }
  });
  return root;
}

/* -------------------------------------------------------------- heatmap --- */

/** Matriz dimensão × breakdown colorida por intensidade. */
export function renderHeatmap(ctx) {
  const { data, width, height } = ctx;
  const categories = data.categories || [];
  const series = data.series || [];
  if (!categories.length || !series.length) return ctx.emptyMessage();
  if (!data.breakdown) return ctx.emptyMessage("Escolha um campo em “Dividir por” para montar o mapa de calor.");

  const values = series.flatMap((s) => s.values.filter(isFiniteNumber));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);

  const labelW = Math.min(130, Math.max(64, width * 0.22));
  const headerH = 24;
  const cellW = (width - labelW) / categories.length;
  const cellH = Math.max(16, Math.min(38, (height - headerH) / series.length));

  const root = svg("svg", { viewBox: `0 0 ${width} ${Math.max(height, headerH + series.length * cellH + 4)}`, preserveAspectRatio: "xMinYMin meet", role: "img" });

  categories.forEach((cat, i) => {
    root.append(
      svg("text", { class: "axis-label", x: labelW + i * cellW + cellW / 2, y: headerH - 8, "text-anchor": "middle" }, truncate(cat.label, cellW, 9.5))
    );
  });

  series.forEach((s, r) => {
    root.append(
      svg("text", { class: "axis-label", x: labelW - 8, y: headerH + r * cellH + cellH / 2 + 3, "text-anchor": "end" }, truncate(s.name, labelW - 12, 10))
    );
    categories.forEach((cat, c) => {
      const value = s.values[c];
      const t = isFiniteNumber(value) ? (value - min) / (max - min || 1) : null;
      const node = svg("rect", {
        class: "mark",
        x: labelW + c * cellW + 1,
        y: headerH + r * cellH + 1,
        width: Math.max(1, cellW - 2),
        height: Math.max(1, cellH - 2),
        rx: 3,
        fill: t === null ? "var(--surface-3)" : sequentialColor(t, "verde"),
      });
      ctx.decorateMark(node, cat, s, value, { extraRows: [{ label: "Série", value: s.name }] });
      root.append(node);
      if (cellW > 46 && cellH > 20 && isFiniteNumber(value)) {
        root.append(
          svg(
            "text",
            {
              x: labelW + c * cellW + cellW / 2,
              y: headerH + r * cellH + cellH / 2 + 3.5,
              "text-anchor": "middle",
              class: "value-label",
              style: "pointer-events:none;font-size:9.5px",
              fill: t > 0.55 ? "#06140c" : "var(--text)",
            },
            ctx.fmtValue(value, s.measure, { compact: true })
          )
        );
      }
    });
  });

  return root;
}

/* -------------------------------------------------- calendário de atividades */

export function renderCalendar(ctx) {
  const { data, width } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (!categories.length || !series.length) return ctx.emptyMessage();
  if (data.dimension?.type !== "date" && data.dimension?.type !== "datetime") {
    return ctx.emptyMessage("O calendário precisa de um campo de data na dimensão.");
  }

  const measure = series[0];
  const points = categories
    .map((cat, i) => ({ date: toDate(cat.raw || cat.key), value: measure.values[i], cat }))
    .filter((p) => p.date);
  if (!points.length) return ctx.emptyMessage();

  points.sort((a, b) => a.date - b.date);
  const first = truncDate(points[0].date, "week");
  const last = points[points.length - 1].date;
  const weeks = Math.max(1, Math.ceil((last - first) / (7 * 86400000)) + 1);

  const cell = Math.max(8, Math.min(16, (width - 34) / weeks - 2));
  const gap = 2;
  const gridW = weeks * (cell + gap) + 30;
  const gridH = 7 * (cell + gap) + 22;

  const values = points.map((p) => p.value).filter(isFiniteNumber);
  const max = Math.max(...values, 1);
  const byDay = new Map(points.map((p) => [truncDate(p.date, "day").getTime(), p]));

  const root = svg("svg", { viewBox: `0 0 ${gridW} ${gridH}`, preserveAspectRatio: "xMinYMin meet", role: "img" });
  ["seg", "qua", "sex"].forEach((label, i) => {
    root.append(svg("text", { class: "axis-label", x: 0, y: 20 + (i * 2) * (cell + gap) + cell, style: "font-size:9px" }, label));
  });

  for (let w = 0; w < weeks; w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(first.getTime() + (w * 7 + d) * 86400000);
      const entry = byDay.get(truncDate(date, "day").getTime());
      const value = entry?.value;
      const t = isFiniteNumber(value) ? value / max : null;
      const node = svg("rect", {
        class: "mark",
        x: 30 + w * (cell + gap),
        y: 14 + d * (cell + gap),
        width: cell,
        height: cell,
        rx: 2.5,
        fill: t === null ? "var(--surface-3)" : sequentialColor(0.15 + t * 0.85, "verde"),
        stroke: "var(--border)",
        "stroke-width": 0.5,
      });
      if (entry) ctx.decorateMark(node, entry.cat, measure, value);
      else {
        bindTip(node, () => ({ title: fmtDate(date), rows: [{ label: "Sem registros", value: "—" }] }));
      }
      root.append(node);
    }
    const monthStart = new Date(first.getTime() + w * 7 * 86400000);
    if (monthStart.getDate() <= 7) {
      root.append(
        svg("text", { class: "axis-label", x: 30 + w * (cell + gap), y: 9, style: "font-size:9px" }, fmtDate(monthStart, "month"))
      );
    }
  }
  return root;
}

/* ------------------------------------------------------- mapa por UF ------ */

const UF_GRID = [
  ["RR", "Roraima", 2, 0], ["AP", "Amapá", 3, 0],
  ["AM", "Amazonas", 1, 1], ["PA", "Pará", 2, 1], ["MA", "Maranhão", 3, 1], ["CE", "Ceará", 4, 1], ["RN", "Rio Grande do Norte", 5, 1],
  ["AC", "Acre", 0, 2], ["RO", "Rondônia", 1, 2], ["TO", "Tocantins", 2, 2], ["PI", "Piauí", 3, 2], ["PE", "Pernambuco", 4, 2], ["PB", "Paraíba", 5, 2],
  ["MT", "Mato Grosso", 1, 3], ["GO", "Goiás", 2, 3], ["BA", "Bahia", 3, 3], ["SE", "Sergipe", 4, 3], ["AL", "Alagoas", 5, 3],
  ["MS", "Mato Grosso do Sul", 1, 4], ["MG", "Minas Gerais", 2, 4], ["ES", "Espírito Santo", 3, 4],
  ["DF", "Distrito Federal", 4, 4],
  ["SP", "São Paulo", 2, 5], ["RJ", "Rio de Janeiro", 3, 5],
  ["PR", "Paraná", 1, 6], ["SC", "Santa Catarina", 2, 6], ["RS", "Rio Grande do Sul", 3, 6],
].map(([code, name, col, row]) => ({ code, name, col, row }));

const UF_BY_KEY = (() => {
  const map = new Map();
  for (const uf of UF_GRID) {
    map.set(norm(uf.code), uf); // "sp"
    map.set(norm(uf.name), uf); // "sao paulo" (norm remove acentos)
  }
  return map;
})();

/** Mapa esquemático (tile grid) dos 26 estados + DF. */
export function renderUfMap(ctx) {
  const { data } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const measure = series[0];
  const byUf = new Map();
  let unmatched = 0;
  categories.forEach((cat, i) => {
    const uf = UF_BY_KEY.get(norm(cat.label));
    if (!uf) {
      unmatched += 1;
      return;
    }
    byUf.set(uf.code, { value: measure.values[i], cat });
  });

  const values = Array.from(byUf.values()).map((v) => v.value).filter(isFiniteNumber);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);

  const grid = el("div.uf-map", { role: "group", "aria-label": "Mapa esquemático por estado" });
  const cells = new Map();
  for (const uf of UF_GRID) {
    const entry = byUf.get(uf.code);
    const t = entry && isFiniteNumber(entry.value) ? (entry.value - min) / (max - min || 1) : null;
    const cell = el(
      `button.uf-cell${entry ? "" : ".is-empty"}`,
      {
        type: "button",
        style: {
          gridColumn: String(uf.col + 1),
          gridRow: String(uf.row + 1),
          background: t === null ? "" : sequentialColor(0.12 + t * 0.88, "verde"),
          color: t !== null && t > 0.55 ? "#06140c" : "",
        },
        "aria-label": `${uf.name}: ${entry ? ctx.fmtValue(entry.value, measure.measure) : "sem dados"}`,
        disabled: !entry,
      },
      uf.code
    );
    if (entry) {
      ctx.decorateMark(cell, entry.cat, measure, entry.value, {
        extraRows: [{ label: "Estado", value: uf.name }],
        html: true,
      });
      cells.set(uf.code, cell);
    }
    grid.append(cell);
  }

  const wrapper = el("div", { style: { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" } }, [
    grid,
    el("div.uf-legend", {}, [
      el("span", { text: ctx.fmtValue(min, measure.measure, { compact: true }) }),
      el("span.uf-legend__scale", {
        style: { background: `linear-gradient(90deg, ${sequentialColor(0.12)}, ${sequentialColor(1)})` },
      }),
      el("span", { text: ctx.fmtValue(max, measure.measure, { compact: true }) }),
      unmatched
        ? el("span.dim", { text: `• ${unmatched} categoria(s) fora do mapa`, style: { marginLeft: "auto" } })
        : null,
    ]),
  ]);
  return wrapper;
}

/* ------------------------------------------------------ nuvem de palavras -- */

export function renderWordCloud(ctx) {
  const { data } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const measure = series[0];
  const items = categories
    .map((cat, i) => ({ cat, value: measure.values[i] }))
    .filter((i) => isFiniteNumber(i.value) && i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 60);
  if (!items.length) return ctx.emptyMessage();

  const max = items[0].value;
  const min = items[items.length - 1].value;
  const cloud = el("div.wordcloud");
  items.forEach((item, i) => {
    const t = (item.value - min) / (max - min || 1);
    const node = el(
      "button",
      {
        type: "button",
        style: { fontSize: `${11 + t * 24}px`, color: ctx.colorFor(i % 10) },
        title: `${item.cat.label}: ${ctx.fmtValue(item.value, measure.measure)}`,
      },
      item.cat.label
    );
    ctx.decorateMark(node, item.cat, measure, item.value, { html: true });
    cloud.append(node);
  });
  return cloud;
}

/* -------------------------------------------------------- tabela e matriz -- */

export function renderTable(ctx) {
  const { data, options } = ctx;
  const rows = data.rows || [];
  const fields = (ctx.tableFields || []).filter((f) => f.visible !== false);
  if (!rows.length || !fields.length) return ctx.emptyMessage("Sem registros para exibir.");

  const limit = options.rowLimit || 200;
  const shown = rows.slice(0, limit);

  const table = el("table", {}, [
    el("thead", {}, [
      el(
        "tr",
        {},
        fields.map((f) => el(`th${ctx.isNumeric(f) ? ".num" : ""}`, { text: f.label || f.name }))
      ),
    ]),
    el(
      "tbody",
      {},
      shown.map((row) =>
        el(
          "tr",
          {
            "on:click": () => ctx.onRowClick?.(row),
          },
          fields.map((f) => {
            const value = row[f.name];
            return el(
              `td${ctx.isNumeric(f) ? ".num" : ""}`,
              value === null || value === undefined || value === ""
                ? { class: "cell-null", text: "—" }
                : { text: ctx.fmtValue(value, { field: f.name, type: f.type }) }
            );
          })
        )
      )
    ),
  ]);

  const wrap = el("div.viz-table", {}, [table]);
  if (rows.length > limit) {
    return el("div", { style: { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" } }, [
      wrap,
      el("div.viz__summary", { text: `Exibindo ${limit} de ${rows.length} registros filtrados.` }),
    ]);
  }
  return wrap;
}

/** Matriz: dimensão nas linhas, breakdown nas colunas, medida nas células. */
export function renderMatrix(ctx) {
  const { data } = ctx;
  const categories = data.categories || [];
  const series = data.series || [];
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const rowTotals = categories.map((_, i) => series.reduce((acc, s) => acc + (isFiniteNumber(s.values[i]) ? s.values[i] : 0), 0));
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);
  const maxCell = Math.max(...series.flatMap((s) => s.values.filter(isFiniteNumber)), 1);

  const table = el("table", {}, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: data.dimension?.label || "Categoria" }),
        ...series.map((s) => el("th.num", { text: s.name })),
        el("th.num", { text: "Total" }),
      ]),
    ]),
    el(
      "tbody",
      {},
      categories.map((cat, i) =>
        el(
          "tr",
          {
            class: ctx.isSelected(cat) ? "is-selected" : "",
            "on:click": () => ctx.select(cat),
          },
          [
            el("td", { text: cat.label }),
            ...series.map((s) => {
              const value = s.values[i];
              const pct = isFiniteNumber(value) ? (value / maxCell) * 100 : 0;
              return el("td.num", {}, [
                el("span.databar", {
                  style: { "--pct": `${pct}%` },
                  text: isFiniteNumber(value) ? ctx.fmtValue(value, s.measure, { compact: true }) : "—",
                }),
              ]);
            }),
            el("td.num", { text: ctx.fmtValue(rowTotals[i], series[0].measure, { compact: true }) }),
          ]
        )
      )
    ),
    el("tfoot", {}, [
      el("tr", {}, [
        el("th", { text: "Total geral" }),
        ...series.map((s) =>
          el("th.num", {
            text: ctx.fmtValue(
              s.values.reduce((a, v) => a + (isFiniteNumber(v) ? v : 0), 0),
              s.measure,
              { compact: true }
            ),
          })
        ),
        el("th.num", { text: ctx.fmtValue(grandTotal, series[0].measure, { compact: true }) }),
      ]),
    ]),
  ]);

  return el("div.viz-table", {}, [table]);
}

/* --------------------------------------------------------------- sankey --- */

/** Fluxo de duas camadas: dimensão → “dividir por”. */
export function renderSankey(ctx) {
  const { data, width, height } = ctx;
  const categories = data.categories || [];
  const series = data.series || [];
  if (!categories.length || !series.length) return ctx.emptyMessage();
  if (!data.breakdown) return ctx.emptyMessage("O Sankey precisa de um campo em “Dividir por”.");

  const links = [];
  categories.forEach((cat, i) => {
    series.forEach((s, j) => {
      const value = s.values[i];
      if (isFiniteNumber(value) && value > 0) links.push({ from: i, to: j, value, cat, series: s });
    });
  });
  if (!links.length) return ctx.emptyMessage();

  const total = links.reduce((a, l) => a + l.value, 0);
  const nodeW = 12;
  const pad = 6;
  const leftTotals = categories.map((_, i) => links.filter((l) => l.from === i).reduce((a, l) => a + l.value, 0));
  const rightTotals = series.map((_, j) => links.filter((l) => l.to === j).reduce((a, l) => a + l.value, 0));

  const scaleH = (value) => (value / total) * (height - pad * Math.max(categories.length, series.length) - 8);

  const leftY = [];
  let acc = 4;
  leftTotals.forEach((t, i) => {
    leftY[i] = acc;
    acc += scaleH(t) + pad;
  });
  const rightY = [];
  acc = 4;
  rightTotals.forEach((t, j) => {
    rightY[j] = acc;
    acc += scaleH(t) + pad;
  });

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", role: "img" });
  const labelW = Math.min(120, width * 0.22);
  const x0 = labelW;
  const x1 = width - labelW - nodeW;

  const leftOffset = new Array(categories.length).fill(0);
  const rightOffset = new Array(series.length).fill(0);

  for (const link of links) {
    const h = scaleH(link.value);
    const y0 = leftY[link.from] + leftOffset[link.from];
    const y1 = rightY[link.to] + rightOffset[link.to];
    leftOffset[link.from] += h;
    rightOffset[link.to] += h;
    const midX = (x0 + nodeW + x1) / 2;
    const path = `M${x0 + nodeW},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + h} C${midX},${y1 + h} ${midX},${y0 + h} ${x0 + nodeW},${y0 + h} Z`;
    const node = svg("path", { class: "mark", d: path, fill: ctx.colorFor(link.from), "fill-opacity": 0.36 });
    ctx.decorateMark(node, link.cat, link.series, link.value, {
      extraRows: [{ label: "Destino", value: link.series.name }],
    });
    root.append(node);
  }

  categories.forEach((cat, i) => {
    const h = scaleH(leftTotals[i]);
    root.append(svg("rect", { x: x0, y: leftY[i], width: nodeW, height: Math.max(2, h), rx: 2, fill: ctx.colorFor(i) }));
    root.append(svg("text", { class: "axis-label", x: x0 - 6, y: leftY[i] + h / 2 + 3, "text-anchor": "end" }, truncate(cat.label, labelW - 10, 10)));
  });
  series.forEach((s, j) => {
    const h = scaleH(rightTotals[j]);
    root.append(svg("rect", { x: x1, y: rightY[j], width: nodeW, height: Math.max(2, h), rx: 2, fill: ctx.colorFor(j + categories.length) }));
    root.append(svg("text", { class: "axis-label", x: x1 + nodeW + 6, y: rightY[j] + h / 2 + 3 }, truncate(s.name, labelW - 10, 10)));
  });

  return root;
}

export { linePath };
