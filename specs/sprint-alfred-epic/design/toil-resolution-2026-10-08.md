# Toil resolution design note (revision a3, TOILRES-D2c, 2026-10-09)

## Revision a3 log (TOILRES-D2c; Critic TOILRES-D2b a1)

Source: `../evidence/critic-TOILRES-D2b-a1-2026-10-09.md`: F-1 `:12`, F-2 `:13`, F-3 `:14`. That review covered revision a2 (`03600b7de`).

| Finding | Change | Section |
|---|---|---|
| F-1 (major) | Measured what the ready-state grammar admits. There is no executable allowlist, and four live probes ran | new 3.2a |
| F-1 | The I1-E row now covers every admitted executable. The I2 row's gap text is updated | 3.1, 3.2 |
| F-1 | TR-S2 now covers every Bash and PowerShell-tool command. This revision adds its wiring position, nested carriers, spelling normalisation, match rule and corpus | 3.4 TR-S2 |
| F-1 | Paths TR-S2 cannot see are registered as RS-1 lanes, with owner and expiry | 3.4 register |
| F-1 | Closure claim corrected | 3.5 |
| F-3 (minor) | RS-1 is split into RS-1K, RS-1C and RS-1M, each with its real barrier | 3.4 register; 6 item 5 |
| F-2 (major) | TOILRES-D2c writes and commits this revision under its own record `evidence/dispatch-record-TOILRES-D2c-20261009.json` | none (process) |
| T87, T88 | Added to section 2 (TR-D, TR-F), the count check and section 5 | header, 2, 5 |
| Log shift | The log inserted T87 and T88 at L91-L92, so T81 moved to L93 and T28 to L94 (a3) | header, 2, 3.4 |

Status: revised proposal (a3), for an independent Critic re-review (Opus, MP-07: security and guardrail design), then a PO decision on the fix list.

- Revision history:
  - a1 `a78507b41` (TOILRES-D; Critic FAIL, `../evidence/critic-TOILRES-a1-2026-10-08.md:5`);
  - a2 `03600b7de` (TOILRES-D2b; Critic FAIL, `../evidence/critic-TOILRES-D2b-a1-2026-10-09.md:5`);
  - a3 is this text.
- Revision a2 closed a1 findings F1 (`critic-TOILRES-a1:10`), F2 (`:11`) and F3 (`:12`), and covered the rows the registry names as added later (`:14`).
- PO decisions: integrates BJ, BK and BN (`../plans/po-decisions-2026-10-07.md:67`, `:68`, `:71`); cross-references BI (`:66`), BL (`:69`) and BM (`:70`).

Scope: toil rows T1-T88 of `../evidence/toil-log-2026-10-06-07.md` (data rows at lines 7-94).

**Count check.** The log has 88 data rows, one per line from L7 to L94. Lines L83-L94 were read in a3; L7-L82 are carried from a2. Each of T1-T88 occurs there exactly once.

Four rows are out of numeric order:

- T17 (L26, after T20);
- T50 (L58, after T53);
- T81 (L93, after T88);
- T28 (L94, last).

Section 2 lists all 88 in numeric order, with each row's log line.

Disposition count: 20 Owned (T1-T20) + 11 Tracked + 1 Note + 56 in slices = 88. The slices: TR-A 5, TR-B 2, TR-C 6, TR-D 4, TR-E 3, TR-F 7, TR-G 3, TR-I 3, TR-J 3, TR-K 18, TR-L 1, TR-M 1. Section 5 repeats the per-slice lists.

Citation conventions:

- Plugin paths are relative to `plugins/pipeline-core/` unless they start with another top-level directory.
- `verified`: read in TOILRES-D2b (revision a2).
- `a3`: read or executed in TOILRES-D2c (this revision).
- `D2-A` … `D2-E`: findings of the prior research dispatch TOILRES-D2 (`evidence/dispatch-record-TOILRES-D2-20261008.json`, `report.text`). That record lives in the ignored `evidence/` root (toil-log L60), so its `file:line` citations are copied inline here. Only finding A's open point was re-checked in TOILRES-D2b (section 3.3).
- `carried`: copied unchanged from revision `a78507b41` and not re-read since.
- `log`: supported only by the toil row's own text.
- [C]: conjecture or design proposal, not verified.

## 0. Yardstick, and what changed

**BJ** (`po-decisions:67`) sets the yardstick:

- Keep the enforcement layer: no broad rebuild and no removal of protection paths.
- Simplify and consolidate blocking states, paths and repair routes.
- Add strong preflights.
- Limit the work to the four toil-heavy families: (a) approval-chain re-derivation, (b) read and shell grammar refusals, (c) dispatch orientation tax, (d) device-switch drift.

Section 5 names the family of every slice. Slices outside the four are marked "hygiene" and kept small.

**BK** (`:68`) requires two gating security slices in 0.7.0:

- TR-S1 is an encrypted-key gate covering `--existing-key` and the recover branch.
- TR-S2 refuses execution lanes that name a key, credential or machine-plane path, implemented as a new pure seam. Since a3 it covers every admitted command, because section 3.2a measured no executable allowlist.

BK also requires a residual register with owner and expiry (section 3.4).

**BN** (`:71`): nothing is deferred to 0.8 by default. Every slice and every Tracked row here belongs to the next local candidate. Only items assigned to sprint `batman` or `nightwing` are deferred. The toil log has no sprint column (header at L5: `#`, Hurdle, Cost, Should be), so this note defers no row.

Revision a2 changes against `a78507b41` (kept for the record):

- **F1.** Added rows T77-T86 (section 2). TR-E now names its WSL route (section 5).
- **F2.**
  - Split I1 into passive, execution and signing lanes, each with an enforcement point and a gap (section 3.2).
  - Re-checked finding A's open point: the execution lane is open (section 3.3).
  - Added BK slices TR-S1 and TR-S2. The gating TR-S1 replaces the non-gating TR-H readiness finding.
- **F3.**
  - "Owned" now applies only to T1-T20, the rows section 22.0 assigns (`specs/sprint-alfred-epic/spec.md:2071-2101` per D2-D; the Critic cites `:2006-2010, 2097-2101`).
  - Rows assigned by their own text, a PO decision or a backlog item are now "Tracked", with the source named.
  - The `specs/` half of T75 is its own slice, TR-M: R7-4 admits only `backlog/`, `docs/` and `scratch/` (`spec.md:2280-2287, 2304-2308` per D2-D).
- **English only.** PO wording is referenced by its decision row, not quoted.

## 1. Dispositions and columns

- **Owned (22.0)**: spec section 22.0 assigns the row to a contract. The row cites that contract and is not redesigned here.
- **Tracked**: an owner is named outside section 22.0, by the row's own text, a PO decision row or a backlog item. That owner confirms. The row is not redesigned here, and under BN it stays in the next local candidate.
- **TR-x**: a slice built in three steps:
  1. `-T` commits RED pins and, in the same commit, sweeps older assertions that contradict the new contract (T36, L41).
  2. `-F` never edits its own tests (QG-04, `guardrails/quality-gates.md:69`, carried).
  3. An independent Critic reviews.

  A pin in a TP-listed file takes the signed route (`templates/prompts/agent-obligations.md:77-87`, verified); T42 (L47) shows the cost.
- **Note**: no repository fix exists.

"Protected?" column:

- `TP-n`: a file matching that id (`agent-obligations.md:89-103`, verified).
- `G`: guard source (`hooks/guard-*.mjs`, `lib/guard/*`). Assume a signed quality package until the protected-baseline manifest says otherwise. T84 (L88) shows `PB-GUARD-HOOKS` covering `lib/guard/sanctioned-args-onboarding.mjs`.
- `owner`: the owning contract decides.
- `no`: not protected.

## 2. Per-row resolution (T1-T88, numeric order)

| T# | Log | Refusing check (evidence) | Protected requirement | Minimal fix that keeps it | Protected? | Disposition |
|---|---|---|---|---|---|---|
| T1 | L7 | Preflight `GS-GIT-UNAVAILABLE`, hardened git spawn env (log) | spec 22.1 R7-1 | `/dev/null` constant; cause and typed probe in the envelope | G | Owned (22.0): R7-1 |
| T2 | L8 | Pre-ready closed grammar, `GUARD-READ-COMMAND-UNSUPPORTED` (carried) | R7-1; `docs/adr/draft-read-scope-containment-boundary.md:16-28` (carried); SEC-11 | R7-1 sanctioned diagnostic set; the credential target check is untouched (I1-P) | G | Owned (22.0): R7-1 |
| T3 | L9 | Orphan session descriptors need a PO decision plus `--by` (log) | spec 22.2 R7-2 | Archive zero-authority descriptors; authority-holding ones stay attended | owner | Owned (22.0): R7-2 |
| T4 | L10 | Pre-push hook absent or stale (log) | 22.0 maps T4 to R3 (R3-2); ADR-0013 | Bootstrap typed nextAction installs or refreshes all three hooks (acceptance with T53, T79) | owner | Owned (22.0): R3-2 |
| T5 | L11 | Approval-bound package in ignored `evidence/` (log) | spec 22.3 R7-3 | Track the bound paths | owner | Owned (22.0): R7-3 |
| T6 | L12 | Backlog and docs writes refused while the package is unverifiable (log) | spec 22.4 R7-4 | R7-4 admitted set `backlog/`, `docs/`, `scratch/` (`spec.md:2280-2287`, D2-D); `specs/` is not in it, see TR-M | G | Owned (22.0): R7-4 |
| T7 | L13 | Only `reopen-design` offered (log) | spec 22.5 R7-5 (rebind; lost-artifact sub-case fails closed, PO #25) | Rebind route; BL (`po-decisions:69`) ratifies `rebind-approval` with `requireReadinessExecution: false` | owner | Owned (22.0): R7-5 |
| T8 | L14 | `submit-plan` and `continuity-cas` need a signed override (log) | spec 22.10 R7-10 | Sanctioned supersede verb | G | Owned (22.0): R7-10 |
| T9 | L15 | Re-registering an authoring dispatch needs a signed override (log) | 22.0 maps to R5-6 | Course registers its own dispatch | owner | Owned (22.0): R5-6 |
| T10 | L16 | Course outputs under `evidence/` not agent-writable in design (log) | 22.0 maps to R1-1 | Course outputs writable in design phases | G | Owned (22.0): R1-1 |
| T11 | L17 | `project/pipeline-state.json` commit refused, `GUARD-DEVPLAN-LIFECYCLE` (log) | spec 22.4 R7-4 | Lifecycle writer commits its own state | G | Owned (22.0): R7-4 |
| T12 | L18 | Handover omits device-bound artifacts (log) | spec 22.3 R7-3 | Handover lists every digest-bound path | owner | Owned (22.0): R7-3 |
| T13 | L19 | No wired Advisor route (log) | 22.0 maps to R4 (R4-1, R4-2) | Wired route | owner | Owned (22.0): R4 |
| T14 | L20 | `sign-intent` without a remembered key directory (log) | spec 22.6 R7-6 | Machine-wide `poKeyDirectory`; the resolved directory stays an I1 excluded root (`lib/passive-read-policy.mjs:125-137`, carried) | owner | Owned (22.0): R7-6 |
| T15 | L21 | Bare `openssl` from PATH (log) | spec 22.6 R7-6 | Pipeline resolves openssl itself | owner | Owned (22.0): R7-6 |
| T16 | L22 | Bootstrap omits later-blocking preconditions (log) | spec 22.7 R7-7 | One readiness report. TR-S1 adds "PO key passphrase-protected" as an up-front finding next to its gate (BJ: strong preflights) | owner | Owned (22.0): R7-7 |
| T17 | L26 | `continuity-cas` from PowerShell, `GUARD-POWERSHELL-GRAMMAR` (log) | spec 22.8 R7-8 | Same route on both shell lanes | G | Owned (22.0): R7-8 |
| T18 | L23 | Prescribed scripts refused as opaque script execution in draft (log) | 22.0 maps to R1-1 (21.1 catalogue); 22.0 typed repair rule | Catalogue admission; TR-A reuses the mechanism | G | Owned (22.0): R1-1 |
| T19 | L24 | One agent's parallel tool calls race the budget counter lock (log) | spec 22.11 R7-11; PO #26 | Bounded lock wait | G | Owned (22.0): R7-11 |
| T20 | L25 | Subagent bootstrap receipt only via one preflight spelling (log) | spec 22.11 R7-11; PO #28 | SubagentStart receipt. Recurred in TOILRES-D2b: the first Write was refused `GUARD-BOOTSTRAP-RECEIPT-MISSING` until the preflight ran (verified: refusal text); recurred again in TOILRES-D2c (a3: refusal text) | G | Owned (22.0): R7-11 |
| T21 | L27 | `design-course-session.mjs --run-v2` refused as opaque script execution in `awaiting-approval` (log) | 22.0 typed repair rule; 21.1 catalogue | Admit course verbs by resolved script identity plus a closed verb list, never by free argv | G | TR-A |
| T22 | L28 | `DAC2-REEXPORT-SOURCE-DRIFT` on the same authoring dispatch id (log) | Course digest binding; R5-6 named in the row | Typed action "register a new authoring dispatch id"; drift check unchanged | owner | Tracked: R5-6 (row text L28) |
| T23 | L29 | Not-ready readiness forces the whole loop (log) | R5-6 / R7-10 named in the row | One agent-executable revision-cycle action | G | Tracked: R5-6 / R7-10 (row text L29) |
| T24 | L30 | `present-plan` refused as opaque script execution (log) | 22.0 typed repair rule | As T21; signing verbs are never admitted (I2) | G | TR-A |
| T25 | L31 | `present-plan` prints a template and 321 KB of JSON (log) | SEC-10 (`guardrails/security.md:165-189`, carried); pin `hooks/guard-lifecycle-ready.test.mjs:5382` (carried) | One ready command with absolute repo and node path, review JSON to a file, no `--directory` (T14/T66), so the 5382 pin holds | no | TR-K |
| T26 | L32 | Readiness reviewer re-hunts content each run (log) | PO decisions E/F named in the row; ADR-0085 | BM (`po-decisions:70`) moves the ADR-0085 removal of the design-phase readiness stack into 0.7.0; briefing text meanwhile in TR-K | no | Tracked: ADR-0085 removal (BM) |
| T27 | L33 | Every not-ready round repeats the loop with an invented id (log) | As T22, T23; PO F | Id generated by the coordinator | owner | Tracked: R5-6 / R7-10 (row text L33) |
| T28 | L94 | Stop-hook `/goal` re-fires on every idle turn (log) | None found. The only Stop hook is `stop-suggest.mjs` (`hooks/hooks.json:179-188`, verified), which emits no decision and dedupes (`hooks.json:2`, verified) | Do not set a `/goal` while blocked on PO input; if the evaluator is host code there is no repository fix [C] | no | Note |
| T29 | L34 | Producer emits a multi-line `copyCommand.posix`, `GUARD-PARSE-UNSUPPORTED` (log) | One simple command per call (`agent-obligations.md:26-31`, verified) | Producer emits only admitted spellings (with T82); verify live first | no | TR-K |
| T30 | L35 | `guard-dispatch-budget.test.mjs` unrunnable on win32 (log) | R7-11-W named in the row | Windows-runnable suite | no | Tracked: R7-11-W (row text L35, not a 22.0 assignment) |
| T31 | L36 | `GUARD-DISPATCH-RECORD-COLLISION` freezes a terminal record (log) | Record immutability (GF-09-D); decision K | One append-only transition by the record's owner, appending `commits` only | G | TR-F |
| T32 | L37 | `security-scan.mjs` refuses a dirty tree (log) | SEC-06 (SKIPPED is never PASS) | Scan a `git archive` snapshot and record the tree id; dirty-tree refusal kept for shared-tree mode | no | TR-I |
| T33 | L38 | `TCC-FD-WRITE` under plain `node --test` (log) | GF-08 machine-written evidence | Shipped single-suite runner; `harness/scripts/verify.mjs` (TP-3) untouched | no | TR-I |
| T34 | L39 | `observeGovernanceScope` costs 161-245 ms per hook call (log) | None (performance); GL-09 fail closed for authority-bearing hooks | Cache per session keyed by the governance state digest; any change or read error recomputes | G | TR-G |
| T35 | L40 | Transient `DAA-DWP2-FAILURE-DRIFT` / `DAA-DWP2-PHYSICAL-OR-GIT` (log) | PO decision 2026-10-06 in the row; GL-09 (`guardrails/global.md:77-82`, carried) | Declare the admission's category first; a nondeterministic refusal is a defect either way | G | TR-D |
| T36 | L41 | Older tests pin replaced behaviour (log) | QG-04 | RED commit sweeps contradicting assertions (briefing checklist) | no | TR-K |
| T37 | L42 | `DBB-PENDING-BINDING-MISSING` after concurrent launches (log) | Dispatch binding integrity | Key the pending binding per dispatch, or name the re-dispatch action | G | TR-G |
| T38 | L43 | Read-only `git grep` refused by guard-push as ambiguous push target (log) | ADR-0027 Decision 2 (`docs/adr/0027-gate-philosophy.md:12`, carried) | Push classification only for an actual `push` subcommand after global options | G, TP-5 | TR-C |
| T39 | L44 | Invented terminal `outcome` values (log) | Record schema v4 enum | Validator rejects non-enum values | no | TR-F |
| T40 | L45 | Whole budget spent on orientation (log) | TB-09 | One briefing per file, line ranges, closing calls reserved | no | TR-K |
| T41 | L46 | Critic-input stripper rejects `{sha, subject}` commits (log) | Strict hex SHA identity | Normalise `{sha}` objects and leading-SHA strings; reject anything else | no | TR-F |
| T42 | L47 | Fail-closed heredoc marker makes `git commit -F -` a push candidate; pin PG-HD1 expects allow (log) | ADR-0027 Decision 2; TP-5 | Hypothesis: TR-C scoping makes PG-HD1's allow consistent, so no flip; else PO decision 1 | G, TP-5 | TR-C |
| T43 | L48 | Orchestrator commit left a Goldfish authorship ungrounded (log) | EL-13a | Resume the same dispatch; record lane per T31 | G | TR-F |
| T44 | L49 | Hook-install tests inventory the live plugin tree, `GHS-SOURCE-DRIFT` (log) | Hook runtime snapshot integrity | Frozen copy or quiet window; drift refusal kept | no | TR-J |
| T45 | L50 | 39 win32 failures in `pipeline-start-preflight.test.mjs` (log) | Cross-platform matrix | Platform-native fixture roots | no | TR-J |
| T46 | L51 | No guard refused an environment dump (log) | SEC-01, SEC-03 | Guard side exists: env-dump lane imported at `lib/guard/evaluate.mjs:33`, called and failing closed on a classifier error at `:88-94` (verified). Remaining: the Critic template forbids executing probe strings | no | TR-K |
| T47 | L52 | ENVDUMP-T orientation spend; parallel batch collided on the counter (log) | TB-09; R7-11 (via T19) | "One call at a time"; fixture line ranges up front | no | TR-K |
| T48 | L53 | Test-only briefing into files not baseline-run on this host (log) | QG-04 baseline discipline | Elephant runs one case and reads the verify pin (TP-13, read only) before briefing | no | TR-K |
| T49 | L54 | Commit-flow producer refused after the working cap (log) | TB-09 closing allowance | Admit the named closing acts after the cap and nothing else | G | TR-G |
| T50 | L58 | Stopped record immutable, later commit unnamed (log) | As T31 | Same single transition | G | TR-F |
| T51 | L55 | GG-22 pathspec fast path rejects `--trailer` (log) | Exact pathspec in a shared tree (`agent-obligations.md:155-162`, verified); GIT-03 | `--trailer <value>` is a safe flag; `--no-verify`, `-n`, `-c` are never added (I3) | G, TP-1 | TR-C |
| T52 | L56 | Close-out costs about 25 calls per item (log) | Backlog closure evidence | Item-to-test mapping up front | no | TR-K |
| T53 | L57 | Hook install by hand per host (log) | PO decision M HOOKREFRESH named in the row | Bootstrap typed next action | G | Tracked: HOOKREFRESH (row text L57; RED pins in commit `83083a070`) |
| T54 | L59 | Hard Goldfish cap of 35 (log) | TB-09 | Template names the clamp (carried); the guard reports the effective cap at start (TR-G follow-up) | no | TR-K |
| T55 | L60 | Record carries an abbreviated SHA (log) | Authorship link needs the full SHA | Producer writes the full SHA as part of the commit act | G | TR-F |
| T56 | L61 | SendMessage budget grant ignored (log) | TB-09: only an orchestrator-written grant raises the cap | Use the grant; any typed extension is writable by the main session only | G if the guard changes | TR-K |
| T57 | L62 | Orientation spend, refused shell variants (log) | TB-09; closed grammar | Exact files and line ranges; denial shows the budget charge | no | TR-K |
| T58 | L63 | `GHS-SOURCE-DRIFT` on a live source copy (log) | As T44 | Quiet tree or frozen copy | no | TR-J |
| T59 | L64 | Critic runtime cap 25 with checkpoint at 20 (log) | TB-09 analogue | `critic-review.md` names the enforced cap | no | TR-K |
| T60 | L65 | `capture-evidence.mjs` artifacts carry no commit identity (log) | GF-08 | Header records HEAD, tree id, dirty flag | no | TR-I |
| T61 | L66 | Critic template says Write, the agent has none; Critics used `node -e writeFileSync` (log) | Read-only Critic; no new authority | No Write grant; admitted Bash form or a catalogue-admitted writer for `scratch/dispatch/` (PO decision 2). The `node -e` use is the execution-lane evidence behind TR-S2 | no; G for a permission change | TR-K |
| T62 | L67 | Hand-shortened Critic hunt list (log) | CLAUDE.md "dispatch from the template" | Copy Phase A verbatim; spec paths from `git ls-files` | no | TR-K |
| T63 | L68 | `GUARD-GATE-STRENGTH-SHELL` refuses commands naming the calibration file (log) | Gate-strength lane | Keep; read calibration with Read only | no | TR-K |
| T64 | L69 | Design-advisory admission runs once per staged path (log) | None for repetition; flake as T35 | Once per commit, memoised | G | TR-D |
| T65 | L70 | HGO resolver scans 111 requests for 563 s (log) | ADR-0059, ADR-0061 | Digest-keyed lookup | owner | Tracked: backlog `2026-10-08-sign-intent-disclosure-scan-blocks-for-minutes` (row text L70) |
| T66 | L71 | `sign-intent` without `--directory` on a new machine (log) | spec 22.6 R7-6 (22.0 assigns R7-6 to T14, not T66) | Machine-wide `poKeyDirectory` inside I1 excluded roots | owner | Tracked: backlog `2026-10-08-machine-wide-key-directory-resolution` (row text L71) |
| T67 | L72 | `openssl` not on the PowerShell PATH (log) | spec 22.6, 22.7 | Readiness probe names the missing executable | owner | Tracked: backlog `2026-10-08-signing-toolchain-readiness` (row text L72) |
| T68 | L73 | Host crash; six dispatches lost their process (log) | Recovery rule | SendMessage resume is standard; bootstrap F6 names the repair | no | TR-K |
| T69 | L74 | Unstaging a guard file and restoring a TP-13 copy refused (log) | I4; TP-13 | Keep the refusal; builder takes post-images from `scratch/` | no | TR-K |
| T70 | L75 | Lifecycle drift by device switch (log) | BI (1) (`po-decisions:66`); spec 22.3 R7-3, 22.5 R7-5 | Track bound paths; write guard stays blocking | G | Tracked: R7-3 / R7-5 (named by BI, not a 22.0 assignment of T70) |
| T71 | L76 | Transfer redaction changes digest-bound bytes (log) | Digest binding; no machine paths in tracked files | Byte-exact copy of digest-bound files; fail loudly if a redaction would change one | no | TR-E |
| T72 | L77 | Preflight refused with a forward-slash plugin path (log) | Exact script path (`agent-obligations.md:139-142`, verified) | Compare resolved real paths; a same-named copy elsewhere stays refused | G | TR-A |
| T73 | L78 | `GUARD-DEVPLAN-SHELL` names a diagnosis it refuses (log) | 22.0 typed repair rule | Admit the read-only `inspect` verb by identity, or name an admitted action | G | TR-A |
| T74 | L79 | `-o`, `--max-columns`, quoted alternation, directory Grep refused (log) | Draft read-scope ADR `:16-28`; SEC-11 (`guardrails/security.md:191-207`, carried) | Admit per flag, each with a pin; directory Grep stays refused; operands still go to `isAllowedPassiveReadTarget` (I1-P). The `git grep` half is TR-C | G | TR-B |
| T75 | L80 | `specs/` and `backlog/` writes refused in the blocked state (log) | R7-4 admitted set (`spec.md:2280-2287, 2304-2308`, D2-D); exempt prefixes incl. `specs/` (`agent-obligations.md:110-117`, verified) | `backlog/` half: R7-4's admitted set (not a 22.0 assignment of T75). `specs/` half: TR-M | G | TR-M |
| T76 | L81 | `requireCurrentCandidate` defaults to true in the re-read chain, `DWP2-CURRENT-CANDIDATE` (log) | R7-5 rebind; GL-09 | Pins first, then forward `false`; digest binding untouched. Adjacent to BL / R7-5-F2 (`po-decisions:69`); no duplication | G [C] | TR-E |
| T77 | L82 | Orientation tax: first Write refused until a child preflight runs; Grep/Glob `GUARD-READ-TARGET`; `rg -g` and a piped `git` into `rg` refused; file-pointer briefing refused `DISPATCH-INCOMPLETE-BRIEFING` / `DBB-BASE-CAP-MISSING` (log) | Child receipt: R7-11 / PO #28 (via T20); SEC-11 exact-file Grep (carried); inline six-field briefing | Receipt: Owned via T20. The bounded rg grammar already admits glob filters for project searches (`hooks/guard-command-grammar.mjs:381-386`, verified), so which lane refused `rg -g` is open [C]: TR-B-T reproduces and pins it. Piped git: TR-C. File-pointer refusal kept; briefings stay inline (TR-K) | G | TR-B |
| T78 | L83 | Design-workflow v2 fixtures need a Linux-only host store (log) | Cross-platform matrix | TR-E names its WSL route up front; fixtures gain typed win32 skips (TR-J follow-up) | no | TR-E |
| T79 | L84 | Stale hooks left preflight `ready`; model-role bootstrap skipped (log) | HOOKREFRESH; backlog `2026-10-05-bootstrap-should-refresh-hooks-when-the-plugin-updated` (row text) | Stale mandatory hook makes the preflight non-ready with the refresh as `nextAction`; model-role result is a required readback | G [C] | Tracked: HOOKREFRESH (RED pins in commit `83083a070`) |
| T80 | L85 | `git grep` with a quoted BRE alternation refused by guard-push (log) | ADR-0027 Decision 2 applies to a real push only | Route `git grep` to the read classifier before any push check; pin "never handled by guard-push" | G, TP-5 | TR-C |
| T81 | L93 | `node --test` of a `hooks/` test refused `GUARD-DEVPLAN-SHELL` while admitted for `lib/`, `scripts/` (log) | Read-only node lane admits `node --check <file>` and `node <*.test.mjs>` (`lib/guard/shell-grammar.mjs:901-914`, D2-A) | Admit `node --test <tracked test file>` uniformly; TR-S2 still applies to that file's content (RS-1) | G | TR-A |
| T82 | L86 | Producer prints `git commit -m … --trailer …`, guard-push refuses it (log) | Obligations recommend exactly that form (`agent-obligations.md:35-39`, verified), so obligations, producer and guard disagree | Consolidate (BJ): TR-C scoping admits the printed form; one pin that it is admitted. Fallback: producer emits `-F scratch/commit-msg/<id>.txt` | G, TP-5 | TR-C |
| T83 | L87 | `DWP2-FAILURE-DRIFT` from the time-of-check drift test (`design-workflow-package-v2.mjs:92`, row text) (log) | GL-09 | Typed transient `…-CANDIDATE-MOVED` ("retry the same call"); implementation-boundary read uses the ancestry rule, not HEAD equality | G | TR-D |
| T84 | L88 | guard-testpath (`PB-GUARD-HOOKS`) admitted one hunk, refused the next and both reverts (log) | I4 | One protection decision per file across hunks; `git restore -- <file>` to its committed bytes admitted, since a revert only reduces risk [C: bound to HEAD bytes, never an arbitrary ref] | G, TP-2, TP-7 [C] | TR-L |
| T85 | L89 | guard-push refuses `git --version` and WSL command text containing `git` (log) | ADR-0027 Decision 2 | Only an actual `push` subcommand after global options is a push; `--version`, `version` and nested non-push verbs never reach it; pin both | G, TP-5 | TR-C |
| T86 | L90 | Budgets sized for the edit, not the closing ceremony (log) | TB-09 | Template adds a fixed closing allowance; long suites in the foreground; producer retries `index.lock` once (TR-F follow-up). Recurred in TOILRES-D2b: the 80 % checkpoint fired at counted call 20 of 25, before the deliverable was written (verified: hook notice text) | no | TR-K |
| T87 | L91 | One WSL-registered worktree, invisible to Windows `git worktree list`, closed the Windows-side implementation gate for every writer with `DWP2-PHYSICAL-OR-GIT`. It refused the gate's own diagnosis command as opaque execution, and onboarding offered `reopen-design`. The reader's catch-all is at `design-workflow-package-v2.mjs:142` (row text) (log, a3) | GL-09 fail closed (`guardrails/global.md:77-82`, carried); approval-chain integrity | The gate stays blocking (GL-09) with these changes [C]: (1) the reader keeps the underlying error code; (2) a registered worktree outside the native view is a typed environment condition, never "architecture evidence invalid"; (3) `reopen-design` is offered only for a verified content drift; (4) the named diagnosis is admitted by identity, the T73 mechanism (TR-A). If ADR-0085 C2 (BM, `po-decisions:70`) removes this read first, TR-D keeps only (2) and (3) [C] | G | TR-D |
| T88 | L92 | No commit-time check binds a `Dispatch: <ID> (goldfish)` trailer to its record: two orchestrator commits (`03600b7de`, `1a101a866`) carried Goldfish trailers over `in-progress` records. Separately, an `interim-handback` outcome froze a record (`GUARD-DISPATCH-RECORD-COLLISION`), so the Goldfish could not bind its commit `4c555b5d7` (log, a3) | GIT-03 trailer binding: the record must exist, be terminal and have `report.changedFiles` cover the commit (`templates/prompts/agent-obligations.md:167-172`, a3); GF-09-D; mid-task boundary GF-02a (`templates/prompts/goldfish-task.md:225-236`, a3) | [C] (1) The commit-msg hook runs the existing `dispatch-authorship-verify` check on a Goldfish trailer and refuses an unbound one. (2) An orchestrator commit of a stopped Goldfish draft uses either a typed adoption step (record → terminal + `changedFiles`) or the Elephant trailer. (3) The frozen interim record takes T31's single transition. (4) Scope corrections stay fresh-dispatch only | G [C: commit-msg hook source not located] | TR-F |

## 3. Security invariants

The adversary is the agent, acting on its own or on manipulated authority, not a human with machine access (SEC-10, `guardrails/security.md:165-189`, carried). No fix adds a human ceremony.

### 3.1 Invariants I2-I7 (carried, condensed)

| Id | Invariant | Enforcing code (carried) | Must stay true in every slice | Pin / gap |
|---|---|---|---|---|
| I2 | No agent produces a valid signature or approval proof | (a) `lib/guard/po-commands.mjs:59-62` `isHumanPoSigningCommand` (imported at `lib/guard/evaluate.mjs:27`, verified), verb list from `scripts/po-human-approval.mjs:661-669`; (b) closed read-lane executable set; (c) attended terminal `po-human-approval.mjs:1615-1649`; `--directory` inside the root rejected (`po-commands.mjs:28-33`) | TR-A never admits a signing verb; `isHumanPoSigningCommand` keeps precedence | `guard-lifecycle-ready.test.mjs:4022`; `po-human-approval.test.mjs:1242`. Gap: no pin for raw `openssl pkeyutl -sign` or `node -e` signing. a3: the TR-S2 corpus covers both when the key path is a literal, e.g. `openssl pkeyutl -sign -inkey <key path>` (section 3.4). A computed key path is RS-1K. Raw `openssl` is admitted (section 3.2a), so (b) restricts only the read family, not execution |
| I3 | Hook bypass stays impossible (ADR-0079) | `hooks/guard-git.mjs`, GG-17..GG-20; ADR-0079 `:62-70`, `:94-118` | TR-C adds `--trailer` only | `hooks/guard-git.test.mjs:683-684` (TP-1) |
| I4 | Protected tests stay protected (QG-04) | `hooks/guard-testpath.mjs`, 13 patterns (`agent-obligations.md:79-103`, verified) | TR-L makes the decision consistent, never weaker | TP-2; specific case not located |
| I5 | Push requires the configured approval (ADR-0056) | `hooks/guard-push.mjs`; ADR-0056 `:30` onward; ADR-0027 Decision 2 `:12` | TR-C narrows classification to an actual push; a real or ambiguous push stays fail-closed | TP-5; case names not located |
| I6 | Environment dumps stay refused | `lib/guard/env-dump-lane.mjs:21`; `evaluate.mjs:88-94` (verified) | No new spelling admits `env`, `printenv`, `set`, `Get-ChildItem env:` | `guard-lifecycle-ready.test.mjs:11843-11937` |
| I7 | Authority-bearing gates fail closed (GL-09) | `guardrails/global.md:75-82` | TR-D, TR-E, TR-G and TR-S2 each keep a fault-injection pin asserting the block | Not located; each `-T` confirms or adds |

### 3.2 I1 split into three lanes (F2)

I1: no agent reads PO signing key material, the machine plane or credential stores, on any lane.

| Lane | What reaches a target | Enforcement point | Gap | Closing slice |
|---|---|---|---|---|
| I1-P passive | Path operands of admitted read commands; Read, Grep, Glob | `isAllowedPassiveReadTarget`, `lib/passive-read-policy.mjs:92-97` ("passive path operands only", D2-A); exclusion lists `:10`, `:115-137` (carried). Call sites: `hooks/guard-command-grammar.mjs:13` import, `:314-315` `approvedReadPath`, `:388` every rg operand and pattern file (verified); `lib/guard/shell-grammar.mjs:244` and `lib/guard/read-scope.mjs` (D2-A) | No pin that each newly admitted spelling routes its operand to the check; static credential list (RS-2); renamed key without a pointer (RS-3) | TR-B (`-T` key-operand corpus); R7-6 for the pointer |
| I1-E execution | argv and inline source of **any command the ready-state grammar admits**. a3 measured no executable allowlist (section 3.2a). This covers interpreters (`node -e/-p`, `python -c`, `bash -c`, an interpreter plus script file), nested carriers (`wsl.exe -e bash -lc "…"`, `powershell.exe -Command`, `cmd.exe /c`), raw tools (`openssl`, `cp`), and anything those processes open | **None for credential targets** (re-verified in TOILRES-D2b, 3.3). Only interpreters reach the devplan lane at all. `lib/guard/devplan-shell-lane.mjs:127`, `:135` and `:139` are its only executable branches, and `:144` returns `null` for every other executable (a3). The interpreter forms map to the sentinel `.pipeline-opaque-execution` (`:132`, `:134`, `:145-148`) and push the lane with `forceLifecycleGate: true` (`:67-72`); `devPlanGateVerdict` is called at `:113`. In `implementing`, `lib/guard-devplan-policy.mjs:409-417` allows whatever the path. It also allows with no manifest (`:329`), gate off (`:342`), no state file (`:356`) or no active feature (`:374`) (all D2-A) | The whole lane, for every executable, in every state where the lifecycle gate admits the command | TR-S2 (extended a3), with residuals RS-1K, RS-1C, RS-1M |
| I1-S signing | Key bytes obtained on either lane, then used to sign | (a) signing verbs refused to the agent (I2a); (b) attended terminal `po-human-approval.mjs:1615-1649` (carried), inert for an unencrypted key (comment `:1644-1645`, carried); (c) `setup` generates an encrypted key (`:1337`, carried); detector `isPrivateKeyPassphraseProtected` `:1344-1349` returns false for an unreadable key (D2-B) | `setup --existing-key` (`:1797-1825`) copies the PEM verbatim (`:1811-1812`) without an encryption check; the recover branch (`:1826-1838`) registers whatever key is in the directory, also unchecked; keys registered before a fix (all D2-B) | TR-S1 |

### 3.2a What the ready-state grammar admits (measured in a3, Critic F-1)

1. **Tokenizer** `hooks/guard-command-grammar.mjs`. It has no executable allowlist. Its sets are the control set (`:15`) and the rg/grep flag sets (`:16-36`). A search of the file for `wsl`, `openssl`, `cp`, `copy`, `type` and `powershell` found only the dialect selector (a3).
   - The selector sends a command whose first word ends in `.exe` to the `windows-direct` dialect (`:69-75`, a3).
   - A `$` expansion other than `$PWD` fails its token (`:79-81`, a3). Whether a single-quoted `'$HOME'` passes as a literal that a nested shell later expands is [C].
2. **Evaluator** `lib/guard/evaluate.mjs` (a3).
   - The fast path (`:345-349`) and its rejection branch (`:350-363`) cover only the read family of `lib/guard/shell-grammar.mjs:890-983`: `pwd`, `printf`, `node`, `sha256sum`, `shasum`, `certutil`, `ls`, `rg`, `grep`, `cat`, `head`, `tail`, `wc`, `stat`, `file`, `sed`, `find`, `git`. A search of `shell-grammar.mjs` found no `wsl`, `openssl`, `cp`, `copy` or `powershell` admission (a3).
   - Any other single command meets only the parse branch `:377-474`. That branch refuses a non-accepted parse, an operator or redirect, or an outside-root single read. Everything else reaches `evaluateAfterGrammarAdmission` at `:482`, which in a ready lifecycle returns `verdict(0)` (`lib/guard/lifecycle-gate.mjs:337`, verified).
   - Quoted text is one token, so `;`, `|` and `2>&1` inside `wsl.exe -e bash -lc "…"` are not operators to this parser [C]. The prescribed WSL suite route depends on that.
3. **PowerShell tool.** A PowerShell-tool command passes the gate-strength lane (`:152`), the test-path lane (`:158`) and the devplan lane (`:174-179`), then returns `powerShellScopeVerdict` (`:230`, a3). How that verdict treats the target operands of `type`, `copy` or `Get-Content` was not read [C].
4. **Live probes** ran in this dispatch on the Bash tool, in a ready lifecycle, after the subagent preflight. All four executed:
   - `openssl version`;
   - `wsl.exe -e true`;
   - `cp --version`;
   - `powershell.exe -NoProfile -Command Get-Date`.

   The output is in `evidence/dispatch-record-TOILRES-D2c-20261009.json`, `log`. In Git Bash, `type` is a builtin and `copy` does not exist [C]. Their file-reading forms are the PowerShell aliases (item 3) and `cmd.exe /c type`. Item 2 admits `cmd.exe /c type` like any other executable [C: not probed].

Result: every executable on PATH is an admitted lane that can name a path. TR-S2 is therefore defined over every command, not over a list of executables. An executable allowlist for the ready-state grammar is not proposed (BJ: no broad rebuild); it is listed as PO decision 9.

### 3.3 Finding A's open point, re-verified in TOILRES-D2b (stop condition 5 not triggered)

1. `lib/guard/evaluate.mjs:31` imports `evaluateAfterGrammarAdmission` from `./lifecycle-gate.mjs`, and `:482` calls it for every command the grammar accepted. A search of `evaluate.mjs` for `isAllowedPassiveReadTarget`, `credential`, `KeyDirectory` or `opaque` found no line. The only hits were the imports `:4-33`, the env-dump lane `:88-94`, `:179`, `:369` and `:482` (verified).
2. `lib/guard/lifecycle-gate.mjs` exports the function at `:19`. Its imports (`:4-17`) contain no passive-read policy. A search for `isAllowedPassiveReadTarget`, `passive-read`, `credential`, `KeyDirectory`, `po-private`, `SECRET` or `opaque` found nothing, and its last return is `verdict(0)` at `:337` (verified). It is an onboarding and lifecycle readiness gate, not a target check.
3. Bash-matched hooks: dispatch budget (`hooks/hooks.json:29-36`), worktree isolation (`:40-47`), `guard-lifecycle-ready` (`:50-56`, the evaluator above), and `guard-git` plus `guard-push` (`:77-89`). By their stated purpose (`hooks.json:2`) they count calls, compare worktrees, deny destructive git and gate pushes (verified). D2-A's search for `po-private` across hooks found no hit. The `guard-git` and `guard-push` sources were not re-read here [C: no credential-path check, consistent with their purpose].
4. The grammar hook applies the passive target check to rg operands inside the closed rg grammar (`hooks/guard-command-grammar.mjs:388`, `:392-396`), not to interpreter argv (verified).

Result: in the implementation phase, the argv and inline source of an execution-lane command reach no credential-target check. The BK(2) seam stays. a3 adds that this holds for every executable, not only interpreters (section 3.2a).

### 3.4 BK slices and the residual register

**TR-S1: encrypted-key gate (BK 1, gating). Class SECURITY.**

- Placement (D2-B lines):
  - `--existing-key` branch: refuse after the existence check (`po-human-approval.mjs:1801-1803`) and before the copy (`:1811`).
  - Recover branch (`:1826-1838`): refuse before registering the key.
  - `sign-intent`: refuse before any OpenSSL spawn [C: near `:1639-1649`], so keys registered before the fix are covered.
- Detector: reuse `isPrivateKeyPassphraseProtected` (`:1344-1349`). It returns false for an unreadable key, so the gate fails closed.
- Refusal: a typed code [C: name such as `PO-KEY-UNENCRYPTED`] with a typed attended repair, "encrypt the existing key with a passphrase" [C: `openssl pkcs8 -topk8 -v2 aes-256-cbc`]. No new ceremony (SEC-10).
- Preflight: the same detector is reported up front by readiness (R7-7, T16). The setup and sign refusals remain the gate.
- `-T` pins (RED):
  - An unencrypted `--existing-key` is refused and nothing is copied.
  - An encrypted `--existing-key` is accepted (regression guard).
  - Recover with an unencrypted key is refused.
  - `sign-intent` with a registered unencrypted key is refused before any spawn.
  - An unreadable key is refused.

**TR-S2: execution-lane credential refusal (BK 2, gating, new pure seam). Class GUARDRAIL + SECURITY.**

- **Scope (a3, F-1):** every Bash and PowerShell-tool command, whatever its executable. Section 3.2a measured no executable allowlist, so a list of interpreter forms would leave `openssl`, `wsl.exe`, `cp`, `powershell.exe` and `cmd.exe` uncovered.
- Module [C name]: `lib/guard/execution-lane-credential.mjs`, pure, with no `fs` and no `child_process`.
  - Inputs (a3, [C]):
    - the tokenized argv of every segment, for every executable;
    - inline source of the nested carriers, tokenized again (depth bound 3 [C]; deeper nesting is a refusal):
      - `node -e/--eval/-p/--print`;
      - `python -c`;
      - `bash|sh|dash|zsh -c`, including combined flags such as `-lc`;
      - `wsl.exe` (argv after `-e`/`--exec`/`--`, or the shell string after `bash -c/-lc`);
      - `powershell.exe|pwsh -Command|-c`;
      - `cmd.exe /c|/k`;
    - for an in-root script file named as the script operand of any carrier, its bounded content, supplied by the caller. This includes the `/mnt/<drive>/` spelling of an in-root path. Today `devplan-shell-lane.mjs:145-148` resolves the script path for the interpreter family only (D2-A);
    - the resolved protected targets: both key-directory pointers, credential roots, machine-plane roots and secret basenames.
  - Output: a refusal or `null`.
  - PowerShell `-EncodedCommand`/`-enc` is refused outright, because its text cannot be matched [C: PO decision 6].
- Extraction and normalisation (a3, [C]):
  - Strip quotes; accept both separators.
  - Split option-attached forms: `--opt=<p>`, `file:<p>` (e.g. `openssl -passin file:<p>`), `@<p>`.
  - Normalise each spelling to a native absolute path before matching:
    - `/mnt/<d>/…`, MSYS `/<d>/…` and `/cygdrive/<d>/…` → `<D>:/…`;
    - `\\wsl$\<distro>\…` and `\\wsl.localhost\<distro>\…` → the distro path;
    - `~`, `$HOME`, `${HOME}`, `%USERPROFILE%`, `$env:USERPROFILE`, `%APPDATA%`, `$env:APPDATA` → resolved roots.
  - Inside a WSL carrier, `~` and `$HOME` resolve to the distro home. The credential set therefore includes home-relative forms such as `~/.ssh/…` for either home.
- Match rule (a3, [C]):
  - A token matches if its normalised form equals or lies inside a protected root.
  - It also matches if it has a directory component and ends in a protected secret basename.
  - A bare basename with no directory component does not match, so `rg -n "po-private.pem" docs/` stays admitted. A bare basename reaches a target only after a `cd`, and the `cd` operand is matched itself.
  - The targets are the key, credential and machine-plane subset of the passive policy (`passive-read-policy.mjs:10`, `:115-137`, carried). This is not the full passive admission, which would also refuse ordinary paths an execution may legitimately name.
- Wiring:
  - In `evaluate.mjs`, at the env-dump position (`:81-94`). Its comment at `:83` says the env-dump lane decides on the raw command text before every other Bash/PowerShell admission or denial (a3). [C] Revision a2 put the seam before `devPlanShellRefusalHit` (`:179`). The move ensures neither the preflight admission (`:122-123`) nor the read fast path (`:345-349`) runs first, independent of the lifecycle phase.
  - Same shape as the env-dump lane (`:88-94`): pure classifier, and a classifier exception becomes a refusal.
  - Covers both the Bash and the PowerShell tool. At the a3 position, open item 5 (whether a PowerShell `node -e` reaches `:179`) no longer matters for TR-S2 [C]. `-T` still pins both tools.
  - No new hook, so `hooks.json` (TP-4) is unchanged.
  - No override route, like the env-dump lane [C: PO decision 6].
- `-T` pins:
  - New test file for the pure module.
  - Positive corpus (a2):
    - `node -e` naming `po-private.pem`;
    - a key-directory pointer path;
    - `~/.ssh/id_ed25519`;
    - an `APPDATA` credential file;
    - `python -c`;
    - `bash -c 'cat …'`;
    - a `scratch/` script whose content names the key.
  - Positive corpus added in a3:
    - raw `openssl pkeyutl -sign -inkey <key path>`;
    - `openssl pkey -in <key path>`;
    - `openssl … -passin file:<path in a protected root>`;
    - `wsl.exe -e bash -lc "cat /mnt/<drive>/<key dir>/po-private.pem"`;
    - `wsl.exe -e cat /mnt/<drive>/<home>/.ssh/id_ed25519`;
    - the MSYS spelling `/<drive>/<home>/.ssh/id_ed25519`;
    - `bash -lc "cd ~/.ssh; cat id_ed25519"`;
    - `cp <key path> scratch/k`;
    - `cmd.exe /c type <credential path>`;
    - `powershell.exe -Command "Get-Content <key path>"`;
    - PowerShell-tool `type <key path>` and `copy <key path> scratch/k`;
    - `powershell.exe -EncodedCommand <base64>`;
    - a classifier fault, which must refuse (I7).
  - Negative corpus (a2): `node -e` naming a repository file; `node --test` on a tracked test file.
  - Negative corpus added in a3:
    - the prescribed WSL suite route `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test <file>"` (T78, L83), which must stay admitted;
    - `openssl version`;
    - `cp scratch/a scratch/b`;
    - `rg -n "po-private.pem" docs/`.
  - Wiring pins in `hooks/guard-lifecycle-ready.test.mjs`, WSL-only (T81, L93).

**Residual register (BK requires owner and expiry; both are proposals for the PO to confirm).**

TR-S2 refuses literal paths in the spellings above. It cannot see these RS-1 lanes:

- (i) A computed or obfuscated path: string building, encodings other than `-EncodedCommand`, a variable a nested shell expands (section 3.2a item 1), a glob such as `~/.ss?/id_*`, or a pointer read at runtime.
- (ii) A path opened by a child process of an admitted command, or named in a script file the seam does not read (outside the root, written or fetched at runtime).
- (iii) A tracked test file run under T81's admission whose content computes the path.

Revision a2 had a single RS-1 row whose barrier protected only the signing key (Critic F-3). a3 splits RS-1 by target class:

| Id | Residual | Barrier after TR-S1 and TR-S2 | Owner [C] | Expiry [C] |
|---|---|---|---|---|
| RS-1K | RS-1 lanes (i)-(iii) reaching the PO signing key | Encrypted key (TR-S1) plus the passphrase at the attended terminal (I1-S b); Pipeline signing verbs refused (I2a). Fails only together with RS-4, or a passphrase typed where the agent can observe it [C] | PO accepts the risk; the Elephant tracks it as a backlog item | Review at the stamp of the first local candidate that contains TR-S2 |
| RS-1C | RS-1 lanes (i)-(iii) reaching a credential store (e.g. `~/.ssh`, CLI token files, `APPDATA` credential files; list per `passive-read-policy.mjs:115-124`, carried) | **OS permissions only.** The agent runs under the PO's own OS account, so OS permissions do not separate it from these stores [C]. No encryption barrier exists in the Pipeline | PO (decision 5) | Same review |
| RS-1M | RS-1 lanes (i)-(iii) reaching the machine plane (the machine-plane roots in `passive-read-policy.mjs:125-137`, carried) | **OS permissions only**, under the same account [C] | PO (decision 5) | Same review |
| RS-2 | Static credential enumeration (`passive-read-policy.mjs:115-124`, carried); other secrets in the home directory (T46 precedent) | OS permissions only | PO (decision 5) | Same review |
| RS-3 | No key-directory pointer on a machine, so only the basename list protects (`:10`, carried) | TR-S1 (key encrypted) | R7-6 (Owned via T14) | With R7-6 |
| RS-4 | Offline brute force of a read, encrypted key's passphrase | Passphrase strength | PO | Standing; not closable in code |

### 3.5 The PO's question: can an agent read the signing key and still sign?

After TR-S1 and TR-S2 (as extended in a3):

- Literal key, credential and machine-plane paths are refused in two places:
  - on the passive lane (I1-P);
  - in the argv or inline source of every Bash or PowerShell-tool command, whatever its executable, in the spellings TR-S2 normalises (section 3.4). This includes raw `openssl` and `wsl.exe -e bash -lc "…/mnt/<drive>/…"` (section 3.2a measures that both are admitted).
- They are **not** refused in the RS-1 lanes: a computed, encoded or nested-shell-expanded path; a path opened by a child process; or a path named in a script file the seam does not read.
- For credential stores and the machine plane, nothing stands behind TR-S2 except OS permissions under the agent's own account (RS-1C, RS-1M) [C]. "Key material unreadable" (BI, `po-decisions:66`) therefore holds only for literal paths, not for every lane.
- The PO signing key alone has a second barrier:
  - a key obtained anyway (RS-1K) is encrypted;
  - signing needs the passphrase at an attended terminal (I1-S b);
  - the Pipeline signing verbs are refused to the agent (I2a).

"No agent-made signature" then holds except for RS-1K combined with RS-4, or a human typing the passphrase into a terminal the agent can observe [C]. Raw `openssl pkeyutl -sign` on an encrypted key needs the same passphrase [C].

Before TR-S1 this was not shown. An unencrypted imported key made the attended check inert (comment `:1644-1645`, carried; branch `:1797-1825`, D2-B). That is the gap F2 named.

## 4. Not proposed (carried; BJ keeps the enforcement layer)

The earlier guard inventory's ADVISORY and REMOVE rows 5, 7, 10, 12 and 13 stay rejected. Their toil is fixed at the cause instead:

- T70, T73, T75, T76: R7-3, R7-4, R7-5, TR-A, TR-E, TR-M.
- T34: TR-G.

The following stay blocking, and this note only narrows classifiers next to them:

- The push gate and its approval mode (ADR-0056, ADR-0027 Decision 2).
- Hook-bypass refusals (ADR-0079).
- Protected test paths (QG-04).
- The env-dump refusal (I6).
- Destructive-git rules (GIT-04).
- Consumer onboarding consent.
- The `guard-dispatch` structure check: T77 is fixed by briefing text, not by relaxing it.

## 5. Ordered test-first slice plan

Each slice runs `-T` (RED pins, committed), then `-F`, then the Critic. The order:

1. The BK security slices first (PO decision, gating in 0.7.0).
2. Then the live approval-chain defect.
3. Then the cheapest grammar toil.

TR-C, the long pole, needs signed TP-5 and TP-1 pins, so its package starts early [C]. Hygiene and text slices run in parallel.

| # | Slice | Rows (primary) | BJ family | `-T` pins | TP-1..TP-13 check | Guard source | Class | Critic |
|---|---|---|---|---|---|---|---|---|
| 1 | TR-S1 encrypted-key gate | none (F2, BK 1) | security (BK) | existing `po-human-approval.test.mjs` (case at `:1242`, carried; directory [C]) | none matches (`agent-obligations.md:89-103`) | no (script) | SECURITY | Opus |
| 2 | TR-S2 execution-lane credential refusal | none (F2, BK 2); evidence T61 | security (BK) | new pure-module test with the a3 corpus (raw `openssl`, `wsl.exe` with `/mnt/<drive>/`, `cp`, `cmd.exe /c type`, PowerShell aliases, `-EncodedCommand`, the WSL suite route as a negative); `hooks/guard-lifecycle-ready.test.mjs` via WSL | none; TP-13 only if suite registration is required [C]; TP-4 untouched | G (`evaluate.mjs`, env-dump position `:81-94` [C]) | GUARDRAIL + SECURITY | Opus |
| 3 | TR-E approval at a later HEAD; byte-exact transfer | T71, T76, T78 | (a) approval chain | design-workflow v2 suites, run as `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test <file>"` (route per T78, L83); transfer bundle test | none | [C] approval verifier, authority-bearing | GUARDRAIL | Opus |
| 4 | TR-A admission by resolved script identity | T21, T24, T72, T73, T81 | (b) shell grammar | `hooks/guard-lifecycle-ready.test.mjs` via WSL | none | G | GUARDRAIL | Opus |
| 5 | TR-B read grammar spellings | T74, T77 | (b), (c) | grammar tests plus a per-spelling key-operand corpus (I1-P gap) | none [C: file names] | G | GUARDRAIL + SECURITY | Opus |
| 6 | TR-C push and git classifier scoping | T38, T42, T51, T80, T82, T85 | (b), (c) | `hooks/guard-push.test.mjs`, `hooks/guard-git.test.mjs` | TP-5, TP-1: signed pin additions, PG-HD1 per PO decision 1 | G | GUARDRAIL | Opus |
| 7 | TR-M `specs/` writes in the blocked state | T75 (`specs/` half) | (d) device drift | guard-devplan tests [C: file]. A non-approval-bound `specs/` path is admitted in the blocked state; an approval-bound `specs/` path stays refused | none [C] | G | GUARDRAIL | Opus |
| 8 | TR-D design-advisory admission and v2 reader determinism | T35, T64, T83, T87 | (a) | design-advisory admission tests [C]; a3: a registered worktree outside the native view yields a typed environment code with no `reopen-design`, and the block is kept (GL-09) [C: file] | none [C] | G | GUARDRAIL | Opus; after PO decision 4 |
| 9 | TR-L protection consistency and restore | T84 | hygiene (protection) | `hooks/guard-testpath.test.mjs`, `hooks/guard-testpath-override.test.mjs` | TP-2, TP-7: signed | G | GUARDRAIL + SECURITY | Opus |
| 10 | TR-F record lane | T31, T39, T41, T43, T50, T55, T88 | (c) | record-lane and producer tests [C]; a3: commit-msg pin that an unbound Goldfish `Dispatch:` trailer is refused [C: file] | none [C] | G (`lib/guard/dispatch-record-lane.mjs`, imported at `evaluate.mjs:24`); commit-msg hook [C: source not located] | GUARDRAIL | Opus |
| 11 | TR-G dispatch-budget behaviour | T34, T37, T49 | (c) | `hooks/guard-dispatch-budget.test.mjs` via WSL (T30) | none | G | GUARDRAIL | Opus |
| 12 | TR-I evidence and scan tooling | T32, T33, T60 | hygiene | script tests | none; TP-3 untouched | no | none | standard |
| 13 | TR-J shared-tree and win32 test hygiene | T44, T45, T58 | hygiene | affected suites; typed win32 skips for T78 | none; TP-13 if a pinned case count changes [C] | no | none | standard |
| 14 | TR-K briefing, template and producer text | T25, T29, T36, T40, T46, T47, T48, T52, T54, T56, T57, T59, T61, T62, T63, T68, T69, T86 | (c) | none (text). `agent-obligations.md` is generated (`:1-9`, verified), so its generator source is edited | none; generator pinned by byte equality (`agent-obligations.md:4`) | no | none | standard |

Tracked rows, not sliced here; owners confirm, and all are in the next local candidate (BN):

- T22, T23, T27: R5-6 / R7-10.
- T26: ADR-0085 removal (BM).
- T30: R7-11-W.
- T53, T79: HOOKREFRESH.
- T65, T66, T67: backlog items.
- T70: R7-3 / R7-5.
- T75 `backlog/` half: R7-4.

Owned: T1-T20. Note: T28.

## 6. Decisions for the PO after the Critic

1. T42: keep PG-HD1 (allow) or flip it (signed pin). Default: keep.
2. T61: template wording, or a shipped Critic-notes writer script. No permission change either way.
3. T56: confirm that the orchestrator-written grant is the only budget extension.
4. TR-D: declare the design-advisory admission advisory or authority-bearing (GL-09).
5. RS-1K, RS-1C, RS-1M and RS-2: owner and expiry (BK requires both), and whether to extend the credential list. RS-1C and RS-1M have no barrier except OS permissions under the agent's own account (a3, F-3).
6. TR-S2: confirm "no override route", as for env dumps, and the outright refusal of PowerShell `-EncodedCommand` (a3).
7. TR-M scope: every non-approval-bound `specs/` path, or only `specs/<feature>/evidence/` logs [C].
8. TR-S1: the typed repair text for a PO who registered an unencrypted key.
9. TR-S2 scope (a3): every admitted command (default), or an executable allowlist for the ready-state grammar. The allowlist is not proposed: BJ rules out a broad rebuild, and it would refuse the prescribed `wsl.exe` suite route unless listed.

## 7. Open items (not verified here)

1. Exact membership of the protected baseline (carried open item 1); column `G` assumes signed.
2. The specific I4 and I5 pin cases (carried).
3. Bodies of ADR-0061, ADR-0080 and ADR-0085 (carried).
4. The `guard-git` and `guard-push` sources, re-checked for a credential-path check (3.3 item 3).
5. Whether a PowerShell `node -e` reaches `evaluate.mjs:179`. Moot for TR-S2 if the a3 wiring at `:81-94` is accepted [C]; still open for the devplan lane.
6. Which lane refused `rg -g` in T77, given `guard-command-grammar.mjs:381-386`.
7. Test file names for the TR-B, TR-D, TR-F and TR-M pins.
8. (a3) How `powerShellScopeVerdict` (`evaluate.mjs:230`) treats the target operands of `type`, `copy` and `Get-Content`.
9. (a3) Whether `cmd.exe /c type` is admitted live. It was not probed; the admission is inferred from `evaluate.mjs:377-474`.
10. (a3) Where the commit-msg hook source lives (T88 fix, TR-F).

Closed since `a78507b41`: old open item 4 (by D2-B) and old open item 5 (by section 3.3). a3 closes the Critic's unexamined point "whether the grammar admits `wsl.exe`, `openssl` or `cp`" (`critic-TOILRES-D2b-a1:30`) by section 3.2a.

independent review: pending. PO acceptance: open.
