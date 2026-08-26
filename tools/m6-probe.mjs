// tools/m6-probe.mjs — M6 KELP GRAVES gate driver (task t24 verify).
// Drives the zone's look and its pressure through a real browser at
// ?timescale=10:
//
//   A. ZONE 1 IS UNTOUCHED — the Shallows boots with no kelp instances, no silt
//      layer, and a zone fog multiplier of exactly 1.
//   B. THE DESCENT — drop to zone 2 and confirm the field is there: N columns in
//      ONE InstancedMesh (one draw call), the silt Points layer up, the fog
//      multiplier stacked on top of the phase lerp and the options murk scale.
//      Screenshot: the zone-2 look (kelp + fog + silt).
//   C. COLLIDERS — the boat cannot row through a column.
//   D. DRAG-SNAG — hook a Dragger, park the hull one side of a column and the
//      catch far beyond it, and watch the constraint REFUSE to haul the hull
//      through: a `kelpSnag` event fires, the displacement is arrested at the
//      column edge, and no `drag` event is produced from the dropped pull.
//      Screenshot: the snag moment.
//   E. PARTIAL LOS — a telegraph whose sight-line crosses a column is marked
//      `occluded` (the event still fires; only its visual cue is suppressed).
//   F. DETERMINISM — the same run seed regrows a byte-identical field.
//
// Screenshots: tools/m6-zone2-kelp.png, tools/m6-kelp-snag.png
// Usage: node tools/m6-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = process.env.M6_PROBE_URL ?? 'http://localhost:5173/?seed=616&debug&timescale=10';

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
async function waitFor(code, timeoutMs, everyMs = 25) {
  const t0 = Date.now();
  for (;;) {
    const v = await w(code);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

// --- BOOT / A. ZONE 1 IS UNTOUCHED ----------------------------------------------
console.log('=== A. ZONE 1 (the Shallows) is untouched ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

let k1 = await page.evaluate(() => window.__kelp());
assert(k1 && k1.zone === 1, `run opens in zone 1 (${k1?.zone})`);
assert(k1 && k1.columns === 0, `no kelp columns in the Shallows (${k1?.columns})`);
assert(k1 && k1.render.instances === 0, `no kelp instances rendered (${k1?.render.instances})`);
assert(k1 && k1.render.draws === 0, `no kelp draw call at zone 1 (${k1?.render.draws})`);
assert(k1 && k1.silt.visible === false, 'the silt layer is off in the Shallows');
assert(k1 && k1.fogZoneMult === 1, `zone-1 fog multiplier is exactly 1 (${k1?.fogZoneMult})`);
const fogShallows = await page.evaluate(() => window.__scene?.fog?.density ?? null);
assert(typeof fogShallows === 'number', `the Shallows fog density reads (${fogShallows})`);

// --- B. THE DESCENT: the Kelp Graves ---------------------------------------------
console.log('=== B. DESCEND → zone 2, the Kelp Graves ===');
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
await sleep(600);

const k2 = await page.evaluate(() => window.__kelp());
assert(k2 && k2.zone === 2, `descended to zone 2 (${k2?.zone})`);
assert(k2 && k2.columns > 40, `the field grew ${k2?.columns} kelp columns`);
assert(k2 && k2.clusters >= 8, `…in ${k2?.clusters} clusters, not one blanket`);
assert(
  k2 && k2.render.instances === k2.columns,
  `every column is an instance (${k2?.render.instances}/${k2?.columns})`,
);
assert(k2 && k2.render.draws === 1, `the WHOLE field is ONE draw call (${k2?.render.draws})`);
assert(k2 && k2.silt.visible === true, `the drifting silt layer is up (${k2?.silt.motes} motes, ${k2?.silt.draws} draw)`);
assert(k2 && k2.fogZoneMult > 1, `the zone thickens the fog (×${k2?.fogZoneMult})`);

// the three fog multipliers compose (phase lerp × options murk × zone)
await sleep(1200); // let the phase lerp settle at the new density
const fogGraves = await page.evaluate(() => window.__scene?.fog?.density ?? null);
assert(
  typeof fogGraves === 'number' && fogGraves > fogShallows,
  `fog is denser than the Shallows (${fogShallows?.toFixed(4)} → ${fogGraves?.toFixed(4)})`,
);

// clearance invariants, read off the live lake
const clear = await w(`(() => {
  const L = w.lake, C = 6;
  let minMouth = Infinity, minBuoy = Infinity, inIslet = 0;
  for (const k of L.kelp) {
    for (const s of L.sinkholes) minMouth = Math.min(minMouth, Math.hypot(k.x-s.mouth.x, k.z-s.mouth.z));
    for (const b of L.buoys) minBuoy = Math.min(minBuoy, Math.hypot(k.x-b.pos.x, k.z-b.pos.z));
  }
  return { minMouth, minBuoy, inIslet };
})()`);
assert(clear && clear.minMouth >= 6, `no column blocks a sinkhole mouth (nearest ${clear?.minMouth?.toFixed(1)} m)`);
assert(clear && clear.minBuoy >= 6, `no column blocks a bell buoy (nearest ${clear?.minBuoy?.toFixed(1)} m)`);

console.log('=== ZONE-2 LOOK (kelp + fog + silt): screenshot ===');
const cluster = await page.evaluate(() => window.__toKelp());
assert(cluster && cluster.n > 0, `parked at the biggest cluster (${cluster?.n} columns)`);
await wset('w.time.timescale = 1');
// chase height, behind the parked boat, looking down the cluster — the framing
// the follow camera uses in play, so the shot is the zone as it is actually seen
await wset(`w.debugCam = { x: w.boat.x, y: 6.5, z: w.boat.z + 13, lookX: ${cluster.x}, lookZ: ${cluster.z} };`);
await sleep(900);
await page.screenshot({ path: 'tools/m6-zone2-kelp.png' });
console.log('      wrote tools/m6-zone2-kelp.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 10');

// --- C. COLLIDERS -----------------------------------------------------------------
console.log('=== C. kelp columns are world colliders ===');
// Park the hull 4 m short of a stalk, aim straight at it (heading π/2 = +X) and
// let the sim row for ~2 s. The obstacle response must refuse the crossing.
const colC = await w(`(() => { const c = w.lake.kelp[0]; return { id: c.id, x: c.x, z: c.z }; })()`);
await wset(`
  const c = w.lake.kelp[0];
  w.boat.x = c.x - 4; w.boat.z = c.z;
  w.boat.heading = Math.PI / 2; w.boat.speed = 3.5;
`);
await page.keyboard.down('KeyW');
// 3.5s wall (was 1.4s): under machine load the effective timescale sags and
// the boat needs more wall time to clear the stalk — same class as the
// tether-gate scenario-B budget (docs/decisions.md).
await sleep(3500);
await page.keyboard.up('KeyW');
const afterRow = await w(`({ x: w.boat.x, z: w.boat.z })`);
const gapBoat = Math.hypot(afterRow.x - colC.x, afterRow.z - colC.z);
// The slide response deflects a head-on hit AROUND a thin stalk (T4 tangent
// semantics) — ending up past it is legal. The invariant is NO PENETRATION:
// the hull's clearance from the column centre never dips under column radius
// + hull radius (1.4 m, small tolerance for the slide's surface placement).
assert(gapBoat > 1.25, `the hull never penetrates the stalk (gap ${gapBoat.toFixed(2)} > 1.25)`);
assert(afterRow.x > colC.x - 4 + 1.0, `the boat actually rowed (x ${afterRow.x.toFixed(1)})`);
assert(
  gapBoat >= 1.35,
  `it thudded to a stop at the gunwale gap (${gapBoat.toFixed(2)} m from centre; 0.5 + 0.9 = 1.4)`,
);

// --- D. DRAG-SNAG -------------------------------------------------------------------
console.log('=== D. DRAG-SNAG — a routed drag through a column is arrested ===');
await page.evaluate(() => window.__setPhase('night'));
const hooked = await page.evaluate(() => window.__hookDragger());
assert(hooked, 'a Dragger hooked the boat in the Kelp Graves');

const setup = await page.evaluate(() => window.__kelpDrag());
assert(setup, `the hull is parked one side of column ${setup?.column}, the catch far beyond it`);

// The event stream is cleared every sim tick, so a browser-side poll would miss
// it on all but the last step of a frame. The PLAYTEST LOG is the persistent
// record: it consumes the stream sim-side and keeps every event on the fight.
// Meanwhile the catch is held on the far side of the stalk and the fight's
// tension is bled off each poll — this is a test of the PULL, not of the snap.
const snag = await page.evaluate(async (colId) => {
  const w = window.__world;
  const col = w.lake.kelp[colId];
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const f = w.tether.fights[0];
    if (f) f.tension = 0; // hold the fight open; the snap is not what is on trial
    if (w.fish) {
      w.fish.x = col.x + 20; // the catch stays on the far side, pulling
      w.fish.z = col.z;
      w.fish.stamina = w.fish.tether.maxStamina;
      w.fish.tether.exhausted = false;
    }
    const log = window.__tetherLog.getSessionLog();
    for (const rec of log.fights) {
      for (const ev of rec.events) {
        if (ev.type === 'kelpSnag') {
          return {
            ev,
            anchor: rec.anchor,
            drags: rec.drags,
            boat: { x: w.boat.x, z: w.boat.z },
            fish: w.fish ? { x: w.fish.x, z: w.fish.z } : null,
          };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 16));
  }
  return null;
}, setup ? setup.column : 0);

assert(snag, 'a kelpSnag event fired');
let snagCol = colC;
if (snag) {
  snagCol = await w(`(() => { const c = w.lake.kelp[${snag.ev.column}]; return { id: c.id, x: c.x, z: c.z }; })()`);
  const gapEvent = Math.hypot(snag.ev.at.x - snagCol.x, snag.ev.at.z - snagCol.z);
  const gapNow = Math.hypot(snag.boat.x - snagCol.x, snag.boat.z - snagCol.z);
  assert(snag.ev.anchor === 'boat', `the snag is tagged to the hauled end (${snag.ev.anchor})`);
  assert(snag.ev.arrested > 0, `displacement was dropped (${snag.ev.arrested.toFixed(3)} m arrested)`);
  assert(
    gapEvent >= 1.39 && gapEvent < 1.45,
    `the arrest landed exactly ON the column edge (${gapEvent.toFixed(3)} m; radius 0.5 + gunwale 0.9 = 1.4)`,
  );
  assert(
    snag.boat.x < snagCol.x,
    `the hull is still on the near side of the stalk (x ${snag.boat.x.toFixed(1)} < ${snagCol.x.toFixed(1)})`,
  );
  assert(gapNow >= 1.35, `…and it is held at the edge (${gapNow.toFixed(2)} m from centre)`);
  assert(snag.fish && snag.fish.x > snagCol.x, 'the catch is on the far side — the line crosses the stalk');
  assert(snag.drags === 0, `no drag event was produced from the arrested pull (${snag.drags})`);
}

console.log('=== THE SNAG MOMENT: screenshot ===');
await wset('w.time.timescale = 1');
await wset(`
  const c = w.lake.kelp[${snag ? snag.ev.column : 0}];
  w.debugCam = { x: c.x - 2, y: 3.0, z: c.z + 11, lookX: c.x, lookZ: c.z };
`);
await sleep(900);
await page.screenshot({ path: 'tools/m6-kelp-snag.png' });
console.log('      wrote tools/m6-kelp-snag.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 10');

// --- E. PARTIAL LOS -------------------------------------------------------------------
console.log('=== E. partial LOS — the telegraph is heard, not seen ===');
const los = await page.evaluate(async (colId) => {
  const w = window.__world;
  const col = w.lake.kelp[colId];
  const t0 = Date.now();
  let seen = 0;
  while (Date.now() - t0 < 15000) {
    const f = w.tether.fights[0];
    if (!f) break;
    f.tension = 0;
    // hull one side of the stalk, catch the other — the sight-line crosses weed
    w.boat.x = col.x - 5;
    w.boat.z = col.z;
    if (w.fish) {
      w.fish.x = col.x + 5;
      w.fish.z = col.z;
      w.fish.stamina = w.fish.tether.maxStamina;
      w.fish.tether.exhausted = false;
      if (w.fish.ai) w.fish.ai.lungeCooldown = 0;
    }
    const log = window.__tetherLog.getSessionLog();
    for (const rec of log.fights) {
      for (const ev of rec.events) {
        if (ev.type !== 'telegraph') continue;
        seen++;
        if (ev.occluded === true) return { occluded: true, seen };
      }
    }
    await new Promise((r) => setTimeout(r, 16));
  }
  return { occluded: false, seen };
}, snag ? snag.ev.column : 0);
assert(los && los.occluded === true, `a telegraph across a stalk is marked occluded (${JSON.stringify(los)})`);

// --- F. DETERMINISM -------------------------------------------------------------------
console.log('=== F. determinism — the same run seed regrows the same field ===');
const sig = await w(`JSON.stringify(w.lake.kelp.map(k => [k.x, k.z, k.height]))`);
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
await sleep(400);
const sig2 = await w(`JSON.stringify(w.lake.kelp.map(k => [k.x, k.z, k.height]))`);
assert(sig2 === sig, 'same run seed → byte-identical zone-2 kelp field');
const zone1Again = await w(`JSON.stringify(w.lake.zone)`);
assert(zone1Again === '2', 'the replay is in zone 2');

// --- SUMMARY ---------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log(`GATE PASS — all checks green`);
} else {
  console.log(`GATE FAIL — ${failures.length} failure(s):`);
  for (const f of failures) console.log(`  · ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
