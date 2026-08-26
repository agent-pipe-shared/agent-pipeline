# Critic review — PX0-AC-03/05/06 first-pass review (HEAD `d827c1b3`)

Bootstrap check passed: ruleset ce50d74d16fdbcd0b9f8b3b606297e88af3d2f139b3cd14b692f4ea15599b023 loaded · Project agent-pipeline-shared_phoenix · Calibration sprint-phoenix-epic · State n/a (Critic sees no history) · Role Critic

**Requested route:** `claude-opus-5 at max`. **Effective model identity: `unknown`** — no direct same-dispatch route evidence was observable; not inferred from selector or host label.
**T1 assurance:** `functional-equivalent-read-only; OS isolation not asserted`. Write capability exists in this host and is disclosed as a residual limitation, not an isolation claim. No write tool and no mutating command was invoked, no delegation.

---

## 1. Findings

### Finding 1 — No admission control on the free-form field that lands in the durable, git-tracked receipt

**Gap.** `createAuthorityRevisionIntent` validates `decision.id` only as `typeof decision.id !== "string"` — no pattern, no length bound — while every sibling identifier in the same closed intent (`featureId`, `idempotencyKey`) is constrained by `ID = /^[a-z][a-z0-9-]{0,63}$/u`. That `decision` object is copied verbatim into the receipt and spliced into the State object that is written to the repository-tracked State file. Nothing anywhere on the path proposal → intent → receipt → durable State rejects or redacts prohibited content.

**Risk.** PX0-AC-05's negative clause has no enforcing code path at all. A private path, a private machine identifier, an account coordinate, or pasted prompt/command text placed in `decision.id` is persisted verbatim into a git-tracked file — permanently, in git history, with no rejection and no redaction. The criterion's positive half is implemented; its security half is unimplemented rather than merely untested. Severity: **major**.

**Evidence.**
- `plugins/pipeline-core/lib/authority-revision-proof.mjs:19` — the only check on the field:
  ```js
  || !own(decision, ["id", "sha256", "scope"]) || typeof decision.id !== "string" || !SHA.test(decision.sha256) || !decisionScope(decision.scope, featureId)
  ```
- Contrast, same file `:7` — `const ID = /^[a-z][a-z0-9-]{0,63}$/u;`, applied to `featureId` (`:17`) and `idempotencyKey` (`:21`) but deliberately not to `decision.id`.
- `plugins/pipeline-core/scripts/pipeline-state.mjs:3398` — `decision: value.decision,` inside the receipt object.
- Same file `:3424-3427` — `const durableReceipt = { ...receipt, intentSha256: intent.sha256 };` appended to `nextState.authorityRevisionReceipts`; `:3429` serializes it into the written State bytes.
- `git ls-files --error-unmatch project/pipeline-state.json` succeeds — the durable target is repository-tracked and portable.
- The production wrapper adds nothing: `plugins/pipeline-core/scripts/phoenix-authority-revision.mjs:15-17` verifies only the signature over the intent digest and passes the proposal straight through.
- The test does not exercise the clause: `harness/scripts/pipeline-state.test.mjs:3830` uses `const bannedNeedles = [fx.dir, "/home/", "/tmp/", process.cwd()];` against a fixture whose `decision.id` is hardcoded to `"decision-01"` (`:3600`). AR05b therefore proves only that the *implementation* does not inject its own root path; no case supplies private content through the caller-controlled field.

**Spec-ref.** PX0-AC-05 (`specs/sprint-phoenix-epic/acceptance.md:55-60`), the clause "it SHALL NOT persist raw commands, private paths, prompts, user/account data, or private machine identifiers". Read against the matrix's own binding interpretation at `acceptance.md:29-32` — "Portable admission therefore SHALL make direct clone/read exposure safe before the first durable byte. This interpretation is normative and cannot be weakened by architecture prose or an implementation briefing" — and the same matrix's H-AC-13 pattern ("SHALL reject portable persistence before any temporary or final file exists"). Also `specs/sprint-phoenix-epic/spec.md:414`, which describes this writer's job as "require/reference **valid** decision IDs". Guardrail: SEC-01.

---

### Finding 2 — Replay short-circuit precedes the pending-journal check, masking the typed recovery-required state

**Gap.** In `runAuthorityRevisionApplyCommand`, the zero-write replay branch is evaluated *before* the journal is loaded. After an interruption between the State write and journal retirement, State already equals the postimage while the journal is still retained; a re-run of `-apply` takes the replay branch, prints `status: "replayed"` and returns 0 — never loading the journal, never retiring it, never signalling that recovery is outstanding.

**Risk.** The operator's natural retry reports a clean, completed transaction while a recovery journal is still pending. The retained journal surfaces only later, blocking an *unrelated* subsequent revision with `AR-JOURNAL-CONFLICT`. No State corruption and it still fails closed eventually, but on this path AC-06's "expose a typed recovery-required state" is not honoured. Severity: **minor**.

**Evidence.** `plugins/pipeline-core/scripts/pipeline-state.mjs:3587-3597` (replay branch returns) precedes `:3599-3606` (`loadAuthorityRevisionJournal` / `AR-JOURNAL-PENDING`). Test gap: `harness/scripts/pipeline-state.test.mjs:3901-3912` (AR06c) constructs exactly this state — interrupted via `afterAuthorityRevisionWrite: () => false` — but proceeds straight to `recover`; no case re-runs `-apply` from it.

**Spec-ref.** PX0-AC-06, first clause (`acceptance.md:61-65`).

---

### Finding 3 — Legacy `.v1` journal sentinel disables the only decision-validity check recovery performs, with no owner or expiry

**Gap.** `loadAuthorityRevisionJournal` maps a `.v1` journal to the in-memory sentinel `expiresAt: null`, and the recovery expiry gate is written as `journal.expiresAt !== null && !(Date.parse(...) > Date.parse(nowIso))`, so a `.v1` journal rolls forward unconditionally. AR06h asserts this as correct behaviour. The compatibility path carries a rationale comment but no owner, no expiry date, and no removal trigger.

**Risk.** For a `.v1`-shaped journal, an arbitrarily stale design decision completes forward into State authority with no freshness check — the implementation's own designated "ONE fresh binding check recovery performs" (`:3704-3705`) is skipped. The path is genuinely reachable: `git log -S "continuity-authority-revision-journal.v1"` shows `.v1` journals were written by `c62a3c4a`, before `43d42a23` introduced `.v2`. Bounded by the surviving preimage byte-identity and MAC checks, and by the single superseded in-sprint build that could have left such a journal. Severity: **minor**.

**Evidence.** `plugins/pipeline-core/scripts/pipeline-state.mjs:3483-3487` (sentinel), `:3712` (`journal.expiresAt !== null` guard), `:3288-3290` (compat rationale comment — no owner, no expiry); `harness/scripts/pipeline-state.test.mjs:4008-4052` (AR06h asserts unconditional roll-forward). No backlog entry exists for its removal.

**Spec-ref.** Primary: QG-06 (`guardrails/quality-gates.md:78-79`) — "a known gap with a TODO comment and no due date is a finding, not a mitigation". Secondary: PX0-AC-06, "after fresh binding checks".

---

## 2. Deliberately not flagged (examined, found in order)

1. **Spec fidelity, AC-03 core mechanism.** Apply re-derives the entire plan under the lock from current reality (`:3611`) and requires exact `planSha256`/`intentSha256` identity (`:3612`); the rebuild rechecks State preimage (`:3344`), old authority (`:3351-3354`), proposed artifact bytes including the PRD `technical-spec-sha256` marker (`:3363-3371`), decision scope (`:3339-3340`), validity/expiry (`:3345-3346`) and the git candidate (`:3347-3350`). Atomic publish and readback at `:3628`/`:3635-3639`. Correct.
2. **AC-03 "evidence tuple" recheck.** The intent's `evidence` is an opaque `{ sha256 }` with no path or referent (`authority-revision-proof.mjs:21`), so no code path *could* recheck it against reality; it is re-established under the lock only by intent-digest identity. This is a property of the AC-02 intent shape, not an AC-03 implementation defect, and AC-02 is not a verdict target here.
3. **AC-03 expiry recheck test coverage.** AR04f (`test:3786-3791`) tests expiry at *plan* time only; no case is valid at plan and expired at apply. Not a defect: apply invokes the same `buildAuthorityRevisionPlan` under the lock, and AR03c/AR03f/AR03h independently prove that shared function is genuinely re-run against fresh reality at apply time.
4. **Scope.** Confined to the mandated locations: `harness/scripts/pipeline-state.mjs` is a 21-line re-export shim over the canonical plugin writer, consistent with P-AC-08; the lib/wrapper files match `spec.md:423-426`. No unbriefed areas touched.
5. **Test integrity.** AR03/AR05/AR06 exercise the real code paths with real fault injection (`afterAuthorityRevisionJournal`/`afterAuthorityRevisionWrite`), real State files written by the real `continuity-init` writer (`test:3582`), a decoy `.tmp.*` file and a drifted git candidate (`:3889-3891`), genuine on-disk HMAC keys, and a re-MACed hand-built legacy journal. Nothing stubs the mechanism under test.
6. **Edge cases / crash-recovery sequence.** Traced journal-publish → State write → readback → retirement. Every interruption point has a covering case: before write (AR06b), after write (AR06c), third-value divergence (AR06d), expired-at-recovery (AR06e/g), not-yet-expired (AR06f), legacy shape (AR06h), malformed shape (AR06i). Journal is `wx`-only (`:3514`), retained on every failure path, retired only after a confirmed matching readback.
7. **A gate-estimate readback hazard chased and cleared.** `atomicWriteContinuityState` rewrites through `clearGateEstimateForMutation` (`:882`) while `nextStateBytes` is computed without it (`:3429`), which would break the byte-identity readback. Not reachable: `clearGateEstimateForMutation` is identity when `gateEstimate === undefined`, and `buildAuthorityRevisionPlan:3322` refuses whenever a gate estimate is present.
8. **Guardrails.** No secrets, tokens, credential-shaped strings or machine-specific absolute paths in the reviewed code (SEC-01/SEC-02); private material stays in the git-common-dir with `0o600`/`0o700` and the signing key is required outside the repository.
9. **Dependency reality check.** No new dependency. Every import is `node:` builtin or an existing repo-relative module.
10. **Language assignment (ADR-0011).** All reviewed artifacts are agent-facing and English.
11. **Authorship (EL-01/EL-16).** Skipped per the dispatch's disclosed structural limitation (no single dispatch record exists for this multi-session-assembled capability); recorded as a limitation, not a finding. No independent positive evidence of an orchestrator-authored production diff found.

---

## 3. Trajectory check

**Verdict: `consistent`.**

- HEAD verified independently as `d827c1b31408533b8c8d371f17fb5f3bf40c5ed9`, matching the dispatch. Working tree clean.
- The supplied TAP is machine-written and internally coherent: `TAP version 13`, `1..1`, `# tests 1 / # pass 1 / # fail 0 / # skipped 0 / # todo 0`, `duration_ms 5257.220635`, and the suite's own summary `504/504 cases passed.` Zero `# FAIL` lines. All AR03/AR05/AR06 case IDs appear as `# PASS`.
- The 1-test/504-assertion shape is honest, not a masking pattern: assertions accumulate into `failures[]` and the file terminates with `process.exit(1)` when non-empty.
- The command matches the project verify gate: `harness/scripts/verify.mjs:373` registers `{ name: "pipeline-state-tests", file: .../pipeline-state.test.mjs }`.

---

## 4. Briefing violations observed

**None.** The dispatch handed references only; no rationale, summary, praise, expected conclusion or implementor characterization.

**Disclosures (accepted, not defects):**
- Auto-injected context: project `CLAUDE.md`; a git status/recent-commits snapshot (stale — not used, own `git rev-parse HEAD` used instead); user auto-memory `MEMORY.md`.
- `docs/state.md` and `project/pipeline-state.json` surfaced in searches but were NOT read (State/handover forbidden input); prior Critic reviews in `specs/sprint-phoenix-epic/evidence/` were listed but not read (prior verdicts forbidden input).
- No scratchpad subdirectory was needed (no fixtures/repros/baselines built).
- CR-06-D persistence suppressed per the dispatch's no-write instruction; report emitted as text only.
- Advisor not invoked per MP-26 / no-subdelegation.
- Authorship check not performed — disclosed limitation, not a finding (no dispatch record exists for this assembled capability).

---

## 5. Per-criterion verdict

| Criterion | Verdict | Basis |
|---|---|---|
| **PX0-AC-03** | **pass** | Every clause — State preimage, old authority, current proposed artifact bytes, decision scope/validity, candidate — is rechecked under the lifecycle writer lock by a fresh re-derivation against current reality, followed by an atomic publish and a byte-exact readback. Genuinely tested against post-plan drift on three independent axes. |
| **PX0-AC-05** | **fail** | Finding 1 (major). The receipt's positive half is fully implemented, durably retained and correlated. The criterion's negative half — "SHALL NOT persist raw commands, private paths, prompts, user/account data, or private machine identifiers" — has no enforcing code path: `decision.id` is an unconstrained caller-supplied string that reaches a git-tracked file verbatim. |
| **PX0-AC-06** | **pass** | The typed recovery-required state, recovery bounded to the exact retained preimage or intended postimage, no new candidate selection and no temp-file inference are all implemented and covered by real crash-recovery fixtures. Findings 2 and 3 are both minor and neither defeats the criterion's mechanism. |
