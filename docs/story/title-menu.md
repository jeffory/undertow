# UNDERTOW — Title Screen & Menu UI Copy

*Implementation Reference: `docs/plan/08-polish.md` §1 & §3; `plan.md` §2.2, §2.6*  
*Delivery: DOM overlay over live Three.js drifting lake scene (M0). Rendered in weathered serif with water-stained municipal card styling.*

---

## 1. Primary Title & Attract Mode

### Title Header
```
  _   _ _   _ ____  _____ ____ _____ ______      __
 | | | | \ | |  _ \| ____|  _ \_   _/ _ \ \    / /
 | | | |  \| | | | |  _| | |_) || || | | \ \/\/ / 
 | |_| | |\  | |_| | |___|  _ < | || |_| |\  /\  /  
  \___/|_| \_|____/|_____|_| \_\|_| \___/  \/  \/   

     [ A Roguelite ARPG of Municipal Reclamation ]
```

### Rotating Attract-Mode Taglines (3)
*Rendered beneath the main title in faded italicized serif, cycling every 8 seconds with a soft caustic dissolve:*

1. **Tagline 1 (The Arithmetic):**
   > *"A black lake with no bottom. A lighthouse with no ships. An arithmetic that has never helped."*

2. **Tagline 2 (The Mandate):**
   > *"The lake accepts tribute by weight, memory content, and struggle. Do not stop fishing."*

3. **Tagline 3 (The Hollow):**
   > *"Forty fathoms below, four hundred souls are minding their own business. You are required to disturb them."*

---

## 2. Menu Navigation (The Municipal Register)

```ts
export interface MenuItem {
  id: string;
  formCode: string;
  label: string;
  subtext: string;
  stamp?: string;
}
```

```json
[
  {
    "id": "menu_new_run",
    "formCode": "FORM 1",
    "label": "RESUMPTION OF CUSTODIAL DUTIES",
    "subtext": "Row into the basin. Standard tribute tariffs apply.",
    "stamp": "ISSUED"
  },
  {
    "id": "menu_continue",
    "formCode": "FORM 1-B",
    "label": "CONTINUATION OF SERVICE (AMENDED)",
    "subtext": "Load existing logbook from Sluice House register.",
    "stamp": "ACTIVE"
  },
  {
    "id": "menu_options",
    "formCode": "CIRCULAR 4",
    "label": "ADJUSTMENT OF GAUGES & TOLERANCES",
    "subtext": "Configure visual scales, acoustic levels, and line tension palettes.",
    "stamp": "FILED"
  },
  {
    "id": "menu_credits",
    "formCode": "APPENDIX VII",
    "label": "REGISTRY OF FORMER & PRESENT PARTIES",
    "subtext": "An itemized accounting of hands involved in construction.",
    "stamp": "AUDITED"
  },
  {
    "id": "menu_quit",
    "formCode": "FORM 99",
    "label": "SUSPENSION OF CUSTODIAL ATTENDANCE",
    "subtext": "Douse the lamp. The water will continue in your absence.",
    "stamp": "STANDBY"
  }
]
```

---

## 3. Options Sub-Menu Copy (`CIRCULAR 4`)

### Section Headers
- **Visual Display & Silt Density:** `SCHEDULE A: OPTICAL GAUGES`
  - Render Scale: *Resolution of Basin Survey* `[0.5x / 0.75x / 1.0x]`
  - Fog Density: *Permissible Murk Level* `[Low / Standard / Heavy]`
  - Dread Tilt: *Labyrinthine Equilibrium Axis* `[Enabled / Disabled]`
  - Post-Processing: *Chromatic Dispersion & Lens Staining* `[On / Off]`
  
- **Acoustic Environment:** `SCHEDULE B: AUDITORY MONITORING`
  - Master Gain: *Master Volume of Sluice Authority*
  - Lake Drone: *Basin Resonance & Formation Saws*
  - Line Tension Creak: *Bowed-String Sonification*
  - Heartbeat Pulse: *Sub-Bass Dread Modulation*
  
- **Tackle & Mechanical Controls:** `SCHEDULE C: LEVER & REEL OPERATION`
  - Reel Stance: *Reel Stance Mode* `[Hold RMB / Toggle RMB]`
  - Tension Palette: *Colorblind Ramp* `[Standard (Grn→Wht→Red) / Accessible (High Contrast + Line Thickness)]`
  - Drag Mitigation: *Brace Dampener Sensitivity*

---

## 4. Run State Transition Overlays

### Death / Drowning Screen (Office Condolence Letter)
```
[FORM 13-D: NOTICE OF UNFORTUNATE OCCURRENCE]

The Office of Returns acknowledges the temporary cessation of your physical custody.
Catches not secured to a bell buoy have been re-absorbed by the reservoir.

CONDOLENCE SETTLEMENT:
  Delivered Tribute Retained:  30% (Rounded down per regulation)
  Tribute XP Credited:         30%
  Net Memories Retained:       [ MEMORIES_VALUE ]

"The lake extends its condolences. Return to the light and cast again."
[ PRESS SPACE TO SIGN CONDOLENCE REGISTER ]
```

### Extraction Screen (Buoy Receipt)
```
[SCHEDULE 8: CERTIFICATE OF DISCHARGE]

TRIBUTE MANIFEST VERIFIED AT BELL BUOY #3:
  Specimens Landed:    [ COUNT ]
  Total Net Weight:    [ WEIGHT_KG ] kg
  Struggle Multiplier: [ MULT ]x (Clean catches acknowledged)
  
ACCOUNT CREDITED:      + [ MEMORIES_EARNED ] Memories
TRIBUTE XP GAINED:     + [ XP_EARNED ] XP

"The Office thanks you for your punctuality. The shore awaits."
[ PRESS SPACE TO SECURE HAUL ]
```
