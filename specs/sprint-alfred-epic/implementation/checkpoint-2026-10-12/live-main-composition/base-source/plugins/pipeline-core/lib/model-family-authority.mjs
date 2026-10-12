// SPDX-License-Identifier: SUL-1.0
/** Inert v2 family authority and pin-chain verifier. This module does not admit host state. */
import { createHash } from "node:crypto";
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { verifyModelRoleApprovedPolicy } from "./model-role-approved-policy.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const own = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("\0") === [...keys].sort().join("\0");
const digest = (v) => createHash("sha256").update(canonical(v)).digest("hex");
const fail = (code) => ({ ok: false, code, retryable: false });
const tuple = (...v) => JSON.stringify(v);
const FAMILY = /^[a-z][a-z0-9-]{0,31}$/u;
const ROLES = new Set(["frontier", "worker", "efficient"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "not-applicable"]);
// Module-local identity handles prevent a deserialized `{ok:true}` object from
// being mistaken for a verified authority or predecessor. A host still owns
// durable admission and must reverify after loading serialized data.
const verifiedAuthorities = new WeakSet();
const verifiedPins = new WeakSet();
const VERSION = (v) => Array.isArray(v) && v.length > 0 && v.length <= 8
  && v.every((n) => Number.isSafeInteger(n) && n >= 0);
const validShaList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => SHA.test(x))
  && new Set(v).size === v.length;

function frozenClone(value) {
  const copy = structuredClone(value);
  const seen = new WeakSet();
  const freeze = (item) => {
    if (!item || typeof item !== "object" || seen.has(item)) return item;
    seen.add(item);
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(copy);
}

function sourceProjection(routeSource) {
  if (!routeSource?.ok || !Array.isArray(routeSource.taskRoutes)
    || !Array.isArray(routeSource.configuredRoutes)) return null;
  const tasks = new Map();
  for (const t of routeSource.taskRoutes) {
    if (!own(t, ["taskRoute", "runner", "role", "effort", "state", "selector"])
      || typeof t.taskRoute !== "string" || !/^(profile|duty)\.[a-z0-9_.]+$/u.test(t.taskRoute)
      || !["codex", "claude", "antigravity"].includes(t.runner) || !ROLES.has(t.role)
      || typeof t.effort !== "string" || !EFFORTS.has(t.effort)
      || !["default", "opt-in", "unavailable"].includes(t.state)
      || !own(t.selector, ["kind", "value"]) || !["alias", "model-id"].includes(t.selector.kind)
      || typeof t.selector.value !== "string" || !t.selector.value) return null;
    const k = tuple(t.runner, t.taskRoute);
    if (tasks.has(k)) return null;
    tasks.set(k, t);
  }
  const configured = new Map();
  for (const c of routeSource.configuredRoutes) {
    if (!own(c, ["runner", "role", "effort", "selector"]) || !["codex", "claude", "antigravity"].includes(c.runner)
      || !ROLES.has(c.role) || !EFFORTS.has(c.effort) || !own(c.selector, ["kind", "value"])
      || !["alias", "model-id"].includes(c.selector.kind) || typeof c.selector.value !== "string" || !c.selector.value) return null;
    const k = tuple(c.runner, c.role, c.effort);
    if (configured.has(k)) return null;
    configured.set(k, c);
  }
  for (const t of tasks.values()) {
    if (t.state === "unavailable") continue;
    const c = configured.get(tuple(t.runner, t.role, t.effort));
    if (!c || canonical(c.selector) !== canonical(t.selector)) return null;
  }
  return { tasks, configured };
}

function expandAssignments(assignments, routeSource) {
  if (!Array.isArray(assignments) || assignments.length < 1 || assignments.length > 256) return null;
  const source = sourceProjection(routeSource);
  if (!source) return null;
  const identities = new Set();
  const keys = new Set();
  const expanded = [];
  for (const a of assignments) {
    if (!own(a, ["runner", "role", "effort", "taskRoutes", "familyId", "adapterContractSha256", "minimumVersion", "update"])
      || !["codex", "claude", "antigravity"].includes(a.runner) || !ROLES.has(a.role)
      || !EFFORTS.has(a.effort) || !Array.isArray(a.taskRoutes) || a.taskRoutes.length < 1
      || !FAMILY.test(a.familyId) || !SHA.test(a.adapterContractSha256)
      || !VERSION(a.minimumVersion) || a.update !== "latest") return null;
    for (const taskRoute of a.taskRoutes) {
      if (typeof taskRoute !== "string") return null;
      const identity = tuple(a.runner, taskRoute);
      const full = tuple(a.runner, taskRoute, a.role, a.effort);
      const task = source.tasks.get(identity);
      if (identities.has(identity) || keys.has(full) || !task || task.role !== a.role || task.effort !== a.effort
        || task.state === "unavailable") return null;
      identities.add(identity); keys.add(full);
      expanded.push({ runner: a.runner, taskRoute, role: a.role, effort: a.effort,
        familyId: a.familyId, adapterContractSha256: a.adapterContractSha256,
        minimumVersion: [...a.minimumVersion], update: a.update });
    }
  }
  return expanded;
}

function migrationValid(migration, predecessor, assignments, routeSource, targetSourceSha256, trustAnchors) {
  if (migration === null) return predecessor === null ? { ok: true } : null;
  const fields = ["schema", "historicBundleByteSha256", "historicApprovalIntentSha256", "historicRouteSourceSha256",
    "targetRouteSourceSha256", "familyProjectionSha256", "adapterContractSha256s", "preservedFloorsSha256"];
  if (!own(migration, fields) || migration.schema !== "pipeline.model-family-migration.v1"
    || !["historicBundleByteSha256", "historicApprovalIntentSha256", "historicRouteSourceSha256",
      "targetRouteSourceSha256", "familyProjectionSha256", "preservedFloorsSha256"].every((k) => SHA.test(migration[k]))
    || !validShaList(migration.adapterContractSha256s)
    || !SHA.test(migration.preservedFloorsSha256) || !predecessor || !own(predecessor, ["rawBundleBytes", "historicRouteSource", "migrationProjection"])
    || !(Buffer.isBuffer(predecessor.rawBundleBytes) || predecessor.rawBundleBytes instanceof Uint8Array)
    || migration.targetRouteSourceSha256 !== targetSourceSha256
    || digest(predecessor.migrationProjection) !== migration.familyProjectionSha256) return null;
  const raw = Buffer.from(predecessor.rawBundleBytes);
  if (createHash("sha256").update(raw).digest("hex") !== migration.historicBundleByteSha256) return null;
  let historic;
  try { historic = parseStrictJson(raw); } catch { return null; }
  const historicRunners = [...new Set(historic.approvedPolicies?.map((p) => p.runner) ?? [])];
  if (historicRunners.length === 0) return null;
  const historicResults = historicRunners.map((requiredRunner) => verifyModelRoleApprovedPolicy({ bundle: historic,
    routeSource: predecessor.historicRouteSource, trustAnchors, requiredRunner }));
  if (historicResults.some((old) => !old.ok || old.sourceSha256 !== migration.historicRouteSourceSha256
    || old.approvalSha256 !== migration.historicApprovalIntentSha256)) return null;
  const old = historicResults[0];
  const history = predecessor.historicRouteSource;
  const historicSource = sourceProjection(history);
  if (!historicSource) return null;
  const oldMembers = new Map();
  const oldUnavailable = new Set();
  for (const t of history.taskRoutes ?? []) {
    if (t.state === "unavailable") oldUnavailable.add(tuple(t.runner, t.taskRoute, t.role, t.effort));
    if (t.state !== "unavailable") {
      const k = tuple(t.runner, t.role, t.effort);
      if (!oldMembers.has(k)) oldMembers.set(k, new Set());
      oldMembers.get(k).add(t.taskRoute);
    }
  }
  const oldSlots = new Map(historic.approvedPolicies.map((p) => [tuple(p.runner, p.role, p.effort), p]));
  const projection = predecessor.migrationProjection;
  if (!Array.isArray(projection) || projection.length !== assignments.length) return null;
  const floorDigest = digest(assignments.map((a) => ({ runner: a.runner, taskRoute: a.taskRoute,
    role: a.role, effort: a.effort, familyId: a.familyId, minimumVersion: a.minimumVersion }))
    .sort((a, b) => tuple(a.runner, a.taskRoute, a.role, a.effort).localeCompare(tuple(b.runner, b.taskRoute, b.role, b.effort))));
  const adapterDigests = [...new Set(assignments.map((a) => a.adapterContractSha256))].sort();
  if (floorDigest !== migration.preservedFloorsSha256
    || canonical(adapterDigests) !== canonical([...migration.adapterContractSha256s].sort())) return null;
  const seen = new Set();
  const projectedHistoricMembers = new Set();
  const expected = new Map(assignments.map((a) => [tuple(a.runner, a.taskRoute, a.role, a.effort), a]));
  // A migration request binds every available target, including explicit new
  // approvals absent from the authenticated predecessor. Omitting those rows
  // cannot turn a partial proposal into complete first-adoption authority.
  const available = routeSource.taskRoutes.filter((t) => t.state !== "unavailable");
  if (available.length !== assignments.length || available.some((t) => !expected.has(tuple(t.runner, t.taskRoute, t.role, t.effort)))) return null;
  for (const row of projection) {
    if (!own(row, ["runner", "taskRoute", "role", "effort", "historicRole", "historicEffort", "historicModelId", "familyId", "minimumVersion", "adapterContractSha256"])
      || (row.historicModelId !== null && (typeof row.historicModelId !== "string" || !row.historicModelId))
      || !Array.isArray(row.minimumVersion) || !SHA.test(row.adapterContractSha256)) return null;
    const k = tuple(row.runner, row.taskRoute, row.role, row.effort);
    const a = expected.get(k);
    const oldKey = tuple(row.runner, row.historicRole, row.historicEffort);
    const slot = oldSlots.get(oldKey);
    const historicTask = historicSource.tasks.get(tuple(row.runner, row.taskRoute));
    if (seen.has(k) || !a || !historicTask || historicTask.state === "unavailable"
      || historicTask.role !== row.historicRole || historicTask.effort !== row.historicEffort
      || historicTask.role !== row.role
      || !(oldMembers.get(oldKey)?.has(row.taskRoute))
      || a.familyId !== row.familyId || canonical(a.minimumVersion) !== canonical(row.minimumVersion)
      || a.adapterContractSha256 !== row.adapterContractSha256) return null;
    if (slot) {
      if (slot.policy.approved.length !== 1 || slot.policy.approved[0].modelId !== row.historicModelId) return null;
      projectedHistoricMembers.add(tuple(oldKey, row.taskRoute));
    } else if (row.historicModelId !== null) return null;
    seen.add(k);
  }
  if (seen.size !== expected.size || migration.adapterContractSha256s.some((h) => !assignments.some((a) => a.adapterContractSha256 === h))) return null;
  const expectedHistoricMembers = new Set();
  for (const key of oldSlots.keys()) for (const taskRoute of oldMembers.get(key) ?? []) {
    expectedHistoricMembers.add(tuple(key, taskRoute));
  }
  if (expectedHistoricMembers.size !== projectedHistoricMembers.size
    || [...expectedHistoricMembers].some((key) => !projectedHistoricMembers.has(key))) return null;
  const targetUnavailable = new Set((routeSource.taskRoutes ?? []).filter((t) => t.state === "unavailable")
    .map((t) => tuple(t.runner, t.taskRoute, t.role, t.effort)));
  if (oldUnavailable.size !== targetUnavailable.size || [...oldUnavailable].some((key) => !targetUnavailable.has(key))) return null;
  return { ok: true, predecessorApprovalSha256: old.approvalSha256 };
}

function authorityIntent(bundle) {
  const subjectSha256 = digest(bundle.subject);
  return createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: bundle.subject.routeSourceSha256, specSha256: subjectSha256,
    candidate: bundle.candidateAtApproval, policyRevision: "model-family-v2",
    subjectSha256, decision: "approved" });
}

function successorValid(predecessor, expectedSha256) {
  return verifiedAuthorities.has(predecessor)
    && predecessor.authoritySha256 === expectedSha256
    && SHA.test(predecessor.authoritySha256)
    && digest(predecessor.authority) === predecessor.authoritySha256
    && predecessor.authority?.schema === "pipeline.model-family-approved-policy.v2"
    && predecessor.authority?.subject?.revision === "model-family-v2";
}

function verifyModelFamilyAuthorityInternal({ bundle, routeSource, trustAnchors, predecessor = null } = {}) {
  if (!own(bundle, ["schema", "candidateAtApproval", "subject", "approvalIntent", "proof"])
    || bundle.schema !== "pipeline.model-family-approved-policy.v2" || !own(bundle.candidateAtApproval, ["commit", "tree"])
    || !OID.test(bundle.candidateAtApproval.commit) || !OID.test(bundle.candidateAtApproval.tree)
    || bundle.candidateAtApproval.commit === bundle.candidateAtApproval.tree
    || !own(bundle.subject, ["revision", "predecessorAuthoritySha256", "routeSourceSha256", "assignments", "migration"])
    || bundle.subject.revision !== "model-family-v2"
    || (bundle.subject.predecessorAuthoritySha256 !== null && !SHA.test(bundle.subject.predecessorAuthoritySha256))
    || !SHA.test(bundle.subject.routeSourceSha256) || !Array.isArray(trustAnchors) || trustAnchors.length === 0) return fail("MODEL-FAMILY-AUTHORITY-SHAPE");
  const expanded = expandAssignments(bundle.subject.assignments, routeSource);
  if (!expanded) return fail("MODEL-FAMILY-AUTHORITY-ASSIGNMENTS");
  const routeSha = digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes });
  if (routeSha !== bundle.subject.routeSourceSha256) return fail("MODEL-FAMILY-AUTHORITY-SOURCE");
  if (bundle.subject.predecessorAuthoritySha256 === null) {
    const migration = migrationValid(bundle.subject.migration, predecessor, expanded, routeSource, routeSha, trustAnchors);
    if (!migration) return fail(bundle.subject.migration === null ? "MODEL-FAMILY-AUTHORITY-PREDECESSOR" : "MODEL-FAMILY-MIGRATION-INVALID");
  } else if (bundle.subject.migration !== null
    || !successorValid(predecessor, bundle.subject.predecessorAuthoritySha256)) {
    return fail("MODEL-FAMILY-AUTHORITY-PREDECESSOR");
  }
  let expected;
  try { expected = authorityIntent(bundle); } catch { return fail("MODEL-FAMILY-AUTHORITY-INTENT"); }
  if (!own(bundle.approvalIntent, ["value", "sha256"]) || bundle.approvalIntent.sha256 !== expected.sha256
    || canonical(bundle.approvalIntent.value) !== canonical(expected.value)) return fail("MODEL-FAMILY-AUTHORITY-INTENT");
  const proof = verifyAgainstTrustAnchors({ intent: expected, anchors: trustAnchors, proof: bundle.proof });
  if (!proof.verified) return fail("MODEL-FAMILY-AUTHORITY-PROOF");
  const value = frozenClone({ authoritySha256: digest(bundle), authority: bundle,
    assignments: expanded, hostAdmission: "not-created" });
  verifiedAuthorities.add(value);
  return { ok: true, code: "MODEL-FAMILY-AUTHORITY-VERIFIED", value };
}

export function verifyModelFamilyAuthority(input = {}) {
  try { return verifyModelFamilyAuthorityInternal(input); }
  catch { return fail("MODEL-FAMILY-AUTHORITY-INVALID"); }
}

function verifyModelFamilyPinDecisionInternal({ decision, authority, previousDecision = null, trustAnchors } = {}) {
  if (!verifiedAuthorities.has(authority) || !Array.isArray(authority.assignments) || !own(decision, ["schema", "subject", "approvalIntent", "proof"])
    || decision.schema !== "pipeline.model-family-pin-decision.v1"
    || !own(decision.subject, ["decision", "authoritySha256", "runner", "familyId", "taskRoutes", "role", "effort", "modelId", "predecessorDecisionSha256", "revision"])
    || !["pin", "unpin"].includes(decision.subject.decision) || decision.subject.authoritySha256 !== authority.authoritySha256
    || !["codex", "claude", "antigravity"].includes(decision.subject.runner) || !FAMILY.test(decision.subject.familyId)
    || !Array.isArray(decision.subject.taskRoutes) || decision.subject.taskRoutes.length < 1
    || !ROLES.has(decision.subject.role) || !EFFORTS.has(decision.subject.effort)
    || !Number.isSafeInteger(decision.subject.revision) || decision.subject.revision < 1
    || (decision.subject.decision === "pin" ? typeof decision.subject.modelId !== "string" || !decision.subject.modelId
      : decision.subject.modelId !== null || !SHA.test(decision.subject.predecessorDecisionSha256 ?? ""))) return fail("MODEL-FAMILY-PIN-SHAPE");
  const s = decision.subject;
  const scope = authority.assignments.filter((a) => a.runner === s.runner && a.role === s.role && a.effort === s.effort && a.familyId === s.familyId);
  const permitted = new Set(scope.map((a) => a.taskRoute));
  if (new Set(s.taskRoutes).size !== s.taskRoutes.length || s.taskRoutes.some((t) => !permitted.has(t))) return fail("MODEL-FAMILY-PIN-SCOPE");
  if (previousDecision === null) {
    if (s.predecessorDecisionSha256 !== null || s.revision !== 1) return fail("MODEL-FAMILY-PIN-REVISION");
  } else {
    const prior = previousDecision?.decision?.subject;
    const normalizedTasks = (routes) => [...routes].sort();
    if (!verifiedPins.has(previousDecision) || previousDecision.authoritySha256 !== authority.authoritySha256
      || s.predecessorDecisionSha256 !== previousDecision.decisionSha256
      || s.revision !== prior?.revision + 1
      || s.runner !== prior?.runner || s.familyId !== prior?.familyId
      || s.role !== prior?.role || s.effort !== prior?.effort
      || canonical(normalizedTasks(s.taskRoutes)) !== canonical(normalizedTasks(prior?.taskRoutes ?? []))) {
      return fail("MODEL-FAMILY-PIN-REVISION");
    }
  }
  const subjectSha256 = digest(s);
  const intent = createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: authority.authority.subject.routeSourceSha256, specSha256: subjectSha256,
    candidate: authority.authority.candidateAtApproval, policyRevision: "model-family-pin-v1",
    subjectSha256, decision: s.decision === "pin" ? "approved" : "released" });
  if (!own(decision.approvalIntent, ["value", "sha256"]) || decision.approvalIntent.sha256 !== intent.sha256
    || canonical(decision.approvalIntent.value) !== canonical(intent.value)
    || !Array.isArray(trustAnchors) || trustAnchors.length === 0
    || !verifyAgainstTrustAnchors({ intent, anchors: trustAnchors, proof: decision.proof }).verified) return fail("MODEL-FAMILY-PIN-PROOF");
  const value = frozenClone({ authoritySha256: authority.authoritySha256, decisionSha256: digest(decision),
    decision, state: s.decision === "pin" ? "pinned" : "unpinned", hostAdmission: "not-created" });
  verifiedPins.add(value);
  return { ok: true, code: "MODEL-FAMILY-PIN-VERIFIED", value };
}

export function verifyModelFamilyPinDecision(input = {}) {
  try { return verifyModelFamilyPinDecisionInternal(input); }
  catch { return fail("MODEL-FAMILY-PIN-INVALID"); }
}
