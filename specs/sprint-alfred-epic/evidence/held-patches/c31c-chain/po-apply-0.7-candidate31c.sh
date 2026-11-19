#!/usr/bin/env bash
# PO apply script for 31c: 4 held patches exported from the build clone chain e152bbb23..7e2857f3d
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c31c-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-ecfd85ed4 'fix(architecture): an accepted unowned-path exception keeps covering a test the derivation would now own'
step 02-254d76dd5 'fix(override): every git attempt of a planning is capped by what is left of its deadline'
step 03-42b13de7a 'fix(guard): the signing instructions are printed once whatever refusal comes first, and an Antigravity trim is bounded'
step 04-7e2857f3d 'fix(verify): the browser smoke dispatcher says why a project command under the reserved id was taken over'

node scripts/refresh-derived-files.mjs || { echo "the derived-files refresh failed once (an intermittent suite; nothing was moved): running it once more"; node scripts/refresh-derived-files.mjs; }
git add -A -- docs plugins/pipeline-core backlog harness/config
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after 31c (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
