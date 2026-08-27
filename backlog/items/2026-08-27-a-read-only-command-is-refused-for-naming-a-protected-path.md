---
schema: pipeline.backlog-item.v1
id: pipeline.a-read-only-command-is-refused-for-naming-a-protected-path
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Measured live, 2026-08-27 session: a read-only node -e command that only printed a sorted-insertion index over docs/product-capability-inventory.json was refused as a write because the string \"verify.mjs\" appeared inside its interpreter code text."
---

# A read-only command is refused for naming a protected path, and the only route offered is a PO signature

## Description

`guard-lifecycle-ready.mjs` refused a `node -e` expression with
`GUARD-TESTPATH-SHELL`, rule `TP-3`, "Detected as a shell write to a
protected test path (lane: `opaque-interpreter-code`)". The command
performed no write of any kind — it only read
`docs/product-capability-inventory.json` and printed a sorted-insertion
index. It was classified as a write solely because the string
`verify.mjs` appeared inside the interpreter code text. The lane cannot
distinguish reading from writing inside opaque interpreter code, so it
treats any mention of a protected path as a write. That default is
defensible as fail-closed; the defect is what it costs and what it offers
instead of a safer route.

## Triggering situation

Measured live, 2026-08-27 session, while working with
`docs/product-capability-inventory.json` (see item
`pipeline.registering-a-verify-suite-silently-invalidates-the-capability-inventory`).

## Consequence worth stating separately

The refusal's only offered route is the full human-guard-override
ceremony, ending in an external Ed25519 signature by the PO. A read-only
diagnostic is thereby escalated to a human signing gate. The PO's standing
position, stated on 2026-08-27 about a different guard refusal, is that a
routine autonomous step is "kein Signaturfall" — not a signature case.
Spending a PO signature to let an agent read a JSON file is the same error
in a new place.

The workaround that exists is not a fix: the identical read succeeds via
`grep`/`sed`, or from a script FILE rather than `-e`, because the lane
only inspects inline interpreter code. A guard that is bypassed by moving
the identical code into a file is not adding protection at that
boundary — it is adding friction.

Cross-reference
`pipeline.pretooluse-guards-do-not-fire-in-dispatched-subagents`: the same
guard does not fire at all inside a dispatched subagent, so this refusal
binds only the orchestrating session — the one that is already the most
supervised.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (rule `TP-3`,
  `opaque-interpreter-code` lane)

## Proposal

Options, not a decision:

1. Narrow the lane to interpreter invocations that can actually write
   (detect `writeFileSync`/`appendFileSync`/`rmSync`/an open call with a
   write flag and similar), accepting that detection inside opaque code
   stays imperfect.
2. Keep fail-closed, but offer a read-only typed retry action instead of a
   signature ceremony, matching how other lanes already return
   `retryActions`.
3. Do nothing and document the `grep`/script-file workaround.

Option 2 is the smallest change that removes the signature escalation
without weakening the write boundary at all.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
