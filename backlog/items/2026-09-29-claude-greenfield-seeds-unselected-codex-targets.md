---
schema: pipeline.backlog-item.v1
id: pipeline.claude-greenfield-seeds-unselected-codex-targets
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows greenfield review M3: a Claude-only project enabled Codex and generated .codex targets, then reported missing Codex runtime files."
sprint: alfred
done_when: manual
---

# Seed only the selected runner's native runtime

Fresh Claude, Codex and Antigravity projects enable the enrolling runner
only. Native Codex files and restart barrier are projected only after Codex
is explicitly enabled. Preserve the shared neutral/Claude authority tier and
support later multi-runner activation without repairing a false drift.
Verify across all three runners and supported host platforms.

## Triage

- **Agent work (2026-10-22):** the real-apply pin exists. `plugins/pipeline-core/lib/pins/claude-greenfield-seeds-unselected-codex-targets.test.mjs`
  cases (e) and (f) apply the portable seed and the runtime initialization for a Claude-only and an Antigravity-only project
  (no `.codex` file on disk, no Codex restart barrier, clean readback), then enable Codex in `pipeline.user.yaml`, plan and apply
  the runtime again (only the `.codex` targets are created, every earlier file stays byte-identical, readback is `noop`). The
  Windows host run and the Codex-enrolling native walk remain native-host work.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — Platform matrix across Claude, Codex, Antigravity on Windows, macOS and Linux hosts
  Linux is covered by the real-apply pin (cases e and f, 2026-10-22) and the Windows pin run is a WINDOWS-INTEROP-RUN an agent can do, but the matrix also needs macOS (no host here) and native Codex-enrolling and Antigravity walks with real installed hosts, which no agent may drive.
