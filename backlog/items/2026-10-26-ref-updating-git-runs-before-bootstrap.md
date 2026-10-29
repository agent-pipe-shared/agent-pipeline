---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.ref-updating-git-runs-before-bootstrap
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "PO observation 2026-10-26 (WSL PC); PO decision Q18"
done_when: manual
---

# Ref-ändernde Git-Befehle laufen vor dem Pflicht-Bootstrap

Related existing criteria: AC-123 (bootstrap/re-entry), AC-181 (write-target classification).

## Evidence

The PO observed that in a new session whose first request is a fetch from
origin, `git fetch` ran before `pipeline-start`. The closed shell grammar admits
"git [read-only subcommands]" pre-ready, and fetch counts as read-only although it
writes remote-tracking refs and FETCH_HEAD and can move `refs/remotes/origin/HEAD`,
the base that worktree isolation provisions from.

## PO direction

"Eigentlich muss alles außer lesend vor dem bootstrap gesperrt sein oder nicht?"
— yes: before a ready bootstrap only genuinely read-only actions run.

## Acceptance

`git fetch`, `pull`, `remote update` and any other command that writes refs,
FETCH_HEAD or the object database are classified as writes. Before a ready
bootstrap every non-read-only action is refused, and the refusal names
`pipeline-start` as the typed recovery. After bootstrap their existing
admission is unchanged. Purely local read-only Git stays admitted pre-ready.
