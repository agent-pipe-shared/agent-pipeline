#!/usr/bin/env bash
# PO apply script for candidate 29c: 51 held patches exported from the build clone chain 5d98a1082..64e8dfbcc
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate29c
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-f0fe17a13 'fix(close): ask the acceptance in the project language and accept a closed list of clear yes forms'
step 02-e68ce8e21 'fix(close): say an empty or unreadable v2 security plan as open, never as passed'
step 03-ecbce7085 'test(security): pin the public-identifier review for the audit-bundle copy'
step 04-544788f75 'fix(close): word the open v2 security scope without contradicting a passed scanner'
step 05-2cb44e56a 'fix(approval): wait for a human signature silently and label the time as PO wait'
step 06-e4c2607fa 'fix(audit): read every lineage segment whole and judge completeness by unread bytes and unknown children'
step 07-7506d7014 'fix(transcript-export): find Codex segments and children beyond the candidate bound by name and count unknown children'
step 08-ffe3f8a5e 'fix(transcript-export): open parent-linked children beyond the bound and type outside children'
step 09-728b2e5fe 'fix(dispatch-briefing): quote the printed heal command so it survives a shell'
step 10-606407b95 'fix(close): secret-check the close outputs before the irreversible State close'
step 11-4bba3bafe 'fix(dispatch-briefing): derive the Critic trigger'"'"'s security and guardrail flags from the write scope'
step 12-bb79d73cb 'docs(pipeline-start): name the mutable-artifact rebind as failure case F8'
step 13-4ed45c25a 'fix(goldfish-return): name trailing text after a complete final object as its own condition'
step 14-6e986b063 'fix(close): stop on an earlier blocker or major marked fixed without a reviewed code change'
step 15-508859cf9 'fix(critic-preflight): find the feature package of a Spec kept in its earlier dated folder'
step 16-643c90066 'fix(close): settle earlier Critic findings by addendum, verified residual and carried-open state'
step 17-6f7e7dd9b 'test(critic-preflight): drive the dated-folder Spec through admit, finalize and lineage registration'
step 18-89af5bab8 'feat(design-review): delta rounds until pass, and no presentation over an open review'
step 19-1da41d2f2 'feat(design-review): record the reviewer model from the host, label runners without a route'
step 20-12d0ef6cd 'test(design-review): native Claude review fixtures carry the host observation'
step 21-0b4a4bc22 'test(guard): a third design review round is admitted on present-plan'
step 22-fa839ba9b 'test(pins): resume-hint consume and query are admitted in their exact form'
step 23-a0ee0f5de 'fix(design-review): a background reviewer'"'"'s handback is the observed report'
step 24-daf3aa12c 'fix(guard): an agent'"'"'s own write never lands in .git/agent-pipeline'
step 25-e816e7846 'feat(present-plan): name how each review round'"'"'s reviewer model is known'
step 26-8e5410388 'fix(design-review): one observed review dispatch stamps one round'
step 27-e2df1df4a 'fix(guard): the lifecycle catalogue admits the typed fallback receipt form'
step 28-418b93fd3 'docs(runbook): export-report is a step of the design path'
step 29-346f1cf7f 'fix(design-review): export-report names why the last reviewer stop was not observed'
step 30-6d7707655 'fix(guard): a shell command never changes .git/agent-pipeline'
step 31-70b197305 'fix(design-review): an observation is bound to the PRD and Spec of its first receipt'
step 32-20a8e6a04 'docs(adr): ADR-0096 a gate-definition change needs a bound proof at commit and at close (D248)'
step 33-ba30ee381 'feat(guard): protect the boundary policy and the fitness model as gate-strength paths GS-16/GS-17'
step 34-b3a8ceac5 'fix(dispatch-briefing): count a table row as a criterion place only inside an acceptance table the host reads'
step 35-7afd79dab 'feat(writer-commit): materialize-architecture arms the fitness model commit through a closed writer-to-gate map'
step 36-d1759fc2e 'feat(close): derive the proof of every gate-definition change in the feature range'
step 37-571ac03f0 'feat(close): refuse an unproven gate-definition change and add the PO acknowledgement route'
step 38-3d1af1af3 'docs(adr): align ADR-0096 with the built walk, early readback and bundle item'
step 39-871d836ad 'fix(dispatch): admit framework route paths and pass every such path to git literally'
step 40-18c4aaae2 'fix(host-commit): restore the index after a refused whitespace check and name the generated-file route'
step 41-0abb8ee66 'fix(dispatch-budget): name the Critic'"'"'s one writable notes file on its first calls'
step 42-f40f533b1 'docs(adr): a pre-existing red check is repaired by a maintenance dispatch (ADR-0097, D249)'
step 43-8985a1b04 'docs(adr): ADR-0097 admits the configured verify as a maintenance check'
step 44-a3b95b612 'feat(maintenance): red observation, red-before proofs and the PO acknowledgement (ADR-0097)'
step 45-1eb397582 'feat(maintenance): observe, bind and admit a maintenance delivery (ADR-0097)'
step 46-0509e3a9b 'feat(close): require the repaired configured verify green at close (ADR-0097)'
step 47-0d2f9f990 'docs(adr): state ADR-0097 as built'
step 48-3b6539e90 'docs(governance): classify ADR-0096 and ADR-0097 as normative records'
step 49-57999d87f 'docs(inventory): categorize the four new Verify suites of candidate 29c'
step 50-1ce37f99b 'fix(guard): list the four kernel modules candidate 29c added'
step 51-64e8dfbcc 'test(agy-final-return): admit a framework route path as K-32 does'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 29c (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
