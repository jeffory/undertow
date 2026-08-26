// AUDIO PARAMS (audio) — task t13. The pure half of the procedural audio
// system: every "world value → synth parameter" mapping lives here, with no
// WebAudio, no DOM and no `three`. engine.ts owns the node graph and does
// nothing but push these numbers at AudioParams.
//
// Keeping the mappings pure is what makes the system testable headless: the
// node graph is gesture-gated (browsers block autoplay until a real click), but
// the curves that decide what the player hears are ordinary functions.

import type { ClockPhase } from '../game/clock';
import { tierFor, heartbeatBpm, type DreadTier } from '../game/dread';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// --- 1. BASIN RESONANCE & FORMATION SAWS (lake drone) -------------------------
// A constant, very quiet bed: filtered brown noise (the basin) under a detuned
// sine pair (the "formation saws" — two near-unison lows that beat against each
// other). It deepens with the Night Clock: dusk is a thin hum, deepNight is a
// heavy, darker, slower-beating floor.

export interface DroneParams {
  baseHz: number;    // the lower sine of the pair
  detuneHz: number;  // the upper sine sits this far above → audible beating
  toneGain: number;  // sine-pair bus gain (pre-master)
  noiseGain: number; // brown-noise bus gain (pre-master)
  cutoffHz: number;  // lowpass on the noise — lower = murkier
}

export const DRONE_BY_PHASE: Record<ClockPhase, DroneParams> = {
  dusk:      { baseHz: 65, detuneHz: 0.7,  toneGain: 0.050, noiseGain: 0.060, cutoffHz: 320 },
  night:     { baseHz: 61, detuneHz: 0.55, toneGain: 0.070, noiseGain: 0.080, cutoffHz: 260 },
  deepNight: { baseHz: 55, detuneHz: 0.35, toneGain: 0.100, noiseGain: 0.110, cutoffHz: 200 },
  falseDawn: { baseHz: 58, detuneHz: 0.5,  toneGain: 0.062, noiseGain: 0.070, cutoffHz: 280 },
};

export function droneParams(phase: ClockPhase): DroneParams {
  return DRONE_BY_PHASE[phase] ?? DRONE_BY_PHASE.dusk;
}

// --- 2. BOWED-STRING SONIFICATION (line tension creak) ------------------------
// THE signature sound. A bandpassed sawtooth + noise pair whose pitch, gain and
// resonance all track fight.tension / line.tensionCeiling — the exact seam the
// HUD gauge reads (ui/hud.ts). Silent at slack (tension 0 → gain 0), a faint
// rosin whisper through the mid-range, a hard groan as it nears the ceiling.
//
// The curve is deliberately steep (p^2.2) rather than floored at a threshold:
// gain is strictly zero at zero tension and strictly positive above it, so the
// sound never "clicks on", it swells.

export interface CreakParams {
  gain: number;      // creak bus gain (pre-master), 0 at slack
  freq: number;      // bandpass centre — the bowed string's pitch
  q: number;         // resonance — tighter and whinier under load
  wobbleHz: number;  // LFO rate on the bandpass (the bow's judder)
  wobbleDepth: number; // Hz of LFO swing — 0 at slack
}

export const CREAK_MAX_GAIN = 0.55;
export const CREAK_BASE_HZ = 80;
export const CREAK_SPAN_HZ = 320;

export function creakParams(tension: number, ceiling: number): CreakParams {
  const p = clamp01(tension / Math.max(1, ceiling));
  return {
    gain: CREAK_MAX_GAIN * Math.pow(p, 2.2),
    freq: CREAK_BASE_HZ + CREAK_SPAN_HZ * Math.pow(p, 1.3),
    q: 2 + 10 * p,
    wobbleHz: 4.5 + 5 * p,
    wobbleDepth: 55 * p * p,
  };
}

// The loudest fight wins the creak voice: one bowed string, however many lines
// are in the water (the HUD gauge shows fights[0]; the ear should hear whichever
// line is actually screaming).
export function loudestTension(fights: { tension: number }[]): number {
  let max = 0;
  for (const f of fights) if (f.tension > max) max = f.tension;
  return max;
}

// --- 3. SUB-BASS DREAD MODULATION (heartbeat) ---------------------------------
// A soft ~50 Hz lub-dub pair at 40–70 bpm, scaling with the Dread tier the
// debug overlay reads (game/dread.ts tierFor / heartbeatBpm). Tier 0 is silent:
// the heart only starts once the lake has noticed you.

export interface HeartParams {
  tier: DreadTier;
  bpm: number;
  gain: number;   // 0 at tier 0
  thumpHz: number; // the sub-bass fundamental
}

export const HEART_GAIN_BY_TIER = [0, 0.12, 0.21, 0.30, 0.39];
export const HEART_HZ = 50;
export const HEART_BPM_MIN = 40;
export const HEART_BPM_MAX = 70;

// game/dread.ts::heartbeatBpm is the plan §4.5 curve, 40 → 100 bpm across the
// Dread range. t13 specifies a 40–70 bpm heart, so the curve is compressed into
// that window rather than re-derived: dread.ts stays the single source of the
// shape (linear in Dread, floored at 40), this just sets the top of the range.
// A 100 bpm sub-bass thump reads as a drum machine; 70 still reads as a body.
export function heartBpm(dread: number): number {
  const wide = heartbeatBpm(dread); // 40..100
  return HEART_BPM_MIN + (wide - 40) * ((HEART_BPM_MAX - HEART_BPM_MIN) / 60);
}

export function heartParams(dread: number): HeartParams {
  const tier = tierFor(dread);
  return {
    tier,
    bpm: heartBpm(dread),
    gain: HEART_GAIN_BY_TIER[tier] ?? 0,
    // the heart drops a little as it gets heavier — bigger, not faster-sounding
    thumpHz: HEART_HZ - 4 * (tier / 4),
  };
}

export function secondsPerBeat(bpm: number): number {
  return 60 / Math.max(1, bpm);
}

// --- 4. SPLASH ONE-SHOTS (water) ----------------------------------------------
// AUDIO IS RENDER-SIDE: updateAudio runs in the ui phase, which presents ONCE
// per display frame however many fixed sim steps that frame ran. Reading
// world.tetherEvents here would silently drop events on a multi-step frame (the
// exact reason game/splashFx.ts is a sim system). So instead of the event
// stream we watch the monotonic counter splashFx leaves behind:
// world.splash.emitted only ever grows, by 6 + round(18 × intensity) particles
// per burst (core/splash.ts spawnBurst). A frame's delta therefore carries both
// "a burst happened" and roughly how big it was — nothing is ever missed,
// whatever the step batching.
//
// Multiple bursts inside one frame collapse into a single, louder splash. That
// is the honest trade for a render-side consumer, and it is also what a hook-set
// landing on the same frame as a lunge should sound like anyway.

export const SPLASH_MIN_PARTICLES = 6;  // spawnBurst's floor (intensity 0)
export const SPLASH_SPAN_PARTICLES = 18; // …plus this many at intensity 1

// null = no burst this frame. Otherwise the burst intensity in 0..1.
export function splashIntensityFromDelta(delta: number): number | null {
  if (!Number.isFinite(delta) || delta <= 0) return null;
  return clamp01((delta - SPLASH_MIN_PARTICLES) / SPLASH_SPAN_PARTICLES);
}

export interface SplashVoice {
  gain: number;      // peak of the noise burst
  startHz: number;   // bandpass centre at the strike…
  endHz: number;     // …swept down to this (the pitch-down "gulp")
  duration: number;  // seconds
}

export function splashVoice(intensity: number): SplashVoice {
  const i = clamp01(intensity);
  return {
    gain: 0.10 + 0.30 * i,
    startHz: 900 + 1500 * i,
    endHz: 160 + 140 * i,
    duration: 0.28 + 0.5 * i,
  };
}
