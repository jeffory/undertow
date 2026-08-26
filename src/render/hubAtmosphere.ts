// HUB ATMOSPHERE (render seam) — plan 05 §1.1, task t21.
//
// The two ways the town's memory of itself shows up in the sky and the water:
//
//   • the lighthouse beam + lantern room, dimmed / cooled / slowed by every
//     Bottled Light poured (§1.7, `metaState.decants`) — permanent, cumulative,
//     across all future runs;
//   • the shore water, stained a little redder by every building back on the
//     dry register (§1.1's "subtle palette lerp the player is not supposed to
//     name").
//
// One call, two setters, so every writer of MetaState (boot, the decant panel,
// the restoration ledger) pushes both consequences through the SAME seam and
// neither can be updated without the other. The math lives in
// meta/bottledLight.ts and the shaders; this is only the wiring.

import type { MetaState } from '../save/schemas';
import { restoredCount } from '../meta/restoration';
import { setHubDecants } from './sky';
import { setShoreRestoration } from './water';

export function applyHubMeta(meta: MetaState | null | undefined): void {
  setHubDecants(meta ? meta.decants : 0);
  setShoreRestoration(meta ? restoredCount(meta) : 0);
}
