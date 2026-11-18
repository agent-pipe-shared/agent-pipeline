# w30j21 — the push target in the existing first onboarding round (candidate 30j, slice C30J-J21): RECON ONLY, STOPPED

Status: **no patch was written.** The briefing orders a stop after the recon, with proof and the smallest design, when the wanted change needs a new stored field, a changed record digest, or a file outside the write list. The recon below shows all three. Nothing was changed in the clone either (`scratch/agent-out/c30j/j21` is at its base commit).
Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify runs; no test was written or run (the stop came before the test-first step), so there is nothing green or red to report.

Paths below are relative to `plugins/pipeline-core/` in the clone, which is the applied chain at the integrated 30i tree.

## Recon 1 — what the one initial-answers ask carries today

`collectInitialAnswersAction` (`lib/project-onboarding-v3.mjs:7320-7411`) builds ONE `collect-input` action. Its inputs (`:7353-7361`) are:

| Answer | Input name | argv flag at apply | Where defined |
|---|---|---|---|
| git author (only when unresolved) | `gitAuthorName`, `gitAuthorEmail` | `--git-author-name/--git-author-email` | `:7344,7364-7369` |
| human-approval mode (signature / chat) | `humanApprovalMode` | `--human-approval` | `:7355,7373`, input built at `:6363-6390` |
| Advisor export consent (omitted when folded into the first consent record) | `advisorExportConsent` | `--advisor-export-consent` | `:7356,7374` |
| language (omitted when the intake checkpoint already has it) | `language` | `--language` | `:7357,7375` |
| trust-anchor inputs (signature route) and merged intake consent inputs (profile; first project description off Claude) | various | various | `:7358-7360,7376-7383` |

`withFieldsAtOnce` (`:6193-6206`) lists every input with its default so a single answer completes the round; its default map is `FIELDS_AT_ONCE_DEFAULT_INPUTS` (`:6185`). The driver rewrites the same ask in `scripts/onboarding-init.mjs:1374-1392` (a second copy of the guidance text, in a file outside the write list).

## Recon 2 — where `repositoryMode` is set today

- Seeded, never asked: `freshCalibrationValue` (`lib/project-onboarding-v3.mjs:1516-1525`) writes `repositoryMode: hostManaged ? "host-managed" : "local-only"`; it is placed into both twins by `freshBaselines` (`:1821`; call sites `:496,527,4883,6122`). This happens BEFORE the first-answers round.
- The first-answers transaction is `applyInitialOnboardingAnswersCore` in `scripts/onboarding-init.mjs:918-1179`. Its transaction targets are exactly four files: `pipeline.user.yaml`, the machine plane, the private receipt, `project/pipeline.yaml` (`:980-985`; snapshots `:1016-1017`; host-managed journal targets `:1137-1146`). The calibration twins are not among them.
- `scripts/v3-bootstrap-authority.mjs` only reads the value (`:66` host-managed test; `:129,134,182` repository capability). It never writes it.
- `scripts/repository-mode-promote.mjs` is the only later writer: `local-only -> remote-tracked` by one byte-level token replace on both twins (`:27,32,49-63,114-146`). It refuses `host-managed` and, important for design, **refuses with `RMP-NO-REMOTE` when no git remote is configured yet** (`:94-97,130`).

## Recon 3 — what the calibration records when a project promotes later

Nothing but the value: both twins (`project/pipeline.json`, `.claude/pipeline.json`) differ in that one token, and the result says `promoted` / `unchanged` with the paths to commit as their own commit; the pre-commit hook admits that one-token change without a signature (`repository-mode-promote.mjs:16-18,144-145`). The consumer cost came from doing it inside a running close, where it counts as a gate-definition change (the order hint "before the feature or in its own block" is already in queue C30-24 item 9/10).

## Why the wanted change is not small (the proof)

The wanted outcome is "the existing ask also carries remote/none, and `remote` is written as the initial `repositoryMode` in the same onboarding transaction". That needs, at minimum:

1. **A new answer transport that no file in the write list owns.** An answer reaches the apply only as an argv flag parsed in `scripts/onboarding-init.mjs:255-289` (usage `:175`), and the flag must also be admitted by the guard's sanctioned-args table (`lib/guard/sanctioned-args-scripts.mjs:101-108`, a protected plugin guard file). Without both, a returned `applyAction.argv` carrying the new flag is refused by the parser or the guard. Both files are outside the write list.
2. **A new stored field.** The answer must survive the idempotent re-entry. Today the private receipt (`scripts/onboarding-init.mjs:1120-1130`, validated in `lib/project-onboarding-v3-author-identity.mjs:149-164` and `scripts/onboarding-init.mjs:784-787`) stores every answer, and a rerun with a different answer is caught at `:1046-1053` (`INITIAL-ANSWERS-RECEIPT-CONFLICT`). A `remote` answer with no receipt field would make a rerun with the other answer a silent no-op, which is the drift class this candidate forbids. The receipt field is a record-shape change, the "derive, never store" rule says stop.
3. **A changed digest of an existing record.** `answerSha256` (`scripts/onboarding-init.mjs:977-979`) hashes the answers and binds the host-managed pending journal (`:1006-1011,1147-1149`). Adding the answer to it changes the digest of every existing pending journal; leaving it out leaves the journal blind to the answer.
4. **A larger transaction.** The calibration twins would become two more journalled and rolled-back targets of a four-target transaction (`:980-985,1016-1022,1137-1146,1154-1164`), including the twin-consistency rule that `promoteRepositoryModeBytes` and the pre-commit hook enforce.
5. **A refusal that needs a design decision.** `remote` answered at onboarding usually precedes `git remote add`; `repository-mode-promote` would refuse that state (`RMP-NO-REMOTE`), so "remote in the same transaction" needs a rule for a remote that does not exist yet (accept and later fail the push gate, or ask for the remote name in the same round).
6. **Test surface.** Adding an input and an argv flag to the ask changes `applyAction.argv` and `fieldsAtOnce`, which are pinned by many registered suites (matches for the Advisor-flag placeholder alone: `hooks/guard-lifecycle-ready.test.mjs` 10, `scripts/onboarding-init.test.mjs` 6, `lib/pins/unasked-advisor-export-consent-in-fresh-seed.test.mjs` 6, plus the e2e, intake-author, three guard suites and one more pin) and by the sharded onboarding suite partition the briefing says must not move.

Files that would have to change: `plugins/pipeline-core/scripts/onboarding-init.mjs`, `plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs`, `plugins/pipeline-core/lib/project-onboarding-v3-author-identity.mjs`, and the matching test files; of the five files in the write list only `lib/project-onboarding-v3.mjs` is on the path, and `scripts/repository-mode-promote.mjs`, `scripts/v3-bootstrap-authority.mjs` need no change at all.

## Smallest design (for the Coordinator to decide; not built)

- **Design A (what the briefing wants, one new flag).** A new optional `--repository-mode none|remote` flag on `onboarding-init.mjs` with default `none` (a missing flag changes no byte of any record and no digest: the receipt field and the `answerSha256` input are added ONLY when `remote`). On `remote` the same transaction replaces the single `local-only` token in both twins using `promoteRepositoryModeBytes` (reuse, no second rule), and the `RMP-NO-REMOTE` check is moved to the push gate or replaced by a named human step ("add the remote, then push"). The ask gets one more input with the recommendation text. Needs a new scope: `onboarding-init.mjs`, the sanctioned-args table, the receipt validator, tests; and a separate decision on point 5.
- **Design B (inside the write list, no stored field, but not what the briefing wants).** Guidance text only: the first-round ask says "if this project will be pushed to a remote, run `node <plugin-root>/scripts/repository-mode-promote.mjs --root <project-root> --to remote-tracked` as its own commit right after the answers are applied and before the first feature". It is not part of the onboarding transaction, it needs the remote to exist, and the guidance string exists twice (`lib/project-onboarding-v3.mjs:7400` and `scripts/onboarding-init.mjs:1392`; the second is outside the write list), so it cannot be changed from here.

## Not changed / not proven

- No production file, test or patch was changed or written; the check test of the briefing (patch exists, touches only the named files) was not written because there is no patch for it to examine.
- No test was run. The 240-case sharded onboarding suite was only inspected by search, not run.
- Not proven: that Design A can be built without touching the sharded partition; the match counts above are search counts of test files, not an impact analysis.
