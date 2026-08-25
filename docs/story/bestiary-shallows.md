# UNDERTOW — Bestiary: The Shallows (Zone 1)

*Implementation Reference: `plan.md` §2.6, §4.4, §6.3, §7, §8.2; `docs/plan/04-fish-and-loot.md` §5; `docs/plan/05-meta-and-content.md` §4.1*  
*Zone Profile: Bone-teal fog, reed instancing, wrecked jetties. Low pressure, tutorializes tether mechanics and tension management.*

---

## Technical Data Schema

```ts
export interface BestiaryRecord {
  id: string;
  name: string;
  zone: 1;
  rarity: 'C' | 'U' | 'R' | 'E' | 'Drowned' | 'Boss';
  eligibility: 1 | 2 | 3;
  category: 'catch' | 'crawler' | 'caller' | 'snatcher' | 'dragger' | 'bagman' | 'boss';
  silhouette: string;              // Text shown before catch (1 line)
  entryFought: string;             // Standard entry (1-3 sentences)
  entryWilling?: string;           // Unlocked via Maren's Thimble (different, worse)
  loreNotes?: string;              // Context for audio/visual rig designers
}
```

---

## JSON Data Array

```json
[
  {
    "id": "silt-pikelet",
    "name": "Silt Pikelet",
    "zone": 1,
    "rarity": "C",
    "eligibility": 1,
    "category": "catch",
    "silhouette": "A darting green needle near the reed beds.",
    "entryFought": "All the fight of its legend, at one-tenth the paperwork. It strikes hard and tires early, like a parish dispute."
  },
  {
    "id": "glass-minnow",
    "name": "Glass Minnow",
    "zone": 1,
    "rarity": "C",
    "eligibility": 1,
    "category": "catch",
    "silhouette": "A faint pale sliver that refracts the lantern beam.",
    "entryFought": "None of them is alone. None of them will tell you how many they are."
  },
  {
    "id": "toady-office",
    "name": "Toady of the Office",
    "zone": 1,
    "rarity": "C",
    "eligibility": 1,
    "category": "catch",
    "silhouette": "A wide, blunt shape sitting motionless in the shallows.",
    "entryFought": "It swallows the forms it fails to file. Its belly is heavy with thirty years of unacknowledged correspondence."
  },
  {
    "id": "damp-roller",
    "name": "Damp Roller",
    "zone": 1,
    "rarity": "C",
    "eligibility": 1,
    "category": "crawler",
    "silhouette": "A barrel-shaped shadow crawling onto the mud bank.",
    "entryFought": "A barrel that remembered how to be a fish, and resents it. When it climbs out of the reeds on two stubbed fin-legs, it moves with the aggrieved haste of an evicted tenant."
  },
  {
    "id": "bottle-post",
    "name": "Bottle Post",
    "zone": 1,
    "rarity": "U",
    "eligibility": 1,
    "category": "catch",
    "silhouette": "A cylindrical shadow dragging a glass float.",
    "entryFought": "It has been carrying the same letter for thirty years. The Office says delivery is pending."
  },
  {
    "id": "rungfish",
    "name": "Rungfish",
    "zone": 1,
    "rarity": "U",
    "eligibility": 2,
    "category": "catch",
    "silhouette": "A pale banded silhouette oscillating along the jetty pilings.",
    "entryFought": "Its scales read like ladder rungs. Something at the bottom has been counting."
  },
  {
    "id": "grave-shad",
    "name": "Grave Shad",
    "zone": 1,
    "rarity": "U",
    "eligibility": 2,
    "category": "catch",
    "silhouette": "A long, dark shadow lingering over the submerged headstones.",
    "entryFought": "It schools through the drowned graveyard taking roll. It is never short a name.",
    "entryWilling": "When taken with the thimble, it stops swimming and recites the names of the parish council in your own voice, beginning with the date you opened the sluice."
  },
  {
    "id": "hollow-shiner",
    "name": "Hollow Shiner",
    "zone": 1,
    "rarity": "R",
    "eligibility": 2,
    "category": "catch",
    "silhouette": "A brilliant bioluminescent flare pulsing beneath the silt.",
    "entryFought": "The light in it does not come from it. It does not know what to do with the dark."
  },
  {
    "id": "spoonworm",
    "name": "Spoonworm",
    "zone": 1,
    "rarity": "R",
    "eligibility": 2,
    "category": "catch",
    "silhouette": "An unnervingly long sinuous ribbon trailing in the drift.",
    "entryFought": "Longer than it has any right to be. It is not using the extra length. It is holding it in reserve."
  },
  {
    "id": "whetstone-bream",
    "name": "Whetstone Bream",
    "zone": 1,
    "rarity": "R",
    "eligibility": 2,
    "category": "catch",
    "silhouette": "A hard, flat silver blade cutting perpendicular ripples.",
    "entryFought": "Sharp as a rumour, dull as a grievance. It bites only when asked, and the Office does not ask."
  },
  {
    "id": "bell-carp",
    "name": "Bell Carp",
    "zone": 1,
    "rarity": "R",
    "eligibility": 3,
    "category": "catch",
    "silhouette": "A heavy bronze-scaled shape carrying a dull metallic clapper.",
    "entryFought": "It rings when struck. It does not appear to mind. This is the part where you stop touching it."
  },
  {
    "id": "marens-fox",
    "name": "Maren's Fox",
    "zone": 1,
    "rarity": "E",
    "eligibility": 3,
    "category": "catch",
    "silhouette": "A streak of rust-red flashing in the teal shallows.",
    "entryFought": "She kept one. It kept her. You are not to know this yet.",
    "entryWilling": "It does not fight the line. It swims into your open palms, rests its cold muzzle against your wedding band, and shivers until you remember who gave it to her."
  },
  {
    "id": "old-pike",
    "name": "Old Pike",
    "zone": 1,
    "rarity": "Boss",
    "eligibility": 1,
    "category": "boss",
    "silhouette": "A massive, scarred leviathan wearing rusted hooks like medals.",
    "entryFought": "Uncle Aldous swore he'd catch it or die trying. Both, as it turns out."
  },
  {
    "id": "purse-minnow",
    "name": "Purse Minnow",
    "zone": 1,
    "rarity": "U",
    "eligibility": 1,
    "category": "bagman",
    "silhouette": "A frantic, glittering shape dragging a waterlogged coin sack.",
    "entryFought": "A fingerling carrying a damp coin purse in its throat. It runs like a clerk who knows the auditor has drowned."
  }
]
```

---

## Detailed Bestiary Catalogue

### 1. Silt Pikelet (`silt-pikelet`)
- **Rarity:** Common | **Eligibility:** Grade 1 | **Category:** Catch
- **Fought:** *"All the fight of its legend, at one-tenth the paperwork. It strikes hard and tires early, like a parish dispute."*
- **Design Notes:** Slender, green-grey silt hue. Quick short lunges. Teaches the basic pull/brace response.

---

### 2. Glass Minnow (`glass-minnow`)
- **Rarity:** Common | **Eligibility:** Grade 1 | **Category:** Catch
- **Fought:** *"None of them is alone. None of them will tell you how many they are."*
- **Design Notes:** Translucent body with faint bioluminescent core. High swim frequency, light mass.

---

### 3. Toady of the Office (`toady-office`)
- **Rarity:** Common | **Eligibility:** Grade 1 | **Category:** Catch
- **Fought:** *"It swallows the forms it fails to file. Its belly is heavy with thirty years of unacknowledged correspondence."*
- **Design Notes:** Bulbous belly, wide set eyes with a judging gaze, dark collar band around neck. Heavy mass for its size.

---

### 4. Damp Roller (`damp-roller`)
- **Rarity:** Common | **Eligibility:** Grade 1 | **Category:** Crawler (Ambush)
- **Fought:** *"A barrel that remembered how to be a fish, and resents it. When it climbs out of the reeds on two stubbed fin-legs, it moves with the aggrieved haste of an evicted tenant."*
- **Design Notes:** Barrel-shaped body that uses the crawler gait to scuttle across dry banks and wrecks.

---

### 5. Bottle Post (`bottle-post`)
- **Rarity:** Uncommon | **Eligibility:** Grade 1 | **Category:** Catch
- **Fought:** *"It has been carrying the same letter for thirty years. The Office says delivery is pending."*
- **Design Notes:** Slender body with an encrusted glass bottle harness. High drag resistance when reeling.

---

### 6. Rungfish (`rungfish`)
- **Rarity:** Uncommon | **Eligibility:** Grade 2 | **Category:** Catch
- **Fought:** *"Its scales read like ladder rungs. Something at the bottom has been counting."*
- **Design Notes:** Regular pale horizontal stripes (period .2). Will not bite ungraded tackle (< Grade 2).

---

### 7. Grave Shad (`grave-shad`)
- **Rarity:** Uncommon | **Eligibility:** Grade 2 | **Category:** Catch
- **Fought:** *"It schools through the drowned graveyard taking roll. It is never short a name."*
- **Willing (Maren's Thimble):** *"When taken with the thimble, it stops swimming and recites the names of the parish council in your own voice, beginning with the date you opened the sluice."*
- **Design Notes:** Dark slate skin, 12 spine segments. Orbits slowly over submerged masonry.

---

### 8. Hollow Shiner (`hollow-shiner`)
- **Rarity:** Rare | **Eligibility:** Grade 2 | **Category:** Catch
- **Fought:** *"The light in it does not come from it. It does not know what to do with the dark."*
- **Design Notes:** Emissive vertex shader pass. Glows intensely in the lantern radius. Erratic sine frequency.

---

### 9. Spoonworm (`spoonworm`)
- **Rarity:** Rare | **Eligibility:** Grade 2 | **Category:** Catch
- **Fought:** *"Longer than it has any right to be. It is not using the extra length. It is holding it in reserve."*
- **Design Notes:** 14 spine segments, continuous dorsal fin ridge. Massive amplitude sweeps that whip the line.

---

### 10. Whetstone Bream (`whetstone-bream`)
- **Rarity:** Rare | **Eligibility:** Grade 2 | **Category:** Catch
- **Fought:** *"Sharp as a rumour, dull as a grievance. It bites only when asked, and the Office does not ask."*
- **Design Notes:** Flattened top profile, metallic grey palette. Grinning jaw split (.45).

---

### 11. Bell Carp (`bell-carp`)
- **Rarity:** Rare | **Eligibility:** Grade 3 | **Category:** Catch
- **Fought:** *"It rings when struck. It does not appear to mind. This is the part where you stop touching it."*
- **Design Notes:** Heavy bronze scales with a small brass bell attached below the gills. Chimes audibly when tension rises or upon landing.

---

### 12. Maren's Fox (`marens-fox`)
- **Rarity:** Epic | **Eligibility:** Grade 3 | **Category:** Catch
- **Fought:** *"She kept one. It kept her. You are not to know this yet."*
- **Willing (Maren's Thimble):** *"It does not fight the line. It swims into your open palms, rests its cold muzzle against your wedding band, and shivers until you remember who gave it to her."*
- **Design Notes:** Only red-accented catch in the Shallows. Very fast burst speed (freq 4.0), high humanRatio (.2) on face structure.

---

### Zone Boss: Old Pike (`old-pike`)
- **Rarity:** Boss | **Eligibility:** Grade 1 | **Category:** Boss Catch
- **Fought:** *"Uncle Aldous swore he'd catch it or die trying. Both, as it turns out."*
- **Design Notes:** Massive scarred pike rig (scale x3). Teaches lunge/brace rhythm, deliberate hazard routing, and exhaustion landing.
