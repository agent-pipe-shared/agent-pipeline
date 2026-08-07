# Release 0.6.0 readiness — local repair candidate

> Agent-Pipeline · Sprint Nova · as of 2026-08-07

A decision aid for the PO, not a status report. For every item it states whether
the candidate is ready and on what evidence. Everything here is read from
`docs/state.md`'s 2026-08-07 sections, ADR-0056/0058/0059, the gate evidence
files, and direct invocation — nothing is asserted from memory.

`VERSION` reads `0.6.0`; the plugin manifest reads
`0.6.0+claude.20260807172706.a52ff69`, where the OID is the last functional
commit of the wave, per the convention in
[`claude-local-plugin-development.md`](claude-local-plugin-development.md).
Branch `feat/sprint-nova-codex-v046`. Not on `main`; no tag exists; nothing is
pushed.

**This is a MINOR bump, not a patch.** 0.5.2 → 0.6.0 because the candidate adds
a capability rather than only repairing one: a signed admission path for the
Human Guard Override (ADR-0059 Decision 1) that did not exist before.

## Scope: what this candidate repairs

The PO's framing was a repair candidate for the GMW/HGO module and onboarding.
Both halves are present.

**Human authorization is now uniformly liftable.** Before this candidate, a
guard that blocked an agent either had a lift route or it did not, with no
governing principle — and several load-bearing ones did not. Now:

| Denial | Before | Now |
| --- | --- | --- |
| `GS-1..GS-5`, `GS-7` (gate-strength paths) | no in-session lift at all | HGO, signature or chat per committed mode (`503fe0d`) |
| `GS-6` (live plugin root) | GMW only | unchanged, deliberately (ADR-0058) |
| `TP-*` (protected test paths) | GMW only | GMW **and** HGO (`f650164`) |
| `GUARD-PARSE-UNSUPPORTED` / `-OPERATOR-` / `-REDIRECT-` | no lift at all | HGO, exact-command-bound (`bae3c1a`, scoped by `a52ff69`) |
| `GUARD-CROSS-REPO-MUTATION` | no lift | unchanged, deliberately (ADR-0059 Decision 5) |
| `GUARD-LIFECYCLE-NOT-READY` | no lift | unchanged, deliberately (ADR-0059 Decision 5) |

**Every signature is now preceded by an explicit confirmation.** `approve`,
`approve-critical` and `sign-intent` print what is being authorized and require
the literal token `approve` before OpenSSL is invoked (`5efb0f1`, `584a598`).
Previously the passphrase prompt was the only act of consent, and a passphrase
attests who you are, not what you agreed to.

**Onboarding no longer offers a Codex launcher to a non-Codex session.**
`restartAction()` receives the runner identity its caller already holds
(`5efb0f1`).

**`sign-intent` exists at all** (`2365a8c`) — before it, GMW's `guard-lift`
intent kind had no signing path, which made the documented flow unexecutable.

## Ready, with evidence

**Verify: 255/255 registered suites, 255 terminal receipts, on candidate
`a52ff69`.** `evidence/verify-latest.json`. `security-scan` exit 0.

**Targeted suites, re-run independently by the orchestrator rather than
accepted from dispatch self-reports:** `guard-lifecycle-ready.test.mjs` 38/38,
`human-guard-override.test.mjs` 23/23, `po-human-approval.test.mjs` 5/5,
`threat-model-approval-request.test.mjs` 36/36,
`project-onboarding-v3.test.mjs` 91/91, `check-backlog-state.mjs` valid,
`check-doc-contracts.mjs` 447 files / 719 links valid.

## Not ready: three things, stated plainly

**1. Verify does not reach exit 0.** One suite fails:
`guard-testpath-override-tests`, five cases. All five share one cause — the
file pins the pre-Decision-3 assertion `no in-session override is admitted`,
which Decision 3 deliberately replaced. The guard is behaving correctly and the
test describes the old contract. It cannot be corrected in-session because the
file is itself a protected test path (TP-7).

**2. `503fe0d` shipped with no test coverage whatsoever.** The GS-1..5/7 lift
is the most security-sensitive change in this candidate, and its suite
(`guard-gate-strength.test.mjs`) is TP-6-protected, so the implementing
dispatch could not extend it. Its evidence today is review, not execution.
This is the single strongest argument against treating this candidate as
release-ready rather than repair-ready.

**3. No independent Critic round has run on this candidate.** ADR-0059's
implementation is guardrail-tier and the matrix makes a T1 review mandatory.
The prepared dispatch is ready but has no green candidate to review yet.

Items 1 and 2 are unblocked by one PO signature; item 3 follows them.

## What the PO must do, in order

**Step 1 — sign the maintenance window.** Digest, scope `TP-2,TP-6,TP-7`, 3h:

```sh
node plugins/pipeline-core/scripts/po-human-approval.mjs sign-intent \
  --repo-root . --directory "$PO_DIR" --intent-sha256 "$INTENT_SHA256"
```

The digest is in `evidence/gmw-request.json` under `intent.sha256`; the
confirmation prompt will name it back to you before the passphrase — compare
the two. Then:

```sh
node plugins/pipeline-core/scripts/guard-maintenance-window.mjs install \
  --repo-root . --request evidence/gmw-request.json --proof "$PO_DIR/proof-manual.json"
```

The request binds a candidate commit and opening tree, so it is invalidated by
any further commit; it is re-prepared as the last act before each handover.

**Step 2 — the three test files get written, Verify re-runs, the Critic round
runs.** Agent work, no further human step.

**Step 3 — refresh the local build.** Operator-only by construction: an agent
session may not write into the plugin root enforcing its own guards, and
`guard-lifecycle-ready.mjs` refuses `GUARD-CROSS-REPO-MUTATION` for exactly
that reason.

```sh
cp -a <checkout-root>/plugins/pipeline-core <local-marketplace-root>/plugins/
claude plugin update pipeline-core@agent-pipeline-local --scope user
```

For a directory-sourced local marketplace, `/reload-plugins` suffices for guard
scripts (re-read per invocation); a change to `hooks.json` wiring needs a new
session. This candidate does not change `hooks.json`.

**Readback before trusting it:** `claude plugin list --json` shows
`0.6.0+claude.20260807172706.a52ff69` at `scope: "user"`, and
`pipeline-start-preflight.mjs` returns `status: "ready"` with
`installedSource: "local-development"`. A `plugin-refresh-required` there means
manifest and registry disagree.

## Known weaknesses, stated rather than smoothed

**The confirmation prompt is English-only.** It does not follow
`runtime.humanFacingLanguage`, which the PO's request named explicitly. Tracked
as [`pipeline.human-authorization-prompts-ignore-the-configured-language-profile`](../backlog/items/2026-08-07-human-authorization-prompts-ignore-the-configured-language-profile.md).

**An absent `--runner` still resolves silently to Codex.** Two bounded tasks
have now reverted the same correction for the same reason; it needs a decision,
not a third attempt. Tracked as
[`pipeline.absent-runner-flag-silently-defaults-to-codex`](../backlog/items/2026-08-07-absent-runner-flag-silently-defaults-to-codex.md).

**One commit's `Dispatch:` trailer is not complete provenance.** `5efb0f1`
carries production changes from two dispatches because concurrent dispatches
share one checkout index. Disclosed by the dispatch itself, recorded rather
than rewritten. Tracked as
[`pipeline.parallel-goldfish-dispatches-race-on-shared-checkout`](../backlog/items/2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md).

**The session scratchpad is unusable under the guard.** The harness assigns a
directory outside the repository; `GUARD-CROSS-REPO-MUTATION` forbids writing
there and is deliberately outside HGO's authority. Not a defect in that
decision, but an unrecorded contradiction between the harness contract and the
guard. Not yet tracked.

**A grammar denial outside the repository root offered no override route.**
Observed once in this session on an `rg`-to-`head` diagnostic against a path
outside the root: the denial appeared without the new next-step block. Not yet
diagnosed; belongs in the Critic round's input for `bae3c1a`/`a52ff69`.

## Explicitly not in this candidate

- No push, no tag, no publication. `gates.push_approval` is `signature` and no
  push approval has been requested.
- No change to `hooks.json` wiring, so no session restart is required for guard
  scripts.
- No Claude-native restart launcher — the onboarding fix stops the wrong
  launcher being offered; it does not provide a right one.
- No change to GS-6 or to the cross-repository boundary.
