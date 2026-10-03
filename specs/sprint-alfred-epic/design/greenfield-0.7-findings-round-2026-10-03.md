# 0.7.0 findings round — 2026-10-03 (design input)

Status: **design input, unapproved.** This register consolidates every finding
of the 2026-10-03 round into clusters for the next Alfred design revision. It
records sources and code-verification status only. It grants no implementation
authority and is no acceptance evidence.

## Sources

| Key | Source |
|---|---|
| PO | PO observations after the three-runner greenfield tests (local mini HTML game), 2026-10-03 |
| C | Claude/Windows greenfield analysis (`pipeline-analyse-greenfield.md` of the Claude test repo; local copy not tracked) |
| A | Antigravity greenfield analysis (local copy `scratch/pipeline-analyse-greenfield_agy.md`, ignored) |
| X | Codex greenfield analysis (local copy `scratch/pipeline-analyse-greenfield_codx.md`, ignored) |
| S | Defects hit live in the Agent-Pipeline Claude/Windows session of 2026-10-03 |

All three runners stopped in `design`/`draft` before plan approval and wrote no
product code. The installed candidate was `0.7.0+<runner>.20261003105506.1bd1d7bf`.

**PO constraints for this round:**

- All findings are verified against the source before a fix is designed,
  because the reports may contain false positives.
- Hard requirement: on the happy path all three runners complete onboarding,
  design, Advisor, plan approval, implementation and push, with exactly two PO
  approvals.
- The result is a new stamped local 0.7.0 candidate for PO testing.

## PO decisions (2026-10-03, chat)

- **Scope:** the findings round is folded into the **complete Alfred package**
  (all tracks A–E, the 2026-09-27/28 greenfield remediation slices, the
  recovery-availability amendment and the model-family automation requirement).
  The PO explicitly chose this over a findings-only or findings-plus-recovery
  candidate.
- **Design-round route:** the Alfred design course in this repository hits root
  cause 1 itself (for example `continuity-cas` refused in draft). Each blocked
  lifecycle step is passed with a **targeted human-guard override** (signature
  mode). Before each step the tree is frozen so that no drift burns the
  signature. The gate mode is not changed.
- **Mini-patch option (PO, later the same day):** if a bounded mini patch fits
  better, the Elephant may switch to it at any time. That patch would fix the
  design-phase blockers via an attended external script, be freshly stamped and
  installed by the PO, and then the design course resumes on the patched
  candidate.

- **Route switch (PO, later the same day):** continuing in a WSL/Linux
  session was rejected. The mini-patch route (B) is taken: an operator hotfix
  of the installed `guard-dispatch-budget.mjs` for native Windows (K3-9),
  authored by a recorded `general-purpose` self-dispatch fallback into
  `scratch/`, tested and applied by the PO. The authoring-dispatch
  registration uses a targeted override. The source fix follows through the
  lifecycle (Spec §21.4 R4-4).
- **Redesign direction (PO, later the same day):** the design-course and
  onboarding-driver code (the continuity/CAS-based coordination, Codex-centric
  Advisor acceptance, multi-step authoring registration) appears too complex
  and error-prone. A redesign of the design run and the driver is a legitimate
  option for this round, rather than patching each refusal. Live evidence the
  same day:
  - Registering the stage-0 authoring dispatch requires hand-building a full
    continuity state for `continuity-cas`.
  - `reopen-design` loops (K1-8).
  - On native Windows every role the course needs (Advisor, readiness, Critic,
    Goldfish) is blocked by the budget lock (K3-9).

## Verification summary (2026-10-03)

Five read-only source verifications ran against HEAD `a0d83ce78`, whose code is
identical to the installed `1bd1d7bf` candidate. They read only and ran nothing,
except for K2-1, which was additionally measured live. Results:

- **Confirmed (23):** K1-1, K1-2, K1-5, K1-7, K2-1…K2-4, K3-2, K3-3, K3-8,
  K4-2, K4-4, K4-5, K5-3, K5-4, K5-5, K6-1, K7-1, K7-2, K7-4, K7-5, K8-1.
- **Partially (15):** K1-3, K1-4, K1-6, K2-5, K3-1, K3-4, K3-5, K3-6, K4-1, K4-3,
  K5-2, K5-6, K7-3, K8-2, K8-3. The mechanism is real, but the finding's wording
  is too broad or names the wrong cause.
- **Not determinable from source (1):** K7-8.
- **Corrected false-positive aspects:**
  - K4-1: a new request digest per denial is expected. The signature is lost
    through consume-time drift.
  - K3-6: no briefing-file binding exists. The real gap is that nothing binds the
    sent prompt.
  - K2-5: the plugin contains no absence wording. Its texts misattribute causes
    instead.
  - K8-3: Verify is enforced at the design→implementation boundary.
  - Several report line references were off. In those cases the behavior was
    confirmed at other lines.

**Dominant root causes:**

1. **Closed exact-string admission of lifecycle commands.** Every Pipeline
   script call outside a closed allowlist is "opaque execution" in draft. The
   allowlist and the emitted `nextAction`s drifted apart (K1-x, K1-1/2/3/5/6,
   K4-3, K7-1).
2. **Fail-whole read policy.** One unhealthy auxiliary root or a non-file
   argument refuses the whole read, with narrow Grep/Glob shapes (K2-1…K2-4).
3. **Signature-mode ceremonies.** There are too many ceremony kinds, and any
   working-tree change consumes an armed override (K4-1/2/4, K4-6b, K6-1).
4. **Runner parity.** Antigravity routes default to `unavailable`, its
   subagents are paralysed and its lock goes stale. Codex host commit needs
   exact markers. Claude's built-in agents are rejected (K3-3/4/5/8, K7-4/5).
5. **Design-course contract drift.** Docs, generated short forms and trailer
   grammar disagree with the code (K5-2…K5-6).

## Clusters

Verification column: `pending`, `confirmed`, `partially`, `false-positive`,
`not-reproducible`, each with a code reference once checked.

### K1 — Draft-phase admission blocks the design course itself

Item: `backlog/items/2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K1-1 | `continuity-cas` (authoring-dispatch registration) refused in draft/awaiting-approval | C V-1 | **confirmed**: `design-course-session.mjs:221` emits `authoring-dispatch-required`; `sanctionedPipelineStateArgs` (`guard-lifecycle-ready.mjs:4831-4931,5266-5267`) admits no `continuity-*`; unsanctioned `node` → `opaque-script-execution` with `forceLifecycleGate` (`:1734-1738`, `lib/guard-devplan-policy.mjs:435,458`) |
| K1-2 | `integrate-final` refused; `submit-plan` busy while dispatch registered | C V-4 | **confirmed**: `lib/plan-spec-state-v2.mjs:708-709` (`PLAN-SUBMIT-CONTINUITY-BUSY`); `continuity-integrate-final` (`pipeline-state.mjs:2640`) not admitted |
| K1-3 | `cancel-submitted-plan`, direct Advisor producer refused | C §5, V-2 | **partially**: `cancel-submitted-plan` admitted only for exact argv (`guard-lifecycle-ready.mjs:4864-4868`); Advisor `design-course-session` admitted only with submission + `queueHead.dispatch` id (`:5146-5213`), which K1-1 cannot register |
| K1-4 | Onboarding scaffold commit refused in draft; `resolveV3DutyRoute` reads `HEAD:pipeline.user.yaml` (circular) | C V-6, A B6, X loops | **partially (mechanism confirmed)**: commit hook runs every staged path through the dev-plan gate (`lib/guard-devplan-policy.mjs:582-666`, `scripts/commit-msg-hook-install.mjs:290-299`); exempt prefixes only `docs/ specs/ .claude/ backlog/ scratch/` (`:238`); `lib/critic-route-v3.mjs:37` reads `HEAD:pipeline.user.yaml` |
| K1-5 | Read-only `node scratch/*.mjs` refused (`opaque-script-execution`) | C V-8, A B1, S | **confirmed**: `guard-lifecycle-ready.mjs:1789-1815,1736-1738`; `forceLifecycleGate` disables the scratch allowance (`lib/guard-devplan-policy.mjs:324-325,435`); claimed line refs in A were wrong, behavior right |
| K1-6 | Checker prescribed by F6 recovery refused; governed F6 repair (`governance/`) refused | S | **partially**: only the absolute-path, zero-arg spelling is admitted (`guard-lifecycle-ready.mjs:5244`); the relative spelling is opaque; `governance/` edits blocked in draft (`lib/guard-devplan-policy.mjs:238,435-458`) |
| K1-7 | `git stash list` classified as working-tree write; wrong `File:` operand in denials | S | **confirmed**: `lib/protected-test-paths.mjs:151-154,808,827-830` (`stash` is a write verb, operands become path candidates); read-only git list lacks `stash` (`guard-lifecycle-ready.mjs:3455`) |
| K1-x | Cross-cutting root cause: every unsanctioned `node <script>` gets `forceLifecycleGate`; only exact-string closed-argv entries in `sanctionedLifecycleScriptArgs` (`guard-lifecycle-ready.mjs:5217-5291`) pass; inspect guidance and allowlist evolved independently | — | **confirmed**; consistency test between emitted `nextAction`s and the allowlist proposed |

### K2 — Read admission and denial texts

Items: `…-claude-windows-guard-refuses-every-in-repo-read.md`, `…-read-blocks-and-misleading-denial-texts-across-runners.md`, `…-advertised-git-to-head-pipeline-is-refused.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K2-1 | Every in-repo read refused: session roots derived with JS `realpathSync`, re-checked with `realpathSync.native`, case-sensitive equality | S | **confirmed by probe** (`scratch/read-guard-probe.mjs`), code path `lib/passive-read-policy.mjs` additional-root loop |
| K2-1b | Fix scope for K2-1: every lane passing extra roots (native Read/Grep/Glob, Bash pipelines, chains, grammar `approvedReadPath`) funnels into `isAllowedPassiveReadTarget` | — | **confirmed**: single fix point `lib/passive-read-policy.mjs:156-177`, or derive roots with `realpathSync.native` in `sessionReadScopeRoots` (`guard-lifecycle-ready.mjs:2193-2208`) |
| K2-2 | WSL UNC paths refused for Read | S | **confirmed**: win32 `userVisibleHostPath` requires `^[a-z]:[\\/]` (`passive-read-policy.mjs:38,184-185`) |
| K2-3 | Grep with `glob` filter always refused; Grep on in-repo directory refused; Glob `*` refused | S | **confirmed**: `guard-lifecycle-ready.mjs:6500,6520` (selector must be undefined), `:6509-6511` (exact file or plugin dir only), `:6414-6423` (Glob wildcard only with fixed extension list) |
| K2-4 | `git … \| head -n N` refused although advertised | S | **confirmed**: `isBoundedGitPipeline` (`guard-lifecycle-ready.mjs:2868-2896`) checks every arg as a filesystem path; `HEAD:docs/state.md` or `HEAD~3` fail `stat` (`passive-read-policy.mjs:193-197`); un-piped form skips the arg check (`:3441-3443`) |
| K2-5 | Denial/fallback texts say "not present" instead of "blocked" | PO | **partially**: no plugin text conflates refusal with absence; misleading cause texts exist (`GUARD-READ-SCOPE-OUTSIDE-ROOT` for in-repo `rg --glob`/`-A`/`-B`; `APB-DISPATCH-INVALID` for a role-name regex). Absence wording likely produced by runners/agents after a refusal (not determinable from source) |
| K2-6 | Transcript directory unreadable for forensics (`ls`/`Glob`) | C V-8, X | pending |

### K3 — Role routes, native hosts and fallback

Items: `…-role-route-preflight-with-self-dispatch-fallback.md`, `…-agy-driver-dispatch-and-design-routes-incomplete.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K3-1 | Advisor producer fails with `producer-output-invalid`, stderr swallowed | C V-2 | **partially**: non-JSON stdout → `producer-output-invalid`; result carries only `stderrBytes`, never the text (`design-course-session.mjs:309-321,347-351`) |
| K3-2 | Free Advisor consult not accepted by formal course (duplicate work) | C V-11, PO | **confirmed**: Advisor stage hard-bound to `design-advisory-coordinator.mjs` (`design-course-session.mjs:116,293`); no import route for a consult; `answered` additionally requires `runner === "codex"` (`:354-371`) |
| K3-3 | AGY `readiness`/`critic_normal` routes generated `unavailable` for profile `feature` | A B4, PO | **confirmed (defaults and stop)**: `config/runner-profiles-v3.json:101-102,133-134,426-427` (antigravity `unavailable`); `runner-design-readiness-bootstrap.mjs:285-291` stops |
| K3-4 | AGY native subagents inherit `requires-bootstrap.pending` and are paralysed | A B2, PO | **partially**: marker per native session id denies Bash/Edit/Write (`hooks/antigravity-pretool-guard.mjs:502-514`); it is cleared only by an exact read of the pipeline-start `SKILL.md` (`:509-510`), which no subagent briefing tells it to do |
| K3-5 | Codex native host binding/host commit missing after design dispatch | X P0 | **partially**: host commit requires `spawn_agent` with `tool_use_id`/`session_id`, a v1/v2 marker in the prompt, role goldfish-implementor or goldfish-mechanic and `worker` type (`lib/native-goldfish-host-state.mjs:119-131`, `lib/native-goldfish-host-return.mjs:23-26,64-66`); an unmarked or other-role dispatch silently yields `NGHS-NOT-APPLICABLE` |
| K3-6 | Dispatch guard demands inline briefing; route digest binds briefing file | C V-10 | **partially**: inline requirement confirmed (`lib/dispatch-policy.mjs:200-207`); the route digest hashes only the structured request (`lib/workflow-writer-preflight.mjs:25-34,181-186`), not a briefing file, and nothing links it to the sent prompt |
| K3-8 | Dispatch guard rejects built-in `Explore`/`Plan` agent types with a misleading Advisor message | S | **confirmed**: `lib/advisor-prohibition-binding.mjs:23-27,54` |
| K3-10 | The Advisor course store refuses its private directory/files on native Windows because `(lstat.mode & 0o077) !== 0` is always true there (`DACS-PRIVATE-DIRECTORY`); the same POSIX mode-bit pattern appears in about 30 production files | C V-2, S | **confirmed live** (producer stderr `DESIGN-ADVISORY-COORDINATOR-FAILED: error: DACS-PRIVATE-DIRECTORY`; `lib/design-advisor-course-store.mjs:17,33`) |
| K3-11 | A `consult-advisor` dispatch whose briefing names no tool budget passes the pre-launch dispatch check, then every tool call is refused with `DISPATCH-BUDGET-INPUT-INVALID (base-calls-must-be-a-positive-safe-integer)`. The dispatch is bricked instead of refused before launch (as Goldfish briefings are, `DBB-BASE-CAP-MISSING`) | S | **confirmed live** 2026-10-03 |
| K3-9 | On native Windows every budget-counted Pipeline subagent tool call is refused (`counter-lock-owner-ambiguous`); subagent also lacks the bootstrap-receipt step | S | **confirmed**: `hooks/guard-dispatch-budget.mjs:420-433,499-512` require `process.platform === "linux"` and `/proc`; item `2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows.md`. **Blocks every Goldfish/Critic dispatch on this Windows host.** Operator hotfix of the installed copy applied by the PO 2026-10-03 (receipt `d1b11ad9…` → `f28f2604…`, 10/10 hotfix tests green); a `pipeline-core:goldfish-mechanic` probe then completed preflight, Read, Bash and Write without budget or receipt denial. Source fix still pending (R4-4) |
| K3-7 | Requirement: route preflight plus recorded self-dispatch fallback | PO | requirement |

### K4 — Human authorization ceremonies

Items: `…-three-runner-happy-path-with-two-po-approvals.md`, `…-signature-ceremony-requires-operator-work-and-breaks.md`, `…-guard-override-request-digest-drifts-after-arming.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K4-1 | Override request digest changes after arming; signature burnt | C V-3, X HGO-DRIFT | **partially (mechanism confirmed, cause refined)**: `toolInputSha256` is stable; the request digest includes `createdAt`/`expiresAt`, so a new digest per denial is expected (`lib/human-guard-override.mjs:3111-3135`). The real loss is at consume: drift on `repository` (`statusSha256` over all untracked files, State sha, head/tree), `plugin` or `policy` audits `HGO-DRIFT` and refuses (`:4174-4210,920-945`). Any session write between arming and retry burns the signature. Suspect: "remains available" footer not stripped (`:1324-1328` vs `guard-lifecycle-ready.mjs:993`) |
| K4-2 | Signing intent fails on unborn HEAD | A §5.2, X | **confirmed**: `head:null` (`lib/human-guard-override.mjs:941`) → `createPoApprovalIntent` requires a commit OID (`lib/po-approval-proof.mjs:18,35`) → `HGO-SIGNATURE-INTENT-INVALID` (`lib/human-guard-override.mjs:3535-3549,3838`) |
| K4-3 | PO runs prepare/refreeze/diagnosis and JSON copy-back | X, C §4 | **partially**: by descriptor only `sign-intent` is human-only (`lib/human-guard-override.mjs:3170-3211,3560-3593`); the agent could not run the rest because the lifecycle guard refuses its own `guard-human-override.mjs` call and tells the human to run it (guard scope, same root as K1-x); `refreeze-plan` declares no boundary |
| K4-4 | Multi-line PO commands break in terminals | A §5.2 | **confirmed**: backslash continuation in `variableBoundCopyCommand` (`lib/project-onboarding-v3.mjs:2406-2473`, `:2443`), used by the design-workflow sign action (`:2773-2789`) |
| K4-5 | Signed config override undone by registry projection/migration | A B5 | **confirmed**: routes must equal the Core registry (`lib/runner-profiles-v3.mjs:338-339`); refresh replaces Core-owned surfaces (`lib/runner-profile-migration-v3.mjs:483-490,534-541`); no user override layer found |
| K4-9 | `toolInputSha256` covers the runner-cosmetic Bash `description` field, so a byte-identical command with a different description silently misses the armed capability and looks like a fresh denial | S | **confirmed live** (`7b6920c9…` vs `0486dd4a…`; identical description then consumed it) |
| K4-8 | Human-guard-override plan reports the installed Claude marketplace copy as `0.7.0+codex.20261003105506.1bd1d7bf`, while the preflight reports `0.7.0+claude.…`: runner label drift in the HGO plugin identity | S | **observed live** 2026-10-03; cause not yet located |
| K4-7 | Intermediate design-phase mutations (`reopen-design` after a source change, PO-profile receipt repair before `submit-plan`) are emitted with `requiresConfirmation: true` and need a PO confirmation. PO rule: on a design the PO gives exactly one final approval (signature or chat per mode); everything before it is agent work | PO, S | **confirmed live** (`pipeline-state inspect` nextAction `reopen-design … requiresConfirmation: true`; `submit-plan` blocked by `PO-PROFILE-RECEIPT-STALE`) |
| K1-8 | `reopen-design` emitted for `PLAN-LIFECYCLE-DIGEST-DRIFT` is a no-op loop: it appends a duplicate `phaseHistory` entry carrying the previous timestamp, the lifecycle stays `DIGEST-DRIFT`, and `inspect` emits `reopen-design` again (explains five identical 2026-09-27 entries) | S | **confirmed live** 2026-10-03 (`phaseHistory` grew by one `2026-10-03T11:29:06.577Z` duplicate); the drift is only resolvable through a new `submit-plan`, which was itself blocked by `PO-PROFILE-RECEIPT-STALE` |
| K4-6b | Current happy path has up to eight PO ceremony kinds in signature mode (key setup, onboarding kickoff/promotion confirmations, bootstrap plan acknowledgement, design-workflow package signature, plan approval, push approval, conditional guard overrides) | — | **confirmed from source** (not run end to end); see verification report for producing scripts |
| K4-6 | Requirement: two approvals on the happy path, three runners | PO | requirement |

### K5 — Design course flow and contracts

Items: `…-greenfield-design-course-cost-and-proportionality.md` (2026-09-29), `…-installed-design-trailer-example-is-rejected-by-git-guard.md` (2026-09-27), `…-claude-windows-greenfield-lifecycle-not-walkable.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K5-1 | Input → presented design too long and complicated | PO, all reports | requirement |
| K5-2 | Documented order contradicts `inspect` (authoring dispatch, `design.md`/`traceability.md` appear only after `submit-plan`) | C V-5, X P1 | **partially**: code confirmed (`design-course-session.mjs:206-228` requires stage-0 `authoringDispatchId` from `continuity.queueHead`, five `plannedSources`); `design-course.md:6` does name design/traceability but never the authoring dispatch; `intake-generate-design.md:102-112` has the agent hand-author PRD/Spec |
| K5-3 | EL-16 full text vs bootstrap short form disagree on Elephant design authorship | C V-5, X P1 | **confirmed**: `roles/elephant.md:59-61` (design-phase exemption, "execution phase only") vs `skills/pipeline-start/SKILL.md:247-250` (exemption dropped) |
| K5-4 | `Dispatch: design (elephant)` documented, rejected by commit policy | A B7, X P0, S handover | **confirmed**: `lib/commit-message-policy.mjs:85,88-94,175` admits only goldfish/critic/elephant-generated, `stage-0 (elephant)`, quality-package; design form printed at `harness/scripts/generate-agent-obligations.mjs:266` and both `agent-obligations.md:176` copies |
| K5-5 | `--answers-json` breaks around 10 KB; no `--answers-file` | C V-9 | **confirmed**: `scripts/project-onboarding-v3.mjs:404` inline only; `--text-file` exists only for intake capture (`:401-402`) |
| K5-6 | Language asked twice | C V-12 | **partially**: intake `needsLanguage` when no intake language recorded (`lib/project-onboarding-v3.mjs:2583-2586`); onboarding language only surfaces as `reviewedDefaults.language` with `requiresConfirmation: true`, contradicting onboarding guidance "reuses this language" (`:6642-6651`) |

### K6 — Push gate

Item: `…-feature-branch-push-admitted-without-signature-approval.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K6-1 | Feature-branch push admitted without signature in signature mode | PO | **confirmed as designed behavior that conflicts with the new PO requirement**: `a0d83ce78` carries `Checkpoint-Intent:`; `classifyPushDestination` (`lib/push-destination-policy.mjs:61-80`) classifies same-ref pushes under `refs/heads/feat/` as `feature-checkpoint`; `guard-push.mjs:1948-2019` admits after clean tree/HEAD/trailer/architecture checks with no approval or signature; pre-push hook mirrors it (`scripts/pre-push-hook-install.mjs:329-347,402-412`). Protected-lane pushes do require an exact-commit approval plus signature (`guard-push.mjs:2301-2335,2414-2451`). Further: pre-push hook does not verify the Ed25519 proof (header `:230-241`) |
| K6-2 | Pre-push hook absent on clean clone (`UNBACKED GATE`) | S | confirmed by onboarding inspect output |
| K6-3 | Requirement: slim non-release push to the approval alone; release keeps full chain | PO | requirement |

### K7 — Session and bootstrap robustness

Items: `…-draft-phase-guard-blocks-mandatory-bootstrap-preflight.md`, `…-session-readiness-drops-to-partial-after-bootstrap-ready.md`, `…-claude-session-start-emits-codex-transcript-recovery-hint.md`, `…-handover-doc-committed-without-governance-classification.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K7-1 | Preflight admission depends on path spelling (backslash admitted; forward slash and skill's `${PIPELINE_PLUGIN_ROOT}` refused) | S, C V-7 | **confirmed**: strict string equality with native `START_PREFLIGHT_SCRIPT` (`guard-lifecycle-ready.mjs:250,5077-5097,5240`); no normalisation; `$` tokens rejected as expansions (`guard-command-grammar.mjs:79-82,150`) |
| K7-2 | `hook-provisioning-required` undocumented in `pipeline-start` skill | S | **confirmed**: `skills/pipeline-start/SKILL.md:22-23,34` vs `scripts/pipeline-start-preflight.mjs:1547` |
| K7-3 | Readiness drops to `partial` after a ready bootstrap; needs undocumented `--intent session` | S | **partially**: preflight readiness uses `intent: "bootstrap"` (`pipeline-start-preflight.mjs:1422`), the guard gates every call on `intent: "session"` (`guard-lifecycle-ready.mjs:6089-6097`); which `partial` branch fires is not determined |
| K7-4 | AGY bootstrap lock mtime not refreshed on `already-armed`; 30-min window | A B3 | **confirmed**: `hooks/antigravity-bootstrap-lock.mjs:15-17` writes nothing on `already-armed`; preflight requires mtime ≤ 30 min (`pipeline-start-preflight.mjs:422,514-526`) |
| K7-5 | Claude SessionStart wires a Codex transcript hint (`--runner codex`) | S | **confirmed**: `hooks/hooks.json:190,206`; `hooks/codex-session-start-hint.mjs:146` defaults `runner = "codex"`, callers pass none (`:237,251`) |
| K7-6 | Handover doc committed unclassified → F6 at next bootstrap (recurring) | S | confirmed (checker output) |
| K7-7 | `docs/state.md` projection stale after design progress | C V-13 | pending |
| K7-8 | PO profile receipt `invalid` on a freshly reset clone | S | **not determinable from source**: writer is `setup.mjs:1357`; the plugin-side check was not located; a live probe needs the check's failure code |

### K8 — Forensics and audit chain

Item: `…-forensics-and-audit-evidence-not-reconstructable.md`

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K8-1 | Transcript reader fails on multi-segment sessions | X P0 | **confirmed**: `scripts/runner-transcript-recovery.mjs:186-193,296-297` requires exactly one file per session id (fail-closed by comment `:283-286`); Codex only, Claude/Antigravity get `runner-transcript-source-unavailable` (`:177`) |
| K8-2 | Continuity source digests drift from checkout without surfaced recovery | X P1 | **partially**: `inspect` compares working-tree plan files to submission/approval (`pipeline-state.mjs:3983-3992`, `lib/plan-spec-state-v2.mjs:612-613`); no inspect-side comparison of `continuity.authority` PRD/Spec digests found (digest checks only in rebind/migration/bootstrap commands, `pipeline-state.mjs:4838-4844,5006`) |
| K8-3 | `verify: null` in greenfield; no Verify contract fixed during design | X P2, C E17 | **partially**: `verify: null` written (`lib/project-onboarding-v3.mjs:1159,1453`), but enforced at design→implementation by `checkVerifyContractConfigured` `collect-input` (`:3080-3081,6464-6483`); design course itself does not require it (`design-course.md:7-9`) |
| K8-4 | No generated per-change audit index | X P2, C E26, A §6.2 | requirement |
| K8-5 | Tracked Alfred artifacts contain a host-specific absolute user path (`specs/sprint-alfred-epic/plans/a1-enforcement-conformance.md:111`, `specs/sprint-alfred-epic/evidence/a5-lifecycle-evidence-closure.md:69,79`) | S | **confirmed** by in-repo scan; sanitize forward (no history rewrite) and add a pre-commit host-path check |
| K2-6b | `rg -e <pattern>` operands and slash-containing search patterns are evaluated as read paths (`GUARD-READ-SCOPE-OUTSIDE-ROOT`) | S | **confirmed live**; same root as K2-4 (arguments classified as filesystem paths) |

### K9 — Agent-side and classification findings from the reports

Item: carried in Spec §21.5 (briefing/obligation quality) unless noted.

| ID | Finding | Sources | Verification |
|---|---|---|---|
| K9-1 | A Goldfish read a derived (wrong) role path. Briefings must carry verified exact paths, checked before dispatch | X loops | agent error; mitigation = dispatch preflight path check (R4 route preflight) |
| K9-2 | The bootstrap commit had 3 files/103 lines, exceeding the ordinary stage-0 bound (2 files/25 lines). Whether an onboarding exception applies is undecided | X §Rollen | classification question; resolve with K1-4 (scaffold commits) |
| K9-3 | A private first name was written into a PRD (E24). The private-identifier pre-commit check did not stop it in the test repo | C E24 | agent error plus a check gap; verify the existing private-identifier pre-commit check covers consumer specs |
| K9-4 | An analysis subagent stopped on a composed shell command; briefings must state the closed grammar | X loops, S | covered by generated obligations; verify that the briefing templates include them |
| K9-5 | Antigravity transcripts carry no usage fields, so token accounting is only estimable | A §2.3 | host limitation; R6 reports usage only where supplied |

## Report coverage (every finding of the three reports → register row)

### Claude/Windows report

| Report finding | Register |
|---|---|
| V-1 design course not completable without override (`continuity-cas` refused) | K1-1, K1-x |
| V-2 Advisor producer fails silently | K3-1 (root cause found 2026-10-03: POSIX mode-bit check `DACS-PRIVATE-DIRECTORY`, K3-10) |
| V-3 override digest changes after arming, signature burnt | K4-1, K4-9 |
| V-4 `submit-plan` busy while dispatch registered; `integrate-final` refused | K1-2 |
| V-5 contradictory course order; EL-16 vs intake authoring | K5-2, K5-3 |
| V-6 scaffold commit refused in draft | K1-4 |
| V-7 preflight forward slash vs backslash | K7-1 |
| V-8 `scratch/` analysis scripts and transcript reads blocked | K1-5, K2-6 |
| V-9 `--answers-json` length limit | K5-5 |
| V-10 inline briefing vs file-bound digest | K3-6 |
| V-11 duplicate Advisor work (consult not accepted) | K3-2 |
| V-12 language asked twice | K5-6 |
| V-13 `docs/state.md` projection stale | K7-7 |
| V-14 context growth from searching the plugin source | K5-1 (consequence of V-1/V-5) |
| E6/E7 ADRs not created (draft lock) | K1-4/K1-x (draft write admission), K5-2 |
| E8 no PO architecture-adoption disposition asked | K5-2 (course sequence must emit it) |
| E11/E18 Critic required (T3) but never dispatched | K3-9 (Windows subagents blocked), K3-7 |
| E24 private first name in PRD | K9-3 |
| E25 signature friction (external terminal, JSON copy-back, 30-min window) | K4-3, K4-4 |
| E26 evidence package not reconstructable | K8-4 |
| §4 freigaben rows 5/6 (two override signatures) | K4-6, K4-6b |

### Antigravity report

| Report finding | Register |
|---|---|
| Befund 1: circular refusal of scripts in draft/awaiting-approval | K1-5, K1-x |
| Befund 2: subagent bootstrap deadlock (`requires-bootstrap.pending`) | K3-4 |
| Befund 3: stale bootstrap lock after resume (30-min mtime) | K7-4 |
| Befund 4: mandatory roles `unavailable` for profile `feature` | K3-3 |
| Befund 5: signed override undone by registry projection | K4-5 |
| Befund 6: scaffold-commit circularity (HEAD-read config) | K1-4 |
| Befund 7: `Dispatch: design (elephant)` rejected | K5-4 |
| §5.2(1) unborn HEAD breaks signing intent | K4-2 |
| §5.2(2) multi-line commands break in terminal | K4-4 |
| §5.2(3) window switching, path resolution, JSON copy-back | K4-3 |
| §6.5 Advisor never reached (stage-0 authoring blocked) | K1-1, K3-3 |
| §2.3 no usage fields in transcripts | K9-5 |
| §8.2 priorities 1–8 | identical to Befund 1–7 plus §5.2 above |
| E15 resume blocked by stale lock | K7-4 |
| E25 signature mode not wrap-safe | K4-4 |

### Codex report

| Report finding | Register |
|---|---|
| Method: session directory scan refused, transcript reader `requested-session-unavailable` | K2-6, K8-1 |
| P0 no coherent candidate commit/plan approval; needs full greenfield acceptance test | K4-6 (three-runner end-to-end requirement) |
| P0 `design(elephant)` trailer rejected | K5-4 |
| P0 native host binding/host commit missing | K3-5 |
| P0 session evaluation fails at the official reader | K8-1 |
| P1 continuity PRD/Spec digests differ from checkout | K8-2 |
| P1 five design sources incomplete / design+traceability not admitted | K5-2 |
| P1 EL-16 short form contradicts full text | K5-3 |
| P1 PO ran recovery commands; stale request drift | K4-3, K4-1 |
| P2 `verify: null`, no product test contract | K8-3 |
| P2 audit index must be hand-assembled | K8-4 |
| Loops: signing intent not buildable (unborn HEAD) ×2 | K4-2 |
| Loops: refreeze with stale request (`HGO-DRIFT`) | K4-1 |
| Loops: scaffolding commit refused | K1-4 |
| Loops: two one-off HGO authorizations (model run/choice) | K4-6b |
| Loops: first Goldfish read a wrong role path | K9-1 |
| Loops: host commit absent; diagnose → same refusal | K3-5 |
| Loops: external directory diagnosis by the PO | K4-3 |
| Loops: forensic subagent stopped on composed command | K9-4 |
| Bootstrap commit size vs stage-0 bound | K9-2 |

## Next steps

1. Verify every `pending` row against the source at HEAD and record the
   verdict with file:line here.
2. Fold confirmed clusters into the Alfred PRD/Spec as the next revision's
   scope. Run the design course (Advisor, readiness), `submit-plan`, and get the
   single PO plan approval.
3. Implement through Goldfish dispatches, then Verify, security and an
   independent Critic. Stamp a new local 0.7.0 candidate for PO testing.
