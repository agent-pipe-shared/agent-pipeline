// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const MAX_BYTES = 1_000_000;
const CAPTURE_PREFIX = "INTAKE-CAPTURE-TEXT-FILE-";
const ANSWERS_PREFIX = "INTAKE-ANSWERS-FILE-";

function refuse(code) {
  throw Object.assign(new Error(code), { code });
}

/**
 * Resolve an existing project file without copying the material into scratch.
 *
 * Additive options (the default call is unchanged: 1,000,000-byte cap and the
 * INTAKE-CAPTURE-TEXT-FILE-* codes):
 * - `maxBytes`: positive integer cap on the raw byte length (BOM included).
 * - `codeSet: "answers-file"`: selects the INTAKE-ANSWERS-FILE-* codes, adds
 *   -MISSING (ENOENT) and refuses NUL inside the decoded content as -INVALID.
 */
export function readIntakeMaterialReference({ rootDir, filePath, expectedSha256 = null, maxBytes = MAX_BYTES, codeSet = "capture" }) {
  const answers = codeSet === "answers-file";
  const prefix = answers ? ANSWERS_PREFIX : CAPTURE_PREFIX;
  if (codeSet !== "capture" && !answers) refuse(`${CAPTURE_PREFIX}INVALID`);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) refuse(`${prefix}INVALID`);
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) {
    refuse(`${prefix}INVALID`);
  }
  if (expectedSha256 !== null && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(expectedSha256))) {
    refuse(`${prefix}DIGEST-INVALID`);
  }
  const ownCode = (error) => typeof error?.code === "string" && error.code.startsWith(prefix);
  let root;
  let file;
  try {
    root = realpathSync.native(resolve(rootDir));
    file = resolve(root, filePath);
    const physicalFile = realpathSync.native(file);
    const inside = relative(root, physicalFile);
    if (inside === "" || inside === ".." || inside.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(inside)) {
      refuse(`${prefix}OUTSIDE-ROOT`);
    }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) refuse(`${prefix}UNREADABLE`);
    if (stat.size > maxBytes) refuse(`${prefix}TOO-LARGE`);
  } catch (error) {
    if (ownCode(error)) throw error;
    if (answers && error?.code === "ENOENT") refuse(`${prefix}MISSING`);
    refuse(`${prefix}UNREADABLE`);
  }
  let bytes;
  try { bytes = readFileSync(file); } catch (error) {
    refuse(answers && error?.code === "ENOENT" ? `${prefix}MISSING` : `${prefix}UNREADABLE`);
  }
  if (bytes.length > maxBytes) refuse(`${prefix}TOO-LARGE`);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { refuse(`${prefix}INVALID-UTF8`); }
  if (answers && text.includes("\0")) refuse(`${prefix}INVALID`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== null && sha256 !== expectedSha256) refuse(`${prefix}DIGEST-MISMATCH`);
  return { text, sha256, byteLength: bytes.length };
}

export function unavailableChatTurnReference() {
  refuse("INTAKE-CHAT-TURN-CAPTURE-UNAVAILABLE");
}
