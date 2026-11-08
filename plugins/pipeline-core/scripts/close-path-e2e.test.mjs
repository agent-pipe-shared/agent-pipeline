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
 * STATUS (w266): the whole walk is GREEN on all three runner identities. The course is the sanctioned feature course (rigor >= 1): Critic on the
 * feature course, the audit route (Verify evidence registered under specs/<feature>/evidence/, package to verifying and completed, audit request,
 * feature-close-prepared with --audit-request and --critic-verify-lifecycle), the close to closed-local, the Critic-bound push Verify, push-prepare
 * `ready`, the push guard (blocked before approve-push, admitted after, bound to its destination), and the release preflight, which is the
 * Pipeline's own publication gate and refuses a consumer fixture precisely (RPC-INPUT, no record written). No stand-in remains at the finalize
 * call: the Critic Source return record is issued by the runner's own hook on every identity (G20-39 stop hook for Claude and Codex, G20-41
 * PreToolUse hook on the Critic child's send_message for Antigravity); a fourth, shorter walk keeps the PO acknowledgement bridge for a stop that issued nothing.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { runSecurityScan } from "./security-scan.mjs";
import { runSessionCriticFinalizerCli } from "./session-critic-finalizer.mjs";
import { writePrivateJsonAtomic } from "../lib/private-boundary.mjs";

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
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
const GUARD_PUSH = fileURLToPath(new URL("../hooks/guard-push.mjs", import.meta.url));
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
    return logs;
  };
  gitOk("init", "-q", "-b", "main");
  gitOk("config", "user.email", "goldfish@example.invalid");
  gitOk("config", "user.name", "Goldfish");
  gitOk("config", "core.autocrlf", "false");
  assert.equal(realpathSync(root), root);
  write("README.md", "# Consumer fixture\n");
  write(".gitignore", "scratch/\n/evidence/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  // G20-42: onboarding creates the tracked VERSION file (0.1.0) in its sanctioned commit route; the fixture stands in for that route.
  write("VERSION", "0.1.0\n");
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
  // The push gate is configured from the start (the PO-gate profile receipt below binds these exact bytes): blocking, human, approval required.
  write(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\n");
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
  // The push approval is active (the manifest above), so submit-plan refuses PUSH-THREAT-MODEL-MISSING until the sanctioned verb
  // materializes the threat model; its repair names it, and it must be in the same draft commit (before the item binding).
  lifecycle(["materialize-push-threat-model"]);
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
  // G20-51 (candidate 20b): materialize-architecture registers the feature package itself and names its files in the commit step.
  const materialized = JSON.parse(lifecycle(["materialize-architecture"]).at(-1));
  assert.equal(materialized.featurePackage?.status, "registered", `materialize-architecture registers the package: ${JSON.stringify(materialized).slice(0, 600)}`);
  const setPhaseLogs = lifecycle(["set-phase", "--phase", "implementation"]).join("\n");
  // G20-54 (candidate 20b): set-phase names the package step, and points at the verification tiers "below" only when they follow.
  assert.match(setPhaseLogs, /moved approved -> implementing/u, setPhaseLogs.slice(0, 600));
  assert.equal(/verification tiers below/u.test(setPhaseLogs), /commit the verification tiers ALONE/u.test(setPhaseLogs), setPhaseLogs.slice(0, 600));
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
  return { root, parent, env, gitOk, read, write, current, signProof, materializedPackage: materialized.featurePackage };
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

// G20-41: how the Critic Source return record is issued on each walk. Claude and Codex: the subagent STOP hook (G20-39). Antigravity: its PreToolUse hook
// on the Critic child's final send_message to its parent (G20-41). "none": a runner stop that issued nothing; that walk keeps the PO acknowledgement
// bridge (G20-39) and ends at the admitted close preparation.
const ANTIGRAVITY_IDENTITY = RUNNER_IDENTITIES.find((entry) => entry.runner === "antigravity");
const WALKS = Object.freeze([
  ...RUNNER_IDENTITIES.map((identity) => Object.freeze({ identity, criticReturn: identity === ANTIGRAVITY_IDENTITY ? "send-message" : "stop-hook" })),
  Object.freeze({ identity: ANTIGRAVITY_IDENTITY, criticReturn: "none" }),
]);

test("G20-35: the close path from implementation to release preflight is walked end to end on every runner identity", { timeout: 600_000 }, async () => {
  for (const { identity, criticReturn } of WALKS) {
    const log = [];
    const fx = consumerFixture(log, identity);
    walkEnv = runnerEnv(identity.runner, fx.root);
    try {
      // 0 the feature package of the approved plan, registered through the sanctioned verb (manifest, Result, Acceptance, review unit, envelope)
      // QG-04 restatement (candidate 20b, G20-51): materialize-architecture already registered the package, so the sanctioned verb is
      // the readback here (already-registered, byte-stable); the commit carries every file both outputs name, as the agent's commit
      // step does.
      const registeredPackage = json(step(log, `${identity.runner}: register-feature-package`, process.execPath, [script("register-feature-package.mjs"), "--root", fx.root], { cwd: fx.root }));
      assert.equal(registeredPackage.status, "already-registered", JSON.stringify(registeredPackage).slice(0, 600));
      registeredPackage.commitPaths = [...new Set([...fx.materializedPackage.commitPaths, ...registeredPackage.commitPaths])];
      const commitPaths = (message, paths) => {
        git(log, fx.root, ["add", "-f", "--", ...paths]);
        git(log, fx.root, ["commit", "-qm", message]);
        return git(log, fx.root, ["rev-parse", "HEAD"]);
      };
      const base = commitPaths("chore: register the feature package", registeredPackage.commitPaths);

      // 1 implementation commit, then the authored dispatch record of the slice that produced it
      mkdirSync(join(fx.root, "src"), { recursive: true });
      writeFileSync(join(fx.root, "src", "index.mjs"), "export const value = 'expected';\n");
      // G20-42 (3): the release-notes entry is written with the feature, so it is part of the Critic-reviewed candidate (a later non-evidence commit
      // would not be carried by the Critic-bound push Verify). The entry names the closed feature id, its title, the criteria met and the version.
      writeFileSync(join(fx.root, "RELEASE-NOTES.md"), `# Release notes\n\n## v0.1.0\n\n- Feature ${FEATURE_ID}: Synthetic Test PRD\n  - AC-1: The package must receive a PASS verdict from an independent Critic before acceptance.\n`);
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
      const criticVerdict = { findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent",
        trajectory_evidence: "candidate evidence inspected", briefing_violations: [], pass: true };
      writeJson(join(fx.root, "evidence", "critic-verdict.json"), criticVerdict);
      if (criticReturn === "stop-hook") {
        // G20-39: the Critic subagent's stop is what issues the Source return record, never the calling agent. The stop hook runs as the runner runs
        // it (a child process fed the stop payload on stdin) with the Critic's final message carrying the verdict; the CLI finalize below then reads
        // the record from the private control area and the close gate admits it at rigor >= 1.
        const stop = spawnSync(process.execPath, [fileURLToPath(new URL("../hooks/native-goldfish-host.mjs", import.meta.url)), "--runner", identity.runner],
          { input: JSON.stringify({ hook_event_name: "SubagentStop", session_id: RUNNER_MARKERS[identity.runner].CLAUDE_CODE_SESSION_ID ?? RUNNER_MARKERS[identity.runner].CODEX_THREAD_ID,
            agent_id: `critic-${identity.runner}-1`, agent_type: "pipeline-core:critic", cwd: fx.root, stop_hook_active: false,
            last_assistant_message: `Review finished; notes are in the notes file.\n\n\`\`\`json\n${JSON.stringify(criticVerdict, null, 2)}\n\`\`\`\n` }),
          cwd: fx.root, env: walkEnv, encoding: "utf8", timeout: 60_000 });
        assert.equal(stop.status, 0, `${identity.runner}: the Critic stop hook never blocks: ${stop.stderr}`);
        assert.equal(stop.stdout, "", `${identity.runner}: a stop hook's stdout is read as a decision and stays empty`);
        assert.match(stop.stderr, /Critic Source return issued for packet/u, `${identity.runner}: ${stop.stderr}`);
        assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", packetId, "source-return.json")), true);
      } else if (criticReturn === "send-message") {
        // G20-41: the Critic CHILD ends by sending its verdict to its parent conversation (measured, M4c). The real PreToolUse hook runs as a child process
        // fed a payload shaped like the measured one: the child's own conversationId, artifactDirectoryPath = <brain>/<child id>, modelName, stepIdx,
        // toolCall {name, args {Message, Recipient}}, transcriptPath, workspacePaths; the host-written descriptor sits under the PARENT's brain directory.
        const parentId = "7d1f0c52-2b7e-4a39-9f0e-3a5c1b8d2e41";
        const childId = "c3a9e6b4-51d8-4f27-8a60-0e9b7d4c1f25";
        const brain = join(fx.parent, "brain");
        mkdirSync(join(brain, parentId, ".system_generated", "subagents"), { recursive: true });
        mkdirSync(join(brain, childId), { recursive: true });
        writeJson(join(brain, parentId, ".system_generated", "subagents", `${childId}.json`), { conversationId: childId,
          subagentDescriptor: { typeName: "critic", role: "critic" }, state: "SUBAGENT_STATE_ALIVE", spawnStepIndex: 3, workspaceUris: [] });
        const sendMessage = JSON.stringify({ conversationId: childId, artifactDirectoryPath: join(brain, childId), modelName: "gemini-3-pro", stepIdx: 9,
          toolCall: { name: "send_message", args: { Message: `Review finished; notes are in the notes file.\n\n\`\`\`json\n${JSON.stringify(criticVerdict, null, 2)}\n\`\`\`\n`, Recipient: parentId } },
          transcriptPath: join(brain, childId, "transcript.jsonl"), workspacePaths: [fx.root, fx.root] });
        const fire = () => spawnSync(process.execPath, [fileURLToPath(new URL("../hooks/antigravity-pretool-guard.mjs", import.meta.url))],
          { input: sendMessage, cwd: fx.root, env: walkEnv, encoding: "utf8", timeout: 60_000 });
        const recordPath = join(fx.root, ".git", "agent-pipeline", "critic-packets", packetId, "source-return.json");
        const first = fire();
        assert.equal(first.status, 0, `${identity.runner}: the hook never blocks the Critic's final message: ${first.stderr}`);
        assert.equal(first.stdout.trim(), JSON.stringify({ decision: "allow" }));
        assert.match(first.stderr, /code=critic-source-return status="issued"/u, `${identity.runner}: ${first.stderr}`);
        assert.equal(existsSync(recordPath), true);
        const issuedBytes = readFileSync(recordPath, "utf8");
        // The hook fires twice per tool call (the child worktree cwd, then the main repository cwd): the second firing finds the record and changes nothing.
        const second = fire();
        assert.equal(second.status, 0, second.stderr);
        assert.equal(second.stdout.trim(), JSON.stringify({ decision: "allow" }));
        assert.match(second.stderr, /status="already-issued"/u, second.stderr);
        assert.equal(readFileSync(recordPath, "utf8"), issuedBytes);
      }
      const finalized = json(finalizer("finalize", finalizeRequest));
      assert.equal(finalized.status, "completed", `${identity.runner}: the Critic return is consumed and read back identically`);
      assert.equal(finalized.independence, criticReturn === "none" ? "caller-authored-fallback" : "source-issued-origin", `${identity.runner}: ${criticReturn}`);
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
      // Measured (w265 finding 2): a REGISTERED package lags the Result the bootstrap just bound. G20-38 (PO decision 2026-11-07), restated
      // from the w265 walk, which signed this reconcile with the fixture's own test key: the plan moves only the Result entry, so every other
      // artifact keeps the digest the approved manifest pins and the agent runs the reconcile itself, with no proof flags and no signature.
      const completion = JSON.parse(bootstrapApplied.stdout).completion;
      assert.equal(completion.state, "reconciliation-pending");
      assert.equal(completion.preview.requiredAuthority, "agent");
      assert.equal(completion.signatureCommand, undefined, "no signing command is printed for an unchanged approved package");
      assert.deepEqual(completion.reconcileCommand.requiredInputs, []);
      // The other side of the rule: when a non-result entry also drifted, the plan names the PO and the same command without a proof is refused.
      const manifestRel = completion.manifest;
      const driftEntry = JSON.parse(readFileSync(join(fx.root, manifestRel), "utf8")).artifacts.find((entry) => !["result", "prd", "spec"].includes(entry.class));
      assert.ok(driftEntry, "the registered package holds a non-result, non-authority artifact to drift");
      const driftPath = join(fx.root, driftEntry.path); const driftOriginal = readFileSync(driftPath);
      writeFileSync(driftPath, Buffer.concat([driftOriginal, Buffer.from("\ndrifted after the approval\n")]));
      const mixed = json(stateWriter("continuity-result-bootstrap-plan (a non-result entry also drifted)", "continuity-result-bootstrap-plan"));
      assert.equal(mixed.preview.requiredAuthority, "po");
      assert.equal(mixed.signatureCommand.kind, "feature-package-reconcile", "the PO-signed route still prints its signing command");
      const unsigned = step(log, `${identity.runner}: feature-package-reconcile without a proof is refused when a non-result entry drifted`, process.execPath,
        [script("pipeline-state.mjs"), "feature-package-reconcile", "--root", fx.root, "--manifest", manifestRel, "--plan-sha256", mixed.planSha256], { cwd: fx.root, expectedStatus: 2 });
      assert.match(unsigned.stderr, /FTP-RECONCILE-APPROVAL-REJECTED/);
      writeFileSync(driftPath, driftOriginal); // the approved bytes are back: the plan is the result-only one again
      const reconciled = step(log, `${identity.runner}: feature-package-reconcile (agent-run, result-only)`, completion.reconcileCommand.executable, completion.reconcileCommand.argv, { cwd: fx.root });
      assert.deepEqual(JSON.parse(reconciled.stdout).approval, { basis: "agent-result-only-reconcile-no-po-proof", poProof: false });
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
      const verifyPath = `specs/${FEATURE_ID}/evidence/verify-candidate.json`;
      // The Verify evidence goes under specs/<feature>/evidence/ (w266 finding 2): the registered course reads candidate evidence only from there.
      const lifecycleVerify = step(log, `${identity.runner}: candidate verify bound to the Critic packet`, process.execPath,
        [script("verify-evidence-producer.mjs"), "--root", fx.root, "--mode", "candidate", "--critic-packet-id", packetId, "--critic-evidence-feature-id", FEATURE_ID, "--out", verifyPath], { cwd: fx.root });
      // The carry-forward from the Critic-reviewed candidate to HEAD held across the evidence, lineage and reconcile commits (w265 finding 4).
      assert.equal(lifecycleVerify.status, 0);
      assert.ok(existsSync(join(fx.root, verifyPath)), `${identity.runner}: the Critic-bound candidate Verify evidence was written`);
      // Package side, nothing committed in between (close-feature skill, Step 2): register the Verify evidence, then drive the package to
      // verifying and completed for exactly HEAD with the sanctioned plan/apply pair.
      step(log, `${identity.runner}: register the candidate Verify evidence`, process.execPath,
        [script("register-feature-package.mjs"), "--root", fx.root, "--add-verify-evidence", verifyPath], { cwd: fx.root });
      for (const nextState of ["verifying", "completed"]) {
        const planned = json(step(log, `${identity.runner}: feature-package-plan ${nextState}`, process.execPath,
          [script("pipeline-state.mjs"), "feature-package-plan", "--root", fx.root, "--manifest", MANIFEST, "--next-state", nextState], { cwd: fx.root }));
        assert.match(String(planned.planSha256), /^[a-f0-9]{64}$/u, JSON.stringify(planned).slice(0, 500));
        step(log, `${identity.runner}: feature-package-apply ${nextState}`, process.execPath,
          [script("pipeline-state.mjs"), "feature-package-apply", "--root", fx.root, "--manifest", MANIFEST, "--next-state", nextState, "--plan-sha256", planned.planSha256], { cwd: fx.root });
      }
      // The Critic/Verify lifecycle receipt the candidate Verify recorded privately (its file name is the lifecycle id), then the audit request.
      const lifecycleDir = join(fx.root, ".git", "agent-pipeline", "critic-verify-lifecycle");
      const lifecycleIds = readdirSync(lifecycleDir).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).map((name) => name.slice(0, -5));
      assert.equal(lifecycleIds.length, 1, `${identity.runner}: exactly one Critic/Verify lifecycle receipt: ${lifecycleIds}`);
      writeJson(join(fx.root, "evidence", "audit-request.json"), { schema: "pipeline.feature-close-audit-request.v1", manifestPath: MANIFEST, coreVersion: "0.7.0",
        packs: ["pipeline-core-baseline"], criticVerifyLifecycleId: lifecycleIds[0] });
      if (criticReturn === "none") {
        // G20-39 bridge, kept (G20-41): a runner stop that issued no Source return record finalizes as caller-authored-fallback and the close gate
        // refuses it at rigor >= 1. The refusal names ONE runnable repair, the PO acknowledgement of exactly this
        // packet and candidate, recorded through the human-approval route (the fixture selects chat); then the IDENTICAL close command is admitted.
        const closeArgs = ["plan-transition", "--root", fx.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "feature-close-prepared", "--audit-request", "evidence/audit-request.json",
          "--critic-verify-lifecycle", lifecycleIds[0], "--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json"];
        const refusedClose = step(log, `${identity.runner}: close without the acknowledgement`, process.execPath, [script("close-coordinator.mjs"), ...closeArgs], { cwd: fx.root, expectedStatus: 2 });
        assert.equal(json(refusedClose).code, "CLOSE-CRITIC-CALLER-AUTHORED", refusedClose.stdout);
        assert.match(refusedClose.stdout, new RegExp(`approve-critic-acknowledgement --by <name> --critic-packet ${packetId}`, "u"));
        const wrongPacket = step(log, `${identity.runner}: acknowledgement of a packet that does not exist`, process.execPath,
          [script("pipeline-state.mjs"), "approve-critic-acknowledgement", "--by", "Fixture PO", "--critic-packet", "2".repeat(32)], { cwd: fx.root, expectedStatus: 2 });
        assert.match(wrongPacket.stderr, /refused/u);
        const stillRefused = step(log, `${identity.runner}: close after an acknowledgement of another packet`, process.execPath, [script("close-coordinator.mjs"), ...closeArgs], { cwd: fx.root, expectedStatus: 2 });
        assert.equal(json(stillRefused).code, "CLOSE-CRITIC-CALLER-AUTHORED");
        const acknowledged = step(log, `${identity.runner}: approve-critic-acknowledgement (the command the refusal named)`, process.execPath,
          [script("pipeline-state.mjs"), "approve-critic-acknowledgement", "--by", "Fixture PO", "--critic-packet", packetId], { cwd: fx.root });
        assert.match(acknowledged.stdout, /acknowledged/u);
      }
      const prepared = transition("feature-close-prepared", ["--audit-request", "evidence/audit-request.json", "--critic-verify-lifecycle", lifecycleIds[0], "--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json"]);
      assert.equal(prepared.phase, "feature-close-prepared");
      // Without a record the acknowledgement walk ends here: the identical close command above was admitted only after it. The rest of the close
      // (identical on every route) is walked by the three issuing identities.
      if (criticReturn === "none") continue;
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

      // 5 push boundary. push-prepare's own remedy (N24): a Critic-bound push Verify is produced with --mode release plus the Critic inputs, as
      // evidence/verify-latest.json. It carries the Critic bound at the reviewed candidate across the close's own commits to the pushed commit
      // (criticCloseCommit admits the close commit; w266 finding 2 is the Verify evidence path that used to break exactly this).
      // G20-42: a local bare repository stands in for origin (no network), so the push really happens and refs/remotes/origin/main exists.
      const bareRemote = join(fx.parent, "origin.git");
      step(log, `${identity.runner}: bare remote`, "git", ["init", "-q", "--bare", "-b", "main", bareRemote]);
      git(log, fx.root, ["remote", "add", "origin", bareRemote]);
      const pushVerify = step(log, `${identity.runner}: push-boundary verify (release mode, Critic-bound)`, process.execPath,
        [script("verify-evidence-producer.mjs"), "--root", fx.root, "--mode", "release", "--critic-packet-id", packetId, "--critic-evidence-feature-id", FEATURE_ID, "--out", "evidence/verify-latest.json"], { cwd: fx.root });
      assert.equal(pushVerify.status, 0);
      const spawned = spawnSync(process.execPath, [script("push-prepare.mjs"), "--root", fx.root, "--by", "Fixture PO", "--remote", "origin", "--destination", "refs/heads/main"],
        { cwd: fx.root, env: walkEnv, encoding: "utf8", timeout: 120_000 });
      const pushPrepared = JSON.parse(spawned.stdout);
      assert.equal(pushPrepared.ready, true, JSON.stringify(pushPrepared.checks.filter((c) => c.ok !== true)).slice(0, 3000));
      // The push guard as the runner's hook runs it (a child process fed the tool call on stdin). The push gate is configured `approval: required`
      // in the fixture manifest, so a push with no recorded approval is blocked; then the approval route push-prepare printed (chat mode: the
      // fixture's pipeline.user.yaml selects chat) records the approval for exactly this commit, and the same push is admitted.
      const guardPush = (command) => spawnSync(process.execPath, [GUARD_PUSH], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
        encoding: "utf8", cwd: fx.root, env: walkEnv, timeout: 60_000 });
      const pushCommand = "git push origin HEAD:refs/heads/main";
      const before = guardPush(pushCommand);
      assert.equal(before.status, 2, `${identity.runner}: the guard blocks the push before any approval is recorded\n${before.stderr}`);
      // G20-42: the consumer release preflight refuses until its prerequisites exist, each refusal naming the one missing step and leaving no record.
      const releaseArgs = [script("release-preflight-cli.mjs"), "--root", fx.root, "--base", base, "--lifecycle", MANIFEST];
      const releasePreflight = () => spawnSync(process.execPath, releaseArgs, { cwd: fx.root, env: walkEnv, encoding: "utf8", timeout: 120_000 });
      const noApproval = releasePreflight();
      assert.equal(noApproval.status, 2, `${identity.runner}: ${noApproval.stdout}${noApproval.stderr}`);
      assert.match(noApproval.stderr, /RPC-CONSUMER-PUSH-APPROVAL.*approve-push/u, `${identity.runner}: ${noApproval.stderr}`);
      assert.equal(existsSync(join(fx.root, "evidence", "release-preflight.json")), false, "a refused preflight leaves no record");
      step(log, `${identity.runner}: approve-push (the line push-prepare printed)`, process.execPath,
        [script("pipeline-state.mjs"), "approve-push", "--by", "Fixture PO", "--remote", "origin", "--destination", "refs/heads/main"], { cwd: fx.root });
      const admitted5 = guardPush(pushCommand);
      assert.equal(admitted5.status, 0, `${identity.runner}: the guard admits the push of the final candidate\n${admitted5.stderr}`);
      const elsewhere = guardPush("git push origin HEAD:refs/heads/other");
      assert.equal(elsewhere.status, 2, `${identity.runner}: the approval is bound to its destination\n${elsewhere.stderr}`);

      // 5b the approved push really happens (the local bare repository is origin), which creates refs/remotes/origin/main: the published channel.
      const unpushed = releasePreflight();
      assert.equal(unpushed.status, 2, `${identity.runner}: ${unpushed.stdout}${unpushed.stderr}`);
      assert.match(unpushed.stderr, /RPC-CONSUMER-NOT-PUSHED.*git push origin HEAD:refs\/heads\/main/u, `${identity.runner}: ${unpushed.stderr}`);
      step(log, `${identity.runner}: the approved push`, "git", ["-C", fx.root, "push", "-q", "origin", "HEAD:refs/heads/main"]);

      // 6 consumer release (G20-42, PO decision 2026-11-07: a release is a version tag). w266 finding 3 measured that the release preflight was the
      // Pipeline's own publication gate and refused a consumer with RPC-INPUT; the consumer mode of the same route is decided from the project's
      // shape (no Pipeline plugin manifests) and is `ready` only for a closed, pushed, approved, Critic-carried, Verify-green candidate.
      const tag = "v0.1.0";
      step(log, `${identity.runner}: annotated version tag`, "git", ["-C", fx.root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "tag", "-a", tag, "-m", "version tag"]);
      const tagPush = `git push origin refs/tags/${tag}`;
      const tagBefore = guardPush(tagPush);
      assert.equal(tagBefore.status, 2, `${identity.runner}: the guard refuses the release tag before the release approval\n${tagBefore.stderr}`);
      assert.match(tagBefore.stderr, /release-preflight-cli\.mjs/u, `${identity.runner}: the refusal names the release command\n${tagBefore.stderr}`);
      const released = releasePreflight();
      assert.equal(released.status, 0, `${identity.runner}: ${released.stdout}${released.stderr}`);
      const releaseResult = JSON.parse(released.stdout);
      assert.equal(releaseResult.status, "ready", released.stdout);
      assert.equal(releaseResult.tag, tag);
      assert.equal(JSON.parse(readFileSync(join(fx.root, "evidence", "release-preflight.json"), "utf8")).candidate.commit, git(log, fx.root, ["rev-parse", "HEAD"]));
      const tagAdmitted = guardPush(tagPush);
      assert.equal(tagAdmitted.status, 0, `${identity.runner}: the guard admits exactly the approved version tag\n${tagAdmitted.stderr}`);
      step(log, `${identity.runner}: another annotated tag`, "git", ["-C", fx.root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "tag", "-a", "v9.9.9", "-m", "version tag"]);
      const otherTag = guardPush("git push origin refs/tags/v9.9.9");
      assert.equal(otherTag.status, 2, `${identity.runner}: any other release tag stays refused\n${otherTag.stderr}`);
      step(log, `${identity.runner}: the version tag push`, "git", ["-C", fx.root, "push", "-q", "origin", `refs/tags/${tag}`]);
      assert.match(git(log, fx.root, ["ls-remote", "--tags", "origin"]), /refs\/tags\/v0\.1\.0\^\{\}/u, `${identity.runner}: the tag reached the remote`);
    } finally {
      rmSync(fx.parent, { recursive: true, force: true, maxRetries: 3 });
    }
  }
});
