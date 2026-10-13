// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin for backlog item pipeline.existing-signing-key-reuse-deadlocks-onboarding (ALF-C-P1-20, AC-171).
 *
 * Acceptance points pinned here, each through the real module (no mock of the behaviour under test):
 *  A1  a key already at the canonical `po-private.pem` is REUSED: it is not passed to setup as an import
 *      (`--existing-key` is absent), and its bytes and the directory contents are preserved.
 *  A2  the public fingerprint recorded in the repository policy is the one in the key directory's authority.
 *  A3  path aliases and Windows spelling (drive-letter case, forward slashes, dot segments, dot-dot detour)
 *      of the canonical key do not change that decision.
 *  A4  replay is idempotent and runs no second setup.
 *  A5  wrong-key refusal: a different key supplied against a populated directory is refused, nothing is
 *      anchored, the canonical key survives; a canonical private key that does not match the recorded
 *      public key is refused instead of being anchored silently.
 *  A6  attended external recovery: plan/digest-bound confirmation, bounded first-anchor transaction, replay-safe
 *      audit record labelled as not signature-attested ("external-terminal-confirmed-unattested").
 *
 * Host limitation: directory symlinks are unavailable on the native Windows host, so the symlink-alias case
 * is skipped there with a typed reason; mode bits are not asserted anywhere in this file.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { applyBootstrapTrustRecovery, planBootstrapTrustRecovery } from "../../scripts/bootstrap-trust-recovery.mjs";
import { applyTrustAnchorBootstrap, driveOnboardingInit } from "../../scripts/onboarding-init.mjs";
import { runHumanApproval } from "../../scripts/po-human-approval.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
const PASSPHRASE = "alf-c-p1-20-fixture-passphrase";
const NAME = "Existing PO";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encryptedKeyPem = () => generateKeyPairSync("ed25519").privateKey
  .export({ format: "pem", type: "pkcs8", cipher: "aes-256-cbc", passphrase: PASSPHRASE });

// Fixture keys are passphrase-protected (setup refuses unencrypted keys); the test-only seam feeds -passin to
// fixture-key public-derivation calls, mirroring the adjacent onboarding-init test.
function passinSpawn() {
  return (executable, args, options) => {
    const list = Array.isArray(args) ? args : [];
    const input = list.indexOf("-in") >= 0 ? String(list[list.indexOf("-in") + 1] ?? "") : "";
    const derives = /(?:^|[\\/])openssl(?:\.exe)?$/iu.test(String(executable)) && list[0] === "pkey"
      && list.includes("-pubout") && /(?:^|[\\/])[\w-]*private\.pem$/iu.test(input) && !list.includes("-passin");
    return spawnSync(executable, derives ? [...list, "-passin", `pass:${PASSPHRASE}`] : args, options);
  };
}

// In-process setup step (documented runSetup seam) that records every argv it was handed.
function recordingSetup(home, calls, failures) {
  return (_executable, setupArgs) => {
    calls.push([...setupArgs]);
    try {
      runHumanApproval(setupArgs.slice(1), { spawn: passinSpawn(), homedirFn: () => home, isTTY: true });
      return { status: 0, signal: null };
    } catch (error) {
      failures.push(error);
      return { status: 1, signal: null };
    }
  };
}

// A repository root and a key directory that already holds a canonical PO key, both under the repo scratch/.
// The expensive onboarding fixture is built ONCE at a fixed path and snapshotted; every case restores the
// snapshot over the same path (so absolute paths recorded in pointers stay valid) instead of rebuilding.
let shared = null;

// Restore `live` to the content of `snap` WITHOUT deleting or recreating any directory that existed at snapshot
// time: the Windows owner-only DACLs the authority checks demand live on those directories and a plain recursive
// copy would drop them. Files are rewritten in place; anything the previous case added is removed.
function restoreInPlace(snap, live) {
  const wanted = new Map(readdirSync(snap, { withFileTypes: true }).map((entry) => [entry.name, entry]));
  for (const entry of readdirSync(live, { withFileTypes: true })) {
    if (!wanted.has(entry.name)) rmSync(join(live, entry.name), { recursive: true, force: true });
  }
  for (const [name, entry] of wanted) {
    const from = join(snap, name);
    const to = join(live, name);
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      restoreInPlace(from, to);
    } else {
      const bytes = readFileSync(from);
      if (!existsSync(to) || !readFileSync(to).equals(bytes)) writeFileSync(to, bytes);
    }
  }
}

function arrange() {
  mkdirSync(SCRATCH, { recursive: true });
  if (shared !== null) restoreInPlace(shared.snapshot, shared.base);
  const base = shared?.base ?? mkdtempSync(join(SCRATCH, "alf-c-p1-20-"));
  const root = join(base, "repo");
  const home = join(base, "home");
  const directory = join(home, "po-authority");
  const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
  if (shared === null) {
    mkdirSync(root, { recursive: true });
    mkdirSync(home, { recursive: true });
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env }).outcome, "pending-asks");
    // The fixture repository needs a HEAD for the signed-descriptor custody inspection that setup performs.
    assert.equal(spawnSync("git", ["-C", root, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
      "commit", "-q", "--allow-empty", "--no-verify", "-m", "fixture"], { encoding: "utf8", shell: false }).status, 0);
    const source = join(home, "source-private.pem");
    writeFileSync(source, encryptedKeyPem(), { mode: 0o600 });
    runHumanApproval(["setup", "--repo-root", root, "--directory", directory, "--existing-key", source,
      "--human-name", NAME], { spawn: passinSpawn(), homedirFn: () => home, isTTY: true });
    const snapshot = `${base}-snapshot`;
    cpSync(base, snapshot, { recursive: true });
    shared = { base, snapshot };
  }
  const canonicalKey = join(directory, "po-private.pem");
  const calls = [];
  const failures = [];
  return {
    base, root, home, directory, env, canonicalKey, calls, failures,
    runSetup: recordingSetup(home, calls, failures),
    keyBytes: readFileSync(canonicalKey),
    listing: readdirSync(directory).sort(),
    cleanup: () => {},
    bootstrap(existingKey) {
      return applyTrustAnchorBootstrap({
        rootDir: root, mode: "existing", directory, humanName: NAME, existingKey, env, runSetup: this.runSetup,
      });
    },
    policy: () => {
      const path = join(root, "project", "critical-human-proof.json");
      const parsed = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
      return { ...parsed, trustAnchors: parsed.trustAnchors ?? [] };
    },
    authority: () => JSON.parse(readFileSync(join(directory, "trust-policy.json"), "utf8")),
  };
}

after(() => {
  if (shared !== null) for (const path of [shared.base, shared.snapshot]) rmSync(path, { recursive: true, force: true });
});

function withFixture(fn) {
  const fixture = arrange();
  return Promise.resolve().then(() => fn(fixture)).finally(() => fixture.cleanup());
}

function assertReused(fixture, applied) {
  assert.equal(applied.ok, true, `reuse must succeed: ${JSON.stringify(applied)}; ${fixture.failures.map(String).join("|")}`);
  assert.equal(applied.code, "TRUST-ANCHOR-BOOTSTRAP-COMPLETE");
  assert.equal(fixture.calls.length, 1, "setup ran exactly once");
  assert.equal(fixture.calls[0].includes("--existing-key"), false, "a canonical key is never passed to setup as an import");
  assert.deepEqual(readFileSync(fixture.canonicalKey), fixture.keyBytes, "private key bytes are preserved");
  assert.deepEqual(readdirSync(fixture.directory).sort(), fixture.listing, "no copy or extra file appears in the key directory");
}

test("A1/A2: a key already at the canonical path is reused, not imported, and its fingerprint is anchored", () => withFixture((fx) => {
  const applied = fx.bootstrap(fx.canonicalKey);
  assertReused(fx, applied);
  const anchors = fx.policy().trustAnchors;
  assert.equal(anchors.length, 1);
  const authority = fx.authority();
  assert.match(authority.publicKeySha256, /^[a-f0-9]{64}$/u);
  assert.equal(anchors[0].publicKeySha256, authority.publicKeySha256, "repository anchor carries the key directory's fingerprint");
  assert.equal(anchors[0].keyReference, authority.keyReference);
  assert.equal(JSON.stringify(fx.policy()).includes("PRIVATE KEY"), false, "no private key material reaches the repository");
}));

function spellings(fx) {
  const key = fx.canonicalKey;
  const list = [
    ["dot segment", `${fx.directory}${sep}.${sep}po-private.pem`],
    ["dot-dot detour", `${dirname(fx.directory)}${sep}..${sep}${basename(dirname(fx.directory))}${sep}${basename(fx.directory)}${sep}po-private.pem`],
  ];
  if (process.platform === "win32") {
    list.push(["lower-case drive with forward slashes", `${key[0].toLowerCase()}${key.slice(1)}`.replaceAll("\\", "/")]);
    list.push(["upper-case drive", `${key[0].toUpperCase()}${key.slice(1)}`]);
    list.push(["lower-cased whole path", key.toLowerCase()]);
  }
  return list;
}

test("A3: path aliases and Windows spellings of the canonical key are all treated as reuse", async () => {
  const names = spellings({ canonicalKey: join(SCRATCH, "x", "po-authority", "po-private.pem"), directory: join(SCRATCH, "x", "po-authority") })
    .map(([name]) => name);
  for (const name of names) {
    await withFixture((fx) => {
      const [, spelled] = spellings(fx).find(([n]) => n === name);
      assertReused(fx, fx.bootstrap(spelled));
      assert.equal(fx.policy().trustAnchors.length, 1, `${name}: exactly one anchor`);
    });
  }
});

test("A3: a directory symlink alias of the canonical key is treated as reuse", { skip: process.platform === "win32"
  ? "host-limitation: directory symlinks are unavailable on this native Windows host" : false }, () => withFixture((fx) => {
  const link = join(fx.home, "po-authority-link");
  symlinkSync(fx.directory, link, "dir");
  assertReused(fx, fx.bootstrap(join(link, "po-private.pem")));
}));

test("A4: replay is idempotent, runs no second setup and keeps the key bytes", () => withFixture((fx) => {
  assertReused(fx, fx.bootstrap(fx.canonicalKey));
  const policyBefore = readFileSync(join(fx.root, "project", "critical-human-proof.json"));
  const replay = fx.bootstrap(fx.canonicalKey);
  assert.deepEqual(replay, { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE", mode: "existing", alreadyComplete: true });
  assert.equal(fx.calls.length, 1, "replay runs no setup");
  const aliased = fx.bootstrap(`${fx.directory}${sep}.${sep}po-private.pem`);
  assert.equal(aliased.alreadyComplete, true);
  assert.deepEqual(readFileSync(fx.canonicalKey), fx.keyBytes);
  assert.deepEqual(readFileSync(join(fx.root, "project", "critical-human-proof.json")), policyBefore);
}));

test("A5: a different key supplied against a populated key directory is refused and nothing is anchored", () => withFixture((fx) => {
  const other = join(fx.home, "other-private.pem");
  writeFileSync(other, encryptedKeyPem(), { mode: 0o600 });
  const result = fx.bootstrap(other);
  assert.equal(result.ok, false);
  assert.equal(result.code, "TRUST-ANCHOR-SETUP-FAILED");
  assert.equal(fx.calls[0].includes("--existing-key"), true, "a non-canonical key is still treated as an import request");
  assert.match(String(fx.failures[0]?.message ?? fx.failures[0]), /already carries key material/u);
  assert.deepEqual(readFileSync(fx.canonicalKey), fx.keyBytes, "canonical key survives the refusal");
  assert.deepEqual(readdirSync(fx.directory).sort(), fx.listing);
  assert.equal(fx.policy().trustAnchors.length, 0, "no anchor is written by a refused wrong-key request");
}));

test("A5: a canonical private key that does not belong to the recorded public key is not anchored", () => withFixture((fx) => {
  writeFileSync(fx.canonicalKey, encryptedKeyPem(), { mode: 0o600 });
  const swapped = readFileSync(fx.canonicalKey);
  const result = fx.bootstrap(fx.canonicalKey);
  assert.equal(result.ok, false, `a mismatched private key must be refused, got ${JSON.stringify(result)}`);
  assert.equal(fx.policy().trustAnchors.length, 0, "no anchor binds a fingerprint to a foreign private key");
  assert.deepEqual(readFileSync(fx.canonicalKey), swapped, "the existing bytes are still preserved on refusal");
}));

test("A6: attended recovery is plan-digest bound, reuses the canonical key, and leaves a replay-safe unattested audit", () => withFixture(async (fx) => {
  const options = { rootDir: fx.root, mode: "existing", directory: fx.directory, humanName: NAME, existingKey: fx.canonicalKey };
  const plan = planBootstrapTrustRecovery(options);
  assert.equal(plan.code, "BTR-PLAN-READY");
  assert.equal(plan.intent.existingKeySha256, sha(fx.keyBytes), "the plan binds the exact key bytes");
  let applied = 0;
  const apply = (request) => {
    applied += 1;
    return applyTrustAnchorBootstrap({ ...request, env: fx.env, runSetup: fx.runSetup });
  };
  const input = { ...options, planSha256: plan.planSha256 };
  assert.equal((await applyBootstrapTrustRecovery({ ...input, planSha256: "0".repeat(64) }, { confirm: async () => plan.planSha256, apply })).code, "BTR-PLAN-DRIFT");
  assert.equal((await applyBootstrapTrustRecovery(input, { confirm: async () => "yes", apply })).code, "BTR-NOT-CONFIRMED");
  assert.equal(applied, 0, "no setup before an exact digest confirmation");
  assert.equal(fx.policy().trustAnchors.length, 0);

  const first = await applyBootstrapTrustRecovery(input, { confirm: async () => plan.planSha256, apply });
  assert.equal(first.code, "BTR-RECOVERED", JSON.stringify(first));
  assert.equal(first.basis, "external-terminal-confirmed-unattested");
  assertReused(fx, { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE" });
  assert.equal(fx.policy().trustAnchors.length, 1);
  const audit = JSON.parse(readFileSync(first.auditPath, "utf8"));
  assert.equal(audit.basis, "external-terminal-confirmed-unattested");
  assert.equal(audit.planSha256, plan.planSha256);
  assert.equal(JSON.stringify(audit).includes("po-private.pem"), false);
  assert.equal(JSON.stringify(audit).includes("PRIVATE KEY"), false);

  const replay = await applyBootstrapTrustRecovery(input, { confirm: async () => plan.planSha256, apply });
  // The first apply changed the policy preimage the plan binds, so the same digest is refused as drift: a replay of
  // a consumed plan is rejected before any setup runs rather than re-applied.
  assert.equal(replay.code, "BTR-PLAN-DRIFT", JSON.stringify(replay));
  assert.equal(replay.ok, false);
  assert.equal(applied, 1, "replay of a consumed plan never reaches apply");
  assert.equal(fx.calls.length, 1, "replay runs no second setup");
  assert.equal(fx.policy().trustAnchors.length, 1, "replay adds no second anchor");
  assert.equal(JSON.parse(readFileSync(first.auditPath, "utf8")).planSha256, plan.planSha256, "the audit record is untouched");
  assert.equal(existsSync(fx.canonicalKey), true);
}));
