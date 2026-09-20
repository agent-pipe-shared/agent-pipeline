# Tracked Evidence in Gitignored Directory Closure Evidence

**Backlog Item:** `pipeline.fourteen-evidence-files-are-tracked-inside-a-gitignored-directory`
**Date:** 2026-09-18
**Author:** Antigravity (Elephant orchestrator)
**Integrated in Commit:** `f8937f15a74a5a2a697fa325354c2958d574b9af`

## Verification

1. **Resolution:**
   - Untracked the seven remaining historical test capture files (`evidence/NVA-B-XPORTFIX-*.txt`) from the Git index via `git rm --cached` in commit `f8937f15a74a5a2a697fa325354c2958d574b9af`.
   - Confirmed that only `dispatch-record-*.json` files remain tracked under root `evidence/`.
   - Verified that these dispatch records constitute the explicit ADR-0063 carve-out for ordinary commit provenance and backlog `closure_evidence` citations (`NVA-BL-24`, `-25`, `-28`, `-32`).
   
2. **Backlog & Dispatch Verification:**
   - `node plugins/pipeline-core/scripts/check-backlog-state.mjs`: exit 0 (valid).
   - `node plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs`: 54/54 passed.

All requirements satisfied. Item closed.
