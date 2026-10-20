// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.claude-windows-greenfield-lifecycle-not-walkable (AC-127, ALF-PF25-FEATURE-PACKAGE-REGISTRATION and
// ALF-PF25B-CONSUMER-SHAPED-REGISTRATION). A consumer project whose plan was approved by the real `approve-plan`
// (plan approval v9, accepted delivery contract envelope) must reach its first item-governed dispatch and that
// dispatch's host-run check using only shipped commands. Before this change `readAcceptedDeliveryContract` resolved
// the envelope through a `specs/<feature>/lifecycle.json` manifest that no production code created, so the first item
// course was refused CAC-REGISTRATION-INVALID. The existing fixtures hand-wrote that manifest, which is why no test
// ever saw it. The first version of this pin then hid a second blocker the same way: it authored `acceptance.md` and
// `result.md` before approval, but the design course writes neither and no shipped command creates them for a consumer.
//
// Two fixtures reach the approved-implementation State through the PUBLIC step sequence only (set-feature,
// continuity-init, submit-plan --profile feature, present-plan --review-receipt, approve-plan
// --design-approval-request, materialize-architecture, set-phase implementation); each is a trimmed port of
// configure-verify-output-lacks-a-walkable-commit-route.test.mjs `fixture`. Approval mode is `chat`.
//   consumer : `specs/e2e/` holds only what the design course and the real CLI chain write (PRD, Spec, companions,
//              review receipt, envelope). No acceptance.md, no result.md, no lifecycle.json.
//   authored : the same, but acceptance.md and result.md were authored before approval (acceptance.md is also one of
//              the approval's bound companions; result.md is not).
// The lifecycle manifest is NEVER hand-written here: it is produced by scripts/register-feature-package.mjs.
//   (a) RED on the old code: prepareGovernedItemQueue, with a real itemDelivery, is refused CAC-REGISTRATION-INVALID.
//   (b) consumer: the CLI registers and creates both missing files; the commit holds them; the binding is regenerated;
//       a prepared course exists.
//   (c) authored: the CLI registers the existing files as found (bytes unchanged, authority only where the approval
//       binds the file) and generates nothing.
//   (d) the host-run check of a candidate commit holding a trivial node:test scaffold passes.
//   (e) a second run is `already-registered` and byte-stable.
//   (f) the generated files' content names the Spec path and digest and nothing else from outside the package.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { readState, run } from "../../scripts/pipeline-state.mjs";
import { compileDecisionSummary } from "../../scripts/architecture-baseline.mjs";
import { runDispatchBriefing } from "../../scripts/dispatch-briefing.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { readCriticReviewUnit } from "../critic-generic-batch.mjs";
import { renderAcceptancePointer, renderResultRecord } from "../feature-package-registration.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { NEUTRAL_MANIFEST } from "../project-authority.mjs";
import { derivePlanLifecycle } from "../plan-spec-state-v2.mjs";
import * as po from "../po-gate-authority.mjs";
import { enterClaudeHookSessionOwner, leaveClaudeHookSessionOwner } from "../claude-hook-session-owner.mjs";
import { initializeSessionAuthorityRegistry } from "../session-authority-registry.mjs";
import { createSessionAuthorityParticipantPorts } from "../session-authority-observers.mjs";
import { executeGovernedItemDeliveryChecks, prepareGovernedItemQueue } from "../native-goldfish-host-state.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../worktree-lifecycle.mjs";
import { hardenWindowsPrivateDirectory } from "../windows-private-state.mjs";
import { createWindowsOwnedAuthorityDirectory, createWindowsOwnedAuthorityExclusiveFile } from "../windows-owned-authority-backend.mjs";

const AT = "2026-10-10T10:00:00.000Z";
const FEATURE = "e2e";
const PLAN = "specs/e2e/prd_e2e.md";
const SPEC = "specs/e2e/spec.md";
const ACCEPTANCE = "specs/e2e/acceptance.md";
const RESULT = "specs/e2e/result.md";
const MANIFEST = "specs/e2e/lifecycle.json";
const REVIEW_UNIT = "specs/e2e/design/critic-review-unit.json";
const COMPANIONS = ["specs/e2e/design.md", "specs/e2e/traceability.md"];
const REPORT = "specs/e2e/review/design-review-1.md";
const RECEIPT = "specs/e2e/review/design-review-receipt-1.json";
const CHECK = "tests/first-item.test.mjs";
const SOURCE = "src/first-item.mjs";
const SESSION = "0f6c2c1e-5b7a-4d1e-9a3b-7c2d1e0f9a8b";
const AUTHORED_ACCEPTANCE = "# Authored acceptance\n\nAC-1 is the only criterion.\n";
const AUTHORED_RESULT = "# Authored result\n\nNothing implemented yet.\n";
const CLI = fileURLToPath(new URL("../../scripts/register-feature-package.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = realpathSync(mkdtempSync(join(SCRATCH, "fpr-first-item-")));
const CEILING_BEFORE = process.env.GIT_CEILING_DIRECTORIES;
after(() => {
  leaveClaudeHookSessionOwner();
  if (CEILING_BEFORE === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = CEILING_BEFORE;
  rmSync(WORK, { recursive: true, force: true, maxRetries: 3 });
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const architecture = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };

// One consumer repository per variant; `authored` pre-writes acceptance.md and result.md, `session` binds the Claude
// hook requester that governed admission needs (only the consumer variant runs governed admission).
function buildConsumer({ name, authored, session }) {
  const parent = join(WORK, name);
  mkdirSync(parent, { recursive: true });
  const root = join(parent, "repo");
  mkdirSync(root);
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
    for (const name of Object.keys(old)) console[name] = (...args) => { logs.push(args.map(String).join(" ")); };
    let status;
    try { status = run(argv, { dir: root, now: () => AT }); } finally { Object.assign(console, old); }
    assert.equal(status, 0, `SETUP ${argv[0]}: ${logs.join("\n")}`);
  };

  write("README.md", "Synthetic first-item fixture\n");
  write(".gitignore", "scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  const baseline = { schema: "pipeline.project.v1", project: "first-item-fixture", verify: "node -e \"process.exit(1)\"", autonomy: "gated", handover: "docs/state.md" };
  for (const twin of ["project/pipeline.json", ".claude/pipeline.json"]) writeJson(twin, baseline);
  gitOk("add", "--", "README.md", ".gitignore", "project/pipeline.json", ".claude/pipeline.json");
  gitOk("commit", "-q", "-m", "seed baseline verification");
  const governance = createGovernanceScopeController({ hostStateRoot: join(parent, "host-state") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "first-item-fixture" });
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
  // What the design course writes: the Spec, the PRD, the companions, the review report and receipt. A consumer has no
  // acceptance.md and no result.md at this point; only the `authored` variant pre-writes them.
  const companions = authored ? [...COMPANIONS, ACCEPTANCE] : COMPANIONS;
  if (authored) { write(ACCEPTANCE, AUTHORED_ACCEPTANCE); write(RESULT, AUTHORED_RESULT); }
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
  const review = createDesignReviewReceipt({ featureId: FEATURE, previous: null, sources: { prd: source(PLAN), spec: source(SPEC), companions: companions.map(source) }, reviewer: { runner: "claude", model: "claude-opus-4" }, report: source(REPORT), openFindingIds: [], reviewedAt: AT });
  assert.ok(review.ok, `SETUP actual review producer: ${review.code}`);
  write(RECEIPT, Buffer.from(review.bytes));
  const publicKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  writeJson("project/critical-human-proof.json", { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "synthetic-first-item-key", publicKeySha256: sha256(publicKey) }] });
  gitOk("add", "--", PLAN, SPEC, ...companions, ...(authored ? [RESULT] : []), REPORT, RECEIPT, "project/critical-human-proof.json", "architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md", "docs/adr/.gitkeep", NEUTRAL_MANIFEST);
  gitOk("commit", "-q", "-m", "finished design");
  if (process.platform === "win32") {
    const hardened = hardenWindowsPrivateDirectory(join(root, "project"));
    assert.equal(hardened.status, "secure", `SETUP harden the State parent: ${JSON.stringify(hardened)}`);
  }
  // The public lifecycle route, in order; each step is the real CLI verb. No lifecycle.json is written here.
  lifecycle(["set-feature", "--id", FEATURE, "--plan-path", PLAN]);
  const continuity = { schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: source(PLAN), spec: source(SPEC), result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeJson("continuity-init-request.json", continuity);
  lifecycle(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "first-item-fixture-token"]);
  lifecycle(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  lifecycle(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  const current = () => { const observed = readState(root); assert.equal(observed.status, "ok"); return observed.state; };
  lifecycle(["approve-plan", "--by", "synthetic-po", "--design-approval-request", current().planPresentation.designApprovalRequestPath]);
  assert.equal(current().planApproval.schema, "pipeline.plan-approval.v9");
  lifecycle(["materialize-architecture"]);
  assert.equal(compileDecisionSummary(root, { now: AT }).authorityStatus, "source-validated");
  lifecycle(["set-phase", "--phase", "implementation"]);
  assert.equal(derivePlanLifecycle(current()).status, "implementing");
  assert.equal(existsSync(join(root, MANIFEST)), false, "nothing but the real chain ran: no manifest exists yet");
  assert.equal(existsSync(join(root, ACCEPTANCE)), authored, authored ? "the authored variant pre-wrote acceptance.md" : "a consumer has no acceptance.md before registration");
  assert.equal(existsSync(join(root, RESULT)), authored, authored ? "the authored variant pre-wrote result.md" : "a consumer has no result.md before registration");

  if (session) {
    // The Claude hook-observed requester that governed admission requires (as in the native host-state tests).
    const repository = inspectSignedDescriptorCustodyRepository(root);
    initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository }));
    assert.equal(enterClaudeHookSessionOwner({ root, input: { session_id: SESSION } }), true, "SETUP requester binding");
  }
  return { root, env, git, gitOk, write, read, current, candidate: () => inspectSignedDescriptorCustodyRepository(root).candidate };
}

// The authored variant is always built BEFORE the consumer variant: building it never touches the process-wide hook
// session owner, and the consumer variant enters that owner last.
const fixtures = {};
const authoredConsumer = () => (fixtures.authored ??= buildConsumer({ name: "authored", authored: true, session: false }));
const consumer = () => (fixtures.consumer ??= (authoredConsumer(), buildConsumer({ name: "consumer", authored: false, session: true })));
const state = {};

function binding(fx) {
  const out = runDispatchBriefing(["binding", "--root", fx.root, "--dispatch-id", "PIN-FIRST-ITEM", "--item", "first-item", "--criterion", "AC-1",
    "--agent-type", "goldfish-deep", "--model-id", "claude-sonnet-5-5", "--spec", SPEC, "--check", CHECK, "--path", SOURCE],
  { observePreflight: () => ({ rulesetSource: { loadedIdentity: { status: "available", value: "a".repeat(64) }, selectedPlugin: { version: "pin" } }, pluginRoot: null }) });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.binding;
}
function register(fx, ...extra) {
  const out = spawnSync(process.execPath, [CLI, "--root", fx.root, ...extra], { cwd: fx.root, encoding: "utf8", timeout: 50000, env: fx.env });
  let json = null;
  try { json = JSON.parse(out.stdout.trim().split(/\r?\n/u).at(-1)); } catch { /* reported below */ }
  return { status: out.status, json, stderr: out.stderr, stdout: out.stdout };
}

test("(a) before registration the first item course is refused CAC-REGISTRATION-INVALID (RED on the old code)", () => {
  const fx = consumer();
  const before = binding(fx);
  state.firstBinding = before;
  const refused = prepareGovernedItemQueue({ root: fx.root, itemDelivery: before.itemDelivery, candidate: fx.candidate(), writeScope: [SOURCE] });
  assert.equal(refused.status, "refused", JSON.stringify(refused));
  assert.equal(refused.code, "CAC-REGISTRATION-INVALID", JSON.stringify(refused));
  assert.equal(existsSync(join(fx.root, "specs/e2e/slice-queue.json")), false, "a refused admission publishes no course");
});

test("(b) consumer-shaped: the CLI registers and creates both missing files; after the commit a regenerated binding prepares the course", () => {
  const fx = consumer();
  const result = register(fx);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.equal(result.json.status, "registered", result.stdout);
  assert.equal(result.json.manifestPath, MANIFEST);
  assert.equal(result.json.rigorSource, "profile-mapping", "the CLI names the source of the rigor level");
  assert.ok([1, 2].includes(result.json.rigor), result.stdout);
  assert.deepEqual(result.json.generated.map((entry) => entry.path), [ACCEPTANCE, RESULT, REVIEW_UNIT], "both missing files and the Critic review unit (PF-34) were generated");
  assert.deepEqual(result.json.found, [], "nothing was found: a consumer authors neither file");
  assert.deepEqual(result.json.commitPaths, [MANIFEST, result.json.envelopePath, ACCEPTANCE, RESULT, REVIEW_UNIT], "every generated file is in commitPaths");
  assert.deepEqual(result.json.reviewUnit, { status: "generated", path: REVIEW_UNIT });
  assert.deepEqual(result.json.order.map((step) => step.step), [1, 2, 3, 4], "the printed order ends with the binding, after the commit");
  state.manifestBytes = fx.read(MANIFEST);
  const manifest = JSON.parse(state.manifestBytes);
  assert.equal(manifest.state, "implementing");
  assert.equal(manifest.feature.id, FEATURE);
  assert.equal(manifest.feature.rigor, result.json.rigor);
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.class), ["prd", "spec", "acceptance", "result", "design", "candidate-evidence"]);
  for (const path of [ACCEPTANCE, RESULT]) {
    const generated = manifest.artifacts.find((artifact) => artifact.path === path);
    assert.deepEqual([generated.authority, generated.mutability, generated.retention, generated.sha256], [false, "immutable", "active", sha256(fx.read(path))], `${path} is Pipeline-owned and non-authoritative`);
  }
  // PF-34: exactly the entry Critic course admission requires (featureReviewUnit), one course for the whole feature.
  const unitEntry = manifest.artifacts.find((artifact) => artifact.path === REVIEW_UNIT);
  assert.deepEqual([unitEntry.authority, unitEntry.mutability, unitEntry.retention, unitEntry.sha256], [false, "immutable", "retain", sha256(fx.read(REVIEW_UNIT))]);
  const unit = JSON.parse(fx.read(REVIEW_UNIT));
  assert.deepEqual([unit.schema, unit.kind, unit.specPath, unit.logicalWorkIds, unit.deliveryBoundary.mainRef.startsWith("refs/heads/")],
    ["pipeline.critic-review-unit.v1", "independent-delivery", SPEC, [FEATURE], true]);
  assert.ok(unit.criterionIds.length > 0 && unit.criterionIds.every((id) => fx.read(SPEC).toString("utf8").includes(id)), JSON.stringify(unit.criterionIds));
  state.generated = { acceptance: fx.read(ACCEPTANCE), result: fx.read(RESULT) };
  const envelope = manifest.artifacts.at(-1);
  assert.deepEqual([envelope.authority, envelope.mutability, envelope.retention, envelope.sha256], [false, "immutable", "retain", sha256(fx.read(envelope.path))]);
  // Commit order: the manifest and the generated files (with an untracked envelope) FIRST, the binding afterwards.
  fx.gitOk(...(result.json.envelopeIgnored && !result.json.envelopeTracked ? ["add", "-f", "--", result.json.envelopePath] : ["add", "--", result.json.envelopePath]));
  fx.gitOk("add", "--", ...result.json.commitPaths.filter((path) => path !== result.json.envelopePath));
  fx.gitOk("commit", "-q", "-m", "register the feature package");
  assert.equal(fx.gitOk("status", "--porcelain", "--untracked-files=all", "--", MANIFEST, ACCEPTANCE, RESULT, REVIEW_UNIT), "", "the printed commitPaths left none of the registered package files uncommitted");
  const head = fx.gitOk("rev-parse", "HEAD");
  // PF-34: the committed unit reads back through the Critic's own review-unit reader, from the registration commit on.
  const observedUnit = readCriticReviewUnit({ repoRoot: fx.root, baseCommit: head, candidateCommit: head, specPath: SPEC, logicalWorkIds: [FEATURE], reviewUnitPath: REVIEW_UNIT });
  assert.equal(observedUnit.reference.sha256, sha256(fx.read(REVIEW_UNIT)), JSON.stringify(observedUnit.reference));
  const regenerated = binding(fx);
  assert.equal(regenerated.candidateCommit, head, "the regenerated binding carries the registration commit as candidate");
  assert.notEqual(regenerated.candidateCommit, state.firstBinding.candidateCommit, "the pre-registration binding carried a stale candidate");
  const prepared = prepareGovernedItemQueue({ root: fx.root, itemDelivery: regenerated.itemDelivery, candidate: fx.candidate(), writeScope: [SOURCE] });
  assert.notEqual(prepared.status, "refused", JSON.stringify(prepared));
  const queue = JSON.parse(fx.read("specs/e2e/slice-queue.json"));
  const slice = queue.slices.find((row) => row.id === regenerated.itemDelivery.sliceId);
  assert.ok(slice, "the prepared course holds the item slice");
  assert.equal(slice.state, "ready");
  assert.deepEqual(slice.writeScope, [SOURCE]);
  state.itemDelivery = regenerated.itemDelivery;
});

test("(c) authored variant: existing acceptance.md and result.md are registered as found, their bytes unchanged", () => {
  const fx = authoredConsumer();
  const before = { acceptance: fx.read(ACCEPTANCE), result: fx.read(RESULT) };
  assert.ok(before.acceptance.equals(Buffer.from(AUTHORED_ACCEPTANCE)) && before.result.equals(Buffer.from(AUTHORED_RESULT)));
  const result = register(fx);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.equal(result.json.status, "registered", result.stdout);
  assert.deepEqual(result.json.generated.map((entry) => entry.path), [REVIEW_UNIT], "an existing file is never regenerated; only the review unit is new");
  assert.deepEqual(result.json.found.map((entry) => entry.path), [ACCEPTANCE, RESULT]);
  assert.deepEqual(result.json.commitPaths, [MANIFEST, result.json.envelopePath, REVIEW_UNIT], "found files were committed by their author; the manifest and the review unit are new");
  assert.ok(fx.read(ACCEPTANCE).equals(before.acceptance), "acceptance.md bytes are unchanged");
  assert.ok(fx.read(RESULT).equals(before.result), "result.md bytes are unchanged");
  assert.equal(fx.gitOk("status", "--porcelain", "--", ACCEPTANCE, RESULT), "", "the found files are not modified in the working tree");
  const manifest = JSON.parse(fx.read(MANIFEST));
  const entry = (path) => manifest.artifacts.find((artifact) => artifact.path === path);
  assert.deepEqual([entry(ACCEPTANCE).sha256, entry(ACCEPTANCE).authority, entry(ACCEPTANCE).mutability, entry(ACCEPTANCE).retention], [sha256(before.acceptance), true, "mutable", "active"], "bound by the approval's companions: authoritative");
  assert.deepEqual([entry(RESULT).sha256, entry(RESULT).authority, entry(RESULT).mutability, entry(RESULT).retention], [sha256(before.result), false, "append-only", "active"], "not bound by the approval: not authoritative");
});

test("(d) the host-run check of a candidate commit holding a trivial node:test scaffold passes", () => {
  const fx = consumer();
  fx.write(SOURCE, "export const value = () => 1;\n");
  fx.write(CHECK, "import assert from \"node:assert/strict\";\nimport test from \"node:test\";\nimport { value } from \"../src/first-item.mjs\";\n\ntest(\"scaffold\", () => { assert.equal(value(), 1); });\n");
  fx.gitOk("add", "--", SOURCE, CHECK);
  fx.gitOk("commit", "-q", "-m", "scaffold the first item check");
  const executed = executeGovernedItemDeliveryChecks({ root: fx.root, itemDelivery: state.itemDelivery, candidate: fx.candidate() });
  assert.equal(executed.status, "observed", JSON.stringify(executed));
  assert.equal(executed.code, "SQ-TARGETED-CHECKS-PASSED", JSON.stringify(executed.evidence ?? executed));
});

test("(e) a second registration run is already-registered and byte-stable", () => {
  const fx = consumer();
  const again = register(fx);
  assert.equal(again.status, 0, `${again.stdout}${again.stderr}`);
  assert.equal(again.json.status, "already-registered", again.stdout);
  assert.ok(Buffer.from(fx.read(MANIFEST)).equals(state.manifestBytes), "the manifest bytes are unchanged");
  assert.equal(again.json.manifestSha256, sha256(state.manifestBytes));
  assert.ok(fx.read(ACCEPTANCE).equals(state.generated.acceptance) && fx.read(RESULT).equals(state.generated.result), "the generated files are byte-stable");
});

test("(f) the generated files name the Spec path and digest and nothing else from outside the package", () => {
  const fx = consumer();
  const specSha256 = sha256(fx.read(SPEC));
  const acceptance = fx.read(ACCEPTANCE).toString("utf8");
  const result = fx.read(RESULT).toString("utf8");
  assert.equal(acceptance, renderAcceptancePointer({ featureId: FEATURE, specPath: SPEC, specSha256 }), "the pointer is exactly the shipped rendering of (feature, Spec path, Spec digest)");
  assert.equal(result, renderResultRecord({ featureId: FEATURE }));
  const quoted = (text) => [...text.matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
  assert.deepEqual(quoted(acceptance), [SPEC, specSha256], "the pointer names the Spec path and its digest, nothing else");
  assert.deepEqual(quoted(result), [FEATURE], "the result record names the feature id, nothing else");
  assert.match(acceptance, /adds no acceptance criterion/u);
  assert.match(result, /implementation is in progress/u);
  assert.match(result, /not acceptance/u);
  for (const text of [acceptance, result]) {
    assert.ok(![fx.root, WORK, REPO_ROOT, PLAN, "/home/", "/Users/", "\\Users\\"].some((leak) => text.includes(leak)), "no machine path, no repository root, no PRD content");
    assert.ok([...text.matchAll(/[a-f0-9]{64}/gu)].every((match) => match[0] === specSha256), "the only digest is the Spec's");
  }
});

test("(g) PF-34: a feature registered before the review unit existed gets it with --add-review-unit, once", () => {
  const fx = authoredConsumer();
  // The manifest an earlier version registered: no design entry, no unit file.
  const manifest = JSON.parse(fx.read(MANIFEST));
  fx.write(MANIFEST, `${JSON.stringify({ ...manifest, artifacts: manifest.artifacts.filter((artifact) => artifact.path !== REVIEW_UNIT) }, null, 2)}\n`);
  rmSync(join(fx.root, REVIEW_UNIT));
  const added = register(fx, "--add-review-unit");
  assert.equal(added.status, 0, `${added.stdout}${added.stderr}`);
  assert.equal(added.json.status, "review-unit-added", added.stdout);
  assert.deepEqual(added.json.commitPaths, [MANIFEST, REVIEW_UNIT]);
  assert.match(added.json.next, /earliest base a Critic review of this feature course can use/u);
  const amended = JSON.parse(fx.read(MANIFEST));
  assert.deepEqual(amended.artifacts.slice(0, -1), manifest.artifacts.filter((artifact) => artifact.path !== REVIEW_UNIT), "nothing else of the manifest changes");
  assert.deepEqual(amended.artifacts.at(-1), { class: "design", path: REVIEW_UNIT, sha256: sha256(fx.read(REVIEW_UNIT)), authority: false, mutability: "immutable", retention: "retain" });
  const again = register(fx, "--add-review-unit");
  assert.equal(again.json.status, "already-present", again.stdout);
  const usage = register(fx, "--add-review-unit", "extra");
  assert.equal(usage.json.code, "FPR-ARGS");
});
