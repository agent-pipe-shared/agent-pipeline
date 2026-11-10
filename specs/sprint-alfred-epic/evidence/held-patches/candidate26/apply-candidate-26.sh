#!/usr/bin/env bash
# PO apply script for candidate 26: 6 held patches exported from the build clone chain f2028829f..75f415690
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate26
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-5692f75eb 'fix(critic): apply the minor-only pass rule on the isolated Codex route, re-pinning its host once by PO decision'
step 02-c40a75b0c 'feat(push): record what the remote holds at the end of the turn on all three runners'
step 03-746a464e4 'docs(adr): accept project-owned routing as ADR-0089 and register it'
step 04-eabc16f4d 'docs(backlog): file self-attested authorship and the printed residual acceptance for after 0.7.0'
step 05-2319a5606 'fix(push): bound the turn-end readback by push age and write each attempt before the network call'
step 06-75f415690 'test(critic): run a minor-only round through the Codex host receipt and its recovery'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 26 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
