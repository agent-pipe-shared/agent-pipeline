---
schema: pipeline.backlog-item.v1
id: pipeline.preflight-establishes-runner-prerequisites
type: defect
owner: pipeline
status: open
created: 2026-10-26
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

Kernel/protected paths are likely involved (preflight, onboarding); deliver as held patches where so.
