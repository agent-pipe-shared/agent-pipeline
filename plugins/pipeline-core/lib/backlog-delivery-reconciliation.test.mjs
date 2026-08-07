#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Minimal A1.2 pure API frozen by this test:
 *
 * - four schema-ID constants named below;
 * - validateBacklogDeliveryIntent(value) -> { ok, findings };
 * - validateBacklogSpecBinding(value) -> { ok, findings };
 * - planBacklogDeliveryReconciliation({ intent, binding, state })
 *     -> { ok, findings, preview }, where preview is null on rejection.
 *
 * Validators and the planner are pure. They accept records/closed read-state
 * only, return stable Spec section 7.2 domain-prefixed findings, and expose no
 * filesystem writer. Application, journaling, and receipt installation are
 * deliberately outside this first contract.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  BACKLOG_DELIVERY_INTENT_SCHEMA,
  BACKLOG_RECONCILIATION_PREVIEW_SCHEMA,
  BACKLOG_RECONCILIATION_RECEIPT_SCHEMA,
  BACKLOG_SPEC_BINDING_SCHEMA,
  planBacklogDeliveryReconciliation,
  validateBacklogDeliveryIntent,
  validateBacklogSpecBinding,
} from "./backlog-delivery-reconciliation.mjs";

let passed = 0;
let failed = 0;
const DOMAIN = /^(?:SHAPE|SCHEMA|BOUND|AUTHORITY|CAS|STALE|REPLAY|CONFLICT|UNAVAILABLE|DURABILITY|READBACK|INTERNAL):/u;
const SHA_EMPTY = createHash("sha256").update("").digest("hex");
const SHA = Object.freeze({
  item: "1".repeat(64),
  spec: "2".repeat(64),
  approval: "3".repeat(64),
  ledger: "4".repeat(64),
  index: "5".repeat(64),
  status: "6".repeat(64),
  subtree: "7".repeat(64),
  authority: "8".repeat(64),
  evidence: "9".repeat(64),
  record: "a".repeat(64),
});
const OID = Object.freeze({
  commit: "b".repeat(40),
  tree: "c".repeat(40),
});

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function semanticDigest(schema, value) {
  return createHash("sha256").update(`${schema}\0${canonicalJson(value)}`).digest("hex");
}

function without(value, key) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function rebindIntent(intent) {
  const next = structuredClone(intent);
  next.idempotencyKey = semanticDigest(BACKLOG_DELIVERY_INTENT_SCHEMA, {
    operation: next.operation,
    authority: next.authority,
    expected: next.expected,
  });
  return next;
}

function rebindSpecBinding(binding) {
  const next = structuredClone(binding);
  next.recordSha256 = semanticDigest(BACKLOG_SPEC_BINDING_SCHEMA, without(next, "recordSha256"));
  return next;
}

function specification(overrides = {}) {
  return {
    path: "specs/sprint-nova-epic/spec.md",
    fileSha256: SHA.spec,
    approvalReceiptSha256: SHA.approval,
    ...overrides,
  };
}

function bindingSpecification(overrides = {}) {
  return {
    path: "specs/sprint-nova-epic/spec.md",
    sha256: SHA.spec,
    ...overrides,
  };
}

function authority(kind, overrides = {}) {
  return {
    kind,
    decisionId: `nova-a1-${kind}`,
    receiptPath: `specs/sprint-nova-epic/evidence/backlog/${kind}.json`,
    receiptSha256: SHA.authority,
    ...overrides,
  };
}

function backlogSnapshot(overrides = {}) {
  return {
    commit: OID.commit,
    tree: OID.tree,
    backlogSubtree: SHA.subtree,
    ledgerHead: SHA.ledger,
    indexFileSha256: SHA.index,
    statusFileSha256: SHA.status,
    itemFileSha256: [{ id: "pipeline.backlog-delivery-status-reconciliation", sha256: SHA.item }],
    ...overrides,
  };
}

function amendmentRecord(overrides = {}) {
  const value = {
    schema: "pipeline.backlog-evidence-amendment.v1",
    kind: "evidence-amendment",
    targetSequence: 40,
    targetEntryHash: "d".repeat(64),
    targetCommit: "e".repeat(40),
    replacementCommit: OID.commit,
    reference: "specs/sprint-nova-epic/evidence/backlog/unreachable-evidence-disposition.md",
    dispositionSha256: SHA.evidence,
    idempotencyKey: "f".repeat(64),
    ...overrides,
  };
  return value;
}

function specBinding(overrides = {}) {
  const value = {
    schema: BACKLOG_SPEC_BINDING_SCHEMA,
    featureId: "sprint-nova-epic",
    specification: bindingSpecification(),
    backlogSnapshot: backlogSnapshot(),
    bindings: [{
      id: "pipeline.backlog-delivery-status-reconciliation",
      issue: 57,
      increment: "A",
      acceptanceIds: [
        "NVA-A57-1",
        "NVA-A57-2",
        "NVA-A57-3",
        "NVA-A57-4",
        "NVA-A57-5",
        "NVA-A57-6",
      ],
      closureMode: "candidate-evidence",
      expiryDisposition: "not-applicable",
    }],
    recordSha256: "",
    ...overrides,
  };
  return rebindSpecBinding(value);
}

function initializeIntent(overrides = {}) {
  const bodyBytes = Buffer.from("\n# Canonical backlog delivery/status reconciliation\n", "utf8");
  const value = {
    schema: BACKLOG_DELIVERY_INTENT_SCHEMA,
    intentId: "nova-a1-initialize-57",
    idempotencyKey: "",
    operation: "initialize",
    item: {
      id: "pipeline.backlog-delivery-status-reconciliation",
      path: "backlog/items/2026-07-24-backlog-delivery-status-reconciliation.md",
      expectedStatus: null,
      expectedFileSha256: SHA_EMPTY,
      draft: {
        metadata: {
          schema: "pipeline.backlog-item.v1",
          id: "pipeline.backlog-delivery-status-reconciliation",
          type: "defect",
          owner: "pipeline",
          status: "open",
          created: "2026-07-24",
          source: "https://github.com/example/agent-pipeline/issues/57",
          tracking: "Sprint Nova A1 accepted intake.",
        },
        bodyBase64: bodyBytes.toString("base64"),
        bodySha256: createHash("sha256").update(bodyBytes).digest("hex"),
      },
    },
    sprint: { name: "Nova", increment: "A" },
    specification: specification(),
    candidate: null,
    gates: [],
    authority: authority("backlog-intake"),
    expected: {
      ledgerHead: SHA.ledger,
      indexFileSha256: SHA.index,
      statusFileSha256: SHA.status,
      backlogSubtree: SHA.subtree,
    },
    evidence: [{
      kind: "reviewed-issue-intake",
      path: "specs/sprint-nova-epic/design/backlog-intake.md",
      fileSha256: SHA.evidence,
      recordSha256: null,
    }],
    createdAt: "2026-07-24T12:00:00.000Z",
    ...overrides,
  };
  return rebindIntent(value);
}

function operationIntent(operation) {
  const value = initializeIntent();
  value.operation = operation;
  value.intentId = `nova-a1-${operation}-57`;
  value.item.draft = null;
  value.item.expectedFileSha256 = SHA.item;
  value.item.expectedStatus = operation === "assign" ? "open" : operation === "close" ? "in_progress" : "closed";
  if (operation === "assign") {
    value.authority = authority("implementation-activation");
  } else if (operation === "close") {
    value.authority = authority("closure");
    value.candidate = { ...OID };
    value.gates = [
      ...specBinding().bindings[0].acceptanceIds.map((acceptanceId, index) => ({
        gate: `acceptance:${acceptanceId}`,
        candidate: { ...OID },
        evidence: {
          kind: "acceptance",
          path: `specs/sprint-nova-epic/evidence/backlog/acceptance-${index + 1}.json`,
          fileSha256: String(index + 1).repeat(64),
          recordSha256: null,
        },
        status: "passed",
      })),
      {
        gate: "verify",
        candidate: { ...OID },
        evidence: {
          kind: "verify",
          path: "specs/sprint-nova-epic/evidence/backlog/verify.json",
          fileSha256: "e".repeat(64),
          recordSha256: SHA.record,
        },
        status: "passed",
      },
    ].toSorted((left, right) => left.gate.localeCompare(right.gate));
  } else {
    value.authority = authority("evidence-repair");
    value.candidate = { ...OID };
    const amendment = amendmentRecord();
    value.evidence = [{
      kind: "evidence-amendment",
      path: "specs/sprint-nova-epic/evidence/backlog/event-40-amendment-intent.json",
      fileSha256: SHA.evidence,
      recordSha256: semanticDigest(amendment.schema, amendment),
    }];
  }
  return rebindIntent(value);
}

function stateFor(intent, overrides = {}) {
  const status = intent.item.expectedStatus;
  return {
    repository: "self",
    writerAuthority: "canonical-backlog-single-writer",
    commit: OID.commit,
    tree: OID.tree,
    item: status === null ? null : {
      id: intent.item.id,
      path: intent.item.path,
      status,
      fileSha256: intent.item.expectedFileSha256,
    },
    ledgerHead: intent.expected.ledgerHead,
    nextSequence: 41,
    indexFileSha256: intent.expected.indexFileSha256,
    statusFileSha256: intent.expected.statusFileSha256,
    backlogSubtree: intent.expected.backlogSubtree,
    itemFileSha256: [
      ...(status === null ? [] : [{ id: intent.item.id, sha256: intent.item.expectedFileSha256 }]),
      { id: "pipeline.other", sha256: SHA.record },
    ].toSorted((left, right) => left.id.localeCompare(right.id)),
    occupiedIds: status === null ? [] : [intent.item.id],
    occupiedPaths: status === null ? [] : [intent.item.path],
    receipts: [],
    amendment: intent.operation === "amend-evidence" ? amendmentRecord() : null,
    amendmentTarget: intent.operation === "amend-evidence"
      ? {
        sequence: 40,
        entryHash: "d".repeat(64),
        commit: "e".repeat(40),
        id: intent.item.id,
        status: "closed",
      }
      : null,
    ...overrides,
  };
}

function validationFindings(result) {
  return Array.isArray(result?.findings) ? result.findings : [];
}

function validates(validator, value) {
  const result = validator(value);
  return result?.ok === true
    && Object.keys(result).toSorted().join(",") === "findings,ok"
    && validationFindings(result).length === 0;
}

function rejectsWithDomain(validator, value) {
  const result = validator(value);
  const findings = validationFindings(result);
  return result?.ok === false
    && Object.keys(result).toSorted().join(",") === "findings,ok"
    && findings.length > 0
    && findings.every((finding) => DOMAIN.test(finding));
}

function plan(intent, state = stateFor(intent), binding = specBinding()) {
  return planBacklogDeliveryReconciliation({ intent, binding, state });
}

function rejectedPlan(result) {
  return result?.ok === false
    && Object.keys(result).toSorted().join(",") === "findings,ok,preview"
    && result.preview === null
    && validationFindings(result).length > 0
    && validationFindings(result).every((finding) => DOMAIN.test(finding));
}

function canonicalItemDigests(value) {
  return Array.isArray(value)
    && value.every((entry) => entry && typeof entry === "object"
      && Object.keys(entry).toSorted().join(",") === "id,sha256"
      && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(entry.id)
      && /^[a-f0-9]{64}$/u.test(entry.sha256))
    && value.map((entry) => entry.id).join("\n") === [...new Set(value.map((entry) => entry.id))].toSorted().join("\n");
}

function replacesExactlyOneSnapshotItem(preSnapshot, postSnapshot, intent, from) {
  if (!canonicalItemDigests(preSnapshot.itemFileSha256) || !canonicalItemDigests(postSnapshot.itemFileSha256)) return false;
  const before = new Map(preSnapshot.itemFileSha256.map((entry) => [entry.id, entry.sha256]));
  const after = new Map(postSnapshot.itemFileSha256.map((entry) => [entry.id, entry.sha256]));
  const beforeItem = before.get(intent.item.id);
  const afterItem = after.get(intent.item.id);
  if ((from === null && beforeItem !== undefined) || (from !== null && beforeItem !== intent.item.expectedFileSha256) || !afterItem) return false;
  return [...before.entries()].every(([id, sha256]) => id === intent.item.id || after.get(id) === sha256)
    && [...after.keys()].every((id) => id === intent.item.id || before.has(id));
}

check("BDR01 exports the exact A1 schema identities", [
  BACKLOG_DELIVERY_INTENT_SCHEMA === "pipeline.backlog-delivery-intent.v1",
  BACKLOG_SPEC_BINDING_SCHEMA === "pipeline.backlog-spec-binding.v1",
  BACKLOG_RECONCILIATION_PREVIEW_SCHEMA === "pipeline.backlog-reconciliation-preview.v1",
  BACKLOG_RECONCILIATION_RECEIPT_SCHEMA === "pipeline.backlog-reconciliation-receipt.v1",
].every(Boolean));

{
  const intent = initializeIntent();
  const binding = specBinding();
  check("BDR02 accepts closed canonical delivery-intent and Spec-binding roots",
    validates(validateBacklogDeliveryIntent, intent)
      && validates(validateBacklogSpecBinding, binding));
}

{
  const intent = initializeIntent();
  const binding = specBinding();
  const invalid = [
    { validator: validateBacklogDeliveryIntent, value: null },
    { validator: validateBacklogDeliveryIntent, value: [] },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, extra: true } },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, item: { ...intent.item, extra: true } } },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, authority: { ...intent.authority, rawDecision: "approved" } } },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, expected: { ...intent.expected, extra: SHA.record } } },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, evidence: [{ ...intent.evidence[0], extra: true }] } },
    { validator: validateBacklogSpecBinding, value: { ...binding, extra: true } },
    { validator: validateBacklogSpecBinding, value: null },
    { validator: validateBacklogSpecBinding, value: [] },
    { validator: validateBacklogSpecBinding, value: { ...binding, backlogSnapshot: { ...binding.backlogSnapshot, extra: true } } },
    { validator: validateBacklogSpecBinding, value: { ...binding, bindings: [{ ...binding.bindings[0], extra: true }] } },
  ];
  check("BDR03 root and reusable nested records reject every additional key with domain-prefixed findings",
    invalid.every(({ validator, value }) => rejectsWithDomain(validator, value)
      && JSON.stringify(validator(value)) === JSON.stringify(validator(value))));
}

{
  const binding = specBinding();
  const canonicalKeys = "backlogSubtree,commit,indexFileSha256,itemFileSha256,ledgerHead,statusFileSha256,tree";
  const legacyNames = ["subtree", "transitionHead", "indexSha256", "statusSha256", "transitionsSha256"];
  const legacyShapes = legacyNames.map((name) => rebindSpecBinding({
    ...binding,
    backlogSnapshot: { ...binding.backlogSnapshot, [name]: SHA.record },
  }));
  const unsortedItems = rebindSpecBinding({
    ...binding,
    backlogSnapshot: {
      ...binding.backlogSnapshot,
      itemFileSha256: [
        { id: "pipeline.zeta", sha256: SHA.record },
        ...binding.backlogSnapshot.itemFileSha256,
      ],
    },
  });
  const duplicateItems = rebindSpecBinding({
    ...binding,
    backlogSnapshot: {
      ...binding.backlogSnapshot,
      itemFileSha256: [
        ...binding.backlogSnapshot.itemFileSha256,
        { ...binding.backlogSnapshot.itemFileSha256[0] },
      ],
    },
  });
  check("BDR03a Spec binding admits only the §7.2 snapshot shape and sorted unique item digests",
    Object.keys(binding.backlogSnapshot).toSorted().join(",") === canonicalKeys
      && legacyShapes.every((value) => rejectsWithDomain(validateBacklogSpecBinding, value))
      && rejectsWithDomain(validateBacklogSpecBinding, unsortedItems)
      && rejectsWithDomain(validateBacklogSpecBinding, duplicateItems));
}

{
  const intent = initializeIntent();
  const binding = specBinding();
  const longPath = `specs/${"x".repeat(507)}`;
  const tooManyEvidence = Array.from({ length: 65 }, (_, index) => ({
    kind: `evidence-${String(index).padStart(2, "0")}`,
    path: `evidence/${String(index).padStart(2, "0")}.json`,
    fileSha256: SHA.evidence,
    recordSha256: null,
  }));
  const invalid = [
    { validator: validateBacklogDeliveryIntent, value: { ...intent, intentId: "x".repeat(129) } },
    { validator: validateBacklogDeliveryIntent, value: rebindIntent({ ...intent, operation: "reopen" }) },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, item: { ...intent.item, path: longPath } } },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, specification: { ...intent.specification, path: "../spec.md" } } },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, evidence: tooManyEvidence } },
    { validator: validateBacklogDeliveryIntent, value: { ...intent, createdAt: "2026-07-24T12:00:00Z" } },
    { validator: validateBacklogSpecBinding, value: { ...binding, featureId: "x".repeat(129) } },
    {
      validator: validateBacklogSpecBinding,
      value: rebindSpecBinding({
        ...binding,
        bindings: [{ ...binding.bindings[0], closureMode: "presence-means-closed" }],
      }),
    },
    {
      validator: validateBacklogSpecBinding,
      value: rebindSpecBinding({
        ...binding,
        bindings: [{ ...binding.bindings[0], expiryDisposition: "forever" }],
      }),
    },
  ];
  check("BDR04 identifiers, canonical paths, evidence cardinality, and timestamps enforce Spec bounds",
    invalid.every(({ validator, value }) => rejectsWithDomain(validator, value)));
}

{
  const intent = initializeIntent();
  const invalid = [
    rebindIntent({ ...intent, sprint: { name: "Other", increment: "A" } }),
    rebindIntent({ ...intent, sprint: { name: "Nova", increment: "C" } }),
    rebindIntent({ ...intent, sprint: { name: "Nova", increment: "AA" } }),
  ];
  check("BDR04a Nova delivery intent fixes sprint to exactly Nova A or Nova B",
    invalid.every((value) => rejectsWithDomain(validateBacklogDeliveryIntent, value)));
}

{
  const binding = specBinding();
  const second = {
    ...binding.bindings[0],
    id: "pipeline.alpha",
    issue: 7,
    increment: "A",
    acceptanceIds: ["NVA-A7-1"],
  };
  const unsorted = rebindSpecBinding({ ...binding, bindings: [binding.bindings[0], second] });
  const duplicate = rebindSpecBinding({ ...binding, bindings: [binding.bindings[0], { ...binding.bindings[0] }] });
  const unsortedAcceptance = rebindSpecBinding({
    ...binding,
    bindings: [{ ...binding.bindings[0], acceptanceIds: ["NVA-A57-2", "NVA-A57-1"] }],
  });
  const duplicateAcceptance = rebindSpecBinding({
    ...binding,
    bindings: [{ ...binding.bindings[0], acceptanceIds: ["NVA-A57-1", "NVA-A57-1"] }],
  });
  const incrementB = { ...binding.bindings[0], id: "pipeline.alpha", issue: 60, increment: "B", acceptanceIds: ["NVA-B60-1"] };
  const orderedByIncrementThenId = rebindSpecBinding({ ...binding, bindings: [binding.bindings[0], incrementB] });
  const orderedOnlyById = rebindSpecBinding({ ...binding, bindings: [incrementB, binding.bindings[0]] });
  check("BDR05 Spec bindings and acceptance sets are unique and sorted canonically by (increment,id)",
    [unsorted, duplicate, unsortedAcceptance, duplicateAcceptance, orderedOnlyById]
      .every((value) => rejectsWithDomain(validateBacklogSpecBinding, value)));
  check("BDR05a a correctly increment-first binding order remains valid even when ID order differs",
    validates(validateBacklogSpecBinding, orderedByIncrementThenId));
}

{
  const initialize = initializeIntent();
  const close = operationIntent("close");
  const extraEvidence = {
    kind: "accepted-authority", path: "specs/sprint-nova-epic/evidence/backlog/a.json",
    fileSha256: SHA.record, recordSha256: null,
  };
  const unsortedEvidence = rebindIntent({ ...initialize, evidence: [...initialize.evidence, extraEvidence] });
  const duplicateEvidence = rebindIntent({ ...initialize, evidence: [...initialize.evidence, { ...initialize.evidence[0] }] });
  const unsortedGates = rebindIntent({ ...close, gates: [...close.gates].toReversed() });
  const duplicateGates = rebindIntent({ ...close, gates: [...close.gates, { ...close.gates[0] }] });
  const metadataExtra = rebindIntent({
    ...initialize,
    item: { ...initialize.item, draft: { ...initialize.item.draft, metadata: { ...initialize.item.draft.metadata, extra: true } } },
  });
  check("BDR05b gates/evidence are sorted unique and initializer metadata is the closed canonical open dataset",
    [unsortedEvidence, duplicateEvidence, unsortedGates, duplicateGates, metadataExtra]
      .every((value) => rejectsWithDomain(validateBacklogDeliveryIntent, value)));
}

{
  const intent = initializeIntent();
  const binding = specBinding();
  const intentDigestDrift = { ...intent, idempotencyKey: "f".repeat(64) };
  const bindingDigestDrift = { ...binding, recordSha256: "f".repeat(64) };
  const semanticallyReordered = {
    createdAt: intent.createdAt,
    evidence: intent.evidence,
    expected: intent.expected,
    authority: intent.authority,
    gates: intent.gates,
    candidate: intent.candidate,
    specification: intent.specification,
    sprint: intent.sprint,
    item: intent.item,
    operation: intent.operation,
    idempotencyKey: intent.idempotencyKey,
    intentId: intent.intentId,
    schema: intent.schema,
  };
  check("BDR06 semantic recordSha256/idempotencyKey are canonical and key-order independent",
    rejectsWithDomain(validateBacklogDeliveryIntent, intentDigestDrift)
      && rejectsWithDomain(validateBacklogSpecBinding, bindingDigestDrift)
      && validates(validateBacklogDeliveryIntent, semanticallyReordered)
      && binding.recordSha256 === semanticDigest(BACKLOG_SPEC_BINDING_SCHEMA, without(binding, "recordSha256"))
      && intent.idempotencyKey === semanticDigest(BACKLOG_DELIVERY_INTENT_SCHEMA, {
        operation: intent.operation,
        authority: intent.authority,
        expected: intent.expected,
      }));
}

function previewShape(result, intent, from, to) {
  const preview = result?.preview;
  const receiptPath = `backlog/receipts/${intent.idempotencyKey}.json`;
  return result?.ok === true
    && Object.keys(result).toSorted().join(",") === "findings,ok,preview"
    && validationFindings(result).length === 0
    && preview?.schema === BACKLOG_RECONCILIATION_PREVIEW_SCHEMA
    && Object.keys(preview).toSorted().join(",")
      === "authorityRequired,events,intentSha256,postSnapshot,preSnapshot,previewId,previewSha256,reasons,schema,status,targets"
    && preview.status === "preview"
    && preview.intentSha256 === semanticDigest(BACKLOG_DELIVERY_INTENT_SCHEMA, intent)
    && preview.previewSha256
      === semanticDigest(BACKLOG_RECONCILIATION_PREVIEW_SCHEMA, without(preview, "previewSha256"))
    && Array.isArray(preview.events)
    && preview.events.length === 1
    && Object.keys(preview.events[0]).toSorted().join(",")
      === "entryHash,from,id,schema,sequence,to"
    && preview.events[0].schema === "pipeline.backlog-transition.v2"
    && preview.events[0].sequence === 41
    && preview.events[0].from === from
    && preview.events[0].to === to
    && preview.events[0].id === intent.item.id
    && preview.preSnapshot.ledgerHead === intent.expected.ledgerHead
    && preview.preSnapshot.indexFileSha256 === intent.expected.indexFileSha256
    && preview.preSnapshot.statusFileSha256 === intent.expected.statusFileSha256
    && preview.preSnapshot.backlogSubtree === intent.expected.backlogSubtree
    && ["preSnapshot", "postSnapshot"].every((key) =>
      Object.keys(preview[key]).toSorted().join(",")
        === "backlogSubtree,commit,indexFileSha256,itemFileSha256,ledgerHead,statusFileSha256,tree")
    && replacesExactlyOneSnapshotItem(preview.preSnapshot, preview.postSnapshot, intent, from)
    && Array.isArray(preview.reasons)
    && preview.reasons.join("\n") === [...preview.reasons].toSorted().join("\n")
    && Array.isArray(preview.targets)
    && preview.targets.map((target) => target.path).join(",")
      === [
        intent.item.path,
        "backlog/STATUS.md",
        "backlog/index.json",
        "backlog/transitions.ndjson",
      ].toSorted().join(",")
    && preview.targets.every((target) => Object.keys(target).toSorted().join(",") === "path,postSha256,preSha256"
      && /^[a-f0-9]{64}$/u.test(target.preSha256)
      && /^[a-f0-9]{64}$/u.test(target.postSha256))
    && preview.targets.find((target) => target.path === intent.item.path)?.preSha256
      === (from === null ? SHA_EMPTY : intent.item.expectedFileSha256)
    && !preview.targets.some((target) => target.path === receiptPath)
    && !Object.hasOwn(result, "wrote")
    && !Object.hasOwn(result, "receipt");
}

{
  const intent = initializeIntent();
  const state = stateFor(intent);
  const beforeIntent = canonicalJson(intent);
  const beforeState = canonicalJson(state);
  const result = plan(intent, state);
  check("BDR07 initialize previews only null-to-open from reviewed canonical item intake",
    previewShape(result, intent, null, "open")
      && canonicalJson(intent) === beforeIntent
      && canonicalJson(state) === beforeState);
  const noDraft = rebindIntent({ ...intent, item: { ...intent.item, draft: null } });
  const closedDraft = rebindIntent({
    ...intent,
    item: {
      ...intent.item,
      draft: {
        ...intent.item.draft,
        metadata: { ...intent.item.draft.metadata, status: "closed" },
      },
    },
  });
  const invalidResults = [
    plan(noDraft),
    plan(closedDraft),
    plan(intent, stateFor(intent, {
      occupiedIds: [intent.item.id],
      occupiedPaths: [],
    })),
    plan(intent, stateFor(intent, {
      occupiedIds: [],
      occupiedPaths: [intent.item.path],
    })),
  ];
  check("BDR08 initialize rejects absent review material, non-open draft, and ID/path collision",
    invalidResults.every(rejectedPlan)
      && invalidResults.slice(2).every((entry) =>
        validationFindings(entry).some((finding) => finding.startsWith("CONFLICT:"))));
}

{
  const intent = operationIntent("assign");
  const result = plan(intent);
  const wrongStatus = rebindIntent({ ...intent, item: { ...intent.item, expectedStatus: "in_progress" } });
  const wrongAuthority = rebindIntent({ ...intent, authority: authority("closure") });
  const unapprovedSpec = rebindIntent({
    ...intent,
    specification: { ...intent.specification, approvalReceiptSha256: null },
  });
  check("BDR09 assign previews only open-to-in_progress with accepted Spec and activation authority",
    previewShape(result, intent, "open", "in_progress")
      && [plan(wrongStatus), plan(wrongAuthority), plan(unapprovedSpec)].every(rejectedPlan));
}

{
  const intent = operationIntent("close");
  const result = plan(intent);
  const noCandidate = rebindIntent({ ...intent, candidate: null });
  const incompleteAcceptance = rebindIntent({ ...intent, gates: intent.gates.slice(1) });
  const failedGate = rebindIntent({
    ...intent,
    gates: intent.gates.map((gate, index) => index === 0 ? { ...gate, status: "failed" } : gate),
  });
  const wrongAuthority = rebindIntent({ ...intent, authority: authority("implementation-activation") });
  check("BDR10 close previews only in_progress-to-closed with candidate, complete acceptance, passed gates, and closure authority",
    previewShape(result, intent, "in_progress", "closed")
      && [plan(noCandidate), plan(incompleteAcceptance), plan(failedGate), plan(wrongAuthority)]
        .every(rejectedPlan));
}

{
  const intent = operationIntent("amend-evidence");
  const state = stateFor(intent);
  const result = plan(intent, state);
  const wrongAuthority = rebindIntent({ ...intent, authority: authority("closure") });
  const wrongTarget = stateFor(intent, {
    amendmentTarget: { ...state.amendmentTarget, entryHash: "f".repeat(64) },
  });
  const changedStatus = stateFor(intent, {
    item: { ...state.item, status: "in_progress" },
  });
  check("BDR11 amend-evidence preserves status and requires exact target plus repair authority",
    previewShape(result, intent, "closed", "closed")
      && [plan(wrongAuthority), plan(intent, wrongTarget), plan(intent, changedStatus)]
        .every(rejectedPlan));
}

{
  const intent = operationIntent("assign");
  const fields = [
    ["ledgerHead", "f".repeat(64)],
    ["indexFileSha256", "f".repeat(64)],
    ["statusFileSha256", "f".repeat(64)],
    ["backlogSubtree", "f".repeat(64)],
  ];
  const results = fields.map(([field, value]) => plan(intent, stateFor(intent, { [field]: value })));
  check("BDR12 planner requires exact ledger/index/STATUS/subtree CAS",
    results.every((result) => rejectedPlan(result)
      && validationFindings(result).some((finding) => finding.startsWith("CAS:"))));
}

{
  const intent = operationIntent("assign");
  const staleBinding = rebindSpecBinding({
    ...specBinding(),
    specification: bindingSpecification({ sha256: "f".repeat(64) }),
  });
  const conflictingReplay = stateFor(intent, {
    receipts: [{
      idempotencyKey: intent.idempotencyKey,
      intentSha256: "f".repeat(64),
      receiptPath: `backlog/receipts/${intent.idempotencyKey}.json`,
    }],
  });
  const foreignWriter = stateFor(intent, {
    repository: "project:other",
    writerAuthority: "runner-local-backlog-writer",
  });
  const outcomes = [
    plan(intent, stateFor(intent), staleBinding),
    plan(intent, conflictingReplay),
    plan(intent, foreignWriter),
  ];
  check("BDR13 stale binding, replay conflict, and noncanonical writer authority reject deterministically",
    outcomes.every(rejectedPlan)
      && outcomes[0].findings.some((finding) => finding.startsWith("STALE:"))
      && outcomes[1].findings.some((finding) => /^(?:REPLAY|CONFLICT):/u.test(finding))
      && outcomes[2].findings.some((finding) => finding.startsWith("AUTHORITY:")));
}

{
  const foreignBinding = rebindSpecBinding({
    ...specBinding(),
    bindings: [{
      ...specBinding().bindings[0], id: "pipeline.other", issue: 8, acceptanceIds: ["NVA-A8-1"],
    }],
  });
  const assign = plan(operationIntent("assign"), stateFor(operationIntent("assign")), foreignBinding);
  const close = plan(operationIntent("close"), stateFor(operationIntent("close")), foreignBinding);
  check("BDR13a assign and close reject an item with no matching Spec-binding row",
    [assign, close].every(rejectedPlan)
      && [assign, close].every((result) => result.findings.some((finding) => /^(?:BOUND|STALE):/u.test(finding))));
}

{
  const result = plan(operationIntent("close"));
  const receiptPath = `backlog/receipts/${operationIntent("close").idempotencyKey}.json`;
  check("BDR14 preview target set is canonical, receipt-self-excluding, and retains singular repository writer authority",
    result.ok
      && result.preview.authorityRequired.repository === "self"
      && result.preview.authorityRequired.writer === "canonical-backlog-single-writer"
      && result.preview.targets.every((target) =>
        Object.keys(target).toSorted().join(",") === "path,postSha256,preSha256")
      && !result.preview.targets.some((target) => target.path === receiptPath));
}

function resolveSchema(root, reference) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) return null;
  return reference.slice(2).split("/").reduce((value, key) => value?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], root);
}

function schemaAccepts(schema, value, root = schema) {
  if (schema?.$ref) return schemaAccepts(resolveSchema(root, schema.$ref), value, root);
  if (Array.isArray(schema?.allOf) && !schema.allOf.every((entry) => schemaAccepts(entry, value, root))) return false;
  if (Array.isArray(schema?.anyOf) && !schema.anyOf.some((entry) => schemaAccepts(entry, value, root))) return false;
  if (Array.isArray(schema?.oneOf) && schema.oneOf.filter((entry) => schemaAccepts(entry, value, root)).length !== 1) return false;
  if (Object.hasOwn(schema ?? {}, "const") && value !== schema.const) return false;
  if (Array.isArray(schema?.enum) && !schema.enum.includes(value)) return false;
  const types = schema?.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const matchesType = (type) => ({ object: value !== null && typeof value === "object" && !Array.isArray(value), array: Array.isArray(value), string: typeof value === "string", integer: Number.isInteger(value), number: typeof value === "number", boolean: typeof value === "boolean", null: value === null })[type] === true;
  if (types.length > 0 && !types.some(matchesType)) return false;
  if (typeof value === "string" && schema?.pattern && !(new RegExp(schema.pattern, "u")).test(value)) return false;
  if (Array.isArray(value)) {
    if ((schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)) return false;
    return !schema.items || value.every((entry) => schemaAccepts(schema.items, entry, root));
  }
  if (value !== null && typeof value === "object") {
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (!required.every((key) => Object.hasOwn(value, key))) return false;
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
    return Object.entries(value).every(([key, entry]) => !Object.hasOwn(properties, key) || schemaAccepts(properties[key], entry, root));
  }
  return true;
}

function noOpenObjectPlaceholder(schema, root = schema, visited = new Set()) {
  if (!schema || typeof schema !== "object") return true;
  if (schema.$ref) {
    const resolved = resolveSchema(root, schema.$ref);
    if (!resolved || visited.has(resolved)) return Boolean(resolved);
    visited.add(resolved);
    return noOpenObjectPlaceholder(resolved, root, visited);
  }
  for (const keyword of ["allOf", "anyOf", "oneOf"]) if (Array.isArray(schema[keyword]) && !schema[keyword].every((entry) => noOpenObjectPlaceholder(entry, root, new Set(visited)))) return false;
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("object")) {
    if (schema.additionalProperties !== false || !schema.properties || !Array.isArray(schema.required)) return false;
    const propertyKeys = Object.keys(schema.properties).toSorted();
    if (propertyKeys.join(",") !== [...schema.required].toSorted().join(",")) return false;
    if (!Object.values(schema.properties).every((entry) => noOpenObjectPlaceholder(entry, root, new Set(visited)))) return false;
  }
  if (schema.items && !noOpenObjectPlaceholder(schema.items, root, new Set(visited))) return false;
  return true;
}

{
  const contracts = [
    ["backlog-delivery-intent.schema.json", BACKLOG_DELIVERY_INTENT_SCHEMA, ["schema", "intentId", "idempotencyKey", "operation", "item", "sprint", "specification", "candidate", "gates", "authority", "expected", "evidence", "createdAt"]],
    ["backlog-spec-binding.schema.json", BACKLOG_SPEC_BINDING_SCHEMA, ["schema", "featureId", "specification", "backlogSnapshot", "bindings", "recordSha256"]],
    ["backlog-reconciliation-preview.schema.json", BACKLOG_RECONCILIATION_PREVIEW_SCHEMA, ["schema", "previewId", "intentSha256", "status", "reasons", "preSnapshot", "postSnapshot", "targets", "events", "authorityRequired", "previewSha256"]],
    ["backlog-reconciliation-receipt.schema.json", BACKLOG_RECONCILIATION_RECEIPT_SCHEMA, ["schema", "receiptId", "intentId", "idempotencyKey", "intentSha256", "status", "preSnapshot", "postSnapshot", "targets", "eventSequences", "appliedAt", "recordSha256"]],
  ].map(([file, id, required]) => ({ file, id, required, value: JSON.parse(readFileSync(new URL(`../scripts/${file}`, import.meta.url), "utf8")) }));
  const intent = initializeIntent();
  const metadataExtra = rebindIntent({ ...intent, item: { ...intent.item, draft: { ...intent.item.draft, metadata: { ...intent.item.draft.metadata, extra: true } } } });
  const binding = specBinding();
  const legacySnapshot = rebindSpecBinding({ ...binding, backlogSnapshot: { ...binding.backlogSnapshot, subtree: SHA.subtree } });
  const preview = plan(intent, stateFor(intent)).preview;
  const receipt = {
    schema: BACKLOG_RECONCILIATION_RECEIPT_SCHEMA, receiptId: SHA.record, intentId: intent.intentId, idempotencyKey: intent.idempotencyKey,
    intentSha256: SHA.evidence, status: "applied", preSnapshot: preview?.preSnapshot, postSnapshot: preview?.postSnapshot,
    targets: preview?.targets, eventSequences: [41], appliedAt: "2026-07-24T12:00:00.000Z", recordSha256: SHA.authority,
  };
  const byId = Object.fromEntries(contracts.map((entry) => [entry.id, entry.value]));
  check("BDR15 all four A1 JSON Schemas close every §7.2 object shape and agree with core runtime fixtures",
    contracts.every(({ id, required, value }) => value.$id === id
      && value.additionalProperties === false
      && Object.keys(value.properties ?? {}).toSorted().join(",") === [...required].toSorted().join(",")
      && [...(value.required ?? [])].toSorted().join(",") === [...required].toSorted().join(",")
      && noOpenObjectPlaceholder(value))
      && schemaAccepts(byId[BACKLOG_DELIVERY_INTENT_SCHEMA], intent)
      && !schemaAccepts(byId[BACKLOG_DELIVERY_INTENT_SCHEMA], metadataExtra)
      && validates(validateBacklogDeliveryIntent, intent)
      && !validates(validateBacklogDeliveryIntent, metadataExtra)
      && schemaAccepts(byId[BACKLOG_SPEC_BINDING_SCHEMA], binding)
      && !schemaAccepts(byId[BACKLOG_SPEC_BINDING_SCHEMA], legacySnapshot)
      && validates(validateBacklogSpecBinding, binding)
      && !validates(validateBacklogSpecBinding, legacySnapshot)
      && schemaAccepts(byId[BACKLOG_RECONCILIATION_PREVIEW_SCHEMA], preview)
      && !schemaAccepts(byId[BACKLOG_RECONCILIATION_PREVIEW_SCHEMA], { ...preview, preSnapshot: { ...preview?.preSnapshot, extra: true } })
      && schemaAccepts(byId[BACKLOG_RECONCILIATION_RECEIPT_SCHEMA], receipt)
      && !schemaAccepts(byId[BACKLOG_RECONCILIATION_RECEIPT_SCHEMA], { ...receipt, postSnapshot: { ...receipt.postSnapshot, extra: true } }));
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
