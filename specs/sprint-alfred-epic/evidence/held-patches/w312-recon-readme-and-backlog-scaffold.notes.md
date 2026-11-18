# w312: recon L5, README and backlog scaffold at onboarding without a write refusal

Slice C31-R2 (candidate 31, lane L5). Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

Apply order: this patch is a delta on the base clone of candidate 31 (`35560870d..HEAD` of the clone chain). It applies only after that base patch is applied; it does not apply to the current checkout alone (checked with `git apply --check` against the base clone: exit 0).

## What

- One new analysis note, `specs/sprint-alfred-epic/plans/recon-l5-readme-backlog-scaffold-2026-11-18.md` (under 150 lines, PROVEN / INFERRED labels with file:line): (a) the onboarding apply is the only create-only, rollback-protected writer of root files, with the D80 decision-record seed and the G20-42 `VERSION` seed as precedent shapes; (b) which guard lane refuses a README write, with the three labels (Edit/Write prints a `BLOCKED (guard-devplan ...)` text without a code, the shell lane `GUARD-DEVPLAN-SHELL`, the staged commit `GUARD-DEVPLAN-LIFECYCLE`), and why `backlog/` is already admitted everywhere; (c) the one shared scaffold predicate `isOnboardingScaffoldPath` and the exact one-entry widening (`README.md`, root only), against the unrelated `pipeline-owned-files.mjs`; (d) the smallest build with its failing-first cases, the pins to restate, the neighbour suites and what needs the PO; ending with a recommendation and seven open decisions with defaults.

## Why

Two consumer runs needed the PO to ask how to start the app because no README existed. The PO condition is that a scaffold must never cause a write refusal. The recon shows where a refusal could arise (the scaffold commit and a draft-lifecycle write of `README.md`) and where it could not (`backlog/`).

## Not changed

- No code, no test of the product, no suite run: analysis only. No stored status, record shape, digest, key byte, gate, signature, approval, Critic evidence semantics, security scan or audit bundle behaviour is touched or proposed.
- The note states a premise correction: the reports show no README WRITE refusal, only the missing file; the admission matters for the scaffold commit.

## Not proven

- The draft-window refusal of README.md is read from code and from an existing pin (`hooks/guard-devplan.test.mjs:1089`), not executed. The Antigravity and Codex lanes beyond the shared `devPlanGateVerdict`, a consumer override of the L11 source-extension set, and the registration of `guard-devplan.test.mjs` and `project-onboarding-v3.test.mjs` in the Verify suite list are not checked.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: the only test is the check file (patch exists, touches only the note).
