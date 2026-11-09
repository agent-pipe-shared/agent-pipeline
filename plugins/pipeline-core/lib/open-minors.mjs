// SPDX-License-Identifier: SUL-1.0
/**
 * open-minors.mjs -- where minor Critic findings that a round or a close leaves open are written down (CGR-22, candidate 22).
 *
 * Measured places: the Critic lineage record carries only digests of a finding (no text), the PO residual acceptance is private
 * (git common directory, never readable from a fresh clone), and a project without a backlog has no other tracked list. The one
 * place every project has, tracked and human-readable, is its handover (`project/pipeline.json` `handover`, default
 * `docs/state.md`). The minors go into one managed block under "## Open minor findings" there. No new store, no new gate.
 *
 * Accepted minors stay listed (status `accepted`), so they remain readable after the close; an accepted entry is never turned back
 * to open. Pure text functions first, then two thin file wrappers. Platform neutral: the file's own line ending is kept (LF or
 * CRLF), paths are repository-relative with `/`.
 *
 * Wiring (done by the close, not here): a Critic round or the close calls `recordOpenMinors` with the minors of the consumed
 * verdict; the close summary prints `openMinorsCloseLine(...)` (its value comes from `summarizeOpenMinors`).
 */
import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export const OPEN_MINORS_HEADING = "## Open minor findings";
export const OPEN_MINORS_BEGIN = "<!-- open-minors:begin -->";
export const OPEN_MINORS_END = "<!-- open-minors:end -->";
const MAX_SUMMARY = 240;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ENTRY_LINE = /^- \[(open|accepted)(?: by ([^\],]{1,80}), ([0-9T:.Z-]{10,32}))?\] (\S+) \(([^)]*)\): (.*)$/u;

const oneLine = (value) => String(value ?? "").replace(/<!--|-->/gu, "").replace(/\s+/gu, " ").trim().slice(0, MAX_SUMMARY);

/** The minor findings of one consumed verdict as entries. Ids follow `projectConsumedCriticFindings` (`CRF-<packet>-<index + 1>`). */
export function minorsFromVerdictFindings({ featureId, packetId, findings }) {
  if (!Array.isArray(findings) || !ID.test(packetId ?? "")) throw new TypeError("OPEN-MINORS-INPUT");
  return findings.flatMap((finding, index) => finding?.severity === "minor"
    ? [{ id: `CRF-${packetId}-${index + 1}`, status: "open", scope: oneLine(`feature ${featureId ?? "unknown"}`), summary: oneLine(finding.gap || finding.risk || "(no text)") }]
    : []);
}

function parseBlock(text) {
  const begin = text.indexOf(OPEN_MINORS_BEGIN);
  const end = begin < 0 ? -1 : text.indexOf(OPEN_MINORS_END, begin);
  if (begin < 0 || end < 0) return { begin: -1, end: -1, entries: [] };
  const entries = [];
  for (const line of text.slice(begin + OPEN_MINORS_BEGIN.length, end).split(/\r?\n/u)) {
    const match = ENTRY_LINE.exec(line);
    if (match) entries.push({ id: match[4], status: match[1], ...(match[2] === undefined ? {} : { acceptedBy: match[2], acceptedAt: match[3] }), scope: match[5], summary: match[6] });
  }
  return { begin, end: end + OPEN_MINORS_END.length, entries };
}

/** Counts and entries of the managed block in a handover text; zero everything when the block does not exist. */
export function readOpenMinors(text) {
  const { entries } = parseBlock(String(text ?? ""));
  return { open: entries.filter((entry) => entry.status === "open").length, accepted: entries.filter((entry) => entry.status === "accepted").length, entries };
}

const entryLine = (entry) => `- [${entry.status}${entry.status === "accepted" ? ` by ${oneLine(entry.acceptedBy ?? "PO").replace(/[\],]/gu, " ")}, ${entry.acceptedAt}` : ""}] ${entry.id} (${oneLine(entry.scope).replace(/[()]/gu, " ")}): ${oneLine(entry.summary)}`;

/**
 * The handover text with `entries` merged into the managed block (by id; an accepted entry is never reopened), the block created
 * at the end of the text when it does not exist yet. A second call with the same entries returns the same text.
 */
export function upsertOpenMinors(handoverText, entries) {
  const text = String(handoverText ?? "");
  if (!Array.isArray(entries) || entries.some((entry) => !ID.test(entry?.id ?? "") || !["open", "accepted"].includes(entry?.status)
    || (entry.status === "accepted" && !/^[0-9T:.Z-]{10,32}$/u.test(entry.acceptedAt ?? "")))) throw new TypeError("OPEN-MINORS-ENTRY");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const block = parseBlock(text);
  const merged = new Map(block.entries.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    const previous = merged.get(entry.id);
    merged.set(entry.id, previous?.status === "accepted" && entry.status === "open" ? previous : { ...previous, ...entry });
  }
  const lines = [OPEN_MINORS_BEGIN, "Managed list: minor Critic findings a round or the close left open; accepted ones stay listed. Do not edit between the markers.",
    ...[...merged.values()].map(entryLine), OPEN_MINORS_END];
  const rendered = lines.join(eol);
  if (block.begin >= 0) return text.slice(0, block.begin) + rendered + text.slice(block.end);
  const body = text.length === 0 || text.endsWith("\n") ? text : text + eol;
  return `${body}${body.length === 0 ? "" : eol}${OPEN_MINORS_HEADING}${eol}${eol}${rendered}${eol}`;
}

/** The close-summary line: how many minors are open, how many accepted, and where they are. */
export function openMinorsCloseLine({ open, accepted }, handoverPath) {
  return open === 0 && accepted === 0
    ? "Open minor findings: none recorded."
    : `Open minor findings: ${open} open, ${accepted} accepted; listed in ${handoverPath} under "${OPEN_MINORS_HEADING.slice(3)}".`;
}

function handoverFile(root, handoverPath) {
  if (typeof handoverPath !== "string" || handoverPath === "" || isAbsolute(handoverPath) || handoverPath.includes("\\") || handoverPath.includes("\0")
    || handoverPath.split("/").some((part) => part === "" || part === "." || part === "..")) throw new TypeError("OPEN-MINORS-PATH");
  const file = join(root, ...handoverPath.split("/"));
  if (lstatSync(file).isSymbolicLink()) throw new TypeError("OPEN-MINORS-PATH");
  return file;
}

/** Read the counts from the handover file; `{open: 0, accepted: 0}` and `readable: false` when the file cannot be read. */
export function summarizeOpenMinors({ root, handoverPath }) {
  try {
    return { ...readOpenMinors(readFileSync(handoverFile(root, handoverPath), "utf8")), readable: true, handoverPath };
  } catch { return { open: 0, accepted: 0, entries: [], readable: false, handoverPath }; }
}

/** Merge `entries` into the handover file (temp file, then rename in the same directory). Returns the new counts. */
export function recordOpenMinors({ root, handoverPath, entries }) {
  const file = handoverFile(root, handoverPath);
  const next = upsertOpenMinors(readFileSync(file, "utf8"), entries);
  const temp = join(dirname(file), `.open-minors-${process.pid}.tmp`);
  writeFileSync(temp, next, "utf8");
  renameSync(temp, file);
  return { ...readOpenMinors(next), readable: true, handoverPath };
}
