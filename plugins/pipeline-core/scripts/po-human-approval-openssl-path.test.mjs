// SPDX-License-Identifier: SUL-1.0
// ALF-C-N1-04: the signing/probe OpenSSL spawn starts only a resolved absolute path outside every
// repository and never searches the working directory.
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { resolveOpensslExecutable, spawnOpenssl, spawnTrustedGit } from "./po-human-approval.mjs";

const WIN = process.platform === "win32";
const NAME = WIN ? "openssl.exe" : "openssl";
const fresh = (label) => realpathSync(mkdtempSync(join(tmpdir(), `alf-n1-04-${label}-`)));
const cleanup = (...dirs) => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); };
const plant = (dir) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, NAME), "decoy"); if (!WIN) chmodSync(join(dir, NAME), 0o755); return join(dir, NAME); };
const pathEnv = (...dirs) => ({ PATH: dirs.join(delimiter) });

test("resolver returns an absolute path from a PATH entry outside every repository", () => {
  const tool = fresh("tool");
  try {
    const expected = plant(tool);
    const found = resolveOpensslExecutable({ env: pathEnv(tool), platform: process.platform });
    assert.equal(found, expected);
    assert.ok(isAbsolute(found));
  } finally { cleanup(tool); }
});

test("resolver skips a PATH entry that lies inside a repository", () => {
  const repo = fresh("repo");
  const tool = fresh("tool");
  try {
    mkdirSync(join(repo, ".git"));
    plant(join(repo, "bin"));
    const expected = plant(tool);
    const found = resolveOpensslExecutable({ env: pathEnv(join(repo, "bin"), tool), platform: process.platform });
    assert.equal(found, expected, "the repository copy must be skipped and the later outside entry used");
    assert.notEqual(resolveOpensslExecutable({ env: pathEnv(join(repo, "bin")), platform: process.platform }), join(repo, "bin", NAME), "a repository copy is never returned");
  } finally { cleanup(repo, tool); }
});

test("resolver never searches the working directory: relative, empty and dot PATH entries are ignored", () => {
  const tool = fresh("tool");
  const previous = process.cwd();
  try {
    plant(tool);
    process.chdir(tool);
    const found = resolveOpensslExecutable({ env: pathEnv("", ".", "relative-dir"), platform: process.platform });
    assert.notEqual(found, join(tool, NAME), "the working directory copy must not be selected through a relative PATH entry");
  } finally { process.chdir(previous); cleanup(tool); }
});

test("win32 known install locations are searched after PATH (Git for Windows layout)", () => {
  const root = fresh("pf");
  try {
    const bin = join(root, "Git", "mingw64", "bin");
    mkdirSync(bin, { recursive: true });
    const file = join(bin, "openssl.exe");
    writeFileSync(file, "x");
    const found = resolveOpensslExecutable({ env: { PATH: "", ProgramFiles: root }, platform: "win32" });
    assert.equal(found, file);
  } finally { cleanup(root); }
});

const realOpenssl = resolveOpensslExecutable();

test("a decoy openssl in the child working directory is never started by the real spawn", { skip: realOpenssl === null ? "no OpenSSL outside every repository on this machine" : false }, () => {
  const aux = fresh("aux");
  const decoyDir = fresh("decoy");
  const saved = process.env.NODE_OPTIONS;
  const savedMarker = process.env.ALF_N104_MARKER;
  try {
    const marker = join(aux, "started.txt");
    const hook = join(aux, "marker.cjs");
    writeFileSync(hook, 'require("node:fs").appendFileSync(process.env.ALF_N104_MARKER, "decoy-started\\n");\nprocess.exit(0);\n');
    const decoy = join(decoyDir, NAME);
    if (WIN) { try { linkSync(process.execPath, decoy); } catch { copyFileSync(process.execPath, decoy); } }
    else { writeFileSync(decoy, `#!/bin/sh\nprintf 'decoy-started\\n' >> "$ALF_N104_MARKER"\nexit 0\n`); chmodSync(decoy, 0o755); }
    process.env.ALF_N104_MARKER = marker;
    process.env.NODE_OPTIONS = `--require ${JSON.stringify(hook.replaceAll("\\", "/"))}`;
    // Positive control: started by its explicit path the decoy must leave its marker.
    spawnSync(decoy, ["version"], { stdio: "pipe" });
    assert.equal(existsSync(marker), true, "harness defect: the decoy cannot report that it ran");
    rmSync(marker, { force: true });
    process.env.NODE_OPTIONS = `--require ${JSON.stringify(hook.replaceAll("\\", "/"))}`;
    const result = spawnOpenssl(["version"], { cwd: decoyDir, stdio: "pipe", encoding: "utf8" }, {});
    delete process.env.NODE_OPTIONS;
    assert.equal(existsSync(marker), false, "the decoy in the working directory was started");
    assert.equal(result.status, 0, `real openssl must have run: ${result.error?.code ?? result.stderr}`);
    assert.match(String(result.stdout), /SSL/u);
  } finally {
    if (saved === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = saved;
    if (savedMarker === undefined) delete process.env.ALF_N104_MARKER; else process.env.ALF_N104_MARKER = savedMarker;
    cleanup(aux, decoyDir);
  }
});

test("the real spawn reports ENOENT-style non-start, not a bare-name lookup, when nothing resolves", () => {
  const saved = process.env.PATH;
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const decoyDir = fresh("decoy");
  try {
    plant(decoyDir);
    process.env[key] = "";
    const result = spawnOpenssl(["version"], { cwd: decoyDir, stdio: "pipe", encoding: "utf8" }, {});
    // On a machine with a known install location the resolver may still succeed; then it must be absolute and real.
    if (result.error) assert.equal(result.error.code, "ENOENT");
    else assert.equal(result.status, 0);
  } finally { process.env[key] = saved; cleanup(decoyDir); }
});

// ALF-C-N1-04B (AC-256): git is started by a trusted absolute path only, never by bare name.
const GIT_NAME = WIN ? "git.exe" : "git";
const plantGitDecoy = (dir, hook) => {
  mkdirSync(dir, { recursive: true });
  const decoy = join(dir, GIT_NAME);
  if (WIN) { try { linkSync(process.execPath, decoy); } catch { copyFileSync(process.execPath, decoy); } }
  else { writeFileSync(decoy, `#!/bin/sh\nprintf 'decoy-started\\n' >> "$ALF_N104B_MARKER"\nexit 0\n`); chmodSync(decoy, 0o755); }
  return decoy;
};

test("a decoy git first on PATH and in the working directory is never started by the git spawn", () => {
  const aux = fresh("gitaux");
  const decoyDir = fresh("gitdecoy");
  const saved = process.env.NODE_OPTIONS;
  const savedMarker = process.env.ALF_N104B_MARKER;
  const savedPath = process.env.PATH;
  const pathKey = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  try {
    const marker = join(aux, "started.txt");
    const hook = join(aux, "marker.cjs");
    writeFileSync(hook, 'require("node:fs").appendFileSync(process.env.ALF_N104B_MARKER, "decoy-started\\n");\nprocess.exit(0);\n');
    const decoy = plantGitDecoy(decoyDir, hook);
    process.env.ALF_N104B_MARKER = marker;
    process.env.NODE_OPTIONS = `--require ${JSON.stringify(hook.replaceAll("\\", "/"))}`;
    // Positive control: started by its explicit path the decoy must leave its marker.
    spawnSync(decoy, ["rev-parse", "HEAD"], { stdio: "pipe" });
    assert.equal(existsSync(marker), true, "harness defect: the decoy cannot report that it ran");
    rmSync(marker, { force: true });
    process.env[pathKey] = [decoyDir, savedPath].join(delimiter);
    const result = spawnTrustedGit(["rev-parse", "--is-inside-work-tree"], { cwd: decoyDir, stdio: "pipe", encoding: "utf8" });
    delete process.env.NODE_OPTIONS;
    assert.equal(existsSync(marker), false, "the decoy git was started");
    if (result.error) assert.equal(result.error.code, "PO-SIGN-GIT-UNAVAILABLE");
    else assert.equal(typeof result.status, "number");
  } finally {
    process.env[pathKey] = savedPath;
    if (saved === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = saved;
    if (savedMarker === undefined) delete process.env.ALF_N104B_MARKER; else process.env.ALF_N104B_MARKER = savedMarker;
    cleanup(aux, decoyDir);
  }
});

test("the git spawn fails closed with a typed code when git does not resolve, and spawns the resolved absolute path otherwise", () => {
  const unavailable = spawnTrustedGit(["--version"], { stdio: "pipe" }, { resolve: () => ({ ok: false, status: "binary_missing" }) });
  assert.equal(unavailable.status, null);
  assert.equal(unavailable.error.code, "PO-SIGN-GIT-UNAVAILABLE");
  const viaNode = spawnTrustedGit(["-e", "process.stdout.write('abs')"], { stdio: "pipe", encoding: "utf8" }, { resolve: () => ({ ok: true, path: process.execPath }) });
  assert.equal(viaNode.stdout, "abs");
});
