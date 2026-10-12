#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyProjectOnboardingV3, planProjectOnboardingV3 } from "./project-onboarding-v3.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const self = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(self), "../../..");
const probeMode = process.argv[2];
function runSharedTempProbe() {
  const mode = process.argv[3];
  const fakeTemp = realpathSync(process.env.TMPDIR);
  const home = process.env.HOME;
  assert.equal(realpathSync(tmpdir()), fakeTemp, "child must use the owned simulated OS temporary root");
  const root = mode === "child" ? mkdtempSync(join(fakeTemp, "eligible-project-")) : fakeTemp;
  // A real authenticated plan is minted while this root is still eligible,
  // then the OS temp root changes before apply. No hand-built plan bypasses authentication.
  if (mode === "apply") process.env.TMPDIR = home;
  const rootDir = mode === "alias" ? `${root}/../${basename(root)}/.` : root;
  const deps = { homedir: () => home };
  const plan = planProjectOnboardingV3({ rootDir, runner: "codex", deps });
  if (mode === "apply") process.env.TMPDIR = fakeTemp;
  const applied = ["apply", "child"].includes(mode)
    ? applyProjectOnboardingV3(plan, { rootDir, activate: true, deps }) : null;
  const gitReadback = applied?.status === "applied" ? spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root, encoding: "utf8", timeout: 10_000,
  }) : null;
  if (gitReadback) {
    assert.equal(gitReadback.error, undefined);
    assert.equal(gitReadback.status, 0, gitReadback.stderr);
  }
  console.log(JSON.stringify({ mode, tempRoot: tmpdir(), root, planStatus: plan.status,
    planTargets: plan.targets?.length ?? 0, initializesGit: plan.git?.initializesGit ?? false,
    applyStatus: applied?.status ?? null, gitExists: existsSync(join(root, ".git")),
    gitTopLevel: gitReadback?.stdout?.trim() ?? null,
    entries: readdirSync(root), diagnostics: applied?.diagnostics ?? plan.diagnostics ?? [] }));
  // This CLI child owns only the probe; normal entry registers the four cases below.
  process.exit(0);
}
if (probeMode === "--shared-temp-probe") runSharedTempProbe();

function probe(mode) {
    const scratch = join(repoRoot, "scratch");
    mkdirSync(scratch, { recursive: true });
    const owned = mkdtempSync(join(scratch, "onboarding-shared-temp-"));
    try {
      const fakeTemp = join(owned, "os-temp");
      const home = join(owned, "home");
      mkdirSync(fakeTemp); mkdirSync(home);
      const env = { ...process.env, TMPDIR: fakeTemp, TMP: fakeTemp, TEMP: fakeTemp,
        HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: devNull, GIT_CEILING_DIRECTORIES: owned };
      // Exclude inherited Git repository selection and author credentials.
      for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|AUTHOR_|COMMITTER_)/u.test(key)) delete env[key];
      delete env.PIPELINE_VERIFY_CASE_COMPLETION_FD;
      const child = spawnSync(process.execPath, [self, "--shared-temp-probe", mode], {
        cwd: owned, env, encoding: "utf8", timeout: 45_000, maxBuffer: 1024 * 1024,
      });
      assert.equal(child.error, undefined, String(child.error));
      assert.equal(child.status, 0, child.stderr);
      const observed = JSON.parse(child.stdout.trim().split("\n").at(-1));
      console.log(`OBSERVATION ${JSON.stringify(observed)}`);
      return observed;
    } finally { rmSync(owned, { recursive: true, force: true }); }
  }
  registerTestCaseCompletion({ fd: 3, maxBytes: 8192, cases: [
    { id: "POTR01", name: "plan rejects the exact shared OS temporary root without writes", run() {
      const seen = probe("plan"); assert.equal(seen.planStatus, "unsafe");
      assert.equal(seen.planTargets, 0); assert.deepEqual(seen.entries, []);
    } },
    { id: "POTR02", name: "apply rechecks an authenticated root that became the shared OS temporary root", run() {
      const seen = probe("apply"); assert.equal(seen.planStatus, "ready");
      assert.notEqual(seen.applyStatus, "applied"); assert.equal(seen.gitExists, false);
      assert.deepEqual(seen.entries, []);
    } },
    { id: "POTR03", name: "normalized exact-root path alias is rejected", run() {
      const seen = probe("alias"); assert.equal(seen.planStatus, "unsafe");
      assert.equal(seen.planTargets, 0); assert.deepEqual(seen.entries, []);
    } },
    { id: "POTR04", name: "unique child of the OS temporary root remains eligible for plan and apply", run() {
      const seen = probe("child"); assert.equal(seen.planStatus, "ready");
      assert.equal(seen.initializesGit, true); assert.equal(seen.applyStatus, "applied");
      assert.equal(seen.gitExists, true);
      assert.equal(seen.gitTopLevel, seen.root);
    } },
  ] });
