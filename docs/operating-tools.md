# Operating tools

Reusable helper scripts for the Elephant and the operator live in the tracked top-level `scripts/` folder, never in the untracked `scratch/` folder: the PO works on two machines and a fresh session must find them without a long search. Every script starts with a header comment that states its purpose, exact usage, inputs, outputs, where its data lives and whether it is read-only; read that header before the first run. All commands run from the repository root.

## When to use which script

| Situation | Script | Writes? |
|---|---|---|
| Stamp the three runner manifests with a candidate version after the content is frozen | `scripts/stamp-candidate.mjs` | the three manifests (`--dry-run` writes nothing) |
| Run test files on isolated Linux workers in parallel | `scripts/run-parallel.mjs` | worker clones and temp dirs only |
| Run test files one after the other with a private TMPDIR | `scripts/run-in.mjs` (uses `scripts/run-quiet.mjs`) | none tracked |
| Run the project-onboarding orchestrator suite and read only its failures | `scripts/run-onboarding-full.mjs` | `scratch/onboarding-full.log` |
| The capability inventory gate went red after a suite, hook or skill was added | `scripts/rebaseline-inventory.mjs` | the `sourceBaseline` block of the inventory (protected file) |
| Re-measure the delivery matrix and run the gap rounds | `scripts/delivery-owners.mjs`, `scripts/delivery-agent-items.mjs`, `scripts/matrix-gaps.mjs`, `scripts/gap-inputs.mjs`, `scripts/gap-summary.mjs`, `scripts/gap-collect.mjs`, `scripts/gap-evidence.mjs` | see below |
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

## Held-commit rehearsal

`node scripts/rehearse-held.mjs <scratch/clones/<rehearsal> | .> [--only k1,k5]` fetches the head of each build clone named in its `ORDER` table and replays the unprotected, post-sitting commits into the target in that fixed order. `scripts/import-held.mjs` 3-way merges a file where main moved and stops at the first conflict. The `ORDER` table and its skip SHAs are per-run data of the 0.7.0 sprint; edit them when the held set changes. Rehearse in a clone first: with target `.` the commits land in the main checkout.
