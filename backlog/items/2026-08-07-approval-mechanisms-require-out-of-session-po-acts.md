---
schema: pipeline.backlog-item.v1
id: pipeline.approval-mechanisms-require-out-of-session-po-acts
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: PO ruling (APS, 2026-08-07) establishing the top rule that no PO activity outside the session may ever be required and that one release must cover everything. Measured from source on origin/main by the Phoenix session the same day; the mechanism work is assigned to the Nova session.
---

# The shipped approval mechanisms require out-of-session PO acts and cannot carry one release across a chain

## Description

**The rule (PO, 2026-08-07, top-precedence):** no activity by the PO outside the
session may ever be required, and one release — by signature or chat, per the
repository's configured mode — must be sufficient for everything that follows
from it. The adversary is the agent, never the human.

Measured from source on `origin/main`, the shipped mechanisms do not meet it in
three distinct ways.

**1. The out-of-session hand-edit is shipped as the sanctioned route.**
`plugins/pipeline-core/hooks/guard-gate-strength.mjs` writes it into the denial
text an agent actually sees: for `GS-6` as the *only* route ("Escape hatch: the PO
edits this file directly, outside an agent session; guard code itself is changed
in a source checkout, reviewed, and then installed"), and for `GS-1..GS-5/GS-7` as
an alternative to the override. Under the rule this is not documentation of a
fallback; it is the defect.

**2. HGO authorizes one act, not a chain.** In
`plugins/pipeline-core/lib/human-guard-override.mjs`, `consumeHumanGuardOverride()`
admits a capability only when its `toolName` **and** byte-exact `toolInputSha256`
match the call being made, with identical denial digests, and then rewrites the
record to `status: "consumed"`. One authorization therefore equals one tool call,
once. The guard's own denial text says the same: "one exact, audited edit". A
chain of three protected acts is three requests, three releases, three
consumptions.

**3. GMW can carry a chain, but not over the surface that needs it.**
`plugins/pipeline-core/lib/guard-maintenance-window.mjs:104-109` fixes
`LIFTABLE_RULE_IDS` to `["GS-6"]` plus any `TP-*` id, validated at request build,
at install and again on read. A single signed window can therefore cover every
protected *test* path at once — which is the right shape — but no gate-strength
rule other than `GS-6`. `NEVER_LIFTABLE_KERNEL_PATHS` is refused first and
unconditionally regardless.

**The measured consequence on a real package.** Residual R1 of the Sprint-Phoenix
Part-A design needs three acts to complete: the implementation (landed,
`986b540`/`b0ca256`), the `harness/scripts/verify.mjs` suite registration (TP-3),
and the protected-test-path row in the neutral-tier guard configuration (GS-4).
The first two can share one GMW window. The third cannot join it, and its HGO
route is one exact edit. R1 lands in **two** human touches, not one — a violation
of the same size as three.

## Why this is a defect and not a design constraint

Because the threat model already excludes the party this friction is charged to.
The guard family exists because "an agent that can weaken its own gate has no
gate" (`guard-gate-strength.mjs:15`); a human with local write access is
explicitly out of scope. Every additional human act therefore buys nothing against
the modelled adversary while costing the one party the model does not defend
against.

It also has a measured failure cost. The recorded structural cause of three
unregistered verify suites
(`backlog/items/2026-08-07-ruleset-source-test-unregistered-in-the-verify-gate.md`)
is exactly this: the registration file is protected, so every author must hand the
edit off, and hand-offs get dropped. A mechanism that demands more human acts than
necessary does not just annoy — it produces silent coverage gaps.

## Triggering situation

2026-08-07. The Phoenix session recorded R1's landing as needing two further human
acts and reported that as the best achievable result. The PO ruled that this is
not acceptable and stated the rule above. The measurement was already done and
stands; only its classification changes.

## Affected artifact

`plugins/pipeline-core/hooks/guard-gate-strength.mjs` (denial text),
`plugins/pipeline-core/lib/human-guard-override.mjs`
(`consumeHumanGuardOverride()`'s tool-input binding and single-use consumption),
`plugins/pipeline-core/lib/guard-maintenance-window.mjs:104-109`
(`LIFTABLE_RULE_IDS`), and every denial message that names an out-of-session PO
edit as a route.

## Proposal

**Owner: the Nova session, by the PO's explicit assignment** ("diese
implementierung belassen wir dem nova elephant"). Recorded here as input, not as
a design.

1. **The unit of authorization has to stop being the tool call.** Whatever
   replaces it, the release must bind to a *scope* — a set of rules, a set of
   paths, or a declared plan — with a bound the human can read before releasing.
   GMW's `prepare --scope <ids> --ttl-seconds <n>` already has that shape; what it
   lacks is reach.
2. **Widening GMW's scope set is the obvious move and it is the wrong one.**
   Putting `GS-1..GS-5/GS-7` under a time-boxed window would place the files that
   decide gate strength — including the push-approval mode itself — behind a lift
   that stays open for hours. That defeats what those rules exist for. The reach
   has to come from somewhere else, or the scope has to be per-release and
   explicit rather than per-rule-class.
3. **Delete the out-of-session escape hatch from the denial texts only once a
   route exists.** Removing the sentence before the mechanism lands would leave an
   agent staring at a refusal with no route at all, which is worse than a route
   the rule dislikes.
4. **The acceptance criterion is UX, not formal correctness — PO clarification,
   2026-08-07.** `signature` mode stands and its one external signing call is
   expected. What must stop is the pipeline *repeatedly* sending the human out to
   run commands; a rare unavoidable exception is fine, the permanent state is not.
   So the test to build against is **how many commands a human must run, and how
   often, to get ordinary work done** — not whether one approval formally
   suffices. The PO's stated reason is adoption, in those words: nobody will use a
   pipeline this complicated.

   Measure it against what ships today. `guard-gate-strength.mjs`'s `signature`
   guidance emits a three-command sequence — `plan`, `prepare-authorization`,
   `authorize-by-signature` — with four digests (`request-sha256`, `plan-sha256`,
   `selection-sha256`, `reason-sha256`) to be carried between them by hand, plus
   an external signing step, **for one protected edit**. Multiply by the number of
   protected acts in an ordinary package and the number is the answer.

   Two shapes worth weighing before choosing one: collapse the ceremony into a
   single command that emits one artifact to sign and consumes the signed one
   (the digest chaining is machine work and should not be the human's), and let
   one release cover a declared scope so the count does not scale with the number
   of protected paths in a package.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):** Nova session (PO-assigned 2026-08-07).
- **Date:** 2026-08-07
