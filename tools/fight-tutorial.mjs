// tools/fight-tutorial.mjs — T22 GATE. Drives the real app headless at
// ?debug&seed=7&mode=foot and verifies the FIRST-FIGHT INSTRUCTION CARD
// (src/ui/fightTutorial.ts) end to end:
//   1. T starts a fight → NOTICE 7-T card appears with the full copy.
//   2. Reel ~2s (releasing on tension spikes) → the card dims to 40% opacity.
//   3. Reload → a new fight does NOT re-show it (localStorage seen-flag).
//   4. __resetTutorial() + a fresh fight → it shows again.
// Screenshot: tools/fight-tutorial.png (taken at full opacity in fight 1).
// Usage: node tools/fight-tutorial.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const URL = 'http://localhost:5173/?mode=foot&debug&seed=7';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const log = [];
function line(s) {
  log.push(s);
  console.log(s);
}
const failures = [];
function assert(cond, msg) {
  line(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('pageerror', (e) => line(`[pageerror] ${e.message}`));

async function getWorld() {
  return page.evaluate(() => {
    const w = window.__world;
    if (!w) return null;
    return {
      elapsed: w.time.elapsed,
      fights: w.tether.fights.length,
      fight: w.tether.fights[0]
        ? {
            tension: w.tether.fights[0].tension,
            reelActive: w.tether.fights[0].reel.active,
          }
        : null,
      stamina: w.player.stamina,
      fish: w.fish,
    };
  });
}

async function waitWorld(predicate, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const w = await getWorld();
    if (w && predicate(w)) return w;
    await sleep(20);
  }
  throw new Error(`timeout waiting for: ${what}`);
}

async function card() {
  return page.evaluate(() => {
    const el = document.getElementById('fight-tutorial');
    if (!el) return null;
    return {
      display: el.style.display,
      opacity: el.style.opacity,
      text: (el.textContent ?? '').replace(/\s+/g, ''),
    };
  });
}

async function press(key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}

async function holdRmb() {
  await page.mouse.down({ button: 'right' });
}
async function releaseRmb() {
  await page.mouse.up({ button: 'right' });
}

async function boot() {
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.mouse.move(640, 360);
  await waitWorld((w) => w && w.fights === 0 && w.fish !== null, 10000, 'foot mode + fish spawn');
}

async function startFight() {
  await press('KeyT', 60);
  await waitWorld((w) => w && w.fights === 1, 8000, 'tether fight start');
}

// The headless sim runs slower than wall-clock (swiftshader render is the
// bottleneck), so a fixed-duration key hold does not reliably accumulate the
// 0.5s cut hold in sim time. Hold F and poll for the fight end instead.
async function endFight() {
  await page.keyboard.down('KeyF');
  try {
    await waitWorld((w) => w && w.fights === 0, 20000, 'fight ends (cut)');
  } finally {
    await page.keyboard.up('KeyF');
  }
}

// --- 1. card appears on the first fight, with the copy -----------------------
line(`UNDERTOW T22 GATE — first-fight instruction card`);
line(`url: ${URL}`);
await boot();
await startFight();

const c1 = await card();
assert(c1 !== null && c1.display === 'block', 'card is visible when the first fight starts');
assert(c1 && c1.opacity === '1', `card is full opacity (got ${c1 ? c1.opacity : 'null'})`);
const COPY = 'NOTICE 7-T: PROCEDURE FOR LINE MANAGEMENT 1. HOLD RMB to reel when the line is calm. 2. RELEASE when it lunges — the gauge climbs red, near snap. 3. The catch tires with every lunge. 4. E lands an exhausted catch drawn close. F cuts (forfeits the lure). RETAIN FOR YOUR RECORDS';
assert(c1 !== null && c1.text.includes(COPY.replace(/\s+/g, '')), 'card copy matches (header, 4 lines, stamp)');

await page.screenshot({ path: 'tools/fight-tutorial.png' });
line('screenshot: tools/fight-tutorial.png');

// --- 2. reel 2s (releasing on tension spikes) → dims to 40% ------------------
const t0 = Date.now();
let dimmed = false;
while (Date.now() - t0 < 30000) {
  const w = await getWorld();
  if (!w || !w.fight) break;
  if (w.fight.tension > 70 || w.stamina < 15) await releaseRmb();
  else await holdRmb();
  const c = await card();
  if (c && c.display === 'block' && c.opacity === '0.4') {
    dimmed = true;
    break;
  }
  await sleep(25);
}
assert(dimmed, 'card dims to 40% after reeling ~2s');
await releaseRmb();

// --- 3. reload → a new fight does NOT re-show it -----------------------------
await page.reload();
await page.waitForTimeout(1200);
await page.mouse.move(640, 360);
await waitWorld((w) => w && w.fights === 0 && w.fish !== null, 10000, 'reload: fish spawn');
await startFight();
const c3 = await card();
assert(c3 === null || c3.display !== 'block', 'reload + new fight does not re-show the card');

// --- 4. __resetTutorial() + a fresh fight → shows again ----------------------
await page.evaluate(() => window.__resetTutorial());
await endFight();
await startFight();
const c4 = await card();
assert(c4 !== null && c4.display === 'block', 'after __resetTutorial a fresh fight re-shows the card');
assert(c4 && c4.text.includes('NOTICE7-T'), 're-shown card carries the notice header');

await releaseRmb();

line('');
if (failures.length > 0) {
  line(`RESULT: FAIL (${failures.length})`);
  for (const f of failures) line(`  - ${f}`);
  await browser.close();
  process.exit(1);
}
line('RESULT: PASS');
await browser.close();
process.exit(0);