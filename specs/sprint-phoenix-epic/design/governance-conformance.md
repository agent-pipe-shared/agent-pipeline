# Sprint Phoenix governance conformance

Status: design revision in progress; fresh independent review and renewed
Product Owner gate pending

Date: 2026-07-26

This assessment applies the repository-configured example governance sources:

- `governance/examples/guidelines/architecture-guidelines.md`
- `governance/examples/policies/checklist.md`

It is not a substitute for the mandatory implementation/push-gate Critic
review. `MET (design)` means the normative design contains the required
contract. It does not claim that future implementation or evidence exists.

## Architecture guidelines

| # | Guideline | Design assessment | Evidence / disposition |
| --- | --- | --- | --- |
| 1 | Layering | MET (design) | Canonical event kernel and authority resolver are below origin-specific services; projections/adapters consume downward and cannot grant authority. |
| 2 | Dependency direction | MET (design) | Stable neutral schemas/kernel never import provider adapters. Provider profiles depend on the core. |
| 3 | Intent naming | MET (design) | Contract, operation, schema, and package names describe governance domains and actions rather than mechanics. |
| 4 | Error handling | MET (design) | Unknown, unavailable, invalid, partial, stale, conflict, fork, and reconciliation states remain typed at their first boundary. |
| 5 | Logging | MET (design) | Work-unit correlation includes every Pipeline-known external command offer before presentation; offer, authority, attempt, user assertion, and readback remain distinct, while secrets, private coordinates, raw command content, prompts, and unrestricted output are prohibited before persistence. |
| 6 | API versioning | MET (design) | Closed v1 schema/profile family; breaking reinterpretation requires a new version and explicit migration. |
| 7 | Single responsibility | MET (design) | Human ledger, agent journal, lifecycle stream, policy, viewer, adapters, ITSM, and export remain separate modules/streams. The missing #22 manifest mutation and narrow continuity-authority revision are placed in the existing sanctioned repository lifecycle state writer, not the event store or a new out-of-inventory module. |
| 8 | Configuration | MET (design) | Portable intent/policy is separate from machine-local endpoints, credentials, actor bindings, queues, and runtime settings. |
| 9 | Idempotency | MET (design) | Canonical writer, adapters, ITSM, outbox, and external mutations have explicit idempotency and conflicting-replay behavior. |
| 10 | Test placement | MET (design) | The implementation inventory colocates each planned `*.test.mjs` with its source area and registers it with Verify. |
| 11 | Explicit dependencies | MET (design) | #10/#22/#27 and ADR-0046 are named prerequisites; Nova/Cyborg/Nightwing are explicitly not hidden dependencies. |
| 12 | Deprecation expiry | MET (design) | Compatibility removal and residuals require owner/expiry and a separately approved transition; open-ended TODO disposition cannot close the Epic. |

No design-stage deviation from the twelve guidelines is proposed.

## Enforcing policy checklist

| # | Policy item | Current state | Required evidence before implementation close/push |
| --- | --- | --- | --- |
| 1 | Data-privacy review | MET (design) | After two failed rounds and five accepted findings, the final fixed-candidate re-review passed with no findings and consistent machine trajectory. [privacy-review.md](privacy-review.md) makes Acceptance the normative interpretation, scopes append-only to portable records, and assigns the restricted profile only to Spec-listed files. Implementation and push require their own later privacy review. |
| 2 | Threat model updated | MET (design) | [architecture.md §15](architecture.md#15-security-and-privacy-posture) defines current threats/controls. Implementation creates and maintains `docs/phoenix-governance-threat-model.md` and obtains blocking Security review. |
| 3 | License header present | NOT APPLICABLE to current Markdown-only design | Every future source/schema file follows the repository's license/SPDX convention; Verify checks the implemented candidate. |
| 4 | Rollback path documented | MET (design) | `spec.md` migration/compatibility, stateful recovery checklist, architecture crash matrices, and `RECOVERY.md` define recovery authority and no-history-fabrication. |
| 5 | Third-party license compliance | NOT APPLICABLE to current design | No package dependency is added. Any implementation dependency/profile library requires exact registry identity, pin, license allowlist check, and evidence before dispatch/merge. |
| 6 | Secrets handling reviewed | MET (design) | Default-deny schemas, pre-persistence redaction, machine-local secret bindings, endpoint restrictions, and prohibited-content tests are normative. |
| 7 | Backward compatibility assessed | MET (corrected and re-reviewed design) | Every direct plan/push/deploy/release/override reader is now inventoried; dual-read is ledger-first, disagreement fails closed, the integration-package owner is named, and the window expires no later than 2026-10-31. |
| 8 | Deferred-risk owner/expiry | MET for current design record | The current course-gate risks are owned and dated below; implementation residuals cannot close without the same treatment. |

## Current course-gate risks

| Risk | Owner | Expiry | Required disposition |
| --- | --- | --- | --- |
| `PHX-DESIGN-ADVISORY-UNAVAILABLE` | Phoenix Elephant, with PO authority for review dispatch | 2026-07-31 | RESOLVED for design readiness by the authorized compensating review chain: all original, privacy, writer-inventory, and PHX-0 sequencing findings cleared. Advisor itself remains unavailable and is never claimed passed. |
| `PHX-DESIGN-INHERITED-CONTINUITY` | Product Owner for exception authority; Phoenix Elephant for exact execution/readback | 2026-07-31 | RESOLVED 2026-07-26 through the documented exact repair, sanctioned writers, Phoenix continuity initialization, cleanup, and full bootstrap readback. |
| `PHX-DESIGN-HANDOVER-DRIFT` | Phoenix close owner; Product Owner controls scope | 2026-07-31 | RESOLVED 2026-07-26 by replacing the stale operational head with the Phoenix design-gate handover without reopening Product Owner-dispositioned 0.4.6 implementation. |
| `PHX-LEGACY-AUTHORITY-COMPATIBILITY` | Phoenix integration-package owner | Earlier of Phoenix integration close or 2026-10-31 | Migrate every direct mutable authority reader, dual-evaluate ledger/state, block disagreement, and prohibit compatibility removal or Phoenix completion while any reader remains unmigrated. |
| `PHX-PRIVACY-PORTABLE-TRUST-ZONE` | Phoenix integration-package owner | Before Product Owner gate | RESOLVED 2026-07-26 by fixed-candidate privacy PASS over the normative Spec §§4.4–4.5 interpretation and repository-wide admission. |
| `PHX-PRIVACY-RESTRICTED-ERASURE` | Phoenix integration-package owner | Before Product Owner gate | RESOLVED 2026-07-26 by fixed-candidate privacy PASS over portable-only append semantics, restricted erasure/key destruction, and Spec-inventory ownership. |
| `PHX-LIFECYCLE-WRITER-INVENTORY` | Phoenix design owner | Before Product Owner gate | RESOLVED 2026-07-26 by final Critic PASS: only Spec-listed writer files, complete transaction/recovery contract, mandatory PHX-0 slice A, trust-root slice B, then PHX-1..6. |
| `PHX-DESIGN-CONTINUITY-AUTHORITY-REVISION` | Phoenix design owner; Product Owner for decision authority | Before renewed Product Owner gate | OPEN: generic CAS correctly rejects changed PRD/Spec authority. PHX-0 slice A now owns the dedicated decision-bound writer; the current revision retains the old digest as a diagnostic, not approval or dispatch authority. Fresh review must validate `PX0-AC-01..07`. |
| `PHX-DESIGN-SECURITY-CANDIDATE-BINDING` | Phoenix integration-package owner | Before renewed Product Owner gate | OPEN: the current Security scan found no scanner findings but returned a blocking unverified-candidate result. EPIC-AC-07 requires a detached-worktree identity fix with a real-drift fail-closed regression suite; no clean claim is permitted before it passes. |

If an open risk reaches its date without disposition, the Phoenix design returns to a
blocked course gate. The expiry does not authorize the action automatically.

## Review dispatch prerequisites

The later Critic dispatch must contain only:

- `specs/sprint-phoenix-epic/spec.md`;
- the fixed `origin/main..HEAD` candidate range;
- `.claude/pipeline.json`;
- `governance/examples/guidelines`;
- `governance/examples/policies`;
- the prior Critic record and exact machine Verify/Security evidence paths;
- the loaded ruleset SHA and project name;
- `verdict:yes`;
- the exact approved read-only assurance.

No prose summary or expected conclusion may contaminate the dispatch.
