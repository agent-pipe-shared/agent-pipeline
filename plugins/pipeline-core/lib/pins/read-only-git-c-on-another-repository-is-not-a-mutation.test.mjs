// SPDX-License-Identifier: SUL-1.0
// Regression pin for candidate 20 finding G20-34 (observed 2026-11-07, PO decision 2026-11-07: fix in candidate 20).
// A read-only `git -C <another repository> log` was refused as GUARD-CROSS-REPO-MUTATION. Decision: read-only git subcommands
// with `-C` follow the passive read policy (reading outside the project is allowed, credential roots are not); every
// mutating subcommand against another repository stays refused. Every case runs through the real guard
// (evaluateLifecycleReadyGuard); nothing under test is mocked.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";

const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));

function gitInit(dir) {
  mkdirSync(dir, { recursive: true });
  const result = spawnSync("git", ["init", "-q", dir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  writeFileSync(join(dir, "a.txt"), "a\n");
}

function fixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const base = realpathSync(mkdtempSync(join(SCRATCH_ROOT, "g2034-")));
  const project = join(base, "project");
  mkdirSync(join(project, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(project, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  const other = join(base, "other-repo");
  gitInit(other);
  const plain = join(base, "plain-dir");
  mkdirSync(plain, { recursive: true });
  return { base, project, other, plain };
}

const withFixture = (fn) => {
  const paths = fixture();
  try { return fn(paths); } finally { rmSync(paths.base, { recursive: true, force: true }); }
};
const run = (command, project) => {
  const r = evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command } }, { projectDir: project });
  return { exitCode: r.exitCode, text: String(r.stderr ?? "") };
};
const fwd = (p) => p.replaceAll("\\", "/");

test("G2034-1 read-only git subcommands with -C on another repository are admitted", () => withFixture(({ project, other }) => {
  for (const command of [
    `git -C ${fwd(other)} log --oneline -3`,
    `git -C ${fwd(other)} status --short`,
    `git -C ${fwd(other)} rev-parse HEAD`,
    `git -C ${fwd(other)} show HEAD:a.txt`,
    `git -C ${fwd(other)} diff -- a.txt`,
  ]) {
    const result = run(command, project);
    assert.equal(result.exitCode, 0, `${command}\n${result.text}`);
  }
}));

test("G2034-2 mutating git subcommands with -C on another repository stay refused", () => withFixture(({ project, other }) => {
  for (const command of [
    `git -C ${fwd(other)} commit -m x`,
    `git -C ${fwd(other)} add a.txt`,
    `git -C ${fwd(other)} checkout -b x`,
    `git -C ${fwd(other)} reset --hard`,
  ]) {
    const result = run(command, project);
    assert.equal(result.exitCode, 2, `${command} must stay refused`);
  }
}));

test("G2034-3 the read stays inside THAT repository: a path operand that escapes it is refused", () => withFixture(({ project, other }) => {
  const result = run(`git -C ${fwd(other)} log -- ../project/x`, project);
  assert.equal(result.exitCode, 2, result.text);
}));

test("G2034-4 a -C target outside the project that is not a Git repository is not admitted as a read", () => withFixture(({ project, plain }) => {
  const result = run(`git -C ${fwd(plain)} log --oneline -3`, project);
  assert.equal(result.exitCode, 2, result.text);
}));

test("G2034-5 a repository under a credential root is refused even for a read", () => withFixture(({ base, project }) => {
  const home = join(base, "home");
  const vault = join(home, ".ssh", "keys-repo");
  gitInit(vault);
  const previous = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    const result = run(`git -C ${fwd(vault)} log --oneline -3`, project);
    assert.equal(result.exitCode, 2, result.text);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}));
