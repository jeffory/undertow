// ENVIRONMENTAL TEXT (M7 round 1, plan 05 §2.2 / §4.3) — the copy seam and the
// approach-to-read system that drives it.
//
// The copy table is a SEAM: docs/story/township.md is not on disk yet, so every
// line but the marquee is a placeholder. What is on trial is that (a) every KEY
// the generator can produce resolves to a line, (b) the marquee says the one
// thing plan §2.2 fixes it to say, (c) township.md can be merged in later with
// no code change, and (d) the proximity system fires once on entry, records the
// read per-run, and is a no-op outside the Township.
//
// Pure: no three; the overlay is not touched (DOM lives in ui/envTextOverlay).

import { describe, it, expect } from 'vitest';
import {
  MARQUEE_TEXT,
  envEntryFor,
  envPlaceholderCount,
  envTextFor,
  loadTownshipEnvText,
  townshipEnvText,
} from '../../src/content/envText';
import { createWorld } from '../../src/core/world';
import { generateLake } from '../../src/gen/lakeMap';
import { updateEnvText, envReadCount } from '../../src/systems/envText';
import { dockPlayer } from '../../src/gen/lakeWorld';

const townshipWorld = (seed = 616) => {
  const w = createWorld(seed);
  w.lake = generateLake(seed, 3);
  w.run.zone = 3;
  return w;
};

describe('env text: the copy seam', () => {
  it('every key the generator can emit resolves to a line', () => {
    for (const seed of [1, 42, 616, 2024]) {
      const m = generateLake(seed, 3);
      for (const p of m.envPoints) {
        expect(envTextFor(p.key), `seed ${seed} key ${p.key}`).not.toBe('');
      }
    }
  });

  it('the marquee still advertises the film that played that night', () => {
    expect(MARQUEE_TEXT).toBe('SOMETHING IN THE WATER');
    expect(envTextFor('marquee')).toContain(MARQUEE_TEXT);
    // …and it is the one line that is NOT a placeholder
    expect(envEntryFor('marquee')!.placeholder).toBe(false);
  });

  it('reports how much copy is still waiting on township.md', () => {
    expect(envPlaceholderCount()).toBeGreaterThan(0);
    expect(envPlaceholderCount()).toBeLessThan(townshipEnvText().length);
  });

  it('township.md merges in at runtime — replacing entries and adding new ones', () => {
    const before = townshipEnvText().length;
    const merged = loadTownshipEnvText([
      { key: 'steeple', text: 'THE BELL IS STILL UP THERE.', placeholder: false },
      { key: 'willow-st', text: '14 WILLOW STREET.', placeholder: false },
      { key: 'bad-row' } as never,
    ]);
    expect(merged).toBe(2);
    expect(envTextFor('steeple')).toBe('THE BELL IS STILL UP THERE.');
    expect(envEntryFor('steeple')!.placeholder).toBe(false);
    expect(envTextFor('willow-st')).toBe('14 WILLOW STREET.');
    expect(townshipEnvText().length).toBe(before + 1);
  });

  it('an unknown key reads as nothing rather than throwing', () => {
    expect(envTextFor('no-such-sign')).toBe('');
    expect(envEntryFor('no-such-sign')).toBeNull();
  });
});

describe('env text: approach-to-read (the sim)', () => {
  it('is a no-op outside the Township', () => {
    const w = createWorld(616);
    w.lake = generateLake(616, 1);
    updateEnvText(w, 1 / 60);
    expect(w.township.pendingEnv).toBeNull();
    expect(w.township.nearEnv).toBeNull();
    expect(w.township.onRoof).toBeNull();
  });

  it('the marquee reads from the BOAT, down the street', () => {
    const w = townshipWorld();
    const marquee = w.lake!.envPoints.find((p) => p.key === 'marquee')!;
    // parked well outside every radius first
    w.boat.x = 1000;
    w.boat.z = 1000;
    updateEnvText(w, 1 / 60);
    expect(w.township.pendingEnv).toBeNull();

    // out in the channel, off the cinema's wall — past the roof's own 6.5 m
    // sign radius but well inside the marquee's, which is what it is FOR
    const cinema = w.lake!.roofs[marquee.roofId]!;
    const ax = marquee.pos.x - cinema.pos.x;
    const az = marquee.pos.z - cinema.pos.z;
    const len = Math.hypot(ax, az) || 1;
    w.boat.x = marquee.pos.x + (ax / len) * 10;
    w.boat.z = marquee.pos.z + (az / len) * 10;
    updateEnvText(w, 1 / 60);
    expect(w.township.pendingEnv).not.toBeNull();
    expect(w.township.pendingEnv!.text).toContain(MARQUEE_TEXT);
    expect(w.township.nearEnv).toBe(marquee.id);
  });

  it('fires ONCE on entry, not every tick, and re-fires on re-approach', () => {
    const w = townshipWorld();
    const roof = w.lake!.roofs[0]!;
    const point = w.lake!.envPoints.find((p) => p.roofId === roof.id && p.key !== 'marquee')!;

    w.boat.x = 1000;
    w.boat.z = 1000;
    updateEnvText(w, 1 / 60);

    w.boat.x = point.pos.x;
    w.boat.z = point.pos.z;
    updateEnvText(w, 1 / 60);
    expect(w.township.pendingEnv).not.toBeNull();
    w.township.pendingEnv = null; // the overlay consumes it

    updateEnvText(w, 1 / 60); // still standing there
    expect(w.township.pendingEnv).toBeNull();

    w.boat.x = 1000; // walk away…
    w.boat.z = 1000;
    updateEnvText(w, 1 / 60);
    expect(w.township.nearEnv).toBeNull();

    w.boat.x = point.pos.x; // …and back
    w.boat.z = point.pos.z;
    updateEnvText(w, 1 / 60);
    expect(w.township.pendingEnv).not.toBeNull();
  });

  it('records what has been read this run', () => {
    const w = townshipWorld();
    expect(envReadCount(w)).toBe(0);
    for (const p of w.lake!.envPoints.slice(0, 3)) {
      w.boat.x = 1000;
      w.boat.z = 1000;
      updateEnvText(w, 1 / 60);
      w.boat.x = p.pos.x;
      w.boat.z = p.pos.z;
      updateEnvText(w, 1 / 60);
      w.township.pendingEnv = null;
    }
    expect(envReadCount(w)).toBeGreaterThanOrEqual(1);
  });

  it('knows which roof the keeper is standing on', () => {
    const w = townshipWorld();
    const roof = w.lake!.roofs[1]!;
    dockPlayer(w, roof.isletId, { x: roof.pos.x, z: roof.pos.z });
    updateEnvText(w, 1 / 60);
    expect(w.township.onRoof).toBe(roof.id);
    // and the roof's own sign reads while you stand on it
    expect(w.township.pendingEnv).not.toBeNull();
  });
});
