// SPDX-License-Identifier: SUL-1.0
// Unit coverage for the committed-layout reader of the calibration verify commit transition
// (ALF-C-R1E, AC-140). `git rev-parse --path-format=absolute --git-common-dir` prints a forward-slash
// path on win32 (`D:/x/.git`) while realpathSync returns the native spelling (`D:\x\.git`); the reader
// used to compare the two verbatim and refused every win32 repository with CVCT-COMMON-DIR.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

// Same import order as production: the State writer owns the module graph that imports this module.
import "../scripts/pipeline-state.mjs";
import { inspectCommittedCalibrationVerifyLayout } from "./calibration-verify-commit-transition.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = realpathSync(mkdtempSync(join(SCRATCH, "cvct-unit-")));
const CEILING_BEFORE = process.env.GIT_CEILING_DIRECTORIES;
after(() => {
  if (CEILING_BEFORE === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = CEILING_BEFORE;
  rmSync(WORK, { recursive: true, force: true, maxRetries: 3 });
});

const BASELINE = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";
let counter = 0;

// A contained real-git repository: its own `git init`, every git call ceilinged at the fixture parent.
function repository({ verify, legacyPeer = true }) {
  const parent = join(WORK, `fx-${counter += 1}`);
  const root = join(parent, "repo");
  mkdirSync(root, { recursive: true });
  process.env.GIT_CEILING_DIRECTORIES = parent;
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 60000, env });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  assert.equal(realpathSync(root), root);
  const bytes = `${JSON.stringify({ project: "cvct-unit", verify, handover: "docs/state.md" }, null, 2)}\n`;
  const twins = ["project/pipeline.json", ...(legacyPeer ? [".claude/pipeline.json"] : [])];
  mkdirSync(join(root, "project"), { recursive: true });
  if (legacyPeer) mkdirSync(join(root, ".claude"), { recursive: true });
  for (const twin of twins) writeFileSync(join(root, twin), bytes);
  assert.equal(git("add", "--", ...twins).status, 0);
  assert.equal(git("commit", "-q", "-m", "seed calibration twins").status, 0);
  return { root, git };
}

test("the win32 forward-slash git common dir is not a CVCT-COMMON-DIR refusal (baseline-only twins)", () => {
  const { root, git } = repository({ verify: BASELINE });
  const common = git("rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim();
  if (process.platform === "win32") {
    assert.match(common, /^[A-Za-z]:\//u, "SETUP: git prints the forward-slash spelling the defect is about");
    assert.notEqual(realpathSync(common), common, "SETUP: the native spelling differs from the printed one");
  }
  const layout = inspectCommittedCalibrationVerifyLayout({ rootDir: root });
  assert.equal(layout.code, undefined, `the common dir is accepted, not refused: ${JSON.stringify(layout)}`);
  assert.deepEqual(layout, { status: "baseline-only", paths: ["project/pipeline.json", ".claude/pipeline.json"] });
});

test("identical configured twins read as configured with the command", () => {
  const { root } = repository({ verify: "node --test fixture.test.mjs" });
  assert.deepEqual(inspectCommittedCalibrationVerifyLayout({ rootDir: root }),
    { status: "configured", command: "node --test fixture.test.mjs", paths: ["project/pipeline.json", ".claude/pipeline.json"] });
});

test("an absent legacy peer leaves exactly the neutral tier", () => {
  const { root } = repository({ verify: BASELINE, legacyPeer: false });
  assert.deepEqual(inspectCommittedCalibrationVerifyLayout({ rootDir: root }), { status: "baseline-only", paths: ["project/pipeline.json"] });
});

test("a non-repository root stays unavailable and is never read through the common-dir normalization", () => {
  const bare = join(WORK, "not-a-repo");
  mkdirSync(bare, { recursive: true });
  process.env.GIT_CEILING_DIRECTORIES = WORK;
  const layout = inspectCommittedCalibrationVerifyLayout({ rootDir: bare });
  assert.equal(layout.status, "unavailable");
  assert.notEqual(layout.code, "CVCT-COMMON-DIR");
});
