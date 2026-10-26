---
schema: pipeline.backlog-item.v1
id: pipeline.gate-strength-shell-refuses-admitted-reads
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P2
release: 0.7.0
source: "Elephant session on the D163 hotfix candidate 0.7.0+claude.20261026134650.9ce6c23, 2026-10-26"
done_when: manual
---

# GUARD-GATE-STRENGTH-SHELL refuses reads its own message admits

`guard-lifecycle-ready` refused two read-only commands that only name `pipeline.json`:
`rg -n "\"project\"|\"handover\"" pipeline.json` and
`find . -maxdepth 2 -name "pipeline.json" -not -path "./node_modules/*"`. Both refusals carry
`GUARD-GATE-STRENGTH-SHELL`, whose text says `cat`, `rg`, `head`, `sha256sum` and read-only `git`
forms on that path are admitted and that a refusal of such a shape is the classifier under-covering.
The first command is exactly such a shape. The guard matches the file name and refuses the read.

Effect: reading the calibration or locating it costs several attempts; the native Read tool works
once the exact path is known (`project/pipeline.json`).

Reproduction owed: a guard test case for the admitted `rg` and `find -name` read forms naming
`pipeline.json`. Fix direction: admit the read shapes the message lists, or narrow the message to
what is admitted. The guard is a kernel path, so the fix is a held patch.
