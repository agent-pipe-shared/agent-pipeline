# Phase residual — gate integrity and residual closure

Required by the phase's own Definition of Done: "The residual is stated with
counts: what was deliberately left, and how much of it there is."

Written at candidate `7c24eae`, `sprint_phoenix`. Counts are measured, not
estimated; each is reproducible by the command or artifact named beside it.

---

## 1. Acceptance criteria: 11 stated, 10 satisfied, 1 partial

| criterion | state | evidence |
|---|---|---|
| AC-P1 verify exits 0, count stated | satisfied | `evidence/verify-latest.json`: 366 registered, 366 terminal receipts, `exitCode: 0` |
| AC-P2 unregistered suite makes verify non-zero, demonstrated | satisfied | `evidence/phx-acp2-demonstration.txt` — 0 → 2 → 0, tree byte-identical |
| **AC-P3 duplicate id, named, rather than thrown before planning** | **partial** | naming clause satisfied (`evidence/phx-acp3-name.txt`); pre-planning clause open — see §3 |
| AC-P4 no `§N` citation to the operating model in B3's 39 files | satisfied | repository search returns only the definition site and archival quotes |
| AC-P5 doc contracts exit 0, and observed non-zero on a deliberate break in the same files | satisfied | `evidence/phx-acp5-demonstration.txt` — break provoked inside `roles/elephant.md` |
| AC-P6 both authority tiers agree on `protectedTestPaths` | satisfied | `authority-tier-agreement-check` green inside the gate |
| AC-P7 H-AC-11 amended for GMW with the impossibility proof cited | satisfied | `acceptance.md:187-206` |
| AC-P8 `requirement` accepted, documented, one item reclassified | satisfied | validator, schema, template, `README.md`; two items carry the type |
| AC-P9 O-5 and P5 recorded as decisions with reasons | satisfied | `b98acaa`, `d3fd216` |
| AC-P10 every R1.1 batch independently revertible | satisfied | 14 batches defined in `evidence/verify-registration-patch.md:96` |
| AC-P11 the stage-0 definition has one site | satisfied | one hit, `roles/elephant.md:35` |

## 2. Review: 2 rounds of at most 4 used, 7 findings, 5 closed

| round | mode | findings | outcome |
|---|---|---|---|
| 1 | full, T1 | F1..F5 | FAIL |
| 2 | delta, T1 | F-A, F-B | FAIL |

Closed: **F2 (AC-P2 half), F3, F4, F5, F-B** — five.
Open: **F1** (not repairable) and **F-A** (needs one protected-path window) — two.

Two rounds remain available under the four-round cap.

## 3. What is deliberately left, with its size

**One acceptance clause, one window.** AC-P3's "rather than throwing before
planning" clause. A duplicate suite id still aborts the journal before any suite
runs, so `verify-suite-registration-check` cannot fire for the defect class it
was written for. Staged at
[`design/acp3-preplanning-patch.md`](design/acp3-preplanning-patch.md): about
twelve lines in a protected file, plus one shared export in an unprotected one.

**One lifecycle violation, unrepairable.** F1: five commits carrying production
changes with no `Dispatch:` trailer — `6686b16`, `ce75672`, `e7f6e96`,
`ddd1830`, `74346bf`. History is not rewritten in this repository and a revert
would be a second orchestrator-authored source commit, so the only available
disposition is disclosure. For `6686b16` the applied content was staged by
dispatched sessions and only its application was not; the other four have no
such artifact.

**Seven red suites, filed and not registered** (R1.2). Registering them would
turn the gate red on arrival. Each is a declared exclusion carrying reason,
owner and expiry, and the gate now refuses an exclusion that is malformed or
past its date. **All seven expire 2026-09-07**, matching the `due:` of the item
that owns them, so on 2026-09-08 the gate goes red unless that item closes or
both dates move together.

**Two citation classes untouched** (C9/C10): `docs/adr/**`, `specs/**`,
`backlog/**`. An ADR is a dated record; rewriting its basis line rewrites the
record.

**One census gap, found by the review and outside AC-P4's scope.**
`docs/deploy/README.md:8,23` carry live section citations and appear in neither
B3 inventory. The sweep is complete against its inventory; the inventory was not
complete against the repository. Filed.

**Four structural items this phase did not attempt**, each assigned elsewhere or
filed: the one-approval mechanism (Nova), a prose-citation lint, restructuring
the operating model, and the manifest's missing amendment field.

## 4. Backlog: 13 items filed on the final day, 36 dated retroactively

Thirteen items carry `created: 2026-08-08`. Six of them were written after the
reviews of that day and name defects this phase produced rather than found:
the report-early duty, EL-01's missing tripwire, the unclean-checkout class, the
reconciler's write-before-validate ordering, the manifest amendment gap, and the
B3 census gap.

Thirty-six previously undated items received a `due:` on the repository's
existing `created + 30` convention, because QG-06 counts an undated deferral as
a finding rather than a mitigation.

## 5. What the reviews explicitly did not cover

No pass is implied on any of this:

- Round 1 declared guardrails partially read, edge cases partial (no
  concurrency, no empty or huge ledger), security read-level only with no
  scanner run, and spec fidelity bounded to the reviewed range.
- The bytes matched by the 38 added gitleaks fingerprints were never read; their
  classification as false positives rests on fingerprint structure and
  coordinate alignment with the 38 ledger lines appended by `a368552`.
- No dispatch record exists for `PHX-INV-REFRESH`, `PHX-LEDGER-IGNORE` or
  `PHX-QG06-DUE`; those commits' authorship rests on their trailers alone.
- The three orchestrator-run break-proofs of `358c709` exist only as prose. The
  round-2 Critic independently reproduced the decisive one's substance, so the
  conclusion is verified even though the claimed runs are not.
