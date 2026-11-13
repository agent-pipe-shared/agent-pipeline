// SPDX-License-Identifier: SUL-1.0
// Late binding of the PRD and the Spec, build step 4 (docs/adr/draft-late-binding-of-prd-and-spec-at-the-approval.md, AC-108 closest
// accepted criterion): the digest-bound seal plan, `prepare-seal`, and the plan approval that applies it in one transaction.
//   LB4-1..LB4-8   pure plan module and the additive design approval binding key
//   LB4-9..LB4-20  real State fixtures: the public step sequence (set-feature, continuity-init with a DRAFT authority, prepare-seal,
//                  submit-plan, present-plan, approve-plan) in chat mode, a trimmed port of the consumer-approved-plan pin fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { readState, run } from "../scripts/pipeline-state.mjs";
import { createDesignReviewReceipt } from "./design-review-receipt.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { NEUTRAL_MANIFEST } from "./project-authority.mjs";
import * as po from "./po-gate-authority.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "./architecture-map-scaffold.mjs";
import { createDesignApprovalBinding, createDesignApprovalRequest, validateDesignApprovalBinding, verifyDesignApprovalRequest } from "./design-approval-binding.mjs";
import { readAuthoritySeal } from "./authority-seal-reader.mjs";
import {
  buildSealPlan, checkSealPlanForApply, readSealDocuments, sealedAuthorityFromPlan, validateSealPlan,
} from "./authority-seal-plan.mjs";
import { hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";
import { createWindowsOwnedAuthorityDirectory, createWindowsOwnedAuthorityExclusiveFile } from "./windows-owned-authority-backend.mjs";

const AT = "2026-11-04T10:00:00.000Z";
const FEATURE = "lb4";
const PLAN = "specs/lb4/prd_lb4.md";
const SPEC = "specs/lb4/spec.md";
const INPUT = "specs/lb4/design-input.md";
const COMPANIONS = ["specs/lb4/design.md", "specs/lb4/traceability.md"];
const REPORT = "specs/lb4/review/design-review-1.md";
const RECEIPT = "specs/lb4/review/design-review-receipt-1.json";
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = realpathSync(mkdtempSync(join(SCRATCH, "lb4-seal-")));
const CEILING_BEFORE = process.env.GIT_CEILING_DIRECTORIES;
after(() => {
  if (CEILING_BEFORE === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = CEILING_BEFORE;
  rmSync(WORK, { recursive: true, force: true, maxRetries: 3 });
});

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const D = (char) => char.repeat(64);
const architecture = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };

// ---------------------------------------------------------------------------------------------- pure module
const draftAuthority = { sealed: false, prd: { path: PLAN }, spec: { path: SPEC }, result: null };
const docs = (over = {}) => ({ prd: { path: PLAN, sha256: D("a") }, spec: { path: SPEC, sha256: D("b") }, designInput: { path: INPUT, sha256: D("c") }, result: null, plan: null, ...over });
const base = (over = {}) => ({ authority: draftAuthority, featureId: FEATURE, revision: 3, profile: "feature", documents: docs(), designInputCapture: { path: INPUT, sha256: D("c") }, reviews: [], ...over });

test("LB4-1 a draft package gets one digest-bound plan: documents, capture, revision and a plan digest that covers them", () => {
  const built = buildSealPlan(base({ reviews: [{ kind: "readiness", ref: RECEIPT, prdSha256: D("a"), specSha256: D("b"), designInputSha256: D("c") }] }));
  assert.equal(built.ok, true);
  assert.equal(built.plan.stateRevision, 3);
  assert.equal(built.plan.documents.designInput.sha256, D("c"));
  assert.equal(built.plan.designInputCapture.sha256, D("c"));
  assert.equal(validateSealPlan(built.plan).ok, true);
  assert.equal(buildSealPlan(base({ reviews: [{ kind: "readiness", ref: RECEIPT, prdSha256: D("a"), specSha256: D("b"), designInputSha256: D("c") }] })).planSha256, built.planSha256, "same inputs, same digest");
  assert.notEqual(buildSealPlan(base({ revision: 4 })).planSha256, built.planSha256, "the revision is part of the digest");
  assert.equal(validateSealPlan({ ...built.plan, stateRevision: 9 }).code, "PSP-PLAN-INVALID", "a plan whose content no longer matches its digest is refused");
});

test("LB4-2 a stale review is refused by name with the re-request exit; a matching review and a review that binds nothing are not", () => {
  const stale = buildSealPlan(base({ reviews: [{ kind: "design-advisory", ref: "project/design-advisory-admission.json", prdSha256: D("f"), specSha256: D("b"), designInputSha256: null }] }));
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "PSP-STALE-REVIEW");
  assert.match(stale.reason, /design-advisory/u);
  assert.deepEqual(stale.exits, ["re-request:design-advisory"]);
  assert.match(stale.repair, /re-request the design advisory/u);
  const staleInput = buildSealPlan(base({ reviews: [{ kind: "readiness", ref: RECEIPT, prdSha256: D("a"), specSha256: D("b"), designInputSha256: D("9") }] }));
  assert.equal(staleInput.code, "PSP-STALE-REVIEW", "a readiness review of other design-input bytes is stale");
  assert.equal(buildSealPlan(base({ reviews: [{ kind: "critic-preflight", ref: "preflight", prdSha256: null, specSha256: D("b"), designInputSha256: null }] })).ok, true);
});

test("LB4-3 design-input bytes that differ from the capture record are a provenance refusal with the way out", () => {
  const refused = buildSealPlan(base({ designInputCapture: { path: INPUT, sha256: D("1") } }));
  assert.equal(refused.code, "PSP-PROVENANCE");
  assert.deepEqual(refused.exits, ["recapture-design-input"]);
  assert.match(refused.repair, /reopen-design records no new capture/u, "the text no longer offers a route that cannot repair this");
  assert.equal(buildSealPlan(base({ designInputCapture: null })).ok, true, "no capture record: nothing to compare (documented)");
  const review = { kind: "readiness", ref: RECEIPT, prdSha256: D("a"), specSha256: D("b"), designInputSha256: D("9") };
  assert.equal(buildSealPlan(base({ reviews: [review], supersededDesignInputs: [D("9")] })).ok, true, "a review of the exact bytes a recapture replaced stays valid");
  assert.equal(buildSealPlan(base({ reviews: [review], supersededDesignInputs: [D("8")] })).code, "PSP-STALE-REVIEW", "any other design-input bytes stay stale");
});

test("LB4-4 a sealed package, an invalid authority and a package outside the PRD release scope each get their own typed answer", () => {
  const sealed = buildSealPlan(base({ authority: { prd: { path: PLAN, sha256: D("a") }, spec: { path: SPEC, sha256: D("b") }, result: null } }));
  assert.equal(sealed.code, "PSP-ALREADY-SEALED");
  assert.deepEqual(sealed.exits, [], "nothing to do");
  assert.match(sealed.repair, /nothing to do/u);
  assert.equal(buildSealPlan(base({ authority: undefined })).code, "PSP-OUT-OF-SCOPE");
  assert.equal(buildSealPlan(base({ profile: "mini" })).code, "PSP-OUT-OF-SCOPE");
  assert.match(buildSealPlan(base({ profile: "mini" })).repair, /bind at the end of onboarding/u);
  assert.equal(buildSealPlan(base({ authority: { sealed: false, prd: { path: PLAN, sha256: D("a") }, spec: { path: SPEC }, result: null } })).code, "PSP-AUTHORITY-INVALID");
});

test("LB4-5 the apply gate refuses no plan, a plan for another revision or paths, and any byte that changed since prepare", () => {
  const { plan } = buildSealPlan(base());
  const call = (over = {}) => checkSealPlanForApply({ plan, authority: draftAuthority, featureId: FEATURE, revision: 3, documents: docs(), ...over });
  assert.equal(call().ok, true);
  assert.equal(call({ plan: null }).code, "PSP-NOT-PREPARED");
  assert.deepEqual(call({ plan: null }).exits, ["prepare-seal"]);
  assert.equal(call({ revision: 4 }).code, "PSP-PLAN-STALE");
  assert.equal(call({ featureId: "other" }).code, "PSP-PLAN-STALE");
  const drift = call({ documents: docs({ prd: { path: PLAN, sha256: D("e") } }) });
  assert.equal(drift.code, "PSP-APPLY-DRIFT");
  assert.deepEqual(drift.exits, ["prepare-seal"]);
  assert.match(drift.reason, /prd/u);
  assert.equal(call({ documents: docs({ designInput: null }) }).code, "PSP-APPLY-DRIFT");
});

test("LB4-6 the sealed authority is the bound shape without the marker, and reads as sealed", () => {
  const { plan } = buildSealPlan(base());
  const sealed = sealedAuthorityFromPlan(plan);
  assert.equal(Object.hasOwn(sealed, "sealed"), false);
  assert.deepEqual(sealed, { prd: { path: PLAN, sha256: D("a") }, spec: { path: SPEC, sha256: D("b") }, result: null });
  assert.equal(readAuthoritySeal(sealed).status, "sealed");
});

test("LB4-7 readSealDocuments names a missing PRD or Spec and seals an absent result as null", () => {
  const files = new Map([[PLAN, Buffer.from("prd")], [SPEC, Buffer.from("spec")]]);
  const read = (path) => files.get(path) ?? null;
  const ok = readSealDocuments({ prd: PLAN, spec: SPEC, designInput: INPUT, result: "specs/lb4/result.md", plan: null }, read);
  assert.equal(ok.ok, true);
  assert.equal(ok.documents.designInput, null);
  assert.equal(ok.documents.result, null);
  assert.equal(ok.documents.prd.sha256, sha(Buffer.from("prd")));
  files.delete(SPEC);
  assert.equal(readSealDocuments({ prd: PLAN, spec: SPEC, designInput: INPUT, result: null, plan: null }, read).code, "PSP-DOCUMENT-MISSING");
});

test("LB4-8 the seal plan digest enters the signed binding additively: no plan, no change; a plan changes the binding and the intent", () => {
  const source = (path, bytes) => ({ path, sha256: sha(Buffer.from(bytes)) });
  const sources = { prd: source(PLAN, "prd"), spec: source(SPEC, "spec"), companions: COMPANIONS.map((path) => source(path, path)) };
  const report = source(REPORT, "report");
  const made = createDesignReviewReceipt({ featureId: FEATURE, previous: null, sources, reviewer: { runner: "claude", model: "claude-opus-4" }, report, openFindingIds: [], reviewedAt: AT });
  assert.ok(made.ok, made.code);
  const receipts = [{ path: RECEIPT, bytes: made.bytes }];
  const plain = createDesignApprovalBinding({ featureId: FEATURE, receipts, currentSources: sources });
  assert.equal(plain.ok, true);
  assert.equal(Object.hasOwn(plain.binding, "sealPlanSha256"), false, "a package without a seal plan carries no key");
  const withPlan = createDesignApprovalBinding({ featureId: FEATURE, receipts, currentSources: sources, sealPlanSha256: D("7") });
  assert.equal(withPlan.ok, true);
  assert.equal(withPlan.binding.sealPlanSha256, D("7"));
  assert.notEqual(withPlan.bindingSha256, plain.bindingSha256, "the binding digest (the intent's subject) covers the plan digest");
  assert.equal(validateDesignApprovalBinding({ ...plain.binding, sealPlanSha256: "not-a-digest" }).code, "DAB-SHAPE");
  assert.equal(createDesignApprovalBinding({ featureId: FEATURE, receipts, currentSources: sources, sealPlanSha256: "x" }).code, "DAB-SHAPE");
  const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
  const requested = createDesignApprovalRequest({ binding: withPlan.binding, candidate });
  assert.equal(requested.ok, true);
  const verify = (request, extra) => verifyDesignApprovalRequest({ request, featureId: FEATURE, receipts, currentSources: sources, ...extra });
  assert.equal(verify(requested.request, { sealPlanSha256: D("7") }).ok, true);
  assert.equal(verify(requested.request, { sealPlanSha256: D("8") }).code, "DAB-BINDING-DRIFT", "a different plan digest is not what was signed");
  assert.equal(verify(requested.request, {}).code, "DAB-BINDING-DRIFT");
  const old = createDesignApprovalRequest({ binding: plain.binding, candidate });
  assert.equal(verify(old.request, {}).ok, true, "an existing request without a seal plan verifies exactly as before");
});

// ---------------------------------------------------------------------------------------------- real State fixtures
function buildDraft(name, { reviewOf } = {}) {
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
  let capture = { status: "absent" };
  const deps = (extra = {}) => ({ dir: root, now: () => AT, readDesignInputCapture: () => capture, ...extra });
  const cli = (argv, extra) => {
    const logs = [];
    const old = { log: console.log, error: console.error, warn: console.warn };
    for (const key of Object.keys(old)) console[key] = (...args) => { logs.push(args.map(String).join(" ")); };
    let status;
    try { status = run(argv, deps(extra)); } finally { Object.assign(console, old); }
    return { status, out: logs.join("\n") };
  };
  const must = (argv) => { const result = cli(argv); assert.equal(result.status, 0, `SETUP ${argv[0]}: ${result.out}`); return result; };

  write("README.md", "Synthetic seal fixture\n");
  write(".gitignore", "scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  const baseline = { schema: "pipeline.project.v1", project: "seal-fixture", verify: "node -e \"process.exit(1)\"", autonomy: "gated", handover: "docs/state.md" };
  for (const twin of ["project/pipeline.json", ".claude/pipeline.json"]) writeJson(twin, baseline);
  gitOk("add", "--", "README.md", ".gitignore", "project/pipeline.json", ".claude/pipeline.json");
  gitOk("commit", "-q", "-m", "seed baseline verification");
  const governance = createGovernanceScopeController({ hostStateRoot: join(parent, "host-state") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "seal-fixture" });
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
  write(PLAN, `${po.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${sha(read(SPEC))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(architecture)}\n\`\`\`\n`);
  write(INPUT, "# Design input as captured\n");
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
  const source = (path) => ({ path, sha256: sha(read(path)) });
  const review = createDesignReviewReceipt({ featureId: FEATURE, previous: null, sources: { prd: source(PLAN), spec: source(SPEC), companions: [...COMPANIONS.map(source), ...(reviewOf === "with-input" ? [source(INPUT)] : [])] }, reviewer: { runner: "claude", model: "claude-opus-4" }, report: source(REPORT), openFindingIds: [], reviewedAt: AT });
  assert.ok(review.ok, `SETUP actual review producer: ${review.code}`);
  write(RECEIPT, Buffer.from(review.bytes));
  gitOk("add", "--", PLAN, SPEC, INPUT, ...COMPANIONS, REPORT, RECEIPT, "architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md", "docs/adr/.gitkeep", NEUTRAL_MANIFEST);
  gitOk("commit", "-q", "-m", "finished design");
  if (process.platform === "win32") {
    const hardened = hardenWindowsPrivateDirectory(join(root, "project"));
    assert.equal(hardened.status, "secure", `SETUP harden the State parent: ${JSON.stringify(hardened)}`);
  }
  must(["set-feature", "--id", FEATURE, "--plan-path", PLAN]);
  const current = () => { const observed = readState(root); assert.equal(observed.status, "ok"); return observed.state; };
  const startDraft = () => {
    const continuity = { schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { sealed: false, prd: { path: PLAN }, spec: { path: SPEC }, result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
    writeJson("continuity-init-request.json", continuity);
    must(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "seal-fixture-token"]);
  };
  const planFile = () => join(root, "scratch", "seal-plan.json");
  const readPlan = () => JSON.parse(readFileSync(planFile(), "utf8"));
  const stateBytes = () => readFileSync(join(root, "project", "pipeline-state.json"));
  return { root, write, read, cli, must, current, startDraft, planFile, readPlan, stateBytes, setCapture: (value) => { capture = value; },
    approve: () => cli(["approve-plan", "--by", "synthetic-po", "--design-approval-request", current().planPresentation.designApprovalRequestPath]),
    present: () => cli(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]) };
}

test("LB4-9 prepare-seal prints and persists ONE plan, writes no State, and re-preparing the same bytes is an exact replay", () => {
  const fx = buildDraft("walk-prepare");
  fx.startDraft();
  fx.setCapture({ status: "present", path: INPUT, sha256: sha(fx.read(INPUT)) });
  const before = fx.stateBytes();
  const first = fx.cli(["prepare-seal"]);
  assert.equal(first.status, 0, first.out);
  assert.deepEqual(fx.stateBytes(), before, "prepare-seal never writes State");
  const plan = fx.readPlan();
  assert.equal(plan.schema, "pipeline.authority-seal-plan.v1");
  assert.equal(plan.stateRevision, 0);
  assert.equal(plan.documents.prd.sha256, sha(fx.read(PLAN)));
  assert.equal(plan.documents.spec.sha256, sha(fx.read(SPEC)));
  assert.equal(plan.documents.designInput.sha256, sha(fx.read(INPUT)));
  assert.equal(plan.designInputCapture.sha256, plan.documents.designInput.sha256);
  assert.match(first.out, new RegExp(plan.planSha256.slice(0, 12), "u"));
  const second = fx.cli(["prepare-seal"]);
  assert.equal(second.status, 0, second.out);
  assert.deepEqual(fx.readPlan(), plan);
  assert.match(second.out, /"replay": true/u);
});

test("LB4-10 prepare-seal refuses a stale readiness review by name, and a review of the current bytes passes", () => {
  const fx = buildDraft("walk-stale");
  fx.startDraft();
  const ok = fx.cli(["prepare-seal", "--review-receipt", RECEIPT]);
  assert.equal(ok.status, 0, ok.out);
  assert.equal(fx.readPlan().reviews[0].kind, "readiness");
  assert.equal(fx.readPlan().reviews[0].ref, RECEIPT);
  fx.write(PLAN, `${fx.read(PLAN).toString("utf8")}\nA sentence added after the review.\n`);
  const stale = fx.cli(["prepare-seal", "--review-receipt", RECEIPT]);
  assert.equal(stale.status, 2);
  assert.match(stale.out, /PSP-STALE-REVIEW/u);
  assert.match(stale.out, new RegExp(RECEIPT.replaceAll(".", "\\."), "u"));
  assert.match(stale.out, /re-request the readiness review/u);
  assert.match(stale.out, /re-request:readiness/u);
});

test("LB4-11 prepare-seal refuses design-input bytes that differ from the capture record, and an unreadable capture", () => {
  const fx = buildDraft("walk-provenance");
  fx.startDraft();
  fx.setCapture({ status: "present", path: INPUT, sha256: "1".repeat(64) });
  const differs = fx.cli(["prepare-seal"]);
  assert.equal(differs.status, 2);
  assert.match(differs.out, /PSP-PROVENANCE/u);
  assert.match(differs.out, /reopen-design/u);
  fx.setCapture({ status: "drift" });
  assert.match(fx.cli(["prepare-seal"]).out, /PSP-PROVENANCE/u);
  fx.setCapture({ status: "unavailable", code: "KICKOFF-PRIVATE-UNAVAILABLE" });
  assert.match(fx.cli(["prepare-seal"]).out, /PSP-PROVENANCE/u, "a design input without a readable capture is not sealed on trust");
  assert.equal(existsSync(fx.planFile()), false, "a refusal leaves no plan");
});

test("LB4-12 prepare-seal outside the scope says the bind at the end of onboarding applies; a package bound at onboarding says nothing to do", () => {
  const fx = buildDraft("walk-scope");
  const bound = fx.cli(["prepare-seal"]);
  assert.equal(bound.status, 2, "set-feature leaves a bound (sealed) package");
  assert.match(bound.out, /PSP-ALREADY-SEALED/u);
  const empty = join(WORK, "walk-scope-empty");
  mkdirSync(empty, { recursive: true });
  const logs = [];
  const old = { log: console.log, error: console.error };
  console.log = console.error = (...args) => { logs.push(args.map(String).join(" ")); };
  let status;
  try { status = run(["prepare-seal"], { dir: empty, now: () => AT }); } finally { Object.assign(console, old); }
  assert.equal(status, 2);
  assert.match(logs.join("\n"), /PSP-OUT-OF-SCOPE/u);
  assert.match(logs.join("\n"), /bind at the end of onboarding/u);
  assert.equal(existsSync(join(empty, "scratch", "seal-plan.json")), false, "a refusal writes no plan");
});

test("LB4-13 present-plan and approve-plan refuse a draft without a prepared plan, with the exit prepare-seal", () => {
  const fx = buildDraft("walk-unprepared");
  fx.startDraft();
  const submitted = fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  // C20b G20-50: submit-plan names the seal order for a draft package (prepare-seal with no arguments, then present-plan).
  assert.match(submitted.out, /Next \(agent, no PO step\): run `prepare-seal` with no arguments/u, submitted.out);
  const present = fx.present();
  assert.equal(present.status, 2);
  assert.match(present.out, /PSP-NOT-PREPARED/u);
  assert.match(present.out, /Exits: prepare-seal/u);
  assert.equal(fx.current().planPresentation, undefined, "nothing was presented");
});

test("LB4-14 the happy walk: draft -> prepare-seal -> submit -> present -> approve-plan seals in the same transaction, one approval", () => {
  const fx = buildDraft("walk-happy");
  fx.startDraft();
  fx.setCapture({ status: "present", path: INPUT, sha256: sha(fx.read(INPUT)) });
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  assert.equal(readAuthoritySeal(fx.current().continuity.authority).status, "draft", "the submission binds no digest of a draft");
  fx.must(["prepare-seal", "--review-receipt", RECEIPT]);
  const planned = fx.readPlan();
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  const presented = fx.current();
  assert.equal(presented.planPresentation.designApprovalBinding.sealPlanSha256, planned.planSha256, "the signed binding covers the plan digest");
  assert.equal(readAuthoritySeal(presented.continuity.authority).status, "draft", "still a draft before the approval");
  const approved = fx.approve();
  assert.equal(approved.status, 0, approved.out);
  const after = fx.current();
  assert.equal(after.planApproval.schema, "pipeline.plan-approval.v9");
  assert.equal(readAuthoritySeal(after.continuity.authority).status, "sealed");
  assert.equal(Object.hasOwn(after.continuity.authority, "sealed"), false, "the marker is removed");
  assert.equal(after.continuity.authority.prd.sha256, sha(fx.read(PLAN)));
  assert.equal(after.continuity.authority.spec.sha256, sha(fx.read(SPEC)));
  assert.equal(after.continuity.revision, presented.continuity.revision + 1);
  assert.equal(after.planApproval.designApprovalBinding.sealPlanSha256, planned.planSha256);
  assert.equal(existsSync(fx.planFile()), false, "the applied plan is retired");
  assert.match(approved.out, /PRD and Spec sealed/u);
  const again = fx.cli(["prepare-seal"]);
  assert.equal(again.status, 2);
  assert.match(again.out, /PSP-ALREADY-SEALED/u);
  assert.match(again.out, /nothing to do/u);
});

test("LB4-15 walk: prepare -> present -> a sealed byte changes -> approve-plan refuses (drift) -> prepare-seal -> approve refuses (not presented) -> present -> seals", () => {
  const fx = buildDraft("walk-drift");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  const first = fx.readPlan();
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  fx.write(INPUT, "# Design input edited after prepare\n");
  const drift = fx.approve();
  assert.equal(drift.status, 2);
  assert.match(drift.out, /PSP-APPLY-DRIFT/u);
  assert.match(drift.out, /designInput/u);
  assert.match(drift.out, /Exits: prepare-seal/u);
  assert.equal(readAuthoritySeal(fx.current().continuity.authority).status, "draft", "a refusal seals nothing");
  assert.equal(fx.current().planApproved, false);
  fx.must(["prepare-seal"]);
  assert.notEqual(fx.readPlan().planSha256, first.planSha256);
  const notPresented = fx.approve();
  assert.equal(notPresented.status, 2);
  assert.match(notPresented.out, /PSP-NOT-PRESENTED/u);
  assert.match(notPresented.out, /Exits: present-plan/u);
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  const sealed = fx.approve();
  assert.equal(sealed.status, 0, sealed.out);
  assert.equal(readAuthoritySeal(fx.current().continuity.authority).status, "sealed");
  assert.equal(fx.current().continuity.authority.prd.sha256, sha(fx.read(PLAN)));
});

test("LB4-16 a sealed byte that changes after prepare is caught at the presentation too, and prepare-seal repairs it", () => {
  const fx = buildDraft("walk-input-edit");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  fx.write(INPUT, "# Design input edited after prepare\n");
  const present = fx.present();
  assert.equal(present.status, 2);
  assert.match(present.out, /PSP-APPLY-DRIFT/u);
  assert.match(present.out, /designInput/u);
  fx.must(["prepare-seal"]);
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
});

test("LB4-16b a plan prepared before the submission is the plan of another State revision: PSP-PLAN-STALE names prepare-seal", () => {
  const fx = buildDraft("walk-revision");
  fx.startDraft();
  fx.must(["prepare-seal"]);
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  const present = fx.present();
  assert.equal(present.status, 2);
  assert.match(present.out, /PSP-PLAN-STALE/u);
  assert.match(present.out, /Exits: prepare-seal/u);
  fx.must(["prepare-seal"]);
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
});

test("LB4-17 no plan at approval: the plan file is gone or belongs to another revision -> approve-plan refuses with the exit prepare-seal", () => {
  const fx = buildDraft("walk-gone");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  rmSync(fx.planFile());
  const gone = fx.approve();
  assert.equal(gone.status, 2);
  assert.match(gone.out, /PSP-NOT-PREPARED/u);
  assert.match(gone.out, /Exits: prepare-seal/u);
  writeFileSync(fx.planFile(), `${JSON.stringify({ schema: "pipeline.authority-seal-plan.v1" })}\n`);
  assert.match(fx.approve().out, /PSP-PLAN-INVALID/u, "a malformed plan is repaired by prepare-seal, not trusted");
  fx.must(["prepare-seal"]);
  const stateNow = fx.current();
  assert.equal(stateNow.planApproved, false);
});

test("LB4-18 reopen-design works from a draft with a prepared plan (it voids the plan); prepare-seal prepares again", () => {
  const fx = buildDraft("walk-reopen");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  assert.equal(existsSync(fx.planFile()), true);
  const reopened = fx.cli(["reopen-design", "--by", "synthetic-author"]);
  assert.equal(reopened.status, 0, reopened.out);
  assert.match(reopened.out, /seal plan was voided/u);
  assert.equal(existsSync(fx.planFile()), false);
  assert.equal(readAuthoritySeal(fx.current().continuity.authority).status, "draft");
  const again = fx.cli(["prepare-seal"]);
  assert.equal(again.status, 0, again.out);
  assert.equal(existsSync(fx.planFile()), true);
});

test("LB4-19 a sealed package keeps its exact old approval path: no seal plan is asked for, no sealPlanSha256 is bound, revision unchanged", () => {
  const fx = buildDraft("walk-sealed-old");
  const sealedContinuity = { schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: { path: PLAN, sha256: sha(fx.read(PLAN)) }, spec: { path: SPEC, sha256: sha(fx.read(SPEC)) }, result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  fx.write("continuity-init-request.json", `${JSON.stringify(sealedContinuity, null, 2)}\n`);
  fx.must(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "seal-fixture-token"]);
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  assert.equal(Object.hasOwn(fx.current().planPresentation.designApprovalBinding, "sealPlanSha256"), false);
  const revisionBefore = fx.current().continuity.revision;
  const approved = fx.approve();
  assert.equal(approved.status, 0, approved.out);
  assert.equal(fx.current().continuity.revision, revisionBefore, "no continuity advance for a sealed package");
  assert.doesNotMatch(approved.out, /sealed in this approval/u);
});

test("LB4-20 prepare-seal accepts only its closed flags", () => {
  const fx = buildDraft("walk-flags");
  fx.startDraft();
  for (const argv of [["prepare-seal", "--by", "x"], ["prepare-seal", "--review-receipt"], ["prepare-seal", "--review-receipt", RECEIPT, "--review-receipt", RECEIPT]]) {
    const result = fx.cli(argv);
    assert.equal(result.status, 2, argv.join(" "));
  }
});

// ---------------------------------------------------------------------------------------------- build step 5: the state machine
// Every state of the seal has a command the agent can run that leaves a consistent state, `reopen-design` is executable in each of
// them, and the read-only readback (`inspect` -> sealSituation) names the next command and the exits. Cases LB5-4 to LB5-11.
const seal = (fx) => JSON.parse(fx.cli(["inspect"]).out).sealSituation;
const sealedContinuityOf = (fx) => ({ schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: { path: PLAN, sha256: sha(fx.read(PLAN)) }, spec: { path: SPEC, sha256: sha(fx.read(SPEC)) }, result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } });
const startSealed = (fx) => {
  fx.write("continuity-init-request.json", `${JSON.stringify(sealedContinuityOf(fx), null, 2)}\n`);
  fx.must(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "seal-fixture-token"]);
};
const exitIds = (situation) => situation.exits.map((exit) => exit.verb);

test("LB5-4 draft without a plan: the readback names the next command; before the submission that is submit-plan, after it prepare-seal; reopen-design is an exit", async () => {
  const { sanctionedPipelineStateArgs } = await import("./guard/sanctioned-args-scripts.mjs");
  const fx = buildDraft("lb5-draft-no-plan");
  fx.startDraft();
  const early = seal(fx);
  assert.equal(early.schema, "pipeline.seal-situation.v1");
  assert.equal(early.situation, "draft");
  assert.equal(early.plan.status, "none");
  assert.equal(early.next.verb, "submit-plan", "a plan prepared before the submission is the plan of another revision");
  assert.ok(exitIds(early).includes("reopen-design"));
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  const submitted = seal(fx);
  assert.equal(submitted.plan.status, "none");
  assert.equal(submitted.next.verb, "prepare-seal");
  assert.equal(sanctionedPipelineStateArgs(["prepare-seal"], fx.root), true, "the lifecycle guard admits the repair command");
  // Candidate 28e (ADR-0095 Decision 10): the exit itself is the PO's step; the guard admits only the agent's dry-run preview.
  assert.equal(sanctionedPipelineStateArgs(["reopen-design", "--by", "synthetic-author", "--dry-run"], fx.root), true);
  assert.equal(sanctionedPipelineStateArgs(["reopen-design", "--by", "synthetic-author"], fx.root), false);
  assert.equal(sanctionedPipelineStateArgs(["inspect"], fx.root), true);
  const before = fx.stateBytes();
  assert.equal(fx.cli(["inspect"]).status, 0);
  assert.deepEqual(fx.stateBytes(), before, "the readback writes nothing");
  assert.equal(existsSync(fx.planFile()), false, "the readback writes no plan");
  fx.must([submitted.next.verb]);
  assert.equal(seal(fx).plan.status, "current");
  assert.equal(seal(fx).next.verb, "present-plan");
});

test("LB5-5 draft with a prepared plan: present-plan is next, then approve-plan; reopen-design voids the plan and the next command works", () => {
  const fx = buildDraft("lb5-draft-plan");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  assert.equal(seal(fx).next.verb, "present-plan");
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  assert.equal(seal(fx).plan.status, "presented");
  assert.equal(seal(fx).next.verb, "approve-plan");
  fx.must(["reopen-design", "--by", "synthetic-author"]);
  assert.equal(existsSync(fx.planFile()), false, "reopen-design voids the prepared plan");
  const reopened = seal(fx);
  assert.equal(reopened.situation, "draft");
  assert.equal(reopened.plan.status, "none");
  assert.ok(["submit-plan", "prepare-seal"].includes(reopened.next.verb));
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  assert.equal(seal(fx).plan.status, "current");
});

test("LB5-6 draft with a stale plan (prepared before the submission): the readback says stale, prepare-seal repairs it", () => {
  const fx = buildDraft("lb5-draft-stale");
  fx.startDraft();
  fx.must(["prepare-seal"]);
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  const stale = seal(fx);
  assert.equal(stale.plan.status, "stale");
  assert.equal(stale.next.verb, "prepare-seal");
  fx.must(["prepare-seal"]);
  assert.equal(seal(fx).plan.status, "current");
});

test("LB5-7 draft whose PRD was edited after the plan: the readback says drifted, prepare-seal repairs it, and the edited bytes are what seals", () => {
  const fx = buildDraft("lb5-draft-drift");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  fx.write(SPEC, `${fx.read(SPEC).toString("utf8")}\nAC-2 is added in the draft.\n`);
  const drifted = seal(fx);
  assert.equal(drifted.plan.status, "drifted");
  assert.equal(drifted.next.verb, "prepare-seal");
  assert.match(drifted.plan.reason, /spec/u);
  fx.must(["prepare-seal"]);
  assert.equal(seal(fx).plan.status, "current");
});

test("LB5-8 unreadable, orphaned plan file on a draft: the readback says unreadable, prepare-seal replaces it (also a link in its place)", () => {
  const fx = buildDraft("lb5-draft-garbage");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  mkdirSync(dirname(fx.planFile()), { recursive: true });
  writeFileSync(fx.planFile(), "not json at all\n");
  const garbage = seal(fx);
  assert.equal(garbage.plan.status, "unreadable");
  assert.equal(garbage.next.verb, "prepare-seal");
  fx.must(["prepare-seal"]);
  assert.equal(seal(fx).plan.status, "current");
  // A plan file that is not a plain single-link file is replaced as well, never followed.
  const elsewhere = join(dirname(fx.planFile()), "elsewhere.json");
  writeFileSync(elsewhere, "{}\n");
  rmSync(fx.planFile());
  symlinkSync(elsewhere, fx.planFile());
  assert.equal(seal(fx).plan.status, "unreadable");
  fx.must(["prepare-seal"]);
  assert.equal(seal(fx).plan.status, "current");
  assert.equal(readFileSync(elsewhere, "utf8"), "{}\n", "the link target was not written through");
});

test("LB5-9 sealed package: nothing to prepare, reopen-design is the exit as before, a stray plan file is retired by prepare-seal", () => {
  const fx = buildDraft("lb5-sealed");
  fx.startDraft();
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  fx.must(["prepare-seal"]);
  fx.must(["present-plan", "--by", "synthetic-presenter", "--review-receipt", RECEIPT]);
  assert.equal(fx.approve().status, 0);
  const sealed = seal(fx);
  assert.equal(sealed.situation, "sealed");
  assert.equal(sealed.next, null);
  assert.deepEqual(exitIds(sealed), ["reopen-design"]);
  assert.equal(sealed.plan.status, "none");
  mkdirSync(dirname(fx.planFile()), { recursive: true });
  writeFileSync(fx.planFile(), `${JSON.stringify({ schema: "pipeline.authority-seal-plan.v1" })}\n`);
  const orphan = seal(fx);
  assert.equal(orphan.plan.status, "orphaned");
  assert.equal(orphan.next.verb, "prepare-seal", "the repair of a stray plan file on a sealed package");
  const bytes = fx.stateBytes();
  const retired = fx.cli(["prepare-seal"]);
  assert.equal(retired.status, 2);
  assert.match(retired.out, /PSP-ALREADY-SEALED/u);
  assert.match(retired.out, /stray seal plan file .* was retired/u);
  assert.equal(existsSync(fx.planFile()), false);
  assert.deepEqual(fx.stateBytes(), bytes, "retiring the file writes no State");
  assert.equal(seal(fx).plan.status, "none");
  assert.equal(seal(fx).next, null);
  assert.equal(fx.cli(["reopen-design", "--by", "synthetic-author"]).status, 0, "reopen-design from a sealed package behaves as before");
});

test("LB5-10 bound but not yet approved: the readback names reopen-design with its exact command; it is executable and the next command works", () => {
  const fx = buildDraft("lb5-bound-unapproved");
  startSealed(fx);
  const bound = seal(fx);
  assert.equal(bound.situation, "bound-unapproved");
  assert.equal(bound.next, null, "no automatic migration: the project stays locked until its approval");
  assert.deepEqual(exitIds(bound), ["reopen-design"]);
  assert.match(bound.exits[0].command, /reopen-design --by <name>$/u);
  const before = fx.stateBytes();
  assert.equal(fx.cli(["inspect"]).status, 0);
  assert.deepEqual(fx.stateBytes(), before, "the migration is the reader and the exits only: inspect writes no State");
  const reopened = fx.cli(["reopen-design", "--by", "synthetic-author"]);
  assert.equal(reopened.status, 0, reopened.out);
  fx.must(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  assert.equal(readAuthoritySeal(fx.current().continuity.authority).status, "sealed", "a bound package re-binds as before");
});

test("LB5-11 outside the scope: a state without continuity authority reads none and names no seal command", () => {
  const fx = buildDraft("lb5-none");
  // `set-feature` binds a continuity of its own, so the state without any continuity authority is written into the fixture directly
  // (the legacy shape of a project that has not initialized continuity); the readback must stay read-only on it.
  const legacy = fx.current();
  delete legacy.continuity;
  fx.write("project/pipeline-state.json", `${JSON.stringify(legacy, null, 2)}\n`);
  const none = seal(fx);
  assert.equal(none.situation, "none");
  assert.equal(none.next, null);
  assert.deepEqual(none.exits, []);
});
