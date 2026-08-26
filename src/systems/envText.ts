// ENVIRONMENTAL TEXT (sim) — the Township's signage, read by walking near it
// (plan 05 §2.2 / §4.3, M7 round 1 minimal delivery).
//
// Approach-to-read: gen/township.ts tags every roof (and the cinema's marquee
// wall) with an EnvPoint carrying a copy key and a radius. This system finds
// the nearest point the READER is inside — the keeper on foot, the hull when
// aboard, so the marquee reads from the boat the way the street intends — and
// parks one line in `world.township.pendingEnv` for the parchment overlay.
//
// Firing rule: on ENTRY. A point fires when the reader crosses into its radius
// from outside; standing there does not re-fire, and walking away and back
// does. `world.township.read` keeps the per-run record plan §4.3 asks for
// ("text persists per-run"), separate from the fire edge.
//
// `lake.envPoints` is empty outside zone 3, so this system is one length check
// and a return everywhere else. No three, no DOM.

import type { WorldState } from '../core/world';
import { envTextFor } from '../content/envText';
import { roofForIslet } from '../gen/township';

export function updateEnvText(world: WorldState, _dt: number): void {
  const t = world.township;
  const lake = world.lake;
  if (!lake || lake.envPoints.length === 0) {
    t.onRoof = null;
    t.nearEnv = null;
    return;
  }

  // Which roof the keeper is standing on — the roof-as-islet mapping read back:
  // world.dockedIslet is an islet index, and a roof IS an islet.
  const roof = world.mode === 'foot' ? roofForIslet(lake.roofs, world.dockedIslet) : null;
  t.onRoof = roof ? roof.id : null;

  const reader = world.mode === 'foot' ? world.player : world.boat;

  // Nearest point whose own radius contains the reader. Ties break on id, so the
  // choice is deterministic.
  let best: { id: number; key: string; d: number } | null = null;
  for (const p of lake.envPoints) {
    const d = Math.hypot(reader.x - p.pos.x, reader.z - p.pos.z);
    if (d > p.radius) continue;
    if (!best || d < best.d) best = { id: p.id, key: p.key, d };
  }

  const nextId = best ? best.id : null;
  if (nextId != null && nextId !== t.nearEnv) {
    const text = envTextFor(best!.key);
    if (text.length > 0) {
      t.pendingEnv = { envId: nextId, key: best!.key, text };
      t.read[nextId] = true;
    }
  }
  t.nearEnv = nextId;
}

/** Test/probe seam: how many env points this run has already read. */
export function envReadCount(world: WorldState): number {
  return Object.keys(world.township.read).length;
}
