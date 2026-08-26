// tools/m6boss-probe.mjs — M6 BOSS gate driver: THE CONGREGATION (task t25).
// Drives the Kelp Graves boss end to end through a real browser at ?timescale=10:
//
//   A. ZONE 1 IS UNTOUCHED — the Shallows seeds no boss ripple at all.
//   B. THE RIPPLE — descend to zone 2 and find exactly ONE oversized boss
//      ripple, seeded once, deterministic for the run seed.
//   C. THE PHASE GATE — at dusk the ripple declines the tackle and stays.
//   D. THE HOOK — at night the SET starts ONE tether fight whose catch is the
//      swarm centre, with 20-40 members on the hook and the pull multiplier at
//      its heaviest. Screenshot: the swarm mid-fight.
//   E. TEAR-OFF — gaffs take members straight off (heavy 2, light 1), the mass
//      pool falls with them, and the fight LIGHTENS.
//   F. THE BURST — exhausting the pool arms the ordinary LAND prompt; landing
//      grows the haul by 12-18 records in one press.
//   G. THE INVOICE — the ledger descends, the named rows read out at their own
//      account numbers, and it stops at Ruth Oakes, account 47 of 47.
//      Screenshot: the invoice at row 47.
//   H. PERF — the whole school is ONE extra draw call.
//
// Screenshots: tools/m6-congregation-swarm.png, tools/m6-congregation-invoice.png
// Usage: node tools/m6boss-probe.mjs   (dev server must be running on :5173)

import { chromium } from 'playwright';

const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = process.env.M6_BOSS_PROBE_URL ?? 'http://localhost:5173/?seed=616&debug&timescale=10';

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
const boss = () => page.evaluate(() => window.__congregation());

// --- A. ZONE 1 IS UNTOUCHED -------------------------------------------------------
console.log('=== A. the Shallows seeds no congregation ===');
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

let b = await boss();
assert(b && b.zone === 1, `run opens in zone 1 (${b?.zone})`);
assert(b && b.seeded === false, 'no boss ripple was seeded in the Shallows');
assert(b && b.ripple === null, 'no boss ripple exists in the Shallows');
assert(b && b.active === false, 'no Congregation fight is live');
assert(b && b.render.draws === 0, `the swarm costs 0 draw calls at zone 1 (${b?.render.draws})`);

// --- B. THE RIPPLE ---------------------------------------------------------------
console.log('=== B. DESCEND → the Kelp Graves seeds ONE oversized boss ripple ===');
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
await sleep(700);

b = await boss();
assert(b && b.zone === 2, `descended to zone 2 (${b?.zone})`);
assert(b && b.seeded === true && b.ripple !== null, 'the congregation gathered');
const count = await w(`w.disturbances.filter(d => d.boss === 'congregation').length`);
assert(count === 1, `exactly ONE boss ripple in the water (${count})`);
const reseeded = await page.evaluate(() => window.__seedCongregation());
assert(reseeded === false, 'a second seeding is refused — once per run');
const rippleRadius = await page.evaluate(() => {
  const d = window.__world.disturbances.find((x) => x.boss === 'congregation');
  return d ? { boss: d.boss, tier: d.tier, state: d.state } : null;
});
assert(rippleRadius && rippleRadius.boss === 'congregation', 'the ripple is marked as the boss');

// clear of the weed it gathers in
const clearance = await w(`(() => {
  const d = w.disturbances.find(x => x.boss === 'congregation');
  let near = Infinity;
  for (const k of w.lake.kelp) near = Math.min(near, Math.hypot(k.x - d.pos.x, k.z - d.pos.z));
  return near;
})()`);
assert(clearance > 2, `the swarm has open water to orbit in (nearest stalk ${clearance?.toFixed(1)} m)`);

const sig = await w(`JSON.stringify(w.disturbances.find(d => d.boss === 'congregation').pos)`);

// --- C. THE PHASE GATE ------------------------------------------------------------
console.log('=== C. it does not assemble before dark ===');
await page.evaluate(() => window.__setPhase('dusk'));
await page.evaluate(() => window.__toCongregation());
await sleep(200);
const dusk = await page.evaluate(() => window.__hookCongregation());
assert(dusk && dusk.active === false, 'the dusk SET is declined — no fight starts');
const stillThere = await w(`w.disturbances.filter(d => d.boss === 'congregation').length`);
assert(stillThere === 1, 'the ripple is still there, re-castable');

// --- D. THE HOOK ------------------------------------------------------------------
console.log('=== D. at night, ONE hook takes the whole school ===');
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__toCongregation());
await sleep(200);
const hooked = await page.evaluate(() => window.__hookCongregation());
assert(hooked && hooked.active === true, 'the Congregation is on the line');
// AT THE HOOK-SET: the whole congregation is on the line and the pool is full.
// (Read from the hook's own return — a poll a few frames later is already
// lighter, because the fight has started tiring it. That is the mechanic.)
assert(
  hooked && hooked.members >= 20 && hooked.members <= 40,
  `20-40 members on one hook (${hooked?.members})`,
);
assert(
  hooked && hooked.massPool === hooked.members,
  `the mass pool opens full — one unit per member (${hooked?.massPool}/${hooked?.members})`,
);
await sleep(400); // let a frame draw the school before reading its cost

b = await boss();
assert(b && b.members === hooked.members, `the school is intact (${b?.members})`);
assert(
  b && b.massPool < b.massPoolMax && b.massPool > b.massPoolMax * 0.8,
  `…and already tiring on its own (${b?.massPool?.toFixed(1)}/${b?.massPoolMax})`,
);
const fights = await w(`w.tether.fights.length`);
assert(fights === 1, `exactly ONE tether fight (${fights})`);
const fightSpecies = await w(`w.tether.fights[0].species`);
assert(fightSpecies === 'the-congregation', `…and its catch is the swarm centre (${fightSpecies})`);
assert(
  b && b.fightPullMult !== null && b.fightPullMult > 1.2,
  `the fight starts HEAVY (pull ×${b?.fightPullMult?.toFixed(2)})`,
);
assert(b && b.render.draws === 1, `the whole school is ONE draw call (${b?.render.draws})`);
assert(
  b && b.render.instances === b.members,
  `every member is an instance (${b?.render.instances}/${b?.members})`,
);

console.log('=== THE SWARM MID-FIGHT: screenshot ===');
await wset('w.time.timescale = 1');
// the first-fight instruction card sits dead centre; it is not what this shot is of
await page.addStyleTag({ content: '#fight-tutorial{display:none!important}' });
await wset(`
  const f = w.fish;
  w.debugCam = { x: f.x + 0.6, y: 2.6, z: f.z + 6.5, lookX: f.x, lookZ: f.z };
`);
await sleep(1100);
await page.screenshot({ path: 'tools/m6-congregation-swarm.png' });
console.log('      wrote tools/m6-congregation-swarm.png');
await wset('w.debugCam = null');
await wset('w.time.timescale = 10');

// --- E. TEAR-OFF ---------------------------------------------------------------------
console.log('=== E. gaffs tear members straight off the hook ===');
const before = await boss();
await page.evaluate(() => window.__congregationGaff(true)); // heavy → 2
await sleep(140);
await page.evaluate(() => window.__congregationGaff(false)); // light → 1
await sleep(140);
const afterGaff = await boss();
assert(
  afterGaff && afterGaff.gaffTears >= 3,
  `the gaff took members off (${afterGaff?.gaffTears} torn)`,
);
assert(
  afterGaff && afterGaff.attached < before.attached,
  `fewer are still on the line (${before?.attached} → ${afterGaff?.attached})`,
);
assert(
  afterGaff && afterGaff.massPool < before.massPool,
  `the mass pool fell with them (${before?.massPool} → ${afterGaff?.massPool})`,
);
assert(
  afterGaff && afterGaff.fightPullMult < before.fightPullMult,
  `…and the fight LIGHTENED (×${before?.fightPullMult?.toFixed(2)} → ×${afterGaff?.fightPullMult?.toFixed(2)})`,
);

// --- F. THE BURST -----------------------------------------------------------------------
console.log('=== F. an exhausted mass pool arms the ORDINARY land prompt ===');
await page.evaluate(() => window.__congregationExhaust(0));
await sleep(200);
const spent = await boss();
assert(spent && spent.massPool === 0, `the pool is spent (${spent?.massPool})`);
assert(spent && spent.attached === 0, `nobody is left on the hook (${spent?.attached})`);

const haulBefore = await w(`w.run.haul.length`);
// hold the exhausted swarm at the gunwale and take the LAND with the same E the
// keeper lands every catch with
const landed = await page.evaluate(async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    window.__congregationToGunwale();
    const f = window.__world.tether.fights[0];
    if (!f) return { gone: true, eligible: false };
    if (f.land.eligible) return { gone: false, eligible: true };
    await new Promise((r) => setTimeout(r, 16));
  }
  return { gone: false, eligible: false };
});
assert(landed && landed.eligible, 'the LAND prompt armed at the gunwale');
await page.keyboard.press('KeyE');
await sleep(250);
// read the ledger out at a legible rate from the very first row
await wset('w.time.timescale = 1');
await sleep(3200);

const burst = await boss();
const haulAfter = await w(`w.run.haul.length`);
const grew = haulAfter - haulBefore;
assert(burst && burst.landed === true, 'the cluster burst');
assert(
  grew >= 12 && grew <= 18,
  `the haul grew by the burst count: ${haulBefore} → ${haulAfter} (+${grew}, want 12-18)`,
);
assert(burst && burst.burstCount === grew, `…and the boss agrees (${burst?.burstCount})`);
assert(burst && burst.active === false, 'the fight is over');
const activeCatch = await w(`w.run.activeCatch`);
assert(activeCatch === null, 'the reducer did not also land the centre as one catch');
// --- G. THE INVOICE -----------------------------------------------------------------------
console.log('=== G. the ledger descends, and stops at 47 ===');
assert(burst && burst.invoice.active === true, 'the invoice overlay is up');
const early = await page.evaluate(() => {
  const byAccount = {};
  for (const el of document.querySelectorAll('#congregation-invoice .row')) {
    byAccount[el.dataset.account] = el.textContent;
  }
  const mast = [...document.querySelectorAll('#congregation-invoice .masthead div')].map(
    (e) => e.textContent,
  );
  return {
    form: document.querySelector('#congregation-invoice .form-no')?.textContent ?? null,
    mast,
    byAccount,
    n: Object.keys(byAccount).length,
  };
});
assert(
  early && early.form === '[FORM 47-B: AGGREGATE RECEIPT & DISCHARGE MANIFEST]',
  `the masthead form code is the bible's (${early?.form})`,
);
assert(
  early && early.mast[0] === 'PARISH OF SAINT JUDE-IN-THE-FENS (SUBMERGED OCT. 14)',
  `…the parish line too (${early?.mast?.[0]})`,
);
assert(
  early &&
    early.byAccount['1'] ===
      "1x Parish Basset Hound (answering faintly to 'Barnaby') - ledgered. Account 1 of 47.",
  `account 1 is the named row, verbatim (${early?.byAccount?.['1']})`,
);
assert(
  early &&
    early.byAccount['7'] ===
      "1x Verger's Assistant (carrying three unreturned brass collection plates) - ledgered. Account 7 of 47.",
  `account 7 is the named row, verbatim (${early?.byAccount?.['7']})`,
);
assert(
  early && early.n > 1 && early.n <= 14,
  `the ledger is descending — ${early?.n} rows on the sheet, the oldest scrolling off`,
);

// speed the middle of the read-out, then hold the stamped sheet for the shot
await wset('w.time.timescale = 3');
const done = await page.evaluate(async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const inv = window.__world.congregation.invoice;
    if (inv.done) return { rowIndex: inv.rowIndex, done: true };
    if (!inv.active) return { rowIndex: inv.rowIndex, done: false };
    await new Promise((r) => setTimeout(r, 40));
  }
  return null;
});
await wset('w.time.timescale = 1');
assert(done && done.done === true, `the ledger reached its last account (${done?.rowIndex})`);
assert(done && done.rowIndex === 47, `…which is 47 (${done?.rowIndex})`);

const sheet = await page.evaluate(() => {
  const byAccount = {};
  for (const el of document.querySelectorAll('#congregation-invoice .row')) {
    byAccount[el.dataset.account] = { text: el.textContent, seeded: el.classList.contains('seeded') };
  }
  return {
    byAccount,
    stamp: document.querySelector('#congregation-invoice .stamp.up')?.textContent ?? null,
  };
});
const named = [
  [41, '1x Silas Callow, Sexton (resisting extraction; claims nave is merely damp) - ledgered. Account 41 of 47.'],
  [45, '1x Mother & Infant, Unnamed (found beneath the communion rail) - ledgered. Account 45 of 47.'],
  [47, '1x Ruth Oakes, newborn (the child Maren stayed to deliver) - ledgered. Account 47 of 47.'],
];
for (const [account, text] of named) {
  const row = sheet.byAccount[String(account)];
  assert(row && row.text === text, `account ${account} reads its named row verbatim`);
  assert(row && row.seeded === true, `…and is marked as a named row (account ${account})`);
}
assert(
  sheet.stamp ===
    'STAMP: ALL 47 ACCOUNTS SURRENDERED — QUORUM RESTORED — NO FURTHER SINGING PERMITTED — THE OFFICE EXTENDS CONGRATULATIONS ON YOUR HEAVY ARM',
  'the closing stamp is down, verbatim',
);

console.log('=== THE INVOICE AT ROW 47: screenshot ===');
await page.screenshot({ path: 'tools/m6-congregation-invoice.png' });
console.log('      wrote tools/m6-congregation-invoice.png');

// --- H. PERF + DETERMINISM ---------------------------------------------------------------
console.log('=== H. perf + determinism ===');
const afterDraws = await boss();
assert(
  afterDraws && afterDraws.render.draws === 0,
  `the school stops drawing once the fight is over (${afterDraws?.render.draws})`,
);

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
await page.evaluate(() => window.__setPhase('night'));
await page.evaluate(() => window.__descend());
await sleep(500);
const sig2 = await w(`JSON.stringify(w.disturbances.find(d => d.boss === 'congregation').pos)`);
assert(sig2 === sig, 'same run seed → the congregation gathers in the same water');

// --- SUMMARY -------------------------------------------------------------------------------
console.log('');
if (failures.length === 0) {
  console.log(`GATE PASS — all checks green`);
} else {
  console.log(`GATE FAIL — ${failures.length} failure(s):`);
  for (const f of failures) console.log(`  · ${f}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
