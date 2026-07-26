/**
 * Brasil BI — biblioteca de gráficos: catálogo, contexto de renderização,
 * interatividade (cross-filter, tooltip, teclado) e resumo acessível.
 */

import { el, render, fmtByType, fmtCompact, fmtPercent, isFiniteNumber, addPeriod, toDate } from "../core/utils.js";
import { icon } from "../core/icons.js";
import { seriesColor, cssVar } from "../core/theme.js";
import { bindTip, hideTip } from "./svg.js";
import { renderCartesian, renderScatter, renderWaterfall, renderHistogram, renderSparkline } from "./cartesian.js";
import { renderPie, renderGauge, renderRadar, renderFunnel } from "./radial.js";
import {
  renderTreemap,
  renderHeatmap,
  renderCalendar,
  renderUfMap,
  renderWordCloud,
  renderTable,
  renderMatrix,
  renderSankey,
} from "./special.js";
import { NUMERIC_TYPES, TEMPORAL_TYPES } from "../data/types.js";

/**
 * Catálogo de visualizações.
 * requires.measures = [mínimo, máximo]; breakdown: none | optional | required
 */
export const CHART_TYPES = {
  kpi: { label: "Indicador (KPI)", group: "Indicadores", requires: { dimension: false, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 3, h: 2 } },
  gauge: { label: "Velocímetro", group: "Indicadores", requires: { dimension: false, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 3, h: 3 } },

  column: { label: "Colunas", group: "Comparação", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 6, h: 3 } },
  bar: { label: "Barras", group: "Comparação", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 4, h: 3 } },
  columnStacked: { label: "Colunas empilhadas", group: "Comparação", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 6, h: 3 } },
  barStacked: { label: "Barras empilhadas", group: "Comparação", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 6, h: 3 } },
  percentStacked: { label: "100% empilhado", group: "Comparação", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 6, h: 3 } },

  line: { label: "Linhas", group: "Evolução", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 8, h: 3 } },
  area: { label: "Área", group: "Evolução", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 8, h: 3 } },
  areaStacked: { label: "Área empilhada", group: "Evolução", requires: { dimension: true, measures: [1, 4], breakdown: "optional" }, defaultSize: { col: 8, h: 3 } },
  combo: { label: "Combinado (coluna + linha)", group: "Evolução", requires: { dimension: true, measures: [2, 4], breakdown: "none" }, defaultSize: { col: 8, h: 3 } },
  calendar: { label: "Calendário de atividades", group: "Evolução", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 8, h: 2 } },

  pie: { label: "Pizza", group: "Composição", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 4, h: 3 } },
  donut: { label: "Rosca", group: "Composição", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 4, h: 3 } },
  treemap: { label: "Treemap", group: "Composição", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 6, h: 3 } },
  funnel: { label: "Funil", group: "Composição", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 4, h: 3 } },
  waterfall: { label: "Cascata", group: "Composição", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 6, h: 3 } },
  sankey: { label: "Sankey (fluxo)", group: "Composição", requires: { dimension: true, measures: [1, 1], breakdown: "required" }, defaultSize: { col: 6, h: 3 } },

  scatter: { label: "Dispersão", group: "Distribuição", requires: { dimension: true, measures: [2, 2], breakdown: "none" }, defaultSize: { col: 6, h: 3 } },
  bubble: { label: "Bolhas", group: "Distribuição", requires: { dimension: true, measures: [3, 3], breakdown: "none" }, defaultSize: { col: 6, h: 3 } },
  histogram: { label: "Histograma", group: "Distribuição", requires: { dimension: false, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 6, h: 3 } },
  radar: { label: "Radar", group: "Distribuição", requires: { dimension: true, measures: [1, 3], breakdown: "optional" }, defaultSize: { col: 4, h: 3 } },
  heatmap: { label: "Mapa de calor", group: "Distribuição", requires: { dimension: true, measures: [1, 1], breakdown: "required" }, defaultSize: { col: 6, h: 3 } },

  ufmap: { label: "Mapa por estado (UF)", group: "Geográfico", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 4, h: 3 } },

  table: { label: "Tabela de registros", group: "Detalhe", requires: { dimension: false, measures: [0, 0], breakdown: "none" }, defaultSize: { col: 8, h: 3 } },
  matrix: { label: "Matriz", group: "Detalhe", requires: { dimension: true, measures: [1, 1], breakdown: "required" }, defaultSize: { col: 6, h: 3 } },
  wordcloud: { label: "Nuvem de palavras", group: "Detalhe", requires: { dimension: true, measures: [1, 1], breakdown: "none" }, defaultSize: { col: 4, h: 3 } },
};

export const CHART_GROUPS = [...new Set(Object.values(CHART_TYPES).map((t) => t.group))];

export function chartLabel(type) {
  return CHART_TYPES[type]?.label || type;
}

/* ---------------------------------------------------------------- contexto */

/**
 * @param {{
 *  data:Object, tile:Object, width:number, height:number,
 *  fields:Array, onSelect:Function, selection:Array, gauge?:Object,
 *  hiddenSeries?:Set, onToggleSeries?:Function
 * }} params
 */
function buildContext(params) {
  const { data, tile, width, height, fields, onSelect, selection = [] } = params;
  const options = tile.options || {};
  const paletteOffset = options.paletteOffset || 0;

  const fieldMap = new Map((fields || []).map((f) => [f.name, f]));

  const ctx = {
    ...params,
    options,
    data,
    width,
    height,
    tableFields: params.tableFields || fields,
    colorFor: (i) => {
      if (options.colors?.[i]) return options.colors[i];
      return seriesColor(i + paletteOffset);
    },
    positiveColor: () => cssVar("--s1"),
    negativeColor: () => cssVar("--danger"),
    statusColor: (status) =>
      ({
        acima: cssVar("--s1"),
        atingida: cssVar("--s1"),
        proximo: cssVar("--warn"),
        abaixo: cssVar("--warn"),
        critico: cssVar("--danger"),
      }[status] || cssVar("--s2")),
    isNumeric: (field) => NUMERIC_TYPES.has(field?.type),
    fmtValue: (value, measure, opts = {}) => {
      if (value === null || value === undefined) return "—";
      const type = measure?.type || measure?.measure?.type || fieldMap.get(measure?.field)?.type || "number";
      return fmtByType(value, type, { compact: opts.compact, ...opts });
    },
    visibleSeries: () => (data.series || []).filter((s) => !params.hiddenSeries?.has(s.key ?? s.name)),
    emptyMessage: (message) =>
      el("div.empty", { style: { padding: "18px" } }, [
        el("div.empty__icon", {}, [icon("info", { size: 20 })]),
        el("p", { text: message || "Sem dados suficientes para esta visualização com os filtros atuais." }),
      ]),
    isSelected: (cat) => selection.some((f) => matchesCategory(f, data, cat)),
    select: (cat) => onSelect?.(selectionFilterFor(data, cat, tile)),
    decorateMark(node, cat, series, value, extra = {}) {
      const isHtml = extra.html;
      node.setAttribute?.("tabindex", "0");
      node.setAttribute?.("role", "button");
      const label = `${cat?.label ?? ""}: ${ctx.fmtValue(value, series?.measure || series)}`;
      node.setAttribute?.("aria-label", label);
      if (ctx.isSelected(cat)) node.classList.add("is-selected");

      bindTip(node, () => ({
        title: cat?.label ?? "",
        rows: [
          {
            label: series?.name || series?.measure?.label || "Valor",
            value: ctx.fmtValue(value, series?.measure || series),
            color: node.getAttribute?.("fill") || undefined,
          },
          ...(extra.extraRows || []),
        ],
        hint: cat?.isOthers ? "Agrupamento automático das categorias menores" : "Clique para filtrar o dashboard",
      }));

      const activate = (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        hideTip();
        ctx.select(cat);
      };
      node.addEventListener("click", activate);
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") activate(e);
      });
      if (isHtml) node.classList.add("mark");
      return node;
    },
  };
  return ctx;
}

/** Filtro gerado ao clicar em uma categoria (respeita datas agrupadas). */
export function selectionFilterFor(data, cat, tile) {
  if (!data.dimension || !cat) return null;
  const field = data.dimension.name;
  if (cat.isOthers) return null;

  if (TEMPORAL_TYPES.has(data.dimension.type) && cat.raw instanceof Date) {
    const grain = data.dimension.grain || "month";
    const from = cat.raw;
    const to = new Date(addPeriod(from, grain, 1).getTime() - 1);
    return {
      field,
      op: "dateRange",
      value: [from.toISOString(), to.toISOString()],
      label: `${data.dimension.label}: ${cat.label}`,
      datasetId: tile?.datasetId,
      sourceTile: tile?.id,
    };
  }
  return {
    field,
    op: "eq",
    value: cat.key,
    label: `${data.dimension.label}: ${cat.label}`,
    datasetId: tile?.datasetId,
    sourceTile: tile?.id,
  };
}

function matchesCategory(filter, data, cat) {
  if (!data.dimension || filter.field !== data.dimension.name) return false;
  if (filter.op === "dateRange") return cat.raw instanceof Date && filter.value?.[0] === cat.raw.toISOString();
  return String(filter.value) === String(cat.key);
}

/* -------------------------------------------------------------- renderização */

const RENDERERS = {
  column: (ctx) => renderCartesian(ctx, "column"),
  bar: (ctx) => renderCartesian(ctx, "bar"),
  columnStacked: (ctx) => renderCartesian(ctx, "columnStacked"),
  barStacked: (ctx) => renderCartesian(ctx, "barStacked"),
  percentStacked: (ctx) => renderCartesian(ctx, "percentStacked"),
  line: (ctx) => renderCartesian(ctx, "line"),
  area: (ctx) => renderCartesian(ctx, "area"),
  areaStacked: (ctx) => renderCartesian(ctx, "areaStacked"),
  combo: (ctx) => renderCartesian(ctx, "combo"),
  scatter: (ctx) => renderScatter(ctx),
  bubble: (ctx) => renderScatter(ctx, { bubble: true }),
  waterfall: renderWaterfall,
  histogram: renderHistogram,
  pie: (ctx) => renderPie(ctx),
  donut: (ctx) => renderPie(ctx, { donut: true }),
  gauge: renderGauge,
  radar: renderRadar,
  funnel: renderFunnel,
  treemap: renderTreemap,
  heatmap: renderHeatmap,
  calendar: renderCalendar,
  ufmap: renderUfMap,
  wordcloud: renderWordCloud,
  table: renderTable,
  matrix: renderMatrix,
  sankey: renderSankey,
};

/**
 * Renderiza a visualização dentro de um contêiner `.viz`.
 * @returns {Object} contexto usado (útil para exportação)
 */
export function renderChart(container, params) {
  const width = Math.max(160, params.width || container.clientWidth || 320);
  const height = Math.max(90, params.height || container.clientHeight || 200);
  const ctx = buildContext({ ...params, width, height });
  const renderer = RENDERERS[params.tile.type];

  container.classList.toggle("has-selection", (params.selection || []).length > 0);

  if (!renderer) {
    render(container, ctx.emptyMessage(`Visualização "${params.tile.type}" não encontrada.`));
    return ctx;
  }

  let node;
  try {
    node = renderer(ctx);
  } catch (err) {
    console.error("[brasil-bi] falha ao renderizar", params.tile.type, err);
    node = ctx.emptyMessage(`Não foi possível desenhar este gráfico: ${err.message}`);
  }

  const children = [node];

  // Legenda (quando há mais de uma série)
  const series = params.data.series || [];
  if (series.length > 1 && params.tile.options?.showLegend !== false && !["table", "matrix"].includes(params.tile.type)) {
    children.push(buildLegend(series, ctx, params));
  }

  // Resumo textual (acessibilidade + alternativa a cores)
  const summary = describeChart(params.data, ctx, params.tile);
  if (summary) children.push(el("div.viz__summary", { text: summary }));

  render(container, children);
  return ctx;
}

function buildLegend(series, ctx, params) {
  return el(
    "div.legend",
    { role: "group", "aria-label": "Legenda" },
    series.map((s, i) =>
      el(
        "button.legend__item",
        {
          type: "button",
          "aria-pressed": String(!params.hiddenSeries?.has(s.key ?? s.name)),
          "on:click": () => params.onToggleSeries?.(s.key ?? s.name),
        },
        [el("span.legend__swatch", { style: { background: ctx.colorFor(i) } }), el("span", { text: s.name })]
      )
    )
  );
}

/** Resumo em texto do que o gráfico mostra (lido por leitores de tela). */
export function describeChart(data, ctx, tile) {
  if (!data || data.kind !== "grouped" || !data.categories?.length) return "";
  const series = data.series || [];
  const measure = series[0];
  if (!measure) return "";
  const pairs = data.categories
    .map((cat, i) => ({ label: cat.label, value: measure.values[i] }))
    .filter((p) => isFiniteNumber(p.value));
  if (!pairs.length) return "";

  const total = pairs.reduce((a, p) => a + p.value, 0);
  const sorted = [...pairs].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const share = total ? (top.value / total) * 100 : 0;

  const parts = [
    `${chartLabel(tile.type)} de ${measure.name} por ${data.dimension.label}.`,
    `${data.categories.length} categoria(s).`,
    `Maior: ${top.label} com ${ctx.fmtValue(top.value, measure.measure)}${
      total ? ` (${fmtPercent(share, 0)} do total)` : ""
    }.`,
  ];
  if (sorted.length > 1) parts.push(`Menor: ${bottom.label} com ${ctx.fmtValue(bottom.value, measure.measure)}.`);
  if (data.hasOthers) parts.push("Categorias menores foram agrupadas em “Outros”.");
  return parts.join(" ");
}

/* ----------------------------------------------------------------- KPI --- */

const STATUS_META = {
  acima: { label: "Acima da meta", icon: "trendUp", cls: "badge--ok" },
  atingida: { label: "Meta atingida", icon: "check", cls: "badge--ok" },
  proximo: { label: "Próximo da meta", icon: "target", cls: "badge--warn" },
  abaixo: { label: "Abaixo da meta", icon: "alert", cls: "badge--warn" },
  critico: { label: "Situação crítica", icon: "alert", cls: "badge--danger" },
  "sem-meta": { label: "Sem meta definida", icon: "info", cls: "badge--neutral" },
  "sem-dados": { label: "Sem dados suficientes", icon: "info", cls: "badge--neutral" },
};

/** Cartão executivo: valor, comparação, meta, tendência e mini gráfico. */
export function renderKpiCard(container, kpi, tile) {
  const options = tile.options || {};
  const status = STATUS_META[kpi.status] || STATUS_META["sem-dados"];
  const deltaCls = kpi.direction === "flat" ? "flat" : kpi.good ? "up" : "down";

  const valueText = kpi.value === null ? "—" : fmtByType(kpi.value, kpi.type, { compact: options.compact !== false });

  const children = [
    el("div.kpi__value", {}, [
      el("span", { text: valueText }),
      kpi.delta !== null
        ? el(`span.kpi__delta.kpi__delta--${deltaCls}`, {}, [
            icon(kpi.direction === "down" ? "trendDown" : "trendUp", { size: 12 }),
            el("span", { text: fmtPercent(Math.abs(kpi.delta) * 100, 1) }),
          ])
        : null,
    ]),
    el("div.kpi__meta", {}, [
      el(`span.badge.${status.cls}`, {}, [icon(status.icon, { size: 11 }), el("span", { text: status.label })]),
      kpi.previous !== null
        ? el("span", {
            title: kpi.comparisonHint || "",
            text: kpi.currentLabel
              ? `${kpi.previousLabel} ${fmtByType(kpi.previous, kpi.type, { compact: true })} → ${
                  kpi.currentLabel
                } ${fmtByType(kpi.current, kpi.type, { compact: true })}`
              : `${kpi.previousLabel}: ${fmtByType(kpi.previous, kpi.type, { compact: true })}`,
          })
        : null,
      kpi.comparisonLabel ? el("span", { title: kpi.comparisonHint || "", text: kpi.comparisonLabel }) : null,
    ]),
  ];

  if (kpi.goal) {
    const pct = Math.max(0, Math.min(1.5, kpi.attainment || 0));
    children.push(
      el("div.kpi__goal", {}, [
        el("div.row-between", {}, [
          el("span", { text: `Meta: ${fmtByType(kpi.goal, kpi.type, { compact: true })}` }),
          el("span", { text: fmtPercent((kpi.attainment || 0) * 100, 0) }),
        ]),
        el("div.kpi__goalbar", {}, [
          el("i", {
            style: {
              width: `${Math.min(100, pct * 100)}%`,
              background: pct >= 1 ? cssVar("--s1") : pct >= 0.9 ? cssVar("--warn") : cssVar("--danger"),
            },
          }),
        ]),
      ])
    );
  }

  // Sparkline só quando há variação real — linha reta não informa nada.
  const sparkVaries = kpi.spark?.length > 1 && new Set(kpi.spark.map((p) => p.y)).size > 1;
  if (sparkVaries && options.showSpark !== false) {
    const spark = renderSparkline(kpi.spark, {
      width: 240,
      height: 34,
      color: kpi.good === false ? cssVar("--danger") : cssVar("--s1"),
    });
    if (spark) children.push(el("div.kpi__spark", {}, [spark]));
  }

  render(container, el("div.kpi", {}, children));
}

export { renderSparkline, fmtCompact };
