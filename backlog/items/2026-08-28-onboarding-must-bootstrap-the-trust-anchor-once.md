---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-must-bootstrap-the-trust-anchor-once
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — happy-path blocking: its absence deadlocked the first human override in the Claude run and cost a live PO signature; PO asked for this explicitly"
source: "Greenfield happy-path test of candidate 0.6.0 across all three runners, 2026-08-28. Independent self-analyses: Claude/Windows (docs/pipeline-haertungstest-und-analyse.md), Agy/WSL (pipeline-analysis.md), Codex/WSL (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own cross-run observations."
done_when: manual
---

# The trust anchor is never bootstrapped, and its absence surfaces as a circular deadlock instead of a named prerequisite

## What happened

The Claude run needed a human override to fix its verify contract; the override
needs a `trustAnchor` in `project/critical-human-proof.json`; that file is itself
gate-strength protected. The anchor was never set because the `setup` step never
ran. Result: a circle only breakable by setting the anchor by hand outside the
session, after ~3 ceremony rounds and one expired PO signature.

Agy independently reported the same class of problem from the other side: the
`signature` default "plunges the user into a complex cryptographic workflow"
with no preparation.

## The defect

The absence of the anchor is a **precondition that is never checked and never
established**. It becomes visible only as an unexplained circularity at the
moment a human override is first needed — which is exactly the worst moment,
because a PO signature is usually already in flight.

## Mechanism, measured 2026-08-28 — the report's framing was imprecise

The run described this as "the `setup` step never ran". The code says something
sharper, and the difference matters for the fix:

- The file **is** materialized at onboarding.
  `freshCriticalHumanProofPolicyBytes()` (`lib/project-onboarding-v3.mjs`, just
  below the comment at line 1067) writes it unconditionally of
  `gates.push_approval`. It is not missing.
- The seed **deliberately omits the anchor.** Its own comment: *"`.v1` only,
  `requiredKinds: ["push"]` only: no waiver, no trust anchor, no kind beyond the
  one gate this seed already turns on. A project that wants more … edits this
  file itself — gate-strength protected (GS-2), by design."*
- The override route **requires** one. `lib/human-guard-override.mjs:3157-3168`
  resolves the anchors and calls `fail("HGO-TRUST-ANCHOR-MISSING", "project/
  critical-human-proof.json carries no trustAnchor")` when neither a non-empty
  v3 `trustAnchors` set nor a legacy singular `trustAnchor` is present, with a
  second belt-and-suspenders check immediately after.
- That fail-closed posture is **correct and must not be relaxed.** The same
  comment block argues it directly: unlike `verifyAgainstTrustAnchors()`'s own
  posture for the four `CRITICAL_ACTION_KINDS` ceremonies, this call site is a
  general override of an arbitrary guard denial (ADR-0059), so treating an empty
  anchor set as "any key" would make the whole override ceremony
  self-serviceable by an agent. Do not touch it.

So the circle is exact: the one field the signature route requires is the one the
seed leaves out, and the file that would carry it is gate-strength protected — so
adding it afterwards needs the very override it gates. **The only moment writing
the anchor does not require an override is the transaction that creates the file.**
That is what fixes this, and it is the one place the fix can go.

Note for whoever implements it: the anchor must be discovered or asked for, never
a path written into the repository. Machine-specific absolute paths do not belong
in committed artifacts (CLAUDE.md), and this repository runs on two machines.

## Direction — the PO's explicit ask

Bootstrap the anchor once, during init:

1. Look for an existing key directory and **reuse it** if present — the PO's
   canonical directory already exists and must never be silently replaced.
2. Only if none exists, offer to create one.
3. Write the trust anchor as part of the same transaction that seeds the gate
   files, so the anchor and the gate that requires it are never out of step.
4. If the human declines, record the anchor as absent and report that
   human-override routes are unavailable — as a named state, not as a
   circularity discovered later.

## Acceptance criteria

- A fresh repository ends init with either a working anchor or a recorded,
  reported absence.
- An existing key directory is detected and reused, never overwritten.
- The first human override in a fresh project does not require an out-of-session
  manual edit.
