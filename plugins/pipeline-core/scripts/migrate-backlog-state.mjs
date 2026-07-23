#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * One-time, explicit migration from the historical Markdown backlog dialect
 * to the canonical ledger dialect. It preserves bodies and scheduling fields,
 * records only a baseline status observation, and never closes an item.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ITEM_SCHEMA,
  TRANSITION_SCHEMA,
  canonicalJson,
  parseBacklogItem,
  projectBacklog,
  renderBacklogItem,
  transitionHash,
} from "../lib/backlog-state.mjs";
import { writeBacklogProjections } from "./check-backlog-state.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ITEMS = join(ROOT, "backlog", "items");
const LEGACY_STATUS = Object.freeze({ new: "open", open: "open", accepted: "in_progress", "in-progress": "in_progress", in_progress: "in_progress" });

function idFromName(name) {
  const slug = name.replace(/^\d{4}-\d{2}-\d{2}-/u, "").replace(/\.md$/u, "");
  return `pipeline.${slug}`;
}

function readLegacyItems(root = ROOT) {
  const directory = join(root, "backlog", "items");
  const findings = [];
  const entries = readdirSync(directory).filter((name) => name.endsWith(".md") && name !== "TEMPLATE.md").sort();
  const items = [];
  for (const name of entries) {
    const path = `backlog/items/${name}`;
    const source = readFileSync(join(root, path), "utf8");
    const parsed = parseBacklogItem(source, { path });
    const metadata = parsed.item?.metadata ?? {};
    const status = LEGACY_STATUS[metadata.status];
    if (!status) findings.push(`${path}: unsupported legacy status ${String(metadata.status)}`);
    if (!metadata.type || !metadata.created || !metadata.source) findings.push(`${path}: missing migratable type/created/source`);
    if (metadata.status === "closed" || metadata.closed_at || metadata.closure_commit) findings.push(`${path}: closed legacy records require a reviewed explicit migration and are not auto-migrated`);
    if (findings.length > 0 && !status) continue;
    const migrated = {
      schema: ITEM_SCHEMA,
      id: idFromName(name),
      type: metadata.type,
      owner: typeof metadata.owner === "string" && metadata.owner.startsWith("project:") ? metadata.owner : "pipeline",
      status,
      created: metadata.created,
      source: metadata.source,
    };
    for (const key of ["tracking", "due", "expires"]) if (typeof metadata[key] === "string") migrated[key] = metadata[key];
    items.push({ path, source, item: { path, metadata: migrated, body: parsed.item?.body ?? "" }, status });
  }
  return { findings, items };
}

function baselineEvents(items, commit, at) {
  let previousHash = null;
  return items.map(({ item }, index) => {
    const event = {
      schema: TRANSITION_SCHEMA,
      sequence: index + 1,
      id: item.metadata.id,
      from: null,
      to: item.metadata.status,
      at,
      actor: "backlog-migration",
      reason: "Record the pre-existing legacy backlog status during canonical ledger migration; no implementation or closure is claimed.",
      evidence: { kind: "baseline-migration", commit, reference: item.path },
      previousHash,
      entryHash: "",
    };
    event.entryHash = transitionHash(event);
    previousHash = event.entryHash;
    return event;
  });
}

export function planBacklogMigration(root = ROOT, { commit = null, at = new Date().toISOString().slice(0, 10) } = {}) {
  const loaded = readLegacyItems(root);
  if (loaded.findings.length > 0) return { ok: false, findings: loaded.findings, items: [], events: [] };
  const head = commit ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/u.test(head)) return { ok: false, findings: ["migration baseline commit is not a full lowercase Git OID"], items: [], events: [] };
  const events = baselineEvents(loaded.items, head, at);
  return { ok: true, findings: [], items: loaded.items, events, commit: head, at, projection: projectBacklog(loaded.items.map(({ item }) => item), events) };
}

export function applyBacklogMigration(root = ROOT, options = {}) {
  const plan = planBacklogMigration(root, options);
  if (!plan.ok) return { ...plan, wrote: false };
  const ledgerPath = join(root, "backlog", "transitions.ndjson");
  if (existsSync(ledgerPath)) return { ok: false, findings: ["backlog/transitions.ndjson already exists; migration is one-time and will not overwrite it"], wrote: false };
  const before = new Map(plan.items.map(({ path, source }) => [path, source]));
  for (const path of ["backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"]) {
    if (existsSync(join(root, path))) before.set(path, readFileSync(join(root, path), "utf8"));
  }
  const written = [];
  try {
    for (const { path, item } of plan.items) { writeFileSync(join(root, path), renderBacklogItem(item)); written.push(path); }
    writeFileSync(ledgerPath, `${plan.events.map((event) => canonicalJson(event)).join("\n")}\n`); written.push("backlog/transitions.ndjson");
    const projections = writeBacklogProjections(root, { checkCommit: false });
    if (!projections.ok) throw new Error(projections.findings.join("; "));
    return { ...plan, wrote: true };
  } catch (error) {
    for (const path of written) {
      if (before.has(path)) writeFileSync(join(root, path), before.get(path));
    }
    for (const path of ["backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"]) {
      if (before.has(path)) writeFileSync(join(root, path), before.get(path));
      else { try { unlinkSync(join(root, path)); } catch { /* best-effort rollback */ } }
    }
    return { ...plan, ok: false, findings: [`backlog migration failed: ${error.message}`], wrote: false };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--write");
  const plan = planBacklogMigration();
  if (!plan.ok) { for (const finding of plan.findings) console.error(`FAIL backlog migration: ${finding}`); process.exitCode = 2; }
  else if (!write) console.log(`Backlog migration plan: ${plan.items.length} item(s), no files written. Re-run with --write after review.`);
  else {
    const result = applyBacklogMigration();
    if (!result.ok) { for (const finding of result.findings) console.error(`FAIL backlog migration: ${finding}`); process.exitCode = 2; }
    else console.log(`Backlog migration applied: ${result.items.length} item(s), baseline ledger and projections written.`);
  }
}
