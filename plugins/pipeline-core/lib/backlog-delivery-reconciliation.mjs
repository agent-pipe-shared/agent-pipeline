// SPDX-License-Identifier: SUL-1.0

/** Pure, closed-record planning contract for canonical backlog reconciliation. */
import { createHash } from "node:crypto";

export const BACKLOG_DELIVERY_INTENT_SCHEMA = "pipeline.backlog-delivery-intent.v1";
export const BACKLOG_SPEC_BINDING_SCHEMA = "pipeline.backlog-spec-binding.v1";
export const BACKLOG_RECONCILIATION_PREVIEW_SCHEMA = "pipeline.backlog-reconciliation-preview.v1";
export const BACKLOG_RECONCILIATION_RECEIPT_SCHEMA = "pipeline.backlog-reconciliation-receipt.v1";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const PATH = /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*\/$)(?!\.{1,2}$)(?!\.{1,2}\/)(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DOMAINS = new Set(["SHAPE", "SCHEMA", "BOUND", "AUTHORITY", "CAS", "STALE", "REPLAY", "CONFLICT", "UNAVAILABLE", "DURABILITY", "READBACK", "INTERNAL"]);

function finding(domain, message) { return `${DOMAINS.has(domain) ? domain : "INTERNAL"}: ${message}`; }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function exact(value, keys, label, errors) {
  if (!plain(value)) { errors.push(finding("SHAPE", `${label} must be an object`)); return false; }
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) errors.push(finding("SHAPE", `${label} has unsupported or missing fields`));
  return true;
}
function digest(schema, value) { return createHash("sha256").update(`${schema}\0${canonicalJson(value)}`).digest("hex"); }
function checkString(value, expression, label, errors, domain = "SHAPE", max = null) {
  if (typeof value !== "string" || !expression.test(value) || (max !== null && value.length > max)) errors.push(finding(domain, `${label} is invalid`));
}
function sortedUnique(values) { return Array.isArray(values) && values.every((value, index) => index === 0 || values[index - 1] < value); }

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function validateEvidence(value, label, errors) {
  if (!exact(value, ["kind", "path", "fileSha256", "recordSha256"], label, errors)) return;
  checkString(value.kind, ID, `${label}.kind`, errors, "SHAPE", 128);
  checkString(value.path, PATH, `${label}.path`, errors, "BOUND", 512);
  checkString(value.fileSha256, SHA, `${label}.fileSha256`, errors);
  if (!(value.recordSha256 === null || (typeof value.recordSha256 === "string" && SHA.test(value.recordSha256)))) errors.push(finding("SHAPE", `${label}.recordSha256 is invalid`));
}
function validateAuthority(value, errors) {
  if (!exact(value, ["kind", "decisionId", "receiptPath", "receiptSha256"], "authority", errors)) return;
  checkString(value.kind, ID, "authority.kind", errors, "SHAPE", 128);
  checkString(value.decisionId, ID, "authority.decisionId", errors, "SHAPE", 128);
  checkString(value.receiptPath, PATH, "authority.receiptPath", errors, "BOUND", 512);
  checkString(value.receiptSha256, SHA, "authority.receiptSha256", errors);
}
function validateItem(value, errors) {
  if (!exact(value, ["id", "path", "expectedStatus", "expectedFileSha256", "draft"], "item", errors)) return;
  checkString(value.id, ID, "item.id", errors, "SHAPE", 128);
  checkString(value.path, PATH, "item.path", errors, "BOUND", 512);
  if (!([null, "open", "in_progress", "closed"].includes(value.expectedStatus))) errors.push(finding("SHAPE", "item.expectedStatus is invalid"));
  checkString(value.expectedFileSha256, SHA, "item.expectedFileSha256", errors);
  if (value.draft !== null) {
    if (!exact(value.draft, ["metadata", "bodyBase64", "bodySha256"], "item.draft", errors)) return;
    const metadata = value.draft.metadata;
    const metadataKeys = ["schema", "id", "type", "owner", "status", "created", "source", "tracking"];
    if (!exact(metadata, metadataKeys, "item.draft.metadata", errors)
      || metadata.schema !== "pipeline.backlog-item.v1"
      || metadata.id !== value.id
      || metadata.status !== "open"
      || !["workflow-improvement", "tooling-radar", "defect", "idea"].includes(metadata.type)
      || !(metadata.owner === "pipeline" || /^project:[a-z][a-z0-9-]*$/u.test(metadata.owner ?? ""))
      || !/^\d{4}-\d{2}-\d{2}$/u.test(metadata.created ?? "")
      || typeof metadata.source !== "string" || metadata.source.length === 0
      || typeof metadata.tracking !== "string" || metadata.tracking.length === 0) errors.push(finding("BOUND", "item.draft must be the exact open canonical backlog item"));
    if (typeof value.draft.bodyBase64 !== "string" || !SHA.test(value.draft.bodySha256 ?? "")) errors.push(finding("SHAPE", "item.draft body is invalid"));
    else if (createHash("sha256").update(Buffer.from(value.draft.bodyBase64, "base64")).digest("hex") !== value.draft.bodySha256) errors.push(finding("BOUND", "item.draft bodySha256 does not bind bodyBase64"));
  }
}
function validateSpecification(value, errors) {
  if (!exact(value, ["path", "fileSha256", "approvalReceiptSha256"], "specification", errors)) return;
  checkString(value.path, PATH, "specification.path", errors, "BOUND", 512);
  checkString(value.fileSha256, SHA, "specification.fileSha256", errors);
  if (!(value.approvalReceiptSha256 === null || (typeof value.approvalReceiptSha256 === "string" && SHA.test(value.approvalReceiptSha256)))) errors.push(finding("SHAPE", "specification.approvalReceiptSha256 is invalid"));
}
function validateExpected(value, errors) {
  if (!exact(value, ["ledgerHead", "indexFileSha256", "statusFileSha256", "backlogSubtree"], "expected", errors)) return;
  for (const key of Object.keys(value)) checkString(value[key], SHA, `expected.${key}`, errors);
}
function validateGates(gates, errors) {
  if (!Array.isArray(gates) || gates.length > 64) { errors.push(finding("BOUND", "gates are invalid")); return; }
  if (!sortedUnique(gates.map((gate) => gate?.gate))) errors.push(finding("BOUND", "gates must be sorted and unique by gate"));
  for (const [index, gate] of gates.entries()) {
    if (!exact(gate, ["gate", "candidate", "evidence", "status"], `gates[${index}]`, errors)) continue;
    checkString(gate.gate, /^[A-Za-z0-9:._-]+$/u, `gates[${index}].gate`, errors, "SHAPE", 256);
    if (!exact(gate.candidate, ["commit", "tree"], `gates[${index}].candidate`, errors)) continue;
    checkString(gate.candidate.commit, OID, `gates[${index}].candidate.commit`, errors);
    checkString(gate.candidate.tree, OID, `gates[${index}].candidate.tree`, errors);
    validateEvidence(gate.evidence, `gates[${index}].evidence`, errors);
    if (gate.status !== "passed") errors.push(finding("BOUND", `gates[${index}].status must be passed`));
  }
}

export function validateBacklogDeliveryIntent(value) {
  const errors = [];
  if (!exact(value, ["schema", "intentId", "idempotencyKey", "operation", "item", "sprint", "specification", "candidate", "gates", "authority", "expected", "evidence", "createdAt"], "delivery intent", errors)) return { ok: false, findings: errors };
  if (value.schema !== BACKLOG_DELIVERY_INTENT_SCHEMA) errors.push(finding("SCHEMA", `delivery intent schema must equal ${BACKLOG_DELIVERY_INTENT_SCHEMA}`));
  checkString(value.intentId, ID, "intentId", errors, "SHAPE", 128);
  if (!["initialize", "assign", "close", "amend-evidence"].includes(value.operation)) errors.push(finding("SHAPE", "operation is invalid"));
  validateItem(value.item, errors);
  if (!exact(value.sprint, ["name", "increment"], "sprint", errors) || value.sprint.name !== "Nova" || !["A", "B"].includes(value.sprint.increment)) errors.push(finding("BOUND", "sprint must be exactly Nova A or Nova B"));
  validateSpecification(value.specification, errors);
  if (!(value.candidate === null || (exact(value.candidate, ["commit", "tree"], "candidate", errors) && OID.test(value.candidate.commit ?? "") && OID.test(value.candidate.tree ?? "")))) errors.push(finding("SHAPE", "candidate is invalid"));
  validateGates(value.gates, errors); validateAuthority(value.authority, errors); validateExpected(value.expected, errors);
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || value.evidence.length > 64) errors.push(finding("BOUND", "evidence is invalid"));
  else {
    if (!sortedUnique(value.evidence.map((entry) => `${entry?.kind ?? ""}\0${entry?.path ?? ""}`))) errors.push(finding("BOUND", "evidence must be sorted and unique by kind and path"));
    value.evidence.forEach((entry, index) => validateEvidence(entry, `evidence[${index}]`, errors));
  }
  if (typeof value.createdAt !== "string" || !ISO_INSTANT.test(value.createdAt)) errors.push(finding("BOUND", "createdAt must be a canonical UTC instant"));
  const expectedKey = digest(BACKLOG_DELIVERY_INTENT_SCHEMA, { operation: value.operation, authority: value.authority, expected: value.expected });
  if (value.idempotencyKey !== expectedKey) errors.push(finding("BOUND", "idempotencyKey does not bind operation, authority, and expected snapshot"));
  return { ok: errors.length === 0, findings: errors };
}

function validateSnapshot(value, errors) {
  if (!exact(value, ["commit", "tree", "backlogSubtree", "ledgerHead", "indexFileSha256", "statusFileSha256", "itemFileSha256"], "backlogSnapshot", errors)) return;
  checkString(value.commit, OID, "backlogSnapshot.commit", errors);
  checkString(value.tree, OID, "backlogSnapshot.tree", errors);
  for (const key of ["backlogSubtree", "ledgerHead", "indexFileSha256", "statusFileSha256"]) checkString(value[key], SHA, `backlogSnapshot.${key}`, errors);
  if (!Array.isArray(value.itemFileSha256) || !value.itemFileSha256.every((entry) => plain(entry) && Object.keys(entry).sort().join(",") === "id,sha256" && ID.test(entry.id) && SHA.test(entry.sha256)) || !sortedUnique(value.itemFileSha256.map((entry) => entry.id))) errors.push(finding("BOUND", "backlogSnapshot.itemFileSha256 must be sorted canonical item digests"));
}
function validateBinding(value, index, errors) {
  if (!exact(value, ["id", "issue", "increment", "acceptanceIds", "closureMode", "expiryDisposition"], `bindings[${index}]`, errors)) return;
  checkString(value.id, ID, `bindings[${index}].id`, errors, "SHAPE", 128);
  if (!Number.isSafeInteger(value.issue) || value.issue < 1) errors.push(finding("BOUND", `bindings[${index}].issue is invalid`));
  if (!/^[A-Z]$/u.test(value.increment ?? "")) errors.push(finding("SHAPE", `bindings[${index}].increment is invalid`));
  if (!Array.isArray(value.acceptanceIds) || value.acceptanceIds.length === 0 || !sortedUnique(value.acceptanceIds) || !value.acceptanceIds.every((id) => /^NVA-[AB]\d+-\d+$/u.test(id))) errors.push(finding("BOUND", `bindings[${index}].acceptanceIds must be sorted and unique`));
  if (!(["candidate-evidence", "separate-pilot-required", "cyborg-input-only", "later-sprint-input-only"].includes(value.closureMode))) errors.push(finding("BOUND", `bindings[${index}].closureMode is invalid`));
  if (!(value.expiryDisposition === "not-applicable" || /^revalidate:\d{4}-\d{2}-\d{2}$/u.test(value.expiryDisposition ?? ""))) errors.push(finding("BOUND", `bindings[${index}].expiryDisposition is invalid`));
}
export function validateBacklogSpecBinding(value) {
  const errors = [];
  if (!exact(value, ["schema", "featureId", "specification", "backlogSnapshot", "bindings", "recordSha256"], "Spec binding", errors)) return { ok: false, findings: errors };
  if (value.schema !== BACKLOG_SPEC_BINDING_SCHEMA) errors.push(finding("SCHEMA", `Spec binding schema must equal ${BACKLOG_SPEC_BINDING_SCHEMA}`));
  checkString(value.featureId, ID, "featureId", errors, "SHAPE", 128);
  if (!exact(value.specification, ["path", "sha256"], "Spec binding specification", errors)) {} else { checkString(value.specification.path, PATH, "Spec binding specification.path", errors, "BOUND", 512); checkString(value.specification.sha256, SHA, "Spec binding specification.sha256", errors); }
  validateSnapshot(value.backlogSnapshot, errors);
  const bindingOrder = Array.isArray(value.bindings) ? value.bindings.map((entry) => `${entry?.increment ?? ""}\0${entry?.id ?? ""}`) : [];
  if (!Array.isArray(value.bindings) || value.bindings.length === 0 || !sortedUnique(bindingOrder)) errors.push(finding("BOUND", "bindings must be sorted and unique by increment and id")); else value.bindings.forEach((entry, index) => validateBinding(entry, index, errors));
  const record = { ...value }; delete record.recordSha256;
  if (value.recordSha256 !== digest(BACKLOG_SPEC_BINDING_SCHEMA, record)) errors.push(finding("BOUND", "recordSha256 does not bind canonical Spec binding content"));
  return { ok: errors.length === 0, findings: errors };
}

function reject(findings) { return { ok: false, findings, preview: null }; }
function sameCandidate(left, right) { return left?.commit === right?.commit && left?.tree === right?.tree; }
function eventHash(intent, state, from, to) { return digest("pipeline.backlog-transition.v2", { id: intent.item.id, sequence: state.nextSequence, from, to, previousHash: state.ledgerHead }); }
function snapshot(state, intent) {
  const itemFileSha256 = Array.isArray(state.itemFileSha256) ? state.itemFileSha256.map((entry) => ({ ...entry })) : [];
  return {
    commit: state.commit,
    tree: state.tree,
    ledgerHead: state.ledgerHead,
    indexFileSha256: state.indexFileSha256,
    statusFileSha256: state.statusFileSha256,
    backlogSubtree: state.backlogSubtree,
    itemFileSha256,
  };
}

function replacementItemDigests(snapshotValue, intent, to) {
  const next = snapshotValue.itemFileSha256.filter((entry) => entry.id !== intent.item.id);
  next.push({ id: intent.item.id, sha256: digest("pipeline.backlog-item.v1", { id: intent.item.id, from: intent.item.expectedStatus, to, intentSha256: digest(BACKLOG_DELIVERY_INTENT_SCHEMA, intent) }) });
  return next.toSorted((left, right) => left.id.localeCompare(right.id));
}

function targetDigests(state, intent, event, postSnapshot) {
  const intentSha256 = digest(BACKLOG_DELIVERY_INTENT_SCHEMA, intent);
  const pre = new Map([
    [intent.item.path, intent.item.expectedFileSha256],
    ["backlog/STATUS.md", state.statusFileSha256],
    ["backlog/index.json", state.indexFileSha256],
    ["backlog/transitions.ndjson", state.ledgerHead],
  ]);
  return [...pre.keys()].toSorted().map((path) => ({
    path,
    preSha256: pre.get(path),
    postSha256: digest("pipeline.backlog-reconciliation-target.v1", { path, intentSha256, event: event.entryHash, postSnapshot }),
  }));
}

export function planBacklogDeliveryReconciliation({ intent, binding, state } = {}) {
  const findings = [...validateBacklogDeliveryIntent(intent).findings, ...validateBacklogSpecBinding(binding).findings];
  if (!plain(state)) return reject([...findings, finding("SHAPE", "state must be an object")]);
  if (findings.length) return reject(findings);
  if (binding.specification.path !== intent.specification.path || binding.specification.sha256 !== intent.specification.fileSha256) findings.push(finding("STALE", "Spec binding does not match intent specification"));
  if (state.repository !== "self" || state.writerAuthority !== "canonical-backlog-single-writer") findings.push(finding("AUTHORITY", "only the canonical self backlog writer may reconcile"));
  for (const [stateKey, intentKey] of [["ledgerHead", "ledgerHead"], ["indexFileSha256", "indexFileSha256"], ["statusFileSha256", "statusFileSha256"], ["backlogSubtree", "backlogSubtree"]]) if (state[stateKey] !== intent.expected[intentKey]) findings.push(finding("CAS", `${stateKey} differs from the expected snapshot`));
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const prior = receipts.find((receipt) => receipt?.idempotencyKey === intent.idempotencyKey);
  if (prior) findings.push(finding(prior.intentSha256 === digest(BACKLOG_DELIVERY_INTENT_SCHEMA, intent) ? "REPLAY" : "CONFLICT", "idempotencyKey was already consumed"));
  let from; let to;
  if (intent.operation === "initialize") {
    from = null; to = "open";
    if (intent.item.expectedStatus !== null || intent.item.draft === null) findings.push(finding("BOUND", "initialize requires a reviewed absent open draft"));
    if ((state.occupiedIds ?? []).includes(intent.item.id) || (state.occupiedPaths ?? []).includes(intent.item.path)) findings.push(finding("CONFLICT", "initialize item id or path is already occupied"));
    if (intent.authority.kind !== "backlog-intake") findings.push(finding("AUTHORITY", "initialize requires backlog-intake authority"));
  } else if (intent.operation === "assign") {
    from = "open"; to = "in_progress";
    if (intent.item.expectedStatus !== "open" || state.item?.status !== "open") findings.push(finding("CAS", "assign requires the item to remain open"));
    if (intent.authority.kind !== "implementation-activation" || !intent.specification.approvalReceiptSha256) findings.push(finding("AUTHORITY", "assign requires approved Spec activation authority"));
    const selected = binding.bindings.find((entry) => entry.id === intent.item.id && entry.increment === intent.sprint.increment);
    if (!selected) findings.push(finding("BOUND", "assign requires an exact Spec-binding row"));
  } else if (intent.operation === "close") {
    from = "in_progress"; to = "closed";
    if (intent.item.expectedStatus !== "in_progress" || state.item?.status !== "in_progress") findings.push(finding("CAS", "close requires the item to remain in_progress"));
    if (!intent.candidate || intent.authority.kind !== "closure") findings.push(finding("AUTHORITY", "close requires candidate and closure authority"));
    const selected = binding.bindings.find((entry) => entry.id === intent.item.id && entry.increment === intent.sprint.increment);
    if (!selected) findings.push(finding("BOUND", "close requires an exact Spec-binding row"));
    const required = [...(selected?.acceptanceIds ?? []).map((id) => `acceptance:${id}`), "verify"].sort();
    const actual = intent.gates.map((gate) => gate.gate).sort();
    if (required.join("\n") !== actual.join("\n") || !intent.gates.every((gate) => gate.status === "passed" && sameCandidate(gate.candidate, intent.candidate))) findings.push(finding("BOUND", "close requires every accepted passed gate for the candidate"));
  } else {
    from = intent.item.expectedStatus; to = intent.item.expectedStatus;
    if (!["open", "in_progress", "closed"].includes(intent.item.expectedStatus) || state.item?.status !== intent.item.expectedStatus) findings.push(finding("CAS", "amend-evidence requires the item to retain its exact current status"));
    if (intent.authority.kind !== "evidence-repair" || !intent.candidate) findings.push(finding("AUTHORITY", "amend-evidence requires repair authority and candidate"));
    const amendment = state.amendment; const target = state.amendmentTarget;
    if (!amendment || !target || amendment.targetSequence !== target.sequence || amendment.targetEntryHash !== target.entryHash || amendment.targetCommit !== (target?.evidence?.commit ?? target?.commit) || target.id !== intent.item.id) findings.push(finding("BOUND", "amend-evidence target is not exact"));
  }
  if (findings.length) return reject(findings.toSorted());
  const event = { schema: "pipeline.backlog-transition.v2", sequence: state.nextSequence, id: intent.item.id, from, to, entryHash: eventHash(intent, state, from, to) };
  const preSnapshot = snapshot(state, intent);
  const postSnapshot = { ...preSnapshot, ledgerHead: event.entryHash, itemFileSha256: replacementItemDigests(preSnapshot, intent, to) };
  const targets = targetDigests(state, intent, event, postSnapshot);
  const preview = { schema: BACKLOG_RECONCILIATION_PREVIEW_SCHEMA, status: "preview", previewId: digest(BACKLOG_RECONCILIATION_PREVIEW_SCHEMA, { intent: intent.idempotencyKey, state: state.ledgerHead }), intentSha256: digest(BACKLOG_DELIVERY_INTENT_SCHEMA, intent), preSnapshot, postSnapshot, events: [event], targets, reasons: [`${intent.operation}:${intent.item.id}`], authorityRequired: { repository: "self", writer: "canonical-backlog-single-writer" }, previewSha256: "" };
  preview.previewSha256 = digest(BACKLOG_RECONCILIATION_PREVIEW_SCHEMA, Object.fromEntries(Object.entries(preview).filter(([key]) => key !== "previewSha256")));
  return { ok: true, findings: [], preview };
}
