#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CRITICAL_HUMAN_PROOF_POLICY_PATH,
  DEFAULT_PUSH_APPROVAL_MODE,
  criticalProofWaiverFor,
  readCriticalHumanProofPolicy,
  readPushApprovalMode,
} from "./critical-human-proof-policy.mjs";

function userYaml(base, text) {
  writeFileSync(join(base, "pipeline.user.yaml"), text);
  return base;
}
const GATES = (mode) => `schema: "pipeline.user.v3"\ngates:\n  claude_md_max_lines: 200\n  dev_plan: "blocking"\n  push: "blocking"\n${mode === null ? "" : `  push_approval: "${mode}"\n`}  security: "blocking"\n`;

const roots = [];
function root(policy) {
  const base = mkdtempSync(join(tmpdir(), "critical-human-proof-policy-"));
  roots.push(base);
  if (policy !== undefined) {
    mkdirSync(join(base, "project"), { recursive: true });
    writeFileSync(join(base, CRITICAL_HUMAN_PROOF_POLICY_PATH), `${typeof policy === "string" ? policy : JSON.stringify(policy, null, 2)}\n`);
  }
  return base;
}
const V1 = (kinds = ["push", "deploy", "publication"]) => ({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: kinds });
const V2 = (waived, kinds = ["push", "deploy", "publication"]) => ({
  schema: "pipeline.critical-human-proof-policy.v2", requiredKinds: kinds, waivedKinds: waived,
});

let passed = 0;
let failed = 0;
function check(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    failed += 1;
  }
}

try {
  check("CHP01 a v1 policy still parses and waives nothing", () => {
    const base = root(V1());
    const policy = readCriticalHumanProofPolicy(base);
    assert.equal(policy.ok, true);
    assert.equal(policy.requiredKinds.has("push"), true);
    assert.equal(policy.waivers.size, 0);
    assert.deepEqual(criticalProofWaiverFor(base, "push"), { waived: false, code: null });
  });

  check("CHP02 a v2 waiver stands the proof down for exactly its kind", () => {
    const base = root(V2([{ kind: "push", reason: "solo operator, key on a second machine" }]));
    const result = criticalProofWaiverFor(base, "push");
    assert.equal(result.waived, true);
    assert.equal(result.waiver.reason, "solo operator, key on a second machine");
    assert.deepEqual(criticalProofWaiverFor(base, "deploy"), { waived: false, code: null });
  });

  check("CHP03 a waived kind stays required — only the proof is stood down", () => {
    const base = root(V2([{ kind: "push", reason: "documented operator decision" }]));
    const policy = readCriticalHumanProofPolicy(base);
    assert.equal(policy.requiredKinds.has("push"), true);
  });

  check("CHP04 no policy file is not a waiver", () => {
    const base = root();
    assert.deepEqual(criticalProofWaiverFor(base, "push"), { waived: false, code: null });
  });

  check("CHP05 a kind merely missing from requiredKinds is not a waiver", () => {
    const base = root(V1(["deploy", "publication"]));
    assert.deepEqual(criticalProofWaiverFor(base, "push"), { waived: false, code: null });
  });

  check("CHP06 an unreadable policy is not a waiver", () => {
    const base = root("{ not json");
    const result = criticalProofWaiverFor(base, "push");
    assert.equal(result.waived, false);
    assert.equal(result.code, "CRITICAL-PROOF-POLICY-UNREADABLE");
  });

  check("CHP07 a waiver without a real reason is refused", () => {
    for (const reason of ["", "   ", "off", "why?", 42, null]) {
      const base = root(V2([{ kind: "push", reason }]));
      const policy = readCriticalHumanProofPolicy(base);
      assert.equal(policy.ok, false, `reason=${JSON.stringify(reason)}`);
      assert.equal(policy.code, "CRITICAL-PROOF-POLICY-WAIVER-INVALID");
      assert.equal(criticalProofWaiverFor(base, "push").waived, false);
    }
  });

  check("CHP08 a waiver for a kind that is not required is refused", () => {
    const base = root(V2([{ kind: "push", reason: "documented operator decision" }], ["deploy"]));
    const policy = readCriticalHumanProofPolicy(base);
    assert.equal(policy.ok, false);
    assert.equal(policy.code, "CRITICAL-PROOF-POLICY-WAIVER-INVALID");
  });

  check("CHP09 a duplicated waiver is refused", () => {
    const base = root(V2([
      { kind: "push", reason: "documented operator decision" },
      { kind: "push", reason: "a second, conflicting statement" },
    ]));
    assert.equal(readCriticalHumanProofPolicy(base).code, "CRITICAL-PROOF-POLICY-WAIVER-INVALID");
  });

  check("CHP10 extra keys and an unknown schema are refused", () => {
    assert.equal(readCriticalHumanProofPolicy(root({ ...V1(), extra: true })).code, "CRITICAL-PROOF-POLICY-INVALID");
    assert.equal(readCriticalHumanProofPolicy(root({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"] })).code, "CRITICAL-PROOF-POLICY-INVALID");
    assert.equal(readCriticalHumanProofPolicy(root({ ...V1(), waivedKinds: [] })).code, "CRITICAL-PROOF-POLICY-INVALID");
  });

  check("CHP11 an unknown action kind is refused", () => {
    assert.equal(readCriticalHumanProofPolicy(root(V1(["push", "merge"]))).code, "CRITICAL-PROOF-POLICY-INVALID");
  });

  check("CHP12 a symlinked policy is refused rather than followed", () => {
    const base = root(V1());
    const decoy = mkdtempSync(join(tmpdir(), "critical-human-proof-decoy-"));
    roots.push(decoy);
    const target = join(decoy, "policy.json");
    writeFileSync(target, `${JSON.stringify(V2([{ kind: "push", reason: "smuggled waiver via symlink" }]))}\n`);
    rmSync(join(base, CRITICAL_HUMAN_PROOF_POLICY_PATH));
    symlinkSync(target, join(base, CRITICAL_HUMAN_PROOF_POLICY_PATH));
    const result = criticalProofWaiverFor(base, "push");
    assert.equal(result.waived, false);
    assert.equal(result.code, "CRITICAL-PROOF-POLICY-UNSAFE");
  });

  check("CHP14 every action kind is waivable, not just push", () => {
    // The schema is kind-generic by decision 1. A reviewer must be able to see that
    // the two non-push kinds are actually reachable, because their CLI call sites
    // key off requiredKinds and a waived kind deliberately stays in that list.
    for (const kind of ["push", "deploy", "publication"]) {
      const base = root(V2([{ kind, reason: `documented operator decision for ${kind}` }]));
      const policy = readCriticalHumanProofPolicy(base);
      assert.equal(policy.ok, true, kind);
      assert.equal(policy.requiredKinds.has(kind), true, `${kind} must stay required`);
      assert.equal(criticalProofWaiverFor(base, kind).waived, true, kind);
      for (const other of ["push", "deploy", "publication"].filter((entry) => entry !== kind)) {
        assert.equal(criticalProofWaiverFor(base, other).waived, false, `${kind} must not waive ${other}`);
      }
    }
  });

  check("CHP15 several kinds may be waived independently", () => {
    const base = root(V2([
      { kind: "deploy", reason: "documented operator decision for deploy" },
      { kind: "publication", reason: "documented operator decision for publication" },
    ]));
    const policy = readCriticalHumanProofPolicy(base);
    assert.equal(policy.ok, true, policy.code);
    assert.equal(criticalProofWaiverFor(base, "deploy").waived, true);
    assert.equal(criticalProofWaiverFor(base, "publication").waived, true);
    assert.equal(criticalProofWaiverFor(base, "push").waived, false);
  });

  check("CHP16 the push approval mode defaults to signature, the strongest setting", () => {
    assert.equal(DEFAULT_PUSH_APPROVAL_MODE, "signature");
    // No source file at all.
    assert.deepEqual(readPushApprovalMode(root()), { mode: "signature", source: "default" });
    // Source present, key absent — an older pipeline.user.yaml must keep working.
    assert.deepEqual(readPushApprovalMode(userYaml(root(), GATES(null))), { mode: "signature", source: "default" });
  });

  check("CHP17 gates.push_approval chat stands the external signature down", () => {
    const base = userYaml(root(V1()), GATES("chat"));
    assert.equal(readPushApprovalMode(base).mode, "chat");
    const result = criticalProofWaiverFor(base, "push");
    assert.equal(result.waived, true);
    assert.equal(result.waiver.mode, "chat");
    assert.equal(result.waiver.source, "pipeline.user.yaml");
    // Only push. deploy and publication keep their own policy-file control.
    assert.equal(criticalProofWaiverFor(base, "deploy").waived, false);
    assert.equal(criticalProofWaiverFor(base, "publication").waived, false);
  });

  check("CHP18 gates.push_approval signature keeps the proof demanded", () => {
    const base = userYaml(root(V1()), GATES("signature"));
    assert.deepEqual(criticalProofWaiverFor(base, "push"), { waived: false, code: null });
  });

  check("CHP19 an unreadable or invalid source falls back to signature, never to chat", () => {
    for (const [text, source] of [
      ["gates:\n  push_approval: \"whatever\"\n", "invalid"],
      ["gates:\n  push_approval: true\n", "invalid"],
      [": : not yaml\n  - [\n", "unreadable"],
    ]) {
      const observed = readPushApprovalMode(userYaml(root(), text));
      assert.equal(observed.mode, "signature", `${source}: ${JSON.stringify(text)}`);
      assert.equal(criticalProofWaiverFor(userYaml(root(V1()), text), "push").waived, false);
    }
  });

  check("CHP20 a source saying signature and a policy file waiving push is refused, not guessed", () => {
    const base = userYaml(
      root(V2([{ kind: "push", reason: "policy-file waiver contradicting the source" }])),
      GATES("signature"),
    );
    const result = criticalProofWaiverFor(base, "push");
    assert.equal(result.waived, false);
    assert.equal(result.code, "CRITICAL-PROOF-MODE-CONFLICT");
  });

  check("CHP13 this repository ships the gate ON", () => {
    // The PO's standing decision: default on here, switchable off elsewhere.
    const repoRoot = new URL("../../..", import.meta.url).pathname;
    const policy = readCriticalHumanProofPolicy(repoRoot);
    assert.equal(policy.ok, true);
    assert.equal(policy.requiredKinds.has("push"), true);
    assert.equal(policy.waivers.size, 0, "no waiver may be committed in the Pipeline's own repository");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
