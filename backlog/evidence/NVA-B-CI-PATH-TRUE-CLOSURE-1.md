# NVA-B-CI-PATH-TRUE-CLOSURE-1

Date: 2026-09-12. Role: Goldfish worker. Inspected HEAD:
`40a2339e397b0fbaa0929425d8407539fc4ca2c2`.

Item:
`pipeline.ci-path-allowlist-omits-the-editor-the-guards-own-continuation-names`.

## Finding

Accepted Route 2 is already implemented and its focused regressions pass.
No production, workflow, or test edit is necessary. The item remains open:
its actual-CI acceptance criterion is unfulfilled, and its current `done_when`
names Route 1 instead of the accepted Route 2.

The current `.github/workflows/verify.yml` synthetic PATH contains exactly
`node`, `git`, `bash`, `sh`, `openssl`, and `uname`. It intentionally does not
contain `true`. The prior five-tool observations predate the `uname` entry.

In `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`, the
`pipeline.rebwire-req5-2-supplies-its-own-true` marker identifies the existing
`rbTrueShimDir()` fixture. It creates an executable `true` with an absolute Node
shebang and exit status zero. Both relevant real-rebase continuation tests
prepend the fixture directory to the continuation subprocess PATH. The command
remains `git -c core.editor=true rebase --continue`, matching the admitted global
configuration in `plugins/pipeline-core/lib/rebase-authority.mjs`. The fixture
supplies the editor without changing the workflow allowlist or the published
continuation.

## Focused validation

The probe extracted the `command -v` tool names from the current workflow,
asserted the six-tool list above, and created a temporary symlink-only PATH in
an owned directory under `scratch/`. With this PATH, a direct `true` spawn
returned `ENOENT`. The same environment then ran:

```text
node --test --test-reporter=tap --test-name-pattern='rebwire req5-2:|rebdead positive-4:' plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
```

Result: exit **0**, **2 tests passed**, **0 failed**, captured in the receipt
generated at `2026-09-12T02:01:25.289Z`. Both tests perform the real continuation
and assert the rebase has finished. The temporary PATH directory was removed after the
probe. This is a local reconstruction of the current CI PATH, not an actual
GitHub Actions execution.

```text
node --test --test-reporter=tap plugins/pipeline-core/lib/rebase-authority.test.mjs
```

Result under the same restricted PATH: exit **0**, **13 tests passed**,
**0 failed**.

Source SHA-256 values were identical before and after the continuation probe:

| Source | SHA-256 |
| --- | --- |
| `.github/workflows/verify.yml` | `3bdfaefa845e1ca1ac72ee81a2d9dd357db72d5be7c228254579c578581a6f33` |
| `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` | `fed4787c6d32fbb89de113a601dbfc4f9b02390560f9914780791695dd1578f4` |
| `plugins/pipeline-core/lib/rebase-authority.mjs` | `fdc9281c3f27ef5a024d50c90404a038c2c42859fcf6105240afcc9a2c7db3cc` |

The exported `parseDoneWhen` and `evaluateDoneWhen` functions in
`plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs` evaluated
`contains .github/workflows/verify.yml command -v true` with this repository
root and returned:

```json
{"verb":"contains","path":".github/workflows/verify.yml","needle":"command -v true","satisfied":false}
```

`git diff --check`: exit **0** after the documentation changes.

## Machine-written receipt for the committed candidate

NVA-B-BUDGET-CLOSING-CAP-EVIDENCE-1 reran the cited checks and regenerated
`backlog/evidence/NVA-B-CI-PATH-TRUE-CLOSURE-1.receipt.json` directly from their
process results. This artifact replaces reliance on the prose-only result
summary above. It retains stdout/stderr digests and byte counts, executable
names and digests, repository-relative argv, PATH location classes, timestamps,
exit codes, signals, and parsed TAP totals.

The workflow-derived six-tool PATH again produced `ENOENT` for bare `true`.
Both real continuation tests passed **2/2**, and the full rebase-authority suite
passed **13/13**, now also under that restricted PATH. Both suites exited **0**
without skipped or cancelled cases. The repository predicate evaluator again
returned `satisfied: false`. The captured read-only GitHub response again names
the failed run `33595311782` as the newest Verify execution; actual CI success
is still not claimed.

The receipt was generated at `2026-09-12T02:01:25.289Z` against observed HEAD
`40a2339e397b0fbaa0929425d8407539fc4ca2c2` and commit tree
`4df66fa080909db30a819676bf7e12ba43643260`. The correction is committed.
Before/after equality checks bind 1,310 tracked execution-source paths to
digest `a644e668908cd0f60c4f31e6714312282895ced8168da67245c948bbd144232a`.
The receipt requires an empty execution-source diff from the candidate both
before and after the checks, and independently compares every cited source
blob with the commit. The candidate tree contains the actual tested sources.

Receipt publication used exact byte readback and verified `payloadSha256`
against recursively key-sorted compact JSON excluding that field. Its value is
`3e945be10cb6c0991185e583f398a416ea85d2449acc8b96e3c7312d33dd93ff`.
The `supersedes` field retains the previous pre-commit receipt's payload digest,
`277de49d513e636c8f2df41532384bb083317018e2bb949f023820bdc7b96166`,
and artifact digest.
The temporary PATH directory was removed. This receipt covers local focused
checks and read-only CI observation; it neither launches nor replaces an
actual GitHub Actions run.

The publication projection was regenerated from the validated capture without
rerunning tests. It contains no machine-specific absolute paths or raw process
outputs. The GitHub result is limited to one structured latest-run observation;
the complete external response is omitted, with its digest and byte count
retained. Executable digests newly measured during sanitization carry that
timestamp, while the CI tool-binding digests retain the original observation.
The source-capture digest remains in `publication`. The scoped evidence path
check and exact readback/self-digest verification passed.

## Actual CI observation and closure limits

Read-only GitHub inspection on 2026-09-12 used:

```text
gh run list --repo agent-pipe-shared/agent-pipeline --workflow verify.yml --limit 20 --json databaseId,headSha,headBranch,status,conclusion,url,createdAt,updatedAt
```

The newest returned Verify execution was
[run 33595311782](https://github.com/agent-pipe-shared/agent-pipeline/actions/runs/33595311782),
on `main` at `6262d408aa616651232b46ab8ecbfd88ce4055b0`, created
`2026-09-02T05:35:47Z`, completed `2026-09-02T05:42:29Z`, conclusion `failure`.
No newer Verify run was returned. The September 11 local full-Verify evidence
and today's focused tests do not satisfy the requirement for an actual CI run
reporting `guard-lifecycle-ready-tests =0`.

Acceptance criterion 1 is met by the existing Route 2 implementation.
Criterion 2 remains unmet. Criterion 3 was answered by
`backlog/evidence/2026-09-04-nva-b-pathsweep-1-allowlist-sweep.md`: 502 registered
suites, four outside-allowlist cases, and 33 statically uncertain suites. Its
limits remain explicit, including incomplete transitive command tracing. A
fresh exhaustive sweep is deferred in this narrow audit because the targeted
continuation failure is already covered and no remaining source gap was found;
the historical sweep is not presented as exhaustive evidence for current CI.

The predicate's Route 1 mismatch remains documented, with replacement reserved
for the ordinary item-content/ledger rescope procedure. No status or predicate
change, ledger/state/PO-queue write, push, CI dispatch, or commit occurred.
Native Codex Sandbox/App Server under WSL is deferred and outside this audit;
it supplies neither acceptance evidence nor a blocker.

## Changed paths

- `backlog/items/2026-09-02-the-ci-path-allowlist-omits-the-editor-the-guards-own-continuation-names.md`
- `backlog/evidence/NVA-B-CI-PATH-TRUE-CLOSURE-1.md`

- `backlog/evidence/NVA-B-CI-PATH-TRUE-CLOSURE-1.receipt.json`

The post-commit evidence refresh updates these three CI-PATH paths without
changing source, tests, item status, or the predicate.
