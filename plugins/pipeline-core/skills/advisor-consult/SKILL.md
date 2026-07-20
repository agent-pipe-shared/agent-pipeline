---
name: advisor-consult
description: "Consent-gated advisory consult adapter for Epic and Feature. Codex uses a selected-sandbox Sol consult with Read/Grep/Glob/Bash; Claude retains its Fable/Opus then Read/Grep/Glob consult chain. One fresh question, no memory/handover/mutation, sanitized receipt only."
argument-hint: "<exactly one advisory question>"
---

# advisor-consult — runner-neutral, fresh read-only advisory

Normative route authority: `plugins/pipeline-core/config/runner-profiles-v3.json`.
Execution authority: `plugins/pipeline-core/lib/advisory-coordinator.mjs`.

Advisory is a **duty**, not a profile phase and not a Critic verdict. It is
eligible for `epic` and `feature`, disabled for `mini`, and additionally gated
by `pipeline.user.v3` `advisor_export.consent`. Missing or `declined` consent
is an accepted Advisory-off bootstrap state: no probe, child, export or
receipt. Its answer only informs the Elephant's own judgment. A consult never
edits files, applies its answer, changes a gate, or changes the main model.

## Registered routes

- **Codex:** fresh `consult-advisor` on the configured Codex route, currently
  Sol, is the registered adapter and the selected sandbox is its only
  transport. Typed unavailability, no-child, profile drift, incomplete
  stdio/cleanup or wrong identity stays fail-closed. There is no unbound host
  shell/consult fallback, invented native Codex advisor or Claude substitution.
- **Claude:** native Fable is primary. Only after its bounded repeated failure
  may the registered same-runner native Opus fallback run. If the native
  adapters remain unavailable or fail, a fresh hard-read-only Claude consult
  runs on the registered consult route.
- **Every route:** runner, role, selector and fallback order come from the V3
  registry. An adapter must not silently switch runner, main model, session
  role, or fallback order.

Call `coordinateAdvisory(...)`; do not manually recreate this chain. The
coordinator binds every attempt to the same question and candidate dispatch,
rejects runner drift, classifies adapter failures without retaining raw errors,
and emits the common `pipeline.advisory-receipt.v1`.

The production host entrypoint is
`plugins/pipeline-core/scripts/advisory-host-bridge.mjs`. Start it with a
temporary JSON input and a receipt target. For each `adapter.request` JSON line,
invoke exactly the named native host capability or fresh `consult-advisor`
subagent, then return the observed result as the matching `adapter.result` JSON
line on stdin. The bridge—not the host conversation—advances retries and
fallbacks, verifies the configured model identity, and atomically persists the
sanitized receipt. It consumes (unlinks) the temporary raw input before the
first adapter request. Exit 0 means answered; exit 2 means a typed fail-closed
advisory outcome; 64/70 are invocation/bridge failures. Never persist the
JSON-line runtime transport.

### Affected Codex sandbox host

On a registered affected Codex host, selection occurs before the first child:
the explicit host path obtains a `selectionId` from the committed selector and consumes it through
`sandboxed-readonly-host-bridge.mjs`. The only selected transport is the
documented network-open/read-only profile; compiled profile readback precedes
launch. `host-mode-unavailable` is a typed no-child outcome, not a request for
an unbound host consult or user-mode prose. The execution receipt binds the same dispatch and sanitized
duty receipt. Its assurance is exactly
`sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted`.

### PO-authorized functional-equivalent pass after a Codex sandbox stop

ADR-0041 records the PO's standing amendment for this repository. Only after
exactly one selected Codex sandbox attempt ends in a typed `no-child` or
`unavailable` outcome, the Elephant may request one fresh, host-internal direct
`consult-advisor` subagent as a **PO-authorized functional-equivalent pass**.
This is a local continuity lane, not an alternate native Codex transport: it is
local, fresh, hard-read-only, has exactly the same one question and no
handover, memory, repository mutation, network export, raw-answer persistence,
model-identity assertion or auto-apply. It must not retry, replace, repair or
mask the selected sandbox attempt.

If that one local consult returns an answer within those limits, it is
gate-capable advisory evidence for the affected PO gate, bootstrap/readiness
decision, Critic prerequisite, or Epic-close prerequisite. Its status is
`po-authorized-functional-equivalent`, not `answered` and not native sandbox
success. It is valid until the PO revokes it or a functional Codex CLI selected
sandbox becomes available, at which point the registered selected transport is
again required. A local consult failure, a second question, any mutation, or
any export is not a pass and has no further fallback.

The residual assurance is mandatory in every claim: **no attested
selected-sandbox execution; OS isolation and model identity are not asserted**.
It emits no `pipeline.advisory-receipt.v1` and no selected-sandbox execution
attestation. Retain only a sanitized functional-equivalent status record bound
to the candidate and question/answer digests; never retain raw question,
answer, prompt, transport, trace, private path, or error. This PO-authorized
functional-equivalent pass is the sole exception to the normal non-success
rule; it does not alter the native route, coordinator authority, or Claude
fallback order.

## Consult dispatch contract

The bound agent is `plugins/pipeline-core/agents/consult-advisor.md`:

- `subagent_type: consult-advisor`, never `general-purpose`;
- runner and model selector exactly as supplied by the coordinator;
- exactly **one string question** per dispatch;
- a genuinely fresh context: no chat history, handover, implementor rationale,
  inherited memory, or previous consult conversation;
- Claude hard tool allowlist `Read, Grep, Glob`;
- selected Codex hard tool payload `Read, Grep, Glob, Bash`; Bash exists only
  inside the exact selected `network-open/read-only` profile, with the checkout
  read-only and coordinator scratch as the sole writable root;
- no Write, Edit, memory, repository mutation or unbound host Bash;
- one returned prose answer, never auto-applied.

The coordinator payload carries these machine-checkable launch constraints:
`oneQuestion=true`, `freshContext=true`,
`contextPolicy=fresh-no-handover-no-chat-history-no-implementor-rationale`,
`tools=[Read,Grep,Glob]` for Claude or
`tools=[Read,Grep,Glob,Bash]` for selected Codex, `memory=false`, and
`autoApply=false`.

Host dispatch prompt (insert the coordinator's single question verbatim):

```
role=consult-advisor; runner/model are the coordinator-bound V3 route

You are a fresh, hard-read-only advisory consult. Use only the exact tools in
the coordinator payload (Claude: Read/Grep/Glob; selected Codex:
Read/Grep/Glob/Bash). You have no chat history, handover, implementor rationale
or memory. Selected Codex Bash must not be used to attempt mutation.

Answer exactly this ONE question from repository inspection, then stop:

{{THE_ONE_QUESTION}}

Return prose with file:line evidence where relevant. Do not mutate the
repository and do not frame the answer as a decision or auto-applied verdict.
```

A second question always requires a second fresh dispatch. If the question
cannot be answered within the read-only boundary, that limitation is the
answer; the boundary is never loosened.

## Receipt and privacy boundary

The runtime answer is returned separately to the Elephant. Outside the exact
ADR-0041 functional-equivalent status record, only the common advisory receipt
may be persisted. It contains SHA-256 bindings for question
and answer plus route, adapter, observed identity/status, candidate binding and
a redacted fallback class. It must never contain raw questions, raw answers,
prompts, traces, exception messages, credentials or private paths.

Outside the exact ADR-0041 PO-authorized functional-equivalent pass, an
invalid/missing receipt, wrong-provider identity, runner drift, malformed
adapter result or exhausted fallback chain is a failed advisory attempt. It
must not become an advisory-success, review, gate or conformance claim.
