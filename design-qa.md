# Design QA — Red CSS curtain

- Date: 2026-08-28
- Provenance: the curtain implementation is restored from commit `cf53625`; later slide, control, synchronization, and media changes remain intact.
- Implementation: two CSS curtain panels with static layered gradients and compositor-only `transform` animation.
- Visual style: matte vivid red (`#C4132A`), broad irregular folds, dark inner overlap, top rail, and hooks. There is no logo or title on the curtain.
- Runtime: no canvas, Three.js, WebGL, video, image, texture, or network dependency is used by the curtain.
- Layout: the curtain remains edge-to-edge in 16:9 and continuous across the complete 48:9 stage.
- Timing: 4.2-second opening plus a 0.2-second completion guard, with relay lag applied as a negative animation delay.

## Raspberry Pi 4 performance constraints

- Only `transform` is animated on the two large curtain panels.
- The layered gradient fabric remains static during opening; `background-position`, width, left, clip-path, and filter are not animated.
- The first slide may play while the compositor opens the curtain, matching the behavior of `cf53625`.
- Disabling motion still reveals the first slide immediately.

## Verification

- `tests/check-curtain-three.mjs` keeps its legacy filename for CI compatibility. It verifies the absence of WebGL, the exact red base color, the rendered red-dominant palette, both curtain animations, relay lag completion, first-slide reveal, and reset behavior.
- Browser sampling at 1280×720 measured mean saturation `0.820`; mean RGB was approximately `(0.514, 0.088, 0.139)`, confirming a strongly red rather than gold render.
- `tests/check-anim.mjs` guards against expensive animation properties on large elements.
- Manual browser inspection covered closed and mid-opening states at 1280×720 in both 16:9 and 48:9 preview modes; panel overlap, rail, hooks, reveal, and full-stage continuity were intact.

final result: passed
