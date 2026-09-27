// SPDX-License-Identifier: SUL-1.0

/**
 * Production hand-off for the required initial-design Advisor consultation.
 *
 * This module owns the binding between a governed package and the private
 * receipt target.  In particular, a caller cannot pick a scratch receipt
 * filename, a role, a model, or an evidence set: all of those are derived
 * from the physical package and the trusted runner invocation context.
 *
 * It deliberately does not decide the unavailable exception.  That exception
 * needs the final, ledger-backed PO approval and is admitted by the protected
 * implementation-transition authority, not by this transport coordinator.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { advisoryEvidenceBundleSha256, buildAdvisoryEvidenceBundle, createAdvisoryDemand } from "./advisory-lifecycle-v2.mjs";
import { validateAdvisoryAttemptTrail } from "./advisory-attempt-trail.mjs";
import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";
import { DESIGN_ADVISORY_RECEIPT_DIRECTORY, readDesignAdvisoryTransaction, writeDesignAdvisoryTransaction } from "./design-advisory-transaction.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;
const RUNNERS = new Set(["claude", "codex", "antigravity"]);

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) { return `${JSON.stringify(value)}\n`; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }

function physicalDirectory(path, code) {
  let info;
  try { info = lstatSync(path); } catch { fail(code, "directory is unavailable"); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(code, "directory is not physical");
  return resolve(path);
}
function physicalFile(path, code) {
  let info;
  try { info = lstatSync(path); } catch { fail(code, "file is unavailable"); }
  if (!info.isFile() || info.isSymbolicLink()) fail(code, "file is not a physical regular file");
  return path;
}
function safePath(value, name) {
  if (typeof value !== "string" || !PATH.test(value)) fail("DAC-PATH", `${name} is not a normalized repository path`);
  return value;
}
function inside(root, target) {
  const rel = relative(root, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${"/"}`) && !rel.startsWith("..\\");
}
function bytesAt(root, path, code) {
  const target = resolve(root, safePath(path, code));
  if (!inside(root, target)) fail("DAC-PATH", `${code} escapes repository root`);
  physicalFile(target, code);
  return readFileSync(target);
}
function git(root, args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { fail("DAC-GIT", "required Git candidate identity is unavailable"); }
}
function gitCommonDir(root) {
  const raw = git(root, ["rev-parse", "--git-common-dir"]);
  const target = resolve(root, raw);
  return physicalDirectory(target, "DAC-GIT-COMMON");
}
function runtimeContext(value) {
  if (!exact(value, ["runner", "profile"]) || !RUNNERS.has(value.runner) || !["epic", "feature"].includes(value.profile)) {
    fail("DAC-RUNTIME", "trusted runner context is invalid");
  }
  return Object.freeze({ runner: value.runner, profile: value.profile });
}

/** A stable receipt identity changes for any governed package or candidate drift. */
export function designAdvisoryReceiptBinding({ root, featureId, planPath, specPath, planSha256, specSha256, candidateCommit, candidateTree, runner }) {
  if (!ID.test(featureId ?? "") || !RUNNERS.has(runner) || !/^[a-f0-9]{40,64}$/u.test(candidateCommit ?? "") || !/^[a-f0-9]{40,64}$/u.test(candidateTree ?? "")) {
    fail("DAC-BINDING", "Advisor receipt binding inputs are invalid");
  }
  const packageBinding = {
    schema: "pipeline.design-advisory-package-binding.v1",
    rootSha256: sha(Buffer.from(root, "utf8")),
    featureId,
    plan: { path: planPath, sha256: planSha256 },
    spec: { path: specPath, sha256: specSha256 },
    candidate: { commit: candidateCommit, tree: candidateTree },
    runner,
  };
  const packageSha256 = sha(Buffer.from(canonical(packageBinding), "utf8"));
  return Object.freeze({ packageBinding, packageSha256, receiptId: `design-advisor-${packageSha256}` });
}

function questionFor({ planBytes }) {
  const question = [
    planBytes.toString("utf8"),
  ].join("");
  if (Buffer.byteLength(question, "utf8") > 262_144) fail("DAC-QUESTION", "governed design package is too large for one bounded Advisor question");
  return question;
}

function receiptTarget(common, receiptId) {
  const directory = join(common, DESIGN_ADVISORY_RECEIPT_DIRECTORY);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  physicalDirectory(directory, "DAC-RECEIPT-DIRECTORY");
  return join(directory, `${receiptId}.json`);
}
function currentProjectionSha(root) {
  const target = join(root, "project", "design-advisory-admission.json");
  if (!existsSync(target)) return null;
  physicalFile(target, "DAC-PROJECTION");
  return sha(readFileSync(target));
}

/**
 * Invoke one fresh Advisor through the existing host bridge, persist the
 * package-derived receipt, require an Elephant disposition, then publish and
 * re-read the sanctioned admission transaction.
 *
 * `runtime` is supplied by a runner adapter, not by a package author.  It is
 * intentionally limited to runner/profile; route, role, evidence paths and
 * receipt target are all derived here.
 */
export async function coordinateDesignAdvisory({
  repoRoot,
  runtime,
  featureId,
  planPath,
  specPath,
  disposition = null,
  expectedPublicSha256 = undefined,
  invokeBridge,
  writeAdmission = writeDesignAdvisoryTransaction,
  readAdmission = readDesignAdvisoryTransaction,
  now = () => Date.now(),
} = {}) {
  const root = physicalDirectory(resolve(repoRoot ?? ""), "DAC-ROOT");
  const trustedRuntime = runtimeContext(runtime);
  if (!ID.test(featureId ?? "")) fail("DAC-FEATURE", "feature id is invalid");
  const plan = safePath(planPath, "plan");
  const spec = safePath(specPath, "spec");
  if (plan === spec) fail("DAC-PACKAGE", "plan and specification must be distinct files");
  if (typeof invokeBridge !== "function") fail("DAC-BRIDGE", "Advisor host bridge is unavailable");
  const planBytes = bytesAt(root, plan, "DAC-PLAN");
  const specBytes = bytesAt(root, spec, "DAC-SPEC");
  const candidateCommit = git(root, ["rev-parse", "HEAD"]);
  const candidateTree = git(root, ["rev-parse", "HEAD^{tree}"]);
  const common = gitCommonDir(root);
  const binding = designAdvisoryReceiptBinding({
    root, featureId, planPath: plan, specPath: spec, planSha256: sha(planBytes), specSha256: sha(specBytes),
    candidateCommit, candidateTree, runner: trustedRuntime.runner,
  });
  const target = receiptTarget(common, binding.receiptId);
  if (existsSync(target)) fail("DAC-RECEIPT-EXISTS", "package-derived Advisor receipt already exists; inspect or recover the existing transaction instead of replacing it");
  const references = [plan, spec];
  const evidenceBundle = buildAdvisoryEvidenceBundle(root, references);
  // The receipt contract binds questionSha256 to the immutable initial design
  // itself. The independently bound Spec is an evidence reference, not text
  // spliced into the question; this prevents a second, undocumented digest.
  const question = questionFor({ planBytes });
  const dispatch = { dispatchId: binding.receiptId, queueRevision: 0, candidateCommit, candidateTree };
  const demandResult = createAdvisoryDemand({
    runner: trustedRuntime.runner,
    profile: trustedRuntime.profile,
    reason: "architecture-tradeoff",
    question,
    evidenceSha256: advisoryEvidenceBundleSha256(evidenceBundle),
    dispatch,
  });
  if (!demandResult.ok) fail("DAC-DEMAND", `Advisor demand could not be constructed (${demandResult.code})`);
  const input = {
    profile: trustedRuntime.profile,
    runner: trustedRuntime.runner,
    question,
    dispatch,
    demand: demandResult.demand,
    references,
    evidenceBundle,
    // Export consent is intentionally left at the host bridge's safe default.
    // A runner adapter may only narrow it through its own authority surface.
    advisorExport: { consent: "default" },
    receiptId: binding.receiptId,
    designAdvisoryBinding: {
      featureId,
      planPath: plan,
      specPath: spec,
      planSha256: sha(planBytes),
      specSha256: sha(specBytes),
      packageSha256: binding.packageSha256,
    },
  };
  const scratch = mkdtempSync(join(tmpdir(), "pipeline-design-advisor-"));
  const inputPath = join(scratch, "bridge-input.json");
  try {
    writeFileSync(inputPath, JSON.stringify(input), { encoding: "utf8", flag: "wx", mode: 0o600 });
    const bridgeCode = await invokeBridge({ inputPath, receiptPath: target, repoRoot: root, input, timeoutMs: 180_000 });
    if (!existsSync(target)) fail("DAC-RECEIPT-MISSING", "Advisor host bridge returned without the required private receipt");
    physicalFile(target, "DAC-RECEIPT-PATH");
    const receiptBytes = readFileSync(target);
    const receipt = JSON.parse(receiptBytes.toString("utf8"));
    const validated = validateAdvisoryReceipt(receipt);
    if (!validated.ok || receipt.receiptId !== binding.receiptId
      || receipt.dispatch.dispatchId !== binding.receiptId
      || receipt.dispatch.candidateCommit !== candidateCommit || receipt.dispatch.candidateTree !== candidateTree
      || receipt.questionSha256 !== sha(Buffer.from(question, "utf8")) || receipt.configuredRoute.runner !== trustedRuntime.runner) {
      fail("DAC-RECEIPT-BINDING", "Advisor receipt is forged, stale, or bound to a different package");
    }
    const currentPlan = bytesAt(root, plan, "DAC-PLAN");
    const currentSpec = bytesAt(root, spec, "DAC-SPEC");
    const currentCommit = git(root, ["rev-parse", "HEAD"]);
    const currentTree = git(root, ["rev-parse", "HEAD^{tree}"]);
    if (sha(currentPlan) !== sha(planBytes) || sha(currentSpec) !== sha(specBytes)
      || currentCommit !== candidateCommit || currentTree !== candidateTree) {
      fail("DAC-PACKAGE-DRIFT", "governed package or candidate changed while the Advisor was running");
    }
    if (bridgeCode !== 0 || receipt.observed.status !== "answered") {
      if (bridgeCode === 0 || receipt.observed.status === "answered") {
        fail("DAC-BRIDGE-RESULT", "Advisor host exit and receipt disagree");
      }
      const trailTarget = `${target}.attempts-v1.json`;
      physicalFile(trailTarget, "DAC-ATTEMPT-TRAIL-MISSING");
      const trailBytes = readFileSync(trailTarget);
      if (trailBytes.length > 16 * 1024) fail("DAC-ATTEMPT-TRAIL-INVALID", "Advisor attempt trail exceeds its byte bound");
      let trail;
      try { trail = JSON.parse(trailBytes.toString("utf8")); }
      catch { fail("DAC-ATTEMPT-TRAIL-INVALID", "Advisor attempt trail is malformed"); }
      const checked = validateAdvisoryAttemptTrail({ trail, receipt, receiptBytes,
        requireNativeThenConsult: trustedRuntime.runner === "claude" });
      if (!checked.ok) fail("DAC-ATTEMPT-TRAIL-INVALID", `Advisor routes were not exhausted (${checked.code})`);
      // This is only an immutable pre-approval input. In particular it does
      // not publish the public admission record or manufacture an approved
      // exception before the one final human package decision exists.
      return Object.freeze({
        schema: "pipeline.design-advisory-coordinator-result.v1",
        status: "unavailable-pending-final-approval",
        binding: { packageSha256: binding.packageSha256, receiptId: binding.receiptId, candidateCommit, candidateTree },
        bridge: { code: bridgeCode, target, observedAtMs: now() },
        attemptTrail: { sha256: sha(trailBytes), attempts: checked.attempts },
        write: null,
        readback: null,
      });
    }
    if (!exact(disposition, ["decision", "rationale"]) || !["accept", "decline"].includes(disposition.decision)
      || typeof disposition.rationale !== "string" || disposition.rationale.trim().length === 0) {
      fail("DAC-DISPOSITION", "Elephant disposition and non-empty rationale are required after a fresh Advisor result");
    }
    const observedPreimage = currentProjectionSha(root);
    const expected = expectedPublicSha256 === undefined ? observedPreimage : expectedPublicSha256;
    const write = writeAdmission({
      repoRoot: root,
      gitCommonDir: common,
      featureId,
      planPath: plan,
      specPath: spec,
      receiptId: binding.receiptId,
      // The selected adapter is not the preflight capability: a successful
      // consult may follow a native attempt that failed. Keep that attempt
      // visible in the admission instead of rewriting history as if native
      // had never been available.
      nativeAvailable: receipt.adapter === "native" || receipt.fallback.reason.startsWith("native-"),
      disposition: { decision: disposition.decision, rationale: disposition.rationale },
      finalApprovalValid: false,
      expectedPublicSha256: expected,
    });
    const readback = readAdmission({ repoRoot: root, gitCommonDir: common, featureId, planPath: plan, specPath: spec, finalApprovalValid: false });
    return Object.freeze({
      schema: "pipeline.design-advisory-coordinator-result.v1",
      status: "admitted",
      binding: { packageSha256: binding.packageSha256, receiptId: binding.receiptId, candidateCommit, candidateTree },
      bridge: { code: bridgeCode, target, observedAtMs: now() },
      write,
      readback: { id: readback.id, mode: readback.mode },
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
