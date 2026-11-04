// SPDX-License-Identifier: SUL-1.0
/**
 * Slices follow modules (candidate 19, M1.4). A pure, read-only proposal: given the modules of an approved architecture design
 * (`id`, `ownedPaths`, `allowedDependencies`), it cuts one implementation slice per module, orders the slices in waves from the
 * dependency edges and serializes modules whose owned paths overlap, so that every slice of a wave has a write scope that no other
 * slice of that wave touches. It writes no queue, dispatches nothing and decides nothing: the output is the `slice-queue add`
 * arguments a human or the Elephant may run. `lib/slice-queue.mjs` stays the only judge of a queue (its `validateSliceQueue` runs
 * on every `add`).
 *
 * Direction of the edges: a module that may depend on another module (`allowedDependencies`) is implemented after it, so its slice
 * `dependsOn` the slice of the module it depends on.
 */
import { DEFAULT_SHARED_SURFACES, normalizeScope, scopesOverlap } from "./slice-queue.mjs";

export const MODULE_SLICE_PROPOSAL_SCHEMA = "pipeline.module-slice-proposal.v1";
export const MAX_MODULES = 64;
export const MAX_OWNED_PATHS = 32;
const MODULE_ID = /^[a-z][a-z0-9-]*$/u;

const refuse = (code, reason, extra = {}) => ({ ok: false, schema: MODULE_SLICE_PROPOSAL_SCHEMA, code, reason, ...extra });

function validate(modules) {
  if (!Array.isArray(modules) || modules.length === 0) return refuse("MSP-INPUT", "modules must be a non-empty array");
  if (modules.length > MAX_MODULES) return refuse("MSP-INPUT", `at most ${MAX_MODULES} modules are supported`);
  const ids = new Set();
  for (const [index, module] of modules.entries()) {
    const where = `modules[${index}]`;
    if (module === null || typeof module !== "object" || Array.isArray(module)) return refuse("MSP-INPUT", `${where} must be an object`);
    if (typeof module.id !== "string" || !MODULE_ID.test(module.id)) return refuse("MSP-INPUT", `${where}.id must match ${MODULE_ID}`);
    if (ids.has(module.id)) return refuse("MSP-INPUT", `duplicate module id ${module.id}`);
    ids.add(module.id);
    if (!Array.isArray(module.ownedPaths) || module.ownedPaths.length === 0 || module.ownedPaths.length > MAX_OWNED_PATHS) {
      return refuse("MSP-INPUT", `${where}.ownedPaths must hold 1 to ${MAX_OWNED_PATHS} paths`);
    }
    for (const scope of module.ownedPaths) {
      const normalized = normalizeScope(scope);
      if (!normalized.ok) return refuse("MSP-INPUT", `${where}.ownedPaths: ${normalized.reason}`);
      // `slice-queue add` splits a repeated flag value on commas; a brace scope would be cut apart there.
      if (typeof scope !== "string" || scope.includes(",")) return refuse("MSP-INPUT", `${where}.ownedPaths: a scope with a comma cannot be passed to slice-queue add`);
    }
    if (module.allowedDependencies !== undefined && !Array.isArray(module.allowedDependencies)) return refuse("MSP-INPUT", `${where}.allowedDependencies must be an array`);
  }
  for (const module of modules) {
    for (const dependency of module.allowedDependencies ?? []) {
      if (!ids.has(dependency)) return refuse("MSP-INPUT", `module ${module.id} depends on unknown module ${String(dependency).slice(0, 64)}`);
      if (dependency === module.id) return refuse("MSP-INPUT", `module ${module.id} depends on itself`);
    }
  }
  return null;
}

/** Transitive reachability over `edges` (module id -> ids it depends on). */
function reaches(edges, from, to) {
  const seen = new Set();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const next of edges.get(current) ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return false;
}

function findCycle(edges, ids) {
  const state = new Map();
  const visit = (id, path) => {
    state.set(id, 1);
    for (const next of edges.get(id) ?? []) {
      if (state.get(next) === 1) return [...path.slice(path.indexOf(next)), id].sort();
      if (!state.has(next)) { const found = visit(next, [...path, id]); if (found) return found; }
    }
    state.set(id, 2);
    return null;
  };
  for (const id of ids) if (!state.has(id)) { const found = visit(id, []); if (found) return found; }
  return null;
}

/**
 * @param {Array<{id: string, ownedPaths: string[], allowedDependencies?: string[]}>} modules
 * @returns the proposal `{ok: true, waves, slices, serialized, addCommands}` or a refusal `{ok: false, code, reason}`; never throws
 */
export function proposeSlicesFromModules(modules) {
  try {
    const invalid = validate(modules);
    if (invalid) return invalid;
    const ids = modules.map((module) => module.id).sort();
    const byId = new Map(modules.map((module) => [module.id, module]));
    const edges = new Map(ids.map((id) => [id, new Set(byId.get(id).allowedDependencies ?? [])]));
    const cycle = findCycle(edges, ids);
    if (cycle) return refuse("MSP-CYCLE", `the module dependencies form a cycle (${cycle.join(", ")}); a cycle cannot be ordered into waves`, { members: cycle });

    // Modules whose owned paths overlap must not be written at the same time: the later id waits for the earlier one,
    // unless the dependency edges already order the two.
    const serialized = [];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const [first, second] = [ids[i], ids[j]];
        if (!scopesOverlap(byId.get(first).ownedPaths, byId.get(second).ownedPaths)) continue;
        if (reaches(edges, first, second) || reaches(edges, second, first)) continue;
        edges.get(second).add(first);
        serialized.push({ after: first, before: second, reason: "owned paths overlap" });
      }
    }

    const wave = new Map();
    const waveOf = (id) => {
      if (wave.has(id)) return wave.get(id);
      let depth = 0;
      for (const dependency of edges.get(id)) depth = Math.max(depth, waveOf(dependency) + 1);
      wave.set(id, depth);
      return depth;
    };
    ids.forEach(waveOf);

    const sliceId = (id) => `slice-${id}`;
    const slices = ids.map((id) => ({
      id: sliceId(id),
      moduleId: id,
      title: `Implement module ${id}`,
      writeScope: [...byId.get(id).ownedPaths],
      dependsOn: [...edges.get(id)].sort().map(sliceId),
      wave: wave.get(id),
    })).sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id));
    const waves = [];
    for (const slice of slices) (waves[slice.wave] ??= []).push(slice.id);
    const addCommands = slices.map((slice) => ({
      sliceId: slice.id,
      argv: ["add", "--id", slice.id, "--title", slice.title,
        ...slice.writeScope.flatMap((scope) => ["--write-scope", scope]),
        ...(slice.dependsOn.length > 0 ? ["--depends-on", slice.dependsOn.join(",")] : [])],
    }));
    // The queue library refuses a write scope that covers a file only the Elephant writes (a shared surface); say so up front.
    const warnings = [];
    for (const slice of slices) {
      const surface = DEFAULT_SHARED_SURFACES.find((candidate) => scopesOverlap(slice.writeScope, [candidate]));
      if (surface !== undefined) {
        warnings.push({ code: "MSP-SHARED-SURFACE", sliceId: slice.id, surface, message: `the queue refuses the write scope of ${slice.id}: it covers ${surface}, which only the Elephant writes; narrow the owned paths of module ${slice.moduleId} or keep that module out of the queue` });
      }
    }
    return { ok: true, schema: MODULE_SLICE_PROPOSAL_SCHEMA, modules: ids.length, waves, slices, serialized, warnings, addCommands };
  } catch (error) {
    return refuse("MSP-INTERNAL", `the proposal failed (${error?.name ?? "error"})`);
  }
}
