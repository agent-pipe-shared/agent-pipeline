# Sprint Phoenix recovery and design-route record

This file records exceptional design/bootstrap trajectories without treating a
workaround, transport result, or local observation as product authority.

It intentionally excludes credentials, account details, host names, absolute
paths, private repository coordinates, raw prompts, transcripts, unrestricted
tool output, and machine-local session identifiers.

## R-01 — Marketplace freshness recovery

| Field | Value |
| --- | --- |
| Phase | bootstrap |
| Trigger | The loaded Pipeline version could not initially be proven through the runner-independent freshness path. |
| Sanctioned path result | `unknown / marketplace-unavailable` |
| Actual local authority | Native Codex plugin registry reported Pipeline Core 0.4.6 from the remote marketplace. |
| Recovery route | Read-only host observation after the sandboxed child path could not reach the required native/network boundary. |
| Result | Pipeline Core `0.4.6+codex.20260726170452`, public release `v0.4.6`, loaded commit `9d1b3dc108eb77629ace5b82002120f5539abd8d`. |
| Product authority | None created by the recovery route. |
| Phoenix consequence | PHX-0 makes ruleset source and freshness runner-neutral, typed, pre-HEAD capable, and privacy-safe. |

The failure is architectural rather than a documentation-only mismatch:
freshness currently assumes a Claude-oriented project path and consumer Git
`HEAD`, while a Codex-only consumer has native plugin-registry authority. The
Sprint must correct the shared source contract instead of adding another
runner-specific bypass.

## R-02 — Read-only workspace observation

| Field | Value |
| --- | --- |
| Phase | design review |
| Trigger | The mandated workspace observer could not spawn its nested read-only `git` process inside the current sandbox. |
| Typed failure | `EPERM` before workspace observation completed |
| Recovery route | Run the exact observer on the approved host read-only boundary. |
| Precondition | No workspace mutation was allowed between observations. |
| Result | One stable digest before, between, and after the Advisor attempts: `35a313dd8035b5144b14ffa3670015bfa53abf8ff8566eaf2ff92c35cab25191`. |
| Product authority | The digest proves only equality of the observed workspace snapshots; it does not attest OS isolation, actor identity, or model identity. |

The first combined shell inspection was also rejected by the lifecycle guard.
It was replaced by separate read-only commands. No rejected command mutated
the repository.

During the privacy-correction audit, a second combined read-only command
containing explicit source-root arguments was conservatively classified as a
possible cross-repository action and rejected before execution. The same
`diff --check`, status, topology, criterion-count, and privacy checks were run
as separate commands from the already authenticated physical Phoenix root and
passed. This is recorded as guard-routing friction, not as repository
read-only state; the rejection produced no mutation.

The PHX-0 sequence correction reproduced the same class once: a combined
read-only command containing absolute source-root arguments was rejected before
execution. Its topology, criterion-count, whitespace, and status checks were
then run as separate repository-relative commands and passed. No guard was
bypassed and no rejected command mutated state.

The close reconciliation reproduced the class again for a combined inventory
and design-status read. It was rejected before execution and replaced with
separate repository-relative reads. The recurrence is recorded as one
sanitized workflow-improvement class; it neither expands the approved design
scope nor authorizes an early guard change.

## R-03 — Advisor route exhausted

| Field | Value |
| --- | --- |
| Consent | approved |
| Profile | epic |
| Selected route | host-bound read-only consultation |
| Primary | fresh Advisor, 60-second limit |
| Primary result | timeout; interrupted once |
| Fallback | fresh smaller Advisor, 45-second limit |
| Fallback result | timeout; interrupted once |
| Further attempts | prohibited within the selected bootstrap route |
| Workspace result | digest unchanged across the full route |
| Readiness claim | Advisory unavailable; no Advisor-pass claim |

No material was auto-applied and no repository file was changed by either
attempt. There was no attested selected-sandbox execution; OS isolation and
model identity are not asserted. The design therefore requires an independent
diff-scoped review and deterministic readiness checks before presentation at
the Product Owner gate. That review does not retroactively convert the
unavailable Advisor route into a success.

See [design/advisor-review.md](design/advisor-review.md) for the bounded
question and required follow-up.

The mandatory continuation re-entry later reran the same 0.4.6 Epic
bootstrap. Its newly selected route again performed only one bounded primary
and one bounded fallback; both timed out and were interrupted once. The
workspace digest
`e6aed2d81304e623bdd976a5e4da410b2e4dbe6d8001f43f0e57db63c5a002d6`
was unchanged before, between, and after. This was a new bootstrap duty, not a
third attempt inside the exhausted initial route, and it created no
Advisor-pass claim.

A later compact-continuation re-entry again selected the same policy. Its
primary timed out at the single 60-second deadline and was interrupted once.
The exact policy-named fast fallback role was not exposed by the current Codex
agent adapter, so that launch was rejected before any child or export. No
substitute role/model and no third attempt was used. The workspace digest
`fddcca4ff370939a45f44a5d5c97157a86aab4f070aa70851d3403629f720c0d`
was unchanged before, between, and after. This is adapter availability
friction, not an Advisor pass, workspace mutation, repository write
restriction, or product authority.

## R-04 — Inherited active-feature continuity

The repository state initially still named the completed 0.4.6 Codex
onboarding feature as active. Bootstrap adopted it into continuity with a
`review` queue head and no Result authority.

The sanctioned `close-feature` writer rejected closure because active
continuity requires an exact revision-, Result-, and close-evidence-bound
request. The adopted `review-active-feature` state exposes no supported
transition that can produce that missing Result or move the queue to `close`.
The failed close attempt wrote nothing.

An exhaustive source/readback check found:

- `review-active-feature` is created by the onboarding-continuity adoption
  path, but no production consumer implements that action;
- generic continuity CAS cannot change a `null` Result authority into a bound
  Result;
- final integration requires a real dispatch, which the adopted review state
  deliberately lacks;
- close transition requires an already bound Result and `nextAction=close`;
- a historical `result.md` file exists, but it explicitly describes
  push/readback/Issue closure as pending and retains final-candidate/evidence
  placeholders.

That historical file is useful scope evidence but cannot be promoted into
missing close authority without fabricating completion evidence. The Product
Owner's later statement that the 0.4.6 work is implemented, operational, and
complete remains the authoritative completion disposition, while the public
0.4.6 release is product-state corroboration rather than a replacement
lifecycle Result.

Phoenix must not silently delete or rewrite this state. Before the Phoenix PRD
can become the repository's active plan, one of the following is required:

1. a sanctioned, evidence-bound transition supplied by the lifecycle tooling;
   or
2. explicit Product Owner authority for one narrow administrative repair whose
   exact preimage, postimage, reason, actor, and readback are recorded.

The proposed narrow repair is:

1. record the exact state preimage digest;
2. remove only the stranded adopted `continuity` object, with no other freehand
   state change;
3. re-read and validate the exact postimage;
4. close the completed old feature through `pipeline-state.mjs close-feature`
   under the explicit Product Owner course authority, without inventing a
   Result;
5. activate `sprint-phoenix-epic` and its sole PRD through
   `pipeline-state.mjs set-feature`;
6. validate the new state/PRD language and record the final digest;
7. perform no remote write.

After the Product Owner authorized this course on 2026-07-26, the repository
guard still rejected the attempted agent edit with the typed reason
`pipeline-state.json is writer-owned and must not be edited directly`. The
attempt produced zero mutation. No sanctioned override/repair subcommand
exists for the adopted `review-active-feature` state.

The attended human step therefore uses the temporary one-time helper
`evidence/one-time-continuity-repair.mjs`, SHA-256
`faad27be438edf3e9c9876f4878a672d0c38f05ada562eccebd8f4e882bc8d4e`.
The helper:

- requires the literal `--apply` argument;
- derives and checks its physical repository root;
- binds preimage
  `cc3ccc2e40312e50633cbdfef47ce71aca37e9d85e1f1295bedc6cc97dfd4f96`;
- validates the exact old feature, revision 3, adoption action, review state,
  absent dispatch/blocker/decision, and `result: null`;
- deletes only the `continuity` property;
- atomically writes and reads back postimage
  `303942482fb7be0373f84a51c2d007a699528ffbf0f06545706a0ccc45ad358a`;
- performs no network or remote operation.

The helper's successful output was not the old feature close. It only restored
the state shape required for the sanctioned `close-feature` and `set-feature`
writers that followed. The helper was removed after successful readback; its
digest and this record remain.

The Product Owner's statement that the 0.4.6 work is implemented and
operational is scope evidence: stale backlog/document status must not reopen
that work. It does not by itself fabricate the missing lifecycle Result.

### Executed transition and readback

The attended helper completed with the exact declared preimage and postimage
and reported `remoteWrite:false`. The Product Owner then ran the sanctioned
writers:

1. `close-feature` closed `codex-onboarding-0.4.5` under the attributed
   Product Owner course authority at commit
   `9d1b3dc108eb77629ace5b82002120f5539abd8d`;
2. `set-feature` activated `sprint-phoenix-epic`, bound this PRD, selected
   `phase:"design"`, and reset `planApproved:false`.

The first fresh 0.4.6 lifecycle inspection after those writes returned
`continuity-damaged`. Its read-only repair plan correctly returned
`continuity_repair_unavailable` with `nextAction:null`; it was not retried.
That result exposed a second integration gap: the legacy `set-feature` writer
creates the new active feature, while the normal two-step workflow still
requires a separate `continuity-init` request. The bootstrap guard prevented
the agent from creating even that bounded request before V4 readiness.

Under the Product Owner's explicit narrow authority, the host created one
public-safe request bound to:

- State preimage
  `f58bdd6f9d0db075d26243a555c9cbee042665f779dbcbc709f1e70f76c8ab63`;
- PRD
  `93cef81e4d80c8f9adf1854fc90466d1a627afdf4557e4d3fd0bc42716914d5c`;
- Spec
  `4bb3bbc47aade0d7c9c71fc4a43dafe196573c222c4d5643c8ee1be7686e2c3e`;
- continuity request
  `26c02313da5d42ba79ce0f6ffe9deba7c46e3d9cbd83a1949d4930642469d429`.

The sanctioned `continuity-init` writer produced Phoenix revision 0 with
`result:null`, `dispatch:null`, and `nextAction:"review"`. Its exact State
readback was
`94e1671550dd1bdc8d164703ea39d16c9a229e3f4a7a35ab5555e414ddfac5da`.
The temporary request was removed after the succeeding bootstrap proved the
same continuity valid.

The prior cleanup binding had also been removed with the stranded continuity
while its private descriptor remained. Read-only status classified that
descriptor as not live; hygiene proved zero registered and zero remaining
temporary resources. The descriptor was therefore closed through the
descriptor-bound cleanup command, producing a complete zero-removal receipt.
A new Phoenix cleanup descriptor was then bound normally. No project artifact,
temporary resource, or remote ref was deleted by that cleanup.

The repeated full bootstrap then passed with:

- Pipeline `0.4.6+codex.20260726170452`;
- V4 repository/runtime/continuity/App-Server status `ready`;
- `pipeline.user.v3` source and no-op runtime projection current;
- ruleset and repository freshness `equal`;
- PO-gate authority, manifest, observation governance, toolchain, and Verify
  availability valid.

The canonical handover still reports `Last updated: 2026-07-25` despite later
non-documentation commits. That is retained as an explicit drift warning and
does not reopen the Product Owner-dispositioned 0.4.6 work.

### Critic route and initial verdict

After the fixed design candidate was committed, the prescribed selected
read-only host-bridge dispatch was prepared with exact commit/tree,
governance paths, ruleset, and no prose. The environment approval boundary
denied that external bridge action before a child or payload export. The
denial was not retried or bypassed, and the temporary request was removed.

The standing Product Owner-authorized functional equivalent then ran one fresh
paths/refs-only Critic with no chat history, no delegation, and no invoked
write tool under the literal assurance
`functional-equivalent-read-only; OS isolation not asserted`. It returned
FAIL with three blockers and three majors. The durable finding/disposition
record is [design/critic-review.md](design/critic-review.md). No effective
model identity or native isolation is claimed.

The unchanged initial candidate subsequently passed the canonical Full Verify
and integrated Security gate through the host boundary. The machine-written,
Git-ignored evidence binds the exact candidate commit/tree and remains an input
to correction re-review. Its public-safe SHA-256 digests are:

- Verify:
  `4b8e2591346f6c9b26939107992c3df60f01f72a0e4466007cc07ff8f11f72ef`;
- Security:
  `a3b575069b933e145d3a738de8bcde1c5143de8a2dc7ed0944773a1802c69aab`.

## R-05 — Initial privacy review failed closed

The first independent privacy review ran on correction candidate
`1b7860616c16c3879fc67dd964f1dd48a4a58100`, tree
`374248edea18bea452532771821cf6e669949b9f`, with exact Verify/Security
evidence and the literal functional-equivalent read-only assurance. It
returned FAIL with:

- a blocker because direct repository/Git reads bypassed the claimed
  per-stream access boundary; and
- a major because immutable portable attribution/rationale had no closed
  erasable storage, delete, or key-destruction contract.

No write or remote action occurred in the review. Phoenix accepted both
findings, declared Git one coarse public-safe access/retention trust zone,
prohibited personal/pseudonymous/free-form or otherwise erasable data before
portable durability, and added the separately protected restricted-event
schema/store/operation/test inventory. A fresh correction re-review is
required; this recovery record does not self-issue privacy sign-off.

## R-06 — First privacy correction re-review failed closed

The first correction re-review ran on candidate
`2891205e21f4f3f17e0c94b488c40a7e6fd80ca7`, tree
`0ef439f5f0885ac808b9799717f971a1d257b961`, without reviewer mutation or
remote write. The machine trajectory was consistent. It returned FAIL because:

- bound Spec §§4.4–4.5 still permitted a false interpretation of independent
  per-stream Git access/retention and an exclusive physical read boundary;
- append-only H-AC-06 did not state how restricted expiry, erase, and key
  destruction take precedence; and
- five restricted-store implementation files were outside the bound Spec
  inventory.

Phoenix accepted all three findings without waiver. The second correction uses
the normative Acceptance matrix to interpret the bound Spec, limits append-only
preservation to portable repository records, and assigns every restricted
operation to existing Spec-listed envelope/policy/decision/event-store/CLI/test
and documentation files. A new bounded re-review remains required.

## R-07 — Privacy correction re-review passed

The fresh bounded review ran on commit
`643c7d0623a43333b4597013ba96fa7c5990bdba`, tree
`449465e59ef250d2739140b60e95f0d774474c83`, with exact Verify and Security
evidence. Under
`functional-equivalent-read-only; OS isolation not asserted`, it reported no
findings, a consistent machine trajectory, no briefing violation, and no
reviewer write or delegation. It cleared PHX-PR-01..05 and direct regressions.

This closes the design privacy course gate only. It does not convert the two
earlier FAIL entries into passes and creates no implementation, push, merge,
release, external-write, or final-Epic authority.

## R-08 — Comprehensive re-review retained one lifecycle-writer major

The fresh comprehensive review of
`e9f742d1ceeadf6c39b6e67ec149c4d33285b63f..4dad856c216e3a55cba658ee1ea9d9752144674a`
cleared PHX-CR-01..04, PHX-CR-06, every privacy finding, and direct
regressions. It failed closed on one major: #22 had no mutating lifecycle
writer, while the architecture proposed four files outside bound Spec §7.

Phoenix accepted the finding without changing the Spec or beginning
implementation. The correction treats `#22 lifecycle writer` as a capability
over the existing unmodified #22 validator/planner and assigns its complete
transactional operation, authority, recovery, test, topology-documentation,
and Verify responsibility only to files already listed in Spec §§7.1/7.4.
The initial hand-written manifest remains a non-authoritative `draft` bootstrap
artifact; it cannot transition or authorize downstream packages before the
first approved implementation package delivers and verifies the writer.

The correction re-entry Advisor primary timed out once; the exact policy
fallback role was unavailable before launch. The workspace remained unchanged
through that route, no Advisor output was applied, and no pass is claimed. A
fresh Critic must clear PHX-CR-05R before the PO gate.

## R-09 — Writer correction exposed a package-sequence conflict

The fresh re-review of commit
`df0387a2b62e85e5cc881e6a41ddff596fe42db3`, tree
`0cfbff6fedd0eb3fcb7b127aca28d362ff71cbc2`, accepted the closed writer file
inventory and transaction design. It failed closed on PHX-CR-05S because the
architecture placed writer closure in a separate prerequisite package while
bound Spec §4.6 makes PHX-0 implementation package 1.

Phoenix accepted the finding without changing the Spec. Writer closure is now
mandatory PHX-0 slice A; the runner-neutral trust root is slice B in the same
package and WIP record. Slice B requires slice A's focused Verify/Critic pass,
and PHX-1..6 require complete PHX-0. This removes the competing package
authority while preserving the writer-first safety gate. A fresh review is
still required; the failed verdict is retained.

## R-10 — Comprehensive design re-review passed

The fresh final re-review ran on commit
`49c1a167c70a83e7e45422ee4407bfd8293d387d`, tree
`2d2990bb98d4ed98bca527ddd1019155213d8cd4`, with exact Verify and Security
evidence. It reported no findings, a consistent trajectory, no briefing
violation, and no reviewer write or delegation under
`functional-equivalent-read-only; OS isolation not asserted`.

PHX-CR-05S and every direct regression were cleared. Together with the prior
privacy PASS, all Phoenix design Critic findings are now dispositioned. This
closes the review course gate only; it creates no Advisor-pass claim, Product
Owner approval, implementation authority, push, merge, release, external
write, or final-Epic completion.

## R-11 — Design close reached the Product Owner gate

The close Stage-1 aggregate gate ran on commit
`8db528d60cc8bd1129b5adebafb8c065a90ee98b`, tree
`6c253cf45797911b297e7617f403550a8067ee97`. Full Verify returned exit 0
with evidence digest
`b8d52a74ad1317a5da86ba43f9006bf511c3a1133fafdd2cb2774f9baeaaf363`;
integrated Security returned exit 0 / CLEAN with evidence digest
`1bf956d1c17bb8793cf4d7583df7bf73ed1e866a47c7644248a80170969fc6a4`.

The descriptor-bound hygiene pass first found one exact disposable
capability-probe residue from verification. Its type, single-link identity,
size, and restrictive mode matched the known probe contract; only that
untracked probe file was removed. The repeated hygiene readback passed with
one canonical worktree, no active manifest, and no owned residue. The
sanctioned cleanup then completed with zero registered, removed, or blocked
resources and released the exact Continuity cleanup binding.

The canonical handover now presents Phoenix as design-complete and
`not-human-verified`. The active feature remains in `phase:"design"`,
`planApproved:false`, with exact PRD/Spec authority and a typed
Product-Owner-decision blocker. No implementation, plan approval, lifecycle
promotion, push, merge, tag, release, issue mutation, or other remote write is
claimed.

The same unapproved-plan guard correctly continued to protect product files
but also rejected the close ritual's root History and telemetry targets as
implementation. Those two optional-to-product but mandatory-to-ritual writes
were not bypassed. Their intended sanitized content is represented by this
Recovery entry, the canonical handover, Error Register, and self-retro item;
the root records remain an explicitly open close-routine residual requiring a
sanctioned close-artifact path, not premature plan approval. **Owner:** Phoenix
close owner (Elephant). **Expiry:** 2026-08-08; resolve it or obtain an explicit
PO waiver before any Phoenix push or final acceptance.

## R-12 — Authorized Phoenix design-review reopening and external-handoff scope

The Product Owner authorized one narrow Phoenix Continuity CAS to reopen the
typed design-review queue after adding the requirement that every
Pipeline-known external command/script offer be auditable. The request bound
the prior public-safe State preimage, active feature, unchanged PRD/Spec
authority, revision `3`, next review action, and `planApproved:false`; the
sanctioned writer accepted it as `CS-CAS-APPLIED` at revision `4`. The required
cleanup binding then advanced only the Continuity revision to `5` and created
no product authority, implementation dispatch, remote write, or execution
claim.

The machine-local request artifact is intentionally not a tracked design
artifact. Its public-safe request digest is
`c536d09ce53064c723b1cf2bb59bd5df9a472989a3d92d9efecfeb6dd0effadb`.
The durable record here preserves only the portable continuity transition; it
contains no raw shell command, private path, account, credential, terminal
output, or machine-local session detail.

The resulting design revision broadens PX-B into the External Command Offer
profile: the Pipeline must record an offer before it presents or initiates a
known external command/script, retain the origin and public-safe operation
facts, and distinguish offer, authorization, attempt, user assertion,
observed outcome, and readback. This is an audit expansion, not permission to
perform a bypass. The updated PRD/Spec require a fresh fixed-candidate review
and renewed exact Product Owner approval before implementation.

## R-13 — Security evidence trajectory observation

An earlier sanctioned local Security run on candidate
`60369c766ddc940925a3eeccc93819423c9d7541`, tree
`5e942cbd684d6f8fc851efd793e5a1f0a1edde83`, returned no scanner findings but
recorded `verifiedBeforeAfter:false` and blocked. Its overwritten local
machine-evidence artifact is not used as current-candidate evidence.

A later sanctioned run on candidate
`5eb98b99665bb074242d4084bec4839186fd08d5`, tree
`2a322ca16a7cce1658dcd67e066da90acd360035`, recorded
`verifiedBeforeAfter:true` and exit `0`. Both artifacts remain machine-local
and this record deliberately excludes their paths and scanner raw output.

The differing observations are not reproducible proof of a product defect.
They create no Phoenix implementation scope and no claim that a Security gate
needs a worktree-identity change. The only durable conclusion is trajectory
honesty: a later clean result must carry its own exact candidate evidence, and
an earlier blocked result must never be relabelled as clean.

## R-14 — PHX-0B productive rollback path

If a trust, privacy, or platform/runner regression is found after delivery of
the PHX-0B adapter, freshness, or bootstrap integration, the sole rollback
path is a new local compensating `git revert` commit for the complete set of
PHX-0B integration commits: the host adapter, its binding in common freshness,
the bootstrap route, and their matching tests and Spec inventory. It must not
use reset, history rewriting, force-push, or an automatic remote operation.

The compensating candidate requires new exact Verify, Security, and independent
Critic evidence before it may be described as a successful rollback. Those
checks are bound to that candidate and the observed regression; creating a
revert commit, a rejected operation, a timeout, or unchanged workspace state
is not a rollback-pass claim. The record retains only public-safe reason codes
and digests, never credentials, account or host details, private coordinates,
prompts, transcripts, raw output, or session identifiers.

This path is runner- and platform-neutral for Claude, Codex, and AGY on macOS,
Windows, and Linux. It introduces no runner-specific fallback, release,
re-enable, bypass, or remote authority. Other than the compensating local
commit and its fresh evidence, ordinary local development and normal code
paths remain untouched.

## R-15 — PHX-0A NFKC case-collision validation rollback path

If bounded reproduction diagnoses the NFKC case-collision validation introduced
by candidate `aa4af674` in
`plugins/pipeline-core/lib/feature-package-topology.mjs` as a false-positive
compatibility collision, the production rollback is one new local compensating
`git revert aa4af674` commit. It reverts that exact candidate/change and its
matching tests; it does not use reset, history rewriting, force-push, or an
automatic remote operation.

There is no feature flag, configuration switch, migration, or repair path for
this validator. It must not be selectively disabled, waived for a legacy
manifest, or represented as a completed migration.

The compensating candidate may be described only as restoring the predecessor
planner behavior for the diagnosed false positive after fresh exact Verify,
Security, and independent Critic evidence. It is not a compatibility approval
for a real collision and does not weaken the canonical NFKC case-collision
rejection: any confirmed canonical collision remains rejected, while a corrected
successor requires its own candidate-bound evidence before it may replace the
reverted validation.

## R-16 — Recovery Bridge status-projection rollback path

This record is limited to candidate
`08202731833e30f20cc8da1be302d512ad6fb458`
(`fix(phoenix): project pending bridge recovery`). That candidate changes only
the `feature-package-status` projection for an outstanding private Recovery
Bridge transaction: an exact current `public-committed` bridge transaction
must be reported as `recovery-required`, and malformed or drifted private
bridge state must never be reported as `ready`.

If a concrete regression is diagnosed in that projection, the safe operator
action is one new local compensating commit produced by:

```text
git revert 08202731833e30f20cc8da1be302d512ad6fb458
```

The revert is candidate-specific. It must not use `reset`, history rewriting,
rebase, force-push, or an automatic remote operation. It also must not be
used to change an in-flight bridge outcome: operators must not manually edit,
delete, move, or synthesize private Recovery Bridge journals, the generic
feature-package transaction journal, or any lifecycle manifest. An existing
bridge transaction remains recoverable only through the sanctioned
`feature-package-recover` writer and its exact receipt.

Immediately after the compensating commit, perform read-only verification
without altering those artifacts: inspect the unchanged Phoenix lifecycle
manifest through `feature-package-inspect`, query
`feature-package-status --manifest specs/sprint-phoenix-epic/lifecycle.json`,
and confirm that the result is explained by the unchanged transaction state
rather than a hand-edited journal or manifest. A status result alone is not a
rollback success claim and does not authorize issuing, consuming, extending,
or replacing a Product Owner decision.

The compensating candidate requires fresh candidate-bound regression gates:
the focused pipeline-state suite, aggregate `node harness/scripts/verify.mjs`,
the integrated Security gate, and a fresh independent diff-scoped Critic.
Only their exact evidence may establish that the revert restored the prior
projection safely. Until then, the outcome is a pending local rollback with no
claim of recovered lifecycle state, completion, push, merge, release, or
remote write.

## Audit classification

These records illustrate the Phoenix recovery profile:

- the agent journal records the trigger, rejected route, bounded options, and
  selected recovery without hidden reasoning;
- the human ledger records only an authority-changing exception;
- lifecycle events record attempted, rejected, applied, read-back, rollback,
  and cleanup states;
- evidence records public-safe reason codes and pre/post digests.

A single free-form mega-log is not an acceptable implementation of this
profile.

## Open course-gate risk ownership

| Risk | Owner | Expiry | State |
| --- | --- | --- | --- |
| Advisor route unavailable | Phoenix Elephant; Product Owner controls Critic dispatch | 2026-07-31 | RESOLVED for design readiness through the authorized fixed-candidate review chain; Advisor remains unavailable and unclaimed |
| Inherited 0.4.6 continuity could not close through the exposed sanctioned route | Product Owner controlled exception authority; Phoenix Elephant controlled exact execution/readback | 2026-07-31 | RESOLVED 2026-07-26; exact repair, close, Phoenix initialization, cleanup, and V4 readback recorded |
| Canonical handover lags the current released implementation | Phoenix close owner; Product Owner controls any scope change | 2026-07-31 | RESOLVED 2026-07-26 by the Phoenix design-gate handover; completed 0.4.6 work remains excluded from Phoenix product scope |
| Mutable authority-reader compatibility could remain indefinite | Phoenix integration-package owner | Earlier of Phoenix integration close or 2026-10-31 | Direct readers inventoried; dual-read fail-closed migration and expiry now normative; implementation evidence pending |
| #22 lifecycle writer was assigned to files outside the bound Spec inventory | Phoenix design owner | Before Product Owner gate | RESOLVED by final Critic PASS over Spec-listed ownership, transactional semantics, and mandatory PHX-0 slice sequencing |

Expiry is a stop/review point, not automatic permission. See
[design/governance-conformance.md](design/governance-conformance.md).
