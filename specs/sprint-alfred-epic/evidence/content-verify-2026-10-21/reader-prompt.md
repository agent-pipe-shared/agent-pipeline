# Reader prompt, content-clause re-verification 2026-10-21 (D61, second round)

You are a read-only reader for the epic `sprint-alfred-epic` in the repository at the current
working directory (branch `feat/sprint-alfred`, HEAD `a71fb829c` or a later docs-only commit). You
change no file except your own output file named below. You run no tests, no scripts and no
mutating command. Two other agents are editing files in this checkout in parallel; read what is
there, and never write, stash, restore or check out anything.

## Why

On 2026-10-20 a first round of readers found clauses that still needed code, tests or docs
("content"). Commits since then may have delivered some of them. Before a Goldfish is asked to
build a clause, it must be checked again against the current code. Your result becomes the write
scope of the implementation packages, so "done" needs evidence and "open" needs exact files.

## Input

`scratch/content-verify/input-<NN>.json` holds about 7 rows. Each row has `ac` (its Spec row),
`itemId`, `file` (the item's backlog file, or a JSON evidence file holding its original
requirements under that item id), and `contentHints`: the first round's open clauses with their
`work` text and `protected` paths. The hints are a starting point, not the contract.

## What to do per item

1. Read the item's acceptance in full: every "Acceptance" and "Added acceptance" section and
   later "Observed" sections of the backlog file (or the item's entry in the JSON file). The
   acceptance text is the contract; hints and Triage text are hints.
2. For each content hint, and any acceptance clause the hints missed that is plainly not built,
   check the current tree:
   - `git log --oneline -15 --grep=<keyword>` and `git show --stat --format=%B <sha>`; commits after
     2026-10-20 matter most (`git log --oneline --since=2026-10-20 --grep=<keyword>`);
   - `git ls-files '*<name>*'` to find a file by name;
   - `git grep -n -e <pattern> -- <path>` or `rg -n <pattern> <one file>` inside a file;
   - the Read tool with offset and limit.
   Directory-wide Grep/Glob tool calls, pipes and composed commands may be refused by the guard;
   do not retry a refused shape.
3. Give each clause exactly one status:
   - `done`: code and a test cover it; name the test file and case, or the commit.
   - `evidence`: code and test exist, only a counted GREEN is missing; name the test file.
   - `content`: work is missing. Say exactly what, the files it changes, the existing test file
     that should carry its test, and the size `S` (under 50 lines), `M` (50-300) or `L` (over 300).
   - `native-host` (name the host), `po-decision` (name the decision), or `superseded` (cite where).
4. For every `content` clause, split its files into `files` (unprotected, a Goldfish may edit
   them) and `protected` (needs a PO-signed drop-in). Protected: `plugins/pipeline-core/hooks/`
   `guard-git.mjs`, `guard-testpath.mjs`, `guard-lifecycle-ready.mjs`, `guard-gate-strength.mjs`,
   `guard-devplan.mjs`, `plugins/pipeline-core/lib/guard/*.mjs`, `lib/protected-baseline.mjs`,
   `protected-baseline.json`, `scripts/pipeline-state.mjs`, `harness/scripts/verify.mjs`,
   `harness/verify-suites.json`, `hooks/hooks.json`, `scripts/goldfish-antigravity-host.mjs`, and
   the tests `guard-git*.test.mjs`, `guard-testpath*.test.mjs`, `guard-push*.test.mjs`,
   `harness/scripts/pipeline-state.test.mjs`, `guard-gate-strength*.test.mjs`,
   `guard-devplan*.test.mjs`, `protected-test-paths*.test.mjs`, `lib/entrypoint.test.mjs`,
   `lib/critical-human-proof-policy.test.mjs`, `hooks/notebook-write-coverage.test.mjs`,
   `lib/public-core-origin-allowlist.test.mjs`, `lib/self-application-attestation-gate.test.mjs`.
   `plugins/pipeline-core/protected-baseline.json` is the authority; read it once if unsure. A new
   test file not yet listed in `harness/verify-suites.json` needs a protected registration: say so.
   Note: `scripts/pipeline-state.mjs` is protected for writes by a guard, but an admitted Goldfish
   slice may edit it; list it under `protected` anyway and say "slice-editable" in `work`.

Budget: about 4 tool calls per item, at most 32 in total. If you run out, write what you have and
mark the unread items `"read": false`.

## Output

Write exactly one file, `scratch/content-verify/out-<NN>.json`: a JSON array, one object per input
row, in input order:

```json
{"ac": "AC-...", "itemId": "...", "read": true,
 "clauses": [{"clause": "one sentence", "status": "done|evidence|content|native-host|po-decision|superseded",
              "evidence": "test file and case, or commit sha, or where the retirement is recorded",
              "work": "for content: what is missing, size S|M|L",
              "files": ["unprotected repository-relative paths the work changes"],
              "protected": ["protected paths the work changes"],
              "test": "existing test file that should carry the test",
              "host": "for native-host only"}],
 "changedSince20": "one sentence naming commits after 2026-10-20 that delivered a hint, else empty"}
```

Then reply with one line: `out-<NN>: <rows> rows, content <n> clauses, done <n>, evidence <n>`.
