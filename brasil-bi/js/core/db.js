/**
 * Brasil BI — persistência local.
 *
 * • IndexedDB  → linhas dos datasets (volume grande, gravação assíncrona)
 * • localStorage → configuração, dashboards, filtros, preferências (leve)
 *
 * Se o IndexedDB não estiver disponível (navegação privada antiga, quota),
 * caímos para um armazenamento em memória e avisamos a camada de UI.
 */

const DB_NAME = "brasil-bi";
const DB_VERSION = 1;
const STORE_ROWS = "rows";

let dbPromise = null;
const memoryFallback = new Map();
export const storage = { durable: true, reason: "" };

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB indisponível neste navegador"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ROWS)) {
        db.createObjectStore(STORE_ROWS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Falha ao abrir o IndexedDB"));
  }).catch((err) => {
    storage.durable = false;
    storage.reason = err.message;
    return null;
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE_ROWS, mode).objectStore(STORE_ROWS);
}

/** Grava as linhas de um dataset. */
export async function saveRows(datasetId, rows) {
  const db = await openDB();
  if (!db) {
    memoryFallback.set(datasetId, rows);
    return false;
  }
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.put({ id: datasetId, rows, savedAt: Date.now() });
    req.onsuccess = () => resolve(true);
    req.onerror = () => {
      storage.durable = false;
      storage.reason = req.error?.name === "QuotaExceededError"
        ? "Cota de armazenamento do navegador excedida"
        : req.error?.message || "Falha ao gravar";
      memoryFallback.set(datasetId, rows);
      reject(req.error);
    };
  }).catch(() => false);
}

/** @returns {Promise<Array<Object>|null>} */
export async function loadRows(datasetId) {
  const db = await openDB();
  if (!db) return memoryFallback.get(datasetId) || null;
  return new Promise((resolve) => {
    const req = tx(db, "readonly").get(datasetId);
    req.onsuccess = () => resolve(req.result?.rows || memoryFallback.get(datasetId) || null);
    req.onerror = () => resolve(memoryFallback.get(datasetId) || null);
  });
}

export async function deleteRows(datasetId) {
  memoryFallback.delete(datasetId);
  const db = await openDB();
  if (!db) return;
  await new Promise((resolve) => {
    const req = tx(db, "readwrite").delete(datasetId);
    req.onsuccess = resolve;
    req.onerror = resolve;
  });
}

export async function listStoredDatasetIds() {
  const db = await openDB();
  if (!db) return Array.from(memoryFallback.keys());
  return new Promise((resolve) => {
    const req = tx(db, "readonly").getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

/** Uso aproximado de armazenamento (quando a API existir). */
export async function storageEstimate() {
  if (navigator.storage?.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota };
    } catch {
      /* ignora */
    }
  }
  return { usage: null, quota: null };
}

/* ------------------------------------------------------------ localStorage */

const LS_PREFIX = "brasilbi:";

export function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    storage.durable = false;
    storage.reason = "Não foi possível salvar as configurações locais";
    return false;
  }
}

export function lsRemove(key) {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* ignora */
  }
}

export async function wipeAll() {
  const ids = await listStoredDatasetIds();
  await Promise.all(ids.map(deleteRows));
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignora */
  }
}
