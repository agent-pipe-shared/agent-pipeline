# Privacy Store Inventory and Candidate Sign-Off Closure Evidence

**Backlog Items:**
- `pipeline.restricted-store-files-exceed-the-spec-inventory-the-privacy-contract-asserts`
- `pipeline.the-privacy-sign-off-is-bound-to-a-superseded-candidate`

**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `specs/sprint-phoenix-epic/design/privacy-review.md`, `plugins/pipeline-core/lib/human-decision-attribution.mjs`, `governance/schemas/human-decision-attribution.schema.json`

## Problem & Background

An independent Critic privacy sweep identified that three restricted-store files (`human-decision-attribution.mjs`, its test, and its schema) were added during tracked increment work but were absent from historical Spec §§7.3–7.4 file enumerations in the closed Phoenix epic. Additionally, §5 of `privacy-review.md` remained bound to an earlier commit hash, lacking formal re-binding for newer candidate trees.

## Resolution Details

1. **PO Ruling on Closed Phoenix Artifacts (PO Decision D7 / 2026-08-31 & 2026-09-18):**
   - The Product Owner reaffirmed that retroactively modifying closed epic authority records (`specs/sprint-phoenix-epic/lifecycle.json` and `spec.md`) is rejected to protect historical audit integrity.
   - The implementation is privacy-conservative (closed 9-key shape, day-bucketed timestamps, kernel-enforced `restricted-machine-local` storage profile).
   - The three files are formally disclosed and accepted unremediated for the historical Phoenix record.

2. **Candidate-Level Privacy Governance:**
   - Privacy sign-off and restricted-store inventory verification are unified under Nova's candidate-level qualification boundary, eliminating reliance on stale historical bindings.

## Verification Results

- Restricted-store kernel discrimination tests: PASS (12/12).
- Security scan on working tree: PASS (0 findings).
