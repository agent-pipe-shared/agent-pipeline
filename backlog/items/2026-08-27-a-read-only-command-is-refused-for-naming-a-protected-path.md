---
schema: pipeline.backlog-item.v1
id: pipeline.a-read-only-command-is-refused-for-naming-a-protected-path
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nightwing
source: "Measured live, 2026-08-27 session: a read-only node -e command that only printed a sorted-insertion index over docs/product-capability-inventory.json was refused as a write because the string \"verify.mjs\" appeared inside its interpreter code text."
done_when: contains plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs read-only retryAction for the opaque-interpreter-code and write-command lanes (pipeline.a-read-only-command-is-refused-for-naming-a-protected-path)
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

## A second instance, in a different lane, 2026-08-28

`cp <protected-test-suite> scratch/probe-f3.test.mjs` was refused with
`GUARD-TESTPATH-SHELL`, rule `TP-5`, "Detected as a shell write to a protected
test path (lane: `write-command`)". The protected path was the **source** of the
copy; the destination was a gitignored scratch file. Nothing was written to the
protected path, and the guard's own denial text says in the next breath that
reading the suite is admitted.

This widens the item beyond the `opaque-interpreter-code` lane it was filed
against: the `write-command` lane classifies by command name plus a protected
path appearing anywhere in the argv, so a read-shaped operand position is not
distinguished from a write-shaped one. `cp`, `diff`, `install`, `git
check-ignore` and similar all take a protected path as a pure input.

Same consequence as above, and measured again: the only route offered was the
full signature ceremony, for copying a file the same session was free to `cat`.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (rule `TP-3`,
  `opaque-interpreter-code` lane; and the `write-command` lane, per the
  2026-08-28 instance above)

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

- **Decision:** accepted, option 2 (a read-only typed retry action instead of a
  signature ceremony), with option 1 explicitly NOT taken
- **Rationale:** Option 1 would narrow the write detector, which trades away
  fail-closed behaviour on opaque code for convenience — the wrong direction on
  an authority-bearing gate. Option 2 costs the write boundary nothing: the
  refusal stands, only the offered route changes from "obtain a PO signature" to
  "run this exact read-only command instead", which other lanes in the same guard
  already return as `retryActions`. The escalation is the defect, not the
  refusal. The PO's own stated position — a routine autonomous step is "kein
  Signaturfall" — is the governing one here.
  Weight went up at triage: a second instance was measured on 2026-08-28 in the
  `write-command` lane (a `cp` whose protected path was the SOURCE), so this is
  two lanes, not one, and the fix should be a route the guard offers rather than
  a per-lane patch.
- **Assignment (if accepted):** Sprint Nightwing, alongside
  `pipeline.shell-grammar-reads-quoted-content-as-shell-syntax` and
  `pipeline.sed-regex-address-is-misread-as-an-absolute-path`. All three live in
  `guard-lifecycle-ready.mjs` and all three are the same family — a classifier
  reading raw command text where the operand's role is already knowable — so they
  should be one work package, not three.
  Reassigned off Alfred: by scope this is Alfred's (control integrity), but
  Alfred is in flight and closed to new scope (PO, 2026-08-28), and a triage that
  confirmed `alfred` would be keying it there for the first time.
- **Date:** 2026-08-28
