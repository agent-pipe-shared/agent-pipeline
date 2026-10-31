# W9 slice 4 (D223): refresh every derived file in one step

Built by the Elephant (PO exception: small items are built in a scratch clone and held as a patch). Candidate 586d6a0ff.

## What it does
`scripts/refresh-derived-files.mjs [<root>] [--check]` runs, in order, the three derived-file steps a source commit leaves behind:
1. backlog ledger projections: `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate` (`--check`: its plan mode, "nothing to reconcile" means current);
2. capability-inventory `sourceBaseline`: compared with the root's HEAD commit and tree, `scripts/rebaseline-inventory.mjs` only when they differ (`--check`: reports DRIFT);
3. Reader inputs (mirrors, manifest, pins): `scripts/sync-reader-inputs.mjs` (`--check`: the script's own read-only mode).

It writes the working tree only. It never runs `git add`, `commit`, `stash`, `reset` or `checkout` (pinned by RDF01, RDF05, RDF08). It fingerprints every modified or untracked path before and after, so it names exactly the files whose bytes it moved (a path that was already dirty counts when it moves, RDF06) and prints the commit instruction. Exit 0 = current or refreshed, 1 = `--check` found drift, 2 = a step failed (the other steps still run, RDF05).

## Evidence
- Test: `scripts/refresh-derived-files.test.mjs`, 8 cases, 8/8 green in the clone (`c1`, `c2` logs). The fixture root uses the REAL `rebaseline-inventory.mjs` and small stand-ins for the ledger and Reader-input scripts (they have their own suites).
- Mutation proof: a deliberate `git add -A` inside the script turns RDF01, RDF05 and RDF08 red (`mut1` log); restored byte-equal, rerun green (`c2`).
- Chain run with the REAL scripts in the clone at the candidate: `--check` reported `inventory-baseline: DRIFT` and `reader-inputs: DRIFT` (HEAD had moved past the baseline), the real run refreshed five files (inventory, snapshot pins, three Reader-input files), `--check` afterwards: all three current. The refreshed files were reset before the patch (they depend on the final candidate HEAD).
- Patch applies on the candidate (`git apply --check` in the baseline clone, exit 0).

## Files
`scripts/refresh-derived-files.mjs` (new), `scripts/refresh-derived-files.test.mjs` (new), `docs/operating-tools.md` (one row). No protected or kernel file. Like `housekeeping.test.mjs` and `sitting-count-pass.test.mjs`, the test is run directly (`node --test`), not through a Verify suite entry; no registration outside the slice is needed.

## Not verified
Native Windows run, a real consumer repository (the script is for this repository's own derived files), Full Verify on the assembled candidate (fv9), batch Critic, PO acceptance. The PCI17 constraint (the inventory commit reads HEAD^) still means the refreshed files are committed in their own chore commit AFTER the source commit.
