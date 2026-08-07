# CYB-1 body — dispatch slicing

> **Status: design-phase sequencing sketch, NOT a gate document.** CYB-1F
> already froze the schemas/enums/identifiers (ratified 2026-07-25); this file
> does not reopen or change that freeze, any acceptance criterion in
> [`cyb-1-feature-spec.md`](cyb-1-feature-spec.md) §3, or the epic-level PRD
> scope — it only decomposes CYB-1's XL body (14 ACs, one package) into
> dispatchable Goldfish-sized sub-briefings and states their dependency order,
> so dispatch can start immediately once (a) the epic `planApproved` machine
> gate opens (currently blocked, see `docs/state.md` top-of-file callout) and
> (b) an advisor() consult has run per the standing instruction not to dispatch
> on old momentum. No Goldfish briefing text is written here yet — this is one
> level of sequencing above that, matching the weight of
> `windows-sandbox-assurance-slice-scope.md`. Not itself a new EL-04 decision:
> it changes how CYB-1 is chunked for dispatch, not what it delivers.

## Why slice

CYB-1's 14 ACs (`cyb-1-feature-spec.md` §3) span six materially different
concerns — schema/lint, resolver, receipt, waivers, catalog content, views —
plus one AC (drift-detection, AC14) that cannot be delivered inside CYB-1 at
all. Briefing all of it as one Goldfish dispatch would violate EL-16's
"bundle interlinked SMALL features into one briefing" (this is not small) and
would hand a single Goldfish an XL scope with real internal sequencing — every
prior successful dispatch in this epic has stayed to one clearly-bounded
concern per briefing.

## Sub-packages and their AC coverage

| Sub-package | ACs covered | Deliverable | Depends on |
| --- | --- | --- | --- |
| **CYB-1a** — L0 schema + catalog lint | AC1, AC5, AC8 | Control schema validator (typed rejection of a control missing a required CYB-1F §8 field); catalog-content lint (verifier + evidence contract + boundary + failure policy all non-empty per control); standard-mappings version + no-"certified"/"compliant" lint | none (schema already frozen in CYB-1F §8) |
| **CYB-1b** — L1 applicability resolver | AC2, AC3, AC4, AC10 | `security-policy-resolver.mjs`; determinism fixture (byte-identical resolution, 2 runs); precedence fixture (≥2 conflicting modules resolve per CYB-1F §6's total order, never last-write-wins); missing-input → `unknown` fixture; baseline-minimal fixture (zero optional modules, no container/IaC/AI-agent verifier invoked) | CYB-1a |
| **CYB-1c** — evaluation receipt + cross-consumer contract | AC6, AC11 | Receipt schema binding `candidateId` + `policyDigest`; fixture proving two different candidates against the same policy produce different receipt digests; single documented consumption contract for #5/#6/#9/Release (no second parallel policy schema) | CYB-1a, CYB-1b |
| **CYB-1d** — waiver lifecycle | AC7 + feature-spec §4 (PO-waived-direct-implementation class) | Waiver schema/lifecycle (scope, authorization, rationale, expiry, non-destructive, revalidation); expired-waiver-fails-closed fixture; original-evidence-unchanged fixture; typed `waiverClass` values including `po-waived-direct-implementation` with mandatory expiry, mandatory follow-up Critic wiring, self-clearing transition | CYB-1a, CYB-1c |
| **CYB-1e** — reference catalog content + 5 stack fixtures | AC9 | Actual catalog content for the 5 `mod.*` clusters (web API, CLI/library, container/IaC, AI/agent, docs-only), each producing a distinct resolved control set | CYB-1a, CYB-1b |
| **CYB-1f** — views | AC12 | Operator/developer/auditor views, each either generated from the catalog file directly or validated against it with a drift-fails check | CYB-1a, CYB-1e |
| **CYB-1g** — migration fixture | AC13 | Pre-catalog repository with no receipt evaluates every control `unknown`/`not-met`, never inherited `met` | CYB-1a, CYB-1b |
| **CYB-1h** — drift-detection verify suite | AC14 | New verify suite failing when catalog schema/module precedence/receipt binding is edited without a matching fixture update, registered via CYB-2's scoped-registration mechanism (`pipeline.verify-gate-scoped-registration`) | **CYB-2** (Phase II) — see note below, NOT a CYB-1-internal dependency |

## Dependency graph and dispatch waves (within Phase I, once gate opens)

```
Wave 1:  CYB-1a
Wave 2:  CYB-1b                              (needs 1a)
Wave 3:  CYB-1c        CYB-1e        CYB-1g  (each needs 1a+1b; independent of each other — parallel-dispatchable)
Wave 4:  CYB-1d                      CYB-1f  (1d needs 1c; 1f needs 1e — parallel with each other)
Deferred: CYB-1h — cannot start until CYB-2 lands (Phase II)
```

Waves 3 and 4 are genuine parallel-dispatch opportunities (distinct files,
distinct fixtures, no shared write surface) — worktree isolation per
`.claude/pipeline.json`'s `"worktree"` setting should be confirmed at actual
dispatch time for any wave-3/4 pair run concurrently, same discipline as the
already-prepared WIN-FPT-1/WIN-PGA-2 briefings.

## The AC14 note — CYB-1 cannot reach 14/14 before CYB-2 exists

AC14 (drift-detection verify suite) is written into CYB-1's own AC table, but
its evidence class explicitly requires "CYB-2's scoped-registration
mechanism" — and spec.md §4's dependency spine has this pointing the other
way: `CYB-2` depends only on **CYB-1's boundary freeze** (CYB-1F, already
ratified), not on CYB-1's full package close. So the real relationship is:

- CYB-1F (ratified) unblocks CYB-2's dispatch.
- CYB-2 landing (Phase II) is what then unblocks CYB-1h (AC14).

This is not a circular dependency — CYB-1F, not full CYB-1 close, is what
CYB-2 needs — but it does mean **CYB-1 as a package cannot show "14/14 ACs
green" until a Phase II package (CYB-2) has also landed.** This is a
sequencing *fact*, stated here so it is not mistaken for a false "package
incomplete" reading later. Whether "13/14 ACs green, AC14 tracked and
deferred to post-CYB-2" is an acceptable state to close CYB-1's own PO gate
(spec.md §6) is **not this document's call to make** — that is an open
question for the PO at CYB-1's package-close gate, to be asked explicitly
when that gate is reached, not pre-resolved here. This does not change
spec.md's phase boundaries or dependency spine.

## What this file does not do

- It does not write any of the 8 sub-package Goldfish briefings — those get
  authored (6-field template, ruleset SHA refreshed) once the machine
  `planApproved` gate is actually open, per the same discipline already
  applied to WIN-FPT-1/WIN-PGA-2.
- It does not reopen CYB-1F's ratified identifiers or CYB-1's frozen AC table.
- It does not change spec.md §4's package boundaries, dependency spine, or
  Phase I/II/III/IV structure — CYB-1a through CYB-1h are an internal
  decomposition of the single CYB-1 package, not new epic-level packages.
