// SPDX-License-Identifier: SUL-1.0
// Pin: W8 whole-chain walk of the consumer Critic-course paths (PO direction 2026-10-31: a fix carries the whole consumer chain,
// not only the reported step; D204, D212, D213, D217; backlog 2026-10-31 critic-full-fallback-round-bindings-and-finding-disposition-role
// and 2026-10-31 close-addendum-ignores-residual-acceptance-and-course-chain).
//
// Every case builds ONE temporary git repository (own `git init`, under the OS temp root) shaped like a consumer's: the project state
// file is gitignored, the calibration lists its finding-record files, the Critic course is registered through the REAL registration
// route (lineage rows of schema v2), each slice record is written through dispatch-record-write --attested-request and its addendum
// through --critic-addendum, and the close is planned through the real close-coordinator process. A step runs the real command line
// entry point (spawned) or the exported function that entry point calls; nothing under test is stubbed and no record a step writes is
// hand-written. Seams (named, not hidden): the Critic model call (the verdict is a fixed value handed to the finalizer, with the
// source-return origin function of the existing suites), the PO residual acceptance (writeResidualAcceptanceRecord in the chat approval
// mode, as the close pins do), and the Critic's own per-round dispatch record (as the existing preflight fixtures write it).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseCriticDispatchPreflightArgs } from "../../scripts/critic-dispatch-preflight.mjs";
import { admitSessionCriticReview, finalizeSessionCriticReview } from "../../scripts/session-critic-finalizer.mjs";
import { addCriticDeltaRequest, addCriticReviewLineage } from "../feature-package-registration.mjs";
// W9 (D223): the namespace imports keep a missing export a failure of the new cases only, never a load failure of the whole walk.
import * as registration from "../feature-package-registration.mjs";
import * as finalizer from "../../scripts/session-critic-finalizer.mjs";
import * as hookInstaller from "../../scripts/commit-msg-hook-install.mjs";
import * as courseAdmission from "../critic-course-admission.mjs";
const { resolveRegisteredCriticCourseHistory } = courseAdmission;
import { produceCriticDiagnostic } from "../critic-diagnostic-producer.mjs";
import { criticDispositionAddendumPath, CRITIC_DISPOSITION_ADDENDUM_SCHEMA } from "../critic-disposition-addendum.mjs";
import { residualFindingId } from "../critic-verify-lifecycle.mjs";
import { loadResidualAcceptanceDepsForPacket, writeResidualAcceptanceRecord } from "../critic-verify-readiness.mjs";
import { canonicalJson as packetCanonicalJson, readConsumedCandidateReceipt, readConsumedCandidateResult } from "../../scripts/critic-packet-preflight.mjs";
import { SLICE_QUEUE_SCHEMA } from "../slice-queue.mjs";
import { verifyEvidenceFixture } from "../verify-selection-fixture.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { criticBoundVerifyRemedy } from "../../scripts/push-prepare.mjs";
import { CURRENT_APPROVAL_SCHEMA, PLAN_SUBMISSION_SCHEMA, sha256CanonicalJson } from "../plan-spec-state-v2.mjs";
import { resolvePublicationReviewRequirement } from "../publication-review-requirement.mjs";

const SCRIPTS = fileURLToPath(new URL("../../scripts/", import.meta.url));
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
delete ENV.NODE_TEST_CONTEXT;

const FEATURE = "held-feature"; // the Critic course of the consumer (its feature package)
const CLOSING = "feature"; // the feature the close coordinator closes (the delivery course of the slices)
const SPEC_PATH = `specs/${FEATURE}/spec.md`;
const GUARDRAILS = [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"];
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function git(root, args) {
  const result = spawnSync("git", ["-c", "user.name=Walk", "-c", "user.email=walk@example.invalid", "-C", root, ...args], { encoding: "utf8", shell: false, env: ENV });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}
const put = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
// A whole-tree commit (".") honours the consumer's .gitignore: the project State file is gitignored in a consumer, so it must NOT be in
// the pushed tree (D214; forcing it in made the push step stop at the published-Continuity baseline check, a fixture artefact).
// Explicit paths are still added with -f (the fixture's evidence files may sit under an ignored pattern).
const commitPaths = (root, paths, message) => { git(root, paths.length === 1 && paths[0] === "." ? ["add", "--", "."] : ["add", "-f", "--", ...paths]); git(root, ["commit", "-qm", message]); return git(root, ["rev-parse", "HEAD"]); };

/** Run one real command line entry point; stdout (or, on a refusal, stderr) is its typed JSON line. */
function cli(script, args, { cwd } = {}) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", shell: false, env: ENV, cwd });
  const text = (result.stdout.trim() !== "" ? result.stdout : result.stderr).trim();
  let body = null;
  try { body = JSON.parse(text.split("\n")[0]); } catch { /* a plain-text refusal */ }
  return { status: result.status, body, text, stderr: result.stderr };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The consumer repository
// ---------------------------------------------------------------------------------------------------------------------------------
const FAIL_MAJOR = { findings: [
  { gap: "major gap one", risk: "consumer breaks", severity: "major", evidence: `${SPEC_PATH}:1`, spec_ref: "AC-1" },
  { gap: "minor gap one", risk: "small drift", severity: "minor", evidence: `${SPEC_PATH}:2`, spec_ref: "AC-1" },
  { gap: "minor gap two", risk: "small drift", severity: "minor", evidence: `${SPEC_PATH}:2`, spec_ref: "AC-1" }],
  pass: false };
const minors = (tag) => ({ findings: [
  { gap: `minor ${tag} one`, risk: "cosmetic drift", severity: "minor", evidence: `${SPEC_PATH}:1`, spec_ref: "AC-1" },
  { gap: `minor ${tag} two`, risk: "cosmetic drift", severity: "minor", evidence: `${SPEC_PATH}:2`, spec_ref: "AC-1" }], pass: false });
const PASS = { findings: [], pass: true };
const verdictOf = (value) => ({ deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "candidate evidence inspected", briefing_violations: [], ...value });
const origin = (q) => ({ schema: "pipeline.session-critic-source-return.v1", issuer: "source", packetId: q.packetId, packetDigest: q.packetDigest, claimant: q.claimant, sessionId: q.sessionId, verdictSha256: q.verdictSha256, issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 });

const required = () => ({ schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" });

/** The closing feature's State, delivery course and close request, as the close pins build them; the State file is gitignored. */
function closeFixtureFiles(root, sliceIds) {
  const paths = { prd: `specs/${CLOSING}/prd.md`, spec: `specs/${CLOSING}/spec.md`, result: `specs/${CLOSING}/result.md`, closeEvidence: "evidence/close.txt" };
  put(root, paths.prd, "# PRD\n"); put(root, paths.spec, "# Spec\n"); put(root, paths.result, "# Result\n"); put(root, paths.closeEvidence, "closed resources\n");
  put(root, `specs/${CLOSING}/slice-queue.json`, json({ schema: SLICE_QUEUE_SCHEMA, feature: CLOSING, slices: sliceIds.map((id) => ({ id, title: `slice ${id}`, state: "ready", dependsOn: [], writeScope: [`src/${id}.mjs`], readScope: [], tier: "implementor", commitMode: "host-commit", loadClass: "light" })) }));
  const prdSha256 = sha256(readFileSync(join(root, paths.prd)));
  const specSha256 = sha256(readFileSync(join(root, paths.spec)));
  const profileSha256 = "a".repeat(64);
  const planSubmission = { schema: PLAN_SUBMISSION_SCHEMA, featureId: CLOSING, planPath: paths.prd, planSha256: prdSha256, specPath: paths.spec, specSha256,
    profile: "mini", profileSha256, submittedBy: "fixture", submittedAt: "2026-10-24T00:00:00.000Z" };
  const poGateAuthority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: "b".repeat(64), runtimeSha256: "c".repeat(64), receiptSha256: "d".repeat(64),
    repositoryFingerprint: "e".repeat(64), planPath: paths.prd, planSha256: prdSha256, specPath: paths.spec, specSha256 };
  const result = { path: paths.result, sha256: sha256(readFileSync(join(root, paths.result))) };
  put(root, "evidence/close-request.json", json({ schema: "pipeline.continuity-close.v0", featureId: CLOSING, expectedRevision: 7, result,
    closeEvidence: { path: paths.closeEvidence, sha256: sha256(readFileSync(join(root, paths.closeEvidence))) } }));
  put(root, ".claude/pipeline-state.json", json({ schema: "pipeline.state.v0", activeFeature: { id: CLOSING, planPath: paths.prd, phase: "implementation" },
    planSubmission, planApproved: true,
    planApproval: { schema: CURRENT_APPROVAL_SCHEMA, approvedBy: "fixture", approvedAt: "2026-10-24T00:01:00.000Z", submissionSha256: sha256CanonicalJson(planSubmission), profileSha256, poGateAuthority,
      priorInvalidationSha256: null, designApprovalBinding: null, designApproval: null },
    continuity: { revision: 7, authority: { prd: { path: paths.prd, sha256: prdSha256 }, spec: { path: paths.spec, sha256: specSha256 }, result }, queueHead: { nextAction: "close", dispatch: null }, blocker: null, decisionTxn: null } }));
}

function registerDiagnostic(root, candidate, tag) {
  const manifestPath = `specs/${FEATURE}/lifecycle.json`;
  const logPath = `specs/${FEATURE}/evidence/targeted-${tag}.log`, diagnosticPath = `specs/${FEATURE}/evidence/diagnostic-${tag}.json`, capturedPath = `evidence/${FEATURE}-targeted-${tag}.log`;
  const produced = produceCriticDiagnostic({ root, candidate, specPath: SPEC_PATH, guardrailPaths: GUARDRAILS, command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
  put(root, logPath, readFileSync(join(root, capturedPath)));
  produced.targeted.log.path = logPath;
  put(root, diagnosticPath, JSON.stringify(produced));
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
  for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: sha256(readFileSync(join(root, path))), authority: false, mutability: "immutable", retention: "retain" });
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  return { diagnosticPath, registration: commitPaths(root, [manifestPath, logPath, diagnosticPath], `register the ${tag} diagnostic`) };
}

function deltaRequest(root, claims, flags) {
  const base = { changedBehaviorClaims: claims, coordinatorImpactConfirmed: true, trustBoundaryChanged: false, impactAmbiguous: false, ...flags };
  put(root, "scratch/delta-input.json", JSON.stringify({ ...base, pathInvariantMap: { "placeholder.mjs": ["inv-one"] } }));
  const first = addCriticDeltaRequest({ root, inputPath: "scratch/delta-input.json" });
  assert.equal(first.code, "FPR-DELTA-MAP", JSON.stringify(first));
  put(root, "scratch/delta-input.json", JSON.stringify({ ...base, pathInvariantMap: Object.fromEntries(first.changedPaths.map((path) => [path, ["inv-one"]])) }));
  const added = addCriticDeltaRequest({ root, inputPath: "scratch/delta-input.json" });
  assert.equal(added.status, "delta-request-added", JSON.stringify(added));
  return { added, registration: commitPaths(root, added.commitPaths, "register the delta request") };
}

/** The commit-path guard's answer for the commit about to be created: the exported predicate the commit-msg hook calls, at the real staged index. */
function guardVerdict(root) {
  return registration.checkCriticLineageBeforeCommit({ root });
}

const packetIdOf = (round) => `a${round.toString(16)}`.repeat(16);

/** Residual acceptance of exactly the minor findings of a consumed round (the PO's chat-mode acceptance; seam named in the header). */
function acceptResidual(root, packetId, { boundToPacket = packetId } = {}) {
  const common = join(root, git(root, ["rev-parse", "--git-common-dir"]));
  const controlRoot = join(common, "agent-pipeline", "critic-packets");
  const own = readConsumedCandidateReceipt({ controlRoot, packetId });
  const bound = readConsumedCandidateReceipt({ controlRoot, packetId: boundToPacket });
  const open = readConsumedCandidateResult({ controlRoot, packetId }).result.verdict.findings;
  const findings = open.map((finding) => ({ id: residualFindingId(finding), severity: finding.severity })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const receiptSha = sha256(packetCanonicalJson(bound.receipt));
  const candidate = { commit: own.receipt.candidate?.commit ?? readConsumedCandidateResult({ controlRoot, packetId }).packet.candidate.commit, tree: null };
  candidate.tree = git(root, ["rev-parse", `${candidate.commit}^{tree}`]);
  const stored = writeResidualAcceptanceRecord({ gitCommonDir: common, criticReceiptSha256: receiptSha, consumption: null,
    record: { schema: "pipeline.critic-residual-acceptance.v1", mode: "chat", forCommit: candidate.commit, forTree: candidate.tree, candidate, criticReceiptSha256: receiptSha, findings,
      approvedBy: "PO", approvedAt: "2026-10-31T10:00:00.000Z", criticalProof: null,
      criticalProofWaiver: { kind: "accept-residual-critic-findings", mode: "chat-attributed-unattested", source: "pipeline.user.yaml" },
      humanApproval: { kind: "accept-residual-critic-findings", mode: "chat-attributed-unattested" } } });
  assert.equal(stored.ok, true, JSON.stringify(stored));
  return { receiptSha, findingIds: findings.map((entry) => entry.id) };
}

/**
 * Build a consumer repository and walk the Critic course to its last round. `rounds` is the list of
 * { kind: "full" | "delta" | "fallback", verdict, accept }; `slices` the task ids whose records are written through the attested route.
 * Returns the repository and a log of what every step observed.
 */
function walkCourse({ label, rounds, slices, rootBase = false, extraSliceBeforeGenesis = null, unlistedFindingFile = false, acceptBoundToRound = null, guardCorrections = false, leaveLineageUncommittedAt = null, sabotageLineageAtRound = null }) {
  const root = mkdtempSync(join(tmpdir(), `w8-walk-${label}-`));
  const observed = { rounds: [], acceptances: [], bindings: [] };
  git(root, ["init", "-q", "-b", "main"]);
  put(root, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngovernance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");
  put(root, "governance/guidelines/review.md", "Review changed code.\n");
  put(root, "governance/policies/checklist.md", "- verify\n");
  // The consumer's shape: the project State is not a tracked file, scratch and the captured diagnostic logs are not either.
  put(root, ".gitignore", "/project/pipeline-state.json\n/.claude/pipeline-state.json\n/scratch/\n/evidence/*-targeted-*.log\n");
  put(root, "project/pipeline.json", json({ handover: "docs/state.md", criticFindingRecordPaths: ["docs/findings.md"] }));
  put(root, "docs/state.md", "state v1\n");
  put(root, "docs/findings.md", "findings quoted here\n");
  put(root, "pipeline.user.yaml", "gates:\n  human_approval: chat\n");
  const allSlices = extraSliceBeforeGenesis === null ? slices : [extraSliceBeforeGenesis, ...slices];
  closeFixtureFiles(root, allSlices);
  if (!rootBase) commitPaths(root, ["."], "base");
  const prefix = `specs/${FEATURE}`, manifestPath = `${prefix}/lifecycle.json`, unitPath = `${prefix}/design/critic-review-unit.json`;
  if (extraSliceBeforeGenesis !== null) {
    put(root, `src/${extraSliceBeforeGenesis}.mjs`, "export const early = 0;\n");
    observed.earlySliceCommit = commitPaths(root, [`src/${extraSliceBeforeGenesis}.mjs`], `feat(x): the slice that precedes the course genesis\n\nAI-Assisted: true\nDispatch: ${extraSliceBeforeGenesis} (goldfish)`);
  }
  put(root, SPEC_PATH, "# Complete behavior\nAC-1: deliver complete behavior\n");
  put(root, unitPath, JSON.stringify({ schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose: "Deliver one complete behavior", specPath: SPEC_PATH, logicalWorkIds: ["scope-one", "scope-two"], criterionIds: ["AC-1"], deliveryBoundary: { mainRef: git(root, ["symbolic-ref", "HEAD"]) }, singletonRationale: null }));
  const topo = [["prd", "prd.md", true, "mutable", "active"], ["acceptance", "acceptance.md", false, "mutable", "active"], ["result", "result.md", false, "mutable", "active"], ["candidate-evidence", "evidence/seed.json", false, "immutable", "retain"]].map(([klass, rel, authority, mutability, retention]) => {
    const path = `${prefix}/${rel}`; put(root, path, `${klass}\n`);
    return { class: klass, path, sha256: sha256(readFileSync(join(root, path))), authority, mutability, retention };
  });
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: FEATURE, rigor: 2 }, state: "approved", candidate: null, supersedes: null, artifacts: [
    { class: "spec", path: SPEC_PATH, sha256: sha256(readFileSync(join(root, SPEC_PATH))), authority: true, mutability: "mutable", retention: "active" },
    { class: "design", path: unitPath, sha256: sha256(readFileSync(join(root, unitPath))), authority: false, mutability: "immutable", retention: "retain" }, ...topo] };
  put(root, manifestPath, JSON.stringify(manifest));
  const genesis = rootBase ? commitPaths(root, ["."], "declare feature review unit (repository root)") : commitPaths(root, [prefix], "declare feature review unit");
  observed.genesis = genesis;
  observed.genesisIsRoot = rootBase;
  if (rootBase) assert.equal(git(root, ["rev-list", "--count", genesis]), "1", "the course genesis base is the root commit of the repository");

  // The slices: one commit each, then the records through the attested route (dispatch-record-write --attested-request).
  const sliceCommits = {};
  for (const id of slices) {
    put(root, `src/${id}.mjs`, `export const ${id.replaceAll("-", "_")} = 1;\n`);
    sliceCommits[id] = commitPaths(root, [`src/${id}.mjs`], `feat(x): ${id}\n\nAI-Assisted: true\nDispatch: ${id} (goldfish)`);
  }
  const attestedRecord = (id, commit, allowedPath) => {
    put(root, `scratch/briefing-${id}.md`, `<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify({ schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: id, candidateCommit: git(root, ["rev-parse", `${commit}^`]), runner: "claude", role: "pipeline-core:goldfish-deep", agentType: "goldfish-deep", model: "sonnet", effort: "high", rulesetSha: "0.7.0+claude.20261031060558.62b553e", allowedPaths: [allowedPath], criticDecision: required() })}\n-->\n`);
    put(root, `scratch/handback-${id}.txt`, `Slice ${id} delivered; host committed.\n`);
    put(root, `scratch/attested-${id}.json`, json({ schema: "pipeline.dispatch-attested-request.v1", briefingPath: `scratch/briefing-${id}.md`, handbackPath: `scratch/handback-${id}.txt`, commits: [commit] }));
    const written = cli("dispatch-record-write.mjs", ["--repo-root", root, "--attested-request", `scratch/attested-${id}.json`]);
    assert.equal(written.status, 0, `attested record ${id}: ${written.text}${written.stderr}`);
    return written.body;
  };
  if (extraSliceBeforeGenesis !== null) attestedRecord(extraSliceBeforeGenesis, observed.earlySliceCommit, `src/${extraSliceBeforeGenesis}.mjs`);
  for (const id of slices) observed[`record:${id}`] = attestedRecord(id, sliceCommits[id], `src/${id}.mjs`);
  // Integration commit: the feature behavior and the records of the slices (round 1 reviews (genesis, c1]).
  put(root, SPEC_PATH, "# Complete behavior\nAC-1: deliver complete behavior\nImplemented behavior.\n");
  manifest.artifacts[0].sha256 = sha256(readFileSync(join(root, SPEC_PATH)));
  put(root, manifestPath, JSON.stringify(manifest));
  let head = commitPaths(root, [SPEC_PATH, manifestPath, ...(extraSliceBeforeGenesis === null ? [] : [`evidence/dispatch-record-${extraSliceBeforeGenesis}.json`]), ...slices.map((id) => `evidence/dispatch-record-${id}.json`)], "integrate feature behavior and persist the slice records");
  observed.sliceCommits = sliceCommits;

  // The Critic rounds, each through the real entry points in order: bindings -> preflight -> admission -> consumed result -> registration.
  let previousCandidate = head, prior = null;
  const priorFindings = [];
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index], n = index + 1, tag = `r${n}`, packetId = packetIdOf(n + 9), step = { n, kind: round.kind };
    let candidate = head, delta = null, registrationCommit, deltaRequestPath = null;
    if (n > 1) {
      put(root, `src/fix${n}.mjs`, `export const fix${n} = ${n};\n`);
      put(root, "docs/findings.md", `findings quoted here\n${priorFindings.map((entry) => `- round ${entry.n}: ${entry.gap}`).join("\n")}\n`);
      put(root, "docs/state.md", `state v${n}\n`);
      if (unlistedFindingFile) put(root, "docs/other-findings.md", `${priorFindings.map((entry) => `- round ${entry.n}: ${entry.gap}`).join("\n")}\n`);
      const correctionPaths = [`src/fix${n}.mjs`, "docs/findings.md", "docs/state.md", ...(unlistedFindingFile ? ["docs/other-findings.md"] : [])];
      if (guardCorrections) {
        // W9: the correction commit passes the commit-path guard (the predicate the commit-msg hook runs) at the real staged index.
        git(root, ["add", "-f", "--", ...correctionPaths]);
        step.correctionGuard = guardVerdict(root);
        assert.equal(step.correctionGuard.decision, "allow", `the correction commit of round ${n} is admitted once the lineage is registered: ${JSON.stringify(step.correctionGuard)}`);
        assert.equal(step.correctionGuard.reason, "lineage-registered", `the guard engaged and read the registered lineage: ${JSON.stringify(step.correctionGuard)}`);
        git(root, ["commit", "-qm", `fix: round ${n} correction`]);
        candidate = git(root, ["rev-parse", "HEAD"]);
      } else {
        candidate = commitPaths(root, correctionPaths, `fix: round ${n} correction`);
      }
    }
    const diag = registerDiagnostic(root, candidate, tag);
    registrationCommit = diag.registration;
    if (n > 1) {
      delta = deltaRequest(root, [`fix-${n}`], round.kind === "fallback" ? { trustBoundaryChanged: true } : {});
      registrationCommit = delta.registration; deltaRequestPath = delta.added.deltaRequestPath;
    }
    const base = n === 1 ? genesis : previousCandidate;
    // The range the bindings must cover: the correction range, or the course genesis base to the candidate for the effective FULL round.
    const bindingsBase = round.kind === "fallback" ? genesis : base;
    let bindingsPath = null;
    if (n > 1) {
      bindingsPath = `scratch/bindings-${tag}.json`;
      const derived = cli("critic-correction-input-bindings.mjs", ["derive", "--root", root, "--base", bindingsBase, "--head", candidate, "--out", bindingsPath]);
      assert.equal(derived.status, 0, `bindings ${tag}: ${derived.text}`);
      step.bindings = { base: bindingsBase, digest: derived.body.digestSha256, counts: derived.body.counts };
    }
    const argv = ["--root", root, "--base", base, "--candidate", candidate, "--spec", SPEC_PATH, "--evidence", diag.diagnosticPath, "--registration-commit", registrationCommit,
      ...(deltaRequestPath === null ? [] : ["--delta-request", deltaRequestPath]), ...(bindingsPath === null ? [] : ["--correction-input-bindings", bindingsPath])];
    const preflight = cli("critic-dispatch-preflight.mjs", argv);
    step.preflight = preflight;
    step.argv = argv;
    if (preflight.status !== 0 || preflight.body?.status !== "packet-ready") { observed.rounds.push(step); observed.refusedAt = { round: n, step: "preflight", body: preflight.body, text: preflight.text }; return { root, observed, genesis }; }
    step.reviewBase = preflight.body.base.commit;
    step.fallbackFull = preflight.body.coordinatorOnly.courseAdmission.fallbackFull === true;
    step.bindingsEcho = preflight.body.correctionInputBindings?.digestSha256 ?? null;
    // The Critic's own dispatch record, then admission and the consumed result (the model call is the named seam).
    const taskId = `critic-round-${n}`;
    put(root, `evidence/dispatch-record-${taskId}.json`, JSON.stringify({ schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [candidate], candidateCommit: candidate, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: [SPEC_PATH] }, criticRequired: required() }));
    const preflightInput = parseCriticDispatchPreflightArgs(argv);
    const request = { preflightInput, taskId, projectId: "pipeline", sessionId: `session-${n}`, packetId, route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" }, verdict: verdictOf(round.verdict) };
    admitSessionCriticReview(request, {});
    // W9 negative (4): the manifest of the feature package is not in the working tree when the round finishes (the packet is on no
    // registered feature package): the finalizer must still finish the round and return the lineage refusal instead of throwing.
    const manifestBytes = readFileSync(join(root, manifestPath));
    if (sabotageLineageAtRound === n) rmSync(join(root, manifestPath));
    const finalized = finalizeSessionCriticReview(request, { readOriginalSourceReturnFn: origin });
    step.finalized = finalized.status;
    assert.equal(finalized.status, "completed", `finalize ${tag}: ${JSON.stringify(finalized)}`);
    if (sabotageLineageAtRound === n) {
      const reportPath = "scratch/critic-notes-sabotage.md";
      put(root, reportPath, "# Critic notes\n\nOne round.\n");
      put(root, "scratch/export-request-sabotage.json", json({ schema: finalizer.SESSION_CRITIC_EXPORT_REQUEST_SCHEMA, packetId, reportPath, outDir: `specs/${FEATURE}/evidence/critic/${packetId}` }));
      const exported = cli("session-critic-finalizer.mjs", ["export", "--root", root, "--request", "scratch/export-request-sabotage.json"]);
      writeFileSync(join(root, manifestPath), manifestBytes);
      observed.sabotage = { n, packetId, finalizedLineage: finalized.lineage, exported };
      observed.rounds.push(step);
      return { root, observed, genesis };
    }
    // D223 (slice 1): the FINALIZER itself writes the lineage into the working tree when the round finishes, without any
    // register-feature-package call, and never stages or commits.
    const written = finalized.lineage;
    assert.equal(written?.status, "written", `the finalizer writes the lineage of ${tag}: ${JSON.stringify(written)}`);
    step.lineageWritten = written;
    step.lineageInTree = written.commitPaths.every((path) => existsSync(join(root, path)));
    step.stagedAfterFinalize = git(root, ["diff", "--cached", "--name-only"]);
    step.headAfterFinalize = git(root, ["rev-parse", "HEAD"]);
    if (leaveLineageUncommittedAt === n) { observed.pending = { n, packetId, written, candidate }; observed.rounds.push(step); return { root, observed, genesis }; }
    // The explicit registration of today is now an idempotent replay (the restated step of this walk: it asserted "lineage-added").
    const lineage = addCriticReviewLineage({ root, packetId });
    step.lineage = lineage.status;
    assert.equal(lineage.status, "already-registered", `lineage ${tag}: ${JSON.stringify(lineage)}`);
    head = commitPaths(root, written.commitPaths, `register lineage of round ${n}`);
    step.packetId = packetId; step.candidate = candidate; step.base = base;
    for (const finding of round.verdict.findings) priorFindings.push({ n, gap: finding.gap });
    if (round.accept) {
      const boundTo = acceptBoundToRound === null || n !== rounds.length ? packetId : packetIdOf(acceptBoundToRound + 9);
      step.acceptance = acceptResidual(root, packetId, { boundToPacket: boundTo });
      observed.acceptances.push({ n, packetId, ...step.acceptance });
    }
    observed.rounds.push(step);
    previousCandidate = candidate; prior = step;
  }
  observed.lastPacketId = prior?.packetId ?? null; observed.lastCandidate = prior?.candidate ?? null;
  return { root, observed, genesis, slices, head: () => git(root, ["rev-parse", "HEAD"]) };
}

/** One addendum per slice record, each through the real writer (dispatch-record-write --critic-addendum). */
function writeAddenda(fx, taskIds) {
  const { root, observed } = fx;
  const common = join(root, git(root, ["rev-parse", "--git-common-dir"]));
  const controlRoot = join(common, "agent-pipeline", "critic-packets");
  const receiptSha = sha256(packetCanonicalJson(readConsumedCandidateReceipt({ controlRoot, packetId: observed.lastPacketId }).receipt));
  const out = {};
  for (const taskId of taskIds) {
    const recordPath = `evidence/dispatch-record-${taskId}.json`, recordBytes = readFileSync(join(root, recordPath));
    const record = JSON.parse(recordBytes);
    const criticBytes = `Independent Critic course review covering ${taskId}.\n`;
    put(root, `evidence/critic-${taskId}.md`, criticBytes);
    put(root, `scratch/addendum-${taskId}.json`, json({ schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath, recordSha256: sha256(recordBytes), taskId, candidateCommit: record.candidateCommit,
      reviewCandidateCommit: observed.lastCandidate, criticPacketId: observed.lastPacketId, criticReceiptSha256: receiptSha,
      criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId, candidateCommit: record.candidateCommit, path: `evidence/critic-${taskId}.md`, sha256: sha256(criticBytes) } }));
    out[taskId] = cli("dispatch-record-write.mjs", ["--repo-root", root, "--critic-addendum", `scratch/addendum-${taskId}.json`]);
  }
  return out;
}

/** The real close coordinator: plan-start and checkpoint, then plan feature-close-prepared (returned, not asserted). */
function closeToPrepared(fx) {
  const { root } = fx;
  commitPaths(root, ["evidence", "specs"], "persist the addenda and the Critic evidence");
  const common = ["--root", root, "--lifecycle", `close-${basename(root)}`, "--actor", "PO"];
  const run = (args) => { const r = spawnSync(process.execPath, [join(SCRIPTS, "close-coordinator.mjs"), ...args], { encoding: "utf8", shell: false, env: ENV }); return { status: r.status, body: JSON.parse(r.stdout) }; };
  const apply = (planned) => { const next = planned.body.nextAction; const r = spawnSync(next.executable, next.argv, { encoding: "utf8", shell: false, env: ENV }); return JSON.parse(r.stdout); };
  const start = run(["plan-start", ...common, "--close-intent", "durable-stop"]);
  assert.equal(start.status, 0, JSON.stringify(start.body));
  assert.equal(apply(start).status, "applied");
  const checkpoint = run(["plan-transition", ...common, "--phase", "checkpointed"]);
  assert.equal(checkpoint.status, 0, JSON.stringify(checkpoint.body));
  assert.equal(apply(checkpoint).status, "applied");
  const planned = run(["plan-transition", ...common, "--phase", "feature-close-prepared", "--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json"]);
  return { planned, apply: () => apply(planned) };
}
const basename = (path) => path.split("/").at(-1);

const cleanup = (fx) => rmSync(fx.root, { recursive: true, force: true });

/**
 * The push step as it behaves today: push-prepare's remedy base for the registered course, and the real guard-push hook on a push of
 * the closed candidate. The consumer's project State is not a tracked file, so the pushed commit carries none (D214).
 */
function pushStep(fx) {
  const { root } = fx;
  const head = git(root, ["rev-parse", "HEAD"]);
  const remedy = criticBoundVerifyRemedy(root, head);
  // The fixture enrolls governance as the guard suite does; the enrollment writer refuses while a continuity State exists, so the
  // untracked State file is set aside for the enrollment only and restored byte-identical before the guard runs.
  const stateBytes = readFileSync(join(root, ".claude/pipeline-state.json"));
  rmSync(join(root, ".claude/pipeline-state.json"));
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-walk-fixture" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  writeFileSync(join(root, ".claude/pipeline-state.json"), stateBytes);
  put(root, "evidence/verify-latest.json", JSON.stringify(verifyEvidenceFixture(head)));
  const runGuard = () => {
    const guard = spawnSync(process.execPath, [fileURLToPath(new URL("../../hooks/guard-push.mjs", import.meta.url))], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push origin main:refs/heads/feature-test" } }),
      encoding: "utf8", cwd: root, env: { ...ENV, CLAUDE_PROJECT_DIR: root }, timeout: 20000 });
    return { code: guard.status, stderr: guard.stderr ?? "" };
  };
  const guard = runGuard();
  // Second answer: the same push with no State file in the working tree either (the pushed commit never carries one).
  rmSync(join(root, ".claude/pipeline-state.json"));
  const guardWithoutState = runGuard();
  writeFileSync(join(root, ".claude/pipeline-state.json"), stateBytes);
  // The review decision the guard takes from the PUSHED tree (guard-push pushedStateRequiresReview), asked of the same resolver with the same
  // pushed-tree reader. Two answers: the consumer shape (no State at the pushed commit) and, as the control, the same candidate read through
  // the State file the consumer gitignores (the route a repository that commits its State uses today).
  const pushedState = git(root, ["ls-tree", "-r", "--name-only", head]).split("\n").filter((path) => /(?:^|\/)pipeline-state\.json$/u.test(path));
  const readPushed = (path) => { const shown = spawnSync("git", ["-C", root, "show", `${head}:${path}`], { encoding: null, shell: false, env: ENV }); return shown.status === 0 ? shown.stdout : null; };
  const consumerShape = pushedState.length === 0 ? resolvePublicationReviewRequirement(null, { readSource: readPushed }) : null;
  const ignoredStateRoute = resolvePublicationReviewRequirement(JSON.parse(stateBytes.toString("utf8")), { readSource: readPushed });
  return { head, remedy, guard, guardWithoutState, pushedState, consumerShape, ignoredStateRoute };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Path A: a trust-boundary delta in a Critic course (round 2 is admitted as an effective FULL round)
// ---------------------------------------------------------------------------------------------------------------------------------
test("PATH A (trust-boundary delta): every step of the chain from the first round to the close carries it", () => {
  const fx = walkCourse({ label: "a", rounds: [{ kind: "full", verdict: FAIL_MAJOR }, { kind: "fallback", verdict: PASS }], slices: ["TASK-ONE"], rootBase: true });
  try {
    assert.equal(fx.observed.refusedAt, undefined, JSON.stringify(fx.observed.refusedAt));
    const [one, two] = fx.observed.rounds;
    assert.equal(one.kind, "full");
    // The effective FULL round: bindings over the genesis base, reviewed from the genesis base, admitted as the fallback.
    assert.equal(two.fallbackFull, true, "round 2 is admitted as an effective FULL round (RE-DELTA-FALLBACK-FULL)");
    assert.equal(two.bindings.base, fx.genesis, "the bindings derived for the effective FULL round start at the course genesis base");
    assert.equal(two.reviewBase, fx.genesis, "the effective FULL round reviews from the course genesis base");
    assert.equal(two.bindingsEcho, two.bindings.digest, "the preflight echoes the genesis-range bindings");
    assert.ok(two.bindings.counts["finding-disposition record"] >= 1, "the calibrated finding-record file is an exclusion, not a source path");
    const addenda = writeAddenda(fx, ["TASK-ONE"]);
    assert.equal(addenda["TASK-ONE"].status, 0, addenda["TASK-ONE"].text);
    const closed = closeToPrepared(fx);
    assert.equal(closed.planned.status, 0, JSON.stringify(closed.planned.body));
    assert.equal(closed.planned.body.phase, "feature-close-prepared");
    assert.equal(closed.apply().status, "applied");
  } finally { cleanup(fx); }
});

test("PATH A negative: bindings over the correction range for the effective FULL round stay refused CDP-CORRECTION-INPUT-STALE at the preflight step", () => {
  const fx = walkCourse({ label: "a-neg", rounds: [{ kind: "full", verdict: FAIL_MAJOR }, { kind: "fallback", verdict: PASS }], slices: ["TASK-ONE"], rootBase: true });
  try {
    const round = fx.observed.rounds[1];
    const stale = cli("critic-correction-input-bindings.mjs", ["derive", "--root", fx.root, "--base", round.base, "--head", round.candidate, "--out", "scratch/bindings-stale.json"]);
    assert.equal(stale.status, 0, stale.text);
    const argv = round.argv.map((value, index, all) => (all[index - 1] === "--correction-input-bindings" ? "scratch/bindings-stale.json" : value));
    const refused = cli("critic-dispatch-preflight.mjs", argv);
    assert.equal(refused.status, 1);
    assert.equal(refused.body.code, "CDP-CORRECTION-INPUT-STALE", refused.text);
  } finally { cleanup(fx); }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Path B: residual acceptance and a registered course chain
// ---------------------------------------------------------------------------------------------------------------------------------
const PATH_B_ROUNDS = () => [{ kind: "full", verdict: FAIL_MAJOR }, { kind: "delta", verdict: minors("r2"), accept: true }];
const gitCommonOf = (root) => join(root, git(root, ["rev-parse", "--git-common-dir"]));
const refusedForMissingCritic = (outcome, named) => {
  assert.equal(outcome.status, 2, JSON.stringify(outcome.body));
  assert.equal(outcome.body.code, "CLOSE-CRITIC-EVIDENCE-MISSING", JSON.stringify(outcome.body));
  for (const id of named) assert.ok(outcome.body.message.includes(id), `${id} must be named: ${outcome.body.message}`);
};

test("PATH B (residual acceptance + registered course chain): the addendum reads the acceptance and the chain, and the close plans", () => {
  const fx = walkCourse({ label: "b", rounds: PATH_B_ROUNDS(), slices: ["TASK-ONE", "TASK-TWO"] });
  try {
    assert.equal(fx.observed.refusedAt, undefined, JSON.stringify(fx.observed.refusedAt));
    const [, second] = fx.observed.rounds;
    assert.equal(second.bindings.base, fx.observed.rounds[0].candidate, "a diff round's bindings cover the correction range");
    assert.notEqual(loadResidualAcceptanceDepsForPacket({ gitCommonDir: gitCommonOf(fx.root), projectDir: fx.root, criticPacketId: second.packetId }), null, "the acceptance is read for the last round");
    const addenda = writeAddenda(fx, ["TASK-ONE", "TASK-TWO"]);
    for (const [taskId, outcome] of Object.entries(addenda)) assert.equal(outcome.status, 0, `${taskId}: ${outcome.text}${outcome.stderr}`);
    const closed = closeToPrepared(fx);
    assert.equal(closed.planned.status, 0, JSON.stringify(closed.planned.body));
    assert.equal(closed.apply().status, "applied");
  } finally { cleanup(fx); }
});

test("PATH B at a repository root commit: the course genesis base is the root commit and the chain still covers both slices", () => {
  const fx = walkCourse({ label: "b-root", rounds: PATH_B_ROUNDS(), slices: ["TASK-ONE", "TASK-TWO"], rootBase: true });
  try {
    assert.equal(fx.observed.genesisIsRoot, true);
    const addenda = writeAddenda(fx, ["TASK-ONE", "TASK-TWO"]);
    for (const [taskId, outcome] of Object.entries(addenda)) assert.equal(outcome.status, 0, `${taskId}: ${outcome.text}${outcome.stderr}`);
    const closed = closeToPrepared(fx);
    assert.equal(closed.planned.status, 0, JSON.stringify(closed.planned.body));
  } finally { cleanup(fx); }
});

test("PATH B negative: a tampered chain (a registered lineage row with changed bytes) never covers the records: CLOSE-CRITIC-EVIDENCE-MISSING", () => {
  const fx = walkCourse({ label: "b-tamper", rounds: PATH_B_ROUNDS(), slices: ["TASK-ONE", "TASK-TWO"] });
  try {
    const addenda = writeAddenda(fx, ["TASK-ONE", "TASK-TWO"]);
    for (const outcome of Object.values(addenda)) assert.equal(outcome.status, 0, outcome.text);
    const lineage = git(fx.root, ["ls-files", `specs/${FEATURE}/evidence`]).split("\n").filter((path) => /critic-lineage-/u.test(path)).sort()[0];
    writeFileSync(join(fx.root, lineage), `${readFileSync(join(fx.root, lineage), "utf8")} `);
    commitPaths(fx.root, [lineage], "tamper with a registered lineage row");
    refusedForMissingCritic(closeToPrepared(fx).planned, ["TASK-ONE", "TASK-TWO"]);
  } finally { cleanup(fx); }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Path C: the multi-round consumer course (the main path)
// ---------------------------------------------------------------------------------------------------------------------------------
const PATH_C_ROUNDS = (lastRound) => [
  { kind: "full", verdict: FAIL_MAJOR },
  { kind: "delta", verdict: minors("r2"), accept: true },
  { kind: "fallback", verdict: minors("r3"), accept: true },
  lastRound,
];

test("PATH C (multi-round consumer course, several slices): bindings per round range, both acceptances, all slices covered through the chain, close plans", () => {
  const fx = walkCourse({ label: "c", rounds: PATH_C_ROUNDS({ kind: "delta", verdict: PASS }), slices: ["TASK-ONE", "TASK-TWO"], unlistedFindingFile: true });
  try {
    assert.equal(fx.observed.refusedAt, undefined, JSON.stringify(fx.observed.refusedAt));
    const [r1, r2, r3, r4] = fx.observed.rounds;
    assert.equal(r1.bindings, undefined);
    assert.equal(r2.bindings.base, r1.candidate, "round 2 (diff) bindings cover the correction range");
    assert.equal(r3.fallbackFull, true, "round 3 is admitted as an effective FULL round");
    assert.equal(r3.bindings.base, fx.genesis, "round 3 bindings cover the genesis base to the candidate");
    assert.equal(r3.reviewBase, fx.genesis);
    assert.equal(r4.fallbackFull, false);
    assert.equal(r4.bindings.base, r3.candidate, "round 4 (diff) bindings cover the correction range");
    // Both acceptances exist, each bound to its own round receipt.
    assert.equal(fx.observed.acceptances.length, 2);
    assert.notEqual(fx.observed.acceptances[0].receiptSha, fx.observed.acceptances[1].receiptSha);
    for (const accepted of fx.observed.acceptances) {
      assert.notEqual(loadResidualAcceptanceDepsForPacket({ gitCommonDir: gitCommonOf(fx.root), projectDir: fx.root, criticPacketId: accepted.packetId }), null, `the acceptance of round ${accepted.n} is read`);
    }
    // A finding quoted from a file the calibration does not list stays a source path; the listed one is excluded.
    const r2Bindings = JSON.parse(readFileSync(join(fx.root, "scratch/bindings-r2.json"), "utf8"));
    assert.ok(r2Bindings.sourcePaths.includes("docs/other-findings.md"), "an unlisted finding file is a source path");
    assert.ok(r2Bindings.exclusions.some((entry) => entry.path === "docs/findings.md" && entry.role === "finding-disposition record"));
    assert.ok(!r2Bindings.exclusions.some((entry) => entry.path === "docs/other-findings.md"));
    // The registered course the close gate reads has all four rounds (current registration route: lineage rows of schema v2).
    const head = git(fx.root, ["rev-parse", "HEAD"]);
    const history = courseAdmission.resolveRetainedCriticCourseRecords({ repoRoot: fx.root, featureId: FEATURE, candidateCommit: head }).history;
    assert.equal(history.length, 4, "the registered course read by the close gate has every round");
    assert.ok(history.every((row) => row.schema === "pipeline.critic-review-lineage.v2"), "the current registration route writes lineage rows of schema v2");
    assert.equal(resolveRegisteredCriticCourseHistory({ repoRoot: fx.root, featureId: FEATURE, candidateCommit: head }).history.length, 0, "the v1-only runtime reader keeps its documented scope");
    // What a round admitted as an effective FULL round carries in its row: mode, admission code and the genesis base.
    assert.deepEqual([history[2].request.mode, history[2].request.admissionCode, history[2].diff.base], ["full", "RE-DELTA-FALLBACK-FULL", fx.genesis]);
    assert.deepEqual([history[1].request.mode, history[1].diff.base], ["delta", r1.candidate]);
    const addenda = writeAddenda(fx, ["TASK-ONE", "TASK-TWO"]);
    for (const [taskId, outcome] of Object.entries(addenda)) assert.equal(outcome.status, 0, `${taskId}: ${outcome.text}${outcome.stderr}`);
    const closed = closeToPrepared(fx);
    assert.equal(closed.planned.status, 0, JSON.stringify(closed.planned.body));
    assert.equal(closed.apply().status, "applied");
    // The push step in the REAL consumer shape (D214): the State file is gitignored, so the pushed commit carries none. The earlier
    // answer (the published-Continuity baseline check, "no unambiguous runtime.sessionCleanup baseline") was a FIXTURE ARTEFACT of this
    // walk (its whole-tree commit force-added the gitignored State file); guard-push returns null from that check when no State is in the
    // pushed commit, so the push step now reaches the pushed-state review decision.
    const push = pushStep(fx);
    assert.ok(push.remedy.includes(`--base ${r4.candidate}`) && push.remedy.includes(FEATURE), push.remedy);
    assert.deepEqual(push.pushedState, [], "the pushed commit of a consumer carries no project State file");
    for (const answer of [push.guard, push.guardWithoutState]) {
      assert.equal(answer.code, 2, answer.stderr);
      assert.doesNotMatch(answer.stderr, /runtime\.sessionCleanup/u, "the published-Continuity baseline check no longer answers first");
      assert.match(answer.stderr, /candidate-bound independent review and Verify are unavailable/u, "the push step reaches the review decision: the independent review is required");
    }
    // The typed answer of that decision for this candidate (D214): the Critic COURSE (the registered package of
    // FEATURE) and the review WAIVER are different questions. The waiver reads only the closing feature's approved low-rigor State, and a
    // consumer's pushed commit has none, so even a mini feature stays "required" (REVIEW-STATE-UNAVAILABLE). A feature with a registered
    // package is "required" by REVIEW-PACKAGE-REQUIRED whatever its approval says.
    assert.deepEqual(push.consumerShape, { required: true, code: "REVIEW-STATE-UNAVAILABLE" });
    // Control: the same candidate read through the State file this consumer gitignores is the one route that waives today.
    assert.deepEqual(push.ignoredStateRoute, { required: false, code: "REVIEW-LOW-RIGOR" }, "the State-file route works where a repository commits its State; it is unchanged");
  } finally { cleanup(fx); }
});

test("PATH C negative: a slice whose record is not on the registered chain (its commit precedes the course genesis) stays refused and is the only one named", () => {
  const fx = walkCourse({ label: "c-early", rounds: PATH_C_ROUNDS({ kind: "delta", verdict: PASS }), slices: ["TASK-ONE", "TASK-TWO"], extraSliceBeforeGenesis: "TASK-EARLY" });
  try {
    const covered = writeAddenda(fx, ["TASK-ONE", "TASK-TWO"]);
    for (const outcome of Object.values(covered)) assert.equal(outcome.status, 0, outcome.text);
    const early = writeAddenda(fx, ["TASK-EARLY"])["TASK-EARLY"];
    assert.equal(early.status, 2, "the addendum writer refuses a record the chain does not cover");
    assert.match(early.stderr, /DISPATCH-RECORD-WRITE-FAILED: addendum-unbound/u);
    const refused = closeToPrepared(fx).planned;
    refusedForMissingCritic(refused, ["TASK-EARLY"]);
    assert.ok(!refused.body.message.includes("TASK-ONE") && !refused.body.message.includes("TASK-TWO"), refused.body.message);
    assert.match(refused.body.message, /--critic-addendum <request\.json> once for EACH uncovered record/u, "the refusal says one addendum is written per record (a consumer with several slices needs one each)");
  } finally { cleanup(fx); }
});

test("PATH C, course ending in an accepted failed round: the chain covers every slice; an acceptance bound to another round's receipt does not", () => {
  const lastFailed = () => PATH_C_ROUNDS({ kind: "delta", verdict: minors("r4"), accept: true });
  const good = walkCourse({ label: "c-accepted", rounds: lastFailed(), slices: ["TASK-ONE", "TASK-TWO"] });
  try {
    assert.equal(good.observed.acceptances.length, 3);
    const addenda = writeAddenda(good, ["TASK-ONE", "TASK-TWO"]);
    for (const [taskId, outcome] of Object.entries(addenda)) assert.equal(outcome.status, 0, `${taskId}: ${outcome.text}${outcome.stderr}`);
    const closed = closeToPrepared(good);
    assert.equal(closed.planned.status, 0, JSON.stringify(closed.planned.body));
  } finally { cleanup(good); }
  const wrong = walkCourse({ label: "c-wrong-receipt", rounds: lastFailed(), slices: ["TASK-ONE", "TASK-TWO"], acceptBoundToRound: 3 });
  try {
    const addenda = writeAddenda(wrong, ["TASK-ONE", "TASK-TWO"]);
    for (const outcome of Object.values(addenda)) {
      assert.equal(outcome.status, 2, outcome.text);
      assert.match(outcome.stderr, /a failed receipt never binds without a PO residual acceptance/u);
    }
    refusedForMissingCritic(closeToPrepared(wrong).planned, ["TASK-ONE", "TASK-TWO"]);
  } finally { cleanup(wrong); }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Path W9 (D223, slice 1): the finalizer writes the lineage when a round finishes; the commit path refuses a correction commit while
// the last finished round's lineage is missing. Seams (named): the Critic model call (the fixed verdict), the PO residual acceptance
// (chat mode), the Critic's own dispatch record, and the guard adapter: the walk calls the exported predicate the commit-msg hook calls
// at the REAL staged index of the fixture repository; the hook adapter itself is exercised by a real `git commit` in
// commit-msg-hook-install.test.mjs. The walk reaches feature-close-prepared (the step that reads the registered chain), as the other
// paths do; closed-local needs verify and cleanup evidence that has nothing to do with the Critic course.
// ---------------------------------------------------------------------------------------------------------------------------------
const W9_ROUNDS = () => [{ kind: "full", verdict: FAIL_MAJOR }, { kind: "delta", verdict: minors("r2"), accept: true }, { kind: "delta", verdict: PASS }];

test("W9 CHAIN: three rounds to the close with no register-feature-package call; every round's lineage is written by the finalizer and every correction commit passes the guard", () => {
  const fx = walkCourse({ label: "w9-chain", rounds: W9_ROUNDS(), slices: ["TASK-ONE"], guardCorrections: true });
  try {
    assert.equal(fx.observed.refusedAt, undefined, JSON.stringify(fx.observed.refusedAt));
    const [r1, r2, r3] = fx.observed.rounds;
    for (const step of [r1, r2, r3]) {
      assert.equal(step.lineageWritten.status, "written", JSON.stringify(step.lineageWritten));
      assert.equal(step.lineageInTree, true, "the lineage and the manifest are in the working tree when the finalizer returns");
      assert.equal(step.stagedAfterFinalize, "", "the finalizer stages nothing");
      assert.match(step.lineageWritten.commitInstruction, /commit|Commit/u, "the result names the exact commit instruction");
      assert.deepEqual(step.lineageWritten.commitPaths.length, 2);
    }
    assert.equal(r2.fallbackFull, false, "round 2 is admitted as a delta of the course (the course chain has round 1)");
    assert.equal(r2.reviewBase, r1.candidate);
    assert.equal(r3.fallbackFull, false);
    assert.equal(r3.reviewBase, r2.candidate);
    for (const step of [r2, r3]) assert.equal(step.correctionGuard.reason, "lineage-registered");
    const head = git(fx.root, ["rev-parse", "HEAD"]);
    const history = courseAdmission.resolveRetainedCriticCourseRecords({ repoRoot: fx.root, featureId: FEATURE, candidateCommit: head }).history;
    assert.equal(history.length, 3, "the registered chain covers all three rounds");
    // Idempotent: the same write again changes nothing and says so (the finalizer itself cannot be re-run: SCF-FIRST-CONSUME-REPLAY).
    const before = git(fx.root, ["status", "--porcelain"]);
    const again = finalizer.writeCriticRoundLineage({ root: fx.root, packetId: fx.observed.lastPacketId });
    assert.equal(again.status, "already-registered", JSON.stringify(again));
    assert.equal(git(fx.root, ["status", "--porcelain"]), before, "the second write changes nothing in the tree");
    const addenda = writeAddenda(fx, ["TASK-ONE"]);
    assert.equal(addenda["TASK-ONE"].status, 0, addenda["TASK-ONE"].text);
    const closed = closeToPrepared(fx);
    assert.equal(closed.planned.status, 0, JSON.stringify(closed.planned.body));
    assert.equal(closed.apply().status, "applied");
  } finally { cleanup(fx); }
});

test("W9 NEGATIVE (1)+(2): a correction commit before the lineage is committed is refused with the exact repair; the same commit that carries the manifest and the lineage file is admitted", () => {
  const fx = walkCourse({ label: "w9-guard", rounds: [{ kind: "full", verdict: FAIL_MAJOR }], slices: ["TASK-ONE"], leaveLineageUncommittedAt: 1 });
  try {
    assert.equal(fx.observed.refusedAt, undefined, JSON.stringify(fx.observed.refusedAt));
    const { packetId, written } = fx.observed.pending;
    const [manifestPath, lineagePath] = written.commitPaths;
    put(fx.root, "src/correction.mjs", "export const correction = 1;\n");
    git(fx.root, ["add", "-f", "--", "src/correction.mjs"]);
    const refusedVerdict = guardVerdict(fx.root);
    assert.equal(refusedVerdict.decision, "refuse", JSON.stringify(refusedVerdict));
    assert.equal(refusedVerdict.code, "CRL-LINEAGE-UNREGISTERED");
    assert.equal(refusedVerdict.packetId, packetId);
    assert.ok(refusedVerdict.repair.includes(`register-feature-package.mjs --root <root> --add-review-lineage --packet ${packetId}`), refusedVerdict.repair);
    assert.ok(refusedVerdict.repair.includes(manifestPath) && refusedVerdict.repair.includes(lineagePath), "the repair names the manifest and the lineage file it wrote");
    assert.ok(refusedVerdict.repair.includes("inspect-course-takeover") && refusedVerdict.repair.includes("supersede-course-takeover"), "after a correction commit the takeover recovery is the only route, and the text says so");
    // The index carrying the manifest but not the lineage file stays refused.
    git(fx.root, ["add", "-f", "--", manifestPath]);
    assert.equal(guardVerdict(fx.root).code, "CRL-LINEAGE-UNREGISTERED");
    // (2) The commit that carries both is the registration commit: admitted.
    git(fx.root, ["add", "-f", "--", lineagePath]);
    const admitted = guardVerdict(fx.root);
    assert.equal(admitted.decision, "allow", JSON.stringify(admitted));
    assert.equal(admitted.reason, "registration-commit");
    git(fx.root, ["commit", "-qm", "register lineage together with the next change"]);
    // From here the lineage is registered at HEAD: a plain correction is admitted.
    put(fx.root, "src/correction2.mjs", "export const correction2 = 2;\n");
    git(fx.root, ["add", "-f", "--", "src/correction2.mjs"]);
    assert.equal(guardVerdict(fx.root).reason, "lineage-registered");
  } finally { cleanup(fx); }
});

test("W9 NEGATIVE (1b): a round whose lineage was never written is refused with the register command; the manual route still clears the guard", () => {
  const fx = walkCourse({ label: "w9-guard-manual", rounds: [{ kind: "full", verdict: FAIL_MAJOR }], slices: ["TASK-ONE"], leaveLineageUncommittedAt: 1 });
  try {
    const { packetId, written } = fx.observed.pending;
    const [manifestPath, lineagePath] = written.commitPaths;
    // Take the written files away again: the tree is as an older build leaves it (round finished, nothing registered).
    git(fx.root, ["checkout", "--", manifestPath]);
    rmSync(join(fx.root, lineagePath));
    put(fx.root, "src/correction.mjs", "export const correction = 1;\n");
    git(fx.root, ["add", "-f", "--", "src/correction.mjs"]);
    const refusedVerdict = guardVerdict(fx.root);
    assert.equal(refusedVerdict.code, "CRL-LINEAGE-UNREGISTERED", JSON.stringify(refusedVerdict));
    assert.ok(refusedVerdict.repair.includes(`--add-review-lineage --packet ${packetId}`));
    const registered = cli("register-feature-package.mjs", ["--root", fx.root, "--add-review-lineage", "--packet", packetId]);
    assert.equal(registered.status, 0, registered.text);
    assert.equal(registered.body.status, "lineage-added");
    git(fx.root, ["add", "-f", "--", ...registered.body.commitPaths]);
    assert.equal(guardVerdict(fx.root).decision, "allow");
  } finally { cleanup(fx); }
});

test("W9 NEGATIVE (3): a repository without any Critic course commits freely (the guard fails open)", () => {
  const root = mkdtempSync(join(tmpdir(), "w9-nocourse-"));
  try {
    git(root, ["init", "-q", "-b", "main"]);
    // An unborn repository: nothing to decide.
    put(root, "a.txt", "a\n");
    git(root, ["add", "--", "a.txt"]);
    assert.deepEqual([guardVerdict(root).decision, guardVerdict(root).reason], ["allow", "not-decidable"]);
    git(root, ["commit", "-qm", "base"]);
    put(root, "b.txt", "b\n");
    git(root, ["add", "--", "b.txt"]);
    assert.deepEqual([guardVerdict(root).decision, guardVerdict(root).reason], ["allow", "no-critic-course"]);
    // A feature package without a Critic review unit is no Critic course either.
    put(root, `specs/${FEATURE}/lifecycle.json`, JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: FEATURE, rigor: 1 }, state: "approved", artifacts: [] }));
    git(root, ["add", "-f", "--", `specs/${FEATURE}/lifecycle.json`]);
    git(root, ["commit", "-qm", "package without a review unit"]);
    put(root, "c.txt", "c\n");
    git(root, ["add", "--", "c.txt"]);
    assert.equal(guardVerdict(root).decision, "allow");
    // Not a repository at all: the predicate answers allow rather than throwing.
    const plain = mkdtempSync(join(tmpdir(), "w9-plain-"));
    try { assert.equal(registration.checkCriticLineageBeforeCommit({ root: plain }).decision, "allow"); } finally { rmSync(plain, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("W9 REAL HOOK: the installed commit-msg hook refuses a correction commit while the lineage is missing (CRL-LINEAGE-UNREGISTERED) and admits the registration commit", () => {
  const fx = walkCourse({ label: "w9-hook", rounds: [{ kind: "full", verdict: FAIL_MAJOR }], slices: ["TASK-ONE"], leaveLineageUncommittedAt: 1 });
  // The hook snapshots the plugin tree twice, so it installs from a frozen copy exactly as commit-msg-hook-install.test.mjs does.
  const frozen = mkdtempSync(join(tmpdir(), "w9-hook-plugin-"));
  try {
    cpSync(fileURLToPath(new URL("../../", import.meta.url)), frozen, { recursive: true });
    const { root } = fx;
    // Governance enrollment as the guard suites do it; the writer refuses while a continuity State exists, so the untracked State is set aside.
    const statePath = join(root, ".claude/pipeline-state.json"), stateBytes = readFileSync(statePath);
    rmSync(statePath);
    const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-host-state") });
    const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-walk-fixture" });
    controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
    writeFileSync(statePath, stateBytes);
    put(root, "project/guard-config.json", json({ commitTrailerPolicy: "off" }));
    const installed = hookInstaller.applyInstall({ rootDir: root, pluginLibDir: join(frozen, "lib") });
    assert.equal(installed.status, "installed", JSON.stringify(installed));
    const commit = (subject) => spawnSync("git", ["-c", "user.name=Walk", "-c", "user.email=walk@example.invalid", "-C", root, "commit", "-q", "-m", `${subject}\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n`], { encoding: "utf8", shell: false, env: ENV });
    const { written } = fx.observed.pending;
    put(root, "docs/state.md", "state after the correction\n");
    git(root, ["add", "-f", "--", "docs/state.md"]);
    const refusedCommit = commit("docs: correction before the lineage is committed");
    assert.equal(refusedCommit.status, 1, `${refusedCommit.stdout}${refusedCommit.stderr}`);
    assert.match(refusedCommit.stderr, /CRL-LINEAGE-UNREGISTERED/u);
    assert.ok(refusedCommit.stderr.includes(written.commitPaths[1]), "the refusal names the lineage file");
    git(root, ["add", "-f", "--", ...written.commitPaths]);
    const admittedCommit = commit("chore(evidence): register the lineage with the correction");
    assert.equal(admittedCommit.status, 0, `${admittedCommit.stdout}${admittedCommit.stderr}`);
    put(root, "docs/state.md", "state after a second correction\n");
    git(root, ["add", "-f", "--", "docs/state.md"]);
    const afterwards = commit("docs: a further correction");
    assert.equal(afterwards.status, 0, `${afterwards.stdout}${afterwards.stderr}`);
  } finally { rmSync(frozen, { recursive: true, force: true }); cleanup(fx); }
});

test("W9 course repository without a consumed round, or with an unreadable owner store, still commits freely", () => {
  const fx = walkCourse({ label: "w9-open", rounds: [], slices: ["TASK-ONE"] });
  try {
    put(fx.root, "src/early.mjs", "export const early = 1;\n");
    git(fx.root, ["add", "-f", "--", "src/early.mjs"]);
    const verdict = guardVerdict(fx.root);
    assert.deepEqual([verdict.decision, verdict.reason], ["allow", "no-consumed-round"], JSON.stringify(verdict));
  } finally { cleanup(fx); }
});

test("W9 NEGATIVE (4): a lineage write refusal leaves the round evidence exported and returns the typed code in the lineage field", () => {
  const fx = walkCourse({ label: "w9-refusal", rounds: [{ kind: "full", verdict: FAIL_MAJOR }], slices: ["TASK-ONE"], sabotageLineageAtRound: 1 });
  try {
    const { packetId, finalizedLineage, exported } = fx.observed.sabotage;
    assert.equal(finalizedLineage.status, "not-written", JSON.stringify(finalizedLineage));
    assert.equal(finalizedLineage.code, "FPR-LINEAGE-NO-COURSE-CLAIM");
    assert.equal(typeof finalizedLineage.detail, "string");
    assert.equal(exported.status, 0, exported.text);
    assert.equal(exported.body.status, "exported");
    assert.equal(exported.body.lineage.status, "not-written");
    assert.equal(exported.body.lineage.code, "FPR-LINEAGE-NO-COURSE-CLAIM");
    assert.ok(exported.body.next.includes("supersede-course-takeover"), "the takeover pointer stays for the case the lineage could not be written");
    for (const name of ["receipt.json", "report.md", "index.json"]) assert.ok(existsSync(join(fx.root, `specs/${FEATURE}/evidence/critic/${packetId}/${name}`)), `${name} is exported`);
    const common = join(gitCommonOf(fx.root), "agent-pipeline", "critic-packets");
    assert.equal(readConsumedCandidateReceipt({ controlRoot: common, packetId }).receipt.packetId, packetId, "the consumed round evidence is intact");
    // The manifest is back: the write now succeeds, as the refusal text promised it could before the next correction commit.
    assert.equal(finalizer.writeCriticRoundLineage({ root: fx.root, packetId }).status, "written");
  } finally { cleanup(fx); }
});
