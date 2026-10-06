# Critic record — S2 guard split modules, kernel/contract commit, package-1 staging

- Review object (enumerated): `917674f20` (22 `lib/guard` modules), `46bf6a651` (kernel list + split contract),
  `792f8ab22` (facade, baseline patch, verify-registration patch)
- Spec: `specs/sprint-alfred-epic/design/s2-guard-split-plan.md`
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt;
  effort not observed); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: 80 % checkpoint at call 20 of 24; notes persistence unavailable (scratch mkdir refused, no Write tool) — this
  file is the Elephant's record
- **Verdict: FAIL** (on F1 alone)

## Findings

### F1 — major: the kernel-list change is not covered by the dispatch it is attributed to

`46bf6a651` appends the 22 `lib/guard/*.mjs` entries to `NEVER_LIFTABLE_KERNEL_PATHS`
(`plugins/pipeline-core/lib/guard-maintenance-window.mjs`, hunk at :686) under a single `Dispatch: S2-70b (goldfish)`
trailer, but the stripped S2-70b record's `changedFiles` does not list that path. Either the orchestrator wrote it
outside stage-0, or S2-70b under-reported (and then also wrote GSC05, the test pinning that list — QG-04). The list
content itself is correct (22 entries = 22 modules; GSC05 passes in A and B). Spec-ref: `agent-obligations.md:165-170`;
EL-01/EL-16; QG-04; plan row S2-70.

**Elephant resolution (attribution, measured after the round):** the raw record
`evidence/dispatch-record-S2-70.json` (an earlier, partial dispatch of the same slice) lists
`plugins/pipeline-core/lib/guard-maintenance-window.mjs` in its `changedFiles`; that edit was left uncommitted
("kernel list uncommitted until then", execution order) and the Elephant committed it together with S2-70b's work in
one commit carrying only the S2-70b trailer. The kernel-list diff is S2-70's; the defect is the Elephant's integration
commit that merged two dispatches under one `Dispatch:` trailer. History is not rewritten. Integration rule from now:
one commit per dispatch; never fold a previous dispatch's uncommitted edit into another dispatch's commit.

### F2 — minor: the staged `guard-split-contract-tests` registration has no inventory surface

`verify-registration.patch` registers the suite, but no `verify-phase:` surface mapping in
`docs/product-capability-inventory.json` is staged with it; applied as committed the inventory check names an
uncategorized surface. Spec-ref: QG-08 bullet 2 (`quality-gates.md:103`); plan §3 item 3.

### F3 — minor: the contract suite is unregistered from `46bf6a651` until package 1 lands

`plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs` sits under a registered test root without a
`verify.mjs` entry or declared exclusion; `check-verify-suite-registration.mjs` reports it UNREGISTERED in that interval
(:149-156, :564-579) and Verify does not run the GSC05 kernel pin; undisclosed in the evidence. Spec-ref: QG-08
verification line (`quality-gates.md:106`).

### F4 — minor: the implementor changed the check that validates its own deliverable

In one dispatch/commit S2-70b wrote the threat-model listing GMWKC03 validates and widened GMWKC03's
`DOC_PATH_TOKEN_RE` (plus GMWKC03a). No actual weakening found (`.`/`..` segments excluded; 3 positive / 4 negative
pins; every kernel entry still required literally). Spec-ref: QG-04 (`quality-gates.md:69-72`).

## Deliberately not flagged (summary)

Verbatim move supported by machine evidence (extractor `check --complete` 308 declarations byte-identical; 40-name
export surface identical; 12 shard pairs identical); 22 vs 23 modules is the plan's R-14 fallback; 40 vs 41 exports is a
counting slip in the plan; facade 75 lines, sha256 equals the tested facade, `node --check` 0; PB patch applies and adds
exactly the Q1 pattern; no secrets/paths/new dependencies; English; commit hygiene. Recorded, not a finding: this
review does not clear plan §4 (the equivalence evidence is self-marked NOT VERIFIABLE; WSL leg and items 4, 6, 7 open;
Codex/Antigravity adapter suites fail identically in A and B).

## Trajectory — inconsistent

F1 trailer vs record mismatch. Not verifiable: authorship of `917674f20` (no record supplied — its raw record's
`changedFiles` carries a glob the strip tool rejects), the "kernel closure 8/8" claim, reproduction of the equivalence
evidence (uncommitted scratch scripts).

## Not reached

`guardrails/global.md`, `guardrails/security.md`, `project/pipeline.json`, current `CLAUDE.md`,
`plugins/pipeline-core/lib/protected-baseline.mjs`, `docs/adr/0063-repository-directory-contract.md`, the
`917674f20` module bodies beyond import headers.

## Briefing violations

None.
