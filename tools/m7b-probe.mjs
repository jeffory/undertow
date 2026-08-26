// tools/m7b-probe.mjs — M7 SNATCHERS gate driver (task t28 verify).
// Drives the second mouth on the line through a real browser:
//
//   A. ZONE 1 IS UNTOUCHED — the Shallows boots with the Snatcher idle, zero
//      draws, zero wake particles, and the director unarmed.
//   B. DESCEND ×2 → zone 3, and hook a catch in the drowned street through the
//      REAL SET path (systems/castFlow.ts setCatchAt).
//   C. THE APPROACH — force-spawn via the director seam; it appears on the ring
//      around the HOOKED CATCH (not the boat), trailing a wake, and does
//      NOTHING to the fight while it closes.
//      Screenshot: the approach wake.
//   D. THE LATCH — the third entity goes on the line as a RIDER: the pull
//      multiplier composes, tension gains its steady upward bias (measured
//      live), the steal clock runs, and the moment line is on screen.
//      Screenshot: the latched moment — two bodies on one line.
//   E. THE KILL — the ORDINARY GAFF, through real mouse presses, while it is
//      surfaced at the gunwale. The rider comes off, the fight returns to
//      exactly what it was, and it pays its stolen backlog.
//   F. THE STEAL — a second Snatcher onto the same fight; the clock completes.
//      The catch is GONE: 'stolen' outcome, lure KEPT, no haul, small Dread,
//      run.stolen 1, and the run continues.
//   G. DETERMINISM — the same run seed sends the same animal on the same
//      schedule from the same bearing.
//
// Screenshots: tools/m7b-approach-wake.png, tools/m7b-latched.png
// Usage: node tools/m7b-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.M7B_PROBE_URL ?? 'http://localhost:5173';
const URL = `${BASE}/?seed=616&debug&timescale=10`;

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
const snatcher = () => page.evaluate(() => window.__snatcher());
// The ?debug chrome (tuning panel, readout, save buttons) and the first-fight
// tutorial card are what the gate needs and what a SHOT does not. One style tag,
// dropped once, so the two screenshots frame the water and the note.
const hideChrome = () =>
  page.addStyleTag({
    content:
      '#debug-panel,#debug,#save-panel,#fight-tutorial,#verb-hint,#cast-prompt{display:none !important}',
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

// --- A. BOOT / ZONE 1 IS UNTOUCHED ----------------------------------------------
console.log('=== A. the Shallows never sees a second mouth ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const s1 = await snatcher();
assert(s1 && s1.zone === 1, `run opens in zone 1 (${s1?.zone})`);
assert(s1 && s1.phase === 'idle', `the Snatcher is idle (${s1?.phase})`);
assert(s1 && s1.armedFor === -1, `the director is unarmed (${s1?.armedFor})`);
assert(s1 && s1.render.draws === 0, `it costs ZERO draws at zone 1 (${s1?.render.draws})`);
assert(
  s1 && s1.render.wakeParticles === 0,
  `no wake particles anywhere (${s1?.render.wakeParticles})`,
);
assert(
  s1 && s1.lines.length === 4 && s1.placeholders === 1,
  `4 moment lines loaded, ${s1?.placeholders} still a placeholder (the unwritten kill line)`,
);
for (const want of [
  'A second mouth has taken the line. Split tension detected.',
  'The catch is contested. The Snatcher requests its share.',
  'Two mouths on one hook. Neither intends to let go.',
]) {
  assert(s1 && s1.lines.some((l) => l.text === want), `township.md line verbatim: "${want}"`);
}

// --- B. DESCEND ×2 → THE TOWNSHIP, AND HOOK SOMETHING ----------------------------
console.log('=== B. descend ×2 → zone 3, hook a catch in the drowned street ===');
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
await sleep(600);
await page.evaluate(() => window.__descend());
await sleep(2500);
assert((await w('w.run.zone')) === 3, 'the boat is in the drowned Hollow');

// real speed from here: the seeded 6-12 s launch window, the 3.3 s telegraph
// and the 9 s steal clock are all things this gate has to OBSERVE, and at
// ?timescale=10 they are gone between two round trips.
await wset('w.time.timescale = 1');
const hooked = await page.evaluate(() => window.__hookStreet());
assert(hooked, `hooked ${hooked?.catch?.name} through the real SET path (fight ${hooked?.fightId})`);
assert(hooked && hooked.anchor === 'boat', `it is a boat-anchored fight (${hooked?.anchor})`);
const baseLure = await w('w.lure.count');
const baseHaul = await w('w.run.haul.length');

// The director arms itself on its first tick over a live, legal fight. Sampled
// on a frame inside the page: from Node it is two round trips too late.
const armedTimer = await page.evaluate(
  () =>
    new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        const s = window.__world.snatcher;
        if (s.armedFor >= 0) return res(s.spawnTimer);
        if (performance.now() - t0 > 5000) return res(null);
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(armedTimer !== null, 'the spawn director armed itself on the live zone-3 night fight');
assert(
  armedTimer !== null && armedTimer > 5.5 && armedTimer <= 12,
  `the launch is ${armedTimer?.toFixed(2)} s out (the seeded 6-12 s window)`,
);

// --- C. THE APPROACH -----------------------------------------------------------------
console.log('=== C. the approach — a wake, closing on the CATCH ===');
// The launch FRAME, captured in-page — where it entered the water is a
// one-frame fact, and a Node round trip is already metres of swimming late.
const app0 = await page.evaluate(
  () =>
    new Promise((res) => {
      window.__armSnatcher(); // the launch fires on the next sim tick
      const t0 = performance.now();
      const tick = () => {
        const w = window.__world;
        const s = w.snatcher;
        if (s.phase === 'approach' && w.fish) {
          const f = w.tether.fights[0];
          return res({
            x: s.x,
            z: s.z,
            speed: s.speed,
            species: s.params ? s.params.speciesId : null,
            dCatch: Math.hypot(s.x - w.fish.x, s.z - w.fish.z),
            dHaul: Math.hypot(s.x - w.boat.x, s.z - w.boat.z),
            rider: f ? f.rider ?? null : null,
          });
        }
        if (performance.now() - t0 > 6000) return res(null);
        requestAnimationFrame(tick);
      };
      tick();
    }),
);
assert(app0, 'the director launched one');
assert(
  app0 && app0.dCatch > 11 && app0.dCatch <= 14.5,
  `it appears ${app0?.dCatch?.toFixed(1)} m out — on the ring around the CATCH (14 m), sampled on the launch frame`,
);
assert(
  app0 && app0.dHaul > 4,
  `and it is not next to the hull (${app0?.dHaul?.toFixed(1)} m off the boat)`,
);
assert(app0 && app0.rider === null, 'an APPROACHING Snatcher does nothing to the fight — no rider yet');
assert(app0 && app0.species === 'gallows-snatcher', `the body is the species preset (${app0?.species})`);

// The pool fills at the DISPLAY frame rate, and under swiftshader that is a
// handful of frames a second — so poll it rather than assume a fixed sleep.
let app1 = await snatcher();
for (let i = 0; i < 40 && app1.render.wakeParticles < 3; i++) {
  await sleep(100);
  app1 = await snatcher();
  if (app1.phase !== 'approach') break;
}
assert(
  app1 && app1.render.wakeParticles >= 3,
  `it trails a wake — ${app1?.render.wakeParticles} live particles (the wake pool)`,
);
assert(app1 && app1.render.body === true, 'and a body, off the fish pipeline');
assert(
  app1 && app1.speed > 3,
  `it is closing at ${app1?.speed?.toFixed(1)} m/s (the telegraph)`,
);

console.log('=== THE APPROACH WAKE: screenshot ===');
await hideChrome();
// Low and close, BEHIND the animal, looking down its own line of travel: the
// wake it has left is in the foreground, the body is centre frame, and the
// hooked catch it is closing on sits beyond it.
await wset(`
  const s = w.snatcher, f = w.fish;
  // The game's OWN camera angle, brought in close: raised and behind, looking
  // down the animal's line of travel. From above, the wake V reads as a wake and
  // the body reads against the water instead of vanishing into a black horizon.
  const dx = f.x - s.x, dz = f.z - s.z, len = Math.hypot(dx, dz) || 1;
  const bx = dx / len, bz = dz / len;
  w.debugCam = {
    x: s.x - bx * 5 - bz * 2.5, y: 4.0, z: s.z - bz * 5 + bx * 2.5,
    lookX: s.x + bx * 0.5, lookZ: s.z + bz * 0.5,
  };
`);
await sleep(500);
await page.screenshot({ path: 'tools/m7b-approach-wake.png' });
console.log('      wrote tools/m7b-approach-wake.png');
await wset('w.debugCam = null');

// --- D. THE LATCH ---------------------------------------------------------------------
console.log('=== D. the latch — the third entity goes on the line ===');
const latched = await waitFor(`w.snatcher.phase === 'latched'`, 8000);
assert(latched, 'it bit down: LATCHED');
const lat = await snatcher();
assert(lat && lat.fight.rider, 'a RIDER is on the fight (not a third endpoint)');
assert(
  lat && lat.fight.rider && lat.fight.rider.owner === 'third' && lat.fight.rider.on === 'b',
  `the rider is owner:'third', biting the CATCH end ('${lat?.fight?.rider?.on}')`,
);
assert((await w('w.tether.fights.length')) === 1, 'still exactly ONE fight — the constraint is untouched');
assert(
  lat && Math.abs(lat.fight.rider.pullForceMult - 1.45) < 1e-9,
  `(a) the pull load stacks ×${lat?.fight?.rider?.pullForceMult} onto the fight's own`,
);
assert(
  lat && Math.abs(lat.fight.rider.tensionBias - 4.5) < 1e-9,
  `(b) tension gains a steady +${lat?.fight?.rider?.tensionBias}/s bias`,
);
assert(
  lat && lat.steal > 4 && lat.steal <= lat.stealSeconds,
  `(c) the steal clock is running: ${lat?.steal?.toFixed(1)} / ${lat?.stealSeconds} s`,
);
assert(
  lat && lat.toast.visible && lat.toast.text.startsWith('A second mouth has taken the line'),
  `the bark toast carries the bible's intercept line: "${lat?.toast?.text}"`,
);

// THE TENSION BIAS, MEASURED: park the line slack (nothing else can raise it)
// and watch tension climb anyway — that is the steal-timer pressure, live.
// measured per SIM second (w.time.elapsed), not per wall second: under
// swiftshader the fixed-step loop runs behind the clock, and the bias is a
// property of the sim, not of the frame rate.
const biasProbe = await page.evaluate(async () => {
  const w = window.__world;
  const f = w.tether.fights[0];
  const L0 = f.L, t0 = f.tension, slack0 = w.tuning.slackDecay;
  f.L = 200; f.tension = 0; w.tuning.slackDecay = 0;
  const a = { t: w.time.elapsed, tension: f.tension };
  await new Promise((r) => setTimeout(r, 1500));
  const b = { t: w.time.elapsed, tension: f.tension };
  f.L = L0; f.tension = t0; w.tuning.slackDecay = slack0;
  return { a, b, rate: (b.tension - a.tension) / Math.max(1e-6, b.t - a.t) };
});
assert(
  biasProbe && Math.abs(biasProbe.rate - 4.5) < 0.4,
  `tension on a SLACK line climbed at ${biasProbe?.rate?.toFixed(2)}/sim-s (the rider's +4.5 bias, and nothing else)`,
);

console.log('=== THE LATCHED MOMENT (two bodies on one line): screenshot ===');
// hold it up at the gunwale so both animals are in frame with the line between
// Reel it to the gunwale and let the Snatcher come up the line to it — the
// ordinary end of a fight, with a second mouth on it. Both bodies then sit in
// the bow lantern's pool, which is the only light the drowned street has.
await page.evaluate(() => window.__snatcherSurface(true));
await wset(`
  const f = w.fish, b = w.boat, fight = w.tether.fights[0];
  const dx = f.x - b.x, dz = f.z - b.z, len = Math.hypot(dx, dz) || 1;
  f.x = b.x + (dx / len) * 3.4;
  f.z = b.z + (dz / len) * 3.4;
  fight.L = 3.4;
`);
await sleep(900); // let it swim up the line to the gunwale
await wset(`
  const s = w.snatcher, f = w.fish, b = w.boat;
  // raised three-quarter on the pair themselves, the hull's lantern spilling in
  // from the side: two bodies, one line
  const mx = (s.x + f.x) / 2, mz = (s.z + f.z) / 2;
  const dx = f.x - b.x, dz = f.z - b.z, len = Math.hypot(dx, dz) || 1;
  // the look point is pulled a metre back toward the camera so the pair sits
  // high in frame, clear of the parchment note at the bottom
  const cx = mx - (dz / len) * 3.0 - (dx / len) * 1.6;
  const cz = mz + (dx / len) * 3.0 - (dz / len) * 1.6;
  w.debugCam = {
    x: cx, y: 2.6, z: cz,
    lookX: mx + (cx - mx) * 0.28, lookZ: mz + (cz - mz) * 0.28,
  };
`);
await sleep(500);
await page.screenshot({ path: 'tools/m7b-latched.png' });
console.log('      wrote tools/m7b-latched.png');
await wset('w.debugCam = null');
await page.evaluate(() => window.__snatcherSurface(false));

// --- E. THE KILL — THE ORDINARY GAFF --------------------------------------------------
console.log('=== E. kill it with the gaff the keeper already owns ===');
const beforeKill = await snatcher();
// Keep the surfacing window open across the swings: the cycle keeps advancing,
// so re-arm it while the presses happen. Nothing else about the swing is
// special — this is game/combat.ts's own arc, damage and stamina.
let pinning = true;
const pin = (async () => {
  while (pinning) {
    await page.evaluate(() => window.__snatcherSurface(true)).catch(() => {});
    await sleep(120);
  }
})();

// The hold has to cross HEAVY_CHARGE_MIN in SIM seconds, and under swiftshader
// the fixed-step loop runs well behind the wall clock — hence the long press.
let hits = 0;
let swings = 0;
for (; swings < 6; swings++) {
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await sleep(1600);
  await page.mouse.up();
  await sleep(900); // let the active window open and the arc resolve
  const st = await snatcher();
  hits = st ? st.gaffHits : 0;
  if (st && st.phase !== 'latched') break;
  await sleep(600); // stamina regen between heavies
}
pinning = false;
await pin;

const killed = await waitFor(`w.snatcher.killed >= 1`, 3000);
assert(
  killed,
  `the gaff killed it — ${hits} landed swing(s) out of ${swings + 1}, no new verb, no new button`,
);
const post = await snatcher();
assert(
  post && (post.fight === null || !post.fight.rider),
  'the rider came OFF — the fight is exactly what it was',
);
assert((await w('w.tether.fights.length')) === 1, 'the fight is still live');
assert((await w('w.fish !== null')) === true, 'the catch is still on the hook');
assert(
  post && post.inventory > beforeKill.inventory,
  `it paid its stolen backlog: ${beforeKill?.inventory} → ${post?.inventory} sundries`,
);
assert(
  post && post.armedFor === hooked.fightId && post.spawnTimer > 0,
  `the street re-armed for another (${post?.spawnTimer?.toFixed(1)} s out)`,
);

// --- F. THE STEAL ---------------------------------------------------------------------
console.log('=== F. second pass — let the clock finish: the STOLEN outcome ===');
await sleep(2000); // let the body finish drifting off
await page.evaluate(() => window.__armSnatcher());
const latched2 = await waitFor(`w.snatcher.phase === 'latched'`, 12000);
assert(latched2, 'a second Snatcher latched onto the same fight');

const preSteal = await snatcher();
await page.evaluate(() => window.__snatcherSteal(0.05));
const stole = await waitFor(`w.snatcher.stolen >= 1`, 4000);
assert(stole, 'the steal clock completed');

const after = await snatcher();
assert((await w('w.tether.fights.length')) === 0, 'the fight ended');
assert((await w('w.fish === null')) === true, 'the catch is GONE — it went with the Snatcher');
assert(after && after.runStolen === 1, `the run counts one theft (${after?.runStolen})`);
assert(
  after && after.lure === baseLure,
  `the LURE IS KEPT (${after?.lure}) — a steal is not a snap and not a cut`,
);
assert(after && after.haul === baseHaul, `no haul recorded (${after?.haul})`);
assert(
  after && after.dread > preSteal.dread && after.dread - preSteal.dread <= 5,
  `a small Dread gain: ${preSteal?.dread?.toFixed(1)} → ${after?.dread?.toFixed(1)}`,
);
assert(
  after && after.toast.visible && after.toast.text === 'Two mouths on one hook. Neither intends to let go.',
  `the bible's stolenCatch line is on screen: "${after?.toast?.text}"`,
);
assert((await w('w.run.ended')) === false, 'THE RUN CONTINUES — a theft is not an ending');
// the water goes quiet again: no fight, no second mouth
await wset('w.time.timescale = 10');
const quietOk = await waitFor(`w.snatcher.phase === 'idle'`, 8000);
const quiet = await snatcher();
assert(quietOk && quiet.phase === 'idle', `the water is quiet again (${quiet?.phase})`);
assert(quiet && quiet.armedFor === -1, 'and the director disarmed with the fight');

// --- G. DETERMINISM --------------------------------------------------------------------
console.log('=== G. the same seed sends the same animal ===');
async function launchSignature(p) {
  await p.evaluate(() => window.__setPhase('night'));
  await p.evaluate(() => window.__descend());
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__descend());
  await p.waitForTimeout(2000);
  await p.evaluate(() => { window.__world.time.timescale = 1; });
  await p.evaluate(() => window.__hookStreet());
  return p.evaluate(
    () =>
      new Promise((res) => {
        let armed = null;
        const t0 = performance.now();
        const tick = () => {
          const s = window.__world.snatcher;
          if (armed === null && s.armedFor >= 0) {
            armed = s.spawnDelay;
            window.__armSnatcher();
          }
          if (s.phase === 'approach') {
            // the SEEDED facts only: the rolled delay and the point it entered
            // the water. s.x/s.z have already moved by however many frames the
            // sampler took, and that is a property of the frame rate, not the run.
            return res(
              JSON.stringify({
                spawnDelay: s.spawnDelay.toFixed(6),
                origin: { x: s.originX.toFixed(5), z: s.originZ.toFixed(5) },
                species: s.params ? s.params.speciesId : null,
                weight: s.params ? s.params.weightKg.toFixed(5) : null,
              }),
            );
          }
          if (performance.now() - t0 > 10000) return res(null);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}
const page2 = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page2.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page2.waitForTimeout(3500);
const sigA = await launchSignature(page2);
await page2.close();
const page3 = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page3.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page3.waitForTimeout(3500);
const sigB = await launchSignature(page3);
await page3.close();
assert(
  sigA !== null && sigA === sigB,
  `a second run of the same seed launched an identical Snatcher — ${sigA}${sigA === sigB ? '' : ` vs ${sigB}`}`,
);

// --- verdict ---------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log('M7b PROBE: ALL GREEN');
} else {
  console.log(`M7b PROBE: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log(`  - ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
