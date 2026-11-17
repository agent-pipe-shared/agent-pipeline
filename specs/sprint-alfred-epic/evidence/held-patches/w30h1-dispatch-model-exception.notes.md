# w30h1 — a PO-requested, recorded, expiring model exception (C30G-M16)

Applies AFTER the 30h chain (30g, E1, E2 and P1): the patch is a delta on the same files and does not apply to the repository until that chain is (`apply --check` is exit 0 against the chain pin, exit 1 against the real HEAD, as expected). The check test therefore never runs `git apply` against the repository. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository, so this change is verified by tests only, not by a live round.

STATUS: the mechanism and its registrations are in the patch, with two items that need a file outside the write list or could not be run (section "Not done"). Registered: the new suite in `harness/verify-suites.json` and both capability-inventory copies, the `--help` entry in `lib/guard/command-catalogue.mjs`, one paragraph in `workflow-dispatch.md`.

## Why not the model-family approval

`scripts/model-family-approval-request.mjs` builds a signed, candidate-bound migration that must map EVERY available route to a family and floor (`MODEL-FAMILY-ASSIGNMENT-MAPPING-INCOMPLETE` otherwise); neither `guard-dispatch.mjs` nor `lib/dispatch-model-enforcement.mjs` reads it, so it cannot admit one dispatch on a model no configured duty route selects. A per-dispatch, recorded, expiring exception is a different mechanism, so it is built.

## What it adds

- `lib/dispatch-model-exception.mjs`: closed-shape, digest-chained, append-only store under `<git-common-dir>/agent-pipeline/dispatch-model-exception/store.json` (shape and rules of the budget-grant store). Entries: `record`, `revoke`, `use`. State (live / consumed / expired / revoked) is replayed from the file; anything that does not verify grants nothing. A short lock file bounds two concurrent hooks. A dispatch-id or count exception that is never used ends after 24 hours; a minutes exception ends at its window.
- `scripts/dispatch-model-exception.mjs record | list | revoke`. `record --model <opus|sonnet|haiku|fable>` (the exported `CLAUDE_FAMILY_ALIASES`, not a copy) `[--effort]` with exactly one of `--dispatch-id | --count 1..5 | --minutes 1..240`, `--reason` (stored verbatim, 500 characters) and `--by`. `--by` is required and has no default (EL-36). The record is an ATTRIBUTION record of the PO's request, like `gates.push_approval: chat`, not a signature.
- `lib/dispatch-model-enforcement.mjs`: `evaluateDispatchModel` stays read-only and gains an injectable/readable exception source. A model no route selects but a LIVE exception names is admitted with the warning `DISPATCH-MODEL-EXCEPTION` (`model exception: <alias>, requested by the PO at <time> (<by>)`); the same for an effort the configuration does not name. It returns `exceptionUse`; the exception changes only the model and effort, and an exception for one alias never admits another. Where no source is readable (no root, no injection, not Claude) behaviour is byte-identical to before (pinned).
- `hooks/guard-dispatch.mjs`: the hook consumes the use when the model check admits and registers an undo on exit with a non-zero code (the same shape as the briefing route record), so a dispatch refused by any later guard consumes nothing; a retry of the same dispatch (same dispatch id, else the same call) burns nothing more. The dispatch id comes from the briefing (read through the verified loader when the prompt is a briefing-file pointer). A SendMessage continuation is no Agent call and never reaches this check.
- Host commit: `configuredRecordRoute` (the one reader both `dispatch-record-write.mjs` and `dispatch-authorship-verify.mjs` give `compareRecordedModel`) also accepts the model and effort of a dispatch that has a recorded `use`, for that record's `taskId`; the classification stays `model-route-configured`, and its reason names the exception. Nothing else compared a recorded model with the routes: `dispatch-record-write.mjs` and `dispatch-authorship-verify.mjs` needed no change; `native-goldfish-host-return.mjs` compares the observed model with the briefing's own model by family (the briefing carries the exception model), so it needs nothing.
- `scripts/dispatch-briefing.mjs`: the Claude family check already admits any Claude family (only another provider's model is `DBG-MODEL-FAMILY`); with a live exception the briefing prints `- model exception: <alias>, requested by the PO at <time> (<by>)` in the dispatch metadata and the warning becomes `DBG-MODEL-EXCEPTION`. It never consumes.
- `hooks/guard-dispatch-budget.mjs`: a non-orchestrator call (any tool: Bash, Write, Read, Grep) that runs `scripts/dispatch-model-exception.mjs` or names the store directory is refused `DISPATCH-MODEL-EXCEPTION-ORCHESTRATOR-ONLY`; `lib/dispatch-model-exception.mjs` and the test files stay reachable.
- Audit: the store (`list`) is the audit source. The dispatch-record schema, field list and digests are NOT changed; a `modelOverride` was not used because it is a record field of the existing schema.
- Out of scope: the Antigravity and Codex model paths are unchanged. A record written on another machine cannot see this local store, so authorship verification there cannot confirm the exception.

## Refusals and their one runnable step

| Code | Cause | Step |
|---|---|---|
| `DISPATCH-MODEL-UNROUTED` (no exception) | no route and no exception names the alias | the `record --model <alias> ... --reason "<reason the PO gave>" --by "<label the PO gave>"` line printed in the refusal; if the PO declines, re-issue with a configured selector (also printed) |
| `DISPATCH-MODEL-UNROUTED` (expired / consumed / wrong-alias / wrong-dispatch-id) | the named cause per exception id | the printed `list` and `record` commands |
| `DISPATCH-MODEL-UNROUTED` (store does not verify) | tampered or malformed store, grants nothing | re-run the printed record command with `--move-broken-store-aside` |
| `DISPATCH-MODEL-EXCEPTION-NOT-CONSUMED` | the last count was taken by a concurrent dispatch | the printed `list` command, then re-issue |
| `by-missing`, `reason-missing`, `scope-*`, `*-out-of-range`, `model-not-allowed`, `effort-invalid`, `dispatch-id-invalid` | request shape | each message names the flag and range to re-run with |
| `store-does-not-verify` / `store-full` | broken or full store | re-run the same command with `--move-broken-store-aside` (renamed beside the store, never deleted) |
| `git-common-dir-unresolved` | not inside a git repository | re-run with `--root <repository root>` |
| `revoke-unknown-id`, `revoke-already-revoked` | wrong id | `list` |
| `DISPATCH-MODEL-EXCEPTION-ORCHESTRATOR-ONLY` | a dispatched agent touched the script or store | end the turn with the interim report; the orchestrator decides |

## Checks (clone, one at a time, test-in.mjs)

- `lib/dispatch-model-enforcement.test.mjs`: 30 of 30 (RED first: 9 new cases failed, 20 passed, before the lib existed).
- `hooks/guard-dispatch-model.test.mjs`: 7 of 7 (two new cases through the real hook, script and store; they were written before the implementation but their RED run was not recorded separately).
- `hooks/guard-dispatch-budget.test.mjs`: 129 pass, 0 fail, 2 skipped (pre-existing skips); one new case.
- `scripts/dispatch-model-exception.test.mjs` (new file): 8 of 8.
- `scripts/dispatch-briefing.test.mjs`: 189 of 189; the new case was written AFTER the briefing change (not test-first).
- This check test: 3 of 3.

## Not done (the checkpoint) / not proven

- `config/runner-capabilities.json` is NOT changed: `scripts/runner-capabilities.test.mjs` pins its table to `skills/pipeline-start/references/happy-path.md` row for row, so a row for this Claude-only capability needs that guide edited too, which is outside the write list. Needed follow-up: one row (topic "PO model exception", claude: the record script, codex and antigravity: not applicable, owner `scripts/dispatch-model-exception.mjs`) in both files.
- Checks run after the registrations: `check-verify-suite-registration.test.mjs` 1 of 1; `check-auth-gate-inventory-drift.test.mjs` 35 of 35; `lib/guard/g23-read-help.test.mjs` 5 of 5; `hooks/guard-dispatch.test.mjs` 93 of 93.
- NOT verifiable: `check-product-capability-inventory.test.mjs` is refused by the shell guard in this route (GUARD-CONTROLPLANE-SCRIPT: the script names the control-plane directory); the inventory change is the one surface line the registration check demanded, added to both copies.
- Architecture boundary check run on the clone: it reports 174 findings that predate this change (the baseline predates the chain); the new files are not individually named in `architecture/boundary-policy.json`, and `guard-dispatch.mjs` and `guard-dispatch-budget.mjs` were already past their accepted line counts and grew by about 40 and 35 lines; the ratchet lives outside the write list. No full Verify.
- The dispatch-id exception cannot match a prompt that declares no `Slice:` line or generator binding; it then reports `wrong-dispatch-id` and the recorded command falls back to `--count 1`.
