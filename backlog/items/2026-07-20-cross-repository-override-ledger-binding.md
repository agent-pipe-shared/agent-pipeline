---
schema: "pipeline.backlog-item.v1"
id: "pipeline.cross-repository-override-ledger-binding"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-20"
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "6d9e8f83"
closure_evidence: "plugins/pipeline-core/lib/human-guard-override.test.mjs"
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

### Implementation landed (NVA-CROSSREPOLEDGER-1, 2026-08-18) — status stays `open`, Critic review dispatched

`recordHumanGuardDenial()`/`consumeHumanGuardOverride()` now re-derive the
guarded command's actual cross-repository target (via `crossBoundaryTarget()`
plus a new `crossRepositoryTargetRoot()` git-native discovery helper, never
throws, returns null when no repo found) and bind `topology()`/`storage()`
there instead of the coordinator's root. An ordinary in-root command and an
out-of-root target with no repository of its own (`NOVA-HGOELIG-1..4`) keep
binding to the coordinator exactly as before — confirmed unaffected.
`planHumanGuardOverride()` and its downstream (`prepareHumanGuardOverrideAuthorization`/
`authorizeHumanGuardOverride`/`authorizeHumanGuardOverrideBySignature`/
`verifyHumanGuardOverrideAudit`) already bound correctly to whatever
`rootDir` their caller supplies — confirmed via direct calls, no change
needed there. Four new regression tests (`NVA-CROSSREPOLEDGER-1a..1d`)
prove: unchanged same-repo binding, correct cross-repo binding of
evaluation/consumption/ledger-append, no raw command-text/path leakage
into the coordinator's own ledger, unchanged one-time token semantics,
and unchanged protected-ref/double-confirmation strength. Independently
re-verified: `node --test plugins/pipeline-core/lib/human-guard-override.test.mjs`
— 67/68 pass, the one failure the same pre-existing, separately-tracked
`HGO-EXTERNAL-MARKETPLACE` host-config exception every other dispatch
tonight also saw (confirmed identical on unmodified `main` via `git
stash`). Commit `1404eb28`.

A real, separate finding the dispatch disclosed (not fixed here, filed
as its own item): `codex-pretool-guard.mjs`'s printed recovery guidance
still hard-codes `--repo ${projectRoot}`, now stale for cross-repository
denials specifically — `backlog/items/2026-08-18-codex-pretool-guard-cross-repository-recovery-guidance-points-at-the-wrong-repo.md`.

**Status stays `open`, not `closed`:** this is a SECURITY/GUARDRAIL-class
change to the override ledger's own binding semantics — the same class
of change this session's own precedent (the GMW commit-tolerance fix)
required a Critic review to close, per this repo's self-application rule.
Critic review dispatched (`docs/adr/0059-signed-human-guard-override.md`,
diff `f24e4881..1404eb28`).

### Critic review result, 2026-08-18 — FAIL, one major finding, real and confirmed

**F1 (major, confirmed by direct code reading before dispatching a
fix):** `crossRepositoryTargetRoot()`'s own header comment claims a
symlinked target "still fails closed exactly as it would for any other
`topology()` caller" — but the implementation does not resolve the
symlink at all: `if (!info.isDirectory() || info.isSymbolicLink())
probe = dirname(target)` substitutes the SYMLINK'S OWN CONTAINING
DIRECTORY, not its resolved target, as the discovery probe. A real `git
-C <target>` would follow the symlink (the OS `chdir` it drives
resolves it); `dirname(target)` does not. If a symlinked
cross-repository target's containing directory happens to sit inside a
DIFFERENT valid git repository (plausibly the coordinator's own), the
function silently returns that wrong-but-valid root — nothing fails
closed, because a normal, safe directory was found. This reproduces,
for symlinked targets specifically, the exact misbinding class this
whole fix exists to close. No test in the diff exercises a symlinked
target. Also noted, non-blocking: the only evidence supplied for the
Trajectory check was prose in this file, not a machine-generated
artifact (QG-03) — the next dispatch should produce one.

**Not yet fixed.** Queued as `NVA-CROSSREPOLEDGER-2` (goldfish-deep):
resolve the symlink to its real target (not `dirname`) before probing,
add a regression test with a symlinked cross-repository target pointing
at a genuinely distinct fixture repository, and produce a
machine-written verify-output artifact under `evidence/` as this
dispatch's Trajectory evidence.

### Fix landed (NVA-CROSSREPOLEDGER-2, 2026-08-18) — 2nd Critic review dispatched

`crossRepositoryTargetRoot()` now resolves the full symlink chain via
`realpathSync` (mirroring `physicalRoot()`'s existing idiom) before
deciding the discovery probe, and fails closed (`return null`) on any
resolution failure (dangling link, cycle, unreadable component) instead
of falling back to `dirname(target)`; header comment corrected to no
longer claim the discovery step itself "fails closed exactly as any
other `topology()` caller." Two new regression tests:
`NVA-CROSSREPOLEDGER-2a` (symlink whose containing directory is itself
a valid, unrelated repo now correctly binds to the real pointed-at
target, full plan/authorize/consume round trip) and
`NVA-CROSSREPOLEDGER-2b` (dangling symlink falls through safely,
never binding to the repo containing the symlink). Independently
re-verified: `node --test plugins/pipeline-core/lib/human-guard-override.test.mjs`
— 69/70 pass, same pre-existing `HGO-EXTERNAL-MARKETPLACE` exception
the only failure. Commit `6d9e8f83`.

Second, fresh Critic review dispatched (`docs/adr/0059-signed-human-guard-override.md`,
diff `1404eb28..6d9e8f83`, evidence `evidence/NVA-CROSSREPOLEDGER-2-verify.txt`)
— not yet returned. Per this session's own cap, a 2nd FAIL here would
be self-verified by the Elephant directly rather than triggering a 3rd
Critic dispatch.

First attempt at this 2nd review STOPPED on a dispatch-construction
defect, not a code verdict: `.claude/pipeline.yaml` declares a
`governance` block (`guidelines_path`/`policies_path`) this repo's own
Critic-review skill requires every dispatch to include as guardrail
tokens; the first dispatch omitted them, so the skill's own hunt
category 11 (governance conformance) could never run and it correctly
refused to issue a verdict rather than review with a gap. Re-dispatched
immediately with `governance/examples/guidelines` and
`governance/examples/policies` added — this does not count against the
2-round FAIL cap, since no review completed.

### 2nd Critic review: PASS — closed

No findings. Independently confirmed: the symlink chain is now resolved
via `realpathSync` before probing (not `dirname`); `NVA-CROSSREPOLEDGER-2a`/
`2b` use three genuinely distinct git fixtures and actually ran (not
skipped) and passed; the fix's own header-comment correction is now
true (`topology()` really does re-apply its own physical-safety checks
as the "second layer" claimed); a dangling-symlink `null` return
correctly falls back to the pre-existing coordinator-ledger behavior,
never an under-restrictive bypass (GL-09); the checked-in
`docs/human-guard-override-threat-model.md:89`'s "symlink traversal
fails closed" row is now actually true rather than aspirational
(governance checklist item 2 — met, not a gap). One process note, not a
code finding: the evidence artifact this dispatch supplied
(`evidence/NVA-CROSSREPOLEDGER-2-verify.txt`) was plain text, not the
JSON-with-candidate-binding shape the skill's own preflight requires —
the reviewer worked around it by independently reconstructing the
evidence from `git diff`/`git show` directly, but future dispatches on
this item family should produce a proper JSON evidence artifact instead.
Closed.
