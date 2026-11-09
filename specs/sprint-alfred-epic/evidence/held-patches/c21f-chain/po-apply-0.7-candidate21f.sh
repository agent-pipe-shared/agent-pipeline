#!/usr/bin/env bash
# PO apply script for candidate 21f: 10 held patches exported from the build clone chain 614d8e181..01f956155
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c21f-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-e3a9e5691 'fix(guard): name the Bash lane in the PowerShell refusal and restate the stale Glob listing test'
step 02-01dbcbadb 'fix(guard): refuse a hand edit of a feature package past implementing and name the one-shot route'
step 03-eab04e053 'fix(signing): name authorize-critical when a critical proof wait ends and prove the printed signing lines run unchanged'
step 04-a942bac47 'fix(cli): count Codex custom tool calls in the transcript export and say that push-prepare --close runs alone'
step 05-13927ffa7 'fix(security): keep the host snapshot path out of the license-check reason in the security evidence'
step 06-0cf330477 'fix(forensics): keep the newest sessions when the transcript candidate bound cuts a store and write down the counting rules'
step 07-dbee6f75c 'test(push): pin that every flag in the push flow document is read by its script'
step 08-9303e5e77 'fix(architecture): keep the accepted design visible after its feature closed'
step 09-fb41bc814 'fix(guard): admit numbered file excerpts and stop offering a signature for reader pipelines'
step 10-01f956155 'fix(close): admit a coordinator-bound close-feature in a catalogue project on the direct route'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 21f (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
