// tools/m5c-shore-delta.mjs — measure the shore stain (task t21) rather than
// argue about it. Decodes the two m5c-shore-*.png frames (in-page canvas, no
// node deps — same trick as tools/_t14_pixel.mjs) and prints the mean RGB of
// two bands: the near-shore water in the lower frame (where the stain lives)
// and a distant open-water control strip (where it must not reach).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const FRAMES = [
  ['0 restored', 'tools/m5c-shore-0-restored.png'],
  ['8 restored', 'tools/m5c-shore-8-restored.png'],
];
// y ranges in a 1280×720 frame: the near water below the islet, and the far
// open water just under the horizon.
const BANDS = [
  ['near-shore water', 430, 700],
  ['open water (control)', 300, 340],
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const out = {};
for (const [label, path] of FRAMES) {
  const b64 = readFileSync(path).toString('base64');
  out[label] = await page.evaluate(async (arg) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + arg.b64;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const res = {};
    for (const [name, y0, y1] of arg.bands) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < cv.width; x++) {
          const i = (y * cv.width + x) * 4;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
      }
      res[name] = { r: r / n, g: g / n, b: b / n };
    }
    return res;
  }, { b64, bands: BANDS });
}
await browser.close();

for (const [name] of BANDS) {
  const a = out['0 restored'][name];
  const z = out['8 restored'][name];
  const f = (v) => v.toFixed(2);
  console.log(`${name}:`);
  console.log(`   0 restored  R ${f(a.r)}  G ${f(a.g)}  B ${f(a.b)}   R−B ${f(a.r - a.b)}`);
  console.log(`   8 restored  R ${f(z.r)}  G ${f(z.g)}  B ${f(z.b)}   R−B ${f(z.r - z.b)}`);
  console.log(`   delta       R ${f(z.r - a.r)}  G ${f(z.g - a.g)}  B ${f(z.b - a.b)}   ΔR−B ${f((z.r - z.b) - (a.r - a.b))}`);
}
