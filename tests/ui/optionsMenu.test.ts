// OPTIONS MENU (ui) — task t12 #1. CIRCULAR 4 persistence + validation: the
// localStorage row must round-trip, corrupt/unknown rows must fall back per-field
// to current-behaviour defaults, and applyOptions must reach every seam without
// throwing (also proves the ui→render/game seam wiring has no import cycle).

import { describe, it, expect } from 'vitest';
import {
  defaultOptions,
  sanitizeOptions,
  loadOptions,
  saveOptions,
  applyOptions,
  type UndertowOptions,
  type StorageLike,
} from '../../src/ui/optionsMenu';

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  json(): string | null {
    return this.m.get('undertow.options.v1') ?? null;
  }
}

const fresh: UndertowOptions = {
  renderScale: 1,
  fogDensityScale: 1,
  postEnabled: true,
  reelStance: 'hold',
  // SCHEDULE B (t13): master 70%, every audio bed on.
  masterVolume: 0.7,
  droneEnabled: true,
  creakEnabled: true,
  heartbeatEnabled: true,
};

describe('options defaults & sanitization', () => {
  it('defaults equal current boot behaviour', () => {
    expect(defaultOptions()).toEqual(fresh);
  });

  it('rejects unknown rows, keeps known rows', () => {
    const o = sanitizeOptions({
      renderScale: 0.5,
      fogDensityScale: 2.5, // not a valid murk tier
      postEnabled: false,
      reelStance: 'toggle',
      masterVolume: 0.42, // not a valid master step
      droneEnabled: false,
      creakEnabled: 'yes', // wrong type
      heartbeatEnabled: false,
    });
    expect(o.renderScale).toBe(0.5);
    expect(o.fogDensityScale).toBe(1); // fell back to Standard
    expect(o.postEnabled).toBe(false);
    expect(o.reelStance).toBe('toggle');
    expect(o.masterVolume).toBe(0.7); // fell back to Standard
    expect(o.droneEnabled).toBe(false);
    expect(o.creakEnabled).toBe(true); // fell back — a string is not a toggle
    expect(o.heartbeatEnabled).toBe(false);
  });

  it('falls back wholesale on garbage input', () => {
    expect(sanitizeOptions(null)).toEqual(fresh);
    expect(sanitizeOptions('junk')).toEqual(fresh);
    expect(sanitizeOptions({})).toEqual(fresh);
  });

  it('only accepts the three render scales and three murk tiers', () => {
    expect([0.5, 0.75, 1].map((s) => sanitizeOptions({ renderScale: s }).renderScale)).toEqual(
      [0.5, 0.75, 1],
    );
    expect(sanitizeOptions({ renderScale: 2 }).renderScale).toBe(1);
    expect([0.7, 1, 1.4].map((m) => sanitizeOptions({ fogDensityScale: m }).fogDensityScale)).toEqual(
      [0.7, 1, 1.4],
    );
    expect(sanitizeOptions({ fogDensityScale: 3 }).fogDensityScale).toBe(1);
  });

  it('only accepts the four SCHEDULE B master steps', () => {
    expect([0, 0.35, 0.7, 1].map((v) => sanitizeOptions({ masterVolume: v }).masterVolume)).toEqual(
      [0, 0.35, 0.7, 1],
    );
    expect(sanitizeOptions({ masterVolume: 2 }).masterVolume).toBe(0.7);
    expect(sanitizeOptions({ masterVolume: -1 }).masterVolume).toBe(0.7);
  });
});

describe('localStorage persistence', () => {
  it('round-trips a configured row', () => {
    const s = new MemoryStorage();
    const cfg: UndertowOptions = {
      renderScale: 0.5,
      fogDensityScale: 1.4,
      postEnabled: false,
      reelStance: 'toggle',
      masterVolume: 0.35,
      droneEnabled: false,
      creakEnabled: true,
      heartbeatEnabled: false,
    };
    saveOptions(cfg, s);
    expect(s.json()).toBe(JSON.stringify(cfg));
    expect(loadOptions(s)).toEqual(cfg);
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadOptions(new MemoryStorage())).toEqual(fresh);
  });

  it('returns defaults when the stored row is corrupt', () => {
    const s = new MemoryStorage();
    s.setItem('undertow.options.v1', '{not json');
    expect(loadOptions(s)).toEqual(fresh);
  });
});

describe('applyOptions reaches every seam', () => {
  it('applies a full options row without throwing', () => {
    expect(() =>
      applyOptions({
        renderScale: 0.75,
        fogDensityScale: 0.7,
        postEnabled: false,
        reelStance: 'toggle',
        masterVolume: 1,
        droneEnabled: false,
        creakEnabled: false,
        heartbeatEnabled: false,
      }),
    ).not.toThrow();
    // and back to defaults is equally safe
    expect(() => applyOptions(fresh)).not.toThrow();
  });
});