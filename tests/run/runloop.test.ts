// RUN LOOP — tests-first (task t12 #1/#4). End-to-end pure-logic wiring:
// cast → bite → SET → tether fight → land → haul + Dread gain, then
// extraction (100%) vs death (30% condolence) RunResults, the false-dawn buoy
// gating, and the fresh-run reset. No three, no DOM.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import { ensureLake, spawnAtLakeStart } from '../../src/gen/lakeWorld';
import { initRun, startNewRun, endRun, buildRunResult } from '../../src/run/run';
import { updateCastFlow } from '../../src/systems/castFlow';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { processRunEvents } from '../../src/run/reducer';
import { FIXED_DT } from '../../src/core/time';
import { landGainByTier } from '../../src/game/dread';
import { dreadMultForPhase } from '../../src/game/clock';
import { catchMemories, CONDOLENCE_RATE } from '../../src/extract/memories';
import { pointInPolygon } from '../../src/core/poly';
import { createDisturbance, PROMPT_WINDOW, type Disturbance } from '../../src/run/disturbance';
import { speciesById } from '../../src/data/species';
import type { WorldState } from '../../src/core/world';

const DT = FIXED_DT;

function bootWorld(seed = 42): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  return w;
}

// place a disturbance next to the boat (within cast range) and aim the mouse at it
function disturbanceByBoat(w: WorldState, tier: 1 | 2 | 3 = 1): Disturbance {
  const b = w.boat;
  const d = createDisturbance(9000, { x: b.x + 6, z: b.z }, tier, 7);
  w.disturbances.push(d);
  w.run.debugCastPoint = { x: b.x + 6, z: b.z };
  return d;
}

// drive the bite timer to 0 so the disturbance enters the SET/RELEASE window
function driveToPrompt(w: WorldState, d: Disturbance, dt = DT, cap = 600): void {
  let n = 0;
  while (d.state === 'biting' && n < cap) {
    updateCastFlow(w, dt);
    n++;
  }
  expect(d.state, 'bite should resolve to a prompt within the cap').toBe('prompt');
  expect(w.run.promptId).toBe(d.id);
}

// a DELIBERATE SET: release the cast press, then a fresh LMB press inside the
// window (the press you cast with must not pre-empt the bite choice)
function pressSet(w: WorldState): void {
  w.intent.primary = false;
  updateCastFlow(w, DT);
  w.intent.primary = true;
  updateCastFlow(w, DT);
}

describe('cast → bite → prompt', () => {
  it('LMB casts at an idle disturbance in range; the bite arrives after a seeded delay', () => {
    const w = bootWorld(11);
    const d = disturbanceByBoat(w, 1);
    expect(d.state).toBe('idle');

    w.intent.primary = true; // LMB — cast
    updateCastFlow(w, DT);
    expect(d.state).toBe('biting');
    expect(d.biteTimer).toBeGreaterThanOrEqual(1);
    expect(d.biteTimer).toBeLessThan(4);

    // holding LMB after the cast must not re-cast elsewhere
    updateCastFlow(w, DT);
    expect(w.run.promptId).toBeNull();

    // a second idle disturbance is not auto-cast while one is already biting
    expect(w.disturbances.filter((x) => x.state === 'idle').length).toBeGreaterThan(0);
  });

  it('the prompt window is exactly 1.2s and consuming it clears the prompt', () => {
    const w = bootWorld(12);
    const d = disturbanceByBoat(w, 2);
    w.intent.primary = true;
    updateCastFlow(w, DT);
    driveToPrompt(w, d);
    expect(d.promptTimer).toBeCloseTo(PROMPT_WINDOW, 9);

    // let the window lapse → the disturbance is consumed (missed the bite)
    w.intent.primary = false;
    let steps = 0;
    while (w.run.promptId !== null && steps < 600) {
      updateCastFlow(w, DT);
      steps++;
    }
    expect(d.state).toBe('gone');
    expect(w.run.promptId).toBeNull();
    expect(w.tether.fights.length).toBe(0);
  });
});

describe('SET starts the tether fight (fish scaled by tier)', () => {
  it('LMB inside the window SETs: fight starts, activeCatch recorded, fish scaled', () => {
    const w = bootWorld(13);
    const d = disturbanceByBoat(w, 2);
    w.intent.primary = true;
    updateCastFlow(w, DT); // cast
    driveToPrompt(w, d);

    // SET (a fresh LMB press inside the window)
    pressSet(w);
    expect(w.tether.fights.length).toBe(1);
    expect(w.fish).not.toBeNull();
    expect(w.run.activeCatch?.tier).toBe(2);
    expect(w.run.activeCatch!.weight).toBeGreaterThan(0);
    // tier-2 fish is heavier/faster than the tier-1 baseline
    expect(w.fish!.tether.mass).toBeGreaterThan(1.2);
    expect(d.state).toBe('gone');
    expect(w.run.promptId).toBeNull();
  });

  it('RMB inside the window RELEASEs — disturbance consumed, no Dread, no fight', () => {
    const w = bootWorld(14);
    const d = disturbanceByBoat(w, 3);
    const dreadBefore = w.dread;
    w.intent.primary = true;
    updateCastFlow(w, DT); // cast
    driveToPrompt(w, d);

    w.intent.primary = false;
    w.intent.secondary = true; // RMB = RELEASE
    updateCastFlow(w, DT);
    expect(d.state).toBe('gone');
    expect(w.tether.fights.length).toBe(0);
    expect(w.fish).toBeNull();
    expect(w.dread).toBe(dreadBefore); // the free valve — never raises Dread
    expect(w.run.haul.length).toBe(0);
  });
});

describe('M4 species roll at SET (replaces the tier capsule)', () => {
  it('SET rolls a real species: fish carries params + a resized spine', () => {
    const w = bootWorld(13);
    const d = disturbanceByBoat(w, 2);
    w.intent.primary = true;
    updateCastFlow(w, DT);
    driveToPrompt(w, d);
    pressSet(w);

    const c = w.run.activeCatch!;
    expect(c.species).not.toBe('capsule');
    expect(speciesById(c.species)).toBeDefined();
    expect(c.name).toBe(speciesById(c.species).name);
    expect(c.weight).toBeGreaterThan(0);

    const f = w.fish!;
    expect(f.params).not.toBeNull();
    expect(f.params!.speciesId).toBe(c.species);
    expect(f.spine.length).toBe(f.params!.spineSegments);
    // the species stats replaced the FISH_TIER_SCALE capsule
    expect(f.tether.mass).toBeCloseTo(f.params!.mass, 9);
    expect(f.maxHp).toBe(f.params!.hp);
    expect(f.tether.patterns).toEqual(f.params!.patterns);
  });

  it('a landed catch writes the receipt name (lowercase display) into the haul', () => {
    const w = bootWorld(15);
    const d = disturbanceByBoat(w, 2);
    w.intent.primary = true;
    updateCastFlow(w, DT);
    driveToPrompt(w, d);
    pressSet(w);

    const display = w.run.activeCatch!.name.toLowerCase();
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    w.fish!.x = w.player.x;
    w.fish!.z = w.player.z;
    updateTetherConstraint(w, DT);
    w.intent.acceptLand = true;
    updateTetherConstraint(w, DT);
    processRunEvents(w);

    expect(w.run.haul).toHaveLength(1);
    expect(w.run.haul[0]!.species).toBe(display); // "one (1) purse minnow, damp"
    expect(w.run.haul[0]!.clean).toBe(true);
    expect(w.run.haul[0]!.memories).toBe(catchMemories(w.run.haul[0]!.weight, 2, true));
    void display;
  });
});

describe('land → haul + Dread gain', () => {
  it('landing adds a clean catch to the haul and raises Dread by tier × night mult', () => {
    const w = bootWorld(15);
    const d = disturbanceByBoat(w, 2);
    w.intent.primary = true;
    updateCastFlow(w, DT); // cast
    driveToPrompt(w, d);
    pressSet(w); // SET

    // land the catch: exhaust it, drag it next to the player, accept the prompt.
    // Eligibility is computed on the first step, the LAND press lands on the next.
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    w.fish!.x = w.player.x;
    w.fish!.z = w.player.z;
    updateTetherConstraint(w, DT); // computes land.eligible
    w.intent.acceptLand = true;
    updateTetherConstraint(w, DT); // fires 'landed', despawns the fish
    processRunEvents(w);

    expect(w.run.haul.length).toBe(1);
    const rec = w.run.haul[0]!;
    expect(rec.tier).toBe(2);
    expect(rec.clean).toBe(true);
    expect(rec.memories).toBe(catchMemories(rec.weight, rec.tier, true));
    const expected = landGainByTier(2) * dreadMultForPhase('dusk'); // dusk mult = 1
    expect(w.dread).toBeCloseTo(expected, 9);
    expect(w.fish).toBeNull();
    expect(w.run.activeCatch).toBeNull();
  });

  it('a snapped fight records nothing and gains no Dread', () => {
    const w = bootWorld(16);
    const d = disturbanceByBoat(w, 1);
    w.intent.primary = true;
    updateCastFlow(w, DT);
    driveToPrompt(w, d);
    pressSet(w); // SET

    const before = w.dread;
    // force a snap: tension to the ceiling
    const fight = w.tether.fights[0]!;
    fight.tension = 99.9;
    w.fish!.x = 999; // beyond L → the constraint sees excess and adds tension
    updateTetherConstraint(w, DT);
    processRunEvents(w);

    expect(w.run.haul.length).toBe(0);
    expect(w.dread).toBe(before);
    expect(w.run.activeCatch).toBeNull();
  });
});

describe('run result — extraction vs death', () => {
  function runWithOneCatch(seed: number, tier: 1 | 2 | 3): WorldState {
    const w = bootWorld(seed);
    const d = disturbanceByBoat(w, tier);
    w.intent.primary = true;
    updateCastFlow(w, DT);
    driveToPrompt(w, d);
    pressSet(w); // SET
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    w.fish!.x = w.player.x;
    w.fish!.z = w.player.z;
    updateTetherConstraint(w, DT); // computes land.eligible
    w.intent.acceptLand = true;
    updateTetherConstraint(w, DT);
    processRunEvents(w);
    return w;
  }

  it('extraction keeps 100% of the haul (weight × tier mult × clean 1.5)', () => {
    const w = runWithOneCatch(17, 3);
    const result = buildRunResult(w, true);
    expect(result.extracted).toBe(true);
    const rec = w.run.haul[0]!;
    expect(result.memoriesTotal).toBe(rec.memories);
    expect(result.memoriesTotal).toBe(catchMemories(rec.weight, rec.tier, true));
    expect(result.dreadPeak).toBe(w.run.dreadPeak);
    expect(result.clockPhaseEnd).toBe('dusk');
  });

  it('death applies the 30% Office condolence rate, floored per item', () => {
    const w = runWithOneCatch(18, 1);
    const haul = w.run.haul;
    const full = haul.reduce((s, r) => s + r.memories, 0);
    const result = buildRunResult(w, false);
    expect(result.extracted).toBe(false);
    const perItem = haul.map((r) => Math.floor(r.memories * CONDOLENCE_RATE));
    expect(result.memoriesTotal).toBe(perItem.reduce((s, v) => s + v, 0));
    expect(result.memoriesTotal).toBeLessThan(full);
    expect(result.memoriesTotal).toBeGreaterThanOrEqual(0);
  });

  it('endRun sets the terminal state and freezes the result', () => {
    const w = runWithOneCatch(19, 1);
    const result = endRun(w, true);
    expect(w.run.ended).toBe(true);
    expect(w.run.result).toBe(result);
    // a second call must not overwrite a finished run
    const again = endRun(w, false);
    expect(again).toBe(result);
    expect(w.run.result!.extracted).toBe(true);
  });
});

describe('disturbance spawning (spawn director seam)', () => {
  it('initRun seeds disturbances on open water near islets, deterministically', () => {
    const a = bootWorld(21);
    const b = bootWorld(21);
    expect(a.disturbances.length).toBeGreaterThan(0);
    expect(a.disturbances.map((d) => d.pos)).toEqual(b.disturbances.map((d) => d.pos));
    for (const dist of a.disturbances) {
      // open water — not inside any islet polygon
      for (const iso of a.lake!.islets) {
        expect(pointInPolygon(dist.pos, iso.poly)).toBe(false);
      }
      // near an islet (the boat reaches it: cast range 10 from a shore)
      const near = a.lake!.islets.some((iso) => {
        const dx = dist.pos.x - iso.center.x;
        const dz = dist.pos.z - iso.center.z;
        return Math.hypot(dx, dz) < 30;
      });
      expect(near).toBe(true);
      expect(dist.tier === 1 || dist.tier === 2 || dist.tier === 3).toBe(true);
    }
  });
});

describe('fresh run on dismiss (new seed)', () => {
  it('startNewRun resets haul/dread/clock and regenerates the lake', () => {
    const w = bootWorld(31);
    disturbanceByBoat(w, 1);
    w.dread = 60;
    w.run.haul.push({
      species: 'capsule',
      tier: 1,
      weight: 4,
      clean: true,
      memories: 6,
      xp: 6,
    });
    const oldSeed = w.seed;

    const next = startNewRun(w, 77);
    expect(next).toBe(w); // mutated in place — main.ts's reference stays valid
    expect(w.seed).toBe(77);
    expect(w.seed).not.toBe(oldSeed);
    expect(w.dread).toBe(0);
    expect(w.run.haul.length).toBe(0);
    expect(w.run.ended).toBe(false);
    expect(w.run.result).toBeNull();
    expect(w.disturbances.length).toBeGreaterThan(0);
    expect(w.run.startedAt).toBe(w.time.elapsed); // clock epoch reset to now
    expect(w.lake!.seed).toBe(77);
  });
});