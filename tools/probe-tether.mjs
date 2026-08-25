// tools/probe-tether.mjs — M2 round 2A gate probe (T3/T8/T6/T7).
// Opens the real app at ?mode=foot&debug&timescale=10 and drives a full
// hook → fight → land loop with real keys: T starts the tether fight, the FSM
// runs (telegraph/lunge events in the playtest log), then the catch is
// exhausted + reeled in and E lands it. Exits 0 only if the whole loop passes.
//
// Usage: node tools/probe-tether.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const URL = 'http://localhost:5173/?mode=foot&debug&timescale=10';
const MODES = ['orbit', 'lunge', 'dive', 'drag', 'exhausted'];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const failures = [];
function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

async function getWorld() {
  return page.evaluate(() => {
    const w = window.__world;
    if (!w) return null;
    return {
      mode: w.mode,
      fights: w.tether.fights.length,
      fish: w.fish
        ? {
            x: w.fish.x, z: w.fish.z, stamina: w.fish.stamina,
            exhausted: w.fish.tether.exhausted,
            aiMode: w.fish.ai ? w.fish.ai.mode : null,
            exhaustTilt: w.fish.exhaustTilt,
            state: w.fish.state,
          }
        : null,
      fight: w.tether.fights[0]
        ? { L: w.tether.fights[0].L, tension: w.tether.fights[0].tension, eligible: w.tether.fights[0].land.eligible }
        : null,
    };
  });
}

async function waitWorld(pred, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const w = await getWorld();
    if (w && pred(w)) return w;
    await sleep(30);
  }
  throw new Error(`timeout waiting for: ${what}`);
}

async function getLog() {
  return page.evaluate(() => {
    const t = window.__tetherLog;
    if (!t || typeof t.getSessionLog !== 'function') return null;
    return t.getSessionLog();
  });
}

// ================================================================================
// PHASE A — boot + hook
// ================================================================================
console.log('=== PHASE A: boot + hook (T) ===');
await page.goto(URL);
await page.waitForTimeout(1200);
await page.mouse.move(640, 360);

const boot = await waitWorld((w) => w.mode === 'foot' && w.fish !== null, 8000, 'foot mode + fish');
assert(boot.mode === 'foot', 'boots into foot mode');
assert(boot.fish !== null, 'fish spawned');

// T starts the fight (retry the synthetic key — known ~1-in-5 flake)
let hooked = false;
for (let attempt = 0; attempt < 5 && !hooked; attempt++) {
  await page.keyboard.press('KeyT');
  const w = await waitWorld((x) => x.fights === 1 && x.fish?.aiMode !== null, 4000, 'tether fight + FSM seeded');
  if (w && w.fights === 1) {
    hooked = true;
    break;
  }
}
assert(hooked, 'T hooks the fish — fight active, fish.ai seeded');
const afterHook = await getWorld();
assert(MODES.includes(afterHook.fish.aiMode), `FSM is live (mode=${afterHook.fish.aiMode})`);

// ================================================================================
// PHASE B — the fight runs: FSM produces telegraph/lunge events
// ================================================================================
console.log('=== PHASE B: fight (FSM events) ===');
await sleep(2000); // ~20 sim-seconds at timescale 10
const fightWorld = await getWorld();
assert(MODES.includes(fightWorld.fish.aiMode), `FSM state is a tether mode (${fightWorld.fish.aiMode})`);
const logMid = await getLog();
assert(logMid !== null, 'playtest log exposed');
const rec = logMid?.fights?.find((r) => r.outcome === 'ongoing' || r.endedAt === null);
const telegraphs = rec?.telegraphs ?? 0;
const lunges = rec?.lunges ?? 0;
console.log(`      telegraphs=${telegraphs} lunges=${lunges} drags=${rec?.drags ?? 0}`);
assert(telegraphs > 0, 'FSM telegraphs fired');
assert(lunges > 0, 'FSM lunges fired');

// ================================================================================
// PHASE C — exhaust + reel in + LAND (E)
// ================================================================================
console.log('=== PHASE C: exhaust → reel → land (E) ===');
// Force the catch exhausted (the drain pacing is unit-tested; the probe checks
// the LAND gate + despawn + fight-end through the real input path).
await page.evaluate(() => {
  const w = window.__world;
  w.fish.stamina = 0;
  w.fish.tether.exhausted = true;
});
await sleep(300); // let a fishAI tick enter the exhausted FSM mode
const exhausted = await waitWorld((w) => w.fish?.exhausted === true && w.fish?.aiMode === 'exhausted', 3000, 'FSM exhausted mode');
assert(exhausted.fish.exhausted, 'fish is exhausted');
assert(exhausted.fish.exhaustTilt > 0, 'exhausted belly-tilt telegraph ramps (animation side)');

// Reel the line in (hold RMB = secondary/reel) until L < 2m. The fish is
// exhausted so the reel rate is ×2 (5 m/s).
await page.mouse.down({ button: 'right' });
let reeled = false;
for (let i = 0; i < 120; i++) {
  const w = await getWorld();
  if (w.fight && w.fights === 1 && w.fight.L < 1.6) {
    reeled = true;
    break;
  }
  await sleep(30);
}
await page.mouse.up({ button: 'right' });
assert(reeled, 'reel brought the catch within 2m');

await sleep(200); // a tick computes land.eligible
for (let attempt = 0; attempt < 6; attempt++) {
  await page.keyboard.press('KeyE');
  await sleep(150);
  const w = await getWorld();
  if (w.fights === 0) break; // landed
}
const landed = await waitWorld((w) => w.fights === 0, 4000, 'fight ended');
assert(landed.fights === 0, 'fight ended on land');
// The M1 spawn scaffold repopulates the arena fish the same frame, so the
// caught fish is not observable as null in the live loop — the unit test pins
// the despawn; here we pin the landed outcome + event through the real input.
const logEnd = await getLog();
const done = logEnd?.fights?.find((r) => r.outcome === 'landed');
assert(done !== undefined, 'playtest log records outcome: landed');
if (done) {
  const hasLandedEv = done.events?.some((e) => e.type === 'landed');
  assert(hasLandedEv === true, 'landed event in the fight record');
  console.log(`      fight #${done.fightId} ${done.species}/${done.anchor} → ${done.outcome} @${done.durationSec}s maxT=${done.maxTension} lunges=${done.lunges} drags=${done.drags}`);
}

// ================================================================================
console.log('=== SUMMARY ===');
if (failures.length > 0) {
  console.log(`RESULT: FAIL (${failures.length})`);
  for (const f of failures) console.log(`  - ${f}`);
  await browser.close();
  process.exit(1);
}
console.log('RESULT: PASS — full hook → fight → land loop works');
await browser.close();
process.exit(0);