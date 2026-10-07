# Design note: a write lease for shared-checkout writes (decision AQ, order 2 of 3)

Status: options for the PO (non-blocking); implementation follows in 0.7.0 with its own test slice, fix and full Critic (`plans/po-decisions-2026-10-07.md:49`, row AQ). Author: goldfish-deep, 2026-10-08. Nothing here was run; contention figures are not measured.

## 1. Problem, measured

Up to 10 dispatches plus the Elephant write one checkout and one `.git/index`. Toil log (`evidence/toil-log-2026-10-06-07.md`, row = line):
- **Index contention.** T44 (:49): parallel edits under `plugins/pipeline-core/` made "`.git/index.lock` collisions repeat" and caused false `GHS-SOURCE-DRIFT` reds; remedy on record was a quiet window.
- **Status flip blocks everyone.** T51 (:55): GG-22 (`guard-git.mjs:1181`, "a commit must not leave an earlier backlog status-flip unreconciled") is global state; one closed item "blocked five unrelated dispatch commits plus the Elephant's own ledger commit" (5 stalled commits, 3 resume rounds). The debt lives between the item flip and the reconcile+commit, a window no one owns.
- **Half-edited shared file.** T56 (:61): a resumed dispatch was refused at its cap mid-edit and "left `scratch-sweep.test.mjs` unparseable in the shared tree". T54 (:59): the hard 35-call cap cut 6 dispatches partial, so every cap-cut is a possible half edit.
- **Orphaned ownership.** T50 (:58): a stopped dispatch's terminal record is immutable, so no record could name the later commit. T55 (:60): records sit in the ignored `evidence/` root. A lease must be releasable and adoptable by a new task ID, and its state is equally unversioned.
- **Concurrent edit of one docs file:** reported by the dispatcher; no toil row in the cited range, so it is not counted as measured here.
- **Existing exclusion is narrow.** `reconcile-backlog-ledger.mjs:394-499` plans three targets (`transitions.ndjson` append, `STATUS.md`, `index.json`), then creates `backlog/.reconcile-transaction.json` with `wx` (:460) and rolls back on failure (:475). That serialises reconcile-vs-reconcile only. `existing` is read at :415, before the journal at :460; the `wx` write sits outside the `try` at :461, so a concurrent holder surfaces as a raw EEXIST, not a typed refusal; a crash leaves a journal in the tracked tree with no stale rule; item flips (`backlog/items/*.md`) and the commit are not covered.

On record (`plans/triage-6-po-options-2026-10-07.md`): "Detection in the verifier: ... compare each commit's paths against the lease" (:101); "A `pre-commit` hook refuses a commit whose staged paths intersect an active lease held by a different actor", with the warning that PreToolUse "must not be the only layer: PreToolUse does not fire in subagents" (:102); common rule "a stale-lease rule ... Retire a lease only on evidence it is dead, and fail open rather than deadlocking" (:103); isolation is not always granted, "so a shared-tree remedy is still needed" (:105). Holder model is not chosen (:107).

## 2. What needs a lease, and what must not

Needs one (shared, read-modify-write or whole-file replace, or one-per-checkout):
1. `backlog/transitions.ndjson` (append-only hash chain), `backlog/STATUS.md`, `backlog/index.json` (whole-file projections) and the reconcile journal: key `ledger`.
2. Item status flips in `backlog/items/*.md`: part of key `ledger`, held from flip until the reconcile commit lands (this is the GG-22 window).
3. The git index across `add` + `commit`: key `index` (one per checkout; seconds).
4. Shared plan/decision files with more than one writer (`specs/**/plans/*`, `docs/state.md`, the PO decisions file): key `file:<path>`, taken only when two briefings' declared scopes intersect.

Must not: a dispatch's own files (`evidence/dispatch-record-<TASK>.json`, `scratch/<TASK>-*`, the one design file or test a briefing assigns it). A path in exactly one declared scope needs no lease; leasing it only adds deadlock surface.

## 3. Options

Triage mapping: its "hook prevention" is B; its "verifier detection" is a cheap add-on to any option (the record lists `leasedPaths`; `dispatch-authorship-verify.mjs` compares commits to them).

**A. Advisory lease file under `.git/agent-pipeline/write-lease/<key>.json`, taken by sanctioned verbs.** Verbs: `goldfish-commit-command-flow.mjs` (index), `reconcile-backlog-ledger.mjs --activate` (ledger). Content: holder task ID, host/boot/pid/start, `acquiredAt`, `ttlMs`, heartbeat = mtime. Stale rule: retire only if the owner is provably dead (same host+boot, process gone) or the holder's dispatch record is terminal, or TTL elapsed with no heartbeat; unreadable or malformed lease fails open with a recorded finding.
- Closes: index.lock retries and the reconcile EEXIST/stale-journal gap for cooperative verbs; T50 (terminal record releases the lease; adoption takes it over).
- Does not close: raw `git commit`, Edit/Write by a subagent, T56 half-edits (advisory only).
- Cost: low-moderate (one lib, ~150 lines, plus tests). Windows: `wx` create works on NTFS; the budget counter lock already carries a win32 owner identity (`guard-dispatch-budget.mjs:680`) but macOS throws `counter-lock-owner-ambiguous` (:681), so macOS and unknown owners must rely on TTL, never pid liveness.
- FANOUT (AJ, shadow): acquisitions and would-refuse events go to the same shadow stream, enforcing nothing; contention counts feed the later enforce decision.
- Worktree-per-Goldfish (AQ 3): the lease root must come from the git common dir, not the per-worktree dir (in a worktree `.git` is a file), else leases are not shared. Per-worktree indexes retire the `index` key; `ledger` and shared plan keys remain.
- Protected files: none of TP-1..13 if tests go in a new `*.test.mjs`; registering the suite in `harness/verify-suites.json` is TP-13 (signed ceremony).

**B. Enforcement in the git hooks.** `pre-commit` refuses staged paths that intersect a lease held by another actor. The actor is unknown at pre-commit (the `Dispatch:` trailer exists only in `commit-msg`), so enforce there, or pass identity through the lease file.
- Closes: wrong-actor commits of leased paths and the GG-22-style stall as a typed refusal. Does not stop the write itself (T56), and PreToolUse does not fire in subagents.
- Cost: high. Hooks are a guardrail surface (critical Critic path), `.git/hooks` is unversioned, so each host needs the refresh from T53 (HOOKREFRESH). Windows: hooks run through Git for Windows sh, a node spawn per commit; feasible, slower.
- FANOUT: this is the enforce variant, so per AJ it ships shadow-first (log would-refuse only) until numbers exist. Worktree: hook must read the common dir.
- Protected files: hook templates and `guard-git.mjs` (guardrail class); `hooks.json` (TP-4) only if a PreToolUse layer is added; new cases cannot go in `guard-git.test.mjs` (TP-1).

**C. One sanctioned ledger verb: flip + reconcile + commit atomically.** Name for design only: `backlog-ledger-write`. It takes an internal short lease, flips the item status, calls `applyBacklogReconciliation` (:394), stages exactly the four paths, commits with trailers, writes the full SHA to the dispatch record (T55), releases.
- Closes: the T51 window by construction (no flip without reconcile+commit), ledger-vs-ledger races. Does not close: index contention among unrelated commits, shared plan files, T56.
- Cost: moderate (extract the flip from callers; the reconcile function is reusable). Windows: single process, lock held for seconds, so stale handling is a 60 s TTL plus process-dead check; no cross-platform owner problem.
- FANOUT: not an enforcement point; a later shadow signal may log direct status edits outside the verb. Worktree: strongest fit; the ledger lives on the main checkout, so worktree dispatches call the verb (or hand back a patch) and the verb is the merge funnel.
- Protected files: none; GG-22's message may later point at the verb (`guard-git.mjs`, guardrail class).

## 4. Recommendation

Build A's lease library, consumed first by C. B waits for FANOUT shadow numbers (AJ). Rationale: T51 is the heaviest measured toil (5 stalled commits) and C removes it with no hook or ceremony; the library is the prerequisite A and C share and the only part that needs a stale rule; B costs a per-host hook refresh and cannot see subagent writes.

Smallest test-first slice (new `plugins/pipeline-core/lib/write-lease.test.mjs`, red before the code):
1. second `acquire` of a held key is refused with typed `lease-held` naming holder task and age;
2. `release` by a non-holder is refused;
3. TTL elapsed without heartbeat retires and re-acquires; within TTL it does not;
4. malformed lease file fails open with a recorded finding, no deadlock;
5. holder with a terminal dispatch record counts as dead evidence (T50); adoption by a new task ID succeeds;
6. same-host dead-pid retire runs on win32 and linux only; macOS falls to TTL.
Then wire `reconcile --activate` so the :460 collision returns the typed refusal. Slice 2: C. Slice 3: `index` key in the commit-flow producer.

PO decisions needed: TTL values and the fail-open default (:103); TTL-only on macOS; whether B waits for FANOUT numbers; whether shared plan files get per-path leases or stay Elephant-only by convention.
