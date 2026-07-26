/**
 * Brasil BI — exportação: CSV, XLSX, JSON, PNG (gráfico) e PDF (impressão).
 *
 * O PDF usa a impressão do navegador com uma folha de estilo dedicada: o
 * resultado mantém textos nítidos e gráficos vetoriais, com cabeçalho, rodapé,
 * data, responsável e a lista de filtros aplicados.
 */

import { downloadBlob, fmtDate, fmtByType, el, esc } from "../core/utils.js";
import { writeSimpleXlsx } from "../data/xlsx.js";
import { toast } from "../ui/feedback.js";

/* ------------------------------------------------------------------- CSV -- */

export function toCsv(columns, rows, { delimiter = ";" } = {}) {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return "";
    const str = value instanceof Date ? fmtDate(value) : String(value);
    return /["\n\r;,\t]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.map(escapeCell).join(delimiter)];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(row[c])).join(delimiter));
  return `﻿${lines.join("\r\n")}`; // BOM para o Excel pt-BR
}

export function exportCsv(columns, rows, filename = "brasil-bi.csv") {
  downloadBlob(new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" }), filename);
}

export async function exportXlsx(columns, rows, filename = "brasil-bi.xlsx", sheetName = "Dados") {
  const blob = await writeSimpleXlsx(columns, rows, sheetName);
  downloadBlob(blob, filename);
}

export function exportJson(rows, filename = "brasil-bi.json") {
  downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), filename);
}

/* ------------------------------------------------------------------- PNG -- */

const SVG_STYLE = `
  text { font-family: Inter, "Segoe UI", system-ui, sans-serif; }
  .axis-label { font-size: 10px; }
  .value-label { font-size: 10px; font-weight: 600; }
  .grid-line { stroke-width: 1; }
  .line-path { fill: none; stroke-width: 2.25; stroke-linejoin: round; }
  .area-path { stroke: none; opacity: .22; }
`;

/** Copia as cores computadas para dentro do SVG (que sai do contexto do CSS). */
function inlineSvgColors(source, clone) {
  const originals = source.querySelectorAll("*");
  const clones = clone.querySelectorAll("*");
  originals.forEach((node, i) => {
    const target = clones[i];
    if (!target) return;
    const computed = getComputedStyle(node);
    if (node.tagName === "text") target.setAttribute("fill", node.getAttribute("fill") || computed.fill);
    if (["line", "path", "rect", "circle"].includes(node.tagName)) {
      const stroke = node.getAttribute("stroke");
      if (!stroke || stroke.startsWith("var(")) {
        if (computed.stroke && computed.stroke !== "none") target.setAttribute("stroke", computed.stroke);
      }
      const fill = node.getAttribute("fill");
      if (!fill || fill.startsWith("var(")) {
        if (computed.fill && computed.fill !== "none") target.setAttribute("fill", computed.fill);
      }
    }
  });
}

/**
 * Exporta um gráfico SVG como PNG em alta resolução.
 * @param {HTMLElement} vizElement contêiner `.viz`
 * @param {{filename?:string, scale?:number, background?:string}} [opts]
 */
export async function exportChartPng(vizElement, opts = {}) {
  const svgNode = vizElement.querySelector("svg");
  if (!svgNode) {
    toast("Este componente não é vetorial", {
      level: "warn",
      message: "Tabelas, mapas e nuvem de palavras podem ser exportados em CSV ou incluídos no PDF do dashboard.",
    });
    return false;
  }

  const rect = svgNode.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(200, Math.round(rect.height));
  const scale = opts.scale || 2.5;

  const clone = svgNode.cloneNode(true);
  inlineSvgColors(svgNode, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = SVG_STYLE;
  clone.prepend(style);

  const source = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Falha ao converter o gráfico"));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const gc = canvas.getContext("2d");
  gc.fillStyle = opts.background || getComputedStyle(document.body).getPropertyValue("--surface-solid") || "#fff";
  gc.fillRect(0, 0, canvas.width, canvas.height);
  gc.drawImage(image, 0, 0, canvas.width, canvas.height);

  await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, opts.filename || "grafico.png");
      resolve();
    }, "image/png");
  });
  return true;
}

/* ------------------------------------------------------------------- PDF -- */

/**
 * Gera o relatório em PDF via impressão do navegador.
 * @param {{
 *  title:string, subtitle?:string, orientation?:"retrato"|"paisagem",
 *  margins?:string, logo?:string, author?:string, notes?:string,
 *  filters?:string[], summary?:string, content:HTMLElement
 * }} config
 */
export function exportPdf(config) {
  const {
    title,
    subtitle = "",
    orientation = "paisagem",
    margins = "12mm",
    logo = "",
    author = "",
    notes = "",
    filters = [],
    summary = "",
    content,
  } = config;

  const win = window.open("", "_blank", "width=1200,height=860");
  if (!win) {
    toast("Não foi possível abrir a janela de impressão", {
      level: "error",
      message: "Verifique se o navegador está bloqueando pop-ups para este site.",
    });
    return false;
  }

  // Reaproveita as folhas de estilo da aplicação para manter a identidade visual.
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => `<link rel="stylesheet" href="${link.href}">`)
    .join("");

  const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "light";
  const clone = content.cloneNode(true);
  clone.querySelectorAll(".tile__tools, .tile__resize, .no-print").forEach((n) => n.remove());

  win.document.write(`<!doctype html>
<html lang="pt-BR" data-theme="${theme}">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
${styles}
<style>
  @page { size: A4 ${orientation === "paisagem" ? "landscape" : "portrait"}; margin: ${margins}; }
  body { background: #fff; padding: 0; }
  .report-head { display:flex; align-items:center; gap:16px; border-bottom:2px solid #00b64a; padding-bottom:10px; margin-bottom:16px; }
  .report-head img { height:38px; }
  .report-title { font-size:20px; font-weight:700; }
  .report-sub { font-size:12px; color:#4a5a72; }
  .report-meta { margin-left:auto; text-align:right; font-size:11px; color:#4a5a72; line-height:1.5; }
  .report-filters { font-size:11px; color:#4a5a72; margin-bottom:14px; }
  .report-filters b { color:#101828; }
  .report-summary { font-size:12px; line-height:1.6; border-left:3px solid #ffd700; padding:6px 12px; margin-bottom:16px; background:#fffdf2; }
  .report-notes { margin-top:18px; font-size:11px; color:#4a5a72; white-space:pre-wrap; }
  .report-foot { margin-top:22px; padding-top:8px; border-top:1px solid #d5dbe4; font-size:10px; color:#6d7d93; display:flex; justify-content:space-between; }
  .tile { break-inside: avoid; page-break-inside: avoid; }
  .dash-grid { gap:10px; }
</style>
</head>
<body>
  <div class="report-head">
    ${logo ? `<img src="${esc(logo)}" alt="Logomarca">` : ""}
    <div>
      <div class="report-title">${esc(title)}</div>
      ${subtitle ? `<div class="report-sub">${esc(subtitle)}</div>` : ""}
    </div>
    <div class="report-meta">
      <div>Gerado em ${fmtDate(new Date(), "datetime")}</div>
      ${author ? `<div>Responsável: ${esc(author)}</div>` : ""}
    </div>
  </div>
  ${
    filters.length
      ? `<div class="report-filters"><b>Filtros aplicados:</b> ${filters.map(esc).join(" • ")}</div>`
      : `<div class="report-filters"><b>Filtros aplicados:</b> nenhum (todos os dados)</div>`
  }
  ${summary ? `<div class="report-summary">${esc(summary)}</div>` : ""}
  <div id="report-body"></div>
  ${notes ? `<div class="report-notes"><b>Observações:</b>\n${esc(notes)}</div>` : ""}
  <div class="report-foot"><span>Brasil BI</span><span>${esc(title)}</span></div>
</body>
</html>`);
  win.document.close();
  win.document.getElementById("report-body").append(win.document.importNode(clone, true));

  // Espera as folhas de estilo carregarem antes de imprimir.
  const start = Date.now();
  const tryPrint = () => {
    if (win.document.readyState === "complete" || Date.now() - start > 2500) {
      win.focus();
      win.print();
    } else {
      setTimeout(tryPrint, 120);
    }
  };
  setTimeout(tryPrint, 350);
  return true;
}

/* --------------------------------------------------- link compartilhável -- */

/**
 * Gera um link com o estado de visualização (dashboard + filtros) codificado.
 * O conteúdo dos dados NÃO vai na URL — apenas a configuração de visualização.
 */
export function buildShareLink({ dashboardId, filters, period, theme }) {
  const payload = { d: dashboardId, f: filters, p: period, t: theme, v: 1 };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(window.location.href);
  url.hash = `#/compartilhado/${encoded}`;
  return url.toString();
}

export function parseShareLink(hash) {
  const match = String(hash).match(/#\/compartilhado\/(.+)$/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(match[1]))));
  } catch {
    return null;
  }
}

/** Converte os dados de um gráfico em linhas exportáveis. */
export function chartDataToRows(data) {
  if (!data || data.kind !== "grouped") return { columns: [], rows: [] };
  const columns = [data.dimension.label, ...data.series.map((s) => s.name)];
  const rows = data.categories.map((cat, i) => {
    const row = { [data.dimension.label]: cat.label };
    data.series.forEach((s) => {
      row[s.name] = s.values[i];
    });
    return row;
  });
  return { columns, rows };
}

export { fmtByType, el };
