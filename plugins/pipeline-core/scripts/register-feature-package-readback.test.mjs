// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PUSH_THREAT_MODEL_FILE } from "../lib/close-chain-guide.mjs";
import { PUSH_THREAT_MODEL_GATE_SCHEMA, pushThreatModelRefusalText, pushThreatModelVerdict } from "../lib/push-threat-model-gate.mjs";
import {
  PUSH_THREAT_MODEL_UNCHANGED_MARKER, collectPushThreatModelFacts, isPushThreatModelTemplateUnchanged, renderPushThreatModel,
} from "../lib/push-threat-model-materialize.mjs";
import { spawnSync } from "node:child_process";
import { produceCriticDiagnostic } from "../lib/critic-diagnostic-producer.mjs";
import { parseCriticDispatchPreflightArgs } from "./critic-dispatch-preflight.mjs";
import { admitSessionCriticReview, finalizeSessionCriticReview } from "./session-critic-finalizer.mjs";
import { addCriticDeltaRequest, addCriticReviewLineage, addCriticReviewUnit, addVerifyEvidence, checkCriticLineageBeforeCommit, registerFeaturePackage } from "../lib/feature-package-registration.mjs";
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

// C30I-S7 (AC-110): the manifest of a registered package binds the Result and acceptance bytes of the registration; committed later, they leave it stale. Every
// FPR-MANIFEST-CONFLICT of that state names the entry, both digests and the sanctioned route, and the manifest is never touched.
function staleRegistered() {
  const root = successorRoot(), state = approvedState(root);
  // A successor of a discarded feature: its flagged manifest is never rebuilt by a plain re-approval (SUP9), so a stale one meets FPR-MANIFEST-CONFLICT.
  assert.equal(register(root, state, PREDECESSOR).status, "registered");
  const manifest = JSON.parse(sameBytes(root));
  const bound = (kind) => manifest.artifacts.find((entry) => entry.class === kind);
  // The registration binds the generated acceptance pointer and Result record as immutable entries (a rebuilt manifest binds found ones as mutable and append-only) and the Spec as mutable.
  const acceptance = bound("acceptance"), result = bound("result"), spec = bound("spec");
  assert.deepEqual([acceptance.mutability, result.mutability, spec.mutability], ["immutable", "immutable", "mutable"]);
  const second = approvedState(root, { tag: "two" });
  put(root, acceptance.path, "acceptance entry committed after the registration\n");
  put(root, result.path, "# Result\n\nresult-reconciliation fence committed after the registration\n");
  put(root, spec.path, "# Spec\nAC-1 behavior, edited after the registration\n");
  return { root, state, second, acceptance, result, spec, once: sameBytes(root) };
}
function assertRouteNamed(reason, f) {
  assert.match(reason, /it is never (amended|overwritten)/u, "the refusal itself is unchanged");
  for (const entry of [f.acceptance, f.result, f.spec]) for (const expected of [entry.path, entry.sha256, sha(readFileSync(join(f.root, entry.path)))]) assert.ok(reason.includes(expected), `the reason names ${expected}: ${reason}`);
  assert.ok(reason.includes(SUCCESSOR));
  assert.match(reason, /feature-package-rebind-mutable --root \S+ --manifest specs\/feature-b\/lifecycle\.json/u, "the mutable Spec entry has its agent-run verb");
  assert.match(reason, /feature-package-reconcile[\s\S]*PO's own signature[\s\S]*attended terminal/u, "the immutable acceptance and Result entries need the PO's signature");
  assert.match(reason, /never edited by hand/u);
}

test("S7-1: a registration that meets a manifest stale against committed acceptance and Result bytes names the route with both digests, and writes nothing", () => {
  const f = staleRegistered();
  const result = register(f.root, f.second);
  assert.equal(result.code, "FPR-MANIFEST-CONFLICT", JSON.stringify(result));
  assertRouteNamed(result.reason, f);
  assert.equal(sameBytes(f.root), f.once, "the manifest is never amended by the refusal");
});

test("S7-2: the Verify evidence registration and the review-unit registration name the same route", () => {
  const f = staleRegistered();
  const evidence = addVerifyEvidence({ root: f.root, state: f.state, path: `specs/${SUCCESSOR}/evidence/verify-candidate.json`, readAcceptedDeliveryContract: envelopeReader });
  assert.equal(evidence.code, "FPR-MANIFEST-CONFLICT", JSON.stringify(evidence));
  assertRouteNamed(evidence.reason, f);
  const unit = addCriticReviewUnit({ root: f.root, state: f.state, readAcceptedDeliveryContract: envelopeReader });
  assert.equal(unit.code, "FPR-MANIFEST-CONFLICT", JSON.stringify(unit));
  assertRouteNamed(unit.reason, f);
  assert.equal(sameBytes(f.root), f.once);
});

test("S7-3: a manifest that is invalid for another reason keeps its refusal text unchanged (no route is invented)", () => {
  const root = successorRoot(), state = approvedState(root);
  assert.equal(register(root, state, PREDECESSOR).status, "registered");
  const broken = JSON.parse(sameBytes(root)); broken.artifacts[0].retention = "nonsense";
  put(root, `specs/${SUCCESSOR}/lifecycle.json`, `${JSON.stringify(broken, null, 2)}\n`);
  const result = register(root, approvedState(root, { tag: "two" }));
  assert.equal(result.code, "FPR-MANIFEST-CONFLICT", JSON.stringify(result));
  assert.equal(result.reason, "a manifest exists but is invalid; it is never overwritten");
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

// C30J-J13 (AC-112 is the closest accepted criterion; consumer blocker 2026-11-17): an active feature has a DISCARDED predecessor whose registration is retained, both with
// a manifest and a Critic review unit. The review ran and was consumed, yet --add-review-lineage stopped FPR-LINEAGE-FEATURE-AMBIGUOUS (and the delta verb FPR-DELTA-FEATURE)
// because every feature with a review unit counted. The consumed packet's course claim names exactly one feature's course; the lineage verb now derives the feature from it.
// Seam (named): the Critic model call; the verdict is a fixture return, every other step runs through the real entry points (preflight CLI, admission, finalizer).
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
delete GIT_ENV.NODE_TEST_CONTEXT;
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
function git(root, args) {
  const result = spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-C", root, ...args], { encoding: "utf8", shell: false, env: GIT_ENV });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}
const commitPaths = (root, paths, message) => { git(root, ["add", "-f", "--", ...paths]); git(root, ["commit", "-qm", message]); return git(root, ["rev-parse", "HEAD"]); };
const CRITIC_SPEC = (id) => `specs/${id}/spec.md`;
/** One feature package with a Critic review unit: the spec, the unit, the topology entries and the manifest (returned as an object so a later commit can re-digest the spec). */
function featurePackage(root, id, { supersedes = null } = {}) {
  const unitPath = `specs/${id}/design/critic-review-unit.json`;
  put(root, CRITIC_SPEC(id), "# Complete behavior\nAC-1: deliver complete behavior\n");
  put(root, unitPath, JSON.stringify({ schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose: "Deliver one complete behavior", specPath: CRITIC_SPEC(id), logicalWorkIds: ["scope-one", "scope-two"], criterionIds: ["AC-1"], deliveryBoundary: { mainRef: git(root, ["symbolic-ref", "HEAD"]) }, singletonRationale: null }));
  const topology = [["prd", "prd.md", true, "mutable", "active"], ["acceptance", "acceptance.md", false, "mutable", "active"], ["result", "result.md", false, "mutable", "active"], ["candidate-evidence", "evidence/seed.json", false, "immutable", "retain"]].map(([klass, rel, authority, mutability, retention]) => {
    const path = `specs/${id}/${rel}`; put(root, path, `${klass}\n`);
    return { class: klass, path, sha256: sha(readFileSync(join(root, path))), authority, mutability, retention };
  });
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id, rigor: 2 }, state: "approved", candidate: null, supersedes, artifacts: [
    { class: "spec", path: CRITIC_SPEC(id), sha256: sha(readFileSync(join(root, CRITIC_SPEC(id)))), authority: true, mutability: "mutable", retention: "active" },
    { class: "design", path: unitPath, sha256: sha(readFileSync(join(root, unitPath))), authority: false, mutability: "immutable", retention: "retain" }, ...topology] };
  put(root, `specs/${id}/lifecycle.json`, JSON.stringify(manifest));
  return manifest;
}
const treeDigests = (root, id) => Object.fromEntries(readdirSync(join(root, "specs", id), { recursive: true }).map(String).filter((rel) => existsSync(join(root, "specs", id, rel)) && !statSync(join(root, "specs", id, rel)).isDirectory()).sort().map((rel) => [rel, sha(readFileSync(join(root, "specs", id, rel)))]));
const SPEC_ARGV = (root, base, candidate, diagnosticPath, registrationCommit) => ["--root", root, "--base", base, "--candidate", candidate, "--spec", CRITIC_SPEC(SUCCESSOR), "--evidence", diagnosticPath, "--registration-commit", registrationCommit];

/**
 * A consumer repository: DISCARDED predecessor `feature-a` (manifest and review unit retained, no review round) and the active successor `feature-b`; round 1 of
 * the successor is walked through preflight, admission and the finalizer.
 */
function consumedRound({ withPredecessor = true, supersedes = null } = {}) {
  const root = tempRoot();
  git(root, ["init", "-q", "-b", "main"]);
  put(root, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngovernance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");
  put(root, "governance/guidelines/review.md", "Review changed code.\n");
  put(root, "governance/policies/checklist.md", "- verify\n");
  put(root, ".gitignore", "/project/pipeline-state.json\n/.claude/pipeline-state.json\n/scratch/\n/evidence/*-targeted-*.log\n");
  put(root, "project/pipeline.json", jsonText({ handover: "docs/state.md", criticFindingRecordPaths: ["docs/findings.md"] }));
  put(root, "docs/state.md", "state v1\n"); put(root, "docs/findings.md", "findings quoted here\n"); put(root, "pipeline.user.yaml", "gates:\n  human_approval: chat\n");
  // The State is not a tracked file in a consumer; a successor course reads the predecessor's discard record from it (the manifest relation alone is not enough for the admission).
  if (supersedes !== null) put(root, ".claude/pipeline-state.json", jsonText({ schema: "pipeline.state.v0", activeFeature: null, discardedFeatures: [{ id: supersedes, planPath: `specs/${supersedes}/prd.md`, phaseAtDiscard: "implementation", discardedAt: "2026-11-16T10:00:00.000Z", discardedBy: "Operator", reason: "abandoned", forCommit: null }] }));
  git(root, ["add", "--", "."]); git(root, ["commit", "-qm", "base"]);
  if (withPredecessor) { featurePackage(root, PREDECESSOR); commitPaths(root, [`specs/${PREDECESSOR}`], "the discarded predecessor keeps its registration"); }
  const manifest = featurePackage(root, SUCCESSOR, { supersedes });
  const genesis = commitPaths(root, [`specs/${SUCCESSOR}`], "declare feature review unit");
  put(root, CRITIC_SPEC(SUCCESSOR), "# Complete behavior\nAC-1: deliver complete behavior\nImplemented behavior.\n");
  manifest.artifacts[0].sha256 = sha(readFileSync(join(root, CRITIC_SPEC(SUCCESSOR))));
  put(root, `specs/${SUCCESSOR}/lifecycle.json`, JSON.stringify(manifest));
  const candidate = commitPaths(root, [CRITIC_SPEC(SUCCESSOR), `specs/${SUCCESSOR}/lifecycle.json`], "integrate feature behavior");
  const registered = registerDiagnosticFor(root, candidate, "r1");
  return { root, genesis, candidate, manifest, ...walkRound(root, { genesis, candidate, diagnosticPath: registered.diagnosticPath, registrationCommit: registered.registration, n: 1 }) };
}
function registerDiagnosticFor(root, candidate, tag) {
  const manifestPath = `specs/${SUCCESSOR}/lifecycle.json`, logPath = `specs/${SUCCESSOR}/evidence/targeted-${tag}.log`, diagnosticPath = `specs/${SUCCESSOR}/evidence/diagnostic-${tag}.json`, capturedPath = `evidence/${SUCCESSOR}-targeted-${tag}.log`;
  const produced = produceCriticDiagnostic({ root, candidate, specPath: CRITIC_SPEC(SUCCESSOR), guardrailPaths: [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"], command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
  put(root, logPath, readFileSync(join(root, capturedPath)));
  produced.targeted.log.path = logPath;
  put(root, diagnosticPath, JSON.stringify(produced));
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
  for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: sha(readFileSync(join(root, path))), authority: false, mutability: "immutable", retention: "retain" });
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  return { diagnosticPath, registration: commitPaths(root, [manifestPath, logPath, diagnosticPath], `register the ${tag} diagnostic`) };
}
/** Preflight (real CLI), admission and finalizer of one round; the finalizer writes the lineage itself (D223) and returns what it observed. */
function walkRound(root, { genesis, candidate, diagnosticPath, registrationCommit, n }) {
  const argv = SPEC_ARGV(root, genesis, candidate, diagnosticPath, registrationCommit);
  const preflight = spawnSync(process.execPath, [join(SCRIPTS_DIR, "critic-dispatch-preflight.mjs"), ...argv], { encoding: "utf8", shell: false, env: GIT_ENV, cwd: root });
  const body = JSON.parse(preflight.stdout.split("\n")[0]);
  assert.equal(body.status, "packet-ready", `${preflight.stdout}${preflight.stderr}`);
  const taskId = `critic-round-${n}`, packetId = `a${(n + 9).toString(16)}`.repeat(16);
  put(root, `evidence/dispatch-record-${taskId}.json`, JSON.stringify({ schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [candidate], candidateCommit: candidate, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: [CRITIC_SPEC(SUCCESSOR)] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } }));
  const request = { preflightInput: parseCriticDispatchPreflightArgs(argv), taskId, projectId: "pipeline", sessionId: `session-${n}`, packetId, route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" },
    verdict: { findings: [], pass: true, deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "candidate evidence inspected", briefing_violations: [] } };
  admitSessionCriticReview(request, {});
  const origin = (q) => ({ schema: "pipeline.session-critic-source-return.v1", issuer: "source", packetId: q.packetId, packetDigest: q.packetDigest, claimant: q.claimant, sessionId: q.sessionId, verdictSha256: q.verdictSha256, issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 });
  const finalized = finalizeSessionCriticReview(request, { readOriginalSourceReturnFn: origin });
  assert.equal(finalized.status, "completed", JSON.stringify(finalized));
  return { packetId, finalized };
}

test("J13-1: a retained discarded predecessor with a manifest and a review unit no longer makes the lineage of the consumed round ambiguous (the finalizer and the verb choose the successor)", () => {
  const f = consumedRound();
  const before = treeDigests(f.root, PREDECESSOR);
  assert.deepEqual(Object.keys(before).filter((rel) => rel.includes("critic-lineage")), [], "the predecessor holds no lineage record");
  assert.equal(f.finalized.lineage?.status, "written", `the finalizer writes the lineage under the successor: ${JSON.stringify(f.finalized.lineage)}`);
  assert.match(f.finalized.lineage.lineagePath, new RegExp(`^specs/${SUCCESSOR}/evidence/critic-lineage-[a-f0-9]{64}\\.json$`, "u"));
  const manifestBytes = readFileSync(join(f.root, `specs/${SUCCESSOR}/lifecycle.json`));
  // A repeated identical call is idempotent: the same record, no second one, no change of the manifest.
  const again = addCriticReviewLineage({ root: f.root, packetId: f.packetId });
  assert.equal(again.status, "already-registered", JSON.stringify(again));
  assert.equal(again.lineagePath, f.finalized.lineage.lineagePath);
  assert.deepEqual(readFileSync(join(f.root, `specs/${SUCCESSOR}/lifecycle.json`)), manifestBytes);
  assert.equal(readdirSync(join(f.root, "specs", SUCCESSOR, "evidence")).filter((name) => name.startsWith("critic-lineage-")).length, 1);
  assert.deepEqual(treeDigests(f.root, PREDECESSOR), before, "the predecessor and its history stay byte-identical");
});

/** Take the lineage the finalizer wrote back out of the working tree, so the verb itself has to register it. */
function unregisterLineage(f) {
  rmSync(join(f.root, f.finalized.lineage.lineagePath));
  git(f.root, ["checkout", "--", `specs/${SUCCESSOR}/lifecycle.json`]);
  assert.equal(git(f.root, ["status", "--porcelain", "--untracked-files=all", "--", "specs"]), "");
}

test("J13-2: the selector --feature is validated against the consumed claim: the bound feature registers, another one is refused naming the bound one, an unknown one is refused, nothing is written by a refusal", () => {
  const f = consumedRound();
  unregisterLineage(f);
  const before = treeDigests(f.root, PREDECESSOR), manifestBytes = readFileSync(join(f.root, `specs/${SUCCESSOR}/lifecycle.json`));
  // Probing the feature the claim does not bind must leave no private state either: the Critic owner store under the git common directory is identical around the probes.
  const store = () => { const dir = join(f.root, ".git", "agent-pipeline"); return readdirSync(dir, { recursive: true }).map(String).sort().map((rel) => [rel, statSync(join(dir, rel)).isDirectory() ? "dir" : sha(readFileSync(join(dir, rel)))]); };
  const storeBefore = store();
  const unknown = addCriticReviewLineage({ root: f.root, packetId: f.packetId, featureId: "feature-zzz" });
  assert.equal(unknown.code, "FPR-LINEAGE-FEATURE-SELECTOR", JSON.stringify(unknown));
  assert.match(unknown.reason, /--add-review-lineage --packet [a-f0-9]{32} --feature <feature id>/u);
  const contradicts = addCriticReviewLineage({ root: f.root, packetId: f.packetId, featureId: PREDECESSOR });
  assert.equal(contradicts.code, "FPR-LINEAGE-FEATURE-SELECTOR-CONTRADICTS", JSON.stringify(contradicts));
  assert.ok(contradicts.reason.includes(`--feature ${SUCCESSOR}`), `the refusal names the bound feature and the command: ${contradicts.reason}`);
  assert.equal(git(f.root, ["status", "--porcelain", "--untracked-files=all", "--", "specs"]), "", "a refusal writes nothing");
  const dry = addCriticReviewLineage({ root: f.root, packetId: f.packetId, dryRun: true });
  assert.equal(dry.status, "lineage-registrable", JSON.stringify(dry));
  assert.equal(git(f.root, ["status", "--porcelain", "--untracked-files=all", "--", "specs"]), "", "the dry run writes nothing");
  assert.deepEqual(store(), storeBefore, "the probes of the non-bound feature changed nothing in the Critic owner store");
  const added = addCriticReviewLineage({ root: f.root, packetId: f.packetId, featureId: SUCCESSOR });
  assert.equal(added.status, "lineage-added", JSON.stringify(added));
  assert.equal(added.manifestPath, `specs/${SUCCESSOR}/lifecycle.json`);
  assert.notDeepEqual(readFileSync(join(f.root, added.manifestPath)), manifestBytes, "the successor's manifest lists the lineage record");
  assert.deepEqual(treeDigests(f.root, PREDECESSOR), before, "the predecessor is never touched");
  assert.equal(addCriticReviewLineage({ root: f.root, packetId: f.packetId, featureId: SUCCESSOR }).status, "already-registered");
  assert.equal(addCriticReviewLineage({ root: f.root, packetId: f.packetId }).status, "already-registered");
});

test("J13-3: when the claim binds none of several features, the refusal names every feature with its own code and the selector command", () => {
  const f = consumedRound();
  unregisterLineage(f);
  rmSync(join(f.root, `specs/${SUCCESSOR}/design/critic-review-unit.json`));
  featurePackage(f.root, "feature-c");
  const result = addCriticReviewLineage({ root: f.root, packetId: f.packetId });
  assert.equal(result.code, "FPR-LINEAGE-FEATURE-AMBIGUOUS", JSON.stringify(result));
  assert.match(result.reason, /binds none of them/u);
  for (const id of [PREDECESSOR, "feature-c"]) assert.ok(result.reason.includes(`--add-review-lineage --packet ${f.packetId} --feature ${id}`), `${id}: ${result.reason}`);
  assert.equal(result.features.length, 2);
});

/** The lineage of round 1 committed, then a correction commit with its registered diagnostic: the state in which the delta verb runs. */
function correctedRound(f) {
  commitPaths(f.root, f.finalized.lineage.commitPaths, "register lineage of round 1");
  put(f.root, "src/fix2.mjs", "export const fix2 = 2;\n");
  const candidate = commitPaths(f.root, ["src/fix2.mjs"], "fix: round 2 correction");
  registerDiagnosticFor(f.root, candidate, "r2");
  return candidate;
}
const deltaInput = (root, map) => put(root, "scratch/delta-input.json", JSON.stringify({ changedBehaviorClaims: ["fix-2"], coordinatorImpactConfirmed: true, impactAmbiguous: false, pathInvariantMap: map }));
const DISCARDED_STATE = { discardedFeatures: [{ id: PREDECESSOR, discardedBy: "Operator", reason: "abandoned" }] };

test("J13-4: the delta verb chooses the active feature when the State records the other one as discarded; without that evidence it refuses naming the selector", () => {
  const f = consumedRound();
  correctedRound(f);
  const before = treeDigests(f.root, PREDECESSOR);
  deltaInput(f.root, { "placeholder.mjs": ["inv-one"] });
  const unresolved = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json" });
  assert.equal(unresolved.code, "FPR-DELTA-FEATURE", JSON.stringify(unresolved));
  assert.ok(unresolved.reason.includes(`--add-delta-request <input.json> --feature ${SUCCESSOR}`), unresolved.reason);
  const mapStep = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json", state: DISCARDED_STATE });
  assert.equal(mapStep.code, "FPR-DELTA-MAP", JSON.stringify(mapStep));
  deltaInput(f.root, Object.fromEntries(mapStep.changedPaths.map((path) => [path, ["inv-one"]])));
  const added = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json", state: DISCARDED_STATE });
  assert.equal(added.status, "delta-request-added", JSON.stringify(added));
  assert.ok(added.commitPaths.every((path) => path.startsWith(`specs/${SUCCESSOR}/`)), JSON.stringify(added.commitPaths));
  assert.deepEqual(treeDigests(f.root, PREDECESSOR), before, "the predecessor is never touched");
});

test("J13-5: the delta selector --feature decides without the State; a feature without a registered lineage and an unknown one are refused; the successor relation of the manifest is a second evidence", () => {
  const f = consumedRound();
  correctedRound(f);
  deltaInput(f.root, { "placeholder.mjs": ["inv-one"] });
  const unknown = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json", featureId: "feature-zzz" });
  assert.equal(unknown.code, "FPR-DELTA-FEATURE-SELECTOR", JSON.stringify(unknown));
  const wrong = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json", featureId: PREDECESSOR });
  assert.equal(wrong.code, "FPR-DELTA-NO-LINEAGE", `the predecessor holds no registered round: ${JSON.stringify(wrong)}`);
  const chosen = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json", featureId: SUCCESSOR });
  assert.equal(chosen.code, "FPR-DELTA-MAP", JSON.stringify(chosen));
});

test("J13-6: the successor relation in the manifest (supersedes) is a second evidence only: alone it retires nothing, with the State's discard record the active feature is chosen, a selector naming a discarded feature is refused", () => {
  const f = consumedRound({ supersedes: PREDECESSOR });
  correctedRound(f);
  deltaInput(f.root, { "placeholder.mjs": ["inv-one"] });
  const alone = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json" });
  assert.equal(alone.code, "FPR-DELTA-FEATURE", JSON.stringify(alone));
  assert.ok(alone.reason.includes(`--add-delta-request <input.json> --feature ${SUCCESSOR}`), alone.reason);
  const chosen = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json", state: DISCARDED_STATE });
  assert.equal(chosen.code, "FPR-DELTA-MAP", JSON.stringify(chosen));
  const discarded = addCriticDeltaRequest({ root: f.root, inputPath: "scratch/delta-input.json", state: DISCARDED_STATE, featureId: PREDECESSOR });
  assert.equal(discarded.code, "FPR-DELTA-FEATURE-DISCARDED", JSON.stringify(discarded));
  assert.ok(discarded.reason.includes(`--feature ${SUCCESSOR}`), `the refusal names the successor command: ${discarded.reason}`);
});

test("J13-7: the CLI accepts a trailing --feature <id> on the lineage and delta forms only, names it in the usage and the help, and refuses every other composition FPR-ARGS", () => {
  const root = tempRoot(), packet = "a".repeat(32);
  const run = (argv) => { let text = ""; const code = runRegisterFeaturePackage(argv, (chunk) => { text += chunk; }); return { code, out: JSON.parse(text) }; };
  for (const argv of [["--root", root, "--add-review-lineage", "--packet", packet, "--feature", SUCCESSOR], ["--root", root, "--add-delta-request", "in.json", "--feature", SUCCESSOR],
    ["--root", root, "--add-delta-request", "in.json", "--confirm-full-round", "--feature", SUCCESSOR], ["--root", root, "--add-review-lineage", "--packet", packet, "--feature", SUCCESSOR, "--stage"]]) {
    assert.equal(run(argv).out.code, "FPR-NO-APPROVED-PLAN", `${JSON.stringify(argv)}: the shape is accepted (the State is the next refusal)`);
  }
  for (const argv of [["--root", root, "--add-review-unit", "--feature", SUCCESSOR], ["--root", root, "--add-review-lineage", "--packet", packet, "--feature"], ["--root", root, "--add-review-lineage", "--packet", packet, "--feature", "--stage"],
    ["--root", root, "--add-review-lineage", "--packet", packet, "--feature", ""], ["--root", root, "--add-review-lineage", "--packet", packet, "--feature", "--root"], ["--root", root, "--add-diagnostic-evidence", "x.json", "--feature", SUCCESSOR],
    ["--root", root, "--supersedes", PREDECESSOR, "--feature", SUCCESSOR], ["--feature", SUCCESSOR, "--root", root, "--add-review-lineage", "--packet", packet]]) {
    const refusal = run(argv);
    assert.equal(refusal.code, 2); assert.equal(refusal.out.code, "FPR-ARGS", JSON.stringify(argv));
    assert.match(refusal.out.reason, /--add-review-lineage --packet <packetId> \[--feature <feature id>\]/u);
  }
  assert.match(REGISTER_FEATURE_PACKAGE_HELP, /--add-review-lineage --packet <packetId> \[--feature <feature id>\]/u);
  assert.match(REGISTER_FEATURE_PACKAGE_HELP, /--add-delta-request <input\.json> \[--confirm-full-round\] \[--feature <feature id>\]/u);
});

// C30J-J16: the commit-time lineage guard (the commit-msg hook's core predicate) names its feature the same way the registration verb does (the verb's dry run is the derivation).
const stageCorrection = (root) => { put(root, "src/correction.mjs", "export const correction = 1;\n"); git(root, ["add", "-f", "--", "src/correction.mjs"]); };

test("J16-1: a retained discarded predecessor no longer lets a correction commit through before the lineage is registered; the registration commit and every later commit are allowed", () => {
  const f = consumedRound();
  unregisterLineage(f);
  stageCorrection(f.root);
  const refused = checkCriticLineageBeforeCommit({ root: f.root });
  assert.equal(refused.decision, "refuse", JSON.stringify(refused));
  assert.equal(refused.code, "CRL-LINEAGE-UNREGISTERED");
  assert.equal(refused.featureId, SUCCESSOR, "the guard names the feature the consumed claim binds, not the retained predecessor");
  assert.equal(refused.packetId, f.packetId);
  assert.equal(refused.written, false);
  assert.deepEqual(refused.commitPaths.slice(0, 1), [`specs/${SUCCESSOR}/lifecycle.json`]);
  assert.ok(refused.repair.includes(`--add-review-lineage --packet ${f.packetId}`), refused.repair);
  assert.equal(git(f.root, ["status", "--porcelain", "--untracked-files=all", "--", "specs"]), "", "the guard writes nothing");
  // Following the printed repair: register, stage the registration, and the same guard allows.
  const added = addCriticReviewLineage({ root: f.root, packetId: f.packetId });
  assert.equal(added.status, "lineage-added", JSON.stringify(added));
  git(f.root, ["add", "-f", "--", ...added.commitPaths]);
  assert.deepEqual([checkCriticLineageBeforeCommit({ root: f.root }).decision, checkCriticLineageBeforeCommit({ root: f.root }).reason], ["allow", "registration-commit"]);
  git(f.root, ["commit", "-qm", "register the lineage together with the correction"]);
  put(f.root, "src/next.mjs", "export const next = 1;\n"); git(f.root, ["add", "-f", "--", "src/next.mjs"]);
  assert.deepEqual([checkCriticLineageBeforeCommit({ root: f.root }).decision, checkCriticLineageBeforeCommit({ root: f.root }).reason], ["allow", "lineage-registered"]);
});

test("J16-2: with the lineage written in the working tree but neither committed nor staged the guard refuses naming the written files; committing them allows", () => {
  const f = consumedRound();
  stageCorrection(f.root);
  const refused = checkCriticLineageBeforeCommit({ root: f.root });
  assert.equal(refused.code, "CRL-LINEAGE-UNREGISTERED", JSON.stringify(refused));
  assert.equal(refused.featureId, SUCCESSOR);
  assert.equal(refused.written, true);
  assert.deepEqual(refused.commitPaths, f.finalized.lineage.commitPaths);
  git(f.root, ["add", "-f", "--", ...f.finalized.lineage.commitPaths]);
  assert.equal(checkCriticLineageBeforeCommit({ root: f.root }).reason, "registration-commit");
});

test("J16-3: single-feature behaviour is unchanged: the same refusal and the same allow reasons without a predecessor", () => {
  const f = consumedRound({ withPredecessor: false });
  unregisterLineage(f);
  stageCorrection(f.root);
  const refused = checkCriticLineageBeforeCommit({ root: f.root });
  assert.deepEqual([refused.decision, refused.code, refused.featureId, refused.written], ["refuse", "CRL-LINEAGE-UNREGISTERED", SUCCESSOR, false], JSON.stringify(refused));
  const added = addCriticReviewLineage({ root: f.root, packetId: f.packetId });
  git(f.root, ["add", "-f", "--", ...added.commitPaths]);
  assert.equal(checkCriticLineageBeforeCommit({ root: f.root }).reason, "registration-commit");
});

test("J16-5: two features that both still qualify after the derivation (the same round recorded under both, in the working tree only): the guard stays open and names the reason and the commands; it writes nothing", () => {
  const f = consumedRound();
  // The lineage the finalizer wrote under the successor is mirrored under the predecessor (a manifest row plus the same record bytes), so the verb's replay rule matches both features.
  const lineageBytes = readFileSync(join(f.root, f.finalized.lineage.lineagePath));
  const mirrored = f.finalized.lineage.lineagePath.replace(`specs/${SUCCESSOR}/`, `specs/${PREDECESSOR}/`);
  put(f.root, mirrored, lineageBytes);
  const predecessorManifest = `specs/${PREDECESSOR}/lifecycle.json`;
  const manifest = JSON.parse(readFileSync(join(f.root, predecessorManifest), "utf8"));
  manifest.artifacts.push({ class: "candidate-evidence", path: mirrored, sha256: sha(lineageBytes), authority: false, mutability: "immutable", retention: "retain" });
  put(f.root, predecessorManifest, JSON.stringify(manifest));
  assert.equal(addCriticReviewLineage({ root: f.root, packetId: f.packetId, dryRun: true }).code, "FPR-LINEAGE-FEATURE-AMBIGUOUS", "the verb itself cannot choose between the two features");
  stageCorrection(f.root);
  const status = git(f.root, ["status", "--porcelain", "--untracked-files=all", "--", "specs"]);
  const verdict = checkCriticLineageBeforeCommit({ root: f.root });
  assert.deepEqual([verdict.decision, verdict.reason], ["allow", "not-decidable"], JSON.stringify(verdict));
  for (const id of [PREDECESSOR, SUCCESSOR]) assert.ok(verdict.detail.includes(`--add-review-lineage --packet ${f.packetId} --feature ${id}`), `${id}: ${verdict.detail}`);
  assert.equal(git(f.root, ["status", "--porcelain", "--untracked-files=all", "--", "specs"]), status, "the guard writes nothing");
});

test("J16-4: where the claim binds none of the several features the guard stays open and says so by name, with one runnable command per feature; it writes nothing", () => {
  const f = consumedRound();
  unregisterLineage(f);
  // The successor loses its review unit and a third feature gains one, committed: no feature at HEAD is the one the consumed claim binds.
  git(f.root, ["rm", "-q", "--", `specs/${SUCCESSOR}/design/critic-review-unit.json`]);
  featurePackage(f.root, "feature-c");
  git(f.root, ["add", "-f", "--", "specs/feature-c"]);
  git(f.root, ["commit", "-qm", "the claim binds no feature that holds a review unit"]);
  stageCorrection(f.root);
  const verdict = checkCriticLineageBeforeCommit({ root: f.root });
  assert.deepEqual([verdict.decision, verdict.reason], ["allow", "not-decidable"], JSON.stringify(verdict));
  assert.match(verdict.detail, /more than one feature has a Critic review unit/u);
  assert.ok(verdict.detail.includes(f.packetId), verdict.detail);
  for (const id of [PREDECESSOR, "feature-c"]) assert.ok(verdict.detail.includes(`register-feature-package.mjs --root <root> --add-review-lineage --packet ${f.packetId} --feature ${id}`), `${id}: ${verdict.detail}`);
  assert.equal(git(f.root, ["status", "--porcelain", "--untracked-files=all", "--", "specs"]), "", "the guard writes nothing");
});
