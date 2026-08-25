# UNDERTOW — Bottle Notes Registry (The Office of Returns)

*Implementation Reference: `plan.md` §2.2, §2.5, §3.3, §4.4, §4.5, §6.3, §6.6, §6.7; `docs/plan/05-meta-and-content.md` §1.6, §4.2*  
*Delivery: Found in bobbing bottles washing up on the lighthouse shore or discovered at lake micro-event sites. Read notes are filed in the Post Office ledger and saved in `MetaState.notesRead: string[]`.*

---

## Technical Data Schema

```ts
export interface BottleNote {
  id: string;                    // e.g. "note-01-eligibility"
  order: number;                // 1..25
  tier: 1 | 2 | 3 | 4 | 5;      // Escalation tier
  tone: 'procedural' | 'passive-aggressive' | 'regulatory' | 'resentful' | 'unravelling' | 'terminal';
  formRef: string;              // e.g. "FORM 1-A", "CIRCULAR 12"
  title: string;                // Subject line / Header
  body: string;                 // Diegetic content
  stamp?: string;               // Faded ink stamp
  trigger: {
    kind: 'runCount' | 'buildingCount' | 'zoneReached' | 'itemEquipped' | 'event' | 'licenseGrade';
    value: string | number;
  };
}
```

---

## Tier 1: Early Runs — Polite, Informational & Establishing the Deal

```json
[
  {
    "id": "note-01-eligibility",
    "order": 1,
    "tier": 1,
    "tone": "procedural",
    "formRef": "FORM 1-A: NOTICE OF ELIGIBILITY",
    "title": "Initial Custodial Notice",
    "body": "NOTICE OF ELIGIBILITY: The below-signed resident(s) of Greywater Hollow have been assessed and may be RETURNED upon receipt of equivalent tribute. Tribute is assessed by weight, memory content, and struggle. The Office thanks you for your continued custodianship. Do not stop fishing.",
    "stamp": "OFFICIAL — OFFICE OF RETURNS",
    "trigger": { "kind": "runCount", "value": 0 }
  },
  {
    "id": "note-02-tether-protocol",
    "order": 2,
    "tier": 1,
    "tone": "procedural",
    "formRef": "MEMORANDUM 4-B",
    "title": "On the Nature of the Line",
    "body": "The Keeper is advised that all lines cast across the surface constitute a mutual distance constraint under maritime sluice law. Neither party may exceed the prescribed distance without incurring kinetic consequence. You are tethered to the catch; the catch is tethered to you. Pull accordingly.",
    "stamp": "APPROVED FOR TRANSIT",
    "trigger": { "kind": "runCount", "value": 1 }
  },
  {
    "id": "note-03-assessment-formula",
    "order": 3,
    "tier": 1,
    "tone": "procedural",
    "formRef": "TARIFF SCHEDULE 2",
    "title": "Valuation of Landed Tribute",
    "body": "Catches landed in a state of exhaustion receive a full struggle multiplier (1.5x Memories). Specimens bludgeoned to death without tension management are classified as butchered, incurring a one-tier penalty and disqualification from clean ledgering. The Office values diligence over violence.",
    "stamp": "RATE VERIFIED",
    "trigger": { "kind": "runCount", "value": 2 }
  },
  {
    "id": "note-04-releasing-bites",
    "order": 4,
    "tier": 1,
    "tone": "regulatory",
    "formRef": "CIRCULAR 7: SURFACE DISTURBANCES",
    "title": "Concerning Unset Hooks",
    "body": "Releasing a bite at the moment of contact relieves local tension and generates zero Dread. However, the Office notes that every strike not set is a soul kept waiting in the cold. We do not judge. We merely keep the register.",
    "stamp": "LOGGED",
    "trigger": { "kind": "runCount", "value": 3 }
  },
  {
    "id": "note-05-spillway-precedent",
    "order": 5,
    "tier": 1,
    "tone": "passive-aggressive",
    "formRef": "INQUIRY REF: SLUICE-19",
    "title": "Historical Basin Head Pressure",
    "body": "In response to ongoing queries: the depth of the basin is measured at forty fathoms. The volume remains commensurate with the spillway gate log of the 14th of October, thirty years past. The Office confirms the water level is entirely your doing.",
    "stamp": "RECORDS DIVISION",
    "trigger": { "kind": "runCount", "value": 4 }
  },
  {
    "id": "note-06-noticing",
    "order": 6,
    "tier": 1,
    "tone": "passive-aggressive",
    "formRef": "NOTICE 0-C",
    "title": "Notice of Noticing",
    "body": "The Office notes you have not fished. This is not a complaint. This is a notice of noticing.",
    "stamp": "PENDING LODGEMENT",
    "trigger": { "kind": "event", "value": "emptyRunOrIdle" }
  }
]
```

---

## Tier 2: Mid Runs — Bureaucratic Friction & Nocturnal Operations

```json
[
  {
    "id": "note-07-restoration-tax",
    "order": 7,
    "tier": 2,
    "tone": "regulatory",
    "formRef": "TAX ASSESSMENT: RE-ESTATE",
    "title": "Surcharge on Municipal Reconstruction",
    "body": "Be advised: every foundation returned to the dry shore creates an acoustic displacement within the basin (+2 Starting Dread). The lake resents being emptied piece by piece. You are permitted to rebuild; you are not permitted to complain about the consequences.",
    "stamp": "LEVIED",
    "trigger": { "kind": "buildingCount", "value": 2 }
  },
  {
    "id": "note-08-night-hours",
    "order": 8,
    "tier": 2,
    "tone": "procedural",
    "formRef": "CIRCULAR 12: NOCTURNAL HAULAGE",
    "title": "Dragger Courtesy Protocols",
    "body": "Draggers do not hunt before dark. Nobody has explained this to them. It appears to be a courtesy.",
    "stamp": "PUBLIC NOTICE",
    "trigger": { "kind": "event", "value": "nightPhaseEntered" }
  },
  {
    "id": "note-09-light-decant",
    "order": 9,
    "tier": 2,
    "tone": "resentful",
    "formRef": "RE: LIGHTHOUSE EMISSIONS",
    "title": "Unauthorized Siphoning of Illumination",
    "body": "The Office reminds you that the light is not yours to bottle. The light is the town's. The town is the Office's.",
    "stamp": "RESTRICTED",
    "trigger": { "kind": "event", "value": "decantedLight" }
  },
  {
    "id": "note-10-bait-advisory",
    "order": 10,
    "tier": 2,
    "tone": "procedural",
    "formRef": "SMOKEHOUSE DISPATCH 3",
    "title": "Recycled Protein Sourcing",
    "body": "The practice of reducing landed catches into bait to attract further catches is acknowledged by the Department of Provisions. The loop is self-sustaining. The residents do not object; they were always a communal folk.",
    "stamp": "HEALTH & SAFETY",
    "trigger": { "kind": "buildingCount", "value": 4 }
  },
  {
    "id": "note-11-audit-courier",
    "order": 11,
    "tier": 2,
    "tone": "passive-aggressive",
    "formRef": "WARRANT: STRONG-BOX AUDIT",
    "title": "Internal Discrepancies (The Courier)",
    "body": "Embezzlement, technically. The Office has never pressed charges. The Office prefers to handle these things internally, which is why the Courier screams.",
    "stamp": "AUDIT DIVISION",
    "trigger": { "kind": "event", "value": "bagmanSighted" }
  },
  {
    "id": "note-12-immersion-advisory",
    "order": 12,
    "tier": 2,
    "tone": "passive-aggressive",
    "formRef": "WATER SAFETY NOTICE 18",
    "title": "On Submersion and Fault",
    "body": "The lake has never drowned anyone who didn't have it coming. This is not the comfort the lake thinks it is.",
    "stamp": "CAUTION",
    "trigger": { "kind": "event", "value": "waterPhaseEntered" }
  }
]
```

---

## Tier 3: Township & Mid-Late Runs — Resentful Compliance & Forwarding Addresses

```json
[
  {
    "id": "note-13-congregation-invoice",
    "order": 13,
    "tier": 3,
    "tone": "procedural",
    "formRef": "SCHEDULE OF BATCH RETURN: Z-2",
    "title": "Itemized Ledger of Saint Jude-in-the-Fens",
    "body": "Landed: One (1) collective mass comprising forty-seven (47) parishioners, two (2) choirboys, and the warden's basset hound. Account 1 of 47 ledgered. Account 2 of 47 ledgered. Account 3 of 47 ledgered. The Office extends congratulations on your heavy arm.",
    "stamp": "AUDITED IN TRIPLICATE",
    "trigger": { "kind": "event", "value": "congregationDefeated" }
  },
  {
    "id": "note-14-willow-street",
    "order": 14,
    "tier": 3,
    "tone": "resentful",
    "formRef": "RE: OCCUPANT, 14 WILLOW ST.",
    "title": "Tenancy Notice",
    "body": "RE: OCCUPANT, 14 WILLOW ST. The property is currently tenanted. The Office advises against entering. The Office advises.",
    "stamp": "STRICTLY PRIVATE",
    "trigger": { "kind": "zoneReached", "value": 3 }
  },
  {
    "id": "note-15-forwarding-address",
    "order": 15,
    "tier": 3,
    "tone": "procedural",
    "formRef": "OFFICE OF THE POSTMASTER (DROWNED)",
    "title": "Establishment of Direct Mail Service",
    "body": "Following the cessation of the Postmaster's delivery route, mail will no longer be left in random bottles along the strand. Henceforth, correspondence will be addressed directly to: The Keeper, Sluice House No. 1, Greywater Basin. Postage is paid in advance.",
    "stamp": "POSTMARK: RECEIVED",
    "trigger": { "kind": "event", "value": "postmasterDefeated" }
  },
  {
    "id": "note-16-water-attrition",
    "order": 16,
    "tier": 3,
    "tone": "passive-aggressive",
    "formRef": "LEDGER: ATTRITION & RELAPSE",
    "title": "Nightly Departures of Restored Residents",
    "body": "The Office notes that several restored persons have vacated their dry premises after dusk and walked back into the reservoir. This is not considered an escape. They are merely going home. No refund of Memories will be granted.",
    "stamp": "NO ADJUSTMENT",
    "trigger": { "kind": "buildingCount", "value": 10 }
  },
  {
    "id": "note-17-special-order-thimble",
    "order": 17,
    "tier": 3,
    "tone": "unravelling",
    "formRef": "REQUISITION ORDER #881",
    "title": "Special Requisition",
    "body": "SPECIAL ORDER: one [1] brass thimble. The Office declines to explain.",
    "stamp": "RESTRICTED MEMO",
    "trigger": { "kind": "event", "value": "thimbleContractSpawned" }
  },
  {
    "id": "note-18-choir-darkness",
    "order": 18,
    "tier": 3,
    "tone": "regulatory",
    "formRef": "CIRCULAR 44: ZONE OF SILENCE",
    "title": "Restrictions on Artificial Illumination",
    "body": "Beyond the 30-fathom contour, light is restricted to your immediate lantern radius. Do not shine lamps into the void. Geometry exists only where the water permits it to be seen. You are disturbing the acoustic arrangement.",
    "stamp": "BY ORDER",
    "trigger": { "kind": "zoneReached", "value": 4 }
  }
]
```

---

## Tier 4: The Choir & The Deep — Grievance, Surveillance & Unsigned Forms

```json
[
  {
    "id": "note-19-the-whistler",
    "order": 19,
    "tier": 4,
    "tone": "unravelling",
    "formRef": "ADVISORY: ACOUSTIC IRREGULARITIES",
    "title": "On Unsanctioned Signals",
    "body": "If you hear a two-tone whistle beyond the perimeter of your lantern, do not answer. The Office does not employ whistling personnel. If it hooks you, do not reel. Reeling merely accelerates the introduction.",
    "stamp": "URGENT",
    "trigger": { "kind": "event", "value": "whistlerEncountered" }
  },
  {
    "id": "note-20-echo-warning",
    "order": 20,
    "tier": 4,
    "tone": "resentful",
    "formRef": "DISPATCH REF: 00-ECHO",
    "title": "On Matters of Resemblance",
    "body": "The Office advises that resemblance is not provenance. The specimen inhabiting the Choir wears the linen of thirty years past because the water remembers the shape of what it took. It is not waiting for your gaff.",
    "stamp": "DO NOT PROCEED",
    "trigger": { "kind": "event", "value": "marensEchoApproached" }
  },
  {
    "id": "note-21-wedding-band",
    "order": 21,
    "tier": 4,
    "tone": "unravelling",
    "formRef": "INVENTORY DISCREPANCY: UNLISTED",
    "title": "Re: Returns (Gold Band)",
    "body": "RE: RETURNS. There is no record of this item. The Office has no record of this item. The Office has no record of you having obtained a record of this item.",
    "stamp": "CANNOT EXPUNGE",
    "trigger": { "kind": "itemEquipped", "value": "wedding_band" }
  },
  {
    "id": "note-22-arithmetic-revisit",
    "order": 22,
    "tier": 4,
    "tone": "resentful",
    "formRef": "FORM 400: BALANCE OF LIABILITIES",
    "title": "Annual Recapitulation",
    "body": "Ten thousand lives downstream. Four hundred souls in Greywater Hollow. You made the calculation in four minutes under a tin roof in the rain. The Office confirms the sum was correct. The Office confirms the water does not care about arithmetic.",
    "stamp": "BALANCED",
    "trigger": { "kind": "runCount", "value": 15 }
  },
  {
    "id": "note-23-custodian-renewal",
    "order": 23,
    "tier": 4,
    "tone": "unravelling",
    "formRef": "[REDACTED RENEWAL]",
    "title": "Grade 7 Custodial Certification",
    "body": "The title is omitted. The stamp is just a wet ring on coarse paper. \n\n'You have hauled almost every name back to the dry air. They are cold up there. We are cold down here. Stop pulling. Or come down and sign the ledger yourself.'",
    "stamp": "[WET RING]",
    "trigger": { "kind": "licenseGrade", "value": 7 }
  }
]
```

---

## Tier 5: The Climax & Terminal Accounts — The Anchors

```json
[
  {
    "id": "note-24-baby-shoe",
    "order": 24,
    "tier": 5,
    "tone": "terminal",
    "formRef": "NO FORM NUMBER",
    "title": "Unscheduled scrap (Anchor N-1)",
    "body": "Where did you find this.",
    "stamp": "NONE — WATER-RUN INK",
    "trigger": { "kind": "itemEquipped", "value": "the_baby_shoe" }
  },
  {
    "id": "note-25-final-summons",
    "order": 25,
    "tier": 5,
    "tone": "terminal",
    "formRef": "FORM 0: FINAL INVOICE & SUMMONS",
    "title": "Account Closure (Threshold of The Mouth)",
    "body": "FINAL AUDIT NOTICE: All four hundred accounts have been reconciled or contested. One (1) item remains ledgered to this basin: the Keeper of the Light. The Office of Returns requests your attendance at the lowest intake. Bring your line.\n\n[UPON CUT: 'TRIBUTE ACCEPTED: one (1) keeper, by weight, memory content, and struggle. Account closed.']",
    "stamp": "ACCOUNT CLOSED",
    "trigger": { "kind": "zoneReached", "value": 5 }
  }
]
```
