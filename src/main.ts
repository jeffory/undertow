// main.ts — boot (plan 01 §1.3). Create world, renderer/scene/camera, start the
// fixed-timestep loop running UPDATE_ORDER, render at vsync, handle resize.

import { createWorld } from './core/world';
import { UPDATE_ORDER, SIM_SYSTEMS, debugInfoRef } from './core/systems';
import { parseTimescale, runSimSteps } from './core/time';
import { createRenderer, resizeRenderer, currentRenderContext } from './render/renderer';
import { initInput } from './game/input';
import { ensureLake, spawnAtLakeStart, dockPlayer } from './gen/lakeWorld';
import { initRun } from './run/run';
import { initSaveSystem, getSave, updateSave } from './core/save';
import { initSavePanel } from './ui/savePanel';
import { initQaAnnotate, isQaPaused } from './ui/qaAnnotate';
import { initTitleScreen } from './ui/titleScreen';
import { applySavedOptions, initOptionsMenu } from './ui/optionsMenu';
import { initAudio } from './audio/engine';
import { toggleBestiary } from './ui/bestiaryScreen';
import { initHud } from './ui/hud';
import { applyRunStartPassives } from './loot/runStart';
import { gradeForXp } from './loot/license';
import { descend } from './run/descent';
import { hookDragger, swampBoat } from './systems/boatCombat';
import { lighthouseFoot, townSlots } from './meta/hubStreet';
import { BUILDINGS } from './content/buildings';
import { restore, restoredIds, startingDreadFor } from './meta/restoration';
import { unlockContextFor } from './meta/runMeta';
import { emitTownEvent, peekTownEvents } from './meta/townEvents';
import { decant, decantsRemaining, useBottledLight } from './meta/bottledLight';
import { applyHubMeta } from './render/hubAtmosphere';
import { hubBeamState, setBeamAngle } from './render/sky';
import { kelpRenderState } from './render/kelp';
import { congregationRenderState } from './render/congregation';
import { hookCongregation } from './systems/castFlow';
import { seedCongregation } from './spawn/director';
import { massFraction, pullForceMultFor, attachedCount, gaffTearFor } from './bosses/congregation';
import { HEAVY_STAGGER } from './game/combat';
import { siltRenderState } from './render/silt';
import { zoneFogMultiplier } from './core/zones';
import { setShoreRestoration, shoreWarmth } from './render/water';
import { townBuildingCount, townInstanceCount, townModelCount } from './render/town';
import { PHASE_LENGTH_S } from './game/clock';
import * as THREE from 'three';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app container');

// Wire raw keyboard/mouse listeners (game/input.ts) — the input system reads
// them each fixed step. Without this, world.input/intent stay all-zero.
// (no arg → the module falls back to window)
initInput();

// Run seed: '?seed=N' pins it for reproducible screenshots/gates, otherwise a
// fresh random run (plan 03 §1.3 — the only non-deterministic step of a run).
const search = typeof location !== 'undefined' ? location.search : '';
function parseRunSeed(q: string): number {
  const m = /[?&]seed=(\d+)/.exec(q);
  if (m) return Number(m[1]) >>> 0;
  return (Math.random() * 2 ** 32) >>> 0;
}

const world = createWorld(parseRunSeed(search));

// M3: the run's world is real — generate the lake, start aboard the boat near
// the lighthouse islet, and stamp the run (clock epoch + initial ripple field).
ensureLake(world);
spawnAtLakeStart(world);
initRun(world);

// Load the save on boot (task t12 #5): IndexedDB row → zod-validated SaveGame.
// Once it's in hand, apply the run-start passives (license + equipped trinkets)
// to the fresh boot world.
// 05 §1.1/§1.7: the hub light and the shore water are read off the town's own
// memory at boot — every decant already poured is still dimming the beam, and
// every building already standing is still staining the water.
void initSaveSystem().then((save) => {
  applyRunStartPassives(world);
  applyHubMeta(save.metaState);
});

// ?timescale=N gate-driver hook (debug only): run N fixed steps per rAF frame
// so automated gates play faster than real time. FIXED_DT is untouched, so all
// spec timings and determinism are preserved. Default 1 = production path.
world.time.timescale = parseTimescale(search);

// M3 scaffold: '?mode=foot' URL param boots straight into foot mode — the
// keeper is docked onto the lighthouse islet (the boat stays parked beside it).
if (/[?&]mode=foot/.test(search)) {
  const start = world.lake!.islets[world.lake!.startIslet]!;
  dockPlayer(world, world.lake!.startIslet, { x: start.center.x, z: start.center.z });
}

// '?debug' drivability seam (M1 gate): expose the live world on window so the
// automated fight driver (tools/fight.mjs) can read and verify combat state.
if (/[?&]debug/.test(search)) {
  (window as unknown as { __world: unknown }).__world = world;
  // scene handle for QA drivers (object inventory / stray-geometry hunts)
  (window as unknown as { __scene: unknown }).__scene = currentRenderContext()?.scene ?? null;
  // the save panel (export/import) + the run-loop probe seams
  initSavePanel();
  (window as unknown as { __save: () => unknown }).__save = () => getSave();
  // M4 gate seams: open the bestiary ledger; push the license over a threshold
  // (drives the grade-up letter screenshot); force a sundry on every land.
  (window as unknown as { __bestiary: () => void }).__bestiary = () => toggleBestiary(world);
  (window as unknown as { __setLicenseXp: (xp: number) => void }).__setLicenseXp = (xp: number) => {
    void updateSave((s) => ({ ...s, license: { xp, grade: gradeForXp(xp) } }));
  };
  (window as unknown as { __setForceDrop: (on: boolean) => void }).__setForceDrop = (on: boolean) => {
    world.run.forceDrop = on;
  };
  // M3 round 3 gate seams (tools/m3r3-probe.mjs): jump the Night Clock to a
  // phase (by moving the run epoch back — the clock is a pure function of
  // elapsed, so this is exactly "time passed"), hook a Dragger on demand,
  // swamp the hull, and descend a sinkhole.
  (window as unknown as { __setPhase: (p: string) => number }).__setPhase = (p: string) => {
    const idx = ['dusk', 'night', 'deepNight', 'falseDawn'].indexOf(p);
    const back = Math.max(0, idx) * PHASE_LENGTH_S + 1;
    world.run.startedAt = world.time.elapsed - back;
    world.clock.runStartMs = world.run.startedAt * 1000;
    return back;
  };
  (window as unknown as { __hookDragger: () => boolean }).__hookDragger = () => hookDragger(world);
  (window as unknown as { __swamp: () => void }).__swamp = () => swampBoat(world);
  (window as unknown as { __descend: () => number }).__descend = () => descend(world);
  (window as unknown as { __toSinkhole: () => unknown }).__toSinkhole = () => {
    const s = world.lake?.sinkholes[0];
    if (!s) return null;
    world.boat.x = s.mouth.x;
    world.boat.z = s.mouth.z;
    world.boat.speed = 0;
    return s;
  };
  // M5 gate seams (tools/m5-probe.mjs): read the town slice, inject Memories
  // through the same save write path the receipt uses, walk to the lighthouse
  // door, open/close the register, and pay for a building headlessly.
  (window as unknown as { __meta: () => unknown }).__meta = () => {
    const save = getSave();
    if (!save) return null;
    return {
      version: save.version,
      metaState: save.metaState,
      rigLoadout: save.rigLoadout,
      box: save.box,
      restored: restoredIds(save.metaState),
      startingDread: startingDreadFor(save.metaState),
      // buildings standing on the street, however they are drawn: `instances`
      // is the count the save's restored list must agree with, `stubs` and
      // `models` say how many are still the primitive vs. the generated mesh.
      instances: townBuildingCount(),
      stubs: townInstanceCount(),
      models: townModelCount(),
      events: peekTownEvents(),
    };
  };
  (window as unknown as { __grantMemories: (n: number) => void }).__grantMemories = (n: number) => {
    void updateSave((s) => ({
      ...s,
      metaState: { ...s.metaState, memories: Math.max(0, s.metaState.memories + n) },
    }));
  };
  (window as unknown as { __toDoor: () => unknown }).__toDoor = () => {
    const lake = world.lake;
    if (!lake) return null;
    const iso = lake.islets[lake.startIslet];
    if (!iso) return null;
    const door = lighthouseFoot(iso);
    dockPlayer(world, lake.startIslet, { x: door.x, z: door.z });
    world.player.x = door.x;
    world.player.z = door.z;
    return door;
  };
  (window as unknown as { __openTown: (on: boolean) => void }).__openTown = (on: boolean) => {
    world.town.open = on;
  };
  // M5 round 2 gate seams (tools/m5b-probe.mjs): drop a sundry into the box (so
  // the rig-up has something collected to requisition), open the rig-up register
  // directly, and walk the keeper to a specific building's doorstep (for the
  // bark gate).
  (window as unknown as { __grantSundry: (s: unknown) => void }).__grantSundry = (s: unknown) => {
    void updateSave((save) => ({ ...save, box: [...save.box, s as never] }));
  };
  (window as unknown as { __openRigUp: () => void }).__openRigUp = () => {
    world.town.open = true;
    requestAnimationFrame(() => {
      // the rig-up is the SECOND door-nav button (t21 appended DECANT third)
      document.querySelector('#restoration .door-nav button:nth-child(2)')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  (window as unknown as { __toBuilding: (id: string) => unknown }).__toBuilding = (id: string) => {
    const lake = world.lake;
    if (!lake) return null;
    const iso = lake.islets[lake.startIslet];
    if (!iso) return null;
    const slot = townSlots(iso, BUILDINGS.length)[BUILDINGS.findIndex((b) => b.id === id)];
    if (!slot) return null;
    dockPlayer(world, lake.startIslet, { x: slot.x, z: slot.z });
    world.player.x = slot.x;
    world.player.z = slot.z;
    return slot;
  };
  // t20 seam (tools/town-street.mjs): the Schoolhouse's ledger row is gated on
  // `zoneReached: 3`, which meta/runMeta.ts DERIVES from the run log rather
  // than storing — so a shot driver that wants the whole street standing has to
  // put a deep run in the log. This appends one finished run that descended
  // `n − 1` sinkholes; it touches nothing but the save's run history.
  (window as unknown as { __logDeepRun: (n: number) => void }).__logDeepRun = (n: number) => {
    void updateSave((s) => ({
      ...s,
      runs: [
        ...s.runs,
        {
          seed: 0,
          source: 'random' as const,
          clockPhaseEnd: 'night' as const,
          haul: [],
          extracted: true,
          memoriesTotal: 0,
          xpTotal: 0,
          dreadPeak: 0,
          startedAtDread: 0,
          draggersLand: 0,
          bagmanCaught: false,
          sinkholesDescended: Math.max(0, n - 1),
          bestiary: [],
          sundries: [],
        },
      ],
    }));
  };
  (window as unknown as { __restore: (id: string) => unknown }).__restore = (id: string) => {
    const save = getSave();
    if (!save) return { ok: false, reason: 'no-save' };
    const out = restore(save.metaState, id, {
      atRun: save.meta.runsCompleted,
      ctx: unlockContextFor(save),
    });
    if (!out.ok) return { ok: false, reason: out.reason };
    if (out.event) emitTownEvent(out.event);
    void updateSave((s) => ({ ...s, metaState: out.meta }));
    // the ledger's own pay path pushes the same seam (05 §1.1: the shore water
    // reddens with the restored count) — the gate seam must not skip it
    applyHubMeta(out.meta);
    return { ok: true, event: out.event };
  };
  // t21 seams (tools/m5c-probe.mjs): pour a decant headlessly (the same path
  // the FORM 9-L button takes), pop a Bottled Light mid-fight, and read what
  // the beam / the shore water are worth right now.
  (window as unknown as { __decant: () => unknown }).__decant = () => {
    const save = getSave();
    if (!save) return { ok: false, reason: 'no-save' };
    const out = decant(save.metaState);
    if (!out.ok || !out.item) return { ok: false, reason: out.reason };
    if (out.event) emitTownEvent(out.event);
    const item = out.item;
    void updateSave((s) => ({
      ...s,
      metaState: out.meta,
      box: [...s.box, item],
      rigLoadout: {
        ...s.rigLoadout,
        consumables: s.rigLoadout.consumables.includes(item.id)
          ? s.rigLoadout.consumables
          : [...s.rigLoadout.consumables, item.id],
      },
    }));
    applyHubMeta(out.meta);
    return { ok: true, event: out.event, item, remaining: decantsRemaining(out.meta) };
  };
  (window as unknown as { __grantLight: (n: number) => number }).__grantLight = (n: number) => {
    world.consumables.bottledLight = Math.max(0, Math.floor(n));
    return world.consumables.bottledLight;
  };
  (window as unknown as { __useLight: () => unknown }).__useLight = () => {
    const ev = useBottledLight(world);
    if (ev) emitTownEvent(ev);
    return ev;
  };
  (window as unknown as { __beamAngle: (a: number) => void }).__beamAngle = (a: number) => {
    setBeamAngle(a);
  };
  // A/B seam for the shore-stain shot pair (tools/m5c-shore-shot.mjs): flip the
  // restored-count the WATER is reading without touching the save, so the two
  // frames differ by the stain alone and by nothing else in the scene.
  (window as unknown as { __setShoreWarm: (n: number) => number }).__setShoreWarm = (n: number) => {
    setShoreRestoration(n);
    return shoreWarmth();
  };
  (window as unknown as { __hubLight: () => unknown }).__hubLight = () => ({
    beam: hubBeamState(),
    shoreWarm: shoreWarmth(),
    charges: world.consumables.bottledLight,
  });
  // t24 / M6 seams (tools/m6-probe.mjs): read what the Kelp Graves is worth
  // right now (field size, instanced-mesh draw count, silt layer), park the boat
  // beside the biggest kelp cluster for the zone-2 look shot, and set up a
  // guaranteed routed drag straight through a column for the snag shot.
  (window as unknown as { __kelp: () => unknown }).__kelp = () => {
    const lake = world.lake;
    return {
      zone: world.run.zone,
      columns: lake ? lake.kelp.length : 0,
      clusters: lake ? new Set(lake.kelp.map((k) => k.cluster)).size : 0,
      render: kelpRenderState(),
      silt: siltRenderState(),
      fogZoneMult: zoneFogMultiplier(world.run.zone),
    };
  };
  // The cluster with the most columns, and a point of open water just outside it.
  (window as unknown as { __toKelp: () => unknown }).__toKelp = () => {
    const lake = world.lake;
    if (!lake || lake.kelp.length === 0) return null;
    const byCluster = new Map<number, { x: number; z: number; n: number }>();
    for (const col of lake.kelp) {
      const acc = byCluster.get(col.cluster) ?? { x: 0, z: 0, n: 0 };
      acc.x += col.x;
      acc.z += col.z;
      acc.n++;
      byCluster.set(col.cluster, acc);
    }
    let best = { x: 0, z: 0, n: 0, id: -1 };
    for (const [id, acc] of byCluster) {
      if (acc.n > best.n) best = { x: acc.x / acc.n, z: acc.z / acc.n, n: acc.n, id };
    }
    // park just outside the cluster on the +Z side, bow into the weed, so a
    // chase-height camera behind the boat frames the field the way play does
    world.boat.x = best.x;
    world.boat.z = best.z + 16;
    world.boat.speed = 0;
    world.boat.heading = Math.PI;
    return best;
  };
  // Park the hauled end on one side of a column and the catch far beyond it on
  // the other, so the next constraint step pulls the hull straight through the
  // stalk — which is exactly what the snag resolver has to refuse.
  (window as unknown as { __kelpDrag: () => unknown }).__kelpDrag = () => {
    const lake = world.lake;
    const fight = world.tether.fights[0];
    if (!lake || lake.kelp.length === 0 || !fight) return null;
    // the column with the most open water around it (furthest from any islet)
    let col = lake.kelp[0]!;
    let bestClear = -1;
    for (const c of lake.kelp) {
      let near = Infinity;
      for (const iso of lake.islets) {
        const d = Math.hypot(c.x - iso.center.x, c.z - iso.center.z);
        if (d < near) near = d;
      }
      if (near > bestClear) {
        bestClear = near;
        col = c;
      }
    }
    world.boat.x = col.x - 5;
    world.boat.z = col.z;
    world.boat.speed = 0;
    if (world.fish) {
      world.fish.x = col.x + fight.L + 8;
      world.fish.z = col.z;
    }
    return { column: col.id, at: { x: col.x, z: col.z }, boat: { x: world.boat.x, z: world.boat.z } };
  };

  // t25 / M6 BOSS seams (tools/m6boss-probe.mjs): read what THE CONGREGATION is
  // worth right now, park the boat on its ripple, hook it through the real SET
  // path, land a gaff on the swarm centre, and drain the centre's pool so the
  // LAND prompt arms without a five-minute fight at 1x.
  (window as unknown as { __congregation: () => unknown }).__congregation = () => {
    const c = world.congregation;
    const ripple = world.disturbances.find((d) => d.boss === 'congregation') ?? null;
    return {
      zone: world.run.zone,
      seeded: world.run.bossSeeded,
      ripple: ripple ? { id: ripple.id, pos: ripple.pos, state: ripple.state } : null,
      active: c.active,
      landed: c.landed,
      fightId: c.fightId,
      members: c.members.length,
      attached: attachedCount(c),
      massPool: c.massPool,
      massPoolMax: c.massPoolMax,
      massFraction: massFraction(c),
      gaffTears: c.gaffTears,
      pullForceMult: c.active ? pullForceMultFor(c) : null,
      burstCount: c.burstCount,
      fightPullMult: world.tether.fights[0]?.pullForceMult ?? null,
      haul: world.run.haul.length,
      invoice: {
        active: c.invoice.active,
        rowIndex: c.invoice.rowIndex,
        done: c.invoice.done,
        fillers: c.invoice.fillers,
      },
      render: congregationRenderState(),
    };
  };
  (window as unknown as { __seedCongregation: () => boolean }).__seedCongregation = () =>
    seedCongregation(world);
  (window as unknown as { __toCongregation: () => unknown }).__toCongregation = () => {
    const d = world.disturbances.find((x) => x.boss === 'congregation');
    if (!d) return null;
    world.boat.x = d.pos.x;
    world.boat.z = d.pos.z + 5;
    world.boat.speed = 0;
    world.boat.heading = Math.PI;
    world.run.debugCastPoint = { x: d.pos.x, z: d.pos.z };
    return { id: d.id, pos: d.pos, boat: { x: world.boat.x, z: world.boat.z } };
  };
  (window as unknown as { __hookCongregation: () => unknown }).__hookCongregation = () => {
    const d = world.disturbances.find((x) => x.boss === 'congregation');
    if (!d) return null;
    hookCongregation(world, d);
    const c = world.congregation;
    return { active: c.active, members: c.members.length, massPool: c.massPool, fightId: c.fightId };
  };
  (window as unknown as { __congregationGaff: (heavy?: boolean) => number }).__congregationGaff = (
    heavy = false,
  ) => {
    // A gaff landing on the swarm centre, through the SAME rule the system
    // applies to a real swing (gaffTearFor). It does not push a HitEvent: an
    // out-of-band hit injected between frames is drained by fishAI at the top of
    // the next tick, before the boss system's slot ever sees it — the in-play
    // producer is world.combat.hits inside a tick, which the unit tests drive.
    world.congregation.gaffTears += gaffTearFor(heavy ? HEAVY_STAGGER : 0);
    return world.congregation.gaffTears;
  };
  (window as unknown as { __congregationExhaust: (frac?: number) => number }).__congregationExhaust =
    (frac = 0) => {
      const f = world.fish;
      if (!f) return -1;
      f.stamina = Math.max(0, f.tether.maxStamina * frac);
      if (f.stamina <= 0) f.tether.exhausted = true;
      return f.stamina;
    };
  // Bring the hooked swarm to the gunwale so the ordinary LAND prompt arms.
  (window as unknown as { __congregationToGunwale: () => unknown }).__congregationToGunwale = () => {
    const fight = world.tether.fights[0];
    const f = world.fish;
    if (!fight || !f) return null;
    fight.L = 1.2;
    fight.tension = 0;
    const at = fight.anchor === 'boat' ? world.boat : world.player;
    f.x = at.x + 0.9;
    f.z = at.z;
    return { L: fight.L, eligible: fight.land.eligible };
  };

  (window as unknown as { __toScreen: (x: number, z: number) => { x: number; y: number } }).__toScreen =
    (x: number, z: number) => {
      const ctx = currentRenderContext();
      if (!ctx) return { x: 0, y: 0 };
      const v = new THREE.Vector3(x, 0, z).project(ctx.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    };
}

const ctx = createRenderer(app);
// apply saved CIRCULAR 4 options on boot (render scale / murk / post / reel stance)
applySavedOptions();
// wire the renderer's info counters into the debug overlay
debugInfoRef.current = ctx.renderer.info;

// debug seam: also expose the live THREE scene + camera so scene-graph probes
// can read the loaded assets' tri counts / positions and reframe for close-ups.
if (typeof location !== 'undefined' && /[?&]debug/.test(location.search)) {
  (window as unknown as { __scene: unknown }).__scene = ctx.scene;
  (window as unknown as { __camera: unknown }).__camera = ctx.camera;
}

// QA annotate overlay (?qa / ?debug): Q freezes the sim, click pins a note
// carrying seed + tick + scene hit, written to qa-notes/ by the dev server.
initQaAnnotate(world);

// Diegetic HUD (corner chips + tension gauge) — shown in ALL modes, debug or not.
initHud();

// CIRCULAR 4 options menu: Esc opens/closes it in-game in every mode.
initOptionsMenu();

// Procedural audio (t13): binds the first-gesture unlock — browsers block an
// AudioContext built outside a real click. SCHEDULE B drives it from there.
initAudio();

// M2.5 shell: title screen + opening story cards over the live drifting lake
// (docs/story/title-menu.md / opening.md). Debug and gate paths (?debug, ?qa)
// boot straight into gameplay so every automated driver stays untouched.
if (!/[?&](debug|qa)\b/.test(search)) initTitleScreen();

window.addEventListener('resize', () => resizeRenderer(ctx.renderer));

// sim systems run at fixed DT; render+ui run once per display frame (plan 01
// §3.4). The sim/present split is derived from UPDATE_ORDER (SIM_SYSTEMS = the
// index of the render system) so newly-added sim systems (castFlow, the run
// terminal, …) always advance on fixed steps — never stuck once-per-frame.
const SIM_COUNT = SIM_SYSTEMS;
const PRESENT_INDEX = SIM_COUNT;

function frame(now: number): void {
  // runSimSteps advances world.time.elapsed per fixed step (not per display
  // frame), so elapsed-sampling systems behave identically however the steps
  // batch into frames (determinism, spec 8.3).
  if (isQaPaused()) {
    // QA annotate holds the sim so a click resolves against the frame actually
    // on screen. Park the clock at `now` each frame so resuming doesn't replay
    // the pause as catch-up steps.
    world.time.lastReal = now;
  } else {
    runSimSteps(world.time, now, (dt) => {
      for (let s = 0; s < SIM_COUNT; s++) {
        const system = UPDATE_ORDER[s];
        if (system) system(world, dt);
      }
    });
  }
  // present at display rate regardless of sim steps
  for (let s = PRESENT_INDEX; s < UPDATE_ORDER.length; s++) {
    const system = UPDATE_ORDER[s];
    if (system) system(world, world.time.dt);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
