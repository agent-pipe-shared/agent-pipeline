---
schema: pipeline.backlog-item.v1
id: pipeline.ci-path-allowlist-omits-the-editor-the-guards-own-continuation-names
type: defect
owner: pipeline
status: open
created: 2026-09-02
source: "GitHub Actions run 33595311782 (push to main, commit 6262d408), job verify, step Runner-free offline Core Verify, suite guard-lifecycle-ready-tests"
sprint: nova-b
done_when: contains .github/workflows/verify.yml command -v true
---

# The CI `PATH` allowlist omits `true`, so the guard's own published continuation cannot execute in CI

> **Predicate corrected 2026-09-07.** The `done_when` previously named a test
> anchor in `guard-lifecycle-ready.test.mjs` that already existed when the
> predicate was written, so the item read as satisfied from the moment it was
> declared while the defect itself was untouched. It now names the CI symlink
> that would actually fix it — the `command -v true` lookup the symlink line
> needs, chosen over the `${core_path}/true` target because a brace breaks the
> frontmatter parser. Checked the same day:
> `.github/workflows/verify.yml` still links only `node`, `git`, `bash`, `sh`
> and `openssl` into the offline PATH — `true` is still missing and the defect
> is still live. Surfaced by `check-backlog-done-predicate.mjs`, which is the
> exact contradiction that checker exists to find.

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

### Predicate note, 2026-09-03 — Route 2, and what the predicate does not cover

`done_when: contains plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
pipeline.rebwire-req5-2-supplies-its-own-true`. The item states a preference
for Route 2 ("preferred: the assertion under test is about the guard's
published route, not about the host's coreutils") with a stated reason, so
anchoring the predicate to the test fixture file does not pre-decide a
question the item left open — it follows the item's own stated preference.
Route 1 (adding `true` to the workflow's synthetic `PATH`) would land in
`.github/workflows/verify.yml` instead and would not satisfy this predicate;
if Route 1 is chosen instead, this predicate needs retargeting at that time.
**What this predicate does NOT cover:** Acceptance criterion 2
("`guard-lifecycle-ready-tests` reports `=0` in an actual CI run, not only
locally") is unreachable by any local machine predicate available to this
closed vocabulary — there is no repo-relative script that can query GitHub
Actions. The predicate here only expresses criterion 1 (a route implemented
in the fixture); criteria 2 and 3 stay a human/CI-observation judgment.
False today: the marker string does not appear anywhere in
`guard-lifecycle-ready.test.mjs` (checked by direct grep before writing this
predicate). No `Decision:` value is set here; that choice belongs to
whoever triages this item next.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted. Route 2 implemented. Two of three acceptance criteria
  are met; the third is not satisfiable from inside a session.
- **Rationale:** see the triage record below.
- **Assignment (if accepted):** Nova B. Stays open on acceptance criterion 2.
- **Date:** 2026-09-04

### Triage record, 2026-09-04

**Criterion 1 — route chosen and implemented: met.** `5b2ce433`. Route 2, as this
item prefers. NVA-B-CIALLOW-1 found the mechanism itself already present — the
`rbTrueShimDir()` shim, the PATH prepend, and the command byte-identical to the
guard's published continuation. Only the predicate anchor string was missing, so
the change is a doc-comment tag and no logic. `guard-lifecycle-ready.test.mjs`
runs 226/226.

The dispatch explicitly did **not** take Route 1: `.github/workflows/verify.yml`'s
synthetic PATH still admits only node, git, bash, sh and openssl. Widening an
allowlist is a security-relevant act, and this item's own reasoning — the
assertion under test is about the guard's published route, not the host's
coreutils — decides against it.

**Criterion 3 — the sweep question: answered.** NVA-B-PATHSWEEP-1 ran it in one
pass, which is what this item argued for: cheaper than discovering the cases one
CI run each, the pattern already repeated three times. Artifact:
`backlog/evidence/2026-09-04-nva-b-pathsweep-1-allowlist-sweep.md`, commit
`bf7fb42b`.

- The allowlist is **exactly** the five this item assumes — measured from the
  workflow, not inherited. Not stale.
- **502** unique registered suite files swept, enumerated mechanically via
  `parseAllRegisteredSuiteFiles` rather than sampled.
- **Four suites execute a binary outside the allowlist:**
  `guard-lifecycle-ready.test.mjs` → `true` (this item's own case, reached
  through `git -c core.editor=true`, which first-argument scanning does not
  catch); `semgrep-default-rules.test.mjs` → `semgrep`;
  `security-adapters/gitleaks.test.mjs` → `gitleaks`; `copy-safe-command.test.mjs`
  → `pwsh` and `cmd.exe`. The middle two are probe-gated.
- **33 suites could not be determined statically** and are listed by name in the
  artifact rather than silently resolved.

The same two-route choice this item faced now applies to those cases. It is named
in the artifact and deliberately not decided there.

Two limits the sweep states about itself, recorded so they are not read as
stronger than they are: the git-config-mediated pattern was spot-checked rather
than re-verified exhaustively across all 502 files, and `cmd.exe`'s guard status
in `copy-safe-command.test.mjs` was not independently confirmed.

**Criterion 2 — `guard-lifecycle-ready-tests` reporting `=0` in an actual CI run:
not met, and not reachable from a session.** It needs a push, the push gate is
`approval: required` in `signature` mode, and no approval exists for this branch.

**This item therefore stays open**, and the predicate is not the thing to close it
on. `check-backlog-done-predicate.mjs` reports it STALE-OPEN — predicate
satisfied, status open — which is correct and insufficient: the predicate note
above already says which criteria it does not cover. Closing on a satisfied
predicate while a stated acceptance criterion is unmet is the exact premature
closure this repository paid for on 2026-09-03
(`backlog/items/2026-09-01-the-denial-trim-state-is-keyed-per-session-not-per-agent-as-its-comment-claims.md`,
correction section), and closure there proved terminal.

### Triage correction, 2026-09-08

The September 7 predicate correction above inferred too much from the missing
workflow symlink. Route 2 is present in current code: rbTrueShimDir() supplies
the editor only to the real continuation subprocess. Re-running the existing
rebwire req5-2 test under exactly the workflow's five-tool PATH passed, after
separately confirming bare true was unavailable. See
`backlog/evidence/2026-09-08-ci-true-shim-reverification.md`.

The remaining criterion is actual CI evidence, not a missing implementation
of Route 1. The current done_when string names a route the accepted triage did
not choose; it must not be used to infer an outstanding source-code defect or
authorize expanding the CI allowlist. Its replacement needs the ordinary
item-content/ledger rescope procedure, and is not silently changed here.
Status stays open because this local probe does not satisfy actual CI evidence.
No push, CI job, workflow mutation or item closure was performed.
