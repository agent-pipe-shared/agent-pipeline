// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.shell-grammar-file-is-a-kernel-path-without-capability-placement (AC-255).
 *
 * Acceptance points:
 *   P1. The shell grammar file is a never-liftable kernel path.
 *   P2. Exactly one product-capability-inventory capability owns it (claude-hook-safety) and lists the
 *       three placement test paths as testEvidence.
 *   P3. architecture/map/pipeline-core.md declares it a public contract and harness/guard-split-map.json
 *       maps simpleWords / isReadOnlyDiagnosticCommand / isReadOnlySimpleWords to it.
 *   P4. harness/verify-suites.json registers suite shell-grammar-capability-placement-tests exactly once
 *       with caseIds RGCP001-RGCP004.
 *
 * Plain node test, no git fixtures. RED cases mutate in-memory copies of the real inputs, so the pin is
 * shown able to fail; production files are never edited.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { NEVER_LIFTABLE_KERNEL_PATHS, isNeverLiftableKernelPath } from "../guard-maintenance-window.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const GRAMMAR = "plugins/pipeline-core/lib/guard/shell-grammar.mjs";
const OWN_TEST = "harness/scripts/shell-grammar-capability-placement.test.mjs";
const SPLIT_TEST = "plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs";
const CLOSURE_TEST = "plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs";
const SUITE = "shell-grammar-capability-placement-tests";
const CASE_IDS = ["RGCP001", "RGCP002", "RGCP003", "RGCP004"];

const readText = (rel) => readFileSync(join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(readText(rel));
const live = () => ({
  inventory: readJson("docs/product-capability-inventory.json"),
  split: readJson("harness/guard-split-map.json"),
  registry: readJson("harness/verify-suites.json"),
  map: readText("architecture/map/pipeline-core.md"),
});

function checkKernel() {
  assert.ok(NEVER_LIFTABLE_KERNEL_PATHS.includes(GRAMMAR), "grammar path in NEVER_LIFTABLE_KERNEL_PATHS");
  assert.equal(isNeverLiftableKernelPath(join(ROOT, GRAMMAR), { rootDir: ROOT }), true, "grammar path is never-liftable");
}
function checkInventory(v) {
  const owners = v.inventory.capabilities.filter((c) => (c.productionEvidence ?? []).includes(GRAMMAR));
  assert.equal(owners.length, 1, "exactly one capability owns the grammar path");
  assert.equal(owners[0].id, "claude-hook-safety", "owner is claude-hook-safety");
  for (const p of [OWN_TEST, SPLIT_TEST, CLOSURE_TEST]) {
    assert.ok(owners[0].testEvidence.includes(p), `missing placement testEvidence: ${p}`);
  }
}
function checkMapAndSplit(v) {
  assert.ok(v.map.split("\n").includes(`  - ${GRAMMAR}`), "grammar declared a pipeline-core contract");
  for (const name of ["simpleWords", "isReadOnlyDiagnosticCommand", "isReadOnlySimpleWords"]) {
    assert.equal(v.split.declarations[name], "shell-grammar", `split map owner of ${name}`);
  }
}
function checkRegistry(v) {
  const rows = v.registry.suites.filter((s) => s.name === SUITE);
  assert.equal(rows.length, 1, `suite ${SUITE} registered exactly once in harness/verify-suites.json`);
  assert.equal(rows[0].file, OWN_TEST);
  assert.deepEqual(rows[0].caseCompletion?.caseIds, CASE_IDS);
}

test("P1 grammar file is a never-liftable kernel path", () => checkKernel());
test("P2 exactly one capability (claude-hook-safety) places the grammar with its three tests", () => checkInventory(live()));
test("P3 architecture map contract and guard-split-map ownership", () => checkMapAndSplit(live()));
test("P4 verify-suites registers the placement suite exactly once with RGCP001-RGCP004", () => checkRegistry(live()));

test("RED P2 inventory without the grammar path, or with a duplicate owner, is detected", () => {
  const missing = live();
  const hook = missing.inventory.capabilities.find((c) => c.id === "claude-hook-safety");
  hook.productionEvidence = hook.productionEvidence.filter((p) => p !== GRAMMAR);
  assert.throws(() => checkInventory(missing), /exactly one capability/);
  const dup = live();
  dup.inventory.capabilities.find((c) => c.id !== "claude-hook-safety").productionEvidence.push(GRAMMAR);
  assert.throws(() => checkInventory(dup), /exactly one capability/);
  const noTest = live();
  const h = noTest.inventory.capabilities.find((c) => c.id === "claude-hook-safety");
  h.testEvidence = h.testEvidence.filter((p) => p !== CLOSURE_TEST);
  assert.throws(() => checkInventory(noTest), /missing placement testEvidence/);
});
test("RED P3 dropped contract line or wrong split owner is detected", () => {
  const a = live();
  a.map = a.map.replace(`  - ${GRAMMAR}\n`, "");
  assert.throws(() => checkMapAndSplit(a), /declared a pipeline-core contract/);
  const b = live();
  b.split.declarations.simpleWords = "read-scope";
  assert.throws(() => checkMapAndSplit(b), /split map owner of simpleWords/);
});
test("RED P4 missing, duplicated or mismatched suite registration is detected", () => {
  const none = live();
  none.registry.suites = none.registry.suites.filter((s) => s.name !== SUITE);
  assert.throws(() => checkRegistry(none), /exactly once/);
  const twice = live();
  twice.registry.suites.push({ name: SUITE, file: OWN_TEST, caseCompletion: { caseIds: CASE_IDS } });
  twice.registry.suites.push({ name: SUITE, file: OWN_TEST, caseCompletion: { caseIds: CASE_IDS } });
  assert.throws(() => checkRegistry(twice), /exactly once/);
  const wrong = live();
  wrong.registry.suites = wrong.registry.suites.filter((s) => s.name !== SUITE);
  wrong.registry.suites.push({ name: SUITE, file: "harness/scripts/foreign.test.mjs", caseCompletion: { caseIds: CASE_IDS } });
  assert.throws(() => checkRegistry(wrong));
});
test("RED P1 a path list without the grammar is detected", () => {
  assert.equal(NEVER_LIFTABLE_KERNEL_PATHS.filter((p) => p !== GRAMMAR).includes(GRAMMAR), false);
});
