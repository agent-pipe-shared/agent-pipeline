# Built but unwired: a measured inventory of plugin modules reachable by nothing

Dispatch: NVA-B-WIREAUDIT-1. Instrument: `scratch/wire-audit.mjs` (throwaway,
not committed). Raw output: `evidence/NVA-B-WIREAUDIT-1-graph.json`. Run
capture: `evidence/NVA-B-WIREAUDIT-1-run.txt`.

**Status: partial by stop condition.** This dispatch exceeded its base tool
budget while validating and correcting the instrument (see Method); the
closing allowance was spent writing this report rather than classifying the
full unreachable set. 209 of 213 unreachable modules are reported as counted
but **not individually classified** — see Findings and Counts. PO acceptance:
open.

## Method

**Definition measured** (verbatim from the briefing): a module is
**reachable** when at least one holds: (1) it is named in `hooks.json` or
`codex-hooks.json`; (2) it is imported by another module that is itself
reachable — follow the chain, and a cycle among otherwise-unreachable modules
is NOT reachability; (3) it is named as a command in a skill, an agent
definition, or a documentation page that tells someone to run it; (4) it is
registered in `verify.mjs` as an executable check whose `file` is the module
itself. It is **NOT** made reachable by: registration in `verify.mjs` only as
a `*.test.mjs` suite; being imported only by its own test or another test;
being listed in `docs/product-capability-inventory.json`, a schema file, an
ADR, or a backlog item.

**Subjects**: every non-test `.mjs` file directly under
`plugins/pipeline-core/lib/`, `plugins/pipeline-core/scripts/`, and
`plugins/pipeline-core/hooks/` (top-level only, not recursive).
`plugins/pipeline-core/scripts/fixtures/**` is excluded — it holds test
fixture data (benchmark workload payloads, sandbox preflight payloads), not
product modules; this is a scoping choice, stated rather than silent. 415
subjects were enumerated this way.

**How the instrument implements each criterion:**

- (1) Regex-extracts every `hooks/<name>.mjs` reference from `hooks.json` and
  `codex-hooks.json`'s raw text.
- (4) Parses `verify.mjs`'s `TEST_SUITES` array textually for
  `{ name: "...", file: join(dirVar, "....mjs") }` entries, splits them into
  `*.test.mjs` (never a root) and everything else (a root, if `dirVar`
  resolves to one of the three subject directories).
- (3) Walks `plugins/pipeline-core/skills/**`, `plugins/pipeline-core/agents/*.md`,
  and (after a deviation below) all of `docs/**/*.md` plus `SETUP.md`. A
  subject's basename is treated as "named as a command" only if some line in
  the scanned text contains both the basename and the word `node` — a bare
  mention without a `node` invocation on the same line is recorded but does
  not confer reachability.
- (2) Parses every subject's own text for `import ... from "..."`,
  `import("...")`, and `require("...")` specifiers, resolves relative ones
  against the importing file, and keeps edges that land on another subject.
  Reachability then propagates forward (BFS) from the root set along these
  edges only — a subject is never seeded as reachable by an edge among
  otherwise-unreachable subjects, which is exactly how the cycle trap in the
  definition is avoided (it falls out of "propagate forward from roots" by
  construction, not from a special case).

**What the method cannot see (stated up front, not discovered after
publishing).** Criterion 2 as implemented follows only static `import` /
`require` / dynamic-`import()` syntax. This codebase's scripts also invoke
each other by spawning a child Node process against a literal or computed
path (`spawnSync`/`execFileSync`/`fork`) — the exact pattern `verify.mjs`
itself uses to run every suite. A production script that spawns another
script by path, without ever importing it, is invisible to criterion 2 here
and will be misclassified unreachable. This is a real, not hypothetical, gap:
see the diagnostic in Findings/Pattern below. The instrument does not attempt
to parse `spawnSync` call sites; doing so honestly (resolving computed paths,
not just literal ones) was judged out of budget for this dispatch.

Two further, smaller blind spots: (a) the skill/agent/doc "named as a
command" detection requires `node` and the basename on the *same line*; a
command written as a bare `./module.mjs subcommand` or split across two lines
in a fenced block would be a false negative. (b) The capability-inventory
cross-check and the external-mention diagnostic (next paragraph) only scan
`.mjs` and `.md` files, not `.json` — so a reference living only in a schema
file or another JSON artifact is invisible to both, though per the
definition a schema reference would not confer reachability anyway.

**Deviation from the briefing's suggested doc scope.** The briefing named
`docs/push-release-flow.md`, `docs/usage.md`, `SETUP.md`, and
`docs/claude-local-plugin-development.md` as "most likely" to carry run
instructions, with permission to skip an exhaustive `docs/` read "if budget
is tight." A first pass restricted to exactly those four produced a
**verified false positive**: `plugins/pipeline-core/scripts/audit-bundle.mjs`
and `plugins/pipeline-core/scripts/change-control.mjs` were classified
unreachable, but `docs/audit-bundles.md` and `docs/change-control.md` (both
outside the named four) each contain a literal
`node plugins/pipeline-core/scripts/<module>.mjs ...` invocation — confirmed
by direct grep before widening the scan. Because the doc scan runs *inside*
the instrument (`readFileSync` over the whole tree), not via the agent's own
Read tool, widening it costs no extra tool-call budget — the narrow-scope
rationale in the briefing was written for a manual read, and stopped applying
once the mechanism became script-driven. The scan was widened to all of
`docs/**/*.md` plus `SETUP.md`, excluding `docs/adr/**` (the definition
explicitly excludes an ADR as a reachability signal), `docs/state-archive/**`,
and `docs/spec-archive/**` (historical session snapshots recording what
someone once ran, not a standing instruction to run it now). This raised
reachable from 168 to 202 (of 415) and is why the final counts below differ
from an initial narrower run. I personally read only the grep excerpts of
`docs/audit-bundles.md` and `docs/change-control.md` that surfaced this
defect; the rest of the widened doc corpus was scanned mechanically by the
instrument, not read by me.

## Calibration

All three confirmed instances were independently rediscovered, and held
across every instrument revision (three corrections: a capability-inventory
substring bug, an added external-mention diagnostic, and the doc-scope
widening above) without ever flipping:

| Module | Expected | Found | Notes |
|---|---|---|---|
| `plugins/pipeline-core/hooks/guard-slicing.mjs` | unreachable | unreachable | 12 external mentions (CHANGELOG, backlog items, an ADR, `docs/state.md`, `guard-dispatch.mjs`'s own comment, `verify.mjs`'s test registration) — none is an import edge, a hooks.json entry, or a `node`-line doc command. Declared in the capability inventory (true). |
| `plugins/pipeline-core/scripts/critic-t1-po-override.mjs` | unreachable | unreachable | Exactly 1 external mention: `harness/scripts/verify.mjs` (runs its test, not the module). Declared in the capability inventory via its verify suite id `critic-t1-po-override-tests`, not its filename — a fixed defect in the first attempt (a naive basename substring check missed this; corrected to a stem match). |
| `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` | reachable (wired, discriminator never matches) | reachable | Named twice in `hooks.json` (its own PreToolUse entry, plus its own comment referencing itself). |

No disagreement required correcting the *expectation* — every correction was
to the script, per the briefing's instruction. The one case worth flagging
explicitly: **this method cannot see wired-but-ineffective on its own.**
`guard-dispatch-budget.mjs` shows up identically to any other correctly
wired-and-working hook — the graph has no signal for "fires but its
discriminator never matches." That distinction is only visible in this repo
via a live-fire observation, not a static graph:
`backlog/items/2026-09-06-a-dispatchs-own-tool-budget-stop-condition-cannot-fire-because-nothing-counts.md`,
surfaced incidentally by the external-mention scan, records exactly that
failure mode in production. Wired is not the same as effective, and this
method only measures the former.

## Findings

**Dead capability (2, both from the calibration set):**

1. `plugins/pipeline-core/hooks/guard-slicing.mjs` — implements a guard
   intended to enforce the parallel-dispatch slicing rules from
   ADR-0080 (preventing a parallel dispatch wave from clashing on the same
   files). It carries 33 passing tests and is declared as a shipped
   capability in `docs/product-capability-inventory.json`, but no
   `hooks.json`/`codex-hooks.json` entry invokes it, so the guard it
   implements never actually runs against a live tool call. Missing: one
   `hooks.json` PreToolUse entry. Confidence: high on "unreachable", medium
   on the one-sentence capability description (drawn from the briefing and
   ADR-0080's title, not a fresh code read this dispatch — field 2 asked for
   "enough" to state the capability, not a full read).

2. `plugins/pipeline-core/scripts/critic-t1-po-override.mjs` — implements a
   PO-authorized fallback decision path for a Critic-review T1 finding, with
   its own schema and a dedicated test suite, but has no CLI entry point of
   its own and no production caller: the only thing that runs it is
   `verify.mjs` running its *test*. Missing: either a documented CLI
   invocation (a `docs/*.md` page with a `node ... critic-t1-po-override.mjs`
   line) or a caller from whatever script is supposed to invoke it when a T1
   override is actually exercised. Confidence: high on "unreachable", medium
   on the capability description (same caveat as above).

**Instrument/scaffolding, not "built and tested" (2):** these two showed zero
external mentions anywhere in the repo (no import, no doc, no backlog item,
nothing) and — unlike the two dead-capability findings — carry **no sibling
test**, which puts them outside the task's own frame ("built, tested, and
reachable by nothing"). Flagged for completeness, not counted toward the
headline dead-capability class:

- `plugins/pipeline-core/lib/wsl-ipc-compatibility-controller.mjs`
- `plugins/pipeline-core/scripts/recover-sentinel-backlog.mjs`

**Unclassified remainder: 209 of 213 unreachable modules.** This is a stop
condition, named explicitly rather than hidden inside a satisfying-looking
total: classifying each of these individually (what capability it implements,
what single thing is missing, a confidence judgment) is exactly the work the
budget ran out on. What the data does show about this remainder, short of
per-module classification, is in Pattern below — it is not a flat list of 209
independent accidents.

## Counts

| Category | Count |
|---|---|
| Subjects scanned | 415 |
| Reachable | 202 |
| Unreachable | 213 |
| — by directory: `lib/` | 90 |
| — by directory: `scripts/` | 118 |
| — by directory: `hooks/` | 5 |
| Unreachable, zero external mentions anywhere | 2 |
| Unreachable, some external mention (not import-wired) | 211 |
| **Classified — dead capability** | **2** |
| **Classified — instrument/scaffolding** | **2** |
| **Classified — dormant by design** | **0 (none found; see note)** |
| **Classified — method artefact** | **0 individually confirmed; see Pattern** |
| **Unclassified (budget)** | **209** |

Note on "dormant by design": zero were *confirmed* into this class this
dispatch — not because none exist, but because confirming one requires
reading the module for a header comment or tracing it to a specific ADR
decision, which is exactly the per-module work the remainder ran out of
budget for. Some of the 209 unclassified almost certainly belong here; this
row is a count of what was verified, not a claim that the class is empty.

## Pattern

The data supports one structural claim with reasonable confidence, and does
not support a stronger one.

**What is supported: stranding here is cluster-shaped, not scattered
singletons.** The external-mention diagnostic (built specifically to tell
"orphaned" from "referenced but not by an edge this method follows" apart)
shows that most unreachable modules are *not* isolated dead code — they
import each other and are imported by each other inside intact internal
subsystems: an `afk-*` cluster (`afk-ledger.mjs`, `afk-review.mjs`,
`afk-git-adapter.mjs`, `afk-transaction-host.mjs`, `afk-capability-worker.mjs`
all reference each other), an `advisory-*` cluster
(`advisory-coordinator.mjs`, `advisory-decision-event.mjs`,
`advisory-lifecycle-v2.mjs`, `advisory-receipt.mjs`,
`advisory-receipt-assurance.mjs`), and a `control-catalog`/`control-waiver`/
`control-evaluation-receipt` cluster. Each of these clusters has its own
internal import graph, its own test suites (registered in `verify.mjs`, which
is why the mention count for each is never zero), and in several cases its
own spec/backlog paper trail — but nothing in `hooks.json`, no skill, no
agent definition, and no live doc page names an entry point into any of
them. The recurring shape across the sample read this dispatch was: **lib
module → sibling script (its would-be CLI face) → registered as a verify.mjs
test suite → declared in the capability inventory or a spec/ADR → and the
chain stops there.** Suite registration and an inventory/spec entry both look
like shipping from inside the repo; neither is a caller.

**What is not supported: a precise count of "how many capabilities are
actually stranded."** This method counts *modules*, not entry points — a
five-module cluster with one missing CLI wire-up is one missing capability,
not five. The instrument does not attempt to collapse a cluster into "one
capability" (that requires per-cluster judgment this dispatch didn't reach),
so 213 unreachable modules is not the same number as "213 stranded
capabilities," and the report does not claim it is. Establishing that
mapping is the natural next measurement, not something this method's raw
count answers.

**What the calibration's third case shows that the graph itself cannot**:
`guard-dispatch-budget.mjs` is correctly wired by this method's definition
and still counted nothing in a live incident
(`backlog/items/2026-09-06-a-dispatchs-own-tool-budget-stop-condition-cannot-fire-because-nothing-counts.md`).
A reachability graph answers "can this run," never "does this run
correctly" — worth naming because it bounds what even a perfect version of
this instrument could ever tell a reader.

Given the honest limits above (no spawn-invocation detection, no per-cluster
capability collapse, 209 modules never individually read), the fair
conclusion is: the evidence is consistent with a systematic pattern — code,
tests, and paper trail built ahead of the wiring that would let anything call
it, repeated across several distinct subsystems rather than once — but this
dispatch measured the *shape* of that pattern, not its full extent, and a
stronger claim than that is not what the data in hand supports.

## What I am not saying

- I am not saying 213 modules are all dead capabilities. Two are confirmed;
  two are scaffolding without tests; 209 are unclassified by budget, and
  presenting that remainder as classified would be exactly the false
  confidence this audit exists to avoid.
- I am not saying the `afk-*`, `advisory-*`, or `control-catalog-*` clusters
  are dead capabilities, only that they are unreachable by this method's
  definition and internally intact. Confirming each as "dead" vs. "in
  progress, not yet wired" vs. "wired via a spawn edge this method can't see"
  needs the per-module read that ran out of budget.
- I am not claiming zero "dormant by design" modules exist among the 209 —
  only that none were positively confirmed into that class this dispatch.
- I am not claiming the doc-scan widening (four named pages to all of
  `docs/**`) is exhaustive proof of absence for any given module: a module
  could still be documented as a command in `backlog/`, `specs/`, or a
  README embedded elsewhere that this scan's exclusions or its `.md`-only
  scope missed.
- I am not claiming this instrument would generalize unchanged to a
  different repository: the "same line as `node`" heuristic and the
  `verify.mjs` two-argument `join()` parser are both shaped to this
  codebase's actual conventions, not a general JS reachability analyzer.
- I dropped one candidate false positive after checking it directly: the
  capability-inventory cross-check for `critic-t1-po-override.mjs` first
  read `false` because the inventory references it by verify-suite id
  (`critic-t1-po-override-tests`), not filename; fixed to a stem-substring
  match once the discrepancy was noticed against the briefing's own claim
  that it *is* declared there.
- I did not read the two calibration modules' own source this dispatch
  (field 2 asked for "enough... to state what capability it implements");
  the one-sentence capability descriptions above are drawn from the
  briefing text and identifiers (ADR-0080, the schema/PO-override naming),
  not a fresh read of the code — named here rather than presented as
  first-hand verification.
