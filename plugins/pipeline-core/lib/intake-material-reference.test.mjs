// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readIntakeMaterialReference, unavailableChatTurnReference } from "./intake-material-reference.mjs";

function fixture(callback) {
  const base = mkdtempSync(join(tmpdir(), "intake-reference-"));
  const root = join(base, "project");
  const sibling = join(base, "project-neighbor");
  mkdirSync(root);
  mkdirSync(sibling);
  try { callback({ root, sibling }); } finally { rmSync(base, { recursive: true, force: true }); }
}

test("an existing project document is used byte-for-byte with an optional digest", () => fixture(({ root }) => {
  const bytes = Buffer.from("Änderung\r\nzweite Zeile\n", "utf8");
  const path = join(root, "requirements.md");
  writeFileSync(path, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  for (const filePath of ["requirements.md", path]) {
    assert.deepEqual(readIntakeMaterialReference({ rootDir: root, filePath, expectedSha256: sha256 }),
      { text: bytes.toString("utf8"), sha256, byteLength: bytes.length });
  }
  assert.throws(() => readIntakeMaterialReference({ rootDir: root, filePath: path, expectedSha256: "0".repeat(64) }),
    { code: "INTAKE-CAPTURE-TEXT-FILE-DIGEST-MISMATCH" });
}));

test("out-of-root files and symlink escapes never become intake material", () => fixture(({ root, sibling }) => {
  const foreign = join(sibling, "requirements.md");
  writeFileSync(foreign, "foreign");
  symlinkSync(foreign, join(root, "link.md"));
  for (const filePath of [foreign, join("..", "project-neighbor", "requirements.md"), "link.md"]) {
    assert.throws(() => readIntakeMaterialReference({ rootDir: root, filePath }),
      { code: "INTAKE-CAPTURE-TEXT-FILE-OUTSIDE-ROOT" });
  }
}));

test("invalid UTF-8, oversized files and unsupported chat refs have typed outcomes", () => fixture(({ root }) => {
  writeFileSync(join(root, "bad.bin"), Buffer.from([0xc3, 0x28]));
  writeFileSync(join(root, "big.md"), Buffer.alloc(1_000_001, 97));
  assert.throws(() => readIntakeMaterialReference({ rootDir: root, filePath: "bad.bin" }),
    { code: "INTAKE-CAPTURE-TEXT-FILE-INVALID-UTF8" });
  assert.throws(() => readIntakeMaterialReference({ rootDir: root, filePath: "big.md" }),
    { code: "INTAKE-CAPTURE-TEXT-FILE-TOO-LARGE" });
  assert.throws(() => unavailableChatTurnReference(), { code: "INTAKE-CHAT-TURN-CAPTURE-UNAVAILABLE" });
}));
