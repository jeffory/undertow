// tools/lake-shot.mjs — M3 round 1 evidence driver (task t8 verify).
// 1. Boat: open the lake in boat mode, screenshot lake-boat.png (boat on the
//    open water, multiple islets visible) and read the debug perf readout.
// 2. Foot: docked foot mode on a generated islet, screenshot lake-foot.png.
// 3. Tether: press T in foot mode → assert a tether fight starts (the M2 test
//    fight must work on a generated islet).
// Usage: node tools/lake-shot.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const browser = await chromium.launch({ args: BROWSER_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const failures = [];
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));

async function readPerf() {
  return page.evaluate(() => {
    const t = document.getElementById('debug')?.textContent ?? '';
    const dc = Number(/draw calls (\d+)/.exec(t)?.[1] ?? -1);
    const tris = Number(/tris (\d+)/.exec(t)?.[1] ?? -1);
    return { dc, tris };
  });
}

async function worldSnapshot() {
  return page.evaluate(() => {
    const w = window.__world;
    if (!w) return null;
    return {
      mode: w.mode,
      seed: w.seed,
      islets: w.lake ? w.lake.islets.length : -1,
      startIslet: w.lake ? w.lake.startIslet : -1,
      boat: { x: w.boat.x, z: w.boat.z },
      dockedIslet: w.dockedIslet,
      player: { x: w.player.x, z: w.player.z },
      fights: w.tether.fights.length,
      fish: w.fish !== null,
      water: w.water.active,
    };
  });
}

// --- boat shot ---------------------------------------------------------------
console.log('=== BOAT: lake-boat.png ===');
await page.goto('http://localhost:5173/?seed=2026&debug');
await page.waitForTimeout(6500);
let snap = await worldSnapshot();
assert(snap && snap.mode === 'boat', `boat mode (seed ${snap ? snap.seed : '?'})`);
assert(snap && snap.islets >= 9, `lake generated with ${snap ? snap.islets : '?'} islets`);
const perfBoat = await readPerf();
console.log(`      perf: ${perfBoat.dc} draw calls, ${perfBoat.tris} tris`);
await page.screenshot({ path: 'tools/lake-boat.png' });
console.log('      wrote tools/lake-boat.png');

// --- foot shot ---------------------------------------------------------------
console.log('=== FOOT: lake-foot.png ===');
await page.goto('http://localhost:5173/?seed=2026&mode=foot&debug');
await page.waitForTimeout(6500);
snap = await worldSnapshot();
assert(snap && snap.mode === 'foot', 'foot mode');
assert(snap && snap.dockedIslet !== null && snap.dockedIslet >= 0, `docked to islet ${snap ? snap.dockedIslet : 'null'}`);
const perfFoot = await readPerf();
console.log(`      perf: ${perfFoot.dc} draw calls, ${perfFoot.tris} tris`);
await page.screenshot({ path: 'tools/lake-foot.png' });
console.log('      wrote tools/lake-foot.png');

// --- tether test fight on a generated islet ----------------------------------
console.log('=== TETHER: T starts a fight on the generated islet ===');
await page.waitForTimeout(1500);
assert(snap && snap.fish === true, 'fish spawned on the docked islet');
await page.keyboard.press('KeyT');
await page.waitForTimeout(600);
snap = await worldSnapshot();
assert(snap && snap.fights === 1, 'T started a tether fight (fights=1)');
assert(snap && snap.water === false, 'fight starts dry (not underwater)');

await browser.close();

if (failures.length > 0) {
  console.error(`LAKE-SHOT FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('LAKE-SHOT OK');
process.exit(0);