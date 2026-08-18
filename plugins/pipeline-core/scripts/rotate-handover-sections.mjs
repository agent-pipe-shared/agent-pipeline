#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * rotate-handover-sections.mjs — executable form of the "session-block
 * rotation" half of close-block SKILL.md step 6c (ADR-0060 Decision 5 /
 * candidate 2 from backlog/items/2026-08-07-handover-file-has-no-rotation-obligation.md).
 *
 * Moves genuinely CLOSED `## <date> ...` session entries out of the live
 * handover file (default `docs/state.md`) into a dated archive file under
 * `docs/state-archive/`, leaving a one-line pointer in the live file. This
 * is a rotation, never a deletion: the exact original section bytes are
 * preserved verbatim in the archive.
 *
 * Rotatability is POSITIVE and fail-safe toward NOT rotating: an entry is
 * archived only when ALL of the following hold —
 *   1. it is older than the newest `retainCount` session entries (default 2,
 *      matching close-block 6c's "last 2 full session/block entries"), AND
 *   2. its heading carries no open marker ("(current)" / "(in progress)"),
 *      AND
 *   3. its heading text is not cross-referenced anywhere in the document
 *      preamble or in the never-rotatable tail sections (Operational head,
 *      Open items and next block, Observation publication queue, Re-entry,
 *      Recovery).
 * A stale/wrong open-marker or a false cross-reference match costs a few
 * unrotated sections (a rotation missed) — the fail-safe direction is
 * always toward retaining, never toward archiving something still live.
 *
 * Dry-run by default. `--apply` is required to write. Never invoke this
 * against the canonical `docs/state.md` from a session whose own work is
 * still open — only close-block's own rotation step (6c) does that, after
 * this block's close.
 *
 * Coexists by design with `handover-rotate.mjs` (close-block step 6d,
 * ADR-0066) rather than duplicating it: this script auto-selects "what
 * closed content can I safely archive" (heuristic, monthly-bucketed
 * `docs/state-archive/<YYYY-MM>.md`, pointer-line index) at ordinary close
 * time; `handover-rotate.mjs` answers "rotate exactly this section, right
 * now, on purpose" (explicit `--section-heading`, one dated file per event,
 * table-based index) for a still-OPEN block this script can never touch by
 * construction. The two archive-naming/index conventions are an accepted,
 * documented split, not an inconsistency to converge — see
 * `backlog/items/2026-08-17-two-handover-rotation-mechanisms-use-different-archive-conventions.md`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");

export const DEFAULT_RETAIN_COUNT = 2;
export const DEFAULT_ARCHIVE_DIR = "docs/state-archive";

/** Exact headings that are never rotation candidates, regardless of age. */
export const TAIL_SECTION_HEADINGS = Object.freeze([
  "Operational head",
  "Open items and next block",
  "Observation publication queue",
  "Re-entry",
  "Recovery",
]);

const SESSION_HEADING_RE = /^##\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/;
const OPEN_MARKER_RE = /\((?:[^()]*\b(?:current|in progress)\b[^()]*)\)/i;

function splitLines(content) {
  const hasTrailingNewline = content.endsWith("\n");
  const lines = content.split("\n");
  if (hasTrailingNewline) lines.pop();
  return { lines, hasTrailingNewline };
}

function joinLines(lines, hasTrailingNewline) {
  return lines.join("\n") + (hasTrailingNewline ? "\n" : "");
}

function headingTitle(headingLine) {
  return headingLine.replace(/^##\s*/, "").trim();
}

/**
 * The topical core of a session heading: date prefix and any open marker
 * stripped off. A cross-reference in prose realistically names the topic
 * ("... the Third session work ..."), not the literal dated heading, so
 * this is what the cross-reference check matches against.
 */
function coreTitle(headingLine) {
  return headingTitle(headingLine)
    .replace(/^\d{4}-\d{2}-\d{2}\s+/, "")
    .replace(/\s*\((?:[^()]*\b(?:current|in progress)\b[^()]*)\)\s*$/i, "")
    .trim();
}

function isTailHeading(headingLine) {
  return TAIL_SECTION_HEADINGS.includes(headingTitle(headingLine));
}

/** Splits the document into a preamble (before the first `## ` heading) and an ordered list of H2 sections. */
export function splitSections(content) {
  const { lines, hasTrailingNewline } = splitLines(content);
  const headingLineIdx = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) headingLineIdx.push(i);
  }
  const preambleEnd = headingLineIdx.length ? headingLineIdx[0] : lines.length;
  const preambleLines = lines.slice(0, preambleEnd);
  const sections = headingLineIdx.map((start, k) => {
    const end = k + 1 < headingLineIdx.length ? headingLineIdx[k + 1] : lines.length;
    return { headingLine: lines[start], startLine: start, endLine: end, lines: lines.slice(start, end) };
  });
  return { preambleLines, sections, hasTrailingNewline };
}

/**
 * Computes a rotation plan without mutating anything. Returns one decision
 * per section (including tail/non-session sections, always "retain") in
 * original document order.
 */
export function planRotation(content, { retainCount = DEFAULT_RETAIN_COUNT } = {}) {
  const { preambleLines, sections } = splitSections(content);
  const preambleText = preambleLines.join("\n");
  const tailSections = sections.filter((s) => isTailHeading(s.headingLine));
  const crossReferenceCorpus = preambleText + "\n" + tailSections.map((s) => s.lines.join("\n")).join("\n");
  const sessionSections = sections.filter((s) => SESSION_HEADING_RE.test(s.headingLine) && !isTailHeading(s.headingLine));

  const decisions = sections.map((section) => {
    if (isTailHeading(section.headingLine)) {
      return { section, action: "retain", reason: "tail-section" };
    }
    if (!SESSION_HEADING_RE.test(section.headingLine)) {
      return { section, action: "retain", reason: "non-session-heading" };
    }
    const sessionIndex = sessionSections.indexOf(section);
    if (sessionIndex < retainCount) {
      return { section, action: "retain", reason: `newest-${retainCount}` };
    }
    if (OPEN_MARKER_RE.test(section.headingLine)) {
      return { section, action: "retain", reason: "open-marker" };
    }
    const core = coreTitle(section.headingLine);
    if (core.length > 0 && crossReferenceCorpus.includes(core)) {
      return { section, action: "retain", reason: "cross-referenced" };
    }
    return { section, action: "archive", reason: "closed" };
  });

  return { preambleLines, decisions };
}

function archiveMonthFor(section) {
  const match = section.headingLine.match(SESSION_HEADING_RE);
  return match[1].slice(0, 7); // YYYY-MM
}

function pointerLine(section, archivePath, rotatedDate) {
  return `- **${headingTitle(section.headingLine)}** — archived to \`${archivePath}\` on ${rotatedDate} (\`rotate-handover-sections.mjs\`); see the archive file for the full original section.`;
}

/**
 * Applies a rotation plan. Pure function: returns the new live-file content
 * plus a Map of archivePath -> array of verbatim original section texts
 * (each entry is the exact original `## ...` heading + body, unmodified).
 * Does not touch the filesystem.
 */
export function applyRotation(content, { retainCount = DEFAULT_RETAIN_COUNT, archiveDir = DEFAULT_ARCHIVE_DIR, rotatedDate = new Date().toISOString().slice(0, 10) } = {}) {
  const { hasTrailingNewline } = splitLines(content);
  const { preambleLines, decisions } = planRotation(content, { retainCount });
  const outLines = [...preambleLines];
  const archiveGroups = new Map();

  for (const { section, action } of decisions) {
    if (action !== "archive") {
      outLines.push(...section.lines);
      continue;
    }
    const archivePath = `${archiveDir}/${archiveMonthFor(section)}.md`;
    if (!archiveGroups.has(archivePath)) archiveGroups.set(archivePath, []);
    archiveGroups.get(archivePath).push(section.lines.join("\n"));
    outLines.push(pointerLine(section, archivePath, rotatedDate));
    outLines.push("");
  }

  const newContent = joinLines(outLines, hasTrailingNewline);
  return { newContent, archiveGroups, decisions };
}

const ARCHIVE_HEADER = (archivePath) => `# Handover archive — ${archivePath}

> Append-only archive of closed \`docs/state.md\` session entries, moved
> verbatim by \`plugins/pipeline-core/scripts/rotate-handover-sections.mjs\`
> per close-block SKILL.md step 6c / ADR-0060 Decision 5. Never edited by
> hand; never read at bootstrap (this is exactly the "topical home" ADR-0060
> Decision 2 describes — reachable on demand, not part of the Goldfish
> bootstrap path). Sections below are byte-for-byte identical to their
> original \`docs/state.md\` text at the time of rotation.

`;

/** Writes rotation results to disk: the live file plus each archive file (creating/appending as needed). */
export function writeRotation(root, { livePath, newContent, archiveGroups }) {
  writeFileSync(join(root, livePath), newContent, "utf8");
  const writtenArchives = [];
  for (const [archivePath, texts] of archiveGroups) {
    const fullPath = join(root, archivePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    const exists = existsSync(fullPath);
    const prefix = exists ? readFileSync(fullPath, "utf8") : ARCHIVE_HEADER(archivePath);
    const body = texts.map((t) => t.replace(/\n*$/, "\n")).join("\n");
    const separator = prefix.endsWith("\n\n") || prefix.endsWith("\n") ? "" : "\n";
    writeFileSync(fullPath, prefix + separator + body, "utf8");
    writtenArchives.push(archivePath);
  }
  return { livePath, writtenArchives };
}

function parseArgs(argv) {
  const args = { file: "docs/state.md", retainCount: DEFAULT_RETAIN_COUNT, archiveDir: DEFAULT_ARCHIVE_DIR, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--retain-count") args.retainCount = Number(argv[++i]);
    else if (a === "--archive-dir") args.archiveDir = argv[++i];
  }
  return args;
}

if (isDirectInvocation(import.meta.url)) {
  const root = DEFAULT_ROOT;
  const args = parseArgs(process.argv.slice(2));
  const fullPath = join(root, args.file);
  if (!existsSync(fullPath)) {
    console.error(`rotate-handover-sections: ${args.file} not found`);
    process.exit(2);
  }
  const content = readFileSync(fullPath, "utf8");
  const { newContent, archiveGroups, decisions } = applyRotation(content, { retainCount: args.retainCount, archiveDir: args.archiveDir });
  const archived = decisions.filter((d) => d.action === "archive");
  const retained = decisions.filter((d) => d.action === "retain");
  console.log(`Plan: ${archived.length} section(s) to archive, ${retained.length} retained.`);
  for (const { section, reason } of archived) console.log(`  ARCHIVE: ${headingTitle(section.headingLine)} -> ${reason}`);
  if (!args.apply) {
    console.log("Dry-run only (no writes). Pass --apply to write.");
    process.exit(0);
  }
  if (archived.length === 0) {
    console.log("Nothing to rotate; live file unchanged.");
    process.exit(0);
  }
  const result = writeRotation(root, { livePath: args.file, newContent, archiveGroups });
  console.log(`Wrote ${args.file}; updated archive file(s): ${result.writtenArchives.join(", ")}`);
}
