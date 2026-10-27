# Held patch W7-FITNESS-DOC-MODULE-C1-20261027: documentation module (D9), parts (1)-(3) only

Candidate: 4b93666959a9895f2cb19002c8a8e9e6a5dcfdb6. Patch: `w7-fitness-doc-module.patch` (git diff --binary against the candidate, written from Node). Apply check in a second clone at the candidate: exit 0.

## Status

- Parts (1) schema, (2) design validator with mechanical cross-check, (3) derived rows carry `kind` only when declared: DELIVERED, GREEN.
- Part (4) class 6 skip: NOT DONE (stop condition "kind cannot be carried without a wider change", see below). Batch Critic review stays a parent-owned gate.

## Cause of the stop on (4)

`evaluateArchitectureFitness` reads modules via `loadMapBundle(rootDir)` (architecture-fitness.mjs line 978) and class 6 receives that inventory. `loadConceptFile` in `plugins/pipeline-core/scripts/module-inventory.mjs` (lines 93-108) rebuilds each row from a fixed field whitelist, so `kind` is validated by the schema but DROPPED before class 6 sees it. Observed in a RED/GREEN run: the rendered concept file contained `kind: "documentation"`, and the loaded row had no `kind`. That file is outside the briefed patch files.

Exact changes (4) needs, prepared but not applied:
1. `module-inventory.mjs` line ~107, add to `moduleRow`: `...(parsedFrontmatter.kind === undefined ? {} : { kind: parsedFrontmatter.kind }),` (existing rows stay identical).
2. `architecture-fitness.mjs` evaluateVerificationLocality, inside `if (entryPoints.length === 0) {`, first statement: `if (mod.kind === "documentation") continue;`.
3. Cases: a documentation module with empty entry points passes class 6 through `loadMapBundle`; same without kind yields `missing-verification-entry-point` target `none`; a documentation module with a missing entry-point file still yields the finding. (My draft unit cases for these passed against the fitness edit, then were removed with it, because they were dead code without 1.)
Note: for adopted brownfield maps the owned-path cross-check does not run at design time; class 6 would trust the declaration. Decide whether (2) should re-run the predicate.

## Consumers of the schema and module rows (searched with rg, names only)

Schema: architecture-design.mjs, architecture-adoption-authority.mjs, module-inventory.mjs. Module rows or verificationEntryPoints: architecture-fitness, architecture-measure, architecture-boundary-check, architecture-baseline, architecture-adoption, architecture-effective-decisions, architecture-entry-readiness, control-placement, generate-architecture-overview, dispatch-briefing, design-authoring, onboarding-continuity, guard-maintenance-window, push-init, plus fixtures and the pins/ tests. `kind` is optional, so existing inventories and signed adoptions stay valid; none of these consumers was changed.

## Changed lines in the patch

- `schemas/pipeline.module-inventory.v1.json`: optional `"kind": {"type":"string","enum":["documentation"]}`; not in `required`; additionalProperties stays false.
- `lib/architecture-design.mjs`: line 85 allows empty `verificationEntryPoints` when `module.kind === "documentation"`; new loop after the ownedPaths check requires each owned path (trailing `/**`, `/*`, `/` stripped) to be `docs` or `docs/...` or end in .md .mdx .txt .rst .adoc, else `ARCHITECTURE-DESIGN-DOC-MODULE-INVALID` via requireField naming `modules[i].ownedPaths[j]`; `moduleRows` spreads `kind` only when declared.
- `lib/architecture-design.test.mjs`: four new cases appended (existing cases untouched).

Signed-hash trace: map concept frontmatter is rendered from `Object.entries(module)`, so `kind` appears only for a module that declares it; a design without documentation modules yields byte-identical rows and targets (asserted).

## Evidence

- Baseline (unchanged clone2, whole file): `node plugins/pipeline-core/lib/architecture-design.test.mjs` exit 0, tests 13, pass 13, fail 0. Failing-name set: empty.
- RED (clone, new cases, unchanged production code): exit 1; failing: "empty entry points and docs paths are valid...", "an executable owned path is refused...", "kind absent leaves the derived rows byte-identical, and an explicit row must match kind" (plus the since-removed class 6 case). The "without the declaration ... stays refused" case passes at baseline by design (regression guard).
- GREEN (clone, final): exit 0, tests 17, pass 17, fail 0. Failing-name set: empty, identical to baseline plus 4 new passing cases.
- Logs (scratch, untracked): scratch/agent-out/w7n/{base,red,final}.architecture-design.test.mjs.log.
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.

## Protected-path classification observed

No edited file matches a TP-1..TP-13 pattern; the test file is an ordinary editable path. All edits happened in the clone; the repository tree under plugins/ was not touched.

## Proposed commit message

feat(architecture): a module declared kind documentation with only non-executable owned paths needs no verification entry point (D9)

(Do not use this message as-is if (4) stays undone: class 6 still reports such a module, so the change is only complete once item 1+2 above land.)

## Operator flow

Apply the diff (`git apply` of the patch), `git add -u` with a path limit to the three files, `git commit --no-verify` with the message, stamp, install.

## Not done

Part (4); the clones scratch/agent-out/w7n/clone and clone2 were NOT removed (tool budget exhausted; run `node scratch/agent-out/w7n/driver.mjs cleanup`). Independent Critic review stays a parent-owned batch gate.
