# NVA-B-PATHSWEEP-1 — CI PATH allowlist sweep: which suites execute a product-published command outside it

Source question: `backlog/items/2026-09-02-the-ci-path-allowlist-omits-the-editor-the-guards-own-continuation-names.md`,
Proposal section: "which other suites execute a product-published command whose binary is outside the
five-symlink allowlist?"

## 1. The allowlist, as measured

`.github/workflows/verify.yml`, step "Runner-free offline Core Verify", builds a synthetic `PATH` with
exactly five symlinks:

```
node, git, bash, sh, openssl
```

(read directly from the five `ln -s "$(command -v X)" "${core_path}/X"` lines, 2026-09-04). This is
**exactly** the five names the backlog item's Proposal section assumes — the "may be stale" hedge in
this dispatch's briefing resolves to **not stale**: the figure was accurate at read time. `openssl`'s
presence is already justified in the step's own comment (`po-human-approval.mjs`'s Ed25519 signing
chain).

## 2. Population, enumerated mechanically

Used `parseAllRegisteredSuiteFiles()` from `plugins/pipeline-core/scripts/check-suite-registration.mjs`
against `harness/scripts/verify.mjs`'s source, which folds three arrays:

| Array | Count |
|---|---|
| `TEST_SUITES` | 498 |
| `SCOPED_VERIFY_SUITES` | 3 |
| `WINDOWS_ASSURANCE_VERIFY_SUITES` | 3 |
| **Union, de-duplicated** | **502** |

This is the exact set `verify.mjs` runs at runtime (module header's own LIMITS section: it deliberately
excludes `PHASE_STEPS`, which holds no `*.test.mjs` entries, so nothing is lost by that exclusion). No
suite was added or removed by sampling.

## 3. Rule applied for "product-published command"

Taken from the workflow step's own `openssl` justification comment: a binary counts if a **shipped
product code path invokes it** — either directly from product source, or from a test that spawns the
real binary to verify the product's own generated command/output actually runs. It does **not** count
when:

- the suite spawns its own Node fixture (`process.execPath` on a script the suite itself wrote) — the
  binary is `node`, already in the allowlist, regardless of what that fixture's own body contains as
  *text*;
- the suite writes a fixture script that *embeds*, as a string literal, a call to some other binary —
  used to simulate an attacker/bypass scenario rather than to exercise the product's own route. That
  embedded string is never actually the suite's own outer spawn; the outer spawn is still `node
  <fixture>` (allowlisted). Two concrete instances of this shape were found and are named in §5 as
  excluded, not silently dropped.
- the suite spawns a real system tool only to simulate an adversarial actor (e.g. "a non-Node
  interpreter writing directly is detected") rather than to run something the product itself ships.

## 4. Sweep method

Two passes over the 502-file population only (not the whole repo):

1. Direct call sites: `spawnSync`, `spawn`, `execFileSync`, `execFile`, `execSync`, bare `exec` (regex
   `.exec(` excluded as the RegExp method, not `child_process.exec`), scanned per-file, first-argument
   text captured verbatim.
2. A second, separate sweep for git-config-mediated invocation (`core.editor`, `GIT_EDITOR`,
   `GIT_SEQUENCE_EDITOR`, `core.pager`, `credential.helper`, `core.hooksPath`, `diff.external`,
   `core.fsmonitor`) across the same tree, because a `spawnSync("git", [...])` call can itself launch an
   *arbitrary further binary* through git's own config resolution — exactly the mechanism behind the
   `true` incident this item names. This is NOT caught by pass 1's first-argument scan (the first
   argument is `"git"`, which is allowlisted; the binary that actually fails is the config value).

191 of the 502 suites contain at least one direct call site (pass 1); 311 have none of their own
(scope limit — see §6).

## 5. Findings: suites executing a product-published command outside the allowlist

| Suite | Binary | Allowlist status | Mechanism | Notes |
|---|---|---|---|---|
| `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` | `true` | **outside** | git-config-mediated (`git -c core.editor=true rebase --continue`, real non-interactive-continue spawn at line 7877/8194/8328/8488) | The item's own subject (route decision still open per the item's Triage). Not caught by a first-argument scan of `spawnSync`. |
| `plugins/pipeline-core/config/security/semgrep-default-rules.test.mjs` | `semgrep` | **outside** | direct `spawnSync("semgrep", ...)`, plus a `findSemgrep()` probe (`binary` var) | Probe-gated: `probe.error ? null : "semgrep"` — test skips/adapts when the binary is absent, not a hard fail. |
| `plugins/pipeline-core/scripts/security-adapters/gitleaks.test.mjs` | `gitleaks` | **outside** | `gitleaksBin = gitleaksProbe.path`, `gitleaksProbe = resolveTrustedSystemExecutable("gitleaks")` | Same probe-gated shape; `reproSkip`/`gitleaksOnlySkip` computed from `!gitleaksProbe.ok`. |
| `plugins/pipeline-core/lib/copy-safe-command.test.mjs` | `pwsh`, `cmd.exe` | **outside** | direct `spawnSync("pwsh", ...)` / `spawnSync("cmd.exe", ...)`, run against `rendered.copyCommand.powershell` / `.cmd` — the actual text the product's `copy-safe-command.mjs` renderer emits | `pwsh` calls are behind a `powerShellProbe` check (probed first); did not verify a matching guard exists for the `cmd.exe` branch specifically — flagged rather than assumed. |

This closes the sweep the item's Proposal asked for: `openssl` (already allowlisted, already justified in
the workflow comment) and the runner-executables-in-`onboarding-init` incident are the two other
class members it names; `onboarding-init.test.mjs`'s pattern is `*.applyAction.executable`, a runtime
value resolved from a `resolveTrustedSystemExecutable(...)`-style probe rather than a literal — not
re-traced here since the item already names it as closed history, not an open question.

## 6. Cases that could not be determined statically (named, not silently resolved)

Suites whose direct spawn call's first argument is a variable/expression this dispatch did not trace to
a literal, beyond the four resolved above (`binary`, `gitleaksBin`) and the excluded fixture-string
cases (`mkfifo` in `public-core-observation.test.mjs`, `python3` and the fixture-embedded `/bin/sh` in
`check-protected-path-integrity.test.mjs` — both confirmed adversarial/scaffolding, not product code,
so excluded from §5 rather than left ambiguous):

- `harness/scripts/check-pr-contributor-gates.test.mjs` (`cmd`)
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (`listing.executable` — a second,
  separate call site from the `true` finding above)
- `plugins/pipeline-core/hooks/guard-lifecycle-recovery-contract.test.mjs` (`command`)
- `plugins/pipeline-core/lib/bootstrap-source-attestation-acceptance.test.mjs` (`path`)
- `plugins/pipeline-core/lib/codex-onboarding-app-server.test.mjs` (`_bin`)
- `plugins/pipeline-core/lib/codex-onboarding-capabilities.test.mjs` (`command`)
- `plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` (`command`)
- `plugins/pipeline-core/lib/human-guard-override.test.mjs` (`command`)
- `plugins/pipeline-core/lib/po-gate-authority.test.mjs` (`command`, `icacls.path` — Windows-only path,
  likely outside the Linux CI allowlist by construction but not confirmed)
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` (`calibration.verify`, `command`,
  `hookPath`)
- `plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs` (`command`,
  `consumerCalibration.verify`)
- `plugins/pipeline-core/lib/trust-anchor-bootstrap-circularity.repro.test.mjs` (`executable`)
- `plugins/pipeline-core/lib/wsl-ipc-compatibility.test.mjs` (`executable`)
- `plugins/pipeline-core/scripts/antigravity-alpha-adapter.test.mjs` (unparsed — first-arg text was a
  bare quote fragment, parser artifact, not traced)
- `plugins/pipeline-core/scripts/close-coordinator.test.mjs` (`action.executable`)
- `plugins/pipeline-core/scripts/codex-critic-host.test.mjs` (`command`)
- `plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs` (`_command`)
- `plugins/pipeline-core/scripts/codex-host-repository-init.test.mjs` (`command`, 20+ call sites)
- `plugins/pipeline-core/scripts/codex-private-overlay-activation.test.mjs` (`command`)
- `plugins/pipeline-core/scripts/codex-sandbox-runtime.test.mjs` (unparsed fragment)
- `plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs` (`GIT`, `NODE` — uppercase constants,
  plausibly resolved literals but not traced)
- `plugins/pipeline-core/scripts/neutral-range-plan.test.mjs` (`command`)
- `plugins/pipeline-core/scripts/onboarding-init.test.mjs` (`*.applyAction.executable`, ×4 — the known,
  already-named `onboarding-init` incident; not re-traced)
- `plugins/pipeline-core/scripts/pipeline-state.test.mjs` (`action.applyAction.executable`)
- `plugins/pipeline-core/scripts/po-human-approval.test.mjs` (`executable`)
- `plugins/pipeline-core/scripts/pre-push-hook-install.test.mjs` (`install.hookPath`)
- `plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs` (`action.executable`,
  `verifyCommand`)
- `plugins/pipeline-core/scripts/project-onboarding-v3-unborn-head.test.mjs` (`command`)
- `plugins/pipeline-core/scripts/public-baseline-diagnose.test.mjs` (`file`)
- `plugins/pipeline-core/scripts/ruleset-freshness.test.mjs` (`command`)
- `plugins/pipeline-core/scripts/security-scan-v2-integration.test.mjs` (`cmd`)
- `plugins/pipeline-core/scripts/security-scan.test.mjs` (`cmd`)
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` (`command`)
- `plugins/pipeline-core/scripts/verify-journal.test.mjs` (`...args` spread, i.e. an
  already-constructed argument list, not a single literal)

These 33 (after resolving `binary`/`gitleaksBin`, and excluding the two confirmed-adversarial fixture
cases) are named rather than guessed at. Many are very likely `"git"` passed as a variable rather than a
literal (matching this codebase's existing pattern of `const command = "git"` helpers seen elsewhere in
the sweep), but this dispatch did not open every one to confirm, per the stop-condition on scope and the
tool budget.

## 7. Scope boundary (stated, not silent)

- This sweep traces **direct** call sites in each registered suite file's own source, plus the one
  git-config-mediated pattern named in §4. It does **not** trace transitively through an imported
  helper module a suite calls (e.g., a suite that calls a shared `runGit()` wrapper defined in a `lib/`
  file rather than spawning inline) unless that wrapper's own call site was independently swept because
  the wrapper file is itself a registered suite. A registered suite that spawns nothing itself but pulls
  in a lib doing so on its behalf is not distinguished from one with no subprocess behavior at all.
- The git-config-mediated sweep (§4, pass 2) was run once across the whole tree and manually checked
  against five files that also spawn `git` with a real (non-`--dry-run`, non-inspection) invocation;
  it was not exhaustively re-verified against all 502 suites individually.
- No remedy is proposed or built here (forbidden by this dispatch's briefing). The `true` incident's own
  backlog item already carries two named routes and an open Triage — this artifact adds no third
  opinion on top of it.

## 8. `pre-gate.mjs` result

```
node harness/scripts/pre-gate.mjs
```
Exit code 1. `verify-suite-registration-check` FAILs with the two pre-existing unregistered suites
(`harness/scripts/pre-gate.test.mjs`, `plugins/pipeline-core/scripts/capture-evidence.test.mjs`) — the
same two the briefing named as already awaiting a signature ceremony. No new finding appeared. All
other five pre-gate checks passed.
