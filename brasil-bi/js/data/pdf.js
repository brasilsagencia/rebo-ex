/**
 * Brasil BI — extração de texto e tabelas de PDF, sem dependências externas.
 *
 * Estratégia:
 *  1. Varre os objetos do PDF e descompacta os streams FlateDecode com a API
 *     nativa DecompressionStream("deflate").
 *  2. Localiza as páginas (/Type /Page) e seus content streams.
 *  3. Interpreta os operadores de texto (BT/ET, Tm, Td, TD, T*, Tj, TJ, ', ")
 *     guardando a posição (x, y) de cada fragmento.
 *  4. Agrupa fragmentos em linhas (por y) e detecta colunas (por x), montando
 *     uma tabela por página.
 *  5. Calcula uma CONFIANÇA por página. Nada é importado silenciosamente:
 *     páginas sem texto (PDF digitalizado) ou com baixa confiança são
 *     sinalizadas para revisão manual.
 *
 * Limitações informadas ao usuário:
 *  • PDFs digitalizados (imagem) exigem OCR — não disponível offline nesta
 *    versão; a página é marcada como "requer OCR".
 *  • Streams com filtros raros (LZW, JBIG2, criptografia) são ignorados.
 */

const DEC = new TextDecoder("latin1");

/* ------------------------------------------------------- infra de parsing */

function bytesToLatin1(bytes) {
  // Em blocos, para não estourar a pilha em arquivos grandes.
  let out = "";
  const size = 32768;
  for (let i = 0; i < bytes.length; i += size) {
    out += DEC.decode(bytes.subarray(i, i + size));
  }
  return out;
}

async function inflate(bytes) {
  if (typeof DecompressionStream === "undefined") return null;
  for (const format of ["deflate", "deflate-raw"]) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      /* tenta o próximo formato */
    }
  }
  return null;
}

/** Objetos indiretos: "12 0 obj ... endobj" */
function indexObjects(raw) {
  const objects = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let match;
  while ((match = re.exec(raw))) {
    const start = re.lastIndex;
    const end = raw.indexOf("endobj", start);
    if (end < 0) continue;
    objects.set(Number(match[1]), { start, end, body: raw.slice(start, end) });
  }
  return objects;
}

function streamBounds(body, absoluteStart) {
  const m = /stream\r?\n?/.exec(body);
  if (!m) return null;
  const dataStart = absoluteStart + m.index + m[0].length;
  const endIdx = body.indexOf("endstream", m.index);
  if (endIdx < 0) return null;
  return { dataStart, dataEnd: absoluteStart + endIdx };
}

/* ------------------------------------------------------------- ToUnicode */

/** Interpreta um CMap /ToUnicode em um mapa código → caractere. */
function parseToUnicode(text) {
  const map = new Map();
  const hexToStr = (hex) => {
    let out = "";
    for (let i = 0; i < hex.length; i += 4) {
      const code = parseInt(hex.slice(i, i + 4), 16);
      if (Number.isFinite(code)) out += String.fromCharCode(code);
    }
    return out;
  };

  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const block of charBlocks) {
    const pairs = block.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g) || [];
    for (const pair of pairs) {
      const [, src, dst] = pair.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
      map.set(parseInt(src, 16), hexToStr(dst));
    }
  }

  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const block of rangeBlocks) {
    const simple = block.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g) || [];
    for (const entry of simple) {
      const [, lo, hi, dst] = entry.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
      const start = parseInt(lo, 16);
      const end = parseInt(hi, 16);
      const base = parseInt(dst, 16);
      for (let c = start; c <= end && c - start < 65536; c += 1) {
        map.set(c, String.fromCharCode(base + (c - start)));
      }
    }
    const arrays = block.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g) || [];
    for (const entry of arrays) {
      const [, lo, , list] = entry.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/);
      const start = parseInt(lo, 16);
      const items = list.match(/<([0-9a-fA-F]+)>/g) || [];
      items.forEach((item, i) => {
        map.set(start + i, hexToStr(item.replace(/[<>]/g, "")));
      });
    }
  }
  return map;
}

/* --------------------------------------------------- interpretação de texto */

/** Lê uma string PDF literal "(...)" a partir de um índice. */
function readLiteralString(src, start) {
  let depth = 1;
  let i = start;
  const bytes = [];
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "\\") {
      const next = src[i + 1];
      const octal = src.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
      if (octal) {
        bytes.push(parseInt(octal[0], 8));
        i += 1 + octal[0].length;
        continue;
      }
      const map = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
      if (next in map) bytes.push(map[next]);
      else if (next === "\n") {
        /* continuação de linha */
      } else bytes.push(next.charCodeAt(0));
      i += 2;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
    bytes.push(ch.charCodeAt(0));
    i += 1;
  }
  return { bytes, next: i + 1 };
}

function decodeWithMap(codes, cmap, twoByte) {
  if (!cmap || cmap.size === 0) {
    return codes.map((c) => String.fromCharCode(c)).join("");
  }
  if (twoByte) {
    let out = "";
    for (let i = 0; i < codes.length; i += 2) {
      const code = (codes[i] << 8) | (codes[i + 1] || 0);
      out += cmap.get(code) ?? "";
    }
    return out;
  }
  return codes.map((c) => cmap.get(c) ?? String.fromCharCode(c)).join("");
}

/**
 * Percorre o content stream extraindo fragmentos posicionados.
 * @returns {Array<{x:number,y:number,text:string,size:number}>}
 */
function extractTextItems(content, fonts) {
  const items = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = tm.slice();
  let leading = 0;
  let fontSize = 10;
  let currentFont = null;
  let charSpacing = 0;

  const mul = (a, b) => [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];

  const stack = [];
  let i = 0;
  const pushText = (text) => {
    if (!text) return;
    items.push({
      x: tm[4],
      y: tm[5],
      text,
      size: Math.abs(fontSize * (tm[3] || 1)) || fontSize,
    });
    // Avanço horizontal aproximado (largura média 0,5 em).
    tm = mul([1, 0, 0, 1, text.length * fontSize * 0.5 + charSpacing * text.length, 0], tm);
  };

  while (i < content.length) {
    const ch = content[i];

    if (ch === "(") {
      const { bytes, next } = readLiteralString(content, i + 1);
      stack.push({ kind: "str", bytes });
      i = next;
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      const end = content.indexOf(">", i);
      const hex = content.slice(i + 1, end).replace(/[^0-9a-fA-F]/g, "");
      const bytes = [];
      for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16) || 0);
      stack.push({ kind: "hex", bytes });
      i = end + 1;
      continue;
    }
    if (ch === "[" || ch === "]" || ch === "{" || ch === "}") {
      stack.push({ kind: "delim", value: ch });
      i += 1;
      continue;
    }
    if (/[\s]/.test(ch)) {
      i += 1;
      continue;
    }

    // token (número, nome ou operador)
    let j = i;
    while (j < content.length && !/[\s()<>\[\]{}/]/.test(content[j])) j += 1;
    if (content[i] === "/") {
      j = i + 1;
      while (j < content.length && !/[\s()<>\[\]{}/]/.test(content[j])) j += 1;
      stack.push({ kind: "name", value: content.slice(i + 1, j) });
      i = j;
      continue;
    }
    const token = content.slice(i, j || i + 1);
    i = j || i + 1;
    if (!token) continue;

    if (/^-?[\d.]+$/.test(token)) {
      stack.push({ kind: "num", value: Number(token) });
      continue;
    }

    const nums = stack.filter((s) => s.kind === "num").map((s) => s.value);
    switch (token) {
      case "BT":
        tm = [1, 0, 0, 1, 0, 0];
        tlm = tm.slice();
        break;
      case "ET":
        break;
      case "Tf": {
        const name = [...stack].reverse().find((s) => s.kind === "name")?.value;
        currentFont = fonts?.get(name) || null;
        fontSize = nums[nums.length - 1] ?? fontSize;
        break;
      }
      case "TL":
        leading = nums[nums.length - 1] ?? leading;
        break;
      case "Tc":
        charSpacing = nums[nums.length - 1] ?? 0;
        break;
      case "Td": {
        const [tx, ty] = nums.slice(-2);
        tlm = mul([1, 0, 0, 1, tx || 0, ty || 0], tlm);
        tm = tlm.slice();
        break;
      }
      case "TD": {
        const [tx, ty] = nums.slice(-2);
        leading = -(ty || 0);
        tlm = mul([1, 0, 0, 1, tx || 0, ty || 0], tlm);
        tm = tlm.slice();
        break;
      }
      case "Tm": {
        const m = nums.slice(-6);
        if (m.length === 6) {
          tlm = m.slice();
          tm = m.slice();
        }
        break;
      }
      case "T*":
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm.slice();
        break;
      case "Tj":
      case "'":
      case '"': {
        if (token !== "Tj") {
          tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
          tm = tlm.slice();
        }
        const str = [...stack].reverse().find((s) => s.kind === "str" || s.kind === "hex");
        if (str) pushText(decodeWithMap(str.bytes, currentFont?.cmap, str.kind === "hex" && currentFont?.twoByte));
        break;
      }
      case "TJ": {
        let buffer = "";
        for (const entry of stack) {
          if (entry.kind === "str" || entry.kind === "hex") {
            buffer += decodeWithMap(entry.bytes, currentFont?.cmap, entry.kind === "hex" && currentFont?.twoByte);
          } else if (entry.kind === "num" && entry.value < -120) {
            buffer += " "; // deslocamento grande ⇒ espaço
          }
        }
        pushText(buffer);
        break;
      }
      default:
        break;
    }
    if (/^(BT|ET|Tf|TL|Tc|Td|TD|Tm|T\*|Tj|TJ|'|"|cm|q|Q|Do|re|f|S|n|W)$/.test(token)) stack.length = 0;
  }
  return items;
}

/* ----------------------------------------------- agrupamento em linhas/tabelas */

function itemsToLines(items) {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const tolerance = Math.max(2.2, (sorted[0].size || 10) * 0.45);
  const lines = [];
  let current = { y: sorted[0].y, items: [] };
  for (const item of sorted) {
    if (Math.abs(item.y - current.y) <= tolerance) current.items.push(item);
    else {
      lines.push(current);
      current = { y: item.y, items: [item] };
    }
  }
  lines.push(current);
  return lines
    .map((line) => ({
      y: line.y,
      items: line.items.sort((a, b) => a.x - b.x),
      text: line.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((line) => line.text);
}

/** Descobre colunas por posições x recorrentes e monta a matriz. */
function linesToMatrix(lines) {
  const starts = [];
  for (const line of lines) {
    for (const item of line.items) starts.push(item.x);
  }
  if (!starts.length) return { matrix: [], columns: 0 };

  starts.sort((a, b) => a - b);
  // Agrupa posições próximas (tolerância de 6 pt).
  const clusters = [];
  for (const x of starts) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.x <= 6) {
      last.count += 1;
      last.x = (last.x * (last.count - 1) + x) / last.count;
    } else clusters.push({ x, count: 1 });
  }
  const minSupport = Math.max(2, Math.round(lines.length * 0.35));
  const anchors = clusters.filter((c) => c.count >= minSupport).map((c) => c.x);
  if (anchors.length < 2) {
    return { matrix: lines.map((l) => [l.text]), columns: 1 };
  }

  const matrix = lines.map((line) => {
    const cells = new Array(anchors.length).fill("");
    for (const item of line.items) {
      let idx = 0;
      for (let a = 0; a < anchors.length; a += 1) {
        if (item.x >= anchors[a] - 6) idx = a;
      }
      cells[idx] = cells[idx] ? `${cells[idx]} ${item.text}` : item.text;
    }
    return cells.map((c) => c.replace(/\s+/g, " ").trim());
  });
  return { matrix, columns: anchors.length };
}

/** Heurística de confiança: caracteres legíveis + regularidade das colunas. */
function scoreConfidence(matrix, rawText) {
  if (!rawText) return 0;
  const printable = (rawText.match(/[\p{L}\p{N}\p{P}\s]/gu) || []).length / rawText.length;
  if (!matrix.length) return printable * 0.4;
  const widths = matrix.map((r) => r.filter((c) => c !== "").length);
  const mode = widths.sort((a, b) => widths.filter((w) => w === a).length - widths.filter((w) => w === b).length).pop();
  const regular = widths.filter((w) => w === mode).length / widths.length;
  return Math.max(0, Math.min(1, printable * 0.5 + regular * 0.5));
}

/* --------------------------------------------------------------- API pública */

/**
 * Lê um PDF e devolve as páginas com texto, matriz detectada e confiança.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{pages:Array, warnings:string[], encrypted:boolean}>}
 */
export async function readPdf(buffer) {
  const bytes = new Uint8Array(buffer);
  const raw = bytesToLatin1(bytes);
  const warnings = [];

  if (!raw.startsWith("%PDF")) warnings.push("O arquivo não começa com a assinatura %PDF — a leitura pode falhar.");
  const encrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(raw);
  if (encrypted) {
    return {
      pages: [],
      encrypted: true,
      warnings: ["O PDF está protegido por criptografia. Remova a proteção e tente novamente."],
    };
  }

  const objects = indexObjects(raw);

  // Descompacta os streams sob demanda, com cache por número de objeto.
  const streamCache = new Map();
  async function getStreamText(objNum) {
    if (streamCache.has(objNum)) return streamCache.get(objNum);
    const obj = objects.get(objNum);
    if (!obj) return null;
    const bounds = streamBounds(obj.body, obj.start);
    if (!bounds) return null;
    const slice = bytes.subarray(bounds.dataStart, bounds.dataEnd);
    let text = null;
    if (/\/Filter\s*\/FlateDecode/.test(obj.body) || /\/Filter\s*\[\s*\/FlateDecode/.test(obj.body)) {
      const inflated = await inflate(slice);
      text = inflated ? bytesToLatin1(inflated) : null;
    } else if (!/\/Filter/.test(obj.body)) {
      text = bytesToLatin1(slice);
    }
    streamCache.set(objNum, text);
    return text;
  }

  // Fontes: mapa nome→{cmap, twoByte} por objeto de recursos.
  const fontCache = new Map();
  async function buildFonts(resourcesText) {
    const fonts = new Map();
    const fontDict = resourcesText?.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (!fontDict) return fonts;
    const refs = fontDict[1].match(/\/([^\s/]+)\s+(\d+)\s+\d+\s+R/g) || [];
    for (const ref of refs) {
      const [, name, num] = ref.match(/\/([^\s/]+)\s+(\d+)\s+\d+\s+R/);
      const key = `${name}:${num}`;
      if (fontCache.has(key)) {
        fonts.set(name, fontCache.get(key));
        continue;
      }
      const fontObj = objects.get(Number(num));
      let entry = { cmap: null, twoByte: false };
      if (fontObj) {
        entry.twoByte = /\/Encoding\s*\/Identity-[HV]/.test(fontObj.body) || /\/Type0/.test(fontObj.body);
        const toUni = fontObj.body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
        if (toUni) {
          const cmapText = await getStreamText(Number(toUni[1]));
          if (cmapText) entry.cmap = parseToUnicode(cmapText);
        }
      }
      fontCache.set(key, entry);
      fonts.set(name, entry);
    }
    return fonts;
  }

  // Páginas na ordem em que aparecem no arquivo.
  const pageObjs = [];
  for (const [num, obj] of objects) {
    if (/\/Type\s*\/Page\b/.test(obj.body) && !/\/Type\s*\/Pages\b/.test(obj.body)) {
      pageObjs.push({ num, obj });
    }
  }
  pageObjs.sort((a, b) => a.num - b.num);

  if (!pageObjs.length) warnings.push("Nenhum objeto de página encontrado — o PDF pode usar streams de objetos (comprimidos).");

  const pages = [];
  for (let p = 0; p < pageObjs.length; p += 1) {
    const { obj } = pageObjs[p];
    const contentRefs = [];
    const single = obj.body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    const arrayMatch = obj.body.match(/\/Contents\s*\[([^\]]*)\]/);
    if (single) contentRefs.push(Number(single[1]));
    if (arrayMatch) {
      for (const m of arrayMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) contentRefs.push(Number(m[1]));
    }

    let resourcesText = obj.body.match(/\/Resources\s*<<([\s\S]*?)>>\s*(?:\/|>>)/)?.[0] || "";
    const resRef = obj.body.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
    if (resRef) resourcesText = objects.get(Number(resRef[1]))?.body || resourcesText;

    const fonts = await buildFonts(resourcesText);

    // Página digitalizada: sem texto, mas com XObject de imagem desenhado.
    const xobjectRefs = Array.from(resourcesText.matchAll(/\/XObject\s*<<([\s\S]*?)>>/g))
      .flatMap((m) => Array.from(m[1].matchAll(/(\d+)\s+\d+\s+R/g)).map((r) => Number(r[1])));
    const hasImage =
      /\/Subtype\s*\/Image/.test(resourcesText) ||
      xobjectRefs.some((n) => /\/Subtype\s*\/Image/.test(objects.get(n)?.body || "")) ||
      contentRefs.some((n) => /\/Subtype\s*\/Image/.test(objects.get(n)?.body || ""));

    let content = "";
    for (const ref of contentRefs) {
      const text = await getStreamText(ref);
      if (text) content += `\n${text}`;
    }

    const items = content ? extractTextItems(content, fonts) : [];
    const lines = itemsToLines(items);
    const { matrix, columns } = linesToMatrix(lines);
    const text = lines.map((l) => l.text).join("\n");
    const confidence = scoreConfidence(matrix, text);

    pages.push({
      number: p + 1,
      text,
      lines: lines.map((l) => l.text),
      matrix,
      columns,
      confidence,
      needsOcr: !text.trim() && hasImage,
      empty: !text.trim() && !hasImage,
    });
  }

  const ocrPages = pages.filter((p) => p.needsOcr).length;
  if (ocrPages) {
    warnings.push(
      `${ocrPages} página(s) parecem ser digitalizadas (imagem). Elas exigem OCR e não foram importadas automaticamente.`
    );
  }
  const lowConfidence = pages.filter((p) => !p.needsOcr && p.confidence < 0.55).length;
  if (lowConfidence) {
    warnings.push(
      `${lowConfidence} página(s) tiveram leitura de baixa confiança. Revise a prévia antes de confirmar a importação.`
    );
  }
  if (!pages.length) warnings.push("Não foi possível extrair conteúdo deste PDF.");

  return { pages, warnings, encrypted: false };
}

/**
 * Converte as páginas escolhidas em uma tabela única.
 * @param {Array} pages páginas retornadas por readPdf
 * @param {number[]} selected números de página (1-based)
 */
export function pdfPagesToTable(pages, selected) {
  const chosen = pages.filter((p) => selected.includes(p.number) && p.matrix.length);
  if (!chosen.length) return { columns: [], rows: [], warnings: ["Nenhuma página selecionada tem tabela detectada."] };

  const warnings = [];
  const widths = chosen.map((p) => p.columns);
  const width = Math.max(...widths);
  if (new Set(widths).size > 1) {
    warnings.push("As páginas têm números de colunas diferentes; as menores foram completadas com vazios.");
  }

  const first = chosen[0].matrix;
  const headerCells = first[0] || [];
  const columns = headerCells
    .map((c, i) => (String(c).trim() ? String(c).trim() : `Coluna ${i + 1}`))
    .concat(Array.from({ length: Math.max(0, width - headerCells.length) }, (_, i) => `Coluna ${headerCells.length + i + 1}`));

  const rows = [];
  chosen.forEach((page, pageIdx) => {
    const body = pageIdx === 0 ? page.matrix.slice(1) : page.matrix.filter((r) => !sameRow(r, headerCells));
    for (const cells of body) {
      if (!cells.some((c) => String(c).trim())) continue;
      const row = { __pagina: page.number };
      columns.forEach((col, i) => {
        row[col] = cells[i] ?? null;
      });
      rows.push(row);
    }
  });

  return { columns: ["__pagina", ...columns], rows, warnings };
}

function sameRow(a, b) {
  if (!a || !b) return false;
  const norm = (arr) => arr.map((c) => String(c).trim().toLowerCase()).join("|");
  return norm(a) === norm(b);
}
