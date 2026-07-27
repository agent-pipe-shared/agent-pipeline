# Sprint Nova Epic — Result

## 2026-07-27 — B0 Codex blocked-goal continuation correction

Status: `branch-candidate-implemented`.

Codex native `blocked` is retained as a typed blocker with an exact readback,
not degraded to generic adapter unavailability. The user notice distinguishes
resuming the same resolved blocker from setting a new short objective with
`/goal <new objective>`. No replacement goal is created by the Pipeline.

## 2026-07-27 — B3-A Antigravity Alpha scope adjustment

Status: `approved-alpha-boundary; direct-agy-follow-up-open`.

The PO narrowed Nova Issue #15 to a documentation-bound Alpha third-runner
boundary. The public scope-adjustment comment on #15 records the precise
non-live boundary; Issue #69 is the separately created direct AGY follow-up
with `sprint:NONE`. #15 remains open until Nova close and its close evidence
must not claim direct AGY delivery.

The reusable Nova close rule is recorded in
`plans/integration-and-close.md`: a material removed scope creates a new
`sprint:NONE` Issue, receives a precise comment on the original in-sprint
Issue, and the original closes only with its narrowed candidate/evidence.

## 2026-07-24 — Design package created

Status: `awaiting-approval`.

The Epic PRD, technical specification, acceptance matrix, issue/backlog
intake, Cyborg collision fence and Nova A/B plans were created on
`feat/sprint-nova-codex` from the exact published `v0.4.1` baseline.

No production implementation, issue mutation, backlog transition, merge,
push, release or completion claim has occurred. Implementation remains blocked
until the PO responds with the literal word `approved`.

## 2026-07-24 — PRD gate regenerated after canonical backlog cleanup

Status: `prd-gate-review`.

The preceding `awaiting-approval` entry records the first draft only and is
superseded as current gate authority by this entry. The regenerated PRD binds:

- all 15 live `sprint:nova` issues, including P0 Issue #57;
- nine Nova A and six Nova B issue outcomes;
- 13 Nova, six Cyborg, six later-Sprint and ten closed canonical backlog
  records at transition head
  `36dd616d3aa5bc21e49e138f6b8a9a17a9de25321998304306e4fa47289de562`;
- this repository as the sole backlog authority and Cyborg as a manual
  read-only mirror; and
- independent Nova/Cyborg Sprint acceptance with combined integration moved to
  a separate post-Sprint lifecycle.

The PRD gate approves only product scope, outcomes, allocation and boundaries.
The current technical Spec remains a draft and must be regenerated, reviewed
and approved through its own readiness gate. No production implementation is
authorized by `PRD approved`.

No issue edit, new backlog transition, implementation, merge, push, release or
completion claim occurred while regenerating this PRD gate.

## 2026-07-24 — PRD approved

Status: `prd-approved-spec-draft`.

The Product Owner responded with the exact gate decision `PRD approved`.
The durable decision record is
`evidence/prd-approval.json`, binding the approved PRD and acceptance bytes,
the exact `v0.4.1` product base, the 15-Issue intake and canonical backlog
transition head.

This approval authorizes technical Spec design and readiness preparation only.
The feature lifecycle remains `draft`; the technical Spec is not approved and
production implementation, external access, credentials, mutations, merge,
push and release remain unauthorized.

## 2026-07-24 — Technical Spec ready for PO review

Status: `awaiting-spec-approval`.

The blocked pre-cleanup Spec was replaced by technical Spec SHA-256
`47a952040fd3a50ba2b02c04d4b4c7c0d3b7a32d58e4a736858d19fda1eae8b9`.
The Spec fixes exact state machines, closed record shapes, digest domains,
crash recovery, mixed backlog-transition v2, Nova A/B gates, immutable
increment evidence and slice/source/test/path ownership.

The fresh independent Epic Advisor reviewed the preceding Spec bytes and
reported six blockers and seven majors. All 13 have explicit dispositions in
`evidence/spec-advisor-disposition.json`. The main corrections include:

- independent-branch versus physical-resource collision semantics;
- removal of receipt/commit self-references;
- canonical `.ndjson` and actual legacy-journal compatibility;
- additive transition v2 instead of widening transition v1;
- no new mutable Nova A state store and separate ADR gates for B production;
- final readback before journal/lock removal and closed legacy writers;
- non-vacuous selected-child, pool, pause, orphan and benchmark criteria; and
- exact implementation/evidence/documentation paths.

The Advisor was a fresh read-only `consult-advisor` and made no gate decision.
No durable `pipeline.host-advisor-status.v1` receipt was produced by the
collaboration surface. Required limitation: no attested selected-sandbox
execution; OS isolation and model identity are not asserted.

The Advisor also exposed a contradiction in the formerly bound acceptance
bytes. The corrected acceptance digest
`69779547a926df01768e7c518158e030ee777cb51ee82a66d009631d431d9f2c`
does not change the approved PRD scope; it aligns NVA-G05 with the approved
Sprint-independence boundary and adds non-vacuous technical criteria for
selected sandbox, unattended assumptions, worker workspaces, keep-awake and
interaction continuity. Spec approval must explicitly bind this new digest.

The machine-readable 14-binding Spec/backlog bridge is
`design/backlog-spec-bindings.json`; it covers Issue #57 plus all 13 canonical
Nova reconciliation claimants and keeps the Multi-CLI pilot item open behind
its separate PO-gated pilots.

Readiness baseline
`evidence/spec-readiness-baseline.json`, SHA-256
`48e9fa998c66d99e01cdaa44fc251b154047487e1e32350c6d452e3f11409821`,
binds the exact gate.

No implementation, backlog transition, issue mutation, external access,
credential use, merge, push, release or completion claim occurred. Spec
approval would authorize Nova A implementation dispatch only. Nova B
production supervisors/state stores, remote execution, credentials,
Antigravity live implementation and external mutations retain their separate
ADR/research/authority gates.

## 2026-07-24 — Technical Spec approved

Status: `spec-approved-nova-a-ready`.

The Product Owner responded with the exact gate decision `Spec approved`.
`evidence/spec-approval.json`, SHA-256
`d946074b8ad7181418ee017d27dc5b990311c08016d7695650498cff5b160f9c`,
binds the approved Spec, corrected acceptance, machine backlog bindings,
Advisor disposition and readiness baseline at gate commit `86ecde4…`.

The approval accepts the disclosed technical acceptance clarification without
changing the approved 15-Issue PRD scope. It authorizes Nova A implementation
dispatch, beginning with A1 / Issue #57 under the approved slice order.

It does not apply a backlog transition, mutate a GitHub Issue, activate Nova B,
authorize a mutable state store, remote execution, credentials, Antigravity
live implementation, external mutation, merge, push or release. No production
implementation or completion claim occurred while recording this decision.

## 2026-07-25 — PO acceptance of Nova A and activation of Nova B

Status: `nova-a-accepted-nova-b-active`.

The Product Owner explicitly confirmed that Nova A is complete and accepted,
and activated Nova B. The accepted product candidate named by that decision is
commit `bfd3c7c3d97b1db56b38c386fa114a1a68d66be5`, tree
`5f9fa8b11c88b925bb54de29770cd6c41b6ff250`. The current candidate-bound
Verify and Security records are `evidence/verify-latest.json` (SHA-256
`05ab21ce08dcdccf19ad7f9422b8ad5b39f3a9d831a37f71ef3f5f6b328977d1`) and
`evidence/security-latest.json` (SHA-256
`4fa19f6f55bfdaf5ede5aba0029b5aacee0699734f299bdfd8942cf89459d9ee`), both
with exit code `0` on that commit.

This append-only PO decision records the accepted Nova A state without
backfilling or fabricating historical A7 receipt/readback files that are not
present in the working tree. Nova B begins with B0 / `#60`; B1–B6 retain their
own stated authority, ADR and external-access gates.

The current implementation line remains `0.4.3`-based while `0.4.4` is
pending. A later rebase is an explicit integration event and requires fresh
candidate-bound gates; it is not performed automatically.

## 2026-07-25 — B0 Codex native-goal activation readback

Status: `nova-b0-codex-goal-active`.

The active B0 work item is persisted by the sanctioned continuity writer at
revision `0`, with feature `sprint-nova-epic`, phase `implementation`, package
`nova-b0`, action `runner-native-continuation` and next action `dispatch`.
Codex native-goal readback for that same active thread observed status `active`.
The sanitized identifiers are thread SHA-256
`5c60e83741aaf7b39fffd0183743148d0ca5a6582628219db730b8253236ac29`,
objective SHA-256
`5aac8d23817ab70597d24ea0430c74e170de24f2321431f646b7582bd3dc2d4d` and
goal binding SHA-256
`b26560661c530b48cdd2f76826f7ad11066b6ae901f14bb6a2efe3b9acf4a577`.

This is activation/readback evidence only. It claims no sandbox, approval,
network, repository or host-permission expansion. Claude Code remains typed
`unavailable` until its native client supplies matching set/get/clear readback.

## 2026-07-25 — Temporary TP-3 release for Nova verification wiring

Status: `po-authorized-nova-tp3-release`.

The Product Owner explicitly authorized lifting TP-3 for Nova topics. The
temporary release removes only the `harness/scripts/verify.mjs` protected-path
entry so the Nova B0 suites can be registered in the shared Verify entrypoint.
TP-1, TP-2, TP-4 and TP-5 remain protected. This is a test-registration
authorization only; it does not widen sandbox, approval, network, repository
or runner permissions.

## 2026-07-25 — Nova A repaired evidence-chain reconciliation

Status: `nova-a-repaired-evidence-chain-accepted; nova-b-integration-active`.

The earlier Nova A acceptance named the then-current candidate
`bfd3c7c3d97b1db56b38c386fa114a1a68d66be5`. A fresh Critic subsequently
identified three concrete gaps: the historical fourteen-finding Gitleaks
reconciliation was outside the A7 path table, selected-sandbox replay accepted
an identical `fingerprint-drift` terminal disposition, and Critic coverage was
not bound exactly to its reviewed diff paths.

The PO authorized the narrow repair and the resulting approval record. The
repaired product candidate is commit
`874323da7f510be3208ee8b6ffc31ef121963ee9`, tree
`76de02e71063e574e9728691fad30d2b0c4a6337`. Its candidate-bound Full Verify
and Security records are retained as
`evidence/nova-a/verify.json` (SHA-256
`1899d17cb34b82050d25cacbb9f8019932c940942269fb355973756a6b9b9e63`) and
`evidence/nova-a/security.json` (SHA-256
`d3abfde19be0b7d5196ef02390075313ef83cb01d063a09e4b8711927c3ee4b6`), each
with exit code `0`. The fresh Critic record is
`evidence/nova-a/critic.json`; it reports no remaining findings for that
candidate.

The immutable gate-only chain is preserved without rebasing: E1
`cb5560e6abe8dd0e1e4a833f1061467a6172fdb5` contains the receipt and
candidate evidence, and E2 `48d49deccb29c150fbbaf85418836db77d3f1d21`
contains only the validated readback and PO activation. The E1 receipt digest
is `b087e6dd087396fa887a14e4fb022ca02cc672510b9245de3690a30b8e5c8fec`.
This integration retains that evidence unchanged while merging the accepted
repair into the current 0.4.4/Nova B line. Nova B continuation requires fresh
candidate-bound gates for this integration line; no historical gate is
silently transferred to a different tree.

## 2026-07-25 — PO B0 plan-scope decision

Status: `po-approved-limited-b0-plan-documentation`.

The Product Owner explicitly authorized the otherwise exceptional, limited
update of `specs/sprint-nova-epic/plans/nova-b.md` for B0 rollback and
compatibility documentation. The authorization is confined to that path and
subject matter; it does not grant another B0 implementation path, a permission
expansion, external integration or supervisor.

## 2026-07-25 — PO B0 artifact-digest maintenance authority

Status: `po-approved-b0-artifact-digest-maintenance`.

The Product Owner authorized `specs/sprint-nova-epic/lifecycle.json` solely to
refresh SHA-256 bindings for already PO-approved `plans/nova-b.md` and
append-only `result.md` bytes. The same narrowly mechanical authority applies
to comparable B0 artifact-digest maintenance. It never authorizes a semantic
change to an unapproved artifact, another implementation path, external
integration, permission expansion or supervisor.

## 2026-07-25 — Nova B R5 integration-gate readback

Status: `nova-b-entry-gates-verified`.

The final B0 integration product candidate is commit
`4b96d95d2e527cd8ef68f88f4d7b2a3412297362`, tree
`5da462b9f632828dfdbb61ed3d813c769a71f10f`. Its retained, exact-bound
Verify and Security records are
`evidence/nova-b/integration-0.4.4-r5/verify.json` (SHA-256
`47c35b9fd072e01cdc80c7b0daa5f1f7ae971dda77c2f9b8af8762defac5480b`)
and `security.json` (SHA-256
`a164928c2674cf9fdc7674362f1aff8fdf0e571ff088849ec489426d997a55d3`),
both exit `0`; Security reports zero Gitleaks findings. The fresh independent
Critic reports `PASS` with no findings in `critic.json` (SHA-256
`d89763bd58b6883d4dc76bf0efe07545f92fce8ecd0fcb3f9e8cdee8b477e549`).
Its literal assurance is `functional-equivalent-read-only; OS isolation not
asserted`. The readback preserves the accepted Nova A E1/E2 chain and makes no
stronger isolation or permission claim.

## 2026-07-25 — 0.4.4/Nova B integration gate evidence

Status: `candidate-gates-verified; fresh-critic-pending`.

The integration product candidate is commit
`b622ddb3f58c0d1316d8176616adaca62ff26304`, tree
`830861beb349cda2fa1e721285c9753f9c912af5`. Full Verify and Security are
retained unchanged under `evidence/nova-b/integration-0.4.4/`; their SHA-256
values are respectively
`3e2d1696bec7a5992307c1760c562ad2b27611c692c882fccbf20338d5481f36` and
`18c9cc3151d119ff582d148ed6287636efc8dcbfddb5102b52e889293bb7dd74`.
Both bind that exact clean candidate and exit with `0`; Security records zero
Gitleaks findings. `readback.json` binds these gates to the validated immutable
Nova A E1/E2 chain. A fresh independent Critic remains required before this
integration line is used as the B1–B6 entry basis.

## 2026-07-25 — Nova B B0 native-continuation gate readback

Status: `candidate-gates-verified; fresh-critic-pass`.

The B0 product candidate is commit
`f85396f6d6c7082cb4b23bb733955891e2415640`, tree
`27e9fd0b66d7d5ee612895fef407b0314d7be6c1`. Full Verify is exact-bound and
exited `0` (`verify.json` SHA-256
`427183673ec76330c4d346b47395ef19af87f910c3b5db6147a24dbeb459f87e`);
Security is clean-bound and exited `0` (`security.json` SHA-256
`87846767e9cca00ec2dfe7dd25fe9f994d85f807b302c8f9ac014a96bd9f3b8b`).
Security reports zero Gitleaks findings.

A fresh, fixed-candidate Critic returned `PASS` with no findings under the
literal assurance `functional-equivalent-read-only; OS isolation not asserted`.
The verified terminal projection retains the adapter's cleared readback; a
typed unavailable/failed adapter outcome retains `null` and therefore never
claims a successful native clear. This B0 evidence does not expand sandbox,
approval, network, repository, host or supervisor authority.

## 2026-07-25 — Nova B D1 / B1-I local baseline readback

Status: `nova-b-d1-complete; b1-i-minimal-baseline-validated`.

ADR-0047 and the minimal local supervisor state/setup repair baseline are
closed for the product candidate commit
`ec97a6ef72c7dfd43dd3072dd56f089a5ab33324`, tree
`db366d1ef3f0b9a4e4e315087fe4892e2c78528c`. The exact immutable copies of
the candidate-bound Verify and Security receipts are
`evidence/nova-b/d1/verify.json` (SHA-256
`afa010ed2d6e10478382d72b3e4dfab5f8a5c043d0b130a004e69d7115a7c5f4`) and `evidence/nova-b/d1/security.json` (SHA-256
`3ce58716939e544b028de6c36dbc526a3df3609419e065a126eac2dca9e1ddd6`); both record exit code `0` with exact candidate binding.

`evidence/nova-b/d1/readback.json` binds those persisted receipt bytes and
records the supplied fresh independent Critic readback: `PASS`, no findings.
The raw Critic receipt was not supplied to this closeout, so the readback
identifies the PO continuation handoff as its source and does not represent a
raw Critic attestation. Its literal limitation is
`functional-equivalent-read-only; OS isolation not asserted`.

This closes only D1 and the minimal B1-I entry baseline. It does not claim an
active supervisor, child-process or external execution, OS isolation, model
identity, secret persistence, broad cleanup, or any other authority expansion.
The evidence-only closeout is deliberately distinct from the verified product
candidate. The lifecycle update is limited to the authorized SHA-256 binding
for this append-only Result.

## 2026-07-26 — B1-I PO exception and functional design activation

Status: `b1-i-design-accepted; implementation-authorized; live-provider-off`.

The normal Codex Host Advisor did not produce a valid
`pipeline.host-advisor-status.v1`. The PO explicitly authorized one fresh
read-only fallback subagent. It advised separate local Git clones, exact
process identity, reserved recovery capacity, fail-closed cleanup and real
fixture processes. This is recorded only as PO fallback advice: it is not a
normal Pipeline Advisor receipt, selected-sandbox evidence, a gate decision,
an OS-isolation claim or model-identity attestation.

The main session was explicitly confirmed by the PO as `gpt-5.6-sol / xhigh`.
The PO inserted a bounded Epic design phase, accepted ADR-0048 and authorized
the sole active Codex session to own and implement its exact manifest directly
as an EL-01/EL-16 exception. This authorization includes functional local
process/workspace code and deterministic local tests. It does not authorize a
live model/provider worker, external host, broker, credential, network,
repository integration, merge, push or release.

The repeated technical bootstrap readback was otherwise green:
`pipeline.project-onboarding.v4` was `ready`, runtime was
`readback-current`, App Server was `CAS-READY`, V3 authority was
`ready/noop/current`, Toolchain was `TCP-READY`, and Manifest and Verify
availability passed. The in-progress ADR then correctly exposed a PRD/Spec
digest mismatch and an unclassified normative document. The PO accepted the
ADR-0048 manifest correction for exactly the PRD and observation-governance
paths; no wider authority resulted. The deliberate remaining missing claim is
the normal Host Advisor attestation; no canonical bootstrap confirmation is
fabricated.

ADR-0048 freezes the functional B1-I contract and exact 20-path manifest. Its
implementation uses real independent local clones and child processes,
implements a fixed but separately activated Codex `exec` adapter, and keeps
live provider-backed `N+1 >= 2` capability observation and Issue `#21` closure
open.

## 2026-07-26 — B1-I functional supervisor implementation

Status: `functional-local-supervisor-verified; live-provider-off; issue-21-open`.

The exact ADR-0048 implementation manifest contains 20 changed paths and no
out-of-manifest path. The implementation candidate is commit
`b14a5f04ff1617bf7196260fbd74adad29704dd2`, tree
`95e03b560f16de05d5d750f4305ffa0ddf7df6e8`.

The closed supervisor contracts now bind request, plan, durable record,
per-worker result and explicit cancellation intent. Functional execution uses
private independent `--no-hardlinks` Git clones, exact Linux process identity,
heartbeat/orphan leases, timeout/cancel draining, bounded output and
mode/content-bound change manifests. It detects source-checkout drift and
tracked, untracked or ignored writes outside exact authority. Cleanup acts only
on exact terminal manifest members and retires the completed record so a later
wave can start.

Focused evidence is green: 10/10 core contract/adapter cases and 9/9 real
temporary-repository/operating-system-process integration cases. The latter
prove overlapping distinct PIDs, separate object inodes, a second wave after
cleanup, capacity and overlapping-write serial fallback, timeout, exact
cancel, nonzero exit, ignored unauthorized output, source drift, supervisor
crash classification, exclusive concurrent start and foreign-marker cleanup
denial. ADR-0047 state (18/18), setup CLI and B1-C pool (6/6) regressions also
pass.

Full Verify and its blocking Security phase ran on that exact clean candidate
and exited `0`. The generated local receipts are
`evidence/verify-latest.json` (SHA-256
`510942465b5842ef11bbc4f96ec258654d55aab0141d709d5e78d489818e064d`)
and `evidence/security-latest.json` (SHA-256
`e76673732279f374995c58a5eb43dc8d0f40075a8f4a3853e65e62318f1a9700`);
they bind the same commit/tree. Security reports zero Gitleaks and Semgrep
findings and zero license findings; OSV reports the expected successful skip
because this repository has no package sources.

No Codex/provider worker was started. The production-capable fixed `codex
exec` surface was parser-checked locally with approvals `never`, strict config,
workspace-write sandbox, disabled web/network and stdin instruction, but live
activation remained off. No credential, broker, network mutation, merge, push
or release occurred. Capability advertisement, the provider-backed live
`N+1 >= 2` observation, independent final review and Issue `#21` closure remain
separate gates.

## 2026-07-26 — B1-I validation-contract correction

Status:
`structural-plus-semantic-contract-implemented; candidate-gates-pending; live-provider-off`.

An independent Critic found that the published supervisor JSON Schema accepted
safe-path escapes rejected by runtime and could not express the runtime's
ordering, cross-item uniqueness and relational timing rules. The PO approved
the honest combined contract: JSON Schema owns closed structural validation
and all representable constraints; the exported runtime validator owns
canonical semantic admission; public acceptance requires both.

The safe-path corpus first reproduced `../escape` as a failing Schema case.
The corrected Schema and runtime now use the same relative-path language for
leading/trailing separators, empty segments and `.`/`..` segments. A
machine-readable validation annotation is byte-equal to the exported runtime
contract. The focused corpus proves one positive combined admission,
structural-negative path cases and semantic-negative ordering, uniqueness and
heartbeat-relative timing cases without weakening runtime safety.

This entry records the corrected candidate scope before its fresh Full Verify,
Security and independent Re-Critic tail. It makes no gate-pass, provider,
credential, capability-advertisement, push, merge, release or Issue-closure
claim.

## 2026-07-26 — PO acceptance of B3-R research record; B4 design disposition

Status: `b3-r-po-accepted; b3-i-blocked; b4-provider-neutral-design-complete; b4-live-deferred`.

The Product Owner explicitly accepted B3-R in this conversation on 2026-07-26.
The accepted research candidate is commit
`e7095dfa70ffedd48d90add9b04ca711fa1447ce`, tree
`69d90e71279911bb5c3b2c86a23ce21199a50b5d`. Full Verify, Security and an
independent Critic passed for that exact candidate under the literal assurance
`functional-equivalent-read-only; OS isolation not asserted`.

The immutable original B3 decision record is retained unchanged with semantic
digest `9120650892a34b8e4ac51b369a16f523d5e52354146775f54fa00be2469b6f9d`.
Its append-only amendment is separately retained with digest
`e8779b1b92bed4281c43be9fefd2d65059796740ef658be5af6f91bef4523f01`.
This acceptance concerns B3-R research only; it does not activate B3-I.

B3-I remains blocked pending the post-V3 additive migration decision, the
B2/approved operator-local authentication boundary, appended exact
implementation paths and schemas, and frozen existing Claude/Codex regression
fixtures. No B3-I implementation, live provider or authentication action,
capability advertisement, issue closure, push, release or external mutation is
claimed.

B4's provider-neutral design is complete. Live B4 remains deferred and no
provider-specific capability, authentication, external mutation, issue
closure, push or release is activated or claimed.

## 2026-07-26 — B3-R acceptance evidence correction

Status: `b3-r-po-accepted; candidate-gates-unproven; b3-i-blocked; b4-provider-neutral-design-complete; b4-live-deferred`.

This append-only correction retains the Product Owner's B3-R research
acceptance and every B3-I/B4 boundary stated above. It withdraws only the
preceding assertion that Full Verify, Security and an independent Critic passed
for commit `e7095dfa70ffedd48d90add9b04ca711fa1447ce`, tree
`69d90e71279911bb5c3b2c86a23ce21199a50b5d`: the available Verify and Security
receipts bind a different candidate, and no persisted Critic receipt for this
candidate was supplied. This record therefore makes no B3-R candidate-bound
Verify, Security or Critic pass claim. Any such gate claim requires fresh,
exact-candidate evidence and an independent Critic receipt.

The original B3 decision semantic digest
`9120650892a34b8e4ac51b369a16f523d5e52354146775f54fa00be2469b6f9d` and its
append-only amendment semantic digest
`e8779b1b92bed4281c43be9fefd2d65059796740ef658be5af6f91bef4523f01` remain
unchanged. B3-I remains blocked, and B4 remains provider-neutral in design
with live activation deferred; this correction does not activate a provider,
authentication, external mutation, capability, issue closure, push or release.

## 2026-07-26 — Delivered v0.4.6 integration basis

Status: `nova-adapted-on-delivered-0.4.6`.

Nova is adapted on the isolated branch from the exact delivered `v0.4.6`
base commit `9d1b3dc108eb77629ace5b82002120f5539abd8d`; the technical
adaptation commit is `7f313c22d4311f7d5f0469131e3d0deae4364e11`.

The `0.4.x` release, installation, and pipeline-start line is fully closed;
there are no open `0.4.x` tasks. Fresh Full Verify, Security, and Critic
results for the resulting Nova integration candidate have not yet been
claimed. No push, merge, or release action occurred.

## 2026-07-26 — PO B4R scope activation for Issue #63

Status: `b4r-authorized; p0-m-release-blocker; implementation-in-progress`.

The Product Owner adds GitHub Issue `#63` to Sprint Nova as the seventeenth
approved Issue and activates the B4R correction slice on the delivered and
closed `v0.4.6` basis. The accepted scope is limited to complete V4 recovery
dispositions for `source_invalid` and `manifest_invalid`, digest-bound and
explicitly confirmed manifest-only repair, exact read-only lifecycle
diagnostics before readiness, hostile guard tests and process-level recovery
fixtures. The readiness guard remains fail-closed and arbitrary pre-ready
writes remain prohibited.

The broader onboarding, documentation and installer program from `#61`
remains separate Nightwing scope. This activation does not reopen a `0.4.x`
task and does not authorize push, merge, release, Issue closure or an external
Issue comment before an actual delivery merge commit and exact-candidate
Verify, Security and independent Critic evidence exist.

The sanctioned State writer recorded the exact PO approval at
`2026-07-26T21:55:10.612Z`, bound to PRD SHA-256
`381ae863abcde52612387f0c66a6d5a8e8af775979e82d982baf63884a219013`
and Spec SHA-256
`cacf045a9d849b52d0a7958bf2923a1d9f8f08e4f0efdc97de413a0f0e0634d5`.

## 2026-07-27 — B4R / Issue #63 implementation and candidate evidence

Status: `b4r-implemented-and-verified-on-isolated-feature-branch`.

The B4R correction is implemented on `feat/sprint-nova-codex-v046`, based on
the delivered and closed `v0.4.6` commit
`9d1b3dc108eb77629ace5b82002120f5539abd8d`. Its implementation candidate is
commit `ddd0d6ab89ba7579d28d4b4273feb7896b35f10c`, tree
`b34931aac6734f20e9656d8ab6ceff782f0abe74`. The candidate completes the
closed recovery actions for `source_invalid` and `manifest_invalid`, the
digest-bound, explicitly activated manifest-only repair, the narrowly
authorized read-only lifecycle diagnostics, and hostile/process-level
recovery coverage. It does not weaken the readiness guard or authorize
arbitrary pre-ready writes.

The generated Full Verify and Security evidence both bind that exact clean
candidate and exit `0`. A fresh independent Critic returned `PASS` with no
findings under the literal assurance
`functional-equivalent-read-only; OS isolation not asserted`. The durable
candidate summary is
[`evidence/nova-b/b4r/candidate-evidence.json`](evidence/nova-b/b4r/candidate-evidence.json).

PR `#64` remains Draft and `main` remains at delivered `v0.4.6`; no merge,
release or GitLab validation is claimed. The required Issue `#63` comment is
deferred until an actual delivery merge commit exists, when it must name that
merge commit and the relevant exact-candidate verification results. The
broader Nightwing `#61` onboarding scope remains excluded. This records the
B4R slice only; it does not close the Nova Epic or its remaining B2-I, B3-I,
live-B4, B5 and B6 acceptance obligations.

## 2026-07-27 — B4R durable gate-receipt audit amendment

Status: `b4r-exact-gate-receipts-retained; epic-remains-active`.

The original B4R candidate summary correctly named the implementation commit
and tree, but its `evidence/*-latest.json` references were operational pointers
rather than retained candidate bytes. They were therefore replaced only by the
append-only amendment
[`candidate-evidence-amendment-v1.json`](evidence/nova-b/b4r/candidate-evidence-amendment-v1.json),
which preserves the original record and retains fresh, exact-bound copies of
the Full Verify and Security receipts for
`ddd0d6ab89ba7579d28d4b4273feb7896b35f10c`, tree
`b34931aac6734f20e9656d8ab6ceff782f0abe74`.

The reproduction used a detached worktree outside the OS temporary root. Full
Verify completed all 178 steps with exit `0`; Security completed cleanly with
zero findings and exit `0`. The public readback observed Draft PR `#64` at
documentation head `ece3ae95cd7b358cd727ac5cc015938bbbf64305`, based on
unchanged `main` / `v0.4.6` commit
`9d1b3dc108eb77629ace5b82002120f5539abd8d`; its current CLA/DCO gate was
successful. That readback is delivery state, not a substitution of the B4R
code-candidate gates.

No merge, release, GitLab validation or Issue `#63` comment occurred. The
Epic remains active because B2-I, B3-I, live B4 and B5/B6 still require their
own authority and acceptance evidence.

## 2026-07-27 — Nova continuation and local-supervisor Critic corrections

Status: `critic-findings-corrected; fresh-candidate-evidence-pending`.

The current candidate corrects two Major findings from the independent Nova
Critic. A Codex `blocked` goal is now current typed-blocker evidence only when
its exact rendered objective and embedded generation match the requested
continuation. Resume and compact re-entry retain one long-running active goal
instead of repeatedly setting short successor goals; only a recorded named
PO-gate resolution may create a successor. A different blocked goal or active
user-controlled goal is never overwritten or misreported as current evidence.

The ADR-0047 local supervisor-state repair now rejects ownership, restrictive
mode and hard-link ambiguity for the machine-local root, records, journal and
lock. Such drift produces typed unavailable or recovery-required outcomes;
it cannot become create, noop or recover-owned success. Focused hostile tests
cover both corrections. This record makes no fresh Full Verify, Security,
Critic-pass, push, merge, release or Issue-closure claim; those are bound to
the corrected candidate only after their respective later gates.

## 2026-07-27 — Re-Critic scope and trust-boundary corrections

Status: `recritic-findings-corrected; fresh-candidate-evidence-pending`.

The correction tightens active Codex-goal evidence further: exact rendered
objective equality is required for both active and blocked observations. The
long-running goal is retained by the controller on ordinary resume/compact
without an adapter set call; a stale prefix-like goal cannot impersonate it.

The local supervisor-state trust boundary now accepts a writable sticky
ancestor only when owned by the current user or the local system, and the
threat model documents that rule together with owner, restrictive-mode and
single-hard-link requirements for root and direct state files. The B1-I exact
path manifest explicitly records its ADR-0047 repair exception. No new
provider, credential, execution, external, push, merge, release or closure
authority is introduced.

## 2026-07-27 — Amendment: strict sticky-ancestor disposition

This amendment supersedes only the preceding statement that a writable sticky
ancestor can be admitted based on ownership. The implemented ADR-0047 rule is
strictly fail-closed: every group- or world-writable ancestor, including a
sticky directory, is rejected because ownership does not remove the
directory-replacement race. All other statements in the preceding record
remain unchanged. This amendment introduces no provider, credential,
execution, external, push, merge, release or closure authority.

## 2026-07-27 — B5/B6 inventory and canonical-binding amendment

Status: `local-contract-corrected; native-evidence-pending`.

The PO authorized the B5/B6 product-capability inventory update and the
canonical acceptance bindings for Issues `#12`, `#14`, `#15`, `#18` and `#60`.
The registered `nova-macos-acceptance-tests` surface is explicitly a
synthetic, non-native contract check; it does not claim or replace native
Apple Silicon execution evidence.

`design/backlog-spec-bindings.json` now binds all 17 accepted Nova Issues
against its retained historical canonical backlog snapshot. The correction
also makes B-increment acceptance identifiers valid under the closed binding
contract and retains the explicit Alpha-only, no-direct-AGY disposition for
Issue `#15`.

This amendment is local design and verification plumbing only. It creates no
native macOS evidence, external broker or credential authority, live runner
execution, GitLab operation, Issue mutation, push, merge, release or sprint
closure claim.

## 2026-07-27 — B5/B6 support-boundary documentation

Status: `documentation-boundaries-recorded; native-evidence-pending`.

The PO explicitly authorized `docs/macos-support.md` and
`docs/runner-support.md` as public-user maintained documentation and authorized
their exact classification in `governance/observation-doc-governance.json`.
The documents record only the current boundary: Nova's macOS suite is
synthetic and non-native, native Apple Silicon closure remains separately
evidence-gated, and Antigravity remains documentation-only Alpha scope with no
direct AGY capability claim.

This is not native macOS evidence, a runner activation, an external operation,
an Issue mutation, a push, merge, release or sprint-closure claim.

## 2026-07-27 — B5 intake-scope reconciliation

Status: `17-issue-design-projection-corrected; freeze-pending`.

The B5 readiness audit found that `design/issue-intake.md` still rendered the
original 15-Issue observation even though the approved PRD, Spec, Acceptance
and canonical binding already include `#60` and `#63`. Its allocation table
now reflects the exact approved 17-Issue Nova portfolio. This is a
documentation reconciliation only; it does not create acceptance evidence,
close an Issue, alter a label, consume Cyborg input or satisfy candidate
freeze, native macOS, Critic or PO gates.

## 2026-07-27 — B5 independent-branch base reconciliation

Status: `nova-base-projection-corrected; freeze-pending`.

The B5 audit also found an obsolete `v0.4.1` statement in the Nova/Cyborg
collision matrix. The matrix now states only the established Nova fact:
Nova is based on delivered and closed `v0.4.6`. It makes no assertion about
Cyborg's base and retains the prohibition on consuming unpublished Cyborg
bytes. This correction does not merge, rebase, integrate, or otherwise read
from a sibling Sprint.

## 2026-07-27 — B5 Nova-only candidate freeze

Status: `candidate-frozen; external-native-gates-pending`.

The Nova-only candidate `8f765eeec163d12b4142eabc60ddcef384780354`
(`4ee64595d6b3e5915d664648be4557e0dfd185cb`) is frozen on
`feat/sprint-nova-codex-v046`, based on delivered and closed `v0.4.6`.
Its 17-Issue binding, green canonical backlog projection, exact Full Verify and
Security evidence are retained under `evidence/nova-b/`. No unpublished Cyborg
bytes are an input.

This is only the B5 candidate assembly record. B2-I, B3-I, live B4 and B6
remain separate gates; in particular this record does not claim native Apple
Silicon execution, an independent final Critic, PO close, Issue closure,
merge, push or release.

## 2026-07-27 — B5 freeze rebind after local contract completion

The preceding B5 freeze is superseded only as to its candidate identity. The
closed freeze/manifest contracts and their registered Full Verify suite are
implemented in candidate `f365a09ced53b82ea01afc40e75a555e71248a71`
(`d43e621484ec81b83ea59faef94ea7eae4d81db1`), whose Full Verify and Security
evidence are both exact and green. All B2-I, B3-I, live B4 and B6 boundaries
remain unchanged and pending.

## 2026-07-27 — B6 transfer boundary clarification

Status: `native-apple-silicon-transferred; retained-continuity-contracts`.

Issue #72 exclusively owns the native Apple-Silicon clean-host, native fixture,
native lifecycle and native candidate-evidence acceptance. Nova retains the
synthetic/non-native boundary plus B49-7's bounded keep-awake contract and
B49-8's exact-input/resume contract. Neither retained contract represents a
native macOS completion claim. The original #49 transfer comment remains a
required external readback before a narrowed Nova close disposition.

## 2026-07-27 — B6 native macOS scope transfer

Status: `native-macos-transferred-to-72; Nova-claim-non-native`.

The PO confirmed that no eligible Apple-Silicon device is currently available.
Nova therefore retains only the synthetic/non-native macOS contract boundary.
The complete native bootstrap, lifecycle, runner, Verify, Security, Critic and
PO-close acceptance transfers to Issue #72 with `sprint:NONE`. This record is
not native evidence and does not close Issue #49; its original Issue receives
the exact transfer comment before Nova's narrowed close disposition.

## 2026-07-27 — #49 transfer readback and B2/B4 local contract progress

Status: `transfer-comment-readback; local-contracts-implemented; live-gates-pending`.

The exact narrowed-scope transfer comment is published and read back on #49 as
`agent-pipe-shared` comment `5092523484`. It leaves #49 and #72 open and
unchanged in label/state. ADR-0049 records the B2-I constrained GitLab-CI
design and its threat model; no credential, job, provider mutation or pilot
invocation has occurred.

The B4 candidate adds only deterministic local contracts: a provider-neutral
Git fetch/new-branch state machine and a GitHub.com target/observation adapter,
alongside the existing GitLab adapter. The recorded GitLab test-target push
remains transport evidence only. This entry makes no live capability, merge,
release, migration, Issue closure, final Critic, PO-close or delivery claim.
