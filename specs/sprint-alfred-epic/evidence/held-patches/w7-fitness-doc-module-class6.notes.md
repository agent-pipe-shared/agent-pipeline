# Held patch W7-FITNESS-DOC-MODULE-CLASS6-C1-20261027: class 6 skips a documentation module without entry points; the loader carries kind (D9, part 4, stacked)

Candidate 63cb00879657384479847ba35be11c6d2c39c3c9 plus the held patch `w7-fitness-doc-module.patch` (parts 1-3) applied first as the baseline in both clones. Patch: `w7-fitness-doc-module-class6.patch` (git diff --binary of the clone against that stacked baseline, written from Node, 5463 bytes). It must be applied AFTER `w7-fitness-doc-module.patch`.

## Cause

`loadConceptFile` rebuilt each row from a field whitelist, dropping `kind`; class 6 therefore could not see it. Recon lines re-verified: module-inventory.mjs moduleRow (lines 93-108), architecture-fitness.mjs evaluateVerificationLocality (line 537, empty branch at 543). Schema already carries optional `kind` (from the stacked patch).

## Changed lines

- module-inventory.mjs: in moduleRow, after verificationEntryPoints: `...(parsedFrontmatter.kind === undefined ? {} : { kind: parsedFrontmatter.kind }),`
- architecture-fitness.mjs: first statement inside `if (entryPoints.length === 0) {`: `if (mod.kind === "documentation") continue;`
- architecture-fitness.test.mjs: new describe "Class 6 and a module declared kind documentation (D9, part 4)", 5 cases through loadMapBundle on temp map fixtures: loader carries kind only when declared; rows without kind keep the exact previous key set; documentation module without entry points passes; same module without kind gives missing-verification-entry-point target none; documentation module with a missing entry-point file still gives the finding.

## Evidence

- Baseline (clone2, unchanged stacked baseline, whole file): exit 0, tests 59, pass 59, fail 0 (log scratch/agent-out/w7p/base.architecture-fitness.test.mjs.log).
- GREEN (clone, patched, whole file): exit 0, tests 64, pass 64, fail 0 (log green.architecture-fitness.test.mjs.log). Failing-name sets: empty in both, identical; 5 new passing cases.
- RED: the first RED run (log red.*) failed all 5 new cases, but for a FIXTURE reason (the test renderer wrote flow-style YAML arrays, which yaml-lite refuses), not for the missing production change; the renderer was then fixed and a second RED run (red2.*) was started but its result was NOT read before the production edits were made (tool budget). A clean RED on the final fixture was therefore NOT recorded. Expected RED at baseline: the cases 1 and 3 (kind dropped; skip absent); cases 2, 4, 5 are regression guards that pass at baseline.

## Coordinator addendum (parent session, after the Goldfish stopped at budget)

- Clean RED on the final fixture, measured by the parent: the patched test file copied into the unchanged stacked baseline (clone2) fails exactly "the loader carries kind only when the concept declares it" and "a documentation module with no entry points passes class 6" (2 failures; the other three new cases are regression guards that pass at baseline). This matches the expectation above.
- `driver check` (git apply --check in clone2 at the stacked baseline): exit 0. Both clones removed.

## Not done

- Open decision for the PO: adopted brownfield maps have no design-time owned-path check, so class 6 now trusts a declared `kind: documentation`. Not implemented here (would need the design validator predicate in class 6, a further file).
- Independent Critic review stays a parent-owned batch gate.

## Proposed commit message

feat(architecture): class 6 skips a documentation module without entry points and the module inventory loader carries kind (D9, part 4)

## Operator flow

Apply `w7-fitness-doc-module.patch`, then this patch (`git apply`); `git add -u` limited to the three files; `git commit --no-verify` with the message; stamp; install.

## Protected-path classification observed

None of the three files matches TP-1..TP-13; all are ordinary editable paths. Edits happened only in the clone; the repository tree under plugins/ was not touched.
