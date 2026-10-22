// SPDX-License-Identifier: SUL-1.0
// Regression pin: AC-155 (backlog 2026-10-07 design-phase item, "Observed 2026-10-17", second added acceptance).
// A materialized fitness model is executed as a candidate check at the implementation boundary
// (`set-phase --phase implementation`); a model that never ran, ran on another candidate or is unreadable is REPORTED by
// name and not counted as qualified. Report-only (exit 0, PO decision 2026-10-22, option A): no gate, no new store, and a
// project without a materialized model is unaffected. Green only with the protected guard change applied
// (lib/guard/entry-gates.mjs, lib/guard/lifecycle-gate.mjs).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { PIPELINE_STATE_SCRIPT } from "../guard/constants.mjs";
import * as gates from "../guard/entry-gates.mjs";
import { qualifyFitnessModelRun, inspectFitnessModelMaterialization, SCHEMA_FITNESS_EVIDENCE } from "../../scripts/architecture-fitness.mjs";

const COMMAND = `node '${PIPELINE_STATE_SCRIPT}' set-phase --phase implementation`;
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

function projectRoot(withModel, model = "{}") {
  const root = mkdtempSync(join(tmpdir(), "k37-fitness-"));
  roots.push(root);
  if (withModel) {
    const p = join(root, "architecture", "fitness-model.json");
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, model);
  }
  return root;
}
const passing = () => ({ schema: SCHEMA_FITNESS_EVIDENCE, evaluationMode: "candidate", overallStatus: "pass", outcomes: [] });
const deps = (over = {}) => ({ resolveHeadCommitFn: () => HEAD, evaluateArchitectureFitnessFn: passing, ...over });
const observe = (root, d, command = COMMAND) => gates.fitnessModelQualificationObservation(root, command, d);

test("a materialized model that ran on this candidate is admitted without a report", () => {
  assert.equal(typeof gates.fitnessModelQualificationObservation, "function");
  const seen = [];
  const result = observe(projectRoot(true), deps({ evaluateArchitectureFitnessFn: (input) => { seen.push(input); return passing(); } }));
  assert.equal(result, null);
  assert.deepEqual(seen.map((s) => s.mode), ["candidate"], "the model is executed once, in candidate mode");
});

test("a materialized model that never ran is reported by name, not counted as qualified, with a runnable repair; exit 0", () => {
  assert.equal(typeof gates.fitnessModelQualificationObservation, "function");
  const result = observe(projectRoot(true), deps({ evaluateArchitectureFitnessFn: () => { throw new Error("boom"); } }));
  assert.equal(result?.exitCode, 0);
  assert.match(result.stderr, /GUARD-FITNESS-MODEL-NOT-QUALIFIED/u);
  assert.match(result.stderr, /architecture\/fitness-model\.json/u);
  assert.match(result.stderr, /FITNESS-MODEL-EVALUATION-FAILED/u);
  assert.match(result.stderr, /not counted as qualified/u);
  assert.match(result.stderr, /architecture-fitness\.mjs --qualify --root \. --commit a{40}/u, "one runnable repair command bound to HEAD");
});

test("a project without a materialized model is unaffected and the evaluator is never called", () => {
  assert.equal(typeof gates.fitnessModelQualificationObservation, "function");
  let called = 0;
  const result = observe(projectRoot(false), deps({ evaluateArchitectureFitnessFn: () => { called += 1; return passing(); } }));
  assert.equal(result, null);
  assert.equal(called, 0);
});

test("a model whose run is bound to a different candidate is treated as not run", () => {
  assert.equal(typeof gates.fitnessModelQualificationObservation, "function");
  const root = projectRoot(true);
  const result = observe(root, deps({
    runFitnessQualificationFn: ({ rootDir, candidateCommit }) => ({
      ...qualifyFitnessModelRun({ materialization: inspectFitnessModelMaterialization(rootDir), run: { candidateCommit: OTHER, evidence: passing() }, candidateCommit }),
    }),
  }));
  assert.equal(result?.exitCode, 0);
  assert.match(result.stderr, /FITNESS-MODEL-RUN-NOT-BOUND-TO-CANDIDATE/u);
});

test("an unresolvable HEAD or an unreadable model is reported, never admitted as qualified", () => {
  assert.equal(typeof gates.fitnessModelQualificationObservation, "function");
  const noHead = observe(projectRoot(true), deps({ resolveHeadCommitFn: () => { throw new Error("no git"); } }));
  assert.match(noHead?.stderr ?? "", /FITNESS-MODEL-RUN-NOT-BOUND-TO-CANDIDATE/u);
  const unreadable = observe(projectRoot(true, "not json"), deps());
  assert.match(unreadable?.stderr ?? "", /FITNESS-MODEL-UNREADABLE/u);
});

test("any other command is not an implementation transition and is not observed", () => {
  assert.equal(typeof gates.fitnessModelQualificationObservation, "function");
  assert.equal(observe(projectRoot(true), deps({ evaluateArchitectureFitnessFn: () => { throw new Error("x"); } }), "echo hi"), null);
});
