#!/usr/bin/env bash
# Candidate 19k apply script (on top of the applied and stamped candidate 19j, stamp commit b2c0bdb15; each held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# PO decision 2026-11-06 ("okay bitte alle für den nächsten kandidaten beheben") on the 19j Windows and Linux findings.
# Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w245  a settled pending state without an owner operation never makes the registry unreadable (protected files)
#   w246  a stop lands its host commit after any disjoint advance of HEAD, including during its terminal prepare and while its sibling
#         still releases (protected files; applies on w245)
#   w247  refusals name the full working command, the hook names the current stop-failure record, failed natives are traced with a code
#         (protected files)
#   w248  heal moves a stale armed member aside without a human when no Goldfish runs, and move-aside admits what heal recommends
#         (protected files)
#   w249  registration of the new test suites (Verify suites, inventory, case-completion pin)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19k.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog specs)
# One held patch, one commit; the subject is given inline (GIT-03 trailers only). --no-verify is used here and nowhere else.
step2() {
  # Idempotent: a patch whose exact commit subject is already in the history of HEAD was applied by an earlier run of this script and is skipped.
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  local patch="$H/$1.patch"
  if [ -f "$H/$1.rebased.patch" ]; then patch="$H/$1.rebased.patch"; fi
  git apply "$patch"
  git add -A -- "${STAGE[@]}"
  git commit --no-verify -m "$2" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
  echo "applied $1"
}
# Order = the rehearsed chain order (each patch applies on the previous one).
step2 w245-a-settled-pending-state-without-an-owner-operation-never-makes-the-registry-unreadable "fix(registry): a settled pending state without an owner operation never makes the registry unreadable"
step2 w246-a-stop-lands-its-host-commit-after-any-disjoint-advance-of-head-including-during-its-terminal-prepare "fix(stop): a stop lands its host commit after any disjoint advance of HEAD, including during its terminal prepare"
step2 w247-refusals-name-the-full-working-command-and-the-current-stop-failure-and-failed-natives-are-named "fix(guidance): refusals name the full working command and the current stop-failure record, and failed natives are named"
step2 w248-heal-moves-a-stale-armed-member-aside-without-a-human-and-move-aside-admits-what-heal-recommends "fix(repair): heal moves a stale armed member aside without a human and move-aside admits what heal recommends"
step2 w249-the-new-test-suites-of-candidate-19k-are-registered "test(verify): the new test suites of candidate 19k are registered"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19k (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -8
git status --short
