// SMOKE — launch the app headless and fail loudly if it's broken.
// Usage: node tools/smoke.mjs [url]   (default http://localhost:5173)
// Gates (exit 1 on any failure):
//   1. page loads
//   2. no console errors and no page errors
//   3. the rendered frame is not >95% near-black (catches "everything died" regressions)
// Uses the playwright install already available to tools/ (see tools/node_modules
// symlink). Decodes the screenshot PNG with node's built-in zlib — no new deps.

import { chromium } from 'playwright';
import zlib from 'node:zlib';

const url = process.argv[2] ?? 'http://localhost:5173';
const WAIT_MS = 5000;
const BLACK_RATIO = 0.95; // fail if more than this fraction of pixels is near-black
const LUM_THRESHOLD = 8; // pixel luminance at or below this counts as black

// --- minimal PNG decode (8-bit, color types 0/2/4/6) -------------------------
// Returns { width, height, luminance: Float32Array }. Enough to measure how
// dark a frame is — no image lib required.
function decodePNGLuma(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (!width || !height) throw new Error('missing IHDR');
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const bpp = { 6: 4, 2: 3, 0: 1, 4: 2 }[colorType];
  if (!bpp) throw new Error(`unsupported color type ${colorType}`);
  if (interlace !== 0) throw new Error('unsupported interlace');

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
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = byte + pr;
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      row[x] = val & 0xff;
    }
    p += stride;
  }

  // luminance per pixel (RGBA / RGB / gray / gray+alpha)
  const lum = new Float32Array(width * height);
  const colorsPerPx = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const isGray = colorType === 0 || colorType === 4;
  for (let i = 0; i < width * height; i++) {
    const o = i * colorsPerPx;
    if (isGray) {
      lum[i] = out[o];
    } else {
      lum[i] = out[o] * 0.2126 + out[o + 1] * 0.7152 + out[o + 2] * 0.0722;
    }
  }
  return { width, height, lum };
}

const failures = [];
const log = (...args) => console.log(...args);

try {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('console', (m) => {
    if (m.type() === 'error') failures.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));

  log(`smoke: loading ${url} …`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(WAIT_MS);

  // --- frame darkness check ------------------------------------------------
  const shot = await page.screenshot({ type: 'png' });
  const { width, height, lum } = decodePNGLuma(shot);
  let dark = 0;
  for (let i = 0; i < lum.length; i++) if (lum[i] <= LUM_THRESHOLD) dark++;
  const ratio = dark / lum.length;
  log(`smoke: frame ${width}x${height}, ${(ratio * 100).toFixed(1)}% near-black`);
  if (ratio > BLACK_RATIO) {
    failures.push(`frame is ${(ratio * 100).toFixed(1)}% near-black (>${BLACK_RATIO * 100}%)`);
  }

  const ok = (await page.evaluate(() => document.title)) || '(no title)';
  log(`smoke: page title: ${ok}`);
  await browser.close();
} catch (err) {
  failures.push(`launch/load failure: ${err.message}`);
}

if (failures.length > 0) {
  console.error('SMOKE FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('SMOKE OK');