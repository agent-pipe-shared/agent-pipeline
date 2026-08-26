# Critic review — P-AC-08 / F-B delta review (base `3fdf8b9f`, head `5420c5e7`)

Bootstrap check passed: ruleset ce50d74d16fdbcd0b9f8b3b606297e88af3d2f139b3cd14b692f4ea15599b023 loaded · Project agent-pipeline-shared_phoenix · Calibration sprint-phoenix-epic · State n/a (Critic sees no history) · Role Critic

**Requested route:** `claude-opus-5 at max` · **Effective model identity: unknown** (no direct same-dispatch route evidence observed; not inferred from selector or host label).
**T1 assurance:** `functional-equivalent-read-only; OS isolation not asserted`. Write tools exist in this host — disclosed as a residual host limitation, not an isolation claim. No write tool and no mutating command was invoked; no sub-delegation.

**Review object:** exactly one commit, `5420c5e7` (`git show 5420c5e7`), 2 files, +172/−2.

---

## 1. Findings

### F1 — Self-inflicted continuity-lock collision makes the mandated reconcile unreachable · `blocker`

**Gap.** The state write this commit adds inside `defaultFeaturePackageReconcileApproval` calls `writeState(dir, …)`, which acquires an *exclusive* continuity lock on `dir`. But `runFeaturePackageReconcileCommand` already holds an exclusive continuity lock on `root` across its entire body, and the approval closure is invoked inside that window. When `dir === root` — the topology P-AC-08 mandates for the Phoenix manifest (governing session = this repository = `--root`) — the inner acquisition fails and the whole reconcile is refused.

**Evidence** (`plugins/pipeline-core/scripts/pipeline-state.mjs` unless noted):

- `:5767` `const lock = acquireContinuityLock(root, FEATURE_PACKAGE_APPLY_LOCK_TOKEN, deps);`
- `:5769` … `:5848` `} finally { releaseContinuityLock(lock); }` — held across the whole body.
- `:5784` `const approvalCheck = deps.featurePackageReconcileApproval({ … })` — inside that window.
- `:6058` `if (FEATURE_PACKAGE_WRITE_SUBCOMMANDS.has(sub)) return runFeaturePackageWriteCommand(sub, rest, deps);` — raw `deps`; no `dir` injected, so a real CLI run has `deps.dir === undefined`.
- `:5921` `const dir = deps.dir ?? projectDir();` · `:550-551` `projectDir()` = `CLAUDE_PROJECT_DIR || process.cwd()`.
- **added by this commit**, `:5975` `const writeResult = writeState(dir, next, state);`
- `:609-610` `const lock = acquireContinuityLock(dir, LEGACY_WRITER_LOCK_TOKEN); if (!lock.ok) return { ok: false, committed: false, code: lock.code };`
- `:794` `const path = continuityLockPath(dir);` · `:678` `` return `${statePath(dir)}.lock`; `` — a pure function of `dir`, so `dir === root` ⇒ identical lock path.
- `:748`/`:755` `linkSync(candidate, path)` → `EEXIST` → `{ ok:false, code:"PS-CONTINUITY-LOCKED" }`.
- `:816` the stale-recovery escape is closed twice over: `observed.token !== token` (`"pipeline-feature-package-apply-v1"` `:5476` vs `"pipeline-legacy-writer-v0"` `:528`) **and** `ageMs &lt; staleMs`.
- **added by this commit**, `:5976` `if (!stateWriteSucceeded(writeResult)) return { ok: false, code: writeResult.code };`
- `:5791-5793` `if (!approvalCheck?.ok) return refuseFeaturePackageRead(sub, "PO-bound approval was not confirmed for this exact candidate and plan digest (FTP-RECONCILE-APPROVAL-REJECTED); zero mutation");`

Topology anchor: `harness/scripts/pipeline-state.test.mjs:2984` `PHOENIX_MANIFEST = "specs/sprint-phoenix-epic/lifecycle.json"`; `:3249` and `:3255` invoke the feature-package family with `--root REPO_ROOT` for exactly that manifest. The inherited Phoenix manifest lives in *this* repository, so the mandated operator invocation has `root === projectDir()`.

The only escape trades one failure for another: running from a directory where `projectDir() !== root` makes the approval read a governing state without `activeFeature`/`planApproval.poGateAuthority`, refused at `:2768` with `CRITICAL-PROOF-STATE`.

**Risk.** `blocker`. Pre-commit the closure was `return verified.ok ? { ok: true } : { ok: false, code: verified.code };` (old `:5944`, visible in the diff hunk) — no second lock, so this is a regression introduced by this delta. The P-AC-08 capability "reconcile … only through an existing-manifest preview, exact PO-bound apply, and readback" becomes unreachable in the real operator invocation. The refusal is additionally misattributed to the PO's proof/plan digest.

**Spec-ref.** P-AC-08, `specs/sprint-phoenix-epic/acceptance.md:359-362`.

**Elephant note (independently confirmed 2026-08-11, post-review):** the mechanism was reproduced directly and safely, isolated from any real repository state — `acquireContinuityLock(dir, "pipeline-feature-package-apply-v1", {})` followed by `acquireContinuityLock(dir, "pipeline-legacy-writer-v0", {})` against the SAME fresh temp `dir`, outer lock still held: the inner call returns `{ok:false, code:"PS-CONTINUITY-LOCKED"}` every time; released, it then succeeds. This confirms the mechanism unconditionally. The premise (`dir === root` is the realistic Phoenix self-governance topology, not just a theoretical one) was not re-proven end-to-end against the live repository — doing so would have risked mutating this project's own `pipeline-state.json` — but is strongly supported by `defaultFeaturePackageReconcileApproval`'s own design comment (acknowledging `dir` can coincide with `root`) and by P-AC-08's stated purpose (Phoenix reconciling its own spec package from within its own governing session).

---

### F2 — New coverage is structurally incapable of detecting F1 · `major`

**Gap.** Every reconcile-approval case — the four added here and the five pre-existing — injects `dir: governingDir` pointing at a *separate* temp fixture, while `--root` is a *different* temp fixture. No case omits `dir`, so the default `deps.dir ?? projectDir()` resolution is never exercised, and the `dir === root` topology is never reachable. The 501/501 green therefore cannot substantiate the production path.

**Evidence.** `harness/scripts/pipeline-state.test.mjs`:
- New: `:4594-4597` and `:4678-4683` — `dir: governingDir` where `governingDir = seedPac08GoverningSession(…)` (`:4204`).
- `--root` source: `:4169` `reconcileApplyCmd(dir, extraArgs, deps)` → `run(["feature-package-reconcile", "--root", dir, …])`, called with `fx.dir` from `seedReconcilePackage` (`:4124`).
- Pre-existing, same shape: `:4431`, `:4456`, `:4477`, `:4497`, `:4525`.
- Consequence in the artifact: `specs/sprint-phoenix-epic/evidence/pac08-green-final.tap:819` `# 501/501 cases passed.` — green under a topology that excludes the mandated one.

**Risk.** `major`. The submitted evidence overstates assurance: it green-lights a change that fails on the only invocation P-AC-08 requires. Contributing process anchor: the same dispatched session authored both the implementation and the tests validating it (`specs/sprint-phoenix-epic/evidence/PHX-WP-PAC08-APPROVAL-LEDGER.dispatch-record.json` phases `implementation` then `test-authoring`), which is the self-validation failure mode QG-04 §63 names — here with a concrete manifestation, not an abstract one.

**Spec-ref.** P-AC-08 ("covered by `harness/scripts/pipeline-state.test.mjs`"), `guardrails/quality-gates.md` QG-05 (blind spot not named), QG-04 §63.

---

### F3 — A replayed proof is reported to the operator as a wrong candidate/plan digest · `minor`

**Gap.** The new `CRITICAL-PROOF-REPLAY` return value has no operator-facing surface. Its sole call-site handler prints a generic message asserting a cause that is false for this case.

**Evidence.** `plugins/pipeline-core/scripts/pipeline-state.mjs:5958` `return { ok: false, code: "CRITICAL-PROOF-REPLAY" };` → handled only at `:5791-5793`, which prints `"PO-bound approval was not confirmed for this exact candidate and plan digest (FTP-RECONCILE-APPROVAL-REJECTED)"`. Contrast the mirrored path `:6622`, which prints `"approve-push refused (CRITICAL-PROOF-REPLAY); external proof was already consumed."` The new test asserts only the generic string: `harness/scripts/pipeline-state.test.mjs:4643-4646` `/FTP-RECONCILE-APPROVAL-REJECTED/`.

**Risk.** `minor`. An operator whose proof was already spent is told the proof does not bind this candidate/plan digest — factually wrong (it verified; it was consumed) — sending diagnosis toward re-deriving the preview instead of toward a fresh signing ceremony.

**Spec-ref.** `guardrails/quality-gates.md` QG-05 (gate honesty). Partial anchor, declared as such.

---

### F4 — The RED artifact postdates the fix; it is a reconstruction, not a pre-fix reproduction · `minor`

**Gap.** QG-07 requires the red check *before* the fix. The submitted red artifact was produced after the commit landed, by reverting the source.

**Evidence.** Commit `5420c5e7` AuthorDate/CommitDate `2026-08-11 19:50:09 +0200`; `specs/sprint-phoenix-epic/evidence/pac08-red-check.tap` mtime `2026-08-11 19:53:52`; `pac08-green-final.tap` mtime `2026-08-11 19:54:19`.

**Risk.** `minor`. Substantive verification value is largely preserved — the red run is genuine and discriminating (`pac08-red-check.tap:819` `# 496/501 cases passed.`, with exactly the five fix-dependent assertions failing at `:809, :810, :812, :815, :817`) — but the ordering guarantee QG-07 buys (the test was red for the reported defect before any fix existed) is not evidenced.

**Spec-ref.** `guardrails/quality-gates.md` QG-07 §86.

**Elephant note:** this one is mine, not the dispatch's — my own resume message asked for red-before-green evidence only after the commit had already landed. Recorded as a process error on my side, not the goldfish's.

---

## 2. Deliberately not flagged (examined, found in order)

1. **Spec fidelity.** P-AC-08's file assignment holds: `harness/scripts/pipeline-state.mjs` is a 21-line stable re-export shim over the plugin-owned canonical writer (`harness/scripts/pipeline-state.mjs:5,10`), so editing `plugins/pipeline-core/scripts/pipeline-state.mjs` satisfies the named location. F-B's substance is addressed *in code*: `lastApproved` with `approvedBy`/`approvedAt`/`forCommit`/`criticalProof` is persisted (`:5964-5969`), and the proof is consumed (`:5970-5972`).
2. **Scope.** Exactly two files, both named by P-AC-08. No drive-by renames or refactors (QG-07 §87 clean). Range checked hunk-by-hunk.
3. **Authorship (EL-01/EL-16).** Clean. Commit trailer `Dispatch: PHX-WP-PAC08-APPROVAL-LEDGER (goldfish)` + `AI-Assisted: true`, matching `dispatch-record.json` `taskId`/`dispatcher: elephant`. No orchestrator-authored production diff. No provider/model co-author, no session URL/ID, no account identifier — the prohibited private-correlation metadata is absent.
4. **Test integrity.** No pre-existing assertion was weakened, deleted, skipped or made tolerant; the diff is purely additive (+110 test lines, 0 deletions in the test file). RGi-RGn survive byte-identical.
5. **Concurrency / state safety.** `writeState` is CAS-guarded: `:612-616` re-reads under lock and refuses `PS-STATE-STALE` on mismatch. A malformed existing state cannot be clobbered — `readState` non-`ok` yields `observedBase === null` → refusal. The replay check runs strictly before the write (`:5951-5959` vs `:5975`), so a refused replay mutates nothing, as RGq verifies.
6. **Guardrails.** No secrets, tokens or machine-specific absolute paths introduced. Conventional Commit subject; one concern. English throughout (ADR-0011).
7. **Security surface.** The persisted `criticalProof` is public material (key reference, public key, signature) per the existing contract at `:2786-2790`; parity with `pushApproval.lastApproved`. `approvedBy` is a JSON-encoded operator string — no injection surface. Chat mode is correctly labelled: `criticalProofWaiverFor` always returns a populated `waiver` when `waived: true` (`critical-human-proof-policy.mjs:332-336`), so `criticalProofWaiver` is set and the "third, unlabelled state" the code disclaims cannot occur.
8. **Dependency reality check (SEC-04).** Not applicable — the diff introduces **zero** new imports, packages, actions or images. Nothing to verify against a registry.
9. **Documented-instead-of-fixed (QG-06).** No TODO/FIXME added; no warn-only gate introduced.
10. **Language assignment (ADR-0011).** No new artifacts; comments and commit message are English-canonical.

**Dropped candidates** (hunted, evidence insufficient or no in-scope anchor):
- *External-ledger asymmetry.* `approve-push` appends consumed proofs to an external cross-clone ledger (`:6647-6672`); the reconcile path does not, so a reconcile proof consumed in clone A remains replayable in clone B. Dropped: the gate is push-scoped (`gates.push_external_ledger`) and defaults to `"off"` (`plugins/pipeline-core/lib/external-push-ledger.test.mjs`, `n({}) === "off"`), there is no read-side check for reconcile either (so no inconsistent gate), and neither F-B nor P-AC-08 anchors it. Worth a design decision, not a finding on this delta.
- *Shared, non-kind-restricted consumption ledger.* Cross-kind collision is unreachable: subjects differ (`:2771` `criticalActionSubjectSha256({ kind, … })`), so digests differ; sharing is strictly stricter. No consequence.
- *Stale code pointer.* The new comments cite approve-push's consumption shape at "~6554-6576" (`:68`, `:5946`), but that block is actually at `:6614-6638`; `:6554-6576` is the flag-parsing region. Comment-only, self-hedged with "as of this writing", no runtime effect and no guardrail anchor — dropped per the style-without-anchor skip rule.
- *`criticalProofConsumption: []` materialised where the field was previously absent* (chat mode, `:5970-5971`). Byte-for-byte parity with `approve-push:6633-6635`; schema is additive-optional; no consequence.

---

## 3. Trajectory check

**`consistent`, with two declared caveats.**

The artifacts are machine-written (`node --test --test-reporter=tap`) and mutually discriminating: `pac08-red-check.tap:819` `# 496/501 cases passed.` with exactly the five fix-dependent assertions failing (`:809, :810, :812, :815, :817`) and the proof-independent ones still passing, against `pac08-green-final.tap:819` `# 501/501 cases passed.` / `:829-830` `# pass 1` `# fail 0`. The eleven new assertions are all present in the green artifact (`:808-818`). The delta 501 − 496 = 5 matches the five fix-dependent assertions exactly. The commit trailer's task ID matches the dispatch record's `taskId`, and the record's stated files match the actual two-file diff.

Caveat (a): the RED run postdates the commit — see F4.
Caveat (b): the "501/501" claim is *true* but does not mean what it appears to mean — the suite never exercises the topology P-AC-08 mandates (F2), so green here is not evidence that the changed production path works.

---

## 4. Briefing violations observed

1. **Dispatch reference defect (diff range).** The dispatch stated the range `3fdf8b9f..5420c5e7` covers exactly one commit. It does not — `git rev-list` returns **five**: `5420c5e7`, `40c5269f`, `9fa4e89d`, `e579f0be`, `c8b7847c`. The four extra are docs commits whose subject lines announce a prior Critic FAIL verdict and its remediation; following the range as written would have pulled prior-verdict material into my input, which the fail-closed boundary forbids. I reviewed the single enumerated SHA via `git show 5420c5e7` and did not open those commits' contents. The primary enumeration was unambiguous, so I proceeded rather than stopping; the base-commit reference itself is wrong and should be corrected.
2. **Contaminated dispatch.** `specs/sprint-phoenix-epic/evidence/PHX-WP-PAC08-APPROVAL-LEDGER.dispatch-record.json` was declared "a referenced, mechanical DoD result and command/exit code artifact only". Its `log[].note` and `report` fields instead carry implementor justification prose, design rationale, self-assessment (`"all DoD checks PASSED"`, `"corroborates zero collateral change"`) and a self-declared deviation — i.e. completion-report prose, which the input contract excludes. I opened it because the dispatch named it as the authorship evidence I was required to check. Mitigation for the record: F1–F3 were derived from the code trace *before* I opened that file; I used it only for the authorship check and as a cross-check on trajectory, and relied on none of its claims.

**Disclosure (accepted autoload, never silent).**
- Auto-injected: `CLAUDE.md` project instructions; a git status / recent-commits snapshot from the *parent* session's start (it shows HEAD as `270a9233`) — **not used**; all commit and diff state came from my own `git show` / `git rev-list` / `git log` on `5420c5e7`. Also the user auto-memory index (chat language, PO signing directory).
- **Pre-existing scratchpad state found and NOT read or built upon:** `/tmp/claude-1000/-home-skar667-src-agent-pipeline-shared-phoenix/5130e5e0-7733-4570-8e14-82740a3a3b10/scratchpad/acceptance-check.md` (mtime 18:17) and `.../evidence-map-check.md` (mtime 19:43), from a prior dispatch. I created no fresh subdirectory because this dispatch forbids writing.
- **CR-06-D not exercised:** the dispatch instructs "Do not write any file … the Elephant will persist it", and the T1 lane forbids mutating commands. No candidate notes were persisted; this message is the only artifact. Please persist it.
- **Advisor not invoked:** the agent harness instructs an advisor consultation; this dispatch forbids it (MP-26, verified present at `policies/model-policy.md:220`) and the Critic contract forbids sub-delegation. I honoured the dispatch and surface the conflict here rather than resolving it silently.
- **Host note:** this host enforces a closed shell grammar (`guard-lifecycle-ready`); composed commands were rejected, so every command was issued singly. No override was sought.

---

## 5. Verdict

**FAIL.**

F1 is a blocker: the delta regresses the P-AC-08 reconcile capability into an unconditional refusal for the invocation the spec mandates, and F2 explains why the submitted green evidence could not see it. F-B's substance is genuinely addressed in code — the persistence and replay-ledger logic itself is correct and faithfully mirrors `approve-push` — but the write is placed inside a lock the caller already holds.
