// SPDX-License-Identifier: SUL-1.0
/**
 * design-approval-route.e2e.test.mjs -- RED end-to-end contract for the ADR-0085 route (row 2, test-only).
 *
 * Run: node --test plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs
 *
 * Spec: specs/sprint-alfred-epic/design/adr-0085-removal-2026-10-08.md (C3, C4, C6-C8, section 17, row 2),
 * Ruling 77 in specs/sprint-alfred-epic/plans/0.7-execution-order.md, API contract
 * specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md (sections 4-5).
 *
 * Every case is expected RED today, each for a "route missing" reason:
 *   route 1  present-plan has no --review-receipt flag (accepts only --by and --design-workflow-package).
 *   route 2  same first failure; everything after it is unreachable until present-plan works.
 *   route 3  same; the boundary is additionally gated on planApproval.schema === v8 so it cannot pass vacuously.
 *   route 4  same; zero continuity-cas is asserted together with a SUCCESSFUL approve (not vacuous).
 *   V        approve-plan refuses the in-flight v2 presentation today, but without a typed code that names
 *            present-plan --review-receipt: RED on the hint.
 *   retired  present-plan --design-workflow-package, approve-plan --design-workflow-approval-request and the
 *            course / advisor / readiness scripts do not return the retirement codes yet; the lib table
 *            lib/retired-design-codes.mjs does not exist (dynamic import fails).
 *
 * Assumptions about names the note does not fix (all named here, none silent):
 *   A1  Decision V asserts a typed code PATTERN plus the "present-plan --review-receipt" hint, not a pinned name
 *       (the note, section 3 / section 17, says only "a typed code").
 *   A2  The old approve-plan flag --design-workflow-approval-request maps to DWP-APPROVAL-REQUEST-RETIRED. The
 *       mapping comes from adr-0085-implementation-plan.md line 21 (the four codes), not from the note.
 *   A3  Retired scripts, invoked with no arguments, exit non-zero and print their code and the hint
 *       "present-plan --review-receipt" on stdout or stderr: design-advisory-coordinator.mjs and
 *       design-advisory-admission.mjs -> DESIGN-ADVISORY-COURSE-RETIRED (C6); design-course-session.mjs,
 *       design-course-coordinator.mjs and runner-design-readiness-bootstrap.mjs -> DESIGN-COURSE-RETIRED (C7, C8).
 *   A4  lib/retired-design-codes.mjs exports the four codes; the export SHAPE is not pinned: each code must
 *       appear among the module's exported keys or string values (any depth).
 *   A5  present-plan prints exactly ONE line containing "sign-intent", with absolute --repo-root and --request
 *       paths (C3, T25). The --directory (key directory) text is NOT pinned: a fixture HOME has no machine plane.
 *   A6  The request file is named in that command; the proof is written next to it, with "request" replaced by
 *       "proof" in the file name (parity with designWorkflowApprovalProofPath, pipeline-state.mjs:8894).
 *   A7  approve-plan receives the repo-relative, forward-slash form of the request path (parity with v7).
 *   A8  The record is pipeline.plan-approval.v8 (Ruling 77a): schema, approvedBy, approvedAt, submissionSha256,
 *       profileSha256, poGateAuthority, [priorInvalidationSha256], designApprovalBinding, designApproval; none of
 *       designAdvisorAdmissionSha256, designWorkflowPackagePath, designWorkflowPackageSha256, designWorkflowApproval.
 *       designApproval = pipeline.design-approval.v1 with mode "signature" in the default configuration, and
 *       bindingSha256 === sha256(canonical(designApprovalBinding)) (canonical from lib/po-approval-proof.mjs).
 *   A9  Boundary = designAdvisoryAdmission(state, projectDir, planPath, specPath) from lib/guard-devplan-policy.mjs
 *       returning { ok: true } for the v8 record (hook-level cases belong to ADR0085-T0c).
 *   A10 Key route (measured, not assumed): approve-plan never reads HOME or the key directory. The v7 signature
 *       observer (pipeline-state.mjs:8900-8928) reads the proof from scratch/ and the trust anchor from
 *       project/critical-human-proof.json (readCriticalHumanProofPolicy, trustAnchors, schema v3). This file seeds
 *       that policy (committed) with the fixture key and assumes the v8 route reuses the same reader (C2 table:
 *       "the same trust policy"). GAP: sign-intent itself (openssl, key directory, passphrase seams in flux under
 *       TR-S1) is not driven; the proof is produced with node:crypto in the pipeline.po-approval-proof.v1 shape
 *       (signature over the intent digest), the same way lib/architecture-design-test-fixture.mjs signs.
 *   A11 State file: .claude/pipeline-state.json (measured by the first native capture; the root key "continuity"
 *       holds queueHead). The in-flight v2 presentation is seeded by direct state write.
 *   A12 "Zero continuity-cas" is asserted through queueHead.dispatch staying null across a SUCCESSFUL approve, plus
 *       the verb ledger of this file; the file never calls continuity-cas.
 *
 * Fixture: synthetic only. Temp git repo, temp HOME and USERPROFILE (no real home), no network. Missing or
 * not-yet-existing modules are imported dynamically per case; the file never crashes as a whole.
 * Never import harness/scripts/pipeline-state.test.mjs (it runs the whole suite on import; TP-5).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const CLI = join(HERE, "pipeline-state.mjs");
const FIXED_AT = "2026-07-07T21:00:00.000Z";
const FEATURE_ID = "e2e";
const PLAN_PATH = "specs/e2e/prd_e2e.md";
const SPEC_PATH = "specs/e2e/spec.md";
const COMPANION_PATHS = ["specs/e2e/design.md", "specs/e2e/traceability.md"];
const REPORT_PATH = "specs/e2e/review/design-review-1.md";
const RECEIPT_PATH = "specs/e2e/review/design-review-receipt-1.json";
const TYPED_CODE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/u;
const NEW_ROUTE_HINT = "present-plan --review-receipt";
const V7_FIELDS = ["designAdvisorAdmissionSha256", "designWorkflowPackagePath", "designWorkflowPackageSha256", "designWorkflowApproval"];
const V8_KEYS = ["schema", "approvedBy", "approvedAt", "submissionSha256", "profileSha256", "poGateAuthority",
  "priorInvalidationSha256", "designApprovalBinding", "designApproval"];
const V8_REQUIRED = V8_KEYS.filter((key) => key !== "priorInvalidationSha256");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const loadLib = (name) => import(pathToFileURL(join(PLUGIN_ROOT, "lib", name)).href);
async function tryLoadLib(name) {
  try { return { ok: true, mod: await loadLib(name) }; } catch (error) { return { ok: false, error }; }
}

const DIRS = [];
function tmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `design-route-${prefix}-`));
  DIRS.push(dir);
  return dir;
}
after(() => {
  for (const dir of DIRS) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

function git(dir, ...args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`fixture git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}
function writeFileIn(dir, rel, text) {
  mkdirSync(join(dir, ...rel.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(join(dir, ...rel.split("/")), text);
}
function readState(dir) {
  return JSON.parse(readFileSync(join(dir, ".claude", "pipeline-state.json"), "utf8"));
}
function cli(fx, args) {
  fx.ledger.push(args[0]);
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: fx.dir, encoding: "utf8", env: fx.env, timeout: 120_000 });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}
function collectStrings(value, out = new Set(), depth = 0) {
  if (depth > 6 || value === null || value === undefined) return out;
  if (typeof value === "string") { out.add(value); return out; }
  if (typeof value === "object" || typeof value === "function") {
    for (const key of Object.keys(value)) { out.add(key); collectStrings(value[key], out, depth + 1); }
  }
  return out;
}

function continuityRequest(authority) {
  return {
    schema: "pipeline.continuity.v0", featureId: FEATURE_ID, revision: 0,
    runtime: { humanFacingLanguage: authority.humanFacing, activeDuty: "Coordinator", sessionCleanup: null },
    authority: { prd: { path: authority.planPath, sha256: authority.planSha256 }, spec: { path: authority.specPath, sha256: authority.specSha256 }, result: null },
    queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
}

/** A git repo in the state "feature plan submitted, awaiting approval", with a finished source set and one passing review receipt. */
async function buildSubmittedFeature(prefix) {
  const poGate = await loadLib("po-gate-authority.mjs");
  const windows = await loadLib("windows-private-state.mjs");
  const receiptLib = await loadLib("design-review-receipt.mjs");
  const dir = tmp(prefix);
  const home = tmp(`${prefix}-home`);
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home };
  const fx = { dir, home, env, ledger: [] };

  git(dir, "init", "-q");
  git(dir, "config", "user.email", "goldfish@example.invalid");
  git(dir, "config", "user.name", "Goldfish");
  git(dir, "config", "core.autocrlf", "false");
  writeFileIn(dir, "README.md", "fixture\n");
  writeFileIn(dir, "project/pipeline.json", `${JSON.stringify({ schema: "pipeline.project.v1", verify: "echo ok" })}\n`);
  git(dir, "add", "--", "README.md");
  git(dir, "commit", "-q", "-m", "init");

  // PO-gate authority, mirrored from seedSubprocessPoGateAuthority (harness/scripts/pipeline-state.test.mjs:874-914).
  writeFileIn(dir, "pipeline.user.yaml", "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\n");
  git(dir, "add", "--", "pipeline.user.yaml");
  git(dir, "commit", "-q", "-m", "fixture: add pipeline policy source", "--", "pipeline.user.yaml");
  writeFileIn(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");

  const specBytes = Buffer.from("# Test Spec\n", "utf8");
  const specSha256 = sha256(specBytes);
  writeFileIn(dir, SPEC_PATH, specBytes.toString("utf8"));
  const prdText = `${poGate.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${poGate.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${specSha256} -->\n# Test PRD\nImplementation surface: \`src/index.mjs\`.\n`;
  writeFileIn(dir, PLAN_PATH, prdText);
  writeFileIn(dir, COMPANION_PATHS[0], "# Design\n");
  writeFileIn(dir, COMPANION_PATHS[1], "| ID | Evidence |\n| --- | --- |\n");
  writeFileIn(dir, REPORT_PATH, "# Design review 1\nVerdict: pass.\n");

  const gitCommonDir = join(dir, ".git");
  const receipt = poGate.createPoGateProfileReceipt({
    repositoryFingerprint: poGate.derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot: dir }),
    primaryRoot: dir,
    sourceBytes: readFileSync(join(dir, "pipeline.user.yaml")),
    runtimeBytes: readFileSync(join(dir, ".claude", "pipeline.yaml")),
    updatedAt: FIXED_AT,
  });
  const receiptFile = poGate.poGateProfileReceiptPath(gitCommonDir);
  mkdirSync(join(gitCommonDir, "agent-pipeline", "po-gate"), { recursive: true });
  if (process.platform === "win32") {
    let cursor = gitCommonDir;
    for (const part of dirname(poGate.PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH).split(/[\\/]/u).filter(Boolean)) {
      cursor = join(cursor, part);
      windows.hardenWindowsPrivateDirectory(cursor);
    }
  }
  writeFileSync(receiptFile, poGate.serializePoGateProfileReceipt(receipt));
  chmodSync(receiptFile, 0o600);

  // Review receipt over the finished sources (contract section 5 fixture F), tracked and clean.
  const sourceFor = (path) => ({ path, sha256: sha256(readFileSync(join(dir, ...path.split("/")))) });
  const created = receiptLib.createDesignReviewReceipt({
    featureId: FEATURE_ID,
    previous: null,
    sources: { prd: sourceFor(PLAN_PATH), spec: sourceFor(SPEC_PATH), companions: COMPANION_PATHS.map(sourceFor) },
    reviewer: { runner: "claude", model: "claude-opus-4" },
    report: sourceFor(REPORT_PATH),
    openFindingIds: [],
    reviewedAt: "2026-10-09T09:00:00.000Z",
  });
  if (!created.ok) throw new Error(`fixture review receipt refused: ${created.code}`);
  writeFileIn(dir, RECEIPT_PATH, Buffer.from(created.bytes).toString("utf8"));
  fx.receiptPath = RECEIPT_PATH;

  // Trust anchor for approve-plan (A10): project/critical-human-proof.json, schema v3, committed.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  fx.signer = { privateKey, publicKeyPem, keyReference: "design-route-fixture-key" };
  writeFileIn(dir, "project/critical-human-proof.json", `${JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [],
    trustAnchors: [{ keyReference: fx.signer.keyReference, publicKeySha256: sha256(publicKeyPem) }],
  }, null, 2)}\n`);

  git(dir, "add", "--", PLAN_PATH, SPEC_PATH, ...COMPANION_PATHS, REPORT_PATH, RECEIPT_PATH, "project/critical-human-proof.json");
  git(dir, "commit", "-q", "-m", "fixture: finished design sources and review receipt");

  const featureSet = cli(fx, ["set-feature", "--id", FEATURE_ID, "--plan-path", PLAN_PATH]);
  if (featureSet.status !== 0) throw new Error(`fixture set-feature failed: ${featureSet.stderr}`);
  const requestRel = "continuity-init-request.json";
  writeFileIn(dir, requestRel, `${JSON.stringify(continuityRequest({
    humanFacing: "de", planPath: PLAN_PATH, planSha256: sha256(readFileSync(join(dir, PLAN_PATH))),
    specPath: SPEC_PATH, specSha256: sha256(readFileSync(join(dir, SPEC_PATH))),
  }), null, 2)}\n`);
  const initialized = cli(fx, ["continuity-init", "--expected-revision", "absent", "--request-file", requestRel, "--lock-token", "token-00000001"]);
  if (initialized.status !== 0) throw new Error(`fixture continuity-init failed: ${initialized.stderr}`);
  const submitted = cli(fx, ["submit-plan", "--by", "coordinator", "--profile", "feature"]);
  if (submitted.status !== 0) throw new Error(`fixture submit-plan --profile feature failed: ${submitted.stderr}`);
  return fx;
}

/** The whole route, run once and shared by route cases 1-4. Never throws: each step records its outcome. */
let routePromise;
function routeRun() { routePromise ??= runRoute(); return routePromise; }
async function runRoute() {
  const out = { steps: [] };
  out.fx = await buildSubmittedFeature("route");
  const { fx } = out;
  out.dispatchBefore = readState(fx.dir).continuity?.queueHead?.dispatch ?? null;
  out.present = cli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  if (out.present.status !== 0) return out;
  const signLines = out.present.stdout.split(/\r?\n/u).filter((line) => /sign-intent/u.test(line));
  out.signLines = signLines;
  const match = /--request\s+(?:"([^"]+)"|'([^']+)'|(\S+))/u.exec(signLines[0] ?? "");
  out.requestAbs = match ? (match[1] ?? match[2] ?? match[3]) : null;
  if (out.requestAbs === null || !existsSync(out.requestAbs)) return out;
  out.request = JSON.parse(readFileSync(out.requestAbs, "utf8"));
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: out.request.approvalIntent?.sha256,
    keyReference: fx.signer.keyReference,
    publicKey: fx.signer.publicKeyPem,
    signatureBase64: sign(null, Buffer.from(String(out.request.approvalIntent?.sha256)), fx.signer.privateKey).toString("base64"),
  };
  out.proofAbs = join(dirname(out.requestAbs), basename(out.requestAbs).replace("request", "proof"));
  writeFileSync(out.proofAbs, `${JSON.stringify(proof, null, 2)}\n`);
  const requestRel = relative(realpathSync(fx.dir), realpathSync(out.requestAbs)).split(sep).join("/");
  out.approve = cli(fx, ["approve-plan", "--by", "po-test", "--design-approval-request", requestRel]);
  out.stateAfter = readState(fx.dir);
  return out;
}

test("route 1: present-plan --review-receipt accepts finished sources and hands over ONE ready sign command", async (t) => {
  const run = await routeRun();
  t.diagnostic(`present-plan exit ${run.present.status}; stderr: ${run.present.stderr.trim()}`);
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0; stderr: ${run.present.stderr}`);
  assert.equal(run.signLines.length, 1, `exactly one line names sign-intent; stdout: ${run.present.stdout}`);
  assert.match(run.signLines[0], /--repo-root\s+\S+/u);
  assert.ok(run.requestAbs !== null && isAbsolute(run.requestAbs), "the sign command carries an absolute --request path");
  assert.ok(existsSync(run.requestAbs), "the printed request file exists");
  assert.equal(run.request.schema, "pipeline.design-approval-request.v1");
  assert.match(run.request.bindingSha256, /^[a-f0-9]{64}$/u);
  assert.match(run.request.approvalIntent.sha256, /^[a-f0-9]{64}$/u);
  assert.equal("packageSha256" in run.request, false, "no design-workflow package field in the new request");
  const presentation = readState(run.fx.dir).planPresentation;
  assert.ok(presentation, "a presentation is recorded");
  for (const key of ["designWorkflowPackagePath", "designWorkflowPackageSha256"]) {
    assert.equal(key in presentation, false, `presentation carries no ${key}`);
  }
});

test("route 2: sign, approve-plan --design-approval-request, and a pipeline.plan-approval.v8 record", async (t) => {
  const run = await routeRun();
  t.diagnostic(`present-plan exit ${run.present.status}; stderr: ${run.present.stderr.trim()}`);
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0 first; stderr: ${run.present.stderr}`);
  assert.ok(run.approve, "approve-plan was reached (request file named and found)");
  t.diagnostic(`approve-plan exit ${run.approve.status}; stderr: ${run.approve.stderr.trim()}`);
  assert.equal(run.approve.status, 0, `approve-plan --design-approval-request must exit 0; stderr: ${run.approve.stderr}`);
  const state = run.stateAfter;
  assert.equal(state.planApproved, true);
  const record = state.planApproval;
  assert.equal(record.schema, "pipeline.plan-approval.v8");
  for (const key of V8_REQUIRED) assert.ok(key in record, `v8 record has ${key}`);
  for (const key of Object.keys(record)) assert.ok(V8_KEYS.includes(key), `v8 record has no key outside the closed set: ${key}`);
  for (const key of V7_FIELDS) assert.equal(key in record, false, `v8 record drops ${key}`);
  assert.notEqual(record.designApprovalBinding, null);
  assert.equal(record.designApproval.schema, "pipeline.design-approval.v1");
  assert.equal(record.designApproval.mode, "signature");
  assert.ok(record.designApproval.proof && record.designApproval.proofSha256, "signature mode carries a proof and its digest");
  assert.equal(record.designApproval.intentSha256, run.request.approvalIntent.sha256);
  const { canonical } = await loadLib("po-approval-proof.mjs");
  assert.equal(record.designApproval.bindingSha256, sha256(canonical(record.designApprovalBinding)));
  assert.equal(record.designApproval.bindingSha256, run.request.bindingSha256);
});

test("route 3: the boundary library admits the approved v8 record", async (t) => {
  const run = await routeRun();
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0 first; stderr: ${run.present.stderr}`);
  assert.equal(run.approve?.status, 0, `approve-plan must exit 0 first; stderr: ${run.approve?.stderr}`);
  const state = run.stateAfter;
  assert.equal(state.planApproval?.schema, "pipeline.plan-approval.v8", "an unapproved state must not read ok:true here");
  const loaded = await tryLoadLib("guard-devplan-policy.mjs");
  assert.ok(loaded.ok, `guard-devplan-policy.mjs imports: ${loaded.error?.message}`);
  assert.equal(typeof loaded.mod.designAdvisoryAdmission, "function");
  const authority = state.planApproval.poGateAuthority;
  const admitted = await loaded.mod.designAdvisoryAdmission(state, run.fx.dir, authority.planPath, authority.specPath);
  t.diagnostic(`designAdvisoryAdmission: ${JSON.stringify(admitted)}`);
  assert.equal(admitted?.ok, true, `the boundary must admit the v8 record: ${JSON.stringify(admitted)}`);
});

test("route 4: zero continuity-cas -- queueHead.dispatch stays unregistered across a successful present and approve", async () => {
  const run = await routeRun();
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0; stderr: ${run.present.stderr}`);
  assert.equal(run.approve?.status, 0, `approve-plan must exit 0 (else the check below would pass vacuously); stderr: ${run.approve?.stderr}`);
  assert.equal(run.dispatchBefore, null, "no dispatch is registered after submit-plan");
  assert.equal(run.stateAfter.continuity?.queueHead?.dispatch ?? null, null, "no dispatch is registered after approve-plan");
  assert.equal(run.fx.ledger.includes("continuity-cas"), false, "the route never needs the continuity-cas verb");
});

test("decision V: an in-flight v2 presentation is refused with a typed code naming present-plan --review-receipt", async (t) => {
  const fx = await buildSubmittedFeature("decision-v");
  const { sha256CanonicalJson } = await loadLib("plan-spec-state-v2.mjs");
  const statePath = join(fx.dir, ".claude", "pipeline-state.json");
  const state = readState(fx.dir);
  const packageSha256 = "d".repeat(64);
  state.planPresentation = {
    schema: "pipeline.plan-presentation.v2",
    submissionSha256: sha256CanonicalJson(state.planSubmission),
    presentedBy: "coordinator",
    presentedAt: "2026-10-09T10:00:00.000Z",
    designWorkflowPackagePath: "specs/e2e/design-workflow-package.json",
    designWorkflowPackageSha256: packageSha256,
    designWorkflowApprovalRequestPath: `scratch/design-workflow-approval-request-${packageSha256}.json`,
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const refused = cli(fx, ["approve-plan", "--by", "po-test"]);
  t.diagnostic(`approve-plan exit ${refused.status}; stderr: ${refused.stderr.trim()}`);
  assert.notEqual(refused.status, 0, "approve-plan refuses the in-flight v2 presentation");
  assert.match(refused.stderr, TYPED_CODE, "the refusal carries a typed code (pattern, not a pinned name: A1)");
  assert.ok(refused.stderr.includes(NEW_ROUTE_HINT), `the refusal names ${NEW_ROUTE_HINT}; stderr: ${refused.stderr}`);
  const after = readState(fx.dir);
  assert.equal(after.planApproved === true, false, "no approval was written");
  assert.equal(after.planApproval === undefined || after.planApproval === null, true);
});

test("retired: present-plan --design-workflow-package returns DWP-PRESENT-RETIRED", async (t) => {
  const fx = await buildSubmittedFeature("retired-present");
  const refused = cli(fx, ["present-plan", "--by", "coordinator", "--design-workflow-package", "specs/e2e/design-workflow-package.json"]);
  t.diagnostic(`present-plan exit ${refused.status}; stderr: ${refused.stderr.trim()}`);
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /DWP-PRESENT-RETIRED/u);
  assert.ok(`${refused.stdout}\n${refused.stderr}`.includes(NEW_ROUTE_HINT), "names the new route");
});

test("retired: approve-plan --design-workflow-approval-request returns DWP-APPROVAL-REQUEST-RETIRED (A2: mapping from the plan)", async (t) => {
  const fx = await buildSubmittedFeature("retired-approve");
  const request = `scratch/design-workflow-approval-request-${"e".repeat(64)}.json`;
  const refused = cli(fx, ["approve-plan", "--by", "po-test", "--design-workflow-approval-request", request]);
  t.diagnostic(`approve-plan exit ${refused.status}; stderr: ${refused.stderr.trim()}`);
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /DWP-APPROVAL-REQUEST-RETIRED/u);
});

const RETIRED_SCRIPTS = [
  ["design-advisory-coordinator.mjs", "DESIGN-ADVISORY-COURSE-RETIRED"],
  ["design-advisory-admission.mjs", "DESIGN-ADVISORY-COURSE-RETIRED"],
  ["design-course-session.mjs", "DESIGN-COURSE-RETIRED"],
  ["design-course-coordinator.mjs", "DESIGN-COURSE-RETIRED"],
  ["runner-design-readiness-bootstrap.mjs", "DESIGN-COURSE-RETIRED"],
];
for (const [script, code] of RETIRED_SCRIPTS) {
  test(`retired: scripts/${script} returns ${code} and names the new route (A3)`, (t) => {
    const dir = tmp(`retired-${script}`);
    const result = spawnSync(process.execPath, [join(HERE, script)], {
      cwd: dir, encoding: "utf8", input: "", timeout: 30_000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: dir, USERPROFILE: dir },
    });
    const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    t.diagnostic(`${script} exit ${result.status}; output: ${text.trim().slice(0, 300)}`);
    assert.notEqual(result.status, 0, "a retired entry point exits non-zero");
    assert.ok(text.includes(code), `output names ${code}`);
    assert.ok(text.includes(NEW_ROUTE_HINT), `output names ${NEW_ROUTE_HINT}`);
  });
}

test("retired: lib/retired-design-codes.mjs holds the four retirement codes (A4)", async () => {
  const loaded = await tryLoadLib("retired-design-codes.mjs");
  assert.ok(loaded.ok, `lib/retired-design-codes.mjs imports: ${loaded.error?.message}`);
  const strings = collectStrings(loaded.mod);
  for (const code of ["DESIGN-COURSE-RETIRED", "DESIGN-ADVISORY-COURSE-RETIRED", "DWP-PRESENT-RETIRED", "DWP-APPROVAL-REQUEST-RETIRED"]) {
    assert.ok(strings.has(code), `the table holds ${code}`);
  }
});
