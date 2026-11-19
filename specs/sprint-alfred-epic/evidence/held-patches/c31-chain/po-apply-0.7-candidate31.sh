#!/usr/bin/env bash
# PO apply script for candidate 31: 37 held patches exported from the build clone chain 35560870d..bd06c422d
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c31-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-179695cfe 'fix(lineage): the sealed successor binding reaches the first lineage and the compiled resolution'
step 02-977100e2a 'feat(architecture): test ownership is derived and materialize writes the baseline boundary policy'
step 03-1caa64bee 'fix(dispatch): the briefing says who commits for an Antigravity branch worktree and admits the RED evidence path'
step 04-e439d6864 'fix(close): the rerun and signature commands for the human go through the shared renderer'
step 05-2927ca559 'fix(authorship): dispatch-authorship-verify takes the consumer root and the reference gaps are closed'
step 06-9096b9b19 'feat(verify): browser smoke stage 1 runs the declared command behind the preflight'
step 07-7a6b94216 'docs(templates): the Spec risk trace skeleton, the PRD assumptions line and one readiness question'
step 08-c4ab0e72a 'fix(guard): a generated briefing digest mismatch names the first differing line and column'
step 09-4332dbdd1 'feat(critic): delta round preparation derives claims and registered invariants and passes the inner refusal through'
step 10-1e74e83ca 'feat(critic): the Critic briefing carries one derived hint for risks without behaviour'
step 11-22e76b3c7 'feat(close): the close derives the ADR state and names the create-adr command'
step 12-871407670 'feat(onboarding): seed a README and a backlog skeleton create-only and name create-adr in the ADR README'
step 13-5ff514c85 'feat(critic): preparation names the one commit step and argument refusals name the usage line'
step 14-46300c035 'fix(guard): the override planning retries a git timeout once inside a per-planning deadline'
step 15-ca093f8f3 'feat(happy-path): the happy path scripts print one line of JSON'
step 16-86aee1d82 'feat(guard): the grammar refusal trim works on Antigravity and across codes'
step 17-05d306e09 'feat(critic): delta registration exempts the registered evidence paths from the path map'
step 18-63e851629 'feat: the Antigravity child model notice names its repair and the design review reference names the step per runner'
step 19-9cd3bc9c9 'feat: usage-ledger prints a token-only row for Antigravity and Codex and the telemetry route is checked per runner'
step 20-35abb2373 'test: the pins of the grammar refusal trim are restated'
step 21-0d0be6fd6 'feat: the delta verb exempts registered evidence paths and the help says so'
step 22-6fc31a7ca 'feat: submit-plan hints the ADR command and create-adr generates the drafts from the design'
step 23-77739de78 'feat: the close writes the evidence follow-up at closed-local'
step 24-b55a2edb3 'chore(critic): re-pin the protected Critic preimage digests for the Critic template and skill changed in candidate 31'
step 25-40ac1e066 'test(verify): register the browser smoke, Critic briefing builder and denial telemetry suites and assign their Verify surfaces'
step 26-ab2359eca 'docs: the recon note for the ADR draft at design close'
step 27-1c6d117a7 'docs: the recon note for the README and backlog scaffold'
step 28-dccabadca 'docs: the recon note for the bundle addendum and the Antigravity friction'
step 29-34d5d6ae4 'docs: the recon note for the main context input share'
step 30-444f9e5c0 'docs: the telemetry row texts name the Antigravity and Codex routes'
step 31-7fbfa1e66 'feat: the readiness reviewer asks one question about expensive decisions without an ADR reference'
step 32-a8b5f427a 'feat: the usage ledger timeline groups tool result bytes by script and refusal code'
step 33-44ebefba9 'feat: the preflight hints a stale origin HEAD before a worktree dispatch'
step 34-72da78042 'feat: the close commits the evidence follow-up itself and the close path pin is restated'
step 35-1cca98208 'feat: the token-only rows estimate the dollar half from labelled list prices'
step 36-583e4c174 'test(verify): list the case ids the grown guard, Critic course and Critic preflight suites declare'
step 37-bd06c422d 'fix(verify): the authorship verifier answers its usage outside a repository and the registry pins the grown Critic suites'

node scripts/refresh-derived-files.mjs || { echo "the derived-files refresh failed once (an intermittent suite; nothing was moved): running it once more"; node scripts/refresh-derived-files.mjs; }
git add -A -- docs plugins/pipeline-core backlog harness/config
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 31 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
