#!/usr/bin/env bash
# PO apply script for candidate 20b: 23 held patches exported from the build clone chain daae02455..23d7e20f4
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20b-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-324e73763 'fix(lifecycle): set-phase names the calibration commit step and the hook names the agent repair for a mixed staged set (G20-46)'
step 02-a01b92137 'fix(agy): admit and bind a native Antigravity Goldfish end to end: bare type names, the Antigravity briefing binding and a hook-observed owner (G20-47, G20-48, G20-49)'
step 03-b8e3d3a97 'fix(lifecycle): materialize-architecture registers the feature package and set-phase names that repair for CAC-REGISTRATION-INVALID (G20-51)'
step 04-22244e828 'fix(devplan): treat the onboarding-seeded VERSION as scaffold so the draft commits are admitted (G20-52)'
step 05-158d6f164 'test(verify): count the close-path-e2e-tests completion row of candidate 20 in the case-completion pins'
step 06-81bec0eb9 'fix(usage): bind Antigravity usage on the registry'"'"'s current cells, the Critic'"'"'s inherit alias and the newer flash ids (FV red p3b C03)'
step 07-2947b2b8f 'chore(generated): regenerate the close-path runbook, the vendored push-release flow and the enforcement doc after candidate 20'
step 08-5d322ee0f 'fix(lifecycle): submit-plan names the seal order for a draft package, prepare-seal without arguments before present-plan (G20-50)'
step 09-83fcd72d6 'test(guard): restate the draft shell refusal of a Pipeline script without the scratch-script bare-node advice G20-21 narrowed (FV red)'
step 10-c19a0ace9 'fix(guard): the plugin read-target refusal names a skill file without the SKILL.md literal the read-boundary pin forbids (FV red)'
step 11-8875ad094 'test(design): reconstruct the chunked signing block in the design approval route e2e (QG-04 restatement)'
step 12-bab988847 'test(pins): expect the signing step for the PO'"'"'s own terminal in the commit-scoped override course (QG-04 restatement)'
step 13-4a80f4c8d 'chore(security): re-line the moved synthetic fixture label after w256 in the ignore list'
step 14-b119e896e 'test(verify): extend the guard-dispatch case policy by the two Antigravity admission cases (GD84, GD85)'
step 15-c233bfaba 'fix(guard): close the maintenance-window kernel over the G20-46 hook loads and the G20-51 registration child'
step 16-87d5abe21 'fix(lifecycle): set-phase implementation moves a registered approved feature package to implementing so the close path can reach verifying (G20-54)'
step 17-bd37ba9ca 'test(pins): examine the registration CLI with the automatic G20-51 step switched off through its seam (QG-04 restatement)'
step 18-c615f405c 'test(design): decode the native Windows PowerShell signing block in the design approval route e2e'
step 19-f32debf8d 'test(verify): restate the close-path walk'"'"'s measured descriptor count after G20-54 (86 -> 87)'
step 20-90675f62a 'fix(guard): the close commit may stage exactly the closed-continuity bytes the close bound, without a PO override (G20-55)'
step 21-7f2b3b792 'docs(skill): a Claude Elephant continues in the same turn after a Goldfish host commit instead of waiting for the pipeline (G20-57)'
step 22-bc15619c2 'fix(po-gate): name the agent-admitted profile repair route first (G20-53)'
step 23-23d7e20f4 'fix(provisioning): the profile receipt repair names the agent-admitted repair plan (G20-53)'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 20b (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
