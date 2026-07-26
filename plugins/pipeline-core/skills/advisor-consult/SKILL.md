---
name: advisor-consult
description: "Consent-gated fresh read-only Advisor for Epic and Feature. Codex uses one bounded primary plus one smaller fallback; Claude retains its Fable/Opus/consult chain."
argument-hint: "<exactly one advisory question>"
---

# advisor-consult — bounded advisory duty

The V3 registry is normative. Advisory is a duty, never a profile phase or a
Critic verdict. `epic` and `feature` are eligible; `mini` is disabled.
Missing consent resolves to `default` and is enabled without a per-run prompt;
only `declined` disables before any child, export or status.

## Codex

Resolve exactly `{ runner: "codex", profile, consent }` through this one
productive CLI call:

`node "${PIPELINE_PLUGIN_ROOT}/scripts/codex-host-advisor-route.mjs" --runner codex --profile "{{PROFILE}}" --consent "{{CONSENT}}"`

Accept exactly one JSON line with exactly `route|policy`. Route is one of
`host-bound-consult|disabled-no-consent|disabled-by-profile`; policy is null
for disabled routes and otherwise must be
`pipeline.codex-host-advisor-policy.v1`. Do not pass `--root`, probe `--help`,
inspect the script, or retry with stdin. Empty output, nonzero exit, free text,
or a malformed route is an Advisor route adapter failure, recorded as
Advisory unavailable rather than consent or a pass.

For `host-bound-consult`, execute the returned policy literally. Record one
monotonic deadline for the complete attempt; polling never resets it. Launch
the primary `consult-advisor` once and wait at most its `timeoutMs`. If it has
not answered, interrupt it exactly once. Recompute the same workspace SHA-256
used at launch before doing anything else. Any workspace drift is a hard
Advisory integrity failure and stops bootstrap. With an unchanged workspace,
launch exactly one fresh fallback using the returned `agentName`, `model`,
`effort`, and `forkTurns`, the identical candidate/question/allowlisted
evidence, and no inherited chat. Wait at most its `timeoutMs`, then interrupt
it exactly once if still active. Never start a third attempt or continue
polling either child after its deadline.

The primary and fallback are fresh project-scoped advisory agents, each
without a selected-sandbox, App-Server, native-adapter or other advisory
probe. Each agent has fresh context, is read-only, receives one supplied question and
allowlisted repository evidence, and has no inherited chat, handover or
memory; no mutation, persistence, auto-apply, gate decision, separate network
tool or third-party export is allowed. The configured export to the configured
Codex provider is the sole export boundary.

The Elephant creates a one-use launch, observes the workspace before, between,
and after attempts, and validates the resulting
`pipeline.host-advisor-status.v1`. An `answered`,
candidate-/launch-/question-bound, unchanged-workspace status from attempt one
or two satisfies Codex Advisory as `host-bound-consult`. If both bounded
attempts fail or time out with an unchanged workspace, emit
`advisory-unavailable` and continue bootstrap without an Advisory-pass claim;
Advisory is non-blocking and the Elephant retains its ordinary judgment duty.
Mutation or observed separate export remains a hard failure. Codex never
creates `pipeline.advisory-receipt.v1`.
Every claim says: `no attested selected-sandbox execution; OS isolation and model identity are not asserted`.

Codex selected-sandbox policy for Readiness and Critic is not Advisory policy
and remains unchanged.

## Claude

Claude uses the existing coordinator chain: bounded native Fable, then native
Opus, then the fresh read-only Claude consult. Its candidate-bound
`pipeline.advisory-receipt.v1` and fallback semantics remain unchanged.
