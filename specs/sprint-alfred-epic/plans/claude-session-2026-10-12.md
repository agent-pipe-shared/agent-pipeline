# Alfred — Claude continuation ledger (2026-10-12)

Entry: [HANDOVER-2026-10-12](HANDOVER-2026-10-12.md). This ledger records this
session's dispatch waves, integration results, collected signature-bound patches
and PO topics. Status words follow the operating-model glossary: nothing here is
"done" until PO-accepted; every row names its outstanding category.

## Session facts (observed, not inherited)

- Host: native Windows, Claude runner. Preflight `ready`, plugin
  `0.7.0+claude.20261011202443.a7a9b3cf` (local-development, content SHA
  `90b9e89f…` equal to source checkout). Mandatory hooks refreshed to current.
- Lifecycle: `sprint-alfred-epic`, phase implementation, `planApproved: true`,
  continuity revision 32, PRD/Spec digests match.
- `origin/feat/sprint-alfred` = HEAD `6447fcc1a` → the checkpoint push happened.
- Model-role bootstrap: `MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE` (fallback
  legacy-v3, lifecycle impact none) — a live native-Windows observation relevant
  to `pipeline.model-role-bootstrap-is-always-unavailable-on-native-windows`.
- Local-only fix: `refs/remotes/origin/HEAD` repointed from `origin/main` to
  `origin/feat/sprint-alfred` so worktree dispatches provision from this branch.

## PO direction received this session

1. Continue the Codex handover; work all open ACs and backlog items via fanout,
   autonomously; collect PO topics for when the PO is present.
2. Signature-bound topics are prepared like any other; patches are collected and
   the PO signs them en bloc later (recorded in
   [po-decisions-2026-10-12](po-decisions-2026-10-12.md)).
3. All 174 items must be built in; proceed quickly using the EGM whole-item
   owner procedure.

## Operating procedure (EGM, as applied here)

- One Goldfish owns one whole item: analysis, meaningful cases (RED first where a
  defect exists), implementation, targeted checks, commit. Worktree-isolated,
  disjoint items concurrently; overlapping files wait or are integrated by the
  Elephant with conflict resolution.
- Elephant integrates returned commits into `feat/sprint-alfred` (cherry-pick),
  consumes matched targeted evidence, does not routinely rerun.
- Protected paths (TP-1..13, GS-1..15) and anything the commit hook refuses are
  delivered as inert patches under
  `specs/sprint-alfred-epic/implementation/claude-2026-10-12/patches/` for one
  combined PO signing package.
- Review: per frozen batch one FULL Critic plus correction-diff reviews within
  the budget (see PO topic T1); one Correction Goldfish per batch.

## Waves

Batch **C1** (predeclared): pilot P0 plus wave 1. Review unit: one FULL Critic
over the frozen integrated C1 scope plus at most one correction-diff review
(stricter reading of T1), one Correction Goldfish for the whole batch.
Order: native-Windows rows first (this host's unique value), then stage-50/75
rows with prepared leaves, then 25/UNKNOWN. Items gated on an open PO decision
(T4) are not dispatched. Briefings are generated from
`templates/prompts/goldfish-task.md` into
`specs/sprint-alfred-epic/implementation/claude-2026-10-12/briefings/<wave>/`
and reuse the Codex results through
[reuse-index.json](../implementation/claude-2026-10-12/reuse-index.json).

| Wave | Items | Status |
| --- | --- | --- |
| P0 pilot | gitleaks-repair-ignore-cli-is-a-no-op-on-windows (`ALF-C-P0-GLRWIN`) | **blocked before launch** by guard-dispatch `SQ-DELIVERY-STATE-UNAVAILABLE` (see T6); nothing ran, nothing written |
| P0 pilot v3 | git-for-windows-2-56-rejects-git-config-global-nul (`ALF-C-P0-NUL`, R7-1a / AC-37) | T6-A installed (`0.7.0+claude.20261012094314.d097ecf`, hooks refreshed, preflight ready). Read-only pre-check of the built v3 prompt: briefing `NGHR-BRIEFING-VALID`; **not launched** because admission would refuse twice — see T10 |
| Scope fanout | all 174 items, 8 read-only Sonnet dispatches (`ALF-SCOPE-01…08`) | Done 2026-10-12. Results under [scope/](../implementation/claude-2026-10-12/scope/), not Elephant-verified. Status counts: 17 implementable, 43 already-satisfied (evidence binding only), 31 needs-native-host, 23 needs-po-decision, 60 unclear. [wave-plan.md](../implementation/claude-2026-10-12/wave-plan.md): the 17 implementable items fall into 5 disjoint waves (10/4/1/1/1). Overlaps are reserved on write paths, the check test, and the lib/scripts module family. `po-human-approval.mjs` serializes three items. `windows-owned-authority-backend.mjs` sequences the dispatch-budget item after T11. The 60 unclear rows go to a one-Goldfish-per-item EGM analysis that starts with a live re-check. Every productive dispatch still waits on T10 and T11 |

### T6-A exception scope (PO-granted, Elephant-implemented)

Outcome: a role-`goldfish` Agent dispatch from a Claude session can obtain a
bound current owner so `prepareGovernedItemQueue` can create the governed
`slice-queue.json` and the v3 native item route becomes reachable.
Design: a new fallback owner source, `lib/claude-hook-session-owner.mjs`,
consulted by `nativeManagedCurrentOwner` ONLY when the in-process requester
context is unavailable. It binds the Claude hook input `session_id` to a
private session descriptor created/loaded through the existing
`worktree-lifecycle.mjs` `startSessionDescriptor`/`loadSessionDescriptor`, and
reports a distinct assurance `claude-hook-session-descriptor` (hook-observed,
not an authenticated requester). Entry points that run under a Claude hook
(`hooks/guard-dispatch.mjs`, `hooks/native-goldfish-host.mjs`) enter that scope
from their own stdin. Not done: no queue hand-writing, no change to approval,
criterion, scope, collision or Critic rules, no hooks.json/verify-suites edit,
no installed-copy edit. Takes effect only after the operator refreshes the
local marketplace copy. Review: one full design-tier Critic (MP-07).

### Verified cause of the dispatch block (2026-10-12)

- `plugins/pipeline-core/hooks/guard-dispatch.mjs:131` — every role-`goldfish`
  dispatch requires governed item admission; `:444-457` refuses when
  `resolveGovernedItemQueue` is refused, and once a queue exists requires the
  native binding parsed from the prompt string (`direct`/`codex` transport
  only; Workflow `agent()` cannot carry it).
- `plugins/pipeline-core/lib/native-goldfish-host-state.mjs:771-807` —
  `specs/sprint-alfred-epic/slice-queue.json` does not exist (no Git history,
  not ignored), so the catch-all refusal fires. Environment config cannot
  disable it (by design).
- The only sanctioned writer, `prepareGovernedItemQueue` (`:814-880`), first
  requires a bound current owner (`:824`, `item-course-requester-unavailable`).
- `plugins/pipeline-core/lib/session-requester-bridge.mjs:205-207` — the owner
  context is an in-process `AsyncLocalStorage` requester; a fresh hook process
  is never inside one, so under Claude it is always `unavailable`.
- Conclusion: with current Source, productive Goldfish dispatch from Claude is
  structurally unreachable. This is the handover's named hold
  ("real requester/owner … for runtime-stage admission"), now reproduced live
  on native Windows/Claude. Not bypassed: no hand-written queue, no guard
  disable, no hooks/installed-plugin edit, no non-goldfish agent writing code.

### Wave pre-check (2026-10-12, Elephant, existence only)

This is a pre-check of the 17 implementable rows; it only checks that the named paths exist.
- 10 rows have an existing check test.
- 6 rows name a new test file for the Goldfish to create: hgo-disjoint, both platform-owner tests, NUL sites, both git-hook-runtime-snapshot rows, and guard-override digest.
- `gitleaks-content-suppression-does-not-match-on-windows` names `lib/gitleaks.mjs`, which does not exist. Its write set must be re-derived inside that item's EGM dispatch, so it is not briefable as scoped.

## Collected signature-bound patches

- T11 option (a): [T11a-helper-eol-lf.patch](../implementation/claude-2026-10-12/patches/T11a-helper-eol-lf.patch). It adds a per-file `eol=lf` override to `.gitattributes`. `git apply --check` passes; the patch is not applied. After it is applied, the helper file needs one re-checkout on each machine, and then the installed copy needs a refresh.
- T11 option (b): [T11-windows-helper-eol.patch](../implementation/claude-2026-10-12/patches/T11-windows-helper-eol.patch). It normalizes CRLF in the backend before the digest check. Not applied.
- T10: [item-register-proposal.md](../implementation/claude-2026-10-12/item-register-proposal.md) proposes spec §23. Its locators must be recomputed after the actual edit.
- T16 (2026-10-12, PO-run hotfix): native Windows reports POSIX mode 0o666/0o777, so
  owner-private / group-other-write mode tests can never pass there. Two such checks
  blocked the design route: `design-decision-bindings.mjs` (present-plan fails with
  `DDB-PARENT-UNSAFE`) and `chat-gate-ceremony.mjs` (every `sign-intent` fails with
  `chat:unsafe-namespace-chain` after the passphrase, so the HGO route could not repair it).
  The Elephant's own Edit was refused while the plan awaits approval. On the PO's request,
  `scratch/alfred-claude-20261012/hotfix-win32-mode.mjs` is a PO-run script. It scopes the four
  mode terms to non-Windows hosts in both the repository copy and the installed marketplace copy.
  Follow-ups:
  - Commit the repository copy under the PO exception and stamp.
  - Backlog: route Windows checks through the DACL assessment (`windows-private-state.mjs`, as
    `human-guard-override.mjs` already does) instead of skipping them.
  - Sweep the remaining `mode & 0o0[27]{2}` sites (about 160 hits in 76 files) for the same
    defect.
  - A failed `sign-intent` leaves `.git/agent-pipeline/session-authority/registry.lock`
    behind (`registry-lock-held` on retry), and there is no recovery action for it.
- T19 (2026-10-12, PO decision): governed item admission refused the pilot with
  `CAC-REGISTRATION-INVALID`. `readAcceptedDeliveryContract` requires the signed
  accepted-delivery contract to be registered as `candidate-evidence` in
  `specs/sprint-alfred-epic/lifecycle.json`. `approve-plan` writes that `manifestPath`
  into the envelope without checking the manifest exists, and no product writer
  registers `candidate-evidence` (only test fixtures build it by hand; the
  sanctioned bootstrap admits only `draft` with one PRD).
  The PO chose a script: `scratch/alfred-claude-20261012/write-alfred-lifecycle.mjs`
  writes the manifest in state `implementing`, binding prd/spec/acceptance/result and
  the contract; `validateFeaturePackage` and the identity resolution both pass.
  The next refusal, `item-course-criterion-unbound` (`native-goldfish-host-state.mjs:838`),
  was the Elephant's own locator defect, not a product gate. The §23 parser
  (`critic-accepted-contract.mjs`) binds the trimmed Criterion CELL of a
  `| # | Criterion | Evidence |` row. `build-v3.mjs` had located the whole row, so the
  locator parsed as unsupported. Correction (an earlier note here misread the gate as
  "only already-passed criteria"): `build-v3.mjs` now locates the cell. The probe then
  returns `SQ-DELIVERY-REQUIRED` (slice ready), and the real `guard-dispatch` admitted
  ALF-C-P0-NUL with its v3 binding. The no-binding fallback is not needed; `guard-dispatch`
  refuses an unbound dispatch anyway with `SQ-DELIVERY-STATE-UNAVAILABLE`.
  Known gap: the Claude Agent tool launches subagents asynchronously, so the native host
  commit reports `NGHF-PENDING-UNAVAILABLE`. The Elephant commits the Goldfish's exact
  write scope afterwards, with `Commit-Act: orchestrator` (EL-13a).
  This is the fourth late design-route failure after DDB, ceremony mode bits and the
  per-file `ls-tree`.

### Design-to-implementation blocker list (PO 2026-10-12: map onto EXISTING Alfred items, no new item, no design reopen)

PO target: switching from design to implementation takes about 10 minutes of PO time and
exactly one terminal signature. On 2026-10-12 it took over 7 hours. Every blocker surfaced
only after the previous one was fixed.

Each blocker gets fixed under an existing Alfred item (Windows/performance/route items),
or as a follow-up note on one. It never becomes a new scope entry.

1. POSIX mode checks on win32 (`design-decision-bindings.mjs` `DDB-PARENT-UNSAFE`,
   `chat-gate-ceremony.mjs` `chat:unsafe-namespace-chain` after the passphrase). Skipped on win32 in
   `5672330ac`; the proper fix is the DACL assessment. The ~160 similar sites still need a sweep.
2. A stale `session-authority/registry.lock` after a failed `sign-intent`; no recovery action.
3. The Elephant's own Windows fix is refused while the plan awaits approval, so every fix becomes
   a PO-run script.
4. `approve-plan` took about 1 h: one `git ls-tree` per file (hotfixed, uncommitted, protected).
5. `approve-plan` `CAC-CAPTURE-READBACK`: directory fsync on win32, plus a stale contract file, and
   the cause is swallowed (hotfixed, uncommitted).
6. `CVCT-APPROVAL-UNAVAILABLE`: the writer does not harden the state-file DACL (PO `icacls`).
7. `CAC-REGISTRATION-INVALID`: no lifecycle.json and no candidate-evidence writer (T19 script).
8. `item-course-criterion-unbound`: caused by the Elephant's locator (whole row instead of the
   Criterion cell). The refusal names no cause, though; a typed diagnostic ("locator does not
   match the parsed criterion cell bytes X..Y") would have saved the detour.
9. Async Agent dispatch cannot be host-committed (`NGHF-PENDING-UNAVAILABLE`), and the Agent tool
   exposes no `run_in_background: false`. Consequence: `prepareNativeGoldfishHostState` fails every
   governed item dispatch with `NGHS-CLAUDE-FOREGROUND-REQUIRED`, and guard-dispatch blocks it.
   The first pilot slipped through only because guard-dispatch crashed (non-2 exit, so Claude
   proceeds). The crash left a stale `session-authority/registry.lock` (19:07:47) and wrote no
   pending budget binding, so the child was refused at its first call
   (`DBB-PENDING-BINDING-MISSING`). T20 PO-run hotfix
   `scratch/alfred-claude-20261012/hotfix-claude-foreground.mjs`: for a Claude runner and exactly
   that code, warn and continue, with the child left uncommitted. The Elephant commits the exact
   write scope with `Commit-Act: orchestrator`. Item admission and the budget binding still run.
    After T20 the second pilot launch failed the same way, so the crash is not foreground-specific.
    Suspected cause (T21): the `guard-dispatch` hook timeout is 10 s. Even a lock-held refusal
    took 5.4 s; the full admission run (lock + queue preparation) on Windows exceeds that.
    Claude Code kills the hook mid-lock, the non-2 exit admits the dispatch, no budget binding is
    written, and the lock stays behind. PO-run `hotfix-dispatch-timeout.mjs` raises the
    timeout to 120 s in hooks.json. Structural fix: admission must be fast (seconds), and a
    killed hook must not admit the dispatch.
    Measured after the PO removed the lock: one guard-dispatch run takes 20.6 s (old timeout 10 s),
    which confirms T21.
    PO direction 2026-10-12: the Elephant removes stale locks itself in every phase, as a
    deliberate, logged decision, and the PO is never needed for it. Fix: a sanctioned recovery verb
    with a dead-owner check that runs in all phases, mapped onto the existing lock/recovery items.
10. A hook crash must fail closed, or at least fail visibly: an exception in guard-dispatch silently
    admitted a dispatch, and leftover locks (`registry.lock`, twice today) have no recovery action.
11. Pattern: every blocker above is a POSIX-only or foreground-only assumption, and nothing caught it
    before live use. Fix direction (PO 2026-10-12): a single preflight that catches all of these before
    the signature/dispatch, plus a native Windows test lane.

The root pattern: no end-to-end test of the real route on a legacy package on native Windows.
Fixtures hand-build exactly the missing pieces. Fix direction: one read-only route pre-check
that reports every precondition before the signature, a performance bound on approve-plan, and an
end-to-end test from a legacy package to an admitted open-AC item.

### Security scan triage (2026-10-12, Elephant, read-only)

`evidence/security-latest.json` (gitleaks 114 findings, verdict BLOCKING) is spot-checked as false
positives. All findings sit in code that names PEM headers as string literals
(`po-human-approval.mjs:1624`, `po-human-approval.test.mjs:122`), in sha256 digests
matched as "sentry-access-token" (`project/pipeline-state.json:929`, `previousEntrySha256`), and in
fixtures, evidence logs and checkpoint postimages/patches that copy those same lines.
No finding was a real credential in the sample. The remaining step belongs to the existing
Alfred gitleaks items (Windows suppression / repair-ignore no-ops), not a new item.
osv-scanner was SKIPPED (`untrusted_path`), which is an existing Windows path-trust gap.

## PO topics (to ask when the PO is present)

- **T1 Review budget conflict:** state.md/handover say FULL + max **3** DIFF;
  WORK-STATUS (PO 2026-10-10) and the 2026-10-07 instruction say FULL + max
  **1** DIFF. Applying the stricter (1 DIFF) until clarified.
- **T2 Codex session closed?** One Elephant per repo (EL-18): confirm the Codex
  session that produced the handover is no longer writing this repository.
- **T3 En-bloc signing:** one combined signed package for all collected patches
  plus the 48 inert prepared-source leaves (their preimage bindings must be
  refreshed against current Main first).
- **T4** The decisions already open in
  [po-decisions-2026-10-12](po-decisions-2026-10-12.md) (public derivative
  producer, snapshot-freshness carrier, direct-mini signature contract, native
  read selector policy, review-course design package) remain open.
- **T5 Cadence:** 174 items at roughly 8 concurrent whole-item owners, each
  briefing finalized and each result integrated by the Elephant, means many
  sessions; no ETA is established or implied.
- **T6 Dispatch block (blocking all implementation):** options put to the PO —
  A) bounded EL-01 exception for exactly the one outcome that makes governed
  item admission obtain a bound owner under Claude (catch-22 breaker),
  Elephant-implemented, then full Critic; B) run implementation waves on a
  runner whose native route is qualified (unverified — Codex also reported
  `SQ-DELIVERY-STATE-UNAVAILABLE`); C) hold productive dispatch and run only
  the non-productive analysis lane.
- **T7 Security gate BLOCKING (2026-10-12, `security-scan.mjs`, HEAD `ba1e025e8`):**
  gitleaks 111 high findings, semgrep timed out (60 s), osv-scanner skipped
  (`untrusted_path`), license OK. Findings concentrate in committed checkpoint
  evidence (`transfer-2026-10-08/bundle-evidence.json` 26,
  `live-main-composition` 20, `wsl-intake-2026-10-09` 15,
  `handover-2026-10-09` 8, `prepared-custody` 6) plus known test fixtures
  (`po-human-approval*`, `*.fixture.mjs`) and one ignored root `evidence/`
  file. Values were not printed. Likely digest/fixture false positives, but
  each needs exact static classification (never automatic stripping); these
  paths are already pushed. Classification is a dispatchable item once T6 is
  resolved; scanner availability (semgrep timeout, osv path trust) on this
  Windows host is a separate environment observation.
- **T8 (post-Alfred, PO finding 2026-10-12):** TP-1..13 protect only the named
  test files. Weakening a helper, fixture or sub-test that a protected test
  depends on is not protected. Proposal to study after Alfred: two test
  categories (critical vs ordinary) and extend protection to the dependency
  closure of critical tests, not only the file itself. Register as a backlog
  item when the backlog writer is next used.
- **T9 Windows fixture baseline:** `prepareApprovedItemCourseFixture` fails on
  native Windows at `submit-plan` for every fixture-based case in
  `native-goldfish-host-state.test.mjs` (NGHS06-20); on `/mnt/d` under WSL the
  same cases fail `GS-PRIVATE-MODE` (DrvFs has no POSIX modes). Qualification of
  T6-A therefore runs in an owned native-WSL clone. Root-cause belongs to the
  Windows temp/DACL fixture items.
- **T10 Item admission needs a re-approved design (2026-10-12, read-only
  probes, nothing launched):** after T6-A the governed item route has two
  further hard preconditions the live Alfred state does not meet.
  (1) `observeCurrentPlanApprovalForCalibration` (`scripts/pipeline-state.mjs`
  13711-13723) accepts only a current-schema plan approval
  (`validCurrentPlanApproval`, `lib/plan-spec-state-v2.mjs:410`); the live
  approval is `pipeline.plan-approval.v7` (valid only as previous-current), so
  it returns `CVCT-APPROVAL-UNAVAILABLE` and `prepareGovernedItemQueue` refuses.
  `sealCurrentPlanApproval` does not apply (v4-prior only). (2) The criterion
  locator must point into `spec.md` itself
  (`native-goldfish-host-state.mjs:833`) at a structured acceptance entry under
  an "Acceptance criteria" heading — a `| # | Criterion | Evidence |` table
  row, an `AC-n` heading paragraph, or a numbered `**AC-n:**` item
  (`critic-accepted-contract.mjs:196-293`). `spec.md` has none (the AC table is
  in `acceptance.md`), so every locator is `CAC-CRITERION-UNSUPPORTED`.
  Collision is per criterion locator, so 37 shared epic ACs would also
  serialize items that share an AC. Recommendation: one design reopen that adds
  a per-item acceptance register to `spec.md` (one plain-text row per original
  item, ids disjoint from AC-1…AC-37, each pointing at the item's own backlog
  acceptance, consistent with Spec §16 "each backlog item's own acceptance
  remains authoritative"), then one current-schema re-approval by PO
  signature. Both preconditions are cleared by the same single approval.
- **T11 Windows session authority is unusable on every Windows checkout
  (2026-10-12, live):** the real pilot dispatch (`ALF-C-P0-NUL`, built from
  `goldfish-task.md` with the v3 binding) was refused before launch with
  `SDC-AUTHORITY-UNAVAILABLE`. Reproduced outside the hook with the same
  session id: reason `WIN-AUTH-HELPER-CAS`
  (`lib/windows-owned-authority-backend.mjs:19`). Cause: `.gitattributes:18`
  `*.ps1 text eol=crlf` checks `lib/windows-owned-authority-native.ps1` out
  with CRLF (150 CRLF), while the backend pins the LF blob digest
  (`HELPER_SHA256` `66865ee9…`; working file `80035069…`; its LF
  normalization equals the pin). So the owner scope of T6-A is entered
  (`entered: true`) but `withSessionAuthorityBoundary` fails on native
  Windows before any owner, approval or criterion check. This also answers
  Critic finding F1 at the consumer position: the hook path is reached and
  fails closed further down. Fix options: a per-file `eol=lf` attribute for
  the helper (plus re-checkout), or hashing the helper after CRLF→LF
  normalization in the backend. Either is a source change under the current
  dispatch catch-22 (no Goldfish admissible), so it needs the PO's call
  together with T10.
- **T12 Item-level PO decisions (23, from the scope fanout):** these rows are listed under `needs-po-decision` in [wave-plan.md](../implementation/claude-2026-10-12/wave-plan.md), and each one's reason is in its scope batch file. Some are bundled with topics already raised:
  - Opus-critic routing: covered by today's direction.
  - design-workflow-package-omits-contract: part of T10.
  - critic-scratch-notes: reproduced live.
  The rest are presented to the PO as one list, in groups: design-course and Advisor routes, trailer form, push lane, security scope, and telemetry ownership.
- **T11/T10 recommendation (raised 2026-10-12):**
  - T11: the preferred option is a per-file `.gitattributes` `eol=lf` override for the helper, plus a one-time re-checkout. It writes no production code. It also avoids colliding with the prepared backend postimage of the dispatch-budget item.
  - T10: the §23 register; recompute the locators against the actual post-edit spec sha; then one current-schema re-approval signature.
  - Capacity: two productive Goldfish slots under the current limit. The PO was asked whether to raise it.
- **PO decision 2026-10-12:** follow both recommendations, T11 (a) and T10 (§23 register plus one re-approval signature).
  - T11 (a) applied in `b1933efa0`; the helper working copy is now LF and matches the pin. Stamp `b29cf4f4c` (`0.7.0+claude.20261012111014.b1933ef`) is waiting for the PO's install.
  - Capacity, PO 2026-10-12: up to 10 parallel dispatches. This matches the shared-pool direction in `docs/adr/draft-shared-agent-capacity.md` (proposed, not adopted).
    - Checked in source: `concurrencyLimit` is only seeded (value 4) and shape-validated (`continuity-state.mjs:335-354`). The legacy reserved slots normalize to the shared shape, so no idle Critic or recovery slot is subtracted.
    - No dispatch guard enforces the number. The only consumer is the Workflow failover recovery check at `workflow-writer-preflight.mjs:440-441`, which does not apply to Agent-tool dispatches.
    - So no source change is needed for 10 parallel: the effective bound is disjoint write scopes, enforced by the guard's collision check.
    - The State value stays 4. No sanctioned capacity migration writer exists, and protected State is not hand-edited.
- **T11 verified live (2026-10-12, after PO install of `b1933ef` and hook refresh):** the probe `probe-hook-owner.mjs` against the pilot prompt is no longer refused with `SDC-AUTHORITY-UNAVAILABLE`.
  - It now reports `SQ-ITEM-CANDIDATE-DRIFT`. The prompt was built for an older candidate HEAD, so it is rebuilt after T10.
- **T14 Per-machine parallel dispatch ceiling (PO direction 2026-10-12):**
  - Default 12, configurable per machine. The State seed of 4 is not acceptable.
  - Proposed design: a machine-level setting in `pipeline.user.yaml`, read through its existing reader, with range 2..64 per `normalizeContinuityCapacity`.
    - Onboarding seeds use it instead of the literal 4: `onboarding-continuity.mjs:1243/1345/4596` and `pipeline-state.mjs:10509`.
    - Dispatch admission enforces it as an operator ceiling over running dispatches. Today no dispatch guard enforces the number.
    - The shared-pool rule of `docs/adr/draft-shared-agent-capacity.md` applies: no idle reservations.
    - Existing State is migrated through a sanctioned plan/apply writer, never a hand edit.
  - Route: a production-code item, done by one Goldfish (deep tier, because it is guard code with design latitude) in the first wave after T10. Its own Critic falls in the batch FULL review.
- **PO decision 2026-10-12 (T12 subset):** AC-144 `critic-scratch-notes-write-is-refused-again` takes option (a): a source-owned, dispatch-bound Critic notes writer, not an explicit text-only fallback. It is scheduled with AC-143, AC-169 and AC-120 in a normal Alfred wave, with no timing constraint.
- **T15 Make the item-delivery operating model shipped Pipeline behaviour (PO question 2026-10-12):**
  - Checked: the shipped reference `skills/pipeline-start/references/implementation-continuation.md` requires template-built Goldfish dispatch, and Agent/Workflow fan-out stays Elephant-only. It does not require any of the following:
    - per-item criterion rows in the Spec
    - default maximum parallel fanout over disjoint write scopes
    - one Goldfish per item doing analysis, test, fix and test (EGM)
    - a wave plan
  - The guard enforces only item admission: criterion locator, per-criterion and write-scope collision, and the v3 binding.
  - Today the operating model lives in this repo's `docs/state.md`, the session ledger and machine-local memory. A new session in another repository, or one after Compact, would not apply it unprompted.
  - Proposed Source work, one Goldfish item in a first wave, to go into a Spec delta at the next design reopen:
    1. Extend `implementation-continuation.md` with the EGM-per-item and maximum-disjoint-fanout default.
    2. Ship the wave planner as a plugin script. It reads the item write and check scopes and emits disjoint waves.
    3. Add the fanout default to the post-compact reground context.
    4. Add a `pipeline-start` rule that an epic's item register is a Spec section.
- **PO decision 2026-10-12: T15 is in.** T14 and T15 are new work, not original Alfred items, so neither has a §23 row yet.
  - The T10 design review budget is spent: an initial review plus one delta, and ADR-0085 allows no round 3. Adding rows now would void both receipts.
  - So T14 and T15 enter by one follow-up Spec delta, with rows AC-275 and above. It is bundled with any other scope additions at the next design reopen, after the first waves are admitted. That costs one more review and one more PO signature, and the T10 approval is not delayed.
- **T13 Scope intake into a running sprint (PO concern, 2026-10-12; post-Alfred design topic):** with the §23 register, a new backlog item can only enter an implementing sprint through a spec change and a re-approval. That makes small bugfixes pay a design↔implementation switch.
  - Checked: item admission binds the §23 row text in `spec.md`, not the backlog file bytes. Grep of `native-goldfish-host-state.mjs` and `critic-accepted-contract.mjs` shows no backlog binding. So an admitted item's backlog file can still be refined and extended with findings without re-approval.
  - Open: a light intake lane for new in-sprint findings, for example reserved finding slots or a bugfix fast lane, as a Pipeline design item after Alfred.
- **PO decisions 2026-10-12 (evening):**
  - T2: the Codex session is closed; this Claude session is the only Elephant writing the repo.
  - T3: signature-bound changes are collected into one combined signing session: the T17/T18
    `pipeline-state.mjs` hotfixes, T20 `guard-dispatch.mjs`, T21 `hooks.json`, and Goldfish patches.
  - T14/T15: attach them to existing §23 items where they fit cleanly (no design reopen). The
    Elephant checks the fit before dispatching.
  - T12: go through the item-level decisions one by one, now.
- **PO decisions 2026-10-12, T12 (item-level, binding for the item Goldfish briefings):**
  - `sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows`: stronger fix.
    Spawn openssl only through a resolved absolute path outside the repository; never search the
    working directory. Search beyond the default install path (PATH entries plus known install
    locations, for example Git for Windows and OpenSSL installs). The resolved path is remembered
    machine-locally in `pipeline.user.yaml` (for example `signing.openssl_path`): written on first
    discovery, afterwards only re-validated (it must exist and lie outside the repository).
  - `feature-branch-push-admitted-without-signature-approval`: a signature for every push. The
    unsigned checkpoint lane is removed, so code and docs agree.
  - `every-dispatch-pays-a-bootstrap-receipt-detour`: a SubagentStart hook issues the receipt
    automatically. The hooks.json change goes into the signing package.
  - `draft-phase-guard-blocks-mandatory-bootstrap-preflight`: normalize plugin-root spellings only;
    no new pre-READY grant.
  - `design-trailer-verifier-lost-after-closure` and `installed-design-trailer-example-is-rejected-by-git-guard`:
    remove the `ELEPHANT_DESIGN_ID` form, on one condition: the Elephant must still be able to
    commit. The Elephant's existing `Dispatch: <id> (elephant)` + `AI-Assisted: true` route must stay
    admitted, and the Goldfish must prove that with a test.
  - `critic-scratch-name-randomness-has-no-admitted-command`: the AC-144 Critic notes writer also
    creates the directory and its name.
  - `parallel-work-in-one-checkout-is-unsafe`: disjoint write scopes are enough; no new checkout
    lock. Close the item with that rationale.
  - `lifecycle-read-scope-blocks-host-declared-system-skill`: an exact host-declared path, read-only.
  - `hgo-stale-capability-shadows-current-authorization`: the newest authorization wins. A stale
    capability is refused with a named reason and never shadows the current one.
  - The five design-course/Advisor route items (`design-course-run-v2-refuses-its-own-documented-routes`,
    `design-workflow-package-omits-contract`, `revised-native-design-cannot-reach-a-new-advisor-course`,
    `advisor-demand-reuse-has-no-design-course-bound`, `advisor-provenance-ancestor-check-fails-on-any-sibling-write`):
    close them against ADR-0085. Each Goldfish checks whether the defect still exists on today's
    route. If not, it closes the item with evidence; if so, it fixes it on today's route. No
    retired ceremony is revived and no design reopen happens.
  - `brownfield-implementation-entry-demands-a-greenfield-design-block`: exempt brownfield; the
    ratchet applies only to newly created targets.
  - `design-bootstrap-verify-state-contradicts-deferred-contract`: the Goldfish picks the
    conservative alternative, which respects the deferred contract, and gives its rationale in
    the report.
  - `elephant-main-context-spent-on-wake-ups-and-inline-reads` and
    `forensics-and-audit-evidence-not-reconstructable`: these stay in Alfred, one Goldfish per item.
    The plugin (`scripts/`) owns the minimal measurement and recovery tooling; runner-specific parts
    run on their host.
  - `codex-bootstrap-in-the-typed-next-action`: re-check live; if it is not reproducible, close it
    with evidence.
  - `agy-imported-plugin-snapshot-shadows-registered-plugin`: an Antigravity-host spike inside
    Alfred, run when an AGY host is available (it is tracked as a native-host item).
  - `opus-critic-only-batched-for-architecture-and-security`: follows the PO direction of
    2026-10-12 (Sonnet Critics, Opus only for critical architecture/security).
  - `critic-scratch-notes-write-is-refused-again`: AC-144 option (a), decided earlier.
- **Answered in chat:** Elephant model stays Opus (judgment/integration);
  Goldfish default Sonnet, deep tier only with MP-05 rationale. Autocompact at
  500k tokens.
- **PO direction 2026-10-12 (late evening), batch Critic as the shipped standard for every repository:**
  - No Critic run per item. A Critic reviews only an integrated state that belongs together functionally and has enough size. Each batch gets one FULL plus at most three DIFF reviews, on Sonnet.
  - Goldfish never do Critic work. They own analysis, test, fix and targeted GREEN for their item.
  - Defect it removes: slice-queue rule SQ-TIER requires a critic follow-up slice per guard/hook/security/architecture slice, and `prepareGovernedItemQueue` never creates one. That blocks W1-01 (AC-102) and W1-04 (AC-152) at admission.
  - Fix direction: admission attaches each such slice to ONE shared batch-critic slice per batch (for example `ALF-C-C1-critic`). The rule's intent (an independent review exists) is kept; the per-item Critic run goes away.
  - This must be shipped enforcement in `plugins/pipeline-core`, not a local hotfix. It attaches to existing §23 items, same treatment as T14/T15 (no new item, no design reopen). The Elephant picks the fitting item before dispatch.
- **Parallelism observation, wave 1 (2026-10-12):**
  - Admission is serial. Each guard-dispatch run takes 20–30 s and holds `session-authority/registry.lock`.
  - A dispatch issued while another hook holds the lock is refused with `SDC-LOCK-HELD`. This happened live for W1-06, and the retry was admitted. Fix direction: bounded wait/retry on the registry lock inside admission. It joins the blocker list (preflight, lock recovery).
  - The T14 ceiling (default 12) is still unenforced. PO decision 2026-10-12: work at 12 concurrent agents including the main session, so up to 11 dispatches. Watch for instability and reduce if it appears.
- **W1-02 finding (Goldfish report, 2026-10-12):** the live guard-push at the candidate does NOT refuse `git commit -m … --trailer …`. `agent-obligations.md` and the generator (lines 145–147) claim it does.
  - Either the sentence is stale, or the refusal sits in another layer (guard-git or guard-lifecycle-ready).
  - Re-measure which layer refuses, then correct the generator text. This attaches to the same item (`agent-obligations-recommends-a-commit-spelling-guard-push-refuses`) as a follow-up slice with generator plus template scope.

## Night fanout, 2026-10-12/13 (pin wave P1 and fix F1)

Status is "implementation complete, targeted GREEN by the dispatch". The independent batch Critic (C3), Full Verify and PO acceptance are all still pending; nothing here is accepted.

- **Committed (targeted GREEN, one commit per item, Commit-Act orchestrator):**

  | Slice | Item | Commit |
  |---|---|---|
  | P1-11 | handover-doc-committed-without-governance-classification | `d68cbae1f` |
  | P1-12 | lifecycle-inspect-omits-current-plan-spec-digests | `3463e72d7` |
  | P1-13 | installed-design-trailer-example-is-rejected-by-git-guard | `8d0277665` |
  | P1-14 | design-trailer-verifier-lost-after-closure | `731e457a0` |
  | P1-15 | concurrent-session-warning-never-fires-on-native-windows | `853af051d` |
  | P1-16 | gitleaks-repair-ignore-cli-is-a-no-op-on-windows | `925ecd409` |
  | P1-17 | windows-portable-seed-rolls-back-with-hidden-worktree-error | `de316a75d` |
  | P1-18 | retirement-reader-masks-typed-unsafe-layout-inspection | `43419638c` |
  | P1-19 | codex-advisor-shared-namespace-rejects-fresh-repository-identity | `5cc985b24` |
  | P1-22 | reconnect-sandbox-empty-child-output-breaks-bootstrap | `e367c0e86` |
  | P1-23 | design-bootstrap-verify-state-contradicts-deferred-contract | `70eef1002` |
  | P1-06 | design-approval-validator-rejects-json-key-reordering | `b5e197488` |
  | F1-01 + P1-09 | windows-greenfield-scratch-write-denied (source fix in `physical-scratch-boundary.mjs` `inPhysicalRoot`, then pin) | `0eaa8d0b3`, `743f2ea6a` |

  Notes on the committed pins:
  - Typed win32 skips (directory symlinks, POSIX mode bits, file symlinks) are named in each pin. P1-19 has three POSIX-only cases that still need a POSIX run.
  - P1-17 A5 (fresh Windows session with the installed candidate) and P1-09 W5 (fresh Windows intake) are manual checks, not claimed.

- **Real defects found, not fixable inside a pin slice:**
  - **P1-10**, item `claude-windows-guard-refuses-every-in-repo-read`:
    - `rg --no-heading`, `-m N` and repeated `-g` are refused with GUARD-READ-COMMAND-UNSUPPORTED.
    - The prepared Codex postimages for `hooks/guard-command-grammar.mjs` and `lib/guard/shell-grammar.mjs` apply without drift (preimage sha match). A simulated run of the pin is GREEN 9/9.
    - Both paths are guard tier, so SQ-TIER needs the batch-critic slice. This goes into the PO hotfix package.
  - **P1-24**, item `dispatch-record-ownership-binds-an-attempted-creation`:
    - On native Windows `readDispatchRecordOwnerClaim` falls back to `physicalCreationFile()`. That requires `(mode & 0o022) === 0`, which Windows never satisfies.
    - Result: every claim, including the owner's own, reads as `invalid-landed-claim`, so the owner is refused.
    - The pin is 4 GREEN / 6 skipped (OWN-5/6 need POSIX). It is held uncommitted.
    - The fix belongs in `lib/guard/dispatch-record-lane.mjs`, which is guard tier, so it also goes into the PO hotfix package.
  - **P1-20**, item `existing-signing-key-reuse-deadlocks-onboarding`, suspected gap:
    - `po-human-approval.mjs` setup's private+public+authority branch never derives the public key from `po-private.pem`.
    - So a swapped canonical private key may be re-anchored silently. A second dispatch is measuring this (case A5b).
- **Host/environment findings:**
  - A fixture with `git init` but no commit (unborn HEAD) makes `set-feature` fail with WT-GIT-FAILED ("State authority route unavailable").
    - This is the root cause of the P1-21 failures. The adjacent `pipeline-state-inspect.test.mjs` drift case fails the same way on this host.
    - One empty initial commit fixes it. Open question for greenfield: should a fresh repository before its first commit be a typed state instead of WT-GIT-FAILED?
  - Onboarding fixtures (driveOnboardingInit plus openssl setup) cost about 200 s each on this host. Each pin should build one shared fixture.
  - `codex-design-readiness-host-store.shared-parent.test.mjs` asserts a 0755 shared parent after mint. That looks stale against the Ruling-141 private root creation (POSIX only, not run here).
- **PO topics added tonight:**
  1. P1-23: should `set-phase --phase implementation` keep admitting a baseline-only Verify (current, newer approved policy, release stays blocked) or require `--verify-command`? The pin records the measured policy as a visible case.
  2. Hotfix package additions: the P1-10 grammar postimages and the P1-24 Windows mode check (both guard tier).
  3. Unborn-HEAD typed state for greenfield (see above).
- **Still running or held at 2026-10-13 early:**
  - Continuations P1-03, P1-08, P1-20 and P1-21 are running.
  - P1-24 is held (needs the guard fix).
  - W1-05, W1-07 and N1-04 stay as recorded above.

## Night fanout, 2026-10-13 (batch C3 review and corrections)

Status is "implementation complete, targeted GREEN by the dispatch". The batch C3 review is still running, and Full Verify and PO acceptance are pending. Nothing here is accepted.

- **More commits (targeted GREEN, Commit-Act orchestrator):**
  - P1-05 `governance-scope-rejects-readonly-host-git-control`, `065eca57e`. Points 1-5 and 8 are POSIX-only skips.
  - W1-05 `disjoint-signed-hgo-actions-invalidate-one-another` (AC-160), `348b421f3`. `apply_patch` joins the native disjoint override contract. This is a security library, so it needs its own batch Critic.
- **Batch C3 (22 commits: the P1 pins plus the F1-01 source fix):**
  - Review 1, FULL: consumed, partial at the 80 % checkpoint, non-PASS. An earlier attempt stopped on a briefing violation that was the Elephant's error: the session ledger had been referenced as dispatch-record and claims evidence. No review happened in that attempt.
  - Findings and their state:

    | Finding | Severity | State |
    |---|---|---|
    | C3-F1 | major | corrected |
    | C3-F2 | major | corrected |
    | C3-F3 | major | PO topic: P1-23 A2 pins the measured policy against the item's bullet 2 |
    | C3-F4a-c | minor | corrected |
    | C3-F4d | minor | held: possible conflict with PO decision T12 |
    | C3-F5 | minor | briefing error: AC-128 listed but not in the batch |
  - Corrections: `c4a247144` (P1-16), `2037af586` (P1-07), `e8adfcafb` (P1-09), `1729332fe` (P1-01), `3bcc40517` (P1-19).
  - Review 2, DIFF over the five corrections: PASS, scoped. No blocker or major finding, so the review budget stops here. Two minors stay open:
    - C3D-F1: the AC6 parallel processes share no on-disk state, so the real readiness flap (`cleanup_recovery_observation_unavailable`) stays uncovered. Its owner is the separate FLAP fix of the item.
    - C3D-F2: the AC-130 mode-bit cases have never run, because they skip on win32. A POSIX run is pending.
  - The DIFF review was not run against `guardrails/security.md`, `roles/goldfish.md` or `project/pipeline.json`. It also did not cover pin registration in Verify, which is unregistered anyway (see below).
- **PO decisions, 2026-10-13 (chat, decision tiles):**
  1. **Verify registration:** one combined patch registers all 59 unregistered suites in `harness/verify-suites.json` (TP-13). A Goldfish prepares and checks the exact patch, and the PO signs it once.
  2. **P1-20 A5b:**
     - A Goldfish fixes `po-human-approval.mjs` so the setup and recovery branches derive the public key from `po-private.pem` and compare it with `po-public.pem` and the fingerprint.
     - The pin turns GREEN.
     - A security batch Critic follows, on Sonnet.
  3. **Guard hotfix package, all four items as one package:**
     - P1-10, the `rg` grammar.
     - P1-24, the Windows mode check in the dispatch-record owner claim.
     - A completion state in the slice queue (ends SQ-OVERLAP).
     - A bounded registry-lock retry in admission (ends SDC-LOCK-HELD).
     - One batch Critic reviews the package, and the PO installs one stamp. The package is shipped enforcement for all repositories.
  4. **P1-23 A2:**
     - Keep baseline-only Verify at the `set-phase --phase implementation` entry. The newer policy governs, and release stays blocked.
     - This is the PO disposition of C3-F3: the pin's A2-literal case stays as recorded.
     - The item's Acceptance bullet 2 is superseded for implementation entry. Owner: PO. Recorded 2026-10-13.
  5. **C3-F4d:** T12 governs. With no design-trailer verifier left, the Acceptance bullet 3 check over closed items lapses. C3-F4d is closed as a PO disposition, and the pin stays.
  6. **Stamp:** no interim refresh. The PO installs one stamp after the guard hotfix package. The Elephant then rebases the briefings onto the new ruleset SHA.
  7. **POSIX coverage:**
     - The Elephant runs the onboarding corpus and the POSIX-only pin cases in WSL on this host, read-only, and records the results in this ledger.
     - If the guard refuses the WSL route, the Elephant hands the exact commands to the PO.
  8. **Order of work:**
     - First: the hotfix package, the A5b fix and the Verify registration patch.
     - In parallel: the P2 pins continue.
     - After the stamp: large waves over the source-fix and guard items.
- **W1-07** `worktrees-share-onboarding-private-state-with-root-bound-intake`, `f08ca4e37`. Its new case OBC299 is GREEN on this host. The whole onboarding-continuity corpus is 301 tests: 251 pass, 50 fail on native Windows (symlink, mode, DACL and cleanup cases). W1-07 adds one case, so it is not the plausible cause. The corpus needs a POSIX run and a Windows baseline.
  - **Deviation from the one-Correction-Goldfish rule:** one shared correction slice was refused with SQ-OVERLAP, because the slice queue has no completion state. Each correction therefore reused its original slice id. This joins the queue-completion hotfix topic.
- **Defects and findings:**
  - **Verify never runs the pins.** `harness/scripts/check-verify-suite-registration.mjs` exits 2 and reports 59 unregistered suites. They include every `lib/pins/*` file and several earlier Alfred suites. `harness/verify-suites.json` is TP-13 protected, so registration needs a PO-signed edit. This joins the hotfix package.
  - **P1-20 A5b (security):**
    - `po-human-approval.mjs` setup never derives the public key from `po-private.pem`. A swapped canonical private key is anchored with TRUST-ANCHOR-BOOTSTRAP-COMPLETE.
    - A6 was a test-authoring issue: a replay correctly refuses with BTR-PLAN-DRIFT. It is now GREEN.
    - The pin is held uncommitted until the source fix lands.
  - **Critic persistence is unavailable on this host.** The notes write is refused with `DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held`, so the report lives only in the hand-back.
  - **Goldfish and Critic preflights:**
    - Every preflight reports `hook-refresh-required`, and the environment readiness check reports git `binary_missing`.
    - Preflights see installed stamp `0.7.0+claude.20261012184536.e145eec`, while the briefings name `b1933ef`.
- **PO topics added:**
  1. TP-13 verify-suite registration for the 59 suites.
  2. The P1-20 A5b source fix (security).
  3. C3-F3 / P1-23 A2 disposition, which is the same question as topic 1 of the night list.
  4. C3-F4d versus T12.
  5. Stamp and hook refresh.
  6. Critic notes persistence.
