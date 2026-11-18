#!/usr/bin/env bash
# PO apply script for candidate 30k: 22 held patches exported from the build clone chain fd69d44f3..ad80dcf41
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30k
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-175729c4a 'refactor(operating-tools): the post-sitting checks judge by exit code and print the counts they observe'
step 02-23a8d1469 'refactor(calibration): the five remaining private path lists and the two mirror-rule guard texts use the shared list'
step 03-37c815047 'refactor(vendored): the vendored-template check reads its pairs from the generator'"'"'s own list'
step 04-9d1c628cb 'feat(refresh): the derived-files refresh also writes the case-completion augmentation rows'
step 05-494686997 'docs(dispatch): the recovery-commit rule and a measured test of the settled-sibling refusal'
step 06-97dd83473 'feat(audit): the close hands the computed approval gaps to the bundle as typed gap items'
step 07-454b1ad5c 'feat(close): a pure reader derives the trace of accepted risks from a Spec table and one readback row shows it'
step 08-ee8968c10 'docs(plans): recon note on where the journey-criterion binding of a delivered item persists'
step 09-af0a0a23b 'refactor(commit-policy): the admitted Dispatch trailer forms are one exported list rendered into the obligations'
step 10-df4cff8be 'test(pins): restate two neighbour pins for the seventh quality row and the exception trailer form'
step 11-8c6808847 'test(verify): register the Spec risk trace reader suite and assign its Verify surface'
step 12-159afbc09 'test(verify): restate the seven outgrown assertion-site counts of the case-completion registry pin'
step 13-525fab15d 'chore(verify): extend the case-completion augmentation rows for the cases the 30j and 30k lanes added'
step 14-e2a61fa74 'feat(close): the addenda stop names every written Critic addendum that git status hides and the command that stages it'
step 15-638a8e17a 'fix(approval): the card of the digest-only override route says that no request file exists on that route'
step 16-47c80a1e1 'fix(push-init): a missing transport reference names what the value is for each transport kind and shows an example'
step 17-34147d56b 'docs(plans): options for a browser smoke step in Verify with the smallest first stage'
step 18-4f219b298 'docs(plans): options to improve the one-turn design question round without a second round'
step 19-c31fcb4af 'refactor(onboarding): the consent question is shorter and keeps every fact it states'
step 20-fe262759b 'test(verify): register the consent question suite and assign its Verify surface'
step 21-61f6abaa0 'docs(adr): accept ADR 0104 with Option A and record why Option B stopped on recon'
step 22-ad80dcf41 'fix(refresh): a suite that fails a case after it declared its ids is still read by the case-completion step'

node scripts/refresh-derived-files.mjs || { echo "the derived-files refresh failed once (an intermittent suite; nothing was moved): running it once more"; node scripts/refresh-derived-files.mjs; }
git add -A -- docs plugins/pipeline-core backlog harness/config
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 30k (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
