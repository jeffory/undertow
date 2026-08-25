// line-shot.mjs — T16 line-render + debug-panel visual check.
// Loads foot+debug, starts a tether fight (T), measures the draw-call delta the
// line adds (should be 2 per fight), moves the player for a nicer catenary, and
// screenshots the fight with the line + the ?debug panel visible.

import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173/?mode=foot&debug';
const OUT = process.argv[3] ?? '/tmp/opencode/line-check.png';
const WAIT = Number(process.argv[4] ?? 2500);

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(URL);
await page.waitForTimeout(WAIT);

const readDc = () =>
  page.evaluate(() => {
    const t = document.getElementById('debug')?.textContent ?? '';
    const dc = Number(/draw calls (\d+)/.exec(t)?.[1] ?? -1);
    return dc;
  });

const readFight = () =>
  page.evaluate(() => {
    const w = window.__world;
    const f = w?.tether?.fights?.[0];
    return f
      ? { active: true, tension: f.tension, L: f.L, species: f.species }
      : { active: false };
  });

const dc0 = await readDc();
console.log('draw calls before fight:', dc0);

// start the fight (T tap, foot mode, fish present); measure the line's own
// draw-call cost with no movement so nothing else changes the count
await page.keyboard.down('KeyT');
await page.waitForTimeout(80);
await page.keyboard.up('KeyT');
await page.waitForTimeout(600);
const dcFight = await readDc();
console.log('draw calls during fight (no move):', dcFight, 'line delta:', dcFight - dc0);
await page.waitForTimeout(1000);

const fight = await readFight();
console.log('fight:', JSON.stringify(fight));

// walk the player to shear the line geometry so the catenary sag reads
await page.keyboard.down('KeyS');
await page.waitForTimeout(700);
await page.keyboard.up('KeyS');
await page.waitForTimeout(300);

const dc1 = await readDc();
console.log('draw calls during fight (after move):', dc1, 'delta:', dc1 - dc0);

await page.screenshot({ path: OUT });
console.log('screenshot:', OUT);

const panel = await page.evaluate(() => {
  const el = document.getElementById('debug-panel');
  return el ? el.textContent.slice(0, 400) : null;
});
console.log('--- debug panel ---');
console.log(panel ?? '(no debug panel)');

const gl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  return !!(c.getContext('webgl2') || c.getContext('webgl'));
});
console.log('WebGL available:', gl);
const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
console.log('errors:', errs.length ? errs.join('\n') : '(none)');
await browser.close();