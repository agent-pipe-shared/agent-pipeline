# Operating tools

Reusable helper scripts for the Elephant and the operator live in the tracked top-level `scripts/` folder, never in the untracked `scratch/` folder: the PO works on two machines and a fresh session must find them without a long search. Every script starts with a header comment that states its purpose, exact usage, inputs, outputs, where its data lives and whether it is read-only; read that header before the first run. All commands run from the repository root.

## When to use which script

| Situation | Script | Writes? |
|---|---|---|
| Stamp the three runner manifests with a candidate version after the content is frozen | `scripts/stamp-candidate.mjs` | the three manifests (`--dry-run` writes nothing) |
| Run test files on isolated Linux workers in parallel | `scripts/run-parallel.mjs` | worker clones and temp dirs only |
| Run the Full Verify (candidate mode, no reuse) in a clone with a private HOME, a short TMPDIR and a red-step summary | `scripts/full-verify.mjs` | output file, verify's run record in the clone, temp dirs |
| Rough token split of session and subagent transcripts into impl / content / admin / dialogue (heuristic, +-10 points; target for admin: about 15 % in user repositories) | `scripts/transcript-token-buckets.mjs` | none (prints JSON) |
| Check, summarise and apply Goldfish diffs or format-patch files through Node (the shell grammar refuses `git apply`) | `scripts/apply-diff.mjs` | the working tree (stages nothing) |
| Fill the Goldfish briefing template verbatim from a JSON spec (fix-wave task without an Alfred acceptance row) | `scripts/fill-goldfish-briefing.mjs` | one briefing file under `scratch/` |
| Run test files one after the other with a private TMPDIR | `scripts/run-in.mjs` (uses `scripts/run-quiet.mjs`) | none tracked |
| Run the project-onboarding orchestrator suite and read only its failures | `scripts/run-onboarding-full.mjs` | `scratch/onboarding-full.log` |
| The capability inventory gate went red after a suite, hook or skill was added | `scripts/rebaseline-inventory.mjs` | the `sourceBaseline` block of the inventory (protected file) |
| A Reader input (capability inventory, observation governance, reader protocol) changed and the plugin's hash-pinned mirrors must follow, or you want to know whether they already drifted | `scripts/sync-reader-inputs.mjs [<root>] [--check]` | the three mirrors, `reader-inputs/manifest.json` and the two pins in `lib/doc-reader-documentation-snapshot.mjs` (`--check` writes nothing) |
| Re-measure the delivery matrix and run the gap rounds | `scripts/delivery-owners.mjs`, `scripts/delivery-agent-items.mjs`, `scripts/matrix-gaps.mjs`, `scripts/gap-inputs.mjs`, `scripts/gap-summary.mjs`, `scripts/gap-collect.mjs`, `scripts/gap-evidence.mjs`, `scripts/delivery-remeasure-inputs.mjs` | see below |
| Produce the counted GREEN results the delivery matrix reads, in one serial, resumable pass | `scripts/sitting-count-pass.mjs` (suite list: `specs/sprint-alfred-epic/plans/count-pass-suites.json`) | the evidence markdown and its `.state.jsonl` |
| Check the sitting's end state in one pass (ten light checks, one table) | `scripts/post-sitting-checks.mjs [--root <dir>] [--only <name>...] [--json <file>]` | none; `--json` writes one file inside `<root>/scratch/` |
| Replay the held post-sitting commits of the build clones into a rehearsal clone | `scripts/rehearse-held.mjs` (uses `scripts/import-held.mjs`, `scripts/in-clone.mjs`) | the rehearsal target |

## Candidate stamp

`node scripts/stamp-candidate.mjs --dry-run` prints the plan; without the flag it rewrites the manifests of the three runners (`plugins/pipeline-core/.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` and `plugin.json`). It refuses a dirty or staged checkout, validates all three manifests before the first write, and checks the base version against the `BASE_VERSION` constant at the top of the script (change it when the candidate line moves on).

The version format is `0.7.0+<runner>.<UTC yyyymmddhhmmss>.<7-char HEAD>`, for example `0.7.0+claude.20261022204428.79cda46`. The stamp is its own commit and carries the `Checkpoint-Intent` trailer. The script never installs: installation from the marketplace is the operator's step. Stamp only on the PO's call, from a frozen tree.

## Isolated Linux single runs

`node scripts/run-parallel.mjs <workers> <label> [--src <dir>] [--allow-dirty] <test-file>...` gives every worker its own clone of the source HEAD, its own private HOME (with the git identity copied) and its own TMPDIR outside every repository. Heavy suites share `~/.apsp`, its lock and repo-local state when they run side by side in one checkout, and then collide on the registry; the private HOME and TMPDIR remove that. Use at most 3 workers; the heavy suites also slow each other down, so a timeout that appears only under load is re-run alone before it is called red.

The workers see the COMMITTED state of the source only. The runner prints `src=... commit=<sha>`, force-checks every worker clone out at that exact commit on each run, and refuses a source with uncommitted changes (exit 2) unless `--allow-dirty` is given, in which case it says how many paths are left out. Commit before running, and read the printed commit before trusting a count. `node scripts/run-parallel.test.mjs` pins this behaviour.

`scripts/run-in.mjs <dir> <label> <test-file>...` is the serial form: one file after the other with a private TMPDIR, printing counts and failing case names only.

## Inventory rebaseline

The capability inventory gate (`harness/scripts/check-product-capability-inventory.mjs`) goes red at every later commit that adds a suite, hook or skill until the inventory's `sourceBaseline` is moved to a commit that already holds every listed surface. Register the new surface first and commit it, then run `node scripts/rebaseline-inventory.mjs [<root>]` and commit the inventory. The inventory and `harness/verify-suites.json` are protected files: the operator commits them as the human operator.

## Delivery-matrix remeasure and gap rounds

The matrix snapshots live in `specs/sprint-alfred-epic/evidence/delivery-remeasure-<date>/` (`README.md` with the section "Open per item", `snapshot.json`). The readers are read-only: `delivery-owners.mjs` tallies owners per item, `matrix-gaps.mjs` lists the open clauses owned by the agent, `delivery-agent-items.mjs` writes the agent-only items as a TSV under `scratch/analysis/`. Each takes the remeasure folder as an optional argument; the default is a constant at the top of the script.

A gap round runs in this order. `gap-inputs.mjs` cuts the agent-owned clauses into four batches in `scratch/gap/input-0N.json`. Fresh read-only readers judge each batch and write `scratch/gap/out-0N.json`. `gap-summary.mjs [STATUS]` and `gap-collect.mjs` list the actionable clauses and the verdict counts. `gap-evidence.mjs` archives a finished round into `specs/sprint-alfred-epic/evidence/gap-readers-2026-10-22/`, which is tracked evidence the operator commits. Reader verdicts are the readers' own and are unverified; an actionable verdict is a lead to re-check, not a finding.

### Cutting the reader inputs for a remeasure round

`node scripts/delivery-remeasure-inputs.mjs --base <sha> --prev <snapshot.json> --previous-inputs <method-dir> --out <dir>` writes the six reader inputs `input-01.json` to `input-06.json`. `--base` is the commit of the last measurement (`snapshot.json` `head`), `--prev` is the last round's `snapshot.json` (its `stage` and `reason` become `stageBaseline` and `reasonBaseline`), and `--previous-inputs` is the last round's `method/` folder, which fixes which item sits in which batch (six batches of 29 items, same order). `--head <rev>` (default `HEAD`) ends the commit range; `--root <dir>` addresses another checkout, such as a build clone, and every other path is relative to it.

Per item, `mappedCommits` holds the commits in `<base>..<head>` whose message names the item id (without the `pipeline.` prefix) or that changed `backlog/items/*-<id>.md`; `unmappedCommits` holds every other commit with its `Dispatch` trailer value, identical in all six files. The script prints the commit counts and the item-count check (174 items, six batches of 29, every previous item exactly once) and exits 1 when the check fails; `--check --previous-inputs <method-dir> --out <dir>` repeats the check on existing files. Run against the previous round's base and head it reproduces the previous inputs' commit lists. The generated inputs are scratch (`scratch/remeasure<N>/`); the reader prompt of the previous round (`method/reader-prompt.md`) is the template for the next one.

## Serial count pass

`node scripts/sitting-count-pass.mjs --list <suites.json> --out <evidence.md> [--root <dir>] [--only <id>...] [--resume] [--timeout-ms N]` runs every suite of the list alone, one after the other, with a private TMPDIR under `<home>/pipeline-test-tmp/count-pass-<run>/<n>` (mode 0700, outside every repository), `NODE_TEST_CONTEXT` removed and a per-suite cap (default 30 minutes; a timed-out child is killed with its process group). An entry is `{ id, items, command, expect, heavy, why }`: `command` is the argument list after `node` (`["--test", "<file>"]`), `command: null` with an `unresolved` reason marks an item with no identified suite (listed in the evidence, never run), `expect.minPass` makes a run GREEN only at or above that many passes, and `heavy` is a note for the operator (run those last, alone). The shipped list is `specs/sprint-alfred-epic/plans/count-pass-suites.json`; its page `count-pass-suites.md` names the heavy and the unresolved entries.

Results are GREEN, RED or TIMEOUT, with tests, pass, fail, skip and todo copied from the node `ℹ` summary lines (or the `N/N cases passed` / `N passed, N failed` / `project-onboarding-v3: N cases across ... M shards failed` line of a suite that prints its own, marked `custom`). A failure that is a killed child or a `null !== 0` process failure is retried once and marked `(retried)`; a plain red and a timeout are not. Each finished suite is appended to `<evidence.md>.state.jsonl` and the evidence is rewritten after every suite, so an interrupted pass loses nothing: run again with `--resume` to skip the finished ids. Without `--resume` an existing state file is refused, never overwritten. The evidence has the shape of the `pin-counted-results-*` files (header with HEAD, date, host, node and the runner note; a Red section with the first failing cases; the counted table; a Skipped typed section) and holds repository-relative text only. `node --test scripts/sitting-count-pass.test.mjs` pins the behaviour on fixture suites. A counted pass is evidence for the delivery matrix only when it runs on the tree and host the matrix row names, and nothing else heavy runs at the same time.

## Post-sitting check table

`node scripts/post-sitting-checks.mjs [--root <dir>] [--only <name>...] [--json <file>]` runs the light end-state checks of the sitting one after the other, each with a private TMPDIR outside every repository and `NODE_TEST_CONTEXT` removed, and prints one row per check (verdict, exit code, seconds, one-line result) and a total. It exits 0 when every selected check is GREEN, 1 otherwise, 2 on bad usage. The checks: `suite-registration` (exit 0 and 1093 registered), `case-completion`, `capability-inventory`, `observation-governance`, `reader-inputs` (`sync-reader-inputs.mjs . --check`, never a rewrite), `backlog-state` (its known-accepted DRIFT lines are tolerated), `architecture-boundary` (the pre-existing `unowned-path` findings keep it at exit 1 and are reported; it is RED on any `over-line-bound` finding), `doc-contracts-test` (76 cases), `consumer-safe-paths-test` (9 cases) and `doc-contracts`. The expected counts are constants at the top of the script; move them when a later commit changes them. `--json <file>` writes the table as JSON and is refused (exit 2) for a path outside `<root>/scratch/`. Heavy suites are not part of it: they belong to the serial count pass above. Before the sitting's protected steps several rows are RED by design (unregistered suites, reader-input drift).

## Held-commit rehearsal

`node scripts/rehearse-held.mjs <scratch/clones/<rehearsal> | .> [--only k1,k5]` fetches the head of each build clone named in its `ORDER` table and replays the unprotected, post-sitting commits into the target in that fixed order. `scripts/import-held.mjs` 3-way merges a file where main moved and stops at the first conflict. The `ORDER` table and its skip SHAs are per-run data of the 0.7.0 sprint; edit them when the held set changes. Rehearse in a clone first: with target `.` the commits land in the main checkout.
