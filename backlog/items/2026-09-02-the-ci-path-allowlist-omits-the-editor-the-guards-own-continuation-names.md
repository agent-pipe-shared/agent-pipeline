---
schema: pipeline.backlog-item.v1
id: pipeline.ci-path-allowlist-omits-the-editor-the-guards-own-continuation-names
type: defect
owner: pipeline
status: open
created: 2026-09-02
source: "GitHub Actions run 33595311782 (push to main, commit 6262d408), job verify, step Runner-free offline Core Verify, suite guard-lifecycle-ready-tests"
sprint: nova-b
---

# The CI `PATH` allowlist omits `true`, so the guard's own published continuation cannot execute in CI

## Description

`guard-lifecycle-ready-tests` exited 1 in CI run `33595311782` on the released commit `6262d408`.
Exactly one of its 210 tests failed:

```
not ok 209 - rebwire req5-2: an uninformed session reaches a finished rebase by following only the denials
  location: 'plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:8038:1'
  error: |-
    error: cannot run true: No such file or directory
    error: unable to start editor 'true'
    Please supply the message using either -m or -F option.
    error: could not commit staged changes.
    1 !== 0
```

The same suite passes in the local checkout, where the whole 210-test file is green.

## Triggering situation

The cause is in the workflow, not in the test's logic and not in the guard. `.github/workflows/verify.yml`,
step "Runner-free offline Core Verify", runs the entire suite set under a deliberately synthetic `PATH`
containing exactly five symlinks and nothing else:

```sh
core_path="${RUNNER_TEMP}/pipeline-core-path" && mkdir -p "${core_path}" \
  && ln -s "$(command -v node)"    "${core_path}/node" \
  && ln -s "$(command -v git)"     "${core_path}/git" \
  && ln -s "$(command -v bash)"    "${core_path}/bash" \
  && ln -s "$(command -v sh)"      "${core_path}/sh" \
  && ln -s "$(command -v openssl)" "${core_path}/openssl" \
  && PATH="${core_path}" "${core_path}/node" harness/scripts/verify.mjs
```

`true` is not among them. Step 4 of the failing test executes, for real, the exact continuation the guard
publishes in its own refusal — `git -c core.editor=true rebase --continue` — and `git rebase --continue`
opens an editor for the commit message. Git resolves a `core.editor` value with no shell metacharacters by
`execvp`, which searches `PATH`; `true` is not there, so the editor cannot start and the continuation
fails. `harness/scripts/verify.mjs` sets no `env` of its own for the suites it spawns, so the synthetic
`PATH` reaches every one of them.

This is why the failure is invisible locally: an ordinary developer `PATH` contains `/usr/bin/true`.

Note what is NOT wrong here. The fixture's own `git -c core.editor=true rebase main` (same file,
line 7762) passes in CI, because a non-interactive rebase never launches an editor. Only `--continue`
does. And the guard's admitted spelling is correct: `core.editor=true` is the shape
`rebwire negative-4` deliberately pins as the *only* admitted `-c`, so the product is not at fault for
naming it.

## Affected artifact

- `.github/workflows/verify.yml`, step "Runner-free offline Core Verify" (the synthetic `PATH` line)
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:8038` (`rebwire req5-2`), step 4 at line 8077
- `plugins/pipeline-core/lib/rebase-authority.mjs` (the `nextCommand` the test executes verbatim)

## Proposal

Two routes exist and they are not equivalent; pick deliberately rather than by convenience.

1. **Add `true` to the workflow's synthetic `PATH`.** One more symlink, symmetrical with the `openssl`
   entry already there and already justified in a comment. It is the smallest change, but it widens the
   "runner-free" premise a second time, and each widening makes that premise less meaningful. If chosen,
   extend the existing comment the same way `openssl`'s was extended: state that the product genuinely
   names `true` as its published editor for a non-interactive continuation, so a lane that cannot resolve
   it cannot execute the product's own documented route.

2. **Make the test supply its own `true`.** The test already owns a scratch directory per fixture; it can
   write an executable `true` shim there and prepend that directory to the spawn's `PATH`, leaving the
   command string byte-identical to the continuation the guard published. This keeps the workflow's
   allowlist honest and keeps the assertion — "the exact published continuation really finishes the
   rebase" — intact. It costs a few lines in the fixture helper.

Route 2 is preferred: the assertion under test is about the guard's published route, not about the host's
coreutils, and a test should not be able to fail because of a binary the product only needs at the very
end of a rebase. But this is a judgment call about what "runner-free" is meant to prove, and belongs to
whoever owns that workflow step.

Whichever route is taken, the same question should be asked once about the rest of the suite set rather
than one test at a time: which other suites execute a product-published command whose binary is outside
the five-symlink allowlist? Answering that in one pass is cheaper than discovering them one CI run each,
which is the pattern this repository has now repeated three times (`openssl`, the runner executables in
`onboarding-init`, and now `true`).

## Acceptance

1. A route above is chosen and implemented, with the reason recorded where the change lands.
2. `guard-lifecycle-ready-tests` reports `=0` in an actual CI run, not only locally.
3. The broader sweep question in the Proposal is either answered or explicitly deferred with a reason —
   not left silently unasked.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
