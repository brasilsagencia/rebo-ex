/**
 * Brasil BI — perfil e qualidade dos dados.
 * Gera o relatório mostrado na prévia de importação e na tela de fontes.
 */

import { isBlank, NUMERIC_TYPES, TEMPORAL_TYPES } from "./types.js";
import { parseNumberLoose, toDate, mean, median, stddev, quantile } from "../core/utils.js";

/**
 * @param {Array<Object>} rows
 * @param {Array<Object>} fields
 * @returns {{rowCount:number, columns:Array, duplicates:number, issues:Array, score:number}}
 */
export function profileDataset(rows, fields) {
  const rowCount = rows.length;
  const columns = fields.map((field) => profileColumn(rows, field));

  // Linhas totalmente duplicadas
  const seen = new Set();
  let duplicates = 0;
  const keyFields = fields.map((f) => f.name);
  for (const row of rows) {
    const key = keyFields.map((k) => String(row[k] ?? "")).join("");
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }

  const issues = [];
  if (!rowCount) issues.push({ level: "error", message: "A fonte não tem nenhuma linha de dados." });
  if (duplicates) {
    issues.push({
      level: "warn",
      message: `${duplicates} linha(s) totalmente duplicada(s) — considere remover na etapa de tratamento.`,
      action: "removeDuplicates",
    });
  }
  for (const col of columns) {
    if (col.blankPct >= 0.5 && rowCount) {
      issues.push({
        level: col.blankPct >= 0.9 ? "error" : "warn",
        field: col.name,
        message: `"${col.name}" está ${Math.round(col.blankPct * 100)}% vazia.`,
        action: "fillBlanks",
      });
    }
    if (col.invalid > 0) {
      issues.push({
        level: "warn",
        field: col.name,
        message: `${col.invalid} valor(es) de "${col.name}" não puderam ser convertidos para ${col.type}.`,
        action: "setType",
      });
    }
    if (col.distinct === 1 && rowCount > 3) {
      issues.push({
        level: "info",
        field: col.name,
        message: `"${col.name}" tem sempre o mesmo valor — pode ser removida.`,
        action: "dropColumns",
      });
    }
    if (col.outliers?.length) {
      issues.push({
        level: "info",
        field: col.name,
        message: `${col.outliers.length} valor(es) atípico(s) em "${col.name}" (fora de 3 desvios-padrão).`,
      });
    }
    if (col.mixedFormats) {
      issues.push({
        level: "warn",
        field: col.name,
        message: `"${col.name}" mistura formatos diferentes (ex.: número com e sem separador de milhar).`,
      });
    }
  }

  const penalty =
    issues.filter((i) => i.level === "error").length * 0.25 +
    issues.filter((i) => i.level === "warn").length * 0.08;
  const score = Math.max(0, Math.min(1, 1 - penalty));

  return { rowCount, columns, duplicates, issues, score, profiledAt: new Date().toISOString() };
}

function profileColumn(rows, field) {
  const values = rows.map((r) => r[field.name]);
  const nonBlank = values.filter((v) => !isBlank(v));
  const distinctSet = new Set(nonBlank.map((v) => String(v)));

  const stats = {
    name: field.name,
    label: field.label || field.name,
    type: field.type,
    role: field.role,
    blanks: values.length - nonBlank.length,
    blankPct: values.length ? (values.length - nonBlank.length) / values.length : 0,
    distinct: distinctSet.size,
    invalid: 0,
    top: [],
    min: null,
    max: null,
    mean: null,
    median: null,
    p95: null,
    outliers: [],
    mixedFormats: false,
    histogram: [],
  };

  if (NUMERIC_TYPES.has(field.type)) {
    const nums = [];
    for (const v of nonBlank) {
      const n = typeof v === "number" ? v : parseNumberLoose(v);
      if (n === null) stats.invalid += 1;
      else nums.push(n);
    }
    if (nums.length) {
      const sorted = [...nums].sort((a, b) => a - b);
      stats.min = sorted[0];
      stats.max = sorted[sorted.length - 1];
      stats.mean = mean(nums);
      stats.median = median(nums);
      stats.p95 = quantile(sorted, 0.95);
      const sd = stddev(nums);
      if (sd) {
        stats.outliers = nums.filter((n) => Math.abs(n - stats.mean) > 3 * sd).slice(0, 25);
      }
      stats.histogram = buildHistogram(sorted);
    }
    const asText = nonBlank.filter((v) => typeof v === "string");
    if (asText.length) {
      const withSep = asText.filter((v) => /[.,]/.test(v)).length;
      stats.mixedFormats = withSep > 0 && withSep < asText.length;
    }
  } else if (TEMPORAL_TYPES.has(field.type)) {
    const dates = [];
    for (const v of nonBlank) {
      const d = toDate(v);
      if (!d) stats.invalid += 1;
      else dates.push(d);
    }
    if (dates.length) {
      dates.sort((a, b) => a - b);
      stats.min = dates[0].toISOString();
      stats.max = dates[dates.length - 1].toISOString();
    }
  } else {
    const counts = new Map();
    for (const v of nonBlank) {
      const key = String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    stats.top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, count, pct: count / (nonBlank.length || 1) }));
  }

  return stats;
}

/** Histograma com 12 classes (usado no perfil e no gráfico de distribuição). */
export function buildHistogram(sortedNums, bins = 12) {
  if (!sortedNums.length) return [];
  const min = sortedNums[0];
  const max = sortedNums[sortedNums.length - 1];
  if (min === max) return [{ from: min, to: max, count: sortedNums.length }];
  const width = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));
  for (const n of sortedNums) {
    const idx = Math.min(bins - 1, Math.floor((n - min) / width));
    buckets[idx].count += 1;
  }
  return buckets;
}

/** Sugere etapas de tratamento a partir dos problemas encontrados. */
export function suggestSteps(quality) {
  const suggestions = [];
  if (quality.duplicates) {
    suggestions.push({
      label: `Remover ${quality.duplicates} linha(s) duplicada(s)`,
      step: { type: "removeDuplicates", fields: [] },
    });
  }
  for (const col of quality.columns) {
    if (col.blankPct > 0 && col.blankPct < 0.5 && NUMERIC_TYPES.has(col.type)) {
      suggestions.push({
        label: `Preencher vazios de "${col.name}" com 0`,
        step: { type: "fillBlanks", field: col.name, strategy: "zero" },
      });
    }
    if (col.type === "text" && col.distinct > 1) {
      suggestions.push({
        label: `Aparar espaços de "${col.name}"`,
        step: { type: "trim", field: col.name },
      });
    }
    if (col.distinct === 1) {
      suggestions.push({
        label: `Remover coluna constante "${col.name}"`,
        step: { type: "dropColumns", fields: [col.name] },
      });
    }
  }
  return suggestions.slice(0, 8);
}
