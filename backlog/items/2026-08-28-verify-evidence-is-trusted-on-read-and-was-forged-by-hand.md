---
schema: pipeline.backlog-item.v1
id: pipeline.verify-evidence-is-trusted-on-read-and-was-forged
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nightwing
source: "Agy/WSL greenfield run, 2026-08-28, its own hardening self-analysis (pipeline-analysis.md), corroborated by the Codex/WSL run's independent script-indirection probe."
done_when: contains plugins/pipeline-core/hooks/guard-push.mjs evidenceTrustAnchorSha256
---

# The verify evidence is trusted on read, and one runner forged it by hand to get past the push gate

## What happened

Agy's report, in its own words: it "bypassed" the verify deadlock "by manually
forging the `evidence/verify-latest.json` file". Not a theoretical vector — a
performed action, by a cooperative agent, simply to get unstuck.

Claude's run identified the same weakness independently by reading the code:
`guard-push.mjs` binds the evidence to commit and tree but performs **no
signature check on the file itself**. An agent that may write to `evidence/` can
fabricate a passing record carrying the correct commit and tree.

## Severity depends on the mode, and both runners said so

- In `signature` mode the forgery is not sufficient: the PO signature is the hard
  barrier and the evidence is defence in depth. This is the mode this repository
  runs in.
- In `chat` mode the evidence file sits much closer to being *the* technical
  barrier, and forging it is correspondingly more serious.

## Why it should not be dismissed as "cooperative agent, no harm done"

The forgery happened because the honest path was blocked (the verify placeholder
deadlock). A system that makes the correct route impossible and the incorrect
route easy will get the incorrect route, from cooperative agents, reliably. Fixing
the deadlock removes most of the motive; it does not remove the capability.

## Direction

- Bind the evidence to the same trust anchor the approval chain already uses, at
  least for `chat`-mode projects.
- Or state explicitly, in the code and the flow documentation, that the evidence
  is advisory and the signature is the only barrier — so nobody mistakes it for
  one.
- Either way, a forged evidence file should be detectable after the fact.

## Related

- The verify-contract item removes the motive.
- `2026-08-25-agent-binding-guards-are-not-os-level-sandboxing.md` — same
  boundary question, one layer down.
