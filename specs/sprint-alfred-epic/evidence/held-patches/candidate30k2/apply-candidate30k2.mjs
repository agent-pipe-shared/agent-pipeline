#!/usr/bin/env bash
# PO apply script for candidate 30k wave 2: 10 held patches exported from the build clone chain 525fab15d..61f6abaa0
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30k2
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-e2a61fa74 'feat(close): the addenda stop names every written Critic addendum that git status hides and the command that stages it'
step 02-638a8e17a 'fix(approval): the card of the digest-only override route says that no request file exists on that route'
step 03-47c80a1e1 'fix(push-init): a missing transport reference names what the value is for each transport kind and shows an example'
step 04-34147d56b 'docs(plans): options for a browser smoke step in Verify with the smallest first stage'
step 05-4f219b298 'docs(plans): options to improve the one-turn design question round without a second round'
step 06-3f1106be6 'chore(inventory): refresh the derived files after the 30k wave 2 lanes (ledger, inventory baseline, Reader inputs)'
step 07-c31fcb4af 'refactor(onboarding): the consent question is shorter and keeps every fact it states'
step 08-fe262759b 'test(verify): register the consent question suite and assign its Verify surface'
step 09-1afe4e446 'chore(inventory): refresh the derived files after the 30k wave 2 lanes (ledger, inventory baseline, Reader inputs)'
step 10-61f6abaa0 'docs(adr): accept ADR 0104 with Option A and record why Option B stopped on recon'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog harness/config
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 30k wave 2 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
