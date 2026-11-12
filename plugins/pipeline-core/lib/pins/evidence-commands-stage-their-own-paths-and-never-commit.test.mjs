// SPDX-License-Identifier: SUL-1.0
// C28c (PO decision 2026-11-11, routine b): `register-feature-package` and `session-critic-finalizer finalize|export` print `commitPaths`; the agent then staged
// exactly those paths and committed. With the last argument `--stage` the command stages exactly the paths it names and nothing else; it still never commits, so the
// trust model is unchanged (the commit stays the caller's one `git commit -F <message file>`).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { stageCommitPaths } from "../../scripts/register-feature-package.mjs";
import { stageExactPaths } from "../../scripts/session-critic-finalizer.mjs";
import { stageOneShotCommit } from "../../scripts/finish-feature.mjs";

const libDir = dirname(dirname(fileURLToPath(import.meta.url)));

function repo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "stage-")));
  const git = (...args) => spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(root, "seed.txt"), "seed\n");
  git("add", "seed.txt");
  git("commit", "-q", "-m", "seed");
  return { root, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("S1: --stage stages exactly the printed commitPaths, leaves every other change alone and makes no commit", () => {
  const fx = repo();
  try {
    mkdirSync(join(fx.root, "specs/f"), { recursive: true });
    writeFileSync(join(fx.root, "specs/f/lifecycle.json"), "{}\n");
    writeFileSync(join(fx.root, "specs/f/envelope.json"), "{}\n");
    writeFileSync(join(fx.root, "unrelated.txt"), "keep out\n");
    const before = fx.git("rev-parse", "HEAD").stdout;
    const result = stageCommitPaths(fx.root, { status: "registered", manifestPath: "specs/f/lifecycle.json", envelopePath: "specs/f/envelope.json", commitPaths: ["specs/f/lifecycle.json", "specs/f/envelope.json"] });
    assert.deepEqual(result.staged, ["specs/f/lifecycle.json", "specs/f/envelope.json"]);
    assert.equal(fx.git("diff", "--cached", "--name-only").stdout.trim(), "specs/f/envelope.json\nspecs/f/lifecycle.json");
    assert.equal(fx.git("rev-parse", "HEAD").stdout, before, "no commit was made");
    assert.match(fx.git("status", "--short").stdout, /\?\? unrelated\.txt/u, "the unrelated file stays untracked");
  } finally { fx.cleanup(); }
});

test("S2: a refused result and a result without commitPaths are returned unchanged and nothing is staged", () => {
  const fx = repo();
  try {
    writeFileSync(join(fx.root, "a.txt"), "a\n");
    const refused = { status: "refused", code: "FPR-X", commitPaths: ["a.txt"] };
    assert.equal(stageCommitPaths(fx.root, refused), refused);
    const none = { status: "registered" };
    assert.equal(stageCommitPaths(fx.root, none), none);
    assert.equal(fx.git("diff", "--cached", "--name-only").stdout, "");
  } finally { fx.cleanup(); }
});

test("S3: an ignored envelope is staged with -f, as the commit plan always said; another ignored path is not", () => {
  const fx = repo();
  try {
    writeFileSync(join(fx.root, ".gitignore"), "ignored/\n");
    fx.git("add", ".gitignore");
    fx.git("commit", "-q", "-m", "ignore");
    mkdirSync(join(fx.root, "ignored"), { recursive: true });
    writeFileSync(join(fx.root, "ignored/envelope.json"), "{}\n");
    writeFileSync(join(fx.root, "ignored/other.json"), "{}\n");
    const result = stageCommitPaths(fx.root, { status: "registered", envelopePath: "ignored/envelope.json", commitPaths: ["ignored/envelope.json", "ignored/other.json"] });
    assert.deepEqual(result.staged, ["ignored/envelope.json"]);
    assert.equal(result.stageRefused, "ignored/other.json");
    assert.equal(fx.git("diff", "--cached", "--name-only").stdout.trim(), "ignored/envelope.json");
  } finally { fx.cleanup(); }
});

test("S4: the Critic finalizer helper stages the exact paths once each and refuses an absolute or climbing path before touching the index", () => {
  const fx = repo();
  try {
    writeFileSync(join(fx.root, "report.md"), "r\n");
    writeFileSync(join(fx.root, "lineage.json"), "{}\n");
    const ok = stageExactPaths(fx.root, ["report.md", "lineage.json", "report.md"]);
    assert.deepEqual(ok, { staged: ["report.md", "lineage.json"] });
    assert.equal(fx.git("diff", "--cached", "--name-only").stdout.trim(), "lineage.json\nreport.md");
    for (const bad of ["/etc/hosts", "../outside.txt", "a/../../b", ""]) assert.equal(stageExactPaths(fx.root, [bad]).stageRefused, bad);
    assert.equal(stageExactPaths(fx.root, ["missing.txt"]).stageRefused, "missing.txt");
  } finally { fx.cleanup(); }
});

test("S5: the guard admits --stage only as the last argument of the registration forms and of finalize, and never alone or elsewhere", async () => {
  const { isSanctionedLifecycleCommand } = await import("../guard/command-catalogue.mjs");
  const root = realpathSync(resolve(libDir, "..", "..", ".."));
  const register = resolve(root, "plugins/pipeline-core/scripts/register-feature-package.mjs");
  const finalizer = resolve(root, "plugins/pipeline-core/scripts/session-critic-finalizer.mjs");
  const admitted = (script, args) => isSanctionedLifecycleCommand(`node '${script}' ${args}`, root);
  assert.equal(admitted(register, `--root '${root}'`), true);
  assert.equal(admitted(register, `--root '${root}' --stage`), true);
  assert.equal(admitted(register, `--root '${root}' --add-review-unit --stage`), true);
  assert.equal(admitted(register, `--root '${root}' --add-diagnostic-evidence specs/f/evidence/x.json --stage`), true);
  assert.equal(admitted(register, `--root '${root}' --add-review-lineage --packet ${"a".repeat(32)} --stage`), true);
  assert.equal(admitted(register, `--root '${root}' --stage --add-review-unit`), false);
  assert.equal(admitted(register, `--stage`), false);
  assert.equal(admitted(register, `--root '${root}' --stage --stage`), false);
  assert.equal(admitted(register, `--root '${root}' --add-diagnostic-evidence ../x.json --stage`), false);
  assert.equal(admitted(finalizer, `finalize --root '${root}' --request scratch/request.json`), true);
  assert.equal(admitted(finalizer, `finalize --root '${root}' --request scratch/request.json --stage`), true);
  assert.equal(admitted(finalizer, `admit --root '${root}' --request scratch/request.json --stage`), false);
  assert.equal(admitted(finalizer, `finalize --root '${root}' --stage --request scratch/request.json`), false);
});

test("S6: the one-shot close stages exactly the commit it asks for, with the add form its own first step names, and never commits or stages for any other result", () => {
  const fx = repo();
  try {
    mkdirSync(join(fx.root, "specs/f/evidence"), { recursive: true });
    writeFileSync(join(fx.root, "specs/f/evidence/a.json"), "{}\n");
    writeFileSync(join(fx.root, "specs/f/result.md"), "r\n");
    writeFileSync(join(fx.root, "other.txt"), "keep out\n");
    const before = fx.git("rev-parse", "HEAD").stdout;
    const required = { status: "commit-required", commit: { paths: ["specs/f/evidence/a.json", "specs/f/result.md"], steps: ["git add -- specs/f/evidence/a.json specs/f/result.md", "git commit -F m"] } };
    const staged = stageOneShotCommit(fx.root, required);
    assert.deepEqual(staged.staged, ["specs/f/evidence/a.json", "specs/f/result.md"]);
    assert.equal(fx.git("diff", "--cached", "--name-only").stdout.trim(), "specs/f/evidence/a.json\nspecs/f/result.md");
    assert.equal(fx.git("rev-parse", "HEAD").stdout, before, "no commit was made");
    assert.match(fx.git("status", "--short").stdout, /\?\? other\.txt/u);
    const pending = { status: "stopped", stop: { code: "ONESHOT-COMMIT-PENDING" }, commit: { paths: ["other.txt"], steps: ["git add -- other.txt"] } };
    assert.deepEqual(stageOneShotCommit(fx.root, pending).staged, ["other.txt"]);
    const unrelated = { status: "stopped", stop: { code: "ONESHOT-VERIFY-RED" }, commit: { paths: ["never.txt"], steps: [] } };
    assert.equal(stageOneShotCommit(fx.root, unrelated), unrelated);
    const none = { status: "commit-required", commit: { paths: [], steps: [] } };
    assert.equal(stageOneShotCommit(fx.root, none), none);
    assert.equal(stageOneShotCommit(fx.root, { status: "commit-required", commit: { paths: ["../x"], steps: [] } }).stageRefused, "../x");
  } finally { fx.cleanup(); }
});

test("S7: a commit step that says git add -f is staged with -f, and any other step is not", () => {
  const fx = repo();
  try {
    writeFileSync(join(fx.root, ".gitignore"), "specs/\n");
    fx.git("add", ".gitignore");
    fx.git("commit", "-q", "-m", "ignore");
    mkdirSync(join(fx.root, "specs/f"), { recursive: true });
    writeFileSync(join(fx.root, "specs/f/addendum.json"), "{}\n");
    const plain = stageOneShotCommit(fx.root, { status: "commit-required", commit: { paths: ["specs/f/addendum.json"], steps: ["git add -- specs/f/addendum.json"] } });
    assert.equal(plain.stageRefused, "specs/f/addendum.json", "an ignored path is refused by a plain add");
    const forced = stageOneShotCommit(fx.root, { status: "commit-required", commit: { paths: ["specs/f/addendum.json"], steps: ["git add -f -- specs/f/addendum.json"] } });
    assert.deepEqual(forced.staged, ["specs/f/addendum.json"]);
  } finally { fx.cleanup(); }
});
