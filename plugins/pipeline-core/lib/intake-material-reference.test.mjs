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

// ---------------------------------------------------------------------------
// R5-T0a: pins for the answers-file route of the reader (answers-file design
// note, section 4, cases 1-7). R5-1 pins today's defaults and stays green.
// The R5-2 .. R5-7 pins are RED until fix slice F1 gives the reader the
// additive options `codeSet: "answers-file"` (selects the INTAKE-ANSWERS-FILE-*
// codes) and `maxBytes` (alone it keeps the INTAKE-CAPTURE-TEXT-FILE-* codes).
// The options travel in the same single options object as `rootDir`,
// `filePath` and `expectedSha256`; `readAnswers` below is the one place that
// spells the answers route.
// ---------------------------------------------------------------------------

const CAPTURE_PREFIX = "INTAKE-CAPTURE-TEXT-FILE-";
const ANSWERS_PREFIX = "INTAKE-ANSWERS-FILE-";
const ANSWERS_ROUTE = Object.freeze({ codeSet: "answers-file", maxBytes: 65_536 });
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function sha256Of(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function readDefault(root, filePath, extra = {}) {
  return readIntakeMaterialReference({ rootDir: root, filePath, ...extra });
}
function readAnswers(root, filePath, extra = {}) {
  return readIntakeMaterialReference({ rootDir: root, filePath, ...ANSWERS_ROUTE, ...extra });
}
/** Valid, ASCII-only JSON of exactly `size` bytes. */
function jsonOfSize(size) {
  const head = "{\"a\":\"";
  const tail = "\"}";
  return Buffer.from(`${head}${"x".repeat(size - head.length - tail.length)}${tail}`, "utf8");
}
/** The reader's refusal shape: an Error whose `.code` equals its message. */
function assertRefusal(call, code) {
  let outcome;
  try { outcome = call(); } catch (error) {
    assert.ok(error instanceof Error, `refusal for ${code} is not an Error`);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return;
  }
  assert.fail(`expected refusal ${code}, got a result with keys ${JSON.stringify(Object.keys(outcome ?? {}))}`);
}
function probeSymlinkRefusal() {
  const base = mkdtempSync(join(tmpdir(), "intake-reference-probe-"));
  try {
    writeFileSync(join(base, "target"), "x");
    symlinkSync(join(base, "target"), join(base, "link"));
    return false;
  } catch (error) {
    return `host refuses symlinkSync (${error?.code ?? "unknown"})`;
  } finally { rmSync(base, { recursive: true, force: true }); }
}
const SYMLINK_SKIP = probeSymlinkRefusal();

test("R5-1 reader regression: a default call keeps the 1,000,000-byte cap and the INTAKE-CAPTURE-TEXT-FILE-* codes", () => fixture(({ root, sibling }) => {
  const atCap = Buffer.alloc(1_000_000, 97);
  writeFileSync(join(root, "at-cap.md"), atCap);
  assert.deepEqual(readDefault(root, "at-cap.md"),
    { text: atCap.toString("utf8"), sha256: sha256Of(atCap), byteLength: 1_000_000 });
  writeFileSync(join(root, "over-cap.md"), Buffer.alloc(1_000_001, 97));
  assertRefusal(() => readDefault(root, "over-cap.md"), `${CAPTURE_PREFIX}TOO-LARGE`);

  // The answers route's content rule (NUL) does not exist on the capture route.
  const withNul = Buffer.from("a\u0000b", "utf8");
  writeFileSync(join(root, "nul.md"), withNul);
  assert.deepEqual(readDefault(root, "nul.md"), { text: "a\u0000b", sha256: sha256Of(withNul), byteLength: 3 });

  writeFileSync(join(root, "lone-ff.md"), Buffer.from([0x7b, 0xff, 0x7d]));
  assertRefusal(() => readDefault(root, "lone-ff.md"), `${CAPTURE_PREFIX}INVALID-UTF8`);
  // ENOENT stays folded into UNREADABLE on the capture route.
  assertRefusal(() => readDefault(root, "nope.md"), `${CAPTURE_PREFIX}UNREADABLE`);
  mkdirSync(join(root, "adir"));
  assertRefusal(() => readDefault(root, "adir"), `${CAPTURE_PREFIX}UNREADABLE`);
  for (const filePath of ["", "a\u0000b.md"]) assertRefusal(() => readDefault(root, filePath), `${CAPTURE_PREFIX}INVALID`);

  writeFileSync(join(sibling, "x.md"), "foreign");
  for (const filePath of [join(sibling, "x.md"), join("..", "project-neighbor", "x.md"), ".", root]) {
    assertRefusal(() => readDefault(root, filePath), `${CAPTURE_PREFIX}OUTSIDE-ROOT`);
  }
  assertRefusal(() => readDefault(root, "at-cap.md", { expectedSha256: "ABC" }), `${CAPTURE_PREFIX}DIGEST-INVALID`);
  assertRefusal(() => readDefault(root, "at-cap.md", { expectedSha256: "0".repeat(64) }), `${CAPTURE_PREFIX}DIGEST-MISMATCH`);
}));

test("R5-2 maxBytes 65536: 30,720 and 65,536 bytes are accepted, 65,537 bytes are INTAKE-ANSWERS-FILE-TOO-LARGE", () => fixture(({ root }) => {
  for (const size of [30_720, 65_536]) {
    const bytes = jsonOfSize(size);
    writeFileSync(join(root, `at-${size}.json`), bytes);
    assert.deepEqual(readAnswers(root, `at-${size}.json`),
      { text: bytes.toString("utf8"), sha256: sha256Of(bytes), byteLength: size });
  }
  writeFileSync(join(root, "over.json"), jsonOfSize(65_537));
  assertRefusal(() => readAnswers(root, "over.json"), `${ANSWERS_PREFIX}TOO-LARGE`);
  // The size is decided before any content or digest rule can fire.
  writeFileSync(join(root, "over-bad.json"), Buffer.alloc(65_537, 0xff));
  assertRefusal(() => readAnswers(root, "over-bad.json", { expectedSha256: "0".repeat(64) }), `${ANSWERS_PREFIX}TOO-LARGE`);
}));

test("R5-2 maxBytes counts raw bytes, BOM included", () => fixture(({ root }) => {
  const fits = Buffer.concat([UTF8_BOM, jsonOfSize(65_533)]);
  writeFileSync(join(root, "bom-fits.json"), fits);
  assert.equal(fits.length, 65_536);
  assert.deepEqual(readAnswers(root, "bom-fits.json"),
    { text: jsonOfSize(65_533).toString("utf8"), sha256: sha256Of(fits), byteLength: 65_536 });
  const over = Buffer.concat([UTF8_BOM, jsonOfSize(65_534)]);
  writeFileSync(join(root, "bom-over.json"), over);
  assert.equal(over.length, 65_537);
  assertRefusal(() => readAnswers(root, "bom-over.json"), `${ANSWERS_PREFIX}TOO-LARGE`);
}));

test("R5-2 maxBytes alone keeps the INTAKE-CAPTURE-TEXT-FILE-* codes", () => fixture(({ root }) => {
  const atCap = jsonOfSize(65_536);
  writeFileSync(join(root, "at-cap.json"), atCap);
  assert.deepEqual(readDefault(root, "at-cap.json", { maxBytes: 65_536 }),
    { text: atCap.toString("utf8"), sha256: sha256Of(atCap), byteLength: 65_536 });
  writeFileSync(join(root, "over.json"), jsonOfSize(65_537));
  assertRefusal(() => readDefault(root, "over.json", { maxBytes: 65_536 }), `${CAPTURE_PREFIX}TOO-LARGE`);
}));

test("R5-3 Windows shapes: UTF-8 BOM and CRLF variants of the same JSON parse after decoding; sha256 covers the raw bytes; no BOM in the text", () => fixture(({ root }) => {
  const items = [];
  let json;
  do {
    items.push({ id: `q${items.length}`, answer: "Größe – Änderung ✓ ".repeat(8) });
    json = JSON.stringify({ questions: items }, null, 2);
  } while (Buffer.byteLength(json, "utf8") < 30_720);
  const variants = {
    lf: Buffer.from(json, "utf8"),
    crlf: Buffer.from(json.replace(/\n/gu, "\r\n"), "utf8"),
    "bom-lf": Buffer.concat([UTF8_BOM, Buffer.from(json, "utf8")]),
    "bom-crlf": Buffer.concat([UTF8_BOM, Buffer.from(json.replace(/\n/gu, "\r\n"), "utf8")]),
  };
  const digests = new Set();
  for (const [name, raw] of Object.entries(variants)) {
    assert.ok(raw.length >= 30_720 && raw.length <= 65_536, `${name} fixture is ${raw.length} bytes`);
    writeFileSync(join(root, `${name}.json`), raw);
    const result = readAnswers(root, `${name}.json`, { expectedSha256: sha256Of(raw) });
    assert.deepEqual(JSON.parse(result.text), { questions: items }, name);
    assert.equal(result.text.includes("﻿"), false, `${name}: no BOM in the returned text`);
    assert.equal(result.sha256, sha256Of(raw), `${name}: digest is over the raw bytes`);
    assert.equal(result.byteLength, raw.length, `${name}: byteLength is the raw length`);
    digests.add(result.sha256);
  }
  assert.equal(digests.size, 4, "BOM and line-ending variants have distinct raw-byte digests");
}));

test("R5-4 non-UTF-8 content is -INVALID-UTF8; NUL inside the content, a NUL path and an empty path are -INVALID", () => fixture(({ root }) => {
  writeFileSync(join(root, "lone-ff.json"), Buffer.from([0x7b, 0xff, 0x7d]));
  assertRefusal(() => readAnswers(root, "lone-ff.json"), `${ANSWERS_PREFIX}INVALID-UTF8`);
  writeFileSync(join(root, "nul-trailing.json"), Buffer.from("{\"a\":\"b\"}\u0000", "utf8"));
  assertRefusal(() => readAnswers(root, "nul-trailing.json"), `${ANSWERS_PREFIX}INVALID`);
  writeFileSync(join(root, "nul-embedded.json"), Buffer.from("{\"a\":\"b\u0000c\"}", "utf8"));
  assertRefusal(() => readAnswers(root, "nul-embedded.json"), `${ANSWERS_PREFIX}INVALID`);
  for (const filePath of ["a\u0000b.json", "scratch/\u0000.json", ""]) {
    assertRefusal(() => readAnswers(root, filePath), `${ANSWERS_PREFIX}INVALID`);
  }
}));

test("R5-5 paths: missing is -MISSING, a directory is -UNREADABLE, escapes and the root itself are -OUTSIDE-ROOT, an absolute path inside the root is accepted", () => fixture(({ root, sibling }) => {
  const bytes = Buffer.from("{\"ok\":true}", "utf8");
  mkdirSync(join(root, "scratch"));
  writeFileSync(join(root, "scratch", "a.json"), bytes);
  mkdirSync(join(root, "adir"));
  writeFileSync(join(sibling, "x.json"), bytes);
  const expected = { text: "{\"ok\":true}", sha256: sha256Of(bytes), byteLength: bytes.length };
  for (const filePath of [join("scratch", "a.json"), join(root, "scratch", "a.json")]) {
    assert.deepEqual(readAnswers(root, filePath), expected);
  }
  for (const filePath of ["nope.json", join("scratch", "nope.json"), join("no-dir", "a.json")]) {
    assertRefusal(() => readAnswers(root, filePath), `${ANSWERS_PREFIX}MISSING`);
  }
  assertRefusal(() => readAnswers(root, "adir"), `${ANSWERS_PREFIX}UNREADABLE`);
  for (const filePath of [join("..", "project-neighbor", "x.json"), join(sibling, "x.json"), "..", ".", root]) {
    assertRefusal(() => readAnswers(root, filePath), `${ANSWERS_PREFIX}OUTSIDE-ROOT`);
  }
}));

test("R5-5 paths (leaf symlink): a symlinked leaf is -UNREADABLE, a link out of the root is -OUTSIDE-ROOT", { skip: SYMLINK_SKIP }, () => fixture(({ root, sibling }) => {
  writeFileSync(join(root, "real.json"), "{}");
  symlinkSync(join(root, "real.json"), join(root, "leaf-link.json"));
  assertRefusal(() => readAnswers(root, "leaf-link.json"), `${ANSWERS_PREFIX}UNREADABLE`);
  writeFileSync(join(sibling, "foreign.json"), "{}");
  symlinkSync(join(sibling, "foreign.json"), join(root, "escape-link.json"));
  assertRefusal(() => readAnswers(root, "escape-link.json"), `${ANSWERS_PREFIX}OUTSIDE-ROOT`);
}));

test("R5-6 digest: a matching digest is accepted, a mismatch is -DIGEST-MISMATCH, uppercase/short/non-hex is -DIGEST-INVALID", () => fixture(({ root }) => {
  const bytes = Buffer.from("{\"answers\":{\"q1\":\"Änderung\"}}", "utf8");
  writeFileSync(join(root, "ok.json"), bytes);
  const sha256 = sha256Of(bytes);
  assert.deepEqual(readAnswers(root, "ok.json", { expectedSha256: sha256 }),
    { text: bytes.toString("utf8"), sha256, byteLength: bytes.length });
  assertRefusal(() => readAnswers(root, "ok.json", { expectedSha256: "0".repeat(64) }), `${ANSWERS_PREFIX}DIGEST-MISMATCH`);
  for (const expectedSha256 of [sha256.toUpperCase(), sha256.slice(0, 63), `${sha256}0`, "g".repeat(64), "ABC", ""]) {
    assertRefusal(() => readAnswers(root, "ok.json", { expectedSha256 }), `${ANSWERS_PREFIX}DIGEST-INVALID`);
  }
}));

test("R5-7 error identity: every answers-route refusal is an Error whose .code equals its message and carries the INTAKE-ANSWERS-FILE- prefix", () => fixture(({ root, sibling }) => {
  writeFileSync(join(root, "ok.json"), "{}");
  writeFileSync(join(root, "lone-ff.json"), Buffer.from([0x7b, 0xff, 0x7d]));
  writeFileSync(join(root, "too-big.json"), Buffer.alloc(1_000_001, 97));
  writeFileSync(join(sibling, "x.json"), "{}");
  mkdirSync(join(root, "adir"));
  const scenarios = [
    ["INVALID", "a\u0000b.json", {}],
    ["MISSING", "nope.json", {}],
    ["UNREADABLE", "adir", {}],
    ["OUTSIDE-ROOT", join("..", "project-neighbor", "x.json"), {}],
    ["TOO-LARGE", "too-big.json", {}],
    ["INVALID-UTF8", "lone-ff.json", {}],
    ["DIGEST-INVALID", "ok.json", { expectedSha256: "ABC" }],
    ["DIGEST-MISMATCH", "ok.json", { expectedSha256: "0".repeat(64) }],
  ];
  for (const [suffix, filePath, extra] of scenarios) {
    let caught;
    try { readAnswers(root, filePath, extra); } catch (error) { caught = error; }
    assert.ok(caught instanceof Error, `${suffix}: expected an Error`);
    assert.equal(caught.code, `${ANSWERS_PREFIX}${suffix}`);
    assert.equal(caught.message, caught.code, `${suffix}: message equals code`);
  }
}));
