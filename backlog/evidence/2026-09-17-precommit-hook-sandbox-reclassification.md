# Pre-commit hook suite: sandbox reclassification — 2026-09-17

## Initial observation

The registered command below, executed in the restricted Codex workspace
sandbox, reported 41 passing and 10 failing cases:

```text
node plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs
```

Every failing assertion expected a refusal diagnostic but received an empty
stream.  The positive sanctioned verify-transition case passed.

## Decisive measurement

A temporary diagnostic of the smallest failing child invocation reported:

```text
status: 1
signal: null
error: EPERM
stdout: ""
stderr: ""
```

The error is a failed child-process spawn in the restricted sandbox, before
the generated hook can evaluate or emit its own refusal.  The temporary
diagnostic was removed; no hook or test logic was changed.

## Controlled readback

The same command, executed through the authorized local child-process/Git
test boundary, passed all 51 cases:

```text
tests 51
pass 51
fail 0
```

This proves that the observed red result is not a pre-commit hook product
defect and must not be presented as release evidence.  It is an instance of
the already tracked Codex sandbox child-process limitation:
`pipeline.codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn`.

## Disposition

Close the newly created
`pipeline.precommit-hook-refusal-diagnostics-are-not-observable-in-verify`
item as a duplicate/misclassification.  Keep the existing sandbox item as the
single owner.  For local test work, request the narrowly scoped elevated
execution boundary only for suites that create Git fixtures or spawn Git.
