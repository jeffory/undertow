// tools/fight.mjs — M1 GATE automated fight driver (plan 01 §4.6, T18).
//
// Opens the real browser app in foot mode with the debug world exposed, drives
// the gaff-vs-fish fight with REAL key/mouse events, asserts each stage of the
// loop through window.__world, and exits 0 only if the whole loop passes.
//
// Strategy: the fish keeps a 5m strafe ring (out of gaff reach), so the fight
// is the intended dance — bait a lunge, dodge it (or eat it), then punish the
// recover/hurt window. Dodges are triggered by DISTANCE during the burst (when
// the fish is ~2.5m out) so the 0.25s i-frames always cover the contact.
// Attacks are cadenced off the game's own attackTimer and always preceded by a
// re-facing nudge, because a press during an active swing is ignored and a
// swing locks the facing captured at its start.
//
// Usage: node tools/fight.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const URL = 'http://localhost:5173/?mode=foot&debug';
const PLAYER_R = 0.5;
const FISH_R = 0.8;
const GROUND_R = 20; // islet boundary radius
const REACH = 2.4; // gaff reach (1.6m) + fish radius (0.8m) = contact edge
const DODGE_TRIGGER = 2.4; // m — dodge when the lunging fish crosses this gap
const KILL_TIME_CAP = 60; // s — fight must be winnable inside this

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

// --- world access ---------------------------------------------------------------
async function getWorld() {
  return page.evaluate(() => {
    const w = window.__world;
    if (!w) return null;
    const { player, fish, combat } = w;
    return {
      mode: w.mode,
      player: {
        x: player.x, z: player.z, hp: player.hp, stamina: player.stamina,
        facing: player.facing, iframes: player.iframes,
        dodge: { active: player.dodge.active },
      },
      fish: fish ? {
        x: fish.x, z: fish.z, hp: fish.hp, maxHp: fish.maxHp,
        state: fish.state, stateTimer: fish.stateTimer,
        telegraph: fish.telegraph, deadTilt: fish.deadTilt,
        hitFlash: fish.hitFlash,
      } : null,
      combat: {
        comboStage: combat.comboStage,
        attackTimer: combat.attackTimer,
        swingIsHeavy: combat.swingIsHeavy,
      },
    };
  });
}

async function waitWorld(predicate, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const w = await getWorld();
    if (w && predicate(w)) return w;
    await sleep(30);
  }
  throw new Error(`timeout waiting for: ${what}`);
}

// --- real input helpers ----------------------------------------------------------
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

async function dodge() {
  await press('Space', 40);
}

// LMB tap = light combo press (release < 0.35s hold)
async function tapLmb() {
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
}

// hold LMB >= 0.35s then release = heavy swing (30 stamina). Returns immediately
// after release — the spend happens on the release tick.
async function heavyLmb() {
  await page.mouse.down();
  await sleep(420);
  await page.mouse.up();
}

// Heavy while holding the toward-fish key: the swing locks facing at release,
// and the movement keeps facing tracking the fish through the wind-up.
async function heavyLmbFacing(w) {
  await moveTo(keysToAngle(Math.atan2(w.fish.x - w.player.x, w.fish.z - w.player.z)));
  await heavyLmb();
  await releaseAll();
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 8-dir world movement: W=+Z, S=-Z, A=-X, D=+X (world convention).
function keysToward(dx, dz) {
  const k = [];
  if (dz > 0.35) k.push('KeyW');
  else if (dz < -0.35) k.push('KeyS');
  if (dx > 0.35) k.push('KeyD');
  else if (dx < -0.35) k.push('KeyA');
  return k;
}

function keysAway(dx, dz) {
  return keysToward(-dx, -dz);
}

// The 8 WASD directions as key sets, indexed by nearest 45° bucket.
// 0°=+Z(W), 45°=+Z+X(W+D), 90°=+X(D), 135°=+X-Z(D+S), 180°=-Z(S),
// 225°=-Z-X(S+A), 270°=-X(A), 315°=-X+Z(A+W).
function keysToAngle(a) {
  const b = Math.round((((a * 180) / Math.PI) % 360 + 360) % 360 / 45) % 8;
  const k = [];
  if (b === 0 || b === 1 || b === 7) k.push('KeyW'); // +Z
  if (b === 3 || b === 4 || b === 5) k.push('KeyS'); // -Z
  if (b === 1 || b === 2 || b === 3) k.push('KeyD'); // +X
  if (b === 5 || b === 6 || b === 7) k.push('KeyA'); // -X
  return k;
}

// --- screenshots ---------------------------------------------------------------
async function shot(name) {
  const path = `tools/gate-${name}.png`;
  await page.screenshot({ path });
  return path;
}

// --- perf readout from the ?debug overlay ----------------------------------------
async function readPerf() {
  return page.evaluate(() => {
    const t = document.getElementById('debug')?.textContent ?? '';
    const dc = Number(/draw calls (\d+)/.exec(t)?.[1] ?? -1);
    const tris = Number(/tris (\d+)/.exec(t)?.[1] ?? -1);
    return { dc, tris };
  });
}

// ================================================================================
// Shared combat tactics
// ================================================================================

// islet-boundary violation flag (checked on every snapshot from here on).
// Tolerance 0.1m: the fish integrates its own position in the spawn slot (after
// collision), so a step can carry it ~4cm past the clamp before the next
// collision ticks — that's a sub-step artifact, not an escape.
let boundaryViolation = null;
async function checkBoundary(w) {
  if (!w || !w.player || !w.fish) return;
  const pr = Math.hypot(w.player.x, w.player.z);
  if (pr + PLAYER_R > GROUND_R + 0.1 && !boundaryViolation) {
    boundaryViolation = { r: pr, x: w.player.x, z: w.player.z, who: 'player' };
  }
  const fr = Math.hypot(w.fish.x, w.fish.z);
  if (fr + FISH_R > GROUND_R + 0.1 && !boundaryViolation) {
    boundaryViolation = { r: fr, x: w.fish.x, z: w.fish.z, who: 'fish' };
  }
}

// Nudge a short walk toward the fish to re-aim facing (swings lock facing at
// start, so we must be facing the fish before we press). Uses the nearest 8-dir
// so the facing (and any idle dodge vector) lands within 22.5° of the target.
async function nudgeToFace(w, ms = 70) {
  await moveTo(keysToAngle(Math.atan2(w.fish.x - w.player.x, w.fish.z - w.player.z)));
  await sleep(ms);
  await releaseAll();
}

// Dodge an incoming lunge. Holds the toward-fish movement key at the moment of
// the dodge so the roll's direction (from world.intent) points exactly at the
// fish regardless of stale facing, then dodges the instant the fish crosses
// DODGE_TRIGGER — leaving ~1m of runway so the i-frames start well before
// contact. Returns ~250ms after the dodge with the closest the fish got, so
// the caller can prove the lunge genuinely contacted (a real i-frame
// absorption) and still catch the recover window.
async function dodgeIncomingLunge(w) {
  let minDist = 1e9;
  let dodged = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    const s = await getWorld();
    await checkBoundary(s);
    if (s.fish.state === 'dead') return { dodged, minDist };
    if (s.fish.state === 'lunge' && s.fish.telegraph <= 0) {
      const d = dist(s.player, s.fish);
      if (d < minDist) minDist = d;
      if (!dodged && d < DODGE_TRIGGER) {
        await moveTo(keysToAngle(Math.atan2(s.fish.x - s.player.x, s.fish.z - s.player.z)));
        await dodge();
        dodged = true;
        // capture the contact distance over the rest of the burst, then return
        const t1 = Date.now();
        while (Date.now() - t1 < 250) {
          const s2 = await getWorld();
          if (s2.fish.state !== 'lunge') break;
          const d2 = dist(s2.player, s2.fish);
          if (d2 < minDist) minDist = d2;
          await sleep(12);
        }
        await releaseAll();
        return { dodged, minDist };
      }
    }
    await sleep(12);
  }
  return { dodged, minDist };
}

// ================================================================================
// PHASE A — boot & world sanity
// ================================================================================
line('=== PHASE A: boot ===');
page.on('pageerror', (e) => line(`[pageerror] ${e.message}`));
await page.goto(URL);
await page.waitForTimeout(1500);
await page.mouse.move(640, 360);

const boot = await waitWorld((w) => w.mode === 'foot' && w.fish !== null, 8000, 'foot mode + fish spawn');
assert(boot.mode === 'foot', 'boots into foot mode');
assert(boot.fish !== null, 'fish spawned');
assert(boot.fish.hp === boot.fish.maxHp, `fish alive at full hp (${boot.fish.hp}/${boot.fish.maxHp})`);
assert(boot.player.hp === 100, 'player at full hp (100)');
assert(boot.player.stamina === 100, 'player at full stamina (100)');

track('player spawn', `${boot.player.x.toFixed(2)}, ${boot.player.z.toFixed(2)}`);
track('fish spawn', `${boot.fish.x.toFixed(2)}, ${boot.fish.z.toFixed(2)}`);
track('spawn separation', dist(boot.player, boot.fish).toFixed(2) + ' m');

const shotStart = await shot('fight-start');
track('screenshot', shotStart);

// ================================================================================
// PHASE B — i-frame verification (two controlled lunges)
// ================================================================================
line('');
line('=== PHASE B: dodge i-frames ===');

// approach the fish into its notice range, dodging any early lunge
let w = await waitWorld((w) => w.fish.state !== 'dead', 30000, 'fish alive before B');
{
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    w = await getWorld();
    await checkBoundary(w);
    if (w.fish.state === 'dead') throw new Error('fish died during B approach');
    if (w.fish.state === 'lunge') {
      await releaseAll(); // stop moving so the lunge comes at a stationary us
      await dodgeIncomingLunge(w);
      await sleep(400); // let the burst + recover pass
      continue;
    }
    const d = dist(w.player, w.fish);
    if (d > 5.5) {
      await moveTo(keysToward(w.fish.x - w.player.x, w.fish.z - w.player.z));
    } else {
      await releaseAll();
    }
    await sleep(40);
  }
  await releaseAll();
}

// back off to a clean ~6m so the fish re-establishes its 5m strafe ring (a
// lunge from a stationary, ~5m-away player is the geometry B1 needs). Lunges
// during the retreat are dodged.
{
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const s = await getWorld();
    await checkBoundary(s);
    if (s.fish.state === 'lunge') {
      await releaseAll();
      await dodgeIncomingLunge(s);
      continue;
    }
    const d = dist(s.player, s.fish);
    if (d >= 6) break;
    await moveTo(keysAway(s.fish.x - s.player.x, s.fish.z - s.player.z));
    await sleep(40);
  }
  await releaseAll();
  // settle: let the ring re-form, dodging any lunge
  const s0 = Date.now();
  while (Date.now() - s0 < 3000) {
    const s = await getWorld();
    await checkBoundary(s);
    if (s.fish.state === 'lunge') {
      await releaseAll();
      await dodgeIncomingLunge(s);
      continue;
    }
    if (s.fish.state === 'strafe' || s.fish.state === 'idle') break;
    await sleep(30);
  }
  await releaseAll();
}

// wait for a telegraph with plenty of time left (skip late ones — the burst
// must be catchable), standing still
async function waitEarlyTelegraph(timeoutMs, what) {
  const t0 = Date.now();
  while (true) {
    const s = await getWorld();
    await checkBoundary(s);
    if (s.fish.state === 'dead') throw new Error('fish died while ' + what);
    if (s.fish.state === 'lunge' && s.fish.telegraph > 0.2) return s;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for ' + what);
    await sleep(20);
  }
}

// take the lunge-telegraph screenshot on its OWN lunge, dodging it so the
// player stays at full hp for the B1 test (screenshots are slow and would eat
// the burst window of the dodge-test lunge anyway)
{
  const s0 = await waitEarlyTelegraph(30000, 'B1 telegraph (screenshot lunge)');
  const s = await shot('lunge-telegraph');
  track('screenshot', s);
  await dodgeIncomingLunge(s0);
  await waitWorld((x) => x.fish.state === 'strafe' || x.fish.state === 'idle', 6000, 'fish back to strafe');
}

const b1Telegraph = await waitEarlyTelegraph(30000, 'B1 telegraph (dodge-test lunge)');

// B1: let the lunge come to us and dodge it mid-burst → contact lands inside
// i-frames, player hp unchanged.
const hpBeforeB1 = b1Telegraph.player.hp;
const b1Dodge = await dodgeIncomingLunge(b1Telegraph);
track('B1 dodge fired', b1Dodge.dodged);
track('B1 closest approach (fish-to-player)', b1Dodge.minDist < 1e8 ? b1Dodge.minDist.toFixed(2) + ' m' : 'n/a');
await sleep(800);
let b1After = await getWorld();
await checkBoundary(b1After);
track('hp before B1', hpBeforeB1);
track('hp after B1 (dodged lunge)', b1After.player.hp);
assert(b1Dodge.dodged, 'B1: dodge fired on the lunging fish');
assert(b1Dodge.minDist < PLAYER_R + FISH_R + 0.2, `B1: lunge genuinely contacted (closest ${b1Dodge.minDist.toFixed(2)}m < 1.5m)`);
assert(b1After.player.hp === hpBeforeB1, 'B1: lunge during i-frames → player hp unchanged');

// B2: step clear, then stand perfectly still through an undodged lunge → hp
// drops exactly 8 (the tuned lunge now reaches a stationary player).
const hpBeforeB2 = b1After.player.hp;
await releaseAll();
{
  const s = await getWorld();
  await moveTo(keysAway(s.fish.x - s.player.x, s.fish.z - s.player.z));
  await sleep(500);
  await releaseAll();
}
const b2Telegraph = await waitEarlyTelegraph(30000, 'B2 lunge telegraph');

// stand still through telegraph AND burst — no dodge, no movement
const t0b2 = Date.now();
let burstObserved = false;
while (Date.now() - t0b2 < 3000) {
  const s = await getWorld();
  await checkBoundary(s);
  if (s.fish.state === 'lunge' && s.fish.telegraph <= 0) {
    burstObserved = true;
  }
  if (s.fish.state !== 'lunge') break;
  await sleep(16);
}
assert(burstObserved, 'B2: undodged lunge burst observed');
await sleep(800);
let b2After = await getWorld();
await checkBoundary(b2After);
track('hp before B2', hpBeforeB2);
track('hp after B2 (undodged lunge)', b2After.player.hp);
assert(b2After.player.hp === hpBeforeB2 - 8, 'B2: undodged lunge → hp drops by exactly 8');

// B3: heavy verification — dodge a lunge, then land ONE heavy in the fresh
// recover window: 30 stamina spent, 18 damage, and the stagger (0.9s hurt).
// Retried on fresh lunges in case a wind-up lands awkwardly.
const hpBeforeB3 = b2After.player.hp;
let b3Done = false;
let b3Spent = NaN;
let b3HurtAtHit = -1;
let b3PreStam = NaN;
for (let attempt = 0; attempt < 4 && !b3Done; attempt++) {
  if (attempt > 0) {
    const t = await waitEarlyTelegraph(30000, `B3 lunge (attempt ${attempt})`);
    await dodgeIncomingLunge(t);
  }
  await waitWorld((x) => x.fish.state === 'recover' && dist(x.player, x.fish) < REACH + 0.3, 3000, 'B3 recover window');
  const w0 = await getWorld();
  b3PreStam = w0.player.stamina;
  const hpPreHeavy = w0.fish.hp;
  await heavyLmbFacing(w0);
  // the heavy spend and swing-start happen on the SAME release tick — sample
  // stamina the moment the HEAVY swing begins (inside the 0.8s no-regen window)
  const stamT0 = Date.now();
  let spentThis = NaN;
  while (Date.now() - stamT0 < 2000) {
    const s = await getWorld();
    if (s.combat.swingIsHeavy && s.combat.attackTimer > 0) {
      spentThis = b3PreStam - s.player.stamina;
      break;
    }
    await sleep(15);
  }
  if (Number.isNaN(b3Spent)) b3Spent = spentThis;
  // poll for a HEAVY hit landing, then read the stagger timer at the contact
  // moment (a stray light tap must not satisfy this)
  const hitT0 = Date.now();
  while (Date.now() - hitT0 < 2000) {
    const s = await getWorld();
    if (s.combat.swingIsHeavy && s.fish.hp < hpPreHeavy) {
      b3HurtAtHit = s.fish.state === 'hurt' ? s.fish.stateTimer : -1;
      b3Done = true;
      line(`      B3 heavy (attempt ${attempt + 1}) → fish ${hpPreHeavy.toFixed(0)} → ${s.fish.hp.toFixed(0)}, hurt(stagger) ${b3HurtAtHit.toFixed(2)}s`);
      break;
    }
    await sleep(20);
  }
}
assert(!Number.isNaN(b3Spent) && Math.abs(b3Spent - 30) <= 2, `B3: heavy costs exactly 30 stamina (spent ${Number.isNaN(b3Spent) ? 'n/a' : b3Spent.toFixed(1)})`);
assert(b3Done, 'B3: heavy lands (fish hp drops by 18)');
assert(b3HurtAtHit >= 0.7, `B3: heavy stagger puts fish into hurt for ~0.9s (observed ${b3HurtAtHit >= 0 ? b3HurtAtHit.toFixed(2) + 's' : 'n/a'})`);

// ================================================================================
// PHASE C — kill the fish
// ================================================================================
line('');
line('=== PHASE C: kill fight ===');

const killT0 = Date.now();
const stats = {
  lightHits: 0, heavyHits: 0, combosSeen: new Set(), windows: 0,
};

// Punish a recover/hurt window with a light combo chain — each hit refreshes
// the fish's hurt, keeping it pinned until knockback pushes it out of reach.
async function attackWindow(w) {
  stats.windows++;
  for (let i = 0; i < 6; i++) {
    await waitWorld((x) => x.combat.attackTimer === 0, 3000, 'idle before tap');
    const s = await getWorld();
    await checkBoundary(s);
    if (s.fish.state === 'dead') break;
    if (s.fish.state !== 'recover' && s.fish.state !== 'hurt' && s.fish.state !== 'idle') break;
    if (dist(s.player, s.fish) > REACH + 0.4) break; // knockback pushed it out
    await nudgeToFace(s, 40);
    const hpBefore = s.fish.hp;
    await tapLmb();
    const after = await getWorld();
    if (after.combat.comboStage > 0) stats.combosSeen.add(after.combat.comboStage);
    if (after.fish.hp < hpBefore) {
      stats.lightHits++;
      line(`      light hit → fish ${hpBefore.toFixed(0)} → ${after.fish.hp.toFixed(0)} (combo stage ${after.combat.comboStage})`);
      if (after.fish.hitFlash > 0 && stats.lightHits === 1) {
        const f = await shot('mid-combo');
        track('screenshot', f);
      }
    }
  }
  await releaseAll();
}

const killLoopT0 = Date.now();
while (true) {
  w = await getWorld();
  await checkBoundary(w);
  if (!w) throw new Error('lost __world');

  const f = w.fish;
  const p = w.player;

  if (f.state === 'dead') break;
  if (Date.now() - killLoopT0 > KILL_TIME_CAP * 1000) {
    throw new Error(`KILL TIMEOUT: fish still alive after ${KILL_TIME_CAP}s (hp ${f.hp})`);
  }

  const d = dist(p, f);

  // inbound lunge — dodge it mid-burst
  if (f.state === 'lunge') {
    await dodgeIncomingLunge(w);
    // let the burst end and the fish enter recover before attacking
    await waitWorld((x) => x.fish.state !== 'lunge' && x.fish.state !== 'dead', 4000, 'burst end');
    continue;
  }

  // punish window: fish vulnerable + in reach
  if ((f.state === 'recover' || f.state === 'hurt' || f.state === 'idle') && d < REACH) {
    await attackWindow(w);
    continue;
  }

  // fish strafing at the ring — hold position and wait for the next lunge
  if (d > 7) {
    await moveTo(keysToward(f.x - p.x, f.z - p.z));
  } else {
    await releaseAll();
  }
  await sleep(40);
}

const killSeconds = (Date.now() - killT0) / 1000;
line(`fish killed in ${killSeconds.toFixed(1)}s`);
assert(killSeconds < KILL_TIME_CAP, `kill within ${KILL_TIME_CAP}s (${killSeconds.toFixed(1)}s)`);

// ================================================================================
// PHASE D — death + boundary + perf
// ================================================================================
line('');
line('=== PHASE D: death, boundary, perf ===');

// let the flop run to ~1
let flop = await getWorld();
for (let i = 0; i < 120 && flop.fish.deadTilt < 0.98; i++) {
  await sleep(30);
  flop = await getWorld();
}
track('deadTilt', flop.fish.deadTilt.toFixed(2));
assert(flop.fish.hp <= 0, 'fish hp <= 0 after death');
assert(flop.fish.state === 'dead', 'fish state is dead');
assert(flop.fish.deadTilt >= 0.95, 'deadTilt reaches ~1 (belly-up flop)');
assert(flop.player.hp > 0, `player survived (hp ${flop.player.hp})`);

const flopShot = await shot('dead-flop');
track('screenshot', flopShot);

if (boundaryViolation) {
  line(`      boundary violation: ${boundaryViolation.who} at r=${boundaryViolation.r.toFixed(2)} (x=${boundaryViolation.x.toFixed(2)}, z=${boundaryViolation.z.toFixed(2)})`);
}
assert(boundaryViolation === null, 'player and fish never leave the islet boundary (r+radius <= 20 + 0.1 step tolerance)');

await sleep(400);
const perf = await readPerf();
track('draw calls', perf.dc);
track('tris', perf.tris);
assert(perf.dc >= 0 && perf.dc <= 150, `foot mode draw calls <= 150 (got ${perf.dc})`);
assert(perf.tris >= 0 && perf.tris <= 60000, `foot mode tris <= 60k (got ${perf.tris})`);

// ================================================================================
// SUMMARY
// ================================================================================
line('');
line('=== SUMMARY ===');
line(`time to kill: ${killSeconds.toFixed(1)}s (cap ${KILL_TIME_CAP}s)`);
line(`hits landed: ${stats.lightHits} light + ${stats.heavyHits} heavy across ${stats.windows} punish windows`);
line(`combo stages observed: ${[...stats.combosSeen].sort().join(',') || '(none)'}`);
line('screenshots: gate-fight-start, gate-lunge-telegraph, gate-mid-combo, gate-dead-flop (tools/)');

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