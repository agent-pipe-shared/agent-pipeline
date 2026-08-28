---
schema: pipeline.backlog-item.v1
id: pipeline.core-verify-cannot-pass-under-the-ci-trimmed-path
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
source: "Local replay of .github/workflows/verify.yml's `verify` job before the first PR to main, 2026-08-28, at HEAD bbdbfd02. Steps 1-7 pass; step 8 fails. Controlled 2x5 matrix isolates the trimmed PATH as the cause."
---

# Core Verify cannot pass under the PATH the CI workflow gives it, and nothing has ever noticed because CI has never reached that step

## What was measured

The workflow's last step replaces `PATH` wholesale with a directory holding four
symlinks — `node`, `git`, `bash`, `sh` — and runs `harness/scripts/verify.mjs`
under it. Replayed locally at `bbdbfd02` with that exact PATH and
`PIPELINE_LIVE_CERTIFICATION=disabled`, Core Verify exits 1 after 164s with five
failing steps.

Each of the five was then run twice, changing nothing but `PATH`:

| suite | normal PATH | trimmed PATH | missing binary |
|---|---|---|---|
| `ruleset-freshness-tests` | exit 0 | exit 1 | `sleep` |
| `signing-ceremony-tests` | exit 0 | exit 1 | `openssl` |
| `po-human-approval-tests` | exit 0 | exit 1 | `openssl` |
| `codex-isolation-control-decomposition-tests` | exit 0 | exit 1 | `codex` |
| `security-scan` | exit 0 | exit 2 | `uname`, via semgrep |

**Five for five: passes normally, fails trimmed.** The commit is not the cause;
the PATH is.

The root causes are individually confirmed, not inferred from the exit code:

- `ruleset-freshness.test.mjs:576` simulates a hung remote with
  `spawnSync("bash", ["-c", "trap '' TERM; sleep 3"])`. Without `sleep` the child
  exits immediately, so the call returns `remote-unavailable` where the assertion
  expects `timeout`. The test is correct; its fixture needs a binary the PATH
  excludes.
- The two signing suites shell out to `openssl genpkey -algorithm ED25519`.
- `codex-isolation-control-decomposition.mjs:35` throws
  `"Codex binary is unavailable on PATH"` outright.
- semgrep is reached through an absolute `binaryPath` (`security-scan.mjs:835`
  passes `inst.path`, bypassing the adapter's own PATH resolution), runs, and
  then dies inside its own TLS setup on `run ['uname' '-s']`.

## Why nobody has hit this

`gh run list` shows every `verify` run on `main` has failed, back through
2026-08-02, each in 8–19 seconds. The most recent (`31385169197`, 2026-08-10)
fails at **step 2**:

```
{"schema":"pipeline.verify-topology-preflight.v1","status":"failed",
 "code":"VTP-DEFINITION-REQUALIFICATION-REQUIRED", ...}
##[error]Process completed with exit code 2.
```

That is Layer 1 of
`2026-08-28-the-ci-topology-preflight-cannot-pass-on-this-branch.md`, and this
run is direct evidence that it is what actually reddens CI today. **Step 8 has
therefore never executed on a runner.** These five failures are not a
regression — they are the first time anything has looked.

## Scope: which of the five will actually break the first PR

Stated separately from the measurement, because confidence differs:

- **`sleep` and `openssl` (three suites): will fail in CI.** Both exist on
  `ubuntu-latest` at `/usr/bin`, and both are excluded by the trimmed PATH
  exactly as they are locally. The reproduction is faithful.
- **`codex` (one suite): will almost certainly fail in CI.** A GitHub runner
  never has the Codex CLI at all, so the throw is reached by a second
  independent route. Not directly measured on a runner.
- **`security-scan`: unknown, and the local result does not transfer.** Locally
  the scanners are installed, so discovery hands the adapter an absolute path and
  semgrep genuinely runs before failing on `uname`. On a runner nothing is
  installed, so the code takes its not-installed branch instead. Whether a
  missing required capability then produces a BLOCKING verdict is a separate
  question this replay cannot answer.

## Direction

The tension is real and should be decided, not patched around: the step is named
"Runner-free offline Core Verify", and the trimmed PATH is the mechanism that
makes "runner-free" true. Widening it to admit `openssl`, `sleep` and the rest
would weaken exactly the property the step exists to prove.

Options, in the order they should be considered:

1. **Give the affected suites host-independent fixtures.** The freshness test
   needs a process that ignores SIGTERM, not `sleep` specifically — a `node -e`
   fixture is available by construction, since `node` is in the trimmed PATH.
2. **Let suites declare a binary requirement and skip typed when unmet**, so a
   runner-free run reports "skipped: openssl unavailable" instead of a red
   assertion. This keeps the signal honest rather than hiding it.
3. **Split the lane** — a runner-free core plus a separately declared lane for
   suites that legitimately need host tooling.

What should NOT happen is quietly adding the binaries to the PATH: that turns a
green check into a claim the step no longer supports.

## Acceptance criteria

- `harness/scripts/verify.mjs` exits 0 under the four-symlink PATH, or every
  suite that cannot run there reports a typed skip that Verify treats as such.
- No suite is deleted or its assertion weakened to reach green.
- The `security-scan` question is answered by measurement on a runner, not by
  the local replay.

## Related

- `2026-08-28-the-ci-topology-preflight-cannot-pass-on-this-branch.md` — the
  step-2 blocker that has been masking this one. Its Layer 1 is what the CI log
  above shows failing.
- `2026-08-16-every-gate-binds-the-whole-tree...` — same family: a gate whose
  environment assumptions were never exercised end to end.
