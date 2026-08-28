#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-backlog-sprint-assignment.mjs -- enumerate backlog items by their optional `sprint`
 * declaration and report how many items carry none.
 *
 * WHY THIS EXISTS (NVA-SPRINTFIELD-1 / backlog/evidence/2026-07-24-sprint-portfolio-assignment.md).
 * The `pipeline.backlog-item.v1` item contract now accepts an OPTIONAL `sprint` frontmatter
 * field (plugins/pipeline-core/lib/backlog-state.mjs, `ITEM_OPTIONAL`). "How many open items
 * belong to sprint X" was, before this field existed, an archaeology exercise across
 * backlog/evidence/2026-07-24-sprint-portfolio-assignment.md -- a snapshot nobody has updated
 * since July, while every item created since carries no assignment at all. This script turns
 * that question into a command.
 *
 * A sibling of check-backlog-state.mjs (same items-dir enumeration, same frontmatter parser),
 * deliberately scoped narrower: it never reads the transition ledger, closure evidence, or
 * generated projections -- only the one field this task adds.
 *
 * The closed value set (`BACKLOG_SPRINTS`, backlog-state.mjs) is the set of planning-window
 * slugs docs/adr/0043-post-go-live-sprint-model.md formally reserves as data, and nothing else
 * -- see that constant's own comment for the exact ADR lines and why "Cyborg" is deliberately
 * excluded.
 *
 * THREE OUTCOMES, NOT TWO (PO decision, 2026-08-27). A `sprint` field can be a planning-window
 * slug, the literal `none`, or absent, and this script keeps all three apart:
 *   - a slug from BACKLOG_SPRINTS         -> counted in `counts[<slug>]`
 *   - `none` (BACKLOG_SPRINT_NONE)        -> counted in `none`/`noneItems`, never in `counts`
 *   - absent                              -> counted in `undeclared`, and a FAILURE while `open`
 * `none` is an explicit statement that the item belongs to no planning window; it is neither a
 * sprint (so it never inflates a window's count) nor an omission (so it never fails the gate).
 * Collapsing `none` into either of the other two buckets is what this separation exists to
 * prevent: merged with "absent", the mandatory-declaration rule below could no longer tell a
 * decision from a forgotten field, which is its entire purpose.
 *
 * EXIT CODES (revised NVA-SPRINTGATE-1): 0 = every declared `sprint` value (if any) is an
 * admissible declaration (a BACKLOG_SPRINTS slug or `none`), and every `open` item declares one.
 * A `closed`/`in_progress`/`rejected`/`deferred` item with no `sprint` is still counted and
 * reported, never a failure -- that stays the human triage pass this comment used to describe as
 * "not happened yet". It has now happened for the one status that matters mechanically: commit
 * 6d81b33b (2026-08-27) declared a sprint for all 47 items that were `open` at the time, so the
 * rule for `open` items graduates from reported to enforced. 1 = at least one `open` item
 * declares no `sprint`, at least one item declares a `sprint` value outside the admissible set,
 * or the items directory itself could not be enumerated/read.
 *
 * Usage:
 *   node plugins/pipeline-core/scripts/check-backlog-sprint-assignment.mjs
 *   node plugins/pipeline-core/scripts/check-backlog-sprint-assignment.mjs --json
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BACKLOG_SPRINTS, BACKLOG_SPRINT_DECLARATIONS, BACKLOG_SPRINT_NONE, parseBacklogItem,
} from "../lib/backlog-state.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ITEMS_DIR = "backlog/items";

/**
 * Enumerate every current backlog item (`backlog/items/*.md`, excluding `TEMPLATE.md`) and
 * classify it by its optional `sprint` frontmatter value. No ledger, no closure evidence, no
 * projection -- one `readdirSync` plus one `readFileSync`/`parseBacklogItem` per item.
 */
export function checkBacklogSprintAssignment(root = DEFAULT_ROOT) {
  const findings = [];
  const counts = Object.fromEntries(BACKLOG_SPRINTS.map((sprint) => [sprint, 0]));
  const undeclaredItems = [];
  const openUndeclaredItems = [];
  // `none` is kept out of `counts` on purpose -- see THREE OUTCOMES above.
  const noneItems = [];
  let itemNames = [];
  try {
    itemNames = readdirSync(join(root, ITEMS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "TEMPLATE.md")
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    return { ok: false, findings: [`${ITEMS_DIR} is missing or unreadable: ${error.message}`], counts, none: 0, noneItems, undeclared: 0, undeclaredItems, openUndeclared: 0, openUndeclaredItems, total: 0 };
  }
  for (const name of itemNames) {
    const repoPath = `${ITEMS_DIR}/${name}`;
    let text;
    try {
      text = readFileSync(join(root, repoPath), "utf8");
    } catch (error) {
      findings.push(`${repoPath} is missing or unreadable: ${error.message}`);
      continue;
    }
    const parsed = parseBacklogItem(text, { path: repoPath });
    const sprint = parsed.item?.metadata?.sprint;
    if (sprint === undefined) {
      undeclaredItems.push(repoPath);
      // NVA-SPRINTGATE-1: an `open` item with no `sprint` declaration is a failure -- every
      // other status keeps today's report-only behaviour (see EXIT CODES above).
      if (parsed.item?.metadata?.status === "open") {
        openUndeclaredItems.push(repoPath);
        findings.push(`${repoPath}: status is open but declares no sprint`);
      }
      continue;
    }
    if (!BACKLOG_SPRINT_DECLARATIONS.includes(sprint)) {
      findings.push(`${repoPath}: sprint ${JSON.stringify(sprint)} is not in the closed set (${BACKLOG_SPRINT_DECLARATIONS.join(", ")})`);
      continue;
    }
    // An explicit "no planning window": admissible, reported on its own line, and
    // never folded into a sprint's count or into `undeclared`.
    if (sprint === BACKLOG_SPRINT_NONE) {
      noneItems.push(repoPath);
      continue;
    }
    counts[sprint] += 1;
  }
  return {
    ok: findings.length === 0,
    findings,
    counts,
    none: noneItems.length,
    noneItems,
    undeclared: undeclaredItems.length,
    undeclaredItems,
    openUndeclared: openUndeclaredItems.length,
    openUndeclaredItems,
    total: itemNames.length,
  };
}

function main(argv) {
  const json = argv.includes("--json");
  const result = checkBacklogSprintAssignment();
  if (json) {
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.check-backlog-sprint-assignment.v1", ...result }, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }
  const lines = [
    `backlog items enumerated: ${result.total}`,
    ...BACKLOG_SPRINTS.map((sprint) => `- ${sprint}: ${result.counts[sprint]}`),
    `- ${BACKLOG_SPRINT_NONE} (declared as belonging to no planning window): ${result.none}`,
    `- undeclared: ${result.undeclared}`,
    `- undeclared and open (failing): ${result.openUndeclared}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  if (result.findings.length > 0) {
    process.stdout.write(`Findings (${result.findings.length}):\n`);
    for (const finding of result.findings) process.stdout.write(`  - ${finding}\n`);
  }
  return result.ok ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));
