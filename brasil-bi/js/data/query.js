/**
 * Brasil BI — motor de consultas.
 *
 * Recebe as linhas já tratadas de um dataset e devolve estruturas prontas para
 * os gráficos: categorias, séries, totais e metadados. Toda a filtragem
 * (global, período e cross-filter) passa por aqui.
 */

import {
  getDataset,
  getRawRows,
  getDerivedCache,
  setDerivedCache,
  getState,
} from "../core/store.js";
import { applySteps, applyFilters, aggregate, compareValues, AGGREGATIONS } from "./transform.js";
import { detectFields, isBlank, NUMERIC_TYPES, TEMPORAL_TYPES } from "./types.js";
import { toDate, truncDate, addPeriod, fmtDate, isoWeek } from "../core/utils.js";

/* ------------------------------------------------------ resolução do dataset */

/**
 * Devolve linhas e campos de um dataset já com as transformações aplicadas.
 * O resultado é memorizado por assinatura das etapas.
 * @returns {Promise<{dataset:Object, rows:Array, fields:Array, log:Array}|null>}
 */
export async function resolveDataset(datasetId) {
  const dataset = getDataset(datasetId);
  if (!dataset) return null;

  const key = JSON.stringify(dataset.transforms || []) + `|${dataset.rowCount}`;
  const cached = getDerivedCache(datasetId);
  if (cached && cached.key === key) {
    return { dataset, rows: cached.rows, fields: cached.fields, log: cached.log || [] };
  }

  const rawRows = await getRawRows(datasetId);
  const baseFields = dataset.fields?.length ? dataset.fields : detectFields(rawRows.slice(0, 800));

  // Datasets referenciados por etapas de anexar/mesclar.
  const ctxDatasets = new Map();
  for (const step of dataset.transforms || []) {
    if ((step.type === "appendDataset" || step.type === "mergeDataset") && step.datasetId) {
      const other = getDataset(step.datasetId);
      if (other) {
        const otherRows = await getRawRows(step.datasetId);
        ctxDatasets.set(step.datasetId, {
          rows: otherRows,
          fields: other.fields || detectFields(otherRows.slice(0, 300)),
          name: other.name,
        });
      }
    }
  }

  const { rows, fields, log } = applySteps(rawRows, baseFields, dataset.transforms || [], {
    datasets: ctxDatasets,
  });
  setDerivedCache(datasetId, key, rows);
  const entry = getDerivedCache(datasetId);
  entry.fields = fields;
  entry.log = log;
  return { dataset, rows, fields, log };
}

/* ------------------------------------------------------------------ período */

export const PERIOD_PRESETS = {
  todos: "Todo o período",
  hoje: "Hoje",
  ontem: "Ontem",
  ultimos7: "Últimos 7 dias",
  ultimos30: "Últimos 30 dias",
  ultimos90: "Últimos 90 dias",
  mesAtual: "Mês atual",
  mesAnterior: "Mês anterior",
  trimestreAtual: "Trimestre atual",
  anoAtual: "Ano atual",
  anoAnterior: "Ano anterior",
  personalizado: "Personalizado",
};

/** Converte um preset em intervalo {from, to} (Date). */
export function periodRange(period, reference = new Date()) {
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (period?.preset) {
    case "hoje":
      return { from: today, to: endOfDay(today) };
    case "ontem": {
      const y = addPeriod(today, "day", -1);
      return { from: y, to: endOfDay(y) };
    }
    case "ultimos7":
      return { from: addPeriod(today, "day", -6), to: endOfDay(today) };
    case "ultimos30":
      return { from: addPeriod(today, "day", -29), to: endOfDay(today) };
    case "ultimos90":
      return { from: addPeriod(today, "day", -89), to: endOfDay(today) };
    case "mesAtual":
      return { from: truncDate(today, "month"), to: endOfDay(today) };
    case "mesAnterior": {
      const start = truncDate(addPeriod(truncDate(today, "month"), "month", -1), "month");
      const end = new Date(truncDate(today, "month").getTime() - 1);
      return { from: start, to: end };
    }
    case "trimestreAtual":
      return { from: truncDate(today, "quarter"), to: endOfDay(today) };
    case "anoAtual":
      return { from: truncDate(today, "year"), to: endOfDay(today) };
    case "anoAnterior": {
      const start = truncDate(addPeriod(truncDate(today, "year"), "year", -1), "year");
      const end = new Date(truncDate(today, "year").getTime() - 1);
      return { from: start, to: end };
    }
    case "personalizado":
      return {
        from: period.from ? new Date(period.from) : null,
        to: period.to ? endOfDay(new Date(period.to)) : null,
      };
    default:
      return { from: null, to: null };
  }
}

/** Intervalo equivalente imediatamente anterior (para comparações). */
export function previousRange(range) {
  if (!range.from || !range.to) return { from: null, to: null };
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span - 1),
    to: new Date(range.from.getTime() - 1),
  };
}

/** Campo de data padrão de um conjunto de campos. */
export function defaultDateField(fields) {
  return fields.find((f) => TEMPORAL_TYPES.has(f.type))?.name || null;
}

function filterByRange(rows, dateField, range) {
  if (!dateField || (!range.from && !range.to)) return rows;
  return rows.filter((row) => {
    const d = toDate(row[dateField]);
    if (!d) return false;
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
}

/**
 * Aplica filtros globais + seleção (cross-filter) + período às linhas.
 * @param {Array} rows
 * @param {string} datasetId
 * @param {Array} fields
 * @param {{ignoreSelectionFrom?:string, ignoreGlobal?:boolean}} [opts]
 */
export function applyContext(rows, datasetId, fields, opts = {}) {
  const state = getState();
  let out = rows;

  if (!opts.ignoreGlobal) {
    const globals = state.filters.global.filter((f) => !f.datasetId || f.datasetId === datasetId);
    out = applyFilters(out, globals);
  }

  const selection = state.filters.selection.filter(
    (f) => (!f.datasetId || f.datasetId === datasetId) && f.sourceTile !== opts.ignoreSelectionFrom
  );
  out = applyFilters(out, selection);

  const period = state.period;
  if (!opts.ignorePeriod && period && period.preset !== "todos") {
    const field = period.field || defaultDateField(fields);
    out = filterByRange(out, field, periodRange(period));
  }
  return out;
}

/* -------------------------------------------------------------- agrupamento */

/** Chave de agrupamento para uma dimensão (respeitando granularidade de data). */
export function groupKey(value, field, grain) {
  if (isBlank(value)) return { key: "(vazio)", label: "(vazio)", sort: Infinity, raw: null };
  if (field && TEMPORAL_TYPES.has(field.type)) {
    const d = toDate(value);
    if (!d) return { key: "(inválido)", label: "(inválido)", sort: Infinity, raw: null };
    const truncated = truncDate(d, grain || "month");
    return {
      key: truncated.toISOString(),
      label: fmtDate(truncated, grain || "month"),
      sort: truncated.getTime(),
      raw: truncated,
    };
  }
  const str = String(value);
  return { key: str, label: str, sort: null, raw: value };
}

/**
 * Executa uma consulta agregada.
 *
 * @param {{rows:Array, fields:Array, datasetId:string}} source
 * @param {{
 *   dimension?:string, grain?:string, breakdown?:string,
 *   measures:Array<{field:string, agg:string, label?:string}>,
 *   limit?:number, sort?:{by:string, dir:string}, groupOthers?:boolean,
 *   tileId?:string, ignoreContext?:boolean
 * }} spec
 */
export function runQuery(source, spec) {
  const fieldMap = new Map(source.fields.map((f) => [f.name, f]));
  const rows = spec.ignoreContext
    ? source.rows
    : applyContext(source.rows, source.datasetId, source.fields, {
        ignoreSelectionFrom: spec.crossFilterSelf ? spec.tileId : undefined,
      });

  const measures = (spec.measures || []).map((m, i) => ({
    ...m,
    key: `m${i}`,
    label: m.label || measureLabel(m, fieldMap),
    type: measureType(m, fieldMap),
  }));

  if (!spec.dimension) {
    // Consulta escalar (cartões KPI)
    const values = measures.map((m) => ({
      ...m,
      value: aggregate(rows.map((r) => r[m.field]), m.agg),
    }));
    return { kind: "scalar", measures: values, rowCount: rows.length, rows };
  }

  const dimField = fieldMap.get(spec.dimension);
  const breakdownField = spec.breakdown ? fieldMap.get(spec.breakdown) : null;

  const groups = new Map(); // key -> {info, rows, byBreakdown:Map}
  for (const row of rows) {
    const info = groupKey(row[spec.dimension], dimField, spec.grain);
    let group = groups.get(info.key);
    if (!group) {
      group = { info, rows: [], byBreakdown: new Map() };
      groups.set(info.key, group);
    }
    group.rows.push(row);
    if (breakdownField) {
      const bInfo = groupKey(row[spec.breakdown], breakdownField, spec.grain);
      if (!group.byBreakdown.has(bInfo.key)) group.byBreakdown.set(bInfo.key, { info: bInfo, rows: [] });
      group.byBreakdown.get(bInfo.key).rows.push(row);
    }
  }

  let categories = Array.from(groups.values()).map((group) => ({
    key: group.info.key,
    label: group.info.label,
    sort: group.info.sort,
    raw: group.info.raw,
    rows: group.rows,
    byBreakdown: group.byBreakdown,
    values: measures.map((m) => aggregate(group.rows.map((r) => r[m.field]), m.agg)),
  }));

  // Ordenação
  const temporal = dimField && TEMPORAL_TYPES.has(dimField.type);
  const sortBy = spec.sort?.by ?? (temporal ? "dimension" : "m0");
  const dir = spec.sort?.dir ?? (temporal ? "asc" : "desc");
  categories.sort((a, b) => {
    let cmp;
    if (sortBy === "dimension") {
      cmp = temporal ? (a.sort ?? 0) - (b.sort ?? 0) : compareValues(a.label, b.label, dimField?.type);
    } else {
      const idx = Number(String(sortBy).replace("m", "")) || 0;
      cmp = (a.values[idx] ?? -Infinity) - (b.values[idx] ?? -Infinity);
    }
    return dir === "asc" ? cmp : -cmp;
  });

  // Limite + agrupamento em "Outros"
  let others = null;
  if (spec.limit && categories.length > spec.limit) {
    const kept = categories.slice(0, spec.limit);
    const rest = categories.slice(spec.limit);
    if (spec.groupOthers !== false && rest.length > 1) {
      const restRows = rest.flatMap((c) => c.rows);
      others = {
        key: "__outros__",
        label: `Outros (${rest.length})`,
        sort: null,
        raw: null,
        isOthers: true,
        rows: restRows,
        byBreakdown: new Map(),
        values: measures.map((m) => aggregate(restRows.map((r) => r[m.field]), m.agg)),
      };
      kept.push(others);
    }
    categories = kept;
  }

  // Séries: uma por medida, ou uma por valor de breakdown (com a 1ª medida)
  let series;
  if (breakdownField) {
    const breakdownKeys = new Map();
    for (const cat of categories) {
      for (const [key, entry] of cat.byBreakdown) {
        if (!breakdownKeys.has(key)) breakdownKeys.set(key, entry.info.label);
      }
    }
    const measure = measures[0];
    series = Array.from(breakdownKeys.entries()).map(([key, label]) => ({
      key,
      name: label,
      measure,
      type: measure?.type,
      values: categories.map((cat) => {
        const entry = cat.byBreakdown.get(key);
        return entry ? aggregate(entry.rows.map((r) => r[measure.field]), measure.agg) : null;
      }),
    }));
    // Ordena séries pelo total desc (legibilidade da legenda)
    series.sort((a, b) => sumSafe(b.values) - sumSafe(a.values));
  } else {
    series = measures.map((m, i) => ({
      key: m.key,
      name: m.label,
      measure: m,
      type: m.type,
      values: categories.map((c) => c.values[i]),
    }));
  }

  return {
    kind: "grouped",
    dimension: { name: spec.dimension, label: dimField?.label || spec.dimension, type: dimField?.type, grain: spec.grain },
    breakdown: breakdownField ? { name: spec.breakdown, label: breakdownField.label } : null,
    categories,
    series,
    measures,
    rowCount: rows.length,
    rows,
    totalCategories: groups.size,
    hasOthers: Boolean(others),
  };
}

function sumSafe(values) {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

export function measureLabel(measure, fieldMap) {
  const field = fieldMap?.get?.(measure.field);
  const aggLabel = AGGREGATIONS[measure.agg]?.label || measure.agg;
  if (measure.agg === "count" && (!measure.field || measure.field === "*")) return "Contagem de linhas";
  return `${aggLabel} de ${field?.label || measure.field}`;
}

export function measureType(measure, fieldMap) {
  const field = fieldMap?.get?.(measure.field);
  if (["count", "countDistinct"].includes(measure.agg)) return "integer";
  if (!field) return "number";
  if (measure.agg === "avg" && field.type === "integer") return "number";
  return field.type;
}

/* ------------------------------------------------------------------- KPI -- */

/**
 * Calcula um indicador com comparação de período e série para o sparkline.
 * @param {{rows:Array, fields:Array, datasetId:string}} source
 * @param {{measure:{field:string,agg:string}, dateField?:string, goal?:number,
 *          higherIsBetter?:boolean, tileId?:string}} spec
 */
export function computeKpi(source, spec) {
  const state = getState();
  const fieldMap = new Map(source.fields.map((f) => [f.name, f]));
  const dateField = spec.dateField || state.period.field || defaultDateField(source.fields);

  const base = applyContext(source.rows, source.datasetId, source.fields, {
    ignoreSelectionFrom: spec.tileId,
  });
  // O valor exibido é SEMPRE o total do recorte filtrado.
  const value = aggregate(base.map((r) => r[spec.measure.field]), spec.measure.agg);

  let previous = null;
  let current = value; // base da variação (pode ser um período, não o total)
  let comparisonLabel = "";
  let comparisonHint = "";
  let previousLabel = "Anterior";
  let currentLabel = "";

  const range = periodRange(state.period);
  if (dateField && range.from && range.to) {
    // Há período selecionado: compara com a janela imediatamente anterior.
    const prev = previousRange(range);
    const prevRows = filterByRange(
      applyContext(source.rows, source.datasetId, source.fields, {
        ignoreSelectionFrom: spec.tileId,
        ignorePeriod: true,
      }),
      dateField,
      prev
    );
    previous = aggregate(prevRows.map((r) => r[spec.measure.field]), spec.measure.agg);
    comparisonLabel = "vs. período anterior";
    comparisonHint = "Compara o período selecionado com a janela imediatamente anterior, de mesma duração.";
    previousLabel = "Período anterior";
  } else if (dateField) {
    // Sem período: compara os dois últimos intervalos da série, deixando claro
    // que a variação se refere a eles — e não ao total exibido.
    const grain = pickGrain(base, dateField);
    const buckets = bucketize(base, dateField, spec.measure, grain);
    if (buckets.length >= 2) {
      const last = buckets[buckets.length - 1];
      const beforeLast = buckets[buckets.length - 2];
      current = last.value;
      previous = beforeLast.value;
      previousLabel = fmtDate(new Date(beforeLast.time), grain);
      currentLabel = fmtDate(new Date(last.time), grain);
      comparisonLabel = "variação entre os dois últimos períodos";
      comparisonHint =
        "O número grande é o total do recorte filtrado; a variação compara os dois últimos períodos da série.";
    }
  }

  return finishKpi({
    value, current, previous, previousLabel, currentLabel,
    comparisonLabel, comparisonHint, spec, fieldMap, source, dateField, base,
  });
}

/**
 * Granularidade que produz uma série legível: a mais fina que caiba em
 * ~4 a 24 pontos; se nenhuma couber, a que mais se aproximar de 12.
 */
function pickGrain(rows, dateField) {
  const dates = rows.map((r) => toDate(r[dateField])).filter(Boolean);
  if (dates.length < 2) return "month";
  const options = ["day", "week", "month", "quarter", "year"];
  const counts = options.map((grain) => ({
    grain,
    count: new Set(dates.map((d) => truncDate(d, grain).getTime())).size,
  }));
  const ideal = counts.find((c) => c.count >= 4 && c.count <= 24);
  if (ideal) return ideal.grain;
  return counts.reduce((best, c) => (Math.abs(c.count - 12) < Math.abs(best.count - 12) ? c : best)).grain;
}

/** Agrega a medida por intervalo de tempo. */
function bucketize(rows, dateField, measure, grain) {
  const buckets = new Map();
  for (const row of rows) {
    const d = toDate(row[dateField]);
    if (!d) continue;
    const key = truncDate(d, grain).getTime();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row[measure.field]);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, values]) => ({ time, value: aggregate(values, measure.agg) }));
}

function finishKpi({
  value, current, previous, previousLabel, currentLabel,
  comparisonLabel, comparisonHint, spec, fieldMap, dateField, base,
}) {
  const reference = current ?? value;
  const delta =
    previous !== null && previous !== 0 && reference !== null ? (reference - previous) / Math.abs(previous) : null;
  const higherIsBetter = spec.higherIsBetter !== false;
  const direction = delta === null ? "flat" : delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat";
  const good = direction === "flat" ? null : (direction === "up") === higherIsBetter;

  // Sparkline: série temporal agregada conforme a amplitude do recorte.
  const spark = dateField
    ? bucketize(base, dateField, spec.measure, pickGrain(base, dateField)).map((b) => ({ x: b.time, y: b.value }))
    : [];

  const goal = Number.isFinite(spec.goal) ? spec.goal : null;
  const attainment = goal ? (value ?? 0) / goal : null;
  let status = "sem-dados";
  if (value !== null) {
    if (goal === null) status = "sem-meta";
    else if (attainment >= 1.05) status = "acima";
    else if (attainment >= 1) status = "atingida";
    else if (attainment >= 0.9) status = "proximo";
    else if (attainment >= 0.7) status = "abaixo";
    else status = "critico";
  }

  return {
    value,
    current: reference,
    previous,
    previousLabel,
    currentLabel,
    comparisonHint,
    delta,
    direction,
    good,
    comparisonLabel,
    spark,
    goal,
    attainment,
    status,
    type: measureType(spec.measure, fieldMap),
    label: spec.label || measureLabel(spec.measure, fieldMap),
    rowCount: base.length,
  };
}

/* --------------------------------------------------- valores distintos p/ UI */

export function distinctValues(rows, fieldName, limit = 500) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[fieldName];
    if (isBlank(value)) continue;
    const key = value instanceof Date ? value.toISOString() : String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

export { NUMERIC_TYPES, TEMPORAL_TYPES, isoWeek };
