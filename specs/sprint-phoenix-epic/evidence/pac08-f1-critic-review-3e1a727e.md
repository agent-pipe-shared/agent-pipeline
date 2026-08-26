# Critic review — P-AC-08 / F1 fix verification (single commit `3e1a727e`)

Bootstrap check passed: ruleset ce50d74d16fdbcd0b9f8b3b606297e88af3d2f139b3cd14b692f4ea15599b023 loaded · Project agent-pipeline-shared_phoenix · Calibration sprint-phoenix-epic · State n/a (Critic sees no history) · Role Critic

**Route header.** Requested route (from dispatch): `claude-opus-5 at max`. Effective model identity: **unknown** — no direct same-dispatch route evidence was observable; the host label in the environment block is a selector/label and is explicitly not admissible as identity evidence. Effort `max`: unverifiable from inside the dispatch. T1 assurance: `functional-equivalent-read-only; OS isolation not asserted` — write capability exists in this host and is a disclosed residual limitation, not an isolation claim; no write tool, no mutating command, no delegation. Stage/model matrix: the requested route matches the criticality class (guardrail/security-critical concurrency-control code), so there is no wrong-stage finding to record.

**Advisor deviation (disclosed).** The Critic's harness prompt instructs an Advisor consultation. Deliberately not done: the dispatch forbids it citing MP-26, verified against the primary source — `policies/model-policy.md:234-235` MP-26(e) ("Goldfish/Critic remain on their explicitly dispatched tier model; an Advisor never changes their model or supplies an implementation decision") and MP-26(b), which requires a bound `pipeline.advisory-demand.v2` before any model effect, an artifact a Critic cannot produce. Consulting would itself have been a governance violation requiring self-report.

---

## 1. Findings

### Finding 1 — lock-path identity is compared lexically, so a symlink-spelled `--root` still self-collides

- **Gap:** The new reuse predicate decides lock identity with `resolve()`, which normalizes lexically and does **not** resolve symlinks. When the mandated self-governing topology is reached through a symlinked `--root` (`root = resolve(parsed.value.root)` at `pipeline-state.mjs:5749` keeps the symlink spelling, while `dir = projectDir()` resolves to `process.cwd()`, which Linux returns already symlink-resolved), the two lock paths compare unequal, reuse is declined, and the approval's `writeState` falls back to acquiring a second lock — on the *same inode* — which fails exactly as before.
- **Risk:** The original F1 failure mode survives for that path spelling: a legitimate self-governing reconcile is refused with `PS-CONTINUITY-LOCKED` and a "writer lock unavailable" message that names no real contender. Fail-closed (no corruption, no partial write, no data loss), so this is an availability and operator-diagnosability gap, not a safety gap. Severity: **minor**.
- **Evidence:** `plugins/pipeline-core/scripts/pipeline-state.mjs:6020-6021`

  ```js
  const reuseLock = holderLock?.ok === true && holderRoot !== undefined
    && resolve(continuityLockPath(dir)) === resolve(continuityLockPath(holderRoot))
  ```

  The adjacent comment at `:6016-6017` claims the comparison covers "a relative vs. absolute spelling of the same directory" — true — but the surrounding phrasing "only when the resolved lock paths genuinely match" invites a stronger reading than `resolve()` delivers. The same module already uses the correct primitive for path-identity checks: `safeRequestFile` at `:926-927` uses `realpathSync(candidate)` / `realpathSync(dir)` for precisely this class of comparison.
- **Spec-ref:** P-AC-08 (`specs/sprint-phoenix-epic/acceptance.md:346-373`) — the reconcile transaction must be completable in the mandated self-governance topology ("this repository reconciling its own manifest from within its own governing session"); this is the residual tail of prior finding F1 (`PAC08-F1-findings-registry.md:6-12`).

No blocker and no major finding survived Phase B.

---

## 2. Deliberately not flagged (examined, found in order — including dropped candidates)

1. **Spec fidelity (P-AC-08) — cleared.** All three registry findings are genuinely closed, verified from code rather than from prose: F1 by the `reuseLock` handoff (`:5804-5805`, `:6020-6024`, `:614-615`, `:666`); F2 by the new RGs block, which omits `deps.dir` entirely and points `CLAUDE_PROJECT_DIR` at `fx.dir` — exactly the coverage the registry said was missing; F3 by the message branch at `:5812-5814`. The `transactional writer / readback` chain is intact: `atomicWriteContinuityState` still asserts ownership twice (`:887`, `:892`) and the reconcile still performs its manifest readback and revalidation (`:5847-5854`).
2. **Scope — cleared.** Only two files touched. The spec names `harness/scripts/pipeline-state.mjs`; confirmed that path is a five-line re-export shim over the plugin file (`harness/scripts/pipeline-state.mjs:5,10`), so editing `plugins/pipeline-core/scripts/pipeline-state.mjs` *is* editing the inventoried writer. No scope deviation. Dropped as a candidate once the shim was read.
3. **Concurrency correctness (primary hunt surface) — cleared** against eight explicit obligations: (a) no new writer is admitted — the handoff is a direct call inside the holder's own stack (`:5773` → `:5798` → `:6024`); (b) equal lock paths imply equal state paths, since `continuityLockPath(x)` is `statePath(x) + ".lock"` (`:683-685`), so the reused lock genuinely guards the write target; (c) the lock is released exactly once — `writeState`'s `finally` skips release when reused (`:666`), the holder releases at `:5871`; (d) a stale-lock steal by a same-token contender is still caught by `assertContinuityLockOwned` against the on-disk record and fails closed with `PS-CONTINUITY-LOCK-OWNERSHIP`; (e) foreign contenders are structurally unaffected — PS44Vc uses a distinct token through `acquireContinuityLock` (`pipeline-state.test.mjs:2219-2224`) and passes in green (`green.tap:344`); (f) enumerated all 16 `writeState` call sites — none of the other 15 passes `reuseLock`, so their behavior is byte-identical; (g) the extra `holderLock`/`holderRoot` properties are invisible to destructuring test doubles; (h) `writeState(dir, next, state, {})` in the non-self-governing topology is equivalent to the previous no-options call.
4. **Two candidates dropped on analysis.** (i) *Tmp-file collision:* `atomicWriteContinuityState` keys its tmp on `lock.ownerNonce` (`:878`) and `writeRebindFile` is handed the same nonce (`:5841`) — but the targets are the state file and the manifest, so the tmp names differ; also strictly ordered. (ii) *Stale-authority read:* `resultAuthority` is read before the approval (`:5776-5777`) and reused after it (`:5824`); confirmed the approval's `next` object (`:6006-6014`) spreads state and touches only `featurePackageReconcileApproval`, `criticalProofConsumption` and `updatedAt` — it never writes `continuity`, so the authority bytes it depends on cannot drift. This also confirms P-AC-08's "no lifecycle-state, artifact-set, candidate, or other authority-byte change" is respected.
5. **A third candidate disclosed rather than flagged.** The reuse predicate recomputes `continuityLockPath(holderRoot)` instead of using the authoritative `holderLock.path` returned by `acquireContinuityLock` (`:811`, `:847`). Since `statePath()` is existence-dependent (`:555-562`), a recomputation can in principle diverge from the path actually locked. Dropped because the same acquire-time/write-time recomputation window already existed inside `writeState`/`atomicWriteContinuityState` before this commit, so it is a pre-existing module property, not something this diff introduces. Worth a follow-up; not a finding against this diff.
6. **Test integrity — cleared, and the one modified test verified as a strengthening.** Only RGq's assertion was changed. It moved from `/FTP-RECONCILE-APPROVAL-REJECTED/` to asserting the specific replay message **plus** a new negative assertion that the generic text is absent — strictly stronger, no coverage lost, no threshold lowered. No `skip`, no `.only`, no `|| true`; green.tap reports `# skipped 0` / `# todo 0`. Considered QG-04 (implementor must not modify pre-existing tests) and dropped it: the modified assertion was pinning a message a prior Critic had ruled false, the F3 fix was explicitly in this delta's registry scope, and the change is a strengthening — flagging it would be manufacturing a finding.
7. **Guardrails/constraints — cleared.** No `TODO`/`FIXME`/`HACK` introduced, so QG-06 ("documented instead of fixed") is not triggered — this is a real fix with a real red test, which is also what QG-07 demands. No push/approval surface touched, so ADR-0056 is not engaged.
8. **Security surface — cleared.** No secrets, no credential-shaped strings, no injection surface, no authz change. The lock handle (token + `ownerNonce`) now crosses the `deps.featurePackageReconcileApproval` seam, but it is never logged, never serialized and never leaves the process; SEC-01/SEC-03 are unaffected.
9. **Dependency reality check (SEC-04) — not applicable, verified.** The diff adds **zero** new imports, packages, actions or images. `resolve` (`node:path`, `:281`) and `continuityLockPath` (`:683`) both pre-exist in the module. No registry evidence to supply because there is no new dependency.
10. **Machine-specific absolute paths — cleared.** `red.tap:830` contains an absolute developer path, but `.gitignore:25` ignores `evidence/` wholesale (`git check-ignore -v` confirms), and neither TAP file nor the dispatch record has any commit history — so nothing with a machine-specific path enters the repository. CLAUDE.md's hard rule is not violated.
11. **Language assignment (ADR-0011) — cleared.** All new code comments, test descriptions and the commit message are English; these are agent/developer-facing artifacts.

---

## 3. Trajectory check

**Verdict: `consistent`.**

- The red artifact demonstrates the exact predicted mechanism, not a generic failure: `red.tap:819` shows RGs failing with `Error: serialized state write failed before commit (PS-CONTINUITY-LOCKED); zero mutation` — precisely the self-collision F1 described.
- The green artifact shows the full suite passing: 504 `# PASS` lines, `# fail 0`, `# skipped 0`, `# todo 0`, with RGs/RGs-2/RGs-3 passing (`green.tap:819-821`) and PS44Vc still passing (`green.tap:344`), confirming the anti-regression claim independently.
- Both artifacts are machine-written node:test TAP output with plausible structure and internally consistent exit codes.
- **Authorship: compliant.** The commit trailer `Dispatch: PHX-WP-PAC08-LOCK-REENTRANCY (goldfish)` matches the dispatch record's `taskId`, and the record's `commit` field (`3e1a727e`) matches the reviewed SHA. This is a dispatched fresh-context session, not an orchestrator-authored production diff — no EL-01/EL-16 lifecycle violation. `AI-Assisted: true` records anonymous assistance only; the commit carries no provider/model co-author, no session URL or ID, and no account identifier, so no prohibited correlation metadata is present.
- **One scoped limitation of this verdict:** RGq already passes in `red.tap:812` with the *new* assertion, which means the red run had the F3 production change applied. So there is a genuine red baseline for F1/F2 but **not** for F3. Not treated as a finding, because the dispatch scoped the red artifact to the new self-governing-topology test only — but the F3 half of this commit rests on green evidence alone.

---

## 4. Briefing violations observed

**One observation; not a stop.**

`specs/sprint-phoenix-epic/evidence/PHX-WP-PAC08-LOCK-REENTRANCY.dispatch-record.json` was supplied as authorship evidence — an admissible category — but its `log` array carries substantial implementor rationale prose (design alternatives considered and rejected, mechanism justification, self-reported verification claims). The dispatch pre-declared this boundary and instructed use of the file for the trailer/taskId match only, which is what was done: every substantive conclusion above is derived from the diff, the source files and the TAP artifacts read directly, none rests on that narrative. Recorded because a dispatch record whose prose reads like a completion report is one edit away from becoming real contamination; the durable fix is to keep the machine-checkable identity fields and drop the rationale prose from the artifact handed to a Critic.

Otherwise: none. All required references resolved and were readable; no chat history, handover, state, summary, prior verdict or expected conclusion arrived. The prior review receipt `pac08-fb-critic-review-5420c5e7.md` was offered as an optional cross-check only — **not opened**, to avoid inheriting judgment; the neutral registry supplied the F1/F2/F3 identifiers worked from.

**Context disclosure (accepted autoload, never silent):** `CLAUDE.md` project instructions; the git status / recent-commits snapshot; and the user memory index (`MEMORY.md`, chat-language and PO-signing-directory entries). The injected git snapshot reflects the parent session's start — not used as a freshness reference; the entire diff came from a direct `git show 3e1a727e`. **Scratchpad disclosure:** the shared scratchpad contained three pre-existing files from prior dispatches (`acceptance-check.md`, `evidence-map-check.md`, `evidence-map-check2.md`). Not read, no evidence built on them. The attempt to create a fresh isolated subdirectory was refused by the guard (`GUARD-CROSS-REPO-MUTATION`), so report persistence was unavailable; per the dispatch's no-write instruction this report was emitted as text for the Elephant to persist.

---

## 5. Verdict

**PASS.**

The fix is correct for the topology P-AC-08 mandates, and it earns that verdict on mechanism rather than on test colour: the reuse is a narrow, explicit hand-off within a single call stack, it cannot admit a second writer, the lock is released exactly once, ownership is still asserted against the on-disk record at commit time, and all 15 other `writeState` call sites are provably unchanged. Registry findings F1, F2 and F3 are all closed. The single minor finding (lexical rather than real-path lock identity) is fail-closed and does not block; it is a follow-up, best fixed by comparing against `holderLock.path` via `realpathSync`, which would close both the symlink gap and the recomputation window noted in rubric item 5 at the same time.
