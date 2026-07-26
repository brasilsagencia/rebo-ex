/**
 * Brasil BI — gráficos radiais: pizza, rosca, velocímetro, radar e funil.
 */

import { svg, arcPath, polarPoint, linePath, truncate } from "./svg.js";
import { fmtPercent, isFiniteNumber } from "../core/utils.js";

/* --------------------------------------------------------- pizza e rosca -- */

/**
 * @param {Object} ctx
 * @param {{donut?:boolean}} opts
 */
export function renderPie(ctx, { donut = false } = {}) {
  const { data, width, height, options } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const measure = series[0];
  const slices = categories
    .map((cat, i) => ({ cat, value: measure.values[i] }))
    .filter((s) => isFiniteNumber(s.value) && s.value > 0);

  if (!slices.length) return ctx.emptyMessage("Não há valores positivos para compor o gráfico.");

  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const outerR = size / 2 - 8;
  const innerR = donut ? outerR * (options.donutRatio || 0.62) : 0;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "xMidYMid meet", role: "img" });
  let angle = -Math.PI / 2;

  slices.forEach((slice, i) => {
    const share = slice.value / total;
    const end = angle + share * Math.PI * 2;
    const node = svg("path", {
      class: "mark",
      d: arcPath(cx, cy, innerR, outerR, angle, end - 0.004),
      fill: ctx.colorFor(i),
      stroke: "var(--surface-solid)",
      "stroke-width": 1.5,
    });
    ctx.decorateMark(node, slice.cat, measure, slice.value, {
      extraRows: [{ label: "Participação", value: fmtPercent(share * 100) }],
    });
    root.append(node);

    // Rótulo externo apenas em fatias relevantes.
    if (share >= 0.06) {
      const mid = (angle + end) / 2;
      const labelR = innerR + (outerR - innerR) * 0.62;
      const p = polarPoint(cx, cy, labelR, mid);
      root.append(
        svg(
          "text",
          {
            class: "value-label",
            x: p.x,
            y: p.y + 3,
            "text-anchor": "middle",
            fill: "#0b1220",
            style: "paint-order:stroke;stroke:rgba(255,255,255,.55);stroke-width:2.5px",
          },
          fmtPercent(share * 100, share >= 0.1 ? 0 : 1)
        )
      );
    }
    angle = end;
  });

  if (donut) {
    const centerValue = options.centerValue === "count" ? String(data.rowCount) : ctx.fmtValue(total, measure.measure, { compact: true });
    root.append(
      svg("text", { x: cx, y: cy - 2, "text-anchor": "middle", class: "value-label", style: "font-size:17px" }, centerValue)
    );
    root.append(
      svg("text", { x: cx, y: cy + 15, "text-anchor": "middle", class: "axis-label" }, truncate(options.centerLabel || "Total", innerR * 1.8, 10))
    );
  }

  return root;
}

/* -------------------------------------------------------------- velocímetro */

/**
 * Velocímetro / medidor com faixas de meta.
 * @param {Object} ctx  espera ctx.gauge = {value, min, max, goal, label, type}
 */
export function renderGauge(ctx) {
  const { width, height, gauge } = ctx;
  if (!gauge || !isFiniteNumber(gauge.value)) return ctx.emptyMessage("Sem valor para exibir no medidor.");

  const min = gauge.min ?? 0;
  const max = gauge.max ?? (Math.max(gauge.goal || 0, gauge.value) * 1.25 || 1);
  const ratio = Math.max(0, Math.min(1, (gauge.value - min) / (max - min || 1)));

  const cx = width / 2;
  const size = Math.min(width, height * 1.7);
  const r = size / 2 - 14;
  const cy = height / 2 + r * 0.36;
  const start = Math.PI;
  const end = 2 * Math.PI;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "xMidYMid meet", role: "img" });
  const thickness = Math.max(10, r * 0.24);

  // Trilho de fundo
  root.append(
    svg("path", { d: arcPath(cx, cy, r - thickness, r, start, end), fill: "var(--surface-3)", stroke: "var(--border)" })
  );
  // Valor
  root.append(
    svg("path", {
      class: "mark",
      d: arcPath(cx, cy, r - thickness, r, start, start + (end - start) * ratio),
      fill: ctx.statusColor(gauge.status),
    })
  );
  // Marca da meta
  if (isFiniteNumber(gauge.goal) && gauge.goal > min && gauge.goal < max) {
    const goalAngle = start + (end - start) * ((gauge.goal - min) / (max - min));
    const p1 = polarPoint(cx, cy, r - thickness - 3, goalAngle);
    const p2 = polarPoint(cx, cy, r + 3, goalAngle);
    root.append(svg("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "var(--text)", "stroke-width": 2 }));
    const label = polarPoint(cx, cy, r + 13, goalAngle);
    root.append(svg("text", { x: label.x, y: label.y, class: "axis-label", "text-anchor": "middle" }, "meta"));
  }

  root.append(
    svg("text", { x: cx, y: cy - r * 0.18, "text-anchor": "middle", class: "value-label", style: "font-size:22px" }, ctx.fmtValue(gauge.value, gauge.measure, { compact: true }))
  );
  root.append(svg("text", { x: cx, y: cy + 4, "text-anchor": "middle", class: "axis-label" }, gauge.label || ""));
  root.append(svg("text", { x: cx - r + thickness / 2, y: cy + 16, "text-anchor": "middle", class: "axis-label" }, ctx.fmtValue(min, gauge.measure, { compact: true })));
  root.append(svg("text", { x: cx + r - thickness / 2, y: cy + 16, "text-anchor": "middle", class: "axis-label" }, ctx.fmtValue(max, gauge.measure, { compact: true })));

  return root;
}

/* --------------------------------------------------------------- radar ---- */

export function renderRadar(ctx) {
  const { data, width, height } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (categories.length < 3 || !series.length) {
    return ctx.emptyMessage("O radar precisa de pelo menos 3 categorias.");
  }

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 26;
  const angleStep = (Math.PI * 2) / categories.length;
  const maxValue = Math.max(
    ...series.flatMap((s) => s.values.filter(isFiniteNumber).map(Math.abs)),
    1
  );

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "xMidYMid meet", role: "img" });

  // Teia
  for (let ring = 1; ring <= 4; ring += 1) {
    const rr = (r * ring) / 4;
    const points = categories.map((_, i) => polarPoint(cx, cy, rr, -Math.PI / 2 + i * angleStep));
    root.append(
      svg("path", {
        class: "grid-line",
        d: `${linePath(points)} Z`,
        fill: "none",
      })
    );
  }
  categories.forEach((cat, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const outer = polarPoint(cx, cy, r, angle);
    root.append(svg("line", { class: "grid-line", x1: cx, y1: cy, x2: outer.x, y2: outer.y }));
    const label = polarPoint(cx, cy, r + 14, angle);
    root.append(
      svg(
        "text",
        {
          class: "axis-label",
          x: label.x,
          y: label.y + 3,
          "text-anchor": Math.cos(angle) > 0.25 ? "start" : Math.cos(angle) < -0.25 ? "end" : "middle",
        },
        truncate(cat.label, 70, 10)
      )
    );
  });

  series.forEach((s, sIdx) => {
    const color = ctx.colorFor(sIdx);
    const points = categories.map((_, i) => {
      const value = isFiniteNumber(s.values[i]) ? s.values[i] : 0;
      const rr = (Math.abs(value) / maxValue) * r;
      return polarPoint(cx, cy, rr, -Math.PI / 2 + i * angleStep);
    });
    root.append(svg("path", { d: `${linePath(points)} Z`, fill: color, "fill-opacity": 0.16, stroke: color, "stroke-width": 2 }));
    points.forEach((p, i) => {
      const node = svg("circle", { class: "mark point", cx: p.x, cy: p.y, r: 3.2, fill: color });
      ctx.decorateMark(node, categories[i], s, s.values[i]);
      root.append(node);
    });
  });

  return root;
}

/* ---------------------------------------------------------------- funil ---- */

/**
 * Funil com taxa de conversão entre etapas, abandono e gargalo destacado.
 */
export function renderFunnel(ctx) {
  const { data, width, height, options } = ctx;
  const categories = data.categories || [];
  const series = ctx.visibleSeries();
  if (!categories.length || !series.length) return ctx.emptyMessage();

  const measure = series[0];
  const stages = categories
    .map((cat, i) => ({ cat, value: isFiniteNumber(measure.values[i]) ? measure.values[i] : 0 }))
    .filter((s) => s.value >= 0);

  if (stages.length < 2) return ctx.emptyMessage("O funil precisa de pelo menos duas etapas.");

  // Ordena do maior para o menor quando o usuário não fixou a ordem.
  if (options.funnelSort !== "none") stages.sort((a, b) => b.value - a.value);

  const top = stages[0].value || 1;
  const labelWidth = Math.min(150, Math.max(90, width * 0.28));
  const chartWidth = Math.max(60, width - labelWidth - 116);
  const rowHeight = Math.max(26, Math.min(56, (height - 10) / stages.length));

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "xMidYMid meet", role: "img" });

  // Identifica o maior gargalo (maior queda relativa entre etapas consecutivas).
  let worstIdx = -1;
  let worstDrop = 0;
  for (let i = 1; i < stages.length; i += 1) {
    const prev = stages[i - 1].value || 1;
    const drop = (prev - stages[i].value) / prev;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstIdx = i;
    }
  }

  stages.forEach((stage, i) => {
    const y = i * rowHeight + 4;
    const w = Math.max(3, (stage.value / top) * chartWidth);
    const x = labelWidth + (chartWidth - w) / 2;
    const color = ctx.colorFor(i);

    root.append(
      svg("text", { class: "axis-label", x: labelWidth - 10, y: y + rowHeight / 2 + 3, "text-anchor": "end" }, truncate(stage.cat.label, labelWidth - 14, 10))
    );

    const node = svg("path", {
      class: "mark",
      d: `M${x},${y} h${w} l${-w * 0.06},${rowHeight - 8} h${-w * 0.88} Z`,
      fill: color,
    });
    const conversionFromTop = (stage.value / top) * 100;
    const fromPrev = i === 0 ? 100 : (stage.value / (stages[i - 1].value || 1)) * 100;
    ctx.decorateMark(node, stage.cat, measure, stage.value, {
      extraRows: [
        { label: "Conversão desde a 1ª etapa", value: fmtPercent(conversionFromTop) },
        { label: "Conversão da etapa anterior", value: i === 0 ? "—" : fmtPercent(fromPrev) },
        { label: "Abandono na etapa", value: i === 0 ? "—" : fmtPercent(100 - fromPrev) },
      ],
    });
    root.append(node);

    root.append(
      svg("text", { class: "value-label", x: labelWidth + chartWidth + 10, y: y + rowHeight / 2 - 2 }, ctx.fmtValue(stage.value, measure.measure, { compact: true }))
    );

    // Segunda linha: conversão desde o topo ou, na pior etapa, o gargalo.
    const isBottleneck = i === worstIdx && worstDrop > 0.001;
    root.append(
      svg(
        "text",
        {
          class: "axis-label",
          x: labelWidth + chartWidth + 10,
          y: y + rowHeight / 2 + 11,
          fill: isBottleneck ? "var(--danger)" : undefined,
        },
        isBottleneck
          ? `gargalo −${fmtPercent(worstDrop * 100, 0)}`
          : `${fmtPercent(conversionFromTop, 0)} do topo`
      )
    );
  });

  return root;
}
