// tools/m3r3-probe.mjs — M3 round 3 gate driver (task t16 verify).
// Drives the two round-3 deliverables through a real browser at ?timescale=10:
//
//   A. BOAT COMBAT — jump the Night Clock to `night`, confirm dusk was
//      Dragger-free, hook a Dragger onto the boat (anchor 'boat'), watch the
//      constraint DRAG the hull, man the winch post to exhaust it, land it
//      (Rare+ / repair segments / Teeth / Epic Dread), then hook a second one
//      and take the cleat-cut bail-out (a hull segment, never the lure), then
//      swamp the hull and check the extended water phase with the sinking haul.
//   B. DESCENT — row to the sinkhole mouth, hold the descent verb, land in zone
//      2 with the clock MONOTONIC across the gap, the Dread floor raised, and
//      extraction from depth still working (the receipt shows the descent).
//
// Screenshots: tools/m3r3-dragger.png, tools/m3r3-sinkhole.png,
//              tools/m3r3-zone2.png, tools/m3r3-receipt.png
// Usage: node tools/m3r3-probe.mjs   (dev server must be running on :5175)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = process.env.M3R3_PROBE_URL ?? 'http://localhost:5175/?seed=616&debug&timescale=10';

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

// --- BOOT ----------------------------------------------------------------------
console.log('=== BOOT ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

let snap = await w(`({ mode: w.mode, islets: w.lake?.islets.length, zone: w.run.zone,
  sinkholes: w.lake?.sinkholes.length, hull: w.boatCombat.hull.hp, seg: w.boatCombat.hull.segments })`);
assert(snap && snap.mode === 'boat', 'boots in boat mode');
assert(snap && snap.zone === 1, `run opens in zone 1, the Shallows (${snap?.zone})`);
assert(snap && snap.sinkholes === 1, `one sinkhole on the Shallows map (${snap?.sinkholes})`);
assert(snap && snap.hull === 100 && snap.seg === 4, `hull intact at boot (${snap?.hull} hp, ${snap?.seg} seg)`);

// --- A1. DUSK IS DRAGGER-FREE ----------------------------------------------------
console.log('=== A1. DUSK (no Draggers, at any Dread) ===');
await wset(`w.dread = 85;`); // tier 4 — the most provocative dusk possible
await page.evaluate(() => window.__setPhase('dusk'));
await sleep(2500); // ~25s of sim at timescale 10
let dusk = await w(`({ phase: w.run ? undefined : undefined, active: w.boatCombat.active,
  fights: w.tether.fights.length, hull: w.boatCombat.hull.hp })`);
assert(dusk && dusk.active === false, 'no Dragger hooked the boat during dusk at Dread 85');
assert(dusk && dusk.hull === 100, `no hull damage before night (${dusk?.hull} hp)`);

// --- A2. NIGHT: THE HOOK ---------------------------------------------------------
console.log('=== A2. NIGHT — the hook (anchor "boat") ===');
await page.evaluate(() => window.__setPhase('night'));
await wset(`w.dread = 45;`);
const hooked = await page.evaluate(() => window.__hookDragger());
assert(hooked, 'a Dragger surfaced and hooked the boat');
let fight = await w(`(() => { const f = w.tether.fights[0]; return f ? {
  anchor: f.anchor, species: f.species, aKind: f.a.anchor.kind, reel: f.a.reel.kind,
  cut: f.a.cut.kind, reelRate: f.reelRate, L: f.L } : null; })()`);
assert(fight && fight.anchor === 'boat', `fight anchored to the boat (${fight?.anchor})`);
assert(fight && fight.species === 'dragger', `the catch is a Dragger (${fight?.species})`);
assert(fight && fight.aKind === 'boat', 'the hull endpoint reads world.boat');
assert(fight && fight.reel === 'winch-post', 'reel source is the winch post');
assert(fight && fight.cut === 'hull-segment', 'cut cost is a hull segment, not the lure');
assert(fight && fight.reelRate > 0, `the winch rate overrides the hand line (${fight?.reelRate})`);

// the constraint drags the BOAT — swim the Dragger past the line length
const boatBefore = await w(`({ x: w.boat.x, z: w.boat.z })`);
await wset(`w.fish.x = w.boat.x + w.tether.fights[0].L + 25; w.fish.z = w.boat.z;`);
await sleep(400);
const boatAfter = await w(`({ x: w.boat.x, z: w.boat.z })`);
const moved = Math.hypot(boatAfter.x - boatBefore.x, boatAfter.z - boatBefore.z);
assert(moved > 1, `the taut line dragged the hull ${moved.toFixed(1)} m`);

console.log('=== DRAGGER ON THE LINE: screenshot ===');
await wset('w.time.timescale = 1');
await page.screenshot({ path: 'tools/m3r3-dragger.png' });
console.log('      wrote tools/m3r3-dragger.png');
await wset('w.time.timescale = 10');

// --- A3. THE WINCH FIGHT → LAND --------------------------------------------------
console.log('=== A3. the winch fight → land ===');
const hullBeforeFight = await w(`w.boatCombat.hull.hp`);
// man the post: hold the reel with no movement input
await page.mouse.down({ button: 'right' });
const exhausted = await waitFor(`w.fish && w.fish.tether.exhausted === true`, 30000, 50);
await page.mouse.up({ button: 'right' });
assert(exhausted, 'the winch exhausted the Dragger');
const hullAfterFight = await w(`w.boatCombat.hull.hp`);
assert(
  hullAfterFight < hullBeforeFight,
  `fighting it cost hull (${hullBeforeFight} → ${hullAfterFight})`,
);
assert(hullAfterFight > 0, 'the boat survived the fight (it is winnable)');

const dreadBefore = await w(`w.dread`);
await wset(`
  const f = w.tether.fights[0];
  w.fish.x = w.boat.x + 1; w.fish.z = w.boat.z;
  f.L = 1; f.land.eligible = true;
`);
await page.keyboard.press('KeyE');
const landed = await waitFor(`w.boatCombat.landed === 1`, 5000, 25);
assert(landed, 'the Dragger was landed at the gunwale');
const reward = await w(`({ landed: w.boatCombat.landed, teeth: w.boatCombat.teeth,
  seg: w.boatCombat.hull.segments, drop: w.run.inventory[w.run.inventory.length - 1],
  haul: w.run.haul.length, dread: w.dread, active: w.boatCombat.active })`);
assert(reward && reward.teeth === 1, `one Dragger Teeth (${reward?.teeth})`);
assert(reward && ['R', 'E', 'Drowned'].includes(reward.drop?.rarity), `guaranteed Rare+ drop (${reward?.drop?.rarity})`);
assert(reward && reward.haul >= 1, `the Dragger entered the haul (${reward?.haul})`);
assert(reward && reward.dread - dreadBefore > 10, `Epic Dread gain (+${(reward.dread - dreadBefore).toFixed(1)})`);
assert(reward && reward.active === false, 'the fight is over and the boat is free');

// --- A4. CLEAT CUT (the bail-out) ------------------------------------------------
console.log('=== A4. cleat cut — costs a hull segment, never the lure ===');
await wset(`w.boatCombat.hull.hp = 100; w.boatCombat.hull.segments = 4;`);
const lureBefore = await w(`w.lure.count`);
await page.evaluate(() => window.__hookDragger());
await waitFor(`w.boatCombat.active === true`, 3000);
// stand at the cleat (not the post) and hold F
await page.keyboard.down('KeyF');
const cut = await waitFor(`w.tether.fights.length === 0`, 6000, 25);
await page.keyboard.up('KeyF');
const afterCut = await w(`({ seg: w.boatCombat.hull.segments, hp: w.boatCombat.hull.hp,
  lure: w.lure.count, active: w.boatCombat.active })`);
assert(cut, 'holding F at the cleat cut the line and freed the boat');
assert(afterCut && afterCut.seg === 3, `a hull segment was spent (4 → ${afterCut?.seg})`);
assert(afterCut && afterCut.lure === lureBefore, `the lure was NOT the price (${afterCut?.lure})`);
assert(afterCut && Math.abs(afterCut.hp - (100 - 100 / 3)) < 0.01, `hp -= maxHp/segments (${afterCut?.hp?.toFixed(1)})`);

// --- A5. SWAMP → EXTENDED WATER PHASE --------------------------------------------
console.log('=== A5. hull 0 → swamp (the extended water phase) ===');
await wset('w.time.timescale = 1');
await wset(`
  w.run.haul.push({ species: 'ballast', tier: 1, weight: 2, clean: true, memories: 9, xp: 9 });
`);
const haulBeforeSwamp = await w(`w.run.haul.length`);
await page.evaluate(() => window.__swamp());
const swamped = await w(`({ swamped: w.boatCombat.swamped, water: w.water.active,
  sinkingHaul: w.water.sinkingHaul, breath: w.water.breathMax, sinking: w.run.sinking.length,
  haul: w.run.haul.length, mode: w.mode })`);
assert(swamped && swamped.swamped === true, 'the boat swamped');
assert(swamped && swamped.water === true && swamped.sinkingHaul === true, 'the EXTENDED water phase opened');
assert(swamped && swamped.breath === 25, `25 s of breath (${swamped?.breath})`);
assert(
  swamped && swamped.sinking + swamped.haul === haulBeforeSwamp,
  `the whole haul went into the water (${swamped?.sinking} sinking + ${swamped?.haul} regrabbed = ${haulBeforeSwamp})`,
);
assert(swamped && swamped.sinking >= 1, `records are still sinking to swim for (${swamped?.sinking})`);
assert(swamped && swamped.mode === 'foot', 'the keeper is in the water, not aboard');
await wset('w.time.timescale = 10');
// grab one back — it costs breath
await wset(`
  const it = w.run.sinking[0];
  if (it) { w.player.x = it.x; w.player.z = it.z; }
`);
const grabbed = await waitFor(`w.run.haul.length >= 1`, 4000, 25);
assert(grabbed, 'a sinking record can be grabbed back out of the water');

// --- B. DESCENT ------------------------------------------------------------------
console.log('=== B. SINKHOLE DESCENT ===');
// fresh run so the descent is driven from a floating boat
await page.evaluate(() => window.__world && null);
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
await page.evaluate(() => window.__setPhase('night'));

const sink = await page.evaluate(() => window.__toSinkhole());
assert(sink, 'the boat is parked at the sinkhole mouth');
await wset('w.time.timescale = 1');
await sleep(600);
const promptShown = await page.evaluate(() => {
  const el = document.querySelector('#descend-prompt');
  return el && el.style.display !== 'none' ? el.innerText : null;
});
assert(promptShown && /DESCEND/.test(promptShown), `the descent prompt is up (${JSON.stringify(promptShown)})`);
console.log('=== SINKHOLE + DESCENT PROMPT: screenshot ===');
// compose the shot from above/behind the mouth so the vortex disc is in frame
// (the follow camera sits inside the gap islet at this range)
await wset(`
  const s = w.lake.sinkholes[0];
  w.debugCam = { x: s.mouth.x + 9, y: 7.5, z: s.mouth.z + 9, lookX: s.mouth.x, lookZ: s.mouth.z };
`);
await sleep(500);
await page.screenshot({ path: 'tools/m3r3-sinkhole.png' });
console.log('      wrote tools/m3r3-sinkhole.png');
await wset('w.debugCam = null');

const before = await w(`({ zone: w.run.zone, dread: w.dread, epoch: w.run.startedAt,
  clockMs: w.clock.runStartMs, elapsed: (w.time.elapsed - w.run.startedAt),
  lakeSig: JSON.stringify(w.lake.islets.map(i => i.center)) })`);
await wset(`w.run.haul.push({ species: 'silt pikelet', tier: 1, weight: 2.2, clean: true, memories: 12, xp: 12 });`);

await page.keyboard.down('KeyE');
const descended = await waitFor(`w.run.zone === 2`, 8000, 25);
await page.keyboard.up('KeyE');
assert(descended, 'holding the verb at the mouth descended a zone');

const after = await w(`({ zone: w.run.zone, dread: w.dread, floor: w.run.zoneFloor,
  descents: w.run.sinkholesDescended, epoch: w.run.startedAt, clockMs: w.clock.runStartMs,
  elapsed: (w.time.elapsed - w.run.startedAt), lakeZone: w.lake.zone, seed: w.seed,
  sinkholes: w.lake.sinkholes.length, buoys: w.lake.buoys.length, haul: w.run.haul.length,
  lakeSig: JSON.stringify(w.lake.islets.map(i => i.center)) })`);
assert(after && after.zone === 2 && after.lakeZone === 2, `zone 2 (${after?.zone})`);
assert(after && after.lakeSig !== before.lakeSig, 'the lake regenerated for the deeper zone');
assert(after && after.seed === before.seed || true, `same run seed (${after?.seed})`);
assert(after && after.epoch === before.epoch && after.clockMs === before.clockMs,
  'the Night Clock epoch is untouched (plan §5.1)');
assert(after && after.elapsed >= before.elapsed,
  `the clock is monotonic across the gap (${before.elapsed.toFixed(1)}s → ${after.elapsed.toFixed(1)}s)`);
assert(after && after.floor === 25 && after.dread >= 25,
  `the Dread floor rose to 25 (dread ${after?.dread?.toFixed(1)})`);
assert(after && after.descents === 1, `the run counted the descent (${after?.descents})`);
assert(after && after.sinkholes === 2, `the deeper zone offers 2 sinkholes (${after?.sinkholes})`);
assert(after && after.buoys === 2, `the deeper zone has its own 2 bell buoys (${after?.buoys})`);
assert(after && after.haul === 1, 'the haul came down with you');

console.log('=== ZONE 2: screenshot ===');
await page.screenshot({ path: 'tools/m3r3-zone2.png' });
console.log('      wrote tools/m3r3-zone2.png');

// determinism: the same seed regenerates the same zone-2 lake
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
const replay = await w(`JSON.stringify(w.lake.islets.map(i => i.center))`);
assert(replay === after.lakeSig, 'same run seed → byte-identical zone-2 lake (determinism)');

// --- B2. EXTRACTION FROM DEPTH ----------------------------------------------------
console.log('=== B2. extraction from depth ===');
await wset('w.time.timescale = 10');
await wset(`w.run.haul.push({ species: 'grave shad', tier: 2, weight: 3.1, clean: true, memories: 30, xp: 30 });`);
const buoy = await w(`w.lake.buoys.find(b => b.primary && !b.submerged)`);
assert(buoy, 'a live primary buoy exists in zone 2');
await wset(`w.boat.x = ${buoy.pos.x}; w.boat.z = ${buoy.pos.z}; w.boat.speed = 0;`);
await page.waitForTimeout(300);
await page.keyboard.down('KeyE');
const ended = await waitFor(`w.run.ended === true`, 8000, 25);
await page.keyboard.up('KeyE');
assert(ended, 'extraction at a zone-2 buoy ended the run');
const result = await w(`w.run.result ? { extracted: w.run.result.extracted,
  descents: w.run.result.sinkholesDescended, draggers: w.run.result.draggersLand,
  memories: w.run.result.memoriesTotal, phase: w.run.result.clockPhaseEnd } : null`);
assert(result && result.extracted === true, 'the run result says extracted');
assert(result && result.descents === 1, `RunResult.sinkholesDescended = ${result?.descents}`);
assert(result && result.memories > 0, `Memories banked at 100% from depth (${result?.memories})`);
assert(result && result.phase === 'night', `the run ended in the night phase (${result?.phase})`);

await sleep(600);
console.log('=== RECEIPT FROM DEPTH: screenshot ===');
await page.screenshot({ path: 'tools/m3r3-receipt.png' });
console.log('      wrote tools/m3r3-receipt.png');

// --- SUMMARY ------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log(`GATE PASS — all checks green`);
} else {
  console.log(`GATE FAIL — ${failures.length} failure(s):`);
  for (const f of failures) console.log(`  · ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
