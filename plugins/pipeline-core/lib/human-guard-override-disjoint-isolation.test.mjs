#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALF-K17 / pipeline.disjoint-signed-hgo-actions-invalidate-one-another (AC-160), isolation matrix.
//
// human-guard-override-disjoint.test.mjs proves that each drift case fails closed. It does not prove
// the other half of the defect: that a drift of ONE signed action refuses ONLY that action while
// its disjoint, independently signed siblings stay consumable. This file closes that half through
// the real module, with in-temp-repo fixtures and a test keypair generated here (no real key):
//   - per-action drift (target byte, deletion, absence, file symlink, ancestor link, ancestor
//     created, expiry, replay): the affected action is refused and audited, the siblings consume
//     in two sequential deliveries, and the refusal leaves the refused capability intact;
//   - capability-global bindings (project policy, plugin, lifecycle state, HEAD/tree, audit
//     ledger): these are bound by design to the whole override context, so the same drift
//     refuses EVERY armed action. The cases pin that, rather than claim an isolation the
//     contract does not give;
//   - consuming one action leaves the other armed capability files byte-identical.

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  authorizeHumanGuardOverrideBySignature,
  consumeHumanGuardOverride,
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "./human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const denial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }];

const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const KEY_REFERENCE = "hgo-isolation-test-key";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const PLAN_SENTINEL = sha("pipeline.human-guard-override-signature-plan.v1");
const SPEC_SENTINEL = sha("pipeline.human-guard-override-signature-spec.v1");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

const scratchBase = () => {
  const base = join(PLUGIN_ROOT, "..", "..", "scratch", "hgo-tmp");
  mkdirSync(base, { recursive: true });
  return base;
};
// Every fixture root is a direct child of scratchBase() and `git init`s itself first; the ceiling keeps
// git from ever discovering the enclosing project repository (incident 2026-10-16).
process.env.GIT_CEILING_DIRECTORIES = scratchBase();

function fixture() {
  const root = mkdtempSync(join(scratchBase(), "hgo-isolation-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: KEY_REFERENCE, publicKeySha256: sha(publicKey) },
  }));
  writeFileSync(join(root, "existing-a.md"), "a\n");
  writeFileSync(join(root, "existing-b.md"), "b\n");
  writeFileSync(join(root, "existing-c.md"), "c\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

const writeInput = (file) => ({ file_path: file, content: "signed\n" });
const patchInput = (file) => ({ command: `*** Begin Patch\n*** Update File: ${file}\n@@\n-old\n+new\n*** End Patch` });
const TOOLS = [["Write", writeInput], ["apply_patch", patchInput]];

function signAndArm(root, { toolName, toolInput, nowMs = 1000, ttlMs, pluginRoot = PLUGIN_ROOT }) {
  const shared = { rootDir: root, pluginRoot, scriptPath: join(pluginRoot, "scripts", "guard-human-override.mjs") };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials: denial, nowMs, ttlMs });
  assert.equal(recorded.status, "planned", JSON.stringify(recorded));
  const plan = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256, nowMs: nowMs + 500 });
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, nowMs: nowMs + 1000,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override",
    featureId: "human-guard-override",
    planSha256: PLAN_SENTINEL,
    specSha256: SPEC_SENTINEL,
    candidate: { commit: plan.repository.head, tree: plan.repository.tree },
    policyRevision: "human-guard-override-signature-v1",
    subjectSha256: prepared.selectionSha256,
    decision: "authorize",
  });
  const proof = {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference: KEY_REFERENCE,
    publicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
  };
  const armed = authorizeHumanGuardOverrideBySignature({
    ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: nowMs + 2000,
  });
  assert.equal(armed.status, "armed", JSON.stringify(armed));
  return { toolName, toolInput, recorded, plan, proof, shared };
}

const consume = (root, action, { nowMs = 10_000, pluginRoot = PLUGIN_ROOT } = {}) =>
  consumeHumanGuardOverride({ rootDir: root, pluginRoot, toolName: action.toolName, toolInput: action.toolInput, denials: denial, nowMs });

const commonDir = (root) => git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
const auditPath = (root) => join(commonDir(root), "agent-pipeline", "human-guard-overrides", "audit.jsonl");
const auditEvents = (root) => readFileSync(auditPath(root), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line).event);
const eventsFor = (root, action, type) => auditEvents(root).filter((event) => event?.type === type && event.requestSha256 === action.recorded.requestSha256);

/** Armed capability files of one fixture, keyed by file name, as exact bytes. */
function capabilityBytes(root) {
  const dir = join(commonDir(root), "agent-pipeline", "human-guard-overrides", "capabilities");
  return Object.fromEntries(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), "utf8")]));
}

/** Delivers an action the way the tool would: consume the capability, then write its target. */
function deliver(root, action, file, opts) {
  const consumed = consume(root, action, opts);
  assert.equal(consumed.status, "consumed", `${file}: ${JSON.stringify(consumed)}`);
  writeFileSync(join(root, file), "delivered\n");
}

/**
 * A sibling is never refused for ITS OWN drift. Consuming a different action examines every armed capability, and the
 * module no longer audits anything against a non-matching one (ALF-K22; the cases after the per-action matrix pin
 * that). The tolerance of a cross-examination row naming toolInputSha256 is kept as a weaker, historical bound; a row
 * WITHOUT toolInputSha256 would mean the sibling itself drifted.
 */
function assertNoOwnDrift(root, action) {
  for (const event of eventsFor(root, action, "rejected")) {
    assert.ok(event.driftedChecks.includes("toolInputSha256"), `sibling refused for its own drift: ${JSON.stringify(event)}`);
  }
  assert.equal(eventsFor(root, action, "expired").length, 0, "sibling must not be audited as expired");
}

function assertRefusedOnlyAffected(root, victim, result, code, driftedChecks) {
  assert.equal(result.status, "replan", JSON.stringify(result));
  assert.equal(result.code, code);
  if (driftedChecks) {
    const rejected = eventsFor(root, victim, "rejected");
    assert.ok(rejected.length > 0, "the refusal must be audited against the affected request");
    assert.deepEqual(rejected.at(-1).driftedChecks, driftedChecks);
  }
}

// ---------------------------------------------------------------------------------------------
// (a) Two sequential deliveries; the first consumption leaves the others untouched.
// ---------------------------------------------------------------------------------------------

for (const [toolName, build] of TOOLS) {
  test(`${toolName}: two sequential deliveries leave the remaining signed capability byte-identical and unrejected`, () => {
    const root = fixture();
    try {
      const [a, b, c] = ["one.md", "two.md", "three.md"].map((file) => signAndArm(root, { toolName, toolInput: build(file) }));
      const before = capabilityBytes(root);
      const capabilityFile = (action) => `${action.plan.planSha256}.json`;
      assert.ok(Object.hasOwn(before, capabilityFile(c)), `capability files: ${Object.keys(before)}`);

      deliver(root, a, "one.md");
      const afterFirst = capabilityBytes(root);
      assert.equal(afterFirst[capabilityFile(b)], before[capabilityFile(b)], "delivering the first action must not rewrite the second capability");
      assert.equal(afterFirst[capabilityFile(c)], before[capabilityFile(c)], "delivering the first action must not rewrite the third capability");
      assert.notEqual(afterFirst[capabilityFile(a)], before[capabilityFile(a)], "control: the consumed capability itself does change");

      deliver(root, b, "two.md");
      const afterSecond = capabilityBytes(root);
      assert.equal(afterSecond[capabilityFile(c)], before[capabilityFile(c)], "delivering the second action must not rewrite the third capability");

      deliver(root, c, "three.md");
      for (const action of [a, b, c]) assertNoOwnDrift(root, action);
      for (const action of [a, b, c]) assert.equal(eventsFor(root, action, "consumed").length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// (b) Per-action drift: ONLY the affected action is refused, the siblings stay consumable.
// ---------------------------------------------------------------------------------------------

/**
 * Each drift names the victim file (signed as the victim action), how to set up its preimage before
 * signing (`prepare`) and how to move the world afterwards (`drift`). `links` marks drifts that need links.
 */
const PER_ACTION_DRIFTS = [
  {
    label: "target byte change",
    victim: "existing-b.md",
    drift: (root) => writeFileSync(join(root, "existing-b.md"), "target bytes changed\n"),
  },
  {
    label: "target deletion",
    victim: "existing-b.md",
    drift: (root) => unlinkSync(join(root, "existing-b.md")),
  },
  {
    label: "target absence turning into a file",
    victim: "absent-victim.md",
    drift: (root) => writeFileSync(join(root, "absent-victim.md"), "appeared\n"),
  },
  {
    label: "file symlink substituted for the target",
    victim: "existing-b.md",
    links: true,
    drift: (root) => { unlinkSync(join(root, "existing-b.md")); symlinkSync(join(root, "README.md"), join(root, "existing-b.md")); },
  },
  {
    label: "ancestor directory replaced by a directory link",
    victim: "sub/dir/victim.md",
    links: true,
    prepare: (root) => mkdirSync(join(root, "sub", "dir"), { recursive: true }),
    drift: (root) => {
      rmSync(join(root, "sub"), { recursive: true, force: true });
      mkdirSync(join(root, "elsewhere", "dir"), { recursive: true });
      symlinkSync(join(root, "elsewhere"), join(root, "sub"), process.platform === "win32" ? "junction" : "dir");
    },
  },
  {
    label: "ancestor directory created",
    victim: "newdir/deep/victim.md",
    drift: (root) => mkdirSync(join(root, "newdir"), { recursive: true }),
  },
];

for (const [toolName, build] of TOOLS) {
  for (const spec of PER_ACTION_DRIFTS) {
    test(`${toolName}: ${spec.label} refuses only the affected action; both siblings are delivered`, (t) => {
      const root = fixture();
      try {
        spec.prepare?.(root);
        const first = signAndArm(root, { toolName, toolInput: build("existing-a.md") });
        const victim = signAndArm(root, { toolName, toolInput: build(spec.victim) });
        const last = signAndArm(root, { toolName, toolInput: build("existing-c.md") });
        const armedVictim = capabilityBytes(root)[`${victim.plan.planSha256}.json`];
        assert.equal(typeof armedVictim, "string");
        try { spec.drift(root); }
        catch (error) { if (spec.links) { t.skip(`links unavailable on this host: ${error?.code}`); return; } throw error; }

        // The victim is consumed FIRST among the three: its refusal must not poison what follows.
        assertRefusedOnlyAffected(root, victim, consume(root, victim), "HGO-DRIFT", ["nativeTargets"]);
        // Two sequential deliveries of the unaffected siblings, each changing the whole-repository status.
        deliver(root, first, "existing-a.md");
        deliver(root, last, "existing-c.md");
        assertNoOwnDrift(root, first);
        assertNoOwnDrift(root, last);
        assert.equal(eventsFor(root, first, "consumed").length + eventsFor(root, last, "consumed").length, 2);
        assert.equal(eventsFor(root, victim, "consumed").length, 0, "the affected action must never be recorded as consumed");

        // The refusal rewrites nothing: the victim's capability file is byte-identical to its armed form.
        // (Restoring the bytes would NOT re-admit it: the signed target preimage also binds mtime/ctime, so a
        // drifted target needs a fresh signature by design. That stricter-than-bytes rule is not pinned here.)
        assert.equal(capabilityBytes(root)[`${victim.plan.planSha256}.json`], armedVictim, "a refusal must not rewrite the refused capability");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  test(`${toolName}: a target byte change on the last-consumed action does not affect the two already delivered`, () => {
    const root = fixture();
    try {
      const [a, b, victim] = ["existing-a.md", "existing-b.md", "existing-c.md"].map((file) => signAndArm(root, { toolName, toolInput: build(file) }));
      deliver(root, a, "existing-a.md");
      deliver(root, b, "existing-b.md");
      writeFileSync(join(root, "existing-c.md"), "target bytes changed\n");
      assertRefusedOnlyAffected(root, victim, consume(root, victim), "HGO-DRIFT", ["nativeTargets"]);
      assert.equal(eventsFor(root, a, "consumed").length, 1);
      assert.equal(eventsFor(root, b, "consumed").length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: expiry of one action expires only that action`, () => {
    const root = fixture();
    try {
      // The shortest-lived action is signed first; the others carry the default window.
      const short = signAndArm(root, { toolName, toolInput: build("existing-a.md"), ttlMs: 60_000 });
      const second = signAndArm(root, { toolName, toolInput: build("existing-b.md") });
      const third = signAndArm(root, { toolName, toolInput: build("existing-c.md") });
      const later = 200_000; // past the short window (61 s), far inside the default 30 minute window
      const expired = consume(root, short, { nowMs: later });
      assert.equal(expired.status, "replan", JSON.stringify(expired));
      // The result CODE is pinned in the "reports HGO-EXPIRED even while unexpired siblings are armed" case below.
      assert.equal(eventsFor(root, short, "expired").length >= 1, true, "the expiry must be audited against the short action");
      deliver(root, second, "existing-b.md", { nowMs: later });
      deliver(root, third, "existing-c.md", { nowMs: later });
      assertNoOwnDrift(root, second);
      assertNoOwnDrift(root, third);
      assert.equal(eventsFor(root, short, "consumed").length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: replay of one consumed action is refused without touching the unconsumed siblings`, () => {
    const root = fixture();
    try {
      const [a, b, c] = ["existing-a.md", "existing-b.md", "existing-c.md"].map((file) => signAndArm(root, { toolName, toolInput: build(file) }));
      deliver(root, a, "existing-a.md");
      const replay = consume(root, a, { nowMs: 11_000 });
      assert.notEqual(replay.status, "consumed", JSON.stringify(replay));
      let rearmed;
      try {
        rearmed = authorizeHumanGuardOverrideBySignature({
          ...a.shared, requestSha256: a.recorded.requestSha256, planSha256: a.plan.planSha256, proof: a.proof, nowMs: 12_000,
        });
      } catch (error) { rearmed = { status: "refused", code: error?.code }; }
      assert.notEqual(rearmed.status, "armed", `a consumed signature must not re-arm: ${JSON.stringify(rearmed)}`);
      deliver(root, b, "existing-b.md", { nowMs: 13_000 });
      deliver(root, c, "existing-c.md", { nowMs: 13_000 });
      assert.equal(eventsFor(root, a, "consumed").length, 1, "the replayed action is consumed exactly once");
      assertNoOwnDrift(root, b);
      assertNoOwnDrift(root, c);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: a tool-input change on one action does not consume or disturb the signed set`, () => {
    const root = fixture();
    try {
      const [a, b, c] = ["existing-a.md", "existing-b.md", "existing-c.md"].map((file) => signAndArm(root, { toolName, toolInput: build(file) }));
      // The same tool, a different (unsigned) target: no signed action matches, none is consumed.
      const stray = { toolName, toolInput: build("never-signed.md") };
      assert.notEqual(consume(root, stray).status, "consumed");
      deliver(root, a, "existing-a.md");
      deliver(root, b, "existing-b.md");
      deliver(root, c, "existing-c.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Diagnostics of a consumption must not leak across siblings (ALF-K22, PO decision 2026-10-22: skip
// non-matching capabilities first). These two cases were registered as node:test `todo` by ALF-K17
// while the module audited a spurious HGO-DRIFT row for every non-matching sibling; they now pass.
// ---------------------------------------------------------------------------------------------

for (const [toolName, build] of TOOLS) {
  test(`${toolName}: an expired action reports HGO-EXPIRED even while unexpired siblings are armed`, () => {
    const root = fixture();
    try {
      const short = signAndArm(root, { toolName, toolInput: build("existing-a.md"), ttlMs: 60_000 });
      signAndArm(root, { toolName, toolInput: build("existing-b.md") });
      const expired = consume(root, short, { nowMs: 200_000 });
      assert.equal(expired.status, "replan");
      assert.equal(expired.code, "HGO-EXPIRED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: delivering one action audits no rejection against its undisturbed siblings`, () => {
    const root = fixture();
    try {
      const armed = ["existing-a.md", "existing-b.md", "existing-c.md"].map((file) => ({
        file, ...signAndArm(root, { toolName, toolInput: build(file) }),
      }));
      // Capabilities are examined in file-name (plan digest) order and the scan stops at the match, so deliver the
      // action that sorts LAST: that makes every sibling a candidate passed over before the match.
      armed.sort((x, y) => (x.plan.planSha256 < y.plan.planSha256 ? -1 : 1));
      const last = armed.pop();
      deliver(root, last, last.file);
      for (const sibling of armed) assert.deepEqual(eventsFor(root, sibling, "rejected"), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ALF-K22 additions (new cases; no existing case was changed).
  test(`${toolName}: a call matching no signed action is refused as before but audits nothing against any armed sibling`, () => {
    const root = fixture();
    try {
      const actions = ["existing-a.md", "existing-b.md", "existing-c.md"].map((file) => signAndArm(root, { toolName, toolInput: build(file) }));
      const before = capabilityBytes(root);
      const eventsBefore = auditEvents(root).length;
      const refused = consume(root, { toolName, toolInput: build("never-signed.md") });
      assert.equal(refused.status, "replan", JSON.stringify(refused));
      // The refusal verdict is unchanged (a different native target reads as drift of the bound target set) ...
      assert.equal(refused.code, "HGO-DRIFT");
      // ... but it is derived read-only: no audit row, no capability rewrite.
      assert.equal(auditEvents(root).length, eventsBefore, "a call matching no signed action must append no audit row");
      assert.deepEqual(capabilityBytes(root), before, "a call matching no signed action must not rewrite any capability");
      for (const [index, action] of actions.entries()) deliver(root, action, ["existing-a.md", "existing-b.md", "existing-c.md"][index], { nowMs: 11_000 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: an expired sibling is neither audited nor reported for a call that is not its action`, () => {
    const root = fixture();
    try {
      const short = signAndArm(root, { toolName, toolInput: build("existing-a.md"), ttlMs: 60_000 });
      const live = signAndArm(root, { toolName, toolInput: build("existing-b.md") });
      const later = 200_000;
      // The unexpired action matches and is consumed; the expired sibling is passed over without an audit row.
      deliver(root, live, "existing-b.md", { nowMs: later });
      assert.deepEqual(eventsFor(root, short, "expired"), []);
      assert.deepEqual(eventsFor(root, short, "rejected"), []);
      // The expired action itself still reads HGO-EXPIRED and is audited as expired.
      const expired = consume(root, short, { nowMs: later });
      assert.equal(expired.status, "replan", JSON.stringify(expired));
      assert.equal(expired.code, "HGO-EXPIRED");
      assert.equal(eventsFor(root, short, "expired").length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// (c) Capability-global bindings: the drift is not per action, so it refuses EVERY armed action.
// ---------------------------------------------------------------------------------------------

function armThree(root, toolName, build, extra = {}) {
  return ["existing-a.md", "existing-b.md", "existing-c.md"].map((file) => signAndArm(root, { toolName, toolInput: build(file), ...extra }));
}

function assertNoneConsumable(root, actions, opts = {}) {
  for (const action of actions) {
    const result = consume(root, action, opts);
    assert.notEqual(result.status, "consumed", `${action.toolInput.file_path ?? "patch"}: ${JSON.stringify(result)}`);
  }
  for (const action of actions) assert.equal(eventsFor(root, action, "consumed").length, 0);
}

for (const [toolName, build] of TOOLS) {
  test(`${toolName}: project guard-policy drift fails closed for every armed action and is recoverable by restoring the policy`, () => {
    const root = fixture();
    try {
      const actions = armThree(root, toolName, build);
      writeFileSync(join(root, "project", "guard-config.json"), '{"drift":true}\n');
      for (const action of actions) {
        const result = consume(root, action);
        assert.equal(result.status, "replan");
        assert.equal(result.code, "HGO-DRIFT");
        assert.deepEqual(eventsFor(root, action, "rejected").at(-1).driftedChecks, ["policy"]);
      }
      unlinkSync(join(root, "project", "guard-config.json"));
      for (const [index, action] of actions.entries()) deliver(root, action, ["existing-a.md", "existing-b.md", "existing-c.md"][index], { nowMs: 11_000 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: plugin drift fails closed for every armed action`, () => {
    const root = fixture();
    // The plugin identity binds the plugin root's location as well as its bytes, so the mirror is the plugin
    // root for the whole flow: only its content differs between arming and consumption.
    const mirror = mkdtempSync(join(scratchBase(), "hgo-isolation-plugin-"));
    try {
      for (const file of [
        ".codex-plugin/plugin.json",
        "hooks/codex-pretool-guard.mjs",
        "hooks/guard-command-grammar.mjs",
        "hooks/guard-lifecycle-ready.mjs",
        "lib/human-guard-override.mjs",
        "lib/windows-private-state.mjs",
        "scripts/guard-human-override.mjs",
      ]) {
        mkdirSync(dirname(join(mirror, file)), { recursive: true });
        copyFileSync(join(PLUGIN_ROOT, file), join(mirror, file));
      }
      const actions = armThree(root, toolName, build, { pluginRoot: mirror });
      appendFileSync(join(mirror, "hooks", "guard-command-grammar.mjs"), "\n// drift\n");
      for (const action of actions) {
        const result = consume(root, action, { pluginRoot: mirror });
        assert.equal(result.status, "replan");
        assert.equal(result.code, "HGO-DRIFT");
        assert.deepEqual(eventsFor(root, action, "rejected").at(-1).driftedChecks, ["plugin"]);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(mirror, { recursive: true, force: true });
    }
  });

  test(`${toolName}: lifecycle state and HEAD/tree drift fail closed for every armed action`, () => {
    const root = fixture();
    try {
      const actions = armThree(root, toolName, build);
      writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({ continuity: { revision: 7 } }));
      for (const action of actions) {
        const result = consume(root, action);
        assert.equal(result.code, "HGO-DRIFT", JSON.stringify(result));
        assert.deepEqual(eventsFor(root, action, "rejected").at(-1).driftedChecks, ["repository"]);
      }
      unlinkSync(join(root, "project", "pipeline-state.json"));
      writeFileSync(join(root, "committed-later.md"), "x\n");
      git(root, "add", "committed-later.md");
      git(root, "commit", "-q", "-m", "move head");
      assertNoneConsumable(root, actions, { nowMs: 11_000 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: audit-ledger tampering fails closed for every armed action`, () => {
    const root = fixture();
    try {
      const actions = armThree(root, toolName, build);
      const audit = auditPath(root);
      const original = readFileSync(audit, "utf8");
      const tampered = original.replace('"type":"denied"', '"type":"allowed"');
      assert.notEqual(tampered, original, "the fixture must actually alter the ledger");
      writeFileSync(audit, tampered, { mode: 0o600 });
      for (const action of actions) {
        const result = consume(root, action);
        assert.equal(result.status, "invalid", JSON.stringify(result));
        assert.equal(result.code, "HGO-AUDIT");
      }
      for (const action of actions) assert.equal(eventsFor(root, action, "consumed").length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
