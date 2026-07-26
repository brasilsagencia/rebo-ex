/**
 * Brasil BI — leitor de planilhas XLSX/XLSM sem dependências externas.
 *
 * Um .xlsx é um ZIP com XMLs. Aqui: descompactamos com a API nativa
 * `DecompressionStream("deflate-raw")` e interpretamos workbook, sharedStrings,
 * styles (para datas) e cada planilha.
 *
 * Limitações conhecidas (informadas ao usuário na prévia):
 *  • .xls (BIFF, Excel 97-2003) não é suportado — precisa ser convertido.
 *  • Fórmulas são lidas pelo último valor calculado salvo no arquivo.
 *  • ZIP64 (planilhas > 4 GB) não é suportado.
 */

import { excelSerialToDate } from "../core/utils.js";
import { guessHeaderRow, normalizeHeaders } from "./parsers.js";

/* ----------------------------------------------------------------- ZIP --- */

function readU16(view, offset) {
  return view.getUint16(offset, true);
}
function readU32(view, offset) {
  return view.getUint32(offset, true);
}

/** Lê o diretório central do ZIP e devolve as entradas. */
function readZipEntries(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Localiza o End Of Central Directory (assinatura 0x06054b50).
  let eocd = -1;
  const min = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (readU32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo não parece ser um XLSX válido (ZIP não reconhecido).");

  const count = readU16(view, eocd + 10);
  let offset = readU32(view, eocd + 16);
  if (offset === 0xffffffff) throw new Error("Planilhas em formato ZIP64 não são suportadas.");

  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (readU32(view, offset) !== 0x02014b50) break;
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const nameLen = readU16(view, offset + 28);
    const extraLen = readU16(view, offset + 30);
    const commentLen = readU16(view, offset + 32);
    const localOffset = readU32(view, offset + 42);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, view, bytes };
}

async function inflateEntry(zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const { view, bytes } = zip;
  const lo = entry.localOffset;
  if (readU32(view, lo) !== 0x04034b50) throw new Error(`Entrada corrompida no ZIP: ${name}`);
  const nameLen = readU16(view, lo + 26);
  const extraLen = readU16(view, lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) throw new Error(`Compressão não suportada no arquivo (método ${entry.method}).`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "Este navegador não suporta descompactação nativa (DecompressionStream). Converta a planilha para CSV."
    );
  }
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

/* ------------------------------------------------------------------ XLSX -- */

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML interno da planilha inválido.");
  return doc;
}

/** Converte "BC" -> 54 (índice 0-based da coluna). */
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)?.[0] || "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47, 27, 30, 36, 50, 57]);

function isDateFormatCode(code) {
  if (!code) return false;
  const stripped = code.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
  return /[dmyhs]/i.test(stripped) && /(d|m{1,5}|y{2,4})/i.test(stripped);
}

async function readStyles(zip) {
  const xml = await inflateEntry(zip, "xl/styles.xml");
  if (!xml) return { dateStyles: new Set(), numFmtOfStyle: [] };
  const doc = parseXml(xml);
  const customFmts = new Map();
  for (const node of doc.getElementsByTagName("numFmt")) {
    customFmts.set(Number(node.getAttribute("numFmtId")), node.getAttribute("formatCode") || "");
  }
  const cellXfs = doc.getElementsByTagName("cellXfs")[0];
  const dateStyles = new Set();
  const numFmtOfStyle = [];
  if (cellXfs) {
    Array.from(cellXfs.getElementsByTagName("xf")).forEach((xf, i) => {
      const id = Number(xf.getAttribute("numFmtId") || 0);
      numFmtOfStyle[i] = id;
      if (BUILTIN_DATE_FMTS.has(id) || isDateFormatCode(customFmts.get(id))) dateStyles.add(i);
    });
  }
  return { dateStyles, numFmtOfStyle };
}

async function readSharedStrings(zip) {
  const xml = await inflateEntry(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  const doc = parseXml(xml);
  return Array.from(doc.getElementsByTagName("si")).map((si) => {
    // Ignora nós <rPh> (furigana) e concatena os <t> restantes.
    const parts = [];
    for (const t of si.getElementsByTagName("t")) {
      if (t.parentNode?.nodeName === "rPh") continue;
      parts.push(t.textContent);
    }
    return parts.join("");
  });
}

async function readWorkbook(zip) {
  const xml = await inflateEntry(zip, "xl/workbook.xml");
  if (!xml) throw new Error("Planilha sem workbook.xml — arquivo inválido.");
  const relsXml = await inflateEntry(zip, "xl/_rels/workbook.xml.rels");
  const rels = new Map();
  if (relsXml) {
    for (const rel of parseXml(relsXml).getElementsByTagName("Relationship")) {
      rels.set(rel.getAttribute("Id"), rel.getAttribute("Target"));
    }
  }
  const doc = parseXml(xml);
  return Array.from(doc.getElementsByTagName("sheet")).map((sheet, i) => {
    const rid = sheet.getAttribute("r:id") || sheet.getAttributeNS?.("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let target = rels.get(rid) || `worksheets/sheet${i + 1}.xml`;
    target = target.replace(/^\//, "").replace(/^xl\//, "");
    return {
      name: sheet.getAttribute("name") || `Planilha ${i + 1}`,
      path: `xl/${target}`,
      hidden: sheet.getAttribute("state") === "hidden",
    };
  });
}

/**
 * Lê uma planilha e devolve a matriz de células já tipadas (Date/number/string).
 * @returns {{matrix: Array<Array<*>>, cells: number}}
 */
async function readSheet(zip, path, shared, styles) {
  const xml = await inflateEntry(zip, path);
  if (!xml) return { matrix: [], cells: 0 };
  const doc = parseXml(xml);
  const matrix = [];
  let cells = 0;

  for (const rowNode of doc.getElementsByTagName("row")) {
    const rowIdx = Number(rowNode.getAttribute("r") || matrix.length + 1) - 1;
    const row = matrix[rowIdx] || (matrix[rowIdx] = []);
    for (const c of rowNode.getElementsByTagName("c")) {
      const ref = c.getAttribute("r") || "";
      const idx = ref ? colIndex(ref) : row.length;
      const type = c.getAttribute("t");
      const styleIdx = Number(c.getAttribute("s") || -1);
      let value = null;

      if (type === "inlineStr") {
        value = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent).join("");
      } else {
        const v = c.getElementsByTagName("v")[0];
        const raw = v ? v.textContent : null;
        if (raw === null || raw === "") value = null;
        else if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "b") value = raw === "1";
        else if (type === "e") value = null; // célula com erro (#DIV/0! etc.)
        else if (type === "str") value = raw;
        else {
          const num = Number(raw);
          value = Number.isFinite(num)
            ? styles.dateStyles.has(styleIdx) && num > 0
              ? excelSerialToDate(num)
              : num
            : raw;
        }
      }
      row[idx] = value;
      if (value !== null && value !== "") cells += 1;
    }
  }
  // Preenche buracos e normaliza o comprimento.
  const width = Math.max(0, ...matrix.map((r) => (r ? r.length : 0)));
  for (let i = 0; i < matrix.length; i += 1) {
    if (!matrix[i]) matrix[i] = [];
    for (let j = 0; j < width; j += 1) if (matrix[i][j] === undefined) matrix[i][j] = null;
  }
  return { matrix: matrix.filter((r) => r.some((v) => v !== null && v !== "")), cells };
}

/**
 * Abre um arquivo XLSX/XLSM e devolve todas as abas com suas matrizes.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{sheets: Array<{name:string,hidden:boolean,matrix:Array,rows:number,cells:number}>, warnings:string[]}>}
 */
export async function readWorkbookFile(buffer) {
  const warnings = [];
  const zip = readZipEntries(buffer);
  const [shared, styles, sheetDefs] = await Promise.all([
    readSharedStrings(zip),
    readStyles(zip),
    readWorkbook(zip),
  ]);

  const sheets = [];
  for (const def of sheetDefs) {
    try {
      const { matrix, cells } = await readSheet(zip, def.path, shared, styles);
      sheets.push({ name: def.name, hidden: def.hidden, matrix, rows: matrix.length, cells });
    } catch (err) {
      warnings.push(`A aba "${def.name}" não pôde ser lida: ${err.message}`);
    }
  }
  if (!sheets.length) throw new Error("Nenhuma aba legível encontrada na planilha.");
  if (sheets.some((s) => s.hidden)) warnings.push("A planilha contém abas ocultas — elas aparecem na lista marcadas como ocultas.");
  return { sheets, warnings };
}

/**
 * Converte a matriz de uma aba no formato comum de importação.
 * @param {Array<Array<*>>} matrix
 * @param {{headerRow?:number}} [opts]
 */
export function sheetToTable(matrix, opts = {}) {
  const warnings = [];
  if (!matrix.length) return { columns: [], rows: [], meta: {}, warnings: ["Aba vazia."] };
  const headerIdx = opts.headerRow ?? guessHeaderRow(matrix.map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : v ?? ""))));
  const columns = normalizeHeaders((matrix[headerIdx] || []).map((v) => (v instanceof Date ? v.toISOString() : v)));
  const rows = matrix.slice(headerIdx + 1).map((line) => {
    const row = {};
    columns.forEach((col, i) => {
      row[col] = line[i] ?? null;
    });
    return row;
  });
  if (headerIdx > 0) warnings.push(`${headerIdx} linha(s) acima do cabeçalho foram ignoradas.`);
  return { columns, rows, meta: { headerRow: headerIdx }, warnings };
}

/** Gera um XLSX mínimo (uma aba, tudo como texto/número) para exportação. */
export async function writeSimpleXlsx(columns, rows, sheetName = "Dados") {
  const escapeXml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const colLetter = (n) => {
    let s = "";
    let i = n + 1;
    while (i > 0) {
      const rem = (i - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  };

  const sheetRows = [];
  sheetRows.push(
    `<row r="1">${columns
      .map((c, i) => `<c r="${colLetter(i)}1" t="inlineStr"><is><t>${escapeXml(c)}</t></is></c>`)
      .join("")}</row>`
  );
  rows.forEach((row, r) => {
    const cellsXml = columns
      .map((col, i) => {
        const value = row[col];
        const ref = `${colLetter(i)}${r + 2}`;
        if (value === null || value === undefined || value === "") return "";
        if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
      })
      .join("");
    sheetRows.push(`<row r="${r + 2}">${cellsXml}</row>`);
  });

  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(
      sheetName.slice(0, 31)
    )}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join(
      ""
    )}</sheetData></worksheet>`,
  };

  return zipStore(files);
}

/* --------------------------------------------- gravação ZIP (sem compressão) */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Cria um ZIP "stored" (método 0) — suficiente para XLSX pequenos/médios. */
export function zipStore(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const push = (arr) => {
    chunks.push(arr);
    offset += arr.length;
  };

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const localOffset = offset;
    push(local);
    push(data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, localOffset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
  }

  const cdStart = offset;
  for (const cd of central) push(cd);
  const cdSize = offset - cdStart;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(eocd);

  return new Blob(chunks, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
