#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Fail-closed backlog authority check and deterministic projection writer.
 *
 * Default mode only detects schema, transition, closure-evidence, and
 * projection drift.  `--write` is the explicit, local writer used after a
 * deliberate item transition; it never changes Markdown items or the ledger.
 */
import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  INDEX_SCHEMA,
  ITEM_SCHEMA,
  SENTINEL_RECOVERY_CATALOG_SCHEMA,
  TRANSITION_SCHEMA,
  parseBacklogItem,
  parseTransitionLedger,
  planBacklogTransition,
  projectBacklog,
  renderBacklogItem,
  transitionHash,
  validateProjectClosureReadback,
  validateSentinelRecoveryCatalog,
  validateTransitionLedger,
} from "../lib/backlog-state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const ITEMS_DIR = "backlog/items";
const LEDGER_PATH = "backlog/transitions.ndjson";
const STATUS_PATH = "backlog/STATUS.md";
const INDEX_PATH = "backlog/index.json";
const TRANSACTION_PATH = "backlog/.state-transaction.json";
const SENTINEL_RECOVERY_CATALOG_PATH = "backlog/sentinel-recovery-catalog.json";
const SCHEMAS = Object.freeze([
  ["backlog/schemas/item.schema.json", ITEM_SCHEMA],
  ["backlog/schemas/transition.schema.json", TRANSITION_SCHEMA],
  ["backlog/schemas/index.schema.json", INDEX_SCHEMA],
  ["backlog/schemas/sentinel-recovery.schema.json", SENTINEL_RECOVERY_CATALOG_SCHEMA],
]);

function readText(path, findings, label) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    findings.push(`${label} is missing or unreadable`);
    return null;
  }
}

function regularFile(root, repoPath) {
  if (typeof repoPath !== "string") return false;
  const full = resolve(root, repoPath);
  if (relative(root, full).startsWith("..")) return false;
  try {
    return statSync(full).isFile();
  } catch {
    return false;
  }
}

function projectReadbackFindings(root, item) {
  const { metadata } = item;
  if (metadata.owner !== metadata.closure_repository) {
    return [`${item.path}: project closure_repository must match the configured item project binding`];
  }
  const receiptPath = metadata.closure_readback;
  if (!regularFile(root, receiptPath)) return [`${item.path}: closure_readback is missing or not a regular repository file`];
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(join(root, receiptPath), "utf8"));
  } catch {
    return [`${item.path}: closure_readback must be valid JSON`];
  }
  return validateProjectClosureReadback(receipt, {
    repository: metadata.closure_repository,
    configuredRepository: metadata.owner,
    commit: metadata.closure_commit,
  }).map((error) => `${item.path}: closure_readback ${error}`);
}

function localCommitExists(root, oid) {
  const result = spawnSync("git", ["cat-file", "-e", `${oid}^{commit}`], { cwd: root, stdio: "ignore" });
  return result.status === 0;
}

function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content, { flag: "wx" });
  renameSync(temporary, path);
}

function transactionPreimage(root, path) {
  const target = join(root, path);
  return existsSync(target) ? readFileSync(target, "utf8") : null;
}

/** Persist an approved batch through one durable, recoverable preimage journal. */
export function writeBacklogTransaction(root = DEFAULT_ROOT, targets, { atomicWrite: replace = atomicWrite } = {}) {
  if (!Array.isArray(targets) || targets.length === 0
    || targets.some((target) => !target || !validTransactionPath(target.path) || typeof target.after !== "string")
    || new Set(targets.map((target) => target.path)).size !== targets.length) {
    return { ok: false, recovered: false, findings: ["backlog transaction targets are invalid"] };
  }
  const journalPath = join(root, TRANSACTION_PATH);
  const journal = {
    schema: "pipeline.backlog-transaction.v1",
    files: targets.map((target) => ({ path: target.path, before: transactionPreimage(root, target.path) })),
  };
  try {
    writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, { flag: "wx" });
    for (const target of targets) replace(join(root, target.path), target.after);
    unlinkSync(journalPath);
    return { ok: true, recovered: false, findings: [] };
  } catch (error) {
    const recovery = recoverBacklogTransaction(root);
    return {
      ok: false,
      recovered: recovery.recovered,
      findings: [`backlog transaction write failed: ${error.message}`, ...recovery.findings],
    };
  }
}

function validTransactionPath(path) {
  return path === LEDGER_PATH || path === STATUS_PATH || path === INDEX_PATH
    || /^backlog\/items\/[A-Za-z0-9._-]+\.md$/u.test(path);
}

/** Restore the pre-transition snapshot after a crash or a failed multi-file write. */
export function recoverBacklogTransaction(root = DEFAULT_ROOT) {
  const journalPath = join(root, TRANSACTION_PATH);
  if (!existsSync(journalPath)) return { ok: true, recovered: false, findings: [] };
  let journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8"));
  } catch {
    return { ok: false, recovered: false, findings: [`${TRANSACTION_PATH} is unreadable or invalid JSON`] };
  }
  if (journal?.schema !== "pipeline.backlog-transaction.v1" || !Array.isArray(journal.files)
    || journal.files.length === 0 || journal.files.some((entry) => !entry || !validTransactionPath(entry.path) || !(typeof entry.before === "string" || entry.before === null))) {
    return { ok: false, recovered: false, findings: [`${TRANSACTION_PATH} has an invalid recovery shape`] };
  }
  try {
    for (const entry of journal.files) {
      const target = join(root, entry.path);
      if (entry.before === null) {
        if (existsSync(target)) unlinkSync(target);
      } else {
        atomicWrite(target, entry.before);
      }
    }
    unlinkSync(journalPath);
    return { ok: true, recovered: true, findings: [] };
  } catch (error) {
    return { ok: false, recovered: false, findings: [`${TRANSACTION_PATH} recovery failed: ${error.message}`] };
  }
}

function checkSchemas(root, findings) {
  for (const [repoPath, expectedId] of SCHEMAS) {
    if (repoPath === "backlog/schemas/sentinel-recovery.schema.json" && !existsSync(join(root, SENTINEL_RECOVERY_CATALOG_PATH))) continue;
    const text = readText(join(root, repoPath), findings, repoPath);
    if (text === null) continue;
    try {
      const schema = JSON.parse(text);
      if (schema?.$id !== expectedId) findings.push(`${repoPath} must declare $id ${expectedId}`);
    } catch {
      findings.push(`${repoPath} is not valid JSON`);
    }
  }
}

/** Build the validated data plus projections without writing anything. */
export function loadBacklogState(root = DEFAULT_ROOT, { checkCommit = true } = {}) {
  const findings = [];
  if (existsSync(join(root, TRANSACTION_PATH))) findings.push(`${TRANSACTION_PATH} requires recovery before backlog state can be trusted`);
  checkSchemas(root, findings);
  if (existsSync(join(root, SENTINEL_RECOVERY_CATALOG_PATH))) {
    const catalogText = readText(join(root, SENTINEL_RECOVERY_CATALOG_PATH), findings, SENTINEL_RECOVERY_CATALOG_PATH);
    if (catalogText !== null) {
      try {
        findings.push(...validateSentinelRecoveryCatalog(JSON.parse(catalogText)).map((finding) => `${SENTINEL_RECOVERY_CATALOG_PATH}: ${finding}`));
      } catch {
        findings.push(`${SENTINEL_RECOVERY_CATALOG_PATH} is not valid JSON`);
      }
    }
  }

  let itemNames = [];
  try {
    itemNames = readdirSync(join(root, ITEMS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "TEMPLATE.md")
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    findings.push(`${ITEMS_DIR} is missing or unreadable`);
  }
  if (itemNames.length === 0) findings.push(`${ITEMS_DIR} must contain at least one current item`);

  const items = [];
  for (const name of itemNames) {
    const repoPath = `${ITEMS_DIR}/${name}`;
    const text = readText(join(root, repoPath), findings, repoPath);
    if (text === null) continue;
    const parsed = parseBacklogItem(text, { path: repoPath });
    findings.push(...parsed.errors);
    // Keep invalid records out of downstream projections and ledger joins. The
    // parser has already recorded their exact findings; attempting to sort or
    // project an item without a canonical id would otherwise throw and hide the
    // fail-closed backlog diagnosis behind a TypeError.
    if (parsed.item && parsed.ok) items.push(parsed.item);
  }

  const ledgerText = readText(join(root, LEDGER_PATH), findings, LEDGER_PATH);
  const ledger = parseTransitionLedger(ledgerText ?? "", { path: LEDGER_PATH });
  findings.push(...ledger.errors);
  const commitExists = checkCommit ? (oid) => localCommitExists(root, oid) : null;
  findings.push(...validateTransitionLedger(ledger.events, items, { commitExists }));

  for (const item of items) {
    const metadata = item.metadata;
    if (metadata.status === "closed" && !regularFile(root, metadata.closure_evidence)) {
      findings.push(`${item.path}: closure_evidence is missing or not a regular repository file`);
    }
    if (metadata.status === "closed" && (metadata.owner.startsWith("project:") || metadata.closure_repository?.startsWith("project:"))) {
      findings.push(...projectReadbackFindings(root, item));
    }
  }

  const projection = findings.length === 0 ? projectBacklog(items, ledger.events) : null;
  return { ok: findings.length === 0, findings, items, events: ledger.events, projection };
}

/** Detect checked-in generated projection drift. */
export function checkBacklogState(root = DEFAULT_ROOT, options = {}) {
  const loaded = loadBacklogState(root, options);
  const findings = [...loaded.findings];
  if (loaded.projection) {
    for (const [repoPath, expected] of [[STATUS_PATH, loaded.projection.statusText], [INDEX_PATH, loaded.projection.indexText]]) {
      const actual = readText(join(root, repoPath), findings, repoPath);
      if (actual !== null && actual !== expected) findings.push(`${repoPath} projection drift; regenerate with check-backlog-state --write`);
    }
  }
  return { ...loaded, ok: findings.length === 0, findings };
}

/** The sole projection writer; it refuses to write from invalid source data. */
export function writeBacklogProjections(root = DEFAULT_ROOT, options = {}) {
  const loaded = loadBacklogState(root, options);
  if (!loaded.ok) return { ...loaded, wrote: false };
  writeFileSync(join(root, STATUS_PATH), loaded.projection.statusText);
  writeFileSync(join(root, INDEX_PATH), loaded.projection.indexText);
  return { ...loaded, wrote: true };
}

function recoveryItem(entry, catalog) {
  return {
    path: `backlog/items/2026-07-19-${entry.id.slice("pipeline.".length)}.md`,
    metadata: {
      schema: ITEM_SCHEMA,
      id: entry.id,
      type: entry.type,
      owner: "pipeline",
      status: entry.status,
      created: catalog.recoveredAt,
      source: catalog.source,
      tracking: "Sentinel recovery baseline; no completion claim.",
    },
    body: `\n# ${entry.id}\n\nThis public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.\n`,
  };
}

function recoveryEvent(entry, catalog, sequence, previousHash, commit, reference) {
  const event = {
    schema: TRANSITION_SCHEMA,
    sequence,
    id: entry.id,
    from: null,
    to: entry.status,
    at: catalog.recoveredAt,
    actor: "sentinel-recovery",
    reason: "Record the public Sentinel baseline status; no implementation, verification, or closure is claimed.",
    evidence: { kind: "sentinel-backlog-recovery", commit, reference },
    previousHash,
    entryHash: "",
  };
  event.entryHash = transitionHash(event);
  return event;
}

/** Plan the Sentinel baseline import without changing the working tree. */
export function planSentinelBacklogRecovery(root = DEFAULT_ROOT, { catalogPath = SENTINEL_RECOVERY_CATALOG_PATH, evidenceCommit = null, checkCommit = true } = {}) {
  const current = checkBacklogState(root, { checkCommit });
  if (!current.ok) return { ...current, wrote: false, targets: [] };
  const findings = [];
  const catalogText = readText(join(root, catalogPath), findings, catalogPath);
  let catalog = null;
  if (catalogText !== null) {
    try {
      catalog = JSON.parse(catalogText);
      findings.push(...validateSentinelRecoveryCatalog(catalog).map((finding) => `${catalogPath}: ${finding}`));
    } catch {
      findings.push(`${catalogPath} is not valid JSON`);
    }
  }
  const commit = evidenceCommit ?? (() => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
  })();
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/u.test(commit) || (checkCommit && !localCommitExists(root, commit))) findings.push("Sentinel recovery requires a reachable local evidence commit");
  if (catalog) {
    const currentIds = new Set(current.items.map((item) => item.metadata.id));
    for (const entry of catalog.items) if (currentIds.has(entry.id)) findings.push(`${catalogPath}: id already exists in the current backlog: ${entry.id}`);
  }
  if (findings.length > 0 || !catalog) return { ...current, ok: false, findings, wrote: false, targets: [] };

  const additions = catalog.items.map((entry) => recoveryItem(entry, catalog));
  const nextItems = [...current.items, ...additions];
  const events = [...current.events];
  let previousHash = events.length === 0 ? null : events.at(-1).entryHash;
  for (const entry of catalog.items) {
    const event = recoveryEvent(entry, catalog, events.length + 1, previousHash, commit, catalogPath);
    events.push(event);
    previousHash = event.entryHash;
  }
  findings.push(...validateTransitionLedger(events, nextItems, { commitExists: checkCommit ? (oid) => localCommitExists(root, oid) : null }));
  const projection = findings.length === 0 ? projectBacklog(nextItems, events) : null;
  if (!projection) return { ...current, ok: false, findings, wrote: false, targets: [] };
  const targets = [
    ...additions.map((entry) => ({ path: entry.path, after: renderBacklogItem(entry) })),
    { path: LEDGER_PATH, after: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` },
    { path: STATUS_PATH, after: projection.statusText },
    { path: INDEX_PATH, after: projection.indexText },
  ];
  return { ...current, ok: true, findings: [], catalog, items: nextItems, events, projection, targets, wrote: false };
}

/** Apply the Sentinel baseline import only after an explicit caller decision. */
export function applySentinelBacklogRecovery(root = DEFAULT_ROOT, options = {}) {
  const planned = planSentinelBacklogRecovery(root, options);
  if (!planned.ok) return { ...planned, wrote: false };
  const transaction = writeBacklogTransaction(root, planned.targets, options);
  return transaction.ok
    ? { ...planned, ok: true, findings: [], wrote: true }
    : { ...planned, ok: false, findings: transaction.findings, wrote: false };
}

const SENTINEL_WINDOWS_SCOPE_SOURCE = "specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md";
const SENTINEL_WINDOWS_SCOPE_DATE = "2026-07-22";
const SENTINEL_WINDOWS_SCOPE_IDS = Object.freeze([
  "pipeline.windows-runtime-baseline-containment",
  "pipeline.windows-directory-durability",
  "pipeline.windows-private-state-assurance",
  "pipeline.windows-verify-reproducibility",
  "pipeline.windows-trusted-tool-resolution",
]);

function validateSentinelScopeExtension(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["scope extension must be an object"];
  const expected = ["schema", "source", "admittedAt", "items"].sort();
  const actual = Object.keys(input).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) errors.push("scope extension has unsupported or missing fields");
  if (input.schema !== "pipeline.sentinel-scope-extension.v1") errors.push("scope extension schema is invalid");
  if (input.source !== SENTINEL_WINDOWS_SCOPE_SOURCE) errors.push("scope extension source must equal the PO-approved Windows scope authority");
  if (input.admittedAt !== SENTINEL_WINDOWS_SCOPE_DATE) errors.push("scope extension admittedAt must equal the PO-approved Windows scope date");
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length !== SENTINEL_WINDOWS_SCOPE_IDS.length) errors.push("scope extension items must be the exact PO-approved Windows set");
  const ids = new Set();
  for (const entry of items) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "id,status,type") {
      errors.push("scope extension item has unsupported or missing fields");
      continue;
    }
    if (!SENTINEL_WINDOWS_SCOPE_IDS.includes(entry.id)) errors.push("scope extension item id is not PO-approved");
    if (entry.status !== "open") errors.push("scope extension item must initialize exactly open");
    if (entry.type !== "defect") errors.push("scope extension item type must equal defect");
    if (ids.has(entry.id)) errors.push(`scope extension duplicates id ${entry.id}`);
    ids.add(entry.id);
  }
  if (items.map((entry) => entry?.id).join("\n") !== SENTINEL_WINDOWS_SCOPE_IDS.join("\n")) errors.push("scope extension item order must equal the PO-approved Windows scope");
  return errors;
}

function scopeExtensionItem(entry, input) {
  return {
    path: `backlog/items/${input.admittedAt}-${entry.id.slice("pipeline.".length)}.md`,
    metadata: {
      schema: ITEM_SCHEMA,
      id: entry.id,
      type: entry.type,
      owner: "pipeline",
      status: entry.status,
      created: input.admittedAt,
      source: input.source,
      tracking: "PO-approved Sentinel scope extension; no implementation or closure claim.",
    },
    body: `\n# ${entry.id}\n\nThis public record admits a PO-approved Sentinel scope extension. It records scope and status only; it does not claim implementation, verification, or closure.\n`,
  };
}

/** Plan an explicit, append-only Sentinel scope extension without changing the working tree. */
export function planSentinelScopeExtension(root = DEFAULT_ROOT, input, { evidenceCommit = null, checkCommit = true } = {}) {
  const current = checkBacklogState(root, { checkCommit });
  const findings = [...current.findings, ...validateSentinelScopeExtension(input)];
  const commit = evidenceCommit ?? (() => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
  })();
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit) || (checkCommit && !localCommitExists(root, commit))) findings.push("Sentinel scope extension requires a reachable local evidence commit");
  const currentIds = new Set(current.items.map((item) => item.metadata.id));
  const extensionItems = Array.isArray(input?.items) ? input.items : [];
  for (const entry of extensionItems) if (entry && typeof entry === "object" && currentIds.has(entry.id)) findings.push(`scope extension id already exists in the current backlog: ${entry.id}`);
  if (findings.length > 0) return { ...current, ok: false, findings, wrote: false, targets: [] };
  const additions = extensionItems.map((entry) => scopeExtensionItem(entry, input));
  const items = [...current.items, ...additions];
  const events = [...current.events];
  let previousHash = events.at(-1)?.entryHash ?? null;
  for (const entry of extensionItems) {
    const event = { schema: TRANSITION_SCHEMA, sequence: events.length + 1, id: entry.id, from: null, to: entry.status, at: input.admittedAt, actor: "sentinel-scope-extension", reason: "Record the PO-approved Sentinel scope extension; no implementation or closure is claimed.", evidence: { kind: "sentinel-scope-extension", commit, reference: input.source }, previousHash, entryHash: "" };
    event.entryHash = transitionHash(event);
    events.push(event);
    previousHash = event.entryHash;
  }
  findings.push(...validateTransitionLedger(events, items, { commitExists: checkCommit ? (oid) => localCommitExists(root, oid) : null }));
  const projection = findings.length === 0 ? projectBacklog(items, events) : null;
  if (!projection) return { ...current, ok: false, findings, wrote: false, targets: [] };
  const targets = [...additions.map((item) => ({ path: item.path, after: renderBacklogItem(item) })), { path: LEDGER_PATH, after: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` }, { path: STATUS_PATH, after: projection.statusText }, { path: INDEX_PATH, after: projection.indexText }];
  return { ...current, ok: true, findings: [], items, events, projection, targets, wrote: false };
}

/** Apply one explicit Sentinel scope extension through the same recoverable transaction writer. */
export function applySentinelScopeExtension(root = DEFAULT_ROOT, input, options = {}) {
  const planned = planSentinelScopeExtension(root, input, options);
  if (!planned.ok) return { ...planned, wrote: false };
  const transaction = writeBacklogTransaction(root, planned.targets, options);
  return transaction.ok ? { ...planned, ok: true, findings: [], wrote: true } : { ...planned, ok: false, findings: transaction.findings, wrote: false };
}

/**
 * Sanctioned status writer. It prepares all four derived files first, stores a
 * durable preimage journal, atomically replaces each individual file, and
 * removes the journal only after the full set is present. A later recovery
 * deterministically restores the complete pre-transition state.
 */
export function applyBacklogTransition(root = DEFAULT_ROOT, input, options = {}) {
  const current = checkBacklogState(root, options);
  if (!current.ok) return { ...current, wrote: false, transition: null };
  const planned = planBacklogTransition(current.items, current.events, input);
  if (!planned.ok) return { ...current, ok: false, findings: planned.errors, wrote: false, transition: null };
  const closing = planned.items.find((item) => item.metadata.id === input.id)?.metadata;
  if (closing?.status === "closed") {
    if (closing.closure_repository === "self" && !localCommitExists(root, closing.closure_commit)) {
      return { ...current, ok: false, findings: [`${input.id}: closure_commit is not a reachable local Git commit`], wrote: false, transition: null };
    }
    if (!regularFile(root, closing.closure_evidence)) {
      return { ...current, ok: false, findings: [`${input.id}: closure_evidence is missing or not a regular repository file`], wrote: false, transition: null };
    }
    if (closing.closure_repository.startsWith("project:")) {
      const readbackFindings = projectReadbackFindings(root, { path: input.id, metadata: closing });
      if (readbackFindings.length > 0) return { ...current, ok: false, findings: readbackFindings, wrote: false, transition: null };
    }
  }
  const changed = planned.items.find((item) => item.metadata.id === input.id);
  const targets = [
    { path: changed.path, after: renderBacklogItem(changed) },
    { path: LEDGER_PATH, after: `${planned.events.map((event) => JSON.stringify(event)).join("\n")}\n` },
    { path: STATUS_PATH, after: planned.projection.statusText },
    { path: INDEX_PATH, after: planned.projection.indexText },
  ];
  const journalPath = join(root, TRANSACTION_PATH);
  const journal = {
    schema: "pipeline.backlog-transaction.v1",
    files: targets.map((target) => ({ path: target.path, before: readFileSync(join(root, target.path), "utf8") })),
  };
  try {
    writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, { flag: "wx" });
    for (const target of targets) atomicWrite(join(root, target.path), target.after);
    unlinkSync(journalPath);
    return { ...current, ok: true, findings: [], wrote: true, transition: planned.event };
  } catch (error) {
    const recovery = recoverBacklogTransaction(root);
    return {
      ...current,
      ok: false,
      findings: [`backlog transition write failed: ${error.message}`, ...recovery.findings],
      wrote: false,
      transition: null,
    };
  }
}

function cli() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const unsupported = args.filter((arg) => arg !== "--write");
  if (unsupported.length > 0) {
    console.error(`Usage: node plugins/pipeline-core/scripts/check-backlog-state.mjs [--write]`);
    process.exit(2);
  }
  const result = write ? writeBacklogProjections() : checkBacklogState();
  if (!result.ok) {
    for (const finding of result.findings) console.error(`FAIL backlog state: ${finding}`);
    process.exit(2);
  }
  console.log(write
    ? "Backlog state valid; deterministic STATUS.md and index.json regenerated."
    : "Backlog state, transition ledger, closure evidence, and generated projections are valid.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli();
