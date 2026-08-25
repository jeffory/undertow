// SAVE BACKEND — tests-first (plan 03 §8.1, task t12 #5). The storage layer is
// abstracted behind a SaveBackend so the browser's IndexedDB path is swappable
// for a MemorySaveBackend in Node. Pins load/persist round-trips and the
// boot-time load path.

import { describe, it, expect } from 'vitest';
import {
  MemorySaveBackend,
  loadSave,
  persistRun,
  recordRun,
  SAVE_STORAGE_KEY,
  type SaveBackend,
} from '../../src/core/save';
import { freshSave, SAVE_VERSION } from '../../src/save/migrate';

const result = () => ({
  seed: 5,
  source: 'random' as const,
  clockPhaseEnd: 'dusk' as const,
  haul: [
    { species: 'capsule', tier: 1, weight: 4, clean: true, memories: 6, xp: 6 },
  ],
  extracted: true,
  memoriesTotal: 6,
  xpTotal: 6,
  dreadPeak: 10,
  startedAtDread: 0,
  draggersLand: 0,
  bagmanCaught: false,
  sinkholesDescended: 0,
});

describe('SaveBackend abstraction', () => {
  it('memory backend round-trips bytes (the IndexedDB contract)', async () => {
    const backend: SaveBackend = new MemorySaveBackend();
    const save = await applyOne(backend);
    const reloaded = await loadSave(backend);
    expect(reloaded).toEqual(save);
    expect(reloaded.meta.runsCompleted).toBe(1);
  });

  it('a brand-new backend loads as a fresh v1 save', async () => {
    const backend = new MemorySaveBackend();
    const save = await loadSave(backend);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.meta).toEqual({ memoriesTotal: 0, runsCompleted: 0, bestHaul: 0, seenIntro: false });
  });

  it('a corrupt stored row does not clobber a fresh save — it falls back safely', async () => {
    const backend = new MemorySaveBackend();
    await backend.write({ version: 99 }); // a newer-version save — must refuse, not crash
    const save = await loadSave(backend);
    expect(save.version).toBe(SAVE_VERSION); // fresh defaults win
  });
});

describe('recordRun (runtime write path)', () => {
  it('persistRun appends + updates meta and returns the new save', async () => {
    const backend = new MemorySaveBackend();
    const save = await recordRun(backend, result());
    expect(save.meta.memoriesTotal).toBe(6);
    expect(save.meta.runsCompleted).toBe(1);
    expect(save.runs).toHaveLength(1);
  });

  it('seenIntro flips to true after the first run', async () => {
    const backend = new MemorySaveBackend();
    const save = await recordRun(backend, result());
    expect(save.meta.seenIntro).toBe(true);
  });
});

async function applyOne(backend: SaveBackend) {
  let save = freshSave();
  save = await persistRun(backend, save, result());
  return save;
}

// keep the key import referenced (used by the IndexedDB store path)
expect(typeof SAVE_STORAGE_KEY).toBe('string');
describe('SaveWriter (concurrent write serialization — QA round)', () => {
  class SlowBackend implements SaveBackend {
    inner = new MemorySaveBackend();
    delayMs = 10;
    async load() {
      await new Promise((r) => setTimeout(r, this.delayMs));
      return this.inner.load();
    }
    async write(data: unknown) {
      await new Promise((r) => setTimeout(r, this.delayMs));
      return this.inner.write(data);
    }
  }

  it('two overlapping run writes both land (the load-then-write race is gone)', async () => {
    const { SaveWriter } = await import('../../src/core/save');
    const backend = new SlowBackend();
    const writer = new SaveWriter(backend);
    // fire both without awaiting — this is exactly the run-end + next-run race
    const [, second] = await Promise.all([writer.record(result()), writer.record(result())]);
    expect(second.meta.runsCompleted).toBe(2);
    expect(second.runs).toHaveLength(2);
    expect(second.meta.memoriesTotal).toBe(12);
    const onDisk = await loadSave(backend.inner);
    expect(onDisk.meta.runsCompleted).toBe(2);
  });

  it('a failed write does not wedge the queue for later writes', async () => {
    const { SaveWriter } = await import('../../src/core/save');
    let fail = true;
    const mem = new MemorySaveBackend();
    const backend: SaveBackend = {
      load: () => mem.load(),
      write: (d) => {
        if (fail) return Promise.reject(new Error('quota'));
        return mem.write(d);
      },
    };
    const writer = new SaveWriter(backend);
    await expect(writer.record(result())).rejects.toThrow('quota');
    fail = false;
    const save = await writer.record(result());
    expect(save.meta.runsCompleted).toBe(1);
  });
});
