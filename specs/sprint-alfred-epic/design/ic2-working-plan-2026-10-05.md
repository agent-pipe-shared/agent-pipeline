<!-- Working plan of the Elephant for the intermediate candidates IC-2a ... IC-2b (2026-10-05). -->
<!-- Sanitized copy of a local working file; `scratch/` paths named inside are local working files, not tracked. -->
<!-- Content is kept as written; absolute paths and account identifiers were replaced by placeholders. -->

# Intermediate candidate 2 (IC-2) — consolidated plan, 2026-10-05

Ground rules: full matrix (Claude/Codex/agy × Windows/WSL/macOS × own/user repos) in every briefing, spec and report;
signatures are requested, never avoided; one committing agent at a time; 80 % checkpoint rule for every dispatch.

| # | Item | State | Next |
|---|---|---|---|
| 1 | Hook snapshot cost on Windows (Verify driver: ~85 s → 9.6 s per onboarding case) | committed e60a54183, d4dd2a361, 0d5ed7bef; WSL 4/4 files green; AC-8 base-passing file `pre-commit-hook-install.trust-anchor-bootstrap` 6/6 on HEAD; Critic coverage: no stale symbols, base copy = 20c035fd9 byte-exact, no new failing test | SNAP4 test-only goldfish: (a) ≥300 ms wait so the memo read-count test discriminates aged entries, (b) memo-path foreign-ACE tests on the snapshot ROOT and on `snapshot.json` (non-inheriting grant); then one last bounded Critic round on the guardrail bodies (quality-gates, git, security, CLAUDE.md hard rules) once the Critic budget fix (item 4) is in |
| 2 | Readiness root fix (foreign never locks; Verify keeps a run record) | committed 5b45e9c90, 1baf22218; PO: own identity "C now, A with R3" | parent/WSL classification running; then small dispatches: (a) adapt descriptor-era verify-journal tests + commit the v3 assertion edit + resolve the untracked fixture test, (b) verify-evidence-producer CBV-ROOT triage, (c) journal-level proof + consumer-repo fixture; then Critic |
| 3 | Dispatch budget: 80 % notice, interim report, Elephant grant, templates | db17cafa4: notice + Critic notes lane (Write/Edit) + grant script, new suite 12/12 Windows+WSL; BUDGET2 running (templates incl. vendored copies, header doc, Windows core/binding runs, consumer-safe-paths) | open after BUDGET2: existing `guard-dispatch-budget.test.mjs` red on Windows (child `import()` of a Windows path without `pathToFileURL`, 48/49) and 3 WSL spawn timeouts — baseline-compare vs 20c035fd9; Critic's Bash notes write not admitted (decide); grant script has no cross-process lock; check that the Elephant's Bash grammar admits the grant script after install; Critic (guardrail class → opus at max) |
| 4 | Critic budget too small (guard cap 12 under maxTurns 30) | in BUDGET2: critic.md maxTurns 30 → 40 so min(24, 40−15) = 24 | check plan-verifier / readiness-reviewer / consult-advisor caps afterwards |
| 5 | guard-dispatch APB: built-in `Explore`/`Plan` refused | open | goldfish + test with the live tool_input shapes |
| 6 | Package 4 (protected guard-lifecycle-ready): read-scope false positives | root cause: "OUTSIDE-ROOT" was emitted for EVERY unsupported read-family command; real causes = rg flags missing in the grammar, win32 quoted drive paths mangled, no Glob/Grep directory lane, no missing-target code. Re-scoped: package = distinct unsupported code + Glob/Grep in-root lanes + win32 quoted-path rewrite + READ-TARGET-MISSING (QP4-BUILD2 running, scratch only) | 6b: ordinary commit in unprotected `guard-command-grammar.mjs` for `rg --no-heading`, `-m N`, repeated `-g` (after RDY3c); then package Critic → PO signs once (bundle with any other protected change) |
| 7 | Verify duration (PO target 5–10 min on WSL; Windows target after measurement) | Verify no longer creates a session descriptor (item 2) | full Verify on Windows + WSL after items 1–6, per-suite timings, next levers (parallelism, remaining slow suites) |
| 8 | Tracked PO queue: decisions after 2d992c477 (integration model/R3, matrix rule, signatures, own identity, budget hand-back) | in scratch/po-queue-addendum-2026-10-05.md | mechanic goldfish commits the delta |
| 9 | Backlog items for today's process defects (Critic budget, guard read false positives, empty dispatch-record logs, producer failures counting against the cap, misleading counter-lock message, agent-obligations `&&` drift, sign-intent slow + HGO mislabel, pre-commit backstop vs packages, host-crash residue) | in scratch/incident-report.md | one goldfish files them |
| 11 | PO terminal steps → sign once per candidate, agent does the rest | open | agent-run package apply/authorize/commit after sign (backstop recognition for packages); one install script; bundle IC-2 packages into one signature |
| 10 | IC-2 stamp, matrix table, candidate report, install commands (Windows Claude + WSL marketplace copy) | — | after 1–9 |

## Additions from the PO today that must not be lost

- **PO terminal steps must disappear (2026-10-04 13:34, verbatim: "beheben musst du halt eh das man so viel mit !
  kopieren muss ... das darf eigentlich alles nicht nötig sein und muss der agent machen und ich nur einmalig signieren
  wenn alles rdy ist").** Target: per candidate the PO signs ONCE; everything else is agent-executed. Concretely:
  (a) after `sign-intent`, the agent runs materializer apply + authorize-commit + the package commit (needs the
  pre-commit backstop to recognise signed package integrations instead of a human `--no-verify`, R3); (b) no residue
  moves by hand (readiness root fix, item 2); (c) the install flow as one agent-prepared script incl. hook-snapshot
  refresh and the WSL marketplace copy, ideally agent-run up to the restart; (d) one bundled package per candidate.
  → new item 11; (a)/(c) as far as possible already in IC-2, the backstop change at the latest in R3.
- **"PID checken" (2026-10-04 17:02):** liveness of a descriptor's owner process — covered by the Verify run record
  (PID + process start evidence) and, for own sessions, option A in R3.

- **Verify duration target** (morning): WSL full Verify was ~15 min, target 5–10 min; the >1.5 h native-Windows run is
  unacceptable. → item 7, with per-suite timings in the IC-2 report.
- **Host crashes possibly linked to Verify load** (morning, unproven): both crashes fell inside a running Verify. → after
  items 1–7, re-run the full Verify and watch for a crash; the PO can check the event log (Kernel-Power 41 / BugCheck 1001
  / WHEA) with the command given in chat. Report the correlation honestly in the IC-2 report.
- **Existing Windows project repos** (PO question): the IC-2 report gives an explicit go/no-go for working in the three
  existing project repos on Windows, recommendation: one small pilot task in one repo first, 0.6.3 as fallback.
- **Install shape**: Windows = Claude only (robocopy + `claude plugin update` + hook snapshots); WSL marketplace copy via
  rsync from the Windows checkout; the PO installs the three WSL runners. → item 10 install block.
- **Full matrix ground rule, signatures never a blocker, budget hand-back for ALL dispatches, own-identity C now / A in
  R3, worktree-per-Goldfish via Advisor → R3** — recorded in scratch/po-queue-addendum-2026-10-05.md → item 8.
- **SST2 status (2026-10-05 ~14:10Z):** 337492443 committed (reader + wiring, 80 % checkpoint fired as designed,
  interim report). SST2B dispatched (goldfish-deep): goal-5 tests + guard resolves agents from its own plugin root
  (consumer repos failed open with max-turns-unresolved). Pre-existing, NOT SST2: 3 guard-dispatch-budget.test.mjs
  10 s child timeouts (same in classify-budget-wsl.json) → later item; GMWKC01 stale DYNAMIC_IMPORT_EDGES for
  commit-msg-hook-install.mjs (4th import added in 1bd1d7bf6, 2026-10-03; target already a kernel path) → mechanic
  fix after SST2B, test-table-only. Leftover: partial worktree files under the session scratchpad (outside repo,
  deregistered).
- **SST2B/SST2C done (2026-10-05 ~15:10Z):** 236c31609 (guard reads agents from its own plugin root; consumer
  repos no longer fail open; 8+3 new tests), a0ad2a376 (test-only resolution rung removed; two-rung order:
  injected pluginRoot, else module-relative). WSL: scratch/perf/classify-sst2b-wsl.json + classify-sst2c-wsl2.json
  green except the 3 pre-existing timeouts; consumer-safe-paths green; sanitization clean. Critic for SST (G class,
  hook code) still pending → bundle with the other fix reviews.
- **NUL file root cause (2026-10-05, measured scratch/nul-probe/probe.mjs):** Node v24 on win32 creates a REAL file
  for `openSync("NUL")` (path namespacing), `os.devNull` (`\\.\nul`) does not. ~117 test files open
  `process.platform === "win32" ? "NUL" : "/dev/null"` as completion sink when not under Verify → every native
  single-file run leaves `NUL` in cwd (makes Verify dirty). Fix: sweep to `devNull` from `node:os` (implementor),
  protected test files via the signed package, plus a ratchet (enforcement layer) against the literal in
  open calls. `GIT_CONFIG_GLOBAL: "NUL"` is read by git, not node → out of scope. Backlog item to file.
- **Kernel-closure gap (2026-10-05 ~15:30Z, GMWKC mechanic stopped correctly):** GMWKC01 red since 1bd1d7bf6 masked
  12 more kernel→liftable import edges to 9 files (list in scratch/gmwkc/run.log). Security class. Prep dispatched
  (ALFRED-QP5-PREP, goldfish-deep, scratch/qp5 only): per-edge decisions, post-images (kernel list, closure test
  table incl. the 4th edge, threat-model doc), staged pre/post runs, Critic spec. Then BUNDLE with package 4 into
  one signed request on final HEAD (one PO signature), Opus Critic (MP-07: security). Lesson for the enforcement
  layer: a ratchet that stops at its first violation hides later ones — report all violations per run.
- **NULSWEEP interim (2026-10-05 ~15:45Z):** codemod applied to 116 test files (uncommitted, list
  scratch/nulsweep/changed.txt); commit failed (115 --path args too long → split by directory). SECURITY FINDING:
  the codemod (`node scratch/nulsweep/codemod.mjs`) rewrote PROTECTED `hooks/guard-testpath.test.mjs` (TP-2) —
  guard-testpath only sees Edit/Write/direct shell, not files written by an agent-authored node script. Revert
  refused to the agent (GUARD-TESTPATH-SHELL, correct); PO asked to revert by hand. The 2-line devNull change for
  that file goes into the bundled signed package. Backlog item + enforcement fix (script-mediated protected writes)
  → Opus Critic class. Follow-up mechanic: commit by directory + WSL run + consumer-safe + sanitization + post-apply
  grep + inspect afk-git-adapter/neutral-range-plan.
- **QP5-PREP interim (2026-10-05 ~16:00Z):** post-images in scratch/qp5/post (+meta.json): kernel list +9 (341→350),
  closure-test 4th edge, threat-model doc; staged PRE red / POST all GMWKC green / negative control doc-required.
  Only guard-maintenance-window.mjs is protected (kernel); test + doc unprotected but go in the same package for
  atomicity. Open: decisions.md / protected-paths.md / critic-spec.md (drafts in scratch/qp5/INTERIM.md) → write
  them in the BUNDLE dispatch. BUNDLE = qp4 (guard-lifecycle-ready + test) + qp5 (3 files) + guard-testpath.test.mjs
  devNull 2-liner → one request on final HEAD → Opus Critics A/B → PO signs once → agent applies/commits.
- **~16:40Z:** NULSWEEP committed (e63b14efa…25a449c30, 115 files, sanitization clean via `git diff -G`; WSL run
  bpgenzb0r still in background → scratch/perf/classify-nulsweep-wsl.json). PO restored guard-testpath.test.mjs;
  tree clean. APB (Explore/Plan) dispatched (implementor). Record write-after-commit collision lives in PROTECTED
  guard-lifecycle-ready.mjs → add to the BUNDLE (prep dispatch after APB). Bundle members now: qp4, qp5,
  guard-testpath devNull 2-liner, record-collision fix.
- **~17:00Z:** APB committed 57e397b0f (Explore/Plan admitted; live proof after install: dispatch one Explore).
  NULSWEEP WSL partial (73/115 rows): 6 failing files (check-product-capability-inventory, check-verify-case-completion,
  antigravity-native-dispatch-pretool, hook-governance-scope, antigravity-native-dispatch-coordinator,
  onboarding-continuity 206) — no baseline; by construction not caused by the sweep on Linux (devNull === "/dev/null",
  partial assertion failures, not load errors) → classify in the post-install full Verify. Running in parallel:
  RECCOL-PREP (deep, scratch/reccol, on top of qp4 post), RGGRAM-PREP (implementor, scratch/rggram, new test file +
  registration), DOCS (implementor, the only committer: PO addendum → tracked PO queue + 5 backlog items).
  Then BUNDLE build (qp4 + qp5 + reccol + rggram + guard-testpath devNull) → stamp IC-2a2 → install → Opus Critics on
  the bundle → PO signs once → agent applies/commits → IC-2b.
- **~17:40Z:** DOCS committed 58d95f772 (5 backlog items; ledger entries missing like other recent items) and
  4b23028a4 (PO queue section now = addendum, 32 bullets total). RGGRAM-PREP handed back at 80 % (orientation in
  scratch/rggram/INTERIM.md) → RGGRAM2-PREP (deep) running. RECCOL-PREP running. Next: BUNDLE build.
- **IC-2a2 STAMPED 5ffa4aee0 (~17:05 local / 15:02Z), version 0.7.0+<runner>.20261005150231.4b23028a.** Contents:
  SST2/B/C, NUL sweep (115), APB Explore/Plan, docs (PO queue + 5 backlog items). Install block handed to the PO.
  After install: check version/hooks/ready; live Explore dispatch (APB proof); budget guard with critic maxTurns 40.
  Known open: 5 UNREGISTERED suites (check-verify-suite-registration exit 2 → Verify red on that check) → REG-PREP
  running (deep) → bundle. RGGRAM deferred to the next package round (grammar is itself a kernel path; needs a
  capability-inventory placement; its new tests fail on a fixture-root issue under tmpdir). RECCOL done
  (scratch/reccol; Codex/agy lack agent identity → old behaviour, R3). Transient readiness "partial" seen twice
  (RGGRAM2 ~17:30, Elephant stamp edit ~17:03 local) while subagents ran; typed inspect right after = ready →
  record as flapping-readiness defect.
  BUNDLE members: qp4 + reccol (guard-lifecycle-ready + test), qp5 (kernel list, closure test, threat-model doc),
  guard-testpath.test.mjs devNull, REG (verify-suites, case-completion config, capability inventory).
- **~15:30Z REG-PREP stopped correctly:** the 5 unregistered suites lack `registerTestCaseCompletion` (no case
  protocol) → registration not buildable. Decision: option (a) — implementor adds the completion protocol to the 5
  (unprotected) test files (normal commit), then re-run REG prep with real case ids (scratch/reg/stage.mjs reusable;
  sibling capability choices in scratch/reg/decisions.md; Variant B in scratch/reg/alt-b is NOT used).
  Pre-existing at HEAD: capability-inventory checker red (20 FAIL, surfaces newer than sourceBaseline d214726e);
  append checker VSA-PRIOR-ENTRY-CHANGED at b7c660282e16. FLAPPING READINESS: the REG goldfish's "after refused directory
  reads" was a correlation, NOT the cause — Explore lookup (first live Explore dispatch, admitted after APB) found no
  path from GUARD-READ-TARGET to "partial"; "partial" only comes from lib/project-onboarding-v3.mjs re-observing
  on-disk authority/manifest/PO-authority state (sites :3667–3727 PO-authority rebind/decision/profile-repair,
  :4988 manifest, :5090/:5404 partial_authority). Hypothesis (unverified): concurrent subagent preflights/inspects
  transiently rewrite authority state while another call observes it. → defect item: instrument which branch fires
  (log status+code on every PORG-NOT-READY), then fix the race. PO installed IC-2a2 (hooks upgraded/installed); restart pending → then post-install
  checks + live Explore dispatch.
- **Post-restart (~16:00Z):** IC-2a2 loaded and ready; live Explore dispatch admitted (APB proof). CASEPROTO committed
  932178314 + 53054887c (completion protocol for the 5 suites; counts equal before/after; checks green). Running in
  parallel (read-only): REG2-PREP (registration post-images with case ids, scratch/reg/post) and BUNDLE
  (scratch/bundle: one request from reccol + qp5 + devNull + reg; staged WSL verification; combined critic spec).
  Next: re-run bundle builder after REG2 if needed → Opus Critics A/B (MP-07: guard/kernel/security) on
  scratch/bundle/review + critic-spec → PO sign-intent once → agent: materializer apply + authorize-commit + commit
  → stamp IC-2b → PO install → WSL full Verify → candidate report.
- **REG2 done (~16:30Z):** scratch/reg/post (verify-suites +5 entries/41 case ids, case-completion +5 required,
  inventory +5 surfaces) on base 932178314; stage exit 0. ELEPHANT DECISION R1: accept +5 same-class capability
  findings ("missing surface in committed sourceBaseline"; checker already red at HEAD with 20) — re-baselining
  the inventory is a separate item. OPEN CHECK before Critics: `check-doc-reader-binding.mjs` pins
  capabilityInventorySha256 → the inventory change may break it at apply time → verify on the staged bundle and add
  the pin to the bundle if needed.
- **~17:20Z BUNDLE request built:** scratch/bundle/bundle-package-request.json, base 932178314, 9 paths, intent
  89e450d499ec7a037632ded3375ec81da2da348a027e00e9a7ca95caa96119bf; `git apply --check` OK. Staged run 1
  (scratch/bundle/stage-run1.log): no new failures; kernel-closure + registration checkers red→green; two suites
  indeterminate (330 s timeout: guard-lifecycle-ready.test.mjs, guard-gate-strength.test.mjs) → run 2 with
  --timeout=2400 running (bnbwsc6ga). Opus Critics dispatched: A (qp4 + reccol; specs scratch/qp4/critic/spec-qp4.md
  + scratch/bundle/critic/spec-reccol.md), B (kernel/devNull/registration; scratch/bundle/critic/spec-b.md).
  Gate for the PO signature: both Critics pass (or findings fixed) AND run 2 shows the two big suites green.
- **~17:50Z Critic round 1 (both partial at checkpoint, granted +10 each and resumed):** run 2
  (scratch/bundle/stage-run2.log) clean — guard-lifecycle-ready 290→301 pass, same 2 pre-existing fails;
  guard-gate-strength 40/40 both; no new failures. Matrix evidence written: scratch/bundle/matrix.md.
  Critic A findings so far: F-1 directory Grep/Glob below an admitted dir could reach hidden dirs (.claude/,
  .git/agent-pipeline) if the runner searches hidden dirs — fix: admit a directory Grep/Glob only if its subtree
  walk finds no dot-directory (root stays refused, as at HEAD) + tests with hidden dirs and no secret-named file;
  F-2 pattern/option-value tokens that look absolute still get GUARD-READ-SCOPE-OUTSIDE-ROOT — fix: exclude the
  rg/grep pattern positional and option values from the outside-root scan + test; F-3 record ownership claimed on
  attempted (not landed) creation — fix: a claim whose record file does not exist is void and may be re-claimed +
  test. Critic B: provisional BL-2 (no matrix) → matrix.md. Next: collect B's final result, then ONE fix dispatch
  (deep) on scratch/reccol post-images (+ qp5/reg if B finds anything), rebuild bundle, bounded re-check round 2.
- **Critic A final: FAIL (F-1 major, F-2/F-3/F-4 minor).** F-1: the native-Grep directory lane (qp4 AC-2) violates
  guardrails/security.md SEC-11 ("native Grep requires an exact file"); the reused secret screen inventories with
  default rg ignore rules, which only holds where the grammar controls rg flags. ELEPHANT DECISION: keep SEC-11
  unchanged; REMOVE the native-Grep directory lane from the package (content search via admitted `git grep`); keep
  the Glob directory listing lane only when the named directory's subtree contains no dot-directory; tests with
  hidden descendants and no secret-named file; delete the unbacked "never reachable" claim. Option for the PO
  later: amend SEC-11 with a tool-traversal-matched inventory. F-2 pattern/option-value tokens → exclude from the
  outside-root scan + test. F-3 void claim when the record file never landed + test. F-4 matrix.md: Codex pretool
  guard calls isReadOnlyDiagnosticCommand (win32 rewrite applies to Codex/agy too); per-platform rows; consumer cells
  T via temp fixture roots. Trajectory gaps to close: stage QP4-1..5 RED on the HEAD guard; name the 2 pre-existing
  guard-lifecycle-ready failures; stage logs must name their platform.
- **Critic B final: PASS, no findings** (kernel-closure, devnull, registration; BL-1/BL-2 met). Specs amended
  (spec-qp4 AC-2 per SEC-11; spec-reccol RC-1a). FIXR2 (deep) dispatched on scratch/reccol post-images (R2-1..R2-4).
  matrix.md corrected (F-4). Next: rebuild bundle → bounded round-2 re-check by a fresh Opus Critic on the delta
  scratch/reccol/post-r1 → scratch/reccol/post (+ F-4 matrix) → PO signs. PO REMINDER (round rules, QG-13 /
  critic-review.md Phase-2.6): round 2 reviews ONLY the correction diff post-r1 → post (the fixes for F-1..F-4 and
  their direct regressions); no current-artifact hunt, no reopening of cleared areas; Critic B's members are
  cleared and not re-reviewed; a round-2 brief carries only the delta snapshot, the amended spec lines and the
  finding IDs F-1..F-4 as a neutral registry — no prior verdict prose.
- **Round 2 (Critic A, partial at checkpoint):** F-1, F-2, F-4 closed; F-3 fix introduced F-NEW-1 (major): the
  RC-1a "landed" check is worktree-local while the claim registry is shared across linked worktrees → a colliding
  writer in another worktree voids a landed claim and takes ownership. ELEPHANT DECISION (no round 3 per QG-13):
  revert RC-1a (spec-reccol RC-1a withdrawn) → FIXR3 builds round-3 images = round-1 ownership + round-2 R2-1/R2-2
  hunks, verified deterministically (hunk-composition check) instead of another Critic round. Deferred with owner
  and due (R3): (a) F-3 attempted-vs-landed claim (redesign with worktree-per-Goldfish identity); (b) unverified
  minor candidate: R2-2 drops rg `--ignore-file` / grep `--exclude-from` values from the outside-root label scan
  (label only, both outcomes blocked). → backlog items in the next docs commit.
- NULSWEEP2 (mechanic) dispatched: per-directory commits of 115 files + WSL run + checks; PO restores
  guard-testpath.test.mjs by hand.
- **Running in parallel (earlier):** ALFRED-NULSWEEP (implementor, the only committing agent), ALFRED-QP5-PREP (read-only).
- **Elephant main-context load (2026-10-05 afternoon):** first measurement in scratch/elephant-load/FINDINGS.md
  (~26 % wake-up status replies, ~22 % inline investigation, 5.4 % guard refusals). Next: read-only Sonnet analysis
  dispatch (after the Explore/Plan unblock, or as goldfish-implementor research), then enforcement-layer fixes:
  (1) stop/goal hook stays silent while only background work runs and nothing changed; (2) cheap guard-admitted
  read-only research route; (3) guard false positives; (4) generated briefings. → item 12, R3 candidate.
- From 2026-10-04 still open: sign-intent output too long + slow before the passphrase prompt (R3 signing UX, now plus
  the HGO mislabel); brownfield repos must be OPTIMISED toward the architecture guidelines, not only captured (D4/S8);
  "established/active" architecture state (design amendment).

## RDY3 progress and findings (2026-10-05)

- eaef7b2e3 (RDY3a): POSIX fixture mode fix for foreign-residue-unit (introduced by 5b45e9c90); session-cleanup-binding
  Unix failure is pre-existing at 2d992c477 (test assumes an unobservable owner, as on Windows) → R4.
- 4fc47c4f6 (RDY3b): v3 assertion for foreign authority-bearing/mixed descriptors + project-onboarding-foreign-residue
  test made runnable (green on WSL). verify-journal 5-case translation drafted UNCOMMITTED (case 4 helper bug, case 5 open).
- Elephant decision (within the PO readiness decision): Verify's OWN UNSEALED run directory is drained wholesale on
  settle; sealed terminal/interruption evidence is always retained; no refusal on unknown content (a refusal would
  recreate the stuck-state class the PO called the main problem). Critic to review.
- KEY R4 FINDING: on native Windows the OS temp root (`%TEMP%`) carries a DACL that grants non-owner principals
  (SYSTEM / Administrators), so every fixture under `os.tmpdir()` fails the private-state assurance ("Windows assurance
  is unavailable or unsafe") — very likely the common cause of the ~125 v3 Windows failures and many other win32 test
  failures. Options: (a) tests create a hardened private temp root (preferred, no security change), (b) the assurance
  accepts well-known system principals (security decision for the PO).
- New guard defect: after a commit cites the task id, `GUARD-DISPATCH-RECORD-COLLISION` refuses every further write to
  that dispatch record, contradicting the template's "commit, then checkpoint/finalize the record". → backlog + fix.

## Defect 2026-10-05: source vs installed agent definition → budget conflict

- After 047e48efb raised `agents/critic.md` maxTurns 30 → 40 in the SOURCE tree, every Critic dispatch is refused at
  its first tool call: `DISPATCH-BUDGET-INPUT-INVALID … budget-tier-max-turns-conflict`. guard-dispatch binds the base cap
  from one agent definition, guard-dispatch-budget re-reads `maxTurns` from the INSTALLED plugin (30). In the Pipeline's
  own repo any agent-definition change locks that agent until install. Fix direction: both guards read the same
  (installed) definition, or the binding records the maxTurns it used and the budget guard honours the binding.
- Plan: stamp + install IC-2a (snapshot perf, readiness fix, budget hand-back, Critic maxTurns, rg grammar) so the
  Critics run with the new budget; package 4 Critic + signature → IC-2b.

## REGRESSION in IC-2a: every Critic dispatch blocked (my BUDGET2 scoping error)

- `plugins/pipeline-core/lib/dispatch-policy.mjs:46` keeps a tier table `critic: 30`; 047e48efb raised only
  `agents/critic.md` maxTurns to 40 → guard-dispatch-budget refuses every Critic call with
  `budget-tier-max-turns-conflict` (Critic A rerun, agent ab15de33…). Installed IC-2a carries the conflict.
- Fix (after the running full Verify, no commit during Verify) — PO: single source of truth, not a consistency test:
  remove the maxTurns tier table from dispatch-policy.mjs; derive every tier from `agents/*.md` frontmatter through one
  function used by guard-dispatch AND guard-dispatch-budget; test that no second maxTurns definition remains. S0
  ratchet extended to duplicated configuration values. Bundle with rg
  grammar (scratch/rggram/wip), guard-dispatch Explore/Plan, dispatch-record write-after-commit → IC-2a2 install → then
  package-4 Critics → PO signs → IC-2b.

### SST analysis (maxTurns sources found 2026-10-05)

1. `plugins/pipeline-core/agents/*.md` frontmatter `maxTurns` — the single source to keep.
2. `plugins/pipeline-core/lib/dispatch-policy.mjs` `BUDGETED_ROLE_MAX_TURNS` table (line ~46/73) — used by guard-dispatch.
3. `plugins/pipeline-core/lib/dispatch-budget-calibration.mjs` rule field `maxTurnsByTier` (lines ~52–90) — third copy.
4. `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` `resolveMaxTurns` (line ~368) — reads the agent file with its
   own regex parser.
Target: one exported reader (e.g. `lib/agent-definition.mjs` `readAgentMaxTurns(agentType, pluginRoot)`) used by all
consumers; tables 2 and 3 removed or derived; a ratchet test that fails if any module other than the agent definitions
defines a maxTurns literal for a role.

## HOST-STABILITY INCIDENT 2026-10-05 ~12:05Z — full Verify on native Windows destabilises the PC

- During the IC-2a full Verify (started 11:29:22Z, ~60 % done) the PO's PC began to crash again; "many terminal windows
  open and close". Verify stopped immediately (task bh0hrzeay). Third host instability inside a running Verify
  (2026-10-04 night, 2026-10-05 morning, now).
- Hypothesis (unproven): suites spawn thousands of child processes (node, git, powershell) on win32, some without
  `windowsHide: true` → visible console windows; high parallel spawn rate overloads the host.
- PO decision (2026-10-05, verbatim: "ich ändere an meiner config nichts aber wir müssen es sauber machen und
  korrigieren für die zukunft. das muss im lauf korrigiert werden."): the fix lives in the product, never in host
  configuration (no "switch the default terminal" advice as a remedy). Evidence: Windows Terminal windows showing
  `[Fehler 2147942632 (0x800700e8) beim Start von \`git …\`]` for `git show`, `git -C <temp fixture> config user.name`,
  `git cat-file -e`. Plan: (1) Verify-wide win32 preload forcing `windowsHide: true` + win32 parallelism cap
  (ALFRED-WINHIDE running); (2) plugin-wide single spawn wrapper + ratchet test forbidding raw child_process calls
  without windowsHide (covers hooks in normal sessions and consumer repos); (3) proof test + one observed single-suite
  run on Windows before any full Windows Verify.
- RULE until fixed: NO full Verify on native Windows. Use WSL for full-suite evidence; on Windows only targeted single
  files. Highest-priority item of the Verify optimisation round: (1) audit every spawn/spawnSync/execFile in harness/,
  plugins/pipeline-core and tests for missing `windowsHide: true`; (2) cap Verify parallelism on win32; (3) measure
  process count per suite.

## IC-2a live checks after install (2026-10-05 ~11:29Z)

- Preflight ready on 0.7.0+claude.20261005111746.3b05196c; hooks current.
- Full Verify started 11:29:22Z: NO session descriptor created, guard admits ordinary commands while it runs → readiness
  root fix confirmed live.
- First Verify attempt refused by candidate preflight (dirty) because of an untracked root file `NUL` (1521 bytes, test
  case completion JSON lines of `dispatch-budget-binding.test.mjs`, DBB01–DBB08). Some run opened "NUL" as a real file in
  the repo root instead of the null device. Source not yet identified → backlog defect; removed, Verify restarted.

## Windows parent classification complete (scratch/perf/classify-rdy2-base-long.json, parent 2d992c477)

- verify-evidence-producer: parent 8 fail (CBV-ROOT) = HEAD 8 → pre-existing win32-only (WSL 33/33 green) → R4.
- session-cleanup-binding: parent 4 fail = HEAD 4 → pre-existing (Unix: 1 pre-existing) → R4.
- verify-journal: parent 3 fail, HEAD 8 → 5 introduced → RDY3c translating them.
- session-cleanup-recovery (3, symlink EPERM) and session-cleanup-owner-nonce (1) → pre-existing.

## WSL readiness classification (scratch/perf/classify-rdy2-wsl.json, HEAD 1baf22218 + uncommitted v3 test edit)

- New regressions on POSIX: `project-onboarding-foreign-residue-unit` 2 fail ("Verify run root is not owner-private"),
  `session-cleanup-binding` 1 fail (TypeError reading `candidates`). → item 2 follow-up (a)/(c), POSIX first.
- `verify-journal` 6 fail on POSIX (descriptor-era assertions + "a real SIGINT … retires the owner") → item 2 (a).
- `verify-evidence-producer` 33/33 on POSIX → its 8 Windows CBV-ROOT failures look win32-specific; parent comparison pending.
- `session-cleanup-owner-nonce` POSIX 0600 case fails on WSL too → check parent.

Deferred by decision: worktree-per-Goldfish integration model (Advisor in the design amendment, target R3); own-session
nonce per runner (R3); remote signing (after 0.7.0); win32-only pre-existing test failures (R4 platform parity).

## 2026-10-05 — Bundle round 3 built, PO sign requested

- Real request rebuilt from round-3 images: intent e203f8726bd93a7762c7ad750a2767bbd4d0ed0fedb69a54181d16ed1aa96e1c,
  base 932178314, 9 paths / 4 members, all ok-lines green, apply-check green against the real tree.
- RECCOL-5 accepted as vacuously green on the HEAD guard (round-1 ownership semantics restored); noted, no action.
- "<profile-dir>" FINDING in the build log = identifier qp4Without<profile-dir>Roots only, no path; benign.
- Deferred to R3 backlog: F-3 (claim on attempted vs landed creation); unverified ignore-file/exclude-from label candidate.
- New live defect: shell classifier faults (GUARD-TESTPATH-SHELL-FAULT "mutating git apply has unbound patch targets")
  on a heredoc whose BODY merely contains the text "git apply --check" while appending to an ignored scratch file.
- Perf pre-read (scratch/perf/rank-slowest.mjs on classify-nulsweep-wsl.json, 93-file subset, 2882 s serial):
  project-onboarding-v3 594 s, project-authority 496 s, onboarding-first-restart-intake 329 s, runner-profile-migration-v3
  243 s = 58 % of the subset. These four are the first optimisation targets once the full WSL Verify with timings ran.
- Live F-2 confirmation: `head -c 1200 <scratch file>` refused as GUARD-READ-SCOPE-OUTSIDE-ROOT (option value read as path).
- DONE: package 866be2139, IC-2b stamp 8bc861b76 (installed by the PO), backlog af3dd8dc9 (BLR3; BLR3b collided —
  BLR3 had survived the restart; see memory feedback-background-agents-survive-restart).
- Full Verify must run in a native Linux clone ($HOME/ap-verify-ic2b, disposable, NOT the PO's checkout): on DrvFs the
  private run-record dir is 777 → VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE, masked as VERIFY-CLEANUP-REGISTRATION-REQUIRED
  (draft in scratch/backlog-drafts-r3b.md). Git Bash expands `~` to the Windows home — use bash -lc with "$HOME".
- PO DECISION 2026-10-05 evening: R3 → 0.7.0 except very large items (see scratch/po-queue-addendum-2026-10-05.md
  last bullet for the in/out list). Plan: (1) classify full-Verify reds vs IC-2a2 baseline, (2) Verify-fix wave,
  (3) R3 usability waves, guard-path items bundled into ONE signed package per candidate, (4) Critic per MP-07,
  (5) stamp IC-3, green full Verify (native WSL clone), report.
- Full Verify IC-2b (af3dd8dc9, candidate mode, native WSL clone): 746 suites, ~8 min wall, 37 red; 4 fixed since
  (59415af50 ledger, 101ed4ef5 enforcement doc). Summary JSON scratch/verify-probe/ic2b-candidate.json.
- Baseline IC-2a2 (5ffa4aee0) candidate run: no IC-2b regression; IC-2b fixed kernel-closure + 3 registration checks;
  baseline hung in nova-verify-journal SIGINT (stopped). CBS16 + backlog suites must be re-proven by a re-run (clone:
  git pull from the Windows checkout, then --mode candidate). Fable reports tracked 315180025.
- Dispatch records: BLR3 = committed-pending-report (af3dd8dc9 is its commit); BLR3b = stopped, collided with the
  still-running BLR3 after a restart, no commit — both intentional, not orphans to repair.
- Overview page built (scratch/backlog-overview/alfred-backlog.html) but NOT published: PO called it secondary;
  classified.json is slicing input only.
- Open docs follow-up: r3b drafts + hook-refresh PO-queue bullet (scratch/po-queue-addendum-2026-10-05.md).
- (historical) NEXT after the PO's sign returns: materializer apply -> authorize-commit -> commit (hooks on) -> IC-2b stamp -> PO install block.
