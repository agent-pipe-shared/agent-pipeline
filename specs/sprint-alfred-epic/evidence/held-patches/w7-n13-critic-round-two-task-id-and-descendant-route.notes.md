# W7-N13 -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `a9bbcf8fe`. Patch: `w7-n13-critic-round-two-task-id-and-descendant-route.patch` (5 paths, `git apply --check` exit 0 on a plain clone of the candidate). Backlog item: `2026-10-29-the-elephant-can-attest-its-own-document-work-for-critic-admission.md` (title inside the file: "Critic round two needs the first delivery's task id, and the tools do not say so"; the file name still carries the first, wrong reading).

## What it delivers (Toolbox finding N13, from the source of `evaluateReviewAdmissionCore`)

- **Refusal text** (`scripts/check-critic-skip-coverage.mjs`): the zero-target refusal now begins with the descendant route: a later Critic round carries the task id of its first delivery, and a review candidate that descends from a delivered Goldfish record (authored-commit or orchestrator-attested) with the SAME task id is admitted without a new record. When a delivered record under another task id is an ancestor of the review candidate, the text names that task id ("use that task id for this round"). At most the 25 newest pending delivered records are checked for ancestry; a record whose ancestry cannot be read names no suggestion. The pinned prefix `review admission requires exactly one matching target for ...; found 0` and the attested-record sentences are unchanged.
- **Skill** (`skills/critic-review/SKILL.md`, section "Continuing a Critic course after the first round (PF-94)"): states that every later round carries the first delivery's `taskId` and that a new one is refused with `CPP-REVIEW-ADMISSION`.
- **Preflight** (`scripts/critic-dispatch-preflight.mjs`): optional `--task-id <id>` (one, safe id). When given, the preflight runs the same `evaluateReviewAdmission` that `admit` runs later and refuses with `CDP-REVIEW-ADMISSION` (same findings) instead of reporting `packet-ready`; on success the result carries `reviewAdmission: { taskId, mode: "exact" | "descendant" }`. Without the flag nothing changes. With a review scope (no range) the flag is refused.

## Checks (scratch clone, committed candidate)

- `check-critic-skip-coverage.test.mjs`: CSC-N13a (hint names the route), CSC-N13b (a fresh `FIRST-critic-r2` is refused and `FIRST` is named; `FIRST` itself is admitted by descent); the whole file exits 0.
- `critic-dispatch-preflight.test.mjs`: 66/66 including two N13 cases (refusal with the new flag and unchanged result without it; the argument parser takes one safe `--task-id`).
- `critic-packet-preflight.test.mjs` and `session-critic-finalizer.test.mjs` exit 0 with the patch.

## NOT in this patch / not verified

- The admitted path of the preflight flag (a real delivered record plus descendant candidate through `preflightCriticDispatch`) is covered through the admission function's tests, not by a preflight fixture with a record.
- N14 (`CAC-REGISTRATION-INVALID` without a reason), N15 (agent cannot delete its own scratch files), N16 (briefing build cannot read a spec addendum as a criterion) are separate and not built.
- Full Verify, batch Critic and PO acceptance remain pending. Kernel paths: the PO applies the patch under a Guard Maintenance Window. The Toolbox itself retries first on the existing undocumented route (first delivery's task id).
