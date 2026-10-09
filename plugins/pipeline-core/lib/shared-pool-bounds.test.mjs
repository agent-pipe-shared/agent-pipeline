#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { computeEffectiveCapacity } from "./local-worker-pool.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const names = ["configured", "operator", "certified", "observed", "pressure"];
const bound = (concurrentTasks, required = true) => ({ concurrentTasks, required });
const capacity = () => ({
  configured: bound(8),
  operator: bound(6),
  certified: bound(3),
  observed: bound(4),
  pressure: bound(5, false),
  reserved: { elephant: 1, verify: 1, critic: 0 },
});
const available = (concurrentTasks) => ({ status: "available", concurrentTasks, reasonCodes: [] });
const unavailable = (...reasonCodes) => ({ status: "unavailable", concurrentTasks: null, reasonCodes });

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function assertFrozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(assertFrozen);
  }
}

function expectCapacity(input, expected, label) {
  const before = structuredClone(input);
  deepFreeze(input);
  assertFrozen(input);
  try {
    assert.deepEqual(computeEffectiveCapacity(input), expected, label);
  } finally {
    assert.deepEqual(input, before, "capacity calculation must preserve every caller input");
    assertFrozen(input);
  }
}

const cases = [
  {
    id: "SP-BND01",
    name: "SP01 idle legacy role holds preserve the minimum known gross ceiling of three",
    run() {
      expectCapacity(capacity(), available(3), "8/6/3/4/5 with idle 1/1/0 must yield C=3");
    },
  },
  {
    id: "SP-BND02",
    name: "SP01 pressure bounds the shared ceiling at two without subtracting idle holds",
    run() {
      const input = capacity();
      input.pressure = bound(2, false);
      expectCapacity(input, available(2), "8/6/3/4/2 with idle 1/1/0 must yield C=2");
    },
  },
  {
    id: "SP-BND03",
    name: "SP02 required unknown bounds refuse with sorted reasons",
    run() {
      const input = capacity();
      input.certified = bound(null);
      expectCapacity(input, unavailable("UNKNOWN:certified"));
      const multipleUnknown = structuredClone(input);
      multipleUnknown.operator = bound(null);
      expectCapacity(multipleUnknown, unavailable("UNKNOWN:certified", "UNKNOWN:operator"));
    },
  },
  {
    id: "SP-BND04",
    name: "SP02 optional unknown pressure is omitted from the minimum",
    run() {
      const input = capacity();
      input.pressure = bound(null, false);
      input.reserved = { elephant: 0, verify: 0, critic: 0 };
      expectCapacity(input, available(3));
    },
  },
  {
    id: "SP-BND05",
    name: "SP02 all optional unknown bounds refuse rather than claiming capacity",
    run() {
      const input = capacity();
      for (const name of names) input[name] = bound(null, false);
      expectCapacity(input, unavailable("UNKNOWN:all"));
    },
  },
  {
    id: "SP-BND06",
    name: "SP02 each known zero remains a zero ceiling",
    run() {
      for (const name of names) {
        const input = capacity();
        input[name] = bound(0, name !== "pressure");
        expectCapacity(input, available(0), name);
      }
    },
  },
  {
    id: "SP-BND07",
    name: "SP02 malformed bounds refuse through the current exported API",
    run() {
      const malformed = [
        null, {}, bound(-1), bound(1.5), bound(Number.MAX_SAFE_INTEGER + 1),
        bound("3"), bound(3, "true"), { concurrentTasks: 3 },
        { concurrentTasks: 3, required: true, extra: true },
      ];
      for (const name of names) {
        for (const value of malformed) {
          const input = capacity();
          input[name] = structuredClone(value);
          expectCapacity(input, unavailable("SHAPE:capacity"), name);
        }
      }
    },
  },
  {
    id: "SP-BND08",
    name: "SP02 malformed legacy reservation declarations remain refused",
    run() {
      const malformed = [null, {}, { elephant: 1, verify: 1 },
        { elephant: 1, verify: 1, critic: 0, extra: 0 }];
      for (const name of ["elephant", "verify", "critic"]) {
        for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
          malformed.push({ elephant: 1, verify: 1, critic: 0, [name]: value });
        }
      }
      for (const value of malformed) {
        const input = capacity();
        input.reserved = value;
        expectCapacity(input, unavailable("SHAPE:capacity"));
      }
    },
  },
];

assert.equal(cases.length, 8, "the bounded SP-BND corpus must be declared before execution");
registerTestCaseCompletion({
  cases,
  fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"),
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
