# Current runner model matrix evidence

Date: 2026-09-07  
Dispatch: `NVA-B-MODELREFRESH-1`

The configured V3 matrix is:

| Purpose | Configured selector |
| --- | --- |
| Codex epic/feature design, high-risk Critic, advisory | `gpt-6-astra` |
| Codex normal execution/review | `gpt-5.6-terra` |
| Codex routine implementation/mechanic | `gpt-5.6-luna` |
| Claude advisory and consult fallback | `opus` |
| Antigravity everyday work | `gemini-3.8-flash-high` |
| Antigravity mechanic | `gemini-3.8-flash-low` |
| Antigravity complex work | `gemini-3.1-pro-high` |

The previous dispatcher executed local `agy models`, which listed Flash 3.8
high, medium, and low, and Pro 3.1 high and low. This supports the configured
requested selectors; it is not execution or effective-model evidence.

The V3 registry contains no active Fable route or fallback. The historical
Codex `fable` mapping remains only for V1/V2 compatibility and is excluded
from direct selectors and the projected Claude alias catalog.

Contained V3-refresh coverage applies a stale fixture through the registered
migration tool, verifies the refreshed routing equals the registry, verifies
there is no active `fable` route, and verifies the Claude projection binds
`advisor_epic` to `opus`. No live `pipeline.user.yaml`, runtime projection, or
installed plugin was refreshed in this dispatch.

The V1/V2 compatibility translation accepts the two current Codex selectors
used by the fresh V1 seed: `gpt-6-astra` and `gpt-5.6-luna`. It retains the
historical Sol, Terra, and `terra` selector acceptance and still rejects an
unknown selector before V3 conversion. The V3 registry refresh mechanism is
unchanged.
