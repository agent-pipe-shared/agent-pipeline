---
name: close-feature
description: "Feature-lifecycle close: ends the CURRENT activeFeature in .claude/pipeline-state.json via the sanctioned pipeline-state.mjs writer (close-feature subcommand) -- appends an audit entry to closedFeatures, clears activeFeature/planApproval/planRevocation, sets planApproved=false, silences the stop-suggest nudge. Invoke when a feature's work is done and its plan/phase tracking should stop, independent of any session boundary."
argument-hint: "<name performing the close>"
allowed-tools: Bash(node plugins/pipeline-core/scripts/usage-ledger.mjs:*), Bash(node plugins/pipeline-core/scripts/pipeline-state.mjs:*), Bash(node plugins/pipeline-core/scripts/close-coordinator.mjs:*)
---

# close-feature — end a feature's lifecycle tracking

H5 compatibility rule: inspect the unified close coordinator, plan the exact
digest-bound transition, obtain confirmation, then apply only that action with
`--activate`. The sanctioned State writer is an atomic sub-effect bound to the
canonical coordinator lifecycle and state digest. This path never implies push
or release.

Closes the feature currently tracked in `.claude/pipeline-state.json` (`activeFeature`). This is a
**feature-lifecycle** transition in the same coordinator. `close-block` requests
a resumable checkpoint or tracked-finalization transition and can run many
times over a feature's life; `close-feature` requests the one feature-completion
transition. A checkpoint does not imply feature completion.

Actor performing the close: `$ARGUMENTS` (name passed as `--by` below; required, non-blank). `--by` is an actor attribution, not a substitute for approval.

## Step 1 — Append the current-session telemetry row (best-effort)

Same mechanism as `close-block` step 8 (see `plugins/pipeline-core/skills/close-block/SKILL.md`
for the full flag reference) -- this skill does not duplicate that logic, it reuses the existing
ledger CLI:

```
node plugins/pipeline-core/scripts/usage-ledger.mjs "$HOME/.claude/projects" --latest --row "<feature-id>"
```

(Windows: `"%USERPROFILE%\.claude\projects"`.) Append the printed row to the project's
`telemetry/costs.md`. If that file does not exist yet, note that explicitly and SKIP this step --
do not fail the close over a missing telemetry file. This is per-SESSION cost data only; it is NOT
a feature-wide cost total (see "Explicitly out of scope" below).

## Step 2 — Close the feature

First plan and apply `feature-close-prepared` through the coordinator. When
Continuity is active, the planner requires the exact repo-relative
`--continuity-close-request` and binds its bytes, Result and close evidence.
The confirmed coordinator apply returns the only admissible State-writer
action. Execute that returned argv exactly after its separate confirmation;
do not reconstruct it from this prose. A delivery-course slice recorded only by
its `Dispatch: <slice> (goldfish)` commit, with no dispatch record (a
background Goldfish), is accepted only on the audit route: the planner refuses
`CLOSE-AUTHORSHIP-COMMIT-ONLY` until `--audit-request` and
`--critic-verify-lifecycle` bind a passing Verify and a Critic review to the
candidate. The plan's `courseAuthorship` names each slice's record:
`dispatchRecord`, `orchestratorCommit`, or `unrecorded`. An `unrecorded` slice
has no record of either kind. Report it to the PO before applying. The audit
request's `packs` entries are full organization policy pack objects or, for a
consumer without an organization policy, the shipped name `pipeline-core-baseline`
(floors only, never applied unless named), and its `coreVersion` is plain `x.y.z`.
The package must be `completed` with a candidate equal to HEAD and a registered
passing Verify evidence. Package side, nothing committed in between: produce the
evidence with `verify-evidence-producer.mjs --mode candidate --out specs/<feature>/<name>.json`,
register it with `register-feature-package.mjs --root <root> --add-verify-evidence
<path>`, then run `pipeline-state.mjs feature-package-plan` and `feature-package-apply`
with `--next-state verifying` (this binds the candidate to HEAD, refused without a
passing evidence for exactly HEAD) and again with `--next-state completed`.

The planner also refuses `CLOSE-CRITIC-EVIDENCE-MISSING` for a delivery-course
dispatch record that requires a Critic and carries no bound evidence (an
orchestrator-attested record included). A record is immutable, so the evidence
is a separate addendum. Write one request file under `scratch/`, `evidence/` or
`specs/` holding the `pipeline.critic-disposition-addendum.v1` object
(`recordPath`, `recordSha256`, `taskId`, `candidateCommit`,
`reviewCandidateCommit`, `criticPacketId`, `criticReceiptSha256`, and a
`criticEvidence` reference to a file under `evidence/` whose bytes you digest),
then run `node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root
<repo-root> --critic-addendum <request.json>` and plan the transition again.
The command refuses, and writes nothing, unless a consumed Critic receipt binds
the addendum: either the receipt of the record's own task id, or a
feature-wide Critic course (one task id, any number of rounds) whose reviewed
range, the commits after the receipt's base up to its reviewed candidate,
contains the record's commit. A failed receipt (`reviewPass` false) never binds
without a PO residual acceptance of its open findings
(`node <plugin-root>/scripts/pipeline-state.mjs approve-residual-acceptance
--by <name> --critic-packet <packet-id>`, the PO's own attended step; the
acceptance must be bound to that receipt's digest, candidate and exact
finding set; a major finding of past authorship that no commit can correct is
accepted only with `--reason-class uncorrectable-past-authorship`, which is part
of the signed subject, and a blocker never is). A course closed by a residual acceptance covers the records of
all its registered rounds (D217): name the course's LAST round in the addendum
(`criticPacketId` and `reviewCandidateCommit` of that round); the record's
commit may then lie anywhere in the union of the reviewed ranges of the
registered rounds, after the course's genesis base up to the last candidate,
provided the rounds form one connected chain (each delta round starts at the
previous round's candidate). Earlier rounds may carry findings. The addendum is
exclusive and cannot be replaced. Rounds are not capped (D190/D199): a further
correction-diff Critic round is always allowed.

The returned action has this shape (the Continuity flag is mandatory whenever
it is present in the returned argv):

```
node plugins/pipeline-core/scripts/pipeline-state.mjs close-feature --by "<name>" \
  --architecture-impact "<architecture-conforms|architecture-decision-added|architecture-decision-superseded|architecture-summary-updated|no-architecture-impact>" \
  --coordinator-lifecycle "<lifecycle-id>" \
  --coordinator-sha256 "<exact-state-sha256>" \
  --continuity-close-request "<exact-repo-relative-request>"
```

This is the ONLY sanctioned writer for this transition (see the header doc in
`plugins/pipeline-core/scripts/pipeline-state.mjs` for the full contract). No `activeFeature` present -> the CLI
refuses (error, exit 2, nothing written) -- report that back rather than working around it.
A `git rev-parse HEAD` failure during this step is NOT fatal (deliberate deviation from
`approve-push`, documented in that file's header): the close still completes with `forCommit: null`.

## Step 3 — Record the close in the handover/state records

The State sub-effect is not the terminal close. Complete Result, backlog,
handover, HISTORY, telemetry and retrospective bytes, then bind their exact
postimage with `tracked-close-finalized`. Only after the one final commit may
the coordinator freeze `candidate-frozen` and accept Verify/Security evidence.
Note in the project's handover file which feature closed, by whom, `forCommit`
(or "—" if Git resolution failed), and the close timestamp from the State
writer output.

`tracked-close-finalized` takes one repo-relative evidence file
(`--evidence <path>`, `pipeline.close-tracked-effects.v1`) with exactly the keys `schema`,
`resultSha256`, `backlogSha256`, `handoverSha256`, `historySha256`, `telemetrySha256`,
`retrospectiveSha256`, `pipelineStateSha256`; each value is the SHA-256 of that file's bytes.
Only `resultSha256` (the bound Result) and `pipelineStateSha256` (the State file on disk) are
compared. A project that has no telemetry or retrospective artefact uses the SHA-256 of the empty
input, `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, for that key (PO rule).

`final-verify-green` takes one PRIVATE evidence file in the coordinator's evidence directory
(`<git-common-dir>/agent-pipeline/publication-close/<lifecycle>/evidence/<name>.json`, absolute path,
`pipeline.close-final-verification.v1`) with `candidateOid` and `candidateTree` equal to the frozen
candidate, `verifyStatus` and `securityStatus` exactly `green`, and `verifySha256` / `securitySha256`.
Write `green` only when the Verify run (`--mode candidate`, full) passed and `security-scan.mjs --root
<root>` did not report `BLOCKING` for the frozen candidate; the coordinator does not read either result.

If the Security scan blocks the frozen candidate and the fix needs a commit, renew the freeze instead
of restarting: commit the fix on top of the frozen candidate, then plan `--phase candidate-frozen` again
(`CLOSE-REFREEZE` explains a refusal). The new candidate must descend from the frozen one and must not
change the State file, `specs/<feature>/` or `audit-bundles/<feature>/` that earlier phases bound.
The renewal is recorded as one more `candidate-frozen` effect; the final Verify and Security evidence
must then name the new candidate. Findings you judge not relevant are put on the scanner's own ignore
route BEFORE the freeze, with a reason: gitleaks through `.gitleaksignore` (`gitleaks-repair-ignore.mjs`),
dependency findings through the project's `osv-scanner.toml` (`[[IgnoredVulns]]` with `id`, `ignoreUntil`
and `reason`). The shipped gitleaks configuration already exempts the bare hex digests the close itself
writes into `audit-bundles/<feature>/<commit>/` and the State file; a real key in those files is still found.

Without separately authorized publication, confirmed descriptor-bound cleanup
may end at `closed-local`. Publication, readback, release and promotion are
separate coordinator transitions and are never implied by this skill.

## Closing a feature with active Continuity: the ordered route

A feature whose State carries `continuity` closes in this order. Every step is first a read-only plan, then an
`--activate` apply of the returned action after confirmation; nothing below signs or pushes on its own.

1. Start the close lifecycle: `close-coordinator.mjs plan-start --root <root> --lifecycle <id> --actor <name> --close-intent durable-stop`, then apply the returned action.
2. Take it to checkpointed: `close-coordinator.mjs plan-transition ... --phase checkpointed`, apply the returned action.
3. Make the Result a Continuity binding: `pipeline-state.mjs continuity-result-bootstrap-plan`, then run the returned `applyAction` (`continuity-result-bootstrap-apply ... --activate`). Its completion prints, while the package is stale, `signatureCommand` and `reconcileCommand`.
   **Project WITH a session-authority catalogue (D231):** the direct `pipeline-state.mjs` call refuses (`SDC-AUTHORITY-UNAVAILABLE`) because the State write must be owner-bound. For exactly the four entries `continuity-result-bootstrap-plan`, `continuity-result-bootstrap-apply`, `continuity-result-close-plan` and `continuity-result-close-apply`, run `node <plugin-root>/scripts/continuity-owner-route.mjs run --root <root> --lifecycle <id> -- <entry> [<entry flags>]` from the repository root, after the lifecycle reached checkpointed (take the entry and flags from the printed `applyAction.argv` from the entry name onward). One call binds a fresh per-invocation owner (a `controller-<random>` descriptor, not the host session and not the hook-observed owner, which is unauthenticated), runs that one entry through the unchanged gates and releases. A call killed in between leaves a binding: the next call prints `COR-BINDING-HELD` naming `routine-repair.mjs run heal --root <root> --reason "<why>"`, which releases it. A State write moves the image, and the next owner is refused (`companion-historical-owner-witness-missing`) until another route changes it; `close-feature` (step 7) is NOT on this route yet and keeps the direct route or the attended close until the follow-up slice.
4. Sign the reconcile (PO only, in the PO's own terminal): run `signatureCommand` exactly as printed. It is the `po-human-approval.mjs authorize-critical --kind feature-package-reconcile` line, and `signatureCommand.subjectSha256` is the digest it binds (`criticalActionSubjectSha256` over `{ manifest, planSha256, candidate }`). It is never executed by the pipeline. A new commit changes the candidate and with it the digest: take the command again from a fresh `continuity-result-bootstrap-plan`.
5. Reconcile the package: run `reconcileCommand` (`pipeline-state.mjs feature-package-reconcile ...`) after replacing its four placeholders. `<po-name>` is the PO's own name, supplied by the PO, never by the agent. `<proof-request>`, `<proof-authority>` and `<proof>` are the `requestPath`, `authorityPath` and `proofPath` the signing terminal printed.
6. Write the Continuity close request (below) and plan `close-coordinator.mjs plan-transition ... --phase feature-close-prepared --architecture-impact <impact> --continuity-close-request <request>`; apply the returned action.
7. Run the State-writer action that apply returns (`pipeline-state.mjs close-feature ...` with `--continuity-close-request`), as shown in Step 2.

The close request is one JSON file in the repository, schema `pipeline.continuity-close.v0`, with exactly the keys `schema`,
`featureId`, `expectedRevision` (the State's Continuity revision), `result` (the State's Result binding, `{ path, sha256 }`) and
`closeEvidence`. The rules for `closeEvidence`:

- it is a `{ path, sha256 }` binding of a regular repository-relative file (no symlink, not empty, hash equal to the file);
- it is different from `result`;
- its path is unique across closed features: a path already claimed by a closed feature is refused.

The usual choice is the combined Verify/Critic receipt of the feature. The State must also be close-ready: queue head `nextAction`
`close`, no dispatch, no blocker, no decision transaction.

## Command signatures

Spellings are taken from each script's own parser or help; `<...>` is a value.

| Command | Flags |
|---|---|
| `pipeline-state.mjs feature-package-status` | --root <dir> --manifest <repo-relative-path> |
| `pipeline-state.mjs feature-package-reconcile` | --root --manifest --plan-sha256 <sha256> --by <name> --proof-request <abs-path> --proof-authority <abs-path> --proof <abs-path> |
| `pipeline-state.mjs continuity-result-bootstrap-plan` | (none); read-only; once the Result is bound and the package is stale it prints the pending reconcile (`planSha256`, `signatureCommand`, `reconcileCommand`) |
| `pipeline-state.mjs continuity-result-bootstrap-apply` | --feature-id --expected-revision --expected-state-sha256 --expected-post-state-sha256 --updated-at --plan-sha256 --activate (use the returned action) |
| `pipeline-state.mjs close-feature` | --by --architecture-impact --coordinator-lifecycle --coordinator-sha256 --continuity-close-request |
| `close-coordinator.mjs inspect` | --root --lifecycle |
| `close-coordinator.mjs plan-start` | --root --lifecycle --actor --close-intent <durable-stop or runtime-transfer> |
| `close-coordinator.mjs apply-start` | the plan-start flags plus --plan-sha256 --activate |
| `close-coordinator.mjs plan-transition` | --root --lifecycle --actor --phase [--architecture-impact --continuity-close-request --evidence --publication --audit-request --critic-verify-lifecycle --authorized] |
| `close-coordinator.mjs apply-transition` | the plan-transition flags plus --plan-sha256 --activate |
| `po-human-approval.mjs authorize-critical` | --repo-root --feature-id --plan --spec --kind --subject-sha256 --expires-at [--directory --subject] (the printed `signatureCommand`); in the terminal it prints `proofPath`, plus `requestPath` and `authorityPath` for every kind except push |

A commit message goes in a file: `git commit -F <msgfile> -- <paths>` after `git add -- <paths>` (the refusals for several `-m`
flags and for a message with parentheses name this form); a Pipeline-owned file commits with `scripts/commit-pipeline-owned.mjs`.

## Explicitly out of scope

**No feature-wide cost aggregation.** Step 1 only appends the CURRENT session's usage row (exactly
what `close-block` already does per session/block) -- it does NOT sum tokens/cost across every
session a feature ever touched. A feature-wide cost rollup is a separate, not-yet-built capability;
do not claim or imply a total here that this skill does not compute.
