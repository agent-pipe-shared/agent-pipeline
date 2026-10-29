# Held patch notes: slice A2-c2, the old-text pins follow the one-command signature guidance (test only)

Base: the candidate of slice A2 plus the A2 patch applied first (`w7-signature-guidance-points-at-prepare-for-signature-a2.patch`);
this patch is the Elephant's hand-written, test-only continuation of the A2 checkpoint (no production file is touched).
Patch: `w7-signature-guidance-points-at-prepare-for-signature-a2-c2.patch` (3 test files).

## Why it exists

The A2 Goldfish stopped at its budget checkpoint with the five production edits, five new pin cases and the `repair-map.test.mjs`
update, but no test run. The Elephant ran the affected suites on a fresh clone at the candidate with the A2 patch (baseline versus
patched): three suites turned red on their pins of the former four-step text. Those are exactly the files this patch changes.

## Changes and justifications (no assertion weakened, QG-04)

- `scripts/guard-human-override.test.mjs`, test "render-copy-safe ... signature mode": the old assertions required
  `Step: prepare-authorization`, `Step: emit-signature-digest`, `Step: authorize-by-signature`. They are replaced by the equivalent on
  the new text: `Step: prepare-for-signature` is required, the three former steps and `<external-proof.json>` are refused.
  Justification: PO decision 2026-10-27 (backlog item `2026-10-03-signature-ceremony-requires-operator-work-and-breaks`). The chat-mode
  test next to it is unchanged and still proves chat keeps its steps.
- `lib/copy-safe-command.test.mjs`, test "test-path default hand-off round-trips ...": `Step: authorize-by-signature` is replaced by
  `Step: prepare-for-signature` plus a refusal of the old step and the placeholder. The chat-mode test is unchanged.
- `hooks/codex-pretool-guard.test.mjs`, check "ADR-0059 Decision 4":
  - `prepare-authorization --repo` is now required in chat mode only (signature mode refuses it).
  - The signature-branch pins of the four-step block (digest emission, the multi-line order pin, "in this session" label, the
    PO/operator sign-intent sentence, the `--proof <proof-path-from-sign-intent>` line) are replaced by one pin on the new
    continuation sentence ("the agent runs prepare-for-signature ... exactly one sign-intent command ... authorize-by-signature by the
    full path that command writes:" followed by the `prepare-for-signature --repo` line) and refusals of `prepare-authorization`,
    `emit-signature-digest`, the three placeholder tokens and a separate `authorize-by-signature --repo` line.
  - The old pin `gates.human_approval is "signature"` lived in the removed sign-intent sentence. It is replaced by the equivalent
    mode binding: `prepare-for-signature --repo` must be printed in signature mode and is refused in chat mode.
    OBSERVATION for the PO: the A2 production text no longer states the configured mode in words; the printed command alone carries it.
    If the sentence should name the mode again, that is a one-clause production change in the three hooks, not done here.
  - `--activate` and `--selection-sha256` refusals stay as they were.

## Evidence (fresh state, measured by the Elephant)

Verify clone at the candidate with A2 then A2-c2 applied (`compose.mjs verify-chain`, both patches OK):

| Suite | Result |
|---|---|
| signature-ceremony pin file | 21 of 21 (16 of 21 with the five production edits reverted: the five A2 cases are RED, one per site) |
| scripts/guard-human-override.test.mjs | 39 of 39 (38 of 39 with production reverted: the updated render-copy-safe pin is RED) |
| lib/copy-safe-command.test.mjs | 34 of 34 (33 of 34 with production reverted) |
| scripts/repair-map.test.mjs | 8 of 8 (7 of 8 with production reverted: AC-7) |
| hooks/antigravity-pretool-guard.test.mjs | 1 of 1 |
| hooks/guard-lifecycle-ready.test.mjs | tests 414, pass 411, fail 0 (the runner reports the difference of 3 without naming it) |
| hooks/codex-pretool-guard.test.mjs | exactly the two baseline reds, case 7 (slow push guard share, needs the private runner's synthetic HOME) and case 17 (Pipeline Author Repair, fixed by held patch q1 which is not in this chain); the ADR-0059 Decision 4 check is green with the patch (it was red after the A2 patch alone, before the mode-binding pin was replaced). With production reverted the file was red as a whole; the per-case names of that run were not kept |
| harness/scripts/check-verify-case-completion.test.mjs and the check itself | 32 of 32; registry valid (386 entries); no pin number needed to change |
| `generate-architecture-overview.mjs --check` | current |

Also run on a fresh clone (A2 patch only, baseline versus patched): `guard-gate-strength.test.mjs` 41 of 41, `human-governance-ledger.test.mjs` 24 of 24 and `governance-authority-resolver.test.mjs` 4 of 4 green in both; `project-onboarding-v3.test.mjs` is red in baseline and patched (chunk exit 1, pre-existing, not touched).

Restore proof: after the production-reverted run the five production files were restored from the A2 commit in the clone; the clone status listed only the three test files of this patch.

## What is NOT done

- The mode statement in words (see the OBSERVATION above) and the unused `PO_HUMAN_APPROVAL_SCRIPT` constant left in `codex-pretool-guard.mjs` and `antigravity-pretool-guard.mjs` (defined, no longer referenced): a production tidy-up for a later slice, harmless at run time.
- Full Verify, an independent batch Critic review, native Windows runs and PO acceptance stay open.
- Not covered by this slice: the Guard Maintenance Window text (a different verb) and `docs/push-release-flow.md`/`roles/elephant.md`, which still describe the former sequence in prose.

## Operator flow

Apply A2 then A2-c2, in one commit (the A2 patch alone leaves three suites red): `scripts/guard-human-override.mjs` is a never-liftable kernel
path, so apply under a Guard Maintenance Window or the ceremony you use for that file; then stamp and install.
An independent Critic review stays a parent-owned batch gate.

## Proposed commit message

fix(hgo): print the one-command signature flow in the denial guidance instead of the former four-step sequence (slice A2)
