/**
 * Brasil BI — utilidades de desenho SVG (escalas, eixos, caminhos, tooltip).
 * Base compartilhada por toda a biblioteca de gráficos.
 */

import { el } from "../core/utils.js";

const NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on:")) node.addEventListener(key.slice(3), value);
    else node.setAttribute(key, String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/* ------------------------------------------------------------------ escalas */

export function linearScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = (v) => r0 + ((v - d0) / span) * (r1 - r0);
  scale.invert = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * span;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

export function bandScale(count, range, padding = 0.22) {
  const [r0, r1] = range;
  const total = r1 - r0;
  const step = total / Math.max(1, count);
  const bandwidth = step * (1 - padding);
  const scale = (i) => r0 + i * step + (step - bandwidth) / 2;
  scale.bandwidth = bandwidth;
  scale.step = step;
  scale.indexAt = (pos) => Math.floor((pos - r0) / step);
  return scale;
}

/** Domínio "bonito" com zero incluído quando fizer sentido. */
export function niceDomain(min, max, { zeroBase = true } = {}) {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 1;
  if (zeroBase) {
    if (lo > 0) lo = 0;
    if (hi < 0) hi = 0;
  }
  if (lo === hi) {
    if (lo === 0) return [0, 1];
    lo = Math.min(0, lo * 1.2);
    hi = Math.max(0, hi * 1.2);
  }
  const span = hi - lo;
  const step = niceStep(span / 5);
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export function niceStep(rough) {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = 10 ** exp;
  const frac = rough / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return nice * base;
}

export function ticks(domain, count = 5) {
  const [lo, hi] = domain;
  const step = niceStep((hi - lo) / count);
  const out = [];
  const start = Math.ceil(lo / step) * step;
  for (let v = start; v <= hi + step * 0.001; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(10)));
  }
  return out;
}

/* ------------------------------------------------------------------ textos */

/** Largura aproximada de um texto (evita reflow com getBBox). */
export function textWidth(text, fontSize = 10.5) {
  return String(text).length * fontSize * 0.56;
}

export function truncate(text, maxWidth, fontSize = 10.5) {
  const str = String(text ?? "");
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.56)));
  return str.length > maxChars ? `${str.slice(0, Math.max(1, maxChars - 1))}…` : str;
}

/* ---------------------------------------------------------------- caminhos */

export function linePath(points, { curve = false } = {}) {
  if (!points.length) return "";
  if (!curve || points.length < 3) {
    return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  }
  // Curva suave (Catmull-Rom convertida em Bézier cúbica)
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

export function areaPath(points, baseline, opts) {
  if (!points.length) return "";
  const top = linePath(points, opts);
  const last = points[points.length - 1];
  const first = points[0];
  return `${top} L${last.x.toFixed(2)},${baseline.toFixed(2)} L${first.x.toFixed(2)},${baseline.toFixed(2)} Z`;
}

export function roundedRectPath(x, y, w, h, r = 3, corners = "top") {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  if (radius === 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  if (corners === "top") {
    return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
  }
  if (corners === "right") {
    return `M${x},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h - radius} Q${x + w},${y + h} ${x + w - radius},${y + h} L${x},${y + h} Z`;
  }
  return `M${x + radius},${y} h${w - 2 * radius} a${radius},${radius} 0 0 1 ${radius},${radius} v${h - 2 * radius} a${radius},${radius} 0 0 1 ${-radius},${radius} h${-(w - 2 * radius)} a${radius},${radius} 0 0 1 ${-radius},${-radius} v${-(h - 2 * radius)} a${radius},${radius} 0 0 1 ${radius},${-radius} Z`;
}

export function polarPoint(cx, cy, radius, angle) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/** Setor de anel entre dois ângulos (radianos, 0 = 3h, sentido horário). */
export function arcPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const p0 = polarPoint(cx, cy, outerR, startAngle);
  const p1 = polarPoint(cx, cy, outerR, endAngle);
  const p2 = polarPoint(cx, cy, innerR, endAngle);
  const p3 = polarPoint(cx, cy, innerR, startAngle);
  if (innerR <= 0.01) {
    return `M${cx},${cy} L${p0.x},${p0.y} A${outerR},${outerR} 0 ${large} 1 ${p1.x},${p1.y} Z`;
  }
  return `M${p0.x},${p0.y} A${outerR},${outerR} 0 ${large} 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${innerR},${innerR} 0 ${large} 0 ${p3.x},${p3.y} Z`;
}

/* ---------------------------------------------------------------- tooltip */

let tipNode = null;

function ensureTip() {
  if (!tipNode) {
    tipNode = el("div.viz-tip", { role: "tooltip" });
    document.body.append(tipNode);
  }
  return tipNode;
}

/**
 * @param {MouseEvent} event
 * @param {{title:string, rows:Array<{label:string,value:string,color?:string}>, hint?:string}} content
 */
export function showTip(event, content) {
  const node = ensureTip();
  node.replaceChildren(
    el("div.viz-tip__title", { text: content.title }),
    ...content.rows.map((row) =>
      el("div.viz-tip__row", {}, [
        row.color ? el("span.viz-tip__sw", { style: { background: row.color } }) : null,
        el("span", { text: row.label }),
        el("b", { text: row.value }),
      ])
    ),
    content.hint ? el("div.viz-tip__hint", { text: content.hint }) : null
  );
  node.classList.add("is-visible");
  moveTip(event);
}

export function moveTip(event) {
  if (!tipNode) return;
  const pad = 14;
  const rect = tipNode.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
  tipNode.style.left = `${Math.max(8, x)}px`;
  tipNode.style.top = `${Math.max(8, y)}px`;
}

export function hideTip() {
  tipNode?.classList.remove("is-visible");
}

/** Liga os eventos de tooltip a um elemento SVG. */
export function bindTip(node, contentFn) {
  node.addEventListener("mouseenter", (e) => showTip(e, contentFn()));
  node.addEventListener("mousemove", moveTip);
  node.addEventListener("mouseleave", hideTip);
  node.addEventListener("focus", (e) => {
    const rect = node.getBoundingClientRect();
    showTip({ clientX: rect.left + rect.width / 2, clientY: rect.top }, contentFn());
  });
  node.addEventListener("blur", hideTip);
  return node;
}

/* ------------------------------------------------------------------ layout */

/**
 * Cria o SVG raiz responsivo e devolve helpers de área de plotagem.
 * @param {{width:number,height:number,margin:Object}} config
 */
export function createCanvas({ width, height, margin }) {
  const m = { top: 12, right: 14, bottom: 26, left: 44, ...margin };
  const root = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
  });
  const plot = svg("g", { transform: `translate(${m.left},${m.top})` });
  root.append(plot);
  return {
    root,
    plot,
    margin: m,
    innerWidth: Math.max(10, width - m.left - m.right),
    innerHeight: Math.max(10, height - m.top - m.bottom),
  };
}

/** Grade horizontal + rótulos do eixo Y. */
export function drawYAxis(plot, scale, domain, innerWidth, formatter, count = 5) {
  const values = ticks(domain, count);
  for (const value of values) {
    const y = scale(value);
    plot.append(svg("line", { class: "grid-line", x1: 0, x2: innerWidth, y1: y, y2: y }));
    plot.append(
      svg("text", { class: "axis-label", x: -8, y: y + 3.5, "text-anchor": "end" }, formatter(value))
    );
  }
  return values;
}

/** Rótulos do eixo X com rotação automática quando não couberem. */
export function drawXLabels(plot, labels, scale, innerHeight, { rotate = "auto", maxWidth } = {}) {
  const bandwidth = maxWidth ?? scale.bandwidth ?? 40;
  const needRotate =
    rotate === true || (rotate === "auto" && labels.some((l) => textWidth(l, 10) > bandwidth * 1.05));
  labels.forEach((label, i) => {
    const x = (scale(i) ?? 0) + (scale.bandwidth ? scale.bandwidth / 2 : 0);
    if (needRotate) {
      plot.append(
        svg(
          "text",
          {
            class: "axis-label",
            x,
            y: innerHeight + 10,
            "text-anchor": "end",
            transform: `rotate(-38 ${x} ${innerHeight + 10})`,
          },
          truncate(label, 84, 10)
        )
      );
    } else {
      plot.append(
        svg("text", { class: "axis-label", x, y: innerHeight + 15, "text-anchor": "middle" }, truncate(label, bandwidth * 1.5, 10))
      );
    }
  });
  return needRotate;
}
