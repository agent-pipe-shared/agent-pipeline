# Count of duplicated state and rules, ranked by blocking and drift (2026-11-18, slice C30K-K1)

PO goal for candidate 30k: fewer duplicated states and rules, no new gate. This is an analysis. It changes no code, no test and no registry. Analysis only, no test run: nothing was executed beyond reading files.

## How to read this document

- **Source tree.** Code is cited from the integrated 30j tree (the scratch clone). Documents that the 30j lanes did not touch (the queue, `docs/state.md`, `templates/prompts/agent-obligations.md`, `docs/operating-tools.md`) were read in the real checkout at the 30k planning commit; where the real checkout and the clone differ, the line is marked "real checkout". Paths are repository-relative; `<core>/` stands for `plugins/pipeline-core/`.
- **Labels.** PROVEN means I read the cited file at the cited line, or read the cited test and saw what it asserts. INFERRED means reasoned, not read. A number from `rg -c` or a similar count is a SEARCH COUNT and a lower bound; I attach no line to a count I did not see.
- **What a "duplicate" means here.** One fact kept in two or more places: a literal list, a mirror of a producer's closed list, a private copy of a shared constant, a text restating a code or a count, a pinned digest or count edited together with its source, a derived file refreshed by a script.
- **Ranking rule (briefed).** (1) blocks someone today, shown by a cited refusal or red; (2) drift seen, shown by a cited incident; (3) cheap to merge. A merely repeated literal with no refusal and no incident ranks on (3) only.
- **Neutral ids.** No consumer project, feature or person is named.

## 1. What 30j and the earlier chains already closed (not counted again)

| # | Duplicate | Closed by | Evidence |
|---|---|---|---|
| C-1 | Nine package states written three times | 30j J1 | `<core>/lib/feature-package-topology.mjs:17` builds `FEATURE_STATES` from `PLAN_LIFECYCLE_STATUSES` (`<core>/lib/plan-spec-state-v2.mjs:190`); `<core>/scripts/check-artifact-topology.mjs:13` and `<core>/lib/evidence-view-model.mjs:18` derive from it. PROVEN |
| C-2 | Onboarding controlling non-ready status mirror (33 literals) | 30j J6 part a | `<core>/lib/project-onboarding-ready-gate.mjs:26-33` derives the list from `PROJECT_ONBOARDING_LIFECYCLE_STATUSES` of the producer; the comment records the wrong typed refusal the mirror once produced. PROVEN |
| C-3 | Private calibration path lists of 12 modules | 30j J9 (8 modules) and J17 (4 modules) | `<core>/lib/project-authority-read.mjs:23` exports `CALIBRATION_PATHS`; the notes `w30j09-*.notes.md` and `w30j17-*.notes.md` name the modules. PROVEN (notes read) |
| C-4 | The hook installer's embedded calibration list | 30j J25: kept, pinned by test | `<core>/scripts/pre-commit-hook-install.mjs:496-501` keeps a private frozen list "kept equal to CALIBRATION_PATHS ... by a pin"; `<core>/scripts/pre-commit-hook-install.test.mjs:1075-1092` extracts the generated list and compares it element by element and in order. PROVEN. Class: keep and pin |
| C-5 | `GUARD-READ-TARGET` literal at three sites; the obligations sentence "no component exports the grammar" | 30j J26, J18 | queue C30J status (real checkout, lines 571 and 573). INFERRED for the clone's current text (not re-read); the queue states it |
| C-6 | Several definitions of an evidence-only follower commit | 30j J5 | queue C30J status (real checkout, line 567). Not re-read in code |
| C-7 | Legacy close-journal write side | 30j J10 | queue C30J status (real checkout, line 567) |
| C-8 | The phase set `design`/`implementation` written inline twice | 30j J1 or earlier | `<core>/scripts/pipeline-state.mjs:628` is the only literal found by search (the state-machine analysis recorded two). PROVEN for the present count, cause INFERRED |
| C-9 | The protected test paths | earlier chains | one definition: `<core>/lib/protected-test-paths.mjs:4`; the obligations table is derived from `project/guard-config.json` (`templates/prompts/agent-obligations.md:84`, real checkout). PROVEN |
| C-10 | Gate-strength path rules | earlier chains | imported, not copied, by `<core>/scripts/check-protected-path-integrity.mjs:90`, `<core>/lib/guard/gate-strength-lane.mjs:9`, `<core>/lib/gate-definition-changes.mjs:35` and `<core>/lib/maintenance-delivery.mjs:24`. PROVEN |
| C-11 | The `&&` segment bound in the obligations file | earlier chain | read from the guard's exported constant (`templates/prompts/agent-obligations.md:21-26`, real checkout). PROVEN |
| C-12 | Derived repository files (backlog ledger projections, capability-inventory `sourceBaseline`, Reader inputs) | one refresh script | `scripts/refresh-derived-files.mjs:2-11` refreshes all three, `--check` writes nothing; `scripts/sync-reader-inputs.mjs:2-10`. PROVEN. The refresh exists; what stays open is in K1-12 |
| C-13 | Vendored canon copies under the plugin | generator | `harness/scripts/generate-vendored-canon.mjs:3-18` copies from the repo-root originals; the generated obligations file is pinned byte for byte by `harness/scripts/generate-agent-obligations.test.mjs` (named at `harness/scripts/generate-agent-obligations.mjs:23`). PROVEN |

## 2. The inventory: the ten biggest, ranked

Every entry: the facts and where they live, how drift was or could be produced, whether a test pins the equality, size of the merge (S one small dispatch, M one full dispatch, L several), proposal.

### K1-01 The case-completion list lives in three places and must be extended together

- **Places.** (a) The ids a suite declares inside its own test file (the matcher at `harness/scripts/check-verify-case-completion.mjs:343-357` parses `caseCompletion: { schema, caseIds, maxBytes }` from the source); (b) the registry `harness/config/verify-case-completion.v1.json` (path constant `harness/scripts/check-verify-case-completion.mjs:15`); (c) the augmentation rows in `harness/config/verify-case-completion-augmentations.v1.json`, each with an exact `previousPolicySha256` (47 rows by search count; schema check `harness/scripts/verify-case-completion-augmentation.mjs:24-30`, growth-only rule at `:17-19`). PROVEN.
- **Drift and blocking.** `docs/operating-tools.md:120` (real checkout) states that a suite which declares ids its policy lacks is "green alone and red in the Full Verify" and that "candidate 18 grew 11 suites silently". The 30j lane J9 had to move four new cases out of `<core>/lib/project-authority.test.mjs` into another file because that corpus pins its case ids and a policy digest chain (`w30j09-*.notes.md`, line 17). Blocks today: yes (a plain edit that adds a case to a registered corpus turns Full Verify red).
- **Pinned by a test.** The checker is the pin (`check-verify-case-completion.mjs`, run by `scripts/rehearse.mjs` per `docs/operating-tools.md:116` and by the post-sitting table). It detects the drift; it does not remove the three-place edit.
- **Size.** L to merge; S to ease: the sync step (`cc-sync`, `docs/operating-tools.md:120`) already writes the augmentation rows.
- **Proposal: keep and pin, plus derive the third place.** Keep the growth-only preimage chain (it is the anti-weakening property, see DO-NOT-DO 3). Make the existing sync step part of the existing derived-files refresh, so a developer runs one command instead of knowing a second one. No new gate.

### K1-02 Pinned counts that move with every suite registration

- **Places.** `scripts/post-sitting-checks.mjs:23` holds `EXPECT = { registered: 1093, docContractsTests: 76, consumerSafeTests: 9 }`, judged at `:35-39` and `:59-60`; `docs/operating-tools.md:87` (real checkout) restates "1093 registered", "76 cases", "9 cases"; the registration checker prints its own count (`harness/scripts/check-verify-suite-registration.mjs:585` and `:602-604`). PROVEN.
- **Drift.** `harness/verify-suites.json` holds 584 suite entries now; at the only commit that touched the script (`7dd3689b8`, 2026-10-23) it held 443 (search counts). Whether the registered total of 1093 is stale now is INFERRED: the checker also counts entries assembled in `harness/scripts/verify.mjs` (`check-verify-suite-registration.mjs:5`), and I did not run it. `docs/operating-tools.md:65` (real checkout) names a second cost: the capability-inventory gate "goes red at every later commit that adds a suite, hook or skill" until its `sourceBaseline` moves. Blocks today: yes at every candidate that adds a suite, on the post-sitting table only.
- **Pinned by a test.** None found: `scripts/post-sitting-checks.test.mjs` does not exist (PROVEN by a failed read).
- **Size.** S.
- **Proposal: derive on read.** The registration checker already refuses an unregistered or duplicate suite (`check-verify-suite-registration.mjs:503` and `:579`); the count adds only a "a suite vanished" tripwire that the exit code already gives when a test file is left unregistered. Judge the row by exit 0 and zero failing cases, print the count, drop the three literals and the three restatements. Whether the "vanished" tripwire is worth a literal is a PO decision (section 6, D-2).

### K1-03 Rules restated as text next to the code that owns them

- **Places.** The admitted forms of the `Dispatch:` trailer: `<core>/lib/commit-message-policy.mjs:92` (the three Elephant forms inline), `:252` and `:263` (texts restating them), `guardrails/git.md`, `harness/scripts/generate-agent-obligations.mjs`, `templates/prompts/agent-obligations.md:177-202` (real checkout, hand-maintained section 6) and `<core>/scripts/dispatch-authorship-verify.mjs` (the last three by search count: one to two matches of `elephant-exception`). The hand-maintained parts of the obligations file carry their own marker (`agent-obligations.md:21-26`, `:157-158`, `:214-217`, `:229-231`, `:248-249`, real checkout). PROVEN for the lines, search count for the other files.
- **Drift seen.** Queue C30-19 (real checkout, lines 529-531): the obligations text claimed `-m` with `--trailer` is refused although the guard admits it; the built fix `w30i8` restated it (queue line 561). Old wording stayed in two test files (queue line 561). Queue line 571: the sentence "no component exports the grammar" became untrue and J26 corrected it. Two incidents.
- **Pinned by a test.** Partly: the generated parts are byte-pinned (C-13); the hand-maintained parts have no pin. PROVEN for the generated pin, INFERRED for the absence of a pin on the rest.
- **Size.** M.
- **Proposal: derive on read for the part that is a closed list.** Export the closed list of admitted `Dispatch:` forms from `commit-message-policy.mjs` and let the generator render section 6's form list from it, as it already does for the `&&` bound. Leave the prose hand-maintained and say so in the marker. This touches a guard module and the generator, so it is a protected-source change (the plugin-source commit route applies; see DO-NOT-DO 9).

### K1-04 Calibration pair: five private lists left, the twin files, and the mirror-rule text

- **Places.** Two files, `project/pipeline.json` and `.claude/pipeline.json`, seeded byte-identical (`<core>/lib/project-authority-read.mjs:12`, `:17`, `:23`, comment at `:26`). Remaining literal lists of the pair in the clone: `<core>/scripts/repository-mode-promote.mjs:27` (`TWIN_PATHS`), `<core>/scripts/critic-dispatch-preflight.mjs:621` and `:628` (two inline lists), `<core>/hooks/guard-dispatch-budget.mjs:1735`, `<core>/scripts/push-prepare.mjs:373-374` (a ternary on both names). Protected-path and writer lists that name the legacy file for another purpose (`<core>/lib/guard/constants.mjs:57-64`, `<core>/lib/human-guard-override.mjs:899-908` and `:1127`, `<core>/scripts/pre-commit-hook-install.test.mjs:689` as a test fixture) are not read-order lists; the w30j09 notes (line 36) classed them the same way. I did not read the read rule of each of the five remaining sites. PROVEN for the lines.
- **Restated text.** The rule "the mirror is a separate protected file, each with its own override" is written as prose in `<core>/hooks/guard-gate-strength.mjs:160` and `:165` (two long strings that mirror each other), `<core>/scripts/critic-dispatch-preflight.mjs:223` and `<core>/scripts/push-prepare.mjs:374`. PROVEN.
- **Drift and blocking.** Blocks today: yes, as toil: the guard text itself says a change to one file needs the same change in the other, "each with its own PO-approved override", otherwise `PCI-CALIBRATION-DRIFT` turns Verify red (`guard-gate-strength.mjs:160`). ADR-0100's `configure-verify` writes both mirrors under one signature (same line) for the verify command only. A produced drift: none known beyond that text; the 30j notes called the latent disagreement of the private lists "latent (no module disagrees today)" (`w30j09-*.notes.md`, line 28).
- **Pinned by a test.** The twin bytes: `CVCT-TWIN-CAS` (`<core>/lib/calibration-verify-commit-transition.mjs`) and `PCI-CALIBRATION-DRIFT`. The 12 migrated lists: the literal-scan cases of `<core>/lib/calibration-verify-commit-transition.test.mjs` (w30j09 and w30j17 notes). The five remaining lists: none.
- **Size.** S for the five lists (one-line swaps, as J17 did); the texts S to M (they sit in a protected guard file); retiring a twin is not a merge, it is a PO decision (D-3).
- **Proposal: one shared source for the lists; keep and pin for the files.** Finish the five lists the same way J9 and J17 did, with the same literal-scan case. Build the two guard texts from `CALIBRATION_PATHS` instead of retyping both names. Do not retire a twin here (section 6, D-3).

### K1-05 The status of a candidate is narrated in several documents

- **Places.** `docs/state.md` line 19 (real checkout, one paragraph for 30c to 30k), the queue section "C30J status" (real checkout, lines 565-573), the 30k plan header, each held-patch `.notes.md`, and the per-candidate handover files. In the clone, `docs/state.md` (129 lines, 29523 bytes) still ends its START HERE paragraph at the 30e/30f state (clone line 18), the real checkout carries the 30j paragraph at line 19: the same fact is already at two different ages in two trees. PROVEN.
- **Drift seen.** Counts restated by hand: `docs/state.md` line 19 says "29 patches plus the derived-files commit" for 30j while the queue says "All 22 patches applied cleanly" (line 567) and adds five late lanes J24 to J28 (line 573). 22 + 5 + the two Coordinator commits (line 567) equals 29, so the numbers reconcile only by arithmetic: INFERRED, not proven. The same paragraph restates suite counts ("1229 steps", "106 of 107 files") that no script owns.
- **Pinned by a test.** `<core>/scripts/check-state-budgets.mjs` exists (named by search); it bounds size, not content. INFERRED that nothing compares the counts.
- **Size.** M, documents only.
- **Proposal: derive on read, and say so as a PO decision.** The queue and the notes are the source of the per-lane facts; `docs/state.md` keeps the decision register, the open list and one pointer per candidate (chain directory name, applied commit). Counts that a script prints (steps, files) are quoted by pointer, not retyped. `docs/state.md` wins on conflict (CLAUDE.md), so restructuring it is the PO's call (D-4).

### K1-06 A second mechanism compares the vendored dispatch templates

- **Places.** `<core>/scripts/check-vendored-template-sync.mjs:33-44` holds `TEMPLATE_PAIRS` with two pairs (`goldfish-task.md`, `critic-review.md`); `harness/scripts/generate-vendored-canon.mjs:27-37` derives its list from the three template directories and so also covers `agent-obligations.md`. The header states the standalone check is deliberately not wired into the repository's registration (`check-vendored-template-sync.mjs:15-17`). PROVEN.
- **Drift seen.** The incident that created the check: vendored copies "missing safety/discipline content" (`check-vendored-template-sync.mjs:5-13`, citing a backlog item of 2026-08-18). The generator is the later fix; the check stayed. Today the two lists cannot disagree harmfully (the check covers a subset), but a new template added to the generator's directory is not in the check: INFERRED.
- **Pinned by a test.** The check has its own suite (`<core>/scripts/check-vendored-template-sync.test.mjs`, named by search); the generator has `harness/scripts/generate-vendored-canon.test.mjs`. Whether either is registered in Verify: not verified (the header says the check is not).
- **Size.** S.
- **Proposal: one shared source.** Let the check read its pairs from the generator's exported list, or retire the check in favour of the generator's own byte-equality test. Wiring the check into Verify would add a gate: not proposed (D-5).

### K1-07 The clone-slice tools exist twice by design

- **Places.** Tracked sources `scripts/clone-slice/*.mjs` (28 files, PROVEN by listing) and the working copies under `scratch/agent-out/` that the shell guard admits (`docs/operating-tools.md:95` and `:30`, real checkout: "copy `scripts/clone-slice/*.mjs` there first"). Both folders hold `test-in.mjs`, `commit-in.mjs`, `save-patch.mjs`, `cc-sync.mjs`, `run-cc.mjs` (PROVEN by listing).
- **Drift.** The copy is a manual step on every machine and the working copy is the one that runs. Whether the two differ now: INFERRED, not compared. Produced drift: none known.
- **Pinned by a test.** None found.
- **Size.** S.
- **Proposal: keep and pin.** A `--check` that compares the tracked source with the working copy and prints the copy command, inside an existing script. The copy itself must stay (the guard admits the scratch path only; `docs/operating-tools.md:95`).

### K1-08 The Goldfish role and tier set is typed at about eleven sites in three spellings

- **Places.** Agent names: `<core>/scripts/dispatch-briefing.mjs:181` (`AGENT_TYPES`) and `:197` (name to `duty.*`), `<core>/hooks/guard-dispatch.mjs:264` and `:270`, `<core>/lib/native-goldfish-host-finalizer.mjs:61`, `<core>/lib/agy-native-goldfish.mjs:39` (`DUTY_OF`), `<core>/scripts/goldfish-antigravity-host.mjs:306`, `<core>/lib/agy-final-return.mjs:62`. Namespaced roles: `<core>/lib/native-goldfish-host-return.mjs:35` (`ROLE_TO_AGENT`, exported, imported by `<core>/scripts/dispatch-record-write.mjs:10`), `<core>/lib/native-goldfish-host-observation.mjs:88` (a private copy whose own comment says "role set owned by ROLE_TO_AGENT ... keep identical"), `<core>/lib/native-goldfish-host-state.mjs:1037` (role to duty word). Two lists name only two of the three on purpose: `<core>/scripts/elephant-implementation-dispatch.mjs:26`, `<core>/scripts/elephant-agy-implementation-dispatch.mjs:27`, `<core>/lib/agy-session-dispatch.mjs:54`, `<core>/lib/agy-native-implementation-admission.mjs:28`. The agent files themselves are the source: `<core>/agents/` holds eight definitions; `<core>/lib/agent-model-registry.mjs:36` and `:72` already read that directory, and `dispatch-briefing.mjs:222` keeps its own `DEFAULT_AGENTS_DIR`. PROVEN for every line cited.
- **Drift.** None known. Blocks today: no.
- **Pinned by a test.** The "keep identical" copy at `native-goldfish-host-observation.mjs:88` is pinned only by its comment (INFERRED: a bounded search found no test comparing it with `ROLE_TO_AGENT`). One test reads the agents directory (`<core>/install-agy.test.mjs`, the only match of a bounded search).
- **Size.** M (the guard hook files are protected source).
- **Proposal: one shared source, smallest first.** Import `ROLE_TO_AGENT` in `native-goldfish-host-observation.mjs` (one site, removes the explicit mirror), then derive `AGENT_TYPES` from the shipped agent files through `agent-model-registry.mjs`. Ranks below K1-01 to K1-07 on the briefed rule: repeated, never seen to block.

### K1-09 Which guards run per runner: three declarations, parity not pinned

- **Places.** `<core>/hooks/hooks.json` (Claude; 19 matches of a guard file name, search count), the Codex selection of guards by tool at `<core>/hooks/codex-pretool-guard.mjs:378-389`, and the Antigravity adapter (`<core>/hooks/antigravity-pretool-guard.mjs`, 26 matches, search count). PROVEN for the Codex lines; the other two are search counts.
- **Pinned by a test.** The Antigravity test reads `hooks.json` only to compare a timeout (`<core>/hooks/antigravity-pretool-guard.test.mjs:1202-1212`, PROVEN). A test that the three declare the same guard union: none found by the searches made (INFERRED).
- **Drift.** None known. A guard added to one runner and not to another would drift silently: INFERRED.
- **Size.** M. `hooks.json` is a protected test path (TP-4, `templates/prompts/agent-obligations.md:99`), so any edit needs the operator route.
- **Proposal: keep and pin.** A parity test that derives the expected guard set per tool from one table. Do not merge the declarations: the runners call guards differently.

### K1-10 The runner names

- **Places.** Named constants with the same three values: `<core>/scripts/control-placement.mjs:13` (`SUPPORTED_RUNNERS`), `<core>/lib/model-family-discovery.mjs:8` (`RUNNERS`, codex first), `<core>/lib/own-session-descriptor.mjs:19` (`RUNNERS`), `<core>/lib/guard/constants.mjs:292` (`VALID_RUNNERS`), `<core>/lib/route-receipt.mjs:22` (`RUNNERS`), `<core>/lib/project-onboarding-ready-gate.mjs:36` (`RUNNERS`, a Set); inline lists at `<core>/lib/dispatch-record.mjs:161` and `<core>/lib/runner-profiles-v3.mjs:292-293`. About 60 further files hold a three-name literal (search count, a lower bound). PROVEN for the lines, search count for the rest.
- **Drift.** None known. The order differs between files (`model-family-discovery.mjs:8`); whether any consumer depends on the order was not read. Blocks today: no.
- **Pinned by a test.** None found.
- **Size.** L by site count.
- **Proposal: one shared source, only as a leaf export.** One frozen list in an existing leaf module and importers one family at a time, each with a literal-scan case like J9's. Rank last of the ten: no refusal, no incident, and the most sites.

## 3. Below the ten (counted, not ranked)

| # | Duplicate | Places | Class and note |
|---|---|---|---|
| K1-11 | Pinned object ids that move with a registration: the capability inventory's `sourceBaseline` commit and tree | `harness/scripts/check-product-capability-inventory.mjs:653-672` (the commit must resolve and be an ancestor of HEAD), `docs/operating-tools.md:63-65` | keep and pin. A rebaseline script exists; deriving the baseline on read would change what "committed surface" proves: PO decision (D-6) |
| K1-12 | The version: `VERSION` (0.7.0) and three runner manifests, each with a stamped version at line 3 | `VERSION:1`, `<core>/.claude-plugin/plugin.json:3`, `<core>/.codex-plugin/plugin.json:3`, `<core>/plugin.json:3`; `scripts/stamp-candidate.mjs:2-7` rewrites the three | derived by script, keep. The stamp is a deliberate step after "applied" |
| K1-13 | Comments of the form "keep identical", "kept equal", "mirror of", "must match" | over 100 non-test source files (search count of a loose phrase list; includes unrelated uses) | INFERRED census: each is a duplicate with or without a pin; K1-04 and K1-08 are two of them. A follow-up counts which carry a test |
| K1-14 | Reader inputs: three mirrors, a manifest and two pins | `docs/operating-tools.md:23`, `scripts/sync-reader-inputs.mjs:2-10` | one refresh, closed (C-12); the check is one row of the post-sitting table (`scripts/post-sitting-checks.mjs:43-45`) |
| K1-15 | Lists of "which project config files govern": governance markers, signed-digest set, gate-strength paths | `<core>/lib/guard/constants.mjs:57-64`, `<core>/lib/human-guard-override.mjs:899-908`, `<core>/hooks/guard-gate-strength.mjs:99` | different purposes (INFERRED; each rule not read); do not merge without reading all three |

## 4. Closed and still open, in one table

| Family | Closed | Still open |
|---|---|---|
| State vocabularies | package states, onboarding statuses, phase set (C-1, C-2, C-8) | none found in this pass |
| Path lists | 12 calibration lists, protected test paths, gate-strength rules (C-3, C-9, C-10) | five calibration lists (K1-04), the mirror-rule texts |
| Counts and pins | none | suite counts (K1-02), case-completion triple (K1-01), inventory baseline (K1-11) |
| Texts that restate code | the `&&` bound, the grammar sentence (C-11, C-5) | trailer forms and hand-maintained obligations parts (K1-03), status narrative (K1-05) |
| Copies of files | vendored canon, obligations, derived files (C-12, C-13) | second template check (K1-06), tool copies (K1-07) |
| Role and runner sets | none | K1-08, K1-09, K1-10 |

## 5. What is missing or not verified

1. No suite, checker or script was run. The registered total (K1-02), the staleness of the case-completion rows (K1-01) and the equality of the clone-slice copies (K1-07) are therefore INFERRED, not measured.
2. I did not read the read rule of the five remaining calibration lists (K1-04); J9 showed the stakes readers differ per module, so a swap needs that read first.
3. The Codex and Antigravity guard selections (K1-09) were read at the cited lines only; the full list per tool was not compared with `hooks.json`.
4. `docs/state.md` in the clone is older than in the real checkout; I cited the real one for line 19 and did not read the rest of either file.
5. The registration surface of the verify-suite list was searched in `harness/verify-suites.json` only; `harness/scripts/verify.mjs` also registers suites and was not counted.
6. Search counts of runner names and "keep identical" comments are lower bounds with noise.
7. ADRs and the backlog were not read; two incidents are cited from the queue and from a script header that names a backlog item.

## 6. Recommendation

Do three small removals first, then two that need a PO word, and leave the rest counted.

1. **K1-02 first (S, no refusal path touched).** Judge the post-sitting rows by exit code and failing cases; print counts; remove the literals and the three restatements. It is the cheapest removal that stops blocking a candidate.
2. **K1-04 lists (S).** Swap the five remaining private calibration lists for `CALIBRATION_PATHS` with the same literal-scan case; build the two guard texts from the same list.
3. **K1-06 (S).** One source for the template pairs.
4. **K1-01 (M, derive the third place).** One command refreshes the case-completion augmentation rows with the other derived files. The preimage chain stays.
5. **K1-03 (M).** Export the admitted `Dispatch:` form list; render it in the obligations generator.
6. **K1-07, K1-08, K1-09, K1-10 in that order**, each as keep-and-pin or a leaf export, only after the earlier items ran in one candidate.
7. **K1-05 only on the PO's word** (D-4): it reshapes the canonical handover.

Not recommended: any new stored status, any new gate, wiring a check into Verify, retiring a calibration twin, automatic re-binding of an immutable artifact, or a time-based expiry (D-2, D-3, D-5 carry the cost for the PO).

## 7. What stays unchanged (DO-NOT-DO)

1. No new stored status, no new gate, no new Verify step by this analysis (hard limit; wiring is D-5).
2. No change to a digest, key or bound byte of an existing record: the growth-only preimage hashes of the augmentation rows, the Critic preimage inventory, the manifest digests, the bound legacy key.
3. The growth-only rule of the case-completion augmentations stays (`verify-case-completion-augmentation.mjs:17-19`): the anti-weakening property is the reason for the chain; only the manual edit around it may go.
4. No automatic re-bind of an immutable or append-only artifact, no automatic signature step, no time-based expiry (state-machine analysis DO-NOT-DO 1, 5, 8, 12).
5. Both calibration files stay, byte-identical, with `CVCT-TWIN-CAS`; the source-checkout probe stays legacy-only (`w30j09-*.notes.md`, line 15).
6. No merge of the protected-path, writer and governance-marker lists without reading each rule (K1-15).
7. A test that pins a count or a text is never edited to turn green (QG-04): a pinned count is restated with the reason, or the pin is replaced by a stronger derivation in the same change.
8. Hand-maintained obligations prose stays hand-maintained; only closed lists are derived.
9. Edits to protected files (`harness/verify-suites.json`, `hooks.json`, guard hooks) are not made by an agent route that cannot sign them; the operator route applies (`templates/prompts/agent-obligations.md:82-111`, real checkout).
10. The documents that state a decision (`docs/state.md`, ADRs) are not restructured without a PO decision.

## 8. Staged plan (smallest first)

Each stage is at most one dispatch, test first, rollback is the revert of its commits, and no stage migrates a stored record.

| Stage | Item | Failing-first proof | Neighbour suites (existing) | Unchanged |
|---|---|---|---|---|
| 1 | K1-02: derive the post-sitting verdicts | a case that runs the judge on a fixture result with a different count and expects green; red against the literal | no suite for `scripts/post-sitting-checks.mjs` exists, so the stage first adds a plain test file (needs registration, a protected list: operator step); `harness/scripts/check-doc-contracts.test.mjs` | exit-code semantics, every row name |
| 2 | K1-04: five lists and two texts | a literal-scan case over the five modules, red until swapped (the J17 pattern) | `<core>/lib/calibration-verify-commit-transition.test.mjs`, `<core>/scripts/pre-commit-hook-install.test.mjs`, the suites of `repository-mode-promote`, `push-prepare`, `critic-dispatch-preflight` (names not read), `<core>/hooks/guard-dispatch-budget.test.mjs` | both files, `CVCT-TWIN-CAS`, the read rule of each site |
| 3 | K1-06: one template pair list | a case where a template added to the generator's directory is absent from the check; red today | `<core>/scripts/check-vendored-template-sync.test.mjs`, `harness/scripts/generate-vendored-canon.test.mjs`, `harness/scripts/generate-agent-obligations.test.mjs` | byte equality, the generated copies |
| 4 | K1-01: sync folded into the refresh | a case where a suite declares one more id and the refresh writes exactly one augmentation row with the right preimage; red until folded | `harness/scripts/check-verify-case-completion.mjs` run on the tree, the augmentation module's suite (name not read), `scripts/refresh-derived-files.mjs` suite (name not read) | the growth-only rule, existing rows |
| 5 | K1-03: exported form list | a case that the generated section 6 lists every form the policy admits and none it refuses; red when the export is absent | `<core>/lib/commit-message-policy.test.mjs` (name not read), `harness/scripts/generate-agent-obligations.test.mjs`, `<core>/scripts/dispatch-authorship-verify.test.mjs` (name not read) | the prose, the one-command form, GIT-03 codes |
| 6 | K1-07: a copy check | a case with a changed working copy; red until the check names it | the clone-slice tools have no suite found (INFERRED) | the copy step itself |
| 7 | K1-08, K1-09, K1-10 | per item: a literal-scan or parity case, red first | `<core>/lib/native-goldfish-host-return.test.mjs`, `<core>/scripts/dispatch-briefing.test.mjs`, `<core>/hooks/guard-dispatch.test.mjs`, `<core>/hooks/antigravity-pretool-guard.test.mjs`, `<core>/hooks/codex-pretool-guard.test.mjs` | role strings, runner order where a consumer reads it |
| 8 | K1-05 | document-only; the proof is the arithmetic of the counts a reader can recompute | `<core>/scripts/check-state-budgets.mjs` | the decision register |

After each stage the derived files are refreshed once by the Coordinator (`scripts/refresh-derived-files.mjs`). The Full Verify and the Critic stay the Coordinator's and the PO's to schedule; no stage here replaces them.

## 9. Open decisions for the PO

| # | Decision | Default |
|---|---|---|
| D-1 | Which stages go into 30k and which wait. | Stages 1 to 3 in 30k; 4 and 5 if the build budget allows; 6 to 8 later. |
| D-2 | Is a literal "number of registered suites" worth keeping as a "something vanished" tripwire? Cost of keeping: an edit and a red row at every registration (K1-02). | No: derive; the unregistered-suite finding already catches a left-out file. |
| D-3 | Retire one calibration twin for consumer projects? Cost: a migration of every consumer, a change of every guard that names both files, and the loss of the second file as a cross-check. State-machine analysis E1-3 said "do the shared lists first". | Not now. Do stage 2, then decide after it ran in one candidate. |
| D-4 | May `docs/state.md` keep one pointer per candidate instead of a narrative paragraph, with the queue as the source of lane facts? Cost: the canonical handover changes shape. | Yes, as a later stage, and only after the PO reads a sample. |
| D-5 | Wire the vendored-template check into the Verify suite list? That adds a gate and edits a protected list. | No. Make the check read the generator's list and leave it standalone. |
| D-6 | Derive the capability inventory's `sourceBaseline` on read? Cost: it changes what the inventory proves about committed surface. | No. Keep the rebaseline script. |
| D-7 | Should a census of every "keep identical" comment (K1-13) be built as a read-only report? | Yes, as one small analysis slice; no gate. |
