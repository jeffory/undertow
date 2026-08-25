// tools/fish-probe.mjs — M4 round 1 gate driver (task t17 verify).
// Drives three real species through a tether fight in a real browser and
// photographs them mid-fight (fish rig + tether line visible), then lands the
// hauls and screenshots the TRIBUTE RECEIPT naming the species. Uses the
// run-probe patterns (inject a disturbance, cast, SET, land via the debug
// seam) + the world.debugCam gate seam for the composed close-ups.
// Asserts: SET rolls a real species each time, 3 distinct species captured,
// every landed receipt row names a caught species.
// Usage: node tools/fish-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = process.env.FISH_PROBE_URL ?? 'http://localhost:5173/?seed=2026&debug&timescale=10';

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
await page.waitForTimeout(4000);

const boot = await w(`({ mode: w.mode, dists: w.disturbances.length, run: !w.run.ended })`);
assert(boot && boot.mode === 'boat', 'boots in boat mode');
assert(boot && boot.dists > 0, `initial disturbances seeded (${boot?.dists})`);

// --- FIGHT + CAPTURE 3 DISTINCT SPECIES --------------------------------------
const shots = [];
let landedNames = [];

for (let i = 0; i < 8 && shots.length < 3; i++) {
  const id = 9100 + i;
  await wset(`
    const b = w.boat;
    const d = { id: ${id}, pos: { x: b.x + 7, z: b.z }, tier: 3, state: 'idle', biteTimer: 0, promptTimer: 0, seed: ${7000 + i} };
    w.disturbances.push(d);
    w.run.debugCastPoint = { x: b.x + 7, z: b.z };
  `);
  await wset('w.time.timescale = 1');
  // cast — LMB press (aim via the debugCastPoint seam), run-probe timing
  await page.mouse.down();
  await sleep(250);
  await page.mouse.up();
  const promptSeen = await waitFor(`w.run.promptId === ${id}`, 8000, 25);
  assert(promptSeen, `fight ${i}: cast reached the SET window`);
  if (!promptSeen) {
    await wset(`w.disturbances = w.disturbances.filter(d => d.id !== ${id}); w.time.timescale = 10;`);
    continue;
  }
  // SET — a fresh LMB press inside the window (the cast press must not
  // pre-empt the choice; the run-probe holds 250ms so the edge lands on a step)
  await page.mouse.down();
  await sleep(250);
  await page.mouse.up();
  const setOk = await waitFor(`w.tether.fights.length === 1`, 3000, 25);
  assert(setOk, `fight ${i}: SET started the tether fight`);
  await wset('w.time.timescale = 10');
  if (!setOk) continue;

  const sp = await w(`({ id: w.fish?.params?.speciesId, name: w.fish?.params?.name, x: w.fish?.x, z: w.fish?.z, tier: w.fish?.params?.tier })`);
  assert(sp && sp.id && sp.id !== 'capsule', `fight ${i}: rolled a real species (${sp?.id ?? 'none'})`);
  assert(sp && sp.tier >= 3, `fight ${i}: tier-3 ripple → rare/epic ladder (tier ${sp?.tier})`);

  if (sp && sp.id && !shots.some((s) => s.id === sp.id) && shots.length < 3) {
    // frame the fight: fish centred, tether line running to the boat in frame
    await wset(`
      w.debugCam = { x: ${sp.x} - 3.4, y: 3.6, z: ${sp.z} + 4.2, lookX: ${sp.x}, lookZ: ${sp.z} };
    `);
    await sleep(150);
    const path = `tools/fish-mid-${sp.id}.png`;
    await page.screenshot({ path });
    console.log(`      shot ${sp.id}: ${path}`);
    await wset('w.debugCam = null');
    shots.push({ id: sp.id, name: sp.name, path });
  }

  // land the catch (exhaust → drag to the keeper → eligibility → E), matching
  // the run-probe's landing seam exactly
  await wset(`
    w.fish.stamina = 0;
    w.fish.tether.exhausted = true;
    w.fish.x = w.player.x;
    w.fish.z = w.player.z;
    if (w.tether.fights[0]) w.tether.fights[0].land.eligible = true;
  `);
  await page.keyboard.press('KeyE');
  const landed = await waitFor(`w.tether.fights.length === 0 && w.fish === null`, 4000);
  assert(landed, `fight ${i}: catch landed`);
  if (landed && sp) landedNames.push(sp.name.toLowerCase());
}

assert(shots.length === 3, `captured 3 distinct species mid-fight (got ${shots.length})`);

// --- TRIBUTE RECEIPT (names the landed species) --------------------------------
const buoy = await w(`w.lake.buoys.find(b => b.primary && !b.submerged)`);
assert(buoy, 'a live primary buoy exists');
if (buoy) {
  await wset(`
    w.boat.x = ${buoy.pos.x};
    w.boat.z = ${buoy.pos.z};
  `);
  await page.waitForTimeout(150);
  await page.keyboard.down('KeyE');
  await sleep(400);
  await page.keyboard.up('KeyE');
}
const ended = await w(`w.run.ended ? { extracted: w.run.result.extracted, haul: w.run.result.haul.map(r => r.species) } : null`);
assert(ended && ended.extracted === true, 'run ended by extraction');
assert(ended && ended.haul.length >= 3, `haul carries ${ended?.haul?.length} catches`);
if (ended) {
  for (const name of landedNames) {
    assert(ended.haul.includes(name), `receipt row names "${name}"`);
  }
}
await page.waitForTimeout(200);
console.log('=== TRIBUTE RECEIPT (species named): screenshot ===');
await page.screenshot({ path: 'tools/fish-receipt.png' });
console.log('      wrote tools/fish-receipt.png');

// the DOM receipt text actually renders the names
const receiptText = await page.evaluate(() => {
  const el = document.querySelector('#run-summary');
  return el ? el.innerText : '';
});
for (const name of landedNames) {
  assert(receiptText.includes(name), `receipt DOM shows "one (1) ${name}, damp"`);
}

await browser.close();

if (failures.length > 0) {
  console.error(`FISH-PROBE FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('FISH-PROBE OK');
process.exit(0);