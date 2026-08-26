// AUDIO ENGINE (audio) — task t13. The whole soundtrack of UNDERTOW, synthesized
// at runtime by WebAudio. There are no audio files anywhere in this repo and
// there never will be: the same zero-external-assets rule the renderer follows
// (procedural lake, procedural sky) applies to the ear.
//
// Four voices, all diegetic-adjacent — no music:
//   1. BASIN RESONANCE & FORMATION SAWS  — the lake drone (constant bed)
//   2. BOWED-STRING SONIFICATION         — the line creak (tension → pitch/gain)
//   3. SUB-BASS DREAD MODULATION         — the heartbeat (dread tier → bpm/gain)
//   4. water one-shots                   — splash bursts, off splash.emitted
// under 5. MASTER VOLUME OF SLUICE AUTHORITY — the master gain.
//
// Rules this module obeys:
//   - reads `world`, NEVER writes it. The sim stays deterministic and audio-free.
//   - no `three` imports, no sim imports beyond pure clock/dread helpers.
//   - lazily constructed on the first real user gesture (browsers block autoplay).
//   - degrades to a total no-op with no AudioContext (vitest/node) — every entry
//     point returns early, so headless tests never touch WebAudio.
//
// All the actual number-crunching lives in ./params.ts (pure, tested headless).
// This file is the node graph and the schedulers.

import type { WorldState } from '../core/world';
import { phaseAt, runElapsedMs, type ClockPhase } from '../game/clock';
import {
  creakParams,
  droneParams,
  heartParams,
  loudestTension,
  secondsPerBeat,
  splashIntensityFromDelta,
  splashVoice,
} from './params';

// --- options (the SCHEDULE B rows) --------------------------------------------

export interface AudioOptions {
  masterVolume: number; // 0..1 — MASTER VOLUME OF SLUICE AUTHORITY
  droneEnabled: boolean; // BASIN RESONANCE & FORMATION SAWS
  creakEnabled: boolean; // BOWED-STRING SONIFICATION
  heartbeatEnabled: boolean; // SUB-BASS DREAD MODULATION
}

export const AUDIO_DEFAULTS: AudioOptions = {
  masterVolume: 0.7,
  droneEnabled: true,
  creakEnabled: true,
  heartbeatEnabled: true,
};

let options: AudioOptions = { ...AUDIO_DEFAULTS };

// Headroom on top of the user's master setting: the per-voice gains in
// params.ts are authored in the 0..0.55 range, so this keeps a full-tilt snap
// (creak at ceiling + heart at tier 4 + drone) from clipping the sum.
const MASTER_HEADROOM = 0.8;

// --- graph --------------------------------------------------------------------

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;

  // 1. lake drone
  droneBus: GainNode;
  droneNoiseLp: BiquadFilterNode;
  droneNoiseGain: GainNode;
  droneToneGain: GainNode;
  droneOscA: OscillatorNode;
  droneOscB: OscillatorNode;

  // 2. line creak
  creakBus: GainNode;
  creakSaw: OscillatorNode;
  creakBp: BiquadFilterNode;
  creakGain: GainNode;
  creakLfo: OscillatorNode;
  creakLfoDepth: GainNode;

  // 3. heartbeat (one-shots scheduled into this bus)
  heartBus: GainNode;

  // 4. water one-shots
  sfxBus: GainNode;

  noiseBuffer: AudioBuffer; // shared brown noise (looped for beds, sliced for hits)
}

let graph: Graph | null = null;
let gestureBound = false;

// live scheduler state (audio-clock, not sim-clock)
let nextBeatAt = 0;
let lastEmitted = -1;
let lastPhase: ClockPhase | null = null;
let lastBpm = 0;
let lastTension = 0;
// probe counters (?debug seam only — the game never reads them)
let splashCount = 0;
let beatCount = 0;

function AudioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// Brown-ish noise: white noise run through a leaky integrator. Two seconds is
// long enough that the loop point is inaudible under a lowpass. Math.random is
// fine here — this is presentation, never the sim's RNG.
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  // taper the seam so the loop doesn't tick
  const fade = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = (d[i] ?? 0) * k;
    d[len - 1 - i] = (d[len - 1 - i] ?? 0) * k;
  }
  return buf;
}

function loopNoise(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode): void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(dest);
  src.start();
}

function build(ctx: AudioContext): Graph {
  const noiseBuffer = makeNoiseBuffer(ctx);

  // Everything sums into master, and master goes out through a limiter. At full
  // tilt — deep-night drone + a creak at the ceiling + a tier-4 heart + a
  // landing splash on the same frame — the raw sum crosses 1.0, and a clipped
  // sub-bass thump sounds like a broken speaker rather than a heavy one.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = options.masterVolume * MASTER_HEADROOM;
  master.connect(limiter);

  // --- 1. BASIN RESONANCE & FORMATION SAWS -----------------------------------
  // brown noise → lowpass (the basin itself) + a detuned sine pair (the saws)
  const droneBus = ctx.createGain();
  droneBus.gain.value = options.droneEnabled ? 1 : 0;
  droneBus.connect(master);

  const droneNoiseGain = ctx.createGain();
  droneNoiseGain.gain.value = 0;
  droneNoiseGain.connect(droneBus);

  const droneNoiseLp = ctx.createBiquadFilter();
  droneNoiseLp.type = 'lowpass';
  droneNoiseLp.frequency.value = 320;
  droneNoiseLp.Q.value = 0.6;
  droneNoiseLp.connect(droneNoiseGain);
  loopNoise(ctx, noiseBuffer, droneNoiseLp);

  const droneToneGain = ctx.createGain();
  droneToneGain.gain.value = 0;
  droneToneGain.connect(droneBus);

  const droneOscA = ctx.createOscillator();
  droneOscA.type = 'sine';
  droneOscA.frequency.value = 65;
  droneOscA.connect(droneToneGain);
  droneOscA.start();

  const droneOscB = ctx.createOscillator();
  droneOscB.type = 'sine';
  droneOscB.frequency.value = 65.7; // the beat frequency IS the "saw"
  droneOscB.connect(droneToneGain);
  droneOscB.start();

  // --- 2. BOWED-STRING SONIFICATION ------------------------------------------
  // sawtooth (the string) + noise (the rosin) through one resonant bandpass
  // whose centre an LFO judders — the bow catching and slipping.
  const creakBus = ctx.createGain();
  creakBus.gain.value = options.creakEnabled ? 1 : 0;
  creakBus.connect(master);

  const creakGain = ctx.createGain();
  creakGain.gain.value = 0; // silent at slack
  creakGain.connect(creakBus);

  const creakBp = ctx.createBiquadFilter();
  creakBp.type = 'bandpass';
  creakBp.frequency.value = 80;
  creakBp.Q.value = 2;
  creakBp.connect(creakGain);

  const creakSaw = ctx.createOscillator();
  creakSaw.type = 'sawtooth';
  creakSaw.frequency.value = 40; // half the bandpass centre → rich harmonics
  creakSaw.connect(creakBp);
  creakSaw.start();

  const creakNoise = ctx.createGain();
  creakNoise.gain.value = 0.35;
  creakNoise.connect(creakBp);
  loopNoise(ctx, noiseBuffer, creakNoise);

  const creakLfoDepth = ctx.createGain();
  creakLfoDepth.gain.value = 0;
  creakLfoDepth.connect(creakBp.frequency);

  const creakLfo = ctx.createOscillator();
  creakLfo.type = 'sine';
  creakLfo.frequency.value = 5;
  creakLfo.connect(creakLfoDepth);
  creakLfo.start();

  // --- 3. SUB-BASS DREAD MODULATION ------------------------------------------
  const heartBus = ctx.createGain();
  heartBus.gain.value = options.heartbeatEnabled ? 1 : 0;
  heartBus.connect(master);

  // --- 4. water one-shots (always on under the master) -----------------------
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);

  return {
    ctx,
    master,
    limiter,
    droneBus,
    droneNoiseLp,
    droneNoiseGain,
    droneToneGain,
    droneOscA,
    droneOscB,
    creakBus,
    creakSaw,
    creakBp,
    creakGain,
    creakLfo,
    creakLfoDepth,
    heartBus,
    sfxBus,
    noiseBuffer,
  };
}

// --- lifecycle ----------------------------------------------------------------

// Create (or resume) the context. Only ever called from a real user gesture —
// an AudioContext built outside one starts 'suspended' and stays there.
export function unlockAudio(): void {
  const Ctor = AudioCtor();
  if (!Ctor) return;
  if (!graph) {
    try {
      graph = build(new Ctor());
    } catch {
      graph = null; // no output device / blocked — stay silent, never throw
      return;
    }
    nextBeatAt = graph.ctx.currentTime + 0.5;
  }
  if (graph.ctx.state === 'suspended') void graph.ctx.resume();
}

// Boot-time one-liner (main.ts). Binds the one-shot gesture listeners and, under
// ?debug, hangs the probe seam on window. Safe to call headless — with no
// window it does nothing at all.
export function initAudio(): void {
  if (typeof window === 'undefined' || gestureBound) return;
  gestureBound = true;
  const kick = (): void => unlockAudio();
  // capture phase so the title screen's own click handler can't stop it first
  window.addEventListener('pointerdown', kick, { capture: true });
  window.addEventListener('keydown', kick, { capture: true });
  window.addEventListener('touchstart', kick, { capture: true });

  if (typeof location !== 'undefined' && /[?&]debug/.test(location.search)) {
    (window as unknown as { __audio: unknown }).__audio = {
      unlock: () => unlockAudio(),
      snapshot: () => audioSnapshot(),
    };
  }
}

export function audioContextState(): string {
  return graph ? graph.ctx.state : 'none';
}

// Tiny read-only probe seam (?debug): everything the Playwright gate needs to
// assert the graph is alive and the creak is really tracking tension.
export interface AudioSnapshot {
  state: string;
  master: number;
  droneBus: number;
  droneTone: number;
  droneNoise: number;
  creakBus: number;
  creakGain: number;
  creakFreq: number;
  heartBus: number;
  bpm: number;
  tension: number;
  splashes: number; // one-shots fired since boot
  beats: number;    // heartbeats scheduled since boot
  options: AudioOptions;
}

export function audioSnapshot(): AudioSnapshot | null {
  if (!graph) return null;
  return {
    state: graph.ctx.state,
    master: graph.master.gain.value,
    droneBus: graph.droneBus.gain.value,
    droneTone: graph.droneToneGain.gain.value,
    droneNoise: graph.droneNoiseGain.gain.value,
    creakBus: graph.creakBus.gain.value,
    creakGain: graph.creakGain.gain.value,
    creakFreq: graph.creakBp.frequency.value,
    heartBus: graph.heartBus.gain.value,
    bpm: lastBpm,
    tension: lastTension,
    splashes: splashCount,
    beats: beatCount,
    options: { ...options },
  };
}

// --- options seam (ui/optionsMenu.ts applyOptions) -----------------------------
// Structural: UndertowOptions is a superset of AudioOptions, so the menu can
// hand its whole row over. Applies live — no restart, no rebuild.
export function setAudioOptions(o: AudioOptions): void {
  options = {
    masterVolume: Math.max(0, Math.min(1, o.masterVolume)),
    droneEnabled: !!o.droneEnabled,
    creakEnabled: !!o.creakEnabled,
    heartbeatEnabled: !!o.heartbeatEnabled,
  };
  if (!graph) return;
  const t = graph.ctx.currentTime;
  graph.master.gain.setTargetAtTime(options.masterVolume * MASTER_HEADROOM, t, 0.05);
  graph.droneBus.gain.setTargetAtTime(options.droneEnabled ? 1 : 0, t, 0.08);
  graph.creakBus.gain.setTargetAtTime(options.creakEnabled ? 1 : 0, t, 0.05);
  graph.heartBus.gain.setTargetAtTime(options.heartbeatEnabled ? 1 : 0, t, 0.08);
}

export function audioOptions(): AudioOptions {
  return { ...options };
}

// --- one-shots ----------------------------------------------------------------

// A lub-dub pair at `when` (audio clock): a short sine drop with a fast attack
// and a long-ish tail, then a softer echo a sixth of a second later.
function scheduleHeartbeat(g: Graph, when: number, hz: number, gain: number): void {
  beatCount++;
  for (const [offset, scale] of [[0, 1], [0.16, 0.6]] as const) {
    const t = when + offset;
    const osc = g.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, hz * 0.7), t + 0.16);
    const env = g.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * scale), t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(env);
    env.connect(g.heartBus);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

// A splash: a slice of the noise buffer through a bandpass swept downward — the
// bright crown of the strike collapsing into the swallow.
function playSplash(g: Graph, intensity: number): void {
  splashCount++;
  const v = splashVoice(intensity);
  const t = g.ctx.currentTime;

  const src = g.ctx.createBufferSource();
  src.buffer = g.noiseBuffer;
  src.loop = true;
  // start somewhere random in the loop so repeated splashes never phase-match
  const offset = Math.random() * (g.noiseBuffer.duration - v.duration - 0.05);

  const bp = g.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(v.startHz, t);
  bp.frequency.exponentialRampToValueAtTime(v.endHz, t + v.duration);

  const env = g.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(v.gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + v.duration);

  src.connect(bp);
  bp.connect(env);
  env.connect(g.sfxBus);
  src.start(t, Math.max(0, offset));
  src.stop(t + v.duration + 0.05);
}

// --- the per-frame update (ui phase, core/systems.ts) --------------------------

export function updateAudio(world: WorldState, _dt: number): void {
  // 1. Watch the splash counter even with no graph, so the first frame after an
  //    unlock doesn't fire a splash for every burst that happened before it.
  const emitted = world.splash.emitted;
  const delta = lastEmitted < 0 ? 0 : emitted - lastEmitted;
  lastEmitted = emitted;

  const g = graph;
  if (!g || g.ctx.state !== 'running') return;

  const t = g.ctx.currentTime;

  // --- 1. BASIN RESONANCE & FORMATION SAWS ------------------------------------
  const phase: ClockPhase = world.run
    ? phaseAt(runElapsedMs(world.run.startedAt, world.time.elapsed))
    : 'dusk';
  if (phase !== lastPhase) {
    lastPhase = phase;
    const d = droneParams(phase);
    // long constants: the lake sinks into deep night over ~4s, it never cuts
    g.droneOscA.frequency.setTargetAtTime(d.baseHz, t, 3);
    g.droneOscB.frequency.setTargetAtTime(d.baseHz + d.detuneHz, t, 3);
    g.droneToneGain.gain.setTargetAtTime(d.toneGain, t, 4);
    g.droneNoiseGain.gain.setTargetAtTime(d.noiseGain, t, 4);
    g.droneNoiseLp.frequency.setTargetAtTime(d.cutoffHz, t, 4);
  }

  // --- 2. BOWED-STRING SONIFICATION -------------------------------------------
  // Same seam the HUD gauge reads: world.tether.fights × world.line.tensionCeiling.
  const tension = loudestTension(world.tether.fights);
  lastTension = tension;
  const c = creakParams(tension, world.line.tensionCeiling);
  // fast constants — the creak must track a lunge spike, not lag behind it
  g.creakGain.gain.setTargetAtTime(c.gain, t, 0.04);
  g.creakBp.frequency.setTargetAtTime(c.freq, t, 0.05);
  g.creakBp.Q.setTargetAtTime(c.q, t, 0.1);
  g.creakSaw.frequency.setTargetAtTime(c.freq * 0.5, t, 0.05);
  g.creakLfo.frequency.setTargetAtTime(c.wobbleHz, t, 0.2);
  g.creakLfoDepth.gain.setTargetAtTime(c.wobbleDepth, t, 0.1);

  // --- 3. SUB-BASS DREAD MODULATION -------------------------------------------
  const h = heartParams(world.dread);
  lastBpm = h.gain > 0 ? h.bpm : 0;
  if (h.gain <= 0) {
    // tier 0: the lake hasn't noticed you. Park the scheduler at 'now' so the
    // first beat after a tier-up lands promptly instead of catching up.
    nextBeatAt = Math.max(nextBeatAt, t);
  } else {
    const period = secondsPerBeat(h.bpm);
    if (nextBeatAt < t) nextBeatAt = t + 0.05;
    // schedule a little ahead of the clock so a long frame can't drop a beat
    while (nextBeatAt < t + 0.25) {
      scheduleHeartbeat(g, nextBeatAt, h.thumpHz, h.gain);
      nextBeatAt += period;
    }
  }

  // --- 4. water one-shots ------------------------------------------------------
  const intensity = splashIntensityFromDelta(delta);
  if (intensity !== null) playSplash(g, intensity);
}

// Test seam: forget the graph + scheduler state (never used by the game).
export function resetAudioForTest(): void {
  graph = null;
  gestureBound = false;
  nextBeatAt = 0;
  lastEmitted = -1;
  lastPhase = null;
  lastBpm = 0;
  lastTension = 0;
  options = { ...AUDIO_DEFAULTS };
}
