# K98-REFUSAL-TEXTS-AND-PREFLIGHT notes (partial; implementation incomplete in clone; Critic read, operator commit of protected parts and PO acceptance pending)

Built: A (both halves), D(2), E. NOT built: B, C, D(1) (budget at 80%, see "Open").

## Commits in clone scratch/clones/k98 (base main, trailers AI-Assisted + Dispatch K98 goldfish)
- cf95ea4cf fix(pipeline-owned): CPO-FOREIGN-CHANGES for project/pipeline-state.json now names the push-prepare fold, "do not commit by hand", and `Dispatch: stage-0 (elephant)` + `AI-Assisted: true` as the agent form. New commit-pipeline-owned.test.mjs (2 cases).
  RED (same test against unchanged source): 1 pass / 1 fail (push-prepare text missing). GREEN: 2/2.
- 76816f627 fix(security): global `[allowlist] paths = ['''.*/scratch/clones/.*''']` in `.gitleaks.toml` and the plugin mirror `config/security/gitleaks-default.toml`; new gitleaks-scratch-clones-exclusion.test.mjs (2 cases).
  RED (unedited configs): 0/2. GREEN 2/2. Existing `gitleaks.test.mjs` 23/23 pass after the edit (includes the real-binary case that parses the edited config). Real scan not run; security-scan.test.mjs not run (budget).
  Caveats: gitleaks reports absolute paths, so a scan whose own root lies under scratch/clones/ is skipped in full (stated in the config comment). The scan source is already a detached candidate worktree (tracked files only), so the exclusion matters only where the scan reads a working tree; I could not verify that gitleaks skips the directory walk (vs. only suppressing findings) without a real scan.

## Protected diff (scratch/agent-out/K98-REFUSAL-TEXTS-AND-PREFLIGHT-k98b-protected.diff, from clone k98b, 80 lines)
Applies after the bundle (`git apply --check` clean against the main checkout; the touched files are not in the bundle). Files:
- lib/commit-message-policy.mjs (kernel): GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED detail now ends "...The admitted Elephant form for a bounded commit of your own is `Dispatch: stage-0 (elephant)` with `AI-Assisted: true`". Code/verdict unchanged. New lib/commit-message-policy-administrative-refusal.test.mjs: RED on unchanged source 0/1, GREEN 1/1.
- scripts/onboarding-init.mjs (kernel): TRUST-ANCHOR-MACHINE-PLANE-UNAVAILABLE result gains an additive `reason` naming the unusable home directory value (or that HOME/USERPROFILE/override are all unset) and the repair. New scripts/onboarding-init-machine-plane-reason.test.mjs: RED 0/1 (code assertions passed, `reason` undefined), GREEN 1/1.
- Existing scripts/onboarding-init.test.mjs started in k98b: still running at report time, all results seen green, not complete. Not counted.
Clone k98b still carries these edits (working tree, new files intent-added).

## Unprotected diff
scratch/agent-out/K98-REFUSAL-TEXTS-AND-PREFLIGHT-k98-unprotected.diff = both clone commits (cf95ea4cf, 76816f627).

## Open (not built)
- B (MP-04 readback in preflight): finding: a sanctioned readback already exists, scripts/bootstrap-env-check.mjs (`pipeline.bootstrap-env-check.v1`, status clear/blocked, never prints the value), and harness/session-bootstrap.md line 135 already uses it. Remaining decision: fold `subagentModelEnv` into pipeline-start-preflight.mjs (kernel, 2355 lines, payload budget in kernel lib/bootstrap-payload-budget.mjs, schema pin test). Design reading to confirm: add after the measured payload (like the model-role readback, so the budget is unchanged) vs inside it.
- C (installer refreshes hook snapshots): no installer applies hooks. `find` shows only plugins/pipeline-core/install-agy.mjs (Antigravity marketplace/registry installer, no repo root) and per-repo installers pre-commit/commit-msg/pre-push-hook-install.mjs. refresh-mandatory-hooks.mjs is `--root <repo>`-scoped. Needs a design decision which apply (install-agy --refresh? onboarding apply? plugin update path) should call refreshMandatoryHooks(root) and for which root.
- D(1) chat-mode approve-push refusal with empty `inspect`: not located. pipeline-state.mjs line ~12988 already prints `session-authority-repair.mjs inspect --root <dir>`; the empty `inspect` is likely in session-authority-repair output or a refusal built in lib/ (not found with rg on approve-push in the budget).

## Ratchet / checks
Not measured: architecture-boundary-check, check-consumer-safe-paths.test.mjs (run before commit by the pre-commit hook only). No line-bound violation observed.

## Proposed protected commit message
fix(refusals): name the working form in the GIT-03 administrative and machine-plane refusals

PO decision 2026-10-23 (tiles rows 7/7 and 1/2). Message-only: codes and verdicts unchanged; two RED-first cases.

AI-Assisted: true
Dispatch: K98-REFUSAL-TEXTS-AND-PREFLIGHT (goldfish)
