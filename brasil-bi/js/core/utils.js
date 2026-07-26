/**
 * Brasil BI — utilitários gerais: DOM, formatação pt-BR, parsing e helpers.
 * Sem dependências externas.
 */

/* ------------------------------------------------------------------ DOM -- */

/**
 * Cria elementos de forma declarativa.
 * @param {string} tag  ex.: "div.card.card--pad" ou "button#save.btn"
 * @param {Object} [props] atributos/props. `class`, `text`, `html`, `on:<evt>`,
 *                         `data-*`, `style` (string ou objeto) são suportados.
 * @param {(Node|string|null|undefined|Array)} [children]
 */
export function el(tag, props = {}, children = []) {
  const [name, ...rest] = String(tag).split(/(?=[.#])/);
  const node = document.createElement(name || "div");
  for (const token of rest) {
    if (token[0] === ".") node.classList.add(token.slice(1));
    else if (token[0] === "#") node.id = token.slice(1);
  }
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.classList.add(...String(value).split(/\s+/).filter(Boolean));
    else if (key === "text") node.textContent = String(value);
    else if (key === "html") node.innerHTML = value;
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key.startsWith("on:")) node.addEventListener(key.slice(3), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  append(node, children);
  return node;
}

/** Anexa filhos (aceita arrays aninhados, strings, null). */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** Substitui todo o conteúdo de um nó. */
export function render(parent, children) {
  parent.replaceChildren();
  append(parent, children);
  return parent;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escapa texto para uso em innerHTML. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------ Formatação -- */

const nf = new Intl.NumberFormat("pt-BR");
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cf = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});
const cf0 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function fmtNumber(value, decimals) {
  if (!isFiniteNumber(value)) return "—";
  if (decimals === undefined) return Number.isInteger(value) ? nf.format(value) : nf2.format(value);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function fmtCurrency(value, { compact = false } = {}) {
  if (!isFiniteNumber(value)) return "—";
  if (compact) return "R$ " + fmtCompact(value);
  return Math.abs(value) >= 100000 ? cf0.format(value) : cf.format(value);
}

export function fmtPercent(value, decimals = 1) {
  if (!isFiniteNumber(value)) return "—";
  return (
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value) + "%"
  );
}

/** 1.234.567 -> "1,23 mi" */
export function fmtCompact(value) {
  if (!isFiniteNumber(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return sign + nf2.format(abs / 1e9) + " bi";
  if (abs >= 1e6) return sign + nf2.format(abs / 1e6) + " mi";
  if (abs >= 1e4) return sign + nf.format(Math.round(abs / 1e3)) + " mil";
  if (abs >= 1000) return sign + nf2.format(abs / 1e3) + " mil";
  return Number.isInteger(value) ? nf.format(value) : nf2.format(value);
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function fmtDate(value, grain = "day") {
  const d = value instanceof Date ? value : toDate(value);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  switch (grain) {
    case "year":
      return String(yyyy);
    case "quarter":
      return `T${Math.floor(d.getMonth() / 3) + 1}/${yyyy}`;
    case "month":
      return `${MONTHS_SHORT[d.getMonth()]}/${String(yyyy).slice(2)}`;
    case "week": {
      const w = isoWeek(d);
      return `S${String(w).padStart(2, "0")}/${String(yyyy).slice(2)}`;
    }
    case "datetime":
      return `${dd}/${mm}/${yyyy} ${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

/** "há 3 minutos" */
export function fmtRelative(date) {
  const d = date instanceof Date ? date : toDate(date);
  if (!d) return "—";
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 45) return "agora mesmo";
  if (diff < 90) return "há 1 minuto";
  if (diff < 3600) return `há ${Math.round(diff / 60)} minutos`;
  if (diff < 7200) return "há 1 hora";
  if (diff < 86400) return `há ${Math.round(diff / 3600)} horas`;
  if (diff < 172800) return "ontem";
  if (diff < 2592000) return `há ${Math.round(diff / 86400)} dias`;
  return fmtDate(d);
}

export function fmtBytes(bytes) {
  if (!isFiniteNumber(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v : nf2.format(v)} ${units[i]}`;
}

/**
 * Formata um valor conforme o tipo semântico do campo.
 * @param {*} value
 * @param {string} type  number|currency|percent|integer|date|datetime|boolean|text
 */
export function fmtByType(value, type, opts = {}) {
  if (value === null || value === undefined || value === "") return "—";
  switch (type) {
    case "currency":
      return fmtCurrency(Number(value), opts);
    case "percent":
      return fmtPercent(Number(value), opts.decimals ?? 1);
    case "integer":
      return fmtNumber(Number(value), 0);
    case "number":
      return opts.compact ? fmtCompact(Number(value)) : fmtNumber(Number(value));
    case "date":
      return fmtDate(value, opts.grain || "day");
    case "datetime":
      return fmtDate(value, "datetime");
    case "boolean": {
      if (typeof value === "boolean") return value ? "Sim" : "Não";
      const flag = String(value).trim().toLowerCase();
      if (["true", "verdadeiro", "sim", "s", "yes", "y", "1", "ativo"].includes(flag)) return "Sim";
      if (["false", "falso", "nao", "não", "n", "no", "0", "inativo"].includes(flag)) return "Não";
      return String(value);
    }
    default:
      return String(value);
  }
}

/* --------------------------------------------------------------- Parsing -- */

export function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Converte texto numérico em número, tolerando formatos pt-BR e en-US.
 * "R$ 1.234,56" -> 1234.56 | "1,234.56" -> 1234.56 | "12,5%" -> 12.5
 * @returns {number|null}
 */
export function parseNumberLoose(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Remove apenas marcadores monetários/percentuais e espaços (inclusive NBSP).
  s = s.replace(/R\$|BRL/gi, "").replace(/[%\s\u00a0]/g, "");
  if (!s || !/[0-9]/.test(s)) return null;
  // Letras remanescentes indicam um código, não um número ("CLI-1001", "SKU9").
  if (/[A-Za-z\u00c0-\u024f]/.test(s.replace(/e[-+]?\d+$/i, ""))) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // O último separador encontrado é o decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    // "1,234" pode ser milhar (en-US) ou decimal (pt-BR); grupos de 3 => milhar.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const DATE_PATTERNS = [
  { re: /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/, order: "ymd" },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/, order: "dmy" },
  { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: "dmy" },
  { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: "dmy" },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: "dmy2" },
];

/**
 * Converte texto em Date, priorizando o padrão brasileiro (dd/mm/aaaa).
 * @returns {Date|null}
 */
export function toDate(raw) {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") {
    // Serial do Excel (dias desde 1899-12-30) vs. epoch ms.
    if (raw > 20000 && raw < 60000) return excelSerialToDate(raw);
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!raw) return null;
  const s = String(raw).trim();
  for (const { re, order } of DATE_PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    let y, mo, d;
    if (order === "ymd") [, y, mo, d] = m;
    else if (order === "dmy") [, d, mo, y] = m;
    else {
      [, d, mo, y] = m;
      y = Number(y) > 50 ? `19${y}` : `20${y}`;
    }
    const hh = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const date = new Date(Number(y), Number(mo) - 1, Number(d), hh, mi, ss);
    if (
      date.getFullYear() === Number(y) &&
      date.getMonth() === Number(mo) - 1 &&
      date.getDate() === Number(d)
    ) {
      return date;
    }
    return null;
  }
  // Datas por extenso em pt-BR: "12 de março de 2024"
  const ext = s.toLowerCase().match(/^(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})$/);
  if (ext) {
    const idx = MONTHS_LONG.findIndex((m) => m.startsWith(ext[2].slice(0, 3)));
    if (idx >= 0) return new Date(Number(ext[3]), idx, Number(ext[1]));
  }
  return null;
}

export function excelSerialToDate(serial) {
  const utcDays = Math.floor(serial) - 25569;
  const ms = utcDays * 86400 * 1000;
  const date = new Date(ms);
  const fraction = serial - Math.floor(serial);
  const seconds = Math.round(fraction * 86400);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60
  );
}

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Trunca uma data para o início do período. */
export function truncDate(date, grain) {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  switch (grain) {
    case "year":
      d.setMonth(0, 1);
      break;
    case "quarter":
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
      break;
    case "month":
      d.setDate(1);
      break;
    case "week": {
      const day = (d.getDay() + 6) % 7; // segunda = 0
      d.setDate(d.getDate() - day);
      break;
    }
    default:
      break;
  }
  return d;
}

export function addPeriod(date, grain, amount) {
  const d = new Date(date.getTime());
  switch (grain) {
    case "year":
      d.setFullYear(d.getFullYear() + amount);
      break;
    case "quarter":
      d.setMonth(d.getMonth() + amount * 3);
      break;
    case "month":
      d.setMonth(d.getMonth() + amount);
      break;
    case "week":
      d.setDate(d.getDate() + amount * 7);
      break;
    default:
      d.setDate(d.getDate() + amount);
  }
  return d;
}

/* ----------------------------------------------------------------- Misc -- */

let idCounter = 0;
export function uid(prefix = "id") {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function slug(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normaliza texto para comparações (sem acento, minúsculo). */
export function norm(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function throttle(fn, wait = 60) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(pending);
      pending = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, wait - (now - last));
    }
  };
}

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function sum(values) {
  let total = 0;
  for (const v of values) if (isFiniteNumber(v)) total += v;
  return total;
}

export function mean(values) {
  const nums = values.filter(isFiniteNumber);
  return nums.length ? sum(nums) / nums.length : null;
}

export function median(values) {
  const nums = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function quantile(sortedNums, q) {
  if (!sortedNums.length) return null;
  const pos = (sortedNums.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedNums[base + 1] !== undefined) {
    return sortedNums[base] + rest * (sortedNums[base + 1] - sortedNums[base]);
  }
  return sortedNums[base];
}

export function stddev(values) {
  const nums = values.filter(isFiniteNumber);
  if (nums.length < 2) return null;
  const m = sum(nums) / nums.length;
  return Math.sqrt(sum(nums.map((v) => (v - m) ** 2)) / (nums.length - 1));
}

/** Regressão linear simples: retorna {slope, intercept, r2}. */
export function linearRegression(points) {
  const pts = points.filter((p) => isFiniteNumber(p.x) && isFiniteNumber(p.y));
  const n = pts.length;
  if (n < 2) return null;
  const mx = sum(pts.map((p) => p.x)) / n;
  const my = sum(pts.map((p) => p.y)) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of pts) {
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
    ssTot += (p.y - my) ** 2;
  }
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Copia texto para a área de transferência.
 * A API moderna falha sem permissão (ou fora de HTTPS); nesse caso caímos para
 * o método antigo. Nunca rejeita — devolve `false` se não foi possível copiar.
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* segue para o método alternativo */
    }
  }
  try {
    const ta = el("textarea", {
      style: { position: "fixed", top: "-1000px", opacity: "0" },
      readonly: true,
      "aria-hidden": "true",
    });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Divide o trabalho em fatias para não travar a UI. */
export async function chunked(items, size, handler, onProgress) {
  for (let i = 0; i < items.length; i += size) {
    handler(items.slice(i, i + size), i);
    if (onProgress) onProgress(Math.min(1, (i + size) / items.length));
    // devolve o controle ao browser entre lotes
    await new Promise((r) => setTimeout(r, 0));
  }
}

export function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* fallback abaixo */
    }
  }
  return JSON.parse(JSON.stringify(value));
}
