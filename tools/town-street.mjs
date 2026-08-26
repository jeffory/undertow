// tools/town-street.mjs — the restored street, in game, with all eight
// buildings standing as their real meshes (task t20 review deliverable).
//
// Drives the M5 debug seams (__grantMemories / __restore) to buy the whole
// ledger, waits for every building's GLB to swap over its stub (the render seam
// reports stubs vs models), then composes two shots with the ?debug scaffolding
// stripped:
//   tools/town-street-foot.png — down the street from the far end, eye height.
//   tools/town-street-boat.png — the approach from the water, off the jetty.
// Usage: node tools/town-street.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.TOWN_SHOT_URL ?? 'http://localhost:5173';
const IDS = [
  'smokehouse',
  'chandlery',
  'post-office',
  'bell-tower',
  'chapel',
  'apothecary',
  'bakery',
  'schoolhouse',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

const browser = await chromium.launch({ args: BROWSER_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
});

const meta = () => page.evaluate(() => (window.__meta ? window.__meta() : null));

async function waitFor(fn, timeoutMs, everyMs = 100) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

async function hideDebugChrome() {
  await page.evaluate(() => {
    for (const sel of ['#debug', '#debug-panel', '#save-panel']) {
      document.querySelector(sel)?.remove();
    }
  });
}

// The street's geometry, read from the live islet: centre, max radius, and the
// unit axis running from the centre toward the lighthouse (meta/hubStreet.ts
// lays the slots along it).
async function street() {
  return page.evaluate(() => {
    const lake = window.__world.lake;
    const iso = lake.islets[lake.startIslet];
    let far = iso.poly[0];
    for (const v of iso.poly) if (v.x < far.x) far = v;
    let r = 0;
    for (const v of iso.poly) r = Math.max(r, Math.hypot(v.x - iso.center.x, v.z - iso.center.z));
    const dx = far.x - iso.center.x;
    const dz = far.z - iso.center.z;
    const len = Math.hypot(dx, dz) || 1;
    return { cx: iso.center.x, cz: iso.center.z, r, ax: dx / len, az: dz / len };
  });
}

async function restoreEverything() {
  await page.evaluate(() => window.__grantMemories(2000));
  // The Schoolhouse's row is gated on `zoneReached: 3`, derived from the run
  // log, so log one deep run before asking for the whole ledger.
  await page.evaluate(() => window.__logDeepRun(3));
  await sleep(200);
  for (const id of IDS) {
    const already = await page.evaluate(
      (b) => (window.__meta()?.restored ?? []).includes(b),
      id,
    );
    if (already) continue;
    const out = await page.evaluate((b) => window.__restore(b), id);
    if (!out?.ok) problems.push(`could not restore ${id}: ${out?.reason}`);
  }
  const ok = await waitFor(async () => (await meta())?.restored.length === IDS.length, 6000);
  if (!ok) problems.push('the town never reached eight restorations');
  // Now wait for every stub to be replaced by its generated mesh.
  const swapped = await waitFor(async () => (await meta())?.models === IDS.length, 30000);
  const m = await meta();
  console.log(`  restored ${m?.restored.length}/8, meshes swapped ${m?.models}/8, stubs left ${m?.stubs}`);
  if (!swapped) problems.push(`only ${m?.models}/8 buildings swapped to their real mesh`);
}

// --- FOOT: down the street ------------------------------------------------------
console.log('=== FOOT MODE ===');
await page.goto(`${BASE}/?seed=2026&debug&mode=foot`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
await restoreEverything();
await hideDebugChrome();

let s = await street();
// Stand well PAST the far end of the street (the slots run from the lighthouse
// foot back across the centre), a little off the centreline, and look down the
// row toward the tower. The renderer aims debugCam at y=0.6, so the camera has
// to sit high enough that the 5-8 m buildings clear the horizon — low and close
// framed nothing but eaves and the row's reflection in the water.
await page.evaluate(
  (v) => {
    window.__world.debugCam = {
      x: v.cx - v.ax * v.r * 1.75 - v.az * v.r * 0.75,
      y: 5.2,
      z: v.cz - v.az * v.r * 1.75 + v.ax * v.r * 0.75,
      lookX: v.cx + v.ax * v.r * 0.15,
      lookZ: v.cz + v.az * v.r * 0.15,
    };
  },
  s,
);
await sleep(1200);
await page.screenshot({ path: 'tools/town-street-foot.png' });
console.log('  wrote tools/town-street-foot.png');

// --- BOAT: the approach from the water ------------------------------------------
console.log('=== BOAT APPROACH ===');
await page.goto(`${BASE}/?seed=2026&debug`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
const carried = await meta();
console.log(`  the save carried ${carried?.restored.length ?? 0} restorations into the run`);
if ((carried?.restored.length ?? 0) !== IDS.length) await restoreEverything();
else await waitFor(async () => (await meta())?.models === IDS.length, 30000);
await hideDebugChrome();

s = await street();
// Off the street's flank, on the water: row in and the whole row is broadside.
const px = -s.az;
const pz = s.ax;
await page.evaluate(
  (v) => {
    // put the hull just ahead of the camera, so the approach reads as an approach
    window.__world.boat.x = v.cx + v.px * (v.r + 12) - v.ax * v.r * 0.5;
    window.__world.boat.z = v.cz + v.pz * (v.r + 12) - v.az * v.r * 0.5;
    window.__world.debugCam = {
      x: v.cx + v.px * (v.r + 17) - v.ax * v.r * 0.5,
      y: 6.5,
      z: v.cz + v.pz * (v.r + 17) - v.az * v.r * 0.5,
      lookX: v.cx,
      lookZ: v.cz,
    };
  },
  { ...s, px, pz },
);
await sleep(1400);
await page.screenshot({ path: 'tools/town-street-boat.png' });
console.log('  wrote tools/town-street-boat.png');

await browser.close();

if (problems.length > 0) {
  console.error(`TOWN-STREET problems (${problems.length})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('TOWN-STREET OK');
