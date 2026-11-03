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
#   w120  (opt-in) Goldfish rule GF-10 and the Critic search item unrequested addition (B1, own definition)
#   w121  (opt-in) the short rendering of GF-10 in the generated Goldfish briefing (B1)
# Afterwards the Elephant stamps, and the PO installs (only on the PO's word).
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19.sh   (repository root, clean tree, HEAD = the commit that carries this script)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog specs)
# One held patch, one commit; the subject is given inline (GIT-03 trailers only). --no-verify is used here and nowhere else.
step2() {
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
# OPT-IN, not measured yet: the lean-change rule GF-10 (own definition, role files) and its short paragraph in the generated Goldfish briefing. The seed asks for a measurement
# on two or three past slices before adoption; apply only on the PO's word, with:  APPLY_LEAN_RULE=1 bash <this script>
if [ "${APPLY_LEAN_RULE:-0}" = "1" ]; then
  step2 w120-b1-the-goldfish-rule-gf-10-and-the-critic-search-item-unrequested-addition "docs(roles): add the Goldfish rule GF-10 (smallest complete change) and the Critic search item unrequested addition"
  step2 w121-b1-the-generated-goldfish-briefing-renders-the-smallest-complete-change-paragraph "feat(dispatch): render the smallest-complete-change paragraph (GF-10) in the generated Goldfish briefing"
else
  echo "skipped w120/w121 (lean-change rule GF-10, opt-in, not measured): set APPLY_LEAN_RULE=1 to apply"
fi
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
