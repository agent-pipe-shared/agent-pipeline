#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import {
  EVIDENCE_AMENDMENT_SCHEMA,
  ITEM_SCHEMA,
  PROJECT_CLOSURE_READBACK_SCHEMA,
  TRANSITION_SCHEMA,
  TRANSITION_V2_SCHEMA,
  canonicalJson,
  parseBacklogItem,
  parseTransitionLedger,
  planBacklogEvidenceAmendment,
  planBacklogTransition,
  planElephantAfkLedgerRepair,
  projectBacklog,
  renderBacklogItem,
  transitionHash,
  validateBacklogEvidenceAmendment,
  validateBacklogItem,
  validateProjectClosureReadback,
  validateSentinelRecoveryCatalog,
  validateTransitionLedger,
} from "./backlog-state.mjs";
import {
  applyBacklogEvidenceAmendment,
  applyBacklogTransition,
  applyElephantAfkLedgerRepair,
  applySentinelBacklogRecovery,
  applySentinelScopeExtension,
  checkBacklogState,
  loadBacklogState,
  planSentinelBacklogRecovery,
  planSentinelScopeExtension,
  recoverBacklogTransaction,
  writeBacklogProjections,
} from "../scripts/check-backlog-state.mjs";

let passed = 0;
let failed = 0;
const roots = [];
const DISPOSITION_BYTES = Buffer.from('{"decision":"approved","kind":"backlog-evidence-repair"}\n', "utf8");
const DISPOSITION_SHA256 = createHash("sha256").update(DISPOSITION_BYTES).digest("hex");
const AUTHORITY_VALID = Object.freeze({ ok: true, code: "AUTHORITY:VALID" });
const AUTHORIZE_AMENDMENT = () => AUTHORITY_VALID;
const V2_DOMAIN_PREFIX = /^(?:SHAPE|SCHEMA|BOUND|AUTHORITY|CAS|STALE|REPLAY|CONFLICT|UNAVAILABLE|DURABILITY|READBACK|INTERNAL):/u;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}
function write(root, path, content) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}
function event(overrides = {}) {
  const value = {
    schema: TRANSITION_SCHEMA,
    sequence: 1,
    id: "pipeline.example",
    from: null,
    to: "open",
    at: "2026-07-17",
    actor: "storm-migration",
    reason: "Adopt canonical tracking.",
    evidence: { kind: "baseline-migration", commit: "a".repeat(40) },
    previousHash: null,
    entryHash: "",
    ...overrides,
  };
  value.entryHash = transitionHash(value);
  return value;
}
function v2OperationEvent(overrides = {}) {
  const value = {
    schema: TRANSITION_V2_SCHEMA,
    sequence: 1,
    id: "pipeline.example",
    from: null,
    to: "open",
    at: "2026-07-24",
    actor: "nova-reconciliation",
    reason: "Apply an authorized canonical backlog transition.",
    evidence: {
      kind: "nova-reconciliation",
      commit: "a".repeat(40),
      reference: "specs/sprint-nova-epic/evidence/backlog/reconciliation.json",
    },
    previousHash: null,
    entryHash: "",
    ...overrides,
  };
  value.entryHash = transitionHash(value);
  return value;
}
function v2AmendmentEvent({ sequence, id, status, target, replacementCommit, previousHash, idempotencyKey, reference }) {
  const value = {
    schema: TRANSITION_V2_SCHEMA,
    sequence,
    id,
    from: status,
    to: status,
    at: "2026-07-24",
    actor: "nova-evidence-repair",
    reason: "Bind reachable replacement evidence without changing backlog status.",
    evidence: {
      schema: EVIDENCE_AMENDMENT_SCHEMA,
      kind: "evidence-amendment",
      targetSequence: target.sequence,
      targetEntryHash: target.entryHash,
      targetCommit: target.evidence.commit,
      replacementCommit,
      reference,
      dispositionSha256: DISPOSITION_SHA256,
      idempotencyKey,
    },
    previousHash,
    entryHash: "",
  };
  value.entryHash = transitionHash(value);
  return value;
}
function mixedTransitionFixture() {
  const event39Commit = "726b83681abc1b6366333c70a6a401b88016e5d4";
  const event40Commit = "2ddf3592ea004bd6e2a830a61bb02c931238070f";
  const progressCommit = "1".repeat(40);
  const priorClosureCommit = "2".repeat(40);
  const event39Replacement = "3".repeat(40);
  const event40Replacement = "4".repeat(40);
  const afk = item({
    id: AFK_REPAIR_ID,
    status: "in_progress",
    created: "2026-07-23",
    type: "workflow-improvement",
    source: AFK_REPAIR_SOURCE,
  });
  afk.path = "backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md";
  const licensing = item({
    id: "pipeline.source-available-commercial-licensing",
    status: "closed",
    closed_at: "2026-07-23",
    closure_repository: "self",
    closure_commit: event40Replacement,
    closure_evidence: "specs/sprint-nova-epic/evidence/backlog/event-40-amendment-intent.json",
  });
  licensing.path = "backlog/items/source-available-commercial-licensing.md";
  const event39 = event({
    id: AFK_REPAIR_ID,
    at: "2026-07-23",
    actor: "sentinel-recovery",
    reason: "Repair the single missing initial ledger event for the existing open AFK-authorization process item; no status change or completion is claimed.",
    evidence: {
      kind: "missing-initial-ledger-repair",
      commit: event39Commit,
      reference: afk.path,
      sourceSha256: createHash("sha256").update(AFK_REPAIR_SOURCE).digest("hex"),
    },
  });
  const inProgress = event({
    sequence: 2,
    id: AFK_REPAIR_ID,
    from: "open",
    to: "in_progress",
    at: "2026-07-24",
    actor: "nova-activation",
    reason: "Activate the accepted Nova work package.",
    evidence: { kind: "nova-activation", commit: progressCommit, reference: "specs/sprint-nova-epic/plans/nova-a.md" },
    previousHash: event39.entryHash,
  });
  const initialClosure = event({
    sequence: 3,
    id: licensing.metadata.id,
    from: null,
    to: "closed",
    at: "2026-07-23",
    actor: "sentinel-licensing",
    reason: "Record the accepted licensing result.",
    evidence: { kind: "implementation", commit: priorClosureCommit, reference: "specs/initial-result.md" },
    previousHash: inProgress.entryHash,
  });
  const event40 = event({
    sequence: 4,
    id: licensing.metadata.id,
    from: "closed",
    to: "closed",
    at: "2026-07-23",
    actor: "sentinel-licensing",
    reason: "Bind the approved candidate-specific SNT-1 Result and the private/public license-gate projections without rewriting historical closure evidence.",
    evidence: {
      kind: "evidence-amendment",
      resultSha256: "5".repeat(64),
      privateLicenseGateSha256: "6".repeat(64),
      neutralPublicLicenseGateSha256: "7".repeat(64),
      commit: event40Commit,
      reference: "backlog/evidence/2026-07-23-snt-1-activation-result.json",
      previousClosureCommit: priorClosureCommit,
    },
    previousHash: initialClosure.entryHash,
  });
  const amend39 = v2AmendmentEvent({
    sequence: 5,
    id: AFK_REPAIR_ID,
    status: "in_progress",
    target: event39,
    replacementCommit: event39Replacement,
    previousHash: event40.entryHash,
    idempotencyKey: "8".repeat(64),
    reference: "specs/sprint-nova-epic/evidence/backlog/event-39-amendment-intent.json",
  });
  const amend40 = v2AmendmentEvent({
    sequence: 6,
    id: licensing.metadata.id,
    status: "closed",
    target: event40,
    replacementCommit: event40Replacement,
    previousHash: amend39.entryHash,
    idempotencyKey: "9".repeat(64),
    reference: "specs/sprint-nova-epic/evidence/backlog/event-40-amendment-intent.json",
  });
  return {
    items: [afk, licensing],
    events: [event39, inProgress, initialClosure, event40, amend39, amend40],
    reachable: new Set([progressCommit, priorClosureCommit, event39Replacement, event40Replacement]),
    commits: { event39Commit, event40Commit, event39Replacement, event40Replacement },
  };
}
function v2CheckerFixture() {
  const root = fixtureRoot();
  const fixture = mixedTransitionFixture();
  write(root, "backlog/schemas/transition-v2.schema.json", `${JSON.stringify({ $id: TRANSITION_V2_SCHEMA })}\n`);
  for (const record of fixture.items) write(root, record.path, renderBacklogItem(record));
  write(root, "backlog/transitions.ndjson", `${fixture.events.map((entry) => canonicalJson(entry)).join("\n")}\n`);
  for (const amendment of fixture.events.filter((entry) => entry.schema === TRANSITION_V2_SCHEMA)) {
    write(root, amendment.evidence.reference, DISPOSITION_BYTES);
  }
  const projection = projectBacklog(fixture.items, fixture.events);
  write(root, "backlog/STATUS.md", projection.statusText);
  write(root, "backlog/index.json", projection.indexText);
  return { root, fixture };
}
function rechain(events) {
  let previousHash = null;
  return events.map((source, index) => {
    const value = structuredClone(source);
    value.sequence = index + 1;
    value.previousHash = previousHash;
    value.entryHash = transitionHash(value);
    previousHash = value.entryHash;
    return value;
  });
}
function item(overrides = {}) {
  return {
    path: "backlog/items/example.md",
    metadata: {
      schema: ITEM_SCHEMA,
      id: "pipeline.example",
      type: "defect",
      owner: "pipeline",
      status: "open",
      created: "2026-07-17",
      source: "test fixture",
      tracking: "ready",
      ...overrides,
    },
    body: "\n# Example\n",
  };
}
function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "backlog-state-"));
  roots.push(root);
  write(root, "backlog/schemas/item.schema.json", JSON.stringify({ $id: "pipeline.backlog-item.v1" }));
  write(root, "backlog/schemas/transition.schema.json", JSON.stringify({ $id: "pipeline.backlog-transition.v1" }));
  write(root, "backlog/schemas/index.schema.json", JSON.stringify({ $id: "pipeline.backlog-index.v1" }));
  return root;
}
function snt1Result() {
  const surfaces = ["LICENSE", "LICENSE-DOCS", "NOTICE", "CONTRIBUTING.md", "README.md", "docs/licensing.md", "third-party-licenses.json"].map((path, index) => ({ path, sha256: String(index + 1).repeat(64) }));
  const surfaceSetSha256 = createHash("sha256").update(canonicalJson(surfaces)).digest("hex");
  const candidates = { private: { commit: "1".repeat(40), tree: "2".repeat(40) }, "neutral-public": { commit: "3".repeat(40), tree: "4".repeat(40) } };
  const projection = (channel) => {
    const value = { schema: "pipeline.snt1-license-gate-projection.v1", channel, candidate: candidates[channel], surfaceSetSha256, commandSha256: "5".repeat(64), gateCommitmentSha256: "6".repeat(64), result: { status: "passed", exitCode: 0 } };
    return { ...value, projectionSha256: createHash("sha256").update(canonicalJson(value)).digest("hex") };
  };
  const disposition = { reviewer: "named-human", reviewedAt: "2026-07-23", status: "approved", dispositionSha256: "7".repeat(64) };
  const payload = { schema: "pipeline.snt1-result.v1", licensingDisposition: disposition, privacyDisposition: { ...disposition, dispositionSha256: "8".repeat(64) }, candidates, gates: { private: projection("private"), "neutral-public": projection("neutral-public") }, surfaces };
  return { ...payload, resultSha256: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}
function sentinelCatalog(overrides = {}) {
  return {
    schema: "pipeline.sentinel-backlog-recovery.v1",
    source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md",
    recoveredAt: "2026-07-19",
    items: [
      ["afk-assumption-mode", "open", "workflow-improvement"],
      ["canonical-worktree-lifecycle", "open", "defect"],
      ["codex-plugin-validator-host-parity", "open", "workflow-improvement"],
      ["codex-sandbox-critic-longterm", "open", "defect"],
      ["documentation-information-architecture", "open", "workflow-improvement"],
      ["dual-channel-publication", "open", "workflow-improvement"],
      ["execution-model-switchback", "open", "workflow-improvement"],
      ["nonblocking-interaction-continuity", "open", "defect"],
      ["po-gate-worktree-authority", "open", "defect"],
      ["push-guard-worktree-target", "in_progress", "defect"],
      ["regulated-document-hooks", "open", "workflow-improvement"],
      ["session-keep-awake", "open", "workflow-improvement"],
      ["stateful-design-contract-template", "open", "workflow-improvement"],
      ["t1-governance-path-preflight", "open", "workflow-improvement"],
      ["verify-gate-scoped-registration", "open", "workflow-improvement"],
    ].map(([id, status, type]) => ({ id: `pipeline.${id}`, status, type })),
    ...overrides,
  };
}
function recoveryFixture(catalog = sentinelCatalog()) {
  const root = fixtureRoot();
  const open = item();
  const initial = event();
  write(root, "backlog/items/example.md", renderBacklogItem(open));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(initial)}\n`);
  write(root, "backlog/schemas/sentinel-recovery.schema.json", JSON.stringify({ $id: "pipeline.sentinel-backlog-recovery.v1" }));
  write(root, "backlog/sentinel-recovery-catalog.json", `${JSON.stringify(catalog)}\n`);
  writeBacklogProjections(root, { checkCommit: false });
  return root;
}
const AFK_REPAIR_ID = "pipeline.elephant-direct-implementation-under-afk-authorization";
const AFK_REPAIR_SOURCE = "close-block ritual step 6b authorship check, native-Windows Verify block (see HISTORY.md 2026-07-23 entry, docs/state.md close-ritual authorship-check incident bullet)";
function afkRepairFixture() {
  const root = fixtureRoot();
  const other = item();
  const initial = event();
  write(root, "backlog/items/example.md", renderBacklogItem(other));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(initial)}\n`);
  writeBacklogProjections(root, { checkCommit: false });
  const missing = item({ id: AFK_REPAIR_ID, source: AFK_REPAIR_SOURCE, status: "open", created: "2026-07-23", type: "workflow-improvement" });
  missing.path = "backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md";
  write(root, missing.path, renderBacklogItem(missing));
  return root;
}
function afkRepairInput(overrides = {}) {
  return { id: AFK_REPAIR_ID, at: "2026-07-23", actor: "sentinel-recovery", evidenceCommit: "a".repeat(40), source: AFK_REPAIR_SOURCE, ...overrides };
}

{
  const source = renderBacklogItem(item({ source: "A source: with punctuation" }));
  const parsed = parseBacklogItem(source, { path: "fixture.md" });
  check("BS01 canonical parser and writer preserve valid scalar frontmatter", parsed.ok
    && parsed.item.metadata.id === "pipeline.example"
    && renderBacklogItem(parsed.item) === source, parsed.errors.join("; "));
}
{
  const invalid = item({ status: "deferred" });
  const closureLeak = item({ closure_commit: "a".repeat(40) });
  check("BS02 only canonical statuses are accepted and closure data cannot leak onto open work",
    validateBacklogItem(invalid).some((error) => error.includes("status must be open"))
      && validateBacklogItem(closureLeak).some((error) => error.includes("only closed items")));
}
{
  const first = event();
  const second = event({
    sequence: 2,
    from: "open",
    to: "in_progress",
    previousHash: first.entryHash,
    reason: "Execution started.",
  });
  const itemInProgress = item({ status: "in_progress" });
  const valid = validateTransitionLedger([first, second], [itemInProgress]);
  const tampered = structuredClone(second);
  tampered.reason = "Rewritten history.";
  const invalid = validateTransitionLedger([first, tampered], [itemInProgress]);
  check("BS03 transition ledger is ordered, item-bound, and hash chained", valid.length === 0
    && invalid.some((error) => error.includes("entryHash does not match")), `${valid.join("; ")} / ${invalid.join("; ")}`);
}
{
  const closed = item({
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "self",
    closure_commit: "b".repeat(40),
    closure_evidence: "specs/result.md",
  });
  const closeEvent = event({
    to: "closed",
    evidence: { kind: "implementation", commit: "b".repeat(40), reference: "specs/result.md" },
    reason: "Delivered with local evidence.",
  });
  const mismatch = structuredClone(closeEvent);
  mismatch.evidence.commit = "c".repeat(40);
  mismatch.entryHash = transitionHash(mismatch);
  check("BS04 closed items require a three-part closure record tied to final ledger commit",
    validateBacklogItem(closed).length === 0
      && validateTransitionLedger([closeEvent], [closed]).length === 0
      && validateTransitionLedger([mismatch], [closed]).some((error) => error.includes("closure_commit must equal"))
      && validateBacklogItem(item({
        status: "closed", closed_at: "2026-07-17", closure_repository: "project:example-app",
        closure_commit: "b".repeat(40), closure_evidence: "specs/result.md",
      })).some((error) => error.includes("requires closure_readback")));
}
{
  const first = event();
  const items = [item({ id: "pipeline.zeta" }), item({ id: "pipeline.alpha", type: "idea", status: "closed", closed_at: "2026-07-17", closure_repository: "self", closure_commit: "d".repeat(40), closure_evidence: "specs/result.md" })];
  const close = event({ id: "pipeline.alpha", to: "closed", evidence: { kind: "implementation", commit: "d".repeat(40) }, reason: "Closed." });
  const open = event({ id: "pipeline.zeta", evidence: { kind: "baseline-migration", commit: "a".repeat(40) }, reason: "Opened.", sequence: 2, previousHash: close.entryHash });
  const projection = projectBacklog(items, [close, open]);
  check("BS05 projections are sorted and count every canonical status deterministically",
    projection.index.items.map((entry) => entry.id).join(",") === "pipeline.alpha,pipeline.zeta"
      && projection.index.counts.open === 1
      && projection.index.counts.in_progress === 0
      && projection.index.counts.closed === 1
      && projection.statusText.includes("| pipeline.alpha | closed |"));
}
{
  const root = fixtureRoot();
  const closed = item({
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "self",
    closure_commit: "b".repeat(40),
    closure_evidence: "specs/result.md",
  });
  const close = event({
    to: "closed",
    evidence: { kind: "implementation", commit: "b".repeat(40), reference: "specs/result.md" },
    reason: "Delivered with local evidence.",
  });
  write(root, "backlog/items/example.md", renderBacklogItem(closed));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(close)}\n`);
  write(root, "specs/result.md", "# Result\n");
  const written = writeBacklogProjections(root, { checkCommit: false });
  const valid = checkBacklogState(root, { checkCommit: false });
  write(root, "backlog/STATUS.md", "stale\n");
  const drift = checkBacklogState(root, { checkCommit: false });
  check("BS06 checker validates closure path and rejects generated projection drift",
    written.ok && written.wrote && valid.ok
      && drift.findings.some((finding) => finding.includes("STATUS.md projection drift"))
      && readFileSync(join(root, "backlog/index.json"), "utf8").includes("pipeline.backlog-index.v1"), drift.findings.join("; "));
}

{
  const root = afkRepairFixture();
  const ledgerBefore = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const itemBefore = readFileSync(join(root, "backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md"), "utf8");
  const current = checkBacklogState(root, { checkCommit: false });
  const preview = planElephantAfkLedgerRepair(current.items, current.events, afkRepairInput());
  const applied = applyElephantAfkLedgerRepair(root, afkRepairInput(), { checkCommit: false });
  const ledgerAfter = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const valid = checkBacklogState(root, { checkCommit: false });
  const snapshot = ["backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md", "backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"].map((path) => readFileSync(join(root, path), "utf8"));
  const replay = applyElephantAfkLedgerRepair(root, afkRepairInput(), { checkCommit: false });
  const replaySnapshot = ["backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md", "backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"].map((path) => readFileSync(join(root, path), "utf8"));
  check("BS15 exact AFK missing-event repair preserves the ledger prefix, item source, and open status",
    current.findings.length === 1 && preview.ok && applied.ok && applied.wrote && ledgerAfter.startsWith(ledgerBefore)
      && readFileSync(join(root, "backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md"), "utf8") === itemBefore
      && applied.transition.from === null && applied.transition.to === "open" && applied.transition.evidence.sourceSha256 === createHash("sha256").update(AFK_REPAIR_SOURCE).digest("hex")
      && valid.ok && !replay.ok && JSON.stringify(snapshot) === JSON.stringify(replaySnapshot), [...preview.errors, ...applied.findings, ...valid.findings, ...replay.findings].join("; "));
}

{
  const root = afkRepairFixture();
  write(root, "backlog/items/additional-missing.md", renderBacklogItem(item({ id: "pipeline.additional-missing" })));
  const before = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const rejected = applyElephantAfkLedgerRepair(root, afkRepairInput(), { checkCommit: false });
  const state = checkBacklogState(root, { checkCommit: false });
  const wrong = planElephantAfkLedgerRepair(state.items, state.events, afkRepairInput({ id: "pipeline.other" }));
  check("BS16 AFK repair rejects another target or any additional finding with zero mutation", !rejected.ok && !wrong.ok && readFileSync(join(root, "backlog/transitions.ndjson"), "utf8") === before);
}

{
  const root = afkRepairFixture();
  const paths = ["backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md", "backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"];
  const before = paths.map((path) => readFileSync(join(root, path), "utf8"));
  let writes = 0;
  const interrupted = applyElephantAfkLedgerRepair(root, afkRepairInput(), { checkCommit: false, atomicWrite(path, content) { writeFileSync(path, content); if (++writes === 2) throw new Error("simulated interruption"); } });
  const after = paths.map((path) => readFileSync(join(root, path), "utf8"));
  check("BS17 AFK repair interruption restores all four preimages", !interrupted.ok && JSON.stringify(before) === JSON.stringify(after) && !existsSync(join(root, "backlog/.state-transaction.json")), interrupted.findings.join("; "));
}

{
  const root = fixtureRoot();
  const oldCommit = "b".repeat(40);
  const newCommit = "c".repeat(40);
  const resultRecord = snt1Result();
  const closed = item({ id: "pipeline.source-available-commercial-licensing", status: "closed", closed_at: "2026-07-17", closure_repository: "self", closure_commit: oldCommit, closure_evidence: "specs/old-result.md" });
  const historical = event({ id: "pipeline.source-available-commercial-licensing", to: "closed", evidence: { kind: "implementation", commit: oldCommit, reference: "specs/old-result.md" }, reason: "Historical close." });
  const unrelated = item({ id: "pipeline.unrelated" });
  const unrelatedEvent = event({ id: "pipeline.unrelated", sequence: 2, previousHash: historical.entryHash });
  write(root, "backlog/items/example.md", renderBacklogItem(closed));
  write(root, "backlog/items/unrelated.md", renderBacklogItem(unrelated));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(historical)}\n${canonicalJson(unrelatedEvent)}\n`);
  write(root, "specs/old-result.md", "# Old result\n");
  write(root, "specs/current-result.md", `${JSON.stringify(resultRecord)}\n`);
  writeBacklogProjections(root, { checkCommit: false });
  const ledgerBefore = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const itemBodyBefore = closed.body;
  const unrelatedBefore = readFileSync(join(root, "backlog/items/unrelated.md"), "utf8");
  const input = {
    id: "pipeline.source-available-commercial-licensing", at: "2026-07-23", actor: "sentinel-evidence", reason: "Bind current SNT-1 candidate evidence.",
    evidence: { kind: "evidence-amendment", commit: newCommit, reference: "specs/current-result.md", resultSha256: resultRecord.resultSha256, privateLicenseGateSha256: resultRecord.gates.private.projectionSha256, neutralPublicLicenseGateSha256: resultRecord.gates["neutral-public"].projectionSha256 },
    closure: { repository: "self", commit: newCommit, evidence: "specs/current-result.md" },
  };
  const preview = planBacklogEvidenceAmendment([closed, unrelated], [historical, unrelatedEvent], input);
  const generic = planBacklogTransition([closed, unrelated], [historical, unrelatedEvent], { ...input, to: "closed" });
  write(root, "specs/current-result.md", `${JSON.stringify({ ...resultRecord, resultSha256: "0".repeat(64) })}\n`);
  const mismatchedEvidence = applyBacklogEvidenceAmendment(root, input, { checkCommit: false });
  write(root, "specs/current-result.md", `${JSON.stringify(resultRecord)}\n`);
  const applied = applyBacklogEvidenceAmendment(root, input, { checkCommit: false });
  const ledgerAfter = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const parsed = parseTransitionLedger(ledgerAfter).events;
  const current = checkBacklogState(root, { checkCommit: false });
  check("BS12 closed evidence amendment preserves history and binds exact SNT-1 digests without enabling generic closed transitions",
    preview.ok && !generic.ok && !mismatchedEvidence.ok && mismatchedEvidence.findings.some((finding) => finding.includes("exact ready Result")) && applied.ok && applied.wrote && ledgerAfter.startsWith(ledgerBefore)
      && parsed.length === 3 && parsed[0].entryHash === historical.entryHash && parsed[1].entryHash === unrelatedEvent.entryHash
      && parsed[2].from === "closed" && parsed[2].to === "closed" && parsed[2].evidence.previousClosureCommit === oldCommit
      && current.ok && current.items.find((entry) => entry.metadata.id === input.id).body === itemBodyBefore
      && current.items.find((entry) => entry.metadata.id === input.id).metadata.closure_commit === newCommit
      && current.items.find((entry) => entry.metadata.id === input.id).metadata.closed_at === "2026-07-17"
      && readFileSync(join(root, "backlog/items/unrelated.md"), "utf8") === unrelatedBefore,
    [...preview.errors, ...generic.errors, ...current.findings].join("; "));

  const tampered = structuredClone(parsed[2]); tampered.evidence.resultSha256 = "0".repeat(64);
  check("BS13 evidence-amendment tamper and replay are rejected by the append-only chain",
    validateTransitionLedger([historical, unrelatedEvent, tampered], current.items).some((error) => error.includes("entryHash does not match"))
      && validateTransitionLedger([historical, unrelatedEvent, parsed[2], parsed[2]], current.items).some((error) => error.includes("sequence must equal physical ledger order") || error.includes("previousHash")));
}

{
  const root = fixtureRoot();
  const oldCommit = "b".repeat(40); const newCommit = "c".repeat(40);
  const resultRecord = snt1Result();
  const closed = item({ id: "pipeline.source-available-commercial-licensing", status: "closed", closed_at: "2026-07-17", closure_repository: "self", closure_commit: oldCommit, closure_evidence: "specs/old-result.md" });
  const historical = event({ id: "pipeline.source-available-commercial-licensing", to: "closed", evidence: { kind: "implementation", commit: oldCommit, reference: "specs/old-result.md" }, reason: "Historical close." });
  write(root, "backlog/items/example.md", renderBacklogItem(closed)); write(root, "backlog/transitions.ndjson", `${canonicalJson(historical)}\n`);
  write(root, "specs/old-result.md", "# Old\n"); write(root, "specs/current-result.md", `${JSON.stringify(resultRecord)}\n`); writeBacklogProjections(root, { checkCommit: false });
  const before = ["backlog/items/example.md", "backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"].map((path) => readFileSync(join(root, path), "utf8"));
  let writes = 0;
  const interrupted = applyBacklogEvidenceAmendment(root, { id: "pipeline.source-available-commercial-licensing", at: "2026-07-23", actor: "sentinel-evidence", reason: "Bind evidence.", evidence: { kind: "evidence-amendment", commit: newCommit, reference: "specs/current-result.md", resultSha256: resultRecord.resultSha256, privateLicenseGateSha256: resultRecord.gates.private.projectionSha256, neutralPublicLicenseGateSha256: resultRecord.gates["neutral-public"].projectionSha256 }, closure: { repository: "self", commit: newCommit, evidence: "specs/current-result.md" } }, { checkCommit: false, atomicWrite(path, content) { writeFileSync(path, content); if (++writes === 2) throw new Error("simulated interruption"); } });
  const after = ["backlog/items/example.md", "backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"].map((path) => readFileSync(join(root, path), "utf8"));
  check("BS14 evidence-amendment crash restores every preimage and changes no unrelated state", !interrupted.ok && JSON.stringify(before) === JSON.stringify(after) && !existsSync(join(root, "backlog/.state-transaction.json")), interrupted.findings.join("; "));
}
{
  const root = recoveryFixture();
  const beforeLedger = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const preview = planSentinelBacklogRecovery(root, { checkCommit: false, evidenceCommit: "a".repeat(40) });
  const afterPreviewLedger = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const applied = applySentinelBacklogRecovery(root, { checkCommit: false, evidenceCommit: "a".repeat(40) });
  const after = checkBacklogState(root, { checkCommit: false });
  const duplicate = planSentinelBacklogRecovery(root, { checkCommit: false, evidenceCommit: "a".repeat(40) });
  const events = parseTransitionLedger(readFileSync(join(root, "backlog/transitions.ndjson"), "utf8")).events;
  check("BS08b Sentinel recovery previews by default and atomically imports only public baseline states",
    preview.ok && !preview.wrote && afterPreviewLedger === beforeLedger
      && applied.ok && applied.wrote && after.ok && events.length === 16
      && events.slice(1).every((entry) => entry.from === null && entry.to !== "closed" && entry.evidence.kind === "sentinel-backlog-recovery")
      && after.items.filter((entry) => entry.metadata.id.startsWith("pipeline.") && entry.metadata.id !== "pipeline.example").length === 15
      && preview.catalog.items.every((entry) => after.items.find((item) => item.metadata.id === entry.id)?.metadata.type === entry.type)
      && !duplicate.ok && duplicate.findings.some((finding) => finding.includes("already exists in the current backlog")), [...after.findings, ...duplicate.findings].join("; "));
}
{
  const duplicate = sentinelCatalog({ items: [...sentinelCatalog().items, sentinelCatalog().items[0]] });
  const unknown = { ...sentinelCatalog(), unreviewed: true };
  const closed = sentinelCatalog({ items: sentinelCatalog().items.map((entry, index) => index === 0 ? { ...entry, status: "closed" } : entry) });
  const empty = sentinelCatalog({ items: [] });
  const root = recoveryFixture(closed);
  const blocked = planSentinelBacklogRecovery(root, { checkCommit: false, evidenceCommit: "a".repeat(40) });
  check("BS08c Sentinel recovery rejects empty, closed, duplicate, and unknown catalog data fail-closed",
    validateSentinelRecoveryCatalog(duplicate).some((finding) => finding.includes("duplicates id"))
      && validateSentinelRecoveryCatalog(unknown).some((finding) => finding.includes("unsupported field unreviewed"))
      && validateSentinelRecoveryCatalog(empty).some((finding) => finding.includes("non-empty array"))
      && !blocked.ok && blocked.findings.some((finding) => finding.includes("must not claim closed status")), blocked.findings.join("; "));
}
{
  const root = recoveryFixture();
  applySentinelBacklogRecovery(root, { checkCommit: false, evidenceCommit: "a".repeat(40) });
  const extension = {
    schema: "pipeline.sentinel-scope-extension.v1",
    source: "specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md",
    admittedAt: "2026-07-22",
    items: [
      { id: "pipeline.windows-runtime-baseline-containment", status: "open", type: "defect" },
      { id: "pipeline.windows-directory-durability", status: "open", type: "defect" },
      { id: "pipeline.windows-private-state-assurance", status: "open", type: "defect" },
      { id: "pipeline.windows-verify-reproducibility", status: "open", type: "defect" },
      { id: "pipeline.windows-trusted-tool-resolution", status: "open", type: "defect" },
    ],
  };
  write(root, "backlog/sentinel-scope-extension-2026-07-22.json", `${JSON.stringify(extension)}\n`);
  const options = {
    checkCommit: false,
    evidenceCommit: "a".repeat(40),
  };
  const preview = planSentinelScopeExtension(root, extension, options);
  const applied = applySentinelScopeExtension(root, extension, options);
  const added = applied.events?.at(-1);
  check("BS08cc Sentinel scope extension uses the sanctioned recovery transaction with truthful actor and evidence",
    preview.ok && !preview.wrote && applied.ok && applied.wrote
      && added?.actor === "sentinel-scope-extension" && added?.evidence?.kind === "sentinel-scope-extension"
      && added?.reason === "Record the PO-approved Sentinel scope extension; no implementation or closure is claimed."
      && checkBacklogState(root, { checkCommit: false }).ok, applied.findings.join("; "));
}
{
  const root = recoveryFixture();
  applySentinelBacklogRecovery(root, { checkCommit: false, evidenceCommit: "a".repeat(40) });
  const extension = {
    schema: "pipeline.sentinel-scope-extension.v1",
    source: "specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md",
    admittedAt: "2026-07-22",
    items: [
      { id: "pipeline.windows-runtime-baseline-containment", status: "open", type: "defect" },
      { id: "pipeline.windows-directory-durability", status: "open", type: "defect" },
      { id: "pipeline.windows-private-state-assurance", status: "open", type: "defect" },
      { id: "pipeline.windows-verify-reproducibility", status: "open", type: "defect" },
      { id: "pipeline.windows-trusted-tool-resolution", status: "open", type: "defect" },
    ],
  };
  const options = { checkCommit: false, evidenceCommit: "a".repeat(40) };
  const rejected = [
    { ...extension, source: "specs/other.md" },
    { ...extension, admittedAt: "2026-07-23" },
    { ...extension, items: [{ ...extension.items[0], id: "pipeline.unapproved" }, ...extension.items.slice(1)] },
    { ...extension, items: [{ ...extension.items[0], status: "in_progress" }, ...extension.items.slice(1)] },
    { ...extension, items: [{ ...extension.items[0], type: "idea" }, ...extension.items.slice(1)] },
    { ...extension, items: [...extension.items].reverse() },
    { ...extension, items: {} },
    { ...extension, items: "not-an-array" },
    { ...extension, items: [null, ...extension.items.slice(1)] },
  ].map((candidate) => planSentinelScopeExtension(root, candidate, options));
  check("BS08ccc Sentinel scope extension rejects every non-approved authority binding",
    rejected.every((result) => !result.ok), rejected.flatMap((result) => result.findings).join("; "));
}
{
  const root = recoveryFixture();
  const ledgerBefore = readFileSync(join(root, "backlog/transitions.ndjson"), "utf8");
  const statusBefore = readFileSync(join(root, "backlog/STATUS.md"), "utf8");
  let writes = 0;
  const interrupted = applySentinelBacklogRecovery(root, {
    checkCommit: false,
    evidenceCommit: "a".repeat(40),
    atomicWrite(path, content) {
      writeFileSync(path, content);
      writes += 1;
      if (writes === 2) throw new Error("simulated interruption");
    },
  });
  check("BS08d Sentinel recovery interruption restores preexisting state and removes newly created item files",
    !interrupted.ok && readFileSync(join(root, "backlog/transitions.ndjson"), "utf8") === ledgerBefore
      && readFileSync(join(root, "backlog/STATUS.md"), "utf8") === statusBefore
      && !existsSync(join(root, "backlog/.state-transaction.json"))
      && !existsSync(join(root, "backlog/items/2026-07-19-afk-assumption-mode.md"))
      && checkBacklogState(root, { checkCommit: false }).ok, interrupted.findings.join("; "));
}
{
  const root = fixtureRoot();
  write(root, "backlog/items/legacy.md", "---\ntype: defect\nstatus: new\ncreated: 2026-07-17\nsource: legacy record\nowner: Pipeline Elephant\n---\n\n# Legacy\n");
  const result = checkBacklogState(root, { checkCommit: false });
  check("BS06b invalid legacy frontmatter fails closed without crashing the projection path",
    !result.ok && result.findings.some((finding) => finding.includes("missing required field schema"))
      && result.findings.some((finding) => finding.includes("missing required field id"))
      && result.projection === null, result.findings.join("; "));
}
{
  const root = fixtureRoot();
  const open = item();
  const initial = event();
  write(root, "backlog/items/example.md", renderBacklogItem(open));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(initial)}\n`);
  writeBacklogProjections(root, { checkCommit: false });
  const written = applyBacklogTransition(root, {
    id: "pipeline.example",
    to: "in_progress",
    at: "2026-07-17",
    actor: "storm-worker",
    reason: "Implementation started.",
    evidence: { kind: "implementation", commit: "a".repeat(40) },
  }, { checkCommit: false });
  const after = checkBacklogState(root, { checkCommit: false });
  const ledger = parseTransitionLedger(readFileSync(join(root, "backlog/transitions.ndjson"), "utf8"));
  check("BS07 sanctioned writer atomically advances item, ledger, and projections",
    written.ok && written.wrote && written.transition?.sequence === 2
      && after.ok && ledger.events.length === 2
      && ledger.events[1].from === "open" && ledger.events[1].to === "in_progress"
      && !readFileSync(join(root, "backlog/STATUS.md"), "utf8").includes("| pipeline.example | open |"));
}
{
  const root = fixtureRoot();
  const open = item();
  const initial = event();
  write(root, "backlog/items/example.md", renderBacklogItem(open));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(initial)}\n`);
  writeBacklogProjections(root, { checkCommit: false });
  const statusBefore = readFileSync(join(root, "backlog/STATUS.md"), "utf8");
  write(root, "backlog/.state-transaction.json", JSON.stringify({
    schema: "pipeline.backlog-transaction.v1",
    files: [{ path: "backlog/STATUS.md", before: statusBefore }],
  }));
  const blocked = checkBacklogState(root, { checkCommit: false });
  const recovery = recoverBacklogTransaction(root);
  const recovered = checkBacklogState(root, { checkCommit: false });
  check("BS08 incomplete transaction fails closed and recovery restores a complete preimage",
    !blocked.ok && blocked.findings.some((finding) => finding.includes("requires recovery"))
      && recovery.ok && recovery.recovered && recovered.ok);
}
{
  const root = fixtureRoot();
  const commit = "e".repeat(40);
  const closed = item({
    owner: "project:example-app",
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "project:example-app",
    closure_commit: commit,
    closure_evidence: "specs/result.md",
    closure_readback: "receipts/example-app-close.json",
  });
  const initial = event();
  const inProgress = event({
    sequence: 2,
    from: "open",
    to: "in_progress",
    previousHash: initial.entryHash,
    reason: "Project execution started.",
  });
  const close = event({
    sequence: 3,
    from: "in_progress",
    to: "closed",
    evidence: { kind: "implementation", commit, reference: "specs/result.md" },
    previousHash: inProgress.entryHash,
    reason: "Project reported delivery and an independent read-back.",
  });
  const receipt = {
    schema: PROJECT_CLOSURE_READBACK_SCHEMA,
    repository: "project:example-app",
    commit,
    readbackCommit: commit,
  };
  write(root, "backlog/items/example.md", renderBacklogItem(closed));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(initial)}\n${canonicalJson(inProgress)}\n${canonicalJson(close)}\n`);
  write(root, "specs/result.md", "# Result\n");
  write(root, "receipts/example-app-close.json", `${JSON.stringify(receipt)}\n`);
  const written = writeBacklogProjections(root, { checkCommit: false });
  const valid = checkBacklogState(root, { checkCommit: false });
  write(root, "receipts/example-app-close.json", `${JSON.stringify({ arbitrary: "receipt" })}\n`);
  const arbitrary = checkBacklogState(root, { checkCommit: false });
  write(root, "receipts/example-app-close.json", `${JSON.stringify({ ...receipt, repository: "project:other-app" })}\n`);
  const wrongRepository = checkBacklogState(root, { checkCommit: false });
  write(root, "receipts/example-app-close.json", `${JSON.stringify({ ...receipt, commit: "f".repeat(40), readbackCommit: "f".repeat(40) })}\n`);
  const wrongCommit = checkBacklogState(root, { checkCommit: false });
  write(root, "receipts/example-app-close.json", `${JSON.stringify({ ...receipt, readbackCommit: "f".repeat(40) })}\n`);
  const mismatched = checkBacklogState(root, { checkCommit: false });
  rmSync(join(root, "receipts/example-app-close.json"));
  const missing = checkBacklogState(root, { checkCommit: false });
  check("BS09 project closure read-back receipts are shaped, present, and bound to their repository and commit",
    validateProjectClosureReadback(receipt, {
      repository: "project:example-app",
      configuredRepository: "project:example-app",
      commit,
    }).length === 0
      && written.ok && written.wrote && valid.ok
      && arbitrary.findings.some((finding) => finding.includes("closure_readback is missing schema"))
      && arbitrary.findings.some((finding) => finding.includes("closure_readback has unsupported field arbitrary"))
      && wrongRepository.findings.some((finding) => finding.includes("repository does not match closure_repository"))
      && wrongCommit.findings.some((finding) => finding.includes("commit does not match closure_commit"))
      && mismatched.findings.some((finding) => finding.includes("readbackCommit must equal commit"))
      && missing.findings.some((finding) => finding.includes("closure_readback is missing or not a regular repository file")),
    [...arbitrary.findings, ...wrongRepository.findings, ...wrongCommit.findings, ...mismatched.findings, ...missing.findings].join("; "));
}
{
  const closureCommit = "b".repeat(40);
  const closed = item({
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "self",
    closure_commit: closureCommit,
    closure_evidence: "specs/result.md",
  });
  const projectClosed = item({
    owner: "project:example-app",
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "project:example-app",
    closure_commit: closureCommit,
    closure_evidence: "specs/result.md",
    closure_readback: "receipts/example-app-close.json",
  });
  const projectSelfClosed = item({
    owner: "project:example-app",
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "self",
    closure_commit: closureCommit,
    closure_evidence: "specs/result.md",
  });
  const unboundProjectClosed = item({
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "project:arbitrary-app",
    closure_commit: closureCommit,
    closure_evidence: "specs/result.md",
    closure_readback: "receipts/arbitrary-app-close.json",
  });
  const wronglyBoundProjectClosed = item({
    owner: "project:configured-app",
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "project:arbitrary-app",
    closure_commit: closureCommit,
    closure_evidence: "specs/result.md",
    closure_readback: "receipts/arbitrary-app-close.json",
  });
  const initial = event();
  const initiallyInProgress = event({
    to: "in_progress",
    reason: "Migration captured already active work.",
  });
  const inProgress = event({
    sequence: 2,
    from: "open",
    to: "in_progress",
    previousHash: initial.entryHash,
    reason: "Execution started.",
  });
  const close = event({
    sequence: 3,
    from: "in_progress",
    to: "closed",
    evidence: { kind: "implementation", commit: closureCommit },
    previousHash: inProgress.entryHash,
    reason: "Delivered.",
  });
  const skippedClose = event({
    sequence: 2,
    from: "open",
    to: "closed",
    evidence: { kind: "implementation", commit: closureCommit },
    previousHash: initial.entryHash,
    reason: "Skipped execution tracking.",
  });
  const projectSelfClose = event({
    to: "closed",
    evidence: { kind: "implementation", commit: closureCommit },
    reason: "Incorrectly recorded as a control-repository closure.",
  });
  const reopened = event({
    sequence: 4,
    from: "closed",
    to: "open",
    evidence: { kind: "reopen", commit: "c".repeat(40) },
    previousHash: close.entryHash,
    reason: "Attempted reopen.",
  });
  check("BS10 project-owned closures require their exact owner binding and read-back, while pipeline self-closures remain allowed",
    validateBacklogItem(projectClosed).length === 0
      && validateBacklogItem(projectSelfClosed).some((error) => error.includes("closure_repository must match the configured item project binding"))
      && validateBacklogItem(projectSelfClosed).some((error) => error.includes("project closure requires closure_readback"))
      && validateBacklogItem(unboundProjectClosed).some((error) => error.includes("configured item project binding"))
      && validateBacklogItem(wronglyBoundProjectClosed).some((error) => error.includes("configured item project binding"))
      && validateTransitionLedger([projectSelfClose], [projectSelfClosed]).some((error) => error.includes("first ledger event may only initialize open or in-progress work"))
      && validateTransitionLedger([initiallyInProgress], [item({ status: "in_progress" })]).length === 0
      && validateTransitionLedger([initial, inProgress, close], [closed]).length === 0
      && validateTransitionLedger([initial, skippedClose], [closed]).some((error) => error.includes("open may only move to in_progress"))
      && validateTransitionLedger([initial, inProgress, close, reopened], [item()]).some((error) => error.includes("closed must never transition")));
}
{
  const root = fixtureRoot();
  const closureCommit = "b".repeat(40);
  const projectSelfClosed = item({
    owner: "project:example-app",
    status: "closed",
    closed_at: "2026-07-17",
    closure_repository: "self",
    closure_commit: closureCommit,
    closure_evidence: "specs/result.md",
  });
  const selfClose = event({
    to: "closed",
    evidence: { kind: "implementation", commit: closureCommit, reference: "specs/result.md" },
    reason: "Incorrectly recorded as a control-repository closure.",
  });
  const projection = projectBacklog([projectSelfClosed], [selfClose]);
  write(root, "backlog/items/example.md", renderBacklogItem(projectSelfClosed));
  write(root, "backlog/transitions.ndjson", `${canonicalJson(selfClose)}\n`);
  write(root, "backlog/STATUS.md", projection.statusText);
  write(root, "backlog/index.json", projection.indexText);
  write(root, "specs/result.md", "# Result\n");
  const invalid = checkBacklogState(root, { checkCommit: false });
  check("BS11 checker rejects a project-owned self-closure before trusting projections",
    !invalid.ok
      && invalid.findings.some((finding) => finding.includes("closure_repository must match the configured item project binding"))
      && invalid.findings.some((finding) => finding.includes("project closure requires closure_readback"))
      && invalid.findings.some((finding) => finding.includes("first ledger event may only initialize open or in-progress work")), invalid.findings.join("; "));
}

{
  const historical39 = {
    schema: TRANSITION_SCHEMA,
    sequence: 39,
    id: AFK_REPAIR_ID,
    from: null,
    to: "open",
    at: "2026-07-23",
    actor: "sentinel-recovery",
    reason: "Repair the single missing initial ledger event for the existing open AFK-authorization process item; no status change or completion is claimed.",
    evidence: {
      kind: "missing-initial-ledger-repair",
      commit: "726b83681abc1b6366333c70a6a401b88016e5d4",
      reference: "backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md",
      sourceSha256: "abb09db5b6fe9fe36e58e995cbe3d93e05f3b8c7958270f43a670269fe9a2976",
    },
    previousHash: "92e42ed2e83f2820f6aac609bb96996f5e9fdd6e12a2878d9340ebc359c9002f",
    entryHash: "84d2128467224ca61aa980c088e92473b9dda27959ecd29600cf8d4a72b83d3b",
  };
  check("BS18 frozen v1 event bytes retain the historical event-39 hash domain",
    transitionHash(historical39) === historical39.entryHash);
}

{
  const fixture = mixedTransitionFixture();
  const errors = validateTransitionLedger(fixture.events, fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const projection = projectBacklog(fixture.items, fixture.events);
  const wrongDomain = { ...fixture.events[4], schema: TRANSITION_SCHEMA, entryHash: "" };
  check("BS19 mixed v1/v2 replay binds the first v2 event to the v1 head and repairs event-39/event-40-shaped evidence without status mutation",
    errors.length === 0
      && fixture.events[4].previousHash === fixture.events[3].entryHash
      && fixture.events[4].entryHash !== transitionHash(wrongDomain)
      && fixture.events[4].from === "in_progress" && fixture.events[4].to === "in_progress"
      && fixture.events[5].from === "closed" && fixture.events[5].to === "closed"
      && fixture.items[0].metadata.status === "in_progress"
      && fixture.items[1].metadata.closure_commit === fixture.commits.event40Replacement
      && projection.index.generatedFrom.transitionHead === fixture.events[5].entryHash
      && projection.index.counts.in_progress === 1 && projection.index.counts.closed === 1,
    errors.join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const evidence = fixture.events[4].evidence;
  const extra = { ...evidence, authorityProse: "approve it" };
  const missing = { ...evidence }; delete missing.dispositionSha256;
  const wrongSchema = { ...evidence, schema: "pipeline.backlog-evidence-amendment.v2" };
  const wrongPath = { ...evidence, reference: "../private/decision.json" };
  const options = {
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  };
  const extraErrors = validateBacklogEvidenceAmendment(extra, options);
  const missingErrors = validateBacklogEvidenceAmendment(missing, options);
  const wrongSchemaErrors = validateBacklogEvidenceAmendment(wrongSchema, options);
  const wrongPathErrors = validateBacklogEvidenceAmendment(wrongPath, options);
  check("BS20 v2 evidence amendment runtime validation is closed and authority-bound",
    validateBacklogEvidenceAmendment(evidence, options).length === 0
      && extraErrors.some((error) => error.includes("unsupported field authorityProse"))
      && missingErrors.some((error) => error.includes("missing dispositionSha256"))
      && wrongSchemaErrors.some((error) => error.includes("schema must equal"))
      && wrongPathErrors.some((error) => error.includes("safe repository-relative path"))
      && [...extraErrors, ...missingErrors, ...wrongSchemaErrors, ...wrongPathErrors]
        .every((error) => V2_DOMAIN_PREFIX.test(error)));
}

{
  const evidenceSchema = JSON.parse(readFileSync(new URL("../scripts/backlog-evidence-amendment.schema.json", import.meta.url), "utf8"));
  const scriptTransitionSchema = JSON.parse(readFileSync(new URL("../scripts/backlog-transition-v2.schema.json", import.meta.url), "utf8"));
  const backlogTransitionSchema = JSON.parse(readFileSync(new URL("../../../backlog/schemas/transition-v2.schema.json", import.meta.url), "utf8"));
  const transitionKeys = ["schema", "sequence", "id", "from", "to", "at", "actor", "reason", "evidence", "previousHash", "entryHash"].sort();
  const evidenceKeys = ["schema", "kind", "targetSequence", "targetEntryHash", "targetCommit", "replacementCommit", "reference", "dispositionSha256", "idempotencyKey"].sort();
  const ordinaryEvidenceKeys = ["kind", "commit", "reference"].sort();
  const isClosedAmendmentBranch = (branch) =>
    branch?.$ref === "backlog-evidence-amendment.schema.json"
      || (branch?.additionalProperties === false
        && branch?.required?.toSorted().join(",") === evidenceKeys.join(",")
        && branch?.properties?.schema?.const === EVIDENCE_AMENDMENT_SCHEMA
        && branch?.properties?.kind?.const === "evidence-amendment");
  const isClosedOrdinaryBranch = (branch) =>
    branch?.additionalProperties === false
      && branch?.required?.toSorted().join(",") === ordinaryEvidenceKeys.join(",")
      && branch?.properties?.kind?.not?.const === "evidence-amendment"
      && branch?.properties?.commit?.pattern === "^[a-f0-9]{40}$"
      && typeof branch?.properties?.reference?.pattern === "string";
  const hasClosedEvidenceUnion = (schema) => {
    const evidence = schema.properties?.evidence;
    return Array.isArray(evidence?.oneOf)
      && evidence.oneOf.length === 2
      && evidence.oneOf.filter(isClosedAmendmentBranch).length === 1
      && evidence.oneOf.filter(isClosedOrdinaryBranch).length === 1
      && !Object.hasOwn(evidence, "$ref")
      && !Object.hasOwn(evidence, "required")
      && !Object.hasOwn(evidence, "additionalProperties");
  };
  check("BS21 v2 JSON schemas close the exact event envelope and dispatch evidence through two closed branches",
    evidenceSchema.$id === EVIDENCE_AMENDMENT_SCHEMA
      && evidenceSchema.additionalProperties === false
      && evidenceSchema.required.toSorted().join(",") === evidenceKeys.join(",")
      && scriptTransitionSchema.$id === TRANSITION_V2_SCHEMA
      && scriptTransitionSchema.additionalProperties === false
      && scriptTransitionSchema.required.toSorted().join(",") === transitionKeys.join(",")
      && hasClosedEvidenceUnion(scriptTransitionSchema)
      && backlogTransitionSchema.$id === TRANSITION_V2_SCHEMA
      && backlogTransitionSchema.additionalProperties === false
      && backlogTransitionSchema.required.toSorted().join(",") === transitionKeys.join(",")
      && hasClosedEvidenceUnion(backlogTransitionSchema));
}

{
  const fixture = mixedTransitionFixture();
  const malformed = structuredClone(fixture.events);
  malformed[4].evidence.unreviewed = true;
  const malformedEvents = rechain(malformed);
  const malformedErrors = validateTransitionLedger(malformedEvents, fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const forward = structuredClone(fixture.events);
  forward[4].evidence.targetSequence = 6;
  const forwardEvents = rechain(forward);
  const forwardErrors = validateTransitionLedger(forwardEvents, fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  check("BS22 malformed and forward-referencing amendments cannot tolerate unreachable history",
    malformedErrors.some((error) => error.includes("unsupported field unreviewed"))
      && malformedErrors.some((error) => error.includes("ledger event 1: evidence.commit is not a reachable"))
      && forwardErrors.some((error) => error.includes("must target an earlier physical event"))
      && forwardErrors.some((error) => error.includes("ledger event 1: evidence.commit is not a reachable")),
    [...malformedErrors, ...forwardErrors].join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const wrongTarget = structuredClone(fixture.events);
  Object.assign(wrongTarget[4].evidence, {
    targetSequence: fixture.events[3].sequence,
    targetEntryHash: fixture.events[3].entryHash,
    targetCommit: fixture.events[3].evidence.commit,
  });
  const wrongTargetErrors = validateTransitionLedger(rechain(wrongTarget), fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const wrongHash = structuredClone(fixture.events);
  wrongHash[4].evidence.targetEntryHash = "0".repeat(64);
  const wrongHashErrors = validateTransitionLedger(rechain(wrongHash), fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const wrongCommit = structuredClone(fixture.events);
  wrongCommit[4].evidence.targetCommit = "a".repeat(40);
  const wrongCommitErrors = validateTransitionLedger(rechain(wrongCommit), fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  check("BS23 amendment target sequence, entry hash, commit, and item must bind the same earlier event",
    wrongTargetErrors.some((error) => error.includes("id does not match the target event id"))
      && wrongHashErrors.some((error) => error.includes("targetEntryHash does not bind"))
      && wrongCommitErrors.some((error) => error.includes("targetCommit does not bind")),
    [...wrongTargetErrors, ...wrongHashErrors, ...wrongCommitErrors].join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const duplicate = v2AmendmentEvent({
    sequence: 7,
    id: fixture.events[0].id,
    status: "in_progress",
    target: fixture.events[0],
    replacementCommit: "5".repeat(40),
    previousHash: fixture.events.at(-1).entryHash,
    idempotencyKey: "a".repeat(64),
    reference: "specs/sprint-nova-epic/evidence/backlog/event-39-conflict.json",
  });
  const reachable = new Set([...fixture.reachable, "5".repeat(40)]);
  const duplicateErrors = validateTransitionLedger([...fixture.events, duplicate], fixture.items, {
    commitExists: (oid) => reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const reusedKey = structuredClone(fixture.events);
  reusedKey[5].evidence.idempotencyKey = reusedKey[4].evidence.idempotencyKey;
  const reusedKeyErrors = validateTransitionLedger(rechain(reusedKey), fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  check("BS24 duplicate targets, conflicting replacements, and replayed idempotency keys fail closed",
    duplicateErrors.filter((error) => error.includes("duplicate or conflicting evidence amendment")).length >= 2
      && duplicateErrors.some((error) => error.includes("ledger event 1: evidence.commit is not a reachable"))
      && reusedKeyErrors.filter((error) => error.includes("idempotencyKey is duplicated")).length >= 2,
    [...duplicateErrors, ...reusedKeyErrors].join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const chainInvalid = structuredClone(fixture.events);
  chainInvalid[4].previousHash = "f".repeat(64);
  chainInvalid[4].entryHash = transitionHash(chainInvalid[4]);
  chainInvalid[5].previousHash = chainInvalid[4].entryHash;
  chainInvalid[5].entryHash = transitionHash(chainInvalid[5]);
  const chainErrors = validateTransitionLedger(chainInvalid, fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const statusMutation = structuredClone(fixture.events);
  statusMutation[4].to = "closed";
  const statusErrors = validateTransitionLedger(rechain(statusMutation), fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  check("BS25 chain-invalid amendments and status-mutating amendments cannot repair evidence",
    chainErrors.some((error) => error.includes("previousHash does not bind"))
      && chainErrors.some((error) => error.includes("ledger event 1: evidence.commit is not a reachable"))
      && statusErrors.some((error) => error.includes("must preserve one canonical status"))
      && statusErrors.some((error) => error.includes("must not mutate status")),
    [...chainErrors, ...statusErrors].join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const replacementMissing = new Set(fixture.reachable);
  replacementMissing.delete(fixture.commits.event39Replacement);
  const replacementErrors = validateTransitionLedger(fixture.events, fixture.items, {
    commitExists: (oid) => replacementMissing.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const targetReachable = new Set([...fixture.reachable, fixture.commits.event39Commit]);
  const reachableTargetErrors = validateTransitionLedger(fixture.events, fixture.items, {
    commitExists: (oid) => targetReachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  check("BS26 reachability tolerance requires an unreachable target and a reachable replacement",
    replacementErrors.some((error) => error.includes("replacementCommit is not a reachable"))
      && replacementErrors.some((error) => error.includes("ledger event 1: evidence.commit is not a reachable"))
      && reachableTargetErrors.some((error) => error.includes("targetCommit is already reachable")),
    [...replacementErrors, ...reachableTargetErrors].join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const evidence = fixture.events[4].evidence;
  const callbackReferences = [];
  const exactBufferErrors = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: (reference) => {
      callbackReferences.push(reference);
      return DISPOSITION_BYTES;
    },
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const exactStringErrors = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => DISPOSITION_BYTES.toString("utf8"),
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const exactUint8ArrayErrors = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => new Uint8Array(DISPOSITION_BYTES),
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const missingErrors = validateBacklogEvidenceAmendment(evidence, {
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const unreadableErrors = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => null,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const wrongTypeErrors = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => 42,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const throwingErrors = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => {
      throw new Error("synthetic unreadable disposition");
    },
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const mismatchErrors = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => Buffer.from("tampered disposition bytes", "utf8"),
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const missingLedgerErrors = validateTransitionLedger(fixture.events, fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const exactLedgerErrors = validateTransitionLedger(fixture.events, fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  check("BS27 v2 amendments require exact referenced disposition bytes through the pure validator callback",
    exactBufferErrors.length === 0
      && exactStringErrors.length === 0
      && exactUint8ArrayErrors.length === 0
      && callbackReferences.join(",") === evidence.reference
      && missingErrors.length > 0
      && unreadableErrors.length > 0
      && wrongTypeErrors.length > 0
      && throwingErrors.length > 0
      && mismatchErrors.length > 0
      && missingLedgerErrors.length > 0
      && exactLedgerErrors.length === 0,
    [
      `exactBuffer=${exactBufferErrors.join("|")}`,
      `exactString=${exactStringErrors.join("|")}`,
      `exactUint8Array=${exactUint8ArrayErrors.join("|")}`,
      `missing=${missingErrors.join("|")}`,
      `unreadable=${unreadableErrors.join("|")}`,
      `wrongType=${wrongTypeErrors.join("|")}`,
      `throwing=${throwingErrors.join("|")}`,
      `mismatch=${mismatchErrors.join("|")}`,
      `missingLedger=${missingLedgerErrors.join("|")}`,
      `exactLedger=${exactLedgerErrors.join("|")}`,
    ].join("; "));
}

{
  const initial = v2OperationEvent();
  const assigned = v2OperationEvent({
    sequence: 2,
    from: "open",
    to: "in_progress",
    evidence: {
      kind: "nova-assignment",
      commit: "b".repeat(40),
      reference: "specs/sprint-nova-epic/evidence/backlog/assignment.json",
    },
    previousHash: initial.entryHash,
  });
  const closed = v2OperationEvent({
    sequence: 3,
    from: "in_progress",
    to: "closed",
    evidence: {
      kind: "nova-closure",
      commit: "c".repeat(40),
      reference: "specs/sprint-nova-epic/evidence/backlog/closure.json",
    },
    previousHash: assigned.entryHash,
  });
  const closedItem = item({
    status: "closed",
    closed_at: "2026-07-24",
    closure_repository: "self",
    closure_commit: closed.evidence.commit,
    closure_evidence: closed.evidence.reference,
  });
  const ordinaryOptions = { authorizeOrdinaryEvidence: () => AUTHORITY_VALID };
  const validErrors = validateTransitionLedger([initial, assigned, closed], [closedItem], ordinaryOptions);
  const openItem = item();
  const sameStatus = v2OperationEvent({
    sequence: 2,
    from: "open",
    to: "open",
    evidence: {
      kind: "nova-reconciliation",
      commit: "d".repeat(40),
      reference: "specs/sprint-nova-epic/evidence/backlog/repeated-open.json",
    },
    previousHash: initial.entryHash,
  });
  const sameStatusErrors = validateTransitionLedger([initial, sameStatus], [openItem], ordinaryOptions);
  const extraEvidence = v2OperationEvent({
    sequence: 2,
    from: "open",
    to: "in_progress",
    evidence: {
      kind: "nova-assignment",
      commit: "b".repeat(40),
      reference: "specs/sprint-nova-epic/evidence/backlog/assignment.json",
      authorityProse: "trust me",
    },
    previousHash: initial.entryHash,
  });
  const extraEvidenceErrors = validateTransitionLedger(
    [initial, extraEvidence],
    [item({ status: "in_progress" })],
    ordinaryOptions,
  );
  const scriptTransitionSchema = JSON.parse(readFileSync(new URL("../scripts/backlog-transition-v2.schema.json", import.meta.url), "utf8"));
  const backlogTransitionSchema = JSON.parse(readFileSync(new URL("../../../backlog/schemas/transition-v2.schema.json", import.meta.url), "utf8"));
  const schemaSupportsOperations = (schema) => {
    const fromShape = JSON.stringify(schema.properties?.from);
    const evidenceShape = schema.properties?.evidence;
    const transitionShape = JSON.stringify(schema);
    return fromShape.includes('"null"')
      && Array.isArray(evidenceShape?.oneOf)
      && evidenceShape.oneOf.length >= 2
      && transitionShape.includes('"from":{"const":null}')
      && transitionShape.includes('"from":{"const":"open"}')
      && transitionShape.includes('"to":{"const":"in_progress"}')
      && transitionShape.includes('"from":{"const":"in_progress"}')
      && transitionShape.includes('"to":{"const":"closed"}');
  };
  check("BS28 v2 supports initialize, assign, and close with closed ordinary evidence while reserving same-status for amendments",
    validErrors.length === 0
      && sameStatusErrors.some((error) => error.includes("transition must change status"))
      && extraEvidenceErrors.some((error) => error.includes("unsupported field authorityProse"))
      && schemaSupportsOperations(scriptTransitionSchema)
      && schemaSupportsOperations(backlogTransitionSchema),
    [
      `valid=${validErrors.join("|")}`,
      `sameStatus=${sameStatusErrors.join("|")}`,
      `extraEvidence=${extraEvidenceErrors.join("|")}`,
      `scriptSchema=${JSON.stringify(scriptTransitionSchema.properties?.evidence)}`,
      `backlogSchema=${JSON.stringify(backlogTransitionSchema.properties?.evidence)}`,
    ].join("; "));
}

{
  const duplicateEnvelope = '{"schema":"pipeline.backlog-transition.v1","schema":"pipeline.backlog-transition.v2"}\n';
  const duplicateNested = '{"schema":"pipeline.backlog-transition.v2","evidence":{"kind":"first","kind":"second"}}\n';
  const escapedDuplicateNested = '{"schema":"pipeline.backlog-transition.v2","evidence":{"kind":"first","k\\u0069nd":"second"}}\n';
  const envelopeResult = parseTransitionLedger(duplicateEnvelope);
  const nestedResult = parseTransitionLedger(duplicateNested);
  const escapedNestedResult = parseTransitionLedger(escapedDuplicateNested);
  const rejectsDuplicate = (result) => !result.ok
    && result.events.length === 0
    && result.errors.some((error) => error.includes("duplicate JSON key"))
    && result.errors.every((error) => V2_DOMAIN_PREFIX.test(error));
  check("BS29 ledger parsing rejects duplicate envelope and nested evidence keys when the final parsed schema is v2",
    rejectsDuplicate(envelopeResult)
      && rejectsDuplicate(nestedResult)
      && rejectsDuplicate(escapedNestedResult),
    [
      `envelope=${JSON.stringify(envelopeResult)}`,
      `nested=${JSON.stringify(nestedResult)}`,
      `escapedNested=${JSON.stringify(escapedNestedResult)}`,
    ].join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const evidence = fixture.events[4].evidence;
  const invalidReferences = [".", "./x", "a/./b", "a//b", "a/", "../x", "a/../b", "a\\b"];
  const validReference = "specs/sprint-nova-epic/evidence/backlog/event-39-amendment-intent.json";
  const runtimeResults = invalidReferences.map((reference) => {
    let callbackCalls = 0;
    const errors = validateBacklogEvidenceAmendment({ ...evidence, reference }, {
      readDispositionBytes: () => {
        callbackCalls += 1;
        return DISPOSITION_BYTES;
      },
      authorizeAmendment: AUTHORIZE_AMENDMENT,
    });
    return { reference, callbackCalls, errors };
  });
  const runtimeRejects = runtimeResults.every(({ callbackCalls, errors }) =>
    callbackCalls === 0 && errors.some((error) => error.includes("safe repository-relative path")));
  let validCallbackCalls = 0;
  const validErrors = validateBacklogEvidenceAmendment({ ...evidence, reference: validReference }, {
    readDispositionBytes: (reference) => {
      validCallbackCalls += 1;
      return reference === validReference ? DISPOSITION_BYTES : null;
    },
    authorizeAmendment: AUTHORIZE_AMENDMENT,
  });
  const schemaUrls = [
    new URL("../scripts/backlog-evidence-amendment.schema.json", import.meta.url),
    new URL("../scripts/backlog-transition-v2.schema.json", import.meta.url),
    new URL("../../../backlog/schemas/transition-v2.schema.json", import.meta.url),
  ];
  const collectReferencePatterns = (schemaUrl, seen = new Set()) => {
    if (seen.has(schemaUrl.href)) return [];
    seen.add(schemaUrl.href);
    const schema = JSON.parse(readFileSync(schemaUrl, "utf8"));
    const patterns = [];
    const visit = (node) => {
      if (node === null || typeof node !== "object") return;
      if (typeof node.properties?.reference?.pattern === "string") patterns.push(node.properties.reference.pattern);
      if (typeof node.$ref === "string" && !node.$ref.startsWith("#") && !node.$ref.includes("://")) {
        const [relativePath] = node.$ref.split("#");
        patterns.push(...collectReferencePatterns(new URL(relativePath, schemaUrl), seen));
      }
      for (const value of Object.values(node)) visit(value);
    };
    visit(schema);
    return patterns;
  };
  const patternSets = schemaUrls.map((schemaUrl) =>
    collectReferencePatterns(schemaUrl).map((pattern) => new RegExp(pattern, "u")));
  const schemasMatchRuntime = patternSets.every((patterns) =>
    patterns.length > 0
      && patterns.every((pattern) =>
        pattern.test(validReference) && invalidReferences.every((reference) => !pattern.test(reference))));
  check("BS30 evidence references and both JSON schema patterns require one canonical repository file path",
    runtimeRejects
      && validErrors.length === 0
      && validCallbackCalls === 1
      && schemasMatchRuntime,
    [
      `runtime=${runtimeResults.map(({ reference, callbackCalls, errors }) => `${reference}:${callbackCalls}:${errors.join("|")}`).join(",")}`,
      `valid=${validErrors.join("|")}`,
      `validCallbackCalls=${validCallbackCalls}`,
      `patterns=${patternSets.map((patterns) => patterns.map(String).join(",")).join(";")}`,
    ].join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const evidence = fixture.events[4].evidence;
  const contexts = [];
  const valid = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: (context) => {
      contexts.push(context);
      return AUTHORITY_VALID;
    },
  });
  let invalidPathCalls = 0;
  const invalidPath = validateBacklogEvidenceAmendment({ ...evidence, reference: "specs/../private.json" }, {
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: () => {
      invalidPathCalls += 1;
      return AUTHORITY_VALID;
    },
  });
  let digestMismatchCalls = 0;
  const digestMismatch = validateBacklogEvidenceAmendment(evidence, {
    readDispositionBytes: () => Buffer.from("different bytes\n", "utf8"),
    authorizeAmendment: () => {
      digestMismatchCalls += 1;
      return AUTHORITY_VALID;
    },
  });
  const failures = [
    validateBacklogEvidenceAmendment(evidence, {
      authorizeAmendment: () => AUTHORITY_VALID,
    }),
    validateBacklogEvidenceAmendment(evidence, {
      readDispositionBytes: () => null,
      authorizeAmendment: () => AUTHORITY_VALID,
    }),
    validateBacklogEvidenceAmendment(evidence, {
      readDispositionBytes: () => { throw new Error("disposition unavailable"); },
      authorizeAmendment: () => AUTHORITY_VALID,
    }),
    validateBacklogEvidenceAmendment(evidence, { readDispositionBytes: () => DISPOSITION_BYTES }),
    validateBacklogEvidenceAmendment(evidence, {
      readDispositionBytes: () => DISPOSITION_BYTES,
      authorizeAmendment: () => { throw new Error("authority unavailable"); },
    }),
    validateBacklogEvidenceAmendment(evidence, {
      readDispositionBytes: () => DISPOSITION_BYTES,
      authorizeAmendment: () => true,
    }),
    validateBacklogEvidenceAmendment(evidence, {
      readDispositionBytes: () => DISPOSITION_BYTES,
      authorizeAmendment: () => false,
    }),
    validateBacklogEvidenceAmendment(evidence, {
      readDispositionBytes: () => DISPOSITION_BYTES,
      authorizeAmendment: () => ({ ok: false, code: "AUTHORITY:DENIED" }),
    }),
    validateBacklogEvidenceAmendment(evidence, {
      readDispositionBytes: () => DISPOSITION_BYTES,
      authorizeAmendment: () => ({ ...AUTHORITY_VALID, detail: "not closed" }),
    }),
  ];
  const context = contexts[0];
  check("BS31 amendment authority runs only after canonical path and exact disposition digest validation",
    valid.length === 0
      && contexts.length === 1
      && Object.keys(context ?? {}).toSorted().join(",") === "dispositionBytes,dispositionSha256,evidence"
      && context.evidence === evidence
      && Buffer.from(context.dispositionBytes).equals(DISPOSITION_BYTES)
      && context.dispositionSha256 === DISPOSITION_SHA256
      && invalidPathCalls === 0
      && digestMismatchCalls === 0
      && invalidPath.length > 0
      && invalidPath.every((error) => V2_DOMAIN_PREFIX.test(error))
      && digestMismatch.length > 0
      && digestMismatch.every((error) => V2_DOMAIN_PREFIX.test(error)),
    [...valid, ...invalidPath, ...digestMismatch].join("; "));
  check("BS32 amendment authority requires the exact typed success result and stable authority/unavailable codes",
    failures.every((errors) => errors.length > 0
      && errors.every((error) => /^(?:AUTHORITY|UNAVAILABLE):/u.test(error))),
    failures.map((errors) => errors.join("|")).join("; "));
}

{
  const initialized = v2OperationEvent();
  const assigned = v2OperationEvent({
    sequence: 2,
    from: "open",
    to: "in_progress",
    evidence: {
      kind: "nova-assignment",
      commit: "b".repeat(40),
      reference: "specs/sprint-nova-epic/evidence/backlog/assignment.json",
    },
    previousHash: initialized.entryHash,
  });
  const closed = v2OperationEvent({
    sequence: 3,
    from: "in_progress",
    to: "closed",
    evidence: {
      kind: "nova-closure",
      commit: "c".repeat(40),
      reference: "specs/sprint-nova-epic/evidence/backlog/closure.json",
    },
    previousHash: assigned.entryHash,
  });
  const closedItem = item({
    status: "closed",
    closed_at: "2026-07-24",
    closure_repository: "self",
    closure_commit: closed.evidence.commit,
    closure_evidence: closed.evidence.reference,
  });
  const ordinaryContexts = [];
  const valid = validateTransitionLedger([initialized, assigned, closed], [closedItem], {
    authorizeOrdinaryEvidence: (context) => {
      ordinaryContexts.push(context);
      return AUTHORITY_VALID;
    },
  });
  const missing = validateTransitionLedger([initialized, assigned, closed], [closedItem]);
  const thrown = validateTransitionLedger([initialized, assigned, closed], [closedItem], {
    authorizeOrdinaryEvidence: () => { throw new Error("ordinary authority unavailable"); },
  });
  const malformed = validateTransitionLedger([initialized, assigned, closed], [closedItem], {
    authorizeOrdinaryEvidence: () => ({ ok: true, code: "AUTHORITY:VALID", extra: true }),
  });
  const denied = validateTransitionLedger([initialized, assigned, closed], [closedItem], {
    authorizeOrdinaryEvidence: () => false,
  });
  let invalidEvidenceCalls = 0;
  const invalidEvidence = structuredClone(initialized);
  invalidEvidence.evidence.authorityProse = "trust me";
  invalidEvidence.entryHash = transitionHash(invalidEvidence);
  const invalidEvidenceErrors = validateTransitionLedger([invalidEvidence], [item()], {
    authorizeOrdinaryEvidence: () => {
      invalidEvidenceCalls += 1;
      return AUTHORITY_VALID;
    },
  });
  check("BS33 every ordinary v2 event requires exact typed authority and receives only event/evidence",
    valid.length === 0
      && ordinaryContexts.length === 3
      && ordinaryContexts.every((context, index) =>
        Object.keys(context).toSorted().join(",") === "event,evidence"
          && context.event === [initialized, assigned, closed][index]
          && context.evidence === context.event.evidence)
      && missing.some((error) => error.startsWith("AUTHORITY:"))
      && thrown.some((error) => error.startsWith("UNAVAILABLE:"))
      && malformed.some((error) => error.startsWith("AUTHORITY:"))
      && denied.some((error) => error.startsWith("AUTHORITY:"))
      && invalidEvidenceCalls === 0,
    [...valid, ...missing, ...thrown, ...malformed, ...denied, ...invalidEvidenceErrors].join("; "));
  const wrongPrevious = structuredClone(initialized);
  wrongPrevious.previousHash = "f".repeat(64);
  wrongPrevious.entryHash = transitionHash(wrongPrevious);
  const wrongSequence = structuredClone(initialized);
  wrongSequence.sequence = 2;
  wrongSequence.entryHash = transitionHash(wrongSequence);
  const longReason = structuredClone(initialized);
  longReason.reason = "x".repeat(513);
  longReason.entryHash = transitionHash(longReason);
  const skippedStatus = structuredClone(initialized);
  skippedStatus.to = "closed";
  skippedStatus.entryHash = transitionHash(skippedStatus);
  const skippedClosedItem = item({
    status: "closed",
    closed_at: "2026-07-24",
    closure_repository: "self",
    closure_commit: skippedStatus.evidence.commit,
    closure_evidence: skippedStatus.evidence.reference,
  });
  const authorize = { authorizeOrdinaryEvidence: () => AUTHORITY_VALID };
  const structuralFindings = [
    validateTransitionLedger([wrongPrevious], [item()], authorize),
    validateTransitionLedger([wrongSequence], [item()], authorize),
    validateTransitionLedger([longReason], [item()], authorize),
    validateTransitionLedger([skippedStatus], [skippedClosedItem], authorize),
  ].flat();
  const v2Findings = [
    ...missing,
    ...thrown,
    ...malformed,
    ...denied,
    ...invalidEvidenceErrors,
    ...structuralFindings,
  ];
  check("BS34 every v2-originated public validator finding uses one Spec section 7.2 domain prefix",
    v2Findings.length > 0 && v2Findings.every((error) => V2_DOMAIN_PREFIX.test(error)),
    v2Findings.join("; "));
}

{
  const invalid = event({ reason: "" });
  const findings = validateTransitionLedger([invalid], [item()]);
  check("BS35 frozen v1 validation findings remain byte-compatible",
    JSON.stringify(findings) === JSON.stringify(["ledger event 1: reason must be non-empty"]),
    JSON.stringify(findings));
}

{
  const v1 = event();
  const v2 = v2OperationEvent();
  const v1EnvelopeLastWins = canonicalJson(v1)
    .replace(`"schema":"${TRANSITION_SCHEMA}"`, `"schema":"${TRANSITION_V2_SCHEMA}","schema":"${TRANSITION_SCHEMA}"`);
  const v1NestedLastWins = canonicalJson(v1)
    .replace('"kind":"baseline-migration"', '"kind":"ignored","kind":"baseline-migration"');
  const v2EnvelopeDuplicate = canonicalJson(v2)
    .replace(`"schema":"${TRANSITION_V2_SCHEMA}"`, `"schema":"${TRANSITION_SCHEMA}","schema":"${TRANSITION_V2_SCHEMA}"`);
  const v2NestedDuplicate = canonicalJson(v2)
    .replace('"kind":"nova-reconciliation"', '"kind":"ignored","k\\u0069nd":"nova-reconciliation"');
  const parsedV1Envelope = parseTransitionLedger(`${v1EnvelopeLastWins}\n`);
  const parsedV1Nested = parseTransitionLedger(`${v1NestedLastWins}\n`);
  const parsedV2Envelope = parseTransitionLedger(`${v2EnvelopeDuplicate}\n`);
  const parsedV2Nested = parseTransitionLedger(`${v2NestedDuplicate}\n`);
  check("BS36 duplicate-key rejection is v2-only and preserves frozen v1 last-key-wins parsing",
    parsedV1Envelope.ok
      && parsedV1Envelope.events[0].schema === TRANSITION_SCHEMA
      && validateTransitionLedger(parsedV1Envelope.events, [item()]).length === 0
      && parsedV1Nested.ok
      && parsedV1Nested.events[0].evidence.kind === "baseline-migration"
      && validateTransitionLedger(parsedV1Nested.events, [item()]).length === 0
      && !parsedV2Envelope.ok
      && parsedV2Envelope.errors.some((error) => error.includes("duplicate JSON key"))
      && parsedV2Envelope.errors.every((error) => V2_DOMAIN_PREFIX.test(error))
      && !parsedV2Nested.ok
      && parsedV2Nested.errors.some((error) => error.includes("duplicate JSON key"))
      && parsedV2Nested.errors.every((error) => V2_DOMAIN_PREFIX.test(error)),
    [parsedV1Envelope, parsedV1Nested, parsedV2Envelope, parsedV2Nested]
      .map((value) => JSON.stringify(value)).join("; "));
}

{
  const fixture = mixedTransitionFixture();
  const valid = validateTransitionLedger(fixture.events, fixture.items, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: () => AUTHORITY_VALID,
  });
  const mismatchItems = structuredClone(fixture.items);
  mismatchItems[1].metadata.closure_evidence = "specs/sprint-nova-epic/evidence/backlog/wrong-amendment.json";
  const mismatch = validateTransitionLedger(fixture.events, mismatchItems, {
    commitExists: (oid) => fixture.reachable.has(oid),
    readDispositionBytes: () => DISPOSITION_BYTES,
    authorizeAmendment: () => AUTHORITY_VALID,
  });
  check("BS37 a final closed amendment binds both replacementCommit and the amendment reference",
    valid.length === 0
      && mismatch.some((error) => V2_DOMAIN_PREFIX.test(error) && error.includes("closure_evidence")),
    [...valid, ...mismatch].join("; "));
}

{
  const { root, fixture } = v2CheckerFixture();
  let authorityCalls = 0;
  const options = {
    checkCommit: false,
    authorizeAmendment: () => {
      authorityCalls += 1;
      return AUTHORITY_VALID;
    },
  };
  const loaded = loadBacklogState(root, options);
  const checked = checkBacklogState(root, options);
  const untrusted = checkBacklogState(root, { checkCommit: false });
  check("BS38 default backlog loading registers transition-v2 and reads regular disposition bytes with authority under checkCommit false",
    loaded.ok && checked.ok && authorityCalls === 4
      && loaded.events.at(-1).entryHash === fixture.events.at(-1).entryHash
      && !untrusted.ok
      && untrusted.findings.some((finding) => finding.startsWith("AUTHORITY:")),
    [...loaded.findings, ...checked.findings, ...untrusted.findings].join("; "));
}

{
  const missingSchema = v2CheckerFixture();
  rmSync(join(missingSchema.root, "backlog/schemas/transition-v2.schema.json"));
  const missingSchemaResult = checkBacklogState(missingSchema.root, {
    checkCommit: false,
    authorizeAmendment: () => AUTHORITY_VALID,
  });
  const driftedSchema = v2CheckerFixture();
  write(driftedSchema.root, "backlog/schemas/transition-v2.schema.json", `${JSON.stringify({ $id: TRANSITION_SCHEMA })}\n`);
  const driftedSchemaResult = checkBacklogState(driftedSchema.root, {
    checkCommit: false,
    authorizeAmendment: () => AUTHORITY_VALID,
  });

  const missingDisposition = v2CheckerFixture();
  const missingReference = missingDisposition.fixture.events[4].evidence.reference;
  rmSync(join(missingDisposition.root, missingReference));
  const missingDispositionResult = checkBacklogState(missingDisposition.root, {
    checkCommit: false,
    authorizeAmendment: () => AUTHORITY_VALID,
  });

  const symlinkDisposition = v2CheckerFixture();
  const symlinkReference = symlinkDisposition.fixture.events[4].evidence.reference;
  rmSync(join(symlinkDisposition.root, symlinkReference));
  write(symlinkDisposition.root, "specs/sprint-nova-epic/evidence/backlog/symlink-target.json", DISPOSITION_BYTES);
  symlinkSync("symlink-target.json", join(symlinkDisposition.root, symlinkReference));
  const symlinkDispositionResult = checkBacklogState(symlinkDisposition.root, {
    checkCommit: false,
    authorizeAmendment: () => AUTHORITY_VALID,
  });

  const nonFileDisposition = v2CheckerFixture();
  const nonFileReference = nonFileDisposition.fixture.events[4].evidence.reference;
  rmSync(join(nonFileDisposition.root, nonFileReference));
  mkdirSync(join(nonFileDisposition.root, nonFileReference));
  const nonFileDispositionResult = checkBacklogState(nonFileDisposition.root, {
    checkCommit: false,
    authorizeAmendment: () => AUTHORITY_VALID,
  });

  const digestMismatch = v2CheckerFixture();
  write(digestMismatch.root, digestMismatch.fixture.events[4].evidence.reference, "tampered disposition\n");
  const digestMismatchResult = checkBacklogState(digestMismatch.root, {
    checkCommit: false,
    authorizeAmendment: () => AUTHORITY_VALID,
  });
  const dispositionResults = [
    missingDispositionResult,
    symlinkDispositionResult,
    nonFileDispositionResult,
    digestMismatchResult,
  ];
  check("BS39 v2 checker fails closed for missing/drifted schema and missing, symlinked, non-file, or digest-mismatched dispositions",
    !missingSchemaResult.ok
      && missingSchemaResult.findings.some((finding) => finding.includes("transition-v2.schema.json"))
      && !driftedSchemaResult.ok
      && driftedSchemaResult.findings.some((finding) => finding.includes(`$id ${TRANSITION_V2_SCHEMA}`))
      && dispositionResults.every((result) => !result.ok
        && result.findings.some((finding) => V2_DOMAIN_PREFIX.test(finding))),
    [
      ...missingSchemaResult.findings,
      ...driftedSchemaResult.findings,
      ...dispositionResults.flatMap((result) => result.findings),
    ].join("; "));
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
