# w30j10 — the write side of the legacy close journal is removed, two stale guard-push sentences are corrected (C10 / SM-13, PO tile E1-4 = YES; C30J-J10)

Applies AFTER the integrated 30i tree (the clone base9): the patch is a delta on the same files and does not apply to the real HEAD until that tree is applied (`apply --check` is exit 0 against `scratch/agent-out/c30g/base9`, exit 1 against the real HEAD, as expected). The check test therefore never runs `git apply`. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran, so this change is verified by tests only.

## What

- `plugins/pipeline-core/scripts/publication-close-journal.mjs`: `createCloseJournal`, `advanceCloseJournal` and `storeCloseJournal` are removed. `validateCloseJournal`, `readCloseJournal`, `JOURNAL_SCHEMA`, `JOURNAL_PHASES` stay, so an old journal file remains readable (the AC-047-27 compatibility the module comment names). No record shape, digest or key byte changed; no status is stored.
- `publication-close-journal.test.mjs`: the cases that exercised the writers are replaced. RED first (against the original code): the new case "the legacy close-journal write side is gone" failed (`createCloseJournal` still exported, exit 1). New cases: the three writers are not exported; the two readers are; a hand-built old journal file (revision 1, mode 0600) validates and `readCloseJournal` names only the next phase; a torn file still blocks recovery. Removed with the writers: replay/CAS/foreign-lock cases that only the removed `storeCloseJournal`/`advanceCloseJournal` ran (restated per QG-04; the lock and CAS code stays covered through the unchanged coordinator/lifecycle writers).
- `goldfish-commit-command-flow.test.mjs` (comment about line 291, string about line 320) and `guard-lifecycle-ready.test.mjs` (comment about line 2820): the false sentence "guard-push refuses -m with --trailer" is replaced by the accurate one: guard-push admits one plain printable-ASCII commit on one line, no backslash, no global option, with a quoted parenthesised trailer (PGC-T82b); the dispatched route stays the message file because guard-dispatch-budget's closing-act check rejects parentheses. Comments and one reason string only; no behaviour change.

## Precondition (searched before the edit)

Search for the three names over plugins, harness, docs, scripts, specs, templates, policies, guardrails and roles found: the definitions, the one suite that tested them, and the two earlier held-patch files (history). No importer, no document or script use. `AC-047-27` has no spec or docs text anywhere in the repository; only the module comment (and the briefing) carries that old id, so it is not invented as a criterion and the work is bound to AC-112.

## Not changed

- `validateCloseJournal`, `readCloseJournal`, the coordinator and lifecycle writers, `withLock`, `durableReplace` (still used by them).
- No guard, gate, signature, approval, Critic or audit semantics.

## Tests (clone, test-in.mjs, one at a time)

- `publication-close-journal.test.mjs`: 1 pass, 0 fail on the final clone HEAD, including the restated lock/CAS/replay cases through the lifecycle writer (RED before the removal, exit 1).
- `goldfish-commit-command-flow.test.mjs`: 31 of 31 on the final clone HEAD.
- `guard-lifecycle-ready.test.mjs` (comment-only edit, about line 2820): whole file 450 tests, 447 pass, 0 fail, 3 skipped (exit 0; it ran in the background after the comment edit, before the later test-only commit that touched other files); the edited case (`--name GUARDFIX-2`) was also run alone: 1 of 1 green.
- This check test: 2 of 2.

## Not proven

- No full Verify, no Critic, no architecture-boundary run. The check test is not registered in a Verify suite list.
