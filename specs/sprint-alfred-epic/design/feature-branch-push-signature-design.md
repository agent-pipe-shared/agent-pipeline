# PUSHSIG design: in `signature` mode every push needs a commit-bound signature; feature branches keep a slim prerequisite set

Status: design only, uncommitted. Candidate commit `7193ccabd`. Backlog item:
`backlog/items/2026-10-03-feature-branch-push-admitted-without-signature-approval.md`.
Prior research (not redone): `specs/sprint-alfred-epic/evidence/push-route-2026-10-05.md`.
All paths repo-relative; `<plugin-root>` = `plugins/pipeline-core`. `path:line` refs are as of the candidate commit.
independent review: pending.

PO decisions honoured (verbatim): "ein push im signature modus soll immer eine signatur brauchen nicht nur auf main" and
"full verify braucht es auf den branch nicht! aber eine signatur dann nach fix, so lang der fix nicht da ist können wir so pushen".
Both can be met together; no conflict found.

## 0. Design in ten lines

1. Keep the `feature-checkpoint` lane (destination class) and its eligibility checks; add ONE prerequisite in `signature` mode only: a current approval.
2. The approval is the existing kind `push` with the existing subject `{sourceCommit, remote, destination, threatModel}`. No new kind, no new subject field, no new ceremony.
3. Verification reuses `authorizeRecordedPush` unchanged, behind one new shared module `lib/checkpoint-push-approval.mjs`, called by BOTH the in-session guard and the pre-push hook (single source of truth, no drift).
4. No Verify / security / Critic evidence is read anywhere on this path; protected/main/release/tag lanes are byte-for-byte unchanged.
5. `chat` mode and `standing-approved` keep today's checkpoint behaviour (admitted without an approval). An unreadable policy resolves to `signature` (fail closed).
6. The PO's touch stays ONE attended `authorize-critical --kind push` command; `push-init --checkpoint` learns to print it (slim profile of `push-prepare`).
7. Hidden conflict found and resolved: `approve-push` rewrites the tracked state file, which the checkpoint clean-tree check refuses; the new module exempts exactly that one path (section 3.4).
8. The pre-push hook gets the same check (today it never verifies any proof); it needs reinstalling after the fix lands (snapshot digest changes).
9. Protected surface is small: only two existing assertions in `hooks/guard-push.test.mjs` (TP-5) must flip, plus one `harness/verify-suites.json` entry (TP-13); everything else is agent-writable. `pipeline-state.mjs` (PB-SANCTIONED-WRITER) is NOT touched.
10. Transition (PO decision) is automatic: the unsigned lane stays usable until the fixed plugin is installed and the hook reinstalled.

## 1. Current routes (evidence)

### 1.1 How the unsigned push was admitted (confirms the backlog item)

- Classification: `lib/push-destination-policy.mjs:61-80`. Verdict `feature-checkpoint` at `:79` requires manifest status ok (`:63`), valid policy (`:64`, grammar `:40-54`, namespace must end in `/` and sit under `refs/heads/feat/` `:18,:47,:52`), exact binding (`:65`), safe remote/refs (`:66-72`), destination inside namespace (`:73`), source ref == destination (`:76`). Anything else is `protected-publication` (`:14`).
- Guard lane branch: `hooks/guard-push.mjs:1999-2019`. It runs `checkpointEligibility` (`:1948-1976`: HEAD == pushed commit `:1950-1951`, `git status --porcelain` empty `:1952-1953`, exactly one bounded `Checkpoint-Intent` trailer `:1954-1960`, architecture currency `:1964-1965`, audit record `:1966-1974`), writes the local audit record (`:2011`) and calls `allowExit()` at `:2018`. That exit precedes EVERYTHING below it: verify evidence (`:2240`), security evidence (`:2246-2258`), the specs/docs/backlog uncommitted check (`:2261-2266`), anonymous-public check (`:2271`) and the whole approval block (`:2273-2452`). No state file is read on this lane.
- Explicit policy with the push gate off is refused (`:1984-1990`); a malformed policy is refused (`:1813-1818`). Unchanged.
- Hook mirror: `scripts/pre-push-hook-install.mjs` (the hook is a template string in this file). `checkpointFailure` `:329-347` (same four checks, no approval); `evaluateOneCommit` classifies at `:402-406` and returns early at `:408-412`, before evidence (`:418-426`) and approval (`:428-448`). The header states the hook deliberately does not mirror the Ed25519 chain (`:230-241`), and that `--no-verify` skips it (`:252-261`). Even its general-mode approval check (`:442-446`) compares `forCommit` and `destination` only: no signature, no remote.
- Existing tests that pin the unsigned behaviour: `hooks/guard-push.test.mjs:2299-2305` (`PG-CHECKPOINT allow ... without publication evidence or signature`, fixture `approval: "required"`), `:2328-2334` (`PG-CHECKPOINT-WORKTREE allow explicit clean attached -C source`), and `scripts/pre-push-hook-install.test.mjs:277-288`.
- Local observation (research + preflight): the pre-push hook is ABSENT on this Windows clone (`prePushHook.state: absent` in the bootstrap preflight; `push-route-2026-10-05.md:36`), so here only the in-session guard applies.

### 1.2 The protected lane's approval checks (what "signature" means today)

- State read `hooks/guard-push.mjs:2280-2290`; `forCommit == sourceCommit` `:2301-2308`; remote+destination binding `:2309-2335` (PUSHBIND-1); waiver `criticalProofWaiverFor(fallbackProjectDir(), "push")` `:2406` (unreadable policy => `required`, comment `:2400`); chat branch `:2407-2413`; signature branch `:2414-2452` calling `authorizeRecordedPush` `:2425-2436`; failure texts never interpolate the remote (SEC-01, `:2441-2447`).
- `authorizeRecordedPush`: `lib/critical-action-authorization.mjs:349-434`. Trust anchors from the governed root `:363`/`:167-173`; trust-on-first-use gated on the machine operator key `:371-374,:423-428`; record shape `:376-380`; commit `:386`; remote/destination `:387-389`; threat-model bytes still equal the signed digest `:393-396` (`boundArtifactDigest` `:104-117`); signature over an intent rebuilt from observed facts via `verifySignedAction` `:259-331` (expiry `:272`, subject digest `:276-286`, intent incl. `state.planApproval.poGateAuthority` plan/spec digests `:291-307`, anchor membership `:309-317`); proof must be in the consumption ledger `:411-415`.
- Bound subject: `{ sourceCommit, remote, destination, threatModel: {path, sha256} }` at `:400-405`, identical to `pipeline-state.mjs:11411` and `:11495`; threat model path is the fixed `project/push-threat-model.md` (`pipeline-state.mjs:735`); `docs/push-release-flow.md:238-247`.
- Main stays separate and untouched: raw Bash/Git cannot publish `refs/heads/main` (asserted by `guard-push.test.mjs:2306`).

### 1.3 What the human + agent chain requires today

- `approve-push` (`scripts/pipeline-state.mjs:11332-11597`) in signature mode takes `--by --remote --destination --proof-request --proof-authority --proof` (`:11348-11350`), verifies and consumes the proof (`:11493-11508`) and writes `pushApproval.lastApproved` + consumption entry (`:11523-11548`) with `pendingAuditWrite: true` (`:11541`). It reads NO Verify or security evidence (grep of that file for `verify-latest|security-latest` returns nothing). It needs the threat model (`:11477-11491`), a resolvable HEAD/tree (`:11383-11388,:11472-11476`) and the proof flags.
- `push-prepare.mjs` (`pushPrepareReport` `:571`) is the only place Verify/security evidence is demanded for the ceremony: `verify-evidence` `:606-610`, `security-evidence` `:608-610`, plus clean tree `:603`, threat model `:618`, proof policy/anchor `:623`, subject hash `:662-671`, active feature (plan/spec) `:673-678`, approval directory `:680-686`, default expiry now+1h `:688-689`, `authorize-critical` command `:691-701`, `approve-push` `:703-712`, `git push remote HEAD:destination` `:713-717`. Chat mode short-circuits to approve-push + push `:637-660`. It also folds a pending approval write into a commit first (`:595-599`, commit message `:560-565`).
- `push-init.mjs --checkpoint` (`:139-141`, dispatch `:318`) calls `driveCheckpointPushInit` (`:185-227`). Its header states it "does not produce or consume PO authority" (`:180-184`). It checks gate active, destination class, clean tree, intent trailer (`:196-210`) and prints only the exact `git -C <root> push <remote> <sourceRef>:<destination>` (`:212-217`); outcome `checkpoint-ready` (`:221`); exit codes accept `chat-ready|signature-required|checkpoint-ready` (`:474`). It never reads the approval mode.
- The PO's ceremony: `po-human-approval.mjs authorize-critical --kind push --subject-sha256 <h> --expires-at <t>` in an attended terminal (`docs/push-release-flow.md:151-236`, attended-terminal rule `:208-216`, clean incl. untracked `:229-232`). One command, type `approve`, one passphrase; this is unchanged.
- Checkpoint docs to rewrite: `docs/push-release-flow.md:90-117` (explicitly says the lane needs no `approve-push` or signature, `:107-111`). The identical section exists in the plugin-shipped copy `plugins/pipeline-core/docs/push-release-flow.md:90`.

## 2. Target behaviour

| Mode (`gates.push_approval` / waiver) | feature-checkpoint lane | protected / main / release / tag / force |
|---|---|---|
| `signature` (default; also: unreadable policy, any waiver `code != null`) | clean + exact HEAD + one `Checkpoint-Intent` + architecture currency (as today) AND a current Ed25519 `push` approval bound to commit, remote, destination, threat model, plan/spec authority; NO Verify/security/Critic evidence | unchanged: evidence + approval + signature (`guard-push.mjs:2023-2452`) |
| `chat` (waiver `mode` chat) | unchanged: no approval (today's behaviour) | unchanged |
| `standing-approved` | unchanged | unchanged |

Decision on `chat`: the PO sentence is scoped to `signature` mode and the briefing says "`chat` mode unchanged", so today's unsigned, unrecorded checkpoint behaviour stays for `chat`. Open question Q1 asks whether chat should at least require a recorded chat clearance.

Single-source mode rule (mirrors `guard-push.mjs:2274-2279,:2406-2414`): `signature` unless `pushGate.approval === "standing-approved"` or the waiver for kind `push` is genuinely waived with a null `code`. A policy-read fault answers `signature`.

## 3. Design

### 3.1 Why reuse `authorize-critical --kind push` unchanged (rejected alternatives)

- Reuse of kind `push` + the existing subject needs no change to `pipeline-state.mjs` (protected, PB-SANCTIONED-WRITER `protected-baseline.json:41-46`), to `lib/critical-action-approval-request.mjs` (digest), to `authorizeRecordedPush`, or to `project/critical-human-proof.json` (gate-strength, `hooks/guard-gate-strength.mjs:106`; `requiredKinds` already contains `push`).
- No cross-lane escalation: the protected lane keeps its evidence checks and treats the approval as necessary-not-sufficient (`guard-push.mjs:2307`), so a checkpoint-era approval can never publish anything the evidence chain would have refused. An approval authorizes exactly its commit, remote and ref.
- Rejected A: new kind `push-checkpoint`. Needs policy `requiredKinds` migration, new verifier path, new tests in protected files. Marginal gain.
- Rejected B: a `profile: "feature-checkpoint"` field inside the signed subject (so the confirmation could state "no Verify"). Touches four digest sites (`push-prepare`, `approve-push` `:11411/:11495`, `authorizeRecordedPush` `:400-405`, the new verifier) and protected `pipeline-state.mjs`. Recorded as an optional follow-up (Q4); the agent-side printout names the profile instead.

### 3.2 New module `plugins/pipeline-core/lib/checkpoint-push-approval.mjs` (new file, agent-writable)

Pure, injectable, no I/O beyond `git`/state reads passed in. Exports:

- `checkpointApprovalMode({ pushGate, waiver })` -> `"signature" | "chat" | "standing"`. `waiver` is the result of `criticalProofWaiverFor(root, "push")`. `standing` iff `pushGate.approval === "standing-approved"`; `chat` iff `waiver.waived === true && waiver.code == null`; otherwise `signature`.
- `checkCheckpointPushApproval({ projectDir, anchorDir, state, candidate: {commit, tree}, remote, destination, now })` -> `{ ok: true, proofSha256, keyReference } | { ok: false, code, reason }`. Order: state object present (`CHECKPOINT-APPROVAL-STATE-MISSING`); `lastApproved.forCommit === commit` (`CHECKPOINT-APPROVAL-STALE`); remote/destination equal (`CHECKPOINT-APPROVAL-BINDING`); then `authorizeRecordedPush({ projectDir, anchorDir, state, candidate, remote, destination, now })` with its `PUSH-PROOF-*` code passed through. Messages never interpolate `remote` (SEC-01, as `guard-push.mjs:2441-2447`).
- `classifyCheckpointPorcelain(porcelainText, stateRelPaths)` -> `{ clean: boolean, approvalRecordOnly: boolean }` (section 3.4).

`authorizeRecordedPush` and all of `lib/critical-action-authorization.mjs` stay unchanged.

### 3.3 In-session guard (`hooks/guard-push.mjs`, lane block `:1999-2019`)

After `checkpointEligibility` succeeds and BEFORE `recordCheckpointPushAttempt` (`:2011`):

1. Resolve `pushWaiver = criticalProofWaiverFor(fallbackProjectDir(), "push")` (same governed-root rule as `:2401-2406`) and `mode = checkpointApprovalMode(...)`.
2. If `mode !== "signature"`: continue exactly as today.
3. Else read state from `projectDir` via `projectStateRelPath(projectDir)` (as `:2280-2288`), `tree = resolveSourceTree()` (`:2125`), call `checkCheckpointPushApproval(... anchorDir: fallbackProjectDir(), now: new Date().toISOString())`. On failure: `emit(2, ["BLOCKED (guard-push feature checkpoint): signature mode requires a current approval bound to this exact commit, remote and destination.", "Reason: <code>.", "Run: push-init.mjs ... --checkpoint (prints the single authorize-critical command)."])`.
4. `checkpointEligibility` takes `signatureMode` so its clean-tree check (`:1952-1953`) uses `classifyCheckpointPorcelain` (3.4); everything else in it is unchanged.
5. Optional: pass `approval: {mode, proofSha256}` into `checkpointAuditRecord` (`lib/checkpoint-push-audit.mjs`; NOT read in this design: the implementer must confirm the record schema allows an additive field, else skip; the ledger is not load-bearing for enforcement).

No change to `:1984-1990`, `:2023-2452`, or the main-publication boundary.

### 3.4 The dirty-state conflict (highest-risk item; Critic focus)

`approve-push` rewrites the tracked state file (`project/pipeline-state.json` `lib/project-authority.mjs:35`, legacy `.claude/pipeline-state.json` `:40`) with `pendingAuditWrite: true` (`pipeline-state.mjs:11541-11545`) AFTER the signed subject was computed, so the record can never be inside the commit it covers (the same fact `push-prepare.mjs:560-565` documents). The checkpoint lane refuses any non-empty `git status --porcelain` (`guard-push.mjs:1952-1953`, hook `:336-337`). Without a change, every correctly approved checkpoint push is refused. Committing the record first changes HEAD and stales the approval, so that is no escape.

Rule (signature mode only, applied after the approval verified): the porcelain output may consist of exactly one entry, the tracked state path (neutral or legacy), status ` M` (modified in the work tree, not staged, not untracked, not deleted, not renamed). Anything else remains "not clean". Rationale: the push transmits the commit, not the work tree; the verifier already reads the work-tree state file; a forged record still fails the signature. This exemption must be pinned by a RED test (case C10) before any other design assumption is trusted: confirm on a real repo that the state file is tracked and that `approve-push` leaves exactly ` M project/pipeline-state.json`.

Consequence for the NEXT ceremony: `authorize-critical` demands a clean checkout incl. untracked (`docs/push-release-flow.md:229-232`), so the pending record must be folded first. `push-prepare` already does that at its start (`:595-599`); the fold commit carries no `Checkpoint-Intent`, so the next checkpoint needs one more intent-bearing commit after the fold. The driver (3.6) therefore folds ONCE at the top, then evaluates the checkpoint checks on the resulting HEAD, then runs the slim prepare with the fold disabled (no HEAD movement after readiness). Cost: up to two housekeeping commits per signed checkpoint (Q3).

### 3.5 Pre-push hook (`scripts/pre-push-hook-install.mjs` template)

- Import the new module like the other libs (`:371-376` pattern, `pathToFileURL(join(PLUGIN_LIB_DIR, "checkpoint-push-approval.mjs"))`), plus `criticalProofWaiverFor` from `critical-human-proof-policy.mjs`.
- In `evaluateOneCommit`, the checkpoint branch (`:402-412`): after `checkpointFailure` passes, compute mode (`gateConfig` already loaded at `:392`, waiver for `projectRoot`); if `signature`, read the state like `:429-439`, resolve the tree (`:414-415`), call `checkCheckpointPushApproval`; any failure is a `hardBlock`. `checkpointFailure` (`:329-347`) takes the shared porcelain classifier. The hook's existing fail-closed doctrine applies (`:497-503`), including a lib import fault.
- Anchor directory is `projectRoot` (hooks are per repository, so the nested-repository anchor-mint scenario in `critical-action-authorization.mjs:122-135` does not arise; same as the function's default `anchorDir = projectDir`).
- Remote binding: git passes the remote NAME or URL as `argv[2]` (`:467`); the approval binds the name given to `approve-push`. A URL push therefore fails closed (documented behaviour, not a bug).
- Update the header SCOPE text (`:223-241`) to say the checkpoint lane's signature is now verified.
- Scope boundary: the hook's protected-lane approval check (`:428-448`) still does not verify the signature; extending the same shared verifier there is a one-call follow-up but changes a lane the PO wants unchanged (Q2).
- Deployment: the hook's runtime snapshot enumerates all non-test `.mjs` under `lib|hooks|scripts|config|schemas` (`lib/git-hook-runtime-snapshot.mjs:8-16`), so the new module is included automatically and the changed digest makes the installer report `updateRequired` (`pre-push-hook-install.mjs:580-597`): reinstall with `scripts/pre-push-hook-install.mjs --install` after the fix lands.

### 3.6 Slim prerequisite profile (`push-prepare.mjs`, `push-init.mjs`)

- `push-prepare.mjs`: new option `profile: "feature-checkpoint"` (CLI `--checkpoint`). It KEEPS clean tree (`:603`), threat model (`:618`), proof policy (`:623`), subject hash (`:662-671`), active feature/plan/spec (`:673-678`), approval directory (`:680-686`), expiry (`:688-689`), `authorize-critical` and `approve-push` builders (`:691-712`). It OMITS `verify-evidence` and `security-evidence` (`:606-610`). It prints the checkpoint push in the exact `git -C <root> push <remote> <sourceRef>:<destination>` form instead of `HEAD:<destination>` (`:713-717`), and a one-line statement "feature checkpoint: no Verify/security/Critic evidence is demanded or implied by this approval". The default profile is untouched.
- `push-init.mjs`: `driveCheckpointPushInit` (`:185-227`) reads the mode (`readHumanApprovalMode`, as `push-prepare.mjs:576-578`). `chat`/`standing`: today's output, outcome `checkpoint-ready`. `signature`: fold (3.4) -> existing checkpoint checks -> slim prepare -> outcome `signature-required` with `lane: "feature-checkpoint"` and the three command lines. Update the header comment (`:180-184`) and the exit-code list (`:474`) only if a new outcome name is chosen (recommendation: reuse `signature-required`, add `lane`).
- Prerequisite that stays and is not "slim": an active feature with an approved plan/spec, because the signed intent binds `state.planApproval.poGateAuthority` (`critical-action-authorization.mjs:291-307`; `push-prepare.mjs:673-678`). A checkpoint pushed before any plan approval cannot be signed (`PUSH-PROOF-STATE-AUTHORITY`). See Q5.

## 4. Exact change list

| # | File | Function / region | Change | Protected? |
|---|---|---|---|---|
| 1 | `plugins/pipeline-core/lib/checkpoint-push-approval.mjs` | new: `checkpointApprovalMode`, `checkCheckpointPushApproval`, `classifyCheckpointPorcelain` | new shared verifier | no (new file) |
| 2 | `plugins/pipeline-core/lib/checkpoint-push-approval.test.mjs` | new | unit tests C1-C8, C10-C12 below | no, BUT needs registry entry (row 9) |
| 3 | `plugins/pipeline-core/hooks/guard-push.mjs` | lane block `:1999-2019`, `checkpointEligibility` `:1948` | call 3.2 in signature mode; porcelain classifier | not in `protected-baseline.json` `PB-GUARD-HOOKS` (`:23-28` lists other guards) and not a TP path; gate-strength coverage of `hooks/*.mjs` was NOT exhaustively checked: the implementer runs the `repair-map.mjs` query (agent-obligations section 5) first; a refusal turns into a stop (author repair), not a hunt |
| 4 | `plugins/pipeline-core/hooks/guard-push-checkpoint-approval.test.mjs` | new subprocess test in the style of `guard-push.test.mjs:2299-2366` | guard-level cases C1-C12 | no (TP-5 regex matches only `guard-push.test.mjs` / `guard-push-v2.test.mjs`) but needs registry entry (row 9) |
| 5 | `plugins/pipeline-core/scripts/pre-push-hook-install.mjs` | template `checkpointFailure`, `evaluateOneCommit` | 3.5 | no |
| 6 | `plugins/pipeline-core/scripts/pre-push-hook-install.test.mjs` | `:277-288` and new cases | HK1-HK5 | no |
| 7 | `plugins/pipeline-core/scripts/push-prepare.mjs` (+ its test) | `pushPrepareReport` `:571` | `feature-checkpoint` profile | no |
| 8 | `plugins/pipeline-core/scripts/push-init.mjs` (+ its test) | `driveCheckpointPushInit` `:185`, `:318`, `:474` | mode-aware driver | no |
| 9 | `harness/verify-suites.json` | add suites for rows 2 and 4 (entry shape as `:107-110`) | registration | YES, TP-13 / PB-VERIFY-REGISTRATION |
| 10 | `plugins/pipeline-core/hooks/guard-push.test.mjs` | flip `:2305` (`PG-CHECKPOINT allow ...`) to BLOCK `signature mode requires`, and `:2328-2334` (`PG-CHECKPOINT-WORKTREE allow ...`) to supply a valid approval or flip to BLOCK; BLOCK cases `:2306-2311,:2338-2365` stay as they are | contract change | YES, TP-5 (`agent-obligations.md` section 2). No in-session override applies to plugin source; needs a signed package |
| 11 | `docs/push-release-flow.md` and `plugins/pipeline-core/docs/push-release-flow.md` | `:90-117` rewritten; `:18-23` one sentence "in signature mode every push needs the signature; only publication lanes add evidence" | docs (draft-exempt prefix for `docs/`) | no |
| 12 | `docs/adr/0056-push-approval-mode.md` | addendum (or new ADR) recording the decision | docs | no |
| 13 | `specs/sprint-nova-epic/implementation/feature-checkpoint-push-policy.md` | supersession note | spec | no |

Untouched by design: `lib/critical-action-authorization.mjs`, `lib/critical-action-approval-request.mjs`, `scripts/pipeline-state.mjs` (PB-SANCTIONED-WRITER), `scripts/po-human-approval.mjs`, `lib/push-destination-policy.mjs` (classification is already correct), `project/critical-human-proof.json`, `pipeline.user.yaml`, `protected-baseline.json`.

## 5. Tests (RED first, then GREEN)

Guard-level (rows 4, plus the flips in row 10); fixtures as the existing PG-CHECKPOINT block (`manifestPush({approval:"required"})` + checkpoint policy + `Checkpoint-Intent` commit). A valid signed approval is built with the same helper the existing signature fixtures use (the PG12s* family in `guard-push.test.mjs`, not re-read here); evidence files are deliberately ABSENT in every case.

- C1 RED->GREEN: signature mode, feature branch, NO approval record -> BLOCK, stderr `signature mode requires`. (This is the flip of today's ALLOW at `:2305`.)
- C2: stale approval, `forCommit` = parent commit -> BLOCK (`CHECKPOINT-APPROVAL-STALE`).
- C3: valid signed approval for this commit/remote/destination, no Verify/security evidence -> ALLOW, audit record written, stderr empty.
- C4: approval bound to another destination, and another remote -> BLOCK (`CHECKPOINT-APPROVAL-BINDING`).
- C5: expired approval -> BLOCK (`PUSH-PROOF-EXPIRED`).
- C6: record with rewritten fields but wrong/absent signature, or no `criticalProof` -> BLOCK (`PUSH-PROOF-SUBJECT-MISMATCH|SIGNATURE-MISMATCH|RECORD-INCOMPLETE`).
- C7: `project/push-threat-model.md` edited after approval -> BLOCK (`PUSH-PROOF-THREAT-MODEL`).
- C8: `chat` waiver -> ALLOW without approval (unchanged); `standing-approved` -> ALLOW (unchanged).
- C9: main unchanged (`refs/heads/main` BLOCK `raw Bash/Git cannot publish`); release/tag unchanged (BLOCK `evidence/verify-latest.json missing`); NEW: a valid checkpoint approval for `refs/heads/release/0.6.2` still BLOCKs on missing evidence (approval is not sufficient on the protected lane); force refspec and malformed policy unchanged (`:2309-2311`).
- C10: dirty-state exemption: after `approve-push`, only ` M <state path>` -> ALLOW; plus any other dirty file, an untracked file, or the state file staged -> BLOCK `checkpoint working tree is not clean`; `-C` worktree variants (`:2338-2355`) keep their messages.
- C11: unreadable `project/critical-human-proof.json` -> BLOCK (fail closed to signature), never ALLOW.
- C12: ordering: with an eligible-but-unapproved commit and a missing intent trailer, the eligibility message still appears (existing texts keep working).

Hook-level (row 6): HK1 installed hook, signature mode, no approval -> exit 1 and `log.jsonl` verdict `blocked`; HK2 stale approval; HK3 valid approval -> allowed, no Verify evidence; HK4 chat/standing -> allowed (the existing `:277-288` becomes the chat/standing variant); HK5 lib import fault or malformed policy -> blocked (fail closed); HK6 URL as `argv[2]` -> blocked; HK7 snapshot digest changes after this change so the installer reports `updateRequired`.

Driver-level (rows 7, 8): checkpoint profile omits `verify-evidence`/`security-evidence` and keeps the rest; default profile still includes both (regression); `push-init --checkpoint` in signature mode returns `signature-required`, `lane: "feature-checkpoint"`, three command lines, no evidence checks; in chat mode returns `checkpoint-ready` unchanged; fold runs once and HEAD does not move after the report.

Lib-level (row 2): mode matrix incl. unreadable waiver; porcelain classifier (empty, one ` M` state, ` M` other, `??`, `M ` staged, renamed, CRLF, both state paths).

Verification: run only targeted files (Windows memory rule: no full Verify on Windows); the full Verify suite remains the PO's/WSL concern and is NOT demanded for the push this design enables.

## 6. Protected files and the signed package

- Must ride in a signed package (human-guard override / author repair; an agent stops, it does not hunt for a route): `plugins/pipeline-core/hooks/guard-push.test.mjs` (TP-5; only the two flipped assertions), `harness/verify-suites.json` (TP-13; two new entries).
- Possibly protected (verify first): `plugins/pipeline-core/hooks/guard-push.mjs` (see row 3).
- Not protected: all other rows. `pipeline-state.mjs`, `critical-human-proof.json`, `protected-baseline.json` are deliberately not edited.
- Sequencing constraint: rows 3 and 10 are one unit. Landing row 3 without row 10 turns `guard-push.test.mjs` red; the signed package must therefore be applied in the same commit window. To keep row 4's agent-verifiable proof independent, all NEW guard-level cases live in the unprotected file (row 4), so the protected diff is the minimum.

## 7. Migration and transition (PO: "so lang der fix nicht da ist können wir so pushen")

1. The fixed code is inert until (a) the plugin source is synced to the installed marketplace copy that the session guard actually runs, and (b) the pre-push hook is reinstalled (digest change, 3.5). Until then the checkpoint lane keeps admitting unsigned pushes. No feature flag or switch is added; the transition is installation.
2. The fix commit itself may be pushed through the old lane before install; the first checkpoint after install is the first signed one.
3. After install, run `push-init.mjs ... --checkpoint` once and expect `signature-required`; the printed `approval` state in its report is the visible signal.
4. On this Windows clone also install the missing hook (`pre-push-hook-install.mjs --install`), otherwise enforcement is the in-session guard only.
5. Consumers: no impact unless they declared `pushDestinationPolicy` (no default namespace, `lib/push-destination-policy.mjs:35-39`); those that did get the new requirement in `signature` mode and need `project/push-threat-model.md`, the proof policy/anchor and an active approved plan.

## 8. Slicing (disjoint write scopes) and review

| Slice | Write scope | Depends on | Goldfish |
|---|---|---|---|
| S1 | rows 1, 2 | none | goldfish-deep (security code, design latitude in 3.4) |
| S2 | rows 3, 4 | S1 API (fixed in 3.2) | goldfish-deep |
| S3 | rows 5, 6 | S1 API | goldfish-deep |
| S4 | rows 7, 8 | S1 only for the porcelain/mode helpers | goldfish-implementor |
| S5 | rows 9, 10 (signed package; authored as a reviewed patch artifact, applied by the human-override route) | S2 messages final | goldfish-deep (test authorship) |
| S6 | rows 11-13 (docs/specs only) | wording final after S4 | goldfish-implementor or mechanic |

S1 first; S2, S3, S4 can run in parallel (disjoint files); S5 and S6 after. Review: security + guardrail class, so MP-07 applies: independent Opus Critic at `max` over the whole diff (S1-S5) BEFORE the PO's gate, fresh context, artifact paths only, built from `templates/prompts/critic-review.md`. Critic search surface suggestions are NOT given here by design; the one item this design itself flags as risk is 3.4.

## 9. Matrix (runner x OS x repository)

Enforcement points: in-session guard (`hooks/guard-push.mjs`, a runner-hosted PreToolUse hook) and the git pre-push hook (runner-independent). The ceremony is the existing `authorize-critical` (attended terminal, OpenSSL).

| Runner | Windows | WSL | macOS |
|---|---|---|---|
| Claude | guard + hook (hook ABSENT on this clone today: install it); ceremony needs an attended terminal window; targeted tests only | guard + hook; reference platform for full Verify | guard + hook; not verified on this machine |
| Codex | hook only unless a runner adapter hosts `guard-push` (not verified: not read in this design); `--no-verify` bypass applies | same | same |
| Antigravity | same as Codex | same | same |

Repository axis: own repository (this one: signature default, checkpoint policy configured, `project/push-threat-model.md` present per research) gets the change at install; consumer repositories without `pushDestinationPolicy` see no change; consumers with it need the prerequisites in section 7.5. New code paths use only `git` via `spawnSync` and string/path comparison with forward-slash normalisation (the porcelain classifier must be CRLF- and quoting-safe, test C10/lib). Every cell is "designed"; none is "verified" until the HK/C tests run on that platform (Windows: targeted only).

## 10. Threat notes for the reviewer (design-side, not a hunt list)

Forging a record needs the private key outside the repository (unchanged). Downgrading the mode needs a gate-strength file edit (`guard-gate-strength.mjs:106`) or a hook/policy fault, which fails closed to `signature`. Dropping `pushDestinationPolicy` moves a push to the stricter lane. A signed approval stays valid for repeated pushes of the same commit until `expiresAt` (default now+1h, `push-prepare.mjs:688-689`); a new commit needs a new signature, as the PO wants. Residual, unchanged: `git push --no-verify` and a missing hook (`pre-push-hook-install.mjs:252-261`).

## 11. Open questions for the PO

- Q1: Should `chat` mode checkpoint pushes at least require a recorded chat clearance (as the protected lane does), or stay fully unsigned/unrecorded as designed?
- Q2: Extend the hook's PROTECTED-lane check to verify the signature too (one extra call to the new module)? Out of scope here; recommended as the next item.
- Q3: Accept up to two housekeeping commits (fold + intent) per signed checkpoint, or fund a larger change that records checkpoint approvals outside the tracked state file (needs protected `pipeline-state.mjs`)?
- Q4: Is an explicit "checkpoint" profile inside the signed subject worth the protected-file cost (clearer PO confirmation text)?
- Q5: Checkpoints before any approved plan cannot be signed (the signed intent binds plan/spec authority). Accept that, or allow the unsigned lane to remain for the pre-plan draft phase?
