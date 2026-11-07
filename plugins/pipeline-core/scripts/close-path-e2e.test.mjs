#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * G20-35 (candidate 20): the path from a finished implementation to the release preflight is walked end to end, once per runner identity
 * (claude, codex, antigravity), through the real sanctioned commands of a consumer project fixture. No network, no real key: the scanner
 * observation is injected the way the security pins do it, approvals use the existing test signing fixtures.
 *
 * Source finding (Codex greenfield report): "a real end-to-end test must enable start -> independent return evidence -> consume ->
 * identical readback -> release". No greenfield run reached that part, so it was unproven on every runner.
 *
 * Walk (each step asserts exit code and the typed output the next step consumes):
 *   1 fixture consumer project + implementation commit
 *   2 work Verify (verify-evidence-producer.mjs, baseline-security included)
 *   3 Critic: register-batch, admit, finalize (consume + identical readback), export
 *   4 close: close-coordinator chain to final-verify-green, then the State writer's close-feature
 *   5 push gate decision for the candidate commit (guard-push), then release-preflight (createReleasePreflight over the facts of the walk)
 *
 * STATUS (budget checkpoint 2): steps 1-4 are GREEN on all three runner identities, through closed-local and the drive quality readback (security-scan
 * and critic-report-file rows present). Step 5 (push gate decision with a fixture approval, release preflight) is NOT written yet; the walk contains
 * no assertion for it. The close walked is a mini-profile (rigor 0) course: the rigor >= 1 candidate-bound Critic/Verify audit route is not walked.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { runSecurityScan } from "./security-scan.mjs";
import { writePrivateJsonAtomic } from "../lib/private-boundary.mjs";

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { classifyRegisteredEvidenceOnlyCommits } from "../lib/critic-course-admission.mjs";
import { prepareConsumerVerify } from "../lib/consumer-verify.mjs";
import { buildRootProjectCalibrationIdentity } from "../lib/project-calibration-identity.mjs";
import { readState, run } from "./pipeline-state.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../lib/architecture-map-scaffold.mjs";
import { createDesignReviewReceipt } from "../lib/design-review-receipt.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { NEUTRAL_MANIFEST } from "../lib/project-authority.mjs";
import * as po from "../lib/po-gate-authority.mjs";
import { nativeContractFixtureParent } from "../lib/test-item-approved-course-fixture.mjs";

const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));
const script = (name) => join(SCRIPTS, name);

export const RUNNER_IDENTITIES = Object.freeze([
  Object.freeze({ runner: "claude", provider: "anthropic", adapter: "session-functional-equivalent" }),
  Object.freeze({ runner: "codex", provider: "openai", adapter: "session-functional-equivalent" }),
  Object.freeze({ runner: "antigravity", provider: "google", adapter: "session-functional-equivalent" }),
]);

const FEATURE_ID = "e2e";
const RUNNER_MARKERS = Object.freeze({
  claude: { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "11111111-aaaa-bbbb-cccc-222222222222" },
  codex: { CODEX_THREAD_ID: "33333333-aaaa-bbbb-cccc-444444444444" },
  antigravity: { ANTIGRAVITY_AGENT: "1" },
});
/** The ambient environment of one runner: its own markers only, never another runner's, and the project dir the State writer reads. */
function runnerEnv(runner, root) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  for (const key of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID", "ANTIGRAVITY_AGENT", "AI_AGENT", "NODE_TEST_CONTEXT"]) delete env[key];
  return { ...env, ...RUNNER_MARKERS[runner] };
}
let walkEnv = process.env;

/** Run one real command and keep its transcript so a failing step reports the exact command, code and output. */
function step(log, label, executable, args, { cwd, env = walkEnv, expectedStatus = 0 } = {}) {
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 1 << 26 });
  log.push({ label, command: [basename(executable), ...args.map((a) => String(a).replaceAll(tmpdir(), "<tmp>"))].join(" "), status: result.status });
  assert.equal(result.status, expectedStatus, `${label}: exit ${result.status} (expected ${expectedStatus})\n${result.stdout}\n${result.stderr}`);
  return result;
}
const json = (result) => {
  try { return JSON.parse(result.stdout); } catch { return JSON.parse(result.stdout.trim().split("\n").filter(Boolean).at(-1)); }
};
const git = (log, root, args) => step(log, `git ${args[0]}`, "git", ["-C", root, ...args]).stdout.trim();
function commit(log, root, message) {
  git(log, root, ["add", "."]);
  git(log, root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(log, root, ["rev-parse", "HEAD"]);
}
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const AT = "2026-10-10T10:00:00.000Z";
const PLAN = `specs/${FEATURE_ID}/prd_${FEATURE_ID}.md`;
const SPEC = `specs/${FEATURE_ID}/spec.md`;
const MANIFEST = `specs/${FEATURE_ID}/lifecycle.json`;
const RECEIPT = `specs/${FEATURE_ID}/review/design-review-receipt-1.json`;
const REPORT = `specs/${FEATURE_ID}/review/design-review-1.md`;
const COMPANIONS = [`specs/${FEATURE_ID}/design.md`, `specs/${FEATURE_ID}/traceability.md`];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ARCHITECTURE = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };

/**
 * A consumer project whose plan was approved through the SANCTIONED course (set-feature, continuity-init, submit-plan --profile feature,
 * present-plan --review-receipt, approve-plan --design-approval-request, materialize-architecture, set-phase implementation; approval mode chat),
 * then registered with register-feature-package.mjs. A trimmed port of lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs
 * `buildConsumer`. The plan-submission rigor row is therefore recorded the way a real course records it (the start state of the first
 * version of this walk was built with library transitions and had none: w265 finding 1). The State-writing verbs of the course run in-process
 * (the same `run` the CLI wraps), under the test process's own markers; everything from the registration on runs as child processes.
 */
function consumerFixture(log, identity) {
  const parent = realpathSync(mkdtempSync(join(nativeContractFixtureParent(), `g2035-${identity.runner}-`)));
  const root = join(parent, "repo");
  mkdirSync(root);
  process.env.GIT_CEILING_DIRECTORIES = parent;
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
  const gitOk = (...args) => { const out = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 60000, env }); assert.equal(out.status, 0, `SETUP git ${args[0]}: ${out.stderr}`); return out.stdout.trim(); };
  const write = (path, bytes) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };
  const read = (path) => readFileSync(join(root, path));
  const lifecycle = (argv) => {
    const logs = [];
    const old = { log: console.log, error: console.error, warn: console.warn };
    for (const name of Object.keys(old)) console[name] = (...args) => { logs.push(args.map(String).join(" ")); };
    let status;
    try { status = run(argv, { dir: root, now: () => AT }); } finally { Object.assign(console, old); }
    assert.equal(status, 0, `SETUP ${argv[0]}: ${logs.join("\n")}`);
  };
  gitOk("init", "-q", "-b", "main");
  gitOk("config", "user.email", "goldfish@example.invalid");
  gitOk("config", "user.name", "Goldfish");
  gitOk("config", "core.autocrlf", "false");
  assert.equal(realpathSync(root), root);
  write("README.md", "# Consumer fixture\n");
  write(".gitignore", "scratch/\n/evidence/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  const calibration = buildRootProjectCalibrationIdentity({ rootDir: root });
  const baseline = { schema: "pipeline.project.v1", project: basename(root), verify: 'node -e "process.exit(0)"', autonomy: "gated", handover: "docs/state.md",
    projectIdentity: { schema: calibration.schema, kind: calibration.kind, rootSha256: calibration.rootSha256 } };
  for (const twin of ["project/pipeline.json", ".claude/pipeline.json"]) write(twin, `${JSON.stringify(baseline, null, 2)}\n`);
  prepareConsumerVerify({ rootDir: root });
  gitOk("add", ".");
  gitOk("commit", "-q", "-m", "seed baseline verification");
  const governance = createGovernanceScopeController({ hostStateRoot: join(parent, "host-state") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "g2035-fixture" });
  assert.equal(governance.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active", "SETUP real governance decision");
  write("pipeline.user.yaml", "schema: pipeline.user.v1\nlanguage:\n  human_facing: en\n  agent_facing: en\ngates:\n  human_approval: chat\n");
  gitOk("add", "--", "pipeline.user.yaml");
  gitOk("commit", "-q", "-m", "selected approval mode");
  write(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\n");
  write(NEUTRAL_MANIFEST, read(".claude/pipeline.yaml"));
  for (const target of initialGreenfieldMapTargets("fresh")) write(target.path, target.bytes);
  const pointer = initialGreenfieldAgentEntryTarget("fresh");
  write(pointer.path, pointer.bytes);
  write("docs/adr/.gitkeep", "");
  // The control catalog the v2 security envelope sources its capability plan from (seeded the way the security integration suite seeds it).
  write("governance/security-controls/catalog.json", readFileSync(new URL("../../../governance/security-controls/catalog.json", import.meta.url)));
  write(SPEC, "# Synthetic Test Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Synthetic candidate-bound review |\n");
  write(PLAN, `${po.PO_GATE_PRD_LANGUAGE_MARKER("en")}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${sha256(read(SPEC))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(ARCHITECTURE)}\n\`\`\`\n`);
  write(COMPANIONS[0], "# Synthetic Design\n");
  write(COMPANIONS[1], "| ID | Evidence |\n| --- | --- |\n");
  write(REPORT, "# Synthetic method review\nVerdict: pass.\n");
  const common = join(root, ".git");
  const profile = po.createPoGateProfileReceipt({ repositoryFingerprint: po.derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: root }), primaryRoot: root, sourceBytes: read("pipeline.user.yaml"), runtimeBytes: read(".claude/pipeline.yaml"), updatedAt: AT });
  const profilePath = resolve(po.poGateProfileReceiptPath(common));
  mkdirSync(dirname(profilePath), { recursive: true, mode: 0o700 });
  writeFileSync(profilePath, po.serializePoGateProfileReceipt(profile), { mode: 0o600 });
  const source = (path) => ({ path, sha256: sha256(read(path)) });
  const review = createDesignReviewReceipt({ featureId: FEATURE_ID, previous: null, sources: { prd: source(PLAN), spec: source(SPEC), companions: COMPANIONS.map(source) }, reviewer: { runner: "claude", model: "claude-opus-4" }, report: source(REPORT), openFindingIds: [], reviewedAt: AT });
  assert.ok(review.ok, `SETUP actual review producer: ${review.code}`);
  write(RECEIPT, Buffer.from(review.bytes));
  const keyPair = generateKeyPairSync("ed25519");
  const publicKeyPem = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
  write("project/critical-human-proof.json", `${JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "test-key", publicKeySha256: sha256(publicKeyPem) }] }, null, 2)}\n`);
  gitOk("add", ".");
  gitOk("commit", "-q", "-m", "finished design");
  // The public lifecycle route, in order; each step is the real verb. No lifecycle.json and no State is written by hand.
  lifecycle(["set-feature", "--id", FEATURE_ID, "--plan-path", PLAN]);
  const continuity = { schema: "pipeline.continuity.v0", featureId: FEATURE_ID, revision: 0, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: source(PLAN), spec: source(SPEC), result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  write("scratch/continuity-init-request.json", `${JSON.stringify(continuity, null, 2)}\n`);
  lifecycle(["continuity-init", "--expected-revision", "absent", "--request-file", "scratch/continuity-init-request.json", "--lock-token", "g2035-fixture-token"]);
  lifecycle(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  lifecycle(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  const current = () => { const observed = readState(root); assert.equal(observed.status, "ok"); return observed.state; };
  lifecycle(["approve-plan", "--by", "synthetic-po", "--design-approval-request", current().planPresentation.designApprovalRequestPath]);
  assert.equal(current().planApproval.schema, "pipeline.plan-approval.v9");
  lifecycle(["materialize-architecture"]);
  lifecycle(["set-phase", "--phase", "implementation"]);
  assert.ok(current().rigorHistory.some((row) => (row.body ?? row).boundary === "plan-submission"), "the plan-submission rigor row exists (recorded by submit-plan)");
  // A fixture signature for a critical action, made the way the PO's terminal makes it (Ed25519 over the approval intent digest) with the
  // test key whose public digest is the policy's trust anchor. No real key exists or is needed.
  const signProof = ({ kind, subjectSha256, candidate, expiresAt }) => {
    const request = createCriticalActionApprovalRequest({ candidate, featureId: FEATURE_ID, planBytes: read(PLAN), specBytes: read(SPEC), action: { kind, subjectSha256, expiresAt } });
    const files = { request: join(parent, `${kind}-request.json`), authority: join(parent, `${kind}-authority.json`), proof: join(parent, `${kind}-proof.json`) };
    writeFileSync(files.request, JSON.stringify(request));
    writeFileSync(files.authority, JSON.stringify({ keyReference: "test-key", publicKeySha256: sha256(publicKeyPem) }));
    writeFileSync(files.proof, JSON.stringify({ schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey: publicKeyPem,
      signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keyPair.privateKey).toString("base64") }));
    return files;
  };
  return { root, parent, env, gitOk, read, write, current, signProof };
}

/** The authored dispatch record a Critic review binds to (shape of the record the host commit route persists). */
function dispatchRecord(taskId, commitSha) {
  return {
    schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "fixture-model", effort: "medium",
    rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed",
    commits: [commitSha], candidateCommit: commitSha, resultSha256: "a".repeat(64), log: [{ phase: "verify", toolUseCount: 1 }],
    report: { text: "done", changedFiles: ["src/index.mjs"] },
    criticRequired: { schema: "pipeline.critic-required-decision.v1",
      trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true,
        diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" },
  };
}

// Injected scanner observation (no network, no real scanner): fixture binaries reached through PIPELINE_<TOOL>_PATH, the trust assessment mocked,
// exactly as scripts/security-scan-v2-integration.test.mjs does it. The spawned Verify CLI cannot take the trust mock, so the frozen candidate's
// scan runs in-process through the same exported engine the security-scan CLI wraps.
const SCANNER_DIR = mkdtempSync(join(tmpdir(), "g2035-scanners-"));
after(() => rmSync(SCANNER_DIR, { recursive: true, force: true }));
function scannerBinary(name, body) {
  const path = join(SCANNER_DIR, name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}`);
  chmodSync(path, 0o755);
  return path;
}
const scannerEnv = {
  PIPELINE_GITLEAKS_PATH: scannerBinary("gitleaks-clean", `import { writeFileSync } from "node:fs";\nconst a = process.argv.slice(2);\nwriteFileSync(a[a.indexOf("--report-path") + 1], "[]");\n`),
  PIPELINE_OSV_SCANNER_PATH: scannerBinary("osv-clean", `if (process.argv.includes("--version")) { process.stdout.write("osv-scanner version: 2.0.3\\n"); process.exit(0); }\nprocess.stdout.write(JSON.stringify({ results: [] }));\n`),
  PIPELINE_SEMGREP_PATH: scannerBinary("semgrep-clean", `process.stdout.write(JSON.stringify({ results: [] }));\n`),
};
const scannerSpawn = (cmd, args, opts) => spawnSync(cmd, args, { ...opts, shell: false });
const assessScannerFixture = (path) => (typeof path === "string" && path.startsWith(SCANNER_DIR) ? { ok: true, path } : { ok: false, status: "untrusted_path" });

test("G20-35: the close path from implementation to release preflight is walked end to end on every runner identity", { timeout: 300_000 }, async () => {
  for (const identity of RUNNER_IDENTITIES) {
    const log = [];
    const fx = consumerFixture(log, identity);
    walkEnv = runnerEnv(identity.runner, fx.root);
    try {
      // 0 the feature package of the approved plan, registered through the sanctioned verb (manifest, Result, Acceptance, review unit, envelope)
      const registeredPackage = json(step(log, `${identity.runner}: register-feature-package`, process.execPath, [script("register-feature-package.mjs"), "--root", fx.root], { cwd: fx.root }));
      assert.equal(registeredPackage.status, "registered", JSON.stringify(registeredPackage).slice(0, 600));
      const commitPaths = (message, paths) => {
        git(log, fx.root, ["add", "-f", "--", ...paths]);
        git(log, fx.root, ["commit", "-qm", message]);
        return git(log, fx.root, ["rev-parse", "HEAD"]);
      };
      const base = commitPaths("chore: register the feature package", registeredPackage.commitPaths);

      // 1 implementation commit, then the authored dispatch record of the slice that produced it
      mkdirSync(join(fx.root, "src"), { recursive: true });
      writeFileSync(join(fx.root, "src", "index.mjs"), "export const value = 'expected';\n");
      const implementation = commit(log, fx.root, "feat: implementation");
      const taskId = `g2035-${identity.runner}`;
      mkdirSync(join(fx.root, "evidence"), { recursive: true });
      writeJson(join(fx.root, "evidence", `dispatch-record-${taskId}.json`), dispatchRecord(taskId, implementation));
      // evidence/ is ignored in the fixture; the record is committed by force like the host commit route does for its record.
      git(log, fx.root, ["add", "-f", `evidence/dispatch-record-${taskId}.json`]);
      git(log, fx.root, ["commit", "-qm", "chore: persist the dispatch record"]);
      const candidate = git(log, fx.root, ["rev-parse", "HEAD"]);
      const tree = git(log, fx.root, ["rev-parse", `${candidate}^{tree}`]);
      assert.match(candidate, /^[a-f0-9]{40}$/u);
      assert.match(tree, /^[a-f0-9]{40}$/u);

      // 2 work Verify, baseline-security included
      const verify = step(log, `${identity.runner}: work verify`, process.execPath,
        [script("verify-evidence-producer.mjs"), "--root", fx.root, "--mode", "work", "--out", "evidence/verify-work.json"], { cwd: fx.root });
      const evidence = JSON.parse(readFileSync(join(fx.root, "evidence", "verify-work.json"), "utf8"));
      assert.equal(evidence.candidate.commit, candidate, `${identity.runner}: work Verify binds the candidate`);
      assert.ok(evidence.steps.some((s) => s.name === "baseline-security" && s.exitCode === 0), `${identity.runner}: baseline-security ran green`);
      assert.equal(verify.status, 0);

      // 3 Critic on the FEATURE COURSE (critic-review skill, diagnostic evidence route): diagnostic evidence, its registration commit, the preflight,
      // admit, finalize (consume + identical readback), export, lineage registration. This is the round that can be carried across the close.
      const diagnosticPath = `specs/${FEATURE_ID}/evidence/diagnostic.json`;
      step(log, `${identity.runner}: critic diagnostic evidence`, process.execPath,
        [script("critic-diagnostic-evidence.mjs"), "--root", fx.root, "--spec", SPEC, "--log", `specs/${FEATURE_ID}/evidence/targeted.log`, "--out", diagnosticPath,
          "--candidate", candidate, "--guardrail", ".claude/pipeline.yaml", "--", process.execPath, "-e", "process.exit(0)"], { cwd: fx.root });
      const diagnosticRegistered = json(step(log, `${identity.runner}: register diagnostic evidence`, process.execPath,
        [script("register-feature-package.mjs"), "--root", fx.root, "--add-diagnostic-evidence", diagnosticPath], { cwd: fx.root }));
      const registrationCommit = commitPaths("chore: register the Critic diagnostic evidence", diagnosticRegistered.commitPaths);
      const preflight = json(step(log, `${identity.runner}: critic preflight`, process.execPath,
        [script("critic-dispatch-preflight.mjs"), "--root", fx.root, "--base", base, "--candidate", candidate, "--spec", SPEC, "--guardrail", ".claude/pipeline.yaml",
          "--evidence", diagnosticPath, "--registration-commit", registrationCommit, "--task-id", taskId], { cwd: fx.root }));
      assert.equal(preflight.status, "packet-ready", JSON.stringify(preflight).slice(0, 600));
      const finalizer = (verb, request) => {
        mkdirSync(join(fx.root, "scratch"), { recursive: true });
        writeJson(join(fx.root, "scratch", `${verb}-request.json`), request);
        return step(log, `${identity.runner}: critic ${verb}`, process.execPath,
          [script("session-critic-finalizer.mjs"), verb, "--root", fx.root, "--request", `scratch/${verb}-request.json`], { cwd: fx.root });
      };
      const packetId = "1".repeat(32);
      const finalizeRequest = {
        schema: "pipeline.session-critic-finalization-request.v2", taskId, projectId: "consumer-fixture", sessionId: `${identity.runner}-critic-1`, packetId, trigger: "T1",
        route: { routeId: "session-critic", runner: identity.runner, adapter: identity.adapter, provider: identity.provider, modelTier: "higher-capability", effortTier: "xhigh" },
        review: { base, candidate, specPath: SPEC, guardrailPaths: [".claude/pipeline.yaml"], evidencePaths: [diagnosticPath], priorCriticEvidencePath: null,
          courseContext: { featureId: FEATURE_ID, registrationCommit, acceptedReference: null, criterionLocator: null, deltaRequestPath: null } },
        verdictPath: "evidence/critic-verdict.json", event: null,
      };
      const admitted = json(finalizer("admit", finalizeRequest));
      assert.equal(admitted.packetId, packetId);
      writeJson(join(fx.root, "evidence", "critic-verdict.json"), { findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent",
        trajectory_evidence: "candidate evidence inspected", briefing_violations: [], pass: true });
      const finalized = json(finalizer("finalize", finalizeRequest));
      assert.equal(finalized.status, "completed", `${identity.runner}: the Critic return is consumed and read back identically`);
      assert.equal(finalized.receipt.session.id, `${identity.runner}-critic-1`);
      writeFileSync(join(fx.root, "evidence", "critic-report.md"), "# Critic report\n\nNo findings.\n");
      const exported = json(finalizer("export", {
        schema: "pipeline.session-critic-export-request.v1", packetId, reportPath: "evidence/critic-report.md", outDir: `specs/${FEATURE_ID}/evidence/critic/${packetId}`,
      }));
      assert.equal(exported.status, "exported");
      // The round's lineage is registered by the export itself (no separate registration is needed); the verb reads it back as already registered.
      const lineage = json(step(log, `${identity.runner}: read back the review lineage`, process.execPath,
        [script("register-feature-package.mjs"), "--root", fx.root, "--add-review-lineage", "--packet", packetId], { cwd: fx.root }));
      assert.equal(lineage.status, "already-registered", JSON.stringify(lineage).slice(0, 400));

      // 4 close: the coordinator chain through the real CLI, the State writer action the coordinator returns, no hand-written close state
      // One commit holds exactly what the export produced: the export files, the lineage file and the manifest entry that lists it.
      // criticExportOnlyCommit admits that form since w265 finding 4 (before, only the export files alone; the combined commit was refused
      // VEP-CVL-CARRY-CONTENT-CHANGED by the Critic-bound candidate Verify below).
      const exportCommit = commit(log, fx.root, "docs: exported Critic evidence and its registered lineage");
      assert.notEqual(exportCommit, candidate, "the exported evidence follows the reviewed candidate");
      const lifecycle = `close-${identity.runner}`;
      const coordinator = (verb, extra) => json(step(log, `${identity.runner}: close-coordinator ${verb}`, process.execPath,
        [script("close-coordinator.mjs"), verb, "--root", fx.root, "--lifecycle", lifecycle, ...extra], { cwd: fx.root }));
      const runAction = (label, action) => json(step(log, `${identity.runner}: ${label}`, action.executable, action.argv, { cwd: fx.root }));
      const started = coordinator("plan-start", ["--actor", "PO", "--close-intent", "durable-stop"]);
      const startedApplied = runAction("apply-start", started.nextAction);
      assert.equal(startedApplied.status, "applied");
      const transition = (phase, extra = []) => runAction(`apply ${phase}`, coordinator("plan-transition", ["--actor", "PO", "--phase", phase, ...extra]).nextAction);
      transition("checkpointed");
      // The Result is bound to the Continuity state and the queue head says close (the work package's own output); the close request names the
      // exported Critic receipt as its close evidence, which the skill names as the usual choice.
      const STATE = "project/pipeline-state.json"; // the project authority tier (the baseline twin project/pipeline.json selects it)
      const statePath = join(fx.root, STATE);
      const fileSha = (rel) => createHash("sha256").update(readFileSync(join(fx.root, rel))).digest("hex");
      const resultPath = `specs/${FEATURE_ID}/result.md`;
      const stateWriter = (label, verb, extra = []) => step(log, `${identity.runner}: ${label}`, process.execPath, [script("pipeline-state.mjs"), verb, ...extra], { cwd: fx.root });
      const bootstrap = json(stateWriter("continuity-result-bootstrap-plan", "continuity-result-bootstrap-plan"));
      const bootstrapApplied = step(log, `${identity.runner}: continuity-result-bootstrap-apply (the action the plan returned)`, bootstrap.applyAction.executable, bootstrap.applyAction.argv, { cwd: fx.root });
      // Measured (w265 finding 2): a REGISTERED package lags the Result the bootstrap just bound, and the sanctioned repair is a PO-signed
      // `feature-package-reconcile` (always a human proof). The fixture signs it with its own test key, the way the Result bootstrap suite does.
      const completion = JSON.parse(bootstrapApplied.stdout).completion;
      assert.equal(completion.state, "reconciliation-pending");
      const signing = completion.signatureCommand;
      assert.equal(signing.kind, "feature-package-reconcile");
      const proofFiles = fx.signProof({ kind: signing.kind, subjectSha256: signing.subjectSha256, candidate: signing.candidate, expiresAt: signing.expiresAt });
      const reconcileArgv = completion.reconcileCommand.argv.map((entry) => {
        const hit = completion.reconcileCommand.placeholders.find((placeholder) => placeholder.token === entry);
        return hit === undefined ? entry : { "--by": "Fixture PO", "--proof-request": proofFiles.request, "--proof-authority": proofFiles.authority, "--proof": proofFiles.proof }[hit.flag];
      });
      step(log, `${identity.runner}: feature-package-reconcile (fixture-signed)`, completion.reconcileCommand.executable, reconcileArgv, { cwd: fx.root });
      commit(log, fx.root, "chore: bind the Result and reconcile the feature package");
      const bound = JSON.parse(readFileSync(statePath, "utf8"));
      // review -> close through the sanctioned Result-close verb (plan, then the action it returns); no hand edit of the Continuity state
      const closePlan = json(stateWriter("continuity-result-close-plan", "continuity-result-close-plan", ["--feature-id", FEATURE_ID,
        "--expected-revision", String(bound.continuity.revision), "--result-path", bound.continuity.authority.result.path, "--result-sha256", bound.continuity.authority.result.sha256]));
      step(log, `${identity.runner}: continuity-result-close-apply (the action the plan returned)`, closePlan.applyAction.executable, closePlan.applyAction.argv, { cwd: fx.root });
      const workState = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(workState.continuity.queueHead.nextAction, "close");
      const receiptPath = `specs/${FEATURE_ID}/evidence/critic/${packetId}/receipt.json`;
      writeJson(join(fx.root, "evidence", "close-request.json"), { schema: "pipeline.continuity-close.v0", featureId: FEATURE_ID,
        expectedRevision: workState.continuity.revision, result: workState.continuity.authority.result, closeEvidence: { path: receiptPath, sha256: fileSha(receiptPath) } });
      // w265 finding 1 (measured on the realistic course): submit-plan recorded a plan-submission rigor row whose retained profile is feature, so the
      // coordinator demands the candidate-bound Critic/Verify audit route BEFORE the close (and not the bare close that a library-built start state allowed).
      const bare = step(log, `${identity.runner}: close-coordinator plan-transition without the audit route`, process.execPath,
        [script("close-coordinator.mjs"), "plan-transition", "--root", fx.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "feature-close-prepared",
          "--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json"], { cwd: fx.root, expectedStatus: 2 });
      assert.equal(json(bare).code, "CLOSE-QUALIFICATION-REQUIRED", bare.stdout);
      // The audit route (close-feature skill, Step 2): candidate Verify bound to the Critic packet (records the Critic/Verify lifecycle), registered into
      // the package, the package driven to verifying and completed for exactly HEAD, then the audit request.
      const verifyPath = `specs/${FEATURE_ID}/verify-candidate.json`;
      let lifecycleVerify;
      try {
        lifecycleVerify = step(log, `${identity.runner}: candidate verify bound to the Critic packet`, process.execPath,
          [script("verify-evidence-producer.mjs"), "--root", fx.root, "--mode", "candidate", "--critic-packet-id", packetId, "--critic-evidence-feature-id", FEATURE_ID, "--out", verifyPath], { cwd: fx.root });
      } catch (error) {
        let classified;
        try { const range = classifyRegisteredEvidenceOnlyCommits({ repoRoot: fx.root, featureId: FEATURE_ID, baseCommit: candidate, candidateCommit: git(log, fx.root, ["rev-parse", "HEAD"]), admitCriticExports: true });
          classified = JSON.stringify({ correction: range.correctionCommits, evidenceOnly: range.evidenceOnlyCommits, administration: range.administrationDocumentationCommits, range: range.rangeCommits }); }
        catch (inner) { classified = `classifier threw ${inner.code} ${inner.message}`; }
        throw new Error(`${error.message}\nCLASSIFIED ${classified}\nRANGE ${git(log, fx.root, ["log", "--format=%H %s", `${candidate}..HEAD`])}`);
      }
      // The carry-forward from the Critic-reviewed candidate to HEAD held across the evidence, lineage and reconcile commits (w265 finding 4).
      assert.equal(lifecycleVerify.status, 0);
      assert.ok(existsSync(join(fx.root, verifyPath)), `${identity.runner}: the Critic-bound candidate Verify evidence was written`);
      if (process.env.G2035_STOP_AT_AUDIT !== "0") continue; // CHECKPOINT: the audit route below is the next step (w265 notes)
      const prepared = transition("feature-close-prepared", ["--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json"]);
      assert.equal(prepared.phase, "feature-close-prepared");
      assert.ok(prepared.nextAction.argv.includes("--continuity-close-request"), `the returned close-feature action keeps the Continuity flag: ${JSON.stringify(prepared.nextAction.argv.slice(1))}`);
      // The State writer prints a plain sentence, not JSON.
      const closed = step(log, `${identity.runner}: close-feature (State writer action returned by the coordinator)`, prepared.nextAction.executable, prepared.nextAction.argv, { cwd: fx.root });
      assert.match(closed.stdout, /^Feature "/u, closed.stdout);
      const closedState = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(closedState.closedFeatures.at(-1).id, FEATURE_ID);

      // 4d tracked close effects with the real digests, one final commit, then the freeze
      const emptySha = createHash("sha256").update("").digest("hex");
      writeJson(join(fx.root, "evidence", "tracked.json"), { schema: "pipeline.close-tracked-effects.v1", resultSha256: fileSha(resultPath), backlogSha256: emptySha,
        handoverSha256: emptySha, historySha256: emptySha, telemetrySha256: emptySha, retrospectiveSha256: emptySha, pipelineStateSha256: fileSha(STATE) });
      transition("tracked-close-finalized", ["--evidence", "evidence/tracked.json"]);
      const closeCommit = commit(log, fx.root, "chore: final tracked close");
      transition("candidate-frozen");
      const frozenTree = git(log, fx.root, ["rev-parse", `${closeCommit}^{tree}`]);
      assert.match(frozenTree, /^[a-f0-9]{40}$/u);

      // 4e candidate Verify, injected security observation, final Verify evidence built from the producers' own output
      step(log, `${identity.runner}: candidate verify`, process.execPath,
        [script("verify-evidence-producer.mjs"), "--root", fx.root, "--mode", "candidate", "--out", "evidence/verify-candidate.json"], { cwd: fx.root });
      const candidateVerify = JSON.parse(readFileSync(join(fx.root, "evidence", "verify-candidate.json"), "utf8"));
      assert.equal(candidateVerify.candidate.commit, closeCommit, `${identity.runner}: candidate Verify binds the frozen candidate`);
      const scan = await runSecurityScan({ rootDir: fx.root, env: scannerEnv, spawnFn: scannerSpawn, timeoutMs: 5000, assessTrustedExecutablePath: assessScannerFixture });
      assert.equal(scan.exitCode, 0, `${identity.runner}: the injected clean scanners pass the frozen candidate`);
      assert.equal(scan.verdictV2.verdict.blocking, false);
      const finalEvidence = join(startedApplied.evidenceDirectory, "final-verification.json");
      writePrivateJsonAtomic(finalEvidence, { schema: "pipeline.close-final-verification.v1", candidateOid: closeCommit, candidateTree: frozenTree,
        verifyStatus: "green", verifySha256: fileSha("evidence/verify-candidate.json"), securityStatus: "green", securitySha256: fileSha("evidence/security-latest.v2.verdict.json") });
      transition("final-verify-green", ["--evidence", finalEvidence]);
      const driven = coordinator("drive", ["--actor", "PO", "--phase", "cleanup-complete", "--apply"]);
      assert.equal(driven.status, "applied", JSON.stringify(driven).slice(0, 600));
      transition("closed-local");
      const readback = coordinator("drive", ["--actor", "PO"]);
      const rowStatus = Object.fromEntries(readback.qualityReadback.map((row) => [row.id, row.status]));
      assert.equal(rowStatus["security-scan"], "present", JSON.stringify(readback.qualityReadback));
      assert.equal(rowStatus["critic-report-file"], "present", JSON.stringify(readback.qualityReadback));
    } finally {
      rmSync(fx.parent, { recursive: true, force: true, maxRetries: 3 });
    }
  }
});
