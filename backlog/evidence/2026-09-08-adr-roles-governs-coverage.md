# Review staffing, research fetcher, and role-split coverage

The machine proof is produced by `scratch/NVA-B-ADR-GOVERNS-ROLES-9/check.mjs` at `scratch/NVA-B-ADR-GOVERNS-ROLES-9/check-output.json`. It uses the reconciliation parser, verifies the fixed baseline `2deb86e52786004737c4f87f7c74e54a1b744fbb` after removing only one `Governs:` header, requires each named target to be tracked and nonempty, records the current source hashes, and reuses the established English-primary status classifier against the 80-row historical capture. Its asserted local increment is 3/3; the global count is observational while concurrent packages are in flight. The redacted final invocation capture is `scratch/NVA-B-ADR-GOVERNS-ROLES-9/check-capture.md`.

## ADR-0024 — risk-based Critic staffing

`harness/review-protocol.md` is the current trigger-matrix owner: it defines T0 mechanical evidence, T3/T4 review-tier first-pass escalation, T1/T2 mandatory higher-capability paths, low-risk non-blocking review, bundled-wave boundaries, and explicit T0/T5 skip logging. `docs/operating-model.md`, `roles/elephant.md`, `roles/critic.md`, `policies/model-policy.md`, and `templates/prompts/critic-review.md` assign the orchestrator, independent reviewer, criticality route, evidence/disposition, and canonical briefing duties.

The provider-neutral configured route is implemented by `config/runner-profiles-v3.json`, its validator and direct test, and the V3 projection plus its test. `lib/critic-route-v3.mjs` resolves the Codex high-risk duty from that validated source; `scripts/codex-critic-selected-host.mjs` and its direct test are the selected native-host callsite. This declares requested routes only and makes no effective-model assertion. `lib/critic-skip-decision.mjs`, its direct test, and `check-critic-skip-coverage.mjs` with its test own the observable no-Critic decision; the checker’s documented lack of Verify-suite registration remains a disclosed limitation, not a claim of gate enforcement.

## ADR-0025 — read-only research fetcher

`policies/model-policy.md` is the live MP-03/MP-25 owner. It limits the exception to read-only web search, fetch, or extraction with no artifacts or judgment; it requires `role=research-fetcher`; and it keeps synthesis/evaluation at least Mechanic tier. `roles/elephant.md`, `roles/goldfish.md`, and the Goldfish briefing template provide the current orchestration, bounded-task, and stop-on-ambiguity boundaries. The three Goldfish agent definitions preserve the complementary prohibition: a weakest-tier route is unavailable to implementing Goldfish roles.

There is no dedicated current research-fetcher agent definition, route resolver, dispatch-metadata validator, or direct test. The named files therefore cover the policy and boundary obligations only. The historic Haiku label is not represented as a current provider assignment, and the missing runtime enforcement is deliberately not fabricated as an owner.

## ADR-0026 — three-role split and plan verifier

`docs/operating-model.md` and the three canonical role contracts assign the orchestrator, bounded executor, and independent read-only Critic. The Goldfish and Critic templates carry the dispatch-side separation, fresh-context, evidence, and reference-only review requirements. `routing-authority.json` classifies `plan-verifier` as review capability; `dispatch-policy.mjs` and its direct test treat it as a Critic-side role; and `agents/plan-verifier.md` defines its bounded read-only input and `VERIFIED | GAP | UNPLANNED` output.

The plan-verifier is correctly registered as a review capability rather than a fourth role, but its own frontmatter still describes plan-to-diff mapping as mechanical comparison. That contradicts ADR-0026’s superseding clarification that an LLM mapping is judgment. No separate runtime callsite or direct plan-verifier test was found among these current owners, so this declaration does not claim either exists.
