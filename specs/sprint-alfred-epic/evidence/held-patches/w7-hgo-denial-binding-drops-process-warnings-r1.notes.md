# Held patch r1: Node process warning lines stay out of the bound denial digest (production, protected kernel path)

State: HELD PATCH. Nothing applied, reviewed or accepted. Written by a Goldfish that reached its budget checkpoint (edit, three cases, patch); verified by the Elephant (RED/GREEN, revert proof, fresh-clone comparison). Independent Critic review stays a parent-owned batch gate.

Backlog item: `backlog/items/2026-10-29-a-one-off-guard-warning-disarms-an-armed-override.md`. Measured cause: `w7-codex-pretool-author-repair-private-state-mode-q1.notes.md`.

## Cause

`bindingDenialReason()` in `plugins/pipeline-core/lib/human-guard-override.mjs` stripped only the human-override handoff headline and everything after it. A Node process warning that a guard child printed once to stderr (`(node:<pid>) ... Warning: ...` plus the `(Use \`node --trace-...\` to show where the warning was created)` hint) sat in the first denial reason and not in the replay, so the armed capability's denial digest never matched and the capability was skipped silently. `denialRationale` and `denialDigests` both call `bindingDenialReason`; the record side (`recordHumanGuardDenial`, request `denials: denialDigests(denials)`) and the consume side (`consumeHumanGuardOverride`, `currentDenialDigests`) both use `denialDigests` (Elephant re-read both call sites, the Goldfish confirmed only the definitions).

## Change (in the patch)

- `human-guard-override.mjs`: `dropNodeProcessWarnings()` drops every line that starts with `(node:<digits>) ` plus an immediately following `(Use \`node --trace-` ... `to show where the warning was created)` line, anywhere in the reason; it runs first in `bindingDenialReason()`. Handoff-headline logic and `trimEnd` untouched. A line that merely mentions `(node:...)` in the middle is kept.
- `human-guard-override.test.mjs`: cases (a), (b), (c) after the "exact retry ignores only regenerated human-override handoff text" case. (a) and (b) drive `recordHumanGuardDenial` and compare `requestSha256` (the exported seam; the request digest binds the denial digests). (c) records from a denial with the warning lines, plans, prepares, arms (chat mode, PTY seam) and consumes with the replay denial that has none.

## Measured (Elephant)

- Verify clone with the patch: `human-guard-override.test.mjs` 181 tests, 179 pass, 1 fail: only `Q9 (D55): a plugin update after a commit rebinds the registry and keeps the legacy armed-capability member`, a pre-existing red on the baseline (same assertion, `unavailable` against `initialized`); (a), (b), (c) pass.
- Same clone with ONLY the production file restored to the candidate: 177 pass, 3 fail: (a), (c) RED as designed, Q9 as before; (b) stays green (guards against over-stripping).
- Fresh clone (`verify-held-patch.mjs r1`), baseline versus patched: `scripts/guard-human-override.test.mjs` 39 of 39 both; `lib/pins/hgo-stale-capability-shadows-current-authorization.test.mjs` 8 of 8 both; `harness/scripts/check-verify-case-completion.test.mjs` 32 of 32 both (no VCR01 pin refers to this test file); the HGO file exits 1 in both for Q9 alone. The patch applies at the candidate.
- Not run: `generate-architecture-overview.mjs --check`.

## Capabilities armed before the change

A capability armed before the patch recorded a digest that included any warning lines of its first denial. After the patch the same denial digests without them, so such a capability stops matching. Only a capability whose first denial carried a warning line is affected, it is one-time with a thirty minute window, and today such a capability never matched its replay anyway. No regression.

## Protected path

`plugins/pipeline-core/lib/human-guard-override.mjs` is in `NEVER_LIFTABLE_KERNEL_PATHS` (`guard-maintenance-window.mjs` line 196): the PO applies this patch under a Guard Maintenance Window, not an agent.

## Proposed commit message

fix(hgo): leave Node process warning lines out of the bound denial digest so a one-off warning cannot disarm an armed override

## Apply

`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-hgo-denial-binding-drops-process-warnings-r1.patch`, `git add -A -- plugins/pipeline-core`, `git commit --no-verify -F scratch/commit-msg-po-apply-hgo-warning.txt`, stamp, install.
