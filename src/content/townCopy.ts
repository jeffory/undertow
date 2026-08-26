// TOWN COPY (content) — the id → story-copy map for the hub (task t18 slice 4).
//
// SOURCE OF TRUTH: docs/story/town.md §3 (the eight Main Street buildings) and
// §6 (ambient shoreline lines), transcribed VERBATIM — form codes, notice
// lines, restored stamps, benefit summaries, resident names. The interfaces are
// town.md §2's schemas, unchanged.
//
// This module is the SEAM, not the writer: the UI never hardcodes a name or a
// notice, it asks `townCopyFor(id)`. `loadTownCopy(raw)` accepts the same
// JSON shape (the town.md §3 array, or a partial one) and merges it in at
// runtime, so a later copy pass is a data swap with no code change.
//
// DEFERRED (town.md §4/§5, plan 05 §1.5/§1.2): the 32 doorstep barks and the
// rig-up / restricted-tackle copy — those land with the bark system and the
// rig-up screen, which are out of scope this round.
//
// Pure data: no `three`, no DOM.

export interface RestorationNotice {
  formCode: string;
  noticeLines: string[];
  costMemories: number;
  dreadNotice: string;
}

export interface TownBuildingCopy {
  id: string;
  name: string;
  category: string;
  residentId: string;
  residentName: string;
  restorationNotice: RestorationNotice;
  stampRestored: string;
  benefitSummary: string;
}

export interface AmbientHubLine {
  id: string;
  focus: 'street' | 'water' | 'light';
  text: string;
}

const TOWN_COPY_ROWS: TownBuildingCopy[] = [
  {
    id: "smokehouse",
    name: "Old Sluice Smokehouse",
    category: "Phase 0 — Municipal Utility",
    residentId: "walter-silt",
    residentName: "Walter Silt, Smokehouse Keeper",
    restorationNotice: {
      formCode: "FORM 4-S: APPLICATION FOR CURING & DESICCATION WORKS",
      noticeLines: [
        "Application to re-erect one (1) timber curing shed upon dry gravel.",
        "Tenant agrees to keep fires low and refrain from inquiring after the species supplied.",
      ],
      costMemories: 40,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "RE-ENTERED ON DRY REGISTER — CURED IN DAMP",
    benefitSummary: "Unlocks Dredger rod and fish-meat bait crafting.",
  },
  {
    id: "chandlery",
    name: "Basin Chandlery & Rigging",
    category: "Phase 0 — Marine Provisioning",
    residentId: "clement-oakes",
    residentName: "Clement Oakes, The Chandler",
    restorationNotice: {
      formCode: "FORM 9-C: PERMIT FOR HAWSER & WINCH PROVISIONING",
      noticeLines: [
        "Authority to dispense hemp cordage, pine pitch, and iron tackle to authorized custodians.",
        "All line lengths remain subject to immediate kinetic requisition by the basin.",
      ],
      costMemories: 45,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "TACKLE CLEARED FOR HAULAGE — BREAKING STRAIN UNGUARANTEED",
    benefitSummary: "Unlocks Longliner rod and boat hull/winch/lantern upgrades.",
  },
  {
    id: "post-office",
    name: "District Post Office",
    category: "Phase 0 — Communications",
    residentId: "elsie-mercer",
    residentName: "Elsie Mercer, The Postmistress",
    restorationNotice: {
      formCode: "FORM 1-P: PETITION FOR RE-ESTABLISHMENT OF POSTAL ROUTE",
      noticeLines: [
        "Request to unseal sorting boxes and cancel thirty years of waterlogged dispatches.",
        "Letters addressed to deceased parties will be delivered to nearest dry jetty.",
      ],
      costMemories: 50,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "DISPATCH RESUMED — POSTAGE PAID IN ADVANCE",
    benefitSummary: "Bottle-note archive ledger and forwarding address correspondence.",
  },
  {
    id: "bell-tower",
    name: "Parish Bell Tower",
    category: "Phase 0 — Navigation & Vigil",
    residentId: "enoch-carver",
    residentName: "Enoch Carver, The Bell-Ringer",
    restorationNotice: {
      formCode: "FORM 7-B: RE-SUSPENSION OF PARISH BRONZE & TOLLAGE",
      noticeLines: [
        "Authorization to hang three (3) bronze bells above high-water mark.",
        "Tolling for drowning emergencies strictly restricted to forty seconds per incident.",
      ],
      costMemories: 40,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "SANCTIONED FOR HOURLY TOLL — SILENCE PROHIBITED",
    benefitSummary: "Extraction buoy leitmotif audio and bonus extract reward whispers.",
  },
  {
    id: "chapel",
    name: "Chapel of Saint Jude-in-the-Fens",
    category: "Phase 0 — Sanction & Solace",
    residentId: "silas-callow",
    residentName: "Silas Callow, The Sexton",
    restorationNotice: {
      formCode: "SCHEDULE 12-J: RE-CONSECRATION OF FLOODED SANCTUARY",
      noticeLines: [
        "Petition to drain nave, dry forty-seven (47) hymnals, and provide spiritual clearance.",
        "Absolution granted upon receipt of assessed tribute. The water is invited to listen.",
      ],
      costMemories: 60,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "PARISH RE-CONSECRATED — ABSOLUTION CONDITIONAL ON TRIBUTE",
    benefitSummary: "Run-start Chapel Blessings (Dread vent, stamina, breath) and Hymnal trinkets.",
  },
  {
    id: "apothecary",
    name: "Weirside Apothecary",
    category: "Phase 1 — Dispensary",
    residentId: "martha-vance",
    residentName: "Martha Vance, The Apothecary",
    restorationNotice: {
      formCode: "FORM 15-M: RE-LICENSING OF DISPENSARY & PHIALS",
      noticeLines: [
        "Application to vend botanical tinctures, basin-damp lozenges, and bottled luminous extracts.",
        "Dispensary disclaims liability for memories dissolved in saline solution.",
      ],
      costMemories: 110,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "PHIALS INSPECTED & SEALED — CONSUME BEFORE SEDIMENT SETTLES",
    benefitSummary: "Consumable vendor (Bottled Light phials, tinctures, stamina cures).",
  },
  {
    id: "bakery",
    name: "Hollow Commons Bakery",
    category: "Phase 1 — Provisions",
    residentId: "arthur-finch",
    residentName: "Arthur Finch, The Baker",
    restorationNotice: {
      formCode: "CIRCULAR 3-K: RE-COMMISSIONING OF COMMONS OVEN",
      noticeLines: [
        "Permit to fire stone hearth upon reclaimed gravel using salvaged drift-timber.",
        "All flour declared submerged by water inspector must be baked into sustenance immediately.",
      ],
      costMemories: 110,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "CRUST VERIFIED BUOYANT — APPROVED FOR SHORE CONSUMPTION",
    benefitSummary: "Run-start meal buffs (choice of 3 passive nourishment profiles).",
  },
  {
    id: "schoolhouse",
    name: "Parish Schoolhouse",
    category: "Phase 2 — Instruction & Records",
    residentId: "clara-blackwood",
    residentName: "Clara Blackwood, The Schoolteacher",
    restorationNotice: {
      formCode: "SCHEDULE 8-E: RE-OPENING OF PARISH ROLL & DESKS",
      noticeLines: [
        "Authorization to resume instruction in arithmetic, geography, and sluice tolerances.",
        "Desks to be wiped dry each morning. Attendance recorded in perpetuity.",
      ],
      costMemories: 180,
      dreadNotice: "The basin notes the displacement (+2 Starting Dread).",
    },
    stampRestored: "ROLL CALL RECORDED — ATTENDANCE NOTED AT FORTY FATHOMS",
    benefitSummary: "Reveals one un-caught species per run in the Bestiary registry.",
  },
];

// id → copy. Mutable by design: loadTownCopy() writes into it.
export const TOWN_COPY: Record<string, TownBuildingCopy> = Object.fromEntries(
  TOWN_COPY_ROWS.map((row) => [row.id, row]),
);

export const AMBIENT_HUB_LINES: readonly AmbientHubLine[] = [
  { id: "ambient_street", focus: "street", text: "Cobblestones end neatly at the water's edge, continuing down into the silt where the curbs still remember being dry." },
  { id: "ambient_water", focus: "water", text: "The lapping at the jetty is quiet and faintly rust-coloured. Nobody on the strand mentions the stain." },
  { id: "ambient_light", focus: "light", text: "The lighthouse beam sweeps over empty black water at regular intervals, searching for rooftops it already knows are there." },
];

export function townCopyFor(id: string): TownBuildingCopy | null {
  return TOWN_COPY[id] ?? null;
}

// The building's player-facing name, falling back to whatever the caller has
// (content/buildings.ts's `name`) when no copy row exists for the id.
export function townName(id: string, fallback: string): string {
  return TOWN_COPY[id]?.name ?? fallback;
}

// --- the loader seam -----------------------------------------------------------
// Accepts the town.md §3 JSON array (or any subset of it) and merges the rows
// in by id. Rows that do not carry the full shape are skipped rather than
// half-applied — a malformed copy file must never blank a notice mid-run.
// Returns how many rows were accepted.
export function loadTownCopy(raw: unknown): number {
  const rows = Array.isArray(raw) ? raw : null;
  if (!rows) return 0;
  let applied = 0;
  for (const row of rows) {
    const copy = asTownBuildingCopy(row);
    if (!copy) continue;
    TOWN_COPY[copy.id] = copy;
    applied++;
  }
  return applied;
}

function asTownBuildingCopy(raw: unknown): TownBuildingCopy | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const notice = r.restorationNotice as Record<string, unknown> | undefined;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  if (!notice || typeof notice !== 'object') return null;
  const lines = notice.noticeLines;
  if (!Array.isArray(lines) || lines.some((l) => typeof l !== 'string')) return null;
  if (typeof notice.formCode !== 'string' || typeof notice.dreadNotice !== 'string') return null;
  if (typeof notice.costMemories !== 'number') return null;
  return {
    id: r.id,
    name: r.name,
    category: typeof r.category === 'string' ? r.category : '',
    residentId: typeof r.residentId === 'string' ? r.residentId : '',
    residentName: typeof r.residentName === 'string' ? r.residentName : '',
    restorationNotice: {
      formCode: notice.formCode,
      noticeLines: lines as string[],
      costMemories: notice.costMemories,
      dreadNotice: notice.dreadNotice,
    },
    stampRestored: typeof r.stampRestored === 'string' ? r.stampRestored : '',
    benefitSummary: typeof r.benefitSummary === 'string' ? r.benefitSummary : '',
  };
}
