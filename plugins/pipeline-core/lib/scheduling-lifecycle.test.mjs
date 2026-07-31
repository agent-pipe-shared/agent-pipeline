#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planParallelDispatch } from "./parallel-dispatch-planner.mjs";
import { createExecutionSubject, executionSubjectDigest } from "./execution-plane-contract.mjs";
import {
  composeSchedulingLifecycle,
  schedulingLifecycleDigest,
  schedulingPackageSetDigest,
  validateSchedulingLifecycle,
} from "./scheduling-lifecycle.mjs";

const A = "a".repeat(64), B = "b".repeat(64), O = "1".repeat(40);
const auth = [{ kind: "spec", sha256: A }];
const packages = [
  { id: "a", dependencies: [], writePaths: ["src/a.mjs"], resources: [], kind: "implementation" },
  { id: "b", dependencies: ["a"], writePaths: ["src/b.mjs"], resources: [], kind: "test" },
  { id: "c", dependencies: [], writePaths: ["src/c.mjs"], resources: [], kind: "review" },
  { id: "d", dependencies: ["b"], writePaths: ["src/d.mjs"], resources: [], kind: "test" },
];
const SCHEMA = JSON.parse(readFileSync(new URL("../scripts/scheduling-lifecycle.schema.json", import.meta.url), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

function schemaAccepts(value, root) {
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const typeMatches = (item, type) => {
    if (Array.isArray(type)) return type.some((entry) => typeMatches(item, entry));
    if (type === "null") return item === null;
    if (type === "array") return Array.isArray(item);
    if (type === "object") return item !== null && typeof item === "object" && !Array.isArray(item);
    if (type === "integer") return Number.isSafeInteger(item);
    return typeof item === type;
  };
  function valid(item, schema) {
    if (schema.$ref && !valid(item, root.$defs[schema.$ref.slice("#/$defs/".length)])) return false;
    if (Object.hasOwn(schema, "const") && !same(item, schema.const)) return false;
    if (schema.enum && !schema.enum.some((entry) => same(item, entry))) return false;
    if (schema.type && !typeMatches(item, schema.type)) return false;
    if (schema.oneOf && schema.oneOf.filter((entry) => valid(item, entry)).length !== 1) return false;
    if (schema.allOf && !schema.allOf.every((entry) => valid(item, entry))) return false;
    if (schema.if) {
      const branch = valid(item, schema.if) ? schema.then : schema.else;
      if (branch && !valid(item, branch)) return false;
    }
    if (typeof item === "string") {
      if (schema.minLength !== undefined && [...item].length < schema.minLength) return false;
      if (schema.maxLength !== undefined && [...item].length > schema.maxLength) return false;
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(item)) return false;
    }
    if (typeof item === "number" && schema.minimum !== undefined && item < schema.minimum) return false;
    if (Array.isArray(item)) {
      if (schema.maxItems !== undefined && item.length > schema.maxItems) return false;
      if (schema.uniqueItems && new Set(item.map((entry) => JSON.stringify(entry))).size !== item.length) return false;
      if (schema.items && !item.every((entry) => valid(entry, schema.items))) return false;
    }
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      if (schema.required && !schema.required.every((key) => Object.hasOwn(item, key))) return false;
      if (schema.additionalProperties === false && Object.keys(item).some((key) => !Object.hasOwn(schema.properties ?? {}, key))) return false;
      for (const [key, child] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(item, key) && !valid(item[key], child)) return false;
    }
    return true;
  }
  return valid(value, root);
}

function makeSubjects(packageList = packages, authorityDigests = auth) {
  return packageList.map((entry) => createExecutionSubject({
    repository: "self",
    baseCommit: O,
    baseTree: O,
    candidateCommit: O,
    candidateTree: O,
    packageId: entry.id,
    dispatchId: `dispatch-${entry.id}`,
    attempt: 0,
    queueRevision: 0,
    authorityDigests,
    writePaths: entry.writePaths,
    resources: entry.resources,
  }));
}
const subjects = makeSubjects();
const queue = (revision, packageList = packages) => ({ queueId: "nova", candidate: { commit: O, tree: O }, revision, packagesSha256: schedulingPackageSetDigest(packageList) });
const plannerInput = (completed = [], packageList = packages) => ({ schema: "pipeline.parallel-dispatch-input.v1", maxParallel: 2, reservedSlots: 0, completed, packages: packageList });
function terminalPackageIds(packageList, outcomes) {
  const result = new Set(outcomes.filter((entry) => entry.state !== "verified").map((entry) => entry.packageId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of packageList) if (!result.has(entry.id) && entry.dependencies.some((dependency) => result.has(dependency))) {
      result.add(entry.id);
      changed = true;
    }
  }
  return result;
}
function compose(revision, completed, prior = null, outcomes = [], options = {}) {
  const packageList = options.packages ?? packages;
  const input = plannerInput(completed, packageList);
  const terminal = terminalPackageIds(packageList, outcomes);
  const effective = { ...input, packages: packageList.filter((entry) => !terminal.has(entry.id)) };
  return composeSchedulingLifecycle({
    queue: options.queue ?? queue(revision, packageList),
    plannerInput: input,
    plannerReceipt: options.plannerReceipt ?? planParallelDispatch(effective),
    subjects: options.subjects ?? subjects,
    authorityDigests: options.authorityDigests ?? auth,
    prior,
    terminalOutcomes: outcomes,
  });
}
const terminal = (packageId, state, subject = subjects.find((entry) => entry.packageId === packageId)) => ({ packageId, state, evidenceSha256: A, subjectSha256: executionSubjectDigest(subject) });

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS SLC${String(passed).padStart(2, "0")} ${name}`);
};

check("publishes the exact closed scheduling root and nested queue/candidate/outcome shapes", () => {
  assert.equal(SCHEMA.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(SCHEMA.$id, "pipeline.scheduling-lifecycle.v1");
  assert.equal(SCHEMA.additionalProperties, false);
  assert.deepEqual(SCHEMA.required, ["schema", "queue", "plannerInputSha256", "plannerReceiptSha256", "subjectSetSha256", "revision", "selected", "blocked", "completed", "failed", "cancelled", "invalidated", "previousSha256"]);
  for (const name of ["queue", "candidate", "item"]) {
    assert.equal(SCHEMA.$defs[name].additionalProperties, false, name);
    assert.deepEqual(Object.keys(SCHEMA.$defs[name].properties).sort(), [...SCHEMA.$defs[name].required].sort(), name);
  }
});

check("keeps scheduling Schema and runtime admission parallel over the closed corpus", () => {
  const valid = compose(0, []);
  const corpus = [
    valid,
    { ...clone(valid), extra: true },
    { ...clone(valid), queue: { ...clone(valid.queue), rawWorkspace: "/private" } },
    { ...clone(valid), queue: { ...clone(valid.queue), candidate: { ...clone(valid.queue.candidate), branch: "private" } } },
    { ...clone(valid), selected: [{ ...clone(valid.selected[0]), rawReceipt: "provider-event" }] },
    { ...clone(valid), revision: 1 },
    { ...clone(valid), previousSha256: B },
    { ...clone(valid), selected: [{ ...clone(valid.selected[0]), reason: "success" }] },
  ];
  const expected = [true, false, false, false, false, false, false, false];
  corpus.forEach((record, index) => {
    const structural = schemaAccepts(record, SCHEMA);
    const runtime = validateSchedulingLifecycle(record).ok;
    assert.equal(structural && runtime, expected[index], `scheduling public corpus ${index}`);
    assert.equal(runtime, expected[index], `scheduling runtime corpus ${index}`);
  });
});

check("binds the exact maximum-cardinality frozen receipt and preserves every blocked reason", () => {
  const lifecycle = compose(0, []);
  assert.deepEqual(lifecycle.selected.map((entry) => entry.packageId), ["a", "c"]);
  assert.deepEqual(lifecycle.blocked.map((entry) => [entry.packageId, entry.reason]), [["b", "PDP-BLOCKED-DEPENDENCY:a"], ["d", "PDP-BLOCKED-DEPENDENCY:b"]]);
  assert.equal(lifecycle.queue.packagesSha256, schedulingPackageSetDigest(packages));
  assert.equal(Object.isFrozen(lifecycle.queue.candidate), true);
});

check("rejects unknown dependency/write/resource sets, overlapping authority and mixed candidates before planner admission", () => {
  const unknownDependency = clone(packages);
  unknownDependency[1].dependencies = ["missing"];
  assert.throws(() => composeSchedulingLifecycle({ queue: { ...queue(0), packagesSha256: A }, plannerInput: plannerInput([], unknownDependency), plannerReceipt: {}, subjects, authorityDigests: auth, prior: null, terminalOutcomes: [] }), /AUTHORITY:dependency-unknown/u);
  const unknownWrites = clone(packages);
  unknownWrites[0].writePaths = null;
  assert.throws(() => composeSchedulingLifecycle({ queue: { ...queue(0), packagesSha256: A }, plannerInput: plannerInput([], unknownWrites), plannerReceipt: {}, subjects, authorityDigests: auth, prior: null, terminalOutcomes: [] }), /AUTHORITY:packages/u);
  const unknownResources = clone(packages);
  unknownResources[0].resources = null;
  assert.throws(() => composeSchedulingLifecycle({ queue: { ...queue(0), packagesSha256: A }, plannerInput: plannerInput([], unknownResources), plannerReceipt: {}, subjects, authorityDigests: auth, prior: null, terminalOutcomes: [] }), /AUTHORITY:packages/u);
  const overlappingAuthority = [{ kind: "spec", sha256: A }, { kind: "spec", sha256: B }];
  assert.throws(() => compose(0, [], null, [], { authorityDigests: overlappingAuthority }), /AUTHORITY:authority-overlap/u);
  const mixed = makeSubjects();
  mixed[0] = createExecutionSubject({
    repository: "self", baseCommit: O, baseTree: O, candidateCommit: "2".repeat(40), candidateTree: O,
    packageId: "a", dispatchId: "dispatch-a", attempt: 0, queueRevision: 0, authorityDigests: auth,
    writePaths: packages[0].writePaths, resources: packages[0].resources,
  });
  assert.throws(() => compose(0, [], null, [], { subjects: mixed }), /AUTHORITY:subject/u);
});

check("scopes attempt identity to each dispatch while retaining global dispatch uniqueness", () => {
  const sharedAttemptSubjects = makeSubjects().map((subject) => {
    const { schema: _schema, ...input } = clone(subject);
    return createExecutionSubject({ ...input, attempt: 0 });
  });
  assert.deepEqual(compose(0, [], null, [], { subjects: sharedAttemptSubjects }).selected.map((entry) => entry.packageId), ["a", "c"]);
  const duplicateDispatchSubjects = [...sharedAttemptSubjects];
  const { schema: _schema, ...second } = clone(duplicateDispatchSubjects[1]);
  duplicateDispatchSubjects[1] = createExecutionSubject({ ...second, dispatchId: duplicateDispatchSubjects[0].dispatchId });
  assert.throws(() => compose(0, [], null, [], { subjects: duplicateDispatchSubjects }), /AUTHORITY:subject/u);
});

check("rejects handwritten/stale receipts, package-set drift and non-canonical package input", () => {
  const input = plannerInput([]);
  assert.throws(() => composeSchedulingLifecycle({ queue: queue(0), plannerInput: input, plannerReceipt: { ...planParallelDispatch(input), selected: [] }, subjects, authorityDigests: auth, prior: null, terminalOutcomes: [] }), /CONFLICT:planner-receipt/u);
  assert.throws(() => compose(0, [], null, [], { queue: { ...queue(0), packagesSha256: B } }), /AUTHORITY:package-set/u);
  const reversed = [...packages].reverse();
  assert.throws(() => composeSchedulingLifecycle({ queue: { ...queue(0), packagesSha256: A }, plannerInput: plannerInput([], reversed), plannerReceipt: {}, subjects, authorityDigests: auth, prior: null, terminalOutcomes: [] }), /AUTHORITY:packages/u);
});

check("imports only independently selected verified outcomes and binds revision/previous digest", () => {
  const first = compose(0, []);
  const prior = { lifecycle: first, lifecycleSha256: schedulingLifecycleDigest(first) };
  const next = compose(1, ["a"], prior, [terminal("a", "verified")]);
  assert.deepEqual(next.completed.map((entry) => entry.packageId), ["a"]);
  assert.equal(next.previousSha256, prior.lifecycleSha256);
  assert.deepEqual(next.selected.map((entry) => entry.packageId), ["b", "c"]);
  assert.throws(() => compose(1, [], prior, [terminal("b", "verified")]), /AUTHORITY:terminal-selection/u);
  assert.throws(() => compose(1, [], prior, [terminal("a", "succeeded-unverified")]), /SHAPE:terminal/u);
  assert.throws(() => compose(1, ["a"], { ...prior, lifecycleSha256: B }, [terminal("a", "verified")]), /STALE:prior/u);
  assert.throws(() => compose(1, [], null), /STALE:prior/u);
});

check("propagates failure, cancellation and invalidation transitively to the original terminal root", () => {
  const first = compose(0, []);
  const prior = { lifecycle: first, lifecycleSha256: schedulingLifecycleDigest(first) };
  const failed = compose(1, [], prior, [terminal("a", "failed")]);
  assert.deepEqual(failed.failed.map((entry) => [entry.packageId, entry.reason]), [["a", "failed"], ["b", "upstream-failed:a"], ["d", "upstream-failed:a"]]);
  assert.deepEqual(failed.selected.map((entry) => entry.packageId), ["c"]);
  const cancelled = compose(1, [], prior, [terminal("a", "cancelled")]);
  assert.deepEqual(cancelled.cancelled.map((entry) => [entry.packageId, entry.reason]), [["a", "cancelled"], ["b", "upstream-cancelled:a"], ["d", "upstream-cancelled:a"]]);
  const invalidated = compose(1, [], prior, [terminal("a", "invalidated")]);
  assert.deepEqual(invalidated.invalidated.map((entry) => [entry.packageId, entry.reason]), [["a", "invalidated"], ["b", "upstream-invalidated:a"], ["d", "upstream-invalidated:a"]]);
});

check("rejects replayed terminal evidence and duplicate/out-of-order terminal observations", () => {
  const first = compose(0, []);
  const firstPrior = { lifecycle: first, lifecycleSha256: schedulingLifecycleDigest(first) };
  const second = compose(1, ["a"], firstPrior, [terminal("a", "verified")]);
  const secondPrior = { lifecycle: second, lifecycleSha256: schedulingLifecycleDigest(second) };
  assert.throws(() => compose(2, ["a"], secondPrior, [terminal("a", "verified")]), /REPLAY:terminal/u);
  const raw = { queue: queue(1), plannerInput: plannerInput([]), plannerReceipt: {}, subjects, authorityDigests: auth, prior: firstPrior };
  assert.throws(() => composeSchedulingLifecycle({ ...raw, terminalOutcomes: [terminal("c", "failed"), terminal("a", "failed")] }), /SHAPE:terminal/u);
  assert.throws(() => composeSchedulingLifecycle({ ...raw, terminalOutcomes: [terminal("a", "failed"), terminal("a", "failed")] }), /SHAPE:terminal/u);
});

console.log(`${passed}/9 checks passed.`);
