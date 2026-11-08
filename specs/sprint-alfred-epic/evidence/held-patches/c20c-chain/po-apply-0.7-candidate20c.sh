#!/usr/bin/env bash
# PO apply script for candidate 20c: 4 held patches exported from the build clone chain 5d863287a..db457cf5f
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20c-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 1-78d6e7b65 'fix(guard): a relative operand that escapes the repository is judged by its resolved path (G20-60)'
step 2-b07a33051 'fix(rebind): the contract readback judges a routing-only profile source change by the rebind rule (G20-64)'
step 3-7ebd0c33b 'fix(slice-queue): an absent delivery course names the executable admission route and the Codex gap (G20-62)'
step 4-db457cf5f 'docs(happy-path): the Goldfish completion notification is the cue to continue in the same turn (G20-61)'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 20c (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
