---
schema: pipeline.backlog-item.v1
id: pipeline.selected-critic-lane-contracts-unpinned
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
due: "2026-09-20"
tracking: "Nova B -- the selected-Codex-Critic lane (codex-critic-app-server.mjs) resolves roles/critic.md, templates/prompts/critic-review.md and the verdict schema against the live checkout with only an lstat, hands their paths into the child's prompt, and binds no digest of the briefed bytes into either receipt it constructs. The sibling native lane in codex-critic-host.mjs enforces pipelineRoot !== repoRoot, refuses a dirty ruleset checkout, and binds roleContractSha256/promptContractSha256/verdictSchemaSha256 into the prepared packet and the receipt. Under SEC-10's threat model an agent can edit roles/critic.md in the working tree, dispatch its own reviewer through the selected lane, and the tamper-evident execution receipt cannot show it."
source: "T1 Critic finding F3 on aefe0e9c/6ca241f1, 2026-09-06, on the NVA-B-CRITICXPORT-1 transport. Filed late: the round-1 registry dispositioned it as 'filed, not fixed here' and no item existed; the closing round tested that claim and found nothing -- this item is the correction."
---

# The selected Critic lane briefs contract files it neither pins nor binds

## The gap

`plugins/pipeline-core/scripts/codex-critic-app-server.mjs` resolves three
contract files against the live checkout — `roles/critic.md`,
`templates/prompts/critic-review.md`, and `critic-verdict.schema.json` — with
only a regular-file check, and hands their absolute paths into the in-sandbox
child's prompt. Neither receipt the lane constructs
(`codex-critic-selected-host.mjs`, the sandbox execution receipt and the
Critic receipt) records which contract bytes the child was actually briefed
with.

## Why the sibling lane's behaviour is the bar

The native Critic lane in the same file family enforces all three of what
this lane lacks: it takes an explicit `pipelineRoot`, refuses
`pipelineRoot === repoRoot`, refuses a dirty ruleset checkout, and binds
`roleContractSha256` / `promptContractSha256` / `verdictSchemaSha256` into
`prepared.bindings` and the receipt. The selected lane's own test fixture
sets `scratch.repoRoot` to the pipeline root — precisely the aliasing the
native lane refuses.

The Critic that raised this also established that the advisory precedent
the selected lane was mirrored from briefs no contract at all. So this lane
is the first selected-lane member to brief one, and it dropped the binding
rather than inheriting an omission.

## Consequence under the stated threat model

SEC-10: an agent edits `roles/critic.md` in the working tree, dispatches its
own reviewer through this lane, and the receipt — whose purpose is to be
tamper-evident — cannot show it.

## Why it is filed rather than fixed

Design-level. `pipeline.codex-sandbox-execution-receipt.v1` is a fixed
schema whose key set was not read during the review that found this, so the
remedy may be a schema extension rather than a field addition. The two
review rounds the transport package was allowed under the cap are spent.

## Not yet decided

- Mirror the native lane exactly: explicit `pipelineRoot`, root-separation
  refusal, clean-ruleset refusal, three digests into the receipt.
- Or narrower: digest the three files at brief time into the Critic receipt
  only, leaving the sandbox execution receipt's schema untouched.

`due` is set so the item cannot age silently past the 0.6.2 candidate.
