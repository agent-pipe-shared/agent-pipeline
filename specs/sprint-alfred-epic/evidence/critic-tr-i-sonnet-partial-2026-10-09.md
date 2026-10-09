# Critic review: TR-I (T33 fd-3 inertness), Sonnet round, PARTIAL (2026-10-09)

Persisted by the Elephant from the Critic's returned report. The Critic had no Write tool, so `critic-notes.md` could
not be written, and the Critic disclosed that. Content is condensed, without changing findings or evidence.

- **Route:** requested `claude-sonnet-5-5` at max. The effective identity `claude-sonnet-5-5` was observed in the
  runtime prompt. The dispatch was standard class.
- **Review object:** `0b0e9224a` (TR-I-T2), `b32f859c0` (TR-I-T2b), `98b81b479` (TR-I-F2).
- **Verdict:** pass/fail withheld (partial review).

## Findings

### F1 [major]: the criticality class is contradicted inside the spec inputs

- Ruling 107 (`0.7-execution-order.md:1059`) says "TR-I-F2, the fix, follows (G class, a guard-adjacent harness
  contract)".
- Toil-resolution §5 row 12 (`toil-resolution-2026-10-08.md:415`) classes it `none`/`standard`, and the dispatch adopted
  that row.
- If G governs, MP-07 makes the design-tier route at max mandatory, so a Sonnet round cannot clear `98b81b479`.

### F2 [minor]: the TR-I-T2 pin uses a regular file where Ruling 107 says pipe

- Ruling 107 says "fd 3 present as a pipe".
- The pin opens a temp file (`openSync(channelPath, "w+")`, `test-case-completion.test.mjs:259-260`).
- Its comment says "Ruling 107 allows both a pipe and a temp file", which the Ruling does not say.
- The pin still discriminates: the RED captures show the records landing on fd 3.

## Deliberately not flagged

Categories 1, 2, 4–11 were cleared for the examined material, and category 3 was cleared only in part.

- Inertness is at `lib/test-case-completion.mjs:139`/`:141`.
- Fail-closed with the signal holds: the unwritable-fd pin is unchanged and green.
- The WSL before/after `bootstrap-payload-measure` captures exist.
- `verify.mjs` is untouched.
- Scope is two paths.
- QG-04 is held at file level.
- Diffs are additive.
- There are no new dependencies.
- Language is English.

## Trajectory: consistent, with caveats

- The RED-to-GREEN order matches the commits. Stack-line shifts tie before and after to the fix.
- Caveats:
  - The capture heads differ.
  - All captures are dirty.
  - No capture is hash-bound to a candidate SHA.
- Authorship is trailer-only.

## Not reached

- (a) the full consumer sweep of `PIPELINE_VERIFY_CASE_COMPLETION_FD` / `registerTestCaseCompletion` / `EBADF` in
  `plugins` and `harness`;
- (b) `harness/scripts/check-verify-case-completion.mjs` and its test;
- (c) `plugins/pipeline-core/scripts/verify-journal.mjs`;
- (d) `plugins/pipeline-core/scripts/bootstrap-payload-measure.test.mjs`;
- (e) the MP-07 body;
- (f) the QG-04/QG-06 and `global.md` rule bodies, and the CLAUDE.md hard rules from disk;
- (g) a docs drift search for the removed EBADF tolerance;
- (h) the `agent-obligations.md` TP list.
