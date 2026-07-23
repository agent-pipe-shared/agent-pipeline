---
name: advisor-consult
description: "Consent-gated fresh read-only Advisor for Epic and Feature. Codex uses one direct host-bound consult; Claude retains its Fable/Opus/consult chain."
argument-hint: "<exactly one advisory question>"
---

# advisor-consult — bounded advisory duty

The V3 registry is normative. Advisory is a duty, never a profile phase or a
Critic verdict. `epic` and `feature` are eligible; `mini` is disabled.
Missing consent resolves to `default` and is enabled without a per-run prompt;
only `declined` disables before any child, export or status.

## Codex

Resolve exactly `{ runner: "codex", profile, consent }` through
`codex-host-advisor-route.mjs`. For `epic|feature` and `default|approved`,
launch exactly one fresh project-scoped `consult-advisor`, immediately and
without a selected-sandbox, App-Server, native-adapter or other advisory
probe. The custom agent has fresh context, is read-only, receives one supplied question and
allowlisted repository evidence, and has no inherited chat, handover or
memory; no mutation, persistence, auto-apply, gate decision, separate network
tool or third-party export is allowed. The configured export to the configured
Codex provider is the sole export boundary.

The Elephant creates a one-use launch, observes the workspace before and after
the child, and validates the resulting `pipeline.host-advisor-status.v1`.
Only an `answered`, candidate-/launch-/question-bound, unchanged-workspace
status satisfies the normal Codex Advisory gate as `host-bound-consult`.
Failure, absence, retry, mutation or observed separate export is not a pass
and has no fallback. Codex never creates `pipeline.advisory-receipt.v1`.
Every claim says: `no attested selected-sandbox execution; OS isolation and model identity are not asserted`.

Codex selected-sandbox policy for Readiness and Critic is not Advisory policy
and remains unchanged.

## Claude

Claude uses the existing coordinator chain: bounded native Fable, then native
Opus, then the fresh read-only Claude consult. Its candidate-bound
`pipeline.advisory-receipt.v1` and fallback semantics remain unchanged.
