---
schema: "pipeline.backlog-item.v1"
id: "pipeline.t1-governance-path-preflight"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "0b5544f1150ed9788e2e391c42cc328e9ee87c3c"
closure_evidence: "backlog/items/2026-07-19-t1-governance-path-preflight.md"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.t1-governance-path-preflight

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real: `specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.t1-governance-path-preflight` — "open, partial";
governance-packet and writer-preflight code exists
(`plugins/pipeline-core/lib/critic-packet-governance.mjs`,
`workflow-writer-preflight.mjs`, `scripts/critic-packet-preflight.mjs`
+ tests) but "path/ETA/tool-setup disposition" is incomplete. Remaining
sanctioned gate: "specify, register, and prove remaining T1 ACs, then
close."

**Decision:** accepted, ownership moved to Nova/pipeline. Dispatched —
this gate is AC-mapping/registration work, not bound to the final
release candidate, so it can run now rather than waiting for the
candidate freeze. **Assignment:** `NVA-T1GOVPREFLIGHT-1`
(goldfish-implementor), dispatched 2026-08-18. **Date:** 2026-08-18

### Dispatch result, 2026-08-18 — clause 1 proven closed; clause 2 stopped clean on a real design gap

`NVA-T1GOVPREFLIGHT-1` mapped the AC's two clauses. **Clause 1**
("packets include governance paths") is fully proven:
`critic-packet-governance.mjs`'s `deriveCriticPacketGovernance`/
`buildPacket` derives and fails closed on governance paths;
`critic-packet-preflight.mjs` embeds the result into every packet and
re-validates it before every claim/result/consume; covered end-to-end
by `CPG01/CPG02/CPG05/CPG06` and `CPP01`. All three suites green
(7/7, 58/58, 6/6) before any change — no code was touched.

**Clause 2** ("an honest gate ETA or `unknown`") correctly triggered a
stop rather than a guess: the three named T1 modules and their tests
have zero ETA/gate vocabulary, and the packet schema
(`PACKET_SCHEMA`) has no ETA-shaped field to omit or fabricate — there
is nothing to fail closed on. The "honest ETA or typed-unknown"
PATTERN this AC describes does exist elsewhere
(`lib/continuity-status.mjs`'s `gateEta`/`sourcedEta()`/
`unknownEta()`), but that module is a different subsystem (continuity/
resume status), out of this dispatch's scope. Genuinely unclear
without a design ruling: should the T1 packet schema gain a new
`gateEta` field sourced from `continuity-status.mjs`, or is this AC's
"gate ETA" wording stale relative to the current T1 packet
architecture?

**Status stays `in_progress`, not closed.** Needs a design decision
before further dispatch: either specify the `gateEta` wiring point (T1
packet schema ← `continuity-status.mjs`) or formally reword/retire the
AC's second clause. Queued, unassigned.

### PO-decision implementation, 2026-08-18 (wave 3, dispatch NVA-W3-12)

PO decision #18 resolved the design question raised above as **option
B**: retire/reword the stale "gate ETA" AC wording rather than build a
new `gateEta` field. Implemented as a pure spec/acceptance-text edit,
no code change:

- `specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md` —
  reworded the "Required outcomes" bullet that carried the actual AC
  clause 2 text ("T1 packets include governance paths and an honest
  gate ETA or `unknown`.") to state that T1 packets include governance
  paths and fail closed when governance context cannot be derived, and
  that the packet schema carries no gate-ETA field, so the original
  "honest gate ETA or `unknown`" clause is retired as stale.
- `specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
  — reworded the `pipeline.t1-governance-path-preflight` row's "Current
  AC assessment" and "Remaining sanctioned gate" columns to record
  clause 1 (governance paths) as proven closed (`CPG01/CPG02/CPG05/
  CPG06`, `CPP01` green, no code changed) and clause 2 (gate ETA) as
  retired by this decision, leaving only the remaining tool-setup AC as
  the sanctioned gate.

**Evidence (re-run, unchanged from the prior dispatch, confirming the
doc-only edit did not regress anything):** `node --test
plugins/pipeline-core/lib/critic-packet-governance.test.mjs` (7/7
pass), `node --test
plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs` (6/6
pass), `node --test
plugins/pipeline-core/lib/workflow-writer-preflight.test.mjs` (58/58
pass).

**Deliberately not touched (scoping judgment call):** `spec.md`'s
"Starting reconciliation classification" table (line ~203, explicitly
framed as "a design hypothesis to be proven in SNT-7, not closure
evidence") and the German `non-windows-close-preparation.md`
close-prep row also restate "path/ETA/tool-setup" style language, but
both are historical/preparatory snapshots rather than live AC or
acceptance text; rewriting them risked silently editing frozen
historical records outside what PO decision #18 named ("the T1 packet
spec/acceptance text"). The `prd_sentinel-epic.md` "Complete backlog
scope" table's "Required completion" cell for this item (still reading
"audit and complete path, ETA, and setup ACs, then close") was left
alone for the same reason — it is the epic's starting-scope table, not
the live AC.

**Status stays `in_progress`, not closed.** "Tool-setup disposition" is
a distinct sub-scope of this AC (never mentioned in the actual clause-1/
clause-2 sentence, only in secondary summaries) and is untouched by
this decision — it remains genuinely open and unassigned. Clause 1
(governance paths) is proven; clause 2 (gate ETA) is now retired by
spec/AC wording; the remaining sanctioned gate is the tool-setup AC.

### Scoping, 2026-08-19 — no "tool-setup" AC clause exists to prove; item can close

Searched the entire `specs/2026-07-19-sprint-sentinel-epic/` directory
(`rg -rn "tool-setup|tool setup"`) for the actual clause this AC's
"tool-setup disposition" wording is supposed to trace to. It appears in
exactly three places, and all three are summary/table characterizations,
never an actual acceptance-criterion sentence:

- `backlog-acceptance-matrix.md`, the `pipeline.t1-governance-path-preflight`
  row's "Current AC assessment" cell: "...without complete path/ETA/
  tool-setup disposition."
- `prd_sentinel-epic.md`'s "Complete backlog scope" table, this item's
  "Required completion" cell: "audit and complete path, ETA, and setup
  ACs, then close."
- `spec.md`'s "Starting reconciliation classification" table (line 203,
  itself already flagged by the prior dispatch as "a design hypothesis
  to be proven in SNT-7, not closure evidence"): "full ETA/tool-setup
  contract may be partial."

The one and only place `prd_sentinel-epic.md` states this AC's actual
Required-outcomes text is §3, line 161 — a SINGLE bullet: "T1 packets
include governance paths and an honest gate ETA or `unknown`." That
bullet contains exactly the two clauses already resolved above (clause 1
governance paths, proven; clause 2 gate ETA, retired by PO decision
#18). No third bullet, clause, or sentence about tool setup, tool
installation, or a tool-availability check exists anywhere in §3, in
the packet schema (`PACKET_SCHEMA`, already confirmed by the prior
dispatch to carry no such field), or in any other AC-bearing section of
this epic's spec files.

**Conclusion: "tool-setup disposition" is not a distinct, checkable AC
clause — it is imprecise paraphrasing in three summary/table cells that
bundled "path" + "ETA" + a vague third word together without a
corresponding Required-outcomes sentence ever being written.** There is
nothing to specify, register, or prove for it, by the same reasoning PO
decision #18 already applied to the (real, but stale) gate-ETA clause.
Both of this AC's actual clauses are now resolved (clause 1 proven,
clause 2 retired); no further design or dispatch is needed. **This item
can close** — a future session should run the standard close
ritual (status flip, closure metadata, ledger reconciliation) citing
this scoping note plus the two prior dispatch results as closure
evidence. Not closed here: closing was out of this scoping pass's
directive.

## Closure, 2026-08-19

Standard close ritual run, per this item's own instruction above: no new
design or dispatch needed, both AC clauses resolved (clause 1 proven,
clause 2 retired by PO decision #18), and no separate "tool-setup" AC
clause exists anywhere in the epic's spec files to prove. Closure
evidence is this item's own 2026-08-19 scoping section plus the two
prior dispatch results it cites (`NVA-T1GOVPREFLIGHT-1`, `NVA-W3-12`).
`status:` was stale at `in_progress` in `backlog/STATUS.md` despite the
scoping section's own conclusion — the STATUS.md/index.json ledger was
simply never regenerated after that note landed.
