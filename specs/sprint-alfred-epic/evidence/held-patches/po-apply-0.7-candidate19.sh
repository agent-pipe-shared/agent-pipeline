#!/usr/bin/env bash
# Candidate 19 apply script (grows while candidate 19 is built; each held patch is one commit, in this order, then the derived files in ONE follow-up commit through
# scripts/refresh-derived-files.mjs). PO terminal, repository root. Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w115  the g23-read-help and agy-item-delivery suites no longer depend on the checkout location
#   w116  the draft inspection refuses an uncovered design scope before the PO signs (C18-12 follow-up)
#   w117  a bound-document drift names its cause and its two typed exits (C19-G3)
#   w118  routine-repair heal defers the retirement of settled pending states while a member is armed (C18-6 rest)
#   w119  the Full Verify keeps bounded logs of red suites and can resume an interrupted run
#   w123  the dispatch-briefing help audit passes in a checkout below the home directory
#   w122  the agent prints the authorize-critical line for deploy, publication and release-preflight (C19-G1, AC-140)
#   w124  Verify registration of the two new suites (continuity drift exits, Full Verify wrapper)
#   w125  the case-completion policy of the g23 read-help suite lists G23C004 (found by Full Verify 6)
#   w126  the Antigravity runner view maps the agent tools list to the runner's registry names (D1, AGY greenfield priority 1)
#   w127  the Antigravity pre-tool header names the real guard code of a refused native read (D5)
#   w128  the design surface refusal names the invalid entry and the submit-plan message carries the field detail (Q7, Claude greenfield)
#   w129  the security scan has a typed local-only mode and the push gate keeps refusing it (D8, AGY greenfield; Goldfish slice)
#   w129a the generated result record claims no stale state (F3/Q1, Codex and Claude greenfield)
#   w129b the critic report readback names the passing review (F6, Codex greenfield)
#   w130  the commit trailer refusal prints the accepted form and the shell refusal names the bare node spelling (D7, AGY and Codex greenfield)
#   w131  the shell guard refuses a node script that names the Pipeline control-plane directory (Q5, Claude Windows greenfield; Goldfish slice)
#   w132  the happy-path guide carries the critic preflight flags and the close transition shape (D6, AGY greenfield)
#   w133  the critic preflight path refusal names the rules and the signature hook says the agent imports the proof (Q10/E6, Claude Windows greenfield)
#   w134  the close readback checks every ADR path the design names, report-only (F4, Codex greenfield; Goldfish slice)
#   w135  the receipt of a caller-authored Critic verdict says freshContext false and carries its independence label (D2a, AGY greenfield; Goldfish slice, finished by the Elephant)
#   w136  the intake design plan warns when its generated text holds a private identifier (E5, Claude Windows greenfield; Goldfish slice, finished by the Elephant)
#   w137  a caller-authored Critic verdict satisfies the close gate only at rigor 0 and low risk (D2b, PO decision 2026-11-03; Goldfish slice; needs w135)
#   w139  the onboarding's own .gitattributes is admitted by the draft lifecycle (Q8, Claude Windows greenfield)
#   w140  the design skeleton states the module cut rule (M1.1, all three greenfield runs)
#   w141  the authority revision apply refusal names the missing proof check and the plan command (Q9, Claude Windows greenfield)
#   w142  the Goldfish task template says it is the field specification and the briefing is generated (E7 template part; the Critic template stays unchanged, it is in the pinned preimage)
#   w143  the fitness evaluation reports file and module size against optional sizeBudgets, report-only (M1.3, all three greenfield runs; Goldfish slice, imported by the Elephant)
#   w144  the readiness reviewer raises a decomposition question for a single module that carries several responsibilities (M1.2, all three greenfield runs)
#   w145  the happy path creates and commits the push threat model with the draft commit when the push gate requires approval (D4a, AGY greenfield; guidance only, no enforcement)
#   w146  the analysis-run command runs the registered verify command of a commit in a throwaway clone and records a labelled result (F2a, Codex greenfield; Goldfish slice, imported by the Elephant; the shell-guard admission F2b is NOT built)
#   w147  register the analysis-run lib and CLI suites (delta on w146)
#   w148  the shell guard admits the analysis-run command by its exact argument shape (F2b, Codex greenfield; Goldfish slice, imported by the Elephant; delta on w147)
#   w149  register the analysis-run admission suite (delta on w148)
#   w150  the happy path cuts the implementation dispatches along the design modules (M1.4, all three greenfield runs; guidance only; delta on w132 and w145)
#   w151  generate a machine-readable close-path runbook from the close chain tables and pin it with a drift test (C19-G5 stage 1; Goldfish slice, imported by the Elephant; nothing reads it at runtime yet)
#   w152  register the generate-runbook suite (delta on w151)
#   w153  F9 rest: a refused rg glob value is named in the refusal with the admitted filename-filter forms (no grammar change; Elephant-built)
#   w138  (OPT-IN, APPLY_AUTHORITY_CARRY=1) the design receipt of a closed predecessor feature is accepted when the design is equal (F1, Codex greenfield; ADR authority carry-forward point 1)
#   w120  (default, APPLY_LEAN_RULE=0 leaves out) Goldfish rule GF-10 and the Critic search item unrequested addition (B1, own definition)
#   w121  (default, with w120) the short rendering of GF-10 in the generated Goldfish briefing (B1)
# Afterwards the Elephant stamps, and the PO installs (only on the PO's word).
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19.sh   (repository root, clean tree, HEAD = the commit that carries this script)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog specs)
# One held patch, one commit; the subject is given inline (GIT-03 trailers only). --no-verify is used here and nowhere else.
step2() {
  # Idempotent: a patch whose exact commit subject is already in the history of HEAD was applied by an earlier run of this script and is skipped.
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  local patch="$H/$1.patch"
  if [ -f "$H/$1.rebased.patch" ]; then patch="$H/$1.rebased.patch"; fi
  git apply "$patch"
  git add -A -- "${STAGE[@]}"
  git commit --no-verify -m "$2" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
  echo "applied $1"
}
step2 w115-fv-make-the-g23-read-help-and-agy-item-delivery-suites-independent-of-the-checkout-location "test(verify): make the g23 read-help and agy item delivery suites independent of the checkout location"
step2 w116-c18-12-the-draft-inspection-refuses-an-uncovered-design-scope-before-the-po-signs "feat(architecture): refuse an uncovered design scope on the draft, before the PO signs"
step2 w117-c19-g3-a-drift-that-a-typed-command-lifts-is-never-worded-as-a-block "fix(continuity): name the cause and the two typed exits of a bound-document drift instead of reading as a dead end"
step2 w119-c19-the-full-verify-keeps-red-suite-logs-and-resumes-from-its-journal "feat(verify): keep bounded logs of red suites and resume an interrupted Full Verify from its journal"
step2 w118-c19-heal-defers-the-retirement-while-a-member-is-armed "fix(repair): defer the retirement of settled pending states while a dispatch's member is armed"
step2 w123-fv-the-dispatch-briefing-help-audit-passes-in-a-checkout-below-the-home-directory "test(dispatch): the help audit exempts the plugin's own source tree so a checkout below the home directory passes"
step2 w122-c19-g1-the-agent-prints-the-authorize-critical-line-for-deploy-publication-and-release-preflight "feat(auth): the agent prints the plugin-built authorize-critical line for deploy, publication and release-preflight"
step2 w124-c19-register-the-continuity-drift-exits-and-the-full-verify-wrapper-suites "chore(verify): register the continuity drift exits and the full verify wrapper suites"
step2 w125-c19-the-g23-read-help-case-completion-policy-lists-g23c004 "fix(verify): list G23C004 in the case-completion policy of the g23 read-help suite"
step2 w126-d1-the-agy-runner-view-maps-the-agent-tools-list-to-the-runner-registry-names "fix(agy): map the agent tools list to the runner registry names in the Antigravity runner view"
step2 w127-d5-the-agy-pretool-header-names-the-real-guard-code-of-a-refused-native-read "fix(agy): the pre-tool diagnostic header names the real guard code of a refused native read"
step2 w128-q7-the-design-surface-refusal-names-the-invalid-entry "fix(architecture): the design surface refusal names the invalid entry and the submit-plan message carries the field detail"
step2 w129-d8-the-security-scan-has-a-typed-local-only-mode-for-a-repository-without-a-remote "feat(security): the security scan has a typed local-only mode for a repository without a remote and the push gate keeps refusing it"
step2 w129a-f3-the-generated-result-record-claims-no-stale-state "fix(feature-package): the generated result record no longer claims an implementation state that stays bound after the close"
step2 w129b-f6-the-critic-report-readback-names-the-passing-review "fix(close): the critic report readback names the passing review, not the first report in listing order"
step2 w130-d7-guard-refusals-print-the-accepted-trailer-form-and-the-bare-node-spelling "fix(guard): the commit trailer refusal prints the accepted form and the shell refusal names the bare node spelling"
step2 w131-q5-a-scratch-script-that-names-the-pipeline-control-plane-is-refused "feat(guard): refuse a node script that names the Pipeline control-plane directory"
step2 w132-d6-the-happy-path-guide-carries-the-critic-preflight-flags-and-the-close-transition-shape "docs(happy-path): carry the flag set of the critic preflight and the shape of the close transitions"
step2 w133-e6-the-critic-preflight-path-refusal-names-the-rules-and-the-signature-hook-says-the-agent-imports-the-proof "fix(guard): the critic preflight path refusal names the rules and the signature hook says the agent imports the proof"
step2 w134-f4-the-close-readback-names-every-adr-path-the-design-promises "feat(close): the close readback checks every ADR path the design names, report-only"
step2 w135-d2a-a-caller-authored-critic-verdict-is-not-recorded-as-a-fresh-context-review "feat(critic): the receipt of a caller-authored verdict says freshContext false and carries its independence label"
step2 w136-e5-the-intake-design-plan-warns-when-its-text-holds-a-private-identifier "feat(intake): the intake design plan warns when its generated text holds a private identifier"
step2 w137-d2b-a-caller-authored-critic-verdict-satisfies-the-close-gate-only-at-rigor-0-and-low-risk "feat(close): a caller-authored Critic verdict satisfies the close gate only at rigor 0 and low risk"
step2 w139-q8-the-onboardings-own-gitattributes-is-admitted-by-the-draft-lifecycle "fix(guard): the onboarding's own .gitattributes is part of the scaffold the draft lifecycle admits"
step2 w140-m11-the-design-skeleton-states-the-module-cut-rule "feat(design): the design skeleton states the module cut rule and why a single module blocks parallel slices"
step2 w141-q9-the-authority-revision-apply-refusal-names-the-missing-proof-check "fix(state): the authority revision apply refusal without a PO proof check names what is missing and the plan command"
step2 w142-e7-the-goldfish-task-template-says-the-briefing-is-generated "docs(templates): the Goldfish task template says it is the field specification and the briefing is generated"
step2 w143-m13-the-fitness-evaluation-reports-size-budgets-without-blocking "feat(architecture): the fitness evaluation reports file and module size against optional sizeBudgets as a non-blocking advisory"
step2 w144-m12-the-readiness-reviewer-raises-a-decomposition-question "feat(readiness): the readiness reviewer raises a decomposition question for a single module that carries several responsibilities"
step2 w145-d4a-the-happy-path-materializes-the-push-threat-model-with-the-draft-commit "docs(happy-path): create and commit the push threat model with the draft commit when the push gate requires approval"
step2 w146-f2a-the-analysis-run-command-runs-the-registered-verify-command-in-a-throwaway-clone "feat(analysis): the analysis-run command runs the registered verify command of a commit in a throwaway clone and records a labelled result"
step2 w147-f2a-register-the-analysis-run-suites "chore(verify): register the analysis-run lib and CLI suites"
step2 w148-f2b-the-shell-guard-admits-the-analysis-run-command-by-its-exact-argument-shape "feat(guard): the shell guard admits the analysis-run command by its exact argument shape"
step2 w149-f2b-register-the-analysis-run-admission-suite "chore(verify): register the analysis-run admission suite"
step2 w150-m14-the-happy-path-cuts-implementation-dispatches-along-the-design-modules "docs(happy-path): cut the implementation dispatches along the modules of the design"
step2 w151-g5a-a-machine-readable-close-runbook-is-generated-from-the-close-chain-tables-and-pinned-by-a-drift-test "feat(runbook): generate a machine-readable close-path runbook from the close chain tables and pin it with a drift test"
step2 w152-g5a-register-the-generate-runbook-suite "chore(verify): register the generate-runbook suite"
step2 w153-f9-a-refused-rg-glob-value-is-named-with-the-admitted-forms "fix(guard): a refused rg glob value is named with the admitted filename-filter forms"
# OPT-IN block (PO decision 2026-11-03, authority carry-forward, ADR draft docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md; the revised ADR text has had one
# independent review and no second one yet). Off by default; apply with:  APPLY_AUTHORITY_CARRY=1 bash <this script>
if [ "${APPLY_AUTHORITY_CARRY:-0}" = "1" ]; then
  step2 w138-f1-a-closed-predecessors-design-receipt-is-accepted-for-the-next-feature-when-the-design-is-equal "feat(architecture): accept the design receipt of a closed predecessor feature when the design package and every target digest are equal"
else
  echo "skipped w138 (authority carry-forward block) because APPLY_AUTHORITY_CARRY is not 1"
fi
# The lean-change rule GF-10 (own definition, role files) and its short paragraph in the generated Goldfish briefing. PO decision 2026-11-03: adopt (measured on two past slices,
# 11 % and 31 % fewer changed lines, indicative). Applied by default; leave out with:  APPLY_LEAN_RULE=0 bash <this script>
if [ "${APPLY_LEAN_RULE:-1}" != "0" ]; then
  step2 w120-b1-the-goldfish-rule-gf-10-and-the-critic-search-item-unrequested-addition "docs(roles): add the Goldfish rule GF-10 (smallest complete change) and the Critic search item unrequested addition"
  step2 w121-b1-the-generated-goldfish-briefing-renders-the-smallest-complete-change-paragraph "feat(dispatch): render the smallest-complete-change paragraph (GF-10) in the generated Goldfish briefing"
else
  echo "skipped w120/w121 (lean-change rule GF-10) because APPLY_LEAN_RULE=0"
fi
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
