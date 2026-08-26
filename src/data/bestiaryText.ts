// BESTIARY TEXT (data) — the written entries for the Shallows species (plan 04
// §5, docs/story/bestiary-shallows.md). Transcribed from the story bible's JSON
// array so the ids stay aligned with src/data/species.ts (old-pike + purse-minnow
// are special records that resolve but are not in the disturbance tables).
//
// Unlock rules (plan 04 §6.1): a species is "undiscovered" until its entry state
// records `fought` — the name + entryFought text stay hidden and only the
// silhouette one-liner is shown. entryWilling is the Maren's Thimble variant
// (worse text) — wired later with the thimble; the slot exists from day one.
//
// Pure data: no `three` imports.

export interface BestiaryRecord {
  id: string;
  name: string;
  zone: 1 | 2;
  rarity: 'C' | 'U' | 'R' | 'E' | 'Drowned' | 'Boss';
  eligibility: 1 | 2 | 3;
  category: 'catch' | 'crawler' | 'caller' | 'snatcher' | 'dragger' | 'bagman' | 'boss';
  silhouette: string; // shown before the species is fought (the dark card)
  entryFought: string; // the full entry — name + this text unlock on fought
  entryWilling?: string; // Maren's Thimble variant — different, worse
}

export const BESTIARY_TEXT: BestiaryRecord[] = [
  {
    id: 'silt-pikelet',
    name: 'Silt Pikelet',
    zone: 1,
    rarity: 'C',
    eligibility: 1,
    category: 'catch',
    silhouette: 'A darting green needle near the reed beds.',
    entryFought:
      'All the fight of its legend, at one-tenth the paperwork. It strikes hard and tires early, like a parish dispute.',
  },
  {
    id: 'glass-minnow',
    name: 'Glass Minnow',
    zone: 1,
    rarity: 'C',
    eligibility: 1,
    category: 'catch',
    silhouette: 'A faint pale sliver that refracts the lantern beam.',
    entryFought: 'None of them is alone. None of them will tell you how many they are.',
  },
  {
    id: 'toady-office',
    name: 'Toady of the Office',
    zone: 1,
    rarity: 'C',
    eligibility: 1,
    category: 'catch',
    silhouette: 'A wide, blunt shape sitting motionless in the shallows.',
    entryFought:
      'It swallows the forms it fails to file. Its belly is heavy with thirty years of unacknowledged correspondence.',
  },
  {
    id: 'damp-roller',
    name: 'Damp Roller',
    zone: 1,
    rarity: 'C',
    eligibility: 1,
    category: 'crawler',
    silhouette: 'A barrel-shaped shadow crawling onto the mud bank.',
    entryFought:
      'A barrel that remembered how to be a fish, and resents it. When it climbs out of the reeds on two stubbed fin-legs, it moves with the aggrieved haste of an evicted tenant.',
  },
  {
    id: 'bottle-post',
    name: 'Bottle Post',
    zone: 1,
    rarity: 'U',
    eligibility: 1,
    category: 'catch',
    silhouette: 'A cylindrical shadow dragging a glass float.',
    entryFought:
      'It has been carrying the same letter for thirty years. The Office says delivery is pending.',
  },
  {
    id: 'rungfish',
    name: 'Rungfish',
    zone: 1,
    rarity: 'U',
    eligibility: 2,
    category: 'catch',
    silhouette: 'A pale banded silhouette oscillating along the jetty pilings.',
    entryFought: 'Its scales read like ladder rungs. Something at the bottom has been counting.',
  },
  {
    id: 'grave-shad',
    name: 'Grave Shad',
    zone: 1,
    rarity: 'U',
    eligibility: 2,
    category: 'catch',
    silhouette: 'A long, dark shadow lingering over the submerged headstones.',
    entryFought: 'It schools through the drowned graveyard taking roll. It is never short a name.',
    entryWilling:
      'When taken with the thimble, it stops swimming and recites the names of the parish council in your own voice, beginning with the date you opened the sluice.',
  },
  {
    id: 'hollow-shiner',
    name: 'Hollow Shiner',
    zone: 1,
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    silhouette: 'A brilliant bioluminescent flare pulsing beneath the silt.',
    entryFought: 'The light in it does not come from it. It does not know what to do with the dark.',
  },
  {
    id: 'spoonworm',
    name: 'Spoonworm',
    zone: 1,
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    silhouette: 'An unnervingly long sinuous ribbon trailing in the drift.',
    entryFought:
      'Longer than it has any right to be. It is not using the extra length. It is holding it in reserve.',
  },
  {
    id: 'whetstone-bream',
    name: 'Whetstone Bream',
    zone: 1,
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    silhouette: 'A hard, flat silver blade cutting perpendicular ripples.',
    entryFought:
      'Sharp as a rumour, dull as a grievance. It bites only when asked, and the Office does not ask.',
  },
  {
    id: 'bell-carp',
    name: 'Bell Carp',
    zone: 1,
    rarity: 'R',
    eligibility: 3,
    category: 'catch',
    silhouette: 'A heavy bronze-scaled shape carrying a dull metallic clapper.',
    entryFought:
      'It rings when struck. It does not appear to mind. This is the part where you stop touching it.',
  },
  {
    id: 'marens-fox',
    name: "Maren's Fox",
    zone: 1,
    rarity: 'E',
    eligibility: 3,
    category: 'catch',
    silhouette: 'A streak of rust-red flashing in the teal shallows.',
    entryFought: 'She kept one. It kept her. You are not to know this yet.',
    entryWilling:
      'It does not fight the line. It swims into your open palms, rests its cold muzzle against your wedding band, and shivers until you remember who gave it to her.',
  },
  {
    id: 'old-pike',
    name: 'Old Pike',
    zone: 1,
    rarity: 'Boss',
    eligibility: 1,
    category: 'boss',
    silhouette: 'A massive, scarred leviathan wearing rusted hooks like medals.',
    entryFought: "Uncle Aldous swore he'd catch it or die trying. Both, as it turns out.",
  },
  {
    id: 'purse-minnow',
    name: 'Purse Minnow',
    zone: 1,
    rarity: 'U',
    eligibility: 1,
    category: 'bagman',
    silhouette: 'A frantic, glittering shape dragging a waterlogged coin sack.',
    entryFought:
      'A fingerling carrying a damp coin purse in its throat. It runs like a clerk who knows the auditor has drowned.',
  },
];

// --- M6: the Kelp Graves (zone 2) ------------------------------------------------
// The four zone-2 story records (docs/story/kelp-graves.md §6, transcribed
// verbatim) plus the zone boss. Kept in their own array so the zone-1 roster —
// and the id-coverage test that pins it — stays exactly what it was; both
// arrays feed the one lookup below, so the ledger resolves either roster.
export const KELP_BESTIARY_TEXT: BestiaryRecord[] = [
  {
    id: 'shroud-ribbon',
    name: 'Shroud-Ribbon',
    zone: 2,
    rarity: 'C',
    eligibility: 2,
    category: 'catch',
    silhouette: 'A flat, black blade of kelp that swims against the current.',
    entryFought:
      'It weaves dead kelp into funeral bands and drags them behind its tail. It has enough linen for everybody.',
    entryWilling:
      "It wraps itself gently around your wrist like a mourner's armband, ice-cold and smelling of river mud.",
  },
  {
    id: 'net-choked-gudgeon',
    name: 'Net-Choked Gudgeon',
    zone: 2,
    rarity: 'U',
    eligibility: 2,
    category: 'snatcher',
    silhouette: 'A scarred, heavy-bellied silhouette trailing tattered hemp twine.',
    entryFought:
      'It has lived in the same gill-net since the valley went under. It does not want to be cut free; it wants you to get in.',
  },
  {
    id: 'cenotaph-perch',
    name: 'Cenotaph Perch',
    zone: 2,
    rarity: 'U',
    eligibility: 2,
    category: 'crawler',
    silhouette: 'A blocky, stone-grey shape resting upright upon sunken headstones.',
    entryFought:
      "Its dorsal spines are chiseled flat like slate markers. If you scrape the silt away, you can read the initials of the town's last mason.",
  },
  {
    id: 'pew-shad',
    name: 'Pew-Shad',
    zone: 2,
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    silhouette: 'A dense, rhythmic cluster of dark shapes hovering in disciplined rows.',
    entryFought:
      'It refuses to swim alone. When hooked, the rest of the school holds its place in line, waiting for the dismissal hymn.',
  },
  {
    id: 'the-congregation',
    name: 'The Congregation',
    zone: 2,
    rarity: 'Boss',
    eligibility: 1,
    category: 'boss',
    silhouette: 'One shape, at this distance. It resolves, closer, into a great many.',
    entryFought:
      'Forty-seven accounts sharing a single hook, which the Office regards as an efficiency. They do not struggle so much as deliberate.',
  },
];

const BY_ID = new Map<string, BestiaryRecord>(
  [...BESTIARY_TEXT, ...KELP_BESTIARY_TEXT].map((r) => [r.id, r]),
);

export function bestiaryById(id: string): BestiaryRecord | null {
  return BY_ID.get(id) ?? null;
}