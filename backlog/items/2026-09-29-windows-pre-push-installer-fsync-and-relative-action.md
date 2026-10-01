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
