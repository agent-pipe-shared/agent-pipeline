# Night plan 2026-10-04 → 2026-10-05 (PO asleep from ~22:30 Berlin; installs at 07:00 Berlin = 05:00Z)

PO instruction (chat, 21:43 Berlin): if not done in 20 minutes, keep building small content until 06:30 Berlin
(04:30Z), then build and stamp the local intermediate candidate so the PO can install at 07:00.

PO INSTRUCTION (chat, ~21:55 Berlin, verbatim intent): "festhalten, dass ggf. weiteres gebaut wird! Du darfst
nicht stoppen" — the Elephant must NOT stop or idle overnight. Whenever a dispatch finishes, immediately start
the next queue item; when the queue is empty, take the next item from the "done early" list, then further
useful, non-protected, independently landable items from the Fable stage plan (S0/S1 consolidation, R2 read-
policy narrowing PREPARED as a package, remaining win32 test fixes). Never end a turn while work is possible.
Only at 04:30Z switch to stamping, then hand over.

STATUS 20:20Z: RF-2c (attribute+fix session-cleanup regressions, land readiness warning) running. Package #3
post-images built in scratch/qp3 (guard dba657ba…, test 01bc2610…); full staged suite running in background
(task bqydusacg → scratch/qp3/compare.json, build-dry-run.log). Open for qp3: diagnose the remaining failing
"SIGNED-AGENT closed enforcing origin and filesystem grammar" test (likely symlink EPERM), write README,
Critic review, final builder run on the final HEAD in the morning before signing. NOTE: `--test-name-pattern`
must precede the file argument.

STATUS 21:15Z: package #3 v2 Critic re-review PASS (F-A no security hole — test was win32-broken; policy swap
refused; F-B realpath identity; F-C clean snapshots). Digests verified by the Elephant: guard post 35c16300…,
test post 1a5f3a72…; pre = HEAD blobs f5b28addb / 3958fc661. Still to do for qp3: full staged guard suite on v2
(after RF-2c finishes, to avoid load), final builder run on the final HEAD right before the PO signs.

STATUS 00:30Z: full Verify running (task br4jloluo). Critic on the residue root fix STOPPED with a correct
briefing violation: the PO decisions authorising the zero-authority unsigned archive and warn-instead-of-lock
exist only in scratch notes; the tracked Spec §20.2/RV-4/RV-5 still require signatures. NEXT after Verify:
goldfish commits the evening PO decisions (Fable decisions, residue decisions, review merge + feature
proportionality, intermediate candidates) into `specs/sprint-alfred-epic/design/po-queue-2026-10-03.md` as a
tracked decision record (verbatim PO answers, dated), then re-dispatch the Critic with that tracked reference
and tracked evidence paths (no scratch artifacts, no paraphrased requirement in the dispatch).

Hard rules overnight:
- No step may need the PO (no signatures, no `!`). Protected-file changes are only PREPARED as signed-package
  requests (built + Critic-reviewed), signed later by the PO.
- One committing agent at a time; never run a full Verify while an agent commits; never put test fixtures in the
  repo tree; check `session-cleanup.mjs status` after every Verify/test-heavy step.
- Time checks with `date -u` between dispatches. At 04:30Z stop new work, finish the stamp by 05:00Z.

Queue (in order; skip ahead when blocked):
1. RF-2b (running): foreign orphan residue → warning; one readiness intent; producer exit-path retirement.
2. Remaining hotfix regression tests (HF1+3, HF2+4, HF5, HF8) in registered suites.
3. Full Verify on native Windows (after RF-2b) → triage list; fix non-protected regressions caused by today's
   work; record pre-existing win32 failures (guard 60, verify-journal 3, signed-quality-package 22,
   runner-design-readiness-bootstrap 1, session-cleanup-recovery 3) in the candidate report.
4. Security scan (`node plugins/pipeline-core/scripts/security-scan.mjs`).
5. Independent Critic over the delta since ae7ef5a2 (bounded, 15-call cap) — non-protected findings fixed.
6. Prepare signed package #3 (guard: archive verbs admission, G8 win32 paths, W0-4 F-1/F-2) — build + Critic,
   NOT applied; signing optional for the PO after install.
7. Stamp intermediate candidate 1 at ~04:30Z: find the sanctioned stamp/candidate script (release preflight /
   candidate stamp), stamp `0.7.0-ic1+claude.<ts>.<commit>` or the project's convention; write
   `scratch/IC1-HANDOVER.md` with: what is in it, known failures, exact install commands (installer + hook
   snapshot refresh for commit-msg and pre-commit), restart note, rollback.
Persist held notes into tracked files via a goldfish before the stamp (records commit).

UPDATE (PO, chat ~21:50 Berlin): the PO is willing to SIGN packages in the morning BEFORE the candidate.
Morning sequence: by 04:30Z have package #3 (and any other protected-file package) built + Critic-PASS + a
morning runbook `scratch/MORNING-RUNBOOK-2026-10-05.md` (sign → apply/authorize/commit block per package →
then I run the guard suite + targeted suites on the final tree → stamp → install commands). Full Verify runs
overnight on the pre-package tree; after the package commits only the touched suites are re-run before the stamp.

If the queue is done early (e.g. by 04:00 Berlin): keep adding useful, non-protected, independently landable
items until 04:30Z, each with tests, in this order: guard-suite test-file fixes G3–G7 (no fixtures in the repo
tree) and explicit skips for G1; signed-quality-package test fixture line-ending fix (22 win32 failures);
runner-design-readiness-bootstrap K3-16 fixture; Fable consolidate wins CD-1…CD-5 (shared digest/fs-atomic
helpers, S1) behind facades in non-protected modules. Stop new work at 04:30Z regardless.
