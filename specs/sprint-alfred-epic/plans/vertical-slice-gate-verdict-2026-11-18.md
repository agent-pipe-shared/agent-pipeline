# Verdict: a vertical-slice gate (candidate 30k, lane K9, 2026-11-18)

**Analysis only, no test run.** Nothing was executed beyond reading; every statement comes from reading. The Critic is suspended by the PO for this repository's candidates and no Full Verify ran.

Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. Goal of 30k (PO): fewer duplicated states and rules, no new gate, analysis before code (`plans/candidate-30k-plan-2026-11-18.md:5`; the topic is lane K5 there, `:15`).

Citation basis: code, templates and tests are read in the integrated 30j tree; the queue (`plans/candidate-30-queue-2026-11-15.md`), the 30k plan and the w30j lane notes are read in the real checkout, so queue line numbers are those of that file. Paths under `plans/` and `evidence/` are relative to `specs/sprint-alfred-epic/`. Labels: **PROVEN** = read in code, a test or a document at the cited line; **INFERRED** = reasoned, not read. References are backticked `path:line`. A first attempt at this topic ran under another dispatch; its findings were treated as leads and the load-bearing lines were re-read. One claim was corrected (marked "corrected" below): the PO acceptance point of decision D33 is deferred by D136, not possibly built.

## 1. Question and short answer

The question: is a gate needed that asserts a feature was built and checked as a vertical slice (one thin path from the PO's first command to an accepted result, plus a recovery per refusal), beside Verify and the acceptance question?

Short answer (details in section 6): **partly covered, and a new gate is not needed.** Most pieces exist as a plan-time refusal, a dispatch warning, duties in the Goldfish and Critic templates and a close readback row. The real gap is narrow: a journey the Spec names is never tied to a check that was delivered and run, and "every refusal names a repair that works" is asserted one producer at a time. A gate with its own slice list would be a second copy of the Spec's criterion rows. The smallest useful stage is a read-only derived line inside an existing readback row (section 9, stage 1, after a recon in stage 0).

## 2. What "vertical slice" means here, and how a slice is cut and checked today

### 2.1 Three meanings in the repository's own words

1. **Planning meaning (Spec).** "Name the first slice as ONE thin end-to-end path a user can walk (input -> domain -> persistence -> visible result) for the most important journey in section 5 ... Do not plan horizontal layers first ... Name each slice with the criteria (AC-n) it makes walkable." PROVEN: `templates/spec.md:83-89`.
2. **Dispatch meaning (roles).** A large outcome "may be divided only into vertical sub-outcomes that can each be verified independently": PROVEN `docs/operating-model.md:260-262`, `templates/prompts/goldfish-task.md:35`, `roles/elephant.md:241`. At intake the Elephant proposes a cut into "vertically sliced backlog items" and waits for confirmation: PROVEN `roles/elephant.md:145`.
3. **Code meaning (module slice).** In the dispatch code a "slice" is one module of the approved architecture design, with a wave order and `dependsOn`: PROVEN `plugins/pipeline-core/lib/module-dispatch-scope.mjs:5,19,70,95-99` (the proposal itself is `proposeSlicesFromModules`). That is the layer-shaped unit. The Spec's thin path is prose; that no reader parses it is INFERRED from the module-scope reader and from the candidate-28 notes, which say "The Spec: no new field" (PROVEN `evidence/held-patches/candidate28/c28-plan-gates.notes.md:19`).

The mismatch between meaning 1 and meaning 3 is the root of the open backlog item: "The Spec planned five vertical slices. The early dispatches were module or layer packages ... Nothing in the dispatch route compares the dispatched package with the slice plan of the Spec." PROVEN `backlog/items/2026-11-13-early-dispatches-are-layer-packages-not-vertical-slices.md:17`; status `open` at `:6`; its done-when is a PO decision, "check a package against the Spec's slice plan, or only report the gap" (`:25`).

### 2.2 How a feature moves from plan to acceptance today (stages that touch journeys)

| Stage | What exists | Strength | Reference |
|---|---|---|---|
| Spec and readiness | Every user-facing criterion carries `Journeys:` and `Asserts:`; criteria that delete, replace, import or migrate also name recoverability | refusal at plan hand-off (`PLR-HANDOFF-NO-JOURNEY`) | PROVEN `templates/spec.md:142-174` (the template's journey and recoverability fields); `plugins/pipeline-core/lib/plan-handoff-readiness.mjs:163-174`; `plugins/pipeline-core/lib/spec-journey-coverage.mjs:56-79` |
| Human plan gate | One recorded approval before the first implementation dispatch; afterwards slices continue without new PO pauses ("Do not ask for a new PO gate merely because a slice completes") | gate (exists) | PROVEN `docs/operating-model.md:202-226` |
| Dispatch | A package of one verifiable outcome; a module dispatch gets `DBG-VERTICAL-SLICE-FIRST` when the design has two or more modules, the Spec names a covered journey and no integrated dispatch outside the module cut exists | warning only (PO decision 2026-11-10: "a WARNING only, never a refusal") | PROVEN `plugins/pipeline-core/scripts/dispatch-briefing.mjs:1445-1447,1461-1480`; tests `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs:2718,2757` |
| Authoring | The Goldfish writes cases per journey and reports "covered / not covered" per criterion; a criterion that names no journey is a stop condition | duty in the briefing | PROVEN `templates/prompts/goldfish-task.md:438-445` |
| Critic | Reports journey coverage per criterion; a missing journey is a finding | review (suspended for this repository by the PO) | PROVEN `templates/prompts/critic-review.md:450-457` |
| Verify | Runs the registered suites (this repository) and writes machine evidence; `candidate`, `push`, `release` are full-registry, `work` and `critic` impact-selected | gate on exit codes | PROVEN `harness/scripts/verify.mjs:39-45` |
| Acceptance question | Asked after a green candidate Verify; one fixed yes form; any other answer is a decline that returns the feature to a correction round; nothing is signed | human attribution record | PROVEN `plugins/pipeline-core/scripts/finish-feature.mjs:598-611`; order set by PO tile 2026-11-17 (queue `:496`, not re-read here, INFERRED from the code comment at `finish-feature.mjs:598-599`) |
| Close readback | Row `journey-coverage` lists each user-facing criterion as `covered` or `not covered`; the module states "It is NOT a gate" | report | PROVEN `plugins/pipeline-core/lib/close-quality-readback.mjs:2,13-15,137-148` |

Two facts decide the verdict:

- **The only journey check reads Spec text.** `inspectSpecJourneys` reads "only the Spec bytes"; `covered` means the criterion "names journeys and an asserted effect" (PROVEN `spec-journey-coverage.mjs:10-11,66-72`; `close-quality-readback.mjs:13-15`). A named journey with no test passes every stage above. The user-facing decision is a closed English vocabulary plus tags (PROVEN `spec-journey-coverage.mjs:16-17,31-34`).
- **The acceptance step does not show journey rows.** The word "journey" does not occur in `finish-feature.mjs` (PROVEN: a case-insensitive count search over that file returned no match). The question lists open checks and earlier accepted Critic findings (PROVEN `finish-feature.mjs:614-616`). The journey rows come from the close coordinator (PROVEN `plugins/pipeline-core/scripts/close-coordinator.mjs:1304-1307`).

### 2.3 Journey cases that already walk a whole path

- `plugins/pipeline-core/scripts/close-path-e2e.test.mjs:898-927`: the file holds nine test cases (PROVEN by a count of `test(` at lines 898, 902, 906, 910, 914, 918, 922, 926 and 933; the queue says "nine walks", `:512`); eight of them (898-927) call `walkTheClosePath`, the first looping over every runner identity, and the ninth (`:933`) is the design-package re-entry case. They walk from implementation through release preflight, the one-shot close CLI with its stops and the acceptance question, a declined acceptance and the second close, push with the evidence commit, and a catalogue project (declined chain and plain). Registered in Verify (`harness/verify-suites.json:3574`). PROVEN. The walks start at implementation, not at the PO's first command.
- `plugins/pipeline-core/lib/onboarding-greenfield-walk.test.mjs:31,62`: two walk cases (F3, F4) over the first onboarding steps. PROVEN.
- The journey and failure-class fields of the lane reports: the journey field is used in the w30j lane notes (for example a "Journey coverage of the C30-21 wish" paragraph, PROVEN `evidence/held-patches/w30j03-a-mistyped-passphrase-ceremony-reproduced-and-closed.notes.md:22`) and follows the Goldfish duty at `templates/prompts/goldfish-task.md:438-445`. A "failure classes" duty was not found in `goldfish-task.md` by a search (one unrelated hit at `:418`, "fixture-blindness failure class"); where it is defined was not read (INFERRED: the briefing generator). Both fields are report text; that no code reads them is INFERRED (no reader was searched for), so they are not used as a source for the derived trace.
- The one case that spans first command to a pushed branch per runner is **skipped by design**: `{ skip: "E-HOLD ... needs genuine installed host runs per runner (native/installed host evidence); not producible in-repo" }` (PROVEN `plugins/pipeline-core/lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs:982-984`; the suite is registered, `harness/verify-suites.json:3376`). Its manual form is the per-runner host checklist, row 1 "Onboarding then design then Advisor then plan approval then implementation then push, without detours" (PROVEN `plans/host-run-checklists-2026-10-23.md:157`), and the release notes keep it as an open greenfield acceptance criterion (PROVEN `plans/release-notes-0.7.0-draft.md:107`). The briefing names a "happy-path greenfield acceptance rule"; these files were found and no single normative statement of it was found (INFERRED absence, search of the named files only).
- A recovery contract exists for exactly one producer: a test reads the source of the one-shot close, takes the repair argument of every `stopResult(` call and requires a runnable command shape or a named human actor (PROVEN `plugins/pipeline-core/scripts/finish-feature.test.mjs:2088-2137`; built as C30G-D2, queue `:492`). It is static (it reads text) and covers `finish-feature.mjs` only.
- PO acceptance point machinery: the slice queue has the state `hold-po` (PROVEN `plugins/pipeline-core/lib/slice-queue.mjs:50`). Decision D33 describes "a typed entry in the approved plan" that seeds one `hold-po` slice per acceptance point (PROVEN as a decision, `plans/po-decisions-2026-10-18.md:38`), and decision D136 moved the release verb and the plan entry **after 0.7.0**: "no AC row is bound to it, only an ADR draft exists ... `hold-po` stays as it is" (PROVEN `plans/po-decisions-2026-10-18.md:157`; corrected: the first draft of this analysis treated the plan entry as possibly built).

## 3. Failures of the 30h to 30j waves: what a vertical-slice assertion would or would not have caught

Mapping this repository's maintenance lanes onto "vertical slices" is **INFERRED**: the term is defined for consumer feature plans (section 2.1) and the lanes are maintenance packages. The lens used: would one journey case or one recovery case have caught the failure.

| # | Failure | Source | Caught by a vertical-slice assertion? |
|---|---|---|---|
| F1 | A mistyped passphrase blocked the next ceremony (`chat:member-source-drift`, no repair named); a move-aside then removed the catalogue so the one-shot lost its owner-route mode (`CLOSE-PATH-MISSING`); then the registration refused with `FPR-MANIFEST-CONFLICT` and no named route. Three blockers in one consumer session, fixed in two lanes (30i S6 for the ceremony, S7 for close and registration). | PROVEN queue `:537-547` | **Yes, as one cross-stage recovery journey** (ceremony fails, repair, close completes). Each stage was verified alone; the queue states "no real move-aside plus real close end to end" (`:547`), and the w30j03 notes say Windows was not exercised and the kill points are Linux-only (`evidence/held-patches/w30j03-a-mistyped-passphrase-ceremony-reproduced-and-closed.notes.md:43`). That no such walk exists is INFERRED from those statements; not every suite was searched. |
| F2 | A refusal named a command the agent's own guard refused: J13 made the registrar name `--feature <id>`, the catalogue admitted only the bare spellings, J14 had to add it. Same class in candidate 28 (`create-adr --discard` not admitted until a change outside the slice). | PROVEN `evidence/held-patches/w30j13-lineage-and-delta-name-their-feature-when-a-discarded-predecessor-exists.notes.md:37`; `evidence/held-patches/w30j14-guard-catalogue-admits-the-feature-selector-of-the-registration.notes.md:17`; `candidate28/c28-plan-gates.notes.md:16` | **Yes, as a recovery-per-refusal case that runs the named repair through the guard admission.** A pin of this shape exists and takes hand-written forms per verb (`plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs:384-388` for `bothAdmit`/`bothRefuse`; J14 added cases through them, notes `:7`); that the list is hand-maintained is INFERRED. |
| F3 | Dead ends after the happy path: stops with no cause or no repair (C30-15 findings 3, 4, 9, 10), under the PO rule "every path needs a happy path and a recovery, too many dead ends". | PROVEN queue `:484-493` | **Partly, already closed for one producer** by the static contract in section 2.3. The ceremony refusal of F1 lay outside it. |
| F4 | The first dispatches were layer packages; no thin slice existed early for the PO to look at. | PROVEN backlog item `:17` | **The case the term was coined for. Warned since candidate 28** (section 2.2), never refused, by PO decision. Whether the warning changes behaviour in a live run is not measured. The greenfield second-run reports that the first draft cited were not re-read in this pass; the backlog item is the cited source. |
| F5 | A lane green, the integrated tree red: in 30h the kernel-closure suite was red until a path was added to the never-liftable list and two case ids were added in the model guard suite after the Goldfish stopped at a file outside its write list; the 30h case-completion run found three missing case ids and two more. 30d had one red walk case (a too-strict assertion by the Coordinator, 106 of 107 files green). | PROVEN queue `:508,512`; `docs/state.md:19` | **No.** These are duplicated lists and registries (the K1 topic) found by the integrated pass, not a journey that failed. In 30j the integrated pass over 30 files was green and three pre-wave reds were not caused by the wave (PROVEN queue `:569`): the example "lane green, tree red" does not occur in 30j. |
| F6 | Lanes that did not run the walks: J7 never read `close-path-e2e` (result unknown after more than 20 minutes); J4, J5, J7 and J13 list suites not run. | PROVEN `evidence/held-patches/w30j07-close-chain-deleted-evidence-back-move-and-gate-change-way-out.notes.md:22`; queue `:569` | **No.** The walks exist and the lane did not run them; a gate would not run them either. |
| F7 | Host-commit failures because the Coordinator's own recovery commits moved HEAD while a sibling ran (`NGHF-COMMIT-EXCEPTION`); slow admission from retained pending states. | PROVEN queue `:549-553,569` | **No.** Process and registry topics (K2, K1). |

Pattern: a journey or recovery assertion would have caught F1 and F2 (and F3 for other producers): failures of **a path that crosses stages or modules**, found by a human at the terminal. It would not have caught list drift (F5), unrun suites (F6) or process (F7). Of seven failures, two are catchable and one is half-closed; that is the evidence base, and it is small.

## 4. What could not be measured

- No test or product run (analysis only). All sizes are estimates.
- Where the item-delivery criterion binding is stored after integration. The binding key is the criterion id (`criterionLocator.criterionId`) with the check list (PROVEN `plugins/pipeline-core/lib/native-goldfish-host-return.mjs:301-307`); what the dispatch record or delivery course keeps afterwards was not read, so a derivable link from a criterion to its delivered check is INFERRED.
- The shape of a consumer project's Verify evidence: this repository's `steps[]` lists one entry per suite (PROVEN `harness/scripts/verify.mjs:33-34`); a consumer runs its calibrated `verify` command (unread here).
- The false-positive rate of the English journey vocabulary, and the live effect of the vertical-first warning.
- Whether a plan-declared PO acceptance point exists in any consumer plan (D136 says it is not built, section 2.3).
- Windows and macOS behaviour of every recovery path in F1.
- The greenfield second-run reports (not re-read in this pass).
- Whether the "happy-path greenfield acceptance rule" has a single normative text (section 2.3).

## 5. What a gate would assert, where it would sit, and how it avoids a second registry

### 5.1 The assertion, restated so that nothing new is stored

For every criterion row the Spec already marks user-facing, **derive** (never store) three facts from existing sources:

1. **Named:** the criterion carries `Journeys:` and `Asserts:` (exists: `inspectSpecJourneys`).
2. **Delivered:** an item delivery bound to that criterion id exists and its check file is present in the candidate tree (source: the item-delivery binding, `native-goldfish-host-return.mjs:301-307`; derivability INFERRED, section 4).
3. **Run:** the last Verify evidence for the candidate was green for the suite that holds that check (source: `evidence/verify-latest.json`; consumer shape unknown).

A per-criterion line would read "AC-n: journey named, check <path> delivered, Verify green", or name which of the three is missing. The registry stays the Spec's criterion rows; the line is a view over the Spec bytes, the dispatch binding and the evidence, like the existing `journey-coverage` row, and stores no status.

### 5.2 Recovery per refusal

Not a new list of refusals. Two reuses:

- the static technique of `finish-feature.test.mjs:2088-2137` (read the source of a producer, require a runnable command shape or a named human actor in every refusal), applied one producer at a time;
- the admission check of the catalogue pin, applied to the commands a refusal prints, so that "the refusal names a repair the agent's own guard refuses" (F2) cannot recur.

Both are test cases in registered suites, not gates.

### 5.3 First command to accepted result

In this repository the full walk per runner is a host run (section 2.3) and cannot run in Verify: the case is skipped by design. Everything below it (the close path, the first onboarding steps) is already walked. A gate that tried to run the full walk would be skipped for ever or fake the host. Recommendation: keep the per-runner host run as the PO's acceptance rule it already is, and add no Verify step for it.

### 5.4 Where it would run, what it would refuse, what it would only report

| Stage | Today | Proposed |
|---|---|---|
| Plan time | Refuses a user-facing criterion with no journey (`PLR-HANDOFF-NO-JOURNEY`) | **Unchanged.** An optional marker for the thin path is a PO decision (D2) |
| Dispatch | Warns (`DBG-VERTICAL-SLICE-FIRST`) | **Unchanged**, report only |
| Verify | Exit codes of suites | **Unchanged.** No new Verify step (the browser smoke lane of 30k is another topic, `plans/candidate-30k-plan-2026-11-18.md:24`) |
| Close readback | `journey-coverage` row, text only, not a gate | **Extend the evidence text of that row** with the delivered check per criterion (stage 1); the row status semantics stay as they are |
| Acceptance question | Lists open checks and earlier accepted findings | Show the derived lines only after stage 1, so "covered" never means "named but untested" (D3) |

**No refusal is proposed anywhere.** A refusal at close on a heuristic (English vocabulary, a prose check) would add the dead end that the PO's rule forbids (queue `:484`); the proxy nature of the existing signal is documented (`c28-plan-gates.notes.md:24`; `dispatch-briefing.mjs:1461-1465`). Any refusal is a PO decision with its cost (D4).

## 6. Verdict

**Partly covered; a new gate is not needed.**

Covered today: a journey named per user-facing criterion with a refusal at plan hand-off; journey cases by duty at authoring and at review; a vertical-first warning at dispatch; a close row; whole-path walks of the close in Verify; a static recovery contract for the one-shot close; an acceptance step after Verify; a `hold-po` slice state.

Not covered (each a missing link, not a missing gate):

1. A named journey is never tied to a delivered and run check (Spec text only).
2. The thin-first order is a module-count proxy; the Spec's own slice plan is prose (`c28-plan-gates.notes.md:19`).
3. No cross-stage recovery walk (F1).
4. "The refusal names a repair the guard admits" is hand-listed per verb (F2) and statically checked for one producer (F3).
5. The acceptance question does not show journeys at all.
6. The first-command-to-accepted walk per runner is host-only (skipped case E).

Smallest stage, if the PO wants anything: stage 1 (a derived addition to an existing row; no new status, no new gate), preceded by the read-only recon of stage 0.

## 7. Recommendation

1. **Do not build a vertical-slice gate:** no new phase, status, Verify step or refusal. The criterion registry is the Spec; a gate with its own slice list is a second copy (the drift class K1 counts).
2. **Close gap 1 as a derived report** inside the existing `journey-coverage` row (stage 1), after a read-only recon (stage 0) of where the criterion binding lives.
3. **Close gap 4 by tests, not by rules:** a test that takes the commands printed by one producer's refusals and asserts the guard admits them (stage 2); extend producer by producer only when a finding shows the class.
4. **Leave gaps 2, 3 and 6 as PO decisions** (section 10) with their cost; they need a Spec change, a heavy walk or a host run.
5. Record in the backlog item that its dispatch side is answered by the 2026-11-10 decision (report only, `dispatch-briefing.mjs:1462`) and that only the Spec-slice-plan comparison remains (D2). That edit belongs to the Coordinator; this lane writes one document.

## 8. What stays unchanged (DO-NOT-DO)

Binding: the DO-NOT-DO list of `plans/state-machine-simplification-analysis-2026-11-17.md:290-303` (PROVEN, read in the clone). The items that apply:

1. No automatic re-bind of an `immutable` or `append-only` artifact (the signed Spec, `result.md`, registered Verify evidence); a slice trace is a read (list item 1).
2. No Verify result stands for a commit it did not run on; the trace reads the evidence of the exact candidate (item 2).
3. No change to the bytes of an existing key or digest, including the criterion locator (item 3).
4. No new stored status; a recommendation that needed one is a derived read instead (item 12).
5. No time-based expiry; no automatic step for anything that needs a signature (items 5 and 8).
6. No freehand edit of the State file (item 11).

Added by this analysis:

7. No new gate, phase or Verify step for vertical slices; no refusal derived from the vocabulary heuristic.
8. Do not weaken `PLR-HANDOFF-NO-JOURNEY`; do not widen or narrow the closed journey vocabulary in this work.
9. Do not turn `DBG-VERTICAL-SLICE-FIRST` into a refusal: it is a PO decision of 2026-11-10 (`dispatch-briefing.mjs:1462`).
10. Do not parse the Spec's slice-order prose for a decision; without a marker (D2) it is not a signal.
11. Do not add a second list of slices, journeys or refusals; derive from the Spec rows, the dispatch binding and the evidence.
12. Do not put a first-command-to-accepted walk into Verify; it is a host run (skipped case E stays skipped by design).
13. No change to the signed Spec bytes or to `templates/spec.md` without D2.
14. Do not add a per-slice PO pause to the approved-plan flow without D6: `docs/operating-model.md:217-226` says slices continue without new PO pauses.

## 9. Staged plan (smallest first, each with its failing-first proof and neighbour suites)

Each stage is at most one Goldfish dispatch, test first, rollback by revert, no stored record migrated. Sizes are estimates.

### Stage 0 - recon, read only (S)

- **Question:** after an item delivery is integrated, where do the criterion id and check path of its `itemDelivery` binding persist (dispatch record, delivery course, slice queue)? What does a consumer's Verify evidence list per run?
- **Proof:** a written finding with file:line. If the id is persisted nowhere readable, stage 1 stops and is re-scoped: a new persisted field would be a stored duplicate (section 8, item 4).
- **Neighbour suites:** none (no code).

### Stage 1 - the `journey-coverage` row names the delivered check (S, low risk)

- **Change:** the evidence text of the existing row lists, per `covered` criterion, the bound check path when a delivery is found, else "no delivery bound". The row status (`present` / `missing` / `not-applicable` / `unknown`) is computed exactly as today.
- **Failing-first proof:** a new case in `plugins/pipeline-core/lib/close-quality-readback.test.mjs`: a Spec with one covered criterion and an injected reader returning a binding gives evidence naming the check (red today); no binding gives "no delivery bound" with the status unchanged; an unreadable reader gives `unknown` as today.
- **Neighbour suites:** `plugins/pipeline-core/lib/close-quality-readback.test.mjs`, `plugins/pipeline-core/lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs`, `plugins/pipeline-core/scripts/close-coordinator.test.mjs`, `plugins/pipeline-core/scripts/close-coordinator-audit-lifecycle.test.mjs` (the coordinator builds the rows, `close-coordinator.mjs:1304-1307`).
- **Unchanged:** `inspectSpecJourneys`, the row ids (`QUALITY_ROW_IDS`), the plan hand-off refusal.

### Stage 2 - a named repair is admitted by the guard, generated for one producer (S-M, low risk)

- **Change:** a test case that takes the commands printed by the registrar's refusals for the lineage and delta forms and asserts the catalogue and the real guard admit them (the `bothAdmit` helper of the existing pin).
- **Failing-first proof:** run on a scratch clone of the 30i state (catalogue without the selector): red; on the 30j tree: green. The revert of the J14 catalogue change happens only in a scratch clone, never in the repository.
- **Neighbour suites:** `plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`, `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`.
- **Unchanged:** the catalogue itself.

### Stage 3 - show the derived lines in the acceptance question (S, only after stage 1)

- **Change:** the question text of `finish-feature.mjs` lists the `journey-coverage` lines it can read, labelled "named in the Spec, delivered check ...", so it never says a journey was proven.
- **Failing-first proof:** a case in `plugins/pipeline-core/scripts/finish-feature.test.mjs` asserting the asking stop contains the lines (red today: the word does not occur); the recovery contract cases (`:2088-2137`) stay green unchanged.
- **Neighbour suites:** `plugins/pipeline-core/scripts/finish-feature.test.mjs`, `plugins/pipeline-core/scripts/close-path-e2e.test.mjs` (the acceptance walks `:910-927`; long, run alone).
- **Cost:** the acceptance text is a PO-visible sentence; D3 asks for it.

### Stage 4 - a cross-stage recovery walk (L, PO decision D5, default not built)

- **Change:** one walk in `close-path-e2e.test.mjs`: a ceremony fails, the named repair runs, the close completes.
- **Failing-first proof:** the walk red on the 30h tree (before the 30i fixes S6 and S7), green on the 30i/30j tree, run in scratch clones. Cost: 600-900 s per walk (timeouts at `close-path-e2e.test.mjs:918,922`), Linux-only kill points, a new fixture with a real ceremony.
- **Neighbour suites:** `plugins/pipeline-core/scripts/close-path-e2e.test.mjs`, `plugins/pipeline-core/lib/chat-gate-ceremony.test.mjs`, `plugins/pipeline-core/scripts/po-human-approval.test.mjs`.

## 10. Open decisions for the PO (each with a default)

| # | Decision | Cost / consequence | Default |
|---|---|---|---|
| D1 | Is the backlog item answered on the dispatch side by the 2026-11-10 decision (report only), leaving only the Spec-slice-plan comparison open? | One line in the item; no code | **Yes.** |
| D2 | Add an optional Spec marker naming the thin path (for example `Vertical slice: <criterion id>` beside `Journeys:`) so the dispatch warning becomes a real signal instead of a proxy? | A change of `templates/spec.md`, a new closed marker with a parser and a check to register, a new shape for signed Spec bytes; the candidate-28 notes say it "would turn the proxy into a real signal" (`c28-plan-gates.notes.md:19`) | **No.** Revisit when a live run shows the warning ignored. |
| D3 | Show the derived journey lines in the acceptance question (stage 3)? | A PO-visible sentence; misleading before stage 1 (a named journey would read as proven) | **Yes, only after stage 1.** |
| D4 | Refuse at close a user-facing criterion with no delivered check? | Turns an English-vocabulary heuristic plus a binding lookup into a blocker; adds a dead end the PO's rule forbids; needs a repair path per cause | **No; report only.** |
| D5 | Build the cross-stage recovery walk (stage 4)? | 600-900 s per walk, Linux-only kill points, a real-ceremony fixture | **No** until stages 0 to 2 are done and a new cross-stage finding appears. |
| D6 | Make the "PO looks at the first slice" point a real mechanism (the D33 typed plan entry plus a release verb, deferred by D136)? | A protected `pipeline-state.mjs` change, an ADR, and an exception to the no-new-pause rule of `docs/operating-model.md:217-226`; today a plan author can only name the point in prose | **No.** Keep `hold-po` and the D136 documented limit; revisit only if the first-slice warning proves insufficient. |
