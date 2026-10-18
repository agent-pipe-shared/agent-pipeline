// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.design-bootstrap-verify-state-contradicts-deferred-contract (AC-150, ALF-G1-CONFIGURE-VERIFY-CAUSE).
//
// A real greenfield project (Windows, Claude Code, signature approval mode, design approved, reopen-design, a second
// approval, then set-phase implementation) ran `pipeline-state.mjs configure-verify` and got only
// `CVCT-APPROVAL-UNAVAILABLE`; the calibration stayed `verify: null`. The cause is a double flattening:
//   1. plugins/pipeline-core/scripts/pipeline-state.mjs observeCurrentPlanApprovalForCalibration (13714-13793)
//      returns the one code CVCT-APPROVAL-UNAVAILABLE from several different checks (13726 lifecycle/approval/
//      submission shape, 13745 accepted-contract basis, 13762 design-approval comparison incl. a candidate drift
//      that observeDesignApprovalRequest 9139 reports as DAB-CANDIDATE-DRIFT) and from a bare `catch` (13792) that
//      swallows the typed CVCT-PATH / CVCT-FILE / CVCT-CAS errors of calibrationApprovalFile (13686-13712);
//   2. plugins/pipeline-core/lib/calibration-verify-commit-transition.mjs approval() (97-103) throws
//      CVCT-APPROVAL-UNAVAILABLE whenever the observer's status is not "eligible", NEVER consulting value.code, so
//      even the observer's already-typed codes (CVCT-AUTHORITY-STALE 13730, CVCT-PROFILE-STALE 13735, ...) are
//      erased before pipeline-state.mjs 10678 prints `commitTransition.code`.
// Each unmet condition is therefore indistinguishable and the refusal carries no repair.
//
// Case A (RED today): each reproducible unmet condition must be reported by configure-verify under its own named
// code (never the generic one, pairwise distinct) plus a one-line repair.
// Case B: the legitimate user path reopen-design -> second approval -> implementation must let configure-verify
// succeed, in chat mode and in signature mode (a throwaway Ed25519 key signs the request intent exactly as the PO's
// external signer does; the verbs, records and authority are all written by the real producers).
//
// The fixture is a contained port of configure-verify-output-lacks-a-walkable-commit-route.test.mjs fixture().
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { observeCurrentPlanApprovalForCalibration, readState, run, statePath } from "../../scripts/pipeline-state.mjs";
import { compileDecisionSummary } from "../../scripts/architecture-baseline.mjs";
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
const KEY_REFERENCE = "synthetic-walkable-key";
const GENERIC = "CVCT-APPROVAL-UNAVAILABLE";
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = realpathSync(mkdtempSync(join(SCRATCH, "cvr-unmet-")));
const CEILING_BEFORE = process.env.GIT_CEILING_DIRECTORIES;
after(() => {
  if (CEILING_BEFORE === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = CEILING_BEFORE;
  rmSync(WORK, { recursive: true, force: true, maxRetries: 3 });
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const architecture = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };

let counter = 0;
// One fixture per case: the profile receipt fingerprint is bound to this exact repository path.
// mode: "chat" | "signature"; reopen: run reopen-design and approve a second time before implementation.
function fixture({ mode = "chat", reopen = false } = {}) {
  const parent = join(WORK, `fx-${counter += 1}`);
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

  write("README.md", "Synthetic unmet-condition fixture\n");
  write(".gitignore", "scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  const baseline = { schema: "pipeline.project.v1", project: "unmet-fixture", verify: SEEDED_VERIFY, autonomy: "gated", handover: "docs/state.md" };
  for (const twin of TWINS) writeJson(twin, baseline);
  gitOk("add", "--", "README.md", ".gitignore", ...TWINS);
  gitOk("commit", "-q", "-m", "seed baseline verification");
  const governance = createGovernanceScopeController({ hostStateRoot: join(parent, "host-state") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "unmet-fixture" });
  assert.equal(governance.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active", "SETUP real governance decision");
  write("pipeline.user.yaml", `schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\ngates:\n  human_approval: ${mode}\n`);
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
  // A throwaway key: its public half is the trust anchor; in signature mode its private half stands in for the PO's
  // external signer (the proof shape is pipeline.po-approval-proof.v1, an Ed25519 signature over the intent digest).
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  writeJson("project/critical-human-proof.json", { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: KEY_REFERENCE, publicKeySha256: sha256(publicKey) }] });
  gitOk("add", "--", PLAN, SPEC, ...COMPANIONS, REPORT, RECEIPT, "project/critical-human-proof.json", "specs/e2e/acceptance.md", "specs/e2e/result.md", "architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md", "docs/adr/.gitkeep", NEUTRAL_MANIFEST);
  gitOk("commit", "-q", "-m", "finished design");

  if (process.platform === "win32") {
    const hardened = hardenWindowsPrivateDirectory(join(root, "project"));
    assert.equal(hardened.status, "secure", `SETUP harden the State parent: ${JSON.stringify(hardened)}`);
  }
  lifecycle(["set-feature", "--id", FEATURE, "--plan-path", PLAN]);
  const continuity = { schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: source(PLAN), spec: source(SPEC), result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeJson("continuity-init-request.json", continuity);
  lifecycle(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "unmet-fixture-token"]);
  const readCurrent = () => { const observed = readState(root); assert.equal(observed.status, "ok"); return observed.state; };
  // submit -> present -> (sign) -> approve, the public route; the second round is the user's reopen-design path.
  const approveRound = (receipt = RECEIPT) => {
    lifecycle(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
    lifecycle(["present-plan", "--by", "synthetic-presenter", "--review-receipt", receipt]);
    const requestPath = readCurrent().planPresentation.designApprovalRequestPath;
    const request = JSON.parse(read(requestPath));
    if (mode === "signature") {
      const proofPath = requestPath.replace("request-", "proof-");
      if (!existsSync(join(root, proofPath))) {
        const intentSha256 = request.approvalIntent.sha256;
        const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: KEY_REFERENCE, publicKey, signatureBase64: sign(null, Buffer.from(intentSha256, "utf8"), pair.privateKey).toString("base64") };
        const target = join(root, proofPath);
        writeFileSync(target, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
      }
      lifecycle(["approve-plan", "--design-approval-request", requestPath]);
    } else {
      lifecycle(["approve-plan", "--by", "synthetic-po", "--design-approval-request", requestPath]);
    }
    return { requestPath, request };
  };
  let round = approveRound();
  assert.equal(readCurrent().planApproval.schema, "pipeline.plan-approval.v9");
  if (reopen) {
    lifecycle(["reopen-design", "--by", "synthetic-po"]);
    // A submit-plan over unchanged sources is an exact replay and leaves the lifecycle invalidated, so a real second
    // approval needs a real change: one more criterion, the PRD's technical-spec marker, a fresh review, one commit.
    const oldSpec = read(SPEC).toString("utf8");
    const newSpec = `${oldSpec}| AC-2 | The reopened design records a second criterion. | Synthetic second-round review |\n`;
    write(PLAN, read(PLAN).toString("utf8").replace(sha256(oldSpec), sha256(newSpec)));
    write(SPEC, newSpec);
    write("specs/e2e/review/design-review-2.md", "# Synthetic round-2 review\nVerdict: pass.\n");
    const review2 = createDesignReviewReceipt({ featureId: FEATURE, previous: null, sources: { prd: source(PLAN), spec: source(SPEC), companions: COMPANIONS.map(source) }, reviewer: { runner: "claude", model: "claude-opus-4" }, report: source("specs/e2e/review/design-review-2.md"), openFindingIds: [], reviewedAt: AT });
    assert.ok(review2.ok, `SETUP actual round-2 review producer: ${review2.code}`);
    write("specs/e2e/review/design-review-receipt-2.json", Buffer.from(review2.bytes));
    gitOk("add", "--", PLAN, SPEC, "specs/e2e/review/design-review-2.md", "specs/e2e/review/design-review-receipt-2.json");
    gitOk("commit", "-q", "-m", "reopened design");
    round = approveRound("specs/e2e/review/design-review-receipt-2.json");
    assert.equal(readCurrent().planApproval.schema, "pipeline.plan-approval.v9");
    assert.notEqual(readCurrent().planApproval.priorInvalidationSha256, null, "SETUP the second approval records the prior invalidation");
  }
  const approved = readCurrent();
  lifecycle(["materialize-architecture"]);
  const compiled = compileDecisionSummary(root, { now: AT });
  assert.equal(compiled.count, 0);
  assert.equal(compiled.authorityStatus, "source-validated");
  const artifact = (kind, path, authority, mutability, retention) => ({ class: kind, path, sha256: sha256(read(path)), authority, mutability, retention });
  writeJson("specs/e2e/lifecycle.json", { schema: "pipeline.feature-package.v1", feature: { id: FEATURE, rigor: 2 }, state: "approved", artifacts: [artifact("prd", PLAN, true, "mutable", "active"), artifact("spec", SPEC, true, "mutable", "active"), artifact("acceptance", "specs/e2e/acceptance.md", true, "mutable", "active"), artifact("result", "specs/e2e/result.md", true, "mutable", "active"), artifact("candidate-evidence", approved.planApproval.acceptedContract.path, false, "immutable", "retain")], candidate: structuredClone(round.request.approvalIntent.value.candidate), supersedes: null });
  const packageRead = validateFeaturePackage(root, "specs/e2e/lifecycle.json");
  assert.ok(packageRead.ok, `SETUP registered package: ${JSON.stringify(packageRead.findings)}`);
  lifecycle(["set-phase", "--phase", "implementation"]);
  assert.equal(derivePlanLifecycle(readCurrent()).status, "implementing");
  const stateRelative = statePath(root).slice(root.length + 1).replaceAll("\\", "/");
  assert.equal(gitOk("ls-files", "--", stateRelative), "", "the private State stays untracked");
  const observed = observeCurrentPlanApprovalForCalibration({ rootDir: root });
  return { root, git, gitOk, env, write, read, observed, statePath: stateRelative };
}

// Runs the real configure-verify and returns { code, logs, errorLine, reportedCode }.
function configure(ctx, command = COMMAND) {
  const logs = [];
  const original = { log: console.log, error: console.error, ceiling: process.env.GIT_CEILING_DIRECTORIES };
  console.log = (...args) => { logs.push(args.join(" ")); };
  console.error = (...args) => { logs.push(`ERR ${args.join(" ")}`); };
  process.env.GIT_CEILING_DIRECTORIES = ctx.env.GIT_CEILING_DIRECTORIES;
  let code;
  try {
    code = run(["configure-verify", "--verify-command", command], { dir: ctx.root, now: () => NOW, architectureEntryReadiness: () => ({ status: "ready" }) });
  } finally {
    console.log = original.log;
    console.error = original.error;
    if (original.ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = original.ceiling;
  }
  const errorLine = logs.find((line) => line.startsWith("ERR Error: configure-verify")) ?? null;
  const reportedCode = errorLine === null ? null : (/\(([A-Z][A-Z0-9-]+)\)/u.exec(errorLine)?.[1] ?? null);
  return { code, logs, errorLine, reportedCode };
}

// The measured diagnostic every assertion message carries: what the observer saw, and what configure-verify said.
const diag = (ctx, outcome) => `observer=${JSON.stringify(ctx.observed)}\nconfigure-verify exit=${outcome.code} lines=${JSON.stringify(outcome.logs)}`;

// Case B ----------------------------------------------------------------------------------------------------
// Product line pinned: pipeline-state.mjs 10675 prepareCalibrationVerifyCommitTransition -> calibration-verify-commit-
// transition.mjs 94-105 approval() <- observeCurrentPlanApprovalForCalibration 13714-13793. A genuine, current approval
// reached through reopen-design and a second approval must not be refused.
// Measured (ALF-G1-CONFIGURE-VERIFY-CAUSE): both Case B tests are GREEN today on POSIX. reopen-design + a genuinely
// changed second approval, in chat and in signature mode, does NOT by itself reproduce the refusal; they stay as
// regression guards so the fix for Case A cannot trade one legitimate path for another. The user's Windows refusal
// is therefore one of the Case A conditions (leading candidate: the CVCT-FILE private-path verdict, see below).
for (const mode of ["chat", "signature"]) {
  test(`configure-verify succeeds after reopen-design and a second ${mode} approval (observer eligible, route prepared)`, () => {
    const ctx = fixture({ mode, reopen: true });
    assert.equal(ctx.observed.status, "eligible", `the genuine observer must see the reopened approval as current\n${diag(ctx, { code: "n/a", logs: [] })}`);
    const outcome = configure(ctx);
    assert.equal(outcome.code, 0, `configure-verify must accept a genuine reopen + second ${mode} approval\n${diag(ctx, outcome)}`);
  });
}

// Case A ----------------------------------------------------------------------------------------------------
// Each induced condition below is a real way the approval stops being current. The expected code is the name of the
// check that actually failed (derived from what the check tests): 13730 authority, 13735 profile/mode, 9139 drift.
const CONDITIONS = [
  {
    id: "approved-companion-removed",
    expected: null,
    describe: "an approved companion source vanished after approval (13749-13766 retain()/observeDesignApprovalRequest inputs; a thrown fs error reaches the bare catch 13792)",
    induce: (ctx) => { rmSync(join(ctx.root, COMPANIONS[1]), { force: true }); },
  },
  {
    id: "authority-source-edited",
    expected: "CVCT-AUTHORITY-STALE",
    describe: "the approved spec was edited after approval (13727-13730 checkPoGateAuthority vs state.planApproval.poGateAuthority)",
    induce: (ctx) => { ctx.write(SPEC, `${ctx.read(SPEC).toString("utf8")}\nEdited after approval.\n`); },
  },
  {
    id: "state-file-not-private",
    expected: "CVCT-FILE",
    posixOnly: true,
    describe: "the private State file is readable by others (13696-13699 calibrationApprovalFile throws CVCT-FILE and the bare catch 13792 swallows it; on win32 the same code comes from assessWindowsPrivatePath at 13699)",
    induce: (ctx) => { chmodSync(join(ctx.root, ctx.statePath), 0o644); },
  },
];

const outcomes = new Map();
for (const condition of CONDITIONS) {
  test(`case A: configure-verify names the unmet condition (${condition.id}) and a repair`, { skip: condition.posixOnly === true && process.platform === "win32" }, () => {
    const ctx = fixture({ mode: "chat", reopen: false });
    assert.equal(ctx.observed.status, "eligible", `SETUP the untouched fixture is eligible: ${JSON.stringify(ctx.observed)}`);
    condition.induce(ctx);
    // The observer's own post-induction verdict: where it already carries a typed code (13730 CVCT-AUTHORITY-STALE,
    // 13735 CVCT-PROFILE-STALE, ...), configure-verify must surface exactly that code, not erase it (approval() 103).
    ctx.observed = observeCurrentPlanApprovalForCalibration({ rootDir: ctx.root });
    const outcome = configure(ctx);
    outcomes.set(condition.id, outcome.reportedCode);
    assert.equal(outcome.code, 2, `the induced condition must be refused (${condition.describe})\n${diag(ctx, outcome)}`);
    assert.notEqual(outcome.reportedCode, GENERIC, `${condition.describe}: configure-verify reports only the generic ${GENERIC}\n${diag(ctx, outcome)}`);
    const expected = condition.expected ?? (ctx.observed.code !== GENERIC ? ctx.observed.code : null);
    if (expected !== null) assert.equal(outcome.reportedCode, expected, `${condition.describe}: expected the named code ${expected}\n${diag(ctx, outcome)}`);
    else assert.match(outcome.reportedCode ?? "", /^(?:CVCT|DAB)-[A-Z0-9-]+$/u, `${condition.describe}: expected a named CVCT-/DAB- code\n${diag(ctx, outcome)}`);
    assert.match(outcome.errorLine, /repair/iu, `${condition.describe}: the refusal must carry a one-line repair\n${diag(ctx, outcome)}`);
  });
}

test("case A: the unmet conditions are pairwise distinguishable (no two collapse to one code)", () => {
  const reported = CONDITIONS.map((condition) => outcomes.get(condition.id));
  assert.equal(new Set(reported).size, CONDITIONS.length, `every condition needs its own code: ${JSON.stringify(Object.fromEntries(CONDITIONS.map((condition, index) => [condition.id, reported[index]])))}`);
  assert.ok(!reported.includes(GENERIC), `no condition may be reported as the generic ${GENERIC}`);
});
