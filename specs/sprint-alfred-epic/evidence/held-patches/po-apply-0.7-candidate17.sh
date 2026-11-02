#!/usr/bin/env bash
# Candidate 17 (runner neutrality and the first consumer-run findings): the held patches listed below, one commit each, in this order, then the derived files in ONE
# follow-up commit through scripts/refresh-derived-files.mjs. PO terminal, repository root.
#   w48   close warns about content commits after the last Critic round
#   w49-a a blocked planning fitness names its blocking classes
#   w49-b three close refusals name their cause and the next step
#   w50   the Full Verify clone lives outside the verified repository
#   w51   the guard admits the ceremony readers, the fitness probe, set-feature and the Windows root spelling
#   w52   the attested record works for Codex (declared-unobserved model) and a directory scope resolves to exact files
#   w53   the closing session's own descriptor is derived for the runner that is closing
#   w54   the tool budget says per runner whether anything counts it (w54 needs w52 applied first)
#   w55   the guard admits refreeze-plan and the pre-restart resume-hint capture (w55 needs w51 applied first)
#   w56   the AGY guard stays inside the host's hook timeout, admits the proof-bearing approve-plan routes and ignores quoted node -e text
#   w57   a design signature is refused before the prompt while pipeline.user.yaml is not part of HEAD
#   w58   the AGY child gets no stdin, its own process group and a SIGKILL after the bounded timeout
#   w59   four close refusals name the request shape, the verbs, the evidence binding and the admitted package steps
#   w60   an AGY-hosted Elephant is told honestly what it can dispatch; read-only carriers named (after w56)
#   w61   a forward-slash --root is normalised on win32 before the strict physical-path checks (two entries)
#   w62   the closed-local cleanup refusal and the origin-unavailable refusal name their repair
#   w63   two Claude-only statements in the close and push docs name their runner scope
#   w64   a profile-drift block says it is a repository state and names the adoption renewal (needs w49-a applied first)
#   w65   the happy-path command chain per runner is a lazily loaded start reference (PO request of 2026-11-01)
#   w66   the signature-mode override offer says to repeat the identical call after the signature
#   w67   the budget-grant refusal says the counter is Claude-only and names the route on the other runners
#   w68   the happy-path guide carries a sourced per-runner differences table (needs w65 applied first)
#   w69   the design-course-session CLI normalises a forward-slash root on win32 (needs w61 applied first)
#   w70   the runner capability table is one JSON source, and the suites added by w61, w65 and w70 are registered (needs w61/w65/w68/w69)
#   w71   three outgrown case-completion counts are restated, the happy-path pin stays unclassified and the vendored push-release-flow copy is refreshed (needs w63/w65/w67/w70)
#   w72   the start preflight carries a pointer to the runner capability table, not the table (PO decision 2026-11-02; needs w70)
#   w73   close-coordinator.mjs gets a drive helper over its plan/apply pairs (PO decision 2026-11-02; needs w59/w62/w65, LAST)
# Afterwards the Elephant refreshes the hooks, stamps, and the PO installs (only on the PO's word).
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate17.sh   (repository root, clean tree, HEAD = the commit that carries this script)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog)
# One held patch, one commit; the subject is given inline (GIT-03 trailers only). --no-verify is used here and nowhere else.
step2() {
  git apply "$H/$1.patch"
  git add -A -- "${STAGE[@]}"
  git commit --no-verify -m "$2" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
  echo "applied $1"
}
step2 w48-a-close-warns-about-content-after-the-last-critic "fix(close): warn at the freeze about content commits after the last Critic round"
step2 w49-a-blocked-planning-fitness-names-the-blocking-classes "fix(architecture): name the blocking classes of a blocked planning fitness"
step2 w49-b-refusals-name-their-cause-and-the-next-step "fix(close): give three refusals their cause and the next step"
step2 w50-a-full-verify-clone-lives-outside-the-verified-repository "docs(tools): say where the Full Verify clone has to live"
step2 w51-a-guard-admits-the-ceremony-readers-and-the-windows-root-spelling "fix(guard): admit the ceremony readers, the fitness probe, set-feature and the Windows root spelling"
step2 w52-a-the-attested-record-works-for-codex-and-directories-resolve-to-files "fix(dispatch): let the attested record work for Codex and resolve a directory scope to exact files"
step2 w53-a-close-own-session-per-runner "fix(close): derive the closing session's own descriptor for the runner that is closing"
step2 w54-a-budget-enforcement-is-read-back-per-runner "fix(dispatch): tell a briefing whether anything counts its tool budget on its runner"
step2 w55-a-guard-admits-refreeze-plan-and-the-resume-hint-capture "fix(guard): admit refreeze-plan and the pre-restart resume-hint capture"
step2 w56-a-agy-guard-budget-approve-plan-routes-and-quoted-text "fix(guard): bound the AGY hook inside the manifest timeout, admit the proof-bearing approve-plan routes and ignore quoted node -e text"
step2 w57-a-design-signature-refused-before-the-prompt-while-the-mode-file-is-uncommitted "fix(sign): refuse a design signature before the prompt while the approval mode file is not part of HEAD"
step2 w58-a-agy-child-has-no-stdin-and-is-killed-after-the-timeout "fix(dispatch): give the AGY child no stdin, its own process group and a SIGKILL after the bounded timeout"
step2 w59-a-four-close-refusals-name-the-request-shape-the-verbs-and-the-admitted-steps "fix(close): name the closed request shape, the verbs, the evidence binding fields and the admitted package steps in four refusals"
step2 w60-a-agy-hosted-elephant-dispatch-is-described-honestly-and-the-read-only-carriers-are-named "fix(dispatch): say honestly what an Antigravity-hosted Elephant can dispatch, name the admitted read-only carriers and end the parent turn after a native review dispatch"
step2 w61-a-forward-slash-root-is-normalised-on-win32-before-the-strict-physical-path-checks "fix(paths): normalise a forward-slash --root on win32 before the strict physical-path checks of the dispatch-recovery and owner-route entries"
step2 w62-a-closed-local-cleanup-and-the-origin-unavailable-refusals-name-their-repair "fix(close): name the cleanup status, the receipt verb and the caller-authored opt-in in two refusals"
step2 w63-a-two-claude-only-statements-in-the-close-and-push-docs-name-their-runner-scope "docs(runner): state that the usage-ledger reader and the push classifier gate are Claude-specific and what the other runners do"
step2 w64-a-profile-drift-block-says-it-is-a-repository-state-and-names-the-adoption-renewal "fix(architecture): say in words that a profile-drift block is a repository state and name the adoption renewal route"
step2 w65-a-happy-path-command-chain-per-runner-is-a-lazily-loaded-start-reference "docs(start): add the ordered happy-path command chain per runner as a lazily loaded reference"
step2 w66-a-override-offer-says-to-repeat-the-identical-call-after-the-signature "fix(guard): tell the agent to repeat the identical denied call after the PO signs and that an interleaved commit voids the request"
step2 w67-a-budget-grant-refusal-says-the-counter-is-claude-only-and-names-the-other-route "fix(dispatch): say in the budget-grant refusal that only a Claude dispatch has a counter and what to do on the other runners"
step2 w68-a-happy-path-guide-carries-a-sourced-per-runner-differences-table "docs(start): add the sourced per-runner differences table to the happy-path guide"
step2 w69-a-design-course-session-cli-normalises-a-forward-slash-root-on-win32 "fix(paths): normalise a forward-slash --root and --plugin-root in the design-course-session CLI before its strict checks"
step2 w70-a-runner-capability-table-is-one-json-source-and-the-new-suites-are-registered "feat(runner): add the sourced per-runner capability table as one JSON source and register the three new suites"
step2 w71-a-case-completion-counts-restated-and-the-happy-path-pin-stays-classified "fix(verify): restate three outgrown case-completion counts and keep the happy-path pin out of the vulnerable-suite classification and refresh the vendored push-release-flow copy"
step2 w72-a-preflight-carries-a-pointer-to-the-runner-capability-table "feat(start): carry a pointer to the runner capability table in the preflight readback"
step2 w73-a-close-coordinator-drive-helper-over-the-plan-apply-pairs "feat(close): add the drive helper over the close coordinator plan/apply pairs"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 17 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
