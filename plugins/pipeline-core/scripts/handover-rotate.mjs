#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * handover-rotate.mjs -- ADR-0066's extraction-then-archive rotation
 * mechanism (NVA-HANDOVER-ROT-1 Piece B). Mechanically splits one or more
 * NAMED `## <heading>` sections out of a project's configured handover file
 * (default `docs/state.md`, `lib/handover-rotation.mjs`'s
 * `resolveHandoverConfig()`) into a new, self-contained, append-only-once
 * archive file under `docs/state-archive/`, and rewrites the live file's
 * head to keep only a "## Archived history" index plus the still-open
 * content -- never guessing which sections carry a durable rule (ADR-0066
 * Decision 6: purely mechanical, explicit block-title selection only).
 *
 * Distinct from, and NOT a replacement for, the pre-existing
 * `rotate-handover-sections.mjs` (ADR-0060 Decision 5 candidate 2, already
 * wired into close-block SKILL.md step 6c): that script auto-selects
 * "closed" session-dated sections by retain-count/cross-reference heuristics
 * and archives to a monthly `docs/state-archive/<YYYY-MM>.md`. This script
 * implements ADR-0066's later, PO-amended design instead: an explicit
 * `--section-heading` selection, one archive file per rotation event named
 * `<ISO-date>--<short-slug>.md`, a table-based "Archived history" index, and
 * the one-time-extraction acknowledgment gate below. The two mechanisms
 * coexist in this repository BY DECISION, not as an unresolved gap: they
 * answer genuinely different questions ("what closed content can I safely
 * auto-archive" vs. "rotate exactly this, right now, on purpose" against a
 * still-open block) and keep their own archive-naming/index conventions
 * rather than converging -- see
 * `backlog/items/2026-08-17-two-handover-rotation-mechanisms-use-different-archive-conventions.md`.
 *
 * ADR-0066 Decision 6 (the one-time extraction gate): this script REFUSES to
 * run any rotation -- typed error, zero mutation -- unless a
 * repository-local marker confirms `--acknowledge-extraction-done` has been
 * explicitly passed at least once for this repository. Record the
 * acknowledgment once (`--acknowledge-extraction-done`, no other args); it
 * persists under `.git/agent-pipeline/handover-rotation/` and is never
 * re-asked on later invocations.
 *
 * Never deletes content: every byte removed from the live file exists
 * verbatim in the archive file it was moved to (round-trip losslessness is
 * pinned by this script's own test suite).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { HANDOVER_MEASUREMENT_SCHEMA, resolveHandoverConfig } from "../lib/handover-rotation.mjs";

export const ARCHIVE_DIR = "docs/state-archive";
const ACK_MARKER_RELATIVE = join(".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json");
const ACK_MARKER_SCHEMA = "pipeline.handover-rotation-extraction-ack.v1";
export const HANDOVER_ROTATE_SCRIPT_PATH = fileURLToPath(import.meta.url);

export class HandoverRotationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HandoverRotationError";
    this.code = code;
  }
}

// -- ADR-0066 Decision 6: the one-time extraction-acknowledgment marker --

function ackMarkerPath(root) {
  return join(root, ACK_MARKER_RELATIVE);
}

/** Read-only: has `--acknowledge-extraction-done` ever been recorded for this repository? */
export function isExtractionAcknowledged(root) {
  const markerPath = ackMarkerPath(root);
  if (!existsSync(markerPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf8"));
    return parsed?.schema === ACK_MARKER_SCHEMA && typeof parsed?.acknowledgedAt === "string";
  } catch {
    return false;
  }
}

/**
 * Records the acknowledgment marker (idempotent: a pre-existing marker is
 * left untouched and its original content is returned, never overwritten
 * with a new timestamp -- "checked once per repository", not re-stamped).
 */
export function recordExtractionAcknowledged(root, { now = () => new Date().toISOString() } = {}) {
  const markerPath = ackMarkerPath(root);
  if (existsSync(markerPath)) {
    try {
      const parsed = JSON.parse(readFileSync(markerPath, "utf8"));
      if (parsed?.schema === ACK_MARKER_SCHEMA) return parsed;
    } catch {
      // fall through and rewrite a corrupt marker
    }
  }
  mkdirSync(dirname(markerPath), { recursive: true });
  const record = { schema: ACK_MARKER_SCHEMA, acknowledgedAt: now() };
  writeFileSync(markerPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

function assertExtractionAcknowledged(root) {
  if (isExtractionAcknowledged(root)) return;
  throw new HandoverRotationError(
    "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED",
    "Rotation refused: the one-time durable-rule extraction pass (ADR-0066 Decision 7) has not been "
      + "acknowledged for this repository. This script never auto-detects embedded durable rules "
      + "(Decision 6) -- extraction is real, judgment-heavy human/Elephant work, done once, before any "
      + "rotation runs for real. Run `--acknowledge-extraction-done` once you have completed that pass.",
  );
}

// -- Mechanical section splitting (never inspects content for durability) --

function splitLines(content) {
  const hasTrailingNewline = content.endsWith("\n");
  const lines = content.split("\n");
  if (hasTrailingNewline) lines.pop();
  return { lines, hasTrailingNewline };
}

function joinLines(lines, hasTrailingNewline) {
  return lines.join("\n") + (hasTrailingNewline ? "\n" : "");
}

const H2_HEADING_RE = /^##\s+(.*)$/;
export const ARCHIVED_HISTORY_HEADING = "Archived history";

function headingTitle(headingLine) {
  const match = headingLine.match(H2_HEADING_RE);
  return match ? match[1].trim() : null;
}

/** Splits the live file into a preamble (everything before the first `## ` heading) and ordered H2 sections. */
export function splitHandoverSections(content) {
  const { lines, hasTrailingNewline } = splitLines(content);
  const headingLineIdx = [];
  for (let i = 0; i < lines.length; i++) {
    if (H2_HEADING_RE.test(lines[i])) headingLineIdx.push(i);
  }
  const preambleEnd = headingLineIdx.length ? headingLineIdx[0] : lines.length;
  const preambleLines = lines.slice(0, preambleEnd);
  const sections = headingLineIdx.map((start, k) => {
    const end = k + 1 < headingLineIdx.length ? headingLineIdx[k + 1] : lines.length;
    return { title: headingTitle(lines[start]), startLine: start, endLine: end, lines: lines.slice(start, end) };
  });
  return { preambleLines, sections, hasTrailingNewline };
}

/**
 * Pure planning: locates the requested `sectionHeadings` among the live
 * file's H2 sections. Every requested heading must match EXACTLY one
 * section's title (byte-for-byte, whitespace-trimmed) -- an unmatched
 * heading is a typed error, never a silent no-op, since silently rotating
 * nothing while the caller believes a block was archived is worse than
 * refusing outright.
 */
export function planHandoverRotation(content, { sectionHeadings }) {
  if (!Array.isArray(sectionHeadings) || sectionHeadings.length === 0) {
    throw new HandoverRotationError("HANDOVER-ROTATION-NO-SECTIONS", "At least one --section-heading is required.");
  }
  const { preambleLines, sections, hasTrailingNewline } = splitHandoverSections(content);
  const archivedHistorySection = sections.find((s) => s.title === ARCHIVED_HISTORY_HEADING) ?? null;
  const archiveSections = [];
  const seen = new Set();
  for (const heading of sectionHeadings) {
    const match = sections.find((s) => s.title === heading);
    if (!match) {
      throw new HandoverRotationError(
        "HANDOVER-ROTATION-SECTION-NOT-FOUND",
        `No "## ${heading}" section was found in the live handover file. No mutation performed.`,
      );
    }
    if (match === archivedHistorySection) {
      throw new HandoverRotationError(
        "HANDOVER-ROTATION-ARCHIVED-HISTORY-IMMUTABLE",
        'The "## Archived history" index section itself can never be a rotation target.',
      );
    }
    if (!seen.has(match)) {
      seen.add(match);
      archiveSections.push(match);
    }
  }
  const remainingSections = sections.filter((s) => !seen.has(s) && s !== archivedHistorySection);
  return { preambleLines, hasTrailingNewline, archiveSections, remainingSections, archivedHistorySection };
}

// -- Archive file construction (ADR-0066 Decision 1: self-contained, provenance header, verbatim) --

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60) || "block";
}

export function buildArchiveFileContent({ archiveSections, handoverPath, rotationDate, summary }) {
  const titles = archiveSections.map((s) => s.title).join(", ");
  const header = [
    `# Handover archive -- ${titles}`,
    "",
    `> Rotated from \`${handoverPath}\` on ${rotationDate} by ` +
      "`plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).",
    `> Section(s) archived: ${titles}.`,
    summary ? `> Summary: ${summary}` : null,
    "> Append-only once written; never edited by hand. Content below is byte-for-byte",
    `> identical to its original \`${handoverPath}\` text at the time of rotation.`,
    "",
  ].filter((line) => line !== null).join("\n");
  const body = archiveSections.map((s) => s.lines.join("\n")).join("\n\n");
  return `${header}\n${body}\n`;
}

// -- Live-file rewrite (ADR-0066 Decision 2: header unchanged, index table, remaining content) --

function archivedHistoryTableRows(sectionLines) {
  // sectionLines includes the "## Archived history" heading line itself at index 0.
  const rows = [];
  for (const line of sectionLines) {
    if (/^\|.*\|$/.test(line) && !/^\|\s*Date range\s*\|/i.test(line) && !/^\|\s*-+\s*\|/.test(line)) {
      rows.push(line);
    }
  }
  return rows;
}

export function buildArchivedHistorySection({ existingSection, newRow }) {
  const existingRows = existingSection ? archivedHistoryTableRows(existingSection.lines) : [];
  const rows = [newRow, ...existingRows]; // newest first
  return [
    `## ${ARCHIVED_HISTORY_HEADING}`,
    "",
    "| Date range | Summary | Archive |",
    "|---|---|---|",
    ...rows,
    "",
  ];
}

export function rewriteLiveFileContent({ preambleLines, hasTrailingNewline, remainingSections, archivedHistoryLines }) {
  const outLines = [...preambleLines, ...archivedHistoryLines];
  for (const section of remainingSections) outLines.push(...section.lines);
  return joinLines(outLines, hasTrailingNewline);
}

// -- Orchestration --

// NVA-HANDOVER-ROT-2 F1: --rotation-date becomes part of the archive file name, so it is
// validated against a strict YYYY-MM-DD shape before use -- this also closes a path-traversal
// vector (e.g. `--rotation-date ../../../etc/evil`).
const ROTATION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure planning entry point: computes everything (archive content, new live
 * content, archive path) without touching the filesystem. Kept separate from
 * `rotateHandover()` below so the round-trip/losslessness property can be
 * asserted directly against pure strings in tests.
 */
export function planRotation({
  liveContent, handoverPath, sectionHeadings, summary, dateRange, slug, rotationDate,
}) {
  if (typeof rotationDate !== "string" || !ROTATION_DATE_RE.test(rotationDate)) {
    throw new HandoverRotationError(
      "HANDOVER-ROTATION-INVALID-DATE",
      `--rotation-date must be a strict YYYY-MM-DD value; got: ${JSON.stringify(rotationDate)}.`,
    );
  }
  const plan = planHandoverRotation(liveContent, { sectionHeadings });
  // NVA-HANDOVER-ROT-2 F1: --slug is ALWAYS passed through slugify(), never used raw -- a
  // caller-supplied slug is exactly as untrusted as the auto-derived one, and slugify() is what
  // keeps the archive file name a flat, traversal-proof token either way.
  const resolvedSlug = slugify(slug ?? plan.archiveSections[0].title);
  const archivePath = `${ARCHIVE_DIR}/${rotationDate}--${resolvedSlug}.md`;
  const archiveContent = buildArchiveFileContent({
    archiveSections: plan.archiveSections, handoverPath, rotationDate, summary,
  });
  const linkTarget = toPortableRelativeLink(relative(dirname(handoverPath), archivePath));
  const resolvedDateRange = dateRange ?? rotationDate;
  const newRow = `| ${resolvedDateRange} | ${summary} | [${archivePath}](${linkTarget}) |`;
  const archivedHistoryLines = buildArchivedHistorySection({ existingSection: plan.archivedHistorySection, newRow });
  const newLiveContent = rewriteLiveFileContent({
    preambleLines: plan.preambleLines,
    hasTrailingNewline: plan.hasTrailingNewline,
    remainingSections: plan.remainingSections,
    archivedHistoryLines,
  });
  return {
    archivePath, archiveContent, newLiveContent,
    archivedTitles: plan.archiveSections.map((s) => s.title),
  };
}

/** relative() returns OS-native separators; normalize to "/" for a portable markdown link. */
function toPortableRelativeLink(relativePath) {
  return relativePath.split(/[\\/]+/u).join("/");
}

/**
 * NVA-HANDOVER-ROT-2 F1: defense-in-depth containment check. Resolves `candidatePath` and
 * confirms it stays strictly inside `root` -- rejects with a typed error rather than silently
 * clamping if a caller-supplied path (--handover-path, or the resolved archive path) resolves
 * outside the repository root. No file is read or written before this check runs.
 */
function assertPathWithinRoot(root, candidatePath, label) {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidatePath);
  const rootWithSep = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(rootWithSep)) {
    throw new HandoverRotationError(
      "HANDOVER-ROTATION-PATH-ESCAPES-ROOT",
      `${label} resolves outside the repository root (${resolvedRoot}): ${resolvedCandidate}. No file was read or written.`,
    );
  }
  return resolvedCandidate;
}

/** Full I/O orchestration used by the CLI: read, gate on acknowledgment, plan, write. */
export function rotateHandover({
  root, handoverPath, sectionHeadings, summary, dateRange, slug, rotationDate = new Date().toISOString().slice(0, 10),
}) {
  assertExtractionAcknowledged(root);
  const resolvedHandoverPath = handoverPath ?? resolveHandoverConfig({ rootDir: root }).path;
  const fullHandoverPath = join(root, resolvedHandoverPath);
  assertPathWithinRoot(root, fullHandoverPath, "The handover path (--handover-path)");
  if (!existsSync(fullHandoverPath)) {
    throw new HandoverRotationError("HANDOVER-ROTATION-FILE-NOT-FOUND", `${resolvedHandoverPath} not found under ${root}.`);
  }
  const liveContent = readFileSync(fullHandoverPath, "utf8");
  const plan = planRotation({
    liveContent, handoverPath: resolvedHandoverPath, sectionHeadings, summary, dateRange, slug, rotationDate,
  });
  const fullArchivePath = join(root, plan.archivePath);
  assertPathWithinRoot(root, fullArchivePath, "The resolved archive path");
  mkdirSync(dirname(fullArchivePath), { recursive: true });
  if (existsSync(fullArchivePath)) {
    throw new HandoverRotationError(
      "HANDOVER-ROTATION-ARCHIVE-EXISTS",
      `${plan.archivePath} already exists. Archive files are append-only-once-written and never overwritten; choose a different --slug.`,
    );
  }
  writeFileSync(fullArchivePath, plan.archiveContent, "utf8");
  writeFileSync(fullHandoverPath, plan.newLiveContent, "utf8");
  return plan;
}

// -- CLI --

function parseArgs(argv) {
  const args = { sectionHeadings: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--acknowledge-extraction-done") args.acknowledge = true;
    else if (a === "--status") args.status = true;
    else if (a === "--section-heading") args.sectionHeadings.push(argv[++i]);
    else if (a === "--summary") args.summary = argv[++i];
    else if (a === "--date-range") args.dateRange = argv[++i];
    else if (a === "--slug") args.slug = argv[++i];
    else if (a === "--rotation-date") args.rotationDate = argv[++i];
    else if (a === "--handover-path") args.handoverPath = argv[++i];
  }
  return args;
}

if (isDirectInvocation(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root) {
    console.error("handover-rotate: --root <repository-root> is required");
    process.exit(1);
  }
  const root = resolve(args.root);
  try {
    if (args.status) {
      // Read-only: NVA-HANDOVER-ROT-2 F4. Never records the marker, only reports it -- the
      // close-block ritual checks this first so `--acknowledge-extraction-done` stays a
      // deliberate human/Elephant judgment call, never a routine automated step.
      const acknowledged = isExtractionAcknowledged(root);
      console.log(acknowledged
        ? `Extraction acknowledgment: RECORDED for ${root}.`
        : `Extraction acknowledgment: NOT recorded for ${root}. Rotation is refused (ADR-0066 Decision 6) until `
          + "--acknowledge-extraction-done is run -- only once the one-time durable-rule extraction pass (ADR-0066 "
          + "Decision 7) is genuinely complete for this repository. This is a human/Elephant judgment call, never "
          + "an automated step of routine closing.");
      process.exit(0);
    }
    if (args.acknowledge) {
      const record = recordExtractionAcknowledged(root);
      console.log(`Extraction acknowledgment recorded for ${root} at ${record.acknowledgedAt} (schema ${HANDOVER_MEASUREMENT_SCHEMA} handover measurement in effect).`);
      process.exit(0);
    }
    if (!args.summary) {
      console.error("handover-rotate: --summary \"<one-line summary>\" is required for a rotation");
      process.exit(1);
    }
    const plan = rotateHandover({
      root,
      handoverPath: args.handoverPath,
      sectionHeadings: args.sectionHeadings,
      summary: args.summary,
      dateRange: args.dateRange,
      slug: args.slug,
      rotationDate: args.rotationDate,
    });
    console.log(`Archived ${plan.archivedTitles.join(", ")} -> ${plan.archivePath}`);
  } catch (error) {
    if (error instanceof HandoverRotationError) {
      console.error(`${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
