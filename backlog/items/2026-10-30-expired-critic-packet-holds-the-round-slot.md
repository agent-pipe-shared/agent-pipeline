---
schema: pipeline.backlog-item.v1
id: pipeline.expired-critic-packet-holds-the-round-slot
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P2
release: 0.7.1
sprint: alfred
source: "Consumer handover 2026-10-30 (finding N21, not retested on c23df26); PO 2026-10-30: minor, filed after 0.7.0"
done_when: manual
---

# An expired Critic packet holds the round slot

## Evidence

`admit` for a new request ran into `CPP-EXPIRED: Packet expired.` because the packet had been claimed in an
earlier attempt. The failure left the round slot reserved. A fresh packet then hit `CGB-BUDGET` ("Round 2 …
already reserved for packet …") and `inspect-course-takeover` hit `CGB-TAKEOVER-OPEN` ("finish or release it
first"). The way out was `session-critic-finalizer release`, which neither text names. The `CGB-BUDGET` text
was cut off mid-sentence ("A new commit (for examp…").

## Wanted

1. `admit` releases an expired packet's reservation itself, or `CGB-BUDGET` and `CGB-TAKEOVER-OPEN` name
   `session-critic-finalizer release` with its request shape.
2. No refusal text is truncated.
3. The lifetime of a claimed packet is visible in the admit result.
