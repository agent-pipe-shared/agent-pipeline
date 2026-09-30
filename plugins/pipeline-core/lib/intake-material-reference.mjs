// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const MAX_BYTES = 1_000_000;

function refuse(code) {
  throw Object.assign(new Error(code), { code });
}

/** Resolve an existing project file without copying the material into scratch. */
export function readIntakeMaterialReference({ rootDir, filePath, expectedSha256 = null }) {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) {
    refuse("INTAKE-CAPTURE-TEXT-FILE-INVALID");
  }
  if (expectedSha256 !== null && !/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    refuse("INTAKE-CAPTURE-TEXT-FILE-DIGEST-INVALID");
  }
  let root;
  let file;
  try {
    root = realpathSync.native(resolve(rootDir));
    file = resolve(root, filePath);
    const physicalFile = realpathSync.native(file);
    const inside = relative(root, physicalFile);
    if (inside === "" || inside === ".." || inside.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(inside)) {
      refuse("INTAKE-CAPTURE-TEXT-FILE-OUTSIDE-ROOT");
    }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) refuse("INTAKE-CAPTURE-TEXT-FILE-UNREADABLE");
    if (stat.size > MAX_BYTES) refuse("INTAKE-CAPTURE-TEXT-FILE-TOO-LARGE");
  } catch (error) {
    if (typeof error?.code === "string" && error.code.startsWith("INTAKE-CAPTURE-")) throw error;
    refuse("INTAKE-CAPTURE-TEXT-FILE-UNREADABLE");
  }
  let bytes;
  try { bytes = readFileSync(file); } catch { refuse("INTAKE-CAPTURE-TEXT-FILE-UNREADABLE"); }
  if (bytes.length > MAX_BYTES) refuse("INTAKE-CAPTURE-TEXT-FILE-TOO-LARGE");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { refuse("INTAKE-CAPTURE-TEXT-FILE-INVALID-UTF8"); }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== null && sha256 !== expectedSha256) refuse("INTAKE-CAPTURE-TEXT-FILE-DIGEST-MISMATCH");
  return { text, sha256, byteLength: bytes.length };
}

export function unavailableChatTurnReference() {
  refuse("INTAKE-CHAT-TURN-CAPTURE-UNAVAILABLE");
}
