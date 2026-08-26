# Decision Log — intent provenance

Every consequential decision, logged as it lands. `WHO` is who decided: USER
(Keith) or AI (orchestrator/worker). Purpose: across long sessions and context
compaction, a discarded suggestion must never reincarnate as a requirement —
if it isn't here with `in build: yes`, it isn't a decision.
(Practice adopted from the r/ClaudeAI week-3 fishing-game postmortem.)

| date | who | topic | decision | in build? |
|---|---|---|---|---|
| 2026-08-25 | USER | workers | opencode deepseek-v4-flash for implementation rounds; agy for vision/writing; claude/Opus for hard asset/QA rounds | yes |
| 2026-08-25 | USER | assets | Tripo3D + Blender headless pipeline; docs/concepts/ images are the art bible; orchestrator is visual approver | yes |
| 2026-08-25 | AI | pipeline | keeper ships UNDECIMATED (any decimation scrambles Tripo per-face textures); --bake-decimate gated broken | yes |
| 2026-08-26 | AI | camera | qa-issues T1 taken at a ~26° compromise (y=6, z+12), NOT the report's 15° concept angle — ripple telegraphs/casting must stay readable; true concept angle reserved for beauty shots/title | yes |
| 2026-08-26 | AI | QA | beauty-gate luma histogram is a printed REPORT, not a hard assert — concept art is a mood target, not ground truth | yes |
| 2026-08-26 | AI | shell | introSeen persisted in localStorage, not the zod save (schema bump not worth a migration for one boolean) — noted debt | yes |
| 2026-08-26 | USER | boat | candidate C (harbour dinghy) replaces the rowboat; A (concept DRAGGER boat, needs water-skirt surgery) and B (lantern skiff) archived in assets/candidates/ | yes |
| 2026-08-26 | USER | keeper | candidate C (braced hauler) replaces the A-posed keeper; 502k tris / 15 MB accepted as debt pending retopo | yes |
| 2026-08-26 | USER | keeper | retopo-and-rig experiment queued (Blender-driven, falsifiable: worse-than-static-C does not ship) | pending |
| 2026-08-26 | AI | fx | telegraph events deliberately spawn NO splash (the lunge burst covers the read; per-telegraph bursts double the noise) | yes |
| 2026-08-26 | AI | water | lantern reflection pool: tight ~7 m quartic disc + view-dependent spec streak; the 16 m disc read as a shadow following the boat (USER report) | yes |
| 2026-08-26 | USER | process | parallel Claude sessions may share this tree — explicit `git add` lists, check branch before commit, dev server on 5175 | yes |
| 2026-08-26 | AI | QA | adopt blind A/B + pre-written scoring rubric for art rounds (docs/qa-rubric.md) | yes |

## Rejected / superseded (do NOT resurrect without a new USER decision)

- 15° gameplay camera (qa-issues T1 as written) — rejected for telegraph readability, 2026-08-26.
- Luma histogram as failing gate assert — rejected as over-fitted, 2026-08-26.
- Per-telegraph splash bursts — rejected as noise, 2026-08-26.
- bake-decimate in prep.py — broken (black speckle), gated at 0; superseded-in-spirit by the keeper-rig experiment's Cycles bake attempt.
- Keeper candidates A (fused reel, teal-baked albedo) and B (fused hands, off-silhouette) — not chosen; archived.
- Boat candidates A/B — not chosen; archived for possible cleanup rounds.
