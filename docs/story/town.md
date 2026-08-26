# UNDERTOW — Story Bible: The Town & Lighthouse Shore (Hub)

*Implementation Reference: `plan.md` §2.2, §2.4, §3.3; `docs/plan/05-meta-and-content.md` §1 (M5), §6.1; `docs/story/voice.md`*  
*Delivery: Proximity HTML overlays, bark speech bubbles, and municipal card UI rendered over the real-time Three.js lighthouse shore scene (`src/meta/hubScene.ts`, `src/ui/restorationUI.ts`, `src/ui/rigUpScreen.ts`, `src/ui/barkOverlay.ts`).*

---

## 1. Hub Narrative & Aesthetic Principles

### The Memory of the Street That Was
The hub is the narrow gravel shore beneath the lighthouse tower. Arranged along the water's edge are the dry-laid stone foundations of Greywater Hollow's former main street. 

When the Keeper pays tribute in **Memories**, a building materializes atop its foundation—reclaimed from forty fathoms below—and its drowned proprietor steps out to take their place at the front door.

### Core Environmental Rules
1. **Cheerful Bureaucratic Denial:** The returned residents know they drowned thirty years ago when the Keeper opened the spillway. They remember the water filling their parlors, the cold, and the arithmetic of ten thousand lives downstream versus four hundred below. They are scrupulously, relentlessly polite about it. No one screams; no one levies open blame. They comment on damp floorboards, late mail, and resilient bread crusts.
2. **The Unnamed Escalation:** With every restoration, the hub grows brighter and more inhabited, while the water lapping against the jetty grows visibly more restless and takes on a deeper, rust-red hue. **Nobody comments on the water getting redder.**
3. **The Diegetic Dread Twist:** Every restored building increases the lake's starting agitation (`+2 Starting Dread`, capped at `+30`). The municipal ledger telegraphed this plainly: *"The lake stirs: +2 Starting Dread"*. The Keeper is purchasing company with the lake's anger.
4. **Maren’s Absence:** Maren does **not** have a building on this street. Her absence is the silent gravity of the entire shoreline.

---

## 2. Technical Data Schemas

```ts
export interface RestorationNotice {
  formCode: string;            // e.g. "FORM 4-S: APPLICATION FOR CURING & DESICCATION WORKS"
  noticeLines: string[];       // 2-3 lines of municipal application text
  costMemories: number;        // Cost in Memories currency
  dreadNotice: string;         // Diegetic warning line
}

export interface TownBuilding {
  id: string;                  // Kebab-case identifier (e.g. "smokehouse")
  name: string;                // Display name
  category: string;            // Phase grouping
  residentId: string;          // Linked NPC identifier
  restorationNotice: RestorationNotice;
  stampRestored: string;       // One-line confirmation stamp
  benefitSummary: string;      // Unlocked mechanical capability
}

export interface ResidentBarkSet {
  residentId: string;          // e.g. "walter-silt"
  residentName: string;        // e.g. "Walter Silt, Smokehouse Keeper"
  buildingId: string;          // Linked building id
  barksStandard: string[];     // 2-3 standard doorstep barks (each < 140 chars)
  barkMaskSlipping: string;    // Bark played after 5+ restorations (each < 140 chars)
}

export interface RigUpSlotCopy {
  slotId: string;              // "header" | "rod" | "line" | "lure" | "trinket" | "consumables" | "confirm"
  formRef: string;             // e.g. "SCHEDULE A: FORM 6-R"
  label: string;               // Slot header
  flavorText: string;          // Municipal register voice
}

export interface RestrictedTackleNotice {
  id: string;
  condition: string;
  stickerText: string;         // Always "RESTRICTED. NICE TRY."
  noticeBody: string;          // Municipal rejection text
}

export interface AmbientHubLine {
  id: string;
  focus: "street" | "water" | "light";
  text: string;
}
```

---

## 3. The Eight Main Street Buildings

```json
[
  {
    "id": "smokehouse",
    "name": "Old Sluice Smokehouse",
    "category": "Phase 0 — Municipal Utility",
    "residentId": "walter-silt",
    "restorationNotice": {
      "formCode": "FORM 4-S: APPLICATION FOR CURING & DESICCATION WORKS",
      "noticeLines": [
        "Application to re-erect one (1) timber curing shed upon dry gravel.",
        "Tenant agrees to keep fires low and refrain from inquiring after the species supplied."
      ],
      "costMemories": 40,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "RE-ENTERED ON DRY REGISTER — CURED IN DAMP",
    "benefitSummary": "Unlocks Dredger rod and fish-meat bait crafting."
  },
  {
    "id": "chandlery",
    "name": "Basin Chandlery & Rigging",
    "category": "Phase 0 — Marine Provisioning",
    "residentId": "clement-oakes",
    "restorationNotice": {
      "formCode": "FORM 9-C: PERMIT FOR HAWSER & WINCH PROVISIONING",
      "noticeLines": [
        "Authority to dispense hemp cordage, pine pitch, and iron tackle to authorized custodians.",
        "All line lengths remain subject to immediate kinetic requisition by the basin."
      ],
      "costMemories": 45,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "TACKLE CLEARED FOR HAULAGE — BREAKING STRAIN UNGUARANTEED",
    "benefitSummary": "Unlocks Longliner rod and boat hull/winch/lantern upgrades."
  },
  {
    "id": "post-office",
    "name": "District Post Office",
    "category": "Phase 0 — Communications",
    "residentId": "elsie-mercer",
    "restorationNotice": {
      "formCode": "FORM 1-P: PETITION FOR RE-ESTABLISHMENT OF POSTAL ROUTE",
      "noticeLines": [
        "Request to unseal sorting boxes and cancel thirty years of waterlogged dispatches.",
        "Letters addressed to deceased parties will be delivered to nearest dry jetty."
      ],
      "costMemories": 50,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "DISPATCH RESUMED — POSTAGE PAID IN ADVANCE",
    "benefitSummary": "Bottle-note archive ledger and forwarding address correspondence."
  },
  {
    "id": "bell-tower",
    "name": "Parish Bell Tower",
    "category": "Phase 0 — Navigation & Vigil",
    "residentId": "enoch-carver",
    "restorationNotice": {
      "formCode": "FORM 7-B: RE-SUSPENSION OF PARISH BRONZE & TOLLAGE",
      "noticeLines": [
        "Authorization to hang three (3) bronze bells above high-water mark.",
        "Tolling for drowning emergencies strictly restricted to forty seconds per incident."
      ],
      "costMemories": 40,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "SANCTIONED FOR HOURLY TOLL — SILENCE PROHIBITED",
    "benefitSummary": "Extraction buoy leitmotif audio and bonus extract reward whispers."
  },
  {
    "id": "chapel",
    "name": "Chapel of Saint Jude-in-the-Fens",
    "category": "Phase 0 — Sanction & Solace",
    "residentId": "silas-callow",
    "restorationNotice": {
      "formCode": "SCHEDULE 12-J: RE-CONSECRATION OF FLOODED SANCTUARY",
      "noticeLines": [
        "Petition to drain nave, dry forty-seven (47) hymnals, and provide spiritual clearance.",
        "Absolution granted upon receipt of assessed tribute. The water is invited to listen."
      ],
      "costMemories": 60,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "PARISH RE-CONSECRATED — ABSOLUTION CONDITIONAL ON TRIBUTE",
    "benefitSummary": "Run-start Chapel Blessings (Dread vent, stamina, breath) and Hymnal trinkets."
  },
  {
    "id": "apothecary",
    "name": "Weirside Apothecary",
    "category": "Phase 1 — Dispensary",
    "residentId": "martha-vance",
    "restorationNotice": {
      "formCode": "FORM 15-M: RE-LICENSING OF DISPENSARY & PHIALS",
      "noticeLines": [
        "Application to vend botanical tinctures, basin-damp lozenges, and bottled luminous extracts.",
        "Dispensary disclaims liability for memories dissolved in saline solution."
      ],
      "costMemories": 110,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "PHIALS INSPECTED & SEALED — CONSUME BEFORE SEDIMENT SETTLES",
    "benefitSummary": "Consumable vendor (Bottled Light phials, tinctures, stamina cures)."
  },
  {
    "id": "bakery",
    "name": "Hollow Commons Bakery",
    "category": "Phase 1 — Provisions",
    "residentId": "arthur-finch",
    "restorationNotice": {
      "formCode": "CIRCULAR 3-K: RE-COMMISSIONING OF COMMONS OVEN",
      "noticeLines": [
        "Permit to fire stone hearth upon reclaimed gravel using salvaged drift-timber.",
        "All flour declared submerged by water inspector must be baked into sustenance immediately."
      ],
      "costMemories": 110,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "CRUST VERIFIED BUOYANT — APPROVED FOR SHORE CONSUMPTION",
    "benefitSummary": "Run-start meal buffs (choice of 3 passive nourishment profiles)."
  },
  {
    "id": "schoolhouse",
    "name": "Parish Schoolhouse",
    "category": "Phase 2 — Instruction & Records",
    "residentId": "clara-blackwood",
    "restorationNotice": {
      "formCode": "SCHEDULE 8-E: RE-OPENING OF PARISH ROLL & DESKS",
      "noticeLines": [
        "Authorization to resume instruction in arithmetic, geography, and sluice tolerances.",
        "Desks to be wiped dry each morning. Attendance recorded in perpetuity."
      ],
      "costMemories": 180,
      "dreadNotice": "The basin notes the displacement (+2 Starting Dread)."
    },
    "stampRestored": "ROLL CALL RECORDED — ATTENDANCE NOTED AT FORTY FATHOMS",
    "benefitSummary": "Reveals one un-caught species per run in the Bestiary registry."
  }
]
```

---

## 4. Returned Residents & Door-Step Barks

*Tone Rule: Every bark must be under 140 characters. Cheerful, polite, provincial denial over catastrophic unnatural grief. They remember drowning, they know you opened the sluice, but etiquette forbids direct confrontation.*

```json
[
  {
    "residentId": "walter-silt",
    "residentName": "Walter Silt, Smokehouse Keeper",
    "buildingId": "smokehouse",
    "barksStandard": [
      "Morning, Keeper. Salt's dry today. Everything else is thirty years late, but the salt is dry.",
      "Smoked meat, see. There are no fish in the lake. We both signed that statement.",
      "A bit of smoke keeps the damp out of your lungs. Not all of it, mind, but enough to whistle."
    ],
    "barkMaskSlipping": "The chimney pulls backward when the water turns red. Smells like the night you pulled the lever."
  },
  {
    "residentId": "clement-oakes",
    "residentName": "Clement Oakes, The Chandler",
    "buildingId": "chandlery",
    "barksStandard": [
      "Fine day for cordage, Keeper. Manila rope doesn't rot under water if you don't look at it.",
      "Plenty of line in stock. Take as much as you like. You'll give it back eventually.",
      "Strong winch, that. Held forty fathom of current thirty years back. Didn't hold you, though."
    ],
    "barkMaskSlipping": "Six more shops on the cobbles and we'll have a proper town again. Just need someone who breathes."
  },
  {
    "residentId": "elsie-mercer",
    "residentName": "Elsie Mercer, The Postmistress",
    "buildingId": "post-office",
    "barksStandard": [
      "Two bottles for you today, Keeper. Both addressed in your handwriting, oddly enough.",
      "No need to apologize for the delay. We had about forty feet of water in the sorting room.",
      "Mail's running regular again. Just remember to blot your envelopes before they dissolve."
    ],
    "barkMaskSlipping": "I found that letter Maren wrote you. Don't worry, the water got the stamp before I could read it."
  },
  {
    "residentId": "enoch-carver",
    "residentName": "Enoch Carver, The Bell-Ringer",
    "buildingId": "bell-tower",
    "barksStandard": [
      "I ring when you come in, Keeper. That way the bottom knows you haven't stayed down there.",
      "The fish here are all volunteers, you know. I checked with the vicar before we went under.",
      "Four hundred souls take a long time to toll for. My arms were tired before the third chime."
    ],
    "barkMaskSlipping": "Every time a house comes up, the bell chimes a half-step lower. The bronze remembers who opened it."
  },
  {
    "residentId": "silas-callow",
    "residentName": "Silas Callow, The Sexton",
    "buildingId": "chapel",
    "barksStandard": [
      "Come in, Keeper, wipe your feet. The floor is dry timber, or near enough for prayer.",
      "We hold service at low tide. Well, the tide doesn't go out, but the thought is comforting.",
      "The water listened very politely to the sermon on Sunday. Didn't drop an inch, but polite."
    ],
    "barkMaskSlipping": "God didn't close the sluice gate that night, Keeper. But we don't hold it against the church."
  },
  {
    "residentId": "martha-vance",
    "residentName": "Martha Vance, The Apothecary",
    "buildingId": "apothecary",
    "barksStandard": [
      "It's mostly lake water with a drop of camphor. You'd be amazed what people will swallow.",
      "Keep the cork tight, Keeper. If the light gets out, the dark comes looking for the bottle.",
      "Something for the tremor in your hands? The flood was thirty years ago, dear. Take two drops."
    ],
    "barkMaskSlipping": "The tincture turns pink when the water rises. Just like the linen Maren used when she washed."
  },
  {
    "residentId": "arthur-finch",
    "residentName": "Arthur Finch, The Baker",
    "buildingId": "bakery",
    "barksStandard": [
      "Fresh crust today! Floats like a buoy if you drop it in the basin. We're very proud.",
      "Dough rises lovely when the air is humid. And goodness knows we've got the humidity.",
      "Take a loaf for the boat, Keeper. It's dry on the inside. Most things are, to begin with."
    ],
    "barkMaskSlipping": "Oven was still warm when the sluice broke. Took three days for the steam to stop whistling."
  },
  {
    "residentId": "clara-blackwood",
    "residentName": "Clara Blackwood, The Schoolteacher",
    "buildingId": "schoolhouse",
    "barksStandard": [
      "Good morning, Keeper. Today we're learning subtraction. Four hundred minus four hundred.",
      "The children are very quiet today. They've been quiet since the fourteenth of October.",
      "Class, eyes front. The Keeper is here to demonstrate what happens when you turn the wheel."
    ],
    "barkMaskSlipping": "I called roll this morning. Maren's desk was empty. Just like it was the morning after the rain."
  }
]
```

---

## 5. Lighthouse Door: Rig-Up & Loadout Copy

*Implementation: `src/ui/rigUpScreen.ts`. Displayed when the Keeper interacts with the heavy iron door of the lighthouse tower before rowing into the basin.*

```json
[
  {
    "slotId": "screen_header",
    "formRef": "FORM 6-R: CUSTODIAL RIGGING & TACKLE REQUISITION",
    "label": "SCHEDULE OF APPARATUS FOR BASIN HAULAGE",
    "flavorText": "Select approved implements for surface attendance. All gear is surrendered upon complete submersion."
  },
  {
    "slotId": "rod",
    "formRef": "SCHEDULE A: HAULAGE BEAM & FULCRUM",
    "label": "PRIMARY LEVERAGE APPARATUS (ROD)",
    "flavorText": "The fulcrum between your wrists and forty fathoms of municipal history."
  },
  {
    "slotId": "line",
    "formRef": "SCHEDULE B: DISTANCE CONSTRAINT",
    "label": "TENSILE TETHER CORDAGE (LINE)",
    "flavorText": "Tensile cordage connecting party of the first part to party of the second part."
  },
  {
    "slotId": "lure",
    "formRef": "SCHEDULE C: SUB-SURFACE INVITATIONS",
    "label": "ATTACHED ENTICEMENTS & LURES (MAX 3)",
    "flavorText": "Three (3) permitted attachments to persuade former parishioners toward the light."
  },
  {
    "slotId": "trinket",
    "formRef": "SCHEDULE D: ANCHORING ARTICLES",
    "label": "PERSONAL MEMORABILIA & TALISMANS (MAX 2)",
    "flavorText": "Two (2) salvaged keepsakes of negligible weight and persistent ballast."
  },
  {
    "slotId": "consumables",
    "formRef": "SCHEDULE E: PERISHABLE STORES",
    "label": "RATIONS, PREPARED CHUM & DECANTED LIGHT",
    "flavorText": "Perishable provisions and bottled lamp-oil. Non-refundable once dipped in basin water."
  },
  {
    "slotId": "confirm_button",
    "formRef": "WARRANT 1-A: DISCHARGE PERMIT",
    "label": "SIGN REGISTER & ROW OUT",
    "flavorText": "Sign below to acknowledge basin tariffs. The Office confirms your line is taut."
  }
]
```

### Restricted Tackle Overlays (`RESTRICTED. NICE TRY.`)

*Rendered as a red-violet rubber stamp angled across tackle tiles that exceed the Keeper's License grade or unbuilt workshops.*

```json
[
  {
    "id": "restricted_license_tier",
    "condition": "Item tackle grade exceeds Keeper's License grade",
    "stickerText": "RESTRICTED. NICE TRY.",
    "noticeBody": "Tackle grade exceeds current Custodial License. The Office notes your ambition and confiscates the requisition slip."
  },
  {
    "id": "restricted_unrestored_building",
    "condition": "Tackle requires a workshop not yet returned to the dry register",
    "stickerText": "RESTRICTED. NICE TRY.",
    "noticeBody": "Workshop unlisted on dry register. Rebuild the foundation before inquiring after its tools."
  }
]
```

---

## 6. Ambient Shoreline & Hub Observations

*Environmental lines rendered without speaker tags as the Keeper traverses the cobblestone shoreline between the lighthouse, the dock, and the restored foundations.*

```json
[
  {
    "id": "ambient_street",
    "focus": "street",
    "text": "Cobblestones end neatly at the water's edge, continuing down into the silt where the curbs still remember being dry."
  },
  {
    "id": "ambient_water",
    "focus": "water",
    "text": "The lapping at the jetty is quiet and faintly rust-coloured. Nobody on the strand mentions the stain."
  },
  {
    "id": "ambient_light",
    "focus": "light",
    "text": "The lighthouse beam sweeps over empty black water at regular intervals, searching for rooftops it already knows are there."
  }
]
```

---

## 7. Implementation Checklist & Verification

- [x] **8 Restorable Buildings:** Kebab IDs (`smokehouse`, `chandlery`, `post-office`, `bell-tower`, `chapel`, `apothecary`, `bakery`, `schoolhouse`), full 2-3 line FORM restoration notices, and one-line restored confirmation stamps.
- [x] **8 Returned Residents:** 8 named proprietors matching historical Anglo-provincial naming conventions, 2-3 standard doorstep barks each, plus 1 escalation bark (5+ restorations).
- [x] **Strict 140-Character Cap:** All 32 barks individually audited and verified ≤ 140 characters.
- [x] **Rig-Up UI Copy:** 7 slot headers/flavor lines in the municipal register voice + 2 distinct `RESTRICTED. NICE TRY.` context variants.
- [x] **3 Ambient Hub Lines:** Covering the drowned street, the red-tinged shore water, and the lighthouse beam sweep.
- [x] **Narrative Consistency:** Reuses Greywater Hollow, the Office of Returns, the founder, the dam/spillway disaster, and preserves Maren's exclusion from the town street.
