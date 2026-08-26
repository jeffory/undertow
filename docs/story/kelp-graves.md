# UNDERTOW — Story Bible: The Kelp Graves (Zone 2)

*Implementation Reference: `plan.md` §2.1, §2.6, §4.4, §6.3; `docs/plan/05-meta-and-content.md` §2.1 (M6); `docs/story/voice.md`*  
*Zone Profile: Dense bone-teal fog, vertical kelp columns rising like cemetery headstones, drifting silt particle curtain, tangled gill-nets. The outskirts of the submerged valley where collective memory and municipal order begin to fray.*

---

## 1. Narrative & Environmental Principles

### The Outskirts of the Flood
The Kelp Graves represent the perimeter of Greywater Hollow. Before the deluge, these were the low fen pastures, field boundaries, and the parish graveyard of Saint Jude-in-the-Fens. Now, thirty fathoms under, the giant kelp anchors into consecrated mud, forming towering, unyielding pillars that block lantern light and ensnare haulage tackle.

### Core Tonal Rules
1. **Ecclesiastical Dread Meets Sluice Bureaucracy:** The horror here shifts from early rustic fishing mishaps into the crowded, collective weight of a submerged congregation. The Office of Returns continues to log souls as salvageable municipal inventory.
2. **Kelp as Grave Markers:** Kelp stalks do not wave loosely in the current; they stand rigid and upright like towering headstones, casting long shadows across drowned field fences.
3. **Collective Massing (The Swarm):** Catches here no longer fight merely as isolated beasts. They school in disciplined formations, mirroring the social structures and parish rolls of the town they drowned with.

---

## 2. Technical Data Schemas

```ts
export interface AmbientZoneLine {
  id: string;
  focus: 'kelp' | 'nets' | 'silt' | 'fog' | 'depth' | 'silence';
  text: string;                  // Strictly < 140 chars
}

export interface CongregationInvoiceRow {
  accountNumber: number;        // 1..47
  speciesOrName: string;        // Specific item or resident descriptor
  entryText: string;            // The rendered line: '1x [SPECIES] - ledgered. Account N of 47.'
  tone: 'bureaucratic' | 'absurd' | 'unsettling' | 'tragic' | 'terminal';
}

export interface CongregationInvoiceManifest {
  formCode: string;             // e.g. "FORM 47-B: AGGREGATE RECEIPT & DISCHARGE MANIFEST"
  title: string;
  rowTemplate: string;          // "1x [SPECIES] - ledgered. Account N of 47."
  totalAccounts: number;        // 47
  seededRows: CongregationInvoiceRow[];
  closingStamp: string;
}

export interface BestiaryRecord {
  id: string;
  name: string;
  zone: 2;
  rarity: 'C' | 'U' | 'R' | 'E' | 'Drowned' | 'Boss';
  eligibility: 1 | 2 | 3;
  category: 'catch' | 'crawler' | 'caller' | 'snatcher' | 'dragger' | 'bagman' | 'boss';
  silhouette: string;           // Shown before catch (1 line)
  entryFought: string;          // Standard 2-line entry (1-3 sentences)
  entryWilling?: string;        // Unlocked via Maren's Thimble
}
```

---

## 3. Zone-Ambient Lines (Environmental Observations)

*Displayed as subtle DOM text overlays during traversal through the Kelp Graves. No speaker attribution. Each line audited to strictly under 140 characters.*

```json
[
  {
    "id": "ambient_kelp_01",
    "focus": "kelp",
    "text": "Kelp columns rise like parish headstones, thick with black ribbon and thirty years of unfiled claims."
  },
  {
    "id": "ambient_kelp_02",
    "focus": "nets",
    "text": "Old hemp gill-nets drift between the stalks, still waiting for the herring season of October fourteenth."
  },
  {
    "id": "ambient_kelp_03",
    "focus": "silt",
    "text": "Silt sifts downward through the bone-teal gloom, burying sunken field fences an inch at a time."
  },
  {
    "id": "ambient_kelp_04",
    "focus": "silence",
    "text": "The stalks do not sway with current. They lean toward the centre of the basin, as if summoned."
  },
  {
    "id": "ambient_kelp_05",
    "focus": "depth",
    "text": "A rusted winch cable vanishes into the murk, holding down something that stopped struggling decades ago."
  },
  {
    "id": "ambient_kelp_06",
    "focus": "fog",
    "text": "It is so quiet beneath forty feet of kelp that you can hear the silt settling on the hull of your dinghy."
  }
]
```

---

## 4. Boss Climax Overlay: The Congregation Invoice

*Triggered upon exhausting and landing the Zone 2 Boss (**The Congregation**). The school bursts into dozens of individual landed catches as the ledger overlay descends down the screen. Rows start with deadpan municipal comedy and descend into devastating personal recognition. The laughter stops at Row 47.*

### Masthead
`[FORM 47-B: AGGREGATE RECEIPT & DISCHARGE MANIFEST]`  
`PARISH OF SAINT JUDE-IN-THE-FENS (SUBMERGED OCT. 14)`  
`THE OFFICE OF RETURNS — SCHEDULE OF BATCH DISCHARGE`

### Row Template
`1x [SPECIES] - ledgered. Account N of 47.`

### Seeded Rows (JSON Array)

```json
{
  "formCode": "FORM 47-B: AGGREGATE RECEIPT & DISCHARGE MANIFEST",
  "title": "PARISH OF SAINT JUDE-IN-THE-FENS (SUBMERGED OCT. 14)",
  "rowTemplate": "1x [SPECIES] - ledgered. Account N of 47.",
  "totalAccounts": 47,
  "seededRows": [
    {
      "accountNumber": 1,
      "speciesOrName": "Parish Basset Hound (answering faintly to 'Barnaby')",
      "entryText": "1x Parish Basset Hound (answering faintly to 'Barnaby') - ledgered. Account 1 of 47.",
      "tone": "absurd"
    },
    {
      "accountNumber": 7,
      "speciesOrName": "Verger's Assistant (carrying three unreturned brass collection plates)",
      "entryText": "1x Verger's Assistant (carrying three unreturned brass collection plates) - ledgered. Account 7 of 47.",
      "tone": "bureaucratic"
    },
    {
      "accountNumber": 16,
      "speciesOrName": "Pew-Renter, Fourth Row North (quarterly dues in arrears)",
      "entryText": "1x Pew-Renter, Fourth Row North (quarterly dues in arrears) - ledgered. Account 16 of 47.",
      "tone": "bureaucratic"
    },
    {
      "accountNumber": 24,
      "speciesOrName": "Second Treble, Youth Choir (refusing to drop pitch)",
      "entryText": "1x Second Treble, Youth Choir (refusing to drop pitch) - ledgered. Account 24 of 47.",
      "tone": "unsettling"
    },
    {
      "accountNumber": 33,
      "speciesOrName": "Sunday School Instructor (holding attendance book dry above water)",
      "entryText": "1x Sunday School Instructor (holding attendance book dry above water) - ledgered. Account 33 of 47.",
      "tone": "unsettling"
    },
    {
      "accountNumber": 41,
      "speciesOrName": "Silas Callow, Sexton (resisting extraction; claims nave is merely damp)",
      "entryText": "1x Silas Callow, Sexton (resisting extraction; claims nave is merely damp) - ledgered. Account 41 of 47.",
      "tone": "tragic"
    },
    {
      "accountNumber": 45,
      "speciesOrName": "Mother & Infant, Unnamed (found beneath the communion rail)",
      "entryText": "1x Mother & Infant, Unnamed (found beneath the communion rail) - ledgered. Account 45 of 47.",
      "tone": "tragic"
    },
    {
      "accountNumber": 47,
      "speciesOrName": "Ruth Oakes, newborn (the child Maren stayed to deliver)",
      "entryText": "1x Ruth Oakes, newborn (the child Maren stayed to deliver) - ledgered. Account 47 of 47.",
      "tone": "terminal"
    }
  ],
  "closingStamp": "STAMP: ALL 47 ACCOUNTS SURRENDERED — QUORUM RESTORED — NO FURTHER SINGING PERMITTED — THE OFFICE EXTENDS CONGRATULATIONS ON YOUR HEAVY ARM"
}
```

---

## 5. Zone 2 Bottle Notes Registry (The Outskirts Set)

*Washed down from the drowned valley outskirts. Darker, colder, and more regulatory than the Shallows set.*

```json
[
  {
    "id": "note-z2-01-marker-tolerances",
    "order": 7,
    "tier": 2,
    "tone": "regulatory",
    "formRef": "CIRCULAR 19: FLORA OF THE SUNKEN MEADOWS",
    "title": "On Rooted Obstructions and Headstones",
    "body": "The Office clarifies that kelp columns rooted in consecrated ground are legally classified as grave markers. Reeling across family plots without slack constitutes municipal trespass. Should your line wrap a marker, you are advised not to yank; the tenant below may mistake the tension for an invitation.",
    "stamp": "CONSECRATED GROUND — DO NOT DRAG",
    "trigger": { "kind": "zoneReached", "value": 2 }
  },
  {
    "id": "note-z2-02-gillnet-salvage",
    "order": 8,
    "tier": 2,
    "tone": "procedural",
    "formRef": "MEMORANDUM 8-K: GILL-NET DISPENSATION",
    "title": "Concerning Abandoned Mesh",
    "body": "Commercial gill-nets submerged during the event of October 14th remain the property of the Parish Fisheries Syndicate. Catches found entangled within these meshes are not wild fauna; they are thirty-year-old uncollected freight. The Office assesses a standard salvage surcharge for each knot cut.",
    "stamp": "UNRESOLVED FREIGHT",
    "trigger": { "kind": "event", "value": "kelpNetSnagged" }
  },
  {
    "id": "note-z2-03-silt-elevation",
    "order": 9,
    "tier": 2,
    "tone": "passive-aggressive",
    "formRef": "INVENTORY REF: SILT-44",
    "title": "Discrepancies in Valley Elevation",
    "body": "The Silt Surveyor reports that the drowned outskirts have accumulated four inches of fine sediment over the parish roofs. At this rate, the churchyard will be level with the riverbed by century's end. The Office commends your patience; oblivion is arriving precisely on schedule.",
    "stamp": "SURVEY COMPLETED",
    "trigger": { "kind": "runCount", "value": 6 }
  },
  {
    "id": "note-z2-04-quorum-assembly",
    "order": 10,
    "tier": 2,
    "tone": "resentful",
    "formRef": "SCHEDULE D-2: AGGREGATE ASSEMBLY",
    "title": "Prohibition of Unsanctioned Quorums",
    "body": "Parishioners in the Kelp Graves have begun schooling together to meet the weight requirements of higher tribute tiers. The Office has repeatedly informed them that collective bargaining is void under reservoir statute. However, forty-seven mouths sharing one hook makes auditing considerably faster. Pull when ready.",
    "stamp": "AUDIT PENDING",
    "trigger": { "kind": "event", "value": "congregationSighted" }
  }
]
```

---

## 6. Zone 2 Species Flavor & Bestiary Entries

*Four new kelp-, grave-, and net-themed species for the Kelp Graves. Formatted according to the 2-line bestiary standard (silhouette + 1-3 sentence entry).*

```json
[
  {
    "id": "shroud-ribbon",
    "name": "Shroud-Ribbon",
    "zone": 2,
    "rarity": "C",
    "eligibility": 2,
    "category": "catch",
    "silhouette": "A flat, black blade of kelp that swims against the current.",
    "entryFought": "It weaves dead kelp into funeral bands and drags them behind its tail. It has enough linen for everybody.",
    "entryWilling": "It wraps itself gently around your wrist like a mourner's armband, ice-cold and smelling of river mud."
  },
  {
    "id": "net-choked-gudgeon",
    "name": "Net-Choked Gudgeon",
    "zone": 2,
    "rarity": "U",
    "eligibility": 2,
    "category": "snatcher",
    "silhouette": "A scarred, heavy-bellied silhouette trailing tattered hemp twine.",
    "entryFought": "It has lived in the same gill-net since the valley went under. It does not want to be cut free; it wants you to get in."
  },
  {
    "id": "cenotaph-perch",
    "name": "Cenotaph Perch",
    "zone": 2,
    "rarity": "U",
    "eligibility": 2,
    "category": "crawler",
    "silhouette": "A blocky, stone-grey shape resting upright upon sunken headstones.",
    "entryFought": "Its dorsal spines are chiseled flat like slate markers. If you scrape the silt away, you can read the initials of the town's last mason."
  },
  {
    "id": "pew-shad",
    "name": "Pew-Shad",
    "zone": 2,
    "rarity": "R",
    "eligibility": 2,
    "category": "catch",
    "silhouette": "A dense, rhythmic cluster of dark shapes hovering in disciplined rows.",
    "entryFought": "It refuses to swim alone. When hooked, the rest of the school holds its place in line, waiting for the dismissal hymn."
  }
]
```

### Detailed Bestiary Catalogue

#### 1. Shroud-Ribbon (`shroud-ribbon`)
- **Rarity:** Common | **Eligibility:** Grade 2 | **Category:** Catch
- **Silhouette:** *"A flat, black blade of kelp that swims against the current."*
- **Fought:** *"It weaves dead kelp into funeral bands and drags them behind its tail. It has enough linen for everybody."*
- **Willing (Maren's Thimble):** *"It wraps itself gently around your wrist like a mourner's armband, ice-cold and smelling of river mud."*
- **Design Notes:** Long undulating ribbon mesh using the kelp shader pass. Low mass, high fluid drag.

---

#### 2. Net-Choked Gudgeon (`net-choked-gudgeon`)
- **Rarity:** Uncommon | **Eligibility:** Grade 2 | **Category:** Snatcher
- **Silhouette:** *"A scarred, heavy-bellied silhouette trailing tattered hemp twine."*
- **Fought:** *"It has lived in the same gill-net since the valley went under. It does not want to be cut free; it wants you to get in."*
- **Design Notes:** Trailing frayed hemp alpha geometry. Attempts to intercept hooked catches and drag the line into nearby kelp colliders.

---

#### 3. Cenotaph Perch (`cenotaph-perch`)
- **Rarity:** Uncommon | **Eligibility:** Grade 2 | **Category:** Crawler
- **Silhouette:** *"A blocky, stone-grey shape resting upright upon sunken headstones."*
- **Fought:** *"Its dorsal spines are chiseled flat like slate markers. If you scrape the silt away, you can read the initials of the town's last mason."*
- **Design Notes:** Angular slate-grey body. Perches atop sunken stones and wrecks; lunges with high initial torque.

---

#### 4. Pew-Shad (`pew-shad`)
- **Rarity:** Rare | **Eligibility:** Grade 2 | **Category:** Catch
- **Silhouette:** *"A dense, rhythmic cluster of dark shapes hovering in disciplined rows."*
- **Fought:** *"It refuses to swim alone. When hooked, the rest of the school holds its place in line, waiting for the dismissal hymn."*
- **Design Notes:** Silver-dark iridescent scales. Travels in tight, synchronized micro-schools; distributes tension across multiple points.

---

## 7. Implementation Checklist & Verification

- [x] **6 Zone-Ambient Lines:** All under 140 characters, addressing kelp columns, gill-nets, drifting silt, and silence.
- [x] **The Congregation Invoice:** Masthead, standard row template (`1x [SPECIES] - ledgered. Account N of 47.`), 8 specific seeded rows spanning Accounts 1 to 47 with the required comedic-to-devastating tonal climb ending on Ruth Oakes, and official closing stamp.
- [x] **4 Zone 2 Bottle Notes:** Formatted in strict compliance with `BottleNote` TypeScript schema and `bottle-notes.md` tone escalation.
- [x] **4 Kelp-Zone Bestiary Entries:** Grounded species names (`shroud-ribbon`, `net-choked-gudgeon`, `cenotaph-perch`, `pew-shad`), 2-line entries, willing variant, and technical design notes.
- [x] **Voice & Lore Adherence:** Complete fidelity to `docs/story/voice.md`, `docs/story/town.md`, `docs/story/opening.md`, and `docs/plan/05-meta-and-content.md`.
