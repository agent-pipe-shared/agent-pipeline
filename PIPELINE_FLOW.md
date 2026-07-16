# Pipeline Flow

This document is a living explanatory projection of the pipeline. It is not an
authority and cannot grant permission, weaken a gate, or replace an active
artifact. If it conflicts with the [operating model](docs/operating-model.md),
the [current project manifest](.claude/pipeline.yaml) or
[calibration](.claude/pipeline.json), or the active PRD, Spec, or Result,
resolve the conflict in favor of those sources.

**Last reconciled:** 2026-07-16

The invariant across every path is **deterministic before semantic**: the
applicable machine gates must complete before a Critic performs semantic
review. Evidence supports a decision; it does not become decision authority.

## End-to-end flow

Optional phases drop out only when their declared trigger or calibration does
not apply. A failed branch does not silently become green; it enters bounded
recovery or stops at a course gate.

```mermaid
flowchart TD
    IDEA["Idea"] --> TRIAGE["Rigor and risk triage"]
    IDEA -.->|"optional"| DESIGN["Design pre-stage"]
    DESIGN --> TRIAGE
    TRIAGE --> PLAN{"PRD approval required? rigor >= 1 or risk high"}
    PLAN -->|"yes"| DOCS["Create PRD and Spec"]
    DOCS --> RCHECK{"Readiness check required or elected?"}
    RCHECK -->|"yes"| READY["Fresh readiness check"]
    READY -->|"gaps"| DOCS
    READY -->|"passed"| APPROVE["Mandatory PO PRD approval"]
    RCHECK -->|"no"| APPROVE
    APPROVE --> PREFLIGHT["Route, capacity, and authority preflight"]
    PLAN -->|"no"| PREFLIGHT
    PREFLIGHT --> GF["Fresh Goldfish"]
    GF --> WORK["Bounded work package"]
    WORK --> VERIFY["Stage 1 Verify"]
    VERIFY --> VOK{"Green machine evidence?"}
    VOK -->|"no"| RECOVERY["Bounded recovery"]
    VOK -->|"yes"| SECREQ{"Security phase declared?"}
    SECREQ -->|"no"| CTRIGGER{"Risk-based Critic required?"}
    SECREQ -->|"yes"| SECURITY["Security status: PASS, FINDINGS, SKIPPED, or ERROR"]
    SECURITY --> HONEST["SKIPPED is not PASS"]
    HONEST --> SOK{"Security disposition permits review?"}
    SOK -->|"no"| RECOVERY
    SOK -->|"yes"| CTRIGGER
    CTRIGGER -->|"no"| INTENT["Persist Result-first transition intent"]
    CTRIGGER -->|"yes"| CRITIC["Fresh risk-based Critic"]
    CRITIC --> FIX{"Semantic correction required?"}
    FIX -->|"yes"| CORRECT["Fresh semantic correction"]
    CORRECT --> DELTA["Independent delta re-gate"]
    DELTA --> DOK{"Delta re-gate green?"}
    DOK -->|"no"| RECOVERY
    DOK -->|"yes"| INTENT
    FIX -->|"no"| INTENT
    RECOVERY --> CONTINUE{"Bounded continuation authorized?"}
    CONTINUE -->|"yes"| PREFLIGHT
    CONTINUE -->|"no"| COURSE["PO course gate or stop"]
    COURSE -.->|"approved continuation"| PREFLIGHT
    INTENT --> STATE["Recoverable State CAS and matching receipt"]
    STATE --> SYNC["Complete retro and synchronize Result, State, handover, HISTORY, telemetry, and documentation"]
    SYNC --> BOUNDARY{"Calibrated target, ref, authority, and consent match?"}
    BOUNDARY -->|"no"| BLOCKED["Unfinished or blocked"]
    BOUNDARY -->|"yes"| COMMIT["Final commit: immutable delivery candidate"]
    COMMIT --> FINAL["Regenerate exact-commit Full Verify and required privacy/security evidence"]
    FINAL --> FOK{"Exact commit green?"}
    FOK -->|"no"| RECOVERY
    FOK -->|"yes"| IDENTITY{"Calibrated dedicated SSH account readback matches?"}
    IDENTITY -->|"no"| BLOCKED
    IDENTITY -->|"yes"| PUSH["Push exact OID to approved explicit feature branch"]
    PUSH --> FETCH["Fetch branch into fresh/disposable repository"]
    FETCH --> MATCH{"Fetched OID matches source OID?"}
    MATCH -->|"no"| BLOCKED
    MATCH -->|"yes"| CLOSE["No-mutation close"]
    CLOSE --> ACCEPT{"Human acceptance required?"}
    ACCEPT -->|"yes"| POACCEPT["PO accepts delivered result"]
    ACCEPT -->|"no"| PROMOTE{"Test-to-production promotion configured?"}
    POACCEPT --> PROMOTE
    PROMOTE -->|"yes"| TESTENV["Promote to test and verify"]
    TESTENV --> PRODAPPROVE["PO approves production promotion"]
    PRODAPPROVE --> PROD["Promote to production and record evidence"]
    PROD --> DONE["Post-delivery path complete; delivered candidate unchanged"]
    PROMOTE -->|"no"| DONE
```

PRD approval and readiness have independent triggers. PRD approval is mandatory
at rigor 1 or 2, or for risk class high. Readiness is mandatory for rigor 2,
architecture, guardrail, or core-contract packages, or risk class high;
otherwise the Elephant may elect it and it is recommended for multi-part waves.
Not electing an optional readiness check never bypasses a mandatory PRD approval.

When strict feature-branch delivery applies, all Result, State, close-artifact,
retro, and documentation synchronization is included in the final commit before
exact-commit evidence is regenerated. The order is final commit, Full Verify plus
required privacy/security evidence for that commit, calibrated `ssh -T
<sshHostAlias>` dedicated-account readback, push of that exact OID to the approved
explicit feature branch, fresh/disposable fetch-back and OID comparison, then
no-mutation close. The privacy evidence covers the complete newly reachable range
with the calibrated neutral Author/Committer, no-signature, and no-private-metadata
checks. A correction re-enters recovery and produces a new final commit and new
evidence; the verified candidate is never mutated in place or after verification.

`SKIPPED` records that a configured scanner did not run; it is never rewritten
as `PASS`. `ERROR` fails closed. Findings follow the thresholds and disposition
rules in the current manifest and calibration.

## Bounded recovery

Recovery is classified before another attempt. Product retries and environment
failover are separate budgets, and neither authorizes an open-ended loop.

```mermaid
flowchart TD
    FAILURE["Failure or Critic finding"] --> KIND{"Classified cause"}
    KIND -->|"closed product cause"| PRETRY{"Automatic product retry unused?"}
    PRETRY -->|"yes"| RETRY["One automatic product retry"]
    RETRY --> ROK{"Retry passes?"}
    ROK -->|"yes"| MACHINE["Return to deterministic gate"]
    ROK -->|"no"| COURSE["PO course gate"]
    PRETRY -->|"no"| COURSE
    KIND -->|"trusted environment fault"| EQUAL{"Qualifying fault before product work and failover unused?"}
    EQUAL -->|"yes"| FAILOVER["One narrow fresh failover; mayDelegate is false"]
    FAILOVER --> FOK{"Failover succeeds?"}
    FOK -->|"yes"| RESUME["Resume bounded work"]
    FOK -->|"no"| COURSE
    EQUAL -->|"no"| COURSE
    KIND -->|"semantic finding"| SBUDGET{"Fewer than 3 semantic rework cycles used?"}
    SBUDGET -->|"yes"| CORRECT["Fresh semantic correction starts next cycle"]
    CORRECT --> REGATE["Independent delta re-gate"]
    REGATE --> DOK{"Delta re-gate passes?"}
    DOK -->|"yes"| MACHINE
    DOK -->|"no"| SBUDGET
    SBUDGET -->|"no"| COURSE
    KIND -->|"unknown cause"| COURSE
    REPEAT["Repeated identical signature or exhausted budget"] --> COURSE
    COURSE --> DECIDE["PO chooses continue, change course, defer, or stop"]
```

The environment failover is allowed only for a trusted, qualifying fault before
product work. It freezes the authority bindings, narrows the task, and forbids
delegation. A second environment failure, an unproven cause, a repeated product
signature, or an exhausted budget goes directly to the course gate. There is no
third automatic product attempt. Each fresh semantic-correction dispatch consumes
one local rework cycle. At most three fresh local rework cycles are allowed per
task; only when a further correction would exceed that budget (>3) does the next
step become the PO course gate, never a fourth rework dispatch.

## Authority and evidence

Only the active PRD, Spec, and Result carry the task-level authority described
below. State is deliberately recoverable and bounded: it projects how to
continue, but it cannot redefine intent or the implementation contract.

```mermaid
flowchart LR
    PRD["PRD: product intent"] --> RESULT["Result: execution and delivery authority"]
    SPEC["Spec: implementation contract"] --> RESULT
    RESULT --> STATE["State: continuation projection only"]
    RECEIPTS["Receipts: evidence only"] -.->|"supports claims"| RESULT
    VERIFY["Verify and security output: evidence only"] -.->|"supports claims"| RESULT
    CRITIC["Critic reports: evidence only"] -.->|"supports claims"| RESULT
    MERMAID["Mermaid projections: evidence only"] -.->|"supports claims"| RESULT
    METRICS["Metrics and telemetry: evidence only"] -.->|"supports claims"| RESULT
```

The active PRD owns product intent and scope. The active Spec owns the
implementation contract and acceptance criteria. The active Result owns
recorded execution, course-decision, and delivery authority. Receipts, machine
verification, Critic findings, rendered flow projections, and metrics can prove
or challenge claims, but none can authorize work by itself.

## Gate reference

| Gate | Owner | Trigger | Pass condition | Failure disposition |
|---|---|---|---|---|
| Rigor and risk triage | Elephant | Every new item or material scope change | Rigor, risk, phase conditions, and required authority artifacts are explicit | Refine scope, use the optional design pre-stage, or create the required PRD and Spec |
| Spec readiness check | Fresh readiness reviewer | Mandatory for rigor 2, architecture/guardrail/core-contract packages, or risk class high; otherwise only when the Elephant elects it | A fresh reviewer finds the Spec understandable, implementable, and gap-free | Revise the Spec and repeat readiness, or stop before implementation dispatch |
| PO PRD approval | PO | Mandatory at rigor >= 1 or risk class high; a genuine rigor-0 fast path drops out | The PO explicitly says "approved" to the presented PRD and plan | Apply the change order and present again, or stop before implementation dispatch |
| Route, capacity, and authority preflight | Elephant and deterministic harness | Every fresh dispatch | Current authority digests, approved route, available reserved capacity, bounded scope, and non-delegation contract all match | Defer, select a pre-authorized route, repair authority, or open a course gate; do not dispatch |
| Stage 1 Verify | Goldfish and deterministic harness | Every implementation or correction candidate | The configured full machine chain is green and produced commit-bound evidence | Classify the failure; allow at most one qualifying product retry, otherwise course-gate it |
| Security | Deterministic security harness | The current manifest declares the phase | Required scanners report policy-acceptable status and exact-commit evidence; `SKIPPED` is not `PASS`, and `ERROR` fails closed | Correct findings, restore the scanner, or stop according to manifest thresholds and policy |
| Risk-based Critic | Fresh Critic; Elephant owns disposition | The rigor, risk, or diff trigger matrix requires semantic review | The independent review is complete and every admissible finding has a recorded disposition | Dispatch a fresh local semantic correction within the three-cycle budget, reject with recorded justification, or escalate to the PO |
| Independent delta re-gate | Fresh Critic; Elephant owns the gate | A semantic correction changes the reviewed candidate | The exact correction delta is independently reviewed against affected invariants and has no unresolved blocker | Re-correct only while fewer than three rework cycles have been used; after cycle 3, open the PO course gate because a further correction would exceed the budget |
| Course-decision transaction | PO selects; deterministic harness records | Repeated signature, unknown cause, exhausted budget, scope conflict, a correction need beyond three semantic rework cycles, or another recovery limit | Result-first intent, State CAS, and durable matching receipt agree on one idempotent transition | Recover the exact durable stage or remain blocked; never infer or replay a different choice |
| Final exact-commit Full Verify | Deterministic harness and Elephant | Documentation sync and the final commit are complete | Full Verify is regenerated and green for that exact commit, and all required privacy or security checks have policy-acceptable exact-commit dispositions, with `SKIPPED` remaining explicitly `SKIPPED` | Correct, synchronize, make a new final commit, and regenerate the applicable evidence; the candidate is not delivered |
| Delivery boundary | Elephant, with PO consent where required | Any push or externally effective action | Target, ref, authority, and consent match before the final commit; after exact-commit evidence, calibrated SSH identity readback matches before push | Perform no external action and report unfinished or blocked |
| Push and exact fetch-back | Deterministic harness and Elephant | The delivery contract requires a remote push | The approved exact OID is pushed to the approved explicit feature branch and a fresh/disposable fetch-back resolves to the same OID | Remain unfinished or blocked; never substitute another branch, merge, tag, or force operation |
| No-mutation close | Elephant and deterministic close checks | Exact fetch-back matches | Result, State, and documentation were synchronized in the final commit, and the candidate, authority bindings, and evidence have remained unchanged through verification, identity readback, push, fetch-back, and close | Re-enter at the earliest invalidated gate, make a new final commit, and regenerate affected evidence |
| Human acceptance | PO | Calibration or risk requires acceptance | The PO explicitly accepts the delivered result | Keep delivered and accepted states distinct; start a new candidate for rework, defer, or reject as directed |
| Test-to-production promotion | PO and project release adapter | A declared release phase requests promotion | Test evidence is green; production has explicit approval, rollback anchor, deploy evidence, and log entry | Stop or roll back under the project policy and keep the release incomplete |

## Maintenance contract

Update this file in the **same change** whenever any of the following changes:

- pipeline steps, names, or gate order;
- retry limits, course-gate conditions, or failover eligibility;
- phase activation conditions, including security, human acceptance, and release;
- evidence semantics, Result-first decisions, State recovery, or close rules;
- the delivery boundary, push and fetch-back contract, or release/promotion tail.

The same change must reconcile all three diagrams and the gate table, then
advance the reconciliation date. A stale diagram is evidence of documentation
drift, not an alternate process.
