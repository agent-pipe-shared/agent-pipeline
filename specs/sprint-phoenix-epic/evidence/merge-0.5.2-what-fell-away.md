# Merge report: sprint_phoenix ← origin/main (0.5.2 release)

**Date:** 2026-08-07
**Local commit:** `75b8361` (merge, two parents: `998a609` sprint_phoenix + `6e2c9b2` origin/main)
**Status:** local only, NOT pushed. Fully reversible (`git reset --hard 998a609` on `sprint_phoenix` before any push).
**Trigger:** PO instruction to merge sprint_phoenix onto the real 0.5.2 candidate, now landed on `origin/main` (correcting an earlier reference to `feat/sprint-nova-codex-v046`, which is itself an ancestor of the current `origin/main`).

This is the report the PO's own merge procedure calls for before any redesign/reintegration step. Nothing below is a completion claim — it is an inventory of what changed, what was dropped, and what still needs a human decision.

---

## 1. Branch-target verification (before touching anything)

The PO's message warned that a prior planning pass referenced `feat/sprint-nova-codex-v046` and that `origin/main` — freshly updated the same day — was now the real target. This was independently verified, not taken on trust:

- `git fetch origin` moved `origin/main` from `5d2b83d` to `6e2c9b2` (dated 2026-08-07 07:27, i.e. same-day).
- `git merge-base --is-ancestor 5ba7ee0 origin/main` — **true**. `5ba7ee0` (the old Nova reference commit) is an ancestor of the new `origin/main`.
- `origin/main` is Nova + 12 further commits (33-file diff between them, +1332/-158).
- `git merge-base sprint_phoenix origin/main` = `9d1b3dc`, identical to Phoenix's own recorded branch origin — same merge-base either way, so nothing about the conflict surface changes; only the endpoint moved further along the same line.

**Conclusion: `origin/main` was the correct target, confirmed independently, not assumed.**

## 2. Merge scope

- Merge-base: `9d1b3dc108eb77629ace5b82002120f5539abd8d`
- Phoenix side (`998a609`): ~300 commits since base, 186 files, +20,464/-943
- origin/main side (`6e2c9b2`): ~632 commits since base, 927 files, +131,765/-7,819
- `git merge-tree` (read-only, before touching anything) predicted **39** conflicting files — one more than the PO's own pre-analysis (34–39, with only 3 named add/add cases). The 4th add/add case, `project/pipeline-state.json`, was found here and is covered in §5.
- 936 files changed in the final merge commit (897 clean auto-merges + 39 manually resolved).

## 3. Resolution policy actually applied

Per PO direction: where both sides evolved the *same* guardrail/authority/harness mechanism differently since the base, **origin/main wins outright**, and what Phoenix loses gets written down rather than silently dropped. Three files needed a different policy because they aren't competing implementations of one function:

| File(s) | Policy used | Why |
|---|---|---|
| 28 code files (guards, authority libs, harness/verify, preflight, freshness, etc.) | origin/main verbatim | Same function, independently re-implemented on both sides — see §4 |
| `CLAUDE.md`, `.claude/pipeline.yaml`, `project/pipeline.yaml` (Push Policy paragraphs) | origin/main verbatim | Same function (push governance description), different implementation — see §4.1 |
| `docs/state.md` | **lossless splice, not resolved** | Diverged past recognition (~3900 of ~3970 lines one conflict hunk); PO explicitly asked for reconciliation, not overwrite — see §6 |
| `.gitleaksignore`, `governance/observation-doc-governance.json`, `docs/product-capability-inventory.json` | union (both sides' additions kept) | Legitimate, non-competing additive inventories, not competing designs — see §7 |
| `governance/artifact-topology.json` | origin/main exact (required) | `check-artifact-topology.mjs` (now origin/main's own code) validates the `classes` array by strict equality — no other choice was possible and still pass Verify — see §8 |
| `project/pipeline.json`, `project/pipeline.yaml`, `project/guard-config.json` | origin/main verbatim | True add/add (no common ancestor) but near-identical tuning variants, not divergent designs — see §9 |
| `project/pipeline-state.json` | origin/main verbatim, **flagged as the most important open item** | True add/add, and genuinely divergent live runtime/session history — see §9.4 |

## 4. Code conflicts (28 files) — full accounting

Dispatched to a Goldfish-deep agent (guardrail/authority-class work with real per-file judgment, matching MP-27). Full per-file report: [`merge-0.5.2-what-fell-away-code-conflicts.md`](merge-0.5.2-what-fell-away-code-conflicts.md).

**Verified DoD:** all 28 files byte-identical to `origin/main`'s blob (checked via sha256, not assumed); nothing outside the 28 files + the report touched.

**The eleven entries flagged "genuinely absent" or with an explicit risk note — the ones that matter most for the redesign round:**

1. **`harness/lib/plan-spec-state-v2.mjs`** — ledger-first v3 plan approval (`bindPlanSpecApprovalWithHumanDecision`) bound to an independently-resolved human-decision reference; no equivalent on main.
2. **`harness/scripts/pipeline-state.mjs`** — the entire Recovery Bridge / feature-package / continuity-authority-revision / human-decision-consumption governance-ledger subsystem (~1,400 lines); zero matches on main.
3. **`harness/scripts/verify.mjs`** — ~30 Phoenix governance-product test suites deregistered from the verify gate (the `.test.mjs` files remain on disk, but `verify` no longer runs them — see §10 for what this means for Verify itself).
4. **`plugins/pipeline-core/hooks/guard-devplan.mjs`** — `hasLedgerBackedPlanApproval` (an external single-use governance-authority readback required before honoring `planApproved`) has no equivalent; main trusts local content-hash verification only.
5. **`plugins/pipeline-core/hooks/guard-git.mjs`** — Phoenix-governed override consumption via `governance-authority.mjs` (scope-bound to the exact guard file's own sha256) replaced by main's plain local-file ledger.
6. **`plugins/pipeline-core/hooks/guard-push.mjs`** — `checkLedgerPushAuthority`, **the actual enforcement mechanism for the "PHX-2 Human Governance Decision Ledger" CLAUDE.md's own Hard Rules describe as the sole future remote-action exception path, does not exist on main.** Main authorizes pushes via mutable `pushApproval`/`standing-approved` state plus the signature/chat approval-mode gate (ADR-0056) instead. This is the single most consequential loss in the whole merge — see §4.1.
7. **`plugins/pipeline-core/lib/codex-host-plugin-list.mjs`** — self-application/public-marketplace-origin allowlist integrity check (`observeCodexRulesetSource`), absent on main.
8. **`plugins/pipeline-core/lib/project-authority.mjs`** — the dual-state (legacy/neutral) synchronization + recovery subsystem; no repair tool exists on main for the ambiguity the paired `po-gate-authority.mjs` "narrowed" finding depends on.
9. **`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`** — the bootstrap-preflight wiring for #7's integrity check; absent on main.
10. **`plugins/pipeline-core/scripts/ruleset-freshness.mjs`** — the WSL host-authorized freshness/self-application-comparison subsystem against the public marketplace remote; main took this file in an unrelated direction (`PIPELINE_UPDATE_AVAILABILITY_SCHEMA`).
11. **`plugins/pipeline-core/skills/pipeline-start/SKILL.md`** — the agent-facing documentation of the PHX-2 fail-closed remote-authority contract, paired with #6.

Two further entries were assessed **"narrowed"** rather than "genuinely absent": `plugins/pipeline-core/lib/po-gate-authority.mjs` and its test — main covers the core manifest-path-resolution case via its own `resolveProjectAuthorityPaths`, but silently falls back on ambiguous/mixed project authority instead of Phoenix's explicit fail-closed `PO-GATE-STATE-AUTHORITY-UNAVAILABLE` code.

The remaining 15 of the 28 were assessed **"none"** or **"superseded"** — main's version does the same job, differently or more completely, with nothing of substance lost. Full detail in the linked sub-report.

### 4.1 The Push Policy conflict, specifically

`CLAUDE.md`, `.claude/pipeline.yaml`, and `project/pipeline.yaml` all had the identical shape of conflict: Phoenix's paragraph describes the **PHX-2 Human Governance Decision Ledger + Authority Resolver** as the sole possible remote-action exception, explicitly noting it does not yet exist ("Until that PHX-2 Ledger/Resolver path exists..."). Main's paragraph (dated 2026-08-06, cited as a PO decision, "supersedes the standing approval [ADR-0017]") describes a simpler, already-implemented mechanism: `gates.push_approval` in `pipeline.user.yaml`, either `signature` (detached Ed25519 proof, private key outside the repo) or `chat` (in-session, commit-bound, attribution not proof).

All three were resolved to main per the same-function policy. Combined with finding #6 above (`checkLedgerPushAuthority` genuinely absent from `guard-push.mjs` on main), **this means the merged tree's push gate is main's signature/chat mechanism, not Phoenix's PHX-2 Ledger design** — and PHX-2 was never built on either side, so nothing regresses in practice, but every reference to "PHX-2" elsewhere in this repo's docs (including this very report's own commit message) now describes a mechanism the merged codebase does not implement. This is worth an explicit PO decision: adopt main's simpler push-approval model as-is, or carry the PHX-2 design forward as new work against the merged base.

## 5. `project/pipeline-state.json` is a fourth add/add file, not in the PO's original list

The PO's pre-merge analysis named three add/add authority files (`project/pipeline.json`, `project/pipeline.yaml`, `project/guard-config.json`). `git merge-tree` found a fourth: `project/pipeline-state.json`. Unlike the other three (see §9), this one is genuinely divergent live state, not a near-identical tuning variant — see §9.4.

## 6. `docs/state.md` — unresolved by design

`docs/state.md` diverged so far past its common ancestor that git's line-based 3-way merge produced **one conflict hunk covering nearly the entire file** (lines 8–3878 of 3970). Phoenix's side is ~871 lines of Phoenix-specific session history; main's side is ~3000 lines of the general Pipeline/Nova/Cyborg development history, with an entirely different structural convention (main appends new entries at the top level; Phoenix nests everything under one "Operational head" section).

Per the PO's own instruction ("Prosa/Historie, kein Funktionscode; blindes 'theirs' würde Phoenix' gesamte Session-Historie verwerfen. Braucht Zusammenführung, nicht Überschreiben"), this was **not** resolved by picking a side. Both full histories are preserved verbatim in the file today, under two clearly labeled headers ("Phoenix branch history" / "Pipeline general/Nova-Cyborg-release history"), with an explicit notice at the top stating this is a mechanical splice, not an edited reconciliation, and that the two "Project status" blurbs still disagree (`PAUSED — resumes with the rebase onto 0.5.2` vs `ACTIVE — 0.5.2 patch-candidate recovery`).

**This is the one file in the whole merge that still needs a real editorial pass before it can serve as a single coherent handover again.** Nothing was lost — everything from both sides is in the file — but nothing is reconciled either.

## 7. Union-merged inventories

### 7.1 `.gitleaksignore`

Both sides' new suppression entries were kept (Phoenix's Nova-A1/backlog fixtures in the legacy `commit:path:rule:line` format, main's newer entries in the `content-v1:sha256:...` format). One finding worth flagging: **main's rewritten `gitleaks.mjs` adapter (now installed wholesale per §4) parses the legacy format without error but no longer treats it as an active suppression** — `parseContentAuthorityLine` returns `kind: "legacy"`, and the loader's `if (parsed.kind !== "content") continue;` skips it before it reaches the active entries set. Phoenix's ~30 legacy-format entries are therefore inert historical record, not live suppressions, going forward. **Empirically checked, not just theorized:** a direct run of `node harness/scripts/security-scan.mjs` against the merged tree returned gitleaks **0 findings**, so nothing currently in the tree is affected in practice — but any future gitleaks finding on one of those historically-exempted files/lines will no longer be auto-suppressed, and would need a fresh `content-v1` fingerprint (which requires re-running gitleaks against the exact historical commit to recover the finding's secret span — not a 5-minute fix).

### 7.2 `governance/observation-doc-governance.json`

Both sides' new documentation-path entries were merged and re-sorted (the checker enforces `OG-DOC-ORDER`/`OG-DOC-DUPLICATE` — verified directly with `check-observation-governance.mjs`, which now passes: "132 document(s) classified"). One naming collision surfaced and was left as-is for the redesign round: Phoenix's `docs/adr/0047-governance-event-kernel.md` collides in number with **two** of main's own ADRs, `0047-local-supervisor-state-authority.md` and `0047-model-free-advisor-preflight-v2.md` (main already had an internal 0047 duplication before this merge). All three files are kept; none renumbered. Whoever picks this up next should renumber Phoenix's ADR to the next free slot (main runs through 0057).

### 7.3 `docs/product-capability-inventory.json`

The largest of the union files (~3500 lines, 5 conflict blocks). After merging, `node harness/scripts/check-product-capability-inventory.mjs` reported **34 stale surfaces** — `verify-phase` entries (mostly `phoenix-*-tests`, plus `codex-host-plugin-list-tests`) whose referenced test suite no longer exists in the now-origin/main `verify.mjs` (this checker dynamically parses `verify.mjs`'s live `TEST_SUITES` array, so it caught this precisely rather than needing manual cross-checking). All 34 were removed from `capabilities[2].surfaceIds` (the `deterministic-verification` capability). The checker now reports **PASS**. This is the same underlying loss as code-conflict finding #3 in §4 (Phoenix test suites deregistered from `verify.mjs`) surfacing a second time, in the inventory metadata that describes what Verify covers.

## 8. `governance/artifact-topology.json`

`check-artifact-topology.mjs` (now origin/main's code, per §4) validates the `classes` array by **strict equality** against a hardcoded list — there was no room for a union here without failing Verify outright. Phoenix's added `"governance-event"` class and its accompanying `lifecycleAuthority` block (5 keys describing the governance-event registry layout) were dropped. Checked before dropping, not assumed harmless: `grep -rn '"governance-event"'` across the whole repository (excluding this file itself) returns **zero** matches — no package anywhere actually uses this class, and no code references the `lifecycleAuthority` key. Confirmed safe to drop; `check-artifact-topology.mjs` now reports `status: "valid"`.

## 9. The four add/add authority files (`project/pipeline.*`, `project/guard-config.json`)

These have **no common ancestor** — both branches independently created the "neutral project authority" layout after the merge-base, with different content. This is the PO's own flagged "core finding for the redesign round." Three of the four turned out to be near-identical tuning variants rather than genuinely competing designs; the fourth is a real conflict.

### 9.1 `project/pipeline.json`
Differences: `wipLimit` 1 (Phoenix) → 3 (main); `ritualExtensions.close.pre` gains `check-close-security-completeness.mjs` on main; `humanRoles.po.displayLabel` "PO" (Phoenix) → "Human" (main); main adds `pipelineUpdateChannel: "alpha"` (matches the self-repository alpha-channel convention documented in the bootstrap skill's freshness reference). Resolved to main.

### 9.2 `project/guard-config.json`
Strict superset: main keeps Phoenix's TP-1 through TP-5 (TP-5's pattern extended to also match `guard-push-v2`) and adds five new protected-test entries (TP-6 through TP-10, covering `guard-gate-strength`, `guard-testpath-override`, `entrypoint`, `critical-human-proof-policy`, `notebook-write-coverage`). Nothing Phoenix-specific is lost. Resolved to main.

### 9.3 `project/pipeline.yaml`
Same Push Policy paragraph conflict as §4.1, plus `session.keep_awake: false` (Phoenix) → `true` (main), plus the exact same `goldfish_mechanic`/`goldfish_deep` model-routing tuning (`haiku`/`medium`, `medium`) that was already found in a stash from the PO's own prep session earlier in this run — main's file independently carries the identical values, which is a reasonable cross-check that that tuning choice is sound. Resolved to main.

### 9.4 `project/pipeline-state.json` — genuinely divergent, not a tuning variant, most important open item

This file is **live runtime/session state**, not source. Both sides' committed copies reflect real, different session histories:

- **Phoenix's committed version** (43 lines): `planApproved: false`, `closedFeatures` lists only `codex-onboarding-0.4.5` and a closed `sprint-phoenix-epic` entry from 2026-08-01 — stale relative to everything docs/state.md's Phoenix history describes (continuity revision 3, `planApproved: true`, PRD `303586c8…`/Spec `f7e32bb7…` bound, `activeFeature: sprint-phoenix-epic`). That richer state was never committed by Phoenix — it lived only in the local working tree, and was captured in a git stash by the PO's own prep session before this run started (found as `stash@{1}` — later reconfirmed present as `stash@{2}` after this session's own bootstrap-migration stash was added on top).
- **Main's committed version** (197 lines, resolved into the merge): `planApproved: true`, `activeFeature: sprint-nova-epic`, continuity revision 24, a real `pushApproval` record (public key + signature, no private key material) for a push to `refs/heads/feat/sprint-nova-codex-v046` on 2026-08-06. This is Nova's own live state, not Phoenix's.

**Resolved to main**, consistent with the rest of the merge (main is the ongoing single line of development this branch is integrating into) — but this is the one resolution in the whole merge where "same policy as everywhere else" produces a result that actively contradicts what this very session has been treating as ground truth (Phoenix's approved plan). **Phoenix's own live continuity/plan-approval state is not lost — it survives in the git stash and in the `docs/state.md` splice (§6) — but it is not the state the machine-readable authority now points to.** Re-establishing Phoenix's plan approval against the new `project/pipeline.json`/`project/pipeline-state.json` structure (a fresh `submit-plan`/`approve-plan` cycle, or an explicit continuity-authority transition) is required before any bootstrap check would again treat Phoenix as the active, approved feature. This is not done here — it is exactly the kind of PO-gated decision the redesign round exists for.

## 10. Verify

**The full aggregate `node harness/scripts/verify.mjs` could not be run to completion**, for a reason unrelated to the merge resolution itself: main's `verify.mjs` now goes through a new orchestration layer (`verify-journal.mjs`, matching the new `ADR-0050`/`worktree-lifecycle-tests`/`runner-native-continuation-tests` surfaces found in the product-capability-inventory work in §7.3) that requires a **bound onboarding session-cleanup registration** (`continuity.runtime.sessionCleanup` must be non-null) before it will register a verify run at all — even in a detached worktree. Neither branch's `project/pipeline-state.json` currently has this binding (`sessionCleanup: null` on both sides, confirmed by inspection), and establishing one is tied to runner/session-lifecycle infrastructure this session does not have standing access to from a plain CLI invocation. This is a pre-existing gap in adopting main's new verify orchestration, not a defect introduced by this merge's conflict resolution — but it does mean **no aggregate Verify evidence exists for this candidate**, and none is claimed.

**What was run instead, directly, bypassing the new orchestrator, to still get real correctness signal:**

- **Security scan** (`node harness/scripts/security-scan.mjs`, standalone): **CLEAN**. gitleaks 0 findings, semgrep 0 findings, license-check 0 findings, osv-scanner skipped (no package sources). Exit 0.
- **`check-observation-governance.mjs`**: valid, 132 documents classified. Exit 0.
- **`check-artifact-topology.mjs`**: `status: "valid"`, no findings. Exit 0.
- **`check-product-capability-inventory.mjs`**: PASS. Exit 0.
- **`validate-manifest.mjs`**: valid, 4 phases, 3 gates, active profile `full-sdlc`. Exit 0.
- **All 341 `.test.mjs` files in the merged tree, run individually** (`node <file>.test.mjs`, each file's own lightweight test runner, not `node:test`): full results below.

**Result: 329/341 passed, 12 failed.** Each failure was individually triaged — for the 7 that aren't self-evidently Phoenix-orphaned tests, a second run against a *clean, unmerged `origin/main`-only worktree* was done to separate "pre-existing on main, unrelated to this merge" from "actually caused by this merge." That distinction turned out to matter a lot: 3 of the 12 looked like regressions at first and are not.

**A) Expected — orphaned Phoenix-only tests for functionality resolved away in §4 (4 files, all already accounted for above):**

| Test file | Failure | Matches finding |
|---|---|---|
| `harness/lib/plan-spec-state-v2.test.mjs` | `SyntaxError`: `bindPlanSpecApprovalWithHumanDecision` no longer exported | §4 #1 |
| `harness/scripts/recovery-bridge-approval.test.mjs` | `SyntaxError`: `RECOVERY_BRIDGE_DECISION_SCHEMA` no longer exported from `pipeline-state.mjs` | §4 #2 |
| `plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs` | Assertion failure on Phoenix's checkpoint-bound override-consumption count (1 vs 2 expected) | §4 #5 |
| `plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` | `SyntaxError`: `observeCodexRulesetSource` no longer exported | §4 #7 |

These are dead code on disk (the `.mjs` under test is gone/changed, the `.test.mjs` wasn't touched by the merge because it isn't one of the 28 conflicted files). Not new information, but now confirmed as *actual* failures rather than a theoretical read of the diff.

**B) New, concrete confirmation of the §7.1 gitleaksignore finding (1 file):**

`harness/scripts/security-scan.test.mjs` — 126/128 passed. The 2 failures are exactly the predicted consequence of the legacy-format `.gitleaksignore` entries no longer being functionally honored: `"gitleaks ignore: Nova A1 no longer carries commit-bound legacy fingerprints"` and `"gitleaks run: candidate-tree scan keeps repository-relative fingerprints"`. This was flagged as a risk in §7.1 before running any test; it is now a *demonstrated* test failure, not just a theoretical read of the adapter code. (The live security-scan run itself in §10 still comes back CLEAN — 0 actual gitleaks findings today — because none of the currently-tracked files happen to trip a rule; this test failure is about the *mechanism* no longer working, which will bite the day it's needed.)

**C) Pre-existing on `origin/main` alone — unrelated to this merge, confirmed by direct comparison (3 files):**

Re-run individually against a scratch worktree of `origin/main` with no Phoenix content at all:

| Test file | Exit on merged tree | Exit on `origin/main` alone |
|---|---|---|
| `plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs` (WAVR19) | 1 | **1** |
| `plugins/pipeline-core/scripts/afk-activation.test.mjs` | 1 | **1** |
| `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` | 1 | **1** |

These are main's own pre-existing issues (environment-sensitive or genuinely broken on main already) that this merge neither caused nor fixed. Not this repository's problem to solve as part of the merge.

**D) False-alarm "regressions" — a test-environment artifact of running tests with `HEAD` pointed at a 2-parent merge commit, not a real defect (3 files):**

`codex-critic-isolation.test.mjs`, `codex-critic-probe-split.test.mjs`, and `codex-isolation-control-decomposition.test.mjs` all failed with `Error: candidate must have exactly one bound parent`, thrown by `buildExactFixture()` in `codex-critic-isolation.mjs`. Traced the source: these tests call `git rev-parse HEAD` against *this actual repository* (not a throwaway fixture — `root` resolves to the real repo root via `import.meta.url`) and feed that into `buildExactFixture`, which deliberately fail-closes if the resolved commit has more than one parent (`git rev-list --parents -n 1 <commit>`). My merge commit `75b8361` has exactly two parents by definition — so any test that builds a Critic-isolation fixture from "whatever `HEAD` currently is" will hit this **by design**, not by defect. Confirmed pre-existing-clean-on-main-alone doesn't even apply here in the usual sense — on a plain `origin/main` worktree (single-parent HEAD) these three pass cleanly (exit 0), which is consistent with the mechanism working correctly, not with the merge having broken anything. This constraint stops applying as soon as Verify/Critic run against an ordinary single-parent commit built on top of this merge, rather than against the bare merge commit itself.

**E) Genuine new finding, distinct from everything in §4–§9 (1 file):**

`plugins/pipeline-core/scripts/reconcile-backlog-ledger.test.mjs` — 10/11 passed. The failure is in `RBL01 "this repository needs no reconciliation"`, which asserts that *this actual repository's* backlog ledger has zero drift. It found 4: `pipeline.readonly-command-guard-classification`, `pipeline.authority-signing-terminal-contract`, `pipeline.human-legible-approval-record`, `pipeline.signed-authority-binding-durability` — all four are Phoenix's own late-session (2026-08-06) backlog items (`backlog/items/2026-08-06-*.md`, referenced throughout `docs/state.md`'s Phoenix history). Confirmed this does **not** occur on a clean `origin/main`-only worktree (exit 0 there) — so this is a genuine, merge-induced finding: Phoenix's backlog items were never run through whatever closure/reconciliation step main's own `reconcile-backlog-ledger.mjs` expects, and the merge is what first brings the checker and the drifted items into the same tree. The tool to fix this (`reconcile-backlog-ledger.mjs` itself) already exists and is designed exactly for this; running it was left out of scope here since it writes to the backlog ledger and this report's job was to inventory, not to keep fixing forward.

**Net:** of 12 failures, 4 are expected/already-documented, 1 confirms an already-flagged risk with a live test, 3 are main's own pre-existing issues, 3 are a test-harness false alarm from testing against a merge-commit `HEAD` (not a real defect), and 1 is a genuine new, narrow, independently-fixable finding (§11 item 8).

## 11. What's still open (in priority order)

1. **`project/pipeline-state.json` reconciliation (§9.4)** — Phoenix's plan approval/continuity is not currently the live authority. Needs an explicit PO decision and a fresh approval cycle.
2. **PHX-2 Push Policy decision (§4.1)** — adopt main's signature/chat model as-is, or carry PHX-2's Ledger/Authority-Resolver design forward as new work.
3. **`docs/state.md` editorial reconciliation (§6)** — the splice is lossless but not readable as one document yet.
4. **The 11 flagged code-conflict losses (§4)**, especially the governance-ledger ecosystem (`pipeline-state.mjs`, `guard-devplan.mjs`'s ledger-backed approval, `project-authority.mjs`'s dual-state repair) — decide what, if anything, gets redesigned and reintegrated against the new base.
5. **ADR-0047 renumbering (§7.2)** — cosmetic but should be fixed before it causes real confusion.
6. **`.gitleaksignore` legacy-format entries (§7.1)** — inert, not urgent (0 live findings today), but flagged so a future finding on one of those paths isn't a surprise.
7. **No aggregate Verify evidence (§10)** — either stand up the new session-cleanup-binding infrastructure, or accept the direct-checker + full-test-sweep evidence gathered here as the substitute for this candidate.
8. **Backlog ledger drift (§10D)** — 4 of Phoenix's own 2026-08-06 backlog items (`readonly-command-guard-classification`, `authority-signing-terminal-contract`, `human-legible-approval-record`, `signed-authority-binding-durability`) are unreconciled against main's `reconcile-backlog-ledger.mjs`. Narrow, independently fixable — the tool to do it already exists and wasn't run here to keep this report to inventory-only.

Nothing was committed to `origin` in the course of producing this report. The merge commit (`75b8361`) is local-only.
