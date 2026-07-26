/**
 * Brasil BI — leitores de arquivo texto: CSV, TSV, TXT, JSON e XML.
 * Todos devolvem o formato comum:
 *   { columns: string[], rows: Object[], meta: {...}, warnings: string[] }
 */

import { prettyLabel } from "./types.js";

/* --------------------------------------------------------------- utilidades */

export function stripBOM(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Detecta o delimitador mais provável analisando as primeiras linhas. */
export function sniffDelimiter(text) {
  const candidates = [";", ",", "\t", "|"];
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  if (!lines.length) return ",";
  let best = ",";
  let bestScore = -1;
  for (const delim of candidates) {
    const counts = lines.map((line) => countOutsideQuotes(line, delim));
    const first = counts[0];
    if (!first) continue;
    // Consistência entre linhas é o principal sinal.
    const consistent = counts.filter((c) => c === first).length / counts.length;
    const score = consistent * 10 + Math.min(first, 30) / 30;
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

function countOutsideQuotes(line, delim) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) count += 1;
  }
  return count;
}

/**
 * Divide texto delimitado em matriz, respeitando aspas e quebras internas.
 * @returns {string[][]}
 */
export function splitDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = stripBOM(text);

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignorado: tratado no \n seguinte
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

/** Gera nomes de coluna únicos e não vazios. */
export function normalizeHeaders(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((h, idx) => {
    let name = String(h ?? "").trim().replace(/\s+/g, " ");
    if (!name) name = `Coluna ${idx + 1}`;
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count ? `${name} (${count + 1})` : name;
  });
}

/**
 * Encontra a linha de cabeçalho mais provável (primeira linha "cheia" e textual).
 * @param {string[][]} matrix
 */
export function guessHeaderRow(matrix) {
  const limit = Math.min(matrix.length, 12);
  let bestIdx = 0;
  let bestScore = -Infinity;
  const width = Math.max(...matrix.slice(0, limit).map((r) => r.length), 1);
  for (let i = 0; i < limit; i += 1) {
    const row = matrix[i];
    const filled = row.filter((c) => String(c).trim() !== "").length;
    const textual = row.filter((c) => String(c).trim() && !/^-?[\d.,%R$\s]+$/.test(String(c).trim())).length;
    const unique = new Set(row.map((c) => String(c).trim().toLowerCase())).size;
    const score = filled / width + textual / width + unique / width - i * 0.08;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/* --------------------------------------------------------------------- CSV */

/**
 * @param {string} text
 * @param {{delimiter?:string, headerRow?:number, skipRows?:number[]}} [opts]
 */
export function parseDelimitedText(text, opts = {}) {
  const warnings = [];
  const delimiter = opts.delimiter || sniffDelimiter(text);
  const matrix = splitDelimited(text, delimiter);
  if (!matrix.length) {
    return { columns: [], rows: [], meta: { delimiter }, warnings: ["Arquivo vazio ou sem linhas legíveis."] };
  }

  const headerIdx = opts.headerRow ?? guessHeaderRow(matrix);
  if (headerIdx > 0) {
    warnings.push(
      `As ${headerIdx} primeira(s) linha(s) foram ignoradas por não parecerem cabeçalho.`
    );
  }
  const columns = normalizeHeaders(matrix[headerIdx] || []);
  const width = columns.length;
  const body = matrix.slice(headerIdx + 1);

  let ragged = 0;
  const rows = [];
  for (const line of body) {
    if (line.length !== width) ragged += 1;
    const row = {};
    for (let c = 0; c < width; c += 1) row[columns[c]] = line[c] ?? null;
    rows.push(row);
  }
  if (ragged) {
    warnings.push(
      `${ragged} linha(s) têm número de colunas diferente do cabeçalho — os campos faltantes ficaram vazios.`
    );
  }

  return {
    columns,
    rows,
    meta: { delimiter, headerRow: headerIdx, totalLines: matrix.length },
    warnings,
  };
}

/* -------------------------------------------------------------------- JSON */

/** Achata objetos aninhados: {a:{b:1}} -> {"a.b":1} */
export function flattenObject(obj, prefix = "", out = {}, depth = 0) {
  for (const [key, value] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && depth < 4) {
      flattenObject(value, path, out, depth + 1);
    } else if (Array.isArray(value)) {
      out[path] = value.length && typeof value[0] === "object" ? JSON.stringify(value) : value.join("; ");
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** Localiza o maior array de objetos dentro de uma estrutura JSON. */
function findRecordArray(data) {
  if (Array.isArray(data)) return data;
  let best = null;
  const visit = (node, depth) => {
    if (depth > 5 || !node || typeof node !== "object") return;
    for (const value of Object.values(node)) {
      if (Array.isArray(value) && value.length && typeof value[0] === "object") {
        if (!best || value.length > best.length) best = value;
      } else if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(data, 0);
  return best;
}

export function parseJSONText(text) {
  const warnings = [];
  let data;
  try {
    data = JSON.parse(stripBOM(text));
  } catch (err) {
    // Suporte a NDJSON (um objeto por linha)
    const lines = stripBOM(text).split(/\r?\n/).filter((l) => l.trim());
    const parsed = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        /* linha ignorada */
      }
    }
    if (!parsed.length) throw new Error(`JSON inválido: ${err.message}`);
    warnings.push("Arquivo lido como NDJSON (um registro por linha).");
    data = parsed;
  }

  let records = findRecordArray(data);
  if (!records) {
    if (data && typeof data === "object") {
      records = [data];
      warnings.push("O JSON contém um único objeto — importado como uma linha.");
    } else {
      throw new Error("Não foi encontrado nenhum conjunto de registros no JSON.");
    }
  }

  const rows = records.map((r) =>
    r && typeof r === "object" && !Array.isArray(r) ? flattenObject(r) : { valor: r }
  );
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  for (const row of rows) {
    for (const col of columns) if (!(col in row)) row[col] = null;
  }
  return { columns, rows, meta: { records: rows.length }, warnings };
}

/* --------------------------------------------------------------------- XML */

export function parseXMLText(text) {
  const warnings = [];
  const doc = new DOMParser().parseFromString(stripBOM(text), "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML inválido: " + parseError.textContent.slice(0, 160));

  // Encontra o nome de elemento repetido mais frequente = registro.
  const counts = new Map();
  const walk = (node) => {
    for (const child of node.children) {
      counts.set(child.tagName, (counts.get(child.tagName) || 0) + 1);
      walk(child);
    }
  };
  walk(doc.documentElement ? doc : doc);
  if (doc.documentElement) {
    counts.set(doc.documentElement.tagName, (counts.get(doc.documentElement.tagName) || 0) + 1);
    walk(doc.documentElement);
  }

  let recordTag = null;
  let max = 1;
  for (const [tag, count] of counts) {
    if (count > max) {
      max = count;
      recordTag = tag;
    }
  }
  if (!recordTag) {
    recordTag = doc.documentElement?.children[0]?.tagName;
    warnings.push("Não foi possível identificar registros repetidos; usando o primeiro nó filho.");
  }
  const nodes = Array.from(doc.getElementsByTagName(recordTag));
  if (!nodes.length) throw new Error("Nenhum registro encontrado no XML.");

  const rows = nodes.map((node) => {
    const row = {};
    for (const attr of node.attributes) row[`@${attr.name}`] = attr.value;
    if (!node.children.length) row[node.tagName] = node.textContent.trim();
    for (const child of node.children) {
      const key = child.tagName;
      const value = child.children.length ? child.innerHTML.trim() : child.textContent.trim();
      row[key] = key in row ? `${row[key]}; ${value}` : value;
    }
    return row;
  });
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  for (const row of rows) for (const col of columns) if (!(col in row)) row[col] = null;

  return { columns, rows, meta: { recordTag, records: rows.length }, warnings };
}

/* --------------------------------------------------------------- TXT fixo */

/**
 * Texto de largura fixa: detecta colunas por posições de espaço constantes.
 * Usado quando o TXT não tem delimitador claro.
 */
export function parseFixedWidth(text) {
  const lines = stripBOM(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Arquivo TXT sem linhas suficientes.");
  const width = Math.max(...lines.map((l) => l.length));
  const spaceCount = new Array(width).fill(0);
  for (const line of lines) {
    for (let i = 0; i < width; i += 1) {
      if ((line[i] ?? " ") === " ") spaceCount[i] += 1;
    }
  }
  const boundaries = [];
  let run = 0;
  for (let i = 0; i < width; i += 1) {
    if (spaceCount[i] === lines.length) run += 1;
    else {
      if (run >= 2) boundaries.push(i);
      run = 0;
    }
  }
  if (!boundaries.length) throw new Error("Não foi possível separar colunas por largura fixa.");
  const cuts = [0, ...boundaries, width];
  const matrix = lines.map((line) =>
    cuts.slice(0, -1).map((start, i) => line.slice(start, cuts[i + 1]).trim())
  );
  const columns = normalizeHeaders(matrix[0]);
  const rows = matrix.slice(1).map((cells) => {
    const row = {};
    columns.forEach((c, i) => {
      row[c] = cells[i] ?? null;
    });
    return row;
  });
  return {
    columns,
    rows,
    meta: { mode: "largura-fixa", boundaries },
    warnings: ["Arquivo interpretado como largura fixa — confira a prévia antes de importar."],
  };
}

/* -------------------------------------------------------- roteador simples */

export function extensionOf(fileName = "") {
  const m = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Rótulo amigável do formato. */
export function formatLabel(ext) {
  return (
    {
      csv: "CSV",
      tsv: "TSV",
      txt: "Texto",
      json: "JSON",
      xml: "XML",
      xlsx: "Excel (XLSX)",
      xlsm: "Excel (XLSM)",
      xls: "Excel 97-2003 (XLS)",
      pdf: "PDF",
    }[ext] || ext.toUpperCase()
  );
}

export { prettyLabel };
