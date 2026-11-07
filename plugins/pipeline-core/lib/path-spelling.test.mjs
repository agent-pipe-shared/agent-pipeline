// SPDX-License-Identifier: SUL-1.0
// path-spelling.mjs: the shared path/interpreter equivalence (candidate 20 separator sweep). Windows and macOS rules are
// exercised with an injected platform; the physical interpreter and case-probe rules use real files on this host.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalUnderRoot, caseInsensitiveVolume, isNodeInterpreterWord, msysToWindows, pathSpellingKey, relativeUnderRoot, sameNativePath, samePathSpelling, typedRootSpelling } from "./path-spelling.mjs";

const win = { platform: "win32" };
const mac = { platform: "darwin" };
const linux = { platform: "linux" };

test("win32: separator, drive-letter case, MSYS and trailing separator are one path", () => {
  for (const spelling of ["D:\\Dev\\App", "D:/Dev/App", "d:/dev/app", "/d/Dev/App", "D:\\Dev\\App\\", "D://Dev//App"]) {
    assert.equal(samePathSpelling(spelling, "D:\\Dev\\App", win), true, spelling);
  }
  assert.equal(msysToWindows("/c/Program Files/nodejs/node.exe"), "C:/Program Files/nodejs/node.exe");
  assert.equal(pathSpellingKey("C:\\", win), "c:/");
});

test("win32 control: another directory, a prefix, a dot segment or a control character is never equal", () => {
  assert.equal(samePathSpelling("D:/Dev/App2", "D:\\Dev\\App", win), false);
  assert.equal(samePathSpelling("D:/Dev", "D:\\Dev\\App", win), false);
  assert.equal(samePathSpelling("D:/Dev/x/../App", "D:\\Dev\\App", win), false);
  assert.equal(samePathSpelling("D:/Dev/App\n", "D:\\Dev\\App", win), false);
  assert.equal(samePathSpelling("E:/Dev/App", "D:\\Dev\\App", win), false);
});

test("linux: only duplicate and trailing separators are folded; case is significant; a backslash is a file name character", () => {
  assert.equal(samePathSpelling("/home/u/app/", "/home/u/app", linux), true);
  assert.equal(samePathSpelling("/home//u/app", "/home/u/app", linux), true);
  assert.equal(samePathSpelling("/home/u/App", "/home/u/app", linux), false);
  assert.equal(samePathSpelling("\\home\\u\\app", "/home/u/app", linux), false);
});

test("darwin: NFC and NFD spellings of a Unicode name are one path", () => {
  const nfc = "/Users/po/Übung".normalize("NFC");
  const nfd = "/Users/po/Übung".normalize("NFD");
  assert.notEqual(nfc, nfd);
  assert.equal(samePathSpelling(nfd, nfc, mac), true);
});

test("darwin: case is folded only when the volume is measured case-insensitive", () => {
  const same = { ino: 7, dev: 1 };
  const insensitive = { ...mac, lstatFn: () => same };
  assert.equal(caseInsensitiveVolume("/Users/po/Dev", insensitive), true);
  assert.equal(samePathSpelling("/users/po/dev", "/Users/po/Dev", insensitive), true);
  // A case-sensitive volume: only the exact spellings exist.
  const inodes = new Map([["/Users", 3], ["/Users/po", 2], ["/Users/po/Dev", 1]]);
  let calls = 0;
  const sensitive = { ...mac, lstatFn: (p) => { calls += 1; if (!inodes.has(p)) throw new Error("ENOENT"); return { ino: inodes.get(p), dev: 1 }; } };
  assert.equal(caseInsensitiveVolume("/Users/po/Dev", sensitive), false);
  assert.equal(samePathSpelling("/Users/po/dev", "/Users/po/Dev", sensitive), false);
  assert.ok(calls > 0);
  // Never on another platform.
  assert.equal(caseInsensitiveVolume("/Users/po/Dev", { platform: "linux", lstatFn: () => same }), false);
});

test("relativeUnderRoot and canonicalUnderRoot rewrite any spelling under the root to the native one and keep the tail's case", () => {
  assert.equal(relativeUnderRoot("d:/dev/app/scratch/MyReq.json", "D:\\Dev\\App", win), "scratch/MyReq.json");
  assert.equal(canonicalUnderRoot("/d/Dev/App/project/.resume-hint-input.json", "D:\\Dev\\App", win), "D:\\Dev\\App\\project\\.resume-hint-input.json");
  assert.equal(canonicalUnderRoot("D:/Dev/App", "D:\\Dev\\App", win), "D:\\Dev\\App");
  assert.equal(relativeUnderRoot("D:/Dev/AppOther/x", "D:\\Dev\\App", win), null);
  assert.equal(relativeUnderRoot("scratch/x.json", "D:\\Dev\\App", win), null, "a relative value is not resolved here");
  assert.equal(canonicalUnderRoot("/home/u/app//scratch/x.json", "/home/u/app", linux), "/home/u/app/scratch/x.json");
  assert.equal(canonicalUnderRoot("/home/u/other/x.json", "/home/u/app", linux), "/home/u/other/x.json");
});

test("sameNativePath widens only on win32/darwin; typedRootSpelling maps only the working directory", () => {
  assert.equal(sameNativePath("D:/Dev/App", "D:\\Dev\\App", win), true);
  assert.equal(sameNativePath("/home/u/app/", "/home/u/app", linux), false, "Linux stays byte-exact");
  assert.equal(sameNativePath("/home/u/app", "/home/u/app", linux), true);
  assert.equal(typedRootSpelling("/d/Dev/App", { ...win, cwd: "D:\\Dev\\App" }), "D:\\Dev\\App");
  assert.equal(typedRootSpelling("D:/Dev/Other", { ...win, cwd: "D:\\Dev\\App" }), "D:/Dev/Other");
  assert.equal(typedRootSpelling("/home/u/app/", { ...linux, cwd: "/home/u/app" }), "/home/u/app/");
});

test("isNodeInterpreterWord: bare node, node.exe on win32, any spelling of the trusted node, a real node outside the root", () => {
  const outside = mkdtempSync(join(tmpdir(), "path-spelling-node-"));
  const root = mkdtempSync(join(tmpdir(), "path-spelling-root-"));
  try {
    assert.equal(isNodeInterpreterWord("node", { root }), true);
    assert.equal(isNodeInterpreterWord("node.exe", { ...win, root }), true);
    assert.equal(isNodeInterpreterWord("node.exe", { ...linux, root }), false);
    assert.equal(isNodeInterpreterWord("C:/Program Files/nodejs/node.exe", { ...win, root: "D:\\Dev\\App", trustedNode: "C:\\Program Files\\nodejs\\node.exe" }), true);
    const foreign = join(outside, "node");
    symlinkSync(process.execPath, foreign);
    assert.equal(isNodeInterpreterWord(foreign, { root, trustedNode: "/nonexistent/node" }), true);
    mkdirSync(join(root, "bin"));
    const planted = join(root, "bin", "node");
    writeFileSync(planted, "#!/bin/sh\n", { mode: 0o755 });
    assert.equal(isNodeInterpreterWord(planted, { root, trustedNode: "/nonexistent/node" }), false, "planted inside the root");
    assert.equal(isNodeInterpreterWord(join(outside, "python3"), { root, trustedNode: "/nonexistent/node" }), false);
    assert.equal(isNodeInterpreterWord(join(outside, "missing", "node"), { root, trustedNode: "/nonexistent/node" }), false);
    assert.equal(isNodeInterpreterWord(foreign, { trustedNode: "/nonexistent/node" }), false, "no root, no foreign admission");
  } finally {
    rmSync(outside, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
