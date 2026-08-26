// tools/m7-probe.mjs — M7 THE TOWNSHIP round-1 gate driver (task t27 verify).
// Drives the drowned Hollow's look and its rooftop traversal through a real
// browser at ?timescale=10:
//
//   A. ZONE 1 IS UNTOUCHED — the Shallows boots with no roofs, no township
//      draws, and a zone fog tint of exactly 0 strength.
//   B. DESCEND TWICE → zone 3. The street is there: 8-14 roofs, one steeple,
//      one marquee, sodium lamps, one InstancedMesh for every deck, and one
//      roof ISLET per roof appended to the lake.
//      Screenshot: the drowned street from the boat, marquee lit.
//   C. DOCK ONTO A ROOF — through the REAL B verb (game/input.ts), not a seam:
//      the keeper ends up in foot mode, on the roof's islet, standing at the
//      deck height isletHeightAt reports.
//   D. WALK THE ROOF — hold W; collision holds the keeper on the slates.
//   E. CAST FROM THE ROOF — the ordinary foot cast flow, from up there.
//      Screenshot: standing on a roof mid-cast.
//   F. ENV TEXT — row back into the marquee's radius and the parchment line
//      appears, carrying SOMETHING IN THE WATER.
//   G. DETERMINISM — the same run seed regrows a byte-identical street.
//   H. PERF — the draw/tri delta the drowned town costs.
//
// Screenshots: tools/m7-drowned-street.png, tools/m7-roof-cast.png
// Usage: node tools/m7-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.M7_PROBE_URL ?? 'http://localhost:5173';
const URL = `${BASE}/?seed=616&debug&timescale=10`;

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
// The ?debug overlay is the renderer's own draw/tri readout (systems.ts writes
// it from renderer.info) — the honest way to price a zone from outside.
const info = () => page.evaluate(() => {
  const t = document.getElementById('debug')?.textContent ?? '';
  const calls = /draw calls (\d+)/.exec(t);
  const tris = /tris (\d+)/.exec(t);
  return { calls: calls ? Number(calls[1]) : null, tris: tris ? Number(tris[1]) : null };
});

// --- BOOT / A. ZONE 1 IS UNTOUCHED ----------------------------------------------
console.log('=== A. ZONE 1 (the Shallows) is dry ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const t1 = await page.evaluate(() => window.__township());
assert(t1 && t1.zone === 1, `run opens in zone 1 (${t1?.zone})`);
assert(t1 && t1.roofs === 0, `no roofs in the Shallows (${t1?.roofs})`);
assert(t1 && t1.roofIslets === 0, `no roof islets appended (${t1?.roofIslets})`);
assert(t1 && t1.lamps === 0 && t1.envPoints === 0, 'no lamps, no signage');
assert(t1 && t1.street === null, 'no street line');
assert(t1 && t1.render.draws === 0, `the township costs ZERO draws at zone 1 (${t1?.render.draws})`);
assert(t1 && t1.fogTint.strength === 0, `zone-1 fog tint strength is exactly 0 (${t1?.fogTint.strength})`);
const isletsZ1 = t1 ? t1.islets : 0;
const perfZ1 = await info();
assert(
  perfZ1.calls !== null,
  `the Shallows draws ${perfZ1.calls} calls / ${perfZ1.tris?.toLocaleString()} tris (the baseline)`,
);

// --- B. DESCEND TWICE → THE TOWNSHIP ---------------------------------------------
console.log('=== B. DESCEND ×2 → zone 3, The Township ===');
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
await sleep(500);
const midZone = await w('w.run.zone');
assert(midZone === 2, `first descent lands in the Kelp Graves (${midZone})`);
await page.evaluate(() => window.__descend());
await sleep(2500);

const t3 = await page.evaluate(() => window.__township());
assert(t3 && t3.zone === 3, `descended to zone 3 (${t3?.zone})`);
assert(t3 && t3.roofs >= 8 && t3.roofs <= 14, `${t3?.roofs} roofs break the surface (8-14)`);
assert(t3 && t3.steeples === 1, `exactly one steeple (${t3?.steeples})`);
assert(t3 && t3.marquees === 1, `exactly one cinema/marquee (${t3?.marquees})`);
assert(t3 && t3.lamps > 0, `${t3?.lamps} drowned streetlamps light the road`);
assert(t3 && t3.envPoints === t3.roofs + 1, `one sign per roof plus the marquee (${t3?.envPoints})`);
assert(t3 && t3.street !== null && t3.street.length > 60, `the street runs ${t3?.street?.length?.toFixed(0)} m`);
assert(t3 && t3.fogTint.strength > 0, `the zone warms the fog (${t3?.fogTint.strength} toward sodium amber)`);

// THE MAPPING: one appended islet per roof, and the natural archipelago intact.
assert(
  t3 && t3.roofIslets === t3.roofs,
  `every roof is an ISLET (${t3?.roofIslets}/${t3?.roofs})`,
);
const naturalZ3 = t3 ? t3.islets - t3.roofIslets : 0;
assert(
  naturalZ3 >= 9 && naturalZ3 <= 14,
  `the natural archipelago is untouched under the town (${naturalZ3} islets)`,
);

// THE DRAWS: every deck is ONE instanced mesh.
assert(t3 && t3.render.deckDraws === 1, `all ${t3?.render.decks} decks are ONE draw call`);
assert(t3 && t3.render.models > 0, `${t3?.render.models} submerged buildings loaded`);
assert(t3 && t3.render.marquee === true, 'the marquee is hung');
console.log(
  `      township draws ${t3.render.draws} (decks 1 + models ${t3.render.models} + lamps ${t3.render.lampDraws} + marquee 1), ` +
    `${t3.render.tris.toLocaleString()} building tris`,
);

// clearance invariants, read off the live lake
const clear = await w(`(() => {
  const L = w.lake, C = 6;
  let minKeep = Infinity, minPair = Infinity, inIslet = 0;
  const keep = [];
  for (const s of L.sinkholes) { keep.push(s.mouth); keep.push(s.pos); }
  for (const b of L.buoys) keep.push(b.pos);
  for (const k of L.wrecks) keep.push(k.pos);
  for (const r of L.roofs) {
    const reach = Math.hypot(r.halfX, r.halfZ);
    for (const k of keep) minKeep = Math.min(minKeep, Math.hypot(r.pos.x-k.x, r.pos.z-k.z) - reach);
    for (const o of L.roofs) {
      if (o.id === r.id) continue;
      minPair = Math.min(minPair, Math.hypot(r.pos.x-o.pos.x, r.pos.z-o.pos.z) - reach - Math.hypot(o.halfX, o.halfZ));
    }
  }
  return { minKeep, minPair, inIslet };
})()`);
assert(clear && clear.minKeep >= 5.99, `no roof blocks a mouth/buoy/wreck (nearest ${clear?.minKeep?.toFixed(1)} m)`);
assert(clear && clear.minPair > 0, `the roofs never fuse (closest rims ${clear?.minPair?.toFixed(1)} m apart)`);

// --- THE DROWNED STREET: screenshot ------------------------------------------------
console.log('=== THE DROWNED STREET (marquee lit): screenshot ===');
// Park in the channel just short of the cinema, and frame the marquee: this is
// the shot the zone exists for — a boat rowing the flooded main street with the
// Lyceum still advertising the film that played the night the Hollow drowned.
const street = await page.evaluate(() => {
  const w = window.__world;
  const st = w.lake.street;
  const cinema = w.lake.roofs.find((r) => r.slot === 'marquee');
  const t = Math.max(6, cinema.t - 12);
  w.boat.x = st.origin.x + st.dir.x * t - st.perp.x * cinema.side * 2.5;
  w.boat.z = st.origin.z + st.dir.z * t - st.perp.z * cinema.side * 2.5;
  w.boat.speed = 0;
  w.boat.heading = Math.atan2(st.dir.z, st.dir.x);
  return { at: { x: w.boat.x, z: w.boat.z }, marquee: w.lake.envPoints.find((p) => p.key === 'marquee') };
});
assert(street, 'parked the hull in the drowned street, off the cinema');
await wset('w.time.timescale = 1');
await wset(`
  const st = w.lake.street;
  const m = w.lake.envPoints.find(p => p.key === 'marquee');
  w.debugCam = {
    x: w.boat.x - st.dir.x * 7, y: 2.9, z: w.boat.z - st.dir.z * 7,
    lookX: m.pos.x, lookZ: m.pos.z,
  };
`);
await sleep(1100);
const perfZ3 = await info();
await page.screenshot({ path: 'tools/m7-drowned-street.png' });
console.log('      wrote tools/m7-drowned-street.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 10');

// --- C. DOCK ONTO A ROOF (the REAL B verb) ------------------------------------------
console.log('=== C. dock onto a roof — the ordinary B verb ===');
const target = await page.evaluate(() => window.__toRoof(4));
assert(target, `parked at roof ${target?.roof?.id} (${target?.roof?.building})`);
assert(
  target && target.edgeGap <= 2,
  `the hull is inside DOCK_RANGE of the roof's hull (${target?.edgeGap?.toFixed(2)} m)`,
);
await page.keyboard.down('KeyB');
await sleep(500); // hold well past one display frame — updateInput samples per frame
await page.keyboard.up('KeyB');
const dockedOk = await waitFor(`w.mode === 'foot'`, 5000);
assert(dockedOk, 'the B verb resolved into foot mode');
const docked = await page.evaluate(() => window.__township());
assert(docked && docked.mode === 'foot', `B put the keeper on the slates (mode ${docked?.mode})`);
assert(
  docked && docked.dockedIslet === target.roof.isletId,
  `docked onto the ROOF's islet (#${docked?.dockedIslet} vs #${target?.roof?.isletId})`,
);
assert(docked && docked.onRoof === target.roof.id, `the sim knows which roof (${docked?.onRoof})`);
assert(
  docked && docked.groundY > 0.4,
  `the keeper stands on the deck, above the flood (y ${docked?.groundY?.toFixed(2)})`,
);

// --- D. WALK THE ROOF ------------------------------------------------------------
console.log('=== D. the roof is walkable — and it holds ===');
const before = await w('({ x: w.player.x, z: w.player.z })');
for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
  await page.keyboard.down(key);
  await sleep(700);
  await page.keyboard.up(key);
}
const walked = await w(`(() => {
  const iso = w.lake.islets[w.dockedIslet];
  const roof = w.lake.roofs.find(r => r.isletId === w.dockedIslet);
  const d = Math.hypot(w.player.x - roof.pos.x, w.player.z - roof.pos.z);
  return { d, reach: Math.hypot(roof.halfX, roof.halfZ), mode: w.mode, x: w.player.x, z: w.player.z, docked: w.dockedIslet };
})()`);
assert(walked && walked.mode === 'foot', 'still on foot after walking');
assert(
  walked && (Math.abs(walked.x - before.x) > 0.2 || Math.abs(walked.z - before.z) > 0.2),
  'the keeper actually moved across the slates',
);
assert(
  walked && walked.d <= walked.reach + 0.02,
  `collision held them ON the roof (${walked?.d?.toFixed(2)} m from centre, rim ${walked?.reach?.toFixed(2)})`,
);

// --- E. CAST FROM THE ROOF ----------------------------------------------------------
console.log('=== E. fishing from a roof — the ordinary foot cast flow ===');
const noLandFish = await w('w.fish === null');
assert(noLandFish, 'no land fish flops on the slates (the foot caster needs this)');
const ripple = await page.evaluate(() => window.__roofRipple());
assert(ripple, `a ripple in the street, ${ripple?.fromPlayer?.toFixed(1)} m off the roof`);
assert(ripple && ripple.fromPlayer <= 10, 'the ripple is inside CAST_RANGE of the rooftop');
await wset('w.time.timescale = 1');
await sleep(300);
// A single press can miss the rising edge under load (the same class of flake
// run-probe's "hold across several frames" note calls out), so the press is
// retried up to three times before the gate calls it.
const rippleId = ripple ? ripple.id : -1;
let casting = null;
// Under swiftshader the display frame can be ~300 ms, and updateInput samples
// the key/button state once per FRAME — so the press has to be held well past
// one frame or it can fall entirely between two.
for (let attempt = 0; attempt < 4 && !casting; attempt++) {
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await sleep(750);
  await page.mouse.up();
  casting = await waitFor(`w.disturbances.some(d => d.id === ${rippleId} && d.state !== 'idle')`, 1500);
}
assert(casting, 'the cast went out FROM THE ROOFTOP');
if (!casting) {
  console.log('      diagnostic:', JSON.stringify(await w(`({
    mode: w.mode, docked: w.dockedIslet, fish: !!w.fish, fights: w.tether.fights.length,
    promptId: w.run.promptId, water: w.water.active, aim: w.run.debugCastPoint,
    dists: w.disturbances.map(d => ({ id: d.id, s: d.state })),
  })`)));
}

console.log('=== STANDING ON A ROOF, MID-CAST: screenshot ===');
// from out in the flooded street, looking back at the keeper on his slates —
// the roof, the ripple in the road, and the lamps behind, all in one frame
await wset(`
  const st = w.lake.street;
  const roof = w.lake.roofs.find(r => r.isletId === w.dockedIslet);
  const cx = -st.perp.x * roof.side, cz = -st.perp.z * roof.side; // toward the road
  w.debugCam = {
    x: w.player.x + cx * 11 + st.dir.x * 5,
    y: 4.4,
    z: w.player.z + cz * 11 + st.dir.z * 5,
    lookX: w.player.x, lookZ: w.player.z,
  };
`);
await sleep(1000);
await page.screenshot({ path: 'tools/m7-roof-cast.png' });
console.log('      wrote tools/m7-roof-cast.png');
await wset('w.debugCam = null');

// the prompt/SET is the ordinary flow and is covered by run-probe; what M7 owes
// is that the cast was legal from up there, which the assert above proves.
await wset('w.time.timescale = 10');

// --- F. ENVIRONMENTAL TEXT ------------------------------------------------------------
console.log('=== F. the marquee reads from the water ===');
// step back aboard, then row into the marquee's radius
// walk back to the gunwale first — B only boards from within DOCK_RANGE of the
// hull, and section D deliberately left the keeper across the roof
await wset(`w.player.x = w.boat.x; w.player.z = w.boat.z;`);
await sleep(200); // collision clamps them to the roof edge nearest the boat
await page.keyboard.down('KeyB');
await sleep(500);
await page.keyboard.up('KeyB');
const aboard = await waitFor(`w.mode === 'boat'`, 5000);
assert(aboard, 'stepped back aboard the boat');
const marqueeMoved = await wset(`
  const m = w.lake.envPoints.find(p => p.key === 'marquee');
  const c = w.lake.roofs[m.roofId];
  const ax = m.pos.x - c.pos.x, az = m.pos.z - c.pos.z;
  const len = Math.hypot(ax, az) || 1;
  // out in the channel, past the cinema roof's own 6.5 m sign radius
  w.boat.x = m.pos.x + (ax / len) * 10;
  w.boat.z = m.pos.z + (az / len) * 10;
  w.boat.speed = 0;
  w.township.nearEnv = null; // re-arm the entry edge for the gate
  return { x: w.boat.x, z: w.boat.z, marquee: m.pos };
`);
assert(marqueeMoved, 'rowed into the marquee’s reading radius');
await waitFor(`w.township.nearEnv !== null`, 4000);
await sleep(400); // let the ui phase present the parchment
const env = await page.evaluate(() => window.__township());
assert(env && env.env.visible, 'the parchment line is on screen');
assert(
  env && env.env.text.includes('SOMETHING IN THE WATER'),
  `…and it is the marquee: "${env?.env?.text}"`,
);
assert(env && env.envRead > 0, `${env?.envRead} signs read this run`);

// --- G. DETERMINISM ---------------------------------------------------------------------
console.log('=== G. the same seed regrows the same street ===');
const sig = await w(`JSON.stringify({ r: w.lake.roofs, l: w.lake.lamps, e: w.lake.envPoints, s: w.lake.street })`);
const page2 = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page2.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page2.waitForTimeout(3500);
await page2.evaluate(() => window.__setPhase('night'));
await page2.evaluate(() => window.__descend());
await page2.waitForTimeout(400);
await page2.evaluate(() => window.__descend());
await page2.waitForTimeout(1200);
const sig2 = await page2.evaluate(
  () => JSON.stringify({ r: window.__world.lake.roofs, l: window.__world.lake.lamps, e: window.__world.lake.envPoints, s: window.__world.lake.street }),
);
assert(sig === sig2, 'a second run of the same seed laid a byte-identical drowned town');
await page2.close();

// --- H. PERF -----------------------------------------------------------------------------
console.log('=== H. what the drowned town costs ===');
console.log(
  `      zone 1 (boot framing):   ${perfZ1.calls} draw calls, ${perfZ1.tris?.toLocaleString()} tris — 0 of them the town.\n` +
    `      zone 3 (street framing): ${perfZ3.calls} draw calls, ${perfZ3.tris?.toLocaleString()} tris.\n` +
    `      township's own share:    ${t3.render.draws} draws = 1 instanced deck mesh (all ${t3.render.decks} roofs) ` +
    `+ ${t3.render.models} building meshes + ${t3.render.lampDraws} lamp draws (1 instanced pole mesh, ` +
    `${t3.render.lamps} glass cubes, ${t3.render.lamps} halo sprites) + 1 marquee, ` +
    `and ${t3.render.tris.toLocaleString()} building tris.`,
);
assert(
  t3.render.draws < 40,
  `the drowned town stays under a 40-draw budget (${t3.render.draws})`,
);

// --- verdict -------------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log('M7 PROBE: ALL GREEN');
} else {
  console.log(`M7 PROBE: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log(`  - ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
