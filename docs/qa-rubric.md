# Visual QA Rubric — scored art passes

Practice (adopted 2026-08-26, from the r/ClaudeAI week-3 fishing-game
postmortem): write the criteria BEFORE the pass, score after, ship at 8+.
Compare candidate stills BLIND — copy them to neutral names (`A.png`/`B.png`,
shuffled) before judging, never "new" vs "old"; decide, then unblind.

All scoring happens from the SHIPPED gameplay camera or the beauty-gate pose —
never overhead/debug views (a pancake is a perfect island from above).

## Elements (score /10 each; ship the pass at 8+ on the elements it touches)

1. Water read — near-black base, crest silhouettes, foam carries the brights
2. Shoreline — surf clumps hug rims; no washes, no rings-as-doughnuts
3. Sky/horizon — gradient band visible, fog blend seamless, no geometry edges
4. Lantern — warm anchor pool hugs the hull/keeper; darkness closes around it
5. Boat — waterline contact, silhouette at gameplay distance, palette fit
6. Keeper — stance, silhouette (brim), face in shadow, scale in frame
7. Fish — species silhouettes distinct at fight distance; eyes/fins/jaws read
8. Tether — crisp filament, tension palette, anchored at hands/winch
9. Telegraphs — ripple rings readable at the shipped camera angle
10. FX — splash bursts/rings sell water contact; wake trails behind
11. HUD/paperwork — diegetic, grungy, municipal; nothing debug-looking
12. Composition (beauty gate) — luma report near concept refs (~60% dark / ~2% bright), boat frame-share, value structure

## Standing shot list (player height, per round)

- default boat frame underway (dusk AND a timescale-forwarded night)
- foot mode on the start islet
- beauty-gate pose (`node tools/beauty.mjs`) + its luma report
- one live fight (tension mid/high)
