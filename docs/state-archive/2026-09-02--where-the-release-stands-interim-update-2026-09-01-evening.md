# Handover archive -- Where the release stands — interim update, 2026-09-01 evening

> Rotated from `docs/state.md` on 2026-09-02 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Where the release stands — interim update, 2026-09-01 evening.
> Summary: The 0.6.0-to-0.6.1 release run, the overnight Nova B block, and the four dispatcher errors it recurred: superseded by the 0.6.1 release entry.
> Append-only once written; never edited by hand.
> Content below is byte-for-byte identical to its original `docs/state.md` text at the time of rotation.

## Where the release stands — interim update, 2026-09-01 evening

**The version moved from 0.6.0 to 0.6.1 mid-evening. This is deliberate, not
scope creep.** 0.6.0 was stripped of its build cachebuster for release
(`9aa4c7ca`); once that landed, a local plugin reload became a silent no-op —
the registry keys its install directory on the version string, and an
unchanged string installs nothing. The PO needed the rebase-authority fix
(below) to actually reach a running session, which is only possible under
review, so the version moved forward and the cachebuster returned (`63fe8b64`).
0.6.0 as a distinct release is superseded by this decision, not completed.

**What landed, in order:**
- `feat/sprint-nova-codex-v046` is pushed and signed at `266d691f`
  (`56e91858..266d691f`), verified 505/505, security CLEAN. This is real and
  durable regardless of what happens to `main` tonight.
- A second, separate signature was obtained and verified for `refs/heads/main`
  at `1e025ed5`, but the push was **refused server-side** by GitHub's own
  ruleset on `main` (`GH013`, `required_status_checks` on context `verify`) —
  not by anything in this repository. The approval record is committed anyway
  (`a801e0fd`): the approval was genuinely given and verified; the ruleset,
  not the approval, is what stopped the push. `main` needs a fresh ceremony
  once CI is green, because the candidate will have moved.
- The CI failures are diagnosed and fixed. See the next section.
- The rebase work package, transcribed in full into
  `backlog/items/2026-09-01-an-authorized-rebase-demands-a-fresh-po-signature-after-every-conflict.md`,
  is built and has had its mandatory T1 round. See the next section.

### The overnight block, 2026-09-01/02 — what was built and what it cost

**The CI diagnosis, and it was not what it looked like.** Three suites were red
in run `33551001455` on `266d691f`. The decisive environment axis is neither
`PATH` nor `HOME` nor the spaces in a fixture directory name — an outside
analysis proposed the last of these twice and it is refuted by the suite
passing locally 158/158 with that identical name. It is the filesystem behind
`TMPDIR`. `applyProjectOnboardingManifestRepair`'s rollback decided ownership
of the file it deletes by `{dev, ino}` alone; ext4 reallocates the lowest free
inode in the block group, so a file created immediately after an `unlink`
commonly inherits the freed number, while tmpfs draws from a monotonic counter
and never reuses one. Local `/tmp` is tmpfs, the runner's is ext4. Fixed at
`9a7c309b` with a deterministic reuse-injection test. `onboarding-init-tests`
had a different cause — the suite isolated `HOME` but not `PATH` and was
asserting a property of the host — fixed at `8db2c988`.
`codex-onboarding-capabilities-tests` is **intermittent**: red once and green
once on the same commit, green locally in four environments. Unresolved, with a
filed candidate cause (`pipeline.inode-identity-decides-deletion-in-a-second-rollback-path`).

**The rebase authority is built and reviewed.** `95f16466` is the resolver:
authority read only from `orig-head`, never from the partially replayed working
tree, with every binding Requirement 1 names. `103463a3` wires it in and
`2f59b2bd` narrows an over-refusal found while wiring. All fourteen test cases —
five positive, seven negative, two from Requirement 5 — are real guard-level
tests against a genuinely conflicted rebase fixture, none dependency-injection
only. The T1 round found nothing in the mechanism: the relief sits at the final
verdict so it can only turn a block into an allow, and Requirement 4 is enforced
by absence from an allowlist rather than by a second list that can drift.

**Requirement 5 is a PO decision taken during the block** and is the reason the
package is usable at all: the authority is never opt-in, and every denial during
an active rebase names the route forward in its own text. Its carrier had to
split (`b5937a09`) — `pipeline.guard-retry-actions.v1` admits read-only
diagnostics only, so the mutating continuation rides as data and prose while
`retryActions` carries the read-only diagnostics that let a session see its own
conflict surface. Widening that envelope for convenience was rejected.

**Four Critic rounds ran (K, L, M, N).** Their measuring stick is tracked at
`backlog/evidence/2026-09-02-critic-rounds-k-to-n-index.md` — this was itself a
finding: gate-cited evidence had been living in gitignored `scratch/`, and a
green artifact was overwritten in place by a later red re-run, leaving a true
claim unsupportable. Findings closed across `3f92cae8`, `41dd0d8e`, `b90640c2`,
`7eb9192c`, `97d24673`, `9284f4b8`.

**One finding was a bypass this block itself introduced**, and it is the reason
to keep running these rounds: the `--exec` payload table keyed on exact literal
spellings sitting behind a verb that yields no other candidates, so
`git rebase --exe '<write command>'` produced no candidate at all. Measured with
real git 2.53.0 — `--exe`, `--ex`, `--exe=`, `--ex=` all execute the payload.
Fixed at `41dd0d8e` by inverting the table: the *safe* options are enumerated, so
an unknown one fails closed.

**None of the nine originally-ordered PO terminal actions for the 0.6.0
release plan has completed as originally scoped** — the plan itself has
changed. Original list, for continuity: marketplace re-sync (done), verify +
`push-prepare` (done, superseded twice by re-verification), the feature-branch
signature (done), the CI loop (in progress, red, being fixed), the `main`
signature (done once, push refused, will need repeating), tag + release
(blocked on `main`), deleting `stable`, creating the release-tag ruleset, and
the TP-5/TP-3 maintenance window.

Two operational warnings belong with that list, because neither has a home
outside this file:

- `push-prepare`'s printed `authorize-critical` command carries an
  `--expires-at` window. Re-run `push-prepare` immediately before signing;
  never reuse an earlier printout. `docs/push-release-flow.md` documents the
  field's parsing behaviour but not this warning.
- The maintenance window owes four suite registrations plus the promotion of
  `check-suite-registration.mjs` itself to a gate step. All TP-3 — editing
  `harness/scripts/verify.mjs`, for which no in-session override exists in
  signature mode. **A "TP-5 release-adapter carve-out" was carried in this
  file's predecessor and in several session summaries; it could not be
  substantiated on 2026-09-01.** No backlog item names it, the TP-5 window item
  is closed, and the TP-3/4/5/6/7 restoration item is closed with the rules
  confirmed `armed`. Treat TP-5 as owing nothing until something re-establishes
  it. All four unregistered suites were measured green standalone the same day,
  so the gap is that the gate does not re-run them, not that the behaviour is
  unverified — and the guards themselves are armed regardless of whether their
  suites are registered.

### The day's work

**Landed:** `GIT-10`, the backlog-state-checker discipline, corrected after
review (`6c9f581f`, `1c2d2681`); a per-session trim of repeated grammar denials
(`1314edec`) and its per-subagent re-keying (`15bb3599`); `effort` added to two
dispatch-record field enumerations (`6ce146f4`, `601dc035`); the copy-safe
renderer's wrap point no longer splits a path (`6ea2add3`) with its pin
strengthened after review (`e2b8afa1`); handover-size enforcement at the commit
boundary (`54fb5006`) with its blob-size read repaired after review
(`7bca7f5d`). Vendored canon regenerated four times by hand — every canon
dispatch is forbidden to touch `plugins/pipeline-core/**`, so the obligation
falls to the Elephant and skipping it reproduces a red gate.

**Nine Critic rounds.** Caught before shipping: a guardrail stating a trigger
the code does not implement; an ADR asserting an enforcement the guard does not
perform; a calibration path that commits while reporting failure; a
push-approval-gate bypass; a guardrail presenting an accepted DRIFT baseline
that in fact contains a live open defect; a size check that reads a blob's full
content through a 1 MiB pipe and so blocks the very shrink it tells the reader
to perform; and a test pin whose concatenated assertion masks a per-renderer
regression.

**Twelve items filed**, each from measurement. Beyond today: a Critic has no
writable location for its own report, so findings survive only by
hand-transcription; the `advisor` prohibition in briefings is unenforced; ledger
event 403 stores an abbreviated OID the hash chain blocks repairing in place;
and the push-authority surface cannot be bounded by static enumeration — a
114-file import closure was refuted by a `join()`-built spawn a `new URL(...)`
regex cannot see.

One filed item records a **refutation**, not a defect: the hypothesis that an
onboarding test depends on a clean outer working tree was measured directly and
did not hold. It is filed so the question is not silently re-asked.

### Recurring dispatcher errors, recorded because they recurred

- **Contaminated Critic input, four rounds.** The implementor's dispatch record
  embeds completion-report prose. Every round quarantined it and re-derived from
  source. Remedy applied on the last round only: hand an authorship-only
  projection (`taskId`, `agentType`, `dispatcher`, `commits`).
- **Freehand dispatch briefings.** Two dispatches were built without filling
  `critic-review.md` / `goldfish-task.md` and were refused by `guard-dispatch`.
  The guard caught what the rule already forbids.
- **A half-applied re-verification.** A rework was briefed after checking only
  one of the two homes a rule could have landed in. It had landed in the other.
- **An overstatement to the PO**, caught by a Critic: two findings were relayed
  as independent when they are in tension.
- **Three `maxTurns` cliffs.** Dispatches were cut off at their harness limit
  mid-work. Briefed tool budgets are behaviour rules; `maxTurns` is a real cliff.

