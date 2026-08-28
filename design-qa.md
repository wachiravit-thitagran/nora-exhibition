# Design QA — Curtain-only intro

- Date: 2026-08-28
- Requirement: show only the code-rendered curtain; do not load or display a video, logo animation, image sequence, or intermediate title scene.
- Implementation: `assets/curtain/curtain3d.js` and the local Three.js runtime.
- 48:9 browser evidence: `docs/qa/pure-code-curtain-closed-48x9.png` and `docs/qa/pure-code-curtain-mid-48x9.png`.
- Primary interactions: set curtain, open curtain, command-lag seek, reveal the first slide immediately after opening, reduced motion, and reset to time zero.

## Findings

- The logo Canvas layer, its runtime, timers, and all intro video/raster assets have been removed.
- The procedural Three.js curtain remains continuous across the complete 48:9 wall.
- During the 3.4-second opening, the first slide stays paused. It starts as soon as the curtain is hidden.

## Verification

- `tests/check-curtain-three.mjs` verifies that `assets/curtain/` contains no video or raster image files and no logo runtime.
- Browser interaction checks cover WebGL readiness, opening, lag seek, direct first-slide reveal, and reset.

final result: passed
