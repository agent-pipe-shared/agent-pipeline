---
schema: pipeline.backlog-item.v1
id: pipeline.a-change-creates-an-obligation-elsewhere-that-only-a-gate-run-reveals
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-04
closure_repository: self
closure_commit: a64b09eafb3986ae1259806f01d7321b638897e2
closure_evidence: backlog/evidence/2026-09-04-nova-b-batch-3-closure-verification.md
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "scratch/release-flow-self-invalidation-2026-09-01.md (loop 4)."
---

# A change creates an obligation elsewhere that only a gate run reveals

## The pattern

A change at point A silently creates an obligation at point B, and today the
only thing that surfaces the omission is a full gate run. Four instances
measured on 2026-09-01, each costing a full ~13-minute `verify.mjs` run to
surface a one-line omission:

- the vendored canon copy, after a `guardrails/`/`templates/` edit;
- `DYNAMIC_IMPORT_EDGES` in the kernel-closure test, after a new dynamic
  import;
- the observation-governance documentation inventory, after a new ADR;
- the reference-path `ALLOWLIST`, after untracking a file an entry pointed
  at.

## Direction

The checkers that find this class of omission — vendored-canon generation,
reference paths, ADR classification, kernel edges, doc contracts, suite
registration — all run in seconds on their own. Placing them behind 505
suites is the waste: a fast pre-gate running only those checks after every
commit turns thirteen minutes of gate time into roughly eight seconds; the
expensive suites still run once, at the end, rather than being the mechanism
that first reveals a one-line omission.

## Note

This item is the general pattern behind the four instances above. A prior
handover recorded the same shape as unfiled.

## Closure

Closed 2026-09-04 against `a64b09eafb3986ae1259806f01d7321b638897e2`
(NVA-B-PREGATE-1). Verification is in
`backlog/evidence/2026-09-04-nova-b-batch-3-closure-verification.md`.

`harness/scripts/pre-gate.mjs` runs exactly the six checkers named in the
Direction above and measures 4.147 s against the ~13-minute gate — half the
estimate. `node --test harness/scripts/pre-gate.test.mjs` passes 5/5.

Two properties decided whether this was worth having, and both were established
by running rather than by reading the report:

- **It cannot silently drift from the gate.** Its first test parses
  `harness/scripts/verify.mjs`'s own source and asserts every pre-gate entry is
  still registered there. A pre-gate holding its own copy of the list would
  eventually disagree with the gate, which is worse than having none.
- **It repairs nothing.** Confirmed by source read of the script and all six
  checkers. A pre-gate that silently regenerated the vendored copy would remove
  the signal it exists to give.

`pre-gate.mjs` currently exits 1, on one cause: two genuinely unregistered test
suites, both waiting on the TP-3 signature ceremony that `verify.mjs` requires.
Both lines are staged in
`backlog/evidence/2026-09-03-suite-registration-ceremony-package.md`. Until that
window runs it is adoptable as a per-check report rather than a clean exit-code
gate — which does not affect this closure, because the item asked for the fast
signal and the fast signal exists.

Whether this becomes automatic — a pre-commit hook, or wired into CI — was
deliberately left undecided; the deliverable is the command.
