#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * reconcile-backlog-ledger.mjs — record, in the transition ledger, the status each
 * backlog item file already asserts.
 *
 * WHY THIS IS ITS OWN TOOL. Neither existing tool can do this:
 *
 *   - `migrate-backlog-state.mjs` is the ONE-TIME migration from the historical
 *     Markdown dialect into the ledger dialect. It refuses outright once
 *     `backlog/transitions.ndjson` exists ("migration is one-time and will not
 *     overwrite it"), which it does. Re-running it produces a wall of
 *     "closed legacy records require a reviewed explicit migration" findings that
 *     describe its own inapplicability, not a data problem.
 *   - `applyBacklogTransition()` refuses while `checkBacklogState()` is not ok — and
 *     it is not ok precisely because of the drift being repaired. Deadlock. It also
 *     derives `from` from the ITEM's status, so for an item whose file already reads
 *     `in_progress` it would plan `in_progress -> closed`, never the missing
 *     `open -> in_progress` step that is actually absent from the ledger.
 *
 * The drift itself has one cause: backlog items were created and advanced by editing
 * Markdown directly instead of through a ledger transition. The files are the honest
 * record of what happened; the ledger simply never heard about it.
 *
 * WHAT THIS TOOL CLAIMS, AND WHAT IT DOES NOT. It records the item's OWN asserted
 * status and, for a closure, the item's OWN closure fields. It claims no
 * implementation, no review, and no closure of its own — the reason string on every
 * emitted event says exactly that. It invents nothing: a closure whose commit is
 * unreachable or whose evidence file is missing STOPS the reconciliation for that
 * item rather than being recorded, because a ledger entry pointing at evidence that
 * does not exist is worse than a missing entry.
 *
 * Usage:
 *   node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs            # plan (read-only)
 *   node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate # write
 *
 * Exit 0 plan: a plan exists (or nothing to do). Exit 2: at least one item cannot be
 * reconciled honestly; nothing is written, and the blocked items are named.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRANSITION_SCHEMA,
  canonicalJson,
  parseBacklogItem,
  parseTransitionLedger,
  projectBacklog,
  transitionHash,
} from "../lib/backlog-state.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const ITEMS_DIR = "backlog/items";
const LEDGER_PATH = "backlog/transitions.ndjson";
const STATUS_PATH = "backlog/STATUS.md";
const INDEX_PATH = "backlog/index.json";
const JOURNAL_PATH = "backlog/.reconcile-transaction.json";
const ACTOR = "backlog-reconciliation";
const ORDER = Object.freeze(["open", "in_progress", "closed"]);
const REASON =
  "Record in the ledger the status this backlog item file already asserts. " +
  "The item file is the pre-existing record; this entry claims no implementation, " +
  "no review, and no closure of its own.";
const CLOSED_REASON =
  "Record in the ledger the closure this backlog item file's own frontmatter " +
  "already documents (closed_at, closure_repository, closure_commit, closure_evidence). " +
  "This entry attests the sync to that pre-existing closure record, not a new " +
  "implementation or review of its own.";

function readItems(root) {
  const items = [];
  const findings = [];
  for (const name of readdirSync(join(root, ITEMS_DIR)).filter((n) => n.endsWith(".md") && n !== "TEMPLATE.md").sort()) {
    const path = `${ITEMS_DIR}/${name}`;
    const parsed = parseBacklogItem(readFileSync(join(root, path), "utf8"), { path });
    if (!parsed.item?.metadata?.id) {
      findings.push(`${path}: no usable item id`);
      continue;
    }
    items.push({ path, metadata: parsed.item.metadata });
  }
  return { items, findings };
}

function commitExists(root, commit) {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function regularFile(root, relPath) {
  try {
    const info = lstatSync(join(root, relPath));
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Every closure claim must resolve before it may enter the ledger. */
function closureFindings(root, item) {
  const m = item.metadata;
  const out = [];
  for (const key of ["closed_at", "closure_repository", "closure_commit", "closure_evidence"]) {
    if (typeof m[key] !== "string" || m[key].trim() === "") out.push(`${item.path}: closed item is missing ${key}`);
  }
  if (out.length > 0) return out;
  if (m.closure_repository === "self" && !commitExists(root, m.closure_commit)) {
    out.push(`${item.path}: closure_commit ${m.closure_commit} does not exist in this repository`);
  }
  if (!regularFile(root, m.closure_evidence)) {
    out.push(`${item.path}: closure_evidence ${m.closure_evidence} is not a regular repository file`);
  }
  return out;
}

function headCommit(root) {
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    return /^[a-f0-9]{40}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function planBacklogReconciliation(root = DEFAULT_ROOT, { at = null, commit = null } = {}) {
  const { items, findings } = readItems(root);
  const baseline = commit ?? headCommit(root);
  if (baseline === null) {
    return { ok: false, findings: [...findings, "reconciliation baseline HEAD is not a full lowercase Git OID"], planned: [], events: [], items };
  }
  // An absent or empty ledger is a project that has items but has never recorded a
  // transition — the very case this tool exists for, not a malformed ledger.
  const ledgerText = existsSync(join(root, LEDGER_PATH)) ? readFileSync(join(root, LEDGER_PATH), "utf8") : "";
  const parsedLedger = ledgerText.trim() === ""
    ? { events: [], errors: [] }
    : parseTransitionLedger(ledgerText, { path: LEDGER_PATH });
  const events = parsedLedger.events ?? [];
  if ((parsedLedger.errors ?? []).length > 0) {
    return { ok: false, findings: [...findings, ...parsedLedger.errors], planned: [], events, items };
  }

  const ledgerFinal = new Map();
  for (const event of events) ledgerFinal.set(event.id, event.to);

  const date = at ?? new Date().toISOString().slice(0, 10);
  const planned = [];
  const chain = [...events];
  const blocked = [...findings];

  for (const item of items) {
    const target = item.metadata.status;
    const current = ledgerFinal.get(item.metadata.id) ?? null;
    if (current === target) continue;
    const from = current === null ? -1 : ORDER.indexOf(current);
    const to = ORDER.indexOf(target);
    if (to === -1) {
      blocked.push(`${item.path}: unknown status ${String(target)}`);
      continue;
    }
    if (to < from) {
      blocked.push(`${item.path}: file status ${target} is BEHIND the ledger's ${current}; a ledger entry is never rewound`);
      continue;
    }
    if (target === "closed") {
      const issues = closureFindings(root, item);
      if (issues.length > 0) {
        blocked.push(...issues);
        continue;
      }
    }
    for (let step = from + 1; step <= to; step += 1) {
      const event = {
        schema: TRANSITION_SCHEMA,
        sequence: chain.length + 1,
        id: item.metadata.id,
        from: step === 0 ? null : ORDER[step - 1],
        to: ORDER[step],
        at: date,
        actor: ACTOR,
        reason: ORDER[step] === "closed" ? CLOSED_REASON : REASON,
        // A closing entry's evidence commit is the item's OWN recorded closure
        // commit — the checker binds the two, and a reconciliation must not
        // substitute the reconciling HEAD for the commit that did the work.
        evidence: {
          kind: "item-file-reconciliation",
          commit: ORDER[step] === "closed" ? item.metadata.closure_commit : baseline,
          reference: item.path,
        },
        previousHash: chain.length === 0 ? null : chain.at(-1).entryHash,
        entryHash: "",
      };
      event.entryHash = transitionHash(event);
      chain.push(event);
      planned.push(event);
    }
  }

  return {
    ok: blocked.length === 0,
    findings: blocked,
    planned,
    events: chain,
    items,
    projection: blocked.length === 0
      ? projectBacklog(items.map((item) => ({ metadata: item.metadata })), chain)
      : null,
  };
}

export function applyBacklogReconciliation(root = DEFAULT_ROOT, options = {}) {
  const plan = planBacklogReconciliation(root, options);
  if (!plan.ok) return { ...plan, wrote: false };
  if (plan.planned.length === 0) return { ...plan, wrote: false };
  // APPEND ONLY. Re-serialising the whole chain through canonicalJson would rewrite
  // existing entries' BYTES (key order normalises), and an append-only hash-chained
  // audit ledger must not have its history rewritten — the hashes would still verify,
  // which is exactly what makes that failure mode quiet. It also invalidates every
  // content-bound external reference into the file, e.g. the .gitleaksignore
  // false-positive fingerprints, which bind path:rule:line:column.
  const existing = existsSync(join(root, LEDGER_PATH)) ? readFileSync(join(root, LEDGER_PATH), "utf8") : "";
  const appended = `${plan.planned.map((event) => canonicalJson(event)).join("\n")}\n`;
  const targets = [
    { path: LEDGER_PATH, after: existing.trim() === "" ? appended : `${existing.replace(/\n*$/u, "\n")}${appended}` },
    { path: STATUS_PATH, after: plan.projection.statusText },
    { path: INDEX_PATH, after: plan.projection.indexText },
  ];
  const journalPath = join(root, JOURNAL_PATH);
  const before = targets.map((target) => ({ path: target.path, before: readFileSync(join(root, target.path), "utf8") }));
  writeFileSync(journalPath, `${JSON.stringify({ schema: "pipeline.backlog-reconcile-transaction.v1", files: before })}\n`, { flag: "wx" });
  try {
    for (const target of targets) writeFileSync(join(root, target.path), target.after);
    unlinkSync(journalPath);
    return { ...plan, wrote: true };
  } catch (error) {
    for (const entry of before) writeFileSync(join(root, entry.path), entry.before);
    try { unlinkSync(journalPath); } catch { /* best-effort */ }
    return { ...plan, ok: false, findings: [`backlog reconciliation failed: ${error.message}`], wrote: false };
  }
}

if (isDirectInvocation(import.meta.url)) {
  const args = process.argv.slice(2);
  const activate = args.includes("--activate");
  const unsupported = args.filter((arg) => arg !== "--activate");
  if (unsupported.length > 0) {
    console.error("Usage: node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs [--activate]");
    process.exit(2);
  }
  const result = activate ? applyBacklogReconciliation() : planBacklogReconciliation();
  for (const finding of result.findings) console.error(`BLOCKED ${finding}`);
  if (!result.ok) {
    console.error(`Backlog reconciliation blocked: ${result.findings.length} finding(s). Nothing was written.`);
    process.exit(2);
  }
  const byItem = new Map();
  for (const event of result.planned) byItem.set(event.id, (byItem.get(event.id) ?? 0) + 1);
  console.log(result.planned.length === 0
    ? "Backlog ledger already records every item's asserted status; nothing to reconcile."
    : `${activate ? "Recorded" : "Would record"} ${result.planned.length} transition(s) across ${byItem.size} item(s).`);
  for (const [id, count] of [...byItem].sort()) console.log(`  ${id}: ${count} transition(s)`);
  process.exit(0);
}
