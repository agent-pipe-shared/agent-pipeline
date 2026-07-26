# Sprint Phoenix scope validation

Status: design input

Date: 2026-07-26

Branch: `sprint_phoenix`
Base commit: `9d1b3dc108eb77629ace5b82002120f5539abd8d`

## Purpose

This document records the Elephant's validation of the proposed Sprint Phoenix
inputs. It is not an implementation result, a GitHub mutation, or evidence that
an old backlog status is current. It prevents issue prose, historical handover
state, and thematically adjacent backlog notes from becoming scope merely by
being copied into the Epic.

The Product Owner supplied two additional binding inputs:

1. ruleset and marketplace freshness must resolve through a runner-neutral
   authority path that also works in a fresh Codex-only, pre-HEAD repository;
2. workarounds and recovery actions must be represented in the governance audit
   model without leaking private paths, credentials, raw commands, prompts, or
   unrestricted tool output.

The Product Owner also confirmed that the work planned for the 0.4.6 recovery
line is complete and operational. Stale historical documentation or backlog
status is therefore design evidence, not permission to reopen that work.

## Binding public issue inventory

The target repository was resolved as the public
`agent-pipe-shared/agent-pipeline` repository. The following open issues were
read from GitHub on 2026-07-26 using the exact `sprint:phoenix` label query.
ADR-0043 independently records the same set.

| Issue | Priority / size | Validated Phoenix responsibility |
| --- | --- | --- |
| [#5](https://github.com/agent-pipe-shared/agent-pipeline/issues/5) — Human-readable Evidence Viewer | P0 / L | Produce an offline, accessible projection from canonical artifacts and governance streams. It never grants authority. |
| [#9](https://github.com/agent-pipe-shared/agent-pipeline/issues/9) — Organization policy packs and signed audit bundles | P1 / XL | Add a typed policy plane, activation/reconciliation rules, and portable offline assurance bundles without committing keys or private bindings. |
| [#17](https://github.com/agent-pipe-shared/agent-pipeline/issues/17) — Sanitized multi-agent event model and local replay | P1 / L | Define the bounded lifecycle event stream and a non-authoritative local replay correlated to the minimum #10 exchange. |
| [#23](https://github.com/agent-pipe-shared/agent-pipeline/issues/23) — External traceability adapters | P2 / L | Add provider-neutral reference/publication adapters with explicit field ownership, preview, revision binding, and readback. |
| [#24](https://github.com/agent-pipe-shared/agent-pipeline/issues/24) — Policy-governed ITSM change control | P2 / XL | Compose an independently authenticated external change gate with Pipeline release authority; never treat a status string as consent. |
| [#30](https://github.com/agent-pipe-shared/agent-pipeline/issues/30) — Human Governance Decision Ledger | P0 / XL | Establish the only historical source for human authority-changing decisions, with append-only integrity and exact scope binding. |
| [#31](https://github.com/agent-pipe-shared/agent-pipeline/issues/31) — Agent Decision and Assumption Journal | P1 / L | Record only material declared assumptions/selections in a separate, non-authoritative, privacy-minimized stream. |
| [#32](https://github.com/agent-pipe-shared/agent-pipeline/issues/32) — Governance event export | P1 / M | Project sanitized canonical events through a durable, provider-neutral, one-way export plane with independent destinations and honest acknowledgements. |

No Phoenix issue is dropped. Issue acceptance lists remain source input, but
the technical contracts in this Epic are allowed to consolidate duplicate
fields and strengthen unsafe boundaries.

## Validated prerequisite state

The following shared prerequisites are already present on the accepted base and
must be consumed without unpublished sibling work:

| Dependency | Readback | Phoenix use |
| --- | --- | --- |
| [#10](https://github.com/agent-pipe-shared/agent-pipeline/issues/10) | closed/completed 2026-07-24 | `pipeline.control-execution-exchange.v1` is the minimum event correlation input. Phoenix does not depend on Nova #14. |
| [#22](https://github.com/agent-pipe-shared/agent-pipeline/issues/22) | closed/completed 2026-07-24 | ADR-0045 and `governance/artifact-topology.json` provide canonical artifact identity, validation, retention classes, and non-mutating transition previews. They do not provide a lifecycle manifest writer; Phoenix owns that explicit closure before dependent bundle/viewer/adapter use. |
| [#27](https://github.com/agent-pipe-shared/agent-pipeline/issues/27) | closed/completed 2026-07-24 | Existing least-privilege Actions policy remains the automation floor. |
| ADR-0046 | accepted on base | Public Core, neutral project authority, private overlay, generated runner projections, and machine-local state remain distinct. |

Nova, Cyborg, and Nightwing branches are not implementation dependencies.
Phoenix may consume only their later merged public contracts through a
separately approved rebase or integration decision.

## Product-owner additions

### PX-A — Runner-neutral ruleset source and freshness

Accepted into Phoenix as a P0 prerequisite because every later governance
record depends on truthful ruleset identity.

The live bootstrap reproduced two false `unknown` paths in a fresh Codex-only
consumer:

- marketplace discovery consulted `.claude/settings.json`, although a Codex
  host need not contain that runner-specific file;
- loaded ruleset identity defaulted to the consumer repository `HEAD`, although
  a fresh consumer may be pre-HEAD and the loaded plugin has its own native
  registry identity.

Direct host networking and native `codex plugin list --json` readback were
available. The design obligation is therefore not "add another fallback path";
it is to define one normalized runner-neutral ruleset-source contract and make
each runner adapter prove its own loaded/installed/source observations.

This addition does not authorize an isolated early fix. It is designed and
implemented as the Phoenix trust-root package.

### PX-B — Auditable workaround and recovery decisions

Accepted as a cross-cutting acceptance contract, not as a fourth competing log.
A recovery trajectory is represented through correlated events:

- a non-authoritative agent decision records the proposed/selected recovery and
  its evidence gap;
- a human ledger decision records any authority-changing exception or bypass;
- a lifecycle event records attempted, rejected, applied, read-back, rolled
  back, or cleaned-up state;
- governed evidence carries public-safe digests and reason codes.

The record must cover trigger, rejected guard path, human action, exact local
mutation class, privacy boundary, recoverability, cleanup, and readback. It
must not retain raw command text when an operation code is sufficient, raw
prompts, transcripts, credentials, private filesystem paths, account details,
or unrestricted tool output.

## Local backlog validation

The local backlog was created across Sentinel and 0.4.x recovery work. Its
generated status is not a Sprint assignment. The PO's completion disposition
means Phoenix uses relevant entries as regression/design inputs and does not
silently reactivate them.

### Incorporated as explicit Phoenix acceptance inputs

| Backlog item | Phoenix mapping | Disposition |
| --- | --- | --- |
| `pipeline.cross-repository-override-ledger-binding` | Human ledger target-repository binding and PX-B privacy boundary | Incorporate its positive/negative cases into #30 tests. Do not create a parallel override authority. |
| `pipeline.dispatch-provenance` | #31 decision journal and #17 lifecycle correlation | Require dispatch identity on delivered work and deterministic detection of missing provenance. |
| `pipeline.elephant-direct-implementation-under-afk-authorization` | #30 exception taxonomy plus #31 recovery/route selection | Model a bounded human exception and mandatory follow-up review; do not create a general bypass mode. |
| `pipeline.spec-retention-on-close` | #9 bundle inventory, #5 viewer integrity, and #30 authority history | Require durable PRD/Spec retention or an explicit disposition before Close. |
| `pipeline.close-spec-retention-and-consent` | #9 policy evidence and export-consent readback | Require digest reconciliation and public-safe consent state without retaining the exported content. |
| `pipeline.regulated-document-hooks` | #9 policy packs and #23 governed publication | Reuse the delivered document lifecycle boundary; do not reopen its earlier renderer implementation. |
| `pipeline.stateful-design-contract-template` | Phoenix stateful-control readiness checklist | Apply its authority, atomicity, crash-state, enforcement, recovery, and self-reference questions to every stateful package. |

### Existing capabilities used as conformance fixtures

| Backlog item | Use in Phoenix | Why it is not a separate Phoenix package |
| --- | --- | --- |
| `pipeline.project-scoped-github-issue-operations` | Reference adapter safety fixture for target resolution, preview, confirmation, mutation readback, and credential handling | The capability is already shipped in Pipeline 0.4.6. Phoenix generalizes its boundary in #23 rather than rebuilding the skill. |
| `pipeline.observation-intake-document-governance` | Privacy and document-classification fixture for #5, #9, #23, and #32 | Its accepted Sentinel companion implementation remains historical authority. |
| `pipeline.po-gate-worktree-authority` | Cross-worktree and repository-binding regression input for #30 | The current PO-gate validator remains a consumer to migrate, not a new product surface. |

### Deliberately excluded from Phoenix implementation scope

The following groups remain outside Phoenix even when they contain useful audit
examples:

- fresh onboarding, managed-host onboarding, and installation ceremony;
- Codex sandbox/Critic execution, review retry economics, and execution model
  switchback;
- worktree, cleanup, keep-awake, push target, and Windows portability work;
- Nova execution/scheduling/isolation work;
- Nightwing product-front-door and general documentation information
  architecture;
- Sentinel go-live closure and previously delivered recovery packages.

Phoenix may use their public-safe fixtures to test the generic governance
contracts. It does not own their product outcome, completion status, or repair.

## Design corrections to issue inputs

The following changes are intentional validation results rather than omissions:

1. **No universal "audit log".** Human authority, agent declarations, and
   lifecycle observations have separate closed payload schemas and integrity
   chains. A shared envelope and correlation graph do not erase origin or
   authority.
2. **No simple precedence ladder.** Core safety floors cannot be weakened by a
   later organization or local value. Policy fields declare a merge strategy:
   immutable floor, set intersection, most restrictive, single owner, or
   authority-gated exception.
3. **No external round trip into authority.** Viewer, bundle, export, wiki,
   issue, and SIEM projections are one-way. ITSM is a separate authenticated
   authority observation used by a composed gate, not a write-back into the
   human ledger.
4. **No raw rationale by default.** Stable reason codes and bounded summaries
   are preferred. Human rationale and agent summaries are export-denied unless
   an explicit data policy allows and redacts them.
5. **No exactly-once transport claim.** Event export uses at-least-once
   delivery plus stable idempotency. Acknowledgement semantics are declared per
   adapter.
6. **No compliance claim from mechanics.** NIST, EU AI Act, GDPR, CloudEvents,
   OpenTelemetry, syslog, in-toto, and DSSE are design references or profiles.
   Applicability, organizational controls, legal compliance, key custody, and
   trusted time remain separately assessed.

## Scope-change rule

After PO approval, adding a new issue, portable event class, authority source,
external write capability, policy weakening mechanism, private-data field, or
Nova/Nightwing dependency is a product-scope change. It requires a revised
PRD/Spec digest and renewed approval before implementation continues.
