---
schema: pipeline.backlog-item.v1
id: pipeline.windows-greenfield-scratch-write-denied
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows 11 greenfield review B1: intake-required rejected native absolute Write and PowerShell scratch paths."
sprint: alfred
done_when: manual
---

# Admit physically contained Windows scratch writes during onboarding

Normalize native absolute and relative paths, drive-letter spelling and
physical root aliases before testing containment. Keep symlink, hardlink and
active-plugin exclusions. Prove the actual guard admits Claude Write and
PowerShell New-Item/Set-Content for scratch on Windows and rejects escapes.
Run the same tests on macOS and Linux and complete a fresh Windows intake.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — A native-Windows run of the pin (absolute-path Write and PowerShell New-Item/Set-Content admitted) and a fresh Windows intake are missing
  The guard pin can run natively via cmd.exe, but the clause also needs a fresh onboarding intake in a real Claude Windows session where Write and PowerShell scratch writes are admitted; that session cannot be agent-driven. The pin half alone is a WINDOWS-INTEROP-RUN on a /mnt/d clone.
