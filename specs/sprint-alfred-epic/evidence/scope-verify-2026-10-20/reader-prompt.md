# Reader prompt, per-item re-verification 2026-10-20 (D61)

You are a read-only reader for the epic `sprint-alfred-epic` in the repository at the current
working directory. You change no file except your own output file named below. You run no tests,
no scripts and no mutating command.

## Why

Every item below still has open work according to the 2026-10-20 delivery remeasure. That
remeasure is known to be wrong in places: for example it lists a fix as missing whose code and
pin were committed earlier. Before any implementation is dispatched, each item's acceptance must
be checked against the current code. Your result decides what a Goldfish is asked to build, so
"done" needs evidence and "open" needs a concrete description.

## Input

`scratch/scope-verify/input-<NN>.json` holds about 7 rows. Each row has `itemId`, `ac` (its
Spec row), `file` (the item's backlog file, or a JSON evidence file holding its original
requirements), `stage`, and `remeasureOpen` (the remeasure's open points, as a hint only).

## What to do per item

1. Read the item file in full: Description, Proposal, every "Added acceptance" and "Acceptance"
   section, and later "Observed" sections. Treat the acceptance content as the contract; treat
   Triage text and the remeasure points as hints.
2. Split the acceptance into clauses (one testable requirement each, at most 8 per item).
3. For each clause, look for its implementation and its test in the current tree:
   - `git log --oneline -15 --grep=<keyword>` and `git show --stat --format=%B <sha>` for commits;
   - `git ls-files '*<name>*'` to find a file by name;
   - `git grep -n -e <pattern> -- <path>` or `rg -n <pattern> <one file>` inside a file;
   - the Read tool with offset and limit.
   Directory-wide Grep/Glob tool calls, pipes and composed commands may be refused by the
   guard; do not retry a refused shape.
4. Give each clause exactly one status:
   - `done`: code and a test exist that cover it; name the test file and the test name or case.
   - `evidence`: code and test exist, but no counted GREEN result is stated anywhere; name the
     test file so the Elephant can run and count it.
   - `content`: code, test or doc work is missing. Say exactly what, which files it touches,
     which existing test file should carry its test, and the size `S` (under 50 lines),
     `M` (50 to 300) or `L` (over 300).
   - `native-host`: it can only be shown by a run on a real host. Name the host:
     `claude-windows`, `claude-wsl`, `codex-wsl`, `antigravity-wsl`, or `other` (for example
     Codex or Antigravity on native Windows).
   - `po-decision` or `po-signature`: name the decision or the protected file.
   - `superseded`: the clause's whole subject is a route retired by ADR-0085 or by a later
     recorded decision; cite where.
5. Mark every path that matches the protected baseline: `plugins/pipeline-core/hooks/guard-git.mjs`,
   `guard-testpath.mjs`, `guard-lifecycle-ready.mjs`, `guard-gate-strength.mjs`,
   `guard-devplan.mjs`, `plugins/pipeline-core/lib/guard/*.mjs`, `lib/protected-baseline.mjs`,
   `protected-baseline.json`, `scripts/pipeline-state.mjs`, `harness/scripts/verify.mjs`,
   `harness/verify-suites.json`, `hooks/hooks.json`, `scripts/goldfish-antigravity-host.mjs`, and
   the protected tests `guard-git*.test.mjs`, `guard-testpath*.test.mjs`, `guard-push*.test.mjs`,
   `harness/scripts/pipeline-state.test.mjs`, `guard-gate-strength*.test.mjs`,
   `guard-devplan*.test.mjs`, `protected-test-paths*.test.mjs`, `lib/entrypoint.test.mjs`,
   `lib/critical-human-proof-policy.test.mjs`, `hooks/notebook-write-coverage.test.mjs`,
   `lib/public-core-origin-allowlist.test.mjs`, `lib/self-application-attestation-gate.test.mjs`.
   A new test file that is not yet listed in `harness/verify-suites.json` also needs a protected
   registration: say so.

Budget: about 4 tool calls per item, at most 32 in total. If you run out, write what you have and
mark the unread items `unread`.

## Output

Write exactly one file, `scratch/scope-verify/out-<NN>.json`: a JSON array, one object per input
row, in input order:

```json
{"itemId": "...", "ac": "AC-...", "read": true,
 "clauses": [{"clause": "one sentence", "status": "done|evidence|content|native-host|po-decision|po-signature|superseded",
              "evidence": "test file and case, or commit sha, or where the retirement is recorded",
              "work": "for content: what is missing, files, target test file, size S|M|L",
              "host": "for native-host only",
              "protected": ["protected paths this clause needs to change"]}],
 "remeasureWrong": "one sentence if the remeasure's open points are wrong or stale, else empty",
 "closableAfterTest": "yes|no — yes when nothing but native-host runs on the four test hosts and PO acceptance remains"}
```

Then reply with one line: `out-<NN>: <rows> rows, content <n> clauses, evidence <n>, done <n>`.
