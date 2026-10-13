// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.gitleaks-repair-ignore-cli-is-a-no-op-on-windows (AC-184).
 *
 * Original defect: the CLI entry check compared `import.meta.url` with `file://${process.argv[1]}`;
 * on native Windows argv[1] is a drive-letter path, so the CLI exited 0 silently and did nothing.
 * Acceptance: (1) the CLI uses the shared isDirectInvocation helper, not the string comparison;
 * (2) run as a real child process it ACTS (rewrites the stale entry); (3) it still acts when argv[1]
 * is spelled differently (relative, backslash, lower-case drive letter); (4) importing it does not
 * run main(); (5) failures are loud (exit 1 + message), never a silent exit 0.
 *
 * The real gitleaks binary is replaced, via the module's own PIPELINE_GITLEAKS_PATH seam, by node
 * itself with a NODE_OPTIONS preload that answers the `detect` call; the CLI, argv parsing and the
 * repair core are all real.
 *
 * Run: node --test plugins/pipeline-core/lib/pins/gitleaks-repair-ignore-cli-is-a-no-op-on-windows.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { gitleaksContentAuthorityLine } from "../../scripts/security-adapters/gitleaks.mjs";
import { isDirectInvocation } from "../entrypoint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const CLI = resolve(REPO_ROOT, "plugins", "pipeline-core", "scripts", "gitleaks-repair-ignore.mjs");
const SCRATCH = join(REPO_ROOT, "scratch");

const REL = "backlog/fixture-cli.txt";
const RULE = "fixture-rule";
const COLUMN = 7;
const OLD_LINE = 3;
const NEW_LINE = 48;
const SECRET = "fixture-secret-value-cli";

const PRELOAD = `
if (require("node:path").basename(String(process.argv[1] || "")) === "detect") {
  const fs = require("node:fs");
  const out = process.argv[process.argv.indexOf("--report-path") + 1];
  fs.writeFileSync(out, fs.readFileSync(process.env.FAKE_GL_REPORT, "utf8"));
  process.exit(0);
}
`;

function makeFixture() {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "gl-repair-cli-pin-"));
  mkdirSync(join(root, "backlog"), { recursive: true });
  writeFileSync(join(root, REL), "fixture content\n");
  const stale = { File: REL, RuleID: RULE, StartLine: OLD_LINE, StartColumn: COLUMN, Secret: SECRET };
  const staleLine = gitleaksContentAuthorityLine(stale);
  const liveFinding = { File: join(root, REL), RuleID: RULE, StartLine: NEW_LINE, StartColumn: COLUMN, Secret: SECRET, Description: "fixture finding" };
  const expectedNew = gitleaksContentAuthorityLine({ ...liveFinding, File: REL });
  writeFileSync(join(root, ".gitleaksignore"), `${staleLine}\n`);
  writeFileSync(join(root, "fake-report.json"), JSON.stringify([liveFinding]));
  writeFileSync(join(root, "preload.cjs"), PRELOAD);
  return { root, staleLine, expectedNew };
}

function env(root) {
  const preload = join(root, "preload.cjs").replace(/\\/gu, "/");
  return {
    ...process.env,
    PIPELINE_GITLEAKS_PATH: process.execPath,
    NODE_OPTIONS: `--require "${preload}"`,
    FAKE_GL_REPORT: join(root, "fake-report.json"),
  };
}

function runCli(root, cliArg, extra = [], opts = {}) {
  const args = ["--path", REL, "--rule", RULE, "--column", String(COLUMN), "--old-line", String(OLD_LINE), "--root", root, ...extra];
  return spawnSync(process.execPath, [cliArg, ...args], { encoding: "utf8", env: env(root), cwd: opts.cwd ?? REPO_ROOT, shell: false, timeout: 60000 });
}

function withFixture(fn) {
  const fx = makeFixture();
  return Promise.resolve(fn(fx)).finally(() => rmSync(fx.root, { recursive: true, force: true }));
}

test("source uses the shared isDirectInvocation helper, not the argv[1] string comparison", () => {
  const src = readFileSync(CLI, "utf8");
  assert.match(src, /import \{ isDirectInvocation \} from "\.\.\/lib\/entrypoint\.mjs"/u);
  assert.match(src, /if \(isDirectInvocation\(import\.meta\.url\)\)/u);
  assert.doesNotMatch(src, /file:\/\/\$\{process\.argv\[1\]\}/u, "the Windows-broken string comparison must be gone");
  assert.doesNotMatch(src, /import\.meta\.url\s*===/u);
});

test("CLI run as a child process ACTS: exit 0, reports the replacement, rewrites the stale entry", async () => {
  await withFixture(({ root, staleLine, expectedNew }) => {
    const r = runCli(root, CLI);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stdout, new RegExp(`replaced stale entry \\(line ${OLD_LINE} -> ${NEW_LINE}\\)`, "u"));
    assert.notEqual(r.stdout.trim(), "", "a silent exit 0 is exactly the defect");
    const text = readFileSync(join(root, ".gitleaksignore"), "utf8");
    assert.equal(text.includes(staleLine), false, "stale entry must be gone");
    assert.ok(text.includes(expectedNew), "recomputed entry must be present");
  });
});

test("CLI still acts when argv[1] is a lower-case drive-letter / backslash / relative spelling", async (t) => {
  const isWin = process.platform === "win32";
  const spellings = [
    ["relative", (cwdRel) => cwdRel, false],
    ["backslash", () => CLI.replace(/\//gu, "\\"), true],
    ["lower-case drive", () => (/^[A-Za-z]:/u.test(CLI) ? CLI[0].toLowerCase() + CLI.slice(1) : CLI), false],
    ["upper-case drive", () => (/^[A-Za-z]:/u.test(CLI) ? CLI[0].toUpperCase() + CLI.slice(1) : CLI), false],
  ];
  for (const [label, make, winOnly] of spellings) {
    if (winOnly && !isWin) {
      t.diagnostic(`host-limitation: ${label} spelling is a win32-only path form; skipped on ${process.platform}`);
      continue;
    }
    await withFixture(({ root, expectedNew }) => {
      const arg = make(relative(REPO_ROOT, CLI));
      const r = runCli(root, arg, [], { cwd: REPO_ROOT });
      assert.equal(r.status, 0, `${label}: stderr=${r.stderr}`);
      assert.match(r.stdout, /replaced stale entry/u, `${label}: CLI must act, not no-op`);
      assert.ok(readFileSync(join(root, ".gitleaksignore"), "utf8").includes(expectedNew), `${label}: entry not rewritten`);
    });
  }
});

test("--recompute acts (prints the reviewed entry) and leaves the ignore file unchanged", async () => {
  await withFixture(({ root, staleLine, expectedNew }) => {
    const r = runCli(root, CLI, ["--recompute"]);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stdout, /ignore file unchanged/u);
    assert.ok(r.stdout.includes(expectedNew));
    assert.equal(readFileSync(join(root, ".gitleaksignore"), "utf8"), `${staleLine}\n`);
  });
});

test("CLI failures are loud: missing flags and no matching entry exit 1 with a message", async () => {
  await withFixture(({ root, staleLine }) => {
    const missing = spawnSync(process.execPath, [CLI, "--root", root], { encoding: "utf8", env: env(root), cwd: REPO_ROOT, shell: false });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /missing required flag/u);

    const nomatch = spawnSync(process.execPath, [CLI, "--path", REL, "--rule", RULE, "--column", String(COLUMN), "--old-line", "99", "--root", root], { encoding: "utf8", env: env(root), cwd: REPO_ROOT, shell: false });
    assert.equal(nomatch.status, 1);
    assert.match(nomatch.stderr, /nothing to repair/u);
    assert.equal(readFileSync(join(root, ".gitleaksignore"), "utf8"), `${staleLine}\n`, "failed repair must not touch the file");
  });
});

test("CLI refuses a value-binding mismatch with exit 1 and does not rewrite", async () => {
  await withFixture(({ root, staleLine }) => {
    const other = JSON.parse(readFileSync(join(root, "fake-report.json"), "utf8"));
    other[0].Secret = "a-different-unreviewed-value";
    writeFileSync(join(root, "fake-report.json"), JSON.stringify(other));
    const r = runCli(root, CLI);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /value-binding-mismatch/u);
    assert.equal(readFileSync(join(root, ".gitleaksignore"), "utf8"), `${staleLine}\n`);
  });
});

test("importing the module does not run main() (no output, no write)", async () => {
  await withFixture(({ root, staleLine }) => {
    const code = `await import(${JSON.stringify(pathToFileURL(CLI).href)});`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code, "--", "--path", REL, "--rule", RULE, "--column", "7", "--old-line", "3", "--root", root], { encoding: "utf8", env: env(root), cwd: REPO_ROOT, shell: false });
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.equal(r.stdout, "");
    assert.equal(readFileSync(join(root, ".gitleaksignore"), "utf8"), `${staleLine}\n`);
  });
});

test("isDirectInvocation accepts drive-letter and mixed-separator spellings of the module path", () => {
  const url = pathToFileURL(CLI).href;
  assert.equal(isDirectInvocation(url, CLI), true);
  assert.equal(isDirectInvocation(url, CLI.replace(/\\/gu, "/")), true, "forward-slash spelling");
  assert.equal(isDirectInvocation(url, relative(process.cwd(), CLI)), true, "relative spelling");
  if (/^[A-Za-z]:/u.test(CLI)) {
    // Node derives import.meta.url from the same-case spelling it was launched with.
    for (const spelled of [CLI[0].toLowerCase() + CLI.slice(1), CLI[0].toUpperCase() + CLI.slice(1)]) {
      assert.equal(isDirectInvocation(pathToFileURL(spelled).href, spelled), true, spelled);
    }
  }
  assert.equal(isDirectInvocation(url, join(HERE, "not-this-module.mjs")), false);
  assert.equal(isDirectInvocation(url, undefined), false);
});

test("CLI acts when invoked through a file symlink (host-limited: skipped when symlinks are unavailable)", async (t) => {
  const fx = makeFixture();
  try {
    const link = join(fx.root, "linked-cli.mjs");
    try {
      symlinkSync(CLI, link, "file");
    } catch (error) {
      t.skip(`host-limitation: file symlink creation unavailable (${error.code ?? "error"})`);
      return;
    }
    const r = runCli(fx.root, link);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stdout, /replaced stale entry/u);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
