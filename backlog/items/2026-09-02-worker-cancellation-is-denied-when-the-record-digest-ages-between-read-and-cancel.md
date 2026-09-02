---
schema: pipeline.backlog-item.v1
id: pipeline.worker-cancellation-is-denied-when-the-record-digest-ages-between-read-and-cancel
type: defect
owner: pipeline
status: open
created: 2026-09-02
source: "GitHub Actions run 33595311782 (push to main, commit 6262d408), job verify, suite local-worker-supervisor-cli-tests, check LWSC04"
sprint: nova-b
---

# Worker cancellation is denied when the record digest ages between reading it and cancelling

## Description

`local-worker-supervisor-cli-tests` exited 1 in CI run `33595311782`. `LWSC01`–`LWSC03` passed; `LWSC04`
("accepts an exact cancellation intent, drains the owned child, and permits cleanup") failed at
`plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs:481`:

```
assert.equal(cancelled.status, 0, cancelled.stdout)   →   actual 2, expected 0
{"schema":"pipeline.local-worker-supervisor-cli.v1","ok":false,"code":"LWS-CANCEL-DENIED", …}
```

All nine checks pass locally.

Unlike the two sibling CI failures from the same run, **this one's cause is not established.** It is
recorded here as a hypothesis with the evidence that supports it and the measurement that would settle
it — deliberately not as a finding.

## Triggering situation

The failing sequence is a compare-and-swap. The test waits for the record to reach `status: "running"`,
keeps that snapshot's `recordSha256`, then invokes the CLI's `cancel` with that digest:

```js
const running = await waitForRecord(context, (record) => record.status === "running");
…
const cancelled = invoke(["cancel", "--state-root", context.stateRoot,
                          "--record-sha256", running.recordSha256, "--activate"], context);
assert.equal(cancelled.status, 0, cancelled.stdout);
```

The denial's payload names the record the supervisor actually holds. Two of its fields are the lead:

```
"lease": { "heartbeatMs": 1000, "orphanAfterMs": 3000, "lastHeartbeatMonotonicMs": 150350, … }
"workers": [ { … "startedMonotonicMs": 150160, "state": "running" } ]
```

**Hypothesis.** `lease.lastHeartbeatMonotonicMs` is part of the record, and therefore part of
`recordSha256`. The heartbeat fires every 1000 ms. Between `waitForRecord` returning a snapshot and the
`cancel` child process actually reading the record, at least one heartbeat lands on a loaded runner, the
digest the test holds is no longer current, and the supervisor correctly refuses a compare-and-swap
against a stale digest. On the developer machine that window is far under 1000 ms and the test always
wins the race.

If that is right, `LWS-CANCEL-DENIED` here is **correct product behaviour** and the defect is entirely in
the test, which assumes it can read a digest and spend an unbounded amount of wall-clock time before
using it. The product question that would remain is a separate and much smaller one: whether a caller can
ever cancel a *healthy* worker at all, given that its digest is invalidated once per second by a
heartbeat the caller cannot pause — a CAS whose expected value changes on a timer is not obviously usable
by any real client, and that is worth answering even if the test is what gets fixed.

## Affected artifact

- `plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs`, `LWSC04` (lines ~455–490),
  `waitForRecord` and `invoke`
- `plugins/pipeline-core/scripts/local-worker-supervisor.mjs` — the `cancel` route's digest comparison
  and the record shape fed into `recordSha256`

## Proposal

**Measure before changing anything.** The decisive question is one line of reading: does
`recordSha256`'s input include `lease.lastHeartbeatMonotonicMs`? Answer it directly in the supervisor
source, then reproduce by inserting a delay longer than `heartbeatMs` between `waitForRecord` and the
`cancel` invocation on a local machine. If the local suite then fails with `LWS-CANCEL-DENIED`, the
hypothesis is confirmed and the mechanism is exact, not inferred from CI timing.

If confirmed, the fix has two independent parts and both should be considered:

1. **The test** re-reads the record immediately before cancelling, and retries the CAS a bounded number
   of times on `LWS-CANCEL-DENIED`, which is what any real client would have to do. The retry must stay
   bounded and must still fail the check if the denial persists — an unbounded retry would hide a genuine
   regression in the cancel route.
2. **The product**, only if the answer to the question above is that no realistic client can win this
   race: exclude the heartbeat from the digest the cancel route compares, or give `cancel` a digest that
   identifies the *dispatch* rather than the *liveness* of the record. This is a design change to a
   safety-relevant compare-and-swap and must not be made merely to turn a test green.

If the hypothesis is **not** confirmed, discard it and start from the record dump above — it is the
complete supervisor state at the moment of the denial and should be enough to identify what actually
differed.

## Acceptance

1. The hypothesis is confirmed or refuted by direct measurement, with the result recorded here.
2. The real cause is named with the exact line(s) responsible, in the same register as
   `pipeline.ci-path-allowlist-omits-the-editor-the-guards-own-continuation-names` names its own.
3. A fix lands, on the side the measurement actually implicates.
4. `local-worker-supervisor-cli-tests` reports `=0` in an actual CI run, and the check is no longer
   sensitive to machine speed — demonstrated, not assumed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
