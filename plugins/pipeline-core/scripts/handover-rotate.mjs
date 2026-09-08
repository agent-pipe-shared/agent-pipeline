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
 * ADR-0066 Decision 6 (the section-scoped extraction gate, schema v2 as of
 * 2026-08-18): this script REFUSES to run any rotation -- typed error, zero
 * mutation -- unless EVERY section named in that rotation's `--section-heading`
 * list has been explicitly acknowledged, at its CURRENT content, via
 * `--acknowledge-extraction-done --section-heading "<title>"` (repeatable).
 * The marker records title + content-hash pairs, not a repo-wide boolean: a
 * section never acknowledged still refuses rotation, and a section edited
 * after acknowledgment but before rotation refuses again too (its hash no
 * longer matches). Persists under `.git/agent-pipeline/handover-rotation/`.
 *
 * Never deletes content: every byte removed from the live file exists
 * verbatim in the archive file it was moved to (round-trip losslessness is
 * pinned by this script's own test suite).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { HANDOVER_MEASUREMENT_SCHEMA, measureHandoverBytes, resolveHandoverConfig } from "../lib/handover-rotation.mjs";

export const ARCHIVE_DIR = "docs/state-archive";
const ACK_MARKER_RELATIVE = join(".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json");
const ACK_MARKER_SCHEMA = "pipeline.handover-rotation-extraction-ack.v2";
export const HANDOVER_ROTATE_SCRIPT_PATH = fileURLToPath(import.meta.url);

export class HandoverRotationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HandoverRotationError";
    this.code = code;
  }
}

// -- ADR-0066 Decision 6 (schema v2, amended 2026-08-18): the section-scoped,
// content-hash-bound extraction-acknowledgment marker. --
//
// Schema v1 (removed) was a repo-wide boolean: once set, it stopped gating ANY
// future rotation on extraction being done for that specific content -- a
// rotation of sections added long after the marker was set, and never
// reviewed by anyone, went through with no further check at all. Schema v2
// instead tracks exactly WHICH sections were reviewed and WHAT their content
// was at review time (a sha256 of the section's own lines, the same slice
// `splitHandoverSections`/`planHandoverRotation` already use), so a rotation
// naming a never-acknowledged section still refuses, and an edit to a section
// after acknowledgment but before rotation also re-triggers the refusal
// (content-hash mismatch -- the prior acknowledgment no longer covers the new
// bytes). An old-schema (or missing/corrupt) marker file is treated as fully
// ABSENT, never grandfathered -- this forces a real, section-scoped
// acknowledgment pass under the new semantics rather than silently trusting a
// prior repo-wide grant.

function ackMarkerPath(root) {
  return join(root, ACK_MARKER_RELATIVE);
}

/** sha256 (hex) of a section's exact line content (title heading line through its last content line). */
export function sectionContentHash(sectionLines) {
  return createHash("sha256").update(sectionLines.join("\n"), "utf8").digest("hex");
}

/** Reads the persisted v2 marker, or `null` if absent, unparsable, or not schema v2 (old-schema is treated as absent). */
function readAckMarker(root) {
  const markerPath = ackMarkerPath(root);
  if (!existsSync(markerPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf8"));
    if (parsed?.schema !== ACK_MARKER_SCHEMA || !Array.isArray(parsed?.acknowledgedSections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Read-only accessor: the currently persisted acknowledged-section records, or `[]` if absent/invalid-schema. */
export function getAcknowledgedSections(root) {
  return readAckMarker(root)?.acknowledgedSections ?? [];
}

/** Read-only: is `title` acknowledged with exactly this `contentHash` right now? */
export function isSectionExtractionAcknowledged(root, { title, contentHash }) {
  return getAcknowledgedSections(root).some((entry) => entry.title === title && entry.contentHash === contentHash);
}

/** Locates `heading` among `liveContent`'s H2 sections; throws a typed error for an unmatched heading. */
function locateSectionOrThrow(liveContent, heading) {
  const { sections } = splitHandoverSections(liveContent);
  const match = sections.find((s) => s.title === heading);
  if (!match) {
    throw new HandoverRotationError(
      "HANDOVER-ROTATION-SECTION-NOT-FOUND",
      `No "## ${heading}" section was found in the live handover file. No mutation performed.`,
    );
  }
  return match;
}

/**
 * Records (or updates) the extraction-acknowledgment marker for each heading in
 * `sectionHeadings`, computing that section's current content hash from `liveContent`
 * and upserting it (by title) into the persisted `acknowledgedSections` array -- a
 * re-acknowledgment after a fresh review replaces the prior entry's hash/timestamp for
 * the same title, it never accumulates stale duplicates. An unmatched heading is a typed
 * error, zero mutation -- mirrors `planHandoverRotation`'s existing unmatched-heading
 * pattern (never a silent no-op).
 */
export function recordExtractionAcknowledged(root, { sectionHeadings, liveContent, now = () => new Date().toISOString() }) {
  if (!Array.isArray(sectionHeadings) || sectionHeadings.length === 0) {
    throw new HandoverRotationError(
      "HANDOVER-ROTATION-NO-SECTIONS",
      "At least one --section-heading is required to acknowledge extraction.",
    );
  }
  const newEntries = sectionHeadings.map((title) => {
    const section = locateSectionOrThrow(liveContent, title);
    return { title, contentHash: sectionContentHash(section.lines), acknowledgedAt: now() };
  });
  const existing = getAcknowledgedSections(root);
  const byTitle = new Map(existing.map((entry) => [entry.title, entry]));
  for (const entry of newEntries) byTitle.set(entry.title, entry);
  const record = { schema: ACK_MARKER_SCHEMA, acknowledgedSections: [...byTitle.values()] };
  const markerPath = ackMarkerPath(root);
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return newEntries;
}

/**
 * Gates a rotation naming `sectionHeadings`: every one of them must be acknowledged, by
 * title AND current content hash, against `liveContent`. If ANY section fails, throws ONE
 * typed error naming ALL failing section titles -- a rotation spanning multiple sections
 * where only some are acknowledged fails closed entirely, never a partial rotation of just
 * the acknowledged subset (same "never a silent partial success" ethos as
 * `planHandoverRotation`'s unmatched-heading behavior).
 */
export function assertSectionsExtractionAcknowledged(root, { sectionHeadings, liveContent }) {
  const failing = [];
  for (const title of sectionHeadings) {
    const section = locateSectionOrThrow(liveContent, title);
    const hash = sectionContentHash(section.lines);
    if (!isSectionExtractionAcknowledged(root, { title, contentHash: hash })) failing.push(title);
  }
  if (failing.length === 0) return;
  throw new HandoverRotationError(
    "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED",
    "Rotation refused: the one-time durable-rule extraction pass (ADR-0066 Decision 7) has not been "
      + "acknowledged for the following section(s) at their CURRENT content "
      + `(ADR-0066 Decision 6, schema v2): ${failing.map((t) => `"${t}"`).join(", ")}. This script never `
      + "auto-detects embedded durable rules -- extraction is real, judgment-heavy human/Elephant work, done "
      + "once per section, before that section is ever rotated for real. A section edited after a prior "
      + "acknowledgment but before rotation also re-triggers this refusal (its content hash no longer matches "
      + "what was reviewed). Run `--acknowledge-extraction-done --section-heading \"<title>\"` for each section "
      + "above once its extraction pass is genuinely complete. No rotation was performed (fails closed for the "
      + "entire requested set, not just the unacknowledged sections).",
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

// A rotated section can carry a bare-relative markdown link (e.g. `adr/0051-foo.md`) that
// resolved correctly from `handoverPath`'s own directory. ARCHIVE_DIR is not necessarily the
// same directory depth as `handoverPath`, so the identical relative target can silently break
// once the content moves -- confirmed live 2026-08-18 (`docs/state.md`'s "adr/0051-..." link
// broke once its section moved one level deeper into `docs/state-archive/`). Absolute paths,
// URLs/schemes, and same-document anchors are left untouched; only the link TARGET is rewritten,
// never link text or any other content.
const MARKDOWN_LINK_TARGET_RE = /\]\(([^)\s][^)]*)\)/gu;
const EXTERNAL_OR_ANCHOR_LINK_RE = /^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu;

export function adjustRelativeLinksForArchiveDepth(sectionLines, { handoverPath, archivePath }) {
  const fromDir = dirname(handoverPath);
  const toDir = dirname(archivePath);
  if (fromDir === toDir) return sectionLines;
  return sectionLines.map((line) => line.replace(MARKDOWN_LINK_TARGET_RE, (whole, target) => {
    if (EXTERNAL_OR_ANCHOR_LINK_RE.test(target)) return whole;
    const hashIndex = target.indexOf("#");
    const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? "" : target.slice(hashIndex);
    const rewritten = toPortableRelativeLink(relative(toDir, join(fromDir, pathPart)));
    return `](${rewritten}${fragment})`;
  }));
}

export function buildArchiveFileContent({ archiveSections, handoverPath, archivePath, rotationDate, summary }) {
  const titles = archiveSections.map((s) => s.title).join(", ");
  let linksAdjusted = false;
  const body = archiveSections.map((s) => {
    const adjustedLines = adjustRelativeLinksForArchiveDepth(s.lines, { handoverPath, archivePath });
    if (adjustedLines.some((line, i) => line !== s.lines[i])) linksAdjusted = true;
    return adjustedLines.join("\n");
  }).join("\n\n");
  const header = [
    `# Handover archive -- ${titles}`,
    "",
    `> Rotated from \`${handoverPath}\` on ${rotationDate} by ` +
      "`plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).",
    `> Section(s) archived: ${titles}.`,
    summary ? `> Summary: ${summary}` : null,
    "> Append-only once written; never edited by hand.",
    linksAdjusted
      ? "> Content below is verbatim except that relative markdown link target(s) were rewritten "
        + "to keep resolving correctly at this file's directory depth (link text and all other "
        + "content are untouched)."
      : `> Content below is byte-for-byte identical to its original \`${handoverPath}\` text at the time of rotation.`,
    "",
  ].filter((line) => line !== null).join("\n");
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
    archiveSections: plan.archiveSections, handoverPath, archivePath, rotationDate, summary,
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

/**
 * Resolves the configured or explicit handover file for every CLI mode. The
 * lexical check keeps `..` paths out; the realpath check additionally keeps a
 * handover symlink from exposing a target outside the repository root.
 */
function resolveExistingHandoverFile(root, handoverPath) {
  const config = resolveHandoverConfig({ rootDir: root });
  const resolvedHandoverPath = handoverPath ?? config.path;
  const requestedFullPath = join(root, resolvedHandoverPath);
  assertPathWithinRoot(root, requestedFullPath, "The handover path (--handover-path/--file)");
  if (!existsSync(requestedFullPath)) {
    throw new HandoverRotationError("HANDOVER-ROTATION-FILE-NOT-FOUND", `${resolvedHandoverPath} not found under ${root}.`);
  }
  const fullHandoverPath = realpathSync(requestedFullPath);
  assertPathWithinRoot(realpathSync(root), fullHandoverPath, "The resolved handover path (--handover-path/--file)");
  return { config, resolvedHandoverPath, fullHandoverPath };
}

// -- Documentation-governance registration (Pipeline-repo self-hosting only) --

const DOC_GOVERNANCE_RELATIVE_PATH = join("governance", "observation-doc-governance.json");
const GOVERNANCE_PATH_LINE_RE = /^\s*"[^"]+",?\s*$/;

function governancePathOf(line) {
  return line.trim().replace(/^"/, "").replace(/",?$/, "");
}

/**
 * `check-observation-governance.mjs`'s OG-DOC-UNCLASSIFIED check requires every `docs/**` file
 * to be listed in this registry's audience/lifecycle inventory -- confirmed live 2026-08-18: a
 * freshly rotated archive file failed that check immediately. A rotation must never hand the
 * caller a new, unclassified doc to register by hand, so this runs automatically as part of
 * every rotation, placing the new archive path into the SAME inventory group as `handoverPath`
 * (kept alphabetically sorted, matching OG-DOC-ORDER). Surgical line-level edit, not a full
 * JSON.parse/stringify round-trip, so an unrelated part of the file is never touched. Consumer
 * projects that installed pipeline-core without this repo's own self-referential registry file
 * simply have nothing to update (`existsSync` guard below) -- this is Pipeline-repo
 * self-hosting, not a general-purpose feature.
 */
export function registerArchiveInDocGovernance(root, { handoverPath, archivePath }) {
  const governanceFullPath = join(root, DOC_GOVERNANCE_RELATIVE_PATH);
  if (!existsSync(governanceFullPath)) return { updated: false, reason: "no self-referential doc-governance registry in this project" };
  const raw = readFileSync(governanceFullPath, "utf8");
  const lines = raw.split("\n");
  const handoverLineIdx = lines.findIndex(
    (line) => GOVERNANCE_PATH_LINE_RE.test(line) && governancePathOf(line) === handoverPath,
  );
  if (handoverLineIdx === -1) {
    throw new HandoverRotationError(
      "HANDOVER-ROTATION-GOVERNANCE-PATH-NOT-FOUND",
      `${handoverPath} is not listed in ${DOC_GOVERNANCE_RELATIVE_PATH}'s documentation inventory, so `
        + `${archivePath} cannot be auto-registered into the same audience/lifecycle group. Register `
        + `${handoverPath} there first -- no file was written.`,
    );
  }
  let start = handoverLineIdx;
  while (start > 0 && GOVERNANCE_PATH_LINE_RE.test(lines[start - 1])) start--;
  let end = handoverLineIdx;
  while (end < lines.length - 1 && GOVERNANCE_PATH_LINE_RE.test(lines[end + 1])) end++;
  const indent = lines[handoverLineIdx].match(/^(\s*)/u)[1];
  const existingPaths = lines.slice(start, end + 1).map(governancePathOf);
  if (existingPaths.includes(archivePath)) return { updated: false, reason: "already registered" };
  const sortedPaths = [...existingPaths, archivePath].sort();
  const newGroupLines = sortedPaths.map((p, i) => `${indent}"${p}"${i < sortedPaths.length - 1 ? "," : ""}`);
  const newLines = [...lines.slice(0, start), ...newGroupLines, ...lines.slice(end + 1)];
  writeFileSync(governanceFullPath, newLines.join("\n"), "utf8");
  return { updated: true, path: DOC_GOVERNANCE_RELATIVE_PATH };
}

/** Full I/O orchestration used by the CLI: read, gate on acknowledgment, plan, write. */
export function rotateHandover({
  root, handoverPath, sectionHeadings, summary, dateRange, slug, rotationDate = new Date().toISOString().slice(0, 10),
}) {
  const { resolvedHandoverPath, fullHandoverPath } = resolveExistingHandoverFile(root, handoverPath);
  const liveContent = readFileSync(fullHandoverPath, "utf8");
  assertSectionsExtractionAcknowledged(root, { sectionHeadings, liveContent });
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
  // Runs BEFORE any write below: a governance-registration refusal must leave zero mutation,
  // same as every other typed refusal in this script.
  const governanceRegistration = registerArchiveInDocGovernance(root, { handoverPath: resolvedHandoverPath, archivePath: plan.archivePath });
  writeFileSync(fullArchivePath, plan.archiveContent, "utf8");
  writeFileSync(fullHandoverPath, plan.newLiveContent, "utf8");
  return { ...plan, governanceRegistration };
}

// -- CLI --

const CLI_USAGE_CODE = "HANDOVER-ROTATION-CLI-USAGE";

function cliUsage(message) {
  return new HandoverRotationError(CLI_USAGE_CODE, message);
}

function parseArgs(argv) {
  const args = { sectionHeadings: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw cliUsage(`${a} requires a value.`);
      return value;
    };
    const setSingle = (key, value) => {
      if (args[key] !== undefined && args[key] !== value) {
        throw cliUsage(`${a} conflicts with the earlier value for ${key}.`);
      }
      args[key] = value;
    };
    if (a === "--root") setSingle("root", next());
    else if (a === "--acknowledge-extraction-done") args.acknowledge = true;
    else if (a === "--status") args.status = true;
    else if (a === "--check-size") args.checkSize = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--section-heading") args.sectionHeadings.push(next());
    else if (a === "--summary") setSingle("summary", next());
    else if (a === "--date-range") setSingle("dateRange", next());
    else if (a === "--slug") setSingle("slug", next());
    else if (a === "--rotation-date") setSingle("rotationDate", next());
    else if (a === "--handover-path") setSingle("handoverPath", next());
    else if (a === "--file") setSingle("file", next());
    else throw cliUsage(`Unsupported option: ${a}.`);
  }
  if (args.file !== undefined) {
    if (args.handoverPath !== undefined && args.handoverPath !== args.file) {
      throw cliUsage("--file and --handover-path name different handover files.");
    }
    args.handoverPath = args.file;
  }
  const modes = [
    args.acknowledge && "acknowledge",
    args.status && "status",
    args.checkSize && "check-size",
    args.dryRun && "dry-run",
  ].filter(Boolean);
  if (modes.length > 1) throw cliUsage(`Incompatible modes: ${modes.join(", ")}.`);
  args.mode = modes[0] ?? "rotate";

  const hasRotationDetail = args.summary !== undefined
    || args.dateRange !== undefined
    || args.slug !== undefined
    || args.rotationDate !== undefined;
  if (args.mode === "check-size" && (args.sectionHeadings.length > 0 || hasRotationDetail)) {
    throw cliUsage("--check-size accepts only --root and an optional --handover-path/--file.");
  }
  if ((args.mode === "status" || args.mode === "acknowledge") && hasRotationDetail) {
    throw cliUsage(`--${args.mode} cannot be combined with rotation-writing arguments.`);
  }
  if ((args.mode === "rotate" || args.mode === "dry-run") && args.sectionHeadings.length === 0) {
    throw cliUsage(`--${args.mode} requires at least one --section-heading.`);
  }
  if ((args.mode === "rotate" || args.mode === "dry-run") && !args.summary) {
    throw cliUsage(`--${args.mode} requires --summary "<one-line summary>".`);
  }
  return args;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.root) throw cliUsage("--root <repository-root> is required.");
    const root = resolve(args.root);
    if (args.mode === "check-size") {
      const { config, resolvedHandoverPath, fullHandoverPath } = resolveExistingHandoverFile(root, args.handoverPath);
      const measurement = measureHandoverBytes(readFileSync(fullHandoverPath).byteLength, { maxBytes: config.maxBytes });
      console.log(`Handover size: ${measurement.bytes} bytes (${measurement.metric}; max ${measurement.maxUpperBoundUnits}) for ${resolvedHandoverPath}.`);
      if (!measurement.withinBudget) {
        console.error(`HANDOVER-ROTATION-SIZE-EXCEEDS-MAX: ${resolvedHandoverPath} exceeds configured maximum ${measurement.maxUpperBoundUnits} bytes.`);
        process.exit(1);
      }
      process.exit(0);
    }
    if (args.mode === "status") {
      // Read-only: NVA-HANDOVER-ROT-2 F4 / NVA-W3-R3 (schema v2). Never records the marker,
      // only reports it -- the close-block ritual checks this first so
      // `--acknowledge-extraction-done` stays a deliberate human/Elephant judgment call, never
      // a routine automated step. With a --section-heading given, reports just that one
      // section's acknowledged-or-not state (against the live file's current content); without
      // one, lists every CURRENTLY PERSISTED acknowledged section.
      if (args.sectionHeadings.length > 0) {
        const { fullHandoverPath } = resolveExistingHandoverFile(root, args.handoverPath);
        const liveContent = readFileSync(fullHandoverPath, "utf8");
        for (const title of args.sectionHeadings) {
          const section = locateSectionOrThrow(liveContent, title);
          const hash = sectionContentHash(section.lines);
          const acknowledged = isSectionExtractionAcknowledged(root, { title, contentHash: hash });
          console.log(`"${title}": ${acknowledged ? "ACKNOWLEDGED" : "NOT acknowledged"} (content hash ${hash.slice(0, 12)}).`);
        }
      } else {
        const sections = getAcknowledgedSections(root);
        if (sections.length === 0) {
          console.log(`Extraction acknowledgment: no sections recorded for ${root}. Rotation of any section is refused `
            + "(ADR-0066 Decision 6, schema v2) until --acknowledge-extraction-done --section-heading \"<title>\" is run "
            + "for it -- only once the one-time durable-rule extraction pass (ADR-0066 Decision 7) is genuinely complete "
            + "for that section. This is a human/Elephant judgment call, never an automated step of routine closing.");
        } else {
          console.log(`Extraction acknowledgment: ${sections.length} section(s) recorded for ${root}:`);
          for (const entry of sections) {
            console.log(`  "${entry.title}" (content hash ${entry.contentHash.slice(0, 12)}, acknowledged ${entry.acknowledgedAt}).`);
          }
        }
      }
      process.exit(0);
    }
    if (args.mode === "acknowledge") {
      if (args.sectionHeadings.length === 0) {
        console.error("handover-rotate: --acknowledge-extraction-done requires at least one --section-heading "
          + "\"<title>\" -- schema v2 (ADR-0066 Decision 6) acknowledges specific sections, never the whole "
          + "repository at once.");
        process.exit(1);
      }
      const { fullHandoverPath } = resolveExistingHandoverFile(root, args.handoverPath);
      const liveContent = readFileSync(fullHandoverPath, "utf8");
      const entries = recordExtractionAcknowledged(root, { sectionHeadings: args.sectionHeadings, liveContent });
      for (const entry of entries) {
        console.log(`Extraction acknowledgment recorded for "${entry.title}" (content hash ${entry.contentHash.slice(0, 12)}) `
          + `at ${entry.acknowledgedAt} (schema ${HANDOVER_MEASUREMENT_SCHEMA} handover measurement in effect).`);
      }
      process.exit(0);
    }
    if (args.mode === "dry-run") {
      const { resolvedHandoverPath, fullHandoverPath } = resolveExistingHandoverFile(root, args.handoverPath);
      const liveContent = readFileSync(fullHandoverPath, "utf8");
      assertSectionsExtractionAcknowledged(root, { sectionHeadings: args.sectionHeadings, liveContent });
      const plan = planRotation({
        liveContent,
        handoverPath: resolvedHandoverPath,
        sectionHeadings: args.sectionHeadings,
        summary: args.summary,
        dateRange: args.dateRange,
        slug: args.slug,
        rotationDate: args.rotationDate ?? new Date().toISOString().slice(0, 10),
      });
      console.log(`Dry-run archive plan: ${plan.archivedTitles.length} section(s) -> ${plan.archivePath}.`);
      process.exit(0);
    }
    if (!args.summary) {
      throw cliUsage("--summary \"<one-line summary>\" is required for a rotation.");
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
