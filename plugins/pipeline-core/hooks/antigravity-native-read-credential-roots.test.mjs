// SPDX-License-Identifier: SUL-1.0
// PO decision D87 (backlog pipeline.read-blocks-and-misleading-denial-texts-across-runners, Acceptance 1: "Credential
// roots stay denied" on all runners). The Antigravity pre-tool adapter used to allow every native read-only tool at
// once, so `view_file` of a private key was admitted while the Claude and Codex adapters and the shell-read grammar
// refuse it. Every case starts the REAL adapter as a process against an ENROLLED temp project and feeds it hook input
// carrying BOTH absolute and project-relative paths (fixture-blindness rule): one path form alone would pass a
// check that only handles the other.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readToolScopeVerdict } from "../lib/guard/read-scope.mjs";

const hookDir = dirname(fileURLToPath(import.meta.url));
const adapter = join(hookDir, "antigravity-pretool-guard.mjs");

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agy-read-cred-")));
  mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-10-22T00:00:00.000Z",
  }));
  for (const dir of ["docs", "vault"]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, "docs", "readme.md"), "apply\n");
  writeFileSync(join(root, "vault", "id_rsa"), "private\n");
  return root;
}
const withFixture = (fn) => {
  const root = fixture();
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
};

/** One call through the real adapter: { denied, text } where text is what the agent reads. */
function decide(root, toolCall) {
  const { PIPELINE_GUARD_OVERRIDE: _dropInherited, ...baseEnv } = process.env;
  const child = spawnSync(process.execPath, [adapter], {
    cwd: root, input: JSON.stringify({ cwd: root, ...toolCall }), encoding: "utf8", timeout: 60000,
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: root },
  });
  let parsed = {};
  try { parsed = JSON.parse(String(child.stdout).trim().split("\n")[0]); } catch { parsed = {}; }
  return { denied: parsed.decision === "deny", allowed: parsed.decision === "allow", text: String(parsed.reason ?? ""), exit: child.status };
}
const native = (name, args) => ({ toolCall: { name, args } });
const CODE = /GUARD-READ-TARGET\b/u;

test("D87-1 view_file of a credential file is denied with the Claude typed code, absolute and relative, in-root and under the home credential root", { timeout: 300000 }, () => withFixture((root) => {
  const sshKey = join(homedir(), ".ssh", "id_rsa");
  for (const path of [join(root, "vault", "id_rsa"), "vault/id_rsa", "./vault/id_rsa", sshKey, "~/.ssh/id_rsa"]) {
    const d = decide(root, native("view_file", { AbsolutePath: path }));
    assert.equal(d.denied, true, `${path} must be denied (exit ${d.exit}): ${d.text}`);
    assert.match(d.text, CODE, path);
    assert.doesNotMatch(d.text, /not found|not present|no such file/iu, path);
  }
}));

test("D87-2 the denial of the directory-shaped and search tools carries the same typed code", { timeout: 300000 }, () => withFixture((root) => {
  const ssh = join(homedir(), ".ssh");
  const cases = [
    ["list_dir", { DirectoryPath: ssh }],
    ["list_dir", { DirectoryPath: "~/.ssh" }],
    ["find_by_name", { SearchDirectory: ssh, Pattern: "id_*" }],
    ["find_by_name", { SearchDirectory: "~/.ssh", Pattern: "id_*" }],
    ["grep_search", { SearchPath: join(root, "vault", "id_rsa"), Query: "private" }],
    ["grep_search", { SearchPath: "vault/id_rsa", Query: "private" }],
    ["grep_search", { SearchPath: join(root, "vault"), Query: "private" }],
    ["grep_search", { SearchPath: "vault", Query: "private" }],
    ["grep_search", { SearchPath: ssh, Query: "PRIVATE" }],
  ];
  for (const [name, args] of cases) {
    const d = decide(root, native(name, args));
    assert.equal(d.denied, true, `${name} ${JSON.stringify(args)} must be denied (exit ${d.exit}): ${d.text}`);
    assert.match(d.text, CODE, `${name} ${JSON.stringify(args)}`);
  }
}));

test("D87-3 a file:// URL read and the canonical Read/Grep envelope reach the same decision", { timeout: 300000 }, () => withFixture((root) => {
  const key = join(root, "vault", "id_rsa");
  const url = decide(root, native("read_url_content", { Url: pathToFileURL(key).href }));
  assert.equal(url.denied, true, `file:// of a credential file: ${url.text}`);
  assert.match(url.text, CODE);
  const read = decide(root, { tool_name: "Read", tool_input: { file_path: key } });
  assert.equal(read.denied, true, `canonical Read: ${read.text}`);
  assert.match(read.text, CODE);
  const relativeRead = decide(root, { tool_name: "Read", tool_input: { file_path: "vault/id_rsa" } });
  assert.equal(relativeRead.denied, true, `canonical Read, relative: ${relativeRead.text}`);
  const grep = decide(root, { tool_name: "Grep", tool_input: { pattern: "x", path: "vault/id_rsa" } });
  assert.equal(grep.denied, true, `canonical Grep, relative: ${grep.text}`);
}));

test("D87-4 an in-project symlink that resolves to a credential file is denied (realpath, not only the lexical name)", { timeout: 300000 }, () => withFixture((root) => {
  try { symlinkSync(join(root, "vault", "id_rsa"), join(root, "docs", "innocent.md")); }
  catch (error) { if (process.platform === "win32") return; throw error; }
  for (const path of [join(root, "docs", "innocent.md"), "docs/innocent.md"]) {
    const d = decide(root, native("view_file", { AbsolutePath: path }));
    assert.equal(d.denied, true, `${path}: ${d.text}`);
    assert.match(d.text, CODE, path);
  }
}));

test("D87-5 ordinary project reads stay allowed on every native read tool, absolute and relative", { timeout: 300000 }, () => withFixture((root) => {
  const doc = join(root, "docs", "readme.md");
  const cases = [
    ["view_file", { AbsolutePath: doc }],
    ["view_file", { AbsolutePath: "docs/readme.md" }],
    ["list_dir", { DirectoryPath: join(root, "docs") }],
    ["list_dir", { DirectoryPath: "docs" }],
    ["list_dir", { DirectoryPath: root }],
    ["find_by_name", { SearchDirectory: root, Pattern: "*.md" }],
    ["find_by_name", { SearchDirectory: "docs", Pattern: "*.md" }],
    ["grep_search", { SearchPath: doc, Query: "apply" }],
    ["grep_search", { SearchPath: "docs/readme.md", Query: "apply" }],
    ["grep_search", { SearchPath: join(root, "docs"), Query: "apply" }],
    ["grep_search", { SearchPath: "docs", Query: "apply" }],
    ["read_url_content", { Url: "https://example.invalid/page" }],
    ["read_url_content", { Url: pathToFileURL(doc).href }],
    ["ask_question", { Question: "ok?" }],
  ];
  for (const [name, args] of cases) {
    const d = decide(root, native(name, args));
    assert.equal(d.allowed, true, `${name} ${JSON.stringify(args)} must be allowed (exit ${d.exit}): ${d.text}`);
  }
  const canonical = decide(root, { tool_name: "Read", tool_input: { file_path: "docs/readme.md" } });
  assert.equal(canonical.allowed, true, canonical.text);
}));

test("D87-7 a second workspace folder keeps its ordinary reads, and its credential files stay denied", { timeout: 300000 }, () => withFixture((root) => withFixture((other) => {
  const both = { workspacePaths: [root, other] };
  const allowedDir = decide(root, { ...both, ...native("grep_search", { SearchPath: join(other, "docs"), Query: "apply" }) });
  assert.equal(allowedDir.allowed, true, allowedDir.text);
  const allowedFile = decide(root, { ...both, ...native("view_file", { AbsolutePath: join(other, "docs", "readme.md") }) });
  assert.equal(allowedFile.allowed, true, allowedFile.text);
  const denied = decide(root, { ...both, ...native("view_file", { AbsolutePath: join(other, "vault", "id_rsa") }) });
  assert.equal(denied.denied, true, denied.text);
  assert.match(denied.text, CODE);
  const deniedSearch = decide(root, { ...both, ...native("grep_search", { SearchPath: join(other, "vault"), Query: "private" }) });
  assert.equal(deniedSearch.denied, true, deniedSearch.text);
})));

// PO decision D96 (2026-10-22; the 2026-09-10 correction in docs/adr/draft-read-scope-containment-boundary.md): reading
// outside the repository is allowed except for credentials. None of the seven D87 cases above asserted "refused because it
// is outside the project" (every refusal in them is a credential root, a secret file, or a directory holding one), so
// nothing is weakened or restated here; this case adds the missing POSITIVE control and keeps the credential negative
// controls next to it. The fixture directory is under /var/tmp and the file under /usr/share on purpose: neither is on the
// host-visible allow-list the shared policy used before D96, so the case is RED while that list exists.
test("D96-1 a native read outside the project is admitted unless it is a credential root or secret file", { timeout: 300000 }, () => withFixture((root) => {
  if (process.platform === "win32") return;
  let outside;
  try { outside = realpathSync(mkdtempSync(join("/var/tmp", "agy-read-d96-"))); } catch { return; }
  try {
    mkdirSync(join(outside, "clean"), { recursive: true });
    mkdirSync(join(outside, "vault"), { recursive: true });
    writeFileSync(join(outside, "clean", "note.md"), "apply\n");
    writeFileSync(join(outside, "vault", "id_rsa"), "private\n");
    writeFileSync(join(outside, "clean", ".env"), "TOKEN=synthetic\n");
    const note = join(outside, "clean", "note.md");
    const admitted = [
      ["view_file", { AbsolutePath: note }],
      ["read_url_content", { Url: pathToFileURL(note).href }],
      ["list_dir", { DirectoryPath: join(outside, "vault") }],
      ["find_by_name", { SearchDirectory: outside, Pattern: "*.md" }],
      ["grep_search", { SearchPath: join(outside, "vault", ".."), Query: "apply" }],
    ];
    // The recursive search over the whole fixture is refused (it holds id_rsa and .env); the search over a clean copy is not.
    mkdirSync(join(outside, "cleandir"), { recursive: true });
    writeFileSync(join(outside, "cleandir", "a.md"), "apply\n");
    admitted.splice(4, 1, ["grep_search", { SearchPath: join(outside, "cleandir"), Query: "apply" }]);
    const hostFile = ["/usr/share/zoneinfo/UTC", "/usr/share/common-licenses/GPL-3", "/usr/bin/env"].find((path) => existsSync(path));
    if (hostFile !== undefined) admitted.push(["view_file", { AbsolutePath: hostFile }]);
    for (const [name, args] of admitted) {
      const d = decide(root, native(name, args));
      assert.equal(d.allowed, true, `${name} ${JSON.stringify(args)} must be admitted (exit ${d.exit}): ${d.text}`);
    }
    const canonical = decide(root, { tool_name: "Read", tool_input: { file_path: note } });
    assert.equal(canonical.allowed, true, canonical.text);
    // Negative controls: the credential intent is unchanged outside the project too.
    const refused = [
      ["view_file", { AbsolutePath: join(outside, "vault", "id_rsa") }],
      ["view_file", { AbsolutePath: join(outside, "clean", ".env") }],
      ["grep_search", { SearchPath: join(outside, "vault"), Query: "private" }],
      ["grep_search", { SearchPath: outside, Query: "private" }],
      ["list_dir", { DirectoryPath: join(homedir(), ".ssh") }],
    ];
    for (const [name, args] of refused) {
      const d = decide(root, native(name, args));
      assert.equal(d.denied, true, `${name} ${JSON.stringify(args)} must stay refused (exit ${d.exit}): ${d.text}`);
      assert.match(d.text, CODE, `${name} ${JSON.stringify(args)}`);
    }
    // A pseudo-root of the single credential list stays refused (the shared list names /etc, /proc, /sys, /dev, /run).
    const etc = decide(root, native("view_file", { AbsolutePath: "/etc/hostname" }));
    assert.equal(etc.denied, true, etc.text);
  } finally { rmSync(outside, { recursive: true, force: true }); }
}));

test("D87-6 the denial text is the one the Claude native Read produces, so the typed code cannot drift", { timeout: 300000 }, () => withFixture((root) => {
  const key = join(homedir(), ".ssh", "id_rsa");
  const claude = readToolScopeVerdict({ tool_name: "Read", tool_input: { file_path: key } }, root, {});
  assert.equal(claude.exitCode, 2);
  for (const [name, args] of [
    ["view_file", { AbsolutePath: key }],
    ["list_dir", { DirectoryPath: join(homedir(), ".ssh") }],
  ]) {
    const d = decide(root, native(name, args));
    assert.equal(d.denied, true, name);
    assert.ok(d.text.includes(claude.stderr.trim()), `${name}: ${d.text}\nvs Claude: ${claude.stderr}`);
  }
}));
