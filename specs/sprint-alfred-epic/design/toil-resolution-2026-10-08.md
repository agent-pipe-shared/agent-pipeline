# Toil resolution design note (TOILRES-D2b, 2026-10-08)

Status: corrected proposal for an independent Critic review (Opus, MP-07: security and guardrail design), then a PO decision on the fix list. This text replaces revision `a78507b41` of this file (TOILRES-D, Critic verdict FAIL: `../evidence/critic-TOILRES-a1-2026-10-08.md:5`). It closes Critic findings F1 (`:10`), F2 (`:11`) and F3 (`:12`), covers the rows the registry names as added later (`:14`), integrates PO decisions BJ, BK and BN (`../plans/po-decisions-2026-10-07.md:67`, `:68`, `:71`), and cross-references BI (`:66`), BL (`:69`) and BM (`:70`).

Scope: toil rows T1-T86 of `../evidence/toil-log-2026-10-06-07.md` (data rows at lines 7-92).

**Count check.** The log has 86 data rows, one per line from L7 to L92. Each of T1-T86 occurs there exactly once. Four rows are out of numeric order: T17 (L26, after T20), T50 (L58, after T53), T81 (L91, after T86) and T28 (L92, last). Section 2 lists all 86 in numeric order, with each row's log line. Disposition count: 20 Owned (T1-T20) + 11 Tracked + 1 Note + 54 in slices (TR-A 5, TR-B 2, TR-C 6, TR-D 3, TR-E 3, TR-F 6, TR-G 3, TR-I 3, TR-J 3, TR-K 18, TR-L 1, TR-M 1) = 86. Section 5 repeats the per-slice lists.

Citation conventions:

- Plugin paths are relative to `plugins/pipeline-core/` unless they start with another top-level directory.
- `verified`: read in this dispatch (TOILRES-D2b).
- `D2-A` … `D2-E`: findings of the prior research dispatch TOILRES-D2 (`evidence/dispatch-record-TOILRES-D2-20261008.json`, `report.text`). That record lives in the ignored `evidence/` root (toil-log L60), so its `file:line` citations are copied inline here. Only finding A's open point was re-checked in this dispatch (section 3.3).
- `carried`: copied unchanged from revision `a78507b41` and not re-read in this dispatch.
- `log`: supported only by the toil row's own text.
- [C]: conjecture or design proposal, not verified.

## 0. Yardstick, and what changed

**BJ** (`po-decisions:67`) sets the yardstick. Keep the enforcement layer: no broad rebuild and no removal of protection paths. Simplify and consolidate blocking states, paths and repair routes. Add strong preflights. Limit the work to the four toil-heavy families: (a) approval-chain re-derivation, (b) read and shell grammar refusals, (c) dispatch orientation tax, (d) device-switch drift. Section 5 names the family of every slice. Slices outside the four are marked "hygiene" and kept small.

**BK** (`:68`) requires two gating security slices in 0.7.0. TR-S1 is an encrypted-key gate covering `--existing-key` and the recover branch. TR-S2 refuses execution lanes that name a key, credential or machine-plane path, implemented as a new pure seam. BK also requires a residual register with owner and expiry (section 3.4).

**BN** (`:71`): nothing is deferred to 0.8 by default. Every slice and every Tracked row here belongs to the next local candidate. Only items assigned to sprint `batman` or `nightwing` are deferred. The toil log has no sprint column (header at L5: `#`, Hurdle, Cost, Should be), so this note defers no row.

Changes against `a78507b41`:

- **F1.** Added rows T77-T86 (section 2). TR-E now names its WSL route (section 5).
- **F2.** Split I1 into passive, execution and signing lanes, each with an enforcement point and a gap (section 3.2). Re-checked finding A's open point: the execution lane is open (section 3.3). Added BK slices TR-S1 and TR-S2. The gating TR-S1 replaces the non-gating TR-H readiness finding.
- **F3.** "Owned" now applies only to T1-T20, the rows section 22.0 assigns (`specs/sprint-alfred-epic/spec.md:2071-2101` per D2-D; the Critic cites `:2006-2010, 2097-2101`). Rows assigned by their own text, a PO decision or a backlog item are now "Tracked", with the source named. The `specs/` half of T75 is its own slice, TR-M: R7-4 admits only `backlog/`, `docs/` and `scratch/` (`spec.md:2280-2287, 2304-2308` per D2-D).
- **English only.** PO wording is referenced by its decision row, not quoted.

## 1. Dispositions and columns

- **Owned (22.0)**: spec section 22.0 assigns the row to a contract. The row cites that contract and is not redesigned here.
- **Tracked**: an owner is named outside section 22.0, by the row's own text, a PO decision row or a backlog item. That owner confirms. The row is not redesigned here, and under BN it stays in the next local candidate.
- **TR-x**: a slice built in three steps: (1) `-T` commits RED pins and, in the same commit, sweeps older assertions that contradict the new contract (T36, L41); (2) `-F` never edits its own tests (QG-04, `guardrails/quality-gates.md:69`, carried); (3) an independent Critic reviews. A pin in a TP-listed file takes the signed route (`templates/prompts/agent-obligations.md:77-87`, verified); T42 (L47) shows the cost.
- **Note**: no repository fix exists.

"Protected?" column:

- `TP-n`: a file matching that id (`agent-obligations.md:89-103`, verified).
- `G`: guard source (`hooks/guard-*.mjs`, `lib/guard/*`). Assume a signed quality package until the protected-baseline manifest says otherwise. T84 (L88) shows `PB-GUARD-HOOKS` covering `lib/guard/sanctioned-args-onboarding.mjs`.
- `owner`: the owning contract decides.
- `no`: not protected.

## 2. Per-row resolution (T1-T86, numeric order)

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
| T20 | L25 | Subagent bootstrap receipt only via one preflight spelling (log) | spec 22.11 R7-11; PO #28 | SubagentStart receipt. Recurred in this dispatch: the first Write was refused `GUARD-BOOTSTRAP-RECEIPT-MISSING` until the preflight ran (verified: refusal text) | G | Owned (22.0): R7-11 |
| T21 | L27 | `design-course-session.mjs --run-v2` refused as opaque script execution in `awaiting-approval` (log) | 22.0 typed repair rule; 21.1 catalogue | Admit course verbs by resolved script identity plus a closed verb list, never by free argv | G | TR-A |
| T22 | L28 | `DAC2-REEXPORT-SOURCE-DRIFT` on the same authoring dispatch id (log) | Course digest binding; R5-6 named in the row | Typed action "register a new authoring dispatch id"; drift check unchanged | owner | Tracked: R5-6 (row text L28) |
| T23 | L29 | Not-ready readiness forces the whole loop (log) | R5-6 / R7-10 named in the row | One agent-executable revision-cycle action | G | Tracked: R5-6 / R7-10 (row text L29) |
| T24 | L30 | `present-plan` refused as opaque script execution (log) | 22.0 typed repair rule | As T21; signing verbs are never admitted (I2) | G | TR-A |
| T25 | L31 | `present-plan` prints a template and 321 KB of JSON (log) | SEC-10 (`guardrails/security.md:165-189`, carried); pin `hooks/guard-lifecycle-ready.test.mjs:5382` (carried) | One ready command with absolute repo and node path, review JSON to a file, no `--directory` (T14/T66), so the 5382 pin holds | no | TR-K |
| T26 | L32 | Readiness reviewer re-hunts content each run (log) | PO decisions E/F named in the row; ADR-0085 | BM (`po-decisions:70`) moves the ADR-0085 removal of the design-phase readiness stack into 0.7.0; briefing text meanwhile in TR-K | no | Tracked: ADR-0085 removal (BM) |
| T27 | L33 | Every not-ready round repeats the loop with an invented id (log) | As T22, T23; PO F | Id generated by the coordinator | owner | Tracked: R5-6 / R7-10 (row text L33) |
| T28 | L92 | Stop-hook `/goal` re-fires on every idle turn (log) | None found. The only Stop hook is `stop-suggest.mjs` (`hooks/hooks.json:179-188`, verified), which emits no decision and dedupes (`hooks.json:2`, verified) | Do not set a `/goal` while blocked on PO input; if the evaluator is host code there is no repository fix [C] | no | Note |
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
| T81 | L91 | `node --test` of a `hooks/` test refused `GUARD-DEVPLAN-SHELL` while admitted for `lib/`, `scripts/` (log) | Read-only node lane admits `node --check <file>` and `node <*.test.mjs>` (`lib/guard/shell-grammar.mjs:901-914`, D2-A) | Admit `node --test <tracked test file>` uniformly; TR-S2 still applies to that file's content (RS-1) | G | TR-A |
| T82 | L86 | Producer prints `git commit -m … --trailer …`, guard-push refuses it (log) | Obligations recommend exactly that form (`agent-obligations.md:35-39`, verified), so obligations, producer and guard disagree | Consolidate (BJ): TR-C scoping admits the printed form; one pin that it is admitted. Fallback: producer emits `-F scratch/commit-msg/<id>.txt` | G, TP-5 | TR-C |
| T83 | L87 | `DWP2-FAILURE-DRIFT` from the time-of-check drift test (`design-workflow-package-v2.mjs:92`, row text) (log) | GL-09 | Typed transient `…-CANDIDATE-MOVED` ("retry the same call"); implementation-boundary read uses the ancestry rule, not HEAD equality | G | TR-D |
| T84 | L88 | guard-testpath (`PB-GUARD-HOOKS`) admitted one hunk, refused the next and both reverts (log) | I4 | One protection decision per file across hunks; `git restore -- <file>` to its committed bytes admitted, since a revert only reduces risk [C: bound to HEAD bytes, never an arbitrary ref] | G, TP-2, TP-7 [C] | TR-L |
| T85 | L89 | guard-push refuses `git --version` and WSL command text containing `git` (log) | ADR-0027 Decision 2 | Only an actual `push` subcommand after global options is a push; `--version`, `version` and nested non-push verbs never reach it; pin both | G, TP-5 | TR-C |
| T86 | L90 | Budgets sized for the edit, not the closing ceremony (log) | TB-09 | Template adds a fixed closing allowance; long suites in the foreground; producer retries `index.lock` once (TR-F follow-up). Recurred in this dispatch: the 80 % checkpoint fired at counted call 20 of 25, before the deliverable was written (verified: hook notice text) | no | TR-K |

## 3. Security invariants

The adversary is the agent, acting on its own or on manipulated authority, not a human with machine access (SEC-10, `guardrails/security.md:165-189`, carried). No fix adds a human ceremony.

### 3.1 Invariants I2-I7 (carried, condensed)

| Id | Invariant | Enforcing code (carried) | Must stay true in every slice | Pin / gap |
|---|---|---|---|---|
| I2 | No agent produces a valid signature or approval proof | (a) `lib/guard/po-commands.mjs:59-62` `isHumanPoSigningCommand` (imported at `lib/guard/evaluate.mjs:27`, verified), verb list from `scripts/po-human-approval.mjs:661-669`; (b) closed read-lane executable set; (c) attended terminal `po-human-approval.mjs:1615-1649`; `--directory` inside the root rejected (`po-commands.mjs:28-33`) | TR-A never admits a signing verb; `isHumanPoSigningCommand` keeps precedence | `guard-lifecycle-ready.test.mjs:4022`; `po-human-approval.test.mjs:1242`. Gap: no pin for raw `openssl pkeyutl -sign` or `node -e` signing; the TR-S2 corpus covers the `node -e` half |
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
| I1-E execution | argv and inline source of `node -e/-p`, `python -c`, `bash -c`, an interpreter plus script file, and anything that process opens | **None for credential targets** (re-verified, 3.3). Route: `lib/guard/devplan-shell-lane.mjs:122-149` maps them to the sentinel `.pipeline-opaque-execution` (`:132`, `:134`, `:145-148`), pushes the lane with `forceLifecycleGate: true` (`:67-72`), calls `devPlanGateVerdict` (`:113`); `lib/guard-devplan-policy.mjs:409-417` allows in `implementing` whatever the path, and also allows with no manifest (`:329`), gate off (`:342`), no state file (`:356`) or no active feature (`:374`) (all D2-A) | The whole lane, in every state where the devplan verdict allows | TR-S2, with residual RS-1 |
| I1-S signing | Key bytes obtained on either lane, then used to sign | (a) signing verbs refused to the agent (I2a); (b) attended terminal `po-human-approval.mjs:1615-1649` (carried), inert for an unencrypted key (comment `:1644-1645`, carried); (c) `setup` generates an encrypted key (`:1337`, carried); detector `isPrivateKeyPassphraseProtected` `:1344-1349` returns false for an unreadable key (D2-B) | `setup --existing-key` (`:1797-1825`) copies the PEM verbatim (`:1811-1812`) without an encryption check; the recover branch (`:1826-1838`) registers whatever key is in the directory, also unchecked; keys registered before a fix (all D2-B) | TR-S1 |

### 3.3 Finding A's open point, re-verified (stop condition 5 not triggered)

1. `lib/guard/evaluate.mjs:31` imports `evaluateAfterGrammarAdmission` from `./lifecycle-gate.mjs`, and `:482` calls it for every command the grammar accepted. A search of `evaluate.mjs` for `isAllowedPassiveReadTarget`, `credential`, `KeyDirectory` or `opaque` found no line. The only hits were the imports `:4-33`, the env-dump lane `:88-94`, `:179`, `:369` and `:482` (verified).
2. `lib/guard/lifecycle-gate.mjs` exports the function at `:19`. Its imports (`:4-17`) contain no passive-read policy. A search for `isAllowedPassiveReadTarget`, `passive-read`, `credential`, `KeyDirectory`, `po-private`, `SECRET` or `opaque` found nothing, and its last return is `verdict(0)` at `:337` (verified). It is an onboarding and lifecycle readiness gate, not a target check.
3. Bash-matched hooks: dispatch budget (`hooks/hooks.json:29-36`), worktree isolation (`:40-47`), `guard-lifecycle-ready` (`:50-56`, the evaluator above), and `guard-git` plus `guard-push` (`:77-89`). By their stated purpose (`hooks.json:2`) they count calls, compare worktrees, deny destructive git and gate pushes (verified). D2-A's search for `po-private` across hooks found no hit. The `guard-git` and `guard-push` sources were not re-read here [C: no credential-path check, consistent with their purpose].
4. The grammar hook applies the passive target check to rg operands inside the closed rg grammar (`hooks/guard-command-grammar.mjs:388`, `:392-396`), not to interpreter argv (verified).

Result: in the implementation phase, the argv and inline source of an execution-lane command reach no credential-target check. The BK(2) seam stays.

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

- Module [C name]: `lib/guard/execution-lane-credential.mjs`, pure, with no `fs` and no `child_process`.
  - Inputs: the parsed command (tool, argv); inline source (`-e`, `-p`, `-c`); for an in-root script file, its bounded content, supplied by the caller (`devplan-shell-lane.mjs:145-148` already resolves that path, D2-A); the resolved protected targets (both key-directory pointers, credential roots, secret basenames).
  - Output: a refusal or `null`.
- Matching [C design choice]: extract path literals (quotes, both separators, `~`, `%APPDATA%`/`$HOME` spellings), then test them against the key, credential and machine-plane subset of the passive policy (`passive-read-policy.mjs:10`, `:115-137`, carried). Not the full passive admission: that would also refuse ordinary paths an execution may legitimately name.
- Wiring:
  - In `evaluate.mjs`, before `devPlanShellRefusalHit` (`:179`) and independent of the lifecycle phase.
  - Same shape as the env-dump lane (`:88-94`): pure classifier, and a classifier exception becomes a refusal.
  - Covers both Bash and PowerShell. The PowerShell dialect is imported at `:32`; whether a PowerShell `node -e` reaches `:179` is [C], so `-T` pins both.
  - No new hook, so `hooks.json` (TP-4) is unchanged.
  - No override route, like the env-dump lane [C: PO decision 6].
- `-T` pins:
  - New test file for the pure module. Positive corpus: `node -e` naming `po-private.pem`; a key-directory pointer path; `~/.ssh/id_ed25519`; an `APPDATA` credential file; `python -c`; `bash -c 'cat …'`; a `scratch/` script whose content names the key. Negative corpus: `node -e` naming a repository file; `node --test` on a tracked test file.
  - Wiring pins in `hooks/guard-lifecycle-ready.test.mjs`, WSL-only (T81, L91).

**Residual register (BK requires owner and expiry; both are proposals for the PO to confirm).**

| Id | Residual | Barrier after TR-S1 and TR-S2 | Owner [C] | Expiry [C] |
|---|---|---|---|---|
| RS-1 | Computed or obfuscated paths in an execution lane: string building, encodings, environment variables, a pointer read at runtime, a child process of an admitted script, a tracked test file run under T81's admission | Encrypted key plus attended terminal (I1-S) | PO accepts the risk; the Elephant tracks it as a backlog item | Review at the stamp of the first local candidate that contains TR-S2 |
| RS-2 | Static credential enumeration (`passive-read-policy.mjs:115-124`, carried); other secrets in the home directory (T46 precedent) | OS permissions only | PO (decision 5) | Same review |
| RS-3 | No key-directory pointer on a machine, so only the basename list protects (`:10`, carried) | TR-S1 (key encrypted) | R7-6 (Owned via T14) | With R7-6 |
| RS-4 | Offline brute force of a read, encrypted key's passphrase | Passphrase strength | PO | Standing; not closable in code |

### 3.5 The PO's question: can an agent read the signing key and still sign?

After TR-S1 and TR-S2:

- Literal key paths are refused on the passive lane (I1-P) and on the execution lane (I1-E).
- A key obtained anyway (RS-1) is encrypted, and signing needs the passphrase at an attended terminal (I1-S b).
- Signing verbs are refused to the agent (I2a).

"No agent-made signature" then holds except for RS-1 combined with RS-4, or a human typing the passphrase into a terminal the agent can observe [C].

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

Each slice runs `-T` (RED pins, committed), then `-F`, then the Critic. The order puts the BK security slices first (PO decision, gating in 0.7.0). Next comes the live approval-chain defect, then the cheapest grammar toil. TR-C, the long pole, needs signed TP-5 and TP-1 pins, so its package starts early [C]. Hygiene and text slices run in parallel.

| # | Slice | Rows (primary) | BJ family | `-T` pins | TP-1..TP-13 check | Guard source | Class | Critic |
|---|---|---|---|---|---|---|---|---|
| 1 | TR-S1 encrypted-key gate | none (F2, BK 1) | security (BK) | existing `po-human-approval.test.mjs` (case at `:1242`, carried; directory [C]) | none matches (`agent-obligations.md:89-103`) | no (script) | SECURITY | Opus |
| 2 | TR-S2 execution-lane credential refusal | none (F2, BK 2); evidence T61 | security (BK) | new pure-module test; `hooks/guard-lifecycle-ready.test.mjs` via WSL | none; TP-13 only if suite registration is required [C]; TP-4 untouched | G (`evaluate.mjs`) | GUARDRAIL + SECURITY | Opus |
| 3 | TR-E approval at a later HEAD; byte-exact transfer | T71, T76, T78 | (a) approval chain | design-workflow v2 suites, run as `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test <file>"` (route per T78, L83); transfer bundle test | none | [C] approval verifier, authority-bearing | GUARDRAIL | Opus |
| 4 | TR-A admission by resolved script identity | T21, T24, T72, T73, T81 | (b) shell grammar | `hooks/guard-lifecycle-ready.test.mjs` via WSL | none | G | GUARDRAIL | Opus |
| 5 | TR-B read grammar spellings | T74, T77 | (b), (c) | grammar tests plus a per-spelling key-operand corpus (I1-P gap) | none [C: file names] | G | GUARDRAIL + SECURITY | Opus |
| 6 | TR-C push and git classifier scoping | T38, T42, T51, T80, T82, T85 | (b), (c) | `hooks/guard-push.test.mjs`, `hooks/guard-git.test.mjs` | TP-5, TP-1: signed pin additions, PG-HD1 per PO decision 1 | G | GUARDRAIL | Opus |
| 7 | TR-M `specs/` writes in the blocked state | T75 (`specs/` half) | (d) device drift | guard-devplan tests [C: file]. A non-approval-bound `specs/` path is admitted in the blocked state; an approval-bound `specs/` path stays refused | none [C] | G | GUARDRAIL | Opus |
| 8 | TR-D design-advisory admission determinism | T35, T64, T83 | (a) | design-advisory admission tests [C] | none [C] | G | GUARDRAIL | Opus; after PO decision 4 |
| 9 | TR-L protection consistency and restore | T84 | hygiene (protection) | `hooks/guard-testpath.test.mjs`, `hooks/guard-testpath-override.test.mjs` | TP-2, TP-7: signed | G | GUARDRAIL + SECURITY | Opus |
| 10 | TR-F record lane | T31, T39, T41, T43, T50, T55 | (c) | record-lane and producer tests [C] | none | G (`lib/guard/dispatch-record-lane.mjs`, imported at `evaluate.mjs:24`) | GUARDRAIL | Opus |
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
5. RS-1 and RS-2: owner and expiry (BK requires both), and whether to extend the credential list.
6. TR-S2: confirm "no override route", as for env dumps.
7. TR-M scope: every non-approval-bound `specs/` path, or only `specs/<feature>/evidence/` logs [C].
8. TR-S1: the typed repair text for a PO who registered an unencrypted key.

## 7. Open items (not verified here)

1. Exact membership of the protected baseline (carried open item 1); column `G` assumes signed.
2. The specific I4 and I5 pin cases (carried).
3. Bodies of ADR-0061, ADR-0080 and ADR-0085 (carried).
4. The `guard-git` and `guard-push` sources, re-checked for a credential-path check (3.3 item 3).
5. Whether a PowerShell `node -e` reaches `evaluate.mjs:179`.
6. Which lane refused `rg -g` in T77, given `guard-command-grammar.mjs:381-386`.
7. Test file names for the TR-B, TR-D, TR-F and TR-M pins.

Closed since `a78507b41`: old open item 4 (by D2-B) and old open item 5 (by section 3.3).

independent review: pending. PO acceptance: open.
