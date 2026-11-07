#!/usr/bin/env bash
# Candidate 20 apply script (on top of the applied and stamped candidate 19m, stamp commit ff20f4c80; the held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# Greenfield findings of the 19m runs (Codex, Antigravity, Claude on Windows), plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w252  G20-1 Codex onboarding repair deadlock, G20-2 apply-patch guard budget, G20-3 missing plugin path label, G20-4 stop-pair release race,
#         G20-5 greenfield architecture entry (materialize-architecture, signed adoption apply), G20-7 ADR checks in draft,
#         G20-9 canon pointer names the plugin copy, G20-10 CGB-REFERENCE names its path, G20-11 reader-review reports bound as retained results
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate20.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w252-codex-onboarding-repair-deadlock-and-apply-patch-budget "fix(greenfield): candidate 20 greenfield findings of the 19m runs (Codex deadlock and Critic path, greenfield architecture entry, release race, refusal texts)"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 20 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -4
git status --short
