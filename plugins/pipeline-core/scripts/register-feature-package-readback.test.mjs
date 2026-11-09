// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PUSH_THREAT_MODEL_FILE } from "../lib/close-chain-guide.mjs";
import { PUSH_THREAT_MODEL_GATE_SCHEMA, pushThreatModelRefusalText, pushThreatModelVerdict } from "../lib/push-threat-model-gate.mjs";
import {
  PUSH_THREAT_MODEL_UNCHANGED_MARKER, collectPushThreatModelFacts, isPushThreatModelTemplateUnchanged, renderPushThreatModel,
} from "../lib/push-threat-model-materialize.mjs";
import { pushThreatModelReadback } from "./register-feature-package.mjs";

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
