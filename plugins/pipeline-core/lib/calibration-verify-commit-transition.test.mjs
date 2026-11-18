// SPDX-License-Identifier: SUL-1.0
// Unit coverage for the committed-layout reader of the calibration verify commit transition
// (ALF-C-R1E, AC-140). `git rev-parse --path-format=absolute --git-common-dir` prints a forward-slash
// path on win32 (`D:/x/.git`) while realpathSync returns the native spelling (`D:\x\.git`); the reader
// used to compare the two verbatim and refused every win32 repository with CVCT-COMMON-DIR.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

// Same import order as production: the State writer owns the module graph that imports this module.
import "../scripts/pipeline-state.mjs";
import { inspectCommittedCalibrationVerifyLayout } from "./calibration-verify-commit-transition.mjs";
import * as authorityRead from "./project-authority-read.mjs";
import * as authorityFacade from "./project-authority.mjs";
import { AUTHORITY_ARTIFACTS, resolveAuthorityArtifactPath } from "./project-authority.mjs";
import { readCalibrationStakes } from "./security-close-status.mjs";
import { closeQualityReadback } from "./close-quality-readback.mjs";
import { TWIN_PATHS } from "../scripts/repository-mode-promote.mjs";
import { GATE_STRENGTH_PATHS } from "../hooks/guard-gate-strength.mjs";

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
function repository({ verify, neutralPeer = true, legacyPeer = true }) {
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
  const twins = [...(neutralPeer ? ["project/pipeline.json"] : []), ...(legacyPeer ? [".claude/pipeline.json"] : [])];
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

test("the committed layout lists the twins in the order of the one exported calibration path list (C30J-J9)", () => {
  const { root } = repository({ verify: BASELINE });
  assert.deepEqual(authorityRead.CALIBRATION_PATHS, ["project/pipeline.json", ".claude/pipeline.json"], "SETUP: the shared list is neutral first");
  assert.deepEqual(inspectCommittedCalibrationVerifyLayout({ rootDir: root }).paths, [...authorityRead.CALIBRATION_PATHS]);
});

// C30J-J9 (analysis C8, SM-6, AC-112): one source for the two calibration file paths. These cases live here, not in the registered
// project-authority corpus, because that corpus pins its case ids in a protected policy file.
const CALIBRATION_LIST_MODULES = [
  "calibration-verify-commit-transition.mjs", "close-quality-readback.mjs", "governance-scope.mjs", "onboarding-continuity.mjs",
  "project-calibration-identity.mjs", "project-pipeline-footprint.mjs", "runtime-projection-v3.mjs", "security-close-status.mjs",
];

test("the two calibration paths are exported once, neutral first, from the read half and the facade", () => {
  assert.deepEqual(authorityRead.CALIBRATION_PATHS, [authorityRead.NEUTRAL_CALIBRATION, authorityRead.LEGACY_CALIBRATION]);
  assert.equal(Object.isFrozen(authorityRead.CALIBRATION_PATHS), true);
  assert.deepEqual(authorityRead.CALIBRATION_PATHS, [AUTHORITY_ARTIFACTS.calibration.neutral, AUTHORITY_ARTIFACTS.calibration.legacy]);
  assert.equal(authorityFacade.CALIBRATION_PATHS, authorityRead.CALIBRATION_PATHS, "the facade re-exports the very same list");
});

test("no module that used a private calibration path list names either calibration file as a quoted literal any more", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const literal = /["'`](?:project|\.claude)\/pipeline\.json(?::[^"'`]*)?["'`]/u;
  const offenders = CALIBRATION_LIST_MODULES.filter((name) => readFileSync(join(here, name), "utf8").split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/u.test(line)).some((line) => literal.test(line)));
  assert.deepEqual(offenders, [], "each of these keeps a private copy of a calibration path; import the constants of project-authority-read.mjs");
});

// C30J-J17: the four modules J9 could not reach take the same list.
const CALIBRATION_LIST_MODULES_J17 = ["critic-evidence-carry.mjs", "analysis-run.mjs", "maintenance-delivery.mjs", "push-threat-model-materialize.mjs"];

test("the four remaining calibration path lists use the shared one: no quoted calibration literal is left in their sources", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const literal = /["'`](?:project|\.claude)\/pipeline\.json(?::[^"'`]*)?["'`]/u;
  const offenders = CALIBRATION_LIST_MODULES_J17.filter((name) => readFileSync(join(here, name), "utf8").split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/u.test(line)).some((line) => literal.test(line)));
  assert.deepEqual(offenders, [], "each of these keeps a private copy of a calibration path; import CALIBRATION_PATHS of project-authority-read.mjs");
});

// C30K-K11 (finding K1-04, stage 2): the five lists J9 and J17 left, and the two mirror-rule guard texts.
// Read rules kept per site (not changed): repository-mode-promote writes/reads BOTH twins (order irrelevant to the result); critic-dispatch-preflight reads
// the first READABLE twin (repositoryMode) and the first twin with a valid project name; guard-dispatch-budget parses the first READABLE twin; push-prepare
// names the neutral file when it exists, else the legacy one, plus the mirror sentence only when both exist.
const CALIBRATION_LIST_SITES_K11 = [
  ["scripts", "repository-mode-promote.mjs"],
  ["scripts", "critic-dispatch-preflight.mjs"],
  ["hooks", "guard-dispatch-budget.mjs"],
  ["scripts", "push-prepare.mjs"],
  ["hooks", "guard-gate-strength.mjs"],
];
const CALIBRATION_TEXT_SITES_K11 = [
  ["scripts", "critic-dispatch-preflight.mjs"],
  ["scripts", "push-prepare.mjs"],
  ["hooks", "guard-gate-strength.mjs"],
];
const codeLines = (parts) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ...parts), "utf8").split("\n")
  .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/u.test(line));

test("the five remaining calibration lists use the shared one: no quoted calibration literal is left in their sources", () => {
  const literal = /["'`](?:project|\.claude)\/pipeline\.json(?::[^"'`]*)?["'`]/u;
  const offenders = CALIBRATION_LIST_SITES_K11.filter((parts) => codeLines(parts).some((line) => literal.test(line))).map((parts) => parts.join("/"));
  assert.deepEqual(offenders, [], "each of these keeps a private copy of a calibration path; import CALIBRATION_PATHS of project-authority-read.mjs");
});

test("the mirror-rule texts name the two calibration files through the shared list, not as retyped names", () => {
  const anywhere = /(?:project|\.claude)\/pipeline\.json/u;
  const offenders = CALIBRATION_TEXT_SITES_K11.filter((parts) => codeLines(parts).some((line) => anywhere.test(line))).map((parts) => parts.join("/"));
  assert.deepEqual(offenders, [], "a text that names both calibration files is built from CALIBRATION_PATHS of project-authority-read.mjs");
});

test("the exported twin list of repository-mode-promote is the shared list", () => {
  assert.deepEqual([...TWIN_PATHS], [...authorityRead.CALIBRATION_PATHS]);
  assert.equal(Object.isFrozen(TWIN_PATHS), true);
});

test("the guard texts of the two calibration mirrors read byte for byte as before (GS-10 and GS-11)", () => {
  const tail = " is a separate protected file: a change to one needs the same change in the other, each with its own PO-approved override, otherwise PCI-CALIBRATION-DRIFT turns Verify red. Every override binds to the exact HEAD, so commit this file first, only then touch the mirror and plan its override; run Verify after both commits.";
  const route = "To set the project verify command use the sanctioned route node <plugin-root>/scripts/pipeline-state.mjs configure-verify --verify-command <project verify command>; to replace a configured one during implementation add --replace (it runs the new command once, then one PO signature covers both mirrors and the Pipeline writes them, ADR-0100) -- never two overrides for a verify-command change. For any other key: its byte-equal mirror ";
  const byId = new Map(GATE_STRENGTH_PATHS.map((rule) => [rule.id, rule]));
  assert.equal(byId.get("GS-10").path, "project/pipeline.json");
  assert.equal(byId.get("GS-10").reason, `the project authority configuration declares verify and core settings and must not be edited directly. ${route}.claude/pipeline.json (GS-11)${tail}`);
  assert.equal(byId.get("GS-11").path, ".claude/pipeline.json");
  assert.equal(byId.get("GS-11").reason, `the legacy-tier project authority configuration declares verify and core settings. ${route}project/pipeline.json (GS-10)${tail}`);
});

test("the calibration read orders stay what each reader did: neutral first, and the file resolver is not the same rule", () => {
  const put = (base, rel, text) => { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), text); };
  const fresh = () => { const dir = join(WORK, `order-${counter += 1}`); mkdirSync(dir, { recursive: true }); return dir; };
  // A legacy manifest, no neutral manifest, both calibration files present with different `stakes`.
  const base = fresh();
  put(base, authorityRead.LEGACY_MANIFEST, "schema: pipeline.manifest.v0\n");
  put(base, authorityRead.NEUTRAL_CALIBRATION, "{\"stakes\":\"critical\"}\n");
  put(base, authorityRead.LEGACY_CALIBRATION, "{\"stakes\":\"low\"}\n");
  assert.equal(readCalibrationStakes(base), "critical", "the stakes reader takes the first file that exists: neutral");
  assert.equal(resolveAuthorityArtifactPath("calibration", { rootDir: base }).relPath, authorityRead.LEGACY_CALIBRATION,
    "the artifact resolver follows the manifest tier here; routing the stakes reader through it would change a security reading");
  // The stakes reader stops at the first file that exists; the close readback takes the first file that carries a string `stakes`.
  const bare = fresh();
  put(bare, authorityRead.NEUTRAL_CALIBRATION, "{\"project\":\"x\"}\n");
  put(bare, authorityRead.LEGACY_CALIBRATION, "{\"stakes\":\"critical\"}\n");
  assert.equal(readCalibrationStakes(bare), null, "no fall-through to the second file");
  const readback = (dir) => closeQualityReadback({ featureId: "f", readers: {
    exists: () => true,
    readBytes: (rel) => {
      if (rel === "evidence/security-latest.json") return Buffer.from(JSON.stringify({ scanners: [{ tool: "license-check", status: "SKIPPED", classification: "success" }] }));
      if (rel === "evidence/security-latest.v2.verdict.json") return Buffer.from("{}");
      return readFileSync(join(dir, rel));
    },
  } }).find((row) => row.id === "security-scan").evidence;
  assert.match(readback(bare), /license-check: not executed/u, "the readback falls through to the second file when the first has no string stakes");
  assert.match(readback(base), /license-check: not executed/u, "both present: the neutral file is read first");
});

test("an absent legacy peer leaves exactly the neutral tier", () => {
  const { root } = repository({ verify: BASELINE, legacyPeer: false });
  assert.deepEqual(inspectCommittedCalibrationVerifyLayout({ rootDir: root }), { status: "baseline-only", paths: ["project/pipeline.json"] });
});

test("an absent neutral peer leaves exactly the original legacy tier", () => {
  const { root } = repository({ verify: BASELINE, neutralPeer: false });
  assert.deepEqual(inspectCommittedCalibrationVerifyLayout({ rootDir: root }), { status: "baseline-only", paths: [".claude/pipeline.json"] });
});

test("a non-repository root stays unavailable and is never read through the common-dir normalization", () => {
  const bare = join(WORK, "not-a-repo");
  mkdirSync(bare, { recursive: true });
  process.env.GIT_CEILING_DIRECTORIES = WORK;
  const layout = inspectCommittedCalibrationVerifyLayout({ rootDir: bare });
  assert.equal(layout.status, "unavailable");
  assert.notEqual(layout.code, "CVCT-COMMON-DIR");
});
