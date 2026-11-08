// SPDX-License-Identifier: SUL-1.0
/**
 * M1.4 (candidate 19): a dispatch's write scope follows the module cut, and the cut is enforced at dispatch time.
 *
 * `moduleDispatchScope` asks the SAME cut the read-only proposal tool prints (`proposeSlicesFromModules`, no second implementation) for the
 * slice of one module and answers: the module's write scope (its owned paths, or the declared paths when they stay inside the cut), or a typed
 * refusal with the repair. Pure. `readPrdModules` reads the modules from a PRD with the parser the design approval uses, for the proposal
 * script and the briefing tool alike.
 *
 * A declared path crosses the cut when it reaches the owned paths of another module that is not an overlap partner of this one (modules whose
 * owned paths overlap are serialized by the proposal, so a path in that shared zone is not a crossing). A path no module owns is not a crossing.
 * A module is runnable when every slice it depends on (its dependencies and the modules serialized before it) has an accepted result.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { architectureDesignFailureCode, isDocumentOwnedPath, isDocumentationOnlyModule, parseArchitectureDesign } from "./architecture-design.mjs";
import { DOCUMENT_CHECK_PREFIX } from "./native-goldfish-host-return.mjs";
import { proposeSlicesFromModules } from "./module-slice-proposal.mjs";
import { scopesOverlap } from "./slice-queue.mjs";

export const MODULE_DISPATCH_SCOPE_SCHEMA = "pipeline.module-dispatch-scope.v1";
const MAX_PRD_BYTES = 4 * 1024 * 1024;

const refuse = (code, message, extra = {}) => ({ ok: false, schema: MODULE_DISPATCH_SCOPE_SCHEMA, code, message, ...extra });
const FURTHER_ATTEMPT_SUFFIX = /^-r(?:[2-9]|[1-9]\d{1,2})$/u;
/** G20-65: the documents a documentation-only module owns, as exact files when it lists any (else the owned patterns), for the repair text. */
const ownDocuments = (module) => {
  const exact = module.ownedPaths.filter((path) => isDocumentOwnedPath(path) && !/[*?]|\/$/u.test(path));
  return exact.length > 0 ? exact : ["<an owned document>"];
};

/**
 * G20-59: `id` delivers the plan's slice `sliceId` when it is that id or a numbered further attempt on the same module
 * (`<sliceId>-r2`, `-r3`, ...) that is not itself the slice id of another module of the plan. The wave order tracks a module
 * by this id alone, so a delivery under any other id never releases the modules that wait for it.
 */
export function deliversModuleSlice(id, sliceId, planSliceIds = []) {
  if (typeof id !== "string" || typeof sliceId !== "string") return false;
  if (id === sliceId) return true;
  return id.startsWith(sliceId) && FURTHER_ATTEMPT_SUFFIX.test(id.slice(sliceId.length)) && !planSliceIds.includes(id);
}

/** The modules of an approved architecture design in a PRD under `root` (repository-relative path); never throws. */
export function readPrdModules(root, prd) {
  if (typeof prd !== "string" || prd === "" || isAbsolute(prd)) return refuse("DBG-MODULE-PLAN-UNREADABLE", "the module plan must be a repository-relative PRD path; repair: name the PRD that holds the approved architecture design");
  const target = resolve(root, prd);
  const inside = relative(root, target);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return refuse("DBG-MODULE-PLAN-UNREADABLE", "the module plan must name a file inside the root; repair: name the PRD that holds the approved architecture design");
  let text;
  try {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_PRD_BYTES) return refuse("DBG-MODULE-PLAN-UNREADABLE", `${prd} must be a regular file of at most 4 MiB; repair: name the PRD that holds the approved architecture design`);
    text = readFileSync(target, "utf8");
  } catch { return refuse("DBG-MODULE-PLAN-UNREADABLE", `${prd} could not be read; repair: name the PRD that holds the approved architecture design`); }
  try { return { ok: true, modules: parseArchitectureDesign(text).modules }; }
  catch (error) {
    return { ok: false, schema: MODULE_DISPATCH_SCOPE_SCHEMA, code: architectureDesignFailureCode(error), message: "the architecture design of the PRD is not valid; the module cut needs the approved design package", ...(typeof error?.field === "string" ? { field: error.field } : {}) };
  }
}

/**
 * @param {{modules: Array<{id: string, ownedPaths: string[], allowedDependencies?: string[]}>, moduleId: string, paths?: string[], integratedSliceIds?: Iterable<string>}} input
 *   `paths` are the declared write paths of the dispatch (omit to derive the scope); `integratedSliceIds` the slices with an accepted result.
 * @returns `{ok: true, moduleId, sliceId, wave, writeScope}` or a typed refusal `{ok: false, code, message}`; never throws
 */
export function moduleDispatchScope(input) {
  try {
    const { modules, moduleId, paths, integratedSliceIds, check } = input ?? {};
    const proposal = proposeSlicesFromModules(modules);
    if (!proposal.ok) return refuse("DBG-MODULE-CUT-INVALID", `the module cut cannot be proposed (${proposal.code}: ${proposal.reason}); repair: fix the architecture design of the plan`);
    const slice = proposal.slices.find((entry) => entry.moduleId === moduleId);
    if (slice === undefined) return refuse("DBG-MODULE-UNKNOWN", `module ${JSON.stringify(String(moduleId).slice(0, 64))} is not a module of the plan; repair: use one of ${proposal.slices.map((entry) => entry.moduleId).sort().join(", ")}`);
    const own = modules.find((module) => module.id === moduleId);
    const documentationOnly = isDocumentationOnlyModule(own);
    // G20-65: the document check form is judged here, with the module in hand; the generator only sees its syntax.
    if (typeof check === "string" && check.startsWith(DOCUMENT_CHECK_PREFIX)) {
      const document = check.slice(DOCUMENT_CHECK_PREFIX.length);
      if (!documentationOnly) return refuse("DBG-CHECK-DOCUMENT-MODULE", `check ${check} names a document, but module ${moduleId} owns code (${own.ownedPaths.join(", ")}); repair: a code module names a test file it owns (a .test.mjs, .test.cjs or .test.js) or command:<id> of a command the project calibration registers under verifyImpact`, { moduleId });
      if (!scopesOverlap([document], own.ownedPaths)) return refuse("DBG-CHECK-DOCUMENT-NOT-OWNED", `${document} is not among the owned paths of module ${moduleId}; repair: name one of its own documents as the check: ${ownDocuments(own).map((path) => `${DOCUMENT_CHECK_PREFIX}${path}`).join(" or ")}`, { moduleId, path: document });
    }
    if (paths !== undefined) {
      if (!Array.isArray(paths) || paths.length === 0 || !paths.every((path) => typeof path === "string" && path !== "")) return refuse("DBG-MODULE-SCOPE-CROSSES", "the declared paths must be a non-empty list of paths; repair: omit them to derive the scope from the module");
      for (const path of paths) {
        for (const other of modules) {
          if (other.id === moduleId || !scopesOverlap([path], other.ownedPaths)) continue;
          if (scopesOverlap([path], own.ownedPaths) && scopesOverlap(own.ownedPaths, other.ownedPaths)) continue;
          const hint = documentationOnly ? `; module ${moduleId} owns only documents, so its check is one of them: ${ownDocuments(own).map((document) => `${DOCUMENT_CHECK_PREFIX}${document}`).join(" or ")}` : "";
          return refuse("DBG-MODULE-SCOPE-CROSSES", `${path} reaches the owned paths of module ${other.id}, not of module ${moduleId}; repair: narrow the path to ${own.ownedPaths.join(", ")}, or dispatch the change to module ${other.id} as its own slice (one module per dispatch)${hint}`, { moduleId, path, ownerModule: other.id });
        }
      }
    }
    const accepted = [...new Set(integratedSliceIds ?? [])];
    const planSliceIds = proposal.slices.map((entry) => entry.id);
    const waiting = slice.dependsOn.filter((sliceId) => !accepted.some((id) => deliversModuleSlice(id, sliceId, planSliceIds)));
    if (waiting.length > 0) {
      return refuse("DBG-MODULE-NOT-RUNNABLE", `module ${moduleId} is in wave ${slice.wave} and waits for ${waiting.join(", ")}, which ${waiting.length === 1 ? "has" : "have"} no accepted result yet; repair: deliver and integrate ${waiting.join(", ")} first (wave order: ${proposal.waves.map((wave, index) => `${index}: ${wave.join(", ")}`).join("; ")}), then build this briefing again`, { moduleId, wave: slice.wave, waitingFor: waiting });
    }
    return { ok: true, schema: MODULE_DISPATCH_SCOPE_SCHEMA, moduleId, sliceId: slice.id, planSliceIds, wave: slice.wave, documentationOnly, writeScope: paths === undefined ? [...slice.writeScope] : [...paths] };
  } catch (error) {
    return refuse("DBG-MODULE-CUT-INVALID", `the module scope could not be derived (${error?.name ?? "error"}); repair: check the module list of the plan`);
  }
}
