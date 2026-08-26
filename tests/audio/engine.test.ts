// AUDIO ENGINE (audio) — task t13, the headless half. Under vitest there is no
// window and no AudioContext at all, which is exactly the contract this file
// pins down: every entry point must be a silent no-op rather than a throw, so
// the whole suite (and any future node-side sim harness) stays green with the
// audio system wired into UPDATE_ORDER.
//
// The node graph itself cannot be asserted here — it is gesture-gated by the
// browser. That half is covered by the Playwright probe (tools/_t13_probe.mjs).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUDIO_DEFAULTS,
  audioContextState,
  audioOptions,
  audioSnapshot,
  initAudio,
  resetAudioForTest,
  setAudioOptions,
  updateAudio,
} from '../../src/audio/engine';
import { createWorld } from '../../src/core/world';
import { spawnBurst } from '../../src/core/splash';

beforeEach(() => resetAudioForTest());

describe('headless degradation (no AudioContext)', () => {
  it('never builds a context and reports none', () => {
    initAudio();
    expect(audioContextState()).toBe('none');
    expect(audioSnapshot()).toBeNull();
  });

  it('updateAudio is a no-op across a whole simulated run', () => {
    const world = createWorld(7);
    expect(() => {
      for (let i = 0; i < 600; i++) {
        world.dread = (i / 600) * 100;
        world.tether.fights.push({ tension: i % 100 } as never);
        world.tether.fights.length = 0;
        spawnBurst(world.splash, 0, 0, 0.6);
        updateAudio(world, 1 / 60);
      }
    }).not.toThrow();
  });

  it('the options seam applies and reads back without a graph', () => {
    expect(audioOptions()).toEqual(AUDIO_DEFAULTS);
    setAudioOptions({
      masterVolume: 0.35,
      droneEnabled: false,
      creakEnabled: true,
      heartbeatEnabled: false,
    });
    expect(audioOptions()).toEqual({
      masterVolume: 0.35,
      droneEnabled: false,
      creakEnabled: true,
      heartbeatEnabled: false,
    });
  });

  it('clamps a nonsense master volume instead of trusting it', () => {
    setAudioOptions({ ...AUDIO_DEFAULTS, masterVolume: 9 });
    expect(audioOptions().masterVolume).toBe(1);
    setAudioOptions({ ...AUDIO_DEFAULTS, masterVolume: -3 });
    expect(audioOptions().masterVolume).toBe(0);
  });
});

describe('audio never writes the sim', () => {
  it('leaves the world byte-identical after an update', () => {
    const world = createWorld(11);
    world.dread = 73;
    spawnBurst(world.splash, 2, 3, 1);
    const before = JSON.stringify(world, (_k, v) => (v instanceof Set ? [...v] : v));
    updateAudio(world, 1 / 60);
    updateAudio(world, 1 / 60);
    const after = JSON.stringify(world, (_k, v) => (v instanceof Set ? [...v] : v));
    expect(after).toBe(before);
  });
});
