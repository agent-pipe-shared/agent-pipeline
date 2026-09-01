---
schema: pipeline.backlog-item.v1
id: pipeline.no-check-holds-the-shipped-copies-of-push-release-flow-in-agreement
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Round-K Critic finding F3 and the NVA-B-ROUNDK-FIX dispatch's own measurement of TEMPLATE_PAIRS in plugins/pipeline-core/scripts/check-vendored-template-sync.mjs and of plugins/pipeline-core/scripts/push-release-flow-docs-contract.test.mjs."
---

# No check holds the shipped copies of `push-release-flow.md` in agreement

## The defect

`docs/push-release-flow.md` exists three times in this repository: the root
copy, `plugins/pipeline-core/docs/push-release-flow.md`, and a third
description of the same invocation in
`plugins/pipeline-core/skills/pipeline-start/references/push-approval.md`.
The plugin-side copies are the ones a hosted session actually reads.

Nothing asserts they agree.

- `TEMPLATE_PAIRS` in
  `plugins/pipeline-core/scripts/check-vendored-template-sync.mjs` covers
  `goldfish-task.md` and `critic-review.md` only.
- `plugins/pipeline-core/scripts/push-release-flow-docs-contract.test.mjs`
  checks documented argv against the real flag parsers, but carries no
  `push-init` case at all.

## How it surfaced

`7d56917c` changed `push-init.mjs`'s argument contract and updated only the
root copy. A full verify ran green over that commit. The divergence was found
by an independent review, not by a gate — the two plugin-side copies went on
documenting an invocation that the driver now refuses with
`status: "candidate-required"`.

`3f92cae8` corrected all three copies, and also the root copy's own summary
table, which was stale in the same way. That closes the instance. It does not
close the class: the next change to this document can recreate the divergence
and nothing will say so.

## Why it matters beyond tidiness

The document describes the push authorization flow. A hosted session
following the plugin-shipped copy issues a command that cannot pass Layer 1b
in any project where the reconciliation script exists. The failure is loud
rather than silent — the driver names its own remedy — so the cost is a retry
plus divergent canon rather than a wrong authorization. That is why this is a
defect and not an incident.

## Direction

Either add the `push-release-flow.md` pair (and the `push-approval.md`
reference) to `TEMPLATE_PAIRS`, or give
`push-release-flow-docs-contract.test.mjs` a `push-init` case that reads the
driver's own `usage()` string and asserts every documented invocation
contains it. The second is closer to what the existing suite already does for
the other drivers, and it catches a stale invocation even when the two copies
agree with each other and are both wrong.

## Acceptance

- A check fails when any one of the three documented `push-init` invocations
  diverges from `parseArgs()`/`usage()` in `plugins/pipeline-core/scripts/push-init.mjs`.
- That check is registered in `harness/scripts/verify.mjs`.
- The check is proved by breaking one copy, confirming RED, restoring,
  confirming green.
