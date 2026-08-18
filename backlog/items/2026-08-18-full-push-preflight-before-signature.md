---
schema: pipeline.backlog-item.v1
id: pipeline.full-push-preflight-before-signature
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P0-4 (priority P0)"
---

# Push preflight checks are missing before signature (remote, threat model, verify path)

## Description

The remote, threat model, and verify path were only corrected after or
between signatures, rather than being validated beforehand. There is no
atomic preflight step that verifies all push-relevant preconditions
before the subject digest is generated and the signature command is
offered.

## Triggering situation

From a greenfield happy-path test run of pipeline version
0.6.0+codex.20260818162535.96cf805 in test repo Rune_Test1_Codex_060_52;
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo, Section 9, item P0-4.

## Affected artifact

push approval flow; plan-push coordinator (new); guard-push.mjs.

## Proposal

Introduce a plan-push coordinator that, before generating the subject
digest, atomically checks: a clean and unchanged HEAD; a safe, existing
remote name; remote URL and auth readback; target-ref shape and branch
non-existence; a versioned threat model; canonical candidate-bound verify
evidence; and a valid trust anchor with external key-directory binding.
Only a fully green plan may render the signature command.

Acceptance test: a new feature branch is published with exactly one
signature and one push attempt; a URL given instead of a remote name, or
an incorrect evidence path, is rejected before the passphrase prompt.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
