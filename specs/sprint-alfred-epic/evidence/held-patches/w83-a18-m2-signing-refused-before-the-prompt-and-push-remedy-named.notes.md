# w83 — signing is refused before the passphrase prompt when the approval-mode source is uncommitted; the push subject refusal names its remedy (candidate 18, A18-M2)

Applies on the applied chain at c9a73fb80d6f587efb5e3cd595a87fa5ae480e03. Criterion binding: AC-264 is the closest existing accepted criterion (fresh bounded attempt under its unchanged text); the PRD and Spec are unchanged.

## What it adds

- `po-human-approval.mjs`: `signingApprovalModeRefusal(mode)` and the typed code `PO-SIGN-APPROVAL-MODE-UNCOMMITTED`. `sign-intent` now reads the approval mode first (before readiness, request parsing, disclosure, confirmation, passphrase prompt or any spawn) and refuses when `pipeline.user.yaml` differs from HEAD (untracked, edited or deleted). This covers the bare `--intent-sha256` form and every `--request` schema. The message names the repair (commit the file or restore it, rebuild the request, sign once). A design approval request keeps its own earlier `DAB-SIGN-APPROVAL-MODE-UNCOMMITTED` refusal (w57) and is not routed through the new check.
- `push-prepare.mjs`: `preparePushSubject` now also captures the stderr of the in-process `prepare-push-subject` run. When it carries `CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE`, the `subject-hash` check names that code and its remedy is the same `pipeline-state.mjs materialize-push-threat-model` command `checkPushThreatModel` already names (now one shared constant). Other refusals keep their old remedy. The Close flow is unchanged; whether the Close commit should already carry the threat model stays a PO question.

## Checks (in the slice clone)

- `po-human-approval.test.mjs`: 202 of 202 pass; seven new cases (bare digest, quality-package, adoption, bootstrap acknowledgement, guard-override digest, portable Critic export, unknown schema) were RED against the original code (7 failed) and are GREEN; each asserts no confirmation was asked and no spawn happened.
- `push-prepare.test.mjs`: 90 of 90 pass, including one new case. Honest note: that case was written after the implementation, not before; it pins the remedy text and that an unrelated refusal keeps its old remedy.
- `runner-capabilities.test.mjs`: 4 of 4 pass (unchanged). `harness/scripts/check-consumer-safe-paths.test.mjs`: 9 of 9 pass.
- `w83-...check.test.mjs`: patch exists, `git apply --check` exit 0, touches only the six allowed files.

## Not done

- Part (c), the honest per-runner row "the observation boundary is tool-level only" in `config/runner-capabilities.json`, is NOT done. The guide table in `skills/pipeline-start/references/happy-path.md` is checked row for row against the JSON (`runner-capabilities.test.mjs`), so a new row needs the same row added to that guide, a file outside this slice's scope. Needed change: add the row to the JSON and the projected table row to `happy-path.md`, one sentence per runner, no claim of a hermetic boundary, plus a case pinning the wording.

## Not changed / not proven

- No signature ceremony, key handling, prompt text or signed binding changed. `approve` / `approve-critical` / `authorize-critical` are not covered (they are not `sign-intent`). The message of the `prepare-push-subject` refusal in `pipeline-state.mjs` itself is unchanged (out of scope); the remedy is named by `push-prepare.mjs`.
- The full Verify run was not made.
