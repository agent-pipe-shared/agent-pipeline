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
