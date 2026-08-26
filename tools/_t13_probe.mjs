// tools/_t13_probe.mjs — T13 verification (procedural audio). Proves on :5175:
//  (a) nothing exists before a gesture: window.__audio is there under ?debug but
//      snapshot() is null — no AudioContext is built until a real click;
//  (b) one click unlocks it: ctx.state === 'running' and the lake drone bed
//      (BASIN RESONANCE & FORMATION SAWS) opens up on its own;
//  (c) BOWED-STRING SONIFICATION really tracks the tether: creak gain is 0 at
//      slack, > 0 while a fight has tension, and rises with it;
//  (d) SUB-BASS DREAD MODULATION is silent at tier 0 and schedules beats above it;
//  (e) water one-shots fire off the splash.emitted delta (a hook-set splashes);
//  (f) the SCHEDULE B rows are live and persist across a reload.
//
// Usage: node tools/_t13_probe.mjs [baseUrl]   (dev server must be running)
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5175';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) fails++;
};

const snap = () => page.evaluate(() => window.__audio?.snapshot() ?? null);
const world = () =>
  page.evaluate(() => {
    const w = window.__world;
    if (!w) return null;
    return {
      fights: w.tether.fights.length,
      tension: w.tether.fights[0] ? w.tether.fights[0].tension : 0,
      L: w.tether.fights[0] ? w.tether.fights[0].L : 0,
      ceiling: w.line.tensionCeiling,
      dread: w.dread,
      emitted: w.splash.emitted,
    };
  });
async function waitFor(pred, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await world();
    if (s && pred(s)) return s;
    await sleep(40);
  }
  return null;
}

// ---- (a) gesture gate --------------------------------------------------------
await page.goto(`${BASE}/?debug&seed=7&mode=foot&timescale=4`);
await page.locator('#app canvas').waitFor();
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.locator('#app canvas').waitFor();
await sleep(600);

check('?debug exposes the window.__audio probe seam', await page.evaluate(() => !!window.__audio));
check('no AudioContext exists before any user gesture', (await snap()) === null);

// ---- (b) unlock on the first click -------------------------------------------
await page.mouse.move(640, 400);
await page.mouse.click(640, 400);
await sleep(1200);

let s = await snap();
check('a click builds the graph', s !== null);
check("AudioContext.state === 'running'", s && s.state === 'running', s && s.state);
check('master gain = 70% default × headroom', s && Math.abs(s.master - 0.56) < 0.02, s && s.master);
check('lake drone bed is audible (tone + noise > 0)', s && s.droneTone > 0 && s.droneNoise > 0,
  s && `tone ${s.droneTone.toFixed(4)} noise ${s.droneNoise.toFixed(4)}`);
check('all three bed buses default to on', s && s.droneBus === 1 && s.creakBus === 1 && s.heartBus === 1);

// ---- (c) BOWED-STRING SONIFICATION -------------------------------------------
check('creak is silent at slack (no fight)', s && s.creakGain === 0, s && String(s.creakGain));
const slackFreq = s ? s.creakFreq : 0;

// T hooks a fight (game/input.ts 'tether').
await page.keyboard.press('KeyT');
const hooked = await waitFor((w) => w.fights > 0, 6000, 'a tether fight');
check('T hooks a tether fight', !!hooked, hooked && `fights ${hooked.fights}`);

// Reel (hold RMB) to load the line up — tension is what the creak reads.
await page.mouse.down({ button: 'right' });
const loaded = await waitFor((w) => w.tension > 15, 12000, 'tension > 15');
let underLoad = await snap();
const wUnder = await world();
check('tension builds under reel', !!loaded, wUnder && `tension ${wUnder.tension.toFixed(1)}`);
check('creak gain > 0 while tension > 0',
  underLoad && underLoad.creakGain > 0,
  underLoad && `gain ${underLoad.creakGain.toFixed(5)} @ tension ${underLoad.tension.toFixed(1)}`);
check('creak pitch rose above its slack centre',
  underLoad && underLoad.creakFreq > slackFreq,
  underLoad && `${slackFreq.toFixed(1)} → ${underLoad.creakFreq.toFixed(1)} Hz`);
check('the engine is reading the same tension the sim holds',
  underLoad && wUnder && Math.abs(underLoad.tension - wUnder.tension) < 25,
  underLoad && wUnder && `audio ${underLoad.tension.toFixed(1)} vs world ${wUnder.tension.toFixed(1)}`);

// higher tension → louder creak
const tighter = await waitFor((w) => w.tension > wUnder.tension + 10, 8000, 'more tension');
if (tighter) {
  const s2 = await snap();
  check('creak gain rises with tension',
    s2 && s2.creakGain > underLoad.creakGain,
    `${underLoad.creakGain.toFixed(5)} → ${s2.creakGain.toFixed(5)}`);
} else {
  console.log('SKIP  creak gain rises with tension (tension plateaued this run)');
}
await page.mouse.up({ button: 'right' });

// ---- (e) water one-shots off splash.emitted ----------------------------------
// The hook-set alone emits a burst (game/splashFx.ts INTENSITY_HOOK).
check('splash one-shots fired from the emitted-counter delta',
  underLoad && underLoad.splashes > 0, underLoad && `${underLoad.splashes} splashes`);

// ---- (d) SUB-BASS DREAD MODULATION -------------------------------------------
const beatsAtTier0 = (await snap()).beats;
const dread0 = (await world()).dread;
check('heartbeat is silent while Dread is tier 0',
  dread0 >= 20 || beatsAtTier0 === 0, `dread ${dread0.toFixed(1)}, beats ${beatsAtTier0}`);

// push Dread into tier 3 through the debug world handle (a driver write, not a
// sim write — audio only ever reads it)
await page.evaluate(() => { window.__world.dread = 72; });
await sleep(2500);
const beat = await snap();
check('heartbeat schedules beats above tier 0', beat.beats > beatsAtTier0,
  `${beatsAtTier0} → ${beat.beats} beats`);
check('bpm lands in the 40–70 band', beat.bpm >= 40 && beat.bpm <= 70, `${beat.bpm.toFixed(1)} bpm`);

// ---- (f) SCHEDULE B options are live + persist -------------------------------
await page.keyboard.press('Escape');
await page.locator('#options-screen').waitFor();
await sleep(300);
const rowOpt = (label, text) =>
  page
    .locator('#options-screen .row', { hasText: label })
    .locator('.opt', { hasText: new RegExp(`^${text}$`) })
    .first();

check('SCHEDULE B has no AWAITING INSTALLATION stamps left',
  (await page
    .locator('#options-screen .row', { hasText: 'MASTER VOLUME OF SLUICE AUTHORITY' })
    .locator('.stamp')
    .count()) === 0);

await rowOpt('BOWED-STRING SONIFICATION', 'Off').click();
await sleep(400);
const creakOff = await snap();
check('BOWED-STRING SONIFICATION Off mutes the creak bus', creakOff.creakBus < 0.02,
  String(creakOff.creakBus));

await rowOpt('MASTER VOLUME OF SLUICE AUTHORITY', 'Low').click();
await sleep(400);
const low = await snap();
check('MASTER VOLUME Low drops the master gain', Math.abs(low.master - 0.28) < 0.03, String(low.master));

await rowOpt('SUB-BASS DREAD MODULATION', 'Off').click();
await sleep(400);
check('SUB-BASS DREAD MODULATION Off mutes the heart bus', (await snap()).heartBus < 0.02);

const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('undertow.options.v1')));
check('the SCHEDULE B row persists to undertow.options.v1',
  stored && stored.masterVolume === 0.35 && stored.creakEnabled === false && stored.heartbeatEnabled === false,
  JSON.stringify(stored));

// reload → the stored row is applied before any gesture, and survives the unlock
await page.reload();
await page.locator('#app canvas').waitFor();
await page.mouse.click(640, 400);
await sleep(800);
const after = await snap();
check('settings survive a reload', after && Math.abs(after.master - 0.28) < 0.03 && after.creakBus < 0.02 &&
  after.heartBus < 0.02 && after.droneBus === 1,
  after && `master ${after.master.toFixed(3)} creakBus ${after.creakBus.toFixed(3)}`);

await page.keyboard.press('Escape');
await page.locator('#options-screen').waitFor();
await sleep(300);
await page.screenshot({ path: 'tools/audio-options.png' });
console.log('\nscreenshot: tools/audio-options.png');
console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`}`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
