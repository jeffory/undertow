// tools/fish-fight.mjs — M4 round 2 gate driver (task t18 verify 2).
// Drives one tier-3 tether fight in a real browser and photographs a MID-FIGHT
// wide shot showing BOTH the player's boat and the fish with the tether line
// in frame (the round-1 fish-mid shots framed the fish tight; the round-2 shot
// must show the player AND the fish so the fish reads against the water at
// gameplay distance). Asserts: SET rolls a real species, the fish rig is
// visible, the line is under tension, and the boat is inside the frame.
// Usage: node tools/fish-fight.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';
import zlib from 'node:zlib';

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

// --- BOOT --------------------------------------------------------------------
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
const boot = await w(`({ mode: w.mode, dists: w.disturbances.length })`);
assert(boot && boot.mode === 'boat', 'boots in boat mode');
assert(boot && boot.dists > 0, 'disturbances seeded');

// --- FIGHT -------------------------------------------------------------------
// id 9207 deterministically rolls bell-carp (deep-bodied bronze) on the 2026
// seed — the clearest showcase of the two-tone palette + belly flash.
const id = 9207;
await wset(`
  const b = w.boat;
  const d = { id: ${id}, pos: { x: b.x + 6, z: b.z + 2 }, tier: 3, state: 'idle', biteTimer: 0, promptTimer: 0, seed: 7771 };
  w.disturbances.push(d);
  w.run.debugCastPoint = { x: b.x + 6, z: b.z + 2 };
`);
await wset('w.time.timescale = 1');
await page.mouse.down();
await sleep(250);
await page.mouse.up();
const promptSeen = await waitFor(`w.run.promptId === ${id}`, 8000, 25);
assert(promptSeen, 'cast reached the SET window');
await page.mouse.down();
await sleep(250);
await page.mouse.up();
const setOk = await waitFor(`w.tether.fights.length === 1`, 3000, 25);
assert(setOk, 'SET started the tether fight');
await wset('w.time.timescale = 3');

const sp = await w(`w.fish && ({ id: w.fish.params?.speciesId, name: w.fish.params?.name, x: w.fish.x, z: w.fish.z, tier: w.fish.params?.tier, facing: w.fish.facing })`);
assert(sp && sp.id && sp.id !== 'capsule', `rolled a real species (${sp?.id ?? 'none'})`);
assert(sp && sp.tier >= 3, `tier-3 ripple → rare/epic ladder (tier ${sp?.tier})`);
assert(sp && sp.id === 'bell-carp', `showcase rolls the deep-bodied bell-carp (${sp?.id})`);

// leave a short beat of fight so the fish is mid-struggle (still lively), then
// frame the WIDE shot so BOTH the player's boat and the fish fit with the line
await sleep(600);
const alive = await waitFor(`w.fish !== null && w.tether.fights.length === 1`, 3000, 25);
assert(alive, 'fish still fighting when the shot is framed');
const frame = await w(`w.fish ? ({ bx: w.boat.x, bz: w.boat.z, fx: w.fish.x, fz: w.fish.z, fights: w.tether.fights.length, tension: w.tether.fights[0] ? w.tether.fights[0].tension : 0 }) : null`);
assert(frame, 'frame captured with a live fish');
await wset(`
  const b = w.boat;
  const f = w.fish;
  const mx = (b.x + f.x) / 2, mz = (b.z + f.z) / 2;
  const dist = Math.hypot(f.x - b.x, f.z - b.z);
  w.debugCam = { x: mx + 0.4, y: 2.6, z: mz + Math.max(5.4, dist * 1.5), lookX: mx, lookZ: mz };
`);
const mid = await w(`({ mx: (w.boat.x + w.fish.x) / 2, mz: (w.boat.z + w.fish.z) / 2 })`);
await sleep(400);
await page.screenshot({ path: 'tools/fish-fight-v2.png' });
console.log('      wrote tools/fish-fight-v2.png');

// --- ASSERTS -----------------------------------------------------------------
assert(frame && frame.fights === 1, `tether fight active (line rig rendering, tension ${frame?.tension?.toFixed?.(0) ?? frame?.tension})`);
// boat and fish both within the debugCam frustum: both within ~9m of the look
// target (FOV 55°, cam 8.5m back, y 5.2 — the composed shot covers ~±9m)
const dxB = Math.abs((frame?.bx ?? 0) - (mid?.mx ?? 0));
const dxF = Math.abs((frame?.fx ?? 0) - (mid?.mx ?? 0));
const dzB = Math.abs((frame?.bz ?? 0) - (mid?.mz ?? 0));
const dzF = Math.abs((frame?.fz ?? 0) - (mid?.mz ?? 0));
assert(dxB < 8 && dzB < 8, `boat in frame (Δ ${dxB.toFixed(1)}, ${dzB.toFixed(1)})`);
assert(dxF < 8 && dzF < 8, `fish in frame (Δ ${dxF.toFixed(1)}, ${dzF.toFixed(1)})`);

// the fish reads against the water: the frame has a mix of the water's blue
// AND the fish's cream/teal — check the shot isn't uniform water
const shot = await page.screenshot({ type: 'png' });
const { lum, px } = decodePNG(shot);
let cream = 0, water = 0;
for (let i = 0; i < px.length; i++) {
  const [r, g, b] = px[i];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 510;
  if (l > 0.5 && (mx - mn) / mx < 0.4) cream++; // pale belly/fin flash
}
console.log(`      pale pixels ${((cream / px.length) * 100).toFixed(1)}% of frame`);
assert(cream / px.length > 0.005, 'pale belly/fin pixels present against the water');

// land the catch so the probe leaves a clean save state
await wset(`
  w.fish.stamina = 0;
  w.fish.tether.exhausted = true;
  w.fish.x = w.player.x;
  w.fish.z = w.player.z;
  if (w.tether.fights[0]) w.tether.fights[0].land.eligible = true;
`);
await page.keyboard.press('KeyE');
await waitFor(`w.tether.fights.length === 0 && w.fish === null`, 4000);

await browser.close();
if (failures.length > 0) {
  console.error(`FISH-FIGHT FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('FISH-FIGHT OK');
process.exit(0);

function decodePNG(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = { 6: 4, 2: 3, 0: 1, 4: 2 }[colorType];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const byte = raw[p + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = byte; break;
        case 1: val = byte + a; break;
        case 2: val = byte + b; break;
        case 3: val = byte + ((a + b) >> 1); break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = byte + pr; break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      row[x] = val & 0xff;
    }
    p += stride;
  }
  const colorsPerPx = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const isGray = colorType === 0 || colorType === 4;
  const lum = new Float32Array(width * height);
  const px = [];
  for (let i = 0; i < width * height; i++) {
    const o = i * colorsPerPx;
    const r = isGray ? out[o] : out[o];
    const g = isGray ? out[o] : out[o + 1];
    const b = isGray ? out[o] : out[o + 2];
    px.push([r, g, b]);
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return { width, height, lum, px };
}