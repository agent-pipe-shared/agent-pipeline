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
  TRANSITION_SCHEMA,
  parseBacklogItem,
  parseTransitionLedger,
  planBacklogTransition,
  projectBacklog,
  renderBacklogItem,
  validateProjectClosureReadback,
  validateTransitionLedger,
} from "../lib/backlog-state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const ITEMS_DIR = "backlog/items";
const LEDGER_PATH = "backlog/transitions.ndjson";
const STATUS_PATH = "backlog/STATUS.md";
const INDEX_PATH = "backlog/index.json";
const TRANSACTION_PATH = "backlog/.state-transaction.json";
const SCHEMAS = Object.freeze([
  ["backlog/schemas/item.schema.json", ITEM_SCHEMA],
  ["backlog/schemas/transition.schema.json", TRANSITION_SCHEMA],
  ["backlog/schemas/index.schema.json", INDEX_SCHEMA],
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
    || journal.files.length === 0 || journal.files.some((entry) => !entry || !validTransactionPath(entry.path) || typeof entry.before !== "string")) {
    return { ok: false, recovered: false, findings: [`${TRANSACTION_PATH} has an invalid recovery shape`] };
  }
  try {
    for (const entry of journal.files) atomicWrite(join(root, entry.path), entry.before);
    unlinkSync(journalPath);
    return { ok: true, recovered: true, findings: [] };
  } catch (error) {
    return { ok: false, recovered: false, findings: [`${TRANSACTION_PATH} recovery failed: ${error.message}`] };
  }
}

function checkSchemas(root, findings) {
  for (const [repoPath, expectedId] of SCHEMAS) {
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
