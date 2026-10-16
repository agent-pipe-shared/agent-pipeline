// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.signing-toolchain-readiness (AC-262, ALF-C-P20-09).
 *
 * Original acceptance (backlog/items/2026-10-08-signing-toolchain-readiness.md, Description + Proposal):
 *   A1. The readiness report checks openssl (finding `signing-toolchain`), not only git/hooks.
 *   A2. Every non-ok finding carries a TYPED repair (kind + prerequisite/summary), per finding.
 *   A3. A missing openssl is NAMED ("openssl-not-on-path", the executable name "openssl") rather than the
 *       opaque "openssl failed; the human terminal must complete the local prompt".
 *   A4. The probe runs BEFORE any lookup/prompt/key access in `sign-intent` (the 2026-10-08 recurrence: ~10 min
 *       of disclosure lookups, then an unexplained failure).
 *   A5. The probe distinguishes "not resolvable" from "resolvable but unable to do Ed25519", each with its own
 *       typed repair, and never selects an executable from a repository or the working directory.
 *
 * Everything runs through the real module (po-human-approval.mjs, toolchain-preflight.mjs). The only injected
 * behaviour is the modules' documented `dependencies.spawn` / `homedirFn` / `tmpdirFn` seams, plus the real PATH.
 *
 * Host fixture note: repository-shaped fixtures live under the repository's scratch/. The probe's own contract
 * requires its home, temporary directory and the PO key directory to lie OUTSIDE every Git repository
 * (outsideEveryRepository), which scratch/ is not; those three therefore use a mkdtemp directory in the OS
 * temporary location and are removed after each case. Nothing here needs directory mode bits or symlinks.
 */
import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..", "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
const approval = await import(pathToFileURL(join(PLUGIN_ROOT, "scripts", "po-human-approval.mjs")).href);
const preflight = await import(pathToFileURL(join(PLUGIN_ROOT, "scripts", "toolchain-preflight.mjs")).href);
const { probeSigningReadiness, resolveOpensslExecutable, runHumanApproval } = approval;
const WIN = process.platform === "win32";

// PO decision K7: typed host limitation for cases that need Linux/WSL facts.
const HOST_LIMITATION = Object.freeze({
  kind: "host-limitation", host: "native-windows", owner: "Coordinator", due: "2026-10-19",
  reason: "needs POSIX executable mode bits / a real spawn of a decoy; to be run in the Linux/WSL pass",
});
const hostSkip = (what) => `${HOST_LIMITATION.kind}: ${what} ${HOST_LIMITATION.reason} (owner ${HOST_LIMITATION.owner}, due ${HOST_LIMITATION.due})`;

const cleanups = [];
test.after(() => { for (const fn of cleanups.reverse()) { try { fn(); } catch { /* best effort */ } } });

function outsideDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `stk-${label}-`));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function scratchDir(label) {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH, `signing-toolchain-pin-${label}-`));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function withPath(value, fn) {
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const had = Object.hasOwn(process.env, key); const previous = process.env[key];
  process.env[key] = value;
  try { return fn(); } finally { if (had) process.env[key] = previous; else delete process.env[key]; }
}
async function withPathAsync(value, fn) {
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const had = Object.hasOwn(process.env, key); const previous = process.env[key];
  process.env[key] = value;
  try { return await fn(); } finally { if (had) process.env[key] = previous; else delete process.env[key]; }
}

/** A stand-in openssl behind the documented `dependencies.spawn` seam; Ed25519 round trip is real node:crypto. */
function stubSpawn(mode = "healthy") {
  const calls = [];
  const spawn = (executable, args = [], options = {}) => {
    const a = args.map(String);
    calls.push({ executable, args: a, options, touchesKey: a.some((entry) => /po-private\.pem/u.test(entry)) });
    const flag = (name) => { const index = a.indexOf(name); return index >= 0 ? a[index + 1] : undefined; };
    const isSign = a[0] === "pkeyutl" && a.includes("-sign");
    const isVerify = a[0] === "pkeyutl" && a.includes("-verify");
    if (mode === "not-on-path") return { status: null, error: Object.assign(new Error("spawn openssl ENOENT"), { code: "ENOENT" }) };
    if (mode === "version-fails" && a[0] === "version") return { status: 3, stdout: "", stderr: "openssl: broken install\n" };
    if (mode === "sign-fails" && isSign) return { status: 1, stdout: "", stderr: "pkeyutl: Unknown option: -rawin\n" };
    if (mode === "verify-fails" && isVerify) return { status: 1, stdout: "", stderr: "Signature Verification Failure\n" };
    try {
      if (isSign) { writeFileSync(flag("-out"), cryptoSign(null, readFileSync(flag("-in")), createPrivateKey(readFileSync(flag("-inkey"))))); return { status: 0, stdout: "", stderr: "" }; }
      if (isVerify) { const ok = cryptoVerify(null, readFileSync(flag("-in")), createPublicKey(readFileSync(flag("-inkey"))), readFileSync(flag("-sigfile"))); return { status: ok ? 0 : 1, stdout: "", stderr: "" }; }
    } catch (error) { return { status: 1, stdout: "", stderr: `stub: ${error?.code ?? "error"}\n` }; }
    return { status: 0, stdout: "OpenSSL 3.0.0 (pin stub)\n", stderr: "" };
  };
  return { spawn, calls };
}

const toolchain = (result) => result.findings.find((entry) => entry.findingId === "signing-toolchain");

/** Predicate that a failure NAMES the missing executable instead of the legacy opaque message. */
function namesMissingExecutable(message) {
  return /openssl-not-on-path/u.test(message) && /\bopenssl\b/u.test(message) && !/the human terminal must complete the local prompt/u.test(message);
}
function assertTypedRepair(finding, { prerequisite }) {
  assert.ok(finding.repair && typeof finding.repair === "object", "a non-ok finding must carry a typed repair object");
  assert.equal(finding.repair.kind, "attended-prerequisite");
  assert.equal(finding.repair.prerequisite, prerequisite);
  assert.equal(typeof finding.repair.summary, "string");
  assert.ok(finding.repair.summary.length > 20, "the repair must say what to do");
}

// ---------------------------------------------------------------- A3 negative control (cheap RED) --------
test("A3 control: the naming predicate rejects the legacy opaque failure and accepts the typed one", () => {
  const legacy = "openssl failed with exit code none (the process did not run to completion); the human terminal must complete the local prompt";
  assert.equal(namesMissingExecutable(legacy), false, "RED mirror: the pre-fix opaque message must NOT satisfy the acceptance");
  assert.equal(namesMissingExecutable("openssl failed; the human terminal must complete the local prompt"), false);
  assert.equal(namesMissingExecutable("SIGN-READINESS-FAILED: openssl-not-on-path: the name openssl is not found on the PATH of this terminal; repair: add a directory"), true);
});

// ---------------------------------------------------------------- A1/A2/A3: probe, injected spawn --------
test("A1-A3: a missing openssl is a typed, named `signing-toolchain` finding with an attended repair; no key path reaches any process", () => {
  const home = outsideDir("home"); const spy = stubSpawn("not-on-path");
  const result = probeSigningReadiness({ repository: scratchDir("probe-missing"), directory: "", dependencies: { spawn: spy.spawn, homedirFn: () => home, tmpdirFn: () => home } });
  const finding = toolchain(result);
  assert.equal(result.ok, false);
  assert.equal(result.mutation, false);
  assert.ok(finding, "the readiness probe must report a signing-toolchain finding");
  assert.equal(finding.status, "attended");
  assert.match(finding.cause, /^openssl-not-on-path: /u);
  assert.equal(namesMissingExecutable(finding.cause), true);
  assertTypedRepair(finding, { prerequisite: "openssl-on-path" });
  assert.match(finding.repair.summary, /PATH/u);
  assert.deepEqual(spy.calls.map((call) => call.args[0]), ["version"], "only the cheap version call is attempted once openssl cannot start");
  assert.equal(spy.calls.some((call) => call.touchesKey), false);
});

test("A5: an openssl that resolves but cannot do Ed25519 is a different typed class (openssl-no-ed25519) with its own repair", () => {
  for (const mode of ["version-fails", "sign-fails", "verify-fails"]) {
    const home = outsideDir("home"); const spy = stubSpawn(mode);
    const finding = toolchain(probeSigningReadiness({ repository: scratchDir("probe-noed"), directory: "", dependencies: { spawn: spy.spawn, homedirFn: () => home, tmpdirFn: () => home } }));
    assert.equal(finding.status, "attended", mode);
    assert.match(finding.cause, /^openssl-no-ed25519: /u, mode);
    assert.doesNotMatch(finding.cause, /openssl-not-on-path/u, mode);
    assertTypedRepair(finding, { prerequisite: "openssl-with-ed25519" });
  }
});

test("A1: a healthy openssl yields an ok signing-toolchain finding with no repair, and the throwaway probe directory is removed", () => {
  const home = outsideDir("home"); const spy = stubSpawn("healthy");
  const result = probeSigningReadiness({ repository: scratchDir("probe-ok"), directory: "", dependencies: { spawn: spy.spawn, homedirFn: () => home, tmpdirFn: () => home } });
  const finding = toolchain(result);
  assert.equal(finding.status, "ok");
  assert.equal(finding.repair, null);
  assert.deepEqual(spy.calls.map((call) => call.args[0]), ["version", "pkeyutl", "pkeyutl"], "version, sign, verify");
  for (const call of spy.calls) assert.equal(call.options.shell, false);
  assert.equal(existsSync(home) && readDirNames(home).some((name) => name.startsWith("pipeline-sign-probe-")), false, "the throwaway probe directory must be removed");
});
const readDirNames = (dir) => { try { return readdirSyncNames(dir); } catch { return []; } };
import { readdirSync as readdirSyncNames } from "node:fs";

// ---------------------------------------------------------------- A1/A3: real PATH lookup, no spawn seam -
test("A3: with a PATH that holds no openssl the REAL lookup reports openssl-not-on-path (clean-host case)", () => {
  const home = outsideDir("home"); const emptyPath = outsideDir("emptypath");
  withPath(emptyPath, () => {
    const result = probeSigningReadiness({ repository: scratchDir("probe-real"), directory: "", dependencies: { homedirFn: () => home, tmpdirFn: () => home, platform: process.platform, env: { PATH: emptyPath } } });
    const finding = toolchain(result);
    if (finding.status === "ok") return; // a system-location openssl exists on this host (POSIX fallback dirs): not a clean host
    assert.match(finding.cause, /^openssl-not-on-path: /u);
    assertTypedRepair(finding, { prerequisite: "openssl-on-path" });
  });
});

test("A5: a decoy openssl on the PATH inside a Git repository is never selected by the resolver (contaminated-host case)", () => {
  const decoyRepo = scratchDir("decoy");
  mkdirSync(join(decoyRepo, ".git"));
  const bin = join(decoyRepo, "bin"); mkdirSync(bin);
  const decoy = join(bin, WIN ? "openssl.exe" : "openssl");
  writeFileSync(decoy, WIN ? "MZ" : "#!/bin/sh\nexit 0\n");
  const resolved = resolveOpensslExecutable({ platform: process.platform, env: { PATH: bin, ProgramFiles: "", ProgramW6432: "", "ProgramFiles(x86)": "", LOCALAPPDATA: "" } });
  assert.notEqual(resolved, decoy, "an executable inside a repository must never be chosen");
  // Relative / empty PATH entries are skipped as well (the working directory never supplies the program).
  const relative = resolveOpensslExecutable({ platform: process.platform, env: { PATH: [".", "", "bin"].join(WIN ? ";" : ":"), ProgramFiles: "", ProgramW6432: "", "ProgramFiles(x86)": "", LOCALAPPDATA: "" } });
  assert.notEqual(relative, decoy);
});

test("A2: the repair for a missing openssl suggests the Git-install directory that actually holds one (non-default Git root), as a suggestion only", () => {
  const home = outsideDir("home");
  const gitRoot = scratchDir("gitroot");
  const suffix = WIN ? ".exe" : "";
  const cmd = join(gitRoot, "cmd"); mkdirSync(cmd);
  const native = join(gitRoot, "mingw64", "bin"); mkdirSync(native, { recursive: true });
  writeFileSync(join(cmd, `git${suffix}`), "x");
  writeFileSync(join(native, `openssl${suffix}`), "x");
  const spy = stubSpawn("not-on-path");
  const sep = WIN ? ";" : ":";
  withPath(`${cmd}${sep}`, () => {
    const finding = toolchain(probeSigningReadiness({ repository: scratchDir("probe-candidate"), directory: "", dependencies: { spawn: spy.spawn, homedirFn: () => home, tmpdirFn: () => home } }));
    assert.match(finding.cause, /^openssl-not-on-path/u);
    assert.match(finding.repair.summary, /mingw64\/bin/u, "the candidate directory name is offered");
    assert.match(finding.repair.summary, /suggestion only/u, "and labelled as a suggestion, never silently applied");
    assert.doesNotMatch(finding.repair.summary, new RegExp(gitRoot.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&"), "u"), "the machine path is not leaked into the repair");
  });
});

test("A2 (ucrt64): the repair names ucrt64/bin when that is where the Git install holds openssl, as a suggestion only, with no machine path", () => {
  const home = outsideDir("home");
  const gitRoot = scratchDir("gitroot-ucrt64");
  const suffix = WIN ? ".exe" : "";
  const cmd = join(gitRoot, "cmd"); mkdirSync(cmd);
  const ucrt = join(gitRoot, "ucrt64", "bin"); mkdirSync(ucrt, { recursive: true });
  writeFileSync(join(cmd, `git${suffix}`), "x");
  writeFileSync(join(ucrt, `openssl${suffix}`), "x");
  const spy = stubSpawn("not-on-path");
  const sep = WIN ? ";" : ":";
  withPath(`${cmd}${sep}`, () => {
    const finding = toolchain(probeSigningReadiness({ repository: scratchDir("probe-candidate-ucrt64"), directory: "", dependencies: { spawn: spy.spawn, homedirFn: () => home, tmpdirFn: () => home } }));
    assert.match(finding.cause, /^openssl-not-on-path/u);
    assert.match(finding.repair.summary, /ucrt64\/bin/u, "the ucrt64 candidate directory name is offered");
    assert.match(finding.repair.summary, /suggestion only/u, "and labelled as a suggestion, never silently applied");
    assert.doesNotMatch(finding.repair.summary, new RegExp(gitRoot.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&"), "u"), "the machine path is not leaked into the repair");
  });
});

// ---------------------------------------------------------------- A1: the environment readiness REPORT ---
test("A1: the environment readiness report carries the signing-toolchain finding with the same typed repair", async () => {
  const home = outsideDir("home"); const spy = stubSpawn("not-on-path");
  const ok = () => ({ status: "ok", cause: "ok", repair: null });
  const report = await preflight.runEnvironmentReadinessReport({ rootDir: scratchDir("report") }, {
    signingDependencies: { spawn: spy.spawn, homedirFn: () => home, tmpdirFn: () => home },
    findingProbes: Object.fromEntries(["git-version", "git-hooks", "bound-paths-tracked", "orphan-descriptors", "approval-verifiable"].map((id) => [id, ok])),
  });
  assert.ok(preflight.ENVIRONMENT_FINDING_IDS.includes("signing-toolchain"));
  const finding = report.findings.find((entry) => entry.findingId === "signing-toolchain");
  assert.ok(finding, "the report must contain signing-toolchain");
  assert.equal(finding.status, "attended");
  assert.match(finding.cause, /^openssl-not-on-path/u);
  assertTypedRepair(finding, { prerequisite: "openssl-on-path" });
  assert.equal(report.ok, false);
  assert.equal(report.nonGating, true);
  assert.equal(report.mutation, false);
});

test("A1: the same report, with a healthy openssl, reports signing-toolchain ok", async () => {
  const home = outsideDir("home"); const spy = stubSpawn("healthy");
  const ok = () => ({ status: "ok", cause: "ok", repair: null });
  const report = await preflight.runEnvironmentReadinessReport({ rootDir: scratchDir("report-ok") }, {
    signingDependencies: { spawn: spy.spawn, homedirFn: () => home, tmpdirFn: () => home },
    findingProbes: { "git-version": ok, "git-hooks": ok },
  });
  assert.equal(report.findings.find((entry) => entry.findingId === "signing-toolchain").status, "ok");
});

// ---------------------------------------------------------------- A4: sign-intent order ----------------
function signIntentFixture() {
  const repo = scratchDir("signintent-repo");
  const home = outsideDir("home"); const keyDir = outsideDir("keys"); const common = outsideDir("common");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  writeFileSync(join(keyDir, "po-private.pem"), privateKey);
  writeFileSync(join(keyDir, "po-public.pem"), publicKey);
  writeFileSync(join(keyDir, "trust-policy.json"), `${JSON.stringify({ keyReference: "pin-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex"), humanName: "Pin Operator" }, null, 2)}\n`);
  return { repo, home, keyDir, common };
}
function runSignIntent(fx, spy, events) {
  const argv = ["sign-intent", "--repo-root", fx.repo, "--directory", fx.keyDir, "--intent-sha256", "a".repeat(64)];
  const dependencies = {
    spawn: spy.spawn, homedirFn: () => fx.home, tmpdirFn: () => fx.home, gitCommonDirFn: () => fx.common,
    stderrWriteFn: () => {},
    readConfirmation: () => { events.push("prompt"); return "approve"; },
    describeIntentRecord: () => { events.push("lookup"); throw new Error("disclosure lookup must not run before the readiness probe passes"); },
  };
  try { return { value: runHumanApproval(argv, dependencies) }; } catch (error) { return { error }; }
}

test("A3+A4: sign-intent with no resolvable openssl fails at once with a typed finding that names openssl -- before any lookup, prompt or key path", () => {
  const fx = signIntentFixture(); const spy = stubSpawn("not-on-path"); const events = [];
  const outcome = runSignIntent(fx, spy, events);
  assert.ok(outcome.error, "sign-intent must refuse");
  assert.equal(outcome.error.code, "SIGN-READINESS-FAILED");
  assert.equal(outcome.error.finding.findingId, "signing-toolchain");
  assert.equal(namesMissingExecutable(outcome.error.message), true, `message must name the missing executable; got: ${outcome.error.message}`);
  assertTypedRepair(outcome.error.finding, { prerequisite: "openssl-on-path" });
  assert.deepEqual(events, [], "no disclosure lookup and no prompt before the readiness failure");
  assert.equal(spy.calls.some((call) => call.touchesKey), false, "no process receives the PO key path");
  assert.equal(spy.calls.every((call) => call.args[0] === "version"), true);
});

test("A4 control: with a healthy openssl the same fixture is NOT stopped by the toolchain finding (it stops on the next, key-anchor class)", () => {
  const fx = signIntentFixture(); const spy = stubSpawn("healthy"); const events = [];
  const outcome = runSignIntent(fx, spy, events);
  assert.ok(outcome.error);
  assert.equal(outcome.error.code, "SIGN-READINESS-FAILED");
  assert.equal(outcome.error.finding.findingId, "trust-anchor-match");
  assert.equal(outcome.error.findings.find((entry) => entry.findingId === "signing-toolchain").status, "ok");
  assert.deepEqual(events, []);
  assert.equal(spy.calls.some((call) => call.touchesKey), false);
});

// ---------------------------------------------------------------- real-host evidence (typed skips) ------
const realOpenssl = resolveOpensslExecutable({});
test("A1 (clean native host): the real openssl on this host completes the Ed25519 round trip", { skip: realOpenssl === null ? hostSkip("no openssl is resolvable outside every repository on this host;") : false }, () => {
  const home = outsideDir("home");
  const finding = toolchain(probeSigningReadiness({ repository: scratchDir("probe-real-ok"), directory: "", dependencies: { homedirFn: () => home, tmpdirFn: () => home } }));
  assert.equal(finding.status, "ok", `real openssl round trip: ${finding.cause}`);
});

test("A5 (contaminated host): a decoy executable on PATH inside a repository is never STARTED by the real probe", { skip: WIN ? hostSkip("the decoy start-proof uses a POSIX executable file with mode bits;") : false }, () => {
  const decoyRepo = scratchDir("decoy-start"); mkdirSync(join(decoyRepo, ".git"));
  const bin = join(decoyRepo, "bin"); mkdirSync(bin);
  const marker = join(decoyRepo, "decoy-started");
  const decoy = join(bin, "openssl");
  writeFileSync(decoy, `#!/bin/sh\necho started > "${marker}"\nexit 0\n`);
  chmodSync(decoy, 0o755);
  const home = outsideDir("home");
  withPath(bin, () => { probeSigningReadiness({ repository: scratchDir("probe-decoy"), directory: "", dependencies: { homedirFn: () => home, tmpdirFn: () => home } }); });
  assert.equal(existsSync(marker), false, "a decoy openssl inside a repository was started");
});
