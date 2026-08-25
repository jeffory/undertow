# UNDERTOW — Opening Story Cards

*Implementation Reference: `docs/plan/08-polish.md` §2, `plan.md` §2.1–2.2*  
*Delivery: DOM overlay over live drifting M0 title lake scene. Slow fade-in/fade-out per card (~1.2s transition). Advance via LMB, Space, or Enter. Skippable via Esc. Persisted in save state as `introSeen: boolean`.*

---

## Card Sequence

```json
[
  {
    "id": "card_01",
    "order": 1,
    "text": "Thirty years ago, Greywater Hollow sat in a quiet valley.\n\nThe founder built a lighthouse on the inland ridge.\n\nEveryone laughed. A keeper of a light with no ships.",
    "wordCount": 28
  },
  {
    "id": "card_02",
    "order": 2,
    "text": "The night of the storm, the reservoir rose.\n\nTen thousand downstream, or four hundred below.\n\nYou opened the spillway.\n\nThe arithmetic was correct. It has never once helped.",
    "wordCount": 28
  },
  {
    "id": "card_03",
    "order": 3,
    "text": "Maren was in the Hollow, delivering the founder's granddaughter's baby.\n\nYou promised to hold the water until morning.\n\nYou did not hold the water until morning.",
    "wordCount": 26
  },
  {
    "id": "card_04",
    "order": 4,
    "text": "The official record called it a dam failure.\n\nYou kept the light burning. Habit, then penance.\n\nThirty years tending a lamp over a black lake with no bottom.",
    "wordCount": 28
  },
  {
    "id": "card_05",
    "order": 5,
    "text": "Last night, the beam swept the dark water, and something reflected back.\n\nThis morning, the first bottle washed ashore against the jetty.",
    "wordCount": 22
  },
  {
    "id": "card_06_notice",
    "order": 6,
    "header": "SCHEDULE 1-A: NOTICE OF ELIGIBILITY",
    "text": "The below-signed resident(s) of Greywater Hollow have been assessed and may be RETURNED upon receipt of equivalent tribute. Tribute is assessed by weight, memory content, and struggle. The Office thanks you for your continued custodianship. Do not stop fishing.",
    "wordCount": 36,
    "stamp": "ASSESSED & FILED"
  }
]
```

---

## Screen-by-Screen Breakdown

### Card 1: The Folly
> **Thirty years ago, Greywater Hollow sat in a quiet valley.**
> 
> **The founder built a lighthouse on the inland ridge.**
> 
> **Everyone laughed. A keeper of a light with no ships.**

*Visual:* Pitch black fades into distant silhouette of the dry-laid lighthouse tower. Faint wind drone.

---

### Card 2: The Arithmetic
> **The night of the storm, the reservoir rose.**
> 
> **Ten thousand downstream, or four hundred below.**
> 
> **You opened the spillway.**
> 
> **The arithmetic was correct. It has never once helped.**

*Visual:* Low rumble of water. The screen vignette tightens.

---

### Card 3: The Promise
> **Maren was in the Hollow, delivering the founder's granddaughter's baby.**
> 
> **You promised to hold the water until morning.**
> 
> **You did not hold the water until morning.**

*Visual:* Water audio peaks and subsides into absolute dead silence.

---

### Card 4: Penance
> **The official record called it a dam failure.**
> 
> **You kept the light burning. Habit, then penance.**
> 
> **Thirty years tending a lamp over a black lake with no bottom.**

*Visual:* The lighthouse beam cuts across the top third of the frame, sweeping left to right through bone-teal fog.

---

### Card 5: The Reflection
> **Last night, the beam swept the dark water, and something reflected back.**
> 
> **This morning, the first bottle washed ashore against the jetty.**

*Visual:* Caustic shimmer on black water. The wooden dinghy rocks at the pier. A glass bottle bobs in the surge.

---

### Card 6: The First Notice (Office Form)
> `[SCHEDULE 1-A: NOTICE OF ELIGIBILITY]`
> 
> **The below-signed resident(s) of Greywater Hollow have been assessed and may be RETURNED upon receipt of equivalent tribute. Tribute is assessed by weight, memory content, and struggle. The Office thanks you for your continued custodianship. Do not stop fishing.**
> 
> `[STAMP: ASSESSED & FILED — THE OFFICE OF RETURNS]`

*Visual:* Aged, water-damaged municipal document card overlay. The text is stamped in faded violet ink. Below it, the prompt: `[PRESS SPACE TO ROW OUT]`.
