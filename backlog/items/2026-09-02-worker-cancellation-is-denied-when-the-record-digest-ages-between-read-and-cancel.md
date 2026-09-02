---
schema: pipeline.backlog-item.v1
id: pipeline.worker-cancellation-is-denied-when-the-record-digest-ages-between-read-and-cancel
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: fc04dbc82118a9e5c201fbe05ef92965b7ab2576
closure_evidence: backlog/evidence/2026-09-03-nva-b-lwsc04-1-green-heartbeat-excluded-from-digest.txt
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

## Measurement, 2026-09-02 — the hypothesis is confirmed, and it grows

The Proposal above asks one decisive question: does `recordSha256` cover
`lease.lastHeartbeatMonotonicMs`? It does. Four lines of
`plugins/pipeline-core/lib/local-worker-supervisor.mjs` settle it by reading,
with no run required:

- **line 267** — the record's exact key set includes `"lease"`, and
  `record.recordSha256 = unsignedDigest(record, "recordSha256")` (lines 887,
  892, 902) digests the entire record except that one field. The lease is inside
  the digest.
- **line 277** — `lease`'s own exact key set includes
  `lastHeartbeatMonotonicMs`. It is a validated part of the record, not a field
  the digest incidentally reaches.
- **line 1018** — `record.lease.lastHeartbeatMonotonicMs = now`, written by the
  heartbeat at `lease.heartbeatMs`, which the fixture sets to 1000 ms.
- **line 1224** — the `cancel` route refuses unless
  `record.recordSha256 === expectedRecordSha256`.

So a caller's digest is invalidated once per second by a heartbeat the caller
cannot pause, and the `LWS-CANCEL-DENIED` seen in CI is the route behaving
exactly as written. `LWSC04` loses a race it was always going to lose on a
sufficiently slow machine. Acceptance criteria 1 and 2 are met by the four line
citations above.

**The consequence is larger than the flaky test, and this is where the item
changes shape.** The Proposal offered a product change only as a conditional
second half, to be considered "only if no realistic client can win this race".
That condition is now met by construction rather than by measurement of luck: a
compare-and-swap whose expected value changes on a timer cannot be won reliably
by any caller that has to spawn a process between reading the digest and acting
on it, which is what the CLI does and what any real client would do. Fixing only
the test — re-read plus bounded retry — turns the suite green and leaves every
client retrying a CAS in a loop against a 1 Hz invalidator.

The design question to answer before choosing a fix: what is the heartbeat doing
inside the digest that `cancel` compares? It carries liveness, not identity. The
dispatch, candidate, plan, pool and worker set are each separately digested
already, and a cancel route comparing a digest over the identity fields alone
would be exactly as safe against cancelling the wrong record while not being
invalidated by the mere passage of time.

That is a change to a safety-relevant compare-and-swap. It belongs to a briefed
dispatch with its own independent review, not to a fix whose goal is a green
suite — which is why this item is NOT being folded into the two CI test-fix
dispatches (`NVA-CIGREEN-1`, `NVA-CIGREEN-2`) alongside it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Triage, 2026-09-03 — hypothesis confirmed by measurement, then narrowed rather than weakened

This item filed a hypothesis, not a finding, and named the measurement that
would settle it. The measurement was taken (`NVA-B-LWSC04-1`) and the
hypothesis holds.

**How it was established.** A new regression case (`LWSC05`) waits past one real
heartbeat tick, asserts that the heartbeat advanced while `status` and worker
state did not, and only then cancels using the pre-heartbeat digest. Against the
unfixed code that cancellation was denied with `LWS-CANCEL-DENIED` *after* the
prior assertions had already proven nothing about identity or intent had
changed. RED capture:
`backlog/evidence/2026-09-03-nva-b-lwsc04-1-red-heartbeat-ages-digest.txt`.

**The fix, and why it is a narrowing and not a weakening.** `unsignedDigest()`
now excludes `lease.lastHeartbeatMonotonicMs` — one leaf field, rewritten once
per `lease.heartbeatMs` by the supervisor itself, independent of anything the
record's holder decided. Verified at the dispatcher's side rather than taken
from the report:

- `lease` is constructed at exactly one place in the module and lives only on
  the record, so no other digested shape (`resultSha256`, `planSha256`,
  `markerSha256`, `cancelSha256`) is silently narrowed by the same edit.
- The heartbeat writer touches only that field. `cleanupExpiresMonotonicMs`
  stays inside the digest — and that is the lease field the cancel and cleanup
  routes actually gate expiry on, so the security-relevant part of the lease is
  still covered by the compare-and-swap.
- The same heartbeat block can flip `record.status` to `recovery-required` and
  move a worker's state. Those stay in the digest, so a cancellation issued
  against a digest that missed such a change is still correctly denied.

The digest now covers identity and intent, not the tick. Neither of the two
shapes the briefing forbade — relaxing the equality check, or papering over the
race with a retry or tolerance window — was used; a retry would have
reintroduced the same failure on a loaded runner, which is exactly where it was
first observed.

`91f9bc45` carries the fix; `fc04dbc8` replaces a fixed sleep margin in the new
case with a poll for the actual tick, so the regression test does not itself
depend on runner speed — the property that made the original failure CI-only.
`node --test plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs`:
10/10, re-run by the dispatcher.
