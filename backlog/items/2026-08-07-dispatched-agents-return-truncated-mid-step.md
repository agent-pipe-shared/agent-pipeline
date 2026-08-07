---
schema: pipeline.backlog-item.v1
id: pipeline.dispatched-agents-return-truncated-mid-step
type: defect
owner: pipeline
status: open
created: 2026-08-07
due: 2026-08-21
source: "PO, 2026-08-07: 'die goldfische generell und criticer liefern seit einiger zeit immer abgeschnittenes das könnte an der WSL umgebung liegen'. Four instances measured in one session the same day."
---

# Dispatched Goldfish and Critic agents return truncated mid-step instead of reporting

## Description

Dispatched subagents terminate before producing their report, returning their
last in-progress sentence as if it were the result. The PO reports this has been
happening across both Goldfish and Critic dispatches for some time and suspects
the WSL environment. Four instances were measured in a single session on
2026-08-07, which is what makes this recordable rather than anecdotal.

| Dispatch | Returned instead of a report | Tool uses | Duration |
|---|---|---|---|
| Critic round 2 | *"Now let me construct the diff. Starting with the core implementation commit."* | 57 | 5m 35s |
| `NOVA-HGOSIG-TRUST-1` | *"Now the mandatory red-run evidence: revert the source changes only (tests stay), and observe the new tests fail."* | 61 | 10m 54s |
| `NOVA-HGOSIG-ROUTE-1` | *"All three suites are green. Now the red evidence — a reconstructed pre-fix copy under `evidence/`, never the working tree."* | 68 | 15m 16s |
| (`NOVA-HGOSIG-OT13-1` stopped cleanly with a full report — a guard denial, not a truncation. Listed to show the failure is not universal.) | — | 21 | 4m |

The pattern is consistent and worth stating precisely:

1. **It fires at a step boundary, not at random.** Every instance stopped
   immediately *after* announcing the next step and *before* executing it. In
   three of three cases the announced step was the expensive one — construct the
   diff, obtain red-run evidence.
2. **It is independent of model, agent type and tier.** It hit a Critic and two
   Goldfish, across two different models, at two different effort tiers.
3. **Work already done survives.** In every case the file edits were intact; only
   the report was lost. Resuming the agent with a description of the observed
   state recovered it each time, with its context still usable.
4. **It correlates with tool-use count and duration**, weakly but visibly: the
   clean run used 21 tool calls, the three truncated ones 57–68.

## Why it costs more than a re-prompt

Resumption works, so the direct cost looks small. Two second-order costs are not
small.

**A truncated run can destroy work if the interrupted step was destructive.**
`NOVA-HGOSIG-TRUST-1` stopped in the middle of a briefed "revert the tree, watch
the test go red, restore" cycle, leaving the working tree half-rolled-back with
the entire fix living only in a stash. It was recovered, but the fix was one
unlucky command from being unrecoverable. The dispatch was doing exactly what its
briefing told it to; the briefing was the hazard, and the truncation is what made
the hazard live. Two follow-on dispatches were re-briefed to forbid tree reverts
entirely and obtain red evidence from a reconstructed copy instead.

**A truncated Critic silently degrades review.** The report is the deliverable;
an interrupted Critic produces no findings at all, and there is no partial
credit. If the truncation had happened slightly later — after findings were
formed but before the verdict — the orchestrator would have had to decide
whether a partial finding list was usable, with no way to know what was still
unexamined.

## Triggering situation

Measured continuously through the 0.5.3 candidate review and fix wave,
2026-08-07, on WSL2. Every dispatch in that session ran against the same
checkout with the same guard configuration.

## Affected artifact

Not a repository artifact — the failure is in the dispatch/subagent runtime, not
in this repo's code. Recorded here because it changes how briefings must be
written: the mitigations below are repository-side even if the cause is not.

## Proposal

Not designed here. The cause is unknown and this item deliberately does not
guess at it. Candidates, split into diagnosis and mitigation because the second
does not wait for the first:

**Diagnosis**

1. Confirm or rule out the PO's WSL hypothesis by running the same dispatch shape
   outside WSL. Until that is done, "WSL" is a suspicion, not a finding — the
   correlation with tool-use count is equally consistent with a
   duration/output-size limit that has nothing to do with the host.
2. Record tool-use count and duration for every dispatch, so the correlation in
   the table above becomes a measurement rather than four data points noticed by
   hand.

**Mitigation, independent of cause**

3. **Ban destructive verification steps in briefings.** The "revert, observe red,
   restore" pattern is the standard way to prove a test is a real pin, and it is
   unsafe for any agent that can stop mid-cycle. Reconstructing the pre-fix code
   in a scratch file is nearly as good and cannot strand the tree. This is the
   one change that would have prevented the only near-loss so far, and it costs
   nothing.
4. **Structure briefings so a stop costs one step.** Ask for suites, then
   evidence, then report as separate reported steps rather than one long
   sequence — the truncations all landed on step boundaries, so smaller steps
   bound the loss.
5. **Treat "the result is a sentence announcing an action" as a detectable
   condition**, not something the orchestrator notices by reading. A report that
   does not contain the mandatory report sections is a truncation, and could be
   resumed automatically rather than by hand.
6. Note what is already true and should not be lost: resumption preserves
   context. Whatever mitigation is chosen must not respawn a fresh agent where
   resuming the existing one would recover the work.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
