#!/usr/bin/env bash
# PO apply script for candidate 27: 18 held patches exported from the build clone chain b87f0ddd0..4877f83b3
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate27
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-659b9f2fe 'fix(critic): find the verdict when the report quotes a tagged code snippet'
step 02-0cdac03ae 'feat(guard): admit the closed object read, a cd to the project root in a read chain and attached rg context'
step 03-58a488513 'fix(dispatch): report a registry lock met by the readiness read as a lock, not as a held dependency'
step 04-596dea384 'fix(guard): admit the usage question on the wait and readback scripts and repoint a stale help test'
step 05-98bc6df09 'feat(guard): admit native Grep and name-filtered Glob on project directories behind the rg screen'
step 06-f6d5bd6f6 'feat(pipeline-state): take the recorded actor name from a label stored once on this machine'
step 07-d38ac0479 'fix(reground): label the compact dispatch eligibility as covering continuity only'
step 08-8a602ba03 'docs(backlog): file the read allowlist, the personal routing override and the refused-push nudge for after 0.7.0'
step 09-c3546bfd6 'fix(critic): re-pin the protected preimage over three changed Critic surfaces once by PO decision 2026-11-10'
step 10-054f91f43 'feat(critic): label a caller-authored round in the review lineage'
step 11-439ffda6f 'test(pipeline-state): keep the derived-name suites independent of a stored operator label and state who stores it'
step 12-938d75e33 'docs(decisions): register the one-time preimage re-pin and the lineage origin label, and correct the new backlog frontmatter'
step 13-af3002913 'test(compact): accept the announced routing fallback on stderr and nothing else'
step 14-ffe9e7690 'feat(close): export every Critic round from the private journal inside the close commit'
step 15-d21b7a05d 'feat(push): carry proof and final records after any signed push and let a release include its push'
step 16-4e83ba43f 'feat(preflight): carry the observation governance status on the start line'
step 17-4335b8046 'docs(decisions): register ADR-0090, D237 to D239, the two-route push flow and the follow-up backlog items'
step 18-4877f83b3 'fix(push): bind the carried records to the close digests and keep approve-push in chat mode'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 27 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
