---
schema: "pipeline.backlog-item.v1"
id: "pipeline.cross-repository-override-ledger-binding"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-20"
source: "Public V3 Foundation close residue review"
due: "2026-09-08"
expires: "2026-09-15"
---

# Bind guard-override audit storage to the target repository

## Description

A guarded cross-repository Git operation can resolve its command target correctly
while the one-time override ledger still binds to the coordinator checkout. The
override remains auditable, but the wrong repository may receive command text or
target coordinates that do not belong in its committed boundary.

## Triggering situation

The Public V3 Foundation close used a PO-confirmed, one-time override for a
normal private-overlay `main` fast-forward. The command reached the intended
target, while the local ledger was initially created in the coordinating Public
checkout. The entry was detected before staging and preserved only in the
private target's ignored local runtime area; no private value entered Public
history.

## Affected artifact

The Git guard's cross-repository target resolution, override-ledger placement,
sanitization boundary, and deterministic tests.

## Proposal

Make the override mechanism derive its ledger root from the same normalized and
validated repository binding used for the guarded Git operation. The package
must:

- bind command evaluation, token consumption, and ledger append to one physical
  target repository;
- fail closed before the operation when the target ledger cannot be written;
- avoid copying raw cross-repository command text, local paths, remotes, or
  private coordinates into a coordinating Public checkout;
- retain one-time token semantics and a sanitized public-safe disposition; and
- add positive and negative tests for ordinary commands, absolute and relative
  `git -C` targets, mismatched coordinator and target roots, missing target
  ledgers, and replayed tokens.

No test or remediation may weaken protected-ref rules or make an override
implicit. The existing double-confirmation contract remains mandatory.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted implementation package.
The triage due date is **2026-07-27**. If no decision is recorded by
**2026-08-03**, this item expires and must be renewed with current Public
evidence rather than silently retained.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Renewal (2026-08-18):** expired 2026-08-03 with an empty Triage
  section, never triaged in ~4 weeks — found during a systematic sweep for
  the same class of mistake this session caught three times already
  (NVA-A8-5 and its P1/P2 neighbors: an expired, unread item mischaracterized
  by other documents' abstract summaries instead of its own text). Renewed
  with current evidence rather than left expired.
- **Decision:** accepted as a confirmed, still-real, still-open gap —
  **but implementation deliberately NOT dispatched this session**, for a
  different reason than NVA-A8-5/P1/P2: not a missing-PO-gate problem, a
  genuine cross-sprint OWNERSHIP ambiguity this item's own text cannot
  resolve.
- **Rationale:** traced the actual code path directly (not assumed):
  `recordHumanGuardDenial()` (`plugins/pipeline-core/lib/human-guard-override.mjs:1921-1938`)
  computes the ledger's storage root via `topology(physicalRoot(rootDir), spawn)`
  BEFORE `eligibility()` is even called; the real guard-hook call site
  (`plugins/pipeline-core/hooks/codex-pretool-guard.mjs:482-489`) passes
  `rootDir: projectRoot` — the coordinator/session's own root, not the
  guarded command's cross-repository target. `crossBoundaryTarget()`/
  `crossBoundaryEligible()` (`:961-999`) only feed classification fields
  into the request object; they never redirect `repo.common` itself. **This
  item's Description is confirmed still accurate: a cross-repository
  guarded operation's ledger genuinely binds to the coordinator checkout,
  not the actual target repository.**
  However: `docs/state.md` (~line 6305-6314, a Sprint Cyborg PO-gate
  handover snapshot recorded 2026-07-24, four days after this item was
  filed) cross-references this exact capability as `CYB-5c`, one of six
  Cyborg-epic `in_progress` items, under a gate (`EL-19`) the PO approved
  that same day — but this backlog item's own frontmatter (`owner: pipeline`,
  filed from a "Public V3 Foundation close residue review", no Cyborg
  reference anywhere in its text) was never updated to reflect that
  cross-sprint assignment, if it is one. It is genuinely unclear from this
  item's own text, or from a code-level trace, whether this repository's
  `feat/sprint-nova-codex-v046` branch is the correct place to fix this
  shared file (`human-guard-override.mjs`) tonight, or whether the fix
  belongs to a Cyborg-branch session that already holds the EL-19
  authorization for it — implementing it here without resolving that would
  risk either duplicate/conflicting work across branches or attributing a
  Cyborg-authorized change to a Nova-scoped session. This is exactly the
  kind of genuine ambiguity this session's own discipline says to stop and
  document rather than guess through.
- **Assignment:** unassigned pending sprint-ownership reconciliation.
  Whoever picks this up next should first resolve whether `CYB-5c` and this
  item are the same piece of work (check for a Cyborg-branch session/
  handover with a more current disposition than the 2026-07-24 snapshot
  cited above), then either dispatch the fix here (if this item is
  independently Nova/pipeline-owned despite the cross-reference) or hand it
  to the Cyborg context (if `CYB-5c` supersedes it). The fix itself, once
  ownership is resolved, is bounded: thread the already-computed
  cross-repository target root into `topology()`'s root argument at the
  `recordHumanGuardDenial()`/`consumeHumanGuardOverride()` call sites,
  matching this item's own Proposal (bind command evaluation, token
  consumption, and ledger append to one physical target repository; fail
  closed if the target ledger cannot be written).
- **Date:** 2026-08-18

### Ownership reconciliation, 2026-08-18 — resolved: this item is Nova-owned, dispatched

Cyborg is a closed sprint; investigated directly rather than left
ambiguous. `CYB-5c` does NOT supersede this item: `git show fdbcf61`/
`72c1e83` ("bind override ledger to command target", "reject git
environment target overrides") patch `guard-git.mjs`, an older, different
mechanism — not `human-guard-override.mjs`, the file this item's own
2026-08-18 trace confirmed still carries the exact live bug
(`recordHumanGuardDenial()`/`consumeHumanGuardOverride()` computing
`topology()`'s root from the coordinator's `rootDir` before the
cross-repository target is resolved). Since Cyborg will never be
revisited, this is now unambiguously Nova/pipeline-owned. Dispatched
`NVA-CROSSREPOLEDGER-1` (goldfish-deep, guardrail-tier: touches
`human-guard-override.mjs`, the ledger-binding kernel this session's own
GMW work spent all night hardening).
