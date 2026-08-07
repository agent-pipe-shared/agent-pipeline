---
schema: pipeline.backlog-item.v1
id: pipeline.seeded-verify-contract-is-always-green
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Greenfield onboarding handover from a parallel Claude session, 2026-08-08, finding 7 of 12."
---

# A new project's Verify contract is a whitespace check that can never fail meaningfully

## Description

Onboarding seeds `verify: "git diff --check"` into a new project's calibration.
That command checks for whitespace errors in a diff. It is the artifact the whole
Pipeline treats as the project's verification contract: the stop hook runs it,
Goldfish submission depends on it, the candidate binding is computed around it,
and a green result is what "verified" means everywhere downstream.

A brand-new project therefore reports a passing verify gate while having no tests
at all — and keeps reporting it after acquiring tests, until somebody notices and
replaces the seed by hand. The session that found this replaced it; nothing told
it to.

## Why a placeholder is the wrong shape here

A placeholder that fails would be an obvious prompt to fix it. A placeholder that
*passes* is indistinguishable from a real, satisfied contract, and it is
load-bearing in exactly the way a real one would be. Every artifact the Pipeline
produces about that project — evidence, receipts, gate results — is then
technically truthful and completely uninformative.

This is the same family as
`2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`: a gate that
reports success about something it never examined.

## Triggering situation

Greenfield onboarding with the Claude runner, 2026-08-07/08, against the local
`0.5.3+claude.20260807221336.14e7b97` build. The seeded value was observed
directly in the new project's calibration.

## Affected artifact

The onboarding seed that writes `verify` into a new project's calibration
(`project/pipeline.json`), in the onboarding/runtime initialisation path.

## Proposal

Not designed here. Candidates, and the first two are not exclusive:

1. **Seed a command that fails until configured**, with a message naming what to
   replace it with. An unconfigured project is then visibly unconfigured rather
   than falsely green. This inverts the current failure direction, which is the
   whole point.
2. **Make the kickoff ask for it.** The verification contract is a design input
   like the goal and the profile; a `feature`-profile kickoff that produces a
   PRD and a Spec can also produce the command that checks them.
3. **Detect the placeholder downstream** and refuse to record it as evidence of
   anything — so even a project that never fixes it cannot accumulate green
   receipts that mean nothing.

Whatever is chosen, the same question applies to any other seeded value the
Pipeline later treats as authority. This item is one instance; the pattern is
"a default that is indistinguishable from a decision".

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
