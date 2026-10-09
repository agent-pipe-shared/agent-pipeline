# E2E-ONB-B: greenfield onboarding and design-chain walk (2026-10-09)

Slice E2E-ONB-B-20261009 (Ruling 162, measure only). Candidate commit 3f7708289400d67577c46d0eb0e87ff0b71b8e8f. Runner: Claude host driving WSL. Independent review: pending.

Notation: `<repo-root-in-wsl>` is this checkout as seen from WSL, `<temp-repo>` is the fresh empty WSL directory, `<wsl-node>` is the WSL node binary. Step logs (command, exit code, status/code, next action) are in the repo-root `evidence/E2E-ONB-B-20261009/step-01..07-*.txt`; that directory is a machine-local artifact and is not part of this commit, so the table below stands on its own.

## Method and fixed values

- Fresh empty directory in the WSL user's home temp area, plugin root `<repo-root-in-wsl>/plugins/pipeline-core` (source plugin), every call with `CLAUDECODE=1` (see F1). Followed SKILL.md Step 0/V4, then `intake-generate-design.md`, then `design-course.md`. Every returned action was executed verbatim with only its placeholders filled.
- PO answers used: consent to use the Pipeline yes; language `en`; profile `mini` (smallest of epic|feature|mini); product goal "a CLI that counts words" (one paragraph); human approval `signature` (machine default); Advisor export `declined` (preselected); git author `E2E Walk` / `e2e@example.invalid` (fake pair); design questions: single round, disposition `no-open-questions`.
- Outcome: stopped at the first point that needs a real PO signature (`po-human-approval.mjs sign-intent`), after the design package was still unfinished. `submit-plan` was NOT reached. Nothing was signed. The temp directory was deleted and its absence confirmed.

## Step table

| Step | What ran | Exit | Status / code | Next action returned |
|---|---|---|---|---|
| 01a | preflight in `/tmp` dir via `wsl.exe` (double-quoted outer) | EXIT printed 0, NOT measured (host shell expanded `$?`) | `pipeline-governance-inactive`, runner resolved to `codex` | `onboarding-init --root <temp-repo> --runner codex` |
| 01b | same, later (the `/tmp` dir had vanished; `cd` failed, ran in the source checkout) | 0 (cwd = source checkout) | `plugin-refresh-required` (installed 20261005 vs source 20261008) | not the walk path |
| 01c | preflight in `~/tmp` dir with `CLAUDECODE=1`, single-quoted | 0 | `pipeline-governance-inactive`, runner `claude` | `onboarding-init --root <temp-repo> --runner claude` |
| 02a | `onboarding-init` (inspect, plan, apply-portable-seed) | 0 | `pending-asks`; final `runtime-initialization-required` | applyAction with placeholders: author name/email, human approval, Advisor consent, language |
| 02b | `onboarding-init` with answers (inspect, plan-runtime, initialize-runtime) | 0 | `collect-input`; `INITIAL-ANSWERS-APPLIED`; final `intake-required` | `intake-consent-apply` (language and profile) |
| 03a | `intake-consent-apply --granted --language en --profile mini --activate` | 0 | `applied`, transactionState `collecting` | none in the output |
| 03b | `inspect` | 0 | `intake-required` | `intake-capture-apply` with `--text-turn-ref` (native hook reference) or `--text-file` + sha256 |
| 04a | hand-made `scratch/goal.txt`, `intake-capture-apply --text-file ... --text-file-sha256 ...` | 0 | `applied`, `design-questions-pending` | none in the output |
| 04b | `inspect` | 0 | `intake-design-questions-required` | `intake-design-questions-apply --answers-json <JSON>`; no question list |
| 05a | `intake-design-questions-apply` (`no-open-questions`) | 0 | `applied`, `ready-to-generate` | none in the output |
| 05b | `intake-generate-plan` | 0 | plan summary, featureId `onboarding-c7166f570a9a` | `intake-generate-apply --plan-sha256 988a63e7... --activate` |
| 05c | `intake-generate-apply` (verbatim) | 0 | `applied`, `generated`; wrote design-input.md, prd_*.md, spec.md | none in the output |
| 06a | `bootstrap-bind-plan` (doc-table command) | 2 | `KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING` | none |
| 06b | `inspect` | 0 | `bootstrap-binding-required`, nextAction `architecture-design-required` / `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE` | author a `pipeline-architecture-design` block in the staging PRD |
| 07a | `sed` replaced four REPLACE placeholders, removed the DRAFT TEMPLATE comment line | 0 | n/a | n/a |
| 07b | `inspect` | 0 | still `bootstrap-binding-required`; authoring code gone | `bootstrap-acknowledge-plan --activate --runner claude` |
| 07c | `bootstrap-acknowledge-plan` (probe) | 0 | `signature-required`, request written | `po-human-approval.mjs sign-intent --repo-root <temp-repo> --request scratch/bootstrap-plan-acknowledgement-request-<intentSha256>.json` (attended, user-copy-only) |

## First blocker

- Code: `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE` (returned by `inspect` as `architecture-design-required`); the refusal the walker actually hits first is `KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING` from `bootstrap-bind-plan`.
- Owners: refusal thrown at `plugins/pipeline-core/lib/onboarding-continuity.mjs:5186`; the placeholder check at `plugins/pipeline-core/lib/architecture-design.mjs:62` (rejects the DRAFT TEMPLATE comment and any placeholder).
- Why: the generated PRD arrives with a DRAFT TEMPLATE architecture block full of `REPLACE` values, and the draft itself says binding needs no further framing. The bind command refuses with a marker-missing code that names no next step, while `inspect` says authoring is required. A mechanical walker cannot pass this step; it needs agent authoring (by design) and a clear order of messages.
- After a minimal placeholder edit the blocker cleared and the walk reached the real hard stop: the PO signature (`sign-intent`, attended). Reaching it required zero PO signatures before it, consistent with design-course.md's rule.

## Frictions that are not blockers, each with a proposed slice

- F1 Runner misdetected across the WSL bridge. `wsl.exe` does not forward `CLAUDECODE`, so `pipeline-start-preflight.mjs:918-931` falls back to `codex` and returns `--runner codex` actions to a Claude Elephant. Slice: forward the marker (WSLENV) or accept an explicit runner flag in preflight, and document the WSL call shape in the obligations file.
- F2 WSL call shape pitfalls. (a) `/tmp` did not survive between two `wsl.exe` calls minutes apart; (b) a double-quoted outer string makes the host shell expand `$?` and `$HOME`, so `EXIT` was unmeasured for 01a; (c) a failed `cd` silently ran the preflight in the source checkout (it reported a scratch-lifecycle fault `sweep:WT-SESSION-RECOVERY-JOURNAL` there). Slice: one documented, tested WSL call recipe (single-quoted outer, persistent directory, `cd ... &&`).
- F3 Language is asked twice and one rendered action is malformed. After `onboarding-init` records language `en`, `intake-consent-apply` collects it again although the guidance says it is reused; the `existingFileApplyAction` of the consent action carries capture flags (`--runner --text-file ... --activate --runner claude`). Owner not located within budget. Slice: render fix plus a pin on the action argv.
- F4 Applies return no `nextAction`. `intake-consent-apply`, `intake-capture-apply`, `intake-design-questions-apply` and `intake-generate-apply` print only the checkpoint, so every step costs an extra `inspect`; the `intake-generate-plan` next action omits `--runner claude` unlike its neighbours. Slice: add `nextAction` to those results.
- F5 Capture needs a native hook turn reference that a dispatched or non-hook agent does not have; the file route needs a hand-written file and a hand-computed sha256, while `intake-generate-design.md` documents `--text`. Slice: reconcile the doc with the returned actions and offer an inline-text route.
- F6 The design-question round returns no questions; the agent has to invent them, and the only guaranteed escape is `no-open-questions`. Slice: return a minimal question set (or state that none is required for the `mini` profile).
- F7 Message ordering at the bind boundary. `bootstrap-bind-plan` refuses with the marker-missing code (no next step), `inspect` says authoring is incomplete, the diagnostic text points at "the exact detached-signature acknowledgement action" that only appears later, and the generated PRD note says binding needs no framing. Slice: make the bind refusal point at the `inspect` action, and fix the draft note.
- F8 Banner conflict. Generated drafts say "do not hand-edit" while the flow requires hand-authoring them. The edit here ran through WSL, outside the host guard, so whether the host guard admits the same edit at `bootstrap-binding-required` (NVA-BL-INTAKEBIND-1) is unmeasured. Slice: align the banner and measure the guard lane.
- F9 A signature request was issued over an unfinished package. `bootstrap-acknowledge-plan` wrote its request while `spec.md` still contained `AC-01: WHEN <trigger>, the system SHALL <observable result>.` and a REPLACE traceability row, and the PRD had no product framing; only the architecture block is machine-checked and "do not sign a scaffold" is guidance only. Slice: refuse (or flag) a request over generated-draft markers in PRD or spec.
- F10 The host Write guard refuses any file that contains the literal PO acknowledgement marker line, including an evidence log that merely quoted the refusal message (`GUARD-BOOTSTRAP-ACKNOWLEDGEMENT-WRITER-ONLY`; cost one call). Slice: scope that guard to PRD paths, or list the constraint in `agent-obligations.md`.
- F11 Environment readiness on a pristine non-git directory reports `trust-anchor-match` attended and `git-hooks` unknown, and the walk never git-initialized the directory (`initializesGit: false`); the author identity answered in 02b stayed `gitAuthor: null` in the checkpoint. Not a stop, but the git init, author config and first commit were not exercised. Slice: include them in the next walk.

## Not reached, and the exact remaining work for the next dispatch (Ruling 162)

The temp directory is gone; the next walk repeats steps 01c to 07b (all commands are in the step logs) and then:

1. In `specs/onboarding-c7166f570a9a/prd_onboarding-c7166f570a9a.md`, after the `## Notes` paragraph and before the `pipeline-architecture-design` fence, add the sections What, Why, Scope, Non-goals, Risks, Alternatives, DoD (one or two lines each for the word counter). Keep the four architecture values from step 07a.
2. In `specs/onboarding-c7166f570a9a/spec.md`, replace the line `- AC-01: WHEN <trigger>, the system SHALL <observable result>.` with a real EARS criterion (for example WHEN a file path is given, the system SHALL print the number of whitespace-separated words) and replace the `REPLACE: ...` traceability row cells with the input reference, the requirement and a test path.
3. Reconcile the PRD's second-line `technical-spec-sha256` marker with the new spec file's sha256 (`bootstrap-acknowledge-plan` binds both digests).
4. `git init` plus the local `user.name`/`user.email` (per SKILL.md, only immediately before the first commit) and commit `specs/`; then `bootstrap-acknowledge-plan`.
5. To walk past the signature boundary without a real signature, answer human approval `chat` in step 02b (the briefing allows only measuring up to the signature, so this is a proposal, and whether the chat lane returns a different acknowledgement action is unmeasured). Then `bootstrap-bind-plan`/`bootstrap-bind-apply`, the design-course steps 1 to 5 (Advisor course will be the typed unavailable course in a headless WSL), and the first `submit-plan`.

## Limits of this walk

- One walk, one profile (`mini`), runner `claude`, `signature` policy. `epic` and `feature` profiles, the Codex route and the chat approval lane are unmeasured.
- Steps 01a EXIT value is unmeasured; every later exit code is a real WSL exit status.
- `design-course.md` was read but none of its five steps was executed.
- The accidental preflight run in the source checkout (01b) was read-only by design; I did not diff the working tree afterwards.
