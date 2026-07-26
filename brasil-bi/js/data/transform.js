/**
 * Brasil BI — pipeline de tratamento de dados (equivalente simplificado ao
 * Power Query). Cada etapa é um objeto serializável; a lista de etapas fica
 * salva no dataset e é reaplicada sobre as linhas originais.
 *
 * Nenhuma etapa altera os dados de origem: o resultado é sempre derivado.
 */

import { uid, norm, parseNumberLoose, toDate, mean, median } from "../core/utils.js";
import { coerce, detectFields, isBlank, prettyLabel, TYPE_LABEL } from "./types.js";
import { compileFormula } from "./formula.js";

/** Separador interno para chaves compostas (não aparece nos dados). */
const SEP = "\u0001";

/** Descrição legível de cada etapa (usada na linha do tempo). */
export const STEP_TYPES = {
  renameColumn: {
    label: "Renomear coluna",
    describe: (s) => `Renomear "${s.from}" para "${s.to}"`,
  },
  dropColumns: {
    label: "Remover colunas",
    describe: (s) => `Remover ${s.fields.length} coluna(s): ${s.fields.join(", ")}`,
  },
  setType: {
    label: "Alterar tipo",
    describe: (s) => `"${s.field}" passa a ser ${TYPE_LABEL[s.toType] || s.toType}`,
  },
  trim: {
    label: "Remover espaços",
    describe: (s) => (s.field ? `Aparar espaços de "${s.field}"` : "Aparar espaços de todas as colunas de texto"),
  },
  textCase: {
    label: "Padronizar texto",
    describe: (s) => `"${s.field}" → ${{ upper: "MAIÚSCULAS", lower: "minúsculas", title: "Primeira Maiúscula" }[s.mode]}`,
  },
  replaceValues: {
    label: "Substituir valores",
    describe: (s) => `Em "${s.field}": "${s.from}" → "${s.to}"`,
  },
  fillBlanks: {
    label: "Preencher vazios",
    describe: (s) =>
      `Vazios de "${s.field}" preenchidos com ${
        { value: `"${s.value}"`, zero: "0", mean: "a média", median: "a mediana", previous: "o valor anterior" }[s.strategy]
      }`,
  },
  filterRows: {
    label: "Filtrar linhas",
    describe: (s) => `Manter linhas em que "${s.field}" ${OP_LABEL[s.op] || s.op} ${formatFilterValue(s.value)}`,
  },
  removeDuplicates: {
    label: "Remover duplicidades",
    describe: (s) => (s.fields?.length ? `Duplicidades por ${s.fields.join(", ")}` : "Remover linhas totalmente duplicadas"),
  },
  splitColumn: {
    label: "Dividir coluna",
    describe: (s) => `Dividir "${s.field}" por "${s.separator}" em ${s.into.join(", ")}`,
  },
  computedColumn: {
    label: "Coluna calculada",
    describe: (s) => `Nova coluna "${s.name}" = ${s.expr}`,
  },
  conditionalColumn: {
    label: "Coluna condicional",
    describe: (s) => `"${s.name}" a partir de ${s.rules.length} regra(s)`,
  },
  sortRows: {
    label: "Classificar",
    describe: (s) => `Ordenar por "${s.field}" (${s.dir === "asc" ? "crescente" : "decrescente"})`,
  },
  keepTop: {
    label: "Limitar linhas",
    describe: (s) => `Manter as primeiras ${s.n} linhas`,
  },
  groupRows: {
    label: "Agrupar",
    describe: (s) => `Agrupar por ${s.dimensions.join(", ")} calculando ${s.aggs.map((a) => `${a.agg}(${a.field})`).join(", ")}`,
  },
  appendDataset: {
    label: "Anexar tabela",
    describe: (s) => `Anexar as linhas de "${s.datasetName || s.datasetId}"`,
  },
  mergeDataset: {
    label: "Mesclar tabela",
    describe: (s) => `Mesclar com "${s.datasetName || s.datasetId}" (${s.leftKey} = ${s.rightKey})`,
  },
};

export const OP_LABEL = {
  eq: "é igual a",
  neq: "é diferente de",
  gt: "é maior que",
  gte: "é maior ou igual a",
  lt: "é menor que",
  lte: "é menor ou igual a",
  contains: "contém",
  notContains: "não contém",
  startsWith: "começa com",
  isBlank: "está vazio",
  notBlank: "não está vazio",
  in: "está entre os valores",
  between: "está entre",
  dateRange: "está no período",
};

function formatFilterValue(value) {
  if (Array.isArray(value)) return value.slice(0, 4).join(", ") + (value.length > 4 ? "…" : "");
  return value === undefined || value === null ? "" : `"${value}"`;
}

/* ------------------------------------------------------------- predicados */

/** Avalia um filtro sobre uma linha (usado no pipeline e nas consultas). */
export function matchesFilter(row, filter) {
  const raw = row[filter.field];
  switch (filter.op) {
    case "isBlank":
      return isBlank(raw);
    case "notBlank":
      return !isBlank(raw);
    case "eq":
      return String(raw ?? "") === String(filter.value ?? "");
    case "neq":
      return String(raw ?? "") !== String(filter.value ?? "");
    case "contains":
      return norm(raw).includes(norm(filter.value));
    case "notContains":
      return !norm(raw).includes(norm(filter.value));
    case "startsWith":
      return norm(raw).startsWith(norm(filter.value));
    case "in": {
      const list = Array.isArray(filter.value) ? filter.value : [filter.value];
      return list.map((v) => String(v)).includes(String(raw ?? ""));
    }
    case "between": {
      const n = parseNumberLoose(raw);
      const [lo, hi] = filter.value || [];
      return n !== null && (lo === null || lo === undefined || n >= Number(lo)) && (hi === null || hi === undefined || n <= Number(hi));
    }
    case "dateRange": {
      const d = toDate(raw);
      if (!d) return false;
      const [from, to] = filter.value || [];
      if (from && d < new Date(from)) return false;
      if (to && d > new Date(to)) return false;
      return true;
    }
    default: {
      const n = parseNumberLoose(raw);
      const target = parseNumberLoose(filter.value);
      if (n === null || target === null) {
        const cmp = String(raw ?? "").localeCompare(String(filter.value ?? ""), "pt-BR");
        return filter.op === "gt" ? cmp > 0 : filter.op === "gte" ? cmp >= 0 : filter.op === "lt" ? cmp < 0 : cmp <= 0;
      }
      return filter.op === "gt" ? n > target : filter.op === "gte" ? n >= target : filter.op === "lt" ? n < target : n <= target;
    }
  }
}

/** Aplica um conjunto de filtros (AND entre campos distintos). */
export function applyFilters(rows, filters) {
  if (!filters?.length) return rows;
  // Filtros no mesmo campo com operador "eq"/"in" são combinados em OU.
  const groups = new Map();
  for (const filter of filters) {
    const key = `${filter.field}|${filter.op === "eq" || filter.op === "in" ? "or" : filter.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(filter);
  }
  return rows.filter((row) => {
    for (const group of groups.values()) {
      if (!group.some((f) => matchesFilter(row, f))) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------ agregações */

export const AGGREGATIONS = {
  sum: { label: "Soma", numeric: true },
  avg: { label: "Média", numeric: true },
  median: { label: "Mediana", numeric: true },
  min: { label: "Mínimo", numeric: true },
  max: { label: "Máximo", numeric: true },
  count: { label: "Contagem", numeric: false },
  countDistinct: { label: "Contagem distinta", numeric: false },
  first: { label: "Primeiro", numeric: false },
  last: { label: "Último", numeric: false },
};

export function aggregate(values, agg) {
  switch (agg) {
    case "count":
      return values.filter((v) => !isBlank(v)).length;
    case "countDistinct":
      return new Set(values.filter((v) => !isBlank(v)).map((v) => String(v))).size;
    case "first":
      return values.find((v) => !isBlank(v)) ?? null;
    case "last":
      return [...values].reverse().find((v) => !isBlank(v)) ?? null;
    default: {
      const nums = values.map((v) => (typeof v === "number" ? v : parseNumberLoose(v))).filter((v) => v !== null && Number.isFinite(v));
      if (!nums.length) return null;
      switch (agg) {
        case "sum":
          return nums.reduce((a, b) => a + b, 0);
        case "avg":
          return mean(nums);
        case "median":
          return median(nums);
        case "min":
          return Math.min(...nums);
        case "max":
          return Math.max(...nums);
        default:
          return null;
      }
    }
  }
}

/* --------------------------------------------------------------- pipeline */

export function createStep(type, config = {}) {
  // `type` identifica a etapa e nunca pode ser sobrescrito pela configuração.
  const { type: _ignored, id: _id, ...rest } = config;
  return { id: uid("step"), type, enabled: true, ...rest };
}

/**
 * Aplica todas as etapas habilitadas sobre as linhas originais.
 * @param {Array<Object>} sourceRows
 * @param {Array<Object>} sourceFields
 * @param {Array<Object>} steps
 * @param {{datasets?: Map<string, {rows:Array, fields:Array, name:string}>}} [ctx]
 * @returns {{rows:Array, fields:Array, log:Array}}
 */
export function applySteps(sourceRows, sourceFields, steps, ctx = {}) {
  let rows = sourceRows;
  let fields = sourceFields.map((f) => ({ ...f }));
  const log = [];

  for (const step of steps || []) {
    if (!step.enabled) {
      log.push({ id: step.id, skipped: true, rowsAfter: rows.length });
      continue;
    }
    const before = rows.length;
    try {
      const result = applyStep(rows, fields, step, ctx);
      rows = result.rows;
      fields = result.fields;
      log.push({ id: step.id, rowsBefore: before, rowsAfter: rows.length, error: null });
    } catch (err) {
      log.push({ id: step.id, rowsBefore: before, rowsAfter: rows.length, error: err.message });
    }
  }
  return { rows, fields, log };
}

function cloneRows(rows) {
  return rows.map((r) => ({ ...r }));
}

function applyStep(rows, fields, step, ctx) {
  switch (step.type) {
    case "renameColumn": {
      const next = rows.map((row) => {
        const out = {};
        for (const [k, v] of Object.entries(row)) out[k === step.from ? step.to : k] = v;
        return out;
      });
      return {
        rows: next,
        fields: fields.map((f) => (f.name === step.from ? { ...f, name: step.to, label: prettyLabel(step.to) } : f)),
      };
    }

    case "dropColumns": {
      const drop = new Set(step.fields);
      const next = rows.map((row) => {
        const out = {};
        for (const [k, v] of Object.entries(row)) if (!drop.has(k)) out[k] = v;
        return out;
      });
      return { rows: next, fields: fields.filter((f) => !drop.has(f.name)) };
    }

    case "setType": {
      const next = rows.map((row) => ({ ...row, [step.field]: coerce(row[step.field], step.toType) }));
      return {
        rows: next,
        fields: fields.map((f) =>
          f.name === step.field
            ? {
                ...f,
                type: step.toType,
                role: ["integer", "number", "currency", "percent"].includes(step.toType)
                  ? "measure"
                  : ["date", "datetime"].includes(step.toType)
                  ? "time"
                  : "dimension",
              }
            : f
        ),
      };
    }

    case "trim": {
      const targets = step.field ? [step.field] : fields.filter((f) => f.type === "text").map((f) => f.name);
      const next = rows.map((row) => {
        const out = { ...row };
        for (const t of targets) if (typeof out[t] === "string") out[t] = out[t].replace(/\s+/g, " ").trim();
        return out;
      });
      return { rows: next, fields };
    }

    case "textCase": {
      const apply = (v) => {
        if (typeof v !== "string") return v;
        if (step.mode === "upper") return v.toUpperCase();
        if (step.mode === "lower") return v.toLowerCase();
        return v
          .toLowerCase()
          .replace(/(^|\s|-)([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
      };
      return { rows: rows.map((row) => ({ ...row, [step.field]: apply(row[step.field]) })), fields };
    }

    case "replaceValues": {
      const exact = step.mode !== "contains";
      const next = rows.map((row) => {
        const value = row[step.field];
        if (value === null || value === undefined) {
          return step.from === "" ? { ...row, [step.field]: step.to } : row;
        }
        const str = String(value);
        if (exact ? str === step.from : str.includes(step.from)) {
          return { ...row, [step.field]: exact ? step.to : str.split(step.from).join(step.to) };
        }
        return row;
      });
      return { rows: next, fields };
    }

    case "fillBlanks": {
      let filler = step.value;
      if (step.strategy === "zero") filler = 0;
      if (step.strategy === "mean") filler = mean(rows.map((r) => parseNumberLoose(r[step.field])));
      if (step.strategy === "median") filler = median(rows.map((r) => parseNumberLoose(r[step.field])));
      let previous = null;
      const next = rows.map((row) => {
        if (!isBlank(row[step.field])) {
          previous = row[step.field];
          return row;
        }
        const value = step.strategy === "previous" ? previous : filler;
        return { ...row, [step.field]: value ?? null };
      });
      return { rows: next, fields };
    }

    case "filterRows":
      return { rows: applyFilters(rows, [step]), fields };

    case "removeDuplicates": {
      const keys = step.fields?.length ? step.fields : fields.map((f) => f.name);
      const seen = new Set();
      const next = [];
      for (const row of rows) {
        const key = keys.map((k) => String(row[k] ?? "")).join(SEP);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(row);
      }
      return { rows: next, fields };
    }

    case "splitColumn": {
      const next = rows.map((row) => {
        const parts = String(row[step.field] ?? "").split(step.separator);
        const out = { ...row };
        step.into.forEach((name, i) => {
          out[name] = parts[i]?.trim() ?? null;
        });
        if (step.removeOriginal) delete out[step.field];
        return out;
      });
      const newFields = step.into
        .filter((name) => !fields.some((f) => f.name === name))
        .map((name) => ({ name, label: prettyLabel(name), type: "text", role: "dimension", visible: true }));
      let outFields = [...fields, ...newFields];
      if (step.removeOriginal) outFields = outFields.filter((f) => f.name !== step.field);
      return { rows: next, fields: outFields };
    }

    case "computedColumn": {
      const compiled = compileFormula(step.expr, fields.map((f) => f.name));
      if (!compiled.ok) throw new Error(compiled.error);
      const next = rows.map((row) => ({ ...row, [step.name]: compiled.evaluate(row) }));
      const detected = detectFields(next.slice(0, 300), [step.name])[0];
      const field = fields.find((f) => f.name === step.name);
      const meta = {
        name: step.name,
        label: prettyLabel(step.name),
        type: step.forceType || detected?.type || "text",
        role: step.forceType
          ? ["integer", "number", "currency", "percent"].includes(step.forceType)
            ? "measure"
            : "dimension"
          : detected?.role || "dimension",
        computed: true,
        expr: step.expr,
        visible: true,
      };
      return { rows: next, fields: field ? fields.map((f) => (f.name === step.name ? meta : f)) : [...fields, meta] };
    }

    case "conditionalColumn": {
      const compiled = step.rules.map((rule) => ({
        test: compileFormula(rule.when, fields.map((f) => f.name)),
        then: rule.then,
      }));
      const bad = compiled.find((c) => !c.test.ok);
      if (bad) throw new Error(bad.test.error);
      const next = rows.map((row) => {
        let value = step.otherwise ?? null;
        for (const rule of compiled) {
          if (rule.test.evaluate(row)) {
            value = rule.then;
            break;
          }
        }
        return { ...row, [step.name]: value };
      });
      const exists = fields.some((f) => f.name === step.name);
      const meta = { name: step.name, label: prettyLabel(step.name), type: "text", role: "dimension", computed: true, visible: true };
      return { rows: next, fields: exists ? fields : [...fields, meta] };
    }

    case "sortRows": {
      const field = fields.find((f) => f.name === step.field);
      const dir = step.dir === "asc" ? 1 : -1;
      const next = [...rows].sort((a, b) => compareValues(a[step.field], b[step.field], field?.type) * dir);
      return { rows: next, fields };
    }

    case "keepTop":
      return { rows: rows.slice(0, Math.max(0, step.n)), fields };

    case "groupRows": {
      const groups = new Map();
      for (const row of rows) {
        const key = step.dimensions.map((d) => String(row[d] ?? "")).join(SEP);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      const next = [];
      for (const [key, group] of groups) {
        const out = {};
        step.dimensions.forEach((d, i) => {
          out[d] = key.split(SEP)[i];
        });
        for (const spec of step.aggs) {
          const alias = spec.alias || `${spec.agg}_${spec.field}`;
          out[alias] = aggregate(group.map((r) => r[spec.field]), spec.agg);
        }
        next.push(out);
      }
      const newFields = [
        ...step.dimensions.map((d) => fields.find((f) => f.name === d) || { name: d, label: prettyLabel(d), type: "text", role: "dimension", visible: true }),
        ...step.aggs.map((spec) => {
          const src = fields.find((f) => f.name === spec.field);
          return {
            name: spec.alias || `${spec.agg}_${spec.field}`,
            label: `${AGGREGATIONS[spec.agg]?.label || spec.agg} de ${src?.label || spec.field}`,
            type: ["count", "countDistinct"].includes(spec.agg) ? "integer" : src?.type || "number",
            role: "measure",
            visible: true,
          };
        }),
      ];
      return { rows: next, fields: newFields };
    }

    case "appendDataset": {
      const other = ctx.datasets?.get(step.datasetId);
      if (!other) throw new Error("Tabela para anexar não encontrada");
      const allNames = new Set([...fields.map((f) => f.name), ...other.fields.map((f) => f.name)]);
      const normalize = (row) => {
        const out = {};
        for (const name of allNames) out[name] = row[name] ?? null;
        return out;
      };
      const merged = [...rows.map(normalize), ...other.rows.map(normalize)];
      const extra = other.fields.filter((f) => !fields.some((x) => x.name === f.name));
      return { rows: merged, fields: [...fields, ...extra] };
    }

    case "mergeDataset": {
      const other = ctx.datasets?.get(step.datasetId);
      if (!other) throw new Error("Tabela para mesclar não encontrada");
      const index = new Map();
      for (const row of other.rows) {
        const key = String(row[step.rightKey] ?? "");
        if (!index.has(key)) index.set(key, row);
      }
      const bring = step.fields?.length ? step.fields : other.fields.map((f) => f.name).filter((n) => n !== step.rightKey);
      const prefix = step.prefix || "";
      const next = rows.map((row) => {
        const match = index.get(String(row[step.leftKey] ?? ""));
        const out = { ...row };
        for (const name of bring) out[prefix + name] = match ? match[name] ?? null : null;
        return out;
      });
      const extra = bring
        .filter((name) => !fields.some((f) => f.name === prefix + name))
        .map((name) => {
          const src = other.fields.find((f) => f.name === name);
          return { ...(src || { type: "text", role: "dimension" }), name: prefix + name, label: prettyLabel(prefix + name), visible: true };
        });
      return { rows: next, fields: [...fields, ...extra] };
    }

    default:
      throw new Error(`Etapa desconhecida: ${step.type}`);
  }
}

export function compareValues(a, b, type) {
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (["integer", "number", "currency", "percent"].includes(type)) {
    return (parseNumberLoose(a) ?? 0) - (parseNumberLoose(b) ?? 0);
  }
  if (["date", "datetime"].includes(type)) {
    return (toDate(a)?.getTime() ?? 0) - (toDate(b)?.getTime() ?? 0);
  }
  const na = parseNumberLoose(a);
  const nb = parseNumberLoose(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

export { cloneRows };
