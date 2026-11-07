# w261: answered intake keys are never asked again, and the agent waits for and imports the PO's signed proof without a PO reply (candidate 20, G20-30, AC-108)

Base: `35db88a31` (the candidate-20 chain). Built in the slice clone `scratch/agent-out/s-noreask` (red pin commit, implementation commit).
Closest criterion: AC-108 (PRD and Spec unchanged). Source finding: Codex greenfield report P2, "unnoetige PO-Bedienarbeit und Mehrdeutigkeit"
(design questions asked again, "try normally" again, signature plus a confirmation reply, several different next steps).

## What

- `lib/answered-intake-values.mjs` (new): the one typed readback of five keys, each with the place its answer already lives. `gitAuthor`,
  `language`, `profile` (private intake checkpoint `values`), `designAnswers` (the checkpoint's bundled design-question round, including its
  explicit no-open-questions disposition), `verifyCommand` (`project/pipeline.json`, only when it is a real configured command, never the
  baseline-only placeholder). Nothing is stored twice. `refuseReask(answered, key)` returns `INTAKE-REASK-REFUSED` with `key`,
  `answerLives` and a repair; `reaskViolations(actions, answered)` reports every answered key a set of collect-input actions would ask
  again, by input name. Product questions (`designAnswers`) stay a separate key from the technical settings.
- `scripts/resume-hint.mjs inspect` now returns `answeredValues` (the readback), so the session start that already reads `inspect`
  finds the keys before it asks.
- `lib/signed-proof-wait.mjs` + `scripts/proof-wait.mjs` (new): `proof-wait.mjs --root <project> --proof <ref> [--timeout 1-600]` is a bounded,
  read-only poll (the shape of `session-authority-repair.mjs wait`) for the one proof file a signing step names. A reference is either
  `scratch/<name>proof<name>.json` below the project or an absolute `proof-<64 hex>.json` (the guard-override key-directory form); no dot
  segment, no backslash. It observes that a regular, single, well-formed `pipeline.po-approval-proof.v1` file exists; it never verifies a
  signature (the import step does), never prints the file, never reads the key directory. Exit 0 `proof-present`; exit 2 with a typed code and
  exactly one `repair`: `PROOF-WAIT-TIMEOUT` (the PO's one signing command, derived by sign-intent's own naming convention, then the same wait),
  `PROOF-WAIT-INVALID`, `PROOF-WAIT-ARGS`, `PROOF-WAIT-ROOT`.
- Guard admission: `PROOF_WAIT_SCRIPT` in `lib/guard/constants.mjs` and `sanctionedProofWaitArgs` in `lib/guard/command-catalogue.mjs`
  (exact argv, same shape as the reference grammar; the wait is read-only, so it is admitted in every lifecycle state like `wait`).
- `awaitSignatureFields` (one builder): `proofPath`, `reportBackRequired: false`, `waitAction` (exact argv), `afterSigning`. The live design-approval
  signing step in `pipeline-state.mjs` (`inspect` nextAction) spreads it beside the PO's sign command; `present-plan` prints the same wait
  command once, on a line that does not repeat the sign command. After the PO signs, the existing `inspect` readback turns into the agent's own
  `approve-plan --design-approval-request ...` (requiresConfirmation false), which is the import: no PO reply is needed.
- `skills/pipeline-start/references/resume-hint.md`: two lines naming `answeredValues` and the typed refusal.
- Pin: six cases appended to the registered `lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` (they reuse its signed
  design-approval fixture and the Codex onboarded root). Four cases were written first and run RED against the original code (all four
  failed), then GREEN after. The guard-admission case (exact argv of `proof-wait.mjs`) was written AFTER the implementation, to pin the
  briefed "sanctioned wait" admission; it was never run RED. The one-readback assertion (present-plan prints exactly inspect's `waitAction`)
  was added to the first case after the implementation.

## Why

The answers already lived in the checkpoint, but nothing named where, so a restarted agent could ask again, and the signing step said "then
inspect again", which a session turned into "tell me when you have signed". The readback and the wait close both with one typed surface each;
the refusal is typed (never fully blocking: it names the place and the repair) and a refused wait leaves no state.

## Not changed

- `lib/path-spelling.mjs`, the separator-sweep sites, the retired design-workflow-package signing branches in `pipeline-state.mjs` (dead since
  DWP-PRESENT-RETIRED), `onboarding-continuity.mjs`'s bootstrap-acknowledgement sign action, the push-approval signing step and the guard-override
  `prepare-for-signature` result. The override result already hands the agent `proofPath` and `authorizeBySignatureCommand` (PO decision
  2026-10-27); only the wait on that absolute path is new, and it is admitted by the same grammar (`proof-<64 hex>.json`), but those sites do not yet
  spread `awaitSignatureFields`.
- The builders in `project-onboarding-v3.mjs` that ask language, profile, author, design answers and the verify command: they already
  skip an answered key (D98, `intakeConsentAction`, the initial-answers round, `withPendingVerifyContractAsk`); the new check is a pin over
  their real output, not a second filter inside them.
- `values` of the Resume-Hint card still accepts only `gitAuthor`, `language`, `profile`; a verify command or design answers given in chat
  and not yet applied through their own apply command are not persisted by the card.
- Permission boundary of the wait: `observeProofFile` on a key-directory reference lstats, size-checks and parses ONLY the one named
  `proof-<64 hex>.json` file; it never lists the directory and never reads any other file in it, and it never prints the file.
- No new test file, nothing registered in `harness/verify-suites.json`, no inventory change.

## Not proven

Full Verify of the applied chain, Critic review, PO acceptance, a live run on any runner, Windows/macOS execution.

Third checkpoint (second grant; supersedes the second-checkpoint and first-checkpoint paragraphs below where they say "not run"): the pin file
was re-run alone, 28 tests, 26 pass, 1 fail (the AC-264 two-block case, restated by the Coordinator in the build clone, left red here), 1 typed skip.
New cases this round: `scripts/push-prepare.test.mjs` "G20-30 pushPrepareReport ..." (suite 94/94 after a fix: the agent line was over the 72-column
bound, so it now points at `report.awaitSignature.waitAction` instead of repeating the argv), an assertion block in
`lib/human-guard-override.test.mjs` (suite 186 tests, 184 pass, 1 skip, 1 fail: "Q9 (D55)", `domain-ancestor-unsafe`, which fails identically
in the unmodified main tree), and the pin case for the runtime refusal (RED first: `withReaskRefusals` was not exported; GREEN after exporting it).
The bootstrap-acknowledgement wiring still has no case of its own. `project-onboarding-v3.test.mjs` (alone, final code; a single script-style top-level test that prints
PASS/FAIL lines) returned exit 1 with exactly two FAIL lines and no failure in any onboarding-ask or bootstrap case: (a) "SECGATE-2 ... installed-plugin
shape": `Cannot find module .../lib/security-close-status.mjs imported from .../lib/security-completeness-gate.mjs` in the deployed fixture. That module was
introduced by chain commit `93c7bb2e4` (w257), before this slice, and the fixture's copy list (`project-onboarding-v3.test.mjs` near the
`security-completeness-gate.mjs` entry) does not carry it, so this is a chain defect, not caused by this patch; (b) "SECGATE-1 ... the push gate is
satisfied, but the security gate alone must still refuse": same security-gate area, not shown to be pre-existing by a baseline run (none was made).
Neither is restated here. `pipeline-state-inspect.test.mjs` alone: 26 tests, 26 pass. `project-onboarding-e2e.test.mjs` alone: 7 tests, 6 pass,
1 skipped, exit 0. `guard-lifecycle-ready.test.mjs` on the final code was started alone and had not returned when
this budget ended (an earlier run, before the final wiring, was 430 tests / 427 pass / 0 fail / 3 skipped); the `onboarding-continuity` tests
were not run; SECGATE-1 has no baseline run. The bootstrap-acknowledgement wiring still has no case of
its own. The final clone commit is `d58b53bde`; the saved patch is current with it. Not run in this round: `guard-lifecycle-ready` (it passed 430/427/0/3 earlier, before the
wiring), `project-onboarding-e2e`, `pipeline-state-inspect`, `onboarding-continuity` tests.

Second checkpoint (after the Coordinator's decisions, clone commit `0e3e7efb6`): the wiring was added and committed in the clone but NOT run
at all, by any suite: `withReaskRefusals` (lib/project-onboarding-v3.mjs, last step of the envelope: an ask of an already-answered key gains a typed
`reaskRefusals` on the nextAction, never a silent drop), `awaitSignatureFields` spread into the onboarding bootstrap-acknowledgement sign step
(v3), the guard-override `prepare-for-signature` result (lib/human-guard-override.mjs, a protected-source file) and `push-prepare.mjs` (report
field `awaitSignature` plus one agent line). The wait cannot take a Windows absolute proof path (backslash is refused), so the override
wait is POSIX-only. Existing tests that deepEqual those results (v3, onboarding-continuity, push-prepare, human-guard-override) have not been run
and may need a restatement; the guard-lifecycle-ready run started earlier never returned a result in this session and was overlapped by these edits,
so it must be re-run alone. No test covers the new runtime refusal or the three new wirings yet. Per the Coordinator the AC-264 two-block case is
not restated here.

Checkpoint state (first, budget stop, not a green close): the final pin file was NOT re-run after its last two additions (the one-readback `endsWith`
assertion in the first G20-30 case, and the document line in `resume-hint.md`); the last full pin run (before them) was 26 tests, 24 pass, 1 fail
(the pre-existing red below), 1 typed skip, and the admission case passed on its own run. `hooks/guard-lifecycle-ready.test.mjs` was started once
and its result was not obtained; `project-onboarding-e2e.test.mjs` and `pipeline-state-inspect.test.mjs` were not run. Resume-hint suite 13/13 and
`scripts/pipeline-state.test.mjs` 1/1 passed before the last additions.

- `lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` has ONE failing case in the clone (a pre-existing red, not restated here):
  "AC-264: the default-mode present-plan hands the PO exactly one sign-intent command, in the absolute --request form". On a WSL host the
  renderer (`renderPoTerminalCommand`, introduced by clone commit `2dc43cd97`, which precedes this slice) prints two terminal blocks (option A
  WSL, option B PowerShell) wrapped over several shell lines, so two lines name `sign-intent` and the first is a wrapped `CMD=${CMD}'...'`
  segment that the case's `--request "<path>"` regex cannot match. The line this patch adds contains no `sign-intent`. The unmodified main
  tree (before that commit) passes the case. It needs a QG-04 restatement of the case to the two-block rendering, owned by that change; the
  other 25 cases of the file pass or are the file's typed skip.
- Deviation (briefed sites left unwired): the guard-override `prepare-for-signature` result (`lib/human-guard-override.mjs`, where `proofPath`
  already exists) and the push-approval signing step do not yet spread `awaitSignatureFields({ root, proofPath })`; the onboarding bootstrap
  acknowledgement sign action (`lib/onboarding-continuity.mjs`) does not either. Only the live design-approval step and its `present-plan` output do.
  The wait itself already admits their proof shapes (`scratch/*proof*.json` and an absolute `proof-<64 hex>.json`).
- `reaskViolations` is a typed check the pin applies to the real asks; the onboarding envelope does not call it at runtime (no extra
  filter in the 7000-line builder), so a future builder that asks an answered key is caught by the pin, not at the moment it asks.

## Needs the Coordinator

Apply the chain in order, run the final Verify, and decide whether the three unwired signing sites and a runtime call of `reaskViolations`
belong to this candidate. The edited pin file is already registered.
