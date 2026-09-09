// SPDX-License-Identifier: SUL-1.0
/** Closed, detached observation boundary for Critic preflight. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveProjectAuthorityPaths } from "./project-authority.mjs";
import { validateContinuityState } from "./continuity-state.mjs";

const SOURCE_KEYS = ["schema", "producer", "observationRevision", "stage", "outcome", "code", "candidate", "specSha256"];
const STAGES = ["arguments", "request", "candidate", "paths", "inventory", "manifest", "governance", "candidate-files", "evidence", "prior-evidence", "complete"];
const CODES = ["CDP-ARGUMENT", "CDP-INPUT", "CDP-GIT", "CDP-REF", "CDP-RANGE", "CDP-PATH", "CDP-PATHS", "CDP-DUPLICATE-PATH", "CDP-EVIDENCE-REQUIRED", "CDP-PRIOR-ALIASED", "CDP-TREE", "CDP-MANIFEST", "CDP-CANDIDATE-PATH", "CDP-CANDIDATE-READ", "CDP-EVIDENCE-PATH", "CDP-EVIDENCE-FILE", "CDP-EVIDENCE-JSON", "CDP-EVIDENCE-BINDING", "CDP-UNEXPECTED"];
const MATRIX = Object.freeze({
  arguments: ["CDP-ARGUMENT"], request: ["CDP-INPUT"], candidate: ["CDP-GIT", "CDP-REF", "CDP-RANGE"],
  paths: ["CDP-PATH", "CDP-PATHS", "CDP-DUPLICATE-PATH", "CDP-EVIDENCE-REQUIRED", "CDP-PRIOR-ALIASED"],
  inventory: ["CDP-GIT", "CDP-TREE", "CDP-PATH"], manifest: ["CDP-MANIFEST"], governance: ["CDP-GIT", "CDP-PATH"],
  "candidate-files": ["CDP-CANDIDATE-PATH", "CDP-CANDIDATE-READ"], evidence: ["CDP-EVIDENCE-PATH", "CDP-EVIDENCE-FILE", "CDP-EVIDENCE-JSON", "CDP-EVIDENCE-BINDING"],
  "prior-evidence": ["CDP-EVIDENCE-PATH", "CDP-EVIDENCE-FILE"],
});
const DIAGNOSTICS = new Set(["C1O-SOURCE", "C1O-ROOT", "C1O-SCOPE-UNAVAILABLE", "C1O-SCOPE-BINDING", "C1O-SCOPE-STALE", "C1O-LINEAGE-UNAVAILABLE", "C1O-LINEAGE-BINDING", "C1O-TIME", "C1O-STORE"]);
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const fail = (code) => { throw new TypeError(code); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function closedError(error, fallback) {
  try {
    if (!(error instanceof TypeError)) return fallback;
    const message = Object.getOwnPropertyDescriptor(error, "message");
    return typeof message?.value === "string" && DIAGNOSTICS.has(message.value) ? message.value : fallback;
  } catch {
    return fallback;
  }
}

// Never read a caller property until its own data descriptor has been checked.
function valuesOf(value, keys, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value), found = Reflect.ownKeys(descriptors);
  if (found.length !== keys.length || found.some((key) => typeof key !== "string") || !keys.every((key) => Object.hasOwn(descriptors, key))) fail(code);
  const output = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail(code);
    output[key] = descriptor.value;
  }
  return output;
}
function candidateSnapshot(value) {
  if (value === null) return null;
  const candidate = valuesOf(value, ["commit", "tree"], "C1O-SOURCE");
  if (typeof candidate.commit !== "string" || typeof candidate.tree !== "string"
    || !OID.test(candidate.commit) || !OID.test(candidate.tree) || candidate.commit.length !== candidate.tree.length) fail("C1O-SOURCE");
  return { commit: candidate.commit, tree: candidate.tree };
}
function sourceCheck(value) {
  const source = valuesOf(value, SOURCE_KEYS, "C1O-SOURCE");
  if (source.schema !== "pipeline.critic-preflight-observation.v1" || source.producer !== "critic-dispatch-preflight" || source.observationRevision !== 1
    || !STAGES.includes(source.stage) || !["rejected", "packet-ready"].includes(source.outcome)) fail("C1O-SOURCE");
  const candidate = candidateSnapshot(source.candidate);
  if (source.outcome === "packet-ready") {
    if (source.stage !== "complete" || source.code !== null || candidate === null || typeof source.specSha256 !== "string" || !DIGEST.test(source.specSha256)) fail("C1O-SOURCE");
  } else {
    if (source.stage === "complete" || !CODES.includes(source.code) || (source.specSha256 !== null && (typeof source.specSha256 !== "string" || !DIGEST.test(source.specSha256)))) fail("C1O-SOURCE");
    if (source.code !== "CDP-UNEXPECTED" && !MATRIX[source.stage]?.includes(source.code)) fail("C1O-SOURCE");
  }
  return { schema: source.schema, producer: source.producer, observationRevision: source.observationRevision, stage: source.stage, outcome: source.outcome,
    code: source.code, candidate, specSha256: source.specSha256 };
}
function timeCheck(value) {
  if (value === null || value === undefined) return { value: null, status: "unknown" };
  const time = valuesOf(value, ["value", "status"], "C1O-TIME");
  if (!["measured", "estimated", "unavailable", "unknown"].includes(time.status)) fail("C1O-TIME");
  if (["unknown", "unavailable"].includes(time.status)) { if (time.value !== null) fail("C1O-TIME"); }
  else if (typeof time.value !== "string" || !TIME.test(time.value) || !Number.isFinite(Date.parse(time.value)) || new Date(time.value).toISOString() !== time.value) fail("C1O-TIME");
  return { value: time.value, status: time.status };
}
export function captureCriticPreflightSource(source, observedAt = undefined) {
  try { return { ok: true, code: null, source: sourceCheck(source), observedAt: timeCheck(observedAt) }; }
  catch (error) { return { ok: false, code: closedError(error, "C1O-SOURCE") === "C1O-TIME" ? "C1O-TIME" : "C1O-SOURCE", source: null, observedAt: null }; }
}
export const capture = captureCriticPreflightSource;

function normalizedPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.trim() !== value || value.includes("\\") || value.includes("\0") || isAbsolute(value)
    || value.startsWith("./") || value.endsWith("/") || value.split("/").some((part) => part === "" || part === "." || part === "..")) fail("C1O-SCOPE-BINDING");
  return value;
}
function physicalRoot(root) {
  if (typeof root !== "string" || root.length === 0) fail("C1O-ROOT");
  try {
    const info = lstatSync(root); if (!info.isDirectory() || info.isSymbolicLink()) fail("C1O-ROOT");
    return realpathSync(root);
  } catch (error) { if (closedError(error, null) === "C1O-ROOT") throw error; fail("C1O-ROOT"); }
}
function boundedFile(root, path, code) {
  const rel = normalizedPath(path), full = resolve(root, rel), back = relative(root, full);
  if (back === "" || back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back)) fail(code);
  let cursor = root;
  for (const part of rel.split("/")) {
    cursor = resolve(cursor, part);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink() || (cursor !== full && !info.isDirectory()) || (cursor === full && !info.isFile())) fail(code);
  }
  return readFileSync(full);
}
function ownerSnapshot(root, statePath, specPath) {
  const stateBytes = boundedFile(root, statePath, "C1O-SCOPE-UNAVAILABLE");
  let state; try { state = JSON.parse(stateBytes.toString("utf8")); } catch { fail("C1O-SCOPE-UNAVAILABLE"); }
  if (state === null || typeof state !== "object" || Array.isArray(state) || state.activeFeature === null || typeof state.activeFeature !== "object" || Array.isArray(state.activeFeature)
    || typeof state.activeFeature.id !== "string" || !validateContinuityState(state.continuity, state.activeFeature.id).ok) fail("C1O-SCOPE-UNAVAILABLE");
  const continuity = state.continuity;
  if (continuity.authority.spec.path !== specPath || !DIGEST.test(continuity.authority.spec.sha256)) fail("C1O-SCOPE-BINDING");
  const specBytes = boundedFile(root, specPath, "C1O-SCOPE-BINDING"), specSha256 = sha256(specBytes);
  if (specSha256 !== continuity.authority.spec.sha256) fail("C1O-SCOPE-BINDING");
  if (!ID.test(continuity.featureId)) fail("C1O-SCOPE-UNAVAILABLE");
  const phase = typeof state.activeFeature.phase === "string" && ID.test(state.activeFeature.phase) ? state.activeFeature.phase : null;
  return { stateBytes, stateSha256: sha256(stateBytes), revision: continuity.revision, specBytes, specSha256, featureId: continuity.featureId, phase };
}
function candidateSpecSha256(root, candidate, specPath) {
  if (candidate === null) fail("C1O-SCOPE-BINDING");
  const result = spawnSync("git", ["-C", root, "show", `${candidate.commit}:${specPath}`], {
    encoding: null, shell: false, timeout: 10_000, maxBuffer: 1024 * 1024, env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail("C1O-SCOPE-BINDING");
  return sha256(result.stdout);
}
/**
 * Resolve the detached owner context used to create a retained local operation.
 * This intentionally has no caller-supplied scope: authority, feature and spec
 * are read from the physical repository twice before the context is returned.
 */
export function resolveCriticPreflightContext(input = {}) {
  try {
    const supplied = valuesOf(input, ["root", "specPath"], "C1O-ROOT");
    const { root, specPath } = supplied;
    const normalizedSpec = normalizedPath(specPath), actualRoot = physicalRoot(root);
    const authority = resolveProjectAuthorityPaths({ rootDir: actualRoot });
    if (authority.status !== "ready" || typeof authority.state !== "string") fail("C1O-SCOPE-UNAVAILABLE");
    const before = ownerSnapshot(actualRoot, authority.state, normalizedSpec);
    let afterState, afterSpec, after;
    try {
      afterState = boundedFile(actualRoot, authority.state, "C1O-SCOPE-STALE");
      afterSpec = boundedFile(actualRoot, normalizedSpec, "C1O-SCOPE-STALE");
      after = JSON.parse(afterState.toString("utf8"));
    } catch { fail("C1O-SCOPE-STALE"); }
    if (before.stateSha256 !== sha256(afterState) || before.revision !== after.continuity?.revision
      || before.specSha256 !== sha256(afterSpec)) fail("C1O-SCOPE-STALE");
    return {
      ok: true,
      code: null,
      context: {
        scope: { featureId: before.featureId, packageId: null, dispatchId: null, phase: before.phase },
        ownerBinding: { stateSha256: before.stateSha256, continuityRevision: before.revision,
          specSha256: before.specSha256, specPathSha256: sha256(Buffer.from(normalizedSpec, "utf8")) },
      },
    };
  } catch (error) { return { ok: false, code: closedError(error, "C1O-SCOPE-UNAVAILABLE"), context: null }; }
}
export function qualifyCriticPreflightObservation(input = {}) {
  try {
    const { source, observedAt, root, specPath } = valuesOf(input, ["source", "observedAt", "root", "specPath"], "C1O-ROOT");
    const safeSource = sourceCheck(source), time = timeCheck(observedAt), normalizedSpec = normalizedPath(specPath), actualRoot = physicalRoot(root);
    const authority = resolveProjectAuthorityPaths({ rootDir: actualRoot });
    if (authority.status !== "ready" || typeof authority.state !== "string") fail("C1O-SCOPE-UNAVAILABLE");
    const before = ownerSnapshot(actualRoot, authority.state, normalizedSpec), candidateDigest = candidateSpecSha256(actualRoot, safeSource.candidate, normalizedSpec);
    if (candidateDigest !== before.specSha256 || (safeSource.specSha256 !== null && safeSource.specSha256 !== candidateDigest)) fail("C1O-SCOPE-BINDING");
    let afterState, afterSpec;
    try { afterState = boundedFile(actualRoot, authority.state, "C1O-SCOPE-STALE"); afterSpec = boundedFile(actualRoot, normalizedSpec, "C1O-SCOPE-STALE"); }
    catch { fail("C1O-SCOPE-STALE"); }
    if (before.stateSha256 !== sha256(afterState) || before.revision !== JSON.parse(afterState.toString("utf8")).continuity?.revision
      || before.specSha256 !== sha256(afterSpec)) fail("C1O-SCOPE-STALE");
    const ownerBinding = { stateSha256: before.stateSha256, continuityRevision: before.revision, specSha256: before.specSha256, specPathSha256: sha256(Buffer.from(normalizedSpec, "utf8")) };
    return { ok: true, code: null, observation: { schema: "pipeline.critic-preflight-local-observation.v1", source: safeSource, observedAt: time,
      scope: { featureId: before.featureId, packageId: null, dispatchId: null, phase: before.phase }, actor: { runner: null, role: null }, ownerBinding } };
  } catch (error) { return { ok: false, code: closedError(error, "C1O-SCOPE-UNAVAILABLE"), observation: null }; }
}
export const qualify = qualifyCriticPreflightObservation;
