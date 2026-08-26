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
import { resolveKelpSnag } from '../gen/kelp';
import type { KelpSnagResult } from '../gen/kelp';
import { BOAT_HULL_RADIUS } from './boatObstacle';
import type { Anchor, TetherFight, TetherEndpoint, Vec2 } from './tether';
import { riderTensionBias } from './tether';
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

// --- M6 KELP DRAG-SNAG (plan 05 §2.1) ------------------------------------------
// "They block drag routes: a drag that would pull you through a kelp column
// instead snags you at the column edge. Braced players use kelp to ARREST
// drags." The arrest happens exactly where the pull displacement is applied —
// the hauled endpoint's write below — so nothing downstream (movement,
// collision, the water phase) can undo it or double-count it.
//
// Only the PLAYER/BOAT end is arrested: the catch is a fish, it swims through
// weed. Outside zone 2 `lake.kelp` is empty and this is a no-op.

const NO_SNAG: KelpSnagResult = { x: 0, z: 0, snagged: false, column: -1, arrested: 0 };

// The body radius the arrest keeps clear of a column: the keeper's own circle,
// or the boat's gunwale clearance (the same radius its obstacle response uses).
function hauledBodyRadius(world: WorldState, end: TetherEndpoint): number | null {
  if (end.owner === 'enemy') return null;
  if (end.anchor.kind === 'boat') return BOAT_HULL_RADIUS;
  if (end.anchor.kind === 'entity' && end.anchor.entityId === PLAYER_ENTITY) {
    return world.player.radius;
  }
  return null; // fixed anchors never move; other entities are not hauled bodies
}

// Arrest one endpoint's pull displacement at the first kelp column it crosses.
function arrestOnKelp(
  world: WorldState,
  end: TetherEndpoint,
  from: Vec2,
  to: Vec2,
): KelpSnagResult {
  const kelp = world.lake ? world.lake.kelp : null;
  if (!kelp || kelp.length === 0) return { ...NO_SNAG, x: to.x, z: to.z };
  const radius = hauledBodyRadius(world, end);
  if (radius === null) return { ...NO_SNAG, x: to.x, z: to.z };
  return resolveKelpSnag(kelp, from, to, radius);
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
    // The boat fight reels at the winch's rate (03 §6.1 `winch.rate`); every
    // other fight uses the equipped line's hand-reel rate.
    const rate = fight.reelRate ?? line.reelRate;
    fight.L = Math.max(
      floor,
      fight.L - rate * (exhausted ? reel.exhaustedMult : 1) * dt,
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

  // 3. LAND (plan §3 branch 3) — the contextual prompt at the gunwale. A boat
  // fight lands the same way (03 §6.1 "landing a Dragger"): winched in and
  // exhausted, accepted with the same verb, firing the same event.
  if (fight.land.eligible && world.intent.acceptLand) {
    world.tetherEvents.push({ type: 'landed', clean: true });
    world.fish = null; // the catch is despawned as caught (T6)
    return true;
  }

  // 4. CONSTRAINT (plan §3 branch 4, Addendum A.3) — mass-split position
  //    correction + tension from real overshoot, brace on the player endpoint.
  // The drag cooldown ticks every step, taut or slack — decaying it only while
  // taut froze the cooldown on a slack line, and decaying it after a fire ate
  // one dt of the fresh cooldown on the firing step.
  fight.drag.cooldown = Math.max(0, fight.drag.cooldown - dt);
  if (len > fight.L) {
    const nx = dx / len;
    const nz = dz / len;
    const excess = len - fight.L;
    // Mass-split share of the correction applied to the A end (heavier B → A
    // moves more). ∞/∞ and 0/0 both produce NaN through the naive ratio, so the
    // fixed-anchor (mass = ∞) and degenerate (sum ≤ 0) cases are explicit:
    // an infinite-mass end never moves; two immovable ends split nothing.
    const massA = fight.a.mass;
    const massB = fight.b.mass;
    let shareA: number;
    let shareB: number;
    if (massA === Infinity && massB === Infinity) {
      shareA = 0;
      shareB = 0;
    } else if (massA === Infinity) {
      shareA = 0;
      shareB = 1;
    } else if (massB === Infinity) {
      shareA = 1;
      shareB = 0;
    } else {
      const sum = massA + massB;
      shareA = sum > 0 ? massB / sum : 0.5;
      shareB = 1 - shareA;
    }
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
    const corrB = excess * shareB * braceB;
    // M6: the pull is routed through the kelp field before it lands. A clear
    // pull writes the same position it always did; a pull that crosses a column
    // stops at the column edge.
    const snagA = arrestOnKelp(world, fight.a, pa, { x: pa.x + nx * corrA, z: pa.z + nz * corrA });
    const snagB = arrestOnKelp(world, fight.b, pb, { x: pb.x - nx * corrB, z: pb.z - nz * corrB });
    aPos.write(snagA.x, snagA.z);
    bPos.write(snagB.x, snagB.z);
    fight.tension += excess * tuning.kTension * dt;

    // Drag detection (plan §4.2): displacement actually applied to the HAULED
    // end — the endpoint that is not the catch. For an M2 player fight that is
    // the keeper (unchanged); for a boat fight (03 §6.1) it is the hull, which
    // is what makes `drag` fire with `anchor: 'boat'` at all. Without this the
    // boat-anchored fight produced no drag events and a Dragger could never
    // take a bite of boat.
    const playerCorr = fight.a.owner === 'enemy' ? corrB : corrA;
    const snag = fight.a.owner === 'enemy' ? snagB : snagA;
    const drag = fight.drag;
    // Slide the window FIRST, then accumulate. Plan §4.2: "a single huge lunge
    // can exceed 1.5m in one frame — the window logic treats that as an
    // immediate drag." If we accumulated before the slide, a one-frame pull
    // landing exactly on a window boundary would be wiped before it could fire.
    if (world.time.elapsed - drag.windowStart > DRAG_WINDOW) {
      drag.windowStart = world.time.elapsed;
      drag.accumulated = 0;
    }
    drag.lastDir = { x: nx, z: nz };
    if (snag.snagged) {
      // The kelp took it. Drop the drag's remaining energy — the window resets
      // and no drag event fires from a pull that never landed. This is the
      // "braced at kelp = free arrest" the milestone is built around; the
      // cooldown rate-limits the event while the hauled body stays pinned
      // against the same column. Tension keeps climbing, because the line is
      // still over-extended: the arrest costs you the line, not the ground.
      drag.accumulated = 0;
      if (drag.cooldown <= 0) {
        world.tetherEvents.push({
          type: 'kelpSnag',
          fightId: fight.id,
          anchor: fight.anchor,
          at: { x: snag.x, z: snag.z },
          column: snag.column,
          arrested: snag.arrested,
        });
        drag.cooldown = DRAG_COOLDOWN;
      }
    } else {
      drag.accumulated += playerCorr;
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
    }
  } else {
    fight.tension -= tuning.slackDecay * dt;
  }
  // A THIRD ENTITY on the line (05 §2.2): while a rider holds on, tension gains
  // a steady upward bias — the steal-timer pressure, paid in the one currency
  // the player already reads. Taut or slack: the second mouth is pulling either
  // way. Zero on every fight without a rider, so nothing else moves.
  fight.tension += riderTensionBias(fight) * dt;
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

  // 6. EXHAUST / LAND eligibility (plan §3 branch 6) — player and boat fights
  // alike; the only difference is which endpoint the 2m gunwale gap is measured
  // from, and `len` above is already endpoint-to-endpoint.
  if (catchFishPtr) {
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