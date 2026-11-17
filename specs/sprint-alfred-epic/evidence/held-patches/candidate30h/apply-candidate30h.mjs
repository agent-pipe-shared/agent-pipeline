#!/usr/bin/env bash
# PO apply script for candidate 30h: 14 held patches exported from the build clone chain a01eda721..6d8226f72
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30h
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-52e6c926b 'feat(close): the human acceptance accepts plainly positive answers on a closed list'
step 02-10064a8c8 'fix(critic): CCA-MANIFEST-READ names --successor-of for a feature that replaces a discarded one'
step 03-b27dd1e66 'test(critic): restate the pinned digest of the CCA-MANIFEST-READ repair text'
step 04-46110ca20 'fix(close): a refused Result close names its cause, the owner route carries the entry text and the one-shot names an unclosable Result before Verify'
step 05-14ff57be6 'fix(close): the close leftovers have a recovery and every one-shot stop names a runnable step'
step 06-71d385a20 'fix(recovery): every refusal after a plugin reload names its one recovery and the attestation readback says what differs'
step 07-b2227527f 'fix(close): the human acceptance question of the one-shot close comes after the candidate Verify'
step 08-03ce5d8d0 'fix(critic): trustBoundaryChanged no longer steers a Critic diff round'
step 09-4c23a896f 'docs(critic): the Critic skill and templates drop trustBoundaryChanged, the preimage is re-pinned, the boundary policy says it is permanent'
step 10-66d73ceee 'test(verify): the case-completion policy of the Critic course admission suite lists its three new case ids'
step 11-3177f26db 'feat(dispatch): a PO-requested, recorded and expiring model exception admits a model no configured route selects'
step 12-90e2a8ae8 'docs(dispatch): the capability table and the happy-path guide carry the model exception row'
step 13-6751f2620 'fix(guard): the model exception store is a never-liftable kernel path'
step 14-6d8226f72 'test(verify): the case-completion policy of the dispatch model guard suite lists its two new case ids'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 30h (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
