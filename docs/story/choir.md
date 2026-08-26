# UNDERTOW — Story Bible: The Choir (Zone 4)

*Implementation Reference: `plan.md` §2.1, §2.3, §4.4, §6.3; `docs/plan/05-meta-and-content.md` §2.3 (M8), §3.2, §4.1, §5.2, §5.8; `docs/story/voice.md`*  
*Zone Profile: Bioluminescent void. Geometry exists only where the player's lantern disc touches; black palette with emissive points in near-total fog. The ambient hum of an unresolving choral drone. Home of the roaming Whistler and the encounter with Maren's Echo.*

---

## 1. Narrative & Environmental Principles

### The Bioluminescent Void & The Singing Dark
The Choir is thirty-five fathoms down, beneath the submerged foundations of Greywater Hollow. Here, all recognizable topography ceases. There are no slate roofs, stone walls, or drowned field fences. The void is pitch black, shrouded in near-total fog. 

In this zone, **geometry exists only where light touches**. The player's lantern disc (a four-yard circle of warm tallow light) is the entire measurable universe; beyond its rim, the world is unrendered black water.

Drifting throughout the dark are hundreds of tiny emissive points. These are not phosphorus or deep-water plankton; they are **The Choir**—the suspended congregation of Greywater Hollow, floating in eternal hydrostatic rest, mouths open, sustaining a single unresolving choral chord that hovers a semitone flat.

### Core Tonal Rules
1. **Lyrical, Mournful, Unreadable:** The earlier zones progressed from dry municipal comedy (Shallows) to collective dread (Kelp Graves) to domestic grief (Township). The Choir is the fourth tier: lyrical, mournful, terrifying, and completely unreadable.
2. **The Geography of Light:** The darkness is not merely empty; it is unformed. The player fishes into a void where the far end of the tether cannot be seen until hauled into the lantern disc.
3. **The Whistler (Heard, Not Seen):** A roaming tier-4 elite that stalks outside the player's lantern radius. It is never visible until close enough to cast its own hook. A clean, human two-note whistle motif is its only telegraph.
4. **The Tonal Pivot (The Decision to Reel):** The boss encounter with **Maren's Echo** has zero hostile AI verbs. It does not lunge, thrash, or attack. The tension on the line mirrors the player's own exhaustion. The fight is the player deciding whether to reel forty fathoms of memory to the surface.
5. **Harmonization with Maren's Note:** Maren's note at 14 Willow Street established: *"We are not waiting to be retrieved. Douse the lamp, my love. Cut the line."* The Choir story layer demonstrates what retrieval actually does to the drowned, recontextualizing the entire campaign without contradicting a single word of her letter.

---

## 2. Technical Data Schemas

```ts
export interface AmbientZoneLine {
  id: string;
  focus: 'rim' | 'sound' | 'emissive' | 'void' | 'choir' | 'drift';
  text: string;                  // Strictly < 140 chars
}

export interface WhistlerDreadLine {
  id: string;
  text: string;                  // Strictly < 80 chars
}

export interface WhistlerData {
  bestiary: BestiaryRecord;
  proximityLines: WhistlerDreadLine[];
  hookLine: string;              // Strictly < 80 chars
}

export interface TruthSceneBeat {
  beat: 1 | 2 | 3;
  theme: 'the_warden' | 'the_shocked' | 'the_willing';
  title: string;
  text: string;                  // Strictly < 60 words
}

export interface BossFightCopy {
  summonMarkerText: string;
  swayLines: string[];           // 4 lines shown while holding (< 140 chars each)
  truthScene: TruthSceneBeat[];  // 3 beats (< 60 words each)
  snapLine: string;              // Tension hits 100
  dropItem: {
    id: string;
    name: string;
    category: string;
    flavorHeader: string;
    dropText: string;
  };
  bestiary: BestiaryRecord;
}

export interface ResponseBottleNote {
  id: string;
  order: number;
  tier: 4;
  tone: 'procedural' | 'passive-aggressive' | 'regulatory' | 'resentful' | 'unravelling' | 'terminal';
  residentId: string;
  stationeryRef: string;
  title: string;
  body: string;
  stamp?: string;
  trigger: {
    kind: 'runCount' | 'buildingCount' | 'zoneReached' | 'itemEquipped' | 'event' | 'licenseGrade';
    value: string | number;
  };
}

export interface BestiaryRecord {
  id: string;
  name: string;
  zone: 4;
  rarity: 'C' | 'U' | 'R' | 'E' | 'Drowned' | 'Boss';
  eligibility: 1 | 2 | 3;
  category: 'catch' | 'crawler' | 'caller' | 'snatcher' | 'dragger' | 'bagman' | 'boss';
  silhouette: string;           // Text shown before catch (1 line)
  entryFought: string;          // Standard 2-line entry (1-3 sentences)
  entryWilling?: string;        // Unlocked via Maren's Thimble
  loreNotes?: string;
}
```

---

## 3. Section 1: Zone-Ambient Lines (Environmental Observations)

*Rendered as unanchored DOM text overlays as the Keeper navigates the bioluminescent void of Zone 4. No speaker attribution. Each line audited to strictly under 140 characters.*

```json
[
  {
    "id": "ambient_choir_01",
    "focus": "rim",
    "text": "Beyond the lantern rim, there is no silt and no stone. The world only exists where the tallow reaches."
  },
  {
    "id": "ambient_choir_02",
    "focus": "sound",
    "text": "The dark does not echo. It hums a single sustained vowel, held by three hundred throats that never draw breath."
  },
  {
    "id": "ambient_choir_03",
    "focus": "emissive",
    "text": "The blue sparks in the black are not stars or phosphorus. They are the open mouths of the congregation, keeping time."
  },
  {
    "id": "ambient_choir_04",
    "focus": "void",
    "text": "Your lantern light cuts a circle four yards wide. Outside it, thirty fathoms of water pretend nothing was ever built."
  },
  {
    "id": "ambient_choir_05",
    "focus": "choir",
    "text": "A choral chord hangs in the black water, hovering a half-step flat. It does not resolve because no one has dismissed them."
  },
  {
    "id": "ambient_choir_06",
    "focus": "drift",
    "text": "Drifting lights part as the boat glides through. They do not scatter; they make room in the choir stalls."
  }
]
```

---

## 4. Section 2: The Whistler (Roaming Elite)

*Encounter Design: The Whistler is a tier-4 roaming predator that stalks in the pitch black beyond the lantern disc. It never enters visible range voluntarily; instead, it casts its own heavy line into the light and hooks YOU (a reverse-tether encounter). The player's only early warning is an eerie, human two-note whistle motif.*

```json
{
  "bestiary": {
    "id": "the-whistler",
    "name": "The Whistler",
    "zone": 4,
    "rarity": "E",
    "eligibility": 3,
    "category": "dragger",
    "silhouette": "A tall, unjointed shadow whistling two sharp notes just past the lantern's reach.",
    "entryFought": "It carries its own rod and line in the pitch dark. It does not wait for a bite; it searches the light until it finds a mouth."
  },
  "proximityLines": [
    {
      "id": "whistler_dread_01",
      "text": "A clean two-note whistle drifts in from the black, perfectly on pitch."
    },
    {
      "id": "whistler_dread_02",
      "text": "The whistling stopped. Something is standing just beyond the tallow glow."
    },
    {
      "id": "whistler_dread_03",
      "text": "A tune you used to know, whistled through teeth that never breathe."
    }
  ],
  "hookLine": "A barb bites your coat. Something in the darkness begins to reel."
}
```

---

## 5. Section 3: Maren's Echo (Zone 4 Boss Encounter)

*Encounter Concept: Not Maren herself, but the town's memory of her wearing the flood. The boss has zero hostile verbs: no lunges, no thrashing, no bites. It stands at maximum line length, swaying gently with the basin current. Reeling pulls her closer, but tension rises with proximity, draining stamina directly as an acoustic mirror of the Keeper's exhaustion. If tension hits 100, the line snaps and she sinks peacefully away ("goes home"). Landing her produces a clean catch and triggers THE TRUTH SCENE.*

### 5.1 Summon Marker Text
`[SUMMON NODE: ACOUSTIC DISTURBANCE 00-ECHO]`  
*"A circle of emissive lights holding silence like a held breath. A single silhouette stands in forty fathoms of quiet, wrapped in drenched white linen."*

### 5.2 Sway-State Lines
*Displayed at timed intervals if the player holds the line without reeling. Patient, unhurried, and calm—the Echo will wait forever.*

```json
[
  {
    "id": "sway_state_01",
    "text": "It sways with the slow pulse of the basin, mirroring the rise and fall of your shoulders."
  },
  {
    "id": "sway_state_02",
    "text": "The line hangs loose between you. It does not pull; it waits for your hands to tire."
  },
  {
    "id": "sway_state_03",
    "text": "Water drifts through her white linen. She has thirty years of patience, and nowhere else to be."
  },
  {
    "id": "sway_state_04",
    "text": "No struggle on the cord. If you do not reel, both of you will stand here until the oil burns dry."
  }
]
```

### 5.3 The Truth Scene (Full Reel Climax)
*Triggered upon completing the reel and landing Maren's Echo. Displayed as three consecutive fullscreen textual beats over dark water. Each beat is audited to strictly under 60 words.*

```json
[
  {
    "beat": 1,
    "theme": "the_warden",
    "title": "Beat 1: The Warden",
    "text": "The Mouth is no devourer. It is a warden, appointed to keep the drowned valley in quiet, unbroken custody. Its cold ledgers do not punish; they protect the silence of four hundred souls resting beneath forty fathoms. It only demands tribute because you refuse to leave the gate."
  },
  {
    "beat": 2,
    "theme": "the_shocked",
    "title": "Beat 2: The Shocked",
    "text": "Your iron hook brings no salvation. Hauling a soul to the dry strand only tears them from peace, shocking them back into shivering, waterlogged flesh to inhabit damp shops and placate your thirty-year penance. They smile on the cobbles because they pity the man who cannot stop pulling."
  },
  {
    "beat": 3,
    "theme": "the_willing",
    "title": "Beat 3: The Willing",
    "text": "The ones who vanish at night are not lost; they go home willingly. They walk down the jetty back into the dark water, returning to the Choir where the silence is deep and whole. Maren told you thirty years ago: they are not waiting to be retrieved."
  }
]
```

### 5.4 Snap Line (Tension Reaches 100)
`[LINE SNAP / OVER-STRAIN]`  
*"The line snaps. The Echo does not flee; she drifts backward into the choir of lights, unhooked and at peace. Gone home."*

### 5.5 Boss Drop: Story Item Description
```json
{
  "id": "echos-scale",
  "name": "The Echo's Scale",
  "category": "drowned_item",
  "flavorHeader": "EXHIBIT 4-E: RESIDUAL CASTING",
  "dropText": "A single translucent scale, curved like a fingernail and cold as river ice. Held up to the tallow flame, it reflects not your face, but the parlor window of 14 Willow Street on the night the reservoir rose. It carries no weight in the palm."
}
```

### 5.6 Bestiary Record
```json
{
  "id": "marens-echo",
  "name": "Maren's Echo",
  "zone": 4,
  "rarity": "Boss",
  "eligibility": 3,
  "category": "boss",
  "silhouette": "A figure in drenched linen hovering in the void, facing away from the boat.",
  "entryFought": "Not Maren, but the shape the water made to hold the memory of her. When you reel, it does not fight the steel; it mirrors the exhaustion in your wrists until your own hands surrender.",
  "entryWilling": "When taken with the thimble, it turns to look at you. It has no eyes, only the reflection of the lantern room thirty years ago, and it whispers that the child fell asleep before the water touched the crib."
}
```

---

## 6. Section 4: Zone 4 Response Bottle Notes (The Restored Writing Back)

*Lore Twist: Unlike Tiers 1–3, these bottles did not wash down from the flood thirty years ago, nor were they drafted by The Office of Returns. They are RESPONSES, written recently on dry paper by the restored residents of Greywater Hollow (`docs/story/town.md`) and cast back into the water. The Keeper recognizes their handwriting. The game never explains why.*

```json
[
  {
    "id": "note-z4-01-response-bakery",
    "order": 19,
    "tier": 4,
    "tone": "unravelling",
    "residentId": "arthur-finch",
    "stationeryRef": "GREASEPROOF BAKERY SLIP (RECENT, FLOUR-SMUDGED)",
    "title": "Response from the Commons Oven",
    "body": "To the lower hearth,\n\nThe crust is dry up here, but it cools too fast in the wind. The flour does not taste of river silt anymore, and the customers have nothing to say to one another across the counter. I have left the dough by the jetty. Do not send for more yeast; the cold keeps it quiet enough.\n\n— A. Finch",
    "stamp": "DELIVERED BY SURFACE TIDE",
    "trigger": { "kind": "buildingCount", "value": 7 }
  },
  {
    "id": "note-z4-02-response-schoolhouse",
    "order": 20,
    "tier": 4,
    "tone": "passive-aggressive",
    "residentId": "clara-blackwood",
    "stationeryRef": "RULED SLATE PAPER (RECENT, RED PENCIL)",
    "title": "Addendum to the Morning Roll",
    "body": "To the Third Row, Submerged,\n\nI called the roll this morning on dry gravel. Only seven answered. Their desks are terribly loud when the wood dries and shrinks.\n\nYou were right about the arithmetic: four hundred minus four hundred leaves nothing behind to shiver. Keep your seats. I will bring the slates down when the bell rings.\n\n— C. Blackwood",
    "stamp": "ATTENDANCE MARKED",
    "trigger": { "kind": "event", "value": "whistlerEncountered" }
  },
  {
    "id": "note-z4-03-response-chapel",
    "order": 21,
    "tier": 4,
    "tone": "resentful",
    "residentId": "silas-callow",
    "stationeryRef": "HYMNAL FLYLEAF (RECENT, IRON GALL INK)",
    "title": "Notice to the Nave",
    "body": "To those remaining in the pews,\n\nHe brought the altar up yesterday. It stands on the gravel smelling of salt and wet cedar. We tried to sing Hymn 142 at dusk, but the air is too thin and our ribs hurt when we draw breath.\n\nDo not rise when he casts. The singing is better where the water holds the choir together.\n\n— S. Callow, Sexton",
    "stamp": "PARISH DISPATCH — UNRECORDED",
    "trigger": { "kind": "event", "value": "marensEchoApproached" }
  }
]
```

---

## 7. Implementation Checklist & Verification

- [x] **6 Zone-Ambient Lines:** All structured in JSON, focus on the geometryless void, lantern rim, dark sound, and emissive Choir points. Audited to strictly ≤ 122 characters (cap: 140).
- [x] **The Whistler Elite Suite:** 2-line bestiary entry, 3 proximity dread lines (all ≤ 73 characters, cap: 80), and 1 reverse-tether hook line (65 characters, cap: 80).
- [x] **Maren's Echo Encounter Suite:**
  - [x] Summon marker text with acoustic disturbance framing.
  - [x] 4 sway-state lines shown during hold intervals (all ≤ 97 characters, cap: 140).
  - [x] 3-beat Truth Scene (The Warden: 48 words; The Shocked: 48 words; The Willing: 47 words; all strictly < 60 words). Harmonizes with and deepens Maren's note at 14 Willow Street.
  - [x] Tension-100 snap line ("Gone home").
  - [x] The Echo's Scale story drop item.
  - [x] Bestiary record with fought entry and devastating willing variant.
- [x] **3 Zone 4 Response Bottle-Notes:** Authored recently by returned residents Arthur Finch (Baker), Clara Blackwood (Schoolteacher), and Silas Callow (Sexton), writing back down into the water without direct explanation.
- [x] **Voice & Lore Consistency:** Complete adherence to `docs/story/voice.md`, `docs/story/town.md`, `docs/story/township.md`, `docs/story/kelp-graves.md`, and `docs/plan/05-meta-and-content.md`.
