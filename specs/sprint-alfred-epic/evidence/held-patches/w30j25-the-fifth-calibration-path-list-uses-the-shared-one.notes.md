# w30j25 — the hook installer's calibration twin list is pinned to the shared CALIBRATION_PATHS (candidate 30j, slice C30J-J25)

Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify runs: this change is verified by tests only.

Apply order: the patch is a delta on the integrated 30j tree (`scratch/agent-out/c30g/int30j`), so it does NOT apply to the real checkout until that tree is applied first (`apply --check` on the real repository is expected to fail before that).

## What

- `plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs`: two new cases. One renders the generated hook (`renderImpl`), reads its `VERIFY_CALIBRATION_PATHS` list and asserts it equals the shared `CALIBRATION_PATHS` of `lib/project-authority-read.mjs` element by element and in order. The second proves the comparison goes red on a mutated copy (reordered, or one value changed).
- `plugins/pipeline-core/scripts/pre-commit-hook-install.mjs`: a two-line comment at the list naming the shared list and the pin. No value, order, frozenness or logic changed.
- `pre-commit-hook-install.trust-anchor-bootstrap.test.mjs`: unchanged (listed in the write scope, needed no edit).

## Why a test instead of an import

The list lives inside the generated hook text (the `renderImpl` template) and is read synchronously at the commit boundary (calibration-twin admission, the verify-transition check). The hook may import only plugin files through dynamic `await import` on install-bound paths; making the list come from an import would need top-level asynchronous loading before sync code and a new fail-closed branch for a missing module. The briefing allows a comparison test in that case, which leaves every protected-path decision, the twin admission and the `repositoryMode` exception text byte-identical.

## Test-first note

There was no defect to reproduce red against the unchanged code (the two lists already agree). The red case is the mutation case: a reordered or changed copy of the hook's list is detected as unequal, so a future drift turns the pin red.

## Not changed / not proven

- No stored status, record shape, digest, gate, signature or approval behaviour changed.
- The hook still holds its own copy of the values; only a test keeps it equal.
- Verification is the two installer suites plus the patch check test; no broader run.
