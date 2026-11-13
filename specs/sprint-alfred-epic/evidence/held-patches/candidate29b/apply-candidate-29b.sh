#!/usr/bin/env bash
# PO apply script for candidate 29b: 16 held patches exported from the build clone chain 136e60930..5d98a1082
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate29b
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-88a83360c 'fix(dispatch-briefing): DBG-ITEM-SLUG says what the item slug is and names the repair'
step 02-7bff20ba5 'fix(commit-message-policy): GIT-03-DISPATCH-MISSING names split -m trailers and the git commit -F form'
step 03-ad059b943 'fix(guard): admit resume-hint consume/query in draft and name inspect for pipeline-state status'
step 04-e2f6a75cf 'fix(push-approval): an expired push proof names the way to a fresh signing command'
step 05-57cbcab08 'fix(usage-ledger): --timeline reads the Antigravity brain transcript'
step 06-c88b69564 'fix(antigravity-guard): the read-only run timeline over the brain transcript is no brain write'
step 07-3822ce96c 'fix(gh-cmd): a gh data value passed to a node script file is no gh invocation'
step 08-9e1b06c6a 'fix(guard): po-approval-gate verify-critical is agent readback, not a cross-repository mutation'
step 09-fa8a059c9 'fix(guard): a plain cp of a gate-strength file into scratch is a fixture copy'
step 10-aefbba5b8 'fix(criterion): bind an item criterion of the approved Spec at its approved path'
step 11-9c5056f7d 'fix(override): a denied push-init keeps the destination it froze'
step 12-321e9277f 'docs(operating-model): state the D190 Critic course in the German reference and the Goldfish role'
step 13-c38a75aaf 'fix(finish-feature): take --one-shot and --stage from any argument position'
step 14-01caf91b4 'test(pins): classify approve-spec-addendum as an off-happy-path PO interaction'
step 15-3fb2eac61 'fix(approve-push): name both valid proof path sets on CRITICAL-PROOF-EXTERNAL-PATH'
step 16-5d98a1082 'docs(backlog): file Codex run 3 points C10 and C13, add C11 evidence'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 29b (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
