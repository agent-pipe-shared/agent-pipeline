---
schema: pipeline.backlog-item.v1
id: pipeline.three-onboarding-suites-pass-locally-and-fail-in-ci
type: defect
owner: pipeline
status: open
created: 2026-09-01
source: "GitHub Actions run 33471808564 (workflow_dispatch, feat/sprint-nova-codex-v046, candidate 56e91858), job verify, step Runner-free offline Core Verify"
sprint: nova-b
---

# Three onboarding/trust-anchor suites fail in CI-only, pass locally, and block `main`

## Description

GitHub Actions run 33471808564 (`workflow_dispatch` against `feat/sprint-nova-codex-v046` at candidate
commit `56e91858`, job `verify`, step "Runner-free offline Core Verify", duration 6m37s) exited 1. The
run reached suite index 439 of 505 — it executed the suites rather than aborting early (contrast the
prior blocker below). Exactly three suites reported a non-zero result; every other one of the 505
reported zero:

- `project-onboarding-v3-tests`
- `trust-anchor-bootstrap-circularity-repro-tests`
- `onboarding-init-tests`

The same three pass in the local checkout: the full local `verify.mjs` run at candidate `56e91858`
recorded exit 0 with `binding: "exact"` and no failing entry.

## Triggering situation

Observed directly from the CI run listed above, cross-checked against a local `verify.mjs` run at the
same candidate commit. Both runs are named as-is in this item; no other source was consulted for the
pass/fail facts.

## Affected artifact

- `.github/workflows/verify.yml`, job `verify`, step "Runner-free offline Core Verify" (lines 52–55)
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
- `plugins/pipeline-core/lib/trust-anchor-bootstrap-circularity.repro.test.mjs`
- `plugins/pipeline-core/scripts/onboarding-init.test.mjs`
- `plugins/pipeline-core/lib/machine-plane.mjs` (`machinePlaneFilePath()`, `readMachinePlane()`)
- `protect-main` ruleset (requires the `verify` status check)

## Proposal

### The CI environment, established from the workflow file itself

The step's exact shell line (`.github/workflows/verify.yml:55`):

```sh
core_path="${RUNNER_TEMP}/pipeline-core-path" && mkdir -p "${core_path}" \
  && ln -s "$(command -v node)" "${core_path}/node" \
  && ln -s "$(command -v git)" "${core_path}/git" \
  && ln -s "$(command -v bash)" "${core_path}/bash" \
  && ln -s "$(command -v sh)" "${core_path}/sh" \
  && PATH="${core_path}" "${core_path}/node" harness/scripts/verify.mjs
```

with `env: PIPELINE_LIVE_CERTIFICATION: disabled` set for that step. Confirmed by direct reading, not
assumed from the briefing: `PATH` for `harness/scripts/verify.mjs` and everything it subprocess-spawns
is narrowed to a directory containing exactly four symlinks — `node`, `git`, `bash`, `sh` — and nothing
else. No `openssl`, no `env`, no other binary is reachable by name. `HOME` is whatever the `ubuntu-latest`
runner sets it to (a fresh, previously-unused directory with no `.agent-pipeline/machine.json` and no
registered PO key), unlike a developer's own machine which usually has both.

### Per-suite analysis: what could plausibly explain a CI-only failure

**`trust-anchor-bootstrap-circularity-repro-tests`** — citable, not speculative. The suite
(`trust-anchor-bootstrap-circularity.repro.test.mjs:98-110`) fakes `po-human-approval.mjs`'s `setup`
command's spawn calls via `fakeOpensslSpawn`, but that fake only intercepts the `openssl genpkey`
subcommand (lines 99-106); any other `openssl` invocation falls through to a REAL
`spawnSync(executable, args, { stdio: "pipe" })` (line 108). `po-human-approval.mjs`'s real `setup` path
calls `openssl` a second time, unconditionally, to derive the public key from the freshly generated
private key: `command("openssl", ["pkey", "-in", paths.privateKey, "-pubout", "-out", paths.publicKey], dependencies)`
(`po-human-approval.mjs:1238`). On a developer machine `openssl` is normally on `PATH`; in this CI step's
synthetic four-binary `PATH` it is not, so that second call cannot resolve the executable at all. This is
the strongest, most directly citable candidate of the three.

**`project-onboarding-v3-tests`** — investigated, not established. This suite's default `fakeDeps`
object explicitly documents avoiding the real machine plane ("Deterministic 'already asked' by default —
never falls through to the REAL `~/.agent-pipeline/machine.json`", `project-onboarding-v3.test.mjs:157-161`)
and every in-process `onboardingCli(...)` call I found threads that same `fakeDeps`/`readMachinePlane`
override. I did not find a call in this file that spawns `po-human-approval.mjs`'s real `setup` (no real
`openssl` invocation, unlike the repro suite above), nor a real subprocess call to the onboarding CLI that
omits an equivalent home-directory guard. **I could not pin an exact line that explains this suite's
CI-only failure; do not read the above as ruling one out — it only means the specific dependency was not
found by this pass.**

**`onboarding-init-tests`** — investigated, not established, with one already-fixed adjacent issue on
record. The suite's own header comment cites `NVA-W3-ONBOARDENV`: it used to read the real operator's
`$HOME` machine-plane state through a spawned subprocess (backlog:
`2026-08-28-a-verify-gate-suite-reads-real-machine-state-through-a-subprocess.md`) and was fixed by
threading `PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE` into every subprocess `env` that omits its own synthetic
`run` responder (`onboarding-init.test.mjs:14-21`). Key-creation paths in this suite use synthetic
`runSetup`/mocked responders rather than a real `openssl` subprocess, so the repro suite's specific cause
does not obviously transfer here either. **I could not find the specific environment dependency behind
this suite's CI-only failure in this pass; it may share a root cause with one of the other two, or have
its own, not yet identified.**

### What this item is NOT claiming

The environment-difference explanation above is a HYPOTHESIS for one of the three suites
(`trust-anchor-bootstrap-circularity-repro-tests`, backed by an exact cited line) and an open question for
the other two. This item does not claim the failures are "just environmental" — the release cannot reach
`main` until the `verify` status check is green, so a wrong reassurance here would be expensive. Whoever
picks this item up next should treat the openssl finding as a lead to reproduce, not a closed diagnosis,
and should still investigate the other two suites from scratch rather than assuming they share the same
cause.

### Release consequence

The `protect-main` ruleset requires the `verify` status check, so `main` stays unreachable while these
three suites fail in CI. This is the FIRST time these particular failures were observable at all: before
commit `ed491309`, every CI run aborted after 8–29 seconds at `verify-journal` with zero suites executed
(`VERIFY-CLEANUP-REGISTRATION-REQUIRED`), so these three failures were masked by that earlier blocker
rather than being newly introduced by anything landing since.

## Acceptance

This item is settled once someone has:

1. Reproduced (or failed to reproduce) each of the three suites' CI-only failure locally under the same
   restricted environment the workflow step constructs: a `PATH` containing only symlinks to `node`,
   `git`, `bash`, `sh` (no `openssl`, no other binary), `HOME` pointed at a fresh, empty directory (no
   pre-existing `.agent-pipeline/machine.json`), and `PIPELINE_LIVE_CERTIFICATION=disabled` set.
2. For `trust-anchor-bootstrap-circularity-repro-tests`: confirmed whether the missing `openssl` binary
   is in fact the cause (the suite should fail identically once `openssl` is removed from `PATH` locally,
   and pass again once it is restored, or `fakeOpensslSpawn` is extended to intercept the `pkey -pubout`
   subcommand too).
3. For `project-onboarding-v3-tests` and `onboarding-init-tests`: identified the actual dependency (or
   ruled out the restricted `PATH`/fresh `HOME` shape entirely and found a different cause), citing the
   exact line(s) responsible, the same way this item cites `po-human-approval.mjs:1238` for the repro
   suite.
4. Recorded the fix (or a scoped follow-up item per suite, if the fixes are independent) and re-run the
   `verify` workflow to confirm all three go green in CI.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
