// tools/m5c-probe.mjs — M5 closing-slice gate driver (task t21 verify).
// Drives BOTTLED LIGHT and the hub's atmospheric consequences end to end
// through a real browser, on foot:
//   boot foot mode → assert a fresh town: 0 decants, the beam at 100%, the
//   shore unstained → pin the sweep + frame the lighthouse (debugCam) and shoot
//   the beam BEFORE → pour 3 decants through the same path FORM 9-L takes →
//   assert the beam dimmed/cooled/slowed by exactly the curve, the phials
//   landed in the box AND in SCHEDULE E, and the bottledLight.decanted events
//   were emitted → shoot the beam AFTER (identical framing + sweep angle) →
//   RELOAD → assert the decants persisted and the beam re-read them at boot →
//   open the door → assert the THREE-button register → open FORM 9-L, shoot it,
//   draw a fourth phial through the real button → start a tether fight, drive
//   the tension up, shoot the fight, press L → assert tension dropped to 0,
//   stamina came back full, the charge was spent and bottledLight.used was
//   emitted → restore all 8 buildings → assert the shore-water uniform walked
//   0 → 1.
// Screenshots: the beam before / after 3 decants (same framing), the FORM 9-L
// register, and a fight moment before/after the consumable is used. The shore
// stain's judged before/after pair is tools/m5c-shore-shot.mjs (it needs a
// frozen sim and a controlled A/B, which does not belong in a gate).
// Usage: node tools/m5c-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = process.env.M5C_PROBE_URL ?? 'http://localhost:5173';
const URL = `${BASE}/?seed=2026&debug&mode=foot`;
// The beam sweeps at 0.05 Hz at dusk — the before/after pair pins the same
// angle through the gate seam so the only difference in the two frames is the
// light itself.
const BEAM_ANGLE = 2.62;

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
const meta = () => page.evaluate(() => (window.__meta ? window.__meta() : null));
const hub = () => page.evaluate(() => (window.__hubLight ? window.__hubLight() : null));

async function waitFor(fn, timeoutMs, everyMs = 40) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(everyMs);
  }
}

async function hideChrome() {
  await page.evaluate(() => {
    for (const sel of ['#debug', '#debug-panel', '#save-panel', '#buildinfo']) {
      document.querySelector(sel)?.remove();
    }
  });
}

// Frame the lighthouse from out on the water, with the beam pinned across the
// view. Both beam shots use this exact call.
async function frameLighthouse() {
  await page.evaluate((angle) => {
    const w = window.__world;
    const lake = w.lake;
    const iso = lake.islets[lake.startIslet];
    // meta/hubStreet.ts lighthouseFoot: the islet's outermost −X vertex.
    let far = iso.poly[0];
    for (const v of iso.poly) if (v.x < far.x) far = v;
    const dx = far.x - iso.center.x;
    const dz = far.z - iso.center.z;
    const len = Math.hypot(dx, dz) || 1;
    let r = 0;
    for (const v of iso.poly) r = Math.max(r, Math.hypot(v.x - iso.center.x, v.z - iso.center.z));
    const foot = { x: iso.center.x + (dx / len) * r, z: iso.center.z + (dz / len) * r };
    w.debugCam = {
      x: foot.x - 26,
      y: 7.5,
      z: foot.z + 20,
      lookX: foot.x,
      lookZ: foot.z,
    };
    window.__beamAngle(angle);
  }, BEAM_ANGLE);
  await sleep(400);
  // re-pin: the sweep advanced while the frames settled
  await page.evaluate((angle) => window.__beamAngle(angle), BEAM_ANGLE);
  await sleep(60);
}

// --- BOOT ----------------------------------------------------------------------
console.log('=== BOOT (foot mode, fresh save) ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);

const boot = await w(`({ mode: w.mode, charges: w.consumables.bottledLight })`);
assert(boot && boot.mode === 'foot', `boots on foot (${boot?.mode})`);
assert(boot && boot.charges === 0, 'a fresh rig carries no Bottled Light charges');

let m = await meta();
assert(m && m.metaState.decants === 0, `a fresh town has poured nothing (${m?.metaState.decants})`);

let h0 = await waitFor(async () => {
  const s = await hub();
  return s && s.beam.lanternIntensity > 0 ? s : null;
}, 8000);
assert(h0, 'the beam seam found the lantern room');
assert(h0 && h0.beam.intensityScale === 1, `the untouched lamp stands at 100% (${h0?.beam.intensityScale})`);
assert(h0 && h0.beam.sweepScale === 1, 'the sweep is at its clock rate');
assert(h0 && h0.shoreWarm === 0, `the shore is unstained (${h0?.shoreWarm})`);

// --- BEAM: BEFORE ----------------------------------------------------------------
console.log('=== BEAM: BEFORE ===');
await hideChrome();
await frameLighthouse();
await page.screenshot({ path: 'tools/m5c-beam-0-decants.png' });
console.log('      wrote tools/m5c-beam-0-decants.png');
await page.evaluate(() => {
  window.__world.debugCam = null;
});

// --- THREE DECANTS ----------------------------------------------------------------
console.log('=== DECANT ×3 ===');
const pours = [];
for (let i = 0; i < 3; i++) {
  pours.push(await page.evaluate(() => window.__decant()));
  await sleep(200);
}
assert(pours.every((p) => p.ok), 'three pours all succeeded');
assert(
  pours[2] && pours[2].remaining === 6,
  `the finite pool counted down 9 → 6 (${pours[2]?.remaining})`,
);
const ids = new Set(pours.map((p) => p.item.id));
assert(ids.size === 3, 'each pour minted its own phial id');

m = await waitFor(async () => {
  const s = await meta();
  return s && s.metaState.decants === 3 ? s : null;
}, 4000);
assert(m, `three decants persisted into metaState (${(await meta())?.metaState.decants})`);
assert(
  m && m.box.filter((i) => i.name === 'Bottled Light').length === 3,
  'three phials landed in the box',
);
assert(
  m && m.rigLoadout.consumables.filter((c) => c.startsWith('bottled-light')).length === 3,
  'the phials were packed into SCHEDULE E for the next row-out',
);
assert(
  m && m.events.filter((e) => e.type === 'bottledLight.decanted').length === 3,
  'three bottledLight.decanted events on the town queue',
);

const h3 = await hub();
assert(h3 && h3.beam.decants === 3, 'the beam seam is reading three decants');
assert(
  h3 && Math.abs(h3.beam.intensityScale - 0.7149) < 0.01,
  `the lamp dropped to ~71% (${h3?.beam.intensityScale.toFixed(4)})`,
);
assert(
  h3 && h3.beam.opacity < h0.beam.opacity * 0.75,
  `the beam opacity fell ${(100 * (1 - h3.beam.opacity / h0.beam.opacity)).toFixed(1)}% (readable side by side)`,
);
assert(h3 && h3.beam.sweepScale < 0.8, `the sweep slowed to ${h3?.beam.sweepScale.toFixed(3)}`);
assert(h3 && h3.beam.color !== h0.beam.color, 'the beam colour cooled off the lantern warm');
assert(
  h3 && h3.beam.lanternIntensity < h0.beam.lanternIntensity,
  'the lantern-room point light dimmed with it',
);

// --- BEAM: AFTER -------------------------------------------------------------------
console.log('=== BEAM: AFTER (same framing, same sweep angle) ===');
await hideChrome();
await frameLighthouse();
await page.screenshot({ path: 'tools/m5c-beam-3-decants.png' });
console.log('      wrote tools/m5c-beam-3-decants.png');

// --- PERSISTENCE ACROSS A RELOAD -----------------------------------------------------
console.log('=== RELOAD (the dimming is permanent) ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
m = await meta();
assert(m && m.metaState.decants === 3, `the decants survived the reload (${m?.metaState.decants})`);
const hR = await waitFor(async () => {
  const s = await hub();
  return s && s.beam.lanternIntensity > 0 ? s : null;
}, 8000);
assert(
  hR && Math.abs(hR.beam.intensityScale - h3.beam.intensityScale) < 1e-6,
  'the beam re-read the poured decants at boot — the dimming is cumulative across runs',
);
assert(
  hR && hR.charges === 3,
  `the packed phials came aboard as run charges (${hR?.charges})`,
);

// --- THE THIRD DOOR -------------------------------------------------------------------
console.log('=== FORM 9-L (the decant station) ===');
await page.evaluate(() => window.__toDoor());
await waitFor(async () => await w('w.town.near'), 3000);
await page.keyboard.down('KeyE');
const opened = await waitFor(async () => await w('w.town.open'), 5000);
await page.keyboard.up('KeyE');
assert(opened, 'holding E at the door opened the register');
await sleep(250);

const nav = await page.evaluate(() => {
  const el = document.querySelector('#restoration .door-nav');
  return el ? [...el.querySelectorAll('button')].map((b) => b.textContent) : null;
});
assert(
  nav && nav.length === 3 && /RESTORATION/.test(nav[0]) && /RIG-UP/.test(nav[1]) && /DECANT/.test(nav[2]),
  `the door is a three-button register (${nav?.join(' | ')})`,
);

await page.evaluate(() => {
  document.querySelector('#restoration .door-nav button:last-child')?.click();
});
await sleep(250);
const panel = await page.evaluate(() => {
  const el = document.querySelector('#restoration');
  if (!el) return null;
  return {
    text: el.innerText,
    form: /FORM 9-L/.test(el.innerText),
    draws: /6 \/ 9/.test(el.innerText),
    spent: el.querySelectorAll('.phial.spent').length,
    phials: el.querySelectorAll('.phial').length,
    button: !!el.querySelector('button[data-decant="draw"]'),
  };
});
assert(panel && panel.form, 'the FORM 9-L masthead is on screen');
assert(panel && panel.draws, 'the allocation reads 6 / 9 draws remaining');
assert(panel && panel.phials === 9 && panel.spent === 3, `the phial rack shows 3 of 9 spent (${panel?.spent}/${panel?.phials})`);
assert(panel && /Nobody comments\. The light comments, by dimming\./.test(panel.text), 'the §1.7 line is printed on the register');
await hideChrome();
await sleep(120);
await page.screenshot({ path: 'tools/m5c-decant-register.png' });
console.log('      wrote tools/m5c-decant-register.png');

await page.evaluate(() => document.querySelector('#restoration button[data-decant="draw"]')?.click());
const fourth = await waitFor(async () => ((await meta())?.metaState.decants === 4 ? true : null), 4000);
assert(fourth, 'the DRAW ONE PHIAL button poured a fourth decant');
await page.evaluate(() => (window.__openTown ? window.__openTown(false) : null));
await sleep(200);

// --- THE IN-RUN USE ---------------------------------------------------------------------
console.log('=== BOTTLED LIGHT, MID-FIGHT ===');
await page.evaluate(() => window.__grantLight(2));
const fishUp = await waitFor(async () => await w('w.fish !== null'), 8000);
assert(fishUp, 'a catch is in the water to hook');
await page.keyboard.press('KeyT');
const fighting = await waitFor(async () => await w('w.tether.fights.length === 1'), 8000);
assert(fighting, 'a tether fight is live');

// Load the line the way tools/tether-gate.mjs scenario C does: fling the
// (untethered-from-collision) catch out to the end of the line and reel
// greedily against it, topping the player's pool so the reel never stalls.
// Stopped well short of the 100 ceiling — this is a fight moment, not a snap.
await page.evaluate(() => {
  const world = window.__world;
  world.fish.x = world.player.x + 17;
  world.fish.z = world.player.z;
});
// The climb to a properly loaded line is minutes of real time at 1× (that is
// what tools/tether-gate.mjs runs at ?timescale=10 for), so the sim clock is
// spun up for the reel and put back before the shot — same fixed steps, more
// of them per frame (core/time.ts), nothing about the fight changes.
await page.evaluate(() => {
  window.__world.time.timescale = 8;
});
await page.mouse.down({ button: 'right' });
// …and walk AWAY from the catch while reeling (scenario C's other half): the
// reel alone plateaus once the pool empties, the walk keeps the line taut.
const held = new Set();
async function walkAway() {
  const p = await w('({ px: w.player.x, pz: w.player.z, fx: w.fish ? w.fish.x : 0, fz: w.fish ? w.fish.z : 0 })');
  if (!p) return;
  const dx = p.px - p.fx;
  const dz = p.pz - p.fz;
  const want = new Set();
  if (dz > 0.35) want.add('KeyW');
  else if (dz < -0.35) want.add('KeyS');
  if (dx > 0.35) want.add('KeyD');
  else if (dx < -0.35) want.add('KeyA');
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
const tense = await waitFor(async () => {
  await page.evaluate(() => {
    window.__world.player.stamina = 100;
  });
  await walkAway();
  const t = await w('w.tether.fights[0] ? w.tether.fights[0].tension : 0');
  return t > 62 ? t : null;
}, 25000, 60);
await page.mouse.up({ button: 'right' });
for (const k of [...held]) await page.keyboard.up(k);
await page.evaluate(() => {
  window.__world.time.timescale = 1;
});
assert(tense, `the line is loaded (tension ${typeof tense === 'number' ? tense.toFixed(1) : tense})`);

await page.evaluate(() => {
  window.__world.player.stamina = 8;
});
await sleep(120);
await hideChrome();
await page.screenshot({ path: 'tools/m5c-fight-before-light.png' });
console.log('      wrote tools/m5c-fight-before-light.png');

const before = await w(
  `({ tension: w.tether.fights[0] ? w.tether.fights[0].tension : -1, stamina: w.player.stamina, charges: w.consumables.bottledLight })`,
);
await page.keyboard.press('KeyL');
await sleep(200);
const after = await w(
  `({ tension: w.tether.fights[0] ? w.tether.fights[0].tension : -1, stamina: w.player.stamina, charges: w.consumables.bottledLight, fights: w.tether.fights.length })`,
);
assert(after && after.fights === 1, 'the fight is still live — the bottle is not a cut');
assert(
  after && after.tension < before.tension && after.tension < 12,
  `L dropped the tension ${before?.tension?.toFixed(1)} → ${after?.tension?.toFixed(1)}`,
);
assert(
  after && after.stamina > before.stamina && after.stamina >= 95,
  `stamina came back full ${before?.stamina?.toFixed(0)} → ${after?.stamina?.toFixed(0)}`,
);
assert(after && after.charges === before.charges - 1, `one charge spent (${before?.charges} → ${after?.charges})`);

const usedEvents = await page.evaluate(
  () => (window.__meta ? window.__meta().events.filter((e) => e.type === 'bottledLight.used') : []),
);
assert(usedEvents.length >= 1, `bottledLight.used emitted (${usedEvents.length})`);
const chip = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('#hud .hud-chip')];
  const c = chips.find((e) => /BOTTLED LIGHT/.test(e.textContent ?? ''));
  return c ? { text: c.textContent, shown: c.style.display !== 'none' } : null;
});
assert(chip && chip.shown, `the HUD carries the charge count (${chip?.text})`);
await page.screenshot({ path: 'tools/m5c-fight-light-used.png' });
console.log('      wrote tools/m5c-fight-light-used.png');

// --- THE SHORE STAIN -----------------------------------------------------------------
console.log('=== THE WATER REDDENS (8 restorations) ===');
await page.evaluate(() => window.__logDeepRun(3));
await page.evaluate(() => window.__grantMemories(2000));
await sleep(300);
const ids8 = [
  'smokehouse',
  'chandlery',
  'post-office',
  'bell-tower',
  'chapel',
  'apothecary',
  'bakery',
  'schoolhouse',
];
const warms = [];
for (const id of ids8) {
  const out = await page.evaluate((b) => window.__restore(b), id);
  await sleep(220);
  warms.push({ id, ok: out.ok, warm: (await hub())?.shoreWarm });
}
assert(warms.every((r) => r.ok), `all eight ledger rows paid (${warms.filter((r) => !r.ok).map((r) => r.id).join(',') || 'none failed'})`);
assert(
  warms[0].warm > 0 && warms[0].warm < 0.2,
  `one restoration is barely a stain (${warms[0].warm?.toFixed(3)})`,
);
const monotone = warms.every((r, i) => i === 0 || r.warm >= warms[i - 1].warm);
assert(monotone, 'the stain only ever deepens');
assert(
  Math.abs((warms[7].warm ?? 0) - 1) < 1e-6,
  `the shore uniform reached its ceiling at 8/8 (${warms[7].warm})`,
);
console.log(`      shore warmth per restoration: ${warms.map((r) => r.warm?.toFixed(3)).join(' → ')}`);
console.log('      (the judged before/after pair for the stain is tools/m5c-shore-shot.mjs)');

// --- RESULT --------------------------------------------------------------------------
console.log('');
if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
} else {
  console.log('ALL CHECKS PASSED');
}
await browser.close();
process.exit(failures.length ? 1 : 0);
