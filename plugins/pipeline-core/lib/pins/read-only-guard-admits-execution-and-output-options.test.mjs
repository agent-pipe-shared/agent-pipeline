// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.read-only-guard-admits-execution-and-output-options
// (AC-240, slice ALF-C-P9-03). Each case exercises the real guard modules; the only injection
// seams used are the documented ones of isAllowedPassiveReadTarget (homeDir, machinePlaneRead,
// repoKeyDirectory). Fixtures live under the repository scratch/ directory.
//
// Acceptance points:
//   A1 closed per-command grammars: no output/executable option in a passive read lane
//      (rg --pre family, node reporter/loader options, git --output/-o/--ext-diff/--textconv,
//       git fetch --upload-pack, git -C, git config --edit)
//   A2 single commands, shell chains and supported pipelines, PowerShell forms; an external
//      user Markdown report stays readable
//   A3 direct/aliased signing keys and declared credential roots denied in every read lane
//      (`~`, `..`, Windows drive spelling, directory scans; directory symlinks are host-limited)
import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isReadOnlyDiagnosticCommand } from "../guard/shell-grammar.mjs";
import { isAllowedPassiveReadTarget } from "../passive-read-policy.mjs";
import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..", "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const fixture = mkdtempSync(join(scratchBase, "p903-"));
test.after(() => rmSync(fixture, { recursive: true, force: true }));

const HOST_LIMIT = (what) => `host-limitation: ${what} unavailable on this native Windows host; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)`;
const guard = (command) => isReadOnlyDiagnosticCommand(command, repoRoot);
const hermetic = { machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }) };

// ---------------------------------------------------------------- A1: rg
test("A1 rg: ordinary search is admitted (positive control)", () => {
  assert.equal(guard("rg -n needle README.md"), true);
});

for (const command of [
  "rg --pre=cat needle README.md",
  "rg --pre cat needle README.md",
  "rg --pre=cat -n needle plugins",
  "rg --hostname-bin=x needle README.md",
  "rg --json needle README.md",
  "rg --no-config needle README.md",
  "rg -n needle README.md --pre-glob=*.md",
]) {
  test(`A1 rg: execution/output option denied: ${command}`, () => {
    assert.equal(guard(command), false);
  });
}

// ------------------------------------------------- A2: chains and pipelines
for (const command of [
  "rg --pre=cat needle README.md | head -5",
  "rg --pre cat needle README.md | rg x",
  "rg -n needle README.md && rg --pre=cat needle README.md",
]) {
  test(`A2 rg option stays denied inside a chain or pipeline: ${command}`, () => {
    assert.equal(guard(command), false);
  });
}
test("A2 rg chain/pipeline positive controls", () => {
  assert.equal(guard("rg -n needle README.md | head -5"), true);
  assert.equal(guard("rg -n needle README.md && rg -n needle README.md"), true);
});

// ---------------------------------------------------------------- A1: node
test("A1 node: reporter destination and loader options are not a passive read", () => {
  assert.equal(guard("node --test-reporter-destination=out.txt a.test.mjs"), false);
  assert.equal(guard("node --test --test-reporter-destination=out.txt a.test.mjs"), false);
  assert.equal(guard("node --require ./x.cjs a.test.mjs"), false);
  assert.equal(guard("node --import ./x.mjs a.test.mjs"), false);
});

// ---------------------------------------------------------------- A1: git
for (const command of [
  "git diff --output=x.txt",
  "git diff --output x.txt",
  "git log --output=x.txt",
  "git show --output=x.txt HEAD",
  "git diff -o x.txt",
  "git log -ofoo",
  "git diff --ext-diff",
  "git diff --textconv",
  "git diff --no-index a b",
]) {
  test(`A1 git: output/execution option denied: ${command}`, () => {
    assert.equal(guard(command), false);
  });
}
test("A1 git: ordinary read subcommands are admitted (positive control)", () => {
  assert.equal(guard("git diff --stat"), true);
  assert.equal(guard("git log --format=%H"), true);
  assert.equal(guard("git status"), true);
});
test("A1 git: -c config injection is denied", () => {
  assert.equal(guard("git -c core.pager=calc diff"), false);
});
// RED against current source (see report): the commands below are admitted.
test("A1 git fetch: --upload-pack executes a program and must not be a passive read", () => {
  assert.equal(guard("git fetch --upload-pack=calc"), false);
  assert.equal(guard("git fetch --upload-pack calc origin"), false);
});
test("A1 git -C: redirecting to a directory outside the project is not a passive read", () => {
  assert.equal(guard("git -C .. status"), false);
  assert.equal(guard("git -C /outside/repo status"), false);
});
test("A1 git config: --edit launches an editor and must not be a passive read", () => {
  assert.equal(guard("git config --list --edit"), false);
  assert.equal(guard("git config -l -e"), false);
  assert.equal(guard("git config --get-regexp x --file x"), false);
});
// ALF-C-P9-03B regression cases: further refused shapes and the admitted controls.
test("A1 git fetch: helper/executable-naming options and URL transports stay refused", () => {
  for (const command of ["git fetch -u calc", "git fetch --server-option=x", "git fetch -c core.x=y",
    "git fetch ext::calc", "git fetch origin main:other"]) assert.equal(guard(command), false, command);
});
test("A1 git fetch: plain fetches stay admitted (control)", () => {
  for (const command of ["git fetch", "git fetch origin", "git fetch --all --prune", "git fetch origin main"]) {
    assert.equal(guard(command), true, command);
  }
});
test("A1 git -C: a directory inside the project stays admitted (control); missing arg refused", () => {
  assert.equal(guard("git -C . status"), true);
  assert.equal(guard("git -C plugins status"), true);
  assert.equal(guard("git -C"), false);
});
test("A1 git config: other write/edit/file flags refused; pure reads admitted (control)", () => {
  for (const command of ["git config --list --blob x", "git config -l -f x", "git config --list --add",
    "git config --get x --unset", "git config --list --unknown-flag"]) assert.equal(guard(command), false, command);
  for (const command of ["git config --list", "git config -l --show-origin", "git config --get user.name",
    "git config --get-regexp x --local", "git config --list --type=bool", "git config --list -z"]) {
    assert.equal(guard(command), true, command);
  }
});

// ---- ALF-C-C6G1-CORR-A (Critic C6g1 F3/F4): git accepts any unambiguous abbreviation of a long option, and `git diff <path> <path>`
// behaves as `git diff --no-index` when a path lies outside the repository. Cases titled with NEEDS_PATCH are RED on a tree without
// the protected-file patch scratch/patches/ALF-C-C6G1-CORR-A.patch (lib/guard/shell-grammar.mjs) and GREEN with it.
const NEEDS_PATCH = "needs protected patch ALF-C-C6G1-CORR-A";

/** Create a directory alias (symlink; a junction where the host denies unprivileged symlinks) or report null: the host capability probe. */
function removeDirectoryAlias(link) {
  try { unlinkSync(link); } catch { try { rmdirSync(link); } catch { /* already gone */ } }
}
function makeDirectoryAlias(target, link) {
  for (const kind of process.platform === "win32" ? ["dir", "junction"] : ["dir"]) {
    try {
      symlinkSync(target, link, kind);
      if (lstatSync(link).isSymbolicLink()) return kind;
    } catch { /* this alias kind is unavailable on this host; try the next */ }
    removeDirectoryAlias(link);
  }
  return null;
}

for (const command of [
  "git diff --out=x.txt", "git diff --outp x.txt", "git log --outpu=x.txt", "git show --ou=x.txt HEAD", "git diff --o x.txt",
  "git diff --ext", "git diff --ext-d", "git log -p --ext-diff=x", "git diff --textc", "git show --textco HEAD",
  "git diff --no-ind a b", "git diff --no-i a b", "git diff --no-index=x a b",
]) {
  test(`A1 git: abbreviated long option denied (${NEEDS_PATCH}): ${command}`, () => {
    assert.equal(guard(command), false);
  });
}
test(`A1 git: an abbreviated output/execution option stays denied inside a pipeline and a chain (${NEEDS_PATCH})`, () => {
  for (const command of ["git diff --out=x.txt | head -5", "git log --no-ind a b | head -5", "git log -p --ext | head -5",
    "rg -n needle README.md && git diff --out=x.txt"]) assert.equal(guard(command), false, command);
});
test("A1 git: unrelated long options are not caught by the prefix rule (control)", () => {
  for (const command of ["git diff --stat", "git diff --name-only", "git log --oneline", "git log --no-merges",
    "git diff --exit-code", "git log --format=%H"]) assert.equal(guard(command), true, command);
});

// ---- ALF-C-C6G1-CORR-A2 (PO decision 2026-10-17): the prefix rule refines to "an exact harmless option is admitted, an abbreviation
// of a denied name stays refused". An exact, complete option name wins over an abbreviation, so `--text` (diff -a: treat all files as
// text) is a complete harmless option even though it is also a prefix of `--textconv`. Measured with
// `git <subcommand> --git-completion-helper` over every admitted subcommand, `--text` is the only exact option that is a strict prefix
// of a denied name (--output, --ext-diff, --textconv, --no-index). Cases titled with REFINED_BY_A2 are RED on a tree carrying only the
// original patch ALF-C-C6G1-CORR-A (it refuses every prefix) and GREEN with scratch/patches/ALF-C-C6G1-CORR-A2.patch, which replaces
// it; the NEEDS_PATCH cases above are satisfied by the A2 patch as well.
const REFINED_BY_A2 = "refined by protected patch ALF-C-C6G1-CORR-A2";
test(`A1 git: the exact harmless option --text is admitted although it is a prefix of --textconv (${REFINED_BY_A2})`, () => {
  for (const command of ["git diff --text", "git diff --text --stat", "git diff --text HEAD~1 HEAD", "git diff --text -- README.md",
    "git log -p --text", "git show --text HEAD"]) assert.equal(guard(command), true, command);
});
test(`A1 git: the exact harmless option --text stays admitted inside a pipeline and a chain (${REFINED_BY_A2})`, () => {
  for (const command of ["git diff --text | head -5", "git log -p --text | head -5", "rg -n needle README.md && git diff --text"]) {
    assert.equal(guard(command), true, command);
  }
});
test("A1 git: -a and the negated harmless options are admitted (control)", () => {
  for (const command of ["git diff -a", "git diff --no-ext-diff", "git diff --no-textconv", "git diff --exit-code"]) {
    assert.equal(guard(command), true, command);
  }
});
test("A1 git: an abbreviation of a denied option stays denied beside the admitted exact --text", () => {
  for (const command of ["git diff --tex", "git diff --te", "git diff --t", "git diff --textc", "git diff --textco", "git diff --text --textc",
    "git diff --ext", "git diff --text --ext", "git diff --text --ext-d", "git diff --text --out=x.txt", "git diff --text --no-ind a b"]) {
    assert.equal(guard(command), false, command);
  }
});
test("A1 git: the glued =value form of --text and of every denied name stays denied", () => {
  for (const command of ["git diff --text=x", "git diff --text=1", "git log -p --text=x", "git diff --textconv=cat", "git diff --ext-diff=x",
    "git diff --output=x.txt", "git diff --no-index=x a b", "git diff --text --textconv"]) assert.equal(guard(command), false, command);
});
test("A1 git: an abbreviation or a glued value stays denied inside a pipeline and a chain beside --text", () => {
  for (const command of ["git diff --tex | head -5", "git diff --text=x | head -5", "git log -p --text --ext | head -5",
    "rg -n needle README.md && git diff --text=x", "rg -n needle README.md && git diff --tex"]) assert.equal(guard(command), false, command);
});

for (const command of [
  "git diff /outside-root-c6g1/a /outside-root-c6g1/b", "git diff -- /outside-root-c6g1/a /outside-root-c6g1/b",
  "git diff ../outside-a ../outside-b", "git diff README.md ../outside-b", "git log -p -- ../outside-a",
  "git show HEAD -- /outside-root-c6g1/a", "git diff ~/outside-a ~/outside-b", "git diff -- ~/outside-a README.md",
]) {
  test(`A1 git: a path operand outside the project root is not a passive read (${NEEDS_PATCH}): ${command}`, () => {
    assert.equal(guard(command), false);
  });
}
if (process.platform === "win32") {
  test(`A1 git: a drive-relative path operand cannot be resolved and is refused (${NEEDS_PATCH})`, () => {
    assert.equal(guard("git diff C:foo C:bar"), false);
    assert.equal(guard("git diff -- C:foo"), false);
  });
}
test(`A1 git: an operand that resolves outside the project through a directory alias is refused (${NEEDS_PATCH})`, (t) => {
  const alias = join(fixture, "outside-alias");
  if (makeDirectoryAlias(dirname(repoRoot), alias) === null) { t.skip(HOST_LIMIT("directory symlinks")); return; }
  try {
    const rel = relative(repoRoot, alias).replaceAll("\\", "/");
    assert.equal(guard(`git diff ${rel}/a ${rel}/b`), false);
    assert.equal(guard(`git diff -- ${rel}/a`), false);
  } finally { removeDirectoryAlias(alias); }
});
test("A1 git: project-relative revisions and pathspecs stay admitted (control)", () => {
  for (const command of ["git diff README.md", "git diff HEAD~1 HEAD", "git diff HEAD -- README.md", "git log --oneline -n 5 -- plugins",
    "git log main..HEAD", "git show HEAD"]) assert.equal(guard(command), true, command);
});
test("A1 git -C: a symlinked directory is rejected even when it resolves inside the project; a real one is admitted", (t) => {
  const real = join(fixture, "gitc-real");
  const link = join(fixture, "gitc-link");
  mkdirSync(real, { recursive: true });
  if (makeDirectoryAlias(real, link) === null) { t.skip(HOST_LIMIT("directory symlinks")); return; }
  try {
    const rel = (path) => relative(repoRoot, path).replaceAll("\\", "/");
    assert.equal(guard(`git -C ${rel(real)} status`), true, "control: a real directory inside the project");
    assert.equal(guard(`git -C ${rel(link)} status`), false);
  } finally { removeDirectoryAlias(link); }
});

// ------------------------------------------- A2: PowerShell and native forms
// The PowerShell fixed-read dialect is parsed by guard-command-grammar but is not itself a
// read-only admission in isReadOnlyDiagnosticCommand (its admission lives in the hook layer,
// not pinned here); this case pins only that it never becomes a credential-reading shell lane.
test("A2 PowerShell Get-Content: parsed as a fixed read, credential target not admitted", () => {
  const key = join(homedir(), ".ssh", "id_rsa");
  const parsed = parseGuardCommand(`Get-Content ${key}`, repoRoot);
  assert.equal(parsed.dialect, "powershell-fixed-read");
  assert.equal(guard(`Get-Content ${key}`), false);
  assert.equal(guard("Get-Content -Path ~/.ssh/id_rsa"), false);
});

test("A2 external user Markdown report remains readable; neighbouring secret does not", () => {
  const home = join(fixture, "home-a2");
  const project = join(fixture, "project-a2");
  mkdirSync(join(home, "Documents"), { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true });
  mkdirSync(project, { recursive: true });
  const report = join(home, "Documents", "report.md");
  writeFileSync(report, "# report\n");
  writeFileSync(join(home, ".ssh", "id_rsa"), "synthetic\n");
  const opts = { rootDir: project, homeDir: home, ...hermetic };
  assert.equal(isAllowedPassiveReadTarget(report, opts), true);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".ssh", "id_rsa"), opts), false);
});

// ------------------------------------------------- A3: credential roots
const credentialFixture = () => {
  const home = join(fixture, "home-a3");
  const project = join(fixture, "project-a3");
  for (const dir of [".ssh", ".aws", ".gnupg", "docs"]) mkdirSync(join(home, dir), { recursive: true });
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(home, ".ssh", "id_rsa"), "synthetic\n");
  writeFileSync(join(home, ".ssh", "id_ed25519"), "synthetic\n");
  writeFileSync(join(home, ".aws", "credentials"), "synthetic\n");
  writeFileSync(join(home, "docs", "po-private.pem"), "synthetic\n");
  writeFileSync(join(project, "po-private.pem"), "synthetic\n");
  writeFileSync(join(project, "src", "a.txt"), "a\n");
  return { home, project, opts: { rootDir: project, homeDir: home, ...hermetic } };
};

test("A3 direct credential files denied", () => {
  const { home, project, opts } = credentialFixture();
  for (const target of [
    join(home, ".ssh", "id_rsa"), join(home, ".ssh", "id_ed25519"), join(home, ".aws", "credentials"),
    join(home, "docs", "po-private.pem"), join(project, "po-private.pem"),
  ]) {
    assert.equal(isAllowedPassiveReadTarget(target, opts), false, target);
  }
});

test("A3 `~` spelling denied", () => {
  const { opts } = credentialFixture();
  assert.equal(isAllowedPassiveReadTarget("~/.ssh/id_rsa", opts), false);
  assert.equal(isAllowedPassiveReadTarget("~/.aws/credentials", opts), false);
  assert.equal(isAllowedPassiveReadTarget("~/.ssh", { ...opts, directoryListing: true }), false);
});

test("A3 `..` traversal spelling denied", () => {
  const { home, opts } = credentialFixture();
  assert.equal(isAllowedPassiveReadTarget(`${home}/docs/../.ssh/id_rsa`, opts), false);
  assert.equal(isAllowedPassiveReadTarget("../home-a3/.ssh/id_rsa", opts), false);
});

test("A3 Windows drive spelling denied", { skip: process.platform === "win32" ? false : HOST_LIMIT("Windows drive-letter spelling (non-win32 host)") }, () => {
  const { home, opts } = credentialFixture();
  const target = join(home, ".ssh", "id_rsa");
  const lowerDrive = target.replace(/^[A-Za-z]:/u, (d) => d.toLowerCase());
  const upperDrive = target.replace(/^[A-Za-z]:/u, (d) => d.toUpperCase());
  for (const spelling of [lowerDrive, upperDrive, target.replace(/\\/gu, "/"), lowerDrive.replace(/\\/gu, "/"),
    target.toUpperCase()]) {
    assert.equal(isAllowedPassiveReadTarget(spelling, opts), false, spelling);
  }
});

test("A3 directory scans that reach credential descendants are denied", () => {
  const { home, project, opts } = credentialFixture();
  assert.equal(isAllowedPassiveReadTarget(home, { ...opts, recursive: true }), false);
  assert.equal(isAllowedPassiveReadTarget(home, { ...opts, directoryListing: true }), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".ssh"), { ...opts, recursive: true }), false);
  // a project directory holding a secret-named file is not recursively scannable
  assert.equal(isAllowedPassiveReadTarget(project, { ...opts, recursive: true }), false);
  // a clean subdirectory stays scannable
  assert.equal(isAllowedPassiveReadTarget(join(project, "src"), { ...opts, recursive: true }), true);
});

test("A3 credential roots denied through the shell lanes (single, chain, pipeline)", () => {
  const key = join(homedir(), ".ssh", "id_rsa").replace(/\\/gu, "/");
  for (const command of [
    "cat ~/.ssh/id_rsa", `cat ${key}`, "head -5 ~/.ssh/id_rsa", "rg -n x ~/.ssh", "grep x ~/.aws/credentials",
    "rg -n x README.md && cat ~/.ssh/id_rsa", "rg -n x ~/.ssh | head -5", "cat ~/.ssh/id_rsa | head -5",
    "cat ../../.ssh/id_rsa", "rg -n x README.md && rg -n x ~/.gnupg",
  ]) {
    assert.equal(guard(command), false, command);
  }
});

// ALF-C-C6G1-CORR-A (F4): real bodies. Each probes the host capability inside the test and skips only when the host genuinely lacks it.
test("A3 directory symlink alias to a credential root", (t) => {
  const { home, project, opts } = credentialFixture();
  const sshAlias = join(project, "ssh-alias");
  const homeAlias = join(project, "home-alias");
  const srcAlias = join(project, "src-alias");
  const made = [];
  try {
    for (const [target, link] of [[join(home, ".ssh"), sshAlias], [home, homeAlias], [join(project, "src"), srcAlias]]) {
      if (makeDirectoryAlias(target, link) === null) { t.skip(HOST_LIMIT("directory symlinks")); return; }
      made.push(link);
    }
    for (const target of [sshAlias, join(sshAlias, "id_rsa"), join(sshAlias, "id_ed25519"), join(homeAlias, ".ssh", "id_rsa"),
      join(homeAlias, ".aws", "credentials")]) assert.equal(isAllowedPassiveReadTarget(target, opts), false, target);
    for (const alias of [sshAlias, homeAlias]) {
      assert.equal(isAllowedPassiveReadTarget(alias, { ...opts, recursive: true }), false, `${alias} recursive`);
      assert.equal(isAllowedPassiveReadTarget(alias, { ...opts, directoryListing: true }), false, `${alias} listing`);
    }
    assert.equal(isAllowedPassiveReadTarget(join(srcAlias, "a.txt"), opts), true, "control: an alias to a harmless project directory stays readable");
  } finally { for (const link of made) removeDirectoryAlias(link); }
});
test("A3 directory mode-bit variants of a credential root", (t) => {
  const { home, opts } = credentialFixture();
  const sshDir = join(home, ".ssh");
  const modeOf = () => statSync(sshDir).mode & 0o777;
  try {
    chmodSync(sshDir, 0o755);
    const honoured755 = modeOf() === 0o755;
    chmodSync(sshDir, 0o711);
    if (!honoured755 || modeOf() !== 0o711) { t.skip(HOST_LIMIT("directory mode bits")); return; }
    for (const mode of [0o700, 0o755, 0o777, 0o711, 0o500, 0o555, 0o000]) {
      chmodSync(sshDir, mode);
      for (const target of [sshDir, join(sshDir, "id_rsa"), join(sshDir, "id_ed25519")]) {
        assert.equal(isAllowedPassiveReadTarget(target, opts), false, `${target} (mode ${mode.toString(8)})`);
      }
      assert.equal(isAllowedPassiveReadTarget(sshDir, { ...opts, recursive: true }), false, `recursive (mode ${mode.toString(8)})`);
      assert.equal(isAllowedPassiveReadTarget(home, { ...opts, recursive: true }), false, `home scan (mode ${mode.toString(8)})`);
    }
  } finally { chmodSync(sshDir, 0o700); }
});

// ------------------- mutation proof: the rg option check is what makes the cases meaningful
test("meaningful: weakening the rg option check in a scratch mirror admits --pre (RED mirror)", async () => {
  const sourcePath = join(pluginRoot, "hooks", "guard-command-grammar.mjs");
  const source = readFileSync(sourcePath, "utf8");
  const needle = 'arg.includes("=") || (!booleans.has(arg) && !values.has(arg))';
  assert.ok(source.includes(needle), "production anchor for the mirror mutation must exist");
  const libUrl = pathToFileURL(join(pluginRoot, "lib") + "/").href;
  const mirrorSource = source.replaceAll('from "../lib/', `from "${libUrl}`).replace(needle, "false");
  const mirrorPath = join(fixture, "grammar-mirror.mjs");
  writeFileSync(mirrorPath, mirrorSource);
  const mirror = await import(pathToFileURL(mirrorPath).href);
  const production = await import(pathToFileURL(sourcePath).href);
  assert.equal(production.isBoundedSingleRg(["--pre=cat", "needle", "README.md"], repoRoot), false);
  assert.equal(mirror.isBoundedSingleRg(["--pre=cat", "needle", "README.md"], repoRoot), true,
    "the mirror without the option check must admit --pre, proving the production denial is load-bearing");
});
