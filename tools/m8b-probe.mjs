// tools/m8b-probe.mjs — M8 BOSS gate driver (task t32 verify).
// Drives MAREN'S ECHO — the tonal pivot — through a real browser:
//
//   A. ZONE 1 IS UNTOUCHED — she is idle, costs zero draws, has no marker
//      prompt on screen, and the Choir's motes are undimmed.
//   B. THE MARKER — descend x3 into the Choir, row to the deepest water: the
//      summon docket appears, hold E, and she is there. The fight is ONE
//      ordinary tether fight whose only unusual field is tensionSource.
//      Screenshot: her sway at max line in the void.
//   C. THE HOLD — left alone she does nothing at all: the distance never
//      changes, tension stays at zero, stamina stays full, no hp moves, and
//      every few seconds she says one of choir.md's four sway lines.
//   D. THE REEL — RMB shortens the line; tension rises WITH PROXIMITY and
//      matches the curve; stamina drains faster than an ordinary reel.
//   E. THE DECISION — inside the window the LAND prompt arms, and tension is
//      high but short of the ceiling.
//   F. THE TRUTH — tap E: a clean catch on the receipt, the truth scene's three
//      beats in the DOM with choir.md's text, the Echo's Scale in the
//      inventory, and truthSeen in the save across a full page reload.
//      Screenshot: the truth scene, beat 1.
//   G. THE OTHER ENDING (fresh run) — reel PAST the window: tension reaches 100,
//      the line parts, the snap line is shown, and the run continues.
//
// Screenshots: tools/m8b-sway.png, tools/m8b-truth.png
// Usage: node tools/m8b-probe.mjs   (dev server on :5177, or set M8B_PROBE_URL)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.M8B_PROBE_URL ?? 'http://localhost:5177';
const SEED = 4104;
const URL = `${BASE}/?seed=${SEED}&debug&timescale=6`;

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
const echo = () => page.evaluate(() => window.__echo());
const choir = () => page.evaluate(() => window.__choir());
const hideChrome = () =>
  page.addStyleTag({
    content:
      '#debug-panel,#debug,#save-panel,#fight-tutorial,#verb-hint,#cast-prompt,#buildinfo,#hud,#echo-prompt,#bark-toast{display:none !important}',
  });
async function waitFor(fn, timeoutMs, everyMs = 40) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

/** Descend to the Choir and park the hull on her marker. */
async function toTheMarker() {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__descend());
    await sleep(700);
  }
  await sleep(1500);
  return page.evaluate(() => window.__toEchoMarker());
}

/** Hold E for the full summon hold. */
async function holdE(ms) {
  await page.keyboard.down('KeyE');
  await sleep(ms);
  await page.keyboard.up('KeyE');
}

// --- A. ZONE 1 IS UNTOUCHED --------------------------------------------------------------
console.log('=== A. the Shallows has never heard of her ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const a = await echo();
assert(a && a.zone === 1, `the run opens in zone 1 (${a?.zone})`);
assert(a && a.phase === 'idle', `she is idle (${a?.phase})`);
assert(a && a.summoned === false, 'and has never been in the water');
assert(a && a.render.draws === 0, `she costs ZERO draws (${a?.render?.draws})`);
assert(a && a.fights === 0, 'no tether fights');
assert(a && a.prompt.visible === false, 'no marker prompt anywhere in the Shallows');
assert(a && a.truth.active === false && a.truthSeen === false, 'and nothing has been told');
assert(a && a.choirDim === 1, `the choir is undimmed (×${a?.choirDim})`);
assert(a && a.hp === 100, `she has an hp field, at ${a?.hp} — the no-combat witness`);

// --- B. THE MARKER ------------------------------------------------------------------------
console.log('=== B. the deepest water in the Choir ===');
const marker = await toTheMarker();
await sleep(700); // let the ui frame catch up with the hull's new position
assert((await w('w.run.zone')) === 4, 'the boat is in the Choir');
assert(marker && Number.isFinite(marker.x), `the marker is at ${marker?.x}, ${marker?.z}`);

const b0 = await echo();
assert(b0 && b0.atMarker === true, `the hull is on it (${b0?.distToMarker?.toFixed(2)} m)`);
assert(
  b0 && b0.prompt.visible === true && b0.prompt.title.includes('00-ECHO'),
  `the summon docket is up: "${b0?.prompt?.title}"`,
);

await holdE(2200);
const b = await waitFor(async () => {
  const e = await echo();
  return e && e.phase !== 'idle' ? e : null;
}, 6000);
assert(b, 'the hold summoned her');
assert(b && b.summoned === true, 'one Echo per run — the latch is set');
assert(b && b.fights === 1, `exactly ONE fight (${b?.fights})`);
assert(b && b.fish === null, 'and she is NOT the catch slot — there is no hp to reach zero');
assert(
  b && Math.abs(b.distance - b.holdLength) < 0.5,
  `she holds at max line length (${b?.distance?.toFixed(2)} m of ${b?.holdLength})`,
);

const cfg = b?.config;
assert(cfg && cfg.a === 'player', `endpoint a is the KEEPER (owner ${cfg?.a})`);
assert(cfg && cfg.b === 'enemy', `endpoint b is HER (owner ${cfg?.b})`);
assert(cfg && cfg.aReel === 'player-stance', `YOU reel (a.reel = ${cfg?.aReel})`);
assert(cfg && cfg.bReel === 'none', `she never takes line (b.reel = ${cfg?.bReel})`);
assert(cfg && cfg.bCut === 'none', `and never lets go (b.cut = ${cfg?.bCut})`);
assert(cfg && cfg.tensionSource === 'proximity', `tension is PROXIMITY (${cfg?.tensionSource})`);
assert(cfg && cfg.snapBehavior === 'free', `her line parts the plain way (${cfg?.snapBehavior})`);
assert((await w('w.tether.fights[0].aiReel ?? false')) === false, 'nothing on her side ever reels');
assert(b && b.render.draws > 0, `she is drawn: ${b?.render?.draws} draw(s), one body`);

const bc = await choir();
assert(bc && bc.render.dim < 1, `the choir dims while she holds (×${bc?.render?.dim})`);

console.log('=== HER SWAY AT MAX LINE: screenshot ===');
await hideChrome();
await sleep(2500); // let the sway carry her off the bearing she arrived on
await wset('w.time.timescale = 0');
// Down the line at her, from a little short of halfway and a little to the
// side: at eighteen metres in near-total fog a shot from the gunwale is a shot
// of the fog, so the frame is taken from where the line is going.
await wset(`
  const s = w.marensEcho, bt = w.boat;
  const dx = s.x - bt.x, dz = s.z - bt.z, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const px = -uz, pz = ux;
  w.debugCam = {
    x: bt.x + ux * len * 0.42 + px * 2.8,
    y: 2.6,
    z: bt.z + uz * len * 0.42 + pz * 2.8,
    lookX: s.x,
    lookZ: s.z,
  };
`);
await sleep(800);
await page.screenshot({ path: 'tools/m8b-sway.png' });
console.log('      wrote tools/m8b-sway.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 6');

// --- C. THE HOLD --------------------------------------------------------------------------
console.log('=== C. left alone, she does nothing at all ===');
const c0 = await echo();
await sleep(4000);
const c1 = await echo();
assert(
  Math.abs(c1.distance - c0.distance) < 1e-6,
  `the distance NEVER changes on its own (${c0.distance.toFixed(4)} → ${c1.distance.toFixed(4)})`,
);
assert(c1.fight.tension < 1e-6, `tension stays at zero (${c1.fight.tension.toExponential(1)})`);
assert(c1.player.stamina === 100, `holding costs nothing (stamina ${c1.player.stamina})`);
assert(c1.player.hp === 100 && c1.hp === 100, 'and no hp has moved on either side');
assert(c1.swayPhase > c0.swayPhase, 'but the sway phase is running — she is swaying');
assert(c1.runEnded === false, 'the run is fine');

const SWAY = [
  'It sways with the slow pulse of the basin, mirroring the rise and fall of your shoulders.',
  'The line hangs loose between you. It does not pull; it waits for your hands to tire.',
  'Water drifts through her white linen. She has thirty years of patience, and nowhere else to be.',
  'No struggle on the cord. If you do not reel, both of you will stand here until the oil burns dry.',
];
const swayShown = await waitFor(async () => {
  const e = await echo();
  return e.toast && e.toast.visible && e.toast.trigger === 'echoSway' ? e : null;
}, 25000);
assert(swayShown, 'she says something, unprompted, while you stand there');
assert(
  swayShown && SWAY.includes(swayShown.toast.text),
  `and it is choir.md VERBATIM: "${swayShown?.toast?.text}"`,
);
assert(swayShown && swayShown.toast.faint === true, 'as a FAINT note — the void stays black');
assert(
  swayShown && swayShown.events.some((e) => e.type === 'echo.sway'),
  'and the town-event queue carries echo.sway for the audio worker',
);

// --- D. THE REEL --------------------------------------------------------------------------
console.log('=== D. reeling is the only verb, and it costs ===');
const d0 = await echo();
await page.mouse.down({ button: 'right' });
await sleep(350);
const dMid = await echo(); // sampled while the pool still has something in it
await sleep(1150);
const d1 = await echo();
await page.mouse.up({ button: 'right' });

assert(dMid.fight.reelActive === true, 'RMB engaged the reel');
assert(d1.distance < d0.distance, `the line came in (${d0.distance.toFixed(2)} → ${d1.distance.toFixed(2)} m)`);
assert(
  d1.tensionFraction > d0.tensionFraction,
  `tension rose WITH PROXIMITY (${(d0.tensionFraction * 100).toFixed(1)} → ${(d1.tensionFraction * 100).toFixed(1)})`,
);
const expected = (18 - d1.distance) / (18 - d1.floor);
assert(
  Math.abs(d1.tensionFraction - expected) < 0.02,
  `and it is exactly the curve (${d1.tensionFraction.toFixed(3)} vs ${expected.toFixed(3)})`,
);
assert(
  d1.player.stamina < d0.player.stamina,
  `it drained the pool (${d0.player.stamina.toFixed(1)} → ${d1.player.stamina.toFixed(1)})`,
);
assert(d1.player.hp === 100 && d1.hp === 100, 'and no hp moved while she was hauled');

// --- E. THE DECISION ----------------------------------------------------------------------
console.log('=== E. the window opens before the line does ===');
await page.evaluate(() => window.__echoReelTo(window.__echo().floor + 2.4));
await sleep(600);
const e = await echo();
assert(e.landEligible === true, 'the LAND window is armed');
assert(
  e.tensionFraction > 0.75 && e.tensionFraction < 1,
  `with tension high but SHORT of the ceiling (${(e.tensionFraction * 100).toFixed(1)})`,
);
assert(
  e.prompt.visible === true && e.prompt.title.includes('WITHIN REACH'),
  `and the prompt is a choice, not an order: "${e.prompt.title}" / "${e.prompt.hint}"`,
);

// --- F. THE TRUTH -------------------------------------------------------------------------
console.log('=== F. take her: the clean catch, the three beats, the Scale ===');
await page.keyboard.press('KeyE');
const landed = await waitFor(async () => {
  const x = await echo();
  return x.landed ? x : null;
}, 8000);
assert(landed, 'she came aboard');
assert(landed && landed.fights === 0, 'the line is off');
assert(
  landed && landed.haul.length === 1 && landed.haul[0].clean === true,
  `a CLEAN catch on the receipt (${landed?.haul?.[0]?.species}, tier ${landed?.haul?.[0]?.tier})`,
);
assert(
  landed && landed.inventory.some((i) => i.id === 'echos-scale' && i.rarity === 'Drowned'),
  "THE ECHO'S SCALE is in the inventory, Drowned-tier",
);
assert(
  landed && landed.inventory.length === 1,
  `and it is the ONLY thing she dropped (${landed?.inventory?.length})`,
);
assert(landed && landed.truthSeen === true, 'the truth is latched on the run');
assert(landed && landed.player.hp === 100 && landed.hp === 100, 'no hp moved, all the way through');

const BEATS = [
  'The Mouth is no devourer. It is a warden, appointed to keep the drowned valley in quiet, unbroken custody. Its cold ledgers do not punish; they protect the silence of four hundred souls resting beneath forty fathoms. It only demands tribute because you refuse to leave the gate.',
  'Your iron hook brings no salvation. Hauling a soul to the dry strand only tears them from peace, shocking them back into shivering, waterlogged flesh to inhabit damp shops and placate your thirty-year penance. They smile on the cobbles because they pity the man who cannot stop pulling.',
  'The ones who vanish at night are not lost; they go home willingly. They walk down the jetty back into the dark water, returning to the Choir where the silence is deep and whole. Maren told you thirty years ago: they are not waiting to be retrieved.',
];

const dom = () =>
  page.evaluate(() => {
    const el = document.querySelector('#truth-scene');
    if (!el) return null;
    return {
      up: true,
      title: el.querySelector('.hdr')?.textContent ?? '',
      text: el.querySelector('.body')?.textContent ?? '',
      dots: el.querySelector('.dots')?.textContent ?? '',
      foot: el.querySelector('.foot')?.textContent ?? '',
    };
  });

const beat1 = await waitFor(dom, 6000);
assert(beat1 && beat1.up, 'THE TRUTH SCENE is on screen');
assert(beat1 && beat1.title === 'Beat 1: The Warden', `beat 1: "${beat1?.title}"`);
assert(beat1 && beat1.text === BEATS[0], 'with choir.md\'s text, VERBATIM');
assert(beat1 && beat1.foot.includes('CONTINUE'), 'and it waits for the player');

console.log('=== THE TRUTH SCENE, BEAT 1: screenshot ===');
await sleep(1400); // the card fades IN over 900 ms — shoot it landed, not arriving
await page.screenshot({ path: 'tools/m8b-truth.png' });
console.log('      wrote tools/m8b-truth.png');

await page.keyboard.press('KeyE');
await sleep(1200);
const beat2 = await dom();
assert(beat2 && beat2.title === 'Beat 2: The Shocked', `beat 2: "${beat2?.title}"`);
assert(beat2 && beat2.text === BEATS[1], 'verbatim');

await page.keyboard.press('KeyE');
await sleep(1200);
const beat3 = await dom();
assert(beat3 && beat3.title === 'Beat 3: The Willing', `beat 3: "${beat3?.title}"`);
assert(beat3 && beat3.text === BEATS[2], 'verbatim');

await page.keyboard.press('KeyE');
await sleep(1200);
assert((await dom()) === null, 'the third press closes the scene');
const after = await echo();
assert(after.truth.done === true, 'the sim agrees it is told');
const scaleNote = await waitFor(async () => {
  const x = await echo();
  return x.toast && x.toast.visible && x.toast.trigger === 'echosScale' ? x : null;
}, 6000);
assert(
  scaleNote && scaleNote.toast.text.includes('14 Willow Street'),
  "and the Scale's own note lands as the scene clears",
);
assert(after.runEnded === false, 'the run CONTINUES — it credits into the dark, not out of it');
assert(
  after.bestiary.map((e) => e.event).join(',') === 'hooked,clean',
  `the bestiary met her and landed her cleanly (${after.bestiary.map((e) => e.event).join(',')})`,
);

console.log('=== F2. truthSeen survives a reload ===');
await wset('w.player.hp = 0'); // end the run the way the run terminal does
const ended = await waitFor(async () => (await w('w.run.ended')) === true, 10000);
assert(ended, 'the run ended');
await sleep(1800); // the save write is async
const meta = await page.evaluate(() => window.__meta());
assert(
  meta && meta.metaState && meta.metaState.truthSeen === true,
  'metaState.truthSeen is TRUE in the save',
);

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
const reloaded = await echo();
assert(reloaded && reloaded.savedTruth === true, 'and STILL true after a full page reload');
assert(reloaded && reloaded.truthSeen === false, 'while the fresh run has not been told yet');
assert(reloaded && reloaded.phase === 'idle', 'and the new run has no Echo in the water');

// --- G. THE OTHER ENDING ------------------------------------------------------------------
console.log('=== G. reel PAST her and she goes home ===');
await toTheMarker();
await page.evaluate(() => window.__toEchoMarker());
await sleep(400);
await holdE(2200);
const g0 = await waitFor(async () => {
  const x = await echo();
  return x.phase !== 'idle' ? x : null;
}, 6000);
assert(g0, 'she is on the line again in a fresh run');
const lure0 = await w('w.lure.count');

// Reel her all the way to the floor — past the window, past the decision.
await page.evaluate(() => window.__echoReelTo(window.__echo().floor + 0.6));
await sleep(300);
await page.mouse.down({ button: 'right' });
const snapped = await waitFor(async () => {
  const x = await echo();
  return x.goneHome ? x : null;
}, 15000);
await page.mouse.up({ button: 'right' });

assert(snapped, 'the line reached the ceiling and parted');
assert(snapped && snapped.landed === false, 'she was not landed');
assert(snapped && snapped.fights === 0, 'the fight is over');
const snapNote = await waitFor(async () => {
  const x = await echo();
  return x.toast && x.toast.visible && x.toast.trigger === 'echoSnap' ? x : null;
}, 6000);
assert(
  snapNote && snapNote.toast.text.includes('Gone home.'),
  `the snap line, verbatim: "${snapNote?.toast?.text}"`,
);
assert(snapped && snapped.runEnded === false, 'and the RUN CONTINUES — this is not a failure screen');
assert(snapped && snapped.player.hp === 100 && snapped.hp === 100, 'no hp moved on the way out either');
assert(snapped && snapped.truthSeen === false, 'and a snapped line tells you nothing');
assert(
  (await w('w.lure.count')) === Math.max(0, lure0 - 1),
  'a parted line costs the lure a parted line always costs',
);
const gc = await choir();
assert(gc && gc.render.dim === 1, 'the choir comes back up once she is gone');

// --- result -------------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log('ALL PASS — m8b (Maren\'s Echo)');
} else {
  console.log(`${failures.length} FAILURE(S):`);
  for (const f of failures) console.log(`  - ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
