// SPDX-License-Identifier: SUL-1.0
/** Pure composition around the frozen parallel-dispatch planner. */
import { createHash } from "node:crypto";
import { validateParallelDispatchReceipt } from "./parallel-dispatch-planner.mjs";
import { canonicalExecutionJson, executionSubjectDigest, validateExecutionSubject } from "./execution-plane-contract.mjs";

export const SCHEDULING_LIFECYCLE_SCHEMA = "pipeline.scheduling-lifecycle.v1";
const PLANNER_INPUT_SCHEMA = "pipeline.parallel-dispatch-input.v1";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const BLOCKED_REASON = /^PDP-BLOCKED-(?:DEPENDENCY|WRITE-PATH|RESOURCE|CAPACITY)(?::[A-Za-z0-9._:-]+(?:,[A-Za-z0-9._:-]+)*)?$/u;
const FAILED_STATE = new Set(["failed", "timed-out", "lost", "unavailable"]);
const TERMINAL_STATE = new Set([...FAILED_STATE, "cancelled", "invalidated"]);
const exact = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const hash = (v) => createHash("sha256").update(canonicalExecutionJson(v), "utf8").digest("hex");
const eq = (a, b) => canonicalExecutionJson(a) === canonicalExecutionJson(b);
const sorted = (v, valid, max = 256) => Array.isArray(v) && v.length <= max && v.every(valid) && v.every((x, i) => i === 0 || canonicalExecutionJson(v[i - 1]) < canonicalExecutionJson(x));
const safePath = (v) => typeof v === "string" && Buffer.byteLength(v, "utf8") > 0 && Buffer.byteLength(v, "utf8") <= 512 && v.trim() === v && !v.includes("\0") && !v.includes("\\") && !v.startsWith("/") && !/^[A-Za-z]:/u.test(v) && !v.split("/").some((part) => !part || part === "." || part === "..");
const authority = (v) => exact(v, ["kind", "sha256"]) && ID.test(v.kind) && SHA.test(v.sha256);
const item = (v) => exact(v, ["packageId", "reason", "evidenceSha256"]) && ID.test(v.packageId) && typeof v.reason === "string" && Buffer.byteLength(v.reason, "utf8") > 0 && Buffer.byteLength(v.reason, "utf8") <= 512 && SHA.test(v.evidenceSha256);
function freeze(v) { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

function queueCode(v) {
  return exact(v, ["queueId", "candidate", "revision", "packagesSha256"])
    && ID.test(v.queueId)
    && exact(v.candidate, ["commit", "tree"])
    && OID.test(v.candidate.commit)
    && OID.test(v.candidate.tree)
    && Number.isSafeInteger(v.revision)
    && v.revision >= 0
    && SHA.test(v.packagesSha256) ? null : "SHAPE:queue";
}
function directOrUpstream(reason, states) {
  if (states.has(reason)) return true;
  const match = /^upstream-([a-z-]+):([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/u.exec(reason);
  return match !== null && states.has(match[1]);
}
function lifecycleCode(v) {
  const keys = ["schema", "queue", "plannerInputSha256", "plannerReceiptSha256", "subjectSetSha256", "revision", "selected", "blocked", "completed", "failed", "cancelled", "invalidated", "previousSha256"];
  if (!exact(v, keys)) return "SHAPE:lifecycle";
  if (v.schema !== SCHEDULING_LIFECYCLE_SCHEMA) return "SCHEMA:lifecycle";
  if (queueCode(v.queue)
    || ![v.plannerInputSha256, v.plannerReceiptSha256, v.subjectSetSha256].every((x) => SHA.test(x))
    || !Number.isSafeInteger(v.revision)
    || v.revision !== v.queue.revision
    || ![v.selected, v.blocked, v.completed, v.failed, v.cancelled, v.invalidated].every((x) => sorted(x, item))
    || (v.revision === 0 ? v.previousSha256 !== null : !SHA.test(v.previousSha256))) return "BOUND:lifecycle";
  if (!v.selected.every((x) => x.reason === "selected")
    || !v.blocked.every((x) => BLOCKED_REASON.test(x.reason))
    || !v.completed.every((x) => x.reason === "verified")
    || !v.failed.every((x) => directOrUpstream(x.reason, FAILED_STATE))
    || !v.cancelled.every((x) => directOrUpstream(x.reason, new Set(["cancelled"])))
    || !v.invalidated.every((x) => directOrUpstream(x.reason, new Set(["invalidated"])))) return "AUTHORITY:lifecycle-reason";
  const ids = [v.selected, v.blocked, v.completed, v.failed, v.cancelled, v.invalidated].flat().map((x) => x.packageId);
  return new Set(ids).size === ids.length ? null : "CONFLICT:lifecycle-package";
}
export function schedulingLifecycleDigest(v) { return lifecycleCode(v) ? null : hash(v); }
export function validateSchedulingLifecycle(v) { const code = lifecycleCode(v); return code ? { ok: false, code } : { ok: true, code: null }; }

function packageCode(v) {
  return exact(v, ["id", "dependencies", "writePaths", "resources", "kind"])
    && ID.test(v.id)
    && ID.test(v.kind)
    && sorted(v.dependencies, (x) => ID.test(x))
    && sorted(v.writePaths, safePath)
    && sorted(v.resources, (x) => ID.test(x)) ? null : "AUTHORITY:package-shape";
}
function packageSetCode(packages) {
  if (!Array.isArray(packages)
    || packages.length === 0
    || packages.length > 32
    || !packages.every((entry) => packageCode(entry) === null)
    || !packages.every((entry, index) => index === 0 || packages[index - 1].id < entry.id)) return "AUTHORITY:packages";
  const ids = new Set(packages.map((entry) => entry.id));
  if (ids.size !== packages.length) return "AUTHORITY:package-duplicate";
  if (packages.some((entry) => entry.dependencies.some((dependency) => !ids.has(dependency)))) return "AUTHORITY:dependency-unknown";
  const byId = new Map(packages.map((entry) => [entry.id, entry]));
  const visiting = new Set(); const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    if (byId.get(id).dependencies.some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return packages.some((entry) => visit(entry.id)) ? "AUTHORITY:dependency-cycle" : null;
}
export function schedulingPackageSetDigest(packages) {
  return packageSetCode(packages) === null ? hash(packages) : null;
}
function plannerInputCode(input) {
  if (!exact(input, ["schema", "maxParallel", "reservedSlots", "completed", "packages"]) || input.schema !== PLANNER_INPUT_SCHEMA) return "AUTHORITY:planner-input";
  if (!Number.isSafeInteger(input.maxParallel) || input.maxParallel < 1 || input.maxParallel > 32 || !Number.isSafeInteger(input.reservedSlots) || input.reservedSlots < 0 || input.reservedSlots > input.maxParallel || !sorted(input.completed, (x) => ID.test(x), 32)) return "AUTHORITY:planner-capacity";
  const packageError = packageSetCode(input.packages);
  if (packageError) return packageError;
  const ids = new Set(input.packages.map((entry) => entry.id));
  return input.completed.every((id) => ids.has(id)) ? null : "AUTHORITY:planner-completed";
}
function checkAuthority(input) {
  if (!exact(input, ["queue", "plannerInput", "plannerReceipt", "subjects", "authorityDigests", "prior", "terminalOutcomes"]) || queueCode(input.queue) || !sorted(input.authorityDigests, authority) || input.authorityDigests.length === 0 || !Array.isArray(input.subjects) || input.subjects.length === 0 || input.subjects.length > 32 || !Array.isArray(input.terminalOutcomes)) return "SHAPE:composer";
  const inputError = plannerInputCode(input.plannerInput);
  if (inputError) return inputError;
  const packages = input.plannerInput.packages;
  if (input.queue.packagesSha256 !== schedulingPackageSetDigest(packages)) return "AUTHORITY:package-set";
  if (new Set(input.authorityDigests.map((entry) => entry.kind)).size !== input.authorityDigests.length) return "AUTHORITY:authority-overlap";
  const subjectByPackage = new Map(); const dispatches = new Set();
  let base = null;
  for (const subject of input.subjects) {
    if (!validateExecutionSubject(subject).ok
      || subject.candidateCommit !== input.queue.candidate.commit
      || subject.candidateTree !== input.queue.candidate.tree
      || !eq(subject.authorityDigests, input.authorityDigests)
      || subjectByPackage.has(subject.packageId)
      || dispatches.has(subject.dispatchId)) return "AUTHORITY:subject";
    const identity = [subject.repository.identitySha256, subject.baseCommit, subject.baseTree];
    if (base !== null && !eq(identity, base)) return "AUTHORITY:subject-base";
    base = identity;
    subjectByPackage.set(subject.packageId, subject);
    dispatches.add(subject.dispatchId);
  }
  if (subjectByPackage.size !== packages.length || packages.some((entry) => !subjectByPackage.has(entry.id) || !eq(entry.writePaths, subjectByPackage.get(entry.id).writePaths) || !eq(entry.resources, subjectByPackage.get(entry.id).resources))) return "AUTHORITY:package-binding";
  return null;
}
function outcomeCode(v, packageIds) {
  return exact(v, ["packageId", "state", "evidenceSha256", "subjectSha256"])
    && packageIds.has(v.packageId)
    && new Set(["verified", ...TERMINAL_STATE]).has(v.state)
    && SHA.test(v.evidenceSha256)
    && SHA.test(v.subjectSha256) ? null : "SHAPE:terminal";
}
function terminalClosure(packages, observed) {
  const result = new Map(observed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of packages) {
      if (result.has(entry.id)) continue;
      const dependency = entry.dependencies.find((id) => result.has(id));
      if (dependency) {
        const upstream = result.get(dependency);
        result.set(entry.id, { state: upstream.state, rootPackageId: upstream.rootPackageId, evidenceSha256: upstream.evidenceSha256 });
        changed = true;
      }
    }
  }
  return result;
}
function terminalFromItem(entry) {
  const upstream = /^upstream-([a-z-]+):([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/u.exec(entry.reason);
  return upstream === null
    ? { state: entry.reason, rootPackageId: entry.packageId, evidenceSha256: entry.evidenceSha256 }
    : { state: upstream[1], rootPackageId: upstream[2], evidenceSha256: entry.evidenceSha256 };
}
function priorData(prior, queue) {
  if (prior === null) return queue.revision === 0 ? { completed: new Map(), terminal: new Map(), previousSha256: null, selected: new Set(), subjectSetSha256: null } : null;
  if (!exact(prior, ["lifecycle", "lifecycleSha256"])
    || lifecycleCode(prior.lifecycle)
    || schedulingLifecycleDigest(prior.lifecycle) !== prior.lifecycleSha256
    || prior.lifecycle.queue.queueId !== queue.queueId
    || prior.lifecycle.revision + 1 !== queue.revision
    || prior.lifecycle.queue.candidate.commit !== queue.candidate.commit
    || prior.lifecycle.queue.candidate.tree !== queue.candidate.tree
    || prior.lifecycle.queue.packagesSha256 !== queue.packagesSha256) return null;
  const completed = new Map(prior.lifecycle.completed.map((entry) => [entry.packageId, entry]));
  const terminal = new Map();
  for (const field of ["failed", "cancelled", "invalidated"]) for (const entry of prior.lifecycle[field]) terminal.set(entry.packageId, terminalFromItem(entry));
  return { completed, terminal, previousSha256: prior.lifecycleSha256, selected: new Set(prior.lifecycle.selected.map((entry) => entry.packageId)), subjectSetSha256: prior.lifecycle.subjectSetSha256 };
}

/** Validates authoritative inputs and a caller-held frozen planner receipt, then returns an immutable lifecycle record. */
export function composeSchedulingLifecycle(input) {
  const invalid = checkAuthority(input);
  if (invalid) throw new Error(invalid);
  const packages = input.plannerInput.packages; const ids = new Set(packages.map((entry) => entry.id));
  const prior = priorData(input.prior, input.queue);
  if (!prior) throw new Error("STALE:prior");
  const subjectSetSha256 = hash(input.subjects.map((subject) => executionSubjectDigest(subject)).sort());
  if (prior.subjectSetSha256 !== null && prior.subjectSetSha256 !== subjectSetSha256) throw new Error("STALE:subject-set");
  if (!Array.isArray(input.terminalOutcomes)
    || input.terminalOutcomes.length > 32
    || !input.terminalOutcomes.every((outcome) => outcomeCode(outcome, ids) === null)
    || !input.terminalOutcomes.every((outcome, index) => index === 0 || input.terminalOutcomes[index - 1].packageId < outcome.packageId)) throw new Error("SHAPE:terminal");
  const terminal = new Map(prior.terminal);
  for (const outcome of input.terminalOutcomes) {
    if (!prior.selected.has(outcome.packageId)) throw new Error(prior.completed.has(outcome.packageId) || terminal.has(outcome.packageId) ? "REPLAY:terminal" : "AUTHORITY:terminal-selection");
    const subject = input.subjects.find((entry) => entry.packageId === outcome.packageId);
    if (executionSubjectDigest(subject) !== outcome.subjectSha256) throw new Error("AUTHORITY:terminal-subject");
    if (outcome.state === "verified") {
      if (terminal.has(outcome.packageId)) throw new Error("CONFLICT:terminal");
      prior.completed.set(outcome.packageId, { packageId: outcome.packageId, reason: "verified", evidenceSha256: outcome.evidenceSha256 });
    } else {
      if (prior.completed.has(outcome.packageId) || terminal.has(outcome.packageId)) throw new Error("CONFLICT:terminal");
      terminal.set(outcome.packageId, { state: outcome.state, rootPackageId: outcome.packageId, evidenceSha256: outcome.evidenceSha256 });
    }
  }
  const closed = terminalClosure(packages, terminal);
  const completedIds = [...prior.completed.keys()].sort();
  if (!eq(input.plannerInput.completed, completedIds)) throw new Error("AUTHORITY:planner-completed");
  const effectiveInput = { ...input.plannerInput, completed: completedIds, packages: packages.filter((entry) => !closed.has(entry.id)) };
  const receiptCheck = validateParallelDispatchReceipt(effectiveInput, input.plannerReceipt);
  if (!receiptCheck.ok) throw new Error(`CONFLICT:planner-receipt:${receiptCheck.code}`);
  const plannerReceiptSha256 = hash(input.plannerReceipt);
  const selected = input.plannerReceipt.selected.map((packageId) => ({ packageId, reason: "selected", evidenceSha256: plannerReceiptSha256 }));
  const blocked = input.plannerReceipt.blocked.map((entry) => ({ packageId: entry.id, reason: `${entry.code}${entry.blockers.length ? `:${entry.blockers.join(",")}` : ""}`, evidenceSha256: plannerReceiptSha256 }));
  const terminalItems = (states) => [...closed.entries()]
    .filter(([, entry]) => states.has(entry.state))
    .map(([packageId, entry]) => ({ packageId, reason: packageId === entry.rootPackageId ? entry.state : `upstream-${entry.state}:${entry.rootPackageId}`, evidenceSha256: entry.evidenceSha256 }))
    .sort((left, right) => left.packageId.localeCompare(right.packageId));
  const lifecycle = {
    schema: SCHEDULING_LIFECYCLE_SCHEMA,
    queue: structuredClone(input.queue),
    plannerInputSha256: hash(effectiveInput),
    plannerReceiptSha256,
    subjectSetSha256,
    revision: input.queue.revision,
    selected,
    blocked,
    completed: [...prior.completed.values()].sort((left, right) => left.packageId.localeCompare(right.packageId)),
    failed: terminalItems(FAILED_STATE),
    cancelled: terminalItems(new Set(["cancelled"])),
    invalidated: terminalItems(new Set(["invalidated"])),
    previousSha256: prior.previousSha256,
  };
  const code = lifecycleCode(lifecycle);
  if (code) throw new Error(code);
  return freeze(lifecycle);
}
