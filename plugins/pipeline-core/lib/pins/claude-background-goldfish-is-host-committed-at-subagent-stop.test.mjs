// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.claude-windows-greenfield-lifecycle-not-walkable (AC-127, ALF-PF26B-BACKGROUND-GOLDFISH-COMMIT, D19).
// In a real greenfield consumer project the Claude host launched every Agent-tool Goldfish asynchronously ("Async agent
// launched") while the tool input carried NO run_in_background key. The guard refused that launch as
// NGHS-CLAUDE-FOREGROUND-REQUIRED (the keyless refusal pinned by ALF-G2C2A), so no pending state existed, PostToolUse
// reported NGHF-PENDING-UNAVAILABLE and no host commit or dispatch record could be produced; the orchestrator record route
// refuses authored Claude v4 records by design. D19: with the SubagentStop completion route registered a KEYLESS launch
// takes the SubagentStop route exactly like an explicit true; an explicit false keeps the foreground route; an
// unregistered route keeps today's warning, and the PostToolUse now names the preparation code.
//
// Each case drives the REAL hook scripts as subprocesses with hook-shaped stdin against a consumer-shaped fixture
// repository (a trimmed port of buildConsumer in consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs):
// PreToolUse (hooks/guard-dispatch.mjs), PostToolUse and SubagentStop (hooks/native-goldfish-host.mjs --runner claude).
// The fixture is item-governed: a slice-queue course exists, the binding carries itemDelivery, HEAD is the candidate.
//   (i)   keyless, route registered   : launch -> NGHF awaiting message -> SubagentStop commits once; replay commits nothing
//   (ii)  explicit run_in_background: true, route registered : the same
//   (iii) keyless but the child ran in the foreground (PostToolUse carries a final return) : PostToolUse is silent and
//         non-consuming, SubagentStop still commits exactly once
//   (iv)  keyless, route UNREGISTERED : today's warning, no pending state, PostToolUse names NGHS-CLAUDE-FOREGROUND-REQUIRED
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { readState, run } from "../../scripts/pipeline-state.mjs";
import { compileDecisionSummary } from "../../scripts/architecture-baseline.mjs";
import { runDispatchBriefing } from "../../scripts/dispatch-briefing.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { NEUTRAL_MANIFEST } from "../project-authority.mjs";
import { derivePlanLifecycle } from "../plan-spec-state-v2.mjs";
import * as po from "../po-gate-authority.mjs";
import { enterClaudeHookSessionOwner, leaveClaudeHookSessionOwner } from "../claude-hook-session-owner.mjs";
import { initializeSessionAuthorityRegistry } from "../session-authority-registry.mjs";
import { createSessionAuthorityParticipantPorts } from "../session-authority-observers.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE, NATIVE_GOLDFISH_RETURN_SCHEMA } from "../native-goldfish-host-return.mjs";
import { inspectNativeGoldfishHostObservation, nativeAuthoredRecordBytes } from "../native-goldfish-host-observation.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../worktree-lifecycle.mjs";
import { hardenWindowsPrivateDirectory } from "../windows-private-state.mjs";
import { createWindowsOwnedAuthorityDirectory, createWindowsOwnedAuthorityExclusiveFile } from "../windows-owned-authority-backend.mjs";

const AT = "2026-10-10T10:00:00.000Z";
const FEATURE = "e2e";
const PLAN = "specs/e2e/prd_e2e.md";
const SPEC = "specs/e2e/spec.md";
const COMPANIONS = ["specs/e2e/design.md", "specs/e2e/traceability.md"];
const REPORT = "specs/e2e/review/design-review-1.md";
const RECEIPT = "specs/e2e/review/design-review-receipt-1.json";
const QUEUE = "specs/e2e/slice-queue.json";
const CHECK = "tests/first-item.test.mjs";
const SOURCE = "src/first-item.mjs";
const SESSION = "0f6c2c1e-5b7a-4d1e-9a3b-7c2d1e0f9a8b";
const AGENT_ID = "agent-pf26b";
const STOP_ASSURANCE = "host-observed-subagent-stop-correlation-model-not-observed";
const CLI = fileURLToPath(new URL("../../scripts/register-feature-package.mjs", import.meta.url));
const GUARD = fileURLToPath(new URL("../../hooks/guard-dispatch.mjs", import.meta.url));
const HOST = fileURLToPath(new URL("../../hooks/native-goldfish-host.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = realpathSync(mkdtempSync(join(SCRATCH, "pf26b-subagent-stop-")));
const CEILING_BEFORE = process.env.GIT_CEILING_DIRECTORIES;
// One fixture HOME for this process AND its hook subprocesses: the governance enrollment and the hook-observed session
// descriptor are both resolved from HOME, so the in-process fixture build and the subprocess hooks must agree on it.
const FIXTURE_HOME = join(WORK, "home");
mkdirSync(FIXTURE_HOME);
const HOME_BEFORE = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
process.env.HOME = FIXTURE_HOME;
process.env.USERPROFILE = FIXTURE_HOME;
after(() => {
  for (const [name, value] of Object.entries(HOME_BEFORE)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  leaveClaudeHookSessionOwner();
  if (CEILING_BEFORE === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = CEILING_BEFORE;
  rmSync(WORK, { recursive: true, force: true, maxRetries: 3 });
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const architecture = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };

// One consumer repository per case, reached through the PUBLIC step sequence only. The governance enrollment lives under a
// fixture HOME so the hook SUBPROCESSES (which resolve the default host-state root from HOME) see the same enrollment.
function buildConsumer(name) {
  leaveClaudeHookSessionOwner();
  const parent = join(WORK, name);
  mkdirSync(parent, { recursive: true });
  const root = join(parent, "repo");
  mkdirSync(root);
  const home = FIXTURE_HOME;
  process.env.GIT_CEILING_DIRECTORIES = parent;
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 60000, env });
  const gitOk = (...args) => { const out = git(...args); assert.equal(out.status, 0, `SETUP git ${args[0]}: ${out.stderr}`); return out.stdout.trim(); };
  const write = (path, bytes) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };
  const read = (path) => readFileSync(join(root, path));
  const writeJson = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
  gitOk("init", "-q", "-b", "main");
  gitOk("config", "user.email", "goldfish@example.invalid");
  gitOk("config", "user.name", "Goldfish");
  gitOk("config", "core.autocrlf", "false");
  assert.equal(realpathSync(root), root);
  assert.equal(realpathSync(gitOk("rev-parse", "--show-toplevel")), root, "the fixture is its own repository");
  const lifecycle = (argv) => {
    const logs = [];
    const old = { log: console.log, error: console.error, warn: console.warn };
    for (const key of Object.keys(old)) console[key] = (...args) => { logs.push(args.map(String).join(" ")); };
    let status;
    try { status = run(argv, { dir: root, now: () => AT }); } finally { Object.assign(console, old); }
    assert.equal(status, 0, `SETUP ${argv[0]}: ${logs.join("\n")}`);
  };

  write("README.md", "Synthetic subagent-stop fixture\n");
  // Ignore entries mirror the onboarding seed (PROJECT_IGNORE_SEED in lib/project-onboarding-v3.mjs: /scratch/, /evidence/, /project/pipeline-state.json) plus .claude/pipeline-state.json, so the dispatch-route record under evidence/ is not a new untracked path.
  write(".gitignore", "/scratch/\n/evidence/\n/project/pipeline-state.json\n.claude/pipeline-state.json\n");
  const baseline = { schema: "pipeline.project.v1", project: "subagent-stop-fixture", verify: "node -e \"process.exit(1)\"", autonomy: "gated", handover: "docs/state.md" };
  for (const twin of ["project/pipeline.json", ".claude/pipeline.json"]) writeJson(twin, baseline);
  gitOk("add", "--", "README.md", ".gitignore", "project/pipeline.json", ".claude/pipeline.json");
  gitOk("commit", "-q", "-m", "seed baseline verification");
  const governance = createGovernanceScopeController({ hostStateRoot: join(home, ".local", "state", "agent-pipeline", "activation") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "subagent-stop-fixture" });
  assert.equal(governance.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active", "SETUP real governance decision");
  write("pipeline.user.yaml", "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\ngates:\n  human_approval: chat\n");
  gitOk("add", "--", "pipeline.user.yaml");
  gitOk("commit", "-q", "-m", "selected approval mode");
  write(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  write(NEUTRAL_MANIFEST, read(".claude/pipeline.yaml"));
  for (const target of initialGreenfieldMapTargets("fresh")) write(target.path, target.bytes);
  const pointer = initialGreenfieldAgentEntryTarget("fresh");
  write(pointer.path, pointer.bytes);
  write("docs/adr/.gitkeep", "");
  write(SPEC, "# Synthetic Test Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Synthetic candidate-bound review |\n");
  write(PLAN, `${po.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${sha256(read(SPEC))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(architecture)}\n\`\`\`\n`);
  write(COMPANIONS[0], "# Synthetic Design\n");
  write(COMPANIONS[1], "| ID | Evidence |\n| --- | --- |\n");
  write(REPORT, "# Synthetic method review\nVerdict: pass.\n");
  const common = join(root, ".git");
  const profile = po.createPoGateProfileReceipt({ repositoryFingerprint: po.derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: root }), primaryRoot: root, sourceBytes: read("pipeline.user.yaml"), runtimeBytes: read(".claude/pipeline.yaml"), updatedAt: AT });
  const profilePath = resolve(po.poGateProfileReceiptPath(common));
  if (process.platform === "win32") {
    createWindowsOwnedAuthorityDirectory({ path: join(common, "agent-pipeline") });
    createWindowsOwnedAuthorityDirectory({ path: dirname(profilePath) });
    createWindowsOwnedAuthorityExclusiveFile({ path: profilePath, bytes: Buffer.from(po.serializePoGateProfileReceipt(profile)) });
  } else {
    mkdirSync(dirname(profilePath), { recursive: true, mode: 0o700 });
    writeFileSync(profilePath, po.serializePoGateProfileReceipt(profile), { mode: 0o600 });
  }
  const source = (path) => ({ path, sha256: sha256(read(path)) });
  const review = createDesignReviewReceipt({ featureId: FEATURE, previous: null, sources: { prd: source(PLAN), spec: source(SPEC), companions: COMPANIONS.map(source) }, reviewer: { runner: "claude", model: "claude-opus-4" }, report: source(REPORT), openFindingIds: [], reviewedAt: AT });
  assert.ok(review.ok, `SETUP actual review producer: ${review.code}`);
  write(RECEIPT, Buffer.from(review.bytes));
  const publicKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  writeJson("project/critical-human-proof.json", { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "synthetic-subagent-stop-key", publicKeySha256: sha256(publicKey) }] });
  gitOk("add", "--", PLAN, SPEC, ...COMPANIONS, REPORT, RECEIPT, "project/critical-human-proof.json", "architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md", "docs/adr/.gitkeep", NEUTRAL_MANIFEST);
  gitOk("commit", "-q", "-m", "finished design");
  if (process.platform === "win32") {
    const hardened = hardenWindowsPrivateDirectory(join(root, "project"));
    assert.equal(hardened.status, "secure", `SETUP harden the State parent: ${JSON.stringify(hardened)}`);
  }
  lifecycle(["set-feature", "--id", FEATURE, "--plan-path", PLAN]);
  const continuity = { schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: source(PLAN), spec: source(SPEC), result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeJson("continuity-init-request.json", continuity);
  lifecycle(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "subagent-stop-fixture-token"]);
  lifecycle(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  lifecycle(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  const current = () => { const observed = readState(root); assert.equal(observed.status, "ok"); return observed.state; };
  lifecycle(["approve-plan", "--by", "synthetic-po", "--design-approval-request", current().planPresentation.designApprovalRequestPath]);
  lifecycle(["materialize-architecture"]);
  assert.equal(compileDecisionSummary(root, { now: AT }).authorityStatus, "source-validated");
  lifecycle(["set-phase", "--phase", "implementation"]);
  assert.equal(derivePlanLifecycle(current()).status, "implementing");
  // `materialize-architecture` rewrites the tracked map index and creates the architecture baseline outputs. A real session
  // commits that materialization before it dispatches an item: the host-commit baseline refuses a launch while any TRACKED
  // path differs from HEAD (AGY-HOST-BASELINE-DIRTY, surfaced by the guard as SDC-AUTHORITY-UNAVAILABLE), so the fixture
  // commits it the same way instead of leaving the tree dirty.
  gitOk("add", "--", "architecture/map/index.md", "architecture/baseline.json", "architecture/design-materialization.json", "architecture/fitness-model.json", "architecture/map/overview.html", "architecture/map/unit.md", "project/architecture-decisions.compiled.json");
  gitOk("commit", "-q", "-m", "materialize the approved architecture");
  assert.equal(gitOk("diff", "--no-renames", "--name-only", "HEAD"), "", "SETUP no tracked path differs from HEAD before the item launch");
  const repository = inspectSignedDescriptorCustodyRepository(root);
  initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository }));
  assert.equal(enterClaudeHookSessionOwner({ root, input: { session_id: SESSION } }), true, "SETUP requester binding");
  const fx = { name, parent, root, home, env, git, gitOk, write, read, stopDir: join(parent, "stop") };

  // Register the package, commit it, scaffold the first item (source + host-run check), and take the binding at that HEAD.
  const registered = spawnSync(process.execPath, [CLI, "--root", root], { cwd: root, encoding: "utf8", timeout: 50000, env });
  assert.equal(registered.status, 0, `SETUP register: ${registered.stdout}${registered.stderr}`);
  const json = JSON.parse(registered.stdout.trim().split(/\r?\n/u).at(-1));
  gitOk(...(json.envelopeIgnored && !json.envelopeTracked ? ["add", "-f", "--", json.envelopePath] : ["add", "--", json.envelopePath]));
  gitOk("add", "--", ...json.commitPaths.filter((path) => path !== json.envelopePath));
  gitOk("commit", "-q", "-m", "register the feature package");
  write(SOURCE, "export const value = () => 1;\n");
  write(CHECK, "import assert from \"node:assert/strict\";\nimport test from \"node:test\";\nimport { value } from \"../src/first-item.mjs\";\n\ntest(\"scaffold\", () => { assert.equal(value(), 1); });\n");
  gitOk("add", "--", SOURCE, CHECK);
  gitOk("commit", "-q", "-m", "scaffold the first item check");
  const dispatchId = `PF26B-${name.toUpperCase()}`;
  const out = runDispatchBriefing(["binding", "--root", root, "--dispatch-id", dispatchId, "--item", "first-item", "--criterion", "AC-1",
    "--agent-type", "goldfish-deep", "--model-id", "claude-sonnet-5-5", "--spec", SPEC, "--check", CHECK, "--path", SOURCE],
  { observePreflight: () => ({ rulesetSource: { loadedIdentity: { status: "available", value: "a".repeat(64) }, selectedPlugin: { version: "pin" } }, pluginRoot: null }) });
  assert.equal(out.ok, true, JSON.stringify(out));
  const binding = out.binding;
  assert.equal(binding.candidateCommit, gitOk("rev-parse", "HEAD"), "the binding candidate is the fixture HEAD");
  leaveClaudeHookSessionOwner();
  return { ...fx, binding, dispatchId, sliceId: binding.itemDelivery.sliceId, candidate: binding.candidateCommit, prompt: markedPrompt(binding) };
}

// The filled goldfish-task template carries the host directive once; the Slice and Write scope lines name the item course.
function markedPrompt(binding) {
  const raw = readFileSync(join(REPO_ROOT, "templates/prompts/goldfish-task.md"), "utf8");
  const marker = "COPY EVERYTHING BELOW THIS LINE\n-->";
  const at = raw.indexOf(marker);
  assert.ok(at >= 0, "goldfish-task.md copy marker not found");
  const body = raw.slice(at + marker.length)
    .replace(/\{\{MODEL_ID\}\}/g, binding.model).replace(/\{\{EFFORT\}\}/g, binding.effort)
    .replace(/\{\{MODEL_EFFORT[^{}]*\}\}/g, `${binding.model} / ${binding.effort}`)
    .replace(/\{\{TOOL_BUDGET[^{}]*\}\}/g, "≤24 tool uses").replace(/\{\{[^{}]*\}\}/g, "FILLED");
  const version = /\.v(\d)$/u.exec(binding.schema)[1];
  return [`<!-- pipeline-native-goldfish-host-commit:v${version}\n${JSON.stringify(binding)}\n-->`,
    body.includes(NATIVE_GOLDFISH_HOST_DIRECTIVE) ? body : `${NATIVE_GOLDFISH_HOST_DIRECTIVE}\n${body}`,
    `Slice: ${binding.itemDelivery.sliceId}`, `Write scope: ${binding.allowedPaths.join(", ")}`, ""].join("\n");
}

// The guard resolves the SubagentStop registration from the hooks.json that sits beside the running module: the real
// guard reads the shipped hooks.json (registered); the unregistered case runs a copy beside a hooks.json with no entry.
function unregisteredGuard() {
  const dir = realpathSync(mkdtempSync(join(WORK, "guard-copy-")));
  mkdirSync(join(dir, "hooks"));
  copyFileSync(GUARD, join(dir, "hooks", "guard-dispatch.mjs"));
  symlinkSync(join(dirname(GUARD), "guard-dispatch-budget.mjs"), join(dir, "hooks", "guard-dispatch-budget.mjs"));
  symlinkSync(join(dirname(GUARD), "..", "lib"), join(dir, "lib"));
  writeFileSync(join(dir, "hooks", "hooks.json"), "{}");
  return join(dir, "hooks", "guard-dispatch.mjs");
}

function hook(fx, script, args, payload) {
  const out = spawnSync(process.execPath, [script, ...args], { input: JSON.stringify(payload), encoding: "utf8", timeout: 50000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fx.root, GIT_CEILING_DIRECTORIES: fx.parent, HOME: fx.home, USERPROFILE: fx.home } });
  return { status: out.status, stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}
const toolInput = (fx, extra) => ({ subagent_type: fx.binding.role, prompt: fx.prompt, ...extra });
const call = (fx, event, toolUseId, extra, more = {}) => ({ hook_event_name: event, cwd: fx.root, session_id: SESSION, tool_name: "Agent",
  tool_use_id: toolUseId, tool_input: toolInput(fx, extra), ...more });
const preToolUse = (fx, toolUseId, extra, guard = GUARD) => hook(fx, guard, [], call(fx, "PreToolUse", toolUseId, extra));
const postToolUse = (fx, toolUseId, extra, tool_response) => hook(fx, HOST, ["--runner", "claude"], call(fx, "PostToolUse", toolUseId, extra, { tool_response }));
const context = (result) => JSON.parse(result.stdout.trim()).hookSpecificOutput.additionalContext;
const stateDirectory = (fx) => join(fx.root, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
const pendingFiles = (fx) => existsSync(stateDirectory(fx)) ? readdirSync(stateDirectory(fx)).filter((name) => name.startsWith("pending-")) : [];
const finalText = (fx) => JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: fx.dispatchId, candidateCommit: fx.candidate,
  outcome: "succeeded", report: "Implemented the first item; independent review and acceptance remain pending.", changedPaths: [SOURCE] });
// What the child did before it stopped: an in-scope edit that keeps the item's host-run check passing, left uncommitted.
const childWork = (fx) => fx.write(SOURCE, "export const value = () => 1;\nexport const label = () => \"first-item\";\n");
function stopHook(fx, toolUseId) {
  mkdirSync(join(fx.stopDir, "session", "subagents"), { recursive: true });
  writeFileSync(join(fx.stopDir, "session", "subagents", `agent-${AGENT_ID}.meta.json`), JSON.stringify({ spawnDepth: 1, agentType: "goldfish-deep", toolUseId }));
  return hook(fx, HOST, ["--runner", "claude"], { hook_event_name: "SubagentStop", session_id: SESSION,
    transcript_path: join(fx.stopDir, "session.jsonl"), cwd: fx.root, agent_id: AGENT_ID, agent_type: fx.binding.role, last_assistant_message: finalText(fx) });
}
const hostCommits = (fx) => fx.gitOk("log", "--fixed-strings", `--grep=Dispatch: ${fx.dispatchId} (goldfish)`, "--format=%H", `${fx.candidate}..HEAD`).split("\n").filter(Boolean);

// The delivery outcome of an item-governed host commit (publishNativeDispatchChecks in native-goldfish-host-finalizer.mjs),
// returned so the foreground parity case can compare it with the SubagentStop route.
function assertDeliveryPublished(fx, commit, record) {
  const target = `evidence/dispatch-checks-${fx.dispatchId}.json`;
  assert.ok(existsSync(join(fx.root, target)), "the item-governed host commit published its dispatch-checks file");
  const checks = JSON.parse(fx.read(target));
  assert.equal(checks.schema, "pipeline.native-goldfish-dispatch-checks.v1");
  assert.equal(checks.dispatchId, fx.dispatchId);
  assert.equal(checks.commit, commit, "the checks file binds this dispatch's host commit");
  assert.equal(checks.recordTarget, `evidence/dispatch-record-${fx.dispatchId}.json`);
  assert.equal(checks.recordSha256, sha256(nativeAuthoredRecordBytes(record)), "the checks file binds the published record bytes");
  assert.match(checks.pendingSha256, /^[a-f0-9]{64}$/u);
  assert.ok(checks.checkStatus && typeof checks.checkStatus.status === "string", "the item check outcome is recorded");
  const association = readdirSync(join(fx.root, "evidence")).filter((name) => name.includes(fx.dispatchId));
  assert.ok(association.length >= 2, `record and checks are both published: ${association.join(",")}`);
  return { checkStatus: checks.checkStatus, schema: checks.schema };
}

// The part every route-registered case shares: the SubagentStop commit, its record, the slice, and the replay.
function assertCommittedOnceAtStop(fx, toolUseId) {
  const head = fx.gitOk("rev-parse", "HEAD");
  assert.equal(head, fx.candidate, "nothing was committed before the child stopped");
  const stopped = stopHook(fx, toolUseId);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(stopped.stderr, /Goldfish host commit verified: [a-f0-9]{40}/u, `the stop did not report a verified host commit -- ${stopped.stderr.slice(0, 400)}`);
  const commits = hostCommits(fx);
  assert.equal(commits.length, 1, "exactly one host commit carries the Dispatch trailer");
  assert.equal(fx.gitOk("rev-list", "--count", `${fx.candidate}..${commits[0]}`), "1", "the host commit sits directly on the candidate");
  assert.ok(fx.gitOk("show", "--format=%B", "--no-patch", commits[0]).includes(`Dispatch: ${fx.dispatchId} (goldfish)`));
  const record = JSON.parse(fx.read(`evidence/dispatch-record-${fx.dispatchId}.json`));
  assert.equal(record.schema, "pipeline.dispatch-record.v4");
  assert.equal(record.runner, "claude");
  assert.equal(record.candidateCommit, commits[0]);
  const observed = inspectNativeGoldfishHostObservation({ root: fx.root, taskId: fx.dispatchId, record, recordBytes: nativeAuthoredRecordBytes(record) });
  assert.equal(observed.ok, true, JSON.stringify(observed));
  assert.equal(observed.assurance, STOP_ASSURANCE);
  const slice = JSON.parse(fx.read(QUEUE)).slices.find((row) => row.id === fx.sliceId);
  assert.ok(slice, "the item slice is still in the course");
  // E11: the slice queue is NOT expected to leave `ready` at the stop. What an item-governed host commit publishes is the
  // delivery outcome beside the record: the checks file binds this dispatch, this commit and the published record bytes.
  const delivered = assertDeliveryPublished(fx, commits[0], record);
  const replay = stopHook(fx, toolUseId);
  assert.equal(replay.status, 0, replay.stderr);
  assert.doesNotMatch(replay.stderr, /host commit verified/u);
  assert.equal(hostCommits(fx).length, 1, "a replayed SubagentStop commits nothing");
  assert.equal(fx.gitOk("rev-parse", "HEAD"), fx.gitOk("rev-parse", commits[0]), "HEAD stays on the one host commit");
  return delivered;
}

function launchedPending(fx, toolUseId, extra) {
  const pre = preToolUse(fx, toolUseId, extra);
  assert.equal(pre.status, 0, `PreToolUse must admit the launch -- ${pre.stderr.slice(0, 600)}`);
  assert.doesNotMatch(pre.stderr, /WARNING|BLOCKED/u, `no warning or block expected -- ${pre.stderr.slice(0, 600)}`);
  const files = pendingFiles(fx);
  assert.equal(files.length, 1, "the launch wrote exactly one pending state");
  const pending = JSON.parse(readFileSync(join(stateDirectory(fx), files[0]), "utf8"));
  assert.equal(pending.completionRoute, "subagent-stop", "the pending state is completed only at SubagentStop");
  assert.equal(pending.delivery.sliceId, fx.sliceId, "the pending state is the item-governed course");
  assert.equal(pending.toolUseId, toolUseId);
}

test("(i) a launch with NO run_in_background key takes the SubagentStop route and is host-committed exactly once at the stop (RED on the keyless refusal)", () => {
  const fx = buildConsumer("keyless");
  const extra = {};
  launchedPending(fx, "toolu_pf26b_keyless", extra);
  const posted = postToolUse(fx, "toolu_pf26b_keyless", extra, { status: "async_launched", agentId: AGENT_ID });
  assert.equal(posted.status, 0, posted.stderr);
  assert.match(context(posted), new RegExp(`Goldfish background launch observed \\(${fx.dispatchId}\\)`, "u"), posted.stdout);
  assert.match(context(posted), /No commit or authorship record is claimed until then/u);
  assert.equal(fx.gitOk("rev-parse", "HEAD"), fx.candidate, "the async launch acknowledgement commits nothing");
  childWork(fx);
  assertCommittedOnceAtStop(fx, "toolu_pf26b_keyless");
});

test("(ii) an explicit run_in_background: true takes the same route in the item-governed course shape of this repository", () => {
  const fx = buildConsumer("explicit-true");
  const extra = { run_in_background: true };
  launchedPending(fx, "toolu_pf26b_true", extra);
  const posted = postToolUse(fx, "toolu_pf26b_true", extra, { status: "async_launched", agentId: AGENT_ID });
  assert.equal(posted.status, 0, posted.stderr);
  assert.match(context(posted), new RegExp(`Goldfish background launch observed \\(${fx.dispatchId}\\)`, "u"), posted.stdout);
  childWork(fx);
  assertCommittedOnceAtStop(fx, "toolu_pf26b_true");
});

test("(iii) a keyless launch whose child happened to run in the foreground is still committed exactly once, at the stop", () => {
  const fx = buildConsumer("foreground");
  const extra = {};
  launchedPending(fx, "toolu_pf26b_foreground", extra);
  childWork(fx);
  // The foreground PostToolUse carries the child's final return: a subagent-stop state answers it silently and consumes nothing.
  const posted = postToolUse(fx, "toolu_pf26b_foreground", extra, { status: "completed", resolvedModel: fx.binding.model,
    modelsUsed: [fx.binding.model], content: [{ type: "text", text: finalText(fx) }] });
  assert.equal(posted.status, 0, posted.stderr);
  assert.equal(posted.stdout.trim(), "", "NGHF-SUBAGENT-STOP-ROUTE-ONLY is silent");
  assert.equal(hostCommits(fx).length, 0, "the foreground PostToolUse committed nothing");
  assert.equal(fx.gitOk("rev-parse", "HEAD"), fx.candidate);
  assert.equal(pendingFiles(fx).length, 1, "the foreground PostToolUse consumed nothing");
  assertCommittedOnceAtStop(fx, "toolu_pf26b_foreground");
});

test("(v) parity: an explicit run_in_background: false (foreground route) publishes the same delivery outcome as the SubagentStop route", () => {
  const stopFx = buildConsumer("parity-stop");
  launchedPending(stopFx, "toolu_pf26e_stop", {});
  childWork(stopFx);
  const viaStop = assertCommittedOnceAtStop(stopFx, "toolu_pf26e_stop");

  const fx = buildConsumer("parity-foreground");
  const extra = { run_in_background: false };
  const pre = preToolUse(fx, "toolu_pf26e_fg", extra);
  assert.equal(pre.status, 0, `PreToolUse must admit the foreground launch -- ${pre.stderr.slice(0, 600)}`);
  childWork(fx);
  const posted = postToolUse(fx, "toolu_pf26e_fg", extra, { status: "completed", resolvedModel: fx.binding.model,
    modelsUsed: [fx.binding.model], content: [{ type: "text", text: finalText(fx) }] });
  assert.equal(posted.status, 0, posted.stderr);
  const commits = hostCommits(fx);
  assert.equal(commits.length, 1, `the foreground PostToolUse host-committed once -- ${posted.stderr.slice(0, 400)}${posted.stdout.slice(0, 400)}`);
  const record = JSON.parse(fx.read(`evidence/dispatch-record-${fx.dispatchId}.json`));
  assert.equal(record.candidateCommit, commits[0]);
  const viaForeground = assertDeliveryPublished(fx, commits[0], record);
  assert.deepEqual(viaForeground, viaStop, "both routes publish the same delivery outcome for the same fixture");
});

test("(iv) a keyless launch with the SubagentStop route unregistered keeps today's warning, writes no state, and PostToolUse names the preparation code", () => {
  const fx = buildConsumer("unregistered");
  const extra = {};
  const pre = preToolUse(fx, "toolu_pf26b_unregistered", extra, unregisteredGuard());
  assert.equal(pre.status, 0, `the keyless fallback must continue -- ${pre.stderr.slice(0, 600)}`);
  assert.ok(pre.stderr.includes("WARNING (guard-dispatch): native host-commit preparation failed (NGHS-CLAUDE-FOREGROUND-REQUIRED); dispatch continues, the child must leave changes uncommitted, and no authorship record will be claimed."), pre.stderr.slice(0, 600));
  assert.deepEqual(pendingFiles(fx), [], "an unregistered route writes no pending state");
  const posted = postToolUse(fx, "toolu_pf26b_unregistered", extra, { status: "async_launched", agentId: AGENT_ID });
  assert.equal(posted.status, 0, posted.stderr);
  assert.match(context(posted), /NGHF-PENDING-UNAVAILABLE/u, posted.stdout);
  assert.match(context(posted), /pre-launch preparation failed with NGHS-CLAUDE-FOREGROUND-REQUIRED/u, "the PostToolUse message names the preparation code");
  childWork(fx);
  const stopped = stopHook(fx, "toolu_pf26b_unregistered");
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.doesNotMatch(stopped.stderr, /host commit verified/u, "no pending state, so no host commit");
  assert.equal(hostCommits(fx).length, 0);
  assert.equal(fx.gitOk("rev-parse", "HEAD"), fx.candidate);
});
