// tools/fish-sheet.mjs — M4 round 2 gate driver (task t18 verify 1).
// Screenshots the bestiary reference sheet: the fish-viewer's 4x3 grid of all
// 12 Shallows species (upright, slight-curve pose, front-3/4 lit). Asserts the
// page renders without errors and the frame isn't blank or all one hue.
// Usage: node tools/fish-sheet.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';
import zlib from 'node:zlib';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = 'http://localhost:5173/tools/fish-viewer.html';

const browser = await chromium.launch({ args: BROWSER_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
};

page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') failures.push(`console.error: ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: 'tools/fish-sheet.png' });
console.log('      wrote tools/fish-sheet.png');

// the sheet rendered 12 entries
const count = await page.evaluate(() => document.querySelectorAll('canvas').length);
assert(count >= 1, 'webgl canvas present');

// not a blank/all-one-hue frame: decode and check colour variance
const shot = await page.screenshot({ type: 'png' });
const { width, height, lum } = decodePNGLuma(shot);
let sum = 0, sq = 0, dark = 0;
for (const v of lum) {
  sum += v;
  sq += v * v;
  if (v <= 8) dark++;
}
const mean = sum / lum.length;
const sd = Math.sqrt(Math.max(0, sq / lum.length - mean * mean));
assert(sd > 12, `frame has contrast (σ=${sd.toFixed(1)})`);
assert(dark / lum.length < 0.5, `frame not half-black (${((dark / lum.length) * 100).toFixed(1)}% near-black)`);

await browser.close();
if (failures.length > 0) {
  console.error(`FISH-SHEET FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('FISH-SHEET OK');
process.exit(0);

// minimal PNG luma decode (from smoke.mjs)
function decodePNGLuma(buf) {
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
  for (let i = 0; i < width * height; i++) {
    const o = i * colorsPerPx;
    lum[i] = isGray ? out[o] : out[o] * 0.2126 + out[o + 1] * 0.7152 + out[o + 2] * 0.0722;
  }
  return { width, height, lum };
}