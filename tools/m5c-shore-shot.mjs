// tools/m5c-shore-shot.mjs — the shore-reddening before/after pair (task t21).
//
// A dedicated shot driver, separate from the gate (tools/m5c-probe.mjs),
// because this pair is judged BY EYE and has to be a controlled A/B: both
// frames come from the same session, the same camera, the same settled sky,
// seconds apart, with the ONLY difference being the restored count the water
// shader is reading (`__setShoreWarm`, which pokes render/water.ts's seam
// without touching the save — so no buildings appear between the two frames to
// change the scene). The wiring from a REAL restoration to that same seam is
// what tools/m5c-probe.mjs asserts.
//
// Usage: node tools/m5c-shore-shot.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BASE = process.env.M5C_PROBE_URL ?? 'http://localhost:5173';
const URL = `${BASE}/?seed=2026&debug&mode=foot`;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
// long settle: the sky/fog palette lerps toward the phase endpoint, and an
// early frame is darker than a settled one — that drift would swamp the stain.
await page.waitForTimeout(9000);

async function clean() {
  await page.evaluate(() => {
    for (const sel of ['#debug', '#debug-panel', '#save-panel', '#buildinfo', '#hud', '#hud-gauge', '#bark-toast', '#town-door', '#restoration']) {
      document.querySelector(sel)?.remove();
    }
  });
}

await clean();
await page.evaluate(() => {
  const w = window.__world;
  const lake = w.lake;
  const iso = lake.islets[lake.startIslet];
  let far = iso.poly[0];
  for (const v of iso.poly) if (v.x < far.x) far = v;
  const dx = far.x - iso.center.x;
  const dz = far.z - iso.center.z;
  const len = Math.hypot(dx, dz) || 1;
  let r = 0;
  for (const v of iso.poly) r = Math.max(r, Math.hypot(v.x - iso.center.x, v.z - iso.center.z));
  // the rim on the far side from the lighthouse; stand off it and look back
  // down at the waterline so the near-shore band fills most of the frame.
  const rim = { x: iso.center.x - (dx / len) * r, z: iso.center.z - (dz / len) * r };
  const ox = -dx / len;
  const oz = -dz / len;
  w.debugCam = {
    x: rim.x + ox * 13,
    y: 6.5,
    z: rim.z + oz * 13,
    lookX: rim.x - ox * 2,
    lookZ: rim.z - oz * 2,
  };
  window.__beamAngle(Math.PI * 0.5); // park the sweep behind the camera
  window.__setShoreWarm(0);
  // freeze the sim (timescale 0 → no fixed steps → world.time.elapsed parked):
  // the Gerstner surface and its foam stop moving, so the two frames differ by
  // the stain and nothing else. core/time.ts frameSimSteps does the parking.
  w.time.timescale = 0;
});
await sleep(1400);
await clean();
console.log(`shoreWarm ${await page.evaluate(() => window.__hubLight().shoreWarm)}`);
await page.screenshot({ path: 'tools/m5c-shore-0-restored.png' });
console.log('wrote tools/m5c-shore-0-restored.png');

await page.evaluate(() => {
  window.__setShoreWarm(8);
  window.__beamAngle(Math.PI * 0.5);
});
await sleep(400);
await clean();
console.log(`shoreWarm ${await page.evaluate(() => window.__hubLight().shoreWarm)}`);
await page.screenshot({ path: 'tools/m5c-shore-8-restored.png' });
console.log('wrote tools/m5c-shore-8-restored.png');

await browser.close();
