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
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readState, run } from "../../scripts/pipeline-state.mjs";
import { compactSigningDisclosure, runHumanApproval, spawnOpenssl } from "../../scripts/po-human-approval.mjs";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { applyOnboardingIntakeConsent } from "../onboarding-continuity.mjs";
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

test("E: per-runner end-to-end greenfield scenario (Claude Windows, Codex, Antigravity) reaches a pushed branch with exactly two PO proofs and zero guard overrides",
  { skip: "E-HOLD pipeline.three-runner-happy-path-with-two-po-approvals: needs genuine installed host runs per runner (native/installed host evidence); not producible in-repo" },
  () => {});
