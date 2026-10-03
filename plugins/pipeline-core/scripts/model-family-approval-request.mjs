// SPDX-License-Identifier: SUL-1.0
/** Build and disclose an exact unsigned v2 family migration request. */
import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonical, createPoApprovalIntent } from "../lib/po-approval-proof.mjs";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { verifyModelRoleApprovedPolicy } from "../lib/model-role-approved-policy.mjs";
import { verifyModelFamilyAuthority } from "../lib/model-family-authority.mjs";
import { registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { registeredModelFamilyTaskRoutes } from "../lib/model-family-route-source.mjs";
import { validateAdapterContract } from "../lib/model-family-discovery.mjs";

export const MODEL_FAMILY_APPROVAL_REQUEST_SCHEMA = "pipeline.model-family-approval-request.v1";
const RUNNERS = ["codex", "claude", "antigravity"];
const FAMILY = /^[a-z][a-z0-9-]{0,31}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const VERSION = (value) => Array.isArray(value) && value.length > 0 && value.length <= 8
  && value.every((part) => Number.isSafeInteger(part) && part >= 0);
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const REQUEST_KEYS = ["schema", "requestId", "candidateAtApproval", "subject", "approvalIntent", "intentSha256",
  "historicBinding", "migrationProjection", "adapterContractBindings", "mappingPreview", "qualificationBoundary"];
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
const digestBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => digestBytes(Buffer.from(canonical(value), "utf8"));
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const tuple = (...values) => JSON.stringify(values);

// Closed proposal inventory; these rows are the complete Codex family target.
const INITIAL_CODEX_PREVIEW = Object.freeze([
  ["profile.epic.design_phase", "frontier", "xhigh", "sol", [6, 1]],
  ["profile.epic.execution_phase", "frontier", "medium", "sol", [6, 1]],
  ["profile.feature.design_phase", "frontier", "high", "sol", [6, 1]],
  ["profile.feature.execution_phase", "frontier", "medium", "sol", [6, 1]],
  ["profile.mini.design_phase", "frontier", "medium", "sol", [6, 1]],
  ["profile.mini.execution_phase", "frontier", "medium", "sol", [6, 1]],
  ["duty.implement", "worker", "high", "luna", [6]],
  ["duty.mechanic", "efficient", "medium", "luna", [6]],
  ["duty.deep", "frontier", "medium", "sol", [6, 1]],
  ["duty.test_author", "frontier", "medium", "sol", [6, 1]],
  ["duty.critic_normal", "frontier", "xhigh", "sol", [6, 1]],
  ["duty.critic_high_risk", "frontier", "max", "astra", [6]],
  ["duty.readiness", "worker", "high", "luna", [6]],
  ["duty.advisory", "frontier", "max", "astra", [6]],
  ["duty.read", "efficient", "medium", "luna", [6]],
].map(([taskRoute, role, effort, familyId, minimumVersion]) => Object.freeze({
  taskRoute, runner: "codex", role, effort, familyId, minimumVersion: Object.freeze(minimumVersion), update: "latest",
})));

function targetAssignments(routeSource, proposedAssignments) {
  if (!routeSource?.ok || !Array.isArray(routeSource.taskRoutes) || !Array.isArray(routeSource.configuredRoutes)) {
    return fail("MODEL-FAMILY-ROUTE-SOURCE-INCOMPLETE");
  }
  const available = routeSource.taskRoutes.filter((route) => route.state !== "unavailable");
  if (!Array.isArray(proposedAssignments)) {
    return fail("MODEL-FAMILY-ASSIGNMENT-MAPPING-MISSING", {
      availableRouteCount: available.length,
      missingRoutes: available.map(({ runner, taskRoute }) => ({ runner, taskRoute })),
      unavailableRoutes: (routeSource.unavailableTaskRoutes ?? []).map(({ runner, taskRoute }) => ({ runner, taskRoute })),
      initialCodexPreview: INITIAL_CODEX_PREVIEW.map((row) => ({ ...row, minimumVersion: [...row.minimumVersion] })),
    });
  }
  const availableByRoute = new Map(available.map((route) => [tuple(route.runner, route.taskRoute), route]));
  const rows = [], preview = [], seen = new Set();
  for (const target of proposedAssignments) {
    if (!exact(target, ["runner", "taskRoute", "familyId", "minimumVersion", "update"])
      || !RUNNERS.includes(target.runner) || typeof target.taskRoute !== "string"
      || !FAMILY.test(target.familyId ?? "") || !VERSION(target.minimumVersion) || target.update !== "latest") {
      return fail("MODEL-FAMILY-ASSIGNMENT-ROW-INVALID");
    }
    const key = tuple(target.runner, target.taskRoute);
    const route = availableByRoute.get(key);
    if (!route || seen.has(key)) return fail("MODEL-FAMILY-ASSIGNMENT-ROUTE-INVALID", { runner: target.runner, taskRoute: target.taskRoute });
    seen.add(key);
    const row = { runner: target.runner, taskRoute: target.taskRoute, role: route.role, effort: route.effort,
      familyId: target.familyId, minimumVersion: [...target.minimumVersion], update: "latest" };
    rows.push(row);
    preview.push({ ...row, state: route.state,
      selection: "latest visible/selectable release in the assigned family at or above this floor" });
  }
  const missingRoutes = available.filter((route) => !seen.has(tuple(route.runner, route.taskRoute)))
    .map(({ runner, taskRoute }) => ({ runner, taskRoute }));
  if (missingRoutes.length) return fail("MODEL-FAMILY-ASSIGNMENT-MAPPING-INCOMPLETE", {
    availableRouteCount: available.length, mappedRouteCount: rows.length, missingRoutes, mappingPreview: preview,
  });
  const order = new Map(available.map((route, index) => [tuple(route.runner, route.taskRoute), index]));
  const byRouteOrder = (left, right) => order.get(tuple(left.runner, left.taskRoute)) - order.get(tuple(right.runner, right.taskRoute));
  rows.sort(byRouteOrder);
  preview.sort(byRouteOrder);
  return { ok: true, assignmentRows: rows, preview };
}

function migrationProjection({ assignments, historicRouteSource, historicBundle, contractShaByFamily }) {
  if (!historicRouteSource?.ok || !Array.isArray(historicRouteSource.taskRoutes)
    || !Array.isArray(historicBundle?.approvedPolicies)) return fail("MODEL-FAMILY-HISTORIC-SOURCE-INVALID");
  const approvals = new Map();
  for (const entry of historicBundle.approvedPolicies) {
    if (RUNNERS.includes(entry?.runner) && Array.isArray(entry.policy?.approved)) {
      approvals.set(tuple(entry.runner, entry.role, entry.effort), entry.policy.approved);
    }
  }
  const projection = [];
  for (const target of assignments) {
    const historic = historicRouteSource.taskRoutes.find((route) => route.runner === target.runner
      && route.taskRoute === target.taskRoute);
    if (!historic || historic.state === "unavailable" || historic.role !== target.role) {
      return fail("MODEL-FAMILY-HISTORIC-ASSIGNMENT-MISSING", { taskRoute: target.taskRoute });
    }
    const historicKey = tuple(target.runner, historic.role, historic.effort);
    const approved = approvals.get(historicKey);
    if (approvals.has(historicKey) && (!Array.isArray(approved) || approved.length !== 1 || typeof approved[0]?.modelId !== "string"
      || !approved[0].modelId)) return fail("MODEL-FAMILY-HISTORIC-EXACT-MODEL-AMBIGUOUS", { taskRoute: target.taskRoute });
    // Absence of an authenticated approval is an explicit new decision, never
    // inferred inheritance. The null marker and supplied family/floor are bound
    // together by the existing projection digest and new PO approval intent.
    projection.push({ runner: target.runner, taskRoute: target.taskRoute, role: target.role, effort: target.effort,
      historicRole: historic.role, historicEffort: historic.effort, historicModelId: approvals.has(historicKey) ? approved[0].modelId : null,
      familyId: target.familyId, minimumVersion: [...target.minimumVersion],
      adapterContractSha256: contractShaByFamily.get(tuple(target.runner, target.familyId)) });
  }
  return { ok: true, value: projection };
}

/** Pure request constructor. `verifyHistoric` must be the canonical v1 verifier. */
export function createModelFamilyApprovalRequest({ requestId, candidateAtApproval, targetRouteSource,
  historicRouteSource, historicBundle, historicBundleBytes, trustAnchors, adapterContractBindings,
  proposedAssignments, verifyHistoric = verifyModelRoleApprovedPolicy, intentFactory = createPoApprovalIntent } = {}) {
  if (!REQUEST_ID.test(requestId ?? "")) return fail("MODEL-FAMILY-REQUEST-ID");
  if (!exact(candidateAtApproval, ["commit", "tree"]) || !OID.test(candidateAtApproval.commit ?? "")
    || !OID.test(candidateAtApproval.tree ?? "") || candidateAtApproval.commit === candidateAtApproval.tree) {
    return fail("MODEL-FAMILY-CANDIDATE-BINDING");
  }
  if (!Buffer.isBuffer(historicBundleBytes) && !(historicBundleBytes instanceof Uint8Array)) {
    return fail("MODEL-FAMILY-HISTORIC-BYTES-MISSING");
  }
  let parsedHistoric;
  try { parsedHistoric = parseStrictJson(Buffer.from(historicBundleBytes)); } catch { return fail("MODEL-FAMILY-HISTORIC-BYTES-INVALID"); }
  if (canonical(parsedHistoric) !== canonical(historicBundle)) return fail("MODEL-FAMILY-HISTORIC-BYTES-MISMATCH");
  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0) return fail("MODEL-FAMILY-TRUST-ANCHOR-MISSING");
  const historicRunners = [...new Set(historicBundle.approvedPolicies?.map((entry) => entry?.runner) ?? [])];
  if (historicRunners.length === 0 || historicRunners.some((runner) => !RUNNERS.includes(runner))) {
    return fail("MODEL-FAMILY-HISTORIC-RUNNERS-INVALID");
  }
  for (const requiredRunner of historicRunners) {
    const historicCheck = verifyHistoric({ bundle: historicBundle, routeSource: historicRouteSource,
      trustAnchors, requiredRunner });
    if (!historicCheck?.ok) return fail("MODEL-FAMILY-HISTORIC-APPROVAL-INVALID", {
      runner: requiredRunner, diagnostic: historicCheck?.code ?? null });
  }
  const targets = targetAssignments(targetRouteSource, proposedAssignments);
  if (!targets.ok) return targets;
  if (!Array.isArray(adapterContractBindings)) adapterContractBindings = [];
  const byFamily = new Map();
  const canonicalBindings = [];
  for (const binding of adapterContractBindings) {
    const familyKey = exact(binding, ["runner", "familyId", "path", "contract"])
      ? tuple(binding.runner, binding.familyId) : "";
    const checked = validateAdapterContract(binding?.contract);
    if (!familyKey || !RUNNERS.includes(binding.runner) || !FAMILY.test(binding.familyId ?? "")
      || binding.contract?.runner !== binding.runner || binding.contract?.familyId !== binding.familyId
      || byFamily.has(familyKey) || typeof binding.path !== "string"
      || !/^plugins\/pipeline-core\/(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u.test(binding.path)
      || !checked.ok) {
      return fail("MODEL-FAMILY-ADAPTER-CONTRACT-INVALID", { runner: binding?.runner ?? null, familyId: binding?.familyId ?? null });
    }
    const contractSha256 = digest(binding.contract);
    byFamily.set(familyKey, contractSha256);
    canonicalBindings.push({ runner: binding.runner, familyId: binding.familyId, path: binding.path, contractSha256,
      contract: structuredClone(checked.value) });
  }
  canonicalBindings.sort((left, right) => tuple(left.runner, left.familyId).localeCompare(tuple(right.runner, right.familyId)));
  const requiredFamilies = [...new Set(targets.assignmentRows.map((row) => tuple(row.runner, row.familyId)))];
  const missingFamilies = requiredFamilies.filter((key) => !byFamily.has(key));
  if (missingFamilies.length) return fail("MODEL-FAMILY-ADAPTER-CONTRACTS-MISSING", {
    missingRunnerFamilies: missingFamilies.map((key) => JSON.parse(key)), mappingPreview: targets.preview,
  });
  const projectionResult = migrationProjection({ assignments: targets.assignmentRows, historicRouteSource,
    historicBundle, contractShaByFamily: byFamily });
  if (!projectionResult.ok) return projectionResult;
  const groups = new Map();
  for (const target of targets.assignmentRows) {
    const adapterContractSha256 = byFamily.get(tuple(target.runner, target.familyId));
    const groupKey = tuple(target.runner, target.role, target.effort, target.familyId,
      adapterContractSha256, target.minimumVersion);
    if (!groups.has(groupKey)) groups.set(groupKey, { runner: target.runner, role: target.role,
      effort: target.effort, taskRoutes: [], familyId: target.familyId, adapterContractSha256,
      minimumVersion: [...target.minimumVersion], update: "latest" });
    groups.get(groupKey).taskRoutes.push(target.taskRoute);
  }
  const assignments = [...groups.values()];
  const routeSourceSha256 = digest({ taskRoutes: targetRouteSource.taskRoutes,
    configuredRoutes: targetRouteSource.configuredRoutes });
  const historicRouteSourceSha256 = digest({ taskRoutes: historicRouteSource.taskRoutes,
    configuredRoutes: historicRouteSource.configuredRoutes });
  const floors = assignments.flatMap((assignment) => assignment.taskRoutes.map((taskRoute) => ({ runner: assignment.runner,
    taskRoute, role: assignment.role, effort: assignment.effort,
    familyId: assignment.familyId, minimumVersion: assignment.minimumVersion })))
    .sort((left, right) => tuple(left.runner, left.taskRoute, left.role, left.effort)
      .localeCompare(tuple(right.runner, right.taskRoute, right.role, right.effort)));
  const migration = { schema: "pipeline.model-family-migration.v1",
    historicBundleByteSha256: digestBytes(Buffer.from(historicBundleBytes)),
    historicApprovalIntentSha256: historicBundle.approvalIntent?.sha256,
    historicRouteSourceSha256, targetRouteSourceSha256: routeSourceSha256,
    familyProjectionSha256: digest(projectionResult.value),
    adapterContractSha256s: [...new Set(byFamily.values())].sort(),
    preservedFloorsSha256: digest(floors) };
  if (!SHA.test(migration.historicBundleByteSha256) || !SHA.test(migration.historicApprovalIntentSha256 ?? "")) {
    return fail("MODEL-FAMILY-HISTORIC-BINDING-INVALID");
  }
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256, assignments, migration };
  const subjectSha256 = digest(subject);
  let approvalIntent;
  try { approvalIntent = intentFactory({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: routeSourceSha256, specSha256: subjectSha256, candidate: candidateAtApproval,
    policyRevision: "model-family-v2", subjectSha256, decision: "approved" }); }
  catch { return fail("MODEL-FAMILY-INTENT-CREATE-FAILED"); }
  const expectedIntentValue = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy",
    featureId: "model-role-routes", planSha256: routeSourceSha256, specSha256: subjectSha256,
    candidate: candidateAtApproval, policyRevision: "model-family-v2", subjectSha256, decision: "approved" };
  if (!exact(approvalIntent, ["value", "sha256"]) || !SHA.test(approvalIntent.sha256 ?? "")
    || canonical(approvalIntent.value) !== canonical(expectedIntentValue)
    || approvalIntent.sha256 !== digest(approvalIntent.value)) {
    return fail("MODEL-FAMILY-INTENT-CREATE-INVALID");
  }
  const mappingPreview = projectionResult.value.map((row) => ({ taskRoute: row.taskRoute, runner: row.runner,
    historicModelId: row.historicModelId, historicRole: row.historicRole, historicEffort: row.historicEffort,
    familyId: row.familyId, role: row.role, effort: row.effort, minimumVersion: [...row.minimumVersion],
    update: "latest", change: row.historicModelId === null ? "explicit first adoption; no inherited model or floor" :
      row.historicModelId !== `${row.familyId}` ? `family:${row.historicModelId}->${row.familyId}` :
      row.effort !== row.historicEffort ? `effort:${row.historicEffort}->${row.effort}` : "same-family floor preserved" }));
  const request = { schema: MODEL_FAMILY_APPROVAL_REQUEST_SCHEMA, requestId, candidateAtApproval: { ...candidateAtApproval },
    subject, approvalIntent, intentSha256: approvalIntent.sha256,
    historicBinding: { historicBundleByteSha256: migration.historicBundleByteSha256,
      historicApprovalIntentSha256: migration.historicApprovalIntentSha256, historicRouteSourceSha256 },
    migrationProjection: projectionResult.value, adapterContractBindings: canonicalBindings,
    mappingPreview,
    qualificationBoundary: { sourceAdapterQualification: "not asserted by this request",
      installedRunnerQualification: "not asserted by this request",
      latestSelectionOperational: "unqualified until independent provider and host evidence passes",
      activation: "not requested or performed" } };
  if (!exact(request, REQUEST_KEYS)) return fail("MODEL-FAMILY-REQUEST-SHAPE");
  return { ok: true, code: "MODEL-FAMILY-APPROVAL-REQUEST-READY", request,
    intentSha256: approvalIntent.sha256, mappingPreview };
}

function safeReadFile(path, maxBytes = 512 * 1024) {
  const st = lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size < 1 || st.size > maxBytes
    || realpathSync(path) !== path) throw new Error("MODEL-FAMILY-INPUT-UNSAFE");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const pinned = fstatSync(fd);
    if (pinned.dev !== st.dev || pinned.ino !== st.ino || pinned.size !== st.size) throw new Error("MODEL-FAMILY-INPUT-RACE");
    const bytes = readFileSync(fd); const after = fstatSync(fd); const named = lstatSync(path);
    if (bytes.length !== st.size || after.dev !== pinned.dev || after.ino !== pinned.ino
      || after.size !== pinned.size || after.mtimeMs !== pinned.mtimeMs || named.dev !== pinned.dev
      || named.ino !== pinned.ino || named.isSymbolicLink()) throw new Error("MODEL-FAMILY-INPUT-RACE");
    return bytes;
  } finally { closeSync(fd); }
}

function git(rootDir, args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }).trim();
}

function readCandidate(rootDir) {
  const dirty = git(rootDir, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  if (dirty) throw new Error("MODEL-FAMILY-CANDIDATE-DIRTY");
  const commit = git(rootDir, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const tree = git(rootDir, ["rev-parse", "--verify", "HEAD^{tree}"]);
  if (!OID.test(commit) || !OID.test(tree)) throw new Error("MODEL-FAMILY-CANDIDATE-INVALID");
  return { commit, tree };
}

function readTrackedJson(rootDir, path, maxBytes) {
  if (!path.startsWith("plugins/pipeline-core/") || path.split("/").includes("..")) throw new Error("MODEL-FAMILY-CONTRACT-PATH");
  git(rootDir, ["ls-files", "--error-unmatch", "--", path]);
  const absolute = join(rootDir, path);
  const bytes = safeReadFile(absolute, maxBytes);
  const committed = Buffer.from(execFileSync("git", ["show", `HEAD:${path}`], { cwd: rootDir,
    encoding: "buffer", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }));
  if (!bytes.equals(committed)) throw new Error("MODEL-FAMILY-CONTRACT-UNCOMMITTED");
  return parseStrictJson(bytes);
}

function inputPathBindings(args) {
  const map = new Map();
  for (const value of args) {
    const match = /^(codex|claude|antigravity):([a-z][a-z0-9-]{0,31})=(plugins\/pipeline-core\/[A-Za-z0-9._/-]+)$/u.exec(value);
    const key = match ? tuple(match[1], match[2]) : "";
    if (!match || map.has(key) || match[3].split("/").includes("..")) throw new Error("MODEL-FAMILY-ADAPTER-PATH-ARGUMENT");
    map.set(key, match[3]);
  }
  return map;
}

function prepareFromRepository(rootDir, requestId, contractPaths, assignmentPath, assignmentOverride = null) {
  if (!isAbsolute(rootDir) || realpathSync(rootDir) !== rootDir) return fail("MODEL-FAMILY-REPOSITORY-ROOT");
  let candidateAtApproval, historicBundleBytes, historicBundle, historicRouteSource, targetRouteSource, trustAnchors;
  try {
    candidateAtApproval = readCandidate(rootDir);
    historicRouteSource = registeredFunctionalTaskRoutes();
    targetRouteSource = registeredModelFamilyTaskRoutes({ historicSource: historicRouteSource });
    if (!historicRouteSource?.ok || !targetRouteSource?.ok) return fail("MODEL-FAMILY-ROUTE-SOURCE-UNAVAILABLE");
    historicBundleBytes = safeReadFile(join(rootDir, "project/model-role-approved-policy.v1.json"));
    historicBundle = parseStrictJson(historicBundleBytes);
    const trust = readCriticalHumanProofPolicy(rootDir);
    trustAnchors = trust?.trustAnchors ?? (trust?.trustAnchor ? [trust.trustAnchor] : []);
    if (!trust?.ok || trustAnchors.length === 0) return fail("MODEL-FAMILY-TRUST-ANCHOR-MISSING");
    const historicRunners = [...new Set(historicBundle.approvedPolicies?.map((entry) => entry?.runner) ?? [])];
    if (historicRunners.length === 0 || historicRunners.some((runner) => !RUNNERS.includes(runner))) {
      return fail("MODEL-FAMILY-HISTORIC-RUNNERS-INVALID");
    }
    for (const requiredRunner of historicRunners) {
      const historicCheck = verifyModelRoleApprovedPolicy({ bundle: historicBundle, routeSource: historicRouteSource,
        trustAnchors, requiredRunner });
      if (!historicCheck?.ok) return fail("MODEL-FAMILY-HISTORIC-APPROVAL-INVALID",
        { runner: requiredRunner, diagnostic: historicCheck?.code ?? null });
    }
  } catch (error) {
    return fail(error?.message === "MODEL-FAMILY-CANDIDATE-DIRTY" ? error.message : "MODEL-FAMILY-HISTORIC-INPUT-UNAVAILABLE");
  }
  const adapterContractBindings = [];
  const missingFamilies = [];
  let proposedAssignments;
  try {
    if (assignmentOverride !== null) proposedAssignments = assignmentOverride;
    else {
      if (!assignmentPath) throw new Error("MODEL-FAMILY-ASSIGNMENT-MAPPING-MISSING");
      const absolute = resolve(rootDir, assignmentPath);
      if (relative(rootDir, absolute).startsWith(`..${sep}`) || !assignmentPath.startsWith("scratch/")) {
        throw new Error("MODEL-FAMILY-ASSIGNMENT-PATH");
      }
      proposedAssignments = parseStrictJson(safeReadFile(absolute, 256 * 1024));
    }
    if (!Array.isArray(proposedAssignments)) throw new Error("MODEL-FAMILY-ASSIGNMENT-SHAPE");
  } catch (error) {
    const source = registeredModelFamilyTaskRoutes({ historicSource: historicRouteSource });
    const targets = targetAssignments(source, undefined);
    return fail(error?.message === "MODEL-FAMILY-ASSIGNMENT-MAPPING-MISSING" ? error.message
      : "MODEL-FAMILY-ASSIGNMENT-INPUT-INVALID", {
        availableRouteCount: targets.availableRouteCount ?? targets.missingRoutes?.length ?? null,
        missingRoutes: targets.missingRoutes ?? [],
        unavailableRoutes: targets.unavailableRoutes ?? [],
        candidateAtApproval,
        initialCodexPreview: INITIAL_CODEX_PREVIEW,
      });
  }
  const keys = [...new Set(proposedAssignments.filter((row) => row && RUNNERS.includes(row.runner)
    && FAMILY.test(row.familyId ?? "")).map((row) => tuple(row.runner, row.familyId)))];
  for (const key of keys) {
    const [runner, familyId] = JSON.parse(key);
    const path = contractPaths.get(key);
    if (!path) { missingFamilies.push({ runner, familyId }); continue; }
    try { adapterContractBindings.push({ runner, familyId, path,
      contract: readTrackedJson(rootDir, path, 64 * 1024) }); }
    catch { missingFamilies.push({ runner, familyId }); }
  }
  const targetPreview = targetAssignments(targetRouteSource, proposedAssignments);
  if (!targetPreview.ok) return targetPreview;
  if (missingFamilies.length) {
    return fail("MODEL-FAMILY-ADAPTER-CONTRACTS-MISSING", {
      missingRunnerFamilies: missingFamilies, mappingPreview: targetPreview.preview,
      candidateAtApproval, sourceContracts: "all runner source contracts remain separately required",
      operationalQualification: "not asserted" });
  }
  return createModelFamilyApprovalRequest({ requestId, candidateAtApproval, targetRouteSource, historicRouteSource,
    historicBundle, historicBundleBytes, trustAnchors, adapterContractBindings, proposedAssignments });
}

function writeRequestExclusive(rootDir, request) {
  const scratchRoot = join(rootDir, "scratch");
  const st = lstatSync(scratchRoot);
  if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(scratchRoot) !== scratchRoot) throw new Error("MODEL-FAMILY-SCRATCH-UNSAFE");
  const name = `model-family-approval-request-${request.requestId}.json`;
  const path = join(scratchRoot, name);
  if (relative(scratchRoot, path).startsWith(`..${sep}`)) throw new Error("MODEL-FAMILY-REQUEST-PATH");
  const bytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`, "utf8");
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  return path;
}

/** Closed byte-independent equality check shared by the host resolver and tests. */
export function modelFamilyApprovalRequestMatches(record, expectedRequest) {
  return exact(record, REQUEST_KEYS) && record.schema === MODEL_FAMILY_APPROVAL_REQUEST_SCHEMA
    && exact(expectedRequest, REQUEST_KEYS) && canonical(record) === canonical(expectedRequest);
}

/** Re-read every bound source and return a human description only on exact match. */
export function describeModelFamilyApprovalRequest(record, { rootDir } = {}) {
  if (!exact(record, REQUEST_KEYS) || record.schema !== MODEL_FAMILY_APPROVAL_REQUEST_SCHEMA) return null;
  const paths = new Map();
  if (!Array.isArray(record.adapterContractBindings)) return null;
  for (const binding of record.adapterContractBindings) {
    const key = exact(binding, ["runner", "familyId", "path", "contractSha256", "contract"])
      ? tuple(binding.runner, binding.familyId) : "";
    if (!key || !RUNNERS.includes(binding.runner) || !FAMILY.test(binding.familyId ?? "") || paths.has(key)) return null;
    paths.set(key, binding.path);
  }
  const proposedAssignments = [];
  for (const assignment of record.subject?.assignments ?? []) {
    if (!Array.isArray(assignment?.taskRoutes)) return null;
    for (const taskRoute of assignment.taskRoutes) proposedAssignments.push({ runner: assignment.runner, taskRoute,
      familyId: assignment.familyId, minimumVersion: assignment.minimumVersion, update: assignment.update });
  }
  let rebuilt;
  try { rebuilt = prepareFromRepository(rootDir, record.requestId, paths, null, proposedAssignments); }
  catch { return null; }
  if (!rebuilt.ok || !modelFamilyApprovalRequestMatches(record, rebuilt.request)
    || record.intentSha256 !== record.approvalIntent.sha256) return null;
  const lines = [
    "REQUEST: one-time approval of the complete three-runner model-family v2 assignment, authenticated v1 migration, and explicit first-adoption decisions below.",
    `candidate commit/tree: ${record.candidateAtApproval.commit} / ${record.candidateAtApproval.tree}`,
    `intent SHA-256: ${record.intentSha256}`,
    `${record.mappingPreview.length} assignments across all runners (runner / task / old exact ID and effort / target family / role / effort / minimum / update):`,
    ...record.mappingPreview.map((row) => `  ${row.runner} / ${row.taskRoute} / ${row.historicModelId === null ? "no prior approved model" : row.historicModelId} ${row.historicEffort} / ${row.familyId} / ${row.role} / ${row.effort} / ${row.minimumVersion.join(".")} / latest (${row.change})`),
    "Adapter-contract digests are bound as source inputs; this request does not certify provider semantics, compatibility, source acceptance, installed qualification, readiness, release, or activation.",
    "Activation is not requested. Missing or unqualified provider/host evidence must remain fail-closed.",
  ];
  return { resolved: true, code: "MODEL-FAMILY-APPROVAL-REQUEST-RESOLVED", lines };
}

/** After PO signing, this is the exact public verifier path; it creates no host admission. */
export function verifySignedModelFamilyApprovalRequest(record, proof, { rootDir } = {}) {
  const described = describeModelFamilyApprovalRequest(record, { rootDir });
  if (!described || !exact(proof, ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"])
    || proof.intentSha256 !== record.intentSha256) return fail("MODEL-FAMILY-REQUEST-OR-PROOF-INVALID");
  const contractShaByFamily = new Map(record.adapterContractBindings.map((binding) => [tuple(binding.runner, binding.familyId), binding.contractSha256]));
  let historicRouteSource, targetRouteSource, historicBundleBytes, historicBundle, trustAnchors;
  try {
    historicRouteSource = registeredFunctionalTaskRoutes();
    targetRouteSource = registeredModelFamilyTaskRoutes({ historicSource: historicRouteSource });
    historicBundleBytes = safeReadFile(join(rootDir, "project/model-role-approved-policy.v1.json"));
    historicBundle = parseStrictJson(historicBundleBytes);
    const trust = readCriticalHumanProofPolicy(rootDir);
    trustAnchors = trust?.trustAnchors ?? (trust?.trustAnchor ? [trust.trustAnchor] : []);
    if (!trust?.ok || trustAnchors.length === 0) return fail("MODEL-FAMILY-REQUEST-TRUST-UNAVAILABLE");
  } catch { return fail("MODEL-FAMILY-REQUEST-CURRENT-SOURCE-UNAVAILABLE"); }
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: record.candidateAtApproval,
    subject: record.subject, approvalIntent: record.approvalIntent, proof };
  return verifyModelFamilyAuthority({ bundle, routeSource: targetRouteSource, trustAnchors,
    predecessor: { rawBundleBytes: historicBundleBytes, historicRouteSource,
      migrationProjection: record.migrationProjection } });
}

function parseArgs(args) {
  if (args.length < 2 || args[0] !== "--repo-root") throw new Error("Usage: model-family-approval-request.mjs --repo-root <absolute-repository> --request-id <id> --assignments <scratch-json> [--adapter-contract <runner>:<family>=<tracked-path> ...] [--write-request]");
  const options = { rootDir: args[1], requestId: null, assignmentPath: null, contracts: [], write: false };
  for (let index = 2; index < args.length; index += 1) {
    if (args[index] === "--request-id" && args[index + 1]) { options.requestId = args[++index]; continue; }
    if (args[index] === "--assignments" && args[index + 1]) { options.assignmentPath = args[++index]; continue; }
    if (args[index] === "--adapter-contract" && args[index + 1]) { options.contracts.push(args[++index]); continue; }
    if (args[index] === "--write-request") { options.write = true; continue; }
  throw new Error("Usage: model-family-approval-request.mjs --repo-root <absolute-repository> --request-id <id> --assignments <scratch-json> [--adapter-contract <runner>:<family>=<tracked-path> ...] [--write-request]");
  }
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const paths = inputPathBindings(options.contracts);
    const result = prepareFromRepository(options.rootDir, options.requestId, paths, options.assignmentPath);
    if (!result.ok) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 2; return; }
    if (options.write) {
      const requestPath = writeRequestExclusive(options.rootDir, result.request);
      process.stdout.write(`${JSON.stringify({ ok: true, code: result.code, intentSha256: result.intentSha256,
        requestPath, mappingPreview: result.mappingPreview,
        nextCommand: `node plugins/pipeline-core/scripts/po-human-approval.mjs sign-intent --repo-root ${options.rootDir} --request ${relative(options.rootDir, requestPath).split(sep).join("/")}` }, null, 2)}\n`);
    } else process.stdout.write(`${JSON.stringify({ ok: true, code: result.code,
      intentSha256: result.intentSha256, request: result.request }, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error?.message ?? "MODEL-FAMILY-REQUEST-INVALID"}\n`); process.exitCode = 64; }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
