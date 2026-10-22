// SPDX-License-Identifier: SUL-1.0
//
// Regression pin for backlog item pipeline.node-v24-on-windows-creates-a-real-nul-file (AC-217).
// Node v24 on win32: openSync("NUL", "w") creates a real file named NUL in the cwd; os.devNull does not.
//
// Acceptance points pinned here:
//   A1. No "NUL" literal is a Node open target anywhere in the repository's JS sources (live ratchet scan).
//   A2. A git config null-device value (`GIT_CONFIG_GLOBAL` and similar) is read by git and never opened by
//       Node, so this open-target scanner does not flag it. That is not a licence to spell it NUL: Git for Windows
//       2.56 rejects NUL, and acceptance 2 of the item requires GIT_NULL_DEVICE (lib/git-null-device.mjs). That rule
//       is enforced by the R7-1a ratchets in lib/worktree-lifecycle.test.mjs (production and fixture trees) and by
//       the real-git cases in lib/git-null-device-sites.test.mjs, not by this scanner.
// Plus: the scanner is proven able to fail (RED fixtures, scratch mirror, never production edits), and the
// sanctioned sink (os.devNull) really leaves no NUL file behind.
import test from "node:test";
import assert from "node:assert/strict";
import { devNull } from "node:os";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const SKIP_DIRS = new Set(["node_modules", ".git", "scratch", "evidence"]);
const JS_EXT = /\.(?:mjs|cjs|js)$/u;

const NUL_LITERAL = /(["'`])NUL\1/u;
const OPEN_CALL = "(?:openSync|open|createWriteStream|createReadStream|writeFileSync|appendFileSync|readFileSync|writeFile|appendFile|readFile|copyFileSync|truncateSync|opendirSync)";
const OPEN_CALL_RE = new RegExp(`\\b${OPEN_CALL}\\s*\\(`, "u");
const GIT_CONFIG_KEY = /GIT_CONFIG_(?:GLOBAL|SYSTEM)\s*:/u;

function codeLines(source) {
  let inBlock = false;
  return source.split(/\r?\n/u).map((text) => {
    let t = text;
    if (inBlock) {
      const end = t.indexOf("*/");
      if (end === -1) return "";
      inBlock = false;
      t = t.slice(end + 2);
    }
    t = t.replace(/\/\*.*?\*\//gu, "");
    if (/^\s*\/\//u.test(t)) return "";
    const start = t.indexOf("/*");
    if (start !== -1 && t.indexOf("*/", start) === -1) {
      inBlock = true;
      t = t.slice(0, start);
    }
    return t;
  });
}

/** Offences: a "NUL" literal that is (or is bound to) a Node fs open target. */
export function nulOpenOffences(source) {
  const lines = codeLines(source);
  const offences = [];
  lines.forEach((text, i) => {
    if (!NUL_LITERAL.test(text)) return;
    const window = [lines[i - 2] ?? "", lines[i - 1] ?? "", text].join("\n");
    if (OPEN_CALL_RE.test(text) || OPEN_CALL_RE.test(lines[i - 1] ?? "")) {
      offences.push({ line: i + 1, text: text.trim() });
      return;
    }
    if (GIT_CONFIG_KEY.test(window)) return; // A2: read by git, not opened by Node
    const bound = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])NUL\2/u.exec(text);
    if (bound) {
      const used = new RegExp(`\\b${OPEN_CALL}\\s*\\(\\s*${bound[1].replace(/\$/gu, "\\$")}\\b`, "u");
      if (lines.some((l) => used.test(l))) offences.push({ line: i + 1, text: text.trim() });
    }
  });
  return offences;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (entry.isFile() && JS_EXT.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

function scanTree(root) {
  const found = [];
  let files = 0;
  for (const file of walk(root)) {
    files += 1;
    for (const o of nulOpenOffences(readFileSync(file, "utf8"))) found.push(`${file}:${o.line}: ${o.text}`);
  }
  return { files, found };
}

// ---- A1: live ratchet ------------------------------------------------------------------------------------
test('A1: no "NUL" literal is a Node open target in any repository JS source', () => {
  const { files, found } = scanTree(REPO_ROOT);
  assert.ok(files > 100, `scan must actually cover the repository (saw ${files} files)`);
  assert.deepEqual(found, []);
});

test("A1: a native run of this pin left no real NUL file in the repository root", () => {
  const names = readdirSync(REPO_ROOT).filter((n) => n.toUpperCase() === "NUL");
  assert.deepEqual(names, []);
});

// ---- scanner can fail (RED fixtures) -----------------------------------------------------------------------
// Fixture sources are assembled from N + U + L so that this file itself holds no quoted-literal NUL token
// and the live scan in A1 needs no self-exemption.
const N = ["N", "U", "L"].join("");
const OFFENDERS = {
  openSync: `import { openSync } from "node:fs";\nconst fd = openSync("${N}", "w");\n`,
  openSyncSingleQuote: `const fd = fs.openSync('${N}', 'w');\n`,
  writeFileSync: `writeFileSync("${N}", "x");\n`,
  createWriteStream: `const s = createWriteStream("${N}");\n`,
  callSplitAcrossLines: `const fd = openSync(\n  "${N}", "w");\n`,
  boundConstant: `const SINK = "${N}";\nconst fd = openSync(SINK, "w");\n`,
};

for (const [name, source] of Object.entries(OFFENDERS)) {
  test(`RED mirror: scanner flags ${name}`, () => {
    assert.equal(nulOpenOffences(source).length, 1);
  });
}

test("RED tree: a scratch mirror tree holding an offender makes the tree scan fail", () => {
  const scratchRoot = join(REPO_ROOT, "scratch");
  mkdirSync(scratchRoot, { recursive: true });
  const root = mkdtempSync(join(scratchRoot, "nul-pin-red-"));
  try {
    mkdirSync(join(root, "lib"), { recursive: true });
    writeFileSync(join(root, "lib", "bad.test.mjs"), OFFENDERS.openSync);
    writeFileSync(join(root, "lib", "good.test.mjs"), 'import { devNull } from "node:os";\nopenSync(devNull, "w");\n');
    const { files, found } = scanTree(root);
    assert.equal(files, 2);
    assert.equal(found.length, 1);
    assert.match(found[0], /bad\.test\.mjs:2:/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- A2: explicit allowances ------------------------------------------------------------------------------
test("A2: GIT_CONFIG_GLOBAL set to the NUL spelling is allowed (read by git, not opened by Node)", () => {
  assert.deepEqual(nulOpenOffences(`const env = { GIT_CONFIG_GLOBAL: "${N}" };\n`), []);
  assert.deepEqual(nulOpenOffences(`const env = { GIT_CONFIG_SYSTEM: '${N}', X: 1 };\n`), []);
  assert.deepEqual(nulOpenOffences(`GIT_CONFIG_GLOBAL:\n  process.platform === "win32" ? "${N}" : "/dev/null",\n`), []);
});

test("A2: the allowance does not shelter an actual open of NUL beside a git env key", () => {
  const source = `const env = { GIT_CONFIG_GLOBAL: "${N}" };\nconst fd = openSync("${N}", "w");\n`;
  const offences = nulOpenOffences(source);
  assert.equal(offences.length, 1);
  assert.equal(offences[0].line, 2);
});

test("acceptance 2: the git null-device rule has live enforcers beside this scanner (shared constant, ratchets, real git)", () => {
  const lib = resolve(REPO_ROOT, "plugins", "pipeline-core", "lib");
  assert.match(readFileSync(join(lib, "git-null-device.mjs"), "utf8"), /export const GIT_NULL_DEVICE = "\/dev\/null";/u);
  const ratchets = readFileSync(join(lib, "worktree-lifecycle.test.mjs"), "utf8");
  assert.match(ratchets, /R7-1a ratchet: no production module \(lib, scripts, hooks\) assigns a \\"NUL\\" literal to a git environment or -c value/u);
  assert.match(ratchets, /R7-1a ratchet: no \*\.test\.mjs fixture/u);
  const realGit = readFileSync(join(lib, "git-null-device-sites.test.mjs"), "utf8");
  assert.match(realGit, /real git accepts GIT_CONFIG_GLOBAL=GIT_NULL_DEVICE/u);
});

test("allowances: comments and non-open string uses are not offences", () => {
  assert.deepEqual(nulOpenOffences(`// openSync("${N}", "w") is forbidden\n`), []);
  assert.deepEqual(nulOpenOffences(`/* openSync("${N}") */\n`), []);
  assert.deepEqual(nulOpenOffences(`const placeholder = "${N}";\n`), []);
  assert.deepEqual(nulOpenOffences(`assert.equal(name, "${N}");\n`), []);
});

// ---- the sanctioned sink really is safe -------------------------------------------------------------------
test("os.devNull as an open target creates no NUL file in the working directory", () => {
  const scratchRoot = join(REPO_ROOT, "scratch");
  mkdirSync(scratchRoot, { recursive: true });
  const cwd = mkdtempSync(join(scratchRoot, "nul-pin-sink-"));
  try {
    const script = 'const fs=require("node:fs");const os=require("node:os");const fd=fs.openSync(os.devNull,"w");fs.writeSync(fd,"x");fs.closeSync(fd);';
    const r = spawnSync(process.execPath, ["-e", script], { cwd, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readdirSync(cwd), []);
    assert.equal(existsSync(join(cwd, "NUL")), false);
    assert.ok(devNull.length > 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
