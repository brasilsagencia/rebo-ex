/**
 * Brasil BI — tema claro/escuro/automático.
 * A preferência fica salva no estado do usuário; "auto" segue o sistema.
 */

import { getState, update } from "./store.js";

const media = window.matchMedia("(prefers-color-scheme: light)");
const paletteCache = new Map();

/** Aplica o tema efetivo ao <html>. */
export function applyTheme() {
  const pref = getState().prefs.theme || "auto";
  const effective = pref === "auto" ? (media.matches ? "light" : "dark") : pref;
  const root = document.documentElement;
  root.setAttribute("data-theme", effective);
  root.setAttribute("data-theme-pref", pref);
  root.style.colorScheme = effective;
  paletteCache.clear();
  document.dispatchEvent(new CustomEvent("bi:theme", { detail: { theme: effective, pref } }));
  return effective;
}

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

export function themePreference() {
  return getState().prefs.theme || "auto";
}

/** Alterna entre escuro → claro → automático. */
export function cycleTheme() {
  const order = ["dark", "light", "auto"];
  const next = order[(order.indexOf(themePreference()) + 1) % order.length];
  setTheme(next);
  return next;
}

export function setTheme(pref) {
  update((s) => {
    s.prefs.theme = pref;
  }, { reason: "theme" });
  applyTheme();
}

export function initTheme() {
  applyTheme();
  media.addEventListener("change", () => {
    if (themePreference() === "auto") applyTheme();
  });
}

/** Lê uma variável CSS resolvida do tema atual. */
export function cssVar(name) {
  if (paletteCache.has(name)) return paletteCache.get(name);
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  paletteCache.set(name, value);
  return value;
}

/** Paleta categórica do tema atual (10 cores com luminâncias distintas). */
export function seriesPalette() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => cssVar(`--s${i}`));
}

export function seriesColor(index) {
  const palette = seriesPalette();
  return palette[index % palette.length];
}

/** Escala sequencial (para heatmaps e mapas). t ∈ [0,1] */
export function sequentialColor(t, hue = "verde") {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const dark = currentTheme() === "dark";
  const ramps = {
    verde: dark
      ? [[8, 26, 30], [0, 224, 92]]
      : [[229, 245, 236], [0, 122, 61]],
    azul: dark
      ? [[9, 22, 46], [77, 148, 255]]
      : [[228, 238, 255], [0, 71, 179]],
    amarelo: dark
      ? [[32, 28, 8], [255, 215, 0]]
      : [[255, 248, 219], [154, 110, 0]],
  };
  const [from, to] = ramps[hue] || ramps.verde;
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * clamped));
  return `rgb(${mix.join(",")})`;
}

/** Escala divergente (negativo → positivo). */
export function divergingColor(t) {
  const clamped = Math.min(1, Math.max(-1, t));
  if (clamped >= 0) return sequentialColor(clamped, "verde");
  const dark = currentTheme() === "dark";
  const from = dark ? [30, 12, 18] : [253, 232, 236];
  const to = dark ? [255, 84, 112] : [178, 31, 60];
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * -clamped));
  return `rgb(${mix.join(",")})`;
}
