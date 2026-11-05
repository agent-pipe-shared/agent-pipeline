#!/usr/bin/env bash
# Candidate 19f apply script (on top of the applied and stamped candidate 19e, stamp commit d6286298e; each held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# Evidence: the first Windows measurement of the installed 19e (joint session with the Windows consumer); plan:
# specs/sprint-alfred-epic/plans/windows-authority-latency-plan-2026-11-04.md
#   w224  a refused command with no ARMED capability still paid 102 s and 189 PowerShell starts: w219's shortcut fired only for an empty capabilities
#         directory, but a used capability stays on disk as `consumed` (protected file, hence PO applies)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19f.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w224-a-consumption-answers-absent-when-no-capability-file-is-an-armed-one-for-the-tool "fix(guard): a consumption answers absent without the registry boundary when no capability file is an armed one for the tool"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19f (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -5
git status --short
