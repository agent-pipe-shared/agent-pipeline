# Pending Verify registrations

> **Status 2026-08-09 (second revision).** **Two suites are pending** — see the
> next section. Everything below that is a worked record, in the past tense.
>
> The banner said "Nothing is pending" for most of 2026-08-09 while two suites
> sat unregistered in the table underneath, added after the batch they were
> filed with had been resolved. That is the same defect this banner was
> corrected for earlier the same day, in the opposite direction: the first
> version left "pending" on resolved work, this one left "resolved" on pending
> work. The rule stands and is now applied: the pending section goes first and
> says so in its heading; a resolved section never keeps that word.

## PENDING — two suites are written, green, and not run by the gate

`plugins/pipeline-core/scripts/repair-map.test.mjs` (REPAIRMAP-1) and
`harness/scripts/generate-agent-obligations.test.mjs` (OBLIG-1) are **not** in
`TEST_SUITES`. Confirmed by reading `harness/scripts/verify.mjs`, not by
recalling the batch: neither name appears in it.

Both pass on their own, run 2026-08-09 at `f1645a4d`:

```
node plugins/pipeline-core/scripts/repair-map.test.mjs          # 7/7, exit 0
node harness/scripts/generate-agent-obligations.test.mjs        # 9/9, exit 0
```

They cover the two halves of the same route. The map answers, at runtime, which
refusals can be lifted and by whom; the obligations contract keeps the document
that sends every dispatched agent to that map honest — including `AC-9`, which
drives the command the document prints through the real lifecycle guard. A
regression in either is invisible to Verify today.

**The human step**, unchanged in shape from the batch below and already prepared:

```
node harness/scripts/apply-pending-protected-edits.mjs --check   # dry run, writes nothing
node harness/scripts/apply-pending-protected-edits.mjs --only=verify
```

The dry run reports exactly these two registrations and nothing else. The tool
refuses on a missing or ambiguous anchor, runs each newly registered suite after
writing, and restores the original bytes if one does not pass. It does not
commit.

Its `VERIFY_ANCHOR` was re-pointed for this batch. It had gone stale the moment
the 2026-08-08 batch landed — `nova-verify-journal-tests` stopped being the last
entry — so the next operator run would have aborted on a missing anchor. Correct
behaviour, and unusable until someone looked.

## Resolved 2026-08-09 — the reference-path check

`harness/scripts/check-reference-paths.test.mjs` and the gate it covers,
`harness/scripts/check-reference-paths.mjs` (`9b7c3c2`), are registered in
`harness/scripts/verify.mjs` as `reference-path-tests` and
`reference-path-check`. Getting there needed a fresh signed maintenance window
under the same TP-3 constraint described below, because the one opened for the
GF-057 batch had expired at 2026-08-09T01:56Z.

The gate can still be run on its own:

```
node harness/scripts/check-reference-paths.mjs
```

It exits 0 at HEAD. Against `ac6ca88` it exits 2 and names the two references a
script relocation had left pointing at deleted paths — the reason it exists.

One property of its green is worth carrying: it classifies `specs/`, `backlog/`,
`evidence/`, `docs/spec-archive/` and `docs/state.md` as record surfaces and
skips them, and it skips `*.test.mjs`. On those paths its green is exclusion,
not inspection. The gate prints all ten of its own blind spots on every run
rather than leaving them to be rediscovered.

## Resolved 2026-08-08 — the GF-057 batch

Both steps were applied by the PO with
`harness/scripts/apply-pending-protected-edits.mjs` and committed: the seven
`TEST_SUITES` entries in `verify.mjs`, and `GST33`–`GST36` plus the `GST14`
title repair in `guard-gate-strength.test.mjs` (32 → **36 passed, 0 failed**).

The rest of this file is kept because the *reasoning* — why an agent session
cannot do this, and which guard refuses on which grounds — is the durable part,
and the same situation recurs every time a block writes a suite. It did again on
2026-08-09.

The suites listed below **were** unregistered when this file was written, and
therefore did not run under Verify at that time. They do now.

## Why they are pending rather than registered

`project/guard-config.json` TP-3 protects `harness/scripts/verify.mjs`, and the
override that clears it follows the push-approval mode
(`guard-testpath.mjs:255`), which is `signature` in this repository. The
signature binds to a `--request-sha256` computed from the exact command, so it
cannot be pre-authorized before the final edit exists, and it cannot be
amortized across several registrations unless they are batched into one edit.

Both obvious workarounds were considered and rejected during the block: switching
the push-approval mode weakens the *push* gate to clear a *test-path* one, and
removing TP-3 drops the protection on the verify script while dispatches run
unattended. The gap itself is filed as
[`backlog/items/2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md`](../backlog/items/2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md).

This file lives under `docs/` rather than `evidence/` deliberately: `evidence/`
is covered by an over-broad ignore rule
([filed here](../backlog/items/2026-08-08-an-over-broad-ignore-rule-swallows-the-closure-evidence-the-gate-demands.md)),
so a handover artifact placed there does not survive the block that produced it.

## The human step (as it was carried out on 2026-08-08)

Both edits — the registrations here and the `guard-gate-strength` content below
— were applied by one operator script:

```
node harness/scripts/apply-pending-protected-edits.mjs --check     # dry run, writes nothing
node harness/scripts/apply-pending-protected-edits.mjs --preview   # runs the transformed suite from a removed sibling
node harness/scripts/apply-pending-protected-edits.mjs             # apply both steps
```

It refuses before writing a byte if any insertion anchor is missing or occurs
more than once, it skips a step already applied, and after writing it runs the
affected suite and **restores the original bytes if that suite does not reach
its expected result** — so neither protected file can be left half-applied. It
does not commit; reviewing with `git diff` and committing stays with you.

The `--preview` mode has already been run here and reached
`guard-gate-strength: 36 passed, 0 failed` without touching the protected file,
so the paste is proven before you apply it rather than after.

Doing it by hand instead is equally fine: add one `TEST_SUITES` entry per suite
below, then commit. A human editing their own repository's file needs no
ceremony; the signed-override route is available if the ceremony is wanted for
the record.

Until that happens, each suite has been run individually by the Elephant and its
result recorded in the block's evidence — "not registered" here means "not run by
the gate", never "not run".

## The suites

| Suite | Block | What it covers |
|---|---|---|
| `plugins/pipeline-core/lib/machine-plane.test.mjs` | SETUP-2b | The machine-scoped configuration store: three-valued reader, exact key set, the enforced zero-overlap rule against the repository plane, atomic validating writer. 22 tests. |
| `harness/scripts/check-consumer-safe-paths.test.mjs` | CB-1b | The gate that fails when a shipped artifact under `plugins/pipeline-core/` names a path only this repository has. 9 tests; the gate itself sweeps 755 tracked files against 46 reasoned allowlist entries and reports unused ones. |
| `plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs` | CB-2 | The `pipeline.verify-evidence.v0` producer that had a schema and consumers but no producer, including a test that feeds its output through the real, unmodified `publication-gate-evidence.mjs`. 6 tests. |
| `plugins/pipeline-core/hooks/guard-lifecycle-recovery-contract.test.mjs` | C1/C3 | The missing test level itself: that a recovery action the onboarding inspection prescribes is one the lifecycle guard admits. Drives the real dependency-injected inspection into the real guard and enumerates the real producing table. 2 tests — small, and it found a live defect on its first run (five of six offered rebind codes were refused). |
| `plugins/pipeline-core/scripts/pipeline-state-inspection-contract.test.mjs` | R1B | Drives the real `run()` from `pipeline-state.mjs` and the real `classifyOnboardingContinuity` against each other for the feature-lifecycle boundary subcommands (`set-feature`, `close-feature`, `discard-feature`), asserting the classification is `valid`. 3 tests — it caught the `discard-feature` classification gap this block fixes: RED before the fix (evidence: `evidence/r1b-contract-red-before.txt`), green after (evidence: `evidence/r1b-inspection-contract.txt`). |
| `plugins/pipeline-core/scripts/project-reset.test.mjs` | R2A | The read-only `plan` step of the typed project reset (`project-reset.mjs`): derives the three closed sets (`remove`/`keep`/`neverTouched`) from the resolved authority tier and parsed calibration, never a hardcoded path. 13 tests, including tier/`calibration.handover` derivation, byte-for-byte read-only proof over a ready and a damaged/non-ready project, digest determinism, and three distinct fail-closed refusals. Evidence: `evidence/r2a-project-reset.txt`. |

The two later additions to this table — `repair-map.test.mjs` (REPAIRMAP-1) and
`generate-agent-obligations.test.mjs` (OBLIG-1) — were appended here after this
section was already marked resolved, and are **still pending**. They are
described in the PENDING section at the top of this file, which is where a
reader should look for them.

Note that `plugins/pipeline-core/scripts/po-human-approval.test.mjs` was found
during SETUP-2b to be unregistered as well — a pre-existing gap, not created by
this block. It covers the human authority chain. Worth adding in the same pass.

## A second human step, same shape, different guard

C2 produced four checks (`GST33`–`GST36`) plus a title repair for `GST14` that
belong in `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs`. That file
is `TP-6`-protected — it gates GS-1..GS-7, the rules that stop an agent
weakening the gate that authorizes it — so no agent can apply them. Unlike TP-3
above, the override does not merely need a signature: because the target is
Pipeline plugin source in a source checkout, `recordHumanGuardDenial()` returns
`author-repair-required` rather than `planned`
(`lib/human-guard-override.mjs:1466`), and author repair needs an author source
root a guard will not choose on a human's behalf. There is no in-session route.

The content was **validated, not merely drafted**, before it was applied: the
identical check logic was run standalone against the real committed guard
(`ce1a741`) and passed 4/4, including the case where a vendored copy of the
exempt script at the same relative path under a different root is correctly
*not* exempt. What was missing was the paste, not the proof.

It was applied and committed on 2026-08-08 —
`node plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` reports 36
passed / 0 failed (baseline before: 32). The paste-ready draft that carried the
payload was retired on 2026-08-09; `harness/scripts/apply-pending-protected-edits.mjs`
holds the only surviving copy, which is what applied it.

This is the third confirmed instance in two blocks of `guard-testpath` blocking
a dispatch's explicitly briefed, in-scope test edit and offering no route the
session can take — filed as
[`backlog/items/2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route.md`](../backlog/items/2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route.md).
