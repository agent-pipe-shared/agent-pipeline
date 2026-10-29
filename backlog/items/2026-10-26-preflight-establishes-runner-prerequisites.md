---
schema: pipeline.backlog-item.v1
id: pipeline.preflight-establishes-runner-prerequisites
type: defect
owner: pipeline
status: open
created: 2026-10-26
sprint: alfred
priority: P1
release: 0.7.0
source: "PO decision D164 (3), 2026-10-26, after the hotfix install on the WSL PC"
done_when: manual
---

# The preflight establishes runner prerequisites with the user instead of only reporting them

D164 (3): "lass uns das direkt fixen hier und für windows & bitte in der pipeline so härten, dass der
preflight das mit dem user gemeinsam sicherstellt, weil sonst wird die pipeline nicht richtig laufen!
selbes für die anderen vorraussetzungen wie semgreb, osv etc."

## Observed on the WSL PC (2026-10-26, plugin 0.7.0+claude.20261026134650.9ce6c23)

- `pipeline-start-preflight` reports `nodeSandbox.status: version-manager-path`,
  `NODE-SANDBOX-UNREACHABLE` and a prose remedy, non-gating. Every `node` on PATH is an fnm
  multishell path or `~/.local/bin/node`; `/usr/bin/node` and `/usr/local/bin/node` are absent.
- `lib/node-sandbox-probe.mjs` judges only `process.execPath`, the node that runs the preflight. It
  cannot see whether a stable node the runner daemon would use exists; after a system node is
  installed it still reports `version-manager-path` while the interactive shell resolves fnm first.
- `semgrep` 1.170.0 resolves under `~/.local/bin`; `osv-scanner` and `gitleaks` are absent.
- The generated manifest chapter says a machine missing gitleaks/semgrep/osv-scanner/license-check
  "still reaches a CLEAN, non-blocking verdict: each scanner reports SKIPPED"
  (`lib/project-onboarding-v3.mjs` ~1241, `deriveReportStatus()` in `security-scan.mjs`). A missing
  scanner therefore weakens the security gate silently.

## Wanted

1. One prerequisite readback in the preflight with a typed status per prerequisite: stable node
   reachable by the runner (Linux/WSL and native Windows), semgrep, osv-scanner, gitleaks and every
   other scanner a configured gate needs, each with its version against a minimum.
2. A missing or unreachable prerequisite is not ready. The preflight returns a typed, attended
   `collect-input`/host action per platform (exact install command, or the user's confirmation that
   the gate is deliberately off) and re-reads after the user ran it, the same pattern as the hook
   refresh action. No silent SKIPPED that counts as clean.
3. The node probe distinguishes "the preflight runs under a version-manager node" from "no stable node
   exists for the runner" and checks the stable candidates (`/usr/bin/node`, `/usr/local/bin/node`,
   Program Files on Windows) directly.
4. Never installs anything itself and never uses sudo; the user runs the returned command.

## Design direction (PO, 2026-10-26, D164 addendum)

"das muss künftig plattform neutral dann auch für windows, macOs und Linux funktionieren aber ohne harte
versionsvorgaben etc. also so das auch nach monaten die agenten das je plattform korrekt installieren und am
besten vllt den besten weg selber definieren"

- The Pipeline owns WHAT, not HOW: a closed capability contract per prerequisite (tool name, the probe that
  proves it works for the gate, e.g. it runs, reports a parseable version, accepts the flags the gate uses,
  and is reachable from the runner's own process). No pinned versions or hard-coded install commands; a
  minimum is stated only where a measured incompatibility exists, and then as a capability probe.
- HOW is decided at runtime by the agent for the actual platform (Windows, macOS, Linux/WSL): it detects the
  available package managers and official installers (for example winget/scoop/choco, brew, apt/dnf/pacman,
  the tool's own release binaries), proposes the best current route with its source, and the user runs it.
- Success is never inferred from the command: the preflight re-runs the capability probe and only then
  reports ready. A refused or failed install stays not ready with the probe's own diagnostic.
- Only official sources; the proposal names the source so the user can judge it.

Kernel/protected paths are likely involved (preflight, onboarding); deliver as held patches where so.
