#!/usr/bin/env bash
# PO apply script for candidate 20: 54 held patches exported from the build clone chain 72ef2e315..d83ce4e29
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-280f07a84 'fix(candidate-20): w252 Codex onboarding repair deadlock and apply-patch guard budget'
step 02-8928d9fce 'fix(candidate-20): w252 a guessed plugin path is named as missing'
step 03-8cd6d09e4 'fix(candidate-20): w252 greenfield architecture entry names materialize-architecture, the signed adoption apply runs without an override, ADR checks admitted in draft (G20-5, G20-7)'
step 04-e13adb481 'fix(candidate-20): w252 a missing canon pointer names the plugin copy, CGB-REFERENCE names its path (G20-9, G20-10)'
step 05-bb3c59c95 'fix(candidate-20): w252 the terminal release rides out a sibling race for the stop'"'"'s own wait budget (G20-4)'
step 06-29723d76d 'fix(candidate-20): w252 reader-review reports are retained prior results, not Critic source (G20-11)'
step 07-5c74ed8f6 'test(candidate-20): register the two new pin suites and categorize them in the capability inventory'
step 08-3d0c716a8 'fix(candidate-20): a ready session with an architecture diagnosis no longer refuses every write (G20-12)'
step 09-60ca614b4 'fix(candidate-20): the Antigravity model-role selector no longer exits 13 on an import cycle (G20-14)'
step 10-cb93edf6c 'fix(candidate-20): architecture-adoption prepare accepts --decided-at now (G20-18)'
step 11-f01f42b22 'fix(candidate-20): admit absolute-node scratch scripts and name the -F commit route (G20-21)'
step 12-3cf145b8f 'fix(candidate-20): submit-plan checks ADR sidecars before the PO signs (G20-15)'
step 13-ec1bc8bdf 'fix(candidate-20): the Critic finalizer completes without a Source return record under the caller-authored label (G20-24)'
step 14-708af357e 'fix(candidate-20): the absolute-node scratch admission requires a Node outside the project root (G20-21)'
step 15-cc2b2185c 'fix(candidate-20): submit-plan names the admitted set-phase verify route, not the refused configure-verify (G20-19)'
step 16-de60731a5 'fix(candidate-20): approve-plan names materialize-architecture for an approved greenfield design (G20-32)'
step 17-90cd2c605 'fix(candidate-20): sanctioned commands accept another absolute Node outside the root, e.g. a Windows forward-slash spelling (G20-17)'
step 18-2dc43cd97 'fix(candidate-20): present-plan renders the PO signing step for the PO'"'"'s own terminal, WSL through wsl.exe (G20-16)'
step 19-d39add650 'fix(candidate-20): the override sign-intent block is rendered for the PO'"'"'s terminal, and the denial says the agent runs plan itself (G20-16, G20-17)'
step 20-71c407fd2 'feat(candidate-20): one shared path and interpreter spelling equivalence for Windows, macOS and Linux'
step 21-00384c706 'fix(guard): one shared path-spelling equivalence for interpreter, root and argv comparisons (C20 separator sweep) and a once-per-session agy start hint (G20-33)'
step 22-a3e14b638 'fix(agy): keep the answered intake values and material input on later turns, only the bootstrap instruction is replaced (G20-33)'
step 23-7a658bf2d 'fix(guard): admit the read-only session-authority diagnosis every SDC refusal names (G20-20) and follow the measured case-completion counts'
step 24-7c19bad7d 'feat(adr): C20 w253 create-adr generator, shipped decision schemas, guard admission'
step 25-1b0061551 'feat(security): C20 w254 security close chain hard per calibration, four states, Verify wiring'
step 26-7130ef741 'docs(security): C20 w254 four-state security reporting and critical calibration rule in SEC-06 and the operating model'
step 27-eed1a325d 'feat(agy): C20 w255 native Goldfish via generated briefing, child-parent binding, model check; isolate start-hint test home'
step 28-a3e4ddb89 'fix(guard): C20 G20-34 a read-only -C query on another repository follows the passive read policy'
step 29-d72131830 'feat(adr): C20 w256 bind ADR proposals into the design package so approval materializes them accepted'
step 30-93c7bb2e4 'feat(security): C20 w257 critical project without a security gate is refused at Verify, close and push with a gate repair command'
step 31-07af43910 'test(verify): C20 register the path-spelling, agy native Goldfish, read-only -C and security close chain suites'
step 32-35db88a31 'feat(agy): C20 w258 native Goldfish isolated in branch worktrees, governed as the registered repository, integrate route'
step 33-8b7548654 'feat(evidence): mirror dispatch, verify and approval records into a tracked audit index (G20-29)'
step 34-f99a969b2 'feat(spec): examine acceptance criteria as whole user journeys at hand-off and close (G20-27)'
step 35-b57916271 'feat(forensics): paginate the transcript index and read a session window by window (G20-31)'
step 36-8d39d1588 'test(pins): restate the one sign-intent command per terminal block after the bounded per-terminal rendering'
step 37-a8719d4f5 'fix(guard): keep the kernel closure intact, the security Verify check gets its own dispatcher and three leaf modules join the never-liftable list'
step 38-612f08c54 'feat(architecture): measure real module imports and budgets in the normal Verify and name the uncommitted materialization (G20-36)'
step 39-b6f3dee74 'feat(onboarding): never re-ask an answered value and wait for the named signed proof instead of a PO reply (G20-30)'
step 40-fbba1d851 'chore(verify): register the durable-evidence and user-journey pins'
step 41-2ce0ac542 'docs(spec): slice the plan vertical first, one thin end-to-end journey before horizontal layers (G20-28)'
step 42-b8f65ab49 'test(close): walk implementation to closed-local per runner identity and register the walk (G20-35)'
step 43-fc44efa2f 'fix(architecture): name the materialization commit step in commitStep, keep nextAction for executable actions'
step 44-e686c0e46 'fix(critic): carry a Critic export committed as one commit with its lineage and manifest entry, and walk the feature course to the audit route (G20-35)'
step 45-f4e9c1d3d 'test(close): walk the audit route, close, push gate and release preflight, and register Verify evidence only under the evidence directory (G20-35)'
step 46-7f6dbbaae 'fix(dispatch): let a pre-launch publish wait for a sibling launch'"'"'s registry lock for the whole remaining admission budget (G20-40)'
step 47-9ba3cb66a 'feat(package): let the agent run a result-only reconcile of an unchanged approved package, the PO signature stays for any other change (G20-38)'
step 48-2de3eecda 'feat(critic): issue the Critic Source return at the Critic subagent'"'"'s stop and bridge a runner without one through a PO acknowledgement of the caller-authored verdict (G20-39)'
step 49-15a85d597 'feat(agy): issue the Critic Source return from the Critic child'"'"'s final send_message to its parent (G20-41)'
step 50-b1ca8abad 'feat(release): consumer release as an annotated version tag after one PO release approval, VERSION at onboarding (G20-42)'
step 51-36791a766 'fix(migration): refresh a project bound to a known older shipped registry instead of stranding it (G20-44)'
step 52-30e7a0011 'feat(agy): record the resolved native child model instead of refusing it, route Critic inherit and Goldfish flash medium/high/low (G20-43)'
step 53-e28f639ba 'test(migration): pin the known-older-registry refresh with the cells G20-43 changed, restate the corpus count (G20-44)'
step 54-d83ce4e29 'chore(verify): categorize the seven new Verify suites in the capability inventory and register the close-path walk for case completion'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 20 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
