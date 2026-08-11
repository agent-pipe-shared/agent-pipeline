---
schema: pipeline.backlog-item.v1
id: pipeline.blocking-push-gate-has-no-terminal-exception-boundary
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: 2ae06d9133beed3859f8e0a5ca1b61b1d97a4771
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-15
source: "Residual of GitHub issue #100 (P0/Security, 'Fail closed when the push approval record is absent'), established by reading the current tree on 2026-08-08. The PO independently reached this state in a greenfield test the same day."
---

# The blocking push gate still turns an unexpected runtime fault into a warning

## What issue #100 fixed, and what it did not

Issue #100 is a P0 security item with seven acceptance criteria. Five are met in
the current tree, and one — closure naming the merged commit — is a bookkeeping
step. **Acceptance criterion 3 is genuinely open:**

> A runtime fault in an authority-bearing blocking evaluation cannot exit as an
> allow or warning.

What *is* fixed is the specific defect the issue was raised from: the approval is
read as `state?.pushApproval?.lastApproved` with `approval?.forCommit`, and an
absent record becomes a collected blocking finding rather than a dereference
(`plugins/pipeline-core/hooks/guard-push.mjs:1626-1633`). Fixtures cover absent
state (`PG11a`), stale approval (`PG11b`), state without `lastApproved` (`PG11c`),
malformed state (`PG11d`), standing-approved (`PG10`), approval without a critical
proof (`PG12`), and configured warn mode (`PG14`). `guard-push-tests` runs in the
shared Verify gate and is green.

So the null dereference is gone. The general rule it was an instance of is not.

## The remaining hole

`plugins/pipeline-core/hooks/guard-push.mjs` has no `uncaughtException` handler
and no `try`/`catch` enclosing the blocking evaluation — only local catches at
individual read sites (lines 1391, 1485, 1491, 1611, 1620). The file executes at
module scope with direct `process.exit` calls. An unexpected exception raised
**after** the guard becomes active (`:1349`) therefore escapes to Node, which exits
with code 1.

In this hook family, exit 0 is allow, exit 2 is block, and **exit 1 is a warning**.
So any unanticipated fault in the authority-bearing path — a shape nobody wrote a
guard clause for, an I/O error in a helper, a future refactor's oversight — is
reported as non-blocking precisely when the project demanded a blocking gate.

There is also no test for it: `guard-push.test.mjs` contains no case that injects a
fault into the blocking evaluation and asserts exit 2.

## Reproduction status

**The PO reached this state in a greenfield test on 2026-08-08.** That moves it
from a structural reading to an observed condition, and it is why this is being
pulled into `0.5.4` rather than triaged for later.

The structural analysis above was performed by reading the current tree and is
stated as such: it is derived from the file's control flow and exit paths, not
from an injected exception. The proof would be the missing test, which is half of
the fix.

## Why the specific fixes do not cover it

Each fixture pins one known bad shape. The exception boundary is the rule that
holds for shapes nobody has thought of yet — including the ones a later change
introduces. A gate whose fail-closed property depends on having enumerated every
failure mode in advance is not fail-closed; it is well-tested, which is a different
and weaker thing.

## Direction, not a design

1. **Add one terminal boundary around the blocking evaluation**, mapping any
   escaped exception to the block exit code with a typed, sanitized diagnostic. It
   must not swallow the exception silently — the diagnostic says a fault occurred
   and that the gate blocked because of it.
2. **Apply it only where the gate is authority-bearing.** Advisory and warn
   configurations keep their documented non-blocking semantics; that is
   acceptance criterion 4 and must not regress. The early fail-open on unreadable
   tool input (`:176-181`) is before any push is identified and stays as it is.
3. **Prove it with an injected fault.** A test that raises inside the blocking
   path and asserts exit 2, not merely that the code compiles with a `catch`.
4. **Add the missing `pushApproval`-absent fixture** while there. Behaviour is
   identical to `PG11c` through the same optional chain, but the issue lists it
   separately and an unpinned equivalence is how equivalences stop being true.
5. **Then close #100** naming the exact commit and the test evidence, per its
   seventh criterion.

## The invariant this is an instance of — write it down once

Input from a parallel session, adopted: the handler is the more consequential of
the two remaining pieces, because it changes the **failure direction of the whole
guard family**. Today an undiscovered bug in an authority gate is automatically a
pass. With the boundary it is automatically a block. That is the difference between
a guard that works when the code is right and one that holds when it is not.

**And it is exactly why the boundary must not be rolled out everywhere.**
`guard-git`'s fail-open is a documented design decision — the source says "fail-open:
guard is a safety net, not a prison" — and it stays. A boundary applied to advisory
hooks turns them into prisons: a harmless bug in a hint-emitting hook would begin
blocking every command. The two errors are mirror images, and only one of them is
the subject of this item.

So the rule belongs in `guardrails/` once, as an invariant, rather than being
re-decided per file:

> **Advisory guards fail open. Authority-bearing gates fail closed** — including on
> an unexpected runtime fault. A hook's category is a property it declares, not
> something inferred from what it happens to do.

Authority-bearing today: the push gate, the approval gate, the testpath gate.
Advisory: `guard-git` among others. Writing the invariant is a separate, small
change from this item's fix and is deliberately not folded into it.

## Two tests, two different jobs

Recorded because losing the distinction under budget pressure would leave the
weaker half:

- The **fixture** — state valid, no `pushApproval`, approval `required` — proves
  *this location* is fixed.
- The **fault-injection** test — an artificial error raised mid-hook, asserting the
  block exit code rather than the warning one — proves *the next location does not
  matter*.

The second is the one that demonstrates the class rather than the instance. If only
one survives, it must be that one.

## Related

- GitHub issue #100 — the parent; this item is its residual, not a new defect.
- `2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md` — adjacent: a
  gate's behaviour under conditions nobody enumerated.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept, pull into `0.5.4`.
- **Rationale:** the PO reproduced it in a greenfield test, the fix is small and
  bounded (one boundary plus one test), and leaving it open would ship a `0.5.4`
  whose push gate is fail-closed only for the failure modes already enumerated.
- **Assignment (if accepted):** a `goldfish-deep` dispatch scoped to
  `plugins/pipeline-core/hooks/guard-push.mjs` and its test file.
- **Date:** 2026-08-08
