# Sentinel retirement and Nova-A re-verification — 2026-08-30

## PO retirement decision

The Product Owner directed that the three remaining Sentinel baseline records
are closed now. Sentinel has been closed for a long time; no historic
acceptance or release-administration activity is to be resumed under its
name. If a comparable need returns, it must be assessed and recorded as a
new backlog item with current scope and evidence.

This retires only these stale in-progress baseline records:

- `pipeline.afk-assumption-mode`
- `pipeline.ruleset-freshness-wsl-subsystem-absent`
- `pipeline.session-keep-awake`

It does not claim that their historic implementation proposals were completed
or that a Sentinel release was shipped.

## Nova-A re-verification

The current source candidate was re-run in an ordinary local process
environment, because the Codex session sandbox correctly prevents the
hermetic fixtures from spawning `node` and `git` and therefore cannot provide
test evidence for them.

At candidate `17e888271eaed3f0d54575d301663e060d4432c2`:

- `node plugins/pipeline-core/scripts/onboarding-init.test.mjs` passed 22/22.
  Its three-runner matrix covers both no-key and existing-key homes; the
  existing-key path imports and materializes the first anchor through the one
  returned public driver action, and the new-key path verifies durable pointer
  readback and first-anchor materialization.
- `node plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs` passed
  5/5. Its driver-only scenario takes Claude, Codex, and Antigravity from an
  empty folder to the first implementation file using returned actions only.
- `node plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` passed
  158/158. It includes the `project/critical-human-proof.json` materialization
  assertion, `SECGATE-1` (security-gate refusal then admission after the
  shipped scan), and `SECGATE-2` (the fixture's own installed-plugin
  `security-scan.mjs` resolves its plugin-shipped gitleaks configuration and
  completes a clean scan).

Consequently, the two Nova-A items below have their stated acceptance criteria
in current code and regression coverage:

- `pipeline.happy-path-key-onboarding-must-install-directly-as-critical-human-proof`
- `pipeline.seed-security-gate-on`

The remaining Nova-A blind-push item is deliberately not included: its own
TOFU driver measurement currently stops at the newly introduced bundled
design-question input and must be updated before it can attest the path to
the human signature.
