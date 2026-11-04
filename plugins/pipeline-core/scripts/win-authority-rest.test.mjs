// SPDX-License-Identifier: SUL-1.0
// Candidate 19c, w172 (AC-108, the Windows native runs Q10 PowerShell half, W3, W6, E4): the failed path rides in the PowerShell
// failure envelope, the security readiness probes retry once on EPERM, the public handover update keeps the Current state
// section consistent with the Next action it updates and carries a date, the slicing hint appears only where parallel dispatch
// is supported, and a second concurrent Goldfish launch is not refused merely because the first is running.
// Every platform-dependent decision takes an injected platform, probe, spawn or sleep, so this runs on any machine.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as backend from "../lib/windows-owned-authority-backend.mjs";
import * as readiness from "../lib/windows-authority-readiness.mjs";
import * as slicing from "../hooks/native-slicing.mjs";
import * as preflight from "./pipeline-start-preflight.mjs";
import { run as runState } from "./pipeline-state.mjs";
import { probeGitleaks } from "./security-readiness/gitleaks-readiness.mjs";
import { probeOsvScanner } from "./security-readiness/osv-scanner-readiness.mjs";
import { probeSemgrep } from "./security-readiness/semgrep-readiness.mjs";

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const REPO = here("../../..");
const FACTS = `1:1:1:1:1:directory:1:1:directory:${"a".repeat(64)}`;
const SCHEMA = "pipeline.windows-authority-readiness.v1";
const roots = { projectRoot: "C:\\proj", pluginRoot: "C:\\plug", privateRoot: "C:\\proj\\.git\\agent-pipeline" };

// --- Q10 (PowerShell half): the failed path is an optional, bounded key of the failure envelope -----------------------------------

function withSeam(body, run) {
  backend.setWindowsOwnedAuthorityBackendTestSeam({ platform: "win32", spawn: () => ({ status: 1, signal: null, stderr: "", stdout: JSON.stringify(body) }) });
  backend.resetWindowsOwnedAuthorityBackendMemo();
  try { return run(); }
  finally { backend.setWindowsOwnedAuthorityBackendTestSeam(undefined); backend.resetWindowsOwnedAuthorityBackendMemo(); }
}
const inspectAt = (path) => () => backend.inspectWindowsOwnedAuthorityPath({ path, directory: true });

test("Q10 ps1: a failure envelope that carries the failed path surfaces it on the error", () => {
  const path = join(tmpdir(), "proj-evidence");
  withSeam({ ok: false, code: "WIN-AUTH-OPEN", committed: false, path }, () => {
    assert.throws(inspectAt(path), (error) => {
      assert.equal(error.reason, "WIN-AUTH-OPEN");
      assert.equal(error.failedPath, path);
      return true;
    });
    assert.equal(backend.lastWindowsAuthorityFailedPath(), path, "the same process can read the path back for the refusal text");
  });
});

test("Q10 ps1: the old three-key envelope is still accepted and carries no path", () => {
  const path = join(tmpdir(), "proj-evidence");
  withSeam({ ok: false, code: "WIN-AUTH-OPEN", committed: false }, () => {
    assert.throws(inspectAt(path), (error) => {
      assert.equal(error.reason, "WIN-AUTH-OPEN");
      assert.equal(error.failedPath, undefined);
      return true;
    });
    assert.equal(backend.lastWindowsAuthorityFailedPath(), null);
  });
});

test("Q10 ps1: an envelope with an unknown key, a non-string path, a control character or an oversized path is refused as bad output", () => {
  const path = join(tmpdir(), "proj-evidence");
  for (const body of [
    { ok: false, code: "WIN-AUTH-OPEN", committed: false, path, extra: 1 },
    { ok: false, code: "WIN-AUTH-OPEN", committed: false, path: 7 },
    { ok: false, code: "WIN-AUTH-OPEN", committed: false, path: `${path}\u0007` },
    { ok: false, code: "WIN-AUTH-OPEN", committed: false, path: "x".repeat(40000) },
  ]) {
    withSeam(body, () => assert.throws(inspectAt(path), (error) => error.reason === "WIN-AUTH-NATIVE-OUTPUT" && error.failedPath === undefined, JSON.stringify(body).slice(0, 80)));
  }
});

test("Q10 ps1: the pinned helper digest still matches the helper bytes and the helper emits the path key on failure", () => {
  const helperPath = here("../lib/windows-owned-authority-native.ps1");
  const bytes = readFileSync(helperPath);
  const pinned = /const HELPER_SHA256='([a-f0-9]{64})'/u.exec(readFileSync(here("../lib/windows-owned-authority-backend.mjs"), "utf8"))?.[1];
  assert.equal(pinned, createHash("sha256").update(bytes).digest("hex"), "re-pinned after the helper change");
  assert.ok(!bytes.includes(0x0d), "the helper keeps LF line endings (the digest is of the LF bytes)");
  assert.ok(/ok=\$false;code=\$code;committed=[^\n]*path/u.test(bytes.toString("utf8")), "the failure envelope names a path key");
});

test("Q10 ps1: the refusal text prints the path from the envelope when present and from the readiness probe otherwise", () => {
  const probe = () => ({ schema: SCHEMA, status: "unavailable", causes: [{ pathClass: "project", reason: "WIN-AUTH-OPEN", path: "C:\\proj\\from-probe" }] });
  const none = () => ({ schema: SCHEMA, status: "unavailable", causes: [] });
  const fromEnvelope = readiness.describeWindowsAuthorityRefusal({ reason: "WIN-AUTH-OPEN", platform: "win32", ...roots, assess: none, failedPath: "C:\\proj\\from-envelope" });
  assert.match(fromEnvelope, /C:\\proj\\from-envelope/u);
  assert.match(fromEnvelope, /icacls "C:\\proj\\from-envelope" \/grant /u);
  const preferred = readiness.describeWindowsAuthorityRefusal({ reason: "WIN-AUTH-OPEN", platform: "win32", ...roots, assess: probe, failedPath: "C:\\proj\\from-envelope" });
  assert.match(preferred, /from-envelope/u);
  assert.doesNotMatch(preferred, /from-probe/u, "the envelope path is the one the native open actually failed on");
  const fromProbe = readiness.describeWindowsAuthorityRefusal({ reason: "WIN-AUTH-OPEN", platform: "win32", ...roots, assess: probe });
  assert.match(fromProbe, /from-probe/u);
  const unsafe = readiness.describeWindowsAuthorityRefusal({ reason: "WIN-AUTH-OPEN", platform: "win32", ...roots, assess: none, failedPath: 'C:\\a" & echo x' });
  assert.doesNotMatch(unsafe, /echo x/u, "a path that could break out of the quoted command is never printed as a command");
});

test("Q10 ps1: the dispatch guard hands the envelope path to the shared description", () => {
  assert.ok(/lastWindowsAuthorityFailedPath/u.test(readFileSync(here("../hooks/guard-dispatch.mjs"), "utf8")), "guard-dispatch reads the envelope path");
});

// --- W3: the readiness probes retry once on EPERM before they report the tool as not ready --------------------------------------

function sequenceSpawn(outcomes) {
  const calls = [];
  const spawnFn = (_exe, args) => {
    calls.push(args.join(" "));
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    return outcome === "EPERM" ? { error: Object.assign(new Error("spawnSync EPERM"), { code: "EPERM" }), status: null, stdout: "", stderr: "" }
      : { status: 0, stdout: "8.18.0 --source --report-format --report-path --no-banner --exit-code --format --recursive --json --config", stderr: "" };
  };
  return { calls, spawnFn };
}
const probes = [
  ["gitleaks", (deps, dir) => probeGitleaks({ executablePath: process.execPath, rootDir: dir, tempDir: dir }, deps)],
  ["osv-scanner", (deps, dir) => probeOsvScanner({ executablePath: process.execPath, rootDir: dir, tempDir: dir }, deps)],
  ["semgrep", (deps, dir) => probeSemgrep({ executablePath: process.execPath, rootDir: dir, tempDir: dir }, deps)],
];
for (const [name, probe] of probes) {
  test(`W3: the ${name} readiness probe retries once on EPERM and passes when the retry succeeds`, () => {
    const dir = mkdtempSync(join(tmpdir(), "win-rest-probe-"));
    try {
      const { calls, spawnFn } = sequenceSpawn(["EPERM", "ok"]);
      let slept = 0;
      const result = probe({ spawnFn, sleepFn: () => { slept += 1; } }, dir);
      assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
      assert.equal(result.status, "ready");
      assert.equal(slept, 1, "one injected pause before the one retry");
      assert.equal(calls[0], calls[1], "the retry repeats the same probe command");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test(`W3: the ${name} readiness probe retries only once; a second EPERM is reported, never retried again`, () => {
    const dir = mkdtempSync(join(tmpdir(), "win-rest-probe-"));
    try {
      const { calls, spawnFn } = sequenceSpawn(["EPERM"]);
      const result = probe({ spawnFn, sleepFn: () => {} }, dir);
      assert.equal(result.ok, false);
      assert.equal(result.status, "execution_environment");
      assert.equal(calls.length, 2, "exactly one first attempt and one retry");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

// --- W6: update-public-handover keeps Current state consistent with Next action and carries a date --------------------------------

const handoverState = (phase) => ({ schema: "pipeline.state.v0", activeFeature: { id: "demo", planPath: "specs/demo/plan.md", phase }, planApproved: false });
function handoverFixture(markdown, state, body) {
  mkdirSync(join(REPO, "scratch"), { recursive: true });
  const root = mkdtempSync(join(REPO, "scratch", "win-rest-handover-"));
  try {
    mkdirSync(join(root, "docs")); mkdirSync(join(root, "project"));
    writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify(state));
    writeFileSync(join(root, "project", "pipeline.json"), JSON.stringify({ project: "demo", handover: "docs/state.md", verify: "node verify.mjs" }));
    writeFileSync(join(root, "docs", "state.md"), markdown);
    return body(root, join(root, "docs", "state.md"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function updateHandover(root) {
  const original = console.log;
  let payload = null;
  try { console.log = (text) => { payload = JSON.parse(text); }; const code = runState(["update-public-handover"], { dir: root, now: () => "2026-11-04T10:00:00.000Z" }); return { code, payload }; }
  finally { console.log = original; }
}
const OLD = "# Project state\n\n## Goal\n\nG.\n\n## Current state\n\nFeature `demo` is active in design.\nInitial PRD: `specs/demo/prd.md`.\n\n## Next action\n\nOld text.\n\n## Decisions\n\nKeep.\n";

test("W6: the update writes the phase and a date into Current state and rewrites the generated phase sentence", () => handoverFixture(OLD, handoverState("implementation"), (root, path) => {
  const result = updateHandover(root);
  assert.equal(result.code, 0);
  const text = readFileSync(path, "utf8");
  const current = text.slice(text.indexOf("## Current state"), text.indexOf("## Next action"));
  assert.match(current, /\*\*Last updated:\*\* 2026-11-04/u, "a date field the bootstrap line can print");
  assert.match(current, /\*\*Lifecycle phase:\*\* feature `demo` · phase `implementation`/u);
  assert.match(current, /Feature `demo` is active in implementation\./u);
  assert.doesNotMatch(current, /active in design/u);
  assert.ok(text.includes("Initial PRD: `specs/demo/prd.md`."), "other Current state prose stays");
  assert.ok(text.includes("## Goal\n\nG.\n"), "sections outside Current state and Next action stay");
  assert.ok(text.endsWith("## Decisions\n\nKeep.\n"));
  assert.equal(result.payload.currentState, "updated");
}));

test("W6: a second update on the same day changes nothing, and a phase change rewrites only the managed lines", () => handoverFixture(OLD, handoverState("design"), (root, path) => {
  updateHandover(root);
  const first = readFileSync(path, "utf8");
  assert.equal(updateHandover(root).payload.currentState, "current");
  assert.equal(readFileSync(path, "utf8"), first);
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify(handoverState("implementation")));
  updateHandover(root);
  const second = readFileSync(path, "utf8");
  assert.equal(second.split("**Lifecycle phase:**").length - 1, 2, "one marker in Current state, one in Next action, no duplicates");
  assert.equal(second.split("**Last updated:**").length - 1, 1);
  assert.match(second, /active in implementation/u);
}));

test("W6: a handover with no Current state section is updated exactly as before", () => handoverFixture("# State\n\n## Next action\n\nOld.\n", handoverState("design"), (root, path) => {
  const result = updateHandover(root);
  assert.equal(result.code, 0);
  assert.equal(result.payload.currentState, "absent");
  assert.doesNotMatch(readFileSync(path, "utf8"), /Last updated/u);
}));

test("W6: the bootstrap facts read the date the update wrote", () => handoverFixture(OLD, handoverState("design"), (root) => {
  updateHandover(root);
  const facts = preflight.observeBootstrapFacts({ rootDir: root });
  assert.equal(facts.calibration.handoverDate, "2026-11-04");
}));

// --- E4: the slicing hint appears only where parallel dispatch is supported ---------------------------------------------------------

const planInput = { cwd: REPO, session_id: "win-rest", tool_name: "update_plan", tool_input: { plan: [{ status: "pending", step: "a" }, { status: "pending", step: "b" }, { status: "pending", step: "c" }] } };
const slicingDeps = (platform) => ({ platform, resolveGitCommonDirFn: () => "/fixture/.git", existsSyncFn: () => false, mkdirSyncFn: () => {}, writeFileSyncFn: () => {} });

test("E4: where parallel dispatch is supported the hint offers it; on Windows it states the sequential rule instead", () => {
  const linux = slicing.observeCodexSlicing(planInput, "PreToolUse", slicingDeps("linux"));
  assert.equal(linux.due, true);
  assert.match(linux.output, /Slicing default:.*parallel/su);
  const windows = slicing.observeCodexSlicing({ ...planInput, session_id: "win-rest-2" }, "PreToolUse", slicingDeps("win32"));
  assert.equal(windows.due, true);
  assert.match(windows.output, /Slicing default:/u);
  assert.match(windows.output, /one (?:Goldfish )?(?:launch|dispatch) at a time/iu, "the sequential rule");
  assert.doesNotMatch(windows.output, /consider native parallel subagent dispatch/u);
  assert.equal(typeof slicing.slicingNudge, "function");
  assert.equal(slicing.slicingNudge("linux"), slicing.SLICING_NUDGE);
});

// --- E4: a second concurrent launch is not refused merely because the first is running -----------------------------------------

const WAIT = "node plugin/scripts/session-authority-repair.mjs wait --root C:\\proj --timeout 120";
const open = () => ({ ok: false, code: "SDC-AUTHORITY-UNAVAILABLE", reason: "WIN-AUTH-OPEN" });
const folderFine = () => ({ schema: SCHEMA, status: "ready", causes: [] });
const folderBroken = () => ({ schema: SCHEMA, status: "unavailable", causes: [{ pathClass: "project", reason: "WIN-AUTH-OPEN", path: "C:\\proj\\evidence" }] });

test("E4: a WIN-AUTH-OPEN refusal on Windows with every folder readable is contention; the launch preparation retries and then succeeds", () => {
  assert.equal(typeof readiness.prepareWithWindowsContentionRetry, "function");
  let calls = 0, slept = 0;
  const result = readiness.prepareWithWindowsContentionRetry({ prepare: () => (++calls < 3 ? open() : { ok: true }), platform: "win32", ...roots, assess: folderFine, sleep: () => { slept += 1; }, waitCommand: WAIT });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.equal(slept, 2);
});

test("E4: persistent contention fails with the sequential rule and the one command that waits for the first launch", () => {
  let calls = 0;
  const result = readiness.prepareWithWindowsContentionRetry({ prepare: () => { calls += 1; return open(); }, platform: "win32", ...roots, assess: folderFine, sleep: () => {}, waitCommand: WAIT, attempts: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "WIN-AUTH-OPEN");
  assert.equal(calls, 3, "bounded");
  assert.equal(result.contention, true, "the guard prints this repair instead of the folder repair");
  assert.match(result.repair, /one Goldfish launch at a time/iu);
  assert.ok(result.repair.includes(WAIT), "names the wait command");
  assert.doesNotMatch(result.repair, /icacls/u, "contention is not a folder fault, so no permission change is offered");
});

test("E4: a folder that really cannot be opened, another platform or another reason is never retried", () => {
  for (const [platform, assess, prepare] of [["win32", folderBroken, open], ["linux", folderFine, open], ["win32", folderFine, () => ({ ok: false, code: "SDC-AUTHORITY-UNAVAILABLE", reason: "WIN-AUTH-ACL" })]]) {
    let calls = 0;
    const result = readiness.prepareWithWindowsContentionRetry({ prepare: () => { calls += 1; return prepare(); }, platform, ...roots, assess, sleep: () => {}, waitCommand: WAIT });
    assert.equal(calls, 1, `${platform}/${prepare === open ? "open" : "other"}`);
    assert.equal(result.ok, false);
    assert.equal(result.repair, undefined);
  }
});

test("E4: the dispatch guard routes the native host preparation through the contention retry", () => {
  assert.ok(/prepareWithWindowsContentionRetry/u.test(readFileSync(here("../hooks/guard-dispatch.mjs"), "utf8")), "guard-dispatch uses the retry");
});
