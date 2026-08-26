// RUN-START WIRING — task t18 slice 2. The M5 hook has to fire on the SAME seam
// the other run-start passives use, so a fresh run in-session (DISCHARGE →
// startNewRun) opens the water at the Dread the town bought, not just a reload.
// Drives the real save singleton (MemorySaveBackend in Node) end to end.

import { describe, it, expect, beforeAll } from 'vitest';
import { createWorld } from '../../src/core/world';
import { initSaveSystem, updateSave, getSave } from '../../src/core/save';
import { startNewRun } from '../../src/run/run';
import { applyRunStartPassives } from '../../src/loot/runStart';
import type { MetaState } from '../../src/save/schemas';

function town(n: number): (m: MetaState) => MetaState {
  return (meta) => {
    const buildings: MetaState['buildings'] = {};
    const ids = ['smokehouse', 'chandlery', 'post-office', 'bell-tower', 'chapel'];
    for (const id of ids.slice(0, n)) buildings[id] = { restored: true, paid: 0, atRun: 0 };
    return { ...meta, buildings };
  };
}

describe('startNewRun applies the town\'s starting Dread', () => {
  beforeAll(async () => {
    await initSaveSystem();
  });

  it('a loaded save with no town leaves a fresh run at Dread 0', async () => {
    await updateSave((s) => ({ ...s, metaState: town(0)(s.metaState) }));
    const world = createWorld(1);
    startNewRun(world, 42);
    expect(world.dread).toBe(0);
    expect(world.run.startedAtDread).toBe(0);
  });

  it('three restored premises open the next run at Dread 6', async () => {
    await updateSave((s) => ({ ...s, metaState: town(3)(s.metaState) }));
    expect(getSave()!.metaState.buildings['post-office']!.restored).toBe(true);
    const world = createWorld(1);
    startNewRun(world, 43);
    expect(world.dread).toBe(6);
    expect(world.run.startedAtDread).toBe(6);
    expect(world.run.dreadPeak).toBe(6);
  });

  it('the boot path (applyRunStartPassives on the loaded world) agrees', async () => {
    await updateSave((s) => ({ ...s, metaState: town(5)(s.metaState) }));
    const world = createWorld(1);
    applyRunStartPassives(world);
    expect(world.dread).toBe(10);
    expect(world.run.startedAtDread).toBe(10);
  });
});
