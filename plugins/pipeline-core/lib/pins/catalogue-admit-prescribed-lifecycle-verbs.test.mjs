// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.catalogue-admit-prescribed-lifecycle-verbs (AC-123, ALF-C-P11-04).
// Acceptance: every lifecycle verb the design course prescribes (`present-plan`,
// `design-course-session --run-v2`, `submit-plan`/`reopen-design`/`set-phase`) runs for the
// agent in the state where it is prescribed -- the real guard classifies and admits the exact
// emitted shape -- WITHOUT a broad grammar relaxation (tampered shapes stay refused).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";
// Host fact (measured; first-enrollment-enters-retirement-before-consent.test.mjs): the State authority route
// fails WT-GIT-FAILED on a Git root with no HEAD commit. The adjacent fixture() never commits, so on this
// host every case below stops inside fixture() at submit-plan. See the report: a born-HEAD fixture is needed.
// The pin therefore carries a local copy of fixture() plus one hooks-enabled empty base commit.
import { actualGuard, advisorAction } from "../../hooks/design-course-command-admission.test.mjs";
import { execFileSync as runFixtureGit } from "node:child_process";
import { isSanctionedLifecycleCommand } from "../../hooks/guard-lifecycle-ready.mjs";
import { run, statePath } from "../../scripts/pipeline-state.mjs";
import { main as courseMain } from "../../scripts/design-course-session.mjs";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "../..");
const stateScript = join(pluginRoot, "scripts/pipeline-state.mjs");
const courseScript = join(pluginRoot, "scripts/design-course-session.mjs");
const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
const render = action => [action.executable, ...action.argv].map(quote).join(" ");
const digest = value => createHash("sha256").update(value).digest("hex");
const HOST_LIMITATION = "host-limitation: native Windows host cannot create directory symlinks or mode bits; "
  + "owner Coordinator, due 2026-10-19, to run on Linux/WSL (PO decision K7)";

const names = ["input", "prd", "spec", "design", "traceability"];
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function fixtureCapture(fn) {
  const stdout = []; const stderr = [];
  const beforeLog = console.log; const beforeError = console.error;
  console.log = (...values) => stdout.push(values.join(" "));
  console.error = (...values) => stderr.push(values.join(" "));
  try { return { code: fn(), stdout: stdout.join("\n"), stderr: stderr.join("\n") }; }
  finally { console.log = beforeLog; console.error = beforeError; }
}
// Local copy of fixture() from hooks/design-course-command-admission.test.mjs, plus a born-HEAD base commit.
function fixture(profile = "feature") {
  const scratch = resolve(pluginRoot, "../../scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "alf-c-p11-04b-fixture-"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  runFixtureGit("git", ["init", "-q", root], { env });
  // Host fact: the State authority route fails WT-GIT-FAILED on a Git root with no HEAD commit.
  runFixtureGit("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "-q", "--allow-empty", "-m", "test: fixture base", "-m", "AI-Assisted: true\nDispatch: ALF-C-P11-04B (goldfish)"], { env });
  const featureId = "feature-test"; const authoringDispatchId = "authoring-1";
  const planPath = `specs/${featureId}/prd.md`; const specPath = `specs/${featureId}/spec.md`;
  const now = "2026-10-03T00:00:00.000Z";
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, `specs/${featureId}`), { recursive: true });
  mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(root, ".agent-pipeline/onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: now,
  }));
  const spec = "# Technical Spec\nGuard admission regression.\n";
  const plan = `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${digest(spec)} -->\n# PRD\n${featureId}\n`;
  const sourcePaths = { input: `specs/${featureId}/design-input.md`, prd: planPath, spec: specPath,
    design: `specs/${featureId}/design.md`, traceability: `specs/${featureId}/traceability.md` };
  for (const name of names) writeFileSync(join(root, sourcePaths[name]), name === "prd" ? plan : name === "spec" ? spec : `${name} fixture bytes\n`);
  const sources = Object.fromEntries(names.map(name => [name, { path: sourcePaths[name], sha256: digest(readFileSync(join(root, sourcePaths[name]))) }]));
  const evidence = { schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64), receiptSha256: "3".repeat(64), repositoryFingerprint: "4".repeat(64) };
  const continuity = { schema: "pipeline.continuity.v0", featureId, revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: { prd: { path: planPath, sha256: sources.prd.sha256 }, spec: { path: specPath, sha256: sources.spec.sha256 }, result: null },
    queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeFileSync(statePath(root), JSON.stringify({ schema: "pipeline.state.v0", activeFeature: { id: featureId, planPath, phase: "design" }, planApproved: false, continuity, updatedAt: now }));
  const deps = { dir: root, now: () => now, gitCandidate: () => ({ ok: true, ...candidate }),
    gitHead: () => ({ ok: true, commit: candidate.commit }),
    gitUserName: () => "Fixture", poGateProfile: () => ({ ok: true, value: evidence }),
    poGateAuthority: () => ({ ok: true, value: { ...evidence, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: sources.prd.sha256, specPath, specSha256: sources.spec.sha256 } }),
    designAdvisoryAdmission: () => ({ ok: true, id: "a".repeat(64) }), runner: "codex" };
  const submitted = fixtureCapture(() => run(["submit-plan", "--by", "coordinator", "--profile", profile], deps));
  assert.equal(submitted.code, 0, submitted.stderr);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  state.continuity.queueHead.dispatch = { dispatchId: authoringDispatchId };
  writeFileSync(statePath(root), JSON.stringify(state));
  return { root, deps, state, sources, featureId, authoringDispatchId, profile,
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const node = argv => ({ executable: process.execPath, argv });
const stateAction = (...argv) => node([stateScript, ...argv]);
const admitted = (action, f) => isSanctionedLifecycleCommand(render(action), f.root);
const guardCode = (action, f) => actualGuard(action, f.root).code;
function withFixture(profile, body) {
  const f = fixture(profile);
  let result;
  try { result = body(f); } catch (error) { f.cleanup(); throw error; }
  // A body that returns a promise must finish before the disposable root is removed.
  if (result && typeof result.then === "function") return result.finally(() => f.cleanup());
  f.cleanup();
  return result;
}
function receipt(f, name) {
  mkdirSync(join(f.root, "evidence"), { recursive: true });
  const path = `evidence/${name}.json`;
  writeFileSync(join(f.root, path), `{"receipt":"${name}"}\n`);
  return path;
}
function capture(fn) {
  const out = []; const before = console.log; const beforeErr = console.error;
  console.log = (...v) => out.push(v.join(" ")); console.error = () => {};
  try { return { code: fn(), stdout: out.join("\n") }; } finally { console.log = before; console.error = beforeErr; }
}

// ---- scratch mirror of the production verifier, for RED (never edits production) ----
const guardDir = join(pluginRoot, "lib/guard");
function mirrorSanctionedArgs(patch) {
  let source = readFileSync(join(guardDir, "sanctioned-args-scripts.mjs"), "utf8");
  source = source.replace(/from "(\.{1,2}\/[^"]+)"/gu, (_m, rel) => `from "${pathToFileURL(resolve(guardDir, rel)).href}"`);
  const patched = patch(source);
  assert.notEqual(patched, source, "mutation must change the mirror");
  const scratch = resolve(pluginRoot, "../../scratch");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "alf-c-p11-04-mirror-"));
  const file = join(dir, "mirror.mjs");
  writeFileSync(file, patched);
  return { file, dir };
}

test("AC-123 present-plan: one and two distinct review receipts are admitted by the real guard in design phase", () => {
  withFixture("feature", f => {
    const r1 = receipt(f, "review-1"); const r2 = receipt(f, "review-2");
    const one = stateAction("present-plan", "--by", "Fixture", "--review-receipt", r1);
    const two = stateAction("present-plan", "--by", "Fixture", "--review-receipt", r1, "--review-receipt", r2);
    for (const action of [one, two]) {
      assert.equal(admitted(action, f), true, JSON.stringify(action.argv));
      assert.equal(guardCode(action, f), 0);
    }
    // mini presentation (no receipt) is also a prescribed shape
    assert.equal(admitted(stateAction("present-plan", "--by", "Fixture"), f), true);
  });
});

test("AC-123 present-plan: admission stays narrow (no broad grammar relaxation)", () => {
  withFixture("feature", f => {
    const r1 = receipt(f, "review-1"); const r2 = receipt(f, "review-2"); const r3 = receipt(f, "review-3");
    writeFileSync(join(f.root, "evidence/not-json.txt"), "x");
    const rr = path => ["--review-receipt", path];
    const refusals = [
      ["three receipts", ["--by", "F", ...rr(r1), ...rr(r2), ...rr(r3)]],
      ["duplicate receipt", ["--by", "F", ...rr(r1), ...rr(r1)]],
      ["missing receipt file", ["--by", "F", ...rr("evidence/absent.json")]],
      ["non-json receipt", ["--by", "F", ...rr("evidence/not-json.txt")]],
      ["parent escape", ["--by", "F", ...rr("../outside.json")]],
      ["absolute receipt", ["--by", "F", ...rr(join(f.root, r1))]],
      ["flag-shaped presenter", ["--by", "--review-receipt", r1]],
      ["empty presenter", ["--by", "", ...rr(r1)]],
      ["extra flag", ["--by", "F", ...rr(r1), "--extra", "x"]],
      ["retired package flag", ["--by", "F", "--design-workflow-package", "evidence/design-workflow-package.json"]],
      ["receipt without presenter", [...rr(r1)]],
    ];
    for (const [label, args] of refusals) {
      const action = stateAction("present-plan", ...args);
      assert.equal(admitted(action, f), false, label);
      assert.equal(guardCode(action, f), 2, label);
    }
  });
});

test("AC-123 present-plan RED: a scratch mirror with widened receipt count admits what production refuses", async () => {
  withFixture("feature", f => {
    const r = ["a", "b", "c"].map(n => receipt(f, `red-${n}`));
    const argv = ["present-plan", "--by", "F", ...r.flatMap(p => ["--review-receipt", p])];
    const mirror = mirrorSanctionedArgs(s => s.replace("![3, 5, 7].includes(args.length)", "![3, 5, 7, 9].includes(args.length)"));
    return import(pathToFileURL(mirror.file).href).then(mod => {
      try {
        assert.equal(mod.sanctionedPipelineStateArgs(argv, f.root), true, "mutant mirror must admit three receipts");
        assert.equal(admitted(node([stateScript, ...argv]), f), false, "production must refuse the same argv");
      } finally { rmSync(mirror.dir, { recursive: true, force: true }); }
    });
  });
});

test("AC-123 present-plan RED: a scratch mirror without the duplicate check admits what production refuses", () => {
  return withFixture("feature", f => {
    const r1 = receipt(f, "red-dup");
    const argv = ["present-plan", "--by", "F", "--review-receipt", r1, "--review-receipt", r1];
    const mirror = mirrorSanctionedArgs(s => s.replace("|| receipts.has(args[index + 1])", ""));
    return import(pathToFileURL(mirror.file).href).then(mod => {
      try {
        assert.equal(mod.sanctionedPipelineStateArgs(argv, f.root), true);
        assert.equal(admitted(node([stateScript, ...argv]), f), false);
      } finally { rmSync(mirror.dir, { recursive: true, force: true }); }
    });
  });
});

test("AC-123 emitted command: the concrete present-plan action inspect emits is admitted by the real guard", () => {
  for (const profile of ["mini", "feature"]) withFixture(profile, f => {
    const observed = capture(() => run(["inspect"], f.deps));
    assert.equal(observed.code, 0);
    const action = JSON.parse(observed.stdout).nextAction;
    if (profile === "feature") {
      assert.equal(action.code, "DAB-REVIEW-RECEIPT-REQUIRED");
      assert.match(action.guidance, /present-plan --review-receipt/u);
      const concrete = stateAction("present-plan", "--by", "Fixture", "--review-receipt", receipt(f, "emitted-1"));
      assert.equal(guardCode(concrete, f), 0);
      return;
    }
    assert.ok(action.kind === "command" || action.kind === "collect-input", JSON.stringify(action));
    // Observed shapes: a derivable presenter yields a ready `command`; otherwise a `collect-input` whose
    // guidance carries the exact present-plan command text (no applyAction) with a presenter placeholder.
    if (action.kind === "collect-input") assert.match(action.guidance, /present-plan --by "<submitter's name>"/u, JSON.stringify(action));
    const concrete = action.kind === "command" ? action : stateAction("present-plan", "--by", "<submitter's name>");
    assert.equal(concrete.argv[1], "present-plan");
    // The emitted shape carries a presenter placeholder; the collected value replaces it.
    const argv = concrete.argv.map((word, i) => (concrete.argv[i - 1] === "--by" ? "Fixture" : word));
    const filled = { executable: concrete.executable, argv };
    assert.equal(admitted(filled, f), true, JSON.stringify(concrete.argv));
    assert.equal(guardCode(filled, f), 0);
  });
});

test("AC-123 emitted command: mini inspect with a local git user.name emits the prescribed present-plan verb as a ready command the guard admits as emitted", () => {
  withFixture("mini", f => {
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
      GIT_CEILING_DIRECTORIES: dirname(f.root) };
    runFixtureGit("git", ["-C", f.root, "config", "--local", "user.name", "Fixture"], { env });
    const observed = capture(() => run(["inspect"], f.deps));
    assert.equal(observed.code, 0);
    const action = JSON.parse(observed.stdout).nextAction;
    // The prescribed verb is the direct next action, not a collect-input asking for a presenter.
    assert.equal(action.kind, "command", JSON.stringify(action));
    assert.equal(action.mutation, true);
    assert.equal(action.requiresConfirmation, false);
    assert.deepEqual(action.argv.slice(1), ["present-plan", "--by", "Fixture"]);
    const emitted = { executable: action.executable, argv: action.argv };
    assert.equal(admitted(emitted, f), true, JSON.stringify(emitted.argv));
    assert.equal(guardCode(emitted, f), 0);
    // No broad relaxation: the same emitted command with an extra flag stays refused.
    const tampered = { executable: action.executable, argv: [...action.argv, "--extra", "x"] };
    assert.equal(admitted(tampered, f), false);
    assert.equal(guardCode(tampered, f), 2);
  });
});

test("AC-123 submit-plan, reopen-design and set-phase prescribed by the course are admitted; wrong shapes are not", () => {
  withFixture("feature", f => {
    for (const profile of ["epic", "feature", "mini"]) {
      assert.equal(admitted(stateAction("submit-plan", "--by", "Fixture", "--profile", profile), f), true, profile);
    }
    assert.equal(admitted(stateAction("reopen-design", "--by", "Fixture"), f), true);
    assert.equal(admitted(stateAction("set-phase", "--phase", "implementation"), f), true);
    for (const argv of [["submit-plan", "--by", "Fixture", "--profile", "other"], ["submit-plan", "--profile", "feature"],
      ["reopen-design"], ["reopen-design", "--by", "Fixture", "--extra"], ["set-phase", "--phase", "release"]]) {
      assert.equal(admitted(stateAction(...argv), f), false, argv.join(" "));
    }
  });
});

function runV2Action(f, runner, { resumed = false } = {}) {
  const base = advisorAction(f);
  return base.then(advisor => {
    const prefix = `evidence/design-course/${f.featureId}/${runner}`;
    const argv = [...advisor.argv];
    argv[argv.indexOf("--runner") + 1] = runner;
    argv[argv.indexOf("--output-prefix") + 1] = prefix;
    argv.splice(argv.indexOf("--stage"), 2); argv.splice(1, 0, "--run-v2"); argv.pop();
    argv.push("--readiness-dispatch-id", "readiness-1", "--queue-revision", String(f.state.continuity.revision),
      "--receipt", `${prefix}.readiness.json`, "--preparation", `${prefix}.preparation.json`, "--package", `${prefix}.package.json`);
    if (runner === "codex") argv.push("--session-id", "session-1", "--descriptor-sha256", "c".repeat(64));
    mkdirSync(join(f.root, `evidence/design-course/${f.featureId}`), { recursive: true });
    const put = (flag, path, value) => {
      const bytes = typeof value === "string" ? value : JSON.stringify(value);
      writeFileSync(join(f.root, path), bytes); argv.push(flag, path, digest(bytes));
    };
    if (runner === "codex") {
      put("--disposition", `${prefix}.disposition.json`, { status: "curated" });
      put("--revisions", `${prefix}.revisions.json`, []);
    } else put("--exception-rationale", `${prefix}.exception-rationale.txt`, "A specific exception is proposed.");
    if (resumed) put("--advisor-result", `${prefix}.advisor-result.json`, { runner, implementationAuthority: false });
    argv.push("--execute");
    return { executable: process.execPath, argv };
  });
}

test("AC-123 design-course-session --run-v2: exact current shape admitted for every runner, retired execution refuses before dependencies", async () => {
  const f = fixture();
  try {
    for (const runner of ["claude", "codex", "antigravity"]) for (const resumed of [false, true]) {
      const action = await runV2Action(f, runner, { resumed });
      assert.equal(admitted(action, f), true, `${runner} resumed=${resumed}`);
      assert.equal(guardCode(action, f), 0, `${runner} resumed=${resumed}`);
      const before = readFileSync(statePath(f.root), "utf8");
      const trap = () => { throw new Error("retired route touched a dependency"); };
      const io = { stdout: { write() {} }, exitCode: 0 };
      const result = await courseMain(action.argv.slice(1), io, { readState: trap, execFileSync: trap, spawnSync: trap, buildPackageV2: trap });
      assert.equal(result.ok, false);
      assert.equal(result.implementationAuthority, false);
      assert.equal(io.exitCode, 2);
      assert.equal(readFileSync(statePath(f.root), "utf8"), before);
    }
  } finally { f.cleanup(); }
});

test("AC-123 design-course-session --run-v2: tampered shapes stay refused (no broad relaxation)", async () => {
  const f = fixture();
  try {
    const action = await runV2Action(f, "codex", { resumed: true });
    const set = (flag, value) => { const argv = [...action.argv]; argv[argv.indexOf(flag) + 1] = value; return { ...action, argv }; };
    for (const bad of [set("--feature-id", "other"), set("--authoring-dispatch-id", "other"), set("--package", "evidence/other.package.json"),
      set("--readiness-dispatch-id", f.authoringDispatchId), set("--queue-revision", "99"), set("--root", `${f.root}/.`),
      { ...action, argv: [...action.argv, "--approve"] }, { ...action, argv: [...action.argv, "--sign-intent"] },
      { ...action, argv: [join(f.root, "design-course-session.mjs"), ...action.argv.slice(1)] }]) {
      assert.equal(admitted(bad, f), false, JSON.stringify(bad.argv));
      assert.equal(guardCode(bad, f), 2, JSON.stringify(bad.argv));
    }
    // changed physical bytes invalidate a previously admitted command
    const disposition = action.argv[action.argv.indexOf("--disposition") + 1];
    writeFileSync(join(f.root, disposition), "{\"status\":\"changed\"}");
    assert.equal(admitted(action, f), false);
  } finally { f.cleanup(); }
});

test("AC-123 receipt aliases (directory/file symlink) never gain present-plan admission", (t) => {
  return withFixture("feature", f => {
    const real = receipt(f, "real-1");
    const fileAlias = "evidence/alias-file.json";
    const dirAlias = "evidence-alias";
    try {
      symlinkSync(join(f.root, real), join(f.root, fileAlias), "file");
      symlinkSync(join(f.root, "evidence"), join(f.root, dirAlias), "dir");
    } catch (error) {
      // Typed conditional skip: only a host that cannot create a link (native Windows without the privilege).
      t.skip(`${HOST_LIMITATION} (${error?.code ?? "unknown"})`);
      return;
    }
    const present = path => stateAction("present-plan", "--by", "Fixture", "--review-receipt", path);
    assert.equal(admitted(present(real), f), true, "control: the physical receipt itself is admitted");
    for (const [label, path] of [["file symlink", fileAlias], ["directory symlink", `${dirAlias}/real-1.json`]]) {
      assert.equal(admitted(present(path), f), false, label);
      assert.equal(guardCode(present(path), f), 2, label);
    }
  });
});

test("AC-123 continuity-* writers are not catalogue-admitted lifecycle verbs of the current course", () => {
  // Boundary pin: the current course text (skills/pipeline-start/references/design-course.md) prescribes
  // no continuity-* verb for the agent, and the guard must not admit them by accident.
  withFixture("feature", f => {
    for (const verb of ["continuity-init", "continuity-cas", "continuity-apply-native", "continuity-select-course"]) {
      assert.equal(admitted(stateAction(verb, "--root", f.root), f), false, verb);
    }
  });
});


// ---- D64 (0.7.0, blocker): every fixed installed entry point the Pipeline prescribes before the first implementation
// dispatch is admitted, in its documented closed argument forms, in the lifecycle state that prescribes it ----
const scriptsDir = join(pluginRoot, "scripts");
const selectScript = join(scriptsDir, "model-role-dispatch-select.mjs");
const receiptScript = join(scriptsDir, "design-review-receipt.mjs");
const registerScript = join(scriptsDir, "register-feature-package.mjs");
const baselineScript = join(scriptsDir, "architecture-baseline.mjs");
const bootstrapScript = join(scriptsDir, "model-role-bootstrap.mjs");
const scriptAction = (script, ...argv) => node([script, ...argv]);
// Both the catalogue verdict and the real guard (no readiness, no override) must agree.
function bothAdmit(action, f, label) {
  assert.equal(admitted(action, f), true, `${label}: catalogue`);
  assert.equal(guardCode(action, f), 0, `${label}: real guard`);
}
function bothRefuse(action, f, label) {
  assert.equal(admitted(action, f), false, `${label}: catalogue`);
  assert.equal(guardCode(action, f), 2, `${label}: real guard`);
}

test("D64 pipeline-state documented help and readback forms are admitted", () => {
  withFixture("feature", f => {
    for (const word of ["--help", "-h", "help"]) bothAdmit(stateAction(word), f, word);
    bothAdmit(stateAction("inspect"), f, "inspect");
    bothRefuse(stateAction("--help", "--extra"), f, "help with an extra argument");
    bothRefuse(stateAction("help", "inspect"), f, "help with a topic");
  });
});

test("D64 route selection: the documented closed forms are admitted, near-misses are not", () => {
  withFixture("feature", f => {
    const select = (...rest) => scriptAction(selectScript, "--repo-root", f.root, ...rest);
    for (const runner of ["codex", "claude"]) bothAdmit(select("--runner", runner, "--task-route", "profile.critic.review"), f, runner);
    bothAdmit(select("--runner", "codex", "--task-route", "duty.advisory.fallback"), f, "duty route");
    bothAdmit(select("--runner", "antigravity", "--task-route", "profile.critic.review", "--host-session-id", "hook-session-1"), f, "antigravity");
    const refusals = [
      ["foreign root", scriptAction(selectScript, "--repo-root", join(f.root, ".."), "--runner", "codex", "--task-route", "duty.x")],
      ["relative root", scriptAction(selectScript, "--repo-root", ".", "--runner", "codex", "--task-route", "duty.x")],
      ["unknown runner", select("--runner", "other", "--task-route", "duty.x")],
      ["antigravity without a host session id", select("--runner", "antigravity", "--task-route", "duty.x")],
      ["codex with a host session id", select("--runner", "codex", "--task-route", "duty.x", "--host-session-id", "s1")],
      ["route with a path separator", select("--runner", "codex", "--task-route", "../x")],
      ["route starting with a dash", select("--runner", "codex", "--task-route", "--help")],
      ["extra flag", select("--runner", "codex", "--task-route", "duty.x", "--extra", "1")],
      ["swapped flag order", scriptAction(selectScript, "--runner", "codex", "--repo-root", f.root, "--task-route", "duty.x")],
      ["missing route", select("--runner", "codex")],
    ];
    for (const [label, action] of refusals) bothRefuse(action, f, label);
  });
});

function receiptFixture(f) {
  mkdirSync(join(f.root, "specs", f.featureId, "review"), { recursive: true });
  const report = `specs/${f.featureId}/review/design-review-1.md`;
  const report2 = `specs/${f.featureId}/review/design-review-2.md`;
  writeFileSync(join(f.root, report), "# Critic report\n\nVerdict: PASS\n");
  writeFileSync(join(f.root, report2), "# Critic report round 2\n\nVerdict: PASS\n");
  writeFileSync(join(f.root, `specs/${f.featureId}/review/receipt-1.json`), "{}\n");
  return { report, report2, prd: f.sources.prd.path, spec: f.sources.spec.path, out: `specs/${f.featureId}/review/receipt-new.json` };
}
const receiptCreate = (f, r, over = {}) => {
  const flags = { "--repo": f.root, "--feature": f.featureId, "--report": r.report, "--prd": r.prd, "--spec": r.spec, "--out": r.out, ...over };
  return scriptAction(receiptScript, "create", ...Object.entries(flags).flatMap(([flag, value]) => (value === null ? [] : [flag, value])));
};

test("D64 design-review receipt production: the documented forms are admitted, derived-value flags and unsafe paths are not", () => {
  withFixture("feature", f => {
    const r = receiptFixture(f);
    bothAdmit(receiptCreate(f, r), f, "initial round");
    bothAdmit(scriptAction(receiptScript, "create", "--repo", f.root, "--feature", f.featureId, "--report", r.report2, "--prd", r.prd, "--spec", r.spec,
      "--previous", `specs/${f.featureId}/review/receipt-1.json`, "--open-finding", "F-1", "--open-finding", "F-2", "--companion", f.sources.design.path,
      "--requested-route", "claude-sonnet-5-5", "--observed-identity", "claude-sonnet-5-5", "--out", r.out), f, "delta round with companions and findings");
    const refusals = [
      ["a flag that supplies a derived value", receiptCreate(f, r, { "--reviewed-at": "2026-10-22T00:00:00.000Z" })],
      ["a digest flag", receiptCreate(f, r, { "--sha256": "a".repeat(64) })],
      ["foreign repo", receiptCreate(f, r, { "--repo": join(f.root, "..") })],
      ["missing --out", receiptCreate(f, r, { "--out": null })],
      ["out outside specs, evidence and docs", receiptCreate(f, r, { "--out": "src/receipt.json" })],
      ["out that is not json", receiptCreate(f, r, { "--out": `specs/${f.featureId}/review/receipt-new.js` })],
      ["out traversal", receiptCreate(f, r, { "--out": "specs/../src/receipt.json" })],
      ["absolute report", receiptCreate(f, r, { "--report": join(f.root, r.report) })],
      ["traversal in the report", receiptCreate(f, r, { "--report": "specs/feature-test/../../outside.md" })],
      ["report that does not exist", receiptCreate(f, r, { "--report": `specs/${f.featureId}/review/absent.md` })],
      ["unknown subcommand", scriptAction(receiptScript, "verify", "--repo", f.root)],
      ["a duplicated single flag", scriptAction(receiptScript, "create", "--repo", f.root, "--feature", f.featureId, "--report", r.report, "--report", r.report2, "--prd", r.prd, "--spec", r.spec, "--out", r.out)],
      ["a duplicated companion", scriptAction(receiptScript, "create", "--repo", f.root, "--feature", f.featureId, "--report", r.report, "--prd", r.prd, "--spec", r.spec, "--companion", r.prd, "--companion", r.prd, "--out", r.out)],
      ["an open finding that is a flag", scriptAction(receiptScript, "create", "--repo", f.root, "--feature", f.featureId, "--report", r.report, "--prd", r.prd, "--spec", r.spec, "--open-finding", "--out", "--out", r.out)],
    ];
    for (const [label, action] of refusals) bothRefuse(action, f, label);
  });
});

test("D64 design-review receipt production: a linked input or a linked output directory is never admitted", (t) => {
  return withFixture("feature", f => {
    const r = receiptFixture(f);
    const link = `specs/${f.featureId}/review/linked-report.md`;
    try {
      symlinkSync(join(f.root, r.report), join(f.root, link), "file");
      symlinkSync(join(f.root, "specs", f.featureId, "review"), join(f.root, "specs", "review-alias"), "dir");
    } catch (error) { t.skip(`${HOST_LIMITATION} (${error?.code ?? "unknown"})`); return; }
    bothRefuse(receiptCreate(f, r, { "--report": link }), f, "file link as report");
    bothRefuse(receiptCreate(f, r, { "--out": "specs/review-alias/receipt-new.json" }), f, "output below a linked directory");
  });
});

test("D64 feature-package registration: exactly the documented forms are admitted", () => {
  withFixture("feature", f => {
    bothAdmit(scriptAction(registerScript, "--root", f.root), f, "register");
    bothAdmit(scriptAction(registerScript, "--root", f.root, "--add-review-unit"), f, "add review unit");
    for (const [label, argv] of [["foreign root", ["--root", join(f.root, "..")]], ["no root", []], ["extra flag", ["--root", f.root, "--force"]],
      ["review unit before root", ["--add-review-unit", "--root", f.root]], ["double review unit", ["--root", f.root, "--add-review-unit", "--add-review-unit"]]]) {
      bothRefuse(scriptAction(registerScript, ...argv), f, label);
    }
  });
});

test("D64 architecture baseline diagnosis: the read-only assessment forms and --help are admitted; the writing and file-reading forms are not", () => {
  withFixture("feature", f => {
    const base = (...rest) => scriptAction(baselineScript, "--root", f.root, ...rest);
    bothAdmit(base(), f, "assessment");
    bothAdmit(base("--format", "json"), f, "json");
    bothAdmit(base("--diff", "HEAD~1", "--format", "text"), f, "diff");
    bothAdmit(base("--from", "a".repeat(40), "--through", "b".repeat(40)), f, "range");
    bothAdmit(scriptAction(baselineScript, "--help"), f, "--help");
    bothAdmit(scriptAction(baselineScript, "-h"), f, "-h");
    for (const [label, action] of [
      ["compile-summary writes project/architecture-decisions.compiled.json", base("--compile-summary")],
      ["validate reads an arbitrary path", scriptAction(baselineScript, "--validate", "docs/adr/0001.md")],
      ["foreign root", scriptAction(baselineScript, "--root", join(f.root, ".."))],
      ["unknown format", base("--format", "yaml")],
      ["diff value that is a flag", base("--diff", "--compile-summary")],
      ["diff together with a range", base("--diff", "main", "--from", "a".repeat(40), "--through", "b".repeat(40))],
      ["half a range", base("--from", "a".repeat(40))],
      ["help with a root", base("--help")],
      ["repeated flag", base("--format", "json", "--format", "text")],
    ]) bothRefuse(action, f, label);
  });
});

test("D64 model-role bootstrap admits a host session and is a decision, not an admission: it stays refused here", () => {
  withFixture("feature", f => {
    // model-role-bootstrap.mjs ADMITS the session's role receipt into the host store after readback; whether the
    // guard may pre-admit that write for the agent is a product decision (see the D64 report), so it is pinned refused.
    bothRefuse(scriptAction(bootstrapScript, "--repo-root", f.root, "--runner", "codex"), f, "bootstrap");
  });
});
