#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

/**
 * Write the source AND commit it.
 *
 * The commit is not decoration. Since the T2 Critic's C1 blocker, `readPushApprovalMode`
 * ignores a working-tree copy that differs from HEAD and returns the strongest mode, so a
 * merely-written fixture no longer exercises the configured value at all — it exercises
 * the fail-closed path, and every "chat is honoured" check below would have passed for
 * the wrong reason or not at all. CHP21/CHP22 cover the uncommitted case deliberately.
 */
function userYaml(base, text) {
  writeFileSync(join(base, "pipeline.user.yaml"), text);
  spawnSync("git", ["init", "-q", base]);
  spawnSync("git", ["-C", base, "config", "user.email", "fixture@example.invalid"]);
  spawnSync("git", ["-C", base, "config", "user.name", "fixture"]);
  spawnSync("git", ["-C", base, "add", "-A"]);
  spawnSync("git", ["-C", base, "commit", "-qm", "fixture"]);
  return base;
}
const GATES = (mode) => `schema: "pipeline.user.v3"\ngates:\n  claude_md_max_lines: 200\n  dev_plan: "blocking"\n  push: "blocking"\n${mode === null ? "" : `  push_approval: "${mode}"\n`}  security: "blocking"\n`;

/**
 * Reach an existing fixture root through a real directory symlink.
 *
 * The one shape no fixture had, and the reason the suite stayed green while
 * `committedUnchanged` compared a physical path against a lexical one: `mkdtempSync` under
 * `os.tmpdir()` is symlink-free on Linux, so every root here happened to be its own realpath.
 */
function linkedRoot(target) {
  const base = mkdtempSync(join(tmpdir(), "critical-human-proof-link-"));
  roots.push(base);
  const link = join(base, "root");
  symlinkSync(target, link, "dir");
  return link;
}

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

  check("CHP21 a working-tree copy that differs from HEAD is not trusted", () => {
    // The T2 Critic's C1: the shell lane refuses the literal filename but not a name
    // assembled at runtime, so an in-session write to this file must be assumed possible.
    // What must hold is that it cannot WEAKEN the gate. Committed chat, then modified.
    const base = userYaml(root(V1()), GATES("chat"));
    assert.equal(readPushApprovalMode(base).mode, "chat", "precondition: committed chat is honoured");
    writeFileSync(join(base, "pipeline.user.yaml"), GATES("chat").replace("chat", "chat "));
    assert.deepEqual(readPushApprovalMode(base), { mode: "signature", source: "uncommitted" });
    assert.equal(criticalProofWaiverFor(base, "push").waived, false,
      "an uncommitted edit stood the push proof down");
  });

  check("CHP22 an uncommitted flip to chat buys nothing, in either consumer", () => {
    // The attack in its intended direction: signature committed, chat written.
    const base = userYaml(root(V1()), GATES("signature"));
    writeFileSync(join(base, "pipeline.user.yaml"), GATES("chat"));
    assert.equal(readPushApprovalMode(base).mode, "signature");
    assert.equal(criticalProofWaiverFor(base, "push").waived, false);
  });

  check("CHP23 no repository at all is not a clearance", () => {
    // Without Git there is nothing to compare against, so the mode is unverifiable. That
    // must read as the strongest setting, never as the configured one.
    const base = join(root(V1()), "");
    writeFileSync(join(base, "pipeline.user.yaml"), GATES("chat"));
    assert.deepEqual(readPushApprovalMode(base), { mode: "signature", source: "uncommitted" });
  });

  check("CHP24 a sub-root copy is not cleared by the top level's committed blob", () => {
    // T3 Critic K1. `<rev>:<path>` resolves against the repository top level, not against
    // `-C`, so asking for `HEAD:pipeline.user.yaml` from a sub-directory returned the ROOT's
    // blob. An agent could copy the root's committed `chat` file into a sub-project and have
    // it accepted as unchanged though it was never committed there.
    const base = userYaml(root(V1()), GATES("chat"));
    assert.equal(readPushApprovalMode(base).mode, "chat", "precondition: the top level is chat");
    const sub = join(base, "sub");
    mkdirSync(join(sub, "project"), { recursive: true });
    writeFileSync(join(sub, CRITICAL_HUMAN_PROOF_POLICY_PATH), `${JSON.stringify(V1(), null, 2)}\n`);
    // Byte-identical to the committed top-level file, but never committed at THIS path.
    writeFileSync(join(sub, "pipeline.user.yaml"), GATES("chat"));
    assert.deepEqual(readPushApprovalMode(sub), { mode: "signature", source: "uncommitted" },
      "a sub-root copy borrowed the top level's committed blob");
    assert.equal(criticalProofWaiverFor(sub, "push").waived, false);
  });

  check("CHP25 a sub-root copy that IS committed at its own path is honoured", () => {
    // The mirror of K1, which the same defect broke in the other direction: a sub-project
    // that legitimately committed its own file could never reach `chat`. Without this the
    // fix could be "always false for sub-roots" and CHP24 would still pass.
    const base = root(V1());
    const sub = join(base, "sub");
    mkdirSync(join(sub, "project"), { recursive: true });
    writeFileSync(join(sub, CRITICAL_HUMAN_PROOF_POLICY_PATH), `${JSON.stringify(V1(), null, 2)}\n`);
    writeFileSync(join(sub, "pipeline.user.yaml"), GATES("chat"));
    spawnSync("git", ["init", "-q", base]);
    spawnSync("git", ["-C", base, "config", "user.email", "fixture@example.invalid"]);
    spawnSync("git", ["-C", base, "config", "user.name", "fixture"]);
    spawnSync("git", ["-C", base, "add", "-A"]);
    spawnSync("git", ["-C", base, "commit", "-qm", "fixture"]);
    assert.equal(readPushApprovalMode(sub).mode, "chat",
      "a sub-project's own committed setting was ignored");
  });

  check("CHP26 a root reached through a symlink still honours its committed setting", () => {
    // T4 Critic F1, half one. `git rev-parse --show-toplevel` is physical; `resolve()` is
    // lexical. Relating them directly made `relative()` emit a `..` path for any symlinked
    // root, so a correctly committed file read as uncommitted. No fixture used a symlinked
    // root, which is exactly why the whole suite stayed green through the defect.
    const real = userYaml(root(V1()), GATES("chat"));
    assert.equal(readPushApprovalMode(real).mode, "chat", "precondition: the direct path is chat");
    assert.equal(readPushApprovalMode(linkedRoot(real)).mode, "chat",
      "a symlinked root reported its committed setting as uncommitted");
  });

  check("CHP27 a symlinked root does not suppress the mode conflict", () => {
    // F1, half two, and the half that decided the verdict: degrading the source silently
    // skipped CRITICAL-PROOF-MODE-CONFLICT, so a policy waiver applied and approve-push
    // stopped demanding the detached proof. Reached here through the symlink; CHP28 pins
    // the same property without one.
    const base = userYaml(
      root(V2([{ kind: "push", reason: "policy-file waiver contradicting the source" }])),
      GATES("signature"),
    );
    const result = criticalProofWaiverFor(linkedRoot(base), "push");
    assert.equal(result.waived, false, "a symlinked root let a policy waiver stand the proof down");
    assert.equal(result.code, "CRITICAL-PROOF-MODE-CONFLICT");
  });

  check("CHP28 no unestablished source lets a policy waiver stand the proof down", () => {
    // The general property. `default` -- absent file, or a file without the key -- is the
    // ONLY value meaning the source has no opinion; everything else means "could not be
    // established" and must fail closed. Written against the safe value rather than against
    // a list of unsafe ones, so a source value added later fails closed by default. That is
    // precisely how the C1 fix opened this hole: it added `uncommitted` to a branch that
    // enumerated the unsafe cases.
    const waiver = () => V2([{ kind: "push", reason: "policy-file waiver contradicting the source" }]);
    for (const [label, text] of [
      ["uncommitted", GATES("signature").replace('push: "blocking"', 'push:  "blocking"')],
      ["invalid", 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "whatever"\n'],
      ["unreadable", ": : not yaml\n  - [\n"],
    ]) {
      const base = userYaml(root(waiver()), GATES("signature"));
      writeFileSync(join(base, "pipeline.user.yaml"), text);
      const result = criticalProofWaiverFor(base, "push");
      assert.equal(result.waived, false, `${label}: a waiver was honoured`);
      assert.equal(result.code, "CRITICAL-PROOF-MODE-CONFLICT", `${label}: wrong code`);
    }
  });

  check("CHP29 an absent key still lets an explicit policy waiver govern", () => {
    // The other side of CHP28, so the tightening cannot pass by refusing everything.
    const base = userYaml(
      root(V2([{ kind: "push", reason: "the operator stood the proof down deliberately" }])),
      GATES(null),
    );
    assert.equal(readPushApprovalMode(base).source, "default");
    assert.equal(criticalProofWaiverFor(base, "push").waived, true,
      "a deliberate waiver was refused although the source has no opinion");
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
