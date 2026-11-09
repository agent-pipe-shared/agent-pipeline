// SPDX-License-Identifier: SUL-1.0
/**
 * C22 (AC-108; CGR-06, CGF-12, CGF-29): the human acceptance of a feature package as one recorded answer, and the closed-state block of the handover.
 *
 * The one-shot close asks the human once, in one generated sentence, before its irreversible part. The answer is stored as a managed section of the
 * feature's tracked acceptance.md (the literal answer, the candidate commit, the open checks), labelled as an attribution record and not a signature.
 * A registered acceptance.md that the approval binds (authority) is never edited: its record goes to evidence/human-acceptance.md. A non-authority
 * entry (the Pipeline-generated pointer) keeps its registered digest honest through the package's own amendment record, so no signature is needed.
 * Every read splits on /\r?\n/ and every write keeps the line ending of the file it changes (Windows).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const ACCEPTANCE_BEGIN = "<!-- close-acceptance:begin -->";
export const ACCEPTANCE_END = "<!-- close-acceptance:end -->";
export const CLOSED_BLOCK_BEGIN = "<!-- pipeline:closed-state:begin -->";
export const CLOSED_BLOCK_END = "<!-- pipeline:closed-state:end -->";
/** The standing open check: what a close can never observe about the product. Always part of the list the human is asked about. */
export const STANDING_OPEN_CHECK = "any manual or real-device check of the product, which this close does not run";
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fallbackPath = (featureId) => `specs/${featureId}/evidence/human-acceptance.md`;
const lines = (text) => String(text).split(/\r?\n/u);

/** The checks the human is told are still open: the ones the caller named, then the standing one. */
export function openChecksOf(named) {
  const own = (Array.isArray(named) ? named : []).map((value) => String(value).replace(/\s+/gu, " ").trim().slice(0, 200)).filter((value) => value !== "").slice(0, 8);
  return [...own, STANDING_OPEN_CHECK];
}

/** The one sentence the agent asks the human in the chat. */
export function acceptanceQuestion({ featureId, candidate, openChecks }) {
  return `Do you accept the feature package ${featureId} at candidate ${candidate}? The performed close counts as the human acceptance of this feature package. Checks still open: ${openChecks.join("; ")}.`;
}

export function renderAcceptanceSection({ candidate, answer, openChecks }) {
  return [ACCEPTANCE_BEGIN, "## Human acceptance of this feature package", "",
    `- Candidate: \`${candidate}\``, `- Answer (literal): ${JSON.stringify(answer)}`, "- Open checks:", ...openChecks.map((check) => `  - ${check}`),
    "- Record type: an attribution record of the human's answer in the chat, not a signature and not proof; the performed close counts as the human acceptance of this feature package.",
    ACCEPTANCE_END].join("\n");
}

/** The record a text carries, or null. */
export function parseAcceptanceRecord(text) {
  const all = lines(text); const from = all.findIndex((line) => line.trim() === ACCEPTANCE_BEGIN); const to = all.findIndex((line, index) => index > from && line.trim() === ACCEPTANCE_END);
  if (from < 0 || to < 0) return null;
  const block = all.slice(from, to); const candidate = /^- Candidate: `([0-9a-f]{40}|[0-9a-f]{64})`\s*$/u; const answer = /^- Answer \(literal\): (".*")\s*$/u;
  const found = block.map((line) => candidate.exec(line)).find((match) => match !== null); let literal = null;
  for (const line of block) { const match = answer.exec(line); if (match !== null) { try { literal = JSON.parse(match[1]); } catch { literal = null; } } }
  if (!found || typeof literal !== "string" || literal.trim() === "") return null;
  const checksAt = block.findIndex((line) => line.trim() === "- Open checks:");
  const openChecks = checksAt < 0 ? [] : block.slice(checksAt + 1).filter((line) => /^ {2}- /u.test(line)).map((line) => line.slice(4).trim());
  return { candidate: found[1], answer: literal, openChecks };
}

/** The text with the managed section replaced (or appended), in the line ending the text already uses; a missing text becomes a small document. */
export function applyAcceptanceSection(existing, section) {
  const eol = typeof existing === "string" && existing.includes("\r\n") ? "\r\n" : "\n"; const block = section.split("\n").join(eol);
  if (typeof existing !== "string") return `# Human acceptance${eol}${eol}${block}${eol}`;
  const all = existing.split(eol); const from = all.findIndex((line) => line.trim() === ACCEPTANCE_BEGIN); const to = all.findIndex((line, index) => index > from && line.trim() === ACCEPTANCE_END);
  if (from >= 0 && to >= 0) return [...all.slice(0, from), ...block.split(eol), ...all.slice(to + 1)].join(eol);
  return `${existing.replace(/\s+$/u, "")}${eol}${eol}${block}${eol}`;
}

/** Where the record belongs: the registered acceptance.md, unless the approval binds it (authority), then the evidence file. `entry` is the package entry to keep honest, else null. */
export function acceptanceTarget(root, featureId) {
  const manifestPath = `specs/${featureId}/lifecycle.json`; let entry = null;
  try { entry = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8")).artifacts.find((item) => item?.class === "acceptance") ?? null; } catch { entry = null; }
  const safe = typeof entry?.path === "string" && entry.path.startsWith(`specs/${featureId}/`) && !entry.path.split("/").includes("..") && !entry.path.includes("\\");
  if (entry !== null && entry.authority === true) return { path: fallbackPath(featureId), manifestPath, entry: null };
  return { path: safe ? entry.path : `specs/${featureId}/acceptance.md`, manifestPath, entry: safe ? entry : null };
}

/** The recorded acceptance of the feature (either place), or null. */
export function readAcceptanceRecord(root, featureId) {
  for (const path of [acceptanceTarget(root, featureId).path, `specs/${featureId}/acceptance.md`, fallbackPath(featureId)]) {
    try { const record = parseAcceptanceRecord(readFileSync(resolve(root, path), "utf8")); if (record !== null) return { ...record, path }; } catch { /* next place */ }
  }
  return null;
}

/** Writes (idempotently) the record and, for a registered non-authority entry, rebinds its digest with the package's amendment record. Returns the paths written. */
export function writeAcceptanceRecord({ root, featureId, record, now = () => new Date().toISOString() }) {
  const target = acceptanceTarget(root, featureId); const file = resolve(root, target.path); const written = [];
  let before = null; try { before = readFileSync(file, "utf8"); } catch { before = null; }
  const text = applyAcceptanceSection(before, renderAcceptanceSection(record));
  if (text !== before) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); written.push(target.path); }
  if (target.entry !== null) {
    const manifestFile = resolve(root, target.manifestPath); const manifest = JSON.parse(readFileSync(manifestFile, "utf8")); const index = manifest.artifacts.findIndex((item) => item?.class === "acceptance");
    const digest = sha256Hex(readFileSync(file));
    if (index >= 0 && manifest.artifacts[index].sha256 !== digest) {
      const previous = manifest.artifacts[index].sha256;
      manifest.artifacts[index] = { ...manifest.artifacts[index], sha256: digest, amendment: { at: now(), reason: "close acceptance record: the human's answer was recorded in this acceptance file (attribution record, no signature)", previousSha256: previous } };
      writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`); written.push(target.manifestPath);
    }
  }
  return written;
}

/** The generated closed-state lines of the handover (technical close, product acceptance and push as three different facts), or null when the feature has no readable package. */
export function closedHandoverLines(root, featureId) {
  if (!FEATURE.test(featureId ?? "")) return null;
  let candidate = null; try { const value = JSON.parse(readFileSync(resolve(root, `specs/${featureId}/lifecycle.json`), "utf8"))?.candidate?.commit; candidate = typeof value === "string" ? value : null; } catch { candidate = null; }
  const record = readAcceptanceRecord(root, featureId);
  return [`Feature \`${featureId}\` is closed locally; its verified candidate is ${candidate === null ? "not readable from its package" : `\`${candidate}\``}, and the close commit that carries this text is the one the close then freezes as the candidate.`,
    "**Technical close:** done. The feature close is recorded in Pipeline State; it says nothing about product acceptance or push.",
    record === null ? "**Product acceptance:** not recorded in this feature's acceptance record; the human has not answered the acceptance question through the close."
      : `**Product acceptance:** recorded in \`${record.path}\` for candidate \`${record.candidate}\` (an attribution record of the human's answer, not a signature); open checks: ${record.openChecks.join("; ")}.`,
    "**Push:** not done by the close. Publication and push are separate human-gated steps."];
}
