#!/usr/bin/env bash
# PO apply script for candidate 20e part 1 (G20-70, G20-73, G20-75): 4 held patches exported from the build clone chain ed00cb2de..a68c4c4e5
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20e-handover/chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 1-e9042c2b1 'fix(dispatch): a dispatch without a model names its own agent type'"'"'s duty selector, not the implementation default (G20-70)'
step 2-9a0a0a6b0 'fix(dispatch): the model-missing repair for an Opus Critic route names the MP-07 batch scope and rationale lines (G20-70)'
step 3-5ca81bfc8 'fix(dispatch-budget): the checkpoint notice carries the exact grant line and the grant script answers --help (G20-73)'
step 4-a68c4c4e5 'fix(dispatch-briefing): the briefing names the obligations file that exists for the project (G20-75)'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 20e part 1 (G20-70, G20-73, G20-75) (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
