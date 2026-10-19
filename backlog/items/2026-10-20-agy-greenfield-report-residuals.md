---
schema: pipeline.backlog-item.v1
id: pipeline.agy-greenfield-report-residuals
type: improvement
owner: pipeline
status: open
created: 2026-10-20
source: "PO report scratch/pipeline-analyse-greenfield_agy_20261020.md (a greenfield run on Antigravity, 2026-10-17/18, manifest version 0.6.2); checked read-only against the 0.7.0 candidate on 2026-10-20; deferred by the PO (not in this candidate)"
sprint: none
done_when: manual
---

# Greenfield report on Antigravity: findings still present in 0.7.0

The PO deferred this report: the run may not have used the updated plugin. A read-only check
of the 0.7.0 code sorted its findings.

**Already fixed in 0.7.0:**
- F-01, the P0 materialize-architecture deadlock. The refusal is now
  `ARCHITECTURE-MATERIALIZATION-REQUIRED`, and its `materialize-architecture` next action passes
  the devplan lane (`lib/guard/devplan-shell-lane.mjs`, `lib/guard/sanctioned-args-scripts.mjs`).
  This is pinned by `lib/pins/devplan-lane-admits-the-producer-materialize-step.test.mjs`.
- F-03, signature UX:
  - `po-human-approval.mjs` guards its CLI with `isDirectInvocation`.
  - `sign-intent --request` resolves the design request with no HGO fallback text, and it writes
    the proof and the signer next to the request. AC-264 pins this.

**Still present, for later:**
- **T3, a self-declared Critic skip.** `rigorLevel`, `riskClass` and `riskFlag` are checked
  for shape only (`lib/critic-skip-decision.mjs`). A record that declares rigor 0/1, risk low
  and no risk flag lands on a skip row (T5 or T0). Path heuristics check only the
  architecture, guardrail and security flags. Close fails only for records that declared
  "required" themselves, and skips the check when there is no `slice-queue.json`
  (`scripts/close-coordinator.mjs`). `dispatch-briefing.mjs` itself always writes T1.
  Fix: derive rigor and risk on the host side from the recorded feature state. Close then
  refuses code-bearing records with no Critic at rigor 2 or above, and a missing queue fails
  closed while dispatch records exist.
- **SEC, no security scan in a local-only project.** Onboarding seeds
  `gates.security: blocking` with `repositoryMode: local-only`. Only push and publication close
  read security evidence, and `check-close-security-completeness.mjs` exists but is not seeded
  into consumer projects. Fix: run that check at feature close when the security gate is not
  `off`.
- **F-02, `node` missing from the runner sandbox (exit 127).** The preflight never probes
  whether `node` runs in the runner's sandbox, and it does not flag version-manager prefixes
  (fnm, nvm, volta).
- **F-05, parallel `write_to_file` failures in AGY subagents.** The cause is not in the AGY
  pretool guard's code and needs a live run. The Goldfish template does not forbid parallel
  writes on AGY.
- **Residual of F-01:** the devplan lane admits `perl <script>`
  (`opaqueScriptExecutionCandidate` covers node, python and shell only).
