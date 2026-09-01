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

### Per-suite analysis: MEASURED, not hypothesized

Root cause was established after this item was first filed by three controlled local runs reproducing
the workflow step's synthetic `PATH` (each run repo-relative, reproducible):

- **Scenario "restricted `PATH` only"** (symlinks to `node`/`git`/`bash`/`sh` only, exactly matching
  `.github/workflows/verify.yml:55`): all three suites FAIL, matching CI.
- **Scenario "empty `HOME` only, full `PATH`"**: all three suites PASS. **The absent
  `~/.agent-pipeline/machine.json` is NOT the cause** — this was the obvious guess this item originally
  entertained, and it is wrong; state it here so the next reader does not re-open that lead.
- **Scenario "restricted `PATH` + `openssl` added back"**: `trust-anchor-bootstrap-circularity-repro-tests`
  and `onboarding-init-tests` both PASS (exit 0). **The missing binary is `openssl`.**

**`trust-anchor-bootstrap-circularity-repro-tests` and `onboarding-init-tests` — CAUSE ESTABLISHED.**
`plugins/pipeline-core/scripts/po-human-approval.mjs` shells out to the `openssl` binary for the whole
key/signature chain: `genpkey -algorithm ED25519 -aes-256-cbc` (~line 1237), `pkey -in … -pubout` (~lines
1170 and 1238), and `pkeyutl -sign -rawin` (~line 1018). The workflow step at
`.github/workflows/verify.yml:55` symlinks only `node`, `git`, `bash`, `sh` into the synthetic `PATH` —
`openssl` is not among them. Signature mode therefore has a real external-binary dependency that the
"Runner-free offline Core Verify" step's own premise (only those four binaries exist) does not admit.
This is now a measured cause, not a hypothesis: both suites pass once `openssl` is restored to the
restricted `PATH` and fail without it, with nothing else changed.

**`project-onboarding-v3-tests` — CAUSE STILL NOT ESTABLISHED; do not conflate with the above.** This
suite failed in CI in 74s (run 33471808564, 05:01:34→05:02:48Z), but locally it PASSES under the
restricted `PATH` with a fresh `HOME`, both with and without `openssl` present. Its only observed local
failure mode is an unrelated ~150s hang that occurs solely against this particular machine's real `HOME`,
whose machine-plane `poKeyDirectory` sits on a slow `/mnt/c` Windows mount — that is a local environment
artifact of one operator's machine, not the CI cause, and must not be reported as the same thing. **This
suite's CI-only failure cause remains genuinely unknown.**

### What this item is NOT claiming

Two of the three causes are now MEASURED (`openssl` absent from the restricted `PATH`, confirmed by
adding it back and watching both suites go green), not merely plausible. The third
(`project-onboarding-v3-tests`) is still open — its cause is not "probably also `openssl`"; the measured
local runs directly show that suite passing under the restricted `PATH` with and without `openssl`, so
that explanation is already ruled out for it. Whoever picks this item up next should reproduce the
`project-onboarding-v3-tests` CI failure from scratch (the 74s CI timing is a possible lead: it is fast,
unlike the unrelated local hang) rather than assuming it shares either of the other two suites' cause.

### Release consequence

The `protect-main` ruleset requires the `verify` status check, so `main` stays unreachable while these
three suites fail in CI. This is the FIRST time these particular failures were observable at all: before
commit `ed491309`, every CI run aborted after 8–29 seconds at `verify-journal` with zero suites executed
(`VERIFY-CLEANUP-REGISTRATION-REQUIRED`), so these three failures were masked by that earlier blocker
rather than being newly introduced by anything landing since.

## Acceptance

Reproduction against the restricted-`PATH`/fresh-`HOME` environment is DONE (see "Per-suite analysis"
above) for two of the three suites. This item is settled once someone has, in addition:

1. Decided and implemented a fix for the `openssl` dependency in `po-human-approval.mjs`'s
   `genpkey`/`pkey`/`pkeyutl` calls — either add `openssl` to the workflow step's synthetic `PATH`
   (`.github/workflows/verify.yml:55`, owned by the Elephant, not this item) or make signature-mode
   verification not require a real `openssl` subprocess in this offline lane — and confirmed
   `trust-anchor-bootstrap-circularity-repro-tests` and `onboarding-init-tests` go green in actual CI, not
   just locally.
2. Identified `project-onboarding-v3-tests`' actual CI-only cause, citing the exact line(s) responsible
   the same way this item now cites `po-human-approval.mjs` for the other two — the restricted-`PATH`/
   fresh-`HOME` shape has already been ruled out for this suite specifically; a different environment
   difference (or a CI-only timing/ordering effect, given its comparatively fast 74s CI runtime) must be
   found instead.
3. Recorded the fix(es) (a scoped follow-up item per suite is fine if the fixes are independent) and
   re-run the `verify` workflow to confirm all three go green in CI.

## Progress, 2026-09-01/02 — measured, and it moves two of the three

Everything above this heading is the item as first written and is left intact.
Two of its statements are now superseded by measurement, and an independent
review read the stale text as current, so the correction is recorded here
rather than by editing the analysis above.

**The `openssl` half is done.** Commit `705b7cf3` added `openssl` to the
workflow's synthetic `PATH`. In CI run `33551001455` on commit `266d691f`,
`trust-anchor-bootstrap-circularity-repro-tests` reported `=0`. That suite is
green and is no longer one of the failing three. Acceptance criterion 1's
first half is therefore satisfied, by the workflow-PATH route rather than by
changing `po-human-approval.mjs`.

**The failing three, as of run `33551001455`,** are
`project-onboarding-v3-tests`, `codex-onboarding-capabilities-tests` and
`onboarding-init-tests` — not the set this item names.

**`onboarding-init-tests` had a different cause than `openssl`.** Measured: on
the synthetic `PATH`, `onboarding-init.mjs` finds no runner executable, emits
`runtime_executable_unavailable` with `status: "runtime-readback-unavailable"`,
and exits 1. The suite isolated `HOME` but not `PATH`, so it was asserting a
property of the host. Fixed in `8db2c988`, which provides the runner
executables from a test-local directory.

**`project-onboarding-v3-tests`' CI-only cause is identified**, satisfying
acceptance criterion 2. It is not `PATH`, not `HOME` and not the spaces in the
fixture directory name — the decisive axis is the filesystem behind `TMPDIR`.
`applyProjectOnboardingManifestRepair`'s rollback decided ownership of the file
it deletes by `{dev, ino}` alone. ext4 reallocates the lowest free inode in the
block group, so a file created immediately after an `unlink` commonly inherits
the freed inode number; tmpfs draws from a monotonic counter and never reuses
one. Local `/tmp` is tmpfs, the runner's is ext4, and that is the whole
local-pass/CI-fail split. Fixed in `9a7c309b`, with a deterministic regression
test that injects the reuse. Reproducible locally in one call with `TMPDIR` on
ext4.

**`codex-onboarding-capabilities-tests` is intermittent, not deterministic.**
Red in run `33551001455`'s first execution, green in a second execution of the
same commit (job `100022146240`), and green locally under an ordinary `PATH`,
the synthetic `PATH`, tmpfs and ext4. Its failing assertion has not been
identified: the CI reporter kept only the log tail and the failure fell into
the omitted head. `e066a1b7` fixed the reporter, so the next red run will name
it. A candidate cause with the same signature is filed separately as
`pipeline.inode-identity-decides-deletion-in-a-second-rollback-path`.

**Acceptance criterion 3 remains open, and it is the one that matters:** no CI
run exists at `9a7c309b` or later. Everything green so far is green locally.
Until the `verify` workflow runs on a commit carrying these fixes and passes,
this item stays open and `main` stays unreachable.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
