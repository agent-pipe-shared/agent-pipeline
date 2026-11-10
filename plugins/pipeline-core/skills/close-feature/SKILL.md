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

The command stops at `commit-required` and prints the paths and the commit message (`git add -- <paths>`, then `git commit`; the pre-commit hook admits exactly the bytes the stages wrote, G20-66). Run that commit, then run the printed `next` command (the same command with `--resume-lifecycle-id <id>`): it freezes the candidate, runs the final Verify and the Security scan, writes the final-verification and cleanup evidence and ends at `closed-local`. Exit code 2 and `status: "stopped"` mean one typed stop with its exact repair on stderr: `ONESHOT-CRITIC-PACKET-MISSING` (finish the Critic review; pass `--critic-packet-id`), `ONESHOT-VERIFY-RED` (fix what the Verify prints, rerun), `ONESHOT-COMMIT-PENDING` (the close outputs are not committed yet), `ONESHOT-SECURITY-BLOCKING`, `ONESHOT-RESULT-NOT-BOUND` (no Result is bound yet; in a project with a session-authority catalogue the command opens the Close lifecycle itself and its repair names each owner-route call), or the coordinator's own typed refusal (for example `CLOSE-CRITIC-CALLER-AUTHORED`). Rerunning the identical command is always safe. Publication, push and release stay separate human-gated steps. At `closed-local` the result's `pushEvidence.command` is the Critic-bound Verify the push gate reads (`evidence/verify-latest.json`): run it, then `push-init.mjs`.

**The human acceptance question (one stop, no signature).** The first call stops once, before it writes anything, with `ONESHOT-ACCEPTANCE-REQUIRED`: the stop's reason is ONE generated sentence. In the same message say in one line how you really started or opened the delivered result and what it showed, whatever kind of result it is, or say plainly that you could not and why (never a gate; a result you could not run also goes into `--open-checks`). Ask the human exactly that sentence in the chat: whether they accept this feature package at the candidate, that the performed close counts as the human acceptance of this feature package, and the checks still open. If you know a project-specific open check (for example a real device check) that the sentence lacks, rerun first with `--open-checks "<check; check>"` so the sentence names it, then ask. Rerun the identical command with `--human-acceptance "<the human's literal answer>"` (pass it only when the human accepted; a decline means the close does not run). The answer is recorded in the feature's tracked `acceptance.md` (a managed section: the literal answer, the candidate commit, the open checks), labelled as an attribution record and not a signature, and travels in the one close commit. A rerun for the same candidate does not ask again, a changed candidate asks again, and a resumed close (`--resume-lifecycle-id`) never asks. The Pipeline-generated pointer in `acceptance.md` is registered immutable: the close keeps its registered digest honest with the package's own amendment record (no signature). An `acceptance.md` that the plan approval binds is never edited; its record goes to `specs/<feature>/evidence/human-acceptance.md`.

**What the close touches.** The tracked-effects digests hash what exists: the calibrated handover (`project/pipeline.json` `handover`, first brought to the closed state by `pipeline-state.mjs update-public-handover`, the existing writer: closed-local, the verified candidate, and technical close, product acceptance and push as three separate facts) and `telemetry/costs.md`; backlog, history and retrospective have no defined project file and keep the marked empty digest. The audit request names every Critic round of the feature (`evidence.criticReports`); the bundle under `audit-bundles/<feature>/<commit>/` carries each exported round report (`specs/<feature>/evidence/critic/<packet>/report.md`) and its README section "Critic round reports" names a round whose report could not be exported instead of omitting it. The close fetches every missing report itself from the private Critic journal (the verdict and its findings, checked against the digest in the receipt; working notes stay out) and carries it in the one close commit; a hand export with `session-critic-finalizer.mjs export` is only needed to publish richer notes, and a round it cannot read never stops the close. The minors of the Critic round this close is bound to go into the handover under "Open minor findings", and the result's `openMinors` line says how many are open and where: put that line in the close report.

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
only. On Codex or Antigravity it has no source: skip the step and say in the close report that the
telemetry row is unavailable for this runner. Do not point the command at another runner's directory and
do not invent a row. Append the printed row to the project's
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

The State sub-effect is not the terminal close. Complete Result, backlog,
handover, HISTORY, telemetry and retrospective bytes, then bind their exact
postimage with `tracked-close-finalized`. Only after the one final commit may
the coordinator freeze `candidate-frozen` and accept Verify/Security evidence.
When the push gate requires approval, `project/push-threat-model.md` is committed together with the close artefacts in that one
commit: `close-coordinator.mjs drive` lists `materialize-push-threat-model` (with `commitWith`) before it, so the tree stays clean afterwards.
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
Every private evidence file of the coordinator (this one, the publication receipts and the cleanup receipt) must be a
regular file with mode 0600 and a single link, with a name of `[A-Za-z0-9._-]{1,160}.json` and a size of 2 bytes to
1 MiB, in that evidence directory, which itself carries no group or world bits; otherwise the plan refuses with
`PB-FILE` ("must be a mode-0600 single-link regular file") or `CLOSE-EVIDENCE-PATH`.
Write `green` only when the Verify run (`--mode candidate`, full) passed and `security-scan.mjs --root
<root>` did not report `BLOCKING` for the frozen candidate; the coordinator does not read either result.

If the Security scan blocks the frozen candidate and the fix needs a commit, renew the freeze instead
of restarting: commit the fix on top of the frozen candidate, then plan `--phase candidate-frozen` again
(`CLOSE-REFREEZE` explains a refusal). The new candidate must descend from the frozen one and must not
change the State file, `specs/<feature>/` or `audit-bundles/<feature>/` that earlier phases bound.
The renewal is recorded as one more `candidate-frozen` effect; the final Verify and Security evidence
must then name the new candidate. Candidate 17: a `candidate-frozen` plan also prints `criticCarryAdvisory`
(beside the plan, outside its digest) when commits after the last Critic-reviewed candidate change content
(source, dependencies, configuration, agent prompts) that the push's Critic carry-forward will not carry.
The close still accepts them, but the push then needs a Critic round for them, and that round is only
possible while the course is open: register a correction-DIFF round BEFORE the close (route in
`register-feature-package.mjs --help`, "Critic delta request route"). After the close the course takes no
review; the way is a new feature of rigor 1 with a full Critic over those commits. Findings you judge not relevant are put on the scanner's own ignore
route BEFORE the freeze, with a reason: gitleaks through `.gitleaksignore` (`gitleaks-repair-ignore.mjs`),
dependency findings through the project's `osv-scanner.toml` (`[[IgnoredVulns]]` with `id`, `ignoreUntil`
and `reason`). The shipped gitleaks configuration already exempts the bare hex digests the close itself
writes into `audit-bundles/<feature>/<commit>/` and the State file (bare hex values of 32 to 64 characters);
a real key in those files is still found.

A scanner that did NOT RUN is a different case from a finding. In a project calibrated critical it blocks the close
(`SEC-CLOSE-SCANNER-NOT-EXECUTED`; a skipped `license-check` counts, `osv-scanner` with no package sources stays
`not applicable`). Install or configure the scanner, or record a named exception BEFORE the freeze in the tracked file
`project/security-scanner-exceptions.json` (`{"schema":"pipeline.security-scanner-exceptions.v1","exceptions":[{"scanner":
"license-check","reason":"<non-blank, at most 500 characters>","expires":"<ISO-8601 date in the future>","confirmedBy":
"<the label the human gave for this exception in chat>"}]}`); quote the human's confirmation in the chat and the close
report. An applied exception is printed on the scanner's `Security close status` line and the close ends
`ADMITTED BY NAMED EXCEPTION`, never `GREEN`; an expired, malformed or unknown entry is ignored and named in the refusal,
and an exception never covers a scanner that reported findings.

The record for an auditor is that bundle: its README lists the signed proofs and the feature's tracked evidence
with Git blobs, and it is pushed with the close. Never hand-write an index or evidence summary under `scratch/`.

A value that is public by design (for example an IndexNow key) is reviewed through the same route
(`gitleaks-repair-ignore.mjs --prepare-gate`, then `--approve-new`) when the project publishes it as the
tracked file `public/<key>.txt` containing exactly that key (hex, 32 to 64 characters): put the key alone in
the reviewed-value file under `scratch/` and add `--reason "<why this value is public by design>"` (at least
10 characters; the command prints it, quote it in the chat confirmation and the close report). Any other
value is refused with a text that names what is accepted. The suppression is an entry in `.gitleaksignore`,
so commit it BEFORE the freeze, or renew the freeze as above.

`cleanup-complete` takes one private evidence file, `pipeline.close-cleanup-receipt.v1`, with exactly the keys
`schema`, `status` (`complete` or `uncertain`), `evidenceDigest` (64 hex characters; only its format is checked),
`candidateOid` and `candidateTree` (the frozen candidate, after a re-freeze the renewed one). Produce it with
`close-coordinator.mjs write-cleanup-receipt --root <repository-root> --lifecycle <id>` (from `final-verify-green`,
or `readback-confirmed` after a publication; candidate 16d). The command lists the active session descriptors and
EXCLUDES the closing session's own: that session is still running, so its descriptor can only ever report
`unavailable`, and it is derived from the runtime environment for the runner that is closing (`claude-<session id>` for
Claude, `codex-<session id>` for Codex, `antigravity-<conversation id>` for Antigravity, from the record its pretool hook
writes for the close command), never typed. The command prints `runner`, `ownSessionDerivation` and the reason. The exclusion is
named in the stored observation (`cleanup-observation.json`, beside the receipt) and the receipt's `evidenceDigest` is
the SHA-256 of that observation. Every OTHER active descriptor counts: `complete` only when none remains, otherwise
`uncertain`, and the output lists them. When the own session cannot be derived (the runner exposed no usable session
id), nothing is excluded, the receipt cannot be `complete` while any descriptor exists, and the output carries the
typed code `CLOSE-CLEANUP-OWN-SESSION-UNDERIVED` instead of claiming that other sessions remain. On Antigravity, exactly one
`antigravity-` descriptor answering `unavailable` is taken as the closing conversation and labelled
`inferred-single-antigravity-descriptor`; with several, none is excluded and the output names them and the way out. A project with no descriptor at all
gets `complete` with an observation that says so (no hand-chosen digest is needed any more). `uncertain` is accepted
by `cleanup-complete`, but `closed-local` is then refused with `CLOSE-CLEANUP`; end or clear the other sessions,
write the receipt again, and run `cleanup-complete` again with the new file (a later `cleanup-complete` with
`complete` replaces it). Hand-written receipts with the empty-input digest (PO decision 2026-11-01) stay accepted,
because only the format of `evidenceDigest` is checked, but the producer is the route. A hand-written receipt is an
operator's assertion, not an observation, on every runner: say so in the close report (`operator-asserted`) and use it
only when the producer's own output shows that the only remaining descriptor is the closing session's own.

The Critic carry-forward of a Critic-bound Verify (`--mode release --critic-packet-id ...`) admits the close's
own commit and handover-only commits after the last Critic round: a commit with one parent whose every changed
path is a Markdown file under `docs/` or `backlog/`, anything under `specs/<feature>/` or
`audit-bundles/<feature>/` of the feature being carried, or the State file, added or modified as regular
non-executable files. Any other path (source, tests, configuration, agent or skill prompts, another feature's
directory, a symlink) keeps the commit a correction and the carry refuses with `CVL-CARRY-CONTENT-CHANGED`.

Without separately authorized publication, confirmed descriptor-bound cleanup
may end at `closed-local`. Publication, readback, release and promotion are
separate coordinator transitions and are never implied by this skill.

## Closing a feature with active Continuity: the ordered route

A feature whose State carries `continuity` closes in this order. Every step is first a read-only plan, then an
`--activate` apply of the returned action after confirmation; nothing below signs or pushes on its own.
`close-coordinator.mjs drive` (table below) walks the coordinator pairs one step per call and tells you what the next phase still needs; it replaces none of the commands.

1. Start the close lifecycle: `close-coordinator.mjs plan-start --root <root> --lifecycle <id> --actor <name> --close-intent durable-stop`, then apply the returned action.
2. Take it to checkpointed: `close-coordinator.mjs plan-transition ... --phase checkpointed`, apply the returned action.
3. Make the Result a Continuity binding: `pipeline-state.mjs continuity-result-bootstrap-plan`, then run the returned `applyAction` (`continuity-result-bootstrap-apply ... --activate`). Its completion prints, while the package is stale, the pending `preview` with its `requiredAuthority` and the `reconcileCommand`, and for a plan that needs the PO also `signatureCommand`.
   **Project WITH a session-authority catalogue (D231):** the direct `pipeline-state.mjs` call refuses (`SDC-AUTHORITY-UNAVAILABLE`) because the State write must be owner-bound. For exactly the four entries `continuity-result-bootstrap-plan`, `continuity-result-bootstrap-apply`, `continuity-result-close-plan` and `continuity-result-close-apply`, run `node <plugin-root>/scripts/continuity-owner-route.mjs run --root <root> --lifecycle <id> -- <entry> [<entry flags>]` from the repository root, after the lifecycle reached checkpointed (take the entry and flags from the printed `applyAction.argv` from the entry name onward). One call binds a fresh per-invocation owner (a `controller-<random>` descriptor, not the host session and not the hook-observed owner, which is unauthenticated), runs that one entry through the unchanged gates, releases and removes its descriptor. A call killed in between leaves a binding: the next call prints `COR-BINDING-HELD` naming `routine-repair.mjs run heal --root <root> --reason "<why>"`, which releases it. Several calls in a row are fine: a released owner that wrote is its own witness. `close-feature` (step 7) is NOT on this route: run the action `finish-feature` or the coordinator returns. Its coordinator binding admits the direct route in a catalogue project too, unless a State operation is in flight (`SDC-AUTHORITY-HELD`); a call without that binding keeps `SDC-AUTHORITY-UNAVAILABLE`.
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

After the close a consumer project does one of two things, each with one signature. **A push to a feature branch:** after the push run the `afterPush.followUp` command `push-prepare.mjs` printed (`audit-proof-followup.mjs --root <repo> --remote <remote> --destination <ref>`). It adds the push proof and the final Verify and Security records to the audit bundle and prints the one commit and the push; no further signature.

**A release** is the annotated version tag `v<VERSION>` on the closed feature, and it includes the push. Write the `RELEASE-NOTES.md` entry
(`## v<VERSION>`: closed feature id, title, acceptance criteria met) WITH the feature, before the Critic round, so the Critic reviews it and the
Critic-bound push Verify carries it; a notes commit after the review is a content change the carry refuses. Run
`release-preflight-cli.mjs --root <repo> --base <base> --lifecycle specs/<feature>/lifecycle.json`: it stops at the first missing step with its
repair command, records the PO's one release approval (chat) or prints the PO's signing command (signature), and prints every remaining step in order: the tag, the push of the approved commit when it is not on main yet, the follow-up commit and its push, the tag push. Owner: `docs/push-release-flow.md`, "Releasing a consumer project".

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
