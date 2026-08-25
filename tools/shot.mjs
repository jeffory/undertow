import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/?debug';
const out = process.argv[3] ?? 'shot.png';
const waitMs = Number(process.argv[4] ?? 6000);
const keys = process.argv[5] ?? ''; // e.g. "w:3000" hold w for 3s before shot

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(waitMs);
if (keys) {
  const [key, holdMs] = keys.split(':');
  await page.keyboard.down(key);
  await page.waitForTimeout(Number(holdMs ?? 2000));
  await page.screenshot({ path: out.replace('.png', '-moving.png') });
  await page.keyboard.up(key);
}
await page.screenshot({ path: out });
const gl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  return !!(c.getContext('webgl2') || c.getContext('webgl'));
});
console.log('WebGL available:', gl);
console.log('--- console ---');
console.log(logs.slice(0, 60).join('\n') || '(no console output)');
await browser.close();
