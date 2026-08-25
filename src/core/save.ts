// SAVES — runtime layer (plan 03 §8, task t12 #5). The browser uses IndexedDB
// (DB `undertow`, single row under SAVE_STORAGE_KEY); Node tests swap in a
// MemorySaveBackend behind the same SaveBackend interface. Load on boot, write
// on run end, JSON export/import behind ?debug. A corrupt/newer stored row is
// never allowed to clobber a fresh save — it falls back safely.
// Pure logic: no `three` imports (IndexedDB is a browser global, guarded).

import {
  SAVE_VERSION,
  type RunResult,
  type SaveGame,
} from '../save/schemas';
import { freshSave, migrate, applyRunResult, exportSave, importSave } from '../save/migrate';

export const SAVE_STORAGE_KEY = 'undertow.save.v1';
export const IDB_DB = 'undertow';
export const IDB_STORE = 'meta';

export interface SaveBackend {
  load(): Promise<unknown | null>;
  write(data: unknown): Promise<void>;
}

// Node/test backend — synchronous in-memory storage behind the async interface.
export class MemorySaveBackend implements SaveBackend {
  private data: unknown = null;
  async load(): Promise<unknown | null> {
    return this.data;
  }
  async write(data: unknown): Promise<void> {
    this.data = data;
  }
}

// Browser backend — a single-key IndexedDB row. Safe to construct in Node (the
// first load just fails and falls back to fresh), so `defaultBackend` can probe.
export class IndexedDBSaveBackend implements SaveBackend {
  async load(): Promise<unknown | null> {
    if (typeof indexedDB === 'undefined') return null;
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(SAVE_STORAGE_KEY);
        req.onsuccess = () => resolve((req.result as { value?: unknown } | undefined)?.value ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async write(data: unknown): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ key: SAVE_STORAGE_KEY, value: data }, SAVE_STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function defaultBackend(): SaveBackend {
  return typeof indexedDB !== 'undefined' ? new IndexedDBSaveBackend() : new MemorySaveBackend();
}

// Load on boot: migrate whatever is stored; fall back to a fresh save on any
// corruption. The returned save is the canonical document the runtime updates.
export async function loadSave(backend: SaveBackend): Promise<SaveGame> {
  const raw = await backend.load();
  if (raw === null || raw === undefined) {
    const s = freshSave();
    await backend.write(s);
    return s;
  }
  try {
    return migrate(raw);
  } catch {
    return freshSave(); // corrupt/newer stored row — never clobber, start clean
  }
}

// Write one run: append to the log and roll the meta counters.
export async function persistRun(
  backend: SaveBackend,
  save: SaveGame,
  result: RunResult,
): Promise<SaveGame> {
  const next = applyRunResult(save, result);
  await backend.write(next);
  return next;
}

// Convenience for the run-end write path: load-then-persist in one call.
export async function recordRun(backend: SaveBackend, result: RunResult): Promise<SaveGame> {
  const save = await loadSave(backend);
  return persistRun(backend, save, result);
}

// Serializes recordRun calls against one backend. Two overlapping writes (run
// end racing a later grade-up / next run end) would otherwise both load the
// same base save and the second write would silently drop the first result.
export class SaveWriter {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly backend: SaveBackend) {}

  record(result: RunResult): Promise<SaveGame> {
    const next = this.chain.then(() => recordRun(this.backend, result));
    // a failed write must not wedge the queue for every later write
    this.chain = next.catch(() => {});
    return next;
  }
}

export { exportSave, importSave, SAVE_VERSION };

// --- boot-time singleton (browser wiring) --------------------------------------
let backend: SaveBackend | null = null;
let writer: SaveWriter | null = null;
let currentSave: SaveGame | null = null;

export function initSaveSystem(): void {
  if (backend) return;
  backend = defaultBackend();
  writer = new SaveWriter(backend);
  void loadSave(backend).then((s) => {
    currentSave = s;
  });
}

export function getSave(): SaveGame | null {
  return currentSave;
}

// The run-end write path (browser): persist and refresh the singleton. Writes
// are funneled through one SaveWriter so concurrent results never race.
export async function saveRunResult(result: RunResult): Promise<SaveGame> {
  if (!backend) {
    backend = defaultBackend();
    writer = new SaveWriter(backend);
  }
  currentSave = await writer!.record(result);
  return currentSave;
}