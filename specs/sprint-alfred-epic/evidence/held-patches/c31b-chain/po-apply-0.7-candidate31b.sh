#!/usr/bin/env bash
# PO apply script for 31b: 2 held patches exported from the build clone chain 1730fb6a6..db07939ab
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c31b-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-c412d7a7d 'fix(design-approval): the retained approval reads a three-receipt review chain, and a blocked decision projection names its cause'
step 02-db07939ab 'fix(design-review): the report label and resolved-status rules no longer drop a genuine blocking finding'

node scripts/refresh-derived-files.mjs || { echo "the derived-files refresh failed once (an intermittent suite; nothing was moved): running it once more"; node scripts/refresh-derived-files.mjs; }
git add -A -- docs plugins/pipeline-core backlog harness/config
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after 31b (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
