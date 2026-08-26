// AUDIO PARAMS (audio) — task t13. The mapping curves are the testable half of
// the procedural audio system: the node graph is gesture-gated (a browser will
// not start an AudioContext outside a real click) but every decision about what
// the player hears is a pure function over world values, and all of it is
// asserted here, headless.

import { describe, it, expect } from 'vitest';
import {
  CREAK_MAX_GAIN,
  DRONE_BY_PHASE,
  HEART_BPM_MAX,
  HEART_BPM_MIN,
  HEART_GAIN_BY_TIER,
  SPLASH_MIN_PARTICLES,
  SPLASH_SPAN_PARTICLES,
  creakParams,
  droneParams,
  heartParams,
  loudestTension,
  secondsPerBeat,
  splashIntensityFromDelta,
  splashVoice,
} from '../../src/audio/params';
import { PHASE_ORDER } from '../../src/game/clock';
import { spawnBurst, createSplash } from '../../src/core/splash';
import { INTENSITY_HOOK, INTENSITY_LAND, INTENSITY_LUNGE } from '../../src/game/splashFx';

describe('lake drone (BASIN RESONANCE & FORMATION SAWS)', () => {
  it('covers every Night Clock phase', () => {
    for (const p of PHASE_ORDER) expect(droneParams(p)).toBe(DRONE_BY_PHASE[p]);
  });

  it('deepens from dusk to deep night: lower, louder, murkier', () => {
    const dusk = droneParams('dusk');
    const deep = droneParams('deepNight');
    expect(deep.baseHz).toBeLessThan(dusk.baseHz);
    expect(deep.toneGain).toBeGreaterThan(dusk.toneGain);
    expect(deep.noiseGain).toBeGreaterThan(dusk.noiseGain);
    expect(deep.cutoffHz).toBeLessThan(dusk.cutoffHz);
  });

  it('stays a quiet bed in every phase (never dominates the mix)', () => {
    for (const p of PHASE_ORDER) {
      const d = droneParams(p);
      expect(d.toneGain + d.noiseGain).toBeLessThan(0.25);
      expect(d.baseHz).toBeGreaterThanOrEqual(55);
      expect(d.baseHz).toBeLessThanOrEqual(65);
      expect(d.detuneHz).toBeGreaterThan(0); // the pair must beat, never lock
    }
  });

  it('falls back to dusk for an unknown phase', () => {
    expect(droneParams('midnight' as never)).toBe(DRONE_BY_PHASE.dusk);
  });
});

describe('line creak (BOWED-STRING SONIFICATION)', () => {
  it('is silent at slack and only at slack', () => {
    expect(creakParams(0, 100).gain).toBe(0);
    expect(creakParams(0.5, 100).gain).toBeGreaterThan(0);
    expect(creakParams(1, 100).gain).toBeGreaterThan(0);
  });

  it('rises monotonically in gain and pitch toward the ceiling', () => {
    let lastGain = -1;
    let lastFreq = -1;
    for (let t = 0; t <= 100; t += 5) {
      const c = creakParams(t, 100);
      expect(c.gain).toBeGreaterThanOrEqual(lastGain);
      expect(c.freq).toBeGreaterThanOrEqual(lastFreq);
      lastGain = c.gain;
      lastFreq = c.freq;
    }
  });

  it('stays a whisper through the low half and groans in the top quarter', () => {
    // the curve is deliberately steep: a half-tense line must not sound alarming
    expect(creakParams(40, 100).gain).toBeLessThan(0.1);
    expect(creakParams(90, 100).gain).toBeGreaterThan(0.4);
  });

  it('tops out at the ceiling and clamps above it', () => {
    const at = creakParams(100, 100);
    expect(at.gain).toBeCloseTo(CREAK_MAX_GAIN, 6);
    expect(creakParams(500, 100)).toEqual(at); // a snap frame never overdrives
  });

  it('scales off the equipped line, not a hardcoded 100', () => {
    // Waxed Linen (+10 ceiling) must sound the same at the same FRACTION
    expect(creakParams(55, 110).gain).toBeCloseTo(creakParams(50, 100).gain, 6);
  });

  it('never divides by a zero/absurd ceiling', () => {
    expect(Number.isFinite(creakParams(50, 0).gain)).toBe(true);
    expect(creakParams(50, 0).gain).toBeCloseTo(CREAK_MAX_GAIN, 6); // clamped to 1
  });

  it('the bow judder grows with load and vanishes at slack', () => {
    expect(creakParams(0, 100).wobbleDepth).toBe(0);
    expect(creakParams(100, 100).wobbleDepth).toBeGreaterThan(
      creakParams(50, 100).wobbleDepth,
    );
  });

  it('the loudest line owns the voice', () => {
    expect(loudestTension([])).toBe(0);
    expect(loudestTension([{ tension: 12 }, { tension: 71 }, { tension: 3 }])).toBe(71);
  });
});

describe('heartbeat (SUB-BASS DREAD MODULATION)', () => {
  it('is silent at tier 0', () => {
    const h = heartParams(0);
    expect(h.tier).toBe(0);
    expect(h.gain).toBe(0);
    expect(heartParams(19.9).gain).toBe(0);
  });

  it('starts at the tier-1 boundary and gets heavier each tier', () => {
    const gains = [20, 40, 60, 80].map((d) => heartParams(d).gain);
    expect(gains).toEqual(HEART_GAIN_BY_TIER.slice(1));
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]!).toBeGreaterThan(gains[i - 1]!);
    }
  });

  it('runs 40–70 bpm across the whole Dread range, rising with Dread', () => {
    expect(heartParams(0).bpm).toBeCloseTo(HEART_BPM_MIN, 6);
    expect(heartParams(100).bpm).toBeCloseTo(HEART_BPM_MAX, 6);
    let last = -1;
    for (const d of [0, 25, 50, 75, 100]) {
      const b = heartParams(d).bpm;
      expect(b).toBeGreaterThanOrEqual(HEART_BPM_MIN);
      expect(b).toBeLessThanOrEqual(HEART_BPM_MAX);
      expect(b).toBeGreaterThan(last);
      last = b;
    }
  });

  it('drops in pitch as it gets heavier (bigger, not faster-sounding)', () => {
    expect(heartParams(90).thumpHz).toBeLessThan(heartParams(25).thumpHz);
    expect(heartParams(90).thumpHz).toBeGreaterThan(30); // still sub-bass, not a rumble
  });

  it('secondsPerBeat inverts bpm and survives a zero', () => {
    expect(secondsPerBeat(60)).toBeCloseTo(1, 6);
    expect(secondsPerBeat(40)).toBeCloseTo(1.5, 6);
    expect(Number.isFinite(secondsPerBeat(0))).toBe(true);
  });
});

describe('splash one-shots (emitted-counter delta trigger)', () => {
  it('no burst → no sound', () => {
    expect(splashIntensityFromDelta(0)).toBeNull();
    expect(splashIntensityFromDelta(-5)).toBeNull(); // a reset world never fires
    expect(splashIntensityFromDelta(NaN)).toBeNull();
  });

  it('recovers the burst intensity a real spawnBurst emitted', () => {
    // The contract with core/splash.ts: count = 6 + round(18 × intensity).
    for (const i of [INTENSITY_HOOK, INTENSITY_LUNGE, INTENSITY_LAND]) {
      const s = createSplash();
      const before = s.emitted;
      spawnBurst(s, 0, 0, i);
      const got = splashIntensityFromDelta(s.emitted - before);
      expect(got).not.toBeNull();
      // round-trip is exact to the 1/18 quantisation of the particle count
      expect(Math.abs(got! - i)).toBeLessThanOrEqual(0.5 / SPLASH_SPAN_PARTICLES);
    }
  });

  it('the floor count is the quietest possible splash, never a null', () => {
    expect(splashIntensityFromDelta(SPLASH_MIN_PARTICLES)).toBe(0);
    expect(splashIntensityFromDelta(1)).toBe(0); // clamped, still a splash
  });

  it('several bursts in one display frame collapse into one loud splash', () => {
    const s = createSplash();
    const before = s.emitted;
    spawnBurst(s, 0, 0, INTENSITY_HOOK);
    spawnBurst(s, 1, 1, INTENSITY_LAND);
    expect(splashIntensityFromDelta(s.emitted - before)).toBe(1);
  });

  it('splashVoice sweeps downward and scales with intensity', () => {
    const small = splashVoice(0);
    const big = splashVoice(1);
    for (const v of [small, big]) expect(v.endHz).toBeLessThan(v.startHz);
    expect(big.gain).toBeGreaterThan(small.gain);
    expect(big.duration).toBeGreaterThan(small.duration);
    expect(splashVoice(5)).toEqual(big); // clamped
    expect(splashVoice(-5)).toEqual(small);
  });
});
