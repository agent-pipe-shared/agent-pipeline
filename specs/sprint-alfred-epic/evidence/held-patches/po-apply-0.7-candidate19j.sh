#!/usr/bin/env bash
# Candidate 19j apply script (on top of the applied and stamped candidate 19i, stamp commit 4727c825f; each held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# PO decision 2026-11-06 on the four Windows findings of 19i. Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w242  the second stop of a simultaneous pair rebinds after a sibling's host commit and lands its own; a refused admission removes only
#         its own queue row, so a never-started slice blocks no successor (findings 2 and 4; protected files)
#   w243  an unindexed registry entry is named and repairable, the leftover paths are closed, and the repair lock wait survives a host
#         commit (findings 1 and 3; protected files)
#   w244  registration of the new test suites (Verify suites, inventory, case-completion)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19j.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w242-the-second-stop-of-a-simultaneous-pair-lands-its-host-commit-and-a-refused-admission-leaves-no-ready-row "fix(stop): the second stop of a simultaneous pair lands its host commit and a refused admission leaves no ready row"
step2 w243-an-unindexed-registry-entry-is-named-and-not-left-behind-and-the-lock-wait-survives-a-host-commit "fix(registry): an unindexed registry entry is named and not left behind, and the lock wait survives a host commit"
step2 w244-the-new-test-suites-of-candidate-19j-are-registered "test(verify): the new test suites of candidate 19j are registered"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19j (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -8
git status --short
