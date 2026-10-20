---
schema: pipeline.backlog-item.v1
id: pipeline.the-guard-git-test-is-past-its-line-bound
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "architecture-boundary-check.mjs --root . after ceremony C13 (7a7ccceae); PO question Q15"
sprint: none
done_when: manual
---

# The guard-git test is past its accepted line bound

## Description

`architecture/boundary-policy.json` accepts `plugins/pipeline-core/hooks/guard-git.test.mjs` at
1648 lines, frozen when the check was adopted. The C13 test drop-in (the common-directory ledger
path, the AC-5 and SIG-8 unwritable-ledger fixtures) adds 9 lines, so the file has 1657 and is
the check's only violation. The file is protected (PB-CONTRACT-TESTS, PB-GUARD-HOOKS).

## Proposal

Split the suite into two files along its existing sections (for example the override and
signed-push cases into a sibling suite), register the sibling in Full Verify, and lower the
accepted bound to the new size. Both files change through one signed `cp` ceremony and a PO
terminal commit, as C13 did.
