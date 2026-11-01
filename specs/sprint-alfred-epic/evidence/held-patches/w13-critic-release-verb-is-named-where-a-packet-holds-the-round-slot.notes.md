# Held patch: the release verb is named where a Critic packet holds the round slot (N21, part 1)

Built by the Elephant (small-fix exception, held patch in a scratch clone, tree untouched) on `db53d7f97`. Item
`backlog/items/2026-10-30-expired-critic-packet-holds-the-round-slot.md`. Re-read before the work: still open for wanted point 1 (the two refusal texts
did not name `session-critic-finalizer release`); wanted point 2 (truncated text) is already gone: the `CGB-BUDGET` text is long and complete.

## What changes

- `plugins/pipeline-core/lib/critic-generic-batch.mjs`:
  - `TAKEOVER_REPAIR["CGB-TAKEOVER-OPEN"]` now names the release command: `node ${PIPELINE_PLUGIN_ROOT}/scripts/session-critic-finalizer.mjs release
    --root <root> --request <file>` with a request of schema `pipeline.session-critic-release-request.v1` carrying `packetId` and `reason`
    (read from `scripts/session-critic-finalizer.mjs` 886-892).
  - The "round already reserved" `CGB-BUDGET` text gains one sentence: an expired reserved packet (`CPP-EXPIRED`) or one claimed by an abandoned attempt is
    released with the same verb and the round asked for again.
- Tests: `lib/critic-generic-batch.test.mjs` +1 assertion in CGB037 (the inspect result's `repair` names the verb and the request schema); the pinned
  VCR01 count of `critic-generic-batch-tests` 115 -> 116 in `harness/scripts/check-verify-case-completion.test.mjs` (set here, once).
- `skills/critic-review/SKILL.md` (table row of `CGB-TAKEOVER-OPEN`) is NOT touched: that skill is bound by the Critic preimage pins, a change is a PO re-pin act.
  The row still says "finish or release it first", which stays true.

## Not done (stays open in the item)

Wanted point 1 first half, `admit` releasing an expired packet's reservation itself, and wanted point 3, the packet lifetime in the admit result: both are
behaviour changes in the admission path and need their own slice.

## Evidence (targeted, in the scratch clone)

`critic-generic-batch.test.mjs` 38/38, `critic-course-admission.test.mjs` and `session-critic-finalizer.test.mjs` 173/173, `check-verify-case-completion.test.mjs`
32/32. `git apply --check` on `db53d7f97` passes. Not done: Full Verify, batch Critic, native Windows, a revert proof.
