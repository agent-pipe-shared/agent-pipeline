// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.sign-intent-disclosure-scan-blocks-for-minutes (AC-257).
// Proposal points: (1) signed quality package disclosed directly, before the GMW/HGO resolvers;
// (2) HGO lookup digest-keyed, never a store scan; (3) readiness before any resolver work;
// (4) a sanctioned sweep for consumed/expired HGO requests.
//
// Every point is exercised by behaviour, never by reading source text: a populated request store is timed
// (point 2), the real `sign-intent` entry point is run with counting resolver seams (points 1 and 3) and
// the real sweep is run over expired requests (point 4). The original defect measured 563 s for a lookup
// over 111 recorded requests; the bound below is two orders of magnitude tighter than that.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SIGNED_QUALITY_PACKAGE_SCHEMA, describeSignedQualityPackageIntent, qualityPackageIntentSha256 } from "../signed-quality-package.mjs";
import {
  describeHumanGuardOverrideSelection,
  humanGuardOverrideInternals,
  planHumanGuardOverride,
  prepareHumanGuardOverrideForSignature,
  recordHumanGuardDenial,
  sweepHumanGuardOverrideRequests,
} from "../human-guard-override.mjs";
import { runHumanApproval } from "../../scripts/po-human-approval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..", "..");
const HUMAN_OVERRIDE_SCRIPT = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const APPROVAL_SCRIPT = join(PLUGIN_ROOT, "scripts", "po-human-approval.mjs");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const denial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }];

// The measured defect was 563 s for 111 recorded requests; a digest-keyed lookup is milliseconds. The bound is
// generous for a loaded machine and still ~100x below the defect.
const STORE_REQUESTS = 111;
const LOOKUP_BUDGET_MS = 5000;
const POSIX_MODES = process.platform === "win32" && "host-limitation: the HGO private-directory modes need POSIX mode bits; the native Windows run is the separate DACL obligation (owner Coordinator, PO decision K7)";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

function signatureRepository(prefix) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  git(root, "add", "README.md", "pipeline.user.yaml");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

const cleanup = (...dirs) => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); };

function recordRequests(root, count) {
  const recorded = [];
  for (let n = 0; n < count; n++) {
    const result = recordHumanGuardDenial({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
      toolInput: { file_path: `notes-${n}.md`, content: `pin store request ${n}\n` }, denials: denial, nowMs: Date.now() });
    assert.equal(typeof result.requestSha256, "string", JSON.stringify(result));
    recorded.push(result.requestSha256);
  }
  return recorded;
}

function qualityPackage() {
  const body = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: "a".repeat(40),
    unifiedDiff: "diff --git a/x/b.txt b/x/b.txt\n--- a/x/b.txt\n+++ b/x/b.txt\n@@ -1 +1 @@\n-a\n+b\n",
    expectedDigests: { "x/b.txt": sha("b\n") } };
  return { ...body, intentSha256: qualityPackageIntentSha256(body) };
}

test("point 1: a signed quality package is disclosed directly (base commit, paths, digests) with no store", () => {
  const pkg = qualityPackage();
  const described = describeSignedQualityPackageIntent(pkg, pkg.intentSha256);
  assert.equal(described.resolved, true);
  const text = described.lines.join("\n");
  assert.ok(text.includes(pkg.baseCommit));
  assert.ok(text.includes(`x/b.txt: ${pkg.expectedDigests["x/b.txt"]}`));
  assert.equal(describeSignedQualityPackageIntent(pkg, sha("other")), null, "a digest that does not bind the package never discloses");
});

// ---- the real sign-intent entry point over a fixture that stops at the readiness check --------------------------------
// A repository with no committed trust anchor and a key directory outside every repository: sign-intent must refuse in
// its readiness step. Counting seams stand in for the GMW and HGO resolvers and for OpenSSL.
function signIntentFixture() {
  const repository = signatureRepository("alf-sign-intent-repo-");
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "alf-sign-intent-keys-")));
  const home = realpathSync(mkdtempSync(join(tmpdir(), "alf-sign-intent-home-")));
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(join(directory, "po-private.pem"), keys.privateKey.export({ type: "pkcs8", format: "pem" }));
  writeFileSync(join(directory, "po-public.pem"), publicKey);
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({ keyReference: "pin-key", publicKeySha256: sha(publicKey), humanName: "Pin Operator" })}\n`);
  const calls = { gmw: 0, hgo: 0, openssl: 0 };
  const dependencies = {
    homedirFn: () => home,
    describeIntentRecord: () => { calls.gmw += 1; throw new Error("the GMW resolver must not run"); },
    describeHgoIntentRecord: () => { calls.hgo += 1; throw new Error("the HGO resolver must not run"); },
    spawn: () => { calls.openssl += 1; return { status: 0, stdout: "OpenSSL 3.0.0 pin\n", stderr: "" }; },
    stderrWriteFn: () => {},
  };
  return { repository, directory, home, calls, dependencies, cleanup: () => cleanup(repository, directory, home) };
}

test("point 3: readiness is checked before any resolver work in sign-intent", () => {
  const item = signIntentFixture();
  try {
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", item.repository, "--directory", item.directory, "--intent-sha256", sha("any digest")], item.dependencies),
      (error) => error?.code === "SIGN-READINESS-FAILED",
      "a missing prerequisite fails with its typed readiness repair",
    );
    assert.deepEqual({ gmw: item.calls.gmw, hgo: item.calls.hgo }, { gmw: 0, hgo: 0 }, "no resolver ran before the readiness failure");
  } finally { item.cleanup(); }
});

test("point 1: a quality-package --request is disclosed by its own case and never reaches the GMW/HGO resolvers", () => {
  const item = signIntentFixture();
  try {
    const pkg = qualityPackage();
    mkdirSync(join(item.repository, "scratch"), { recursive: true });
    writeFileSync(join(item.repository, "scratch", "quality-package-request.json"), JSON.stringify(pkg));
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", item.repository, "--directory", item.directory, "--request", "scratch/quality-package-request.json"], item.dependencies),
      (error) => error?.code === "SIGN-READINESS-FAILED",
      "the request was accepted and disclosed (not refused as invalid or unsupported); only the later readiness step refused",
    );
    assert.deepEqual({ gmw: item.calls.gmw, hgo: item.calls.hgo }, { gmw: 0, hgo: 0 }, "the generic resolver chain never ran");
  } finally { item.cleanup(); }
});

test("point 1: a request whose digest does not bind the package is refused as invalid, still without a resolver scan", () => {
  const item = signIntentFixture();
  try {
    const pkg = { ...qualityPackage(), intentSha256: sha("a digest that does not bind this package") };
    mkdirSync(join(item.repository, "scratch"), { recursive: true });
    writeFileSync(join(item.repository, "scratch", "quality-package-request.json"), JSON.stringify(pkg));
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", item.repository, "--directory", item.directory, "--request", "scratch/quality-package-request.json"], item.dependencies),
      /QUALITY-PACKAGE-SIGN-REQUEST-INVALID/u,
    );
    assert.deepEqual({ gmw: item.calls.gmw, hgo: item.calls.hgo }, { gmw: 0, hgo: 0 });
  } finally { item.cleanup(); }
});

// ---- point 2: the HGO lookup over a populated request store ----------------------------------------------------------
test("point 2: with a populated request store an unknown digest is unresolved within the time budget and without touching the store", { skip: POSIX_MODES }, () => {
  const root = signatureRepository("alf-sign-intent-store-");
  try {
    recordRequests(root, STORE_REQUESTS);
    const requests = join(root, ".git", "agent-pipeline", "human-guard-overrides", "requests");
    assert.equal(readdirSync(requests).length, STORE_REQUESTS, "the store holds the recorded requests the defect measured");
    const started = Date.now();
    const unresolved = describeHumanGuardOverrideSelection({ rootDir: root, pluginRoot: PLUGIN_ROOT, intentSha256: sha("an intent no request names"), scriptPath: HUMAN_OVERRIDE_SCRIPT });
    const elapsed = Date.now() - started;
    assert.equal(unresolved.resolved, false);
    assert.equal(unresolved.code, "HGO-RECORD-INDEX-UNAVAILABLE", "an unknown digest has no index; it is not matched against every request");
    assert.deepEqual(unresolved.lines, []);
    assert.ok(elapsed < LOOKUP_BUDGET_MS, `the lookup took ${elapsed} ms over ${STORE_REQUESTS} requests (budget ${LOOKUP_BUDGET_MS} ms; the defect took 563000 ms)`);
  } finally { cleanup(root); }
});

test("point 2: with a populated request store a digest with a published index resolves its own request within the time budget", { skip: POSIX_MODES }, () => {
  const root = signatureRepository("alf-sign-intent-resolve-");
  try {
    const hashes = recordRequests(root, STORE_REQUESTS);
    const chosen = hashes[Math.floor(STORE_REQUESTS / 2)];
    const planned = planHumanGuardOverride({ rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: chosen, scriptPath: HUMAN_OVERRIDE_SCRIPT });
    assert.equal(typeof planned.planSha256, "string", JSON.stringify(planned));
    const published = prepareHumanGuardOverrideForSignature({ rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: chosen, scriptPath: HUMAN_OVERRIDE_SCRIPT, humanApprovalScriptPath: APPROVAL_SCRIPT });
    const started = Date.now();
    const resolved = describeHumanGuardOverrideSelection({ rootDir: root, pluginRoot: PLUGIN_ROOT, intentSha256: published.intentSha256, scriptPath: HUMAN_OVERRIDE_SCRIPT });
    const elapsed = Date.now() - started;
    assert.equal(resolved.resolved, true, JSON.stringify(resolved));
    assert.equal(resolved.code, "HGO-RECORD-RESOLVED");
    assert.ok(resolved.lines.join("\n").includes("notes-55.md"), "the disclosure names the chosen request's own path");
    assert.ok(elapsed < LOOKUP_BUDGET_MS, `the lookup took ${elapsed} ms over ${STORE_REQUESTS} requests (budget ${LOOKUP_BUDGET_MS} ms)`);
  } finally { cleanup(root); }
});

// ---- point 4: the sanctioned sweep -----------------------------------------------------------------------------------
test("point 4: sweep-requests removes expired requests from a populated store and keeps a live one", { skip: POSIX_MODES }, () => {
  const root = signatureRepository("alf-sign-intent-sweep-");
  try {
    const [live] = recordRequests(root, 1);
    const base = join(root, ".git", "agent-pipeline", "human-guard-overrides");
    const { canonical } = humanGuardOverrideInternals;
    const expired = [];
    for (let n = 0; n < 40; n++) {
      const retired = { schema: "pipeline.human-guard-override-request.v2", root, plugin: {}, repository: {}, toolName: "Bash",
        toolInputSha256: "a".repeat(64), denials: [], policy: {}, preview: {}, eligiblePaths: [], commandClass: `expired-${n}`, mode: "standard",
        authorSourceRoot: null, createdAt: "2026-08-31T09:00:00.000Z", expiresAt: "2026-08-31T10:00:00.000Z" };
      const name = `${createHash("sha256").update(canonical(retired)).digest("hex")}.json`;
      writeFileSync(join(base, "requests", name), JSON.stringify(retired), { mode: 0o600 });
      expired.push(name);
    }
    const swept = sweepHumanGuardOverrideRequests({ rootDir: root });
    assert.equal(swept.status, "swept", JSON.stringify(swept));
    assert.equal(swept.removed, expired.length, "every expired request was removed");
    for (const name of expired) assert.equal(existsSync(join(base, "requests", name)), false, name);
    assert.equal(existsSync(join(base, "requests", `${live}.json`)), true, "a live request is retained");
  } finally { cleanup(root); }
});
