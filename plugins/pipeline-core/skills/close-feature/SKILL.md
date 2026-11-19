---
name: close-feature
description: "Feature-lifecycle close: ends the CURRENT activeFeature in .claude/pipeline-state.json via the sanctioned pipeline-state.mjs writer (close-feature subcommand) -- appends an audit entry to closedFeatures, clears activeFeature/planApproval/planRevocation, sets planApproved=false, silences the stop-suggest nudge. Invoke when a feature's work is done and its plan/phase tracking should stop, independent of any session boundary."
argument-hint: "<name performing the close>"
allowed-tools: Bash(node plugins/pipeline-core/scripts/usage-ledger.mjs:*), Bash(node plugins/pipeline-core/scripts/pipeline-state.mjs:*), Bash(node plugins/pipeline-core/scripts/close-coordinator.mjs:*), Bash(node plugins/pipeline-core/scripts/finish-feature.mjs:*)
---

# close-feature — end a feature's lifecycle tracking

H5 compatibility rule: inspect the unified close coordinator, plan the exact
digest-bound transition, obtain confirmation, then apply only that action with
`--activate`. The sanctioned State writer is an atomic sub-effect bound to the
canonical coordinator lifecycle and state digest. This path never implies push
or release.

## Start here: the one command (P3, runner- and platform-neutral)

The agent closes the active feature with ONE command, up to the one commit it prints; a second call continues to `closed-local`:

```
node plugins/pipeline-core/scripts/finish-feature.mjs --one-shot --by "<name>" --architecture-impact "<impact>" [--critic-packet-id <32-hex>]
```

It produces the Verify evidence in candidate mode bound to the Critic packet (found on disk when exactly one exists, else pass `--critic-packet-id`), registers it, takes the package to `verifying` and `completed`, writes the audit request and, with Continuity, the Result close block and the close request, then runs the close-feature stage (start, checkpoint, `feature-close-prepared`, `pipeline-state.mjs close-feature`) and the `tracked-close-finalized` evidence. The audit bundle it writes under `audit-bundles/<feature>/<stamp>/proofs/` copies the signed approval proof envelopes that authorized the feature (the plan approval and, when it exists for the candidate commit, the critical push approval), with their digests in the bundle manifest; the bundle verifier checks every digest and every Ed25519 signature, and refuses a tampered proof. A human guard override keeps no proof (it is listed as a typed gap, never blocking). Nothing it does signs or pushes.

The command stops at `commit-required` and prints the paths and the commit message (`git add -- <paths>`, then `git commit`; the pre-commit hook admits exactly the bytes the stages wrote, G20-66). Run that commit, then run the printed `next` command (the same command with `--resume-lifecycle-id <id>`): it freezes the candidate, runs the final Verify and the Security scan, writes the final-verification and cleanup evidence and ends at `closed-local`. Exit code 2 and `status: "stopped"` mean one typed stop with its exact repair on stderr: `ONESHOT-CRITIC-PACKET-MISSING` (finish the Critic review; pass `--critic-packet-id`), `ONESHOT-VERIFY-RED` (fix what the Verify prints, rerun), `ONESHOT-COMMIT-PENDING` (the close outputs are not committed yet), `ONESHOT-SECURITY-BLOCKING`, `ONESHOT-RESULT-NOT-BOUND` (no Result is bound and the close could not bind it itself: it normally runs the bootstrap plan, its apply action, the agent-run reconcile and the owned commit on its own and then asks for the acceptance at the new HEAD, so this stop means the plan was refused or a decline was given, and its repair names each call; `ONESHOT-RESULT-BOOTSTRAP-NEEDS-PO` names a signature command for the PO), or the coordinator's own typed refusal (for example `CLOSE-CRITIC-CALLER-AUTHORED`). Rerunning the identical command is always safe. Publication, push and release stay separate human-gated steps. At `closed-local` the result's `pushEvidence.command` is the Critic-bound Verify the push gate reads (`evidence/verify-latest.json`): run it, then `push-init.mjs`.

**Reference:** the human acceptance question (`ONESHOT-ACCEPTANCE-REQUIRED`, `--human-acceptance`, `--human-decline`), the SBOM (`SBOM-*` stops, `--sbom-override-proof`), the four status facts and what the close touches moved to `references/close-feature-detail.md` section A; load it when the one command stops at `ONESHOT-ACCEPTANCE-REQUIRED`, `ONESHOT-ACCEPTANCE-NOT-YES` or an `SBOM-*` code, and before writing the close report.

Everything below is the per-stage recovery reference: use it when the one command stops and the repair needs a single stage by hand.

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

(Windows: `"%USERPROFILE%\.claude\projects"`.) This reader understands the Claude Code transcript layout
only. On Antigravity use the token-only route instead, with the session's brain transcript file
(`.system_generated/logs/transcript.jsonl`) as the argument:

```
node plugins/pipeline-core/scripts/usage-ledger.mjs --row "<feature-id>" --antigravity-transcript <transcript-file>
```

It prints the summed input, output and cache-read tokens of the model steps under the model key
`antigravity-unrecorded`, with the dollar half marked "unavailable (model not recorded in this
transcript)"; never add an estimate. On Codex use the same shape with the session's rollout file
(`--codex-rollout <transcript-file>`): it prints the last cumulative token total under the model the
rollout names, with the dollar half "n/a (price unknown)". A transcript without a usable token record
prints the skip sentence and exits 0; say in the close report that the telemetry row is unavailable
for it. Do not point the Claude command at another runner's directory and do not invent a row.
With several project directories under the Claude root, name the directory
(`--latest <projectDirName>`), or the command refuses and lists them. Append the printed row to the project's
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
evidence with `verify-evidence-producer.mjs --mode candidate --out specs/<feature>/evidence/<name>.json`
(under `evidence/`: the registered course reads candidate evidence only from there, and an evidence file
elsewhere under `specs/<feature>/` is refused `FPR-VERIFY-PATH` at registration),
register it with `register-feature-package.mjs --root <root> --add-verify-evidence
<path>`, then run `pipeline-state.mjs feature-package-plan` and `feature-package-apply`
with `--next-state verifying` (this binds the candidate to HEAD, refused without a
passing evidence for exactly HEAD) and again with `--next-state completed`.

The planner also refuses `CLOSE-CRITIC-EVIDENCE-MISSING` for a delivery-course
dispatch record that requires a Critic and carries no bound evidence (an
orchestrator-attested record included). A record is immutable, so the evidence
is a separate addendum. **Do not build these ahead of the close:** the planner
writes the addendum of every record exactly one consumed receipt covers, stops
once with `CLOSE-CRITIC-ADDENDA-WRITTEN` and names the one evidence-only commit;
commit those paths and run the close again. Only for a record that stays refused
afterwards, write one request file under `scratch/`, `evidence/` or
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

**A product fix after a passed Critic round.** Commit it as usual. The close still accepts it, but the push's
Critic carry does not (`CVL-CARRY-CONTENT-CHANGED`), so register a correction-DIFF round BEFORE the close
(`register-feature-package.mjs --help`, "Critic delta request route"). That is the whole answer: there is no
need to read the coordinator or the carry sources to find it. Details are under the carry-forward and
`candidate-frozen` paragraphs below.

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

**Reference:** the body of step 3 (`tracked-close-finalized`, `final-verify-green`, `candidate-frozen` renewal, scanner that did not run, public-by-design values, `cleanup-complete`, the carry-forward admission) moved to `references/close-feature-detail.md` section B; load it for the per-stage recovery of those phases.

## Closing a feature with active Continuity: the ordered route

A feature whose State carries `continuity` closes in this order. Every step is first a read-only plan, then an
`--activate` apply of the returned action after confirmation; nothing below signs or pushes on its own.
`close-coordinator.mjs drive` (table below) walks the coordinator pairs one step per call and tells you what the next phase still needs; it replaces none of the commands.

1. Start the close lifecycle: `close-coordinator.mjs plan-start --root <root> --lifecycle <id> --actor <name> --close-intent durable-stop`, then apply the returned action.
2. Take it to checkpointed: `close-coordinator.mjs plan-transition ... --phase checkpointed`, apply the returned action.
3. Make the Result a Continuity binding: `pipeline-state.mjs continuity-result-bootstrap-plan`, then run the returned `applyAction` (`continuity-result-bootstrap-apply ... --activate`). Its completion prints, while the package is stale, the pending `preview` with its `requiredAuthority` and the `reconcileCommand`, and for a plan that needs the PO also `signatureCommand`.
   **Project WITH a session-authority catalogue (D231):** the direct `pipeline-state.mjs` call refuses (`SDC-AUTHORITY-UNAVAILABLE`) because the State write must be owner-bound. For exactly the six entries `continuity-result-bootstrap-plan`, `continuity-result-bootstrap-apply`, `continuity-result-retire-plan`, `continuity-result-retire-apply` (the retire pair a declined acceptance runs), `continuity-result-close-plan` and `continuity-result-close-apply`, run `node <plugin-root>/scripts/continuity-owner-route.mjs run --root <root> --lifecycle <id> -- <entry> [<entry flags>]` from the repository root, after the lifecycle reached checkpointed (take the entry and flags from the printed `applyAction.argv` from the entry name onward). One call binds a fresh per-invocation owner (a `controller-<random>` descriptor, not the host session and not the hook-observed owner, which is unauthenticated), runs that one entry through the unchanged gates, releases and removes its descriptor. A call killed in between leaves a binding: the next call prints `COR-BINDING-HELD` naming `routine-repair.mjs run heal --root <root> --reason "<why>"`, which releases it. Several calls in a row are fine: a released owner that wrote is its own witness. `close-feature` (step 7) is NOT on this route: run the action `finish-feature` or the coordinator returns. Its coordinator binding admits the direct route in a catalogue project too, unless a State operation is in flight (`SDC-AUTHORITY-HELD`); a call without that binding keeps `SDC-AUTHORITY-UNAVAILABLE`.
   **Read `preview.requiredAuthority` first.** `"agent"` (the usual case, G20-38): the plan moves only the Result entry, the fence-proven digest and the authority lift of the one Result entry Continuity binds, so every other artifact keeps the digest the approved manifest pins and the approved package is unchanged. There is no `signatureCommand`, no step 4 and no PO signature: run step 5 yourself with `reconcileCommand` exactly as printed (it has no placeholders and no proof inputs) and show the receipt it prints, which carries the before and after digests as the readback. The ledger records it as an agent-run, result-only reconcile labelled `agent-result-only-reconcile-no-po-proof`, never as a PO approval. `"po"`: the plan also changes a non-result entry (or is a legacy Result repair), so steps 4 and 5 below stay the PO-signed route.
4. Sign the reconcile (PO only, in the PO's own terminal, only when `requiredAuthority` is `"po"`): run `signatureCommand` exactly as printed. It is the `po-human-approval.mjs authorize-critical --kind feature-package-reconcile` line, and `signatureCommand.subjectSha256` is the digest it binds (`criticalActionSubjectSha256` over `{ manifest, planSha256, candidate }`). It is never executed by the pipeline. A new commit changes the candidate and with it the digest: take the command again from a fresh `continuity-result-bootstrap-plan`.
5. Reconcile the package: run `reconcileCommand` (`pipeline-state.mjs feature-package-reconcile ...`); on the PO route after replacing its four placeholders. `<po-name>` is the PO's own name, supplied by the PO, never by the agent. `<proof-request>`, `<proof-authority>` and `<proof>` are the `requestPath`, `authorityPath` and `proofPath` the signing terminal printed.
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

## After the close: a push or a release (a consumer project's last step)

**Reference:** the push and release follow-up of a consumer project moved to `references/close-feature-detail.md` section C; load it once the close ended at `closed-local`.

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
| `close-coordinator.mjs drive` | --root --lifecycle --actor [--phase --architecture-impact --continuity-close-request --evidence --publication --audit-request --critic-verify-lifecycle --apply]; the helper over the pairs above: names the phase, the missing inputs and the remaining chain, plans one step, and with --apply applies exactly that step; writes the cleanup receipt itself, stops before every human-gate phase and takes no --authorized |
| `po-human-approval.mjs authorize-critical` | --repo-root --feature-id --plan --spec --kind --subject-sha256 --expires-at [--directory --subject] (the printed `signatureCommand`); in the terminal it prints `proofPath`, plus `requestPath` and `authorityPath` for every kind except push |

A commit message goes in a file: `git commit -F <msgfile> -- <paths>` after `git add -- <paths>` (the refusals for several `-m`
flags and for a message with parentheses name this form); a Pipeline-owned file commits with `scripts/commit-pipeline-owned.mjs`.

## Explicitly out of scope

**No feature-wide cost aggregation.** Step 1 only appends the CURRENT session's usage row (exactly
what `close-block` already does per session/block) -- it does NOT sum tokens/cost across every
session a feature ever touched. A feature-wide cost rollup is a separate, not-yet-built capability;
do not claim or imply a total here that this skill does not compute.
