---
schema: pipeline.backlog-item.v1
id: pipeline.a-stale-verify-opt-out-entry-costs-a-po-signature-for-work-already-done
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 37b35524872ec575cf351a174e6dc4f92745c109
closure_evidence: plugins/pipeline-core/scripts/check-suite-registration.test.mjs
sprint: nova
done_when: contains plugins/pipeline-core/scripts/check-suite-registration.mjs pipeline.opt-out-staleness-is-fatal
source: "Observed while registering the done_when predicate suite in verify.mjs, 2026-08-29: two of the three DELIBERATELY_UNREGISTERED entries described suites that were in fact already registered, and clearing them was part of the work that consumed a live PO signature ceremony."
---

# A stale verify opt-out entry costs a PO signature for work already done

## What happened

`check-suite-registration.mjs` keeps an explicit opt-out list,
`DELIBERATELY_UNREGISTERED`, naming test suites that are knowingly absent from
`harness/scripts/verify.mjs`. Each entry carries a stated reason, and the
checker rejects an entry without one — so the list is well-guarded against
being *sloppy*, but not against being *stale*.

When the `done_when` predicate suite was registered, the list held three
entries. Only one of them was still true. The other two named suites that had
since been registered in `verify.mjs` anyway; they described a state of the
world that no longer existed and had been quietly wrong for some time.

`verify.mjs` is a `protectedTestPaths` (TP-3) file. Editing it requires the
full human-guard-override signature ceremony: seed a denied call, `plan`,
`prepare-authorization`, `emit-signature-digest`, an external Ed25519
signature from the PO, `authorize-by-signature`, then a byte-identical retry.
Clearing the two stale entries rode along inside that ceremony.

## Why this is worth fixing rather than tidying

The PO's stated acceptance bar for this release is five human touches. The
external-key signature is the one act in the whole model that cannot be
delegated to an agent, by design — it is the thing standing between an agent
and the protected files. Every avoidable signature spends a scarce, manual,
irreplaceable resource.

A stale opt-out is precisely such an avoidable cost: the list claimed work was
outstanding when it was already done, and correcting that bookkeeping had to
be smuggled into a ceremony seeded for a different purpose. The failure is not
that the list was wrong once — it is that **nothing can ever notice it is
wrong.** The checker verifies that a registered suite is registered and that
an opt-out has a reason; it never verifies the converse, that an opted-out
suite is still genuinely unregistered.

This is the same shape as the defect class this repository already treats as
its core concern: a declaration nothing mechanically checks. Note that the
list is currently empty (`Object.freeze([])`), so there is nothing stale in it
right now — this item is about the missing check, not about a present-day bad
entry. An empty list is not a fix; the next entry added will have exactly the
same property.

## Where it is

`plugins/pipeline-core/scripts/check-suite-registration.mjs`:

- `DELIBERATELY_UNREGISTERED` — line 124, currently `Object.freeze([])`.
- the usage check rejecting a reason-less entry — described at line ~66.
- `compareSuiteRegistration({ enumeratedPaths, registeredPaths, optOut })` —
  line ~527, the pure comparison; it consumes `optOut` to suppress findings,
  and has all three inputs in hand to detect the stale case.
- `main()` — line ~564, where the real list is passed in.

## Proposal

Make a stale opt-out a **fatal** finding of the checker, not a silent
suppression:

- In `compareSuiteRegistration`, when an `optOut` entry's path appears in
  `registeredPaths`, emit a finding of its own — the entry claims the suite is
  deliberately unregistered, but `verify.mjs` registers it. This needs no new
  input; both sets are already parameters.
- Make that finding fatal, matching how the `done_when` checker treats
  STALE-OPEN. The parallel is exact: a declaration that has quietly become
  false, where the only cost of leaving it is that someone later pays to
  discover it.
- Place a `pipeline.opt-out-staleness-is-fatal` marker at that check.

Independently of the checker, and cheaper still: an entry could also carry the
commit or item that would retire it, so the list ages visibly rather than
invisibly. Noted as an option, not required for acceptance — the mechanical
check is the part that actually enforces anything.

## Acceptance

- An `optOut` entry naming a path that `verify.mjs` registers produces a
  fatal finding, exercised by a fixture test that does not depend on the real
  repository's current list.
- The real repository still passes, since the list is empty.
- The finding names the entry and the fact that the suite is registered, so
  the remedy is to delete the entry — never to unregister the suite.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** small, pure-function change with no protected-path edit of
  its own, and it defends the scarcest resource in the operating model. The
  cost it prevents was paid in full once already, in a live ceremony, on the
  day this item was filed.
- **Assignment:** `sprint: nova`. Not a candidate blocker — the list is
  empty, so no stale entry exists today — but it belongs in the same pass as
  the sibling ceremony-ergonomics item filed the same day.
- **Date:** 2026-08-29

Fixed, 2026-08-29 (dispatch NVA-R12-OPTOUTSTALE, commit `37b35524`).

Verified directly by the dispatcher: `check-suite-registration.test.mjs`
30/30 exit 0, including the two new fixture tests by name (stale-opt-out-is-
fatal, stale-even-when-absent-from-enumeratedPaths). Marker confirmed with
`rg`. Real repository's `DELIBERATELY_UNREGISTERED` list is empty, so this
check's own new logic produces no finding, satisfying the item's Acceptance.

Running the checker fresh, unrelated to this fix, surfaced a genuine
pre-existing gap worth recording rather than acting on now:
`plugins/pipeline-core/scripts/resume-hint.test.mjs` (the CLI wrapper's own
test, added by this session's `c3020e1d`) is not registered in
`harness/scripts/verify.mjs` — only the library test
`plugins/pipeline-core/lib/resume-hint.test.mjs` is. `verify.mjs` is TP-3
protected, so registering it needs a signature ceremony; queued to batch
with the other verify.mjs-touching items rather than spent alone.
