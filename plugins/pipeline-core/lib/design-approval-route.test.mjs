// SPDX-License-Identifier: SUL-1.0
// RED contract for ADR-0085 removal route, slice T0a (row 1 of section 5 of
// specs/sprint-alfred-epic/design/adr-0085-removal-2026-10-08.md, revision a3). Test-only: it is
// committed RED and the fix slices F1 (v8 record + validator) and F2a (re-read export) never edit it
// (QG-04). Sources: note sections 3 (Legacy approvals, Implementation authority), 4 (M2), C2 and C4
// (P1 amendment); contract specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md section 4.
//
// Three groups:
//   R*  the legacy re-read mode DWP2-LEGACY-APPROVED-REREAD (C2): a new export of
//       design-workflow-package.mjs that verifies only what decision T lists, on a synthetic repository
//       with no .git, no course store, no host evidence, no readiness file and no live candidate.
//   V*  the v8 plan-approval record validator (C4 / P1 amendment): signature-mode and chat-mode
//       records are valid, a chat record carrying a proof is invalid.
//   L*  the legacy classification (U3 classifiers, already landed): GREEN today and pinned here at the
//       row-1 surface so the legacy/new split cannot regress while F1 lands.
//
// ASSUMED NAMES AND SHAPES (not fixed by the note; fix slices must either match them or the Elephant
// amends this file by a separate test dispatch):
//   A1  The re-read is a synchronous-or-async export `rereadApprovedDesignWorkflowPackage` of
//       lib/design-workflow-package.mjs. It takes the recorded v7 approval fields of
//       readApprovedDesignWorkflowPackage MINUS readCandidate / trustedAdvisorExecutablePath:
//       { repoRoot, packagePath, packageSha256, featureId, planPath, planSha256, specPath, specSha256,
//       advisorExceptionBinding }. Success: { ok: true, mode: "DWP2-LEGACY-APPROVED-REREAD",
//       packageSha256, workflowPackage }. Failure: { ok: false, code } with a typed uppercase code.
//   A2  The re-read reuses the existing typed codes of readApprovedDesignWorkflowPackage where the
//       same check exists: DWP-APPROVAL-BINDING (input), DWP-PACKAGE-PHYSICAL (package missing),
//       DWP-APPROVAL-DIGEST-DRIFT, DWP-APPROVAL-FEATURE-MISMATCH, DWP-APPROVAL-PLAN-SPEC-MISMATCH,
//       DWP-APPROVAL-ADVISOR-EXCEPTION-BINDING. The closed-shape refusal and the refusal for a PRD/Spec
//       whose current file bytes differ from the package reference are asserted only as "typed code"
//       (the note fixes no code for them).
//   A3  Only the package, the current PRD and the current Spec bytes are read. The package's
//       design/input/traceability sources, the readiness receipt, the Advisor failure evidence and the
//       initial-context file are deliberately ABSENT in every fixture.
//   A4  v8 follows the v5 -> v6 -> v7 bump pattern of plan-spec-state-v2.mjs: CURRENT_APPROVAL_SCHEMA
//       becomes "pipeline.plan-approval.v8", `validCurrentPlanApproval` validates the v8 shape, and
//       `validPreviousCurrentPlanApproval` takes over a v7 record. The v8 key set is the v7 key set
//       minus designAdvisorAdmissionSha256, designWorkflowPackagePath, designWorkflowPackageSha256 and
//       designWorkflowApproval, plus `designApproval` (a non-null object for the epic/feature profile
//       under test; the mini profile is not pinned here).
//   A5  designApproval is the closed key set { schema: "pipeline.design-approval.v1", mode, approvedBy,
//       approvedAt, bindingSha256, intentSha256, proofSha256, proof }, mode in { "signature", "chat" }.
//       Signature: intentSha256, proofSha256 and proof non-null, proof in the pipeline.po-approval-proof.v1
//       shape of the v7 validator. Chat: proofSha256 and proof null and intentSha256 NON-null. The note
//       (C4 P1 amendment) says the chat record "binds the same bindingSha256 and intentSha256", which
//       differs from the v7 chat record where intentSha256 is null.
//
// NOT PINNED HERE (owned by other slices): the signature check of the re-read against the trust anchor
// (note C2 item 5; slice F2b and the T0c boundary cases), the boundary and its mode check (T0c), the
// lifecycle verbs and retired entry points (T0b), the mini profile record, the approvedBy equality of a
// chat record with the plan approval's (boundary, T0c).
//
// VACUITY GUARD: every "invalid" case below starts with a positive control (the same record without the
// defect is valid). Without it, "a chat record carrying a proof is invalid" would be GREEN today for the
// wrong reason, because validCurrentPlanApproval rejects every v8 record while v7 is the current schema.
//
// Expected state at the candidate where this file is created:
//   RED  R1-R12 (missing export rereadApprovedDesignWorkflowPackage), V0-V9 (v8 not accepted: the control
//        assertion fails), V10 (v7 not handled by validPreviousCurrentPlanApproval).
//   GREEN L1-L4 and V11 (behaviour that already exists).
//
// Fixtures are synthetic: a mkdtemp directory under the OS temporary root, no real home, no network, no git.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

// ---------------------------------------------------------------------------
// Dynamic imports: a missing module or export fails ONLY the case that needs it.
// ---------------------------------------------------------------------------

const moduleUrl = (relative) => new URL(relative, import.meta.url).href;

async function loadModule(relative, slice) {
  try {
    return await import(moduleUrl(relative));
  } catch (error) {
    return assert.fail(`RED: cannot import ${relative} (${error?.code ?? error?.name}) [${slice}]`);
  }
}

async function loadExport(relative, name, slice) {
  const mod = await loadModule(relative, slice);
  if (!Object.hasOwn(mod, name) || mod[name] === undefined) {
    assert.fail(`RED: missing export ${name} in ${relative} [${slice}]`);
  }
  return mod[name];
}

const REREAD_EXPORT = "rereadApprovedDesignWorkflowPackage";
const REREAD_MODE = "DWP2-LEGACY-APPROVED-REREAD";

async function loadReread() {
  const reread = await loadExport("./design-workflow-package.mjs", REREAD_EXPORT, "slice F2a");
  assert.equal(typeof reread, "function", `RED: ${REREAD_EXPORT} is not a function [slice F2a]`);
  return reread;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest = (label) => sha256(`adr0085-t0a:${label}`);
const TYPED_CODE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u;

/** Sorted-key JSON, the byte shape of a real package file (single line plus newline). */
function canon(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canon(value[key])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Re-read fixture: a package approved by a v7 plan approval, on a synthetic repository.
// ---------------------------------------------------------------------------

const FEATURE = "feat-x";
const PRD_PATH = "specs/feat-x/prd_feat-x.md";
const SPEC_PATH = "specs/feat-x/spec.md";
const PACKAGE_PATH = "evidence/design-course/feat-x/r1.package.json";
const PRD_TEXT = "# Synthetic PRD\n\nThe fixture PRD, revision 1.\n";
const SPEC_TEXT = "# Synthetic Spec\n\nThe fixture Spec, revision 1.\n";

function sourcesOf(prdSha256, specSha256) {
  return {
    design: { path: "specs/feat-x/design.md", sha256: digest("design") },
    input: { path: "specs/feat-x/design-input.md", sha256: digest("input") },
    prd: { path: PRD_PATH, sha256: prdSha256 },
    spec: { path: SPEC_PATH, sha256: specSha256 },
    traceability: { path: "specs/feat-x/traceability.md", sha256: digest("traceability") },
  };
}

/** The v2 "advisor unavailable" shape of this repository's approved package, with synthetic values. */
function packageV2(prdSha256, specSha256) {
  return {
    advisor: {
      consultation: null,
      courseBinding: {
        courseId: "dac_synthetic0001",
        initialContextSha256: digest("course-initial-context"),
        reservationId: "dacr_synthetic-0001",
        routeStepSha256: digest("route-step"),
        slot: 0,
      },
      disposition: null,
      failureEvidence: { path: "evidence/design-course/feat-x/claude.failure.json", sha256: digest("failure-evidence") },
      hostReceipt: null,
      initialContext: { path: "evidence/design-course/feat-x/claude.initial.json", sha256: digest("initial-context-file") },
      profile: "epic",
      proposedException: {
        approval: "final",
        kind: "advisor-unavailable",
        oneTime: true,
        rationale: "Synthetic Advisor-unavailable rationale for the T0a fixture.\n",
      },
      receipt: null,
      report: null,
      revisions: [],
      route: { candidateCommit: "c".repeat(40), effort: null, model: null, sourceSha256: digest("route-source") },
      runner: "claude",
      status: "unavailable",
    },
    authoringDispatchId: "SYNTH-AUTHOR-1",
    candidate: { commit: "c".repeat(40), tree: "d".repeat(40) },
    createdAt: "2026-10-01T00:00:00.000Z",
    featureId: FEATURE,
    readiness: { dispatchId: "SYNTH-READINESS-1", path: "evidence/design-course/feat-x/r1.readiness.json", sha256: digest("readiness") },
    schema: "pipeline.design-workflow-package.v2",
    sources: sourcesOf(prdSha256, specSha256),
  };
}

/** The v1 shape (answered Advisor, no exception). */
function packageV1(prdSha256, specSha256) {
  return {
    advisor: {
      attemptTrail: null,
      disposition: { decision: "accept", rationale: "Synthetic disposition for the T0a fixture." },
      exception: null,
      nativeAvailable: true,
      receipt: { path: "evidence/design-course/feat-x/advisor.receipt.json", sha256: digest("advisor-receipt") },
      runner: "claude",
      status: "answered",
    },
    authoringDispatchId: "SYNTH-AUTHOR-1",
    candidate: { commit: "c".repeat(40), tree: "d".repeat(40) },
    createdAt: "2026-10-01T00:00:00.000Z",
    featureId: FEATURE,
    readiness: { dispatchId: "SYNTH-READINESS-1", path: "evidence/design-course/feat-x/r1.readiness.json", sha256: digest("readiness") },
    schema: "pipeline.design-workflow-package.v1",
    sources: sourcesOf(prdSha256, specSha256),
  };
}

/** Decision T item 4: the exception binding recomputed from PACKAGE fields only. */
function exceptionBindingOf(workflowPackage, packageSha256) {
  if (workflowPackage.schema !== "pipeline.design-workflow-package.v2" || workflowPackage.advisor.status !== "unavailable") return null;
  return {
    kind: "advisor-unavailable",
    oneTime: true,
    packageSha256,
    courseId: workflowPackage.advisor.courseBinding.courseId,
    initialContextSha256: workflowPackage.advisor.courseBinding.initialContextSha256,
    failureEvidenceSha256: workflowPackage.advisor.failureEvidence.sha256,
    rationale: workflowPackage.advisor.proposedException.rationale,
  };
}

function makeApprovedRepo({ version = 2, shape = (workflowPackage) => workflowPackage } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), "adr0085-reread-"));
  const write = (relative, text) => {
    const target = join(repoRoot, ...relative.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  write(PRD_PATH, PRD_TEXT);
  write(SPEC_PATH, SPEC_TEXT);
  const planSha256 = sha256(PRD_TEXT);
  const specSha256 = sha256(SPEC_TEXT);
  const workflowPackage = shape(version === 2 ? packageV2(planSha256, specSha256) : packageV1(planSha256, specSha256));
  const packageText = `${canon(workflowPackage)}\n`;
  write(PACKAGE_PATH, packageText);
  const packageSha256 = sha256(packageText);
  const args = () => ({
    repoRoot,
    packagePath: PACKAGE_PATH,
    packageSha256,
    featureId: FEATURE,
    planPath: PRD_PATH,
    planSha256,
    specPath: SPEC_PATH,
    specSha256,
    advisorExceptionBinding: exceptionBindingOf(workflowPackage, packageSha256),
  });
  return { repoRoot, write, args, packageSha256, workflowPackage };
}

async function withRepo(options, body) {
  const fixture = makeApprovedRepo(options);
  try {
    await body(fixture);
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
}

function assertRefused(result, expectedCode, why) {
  assert.equal(result?.ok, false, `${why}: expected a typed refusal, got ${JSON.stringify(result)}`);
  assert.match(String(result.code), TYPED_CODE, `${why}: refusal code is not a typed code`);
  if (expectedCode !== null) assert.equal(result.code, expectedCode, why);
}

// ---------------------------------------------------------------------------
// R: legacy re-read mode (C2, decision T) -- slice F2a
// ---------------------------------------------------------------------------

test("R1 re-read: design-workflow-package.mjs exports the re-read function", async () => {
  await loadReread();
});

test("R2 re-read: an approved v2 package re-reads as ok, in the visible DWP2-LEGACY-APPROVED-REREAD mode", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    const result = await reread(fixture.args());
    assert.equal(result?.ok, true, `RED: re-read of an approved package failed: ${JSON.stringify(result)}`);
    assert.equal(result.mode, REREAD_MODE);
    assert.equal(result.packageSha256, fixture.packageSha256);
    assert.equal(result.workflowPackage?.featureId, FEATURE);
  });
});

test("R3 re-read: reads no live candidate and no course store (no .git, no evidence besides the package)", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    assert.equal(existsSync(join(fixture.repoRoot, ".git")), false, "fixture precondition: no git repository");
    assert.equal(existsSync(join(fixture.repoRoot, "evidence", "design-course", "feat-x", "r1.readiness.json")), false, "fixture precondition: no readiness file");
    let candidateReads = 0;
    const result = await reread({
      ...fixture.args(),
      readCandidate: () => {
        candidateReads += 1;
        throw new Error("the re-read must not sample a live candidate");
      },
      trustedAdvisorExecutablePath: join(fixture.repoRoot, "no-such-advisor"),
    });
    assert.equal(result?.ok, true, `RED: re-read needs no candidate, course store or evidence files: ${JSON.stringify(result)}`);
    assert.equal(candidateReads, 0, "the candidate reader was called");
  });
});

test("R4 re-read: a v1 package re-reads as ok with a null recorded exception binding", async () => {
  const reread = await loadReread();
  await withRepo({ version: 1 }, async (fixture) => {
    assert.equal(fixture.args().advisorExceptionBinding, null);
    const result = await reread(fixture.args());
    assert.equal(result?.ok, true, `RED: re-read of an approved v1 package failed: ${JSON.stringify(result)}`);
    assert.equal(result.mode, REREAD_MODE);
  });
});

test("R5 re-read: package bytes changed after the approval are refused (item 1)", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    fixture.write(PACKAGE_PATH, `${canon({ ...fixture.workflowPackage, createdAt: "2026-10-02T00:00:00.000Z" })}\n`);
    assertRefused(await reread(fixture.args()), "DWP-APPROVAL-DIGEST-DRIFT", "tampered package bytes");
  });
});

test("R6 re-read: a missing package file is a typed refusal", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    rmSync(join(fixture.repoRoot, ...PACKAGE_PATH.split("/")));
    assertRefused(await reread(fixture.args()), "DWP-PACKAGE-PHYSICAL", "missing package");
  });
});

test("R7 re-read: a package outside the closed shape is refused even when its digest matches (item 2)", async () => {
  const reread = await loadReread();
  await withRepo({ shape: (workflowPackage) => ({ ...workflowPackage, unexpectedKey: true }) }, async (fixture) => {
    assertRefused(await reread(fixture.args()), null, "extra key in the package");
  });
});

test("R8 re-read: package PRD/Spec references that differ from the approved digests are refused (item 3)", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    assertRefused(await reread({ ...fixture.args(), planSha256: digest("another-prd") }), "DWP-APPROVAL-PLAN-SPEC-MISMATCH", "approved PRD digest differs");
    assertRefused(await reread({ ...fixture.args(), specSha256: digest("another-spec") }), "DWP-APPROVAL-PLAN-SPEC-MISMATCH", "approved Spec digest differs");
  });
});

test("R9 re-read: a PRD or Spec whose current file bytes differ from the package reference is refused (item 3)", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    fixture.write(SPEC_PATH, `${SPEC_TEXT}An edit after the approval.\n`);
    assertRefused(await reread(fixture.args()), null, "Spec bytes drifted");
  });
  await withRepo({}, async (fixture) => {
    fixture.write(PRD_PATH, `${PRD_TEXT}An edit after the approval.\n`);
    assertRefused(await reread(fixture.args()), null, "PRD bytes drifted");
  });
});

test("R10 re-read: a recorded advisor exception that differs from the one recomputed from the package is refused (item 4)", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    const recorded = fixture.args().advisorExceptionBinding;
    assert.equal(recorded?.kind, "advisor-unavailable", "fixture precondition: the v2 package carries an exception");
    assertRefused(await reread({ ...fixture.args(), advisorExceptionBinding: { ...recorded, rationale: "A different rationale." } }), "DWP-APPROVAL-ADVISOR-EXCEPTION-BINDING", "altered rationale");
    assertRefused(await reread({ ...fixture.args(), advisorExceptionBinding: null }), "DWP-APPROVAL-ADVISOR-EXCEPTION-BINDING", "recorded binding dropped");
  });
});

test("R11 re-read: a package of another feature is refused", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    assertRefused(await reread({ ...fixture.args(), featureId: "feat-y" }), "DWP-APPROVAL-FEATURE-MISMATCH", "feature mismatch");
  });
});

test("R12 re-read: malformed approval inputs are a typed input refusal", async () => {
  const reread = await loadReread();
  await withRepo({}, async (fixture) => {
    assertRefused(await reread({ ...fixture.args(), packageSha256: "not-a-digest" }), "DWP-APPROVAL-BINDING", "malformed package digest");
    assertRefused(await reread({ ...fixture.args(), planPath: "../outside.md" }), "DWP-APPROVAL-BINDING", "unsafe PRD path");
  });
});

// ---------------------------------------------------------------------------
// V: v8 plan-approval record validator (C4, P1 amendment) -- slice F1
// ---------------------------------------------------------------------------

const SCHEMA_V8 = "pipeline.plan-approval.v8";
const RECORD_SCHEMA = "pipeline.design-approval.v1";
const LEGACY_RECORD_SCHEMA = "pipeline.design-workflow-package-approval.v1";
const FOUR_V7_FIELDS = ["designAdvisorAdmissionSha256", "designWorkflowPackagePath", "designWorkflowPackageSha256", "designWorkflowApproval"];

const authority = () => ({
  schema: "pipeline.po-gate-authority.v2",
  humanFacing: "en",
  sourceSha256: digest("authority-source"),
  runtimeSha256: digest("authority-runtime"),
  receiptSha256: digest("authority-receipt"),
  repositoryFingerprint: digest("repository-fingerprint"),
  planPath: PRD_PATH,
  planSha256: digest("authority-prd"),
  specPath: SPEC_PATH,
  specSha256: digest("authority-spec"),
});

const proofFor = (intentSha256) => ({
  schema: "pipeline.po-approval-proof.v1",
  intentSha256,
  keyReference: "synthetic-key-reference",
  publicKey: "synthetic-public-key",
  signatureBase64: "c3ludGhldGljLXNpZ25hdHVyZQ==",
});

function signatureRecord() {
  const intentSha256 = digest("intent");
  return {
    schema: RECORD_SCHEMA,
    mode: "signature",
    approvedBy: "po",
    approvedAt: "2026-10-09T10:00:00.000Z",
    bindingSha256: digest("binding"),
    intentSha256,
    proofSha256: digest("proof"),
    proof: proofFor(intentSha256),
  };
}

function chatRecord() {
  return {
    schema: RECORD_SCHEMA,
    mode: "chat",
    approvedBy: "po",
    approvedAt: "2026-10-09T10:00:00.000Z",
    bindingSha256: digest("binding"),
    intentSha256: digest("intent"),
    proofSha256: null,
    proof: null,
  };
}

function v8Approval(designApproval) {
  return {
    schema: SCHEMA_V8,
    approvedBy: "po",
    approvedAt: "2026-10-09T10:00:00.000Z",
    submissionSha256: digest("submission"),
    profileSha256: digest("profile"),
    poGateAuthority: authority(),
    priorInvalidationSha256: null,
    designApproval,
  };
}

/** This repository's v7 shape: signature mode with an Advisor-unavailable exception. */
function v7Approval() {
  const packageSha256 = digest("v7-package");
  const intentSha256 = digest("v7-intent");
  return {
    schema: "pipeline.plan-approval.v7",
    approvedBy: "po",
    approvedAt: "2026-10-07T10:00:00.000Z",
    submissionSha256: digest("submission"),
    profileSha256: digest("profile"),
    poGateAuthority: authority(),
    priorInvalidationSha256: null,
    designAdvisorAdmissionSha256: null,
    designWorkflowPackagePath: PACKAGE_PATH,
    designWorkflowPackageSha256: packageSha256,
    designWorkflowApproval: {
      schema: LEGACY_RECORD_SCHEMA,
      mode: "signature",
      approvedBy: "po",
      approvedAt: "2026-10-07T10:00:00.000Z",
      packageSha256,
      intentSha256,
      proofSha256: digest("v7-proof"),
      proof: proofFor(intentSha256),
      advisorException: {
        kind: "advisor-unavailable",
        oneTime: true,
        packageSha256,
        courseId: "dac_synthetic0001",
        initialContextSha256: digest("course-initial-context"),
        failureEvidenceSha256: digest("failure-evidence"),
        rationale: "Synthetic Advisor-unavailable rationale for the T0a fixture.\n",
      },
    },
  };
}

async function loadV8Validator() {
  const mod = await loadModule("./plan-spec-state-v2.mjs", "slice F1");
  return (record) => mod.validCurrentPlanApproval(record) === true;
}

function assertV8Valid(validate, record, label) {
  assert.equal(validate(record), true, `RED: validCurrentPlanApproval does not accept a well-formed ${SCHEMA_V8} record (${label}) [slice F1]`);
}

/** Positive control first, then every variant must be invalid (see the VACUITY GUARD in the header). */
function assertVariantsInvalid(validate, control, variants) {
  assertV8Valid(validate, control, "control");
  for (const [label, mutate] of variants) {
    const variant = structuredClone(control);
    mutate(variant);
    assert.equal(validate(variant), false, `${SCHEMA_V8} variant must be invalid: ${label}`);
  }
}

test("V0 v8: pipeline.plan-approval.v8 is the current approval schema", async () => {
  const mod = await loadModule("./plan-spec-state-v2.mjs", "slice F1");
  assert.equal(mod.CURRENT_APPROVAL_SCHEMA, SCHEMA_V8, "RED: CURRENT_APPROVAL_SCHEMA is still the previous schema [slice F1]");
});

test("V1 v8: a signature-mode record with a proof is valid", async () => {
  const validate = await loadV8Validator();
  assertV8Valid(validate, v8Approval(signatureRecord()), "signature mode");
});

test("V2 v8: a chat-mode record (proofSha256 and proof null, intentSha256 bound) is valid", async () => {
  const validate = await loadV8Validator();
  const record = chatRecord();
  assert.equal(record.proofSha256, null);
  assert.equal(record.proof, null);
  assert.match(record.intentSha256, /^[a-f0-9]{64}$/u);
  assertV8Valid(validate, v8Approval(record), "chat mode");
});

test("V3 v8: a chat-mode record carrying a proof is invalid (control: the same record without it is valid)", async () => {
  const validate = await loadV8Validator();
  assertVariantsInvalid(validate, v8Approval(chatRecord()), [
    ["proofSha256 and proof both present", (r) => { r.designApproval.proofSha256 = digest("proof"); r.designApproval.proof = proofFor(r.designApproval.intentSha256); }],
    ["proof present, proofSha256 null", (r) => { r.designApproval.proof = proofFor(r.designApproval.intentSha256); }],
    ["proofSha256 present, proof null", (r) => { r.designApproval.proofSha256 = digest("proof"); }],
  ]);
});

test("V4 v8: a signature-mode record without its proof is invalid (control: the full record is valid)", async () => {
  const validate = await loadV8Validator();
  assertVariantsInvalid(validate, v8Approval(signatureRecord()), [
    ["proof null", (r) => { r.designApproval.proof = null; }],
    ["proofSha256 null", (r) => { r.designApproval.proofSha256 = null; }],
    ["proofSha256 and proof both null", (r) => { r.designApproval.proofSha256 = null; r.designApproval.proof = null; }],
  ]);
});

test("V5 v8: the mode must be exactly signature or chat", async () => {
  const validate = await loadV8Validator();
  assertVariantsInvalid(validate, v8Approval(chatRecord()), [
    ["mode none", (r) => { r.designApproval.mode = "none"; }],
    ["mode Signature (case)", (r) => { r.designApproval.mode = "Signature"; }],
    ["mode null", (r) => { r.designApproval.mode = null; }],
    ["mode key removed", (r) => { delete r.designApproval.mode; }],
  ]);
});

test("V6 v8: the designApproval key set is closed, with no package or advisor-exception field (hybrid)", async () => {
  const validate = await loadV8Validator();
  assertVariantsInvalid(validate, v8Approval(signatureRecord()), [
    ["extra packageSha256", (r) => { r.designApproval.packageSha256 = digest("package"); }],
    ["extra advisorException", (r) => { r.designApproval.advisorException = { kind: "advisor-unavailable" }; }],
    ["extra unknown key", (r) => { r.designApproval.unexpected = true; }],
    ["bindingSha256 key removed", (r) => { delete r.designApproval.bindingSha256; }],
    ["intentSha256 key removed", (r) => { delete r.designApproval.intentSha256; }],
  ]);
});

test("V7 v8: the plan approval carries designApproval and none of the four retired v7 fields", async () => {
  const validate = await loadV8Validator();
  const variants = [["designApproval key removed", (r) => { delete r.designApproval; }]];
  for (const field of FOUR_V7_FIELDS) {
    variants.push([`retired v7 field ${field} present`, (r) => { r[field] = null; }]);
  }
  assertVariantsInvalid(validate, v8Approval(signatureRecord()), variants);
});

test("V8 v8: bindingSha256 must be a lowercase sha256 digest and the record schema exactly pipeline.design-approval.v1", async () => {
  const validate = await loadV8Validator();
  assertVariantsInvalid(validate, v8Approval(chatRecord()), [
    ["bindingSha256 too short", (r) => { r.designApproval.bindingSha256 = "abc123"; }],
    ["bindingSha256 uppercase", (r) => { r.designApproval.bindingSha256 = digest("binding").toUpperCase(); }],
    ["bindingSha256 null", (r) => { r.designApproval.bindingSha256 = null; }],
    ["record schema is the legacy package approval schema", (r) => { r.designApproval.schema = LEGACY_RECORD_SCHEMA; }],
    ["record schema is another version", (r) => { r.designApproval.schema = "pipeline.design-approval.v2"; }],
  ]);
});

test("V9 v8: the attribution fields are well-formed (approvedBy non-blank, approvedAt canonical ISO)", async () => {
  const validate = await loadV8Validator();
  assertVariantsInvalid(validate, v8Approval(chatRecord()), [
    ["designApproval.approvedBy blank", (r) => { r.designApproval.approvedBy = "  "; }],
    ["designApproval.approvedAt not canonical ISO", (r) => { r.designApproval.approvedAt = "2026-10-09 10:00"; }],
    ["plan approvedBy blank", (r) => { r.approvedBy = ""; }],
  ]);
});

test("V10 v8: once v8 is current, a well-formed v7 record is handled by validPreviousCurrentPlanApproval and not by validCurrentPlanApproval", async () => {
  const mod = await loadModule("./plan-spec-state-v2.mjs", "slice F1");
  const record = v7Approval();
  assert.equal(mod.validPreviousCurrentPlanApproval(record), true, "RED: a v7 record is not accepted as the previous current approval [slice F1]");
  assert.equal(mod.validCurrentPlanApproval(record), false, "a v7 record must no longer count as the current approval [slice F1]");
});

test("V11 v8: a well-formed v7 record stays accepted by at least one approval validator (legacy stays readable)", async () => {
  const mod = await loadModule("./plan-spec-state-v2.mjs", "slice F1");
  const record = v7Approval();
  assert.equal(mod.validCurrentPlanApproval(record) || mod.validPreviousCurrentPlanApproval(record), true, "this repository's v7 approval shape is no longer readable");
});

// ---------------------------------------------------------------------------
// L: legacy classification (U3 classifiers, GREEN today)
// ---------------------------------------------------------------------------

test("L1 classification: a v7 designWorkflowApproval record is legacy, with or without its advisor exception", async () => {
  const classify = await loadExport("./design-approval-binding.mjs", "classifyDesignApprovalRecord", "U3");
  const legacy = v7Approval().designWorkflowApproval;
  assert.equal(classify(legacy), "legacy-design-workflow-package");
  const withoutException = structuredClone(legacy);
  delete withoutException.advisorException;
  assert.equal(classify(withoutException), "legacy-design-workflow-package");
});

test("L2 classification: a new-schema record is design-approval in both modes; a hybrid is invalid", async () => {
  const classify = await loadExport("./design-approval-binding.mjs", "classifyDesignApprovalRecord", "U3");
  assert.equal(classify(signatureRecord()), "design-approval");
  assert.equal(classify(chatRecord()), "design-approval");
  assert.equal(classify({ ...signatureRecord(), packageSha256: digest("package") }), "invalid");
  assert.equal(classify({ ...chatRecord(), advisorException: { kind: "advisor-unavailable" } }), "invalid");
});

test("L3 classification: other or malformed records are unknown", async () => {
  const classify = await loadExport("./design-approval-binding.mjs", "classifyDesignApprovalRecord", "U3");
  assert.equal(classify({ schema: "pipeline.something-else.v1" }), "unknown");
  assert.equal(classify(null), "unknown");
  assert.equal(classify([]), "unknown");
  assert.equal(classify({}), "unknown");
});

test("L4 classification: a legacy intent (v1 or v2 policy) is told apart from the design-approval intent", async () => {
  const classify = await loadExport("./design-approval-binding.mjs", "classifyDesignApprovalIntent", "U3");
  const schema = await loadExport("./po-approval-proof.mjs", "PO_APPROVAL_INTENT_SCHEMA", "U3");
  const intent = (kind, policyRevision) => ({ schema, kind, policyRevision });
  assert.equal(classify(intent("design-approval", "design-approval-v1")), "design-approval");
  assert.equal(classify(intent("design-workflow-package", "design-workflow-package-v1")), "legacy-design-workflow-package");
  assert.equal(classify(intent("design-workflow-package", "design-workflow-package-v2")), "legacy-design-workflow-package");
  assert.equal(classify({ value: intent("design-workflow-package", "design-workflow-package-v2"), sha256: digest("intent") }), "legacy-design-workflow-package");
  assert.equal(classify(intent("design-approval", "design-workflow-package-v2")), "unknown");
});
