---
schema: pipeline.backlog-item.v1
id: pipeline.release-evidence-promotion-repeats-full-qualification
type: requirement
owner: pipeline
status: open
created: 2026-09-17
source: "PO release observation, 2026-09-17: the 0.6.2 release/push path generated equivalent evidence under multiple names; independently measured in the 0.6.2 release session against harness/scripts/verify.mjs, scripts/push-init.mjs and scripts/push-prepare.mjs."
sprint: nova-b
done_when: manual
---

# A release promotion repeats full qualification when only an evidence record changes

## Description

The 0.6.2 delivery path required a full release-mode Verify, then another
full push-mode Verify, plus a separately placed Security scan.  The
substantive source candidate had not changed between the checks; the later
commit existed only to carry reconciliation material.  Repeating independent
evidence for an actually changed tree is correct.  Repeating it because an
append-only evidence record changes the commit is not useful assurance.

## Triggering situation

The PO explicitly required that the next release stop producing the same
evidence three times under different names.  The release session confirmed
that `push-prepare.mjs` requires HEAD-bound push evidence, while Verify writes
the receipt at the primary worktree even when the candidate is verified in a
detached worktree.  The result was a long manual recovery path rather than a
single qualified promotion.

## Affected artifact

`harness/scripts/verify.mjs`, `plugins/pipeline-core/lib/verify-resume.mjs`,
`plugins/pipeline-core/scripts/push-init.mjs`, and
`plugins/pipeline-core/scripts/push-prepare.mjs`; ADR-0065 and the release
evidence model need an explicit decision before behaviour changes.

## Proposal

Design a versioned promotion envelope that can bind a substantive verified
candidate S to a later record-only commit R.  It must prove that R changes
only an allowlisted evidence/reconciliation path, preserve S's exact
commit/tree, Verify policy and suite receipts, and refuse any source or policy
change.  A declared stronger release receipt may satisfy an explicitly
included weaker push boundary only when the policy proves that inclusion;
reverse reuse is forbidden.  Security evidence must be emitted to the same
canonical evidence root as detached Verify, so the driver never asks for an
extra scan merely because the candidate worktree differs from the primary
checkout.

## Acceptance criteria

- A record-only S→R promotion reuses only receipts whose source, policy,
  environment and declared inputs remain bound to S; an altered source path,
  policy digest or non-allowlisted R path fails closed.
- The push/release driver reports one aggregated, actionable preflight result
  and asks the human only for the external-key signature.
- Tests prove that release-to-push reuse is permitted only where declared and
  that push-to-release reuse is refused.
- Detached-candidate Verify and Security both write durable evidence to the
  canonical primary evidence root without relying on manual second commands.

## Prepared decision sketch — not an implementation authorization

The following is a bounded design input for the required ADR/review.  It does
not alter any release or push gate, and it does not authorize reuse by itself.

### One source qualification, one record-only promotion

Let **S** be the substantive commit that was actually verified, and **R** a
later commit that only records/reconciles that qualification.  A promotion
envelope must contain all of the following immutable bindings:

- `source`: S's full commit and tree OIDs;
- `record`: R's full commit and tree OIDs;
- `sourceQualification`: Verify policy digest, selected-suite inventory,
  exact receipt digests, environment/classification digest and all declared
  verification inputs for S;
- `recordOnlyDelta`: the complete S..R name-status set and a digest of the
  before/after blobs, checked against a narrow, versioned allowlist of
  evidence/reconciliation paths;
- `modeInclusion`: the named policy rule which says that a stronger completed
  release mode contains a named weaker push requirement, plus the digest of
  that rule; and
- `securityEvidence`: canonical evidence-root references emitted by the same
  candidate driver, never an unbound shell-side afterthought.

The validator must recompute every binding from Git objects and the canonical
evidence root.  It must reject an untracked change, a source/policy/input or
environment mismatch, an unknown record-only path, absent or stale source
receipt, and any attempted R→S reversal.  In particular, a changed test
selection or a newly introduced policy rule always requires a new source
qualification; the envelope is not a waiver.

### Mode inclusion is a partial order, never a label comparison

The first implementation should expose a small policy table rather than infer
strength from names.  Only an explicit `release-satisfies-push` edge may
permit reuse, and only after it proves that the push requirements are a strict
subset of the bound release requirements for the same S.  No `push-satisfies-
release` edge exists.  A missing, malformed or changed table is fail-closed.

### Operator boundary and output

Read-only preflight may create a preview that lists the exact receipts to be
reused, any new work required, and the one remaining external action.  It may
not create a push-capable artifact.  The action-producing command consumes
that preview only after explicit operator intent and then asks the PO only for
the external-key signature.  The driver returns one aggregated result rather
than separate Verify, security and push readiness narratives.

### Minimum adversarial matrix

Before an implementation is proposed, pin at least these cases: a pure
allowlisted S→R evidence record; an extra source-file change; a changed Verify
policy; a receipt from a different S; a changed environment classification;
a release→push inclusion; a forbidden push→release inclusion; a missing
canonical Security record; and a detached-worktree source whose evidence is
written/read from the canonical root.  Each denial must name the failed
binding without printing protected evidence content.

## Triage

- **Decision:** accepted by the PO as Nova-B follow-up; detailed security
  design remains required before implementation.
- **Assignment (if accepted):** Nova B release-governance optimisation after
  the post-0.6.2 CI correction is externally green.
- **Date:** 2026-09-17
