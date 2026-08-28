---
schema: pipeline.backlog-item.v1
id: pipeline.every-small-correction-costs-a-new-human-interaction
type: idea
owner: pipeline
status: open
created: 2026-08-28
sprint: batman
source: "Codex/WSL greenfield run, 2026-08-28 (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own observation that this runner needed three sessions and the most detours."
---

# Every small correction invalidates the preimage and costs another human interaction

## The observation

From the Codex run, and the one finding of the three that genuinely sits in the
binding core rather than around it:

> Plan, Prepare, Intent signieren, Proof erzeugen, authorize-by-signature, erneut
> planen bei Preimage-Änderung, Push-Prepare und Critical-Push-Autorisierung sind
> für eine starke Kette sinnvoll. In der Praxis führte jede kleine Korrektur an
> Konfiguration, Evidence oder Kandidat zu einem neuen Hash und einer neuen
> menschlichen Interaktion.

This repository has paid the identical cost repeatedly: an edit between seeding a
ceremony and consuming its signature changes the bound digest and burns the
signature, which is why the standing rule forbids any tree mutation while a
HEAD-bound PO command is outstanding.

## The proposal, stated as the Codex run framed it

> ein einzelnes, signierbares Approval-Manifest pro Kandidat mit allen benötigten
> Aktionen und klarer Ablaufzeit wäre robuster als viele unabhängige
> Chat-Kommandos.

One manifest, one signature, covering every action the candidate needs, with an
explicit expiry — instead of N independent ceremonies each with its own preimage.

## Why this is deliberately NOT scheduled with the flow rebuild

**PO decision, 2026-08-28:** rebuild the onboarding flow, keep the binding core
untouched. This item touches the core. It is the one place where the friction is
genuinely structural rather than orchestration, and it deserves its own design
pass with its own review — not a slot inside a workstream that was explicitly
scoped to leave the cryptography alone.

The precision must not be reduced. The packaging of that precision is what is in
question.

## Open questions for that design

- What is the correct granularity of "candidate" when HEAD moves?
- How does a manifest expire safely without becoming a standing authorization?
- Does a partially-consumed manifest degrade safely?
- How does this interact with the existing narrower-branch and replay refusals,
  which are working correctly today and must not regress?
