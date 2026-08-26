// Drives the QA annotate overlay end-to-end: Q → click → type → Enter,
// then asserts the dev server wrote qa-notes/NNN.md with real context.
import { chromium } from 'playwright';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const TARGET = process.argv[2] ?? 'http://localhost:5175/?seed=1234&debug&qa';
const DIR = new global.URL('../qa-notes/', import.meta.url).pathname;

const before = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.md')) : [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', e => errors.push(String(e)));

await page.goto(TARGET, { waitUntil: 'load' });
await page.waitForTimeout(3500); // let assets load + sim run a while

// enter annotate mode
await page.keyboard.press('KeyQ');
await page.waitForTimeout(120);
const hintVisible = await page.evaluate(() =>
  getComputedStyle(document.getElementById('qa-hint')).display !== 'none');

// sim must be frozen: both samples taken INSIDE the pause window
const pauseStart = await page.evaluate(() => window.__world.time.simSteps);
await page.waitForTimeout(700);
const tickDuringPause = await page.evaluate(() => window.__world.time.simSteps);

// click a spot — mid-lower frame, should hit water or an islet
await page.mouse.click(560, 470);
await page.waitForTimeout(200);
const composerCtx = await page.evaluate(() =>
  document.querySelector('#qa-composer .qa-ctx')?.textContent ?? null);

await page.keyboard.type('water is washing over the islet rim here');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);

const hintAfter = await page.evaluate(() =>
  document.getElementById('qa-hint')?.textContent ?? '');

// leave annotate mode; sim must resume
await page.keyboard.press('KeyQ');
await page.waitForTimeout(600);
const tickAfterResume = await page.evaluate(() => window.__world.time.simSteps);

await browser.close();

const after = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.md')) : [];
const fresh = after.filter(f => !before.includes(f));
const freshMd = fresh.length ? readFileSync(DIR + fresh[0], 'utf8') : '';

const checks = [
  ['no console errors',        errors.length === 0, errors.join(' | ')],
  ['hint bar shown on Q',      hintVisible === true, String(hintVisible)],
  ['sim frozen while annotating', tickDuringPause === pauseStart, `${pauseStart} -> ${tickDuringPause}`],
  ['sim resumes on Q again',   tickAfterResume > tickDuringPause, `${tickDuringPause} -> ${tickAfterResume}`],
  ['composer shows scene ctx', !!composerCtx && /seed \d+ · tick \d+/.test(composerCtx), composerCtx],
  ['note file written',        fresh.length === 1, fresh.join(',')],
  ['hit resolves to a named root', /object      \w+:/.test(freshMd), (freshMd.match(/object.*/)||[''])[0]],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   [${detail}]`}`);
}

if (fresh.length) {
  console.log('\n--- ' + fresh[0] + ' ---\n' + freshMd);
  console.log('png written:', existsSync(DIR + fresh[0].replace('.md', '.png')));
  console.log('composer ctx was:\n' + composerCtx);
}
console.log('\nhint after save:', hintAfter);
process.exit(failed ? 1 : 0);
