/**
 * Brasil BI — estado central da aplicação (store observável + persistência).
 *
 * Regras:
 *  • Toda mutação passa por `update()`, que persiste e notifica os assinantes.
 *  • Linhas de dados NÃO ficam no estado serializado (vão para o IndexedDB);
 *    o estado guarda apenas os metadados do dataset.
 */

import { lsGet, lsSet, saveRows, loadRows, deleteRows } from "./db.js";
import { uid, deepClone } from "./utils.js";

export const STATE_VERSION = 1;

/** @returns {Object} estado inicial (nenhum dado fictício ativo por padrão). */
function initialState() {
  return {
    version: STATE_VERSION,
    user: { name: "Usuário", email: "", role: "administrador" },
    prefs: {
      theme: "auto", // auto | dark | light
      sidebar: "expanded",
      compactNumbers: true,
      confirmDestructive: true,
      demoBannerDismissed: false,
    },
    onboarding: { done: false, step: 0 },
    datasets: [], // metadados: ver createDataset()
    relationships: [], // { id, fromDataset, fromField, toDataset, toField, cardinality, active }
    measures: [], // medidas calculadas do modelo: { id, name, datasetId, expr, format }
    dashboards: [],
    activeDashboardId: null,
    filters: {
      global: [], // filtros persistentes escolhidos pelo usuário
      selection: [], // cross-filter vindo de cliques nos gráficos (efêmero)
      saved: [], // conjuntos favoritos: { id, name, filters }
    },
    period: { preset: "todos", from: null, to: null, field: null, datasetId: null },
    alerts: [], // { id, name, datasetId, measure, op, value, channels[], enabled }
    notifications: [],
    activity: [], // trilha de auditoria local
    shares: [], // links gerados localmente
    lastRefresh: null,
  };
}

let state = loadState();
const listeners = new Set();

/* ------------------------------------------------------------ persistência */

function loadState() {
  const saved = lsGet("state", null);
  if (!saved || saved.version !== STATE_VERSION) return initialState();
  // Mescla com o inicial para tolerar campos novos entre versões.
  const base = initialState();
  return {
    ...base,
    ...saved,
    prefs: { ...base.prefs, ...(saved.prefs || {}) },
    filters: { ...base.filters, ...(saved.filters || {}), selection: [] },
    period: { ...base.period, ...(saved.period || {}) },
    onboarding: { ...base.onboarding, ...(saved.onboarding || {}) },
  };
}

let persistTimer = null;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const snapshot = { ...state, filters: { ...state.filters, selection: [] } };
    lsSet("state", snapshot);
  }, 220);
}

/* ------------------------------------------------------------------ store */

export function getState() {
  return state;
}

/**
 * Aplica uma mutação ao estado.
 * @param {(draft:Object)=>void} mutator
 * @param {{persist?:boolean, reason?:string}} [opts]
 */
export function update(mutator, opts = {}) {
  mutator(state);
  if (opts.persist !== false) schedulePersist();
  notify(opts.reason || "update");
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(reason = "update") {
  for (const fn of listeners) {
    try {
      fn(state, reason);
    } catch (err) {
      console.error("[brasil-bi] assinante falhou:", err);
    }
  }
}

export function resetState() {
  state = initialState();
  schedulePersist();
  notify("reset");
}

/* --------------------------------------------------------------- datasets */

/**
 * Metadados de um dataset.
 * @param {Object} init
 */
export function createDataset(init) {
  return {
    id: init.id || uid("ds"),
    name: init.name || "Nova fonte",
    fields: init.fields || [], // { name, type, role, nullable, distinct, format }
    rowCount: init.rowCount || 0,
    source: init.source || { kind: "arquivo", format: "csv", fileName: "", size: 0 },
    quality: init.quality || null, // relatório do profiler
    transforms: init.transforms || [], // etapas do editor de dados
    isDemo: Boolean(init.isDemo),
    importedAt: init.importedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: init.notes || "",
  };
}

const rowsCache = new Map(); // id -> linhas cruas
const derivedCache = new Map(); // id -> { key, rows } (após transformações)

/** Registra dataset + linhas (persistidas no IndexedDB). */
export async function addDataset(meta, rows) {
  const dataset = createDataset({ ...meta, rowCount: rows.length });
  rowsCache.set(dataset.id, rows);
  derivedCache.delete(dataset.id);
  await saveRows(dataset.id, rows);
  update((s) => {
    s.datasets.push(dataset);
    s.lastRefresh = new Date().toISOString();
  }, { reason: "dataset:add" });
  logActivity("importou a fonte", dataset.name);
  return dataset;
}

export async function replaceRows(datasetId, rows) {
  rowsCache.set(datasetId, rows);
  derivedCache.delete(datasetId);
  await saveRows(datasetId, rows);
  update((s) => {
    const ds = s.datasets.find((d) => d.id === datasetId);
    if (ds) {
      ds.rowCount = rows.length;
      ds.updatedAt = new Date().toISOString();
    }
  }, { reason: "dataset:rows" });
}

/** Linhas cruas (antes das transformações). */
export async function getRawRows(datasetId) {
  if (rowsCache.has(datasetId)) return rowsCache.get(datasetId);
  const rows = (await loadRows(datasetId)) || [];
  rowsCache.set(datasetId, rows);
  return rows;
}

/** Invalida o cache derivado (chamar após alterar transformações). */
export function invalidateDerived(datasetId) {
  if (datasetId) derivedCache.delete(datasetId);
  else derivedCache.clear();
}

export function getDerivedCache(datasetId) {
  return derivedCache.get(datasetId) || null;
}

export function setDerivedCache(datasetId, key, rows) {
  derivedCache.set(datasetId, { key, rows });
}

export async function removeDataset(datasetId) {
  rowsCache.delete(datasetId);
  derivedCache.delete(datasetId);
  await deleteRows(datasetId);
  const name = getDataset(datasetId)?.name || datasetId;
  update((s) => {
    s.datasets = s.datasets.filter((d) => d.id !== datasetId);
    s.relationships = s.relationships.filter(
      (r) => r.fromDataset !== datasetId && r.toDataset !== datasetId
    );
    s.measures = s.measures.filter((m) => m.datasetId !== datasetId);
    for (const dash of s.dashboards) {
      dash.tiles = dash.tiles.filter((t) => t.datasetId !== datasetId);
    }
    s.filters.global = s.filters.global.filter((f) => f.datasetId !== datasetId);
    s.filters.selection = s.filters.selection.filter((f) => f.datasetId !== datasetId);
  }, { reason: "dataset:remove" });
  logActivity("removeu a fonte", name);
}

export function getDataset(datasetId) {
  return state.datasets.find((d) => d.id === datasetId) || null;
}

export function primaryDataset() {
  return state.datasets.find((d) => !d.isDemo) || state.datasets[0] || null;
}

export function hasRealData() {
  return state.datasets.some((d) => !d.isDemo);
}

export function hasDemoData() {
  return state.datasets.some((d) => d.isDemo);
}

/* -------------------------------------------------------------- dashboards */

export function createDashboard(init = {}) {
  return {
    id: init.id || uid("dash"),
    name: init.name || "Novo dashboard",
    description: init.description || "",
    template: init.template || "custom",
    tiles: init.tiles || [],
    datasetId: init.datasetId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: Boolean(init.isDemo),
  };
}

export function activeDashboard() {
  const { dashboards, activeDashboardId } = state;
  return dashboards.find((d) => d.id === activeDashboardId) || dashboards[0] || null;
}

export function upsertDashboard(dashboard) {
  update((s) => {
    const idx = s.dashboards.findIndex((d) => d.id === dashboard.id);
    dashboard.updatedAt = new Date().toISOString();
    if (idx >= 0) s.dashboards[idx] = dashboard;
    else s.dashboards.push(dashboard);
    s.activeDashboardId = dashboard.id;
  }, { reason: "dashboard:upsert" });
}

export function removeDashboard(id) {
  const name = state.dashboards.find((d) => d.id === id)?.name;
  update((s) => {
    s.dashboards = s.dashboards.filter((d) => d.id !== id);
    if (s.activeDashboardId === id) s.activeDashboardId = s.dashboards[0]?.id || null;
  }, { reason: "dashboard:remove" });
  logActivity("excluiu o dashboard", name);
}

export function duplicateDashboard(id) {
  const src = state.dashboards.find((d) => d.id === id);
  if (!src) return null;
  const copy = deepClone(src);
  copy.id = uid("dash");
  copy.name = `${src.name} (cópia)`;
  copy.tiles = copy.tiles.map((t) => ({ ...t, id: uid("tile") }));
  upsertDashboard(copy);
  return copy;
}

/** Atualiza um tile do dashboard ativo. */
export function updateTile(tileId, mutator) {
  update((s) => {
    const dash = s.dashboards.find((d) => d.id === s.activeDashboardId);
    const tile = dash?.tiles.find((t) => t.id === tileId);
    if (tile) {
      mutator(tile);
      dash.updatedAt = new Date().toISOString();
    }
  }, { reason: "tile:update" });
}

/* ------------------------------------------------------------------ filtros */

export function addGlobalFilter(filter) {
  update((s) => {
    const idx = s.filters.global.findIndex(
      (f) => f.field === filter.field && f.datasetId === filter.datasetId && f.op === filter.op
    );
    if (idx >= 0) s.filters.global[idx] = filter;
    else s.filters.global.push({ id: uid("flt"), ...filter });
  }, { reason: "filter:add" });
}

export function removeFilter(id) {
  update((s) => {
    s.filters.global = s.filters.global.filter((f) => f.id !== id);
    s.filters.selection = s.filters.selection.filter((f) => f.id !== id);
  }, { reason: "filter:remove" });
}

export function clearFilters({ keepSelection = false } = {}) {
  update((s) => {
    s.filters.global = [];
    if (!keepSelection) s.filters.selection = [];
    s.period = { ...s.period, preset: "todos", from: null, to: null };
  }, { reason: "filter:clear" });
}

/** Cross-filter: clique em um elemento de gráfico. */
export function setSelection(filters) {
  update((s) => {
    s.filters.selection = filters.map((f) => ({ id: uid("sel"), ...f }));
  }, { persist: false, reason: "filter:selection" });
}

export function toggleSelection(filter) {
  const same = state.filters.selection.find(
    (f) => f.field === filter.field && f.datasetId === filter.datasetId && String(f.value) === String(filter.value)
  );
  if (same) setSelection(state.filters.selection.filter((f) => f !== same));
  else setSelection([...state.filters.selection, filter]);
}

export function activeFilters() {
  return [...state.filters.global, ...state.filters.selection];
}

/* -------------------------------------------------- notificações e trilha */

export function logActivity(action, target = "") {
  update((s) => {
    s.activity.unshift({
      id: uid("act"),
      at: new Date().toISOString(),
      user: s.user.name,
      action,
      target,
    });
    s.activity = s.activity.slice(0, 200);
  }, { reason: "activity" });
}

export function pushNotification(notification) {
  update((s) => {
    s.notifications.unshift({
      id: uid("ntf"),
      at: new Date().toISOString(),
      read: false,
      level: "info",
      ...notification,
    });
    s.notifications = s.notifications.slice(0, 60);
  }, { reason: "notification" });
}

export function markNotificationsRead() {
  update((s) => {
    s.notifications = s.notifications.map((n) => ({ ...n, read: true }));
  }, { reason: "notification:read" });
}
