#!/usr/bin/env bash
# PO apply script for candidate 28e: 41 held patches exported from the build clone chain d97861aad..6653ab12a
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate28e
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-e99c9697d 'fix(sbom): remove the false blocks and passes of the JVM, .NET and private-registry readers'
step 02-ec8f89505 'docs(sbom): amend ADR-0091 with the reader corrections and the Maven parent-bump limit'
step 03-0637620da 'feat(sbom): read the packages.config of .NET Framework projects at the close'
step 04-a445337f0 'fix(sbom): keep a yarn v1 range overridden to a git source partial'
step 05-018bb7c45 'docs(sbom): name the yarn resolutions case in the ADR-0091 amendment'
step 06-eb08575c4 'feat(toolchain): one tool registry, its document and the deferral of a required tool'
step 07-16be7a528 'docs(toolchain): point SETUP and the docs index at the generated tool list'
step 08-528e4345d 'feat(onboarding): ask for the required tools at the first install, with a deferral'
step 09-57fb4c75c 'docs(adr): accept ADR-0092, the tool registry asked for at onboarding'
step 10-28fda7c87 'feat(security): block a Semgrep finding only when the feature introduced it'
step 11-49bdb16a8 'docs(adr): accept ADR-0093, a Semgrep finding blocks only when new'
step 12-9b78c9b01 'test(onboarding): copy the Semgrep baseline closure into the SECGATE-2 fixture'
step 13-ab6b9157f 'feat(security): ship a Semgrep pack per language whose severe classes block'
step 14-056c7b0df 'fix(security): keep the Semgrep language pack quiet on checked and harmless code'
step 15-7a8f31524 'docs(adr): record ADR-0094, the Semgrep default pack blocks the severe classes in eight languages'
step 16-559d71447 'fix(lifecycle): refuse a feature id at set-feature that the design chain refuses later'
step 17-d26b8b2dc 'fix(critic): admit the receipt-bound Critic export inside a one-shot close commit'
step 18-d8d2d5653 'fix(security): record a shipped Semgrep rule by its own id, not the install path'
step 19-72b8025e2 'fix(design): name an uncommitted design source before the approval request exists'
step 20-cdd6dc3df 'feat(security): admit a reviewed public identifier for gitleaks generic-api-key'
step 21-cf8bec2a9 'fix(close): carry a dispatch briefing in the close projection as its digest only'
step 22-308d089ae 'fix(architecture): report class 9 as unmeasured for a design-package adoption'
step 23-69ed70eb8 'fix(package): supersede a not-yet-verified package on re-approval and keep its evidence'
step 24-addbc9b5e 'fix(package): carry the approved PRD and Spec at their approved path'
step 25-fb4f19885 'docs(adr): amend ADR-0045, the package carries the approved PRD and Spec where they were approved'
step 26-1dddc32ec 'fix(security): admit the public-identifier class only for a finding in a Pipeline record'
step 27-842d397eb 'fix(design): retain every non-re-derived manifest entry when an approval supersedes the package'
step 28-066fa0ad8 'fix(design): render the Critic review unit anew when the approved Spec names other criterion ids'
step 29-60dff77e3 'fix(design): keep a review unit bound to a running Critic course instead of rendering it anew'
step 30-2a133b22f 'docs(adr): accept ADR-0095, a Spec correction during implementation is a signed addendum'
step 31-77004cec8 'feat(design): add the Spec addendum'"'"'s one definition (ADR-0095)'
step 32-676c7426f 'feat(design): approve a Spec addendum in the configured human-approval mode (ADR-0095)'
step 33-c748dc19e 'feat(design): register an approved Spec addendum in the feature package (ADR-0095)'
step 34-23359531c 'fix(critic): a Spec addendum is never close evidence (ADR-0095)'
step 35-d87c63f74 'feat(close): the feature close requires every Spec addendum to be approved and reviewed (ADR-0095)'
step 36-abf7fa85c 'fix(design): make lib/spec-addendum.mjs a leaf module (ADR-0095)'
step 37-41bf4f051 'feat(dispatch): the Goldfish briefing names the approved Spec addenda (ADR-0095)'
step 38-7483b2ea9 'docs(adr): state ADR-0095 as built (who runs what, order, coverage)'
step 39-20714b90d 'fix(design): skip a candidate source that is in neither the commit nor the tree'
step 40-c1462422d 'feat(guard): make reopen-design the PO'"'"'s own step'
step 41-6653ab12a 'test(verify): register the two Spec addendum suites'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 28e (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
