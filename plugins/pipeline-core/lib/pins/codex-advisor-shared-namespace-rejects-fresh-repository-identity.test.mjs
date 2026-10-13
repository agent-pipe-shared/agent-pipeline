// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.codex-advisor-shared-namespace-rejects-fresh-repository-identity (AC-130).
// The sanctioned first identity mint on a fresh ordinary repository must compose with the registered
// Codex Advisor / Readiness process-root route with no extra operator step, while unsafe shared
// parents and aliases stay refused and linked worktrees keep one common identity.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, chmodSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalRepositoryFingerprint } from "../governance-event-store.mjs";
import { createHostJournal, registerCodexHostProcessRoot } from "../codex-host-process-journal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRATCH = resolve(HERE, "..", "..", "..", "..", "scratch");
const POSIX = process.platform !== "win32";
const HOST_LIMIT_MODE = POSIX ? false : "host-limitation: directory mode bits are unavailable on win32";
const HOST_LIMIT_LINK = POSIX ? false : "host-limitation: directory symlinks are unavailable on this win32 host";
const SHA = /^[a-f0-9]{64}$/;
const GIT_ID = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false"];

function freshRepository(t) {
  mkdirSync(SCRATCH, { recursive: true });
  const root = realpathSync(mkdtempSync(join(SCRATCH, "advisor-shared-ns-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return { root, common: join(root, ".git") };
}

test("fresh identity mint creates the shared namespace and a stable identity without extra steps", async (t) => {
  const { root, common } = freshRepository(t);
  assert.equal(existsSync(join(common, "agent-pipeline")), false);
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  assert.match(fingerprint, SHA);
  const shared = lstatSync(join(common, "agent-pipeline"));
  assert.equal(shared.isDirectory() && !shared.isSymbolicLink(), true);
  assert.equal(lstatSync(join(common, "agent-pipeline", "governance-events", "repository-binding.json")).isFile(), true);
  assert.equal(await readLocalRepositoryFingerprint({ repositoryRoot: root }), fingerprint);
});

test("registered Advisor and Readiness process roots register right after the first mint", async (t) => {
  const { root, common } = freshRepository(t);
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  for (const [purpose, namespace] of [["advisor", "advisor-codex"], ["design-readiness", "design-readiness-codex"]]) {
    const path = registerCodexHostProcessRoot({ gitCommonDir: common, repoFingerprint: fingerprint, purpose });
    assert.equal(path, join(common, "agent-pipeline", namespace, fingerprint, "processes"));
  }
});

test("a linked worktree keeps the one common repository identity", async (t) => {
  const { root } = freshRepository(t);
  execFileSync("git", [...GIT_ID, "commit", "-q", "--allow-empty", "-m", "fixture"], { cwd: root });
  const linked = join(root, "linked-worktree");
  execFileSync("git", ["worktree", "add", "-q", "--detach", linked], { cwd: root });
  const main = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  assert.equal(await readLocalRepositoryFingerprint({ repositoryRoot: realpathSync(linked) }), main);
});

test("registration still refuses a group/world writable common directory without repairing it", { skip: HOST_LIMIT_MODE }, async (t) => {
  const { root, common } = freshRepository(t);
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  chmodSync(common, 0o777);
  assert.throws(() => registerCodexHostProcessRoot({ gitCommonDir: common, repoFingerprint: fingerprint, purpose: "advisor" }), { code: "host-process-root-unsafe" });
  assert.equal(lstatSync(common).mode & 0o777, 0o777);
});

test("the minted shared namespace is owner-only and not group/world writable", { skip: HOST_LIMIT_MODE }, async (t) => {
  const { root, common } = freshRepository(t);
  await readLocalRepositoryFingerprint({ repositoryRoot: root });
  assert.equal(lstatSync(join(common, "agent-pipeline")).mode & 0o022, 0);
  assert.equal(lstatSync(join(common, "agent-pipeline", "governance-events")).mode & 0o077, 0);
});

// Advisor store creation through the real module: registration is only a plan; the first journal
// creation materializes `<common>/agent-pipeline/advisor-codex/<fingerprint>/processes`.
async function advisorStoreAttempt(t, prepare = () => {}) {
  const { root, common } = freshRepository(t);
  execFileSync("git", [...GIT_ID, "commit", "-q", "--allow-empty", "-m", "fixture"], { cwd: root });
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  prepare({ common, fingerprint });
  const parent = registerCodexHostProcessRoot({ gitCommonDir: common, repoFingerprint: fingerprint, purpose: "advisor" });
  const fields = { binding: { repoFingerprint: fingerprint }, cwd: root };
  let error = null;
  try { createHostJournal(parent, fields); } catch (caught) { error = caught; }
  return { common, fingerprint, parent, error };
}

test("Advisor store creation materializes the owner-private duty chain below the minted shared namespace", async (t) => {
  const { parent, common, fingerprint, error } = await advisorStoreAttempt(t);
  // Materialization succeeded; the deliberately incomplete journal fields are what is refused afterwards.
  assert.equal(error?.code, "host-process-intent-invalid");
  assert.equal(parent, join(common, "agent-pipeline", "advisor-codex", fingerprint, "processes"));
  assert.equal(lstatSync(parent).isDirectory(), true);
});

test("Advisor store creation accepts a 0755 shared agent-pipeline parent (sanctioned governance writers)", { skip: HOST_LIMIT_MODE }, async (t) => {
  const { error } = await advisorStoreAttempt(t, ({ common }) => chmodSync(join(common, "agent-pipeline"), 0o755));
  assert.equal(error?.code, "host-process-intent-invalid");
});

test("Advisor store creation refuses a group/world writable agent-pipeline shared parent without repairing it", { skip: HOST_LIMIT_MODE }, async (t) => {
  const { common, error } = await advisorStoreAttempt(t, ({ common: c }) => chmodSync(join(c, "agent-pipeline"), 0o777));
  assert.equal(error?.code, "host-process-root-unsafe");
  assert.equal(lstatSync(join(common, "agent-pipeline")).mode & 0o777, 0o777);
  assert.equal(existsSync(join(common, "agent-pipeline", "advisor-codex")), false);
});

test("Advisor store creation refuses a 0755 private duty directory without repairing it", { skip: HOST_LIMIT_MODE }, async (t) => {
  const { common, error } = await advisorStoreAttempt(t, ({ common: c }) => {
    const duty = join(c, "agent-pipeline", "advisor-codex");
    mkdirSync(duty);
    chmodSync(duty, 0o755);
  });
  assert.equal(error?.code, "host-process-root-unsafe");
  assert.equal(lstatSync(join(common, "agent-pipeline", "advisor-codex")).mode & 0o777, 0o755);
});

test("registration still refuses an aliased common directory",{ skip: HOST_LIMIT_LINK }, async (t) => {
  const { root, common } = freshRepository(t);
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  const alias = join(root, "common-alias");
  symlinkSync(common, alias, "dir");
  assert.throws(() => registerCodexHostProcessRoot({ gitCommonDir: alias, repoFingerprint: fingerprint, purpose: "advisor" }), { code: "host-process-root-unsafe" });
});
