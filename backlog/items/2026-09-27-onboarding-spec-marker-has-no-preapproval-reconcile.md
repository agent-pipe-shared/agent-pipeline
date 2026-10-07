---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-spec-marker-has-no-preapproval-reconcile
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-27
source: "Claude/Windows greenfield review F-04, 2026-09-27; consumer reports blocked ad-hoc hashing, source confirms marker requirement and a separate post-approval rebind helper."
sprint: alfred
done_when: manual
---

# Onboarding cannot reconcile its Spec digest marker before approval

## Description

The generated PRD contains a `technical-spec-sha256` marker. Editing the Spec
during required design work makes it stale. The Claude consumer reports that
ad-hoc `node -e` hashing was refused in `bootstrap-binding-required`, with no
returned marker-reconciliation action. The existing PO-authority rebind code
can replace a marker under an already valid approval; it does not establish a
documented preapproval onboarding repair path.

## Affected artifact

Onboarding design generation, PRD/Spec marker contract,
`project-onboarding-v3.mjs`, and lifecycle admission.

## Proposal

Return a typed digest-bound action that computes the current Spec hash and
updates only the PRD marker before PO approval, then reads both documents back.
Keep the substantive PRD/Spec review separate from this mechanical repair.

## Acceptance

- Editing a generated Spec yields an executable, phase-admitted marker repair.
- The repair changes only the marker, binds the observed Spec bytes, and has
  a clear stale-plan refusal on concurrent edits.
- A fresh Claude/Windows run reaches PO review with matching marker and Spec.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** Fix site `plugins/pipeline-core/lib/project-onboarding-v3.mjs:3564`
  (`intake-spec-marker-apply`); regression test
  `project-onboarding-v3.test.mjs:9287`.
- **Assignment:** n/a
- **Date:** 2026-10-07

## Prepared repair core (2026-09-28)

`scratch/onboarding-spec-marker-core.patch` prepares a read-only plan and
mechanical apply beside bootstrap acknowledgement. Paths come only from the
validated generated checkpoint. The plan binds absent-pristine continuity,
calibration, checkpoint revision/digest, stable single-link PRD/Spec identities,
both document hashes and the exact PRD postimage. Acknowledged or bound authority
is refused. Apply reobserves under existing writer locks, atomically replaces
only the marker, preserves the Spec and checkpoint, and reads documents back.
Drift after publication reports a committed error, never a success receipt.

Eight proposed source-fixture cases pass: byte-exact marker-only repair and
current-state no-op, stale PRD/Spec, acknowledged/bound refusal, malformed
markers/UTF-8, injected prepublication edit, committed readback drift,
symlink/hardlink aliases and BOM/CRLF/Unicode preservation. Fixture acknowledgement
uses the existing sanctioned writer; an initial literal acknowledgement-marker
fixture was refused by the installed guard and was not applied or bypassed.
The proposed test corpus and Verify policy both declare 295 cases.

This core is not yet an executable returned onboarding route: CLI metadata and
dispatch, producer ordering before PO acknowledgement, closed argv admission
and phase/host replay remain to be prepared. Existing acknowledgement and
generation writers do not all share one document lock; final CAS/readback checks
are not a universal exclusion of concurrent filesystem mutation. Canonical
integration, full tests and actual consumer readback remain pending. Current
live-host scope is Codex; no Claude/Windows acceptance is claimed.

## Prepared Codex route and focused evidence (2026-09-28)

The next preparation connects the core to registered plan/apply CLI commands,
their closed shared argv shape, and the generated-checkpoint coordinator before
the PO acknowledgement. A stale marker returns the exact digest-bound repair;
unavailable or malformed observations return no acknowledgement action. After
repair, the existing design and human-approval checks continue. The shared B
slice supplies the closed intent validator; this route permits only that enum.

Ten proposed core/CLI cases and two Codex coordinator fixtures pass. They prove
actual producer-to-guard admission in bootstrap-binding phase, plan/apply and
no-op exit-code parity, duplicate/unknown intent refusal, read-only inspection,
and transition from changed Spec through repair to the regular chat-policy
acknowledgement action. Testing exposed and corrected the omitted intent shape
and successful apply returning exit 1. The two fixture cases do not perform
real PO acknowledgement or change this repository's lifecycle.

Hashes and terminal results are recorded in
`scratch/spec-marker-route-preparation-evidence.json`. The prepared aggregate
contains 55 files, 47 syntax-valid JavaScript files and 297 registered continuity
cases; Git dry application passes. This supersedes the route-preparation gaps
above. Canonical integration, full corpus, fresh real Codex onboarding and
release qualification remain open. No new signature was requested.

## Complete prepared continuity corpus (2026-09-28)

The exact selected proposed modules now pass the complete 297-case continuity
corpus. The actual regular case-completion writer emitted its FD3 stream;
the canonical parser confirms 297 declared, 297 disposed, 297 passed, zero
failures/skips/todos and no completion error. Execution exits 0 in 43,035 ms
with empty stderr. This closes the prepared full-corpus evidence gap above.

`scratch/proposed-onboarding-continuity.evidence.json` retains the command,
module hashes, raw-output hashes and completion attestation. It binds aggregate
`da45198b2fabf5a5ab36defc1518865ca9cfde8e86a657029d865fa70de69337`
and assembly source commit `35d2a7d2e6c9d60bf272a9ac38db817759b8e107`.
The loader checks canonical preimages and proposed bytes; unselected imports
and subprocesses remain canonical. This is neither canonical Full Verify nor
a release stamp. Source integration and fresh consumer acceptance remain open.
