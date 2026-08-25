// TUNING — the six tether dials (plan 02 §2.4, spec 13.1).
// One struct on WorldState so the debug panel mutates it live and every system
// reads the same numbers. These six values ARE the game — no tether tuning
// constant is hardcoded anywhere else.

export interface TetherTuning {
  pullForce: number;       // dial 1 — lunge impulse magnitude (m/s)
  kTension: number;        // dial 2 — tension gain per metre of excess (per s)
  slackDecay: number;      // dial 3 — tension loss per s when slack
  braceEfficacy: number;   // dial 4 — 0..1, default 0.6 ("reduces displacement 60%")
  lungeTelegraph: number;  // dial 5 — seconds of telegraph before lunge/drag
  fishStaminaPool: number; // dial 6 — multiplier on FishTetherStats.maxStamina
}

export const DEFAULT_TUNING: TetherTuning = {
  pullForce: 4.0,
  kTension: 8.0,
  slackDecay: 35,
  braceEfficacy: 0.6,
  lungeTelegraph: 0.7,
  fishStaminaPool: 1.0,
};