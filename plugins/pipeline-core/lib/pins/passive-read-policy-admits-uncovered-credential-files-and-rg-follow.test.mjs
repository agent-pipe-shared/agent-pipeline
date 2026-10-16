// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item
// pipeline.passive-read-policy-admits-uncovered-credential-files-and-rg-follow (AC-225).
//
// Acceptance 1: one shared credential-root constant covers the Spec 21.2 list plus
//   .git-credentials, .pypirc, .netrc, .npmrc and /etc/shadow, applies to every spelling
//   (host, WSL UNC, distro home), and a synthetic-home test proves a refusal per entry.
// Acceptance 2: `rg -L` / `--follow` is refused (the decision pinned here: refused, because
//   in ripgrep -L is --follow, and the policy inventory does not follow symlinks).
//
// Fixtures live under the repository scratch/ (never the OS temp dir). The "mutation" tests
// build a scratch MIRROR of the production module with the defect re-introduced, proving the
// refusal assertions can fail; production files are never edited.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { isAllowedPassiveReadTarget, PASSIVE_READ_CREDENTIAL_ROOTS } from "../passive-read-policy.mjs";
import { isBoundedReadOnlyPipeline, isBoundedSingleRg, parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const libDir = fileURLToPath(new URL("../", import.meta.url));
const hooksDir = fileURLToPath(new URL("../../hooks/", import.meta.url));
const HOST_LIMIT = "HOST-LIMITATION (native Windows host): owner=Coordinator due=2026-10-19, "
  + "to run on the Linux/WSL host (PO decision K7); ";

// Spec 21.2 list + the four appended names (home-relative) and the POSIX absolute path.
const SPEC_HOME_ENTRIES = [".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker",
  ".config/gh", ".config/gcloud", ".codex/auth.json", ".claude/.credentials.json",
  ".gemini/oauth_creds.json", ".netrc", ".git-credentials", ".npmrc", ".pypirc"];
const FILE_ENTRIES = new Set([".codex/auth.json", ".claude/.credentials.json",
  ".gemini/oauth_creds.json", ".netrc", ".git-credentials", ".npmrc", ".pypirc"]);

function makeFixture(t) {
  mkdirSync(join(repoRoot, "scratch"), { recursive: true });
  const fx = mkdtempSync(join(repoRoot, "scratch", "pin-passive-read-"));
  t.after(() => rmSync(fx, { recursive: true, force: true }));
  const root = join(fx, "repo");
  mkdirSync(root);
  writeFileSync(join(root, "notes.txt"), "needle\n");
  return { fx, root };
}

// Create every credential entry plus an ordinary sibling control inside a synthetic home.
function populateHome(home) {
  mkdirSync(home, { recursive: true });
  for (const entry of SPEC_HOME_ENTRIES) {
    const path = join(home, ...entry.split("/"));
    if (FILE_ENTRIES.has(entry)) {
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "synthetic fixture\n");
    } else {
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, "config.txt"), "synthetic fixture\n");
    }
  }
  writeFileSync(join(home, "ordinary.txt"), "harmless\n");
  mkdirSync(join(home, ".config", "other"), { recursive: true });
  writeFileSync(join(home, ".config", "other", "x.txt"), "harmless\n");
}

const injected = { machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }) };

test("one shared, immutable credential-root constant covers the Spec 21.2 list and the item's names", () => {
  const roots = PASSIVE_READ_CREDENTIAL_ROOTS;
  assert.ok(Object.isFrozen(roots) && Object.isFrozen(roots.homeRelativePaths)
    && Object.isFrozen(roots.posixAbsolutePaths) && Object.isFrozen(roots.secretBasenameRegex));
  for (const entry of SPEC_HOME_ENTRIES) {
    assert.ok(roots.homeRelativePaths.includes(entry), `constant lacks ${entry}`);
  }
  assert.ok(roots.posixAbsolutePaths.includes("/etc/shadow"));
  const basename = new RegExp(roots.secretBasenameRegex.source, roots.secretBasenameRegex.flags);
  for (const name of [".git-credentials", ".pypirc", ".netrc", ".npmrc"]) {
    assert.ok(basename.test(name), `basename rule lacks ${name}`);
  }
  assert.equal(basename.test("notes.txt"), false);
  for (const glob of [".git-credentials", ".pypirc", ".netrc", ".npmrc"]) {
    assert.ok(roots.recursiveInventoryGlobs.includes(glob), `recursive inventory lacks ${glob}`);
  }
});

for (const [label, build] of [
  ["host home", (fx) => join(fx, "home")],
  ["distro home (second synthetic home)", (fx) => join(fx, "distro-home")],
]) {
  test(`synthetic-home: every credential entry is refused (${label}), absolute and ~ spellings`, (t) => {
    const { fx, root } = makeFixture(t);
    const home = build(fx);
    populateHome(home);
    const context = { rootDir: root, homeDir: home, ...injected };
    // Controls: the fixture is otherwise readable, so a refusal is attributable to the credential rule.
    assert.equal(isAllowedPassiveReadTarget(join(home, "ordinary.txt"), context), true);
    assert.equal(isAllowedPassiveReadTarget(join(home, ".config", "other", "x.txt"), context), true);
    for (const entry of SPEC_HOME_ENTRIES) {
      const abs = join(home, ...entry.split("/"));
      const probe = FILE_ENTRIES.has(entry) ? abs : join(abs, "config.txt");
      assert.equal(isAllowedPassiveReadTarget(probe, context), false, `absolute exact read admitted: ${entry}`);
      assert.equal(isAllowedPassiveReadTarget(`~/${entry}${FILE_ENTRIES.has(entry) ? "" : "/config.txt"}`, context),
        false, `~ spelling admitted: ${entry}`);
      if (!FILE_ENTRIES.has(entry)) {
        assert.equal(isAllowedPassiveReadTarget(abs, { ...context, directoryListing: true }), false,
          `directory listing admitted: ${entry}`);
        assert.equal(isAllowedPassiveReadTarget(abs, { ...context, recursive: true }), false,
          `recursive search admitted: ${entry}`);
      }
    }
  });
}

test("WSL UNC spellings (both) are refused for every credential entry", (t) => {
  const { fx, root } = makeFixture(t);
  const home = join(fx, "home");
  populateHome(home);
  const context = { rootDir: root, homeDir: home, ...injected };
  const entries = [...SPEC_HOME_ENTRIES, ".config/gh/hosts.yml", ".ssh/id_ed25519"];
  for (const prefix of ["\\\\wsl.localhost\\Ubuntu\\home\\dev\\", "\\\\wsl$\\Ubuntu\\home\\dev\\",
    "//wsl.localhost/Ubuntu/home/dev/", "//wsl$/Ubuntu/home/dev/"]) {
    for (const entry of entries) {
      const raw = prefix + (prefix.includes("\\") ? entry.replaceAll("/", "\\") : entry);
      assert.equal(isAllowedPassiveReadTarget(raw, context), false, `UNC admitted: ${raw}`);
    }
  }
});

test("/etc/shadow is a declared credential path and is refused on POSIX hosts", (t) => {
  assert.deepEqual([...PASSIVE_READ_CREDENTIAL_ROOTS.posixAbsolutePaths], ["/etc/shadow"]);
  const skip = process.platform === "win32"
    ? HOST_LIMIT + "/etc/shadow behavioral refusal needs a POSIX path namespace" : false;
  if (skip) { t.skip(skip); return; }
  const { fx, root } = makeFixture(t);
  const home = join(fx, "home");
  populateHome(home);
  assert.equal(isAllowedPassiveReadTarget("/etc/shadow", { rootDir: root, homeDir: home, ...injected }), false);
});

test("symlink alias to a home holding credentials is refused (directory symlink case)", (t) => {
  if (process.platform === "win32") {
    t.skip(HOST_LIMIT + "directory symlinks are unavailable without privilege on this host");
    return;
  }
  const { fx, root } = makeFixture(t);
  const home = join(fx, "home");
  populateHome(home);
  symlinkSync(home, join(root, "link"), "dir");
  const context = { rootDir: root, homeDir: home, recursive: true, ...injected };
  assert.equal(isAllowedPassiveReadTarget(join(root, "link"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(root, "link", ".git-credentials"), context), false);
});

function withoutRipgrepConfig(t) {
  const saved = process.env.RIPGREP_CONFIG_PATH;
  delete process.env.RIPGREP_CONFIG_PATH;
  t.after(() => { if (saved !== undefined) process.env.RIPGREP_CONFIG_PATH = saved; });
}

test("rg -L / --follow is refused in every spelling; plain rg control is admitted", (t) => {
  withoutRipgrepConfig(t);
  const { root } = makeFixture(t);
  assert.equal(isBoundedSingleRg(["-n", "needle", "notes.txt"], root), true, "control must be admitted");
  assert.equal(isBoundedSingleRg(["--files"], root), true, "--files control must be admitted");
  const refused = [
    ["-L", "-n", "needle", "notes.txt"],
    ["-n", "-L", "needle", "notes.txt"],
    ["-nL", "needle", "notes.txt"],
    ["--follow", "-n", "needle", "notes.txt"],
    ["--follow=true", "needle", "notes.txt"],
    ["-L", "-e", "needle", "notes.txt"],
    ["-L", "-l", "needle", "notes.txt"],
    ["--files", "-L"],
    ["--files", "--follow"],
  ];
  for (const argv of refused) assert.equal(isBoundedSingleRg(argv, root), false, `admitted: rg ${argv.join(" ")}`);
});

test("rg -L / --follow is refused through the command parser and the bounded pipelines", (t) => {
  withoutRipgrepConfig(t);
  const { root } = makeFixture(t);
  const ok = parseGuardCommand("rg -n needle notes.txt | head -n 5", root, { platform: "linux" });
  assert.equal(isBoundedReadOnlyPipeline(ok, root), true, "control pipeline must be admitted");
  for (const command of ["rg -L -n needle notes.txt | head -n 5", "rg --follow -n needle notes.txt | head -5",
    "rg -n needle notes.txt | rg -L needle", "rg --files --follow | head -n 5"]) {
    const parsed = parseGuardCommand(command, root, { platform: "linux" });
    assert.equal(isBoundedReadOnlyPipeline(parsed, root), false, `admitted: ${command}`);
  }
});

// ---- Mutation (RED) evidence: scratch mirrors with the original defects re-introduced ----

function mirrorSource(sourcePath, replacements) {
  let text = readFileSync(sourcePath, "utf8");
  for (const [from, to] of replacements) {
    assert.ok(text.includes(from), `mirror anchor missing: ${from}`);
    text = text.replace(from, to);
  }
  return text;
}

test("RED mirror: without .git-credentials/.pypirc in the basename rule they are admitted (pin can fail)", async (t) => {
  const { fx, root } = makeFixture(t);
  const home = join(fx, "home");
  populateHome(home);
  const mirrorPath = join(fx, "passive-read-policy.mirror.mjs");
  writeFileSync(mirrorPath, mirrorSource(join(libDir, "passive-read-policy.mjs"), [
    ['"./machine-plane.mjs"', JSON.stringify(pathToFileURL(join(libDir, "machine-plane.mjs")).href)],
    ['"./po-key-directory.mjs"', JSON.stringify(pathToFileURL(join(libDir, "po-key-directory.mjs")).href)],
    ["\\\\.(?:npmrc|netrc|git-credentials|pypirc)", "\\\\.(?:npmrc|netrc)"],
  ]));
  const mirror = await import(pathToFileURL(mirrorPath).href);
  const context = { rootDir: root, homeDir: home, ...injected };
  for (const name of [".git-credentials", ".pypirc"]) {
    assert.equal(mirror.isAllowedPassiveReadTarget(join(home, name), context), true,
      `mirror should (wrongly) admit ${name}`);
    assert.equal(isAllowedPassiveReadTarget(join(home, name), context), false, `production refuses ${name}`);
  }
});

test("RED mirror: with -L added to the rg boolean set it is admitted (pin can fail)", async (t) => {
  withoutRipgrepConfig(t);
  const { fx, root } = makeFixture(t);
  const mirrorPath = join(fx, "guard-command-grammar.mirror.mjs");
  writeFileSync(mirrorPath, mirrorSource(join(hooksDir, "guard-command-grammar.mjs"), [
    ['"../lib/git-cmd.mjs"', JSON.stringify(pathToFileURL(join(libDir, "git-cmd.mjs")).href)],
    ['"../lib/passive-read-policy.mjs"', JSON.stringify(pathToFileURL(join(libDir, "passive-read-policy.mjs")).href)],
    ['"-n", "--line-number",', '"-L", "--follow", "-n", "--line-number",'],
  ]));
  const mirror = await import(pathToFileURL(mirrorPath).href);
  assert.equal(mirror.isBoundedSingleRg(["-L", "-n", "needle", "notes.txt"], root), true, "mirror admits -L");
  assert.equal(isBoundedSingleRg(["-L", "-n", "needle", "notes.txt"], root), false, "production refuses -L");
});
