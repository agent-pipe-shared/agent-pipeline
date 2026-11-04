# w170 — the host-commit recover helper verifies, commits with the dispatch trailer and writes the typed record in one step (E1 second half, candidate 19c)

Applies AFTER the held patch w166 (it edits `harness/verify-suites.json` and `docs/product-capability-inventory.json` at the same end-of-list anchors) and before the derived-files commit.
The patch is the delta from the w166 base to this change; it does not apply to a checkout that lacks w166. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Why

Native Windows greenfield: 11 background Goldfish dispatches produced 0 host commits (`NGHF-PENDING-UNAVAILABLE` 8 times, no message for 3). The interim route the hook printed (verify the diff, commit as the Elephant with the dispatch trailer) was not backed by a record: the writer refuses a v4 authored-commit record without host observation, and the close skill then stops at `CLOSE-AUTHORSHIP-COMMIT-ONLY`.

## What it adds

- `scripts/goldfish-host-commit-recover.mjs` stays the one operator-facing command. New optional flags `--briefing <file> --handback <file>` (repository-relative, under `scratch/`, `evidence/` or `specs/`):
  - `plan` reads the dispatch binding (id, allowed paths) from the briefing's host-commit block, reads the briefed check files (`itemDelivery.checks[].path`) and requires each to exist (`GHCR-CHECK-MISSING`), binds HEAD, the paths and the SHA-256 of both inputs into `planSha256`, and reports `record: { kind: "orchestrator-attested", hostObserved: false, target }`. Dirt outside the allowed paths is listed (`outsideAllowed`), never committed (the commit names exact paths).
  - `apply` makes the one ordinary commit as before (trailers `AI-Assisted: true`, `Dispatch: <id> (goldfish)`, `Commit-Act: orchestrator`; the guard's own message policy accepts exactly this set), then writes the attested request and runs the existing attested writer (`dispatch-record-write.mjs --attested-request`), which re-opens the Git objects (one trailer, one parent, files equal to the report) and publishes the record. A fault after the commit is `committed-record-failed` (exit 2) with the exact command that writes the record; the commit is never repeated.
  - Typed refusals name the exact next command: a staged foreign file (`git restore --staged -- <paths>`), a moved HEAD or changed input (the plan command again), a missing check file, a missing hand-back, an existing record.
  - Without the two flags the helper behaves as before (commit only) and says in `recordNote` how to also write the record.
- `scripts/dispatch-record-write.mjs`: the briefing-block reader of the attested request is now the exported `readAttestedBriefingBlock` (same checks, moved, not shortened) and `attestedInputPath` is exported, so the helper plans with the same reader the writer uses.
- `lib/close-authorship-record.mjs`: an orchestrator-attested record counts as the slice's authorship only when the course candidate contains the commit the record names; otherwise the slice falls back to `orchestratorCommit`/`unrecorded` and `CLOSE-AUTHORSHIP-COMMIT-ONLY` still applies. Other record kinds are counted as before.
- `lib/guard/command-catalogue.mjs`: the exact argv shapes admit `--briefing` and `--handback` (once each, relative path), nothing looser.
- `hooks/native-goldfish-host.mjs`: the `NGHF-PENDING-UNAVAILABLE` and `NGHF-COMMIT-EXCEPTION` messages (PostToolUse result and stop-failure notice) name the helper's `plan` command with the dispatch id, and a `native-concurrent-unowned-head` reason also names `routine-repair.mjs run heal`.
- New suite `scripts/orchestrator-commit-record.test.mjs` (10 cases), registered in `verify-suites.json` and the capability inventory.

## Deviation from the briefing, stated plainly

The briefing asks for "a new, explicit kind". The repository already has one that is wired through every reader (review admission, Critic packet preflight, addendum, generic batch, `dispatch-authorship-verify`): `orchestrator-attested`, labelled "the orchestrator vouches for it, no host observation backs it". A second kind would need changes in `scripts/dispatch-authorship-verify.mjs`, which is outside this slice's scope, and would duplicate that label. The helper therefore writes the existing kind; the typed statement that the commit is not host-observed evidence is `attestation.assurance: "orchestrator-attested"` in the record and `record.hostObserved: false` in the helper's output. If the PO wants a separate kind anyway, that is a follow-up that must start with `dispatch-authorship-verify.mjs`.

## Checks

- New suite 10 of 10 pass (plan, apply with exact trailers judged by `finishedCommitMessageFindings`, record accepted by the close authorship classifier for exactly its commit, unobserved v4 authored-commit record still refused with `record-host-observation`, foreign staged file, moved HEAD, missing check file, missing hand-back, record failure after the commit, hook messages, guard admission).
- Existing suites run unchanged and green on the final state: `native-goldfish-host-finalizer-regression` 4 of 4, `goldfish-host-commit-recover.test` 10 of 10, `dispatch-record-write.test` 46 of 46, `close-coordinator.test` 50 of 50, the close-coordinator Critic-evidence pin 29 of 29.
- `lib/guard/guard-split-contract.test.mjs` is red (GSC01, GSC02: `control-plane-script-scan` is not in the split map) with and without this patch; it is not caused by this change.
- Behaviour change to know: the authorship tightening applies to every orchestrator-attested record, not only the helper's. A pre-existing attested record whose commit is not contained in the close candidate now falls to `orchestratorCommit`/`unrecorded`.
- The `NGHF-COMMIT-EXCEPTION` result of the finalizer carries no dispatch id and keeps the slug reason in `detail.reason`; the PostToolUse message therefore prints the plan command without `--dispatch-id`, while the stop-failure notice (which knows the id) prints it. Both read the reason from `detail.reason`.

## Not changed / not proven

- No new record kind (see above). The hand-back text is an input the Elephant must save to a file; the helper does not read the child's transcript.
- The plan binds HEAD through the digest; a briefing generated before unrelated commits is accepted (its candidate commit is shown as `briefedCandidate`, advisory).
- The record route needs the briefing file `dispatch-briefing.mjs` wrote; the pending-state and explicit-flag sources have no briefing and stay commit-only.
- Not run against a real Windows host, and the full Verify run was not made.
