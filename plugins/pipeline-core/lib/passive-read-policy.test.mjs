// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import * as policyModule from "./passive-read-policy.mjs";
import { isAllowedPassiveReadTarget } from "./passive-read-policy.mjs";

test("recursive additional roots are exact physical boundaries and retain project key authority", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "passive-additional-root-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo"), home = join(fixture, "home");
  const plugin = join(fixture, "plugin"), sibling = join(fixture, "plugin-sibling");
  const keys = join(fixture, "keys");
  for (const directory of [root, home, plugin, sibling, keys]) mkdirSync(directory);
  writeFileSync(join(plugin, "index.mjs"), "export const value = 1;\n");
  writeFileSync(join(sibling, "readme.md"), "harmless\n");
  writeFileSync(join(keys, "ordinary.md"), "synthetic fixture\n");
  mkdirSync(join(home, ".ssh"));
  writeFileSync(join(home, ".ssh", "ordinary.md"), "synthetic fixture\n");
  const context = { rootDir: root, homeDir: home, recursive: true,
    additionalRecursiveRoots: [plugin],
    machinePlaneRead: () => ({ status: "absent" }),
    repoKeyDirectory: (project) => {
      assert.equal(project, root, "key authority remains bound to original project");
      return { status: "valid", directory: keys };
    },
  };
  assert.equal(isAllowedPassiveReadTarget(plugin, context), true);
  // D96 (PO decision 2026-10-22, with the 2026-09-10 correction recorded in
  // docs/adr/draft-read-scope-containment-boundary.md; QG-04 restatement): an ordinary directory outside the
  // repository is no longer refused merely for being outside it. These two assertions used to say "false" for
  // that reason alone. The credential intent they sat next to is unchanged: the additional-root boundary rules,
  // the key-directory/alias/secret-file refusals and the unknown-configuration fail-closed cases below still hold,
  // and the inventory negative controls at the end of this test cover the same two directories.
  assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: [] }), true,
    "D96: an ordinary outside directory is admitted without an additional root");
  assert.equal(isAllowedPassiveReadTarget(sibling, context), true,
    "D96: a sibling directory outside the repository is no longer refused for being outside");
  assert.equal(isAllowedPassiveReadTarget("plugin", context), false, "relative paths resolve only in project");
  assert.equal(isAllowedPassiveReadTarget(join(plugin, "..", "plugin") + "/../plugin", context), false);
  // A malformed or relevant-but-unusable boundary still fails the target closed. D96 (QG-04 restatement): a missing
  // directory and a file are UNRELATED to this target, so they neither deny nor admit it; the target is then judged on
  // its own content, and an ordinary outside directory is admitted (it used to be refused for being outside).
  for (const boundary of [null, "plugin", plugin + "/.."]) {
    assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: [boundary] }), false);
  }
  for (const boundary of [join(fixture, "missing"), join(plugin, "index.mjs")]) {
    assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: [boundary] }), true);
  }
  assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: plugin }), false);
  const escape = join(plugin, "outside");
  symlinkSync(sibling, escape, process.platform === "win32" ? "junction" : "dir");
  // D96: a link inside the boundary that leaves it for an ordinary directory is no longer refused for leaving; the
  // boundary-exactness of additional roots is still pinned by the next assertion (a link cannot BE a boundary).
  assert.equal(isAllowedPassiveReadTarget(escape, context), true);
  assert.equal(isAllowedPassiveReadTarget(escape, { ...context, additionalRecursiveRoots: [escape] }), false);
  const alias = join(plugin, "key-alias");
  symlinkSync(keys, alias, process.platform === "win32" ? "junction" : "dir");
  assert.equal(isAllowedPassiveReadTarget(join(alias, "ordinary.md"), context), false);
  assert.equal(isAllowedPassiveReadTarget(keys, { ...context, additionalRecursiveRoots: [keys] }), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".ssh"), {
    ...context, additionalRecursiveRoots: [join(home, ".ssh")],
  }), false);
  assert.equal(isAllowedPassiveReadTarget(plugin, {
    ...context, machinePlaneRead: () => ({ status: "invalid" }),
  }), false);
  assert.equal(isAllowedPassiveReadTarget(plugin, {
    ...context, repoKeyDirectory: () => ({ status: "invalid" }),
  }), false);
  writeFileSync(join(plugin, "po-private.pem"), "synthetic fixture\n");
  assert.equal(isAllowedPassiveReadTarget(plugin, context), false, "recursive inventory still excludes keys");
  // D96 negative controls (credential intent kept): the same outside directories are refused as soon as they hold
  // key material, with or without an additional root.
  assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: [] }), false);
  writeFileSync(join(sibling, "id_rsa"), "synthetic fixture\n");
  assert.equal(isAllowedPassiveReadTarget(sibling, context), false, "an outside directory holding a key file stays refused");
  assert.equal(isAllowedPassiveReadTarget(escape, context), false, "a link to a directory holding a key file stays refused");
});

test("mixed exact-file and directory roots keep the transcript exact and memory recursively bounded", (t) => {
  const fixture = mkdtempSync(join("/var/tmp", "passive-root-interop-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo"), home = join(fixture, "home");
  const session = join(fixture, "session"), memory = join(session, "memory");
  const transcript = join(session, "session.jsonl"), memoryFile = join(memory, "learned.md");
  const sibling = join(session, "sibling.md"), local = join(root, "local.md");
  for (const directory of [root, home, session, memory]) mkdirSync(directory);
  for (const file of [transcript, memoryFile, sibling, local]) writeFileSync(file, "fixture\n");
  const context = {
    rootDir: root, homeDir: home, recursive: true,
    additionalRecursiveRoots: [transcript, memory],
    machinePlaneRead: () => ({ status: "absent" }),
    repoKeyDirectory: () => ({ status: "absent" }),
  };
  assert.equal(isAllowedPassiveReadTarget("local.md", context), true,
    "one exact-file boundary must not invalidate an unrelated project read");
  assert.equal(isAllowedPassiveReadTarget(transcript, context), true,
    "the approved transcript file is readable exactly");
  assert.equal(isAllowedPassiveReadTarget(memoryFile, context), true,
    "a file inside the approved memory directory is readable");
  // D96 (PO decision 2026-10-22, 2026-09-10 correction; QG-04 restatement): this sibling lives in a directory that was
  // chosen outside every host-visible root, so it used to be refused for being outside. An ordinary outside file is no
  // longer refused; the exactness of the transcript-file boundary is still pinned by the descendant assertion below
  // and the credential negative control right after it.
  assert.equal(isAllowedPassiveReadTarget(sibling, context), true,
    "D96: an ordinary outside file next to the transcript is admitted on its own merits");
  writeFileSync(join(session, "id_rsa"), "fixture\n");
  assert.equal(isAllowedPassiveReadTarget(join(session, "id_rsa"), context), false,
    "a key file next to the transcript stays refused");
  assert.equal(isAllowedPassiveReadTarget(`${transcript}/child.md`, context), false,
    "the transcript-file boundary cannot admit descendants");
});

test("an external user report remains readable while key material and aliases are excluded", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "passive-read-policy-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo");
  const home = join(fixture, "home");
  const keyDir = join(fixture, "keys");
  const documents = join(fixture, "documents");
  mkdirSync(root);
  mkdirSync(home);
  mkdirSync(keyDir);
  mkdirSync(documents);
  mkdirSync(join(home, ".ssh"));
  mkdirSync(join(home, ".kube"));
  mkdirSync(join(home, ".config", "gh"), { recursive: true });
  mkdirSync(join(home, ".codex", "plugins", "cache"), { recursive: true });
  const report = join(home, "review.md");
  const key = join(keyDir, "random-name.md");
  writeFileSync(report, "report\n");
  writeFileSync(key, "private\n");
  writeFileSync(join(home, ".ssh", "id_ed25519"), "private\n");
  writeFileSync(join(home, ".kube", "config"), "private\n");
  writeFileSync(join(home, ".config", "gh", "hosts.yml"), "private\n");
  writeFileSync(join(home, ".codex", "auth.json"), "private\n");
  writeFileSync(join(home, ".codex", "plugins", "cache", "readme.md"), "plugin docs\n");
  const context = { rootDir: root, homeDir: home, credentialRoots: [keyDir] };
  assert.equal(isAllowedPassiveReadTarget(report, context), true);
  assert.equal(isAllowedPassiveReadTarget("~/review.md", context), true);
  assert.equal(isAllowedPassiveReadTarget(key, context), false);
  const repoKeyDir = join(fixture, "repo-specific-key");
  mkdirSync(repoKeyDir);
  const repoKey = join(repoKeyDir, "ordinary-report.md");
  writeFileSync(repoKey, "private\n");
  assert.equal(isAllowedPassiveReadTarget(repoKey, {
    ...context, repoKeyDirectory: () => ({ status: "valid", directory: repoKeyDir }),
  }), false, "repository key pointer takes precedence over a different machine key root");
  assert.equal(isAllowedPassiveReadTarget(report, {
    ...context, repoKeyDirectory: () => ({ status: "invalid", directory: null }),
  }), false, "a malformed repository key pointer cannot silently widen external reads");
  assert.equal(isAllowedPassiveReadTarget(report, {
    ...context, machinePlaneRead: () => ({ status: "invalid", plane: null }),
  }), false, "a malformed machine plane cannot silently widen external reads");
  const initialized = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  assert.equal(initialized.status, 0);
  mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true });
  writeFileSync(join(root, ".git", "agent-pipeline", "po-key-directory.json"), JSON.stringify({
    schema: "pipeline.po-key-directory.v1", poKeyDirectory: repoKeyDir,
    updatedAt: "2026-09-30T00:00:00.000Z",
  }));
  assert.equal(isAllowedPassiveReadTarget(repoKey, { rootDir: root, homeDir: home }), false,
    "real repository pointer protects a divergent key directory without test injection");
  assert.equal(isAllowedPassiveReadTarget(report, { rootDir: root, homeDir: home }), true);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".ssh", "id_ed25519"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".kube", "config"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".config", "gh", "hosts.yml"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".codex", "auth.json"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".codex", "plugins", "cache", "readme.md"), context), true);
  if (process.platform === "linux") {
    assert.equal(isAllowedPassiveReadTarget("/proc/self/environ", context), false);
    assert.equal(isAllowedPassiveReadTarget("/etc/passwd", context), false);
  }
  assert.equal(isAllowedPassiveReadTarget(join(home, "po-private.pem"), context), false);
  assert.equal(isAllowedPassiveReadTarget(home, { ...context, recursive: true }), false);
  assert.equal(isAllowedPassiveReadTarget(documents, { ...context, directoryListing: true }), true);
  // D96 (PO decision 2026-10-22, 2026-09-10 correction; QG-04 restatement): an ordinary directory outside the
  // repository may be searched recursively; only the whole-tree secret screen decides it.
  assert.equal(isAllowedPassiveReadTarget(documents, { ...context, recursive: true }), true);
  assert.equal(isAllowedPassiveReadTarget(keyDir, { ...context, recursive: true }), false, "a credential directory stays refused");
  writeFileSync(join(documents, ".env"), "TOKEN=synthetic\n");
  assert.equal(isAllowedPassiveReadTarget(documents, { ...context, recursive: true }), false, "an outside directory holding a secret file stays refused");
  rmSync(join(documents, ".env"));
  assert.equal(isAllowedPassiveReadTarget(`${keyDir}/*`, context), false, "Bash wildcard expansion cannot bypass the key root");
  const alias = join(home, "alias");
  symlinkSync(keyDir, alias, process.platform === "win32" ? "junction" : "dir");
  assert.equal(isAllowedPassiveReadTarget(join(alias, "random-name.md"), context), false);
  mkdirSync(join(keyDir, "sub"));
  assert.equal(isAllowedPassiveReadTarget(`${alias}/sub/../random-name.md`, context), false);
  const outsideAlias = join(root, "outside-alias");
  symlinkSync(documents, outsideAlias, process.platform === "win32" ? "junction" : "dir");
  // D96 (QG-04 restatement): an in-repository alias to an ordinary outside directory used to be refused for leaving the
  // repository; it is judged on its content now. The very next assertions keep the credential intent: the same alias
  // is refused as soon as the directory holds a key file.
  assert.equal(isAllowedPassiveReadTarget(outsideAlias, { ...context, recursive: true }), true);
  assert.equal(isAllowedPassiveReadTarget(outsideAlias, { ...context, directoryListing: true }), true);
  writeFileSync(join(documents, "po-private.pem"), "private\n");
  assert.equal(isAllowedPassiveReadTarget(outsideAlias, { ...context, recursive: true }), false);
  const internal = join(root, "src");
  mkdirSync(internal);
  writeFileSync(join(internal, "index.mjs"), "export const value = 1;\n");
  assert.equal(isAllowedPassiveReadTarget(internal, { ...context, recursive: true }), true);
  writeFileSync(join(internal, "po-private.pem"), "SECRET=x\n");
  assert.equal(isAllowedPassiveReadTarget(internal, { ...context, recursive: true }), false);
  if (process.platform === "win32") {
    const alternateCase = report[0] === report[0].toLowerCase()
      ? report[0].toUpperCase() + report.slice(1) : report[0].toLowerCase() + report.slice(1);
    assert.equal(isAllowedPassiveReadTarget(alternateCase, context), true);
  }
});

// ALF-B8-AC147 (A2c / P3c): a skill file is a runtime authority reachable only by its own name. A
// name outside the host skill tree that merely resolves into it (a project-local alias) is
// refused; the same file by its own physical name, and links to other host files, keep their lanes.
// The control reads prove the fixture is honest, so each refusal is the alias rule and nothing else.
test("an alias that resolves into the host skill tree is refused while the skill's own name and other links keep their lanes", (t) => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "passive-skill-alias-")));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo"), home = join(fixture, "home"), elsewhere = join(fixture, "elsewhere");
  const skillDir = join(home, ".codex", "skills", ".system", "skill-creator");
  for (const directory of [root, elsewhere, skillDir]) mkdirSync(directory, { recursive: true });
  const skillFile = join(skillDir, "SKILL.md");
  writeFileSync(skillFile, "# skill-creator\n");
  const plain = join(elsewhere, "report.md");
  writeFileSync(plain, "an ordinary host file\n");
  const dirType = process.platform === "win32" ? "junction" : "dir";
  const context = { rootDir: root, homeDir: home, recursive: true,
    machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }) };
  assert.equal(isAllowedPassiveReadTarget(skillFile, context), true, "control: the skill file by its own physical name");
  assert.equal(isAllowedPassiveReadTarget(plain, context), true, "control: an ordinary host file");
  const projectAlias = join(root, "skill-alias");
  symlinkSync(skillDir, projectAlias, dirType);
  assert.equal(isAllowedPassiveReadTarget(join(projectAlias, "SKILL.md"), context), false, "absolute spelling through a project alias");
  assert.equal(isAllowedPassiveReadTarget("skill-alias/SKILL.md", context), false, "project-relative spelling through a project alias");
  const hostAlias = join(elsewhere, "skill-alias");
  symlinkSync(skillDir, hostAlias, dirType);
  assert.equal(isAllowedPassiveReadTarget(join(hostAlias, "SKILL.md"), context), false, "an alias outside the project is not the skill's own name either");
  if (process.platform !== "win32") {
    symlinkSync(skillFile, join(root, "skill-file-link.md"));
    assert.equal(isAllowedPassiveReadTarget("skill-file-link.md", context), false, "a file link that resolves to the skill file");
  }
  // Other links are outside this rule, and a linked home directory is not an alias of its own tree.
  if (process.platform !== "win32") {
    symlinkSync(plain, join(root, "plain-link.md"));
    assert.equal(isAllowedPassiveReadTarget("plain-link.md", context), true, "a link to an ordinary host file keeps its lane");
  }
  const linkedHome = join(fixture, "linked-home");
  symlinkSync(home, linkedHome, dirType);
  assert.equal(isAllowedPassiveReadTarget(join(linkedHome, ".codex", "skills", ".system", "skill-creator", "SKILL.md"),
    { ...context, homeDir: linkedHome }), true, "the skill file under a linked home directory is its own name");
});

// PO decision D105 (2026-10-22; scope extension of D96): the host credential locations that D96 made newly readable are
// enrolled in the EXISTING credential-root declaration. Paths are judged lexically and by their physical name, so the
// fixture injects an identity realpath and a plain-file stat: no real host file is needed and the target need not exist.
test("D105 enrolled host credential locations are refused in every spelling; adjacent ordinary outside paths stay admitted", (t) => {
  if (process.platform === "win32") { t.skip("POSIX host paths"); return; }
  const fixture = mkdtempSync(join(tmpdir(), "passive-d105-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo"), home = join(fixture, "home");
  mkdirSync(root); mkdirSync(home);
  const plainFile = { isFile: () => true, isDirectory: () => false, nlink: 1 };
  const directory = { isFile: () => false, isDirectory: () => true, nlink: 2 };
  const context = {
    rootDir: root, homeDir: home, machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }),
    realpath: (path) => path, stat: () => plainFile,
  };
  const refused = [
    "/var/run/secrets/kubernetes.io/serviceaccount/token", "/run/secrets/db_password", "/private/var/run/secrets/x",
    "/var/spool/cron/crontabs/alice", "/var/spool/cron/alice",
    "/etc/ssl/private/server.pem", "/etc/sudoers", "/etc/sudoers.d/90-local", "/etc/ssh/ssh_host_ed25519_key",
    "/opt/host-keys/ssh_host_rsa_key", "/srv/backup/ssh_host_ecdsa_key",
  ];
  for (const path of refused) assert.equal(isAllowedPassiveReadTarget(path, context), false, `${path} must be refused`);
  // The physical name counts too: an ordinary-looking outside link that resolves into an enrolled location.
  for (const [link, target] of [["/opt/link/token", "/var/run/secrets/kubernetes.io/serviceaccount/token"], ["/opt/link/tab", "/var/spool/cron/crontabs/alice"]]) {
    assert.equal(isAllowedPassiveReadTarget(link, { ...context, realpath: (path) => (path === link ? target : path) }), false, `${link} -> ${target}`);
  }
  // A recursive search that would sweep an enrolled location is refused as well (its ancestors included).
  for (const ancestor of ["/var/spool", "/var/run", "/var"]) {
    assert.equal(isAllowedPassiveReadTarget(ancestor, { ...context, stat: () => directory, recursive: true }), false, `recursive ${ancestor}`);
  }
  // Positive controls: segment-exact matching, a public key, and plain outside paths are still admitted (D96).
  for (const path of ["/var/spool/cronfoo/x", "/var/spool/mqueue/x", "/var/run/secretsfoo/x", "/opt/host-keys/ssh_host_rsa_key.pub",
    "/usr/share/doc/readme", "/srv/data/report.md", "/opt/etc/ssl/private-notes.md"]) {
    assert.equal(isAllowedPassiveReadTarget(path, context), true, `${path} must stay admitted`);
  }
  const real = join(fixture, "outside.txt");
  writeFileSync(real, "plain\n");
  assert.equal(isAllowedPassiveReadTarget(real, { rootDir: root, homeDir: home, machinePlaneRead: () => ({ status: "absent" }),
    repoKeyDirectory: () => ({ status: "absent" }) }), true, "a real plain outside file is admitted without any injection");
});

// PO decision D109 (2026-10-22): the credential declaration follows external best practice on Linux, macOS, Windows and
// WSL (catalogue: scratch/agent-out/sensitive-paths-research.md, sources S1-S52), with an explicit named-exceptions table.
// Every case drives the real decision through the module's injection seams (identity realpath, plain-file stat, homeDir,
// now): no host file is needed, the target need not exist, and nothing here claims to have run on Windows or macOS.
const d109 = (homeDir = "/home/alice", extra = {}) => {
  const plain = { isFile: () => true, isDirectory: () => false, nlink: 1 };
  const dir = { isFile: () => false, isDirectory: () => true, nlink: 2 };
  const context = {
    rootDir: "/srv/d109-project", homeDir, machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }),
    realpath: (path) => extra.links?.[path] ?? path, stat: () => plain, ...extra,
  };
  return {
    admits: (path, more = {}) => isAllowedPassiveReadTarget(path, { ...context, ...more }),
    admitsDir: (path, more = {}) => isAllowedPassiveReadTarget(path, { ...context, stat: () => dir, ...more }),
  };
};

test("D109 Linux home credential locations are refused (absolute and ~), with ordinary neighbours still admitted", (t) => {
  if (process.platform === "win32") { t.skip("POSIX host paths"); return; }
  const { admits } = d109();
  const refused = [".config/google-chrome/Default/Login Data", ".config/chromium/Default/Cookies", ".mozilla/firefox/x.default/places.sqlite",
    ".local/share/keyrings/login.keyring", ".local/share/kwalletd/kdewallet.kwl", ".password-store/site.gpg", ".gcm/store/x",
    ".vault-token", ".config/git/credentials", ".terraformrc", ".terraform.d/credentials.tfrc.json", ".cargo/credentials.toml",
    ".cargo/credentials", ".pgpass", ".cache/huggingface/token", ".gem/credentials", ".local/share/gem/credentials",
    ".config/Bitwarden/data.json", ".config/Bitwarden CLI/data.json", ".config/op/config", ".op/config", ".config/pip/pip.conf",
    ".bash_history", ".zsh_history", ".config/BraveSoftware/Brave-Browser/Default/Login Data"];
  for (const entry of refused) {
    assert.equal(admits(`/home/alice/${entry}`), false, `${entry} must be refused`);
    assert.equal(admits(`~/${entry}`), false, `~/${entry} must be refused`);
  }
  for (const entry of [".cargo/config.toml", ".cache/huggingface/hub/models/x.txt", ".config/chromium-notes/x.md", ".terraform.d/plugins/x.txt",
    ".config/git/config", "notes/passwords-policy.md", ".local/share/applications/x.desktop"]) {
    assert.equal(admits(`/home/alice/${entry}`), true, `${entry} must stay admitted`);
    assert.equal(admits(`~/${entry}`), true, `~/${entry} must stay admitted`);
  }
});

test("D109 key and secret names are refused wherever they sit; public or ordinary names are admitted", (t) => {
  if (process.platform === "win32") { t.skip("POSIX host paths"); return; }
  const { admits } = d109();
  for (const name of ["id_ed25519_sk", "id_ecdsa_sk", "id_ed25519_sk.pub", "id_mldsa44_ed25519", "vault.kdbx", "x.opvault", "login.keychain-db",
    "key.ppk", "secret.gpg", "secret.pgp", "pub.asc", "ca.cer", "bundle.p7b", "store.jks", "app.keystore", "credentials.toml",
    "credentials.tfrc.json", "ConsoleHost_history.txt", "Cookies.binarycookies", "logins.json", "key4.db", "cookies.sqlite", "Login Data",
    ".vault-token", ".pgpass", ".bash_history", "ssh_host_ed25519_key"]) {
    assert.equal(admits(`/opt/copied/${name}`), false, `${name} must be refused`);
  }
  for (const name of ["id_card.md", "ssh_host_ed25519_key.pub", "credentials-policy.md", "notes.asc.md", "logins.md", "history.txt"]) {
    assert.equal(admits(`/opt/copied/${name}`), true, `${name} must stay admitted`);
  }
});

test("D109 macOS home and system locations are refused; ordinary Library paths are admitted", (t) => {
  if (process.platform === "win32") { t.skip("POSIX host paths"); return; }
  const { admits } = d109("/Users/alice");
  for (const path of ["/Users/alice/Library/Keychains/login.keychain-db", "/Users/alice/Library/Application Support/Google/Chrome/Default/Cookies",
    "/Users/alice/Library/Application Support/Chromium/Default/Login Data", "/Users/alice/Library/Application Support/Firefox/Profiles/x/places.sqlite",
    "/Users/alice/Library/Application Support/Bitwarden/data.json", "/Users/alice/Library/Containers/com.bitwarden.desktop/Data/x",
    "/Users/alice/Library/Application Support/pip/pip.conf", "~/Library/Keychains/login.keychain-db",
    "/Library/Keychains/System.keychain", "/Network/Library/Keychains/x", "/Users/bob/Library/Keychains/login.keychain-db"]) {
    assert.equal(admits(path), false, `${path} must be refused`);
  }
  for (const path of ["/Users/alice/Library/Application Support/Code/User/settings.json", "/Users/alice/Documents/report.md",
    "~/Library/Preferences/com.apple.finder.plist", "/Users/bob/Documents/report.md"]) {
    assert.equal(admits(path), true, `${path} must stay admitted`);
  }
});

test("D109 other users' home directories get the same protections as the current user's", (t) => {
  if (process.platform === "win32") { t.skip("POSIX host paths"); return; }
  const { admits, admitsDir } = d109();
  for (const entry of [".kube/config", ".config/gcloud/properties", ".aws/cli/cache/x", ".docker/config.json", ".azure/accessTokens.json",
    ".gnupg/private-keys-v1.d/x", ".config/gh/hosts.yml", ".mozilla/firefox/x/logins.json", ".cache/huggingface/token"]) {
    assert.equal(admits(`/home/bob/${entry}`), false, `/home/bob/${entry} must be refused`);
  }
  assert.equal(admitsDir("/home/bob", { recursive: true }), false, "a recursive search over another home would sweep its credential roots");
  assert.equal(admits("/home/bob/projects/a.md"), true);
  assert.equal(admits("/home/bob/.config/git/config"), true);
  // The current user's linked home counts by its physical name as well.
  const linked = d109("/home/alice", { links: { "/home/alice": "/data/alice-home", "/home/alice/.kube/config": "/data/alice-home/.kube/config" } });
  assert.equal(linked.admits("/home/alice/.kube/config"), false);
});

test("D109 named exceptions: exact files and the public-key suffix are admitted; their siblings and symlink tricks stay refused; expiry ends them", (t) => {
  if (process.platform === "win32") { t.skip("POSIX host paths"); return; }
  const table = policyModule.PASSIVE_READ_CREDENTIAL_ROOTS.namedExceptions;
  assert.ok(Array.isArray(table) && Object.isFrozen(table) && table.length >= 5, "the exceptions are a frozen table in the declaration");
  for (const entry of table) {
    for (const field of ["id", "path", "kind", "reason", "owner", "decision", "expires"]) assert.equal(typeof entry[field], "string", `${entry.id} lacks ${field}`);
    assert.match(entry.expires, /^\d{4}-\d{2}-\d{2}$/u);
    assert.ok(Object.isFrozen(entry));
  }
  const { admits } = d109();
  for (const path of ["/home/alice/.ssh/known_hosts", "~/.ssh/known_hosts", "/home/alice/.ssh/config", "/home/alice/.ssh/id_ed25519.pub",
    "/home/alice/.aws/config", "/home/bob/.ssh/known_hosts", "/home/bob/.ssh/id_rsa.pub"]) {
    assert.equal(admits(path), true, `${path} is a named exception`);
  }
  for (const path of ["/home/alice/.ssh/id_ed25519", "/home/alice/.ssh/authorized_keys", "/home/alice/.ssh/known_hosts.old", "/home/alice/.ssh/sub/known_hosts",
    "/home/alice/.aws/credentials", "/home/alice/.aws/config.d/x", "/home/alice/.ssh/.pub", "/home/alice/.ssh/nested/key.pub"]) {
    assert.equal(admits(path), false, `${path} must stay refused`);
  }
  const trick = d109("/home/alice", { links: { "/home/alice/.ssh/alias.pub": "/home/alice/.ssh/id_rsa", "/home/alice/.ssh/known_hosts": "/home/alice/.ssh/id_rsa" } });
  assert.equal(trick.admits("/home/alice/.ssh/alias.pub"), false, "a .pub name that resolves to a private key");
  assert.equal(trick.admits("/home/alice/.ssh/known_hosts"), false, "a known_hosts link to a private key");
  const expired = Date.parse("2099-01-01T00:00:00Z");
  assert.equal(admits("/home/alice/.ssh/known_hosts", { now: expired }), false, "an expired exception is ignored");
});

test("D109 WSL view of the Windows drive: AppData is refused as a whole, with Local/Temp as the named exception; system and profile roots too", (t) => {
  if (process.platform === "win32") { t.skip("WSL paths are POSIX spellings"); return; }
  const { admits, admitsDir } = d109();
  const refused = [];
  for (const drive of ["c", "d"]) {
    for (const user of ["Bob", "alice"]) {
      refused.push(`/mnt/${drive}/Users/${user}/AppData/Roaming/Microsoft/Protect/S-1-5-21/x`, `/mnt/${drive}/Users/${user}/AppData/Local/Google/Chrome/User Data/Default/Login Data`,
        `/mnt/${drive}/Users/${user}/AppData/Local/Anything/state.txt`, `/mnt/${drive}/Users/${user}/AppData/Roaming/npm/x.txt`,
        `/mnt/${drive}/Users/${user}/AppData/Local/Microsoft/Credentials/x`, `/mnt/${drive}/Users/${user}/AppData/Roaming/Mozilla/Firefox/Profiles/x/key4.db`,
        `/mnt/${drive}/Users/${user}/.kube/config`, `/mnt/${drive}/Users/${user}/.gcm/dpapi_store/x`);
    }
  }
  refused.push("/mnt/c/ProgramData/ssh/sshd_config", "/mnt/c/Windows/System32/config/SAM", "/mnt/c/Windows/NTDS/Ntds.dit", "/mnt/c/$Recycle.Bin/x",
    "/mnt/c/Users/Bob/APPDATA/ROAMING/x.txt", "/mnt/c/users/bob/appdata/local/x.txt", "/mnt/c/Users/Bob/AppData/Local/Temp/.env",
    "/mnt/c/Users/Bob/AppData/Local/Temp/id_rsa", "/mnt/c/Users/Bob/AppData/Local/Temp2/x.txt", "/mnt/c/Users/Bob/AppData/Local/Tempo/x.txt");
  for (const path of refused) assert.equal(admits(path), false, `${path} must be refused`);
  for (const path of ["/mnt/c/Users/Bob/AppData/Local/Temp/build.log", "/mnt/d/Users/alice/AppData/Local/Temp/sub/x.txt", "/mnt/c/Users/Bob/Documents/report.md",
    "/mnt/c/Users/Bob/.ssh/known_hosts", "/mnt/c/Users/Bob/.ssh/config", "/mnt/c/Temp/x.txt", "/mnt/c/src/project/a.md", "/mnt/c/Users/Public/Documents/a.md"]) {
    assert.equal(admits(path), true, `${path} must stay admitted`);
  }
  for (const path of ["/mnt", "/mnt/c", "/mnt/c/Users", "/mnt/c/Users/Bob", "/mnt/c/Users/Bob/AppData", "/mnt/c/Windows"]) {
    assert.equal(admitsDir(path, { recursive: true }), false, `recursive ${path} must be refused`);
  }
  assert.equal(admitsDir("/mnt/c/Users/Bob", { directoryListing: true }), false, "listing a profile root exposes credential roots, as for the home directory");
  assert.equal(admitsDir("/mnt/c", { directoryListing: true }), true);
  assert.equal(admitsDir("/mnt/c/Users", { directoryListing: true }), true);
  assert.equal(admitsDir("/mnt/c/Users/Bob/Documents", { directoryListing: true }), true);
  const expired = Date.parse("2099-01-01T00:00:00Z");
  assert.equal(admits("/mnt/c/Users/Bob/AppData/Local/Temp/build.log", { now: expired }), false, "the Temp exception expires");
  const link = d109("/home/alice", { links: { "/opt/shortcut/x.txt": "/mnt/c/Users/Bob/AppData/Roaming/x.txt" } });
  assert.equal(link.admits("/opt/shortcut/x.txt"), false, "a link into AppData is judged by its physical name");
});

test("D109 native Windows spellings are classified by the same rules (string-level seam; not run on a Windows host)", () => {
  const refuses = policyModule.isHostCredentialLocation;
  assert.equal(typeof refuses, "function");
  const options = { homePrefixes: ["C:/Users/Alice"] };
  for (const path of ["C:\\Users\\Bob\\AppData\\Roaming\\Microsoft\\Protect\\S-1\\x", "C:\\Users\\Alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data",
    "d:\\users\\bob\\appdata\\local\\x.txt", "C:\\Users\\Bob\\.ssh\\id_rsa", "C:\\ProgramData\\ssh\\sshd_config", "C:\\Windows\\System32\\config\\SAM",
    "C:\\$Recycle.Bin\\x"]) {
    assert.equal(refuses(path, options), true, `${path} must be refused`);
  }
  for (const path of ["C:\\Users\\Alice\\AppData\\Local\\Temp\\x.txt", "C:\\Users\\Bob\\Documents\\a.md", "D:\\src\\project\\a.md", "C:\\Users\\Bob\\.ssh\\known_hosts"]) {
    assert.equal(refuses(path, options), false, `${path} must stay admitted`);
  }
  assert.equal(refuses("C:\\Users\\Alice\\AppData\\Local\\Temp\\x.txt", { ...options, now: Date.parse("2099-01-01T00:00:00Z") }), true, "expired");
  assert.equal(refuses("C:\\Users", { ...options, recursive: true }), true);
  assert.equal(refuses("C:\\Users", { ...options, directoryListing: true }), false);
});

// C22B (AC-108, PO decision 2026-11-09): a recursive grep gets its own tree screen (option `allFiles`), because the rg inventory above follows rg's
// hidden and ignore rules and grep -r does not: the measured gap was build/deploy.key under an ignored directory, .cache/deploy.key and .git/config,
// which the rg screen passes and grep -r reads. The screen walks every entry under the operand, prunes only the directories named in `excludeDirs`,
// does not descend a symbolic link (grep -r does not follow one met during the walk) and refuses beyond 10000 entries.
function grepTreeFixture(t, { files = {}, links = {}, outside = {} } = {}) {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "grep-tree-screen-")));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo"), home = join(fixture, "home"), away = join(fixture, "away");
  for (const directory of [root, home, away]) mkdirSync(directory);
  const put = (base, table) => {
    for (const [path, content] of Object.entries(table)) {
      mkdirSync(dirname(join(base, path)), { recursive: true });
      writeFileSync(join(base, path), content);
    }
  };
  put(root, files);
  put(away, outside);
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(typeof target === "function" ? target({ root, home, away }) : target, join(root, path));
  }
  const screen = (operand = ".", extra = {}) => isAllowedPassiveReadTarget(operand, {
    rootDir: root, homeDir: home, recursive: true, allFiles: true,
    machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }), ...extra,
  });
  return { fixture, root, home, away, screen };
}

test("C22B grep screen: a secret name is refused wherever it sits, including under hidden and ignored directories that the rg inventory skips", (t) => {
  const plain = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", "src/deep/b.txt": "NEEDLE", "docs/c.md": "NEEDLE" } });
  assert.equal(plain.screen("."), true, "an ordinary tree is admitted");
  assert.equal(plain.screen("src"), true, "a subdirectory is admitted");
  for (const [name, files] of Object.entries({
    "dotenv at the top": { "src/a.txt": "NEEDLE", ".env": "NEEDLE=fake" },
    "dotenv variant": { "src/a.txt": "NEEDLE", "config/.env.local": "NEEDLE=fake" },
    "key under an ignored directory": { "src/a.txt": "NEEDLE", "build/deploy.key": "NEEDLE fake", ".ignore": "build/\n", ".gitignore": "build/\n" },
    "key under a hidden directory": { "src/a.txt": "NEEDLE", ".cache/deploy.key": "NEEDLE fake" },
    "pem deep in a tree": { "src/a.txt": "NEEDLE", "a/b/c/d/server.pem": "NEEDLE fake" },
    "credentials file in a hidden directory": { "src/a.txt": "NEEDLE", ".aws-local/credentials": "NEEDLE fake" },
  })) {
    const tree = grepTreeFixture(t, { files });
    assert.equal(tree.screen("."), false, name);
  }
});

test("C22B grep screen: a .git directory or a .git file refuses the operand unless the command excludes it by name; the operand itself may not sit inside .git", (t) => {
  const directory = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", ".git/config": "url = https://NEEDLE:fake@example.invalid/x\n", ".git/HEAD": "ref: refs/heads/main\n", ".git/refs/heads/main": "0000\n" } });
  assert.equal(directory.screen("."), false, ".git directory");
  assert.equal(directory.screen(".", { excludeDirs: [".git"] }), true, "excluded by name");
  assert.equal(directory.screen(".", { excludeDirs: ["node_modules"] }), false, "another excluded name does not help");
  assert.equal(directory.screen(".git"), false, "the operand is the .git directory");
  assert.equal(directory.screen(".git", { excludeDirs: [".git"] }), false, "excluding the name does not exempt an operand that is already inside it");
  assert.equal(directory.screen(".git/refs"), false, "an operand inside .git");
  const worktree = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", ".git": "gitdir: ../elsewhere/.git/worktrees/w\n" } });
  assert.equal(worktree.screen("."), false, ".git file (a worktree)");
  assert.equal(worktree.screen(".", { excludeDirs: [".git"] }), true, "excluded by name");
  const nested = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", "vendor/lib/.git/config": "x\n" } });
  assert.equal(nested.screen("."), false, "a nested .git directory");
  assert.equal(nested.screen(".", { excludeDirs: [".git"] }), true, "excluded at any depth by name");
  const shouting = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", ".GIT/config": "x\n" } });
  assert.equal(shouting.screen(".", { excludeDirs: [".git"] }), false, "the name is compared case-insensitively for refusal and exactly for exclusion");
});

test("C22B grep screen: excludeDirs prunes exactly the directories it names, at any depth, and relaxes nothing else", (t) => {
  const tree = grepTreeFixture(t, { files: {
    "src/a.txt": "NEEDLE", ".git/config": "x\n", "node_modules/pkg/deploy.key": "fake\n", "src/node_modules/pkg/x.pem": "fake\n", "node_modules_extra/y.key": "fake\n",
  } });
  assert.equal(tree.screen(".", { excludeDirs: [".git", "node_modules"] }), false, "a similar name is not the named directory: node_modules_extra holds a key");
  const only = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", ".git/config": "x\n", "node_modules/pkg/deploy.key": "fake\n", "src/node_modules/pkg/x.pem": "fake\n" } });
  assert.equal(only.screen(".", { excludeDirs: [".git"] }), false, "a key under node_modules is not pruned by .git");
  assert.equal(only.screen(".", { excludeDirs: [".git", "node_modules"] }), true, "both named directories pruned at every depth");
  const topKey = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", ".env": "NEEDLE=fake", ".git/config": "x\n" } });
  assert.equal(topKey.screen(".", { excludeDirs: [".git", "node_modules"] }), false, "a secret name is never relaxed by an exclusion");
  for (const bad of [[".git/hooks"], ["*"], [""], [".."], [".git\\hooks"], "node_modules", null]) {
    assert.equal(only.screen(".", { excludeDirs: bad }), false, `a name that is not a plain directory name prunes nothing: ${JSON.stringify(bad)}`);
  }
});

test("C22B grep screen: a symbolic link is not descended, but its name and its resolved target are screened; a link out of the tree is refused; a dangling link is ignored", (t) => {
  const inside = grepTreeFixture(t, {
    files: { "src/a.txt": "NEEDLE", "docs/b.md": "NEEDLE" },
    links: { "alias.txt": "src/a.txt", "docs/up": "..", "loop": ".", "dangling": "does-not-exist", "dangling-out": ({ away }) => join(away, "missing") },
  });
  assert.equal(inside.screen("."), true, "links to in-tree targets, a cycle and dangling links are admitted without a walk through them");
  const secretName = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE" }, links: { "deploy.key": "src/a.txt" } });
  assert.equal(secretName.screen("."), false, "the link NAME is screened");
  const toSecret = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE" }, outside: { "id_rsa": "fake\n" }, links: { "notes.txt": ({ away }) => join(away, "id_rsa") } });
  assert.equal(toSecret.screen("."), false, "the resolved target is screened");
  const toRoot = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE" }, links: { "mine": ({ home }) => home } });
  mkdirSync(join(toRoot.home, ".ssh"));
  assert.equal(toRoot.screen(".", { credentialRoots: [join(toRoot.home, ".ssh")] }), false, "a link out of the tree to a directory holding a protected root");
  const leaves = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE" }, outside: { "plain.txt": "harmless\n" }, links: { "out.txt": ({ away }) => join(away, "plain.txt"), "outdir": ({ away }) => away } });
  assert.equal(leaves.screen("."), false, "a link that leads out of the tree is refused, although grep -r would not read through it (conservative on purpose)");
  const viaOperand = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", "other/.env": "NEEDLE=fake" }, links: { "view": "src", "bad": "other" } });
  assert.equal(viaOperand.screen("view"), true, "grep -r follows a link given on the command line, so the operand is walked through its target");
  assert.equal(viaOperand.screen("bad"), false, "and the target's content is judged");
});

test("C22B grep screen: more than 10000 entries are refused, exactly 10000 are admitted", (t) => {
  const tree = grepTreeFixture(t, { files: { "a.txt": "x" } });
  mkdirSync(join(tree.root, "many"));
  for (let index = 0; index < 9998; index += 1) writeFileSync(join(tree.root, "many", `f${index}.txt`), "");
  // root + many/ + a.txt + 9998 files = 10001 entries
  assert.equal(tree.screen("many"), true, "9998 files + the directory = 9999 entries");
  assert.equal(tree.screen("."), false, "10001 entries");
  writeFileSync(join(tree.root, "many", "one-more.txt"), "");
  assert.equal(tree.screen("many"), true, "exactly 10000 entries (9999 files + the directory) are admitted");
  writeFileSync(join(tree.root, "many", "two-more.txt"), "");
  assert.equal(tree.screen("many"), false, "10001 entries are refused");
});

test("C22B grep screen: the rg route is unchanged and the option is off by default", (t) => {
  const hidden = grepTreeFixture(t, { files: { "src/a.txt": "NEEDLE", ".cache/deploy.key": "NEEDLE fake", ".git/config": "x\n" } });
  assert.equal(hidden.screen(".", { allFiles: true }), false);
  const rg = spawnSync("rg", ["--version"], { encoding: "utf8" });
  if (rg.status === 0) {
    assert.equal(hidden.screen(".", { allFiles: false }), true, "the rg inventory skips hidden directories: byte for byte the previous verdict");
    assert.equal(hidden.screen(".", { allFiles: undefined }), true, "the option is off unless asked for");
  }
  assert.equal(hidden.screen("src/a.txt", { allFiles: true }), true, "a single file is judged like any exact file");
  assert.equal(hidden.screen(".cache/deploy.key", { allFiles: true }), false, "a secret file operand stays refused");
});

// The measurement that backs the screen: run the REAL grep -r over each fixture and compare what it opened with what the screen approved.
// `grep -rc` prints one line per file it reads, matching or not. Read oracle (independent of the screen): a file is sensitive when its name
// is a secret name or when it sits inside a .git directory. A `.git` FILE (worktree pointer) holds only a gitdir line and is not sensitive;
// the screen refuses it unless the command excludes the name, as the briefing for this change states.
const SENSITIVE_NAME = /^(?:\.env(?:\..*)?|id_rsa|credentials|.*\.(?:key|pem|p12|pfx))$/u;
function sensitiveRead(relative) {
  const parts = relative.split("/");
  return parts.slice(0, -1).includes(".git") || SENSITIVE_NAME.test(parts[parts.length - 1]);
}
function gnuGrep() {
  const probe = spawnSync("grep", ["--version"], { encoding: "utf8" });
  return probe.status === 0 && /GNU grep/u.test(probe.stdout) ? "grep" : null;
}

test("C22B grep screen: what the real grep -r opens is inside what the screen approved (the screen admits only trees in which nothing sensitive is read)", (t) => {
  if (gnuGrep() === null) { t.skip("GNU grep is not available on this host"); return; }
  const fixtures = [
    { name: "plain", files: { "src/a.txt": "NEEDLE", "docs/b.md": "NEEDLE" }, admit: true },
    { name: "dotenv at the top", files: { "src/a.txt": "NEEDLE", ".env": "NEEDLE=fake" }, admit: false },
    { name: "dotenv ignored by name", files: { "src/a.txt": "NEEDLE", ".env": "NEEDLE=fake", ".ignore": ".env\n" }, admit: false },
    { name: "key under an ignored directory", files: { "src/a.txt": "NEEDLE", "build/deploy.key": "NEEDLE fake", ".ignore": "build/\n", ".gitignore": "build/\n" }, admit: false },
    { name: "key under a hidden directory", files: { "src/a.txt": "NEEDLE", ".cache/deploy.key": "NEEDLE fake" }, admit: false },
    { name: ".git directory", files: { "src/a.txt": "NEEDLE", ".git/config": "url = https://NEEDLE:fake@example.invalid/x\n" }, admit: false },
    { name: ".git directory, excluded by name", files: { "src/a.txt": "NEEDLE", ".git/config": "url = https://NEEDLE:fake@example.invalid/x\n" }, excludeDirs: [".git"], admit: true },
    { name: ".git file, excluded by name", files: { "src/a.txt": "NEEDLE", ".git": "gitdir: ../w/.git/worktrees/w\n" }, excludeDirs: [".git"], admit: true },
    { name: "node_modules pruned and key kept out of reach", files: { "src/a.txt": "NEEDLE", "node_modules/p/deploy.key": "NEEDLE fake" }, excludeDirs: ["node_modules"], admit: true },
    { name: "link to a secret outside the tree", files: { "src/a.txt": "NEEDLE" }, outside: { "id_rsa": "NEEDLE fake\n" }, links: { "notes.txt": ({ away }) => join(away, "id_rsa") }, admit: false, linkNotRead: "notes.txt" },
    { name: "link out of the tree to a directory", files: { "src/a.txt": "NEEDLE" }, outside: { "plain.txt": "NEEDLE\n" }, links: { "outdir": ({ away }) => away }, admit: false, linkNotRead: "outdir" },
    { name: "link inside the tree", files: { "src/a.txt": "NEEDLE" }, links: { "alias.txt": "src/a.txt", "loop": "." }, admit: true, linkNotRead: "alias.txt" },
  ];
  for (const fixture of fixtures) {
    const tree = grepTreeFixture(t, fixture);
    const args = ["-rc", "NEEDLE", ".", ...(fixture.excludeDirs ?? []).map((name) => `--exclude-dir=${name}`)];
    const real = spawnSync("grep", args, { cwd: tree.root, encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
    const opened = real.stdout.split("\n").filter(Boolean).map((line) => line.slice(0, line.lastIndexOf(":")).replace(/^\.\//u, ""));
    assert.ok(opened.length > 0, `${fixture.name}: grep opened something`);
    const sensitive = opened.filter(sensitiveRead);
    const admitted = tree.screen(".", { excludeDirs: fixture.excludeDirs });
    assert.equal(admitted, fixture.admit, `${fixture.name}: screen verdict`);
    if (admitted) assert.deepEqual(sensitive, [], `${fixture.name}: the screen approved a tree in which grep -r opened a sensitive file`);
    else if (fixture.linkNotRead === undefined) assert.ok(sensitive.length > 0, `${fixture.name}: a refusal in this table must be a read that really happens (${opened.join(", ")})`);
    if (fixture.linkNotRead !== undefined) assert.equal(opened.includes(fixture.linkNotRead), false, `${fixture.name}: grep -r does not read a link met during the walk`);
  }
});
