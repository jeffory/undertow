// TOWN COPY (content) — the id → story-copy map for the hub (task t18 slice 4;
// task t19 slice 2 adds town.md §4/§5: the doorstep barks, rig-up labels and
// the RESTRICTED. NICE TRY. notices).
//
// SOURCE OF TRUTH: docs/story/town.md §3 (the eight Main Street buildings), §4
// (returned residents & doorstep barks), §5 (rig-up & loadout copy, plus the
// restricted-tackle overlays) and §6 (ambient shoreline lines), transcribed
// VERBATIM — form codes, notice lines, restored stamps, benefit summaries,
// resident names, barks, slot labels and sticker text. The interfaces are
// town.md §2's schemas, unchanged.
//
// This module is the SEAM, not the writer: the UI never hardcodes a name or a
// notice, it asks `townCopyFor(id)`. `loadTownCopy(raw)` accepts the same
// JSON shape (the town.md §3 array, or a partial one) and merges it in at
// runtime, so a later copy pass is a data swap with no code change.
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

// town.md §2 `ResidentBarkSet` — one returned resident's doorstep barks.
export interface ResidentBarkSet {
  residentId: string;
  residentName: string;
  buildingId: string;
  barksStandard: string[];
  barkMaskSlipping: string;
}

// town.md §2 `RigUpSlotCopy` — one rig-up register slot.
export interface RigUpSlotCopy {
  slotId: string;
  formRef: string;
  label: string;
  flavorText: string;
}

// town.md §2 `RestrictedTackleNotice` — the RESTRICTED. NICE TRY. sticker copy.
export interface RestrictedTackleNotice {
  id: string;
  condition: string;
  stickerText: string;
  noticeBody: string;
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

// --- barks (town.md §4, task t19) ----------------------------------------------
// Eight returned residents, 2–3 standard doorstep barks each + one escalation
// bark that only enters the rotation once 5+ premises stand (plan 05 §1.5 "after
// 5+ restorations"). All copy is town.md's, verbatim; every line is ≤ 140 chars
// (town.md §7 audits the cap).
const BARK_ROWS: ResidentBarkSet[] = [
  {
    residentId: 'walter-silt',
    residentName: 'Walter Silt, Smokehouse Keeper',
    buildingId: 'smokehouse',
    barksStandard: [
      "Morning, Keeper. Salt's dry today. Everything else is thirty years late, but the salt is dry.",
      'Smoked meat, see. There are no fish in the lake. We both signed that statement.',
      "A bit of smoke keeps the damp out of your lungs. Not all of it, mind, but enough to whistle.",
    ],
    barkMaskSlipping:
      'The chimney pulls backward when the water turns red. Smells like the night you pulled the lever.',
  },
  {
    residentId: 'clement-oakes',
    residentName: 'Clement Oakes, The Chandler',
    buildingId: 'chandlery',
    barksStandard: [
      "Fine day for cordage, Keeper. Manila rope doesn't rot under water if you don't look at it.",
      "Plenty of line in stock. Take as much as you like. You'll give it back eventually.",
      "Strong winch, that. Held forty fathom of current thirty years back. Didn't hold you, though.",
    ],
    barkMaskSlipping:
      "Six more shops on the cobbles and we'll have a proper town again. Just need someone who breathes.",
  },
  {
    residentId: 'elsie-mercer',
    residentName: 'Elsie Mercer, The Postmistress',
    buildingId: 'post-office',
    barksStandard: [
      "Two bottles for you today, Keeper. Both addressed in your handwriting, oddly enough.",
      'No need to apologize for the delay. We had about forty feet of water in the sorting room.',
      "Mail's running regular again. Just remember to blot your envelopes before they dissolve.",
    ],
    barkMaskSlipping:
      "I found that letter Maren wrote you. Don't worry, the water got the stamp before I could read it.",
  },
  {
    residentId: 'enoch-carver',
    residentName: 'Enoch Carver, The Bell-Ringer',
    buildingId: 'bell-tower',
    barksStandard: [
      "I ring when you come in, Keeper. That way the bottom knows you haven't stayed down there.",
      'The fish here are all volunteers, you know. I checked with the vicar before we went under.',
      'Four hundred souls take a long time to toll for. My arms were tired before the third chime.',
    ],
    barkMaskSlipping:
      'Every time a house comes up, the bell chimes a half-step lower. The bronze remembers who opened it.',
  },
  {
    residentId: 'silas-callow',
    residentName: 'Silas Callow, The Sexton',
    buildingId: 'chapel',
    barksStandard: [
      'Come in, Keeper, wipe your feet. The floor is dry timber, or near enough for prayer.',
      "We hold service at low tide. Well, the tide doesn't go out, but the thought is comforting.",
      "The water listened very politely to the sermon on Sunday. Didn't drop an inch, but polite.",
    ],
    barkMaskSlipping:
      "God didn't close the sluice gate that night, Keeper. But we don't hold it against the church.",
  },
  {
    residentId: 'martha-vance',
    residentName: 'Martha Vance, The Apothecary',
    buildingId: 'apothecary',
    barksStandard: [
      "It's mostly lake water with a drop of camphor. You'd be amazed what people will swallow.",
      'Keep the cork tight, Keeper. If the light gets out, the dark comes looking for the bottle.',
      'Something for the tremor in your hands? The flood was thirty years ago, dear. Take two drops.',
    ],
    barkMaskSlipping:
      'The tincture turns pink when the water rises. Just like the linen Maren used when she washed.',
  },
  {
    residentId: 'arthur-finch',
    residentName: 'Arthur Finch, The Baker',
    buildingId: 'bakery',
    barksStandard: [
      "Fresh crust today! Floats like a buoy if you drop it in the basin. We're very proud.",
      "Dough rises lovely when the air is humid. And goodness knows we've got the humidity.",
      "Take a loaf for the boat, Keeper. It's dry on the inside. Most things are, to begin with.",
    ],
    barkMaskSlipping:
      'Oven was still warm when the sluice broke. Took three days for the steam to stop whistling.',
  },
  {
    residentId: 'clara-blackwood',
    residentName: 'Clara Blackwood, The Schoolteacher',
    buildingId: 'schoolhouse',
    barksStandard: [
      "Good morning, Keeper. Today we're learning subtraction. Four hundred minus four hundred.",
      "The children are very quiet today. They've been quiet since the fourteenth of October.",
      'Class, eyes front. The Keeper is here to demonstrate what happens when you turn the wheel.',
    ],
    barkMaskSlipping:
      "I called roll this morning. Maren's desk was empty. Just like it was the morning after the rain.",
  },
];

// buildingId → ResidentBarkSet. Lookup by building, because the bark system
// fires on proximity to a BUILDING's door (the resident stands at it).
export const BARK_TABLE: Record<string, ResidentBarkSet> = Object.fromEntries(
  BARK_ROWS.map((row) => [row.buildingId, row]),
);

export function barkSetFor(buildingId: string): ResidentBarkSet | null {
  return BARK_TABLE[buildingId] ?? null;
}

// --- rig-up register copy (town.md §5, task t19) --------------------------------
// The seven SCHEDULE slots of the CUSTODIAL RIGGING & TACKLE REQUISITION, in the
// register's order, verbatim from town.md §5.
const RIG_UP_ROWS: RigUpSlotCopy[] = [
  {
    slotId: 'screen_header',
    formRef: 'FORM 6-R: CUSTODIAL RIGGING & TACKLE REQUISITION',
    label: 'SCHEDULE OF APPARATUS FOR BASIN HAULAGE',
    flavorText:
      'Select approved implements for surface attendance. All gear is surrendered upon complete submersion.',
  },
  {
    slotId: 'rod',
    formRef: 'SCHEDULE A: HAULAGE BEAM & FULCRUM',
    label: 'PRIMARY LEVERAGE APPARATUS (ROD)',
    flavorText: 'The fulcrum between your wrists and forty fathoms of municipal history.',
  },
  {
    slotId: 'line',
    formRef: 'SCHEDULE B: DISTANCE CONSTRAINT',
    label: 'TENSILE TETHER CORDAGE (LINE)',
    flavorText: 'Tensile cordage connecting party of the first part to party of the second part.',
  },
  {
    slotId: 'lure',
    formRef: 'SCHEDULE C: SUB-SURFACE INVITATIONS',
    label: 'ATTACHED ENTICEMENTS & LURES (MAX 3)',
    flavorText: 'Three (3) permitted attachments to persuade former parishioners toward the light.',
  },
  {
    slotId: 'trinket',
    formRef: 'SCHEDULE D: ANCHORING ARTICLES',
    label: 'PERSONAL MEMORABILIA & TALISMANS (MAX 2)',
    flavorText: 'Two (2) salvaged keepsakes of negligible weight and persistent ballast.',
  },
  {
    slotId: 'consumables',
    formRef: 'SCHEDULE E: PERISHABLE STORES',
    label: 'RATIONS, PREPARED CHUM & DECANTED LIGHT',
    flavorText: 'Perishable provisions and bottled lamp-oil. Non-refundable once dipped in basin water.',
  },
  {
    slotId: 'confirm_button',
    formRef: 'WARRANT 1-A: DISCHARGE PERMIT',
    label: 'SIGN REGISTER & ROW OUT',
    flavorText: 'Sign below to acknowledge basin tariffs. The Office confirms your line is taut.',
  },
];

export const RIG_UP_SLOTS: readonly RigUpSlotCopy[] = RIG_UP_ROWS;

export function rigUpSlot(slotId: string): RigUpSlotCopy | null {
  return RIG_UP_ROWS.find((row) => row.slotId === slotId) ?? null;
}

// --- restricted-tackle notices (town.md §5, task t19) ---------------------------
// Two distinct RESTRICTED. NICE TRY. variants: one for license-grade shortfalls,
// one for workshops not yet on the dry register.
const RESTRICTED_ROWS: RestrictedTackleNotice[] = [
  {
    id: 'restricted_license_tier',
    condition: 'Item tackle grade exceeds Keeper\'s License grade',
    stickerText: 'RESTRICTED. NICE TRY.',
    noticeBody:
      'Tackle grade exceeds current Custodial License. The Office notes your ambition and confiscates the requisition slip.',
  },
  {
    id: 'restricted_unrestored_building',
    condition: 'Tackle requires a workshop not yet returned to the dry register',
    stickerText: 'RESTRICTED. NICE TRY.',
    noticeBody: 'Workshop unlisted on dry register. Rebuild the foundation before inquiring after its tools.',
  },
];

export const RESTRICTED_NOTICES: readonly RestrictedTackleNotice[] = RESTRICTED_ROWS;

export function restrictedNotice(id: string): RestrictedTackleNotice | null {
  return RESTRICTED_ROWS.find((row) => row.id === id) ?? null;
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
