// tools/m7c-probe.mjs — M7 BOSS gate driver (task t29 verify).
// Drives THE POSTMASTER — the reverse tether — through a real browser:
//
//   A. ZONE 1 IS UNTOUCHED — the Shallows boots with him idle, zero draws, no
//      arena, and all eight bible lines loaded verbatim.
//   B. THE ARENA — descend x2 into the drowned Hollow, park at the POST OFFICE
//      roof, dock onto the slates with a REAL B tap, and stand at the letterbox.
//   C. THE SUMMONS — a REAL held E at the marker. The prompt reads "THE
//      LETTERBOX IS FULL"; the hold resolves into a live reverse fight.
//   D. THE REVERSE CONFIG — one fight, endpoints the other way round: he is the
//      'enemy' A end with an 'ai' reel and a 'contextual' cut; the keeper is the
//      'player' B end with reel 'none' and cut 'none'. RMB is INERT.
//   E. THE TELEGRAPH — the speech-bubble card is a real DOM node over his head,
//      carrying one of the three canonical lines, 1.2 s before the pull.
//      Screenshot: the bubble mid-fight.
//   F. THE ROUTE-DRAG — his reel shortens L and MOVES THE PLAYER, along a route
//      whose station is off the roof: over the edge is the water phase.
//   G. THE CUT — two real gaff hits stagger him, hold E in reach cuts his line.
//      Screenshot: the cut moment.
//   H. THE ADDRESS — forwardingAddress on the run, on the receipt, in the save,
//      and still there across a full page reload.
//
// Screenshots: tools/m7c-telegraph.png, tools/m7c-cut.png
// Usage: node tools/m7c-probe.mjs   (dev server must be running on :5173,
//        or set M7C_PROBE_URL)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.M7C_PROBE_URL ?? 'http://localhost:5173';
const SEED = 616;
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
const pm = () => page.evaluate(() => window.__postmaster());
const hideChrome = () =>
  page.addStyleTag({
    content:
      '#debug-panel,#debug,#save-panel,#fight-tutorial,#verb-hint,#cast-prompt,#buildinfo{display:none !important}',
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

// --- A. BOOT / ZONE 1 IS UNTOUCHED --------------------------------------------------
console.log('=== A. the Shallows has no Post Office ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const a1 = await pm();
assert(a1 && a1.zone === 1, `run opens in zone 1 (${a1?.zone})`);
assert(a1 && a1.phase === 'idle', `the Postmaster is idle (${a1?.phase})`);
assert(a1 && a1.arena === null, 'there is no arena in the Shallows — no roofs, no post office');
assert(a1 && a1.render.draws === 0, `he costs ZERO draws at zone 1 (${a1?.render.draws})`);
assert(a1 && a1.fights === 0, 'no tether fights');
assert(a1 && a1.forwardingAddress === false, 'the address is unposted');

assert(a1 && a1.lines.length === 8, `8 delivery lines loaded (${a1?.lines.length})`);
const CANONICAL = ['SPECIAL DELIVERY.', 'RETURN TO SENDER.', 'SIGN HERE.'];
const COURTESY = [
  'POSTAGE DUE UPON RECEIPT.',
  'PLEASE INITIAL THE MARGIN.',
  'FORWARDING SERVICE REQUESTED.',
  'FRAGILE: DO NOT BEND.',
  'SIGNATURE REQUIRED UPON SUBMERSION.',
];
for (const want of [...CANONICAL, ...COURTESY]) {
  assert(a1 && a1.lines.some((l) => l.line === want), `township.md verbatim: "${want}"`);
}
assert(
  a1 && a1.lines.filter((l) => l.canonical).length === 3,
  'exactly three are the plan’s canonical telegraphs',
);
assert(
  a1 && a1.dropText.includes('The Post Office on dry land can now resume direct sorting.'),
  'the forwarding-address drop text is township.md verbatim',
);

// --- B. THE ARENA -------------------------------------------------------------------
console.log('=== B. descend x2 -> the drowned Hollow, dock on the POST OFFICE roof ===');
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
await sleep(600);
await page.evaluate(() => window.__descend());
await sleep(2500);
assert((await w('w.run.zone')) === 3, 'the boat is in the drowned Hollow');

const arena = await pm();
assert(arena && arena.arena, 'the drowned Hollow has a Post Office');
assert(
  arena && arena.arena && arena.arena.building === 'post-office',
  `the arena roof is the post office (${arena?.arena?.building})`,
);

const parked = await page.evaluate(() => window.__toPostOffice());
assert(parked, `parked at the post office roof ${parked?.roof?.id}`);
assert(
  parked && parked.edgeGap <= 2,
  `the hull is inside DOCK_RANGE of its hull (${parked?.edgeGap?.toFixed(2)} m)`,
);

await page.keyboard.down('KeyB');
await sleep(500);
await page.keyboard.up('KeyB');
assert(await waitFor(`w.mode === 'foot'`, 5000), 'the real B verb put the keeper on the slates');
const marker = await page.evaluate(() => window.__toLetterbox());
assert(marker && marker.atMarker === true, 'the keeper is standing at the letterbox');

// real speed from here: the 1.5 s summon hold, the 1.2 s telegraph and the
// 2.6 s delivery are all things this gate has to OBSERVE.
await wset('w.time.timescale = 1');

// --- C. THE SUMMONS -----------------------------------------------------------------
console.log('=== C. the summons — a real held E at the letterbox ===');
const beforeSummon = await pm();
assert(
  beforeSummon && beforeSummon.prompt.visible && beforeSummon.prompt.title === 'THE LETTERBOX IS FULL',
  `the summon prompt is up: "${beforeSummon?.prompt?.title}"`,
);
assert(beforeSummon.phase === 'idle', 'and nothing has been summoned yet');

await page.keyboard.down('KeyE');
const summoned = await waitFor(`w.postmaster.phase !== 'idle'`, 6000);
await page.keyboard.up('KeyE');
assert(summoned, 'the held E resolved into a summons');

const c = await pm();
assert(c && c.phase === 'arrive', `he arrives (${c?.phase})`);
assert(c && c.species === 'the-postmaster', `the body is the species preset (${c?.species})`);
assert(c && c.render.body === true, 'and it is a fish-pipeline rig, drawn');
assert(c && c.summoned === true, 'one Postmaster per run — the latch is set');

// --- D. THE REVERSE CONFIG ------------------------------------------------------------
console.log('=== D. THE REVERSE ENDPOINT CONFIG ===');
assert(c && c.fights === 1, `exactly ONE fight (${c?.fights})`);
const cfg = c && c.config;
assert(cfg && cfg.a === 'enemy', `endpoint a is the BOSS (owner ${cfg?.a})`);
assert(cfg && cfg.b === 'player', `endpoint b is the KEEPER (owner ${cfg?.b})`);
assert(cfg && cfg.aReel === 'ai', `HE reels (a.reel = ${cfg?.aReel})`);
assert(cfg && cfg.bReel === 'none', `YOU cannot (b.reel = ${cfg?.bReel})`);
assert(cfg && cfg.aCut === 'contextual', `the cut is contextual (a.cut = ${cfg?.aCut})`);
assert(cfg && cfg.bCut === 'none', `and costs no lure (b.cut = ${cfg?.bCut})`);
assert(c && c.fight.snapBehavior === 'hold', `his twine does not part (${c?.fight?.snapBehavior})`);
assert(c && c.fight.anchor === 'player', `the fight is player-anchored (${c?.fight?.anchor})`);
assert((await w('w.fish')) === null, 'there is NO CATCH — he hooked you');

// RMB is inert: hold it and watch L not move.
const L0 = await w('w.tether.fights[0].L');
const stam0 = await w('w.player.stamina');
await page.mouse.down({ button: 'right' });
await sleep(900);
await page.mouse.up({ button: 'right' });
const afterReel = await pm();
assert(
  afterReel && Math.abs(afterReel.fight.L - L0) < 1e-6,
  `the player's reel is INERT — L unchanged (${L0?.toFixed(3)} -> ${afterReel?.fight?.L?.toFixed(3)})`,
);
assert(
  afterReel && afterReel.fight.reelActive === false,
  'and reel.active never went true off RMB',
);
assert(
  (await w('w.player.stamina')) >= stam0 - 0.001,
  'no reel stamina drain either',
);

// F is inert too: it costs no lure and ends nothing.
const lure0 = await w('w.lure.count');
await page.keyboard.down('KeyF');
await sleep(1200);
await page.keyboard.up('KeyF');
const afterF = await pm();
assert(afterF && afterF.fights === 1, 'a 1.2 s held F does NOT end his fight');
assert((await w('w.lure.count')) === lure0, `and costs no lure (${lure0})`);

// --- E. THE TELEGRAPH -----------------------------------------------------------------
console.log('=== E. the speech-bubble telegraph ===');
const tele = await page.evaluate(
  () =>
    new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        const s = window.__world.postmaster;
        if (s.phase === 'telegraph' && s.card) {
          return res({ card: s.card, timer: s.timer, drags: s.drags, rotationStart: s.rotationStart });
        }
        if (performance.now() - t0 > 20000) return res(null);
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(tele, 'a delivery was telegraphed');
assert(
  tele && tele.timer > 1.0 && tele.timer <= 1.2 + 0.05,
  `the card is up ${tele?.timer?.toFixed(2)} s BEFORE the pull (1.2 s)`,
);

await hideChrome();
const bubble = await page.evaluate(() => window.__postmaster().bubble);
assert(bubble && bubble.visible === true, 'the speech bubble is a live DOM node');
assert(
  bubble && CANONICAL.includes(bubble.text),
  `it carries a canonical telegraph: "${bubble?.text}"`,
);
assert(bubble && bubble.canonical === true, 'flagged canonical, so it renders as the loud card');
const pmPos = await page.evaluate(() => {
  const s = window.__world.postmaster;
  return window.__toScreen(s.x, s.z);
});
assert(
  bubble && Math.abs(bubble.left - pmPos.x) < 90,
  `and it hangs OVER HIM (bubble x ${Math.round(bubble.left)} vs his screen x ${Math.round(pmPos.x)})`,
);
assert(bubble && bubble.top < pmPos.y, 'above his head, not on him');

console.log('=== THE TELEGRAPH: screenshot ===');
// Freeze the sim (timescale 0 runs zero fixed steps; present still runs every
// frame) and compose the shot side-on to the twine, so the card, the man and
// the keeper he is addressing are all in one frame.
await wset('w.time.timescale = 0');
await wset(`
  const s = w.postmaster, p = w.player;
  const mx = (s.x + p.x) / 2, mz = (s.z + p.z) / 2;
  const dx = s.x - p.x, dz = s.z - p.z, len = Math.hypot(dx, dz) || 1;
  const bx = dx / len, bz = dz / len;              // along the line
  const px = -bz, pz = bx;                          // across it
  const back = Math.max(9, len * 0.95);
  w.debugCam = { x: mx + px * back, y: 5.4, z: mz + pz * back, lookX: mx, lookZ: mz };
`);
await sleep(600);
await page.screenshot({ path: 'tools/m7c-telegraph.png' });
console.log('      wrote tools/m7c-telegraph.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 1');

// --- F. THE ROUTE-DRAG ------------------------------------------------------------------
console.log('=== F. the route-drag — his reel moves the PLAYER, toward the roof edge ===');
const drag = await page.evaluate(
  () =>
    new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        const wd = window.__world;
        const s = wd.postmaster;
        if (s.phase === 'drag') {
          const f = wd.tether.fights[0];
          return res({
            L: f ? f.L : null,
            aiReel: f ? f.aiReel : null,
            reelActive: f ? f.reel.active : null,
            px: wd.player.x,
            pz: wd.player.z,
            route: { x: s.routeX, z: s.routeZ },
          });
        }
        if (performance.now() - t0 > 8000) return res(null);
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(drag, 'the delivery began');
assert(drag && drag.aiReel === true, 'and only NOW is he taking line (fight.aiReel)');
assert(drag && drag.reelActive === true, 'the constraint resolved his AI reel as active');

await sleep(1400);
const mid = await page.evaluate(() => {
  const wd = window.__world;
  const f = wd.tether.fights[0];
  return { L: f ? f.L : null, px: wd.player.x, pz: wd.player.z, water: wd.water.active };
});
assert(mid && mid.L !== null && mid.L < drag.L, `his reel SHORTENED L (${drag.L?.toFixed(2)} -> ${mid.L?.toFixed(2)})`);
const moved = Math.hypot(mid.px - drag.px, mid.pz - drag.pz);
assert(moved > 0.5, `and the PLAYER moved ${moved.toFixed(2)} m — he drags you by route`);
// the route runs toward the station he picked, which is off the roof
const before = Math.hypot(drag.px - drag.route.x, drag.pz - drag.route.z);
const after = Math.hypot(mid.px - drag.route.x, mid.pz - drag.route.z);
assert(after < before, `and toward his ROUTE STATION (${before.toFixed(1)} -> ${after.toFixed(1)} m)`);

// keep going: the route ends over the roof edge, in the flooded street
const wentUnder = await waitFor('w.water.active', 30000, 60);
assert(wentUnder, 'a delivery put the keeper over the edge and into the street (WATER PHASE)');
const under = await pm();
assert(under && under.water.lethal === true, 'and in HIS fight the breath is LETHAL');
assert(
  under && under.bubble.visible && under.bubble.text === 'SIGNATURE REQUIRED UPON SUBMERSION.',
  `he is courteous about it: "${under?.bubble?.text}"`,
);

// --- G. THE CUT -------------------------------------------------------------------------
console.log('=== G. two gaffs stagger him; hold E in reach CUTS HIS LINE ===');
// Back onto the slates first: the gaff is not a water verb (game/combat.ts
// suppresses every swing while submerged), so his own delivery has to be
// survived before it can be answered.
await page.evaluate(() => window.__postmasterBreath(14.9));
// Pin him at the keeper's side while the keeper climbs out: his own reel would
// otherwise haul them straight back off the slates, and a Node round trip is
// slower than a 2.8 m/s winch. The SURFACING itself is the game's own rule
// (game/waterPhase.ts exits when the keeper is back inside the roof hull).
const surfaced = await page.evaluate(
  () =>
    new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        window.__toLetterbox();
        window.__postmasterToReach();
        if (!window.__world.water.active) return res(true);
        if (performance.now() - t0 > 8000) return res(false);
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(surfaced, 'the keeper climbed back onto the slates');

// He is brought to arm's length and the keeper is pointed at him; the SWING is
// the ordinary one, driven by real mouse presses through game/input.ts.
await page.evaluate(() => window.__postmasterToReach());
const g0 = await pm();
assert(g0 && g0.gaffHp === g0.gaffHpMax, `his grip is whole (${g0?.gaffHp}/${g0?.gaffHpMax})`);
assert(g0 && g0.cutArmed === false, 'and the cut is NOT armed');

// LIGHT TAP #1 — a real press/release inside the heavy threshold.
async function lightTap() {
  // Hold him at arm's length for the whole swing. A driver cannot chase a
  // 6.5 m/s boss around a roof at wall speed — but the press, the swing, its
  // locked facing, its arc, its active window and its cost are all the game's.
  const pin = page.evaluate(
    () =>
      new Promise((res) => {
        const t0 = performance.now();
        const tick = () => {
          window.__postmasterToReach();
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
for (let i = 0; i < 12 && hits < 1; i++) {
  await lightTap();
  hits = (await pm()).gaffHits;
}
assert(hits >= 1, `one REAL swing landed on him (${hits})`);
const g1 = await pm();
assert(g1 && g1.cutArmed === false, 'one gaff is not enough — the window stays shut');
assert(g1 && g1.gaffHp === g1.gaffHpMax - 1, `his grip is down to ${g1?.gaffHp}/${g1?.gaffHpMax}`);

for (let i = 0; i < 12 && !(await pm()).cutArmed; i++) await lightTap();
const g2 = await pm();
assert(g2 && g2.cutArmed === true, 'TWO gaffs stagger him — the E window opens');
assert(g2 && g2.phase === 'staggered', `(phase ${g2?.phase})`);
assert(g2 && g2.gaffHits >= 2, `${g2?.gaffHits} swings landed, all of them the ordinary gaff`);
await page.evaluate(() => window.__postmasterToReach());
await sleep(120);
const g2b = await pm();
assert(
  g2b && g2b.prompt.visible && g2b.prompt.title === 'CUT HIS LINE',
  `the contextual prompt reads "${g2b?.prompt?.title}"`,
);
assert(
  g2b && g2b.distToPlayer <= g2b.cutReach,
  `and he is in reach (${g2b?.distToPlayer?.toFixed(2)} m <= ${g2b?.cutReach} m)`,
);

console.log('=== THE CUT MOMENT: screenshot ===');
await wset('w.time.timescale = 0');
await wset(`
  const s = w.postmaster, p = w.player;
  const mx = (s.x + p.x) / 2, mz = (s.z + p.z) / 2;
  const dx = s.x - p.x, dz = s.z - p.z, len = Math.hypot(dx, dz) || 1;
  const px = -dz / len, pz = dx / len;
  w.debugCam = { x: mx + px * 5.2, y: 2.9, z: mz + pz * 5.2, lookX: mx, lookZ: mz };
`);
await sleep(600);
await page.screenshot({ path: 'tools/m7c-cut.png' });
console.log('      wrote tools/m7c-cut.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 1');

const lureBeforeCut = await w('w.lure.count');
const invBeforeCut = await w('w.run.inventory.length');
await page.keyboard.down('KeyE');
const cutOk = await waitFor('w.postmaster.cut === true', 6000);
await page.keyboard.up('KeyE');
assert(cutOk, 'the held E CUT HIS LINE');

const cut = await pm();
assert(cut && cut.fights === 0, 'the fight is over');
assert(cut && (cut.phase === 'sinking' || cut.phase === 'gone'), `he sinks courteously (${cut?.phase})`);
assert(cut && cut.lure === lureBeforeCut, `IT COST NOTHING — lure still ${lureBeforeCut}`);
assert(cut && cut.forwardingAddress === true, 'he dropped the FORWARDING ADDRESS');
assert(
  cut && cut.inventory === invBeforeCut + 1,
  `and one parcel (${invBeforeCut} -> ${cut?.inventory})`,
);
assert(
  cut && cut.lastDrop && ['R', 'E', 'Drowned'].includes(cut.lastDrop.rarity),
  `a guaranteed R+ drop (${cut?.lastDrop?.rarity} ${cut?.lastDrop?.name})`,
);
assert(cut && cut.water.lethal === false, 'and the street is merely wet again');

const bst = await w('w.run.bestiaryEvents.filter((e) => e.speciesId === "the-postmaster").map((e) => e.event)');
assert(
  Array.isArray(bst) && bst.join(',') === 'hooked,butchered',
  `the bestiary met him and then beat him (${bst})`,
);

// --- H. THE ADDRESS ACROSS A RELOAD --------------------------------------------------------
console.log('=== H. the forwarding address survives a reload ===');
// End the run so the receipt persists (extraction is not reachable on foot; the
// gate ends it the way the run terminal does — the keeper's own death — and the
// address must survive THAT too, because it is a story fact, not haul).
await wset('w.player.hp = 0');
const ended = await waitFor('w.run.ended === true', 8000);
assert(ended, 'the run ended');
await sleep(1500); // the save write is async

const persisted = await page.evaluate(() => window.__meta());
assert(
  persisted && persisted.metaState && persisted.metaState.forwardingAddress === true,
  'metaState.forwardingAddress is TRUE in the save',
);

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
const reloaded = await pm();
assert(
  reloaded && reloaded.savedAddress === true,
  'and it is STILL TRUE after a full page reload',
);
assert(
  reloaded && reloaded.forwardingAddress === false,
  'while the fresh run starts without it (the run flag is per-run; the META fact is not)',
);
assert(reloaded && reloaded.phase === 'idle', 'and the new run has no Postmaster');

// --- result ----------------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log('RESULT: ALL GREEN');
} else {
  console.log(`RESULT: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log(`  - ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
