# Critic result — WINACLFIX `b54b108d9` (2026-10-05)

Coordinator record of one independent Critic dispatch (fresh context, read-only, route `claude-opus-5-5`, route
pre-check passed; `functional-equivalent-read-only; OS isolation not asserted`). Spec:
[`../verify-2026-10-05/winacl-diagnosis.md`](../verify-2026-10-05/winacl-diagnosis.md).

**Partial review; verdict withheld** (the budget hook enforces 24+1 working calls; the dispatch stated 30).

- **F1 (major):** the spec asks for a Windows-gated test that runs the installer in a fresh temp repository and asserts
  that `<common>/agent-pipeline` assesses secure. The delivered test covers only `applyDecline` of pre-commit and
  commit-msg; no test exercises any `applyInstall`, in particular pre-push `applyInstall` (`pre-push-hook-install.mjs`
  ~717, ~729), which onboarding imports in-process (`lib/project-onboarding-v3.mjs` ~86-88). The pre-push suite passed
  44/44 before and after, so it cannot detect the defect. Fix dispatched: WINACLFIX-F.
- **F2 (minor):** a created segment whose hardening fails (assurance `unavailable`: no PowerShell, timeout, spawn
  failure) is not rolled back, so every retry assesses it as existing-insecure and refuses permanently; the refusal text
  names no directory, reason or remedy (`hardened-private-directory.mjs` ~58-69). Fix dispatched: WINACLFIX-F.
- **F3 (minor):** the evidence logs exist only under ignored `scratch/WINACLFIX-A2/`. Disposition: the Elephant copies
  the redacted logs into `../night-2026-10-05/` before the push.
- Cleared: fix shape (segment-wise 0o700 creation, harden-created / assess-existing, fail closed), all eight call sites,
  inheritance below the hardened state directory, commit-msg `atomicWrite` (no-op mkdir inside the state directory),
  symlink/junction rejection, anchor escape, trailers, no new dependencies, no weakened tests.
- Trajectory: consistent where examined; not verifiable in full (no full failing-name comparison; RED disclosed as
  absent).
- Dispatcher defects noted by the Critic: wrong path for the precedent file (it is
  `plugins/pipeline-core/lib/po-gate-profile-publisher.mjs`); a hunt list with diff-specific hints instead of the
  template's verbatim list; a budget above the enforced cap. Future Critic dispatches copy the template hunt list
  verbatim and state ≤24.
- Not reached: `CLAUDE.md`, ADR-0063, the precedent writer, the rendered hook's `recordLog` mkdir, the installer CLI
  error rendering.
