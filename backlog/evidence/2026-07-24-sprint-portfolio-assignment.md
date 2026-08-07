# Sprint portfolio assignment — 2026-07-24

## Purpose and authority

This is the canonical assignment evidence for the backlog cleanup directed by
the PO on 2026-07-24. The current `pipeline.backlog-item.v1` schema has no
Sprint or runner field. Sprint assignment is therefore recorded here and
bound from each sanctioned `open → in_progress` transition instead of adding
unsupported frontmatter or hand-editing generated projections.

This assignment is based on Public Core release `v0.4.1`, commit
`81cc5f1a6cb384057fd49dd1a340e93c3aec3efb`, tree
`ec4fcf2e84b15a580dbc13d98198204e8cfca429`.

## Active Sprint Cyborg assignment

| Backlog item | Cyborg package |
| --- | --- |
| `pipeline.recovery-preview-callback-attestation` | CYB-A0 |
| `pipeline.critic-context-isolation` | CYB-5b |
| `pipeline.dispatch-provenance` | CYB-5b |
| `pipeline.cross-repository-override-ledger-binding` | CYB-5c |
| `pipeline.elephant-direct-implementation-under-afk-authorization` | CYB-1 waiver class |
| `pipeline.verify-gate-scoped-registration` | CYB-2 |

These are direct Cyborg reconciliation targets. Nova may consume their
accepted contracts later but must not claim their closure.

## Active Sprint Nova assignment

| Backlog item | Nova relationship |
| --- | --- |
| `pipeline.afk-assumption-mode` | unattended execution and assumption boundary |
| `pipeline.execution-model-switchback` | requested/observed execution-route reconciliation |
| `pipeline.multi-cli-efficiency-pilots` | reproducible benchmark and cost evidence |
| `pipeline.session-keep-awake` | session-power lifecycle and native capability evidence |
| `pipeline.nonblocking-interaction-continuity` | attended/resume/compact continuity |
| `pipeline.closed-input-channel-review-economics` | first-pass closed review input |
| `pipeline.evidence-bound-review-retry-economics` | evidence invalidation and bounded retries |
| `pipeline.canonical-worktree-lifecycle` | worker isolation, cleanup, and recovery |
| `pipeline.po-gate-worktree-authority` | worktree-bound PO authority |
| `pipeline.codex-plugin-validator-host-parity` | runner conformance and native/generic validator parity |
| `pipeline.codex-sandbox-critic-longterm` | durable selected-sandbox capability under Issue `#29` |
| `pipeline.t1-governance-path-preflight` | review and release preflight under Issues `#54` and `#56` |
| `pipeline.project-scoped-github-issue-operations` | provider-neutral forge behavior under Issue `#51` |

These are direct Nova reconciliation targets. Their final Nova A/B slicing is
owned by the Nova PRD and does not change this backlog status transition.

## Confirmed later-Sprint assignment — no status change yet

| Sprint | Backlog items |
| --- | --- |
| Nightwing | `pipeline.documentation-information-architecture`, `pipeline.dual-channel-publication` |
| Phoenix | `pipeline.regulated-document-hooks`, `pipeline.spec-retention-on-close`, `pipeline.close-spec-retention-and-consent`, `pipeline.stateful-design-contract-template` |

The PO confirmed these portfolio assignments on 2026-07-24. They remain
`open` because Nightwing and Phoenix are not active Sprints in this cleanup;
Sprint assignment does not itself manufacture active implementation.

## Completed companion deliveries

- `pipeline.observation-intake-document-governance` is a delivered capability,
  not obsolete work. The PO directed its work item to close independently of
  GitHub Issue `#53`, which concerns V3 consumer onboarding rather than
  observation/document governance.
- `pipeline.private-overlay-activation-bridge` is delivered in the released
  Public Core. Later project-specific activations consume the capability and
  do not keep its implementation item open.

## Newly identified Nova candidate

The PO additionally requires automatic status reconciliation: when a backlog
item is delivered against its Spec, its canonical status must advance through
the sanctioned writer without relying on a later manual cleanup. No current
backlog item fully owns this behavior.

The PO assigned this quality-critical topic to Nova so the canonical state is
made reliable before further parallel delivery. It is tracked by Public
GitHub Issue #57, P0/Backlog: “Automatically reconcile Spec-bound delivery
into canonical backlog state”, with labels `enhancement`, `area:lifecycle`,
`blocker`, and `sprint:nova`. Its design slice covers:

- a versioned item-to-Spec-to-Sprint-to-delivery binding;
- automatic `open → in_progress` on accepted assignment;
- an evidence-gated `in_progress → closed` proposal when the exact Spec and
  candidate are satisfied;
- preview, PO authority, idempotency, crash recovery, and exact readback;
- no closure from file presence, a GitHub label, or Issue state alone;
- atomic item, ledger, index, and status projection updates through the
  sanctioned writer;
- a repair path for unreachable historical evidence commits without rewriting
  the append-only ledger; and
- identical byte-bound snapshot consumption by parallel Sprint branches.

The current writer has no generic sanctioned item initializer, so this
candidate is not fabricated as a new canonical ledger item during cleanup.
