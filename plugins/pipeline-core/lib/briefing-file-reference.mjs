// D183: a Claude Agent dispatch prompt may carry the generator marker line and ONE pointer line
//   pipeline-briefing-file: <repository-relative path> sha256=<digest>
// instead of the full generated briefing. This pure module parses the pointer and loads the verified file text;
// the dispatch guard hands exactly those bytes to the child (hookSpecificOutput.updatedInput.prompt).
// Refusals: DBG-REF-PATH, DBG-REF-DIGEST, DBG-REF-AMBIGUOUS (DBG-REF-CARRIER is raised by the guard for non-Claude carriers).
import { createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { resolve, isAbsolute, sep } from "node:path";
import { verifyGeneratedBriefing, GENERATOR_MARKER_PREFIX } from "./dispatch-briefing-build.mjs";

export const BRIEFING_FILE_POINTER_PREFIX = "pipeline-briefing-file:";
export const BRIEFING_FILE_MAX_BYTES = 262144;
const POINTER_LINE = /^pipeline-briefing-file: (\S+) sha256=([a-f0-9]{64})$/u;
const MARKER_LINE = /^<!-- pipeline-briefing-generator:v1 sha256=([a-f0-9]{64}) -->$/u;

/** True when the text carries a pointer line prefix anywhere at a line start. */
export const carriesBriefingFilePointer = (prompt) => typeof prompt === "string" && /^pipeline-briefing-file:/mu.test(prompt);

/** `null` when the prompt has no pointer; else `{ ok, path, sha256, markerDigest }` or `{ ok:false, code }`. */
export function parseBriefingFileReference(prompt) {
  if (!carriesBriefingFilePointer(prompt)) return null;
  const lines = prompt.split("\n").map((line) => line.replace(/\r$/u, "")).filter((line) => line.trim() !== "");
  const pointers = lines.filter((line) => line.startsWith(BRIEFING_FILE_POINTER_PREFIX));
  const markers = lines.filter((line) => line.includes("<!-- pipeline-briefing-generator:"));
  if (lines.length !== 2 || pointers.length !== 1 || markers.length !== 1 || !MARKER_LINE.test(markers[0])) {
    return { ok: false, code: "DBG-REF-AMBIGUOUS", message: "a pointer prompt must be exactly the generator marker line and one pipeline-briefing-file line, never mixed with inline briefing text" };
  }
  const match = POINTER_LINE.exec(pointers[0]);
  if (match === null) return { ok: false, code: "DBG-REF-PATH", message: "the pipeline-briefing-file line must read `pipeline-briefing-file: <repository-relative path> sha256=<64 hex>`" };
  return { ok: true, path: match[1], sha256: match[2], markerDigest: MARKER_LINE.exec(markers[0])[1] };
}

/** Reads and verifies the referenced file: `{ ok:true, text, path }` or `{ ok:false, code, message }`; `null` for a non-pointer prompt. */
export function loadReferencedBriefing({ root, prompt, readFile = (file) => readFileSync(file) } = {}) {
  const ref = parseBriefingFileReference(prompt);
  if (ref === null) return null;
  if (!ref.ok) return ref;
  const parts = ref.path.split(/[\\/]/u);
  if (isAbsolute(ref.path) || /^[A-Za-z]:/u.test(ref.path) || parts.includes("..") || parts[0] !== "scratch" || parts.length < 2 || parts.includes("")) {
    return { ok: false, code: "DBG-REF-PATH", message: `the briefing file must be a repository-relative path under scratch/ without a .. segment (got ${JSON.stringify(ref.path)})` };
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
  const verified = verifyGeneratedBriefing(text);
  if (!verified.ok) return { ok: false, code: "DBG-REF-DIGEST", message: `the briefing file does not verify against its generator marker (${verified.code}); it was changed after generation` };
  if (createHash("sha256").update(text, "utf8").digest("hex") !== ref.sha256) return { ok: false, code: "DBG-REF-DIGEST", message: "the sha256 of the briefing file differs from the pointer digest" };
  if (!text.split("\n").includes(`${GENERATOR_MARKER_PREFIX}${ref.markerDigest} -->`)) return { ok: false, code: "DBG-REF-DIGEST", message: "the marker line of the prompt does not belong to the briefing file" };
  return { ok: true, text, path: ref.path };
}

/** The exact pointer prompt for a generated briefing file (marker line + pointer line). */
export function renderPointerPrompt({ text, path }) {
  const marker = text.split("\n").find((line) => MARKER_LINE.test(line));
  return `${marker}\n${BRIEFING_FILE_POINTER_PREFIX} ${path} sha256=${createHash("sha256").update(text, "utf8").digest("hex")}\n`;
}
