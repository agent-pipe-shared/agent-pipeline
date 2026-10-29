---
schema: pipeline.backlog-item.v1
id: pipeline.p0-p1-findings-round-3-toolbox-and-glossover
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-27
sprint: alfred
source: "PO intake message and the consumer hand-overs of 2026-10-27 (see the item body)"
done_when: manual
---

# P0 and P1 findings, round 3: Toolbox D31-D52 and Glossover PF-82..PF-86

Status: intake 2026-10-27 (PO message in the running session). Only P0 and P1 are taken into the delivery matrix; P2/P3 and low items (Toolbox D53 to D55, Glossover PF-87) stay here as a list and are not matrix rows.

Sources: the Toolbox hand-over of 2026-10-27 (P0/P1 list) and the Glossover feedback file 06 (PF-82 to PF-87 and the PF-82/PF-83 addenda). No local paths, accounts or project names are recorded here.

## P0

None open. D50 (WIN-AUTH-DACL) did not recur with the newer build, but the cause is not confirmed.

## P1 and their matrix rows

| Matrix row | Finding | What is known | Existing item to extend |
|---|---|---|---|
| `pipeline.toolbox.d50-win-auth-dacl-fix-unconfirmed` | D50 | The producer ran through with the new build; whether the root-only rule (`w7-win-private-dacl-root-only`) was the cause is not shown. Only a native Windows run can confirm it. | `2026-10-26-windows-private-state-check-counts-acls-inherited-from-above-the-repository.md` |
| `pipeline.toolbox.d47-crlf-checkout-breaks-verify-without-autocrlf-input` | D47 | A CRLF problem was worked around with `core.autocrlf=input`; a run without the workaround is missing. | new |
| `pipeline.toolbox.d41-critic-evidence-route-only-in-the-error-message` | D41 | The route to Critic evidence exists only as a refusal text, not in the `critic-review` skill or in `--help`. | `2026-10-26-critic-diagnostic-evidence-has-no-sanctioned-route-into-the-feature-manifest.md` |
| `pipeline.toolbox.d52-elephant-cannot-commit-intermediate-states` | D43, D45, D52 | The Elephant has no sanctioned commit route for `docs/state.md` and pipeline files (D43/D45, D45 solved in 757cc2f, onboarding should check it earlier) nor for intermediate states (D52): `--no-verify` was used, and `close-block` would end the feature before the Critic. | new |
| `pipeline.toolbox.d51-critic-diagnostic-evidence-demands-head-equals-candidate` | D51 | `critic-diagnostic-evidence` demands HEAD equal to the candidate; every later commit voids the Verify evidence, which then reruns for about seven minutes. `evidenceOnlyCommits` exists in the code but is not wired for this check. | `2026-10-25-critic-diagnostic-evidence-carry.md` |
| `pipeline.toolbox.d31-d32-budget-stop-and-resume-hang` | D31, D32 | A budget stop and the resume stay hanging. | `2026-10-27-budget-exhaustion-is-a-checkpoint-the-elephant-answers-not-a-failed-stop.md` |
| `pipeline.glossover.pf82-host-commit-never-completes-for-background-goldfish` | PF-82 | No background Goldfish of a whole session triggered the host commit; every return carries `NGHF-PENDING-UNAVAILABLE`; the Elephant commits itself (`Commit-Act: orchestrator`); no dispatch record exists, so Critic admission (PF-79) and the signed push have no evidence. Observed identically in this session on 2026-10-27. | new |
| `pipeline.glossover.pf83-stop-failure-files-are-still-created` | PF-83 | Files no longer block starts (warning only), but they are still created, also after `succeeded`, and the message promises a removal that never happens without a host commit. | `2026-10-27-a-stop-failure-diagnostic-makes-the-native-goldfish-inventory-unreadable.md` |
| `pipeline.glossover.pf85-follow-up-package-on-the-same-item-is-refused` | PF-85 | After a partial `blocked` delivery, the follow-up package on the same item is refused (`NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD`) until the incomplete predecessor is committed, which forces red intermediate commits. A package with an item id outside the spec catalogue fails with `catalogue-source-closure` and no hint that the catalogue is meant. | new |
| `pipeline.glossover.pf86-registry-lock-is-busy-while-agents-run` | PF-86 | The registry lock is nearly always held by live hook runs of background agents; briefing builds (`DBG-RULESET-LOCK-HELD`) and starts (`SDC-LOCK-HELD`) fail at random; retries cost tokens because the dispatch text must be resent byte-identical. | `2026-10-26-dispatch-admission-holds-the-registry-lock-for-minutes.md` and `2026-10-26-concurrent-hooks-refuse-dispatch-on-registry-lock.md` |

## Not taken into the matrix

- Toolbox D53 to D55 (P2/P3): handover size guard blocks small edits, glob blocked in plugin folders, `critic-review` without arguments forks an agent that aborts at once.
- Glossover PF-87 (low): the generator digest changes after every commit and the briefing must be rebuilt; the budget of 35 calls is too tight for packages with an integration run.

## Analysis order

Read-only recon first (notes under the held-patches evidence folder, one per group), then slices with distinct parent items:
1. PF-82, D52, D43, D45: a sanctioned record route for orchestrator commits and an intermediate-commit route.
2. PF-85, PF-86, PF-83, D31, D32: dispatch admission, queue and registry behaviour.
3. D51, D41, D47: Critic evidence binding, help text, line-ending robustness.
D50 needs a native Windows run; there is nothing to build until that run exists.

## PO decisions of 2026-10-27

- PF-82/D52 record kind: an Elephant-committed Goldfish result is accepted as its own attested evidence kind (working name `orchestrator-attested`, never `authored-commit`). It binds the hand-back payload digest, the commit, the `Dispatch: <id> (goldfish)` trailer, `parent == candidateCommit` and the briefed write scope. Critic admission and the signed push show it as the weaker assurance. The host-observation rule for `authored-commit` is unchanged.
- D52/D43/D45 Elephant commit gap: measure first. Find the pre-commit hook that led to the `--no-verify` workaround before widening any binding; `--no-verify` stays forbidden (GG-17). No binding change until the measurement exists.
- D31/D32 budget grant: keep one grant per agent, but raise the total ceiling a Goldfish may reach to about 70 calls (today 44: maxTurns 50 minus 6, with the tier cap 35). The lever is the agent frontmatter `maxTurns` (50 to about 76), which the core derives the ceiling from; the operating-model text that calls 50 the hard leash needs the same change.
- D41 Critic skill: the evidence-route paragraph may be added to the Critic skill and the pin in the protected preimage JSON re-baselined, as a held patch the PO applies and the batch Critic reviews.
- D47 line endings: the onboarding writes line-ending attributes (eol=lf or -text) for the evidence paths into the project `.gitattributes`, and a migration adds them to an existing repository where they are missing. Reading the committed blob at the candidate does not work (the evidence files are written after the candidate commit; slice cancelled as a wrong premise), and normalising on read is not taken (it weakens byte exactness). Budget note: the first ceiling slice stopped on scope; the accepted consequence is that the briefed Tool budget line becomes 40 (tier cap) with a total ceiling of 70 at `maxTurns` 76.
- D51 evidence carry: allowed, narrowly. A diagnostic artifact bound to an ancestor commit A is accepted for candidate B only across a linear range of at most 512 commits made solely of registered evidence-only commits, with no correction commit and identical non-evidence content; the admission records the carry proof digest. The strict Verify receipt check is not touched.
