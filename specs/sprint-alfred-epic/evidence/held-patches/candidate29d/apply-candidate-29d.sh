#!/usr/bin/env bash
# PO apply script for candidate 29d: 51 held patches exported from the build clone chain 64e8dfbcc..70e06de44
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate29d
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-776575462 'docs(auth-inventory): list the three PO approvals added since candidate 28e'
step 02-ed5bfef50 'test(signing-sweep): the staged fixture'"'"'s Claude review carries the host observation'
step 03-389fb7558 'test(scanner-diagnostics): name the Unix socket path limit instead of failing in setup'
step 04-b9894eb86 'test(result-bootstrap): the fixture commits its Spec folder like a closing consumer'
step 05-ea34fec13 'fix(tools): give run-parallel workers a HOME short enough for a socket address'
step 06-56c36d56b 'test(native-host): three real stops with disjoint scopes land in one chain (K-34)'
step 07-8f71c0253 'test(security-scan): the close postimage check blocks exactly when the full scan does (C2)'
step 08-e009147a0 'test(security-scan): the close postimage CLI stops on a real gitleaks finding (C2)'
step 09-d37b1e26e 'fix(native-host): refuse a sibling'"'"'s unproven host commit at once and by name (K-34)'
step 10-99c65205d 'fix(guard): list the stop-outcome reader the K-34 refusal added to the kernel'
step 11-dfd22b7ff 'fix(guard): give a ; list of reads a per-part verdict and drop a root cd'
step 12-42d58c3f0 'feat(approval): hand the PO one fixed "Now from you" sentence per signing step'
step 13-5ad8985aa 'fix(guard): give no per-part verdict for a list with a line break in a part or a non-root cd'
step 14-b36591869 'fix(guard): name the one-pattern alternation when -e is repeated'
step 15-a74edd255 'fix(approval): show the PO the same command spelling in poNow, on its own lines'
step 16-bb433fb0f 'fix(native-host): read earlier items'"'"' check sources from the commit in the integrated scan'
step 17-68e2720cb 'fix(native-host): admit a checkpoint with no changed path for a stop before any edit'
step 18-5e16395e1 'fix(plan-handoff): refuse an unlocatable criterion row at the hand-off'
step 19-c8a79b9e4 'fix(plan-handoff): name the hidden journey duty of a re-rendered row'
step 20-c1e3c1e56 'fix(critic-preflight): list the later prerequisites on the empty-evidence refusal'
step 21-fecaf2eab 'fix(critic-preflight): name the one-command route among the listed prerequisites'
step 22-d161240e7 'docs(design-course): name evidence/ as the place of the unpublished original report'
step 23-f37bdf8b4 'feat(guard): run a committed tools/checks script in design draft (ADR-0098)'
step 24-25fa47f62 'feat(audit-bundle): bind each projected dispatch to its record file digest'
step 25-75f317b83 'fix(native-host): keep the working-tree checker read for dependency readiness'
step 26-712d2bce0 'fix(native-host): name a changed dependency checker instead of a registry repair'
step 27-54096ffcc 'feat(agy-native): land a branch child'"'"'s own commits by fast-forward (ADR-0099)'
step 28-8e15f0044 'fix(native-host): name a refused stop integration and repeat it on a sibling race (K-38)'
step 29-dcb09bb60 'fix(agy-native): check the scope of every landed commit, not only the end state'
step 30-e310d2b84 'fix(native-host): retry only integration races, and end before the host timeout'
step 31-dcd9f460a 'fix(wait-host-commit): state which slice a refused integration'"'"'s commit releases'
step 32-d6fdb1733 'fix(native-host): give an unclassified CAS refusal the fixed rounds, and pin the slice id of a whole stop'
step 33-a93538fa4 'feat(calibration): let the configure-verify transition take a signed replacement'
step 34-8a14b8ad1 'feat(approval): add the replace-verify-command kind and its one subject builder'
step 35-25ef5d5c9 'feat(pipeline-state): configure-verify --replace replaces the verify command with one approval'
step 36-27a15d82d 'feat(close): count a stored verify replacement as its own proof kind'
step 37-5f3d3bff5 'test(round-trip): prove the replace-verify-command signature end to end'
step 38-d8da2caf0 'docs(adr): record ADR-0100, configure-verify may replace the verify command with one signature'
step 39-c25daac0d 'fix(dispatch-budget): name the fresh round when an aborted Critic has no grant'
step 40-76ed75225 'fix(calibration): bind a replacement record to its stored approval at commit and close'
step 41-d07c3cc33 'docs(backlog): file the concurrent-stop livelock and the dispatch-check gap'
step 42-80b2120be 'fix(prepare-dispatch): name the prepare step of an Antigravity Critic call'
step 43-9c474c234 'fix(pipeline-state): keep pipeline-state.mjs under the authority source bound'
step 44-8c350c4f2 'test(native-host): drive a no-edit checkpoint through the stop finalizer'
step 45-85f2df21b 'docs(backlog): record the further stop-pair reds of the 29d runs'
step 46-459153f6a 'test(pins): split the source-bound pin into two cases'
step 47-6bb5827a3 'test(verify-case-completion): restate five outgrown VCR01 site counts'
step 48-a4b2efa7b 'fix(toolchain-doc): name no source-only harness path in shipped files'
step 49-9e3ab2042 'test(language-canon): pin the German Critic budget to D190'
step 50-cda24d051 'fix(native-host): a settled sibling'"'"'s shared paths are no foreign paths'
step 51-70e06de44 'fix(native-host): a checkpoint names the scope-change routes'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 29d (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
