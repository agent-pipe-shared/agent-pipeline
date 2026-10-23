---
schema: pipeline.backlog-item.v1
id: pipeline.capture-evidence-does-not-normalize-windows-npm-launch
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-23
source: "Reconstructed 2026-10-23 with explicit PO permission for exactly this file (decision tile batch 11). The original item file has no public text; this text is derived 1:1 from the acceptance points P1-P3 in the header of plugins/pipeline-core/lib/pins/capture-evidence-does-not-normalize-windows-npm-launch.test.mjs (AC-122, ALF-C-P7-06), whose reconstruction the PO confirmed on 2026-10-23."
sprint: none
done_when: manual
---

# Capture evidence does not normalize the Windows npm launch (reconstructed)

> Reconstructed item. The original text was not preserved publicly. Only the
> acceptance points below are known, taken from the regression pin header. Nothing
> else of the original description is claimed here.

## Description

The capture-evidence script launches evidence commands. On Windows an `npm`
command is a shim that cannot be spawned directly; the launch must go through
the platform command launcher, and a launch that cannot be normalized must fail
in a typed way before any child exists.

## Acceptance

- (P1) On Windows an npm command shim (`npm`, `npm.cmd`, or an explicit `npm.cmd` path) is normalized to the platform launcher (`cmd.exe /d /s /v:off /c`) and runs through the real spawn result.
- (P2) On a non-Windows host, or for a non-shim command, launch behaviour is unchanged.
- (P3) An un-normalizable launch is a typed `CAPTURE-EVIDENCE-WINDOWS-*` failure raised before any child exists, never a fabricated exit code; the real child status passes through unchanged.

## Open work

- The native win32 cmd/npm launch cases are typed skips on Linux and are an open acceptance run (owner native-host, a single-file canary under D133).

Source: pin header AC-122 / ALF-C-P7-06 (reconstructed); PO confirmation 2026-10-23.
