# Browser smoke in Verify: what it asserts, where it sits, the smallest first stage (analysis, 2026-11-18)

Source: PO tile 2026-11-18 ([30k plan](candidate-30k-plan-2026-11-18.md), row "Browser smoke", line 24). The queue and the backlog give no specification, so this document is analysis only: no code, no test run, no Critic and no Full Verify (PO rule for this repository's candidates). Binding: the closest existing accepted criterion is AC-112 (`spec.md`, line 3035); it concerns an unrelated item, the PRD and the Spec are unchanged, and no new criterion is claimed. Labels: **PROVEN** = read at the cited `file:line`; plugin, harness, role and template anchors were re-read in the integrated 30j clone, while the backlog items, ADR-0081, the queue and the 30k plan were read in the real checkout (the plan is not in the clone); **INFERRED** = a conclusion, or a place not read.

## 0. Recommendation in five lines

1. A browser smoke needs **no new gate, no new stored field and no new result kind** for its first stage. It is one already-existing Verify command (a `verifyImpact` entry with the reserved id `browser-smoke`) that the producer runs **behind the existing capability preflight**.
2. Applicable = the project declares that entry. A project without a browser surface declares nothing, gets no step and is never red (derived from absence, nothing stored).
3. A runner without a browser fails that one step with a typed code and a human startup instruction, before any test ran. It is red, never a pass. A "pending, not red" outcome would need a new result kind in the evidence record: PO decision, default no (section 6).
4. A report-only readback row is a later stage, derived from the run's steps like the architecture projection; nothing new is stored.
5. Stage 1 touches plugin source (a protected change): one new script plus a two-line routing edit in the producer. It is released only by the PO; nothing here is built.

## 1. What exists today (PROVEN)

- **The consumer Verify is a list of suites.** The producer registers fixed baseline suites (`baseline-calibration`, `-manifest`, `-repository`, `-verify-contract`, `-architecture`, `-security`; `plugins/pipeline-core/scripts/verify-evidence-producer.mjs:521-534`), one suite `project-<id>` per `verifyImpact` baseline or area command (`:535-536`) and the opaque `verify` command as `configured-verify` (`:537`). In release mode every suite runs (`:542-544`); otherwise areas select by changed path (`:545-549`).
- **`verifyImpact` already has the shape a smoke needs.** Schema `pipeline.project-verify-impact.v1`, free-form ids (`plugins/pipeline-core/lib/consumer-verify.mjs:14`, `:34-37`), documented for consumers (`docs/usage.md:114-117`, `docs/adr/0081-boundary-aware-impacted-verify.md:55-62`). A project with commands but no full `verify` is `baseline-only` and cannot pass release preparation (`ADR-0081:51-53`).
- **A configured command is run as a plain shell string**, exit code 0 or not (`plugins/pipeline-core/scripts/consumer-verify-check.mjs:40-47`). The file is a "never-liftable kernel path"; scanner and architecture logic deliberately live in their own dispatchers (`consumer-verify-check.mjs:13`, `verify-evidence-producer.mjs:528-533`).
- **Evidence steps carry only a name and an exit code** (`plugins/pipeline-core/scripts/verify-evidence.schema.json:1`, `steps` items: `additionalProperties:false`, required `name`, `exitCode`). There is no "unavailable" or "not applicable" value on a step.
- **The capability preflight exists and is exactly the browser half.** `plugins/pipeline-core/scripts/browser-evidence-preflight.mjs`: evidence classes `static`, `offline-behaviour`, `browser-e2e` (`:21`); a local Playwright package plus a real Chromium launch, no product test, no install, no download (`:4-14`, `:23-59`); typed outcomes `ready` exit 0, `unavailable` exit 1 with codes `BEP-PLAYWRIGHT-PACKAGE-UNAVAILABLE`, `BEP-CHROMIUM-UNAVAILABLE`, `BEP-BROWSER-HOST-DEPENDENCY-UNAVAILABLE`, `BEP-CHROMIUM-LAUNCH-UNAVAILABLE`, `BEP-BROWSER-PROBE-FAILED` (`:170-182`), and `degraded` exit 2 when a weaker class is declared (`:155-169`). Its own suite is `plugins/pipeline-core/scripts/browser-evidence-preflight.test.mjs` (7 cases, registered with case ids RC20C001 to RC20C007 at `harness/scripts/verify.mjs:907`: launchable browser, missing shared library, generic launch failure, failed close, declared fallback stays degraded, bounded timeout, static class never launches); six more cases sit in the registered `toolchain-preflight.test.mjs:49-121`. Both inject the probe at unit level. **Nothing calls it from a Verify path:** the only importers are its tests (INFERRED from a repository-wide search for its name; the search found the script, its tests, one file list at `plugins/pipeline-core/lib/guard-maintenance-window.mjs:696` and docs).
- **PO decision D2** (already decided, not reopened here): public browser claims require `browser-e2e`; a `degraded` result blocks publication; the "consumer and release/push-gate integration" is the open remainder (`backlog/items/2026-09-13-greenfield-browser-evidence-is-not-portably-provisioned.md:59-63`).
- **The done-vocabulary is already written.** `manual/browser check: pending` is a named category of the open-items section (`roles/goldfish.md:114`, `templates/prompts/goldfish-task.md:621`), "Implementation complete" leaves manual/browser checks open (`docs/operating-model.md:701-704`), the handover marker legend names browser verification (`templates/handover.md:59`). The acceptance test of the source item: with no browser the status reads "browser verification pending" and the PO gets a clear local startup instruction (`backlog/items/2026-08-18-explicit-final-acceptance-gate.md:42-44`). That is the contract for (c).
- **Two precedents for "declared optional Verify lane".** (i) `verifyManualStatus` yields a synthetic step with a closed disposition `not-configured-yet|declared|placeholder-rejected` (`harness/scripts/manual-check-logic.mjs:27-41`, `verify.mjs:1007-1017`, `:1127`, `:1165`, schema `$defs.manualVerifyStatus`); it is read only by this repository's own `verify.mjs`, not by the consumer producer (INFERRED: the producer file does not contain the name). (ii) `baseline-architecture` is `not-applicable` (exit 0, typed reason) for a project without a map (`plugins/pipeline-core/scripts/architecture-boundary-check.mjs:23`, `:205`, `:347`), and `architectureProjectionForRun` prints a derived verdict **beside** the evidence from the suite's hash-matched retained log, not as part of it (`verify-evidence-producer.mjs:149-177`).
- **Drift noted, not repaired:** the closure evidence of the preflight names `plugins/pipeline-core/lib/browser-evidence-preflight.mjs` (`backlog/evidence/2026-09-18-browser-evidence-preflight-strength-closure.md:8`); the file is under `scripts/`. The greenfield item has closure front matter but its body still says the item stays open (`...not-portably-provisioned.md:62-63`).
- **Not a smoke:** the stack adapters (`plugins/pipeline-core/lib/stack-adapter-contract.mjs:16`) cover security tooling (`static`, `sca`, `iac`, `container`, `ci-workflow`, `dast`, `fuzz`); a DAST scan is a security capability, not a functional page check (INFERRED).

## 2. (a) What the smoke asserts, and for which projects

**Assertions** (the consumer's declared command owns them; the Pipeline asserts only that it ran in a launchable browser and exited 0):

| # | Assertion | Owner | Label |
|---|---|---|---|
| 1 | The app starts (the command starts it, or the project's web server config does) | consumer command | INFERRED |
| 2 | One declared page loads (HTTP success and a stable element) | consumer command | INFERRED |
| 3 | No console error and no failed request on that page | consumer command | INFERRED |
| 4 | One declared journey step (one click or input and its visible effect) | consumer command | INFERRED |
| 5 | A browser could be launched at all, checked **before** 1 to 4 so that "no browser" is never read as "app broken" | Pipeline preflight | PROVEN (`browser-evidence-preflight.mjs:139-153`) |

The command is typically one tagged smoke case of the project's own Playwright suite. A template for it is a later stage and is not needed to deliver the step.

**Project kinds (derived, never stored).** Applicable only when the calibration declares the reserved entry `browser-smoke`; absence means not applicable. Web or UI-bearing projects declare it; CLI, library, service-without-UI and docs-only projects (this repository included) declare nothing, get no `project-browser-smoke` step and cannot be red from it. There is no `projectKind` field and none is proposed. INFERRED: ids are free-form (`consumer-verify.mjs:14`), so the reserved id is a convention, not a schema change.

**Narrower than "a browser" (PROVEN/INFERRED).** The preflight resolves only `@playwright/test` or `playwright` and launches Chromium (`browser-evidence-preflight.mjs:27`, `:38`). A project whose smoke uses another browser tool would read as permanently unavailable, so stage 1 is stated as Playwright-and-Chromium only (decision 8). A consumer that already uses the id `browser-smoke` for a command of its own would, after the upgrade, have it run behind the preflight and could turn red (INFERRED; the id is not reserved today, `consumer-verify.mjs:14`).

**Cost note (INFERRED).** Declared as a baseline command it runs on every selected Verify; declared in an area (for example `web` with the UI paths) it runs when those paths change and always in release mode (`verify-evidence-producer.mjs:542-549`). Recommendation: an area.

## 3. (b) Where it sits

| Option | What it is | New stored field / gate? | Fit |
|---|---|---|---|
| B1 | A declared optional Verify step: the existing `verifyImpact` entry `browser-smoke`, run behind the preflight | No (existing field, convention for one id) | **Recommended, stage 1** |
| B2 | A Verify result kind (`unavailable` or `not-applicable` as a step value) | Yes: changes the closed `steps` shape of `pipeline.verify-evidence.v0` (`verify-evidence.schema.json:1`) and every reader of it | PO decision, default no |
| B3 | A report-only row of the close readback, derived from the run's steps by name `project-browser-smoke` (absent = not declared, exit 0 = passed at the bound commit, non-zero = failed or unavailable) | No, if derived like `architectureProjectionForRun` (`:149-177`); yes if stored | Stage 2 after B1; the readback row builder itself was not read (INFERRED) |
| B4 | A new calibration field such as `browserSmoke: {url, start, journey}` | Yes: a stored declaration that duplicates `verifyImpact` | No; reject (PO goal: fewer duplicated states) |
| B5 | A gate that blocks close or push on a missing smoke | Yes: a new gate | No; D2 decided that `degraded` blocks publication, but no gate that enforces it was found (section 1); nothing more is proposed |

B1 reuses selection, receipt resume, journal logs and the evidence shape unchanged: `project-browser-smoke` is an ordinary step (`:535-536`).

## 4. (c) A runner without a browser

- Today: a command such as `npx playwright test` fails with the tool's own error. That is red but indistinguishable from a product failure, and the preflight that would tell them apart is never run (section 1).
- Stage 1 behaviour, in the new dispatcher before the command: run `preflightBrowserEvidence`. On `unavailable` the step exits non-zero, the command is **not executed**, and the retained step log carries the typed code, the sentence "no browser test ran; this is not a product failure", the status words `browser verification pending`, and a human step. Never a silent pass, never a fake pass: a step that exited 0 would read as passed in the evidence (`steps` has no other value), so the unavailable result must stay non-zero.
- **The preflight's own text is not enough for the refusal rule** (every refusal names a runnable command or a named human step): its `detail` names only the state, e.g. "Browser E2E is unavailable before any test ran (browser-missing)" (`browser-evidence-preflight.mjs:180`). The dispatcher adds one sentence per state, for example: package missing means "the human operator adds the project's Playwright dev dependency"; browser missing means "run `npx playwright install chromium` in the project, then rerun Verify"; host library missing means "the human operator installs the browser's system libraries (`npx playwright install-deps chromium` needs administrator rights)", then rerun. The Pipeline still never installs or downloads (`browser-evidence-preflight.mjs:9-10`, D2 item `:37-40`). The exact wording of the install command depends on the project's package manager and is INFERRED.
- A product failure after a ready preflight exits with the command's own code and says "browser smoke failed" so the two classes stay separate (the acceptance criterion of the strength-class item: `backlog/items/2026-09-13-verify-evidence-needs-an-explicit-strength-class.md:31-36`).
- **Cost to the acceptance path (greenfield and acceptance).** The PO tiles of 2026-11-17 put the acceptance question after Verify, and a red or dirty Verify stops without asking (`plans/candidate-30-queue-2026-11-15.md:496`). So on a runner without a browser, a project that declares the smoke ends in a red Verify and never reaches the acceptance question; the recovery is the human install step and a rerun of Verify (the rerun repeats the Verify, cost stated there). INFERRED: the acceptance-question code path itself was not read. This is the price of "never a pass"; decision 2 offers the alternative.
- The Goldfish report then names `manual/browser check: pending` plus the startup instruction (`roles/goldfish.md:114`); no new vocabulary.
- Whether a project may accept a weaker class on a runner without a browser (the preflight's `degraded` exit 2, `:155-169`) is **not** offered in stage 1: `exitCode` 2 is red in Verify like any non-zero code and an accepted-degraded state would need B2.

## 5. (d) Smallest first stage

**Stage 1: run the declared `browser-smoke` command behind the preflight.** Reaches (GF-10 list): the producer's two `project-<id>` lines, one new dispatcher script, the producer's tests, the toolchain-preflight suite, any file list that names scripts, the usage doc line.

- New `plugins/pipeline-core/scripts/browser-smoke-check.mjs` (own dispatcher, never a branch of the kernel file; mirrors `architecture-boundary-check.mjs`; like `security-close-check.mjs:53` and `architecture-boundary-check.mjs:360` it must export `runConsumerVerifyCheck`, the function the adapter imports, `consumer-verify.mjs:11`): reads the configuration with the existing `readConsumerVerifyConfiguration`, finds the entry with id `browser-smoke`, runs `preflightBrowserEvidence({requiredEvidence:"browser-e2e"})`, then the same `spawnSync(command, {shell:true, stdio:"inherit"})` as `consumer-verify-check.mjs:45`. No entry: prints "browser smoke: not applicable" and exits 0 (unreachable from the producer, kept as a safety net).
- Producer: where `project-<id>` suites are built (`:535-536`), an entry with id `browser-smoke` gets args `[BROWSER_SMOKE_DISPATCHER, "browser-smoke"]` instead of `CONSUMER_VERIFY_DISPATCHER`. The step name stays `project-browser-smoke`; selection, areas, evidence and `verifyRun` shapes are unchanged.
- The implementation digest already covers every file under the plugin package (`consumer-verify.mjs:76-91`), so the new script is bound to receipts without a list edit (PROVEN). Whether the file list at `guard-maintenance-window.mjs:684-701` (role unread) must name the script is INFERRED and must be checked.
- Plugin source: a held patch and the PO's apply; no calibration, schema, gate, signature, approval, Critic or audit-bundle change; no stored status.

**Failing-first proof** (cases in the registered `verify-evidence-producer.test.mjs` or `toolchain-preflight.test.mjs`; a new file would need registration, and `harness/verify-suites.json` is protected). All use a marker-file command, never a real browser. The producer runs every suite in a child process through the adapter, so an injected probe cannot reach a producer-level case; the level of each case is stated:
1. **Producer level**, fixture project without `browser-smoke`: no `project-browser-smoke` step, same steps as before, exit 0 (characterization, green first).
2. **Producer level**, fixture project with the entry and no Playwright package (the real probe reports `BEP-PLAYWRIGHT-PACKAGE-UNAVAILABLE`, not the Chromium code): step exit non-zero, log names that code, `browser verification pending` and the install step, **marker file absent**. RED today: the command runs and the marker exists.
3. **Dispatcher unit level** (probe injected through the existing `deps` seam, `browser-evidence-preflight.mjs:113`): probe `ready`, command exits 0: step 0, marker present.
4. **Dispatcher unit level**: probe `ready`, command exits 1: non-zero, text says "browser smoke failed", not "unavailable".
5. **Producer level**: entry in an area runs only when its paths changed and always in release mode (pins that selection is untouched).
6. **Dispatcher unit level**, table-driven: each of the five unavailable states prints a non-empty human step (pins the refusal rule).

**Neighbour suites (run one at a time):** `browser-evidence-preflight.test.mjs` (the preflight's own suite, first), `verify-evidence-producer.test.mjs`, `toolchain-preflight.test.mjs`, `lib/consumer-baseline-verify.test.mjs`, `lib/verify-selection.test.mjs`, `lib/verify-resume.test.mjs`, `scripts/verify-journal.test.mjs`, `lib/scoped-verify-registration.test.mjs`. No Critic, no Full Verify.

**Later stages (not released; each needs its own release):** 2 a derived report-only line of the Verify output and the close readback (B3); 3 an onboarding offer of a smoke template for web projects; 4 B2 only if the PO wants "pending, not red".

## 6. (e) Open decisions for the PO

| # | Decision | Default |
|---|---|---|
| 1 | Release stage 1 (B1) as the build of the 30k browser-smoke lane | Yes |
| 2 | May an unavailable browser be "pending, not red" (needs a typed step value, a record-shape change, B2)? The cost of "no": on such a runner a declaring project never reaches the acceptance question (section 4) | No: unavailable stays red with a typed message |
| 3 | Reserved id `browser-smoke` as the only declaration, no new calibration field (B4 rejected) | Yes |
| 4 | Recommended placement: an area (UI paths), not the baseline | Area |
| 5 | Does D2 extend to ordinary (not public) projects, or stay a publication rule only? | Publication only; stage 1 adds no gate |
| 6 | Stage 2 (derived report-only row) after stage 1 is accepted | Yes, separate release |
| 7 | Repair the two drift points of section 1 (wrong path in the closure evidence, body versus front matter of the greenfield item) | Yes, a documentation lane, not here |
| 8 | Stage 1 supports Playwright and Chromium only (what the preflight probes); the reserved id `browser-smoke` is announced in the `docs/usage.md` line on `verifyImpact` (a consumer already using that id is told there) | Yes |

## 7. DO-NOT-DO that applies

The DO-NOT-DO list of [the state-machine analysis](state-machine-simplification-analysis-2026-11-17.md) (`:290-303`) binds this work; the queue has no section of that name (its nearest are "What must not change" blocks per item). Applied to this topic:

1. No new stored status and no record-shape change (items 12 and 3): this is why B2 and B4 are not proposed and the unavailable result stays a non-zero step.
2. No Verify result may stand for a commit it did not run on (item 2): the smoke step is bound to the candidate like every step; a smoke result is never carried to a later commit.
3. No automatic step for anything needing a signature (item 8): the install of a browser is a human step, never run by the Pipeline.
4. Nothing deleted by a repair, no time-based expiry (items 5 and 7): not touched.
5. No gate, approval, push approval, Critic evidence, security scan or audit-bundle semantics change: stage 1 adds a step inside the existing Verify and nothing beside it.

## 8. Not proven

No suite was run. The acceptance-question code path (read only through the queue text), the close readback row builder, the file list at `guard-maintenance-window.mjs:684-701`, the case ids of `verify-evidence-producer.test.mjs` (the suite itself is registered, PROVEN `harness/scripts/verify.mjs:774`; so is `toolchain-preflight.test.mjs`, `:220-221`), and a real Playwright launch on a consumer fixture were not read or run. The wording of install commands per package manager is INFERRED.
