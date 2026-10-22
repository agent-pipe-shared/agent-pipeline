#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.three-runner-happy-path-with-two-po-approvals
 * (AC-264; spec section 21.0 counting rule, section 21.3 R3-1 ceremony inventory).
 *
 * Deterministic ceremony-inventory test. Every PO interaction the product
 * defines is classified `per-feature` or `one-time-onboarding`; the happy path
 * (scenarios A-D of R3-1) needs exactly two per-feature decisions (plus one per
 * additional push). The lifecycle verb list is DERIVED from the real
 * `pipeline-state.mjs --help` output, so a newly added approval-bearing verb that
 * nobody classified fails here. The per-runner end-to-end proof is host evidence
 * (E) and stays a typed skip.
 *
 * The same file also carries the item's added 0.7.0 acceptance (2026-10-17 P0-1, 2026-10-20 D64), each case
 * driving the real module: the typed absent course, the German-table criterion scan, the `.test.js` check
 * admission, the plan-readiness hand-off inspection, and the onboarding answers held in one intake record
 * across a real restart. Three acceptance points are not met on this head and are typed `todo` cases (owner
 * Coordinator, due 2026-10-31) that flip to passing when delivered: the submit-plan/present-plan call sites of
 * the hand-off inspection (deferred to 0.7.x by PO decision D85; protected file), the briefing generator
 * binding a numbered or R-n row of a German two-column table (scripts/dispatch-briefing.mjs
 * findCriterionOccurrences), and the Git author no longer asked once the intake record holds it.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readState, run } from "../../scripts/pipeline-state.mjs";
import { compactSigningDisclosure, runHumanApproval, spawnOpenssl } from "../../scripts/po-human-approval.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { applyOnboardingIntakeConsent, readOnboardingIntakeCheckpoint } from "../onboarding-continuity.mjs";
import { scanAcceptedCriterionRows } from "../critic-accepted-contract.mjs";
import { validateItemDeliveryBriefing } from "../native-goldfish-host-return.mjs";
import { resolveGovernedItemQueue } from "../native-goldfish-host-state.mjs";
import { inspectPlanDeliveryHandoff } from "../plan-handoff-readiness.mjs";
import { applyProjectOnboardingV3, inspectProjectOnboardingV3, planProjectOnboardingLifecycleV4, planProjectOnboardingV3 } from "../project-onboarding-v3.mjs";
import { fakeDeps as machineDeps } from "../project-onboarding-v3.test.mjs";
import { nativeContractFixtureParent } from "../test-item-approved-course-fixture.mjs";
import { NEUTRAL_MANIFEST } from "../project-authority.mjs";
import * as po from "../po-gate-authority.mjs";
import { hardenWindowsPrivateDirectory } from "../windows-private-state.mjs";
import { createWindowsOwnedAuthorityDirectory, createWindowsOwnedAuthorityExclusiveFile } from "../windows-owned-authority-backend.mjs";

const PLUGIN = fileURLToPath(new URL("../../", import.meta.url));
const SPEC = fileURLToPath(new URL("../../../../specs/sprint-alfred-epic/spec.md", import.meta.url));

const PER_FEATURE = "per-feature";
const ONE_TIME = "one-time-onboarding";
const ALLOWED_CLASSES = Object.freeze([PER_FEATURE, ONE_TIME]);

/**
 * The PO-interaction inventory. `anchor` ties each entry to product source:
 * `verb` entries must appear in the live pipeline-state command list;
 * `export`/`file` entries must resolve in the plugin.
 */
const INVENTORY = Object.freeze([
  { id: "plan-approval", class: PER_FEATURE, anchor: { verb: "approve-plan" } },
  { id: "push-approval", class: PER_FEATURE, anchor: { verb: "approve-push" } },
  { id: "enrollment-consent", class: ONE_TIME,
    anchor: { export: ["lib/onboarding-continuity.mjs", "applyOnboardingIntakeConsent"], file: "scripts/onboarding-consent.mjs" } },
  { id: "key-setup-first-use-confirmation", class: ONE_TIME, anchor: { file: "scripts/signing-ceremony.mjs" } },
]);

/**
 * Approval-bearing verbs deliberately NOT on the happy path. They are recovery,
 * re-enrollment mechanics (no extra prompt, PO decision 2026-10-04 #7), deploy or
 * release-publication acts. A happy-path scenario may never contain them.
 */
const OFF_HAPPY_PATH_VERBS = Object.freeze([
  "approve-deploy", "publication-approve", "rebind-approval", "retire-enrollment", "activate-enrollment",
  "po-authority-rebind-plan", "po-authority-rebind-apply", "po-authority-acknowledge-plan",
  "po-authority-acknowledge-apply", "po-authority-decision-plan", "po-authority-decision-select",
  "po-authority-decision-apply", "seal-plan-approval", "continuity-result-rebind-plan",
  "continuity-result-rebind-apply", "publication-authorize", "feature-package-rebind-mutable",
]);

const PO_VERB_PATTERN = /(^|-)(approve|approval|acknowledge|authorize|consent|rebind)(-|$)|^po-authority-/;

/** Scenarios of R3-1. Each builds its interaction list from the inventory only. */
const SCENARIOS = Object.freeze([
  { id: "A", pushes: 1, oneTime: [], expectPerFeature: 2 },
  { id: "B", pushes: 1, oneTime: ["enrollment-consent", "key-setup-first-use-confirmation"], expectPerFeature: 2 },
  { id: "C", pushes: 2, oneTime: [], expectPerFeature: 3 },
  { id: "D", pushes: 1, oneTime: ["enrollment-consent"], expectPerFeature: 2 },
]);

function liveVerbs() {
  const out = [];
  const log = console.log;
  console.log = (...v) => out.push(v.join(" "));
  try { assert.equal(run(["--help"], {}), 0); } finally { console.log = log; }
  const m = /Commands: ([^\n]+)\./.exec(out.join("\n"));
  assert.ok(m, "pipeline-state --help must list its commands");
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function interactionsFor(inventory, scenario) {
  const byId = new Map(inventory.map((e) => [e.id, e]));
  const list = [byId.get("plan-approval")];
  for (let i = 0; i < scenario.pushes; i += 1) list.push(byId.get("push-approval"));
  for (const id of scenario.oneTime) list.push(byId.get(id));
  return list;
}

/** The checker under test. Throws on any violation of the section 21.0 counting rule. */
function assertCeremonyInventory(inventory, verbs) {
  // Every entry is classified, and only into the two allowed classes.
  for (const e of inventory) {
    assert.ok(ALLOWED_CLASSES.includes(e.class), `interaction ${e.id} has disallowed class ${e.class}`);
    if (e.anchor.verb) assert.ok(verbs.includes(e.anchor.verb), `${e.id}: verb ${e.anchor.verb} is not a pipeline-state command`);
    if (e.anchor.file) assert.ok(existsSync(PLUGIN + e.anchor.file), `${e.id}: anchor file ${e.anchor.file} missing`);
  }
  // Every PO-bearing verb the product exposes is either inventoried or declared off the happy path.
  const covered = new Set([...inventory.map((e) => e.anchor.verb).filter(Boolean), ...OFF_HAPPY_PATH_VERBS]);
  const unclassified = verbs.filter((v) => PO_VERB_PATTERN.test(v) && !covered.has(v));
  assert.deepEqual(unclassified, [], `unclassified PO-interaction verbs: ${unclassified.join(", ")}`);
  // The happy-path scenarios count exactly as specified.
  for (const s of SCENARIOS) {
    const list = interactionsFor(inventory, s);
    const perFeature = list.filter((e) => e.class === PER_FEATURE).length;
    const oneTime = list.filter((e) => e.class === ONE_TIME).map((e) => e.id).sort();
    assert.equal(perFeature, s.expectPerFeature, `scenario ${s.id}: per-feature count ${perFeature}`);
    assert.deepEqual(oneTime, [...s.oneTime].sort(), `scenario ${s.id}: one-time acts`);
    for (const e of list) assert.ok(!OFF_HAPPY_PATH_VERBS.includes(e.anchor.verb), `scenario ${s.id} contains off-path ${e.id}`);
  }
  // Exactly two distinct per-feature ceremony kinds exist.
  assert.deepEqual(inventory.filter((e) => e.class === PER_FEATURE).map((e) => e.id).sort(), ["plan-approval", "push-approval"]);
}

test("AC-264: the inventory classifies every PO interaction into per-feature or one-time-onboarding and the happy path needs exactly two per-feature approvals", () => {
  assertCeremonyInventory(INVENTORY, liveVerbs());
});

test("AC-264: scenarios A-D match section 21.3 R3-1 counts (2 / 2 + two one-time / 3 / 2 + one one-time)", () => {
  const counts = SCENARIOS.map((s) => interactionsFor(INVENTORY, s).filter((e) => e.class === PER_FEATURE).length);
  assert.deepEqual(counts, [2, 2, 3, 2]);
});

test("AC-264: inventory anchors resolve in product source (verbs from live --help, consent export, plugin files)", () => {
  const verbs = liveVerbs();
  for (const v of ["approve-plan", "approve-push"]) assert.ok(verbs.includes(v), v);
  assert.equal(typeof applyOnboardingIntakeConsent, "function");
  for (const v of OFF_HAPPY_PATH_VERBS) assert.ok(verbs.includes(v), `off-path verb ${v} no longer exists; remove it from the pin`);
});

test("AC-264: the governing spec text still states the two-decision counting rule this pin encodes", () => {
  const text = readFileSync(SPEC, "utf8");
  assert.match(text, /exactly two decisions:\s+the final plan approval and the approval of that push/);
  assert.match(text, /`per-feature` or `one-time-onboarding`\. Any other class fails the test/);
});

test("RED mirror: an extra per-feature ceremony makes the inventory check fail", () => {
  const extra = [...INVENTORY, { id: "bootstrap-plan-acknowledgement", class: PER_FEATURE, anchor: { verb: "approve-plan" } }];
  assert.throws(() => assertCeremonyInventory(extra, liveVerbs()), /bootstrap-plan-acknowledgement/);
});

test("RED mirror: a ceremony in any third class fails", () => {
  const third = INVENTORY.map((e) => (e.id === "key-setup-first-use-confirmation" ? { ...e, class: "residual" } : e));
  assert.throws(() => assertCeremonyInventory(third, liveVerbs()), /disallowed class residual/);
});

test("RED mirror: a new unclassified approval-bearing pipeline-state verb fails", () => {
  assert.throws(() => assertCeremonyInventory(INVENTORY, [...liveVerbs(), "approve-extra-gate"]),
    /unclassified PO-interaction verbs: approve-extra-gate/);
});

test("RED mirror: an extra per-feature ceremony inside the happy-path scenario count is detected", () => {
  const twoPush = [{ id: "A", pushes: 2, oneTime: [], expectPerFeature: 2 }];
  const list = interactionsFor(INVENTORY, twoPush[0]);
  assert.notEqual(list.filter((e) => e.class === PER_FEATURE).length, twoPush[0].expectPerFeature);
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-264 design-approval PO output (ALF-B10-AC264). The item's added acceptance (2026-10-18, F-03): every rendered next
// action hands the PO the `--request` form for a design approval, never the bare `--intent-sha256` form, and the design
// approval PO output carries no guard-override warning. The `--intent-sha256` form is the one whose disclosure falls back to
// "no recorded request resolves for this digest ... guard-lift/guard-override authorization" (compactSigningDisclosure).
// The fixture reaches the real `present-plan --review-receipt` through the public step sequence in the DEFAULT approval mode
// (signature), a trimmed port of consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs `buildConsumer`; the sign
// command is then driven through the real `sign-intent --request` route with an encrypted fixture key (the approach of
// scripts/design-workflow-signing-default.test.mjs). Assertions avoid the bare phrase "guard override" on the disclosure:
// the source's own purpose line states "It is not push, release, publication or a guard override" as a negation.
// ---------------------------------------------------------------------------------------------------------------------
const DESIGN_AT = "2026-10-10T10:00:00.000Z";
const DESIGN_REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const DESIGN_PASSPHRASE = "synthetic-fixture-passphrase-not-a-secret";
const DESIGN_ARCHITECTURE = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "src/", "tests/"], rationale: "Synthetic scoped method fixture; no new material decision" }, modules: [{ id: "unit", responsibility: "Own synthetic unit", nonResponsibilities: ["No external authority"], ownedPaths: ["src/**", "tests/**"], publicContracts: ["src/index.mjs"], allowedDependencies: [], authorityEffects: [], verificationEntryPoints: ["tests/unit.test.mjs"], adrReferences: [] }], implementationSurface: ["src/index.mjs"], fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "synthetic-unit", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { decision: "bounded" } } };
const designDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const designCeilingBefore = process.env.GIT_CEILING_DIRECTORIES;
let designWork = null;
let designPresentationRun = null;
after(() => {
  if (designWork === null) return;
  if (designCeilingBefore === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = designCeilingBefore;
  rmSync(designWork, { recursive: true, force: true, maxRetries: 3 });
});

function buildDefaultModeDesignPresentation() {
  const scratch = join(DESIGN_REPO_ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  designWork = realpathSync(mkdtempSync(join(scratch, "tri-design-approval-")));
  const root = join(designWork, "repo"), keys = join(designWork, "keys");
  mkdirSync(root); mkdirSync(keys, { mode: 0o700 });
  process.env.GIT_CEILING_DIRECTORIES = designWork;
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: designWork };
  const gitOk = (...args) => { const out = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 60000, env }); assert.equal(out.status, 0, `SETUP git ${args[0]}: ${out.stderr}`); return out.stdout.trim(); };
  const write = (path, bytes) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };
  const read = (path) => readFileSync(join(root, path));
  const writeJson = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
  const lifecycle = (argv) => {
    const logs = [];
    const old = { log: console.log, error: console.error, warn: console.warn };
    for (const name of Object.keys(old)) console[name] = (...args) => { logs.push(args.map(String).join(" ")); };
    let status;
    try { status = run(argv, { dir: root, now: () => DESIGN_AT }); } finally { Object.assign(console, old); }
    assert.equal(status, 0, `SETUP ${argv[0]}: ${logs.join("\n")}`);
    return logs.join("\n");
  };
  const feature = "e2e", plan = "specs/e2e/prd_e2e.md", spec = "specs/e2e/spec.md", companions = ["specs/e2e/design.md", "specs/e2e/traceability.md"];
  const reportPath = "specs/e2e/review/design-review-1.md", receiptPath = "specs/e2e/review/design-review-receipt-1.json";
  gitOk("init", "-q", "-b", "main");
  gitOk("config", "user.email", "goldfish@example.invalid");
  gitOk("config", "user.name", "Goldfish");
  gitOk("config", "core.autocrlf", "false");
  assert.equal(realpathSync(root), root);
  write("README.md", "Synthetic design-approval output fixture\n");
  write(".gitignore", "scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  const baseline = { schema: "pipeline.project.v1", project: "design-approval-fixture", verify: "node -e \"process.exit(1)\"", autonomy: "gated", handover: "docs/state.md" };
  for (const twin of ["project/pipeline.json", ".claude/pipeline.json"]) writeJson(twin, baseline);
  gitOk("add", "--", "README.md", ".gitignore", "project/pipeline.json", ".claude/pipeline.json");
  gitOk("commit", "-q", "-m", "seed baseline verification");
  const governance = createGovernanceScopeController({ hostStateRoot: join(designWork, "host-state") });
  const enrollment = governance.planDecision({ rootDir: root, decision: "enroll", by: "design-approval-fixture" });
  assert.equal(governance.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active", "SETUP real governance decision");
  // No `gates:` block: the DEFAULT approval mode (signature) is what the PO meets on a fresh project.
  write("pipeline.user.yaml", "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\n");
  gitOk("add", "--", "pipeline.user.yaml");
  gitOk("commit", "-q", "-m", "default approval mode");
  write(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  write(NEUTRAL_MANIFEST, read(".claude/pipeline.yaml"));
  for (const target of initialGreenfieldMapTargets("fresh")) write(target.path, target.bytes);
  const pointer = initialGreenfieldAgentEntryTarget("fresh");
  write(pointer.path, pointer.bytes);
  write("docs/adr/.gitkeep", "");
  write(spec, "# Synthetic Test Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Synthetic candidate-bound review |\n");
  write(plan, `${po.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${designDigest(read(spec))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(DESIGN_ARCHITECTURE)}\n\`\`\`\n`);
  write(companions[0], "# Synthetic Design\n");
  write(companions[1], "| ID | Evidence |\n| --- | --- |\n");
  write(reportPath, "# Synthetic method review\nVerdict: pass.\n");
  const common = join(root, ".git");
  const profile = po.createPoGateProfileReceipt({ repositoryFingerprint: po.derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: root }), primaryRoot: root, sourceBytes: read("pipeline.user.yaml"), runtimeBytes: read(".claude/pipeline.yaml"), updatedAt: DESIGN_AT });
  const profilePath = resolve(po.poGateProfileReceiptPath(common));
  if (process.platform === "win32") {
    createWindowsOwnedAuthorityDirectory({ path: join(common, "agent-pipeline") });
    createWindowsOwnedAuthorityDirectory({ path: dirname(profilePath) });
    createWindowsOwnedAuthorityExclusiveFile({ path: profilePath, bytes: Buffer.from(po.serializePoGateProfileReceipt(profile)) });
  } else {
    mkdirSync(dirname(profilePath), { recursive: true, mode: 0o700 });
    writeFileSync(profilePath, po.serializePoGateProfileReceipt(profile), { mode: 0o600 });
  }
  const source = (path) => ({ path, sha256: designDigest(read(path)) });
  const review = createDesignReviewReceipt({ featureId: feature, previous: null, sources: { prd: source(plan), spec: source(spec), companions: companions.map(source) }, reviewer: { runner: "claude", model: "claude-opus-4" }, report: source(reportPath), openFindingIds: [], reviewedAt: DESIGN_AT });
  assert.ok(review.ok, `SETUP actual review producer: ${review.code}`);
  write(receiptPath, Buffer.from(review.bytes));
  // The PO key: encrypted, so production prints the disclosure and asks for no typed confirmation (the passphrase seam answers OpenSSL).
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustPolicy = { keyReference: "synthetic-design-approval-key", publicKeySha256: designDigest(publicKey) };
  writeFileSync(join(keys, "po-private.pem"), pair.privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: DESIGN_PASSPHRASE }), { mode: 0o600 });
  writeFileSync(join(keys, "po-public.pem"), publicKey);
  writeFileSync(join(keys, "trust-policy.json"), JSON.stringify({ ...trustPolicy, humanName: "Synthetic Test Operator" }));
  writeJson("project/critical-human-proof.json", { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: trustPolicy.keyReference, publicKeySha256: trustPolicy.publicKeySha256 }] });
  gitOk("add", "--", plan, spec, ...companions, reportPath, receiptPath, "project/critical-human-proof.json", "architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md", "docs/adr/.gitkeep", NEUTRAL_MANIFEST);
  gitOk("commit", "-q", "-m", "finished design");
  if (process.platform === "win32") {
    const hardened = hardenWindowsPrivateDirectory(join(root, "project"));
    assert.equal(hardened.status, "secure", `SETUP harden the State parent: ${JSON.stringify(hardened)}`);
  }
  lifecycle(["set-feature", "--id", feature, "--plan-path", plan]);
  const continuity = { schema: "pipeline.continuity.v0", featureId: feature, revision: 0, runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: source(plan), spec: source(spec), result: null }, queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeJson("continuity-init-request.json", continuity);
  lifecycle(["continuity-init", "--expected-revision", "absent", "--request-file", "continuity-init-request.json", "--lock-token", "design-approval-fixture-token"]);
  lifecycle(["submit-plan", "--by", "synthetic-author", "--profile", "feature"]);
  const presentOut = lifecycle(["present-plan", "--by", "synthetic-presenter", "--review-receipt", receiptPath]);
  const observed = readState(root);
  assert.equal(observed.status, "ok");
  const requestRel = observed.state.planPresentation.designApprovalRequestPath;
  assert.equal(typeof requestRel, "string", "present-plan records the design approval request path");
  return { root, keys, presentOut, requestRel, request: JSON.parse(read(requestRel).toString("utf8")), candidate: gitOk("rev-parse", "HEAD") };
}
const designPresentation = () => (designPresentationRun ??= buildDefaultModeDesignPresentation());

test("AC-264: the default-mode present-plan hands the PO exactly one sign-intent command, in the absolute --request form, with no guard-override wording", () => {
  const f = designPresentation();
  const lines = f.presentOut.split(/\r?\n/u).filter((line) => /sign-intent/u.test(line));
  assert.equal(lines.length, 1, `exactly one line names sign-intent; output: ${f.presentOut}`);
  const requestFlag = /--request\s+"([^"]+)"/u.exec(lines[0]);
  assert.ok(requestFlag, `the sign command carries --request "<path>": ${lines[0]}`);
  assert.ok(isAbsolute(requestFlag[1]), "the --request path is absolute");
  assert.equal(requestFlag[1], resolve(f.root, f.requestRel), "it names the request file present-plan recorded");
  assert.ok(existsSync(requestFlag[1]), "the named request file exists");
  assert.match(lines[0], /--repo-root\s+"[^"]+"/u, "the repository is named absolutely too, so a paste works from any directory");
  assert.equal(f.request.schema, "pipeline.design-approval-request.v1");
  assert.doesNotMatch(f.presentOut, /--intent-sha256/u, "the bare digest form is never handed to the PO for a design approval");
  assert.doesNotMatch(f.presentOut, /HGO-|no recorded request resolves|guard[- ]override/iu, "the present-plan output carries no guard-override code or warning");
});

test("AC-264: signing through that command discloses the design purpose: no HGO- code, no unresolved-request fallback, no typed confirmation", () => {
  const f = designPresentation();
  const withPassphrase = (args) => (args[0] === "pkeyutl" && args.includes("-sign") ? [...args, "-passin", "env:PIPELINE_SYNTHETIC_FIXTURE_PASSPHRASE"] : args);
  const prompts = [], written = [], realWrite = process.stdout.write;
  process.env.PIPELINE_SYNTHETIC_FIXTURE_PASSPHRASE = DESIGN_PASSPHRASE;
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  let result;
  try {
    result = runHumanApproval(["sign-intent", "--repo-root", f.root, "--directory", f.keys, "--request", resolve(f.root, f.requestRel)],
      { isTTY: true, readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; }, spawn: (_name, args, options) => spawnOpenssl(withPassphrase(args), options, {}) });
  } finally { process.stdout.write = realWrite; delete process.env.PIPELINE_SYNTHETIC_FIXTURE_PASSPHRASE; }
  assert.equal(result.ok, true, JSON.stringify(result));
  const disclosure = written.join("");
  assert.equal(prompts.length, 0, "an encrypted key asks the PO for no typed confirmation: the one command is the whole ceremony");
  assert.match(disclosure, /action: approve the exact reviewed design-to-implementation plan decision/u);
  assert.ok(disclosure.includes(f.request.bindingSha256), "the disclosure names the design binding digest");
  assert.ok(disclosure.includes(f.candidate), "the disclosure names the candidate commit");
  assert.doesNotMatch(disclosure, /HGO-/u, "no guard-override (HGO-) code reaches the PO");
  assert.doesNotMatch(disclosure, /no recorded request resolves|purpose unavailable/u, "the unresolved-request fallback is never shown for a design approval");
});

test("RED mirror: the bare --intent-sha256 form (no resolvable request) discloses the guard-override fallback this pin forbids", () => {
  const fallback = compactSigningDisclosure({ intentSha256: "a".repeat(64), record: null }).join("\n");
  assert.match(fallback, /no recorded request resolves for this digest/u);
  assert.match(fallback, /guard-lift\/guard-override authorization/u);
});

// ---------------------------------------------------------------------------------------------------------------------
// Added 0.7.0 acceptance of the item (observed 2026-10-17 P0-1 and 2026-10-20 D64): a typed absent-course result with a
// repair, a course writer that binds a German-table Spec and `.test.js` checks without reformatting the signed bytes,
// the delivery hand-off proven at plan readiness, and onboarding answers that survive the restart. Each case drives the
// real module on a disposable root under scratch/. A case whose acceptance is not met on this head is a `todo` that names
// the missing piece and flips to a normal passing case once it is delivered; nothing here is a silent skip.
// ---------------------------------------------------------------------------------------------------------------------
const GERMAN_TABLE = [
  "| Nr. | Kriterium |", "| --- | --- |",
  "| 1 | Das System speichert jede Bestellung mit Zeitstempel. |",
  "| R-2 | Das System zeigt den Warenkorb mit allen gewählten Produkten an. |",
];
const germanSpec = (...extra) => ["# Spezifikation Bestell-App", "", "## Abnahmekriterien", "", ...GERMAN_TABLE, "", ...extra, ""].join("\n");
const hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const acceptanceRoots = [];
after(() => { for (const path of acceptanceRoots) rmSync(path, { recursive: true, force: true, maxRetries: 3 }); });

/** A disposable Git root under the repository's fixture parent (the authority walk refuses a group-writable ancestor such as /tmp). */
function gitRoot(label) {
  const root = mkdtempSync(join(nativeContractFixtureParent(), `tri-${label}-`));
  acceptanceRoots.push(root);
  const config = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", `core.hooksPath=${devNull}`, "-c", "commit.gpgsign=false"];
  for (const args of [["init", "-q", root], ["-C", root, ...config, "commit", "--allow-empty", "-q", "-m", "fixture"]]) {
    const out = spawnSync("git", args, { encoding: "utf8" });
    assert.equal(out.status, 0, `SETUP git ${args[0]}: ${out.stderr}`);
  }
  return root;
}
function enroll(root) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") });
  const decision = controller.planDecision({ rootDir: root, decision: "enroll", by: "tri-acceptance-fixture" });
  assert.equal(controller.applyDecision(decision, { activate: true, planSha256: decision.planSha256 }).state, "active", "SETUP governance enrollment");
}
function writeIn(root, path, text) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }

test("AC-264 added (P0-1): an approved feature without a delivery course reports a typed absent course with a repair, and an unsafe course file still fails closed", () => {
  const root = gitRoot("absent");
  enroll(root);
  writeIn(root, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\n");
  writeIn(root, ".claude/pipeline-state.json", JSON.stringify({ schema: "pipeline.state.v0", activeFeature: { id: "unit", planPath: "specs/unit/plan.md", phase: "implementation" }, planApproved: true }));
  mkdirSync(join(root, "specs/unit"), { recursive: true });
  const absent = resolveGovernedItemQueue({ root });
  assert.equal(absent.status, "refused");
  assert.equal(absent.code, "SQ-DELIVERY-COURSE-ABSENT");
  assert.notEqual(absent.code, "SQ-DELIVERY-STATE-UNAVAILABLE", "the absent course is not reported as the generic unavailable state");
  assert.match(absent.repair, /slice-queue\.json/u);
  assert.match(absent.repair, /prepareGovernedItemQueue/u, "the repair names the governed course writer");
  symlinkSync(join(root, "nowhere.json"), join(root, "specs/unit/slice-queue.json"));
  assert.equal(resolveGovernedItemQueue({ root }).code, "SQ-DELIVERY-STATE-UNAVAILABLE", "only a missing file is an absent course");
});

test("AC-264 added (P0-1): the criterion scan binds numbered and R-n rows of a German table under a non-English heading and leaves the Spec bytes alone", () => {
  const text = germanSpec();
  const bytes = Buffer.from(text);
  const rows = scanAcceptedCriterionRows(text);
  assert.deepEqual(rows.map((row) => [row.id, row.normative]), [["AC-1", true], ["AC-2", true]]);
  assert.match(bytes.subarray(rows[0].startByte, rows[0].endByte).toString("utf8"), /Das System speichert jede Bestellung mit Zeitstempel\./u);
  assert.match(bytes.subarray(rows[1].startByte, rows[1].endByte).toString("utf8"), /Warenkorb/u);
  assert.equal(Buffer.from(text).equals(bytes), true, "the scan reads the bytes; it never rewrites them");
  assert.deepEqual(scanAcceptedCriterionRows(text.replace("## Abnahmekriterien", "## Beispiele")).filter((row) => row.normative === true), [],
    "RED mirror: the same table under a non-acceptance heading binds nothing");
});

test("AC-264 added (P0-1): the item delivery briefing admits the project's own .test.js check files and refuses other suffixes and shapes", () => {
  const text = germanSpec();
  const bytes = Buffer.from(text);
  const [row] = scanAcceptedCriterionRows(text);
  const locator = { schema: "pipeline.critic-criterion-locator.v1", sourcePath: "specs/orders/spec.md", sourceSha256: hex(bytes), criterionId: row.id,
    startByte: row.startByte, endByte: row.endByte, excerptSha256: hex(bytes.subarray(row.startByte, row.endByte)) };
  const briefing = (path) => ({ schema: "pipeline.item-delivery-briefing.v1", sliceId: "slice-1", itemId: "item-1", criterionLocator: locator,
    checks: [{ id: "check-1", path, dependencies: [path] }] });
  for (const path of ["tests/orders.test.js", "tests/orders.test.mjs", "tests/orders.test.cjs"]) assert.equal(validateItemDeliveryBriefing(briefing(path)).ok, true, path);
  for (const path of ["tests/orders.spec.js", "tests/orders.test.ts", "../orders.test.js", "/abs/orders.test.js"]) assert.equal(validateItemDeliveryBriefing(briefing(path)).ok, false, path);
});

test("AC-264 added (P0-1): plan readiness proves the delivery hand-off from the Spec bytes: a German table with .test.js checks is ready, a Spec without a criterion row is refused before approval", () => {
  const root = gitRoot("handoff");
  enroll(root);
  writeIn(root, "specs/orders/spec.md", germanSpec("## Prüfungen", "", "- tests/orders.test.js (vorhanden)", "- tests/neu.test.js (noch nicht vorhanden)"));
  writeIn(root, "tests/orders.test.js", "// present\n");
  const ready = inspectPlanDeliveryHandoff({ rootDir: root, specPath: "specs/orders/spec.md", expectedSpecSha256: hex(readFileSync(join(root, "specs/orders/spec.md"))) });
  assert.equal(ready.ok, true, JSON.stringify(ready));
  assert.equal(ready.code, "PLR-HANDOFF-READY");
  assert.deepEqual(ready.admittedCriteria, ["AC-1", "AC-2"]);
  assert.deepEqual(ready.checks, [{ path: "tests/neu.test.js", state: "absent" }, { path: "tests/orders.test.js", state: "present" }]);
  writeIn(root, "specs/empty/spec.md", "# Spezifikation\n\nKeine Kriterien hier.\n");
  const refused = inspectPlanDeliveryHandoff({ rootDir: root, specPath: "specs/empty/spec.md", expectedSpecSha256: hex(readFileSync(join(root, "specs/empty/spec.md"))) });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "PLR-HANDOFF-NO-CRITERION");
});

// The shipped briefing generator is the route a delivery dispatch takes from a signed Spec to the course writer's input
// (`prepareGovernedItemQueue` re-runs `parseAcceptedCriticCriterion` on the locator it is handed). Driven through the real
// `runDispatchBriefing` with injected host facts only (no git, no preflight): the behaviour under test is the generator's own.
const BRIEFING_SPEC = "specs/orders/spec.md";
function briefingFor(specText, criterion, check) {
  const root = mkdtempSync(join(tmpdir(), "tri-briefing-"));
  const agentsDir = mkdtempSync(join(tmpdir(), "tri-briefing-agents-"));
  acceptanceRoots.push(root, agentsDir);
  writeIn(root, BRIEFING_SPEC, specText);
  writeFileSync(join(agentsDir, "goldfish-implementor.md"), "---\nname: goldfish-implementor\nmodel: sonnet\neffort: medium\nmaxTurns: 50\n---\nFixture agent body.\n");
  const deps = {
    agentsDir,
    observePreflight: () => ({ rulesetSource: { selectedPlugin: { id: "pipeline-core", version: "9.9.9+test" }, loadedIdentity: { status: "available", algorithm: "content-sha256", value: "ab".repeat(32) }, installedIdentity: { status: "unavailable" } } }),
    git: (_root, args) => (args[0] === "status" ? "" : args[1] === "HEAD^{tree}" ? "2".repeat(40) : "1".repeat(40)),
    resolveBaseline: () => ({ status: "ready", entries: [] }),
    defaultSpecPath: () => null,
  };
  const argv = ["binding", "--root", root, "--dispatch-id", "ORD-1", "--item", "store-order", "--agent-type", "goldfish-implementor", "--model-id", "claude-sonnet-5-5",
    "--check", check, "--path", "src/orders.js", "--spec", BRIEFING_SPEC, ...(criterion === null ? [] : ["--criterion", criterion])];
  return import("../../scripts/dispatch-briefing.mjs").then(({ runDispatchBriefing }) => ({ result: runDispatchBriefing(argv, deps), bytes: Buffer.from(specText) }));
}
const GERMAN_AC_SPEC = ["# Spezifikation Bestell-App", "", "## Abnahmekriterien", "", "| # | Criterion | Evidence |", "| --- | --- | --- |",
  "| AC-1 | WENN ein Besucher das Bestellformular absendet, SPEICHERT das System die Bestellung mit Zeitstempel | Bestelltests |", ""].join("\n");

test("AC-264 added (P0-1): the briefing generator binds a German-text criterion to a .test.js check, and refuses a missing criterion row early with the supported shapes as its repair", async () => {
  const bound = await briefingFor(GERMAN_AC_SPEC, "AC-1", "tests/orders.test.js");
  assert.equal(bound.result.ok, true, JSON.stringify(bound.result));
  const { itemDelivery } = bound.result.binding;
  assert.equal(validateItemDeliveryBriefing(itemDelivery).ok, true);
  assert.deepEqual(itemDelivery.checks[0].dependencies.includes("tests/orders.test.js"), true, "the project's own .test.js convention is admitted");
  assert.match(bound.bytes.subarray(itemDelivery.criterionLocator.startByte, itemDelivery.criterionLocator.endByte).toString("utf8"), /Bestellformular/u);
  const wrongSuffix = (await briefingFor(GERMAN_AC_SPEC, "AC-1", "tests/orders.spec.js")).result;
  assert.equal(wrongSuffix.code, "DBG-CHECK-NOT-TEST", "RED mirror: a non-test suffix is still refused");
  const none = "# Spezifikation\n\nKeine Kriterien hier.\n";
  const missing = (await briefingFor(none, "AC-1", "tests/orders.test.js")).result;
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "DBG-CRITERION-MISSING");
  assert.ok(missing.message.includes("AC-1") && missing.message.includes(BRIEFING_SPEC) && missing.message.includes("first cell"), "the refusal names the criterion, the Spec and the supported shapes");
  assert.equal(missing.skeleton, undefined, "no briefing skeleton is handed out after a refusal");
  assert.equal((await briefingFor(none, null, "tests/orders.test.js")).result.code, "DBG-AC-ROW-MISSING", "without --criterion the Alfred row is required and its absence is typed");
});

// Was a typed todo (the generator's table branch matched only a first cell equal to the AC id although the host parser maps `n` / `R-n` to AC-n);
// delivered by the findCriterionOccurrences two-column row mapping in scripts/dispatch-briefing.mjs, so the case is strict.
test("AC-264 added (P0-1): the briefing generator binds a numbered or R-n row of a two-column German table, so the signed bytes need no reformatting", async () => {
  for (const id of ["AC-1", "AC-2"]) {
    const { result, bytes } = await briefingFor(germanSpec(), id, "tests/orders.test.js");
    assert.equal(result.ok, true, `${id}: ${result.code}`);
    assert.match(bytes.subarray(result.binding.itemDelivery.criterionLocator.startByte, result.binding.itemDelivery.criterionLocator.endByte).toString("utf8"), id === "AC-1" ? /Zeitstempel/u : /Warenkorb/u);
  }
});

/** The body of one `case "<verb>": { ... }` handler of the lifecycle CLI, up to the next top-level case label. */
function lifecycleHandler(source, verb) {
  const start = source.indexOf(`    case "${verb}": {`);
  if (start < 0) return "";
  const next = source.indexOf('\n    case "', start + 10);
  return source.slice(start, next < 0 ? source.length : next);
}
const pipelineStateSource = readFileSync(join(PLUGIN, "scripts", "pipeline-state.mjs"), "utf8");
const handoffWired = ["submit-plan", "present-plan"].every((verb) => lifecycleHandler(pipelineStateSource, verb).includes("inspectPlanDeliveryHandoff"));
test("AC-264 added (P0-1): submit-plan and present-plan call the plan-readiness hand-off inspection, so the failure cannot first appear after approval", {
  todo: handoffWired ? false : "deferred to 0.7.x by PO decision D85 (owner Coordinator, due 2026-10-31): the call sites in scripts/pipeline-state.mjs (protected) are not built; lib/plan-handoff-readiness.mjs is delivered and covered above but has no caller, so plan readiness does not yet enforce the hand-off.",
}, () => {
  for (const verb of ["submit-plan", "present-plan"]) {
    assert.ok(lifecycleHandler(pipelineStateSource, verb).includes("inspectPlanDeliveryHandoff"), `${verb} must call inspectPlanDeliveryHandoff before the PO is asked to sign`);
  }
  assert.equal(lifecycleHandler(pipelineStateSource, "approve-plan").includes("inspectPlanDeliveryHandoff"), false, "never at approval: a refusal there would burn the signature");
});

/** A fresh Codex onboarding root through the real portable apply (the shared fakeDeps answers only the machine facts). */
function codexOnboardedRoot() {
  const scratch = join(DESIGN_REPO_ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "tri-intake-"));
  acceptanceRoots.push(root);
  const portable = planProjectOnboardingV3({ rootDir: root, deps: machineDeps, runner: "codex" });
  assert.equal(portable.status, "ready", JSON.stringify(portable.diagnostics));
  assert.equal(applyProjectOnboardingV3(portable, { rootDir: root, activate: true, deps: machineDeps }).status, "applied");
  return root;
}
const intakeAnswers = { gitAuthor: { name: "Test Owner", email: "owner@example.invalid" }, language: "de", profile: "feature" };

test("AC-264 added (D64): the answers live in one typed intake record, the first Codex restart is not offered before it is complete, and a fresh process reads the same record", () => {
  const root = codexOnboardedRoot();
  const runtimePlan = () => planProjectOnboardingLifecycleV4({ rootDir: root, deps: machineDeps, operation: "runtime", runner: "codex" });
  assert.equal(runtimePlan().status, "intake-required", "no restart plan is offered while the intake record is missing");
  const applied = applyOnboardingIntakeConsent({ rootDir: root, granted: true, ...intakeAnswers, text: "Build a local keyboard game.\n", activate: true });
  assert.equal(applied.status, "applied");
  const settled = runtimePlan();
  assert.equal(settled.status, "runtime-initialization-required", JSON.stringify(settled.diagnostics));
  assert.equal(settled.runtime.firstRestartIntake.status, "captured", "the restart is offered only once the material is captured and read back");
  const stored = readOnboardingIntakeCheckpoint({ rootDir: root });
  assert.equal(stored.status, "present");
  assert.deepEqual(stored.value.values, intakeAnswers);
  // A restart is a new process: nothing in this process's memory may be what carries the answers.
  const reader = pathToFileURL(resolve(PLUGIN, "lib", "onboarding-continuity.mjs")).href;
  const script = `import { readOnboardingIntakeCheckpoint } from ${JSON.stringify(reader)};const r = readOnboardingIntakeCheckpoint({ rootDir: ${JSON.stringify(root)} });process.stdout.write(JSON.stringify({ status: r.status, values: r.value.values, consent: r.value.consent !== null, material: r.value.materialInput.length }));`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 60000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { status: "present", values: intakeAnswers, consent: true, material: 1 });
});

test("AC-264 added (D64): the next session does not ask again for an answer the intake record already holds", {
  todo: "BLOCKED-NEEDS-DECISION (owner Coordinator, due 2026-10-31; measured on this head): the intake record keeps the language and the pending-ask computation honours it, but it still publishes gitAuthorName and gitAuthorEmail as pending asks after the record holds the Git author. lib/project-onboarding-v3.mjs sits exactly on its architecture line bound (7807 lines), so a fix there must first move code out of that file.",
}, () => {
  const root = codexOnboardedRoot();
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, ...intakeAnswers, text: "Build a local keyboard game.\n", activate: true });
  const inspected = inspectProjectOnboardingV3({ rootDir: root, deps: machineDeps, runner: "codex" });
  const asked = (inspected.nextAction?.pendingAsks ?? []).flatMap((ask) => (ask.inputs ?? []).map((input) => input.name));
  assert.equal(asked.includes("language"), false, "the language held by the record is not asked again");
  assert.equal(asked.includes("gitAuthorName") || asked.includes("gitAuthorEmail"), false, `the Git author held by the record is not asked again: ${asked.join(",")}`);
});

test("E: per-runner end-to-end greenfield scenario (Claude Windows, Codex, Antigravity) reaches a pushed branch with exactly two PO proofs and zero guard overrides",
  { skip: "E-HOLD pipeline.three-runner-happy-path-with-two-po-approvals: needs genuine installed host runs per runner (native/installed host evidence); not producible in-repo" },
  () => {});
