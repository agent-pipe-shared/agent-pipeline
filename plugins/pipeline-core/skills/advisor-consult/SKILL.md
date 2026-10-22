---
name: advisor-consult
description: "On-demand, consent-gated fresh read-only Advisor for one concrete Epic/Feature question. Requires a reason and digest-bound evidence; never runs merely because bootstrap, resume, Compact, a route, or consent occurred."
argument-hint: "<exactly one concrete advisory question>"
---

# advisor-consult — demand-bound advisory duty

Use this skill only when the Elephant has one concrete question whose answer
would materially improve a current decision. The frozen V3 registry remains
the route/fallback authority. The versioned
`pipeline.advisory-lifecycle-policy.v2` controls when consultation is allowed.
Advisory is a duty, never a profile phase or a Critic verdict.

## Trigger gate

Before any child, model request, prompt export or timeout:

1. Confirm project-onboarding readiness FIRST, before requesting or recording
   any Advisor-export consent from the human: this is the same check
   `codex-advisory-bootstrap.mjs` already performs internally via
   `requireProjectOnboardingReady` (its first statement, ~line 85, ahead of
   even its own consent check). If that check fails (`PORG-NOT-READY`), do not
   request consent and do not proceed to the steps below — surface it to the
   human as "the Advisor isn't reachable right now" and stop.
2. For runner `codex`, inspect the ordinary fresh-consult host capability
   before preparing any prompt-bearing dispatch. The older selected-sandbox
   route may still return `advisory-unavailable-wsl-native-deferred` on WSL;
   that result says nothing about the separate ordinary consult. The host must
   explicitly admit export and observe a fresh read-only child. If it cannot,
   write a no-child route-selection record and a sanitized unavailable receipt
   for the narrow final-package PO exception. Do not claim a model call, child
   attempt or answer from route selection. Native Windows remains unverified
   until a tested host capability is present.
3. Require profile `epic` or `feature`, repository Advisor-export consent that
   is not `declined`, exactly one bounded UTF-8 question, bounded allowlisted
   evidence and exactly one reason:
   `architecture-tradeoff|decision-ambiguity|evidence-conflict|recovery-choice|risk-review`.
4. Bind runner, profile, reason, question SHA-256, evidence SHA-256, dispatch
   ID/revision, candidate commit/tree, V2 policy digest and frozen V3 route
   digest in one closed `pipeline.advisory-demand.v2`. When the trusted host
   has a current Claude session selection for `duty.advisory.fallback`, it
   reconstructs the demand as `pipeline.advisory-demand.v3`, binding that
   exact selected model, effort and private-store readback digests. The
   session ID itself is never copied into the demand. Never persist the raw
   question or answer in either demand version.
   The evidence SHA-256 is derived from one canonical
   `pipeline.advisory-evidence-bundle.v1`, not accepted as a caller assertion.
   The bundle contains 1–32 sorted, unique, repository-relative physical
   regular files, at most 262,144 UTF-8 bytes each and 1,048,576 bytes in
   total. Every entry binds path, byte length, content and content SHA-256.
   Symlinks, path escapes, malformed UTF-8, duplicate or unsorted paths,
   content drift and a supplied digest mismatch fail before any child or model
   effect.
5. Reject session start, profile selection, restart, resume, re-entry, Compact,
   unchanged handover, a configured route or consent alone. They are not
   consultation reasons.
6. Compare any prior `pipeline.advisory-consultation-record.v2`. The same
   `reuseKeySha256` is `reuse-no-repeat`: launch no child and make no model
   request. A changed question, reason, evidence, candidate or route-policy
   digest is material drift and requires a new demand.

Missing, malformed, stale or mismatched demand is
`advisory_demand_required`/`advisory_demand_binding_mismatch`, never Advisory
unavailable and never permission to invoke an adapter.

## Codex consultation

The ordinary host route is a fresh `consult-advisor` dispatch. Its admission
requires current repository export consent plus the host's own export decision
and executable child capability. Only after both are admitted may the host
construct or emit the bounded question and allowlisted evidence packet.
The host observes the actual dispatch, child completion, route/model readback
and result bytes. The receipt binds the candidate, question/evidence and
answer digests to that observation; an agent-supplied JSON result is never
host execution proof. A route without a host-owned callback is unavailable,
not an invitation to use the old selected-sandbox/App-Server adapter. A host
export denial is terminal for this request, with no alternate egress.
Without a sealed host-owned executor installed on the host, Codex's ordinary
route produces only the no-child unavailable record below
(`ordinary-consult-host-callback-unavailable`), even if export admission is
reported as available. Do not call that an answered Advisor run. With one, the
bridge calls it only after the host reports `admitted`, never after a denied,
declined, missing or unavailable decision, and reports an answer only when
`verifyAnsweredAdvisoryReceipt` binds candidate, configured and observed route,
question digest, evidence digest, the host execution record and the answer
digest. A result that does not bind is reported with its typed
`advisory_answered_*` code and repair, or as `advisor-host-execution-unavailable`
when the executor failed or returned nothing; it is never an answer, and since
an attempt may already have started it is not described as a no-child
decision. The executor is a host dependency, never stdin input. Every
no-child refusal carries a `repair` that names the alternative: continue
without an Advisor, because an on-demand Advisor is optional and no design
stage requires one (ADR-0085).

The no-child path records a closed `pipeline.advisory-route-selection.v1`
beside the sanitized receipt. It has `attemptCount: 0`, `childStarted: false`
and no observed identity or answer. This selection is not a row in
`pipeline.advisory-attempt-trail.v1`, which remains reserved for actual native
or consult invocations. The design package may present it only as a proposed,
scoped unavailable exception for the one final PO package decision; it grants
no implementation authority by itself.

The advisory agent starts fresh and is project-scoped. It receives only the
bound question and allowlisted evidence, has no inherited
chat, handover or memory, and may not mutate, persist, auto-apply, decide a
gate, use a separate network tool or export to a third party. Workspace drift
is a hard integrity failure. The Elephant retains the decision duty.

The launcher, host bridge and selected App Server transport validate the same
canonical evidence-bundle digest independently. Only then may the child render
the exact bundle contents into the one model turn, explicitly marked as
untrusted repository data rather than instructions. Raw evidence remains
runtime-only and is never added to the demand, consultation record or receipt.

The Elephant validates the host execution independently before treating an
ordinary consult as answered. No OS isolation or provider attestation follows
from an ordinary fresh read-only role alone. The older
`pipeline.host-advisor-status.v1` and selected-sandbox workspace observations
describe only that separate transport and cannot attest the ordinary route.

## Supported runner/platform matrix

Each row is pinned by `codex-wsl-required-advisor-has-no-completable-route`;
a row marked unverified has no tested route and must be reported as unavailable.

| Runner and route | Platform | Tested outcome |
| --- | --- | --- |
| Codex ordinary consult (admission, then sealed host-owned executor) | Linux and WSL (WSL deferral does not apply to this route) | No-child unavailable by default; answered only through the executor and the answered-receipt verifier; exercised with a managed Node stand-in, no real model call |
| Codex selected-sandbox/App-Server route | WSL | `advisory-unavailable-wsl-native-deferred`, typed, before any evidence or child work, with reason `wsl-sandbox-preflight-not-passed` and one repair (`codex-sandbox-preflight.mjs --run --kind intermediate`); a passing intermediate WSL2 preflight receipt lifts it to the host route, subject to the same admission and verifier (PO decision 2026-10-22) |
| Codex selected-sandbox/App-Server route | native Linux | Host route, subject to the same admission and verifier |
| Codex, native Windows | native Windows | unverified until a tested host capability is present |
| Claude native Opus then consult | any | V3 route below |

A real answered run on a given host still needs that host's own export approval;
no test or fixture substitutes for it.

## Claude consultation

After the same trigger gate, Claude uses the V3 native Opus route: native Opus,
then one fresh read-only Claude consult only after repeated native-Opus failure.
The native call remains exactly the V3 Opus route. For the consult fallback only,
the host reads the current session's admitted functional route
`duty.advisory.fallback` (`frontier`) and uses its exact model ID at the V3
fallback effort. The receipt binds that route to the private session readback by
digest, without persisting the session ID. If the optional selection is absent,
damaged or incompatible, the consult uses the exact registered V3 Opus fallback;
it does not block the valid V3 call. Neither path switches runner. The
coordinator persists only the sanitized `pipeline.advisory-receipt.v1` plus the
V2 consultation record; raw question, answer, prompt, trace and adapter error
remain runtime-only.

## Separation from bootstrap

`pipeline-start` owns only `pipeline.advisory-capability-preflight.v2`. It never
invokes this skill, either runner's Advisor route, `codex-advisory-bootstrap.mjs`,
or a consultation budget. Capability state is not consultation success, and a
consultation receipt is not bootstrap readiness.
