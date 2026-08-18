---
schema: pipeline.backlog-item.v1
id: pipeline.agent-can-self-arm-the-git-override
type: defect
owner: pipeline
status: closed
created: 2026-08-08
source: "Found on 2026-08-08 by the PHX-RED1 dispatch while diagnosing why plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs is red. The suite is not a broken test: it specifies a human-authority binding that was never built, and diagnosing that surfaced the live hole below. Verified independently at source by the Elephant before filing, not taken from the dispatch report."
due: 2026-09-07
---

# An agent can arm the git override itself, and only prose forbids it

## Description

`guardrails/git.md:64` states the prohibition in exactly these words:

> **MUST NOT** (agents): self-arm the override — arming is for the PO's confirmed
> decision only, never an agent's own initiative.

Nothing enforces it. The mechanism accepts any well-formed arming string:

```
PIPELINE_GUARD_OVERRIDE="GG-07|<token>|<reason>" git reset --hard HEAD~1
```

The contract (`guardrails/git.md:69`) is "exactly three segments split on the
first two `|`", a "fresh one-time value" token by *convention*, and a non-empty
reason. Every one of those three is a value the arming party chooses. The token is
checked for **freshness** — that it has not been consumed before — never for
**provenance**. So an agent that types the string satisfies the contract as
completely as the PO does, and `allowWithOverride()`
(`plugins/pipeline-core/hooks/guard-git.mjs:716-724`) emits exit 1 with
`OVERRIDE APPLIED (one-time)` and appends the ledger line.

The ledger at `.claude/guard-override.log.jsonl` records `{ts, rule, token,
reason, command}`. Every field in it is agent-supplied. It is an accurate record
that an override happened and a faithful record of what was claimed; it is not
evidence that a human decided anything.

The result: for the whole GG-01…GG-16 union, the difference between "the PO
confirmed this destructive command" and "the agent decided to run it" is a
sentence in a Markdown file.

## Why this is not merely theoretical

The four-step procedure at `guardrails/git.md:58-61` — explain, confirm, second
explicit `OVERRIDE <rule-id>` confirmation, then run — describes a human in the
loop at three of the four steps. The implemented mechanism observes only step 4,
and cannot distinguish a step 4 that followed steps 1-3 from one that did not.

Compare what this repository demands elsewhere for far less: a Guard Maintenance
Window needs a detached Ed25519 signature over a digest, produced outside the
session, with the private key outside the repository. A push needs the same. Both
exist because an agent-satisfiable check does not constrain an agent. The git
override — which admits `reset --hard`, history rewriting, and branch deletion —
is the one destructive path where the human's part is a convention.

## The closure is already specified, and it conflicts with a live suite

`plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs` specifies the repair: a
**fourth** arming segment naming a `pipeline.git-override-authority-reference.v1`
document, resolved against the canonical human ledger at a checkpoint and
single-consumed there. The primitives already exist and are unused by the guard —
`queryHumanGovernanceDecisions`, `requireGovernanceAuthority`,
`appendConsumedHumanGovernanceDecision`, `derivePoGateRepositoryFingerprint`.

That schema name appears in exactly one file in the repository: the test itself.
No producer, no reader, no documentation. The suite is therefore an unbuilt
feature's acceptance criteria, parked as a red exclusion.

**The conflict that makes this a decision rather than a task.** `guard-git.test.mjs`
(TP-1-protected) case OV-AC1 at lines 289-297 asserts exit 1 and `OVERRIDE APPLIED`
for `git reset --hard HEAD~1` under a three-segment arming — the *same rule and the
same command* the Phoenix suite requires blocked. Two live suites, one command,
opposite expectations. Both cannot be green under one contract.

## Proposed repair

The decision is the PO's, and it is a single question: **does the Phoenix
human-authority binding supersede the GIT-04 three-segment contract?**

- **If yes**, this is a feature block, not a red-suite repair: a new authority
  path in `guard-git.mjs`, a rewrite of the normative contract in
  `guardrails/git.md:64-71`, and a *briefed* change to the TP-1-protected suite —
  which needs a signed maintenance window. Sequenced that way, both suites end up
  green under one contract.
- **If no**, the Phoenix suite is specifying work that will not be done, and the
  honest act is to delete it and record the self-arming hole as accepted risk with
  an owner and an expiry — not to leave it excluded and looking like a small red.

What must not happen is the third option that costs nothing today: leaving the
suite excluded with a reason that reads as a trivial assertion failure. Its
current `EXCLUSIONS` reason is `"red (R1.2): AssertionError, 1 !== 2"`, which
records the symptom and hides that it parks an unbuilt security feature plus a
contract conflict. That is a QG-05 gate-honesty defect in its own right and should
be corrected whichever way the decision goes.

## CORRECTION 2026-08-09 — the premise is half wrong, and the other half had a cause

This item says the prohibition is enforced by nothing. That is **no longer true for a
Phoenix-governed repository, and it was only ever true because of a deleted
implementation** — not because the enforcement had never been built.

`PHX-GITAUTH` (commit `1729334`) restored `phoenixGovernedProject()` and the canonical
human-authority path that merge `75b8361` dropped from
`plugins/pipeline-core/hooks/guard-git.mjs`. Where `governance/events/registry.json`
exists, a three-segment arming is no longer sufficient: the reason segment must open
with an authority-reference path, that reference is resolved through the governance
authority CLI, and it is single-consumed against a checkpoint. A self-armed override on
this repository is now refused with exit 2 — demonstrated on a throwaway fixture against
a pre-repair baseline that permitted the identical command.

**What remains true, and why this item stays open:** for a repository *without* that
governance registry, the analysis above is unchanged — three agent-chosen segments, a
token checked for freshness and never for provenance, every ledger field
agent-supplied. That is where the Pipeline's own consumer projects live, so the item
narrows in scope rather than closing.

**A second claim here is also wrong.** The section above frames the conflict with
`guard-git.test.mjs` OV-AC1 as a contract contradiction needing a PO decision. It is not
one. The two suites never exercised the same code path — one fixture writes
`governance/events/registry.json` and the other does not — and the merge removed the
predicate that discriminated between them, so both fell into the same branch. No
decision is required; an implementation was missing. Recorded here because a wrongly
filed decision is more expensive than a wrongly filed defect: it waits for a human who
has nothing to decide.

## Related

- `2026-08-08-seven-unregistered-suites-are-red-and-must-not-be-registered.md` —
  this suite is one of that set; this item is why it is not repairable by the same
  motion as the others.
- `2026-08-07-approval-mechanisms-require-out-of-session-po-acts.md` — the
  out-of-session signing burden this override path conspicuously does not carry.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Close — Phoenix's own instance is fixed; residual scope is general pipeline hardening, not reopened here.
- **Rationale:** PHX-GITAUTH (commit 1729334) restored phoenixGovernedProject() (guard-git.mjs:676), gating the self-arming path (:755,:894) on the presence of governance/events/registry.json — which this Phoenix checkout has, so self-arming is enforced here. The item's only remaining residual scope (repositories WITHOUT a governance registry, i.e. Pipeline consumer projects) is general pipeline hardening outside Phoenix's own delivered surface, not a Phoenix defect. Re-verified 2026-08-18.
- **Assignment (if accepted):** n/a — disposed without further work
- **Date:** 2026-08-18
