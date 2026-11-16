// SPDX-License-Identifier: SUL-1.0
// D183: a Claude Agent dispatch prompt may carry the generator marker line and ONE pointer line
//   pipeline-briefing-file: <repository-relative path> sha256=<digest>
// instead of the full generated briefing. This pure module parses the pointer and loads the verified file text;
// the dispatch guard hands exactly those bytes to the child (hookSpecificOutput.updatedInput.prompt).
// Refusals: DBG-REF-PATH, DBG-REF-DIGEST, DBG-REF-AMBIGUOUS (DBG-REF-CARRIER is raised by the guard for non-Claude carriers).
import { createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { resolve, isAbsolute, sep } from "node:path";
import { verifyGeneratedBriefing, GENERATOR_MARKER_PREFIX } from "./dispatch-briefing-build.mjs";

// C30D-G3: a Critic briefing travels the same two-line pointer. Its own generator marker says which generator wrote the file: the prefix
// deliberately does NOT contain `<!-- pipeline-briefing-generator:`, the substring every Goldfish rule (splitMarker, generatedBriefingAdmission) keys on.
// The digest covers every other byte of the file; the guard hands the Critic the body WITHOUT the marker line, so every later check judges
// exactly the text an inline paste of the filled briefing would carry.
export const CRITIC_GENERATOR_MARKER_PREFIX = "<!-- pipeline-critic-briefing-generator:v1 sha256=";
export const CRITIC_BRIEFING_ROLE = "pipeline-core:critic";
export const CRITIC_BRIEFING_DIRECTORY = "scratch/critic-briefing";
const CRITIC_MARKER_LINE = /^<!-- pipeline-critic-briefing-generator:v1 sha256=([a-f0-9]{64}) -->$/u;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** The final Critic file text: the body (a final newline is added when missing) followed by its Critic marker line. */
export function stampCriticBriefing(body) {
  const text = body.endsWith("\n") ? body : `${body}\n`;
  return `${text}${CRITIC_GENERATOR_MARKER_PREFIX}${sha256(text)} -->\n`;
}

/** `{ ok:true, body }` when the text is a body plus exactly one Critic marker line as its last line whose digest covers that body; else `{ ok:false, code }`. */
export function verifyCriticBriefing(text) {
  if (typeof text !== "string" || text.includes("<!-- pipeline-briefing-generator:") || (text.match(/<!-- pipeline-critic-briefing-generator:/gu) ?? []).length !== 1) return { ok: false, code: "DBG-CRITIC-MARKER-MISSING" };
  const lines = text.split("\n");
  const index = lines.length - 2;
  if (index < 0 || lines[lines.length - 1] !== "" || !CRITIC_MARKER_LINE.test(lines[index])) return { ok: false, code: "DBG-CRITIC-MARKER-MISSING" };
  const digest = CRITIC_MARKER_LINE.exec(lines[index])[1];
  const body = lines.slice(0, index).join("\n") + (index === 0 ? "" : "\n");
  if (sha256(body) !== digest) return { ok: false, code: "DBG-CRITIC-DIGEST-MISMATCH" };
  return { ok: true, body };
}

export const BRIEFING_FILE_POINTER_PREFIX = "pipeline-briefing-file:";
export const BRIEFING_FILE_MAX_BYTES = 262144;
const POINTER_LINE = /^pipeline-briefing-file: (\S+) sha256=([a-f0-9]{64})$/u;
const MARKER_LINE = /^<!-- pipeline-briefing-generator:v1 sha256=([a-f0-9]{64}) -->$/u;
const anyMarkerLine = (line) => MARKER_LINE.test(line) || CRITIC_MARKER_LINE.test(line);

/** True when the text carries a pointer line prefix anywhere at a line start. */
export const carriesBriefingFilePointer = (prompt) => typeof prompt === "string" && /^pipeline-briefing-file:/mu.test(prompt);

/** `null` when the prompt has no pointer; else `{ ok, path, sha256, markerDigest, kind }` (kind `goldfish` or `critic`) or `{ ok:false, code }`. */
export function parseBriefingFileReference(prompt) {
  if (!carriesBriefingFilePointer(prompt)) return null;
  const lines = prompt.split("\n").map((line) => line.replace(/\r$/u, "")).filter((line) => line.trim() !== "");
  const pointers = lines.filter((line) => line.startsWith(BRIEFING_FILE_POINTER_PREFIX));
  const markers = lines.filter((line) => line.includes("<!-- pipeline-briefing-generator:") || line.includes("<!-- pipeline-critic-briefing-generator:"));
  if (lines.length !== 2 || pointers.length !== 1 || markers.length !== 1 || !anyMarkerLine(markers[0])) {
    return { ok: false, code: "DBG-REF-AMBIGUOUS", message: "a pointer prompt must be exactly the generator marker line and one pipeline-briefing-file line, never mixed with inline briefing text" };
  }
  const match = POINTER_LINE.exec(pointers[0]);
  if (match === null) return { ok: false, code: "DBG-REF-PATH", message: "the pipeline-briefing-file line must read `pipeline-briefing-file: <repository-relative path> sha256=<64 hex>`" };
  const critic = CRITIC_MARKER_LINE.test(markers[0]);
  return { ok: true, path: match[1], sha256: match[2], markerDigest: (critic ? CRITIC_MARKER_LINE : MARKER_LINE).exec(markers[0])[1], kind: critic ? "critic" : "goldfish" };
}

/**
 * Reads and verifies the referenced file: `{ ok:true, text, path }` or `{ ok:false, code, message }`; `null` for a non-pointer prompt.
 * A Critic marker is accepted only for a `pipeline-core:critic` dispatch (`subagentType`), only for a file under scratch/critic-briefing/,
 * and hands back the body without its marker line; a file that still holds an open `<FILL` slot is refused.
 */
export function loadReferencedBriefing({ root, prompt, subagentType, readFile = (file) => readFileSync(file) } = {}) {
  const ref = parseBriefingFileReference(prompt);
  if (ref === null) return null;
  if (!ref.ok) return ref;
  const critic = ref.kind === "critic";
  if (critic && subagentType !== CRITIC_BRIEFING_ROLE) {
    return { ok: false, code: "DBG-REF-AMBIGUOUS", message: `a Critic briefing marker is admitted only for a ${CRITIC_BRIEFING_ROLE} dispatch (got ${JSON.stringify(subagentType ?? null)}); a Goldfish dispatch carries a Goldfish briefing` };
  }
  const parts = ref.path.split(/[\\/]/u);
  if (isAbsolute(ref.path) || /^[A-Za-z]:/u.test(ref.path) || parts.includes("..") || parts[0] !== "scratch" || parts.length < 2 || parts.includes("")) {
    return { ok: false, code: "DBG-REF-PATH", message: `the briefing file must be a repository-relative path under scratch/ without a .. segment (got ${JSON.stringify(ref.path)})` };
  }
  if (critic && (parts[1] !== "critic-briefing" || parts.length < 4)) {
    return { ok: false, code: "DBG-REF-PATH", message: `a Critic briefing file must lie in a folder under ${CRITIC_BRIEFING_DIRECTORY}/ (got ${JSON.stringify(ref.path)})` };
  }
  const file = resolve(root, ...parts);
  if (!file.startsWith(resolve(root) + sep)) return { ok: false, code: "DBG-REF-PATH", message: "the briefing file resolves outside the repository" };
  let bytes;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile()) return { ok: false, code: "DBG-REF-PATH", message: "the briefing file is not a regular file" };
    if (stat.size > BRIEFING_FILE_MAX_BYTES) return { ok: false, code: "DBG-REF-PATH", message: `the briefing file exceeds ${BRIEFING_FILE_MAX_BYTES} bytes` };
    bytes = readFile(file);
  } catch (error) {
    return { ok: false, code: "DBG-REF-PATH", message: `the briefing file cannot be read (${error?.code ?? "error"})` };
  }
  const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
  if (critic) {
    const checked = verifyCriticBriefing(text);
    if (!checked.ok) return { ok: false, code: "DBG-REF-DIGEST", message: `the briefing file does not verify against its Critic generator marker (${checked.code}); it was changed after the fill step` };
    if (sha256(text) !== ref.sha256) return { ok: false, code: "DBG-REF-DIGEST", message: "the sha256 of the briefing file differs from the pointer digest" };
    if (!text.split("\n").includes(`${CRITIC_GENERATOR_MARKER_PREFIX}${ref.markerDigest} -->`)) return { ok: false, code: "DBG-REF-DIGEST", message: "the marker line of the prompt does not belong to the briefing file" };
    if (/<FILL\b/u.test(checked.body)) return { ok: false, code: "DBG-REF-DIGEST", message: "the briefing file still holds an open <FILL ...> slot; run the fill step with a value for every slot" };
    return { ok: true, text: checked.body, path: ref.path };
  }
  const verified = verifyGeneratedBriefing(text);
  if (!verified.ok) return { ok: false, code: "DBG-REF-DIGEST", message: `the briefing file does not verify against its generator marker (${verified.code}); it was changed after generation` };
  if (createHash("sha256").update(text, "utf8").digest("hex") !== ref.sha256) return { ok: false, code: "DBG-REF-DIGEST", message: "the sha256 of the briefing file differs from the pointer digest" };
  if (!text.split("\n").includes(`${GENERATOR_MARKER_PREFIX}${ref.markerDigest} -->`)) return { ok: false, code: "DBG-REF-DIGEST", message: "the marker line of the prompt does not belong to the briefing file" };
  return { ok: true, text, path: ref.path };
}

/** The exact pointer prompt for a generated briefing file (marker line + pointer line). */
export function renderPointerPrompt({ text, path }) {
  const marker = text.split("\n").find(anyMarkerLine);
  return `${marker}\n${BRIEFING_FILE_POINTER_PREFIX} ${path} sha256=${createHash("sha256").update(text, "utf8").digest("hex")}\n`;
}
