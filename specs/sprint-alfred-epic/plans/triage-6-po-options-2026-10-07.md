# Triage section 6: options already on record for the 11 items that need a PO choice (2026-10-07)

Extraction only. No option is invented and nothing is recommended. Sources: the backlog item named in each section
(`backlog/items/<file>`), [`backlog-triage-2026-10-07.md`](backlog-triage-2026-10-07.md) line 78-86,
[`backlog-reconciliation-2-2026-10-07.md`](backlog-reconciliation-2-2026-10-07.md) Part 3,
[`po-decisions-2026-10-07.md`](po-decisions-2026-10-07.md), [`po-open-questions-2026-10-06.md`](po-open-questions-2026-10-06.md).
Limits: no ADR was opened (read budget), so "Constraints on record" lists only lines found in the files above. The "Question"
lines are the Part 3 wording; where an item states no such question it is noted.

General decision on all 11: PO decision AH (`po-decisions-2026-10-07.md:40`): "Deferred triage section 6 (evening), answer
'Alle rein'" - every §6 item is in scope; items needing a design or PO choice "get a design note and options presented to the
PO while other work continues". AH decides scope, not the choices below.

## 1. delivery-is-not-always-a-git-push

Item: `2026-08-28-delivery-is-not-always-a-git-push.md`.

**Question.** Which non-push delivery modes does the pipeline recognise, and who clears each?

**Options on record.** The item names open questions, not options:
- Open question: "Can a deploy be gated at all when it is invoked from outside the agent's reach ... If not, is the honest answer a declared, visible 'ungoverned delivery path' rather than a pretend gate?" (item:51-54)
- Open question: "Is the push gate's strength reducible per project when push is genuinely not delivery, without that becoming a general escape hatch?" (item:55-56)
- Open question: bind the threat-model artifact "to a commit" or "to a deploy target" (item:57-58)
- Vocabulary on record: "`deploy` and `publication` are already kinds the approval machinery knows" (item:44-46).
- A. Extend the gate model to cover non-agent-invoked deploys; B. "push-only, document the rest as ungoverned" - B is recorded only as the rejected alternative (item:71-75).

**Constraints on record.** Acceptance: "No project is described as governed on the basis of a gate that does not sit on its real delivery path" (item:64-65); "written down as an ADR, because it changes what the push gate means" (item:66-67). The ADR is written only when Batman picks it up (item:79-83). CLAUDE.md push policy: push gate stays `approval: required` (repo CLAUDE.md, "Push policy").

**Already decided?** Partly. Item:71-75: "**Decision:** extend the gate model to cover non-agent-invoked deploys - but not now. Scheduled for the Batman sprint ... (not the 'push-only, document the rest as ungoverned' alternative)". So option B above is rejected; the design of the extension is not decided. AH then pulls it into this candidate.

**Smallest reversible step.** None named in the item.

## 2. three-runners-admin-overhead

Item: `2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance.md`.

**Question.** (Part 3 wording: which admin steps may be dropped or automated per runner without weakening a gate.) The item itself is a measurement item and states no such question.

**Options on record.** No options on record for dropping or automating steps. The item's proposal is to meter: "instrument actual per-session administration-vs-product time or token shares ... across at least two runners" (item:60-63).

**Constraints on record.** PO triage 2026-09-27: "Prefer reducing avoidable Pipeline/tool overhead, retries, repeated analysis and redundant verification before reducing the quality tier used for ordinary work"; "Do not silently change the 0.7 routes or infer API dollars from subscription-plan usage" (item:117-125). Figures are self-estimates, and the 2026-09-07 metered figure is "not publishable, by PO ruling" (item:105-113).

**Already decided?** Partly: the 2026-09-27 PO decision (item:117-125) retains the item for the first efficiency increment after 0.7 with the preference quoted above. It does not choose admin steps to drop.

**Smallest reversible step.** Item:111-113: "a metered baseline now exists for a second runner to be compared against, which is the cheapest remaining step toward closing this item."

## 3. selected-critic-lane

Item: `2026-09-06-the-selected-critic-lane-briefs-contract-files-it-neither-pins-nor-binds.md`.

**Question.** Part 3 asks whether a Critic lane on native-Windows Codex is acceptable at all; the item instead asks how the selected lane binds the contract files it briefs.

**Options on record.** (item:55-60)
- A. "Mirror the native lane exactly: explicit `pipelineRoot`, root-separation refusal, clean-ruleset refusal, three digests into the receipt."
- B. "Or narrower: digest the three files at brief time into the Critic receipt only, leaving the sandbox execution receipt's schema untouched."

**Constraints on record.** Item:50-53: the execution receipt schema is "a fixed schema whose key set was not read", so the remedy "may be a schema extension rather than a field addition". Item:85-89: remaining open surface is installed Gitless packages needing "an installer-owned attestation and verifier"; until then "this special Selected route fails closed". Triage (item:96-100): the PO confirmed 2026-09-11 that native Codex sandboxing "is not a reliable acceptance environment under WSL".

**Already decided?** Partly. Item:68-83: commit `61177860` (2026-09-11) implemented the source-checkout hardening (clean separate ruleset checkout, snapshot, digests bound into the receipt) - this is option A in effect for the source-checkout case. Installed-package activation is deferred (item:93-103), review expiry 2026-12-15. AH puts the remainder in scope.

**Smallest reversible step.** None named.

## 4. t1-fallback

Item: `2026-09-06-the-t1-fallback-waits-for-failure-codes-the-route-collapses-before-they-arrive.md`.

**Question.** Should the granular preflight terminal code reach the caller, or should the fallback decide on the collapsed class?

**Options on record.** (item:79-91)
- A. Carry the granular code through `preflightFailure()` - "the more honest option ... also the more invasive one, since `preflightFailure()`'s two-value output is presumably load-bearing for the selection record's own schema."
- B. "have the consumer read `selection.preflight.terminalCode` from the persisted selection rather than from the failure class, which leaves the collapse alone."
Either way the consumer belongs at `runSelectedCriticHost()` (item:92-93).

**Constraints on record.** Item:95-97: "This is a fallback into a weaker assurance class, so it stays a PO decision ... Nothing here should be wired on an agent's judgment." Triage (item:101-109): deferred to the native-Windows Codex package; a WSL-only acceptance claim "would be misleading".

**Already decided?** No. Only the deferral (2026-09-11, review expiry 2026-12-15) is decided.

**Smallest reversible step.** None named.

## 5. author-repair-signed-chain

Item: `2026-09-12-author-repair-route-has-no-signed-event-chain.md`.

**Question.** Which signature chain authorises an author repair of protected source?

**Options on record.** No alternatives on record. The item states one target: "The canonical Author-repair ceremony emits signed, repository-bound events covering the exact preimage, reviewed patch digest, permitted paths and resulting postimage" (item:30-32), with replay/wrong-repository/wrong-preimage/changed-patch/expired-authority/missing-consumption rejection (item:33-34) and runner-neutral semantics (item:35-36).

**Constraints on record.** Item:43-45: "does not make a kernel path liftable and does not authorize push, publication, deployment or release." Item:12-13 (Problem): GMW is unavailable for permanently non-liftable paths. `templates/prompts/agent-obligations.md:79-87`: for Pipeline plugin source in a source checkout the override returns `author-repair-required`, "which a guard will not select on a human's behalf".

**Already decided?** No.

**Smallest reversible step.** Item:49-51 (Rollback): "Revert the signed-event integration while retaining the current fail-closed classification ... The existing attended route remains available with its explicitly documented weaker audit evidence." This is a rollback, not a first step.

## 6. orchestrator-write-lease

Item: `2026-08-28-an-orchestrator-write-into-a-running-dispatchs-tree-is-undetectable.md`.

**Question.** Which orchestrator writes need a lease and what is the lease holder model?

**Options on record.** Item:65-86 gives two layers, marked "Proposal (confirm before assuming)":
- A. Detection in the verifier: "have a dispatch record the paths it intends to write when it starts, and have `dispatch-authorship-verify.mjs` compare each commit's paths against the lease rather than against the after-the-fact `report.changedFiles`" (item:70-75).
- B. Prevention in a git hook: "A `pre-commit` hook refuses a commit whose staged paths intersect an active lease held by a different actor"; optionally a PreToolUse guard for the orchestrator's Edit, "but it must not be the only layer: PreToolUse does not fire in subagents in Claude Code" (item:76-81).
- Common rule for both: "a stale-lease rule ... Retire a lease only on evidence it is dead, and fail open rather than deadlocking the next session" (item:83-85).

**Constraints on record.** Item:60-63: isolation is not always granted (confirmed 2026-08-25), "so a shared-tree remedy is still needed". Item:31-33: history is not rewritten (GIT-04). Item:6 `done_when: contains plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs lease`. Triage 2026-08-28 (item:87-96): accepted, sprint nightwing, not a candidate blocker.

**Already decided?** Accepted as work (item:89), design not chosen. The item names no holder model beyond "a different actor".

**Smallest reversible step.** None named.

## 7. hooks-enforce-parallel-dispatch

Item: `2026-10-01-hooks-enforce-available-parallel-dispatch.md`. Design file: `specs/sprint-alfred-epic/design/fanout-enforcement-design.md`.

**Question.** Move FANOUT from shadow to enforce for dispatch (FANOUT Q1-Q7)?

**Options on record.** The item states the PO direction without alternatives (item:8, 16: hooks "explizit unterbinden, statt nur einen Hinweis zu geben"). The design file has the mode ladder and seven open questions (`fanout-enforcement-design.md:417-427`; indexed in `po-open-questions-2026-10-06.md:59-65`):
- Q1: amend ADR-0080 Decision 5 for a Stop-time governor, or no (ceiling stays `advisory`) (`fanout-enforcement-design.md:419-420`).
- Q2: target 4 / ceiling 6 with an EL-11 amendment, or ceiling 5 (design:421).
- Q3: shadow period length before wiring; "suggest 3 sessions or 1 week" (design:422-423).
- Q4: register S1-S6 tests via one signed protected package: yes/no (design:424).
- Q5: "Accept `diff-only` + Elephant integrator as the sustained-refill route until R4, or prioritise R4" (design:425).
- Q6: Elephant-recorded pause (`by: elephant`, max 4 h) or only the PO's config switch (design:426).
- Q7: sibling `slice-queue.json` per feature, or one repo-wide file (design:427).

**Constraints on record.** `fanout-enforcement-design.md:22`: "Rollout is staged shadow -> advisory -> enforce, because this repository has zero recorded evidence ...". `fanout-s10-canon-draft.md:115`: "Moving a project or a runner from `advisory` to `enforce` is a PO decision recorded in the decision register after the measurement. `enforce` may be enabled for a runner only after that runner's probe verdict ... is recorded." Under Q1 "no", "a configured `enforce` is treated as `advisory`" (canon-draft:118). Item:23: the check must give "nachvollziehbare Ausnahmen" and test each runner "an ihren tatsächlich unterstützten Laufzeitgrenzen".

**Already decided?** No. Q1-Q7 are listed as still open in `po-decisions-2026-10-06.md:24` and `0.7-execution-order.md:335`; no 2026-10-07 decision answers them.

**Smallest reversible step.** `fanout-enforcement-design.md:386`: "enable `shadow` -> measure -> `advisory` -> `enforce` (config only, no code)" - a config step named in the design, not in the item.

## 8. agy-imported-plugin-snapshot

Item: `2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin.md`.

**Question.** Topology A or B for the Antigravity imported-plugin snapshot?

**Options on record.** (item:156-170) "exactly one agy-visible source of `agent-pipeline-core` may exist per effective scope":
- Option B (labelled "recommended, matches the PO's expectation and SETUP.md" in the item): workspace-local only - `.agents/plugins.json` per consumer project, no global managed copy, no global `plugins.json` entry, no global `hooks.json` wiring; "depends on S2/S3 proving that a workspace path entry actually loads".
- Option A: agy-managed install via `agy plugin install <approved source dir>`, one global managed copy, no `plugins.json` entry; "global by construction, which contradicts the PO's stated expectation".
- Sub-question: retire the optional "2) Global" installer choice or keep it with stronger warnings (item:172-175).

**Constraints on record.** Spike S1-S6 is "mandatory, before any design is fixed" and must run in a disposable account, not the PO's real `~/.gemini` (item:120-126); topology is picked "from them" (item:151-152). Remediation uses agy's own lifecycle commands, never raw deletion, and never from inside an agy session or hook (item:228-247; GL-09 cited at item:241). PO's machine was left unchanged (item:306).

**Already decided?** No. The item's "recommended" label is an item-author statement, not a recorded PO decision; AH names this as a pending A/B choice.

**Smallest reversible step.** Item:120-151: the S1-S6 spike in a disposable account (read-only toward the PO's machine).

## 9. no-uninstall-path

Item: `2026-09-28-no-uninstall-path-for-a-repository-that-once-opted-in.md`.

**Question.** Which B2 uninstall policy? Note: the Part 3 options "full removal, retire-in-place, none" are not in the item.

**Options on record.** The B2 policy question itself: "the hooks must fail *safe with a clear message* or be re-pointed. Decide the policy" (item:170-172). B2 is the baked absolute plugin-lib path that can break commits/pushes after a plugin cache prune (item:70-77). Related option points in the item:
- Authority/config: "remove (mechanics) - option `--archive` moves them to an archive folder instead" (item:103).
- Private state: remove last, "Offer `--archive-private-state <dir>` first" (item:113).
- Open spike question: archive `evidence/` and HGO audit ledgers by default? (item:186-187).

**Constraints on record.** PO requirement: remove Pipeline mechanics, keep all content, git/build/tests/runners keep working (item:41-48). Reset is not uninstall (item:50-55, 226-227). Git hook shims must be removed before private state (item:59-69, 112). Order and readback (item:125-149). Item:75-77: B2 "needs verification as a separate defect"; triage (item:218-223) reproduced the path dependency in isolation, "actual runner cache pruning remains unverified".

**Already decided?** Partly. Triage (item:225-227): "Accepted into the next local 0.7 candidate by explicit PO request. Implement a separate repository uninstall lifecycle; reset is not uninstall." Source work has landed in scratch evidence (item:203-216); the B2 policy is not decided.

**Smallest reversible step.** None named for B2. The item's `plan` mode is read-only (item:122-123).

## 10. script-mediated-writes integrity

Item: `2026-10-05-script-mediated-writes-bypass-protected-test-paths.md`.

**Question.** How are writes through scripts bound to the protected-path rules?

**Options on record.** One example only: "Protected-path integrity is enforced independent of the write channel, for example a PostToolUse or pre-commit integrity check of the protected paths against their pins after any Bash/PowerShell call that runs node" (item:28-30). No other options. Triage section of the item is blank (item:34-39).

**Constraints on record.** Item:24-25: "a protected-path guard that holds for one write channel and not for another is not a guard." Acceptance requires a regression test reproducing the codemod shape (item:31-32). `templates/prompts/agent-obligations.md:77-87`: protected test paths TP-1..TP-13 have no in-session override.

**Already decided?** No.

**Smallest reversible step.** None named.

## 11. dispatch-record-ownership

Item: `2026-10-05-dispatch-record-ownership-binds-an-attempted-creation.md`.

**Question.** Integration and identity model for one worktree per Goldfish (R4)? The item asks only how to bind ownership to a landed creation inside that design.

**Options on record.** No options on record. The item says: "bind ownership to a landed creation in a way that holds across linked worktrees sharing the claim registry" (item:25-27). A withdrawn fix, RC-1a (a worktree-local landed-check), is on record as broken across linked worktrees (item:18-21). The FANOUT interim route is `diff-only` + Elephant integrator (FANOUT Q5, `fanout-enforcement-design.md:425`; `0.7-execution-order.md:246-248` names the native host-commit route until R4).

**Constraints on record.** Item:28: verification is "a test in which two linked worktrees share one claim registry and RC-1/RC-2 still hold." `0.7-execution-order.md:234-235` lists R4 as "Worktree per Goldfish (integration + identity design)". CLAUDE.md worktree rules: isolation may not actually be granted; check `git worktree list` (repo CLAUDE.md, Environment note).

**Already decided?** No. FANOUT Q5 (accept the interim route or prioritise R4) is open (`po-open-questions-2026-10-06.md:63`).

**Smallest reversible step.** None named.
