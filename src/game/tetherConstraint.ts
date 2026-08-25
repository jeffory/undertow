// TETHER CONSTRAINT (game) — plan 02 §3 / Addendum A.3, the core system.
// Runs in the reserved `tetherConstraint` slot (systems.ts): AFTER intent,
// BEFORE movement, so it sees this frame's intents overlaid on last frame's
// positions and corrects positions directly. Semi-implicit Euler, no physics
// engine. All dials read live from world.tuning.
//
// RULE (plan 02 §1): this is the only system that mutates L, tension, the
// endpoints' positions in a pull sense, or fires tether events. movement and
// collision never fight it.
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { STAMINA_DELAY } from './stamina';
import type { Anchor, TetherFight, TetherEndpoint, Vec2 } from './tether';
import {
  PLAYER_ENTITY,
  FISH_ENTITY,
  LAND_DISTANCE,
  CUT_HOLD_SECONDS,
  LOW_TENSION_THRESHOLD,
  LOW_TENSION_EXHAUST,
  DRAG_WINDOW,
  DRAG_THRESHOLD,
  DRAG_COOLDOWN,
  SNAP_STAGGER,
  STUN_DURATION,
  STUN_TENSION_RESET,
  WIDOWS_HAIR_DAMAGE,
} from './tether';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// timer snapping so fixed-step ticks land on exact windows (same pattern as
// controller/stamina): the accumulated 30×(1/60) is 0.4999…94, which must read
// as exactly 0.5s so a cut fires on the 0.5s tick.
const EPS = 1e-9;

// --- position accessor for an endpoint anchor ----------------------------------
// M1's player/fish are not in the EntityStore yet; the special negative ids
// resolve to world.player / world.fish. 'fixed' ends never move; 'boat' reads
// world.boat. 03/05 slot their real entities in through the same seam.
interface PosAccessor {
  read(): { x: number; z: number };
  write(x: number, z: number): void;
}

const NULL_ACCESSOR: PosAccessor = { read: () => ({ x: 0, z: 0 }), write: () => {} };

function resolvePos(world: WorldState, anchor: Anchor): PosAccessor {
  switch (anchor.kind) {
    case 'entity': {
      if (anchor.entityId === PLAYER_ENTITY) {
        const p = world.player;
        return {
          read: () => ({ x: p.x, z: p.z }),
          write: (x, z) => {
            p.x = x;
            p.z = z;
          },
        };
      }
      if (anchor.entityId === FISH_ENTITY) {
        const f = world.fish;
        if (!f) return NULL_ACCESSOR;
        return {
          read: () => ({ x: f.x, z: f.z }),
          write: (x, z) => {
            f.x = x;
            f.z = z;
          },
        };
      }
      const es = world.entities;
      const i = anchor.entityId * 3;
      return {
        read: () => ({ x: es.positions[i] ?? 0, z: es.positions[i + 2] ?? 0 }),
        write: (x, z) => {
          es.positions[i] = x;
          es.positions[i + 2] = z;
        },
      };
    }
    case 'boat': {
      const b = world.boat;
      return {
        read: () => ({ x: b.x, z: b.z }),
        write: (x, z) => {
          b.x = x;
          b.z = z;
        },
      };
    }
    case 'fixed':
      return {
        read: () => ({ x: anchor.point.x, z: anchor.point.z }),
        write: () => {},
      };
  }
}

// --- helpers ---------------------------------------------------------------------

// The catch endpoint of a fight: the one owned by 'enemy'. M2's catch is the
// fish (world.fish). Returns the fish, or null when the fight has no fish catch
// (boat draggers are 03 entities, not world.fish).
function catchFish(world: WorldState, fight: TetherFight) {
  const ep = fight.a.owner === 'enemy' ? fight.a : fight.b.owner === 'enemy' ? fight.b : null;
  if (!ep || ep.anchor.kind !== 'entity' || ep.anchor.entityId !== FISH_ENTITY) return null;
  return world.fish;
}

function fishExhausted(world: WorldState, fight: TetherFight): boolean {
  const f = catchFish(world, fight);
  return f ? f.tether.exhausted : false;
}

function drainFishStamina(world: WorldState, fight: TetherFight, amount: number): void {
  const f = catchFish(world, fight);
  if (!f) return;
  f.stamina = Math.max(0, f.stamina - amount);
  if (f.stamina <= 0) f.tether.exhausted = true;
}

// The player's current normalized move direction (0,0 when idle). Brace opposes
// the pull with this.
function playerMoveDir(world: WorldState): Vec2 {
  const mx = world.intent.moveX;
  const my = world.intent.moveY;
  const len = Math.hypot(mx, my);
  if (len <= 1e-9) return { x: 0, z: 0 };
  return { x: mx / len, z: my / len };
}

// Reel hold flag, resolved per fight from the a-end's ReelSource (A.3). The
// player's reel input is ignored while a.reel.kind is 'ai'/'winch-post'/'none'.
function resolveReelHold(world: WorldState, end: TetherEndpoint): boolean {
  switch (end.reel.kind) {
    case 'player-stance':
      return world.intent.secondary;
    case 'winch-post':
      return world.boat.atWinchPost; // 03 fills
    case 'ai':
      return false; // 05 fills aiReelIntent; M2 stub = false
    case 'none':
      return false;
  }
}

// Which cut cost the F-ring incurs on this fight (A.3): 'lure' for M2, 'hull-segment'
// for boat. 'contextual' and 'none' ends never cut via the F-ring (reverse: 05's
// proximity action emits bossLineCut instead).
function resolveCutCost(fight: TetherFight): 'lure' | 'hull-segment' | null {
  for (const ep of [fight.a, fight.b]) {
    if (ep.cut.kind === 'lure' || ep.cut.kind === 'hull-segment') return ep.cut.kind;
  }
  return null;
}

function payLure(world: WorldState): void {
  world.lure.count = Math.max(0, world.lure.count - 1);
}

function snapCause(fight: TetherFight): 'reel' | 'lunge' | 'greed' {
  if (fight.reel.active) return 'reel';
  // 'lunge' if a lunge began within the last 0.5s — M2's fish AI has no lunge
  // producers yet (round 2); the telemetry field exists from day one.
  return 'greed';
}

// --- the system -------------------------------------------------------------------

// Returns true when the fight ended this step (cut / snap / land / catch death)
// so the caller removes it from world.tether.fights.
function stepFight(world: WorldState, fight: TetherFight, dt: number): boolean {
  const tuning = world.tuning;
  const line = world.line;
  const player = world.player;
  const aPos = resolvePos(world, fight.a.anchor);
  const bPos = resolvePos(world, fight.b.anchor);
  const pa = aPos.read();
  const pb = bPos.read();
  const dx = pb.x - pa.x;
  const dz = pb.z - pa.z;
  const len = Math.hypot(dx, dz);

  // 0. CATCH DEATH — hp reaches 0 before exhaustion → butchered (plan 6.3).
  // Fires the fight-end the step after combat drops hp to 0. Loot −1 tier flag
  // travels on the event (05 applies the actual tier).
  const catchFishPtr = catchFish(world, fight);
  if (catchFishPtr && catchFishPtr.hp <= 0) {
    world.tetherEvents.push({ type: 'butchered', lineId: line.id, minusOneTier: true });
    return true;
  }

  // 1. REEL (plan §3 branch 1, Addendum A.3)
  const reel = fight.reel;
  const drainPlayer = fight.a.reel.kind === 'player-stance';
  reel.hold = resolveReelHold(world, fight.a);
  reel.active = reel.hold && (!drainPlayer || player.stamina > 0);
  reel.speedMult = reel.active ? 0.5 : 1;
  if (reel.active) {
    const exhausted = fishExhausted(world, fight);
    const floor = Math.max(fight.a.radius, fight.b.radius); // L never below the hook radius
    fight.L = Math.max(
      floor,
      fight.L - line.reelRate * (exhausted ? reel.exhaustedMult : 1) * dt,
    );
    if (drainPlayer) {
      player.stamina = Math.max(0, player.stamina - reel.drain * dt);
      player.staminaRegenDelay = STAMINA_DELAY; // reeling pauses regen, like a spend
    }
    // Low-tension reeling exhausts the catch (plan 6.1) — the "reel to exhaust" lever.
    if (fight.tension < LOW_TENSION_THRESHOLD) {
      drainFishStamina(world, fight, LOW_TENSION_EXHAUST * dt);
    }
  }

  // 2. CUT (plan §3 branch 2, Addendum A.3) — F-ring, cost resolved at fire time.
  const cut = fight.cut;
  if (world.intent.cut) {
    cut.held += dt;
    if (cut.held >= CUT_HOLD_SECONDS - EPS) {
      cut.fired = true;
      cut.progress = 1;
      const cost = resolveCutCost(fight);
      if (cost !== null && (cost !== 'hull-segment' || world.boat.atCleat)) {
        if (cost === 'lure') payLure(world);
        world.tetherEvents.push({ type: 'cut', fightId: fight.id, lineId: line.id, cost });
      }
      return true; // fight ends either way
    }
  } else {
    cut.held = 0;
    cut.fired = false;
  }
  cut.progress = Math.min(1, cut.held / CUT_HOLD_SECONDS);

  // 3. LAND (plan §3 branch 3) — primary (player) fight only, eligibility set below.
  if (fight.anchor === 'player' && fight.land.eligible && world.intent.acceptLand) {
    world.tetherEvents.push({ type: 'landed', clean: true });
    world.fish = null; // the catch is despawned as caught (T6)
    return true;
  }

  // 4. CONSTRAINT (plan §3 branch 4, Addendum A.3) — mass-split position
  //    correction + tension from real overshoot, brace on the player endpoint.
  if (len > fight.L) {
    const nx = dx / len;
    const nz = dz / len;
    const excess = len - fight.L;
    const shareA = fight.b.mass / (fight.a.mass + fight.b.mass); // 0 < share < 1 (fixed = ∞ → 0)
    const move = playerMoveDir(world);
    const braceA =
      fight.a.owner === 'player'
        ? 1 - tuning.braceEfficacy * Math.max(0, move.x * nx + move.z * nz)
        : 1;
    const braceB =
      fight.b.owner === 'player'
        ? 1 - tuning.braceEfficacy * Math.max(0, move.x * -nx + move.z * -nz)
        : 1;
    const corrA = excess * shareA * braceA;
    const corrB = excess * (1 - shareA) * braceB;
    aPos.write(pa.x + nx * corrA, pa.z + nz * corrA);
    bPos.write(pb.x - nx * corrB, pb.z - nz * corrB);
    fight.tension += excess * tuning.kTension * dt;

    // Drag detection (plan §4.2): displacement actually applied to the PLAYER end.
    const playerCorr = fight.a.owner === 'player' ? corrA : fight.b.owner === 'player' ? corrB : 0;
    const drag = fight.drag;
    drag.accumulated += playerCorr;
    drag.lastDir = { x: nx, z: nz };
    if (world.time.elapsed - drag.windowStart > DRAG_WINDOW) {
      drag.windowStart = world.time.elapsed;
      drag.accumulated = 0;
    }
    if (drag.accumulated > DRAG_THRESHOLD && drag.cooldown <= 0) {
      // Round 2A hook: the fish AI tags the pull source (lunge burst vs dive
      // swim) so render/log know what kind of yank this was.
      const ai = catchFish(world, fight)?.ai;
      const by = ai ? ai.pullBy : 'lunge';
      world.tetherEvents.push({
        type: 'drag',
        fightId: fight.id,
        anchor: fight.anchor,
        dir: { x: nx, z: nz },
        magnitude: drag.accumulated,
        by,
      });
      drag.accumulated = 0;
      drag.cooldown = DRAG_COOLDOWN;
    }
    drag.cooldown = Math.max(0, drag.cooldown - dt);
  } else {
    fight.tension -= tuning.slackDecay * dt;
  }
  fight.tension = clamp(fight.tension, 0, line.tensionCeiling);

  // 5. SNAP (plan §3 branch 5 / §5.3) — switch on the line's SnapBehavior.
  if (fight.tension >= line.tensionCeiling) {
    const behavior = line.snap;
    if (behavior === 'stun') {
      // Bellwire: fish stunned ~2s, tension reset, line never snaps (once/fight is 05's).
      const f = catchFish(world, fight);
      if (f && f.hp > 0) {
        f.state = 'hurt';
        f.stateTimer = STUN_DURATION;
      }
      fight.tension = STUN_TENSION_RESET;
    } else if (behavior === 'damagePlayer') {
      // Widow's Hair: direct player damage at the ceiling, tension resets.
      player.hp = Math.max(0, player.hp - WIDOWS_HAIR_DAMAGE);
      fight.tension = 0;
    } else {
      // 'free' (base): lose lure, catch escapes, player staggered, fight ends.
      fight.snap.fired = true;
      fight.snap.cause = snapCause(fight);
      payLure(world);
      player.stagger = SNAP_STAGGER;
      world.tetherEvents.push({
        type: 'snap',
        fightId: fight.id,
        cause: fight.snap.cause,
        lineId: line.id,
        side: fight.a.owner === 'player' ? 'player' : 'enemy',
      });
      return true;
    }
  }

  // 6. EXHAUST / LAND eligibility (plan §3 branch 6) — primary fight only.
  if (fight.anchor === 'player' && catchFishPtr) {
    if (catchFishPtr.stamina <= 0) catchFishPtr.tether.exhausted = true;
    fight.land.eligible = catchFishPtr.tether.exhausted && len < LAND_DISTANCE;
  }

  return false;
}

export function updateTetherConstraint(world: WorldState, dt: number): void {
  // CONTRACT: the tether event stream is cleared each tick by the FIRST
  // producer — the tethered-fight AI (fishAI.ts, end of the intent phase) —
  // which runs before this system and pushed its telegraph/lunge events. This
  // system then appends its own (drag/snap/cut/landed/butchered). Consumers
  // (render/audio/ui, playtest log) read the fresh combined stream after this.
  const t = world.tether;
  if (t.fights.length === 0) return; // no active tether — no-op

  // Iterate in fixed id order (deterministic, spec 8.3); fights may end this step.
  for (let i = 0; i < t.fights.length; i++) {
    const fight = t.fights[i];
    if (!fight) continue;
    if (stepFight(world, fight, dt)) {
      t.fights.splice(i, 1);
      i--;
    }
  }
}