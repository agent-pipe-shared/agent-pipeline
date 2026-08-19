# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Last updated:** 2026-08-19 (checkpoint 67)

**Project calibration:** [`project/pipeline.json`](../project/pipeline.json) — the resolved authority tier (ADR-0046/ADR-0054).

**Recovered Sentinel-epic normative documents** (retained per `backlog/items/2026-07-20-spec-retention-on-close.md`, enforced by `governance/spec-retention.json` + `check-spec-retention.mjs`; this section must keep linking all seven — do not prune it when trimming older checkpoints): [PRD](../specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md), [Spec](../specs/2026-07-19-sprint-sentinel-epic/spec.md), [acceptance matrix](../specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md), [reconciliation design](../specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md), [recovery record](../specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md), [platform-support contract](../specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md), [Windows blockers scope](../specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md).

---

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |

## CHECKPOINT — 2026-08-19 (67): shell-grammar topic CLOSED (round-2 Critic PASS, backlog item closed); handover rotated (checkpoints 1-60 archived, file was over its size cap); starting the PO's "clean cut and push" sequence (READ THIS FIRST)

**Round-2 delta Critic: PASS.** F1/F2/F3 all independently re-derived and verified by the Critic through direct source/git reading (not taken on trust from the dispatch record) — mkdir-chain narrowing sound against traversal/symlink/case-sensitivity, the new test proves both directions on a genuinely governed root, the F3 doc-comment correction corroborated against the backlog item's own accepted Proposal text and the real follow-up commit `74ba2c75`. One **minor** finding: the goldfish's own verify evidence covered only `guard-lifecycle-ready.test.mjs` (48/48), not the project's single declared verify gate — disposed directly by folding into the full verify run next, not a 3rd dispatch.

**Backlog item closed:** `2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md` (`8247ae10`) — Proposal points 1-3 done and Critic-passed; the grep-pipe-as-trailing-stage sub-scope stays split into its own open item (`2026-08-19-readonly-and-chain-grep-pipe-trailing-stage-not-implemented.md`).

**Handover rotated.** `docs/state.md` hit its hard size cap (572597 bytes vs. a 30000-byte cap) while writing this checkpoint. Checkpoints 1 through 60 (2026-08-11 through the 2026-08-19 checkpoint-60 entry) archived to `docs/state-archive/2026-08-19--checkpoints-1-through-60.md` via `handover-rotate.mjs` (ADR-0066) — content preserved verbatim, not deleted. Extraction-pass judgment applied before rotating: this repo's standing convention throughout the session has been to file durable decisions as ADRs/backlog items/guardrail changes as they happen, never to leave them uniquely in checkpoint prose, so the archived narrative carries no unique durable rule. Also fixed in passing: the prior rotation's archive-history table used a different 4-column schema than this tool's 3-column format — merging them without a fix would have produced a malformed table; normalized to one consistent 3-column shape (small mechanical fix, both rows' content preserved).

**Shell-grammar topic is now fully closed** per the PO's own criterion set in their "clean cut and push" instruction. Proceeding directly to that instruction now: fresh full `harness/scripts/verify.mjs` → `security-scan.mjs` → push-approval ceremony (signature mode) → `git push origin sprint_phoenix`. Noted in passing, not yet acted on: `.claude/worktrees/` carries a large number of stale worktree directories from past Workflow runs — worth a cleanup pass but not a push blocker.

---

## CHECKPOINT — 2026-08-19 (66): shell-grammar Critic rework (F1/F2/F3) landed and independently re-verified; commit misattributed to `329ac49c` (documented, not history-rewritten); round-2 delta Critic next

**Rework `PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1` complete, all 3 findings addressed.** F1 (blocker): `mkdir -p` admission narrowed from generic `isProjectWritePath` to exactly `scratch/`/`.claude/worktrees/` via new `CHAIN_ELIGIBLE_MKDIR_PREFIXES`/`isChainEligibleMkdirTarget` — independently grepped present in `guard-lifecycle-ready.mjs`. F2: new test proves both directions (admit narrowed target, refuse `guardrails/`) on a genuinely GOVERNED root, with a verified-stronger deviation from the literal spec — the guard refuses at the closed-grammar tokenizer layer for ANY `&&`, before `requireProjectOnboardingReadyFn` is ever reached in either direction, so "mock invocation observed" isn't achievable; the test asserts the stronger unconditional-refusal guarantee instead, with an explanatory in-test comment. F3: comment corrected from "unbriefed" to "accepted but deferred." Independently re-ran `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` myself: 48/48 pass.

**Commit-attribution defect found and NOT silently fixed.** The dispatch's own `git add`+`git commit` on its 2 files (`guard-lifecycle-ready.mjs`, `.test.mjs`) raced against this session's own commit and landed inside `329ac49c` ("docs(phoenix): close the two guard-hook registration backlog items") instead of its own commit — confirmed via `git show --stat 329ac49c`. Content is correct and at HEAD; only the commit boundary/message/trailers are wrong (missing `Dispatch: PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1 (goldfish)`, subject doesn't mention the shell-grammar fix). Attempted a clean local split (`git reset --soft ac1afc86` then three separate re-commits) since both `329ac49c` and `6114e6f8` are still unpushed (`origin/sprint_phoenix` HEAD is `8a92d377`, well behind) — the auto-mode classifier blocked the `reset --soft` itself. Decision: do not fight the classifier for a cosmetic attribution fix with zero functional impact; document it here instead and move on. Ledger/backlog-closure evidence integrity is unaffected (those commits' own SHAs are unchanged).

**Next:** dispatch the round-2 delta Critic re-review (round 2 of the ~2-round budget, F1/F2/F3 as bare labels only). If PASS or only minor findings (dispose directly, no 3rd dispatch): proceed straight to the PO's "clean cut and push" instruction — fresh full Verify, `security-scan.mjs`, push-approval ceremony, `git push origin sprint_phoenix`.

---

## CHECKPOINT — 2026-08-19 (65): hook registration DONE, both backlog items closed, GMW window closed cleanly; 3 of 4 pre-existing reds now green

**Hook registration complete.** The V2 dispatch's own edit was correct for `verify.mjs` but hit a NEW, unrelated pre-existing gap in `docs/product-capability-inventory.json` (`guard-maintenance-window-cli-tests` — registered in `verify.mjs` from earlier GMW work, never added to the inventory) that made its own DoD check unsatisfiable regardless of how correct its briefed diff was — a scoping miss in how the item was briefed, not a dispatch failure. Diagnosed directly (a small Node script diffing `discoverSurfaces()` against the declared inventory) and split into two honest commits: `14bebfe6` (the goldfish's actual briefed diff, `Commit-Act: orchestrator` since the dispatch itself truncated before its own commit step) and `81cbba4f` (the Elephant's own isolated one-entry fix for the unrelated gap). Both `verify-suite-registration-check` and `check-product-capability-inventory.test.mjs` (16/16) now genuinely pass. Both backlog items closed with real evidence (`329ac49c`).

**GMW ceremony fully landed and cleaned up.** Three portable ledger events now committed (`24acc653` request+grant, `ac1afc86` the close/revoke) — closed the window immediately once its TP-3 scope was no longer needed (the still-in-flight shell-grammar rework only touches `guard-lifecycle-ready.mjs`, not `verify.mjs`).

**Status of the 4 original pre-existing reds: 3 fixed, 1 still open.** `spec-retention-check` ✅, `security-scan`'s gitleaks finding ✅, `verify-suite-registration-check` + `product-capability-inventory-tests` ✅ (this checkpoint) — only `security-scan`'s OTHER scanners (osv-scanner/semgrep/license-check) and a fresh full-gate run remain to confirm.

**Still in flight:** `PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1` (fixing Critic round-1's blocker+2 major findings on the shell-grammar commit).

**PO instruction, this window:** once the shell-grammar topic is fully closed (rework verified, round-2 delta Critic disposed), do a clean cut here and push the current state to `origin/sprint_phoenix` — the promised final-gates sequence (fresh full Verify → `security-scan.mjs` → push-approval ceremony → push) is the literal next step after that, not a separate later ask.

---

## CHECKPOINT — 2026-08-19 (64): PO signed and installed the TP-3 maintenance window; Critic round 1 on the shell-grammar fix FAIL (1 blocker, 2 major) — rework dispatched; hook-registration retry in flight (READ THIS FIRST)

**Maintenance window ceremony completed.** The PO ran `guard-maintenance-window.mjs prepare` themselves (first attempt defaulted to the wrong plan/spec — Nova's, not Phoenix's, caught before signing and redone correctly), signed the intent digest externally via `po-human-approval.mjs sign-intent` (the generic signer this script already provides, `~/agent-pipeline-po-nova`), and `install`ed it. Window active: scope `TP-3`, bound to `2786fe64`, ~1.9h TTL from install. `PHX-WP-VERIFY-REGISTER-GUARD-HOOKS-V2` re-dispatched immediately to use it — in flight at this checkpoint.

**Critic round 1 on `b3153385` (shell-grammar widening): FAIL.** Finding 1 (**blocker**): `isChainEligibleSegment`'s `mkdir -p` branch admitted ANY in-repo path via the generic `isProjectWritePath`, not the backlog item's required narrower scratch/worktree set — proven live: a not-onboarding-ready governed session could `mkdir` anywhere in the repo (including `guardrails/`) via a two-clause `&&`-chain, bypassing the onboarding-readiness gate entirely. Finding 2 (major): the new regression test used an UNGOVERNED temp root, so it never actually exercised the bypass path Finding 1 lives in — vacuous, explaining how the bug shipped under 47/47 green. Finding 3 (major): the backlog's explicitly-accepted "grep-pipe as a trailing chain stage" requirement was not implemented, and the code's own comment mischaracterized it as "unbriefed" when it was PO-accepted scope.

**Rework dispatched** (`PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1`, goldfish-deep): narrows the `mkdir -p` admission to exactly `scratch/`/`.claude/worktrees/`, adds a governed-root regression test proving both the narrowed admit and the still-refused case, corrects the F3 comment from "unbriefed" to "accepted but deferred." F3's actual implementation (the grep-pipe trailing stage itself) is deliberately NOT bundled into this rework — split into its own tracked item (`2026-08-19-readonly-and-chain-grep-pipe-trailing-stage-not-implemented.md`, `74ba2c75`) so the blocker fix isn't held up by a separate, riskier parser extension. In flight at this checkpoint.

**Next step:** await both in-flight dispatches. Hook-registration: verify + commit, watch the window's remaining TTL. Shell-grammar rework: this is round 1 of the ~2-round Critic budget — a round-2 delta re-review is appropriate once the fix lands (not a 3rd from-scratch review); dispose any further minor findings directly per round-cap policy rather than a 3rd dispatch.

---

## CHECKPOINT — 2026-08-19 (63): `closed-shell-grammar-still-rejects-common-readonly-composition` implemented (`b3153385`), independently re-verified, Critic review in flight; PO maintenance-window gate still the binding blocker (READ THIS FIRST)

**Shell grammar widened**, dispatched (`PHX-WP-READONLY-GRAMMAR-WIDEN`, goldfish-deep) and landed as `b3153385`: `guard-lifecycle-ready.mjs` now admits (a) a small explicit `&&`-chain allowlist (`git rev-parse`/`log` restricted-flags/`status`, `echo`, `ls`, `mkdir -p` restricted to already-writable paths) and (b) a trailing `2>/dev/null`/`2>nul` redirect on an already-admitted command. Disclosed boundaries drawn, not silently assumed: `2>&1` NOT admitted (shared tokenizer limitation, out of this dispatch's file scope), a chain ending in a pipe NOT admitted, `git log --all`/format/author/path flags excluded. Independently re-verified by the Elephant: commit trailer correct, file scope matches exactly (2 files), `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` re-run directly — 47/47 pass. Loose evidence/dispatch-record files the goldfish left at repo root were tidied into `scratch/` (ADR-0063 directory contract) before Critic dispatch.

**Critic review dispatched** (guardrail-tier, mandatory per this session's own established practice for every `guard-*.mjs` change) — in flight at this checkpoint, verdict not yet known.

**PO conversation, same window:** the PO asked live where the maintenance-window signature request was — clarified that only the `prepare` step (which builds the unsigned request) had been attempted, and it was blocked by the auto-mode classifier as a sensitive action; handed the PO the exact `prepare` command to run themselves via `!` (bypasses the classifier since it becomes the PO's own action), pending their external Ed25519 key.

**Next step:** await the Critic verdict on `b3153385` (fix any findings, or accept a clean pass). The PO maintenance-window ceremony (checkpoint 60/61's exact commands) remains the sole blocker for `PHX-WP-VERIFY-REGISTER-GUARD-HOOKS` and, downstream, the promised final-gates sequence (fresh full Verify → `security-scan.mjs` → new push-approval ceremony → push).

---

## CHECKPOINT — 2026-08-19 (62): closed `gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger` (`e5b3af60`) — it had decided-but-unapplied closure text; split the real remaining gap into its own item (READ THIS FIRST)

**Found and fixed a decided-but-unapplied closure.** The item's own history (extensive, five progress notes across four dispatches, 2026-08-07 through 2026-08-19) already concluded "closing this item as partially delivered" — but the frontmatter still said `status: open`; the narrative decision was never actually applied to the record. Applied it: `status: closed`, evidence citing `b1c57d2c` (H-AC-12 amendment), `3504b707`/`bdd4517c` (GMW ledger emission), `025f9e1a` (HGO hook-side emission), `bce05e53` (HGO hook-side test coverage) — all four commits independently re-verified to exist and match their claimed content, not trusted from the item's own prose.

**Split out the one real remaining gap:** `backlog/items/2026-08-19-hgo-cli-side-granted-wiring-conflicts-with-arm-time-drift-check.md` — HGO's CLI-side `granted` ledger emission was attempted three times across this item's history and correctly reverted each time it got close: it's a genuine architectural conflict (fail-closed-arming per the design's §8.1 vs. the arm-time `HGO-DRIFT` re-derivation in `human-guard-override.mjs`), proven live via a full deny→authorize→consume round-trip test, not a scoping gap a tighter Goldfish briefing would fix. Needs a PO design decision among 3 disclosed candidate directions before any further dispatch attempts it.

**Process note for future ledger work:** hit and self-corrected a real mistake here — ran `reconcile-backlog-ledger.mjs --activate` once before fixing the closure item's `closure_commit` to a full Git OID (schema requires full lowercase SHA, not abbreviated), which baked the wrong short SHA into the hash-chained `transitions.ndjson`. Since the ledger is append-only/hash-chained by design, the fix was NOT to hand-patch the bad entry (would break the chain) — it was to `git checkout --` the still-uncommitted ledger projection files (transitions.ndjson/index.json/STATUS.md) back to their last-committed state and re-run reconciliation cleanly against the now-correct item file. This only works because the bad entries had never been committed; had they landed, this would need `check-backlog-state.mjs`'s dedicated evidence-amendment machinery instead (`planBacklogEvidenceAmendment`), which is a much heavier, JSON-Result-bound mechanism — reason to `check-backlog-state.mjs` BEFORE committing ledger changes, always.

**Next step:** the maintenance-window PO gate from checkpoint 60/61 is still the binding blocker for the final-gates sequence. While waiting, more Phoenix-scope backlog can be worked — `backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md` was next in the previously-stated order.

---

## CHECKPOINT — 2026-08-19 (61): gitleaks false positive fixed directly (`c3bf83b7`); 2 of 4 pre-existing reds now green, 2 still blocked on the PO's maintenance-window signature (READ THIS FIRST)

**`security-scan`'s gitleaks finding fixed** (`c3bf83b7`) — dispatched Goldfish `PHX-WP-GITLEAKS-ATTRIBUTION-KEY-FP` correctly stopped (per its stop conditions) rather than guess: the backlog item's own markdown had quoted the flagged line verbatim, creating a second live gitleaks finding at its own path, which the briefing hadn't scoped for. Disposed directly (small, mechanical, well under the EL-16 threshold): added the `content-v1` suppression entry for the real source finding, computed via the adapter's own `gitleaksContentAuthorityLine()` export (not hand-typed); reworded the backlog item's quote to avoid the `KEY...="..."` shape gitleaks matches on, rather than adding a second suppression entry the repo would keep needing to regenerate on every future rewording. Verified via the adapter's own `run()` against an isolated copy of just the three affected files: PASS, 0 findings.

**Status of the 4 pre-existing reds now: 2 fixed, 2 blocked.** `spec-retention-check` ✅ (checkpoint 60), `security-scan`'s gitleaks finding ✅ (this checkpoint). `verify-suite-registration-check` and `product-capability-inventory-tests` ❌ — both need the same `verify.mjs` edit, which is gated by `guard-testpath` TP-3 behind an expired maintenance window (checkpoint 60's finding still stands: needs a fresh PO signature ceremony).

**Next step:** get the PO's maintenance-window signature for the hook-registration fix (checkpoint 60 has the exact `prepare`/`install` commands); re-dispatch `PHX-WP-VERIFY-REGISTER-GUARD-HOOKS` once unblocked (the target edit is already fully scoped — `verify.mjs:352-353`, plus the `docs/product-capability-inventory.json` sibling-shape entries). Once all 4 are green, run the final-gates sequence — fresh full Verify → `security-scan.mjs` → new push-approval ceremony → push.

---

