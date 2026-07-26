/**
 * Brasil BI — inferência e coerção de tipos.
 *
 * Tipos semânticos: text | integer | number | currency | percent | date |
 * datetime | boolean.
 * Papéis: dimension | measure | time | id
 */

import { parseNumberLoose, toDate, norm, isFiniteNumber } from "../core/utils.js";

export const TYPE_LABEL = {
  text: "Texto",
  integer: "Inteiro",
  number: "Número",
  currency: "Moeda (R$)",
  percent: "Percentual",
  date: "Data",
  datetime: "Data e hora",
  boolean: "Booleano",
};

export const NUMERIC_TYPES = new Set(["integer", "number", "currency", "percent"]);
export const TEMPORAL_TYPES = new Set(["date", "datetime"]);

const TRUE_WORDS = new Set(["true", "verdadeiro", "sim", "s", "yes", "y", "1", "ativo"]);
const FALSE_WORDS = new Set(["false", "falso", "nao", "não", "n", "no", "0", "inativo"]);

const CURRENCY_HINT = /(valor|preco|preço|receita|faturamento|custo|despesa|lucro|ticket|salario|salário|investimento|orcamento|orçamento|total|montante|pago|saldo|comissao|comissão|cpa|cac|cpl|cpm|cpc|mrr|arr)/;
const PERCENT_HINT = /(percentual|percent|taxa|%|margem|conversao|conversão|crescimento|share|participacao|participação|atingimento)/;
const ID_HINT = /^(id|codigo|código|cod|cnpj|cpf|sku|matricula|matrícula|protocolo|pedido_id|cliente_id)/;
const DATE_HINT = /(data|dt_|_dt|date|dia|mes|mês|ano|periodo|período|competencia|competência|vencimento|emissao|emissão|cadastro|criado|atualizado)/;

export function isBlank(value) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && !value.trim()) ||
    (typeof value === "string" && ["-", "--", "n/a", "na", "null", "nulo", "#n/d", "#n/a"].includes(value.trim().toLowerCase()))
  );
}

export function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const s = norm(value);
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return null;
}

/**
 * Deduz o tipo de uma coluna a partir de amostras + nome.
 * @param {string} name
 * @param {Array<*>} values amostra bruta (já sem cabeçalho)
 * @returns {{type:string, role:string, confidence:number, format:Object}}
 */
export function inferType(name, values) {
  const key = norm(name);
  const sample = values.filter((v) => !isBlank(v)).slice(0, 500);
  const total = sample.length;
  if (!total) {
    return { type: "text", role: "dimension", confidence: 0, format: {} };
  }

  let boolCount = 0;
  let dateCount = 0;
  let datetimeCount = 0;
  let numCount = 0;
  let intCount = 0;
  let currencyMarks = 0;
  let percentMarks = 0;

  for (const raw of sample) {
    const asString = typeof raw === "string" ? raw.trim() : raw;
    if (parseBoolean(asString) !== null && String(asString).length <= 12) boolCount += 1;

    if (typeof asString === "string") {
      if (/R\$|\bBRL\b/i.test(asString)) currencyMarks += 1;
      if (/%\s*$/.test(asString)) percentMarks += 1;
    }

    const d = raw instanceof Date ? raw : toDate(asString);
    if (d) {
      dateCount += 1;
      if (typeof asString === "string" && /\d{1,2}:\d{2}/.test(asString)) datetimeCount += 1;
      else if (raw instanceof Date && (raw.getHours() || raw.getMinutes())) datetimeCount += 1;
    }

    const n = parseNumberLoose(asString);
    if (n !== null) {
      numCount += 1;
      if (Number.isInteger(n)) intCount += 1;
    }
  }

  const ratio = (count) => count / total;
  const distinct = new Set(sample.map((v) => String(v))).size;

  // Booleano: poucos valores distintos e todos reconhecíveis.
  if (ratio(boolCount) >= 0.98 && distinct <= 3) {
    return { type: "boolean", role: "dimension", confidence: ratio(boolCount), format: {} };
  }

  // Data: prioriza sobre número (evita "2024" virar medida quando o nome indica data).
  const dateLikelyByName = DATE_HINT.test(key);
  if (ratio(dateCount) >= 0.9 && (ratio(numCount) < 0.9 || dateLikelyByName)) {
    const type = ratio(datetimeCount) >= 0.4 ? "datetime" : "date";
    return { type, role: "time", confidence: ratio(dateCount), format: {} };
  }

  if (ratio(numCount) >= 0.9) {
    // Identificadores numéricos não são medidas.
    const looksLikeId = ID_HINT.test(key) || (distinct === total && ratio(intCount) === 1 && total > 12);
    if (looksLikeId && !CURRENCY_HINT.test(key)) {
      return { type: "text", role: "id", confidence: 0.8, format: {} };
    }
    let type = ratio(intCount) === 1 ? "integer" : "number";
    if (ratio(currencyMarks) > 0.3 || CURRENCY_HINT.test(key)) type = "currency";
    else if (ratio(percentMarks) > 0.3 || PERCENT_HINT.test(key)) type = "percent";
    return { type, role: "measure", confidence: ratio(numCount), format: {} };
  }

  if (ratio(dateCount) >= 0.75) {
    return { type: "date", role: "time", confidence: ratio(dateCount), format: {} };
  }

  const role = ID_HINT.test(key) || distinct === total ? "id" : "dimension";
  return { type: "text", role, confidence: 1 - ratio(numCount), format: {} };
}

/**
 * Converte um valor bruto para o tipo alvo.
 * @returns {*} valor tipado ou null quando inconversível/vazio
 */
export function coerce(value, type) {
  if (isBlank(value)) return null;
  switch (type) {
    case "integer": {
      const n = parseNumberLoose(value);
      return n === null ? null : Math.round(n);
    }
    case "number":
    case "currency":
    case "percent":
      return parseNumberLoose(value);
    case "date":
    case "datetime": {
      const d = toDate(value);
      return d ? d.toISOString() : null;
    }
    case "boolean":
      return parseBoolean(value);
    default:
      return typeof value === "string" ? value.trim() : String(value);
  }
}

/**
 * Aplica a tipagem a todas as linhas, devolvendo linhas coeridas + contagem de
 * falhas por coluna (usado no relatório de qualidade).
 */
export function applyTypes(rows, fields) {
  const errors = Object.fromEntries(fields.map((f) => [f.name, 0]));
  const blanks = Object.fromEntries(fields.map((f) => [f.name, 0]));
  const typed = rows.map((row) => {
    const out = {};
    for (const field of fields) {
      const raw = row[field.name];
      if (isBlank(raw)) {
        out[field.name] = null;
        blanks[field.name] += 1;
        continue;
      }
      const value = coerce(raw, field.type);
      if (value === null) errors[field.name] += 1;
      out[field.name] = value;
    }
    return out;
  });
  return { rows: typed, errors, blanks };
}

/**
 * Constrói a lista de campos a partir das linhas cruas.
 * @param {Array<Object>} rows
 * @param {Array<string>} [columns] ordem preferida
 */
export function detectFields(rows, columns) {
  const names = columns || Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return names.map((name) => {
    const values = rows.map((r) => r[name]);
    const info = inferType(name, values);
    const nonBlank = values.filter((v) => !isBlank(v));
    return {
      name,
      label: prettyLabel(name),
      type: info.type,
      role: info.role,
      confidence: Number(info.confidence.toFixed(2)),
      distinct: new Set(nonBlank.map((v) => String(v))).size,
      blanks: values.length - nonBlank.length,
      visible: true,
    };
  });
}

/** "valor_total" -> "Valor total" */
export function prettyLabel(name) {
  const cleaned = String(name)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
  if (!cleaned) return name;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export function isNumericField(field) {
  return field && NUMERIC_TYPES.has(field.type);
}

export function isTemporalField(field) {
  return field && TEMPORAL_TYPES.has(field.type);
}

/** Sugere a agregação padrão para um campo. */
export function defaultAgg(field) {
  if (!field) return "count";
  if (field.type === "percent") return "avg";
  if (NUMERIC_TYPES.has(field.type)) return "sum";
  return "countDistinct";
}
