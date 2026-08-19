---
schema: "pipeline.backlog-item.v1"
id: "pipeline.codex-sandbox-critic-longterm"
type: "defect"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.codex-sandbox-critic-longterm

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.codex-sandbox-critic-longterm` — "open, partial";
host/preflight/select/runtime contracts cover the intermediate
(weaker, read-only-asserted) lane already. The remaining sanctioned
gate — "original upstream, shadow, T1, isolation, and PO evidence for
the strong lane" — is the PRD's own documented closure route: the
strong, fully input-confined/network-denied lane was scoped from the
start to close only via its original upstream gate (a durable
selected-sandbox capability, tracked as GitHub Issue #29 in the
project's issue history), which is outside this repository's control.

**Decision:** accepted as a real, still-open gap for the intermediate
lane's own remaining local ACs, but the strong lane's closure route is
genuinely, structurally external — **not dispatchable by any goldfish
task**, same class of blocker as Nova A's own NVA-A8-5 PO-run pilot.
Not conflated with a Nova-owned code gap; documented here so a future
session doesn't re-diagnose it as one. **Assignment:** pipeline for
whatever local-AC remainder the intermediate lane still needs (needs
its own dedicated read to scope, not done this pass); the strong lane
stays externally gated. **Date:** 2026-08-18

## Scoping pass, 2026-08-18 (NVA-W3-R1B)

**Result: partially satisfied, with one concrete, bounded remaining
gap.** The 2026-08-18 Triage's summary ("host/preflight/select/runtime
contracts cover the intermediate lane already") is correct for three
of the four named dimensions but overstates the fourth (preflight).

Read for this pass:
`scratch/stripped-codex-sandbox-critic-longterm.md`;
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.codex-sandbox-critic-longterm` (line 29);
`specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md` line 99;
full text of `plugins/pipeline-core/lib/codex-sandbox-compatibility.mjs`
(+ its `.test.mjs`, both present, 1:1 paired),
`plugins/pipeline-core/lib/selected-sandbox-disposition.mjs` (+ paired
test), `plugins/pipeline-core/lib/sandboxed-readonly-duty.mjs` (+
paired test); first 40 lines of
`plugins/pipeline-core/scripts/codex-sandbox-preflight.mjs`; test-name
listings for `codex-critic-host.test.mjs`,
`codex-sandbox-select.test.mjs` (14 named cases),
`codex-sandbox-runtime.test.mjs` (2 named cases).

Per-dimension finding:

- **Host** — code:
  `plugins/pipeline-core/scripts/codex-critic-host.mjs` exists; test:
  `plugins/pipeline-core/scripts/codex-critic-host.test.mjs` exists but
  a `grep -c "test("` over the whole file returned only 1 match (vs. 14
  for select, 2 for runtime) — the file's own test-declaration shape
  was not opened/read in this pass (budget), so this is flagged as an
  **open question**, not a confirmed gap: it may be one outer
  `test()`/`t.test()` wrapping many sub-assertions, or it may genuinely
  be thin. **Needs one direct read of that file before it can be called
  covered or not.**
  **Resolved, 2026-08-19:** the file uses this repository's own custom
  `check()` assertion-helper convention (`let passed = 0`), not
  `node:test`'s `test()` — `grep -c "^check("` finds **69** individual
  assertions. Well covered, not thin; the earlier grep simply matched
  the wrong declaration shape.
- **Select** — code: `plugins/pipeline-core/scripts/codex-sandbox-select.mjs`;
  test: `codex-sandbox-select.test.mjs`, 14 named test cases covering
  request-digest domain separation, storage derivation, symlink
  rejection, replay, lock reclamation, and typed no-child persistence.
  **Fully covered** for the intermediate lane's local ACs.
- **Runtime** — code: `plugins/pipeline-core/scripts/codex-sandbox-runtime.mjs`;
  test: `codex-sandbox-runtime.test.mjs`, 2 named cases (host-coordinate
  rejection "before preflight or a model launch"; selection evidence
  derivation with no unsafe-mode escape). **Partially covered**: the
  runtime adapter's own contract (rejecting bad input, deriving
  selection) is tested, but neither case exercises the runtime's actual
  call into preflight — both stop before or route around it (see next
  bullet).
- **Preflight — the concrete gap.** Code:
  `plugins/pipeline-core/scripts/codex-sandbox-preflight.mjs` (191+
  lines; exports `PREFLIGHT_SCHEMA`, `PROFILE_SCHEMA`,
  `PREFLIGHT_BUDGETS`, `TERMINAL_CODES`; a CLI-invocable module that
  spawns the actual Codex sandbox subprocess and emits a receipt
  against `codex-sandbox-preflight.schema.json`). Test: **no paired
  `codex-sandbox-preflight.test.mjs` exists** (confirmed via directory
  listing of `plugins/pipeline-core/scripts/`, contrast with the 1:1
  paired tests for select/runtime/host). `grep -rl
  "codex-sandbox-preflight.mjs"` across every `.test.mjs` in the plugin
  returned **zero files** — no test imports or exercises this module's
  own exported functions directly. It is referenced (not imported for
  test) from four production files:
  `plugins/pipeline-core/scripts/codex-sandbox-runtime.mjs`,
  `live-runner-certification.mjs`, `codex-advisory-app-server.mjs`,
  `selected-sandbox-launch.mjs` — none of these callers' own test files
  exercise the preflight call path (`codex-sandbox-runtime.test.mjs`'s
  one `preflight`-mentioning case explicitly stops *before* preflight
  runs, per its own test name). The one place a "preflight receipt" is
  used in a test at all is
  `plugins/pipeline-core/lib/codex-sandbox-compatibility.test.mjs`
  (lines 22–94), which hand-builds a plain object literal shaped like a
  preflight receipt to test the *classifier's* binding logic — it never
  calls anything exported by `codex-sandbox-preflight.mjs`, so it
  proves nothing about whether the real preflight module's own receipt
  construction, terminal-code handling (14 documented `TERMINAL_CODES`,
  none individually exercised), or schema conformance are correct.
  **AC-to-text match:** the acceptance matrix's row text ("Host/
  preflight/select/runtime contracts cover the intermediate lane")
  names preflight explicitly as one of the four covered contracts; on
  the evidence above this claim does not hold for preflight
  specifically — the contract *exists* but has no direct or indirect
  unit-test coverage of its own logic anywhere in the repo.

**Bounded gap for a future implementation dispatch:** write
`plugins/pipeline-core/scripts/codex-sandbox-preflight.test.mjs`
covering, at minimum, (a) each of the 14 `TERMINAL_CODES` reachable
without live subprocess dependence (schema/profile/permission/network
mismatch paths do not require a real Codex binary), (b) receipt shape
against `codex-sandbox-preflight.schema.json` via
`validateAgainstSchema`, (c) the `PREFLIGHT_BUDGETS` timeout/byte-cap
enforcement paths, and (d) a fixture-driven happy-path receipt using
`scripts/fixtures/codex-sandbox-preflight-payload.mjs` (already
present, currently unused by any test). This closes the one dimension
this pass found genuinely unproven for the intermediate lane's local
ACs; it does not touch the strong lane, which stays externally gated
per the existing Triage above. The host-dimension open question above
should be resolved (one direct read of `codex-critic-host.test.mjs`)
before or alongside that dispatch, since it may turn out to need the
same treatment.

### Progress, 2026-08-19

`NVA-BL-CSANDBOX-1` (goldfish-deep, worktree-isolated) closed the
bounded preflight gap above: `plugins/pipeline-core/scripts/codex-sandbox-preflight.test.mjs`
(new, 455 lines) covers all 4 named requirements — 22/23 tests pass, 1
skipped and documented inline (the fixture-driven subprocess happy path
does not complete cleanly in this environment, `child-stdio-error`).
Commit `2e72de5f` (cherry-picked from the dispatch's worktree, commit
`219727a8`). The host-dimension open question above is now also
resolved (69 `check()` assertions, well covered).

**Item stays `in_progress`.** Two things this pass and the prior
scoping pass both left genuinely open: the Runtime dimension's
integration-path gap (neither existing test case exercises the actual
call into preflight, both stop before or route around it), and the
three files named just below that were never read in either pass.
Preflight's own unit coverage is no longer the gap; whether preflight
is correctly WIRED from Runtime is still unverified.

Not read this pass (named in the matrix's evidence list but out of
this briefing's context-file scope): `codex-critic-isolation.mjs`/
`.test.mjs`, `codex-critic-shadow.mjs`/`.test.mjs`,
`codex-isolated-critic-contract.mjs`/`.test.mjs`. These exist (found
via directory listing) but their content and test depth were not
verified in this pass; the acceptance-matrix evidence column lists
them under "isolation" and "shadow", which the PRD's "intermediate
lane" framing does not name as one of the four required dimensions —
included here only so a future session doesn't need to re-discover
that they exist.
