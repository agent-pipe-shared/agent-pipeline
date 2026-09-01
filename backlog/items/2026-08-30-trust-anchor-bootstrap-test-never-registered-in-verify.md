---
schema: pipeline.backlog-item.v1
id: pipeline.trust-anchor-bootstrap-test-never-registered-in-verify
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_commit: 7660b30bde221c1a40c9ac27a0e8ede733b79bda
closure_repository: "self"
closure_evidence: harness/scripts/verify.mjs
done_when: contains harness/scripts/verify.mjs pre-commit-hook-install-trust-anchor-bootstrap-tests
created: 2026-08-30
sprint: nova-b
tracking: "Nova B — pre-existing gap found while registering an unrelated verify.mjs suite; not introduced by this session's own work."
source: "Found by check-verify-suite-registration.mjs while preparing the TP-3 ceremony for NVA-CF-RESUMECHECKANYSESSION's own verify.mjs registration, 2026-08-30."
---

# `pre-commit-hook-install.trust-anchor-bootstrap.test.mjs` exists but was never registered in `verify.mjs`

## What happened

`node harness/scripts/check-verify-suite-registration.mjs` reports:

```
UNREGISTERED plugins/pipeline-core/scripts/pre-commit-hook-install.trust-anchor-bootstrap.test.mjs
is a *.test.mjs suite under a registered root with no verify.mjs registration entry
```

This test file was added by `NVA-CF-TRUSTANCHOR-TOFU` (closed 2026-08-30,
commit `6876ba53`), exercising the trust-anchor bootstrap exemption in
`pre-commit-hook-install.mjs`. It passed standalone and was independently
re-verified by the Elephant at closure time, but nobody ran
`check-verify-suite-registration.mjs` against the repository at that point
-- the exact class of gap this checker exists to catch (a suite that exists
and passes but never actually runs in the gate).

Found incidentally, not by this session's own work: while preparing the
TP-3 signed-override ceremony to register an UNRELATED new suite
(`resume-consumption-check`, `2026-08-29-mechanical-proof-of-complete-prior-
input-consumption-across-restart.md` Stage 3) into `verify.mjs`, running the
registration checker surfaced this pre-existing, independent gap. Left
unfixed in that same commit deliberately -- the armed TP-3 override
capability was bound to one exact byte-identical edit; bundling an unrelated
second edit into it was out of scope for that ceremony.

## Proposal

Add one line to `harness/scripts/verify.mjs`'s `TEST_SUITES` array,
registering `pre-commit-hook-install.trust-anchor-bootstrap.test.mjs`,
mirroring every other `*-tests` entry's shape. This needs its own TP-3
signed-override ceremony (a fresh `plan`/`prepare-authorization`/
`emit-signature-digest`/`authorize-by-signature` chain, a fresh PO
signature) -- the ceremony armed for the resume-consumption registration
does not cover this edit.

## Acceptance criteria

- `node harness/scripts/check-verify-suite-registration.mjs` reports zero
  unregistered suites.
- `node --test plugins/pipeline-core/scripts/pre-commit-hook-install.trust-anchor-bootstrap.test.mjs`
  still passes (6/6 per its own closure evidence), now actually exercised
  by a real `verify.mjs` run, not just standalone.

## Triage

- **Decision:** accepted, Nova B
- **Rationale:** real gate-coverage gap, but not urgent/blocking -- the
  suite itself already passes standalone and was independently re-verified
  at its own closure; this is about making it actually run in the gate,
  not about a suspected regression.
- **Date:** 2026-08-30

## Closed, 2026-09-01 — registered, and observed running in the gate

`harness/scripts/verify.mjs:752` registers
`pre-commit-hook-install-trust-anchor-bootstrap-tests` against
`plugins/pipeline-core/scripts/pre-commit-hook-install.trust-anchor-bootstrap.test.mjs`,
added by commit `7660b30b` ("test(pipeline): register greenfield regressions").

Verified in both directions rather than from the registration line alone, since
this item is specifically about a suite that exists and passes without running
in the gate — a registration entry is exactly the kind of evidence that can look
sufficient and not be. The suite ran in the full verify at `0f0ed3f7` and
reported `pre-commit-hook-install-trust-anchor-bootstrap-tests=0` among the 505
steps, every one of them fresh (`reused: 0`). So it is registered AND observed
executing, which is what the item asked for.
`check-verify-suite-registration.mjs` reports zero unregistered suites.

The item is retro-declared with a `done_when` naming the registration entry, so
the record carries a falsifiable predicate rather than closing on prose alone.

Noted for whoever reads this later: the item was resolved by a commit that did
not reference it, and stayed open until a mechanical predicate check surfaced
it. That is the same shape as
`pipeline.resolved-backlog-items-can-keep-status-open-indefinitely`, and this is
a further occurrence of it.
