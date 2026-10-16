// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.design-course-run-v2-refuses-its-own-documented-routes (AC-151).
 *
 * Original defect (K5-9, K5-8, K5-11, K3-16 + revision-path dispatch gap): the `--run-v2` design
 * course refused its own documented routes. The behavioural resolution is RETIREMENT, not repair:
 * the course, its mandatory Advisor / exception-rationale / readiness steps and the dispatch
 * supersede step are replaced by the ordinary design route (`present-plan --review-receipt`).
 * This pin maps each original clause to that outcome and never revives a retired step.
 *
 *   Clause                                          Superseding outcome pinned here
 *   K5-9  OUTPUT-COLLISION on prefixed paths        runDesignCourseV2 / CLI return the typed retirement
 *                                                   for exactly the colliding input; no collision refusal
 *   K5-8  agent-authored exception rationale        the rationale input is never read or required
 *   K5-11 preparation left behind, no resume        nothing is ever created, so nothing is left behind and
 *                                                   a pre-existing preparation is not "EXISTS"-refused
 *   K3-16 Advisor host fixture on native Windows    Advisor course retired; the fixture's POSIX gate stays a
 *                                                   typed host limitation (Linux/WSL run, owner Coordinator)
 *   Revision-path / zero-override route (R5-6/R5-8) ordinary route `present-plan --review-receipt` is the
 *                                                   named, accepted route; the retired flags name it
 *   Legacy repair consumers                         the producer/inspection exports are retained
 *
 * Fixtures live under the repository scratch/ directory (not the OS temp dir).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as designCourse from "../../scripts/design-course-session.mjs";
import { DESIGN_COURSE_RETIRED, RETIRED_DESIGN_ROUTE_HINT } from "../retired-design-codes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, "..", "..");
const REPO = resolve(PLUGIN, "..", "..");
const SCRIPT = join(PLUGIN, "scripts", "design-course-session.mjs");
const STATE_SCRIPT = join(PLUGIN, "scripts", "pipeline-state.mjs");
const ORDINARY_ROUTE = "present-plan --review-receipt";
const HOST_LIMITATION = "HOST-LIMITATION-NO-WINDOWS-AUTHORITY-ANCESTOR: owner Coordinator, due 2026-10-19, Linux/WSL run (PO K7)";

const scratchRoot = join(REPO, "scratch");
const work = join(scratchRoot, `design-course-run-v2-pin-${process.pid}`);
mkdirSync(work, { recursive: true });
after(() => { rmSync(work, { recursive: true, force: true }); });

const SHA = "a".repeat(64);
const PREFIX = "specs/feat/evidence/design-course/claude";
/** The K5-9 shape: no --advisor-result, every output path starts with `<output-prefix>.`. */
const collidingInput = (root) => ({
  root, pluginRoot: PLUGIN, runner: "claude", featureId: "feat", authoringDispatchId: "author-1",
  readinessDispatchId: "ready-1", outputPrefix: PREFIX,
  preparationPath: `${PREFIX}.preparation.json`, readinessPath: `${PREFIX}.receipt.json`,
  packagePath: `${PREFIX}.package.json`, confirmProducerExecution: true,
  sources: Object.fromEntries(["input", "prd", "spec", "design", "traceability"].map((n) => [n, { path: `docs/${n}.md`, sha256: SHA }])),
});
const forbidden = (name) => () => { throw new Error(`${name} must never run for a retired course`); };
const trapped = { execFileSync: forbidden("execFileSync"), executeProducer: forbidden("executeProducer"),
  readPreparation: forbidden("readPreparation"), buildPackageV2: forbidden("buildPackageV2") };

function snapshot(dir) {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name); out.push(p.slice(dir.length)); if (e.isDirectory()) walk(p); } };
  walk(dir); return out.sort();
}
function assertRetired(result, label) {
  assert.equal(result?.ok, false, `${label}: ok must be false`);
  assert.equal(result.code, DESIGN_COURSE_RETIRED, `${label}: typed retirement code, got ${result?.code}`);
  assert.ok(String(result.hint).includes(ORDINARY_ROUTE), `${label}: hint names the ordinary route`);
  assert.equal(result.implementationAuthority, false);
}
function fixture(name) {
  const dir = join(work, name);
  mkdirSync(join(dir, ...PREFIX.split("/").slice(0, -1)), { recursive: true });
  return dir;
}

test("A1 K5-9: the documented prefixed-path route returns the typed retirement, not DESIGN-COURSE-OUTPUT-COLLISION", async () => {
  const dir = fixture("a1");
  const result = await designCourse.runDesignCourseV2(collidingInput(dir), trapped);
  assertRetired(result, "prefixed paths, no advisor result");
  assert.notEqual(result.code, "DESIGN-COURSE-OUTPUT-COLLISION");
  // Un-confirmed and resumed (advisor result supplied) variants of the same documented route.
  assertRetired(await designCourse.runDesignCourseV2({ ...collidingInput(dir), confirmProducerExecution: false }, trapped), "unconfirmed");
  assertRetired(await designCourse.runDesignCourseV2({ ...collidingInput(dir), advisorProducerResult: { status: "answered" } }, trapped), "resumed");
  assertRetired(await designCourse.runDesignCourseV2(undefined, trapped), "no input at all");
});

test("A2 K5-8: no exception rationale (or other agent-authored evidence) is required or consumed", async () => {
  const dir = fixture("a2");
  const input = { ...collidingInput(dir), proposedExceptionRationale: "agent rationale", disposition: { x: 1 }, revisions: [{ y: 2 }] };
  assertRetired(await designCourse.runDesignCourseV2(input, trapped), "with rationale");
  assertRetired(await designCourse.runDesignCourseV2({ ...collidingInput(dir), proposedExceptionRationale: undefined }, trapped), "without rationale");
  assert.deepEqual(snapshot(dir).filter((p) => /rationale|evidence[\\/]exception/iu.test(p)), [], "nothing authored");
});

test("A3 K5-11: a retired run leaves nothing behind and a pre-existing preparation does not wedge it (idempotent)", async () => {
  const dir = fixture("a3");
  const before = snapshot(dir);
  assertRetired(await designCourse.runDesignCourseV2(collidingInput(dir), trapped), "first run");
  assert.deepEqual(snapshot(dir), before, "first run created no file");
  const prep = join(dir, ...`${PREFIX}.preparation.json`.split("/"));
  writeFileSync(prep, "stale-preparation");
  const second = await designCourse.runDesignCourseV2(collidingInput(dir), trapped);
  assertRetired(second, "rerun over a leftover preparation");
  assert.notEqual(second.code, "DESIGN-COURSE-PREPARATION-EXISTS");
  assert.equal(readFileSync(prep, "utf8"), "stale-preparation", "leftover untouched");
  assert.deepEqual(await designCourse.runDesignCourseV2(collidingInput(dir), trapped), second, "repeat call is identical");
});

test("A4 the CLI --run-v2 route (with every documented flag) exits 2 with the typed retirement and writes nothing", () => {
  const dir = fixture("a4");
  const before = snapshot(dir);
  const argv = [SCRIPT, "--run-v2", "--execute", "--root", dir, "--plugin-root", PLUGIN, "--runner", "claude",
    "--feature-id", "feat", "--authoring-dispatch-id", "author-1", "--readiness-dispatch-id", "ready-1",
    "--output-prefix", PREFIX, "--preparation", `${PREFIX}.preparation.json`, "--receipt", `${PREFIX}.receipt.json`,
    "--package", `${PREFIX}.package.json`,
    "--exception-rationale", "evidence/never-read.md", SHA, "--advisor-result", "evidence/never-read.json", SHA];
  const run = spawnSync(process.execPath, argv, { cwd: dir, encoding: "utf8", timeout: 60_000 });
  assert.equal(run.status, 2, `exit code; stderr: ${run.stderr}`);
  const parsed = JSON.parse(run.stdout.trim());
  assertRetired(parsed, "CLI");
  assert.equal(parsed.hint, RETIRED_DESIGN_ROUTE_HINT);
  assert.deepEqual(snapshot(dir), before, "CLI wrote nothing");
  const bare = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8", timeout: 60_000 });
  assert.equal(bare.status, 2);
  assertRetired(JSON.parse(bare.stdout.trim()), "CLI without flags");
});

test("A5 ordinary route: the superseding present-plan --review-receipt route is the named, live route; the old flags are retired onto it", () => {
  assert.ok(RETIRED_DESIGN_ROUTE_HINT.includes(ORDINARY_ROUTE));
  const source = readFileSync(STATE_SCRIPT, "utf8");
  assert.match(source, /--review-receipt/u, "present-plan consumes --review-receipt");
  assert.match(source, /DWP-PRESENT-RETIRED: use present-plan --review-receipt/u, "design-workflow-package flag retires onto it");
  assert.match(source, /DWP-APPROVAL-REQUEST-RETIRED: use present-plan --review-receipt/u);
  // The retired flag is refused by the real CLI before any state access.
  const run = spawnSync(process.execPath, [STATE_SCRIPT, "present-plan", "--by", "coordinator",
    "--design-workflow-package", "specs/x/design-workflow-package.json"], { cwd: fixture("a5"), encoding: "utf8", timeout: 60_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fixture("a5") } });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}\n${run.stderr}`, /DWP-PRESENT-RETIRED/u);
  assert.ok(`${run.stdout}\n${run.stderr}`.includes(ORDINARY_ROUTE));
});

test("A6 ordinary route end to end (zero override, no authoring-dispatch supersede): full e2e run", { skip: process.platform === "win32" ? HOST_LIMITATION : false }, () => {
  // Runs the existing route-1/route-4 examiners of design-approval-route.e2e.test.mjs unchanged.
  const run = spawnSync(process.execPath, ["--test", "--test-name-pattern=route 1|route 4",
    join(PLUGIN, "scripts", "design-approval-route.e2e.test.mjs")], { encoding: "utf8", timeout: 600_000 });
  assert.equal(run.status, 0, run.stdout.slice(-2000));
});

test("A7 K3-16 / R4-8: the Advisor host fixture's native-Windows run is a typed host limitation on Linux/WSL, not a revived Advisor step", { skip: process.platform === "win32" ? "HOST-LIMITATION-NO-POSIX-DIRECTORY-MODES: owner Coordinator, due 2026-10-19, Linux/WSL run (PO K7)" : false }, () => {
  // On Linux/WSL: the sibling pin proves the real readinessFixture builds a host store.
  const run = spawnSync(process.execPath, ["--test", join(HERE, "design-workflow-package-v2-readiness-fixture-fails-on-windows.test.mjs")],
    { encoding: "utf8", timeout: 300_000 });
  assert.equal(run.status, 0, run.stdout.slice(-2000));
});

test("A8 legacy repair consumers stay exported and callable (nothing deleted, nothing revived)", () => {
  for (const name of ["buildDesignCourseProducerAction", "executeDesignCourseProducer", "inspectDesignCourseSession",
    "inspectDesignCourseSubmission", "writeVerifiedReadinessPreparation", "buildFinalDesignReviewRequest", "runDesignCourseV2", "main"]) {
    assert.equal(typeof designCourse[name], "function", `${name} export retained`);
  }
  assert.equal(existsSync(join(REPO, "scratch")), true);
});

test("A9 RED mirror: with the retirement line removed from a scratch mirror, the same K5-9 input is NOT retired, so A1 can fail", async () => {
  const source = readFileSync(SCRIPT, "utf8");
  const marker = "  return retiredDesignResult(DESIGN_COURSE_RETIRED);\n  if (input.confirmProducerExecution";
  assert.equal(source.split(marker).length, 2, "exactly one retirement short-circuit in runDesignCourseV2");
  const libUrl = pathToFileURL(join(PLUGIN, "lib")).href;
  const mirror = source.replace(marker, "  if (input.confirmProducerExecution")
    .replaceAll('"../lib/', `"${libUrl}/`)
    .replaceAll('from "./', `from "${pathToFileURL(join(PLUGIN, "scripts")).href}/`)
    .replaceAll('import("./', `import("${pathToFileURL(join(PLUGIN, "scripts")).href}/`);
  const mirrorPath = join(work, "design-course-session.mirror.mjs");
  writeFileSync(mirrorPath, mirror);
  const mod = await import(pathToFileURL(mirrorPath).href);
  const dir = fixture("a9");
  const result = await mod.runDesignCourseV2(collidingInput(dir), trapped);
  assert.throws(() => assertRetired(result, "mirror"), "assertRetired rejects the un-retired mirror result");
  // The mirror reproduces the original K5-9 symptom class (a non-retirement refusal for the documented route).
  assert.notEqual(result.code, DESIGN_COURSE_RETIRED);
});
