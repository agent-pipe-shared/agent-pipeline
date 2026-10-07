# Contracts of the unstarted acceptance criteria (SLICE-X, 2026-10-07)

Read-only extraction. Quotes are verbatim from `specs/sprint-alfred-epic/` (`acceptance.md` = ACC, `spec.md` = SPEC,
`traceability.md` = TRC). Seams were found with `git grep -n` over `plugins harness schemas policies`. "Protected" means
the seam path matches a TP-1..TP-13 pattern of `templates/prompts/agent-obligations.md` section 2. Coverage note: the
seam search was completed for AC-6 and AC-33 only; the budget checkpoint ended the search before AC-34, R4-1/R4-2, R5
`--answers-file` and R6. For those four the seam line states what is unsearched and carries the earlier reconciliation
result (`spec-ac-reconciliation-2026-10-07.md` lines 40-45, 63-64). No design or proposal is made here.

## 1. AC-6 - Interruption baseline and promotion evidence

**Contract**
- ACC:23: "Threshold-dependent promotion has sufficient measured interruption/calibration evidence and explicit PO
  approval; actual window, coverage and limitations are recorded. No fixed 14-day wait applies (PO decision 2026-09-13);
  missing evidence or elapsed time alone cannot establish calibrated PASS". Evidence named: "`interruption-baseline.json`
  + evidence-quality and promotion checks that read it".
- SPEC:383-389 (section 6.1 C1): "**Dogfood evidence:** first wave lands it; `interruption-baseline.json` records the
  actual collection window and evidence coverage. ... B1 promotion and D2 thresholds require sufficient measured
  calibration evidence and the existing PO promotion decision; elapsed days alone prove neither. Missing or insufficient
  evidence remains explicitly unavailable or report-only, never calibrated PASS."
- SPEC:364-371: deliverables `plugins/pipeline-core/lib/interruption-receipts.mjs` (emit + aggregate), registry
  `policies/interruption-registry.v1.json`, local report script, fixtures; privacy at SPEC:381-382 (receipts under ignored
  `evidence/`, aggregates under `telemetry/`). Schemas `pipeline.interruption-receipt.v1` / `-registry.v1` (SPEC:66, 812).
- TRC: no AC-6 row; only TRC:39 ("Typed governance/rigor/interruption/economics ... Deterministic derivation plus
  measured receipts").

**Nearest existing seam**
- `plugins/pipeline-core/lib/interruption-receipts.mjs:11` (receipt keys), `:450-501` (`aggregateInterruptionReceipts`:
  inputs `receipts`, `window`, `coverage`; output carries `window`, `coverage`, `registrySha256`).
- `plugins/pipeline-core/scripts/report-interruptions.mjs:182,396,421` (coverage printed, defaults `unknown`).
- `policies/interruption-registry.v1.json:2`; tests `plugins/pipeline-core/lib/interruption-receipts.test.mjs`.
- No file or code named `interruption-baseline` exists; no promotion check reads one.

**Protected?** Seam files: no. Registration of a new suite goes through `harness/scripts/verify.mjs:238` (TP-3) and
`harness/verify-suites.json` (TP-13): yes, protected.

**Open questions**
- Where `interruption-baseline.json` lives and which tool writes it (SPEC says only that it "records" window and coverage).
- What counts as "sufficient measured" evidence (no threshold is stated).
- Which "promotion checks" and "evidence-quality" checks exist to read it (B1 promotion / D2 thresholds are named, no module).
- Whether the baseline is tracked or stays under ignored `evidence/` / `telemetry/`.

## 2. AC-33 - Recovery availability (RV-1..RV-11)

**Contract**
- ACC:63: "V2 null owner is `unavailable` and V1 absent is `unobserved`; CAS-conflict classification, signed legacy
  custody and archival preserve bytes and grant no authority; State, `activeFeature`, proofs and history stay unchanged.
  The attended external route (pinned built-ins-only Node CLI, operator-selected artifact and public signer anchor,
  detached Ed25519 authorization, exact bounded code/test paths, preimage check, journaled per-file atomic prefix, exact
  post-image readback, forward-only crash recovery) refuses a wrong repository, wrong anchor, altered artifact, out-of-set
  path and preimage mismatch without mutation, resumes forward at every journal step, and returns typed unavailable naming
  the attended prerequisite ...". Evidence: "section 20.3 RV-1...RV-11 fixtures (RV-8...RV-11: external route);
  candidate-bound host evidence".
- SPEC:1192-1195: "sequenced after R4 (section 21.7)"; "RV-1...RV-7 cover the P1 legacy-owner custody and archival;
  RV-8...RV-11 cover the attended external route".
- RV-1 SPEC:1197-1200 (V2 `ownerRuntime: null` = `unavailable`, V1 absent = `unobserved`, never `not-live`); RV-2
  :1201-1203 (CAS classification, typed unavailable on mismatch); RV-3 :1204-1206 (detached human proof binds receipt
  bytes or absence, repository, disposition, session-ended confirmation, CAS precondition); RV-4 :1207-1211; RV-5
  :1212-1215; RV-6 :1216-1218 (State/`activeFeature`/proofs/history byte-identical; forward-only crash recovery); RV-7
  :1219-1221 (CI detects an unregistered producer); RV-8 :1222-1225 (verify anchor and signature before any write; typed
  refusals); RV-9 :1226-1230 (exact signed paths only; readback equals post-image); RV-10 :1231-1235 (crash at every
  journal step resumes forward); RV-11 :1236-1241 (typed unavailable naming the attended prerequisite; PO decision
  2026-10-04 #15).
- SPEC:1103 "Attended external recovery (implemented 0.7.0 deliverable, PO decision 2026-10-04 #1)". TRC:44, 171, 185.

**Nearest existing seam**
- RV-1 vocabulary: `plugins/pipeline-core/lib/worktree-lifecycle.mjs:705` (`inspectSessionOwnerRuntime`), `:948`
  (`ORPHAN_ARCHIVE_OWNER_STATUSES` = unavailable, unobserved), `:1098` (`archiveOrphanSessionDescriptor`); tests
  `worktree-lifecycle.test.mjs:843,1119`.
- `plugins/pipeline-core/lib/session-cleanup-recovery.mjs:963` (comment on V2 `ownerRuntime`).
- RV-2..RV-11 (signed custody, external CLI, journal): none found (no RV-labelled test, no external-route code).

**Protected?** Seam files: no. Hooks wiring for new refusals would touch `plugins/pipeline-core/hooks/hooks.json` (TP-4).

**Open questions**
- Name, location and packaging of the pinned external Node CLI (SPEC names properties, no file).
- Format of the signed authorization / post-image artifact and the journal.
- Which "code/test paths" the signed set may contain.
- Whether RV-1..RV-7 extend `worktree-lifecycle.mjs` or a new module.
- Typed code names for RV-8..RV-11 refusals (SPEC says "typed code", none listed).

## 3. AC-34 - Uninstall refuses with `PU-FOREIGN-HOOK-CONFLICT`

**Contract**
- ACC:64: "refuses with `PU-FOREIGN-HOOK-CONFLICT` and instructions; the foreign hook, retained documents and Git history
  stay unchanged and ordinary Git still works". Evidence: "section 18 case U-1 (win32 and POSIX dialects, consumer-layout
  repository)".
- SPEC:1073: "An uninstall that meets a foreign Git hook (a hook the Pipeline does not own and cannot prove it installed)
  keeps refusing: it returns the typed code `PU-FOREIGN-HOOK-CONFLICT` with instructions that name the hook, state that
  nothing was removed for it, and give the attended step the repository owner takes (PO decision 2026-10-04 #9).
  Acceptance case U-1: a repository with a foreign hook next to Pipeline-owned bindings refuses the uninstall ... the
  foreign hook stays byte-for-byte unchanged, every retained document and the Git history are intact, and ordinary Git
  commit/push still works."
- SPEC:1073 also: uninstall "derives ownership/footprint independently ... digest-bound resumable journal. Remove owned
  Git shims before implementation/private state; strip exact owned keys; unregister exact workspace mechanics; persist
  decline; archive/remove admissible private state last. Foreign/modified/shared-worktree artifacts are preserved or yield
  explicit conflict."
- Other mentions: SPEC:2605, 2626 (foreign hook never overwritten); TRC:179.

**Nearest existing seam:** not searched in this slice (budget checkpoint). Earlier reconciliation: code absent from
plugins/harness, no test, no slice. Candidate area by file name only: `plugins/pipeline-core/lib/project-onboarding-v3.mjs`
and `project-onboarding-foreign-residue*.test.mjs` (found by the AC-33 search, unverified for this item); a grep of
`uninstall` in `project-onboarding-v3.mjs` and `onboarding-init.mjs` returned no match.

**Protected?** Not determined (no seam confirmed).

**Open questions**
- Which verb or script the "uninstall" is (no existing entry point found in the two files checked).
- Exact instruction text fields (SPEC gives three content requirements, no template).
- How "cannot prove it installed" is decided for a hook.

## 4. R4-1 / R4-2 - Role-route and fallback self-dispatch preflight (AC-29)

**Contract**
- ACC:51: "role-route preflight (`native`, Advisor-only labelled `fallback-self-dispatch`, `unavailable`); a fallback
  result never satisfies readiness, Critic or plan-verifier, and fallback roles run read-only".
- SPEC:1600-1603: "A typed, read-only preflight reports, per runner and role (Advisor, Critic, Goldfish tiers, readiness,
  plan-verifier), `native`, `fallback-self-dispatch` (Advisor only) or `unavailable`, each with a reason code."
- SPEC:1604-1607: fallback may substitute only the Advisor, "as a labelled, non-authorizing advisory input
  (`assurance: fallback-self-dispatch`)".
- SPEC:1608-1612: readiness/Critic/plan-verifier evidence must come from a host-observed child; otherwise "`unavailable`
  with a reason code, and presentation and close are refused".
- SPEC:1613-1620: mechanisms `cli-child` or `hook-observed-subagent`; SPEC:1634-1639: dispatch-to-result record binding
  "template digest, the exact sent prompt digest, the native subagent id and the result digest"; fallback Advisor "runs
  read-only, and the guard refuses its write tools"; equal subagent id or prompt binding "refused as self-review".
- R4-1 SPEC:1741-1745: per-runner fixtures for the three states; "Presentation and close are refused when a readiness,
  Critic or plan-verifier route is `unavailable`. An exception rationale generated for an unavailable Advisor route
  contains only receipt-backed facts."
- R4-2 SPEC:1746-1752: fallback Advisor result accepted with label; fallback as readiness/Critic/plan-verifier evidence
  "refused by the package/close validator"; fallback Advisor Write refused; binding equal to implementor dispatch refused;
  Claude Critic subagent result accepted only "with the hook-recorded start, per-call read-only enforcement and terminal
  binding". Also SPEC:1796-1800 (R4-12). TRC:78, 82, 83, 161, 184, 244.

**Nearest existing seam:** not searched in this slice. Earlier reconciliation (line 40): no `fallback-self-dispatch` code;
related `model-family-*.test.mjs`. `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs` exists (named in
agent-obligations section 4) but was not checked against R4-1.

**Protected?** Not determined.

**Open questions**
- Reason-code vocabulary (SPEC says "a reason code", none listed).
- Where the preflight is surfaced (new script vs extension of an existing preflight).
- Which validator is "the package/close validator" for R4-2.

## 5. R5 - `--answers-file`

**Contract**
- ACC:52 (AC-30): "`--answers-file`; language asked once".
- SPEC:1836-1837: "`--answers-file` (with digest) is available wherever `--answers-json` is. Intake reuses the
  onboarding-confirmed language."
- R5-3 SPEC:1856-1857: "A 30 KB answers file is accepted on Windows, and the language is asked once."
- TRC:108, 109 (K5-5, K5-6 -> R5-3).

**Nearest existing seam:** not searched in this slice. Earlier reconciliation (line 41): no `--answers-file` code.
The existing `--answers-json` flag is the named counterpart; its location was not looked up.

**Protected?** Not determined.

**Open questions**
- Digest algorithm and where the digest is recorded.
- Whether "wherever `--answers-json` is" includes onboarding as well as the design course.
- Failure behaviour for a missing or unreadable file (not stated).

## 6. R6 - Audit index and continuity-digest drift (AC-31)

**Contract**
- ACC:53: "continuity digest drift surfaced; ... generated audit index".
- SPEC:1887-1888: "`inspect` compares the continuity PRD/Spec digests with the checkout and surfaces drift as an open
  recovery."
- SPEC:1897-1898: "A generated per-change audit index lists source, commit and gate digests and names missing steps
  explicitly."
- R6-2 SPEC:1905: "A continuity digest drift fixture is reported by `inspect`." R6-4 SPEC:1908-1909: "An audit index is
  generated for a fixture change with one deliberately missing gate." TRC:128, 130 (K8-2 -> R6-2, K8-4 -> R6-4).

**Nearest existing seam:** not searched in this slice. Earlier reconciliation (line 42): `runner-transcript-recovery.test.mjs`
exists; no audit-index or continuity-digest code. The `inspect` verb's module was not located.

**Protected?** Not determined.

**Open questions**
- Which `inspect` verb is meant (module not located).
- Output location and format of the audit index (SPEC states contents only).
- What "open recovery" entry shape a drift produces.

## Open-question count

AC-6: 4 - AC-33: 5 - AC-34: 3 - R4-1/R4-2: 3 - R5: 3 - R6: 3. Total 21.

## Not reached

Seam search for sections 3 to 6 (AC-34, R4, R5, R6) and their protected-list classification.
