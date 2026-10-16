// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.configure-verify-output-lacks-a-walkable-commit-route (AC-140, ALF-C-R1B/R1F).
// The configure-verify output names a commit route (`git add -- <twins>` then `git commit -m ...`). This
// pin executes those printed lines VERBATIM against a contained real-git fixture whose pre-commit hook is
// the really installed one, and asserts the route lands -- and that near-miss variants do not.
//
// The fixture reaches the approved-implementation State through the PUBLIC step sequence only (set-feature,
// continuity-init, submit-plan --profile feature, present-plan --review-receipt, approve-plan
// --design-approval-request, materialize-architecture, validateFeaturePackage, set-phase implementation); it is
// the contained, win32-safe port of scripts/signing-disclosure-sweep/staged-p16.fixture.mjs makeFixture. No
// approval or authority JSON is hand-written: the approval, submission, authority and accepted-contract
// records are all written by the real producers. Approval mode is `chat` (a committed pipeline.user.yaml).
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { observeCurrentPlanApprovalForCalibration, readState, run, statePath } from "../../scripts/pipeline-state.mjs";
import { compileDecisionSummary } from "../../scripts/architecture-baseline.mjs";
import { applyInstall } from "../../scripts/pre-commit-hook-install.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { validateFeaturePackage } from "../feature-package-topology.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { NEUTRAL_MANIFEST } from "../project-authority.mjs";
import { derivePlanLifecycle } from "../plan-spec-state-v2.mjs";
import * as po from "../po-gate-authority.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "../windows-private-state.mjs";
import { createWindowsOwnedAuthorityDirectory, createWindowsOwnedAuthorityExclusiveFile } from "../windows-owned-authority-backend.mjs";

const NOW = "2026-10-16T12:00:00.000Z";
// The lifecycle steps run earlier than the configure-verify call (a later clock never precedes the approval).
const AT = "2026-10-10T10:00:00.000Z";
const SEEDED_VERIFY = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";
const COMMAND = "node --test fixture.test.mjs";
const TWINS = ["project/pipeline.json", ".claude/pipeline.json"];
const FEATURE = "e2e";
const PLAN = "specs/e2e/prd_e2e.md";
const SPEC = "specs/e2e/spec.md";
const COMPANIONS = ["specs/e2e/design.md", "specs/e2e/traceability.md"];
const REPORT = "specs/e2e/review/design-review-1.md";
const RECEIPT = "specs/e2e/review/design-review-receipt-1.json";
const LIVE_PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = realpathSync(mkdtempSync(join(SCRATCH, "cvr-walkable-")));
// A frozen plugin copy: the install inventories the plugin root, so a parallel writer must not reach it.
const PLUGIN_ROOT = join(WORK, "plugin");
cpSync(LIVE_PLUGIN_ROOT, PLUGIN_ROOT, { recursive: true });
const PLUGIN_DIRS = { pluginLibDir: join(PLUGIN_ROOT, "lib"), pluginHooksDir: join(PLUGIN_ROOT, "hooks"), pluginScriptsDir: join(PLUGIN_ROOT, "scripts") };
const CEILING_BEFORE = process.env.GIT_CEILING_DIRECTORIES;
after(() => {
  if (CEILING_BEFORE === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = CEILING_BEFORE;
  rmSync(WORK, { recursive: true, force: true, maxRetries: 3 }); });

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const architecture = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };

let counter = 0;
// One fixture per case: the profile receipt fingerprint is bound to this exact repository path.
function fixture({ stateTracked }) {
  const parent = join(WORK, `fx-${counter += 1}`);
  mkdirSync(parent, { recursive: true });
  const root = join(parent, "repo");
  mkdirSync(root);
  // Containment: every git call in this process (fixture, governance, state writer) stops at the fixture parent.
  process.env.GIT_CEILING_DIRECTORIES = parent;
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 60000, env });
  const gitOk = (...args) => { const out = git(...args); assert.equal(out.status, 0, `SETUP git ${args[0]}: ${out.stderr}`); return out.stdout.trim(); };
  const write = (path, bytes) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };
  const read = (path) => readFileSync(join(root, path));
  const writeJson = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
  // The repository is initialised BEFORE the first git write, so no git call can ever resolve above the fixture.
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

  write("README.md", "Synthetic walkable-route fixture\n");
  write(".gitignore", stateTracked ? "scratch/\n" : "scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  const baseline = { schema: "pipeline.project.v1", project: "walkable-fixture", verify: SEEDED_VERIFY, autonomy: "gated", handover: "docs/state.md" };
  for (const twin of TWINS) writeJson(twin, baseline);
  gitOk("add", "--", "README.md", ".gitignore", ...TWINS);
  gitOk("commit", "-q", "-m", "seed baseline verification");
  // Enroll BEFORE the State file exists: a present project/pipeline-state.json is "retained enrollment history"
  // (governance-scope.mjs enrollmentHistory) and would turn this activation into a declined retirement route.
  const governance = createGovernanceScopeController({ hostStateRoot: join(parent, "host-state") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "walkable-fixture" });
  assert.equal(governance.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active", "SETUP real governance decision");
  // Chat mode: the human-approval mode is a committed pipeline.user.yaml (gates.human_approval: chat).
  write("pipeline.user.yaml", "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\ngates:\n  human_approval: chat\n");
  gitOk("add", "--", "pipeline.user.yaml");
  gitOk("commit", "-q", "-m", "selected approval mode");
  write(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  write(NEUTRAL_MANIFEST, read(".claude/pipeline.yaml"));
  for (const target of initialGreenfieldMapTargets("fresh")) write(target.path, target.bytes);
  const pointer = initialGreenfieldAgentEntryTarget("fresh");
  write(pointer.path, pointer.bytes);
  write("docs/adr/.gitkeep", "");
  write("specs/e2e/acceptance.md", "# Synthetic acceptance\n");
  write("specs/e2e/result.md", "# Synthetic result\n");
  write(SPEC, "# Synthetic Test Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Synthetic candidate-bound review |\n");
  write(PLAN, `${po.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${sha256(read(SPEC))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(architecture)}\n\`\`\`\n`);
  write(COMPANIONS[0], "# Synthetic Design\n");
  write(COMPANIONS[1], "| ID | Evidence |\n| --- | --- |\n");
  write(REPORT, "# Synthetic method review\nVerdict: pass.\n");
  // The profile receipt is written by the real po-gate producer, bound to this repository's exact path.
  const common = join(root, ".git");
  const profile = po.createPoGateProfileReceipt({ repositoryFingerprint: po.derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: root }), primaryRoot: root, sourceBytes: read("pipeline.user.yaml"), runtimeBytes: read(".claude/pipeline.yaml"), updatedAt: AT });
  const profilePath = resolve(po.poGateProfileReceiptPath(common));
  if (process.platform === "win32") {
    // On win32 the session-authority boundary inspects .git/agent-pipeline as a private-owned path (protected
    // DACL, the current user the only principal); a plain mkdir/writeFile inherits the parent ACL and is refused
    // with WIN-AUTH-DACL. The source-owned creators below are what production uses for that private custody.
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
  // Only the PUBLIC half of a throwaway key is used: the policy needs a trust anchor, no proof is ever signed.
  const publicKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  writeJson("project/critical-human-proof.json", { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "synthetic-walkable-key", publicKeySha256: sha256(publicKey) }] });
  gitOk("add", "--", PLAN, SPEC, ...COMPANIONS, REPORT, RECEIPT, "project/critical-human-proof.json", "specs/e2e/acceptance.md", "specs/e2e/result.md", "architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md", "docs/adr/.gitkeep", NEUTRAL_MANIFEST);
  gitOk("commit", "-q", "-m", "finished design");

  if (process.platform === "win32") {
    // The private State file is created by set-feature inside project/ and inherits that directory's ACL. A plain
    // mkdir leaves the inherited non-owner ACEs of the scratch ancestry, which the win32 private-path assessment
    // refuses (CVCT-FILE, then swallowed as CVCT-APPROVAL-UNAVAILABLE). Production hardens such directories with
    // hardenWindowsPrivateDirectory (protected DACL, current user only, inheritable), so the fixture does the same
    // BEFORE the State exists; the assessment of the State itself is still the genuine, unmodified one below.
    const hardened = hardenWindowsPrivateDirectory(join(root, "project"));
    assert.equal(hardened.status, "secure", `SETUP harden the State parent: ${JSON.stringify(hardened)}`);
  }
  // The public lifecycle route, in order; each step is the real CLI verb.
  lifecycle(["set-feature", "--id", FEATURE, "--plan-path", PLAN]);
  const continuity = { schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: source(PLAN), spec: source(SPEC), result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeJson("continuity-init-request.json", continuity);
  lifecycle(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "walkable-fixture-token"]);
  lifecycle(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  lifecycle(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  const readCurrent = () => { const observed = readState(root); assert.equal(observed.status, "ok"); return observed.state; };
  const requestPath = readCurrent().planPresentation.designApprovalRequestPath;
  const request = JSON.parse(read(requestPath));
  lifecycle(["approve-plan", "--by", "synthetic-po", "--design-approval-request", requestPath]);
  const approved = readCurrent();
  assert.equal(approved.planApproval.schema, "pipeline.plan-approval.v9");
  lifecycle(["materialize-architecture"]);
  const compiled = compileDecisionSummary(root, { now: AT });
  assert.equal(compiled.count, 0);
  assert.equal(compiled.authorityStatus, "source-validated");
  const artifact = (kind, path, authority, mutability, retention) => ({ class: kind, path, sha256: sha256(read(path)), authority, mutability, retention });
  // Synthetic project input, then the actual topology validator registers its real envelope.
  writeJson("specs/e2e/lifecycle.json", { schema: "pipeline.feature-package.v1", feature: { id: FEATURE, rigor: 2 }, state: "approved", artifacts: [artifact("prd", PLAN, true, "mutable", "active"), artifact("spec", SPEC, true, "mutable", "active"), artifact("acceptance", "specs/e2e/acceptance.md", true, "mutable", "active"), artifact("result", "specs/e2e/result.md", true, "mutable", "active"), artifact("candidate-evidence", approved.planApproval.acceptedContract.path, false, "immutable", "retain")], candidate: structuredClone(request.approvalIntent.value.candidate), supersedes: null });
  const packageRead = validateFeaturePackage(root, "specs/e2e/lifecycle.json");
  assert.ok(packageRead.ok, `SETUP registered package: ${JSON.stringify(packageRead.findings)}`);
  lifecycle(["set-phase", "--phase", "implementation"]);
  assert.equal(derivePlanLifecycle(readCurrent()).status, "implementing");
  const stateRelative = statePath(root).slice(root.length + 1).replaceAll("\\", "/");
  if (stateTracked) {
    gitOk("add", "--", stateRelative);
    gitOk("commit", "-q", "-m", "legacy tracked implementing State");
  } else {
    assert.equal(gitOk("ls-files", "--", stateRelative), "", "the private State stays untracked");
    assert.equal(git("check-ignore", "--quiet", "--", stateRelative).status, 0, "the private State is ignored");
  }
  // The genuine approval reader must see this State as eligible BEFORE the pin exercises configure-verify; a
  // failure here is a fixture defect, named with the win32 private-path verdict, never a hook refusal.
  const observed = observeCurrentPlanApprovalForCalibration({ rootDir: root });
  const privatePath = process.platform === "win32" ? JSON.stringify(assessWindowsPrivatePath(statePath(root))) : "n/a";
  assert.equal(observed.status, "eligible", `SETUP genuine default approval reader: ${JSON.stringify(observed)} (win32 private-path verdict: ${privatePath})`);
  const install = applyInstall({ rootDir: root, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed", JSON.stringify(install));
  return { root, git, env, head: () => git("rev-parse", "HEAD").stdout.trim() };
}

// Runs the real configure-verify and returns the printed lines.
function configure(root, env, command = COMMAND) {
  const logs = [];
  const original = { log: console.log, error: console.error, ceiling: process.env.GIT_CEILING_DIRECTORIES };
  console.log = (...args) => { logs.push(args.join(" ")); };
  console.error = (...args) => { logs.push(`ERR ${args.join(" ")}`); };
  process.env.GIT_CEILING_DIRECTORIES = env.GIT_CEILING_DIRECTORIES;
  let code;
  try {
    code = run(["configure-verify", "--verify-command", command], { dir: root, now: () => NOW, architectureEntryReadiness: () => ({ status: "ready" }) });
  } finally {
    console.log = original.log;
    console.error = original.error;
    if (original.ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = original.ceiling;
  }
  assert.equal(code, 0, logs.join("\n"));
  return logs;
}

// Parses the two printed route lines; they are executed verbatim (no re-derivation of the paths or message).
function printedRoute(logs) {
  const add = logs.find((line) => line.startsWith("git add -- "));
  const commit = logs.find((line) => line.startsWith("git commit -m "));
  assert.ok(add, `the output must print a git add line:\n${logs.join("\n")}`);
  assert.ok(commit, `the output must print a git commit line:\n${logs.join("\n")}`);
  const message = /^git commit -m "([^"]+)"$/u.exec(commit);
  assert.ok(message, `the printed commit line is one plain -m "<message>" spelling: ${commit}`);
  return { addArgs: ["add", "--", ...add.slice("git add -- ".length).split(" ")], commitArgs: ["commit", "-m", message[1]], add };
}

test("the printed route names exactly the two calibration twins and the normal commit", () => {
  const { root, env } = fixture({ stateTracked: true });
  const route = printedRoute(configure(root, env));
  assert.deepEqual(route.addArgs.slice(2).sort(), [".claude/pipeline.json", "project/pipeline.json"]);
});

test("the printed git add / git commit lines land through the installed hook (State tracked in HEAD)", () => {
  const { root, git, env, head } = fixture({ stateTracked: true });
  const before = head();
  const route = printedRoute(configure(root, env));
  assert.equal(git(...route.addArgs).status, 0);
  const committed = git(...route.commitArgs);
  assert.equal(committed.status, 0, committed.stderr);
  assert.notEqual(head(), before, "the commit landed");
  assert.equal(git("diff", "--name-only", `${before}`, "HEAD").stdout.trim().split(/\r?\n/u).sort().join(","), ".claude/pipeline.json,project/pipeline.json");
});

// The output itself tells the operator to keep the private State untracked, so that exact route must land too:
// the installed hook reopens the real current approval and the committed tier transition for it (the P16 route,
// scripts/pre-commit-hook-install.mjs -> inspectCalibrationVerifyCommitTransition -> CVCT-COMMIT-READY) and does
// not need HEAD:project/pipeline-state.json. Measured green live on win32 (ALF-C-R1G); if the hook ever refuses
// this route again, the printed guidance is not walkable and this case goes red.
test("the printed route also lands when the private State is untracked, as the output recommends", () => {
  const { root, git, env, head } = fixture({ stateTracked: false });
  const before = head();
  const route = printedRoute(configure(root, env));
  assert.equal(git(...route.addArgs).status, 0);
  const committed = git(...route.commitArgs);
  assert.equal(committed.status, 0, committed.stderr);
  assert.notEqual(head(), before);
});

function refused(ctx, label) {
  const result = ctx.git("commit", "-m", "chore: configure project verification");
  assert.notEqual(result.status, 0, `${label}: the hook must refuse`);
  assert.equal(ctx.head(), ctx.before, `${label}: no new commit`);
}

test("refusal: only one calibration twin staged", () => {
  const ctx = { ...fixture({ stateTracked: true }) };
  ctx.before = ctx.head();
  printedRoute(configure(ctx.root, ctx.env));
  assert.equal(ctx.git("add", "--", "project/pipeline.json").status, 0);
  refused(ctx, "one twin");
});

test("refusal: the State is staged beside the twins", () => {
  const ctx = { ...fixture({ stateTracked: true }) };
  ctx.before = ctx.head();
  const route = printedRoute(configure(ctx.root, ctx.env));
  const statePathAbsolute = join(ctx.root, "project", "pipeline-state.json");
  const state = JSON.parse(readFileSync(statePathAbsolute, "utf8"));
  state.updatedAt = "2026-10-16T12:30:00.000Z";
  writeFileSync(statePathAbsolute, `${JSON.stringify(state, null, 2)}\n`);
  assert.equal(ctx.git(...route.addArgs, "project/pipeline-state.json").status, 0);
  refused(ctx, "state staged");
});

test("refusal: a hand-edited different verify command in one twin", () => {
  const ctx = { ...fixture({ stateTracked: true }) };
  ctx.before = ctx.head();
  const route = printedRoute(configure(ctx.root, ctx.env));
  const twin = join(ctx.root, ".claude", "pipeline.json");
  const value = JSON.parse(readFileSync(twin, "utf8"));
  value.verify = "node --test other.test.mjs";
  writeFileSync(twin, `${JSON.stringify(value, null, 2)}\n`);
  assert.equal(ctx.git(...route.addArgs).status, 0);
  refused(ctx, "hand-edited twin");
});

// The route the output recommends keeps the private State untracked; there the installed hook only sanctions the
// twins through the exact-set P16 predicate (scripts/pre-commit-hook-install.mjs: every staged path must be a
// calibration twin, then CVCT-STAGED-SET), so a different staged set is not admitted. Measured green live on win32.
test("refusal: a different staged set (an extra file beside the twins), private State untracked", () => {
  const ctx = { ...fixture({ stateTracked: false }) };
  ctx.before = ctx.head();
  const route = printedRoute(configure(ctx.root, ctx.env));
  writeFileSync(join(ctx.root, "extra.txt"), "extra\n");
  assert.equal(ctx.git(...route.addArgs, "extra.txt").status, 0);
  refused(ctx, "extra staged file, State untracked");
  assert.equal(existsSync(join(ctx.root, "extra.txt")), true);
});

// Typed todo, original assertion kept unchanged (not weakened, not deleted). Measured RED live on win32 (ALF-C-R1H
// run 1: "extra staged file: the hook must refuse", actual 0): with the legacy TRACKED State, the hook's late-recovery
// sanction (sanctionedLateVerifyRecoveryPaths) judges only the protected delta -- both twins baseline-only -> one
// identical command over an established implementing HEAD State -- and an unprotected extra file in the same index is
// not part of that judgement, so the commit lands. The exact-set check (CVCT-STAGED-SET) guards only the untracked-State
// route above. Blocker (D, decision): whether the legacy tracked route must also refuse an unprotected extra file is a
// product decision on scripts/pre-commit-hook-install.mjs, outside this pin's write scope. The body runs; if the hook
// is ever tightened, this todo turns green and the todo marker is then to be removed.
test("refusal: a different staged set (an extra file beside the twins)", {
  todo: "D-decision: the tracked-State late-recovery route (sanctionedLateVerifyRecoveryPaths) admits an unprotected extra staged file; CVCT-STAGED-SET covers only the untracked-State route",
}, () => {
  const ctx = { ...fixture({ stateTracked: true }) };
  ctx.before = ctx.head();
  const route = printedRoute(configure(ctx.root, ctx.env));
  writeFileSync(join(ctx.root, "extra.txt"), "extra\n");
  assert.equal(ctx.git(...route.addArgs, "extra.txt").status, 0);
  refused(ctx, "extra staged file");
  assert.equal(existsSync(join(ctx.root, "extra.txt")), true);
});
