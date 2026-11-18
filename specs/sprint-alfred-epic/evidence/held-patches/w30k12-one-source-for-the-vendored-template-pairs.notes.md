# w30k12 — the vendored-template check reads its template pairs from the generator's own list (candidate 30k, slice C30K-K12)

Applies AFTER the integrated 30j tree (the delta is `fd69d44f33..HEAD` of the slice clone, which starts at that tree). It does not apply to a checkout that lacks the 30j chain; `apply --check` against the integrated 30j tree is exit 0 and against the real checkout is expected to fail until 30j is applied. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. Source: stage 3 of the staged plan in `plans/duplicated-state-and-rules-count-2026-11-18.md` (K1-06).

## What it does

- `harness/scripts/generate-vendored-canon.mjs` gains the export `vendoredTemplatePairs(rootDir)`: the canonical/vendored pairs for every file in `templates/prompts`, computed with the generator's own `computeManifest` and `UNIVERSAL_DIRECTORIES`. What the generator writes is unchanged.
- `plugins/pipeline-core/scripts/check-vendored-template-sync.mjs` uses that function as its default pairs (derived from the checked root), so a template added to the directory is checked without editing a second list. `TEMPLATE_PAIRS` stays exported and is the fallback when `harness/` is absent (an installed plugin has no harness directory; that import is optional by design). An explicit `pairs` argument still wins.
- Consequence: the check now also covers every other `templates/prompts` file (for example `agent-obligations.md`), all byte-identical today. The check is NOT wired into the Verify suite list (D-5).

## Test-first

Two cases were added to `check-vendored-template-sync.test.mjs` and run RED first (a template present in the directory but absent from the check's list was not reported; 2 failed, exit 1). After the edit all green. One case added to `generate-vendored-canon.test.mjs` (the pairs equal the manifest's `templates/prompts` entries).

## Checks run (tests only)

- `check-vendored-template-sync.test.mjs`: 6 of 6, exit 0
- `generate-vendored-canon.test.mjs`: 9 of 9, exit 0

## Not changed / not proven

- No stored status, record shape, gate, signature, approval or digest changed; generator output bytes unchanged.
- The installed-plugin fallback path (no harness directory) is not exercised by a test.
- The check uses a top-level dynamic import across the plugin/harness boundary; in a source checkout only.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: verified by tests only.
