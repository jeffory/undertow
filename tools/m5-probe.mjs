// tools/m5-probe.mjs — M5 round 1 gate driver (task t18 verify).
// Drives TOWN RESTORATION end to end through a real browser, on foot:
//   boot foot mode → assert the v3 save carries an EMPTY town slice → inject
//   Memories through the save write path (debug seam) → walk to the lighthouse
//   door → hold E → the Office of Public Works register opens → assert the 8
//   rows / notices / affordability highlight / "THE LAKE STIRS" readout →
//   click PAY on the Smokehouse → assert the purse debited, the save persisted,
//   the restored stamp, the `building.restored` event shape → close the
//   register → assert the building mesh is instanced on the shore → RELOAD →
//   assert the next run opens the water at Dread 2 (2 × 1 restored).
// Screenshots: the notice overlay + the restored building on the shore.
// Usage: node tools/m5-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.M5_PROBE_URL ?? 'http://localhost:5173';
const URL = `${BASE}/?seed=2026&debug&mode=foot`;

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
  return page.evaluate((code) => new Function('w', `return (${code});`)(window.__world), expr);
}
async function wset(code) {
  return page.evaluate((c) => new Function('w', c)(window.__world), code);
}
async function meta() {
  return page.evaluate(() => (window.__meta ? window.__meta() : null));
}
// Strip the ?debug scaffolding for a composed shot (the overlays re-render
// themselves each frame, so removing the nodes is what actually sticks).
async function hideDebugChrome() {
  await page.evaluate(() => {
    for (const sel of ['#debug', '#debug-panel', '#save-panel']) {
      document.querySelector(sel)?.remove();
    }
  });
}

async function waitFor(fn, timeoutMs, everyMs = 40) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

// --- BOOT ---------------------------------------------------------------------
console.log('=== BOOT (foot mode, fresh save) ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);

const snap = await w(`({ mode: w.mode, docked: w.dockedIslet, start: w.lake?.startIslet, dread: w.dread })`);
assert(snap && snap.mode === 'foot', `boots on foot (${snap?.mode})`);
assert(snap && snap.docked === snap.start, 'docked on the lighthouse islet');

let m = await meta();
assert(m && m.version === 4, `save schema v4 (version ${m?.version})`);
assert(m && Object.keys(m.metaState.buildings).length === 0, 'a fresh save carries an EMPTY town');
assert(m && m.metaState.memories === 0, 'the purse opens at 0 Memories');
assert(m && m.metaState.decants === 0 && m.metaState.nplus === false, 'the deferred §0.2 fields are present and empty');
assert(m && m.startingDread === 0, 'an empty town opens the water at Dread 0');
assert(snap && snap.dread === 0, 'boot run started at Dread 0');

// --- EARN MEMORIES (debug seam over the same save write path) -------------------
console.log('=== MEMORIES ===');
await page.evaluate(() => window.__grantMemories(200));
const banked = await waitFor(async () => (await meta())?.metaState.memories === 200, 3000);
assert(banked, 'debug seam banked 200 Memories into the town purse');

// --- WALK TO THE DOOR + HOLD E -------------------------------------------------
console.log('=== LIGHTHOUSE DOOR ===');
const door = await page.evaluate(() => window.__toDoor());
assert(door && Number.isFinite(door.x), `teleported to the lighthouse door (${door?.x?.toFixed(1)}, ${door?.z?.toFixed(1)})`);
const near = await waitFor(async () => await w('w.town.near'), 3000);
assert(near, 'the doorstep prompt armed (world.town.near)');
const promptShown = await page.evaluate(
  () => document.querySelector('#town-door')?.style.display !== 'none',
);
assert(promptShown, 'HOLD E doorstep prompt is on screen');
await page.screenshot({ path: 'tools/m5-door.png' });
console.log('      wrote tools/m5-door.png');

await page.keyboard.down('KeyE');
const opened = await waitFor(async () => await w('w.town.open'), 5000);
await page.keyboard.up('KeyE');
assert(opened, 'holding E at the door opened the restoration register');

await sleep(250);

// --- THE REGISTER --------------------------------------------------------------
console.log('=== RESTORATION NOTICE (register) ===');
const reg = await page.evaluate(() => {
  const el = document.querySelector('#restoration');
  if (!el) return null;
  const rows = [...el.querySelectorAll('.row')];
  return {
    text: el.innerText,
    rows: rows.length,
    ids: rows.map((r) => r.getAttribute('data-building')),
    affordable: rows.filter((r) => r.classList.contains('affordable')).length,
    locked: rows.filter((r) => r.classList.contains('locked')).length,
    payButtons: el.querySelectorAll('button.pay').length,
    stamps: el.querySelectorAll('.stamp').length,
    withheld: [...el.querySelectorAll('.withheld')].map((n) => n.textContent),
  };
});
assert(reg, 'the register overlay is in the DOM (#restoration)');
assert(reg && reg.rows === 8, `the register lists all 8 buildings (${reg?.rows})`);
assert(
  reg && reg.ids.join(',') === 'smokehouse,chandlery,post-office,bell-tower,chapel,apothecary,bakery,schoolhouse',
  'rows are in ledger order',
);
assert(reg && /THE OFFICE OF PUBLIC WORKS/.test(reg.text), 'masthead reads THE OFFICE OF PUBLIC WORKS');
assert(reg && /MEMORIES ON DEPOSIT/.test(reg.text) && /200/.test(reg.text), 'the purse line shows 200 on deposit');
assert(reg && /THE LAKE STIRS: \+0 STARTING DREAD/.test(reg.text), 'the twist is telegraphed: +0 now');
assert(reg && /adds \+2 \(capped at \+30\)/.test(reg.text), 'the readout states the next restoration is +2, capped +30');
assert(reg && /FORM 4-S: APPLICATION FOR CURING & DESICCATION WORKS/.test(reg.text), 'town.md notice copy is consumed verbatim');
assert(reg && reg.affordable === 5, `the 5 Phase-0 rows are affordable-highlighted (${reg?.affordable})`);
assert(reg && reg.locked === 3, `the 3 gated rows are withheld (${reg?.locked})`);
assert(reg && reg.payButtons === 5, `5 pay buttons offered (${reg?.payButtons})`);
assert(reg && reg.stamps === 0, 'nothing is stamped restored yet');
assert(
  reg && reg.withheld.some((t) => /WITHHELD/.test(t) && /outstanding/.test(t)),
  'locked reasons are in Office-speak',
);
await hideDebugChrome();
await sleep(150);
await page.screenshot({ path: 'tools/m5-notice.png' });
console.log('      wrote tools/m5-notice.png');

// The withheld tail of the register — the Office-speak order gates.
await page.evaluate(() => {
  const reg = document.querySelector('#restoration .register');
  if (reg) reg.scrollTop = reg.scrollHeight;
});
await sleep(200);
await page.screenshot({ path: 'tools/m5-withheld.png' });
console.log('      wrote tools/m5-withheld.png');
await page.evaluate(() => {
  const reg = document.querySelector('#restoration .register');
  if (reg) reg.scrollTop = 0;
});

// --- PAY ------------------------------------------------------------------------
console.log('=== RESTORE (pay 40 for the Smokehouse) ===');
await page.evaluate(() => {
  const row = document.querySelector('#restoration .row[data-building="smokehouse"]');
  row?.querySelector('button.pay')?.click();
});
const paid = await waitFor(async () => (await meta())?.metaState.memories === 160, 4000);
assert(paid, 'the purse was debited exactly 40 (200 → 160)');

m = await meta();
assert(m && m.metaState.buildings.smokehouse?.restored === true, 'the save records the Smokehouse restored');
assert(m && m.metaState.buildings.smokehouse?.paid === 40, 'the ledger row keeps the receipt (paid 40)');
assert(m && m.restored.length === 1, 'exactly one building stands');
assert(m && m.startingDread === 2, `starting Dread is now 2 (${m?.startingDread})`);
const ev = (m?.events ?? []).find((e) => e.type === 'building.restored');
assert(
  ev && ev.type === 'building.restored' && ev.id === 'smokehouse' && ev.cost === 40 && ev.restoredCount === 1 && ev.startingDread === 2,
  `building.restored event emitted with the §0.2 shape (${JSON.stringify(ev)})`,
);

const after = await page.evaluate(() => {
  const el = document.querySelector('#restoration');
  const row = el?.querySelector('.row[data-building="smokehouse"]');
  return {
    text: el?.innerText ?? '',
    done: row?.classList.contains('done') ?? false,
    stamp: row?.querySelector('.stamp')?.textContent ?? '',
    payGone: row?.querySelector('button.pay') === null,
  };
});
assert(after.done, 'the Smokehouse row re-rendered as restored');
assert(/RE-ENTERED ON DRY REGISTER/.test(after.stamp), `restored stamp is town.md's, verbatim (${after.stamp})`);
assert(after.payGone, 'its pay button is gone');
assert(/THE LAKE STIRS: \+2 STARTING DREAD/.test(after.text), 'the readout updated live to +2');
assert(/MEMORIES ON DEPOSIT/.test(after.text) && /160/.test(after.text), 'the purse line updated to 160');
await hideDebugChrome();
await sleep(150);
await page.screenshot({ path: 'tools/m5-restored-notice.png' });
console.log('      wrote tools/m5-restored-notice.png');

// --- THE BUILDING ON THE SHORE ---------------------------------------------------
console.log('=== HUB PRESENCE ===');
await page.evaluate(() => {
  document.querySelector('#restoration .close')?.click();
});
const closed = await waitFor(async () => (await w('w.town.open')) === false, 3000);
assert(closed, 'CLOSE REGISTER dismissed the overlay');
await sleep(400);
assert((await page.evaluate(() => document.querySelector('#restoration'))) === null, 'the overlay is out of the DOM');

const scene = await page.evaluate(() => {
  const root = window.__scene?.getObjectByName('town:root');
  if (!root) return null;
  const byName = (n) => root.getObjectByName(n);
  return {
    visible: root.visible,
    bodies: byName('town:bodies')?.count ?? -1,
    roofs: byName('town:roofs')?.count ?? -1,
    windows: byName('town:windows')?.count ?? -1,
  };
});
assert(scene, 'the town render group exists in the scene (town:root)');
assert(scene && scene.visible === true, 'the town group is visible once a building stands');
assert(scene && scene.bodies === 1, `exactly one building body instance is drawn (${scene?.bodies})`);
assert(scene && scene.roofs === 1 && scene.windows === 1, 'roof + warm window instances match the body count');
m = await meta();
assert(m && m.instances === 1, 'the render seam agrees: 1 instance');

// Restore three more so the street reads as a street, then compose the shot.
for (const id of ['chandlery', 'post-office', 'bell-tower']) {
  const out = await page.evaluate((b) => window.__restore(b), id);
  assert(out && out.ok, `restored ${id} via the debug seam`);
}
await waitFor(async () => (await meta())?.restored.length === 4, 4000);
await sleep(500);
const four = await page.evaluate(() => window.__scene?.getObjectByName('town:bodies')?.count ?? -1);
assert(four === 4, `four buildings instanced on the shore (${four})`);

// Compose the shore shot: look down the street from the lighthouse side, with
// the ?debug scaffolding stripped so the frame reads as the game.
await hideDebugChrome();
const cam = await page.evaluate(() => {
  const w = window.__world;
  const lake = w.lake;
  const iso = lake.islets[lake.startIslet];
  return { cx: iso.center.x, cz: iso.center.z };
});
await wset(`
  w.debugCam = { x: ${cam.cx} + 10, y: 7, z: ${cam.cz} + 11, lookX: ${cam.cx} - 2, lookZ: ${cam.cz} };
`);
await sleep(900);
await page.screenshot({ path: 'tools/m5-shore.png' });
console.log('      wrote tools/m5-shore.png');
await wset('w.debugCam = null');

// --- NEXT RUN OPENS HOTTER --------------------------------------------------------
console.log('=== NEXT RUN STARTING DREAD ===');
await page.reload({ waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
const reloaded = await w(`({ dread: w.dread, startedAt: w.run.startedAtDread, peak: w.run.dreadPeak })`);
const m2 = await meta();
assert(m2 && m2.restored.length === 4, `the save persisted across a reload (${m2?.restored.length} restored)`);
// 200 − 40 − 45 − 50 − 40 = 25 (the Smokehouse plus the three seam restorations)
assert(m2 && m2.metaState.memories === 25, `the purse persisted, debited for all four (${m2?.metaState.memories})`);
assert(reloaded && reloaded.dread === 8, `the next run opens the water at Dread 8 = 2 × 4 (${reloaded?.dread})`);
assert(reloaded && reloaded.startedAt === 8, 'run.startedAtDread stamped to 8');
const inst = await page.evaluate(() => window.__scene?.getObjectByName('town:bodies')?.count ?? -1);
assert(inst === 4, `the restored street is back on the shore after the reload (${inst})`);

await browser.close();

if (failures.length > 0) {
  console.error(`M5-PROBE FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('M5-PROBE OK');
