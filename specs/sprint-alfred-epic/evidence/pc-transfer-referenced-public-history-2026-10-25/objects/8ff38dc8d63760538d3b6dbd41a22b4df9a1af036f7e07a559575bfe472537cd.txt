---
schema: pipeline.backlog-item.v1
id: pipeline.windows-pre-push-installer-fsync-and-relative-action
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows greenfield review H1: fsync on a read-only descriptor returned EPERM; the offered installer argv was relative to the plugin rather than the consumer repository."
sprint: alfred
done_when: manual
---

# Install the push backstop from a Windows consumer repository

Use a Windows-compatible durable file-sync descriptor and a typed refusal
when durability is unavailable. Return an absolute installer executable and
script path with explicit consumer cwd. Prove install, marker/readback,
blocking push behavior and removal on native Windows; keep macOS/Linux smoke
coverage and leave foreign hooks untouched.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — A native-Windows run proving install, marker readback, blocking push and removal, including the read-only descriptor EPERM assertion, is missing
  Run the pre-push installer pin natively via cmd.exe with Git for Windows on a /mnt/d clone: install, marker readback, a blocking push to a local bare remote, removal, and the fsync read-only descriptor case. Single suite, expected minutes.
