/**
 * Brasil BI — gráficos cartesianos: colunas, barras, linhas, áreas,
 * empilhados, combinado, dispersão, bolhas, cascata, histograma e sparkline.
 */

import {
  svg,
  createCanvas,
  linearScale,
  bandScale,
  niceDomain,
  drawYAxis,
  drawXLabels,
  linePath,
  areaPath,
  roundedRectPath,
  bindTip,
  truncate,
} from "./svg.js";
import { fmtCompact, isFiniteNumber } from "../core/utils.js";

const HORIZONTAL = new Set(["bar", "barStacked"]);
const STACKED = new Set(["columnStacked", "barStacked", "areaStacked", "percentStacked"]);

/**
 * Renderiza um gráfico cartesiano.
 * @param {Object} ctx contexto criado em charts/index.js
 * @param {string} mode column|bar|columnStacked|barStacked|line|area|areaStacked|combo|percentStacked
 */
export function renderCartesian(ctx, mode) {
  const { data, width, height, options } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const horizontal = HORIZONTAL.has(mode);
  const stacked = STACKED.has(mode);
  const percent = mode === "percentStacked";
  const showValues = options.showValues && categories.length * series.length <= 40;

  // Domínio dos valores
  let minValue = 0;
  let maxValue = 0;
  if (stacked) {
    categories.forEach((_, i) => {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[i];
        if (!isFiniteNumber(v)) continue;
        if (v >= 0) pos += v;
        else neg += v;
      }
      maxValue = Math.max(maxValue, percent ? 100 : pos);
      minValue = Math.min(minValue, percent ? 0 : neg);
    });
  } else {
    for (const s of series) {
      for (const v of s.values) {
        if (!isFiniteNumber(v)) continue;
        maxValue = Math.max(maxValue, v);
        minValue = Math.min(minValue, v);
      }
    }
  }
  // Combinado: as séries de linha ganham um eixo próprio à direita, senão a
  // série de menor magnitude vira uma linha rente ao zero.
  const lineIdx = mode === "combo" ? options.lineSeries || [series.length - 1] : [];
  const isLineSeries = (i) => lineIdx.includes(i);

  if (mode === "combo") {
    minValue = 0;
    maxValue = 0;
    series.forEach((s2, i) => {
      if (isLineSeries(i)) return;
      for (const v of s2.values) {
        if (!isFiniteNumber(v)) continue;
        maxValue = Math.max(maxValue, v);
        minValue = Math.min(minValue, v);
      }
    });
  }

  const domain = percent ? [0, 100] : niceDomain(minValue, maxValue);

  let secondaryDomain = null;
  if (mode === "combo" && lineIdx.length) {
    let lo = 0;
    let hi = 0;
    series.forEach((s2, i) => {
      if (!isLineSeries(i)) return;
      for (const v of s2.values) {
        if (!isFiniteNumber(v)) continue;
        hi = Math.max(hi, v);
        lo = Math.min(lo, v);
      }
    });
    secondaryDomain = niceDomain(lo, hi);
  }

  const longestLabel = Math.max(...categories.map((c) => String(c.label).length), 4);
  const margin = horizontal
    ? { left: Math.min(150, Math.max(60, longestLabel * 6.2)), bottom: 28, right: 24, top: 10 }
    : { left: 52, bottom: categories.length > 6 ? 46 : 30, right: secondaryDomain ? 50 : 16, top: 14 };

  const canvas = createCanvas({ width, height, margin });
  const { plot, innerWidth, innerHeight } = canvas;

  const axisFormat = (v) => (percent ? `${Math.round(v)}%` : fmtCompact(v));

  let bandAxis;
  let valueScale;
  if (horizontal) {
    bandAxis = bandScale(categories.length, [0, innerHeight], 0.28);
    valueScale = linearScale(domain, [0, innerWidth]);
    // grade vertical
    for (const value of ticksOf(domain)) {
      const x = valueScale(value);
      plot.append(svg("line", { class: "grid-line", x1: x, x2: x, y1: 0, y2: innerHeight }));
      plot.append(svg("text", { class: "axis-label", x, y: innerHeight + 15, "text-anchor": "middle" }, axisFormat(value)));
    }
    categories.forEach((cat, i) => {
      plot.append(
        svg(
          "text",
          {
            class: "axis-label",
            x: -8,
            y: bandAxis(i) + bandAxis.bandwidth / 2 + 3.5,
            "text-anchor": "end",
          },
          truncate(cat.label, margin.left - 12, 10)
        )
      );
    });
  } else {
    bandAxis = bandScale(categories.length, [0, innerWidth], mode.includes("line") || mode.includes("area") ? 0 : 0.26);
    valueScale = linearScale(domain, [innerHeight, 0]);
    drawYAxis(plot, valueScale, domain, innerWidth, axisFormat);
    drawXLabels(plot, categories.map((c) => c.label), bandAxis, innerHeight, { maxWidth: bandAxis.step });
  }

  const zero = horizontal ? valueScale(0) : valueScale(0);

  /* -------------------------------------------------- barras / colunas ---- */
  const drawBars = (barSeries, seriesOffsetIndex, totalBarSeries) => {
    const groupWidth = bandAxis.bandwidth;
    const subWidth = stacked ? groupWidth : groupWidth / Math.max(1, totalBarSeries);
    const stackPos = new Array(categories.length).fill(0);
    const stackNeg = new Array(categories.length).fill(0);

    barSeries.forEach((s, sIdx) => {
      const color = ctx.colorFor(s.paletteIndex ?? sIdx);
      categories.forEach((cat, i) => {
        let value = s.values[i];
        if (!isFiniteNumber(value)) return;
        if (percent) {
          const total = series.reduce((acc, other) => acc + (isFiniteNumber(other.values[i]) ? Math.abs(other.values[i]) : 0), 0);
          value = total ? (value / total) * 100 : 0;
        }

        let node;
        if (horizontal) {
          const y = stacked ? bandAxis(i) : bandAxis(i) + sIdx * subWidth;
          const h = stacked ? groupWidth : subWidth * 0.86;
          let x0;
          let x1;
          if (stacked) {
            const base = value >= 0 ? stackPos[i] : stackNeg[i];
            x0 = valueScale(base);
            x1 = valueScale(base + value);
            if (value >= 0) stackPos[i] += value;
            else stackNeg[i] += value;
          } else {
            x0 = valueScale(Math.min(0, value));
            x1 = valueScale(Math.max(0, value));
          }
          const w = Math.abs(x1 - x0);
          node = svg("path", {
            class: "mark",
            d: roundedRectPath(Math.min(x0, x1), y, Math.max(1, w), h, 4, "right"),
            fill: color,
          });
        } else {
          const x = stacked ? bandAxis(i) : bandAxis(i) + sIdx * subWidth;
          const w = stacked ? groupWidth : subWidth * 0.86;
          let y0;
          let y1;
          if (stacked) {
            const base = value >= 0 ? stackPos[i] : stackNeg[i];
            y0 = valueScale(base);
            y1 = valueScale(base + value);
            if (value >= 0) stackPos[i] += value;
            else stackNeg[i] += value;
          } else {
            y0 = valueScale(Math.min(0, value));
            y1 = valueScale(Math.max(0, value));
          }
          const h = Math.abs(y1 - y0);
          node = svg("path", {
            class: "mark",
            d: roundedRectPath(x, Math.min(y0, y1), Math.max(1, w), Math.max(1, h), 4, "top"),
            fill: color,
          });
        }

        ctx.decorateMark(node, cat, s, s.values[i]);
        plot.append(node);

        if (showValues && !stacked) {
          const rawValue = s.values[i];
          const text = ctx.fmtValue(rawValue, s.measure, { compact: true });
          if (horizontal) {
            const x = valueScale(Math.max(0, rawValue)) + 5;
            plot.append(
              svg("text", { class: "value-label", x, y: bandAxis(i) + sIdx * subWidth + subWidth / 2 + 3 }, text)
            );
          } else {
            plot.append(
              svg(
                "text",
                {
                  class: "value-label",
                  x: bandAxis(i) + sIdx * subWidth + subWidth * 0.43,
                  y: valueScale(Math.max(0, rawValue)) - 5,
                  "text-anchor": "middle",
                },
                text
              )
            );
          }
        }
      });
    });
  };

  /* ---------------------------------------------------- linhas / áreas ---- */
  const drawLines = (lineSeries, filled, scaleOverride) => {
    const scale = scaleOverride || valueScale;
    lineSeries.forEach((s, sIdx) => {
      const color = ctx.colorFor(s.paletteIndex ?? sIdx);
      const points = [];
      s.values.forEach((value, i) => {
        if (!isFiniteNumber(value)) return;
        const x = bandAxis(i) + bandAxis.bandwidth / 2;
        points.push({ x, y: scale(value), value, index: i });
      });
      if (!points.length) return;

      if (filled) {
        plot.append(
          svg("path", {
            class: "area-path",
            d: areaPath(points, innerHeight, { curve: options.smooth !== false }),
            fill: color,
          })
        );
      }
      plot.append(
        svg("path", {
          class: "line-path",
          d: linePath(points, { curve: options.smooth !== false }),
          stroke: color,
        })
      );

      const showPoints = options.showPoints !== false && points.length <= 60;
      points.forEach((p) => {
        const cat = categories[p.index];
        const node = svg("circle", {
          class: "mark point",
          cx: p.x,
          cy: p.y,
          r: showPoints ? 3.4 : 8,
          fill: showPoints ? color : "transparent",
          stroke: showPoints ? undefined : "transparent",
        });
        ctx.decorateMark(node, cat, s, p.value);
        plot.append(node);
        if (showValues) {
          plot.append(
            svg("text", { class: "value-label", x: p.x, y: p.y - 9, "text-anchor": "middle" }, ctx.fmtValue(p.value, s.measure, { compact: true }))
          );
        }
      });
    });
  };

  if (mode === "combo") {
    const barSeries = series.filter((s, i) => !isLineSeries(i));
    const lineSeries = series.filter((s, i) => isLineSeries(i));
    [...barSeries, ...lineSeries].forEach((s) => {
      s.paletteIndex = series.indexOf(s);
    });

    let secondaryScale = valueScale;
    if (secondaryDomain) {
      secondaryScale = linearScale(secondaryDomain, [innerHeight, 0]);
      // Eixo secundário à direita, na cor da primeira série de linha.
      const axisColor = ctx.colorFor(lineSeries[0]?.paletteIndex ?? 1);
      for (const value of ticksOf(secondaryDomain)) {
        plot.append(
          svg("text", {
            class: "axis-label",
            x: innerWidth + 8,
            y: secondaryScale(value) + 3.5,
            fill: axisColor,
          }, fmtCompact(value))
        );
      }
      plot.append(
        svg("line", { class: "axis-line", x1: innerWidth, x2: innerWidth, y1: 0, y2: innerHeight, stroke: axisColor, opacity: 0.4 })
      );
    }

    drawBars(barSeries, 0, barSeries.length);
    drawLines(lineSeries, false, secondaryScale);
  } else if (mode === "line") {
    drawLines(series, false);
  } else if (mode === "area" || mode === "areaStacked") {
    if (mode === "areaStacked") {
      // Converte em séries acumuladas para desenhar as áreas empilhadas.
      const cumulative = [];
      const running = new Array(categories.length).fill(0);
      series.forEach((s, sIdx) => {
        const values = s.values.map((v, i) => {
          running[i] += isFiniteNumber(v) ? v : 0;
          return running[i];
        });
        cumulative.push({ ...s, values, paletteIndex: sIdx, original: s.values });
      });
      cumulative.reverse().forEach((s) => drawLines([s], true));
    } else {
      drawLines(series, true);
    }
  } else {
    series.forEach((s, i) => {
      s.paletteIndex = i;
    });
    drawBars(series, 0, series.length);
  }

  // Linha do zero quando há valores negativos
  if (domain[0] < 0) {
    if (horizontal) plot.append(svg("line", { class: "axis-line", x1: zero, x2: zero, y1: 0, y2: innerHeight }));
    else plot.append(svg("line", { class: "axis-line", x1: 0, x2: innerWidth, y1: zero, y2: zero }));
  }

  return canvas.root;
}

function ticksOf(domain) {
  const [lo, hi] = domain;
  const step = (hi - lo) / 5;
  const out = [];
  for (let i = 0; i <= 5; i += 1) out.push(lo + step * i);
  return out;
}

/* ------------------------------------------------------------- dispersão -- */

export function renderScatter(ctx, { bubble = false } = {}) {
  const { data, width, height } = ctx;
  const categories = data.categories || [];
  const series = data.series || [];
  if (!categories.length || series.length < 2) {
    return ctx.emptyMessage("Dispersão exige pelo menos duas medidas (eixo X e eixo Y).");
  }

  const xs = series[0].values;
  const ys = series[1].values;
  const sizes = bubble && series[2] ? series[2].values : null;

  const xDomain = niceDomain(Math.min(...xs.filter(isFiniteNumber)), Math.max(...xs.filter(isFiniteNumber)), { zeroBase: false });
  const yDomain = niceDomain(Math.min(...ys.filter(isFiniteNumber)), Math.max(...ys.filter(isFiniteNumber)), { zeroBase: false });

  const canvas = createCanvas({ width, height, margin: { left: 56, bottom: 34, right: 18, top: 14 } });
  const { plot, innerWidth, innerHeight } = canvas;
  const xScale = linearScale(xDomain, [0, innerWidth]);
  const yScale = linearScale(yDomain, [innerHeight, 0]);

  drawYAxis(plot, yScale, yDomain, innerWidth, fmtCompact);
  for (const value of ticksOf(xDomain)) {
    const x = xScale(value);
    plot.append(svg("line", { class: "grid-line", x1: x, x2: x, y1: 0, y2: innerHeight }));
    plot.append(svg("text", { class: "axis-label", x, y: innerHeight + 16, "text-anchor": "middle" }, fmtCompact(value)));
  }
  plot.append(
    svg("text", { class: "axis-label", x: innerWidth / 2, y: innerHeight + 30, "text-anchor": "middle" }, series[0].name)
  );
  plot.append(
    svg("text", { class: "axis-label", x: -innerHeight / 2, y: -40, "text-anchor": "middle", transform: `rotate(-90)` }, series[1].name)
  );

  const maxSize = sizes ? Math.max(...sizes.filter(isFiniteNumber), 1) : 1;

  categories.forEach((cat, i) => {
    const x = xs[i];
    const y = ys[i];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return;
    const r = sizes ? 4 + Math.sqrt(Math.max(0, sizes[i] || 0) / maxSize) * 18 : 5;
    const node = svg("circle", {
      class: "mark",
      cx: xScale(x),
      cy: yScale(y),
      r,
      fill: ctx.colorFor(i),
      "fill-opacity": 0.78,
    });
    ctx.decorateMark(node, cat, series[0], x, {
      extraRows: [
        { label: series[0].name, value: ctx.fmtValue(x, series[0].measure) },
        { label: series[1].name, value: ctx.fmtValue(y, series[1].measure) },
        ...(sizes ? [{ label: series[2].name, value: ctx.fmtValue(sizes[i], series[2].measure) }] : []),
      ],
    });
    plot.append(node);
  });

  return canvas.root;
}

/* --------------------------------------------------------------- cascata -- */

export function renderWaterfall(ctx) {
  const { data, width, height } = ctx;
  const categories = data.categories || [];
  const series = data.series || [];
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const values = series[0].values.map((v) => (isFiniteNumber(v) ? v : 0));
  const steps = [];
  let running = 0;
  values.forEach((v, i) => {
    steps.push({ start: running, end: running + v, value: v, index: i });
    running += v;
  });
  steps.push({ start: 0, end: running, value: running, index: values.length, isTotal: true });

  const allValues = steps.flatMap((s) => [s.start, s.end]);
  const domain = niceDomain(Math.min(...allValues), Math.max(...allValues));

  const canvas = createCanvas({ width, height, margin: { left: 54, bottom: 44, right: 14, top: 14 } });
  const { plot, innerWidth, innerHeight } = canvas;
  const band = bandScale(steps.length, [0, innerWidth], 0.3);
  const scale = linearScale(domain, [innerHeight, 0]);
  drawYAxis(plot, scale, domain, innerWidth, fmtCompact);
  drawXLabels(
    plot,
    [...categories.map((c) => c.label), "Total"],
    band,
    innerHeight,
    { maxWidth: band.step }
  );

  steps.forEach((step) => {
    const y0 = scale(step.start);
    const y1 = scale(step.end);
    const positive = step.value >= 0;
    const color = step.isTotal ? ctx.colorFor(1) : positive ? ctx.positiveColor() : ctx.negativeColor();
    const node = svg("path", {
      class: "mark",
      d: roundedRectPath(band(step.index), Math.min(y0, y1), band.bandwidth, Math.max(2, Math.abs(y1 - y0)), 3, "all"),
      fill: color,
    });
    const cat = categories[step.index] || { key: "__total__", label: "Total" };
    ctx.decorateMark(node, cat, series[0], step.value);
    plot.append(node);
    plot.append(
      svg(
        "text",
        { class: "value-label", x: band(step.index) + band.bandwidth / 2, y: Math.min(y0, y1) - 5, "text-anchor": "middle" },
        ctx.fmtValue(step.value, series[0].measure, { compact: true })
      )
    );
    if (!step.isTotal && step.index < steps.length - 2) {
      plot.append(
        svg("line", {
          class: "grid-line",
          x1: band(step.index) + band.bandwidth,
          x2: band(step.index + 1),
          y1: y1,
          y2: y1,
          "stroke-dasharray": "3 3",
        })
      );
    }
  });

  return canvas.root;
}

/* ------------------------------------------------------------ histograma -- */

export function renderHistogram(ctx) {
  const { data, width, height } = ctx;
  const buckets = data.histogram || [];
  if (!buckets.length) return ctx.emptyMessage("Selecione um campo numérico para ver a distribuição.");

  const canvas = createCanvas({ width, height, margin: { left: 46, bottom: 42, right: 14, top: 14 } });
  const { plot, innerWidth, innerHeight } = canvas;
  const maxCount = Math.max(...buckets.map((b) => b.count));
  const band = bandScale(buckets.length, [0, innerWidth], 0.08);
  const scale = linearScale([0, maxCount], [innerHeight, 0]);
  drawYAxis(plot, scale, [0, maxCount], innerWidth, (v) => fmtCompact(Math.round(v)));
  drawXLabels(plot, buckets.map((b) => fmtCompact(b.from)), band, innerHeight, { maxWidth: band.step });

  buckets.forEach((bucket, i) => {
    const y = scale(bucket.count);
    const node = svg("path", {
      class: "mark",
      d: roundedRectPath(band(i), y, band.bandwidth, innerHeight - y, 3, "top"),
      fill: ctx.colorFor(0),
    });
    bindTip(node, () => ({
      title: `${fmtCompact(bucket.from)} a ${fmtCompact(bucket.to)}`,
      rows: [{ label: "Registros", value: String(bucket.count), color: ctx.colorFor(0) }],
    }));
    plot.append(node);
  });
  return canvas.root;
}

/* ------------------------------------------------------------- sparkline -- */

/** Mini gráfico sem eixos, usado nos cartões de KPI. */
export function renderSparkline(points, { width = 160, height = 34, color = "#00e05c", area = true }) {
  if (!points || points.length < 2) return null;
  const ys = points.map((p) => p.y).filter(isFiniteNumber);
  if (!ys.length) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const xScale = linearScale([0, points.length - 1], [1, width - 1]);
  const yScale = linearScale([min === max ? min - 1 : min, max === min ? max + 1 : max], [height - 3, 3]);
  const coords = points.map((p, i) => ({ x: xScale(i), y: yScale(p.y ?? min) }));

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", class: "spark", "aria-hidden": "true" });
  if (area) {
    root.append(svg("path", { d: areaPath(coords, height, { curve: true }), fill: color, opacity: 0.16 }));
  }
  root.append(svg("path", { d: linePath(coords, { curve: true }), fill: "none", stroke: color, "stroke-width": 1.8, "stroke-linecap": "round" }));
  const last = coords[coords.length - 1];
  root.append(svg("circle", { cx: last.x, cy: last.y, r: 2.6, fill: color }));
  return root;
}
