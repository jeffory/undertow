import { describe, it, expect } from 'vitest';
import { waterHeightAt, WAVES, WAVE_MAX_HEIGHT } from '../../src/core/waves';

const SUM_AMPS = WAVES.reduce((s, w) => s + w.amplitude, 0);

describe('waterHeightAt (pure Gerstner sum)', () => {
  it('is deterministic for fixed (x, z, t)', () => {
    for (let i = 0; i < 20; i++) {
      const x = i * 1.7;
      const z = -i * 0.9;
      const t = i * 0.13;
      expect(waterHeightAt(x, z, t)).toBeCloseTo(waterHeightAt(x, z, t), 12);
    }
  });

  it('is bounded by ±sum of amplitudes', () => {
    for (let i = 0; i < 200; i++) {
      const x = (i % 13) * 3.1;
      const z = (i % 7) * 2.3;
      const t = i * 0.05;
      const h = waterHeightAt(x, z, t);
      expect(h).toBeGreaterThanOrEqual(-SUM_AMPS - 1e-9);
      expect(h).toBeLessThanOrEqual(SUM_AMPS + 1e-9);
    }
  });

  it('changes over time', () => {
    const x = 2.5;
    const z = -1.5;
    const samples = new Set<number>();
    for (let i = 0; i < 60; i++) {
      samples.add(waterHeightAt(x, z, i * 0.1));
    }
    expect(samples.size).toBeGreaterThan(1);
  });

  it('has zero height exactly at t=0 at the origin', () => {
    // all three waves are sin(0) = 0 there
    expect(waterHeightAt(0, 0, 0)).toBeCloseTo(0, 12);
  });

  it('touches near the amplitude bounds somewhere over a wave period', () => {
    // the slowest wave has period λ/c = 42/2 = 21s; sweep well past it so all
    // three sinusoids can align. With incommensurate frequencies the sum gets
    // within ~0.9 of the full ±1.23 amplitude span somewhere in that window.
    let maxSeen = -Infinity;
    for (let t = 0; t < 60; t += 1 / 120) {
      maxSeen = Math.max(maxSeen, waterHeightAt(0, 0, t));
    }
    expect(maxSeen).toBeGreaterThanOrEqual(0.8 * SUM_AMPS);
  });

  it('WAVE_MAX_HEIGHT is the Σ-amplitude bound the shader thresholds derive from', () => {
    // the water fragment shader's crest-accent + foam thresholds are fractions
    // of this value (single source of truth), so pin it to the wave table.
    expect(WAVE_MAX_HEIGHT).toBeCloseTo(SUM_AMPS, 12);
    expect(WAVE_MAX_HEIGHT).toBeCloseTo(1.23, 10);
  });
});