#!/usr/bin/env bash
# PO apply script for candidate 28c: 25 held patches exported from the build clone chain 8438dac43..f6738d2f8
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
step 15-2f2be4cd4 'feat(scripts): measure the fixed context baseline of a session per window and the Pipeline'"'"'s share of it'
step 16-90a343fb3 'feat(guard): print the full shell grammar once per context window, also for read-spelling refusals'
step 17-115d08bfd 'feat(preflight): print a compact ready envelope and keep the full one in the session scratch directory'
step 18-a325921ac 'fix(verify): place the context-baseline and grammar-once suites in the capability inventory'
step 19-3e8187c91 'fix(guard): list the SBOM modules the audit bundle and the signing script import as kernel paths'
step 20-3929ecf80 'fix(preflight): keep the repair of open readiness findings and the Antigravity hint for an unidentified runner'
step 21-d269e29c1 'chore(derived): refresh the backlog ledger projections and the Reader inputs for candidate 28c'
step 22-a0e225be7 'feat(pipeline-start): keep the start skill inside the re-attach window and move status-conditional blocks to their references'
step 23-6c3f9c66b 'docs(guard): name candidate 28c as the origin of the SBOM kernel paths'
step 24-eff94f0cd 'docs(claude-md): keep the hard rules in CLAUDE.md and move their incident history to a maintainer record'
step 25-f6738d2f8 'fix(docs): classify the new maintainer record and ADR-0091, and vendor ADR-0091 with the refreshed operating model'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 28c (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
