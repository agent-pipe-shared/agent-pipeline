---
schema: pipeline.backlog-item.v1
id: pipeline.invalid-channel-value-blocks-unrelated-alpha-ref-write
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — cross-field coupling in the calibration reader: a broken pipelineUpdateChannel value makes the unrelated pipelineUpdateAlphaRef field unwritable, with a reason code that names the wrong field."
source: "Found and proven by the NVA-B-ALPHAWRITE dispatch while building the alpha-ref writer (commit f8c85e09). Documented and covered by a test in the same commit rather than fixed, because the fix touches a read path that was deliberately protected in that briefing."
done_when: manual
---

# An invalid `pipelineUpdateChannel` value blocks an unrelated alpha-ref write

## What happens

`readCalibration` in `plugins/pipeline-core/scripts/pipeline-update-channel.mjs`
carries inline validation and duplicate-key detection keyed specifically to the
string `"pipelineUpdateChannel"`. There is no symmetric guard for
`"pipelineUpdateAlphaRef"`.

The consequence appeared as soon as the second field got a writer: a calibration
file whose *channel* value is invalid refuses a `plan`/`apply` of an unrelated
*alpha-ref* write, and refuses it with reason `invalid-channel` — a code naming
a field the operator was not touching.

The behaviour is currently pinned by a test in `pipeline-update-channel.test.mjs`
that documents it exactly. That test records the present state; it is not an
endorsement of it, and whoever fixes this should expect to change that test.

## Why it was not fixed on the spot

The NVA-B-ALPHAWRITE briefing explicitly forbade changing
`readProjectPipelineUpdateAlphaRef` and its reason codes, because those had
landed hours earlier against a specific Critic finding (F5, commit `2f1a4dc2`)
and re-opening them in the same day would have made both changes hard to review.

That prohibition was correct and the dispatch was right to respect it, but it
also means the coupling was measured rather than removed. The dispatch verified
the cost of the naive fix: generalizing the duplicate check flips an existing
passing test's expected reason from `malformed-configuration` to
`channel-unavailable`. So this is not a one-line change — it is a decision about
what a shared calibration reader should report when a field the caller did not
ask about is broken.

## The actual question to answer

Should a calibration reader fail the whole read when any single field is
malformed, or should it report per-field readability so that one broken field
cannot make an unrelated field unwritable? The second is almost certainly right
for a file that now carries at least two independent settings, but it changes
reason codes that other call sites already depend on, and
`plugins/pipeline-core/scripts/ruleset-freshness.mjs` is one of those call sites.

Related but distinct: a pre-existing duplicate `pipelineUpdateAlphaRef` key is
not refused before the write the way a duplicate channel key is. It does not
corrupt anything — the shared readback validation in
`applyPipelineUpdateAlphaRef` fails closed as `readback-failed, committed: true`
— but the failure arrives after the write rather than before it, and the
asymmetry with the channel field is unintended.

## Acceptance criteria

- Writing `pipelineUpdateAlphaRef` succeeds when the calibration's
  `pipelineUpdateChannel` value is invalid, and vice versa; neither field's
  validity gates the other's write.
- A reason code never names a field the caller did not address.
- Duplicate-key detection is symmetric across both fields, and refuses before
  the write rather than at readback.
- Every existing reason code that changes as a result is enumerated in the
  change, with each of its call sites checked — `ruleset-freshness.mjs` at
  minimum.
- The test that currently pins the coupled behaviour is updated to assert the
  decoupled behaviour, not deleted.
