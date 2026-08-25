// tools/m4-probe.mjs — M4 round 2 gate driver (task t19 verify).
// Drives the bestiary / loot / license loop through a real browser at
// ?timescale=10, dropping to 1 for composed shots:
//   boot → set license XP near the G2 threshold → two tether fights (one clean
//   land → ✓ bestiary entry, one snap → fought-without-check) → bestiary ledger
//   (B key / __bestiary seam) → extraction → TRIBUTE RECEIPT with SUNDRIES +
//   LICENSE line → DISCHARGE → grade-up renewal letter → ACK → trinket picker →
//   CAST OFF → fresh run applies the G2 + equipped passives → B-key toggle check.
// Asserts every step against window.__world / window.__save / the DOM.
// Usage: node tools/m4-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = process.env.M4_PROBE_URL ?? 'http://localhost:5173/?seed=2026&debug&timescale=10';

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

// SET a disturbance by the boat + cast → SET (returns the species id).
async function setOne(worldId, tier) {
  await wset(`
    const b = w.boat;
    const d = { id: ${worldId}, pos: { x: b.x + 7, z: b.z }, tier: ${tier}, state: 'idle', biteTimer: 0, promptTimer: 0, seed: ${worldId} };
    w.disturbances.push(d);
    w.run.debugCastPoint = { x: b.x + 7, z: b.z };
  `);
  await wset('w.time.timescale = 1');
  await page.mouse.down();
  await sleep(250);
  await page.mouse.up();
  const promptSeen = await waitFor(`w.run.promptId === ${worldId}`, 8000, 25);
  assert(promptSeen, `fight ${worldId}: cast reached the SET window`);
  await page.mouse.down();
  await sleep(250);
  await page.mouse.up();
  const setOk = await waitFor(`w.tether.fights.length === 1`, 3000, 25);
  assert(setOk, `fight ${worldId}: SET started the tether fight`);
  await wset('w.time.timescale = 10');
  const sp = await w(`({ id: w.run.activeCatch?.species, tier: w.run.activeCatch?.tier })`);
  return sp?.id ?? null;
}

async function landClean() {
  await wset(`
    w.fish.stamina = 0;
    w.fish.tether.exhausted = true;
    w.fish.x = w.player.x;
    w.fish.z = w.player.z;
    if (w.tether.fights[0]) w.tether.fights[0].land.eligible = true;
  `);
  await page.keyboard.press('KeyE');
  return waitFor(`w.tether.fights.length === 0 && w.fish === null`, 4000);
}

async function snapIt() {
  await wset(`
    if (w.tether.fights[0]) w.tether.fights[0].tension = 99.9;
    w.fish.x = 999;
  `);
  return waitFor(`w.tether.fights.length === 0`, 3000);
}

// --- BOOT --------------------------------------------------------------------
console.log('=== BOOT ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

let snap = await w(`({ mode: w.mode, islets: w.lake?.islets.length, dists: w.disturbances.length })`);
assert(snap && snap.mode === 'boat', 'boots in boat mode');
assert(snap && snap.islets >= 9, `lake generated (${snap?.islets} islets)`);

const saveBoot = await page.evaluate(() => (window.__save ? window.__save() : null));
assert(saveBoot && saveBoot.version === 2, `save schema v2 (version ${saveBoot?.version})`);
assert(saveBoot && saveBoot.license.grade === 1, 'fresh save starts at license grade 1');

// Push the license near the G2 threshold so one landed catch crosses it.
await page.evaluate(() => window.__setLicenseXp(119));
const xpSet = await waitFor(`window.__save().license.xp === 119`, 2000);
assert(xpSet, 'debug seam set license XP to 119 (near the G2 threshold of 120)');

// --- FIGHT 1: clean land (bestiary ✓) -----------------------------------------
console.log('=== FIGHT 1 (clean land) ===');
await wset('w.run.forceDrop = true'); // gate seam — always surface a sundry
const s1 = await setOne(9101, 3);
assert(s1 && s1 !== 'capsule', `fight 1 rolled a real species (${s1})`);
let ev = await w(`({ n: w.run.bestiaryEvents.length, first: w.run.bestiaryEvents[0] })`);
assert(ev && ev.n === 1 && ev.first.event === 'hooked', `hooked event recorded for ${s1}`);
const landed1 = await landClean();
assert(landed1, 'fight 1 landed clean');
ev = await w(`({ clean: w.run.bestiaryEvents.some(e => e.event === 'clean'), haul: w.run.haul.length, sundries: w.run.inventory.length })`);
assert(ev && ev.clean, 'clean bestiary event recorded');
assert(ev && ev.haul === 1, `haul recorded (${ev?.haul})`);
assert(ev && ev.sundries >= 1, `sundry recovered on the land (${ev?.sundries})`);

// --- FIGHT 2: snap (fought without the checkmark) ------------------------------
console.log('=== FIGHT 2 (snap) ===');
const s2 = await setOne(9102, 2);
assert(s2 && s2 !== 'capsule', `fight 2 rolled a real species (${s2})`);
const snapped = await snapIt();
assert(snapped, 'fight 2 snapped (no clean credit)');
ev = await w(`({ hooked: w.run.bestiaryEvents.filter(e => e.event === 'hooked').length, clean: w.run.bestiaryEvents.filter(e => e.event === 'clean').length })`);
assert(ev && ev.hooked === 2, `two species hooked (${ev?.hooked})`);
assert(ev && ev.clean === 1, 'only the clean land granted the checkmark');

// --- BESTIARY LEDGER (mix of discovered / undiscovered) -----------------------
console.log('=== BESTIARY (screenshot) ===');
await page.evaluate(() => window.__bestiary());
await sleep(200);
const ledger = await page.evaluate(() => {
  const el = document.querySelector('#bestiary-screen');
  if (!el) return null;
  const cards = el.querySelectorAll('.card');
  return {
    total: cards.length,
    discovered: el.querySelectorAll('.card:not(.undiscovered)').length,
    undiscovered: el.querySelectorAll('.card.undiscovered').length,
    checks: el.querySelectorAll('.check').length,
    text: el.innerText,
  };
});
assert(ledger && ledger.total === 12, `bestiary grids all 12 Shallows species (${ledger?.total})`);
assert(ledger && ledger.discovered === 2, `two discovered cards (${ledger?.discovered})`);
assert(ledger && ledger.undiscovered === 10, `ten undiscovered silhouette cards (${ledger?.undiscovered})`);
assert(ledger && ledger.checks === 1, `exactly one clean-catch checkmark (${ledger?.checks})`);
console.log('      bestiary open — screenshot');
await page.screenshot({ path: 'tools/m4-bestiary.png' });
console.log('      wrote tools/m4-bestiary.png');
await page.evaluate(() => window.__bestiary());
await sleep(150);
const closed = await page.evaluate(() => document.querySelector('#bestiary-screen') === null);
assert(closed, 'bestiary toggles closed');

// --- EXTRACT ------------------------------------------------------------------
console.log('=== EXTRACT + RECEIPT ===');
const buoy = await w(`w.lake.buoys.find(b => b.primary && !b.submerged)`);
assert(buoy, 'a live primary buoy exists');
await wset(`
  w.boat.x = ${buoy.pos.x};
  w.boat.z = ${buoy.pos.z};
`);
await page.waitForTimeout(200);
await page.keyboard.down('KeyE');
await sleep(400);
await page.keyboard.up('KeyE');

const ended = await w(`w.run.ended ? { extracted: w.run.result.extracted, sundries: w.run.result.sundries.length, bestiary: w.run.result.bestiary.length, xp: w.run.result.xpTotal, memories: w.run.result.memoriesTotal } : null`);
assert(ended && ended.extracted === true, 'run ended by extraction');
assert(ended && ended.sundries >= 1, `receipt carries SUNDRIES (${ended?.sundries})`);
assert(ended && ended.bestiary >= 3, `result carries ${ended?.bestiary} bestiary events`);
assert(ended && ended.xp >= 1, `run banked tribute XP (${ended?.xp})`);

await page.waitForTimeout(500); // let the IndexedDB write land
const saveEnd = await page.evaluate(() => (window.__save ? window.__save() : null));
assert(saveEnd && saveEnd.license.grade === 2, `license graded up to 2 in the save (${saveEnd?.license?.grade})`);
assert(saveEnd && saveEnd.box.length >= 1, `sundries retained in the box (${saveEnd?.box?.length})`);
assert(saveEnd && Object.keys(saveEnd.bestiary).length >= 2, 'bestiary entries persisted');

const receiptText = await page.evaluate(() => document.querySelector('#run-summary')?.innerText ?? '');
assert(receiptText.includes('SUNDRIES RECOVERED'), 'receipt shows the SUNDRIES RECOVERED schedule');
assert(/GRADE 2/.test(receiptText), 'receipt shows the KEEPER\'S LICENSE grade 2 line');
console.log('=== TRIBUTE RECEIPT (sundries + license): screenshot ===');
await page.screenshot({ path: 'tools/m4-receipt.png' });
console.log('      wrote tools/m4-receipt.png');

// --- DISCHARGE → grade-up letter ----------------------------------------------
await page.evaluate(() => {
  const btn = document.querySelector('#run-summary .discharge');
  if (btn) btn.click();
});
const letter = await page.evaluate(() => document.querySelector('#grade-up-letter')?.innerText ?? '');
assert(letter.includes('GRADE 1') && letter.includes('GRADE 2'), 'grade-up renewal letter shown (G1 → G2)');
assert(letter.includes('[RENEWAL STAMPED]'), 'letter carries the [RENEWAL STAMPED] stamp');
console.log('=== GRADE-UP LETTER: screenshot ===');
await page.screenshot({ path: 'tools/m4-grade-up.png' });
console.log('      wrote tools/m4-grade-up.png');
await page.evaluate(() => {
  const btn = document.querySelector('#grade-up-letter .accept');
  if (btn) btn.click();
});

// --- trinket picker → CAST OFF -------------------------------------------------
await sleep(250);
const picker = await page.evaluate(() => document.querySelector('#trinket-picker')?.innerText ?? '');
assert(picker.includes('CAST OFF'), 'trinket picker offered after the letter (box has trinkets)');
assert(/two \(2\) slots/i.test(picker), 'picker states the two (2) trinket slots');
console.log('=== TRINKET PICKER: screenshot ===');
await page.screenshot({ path: 'tools/m4-picker.png' });
console.log('      wrote tools/m4-picker.png');
await page.evaluate(() => {
  const btn = document.querySelector('#trinket-picker .decline');
  if (btn) btn.click();
});

// --- fresh run applies the passives ---------------------------------------------
await sleep(600);
const fresh = await w(`({ seed: w.seed, ended: w.run.ended, maxStamina: w.player.maxStamina, maxHp: w.player.maxHp, licenseGrade: w.run.licenseGrade, memoriesMult: w.run.memoriesMult })`);
assert(fresh && fresh.seed !== 2026, `fresh run started (new seed ${fresh?.seed})`);
assert(fresh && !fresh.ended, 'fresh run not ended');
assert(fresh && fresh.licenseGrade === 2, `run stamped with license grade 2 (${fresh?.licenseGrade})`);
assert(fresh && fresh.maxStamina === 110, `G2 passive applied: +10 stamina max (${fresh?.maxStamina})`);

// --- B-key toggle on open water --------------------------------------------------
await wset(`w.boat.x += 200; w.boat.z += 200;`); // clear of every dockable islet
await page.keyboard.press('KeyB');
await sleep(200);
const bOpen = await page.evaluate(() => document.querySelector('#bestiary-screen') !== null);
assert(bOpen, 'B key opens the bestiary ledger on open water');
await page.keyboard.press('KeyB');
await sleep(150);
const bClosed = await page.evaluate(() => document.querySelector('#bestiary-screen') === null);
assert(bClosed, 'B key closes it again');

await browser.close();

if (failures.length > 0) {
  console.error(`M4-PROBE FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('M4-PROBE OK');
process.exit(0);