---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-owned-files-dirty-the-push-tree
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "PO report scratch/pipeline-feedback-03.md, findings PF-31, PF-36 and PF-40; PO decision D56 (2)"
sprint: none
done_when: manual
---

# Pipeline-owned files dirty the tree a push needs clean

## Description

The Pipeline writes its own files into the working tree, and its own clean-tree checks then
refuse:

- **PF-31:** the first item dispatch creates an untracked `specs/<feature>/slice-queue.json`;
  `push-prepare` then fails `working-tree-clean`, and `repair-map.mjs` names no route.
- **PF-36:** `dispatch-briefing.mjs binding`, run between `push-init` (`signature-required`)
  and the signature, writes the queue into the main tree; `authorize-critical` then fails
  `PO-HUMAN-APPROVAL-FAILED: repository must be clean`. It cost a PO signature and a second
  Verify, security scan and `push-init`.
- **PF-40:** a signed push writes an untracked `project/guard-override.log.jsonl`; the next
  push preparation fails the clean-tree check.

## Acceptance (D56 (2))

- The clean-tree checks stay strict; a push candidate still binds every file.
- A clean-tree refusal recognizes Pipeline-owned files (the governed slice queue, the
  override log) and names a sanctioned command that commits exactly those files with the
  required trailers, instead of a generic "repository must be clean".
- The guard-override log is written under `.git/agent-pipeline/` and no longer into the
  tracked tree. A log already in the tree is still read.
- Tests cover a queue written after `push-init` and a log after a signed push.

## Implementation state (2026-10-20)

Implementation complete, PO acceptance pending (the PO's local test of the next candidate). The
refusals name `scripts/commit-pipeline-owned.mjs` (`--agent` or `--human`), and since ceremony C13
(`7a7ccceae`, doc follow-up `8b23eecce`) `hooks/guard-git.mjs` writes the override ledger through
`lib/guard-override-ledger.mjs` under the common Git directory, still reading a tree ledger an older
build left. The item stays open until the PO accepts it.
