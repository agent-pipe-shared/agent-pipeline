#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * check-state-numeric-claims.mjs -- catch a stale "N/M closed" backlog-progress
 * claim in `docs/state.md` before it survives a compaction as trusted fact.
 *
 * WHY. `docs/state.md` narrates backlog progress in running prose ("Backlog
 * now stands at **222/296 closed, 67 open, 7 in_progress**"). Nothing checks
 * that number against the actual backlog once it is written. A session's own
 * prose summary can then survive a context compaction as a trusted fact and
 * get carried forward without being re-derived from the item files -- see
 * `backlog/items/2026-08-19-backlog-status-drifts-from-code-across-
 * compaction-with-no-hardening.md`, Mode 2: a stale "15/17 Wave-4 items
 * closed" claim survived a mid-session compaction while the true figure was
 * 7/17.
 *
 * WHAT COUNTS AS "LIVE". This linter derives the live count from
 * `backlog/index.json`'s own `counts` field -- the SAME projection
 * `reconcile-backlog-ledger.mjs`/`check-backlog-state.mjs` already produce
 * from `backlog/items/*.md` + `backlog/transitions.ndjson`
 * (`projectBacklog()` in `../lib/backlog-state.mjs`). This tool does not
 * re-derive that count from the item files itself -- that would be a SECOND
 * counting method, which is the exact drift risk this file's own header
 * warns every sibling tool away from. `backlog/index.json` staying in sync
 * with the item files is `check-backlog-state.mjs`'s own "backlog-state-check"
 * verify suite's job, not this one's -- this tool trusts that gate and does
 * not duplicate it.
 *
 * WHAT SHAPE IS MATCHED, AND WHAT IS DELIBERATELY NOT. Only the exact total-
 * backlog claim shape `docs/state.md` actually uses is matched: "Backlog now
 * [stands at] **N/M closed, O open, P in_progress**". A bare "N/M closed"
 * without that open/in_progress breakdown -- e.g. "**Wave 4 stands at 12/17
 * closed**" -- is a SUBSET claim (17 is Wave 4's own item count, not the
 * total backlog size) and is never matched: there is no live count to check
 * a wave-scoped subset against without inventing a second counting method
 * this tool has no way to derive from `backlog/index.json` alone.
 *
 * THE LIVE-VS-HISTORICAL DISTINGUISHING RULE (stated once, here, per the
 * dispatch that built this tool). `docs/state.md` is an append-only running
 * log: a claim written earlier in the file is not wrong at the moment it is
 * superseded by a later paragraph -- exactly the "15/17 Wave-4-closed" ->
 * "12/17 closed" correction pattern this backlog item's own Description
 * names -- so an earlier claim must never be flagged as a current-state
 * claim just because it no longer matches today's count. Two rules narrow
 * "every matched claim" down to "the current claim, if one exists":
 *
 *   1. Any claim at or after the file's first heading matching /archived/i
 *      is historical. This is `docs/state.md`'s OWN convention (see its
 *      "## Archived history" section and its own sentence: "this paragraph
 *      is deliberately NOT yet archived since it is the live open state") --
 *      not an invented signal.
 *   2. Among the claims that remain (i.e. not yet archived), only the LAST
 *      one by file position is a claim about "now". Every earlier one is a
 *      snapshot the file itself already superseded by writing a later
 *      paragraph below it -- out of scope by construction, not silently
 *      accepted as passing.
 *
 * If no claim survives both rules (the file has no "Backlog now" claim at
 * all, or every one of them is archived), there is nothing to check and this
 * tool reports no findings -- it never invents a claim to hold the file to.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const STATE_PATH = "docs/state.md";
const INDEX_PATH = "backlog/index.json";

const CLAIM_RE = /backlog now(?:\s+stands at)?\s+\*\*\s*(\d+)\s*\/\s*(\d+)\s+closed\s*,\s*(\d+)\s+open\s*,\s*(\d+)\s+in_progress\s*\*\*/giu;
const ARCHIVED_HEADING_RE = /^#{1,6}\s*archived\b/imu;

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

/** Read `docs/state.md`'s current-state "Backlog now ... closed" claim, if one exists. */
export function currentBacklogClaim(root) {
  const stateText = readFileSync(join(root, STATE_PATH), "utf8");
  const archivedAt = ARCHIVED_HEADING_RE.exec(stateText)?.index ?? Infinity;
  const claims = [...stateText.matchAll(CLAIM_RE)].filter((match) => match.index < archivedAt);
  if (claims.length === 0) return null;
  const match = claims.at(-1);
  const [raw, closedStr, totalStr, openStr, inProgressStr] = match;
  return {
    raw: raw.replace(/\s+/gu, " ").trim(),
    line: lineNumber(stateText, match.index),
    closed: Number(closedStr),
    total: Number(totalStr),
    open: Number(openStr),
    inProgress: Number(inProgressStr),
  };
}

/** The live backlog projection `docs/state.md`'s claim is checked against. */
export function liveBacklogCounts(root) {
  const index = JSON.parse(readFileSync(join(root, INDEX_PATH), "utf8"));
  const closed = index.counts?.closed ?? 0;
  const open = index.counts?.open ?? 0;
  const inProgress = index.counts?.in_progress ?? 0;
  return { closed, open, inProgress, total: closed + open + inProgress };
}

/** Cross-check `docs/state.md`'s current-state claim against the live backlog count. */
export function auditStateNumericClaims(root = DEFAULT_ROOT) {
  const claim = currentBacklogClaim(root);
  if (claim === null) return [];
  const live = liveBacklogCounts(root);
  const label = `${STATE_PATH}:${claim.line}: current-state claim "${claim.raw}"`;
  const findings = [];
  if (claim.closed !== live.closed) findings.push(`${label} claims ${claim.closed} closed; live ${INDEX_PATH} counts ${live.closed} closed`);
  if (claim.total !== live.total) findings.push(`${label} claims ${claim.total} total items; live ${INDEX_PATH} totals ${live.total} (open ${live.open} + in_progress ${live.inProgress} + closed ${live.closed})`);
  if (claim.open !== live.open) findings.push(`${label} claims ${claim.open} open; live ${INDEX_PATH} counts ${live.open} open`);
  if (claim.inProgress !== live.inProgress) findings.push(`${label} claims ${claim.inProgress} in_progress; live ${INDEX_PATH} counts ${live.inProgress} in_progress`);
  return findings;
}

if (isDirectInvocation(import.meta.url)) {
  const findings = auditStateNumericClaims();
  if (findings.length > 0) {
    for (const finding of findings) console.error(`FAIL state numeric claim: ${finding}`);
    console.error(`docs/state.md's current backlog-progress claim is stale: ${findings.length} finding(s).`);
    process.exit(2);
  }
  console.log("docs/state.md's current backlog-progress claim (or the absence of one) matches the live backlog/index.json count.");
  process.exit(0);
}
