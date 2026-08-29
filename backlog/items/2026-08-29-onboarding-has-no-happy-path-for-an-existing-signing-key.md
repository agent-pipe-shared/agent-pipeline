---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-has-no-happy-path-for-an-existing-signing-key
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: 7ac3ee73b7681403cf9b8ee3fceccca47edc3ab6
closure_evidence: plugins/pipeline-core/scripts/po-human-approval.test.mjs
created: 2026-08-29
sprint: nova
tracking: "NOW / Nova A -- happy-path blocker, PO's own words: 'einen bestehenden Key zu nutzen ist auch zu umständlich im happy pfad da eine merkwürdige reperatur nötig ist und der driver hier nicht hilft und die agents kreise drehen'."
source: "PO inline observation (2026-08-29, 3-runner greenfield test synthesis) plus the Codex and Claude/Windows retrospectives' independent trust-anchor-bootstrap-circularity findings (see 2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md and 2026-08-09-critical-human-proof-not-materialized-for-signature-mode.md, both closed 2026-08-29 -- this item covers a DIFFERENT, narrower gap those did not: the missing THIRD onboarding option)."
---

# Signature-mode onboarding offers only "install new key" or "skip" -- no option to point at an already-existing key

## What happens

When onboarding reaches signature-mode key setup, it offers exactly two choices: install a
new key, or skip. There is no third option to supply the path to an already-existing key and
have onboarding register/use it directly. When the PO already has a signing key on the
machine, the current path requires an odd, undocumented repair afterward and the driver does
not help -- agents visibly loop trying to reconcile the resulting state.

This is distinct from `2026-08-18-po-key-trust-anchor-onboarding.md` (closed), which covers
onboarding correctly DETECTING and surfacing an already-REGISTERED trust anchor. This item is
about the onboarding FLOW itself never offering to register an existing, not-yet-known key
file in the first place.

## Acceptance criteria

- Signature-mode key setup offers a third option: "use an existing key" with a path prompt.
- Supplying a valid existing key's path registers it as the trust anchor without any further
  manual repair step or agent loop.
- A test drives this path against a fresh onboarding fixture with a pre-existing key file on
  disk and confirms zero repair-command detours.

## Closed, 2026-08-29 (NVA-CF-KEYBOOTSTRAP)

`po-human-approval.mjs setup --existing-key <path>` (commit `7ac3ee73`)
imports and registers a pre-existing key file as the trust anchor in one
call: derives+validates the public half via the same openssl pkey step
setup's own recovery branch already uses, refuses cleanly if the directory
already carries key material or the named path does not exist, and writes
an immediately-usable authority record with zero further repair commands.
All 3 acceptance criteria satisfied. Independently re-verified by the
Elephant (not just the dispatch's own report): `node --test
plugins/pipeline-core/scripts/po-human-approval.test.mjs` -> 106/106 pass,
including the 3 new tests this dispatch added.

## Triage

- **Decision:** accepted, Nova A (happy-path blocker per PO's own framing)
- **Rationale:** PO explicitly named this as blocking the happy path during the 2026-08-29
  greenfield-report review; distinct from the already-closed detection-side items.
- **Date:** 2026-08-29
