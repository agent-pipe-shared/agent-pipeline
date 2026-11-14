fix(native-host): name a changed dependency checker instead of a registry repair

Whole-chain proof for K-37 (NGHS72): LEFT integrated, a later dispatch
whose own scope holds LEFT's check file edits it, and its stop reaches
authored-commit-recorded. With the integrated scan reading the working
tree again, the same case fails with the live Glossover result
(NGHF-COMMIT-EXCEPTION, item-check-source-not-candidate), so the pin
proves the stop route, not only the scan.

The launch readiness read stays strict (75f317b83), so a dependent
launched while that edit is in flight is refused. That refusal said
"dependency held" with the inspect/heal/move-aside registry route, which
is wrong for a file change. It now has its own code,
NGHS-ITEM-INTEGRATION-CHECKER-CHANGED, whose repair names git status and
waiting for the editing dispatch's host commit; slice-queue next
returns the same code and repair (NGHS12, C27 case). The PF-49 comment
on the in-boundary re-check now says it reads the commit.

AI-Assisted: true
Dispatch: stage-0 (elephant)
