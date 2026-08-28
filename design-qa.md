# Design QA — Golden curtain

- Date: 2026-08-28
- Source visual truth: `/Users/wachiravit/Downloads/INTRO_AINORA_.mp4`; the closed-curtain source frame is embedded on the left of `docs/qa/curtain-gold-source-vs-code.png`.
- Implementation: `assets/curtain/curtain3d.js`, rendered from procedural Three.js shader code with no video, image, or texture.
- Full-view comparison: `docs/qa/curtain-gold-source-vs-code.png` (source left, implementation right).
- 16:9 evidence: `docs/qa/curtain-gold-16x9-closed.png` and `docs/qa/curtain-gold-16x9-mid.png`.
- 48:9 evidence: `docs/qa/curtain-gold-48x9-closed.png` and `docs/qa/curtain-gold-48x9-mid.png`.
- Source and 16:9 implementation pixels: 1280×720 at density 1. Browser viewport: 1280×720 CSS px.
- 48:9 capture viewport: 1280×720 CSS px; the 48:9 wall is shown as a 1280×240 stage because the preview is letterboxed inside a 16:9 browser.
- States: closed curtain and 1.7 seconds after starting the 3.4-second opening.
- Primary interactions checked: reset curtain, open curtain, reveal first slide, and switch between 16:9 and 48:9.
- Browser console: no warning or error was reported during the visual pass.

## Findings

- No actionable P0/P1/P2 mismatch remains for the requested color change.
- Fonts and typography: not applicable; the curtain layer contains no text.
- Spacing and layout rhythm: the curtain remains edge-to-edge in 16:9 and continuous across the complete 48:9 stage. The code-generated folds are intentionally more regular than the photographic source because raster texture is prohibited.
- Colors and visual tokens: the implementation is now yellow-gold/amber with narrow highlights and deep brown fold shadows. Rendered mean luminance is 0.372 versus 0.335 in the source; mean saturation is 0.691 versus 0.714.
- Image quality and asset fidelity: no raster asset is loaded. Fine weave, folds, highlights, and shading remain shader-generated and resolution-independent.
- Copy and content: no logo, title, or intermediate scene was reintroduced.

## Comparison history

1. P1 — the prior procedural curtain was pale and washed out: mean luminance 0.630, mean saturation 0.494, and no sampled pixels below 0.25 luminance.
   - Fix: darken the vertical light profile, narrow the fold highlights, deepen the fold troughs, and replace the pale palette with amber gold and dark brown.
2. P2 — the first amber pass was over-saturated at 0.831 and visually too yellow compared with the brown-gold source.
   - Fix: rebalance the warm and dark shader colors. The final saturation is 0.691 and the deep-shadow share is 29.6%.
3. Post-fix evidence — `docs/qa/curtain-gold-source-vs-code.png` shows the source and final 16:9 implementation at the same 1280×720 state and scale.

## Verification

- `tests/check-curtain-three.mjs` samples the browser-rendered curtain screenshot and guards luminance, saturation, deep-shadow share, and amber RGB ordering.
- The same test covers WebGL readiness, opening, lag seek, direct first-slide reveal, and reset.

## Follow-up polish

- P3: calibrate brightness once on the installed display wall because panel gamma can shift gold toward green or orange.

final result: passed
