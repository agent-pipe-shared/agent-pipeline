#!/usr/bin/env bash
# Candidate 19c apply script (grows while the rest of candidate 19 is built on top of the stamped interim candidate 19a, commit 6193380d0; each held patch is one commit, in this
# order, then the derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md, section "PO decisions of the 2026-11-04 sitting".
#   w138  (PO decision 2026-11-04: now default, no opt-in) a closed predecessor's design receipt is accepted when the design is equal (F1)
#   w162  (PO decision 2026-11-04: now default, no opt-in) a Verify or Security record is carried across evidence-only commits (D4b/E3 step 3)
#   w190  the control-plane scan module and the push gate path modules are registered in the guard split map, the never-liftable kernel paths and the threat model (found by the regression suites)
#   w165  a pending-unavailable Goldfish stop failure names its cause and the recover helper plan and apply command (E1 text part; Windows greenfield)
#   w166  one shared reader of the bound authority documents returns sealed and digests (late-binding build step 1a; inert, no reader moves onto it yet)
#   w171  the managed pre-push hook and the security completeness gate take the shared freshness verdict; the carry-forward is active (D4b/E3 rest)
#   w173  the Critic evidence of an earlier reviewed commit stays valid across administration and documentation only commits (PO decision 2026-11-04, carry-forward open question 2)
#   w167  a signed feature-package reconcile commits exactly its own files with one commit capability; the close steps before the ceremony leave a clean tree (D3)
#   w191  the d3 signed reconcile suite is categorized in the product capability inventory (found by the registration checker)
#   w168  Windows authority failures name path and cause and repair; the preflight probes close and push and reports the bootstrap facts (E2, Q10 node half, W1, W2, W7)
#   w172  the failed path travels in the PowerShell failure envelope (helper re-pinned), the security probes retry once on EPERM, the handover stays consistent, a launch retries on contention (Q10 ps1 half, W3, W6, E4)
#   w169  the PowerShell guard admits what the Bash guard admits and its refusals name the way out (E7 PowerShell part, W4, W5)
#   w170  one typed orchestrator commit helper: check, commit with the trailer, write the dispatch record (E1 second half)
#   w177  the continuity schema accepts the draft authority and the core readers move onto the shared seal reader (late-binding build step 2)
#   w179  the guard admits PRD and Spec edits in the draft state, the remaining authority readers follow the draft, the Critic preflight binds the digest it read (late-binding build step 3)
#   w174  the audit bundle binds proofs, release Verify and Security scan to the candidate; a read-only trace proves every human approval back to the human (Q3)
#   w175  generated runbooks for the start, plan, implement, close and push paths and a typed runbook link in the first call of each standard command (G5)
#   w176  the push threat model gate refuses at plan approval, push preparation and feature close when a push approval is active; the briefing tool derives each module slice's write scope and refuses a scope that crosses the module cut (D4a, M1.4)
#   w193  the push-init delivery anchor fixture materializes the push threat model that the new gate requires (found by the push-init suite on the chain)
#   w194  the SECGATE-2 installed-plugin fixture copies the shared evidence freshness module that the security completeness gate now imports (found by the D4a sweep on the chain)
#   w180  the seal is prepared as one digest-bound plan (prepare-seal) and applied with the plan approval (late-binding build step 4; ordered after w192 so that the kernel pins it extends are in place)
#   w181  onboarding leaves an unsealed draft in the EL-19 scope, the seal situation readback, a repair for every seal state, the verifiers accept the seal plan digest (late-binding build step 5; a delta on w180, ordered right after it)
#   w195  the onboarding continuity case-completion policy lists the three LB5 cases (found by the first Full Verify of the whole chain)
#   w196  the runbooks name no source-only path and the vendored push-release-flow copy follows its original (found by the first Full Verify of the whole chain)
#   w197  the host-commit recovery message pins and the present-plan duplicate-check mirror are restated after w170 and w180 (found by the first Full Verify of the whole chain)
#   w198  the analysis-run command is named in the implementation continuation reference (found by the first Full Verify of the whole chain; the defect predates the chain)
#   w199  the remote identity case expects the typed local-only subject of a repository without a remote (red in the main tree too; found by the first Full Verify)
#   w200  the finalizer regression case-completion policy lists NGHF08 that w165 added (found by re-reading the red excerpt of the first Full Verify)
#   w201  the suite history check admits several recorded case-list extensions (PO decision 2026-11-04), records 7281e012c and w160's 4ec6622a2, and w175/w176 no longer rewrite registry rows
#   w202  the protected Critic preimage is re-pinned to the current critic-review skill and roles/critic.md (explicit one-time PO decision 2026-11-04)
#   w203  the key-shaped fixtures and the PEM armor markers are built at run time, so the Security scan has no unsuppressed finding (the review gate cannot take these values; the two archive patches w43 and w45 are edited in place)
#   w204  Q2 and F9: the unsupported-read refusal names the admitted spelling for a refused ls flag (a protected directory is listed as names only), and for a short-flag cluster such as rg -ln (given flag by flag), each only when the grammar itself admits it
#   w192  the never-liftable kernel paths list the modules that the whole chain adds (seal reader, carry-forward reader and decision, gitleaks adapter, probe retry) and the pre-push hook import table is restated (found by the kernel closure suite on the whole chain)
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19c.sh   (repository root, clean tree, HEAD = the commit that carries this script)
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
# A change whose patch would carry the very literals it removes (and so bring the Security scan findings back) is held as a script: <stem>.apply.mjs, run from the repository root.
stepjs() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  node "$H/$1.apply.mjs"
  git add -A -- "${STAGE[@]}"
  git commit --no-verify -m "$2" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
  echo "applied $1 (script)"
}
step2 w138-f1-a-closed-predecessors-design-receipt-is-accepted-for-the-next-feature-when-the-design-is-equal "feat(architecture): accept the design receipt of a closed predecessor feature when the design package and every target digest are equal"
step2 w162-d4b-stage-3-a-verify-or-security-record-is-carried-across-evidence-only-commits-opt-in "feat(push): a Verify or Security record is carried across evidence-only commits by the push guard and push-prepare, behind the opt-in block"
step2 w165-e1-a-pending-unavailable-stop-failure-names-its-cause-and-the-recover-helper "fix(hook): a pending-unavailable Goldfish stop failure names its cause and the recover helper plan and apply command"
step2 w166-late-binding-step-1a-one-shared-reader-of-the-bound-authority-returns-sealed-and-digests "feat(authority): one shared reader of the bound authority documents returns sealed and digests, inert until the readers move onto it"
step2 w190-fix-the-control-plane-scan-module-and-the-push-gate-path-modules-are-registered-in-the-guard-pins "fix(guard): the control-plane script scan module and the push gate path modules are listed in the split map, the never-liftable kernel paths and the threat model"
step2 w171-d4b-the-pre-push-hook-and-the-security-gate-take-the-shared-freshness-verdict-and-the-carry-forward-is-on "feat(push): the managed pre-push hook and the security completeness gate take the shared freshness verdict and the carry-forward of Verify and Security across evidence-only commits is active"
step2 w173-critic-evidence-of-an-earlier-commit-stays-valid-across-administration-and-documentation-only-commits "feat(push): the Critic evidence of an earlier reviewed commit stays valid across administration and documentation only commits in the close gate, the registration delta course and the push-prepare readback"
step2 w167-d3-a-signed-reconcile-commits-its-own-files-and-the-close-chain-leaves-a-clean-tree-before-the-ceremony "feat(close): a signed feature-package reconcile commits exactly its own files with one commit capability and the close steps before the ceremony leave a clean tree"
step2 w191-register-the-d3-signed-reconcile-suite-in-the-capability-inventory "fix(inventory): register the d3 signed reconcile commit suite in the product capability inventory"
step2 w168-win-authority-failures-name-path-and-cause-and-the-preflight-probes-the-platform "feat(windows): authority failures name the path, the cause and the repair, and the preflight probes close and push and reports the bootstrap facts"
step2 w172-win-rest-the-failed-path-in-the-powershell-envelope-eperm-retry-the-handover-consistency-and-the-slicing-hint "feat(windows): the failed path travels in the PowerShell failure envelope, the security probes retry once on EPERM, the handover stays consistent and a launch retries on contention"
step2 w169-ps-the-powershell-guard-admits-what-the-bash-guard-admits-and-its-refusals-name-the-way-out "feat(guard): the PowerShell guard admits what the Bash guard admits and its refusals name the way out"
step2 w170-e1-one-typed-orchestrator-commit-helper-checks-commits-with-the-trailer-and-writes-the-dispatch-record "feat(dispatch): one typed orchestrator commit helper checks a Goldfish diff, commits it with the trailer and writes the dispatch record"
step2 w177-lb2-the-continuity-schema-knows-the-draft-state-and-the-core-readers-move-onto-the-shared-seal-reader "feat(authority): the continuity schema accepts the draft authority and the core readers of the bound authority move onto the shared seal reader"
step2 w179-lb3-the-remaining-authority-readers-the-guard-tripwire-and-the-review-digests-follow-the-draft-state "feat(authority): the guard admits PRD and Spec edits in the draft state, the remaining authority readers follow the draft and the Critic preflight binds the digest of the bytes it read"
step2 w174-q3-the-audit-bundle-binds-the-signature-proofs-and-every-human-approval-traces-back-to-the-human "feat(audit): the audit bundle binds the signature proofs, the release Verify and the Security scan to the candidate and a read-only trace proves every human approval back to the human"
step2 w175-g5-runbooks-of-every-lifecycle-path-and-the-runbook-link-in-the-first-call "feat(runbook): generated runbooks for the start, plan, implement, close and push paths and a typed runbook link in the first call of each standard command"
step2 w176-d4a-push-threat-model-gate-and-m14-module-scopes-derived-and-enforced "feat(gates): the push threat model gate refuses at plan approval, push preparation and feature close when a push approval is active and the briefing tool derives and enforces the write scope of a module slice"
step2 w193-the-push-init-delivery-anchor-fixture-materializes-the-push-threat-model "test(push-init): the delivery anchor fixture materializes the push threat model that the push gate now requires when a push approval is active"
step2 w194-secgate2-fixture-copies-the-shared-evidence-freshness-module "test(onboarding): restate the SECGATE-2 installed-plugin fixture copy map for the shared evidence freshness module (QG-04)"
step2 w192-the-kernel-closure-lists-the-modules-that-the-whole-chain-adds "fix(guard): list the seal reader, the carry-forward reader and decision, the gitleaks adapter and the probe retry in the never-liftable kernel paths and restate the pre-push hook dynamic import table to its twelve call sites"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
step2 w180-lb4-the-seal-is-prepared-as-one-digest-bound-plan-and-applied-with-the-plan-approval "feat(late-binding): the seal is prepared as one digest-bound plan and applied with the plan approval, and the seal plan suite and module are registered in the kernel pins"
step2 w181-lb5-onboarding-leaves-a-draft-in-scope-bound-projects-migrate-every-state-has-a-repair "feat(late-binding): onboarding leaves an unsealed draft in the EL-19 scope, the seal situation readback and the repair of every seal state, and the verifiers of a signed design approval accept the seal plan digest"
step2 w195-lb5-case-completion-policy "fix(candidate-19c): extend the onboarding continuity case-completion policy by the three LB5 cases (OBC325-327)"
step2 w196-runbook-consumer-paths-and-vendored-flow "fix(candidate-19c): runbooks name no source-only path and the vendored push-release-flow copy follows its original"
step2 w197-restated-host-commit-message-pins-and-present-plan-mirror "fix(candidate-19c): restate the host-commit recovery message pins and the present-plan duplicate-check mirror after w170 and w180"
step2 w198-the-analysis-run-command-is-named-in-the-implementation-reference "fix(candidate-19c): name the analysis-run command in the implementation continuation reference so the entry point reachability check finds it"
step2 w199-remote-identity-case-for-the-local-only-subject "test(security): restate the remote identity case for the typed local-only subject of a repository without a remote (QG-04)"
step2 w200-finalizer-regression-case-completion-policy "fix(candidate-19c): extend the finalizer regression case-completion policy by NGHF08"
step2 w201-the-suite-history-check-admits-several-recorded-extensions "fix(verify): admit several recorded case-list extensions (and a first case-completion policy) in the suite history check; record 7281e012c and 4ec6622a2"
step2 w202-critic-preimage-repin "fix(critic): re-pin the protected Critic preimage to the current critic-review skill and roles/critic.md (PO decision 2026-11-04)"
stepjs w203-key-shaped-fixtures-and-pem-markers-built-at-run-time "fix(security): build the key-shaped fixtures and the PEM armor markers at run time so the secret scan sees no literal"
step2 w204-refusal-texts-name-the-admitted-listing-and-flag-spelling "fix(guard): a refused ls flag, a combined short-flag cluster and a protected-directory listing name the admitted spelling in the refusal (Q2, F9)"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19c (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
