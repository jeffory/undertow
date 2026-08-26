// tools/run-probe.mjs — M3 round 2 run-loop gate driver (task t12 verify).
// Drives the full loop through a real browser at ?timescale=10 (the gate-driver
// hook), dropping to timescale=1 only for the composed screenshots:
//   boot → inject a tier-3 disturbance by the boat → LMB cast (aim via the
//   debugCastPoint seam) → bite → SET/RELEASE prompt (screenshot) → SET →
//   tether fight (fish scaled by tier) → land the catch (haul + Dread) →
//   row to the primary buoy, hold E → TRIBUTE RECEIPT overlay (screenshot) →
//   DISCHARGE → fresh run (new seed) → death path (condolence overlay,
//   screenshot) → dismiss.
// Asserts every step against window.__world / window.__save.
// Usage: node tools/run-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = process.env.PROBE_URL ?? 'http://localhost:5173/?seed=2026&debug&timescale=10';

const browser = await chromium.launch({ args: BROWSER_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const failures = [];
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') failures.push(`console.error: ${m.text()}`);
});

async function w(expr) {
  return page.evaluate((code) => {
    // eslint-disable-next-line no-new-func
    return new Function('w', `return (${code});`)(window.__world);
  }, expr);
}
async function wset(code) {
  return page.evaluate((c) => new Function('w', c)(window.__world), code);
}
async function waitFor(code, timeoutMs, everyMs = 25) {
  const t0 = Date.now();
  for (;;) {
    const v = await w(code);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

// --- BOOT --------------------------------------------------------------------
console.log('=== BOOT ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(5000); // assets settle

let snap = await w(`({ mode: w.mode, seed: w.seed, islets: w.lake?.islets.length, dists: w.disturbances.length, run: w.run ? { startedAt: w.run.startedAt, ended: w.run.ended } : null })`);
assert(snap && snap.mode === 'boat', `boots in boat mode (seed ${snap?.seed})`);
assert(snap && snap.islets >= 9, `lake generated (${snap?.islets} islets)`);
assert(snap && snap.dists >= 3, `spawn director seeded ${snap?.dists} initial disturbances`);
assert(snap && snap.run && !snap.run.ended, 'run stamped (not ended)');

// Bite-eligibility gating (plan 04 §8.4, M4-remainders round): every tier-3
// species requires license grade >= 2, so at the fresh-save grade 1 this
// probe's tier-3 SET would (correctly) DECLINE. Raise the run's grade so the
// probe keeps testing the fight/land/receipt flow it was written for — the
// decline behaviour itself is covered by tests/loot/eligibility.test.ts.
await wset(`w.run.licenseGrade = 4;`);

// --- CAST --------------------------------------------------------------------
// Inject a tier-3 disturbance in the water beside the boat + aim the debug seam.
await wset(`
  const b = w.boat;
  const d = { id: 9001, pos: { x: b.x + 6, z: b.z }, tier: 3, state: 'idle', biteTimer: 0, promptTimer: 0, seed: 4242 };
  w.disturbances.push(d);
  w.run.debugCastPoint = { x: b.x + 6, z: b.z };
`);
// The bite (1-4s sim) + the 1.2s SET/RELEASE window are a blink at timescale 10,
// so drop to timescale=1 for the interactive cast→prompt→SET sequence (plan 06:
// pause for composed shots). The boot already demonstrated the fast loop.
await wset(`w.time.timescale = 1;`);
await page.waitForTimeout(300);
console.log('=== RIPPLES: screenshot ===');
await page.screenshot({ path: 'tools/run-ripple.png' });
console.log('      wrote tools/run-ripple.png');

await page.mouse.move(640, 360);
await page.mouse.down(); // LMB → cast (aim via debugCastPoint)
await sleep(250); // hold across several frames — a down+up blink can miss the edge
await page.mouse.up();
const castState = await waitFor(`w.disturbances.some(d => d.id === 9001 && d.state === 'biting')`, 2000);
assert(castState, 'LMB cast put the disturbance into the biting state');

// --- BITE / PROMPT -----------------------------------------------------------
const promptSeen = await waitFor(`w.run.promptId === 9001`, 6000, 25);
assert(promptSeen, 'bite resolved into the SET/RELEASE prompt window');

// --- SET ---------------------------------------------------------------------
await page.mouse.down(); // a fresh LMB press inside the window = SET
await sleep(250); // hold so the edge lands on a sim step
await page.mouse.up();
const setState = await waitFor(`w.tether.fights.length === 1 && w.run.activeCatch && w.run.activeCatch.tier === 3`, 2000);
assert(setState, 'SET started a tether fight with the tier-3 catch tagged');
const fish = await w(`({ species: w.run.activeCatch?.species, name: w.run.activeCatch?.name, mass: w.fish?.tether.mass, paramsMass: w.fish?.params?.mass, maxHp: w.fish?.maxHp, paramsHp: w.fish?.params?.hp, tier: w.fish?.params?.tier, exhausted: w.fish?.tether.exhausted })`);
assert(fish && fish.species && fish.species !== 'capsule', `tier-3 SET rolled a real species (${fish?.species})`);
assert(fish && fish.mass === fish.paramsMass && fish.maxHp === fish.paramsHp, `species params drive the fight stats (mass ${fish?.mass}, maxHp ${fish?.maxHp})`);
assert(fish && fish.tier >= 3, `tier-3 disturbance rolls the Rare/Epic ladder (tier ${fish?.tier})`);

// --- LAND --------------------------------------------------------------------
// Drive the catch to exhaustion, drag it beside the keeper, flag it landable,
// then press E (acceptLand) — the constraint lands it next step.
await wset(`
  w.fish.stamina = 0;
  w.fish.tether.exhausted = true;
  w.fish.x = w.boat.x; /* boat is the cast anchor (castFlow fix) */
  w.fish.z = w.boat.z;
  if (w.tether.fights[0]) w.tether.fights[0].land.eligible = true;
`);
await page.keyboard.press('KeyE');
const landed = await waitFor(`w.tether.fights.length === 0 && w.fish === null`, 3000);
assert(landed, 'catch landed (fight ended, fish despawned)');
const haul = await w(`({ n: w.run.haul.length, tier: w.run.haul[0]?.tier, clean: w.run.haul[0]?.clean, dread: w.dread, peak: w.run.dreadPeak })`);
assert(haul && haul.n === 1, `haul recorded (${haul?.n} catch)`);
assert(haul && haul.tier === 3 && haul.clean === true, `haul is the tier-3 clean catch`);
assert(haul && haul.dread > 0, `landing raised Dread (${haul?.dread?.toFixed?.(1) ?? haul?.dread})`);

// --- SET PROMPT (composed shot) ----------------------------------------------
// A second cast purely to photograph the SET/RELEASE prompt: inject a fresh
// disturbance, cast, wait for the window, screenshot, then RELEASE it.
await wset(`
  const b = w.boat;
  const d = { id: 9002, pos: { x: b.x - 5, z: b.z + 4 }, tier: 2, state: 'idle', biteTimer: 0, promptTimer: 0, seed: 777 };
  w.disturbances.push(d);
  w.run.debugCastPoint = { x: b.x - 5, z: b.z + 4 };
`);
await page.mouse.move(600, 320);
await page.mouse.down();
await sleep(250);
await page.mouse.up();
const prompt2 = await waitFor(`w.run.promptId === 9002`, 6000, 25);
assert(prompt2, 'second cast reached the SET/RELEASE window');
console.log('=== SET PROMPT: screenshot ===');
await page.screenshot({ path: 'tools/run-set-prompt.png' });
console.log('      wrote tools/run-set-prompt.png');
await page.mouse.click(600, 320, { button: 'right' }); // RMB = RELEASE (free valve)
const released = await waitFor(`!w.disturbances.some(d => d.id === 9002) || w.disturbances.find(d => d.id === 9002).state === 'gone'`, 2000);
assert(released, 'RMB released the second disturbance (no Dread gained)');

// --- EXTRACT -----------------------------------------------------------------
// Restore the gate-driver timescale for the extraction hold — E held 1.5s sim
// is 0.15s wall at timescale 10, proving the loop runs under the fast hook.
await wset(`w.time.timescale = 10;`);
const buoy = await w(`w.lake.buoys.find(b => b.primary && !b.submerged)`);
assert(buoy, 'a live primary buoy exists at dusk');
await wset(`
  w.boat.x = ${buoy.pos.x};
  w.boat.z = ${buoy.pos.z};
`);
await page.waitForTimeout(200);
await page.keyboard.down('KeyE'); // hold E 1.5s sim at the buoy
await sleep(400);
await page.keyboard.up('KeyE');

const ended = await w(`w.run.ended ? { extracted: w.run.result.extracted, memories: w.run.result.memoriesTotal, haulMem: w.run.result.haul.reduce((s,r) => s + r.memories, 0), phase: w.run.result.clockPhaseEnd } : null`);
assert(ended && ended.extracted === true, 'run ended by extraction at the buoy');
assert(ended && ended.memories === ended.haulMem, `extraction kept 100% of the haul (${ended?.memories} memories)`);

await page.waitForTimeout(600); // let the IndexedDB write land
const save = await page.evaluate(() => (window.__save ? window.__save() : null));
assert(save && save.runs.length === 1, 'run persisted to the save log');
assert(save && save.meta.runsCompleted === 1 && save.meta.memoriesTotal === ended.memories, 'save meta rolled (runsCompleted, memoriesTotal)');

console.log('=== TRIBUTE RECEIPT: screenshot ===');
await page.screenshot({ path: 'tools/run-receipt.png' });
console.log('      wrote tools/run-receipt.png');

// --- DISCHARGE → fresh run ----------------------------------------------------
await page.evaluate(() => {
  const btn = document.querySelector('#run-summary .discharge');
  if (btn) btn.click();
});
await page.waitForTimeout(800);
const fresh = await w(`({ seed: w.seed, ended: w.run.ended, haul: w.run.haul.length, dists: w.disturbances.length, lakeSeed: w.lake?.seed })`);
assert(fresh && fresh.seed !== 2026, `dismiss started a fresh run (new seed ${fresh?.seed})`);
assert(fresh && !fresh.ended && fresh.haul === 0, 'fresh run reset (not ended, empty haul)');
assert(fresh && fresh.dists > 0, `fresh run reseeded disturbances (${fresh?.dists})`);
assert(fresh && fresh.lakeSeed === fresh.seed, 'fresh run regenerated the lake from the new seed');

// --- DEATH (condolence) --------------------------------------------------------
await wset(`w.player.hp = 0;`);
const died = await waitFor(`w.run.ended && w.run.result && w.run.result.extracted === false`, 3000);
assert(died, 'death ended the run (extracted=false)');
const deathResult = await w(`({ memories: w.run.result.memoriesTotal, items: w.run.result.haul.length })`);
assert(deathResult && deathResult.memories === 0, `condolence on an empty haul pays 0 (${deathResult?.memories})`);
console.log('=== OFFICE OF CONDOLENCE: screenshot ===');
await page.screenshot({ path: 'tools/run-condolence.png' });
console.log('      wrote tools/run-condolence.png');

await page.evaluate(() => {
  const btn = document.querySelector('#run-summary .discharge');
  if (btn) btn.click();
});
await page.waitForTimeout(400);
const postDeath = await w(`({ ended: w.run.ended, seed: w.seed })`);
assert(postDeath && !postDeath.ended, 'condolence dismiss also starts a fresh run');

await browser.close();

if (failures.length > 0) {
  console.error(`RUN-PROBE FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('RUN-PROBE OK');
process.exit(0);