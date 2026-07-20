#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import {
  PARALLEL_DISPATCH_BLOCKED_CODES,
  ParallelDispatchPlannerError,
  planParallelDispatch,
  validateParallelDispatchReceipt,
} from "./parallel-dispatch-planner.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`PASS PDP${String(passed).padStart(2, "0")} ${name}\n`);
}

function input(overrides = {}) {
  return {
    schema: "pipeline.parallel-dispatch-input.v1",
    maxParallel: 4,
    reservedSlots: 1,
    completed: ["design.contract"],
    packages: [
      { id: "impl.api", dependencies: ["design.contract"], writePaths: ["src/api.mjs"], resources: ["service:api"], kind: "implementation" },
      { id: "impl.docs", dependencies: ["design.contract"], writePaths: ["docs/api.md"], resources: [], kind: "implementation" },
      { id: "impl.ui", dependencies: ["design.contract"], writePaths: ["src/ui.mjs"], resources: ["service:web"], kind: "implementation" },
      { id: "review.api", dependencies: ["impl.api"], writePaths: [], resources: [], kind: "review" },
      { id: "test.api", dependencies: ["impl.api"], writePaths: ["tests/api.test.mjs"], resources: [], kind: "test" },
      { id: "design.contract", dependencies: [], writePaths: ["specs/contract.md"], resources: [], kind: "design" },
    ],
    ...overrides,
  };
}

check("selects the largest safe ready set across design, implementation, test, and review packages", () => {
  const receipt = planParallelDispatch(input());
  assert.deepEqual(receipt.ready, ["impl.api", "impl.docs", "impl.ui"]);
  assert.deepEqual(receipt.selected, ["impl.api", "impl.docs", "impl.ui"]);
  assert.deepEqual(receipt.blocked, [
    { id: "review.api", code: PARALLEL_DISPATCH_BLOCKED_CODES.DEPENDENCY, blockers: ["impl.api"] },
    { id: "test.api", code: PARALLEL_DISPATCH_BLOCKED_CODES.DEPENDENCY, blockers: ["impl.api"] },
  ]);
  assert.deepEqual(receipt.concurrency, { maxParallel: 4, reservedSlots: 1, availableSlots: 3, selected: 3, peakReady: 3 });
  assert.equal(receipt.unusedSlots, 0);
  assert.deepEqual(receipt.criticalPath, { length: 2, packages: ["impl.api", "review.api"] });
});

check("serializes overlapping write paths with a stable reason and lexicographic tie-break", () => {
  const receipt = planParallelDispatch(input({
    maxParallel: 3,
    reservedSlots: 0,
    packages: [
      { id: "beta", dependencies: [], writePaths: ["src/api/routes.mjs"], resources: [], kind: "implementation" },
      { id: "alpha", dependencies: [], writePaths: ["src/api"], resources: [], kind: "implementation" },
      { id: "docs", dependencies: [], writePaths: ["docs/api.md"], resources: [], kind: "design" },
    ],
    completed: [],
  }));
  assert.deepEqual(receipt.ready, ["alpha", "beta", "docs"]);
  assert.deepEqual(receipt.selected, ["alpha", "docs"]);
  assert.deepEqual(receipt.blocked, [
    { id: "beta", code: PARALLEL_DISPATCH_BLOCKED_CODES.WRITE_PATH, blockers: ["alpha"] },
  ]);
  assert.equal(receipt.concurrency.peakReady, 2);
});

check("finds a maximum safe wave instead of using a greedy first-ready selection", () => {
  const receipt = planParallelDispatch(input({
    maxParallel: 2,
    reservedSlots: 0,
    packages: [
      { id: "alpha", dependencies: [], writePaths: ["src"], resources: [], kind: "design" },
      { id: "beta", dependencies: [], writePaths: ["src/beta.mjs"], resources: [], kind: "implementation" },
      { id: "gamma", dependencies: [], writePaths: ["src/gamma.mjs"], resources: [], kind: "test" },
    ],
    completed: [],
  }));
  assert.deepEqual(receipt.selected, ["beta", "gamma"]);
  assert.deepEqual(receipt.blocked, [
    { id: "alpha", code: PARALLEL_DISPATCH_BLOCKED_CODES.WRITE_PATH, blockers: ["beta", "gamma"] },
  ]);
});

check("serializes shared resources without treating distinct write paths as safe", () => {
  const receipt = planParallelDispatch(input({
    maxParallel: 3,
    reservedSlots: 0,
    packages: [
      { id: "first", dependencies: [], writePaths: ["src/one.mjs"], resources: ["database:migration"], kind: "implementation" },
      { id: "second", dependencies: [], writePaths: ["src/two.mjs"], resources: ["database:migration"], kind: "test" },
      { id: "third", dependencies: [], writePaths: ["src/three.mjs"], resources: [], kind: "review" },
    ],
    completed: [],
  }));
  assert.deepEqual(receipt.selected, ["first", "third"]);
  assert.deepEqual(receipt.blocked, [
    { id: "second", code: PARALLEL_DISPATCH_BLOCKED_CODES.RESOURCE, blockers: ["first"] },
  ]);
});

check("uses a capacity reason only after every conflict-free slot is filled", () => {
  const receipt = planParallelDispatch(input({
    maxParallel: 2,
    reservedSlots: 1,
    packages: [
      { id: "alpha", dependencies: [], writePaths: ["src/a.mjs"], resources: [], kind: "design" },
      { id: "beta", dependencies: [], writePaths: ["src/b.mjs"], resources: [], kind: "implementation" },
    ],
    completed: [],
  }));
  assert.deepEqual(receipt.selected, ["alpha"]);
  assert.deepEqual(receipt.blocked, [
    { id: "beta", code: PARALLEL_DISPATCH_BLOCKED_CODES.CAPACITY, blockers: [] },
  ]);
  assert.equal(receipt.unusedSlots, 0);
});

check("permits every slot to be reserved and explains the resulting serialization", () => {
  const receipt = planParallelDispatch(input({
    maxParallel: 1,
    reservedSlots: 1,
    packages: [
      { id: "alpha", dependencies: [], writePaths: ["src/a.mjs"], resources: [], kind: "design" },
    ],
    completed: [],
  }));
  assert.deepEqual(receipt.selected, []);
  assert.deepEqual(receipt.blocked, [
    { id: "alpha", code: PARALLEL_DISPATCH_BLOCKED_CODES.CAPACITY, blockers: [] },
  ]);
  assert.equal(receipt.unusedSlots, 0);
});

check("reports unused capacity when conflicts, rather than arbitrary serialization, prevent another dispatch", () => {
  const receipt = planParallelDispatch(input({
    maxParallel: 4,
    reservedSlots: 0,
    packages: [
      { id: "alpha", dependencies: [], writePaths: ["src/api"], resources: [], kind: "implementation" },
      { id: "beta", dependencies: [], writePaths: ["src/api/route.mjs"], resources: [], kind: "implementation" },
    ],
    completed: [],
  }));
  assert.deepEqual(receipt.selected, ["alpha"]);
  assert.equal(receipt.unusedSlots, 3);
  assert.deepEqual(receipt.blocked, [
    { id: "beta", code: PARALLEL_DISPATCH_BLOCKED_CODES.WRITE_PATH, blockers: ["alpha"] },
  ]);
});

check("critical path excludes completed work and remains deterministic across input order", () => {
  const base = input({
    maxParallel: 3,
    reservedSlots: 0,
    completed: ["a"],
    packages: [
      { id: "d", dependencies: ["b"], writePaths: [], resources: [], kind: "review" },
      { id: "c", dependencies: ["a"], writePaths: [], resources: [], kind: "test" },
      { id: "b", dependencies: ["a"], writePaths: [], resources: [], kind: "implementation" },
      { id: "a", dependencies: [], writePaths: [], resources: [], kind: "design" },
    ],
  });
  const reordered = { ...base, packages: [...base.packages].reverse() };
  assert.deepEqual(planParallelDispatch(base), planParallelDispatch(reordered));
  assert.deepEqual(planParallelDispatch(base).criticalPath, { length: 2, packages: ["b", "d"] });
});

check("validates a caller-held receipt and rejects an omitted ready-package explanation", () => {
  const source = input({
    maxParallel: 2,
    reservedSlots: 1,
    packages: [
      { id: "alpha", dependencies: [], writePaths: ["src/a.mjs"], resources: [], kind: "design" },
      { id: "beta", dependencies: [], writePaths: ["src/b.mjs"], resources: [], kind: "implementation" },
    ],
    completed: [],
  });
  const receipt = planParallelDispatch(source);
  assert.deepEqual(validateParallelDispatchReceipt(source, receipt), { ok: true, code: "PDP-RECEIPT-VALID" });
  assert.deepEqual(validateParallelDispatchReceipt(source, { ...receipt, blocked: [] }), {
    ok: false,
    code: "PDP-RECEIPT-UNEXPLAINED-SERIALIZATION",
  });
});

check("fails closed for unknown dependencies, cycles, and malformed package contracts", () => {
  assert.throws(() => planParallelDispatch(input({ packages: [
    { id: "alpha", dependencies: ["missing"], writePaths: [], resources: [], kind: "design" },
  ], completed: [] })), (error) => error instanceof ParallelDispatchPlannerError && error.code === "PDP-DEPENDENCY-UNKNOWN");
  assert.throws(() => planParallelDispatch(input({ packages: [
    { id: "alpha", dependencies: ["beta"], writePaths: [], resources: [], kind: "design" },
    { id: "beta", dependencies: ["alpha"], writePaths: [], resources: [], kind: "implementation" },
  ], completed: [] })), (error) => error instanceof ParallelDispatchPlannerError && error.code === "PDP-DEPENDENCY-CYCLE");
  assert.throws(() => planParallelDispatch(input({ packages: [
    { id: "alpha", dependencies: [], writePaths: ["../outside"], resources: [], kind: "design" },
  ], completed: [] })), (error) => error instanceof ParallelDispatchPlannerError && error.code === "PDP-PACKAGE-LISTS");
});

process.stdout.write(`${passed}/10 checks passed.\n`);
