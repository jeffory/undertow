// tools/m8-probe.mjs — M8 round-1 gate driver (task t31 verify).
// Drives THE CHOIR — darkness fog-of-war + the Whistler — through a real browser:
//
//   A. ZONE 1 IS UNTOUCHED — the Shallows boots with the darkness off, the choir
//      at zero draws, the Whistler idle at zero draws, and the fog exactly ×1.
//   B. THE VOID — descend x3 into the Choir: the fog multiplier cranks, the sky
//      darkens to near-black, the measured FogExp2 density saturates inside the
//      lantern's own radius, and forty emissive motes light in two draw calls.
//      Screenshot: the lantern disc as the only world, motes beyond it.
//   C. THE CUE GATE — ripples and buoy lanterns beyond the disc are NOT drawn,
//      while the sim still holds every one of them.
//   D. THE RADIUS IS ONE FUNCTION — the Chandlery bow lantern widens the light,
//      the cue horizon and the Whistler's exclusion ring in a single write.
//   E. THE ROAM — force the spawn through the real gate; it is held outside the
//      disc every tick and costs ZERO draws while it roams.
//   F. THE BANDS — the three proximity events fire IN ORDER, once each, with a
//      faint dread toast on each edge. Nothing is drawn.
//   G. THE STRIKE — it closes and hooks YOU: the Postmaster's reverse config,
//      re-used unchanged, on the hull. RMB is inert; F costs no lure.
//      Screenshot: the strike moment.
//   H. THE ESCAPE — two REAL gaff swings stagger it; hold E in reach cuts its
//      line, costs nothing, and leaves the keeper dry.
//
// Screenshots: tools/m8-void.png, tools/m8-strike.png
// Usage: node tools/m8-probe.mjs   (dev server on :5175, or set M8_PROBE_URL)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.M8_PROBE_URL ?? 'http://localhost:5175';
const SEED = 4104;
const URL = `${BASE}/?seed=${SEED}&debug&timescale=10`;

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
const dark = () => page.evaluate(() => window.__darkness());
const choir = () => page.evaluate(() => window.__choir());
const wh = () => page.evaluate(() => window.__whistler());
const hideChrome = () =>
  page.addStyleTag({
    content:
      '#debug-panel,#debug,#save-panel,#fight-tutorial,#verb-hint,#cast-prompt,#buildinfo,#hud{display:none !important}',
  });
async function waitFor(code, timeoutMs, everyMs = 20) {
  const t0 = Date.now();
  for (;;) {
    const v = await w(code);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

// --- A. BOOT / ZONE 1 IS UNTOUCHED -----------------------------------------------------
console.log('=== A. the Shallows is not dark ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const a = await dark();
assert(a && a.zone === 1, `run opens in zone 1 (${a?.zone})`);
assert(a && a.active === false, 'the darkness render mode is OFF');
assert(a && a.fogZoneMult === 1, `the Shallows fog is exactly ×1 (${a?.fogZoneMult})`);
assert(a && a.skyDarken === 0, `and the sky is not darkened at all (${a?.skyDarken})`);
assert(
  a && a.hiddenDisturbances === 0,
  `nothing is withheld — every ripple is drawn (${a?.hiddenDisturbances} hidden)`,
);
assert(
  a && a.lantern.radius === 16,
  `the stock lantern reaches 16 m (${a?.lantern?.radius})`,
);

const ac = await choir();
assert(ac && ac.render.draws === 0, `the Choir costs ZERO draws at zone 1 (${ac?.render?.draws})`);
assert(ac && ac.render.visible === false, 'and is not in the scene');
assert(ac && ac.cursor.armed === false, 'the hymn is not running');
assert(ac && ac.events.length === 0, 'and nothing has sung');
assert(ac && ac.moteCount === 40, `the field is 40 motes (${ac?.moteCount})`);
assert(ac && ac.lines.length === 6, `6 Choir lines loaded (${ac?.lines.length})`);
const VERBATIM = {
  band1: 'A clean two-note whistle drifts in from the black, perfectly on pitch.',
  band2: 'The whistling stopped. Something is standing just beyond the tallow glow.',
  band3: 'A tune you used to know, whistled through teeth that never breathe.',
  hooked: 'A barb bites your coat. Something in the darkness begins to reel.',
};
for (const [moment, text] of Object.entries(VERBATIM)) {
  assert(
    ac && ac.lines.some((l) => l.moment === moment && l.text === text && l.placeholder === false),
    `choir.md verbatim (${moment}): "${text}"`,
  );
}
assert(
  ac && ac.placeholders === 2,
  `only the two moments the bible does not write are placeholders (${ac?.placeholders})`,
);
assert(
  ac && ac.ambient && ac.ambient.length === 6,
  `and its six zone-ambient lines are staged for the ticker round (${ac?.ambient?.length})`,
);

const aw = await wh();
assert(aw && aw.phase === 'idle', `the Whistler is idle (${aw?.phase})`);
assert(aw && aw.spawned === false, 'and has never been in the water');
assert(aw && aw.render.draws === 0, `it costs ZERO draws (${aw?.render?.draws})`);
assert(aw && aw.fights === 0, 'no tether fights');

// --- B. THE VOID ------------------------------------------------------------------------
console.log('=== B. descend x3 -> the bioluminescent void ===');
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.__descend());
  await sleep(900);
}
await sleep(2500);
assert((await w('w.run.zone')) === 4, 'the boat is in the Choir');

const b = await dark();
assert(b && b.active === true, 'the darkness render mode is LIVE');
assert(b && b.fogZoneMult > 4, `the fog multiplier cranks (×${b?.fogZoneMult})`);
assert(b && b.skyDarken > 0.8 && b.skyDarken < 1, `the sky darkens to near-black (${b?.skyDarken})`);
assert(
  b && b.ambientScale < 0.2 && b.ambientScale > 0,
  `and the world lights go down to ${b?.ambientScale} — geometry only where light touches`,
);
const worldLights = await page.evaluate(() => ({
  moon: window.__scene.getObjectByName('sky:moon')?.intensity ?? null,
  ambient: window.__scene.getObjectByName('sky:ambient')?.intensity ?? null,
  beam: window.__scene.getObjectByName('sky:beam')?.material?.opacity ?? null,
}));
assert(
  worldLights.moon !== null && worldLights.moon < 0.2,
  `the moon is down to ${worldLights.moon?.toFixed(3)} (from 1.1)`,
);
assert(
  worldLights.ambient !== null && worldLights.ambient < 0.1,
  `and the ambient to ${worldLights.ambient?.toFixed(3)} (from 0.6)`,
);
assert(
  worldLights.beam !== null && worldLights.beam < 0.01,
  `even the lighthouse beam — which is fog:false and would otherwise cut the void — is down to ${worldLights.beam?.toFixed(4)}`,
);

// the measured fog on the live scene, not the constant: FogExp2 factor at the
// lantern's own rim must already be near-total.
const factorAt = (d, z) => 1 - Math.exp(-Math.pow(d * z, 2));
assert(
  b && b.fogDensity !== null && factorAt(b.fogDensity, b.lantern.radius * 1.5) > 0.98,
  `the fog is >98% saturated at 1.5x the lantern radius (density ${b?.fogDensity?.toFixed(4)})`,
);
assert(
  b && factorAt(b.fogDensity, b.lantern.radius * 0.35) < 0.35,
  'and still thin INSIDE the pool — the disc is a disc, not a wall a metre out',
);
const lin = b?.fogLinear;
const linMax = lin ? Math.max(lin.r, lin.g, lin.b) : 1;
assert(
  linMax <= 0.02,
  `what geometry fades into is BLACK (linear fog max channel ${linMax.toFixed(4)}, sRGB #${(b?.fogColor ?? 0).toString(16)})`,
);

const bc = await choir();
assert(bc && bc.render.visible === true, 'the Choir is lit');
assert(bc && bc.render.motes === 40, `40 motes (${bc?.render?.motes})`);
assert(bc && bc.render.draws === 2, `in TWO draw calls — halo + core (${bc?.render?.draws})`);
assert(bc && bc.cursor.armed === true, 'and the hymn has armed on arrival');
assert(
  bc && bc.cursor.timer > 0 && bc.cursor.timer <= 13.001,
  `the first verse is a seeded slow gap away (${bc?.cursor?.timer?.toFixed(2)} s)`,
);

// determinism: the field is a pure function of (lake seed, index, sim time), so
// two reads AT THE SAME SIM TIME are identical. The clock is frozen first —
// otherwise the two reads are two different instants and the check is a race,
// not a determinism test.
await wset('w.time.timescale = 0');
await sleep(300);
const fmt = (r) => JSON.stringify(r.motes.map((m) => `${m.x.toFixed(6)},${m.y.toFixed(6)},${m.z.toFixed(6)}`));
const motesA = fmt(await choir());
const motesB = fmt(await choir());
assert(
  motesA === motesB && (await choir()).motes.length === 40,
  'the mote field is deterministic — the same seed at the same instant, twice',
);
assert(
  bc.schedule.every((s) => s.gap >= 6.5 && s.gap <= 13 && s.mote >= 0 && s.mote < 40 && s.pitch >= 0 && s.pitch < 7),
  'the hymn schedule is slow, seeded and in range',
);
await wset('w.time.timescale = 1');

console.log('=== THE VOID: screenshot ===');
await hideChrome();
// Park well clear of land and frame the lantern pool with the nearest mote past
// its rim — the disc as the only world, the choir beyond it.
await page.evaluate(() => window.__toVoid());
await sleep(1200);
const voidState = await dark();
const field = (await choir()).motes.map((m) => ({
  ...m,
  d: Math.hypot(m.x - voidState.lantern.origin.x, m.z - voidState.lantern.origin.z),
}));
const beyond = field.filter((m) => m.d > voidState.lantern.radius).sort((p, q) => p.d - q.d);
assert(
  beyond.length >= 35,
  `${beyond.length}/40 voices hang OUTSIDE the disc — and every one is still drawn, because they are light`,
);
assert(
  beyond.length > 0 && beyond[beyond.length - 1].d > voidState.lantern.radius * 4,
  `the farthest is ${beyond[beyond.length - 1]?.d?.toFixed(0)} m out — well past where the fog is total`,
);
const mote = beyond[0];
assert(mote, `the nearest voice beyond the rim is ${mote?.d?.toFixed(1)} m out`);
await wset('w.time.timescale = 0');
await page.evaluate(
  (m) => {
    const b = window.__world.boat;
    // sit behind the hull looking down the bearing of the nearest voice, so the
    // frame holds the lantern pool in the foreground and the choir past its rim
    const dx = m.x - b.x;
    const dz = m.z - b.z;
    const len = Math.hypot(dx, dz) || 1;
    window.__world.debugCam = {
      x: b.x - (dx / len) * 12,
      y: 5.2,
      z: b.z - (dz / len) * 12,
      lookX: b.x + (dx / len) * 6,
      lookZ: b.z + (dz / len) * 6,
    };
  },
  { x: mote.x, z: mote.z },
);
await sleep(700);
await page.screenshot({ path: 'tools/m8-void.png' });
console.log('      wrote tools/m8-void.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 1');

// --- C. THE CUE GATE ---------------------------------------------------------------------
console.log('=== C. the gate withholds the CUE, never the fact ===');
const c = await dark();
assert(c && c.disturbances > 0, `the sim holds ${c?.disturbances} live disturbances`);
assert(
  c && c.hiddenDisturbances > 0,
  `and ${c?.hiddenDisturbances} of them are beyond the disc and NOT DRAWN`,
);
assert(
  c && c.hiddenDisturbances <= c.disturbances,
  'the gate hides a subset — it never invents or drops one',
);
const farBuoys = (c?.buoys ?? []).filter((x) => x.dist > c.lantern.radius + 1.5);
assert(farBuoys.length > 0, `${farBuoys.length} buoy lanterns are out past the light`);
assert(
  farBuoys.every((x) => x.shown === false),
  'and every one of them is withheld — no beacons in a zone about not navigating',
);
const rippleVis = await page.evaluate(() => {
  const root = window.__scene.getObjectByName('ripples:root');
  if (!root) return null;
  return { groups: root.children.length, shown: root.children.filter((g) => g.visible).length };
});
assert(
  rippleVis && rippleVis.groups > 0 && rippleVis.shown < rippleVis.groups,
  `the ripple pool draws ${rippleVis?.shown}/${rippleVis?.groups} rings — the rest are gated`,
);

// --- D. ONE RADIUS FUNCTION ---------------------------------------------------------------
console.log('=== D. the Chandlery bow lantern widens ALL of it ===');
const before = await dark();
const widened = await page.evaluate(() => window.__setBowLantern(3));
await sleep(300);
const after = await dark();
assert(widened > before.lantern.radius, `the light widens ${before.lantern.radius} -> ${widened} m`);
assert(
  after.lantern.radius === widened,
  'the same number the darkness gate reads',
);
const lightDistance = await page.evaluate(
  () => window.__scene.getObjectByName('lantern:light')?.distance ?? null,
);
assert(
  lightDistance !== null && Math.abs(lightDistance - widened) < 1e-6,
  `and the lantern PointLight's own distance is that number (${lightDistance})`,
);
assert(
  after.buoys.filter((x) => x.shown).length >= before.buoys.filter((x) => x.shown).length,
  'a wider light shows at least as much as a narrower one',
);
await page.evaluate(() => window.__setBowLantern(0));
await sleep(200);

// --- E. THE ROAM ------------------------------------------------------------------------------
console.log('=== E. the Whistler roams OUTSIDE the light ===');
await page.evaluate(() => window.__armWhistler());
const spawned = await waitFor(`w.whistler.phase !== 'idle'`, 6000);
assert(spawned, 'deep night at Dread 75 in the Choir put it in the water');

const e = await wh();
assert(e && e.phase === 'roam', `it is roaming (${e?.phase})`);
assert(e && e.spawned === true, 'one Whistler per run — the latch is set');
assert(e && e.species === 'the-whistler', `the body is the species preset (${e?.species})`);
assert(e && e.render.draws === 0, `and it costs ZERO draws while it roams (${e?.render?.draws})`);
assert(
  e && Math.abs(e.distToKeeper - e.spawnDist) < 3,
  `it entered the water ${e?.distToKeeper?.toFixed(1)} m out (spawn ${e?.spawnDist})`,
);

// Sample the clamp across a long roam: never once inside the disc.
const clampCheck = await page.evaluate(
  () =>
    new Promise((res) => {
      let worst = Infinity;
      let samples = 0;
      const t0 = performance.now();
      const tick = () => {
        const s = window.__world.whistler;
        if (s.phase === 'roam') {
          const d = window.__whistler();
          worst = Math.min(worst, d.discFraction);
          samples++;
        }
        if (performance.now() - t0 > 4000) return res({ worst, samples });
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(clampCheck.samples > 20, `sampled the roam ${clampCheck.samples} times`);
assert(
  clampCheck.worst >= 1,
  `and it NEVER entered the disc (closest approach = ${clampCheck.worst.toFixed(3)}x the radius)`,
);

// --- F. THE THREE BANDS ------------------------------------------------------------------------
console.log('=== F. the approach is only ever SOUND ===');
await page.evaluate(() => window.__world && (window.__world.township.pendingMoment = null));
const bands = await page.evaluate(
  () =>
    new Promise((res) => {
      const seen = [];
      const rings = window.__whistler().bandRings;
      let last = window.__world.whistler.band;
      const t0 = performance.now();
      const done = () =>
        res({ seen, events: window.__whistler().events, drawn: window.__whistler().render.draws });
      const tick = () => {
        // The sim ticks BETWEEN animation frames, so the band edge has to be
        // tracked across them — not read twice inside one callback.
        const cur = window.__world.whistler.band;
        if (cur > last) {
          const t = window.__whistlerToast ? window.__whistlerToast() : null;
          seen.push({
            band: cur,
            dist: window.__whistler().bandDistance,
            drawn: window.__whistler().render.draws,
            toast: window.__whistler().toast,
          });
          last = cur;
          if (cur >= 3) return done();
        }
        // walk it in to just inside the NEXT ring — the ladder itself is still
        // the system's own monotonic rule
        if (last < rings.length) window.__whistlerTo(rings[last] - 0.6);
        if (performance.now() - t0 > 15000) return done();
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(bands.seen.length === 3, `three bands fired (${bands.seen.length})`);
assert(
  JSON.stringify(bands.seen.map((s) => s.band)) === '[1,2,3]',
  `IN ORDER: ${bands.seen.map((s) => s.band).join(',')}`,
);
const heard = (bands.events ?? []).filter((x) => x.type === 'whistler.heard');
assert(
  JSON.stringify(heard.map((x) => x.band)) === '[1,2,3]',
  `and the town-event queue carries whistler.heard 1,2,3 for the audio worker (${heard.length} rows)`,
);
assert(
  heard.length === 3,
  'once each — a band never re-fires when it drifts back out and in',
);
for (const s of bands.seen) {
  assert(s.toast && s.toast.visible, `band ${s.band} raised a dread toast on screen`);
  assert(s.toast && s.toast.faint === true, `and it is FAINT (band ${s.band})`);
  assert(
    s.toast && s.toast.trigger === `band${s.band}` && s.toast.text === VERBATIM[`band${s.band}`],
    `carrying choir.md's band-${s.band} line VERBATIM: "${s.toast?.text}"`,
  );
  if (s.band < 3) {
    assert(s.drawn === 0, `and band ${s.band} was heard, never SEEN (${s.drawn} draws)`);
  }
}
// Band 3 IS the commitment: the sim leaves the roam for the strike on that edge,
// and the render side builds its rig from 'strike' onward — so the last band is
// the first frame it exists on screen, which is exactly the design.
const b3 = bands.seen.find((s) => s.band === 3);
assert(
  b3 && bands.seen.filter((s) => s.band < 3).every((s) => s.drawn === 0),
  'through the two outer bands it was heard and NEVER DRAWN — the approach is only sound',
);
assert(b3, `and the innermost band is the commitment: it becomes visible only there`);

// --- G. THE STRIKE ------------------------------------------------------------------------------
console.log('=== G. it hooks YOU — the reverse tether, re-used ===');
const hooked = await waitFor('w.whistler.fightId >= 0', 15000, 30);
assert(hooked, 'at the innermost band it committed, closed, and set its line');

const g = await wh();
assert(g && g.fights === 1, `exactly ONE fight (${g?.fights})`);
assert(g && g.render.draws > 0, `and NOW it is drawn (${g?.render?.draws} draws)`);
const cfg = g && g.config;
assert(cfg && cfg.a === 'enemy', `endpoint a is the WHISTLER (owner ${cfg?.a})`);
assert(cfg && cfg.b === 'player', `endpoint b is the KEEPER's body (owner ${cfg?.b})`);
assert(cfg && cfg.aReel === 'ai', `IT reels (a.reel = ${cfg?.aReel})`);
assert(cfg && cfg.bReel === 'none', `YOU cannot (b.reel = ${cfg?.bReel})`);
assert(cfg && cfg.aCut === 'contextual', `the escape is contextual (a.cut = ${cfg?.aCut})`);
assert(cfg && cfg.bCut === 'none', `and costs no lure (b.cut = ${cfg?.bCut})`);
assert(cfg && cfg.anchor === 'boat', `aboard, the line is on the HULL (${cfg?.anchor})`);
assert(g && g.fight.snapBehavior === 'hold', `its line does not part (${g?.fight?.snapBehavior})`);
assert((await w('w.fish')) === null, 'there is NO CATCH — it hooked you');

// RMB is inert.
const L0 = await w('w.tether.fights[0].L');
await page.mouse.down({ button: 'right' });
await sleep(900);
await page.mouse.up({ button: 'right' });
const afterReel = await wh();
assert(
  afterReel && afterReel.fight && afterReel.fight.reelActive === false,
  'the player reel never went active off RMB',
);

// F is inert: it costs no lure and ends nothing.
const lure0 = await w('w.lure.count');
await page.keyboard.down('KeyF');
await sleep(1200);
await page.keyboard.up('KeyF');
const afterF = await wh();
assert(afterF && afterF.fights === 1, 'a 1.2 s held F does NOT end its fight');
assert((await w('w.lure.count')) === lure0, `and costs no lure (${lure0})`);

// Its reel is what moves you.
const haul = await page.evaluate(
  () =>
    new Promise((res) => {
      const t0 = performance.now();
      const start = { x: window.__world.boat.x, z: window.__world.boat.z };
      const tick = () => {
        const wd = window.__world;
        const f = wd.tether.fights[0];
        if (f && f.aiReel) {
          return res({ L: f.L, aiReel: true, reelActive: f.reel.active, start });
        }
        if (performance.now() - t0 > 12000) return res(null);
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(haul && haul.aiReel === true, 'and only during a HAUL is it taking line (fight.aiReel)');
// `aiReel` is set by the boss system; `reel.active` is what the CONSTRAINT makes
// of it on its next step — so it is read a beat later, not on the same frame.
await sleep(250);
const reelActive = await w('w.tether.fights[0] ? w.tether.fights[0].reel.active : null');
assert(reelActive === true, `the constraint resolved its AI reel as active (${reelActive})`);
await sleep(1400);
const mid = await page.evaluate(() => {
  const wd = window.__world;
  const f = wd.tether.fights[0];
  return { L: f ? f.L : null, x: wd.boat.x, z: wd.boat.z };
});
assert(mid && mid.L !== null && mid.L < haul.L, `its reel SHORTENED L (${haul.L?.toFixed(2)} -> ${mid.L?.toFixed(2)})`);
const moved = Math.hypot(mid.x - haul.start.x, mid.z - haul.start.z);
assert(moved > 0.5, `and the HULL moved ${moved.toFixed(2)} m — it drags you by route`);

console.log('=== THE STRIKE: screenshot ===');
// Shot at the moment its haul has brought it up the line to the hull — the
// strike as the player meets it: the lantern pool, the twine, and a length of
// cold light coming out of the black.
const closed = await waitFor(
  'Math.hypot(w.whistler.x - w.boat.x, w.whistler.z - w.boat.z) < 9',
  25000,
  60,
);
assert(closed, 'its haul brought it inside 9 m of the hull');
await wset('w.time.timescale = 0');
await wset(`
  const s = w.whistler, b = w.boat;
  const dx = s.x - b.x, dz = s.z - b.z, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;      // along the twine
  const px = -uz, pz = ux;                  // across it
  w.debugCam = {
    x: b.x - ux * 7.5 + px * 3.6,
    y: 3.2,
    z: b.z - uz * 7.5 + pz * 3.6,
    lookX: b.x + ux * len * 0.65,
    lookZ: b.z + uz * len * 0.65,
  };
`);
await sleep(700);
await page.screenshot({ path: 'tools/m8-strike.png' });
console.log('      wrote tools/m8-strike.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 1');

// --- H. THE ESCAPE --------------------------------------------------------------------------------
console.log('=== H. two gaffs stagger it; hold E CUTS ITS LINE ===');
const h0 = await wh();
assert(h0 && h0.gaffHp === h0.gaffHpMax, `its grip is whole (${h0?.gaffHp}/${h0?.gaffHpMax})`);
assert(h0 && h0.cutArmed === false, 'and the cut is NOT armed');

// REAL swings. Aboard, the arc is measured from the hull down the line
// (game/combat.ts whistlerGaffArc), so pinning it at arm's length of the gunwale
// is all a driver has to supply; the press, the swing, its active window and its
// cost are the game's own.
async function lightTap() {
  const pin = page.evaluate(
    () =>
      new Promise((res) => {
        const t0 = performance.now();
        const tick = () => {
          window.__whistlerToReach();
          if (performance.now() - t0 > 600) return res(true);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await pin;
  await sleep(200);
}
let hits = 0;
for (let i = 0; i < 14 && hits < 1; i++) {
  await lightTap();
  hits = (await wh()).gaffHits;
}
assert(hits >= 1, `one REAL swing landed on it (${hits})`);
const h1 = await wh();
assert(h1 && h1.cutArmed === false, 'one gaff is not enough — the window stays shut');
assert(h1 && h1.gaffHp === h1.gaffHpMax - 1, `its grip is down to ${h1?.gaffHp}/${h1?.gaffHpMax}`);

for (let i = 0; i < 14 && !(await wh()).cutArmed; i++) await lightTap();
const h2 = await wh();
assert(h2 && h2.cutArmed === true, 'TWO gaffs stagger it — the E window opens');
assert(h2 && h2.phase === 'staggered', `(phase ${h2?.phase})`);
await page.evaluate(() => window.__whistlerToReach());
await sleep(150);
const h2b = await wh();
assert(
  h2b && h2b.prompt.visible && h2b.prompt.title === 'CUT ITS LINE',
  `the contextual prompt reads "${h2b?.prompt?.title}"`,
);
assert(
  h2b && h2b.distToKeeper <= h2b.cutReach,
  `and it is in reach (${h2b?.distToKeeper?.toFixed(2)} m <= ${h2b?.cutReach} m)`,
);

const lureBeforeCut = await w('w.lure.count');
const hpBeforeCut = await w('w.player.hp');
await page.keyboard.down('KeyE');
const cutOk = await waitFor('w.whistler.cut === true', 6000);
await page.keyboard.up('KeyE');
assert(cutOk, 'the held E CUT ITS LINE');

const cut = await wh();
assert(cut && cut.fights === 0, 'the fight is over');
assert(cut && (cut.phase === 'sounding' || cut.phase === 'gone'), `it sounds (${cut?.phase})`);
assert(cut && cut.lure === lureBeforeCut, `IT COST NOTHING — lure still ${lureBeforeCut}`);
assert(cut && cut.player.hp === hpBeforeCut, 'and no HP');
assert(cut && cut.delivered === false, 'it did NOT deliver you — you cut it first');
assert(cut && cut.deliveredBy === null, 'so nothing is stamped on the run');
assert(cut && cut.water.active === false, 'the keeper is dry');
assert(cut && cut.water.lethal === false, 'and nothing about this fight was ever lethal');
const cutEv = (cut?.events ?? []).find((x) => x.type === 'whistler.cut');
assert(cutEv, `the escape is on the town queue (drags ${cutEv?.drags}, gaffs ${cutEv?.gaffHits})`);

const bst = await w('w.run.bestiaryEvents.filter((e) => e.speciesId === "the-whistler").map((e) => e.event)');
assert(
  Array.isArray(bst) && bst.join(',') === 'hooked,butchered',
  `the bestiary met it and then beat it (${bst})`,
);

// one per run: it does not come back
await waitFor(`w.whistler.phase === 'gone'`, 8000);
await sleep(1500);
const gone = await wh();
assert(gone && gone.phase === 'gone', 'it is gone');
assert(gone && gone.render.draws === 0, 'and back to zero draws');

// the void is still a void once it has left
const end = await dark();
assert(end && end.active === true, 'the darkness outlives it — the Choir is the zone, not the monster');
const endChoir = await choir();
assert(
  endChoir && endChoir.cursor.index >= 0 && endChoir.render.draws === 2,
  `the Choir is still singing (${endChoir?.cursor?.index} verses) in two draws`,
);

// --- result ------------------------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log('RESULT: ALL GREEN');
} else {
  console.log(`RESULT: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log(`  - ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
