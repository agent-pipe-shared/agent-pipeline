// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0100 (D252, test round 28d finding C6): `configure-verify --replace` replaces a configured verify command during implementation.
 *
 *   runVerifyReplacementTestRun     the new command runs once on a clean tree (shell, project root, timeout), the way the consumer Verify
 *                                   check runs it; a private receipt records the outcome; the tree must be unchanged afterwards
 *   buildVerifyReplacementSubject   the one subject builder the recording step and the signing terminal share: the latest passing
 *                                   test-run receipt at the clean HEAD names the new command; the post-images come from the transition's
 *                                   own byte rule (calibrationVerifyReplacementImages)
 *   verifyReplacementApproval       the stored PO approval of exactly that subject, or null
 *
 * The write itself is the existing configure-verify commit transition with a `replacement` member (calibration-verify-commit-transition.mjs).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { VERIFY_REPLACEMENT_KIND } from "./critical-action-approval-request.mjs";
import { readPrivateApprovals } from "./critical-action-authorization.mjs";
import { calibrationVerifyReplacementImages } from "./calibration-verify-commit-transition.mjs";
import { ensureHardenedPrivateDirectory } from "./hardened-private-directory.mjs";
import { readPrivateJson, writePrivateJsonAtomic } from "./private-boundary.mjs";
import { resolveAuthorityArtifactPath } from "./project-authority-read.mjs";

export { VERIFY_REPLACEMENT_KIND };
export const VERIFY_REPLACEMENT_TEST_RUN_SCHEMA = "pipeline.verify-replacement-test-run.v1";
export const VERIFY_REPLACEMENT_SUBJECT_SCHEMA = "pipeline.verify-replacement-subject.v1";
export const VERIFY_REPLACEMENT_TEST_TIMEOUT_MS = 30 * 60_000;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA = /^[a-f0-9]{64}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const gitOk = (result) => result && !result.error && result.status === 0;
const directoryOf = (commonDir) => join(commonDir, "agent-pipeline", "verify-replacement");
// The rule the consumer Verify check applies to the configured command (scripts/consumer-verify-check.mjs).
const SELF_REFERENCE = /verify-evidence-producer\.mjs|consumer-verify\.mjs|consumer-verify-check\.mjs/u;

function gitRunner(root) {
  return (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
}

function treeFacts(git) {
  const commit = git(["rev-parse", "--verify", "--quiet", "HEAD"]), tree = git(["rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!gitOk(commit) || !gitOk(tree) || !gitOk(status)) return null;
  return { commit: String(commit.stdout).trim(), tree: String(tree.stdout).trim(), status: String(status.stdout) };
}

/** Whether the tracked tree is clean (untracked files are allowed; the test run must leave them as they were). */
function trackedClean(status) {
  return status.split("\0").filter(Boolean).every((line) => line.startsWith("??"));
}

/**
 * Runs `verifyCommand` once and records the private receipt. `{ ok: true, receipt, receiptSha256 }`, or `{ ok: false, code, detail }`
 * with CVR-COMMAND, CVR-DIRTY, CVR-HEAD-UNAVAILABLE, CVR-TEST-RUN-RED, CVR-TEST-RUN-DRIFT or CVR-RECEIPT-WRITE.
 */
export function runVerifyReplacementTestRun({ root, commonDir, verifyCommand, timeoutMs = VERIFY_REPLACEMENT_TEST_TIMEOUT_MS, runGit = null, spawn = spawnSync, now = () => new Date() } = {}) {
  if (typeof verifyCommand !== "string" || verifyCommand.trim() === "" || /[\r\n\0]/u.test(verifyCommand) || SELF_REFERENCE.test(verifyCommand)) {
    return { ok: false, code: "CVR-COMMAND", detail: "the verify command must name the project's own command on one line, not the evidence producer or the Verify adapter" };
  }
  const git = runGit ?? gitRunner(root);
  const before = treeFacts(git);
  if (before === null) return { ok: false, code: "CVR-HEAD-UNAVAILABLE", detail: "HEAD or the working tree could not be read" };
  if (!trackedClean(before.status)) return { ok: false, code: "CVR-DIRTY", detail: "the test run binds the clean HEAD; commit or restore the tracked changes first" };
  const started = Date.now();
  const run = spawn(verifyCommand, { cwd: root, shell: true, encoding: "buffer", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const durationMs = Date.now() - started;
  const after = treeFacts(git);
  const output = Buffer.concat([Buffer.isBuffer(run?.stdout) ? run.stdout : Buffer.alloc(0), Buffer.isBuffer(run?.stderr) ? run.stderr : Buffer.alloc(0)]);
  const exitCode = Number.isSafeInteger(run?.status) ? run.status : null;
  const receipt = { schema: VERIFY_REPLACEMENT_TEST_RUN_SCHEMA, commandSha256: sha256(verifyCommand), verifyCommand, candidate: { commit: before.commit, tree: before.tree },
    exitCode, signal: typeof run?.signal === "string" ? run.signal : null, timedOut: run?.error?.code === "ETIMEDOUT", durationMs, outputSha256: sha256(output),
    observedAt: now().toISOString() };
  const drifted = after === null || after.commit !== before.commit || after.tree !== before.tree || after.status !== before.status;
  if (!drifted && exitCode === 0) {
    try {
      const directory = directoryOf(commonDir);
      ensureHardenedPrivateDirectory(commonDir, directory);
      writePrivateJsonAtomic(join(directory, `test-run-${receipt.commandSha256.slice(0, 32)}-${before.commit.slice(0, 16)}.json`), receipt);
    } catch { return { ok: false, code: "CVR-RECEIPT-WRITE", detail: "the test-run receipt could not be written to the private store" }; }
  }
  if (drifted) return { ok: false, code: "CVR-TEST-RUN-DRIFT", detail: "the test run changed HEAD or the working tree; the command must leave the tree as it found it (write build output to an ignored path)", receipt };
  if (exitCode !== 0) return { ok: false, code: "CVR-TEST-RUN-RED", detail: `the new command did not pass (${exitCode === null ? (receipt.timedOut ? "timed out" : `signal ${receipt.signal ?? "unknown"}`) : `exit ${exitCode}`}); nothing is signed`, receipt };
  return { ok: true, receipt, receiptSha256: sha256(JSON.stringify(receipt)) };
}

/** The passing test-run receipts recorded at `candidate`, newest first. */
function passingReceiptsAt(commonDir, candidate) {
  const directory = directoryOf(commonDir);
  if (!existsSync(directory)) return [];
  let names = [];
  try { names = readdirSync(directory).filter((name) => /^test-run-[a-f0-9]{32}-[a-f0-9]{16}\.json$/u.test(name)).slice(0, 1024); } catch { return []; }
  const found = [];
  for (const name of names) {
    let receipt; try { receipt = readPrivateJson(join(directory, name)); } catch { continue; }
    if (receipt?.schema !== VERIFY_REPLACEMENT_TEST_RUN_SCHEMA || receipt.exitCode !== 0 || !object(receipt.candidate)
      || receipt.candidate.commit !== candidate.commit || receipt.candidate.tree !== candidate.tree || typeof receipt.verifyCommand !== "string"
      || sha256(receipt.verifyCommand) !== receipt.commandSha256) continue;
    found.push(receipt);
  }
  return found.sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)));
}

/**
 * The subject of the PO's one signature. `verifyCommand` null takes the newest passing test run at the clean HEAD (the signing terminal
 * derives it); a given command must have one. `{ ok: true, subject, candidate, featureId }` or `{ ok: false, code, detail }`.
 */
export function buildVerifyReplacementSubject({ root, commonDir, verifyCommand = null, runGit = null, readState = null } = {}) {
  let state;
  try { state = readState ? readState(root) : JSON.parse(readFileSync(resolveAuthorityArtifactPath("state", { rootDir: root }).path, "utf8")); }
  catch { return { ok: false, code: "CVR-STATE-UNAVAILABLE", detail: "the project State could not be read" }; }
  const featureId = state?.activeFeature?.id;
  if (typeof featureId !== "string" || featureId === "") return { ok: false, code: "CVR-NO-FEATURE", detail: "a replacement belongs to the active feature; there is none" };
  const git = runGit ?? gitRunner(root);
  const facts = treeFacts(git);
  if (facts === null) return { ok: false, code: "CVR-HEAD-UNAVAILABLE", detail: "HEAD or the working tree could not be read" };
  if (!trackedClean(facts.status)) return { ok: false, code: "CVR-DIRTY", detail: "the replacement binds the clean HEAD; commit or restore the tracked changes first" };
  const candidate = { commit: facts.commit, tree: facts.tree };
  const receipts = passingReceiptsAt(commonDir, candidate).filter((receipt) => verifyCommand === null || receipt.verifyCommand === verifyCommand);
  if (receipts.length === 0) return { ok: false, code: "CVR-TEST-RUN-REQUIRED", detail: "no passing test run of the new command at this HEAD; run configure-verify --verify-command <new> --replace first" };
  const receipt = receipts[0];
  const images = calibrationVerifyReplacementImages({ rootDir: root, verifyCommand: receipt.verifyCommand });
  if (!images.ok) return { ok: false, code: images.code, detail: "the committed calibration cannot take this replacement" };
  if (images.head !== candidate.commit || images.tree !== candidate.tree) return { ok: false, code: "CVR-CANDIDATE", detail: "HEAD moved while the subject was built" };
  const subject = { schema: VERIFY_REPLACEMENT_SUBJECT_SCHEMA, featureId, previousCommand: images.previousCommand, verifyCommand: receipt.verifyCommand,
    testRunSha256: sha256(JSON.stringify(receipt)), entries: images.entries };
  return { ok: true, subject, candidate, featureId };
}

/** The stored approval of exactly this subject digest, or null. */
export function verifyReplacementApproval({ commonDir, subjectSha256, readApprovals = readPrivateApprovals }) {
  if (!SHA.test(subjectSha256 ?? "")) return null;
  let envelopes = [];
  try { envelopes = readApprovals(commonDir, VERIFY_REPLACEMENT_KIND); } catch { envelopes = []; }
  for (const envelope of envelopes) {
    const approval = envelope?.approval;
    if (object(approval) && approval.subjectSha256 === subjectSha256 && OID.test(approval.forCommit ?? "")) return approval;
  }
  return null;
}

/** The lines the signing terminal shows the PO before the signature. */
export function verifyReplacementConfirmationLines(subject) {
  if (!object(subject) || !Array.isArray(subject.entries)) return [];
  return [
    `feature: ${subject.featureId}`,
    `verify command now: ${subject.previousCommand}`,
    `verify command after: ${subject.verifyCommand}`,
    `the new command ran once at this HEAD and passed (test-run receipt ${String(subject.testRunSha256).slice(0, 16)})`,
    ...subject.entries.map((entry) => `writes ${entry.path} (sha256 ${String(entry.afterSha256).slice(0, 16)}); nothing else changes`),
    "this one signature covers both calibration files; the change is committed by the configure-verify route and the close lists it as proof kind verify-replacement.",
  ];
}

/**
 * ADR-0100 (D252, test round 28d finding C6): `configure-verify --verify-command <new> --replace --by <label>` replaces a configured
 * verify command during implementation. First call: the new command runs once on the clean tree (it must pass and leave the tree as
 * it was), then the signing request for the one PO signature over both mirrors is printed. Second call (with the proof paths, or with
 * an approval already recorded for this exact subject): the mirrors are written with exactly the signed bytes through the existing
 * configure-verify commit transition, which carries the `replacement` member the pre-commit hook and the close read.
 *
 * The route lives here, not in pipeline-state.mjs, because that file must stay under the session authority's 1 MiB source-entry
 * bound (SESSION_AUTHORITY_LIMITS.maxSourceEntryBytes; WIN-AUTH-SIZE / source-entry-bound past it). pipeline-state.mjs passes its own
 * internals in `internals`; this module imports nothing from it.
 */
export function runConfigureVerifyReplaceRoute({ dir, rest, base, now, deps }, internals) {
  const { scriptPath, criticalProofRefusalHint, criticalProofWaiverFor, parseExactFlags, isBlank, classifyVerifyCommand, derivePlanLifecycle,
    isLateVerifyRecoveryLifecycle, inspectCommittedCalibrationVerifyLayout, resolveCriticalApprovalCommonDir, criticalActionSubjectSha256,
    authorizeCriticalActionCommand, defaultGitCommonDir, criticalScratchArtifactPaths, awaitSignatureFields, verifyCriticalHumanProof,
    isCriticalProofConsumedPrivately, chatAttributionRecord, writeCriticalApproval, retireDeadCalibrationContinuityLock,
    prepareCalibrationVerifyCommitTransition, sameJson, writeCalibrationVerifyCommand, completeCalibrationVerifyCommitTransition,
    printVerificationTierCommit } = internals;
  const kind = VERIFY_REPLACEMENT_KIND;
  const refuse = (code, detail = "") => { console.error(`Error: configure-verify --replace refused (${code}).${detail ? ` ${detail}` : ""}${criticalProofRefusalHint(code, " When its window has passed, run this command again without the proof flags to get a fresh one.")}`); return 2; };
  // The seam lets the signature leg run on an approved fixture whose plan was approved in chat mode (a later mode switch makes the
  // PO-gate authority stale, CVCT-AUTHORITY-STALE, by design). It can only force the strict proof path, never waive one; production
  // always reads the committed mode.
  const waiverFor = deps.forceStrictCriticalProof === true ? () => ({ waived: false, code: null }) : criticalProofWaiverFor;
  const configured = waiverFor(dir, kind);
  if (configured.code !== null && configured.code !== undefined) return refuse(configured.code);
  const waived = configured.waived === true;
  const proofOmitted = !["--proof-request", "--proof-authority", "--proof"].some((flag) => rest.includes(flag));
  const parsed = parseExactFlags(rest, new Set(waived || proofOmitted ? ["verify-command", "by"] : ["verify-command", "by", "proof-request", "proof-authority", "proof"]));
  const flags = parsed.value ?? {};
  if (!parsed.ok || isBlank(flags.by) || classifyVerifyCommand(flags["verify-command"]) !== "configured") {
    console.error("Error: configure-verify --replace requires exactly --verify-command <the new, real verification command> and --by (the label the PO gave for this command) and, when critical proof is enabled, exactly --proof-request/--proof-authority/--proof.");
    return 2;
  }
  const command = flags["verify-command"];
  const lifecycle = derivePlanLifecycle(base);
  if (!isLateVerifyRecoveryLifecycle(lifecycle)) return refuse(lifecycle.code ?? "PS-LIFECYCLE-NOT-IMPLEMENTING", "a replacement needs an established implementing lifecycle; zero calibration write.");
  const committedLayout = inspectCommittedCalibrationVerifyLayout({ rootDir: dir });
  if (committedLayout.status !== "configured") return refuse("CVR-NOT-CONFIGURED", "only a configured verify command is replaced; configure the first one with configure-verify --verify-command <command> (no --replace).");
  if (committedLayout.command === command) return refuse("CVR-SAME-COMMAND", "the new command equals the configured one; nothing to replace.");
  const common = resolveCriticalApprovalCommonDir(dir);
  if (common === null) return refuse("CRITICAL-APPROVAL-STORE-UNAVAILABLE");
  let root;
  try { root = realpathSync(resolve(dir)); } catch { return refuse("CVR-REPOSITORY"); }
  const buildSubject = deps.buildVerifyReplacementSubjectFn ?? buildVerifyReplacementSubject;
  let built = buildSubject({ root, commonDir: common, verifyCommand: command });
  if (!built.ok && built.code === "CVR-TEST-RUN-REQUIRED") {
    console.error(`configure-verify --replace: running the new command once on the clean tree before anything is signed: ${command}`);
    const ran = (deps.runVerifyReplacementTestRunFn ?? runVerifyReplacementTestRun)({ root, commonDir: common, verifyCommand: command });
    if (!ran.ok) return refuse(ran.code, ran.detail);
    built = buildSubject({ root, commonDir: common, verifyCommand: command });
  }
  if (!built.ok) return refuse(built.code, built.detail);
  const { subject, candidate, featureId } = built;
  const subjectSha256 = criticalActionSubjectSha256({ kind, candidate, subject });
  let approval = verifyReplacementApproval({ commonDir: common, subjectSha256 });
  if (approval === null) {
    console.error(["PO APPROVAL OF A VERIFY COMMAND REPLACEMENT -- one signature covers both calibration files:",
      `  now:   ${subject.previousCommand}`, `  after: ${subject.verifyCommand}`,
      "  the new command ran once at this HEAD and passed; the mirrors get exactly the signed bytes."].join("\n"));
    const approvedAt = now();
    if (!waived && (isBlank(flags["proof-request"]) || isBlank(flags["proof-authority"]) || isBlank(flags.proof))) {
      try {
        const expiresAt = new Date((Date.parse(approvedAt) || Date.now()) + 3_600_000).toISOString();
        const rendered = authorizeCriticalActionCommand({ kind, repoRoot: root, featureId, plan: base.activeFeature?.planPath, spec: base.continuity?.authority?.spec?.path, subjectSha256, expiresAt });
        const mirrorCommon = defaultGitCommonDir(dir);
        const mirror = mirrorCommon.ok ? criticalScratchArtifactPaths(dir, mirrorCommon.path, kind) : null;
        const waiting = mirror === null ? null : awaitSignatureFields({ root, proofPath: `scratch/${basename(mirror.proof)}`, subjectSha256, signCommand: rendered });
        console.log(JSON.stringify({ schema: "pipeline.verify-replacement-signing.v1", status: "signature-required", code: "CRITICAL-PROOF-FLAGS-PROOF-REQUIRED",
          signatureCommand: { ...rendered, kind, subjectSha256, subject, candidate, expiresAt, requiresPoApproval: true, executionBoundary: "attended-external-terminal", executed: false },
          ...(waiting === null ? {} : { ...waiting, afterSigning: `${waiting.afterSigning.replace("then read the next step from the same inspect readback", "then run recordCommand unchanged and commit the printed calibration files")}` }),
          recordCommand: { executable: process.execPath, argv: [scriptPath, "configure-verify", "--verify-command", command, "--replace", "--by", flags.by, "--proof-request", mirror?.request ?? "<proof-request>", "--proof-authority", mirror?.authority ?? "<proof-authority>", "--proof", mirror?.proof ?? "<proof>"],
            note: mirror === null ? "run after the PO signed; the three proof paths are printed by the signing step" : "run unchanged once the proof is there; the three paths are the repository mirror the signing step writes" } }));
      } catch { /* the refusal below still names the missing flags */ }
      return refuse("CRITICAL-PROOF-FLAGS-PROOF-REQUIRED");
    }
    const verified = verifyCriticalHumanProof({ dir, state: base, kind, candidate, subject, flags, now: approvedAt, required: true, waiverFor });
    if (!verified.ok) return refuse(verified.code);
    const priorConsumption = base.criticalProofConsumption;
    if (priorConsumption !== undefined && (!Array.isArray(priorConsumption) || priorConsumption.some((entry) => !entry || typeof entry !== "object" || typeof entry.proofSha256 !== "string"))) return refuse("CRITICAL-PROOF-CONSUMPTION-INVALID");
    if (verified.proof !== null && ((Array.isArray(priorConsumption) ? priorConsumption : []).some((entry) => entry.proofSha256 === verified.proof.proofSha256)
      || isCriticalProofConsumedPrivately(common, verified.proof.proofSha256))) return refuse("CRITICAL-PROOF-REPLAY");
    approval = { approvedBy: flags.by, approvedAt, forCommit: candidate.commit, forTree: candidate.tree, featureId, subjectSha256,
      previousCommand: subject.previousCommand, verifyCommand: subject.verifyCommand, testRunSha256: subject.testRunSha256, entries: subject.entries, criticalProof: verified.proof };
    if (waived) {
      approval.criticalProofWaiver = { ...(verified.waived ?? {}), kind, mode: "chat-attributed-unattested" };
      approval.humanApproval = chatAttributionRecord({ kind, by: flags.by });
    } else if (verified.waived !== undefined) approval.criticalProofWaiver = verified.waived;
    const stored = writeCriticalApproval({ gitCommonDir: common, kind, approval, consumedAt: approvedAt });
    if (!stored.ok) return refuse(stored.code);
  }
  // The approval exists for exactly this subject: write the signed bytes through the configure-verify commit transition.
  const proofSha256 = typeof approval.criticalProof?.proofSha256 === "string" ? approval.criticalProof.proofSha256 : null;
  const replacement = { previousCommand: subject.previousCommand, subjectSha256, proofSha256, mode: proofSha256 === null ? "chat-attributed-unattested" : "signature" };
  if (!retireDeadCalibrationContinuityLock({ dir, sourceBoundary: deps.sourceBoundary })) return refuse("CVR-WRITER-LOCK", "a live or unknown State writer lock remains; no calibration write.");
  const commitTransition = prepareCalibrationVerifyCommitTransition({ rootDir: dir, verifyCommand: command, sourceBoundary: deps.sourceBoundary, replacement });
  if (!commitTransition?.ok || !commitTransition.preparedHandle
    || !sameJson(commitTransition.entries, subject.entries)) return refuse(commitTransition?.code ?? "CVR-TRANSITION", "the commit transition does not match the signed post-images; zero calibration write.");
  const written = writeCalibrationVerifyCommand(dir, command, commitTransition.entries);
  if (!written.ok || !sameJson(written.written, commitTransition.paths)) {
    console.error("Error: configure-verify --replace could not write the exact calibration tiers; calibration mutation is possible. Inspect both tiers before retrying.");
    return 2;
  }
  const commitReady = completeCalibrationVerifyCommitTransition({ preparedHandle: commitTransition.preparedHandle });
  if (!commitReady?.ok || commitReady.code !== "CVCT-COMMIT-READY" || !sameJson(commitReady.paths, commitTransition.paths)) {
    console.error(`Error: the verify command was replaced, but its commit route is unavailable (${commitReady?.code ?? "CVCT-COMPLETE-UNAVAILABLE"}); calibration mutation occurred. Inspect the tiers before retrying; no commit seal is reported.`);
    return 2;
  }
  console.log(`Verify command replaced (${replacement.mode === "signature" ? "signed" : "chat-attributed, not signed"} by "${approval.approvedBy}") for feature ${featureId}.`);
  console.log("Commit exactly the selected verification tiers through the normal hooks:");
  console.log(`git add -- ${commitReady.paths.join(" ")}`);
  printVerificationTierCommit("chore: replace project verification command");
  console.log("Keep the private State untracked; the normal hook rechecks this exact transition at commit time.");
  return 0;
}
