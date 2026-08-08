---
schema: pipeline.backlog-item.v1
id: pipeline.part-a-limitation-2-orphaned-by-the-r2-rework
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Critic finding F2 on PHX-R2-THREATMODEL-rework (specs/sprint-phoenix-epic/evidence/phx-r2-threatmodel-rework-critic-review-ad5d185.md). Recorded by the Elephant as the disposition of that finding — the item the finding says was missing.
due: 2026-09-06
---

# Part A's disclosed limitation 2 lost its successor mechanism and has no owner

## Description

`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md:155-165`
discloses a limitation Part A does not close: an **allowlisted origin checked
out at an arbitrary committed history** still passes the bootstrap readiness
attestation. The origin URL is checked and local uncommitted drift is checked;
*which commit* the checkout sits on is not.

Until 2026-08-07 the residuals design named a path to closing it — a
signed-release pin. The threat-model correction of that date withdrew the pin
(the PO refused any new key or signing ceremony), and the R2 rework recorded the
consequence honestly: the limitation "stays open with no successor mechanism
proposed here".

That is the correct disclosure and the wrong end state. The result is a
security-relevant gap in a shipped gate that is:

- disclosed in two design documents,
- tracked in **no** backlog item,
- absent from the five open PO questions in the residuals design's §I.2.10,
- carrying no owner and no expiry.

This item exists to hold it, so the gap is tracked rather than orphaned.

**It is not the same subject as its two neighbours** and must not be folded into
either:

- `backlog/items/2026-08-07-marketplace-install-topology-unattested.md` is
  limitation **1** — the non-git marketplace topology where no attestation runs
  at all. Its candidate direction 2 mentions limitation 2 in passing; that is a
  cross-reference, not ownership.
- `backlog/items/2026-08-07-live-plugin-root-undefended-in-the-shell-lane.md` is
  in-session tampering with the installed copy. Limitation 2 is about which
  committed history a legitimate checkout is on.

## Triggering situation

Critic finding F2, severity minor, on the R2 threat-model rework (`ad5d185`).
The Critic's own framing, which this item adopts: the underlying gap is
pre-existing and is not widened by that diff, and it remains disclosed at its
source — "what degraded is the tracking, not the exposure". The Critic also
noted this repository has already paid for the identical pattern once, when
Part A's limitation 1 was disclosed in three places and tracked nowhere.

## Affected artifact

`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md:155-165`
(the disclosure) and
`specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`
§III.1 (where the successor mechanism was withdrawn). On the code side, the
observers that perform the attestation:
`plugins/pipeline-core/lib/public-core-observation.mjs` and the gate that
consumes them, `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`.

## Proposal

**Owner: PO.** Note first what the threat-model correction already decides, so
this is not re-litigated: the adversary is the **agent**, not a human attacker,
and no new human key or signing ceremony may be introduced. That rules out the
withdrawn signed-release pin permanently, not just for now.

Under that model the honest question is narrower than it first looks:

1. **Is this an agent-reachable gap at all?** Checking out a different committed
   history requires a git operation in the plugin's own source checkout. If no
   agent-reachable path produces that state, the residual is a human-adversary
   or accident scenario — the first is out of scope by the standing decision,
   the second is a correctness concern needing no cryptography to detect.
   Establish this from source before designing anything.
2. **If it is agent-reachable:** the cheapest honest detection is comparing the
   checked-out commit against an expectation the *readiness gate already
   trusts*, not against a new signed artifact. Whether such an expectation
   exists locally is the design question.
3. **If it is not:** close this item explicitly as an accepted, permanent scope
   boundary with that reasoning recorded — which is a legitimate outcome and
   materially different from leaving it silently untracked.

No implementation before that determination. Any answer touches the bootstrap
readiness gate's `status` decision, the change class the PO has already ruled
needs the design-first treatment (MP-22/MP-23).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
