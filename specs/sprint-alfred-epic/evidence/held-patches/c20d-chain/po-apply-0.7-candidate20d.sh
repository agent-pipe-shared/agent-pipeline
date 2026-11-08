#!/usr/bin/env bash
# PO apply script for candidate 20d: 11 held patches exported from the build clone chain 9443438b0..92c111b49
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20d-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-baabd989d 'feat(pipeline): sanctioned writers arm the commit of exactly the protected files they wrote (G20-66)'
step 02-e6ab839be 'chore(pipeline): register the writer commit capability in the kernel closure and its threat model (G20-66)'
step 03-d4563f00a 'fix(pipeline): the worktree snapshot of a writer commit capability skips large dirty files (G20-66)'
step 04-24fbcc232 'feat(close): one agent command closes a feature up to the printed commit, and the audit bundle carries the signed proofs (P3)'
step 05-36e663bab 'docs(close-feature): the skill leads with the one close command and keeps the per-stage commands as the recovery reference (P3)'
step 06-6d5cb244b 'test(audit-bundle): pin the proof collection from State and the private approval store (P3)'
step 07-11f4be4b8 'test(close): exercise the one-shot CLI stop and usage refusal (P3)'
step 08-d0c27953d 'feat(codex): an agent-run prepare command runs the governed Goldfish admission before spawn_agent, and every Codex dispatch text names it (G20-63)'
step 09-7f7daadaa 'feat(dispatch): a documentation-only module names one owned document as its item check and the host finalize verifies it (G20-65)'
step 10-f0dfb8187 'feat(onboarding): the onboarding consent names every agent step up to the design approval, is recorded with a quote, and covered actions print coveredBy (G20-45)'
step 11-92c111b49 'fix(guard): a read of a missing in-root path is an existence probe, not a refusal (G20-67)'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 20d (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
