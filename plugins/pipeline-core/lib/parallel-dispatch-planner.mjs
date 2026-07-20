// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic, runner-neutral planner for one parallel dispatch wave.
 *
 * Input (`pipeline.parallel-dispatch-input.v1`):
 *   { schema, maxParallel, reservedSlots, completed, packages }
 * Each package is exactly { id, dependencies, writePaths, resources, kind }.
 * `id`, dependency IDs, resource IDs and `kind` are stable safe IDs; write paths
 * are repository-relative. `completed` contains known package IDs that are already
 * finished. The planner never assigns a model, runner, worktree, or command.
 *
 * The returned `pipeline.parallel-dispatch-receipt.v1` selects the lexicographically
 * first largest conflict-free subset of ready packages. A package conflicts when its
 * write path overlaps (same path or ancestor/descendant) or it claims the same
 * resource. Its receipt names every serialization reason, so callers can reject a
 * hand-written or stale plan with `validateParallelDispatchReceipt`.
 */

export const PARALLEL_DISPATCH_INPUT_SCHEMA = "pipeline.parallel-dispatch-input.v1";
export const PARALLEL_DISPATCH_RECEIPT_SCHEMA = "pipeline.parallel-dispatch-receipt.v1";

export const PARALLEL_DISPATCH_BLOCKED_CODES = Object.freeze({
  DEPENDENCY: "PDP-BLOCKED-DEPENDENCY",
  WRITE_PATH: "PDP-BLOCKED-WRITE-PATH",
  RESOURCE: "PDP-BLOCKED-RESOURCE",
  CAPACITY: "PDP-BLOCKED-CAPACITY",
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_PACKAGES = 32;
const INPUT_KEYS = ["schema", "maxParallel", "reservedSlots", "completed", "packages"];
const PACKAGE_KEYS = ["id", "dependencies", "writePaths", "resources", "kind"];

export class ParallelDispatchPlannerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ParallelDispatchPlannerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ParallelDispatchPlannerError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function canonicalRepoPath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && value !== "."
    && !value.includes("\\")
    && !value.startsWith("/")
    && !/^[A-Za-z]:/.test(value)
    && !value.startsWith("./")
    && !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function canonicalStringList(value, predicate) {
  if (!Array.isArray(value)) return null;
  const sorted = [...value].sort();
  if (!sorted.every(predicate) || new Set(sorted).size !== sorted.length) return null;
  return sorted;
}

function compareLists(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return left.length - right.length;
}

function compareIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function overlappingPaths(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function packageConflict(left, right) {
  const writePath = left.writePaths.some((leftPath) => right.writePaths.some((rightPath) => overlappingPaths(leftPath, rightPath)));
  if (writePath) return PARALLEL_DISPATCH_BLOCKED_CODES.WRITE_PATH;
  const resource = left.resources.some((entry) => right.resources.includes(entry));
  return resource ? PARALLEL_DISPATCH_BLOCKED_CODES.RESOURCE : null;
}

function normalizedInput(input) {
  if (!hasExactKeys(input, INPUT_KEYS)) fail("PDP-INPUT-SHAPE", "Input must have exactly the parallel dispatch input fields.");
  if (input.schema !== PARALLEL_DISPATCH_INPUT_SCHEMA) fail("PDP-INPUT-SCHEMA", "Unsupported parallel dispatch input schema.");
  if (!Number.isSafeInteger(input.maxParallel) || input.maxParallel < 1 || input.maxParallel > MAX_PACKAGES) {
    fail("PDP-MAX-PARALLEL", `maxParallel must be an integer from 1 to ${MAX_PACKAGES}.`);
  }
  if (!Number.isSafeInteger(input.reservedSlots) || input.reservedSlots < 0 || input.reservedSlots > input.maxParallel) {
    fail("PDP-RESERVED-SLOTS", "reservedSlots must not exceed maxParallel.");
  }
  if (!Array.isArray(input.packages) || input.packages.length === 0 || input.packages.length > MAX_PACKAGES) {
    fail("PDP-PACKAGE-LIMIT", `packages must contain from 1 to ${MAX_PACKAGES} entries.`);
  }

  const packages = input.packages.map((entry) => {
    if (!hasExactKeys(entry, PACKAGE_KEYS) || !safeId(entry.id) || !safeId(entry.kind)) {
      fail("PDP-PACKAGE-SHAPE", "Each package must carry only a stable id, dependencies, writePaths, resources, and kind.");
    }
    const dependencies = canonicalStringList(entry.dependencies, safeId);
    const writePaths = canonicalStringList(entry.writePaths, canonicalRepoPath);
    const resources = canonicalStringList(entry.resources, safeId);
    if (dependencies === null || writePaths === null || resources === null) {
      fail("PDP-PACKAGE-LISTS", `Package ${entry.id} has an invalid or duplicate dependency, path, or resource.`);
    }
    return { id: entry.id, dependencies, writePaths, resources, kind: entry.kind };
  }).sort((left, right) => compareIds(left.id, right.id));

  if (new Set(packages.map((entry) => entry.id)).size !== packages.length) {
    fail("PDP-PACKAGE-DUPLICATE", "Package IDs must be unique.");
  }
  const packageIds = new Set(packages.map((entry) => entry.id));
  const completed = canonicalStringList(input.completed, safeId);
  if (completed === null || completed.some((id) => !packageIds.has(id))) {
    fail("PDP-COMPLETED", "completed must contain unique known package IDs.");
  }
  for (const entry of packages) {
    if (entry.dependencies.some((id) => !packageIds.has(id))) {
      fail("PDP-DEPENDENCY-UNKNOWN", `Package ${entry.id} names an unknown dependency.`);
    }
  }

  const byId = new Map(packages.map((entry) => [entry.id, entry]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail("PDP-DEPENDENCY-CYCLE", "Package dependencies must form a DAG.");
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const entry of packages) visit(entry.id);

  return {
    maxParallel: input.maxParallel,
    reservedSlots: input.reservedSlots,
    completed: new Set(completed),
    packages,
    byId,
  };
}

function maximumIndependentCount(candidates, capacity, conflictByPair) {
  let best = 0;
  function search(remaining, chosen) {
    if (chosen === capacity) {
      best = capacity;
      return;
    }
    if (chosen + Math.min(capacity - chosen, remaining.length) <= best) return;
    if (remaining.length === 0) {
      best = Math.max(best, chosen);
      return;
    }
    const [first, ...rest] = remaining;
    const compatible = rest.filter((id) => conflictByPair.get(`${first}\u0000${id}`) === null);
    search(compatible, chosen + 1);
    search(rest, chosen);
  }
  search(candidates, 0);
  return best;
}

function largestSafeSet(ready, capacity, conflictByPair) {
  if (capacity === 0 || ready.length === 0) return [];
  const target = maximumIndependentCount(ready, capacity, conflictByPair);
  const selected = [];
  for (let index = 0; index < ready.length && selected.length < target; index += 1) {
    const id = ready[index];
    if (selected.some((other) => conflictByPair.get(`${other}\u0000${id}`) !== null)) continue;
    const remaining = ready.slice(index + 1).filter((other) => !selected.some((chosen) => conflictByPair.get(`${chosen}\u0000${other}`) !== null)
      && conflictByPair.get(`${id}\u0000${other}`) === null);
    const possible = selected.length + 1 + maximumIndependentCount(remaining, capacity - selected.length - 1, conflictByPair);
    if (possible >= target) selected.push(id);
  }
  return selected;
}

function remainingCriticalPath(model) {
  const memo = new Map();
  function visit(id) {
    if (model.completed.has(id)) return { length: 0, packages: [] };
    if (memo.has(id)) return memo.get(id);
    let best = { length: 0, packages: [] };
    for (const dependency of model.byId.get(id).dependencies) {
      const candidate = visit(dependency);
      if (candidate.length > best.length || (candidate.length === best.length && compareLists(candidate.packages, best.packages) < 0)) {
        best = candidate;
      }
    }
    const result = { length: best.length + 1, packages: [...best.packages, id] };
    memo.set(id, result);
    return result;
  }
  let critical = { length: 0, packages: [] };
  for (const entry of model.packages) {
    const candidate = visit(entry.id);
    if (candidate.length > critical.length || (candidate.length === critical.length && compareLists(candidate.packages, critical.packages) < 0)) {
      critical = candidate;
    }
  }
  return critical;
}

function plannerReceipt(input) {
  const model = normalizedInput(input);
  const availableSlots = model.maxParallel - model.reservedSlots;
  const remaining = model.packages.filter((entry) => !model.completed.has(entry.id));
  const ready = remaining.filter((entry) => entry.dependencies.every((id) => model.completed.has(id))).map((entry) => entry.id);
  const conflictByPair = new Map();
  for (const left of ready) {
    for (const right of ready) {
      const conflict = left === right ? null : packageConflict(model.byId.get(left), model.byId.get(right));
      conflictByPair.set(`${left}\u0000${right}`, conflict);
    }
  }
  const selected = largestSafeSet(ready, availableSlots, conflictByPair);
  const selectedSet = new Set(selected);
  const peakReady = maximumIndependentCount(ready, ready.length, conflictByPair);
  const blocked = [];
  for (const entry of remaining) {
    if (selectedSet.has(entry.id)) continue;
    const uncompletedDependencies = entry.dependencies.filter((id) => !model.completed.has(id));
    if (uncompletedDependencies.length > 0) {
      blocked.push({ id: entry.id, code: PARALLEL_DISPATCH_BLOCKED_CODES.DEPENDENCY, blockers: uncompletedDependencies });
      continue;
    }
    const pathBlockers = selected.filter((id) => conflictByPair.get(`${entry.id}\u0000${id}`) === PARALLEL_DISPATCH_BLOCKED_CODES.WRITE_PATH);
    if (pathBlockers.length > 0) {
      blocked.push({ id: entry.id, code: PARALLEL_DISPATCH_BLOCKED_CODES.WRITE_PATH, blockers: pathBlockers });
      continue;
    }
    const resourceBlockers = selected.filter((id) => conflictByPair.get(`${entry.id}\u0000${id}`) === PARALLEL_DISPATCH_BLOCKED_CODES.RESOURCE);
    if (resourceBlockers.length > 0) {
      blocked.push({ id: entry.id, code: PARALLEL_DISPATCH_BLOCKED_CODES.RESOURCE, blockers: resourceBlockers });
      continue;
    }
    blocked.push({ id: entry.id, code: PARALLEL_DISPATCH_BLOCKED_CODES.CAPACITY, blockers: [] });
  }
  const criticalPath = remainingCriticalPath(model);
  return {
    schema: PARALLEL_DISPATCH_RECEIPT_SCHEMA,
    ready,
    selected,
    blocked,
    unusedSlots: availableSlots - selected.length,
    concurrency: {
      maxParallel: model.maxParallel,
      reservedSlots: model.reservedSlots,
      availableSlots,
      selected: selected.length,
      peakReady,
    },
    criticalPath,
  };
}

/** Plan one deterministic, maximum-cardinality parallel wave. */
export function planParallelDispatch(input) {
  return plannerReceipt(input);
}

function hasUnexplainedSerialization(expected, receipt) {
  if (!isObject(receipt) || !Array.isArray(receipt.selected) || !Array.isArray(receipt.blocked)) return true;
  const selected = new Set(receipt.selected);
  for (const id of expected.ready) {
    if (selected.has(id)) continue;
    const expectedBlocked = expected.blocked.find((entry) => entry.id === id);
    const actualBlocked = receipt.blocked.find((entry) => entry?.id === id);
    if (actualBlocked === undefined || canonicalJson(actualBlocked) !== canonicalJson(expectedBlocked)) return true;
  }
  return false;
}

/**
 * Recomputes a receipt from the caller-held input. Any omitted or altered reason
 * for a ready but unselected package is rejected as unexplained serialization.
 */
export function validateParallelDispatchReceipt(input, receipt) {
  let expected;
  try {
    expected = plannerReceipt(input);
  } catch (error) {
    return {
      ok: false,
      code: error instanceof ParallelDispatchPlannerError ? error.code : "PDP-INPUT-INVALID",
    };
  }
  if (hasUnexplainedSerialization(expected, receipt)) {
    return { ok: false, code: "PDP-RECEIPT-UNEXPLAINED-SERIALIZATION" };
  }
  if (canonicalJson(receipt) !== canonicalJson(expected)) {
    return { ok: false, code: "PDP-RECEIPT-MISMATCH" };
  }
  return { ok: true, code: "PDP-RECEIPT-VALID" };
}
