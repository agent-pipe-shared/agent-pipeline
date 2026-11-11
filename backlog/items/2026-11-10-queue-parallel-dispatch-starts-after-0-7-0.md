---
schema: pipeline.backlog-item.v1
id: pipeline.queue-parallel-dispatch-starts
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: "PO tile of 2026-11-10 on parallel Agent starts on native Windows, placing a queue after 0.7.0"
sprint: alfred
done_when: manual
---

# Queue parallel dispatch starts instead of letting them contend for the registry lock

## Description

In a greenfield run on native Windows, four Agent calls in one message cost five minutes and all four failed. Three waited for the registry lock until the 300 s admission budget ran out, the fourth was refused at about 56 s, and the retry of one slice then collided with what the failed start had left behind. The same message shape on WSL was admitted in about 2 s per call.

The whole budget is used on purpose today (G20-40), and CGR-07 recorded no queue and no change to the lock timing. The PO decided on 2026-11-10 to replace that with a queue after 0.7.0.

## Scope

- Starts sent together wait in order and are admitted one after another, without a host hook timeout ending them.
- A start that fails leaves nothing a retry collides with (`item-delivery-owner-collision`).
- Linux and WSL keep their parallel starts.
- Measured on native Windows; WSL cannot show this behaviour.

## Done when

Four Agent calls in one message on native Windows are all admitted, or a failure is reported early and a retry succeeds without manual repair, and the PO accepts the behaviour.
