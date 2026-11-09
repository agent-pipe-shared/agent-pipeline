#!/usr/bin/env bash
# PO apply script for candidate 21d3 (Windows owner route, Codex re-entry, runner happy path): 4 held patches exported from the build clone chain e513df862..0ef4b93e0
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c21d3-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-287105e71 'docs(runbooks): add the critic path and the one-shot close entry to the runner happy path'
step 02-7e5fed8d3 'fix(close): stop the coverage notice from sending runners to hand-build addenda the close writes itself, and name the one-shot entry in the usage'
step 03-8b622836e 'fix(windows): admit the owner-route and controller records and find a killed owner-route call'
step 04-0ef4b93e0 'fix(session-cleanup): treat the hook identity anchor of every runner as no cleanup session'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 21d3 (Windows owner route, Codex re-entry, runner happy path) (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
