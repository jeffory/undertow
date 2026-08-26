# UNDERTOW — Story Bible: The Township (Zone 3)

*Implementation Reference: `plan.md` §2.1, §2.2, §2.6, §4.4, §6.3; `docs/plan/05-meta-and-content.md` §2.2 (M7), §3.2, §4.3; `docs/story/voice.md`*  
*Zone Profile: Submerged Greywater Hollow. Sodium-lamp amber glow through black water, walkable slate rooftops over flooded avenues, church steeple cutting the surface, enterable drowned interiors, and the cinema marquee still lit underwater.*

---

## 1. Narrative & Environmental Principles

### The Heart of the Deluge
The Township is not a ruin; it is the drowned town itself, preserved in forty fathoms of quiet, freezing water. Thirty years after the spillway gate was opened, the street lamps still cast a diffuse sodium-amber halo through the silt. Shop signs swing lazily on bronze brackets, curtains drift out of open sash windows, and the marquee of the Lyceum Cinema still burns, advertising the matinee that was playing when the siren sounded.

### Core Tonal Rules
1. **The Pivot Point (The Laughter Stops):** Shallows had rustic gallows comedy; Kelp Graves had ecclesiastical massing. The Township is where the comedy stops being funny and turns irrevocably into recognizable, domestic grief.
2. **Walkable Rooftops & Enterable Interiors:** Traversal occurs across slate ridges and telephone wires above flooded roadways. Dropping into an interior provides shelter from drag vectors, but traps the Keeper between papered parlor walls where the drowned spent their last hour.
3. **The Second Mouth:** Fishing here is contested. The Snatchers are not predators; they are the desperate, multi-jointed hunger of a town that refuses to watch another soul leave without auditing the haul.
4. **The Courtesy of the Drowned:** The Postmaster does not attack out of rage. He hooks the Keeper with courteous, municipal delivery telegraphs, overjoyed to finally clear thirty years of waterlogged parcels.

---

## 2. Technical Data Schemas

```ts
export interface EnvironmentalTextEntry {
  id: string;                    // e.g. "env-z3-marquee"
  locationHint: string;          // In-world locator for overlay anchor
  text: string[];                // 1-2 lines of rendered text (no speaker)
  loreTag?: string;              // Context reference
}

export interface BossDialogueLine {
  id: string;
  verb: string;                  // Telegraph label
  line: string;                  // In-game speech bubble text (< 60 chars)
  isCanonical: boolean;          // Plan §2.2 canonical line
}

export interface BestiaryRecord {
  id: string;
  name: string;
  zone: 3;
  rarity: 'C' | 'U' | 'R' | 'E' | 'Drowned' | 'Boss';
  eligibility: 1 | 2 | 3;
  category: 'catch' | 'crawler' | 'caller' | 'snatcher' | 'dragger' | 'bagman' | 'boss';
  silhouette: string;            // Text shown before catch (1 line)
  entryFought: string;           // Standard entry (1-3 sentences)
  entryWilling?: string;         // Unlocked via Maren's Thimble
  loreNotes?: string;
}

export interface SnatcherMomentLine {
  id: string;
  trigger: 'intercept' | 'splitTension' | 'stolenCatch';
  text: string;                  // UI-adjacent alert (< 80 chars)
}

export interface BottleNote {
  id: string;
  order: number;
  tier: 3;
  tone: 'procedural' | 'passive-aggressive' | 'regulatory' | 'resentful' | 'unravelling' | 'terminal';
  formRef: string;
  title: string;
  body: string;
  stamp?: string;
  trigger: {
    kind: 'runCount' | 'buildingCount' | 'zoneReached' | 'itemEquipped' | 'event' | 'licenseGrade';
    value: string | number;
  };
}
```

---

## 3. Section 1: Environmental Text (12 Entries)

*Relics of the night the reservoir rose, rendered in place via DOM overlay as the Keeper traverses rooftops, shopfronts, and submerged parlor rooms. Quiet, unhurried, without speaker attribution.*

```json
[
  {
    "id": "env-z3-01-marquee",
    "locationHint": "Lyceum Cinema Marquee (lit amber underwater)",
    "text": [
      "SOMETHING IN THE WATER — CONTINUOUS SHOWINGS UNTIL THE LEVEES BREAK.",
      "MATINEE 2D. EVES 4D. BALCONY PATRONS REMAIN SEATED."
    ],
    "loreTag": "mandatory-marquee"
  },
  {
    "id": "env-z3-02-post-office-door",
    "locationHint": "District Post Office Submerged Entrance",
    "text": [
      "OUTGOING DISPATCH SUSPENDED DUE TO RISING TIDE.",
      "PLEASE DEPOSIT ALL WATERPROOF PARCELS ON THE TOP SORTING SHELF."
    ],
    "loreTag": "communications"
  },
  {
    "id": "env-z3-03-mercer-drapery",
    "locationHint": "Mercer & Sons Drapery Signboard",
    "text": [
      "MERCER & SONS: WHITE LINEN BY THE YARD.",
      "SUITABLE FOR BRIDAL VEILS, CHRISTENINGS, OR SUDDEN IMMERSION."
    ],
    "loreTag": "town-commerce"
  },
  {
    "id": "env-z3-04-church-hymn-board",
    "locationHint": "Parish Church Steeple (Waterline Level)",
    "text": [
      "HYMNS FOR SUNDAY EVE: 142 ('PERIL ON THE DEEP'), 304 ('ABIDE WITH ME').",
      "PRAYERS FOR THE SLUICE HOUSE CONCLUDED AT DUSK."
    ],
    "loreTag": "ecclesiastical"
  },
  {
    "id": "env-z3-05-bakery-slate",
    "locationHint": "Hollow Commons Bakery Window Slate",
    "text": [
      "TODAY'S BAKE: SOURDOUGH & CRUSTED RYE.",
      "FLOUR STORE TRANSFERRED TO ATTIC. NO CREDIT EXTENDED UNDER HIGH WATER."
    ],
    "loreTag": "town-commerce"
  },
  {
    "id": "env-z3-06-sluice-station-plaque",
    "locationHint": "Sluice Control Sub-Station No. 3",
    "text": [
      "HEAD CAPACITY: 10,000 CFS. IN EMERGENCY, SPILLWAY VALVE OVERRIDES BASIN SETTLEMENT.",
      "KEEPER'S ARITHMETIC IS STATUTORY AND FINAL."
    ],
    "loreTag": "spillway-precedent"
  },
  {
    "id": "env-z3-07-schoolhouse-board",
    "locationHint": "Parish Schoolhouse Slate",
    "text": [
      "OCTOBER 14: ARITHMETIC DRILL — SUBTRACTION OF FRACTIONS.",
      "CLASS MOTTO: 'THE WATER FINDS ITS LEVEL WITHOUT PERMISSION.'"
    ],
    "loreTag": "education"
  },
  {
    "id": "env-z3-08-apothecary-stencil",
    "locationHint": "Weirside Apothecary Gilded Window",
    "text": [
      "M. VANCE, CHEMIST: TINCTURE OF CAMPHOR, CHLORAL HYDRATE, RESTORATIVE DROPS.",
      "CLOSED TEMPORARILY FOR REMOVAL OF PHIALS ABOVE GROUND LEVEL."
    ],
    "loreTag": "dispensary"
  },
  {
    "id": "env-z3-09-willow-st-marker",
    "locationHint": "Willow Street Cast-Iron Signpost",
    "text": [
      "WILLOW STREET — NOS. 1 TO 28.",
      "DEAD END. BASIN DRAINAGE DITCH 50 YARDS WEST."
    ],
    "loreTag": "willow-street"
  },
  {
    "id": "env-z3-10-cinema-lobby-frame",
    "locationHint": "Lyceum Cinema Foyer Glass Case",
    "text": [
      "COMING NEXT THURSDAY: 'SUNSHINE OVER THE WEIR' — A SPARKLING COMEDY.",
      "PATRONS ARE REQUESTED NOT TO BRING GUM-BOOTS INTO THE ORCHESTRA."
    ],
    "loreTag": "cinema"
  },
  {
    "id": "env-z3-11-founders-bench",
    "locationHint": "Town Basin Memorial Bench Plaque",
    "text": [
      "ERECTED BY THE FOUNDER IN MEMORY OF DRY WEATHER.",
      "'A TOWER ON THE RIDGE IS CHEAPER THAN A FLOOD IN THE CRADLE.'"
    ],
    "loreTag": "founder"
  },
  {
    "id": "env-z3-12-chapel-vestry-notice",
    "locationHint": "Saint Jude Vestry Door Pin-Board",
    "text": [
      "ALL PARISH REGISTERS SECURED IN LEAD CASKET BENEATH THE PULPIT.",
      "IF FOUND AFTER RECESSION, DELIVER UNREAD TO THE DIOCESE."
    ],
    "loreTag": "ecclesiastical"
  }
]
```

---

## 4. Section 2: Maren's Note (14 Willow Street)

*Location: 14 Willow Street, the only house in the drowned Township with a kerosene lamp still burning amber behind submerged second-floor curtains. Written in Maren's steady, unhurried hand on midwife stationery while delivering Ruth Oakes as the water rose through the floorboards.*  
*Narrative Function: Unlocks the CUT ending prompt at the final encounter with The Office of Returns (`docs/plan/05-meta-and-content.md` §3.2).*

### Internal Drafting Process & Progression

#### Draft 1 (Initial Narrative Alignment)
> Thomas,
> The girl arrived at three. Seven pounds, loud lungs, her mother's chin. We washed her in the zinc tub by the stove before the pipes backed up.
> The cellar door gave way twenty minutes later.
> I know what the gauges are reading up on the ridge. I know the height of the weir. You are sitting in the lantern room watching the rain beat against the glass, calculating four hundred against ten thousand, wondering if you have the right to choose.
> You always had the right. You always do the arithmetic.
> We are on the second floor now. Ruth is sleeping on my shoulder, wrapped in dry flannel. The water on the stairs is quiet. It sounds like someone wiping the floor.
> If you are reading this, the basin filled. If you are reading this thirty years from now, you are still turning wheels.
> Do not come down for me with an iron hook. We are not lost; we are only under.
> Turn the lamp out. Let the water be.
> *(168 words)*

*Critique 1:* Strong narrative core, but "thirty years from now" and "with an iron hook" lean slightly too prescient for a handwritten note left in the hour of drowning.

#### Draft 2 (Atmospheric & Psychological Deepening)
> Past three now.
> The baby has Clara's eyes and her grandfather's temper. She took one breath and screamed before the tallow guttered. We named her Ruth, as agreed.
> The floorboards in the hall are lifting.
> I hear the spillway open. I heard the roar three minutes before the water reached Willow Street. You waited as long as you could, didn't you? You always wait until the last mark on the gauge.
> The town thinks you made a choice between them and the valley below. But I know you, Thomas. You didn't choose the ten thousand. You chose what was right, and then you stayed in the tower to punish yourself for being correct.
> The water is at the landing now. It is cold, but it isn't angry. It's just heavy.
> Ruth is asleep against my chest. Her skin is warm.
> If the light is still turning when the rain stops, do not spend the rest of your life trying to pull us back to the dry cobbles. There is nothing wrong with the dark down here.
> Put the line down.
> *(182 words)*

*Critique 2:* Very evocative. Captures the psychological trap of his penance ("punish yourself for being correct"), but needs sharper rhythm and the exact thematic trigger phrasing for the CUT ending.

#### Draft 3 (Final Canonical Masterpiece — Selected)
*Delivered text (195 words):*

> **Quarter past three.**
> 
> **The child is a girl. Seven pounds, crying with full throat until we swaddled her in the dry linen from Mercer's. Clara is resting. We have agreed on Ruth.**
> 
> **The lower hall is already two feet under.**
> 
> **I felt the shudder in the floorboards when you lifted the gate. You held it forty minutes past the safety mark. I know what the rain was doing to the reservoir wall, Thomas. I know what ten thousand lives downstream look like on your ledger.**
> 
> **Do not tell yourself you broke a promise. You kept the only one that mattered: you stayed at the wheel.**
> 
> **The water has reached the second tread. It is remarkably quiet. Not a flood like the river, but a rising bath, polite and patient. Ruth is asleep on my shoulder. She has never known the sun, and she is not afraid of the dark.**
> 
> **If you are still up in that tower when this settles—if you are still staring into the black water trying to haul thirty years of guilt to the surface—stop.**
> 
> **We are not waiting to be retrieved.**
> 
> **Douse the lamp, my love. Cut the line.**

### Recontextualization Analysis
- **Card 2 & 3 Resolution:** The opening cards framed the flood as an agonizing betrayal ("You promised to hold the water until morning. You did not hold the water until morning."). Maren's note reveals that she knew the math, felt him hold the sluice gate forty minutes past the structural failure threshold, and absolves him of the false promise.
- **The Core Tragedy:** The sin is not opening the spillway thirty years ago; the sin is spending thirty years hooking, dragging, and forcing forty fathoms of peaceful, settled dead back into the cold air to fuel an impossible penance.
- **The CUT Directive:** "Cut the line" transforms from a gameplay forfeit into an act of supreme mercy, letting the Hollow remain whole, unhooked, and at peace.

---

## 5. Section 3: The Postmaster (Zone 3 Boss)

*Boss Concept: A reverse-tether encounter. The Postmaster hooks YOU with heavy delivery twine and drags you toward sorting grates and flooded chutes. His dialogue appears in courteous, municipal speech bubbles above his head. He is not malicious—he is simply thrilled to finally clear his thirty-year backlog.*

### Dialogue & Speech-Bubble Telegraphs

```json
[
  {
    "id": "postmaster_telegraph_01",
    "verb": "REVERSE_PULL",
    "line": "SPECIAL DELIVERY.",
    "isCanonical": true
  },
  {
    "id": "postmaster_telegraph_02",
    "verb": "LINE_WHIP",
    "line": "RETURN TO SENDER.",
    "isCanonical": true
  },
  {
    "id": "postmaster_telegraph_03",
    "verb": "HAZARD_DRAG",
    "line": "SIGN HERE.",
    "isCanonical": true
  },
  {
    "id": "postmaster_courtesy_04",
    "verb": "APPROACH",
    "line": "POSTAGE DUE UPON RECEIPT.",
    "isCanonical": false
  },
  {
    "id": "postmaster_courtesy_05",
    "verb": "TENSION_SPIKE",
    "line": "PLEASE INITIAL THE MARGIN.",
    "isCanonical": false
  },
  {
    "id": "postmaster_courtesy_06",
    "verb": "REPOSITION",
    "line": "FORWARDING SERVICE REQUESTED.",
    "isCanonical": false
  },
  {
    "id": "postmaster_courtesy_07",
    "verb": "BRACE_CHECK",
    "line": "FRAGILE: DO NOT BEND.",
    "isCanonical": false
  },
  {
    "id": "postmaster_courtesy_08",
    "verb": "STAGE_TRANSITION",
    "line": "SIGNATURE REQUIRED UPON SUBMERSION.",
    "isCanonical": false
  }
]
```

### The Postmaster Bestiary Entry

```json
{
  "id": "the-postmaster",
  "name": "The Postmaster",
  "zone": 3,
  "rarity": "Boss",
  "eligibility": 2,
  "category": "boss",
  "silhouette": "A tall, waterlogged figure in a brass-buttoned coat, sorting parcels in the current.",
  "entryFought": "He carried thirty years of unread letters through forty fathoms of dark water. He is not angry about the flood; he is merely glad to finally clear his sorting bag."
}
```

### Boss Drop: Story Item Description

```json
{
  "id": "forwarding-address",
  "name": "District Forwarding Address",
  "category": "story_item",
  "flavorHeader": "SCHEDULE 3-P: NOTIFICATION OF PERMANENT ADDRESS",
  "dropText": "A water-damaged parcel slip written in faded purple pencil: 'The Keeper, Sluice House No. 1, Greywater Basin. All future correspondence to be tendered directly.' The Post Office on dry land can now resume direct sorting."
}
```

---

## 6. Section 4: Snatcher Flavor

*Snatcher Mechanic: Snatchers patrol the submerged avenues and chimneys. When the Keeper hooks a catch, a Snatcher intercepts the line, latching on as a second mouth. The line tension divides; the Keeper must strike or exhaust the Snatcher or lose the catch entirely.*

### Snatcher Bestiary Entry

```json
{
  "id": "gallows-snatcher",
  "name": "Gallows Snatcher",
  "zone": 3,
  "rarity": "U",
  "eligibility": 2,
  "category": "snatcher",
  "silhouette": "A lean, many-jointed jaw darting between submerged chimney stacks.",
  "entryFought": "It waits for another mouth to take the hook before biting down on both. In Greywater Hollow, nothing is surrendered without an audit.",
  "entryWilling": "It clasps its jaws around your empty hook without biting, holding the steel gently in its throat like a pledge it forgot how to make."
}
```

### Second Mouth on the Line: UI-Adjacent Moment Lines

*Rendered on the central HUD tension meter when a Snatcher intercepts active cordage. All audited to strictly under 80 characters.*

```json
[
  {
    "id": "snatcher_moment_01",
    "trigger": "intercept",
    "text": "A second mouth has taken the line. Split tension detected."
  },
  {
    "id": "snatcher_moment_02",
    "trigger": "splitTension",
    "text": "The catch is contested. The Snatcher requests its share."
  },
  {
    "id": "snatcher_moment_03",
    "trigger": "stolenCatch",
    "text": "Two mouths on one hook. Neither intends to let go."
  }
]
```

---

## 7. Section 5: Zone 3 Bottle Notes Registry (Written Inside the Hollow)

*Unlike the Shallows and Outskirts notes, these four documents never washed ashore on the gravel beach. They were penned, stamped, and sealed inside the flooded parlor rooms and municipal offices of Greywater Hollow itself.*

```json
[
  {
    "id": "note-z3-01-cinema-reel",
    "order": 13,
    "tier": 3,
    "tone": "passive-aggressive",
    "formRef": "LYCEUM PROGRAMME ARCHIVE: REEL 4",
    "title": "Submerged Matinee Schedule",
    "body": "The projectionist wishes to notify patrons that 'Something in the Water' will continue playing on continuous loop through all subsequent flooding. Refunds in dry coin are strictly impossible. Patrons in the stalls are reminded that water rises from the orchestra upward.",
    "stamp": "NO ADMISSION AFTER CURTAIN",
    "trigger": { "kind": "event", "value": "cinemaEntered" }
  },
  {
    "id": "note-z3-02-rooftop-easement",
    "order": 14,
    "tier": 3,
    "tone": "regulatory",
    "formRef": "CIRCULAR 33: RIGHT OF TRANSIT ACROSS SLATE",
    "title": "Concerning Foot Traffic on Slate Roofs",
    "body": "The Office reminds the Keeper that walkable slate roofs remain private freehold under municipal ordinance. Reeling across chimneys without a transit permit incurs a chimney sweep assessment. If your tackle catches a weathercock, you are required to spin with it.",
    "stamp": "MUNICIPAL CODE ENFORCED",
    "trigger": { "kind": "zoneReached", "value": 3 }
  },
  {
    "id": "note-z3-03-willow-street-tenancy",
    "order": 15,
    "tier": 3,
    "tone": "resentful",
    "formRef": "TENANCY RECORD: 14 WILLOW ST.",
    "title": "Notice of Irregular Illumination",
    "body": "A kerosene lamp has been observed burning in the second-floor parlor of 14 Willow Street despite thirty years of unbroken hydrostatic immersion. The occupant has not filed an electrical conversion permit. The Office strongly advises against entering. The Office is not responsible for what remains on the desk.",
    "stamp": "DO NOT DISTURB",
    "trigger": { "kind": "event", "value": "willowStreetApproached" }
  },
  {
    "id": "note-z3-04-second-mouth",
    "order": 16,
    "tier": 3,
    "tone": "procedural",
    "formRef": "SCHEDULE 6-S: CONTESTED SALVAGE",
    "title": "On the Division of Hooked Assets",
    "body": "When two mouths attach to one hook simultaneously, salvage rights are partitioned equally by net biomass. Snatchers are authorized municipal bailiffs recovering defaulted tribute. You are entitled to the head; the basin retains the struggle.",
    "stamp": "PARTITION APPROVED",
    "trigger": { "kind": "event", "value": "snatcherIntercepted" }
  }
]
```

---

## 8. Implementation Checklist & Verification

- [x] **12 Environmental Text Entries:** All structured with `id`, `locationHint`, 1-2 lines of quiet text without speaker attribution, including the mandatory Lyceum Cinema marquee entry.
- [x] **Maren's Note (14 Willow Street):** 3 internal drafts documented, with the final piece audited at 195 words (within the 120–200 word envelope), recontextualizing the opening cards, explaining Ruth Oakes' delivery, and delivering the thematic foundation for the CUT ending.
- [x] **The Postmaster Boss Suite:** 3 canonical telegraph lines verbatim from `docs/plan/05-meta-and-content.md` (`SPECIAL DELIVERY.`, `RETURN TO SENDER.`, `SIGN HERE.`) + 5 courtesy lines (all ≤ 37 characters, well under the 60-character ceiling), a 2-line bestiary entry, and the 'forwarding address' story item drop text.
- [x] **Snatcher Flavor Suite:** 2-line bestiary entry with willing variant + 3 moment lines audited to ≤ 59 characters (well under the 80-character cap).
- [x] **4 Zone-3 Bottle Notes:** Formatted in strict compliance with `BottleNote` TypeScript schema, penned inside the drowned Hollow.
- [x] **Tone & Lore Consistency:** Full alignment with `docs/story/voice.md`, `docs/story/town.md`, `docs/story/opening.md`, and `docs/story/kelp-graves.md`.
