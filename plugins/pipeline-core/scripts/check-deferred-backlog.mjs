#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only visibility report for terminally deferred defect items.
 *
 * Deferred remains a terminal backlog status. This report does not reinterpret
 * it as active work and never writes an item or ledger event. Findings about
 * age, due dates, and revisit conditions are informational; only unreadable or
 * invalid inputs make the command fail.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBacklogItem } from "../lib/backlog-state.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ITEMS_DIR = "backlog/items";

function calendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? "")) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : null;
}

export function extractRevisitCondition(body) {
  const folded = String(body ?? "").replace(/\s+/gu, " ").trim();
  const explicit = /condition to revisit:\s*(.+?)(?=\s+-?\s*(?:\*\*)?(?:assignment(?:\s+\(if accepted\))?|date)(?:\*\*)?:|$)/iu.exec(folded)?.[1]?.trim();
  if (explicit) return explicit;
  const trigger = /review trigger\s*=\s*["“]?([^"”\n]+)["”]?/iu.exec(folded)?.[1]?.trim();
  return trigger || null;
}

export function dueState(due, asOf) {
  if (!due) return "unscheduled";
  if (due < asOf) return "overdue";
  if (due === asOf) return "due-today";
  return "scheduled";
}

export function checkDeferredBacklog(root = DEFAULT_ROOT, { asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const asOfTime = calendarDay(asOf);
  if (asOfTime === null) {
    return { ok: false, asOf, errors: [`asOf must be an ISO calendar date, received ${JSON.stringify(asOf)}`], count: 0, summary: null, items: [] };
  }
  const errors = [];
  const items = [];
  let names;
  try {
    names = readdirSync(join(root, ITEMS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "TEMPLATE.md")
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    return { ok: false, asOf, errors: [`${ITEMS_DIR} is missing or unreadable: ${error.message}`], count: 0, summary: null, items };
  }

  for (const name of names) {
    const path = `${ITEMS_DIR}/${name}`;
    let text;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch (error) {
      errors.push(`${path} is missing or unreadable: ${error.message}`);
      continue;
    }
    const parsed = parseBacklogItem(text, { path });
    if (!parsed.ok) {
      errors.push(...parsed.errors);
      continue;
    }
    const { metadata, body } = parsed.item;
    if (metadata.status !== "deferred" || metadata.type !== "defect") continue;
    const createdTime = calendarDay(metadata.created);
    items.push({
      id: metadata.id,
      path,
      created: metadata.created,
      ageDays: Math.max(0, Math.floor((asOfTime - createdTime) / 86_400_000)),
      due: metadata.due ?? null,
      dueState: dueState(metadata.due, asOf),
      sprint: metadata.sprint ?? null,
      revisitCondition: extractRevisitCondition(body),
    });
  }

  return {
    ok: errors.length === 0,
    asOf,
    errors,
    count: items.length,
    summary: {
      overdue: items.filter((item) => item.dueState === "overdue").length,
      dueToday: items.filter((item) => item.dueState === "due-today").length,
      scheduled: items.filter((item) => item.dueState === "scheduled").length,
      unscheduled: items.filter((item) => item.dueState === "unscheduled").length,
      missingRevisitCondition: items.filter((item) => item.revisitCondition === null).length,
    },
    items,
  };
}

function parseAsOf(argv) {
  const index = argv.indexOf("--as-of");
  return index === -1 ? undefined : argv[index + 1];
}

function main(argv) {
  const result = checkDeferredBacklog(DEFAULT_ROOT, { asOf: parseAsOf(argv) });
  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.deferred-backlog-report.v1", ...result }, null, 2)}\n`);
  } else {
    process.stdout.write(`deferred defects: ${result.count} (as of ${result.asOf})\n`);
    if (result.summary) {
      process.stdout.write(`due: ${result.summary.overdue} overdue, ${result.summary.dueToday} today, ${result.summary.scheduled} scheduled, ${result.summary.unscheduled} unscheduled\n`);
      process.stdout.write(`revisit condition missing: ${result.summary.missingRevisitCondition}\n`);
    }
    for (const item of result.items) {
      process.stdout.write(`- ${item.path}: age ${item.ageDays}d; due ${item.due ?? "none"} (${item.dueState}); sprint ${item.sprint ?? "undeclared"}; revisit ${item.revisitCondition ?? "MISSING"}\n`);
    }
    for (const error of result.errors) process.stderr.write(`ERROR ${error}\n`);
  }
  return result.ok ? 0 : 2;
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));
