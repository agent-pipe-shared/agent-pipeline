# Critic report: HOOKREFRESH (83083a070, 7249b15db, 5a3fe2eec). Partial, stopped at the 80 % budget checkpoint

Persisted by the Elephant from the Critic's hand-back. The Critic host had no Write tool, so this file is the only record.

- **Route:** `claude-opus-5-5`, effort max, GUARDRAIL class.
- **Lane:** functional-equivalent, read-only.
- **Ruleset:** `0.7.0+claude.20261008194106.da20519d`.
- **Verdict:** pass/fail withheld (partial review). Three major findings and one minor finding stand on the examined material.

## Findings

### F1 (major): the stale+missing mix is still a dead end, one hop later

For a stale mandatory hook next to a missing one, the preflight offers `refresh-mandatory-hooks.mjs`. The helper only upgrades hooks that are already installed. It does not install the missing one.

What happens:
- The plan is `ready`, but the result is `skipped-ready`.
- Afterwards the pair reads current+install. `check-clone-provisioning.mjs:41-51` reports that as `blocked / HOOK-READINESS-STATE-UNSUPPORTED`, which becomes `hook-provisioning-blocked`, and `nextAction` is null again.
- The action's `expected.status: "ready"` cannot be reached on this branch: the helper reports `pending` and exits 2.
- The T0 pin observes only the first preflight.

Evidence:
- `pipeline-start-preflight.mjs`@5a3fe2eec, lines :1600-1603, :1723-1726 and ~:1741.
- `refresh-mandatory-hooks.mjs`, lines :7-8, :38-40 and :57.

Spec references: Ruling 67 (T0), Ruling 69 F3, and design note §3.4.

### F2 (major): the Ruling 70 R3 read-only/stop duty has no evidence, and the readback may write

`observeModelRoleBootstrapReadback` calls `runModelRoleBootstrap({ rootDir, runner, env })`, so `confirm` takes its default of null.

In `model-role-bootstrap.mjs`:
- `confirm` is consulted only when `acknowledgementRequired` is true (:268-273).
- Otherwise the function calls `admitModelRoleHostBootstrap({ proposal, acknowledgement, store })` (:282-285), and the store sits under the git common dir (:218).
- The REUSED path (:222-227) reads back a stored admission.

No artifact shows the "if it writes, stop" check. The Critic did not read the admit and store bodies.

Spec references: Ruling 70 R3 and Ruling 69.

### F3 (major): the new hook-rewriting helper ships without any test

No test imports `refresh-mandatory-hooks.mjs`; the F1d run has 93 tests and none of them reaches it. Two things are therefore unevidenced:
- Ruling 69 F2: apply only ready-to-upgrade plans, never declined, foreign or absent hooks.
- Ruling 70 R5: the static `applyInstall` import from `pre-push-hook-install.mjs`.

Spec references: Ruling 69 F2, Ruling 70 R5, and QG-04.

### F4 (minor): `confirmation-required` is folded into `unavailable`

`modelRoleBootstrapField` maps every status other than `ready` to `unavailable`, at `pipeline-start-preflight.mjs:1750-1755`. The bootstrap's `confirmation-required` status, with code `MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED`, therefore loses its status, and only its code survives.

Spec reference: the Ruling 67 R3 `{ status, code }` passthrough.

## Examined and found in order

- **Ruling 67:** R1 role exemption, R2 seam and conditional thenable, R4 action shape.
- **Pre-push control:** a stale pre-push hook alone stays `ready`.
- **Ruling 69 F3:** the refresh action is computed before the result.
- **Ruling 71(a):** the status changes only from `ready`.
- **Exit code:** non-zero.
- **Imports:** present and correct.
- **7249b15db:** exactly the five Ruling 71(b) cases, seam injection only.
- **83083a070:** 15 tests, matching Ruling 67.
- **QG-04:** the fix commit touches no test.
- **changedFiles:** equals each commit's file list.
- **Trailers:** clean.
- **Language:** English.

## Trajectory: not verifiable

- `T5/after.txt` has head `b05867bf`, but the parent of 7249b15db is `9ac93623`.
- `F1d/after.txt` has head `ddf1d5b6`, but the parent of 5a3fe2eec is `83d9caf97`.
- No artifact exists for the R1 gate-protection run or the R3 write check.

## Not reached

- Guardrails and role files.
- `command-catalogue.mjs:268-300`.
- `ruleset-freshness-host.mjs:231`.
- The bodies of `admitModelRoleHostBootstrap` and `createModelRoleHostStore`.
- The installer `applyInstall` exports.
- The evidence trees compared against the committed trees.
