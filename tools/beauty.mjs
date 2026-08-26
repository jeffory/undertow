// BEAUTY GATE (qa-issues.md T5) — the composed-frame check the component
// harness never had. Poses the debug camera to match the concept frame
// (docs/concepts/images/night_boat_combat_1787661324075.jpg): low, near wave
// height, behind and slightly above the boat. Emits:
//   tools/beauty-frame.png       — the posed frame
//   tools/beauty-vs-concept.png  — frame beside the concept, for art review
// and prints a luma histogram REPORT (deliberately not a hard assert — the
// concept is a mood target, not ground truth; the art director judges).
// Reference numbers from the concept: ~60% of pixels below 0.15 luma, ~2%
// above 0.85 (water darkest, foam brightest, sparse highlights).
//
// Usage: node tools/beauty.mjs [url]   (default http://localhost:5173)

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const CONCEPT = 'docs/concepts/images/night_boat_combat_1787661324075.jpg';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/?debug&seed=7`);
await page.waitForTimeout(6000);

// sail forward briefly so the wake/heading read as "underway", like the concept
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.up('w');

// pose: low chase, near wave height, behind-left of the boat, aimed past the
// bow — the concept's framing (boat lower third, horizon high in frame)
await page.evaluate(() => {
  const w = window.__world;
  const b = w.boat;
  w.debugCam = { x: b.x + 1.6, y: 1.9, z: b.z + 6.2, lookX: b.x - 1.2, lookZ: b.z - 5 };
  // hide the debug DOM — the beauty frame reviews the scene, not the harness
  for (const el of document.body.children) {
    if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'tools/beauty-frame.png' });

// luma histogram of the captured frame (computed in-page from the PNG bytes —
// no node image dependencies)
const frameB64 = readFileSync('tools/beauty-frame.png').toString('base64');
const stats = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let dark = 0;
  let bright = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const luma = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (luma < 0.15) dark++;
    else if (luma > 0.85) bright++;
  }
  return { dark: dark / n, bright: bright / n };
}, frameB64);

// side-by-side with the concept for the art-director pass
const conceptB64 = readFileSync(CONCEPT).toString('base64');
await page.setContent(`
  <body style="margin:0;background:#000;display:flex">
    <img style="width:50%;object-fit:contain" src="data:image/png;base64,${frameB64}">
    <img style="width:50%;object-fit:contain" src="data:image/jpeg;base64,${conceptB64}">
  </body>`);
await page.waitForTimeout(300);
await page.setViewportSize({ width: 2560, height: 720 });
await page.waitForTimeout(200);
await page.screenshot({ path: 'tools/beauty-vs-concept.png', fullPage: false });

console.log('beauty gate — luma report (art-director judged, not asserted):');
console.log(`  below 0.15 luma: ${(stats.dark * 100).toFixed(1)}%   (concept ref ~60%)`);
console.log(`  above 0.85 luma: ${(stats.bright * 100).toFixed(1)}%  (concept ref ~2%)`);
console.log('  frame: tools/beauty-frame.png');
console.log('  side-by-side: tools/beauty-vs-concept.png');
await browser.close();
