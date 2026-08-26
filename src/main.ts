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
import { townshipRenderState } from './render/township';
import { roofForIslet, postOfficeRoof, postOfficeMarker } from './gen/township';
import { envTextOnScreen } from './ui/envTextOverlay';
import { envReadCount } from './systems/envText';
import { createDisturbance } from './run/disturbance';
import { congregationRenderState } from './render/congregation';
import { snatcherRenderState } from './render/snatcher';
import { snatcherToastOnScreen } from './ui/barkOverlay';
import { haulPoint } from './systems/snatcher';
import { postmasterArena, atLetterbox, reverseFightConfig } from './systems/postmaster';
import { postmasterRenderState } from './render/postmaster';
import {
  postmasterBubbleOnScreen,
  postmasterPromptOnScreen,
} from './ui/postmasterTelegraph';
import {
  postmasterLines,
  postmasterTextFor,
  FORWARDING_ADDRESS_TEXT,
} from './content/postmasterLines';
import {
  CUT_REACH,
  GAFF_POOL,
  POSTMASTER_TARGET_ID,
  cutArmed,
  postmasterGaffCost,
  cutProgress,
  postmasterFighting,
  summonProgress,
} from './bosses/postmaster';
import {
  SNATCHER_GAFF_HP,
  SNATCHER_TARGET_ID,
  STEAL_SECONDS,
  SURFACE_DOWN,
  SURFACE_PERIOD,
  snatcherGaffCost,
  stealFraction,
} from './enemies/snatcher';
import { snatcherLines, snatcherPlaceholderCount } from './content/snatcherLines';
import { hookCongregation, setCatchAt } from './systems/castFlow';
import { seedCongregation } from './spawn/director';
import { massFraction, pullForceMultFor, attachedCount, gaffTearFor } from './bosses/congregation';
import { HEAVY_STAGGER } from './game/combat';
import { siltRenderState } from './render/silt';
import { zoneFogMultiplier, zoneFogTint, zoneSkyDarken, zoneAmbientScale } from './core/zones';
import { choirRenderState, choirMoteWorld } from './render/choir';
import { whistlerRenderState } from './render/whistler';
import { whistlerPromptOnScreen } from './ui/whistlerPrompt';
import { choirCursor } from './systems/choir';
import { whistlerFightConfig, keeperPoint, landmarks, DEEP_CLEARANCE } from './systems/whistler';
import {
  CHOIR_MOTE_COUNT,
  choirMoteAt,
  singIntervalFor,
  singerFor,
  singPitchFor,
} from './gen/choir';
import { CHOIR_AMBIENT, choirLines, choirPlaceholderCount } from './content/choirLines';
import {
  BAND_OFFSETS,
  bandRings,
  CUT_REACH as WHISTLER_CUT_REACH,
  GAFF_POOL as WHISTLER_GAFF_POOL,
  ROAM_MARGIN,
  SPAWN_DIST,
  WHISTLER_TARGET_ID,
  cutArmed as whistlerCutArmed,
  cutProgress as whistlerCutProgress,
  whistlerFighting,
  whistlerGaffCost,
  nearestLandmarkDistance,
} from './enemies/whistler';
import {
  darknessActive,
  discFraction,
  lanternOrigin,
  lanternRadius,
  lanternRadiusFor,
  withinLantern,
} from './game/darkness';
import { setShoreRestoration, shoreWarmth } from './render/water';
import { townBuildingCount, townInstanceCount, townModelCount } from './render/town';
import { groundYAt } from './render/lake';
import { distanceToHull } from './core/poly';
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
          forwardingAddress: false,
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

  // t28 / M7 SNATCHER seams (tools/m7b-probe.mjs): read the second mouth,
  // drop a ripple beside the hull in the drowned street and hook it through the
  // REAL SET path, arm the director now instead of in 6-12 s, land a gaff on the
  // Snatcher through the same rule a real swing uses, and force the surfacing
  // window open so the kill is testable without waiting out the cycle.
  (window as unknown as { __snatcher: () => unknown }).__snatcher = () => {
    const s = world.snatcher;
    const fight = world.tether.fights.find((f) => f.id === s.fightId) ?? null;
    const primary = world.tether.fights[0] ?? null;
    return {
      zone: world.run.zone,
      phase: world.snatcher.phase,
      fightId: s.fightId,
      pos: { x: s.x, z: s.z },
      speed: s.speed,
      surfaced: s.surfaced,
      surfaceTimer: s.surfaceTimer,
      steal: s.steal,
      stealFraction: stealFraction(s),
      stealSeconds: STEAL_SECONDS,
      gaffHp: s.gaffHp,
      gaffHits: s.gaffHits,
      gaffHpMax: SNATCHER_GAFF_HP,
      spawnTimer: s.spawnTimer,
      spawnDelay: s.spawnDelay,
      origin: { x: s.originX, z: s.originZ },
      armedFor: s.armedFor,
      launches: s.launches,
      killed: s.killed,
      stolen: s.stolen,
      species: s.params ? s.params.speciesId : null,
      weightKg: s.params ? s.params.weightKg : null,
      // the fight, seen from outside: what the rider is doing to it
      fight: primary
        ? {
            id: primary.id,
            species: primary.species,
            anchor: primary.anchor,
            tension: primary.tension,
            pullForceMult: primary.pullForceMult ?? null,
            rider: primary.rider ?? null,
            L: primary.L,
          }
        : null,
      haulAt: fight ? haulPoint(world, fight) : null,
      distToHaul: fight
        ? Math.hypot(haulPoint(world, fight).x - s.x, haulPoint(world, fight).z - s.z)
        : null,
      fish: world.fish ? { x: world.fish.x, z: world.fish.z } : null,
      lure: world.lure.count,
      haul: world.run.haul.length,
      inventory: world.run.inventory.length,
      runStolen: world.run.stolen,
      dread: world.dread,
      moment: world.township.pendingMoment,
      toast: snatcherToastOnScreen(),
      lines: snatcherLines().map((l) => ({ trigger: l.trigger, text: l.text, placeholder: l.placeholder })),
      placeholders: snatcherPlaceholderCount(),
      render: snatcherRenderState(),
    };
  };
  // Park the hull in the drowned street and hook a ripple there through the
  // ordinary SET path (systems/castFlow.ts setCatchAt) — the same precedent
  // __hookCongregation set. Returns what got hooked.
  (window as unknown as { __hookStreet: () => unknown }).__hookStreet = () => {
    const lake = world.lake;
    if (!lake || !lake.street) return null;
    const st = lake.street;
    const along = st.length * 0.5;
    const at = { x: st.origin.x + st.dir.x * along, z: st.origin.z + st.dir.z * along };
    world.boat.x = at.x;
    world.boat.z = at.z;
    world.boat.speed = 0;
    world.boat.heading = Math.atan2(st.dir.z, st.dir.x);
    const pos = { x: at.x + st.dir.x * 6, z: at.z + st.dir.z * 6 };
    const d = createDisturbance(world.run.nextDisturbanceId++, pos, 2, 4242);
    world.disturbances.push(d);
    setCatchAt(world, d);
    const fight = world.tether.fights[0] ?? null;
    return fight
      ? {
          fightId: fight.id,
          species: fight.species,
          anchor: fight.anchor,
          catch: world.run.activeCatch,
          boat: { x: world.boat.x, z: world.boat.z },
        }
      : null;
  };
  // Arm the director NOW: the launch happens on the next sim tick instead of
  // after the seeded 6-12 s. The launch itself still runs the real code path.
  (window as unknown as { __armSnatcher: () => unknown }).__armSnatcher = () => {
    const fight = world.tether.fights[0];
    if (!fight) return null;
    world.snatcher.armedFor = fight.id;
    world.snatcher.spawnTimer = 0;
    return { fightId: fight.id, spawnTimer: 0 };
  };
  // Hold the surfacing window open (or shut) so the gaff is testable without
  // waiting out the down/up cycle. Same cycle, parked at a chosen point.
  (window as unknown as { __snatcherSurface: (up?: boolean) => unknown }).__snatcherSurface = (
    up = true,
  ) => {
    const s = world.snatcher;
    s.surfaceTimer = up ? SURFACE_DOWN + 0.01 : 0;
    s.surfaced = up;
    return { surfaceTimer: s.surfaceTimer, surfaced: s.surfaced, period: SURFACE_PERIOD };
  };
  // A gaff landing on the Snatcher, through the SAME rule the system applies to
  // a real swing (snatcherGaffCost). Like __congregationGaff it does not push a
  // HitEvent — an out-of-band hit injected between frames is not what the
  // in-play producer (world.combat.hits inside a tick) does; the unit tests
  // drive that. Returns the pool left.
  (window as unknown as { __snatcherGaff: (heavy?: boolean) => number }).__snatcherGaff = (
    heavy = false,
  ) => {
    const s = world.snatcher;
    if (s.phase !== 'latched') return -1;
    s.gaffHits++;
    s.gaffHp -= snatcherGaffCost(heavy ? HEAVY_STAGGER : 0);
    return s.gaffHp;
  };
  // Push a REAL HitEvent onto this tick's array, tagged for the Snatcher — the
  // in-play producer's shape, for the gate that wants the system's own kill path.
  (window as unknown as { __snatcherHit: (heavy?: boolean) => unknown }).__snatcherHit = (
    heavy = false,
  ) => {
    world.combat.hits.push({
      targetId: SNATCHER_TARGET_ID,
      damage: heavy ? 18 : 6,
      knockbackX: 0,
      knockbackZ: 0,
      stagger: heavy ? HEAVY_STAGGER : 0,
    });
    return { hits: world.combat.hits.length };
  };
  // Run the steal clock down to `left` seconds so the theft is reachable in a
  // gate without eight seconds of real time at 1x.
  (window as unknown as { __snatcherSteal: (left?: number) => number }).__snatcherSteal = (
    left = 0.05,
  ) => {
    const s = world.snatcher;
    if (s.phase !== 'latched') return -1;
    s.steal = Math.max(0, left);
    return s.steal;
  };

  // t29 / M7 BOSS seams (tools/m7c-probe.mjs): read the reverse fight from
  // outside, park the hull at the Post Office roof so a REAL B tap docks onto
  // it, walk the keeper onto the letterbox, land a real gaff HitEvent on him,
  // pull the current phase timer to zero so the delivery loop is reachable
  // without waiting it out, and run the breath down so his own win is testable.
  (window as unknown as { __postmaster: () => unknown }).__postmaster = () => {
    const s = world.postmaster;
    const arena = postmasterArena(world);
    const fight = world.tether.fights.find((f) => f.id === s.fightId) ?? null;
    const save = getSave();
    return {
      zone: world.run.zone,
      phase: s.phase,
      fighting: postmasterFighting(s),
      fightId: s.fightId,
      roofId: s.roofId,
      pos: { x: s.x, z: s.z },
      speed: s.speed,
      timer: s.timer,
      drags: s.drags,
      rotationStart: s.rotationStart,
      route: { x: s.routeX, z: s.routeZ },
      angle: s.angle,
      reeling: s.reeling,
      gaffHp: s.gaffHp,
      gaffHpMax: GAFF_POOL,
      gaffHits: s.gaffHits,
      cutArmed: cutArmed(s),
      cutHeld: s.cutHeld,
      cutProgress: cutProgress(s),
      cutReach: CUT_REACH,
      summonHeld: s.summonHeld,
      summonProgress: summonProgress(s),
      summoned: s.summoned,
      cut: s.cut,
      delivered: s.delivered,
      card: s.card,
      cardText: s.card ? postmasterTextFor(s.card) : null,
      cardTimer: s.cardTimer,
      species: s.params ? s.params.speciesId : null,
      weightKg: s.params ? s.params.weightKg : null,
      distToPlayer: Math.hypot(s.x - world.player.x, s.z - world.player.z),
      // the fight, seen from outside: the reverse configuration itself
      config: reverseFightConfig(world),
      fight: fight
        ? {
            id: fight.id,
            species: fight.species,
            anchor: fight.anchor,
            L: fight.L,
            tension: fight.tension,
            reelRate: fight.reelRate ?? null,
            snapBehavior: fight.snapBehavior ?? null,
            aiReel: fight.aiReel ?? false,
            reelActive: fight.reel.active,
            cutProgress: fight.cut.progress,
          }
        : null,
      fights: world.tether.fights.length,
      arena: arena
        ? {
            roofId: arena.roof.id,
            isletId: arena.roof.isletId,
            building: arena.roof.building,
            marker: arena.marker,
            atMarker: atLetterbox(world, arena),
          }
        : null,
      mode: world.mode,
      dockedIslet: world.dockedIslet,
      player: { x: world.player.x, z: world.player.z, hp: world.player.hp },
      water: {
        active: world.water.active,
        breath: world.water.breath,
        lethal: world.water.lethal,
      },
      lure: world.lure.count,
      inventory: world.run.inventory.length,
      lastDrop: world.run.inventory[world.run.inventory.length - 1] ?? null,
      forwardingAddress: world.run.forwardingAddress,
      deliveredBy: world.run.deliveredBy,
      savedAddress: save ? save.metaState.forwardingAddress : null,
      runEnded: world.run.ended,
      dread: world.dread,
      lines: postmasterLines().map((l) => ({ verb: l.verb, line: l.line, canonical: l.isCanonical })),
      dropText: FORWARDING_ADDRESS_TEXT,
      bubble: postmasterBubbleOnScreen(),
      prompt: postmasterPromptOnScreen(),
      render: postmasterRenderState(),
      moment: world.township.pendingMoment,
    };
  };
  // Bring the hull to the POST OFFICE roof's edge — inside DOCK_RANGE of its
  // hull, so the real B verb is what actually docks. Same shape as __toRoof.
  (window as unknown as { __toPostOffice: () => unknown }).__toPostOffice = () => {
    const lake = world.lake;
    if (!lake || !lake.street) return null;
    const roof = postOfficeRoof(lake.roofs);
    if (!roof) return null;
    const iso = lake.islets[roof.isletId];
    if (!iso) return null;
    const v = iso.poly[0]!;
    const out = Math.hypot(v.x - roof.pos.x, v.z - roof.pos.z) || 1;
    world.boat.x = roof.pos.x + ((v.x - roof.pos.x) / out) * (out + 1.05);
    world.boat.z = roof.pos.z + ((v.z - roof.pos.z) / out) * (out + 1.05);
    world.boat.speed = 0;
    world.boat.heading = Math.atan2(roof.pos.z - world.boat.z, roof.pos.x - world.boat.x);
    return {
      roof: { id: roof.id, isletId: roof.isletId, building: roof.building },
      marker: postOfficeMarker(lake.street, roof),
      boat: { x: world.boat.x, z: world.boat.z },
      edgeGap: distanceToHull({ x: world.boat.x, z: world.boat.z }, iso.hull),
    };
  };
  // Walk the docked keeper onto the letterbox (the arena marker). Only moves the
  // body — the summon itself is a real held E through game/input.ts.
  (window as unknown as { __toLetterbox: () => unknown }).__toLetterbox = () => {
    const arena = postmasterArena(world);
    if (!arena) return null;
    world.player.x = arena.marker.x;
    world.player.z = arena.marker.z;
    world.player.vx = 0;
    world.player.vz = 0;
    return { marker: arena.marker, atMarker: atLetterbox(world, arena) };
  };
  // A REAL HitEvent on this tick's array, tagged for the Postmaster — the
  // in-play producer's own shape (the unit tests drive the arc itself).
  (window as unknown as { __postmasterHit: (heavy?: boolean) => unknown }).__postmasterHit = (
    heavy = false,
  ) => {
    world.combat.hits.push({
      targetId: POSTMASTER_TARGET_ID,
      damage: heavy ? 18 : 6,
      knockbackX: 0,
      knockbackZ: 0,
      stagger: heavy ? HEAVY_STAGGER : 0,
    });
    return { hits: world.combat.hits.length, gaffHp: world.postmaster.gaffHp };
  };
  // Pull the current phase timer to zero so the next phase begins on the next
  // sim tick. The phase TRANSITION and everything it does are the real code.
  (window as unknown as { __postmasterSkip: () => unknown }).__postmasterSkip = () => {
    const s = world.postmaster;
    if (!postmasterFighting(s)) return null;
    s.timer = 0;
    return { phase: s.phase };
  };
  // Run the breath down so his own win is reachable in a gate without fifteen
  // seconds of real time underwater.
  (window as unknown as { __postmasterBreath: (left?: number) => number }).__postmasterBreath = (
    left = 0.05,
  ) => {
    world.water.breath = Math.max(0, left);
    return world.water.breath;
  };
  // Bring HIM to arm's length of the keeper and point the keeper at him — the
  // `__congregationToGunwale` precedent. A driver cannot chase a boss around a
  // roof at wall speed, and the swing/arc/hold it then drives are the real ones.
  (window as unknown as { __postmasterToReach: (d?: number) => unknown }).__postmasterToReach = (
    d = 1.1,
  ) => {
    const s = world.postmaster;
    if (!postmasterFighting(s)) return null;
    const p = world.player;
    s.x = p.x;
    s.z = p.z + d;
    s.speed = 0;
    p.facing = Math.atan2(s.x - p.x, s.z - p.z); // look at him
    world.combat.swingFacing = p.facing;
    return { dist: Math.hypot(s.x - p.x, s.z - p.z), reach: CUT_REACH, facing: p.facing };
  };
  // A gaff landing on him through the SAME rule the system applies to a real
  // swing (postmasterGaffCost). Like __congregationGaff / __snatcherGaff it does
  // NOT push a HitEvent — combat clears that array at the top of every tick, so
  // an out-of-band injection is not what the in-play producer does. Returns the
  // grip left.
  (window as unknown as { __postmasterGaff: (heavy?: boolean) => number }).__postmasterGaff = (
    heavy = false,
  ) => {
    const s = world.postmaster;
    if (!postmasterFighting(s)) return -1;
    s.gaffHits++;
    s.gaffHp -= postmasterGaffCost(heavy ? HEAVY_STAGGER : 0);
    return s.gaffHp;
  };

  // t27 / M7 TOWNSHIP seams (tools/m7-probe.mjs): read what the drowned Hollow
  // is worth right now, row the boat down the drowned street, park it at a
  // roof's edge so a REAL B tap docks onto the slates, and drop a ripple in the
  // street beside the roof so the ordinary foot cast flow has something to cast
  // at from up there.
  (window as unknown as { __township: () => unknown }).__township = () => {
    const lake = world.lake;
    const roofs = lake ? lake.roofs : [];
    const roof = lake ? roofForIslet(roofs, world.dockedIslet) : null;
    return {
      zone: world.run.zone,
      roofs: roofs.length,
      steeples: roofs.filter((r) => r.slot === 'steeple').length,
      marquees: roofs.filter((r) => r.slot === 'marquee').length,
      lamps: lake ? lake.lamps.length : 0,
      envPoints: lake ? lake.envPoints.length : 0,
      islets: lake ? lake.islets.length : 0,
      roofIslets: lake ? lake.islets.filter((i) => i.kind === 'roof').length : 0,
      street: lake?.street ?? null,
      render: townshipRenderState(),
      fogTint: zoneFogTint(world.run.zone),
      mode: world.mode,
      dockedIslet: world.dockedIslet,
      onRoof: world.township.onRoof,
      standingOn: roof ? { id: roof.id, slot: roof.slot, building: roof.building } : null,
      nearEnv: world.township.nearEnv,
      envRead: envReadCount(world),
      env: envTextOnScreen(),
      player: { x: world.player.x, z: world.player.z },
      boat: { x: world.boat.x, z: world.boat.z },
      groundY: world.dockedIslet != null ? groundYAt(world, world.player.x, world.player.z) : null,
    };
  };
  // Park the hull at the head of the drowned street, bow down the road, so a
  // chase-height camera frames the flooded main street the way play does.
  (window as unknown as { __toStreet: (t?: number) => unknown }).__toStreet = (t = 0.12) => {
    const lake = world.lake;
    if (!lake || !lake.street) return null;
    const st = lake.street;
    const along = st.length * Math.max(0, Math.min(1, t));
    world.boat.x = st.origin.x + st.dir.x * along;
    world.boat.z = st.origin.z + st.dir.z * along;
    world.boat.speed = 0;
    world.boat.heading = Math.atan2(st.dir.z, st.dir.x);
    const marquee = lake.envPoints.find((p) => p.key === 'marquee') ?? null;
    return { at: { x: world.boat.x, z: world.boat.z }, heading: world.boat.heading, street: st, marquee };
  };
  // Bring the hull to a roof's edge — inside DOCK_RANGE of its hull, so the
  // real B verb (game/input.ts) is what actually docks.
  (window as unknown as { __toRoof: (i?: number) => unknown }).__toRoof = (i = 0) => {
    const lake = world.lake;
    const roof = lake?.roofs[i];
    if (!lake || !roof) return null;
    const iso = lake.islets[roof.isletId];
    if (!iso) return null;
    // straight out from the roof centre through its first vertex, one metre
    // past the rim: close enough to dock, outside the polygon the hull slides on
    const v = iso.poly[0]!;
    const out = Math.hypot(v.x - roof.pos.x, v.z - roof.pos.z) || 1;
    world.boat.x = roof.pos.x + ((v.x - roof.pos.x) / out) * (out + 1.05);
    world.boat.z = roof.pos.z + ((v.z - roof.pos.z) / out) * (out + 1.05);
    world.boat.speed = 0;
    world.boat.heading = Math.atan2(roof.pos.z - world.boat.z, roof.pos.x - world.boat.x);
    return {
      roof: { id: roof.id, slot: roof.slot, building: roof.building, isletId: roof.isletId },
      boat: { x: world.boat.x, z: world.boat.z },
      edgeGap: distanceToHull({ x: world.boat.x, z: world.boat.z }, iso.hull),
    };
  };
  // A ripple in the street beside the roof the keeper is standing on, inside
  // CAST_RANGE — the ordinary director never anchors on a roof, so this is how
  // the gate gives the foot cast flow a target from the slates.
  (window as unknown as { __roofRipple: () => unknown }).__roofRipple = () => {
    const lake = world.lake;
    if (!lake || !lake.street) return null;
    const roof = roofForIslet(lake.roofs, world.dockedIslet);
    if (!roof) return null;
    const st = lake.street;
    // Out into the channel, measured from the KEEPER (who may be anywhere on the
    // deck after walking it) rather than from the roof centre — so the ripple is
    // always past the road-side eaves AND always inside CAST_RANGE of them.
    const dx = -st.perp.x * roof.side;
    const dz = -st.perp.z * roof.side;
    const rel = (world.player.x - roof.pos.x) * dx + (world.player.z - roof.pos.z) * dz;
    const toEdge = roof.halfZ + rel; // 0 at the road-side eaves, 2·halfZ at the back
    const off = Math.min(9, Math.max(4, toEdge + 3.5));
    const pos = { x: world.player.x + dx * off, z: world.player.z + dz * off };
    const d = createDisturbance(world.run.nextDisturbanceId++, pos, 2, 12345);
    world.disturbances.push(d);
    world.run.debugCastPoint = { x: pos.x, z: pos.z };
    return {
      id: d.id,
      pos,
      fromPlayer: Math.hypot(world.player.x - pos.x, world.player.z - pos.z),
    };
  };

  // t31 / M8 seams (tools/m8-probe.mjs): read the DARKNESS (the fog/black/disc
  // triple and what the gate is currently withholding), read the CHOIR (the mote
  // field, the hymn cursor, the render cost), and read/drive THE WHISTLER — force
  // its spawn without waiting for deep-night, pull it to a band, land a real gaff
  // and skip the current phase timer.
  (window as unknown as { __darkness: () => unknown }).__darkness = () => {
    const at = lanternOrigin(world);
    const hidden = world.disturbances.filter(
      (d) => d.state !== 'gone' && !withinLantern(world, d.pos.x, d.pos.z),
    ).length;
    const lake = world.lake;
    return {
      zone: world.run.zone,
      active: darknessActive(world),
      fogZoneMult: zoneFogMultiplier(world.run.zone),
      fogTint: zoneFogTint(world.run.zone),
      skyDarken: zoneSkyDarken(world.run.zone),
      ambientScale: zoneAmbientScale(world.run.zone),
      fogDensity: currentRenderContext()?.scene.fog
        ? (currentRenderContext()!.scene.fog as THREE.FogExp2).density
        : null,
      fogColor: currentRenderContext()?.scene.fog
        ? (currentRenderContext()!.scene.fog as THREE.FogExp2).color.getHex()
        : null,
      // three's getHex() encodes to sRGB, which lifts near-black values a long
      // way; the void has to be judged on the WORKING-SPACE channels the
      // renderer actually blends toward.
      fogLinear: currentRenderContext()?.scene.fog
        ? {
            r: (currentRenderContext()!.scene.fog as THREE.FogExp2).color.r,
            g: (currentRenderContext()!.scene.fog as THREE.FogExp2).color.g,
            b: (currentRenderContext()!.scene.fog as THREE.FogExp2).color.b,
          }
        : null,
      lantern: {
        origin: at,
        radius: lanternRadius(world),
        bowLantern: world.boatCombat.upgrades.bowLantern,
        radiusAtLevel: [0, 1, 2, 3].map((n) => lanternRadiusFor(n)),
      },
      disturbances: world.disturbances.filter((d) => d.state !== 'gone').length,
      hiddenDisturbances: hidden,
      buoys: lake
        ? lake.buoys.map((b) => ({
            id: b.id,
            dist: Math.hypot(b.pos.x - at.x, b.pos.z - at.z),
            shown: withinLantern(world, b.pos.x, b.pos.z, 1.5),
          }))
        : [],
      mode: world.mode,
    };
  };
  (window as unknown as { __setBowLantern: (n: number) => number }).__setBowLantern = (n: number) => {
    world.boatCombat.upgrades.bowLantern = Math.max(0, Math.floor(n));
    return lanternRadius(world);
  };
  (window as unknown as { __choir: () => unknown }).__choir = () => {
    const lake = world.lake;
    const seed = lake ? lake.seed : 0;
    return {
      zone: world.run.zone,
      render: choirRenderState(),
      cursor: choirCursor(world),
      moteCount: CHOIR_MOTE_COUNT,
      motes: lake
        ? Array.from({ length: CHOIR_MOTE_COUNT }, (_, i) => {
            const m = choirMoteAt(seed, i, world.time.elapsed);
            return { i, x: m.x, y: m.y, z: m.z };
          })
        : [],
      schedule: Array.from({ length: 6 }, (_, i) => ({
        i,
        gap: singIntervalFor(world.seed, i),
        mote: singerFor(world.seed, i, CHOIR_MOTE_COUNT),
        pitch: singPitchFor(world.seed, i),
      })),
      events: peekTownEvents().filter((e) => e.type === 'choir.sang'),
      lines: choirLines().map((l) => ({ moment: l.moment, text: l.text, placeholder: l.placeholder })),
      placeholders: choirPlaceholderCount(),
      ambient: CHOIR_AMBIENT.map((l) => ({ id: l.id, focus: l.focus, chars: l.text.length })),
    };
  };
  // Park the hull well clear of every islet, so a chase-height camera frames the
  // void the way play does: the lantern disc, and nothing else but motes.
  (window as unknown as { __toVoid: () => unknown }).__toVoid = () => {
    const lake = world.lake;
    if (!lake) return null;
    // the widest gap in the field: the lake-extent grid point furthest from land
    let best = { x: 0, z: 0, clear: -1 };
    const land = landmarks(world);
    for (let ix = -4; ix <= 4; ix++) {
      for (let iz = -4; iz <= 4; iz++) {
        const x = ix * 22;
        const z = iz * 22;
        const clear = nearestLandmarkDistance(x, z, land);
        if (clear > best.clear) best = { x, z, clear };
      }
    }
    world.boat.x = best.x;
    world.boat.z = best.z;
    world.boat.speed = 0;
    world.boat.heading = 0;
    return best;
  };
  // Frame the nearest mote from the boat — the "choir motes beyond the disc" shot.
  (window as unknown as { __nearestMote: () => unknown }).__nearestMote = () => {
    const at = lanternOrigin(world);
    let best = { i: -1, d: Infinity, x: 0, y: 0, z: 0 };
    for (let i = 0; i < CHOIR_MOTE_COUNT; i++) {
      const m = choirMoteWorld(world, i);
      if (!m) continue;
      const d = Math.hypot(m.x - at.x, m.z - at.z);
      if (d < best.d) best = { i, d, x: m.x, y: m.y, z: m.z };
    }
    return best.i >= 0 ? best : null;
  };
  (window as unknown as { __whistler: () => unknown }).__whistler = () => {
    const s = world.whistler;
    const fight = world.tether.fights.find((f) => f.id === s.fightId) ?? null;
    const at = keeperPoint(world);
    return {
      zone: world.run.zone,
      phase: s.phase,
      fighting: whistlerFighting(s),
      fightId: s.fightId,
      pos: { x: s.x, z: s.z },
      speed: s.speed,
      timer: s.timer,
      band: s.band,
      bandDistance: s.bandDistance,
      bandOffsets: BAND_OFFSETS,
      bandRings: bandRings(lanternRadius(world) + ROAM_MARGIN),
      distToKeeper: Math.hypot(s.x - at.x, s.z - at.z),
      discFraction: discFraction(world, s.x, s.z),
      roamFloor: lanternRadius(world) + ROAM_MARGIN,
      spawnDist: SPAWN_DIST,
      drags: s.drags,
      reeling: s.reeling,
      route: { x: s.routeX, z: s.routeZ },
      gaffHp: s.gaffHp,
      gaffHpMax: WHISTLER_GAFF_POOL,
      gaffHits: s.gaffHits,
      cutArmed: whistlerCutArmed(s),
      cutHeld: s.cutHeld,
      cutProgress: whistlerCutProgress(s),
      cutReach: WHISTLER_CUT_REACH,
      cut: s.cut,
      delivered: s.delivered,
      spawned: s.spawned,
      species: s.params ? s.params.speciesId : null,
      config: whistlerFightConfig(world),
      fight: fight
        ? {
            id: fight.id,
            species: fight.species,
            anchor: fight.anchor,
            L: fight.L,
            tension: fight.tension,
            reelRate: fight.reelRate ?? null,
            snapBehavior: fight.snapBehavior ?? null,
            aiReel: fight.aiReel ?? false,
            reelActive: fight.reel.active,
          }
        : null,
      fights: world.tether.fights.length,
      mode: world.mode,
      dockedIslet: world.dockedIslet,
      keeper: at,
      clearance: nearestLandmarkDistance(world.player.x, world.player.z, landmarks(world)),
      deepClearance: DEEP_CLEARANCE,
      water: {
        active: world.water.active,
        breath: world.water.breath,
        lethal: world.water.lethal,
        adrift: world.water.adrift,
        threatsApproach: world.water.threatsApproach,
      },
      player: { x: world.player.x, z: world.player.z, hp: world.player.hp },
      deliveredBy: world.run.deliveredBy,
      dread: world.dread,
      lure: world.lure.count,
      runEnded: world.run.ended,
      events: peekTownEvents().filter((e) => e.type.startsWith('whistler.')),
      moment: world.township.pendingMoment,
      toast: snatcherToastOnScreen(),
      prompt: whistlerPromptOnScreen(),
      render: whistlerRenderState(),
    };
  };
  // Force the spawn through the REAL code path: the gate is a pure predicate, so
  // the seam supplies the two facts a gate driver cannot wait out (deep-night is
  // three phases away; Dread 60 is a run's worth of landings) and the system
  // itself does the spawning on its next tick.
  (window as unknown as { __armWhistler: () => unknown }).__armWhistler = () => {
    (window as unknown as { __setPhase: (p: string) => number }).__setPhase('deepNight');
    world.dread = Math.max(world.dread, 75);
    return { phase: 'deepNight', dread: world.dread, spawned: world.whistler.spawned };
  };
  // Walk it in to a chosen distance along its current bearing, so the three bands
  // are reachable in a gate without rowing the wander out at 5.2 m/s. The BAND
  // ITSELF still fires through the system's own monotonic ladder.
  (window as unknown as { __whistlerTo: (d: number) => unknown }).__whistlerTo = (d: number) => {
    const s = world.whistler;
    const at = keeperPoint(world);
    const dx = s.x - at.x;
    const dz = s.z - at.z;
    const len = Math.hypot(dx, dz) || 1;
    s.x = at.x + (dx / len) * d;
    s.z = at.z + (dz / len) * d;
    s.wanderRing = Math.max(lanternRadius(world) + ROAM_MARGIN, d);
    return { dist: Math.hypot(s.x - at.x, s.z - at.z), band: s.band };
  };
  // A REAL HitEvent on this tick's array, tagged for the Whistler — the in-play
  // producer's own shape (the unit tests drive the arc itself).
  (window as unknown as { __whistlerHit: (heavy?: boolean) => unknown }).__whistlerHit = (
    heavy = false,
  ) => {
    world.combat.hits.push({
      targetId: WHISTLER_TARGET_ID,
      damage: heavy ? 18 : 6,
      knockbackX: 0,
      knockbackZ: 0,
      stagger: heavy ? HEAVY_STAGGER : 0,
    });
    return { hits: world.combat.hits.length, gaffHp: world.whistler.gaffHp };
  };
  // A gaff landing on it through the SAME rule the system applies to a real swing
  // (whistlerGaffCost) — the __postmasterGaff precedent, for the same reason:
  // combat clears its hit array at the top of every tick, so an out-of-band
  // injection between frames is not what the in-play producer does.
  (window as unknown as { __whistlerGaff: (heavy?: boolean) => number }).__whistlerGaff = (
    heavy = false,
  ) => {
    const s = world.whistler;
    if (!whistlerFighting(s)) return -1;
    s.gaffHits++;
    s.gaffHp -= whistlerGaffCost(heavy ? HEAVY_STAGGER : 0);
    return s.gaffHp;
  };
  // Bring it to arm's length of the keeper (aboard: of the hull) and point the
  // keeper at it — the __postmasterToReach precedent.
  (window as unknown as { __whistlerToReach: (d?: number) => unknown }).__whistlerToReach = (
    d = 1.1,
  ) => {
    const s = world.whistler;
    if (!whistlerFighting(s)) return null;
    const at = keeperPoint(world);
    s.x = at.x;
    s.z = at.z + d;
    s.speed = 0;
    world.player.facing = Math.atan2(s.x - world.player.x, s.z - world.player.z);
    world.combat.swingFacing = world.player.facing;
    return { dist: Math.hypot(s.x - at.x, s.z - at.z), reach: WHISTLER_CUT_REACH };
  };
  // Pull the current phase timer to zero so the next haul begins on the next sim
  // tick. The transition and everything it does are the real code.
  (window as unknown as { __whistlerSkip: () => unknown }).__whistlerSkip = () => {
    const s = world.whistler;
    if (!whistlerFighting(s)) return null;
    s.timer = 0;
    return { phase: s.phase, reeling: s.reeling };
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
