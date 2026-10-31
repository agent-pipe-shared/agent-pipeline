---
schema: pipeline.backlog-item.v1
id: pipeline.residual-acceptance-cannot-close-an-uncorrectable-major
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-10-31
sprint: alfred
source: "Toolbox finding N45 (2026-10-31) and PO decision D227: a live feature has a Critic major that concerns commit trailers of past commits and cannot be corrected by a commit."
---

# A Critic major about past authorship has no sanctioned way to be closed

## What happened

A consumer round on an already live feature ended FAIL with one major: `Dispatch: stage-0 (elephant)` trailers on commits that violate the
conjunctive stage-0 criterion (file count, risk zone, calibration change). The commits cannot be corrected (authorship of past commits; history
rewrite is forbidden), and the residual acceptance only takes minor findings.

## Cause (code evidence)

`lib/critical-action-authorization-read.mjs` line 216: `residualSeverityRefused` refuses every finding whose severity is not `minor`; the comment
at line 220 says a major or blocker is "refused here, never accepted". `lib/critic-verify-readiness-read.mjs` (N22) builds the private record for
minor findings only. There is no verb or waiver for an uncorrectable major.

## PO decision D227 (2026-10-31, tile "rest acceptance with a class")

The existing residual acceptance takes a MAJOR finding only when the signed acceptance names a reason class
`uncorrectable-past-authorship`; a blocker stays refused; the close marks the acceptance visibly. Smallest change, same signature route as
today.

## Work

A kernel slice (deep Goldfish): the class field in the signed intent and the private record, the severity check keyed on it, the close
projection and the refusal text naming the class, tests with a revert proof, a chain run through accept, approve and close. Candidate 15b.
