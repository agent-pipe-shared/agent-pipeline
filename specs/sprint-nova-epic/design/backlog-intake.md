# Canonical backlog portfolio intake

## Snapshot and authority

This intake binds the canonical state after the PO's 2026-07-24 cleanup:

| Binding | Value |
| --- | --- |
| Product base | `v0.4.1` / `81cc5f1a6cb384057fd49dd1a340e93c3aec3efb` |
| Canonical snapshot commit | `5ca5a4b292a267ffdfcc52577fda0a0593957a65` |
| Backlog subtree | `832bf98e22e9a147dad88c952c0b794f3ee44fe7` |
| Transition head | `36dd616d3aa5bc21e49e138f6b8a9a17a9de25321998304306e4fa47289de562` |
| Counts | `6 open / 19 in_progress / 10 closed` |

The canonical source is this repository's `backlog/items/`,
`backlog/transitions.ndjson`, `backlog/index.json` and `backlog/STATUS.md`.
GitHub labels and the Cyborg mirror are projections, not competing authority.

`in_progress` records a PO-accepted Sprint assignment. It is not an
implementation, verification or closure claim. Every later status change
requires the item's own criteria, exact candidate/evidence and the sanctioned
writer.

The current checker is structurally green with `checkCommit:false`. Its normal
mode has exactly two inherited findings: events 39 and 40 reference commits
that are not reachable from Public refs. Prior ledger bytes must not be
rewritten; Nova Issue #57 owns an append-only repair.

## Complete 35-item disposition

### Nova A — direct delivery reconciliation claimants, `in_progress` (7)

| Backlog ID | Primary Nova relationship | Closure boundary |
| --- | --- | --- |
| `pipeline.execution-model-switchback` | `#7`, `#38` | Requested/observed route and phase switchback evidence; no inferred effective model identity. |
| `pipeline.multi-cli-efficiency-pilots` | `#8` | Framework delivery is insufficient; the record's separately PO-gated pilots and evidence remain required. |
| `pipeline.closed-input-channel-review-economics` | `#54` | Closed structured request channels, free-text rejection and correction-delta evidence. |
| `pipeline.evidence-bound-review-retry-economics` | `#54` | Exact retained-stage receipts, typed infrastructure aborts, invalidation and bounded reuse/rerun evidence. |
| `pipeline.codex-plugin-validator-host-parity` | `#7` | Exact native validator/conformance acceptance; synthetic parity alone cannot close it. |
| `pipeline.codex-sandbox-critic-longterm` | `#29` | Requires sanctioned acceptance definition plus durable positive/negative selected-sandbox evidence; scope prose alone is insufficient. |
| `pipeline.t1-governance-path-preflight` | `#54`, `#56` | Complete T1 request/release preflight and exact protected-path evidence. |

### Nova B — direct delivery reconciliation claimants, `in_progress` (6)

| Backlog ID | Primary Nova relationship | Closure boundary |
| --- | --- | --- |
| `pipeline.afk-assumption-mode` | `#16`, `#21` | Bounded unattended assumptions, explicit expiry/stop and no widened authority. |
| `pipeline.session-keep-awake` | `#49` | Native lifecycle evidence; unavailable keep-awake remains honest and does not block unrelated correctness. |
| `pipeline.nonblocking-interaction-continuity` | `#21`, `#49` | Resume/completion delivery without hidden background wakeup or lost input authority. |
| `pipeline.canonical-worktree-lifecycle` | `#21` | Worker workspace creation, ownership, cleanup, orphan recovery and stale-candidate behavior. |
| `pipeline.po-gate-worktree-authority` | `#21` | Exact target/worktree authority and fail-closed negative cases. |
| `pipeline.project-scoped-github-issue-operations` | `#51` | Existing GitHub capability becomes the provider-neutral forge reference and must retain exact preview/confirmation/readback restrictions. |

Nova therefore owns 13 currently active delivery reconciliations:
`7 Nova A + 6 Nova B`.

### Cyborg — direct delivery reconciliation claimants, `in_progress` (6)

| Backlog ID | Cyborg allocation | Nova rule |
| --- | --- | --- |
| `pipeline.recovery-preview-callback-attestation` | `CYB-A0` | Excluded from Nova closure. |
| `pipeline.critic-context-isolation` | `CYB-5b` | Input to `#54` only; Nova cannot close or transfer it. |
| `pipeline.dispatch-provenance` | `CYB-5b` | Input to `#38` only; Nova invocation IDs do not satisfy provenance closure. |
| `pipeline.cross-repository-override-ledger-binding` | `CYB-5c` | Possible forge/security input only after accepted Cyborg delivery. |
| `pipeline.elephant-direct-implementation-under-afk-authorization` | `CYB-1` waiver class | Nova retains it as a governance negative case only. |
| `pipeline.verify-gate-scoped-registration` | `CYB-2` | Nova may later register suites, but cannot claim this Cyborg reconciliation. |

### Later Sprints — `open` (6)

| Sprint | Backlog IDs |
| --- | --- |
| Nightwing | `pipeline.documentation-information-architecture`; `pipeline.dual-channel-publication` |
| Phoenix | `pipeline.regulated-document-hooks`; `pipeline.spec-retention-on-close`; `pipeline.close-spec-retention-and-consent`; `pipeline.stateful-design-contract-template` |

These are confirmed portfolio assignments but inactive work. Nova may consume
their present contracts as inputs; it cannot activate or close them.

### Closed reference evidence (10)

- `pipeline.source-available-commercial-licensing`
- `pipeline.windows-runtime-baseline-containment`
- `pipeline.sentinel-go-live-completion`
- `pipeline.push-guard-worktree-target`
- `pipeline.windows-directory-durability`
- `pipeline.windows-private-state-assurance`
- `pipeline.windows-trusted-tool-resolution`
- `pipeline.windows-verify-reproducibility`
- `pipeline.observation-intake-document-governance`
- `pipeline.private-overlay-activation-bridge`

Nova may cite closed evidence but cannot reopen, rewrite or count it as Nova
delivery.

The arithmetic is exhaustive:

```text
13 Nova in_progress
+ 6 Cyborg in_progress
+ 6 later-Sprint open
+ 10 closed
= 35 canonical records
```

## Issue #57 bootstrap boundary

Issue #57 is confirmed P0 Nova A work but is not among the 35 records. The
current ledger has no generic sanctioned item initializer; manually
fabricating a record would violate the defect's own product requirement.

Until #57 supplies the initializer:

- the GitHub issue, PRD and acceptance criteria are its product authority;
- no status for #57 is invented in `backlog/index.json`;
- Nova A cannot be accepted until the initializer, status reconciliation and
  append-only events 39/40 repair are complete; and
- the first use of the initializer must create/read back #57 without changing
  the meaning or bytes of prior ledger events.

## Cross-Sprint mirror and claim protocol

Cyborg has received a manual read-only mirror of the snapshot above. It does
not maintain a competing canonical ledger.

1. Cyborg works only the six allocated claimants.
2. Cyborg returns item ID, accepted Spec, candidate and evidence when it wants
   a canonical transition.
3. This Nova repository regenerates the portfolio intake and applies any
   authorized transition through the sanctioned writer.
4. A duplicate direct claimant, changed item body/status/owner, or changed
   ledger head invalidates the pending transition preview.
5. One Sprint may consume another Sprint's item as an acceptance input; that
   never transfers delivery ownership.
6. Nova and Cyborg implementation acceptance remains independent. Combined
   code/backlog integration is a separate post-Sprint lifecycle.
