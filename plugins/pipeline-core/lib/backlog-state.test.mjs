#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ITEM_SCHEMA,
  PROJECT_CLOSURE_READBACK_SCHEMA,
  TRANSITION_SCHEMA,
  canonicalJson,
  parseBacklogItem,
  parseTransitionLedger,
  projectBacklog,
  renderBacklogItem,
  transitionHash,
  validateBacklogItem,
  validateProjectClosureReadback,
  validateSentinelRecoveryCatalog,
  validateTransitionLedger,
} from "./backlog-state.mjs";
import {
  applyBacklogTransition,
  applySentinelBacklogRecovery,
  applySentinelScopeExtension,
  checkBacklogState,
  planSentinelBacklogRecovery,
  planSentinelScopeExtension,
  recoverBacklogTransaction,
  writeBacklogProjections,
} from "../scripts/check-backlog-state.mjs";

let passed = 0;
let failed = 0;
const roots = [];
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

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
