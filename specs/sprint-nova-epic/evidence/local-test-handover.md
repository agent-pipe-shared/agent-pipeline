# Local candidate test handover

Status: preparation in progress. The final build stamp, frozen candidate,
reader binding and final Verify/security references are still pending.
This file does not declare a delivered candidate or live Alfred readiness.

The release target is 0.6.2; the local candidate keeps the 0.6.1 base version
with a distinct Codex build suffix. Invoking source from this checkout does
not replace the installed plugin or publish the candidate.

## Repair checkpoint — 2026-09-10

The isolated repair checkout is
`branch/detached/candidate-review-fixes-8741613004e7` under the Nova source
root. Its tested commit was `c7b991578956dfebfa92c5f5a640649c05628ca3`,
tree `ba60c32c4bd6e13c7aa6ed1636344f2d57af27d3`.
Full Verify completed with 517/517 passing, zero reused results and security
exit 0. Its receipt is in the main checkout at
`evidence/verify-1789027100561-f887115261642078.json`.
This is a repair checkpoint, not the final candidate's gate receipt.

The separately authorized protected-pin transcription is complete. The agent
also started the authorized native inventory review itself. Attempt
`attempt-1789032164991-22ba135b13a99089ea9afe92` completed its model turn but
rejected prior-verdict prose in the briefing and withheld substantive judgment.
The input boundary needs correction; no inventory PASS has been obtained.
See the [PO queue](../../../backlog/evidence/2026-09-06-po-decision-queue.md)
for the retained authorization and current disposition.

For this source and consuming user projects, ordinary Critic preparation,
execution, monitoring and result readback are agent work after the applicable
plan and deterministic gates. No extra Pipeline PO question or routine user
terminal step is required. Use supported host permission mechanisms and
diagnose real denials; do not bypass them. Existing explicit PO gates and
review bounds remain in force.

Neither a completed review process nor this passing Verify run is a release
approval. Final inventory attestation, both reader stages, build
identity and the final bound gates remain pending.

## Test the actual onboarding entry

Run these commands from the eventual frozen candidate checkout. Replace
`<disposable-project>` with an absolute path to a disposable test project.
Keep the project separate from the pipeline source and any live Alfred root.

First inspect and plan without changing the project:

```sh
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs inspect --root <disposable-project> --runner codex
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs plan --root <disposable-project> --runner codex
```

Read the returned status, planned targets and `nextAction`. A plan whose
status is `ready` is actionable; it does not establish completed onboarding.

After explicitly authorizing initialization of that disposable project, run
the public driver. This command executes returned actions, including writes:

```sh
node plugins/pipeline-core/scripts/onboarding-init.mjs --root <disposable-project> --runner codex
```

There is no `init` subcommand. For a deliberately stepped fresh-seed test,
use the plan's exact returned `apply-portable-seed` command, preserving its
root, runner, `--plan-sha256` digest and `--activate`, then re-enter the driver.
An unbound `apply` alias is not a substitute.

Inspect `outcome`, `stepsExecuted`, `steps`, `final.status` and
`final.nextAction`, plus `collectInput` or `pendingAsks` when present.
Exit zero alone is insufficient: `ready`, `collect-input` and `pending-asks`
can all exit zero. Only `outcome: "ready"` is a readiness result.

Answer required questions through their returned actions, then re-enter the
driver. Re-entry should inspect the updated project and avoid applying an
already-applied seed. Supply actual author information, verification commands
and approval preferences; do not invent values merely to reach `ready`.
First trust-anchor setup can involve external key storage and machine state.
For a project-local test, stop at that request and record the result.

## Observe the migration repair

This case requires a disposable fixture containing supported legacy authority;
an empty fresh-seed project does not exercise migration.

Expected progression:

```text
inspect: migration-required
→ migration plan: ready, nonempty changes, activation.required=true
→ returned migration apply --activate: applied
→ fresh inspect
→ ready OR the still-required collect-input/pending-asks
```

The migration action uses `runner-profile-migration-v3.mjs apply`; follow the
returned command rather than borrowing the portable-seed command shape.
A required question after activation must remain visible and stop the driver.
An optional handover action may remain for later. A changed migration plan
missing its apply action must report `outcome: "error"` and
`faultCode: "migration-action-missing"`.

`sourceCommittedLast` describes the filesystem migration transaction: it
writes `pipeline.user.yaml` after the generated runtime targets. It does not
assert a Git commit, publication or installed-plugin update.

## Record the result

Retain the tested commit/tree and build version, the exact invoked command,
sanitized JSON outcome, whether the project was fresh or a migration fixture,
and any still-required question. Exclude credentials and private project data.
Distinguish a completed readiness result from a correct pause for input.
The missing comparable runner measurement in D.6 remains an evidence
dependency; no cross-runner equivalence is claimed by this local test.
