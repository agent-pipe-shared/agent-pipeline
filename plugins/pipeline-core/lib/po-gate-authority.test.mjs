#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run as runPipelineState } from "../../../harness/scripts/pipeline-state.mjs";

import {
  PO_GATE_PRD_LANGUAGE_MARKER,
  PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH,
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  normalizeRepositoryPath,
  parseGitWorktreeList,
  poGateProfileReceiptPath,
  resolvePoGateRepositoryTopology,
  selectPrimaryWorktree,
  serializePoGateProfileReceipt,
  validatePoGateAuthority,
  validatePoGateLanguageProjection,
  validatePoGateProfileReceipt,
  validatePoGateProfileForRepository,
} from "./po-gate-authority.mjs";
import { hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const CHECKER = join(REPO_ROOT, "harness", "scripts", "check-po-gate-authority.mjs");
const NOW = "2026-07-18T18:00:00.000Z";
const TECHNICAL_SPEC_MARKER = (digest) => `<!-- technical-spec-sha256: ${digest} -->`;

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

let symlinkCapable = true;
{
  const probeDir = mkdtempSync(join(tmpdir(), "po-gate-authority-symlink-probe-"));
  try { writeFileSync(join(probeDir, "target"), "x"); symlinkSync(join(probeDir, "target"), join(probeDir, "link")); }
  catch { symlinkCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
  if (!symlinkCapable) process.stdout.write("[capability: symlink unavailable] skipping symlink-specific checks\n");
}

function write(path, value, mode = undefined) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
  if (mode !== undefined) chmodSync(path, mode);
}

/**
 * The fixture writes the receipt directly (it is not exercising the
 * production publisher), so on win32 it must reproduce the publisher's own
 * per-directory hardening: `loadReceipt` requires both the receipt file and
 * its parent directory to report a secure DACL. POSIX is unaffected.
 */
function hardenWindowsReceiptDirectory(common) {
  if (process.platform !== "win32") return;
  let cursor = common;
  for (const component of dirname(PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH).split(/[\\/]/u).filter(Boolean)) {
    cursor = join(cursor, component);
    const state = hardenWindowsPrivateDirectory(cursor);
    assert.equal(state.status, "secure", `fixture could not harden ${component}: ${JSON.stringify(state)}`);
  }
}

/**
 * Simulate a receipt whose closed-permission acceptance criterion fails.
 * POSIX enforces this via the 0600 mode bit; win32 has no mode-bit analog
 * (chmod there cannot express DACL state), so simulate the equivalent
 * insecurity by granting an extra DACL principal via the fixed system
 * `icacls` tool -- never by weakening `evaluateWindowsPrivateState` itself.
 */
function weakenReceiptPermissions(path) {
  if (process.platform !== "win32") {
    chmodSync(path, 0o644);
    return;
  }
  const icacls = resolveTrustedSystemExecutable("icacls");
  assert.equal(icacls.ok, true, `fixture requires the system icacls tool: ${JSON.stringify(icacls)}`);
  const result = spawnSync(icacls.path, [path, "/grant", "*S-1-1-0:(R)"], { encoding: "utf8", shell: false });
  assert.equal(result.status, 0, `fixture could not weaken the receipt DACL: ${result.stderr}`);
}

function source(language) {
  return `schema: pipeline.user.v1\nlanguage:\n  human_facing: ${language}\n  agent_facing: en\n`;
}

function runtime(language) {
  return `schema: pipeline.manifest.v0\nlanguage:\n  human_facing: ${language}\n`;
}

function state(planPath = "specs/feature/prd_feature.md") {
  return `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature", planPath, phase: "design" },
  }, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function spec(body = "# Technical Spec\n") {
  return body;
}

function prd(language, body = "# PRD\n", specBytes = spec()) {
  return `${PO_GATE_PRD_LANGUAGE_MARKER(language)}\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n${body}`;
}

function populateRoot(root, language = "de") {
  const specBytes = spec();
  write(join(root, "pipeline.user.yaml"), source(language));
  write(join(root, ".claude", "pipeline.yaml"), runtime(language));
  write(join(root, ".claude", "pipeline-state.json"), state());
  write(join(root, "specs", "feature", "spec.md"), specBytes);
  write(join(root, "specs", "feature", "prd_feature.md"), prd(language, "# PRD\n", specBytes));
}

function publishReceipt(common, primary) {
  const receipt = createPoGateProfileReceipt({
    repositoryFingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: primary }),
    primaryRoot: primary,
    sourceBytes: readFileSync(join(primary, "pipeline.user.yaml")),
    runtimeBytes: readFileSync(join(primary, ".claude", "pipeline.yaml")),
    updatedAt: NOW,
  });
  const path = poGateProfileReceiptPath(common);
  mkdirSync(dirname(path), { recursive: true });
  hardenWindowsReceiptDirectory(common);
  writeFileSync(path, serializePoGateProfileReceipt(receipt));
  chmodSync(path, 0o600);
  return { path, receipt };
}

function fixture({ linkedLanguage = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), "po-gate-authority-"));
  const common = join(base, "common.git");
  const primary = join(base, "primary");
  mkdirSync(common, { recursive: true });
  mkdirSync(primary, { recursive: true });
  populateRoot(primary, "de");
  const current = linkedLanguage === null ? primary : join(base, "linked");
  if (linkedLanguage !== null) {
    mkdirSync(current, { recursive: true });
    populateRoot(current, linkedLanguage);
  }
  const published = publishReceipt(common, primary);
  return {
    base,
    common,
    primary,
    current,
    receiptPath: published.path,
    receipt: published.receipt,
    validate(overrides = {}) {
      return validatePoGateAuthority({
        repoRoot: current,
        gitCommonDir: common,
        primaryRoot: primary,
        registeredWorktreeRoots: current === primary ? [primary] : [primary, current],
        ...overrides,
      });
    },
    validateProfile(overrides = {}) {
      const topology = {
        repoRoot: current,
        gitCommonDir: common,
        primaryRoot: primary,
        registeredWorktreeRoots: current === primary ? [primary] : [primary, current],
        ...overrides,
      };
      return validatePoGateProfileForRepository({ repoRoot: current }, { topology });
    },
    cleanup() { rmSync(base, { recursive: true, force: true }); },
  };
}

function withFixture(options, fn) {
  const value = fixture(options);
  try {
    return fn(value);
  } finally {
    value.cleanup();
  }
}

check("closed profile receipt and canonical serialization bind the validated projection", () => {
  withFixture({}, ({ receipt }) => {
    assert.equal(validatePoGateProfileReceipt(receipt), true);
    assert.equal(serializePoGateProfileReceipt(receipt), serializePoGateProfileReceipt({ ...receipt }));
    assert.equal(validatePoGateProfileReceipt({ ...receipt, extra: true }), false);
  });
});

check("narrow PO-language projection ignores runner schema while requiring an exact language pair", () => {
  assert.deepEqual(
    validatePoGateLanguageProjection(source("de"), runtime("de")),
    { ok: true, code: "PO-PROFILE-PROJECTION-VALID", humanFacing: "de" },
  );
  assert.equal(validatePoGateLanguageProjection("language:\n  human_facing: de\n", runtime("de")).ok, true);
  assert.equal(validatePoGateLanguageProjection(source("en"), runtime("de")).code, "PO-PROFILE-PROJECTION-INVALID");
});

check("profile-only readback validates the receipt without pipeline-state, PRD or Spec inputs", () => {
  withFixture({}, ({ primary, validateProfile }) => {
    rmSync(join(primary, ".claude", "pipeline-state.json"), { force: true });
    rmSync(join(primary, "specs"), { recursive: true, force: true });
    const result = validateProfile();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.code, "PO-PROFILE-AUTHORITY-VALID");
    assert.deepEqual(Object.keys(result.value), [
      "schema",
      "humanFacing",
      "sourceSha256",
      "runtimeSha256",
      "receiptSha256",
      "repositoryFingerprint",
    ]);
    assert.equal(result.value.schema, "pipeline.po-gate-authority-evidence.v1");
    assert.equal(result.value.humanFacing, "de");
  });
});

check("profile-only readback rejects missing, stale and non-0600 receipts", () => {
  for (const mutation of [
    ({ receiptPath }) => unlinkSync(receiptPath),
    ({ receiptPath }) => weakenReceiptPermissions(receiptPath),
    ({ primary }) => write(join(primary, "pipeline.user.yaml"), `${source("de")}# stale\n`),
    ({ primary }) => write(join(primary, ".claude", "pipeline.yaml"), runtime("en")),
  ]) {
    withFixture({}, (fixtureValue) => {
      mutation(fixtureValue);
      const result = fixtureValue.validateProfile();
      assert.equal(result.ok, false);
      assert.ok(["PO-PROFILE-RECEIPT-INVALID", "PO-PROFILE-RECEIPT-STALE"].includes(result.code), JSON.stringify(result));
    });
  }
});

if (symlinkCapable) check("profile-only readback rejects symlinked receipt, source and runtime inputs", () => {
  withFixture({}, ({ base, receiptPath, validateProfile }) => {
    const outside = join(base, "outside-receipt.json");
    write(outside, readFileSync(receiptPath), 0o600);
    unlinkSync(receiptPath);
    symlinkSync(outside, receiptPath);
    assert.equal(validateProfile().code, "PO-PROFILE-RECEIPT-INVALID");
  });
  for (const relativePath of ["pipeline.user.yaml", ".claude/pipeline.yaml"]) {
    withFixture({}, ({ base, primary, validateProfile }) => {
      const target = join(primary, relativePath);
      const outside = join(base, `outside-${relativePath.replaceAll("/", "-")}`);
      write(outside, readFileSync(target));
      unlinkSync(target);
      symlinkSync(outside, target);
      assert.equal(validateProfile().code, "PO-PROFILE-RECEIPT-STALE");
    });
  }
});

check("profile-only readback follows the existing registered linked-worktree authority", () => {
  withFixture({ linkedLanguage: "en" }, ({ primary, receipt, validateProfile }) => {
    const linked = validateProfile();
    assert.equal(linked.ok, true, JSON.stringify(linked));
    assert.equal(linked.value.humanFacing, "de");
    assert.equal(linked.value.sourceSha256, receipt.sourceSha256);
    const unregistered = validateProfile({ registeredWorktreeRoots: [primary] });
    assert.equal(unregistered.ok, false);
    assert.equal(unregistered.code, "PO-GATE-WORKTREE-UNREGISTERED");
  });
});

check("profile-only failures and evidence never expose machine-local paths or raw profile bytes", () => {
  withFixture({ linkedLanguage: "en" }, ({ base, primary, current, receiptPath, validateProfile }) => {
    const validOutput = JSON.stringify(validateProfile());
    weakenReceiptPermissions(receiptPath);
    const failedOutput = JSON.stringify(validateProfile());
    for (const output of [validOutput, failedOutput]) {
      for (const forbidden of [base, primary, current, source("de"), runtime("de")]) {
        assert.equal(output.includes(forbidden), false);
      }
    }
  });
  withFixture({}, ({ base, primary }) => {
    const unavailable = validatePoGateProfileForRepository({ repoRoot: primary }, {
      spawn: () => { throw new Error(`private topology ${base}`); },
    });
    assert.equal(unavailable.code, "PO-PROFILE-AUTHORITY-UNAVAILABLE");
    assert.equal(JSON.stringify(unavailable).includes(base), false);
    assert.equal(JSON.stringify(unavailable).includes(primary), false);
  });
});

check("source, runtime, common receipt and one marked PRD form one valid authority", () => {
  withFixture({}, ({ validate }) => {
    const result = validate();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(Object.keys(result.value), [
      "schema",
      "humanFacing",
      "sourceSha256",
      "runtimeSha256",
      "receiptSha256",
      "repositoryFingerprint",
      "planPath",
      "planSha256",
      "specPath",
      "specSha256",
    ]);
    assert.equal(result.value.schema, "pipeline.po-gate-authority.v2");
    assert.equal(result.value.humanFacing, "de");
    assert.equal(result.value.planPath, "specs/feature/prd_feature.md");
    assert.match(result.value.planSha256, /^[0-9a-f]{64}$/u);
    assert.equal(result.value.specPath, "specs/feature/spec.md");
    assert.equal(result.value.specSha256, sha256(spec()));
  });
});

check("pipeline-start can validate the shared profile when no feature is active", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, ".claude", "pipeline-state.json"), `${JSON.stringify({ schema: "pipeline.state.v0" }, null, 2)}\n`);
    const result = validate();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.humanFacing, "de");
    assert.equal(Object.prototype.hasOwnProperty.call(result.value, "planPath"), false);
    assert.equal(validate({ expectedPlanSha256: "0".repeat(64) }).code, "PO-GATE-PLAN-DIGEST-STALE");
  });
});

check("an internally consistent legacy linked-worktree language cannot override the primary receipt", () => {
  withFixture({ linkedLanguage: "en" }, ({ current, receipt, validate }) => {
    write(join(current, "specs", "feature", "prd_feature.md"), prd("de"));
    const result = validate();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.humanFacing, "de");
    assert.equal(result.value.sourceSha256, receipt.sourceSha256);
    assert.equal(result.value.runtimeSha256, receipt.runtimeSha256);
  });
});

check("a stale primary projection invalidates the common receipt", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "pipeline.user.yaml"), `${source("de")}# changed\n`);
    const result = validate();
    assert.equal(result.ok, false);
    assert.equal(result.code, "PO-PROFILE-RECEIPT-STALE");
  });
});

check("missing, non-0600 and noncanonical receipts all fail closed with repair guidance", () => {
  for (const mutation of [
    ({ receiptPath }) => unlinkSync(receiptPath),
    ({ receiptPath }) => weakenReceiptPermissions(receiptPath),
    ({ receiptPath, receipt }) => writeFileSync(receiptPath, JSON.stringify(receipt)),
  ]) {
    withFixture({}, (f) => {
      mutation(f);
      const result = f.validate();
      assert.equal(result.ok, false);
      assert.equal(result.code, "PO-PROFILE-RECEIPT-INVALID");
      assert.match(result.repair, /setup\.mjs --publish-po-profile/u);
    });
  }
});

if (symlinkCapable) check("symlinked receipt leaves and parents fail before receipt content is trusted", () => {
  withFixture({}, ({ base, receiptPath, validate }) => {
    const alternate = join(base, "alternate-receipt.json");
    write(alternate, readFileSync(receiptPath));
    unlinkSync(receiptPath);
    symlinkSync(alternate, receiptPath);
    assert.equal(validate().code, "PO-PROFILE-RECEIPT-INVALID");
  });
  withFixture({}, ({ base, common, receiptPath, validate }) => {
    const receiptDirectory = dirname(receiptPath);
    const alternateDirectory = join(base, "alternate-receipt-directory");
    mkdirSync(alternateDirectory, { recursive: true });
    write(join(alternateDirectory, "profile-receipt.json"), readFileSync(receiptPath), 0o600);
    rmSync(receiptDirectory, { recursive: true, force: true });
    symlinkSync(alternateDirectory, join(common, "agent-pipeline", "po-gate"));
    assert.equal(validate().code, "PO-PROFILE-RECEIPT-INVALID");
  });
});

check("a relocated primary root or mismatched repository fingerprint makes the receipt stale", () => {
  withFixture({}, ({ base, receiptPath, receipt, validate }) => {
    const changed = { ...receipt, canonicalPrimaryRoot: join(base, "old-primary") };
    writeFileSync(receiptPath, serializePoGateProfileReceipt(changed));
    chmodSync(receiptPath, 0o600);
    const result = validate();
    assert.equal(result.ok, false);
    assert.equal(result.code, "PO-PROFILE-RECEIPT-STALE");
  });
});

check("zero and multiple child PRDs fail exact active-directory cardinality", () => {
  withFixture({}, ({ primary, validate }) => {
    unlinkSync(join(primary, "specs", "feature", "prd_feature.md"));
    assert.equal(validate().code, "PO-GATE-PRD-CARDINALITY");
  });
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_child.md"), prd("de"));
    assert.equal(validate().code, "PO-GATE-PRD-CARDINALITY");
  });
});

check("spec, design and SDP artifacts do not affect PRD cardinality", () => {
  withFixture({}, ({ primary, validate }) => {
    for (const name of ["spec_child.md", "design_child.md", "sdp_child.md"]) {
      write(join(primary, "specs", "feature", name), "# Internal\n");
    }
    assert.equal(validate().ok, true);
  });
});

check("a wrong planPath and a traversal path cannot become PRD authority", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, ".claude", "pipeline-state.json"), state("specs/feature/prd_other.md"));
    assert.equal(validate().code, "PO-GATE-PLAN-PATH-MISMATCH");
  });
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, ".claude", "pipeline-state.json"), state("specs/feature/../other/prd_other.md"));
    assert.equal(validate().code, "PO-GATE-ACTIVE-FEATURE-INVALID");
  });
  for (const value of ["/tmp/prd_feature.md", "C:/prd_feature.md", "specs\\feature\\prd_feature.md"]) {
    assert.equal(normalizeRepositoryPath(value), null);
  }
});

check("an unregistered current checkout cannot borrow the primary authority", () => {
  withFixture({ linkedLanguage: "de" }, ({ primary, validate }) => {
    const result = validate({ registeredWorktreeRoots: [primary] });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PO-GATE-WORKTREE-UNREGISTERED");
  });
});

if (symlinkCapable) check("symlinked feature directories and PRD leaves fail physical-path validation", () => {
  withFixture({}, ({ base, primary, validate }) => {
    const feature = join(primary, "specs", "feature");
    const outside = join(base, "outside-feature");
    rmSync(feature, { recursive: true, force: true });
    mkdirSync(outside, { recursive: true });
    write(join(outside, "prd_feature.md"), prd("de"));
    symlinkSync(outside, feature);
    assert.equal(validate().code, "PO-GATE-FEATURE-PATH-INVALID");
  });
  withFixture({}, ({ base, primary, validate }) => {
    const plan = join(primary, "specs", "feature", "prd_feature.md");
    const outside = join(base, "outside-prd.md");
    unlinkSync(plan);
    write(outside, prd("de"));
    symlinkSync(outside, plan);
    assert.equal(validate().code, "PO-GATE-FEATURE-PATH-INVALID");
  });
});

check("missing, duplicate and wrong-language markers fail before approval", () => {
  for (const content of [
    "# PRD\n",
    `${prd("de")}${PO_GATE_PRD_LANGUAGE_MARKER("de")}\n`,
    prd("en"),
  ]) {
    withFixture({}, ({ primary, validate }) => {
      write(join(primary, "specs", "feature", "prd_feature.md"), content);
      assert.equal(validate().code, "PO-GATE-PRD-LANGUAGE-MISMATCH");
    });
  }
});

check("the technical Spec marker has closed single-line lowercase grammar", () => {
  const digest = sha256(spec());
  const validLanguage = PO_GATE_PRD_LANGUAGE_MARKER("de");
  for (const content of [
    `${validLanguage}\n# PRD\n`,
    `${validLanguage}\n${TECHNICAL_SPEC_MARKER(digest)}\n${TECHNICAL_SPEC_MARKER(digest)}\n# PRD\n`,
    `${validLanguage}\n${TECHNICAL_SPEC_MARKER(digest.toUpperCase())}\n# PRD\n`,
    `${validLanguage}\nprefix ${TECHNICAL_SPEC_MARKER(digest)}\n# PRD\n`,
    `${validLanguage}\n<!-- technical-spec-sha256: ${digest.slice(0, 32)}\n${digest.slice(32)} -->\n# PRD\n`,
  ]) {
    withFixture({}, ({ primary, validate }) => {
      write(join(primary, "specs", "feature", "prd_feature.md"), content);
      const result = validate();
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, "PO-GATE-PRD-SPEC-MISMATCH");
    });
  }
});

check("technical Spec marker binds the neighboring spec.md bytes and detects drift", () => {
  withFixture({}, ({ primary, validate }) => {
    const initial = validate();
    assert.equal(initial.ok, true, JSON.stringify(initial));
    assert.equal(initial.value.specSha256, sha256(spec()));
    write(join(primary, "specs", "feature", "spec.md"), spec("# Technical Spec\nchanged\n"));
    const drift = validate();
    assert.equal(drift.ok, false, JSON.stringify(drift));
    assert.equal(drift.code, "PO-GATE-PRD-SPEC-MISMATCH");
  });
});

check("invalid UTF-8 in the primary profile or PRD text fails closed", () => {
  withFixture({ linkedLanguage: "de" }, ({ primary, validate }) => {
    write(join(primary, "pipeline.user.yaml"), Buffer.from([0xff, 0xfe]));
    assert.equal(validate().code, "PO-PROFILE-RECEIPT-STALE");
  });
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_feature.md"), Buffer.from([0xff, 0xfe]));
    assert.equal(validate().code, "PO-GATE-PRD-LANGUAGE-MISMATCH");
  });
});

check("a bound plan digest detects a stale post-validation PRD", () => {
  withFixture({}, ({ validate }) => {
    const first = validate();
    assert.equal(first.ok, true);
    assert.equal(validate({ expectedPlanSha256: first.value.planSha256 }).ok, true);
    assert.equal(validate({ expectedPlanSha256: "0".repeat(64) }).code, "PO-GATE-PLAN-DIGEST-STALE");
  });
});

check("approve-plan binds the validated PO authority and revalidates it inside the writer lock", () => {
  withFixture({}, ({ primary, validate }) => {
    const authority = validate();
    assert.equal(authority.ok, true);
    const calls = [];
    const status = runPipelineState(["approve-plan", "--by", "Product Owner"], {
      dir: primary,
      now: () => NOW,
      poGateAuthority(request) {
        calls.push(request);
        return authority;
      },
    });
    assert.equal(status, 0);
    assert.deepEqual(calls, [
      { repoRoot: primary },
      { repoRoot: primary, expectedPlanSha256: authority.value.planSha256, expectedSpecSha256: authority.value.specSha256 },
    ]);
    const observed = JSON.parse(readFileSync(join(primary, ".claude", "pipeline-state.json"), "utf8"));
    assert.equal(observed.planApproved, true);
    assert.deepEqual(observed.planApproval, {
      schema: "pipeline.plan-approval.v2",
      approvedBy: "Product Owner",
      approvedAt: NOW,
      specBoundBy: "Product Owner",
      specBoundAt: NOW,
      poGateAuthority: authority.value,
    });
  });
});

check("approve-plan leaves state unchanged when the plan digest becomes stale before commit", () => {
  withFixture({}, ({ primary, validate }) => {
    const authority = validate();
    assert.equal(authority.ok, true);
    const statePath = join(primary, ".claude", "pipeline-state.json");
    const before = readFileSync(statePath, "utf8");
    let calls = 0;
    const status = runPipelineState(["approve-plan", "--by", "Product Owner"], {
      dir: primary,
      now: () => NOW,
      poGateAuthority() {
        calls += 1;
        return calls === 1
          ? authority
          : { ok: false, code: "PO-GATE-PLAN-DIGEST-STALE" };
      },
    });
    assert.equal(status, 2);
    assert.equal(calls, 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  });
});

check("approve-plan leaves state unchanged when the initial worktree authority is invalid", () => {
  withFixture({}, ({ primary }) => {
    const statePath = join(primary, ".claude", "pipeline-state.json");
    const before = readFileSync(statePath, "utf8");
    const status = runPipelineState(["approve-plan", "--by", "Product Owner"], {
      dir: primary,
      now: () => NOW,
      poGateAuthority: () => ({ ok: false, code: "PO-PROFILE-RECEIPT-STALE" }),
    });
    assert.equal(status, 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  });
});

check("detached worktree porcelain is parsed without branch inference", () => {
  const oid = "a".repeat(40);
  // Real Git always emits worktree porcelain roots as full absolute paths -- with a
  // drive letter on native Windows (e.g. "D:/repo"), never a bare POSIX-style "/repo".
  const primaryRoot = process.platform === "win32" ? "D:/repo" : "/repo";
  const detachedRoot = process.platform === "win32" ? "D:/repo/branch/detached/x" : "/repo/branch/detached/x";
  const raw = `worktree ${primaryRoot}\0HEAD ${oid}\0branch refs/heads/main\0\0worktree ${detachedRoot}\0HEAD ${oid}\0detached\0\0`;
  const entries = parseGitWorktreeList(raw);
  assert.equal(entries.length, 2);
  assert.equal(selectPrimaryWorktree(entries).root, primaryRoot);
  assert.deepEqual(entries[1], { root: detachedRoot, head: oid, branch: null, detached: true });
  assert.equal(parseGitWorktreeList(`worktree relative\0HEAD ${oid}\0detached\0\0`), null);
});

check("topology accepts only a status-zero Git observation carrying the documented EPERM false-positive", () => {
  withFixture({ linkedLanguage: "en" }, ({ common, primary, current }) => {
    const oid = "a".repeat(40);
    const spawn = (_command, args) => {
      const error = Object.assign(new Error("sandbox false-positive"), { code: "EPERM" });
      if (args.join(" ") === "rev-parse --show-toplevel") return { status: 0, error, stdout: `${current}\n` };
      if (args.join(" ") === "rev-parse --path-format=absolute --git-common-dir") return { status: 0, error, stdout: `${common}\n` };
      if (args.join(" ") === "worktree list --porcelain -z") {
        return { status: 0, error, stdout: `worktree ${primary}\0HEAD ${oid}\0branch refs/heads/main\0\0worktree ${current}\0HEAD ${oid}\0detached\0\0` };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    };
    const topology = resolvePoGateRepositoryTopology(current, { spawn });
    assert.equal(topology.repoRoot, current);
    assert.equal(topology.primaryRoot, primary);
  });
});

check("topology still rejects EPERM unless Git reported an actual zero exit status and stdout", () => {
  withFixture({}, ({ current }) => {
    const spawn = () => ({ status: null, error: Object.assign(new Error("EPERM"), { code: "EPERM" }), stdout: `${current}\n` });
    assert.throws(() => resolvePoGateRepositoryTopology(current, { spawn }), /Git topology unavailable/u);
    const otherError = () => ({ status: 0, error: Object.assign(new Error("access denied"), { code: "EACCES" }), stdout: `${current}\n` });
    assert.throws(() => resolvePoGateRepositoryTopology(current, { spawn: otherError }), /Git topology unavailable/u);
  });
});

check("failures and public evidence never expose machine-specific absolute roots", () => {
  withFixture({ linkedLanguage: "en" }, ({ base, primary, current, validate }) => {
    const result = validate();
    const output = JSON.stringify(result);
    for (const secretPath of [base, primary, current]) assert.equal(output.includes(secretPath), false);
  });
  withFixture({}, ({ base, primary, current, validate }) => {
    const output = JSON.stringify(validate());
    for (const secretPath of [base, primary, current]) assert.equal(output.includes(secretPath), false);
  });
});

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 15000,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function git(cwd, ...args) {
  const result = run("git", args, cwd);
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

check("literal linked detached worktree uses the primary receipt without reconciling legacy profile bytes", () => {
  const base = mkdtempSync(join(tmpdir(), "po-gate-worktree-"));
  const primary = join(base, "repository");
  const linked = join(base, "linked detached");
  try {
    mkdirSync(primary, { recursive: true });
    git(primary, "init", "-b", "main");
    git(primary, "config", "user.name", "PO Gate Test");
    git(primary, "config", "user.email", "po-gate@example.invalid");
    populateRoot(primary, "de");
    git(primary, "add", ".");
    git(primary, "commit", "-m", "fixture");
    git(primary, "worktree", "add", "--detach", linked, "HEAD");
    // Real Git always emits --git-common-dir with "/" separators, even on native
    // Windows; production always realpathSync's this before use (which canonicalizes
    // to the host's own separator convention) -- match that here rather than feeding
    // raw git output straight into normalizeAbsolute's strict resolve(x)===x check.
    const commonRaw = realpathSync(git(primary, "rev-parse", "--path-format=absolute", "--git-common-dir"));
    publishReceipt(commonRaw, primary);

    write(join(linked, "pipeline.user.yaml"), source("en"));
    write(join(linked, ".claude", "pipeline.yaml"), runtime("en"));
    write(join(linked, "specs", "feature", "prd_feature.md"), prd("en"));
    const drift = run(process.execPath, [CHECKER], linked);
    assert.equal(drift.status, 2, drift.stdout);
    assert.match(drift.stderr, /PO-GATE-PRD-LANGUAGE-MISMATCH/u);
    assert.equal(drift.stderr.includes(primary), false);
    assert.equal(drift.stderr.includes(linked), false);

    write(join(linked, "specs", "feature", "prd_feature.md"), prd("de"));
    const valid = run(process.execPath, [CHECKER], linked);
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /PO gate authority valid: de; specs\/feature\/prd_feature\.md/u);
    assert.equal(valid.stdout.includes(primary), false);
    assert.equal(valid.stdout.includes(linked), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

process.stdout.write(`po-gate-authority: ${passed} checks passed\n`);
