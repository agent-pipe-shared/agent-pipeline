# APPROVAL-6 responsibility rationale

This mapping separates accepted obligations from an implementation that may be
partial. The raw, command-produced source evidence is
`scratch/NVA-B-ADR-GOVERNS-APPROVAL-6/raw-source-capture.md`; this file records why each owner is in a declaration
and where the ADR itself preserves a boundary or deferred gap.

## ADR-0041 — selected-sandbox Advisor transport

`codex-host-advisor-route.mjs` and its direct test own the bounded Codex route.
`advisory-host-bridge.mjs`, the App-Server child/runtime/selection/read-only
bridge/workspace-observation sources and their direct tests own the selected
sandbox, one child, identity, cleanup, and before/between/after workspace
checks. The advisory receipt schema, coordinator, receipt validation and
private-state assurance own the persisted evidence and its durability/readback.
`consult-advisor.md`, its skill, and `roles/elephant.md` own the canonical
fresh-context/read-only use boundary.

`advisory-lifecycle-v2.mjs` is intentionally included: it validates the
concrete demand and evidence bundle that the transport consumes. It does not
own *when* a demand should exist. ADR-0041 explicitly assigns that trigger
semantics to ADR-0047, so ADR-0047 is a successor boundary rather than an
omitted transport target.

## ADR-0059 — signed human-guard override

Decisions 1–2 are owned by the HGO library, signature-proof policy and CLI;
their direct tests cover arming, matching, and public verification. The policy
and committed trust anchor are declared because they select `signature` or
`chat` and bind proof verification. Copy-safe rendering and ledger intake are
declared because they make a denial actionable and auditable rather than merely
refused.

Decision 3's consume-first, mode-appropriate offer applies to every current
calling guard: test-path, gate-strength, lifecycle, Codex pretool, and
Antigravity pretool. Each caller and direct test is declared. This includes
the two runner adapters that were previously absent. Decision 4's actionable
denial is owned by those callers together with the shared renderer/CLI, not by
the HGO library alone.

Decision 6's cross-repository amendment and Decision 7's host-temp
clarification are owned by `guard-lifecycle-ready.mjs` and both runner adapters
in addition to HGO: the lifecycle guard emits `GUARD-CROSS-REPO-MUTATION`, and
the adapters translate it into the HGO plan/offer. The raw capture shows the
explicit lifecycle comment that `GUARD-LIFECYCLE-NOT-READY` remains outside HGO
authority. That is an intentional retained boundary, not partial coverage; it
has no replacement owner in ADR-0059 and must not be claimed liftable.

## ADR-0061 — universal human ceremony

The header covers actual owners for critical-action signing and disclosure
(`po-human-approval`, critical-action request, policy, copy-safe rendering),
chat-mode attended confirmation, design/plan authority and state, push and
destructive-push enforcement, release-preflight, HGO, and maintenance-window
paths. Their direct tests are included. `docs/push-release-flow.md`,
`guardrails/git.md`, and `roles/elephant.md` are the canonical operator and
agent owners for computable agent work and informed disclosure.

The declaration does **not** assert that every listed current path conforms.
ADR-0061 Decision 6 deliberately leaves the coupled universal mechanism for a
separate design round, and Consequences states that every shipped gate violates
the requirement until that work occurs. ADR-0064 is the concrete successor for
release-preflight; ADR-0074 is the narrower Phoenix port for the critical
prepare-and-sign collapse. These are successor/deferred boundaries, so no
partial current implementation is represented as complete universal coverage.

## ADR-0074 — narrow Phoenix port

ADR-0074 intentionally declares only the port's direct owners: critical
request construction, the `authorize-critical` human command and its public
gate, command preparation, and the push-release documentation contract. It
does not duplicate ADR-0061's plan, chat, maintenance-window, or general guard
owners. Its own Decision and Follow-up retain those as separate, wider work.

## Validation and integration boundary

The fixed-baseline parser proof is `node scratch/NVA-B-ADR-GOVERNS-APPROVAL-6/check.mjs` against
`83a37b9d6a67f7050d1df9b4cc31dbd6efd949ea`. The exact terminal capture
is `scratch/NVA-B-ADR-GOVERNS-APPROVAL-6/final-parser-capture.md` (exit 0). It verifies
30/26/41/9 tracked targets, unchanged non-header bodies, both generated
copies and all 80 canonical status rows with no classification change.

The worker also ran the vendored-canon, document-contract and consumer-path
checks, including the nine consumer regressions. No consumer-path exception
was needed. Parent integration promotes this readable rationale into the
durable evidence file while retaining the exact raw capture under Scratch.
These declarations do not grant approval, complete the universal ceremony
redesign, or substitute for the candidate-wide gate and independent review.
