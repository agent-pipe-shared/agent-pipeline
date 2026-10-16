// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.catalogue-admit-prescribed-lifecycle-verbs (AC-123, ALF-C-P11-04).
// Acceptance: every lifecycle verb the design course prescribes (`present-plan`,
// `design-course-session --run-v2`, `submit-plan`/`reopen-design`/`set-phase`) runs for the
// agent in the state where it is prescribed -- the real guard classifies and admits the exact
// emitted shape -- WITHOUT a broad grammar relaxation (tampered shapes stay refused).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("AC-123 receipt aliases (directory/file symlink) never gain present-plan admission", { skip: HOST_LIMITATION }, () => {});

test("AC-123 continuity-* writers are not catalogue-admitted lifecycle verbs of the current course", () => {
  // Boundary pin: the current course text (skills/pipeline-start/references/design-course.md) prescribes
  // no continuity-* verb for the agent, and the guard must not admit them by accident.
  withFixture("feature", f => {
    for (const verb of ["continuity-init", "continuity-cas", "continuity-apply-native", "continuity-select-course"]) {
      assert.equal(admitted(stateAction(verb, "--root", f.root), f), false, verb);
    }
  });
});
