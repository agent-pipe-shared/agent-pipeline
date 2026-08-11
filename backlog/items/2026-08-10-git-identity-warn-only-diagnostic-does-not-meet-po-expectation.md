---
schema: pipeline.backlog-item.v1
id: pipeline.git-identity-warn-only-diagnostic-does-not-meet-po-expectation
type: defect
owner: pipeline
status: closed
created: 2026-08-10
closed_at: 2026-08-11
closure_repository: self
closure_commit: 018d523b707d8ae2b72a13e30ac8a2e013c1f1e0
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
source: "PO instruction during today's (2026-08-10) live greenfield test observation window: 'die lokale git identitäten name und mail sollten direkt im setup abgefragt und festgelegt werden und nicht erst immer beim ersten commit als fehler auftauchen.' This supersedes the closure rationale recorded in backlog/items/2026-08-09-fresh-repo-onboarding-never-asks-for-git-identity.md, which treated a warn-only diagnostic as having resolved the underlying gap."
---

# Git author identity should be asked and set at setup, not left as a warn-only diagnostic entry the agent can miss

## Description

`lib/project-onboarding-v3.mjs`'s `authorIdentityDiagnostics` (lines
3702-3720) was added on 2026-08-09 after both that day's greenfield runs lost
a PO turn to a first-commit `Author identity unknown` failure. It is
deliberately warn-only by design — the function's own doc comment states it
"deliberately does NOT set `user.name`/`user.email`" because a seed inventing
an identity would put a fabricated author name in permanent history, which
the comment judges worse than the stop it prevents.

The mechanism (confirmed by reading the code, line 3852): the diagnostic is
placed into the generic `diagnostics` array returned once by the `apply
--activate` onboarding step, the same field used throughout the file for
dozens of unrelated diagnostic kinds (unsafe root, symlink entries, manifest
drift, activation-required, etc.). It is not a blocking gate, not a question
the flow waits on, and not repeated later — it is one passive entry in a JSON
response that the calling agent has to notice and act on immediately, several
steps before the identity is actually needed at first-commit time. The
2026-08-09 closure treated this as resolving the gap ("closes the actual gap
described above: the PO no longer discovers a missing identity only at
first-commit time"); today's PO instruction states plainly that the failure
mode this warns about should not exist at all — identity should be asked and
set at setup, the same way the kickoff-goal/profile/language questions
already are.

## Triggering situation

PO instruction during the 2026-08-10 live-test observation window (two
greenfield kickoff tests, one Claude Code and one Codex, running
concurrently), given as one of several "mini optimization" items to file
alongside other live findings from the same session. Not directly confirmed
against either of today's two specific transcripts — the forensic review of
both (same session, separate reports) did not reach a first-commit step in
either captured transcript, and this test machine's global git config may
already resolve `user.name`/`user.email`, which would suppress the
diagnostic regardless of whether the underlying mechanism is adequate. This
item is filed on the PO's standing preference/prior-experience basis, not on
fresh transcript evidence — see `git-identity-onboarding-already-resolved.md`
(the 2026-08-09 closure evidence) for the prior confirmed occurrence this
mechanism was built to address.

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-v3.mjs`, `authorIdentityDiagnostics`
(lines 3702-3720) and its one call site at line 3852 inside the `apply
--activate` local-git-initialization path. Also
`backlog/items/2026-08-09-fresh-repo-onboarding-never-asks-for-git-identity.md`,
whose closure this item supersedes in spirit (that item stays closed per the
backlog's append-only-evidence rule; this is a fresh item, not a reopen).

## Proposal

No fix designed yet. Direction to explore: turn the warn-only diagnostic into
an actual setup-time question, at the same point `authorIdentityDiagnostics`
already runs (repository-creation time, inside `apply --activate`) — if
neither `user.name` nor `user.email` resolves (local or global), ask the PO
once for both and write them to **local** repo config (never global, never a
silently-fabricated identity — the existing code comment's concern about
inventing an author name in permanent history stays valid and should carry
over to whatever replaces the warn-only diagnostic). This mirrors how the PO
profile and kickoff language are already asked as blocking setup questions
rather than left as an informational field for the agent to notice and act on
several steps later.

## Triage (filled in by the Elephant of the next Pipeline session)
