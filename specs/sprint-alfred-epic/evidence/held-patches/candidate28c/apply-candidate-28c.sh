#!/usr/bin/env bash
# PO apply script for candidate 28c: 14 held patches exported from the build clone chain 8438dac43..926726c50
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate28c
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-11fad647d 'feat(agy): let the Antigravity take-over land its host commit through the recovery route in one call'
step 02-7a71abc5e 'feat(evidence): let the registration command, the Critic finalizer and the one-shot close stage exactly the paths they print'
step 03-1414e512a 'feat(evidence): record the software bill of materials in every feature close and carry it in the audit bundle'
step 04-3da45b49f 'docs(sbom): record the decision that the close writes the SBOM and describe it in the operating model and the close skill'
step 05-cde1280bc 'docs(architecture): bring the concept map of the close and the Critic finalizer up to date'
step 06-22bc6a5d4 'docs(backlog): record the follow-ups of the SBOM close (audit pack, override binding, more readers)'
step 07-3fdb7bacd 'docs(backlog): record that a follow-up epic cannot extend the closed architecture design'
step 08-3a40cf073 'feat(architecture): let a follow-up epic add modules to the design a closed epic materialized'
step 09-82daeb687 'docs(backlog): state that the K-13 extension route is built and what is still open'
step 10-f6788c525 'docs(architecture): bring the concept map up to date for the follow-up extension of a closed design'
step 11-6d1aacfdb 'feat(architecture): let a predecessor module grow its dependencies, contracts and test entry points in a follow-up extension of a closed design'
step 12-93758c680 'feat(evidence): require the PO'"'"'s signature to accept a gap in the SBOM of a feature close'
step 13-61cb7e2e2 'docs(architecture): bring the concept map up to date for the signed SBOM override'
step 14-926726c50 'feat(evidence): carry the signed SBOM override in the audit bundle and check its signature offline'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 28c (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
