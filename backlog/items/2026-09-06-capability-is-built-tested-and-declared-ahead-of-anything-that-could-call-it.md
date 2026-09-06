---
schema: pipeline.backlog-item.v1
id: pipeline.capability-is-built-tested-and-declared-ahead-of-anything-that-could-call-it
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-06
source: "NVA-B-WIREAUDIT-1, a measured reachability audit of every non-test module under plugins/pipeline-core/{lib,scripts,hooks}; report backlog/evidence/2026-09-06-built-but-unwired-audit.md, machine output evidence/NVA-B-WIREAUDIT-1-graph.json. Commissioned by the PO on the suspicion that built-but-unwired is a pattern of agentic development rather than a set of accidents."
sprint: nova-b
done_when: manual
---

# Capability is built, tested and declared ahead of anything that could call it

## Description

A reachability audit measured every non-test module under
`plugins/pipeline-core/{lib,scripts,hooks}` against four roots: named in a
hook manifest, imported by something itself reachable, named as a command in a
skill, agent definition or documentation page, or registered in the verify gate
as an executable check. Deliberately excluded as roots: a `*.test.mjs`
registration in the gate, an import from a test, and an entry in the capability
inventory, a schema, an ADR or a backlog item. Those look like shipping from
inside the repository and none of them is a caller.

The audit found the shape the PO suspected, and the shape is more useful than
the count. Stranded modules here are **cluster-shaped, not scattered
singletons**: intact internal subsystems whose members import each other, carry
their own registered test suites, and in several cases carry their own spec or
backlog paper trail — while nothing in any hook manifest, skill, agent
definition or live documentation page names an entry point into the cluster.
Three such clusters were identified by name: the `afk-*` family, the
`advisory-*` family, and the `control-catalog` / `control-waiver` /
`control-evaluation-receipt` family.

The recurring chain, in the audit's own words: a lib module, then a sibling
script that is its would-be command-line face, then a registration as a verify
suite, then a declaration in the capability inventory or a spec, and the chain
stops there.

## Triggering situation

Three confirmed instances motivated the audit and served as its calibration
set; the instrument independently rediscovered all three.
`guard-slicing.mjs` has 33 passing tests, is declared as shipped, and no hook
entry invokes it. `critic-t1-po-override.mjs` implements a PO-authorized
fallback decision, has a schema and a test suite, and has neither a caller nor
a command-line entry point of its own — so nothing could produce the
authorization its own function requires. `guard-dispatch-budget.mjs` is the
third and different shape: correctly wired by this method's definition, and it
counted nothing in a live incident because its discriminator never matched.

## What the audit does NOT establish, and why the numbers must not be quoted alone

Three limits, all disclosed by the audit itself:

1. **No spawn detection.** The import graph follows static `import` and
   `require` only. This codebase orchestrates through `spawnSync` and
   `execFileSync` heavily, so a module spawned by a reachable script but never
   imported is misclassified unreachable. This is a real blind spot, not a
   theoretical one, and it means the raw unreachable count is an upper bound.
2. **Modules are not capabilities.** A five-module cluster missing one
   command-line wire-up is one missing capability, not five. The audit counts
   modules and says so.
3. **Most of the set was never read.** Classification reached four modules;
   the rest is reported as an explicit unclassified remainder rather than
   folded into a satisfying total. Some of it is certainly dormant by design.

A reachability graph also answers "can this run", never "does this run
correctly" — the budget guard is the standing proof of that gap.

## Affected artifact

- `scratch/wire-audit.mjs` — the instrument. It lives in gitignored scratch by
  its own dispatch contract and will not survive a clean checkout. Whoever
  picks this up rebuilds it or promotes it; if it is promoted it belongs in
  `harness/scripts/`, not in the plugin.
- `docs/product-capability-inventory.json` — declares at least one capability
  whose guard nothing invokes, which is the inventory claiming more than the
  wiring supports.
- `plugins/pipeline-core/hooks/hooks.json` — TP-4 protected; the missing entry
  for `guard-slicing.mjs` needs the PO's signature and is already queued.

## Proposal

Two measurements and one process change, in that order.

**1. Close the blind spot, then re-measure.** Extend the instrument to treat a
`spawnSync`/`execFileSync`/`spawn` call naming a module path as an invocation
edge, and re-run. Until that runs, no count from this audit should be quoted
as a finding — only the shape and the four classified modules.

**2. Collapse clusters into capabilities.** For each stranded cluster, answer
one question: what single entry point is missing, and is the capability wanted?
Three named clusters are the obvious starting set. The output is a short list
of "this capability exists and cannot be invoked", which is actionable, rather
than a long list of modules, which is not.

**3. Make the chain end at a caller, not at a declaration.** The recurring
shape is a package that registers its tests and declares its capability while
its wiring is left for a later step that never comes. The cheapest counter is
to treat "what invokes this, and is that invocation itself reachable" as a
question a package answers before it is called complete — the same way a verify
registration already creates a capability-inventory obligation. Whether that
becomes a checker, a definition-of-done line, or a Critic prompt is the
decision this item asks for.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
