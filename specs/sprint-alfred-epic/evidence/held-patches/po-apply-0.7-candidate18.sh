#!/usr/bin/env bash
# Candidate 18 (the first greenfield findings, parallel Goldfish host commits, signing parity and the Antigravity runner): the held patches listed below, one commit
# each, in this order, then the derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs. PO terminal, repository root.
# Where a <name>.rebased.patch exists beside <name>.patch, the rebased variant is applied: it is the same change resolved for this chain order (w75, w92, w94, w96-a18-m6, w99).
#   w74   the verify evidence producer                              w75   configure-verify named (rebased)
#   w76   host-commit diagnostics                                   w77   host-commit recover command
#   w90   parallel Goldfish host commits tolerate a moved head      w95   host observation accepts a commit on a moved head
#   w96-c18-1e  attempt terminal binding accepts the moved-head lineage   w97   a routine repair keeps a pointer from the moved record
#   w102  test-first evidence in the Goldfish return                w79   close drive names every PO action
#   w93   push threat model listed before the close commit          w98   close-time quality readback and audit index
#   w103  the drive names an already closed lifecycle               w80   refusal texts name flag, path and example
#   w81   Windows directory fsync is a warning                      w82   conventional-commit prints the guard-conformant trailers
#   w83   signing refused before the prompt                         w100  every critical signing kind mirrors its proof
#   w105  signing preparation parity audit                          w106  every runner prepares the signing itself, hands over the sign-off
#   w84   Antigravity native implementation admission               w85   ruleset identity in the briefing build
#   w94   optional visual check in the briefing (rebased)           w99   briefing generator knows the Antigravity runner (rebased)
#   w107  build and probe know the Antigravity runner               w86   an edit to an approved design source is denied up front
#   w87   intake capture prints the text-file form                  w92   remaining intake refusals point to it (rebased)
#   w89   inspect names the approving instance                      w91   scope mismatch refusal names the required coverage
#   w96-a18-m6  observation boundary row and carrier prepare command (rebased)   w101  Antigravity refusal texts name the way forward
#   w104  first consent names what is installed and activated, hooks follow the promotion      w108  registration of four suites, vendored operating-model refresh (LAST)
# Afterwards the Elephant refreshes the hooks, stamps, and the PO installs (only on the PO's word).
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate18.sh   (repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w74-c18-3-verify-producer "feat(verify): add the verify evidence producer (C18-3)"
step2 w75-c18-2-configure-verify-named "fix(verify): name the configure-verify step in its refusals (C18-2)"
step2 w76-c18-1a-host-commit-diagnostics "feat(dispatch): add host-commit diagnostics for a Goldfish stop (C18-1a)"
step2 w77-c18-1b-host-commit-recover "feat(dispatch): add the host-commit recover command (C18-1b)"
step2 w90-c18-1c-parallel-goldfish-host-commits-tolerate-a-moved-head "fix(dispatch): let parallel Goldfish host commits tolerate a moved head (C18-1c)"
step2 w95-c18-1d-the-host-observation-accepts-a-commit-on-a-moved-head "fix(dispatch): accept a host observation of a commit on a moved head (C18-1d)"
step2 w96-c18-1e-the-attempt-terminal-binding-accepts-the-typed-moved-head-lineage "fix(dispatch): accept the typed moved-head lineage in the attempt terminal binding (C18-1e)"
step2 w97-c18-18b-a-routine-repair-keeps-a-pointer-from-the-moved-record-to-the-commit "fix(repair): keep a pointer from the moved record to the commit in a routine repair (C18-18b)"
step2 w102-c18-19-the-goldfish-return-carries-test-first-evidence-and-the-record-flags-its-absence "feat(dispatch): carry test-first evidence in the Goldfish return and flag its absence (C18-19)"
step2 w79-c18-4-close-drive-names-every-po-action "feat(close): name every PO action in the close drive (C18-4)"
step2 w93-a18-m5-the-close-lists-the-push-threat-model-before-the-close-commit "feat(close): list the push threat model before the close commit (A18-M5)"
step2 w98-c18-10-close-time-quality-artefact-readback-and-audit-index "feat(close): add the close-time quality readback and the audit index (C18-10)"
step2 w103-drive-names-an-already-closed-lifecycle "fix(close): name an already closed lifecycle in the drive message"
step2 w80-c18-8-refusal-texts-name-flag-path-and-example "fix(refusals): name flag, path and example in refusal texts (C18-8)"
step2 w81-c18-6-windows-directory-fsync-is-a-warning "fix(session): treat a failed Windows directory fsync as a warning (C18-6)"
step2 w82-c18-7-conventional-commit-prints-the-guard-conformant-trailer-set "fix(commit): print the guard-conformant trailer set in conventional-commit (C18-7)"
step2 w83-a18-m2-signing-refused-before-the-prompt-and-push-remedy-named "fix(sign): refuse signing before the prompt and name the push remedy (A18-M2)"
step2 w100-c18-11-every-critical-signing-kind-mirrors-its-proof-where-the-agent-can-read-it "feat(sign): mirror every critical signing kind's proof where the agent can read it (C18-11)"
step2 w105-c18-21-signing-preparation-parity-audit-across-the-runners "docs(sign): add the signing preparation parity audit across the runners (C18-21)"
step2 w106-c18-22-every-runner-is-told-to-prepare-the-signing-itself-and-hand-over-only-the-sign-off "fix(sign): tell every runner to prepare the signing itself and hand over only the sign-off (C18-22)"
step2 w84-a18-b1-agy-native-implementation-admission-and-carrier-names "feat(agy): add the Antigravity native implementation admission and the carrier names (A18-B1)"
step2 w85-c18-9-ruleset-identity-and-version-in-the-briefing-build "feat(dispatch): print the ruleset identity and version in the briefing build (C18-9)"
step2 w94-c18-15-an-optional-visual-check-in-the-goldfish-briefing "feat(dispatch): add an optional visual check to the Goldfish briefing (C18-15)"
step2 w99-a18-m1b-the-briefing-generator-knows-the-antigravity-runner-and-prints-accepted-aliases "feat(dispatch): let the briefing generator know the Antigravity runner and print the accepted aliases (A18-M1b)"
step2 w107-a18-m1c-build-and-probe-know-the-antigravity-runner "feat(dispatch): let build and probe know the Antigravity runner (A18-M1c)"
step2 w86-c18-13-an-edit-to-an-approved-design-source-is-denied-up-front "fix(guard): deny an edit to an approved design source up front (C18-13)"
step2 w87-c18-14-the-intake-capture-prints-the-working-text-file-form "fix(intake): print the working text-file form in the intake capture (C18-14)"
step2 w92-c18-14b-the-remaining-intake-refusals-point-to-the-text-file-form "fix(intake): point the remaining intake refusals to the text-file form (C18-14b)"
step2 w89-c18-5-inspect-names-the-approving-instance-of-a-confirmation-action "fix(onboarding): name the approving instance of a confirmation action in inspect (C18-5)"
step2 w91-c18-12-the-scope-mismatch-refusal-names-the-required-coverage "fix(guard): name the required coverage in the scope mismatch refusal (C18-12)"
step2 w96-a18-m6-honest-observation-boundary-row-and-carrier-prepare-command "fix(runner): add the honest observation boundary row and the carrier prepare command (A18-M6)"
step2 w101-agy-refusal-texts-name-the-way-forward "fix(agy): make the Antigravity refusal texts name the way forward"
step2 w104-c18-20-the-first-consent-names-what-is-installed-and-activated-and-the-mandatory-hooks-follow-the-promotion "feat(onboarding): name what is installed and activated in the first consent and hand over the mandatory hooks after the promotion (C18-20)"
step2 w108-register-the-four-new-suites-and-refresh-the-vendored-operating-model-copy "chore(verify): register the four new suites and refresh the vendored operating-model copy"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 18 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
