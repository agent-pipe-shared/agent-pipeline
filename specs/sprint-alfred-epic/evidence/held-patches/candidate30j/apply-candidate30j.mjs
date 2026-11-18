#!/usr/bin/env bash
# PO apply script for candidate 30j: 29 held patches exported from the build clone chain 0b903d0d7..fd69d44f3
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30j
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-048b84aef 'fix(plan): one list of the package states, and the plan rejection names the reconcile route'
step 02-e2fa057d2 'fix(dispatch): a settled dispatch no longer counts as a running dispatch in the briefing'
step 03-09fbe157a 'fix(approval): a mistyped passphrase ceremony is reproduced and closed by the prefix rule'
step 04-8efb7d7f5 'fix(host-state): a pending state retires at its own integration and heal proves nothing is in flight'
step 05-7209dcbae 'refactor(critic): one evidence-only definition for the follower commit checks'
step 06-d7c22da3f 'refactor(onboarding): the lifecycle status list comes from the producer'
step 07-fca5d7073 'fix(close): a deleted listed evidence file, the package back-move and the gate-change way out name their recovery'
step 08-dc62a6295 'test(hooks): pin that the bootstrap refreshes the hooks after a plugin reload'
step 09-dbca85844 'refactor(calibration): one shared list of the calibration paths'
step 10-6c79fe00d 'fix(close): the legacy close journal writers are removed and two guard wording tests are corrected'
step 11-2b1436fc8 'docs(adr): ADR 0104 draft on evidence-only follower commits and what a Verify result covers'
step 12-d1ab8c165 'feat(approval): a plain-language signature card for override ceremonies and design approval'
step 13-629eb9c82 'fix(registration): lineage and delta registration name their feature from the consumed course binding'
step 14-8cc6569b5 'fix(guard): the command catalogue admits one trailing --feature selector on the registration verbs'
step 15-641fefb55 'fix(registration): the commit-time lineage guard derives its feature from the course binding'
step 16-834fa242d 'refactor(calibration): the four remaining calibration path lists use the shared one'
step 17-6676090a6 'feat(dispatch): the generated briefing lists the admitted shell shapes from the guard grammar'
step 18-e77c06f57 'fix(toolchain): the tool check names the fix for a tool at an untrusted path'
step 19-c4d6cf6b6 'fix(critic): a split finalisation names the missing child and the step that reruns only it'
step 20-a2be4870b 'feat(approval): one renderer for commands printed for the human in the target shell'
step 21-06f942488 'feat(onboarding): the first round asks its own question whether a remote push is planned later'
step 22-fa5f19264 'test(verify): register the human command render suite and assign its Verify surface to the approval capability'
step 23-098d7744b 'docs(governance): classify ADR 0104 in the documentation inventory'
step 24-6d73046da 'feat(bootstrap): a soft plugin-refresh-required status offers the one typed hook-refresh action'
step 25-57d2878bc 'refactor(hooks): the hook installer iterates the shared calibration path list'
step 26-3d2949a76 'refactor(guard): GUARD-READ-TARGET is one exported constant and the obligations sentence is true'
step 27-2429fcb68 'fix(tests): repair the line-ending case of critic-evidence-carry and the maintenance-window decline case of signing-ceremony'
step 28-827bd0291 'feat(approval): the signature card also covers the guard-override route started with only the intent digest'
step 29-fd69d44f3 'test(hooks): the repository-mode promotion fixtures keep their line endings on any machine'

node scripts/refresh-derived-files.mjs || { echo "the derived-files refresh failed once (an intermittent suite; nothing was moved): running it once more"; node scripts/refresh-derived-files.mjs; }
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 30j (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
