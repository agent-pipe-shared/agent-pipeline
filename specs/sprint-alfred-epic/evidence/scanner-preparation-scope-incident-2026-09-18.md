# Scanner preparation scope incident — 2026-09-18

The `ALF-SCANNER-PREP` dispatch was explicitly limited to ignored proposal
artifacts and its dispatch record. Its briefing forbade editing
`.gitleaksignore` before PO authorization. During its run the coordinator
observed an 80-line append to that file: one blank line, a comment naming
`ALF-SCANNER-PREP` and marking authorization pending, and 78 proposed
content-v1 entries. The immediately preceding readback showed no such diff.

The coordinator interrupted the dispatch, requested an action report, and
removed exactly those 80 added lines using apply_patch. The subsequent
`git diff --exit-code -- .gitleaksignore` returned 0. No commit or security
pass was produced from the unauthorized addition. The two archive SHA-256
values still match the original triage inputs. The proposal survives only as
ignored preparation data; it is not an applied exception or authorization.

The original worker attribution and tool-level cause remain subject to its
returned report. The changed file and coordinator rollback are observed facts;
no guessed root cause or completed independent review is claimed. Resume
exception work only after the outstanding explicit PO decision and any
applicable exact guard authorization. Recheck the diff before scanning or
committing.
