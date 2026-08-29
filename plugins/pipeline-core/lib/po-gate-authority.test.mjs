#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

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
  PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
  PO_GATE_PRD_LANGUAGE_MARKER,
  PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH,
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  derivePoGateRepositoryFingerprintLegacy,
  normalizeRepositoryPath,
  poGateReceiptFingerprintMatches,
  parseGitWorktreeList,
  poGateProfileReceiptPath,
  resolvePoGateRepositoryTopology,
  selectPrimaryWorktree,
  serializePoGateProfileReceipt,
  validatePoGateAuthority,
  validatePoGateAuthorityForRepository,
  validatePoGateLanguageProjection,
  validatePoGateProfileReceipt,
  validatePoGateProfileForRepository,
} from "./po-gate-authority.mjs";
import { main as poGateProfileRepair } from "../scripts/po-gate-profile-repair.mjs";
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

function state(planPath = "specs/feature/prd_feature.md", documentLanguage = null) {
  return `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature", planPath, phase: "design" },
    planApproved: false,
    continuity: {
      schema: "pipeline.continuity.v0",
      featureId: "feature",
      revision: 0,
      runtime: documentLanguage === null
        ? { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }
        : { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null, documentLanguage },
      authority: {
        prd: { path: planPath, sha256: "a".repeat(64) },
        spec: { path: "specs/feature/spec.md", sha256: "b".repeat(64) },
        result: null,
      },
      queueHead: {
        packageId: "continuity-adoption",
        actionId: "review-active-feature",
        nextAction: "review",
        productRetryCount: 0,
        environmentRerouteCount: 0,
        dispatch: null,
      },
      blocker: null,
      acknowledgedFinal: null,
      resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
      recovery: null,
      decisionTxn: null,
      closeTransition: null,
      capacity: {
        concurrencyLimit: 4,
        reservedCriticSlots: 1,
        reservedRecoverySlots: 1,
        fallbackPolicy: "defer",
      },
    },
  }, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function spec(body = "# Technical Spec\n") {
  return body;
}

function prd(language, body = "# PRD\n", specBytes = spec()) {
  return `${PO_GATE_PRD_LANGUAGE_MARKER(language)}\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n${body}`;
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

check("a mixed project authority (neutral manifest present without neutral State while legacy State remains) fails the state authority closed instead of silently reading the legacy State", () => {
  withFixture({ linkedLanguage: "de" }, ({ current, validate }) => {
    // Adds a neutral manifest at `current` without a neutral State file, while the
    // legacy `.claude/pipeline-state.json` populated by `populateRoot` still exists --
    // this is exactly `project-authority.mjs`'s "mixed" status (reason: "neutral
    // authority has no neutral State while legacy lifecycle State remains").
    write(join(current, "project", "pipeline.yaml"), runtime("de"));
    const result = validate();
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-STATE-AUTHORITY-UNAVAILABLE");
  });
});

check("a missing project authority (no legacy or neutral manifest at the current checkout) fails the state authority closed", () => {
  withFixture({ linkedLanguage: "de" }, ({ current, validate }) => {
    // Removing the legacy authority tree at `current` with no neutral tree ever
    // created there reproduces `project-authority.mjs`'s "missing" status.
    rmSync(join(current, ".claude"), { recursive: true, force: true });
    const result = validate();
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-STATE-AUTHORITY-UNAVAILABLE");
  });
});

check("validatePoGateAuthorityForRepository propagates the fail-closed state authority code for a mixed project authority", () => {
  withFixture({ linkedLanguage: "de" }, ({ current, primary, common }) => {
    write(join(current, "project", "pipeline.yaml"), runtime("de"));
    const topology = {
      repoRoot: current,
      gitCommonDir: common,
      primaryRoot: primary,
      registeredWorktreeRoots: [primary, current],
    };
    const result = validatePoGateAuthorityForRepository({ repoRoot: current }, { topology });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-STATE-AUTHORITY-UNAVAILABLE");
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

// GF-070: a hosted project's document language (continuity.runtime.documentLanguage)
// stands in for the operator-facing profile language ONLY for the PRD marker
// check, and only when set -- the operator-facing axis (profileEvidence.humanFacing,
// reported back as result.value.humanFacing) never moves.
check("a documentLanguage marker admits a non-de/en PRD without moving the operator-facing profile", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, ".claude", "pipeline-state.json"), state("specs/feature/prd_feature.md", "fr"));
    write(join(primary, "specs", "feature", "prd_feature.md"), prd("fr"));
    const result = validate();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.humanFacing, "de");
  });
});

check("without a documentLanguage marker, the PRD language must still equal the operator-facing profile", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_feature.md"), prd("fr"));
    assert.equal(validate().code, "PO-GATE-PRD-LANGUAGE-MISMATCH");
  });
});

check("the technical Spec marker has closed single-line lowercase grammar", () => {
  // Every case here has zero or two recognisable markers, never exactly one
  // with a wrong value -- so each is the "absent, or not exactly once" class
  // (A1-PROMOGATE AC-8), not the "present once but disagrees" class.
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
      assert.equal(result.code, "PO-GATE-PRD-SPEC-MARKER-MISSING");
    });
  }
});

// 2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md: the PO's own
// plan acknowledgement is a third, independent precondition (additive to the
// two marker checks above), so it gets the same "absent, or not exactly once"
// closed-grammar proof the technical Spec marker gets immediately above.
// Enforcement only fires during an ACTIVE approval/rebind validation (a
// non-undefined expectedPlanSha256/expectedSpecSha256), never during a
// passive diagnostic read, so this scenario must exercise the active path.
check("the PO plan acknowledgement marker must be present exactly once", () => {
  const validLanguage = PO_GATE_PRD_LANGUAGE_MARKER("de");
  const specMarker = TECHNICAL_SPEC_MARKER(sha256(spec()));
  for (const content of [
    `${validLanguage}\n${specMarker}\n# PRD\n`,
    `${validLanguage}\n${specMarker}\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n# PRD\n`,
  ]) {
    withFixture({}, ({ primary, validate }) => {
      write(join(primary, "specs", "feature", "prd_feature.md"), content);
      const result = validate({ expectedPlanSha256: "a".repeat(64), expectedSpecSha256: "b".repeat(64) });
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, "PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING", JSON.stringify(result));
    });
  }
});

check("a PRD carrying the language marker, the Spec marker and the acknowledgement marker exactly once each passes", () => {
  withFixture({}, ({ validate }) => {
    const result = validate();
    assert.equal(result.ok, true, JSON.stringify(result));
  });
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

// NVA-POGATEAUTH-1: the spec-digest positive case was previously proven only in
// combination with a matching plan digest (approve-plan's own writer-lock
// revalidation below). Isolate it here so a bound Spec digest is proven to
// succeed on its own, exactly as the plan-digest positive case above already is.
check("a bound Spec digest alone accepts the current PRD's neighboring spec.md", () => {
  withFixture({}, ({ validate }) => {
    const first = validate();
    assert.equal(first.ok, true);
    assert.equal(validate({ expectedSpecSha256: first.value.specSha256 }).ok, true);
    assert.equal(validate({ expectedSpecSha256: "0".repeat(64) }).code, "PO-GATE-PRD-SPEC-MISMATCH");
  });
});

function submitFixturePlan(primary, authority, profile) {
  const status = runPipelineState(["submit-plan", "--by", "coordinator", "--profile", "feature"], {
    dir: primary,
    now: () => NOW,
    poGateAuthority: () => authority,
    poGateProfile: () => profile,
  });
  assert.equal(status, 0);
  // NVA-R22-PLANSHOWN: approve-plan now refuses an approval of unseen content
  // -- a prior present-plan record bound to this exact submission is required.
  const presented = runPipelineState(["present-plan", "--by", "coordinator"], {
    dir: primary,
    now: () => NOW,
  });
  assert.equal(presented, 0);
}

check("approve-plan binds the validated PO authority and revalidates it inside the writer lock", () => {
  withFixture({}, ({ primary, validate, validateProfile }) => {
    const authority = validate();
    assert.equal(authority.ok, true);
    const profile = validateProfile();
    assert.equal(profile.ok, true);
    submitFixturePlan(primary, authority, profile);
    const calls = [];
    const status = runPipelineState(["approve-plan", "--by", "Product Owner"], {
      dir: primary,
      now: () => NOW,
      poGateProfile: () => profile,
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
    assert.equal(observed.planSubmission.schema, "pipeline.plan-submission.v1");
    assert.equal(observed.planApproval.schema, "pipeline.plan-approval.v4");
    assert.equal(observed.planApproval.approvedBy, "Product Owner");
    assert.equal(observed.planApproval.approvedAt, NOW);
    assert.match(observed.planApproval.submissionSha256, /^[a-f0-9]{64}$/u);
    assert.equal(observed.planApproval.profileSha256, observed.planSubmission.profileSha256);
    assert.equal(observed.planApproval.priorInvalidationSha256, null);
    assert.deepEqual(observed.planApproval.poGateAuthority, authority.value);
  });
});

check("approve-plan leaves state unchanged when the plan digest becomes stale before commit", () => {
  withFixture({}, ({ primary, validate, validateProfile }) => {
    const authority = validate();
    assert.equal(authority.ok, true);
    const profile = validateProfile();
    assert.equal(profile.ok, true);
    submitFixturePlan(primary, authority, profile);
    const statePath = join(primary, ".claude", "pipeline-state.json");
    const before = readFileSync(statePath, "utf8");
    let calls = 0;
    const status = runPipelineState(["approve-plan", "--by", "Product Owner"], {
      dir: primary,
      now: () => NOW,
      poGateProfile: () => profile,
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
  withFixture({}, ({ primary, validate, validateProfile }) => {
    const authority = validate();
    assert.equal(authority.ok, true);
    const profile = validateProfile();
    assert.equal(profile.ok, true);
    submitFixturePlan(primary, authority, profile);
    const statePath = join(primary, ".claude", "pipeline-state.json");
    const before = readFileSync(statePath, "utf8");
    const status = runPipelineState(["approve-plan", "--by", "Product Owner"], {
      dir: primary,
      now: () => NOW,
      poGateProfile: () => profile,
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
  assert.deepEqual(entries[1], { root: detachedRoot, head: oid, branch: null, detached: true, prunable: false });
  assert.equal(parseGitWorktreeList(`worktree relative\0HEAD ${oid}\0detached\0\0`), null);
});

check("parseGitWorktreeList surfaces the prunable state per entry without dropping the record or its validation", () => {
  const oid = "a".repeat(40);
  const primaryRoot = process.platform === "win32" ? "D:/repo" : "/repo";
  const staleRoot = process.platform === "win32" ? "D:/repo/stale" : "/repo/stale";
  const raw = `worktree ${primaryRoot}\0HEAD ${oid}\0branch refs/heads/main\0\0worktree ${staleRoot}\0HEAD ${oid}\0detached\0prunable gitdir file points to non-existent location\0\0`;
  const entries = parseGitWorktreeList(raw);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].prunable, false, "a live entry must not be reported as prunable");
  assert.equal(entries[1].prunable, true, "a prunable entry must surface prunable: true, never be dropped");
  assert.equal(entries[1].root, staleRoot, "the prunable entry's root must still be reported");
  // The reason text after `prunable ` is Git's own and not a stable contract --
  // only the field's presence is the signal, per the module contract above.
  const differentReason = raw.replace(
    "prunable gitdir file points to non-existent location",
    "prunable ??? some other future Git reason ???",
  );
  assert.equal(parseGitWorktreeList(differentReason)[1].prunable, true);
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

check("a prunable worktree registration is excluded from registeredWorktreeRoots without aborting topology resolution", () => {
  withFixture({ linkedLanguage: "en" }, ({ common, primary, current }) => {
    const oid = "a".repeat(40);
    const staleRoot = process.platform === "win32" ? "D:/pipeline-stale/prunable" : "/pipeline-stale/prunable";
    const spawn = (_command, args) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return { status: 0, stdout: `${current}\n` };
      if (args.join(" ") === "rev-parse --path-format=absolute --git-common-dir") return { status: 0, stdout: `${common}\n` };
      if (args.join(" ") === "worktree list --porcelain -z") {
        return {
          status: 0,
          // primary first (as Git always emits it), then the live linked worktree,
          // then a prunable registration whose directory does not exist on disk --
          // the fix must never call realpathSync/assertPhysicalDirectory on it.
          stdout: `worktree ${primary}\0HEAD ${oid}\0branch refs/heads/main\0\0worktree ${current}\0HEAD ${oid}\0detached\0\0worktree ${staleRoot}\0HEAD ${oid}\0detached\0prunable gitdir file points to non-existent location\0\0`,
        };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    };
    const topology = resolvePoGateRepositoryTopology(current, { spawn });
    // (d) the primary worktree is still selected correctly even though a prunable
    // entry follows it in the porcelain list.
    assert.equal(topology.primaryRoot, primary);
    // (b) a mixed live+prunable set resolves to exactly the live roots.
    assert.deepEqual(topology.registeredWorktreeRoots, [primary, current]);
    assert.equal(topology.worktrees.length, 3);
    assert.equal(topology.worktrees[2].root, staleRoot);
    assert.equal(topology.worktrees[2].prunable, true);
  });
});

check("a stale worktree registration that Git has NOT marked prunable still throws (fail-closed baseline preserved)", () => {
  withFixture({ linkedLanguage: "en" }, ({ common, primary, current }) => {
    const oid = "a".repeat(40);
    const staleRoot = process.platform === "win32" ? "D:/pipeline-stale/not-prunable" : "/pipeline-stale/not-prunable";
    const spawn = (_command, args) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return { status: 0, stdout: `${current}\n` };
      if (args.join(" ") === "rev-parse --path-format=absolute --git-common-dir") return { status: 0, stdout: `${common}\n` };
      if (args.join(" ") === "worktree list --porcelain -z") {
        return {
          status: 0,
          stdout: `worktree ${primary}\0HEAD ${oid}\0branch refs/heads/main\0\0worktree ${current}\0HEAD ${oid}\0detached\0\0worktree ${staleRoot}\0HEAD ${oid}\0detached\0\0`,
        };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    };
    // (c) no `prunable` field means the entry is still fed into the unrelaxed
    // physical-directory assertion, exactly as before this fix -- this is the
    // security property that must not be relaxed.
    assert.throws(() => resolvePoGateRepositoryTopology(current, { spawn }), /ENOENT/u);
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

function flipAsciiCase(value) {
  return [...value].map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join("");
}

if (process.platform === "win32") check("topology tolerates a case-divergent start directory that is the same real Windows directory Git reports", () => {
  withFixture({ linkedLanguage: "en" }, ({ common, primary, current }) => {
    const oid = "a".repeat(40);
    // Disk-canonical casing for the fixture's real directory, exactly as Git's own
    // `--show-toplevel` would report it regardless of the cwd casing it was invoked with.
    const canonicalCurrent = realpathSync.native(current);
    // A same-directory path a mis-cased shell cwd could plausibly hand in as `repoRoot`.
    const misCasedRepoRoot = flipAsciiCase(current);
    assert.notEqual(misCasedRepoRoot, current, "fixture requires an actually case-divergent path to be meaningful");
    const spawn = (_command, args) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return { status: 0, stdout: `${canonicalCurrent}\n` };
      if (args.join(" ") === "rev-parse --path-format=absolute --git-common-dir") return { status: 0, stdout: `${common}\n` };
      if (args.join(" ") === "worktree list --porcelain -z") {
        return { status: 0, stdout: `worktree ${primary}\0HEAD ${oid}\0branch refs/heads/main\0\0worktree ${current}\0HEAD ${oid}\0detached\0\0` };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    };
    const topology = resolvePoGateRepositoryTopology(misCasedRepoRoot, { spawn });
    // Compare through the native realpath on both sides -- the returned strings
    // themselves may legitimately still carry the caller's casing (the fix never
    // rewrites returned values), only the equality check is case-normalized.
    assert.equal(realpathSync.native(topology.repoRoot), canonicalCurrent);
    assert.equal(realpathSync.native(topology.primaryRoot), realpathSync.native(primary));
    assert.equal(realpathSync.native(topology.gitCommonDir), realpathSync.native(common));
  });
});

check("topology still rejects a genuinely different physical directory even though both sides are real, existing paths", () => {
  const dirA = mkdtempSync(join(tmpdir(), "po-gate-authority-mismatch-alpha-"));
  const dirB = mkdtempSync(join(tmpdir(), "po-gate-authority-mismatch-beta-"));
  try {
    const spawn = (_command, args) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return { status: 0, stdout: `${dirB}\n` };
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    };
    assert.throws(() => resolvePoGateRepositoryTopology(dirA, { spawn }), /repository root mismatch/u);
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
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

// --- Operator-facing language is the PO's own setting (ADR-0011) -------------
//
// A consumer project is its own Git repository: it has the plugin but no
// setup.mjs, and its primary checkout is its own, not the Pipeline's. These
// checks exercise the correction route exactly as such a PO reaches it.

/** The realistic source form: the generated pipeline.user.yaml quotes and comments this scalar. */
function quotedSource(language) {
  return `schema: pipeline.user.v1\nlanguage:\n  human_facing: "${language}"  # operator-facing surface\n  agent_facing: "en"\n`;
}

function consumerProject(language) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "po-gate-consumer-")));
  const root = join(base, "consumer-project");
  mkdirSync(root, { recursive: true });
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "PO Gate Test");
  git(root, "config", "user.email", "po-gate@example.invalid");
  populateRoot(root, language);
  write(join(root, "pipeline.user.yaml"), quotedSource(language));
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture");
  return { base, root };
}

function withConsumerProject(language, fn) {
  const project = consumerProject(language);
  try {
    return fn(project);
  } finally {
    rmSync(project.base, { recursive: true, force: true });
  }
}

function repair(argv) {
  let stdout = "";
  const status = poGateProfileRepair(argv, (chunk) => { stdout += chunk; });
  return { status, stdout };
}

function repairJson(argv) {
  const result = repair(argv);
  return { ...result, value: JSON.parse(result.stdout) };
}

function userYaml(root) {
  return readFileSync(join(root, "pipeline.user.yaml"), "utf8");
}

function runtimeYaml(root) {
  return readFileSync(join(root, ".claude", "pipeline.yaml"), "utf8");
}

check("the operator-facing language is correctable from a consumer project's own primary checkout", () => {
  withConsumerProject("en", ({ root }) => {
    assert.notEqual(root, REPO_ROOT);
    assert.equal(validatePoGateProfileForRepository({ repoRoot: root }).ok, false);

    const plan = repairJson(["plan", "--root", root, "--human-facing", "de"]);
    assert.equal(plan.status, 0, plan.stdout);
    assert.deepEqual(
      { from: plan.value.languageChange.from, to: plan.value.languageChange.to },
      { from: "en", to: "de" },
    );
    assert.equal(plan.value.profile.humanFacing, "en");
    assert.equal(userYaml(root), quotedSource("en"));

    const applied = repairJson([
      "apply", "--root", root, "--human-facing", "de", "--plan-sha256", plan.value.planSha256, "--activate",
    ]);
    assert.equal(applied.status, 0, applied.stdout);
    assert.equal(applied.value.code, "PO-PROFILE-REPAIR-APPLIED");
    assert.equal(applied.value.humanFacing, "de");

    // Only the one scalar moves: quoting, the trailing comment and agent_facing survive.
    assert.equal(userYaml(root), quotedSource("de"));
    assert.equal(runtimeYaml(root), runtime("de"));
    const profile = validatePoGateProfileForRepository({ repoRoot: root });
    assert.equal(profile.ok, true, JSON.stringify(profile));
    assert.equal(profile.value.humanFacing, "de");
  });
});

check("a corrected consumer project accepts an honestly marked PRD and refuses a wrongly marked one", () => {
  withConsumerProject("en", ({ root }) => {
    const plan = repairJson(["plan", "--root", root, "--human-facing", "de"]);
    assert.equal(repair([
      "apply", "--root", root, "--human-facing", "de", "--plan-sha256", plan.value.planSha256, "--activate",
    ]).status, 0);

    write(join(root, "specs", "feature", "prd_feature.md"), prd("de"));
    const honest = validatePoGateAuthorityForRepository({ repoRoot: root });
    assert.equal(honest.ok, true, JSON.stringify(honest));
    assert.equal(honest.value.humanFacing, "de");

    write(join(root, "specs", "feature", "prd_feature.md"), prd("en"));
    const contradicting = validatePoGateAuthorityForRepository({ repoRoot: root });
    assert.equal(contradicting.ok, false);
    assert.equal(contradicting.code, "PO-GATE-PRD-LANGUAGE-MISMATCH");
  });
});

check("the marker grammar stays closed and single-line after the language is corrected", () => {
  withConsumerProject("en", ({ root }) => {
    const plan = repairJson(["plan", "--root", root, "--human-facing", "de"]);
    assert.equal(repair([
      "apply", "--root", root, "--human-facing", "de", "--plan-sha256", plan.value.planSha256, "--activate",
    ]).status, 0);
    const specBytes = spec();
    const marker = PO_GATE_PRD_LANGUAGE_MARKER("de");
    for (const content of [
      // missing, duplicated, wrong-language, prefixed, uppercased, split over two lines
      `${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
      `${prd("de")}${marker}\n`,
      prd("en"),
      `prefix ${marker}\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
      `<!-- po-language: DE -->\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
      `<!-- po-language:\nde -->\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
    ]) {
      write(join(root, "specs", "feature", "prd_feature.md"), content);
      const result = validatePoGateAuthorityForRepository({ repoRoot: root });
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, "PO-GATE-PRD-LANGUAGE-MISMATCH", JSON.stringify(result));
    }
  });
});

check("republication without --human-facing keeps the English-configured project exactly as it is today", () => {
  withConsumerProject("en", ({ root }) => {
    const before = { source: userYaml(root), runtime: runtimeYaml(root) };
    const plan = repairJson(["plan", "--root", root]);
    assert.equal(plan.status, 0, plan.stdout);
    assert.equal(Object.prototype.hasOwnProperty.call(plan.value, "languageChange"), false);
    assert.equal(plan.value.profile.humanFacing, "en");
    assert.equal(plan.value.applyAction.argv.includes("--human-facing"), false);

    const applied = repairJson(["apply", "--root", root, "--plan-sha256", plan.value.planSha256, "--activate"]);
    assert.equal(applied.status, 0, applied.stdout);
    assert.equal(applied.value.code, "PO-PROFILE-REPAIR-APPLIED");
    assert.equal(Object.prototype.hasOwnProperty.call(applied.value, "humanFacing"), false);
    assert.deepEqual({ source: userYaml(root), runtime: runtimeYaml(root) }, before);
    assert.equal(validatePoGateProfileForRepository({ repoRoot: root }).value.humanFacing, "en");
  });
});

check("the language route refuses unsupported values and every ambiguous language scalar", () => {
  withConsumerProject("en", ({ root }) => {
    const unsupported = repair(["plan", "--root", root, "--human-facing", "fr"]);
    assert.equal(unsupported.status, 64);
    assert.match(unsupported.stdout, /usage:/u);
    for (const [sourceBytes, code] of [
      [`schema: pipeline.user.v1\nlanguage:\n  human_facing: en\n  human_facing: de\n  agent_facing: en\n`, "PO-PROFILE-LANGUAGE-SCALAR-AMBIGUOUS"],
      [`schema: pipeline.user.v1\nagent:\n  human_facing: en\n`, "PO-PROFILE-LANGUAGE-BLOCK-MISSING"],
      [`schema: pipeline.user.v1\nlanguage:\n  human_facing: en\nother: 1\nlanguage:\n  human_facing: en\n`, "PO-PROFILE-LANGUAGE-BLOCK-AMBIGUOUS"],
      [`schema: pipeline.user.v1\nlanguage:\n  human_facing: "en\n  agent_facing: en\n`, "PO-PROFILE-LANGUAGE-SCALAR-AMBIGUOUS"],
    ]) {
      write(join(root, "pipeline.user.yaml"), sourceBytes);
      const result = repairJson(["plan", "--root", root, "--human-facing", "de"]);
      assert.equal(result.status, 2, result.stdout);
      assert.equal(result.value.status, "unavailable");
      assert.equal(result.value.code, code, result.stdout);
    }
  });
});

check("a stale plan digest is rejected before any language byte is written", () => {
  withConsumerProject("en", ({ root }) => {
    const before = { source: userYaml(root), runtime: runtimeYaml(root) };
    const stale = repairJson([
      "apply", "--root", root, "--human-facing", "de", "--plan-sha256", "c".repeat(64), "--activate",
    ]);
    assert.equal(stale.status, 2);
    assert.equal(stale.value.code, "PO-PROFILE-REPAIR-PLAN-STALE");
    assert.deepEqual({ source: userYaml(root), runtime: runtimeYaml(root) }, before);
    assert.equal(validatePoGateProfileForRepository({ repoRoot: root }).ok, false);
  });
});

check("profile repair guidance names a route a consumer project can actually run", () => {
  withFixture({}, ({ receiptPath, validate }) => {
    unlinkSync(receiptPath);
    const { repair: guidance } = validate();
    assert.match(guidance, /setup\.mjs --publish-po-profile/u);
    assert.match(guidance, /po-gate-profile-repair\.mjs/u);
    assert.match(guidance, /--human-facing <de\|en>/u);
  });
});

// --- The refusal names the route that resolves its own cause ----------------
//
// A PRD language marker that disagrees with the configured language is not a
// plan-path defect. The PO who hits it has exactly two legitimate resolutions:
// change the configured language to match the document, or change the marker to
// match the configuration. Guidance about `activeFeature.planPath` and child
// PRDs addresses neither, and the seeded dev-plan gate now blocks rather than
// warns, so this refusal is on the only path to `submit-plan`.

check("a language-mismatched PRD is signposted to the operator-language route, not to plan-path repair", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_feature.md"), prd("en"));
    const result = validate();
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-PRD-LANGUAGE-MISMATCH", JSON.stringify(result));
    assert.match(result.repair, /po-gate-profile-repair\.mjs/u, JSON.stringify(result));
    assert.match(result.repair, /--human-facing <de\|en>/u, JSON.stringify(result));
    // The configured language and the exact marker the gate expects are named,
    // so the PO can see which of the two states is the one they disagree with.
    assert.ok(result.repair.includes(PO_GATE_PRD_LANGUAGE_MARKER("de")), JSON.stringify(result));
    // Both resolutions are visible, and the honest one -- correcting the
    // configuration -- is named before editing the marker, so the message never
    // reads as an instruction to mark the document inaccurately.
    assert.ok(result.repair.includes("correct the marker in the PRD"), JSON.stringify(result));
    assert.ok(
      result.repair.indexOf("--human-facing") < result.repair.indexOf("correct the marker in the PRD"),
      JSON.stringify(result),
    );
    // The unrelated repair is gone from this cause.
    assert.equal(/activeFeature\.planPath/u.test(result.repair), false, JSON.stringify(result));
  });
});

check("a documentLanguage-mismatched PRD is signposted to the marker, not to the operator-facing route", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, ".claude", "pipeline-state.json"), state("specs/feature/prd_feature.md", "fr"));
    write(join(primary, "specs", "feature", "prd_feature.md"), prd("en"));
    const result = validate();
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-PRD-LANGUAGE-MISMATCH", JSON.stringify(result));
    assert.equal(/operator-facing/u.test(result.repair), false, JSON.stringify(result));
    assert.equal(result.repair.includes("po-gate-profile-repair.mjs"), false, JSON.stringify(result));
    assert.ok(result.repair.includes(PO_GATE_PRD_LANGUAGE_MARKER("fr")), JSON.stringify(result));
    assert.ok(result.repair.includes("independently configured document language"), JSON.stringify(result));
    assert.ok(result.repair.includes("no separate command to change this after the fact"), JSON.stringify(result));
    assert.ok(result.repair.includes("correct the marker in the PRD"), JSON.stringify(result));
  });
});

check("the language guidance names an invocation the repair script itself accepts", () => {
  const guidance = withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_feature.md"), prd("en"));
    return validate().repair;
  });
  // The script's own usage line is the contract: every flag form the guidance
  // quotes must be a form the script actually parses.
  const usage = repair([]);
  assert.equal(usage.status, 64, usage.stdout);
  for (const token of ["--root <project-root>", "--human-facing <de|en>", "--plan-sha256 <sha256>", "--activate"]) {
    assert.ok(usage.stdout.includes(token), `${token} is not in the script usage: ${usage.stdout}`);
    assert.ok(guidance.includes(token), `${token} is not in the guidance: ${guidance}`);
  }
  assert.ok(
    guidance.includes("po-gate-profile-repair.mjs plan --root <project-root> --human-facing <de|en>"),
    guidance,
  );
  // And the apply step the guidance names is the one the plan step emits.
  withConsumerProject("en", ({ root }) => {
    const plan = repairJson(["plan", "--root", root, "--human-facing", "de"]);
    assert.equal(plan.status, 0, plan.stdout);
    assert.ok(
      plan.value.applyAction.argv[0].endsWith("po-gate-profile-repair.mjs"),
      "applyAction does not invoke the repair script named in the guidance",
    );
    assert.deepEqual(
      plan.value.applyAction.argv.slice(1),
      ["apply", "--root", root, "--human-facing", "de", "--plan-sha256", plan.value.planSha256, "--activate"],
    );
  });
});

check("a real plan-path defect still returns the plan-path repair, unchanged", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_second.md"), prd("de"));
    const result = validate();
    assert.equal(result.code, "PO-GATE-PRD-CARDINALITY", JSON.stringify(result));
    assert.equal(
      result.repair,
      "Repair activeFeature.planPath and the active feature directory; do not create child PRDs.",
      JSON.stringify(result),
    );
  });
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, ".claude", "pipeline-state.json"), state("specs/feature/prd_absent.md"));
    const result = validate();
    assert.equal(result.code, "PO-GATE-PLAN-PATH-MISMATCH", JSON.stringify(result));
    assert.match(result.repair, /Repair activeFeature\.planPath/u, JSON.stringify(result));
    assert.equal(/--human-facing/u.test(result.repair), false, JSON.stringify(result));
  });
});

check("missing, duplicate and malformed language markers still fail before approval", () => {
  const specBytes = spec();
  const marker = PO_GATE_PRD_LANGUAGE_MARKER("de");
  for (const content of [
    // missing, duplicated, other language, prefixed, uppercased, split over two lines
    `${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
    `${prd("de")}${marker}\n`,
    prd("en"),
    `prefix ${marker}\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
    `<!-- po-language: DE -->\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
    `<!-- po-language:\nde -->\n${TECHNICAL_SPEC_MARKER(sha256(specBytes))}\n# PRD\n`,
  ]) {
    withFixture({}, ({ primary, validate }) => {
      write(join(primary, "specs", "feature", "prd_feature.md"), content);
      const result = validate();
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, "PO-GATE-PRD-LANGUAGE-MISMATCH", JSON.stringify(result));
    });
  }
});

// REPAIRSTR-1: one repair string used to be attached to three unlike causes. A
// refusal that names the wrong remedy is load-bearing now that the seeded
// dev-plan gate blocks rather than warns -- an operator who follows plan-path
// guidance for a Spec-marker drift edits authority state to fix a document.
// Each remaining class below is signposted to the remedy that resolves it, and
// every genuine plan-path defect keeps PRD_REPAIR verbatim.

const PLAN_PATH_REPAIR = "Repair activeFeature.planPath and the active feature directory; do not create child PRDs.";

function captureStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map(String).join(" "));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return lines.join("\n");
}

check("a Spec-binding mismatch is signposted to spec.md and its marker, not to plan-path repair", () => {
  // Missing neighboring spec.md, and a marker that no longer matches its bytes.
  const cases = [
    ({ primary }) => unlinkSync(join(primary, "specs", "feature", "spec.md")),
    ({ primary }) => write(join(primary, "specs", "feature", "spec.md"), spec("# Technical Spec\ndrifted\n")),
  ];
  for (const mutate of cases) {
    withFixture({}, (value) => {
      mutate(value);
      const result = value.validate();
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, "PO-GATE-PRD-SPEC-MISMATCH", JSON.stringify(result));
      assert.match(result.repair, /spec\.md/u, JSON.stringify(result));
      // `<[!]--` rather than the literal `<!--`: in a JavaScript source, `<!--` is an
      // Annex B single-line comment opener, so a parser reading `/<!--` takes the `/`
      // as division and lets the comment swallow the rest of the line. Node's own
      // parser is fine with it; semgrep's is not, and reported the whole file as a
      // partial parse, which the security gate classifies as a scanner error. The
      // character class matches exactly the same text and cannot be mistaken for the
      // comment token.
      assert.match(result.repair, /<[!]-- technical-spec-sha256: <sha256-of-spec\.md> -->/u, JSON.stringify(result));
      // The unrelated remedy is gone, and the wrong edit it invited is named as
      // the thing NOT to do.
      assert.equal(result.repair.includes(PLAN_PATH_REPAIR), false, JSON.stringify(result));
      assert.match(result.repair, /do not change activeFeature\.planPath/u, JSON.stringify(result));
    });
  }
});

// A1-PROMOGATE AC-13: the missing-marker remedy is honest that no automated
// route exists once a promotion has already bound the PRD -- it must not
// invent one and must not name the rebind, because the rebind refuses that
// state (PO-REBIND-STATE, no existing approval to rebind).
check("an absent technical Spec marker is signposted to adding the line, and names no route for an already-bound PRD", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_feature.md"), `${PO_GATE_PRD_LANGUAGE_MARKER("de")}\n# PRD\n`);
    const result = validate();
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-PRD-SPEC-MARKER-MISSING", JSON.stringify(result));
    assert.match(result.repair, /<[!]-- technical-spec-sha256: <sha256-of-spec\.md> -->/u, JSON.stringify(result));
    assert.match(result.repair, /add that single line/u, JSON.stringify(result));
    assert.match(result.repair, /no sanctioned way to add the marker to an already-bound PRD/u, JSON.stringify(result));
    assert.equal(result.repair.includes(PLAN_PATH_REPAIR), false, JSON.stringify(result));
    assert.match(result.repair, /do not change activeFeature\.planPath/u, JSON.stringify(result));
    // No route is named for the already-bound state: it is not offered
    // because it is known to refuse there.
    assert.equal(/po-authority-rebind/u.test(result.repair), false, JSON.stringify(result));
  });
});

// 2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md: same honesty
// requirement as the technical Spec marker immediately above -- the repair
// must name the actual remedy (the PO adding the line after reviewing the
// PRD) and must not invent an already-bound-PRD route, because none exists.
// Active validation (non-undefined expected digests) is required for this
// check to fire at all.
check("an absent PO plan acknowledgement marker is signposted to the PO adding the line, and names no route for an already-bound PRD", () => {
  withFixture({}, ({ primary, validate }) => {
    write(
      join(primary, "specs", "feature", "prd_feature.md"),
      `${PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${TECHNICAL_SPEC_MARKER(sha256(spec()))}\n# PRD\n`,
    );
    const result = validate({ expectedPlanSha256: "a".repeat(64), expectedSpecSha256: "b".repeat(64) });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING", JSON.stringify(result));
    assert.match(result.repair, /po-plan-acknowledged: content-sound-and-spec-consistent/u, JSON.stringify(result));
    assert.match(result.repair, /PO's own record/u, JSON.stringify(result));
    assert.equal(result.repair.includes(PLAN_PATH_REPAIR), false, JSON.stringify(result));
    assert.match(result.repair, /Do not change activeFeature\.planPath/u, JSON.stringify(result));
    assert.equal(/po-authority-rebind/u.test(result.repair), false, JSON.stringify(result));
    // 2026-08-19 (Critic F1 fix): the acknowledge route now requires --by,
    // covered by the plan's own digest.
    assert.match(result.repair, /po-authority-acknowledge-plan --by/u, JSON.stringify(result));
    assert.match(result.repair, /--by is required and covered by the plan's own digest/u, JSON.stringify(result));
  });
});

check("the Spec guidance names a rebind route pipeline-state actually provides", () => {
  const guidance = withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "spec.md"), spec("# Technical Spec\ndrifted\n"));
    return validate().repair;
  });
  withFixture({}, ({ primary }) => {
    // The writer's own command list is the contract for the subcommand names ...
    const allowed = captureStderr(() => {
      assert.equal(runPipelineState(["po-authority-rebind-plan-typo"], { dir: primary, now: () => NOW }), 2);
    });
    for (const subcommand of ["po-authority-rebind-plan", "po-authority-rebind-apply"]) {
      assert.ok(allowed.includes(subcommand), `${subcommand} is not an allowed command: ${allowed}`);
      assert.ok(guidance.includes(`pipeline-state.mjs ${subcommand}`), `${subcommand} is not in the guidance: ${guidance}`);
    }
    // ... and its own usage line is the contract for the flag forms.
    const usage = captureStderr(() => {
      assert.equal(runPipelineState(["po-authority-rebind-apply"], { dir: primary, now: () => NOW }), 2);
    });
    for (const token of ["--plan-sha256 <sha256>", "--updated-at <ISO-8601>", "--activate"]) {
      assert.ok(usage.includes(token), `${token} is not in the writer usage: ${usage}`);
      assert.ok(guidance.includes(token), `${token} is not in the guidance: ${guidance}`);
    }
  });
});

// NVA-W4-2B: the absent-acknowledgement-marker guidance (ACKNOWLEDGEMENT_REPAIR)
// now names a sanctioned acknowledge route for an already-bound PRD -- mirror of
// the immediately preceding check for the Spec-marker rebind route, same
// contract: the writer's own command list is the source of truth for the
// subcommand names, and its own usage line is the source of truth for the flag
// forms, so the guidance text cannot silently drift from what pipeline-state.mjs
// actually accepts.
check("the acknowledgement guidance names an acknowledge route pipeline-state actually provides", () => {
  const guidance = withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_feature.md"), `${PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${TECHNICAL_SPEC_MARKER(sha256(spec()))}\n# PRD\n`);
    return validate({ expectedPlanSha256: "a".repeat(64), expectedSpecSha256: "b".repeat(64) }).repair;
  });
  withFixture({}, ({ primary }) => {
    // The writer's own command list is the contract for the subcommand names ...
    const allowed = captureStderr(() => {
      assert.equal(runPipelineState(["po-authority-acknowledge-plan-typo"], { dir: primary, now: () => NOW }), 2);
    });
    for (const subcommand of ["po-authority-acknowledge-plan", "po-authority-acknowledge-apply"]) {
      assert.ok(allowed.includes(subcommand), `${subcommand} is not an allowed command: ${allowed}`);
      assert.ok(guidance.includes(`pipeline-state.mjs ${subcommand}`), `${subcommand} is not in the guidance: ${guidance}`);
    }
    // ... and its own usage line is the contract for the flag forms.
    const usage = captureStderr(() => {
      assert.equal(runPipelineState(["po-authority-acknowledge-apply"], { dir: primary, now: () => NOW }), 2);
    });
    for (const token of ["--plan-sha256 <sha256>", "--updated-at <ISO-8601>", "--activate"]) {
      assert.ok(usage.includes(token), `${token} is not in the writer usage: ${usage}`);
      assert.ok(guidance.includes(token), `${token} is not in the guidance: ${guidance}`);
    }
  });
});

check("a non-UTF-8 PRD is signposted to the file's encoding, not to plan-path repair", () => {
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, "specs", "feature", "prd_feature.md"), Buffer.from([0xff, 0xfe]));
    const result = validate();
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, "PO-GATE-PRD-LANGUAGE-MISMATCH", JSON.stringify(result));
    assert.match(result.repair, /UTF-8/u, JSON.stringify(result));
    assert.equal(result.repair.includes(PLAN_PATH_REPAIR), false, JSON.stringify(result));
    assert.match(result.repair, /do not change activeFeature\.planPath/u, JSON.stringify(result));
    // Not the marker route either: nothing about the language is known yet.
    assert.equal(/--human-facing/u.test(result.repair), false, JSON.stringify(result));
  });
});

check("digest staleness is signposted to re-reading and re-submitting, not to plan-path repair", () => {
  withFixture({}, ({ validate }) => {
    const stalePlan = validate({ expectedPlanSha256: "0".repeat(64) });
    const staleSpec = validate({ expectedSpecSha256: "0".repeat(64) });
    assert.equal(stalePlan.code, "PO-GATE-PLAN-DIGEST-STALE", JSON.stringify(stalePlan));
    assert.equal(staleSpec.code, "PO-GATE-PRD-SPEC-MISMATCH", JSON.stringify(staleSpec));
    for (const result of [stalePlan, staleSpec]) {
      assert.match(result.repair, /Re-read the current PO gate authority and re-submit/u, JSON.stringify(result));
      assert.equal(result.repair.includes(PLAN_PATH_REPAIR), false, JSON.stringify(result));
      assert.match(result.repair, /Do not change activeFeature\.planPath/u, JSON.stringify(result));
    }
  });
  // The same remedy covers a snapshot whose active feature no longer exists.
  withFixture({}, ({ primary, validate }) => {
    write(join(primary, ".claude", "pipeline-state.json"), `${JSON.stringify({ schema: "pipeline.state.v0" }, null, 2)}\n`);
    const result = validate({ expectedPlanSha256: "0".repeat(64) });
    assert.equal(result.code, "PO-GATE-PLAN-DIGEST-STALE", JSON.stringify(result));
    assert.match(result.repair, /re-establish it first/u, JSON.stringify(result));
    assert.equal(result.repair.includes(PLAN_PATH_REPAIR), false, JSON.stringify(result));
  });
});

check("every genuine plan-path defect still returns the plan-path repair verbatim", () => {
  // Unreadable feature directory, unsafe active feature state, zero PRDs, and a
  // planPath that does not name the sole PRD.
  const cases = [
    [({ primary }) => rmSync(join(primary, "specs", "feature"), { recursive: true, force: true }), "PO-GATE-FEATURE-PATH-INVALID"],
    [({ primary }) => write(join(primary, ".claude", "pipeline-state.json"), state("specs/feature/not-a-prd.md")), "PO-GATE-ACTIVE-FEATURE-INVALID"],
    [({ primary }) => unlinkSync(join(primary, "specs", "feature", "prd_feature.md")), "PO-GATE-PRD-CARDINALITY"],
    [({ primary }) => write(join(primary, "specs", "feature", "prd_second.md"), prd("de")), "PO-GATE-PRD-CARDINALITY"],
  ];
  for (const [mutate, code] of cases) {
    withFixture({}, (value) => {
      mutate(value);
      const result = value.validate();
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, code, JSON.stringify(result));
      assert.equal(result.repair, PLAN_PATH_REPAIR, JSON.stringify(result));
    });
  }
});

check("the re-signposted failures still expose no machine-local absolute path", () => {
  const mutations = [
    ({ primary }) => write(join(primary, "specs", "feature", "spec.md"), spec("# Technical Spec\ndrifted\n")),
    ({ primary }) => unlinkSync(join(primary, "specs", "feature", "spec.md")),
    ({ primary }) => write(join(primary, "specs", "feature", "prd_feature.md"), Buffer.from([0xff, 0xfe])),
  ];
  for (const mutate of mutations) {
    withFixture({}, (value) => {
      mutate(value);
      const output = JSON.stringify(value.validate());
      for (const secretPath of [value.base, value.primary, value.current]) {
        assert.equal(output.includes(secretPath), false, output);
      }
    });
  }
  withFixture({}, (value) => {
    const output = JSON.stringify(value.validate({ expectedPlanSha256: "0".repeat(64) }));
    for (const secretPath of [value.base, value.primary, value.current]) {
      assert.equal(output.includes(secretPath), false, output);
    }
  });
});

// NVA-FINGERPRINT-1: the same physical working copy, reached through two
// different access-path spellings, must hash to one identical fingerprint.
check("a WSL default-mount spelling and the native Windows spelling of the same physical checkout hash identically", () => {
  const wsl = derivePoGateRepositoryFingerprint({
    gitCommonDir: "/mnt/c/Users/Foo/repo/.git",
    primaryRoot: "/mnt/c/Users/Foo/repo",
  });
  const windows = derivePoGateRepositoryFingerprint({
    gitCommonDir: "C:\\Users\\Foo\\repo\\.git",
    primaryRoot: "C:\\Users\\Foo\\repo",
  });
  assert.equal(wsl, windows, "the two access-path spellings of one physical checkout must collapse to one fingerprint");
  // Mixed separators/case for the native spelling must fold to the same value too.
  const mixed = derivePoGateRepositoryFingerprint({
    gitCommonDir: "c:/USERS/foo/REPO/.git",
    primaryRoot: "c:/USERS/foo/REPO",
  });
  assert.equal(mixed, windows, "case and separator variants of the native spelling must fold identically");
});

check("a bare separator/case rewrite is not what collapses the WSL/Windows boundary -- the mount prefix itself must be recognized", () => {
  // Confirms the fix is not merely "lowercase and swap slashes": the WSL
  // mount prefix `/mnt/<drive>` has no Windows-side counterpart to rewrite
  // against, so two GENUINELY different WSL mount drives must still differ.
  const driveC = derivePoGateRepositoryFingerprint({ gitCommonDir: "/mnt/c/Users/Foo/repo/.git", primaryRoot: "/mnt/c/Users/Foo/repo" });
  const driveD = derivePoGateRepositoryFingerprint({ gitCommonDir: "/mnt/d/Users/Foo/repo/.git", primaryRoot: "/mnt/d/Users/Foo/repo" });
  assert.notEqual(driveC, driveD, "two different WSL mount drives must not collapse to one fingerprint");
});

check("two genuinely different working copies still yield different fingerprints", () => {
  const repoA = derivePoGateRepositoryFingerprint({ gitCommonDir: "/mnt/c/Users/Foo/repoA/.git", primaryRoot: "/mnt/c/Users/Foo/repoA" });
  const repoB = derivePoGateRepositoryFingerprint({ gitCommonDir: "/mnt/c/Users/Foo/repoB/.git", primaryRoot: "/mnt/c/Users/Foo/repoB" });
  assert.notEqual(repoA, repoB, "different physical checkouts must not collapse to one fingerprint");
  const posixA = derivePoGateRepositoryFingerprint({ gitCommonDir: "/home/user/repoA/.git", primaryRoot: "/home/user/repoA" });
  const posixB = derivePoGateRepositoryFingerprint({ gitCommonDir: "/home/user/repoB/.git", primaryRoot: "/home/user/repoB" });
  assert.notEqual(posixA, posixB, "different plain-POSIX checkouts must not collapse to one fingerprint");
  // A same-string different-case plain-POSIX pair is a case-sensitive filesystem's
  // two genuinely different directories -- this must NOT be folded the way the
  // Windows/WSL drive-letter world is.
  const lower = derivePoGateRepositoryFingerprint({ gitCommonDir: "/home/user/repo/.git", primaryRoot: "/home/user/repo" });
  const upper = derivePoGateRepositoryFingerprint({ gitCommonDir: "/home/User/Repo/.git", primaryRoot: "/home/User/Repo" });
  assert.notEqual(lower, upper, "a plain POSIX path must be hashed byte-for-byte, case included, never folded");
});

check("a plain POSIX repository path is unaffected by the fix (no migration needed for that majority case)", () => {
  const current = derivePoGateRepositoryFingerprint({ gitCommonDir: "/home/user/repo/.git", primaryRoot: "/home/user/repo" });
  const legacy = derivePoGateRepositoryFingerprintLegacy({ gitCommonDir: "/home/user/repo/.git", primaryRoot: "/home/user/repo" });
  assert.equal(current, legacy, "outside the WSL-mount/Windows-drive-letter world the new and pre-fix formulas must agree byte-for-byte");
});

check("a receipt fingerprint published under the pre-fix formula for a WSL-mount checkout is still found", () => {
  // `derivePoGateRepositoryFingerprintLegacy` reproduces the OLD, platform-bound
  // formula exactly (raw `normalizeAbsolute`, native `node:path` `isAbsolute`/
  // `resolve`): on a win32 host it accepts a `C:\...` string, and on a POSIX
  // host -- exactly what this suite runs on, and exactly what a real WSL
  // process also is -- it accepts a `/mnt/c/...` string. This test exercises
  // the WSL-mount side, which is reproducible on any POSIX runner (a Windows
  // native process is not available in this test environment; the analogous
  // native-Windows case is the same code path exercised via `path.win32` and
  // is covered structurally by the case/separator-fold assertions above).
  const gitCommonDir = "/mnt/c/Users/Foo/repo/.git";
  const primaryRoot = "/mnt/c/Users/Foo/repo";
  const legacy = derivePoGateRepositoryFingerprintLegacy({ gitCommonDir, primaryRoot });
  const current = derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot });
  // Migration is actually needed for this notation: the two formulas differ
  // (the fold to the Windows-drive-letter form changes the value even with no
  // cross-notation access at all -- a WSL-only user's own receipt goes stale too).
  assert.notEqual(legacy, current, "the pre-fix and current formulas must differ for a WSL-mount path, or there is nothing to migrate");
  assert.equal(
    poGateReceiptFingerprintMatches({ receiptFingerprint: legacy, gitCommonDir, primaryRoot }),
    true,
    "a receipt carrying the pre-fix fingerprint must still be recognized as bound",
  );
  assert.equal(
    poGateReceiptFingerprintMatches({ receiptFingerprint: current, gitCommonDir, primaryRoot }),
    true,
    "a receipt carrying the current fingerprint must be recognized as bound",
  );
  assert.equal(
    poGateReceiptFingerprintMatches({ receiptFingerprint: "0".repeat(64), gitCommonDir, primaryRoot }),
    false,
    "an unrelated fingerprint value must never be treated as bound",
  );
});

process.stdout.write(`po-gate-authority: ${passed} checks passed\n`);
