---
schema: pipeline.backlog-item.v1
id: pipeline.selected-critic-lane-contracts-unpinned
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: none
done_when: manual
tracking: "Future native-Windows Codex sandbox package -- the selected-Codex-Critic lane (codex-critic-app-server.mjs) resolves roles/critic.md, templates/prompts/critic-review.md and the verdict schema against the live checkout with only an lstat, hands their paths into the child's prompt, and binds no digest of the briefed bytes into either receipt it constructs. The sibling native lane in codex-critic-host.mjs enforces pipelineRoot !== repoRoot, refuses a dirty ruleset checkout, and binds roleContractSha256/promptContractSha256/verdictSchemaSha256 into the prepared packet and the receipt. Under SEC-10's threat model an agent can edit roles/critic.md in the working tree, dispatch its own reviewer through the selected lane, and the tamper-evident execution receipt cannot show it."
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

The remaining installed-package/native-execution surface has no 0.6.2 delivery
date. It is explicitly deferred to the future native-Windows package alongside
the existing `sprint: none` items for
[worker sandbox selection](2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn.md)
and [fallback routing](2026-09-06-the-t1-fallback-waits-for-failure-codes-the-route-collapses-before-they-arrive.md).

## Nova B implementation — 2026-09-11

Commit `61177860` closes the source-checkout execution gap. The selected lane
now requires a physically separate and completely clean ruleset checkout,
compares the three contracts and the complete static child module graph with
`HEAD`, snapshots those verified bytes into a private read-only directory, and
executes that snapshot. Its receipt binds the role, prompt, verdict-schema,
child-executable and module-graph digests plus the ruleset Git identity. An
adversarial test replaces the original child after validation and proves the
snapshot still executes against a local model-free App Server.

The correction also removes caller-provided install provenance. Gitless and
other pre-spawn refusals now remain typed `ruleset-unavailable` with
`childStarted: false` through the shared bridge. The focused host suite passes
129/129, the protected-preimage suite passes 4/4, and the independent
correction Critic returned PASS with no findings.

The item remains open for one deliberately unclaimed surface: installed
Gitless Selected-Critic packages need an installer-owned attestation and
verifier before this route can run from a normal plugin cache. Until that
authority exists, this special Selected route fails closed. The ordinary
fresh-session Critic route does not depend on this installed Selected route.

## Triage

- **Decision:** deferred — retain the completed source-checkout hardening, but
  move installed-package activation and native App-Server/sandbox acceptance
  to the dedicated native-Windows Codex work package outside Nova B.
- **Rationale:** The PO confirmed on 2026-09-11 that native Codex sandboxing is
  not a reliable acceptance environment under WSL. The special Selected route
  already fails closed, while the ordinary fresh-session Critic remains the
  supported autonomous route. Revisit when the lane can be exercised on
  native Windows without treating WSL behavior as proof.
- **Assignment:** future native-Windows Codex sandbox hardening
- **Review expiry:** 2026-12-15 — re-triage date, not a delivery promise
- **Date:** 2026-09-11
