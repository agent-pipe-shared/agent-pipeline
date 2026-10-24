// SPDX-License-Identifier: SUL-1.0
// K156: the phase writer must leave a commit-ready calibration transition.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { fileURLToPath } from "node:url";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";
import { prepareAdoptionAuthority } from "../lib/architecture-adoption-authority.mjs";
import { inspectArchitectureEntryReadiness } from "../lib/architecture-entry-readiness.mjs";
import { inspectCalibrationVerifyCommitTransition, inspectCurrentCalibrationVerifyReady } from "../lib/calibration-verify-commit-transition.mjs";
import { applyAdoptionDecision } from "./architecture-adoption.mjs";
import { observeCurrentPlanApprovalForCalibration, run } from "./pipeline-state.mjs";

const BASELINE = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";
const COMMAND = "node --test src/change.test.mjs";
const SOURCE_REPO = fileURLToPath(new URL("../../..", import.meta.url));
const cases = [];
function test(name, run) { cases.push({ id: `KCR${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
const git = (root, ...args) => {
  const result = spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
};
const bytes = (root, path) => readFileSync(join(root, path), "utf8");
function fixture({ design = true } = {}) {
  const root = mkdtempSync(join(nativeContractFixtureParent(), "k156-calibration-"));
  prepareApprovedItemCourseFixture({ root, initialPlanSurfacePath: "src/change.mjs" });
  const calibration = { ...JSON.parse(bytes(root, ".claude/pipeline.json")), verify: BASELINE };
  mkdirSync(join(root, "project"), { recursive: true });
  for (const path of ["project/pipeline.json", ".claude/pipeline.json"]) writeFileSync(join(root, path), `${JSON.stringify(calibration, null, 2)}\n`);
  git(root, "add", "--", "project/pipeline.json", ".claude/pipeline.json");
  git(root, "commit", "-q", "--no-verify", "-m", "baseline calibration fixture");
  cpSync(join(SOURCE_REPO,"architecture"),join(root,"architecture"),{recursive:true});
  cpSync(join(SOURCE_REPO,"AGENTS.md"),join(root,"AGENTS.md"));
  const adoption={rootDir:root,decision:"deferred",scope:["specs/","architecture/map/"],
    rationale:"Contained fixture physical architecture deferral",decidedAt:"2026-10-24T12:00:00.000Z",reviewDate:"2099-01-01",decisionRef:"TEST-K156"};
  const request=prepareAdoptionAuthority(adoption);
  applyAdoptionDecision({...adoption,approvalRequest:request,chatApproval:{mode:"chat-attributed-unattested",
    by:"Synthetic fixture PO",decisionRef:"TEST-K156",intentSha256:request.intent.sha256}});
  const readiness=inspectArchitectureEntryReadiness({rootDir:root,taskScope:"specs/unit/prd_unit.md"});
  assert.equal(readiness.status,"ready",readiness.code);
  const statePath = join(root, ".claude/pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (design) {
    state.activeFeature.phase = "design";
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  }
  return root;
}

test("caller readiness injection cannot mint a calibration Source State witness", () => {
  const root = fixture();
  const before = [".claude/pipeline-state.json", "project/pipeline.json", ".claude/pipeline.json"].map(path => bytes(root,path));
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND],
    { dir: root, architectureEntryReadiness: () => ({ status: "ready" }) }), 2);
  assert.deepEqual([".claude/pipeline-state.json", "project/pipeline.json", ".claude/pipeline.json"].map(path => bytes(root,path)), before);
});

test("a serialized old non-phase ready record remains admissible", () => {
  const root = fixture({ design: false });
  const paths = ["project/pipeline.json", ".claude/pipeline.json"];
  const approval = observeCurrentPlanApprovalForCalibration({ rootDir: root });
  assert.equal(approval.status, "eligible", JSON.stringify(approval));
  const gitText = (...args) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const sha = data => createHash("sha256").update(data).digest("hex");
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
  const entries = paths.map(path => {
    const before = readFileSync(join(root,path));
    const after = Buffer.from(`${JSON.stringify({ ...JSON.parse(before.toString("utf8")), verify: COMMAND }, null, 2)}\n`);
    const match = /^(100644|100755) blob ([a-f0-9]+)\t/u.exec(gitText("ls-tree", "HEAD", "--", path));
    assert.ok(match, `committed ${path}`);
    return { path, beforeSha256:sha(before), beforeBlob:match[2], gitMode:match[1], afterSha256:sha(after), afterSize:after.length };
  });
  const commonDir = resolve(root,gitText("rev-parse", "--git-common-dir"));
  const originalFacts = { rootDir:root, commonDir, head:gitText("rev-parse", "HEAD"), tree:gitText("rev-parse", "HEAD^{tree}"),
    approval, verifyCommand:COMMAND, entries };
  const facts = { ...originalFacts, id:sha(canonical(originalFacts)) };
  assert.equal(Object.hasOwn(facts,"statePostSha256"), false, "old serialized facts omit the field");
  const journalDir = join(commonDir,"agent-pipeline/calibration-verify-commit");
  mkdirSync(journalDir,{recursive:true,mode:0o700});
  writeFileSync(join(journalDir,`${facts.id}.ready.json`),`${JSON.stringify({schema:"pipeline.calibration-verify-commit-transition.v1",phase:"ready",facts},null,2)}\n`,{mode:0o600});
  for(const path of paths) writeFileSync(join(root,path),`${JSON.stringify({...JSON.parse(bytes(root,path)),verify:COMMAND},null,2)}\n`);
  git(root,"add","--",...paths);
  assert.equal(inspectCurrentCalibrationVerifyReady({rootDir:root,verifyCommand:COMMAND}).code,"CVCT-COMMIT-READY");
  assert.equal(inspectCalibrationVerifyCommitTransition({rootDir:root,stagedPaths:paths}).code,"CVCT-COMMIT-READY");
});

test("set-phase produces a sanctioned commit-ready verify transition", () => {
  const root = fixture();
  const paths = ["project/pipeline.json", ".claude/pipeline.json"];
  const before = paths.map(path => bytes(root, path));
  assert.equal(run(["inspect"], { dir: root }), 0);
  assert.deepEqual(paths.map(path => bytes(root, path)), before, "inspect must not mutate calibration");
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 0);
  for (const path of paths) assert.equal(JSON.parse(bytes(root, path)).verify, COMMAND);
  git(root, "add", "--", ...paths);
  assert.deepEqual(inspectCalibrationVerifyCommitTransition({ rootDir: root, stagedPaths: paths }), { ok: true, code: "CVCT-COMMIT-READY", paths });
  git(root, "commit", "-q", "--no-verify", "-m", "configured calibration fixture", "--", ...paths);
  const configured = paths.map(path => bytes(root, path));
  const restarted = spawnSync(process.execPath, [fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url)), "configure-verify", "--verify-command", COMMAND], { cwd: root, encoding: "utf8" });
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(paths.map(path => bytes(root, path)), configured, "restart replay is zero-write");
  const statePath = join(root, ".claude/pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.activeFeature.phase = "design";
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 0);
  assert.deepEqual(paths.map(path => bytes(root, path)), configured, "same configured command remains a zero-write calibration replay");
});

test("set-phase refuses uncommitted calibration before State mutation", () => {
  const root = fixture();
  writeFileSync(join(root, "project/pipeline.json"), bytes(root, "project/pipeline.json") + " ");
  const beforeState = bytes(root, ".claude/pipeline-state.json");
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 2);
  assert.equal(bytes(root, ".claude/pipeline-state.json"), beforeState);
});

test("set-phase refuses lost approval without modifying calibration", () => {
  const root = fixture();
  const statePath = join(root, ".claude/pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  delete state.planApproval;
  state.planApproved = false;
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const before = ["project/pipeline.json", ".claude/pipeline.json"].map(path => bytes(root, path));
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 2);
  assert.deepEqual(["project/pipeline.json", ".claude/pipeline.json"].map(path => bytes(root, path)), before);
});

test("partial calibration I/O reports incomplete recovery without claiming success", () => {
  const root = fixture();
  const neutralPath = join(root, "project/pipeline.json");
  const legacyPath = join(root, ".claude/pipeline.json");
  const beforeNeutral = readFileSync(neutralPath, "utf8");
  const beforeLegacy = readFileSync(legacyPath, "utf8");
  const beforeState = bytes(root, ".claude/pipeline-state.json");
  const original = fs.writeFileSync;
  let injected = false;
  fs.writeFileSync = function(path, data, ...options) {
    if (String(path) === neutralPath) {
      injected = true;
      original.call(this, path, String(data).slice(0, 12), ...options);
      const error = new Error("inert partial write"); error.code = "ENOSPC"; throw error;
    }
    return original.call(this, path, data, ...options);
  };
  syncBuiltinESMExports();
  const lines = [];
  const error = console.error;
  console.error = (...parts) => lines.push(parts.join(" "));
  let result;
  try {
    result = run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root });
  } finally {
    console.error = error;
    fs.writeFileSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(injected, true);
  assert.equal(result, 2);
  assert.equal(bytes(root, ".claude/pipeline-state.json"), beforeState, "failed companion leaves State byte-identical");
  assert.equal(readFileSync(legacyPath, "utf8"), beforeLegacy);
  assert.match(lines.join(" "), /companion mutation may have occurred|possible calibration mutation/u);
  assert.match(lines.join(" "), /No configured commit is claimed/u);
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 2,
    "a dirty partial calibration is never accepted as the baseline");
  writeFileSync(neutralPath, beforeNeutral);
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 0,
    "the exact restored committed baseline can retry after the failed preparation");
  const paths = ["project/pipeline.json", ".claude/pipeline.json"];
  git(root, "add", "--", ...paths);
  assert.equal(inspectCalibrationVerifyCommitTransition({ rootDir: root, stagedPaths: paths }).code, "CVCT-COMMIT-READY");
});

test("State replacement failure rolls back the exact configured companions", () => {
  const root = fixture();
  const statePath = join(root, ".claude/pipeline-state.json");
  const paths = ["project/pipeline.json", ".claude/pipeline.json"];
  const before = paths.map(path => bytes(root, path));
  const beforeState = bytes(root, ".claude/pipeline-state.json");
  const original = fs.renameSync;
  let injected = false;
  fs.renameSync = function(from, to) {
    if (String(to) === statePath) {
      injected = true;
      assert.equal(JSON.parse(bytes(root, paths[0])).verify, COMMAND, "companion was published first");
      const error = new Error("inert State I/O fault"); error.code = "ENOSPC"; throw error;
    }
    return original.call(this, from, to);
  };
  syncBuiltinESMExports();
  try {
    assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 2);
  } finally { fs.renameSync = original; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(bytes(root, ".claude/pipeline-state.json"), beforeState);
  assert.deepEqual(paths.map(path => bytes(root, path)), before, "both companions rolled back");
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", COMMAND], { dir: root }), 0);
});

test("dead post-State owner recovers through a fresh current Source command", () => {
  const root = fixture();
  const statePath = join(root, ".claude/pipeline-state.json");
  const modulePath = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from "node:fs";
    import {syncBuiltinESMExports} from "node:module";
    import {run} from ${JSON.stringify(modulePath)};
    const rename = fs.renameSync;
    fs.renameSync = (from,to) => { rename(from,to); if (String(to) === ${JSON.stringify(statePath)}) process.exit(77); };
    syncBuiltinESMExports();
    run(["set-phase","--phase","implementation","--verify-command",${JSON.stringify(COMMAND)}],
      {dir:${JSON.stringify(root)}});
  `], { cwd: root, encoding: "utf8" });
  assert.equal(child.status, 77, child.stderr);
  const paths = ["project/pipeline.json", ".claude/pipeline.json"];
  assert.equal(inspectCalibrationVerifyCommitTransition({ rootDir: root, stagedPaths: paths }).ok, false);
  const stateBytes = readFileSync(statePath);
  const lockPath = `${statePath}.lock`;
  const deadLock = readFileSync(lockPath);
  const liveLock = { ...JSON.parse(deadLock.toString("utf8")), ownerPid: process.pid };
  writeFileSync(lockPath, `${JSON.stringify(liveLock)}\n`, { mode: 0o600 });
  assert.equal(spawnSync(process.execPath, [modulePath, "set-phase", "--phase", "implementation", "--verify-command", COMMAND], { cwd: root }).status, 2,
    "a live State lock owner is retained");
  const unknownLock = { ...liveLock };
  delete unknownLock.ownerPid;
  writeFileSync(lockPath, `${JSON.stringify(unknownLock)}\n`, { mode: 0o600 });
  assert.equal(spawnSync(process.execPath, [modulePath, "set-phase", "--phase", "implementation", "--verify-command", COMMAND], { cwd: root }).status, 2,
    "unknown State lock ownership is retained");
  assert.deepEqual(readFileSync(statePath), stateBytes);
  writeFileSync(lockPath, deadLock, { mode: 0o600 });
  const recovered = spawnSync(process.execPath, [modulePath, "set-phase", "--phase", "implementation", "--verify-command", COMMAND], { cwd: root, encoding: "utf8" });
  assert.equal(recovered.status, 0, recovered.stderr);
  git(root, "add", "--", ...paths);
  assert.equal(inspectCalibrationVerifyCommitTransition({ rootDir: root, stagedPaths: paths }).code, "CVCT-COMMIT-READY");
});

test("fresh pre-State retry ignores forged journal and refuses stale or dirty Source inputs", () => {
  const root = fixture();
  const modulePath = fileURLToPath(new URL("../lib/calibration-verify-commit-transition.mjs", import.meta.url));
  const forged = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import {prepareCalibrationVerifyCommitTransition} from ${JSON.stringify(modulePath)};
    const result = prepareCalibrationVerifyCommitTransition({rootDir:${JSON.stringify(root)},verifyCommand:${JSON.stringify(COMMAND)},phaseEntry:true,statePostSha256:"a".repeat(64)});
    process.exit(result.ok ? 77 : 0);
  `], { cwd: root, encoding: "utf8" });
  assert.equal(forged.status, 0, "a direct caller hash cannot mint a preparation");
  const cli = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
  const neutralPath = join(root, "project/pipeline.json");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from "node:fs";
    import {syncBuiltinESMExports} from "node:module";
    import {run} from ${JSON.stringify(cli)};
    const write = fs.writeFileSync;
    fs.writeFileSync = (path,data,...opts) => { write(path,data,...opts); if(String(path) === ${JSON.stringify(neutralPath)}) process.exit(77); };
    syncBuiltinESMExports();
    run(["set-phase","--phase","implementation","--verify-command",${JSON.stringify(COMMAND)}],
      {dir:${JSON.stringify(root)}});
  `], { cwd: root, encoding: "utf8" });
  assert.equal(child.status, 77, child.stderr);
  const journalDir = join(root, ".git/agent-pipeline/calibration-verify-commit");
  const preparedPath = join(journalDir, readdirSync(journalDir).find(name => name.endsWith(".prepared.json")));
  const original = readFileSync(preparedPath);
  const altered = JSON.parse(original.toString("utf8"));
  altered.facts.verifyCommand = "node --test forged.test.mjs";
  altered.facts.statePostSha256 = "f".repeat(64);
  writeFileSync(preparedPath, `${JSON.stringify(altered, null, 2)}\n`, { mode: 0o600 });
  assert.equal(spawnSync(process.execPath, [cli, "recover-verify-transition"], { cwd: root }).status, 2, "unshipped journal route remains unavailable");
  const retry = (command = COMMAND) => run(["set-phase", "--phase", "implementation", "--verify-command", command],
    { dir: root });
  const statePath = join(root, ".claude/pipeline-state.json");
  const statePreimage = readFileSync(statePath);
  const staleState = JSON.parse(statePreimage.toString("utf8"));
  staleState.planApproved = false;
  writeFileSync(statePath, `${JSON.stringify(staleState, null, 2)}\n`, { mode: 0o600 });
  assert.equal(retry(), 2, "stale approval is refused by current Source");
  writeFileSync(statePath, statePreimage, { mode: 0o600 });
  const neutral = join(root, "project/pipeline.json");
  const preimage = readFileSync(neutral);
  writeFileSync(neutral, Buffer.from("dirty-untrusted-calibration"));
  assert.equal(retry(), 2, "dirty calibration is refused");
  writeFileSync(neutral, preimage);
  assert.equal(retry("node --test other.test.mjs"), 2, "a different command cannot adopt the interrupted command's bytes");
  assert.deepEqual(readFileSync(statePath), statePreimage, "refusals preserve the exact State bytes");
  assert.equal(retry(), 0, "current same-command Source recomputes the postimage without trusting the journal");
  git(root, "add", "--", "project/pipeline.json", ".claude/pipeline.json");
  assert.equal(inspectCalibrationVerifyCommitTransition({ rootDir: root, stagedPaths: ["project/pipeline.json", ".claude/pipeline.json"] }).code, "CVCT-COMMIT-READY");
});

test("configure-verify retries exact current output after twin and ready crashes", () => {
  const cli = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
  const paths = ["project/pipeline.json", ".claude/pipeline.json"];
  for (const stop of ["first-twin", "ready-published"]) {
    const root = fixture();
    assert.equal(run(["set-phase", "--phase", "implementation"], { dir: root }), 0);
    const stateBefore = readFileSync(join(root, ".claude/pipeline-state.json"));
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs";
      import {syncBuiltinESMExports} from "node:module";
      import {run} from ${JSON.stringify(cli)};
      const write=fs.writeFileSync, unlink=fs.unlinkSync;
      fs.writeFileSync=(path,data,...opts)=>{ write(path,data,...opts); if(${JSON.stringify(stop)}==="first-twin" && String(path)===${JSON.stringify(join(root,paths[0]))}) process.exit(77); };
      fs.unlinkSync=(path)=>{ unlink(path); if(${JSON.stringify(stop)}==="ready-published" && String(path).includes(".ready.json.")) process.exit(77); };
      syncBuiltinESMExports();
      run(["configure-verify","--verify-command",${JSON.stringify(COMMAND)}],{dir:${JSON.stringify(root)}});
    `], { cwd: root, encoding: "utf8" });
    assert.equal(child.status, 77, `${stop}: ${child.stderr}`);
    assert.deepEqual(readFileSync(join(root, ".claude/pipeline-state.json")), stateBefore, "configure never writes State");
    const wrong = spawnSync(process.execPath, [cli, "configure-verify", "--verify-command", "node --test other.test.mjs"], { cwd: root, encoding: "utf8" });
    assert.equal(wrong.status, 2, `${stop}: different command must be refused`);
    const recovered = spawnSync(process.execPath, [cli, "configure-verify", "--verify-command", COMMAND], { cwd: root, encoding: "utf8" });
    assert.equal(recovered.status, 0, `${stop}: ${recovered.stderr}`);
    assert.deepEqual(readFileSync(join(root, ".claude/pipeline-state.json")), stateBefore);
    for (const path of paths) assert.equal(JSON.parse(bytes(root,path)).verify, COMMAND);
    git(root, "add", "--", ...paths);
    assert.equal(inspectCalibrationVerifyCommitTransition({ rootDir: root, stagedPaths: paths }).code, "CVCT-COMMIT-READY");
    const replay = spawnSync(process.execPath, [cli, "configure-verify", "--verify-command", COMMAND], { cwd: root, encoding: "utf8" });
    assert.equal(replay.status, 0, replay.stderr);
  }
});

test("live Source serialization refuses concurrent same and different commands", async () => {
  const root = fixture();
  assert.equal(run(["set-phase", "--phase", "implementation"], { dir: root }), 0);
  const cli = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import fs from "node:fs";
    import {syncBuiltinESMExports} from "node:module";
    import {run} from ${JSON.stringify(cli)};
    const write=fs.writeFileSync;
    fs.writeFileSync=(path,data,...opts)=>{ write(path,data,...opts); if(String(path)===${JSON.stringify(join(root,"project/pipeline.json"))}) { process.stdout.write("HELD\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,12000); } };
    syncBuiltinESMExports();
    process.exitCode=run(["configure-verify","--verify-command",${JSON.stringify(COMMAND)}],{dir:${JSON.stringify(root)}});
  `], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const marker = await new Promise((resolve, reject) => {
    child.stdout.on("data", data => { if (String(data).includes("HELD")) resolve(true); });
    child.once("close", code => reject(new Error(`writer exited before holding the boundary: ${code}`)));
  });
  assert.equal(marker, true);
  const same = spawnSync(process.execPath, [cli,"configure-verify","--verify-command",COMMAND], { cwd: root, encoding: "utf8" });
  const different = spawnSync(process.execPath, [cli,"configure-verify","--verify-command","node --test other.test.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(same.status, 2, `concurrent same command: ${same.stderr}`);
  assert.equal(different.status, 2, `concurrent different command: ${different.stderr}`);
  const completed = await new Promise(resolve => child.once("close", resolve));
  assert.equal(completed, 0, "first Source command completes after the hold");
  assert.equal(spawnSync(process.execPath, [cli,"configure-verify","--verify-command",COMMAND], { cwd: root, encoding: "utf8" }).status, 0);
});

if (cases.length !== 11) throw new Error("calibration recovery case count drift");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
