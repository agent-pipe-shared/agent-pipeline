---
schema: pipeline.backlog-item.v1
id: pipeline.sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "Critic round 4 (F-B) on the R7 design amendment, 2026-10-07; mechanism: Node child_process spawn with shell false on win32 resolves a bare name via libuv search_path(), which checks the current directory before PATH unless NoDefaultCurrentDirectoryInExePath is set. Not machine-verified in-session (the probe was refused by the guard)."
sprint: alfred
done_when: manual
---

# `sign-intent` spawns a bare `openssl`, which on Windows can be taken from the working directory

## Description

`plugins/pipeline-core/scripts/po-human-approval.mjs` `command()` (~line 794) spawns `openssl` by bare name with
`shell: false` and `stdio: "inherit"`; `sign-intent` passes it the PO's private-key path (~line 1267) and the
inherited terminal carries the passphrase prompt. On native Windows the bare-name lookup searches the current working
directory before PATH (unless the `NoDefaultCurrentDirectoryInExePath` environment variable is set). The documented
ceremony runs `sign-intent` from the repository root, the one location an agent or an upstream commit can place an
executable (SEC-10/SEC-11). A planted `openssl.exe`/`openssl.com` there would receive the key path and the passphrase.
A check on 2026-10-07 found no such file in this repository.

## Triggering situation

R7 design review (Spec §22.6), round 4. The same lookup affects every other bare-name spawn that carries secrets.

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs` (signing spawns), every bare-name `spawn`/`spawnSync` of a
security-relevant executable on win32, the ceremony hand-over text (working directory), Spec §22.6.

## Proposal

Interim (no code): hand-over text tells the PO to run `sign-intent` from a neutral directory outside every
repository. Fix: the signing spawn sets an explicit `cwd` outside every repository (for example the key directory)
and sets `NoDefaultCurrentDirectoryInExePath` in the child environment on win32, or resolves the executable by PATH
lookup that excludes the current directory before spawning; the readiness probe applies the same rule; a regression
test with a decoy `openssl` in the working directory that must never start.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
