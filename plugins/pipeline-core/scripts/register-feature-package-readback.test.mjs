// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PUSH_THREAT_MODEL_FILE } from "../lib/close-chain-guide.mjs";
import { PUSH_THREAT_MODEL_GATE_SCHEMA, pushThreatModelRefusalText, pushThreatModelVerdict } from "../lib/push-threat-model-gate.mjs";
import {
  PUSH_THREAT_MODEL_UNCHANGED_MARKER, collectPushThreatModelFacts, isPushThreatModelTemplateUnchanged, renderPushThreatModel,
} from "../lib/push-threat-model-materialize.mjs";
import { registerFeaturePackage } from "../lib/feature-package-registration.mjs";
import { validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import { PLAN_SUBMISSION_SCHEMA, RETAINED_APPROVAL_SCHEMA, sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import { REGISTER_FEATURE_PACKAGE_HELP, pushThreatModelReadback, runRegisterFeaturePackage } from "./register-feature-package.mjs";

const SHIPPED_TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "default-push-threat-model.md");

const roots = [];
test.after(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });
const tempRoot = () => { const dir = mkdtempSync(join(tmpdir(), "rfp-")); roots.push(dir); return dir; };

test("RFPR1: a missing push threat model is reported with the command and where its output belongs", () => {
  const readback = pushThreatModelReadback(tempRoot());
  assert.equal(readback.path, "project/push-threat-model.md");
  assert.equal(readback.path, PUSH_THREAT_MODEL_FILE);
  assert.equal(readback.present, false);
  assert.equal(readback.materializeCommand, "node <plugin-root>/scripts/pipeline-state.mjs materialize-push-threat-model");
  assert.match(readback.commitWith, /same draft commit/u);
  assert.match(readback.commitWith, /before the item binding/u);
  assert.match(readback.why, /second round/u);
});

test("RFPR2: an existing push threat model is reported present and names no command", () => {
  const root = tempRoot();
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, PUSH_THREAT_MODEL_FILE), "# threat model\n");
  assert.deepEqual(pushThreatModelReadback(root), { path: "project/push-threat-model.md", present: true });
});

test("RFPR3: the readback is advice only and writes nothing", () => {
  const root = tempRoot();
  pushThreatModelReadback(root);
  pushThreatModelReadback(root);
  assert.throws(() => writeFileSync(join(root, "project", "x"), "x"), /ENOENT/u, "no project directory was created by the readback");
});

// D4a enforcement (candidate 19): the decision the plan approval request, push-prepare and the close coordinator share. Real project directories.
const manifest = (approval) => `schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\nphases:\n  - name: design\n    enabled: true\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: ${approval}\n`;
function project({ approval = null, model = null } = {}) {
  const root = tempRoot();
  if (approval !== null) {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.yaml"), manifest(approval));
  }
  if (model !== null) {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, PUSH_THREAT_MODEL_FILE), model);
  }
  return root;
}

test("PTG1: a project without an active push approval is never refused, whatever the threat model file looks like", () => {
  for (const root of [project(), project({ approval: "none" }), project({ model: "" })]) {
    const verdict = pushThreatModelVerdict(root);
    assert.equal(verdict.schema, PUSH_THREAT_MODEL_GATE_SCHEMA);
    assert.equal(verdict.active, false);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.code, null);
  }
});

test("PTG2: an active push approval with no threat model file is refused with a typed code, the creating command and the commit rule", () => {
  const verdict = pushThreatModelVerdict(project({ approval: "required" }));
  assert.equal(verdict.active, true);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "PUSH-THREAT-MODEL-MISSING");
  assert.equal(verdict.path, "project/push-threat-model.md");
  assert.equal(verdict.repair.command, "node <plugin-root>/scripts/pipeline-state.mjs materialize-push-threat-model");
  assert.match(verdict.repair.commitRule, /same draft commit/u);
  assert.match(verdict.repair.commitRule, /before the item binding/u);
});

test("PTG3: an empty or blank threat model file is refused as empty, and the repair does not offer the command that refuses an existing file", () => {
  for (const content of ["", "   \n\t\n"]) {
    const verdict = pushThreatModelVerdict(project({ approval: "required", model: content }));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "PUSH-THREAT-MODEL-EMPTY");
    assert.ok(!verdict.repair.command.includes("materialize-push-threat-model"), "materialize refuses while the file exists");
    assert.match(verdict.repair.command, /default-push-threat-model\.md/u);
  }
});

test("PTG4: a threat model without any markdown heading, and a directory at the path, are refused as invalid", () => {
  assert.equal(pushThreatModelVerdict(project({ approval: "required", model: "just one line of prose, no heading\n" })).code, "PUSH-THREAT-MODEL-INVALID");
  const directory = project({ approval: "required" });
  mkdirSync(join(directory, PUSH_THREAT_MODEL_FILE), { recursive: true });
  assert.equal(pushThreatModelVerdict(directory).code, "PUSH-THREAT-MODEL-INVALID");
});

test("PTG5: a present threat model passes: a handwritten one and the shipped template copy", () => {
  const written = pushThreatModelVerdict(project({ approval: "required", model: "# Threat model\n\nwhat a signature binds\n" }));
  assert.deepEqual({ ok: written.ok, code: written.code, active: written.active }, { ok: true, code: null, active: true });
  const copied = project({ approval: "required" });
  mkdirSync(join(copied, "project"), { recursive: true });
  copyFileSync(SHIPPED_TEMPLATE, join(copied, PUSH_THREAT_MODEL_FILE));
  assert.equal(pushThreatModelVerdict(copied).ok, true);
});

// AC-108 (closest accepted criterion), CGR-18 / CGF-19 (candidate 22): an unchanged template is named, and blocks only in the critical profile.
const withCalibration = (root, calibration) => { mkdirSync(join(root, "project"), { recursive: true }); writeFileSync(join(root, "project", "pipeline.json"), JSON.stringify(calibration)); return root; };

test("PTG8: the unchanged shipped template passes outside the critical profile but is named template-unchanged, also with CRLF line ends", () => {
  const template = readFileSync(SHIPPED_TEMPLATE, "utf8");
  for (const model of [template, template.replace(/\n/gu, "\r\n")]) {
    const verdict = pushThreatModelVerdict(withCalibration(project({ approval: "required", model }), { project: "p", stakes: "standard" }));
    assert.equal(verdict.ok, true);
    assert.equal(verdict.templateState, "template-unchanged");
    assert.match(verdict.notice, /template-unchanged/u);
  }
  const written = pushThreatModelVerdict(project({ approval: "required", model: "# Threat model\n\nwhat a signature binds\n" }));
  assert.equal(Object.hasOwn(written, "templateState"), false);
  assert.equal(Object.hasOwn(written, "notice"), false);
});

test("PTG9: in the critical profile an unchanged template is refused with a typed code, a repair that does not offer materialize, and the commit rule", () => {
  const verdict = pushThreatModelVerdict(withCalibration(project({ approval: "required", model: readFileSync(SHIPPED_TEMPLATE, "utf8") }), { project: "p", stakes: "critical" }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "PUSH-THREAT-MODEL-TEMPLATE-UNCHANGED");
  assert.equal(verdict.templateState, "template-unchanged");
  assert.ok(!verdict.repair.command.includes("materialize-push-threat-model"));
  assert.match(pushThreatModelRefusalText(verdict, "the close"), /template-unchanged/u);
  const handwritten = pushThreatModelVerdict(withCalibration(project({ approval: "required", model: "# Threat model\n\nwhat a signature binds\n" }), { project: "p", stakes: "critical" }));
  assert.equal(handwritten.ok, true);
});

test("PTG10: materialising fills every project-known field and leaves one marked judgement section; deleting the marker is the agent's claim that it is written", () => {
  const root = withCalibration(project({ approval: "required" }), { project: "demo-project", stakes: "critical", repositoryMode: "remote-tracked" });
  const facts = collectPushThreatModelFacts(root, { branch: "main", remotes: ["origin"], approvalMode: "signature" });
  assert.deepEqual(facts, {
    project: "demo-project", stakes: "critical", repositoryMode: "remote-tracked", pushApproval: "required", approvalMode: "signature",
    checkpointNamespace: null, branch: "main", remotes: ["origin"],
  });
  const template = readFileSync(SHIPPED_TEMPLATE, "utf8");
  const rendered = renderPushThreatModel(template, facts);
  assert.ok(rendered.startsWith(template), "the shipped template stays whole and first");
  for (const value of ["demo-project", "critical", "remote-tracked", "required", "signature", "main", "origin"]) assert.ok(rendered.includes(value), value);
  assert.equal(rendered.split(PUSH_THREAT_MODEL_UNCHANGED_MARKER).length, 2, "exactly one marker");
  assert.equal(isPushThreatModelTemplateUnchanged(rendered, template), true);
  assert.equal(isPushThreatModelTemplateUnchanged(rendered.replace(`${PUSH_THREAT_MODEL_UNCHANGED_MARKER}\n`, ""), template), false);
  assert.equal(isPushThreatModelTemplateUnchanged(template, template), true);
  assert.equal(pushThreatModelVerdict(withCalibration(project({ approval: "required", model: rendered }), { project: "p", stakes: "critical" })).code, "PUSH-THREAT-MODEL-TEMPLATE-UNCHANGED");
  assert.equal(renderPushThreatModel(template, { ...facts, remotes: [], branch: null }).includes("not set"), true, "an unknown fact reads as not set, never invented");
});

test("PTG6: the refusal text carries the code, the path, the repair command and the commit rule; a passing verdict has no text", () => {
  const text = pushThreatModelRefusalText(pushThreatModelVerdict(project({ approval: "required" })), "the close");
  assert.match(text, /PUSH-THREAT-MODEL-MISSING/u);
  assert.match(text, /project\/push-threat-model\.md/u);
  assert.match(text, /pipeline-state\.mjs materialize-push-threat-model/u);
  assert.match(text, /same draft commit/u);
  assert.match(text, /the close/u);
  assert.equal(pushThreatModelRefusalText(pushThreatModelVerdict(project())), null);
});

test("PTG7: the verdict reads the file system only: it creates nothing and never throws", () => {
  const root = project({ approval: "required" });
  pushThreatModelVerdict(root);
  assert.equal(pushThreatModelVerdict(root).code, "PUSH-THREAT-MODEL-MISSING", "still missing after two reads");
  assert.equal(existsSync(join(root, "project")), false, "no directory was created");
  assert.equal(pushThreatModelVerdict(join(root, "no-such-directory")).ok, true, "an unreadable root has no active push approval");
});

// C30I-S3 (queue C30-12; AC-108 is the closest accepted criterion): `register-feature-package.mjs --supersedes <predecessor feature id>` writes the relation of the
// successor of a DISCARDED feature at registration, so the Critic course no longer depends on the review-time `--successor-of` alone. Neutral ids only.
// Seam (named, not hidden): the envelope reader is a stub with the real reader's contract (CAC-REGISTRATION-INVALID until the manifest lists the envelope, then ok);
// the real reader resolves the manifest through validateFeaturePackage, which these cases run on the written manifest.
const SUCCESSOR = "feature-b";
const PREDECESSOR = "feature-a";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const put = (root, path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
function successorRoot() {
  const root = tempRoot();
  put(root, `specs/${SUCCESSOR}/prd.md`, "# PRD\n");
  put(root, `specs/${SUCCESSOR}/spec.md`, "# Spec\nAC-1 behavior\n");
  return root;
}
/** The State of an approved v9 plan for the successor; `tag` makes a second approval (a re-approval writes another envelope). */
function approvedState(root, { tag = "one", discarded = [PREDECESSOR] } = {}) {
  const planPath = `specs/${SUCCESSOR}/prd.md`, specPath = `specs/${SUCCESSOR}/spec.md`;
  const planSha256 = sha(readFileSync(join(root, planPath))), specSha256 = sha(readFileSync(join(root, specPath)));
  const envelope = Buffer.from(`${JSON.stringify({ featureId: SUCCESSOR, manifestPath: `specs/${SUCCESSOR}/lifecycle.json`, request: { binding: { sources: { companions: [] } } }, tag })}\n`);
  const envelopeSha256 = sha(envelope), envelopePath = `specs/${SUCCESSOR}/evidence/accepted-delivery-contract-${envelopeSha256}.json`;
  put(root, envelopePath, envelope);
  const planSubmission = { schema: PLAN_SUBMISSION_SCHEMA, featureId: SUCCESSOR, planPath, planSha256, specPath, specSha256, profile: "mini", profileSha256: "a".repeat(64), submittedBy: "fixture", submittedAt: "2026-10-24T00:00:00.000Z" };
  const poGateAuthority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: "b".repeat(64), runtimeSha256: "c".repeat(64), receiptSha256: "d".repeat(64), repositoryFingerprint: "e".repeat(64), planPath, planSha256, specPath, specSha256 };
  return {
    schema: "pipeline.state.v0", activeFeature: { id: SUCCESSOR, planPath, phase: "implementation" }, planSubmission, planApproved: true,
    planApproval: { schema: RETAINED_APPROVAL_SCHEMA, approvedBy: "fixture", approvedAt: "2026-10-24T00:01:00.000Z", submissionSha256: sha256CanonicalJson(planSubmission), profileSha256: "a".repeat(64), poGateAuthority,
      priorInvalidationSha256: null, designApprovalBinding: null, designApproval: null,
      acceptedContract: { schema: "pipeline.accepted-delivery-contract-reference.v1", path: envelopePath, sha256: envelopeSha256 } },
    discardedFeatures: discarded.map((id) => ({ id, planPath: `specs/${id}/prd.md`, phaseAtDiscard: "implementation", discardedAt: "2026-11-16T10:00:00.000Z", discardedBy: "Operator", reason: "abandoned", forCommit: null })),
  };
}
const manifestOf = (root) => join(root, `specs/${SUCCESSOR}/lifecycle.json`);
const envelopeReader = ({ dir, envelopePath }) => (existsSync(manifestOf(dir)) && readFileSync(manifestOf(dir), "utf8").includes(envelopePath) ? { ok: true, code: null } : { code: "CAC-REGISTRATION-INVALID" });
const register = (root, state, supersedes) => registerFeaturePackage({ root, state, readAcceptedDeliveryContract: envelopeReader, ...(supersedes === undefined ? {} : { supersedes }) });
const treeOf = (root) => readdirSync(join(root, "specs"), { recursive: true }).map(String).sort();
const sameBytes = (root) => readFileSync(manifestOf(root), "utf8");

test("SUP1: --supersedes writes the predecessor into the manifest of the successor and the topology validator accepts it", () => {
  const root = successorRoot();
  const result = register(root, approvedState(root), PREDECESSOR);
  assert.equal(result.status, "registered", JSON.stringify(result));
  assert.equal(JSON.parse(sameBytes(root)).supersedes, PREDECESSOR);
  assert.equal(validateFeaturePackage(root, `specs/${SUCCESSOR}/lifecycle.json`).ok, true);
  assert.match(result.choices.supersedes, /--supersedes <predecessor feature id>/u);
});

test("SUP2: without the flag the manifest is byte-identical to today's (supersedes null); the flagged one differs in exactly that line", () => {
  const plain = successorRoot(), flagged = successorRoot();
  assert.equal(register(plain, approvedState(plain)).status, "registered");
  assert.equal(register(flagged, approvedState(flagged), PREDECESSOR).status, "registered");
  assert.match(sameBytes(flagged), /\n  "supersedes": "feature-a"\n\}\n$/u);
  assert.match(sameBytes(plain), /\n  "supersedes": null\n\}\n$/u);
  assert.equal(sameBytes(flagged).replace(`"supersedes": "${PREDECESSOR}"`, '"supersedes": null'), sameBytes(plain));
  const absent = successorRoot();
  assert.equal(register(absent, approvedState(absent), null).status, "registered", "null means absent, as no flag");
  assert.equal(sameBytes(absent), sameBytes(plain));
});

test("SUP3: a predecessor the State does not record as discarded is refused with the repair, before any write", () => {
  for (const discarded of [[], ["feature-z"]]) {
    const root = successorRoot(), state = approvedState(root, { discarded });
    const before = treeOf(root);
    const result = register(root, state, PREDECESSOR);
    assert.equal(result.status, "refused", JSON.stringify(result));
    assert.equal(result.code, "FPR-SUPERSEDES-NOT-DISCARDED");
    assert.match(result.reason, /discard-feature/u);
    assert.match(result.reason, /without --supersedes/u);
    assert.deepEqual(treeOf(root), before, "nothing was written: no manifest, no generated acceptance or result");
    assert.equal(register(root, state).status, "registered", "the same package registers without the flag as an ordinary feature");
  }
});

test("SUP4: the feature's own id is refused, also when the State records it as discarded", () => {
  const root = successorRoot();
  const result = register(root, approvedState(root, { discarded: [SUCCESSOR, PREDECESSOR] }), SUCCESSOR);
  assert.equal(result.code, "FPR-SUPERSEDES-SELF", JSON.stringify(result));
  assert.equal(existsSync(manifestOf(root)), false);
});

test("SUP5: an id that is no feature id of the course admission, or no safe feature id of the manifest topology, is refused", () => {
  for (const bad of ["Not A Feature", "", "../x", "Feature_A", 7, {}]) {
    const root = successorRoot();
    const result = register(root, approvedState(root), bad);
    assert.equal(result.code, "FPR-SUPERSEDES-PATTERN", `${JSON.stringify(bad)}: ${JSON.stringify(result)}`);
    assert.equal(existsSync(manifestOf(root)), false);
  }
});

test("SUP6: the same flag twice is the same no-op as today, and a rerun without the flag changes nothing either", () => {
  const root = successorRoot(), state = approvedState(root);
  assert.equal(register(root, state, PREDECESSOR).status, "registered");
  const once = sameBytes(root);
  assert.equal(JSON.parse(once).supersedes, PREDECESSOR);
  const again = register(root, state, PREDECESSOR);
  assert.equal(again.status, "already-registered", JSON.stringify(again));
  assert.equal(sameBytes(root), once);
  assert.equal(register(root, state).status, "already-registered");
  assert.equal(sameBytes(root), once);
});

test("SUP7: another value for a manifest that holds a relation is refused with a typed repair; an approved manifest is never edited", () => {
  const root = successorRoot(), state = approvedState(root, { discarded: [PREDECESSOR, "feature-c"] });
  assert.equal(register(root, state, PREDECESSOR).status, "registered");
  const once = sameBytes(root);
  const result = register(root, state, "feature-c");
  assert.equal(result.code, "FPR-SUPERSEDES-CONFLICT", JSON.stringify(result));
  assert.match(result.reason, new RegExp(PREDECESSOR, "u"));
  assert.equal(sameBytes(root), once);
});

test("SUP8: a manifest registered earlier with supersedes null plus the flag later is refused and the repair names --successor-of at review time", () => {
  const root = successorRoot(), state = approvedState(root);
  assert.equal(register(root, state).status, "registered");
  const once = sameBytes(root);
  const result = register(root, state, PREDECESSOR);
  assert.equal(result.code, "FPR-SUPERSEDES-LATE", JSON.stringify(result));
  assert.match(result.reason, /--successor-of <feature id of the discarded predecessor>/u);
  assert.equal(sameBytes(root), once);
});

test("SUP9: a re-approval rebuilds a flagged manifest only with the same flag: the relation is carried, never dropped, never changed", () => {
  const root = successorRoot();
  assert.equal(register(root, approvedState(root), PREDECESSOR).status, "registered");
  const second = approvedState(root, { tag: "two", discarded: [PREDECESSOR, "feature-c"] });
  const once = sameBytes(root);
  assert.equal(register(root, second).code, "FPR-MANIFEST-CONFLICT", "without the flag the rebuild stays refused, as today");
  assert.equal(register(root, second, "feature-c").code, "FPR-SUPERSEDES-CONFLICT");
  assert.equal(sameBytes(root), once);
  const rebuilt = register(root, second, PREDECESSOR);
  assert.equal(rebuilt.status, "registered", JSON.stringify(rebuilt));
  assert.equal(JSON.parse(sameBytes(root)).supersedes, PREDECESSOR);
  assert.equal(validateFeaturePackage(root, `specs/${SUCCESSOR}/lifecycle.json`).ok, true);
});

test("SUP10: the CLI accepts exactly --root <root> --supersedes <id> as the new shape, names it in the help, and refuses every other composition FPR-ARGS", () => {
  const root = tempRoot();
  const run = (argv) => { let text = ""; const code = runRegisterFeaturePackage(argv, (chunk) => { text += chunk; }); return { code, out: JSON.parse(text) }; };
  assert.notEqual(run(["--root", root, "--supersedes", PREDECESSOR]).out.code, "FPR-ARGS", "the shape is accepted (the State is the next refusal)");
  for (const argv of [["--supersedes", PREDECESSOR, "--root", root], ["--root", root, "--supersedes"], ["--root", root, "--supersedes", "--stage"], ["--root", root, "--supersedes", PREDECESSOR, "extra"],
    ["--root", root, "--add-review-unit", "--supersedes", PREDECESSOR], ["--root", root, "--supersedes", PREDECESSOR, "--add-review-unit"]]) {
    const refusal = run(argv);
    assert.equal(refusal.code, 2); assert.equal(refusal.out.code, "FPR-ARGS", JSON.stringify(argv));
  }
  assert.match(REGISTER_FEATURE_PACKAGE_HELP, /--root <root> --supersedes <predecessor feature id>/u);
  assert.match(REGISTER_FEATURE_PACKAGE_HELP, /discard-feature/u);
});
