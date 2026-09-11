# Required `done_when` enforcement evidence

Date: 2026-09-11

Before graduation, the live checker reported 654 items, zero malformed, zero
stale-open, zero regression, and zero undeclared `open`/`in_progress` items.
This establishes the campaign prerequisite recorded in the item's PO decision.

The focused synthetic suite passes after graduation and covers fatal
`UNDECLARED` for an open item, plus the preserved non-fatal counting of
undeclared rejected and deferred items. The live checker then reports only the
expected `STALE-OPEN` finding for the item whose own predicate is satisfied by
this implementation; closing that resolved item removes the finding.

Candidate-exact Verify run `verify-1789114798909-4b55af0a0bd8280c` passed
520/520 registered suites for commit
`b590a6929233984a73ee24b042460ce6b2e8efe9`, tree
`764fe803573a692578dfcedb80bd6a6ff4a431a5`, with clean start and finish
bindings. The run used the supported `PIPELINE_VERIFY_CONCURRENCY=2`
calibration after two higher-concurrency attempts ended without terminal
evidence; no failed suite was reused or treated as a pass.

The independent Critic reviewed
`c9e270dfeca4da7d4e365a36422c354d9673974d..b590a6929233984a73ee24b042460ce6b2e8efe9`
under `functional-equivalent-read-only; OS isolation not asserted` and returned
**PASS with no findings**. It explicitly cleared all six review criteria,
reachability, failure paths, test integrity, governance, security, dependencies,
language, and the evidence trajectory.
