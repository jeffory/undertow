// tools/tether-gate.mjs — M2 GATE (T12), the fun-or-dead evidence pass (plan 02 §12 T12,
// spec 13.1, plan 06 "Gate-driver speed"). Runs the real app headless at
// ?timescale=10 with window.__world / window.__tetherLog exposed, drives six
// scripted tether fights with REAL key/mouse events, prints the playtest-log
// summary per fight, asserts each outcome event, and exits 0 only if all six
// behave. Screenshots: (a) landing moment, (c) red line near snap, (e) underwater.
//
// The six fights:
//   (a) ANGLER   — manage tension (reel on slack, release on spikes) → exhaust,
//                  reel in, LAND the exhausted catch. Asserts landed + fish despawn.
//   (b) BUTCHER  — reel the catch into gaff reach, gaff it down before/regardless
//                  of exhaustion. Asserts butchered + minusOneTier.
//   (c) SNAP     — reel greedily into the lunges and walk away → tension 100.
//                  Asserts snap + lure lost + red-line screenshot near the ceiling.
//   (d) CUT      — let a drag pull the player, then cut mid-drag (hold F). Asserts
//                  cut + lure spent.
//   (e) DRAGGED  — a routed drag pulls the player past the shoreline → water phase,
//                  survive (breath drains to 0, NOT lethal), struggle back to shore.
//                  Asserts pulledUnder/enterWaterPhase + surfaced + the ui.underwater
//                  tint hook + hp intact at breath 0.
//   (f) BRACE    — measure the constraint pull over a clean single sim tick, idle vs
//                  walking into the pull. Asserts ~60% reduction at braceEfficacy 0.6
//                  and that the dial scales it (0.3 → ~70% of unbraced).
//
// Usage: node tools/tether-gate.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

// seed pinned (t16 flake investigation): unpinned, parseRunSeed rolled a random
// lake per run and scenario B became a coin flip under load. Same investigation:
// MAX_STEPS_PER_FRAME used to cap the effective timescale to ~4x on a loaded
// machine (core/time.ts now scales the cap with ?timescale), and per-scenario
// wall budgets are 60s (not 30s).
// KNOWN RESIDUAL FLAKE: scenario B drives real gaff taps at WALL speed against
// a 10x sim — on a heavily loaded machine the driver can lose that footrace
// and time out. A B-timeout on a loaded box is suspect; rerun once on a quiet
// machine before treating it as a regression (see docs/decisions.md).
const URL = 'http://localhost:5173/?mode=foot&debug&timescale=10&seed=2026';
const WALK_SPEED = 4.5; // controller.ts WALK_SPEED — the movement walk while braced
const GROUND_R = 20; // world.ts GROUND_RADIUS
const PLAYER_R = 0.5; // shore threshold = GROUND_R - PLAYER_R = 19.5

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// --- transcript ---------------------------------------------------------------
const log = [];
function line(s) {
  log.push(s);
  console.log(s);
}
const failures = [];
function assert(cond, msg) {
  line(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
}
function track(name, v) {
  line(`      ${name}: ${v}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- page console (the playtest log prints here as fights end) -----------------
const tetherConsole = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[tether]')) tetherConsole.push(t);
});
page.on('pageerror', (e) => line(`[pageerror] ${e.message}`));

// --- world access --------------------------------------------------------------
async function getWorld() {
  return page.evaluate(() => {
    const w = window.__world;
    if (!w) return null;
    const fight = w.tether.fights[0] ?? null;
    return {
      elapsed: w.time.elapsed,
      timescale: w.time.timescale,
      player: {
        x: w.player.x, z: w.player.z, hp: w.player.hp, stamina: w.player.stamina,
        dodge: { active: w.player.dodge.active },
      },
      fish: w.fish
        ? {
            x: w.fish.x, z: w.fish.z, hp: w.fish.hp, stamina: w.fish.stamina,
            exhausted: w.fish.tether.exhausted, state: w.fish.state,
          }
        : null,
      fight: fight
        ? {
            id: fight.id, L: fight.L, tension: fight.tension,
            reelActive: fight.reel.active, landEligible: fight.land.eligible,
          }
        : null,
      combat: { attackTimer: w.combat.attackTimer, comboStage: w.combat.comboStage, swingIsHeavy: w.combat.swingIsHeavy },
      intent: { primary: w.intent.primary, secondary: w.intent.secondary, moveX: w.intent.moveX, moveY: w.intent.moveY },
      fights: w.tether.fights.length,
      water: {
        active: w.water.active, breath: w.water.breath, breathMax: w.water.breathMax,
        towardShore: { x: w.water.towardShore.x, z: w.water.towardShore.z },
      },
      ui: { underwater: w.ui.underwater },
      lure: w.lure.count,
    };
  });
}

async function waitWorld(predicate, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const w = await getWorld();
    if (w && predicate(w)) return w;
    await sleep(20);
  }
  throw new Error(`timeout waiting for: ${what}`);
}

async function getLog() {
  return page.evaluate(() => window.__tetherLog.getSessionLog());
}

async function printSessionSummary() {
  return page.evaluate(() => window.__tetherLog.printSessionSummary());
}

async function tintVisible() {
  return page.evaluate(() => !!document.getElementById('underwater-tint'));
}

// --- real input ----------------------------------------------------------------
let heldKeys = new Set();

async function press(key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}

async function moveTo(keys) {
  const target = new Set(keys);
  for (const k of [...heldKeys]) {
    if (!target.has(k)) {
      await page.keyboard.up(k);
      heldKeys.delete(k);
    }
  }
  for (const k of target) {
    if (!heldKeys.has(k)) {
      await page.keyboard.down(k);
      heldKeys.add(k);
    }
  }
}

async function releaseAll() {
  await moveTo([]);
}

async function holdRmb() {
  await page.mouse.down({ button: 'right' });
}

async function releaseRmb() {
  await page.mouse.up({ button: 'right' });
}

async function tapLmb() {
  // At timescale=10 a 15ms hold is 0.15 sim s — a light tap (< 0.35s heavy floor).
  await page.mouse.down();
  await sleep(15);
  await page.mouse.up();
}

async function heavyLmb() {
  // At any effective rate seen (≈2.3–10×), a 200ms wall hold is ≥0.46 sim s —
  // comfortably past the 0.35s heavy floor, so this always fires a HEAVY.
  await page.mouse.down();
  await sleep(200);
  await page.mouse.up();
}

// --- screenshots ---------------------------------------------------------------
async function shot(name) {
  const path = `tools/gate-${name}.png`;
  await page.screenshot({ path });
  return path;
}

// Drop to real time for a composed screenshot, then restore the gate timescale.
async function shotAtRealTime(name) {
  await page.evaluate(() => {
    window.__world.time.timescale = 1;
  });
  await sleep(60);
  const path = await shot(name);
  await page.evaluate(() => {
    window.__world.time.timescale = 10;
  });
  return path;
}

// --- geometry / facing helpers (same 8-dir convention as tools/fight.mjs) ------
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function keysToward(dx, dz) {
  const k = [];
  if (dz > 0.35) k.push('KeyW');
  else if (dz < -0.35) k.push('KeyS');
  if (dx > 0.35) k.push('KeyD');
  else if (dx < -0.35) k.push('KeyA');
  return k;
}

function keysToAngle(a) {
  const b = Math.round(((((a * 180) / Math.PI) % 360 + 360) % 360) / 45) % 8;
  const k = [];
  if (b === 0 || b === 1 || b === 7) k.push('KeyW');
  if (b === 3 || b === 4 || b === 5) k.push('KeyS');
  if (b === 1 || b === 2 || b === 3) k.push('KeyD');
  if (b === 5 || b === 6 || b === 7) k.push('KeyA');
  return k;
}

// --- boot / fight start ----------------------------------------------------------
async function boot() {
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.mouse.move(640, 360);
  await waitWorld((w) => w && w.fights === 0 && w.fish !== null, 10000, 'foot mode + fish spawn');
}

async function startFight() {
  await press('KeyT', 60);
  await waitWorld((w) => w.fights === 1, 8000, 'tether fight start');
}

function printFightConsole() {
  for (const t of tetherConsole) line(`      [log] ${t}`);
  tetherConsole.length = 0;
}

// ================================================================================
// FIGHT 1 — ANGLER
// ================================================================================
async function fightAngler() {
  line('');
  line('=== FIGHT 1: ANGLER — manage tension, reel on slack, land the exhausted fish ===');
  await boot();
  await startFight();

  // Phase 1 — exhaust: reel at low tension (the 12/s exhaust lever), release on
  // spikes or when the player's own stamina runs low.
  const t0 = Date.now();
  let exhausted = false;
  while (Date.now() - t0 < 60000) {
    const w = await getWorld();
    if (!w || !w.fight) break;
    if (w.fish && w.fish.exhausted) {
      exhausted = true;
      break;
    }
    if (w.fight.tension < 35 && w.player.stamina > 20) await holdRmb();
    else await releaseRmb();
    await sleep(15);
  }
  assert(exhausted, 'A: fish exhausted (stamina 0)');
  await releaseRmb();

  // Phase 2 — land: reel the exhausted catch in (2× reel rate), then accept the
  // contextual prompt the moment it is eligible.
  const t1 = Date.now();
  let landingShot = null;
  let landed = false;
  while (Date.now() - t1 < 60000) {
    const w = await getWorld();
    if (!w || !w.fight) break;
    if (w.fight.landEligible) {
      if (!landingShot) landingShot = await shotAtRealTime('a-landing');
      await press('KeyE', 60);
      landed = true;
      break;
    }
    if (w.fight.tension > 75 || w.player.stamina < 12) await releaseRmb();
    else await holdRmb();
    await sleep(15);
  }
  assert(landed, 'A: LAND prompt accepted');
  await releaseAll();
  // the landed fight is removed; the spawn system then swims up a NEW fish (the
  // caught one is gone), so assert on fights, not on fish===null
  await waitWorld((w) => w.fights === 0, 8000, 'A: fight ends after the land');

  const logA = await getLog();
  const fa = logA.fights[logA.fights.length - 1];
  assert(fa && fa.outcome === 'landed', `A: outcome is 'landed' (got ${fa ? fa.outcome : 'none'})`);
  assert(fa && fa.events.some((e) => e.type === 'landed'), 'A: landed event observed');
  const wA = await getWorld();
  assert(wA.fish !== null, 'A: a new fish swims up after the catch was landed');
  track('screenshot', landingShot);
  track('fight duration', fa ? `${fa.durationSec}s` : 'n/a');
  printSessionSummary();
  printFightConsole();
}

// ================================================================================
// FIGHT 2 — BUTCHER
// ================================================================================
async function fightButcher() {
  line('');
  line('=== FIGHT 2: BUTCHER — exhaust it, reel into gaff reach, gaff it down (minusOneTier) ===');
  await boot();
  // Start INWARD (not the default spawn): the catch's routed drags pull the
  // player outward toward the shore, and the gaff is suppressed underwater — so
  // the butcher needs as much land room as possible before the drag-out.
  await page.evaluate(() => {
    const w = window.__world;
    w.player.x = 1;
    w.player.z = 0;
  });
  await startFight();

  // Phase 1 — reel the catch in with SHORT taps, stopping while L is still well
// ABOVE the catch's position. A continuous reel between polls shrinks L below
// the drifting catch and leaves a persistent excess that ratchets tension to a
// snap; taps keep L ~3m so the line stays slack while gaffing. Also hold the
// player toward the islet centre so the catch's routed drags can't haul them
// out.
  const t0 = Date.now();
  let inReach = false;
  while (Date.now() - t0 < 60000) {
    const w = await getWorld();
    if (!w || !w.fight || !w.fish) break;
    // stop early (L ~4.2): each tap's CDP round-trip overshoots L by ~1.5m, so
    // the final L lands ~2.5-2.7 — comfortably above the catch's drift range
    if (w.fight.L < 4.2 || dist(w.player, w.fish) < 2.0) {
      inReach = true;
      break;
    }
    await moveTo(keysToward(-w.player.x, -w.player.z)); // toward the islet centre
    if (w.fight.tension < 38 && w.player.stamina > 15) {
      await holdRmb();
      await sleep(20); // short tap — L shrinks ~0.2-0.5m per tap at 10×
      await releaseRmb();
    } else {
      await releaseRmb();
      await sleep(10);
    }
  }
  await releaseAll();
  await releaseRmb();
  assert(inReach, 'B: reeled the catch into gaff reach');
  const wRe = await getWorld();
  track('B reach end', `tension=${wRe.fight ? wRe.fight.tension.toFixed(0) : 'n/a'} pdist=${Math.hypot(wRe.player.x, wRe.player.z).toFixed(1)} len=${wRe.fish ? dist(wRe.player, wRe.fish).toFixed(1) : 'n/a'} L=${wRe.fight ? wRe.fight.L.toFixed(1) : 'n/a'} stam=${wRe.fish ? wRe.fish.stamina.toFixed(0) : 'n/a'}`);

  // Diagnostic: drive one gaff from inside the page (no CDP round-trip) and
// observe the combat frame-by-frame.
async function gaffHeavy() {
  // ONE evaluate drives the whole wind-up + swing while the page runs freely
  // (the driver isn't hammering), so the sim advances at its natural rate and
  // the ~150ms hold is a reliable HEAVY (≥0.35 sim s) without letting the
  // drifting catch wander out of the arc.
  return page.evaluate(async () => {
    const w = window.__world;
    w.player.stamina = 100;
    const press = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    const release = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    const hp0 = w.fish.hp;
    press();
    await new Promise((r) => setTimeout(r, 150));
    release();
    await new Promise((r) => setTimeout(r, 150)); // let the swing land
    return { hp0, hp: w.fish.hp, heavy: w.combat.swingIsHeavy, L: w.tether.fights[0] ? w.tether.fights[0].L : -1 };
  });
}

// Phase 2 — gaff it down. HEAVY gaffs (18 dmg) are robust to the timescale's
  // variable effective rate (a ~200ms wall hold is >0.35 sim s at every rate we
  // see), cadenced on the combat system's own attackTimer so a press never lands
  // inside an active swing. The player's stamina pool is topped up (the scripted
  // scenario is "gaff the catch down", not "run out of wind-up"). The exhausted
  // catch WANDERS, so the player FOLLOWS it on foot — walking resolves any
  // excess and keeps the line slack (reeling back would ratchet tension). Nudge
  // to face, then STOP so collision can't push the catch out.
  const t2 = Date.now();
  let iter = 0;
  let waits = 0;
  let gaffs = 0;
  let hpDrops = 0;
  let lastHp = -1;
  while (Date.now() - t2 < 60000) {
    const w = await getWorld();
    if (!w || !w.fight || !w.fish) break;
    if (w.fish.hp <= 0) break;
    if (w.fish.hp < lastHp) hpDrops++;
    lastHp = w.fish.hp;
    iter++;
    await page.evaluate(() => {
      window.__world.player.stamina = 100;
    });
    const len = dist(w.player, w.fish);
    if (len > 1.6) {
      // the catch wandered out — chase it in short steps (the poll re-checks
      // distance each iteration so we never barrel into it); keep len ~1.5 so
      // the drifting catch stays inside reach through the wind-up
      await moveTo(keysToAngle(Math.atan2(w.fish.x - w.player.x, w.fish.z - w.player.z)));
      await sleep(12);
      continue;
    }
    await releaseAll();
    if (w.combat.attackTimer > 0 || w.combat.heavyCharge > 0) {
      waits++;
      await sleep(15);
      continue;
    }
    // pause if the line is genuinely tight — let slack decay, then resume
    if (w.fight.tension > 80) {
      await sleep(40);
      continue;
    }
    // QUICK nudge to face the catch (a ~8ms tap moves the player only a few cm
    // — enough to set the facing, nowhere near enough to push the catch out of
    // reach via collision), then STOP.
    await moveTo(keysToAngle(Math.atan2(w.fish.x - w.player.x, w.fish.z - w.player.z)));
    await sleep(8);
    await releaseAll();
    gaffs++;
    const g = await gaffHeavy();
    if (g.hp < g.hp0) hpDrops++;
    await sleep(20);
  }
  track(`B gaff stats`, `iters=${iter} waits=${waits} gaffs=${gaffs} hpDrops=${hpDrops} hpEnd=${lastHp}`);
  await releaseAll();
  await waitWorld((w) => w.fights === 0, 8000, 'B: fight ends (butchered)');
  const wFinal = await getWorld();
  assert(wFinal.fish === null || wFinal.fish.hp <= 0, 'B: catch hp reached 0');
  const logB = await getLog();
  const fb = logB.fights[logB.fights.length - 1];
  assert(fb && fb.outcome === 'butchered', `B: outcome is 'butchered' (got ${fb ? fb.outcome : 'none'})`);
  const butcherEvt = fb && fb.events.find((e) => e.type === 'butchered');
  assert(butcherEvt && butcherEvt.minusOneTier === true, 'B: butchered event carries minusOneTier');
  track('fight duration', fb ? `${fb.durationSec}s` : 'n/a');
  printSessionSummary();
  printFightConsole();
}

// ================================================================================
// FIGHT 3 — SNAP LOSS
// ================================================================================
async function fightSnap() {
  line('');
  line('=== FIGHT 3: SNAP LOSS — reel greedily into the lunges to tension 100 ===');
  await boot();
  await page.evaluate(() => {
    const w = window.__world;
    w.player.x = 0;
    w.player.z = 0;
  });
  await startFight();
  // fling the catch far out (it is unclamped while tethered) so tension climbs fast
  await page.evaluate(() => {
    const w = window.__world;
    w.fish.x = 20;
    w.fish.z = 0;
  });

  const t0 = Date.now();
  let redShot = null;
  let snapped = false;
  while (Date.now() - t0 < 60000) {
    const w = await getWorld();
    if (!w || !w.fight) {
      snapped = true;
      break;
    }
    if (!redShot && w.fight.tension > 85) redShot = await shotAtRealTime('c-red-line-near-snap');
    // greedy reel: hold RMB and walk AWAY from the catch to keep the line taut.
    // The player's own 100-stamina pool would stall the reel mid-climb, so the
    // driver tops the pool back up — this is the scripted "greedy reel to 100"
    // behaviour, with the reel still live at the snap moment.
    await page.evaluate(() => {
      window.__world.player.stamina = 100;
    });
    await holdRmb();
    if (w.fish) {
      await moveTo(keysToward(w.player.x - w.fish.x, w.player.z - w.fish.z));
    }
    await sleep(15);
  }
  await releaseAll();
  await waitWorld((w) => w.fights === 0, 8000, 'C: fight ends (snap)');

  const logC = await getLog();
  const fc = logC.fights[logC.fights.length - 1];
  assert(snapped, 'C: line snapped (tension reached 100)');
  assert(fc && fc.outcome === 'snap', `C: outcome is 'snap' (got ${fc ? fc.outcome : 'none'})`);
  assert(fc && fc.events.some((e) => e.type === 'snap'), 'C: snap event observed');
  const snapEvt = fc && fc.events.find((e) => e.type === 'snap');
  if (snapEvt) track('snap cause', snapEvt.cause);
  const wC = await getWorld();
  assert(wC.lure === 0, 'C: lure lost on the snap');
  track('screenshot', redShot);
  track('fight duration', fc ? `${fc.durationSec}s` : 'n/a');
  printSessionSummary();
  printFightConsole();
}

// ================================================================================
// FIGHT 4 — CUT DECISION
// ================================================================================
async function fightCut() {
  line('');
  line('=== FIGHT 4: CUT DECISION — cut mid-drag (panic save) ===');
  await boot();
  await page.evaluate(() => {
    const w = window.__world;
    w.player.x = 0;
    w.player.z = 0;
  });
  await startFight();
  // fling the catch far out so the first correction is a real >1.5m drag
  await page.evaluate(() => {
    const w = window.__world;
    w.fish.x = 20;
    w.fish.z = 0;
  });

  // wait for a drag EVENT in the playtest log, then cut mid-drag
  const t0 = Date.now();
  let pulled = false;
  while (Date.now() - t0 < 60000) {
    const w = await getWorld();
    if (!w || !w.fight) break;
    const logNow = await getLog();
    const last = logNow.fights[logNow.fights.length - 1];
    if (last && last.drags > 0) {
      pulled = true;
      break;
    }
    await sleep(15);
  }
  assert(pulled, 'D: a drag pulled the player');
  await moveTo(['KeyF']);
  await sleep(200); // ~2 sim s — well past the 0.5s cut hold
  await releaseAll();
  await waitWorld((w) => w.fights === 0, 8000, 'D: fight ends (cut)');

  const logD = await getLog();
  const fd = logD.fights[logD.fights.length - 1];
  assert(fd && fd.outcome === 'cut', `D: outcome is 'cut' (got ${fd ? fd.outcome : 'none'})`);
  assert(fd && fd.events.some((e) => e.type === 'cut'), 'D: cut event observed');
  const wD = await getWorld();
  assert(wD.lure === 0, 'D: cut cost the lure');
  track('fight duration', fd ? `${fd.durationSec}s` : 'n/a');
  printSessionSummary();
  printFightConsole();
}

// ================================================================================
// FIGHT 5 — DRAGGED-IN (water phase)
// ================================================================================
async function fightDraggedIn() {
  line('');
  line('=== FIGHT 5: DRAGGED-IN — routed drag past the shore, survive, struggle out ===');
  await boot();
  // start just inside the shoreline (18.0 = GROUND_R 20 − PLAYER_R 0.5 − 1.5)
  await page.evaluate(() => {
    const w = window.__world;
    w.player.x = 18;
    w.player.z = 0;
  });
  await startFight();
  // fling the catch outward so its routed drag pulls the pair past the shore
  await page.evaluate(() => {
    const w = window.__world;
    w.fish.x = 28;
    w.fish.z = 0;
  });

  // 1. wait for the water phase
  const t0 = Date.now();
  let entered = false;
  while (Date.now() - t0 < 40000) {
    const w = await getWorld();
    if (w.water.active) {
      entered = true;
      break;
    }
    await sleep(20);
  }
  assert(entered, 'E: dragged past the shoreline while tethered → water phase');
  assert(await tintVisible(), 'E: ui.underwater screen-inversion hook (tint) is live');
  assert((await getWorld()).ui.underwater === true, 'E: ui.underwater flag set');
  const underwaterShot = await shotAtRealTime('e-underwater');
  track('screenshot', underwaterShot);

  // 2. survive: let the breath drain to 0 — it must clamp, not kill
  const hpAtEntry = (await getWorld()).player.hp;
  const t1 = Date.now();
  let breathZero = false;
  while (Date.now() - t1 < 60000) {
    const w = await getWorld();
    if (w.water.breath <= 0) {
      breathZero = true;
      break;
    }
    await sleep(25);
  }
  assert(breathZero, 'E: breath drained to 0');
  assert((await getWorld()).player.hp === hpAtEntry, 'E: breath 0 is NOT lethal in M2 (hp unchanged)');

  // 3. struggle out: hold toward the islet centre until we surface
  const t2 = Date.now();
  let surfaced = false;
  while (Date.now() - t2 < 120000) {
    const w = await getWorld();
    if (w.water.active) {
      await moveTo(keysToward(w.water.towardShore.x, w.water.towardShore.z));
    } else {
      surfaced = true;
      // end the fight so the catch stops dragging us straight back out
      await releaseAll();
      await moveTo(['KeyF']);
      await sleep(200);
      await releaseAll();
      break;
    }
    await sleep(20);
  }
  assert(surfaced, 'E: struggled back to shore → water phase exited');

  const logE = await getLog();
  const lastFight = logE.fights[logE.fights.length - 1];
  const waterIn = lastFight
    ? lastFight.events.some((e) => e.type === 'pulledUnder' || e.type === 'enterWaterPhase')
    : false;
  const waterOut = lastFight ? lastFight.events.some((e) => e.type === 'surfaced') : false;
  assert(waterIn, 'E: pulledUnder / enterWaterPhase event observed');
  assert(waterOut, 'E: surfaced event observed');
  const wE = await getWorld();
  assert(wE.water.breath === wE.water.breathMax, 'E: breath reset to full on surfacing');
  printSessionSummary();
  printFightConsole();
}

// ================================================================================
// FIGHT 6 — BRACE CHECK
// ================================================================================
// Measures the constraint pull from the DRAG-EVENT magnitude: with the catch
// parked L+E metres out (frozen, ai=null) the very first constraint tick applies
// a single correction corrA = E·(mass/2.5)·brace to the player, which fires a
// drag event whose magnitude is exactly that pull — walk-free, because the drag
// magnitude records the position correction, not the movement integration. The
// brace dial scales corrA (brace = 1 − efficacy·oppose), so unbraced vs braced
// magnitudes give the "~60% reduction" directly.
async function measureDragPull(E, efficacy) {
  await page.evaluate(
    ({ E, efficacy }) => {
      const w = window.__world;
      w.tuning.braceEfficacy = efficacy;
      const f = w.tether.fights[0];
      f.drag.cooldown = 0;
      f.drag.accumulated = 0;
      f.drag.windowStart = w.time.elapsed;
      w.player.x = 0;
      w.player.z = 0;
      w.fish.x = f.L + E;
      w.fish.z = 0;
    },
    { E, efficacy },
  );
  await sleep(80); // a few sim ticks — the first correction fires the drag
  const logNow = await getLog();
  const last = logNow.fights[logNow.fights.length - 1];
  const drags = last ? last.events.filter((e) => e.type === 'drag') : [];
  const dragEvt = drags[drags.length - 1]; // the latest drag = this measurement's pull
  return dragEvt ? dragEvt.magnitude : NaN;
}

async function fightBrace() {
  line('');
  line('=== FIGHT 6: BRACE — displacement braced vs unbraced (~60% reduction) ===');
  await boot();
  await startFight();
  // freeze the catch (no lunges/drift) so only the constraint moves it
  await page.evaluate(() => {
    const w = window.__world;
    w.player.x = 0;
    w.player.z = 0;
    w.fish.tether.exhausted = true;
    w.fish.ai = null;
  });

  const E = 10; // metres of excess → unbraced one-tick pull = 6m, braced 2.4m (>1.5m drag floor)
  await moveTo([]); // idle → brace factor 1 (full pull)
  const pullUnbraced = await measureDragPull(E, 0.6);
  await moveTo(['KeyD']); // walk into the pull → brace opposes it
  const pullBraced = await measureDragPull(E, 0.6);
  const pullBraced03 = await measureDragPull(E, 0.3);

  const ratio06 = pullBraced / pullUnbraced;
  const ratio03 = pullBraced03 / pullUnbraced;
  track('unbraced pull (m)', pullUnbraced.toFixed(3));
  track('braced pull @0.6 (m)', pullBraced.toFixed(3));
  track('ratio @0.6', `${ratio06.toFixed(3)} (target ~0.40)`);
  track('ratio @0.3', `${ratio03.toFixed(3)} (target ~0.70)`);
  assert(
    Math.abs(ratio06 - 0.4) < 0.07,
    `F: brace reduces displacement by ~60% at the default dial (ratio ${ratio06.toFixed(3)}, reduction ${((1 - ratio06) * 100).toFixed(0)}%)`,
  );
  assert(
    Math.abs(ratio03 - 0.7) < 0.08,
    `F: the dial scales brace live (efficacy 0.3 → ratio ${ratio03.toFixed(3)}, reduction ${((1 - ratio03) * 100).toFixed(0)}%)`,
  );

  // end the fight so its summary prints (best-effort — the brace assertions are
  // the real check; a stuck cleanup must not fail the gate)
  await releaseAll();
  await moveTo(['KeyF']);
  await sleep(200);
  await releaseAll();
  const afterFCut = await getWorld();
  track('F cleanup', `fights=${afterFCut.fights} tension=${afterFCut.fight ? afterFCut.fight.tension.toFixed(0) : 'n/a'} L=${afterFCut.fight ? afterFCut.fight.L.toFixed(1) : 'n/a'}`);
  try {
    await waitWorld((w) => w.fights === 0, 12000, 'F: fight ends (cleanup cut)');
  } catch {
    line('      [note] F cleanup fight still active — brace measurements already asserted');
  }
  printSessionSummary();
  printFightConsole();
}

// ================================================================================
// RUN
// ================================================================================
line(`UNDERTOW M2 GATE (T12) — 6 scripted tether fights at timescale=10`);
line(`url: ${URL}`);

try {
  await fightAngler();
  await fightButcher();
  await fightSnap();
  await fightCut();
  await fightDraggedIn();
  await fightBrace();
} catch (err) {
  line('');
  line(`DRIVER ERROR: ${err.message}`);
  failures.push(`driver error: ${err.message}`);
}

line('');
line('=== SUMMARY ===');
line('screenshots: gate-a-landing, gate-c-red-line-near-snap, gate-e-underwater (tools/)');

if (failures.length > 0) {
  line('');
  line(`RESULT: FAIL (${failures.length})`);
  for (const f of failures) line(`  - ${f}`);
  await browser.close();
  process.exit(1);
}
line('RESULT: PASS');
await browser.close();
process.exit(0);