# w106 - C18-22 every runner is told to prepare the signing itself and hand over only the sign-off

## What

Text and message fixes from the signing-parity audit (w105), gaps G2 to G5 and G7:

- G3: `externalPoSigningOnly()` (`lib/guard/po-commands.mjs`) now names who acts next: hand over the one signing line, prepare everything else yourself.
- G7: the Codex and Antigravity pretool guards print the same "who acts next" line before the unchanged JSON on every external-operator-required route (test per runner added).
- G2: `push-approval.md` gets the section "Who prepares, who signs (every runner)" with a table per signing kind.
- G5: `config/runner-capabilities.json` and the table in `happy-path.md` get the last row "Signing preparation" (same text on all three runners).
- G4: `templates/prompts/agent-obligations.md` gets section 8 "Human-signed gates: prepare yourself, hand over only the sign-off", hand-maintained in `harness/scripts/generate-agent-obligations.mjs`; the vendored plugin copy is refreshed.

## Why

PO decision 2026-11-02: parity, not a new wrapper script. On every runner the agent runs every preparation step and is told so;
only the sign-off in the terminal is the PO's.

## Criterion binding

AC-262 (the three new checks in the Codex test and the matching Antigravity check are named AC-262). PRD and Spec unchanged.

## Verification (orchestrator, in the clone, one suite at a time)

generate-agent-obligations.test 13/13 (byte equality, vendored copy), codex-pretool-guard.test green (`totalChecks` raised from 39 to 42
for the three added checks), antigravity-pretool-guard.test green, guard-lifecycle-ready.test 425 pass / 3 skipped / 0 fail,
runner-capabilities.test 4/4, pipeline-start-preflight.test 98/98, check-consumer-safe-paths.test 9/9. Patch applies to the chain base
(`apply --check` exit 0).

## Apply order

Delta on the chain base with w83, w100 and w105 applied. The new last row of `runner-capabilities.json` and `happy-path.md` may collide
with w96-a18-m6 (both append a last row): resolve in the chain.

## Not changed

G1 (builder for deploy/publication/release-preflight) and G8 (threat-model remedy) go to candidate 19; G6 to 0.7.1 (PO placement 2026-11-02).

## Not proven

Codex and Antigravity behaviour was not run live; the guard texts are covered by the adapter tests only.
