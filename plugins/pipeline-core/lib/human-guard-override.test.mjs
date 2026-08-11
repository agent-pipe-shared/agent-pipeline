#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  authorizeHumanGuardOverride,
  authorizeHumanGuardOverrideBySignature,
  consumeHumanGuardOverride,
  HGO_SIGNATURE_REASON,
  HumanGuardOverrideError,
  humanGuardOverrideInternals,
  humanGuardRouteUnavailableReason,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
  verifyHumanGuardOverrideAudit,
} from "./human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { probeSymlinkCapability, symlinkCapability, symlinkSkip } from "./symlink-capability.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "human-guard-override-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  // ADR-0059 Decision 1 (defense in depth): authorizeHumanGuardOverride() now refuses
  // outright unless the COMMITTED gates.push_approval is "chat" -- this suite exercises
  // that in-session `activate: true` path throughout, so the fixture commits chat mode
  // by default. Individual signature-path tests below override this back to "signature"
  // via their own committed pipeline.user.yaml, exactly like guard-testpath-override's
  // OT15/OT17 fixtures already do for the guard layer.
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
  git(root, "add", "README.md", "pipeline.user.yaml");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

function reasonDigest(reason) {
  return createHash("sha256").update(Buffer.from(reason, "utf8")).digest("hex");
}

const denial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-LIFECYCLE-NOT-READY" }];

// ---------------------------------------------------------------------------------
// ADR-0059 Decision 1: authorizeHumanGuardOverrideBySignature() tests.
//
// This repository's own `gates.push_approval: "chat"` fixture() above exists so the
// pre-existing chat-mode suite keeps exercising `authorizeHumanGuardOverride()`'s
// `activate: true` path (ADR-0059 Decision 1's defense-in-depth check requires it).
// The signed path needs the OPPOSITE committed setting -- "signature" -- so this
// fixture variant mirrors fixture() exactly except for that one line, following the
// same OT15/OT17 "committed value wins" pattern guard-testpath-override.test.mjs's
// fixture already establishes for the guard layer.
function fixtureSignature({ trustAnchor = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "human-guard-override-sig-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  const added = ["README.md", "pipeline.user.yaml"];
  if (trustAnchor) {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["push"],
      trustAnchor: { keyReference: SIG_KEY_REFERENCE, publicKeySha256: sigPublicKeySha256 },
    }));
    added.push("project/critical-human-proof.json");
  }
  git(root, "add", ...added);
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

// One shared Ed25519 test keypair for the whole suite (never a real PO key -- exactly
// guard-maintenance-window.test.mjs's own `generateKeyPairSync` pattern, the closest
// precedent for a po-approval-proof.mjs test signer).
const sigPair = generateKeyPairSync("ed25519");
const sigPublicKey = sigPair.publicKey.export({ type: "spki", format: "pem" });
const sigPublicKeySha256 = createHash("sha256").update(sigPublicKey).digest("hex");
const SIG_KEY_REFERENCE = "hgo-test-key";

// The two fixed, content-independent sentinel digests authorizeHumanGuardOverrideBySignature()'s
// own doc comment names by their exact source string -- reproduced independently here,
// never imported, exactly as the doc comment says an external signer must derive them
// (no repository file I/O, no access to this module's unexported constants).
const HGO_SIGNATURE_INTENT_PLAN_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-plan.v1").digest("hex");
const HGO_SIGNATURE_INTENT_SPEC_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-spec.v1").digest("hex");

/** Runs denial -> plan -> prepare-authorization (fixed reason) -> builds a matching, genuinely signed proof. Does not call authorizeHumanGuardOverrideBySignature() itself. */
function prepareSignedArming(root, {
  toolName, toolInput, denials, nowMs = 1000, keyPair = sigPair, keyReference = SIG_KEY_REFERENCE,
} = {}) {
  const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
  const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials, nowMs });
  assert.equal(recorded.status, "planned", `denial not plannable: ${JSON.stringify(recorded)}`);
  const plan = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256, nowMs: nowMs + 500 });
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, nowMs: nowMs + 1000,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override",
    featureId: "human-guard-override",
    planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256,
    specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
    candidate: { commit: plan.repository.head, tree: plan.repository.tree },
    policyRevision: "human-guard-override-signature-v1",
    subjectSha256: prepared.selectionSha256,
    decision: "authorize",
  });
  const proof = {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference,
    publicKey: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), keyPair.privateKey).toString("base64"),
  };
  return { shared, scriptPath, recorded, plan, prepared, intent, proof };
}

test("ADR-0059 Decision 1: a valid, correctly-bound signed proof arms the identical v2 capability, consumable exactly like the chat path", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "signed recovery\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: recorded.requestSha256,
      planSha256: plan.planSha256,
      proof,
      nowMs: 3000,
      scriptPath,
    });
    assert.equal(armed.status, "armed");
    assert.equal(armed.mutated, true);
    assert.equal(armed.planSha256, plan.planSha256);
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const audit = join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    const auditEvents = readFileSync(audit, "utf8").trim().split("\n").map((line) => JSON.parse(line).event);
    assert.deepEqual(auditEvents.map(({ type }) => type), ["denied", "authorized", "consumed"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ADR-0059 Decision 1: re-authorizing with an identical proof is an idempotent no-op (mutated: false), a genuinely different re-arming is HGO-REPLAY", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "signed idempotent\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    const first = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath,
    });
    assert.equal(first.mutated, true);
    const second = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath,
    });
    assert.deepEqual(second, { schema: "pipeline.human-guard-override-capability.v2", status: "armed", planSha256: plan.planSha256, requestSha256: recorded.requestSha256, mutated: false });
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3999, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-REPLAY",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ADR-0059 Decision 1: an invalid, wrong-key or mismatched proof is refused with HGO-PROOF-INVALID", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "signed rejection\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    // A tampered signature: same intent digest and key, but the bytes signed no longer verify.
    const tampered = { ...proof, signatureBase64: `${proof.signatureBase64.slice(0, -4)}AAAA` };
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof: tampered, nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-PROOF-INVALID",
    );
    // A genuine signature from an unrelated key never matches the committed trust anchor.
    const wrongKeyPair = generateKeyPairSync("ed25519");
    const { proof: wrongKeyProof } = prepareSignedArming(root, {
      toolName: "Write", toolInput, denials: denial, keyPair: wrongKeyPair,
    });
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof: wrongKeyProof, nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-PROOF-INVALID",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ADR-0059 Decision 1: the global-plugin-install denial class is refused for the signed path with HGO-SIGNATURE-UNSUPPORTED-MODE", () => {
  const root = fixtureSignature();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    mkdirSync(join(root, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "verify.mjs"), "// verify\n");
    writeFileSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), JSON.stringify({
      name: "pipeline-core",
      version: "0.0.0-test",
    }));
    writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({
      name: "agent-pipeline",
      plugins: [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
    }));
    const toolInput = { command: "codex plugin add pipeline-core@agent-pipeline-local" };
    const noGit = () => ({ status: null, error: { code: "EPERM" }, stdout: "" });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1_000, spawn: noGit,
    });
    assert.equal(request.status, "planned");
    // Unlike the record above, plan/authorize run with the real default spawn -- the PO's
    // own step, from an ordinary terminal, never through the host-Git-unavailable adapter
    // (same precedent as the sibling chat-path local-plugin-install tests above).
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2_000, scriptPath,
    });
    assert.equal(plan.mode, "global-plugin-install");
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        planSha256: plan.planSha256,
        proof: { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: "a".repeat(64), keyReference: "x", publicKey: "y", signatureBase64: "z" },
        nowMs: 3_000,
        scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-SIGNATURE-UNSUPPORTED-MODE",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ADR-0059 Decision 1: an absent trustAnchor (no trustPolicy given, no committed anchor) is refused with HGO-TRUST-ANCHOR-MISSING", () => {
  const root = fixtureSignature({ trustAnchor: false });
  try {
    const toolInput = { file_path: "notes.md", content: "no trust anchor\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-TRUST-ANCHOR-MISSING",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("one exact attended capability is audited, consumed once and cannot be replayed", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "attended recovery\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    assert.equal(request.status, "planned");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(plan.status, "planned");
    assert.equal(plan.toolInputSha256.length, 64);
    assert.deepEqual(plan.eligiblePaths, ["notes.md"]);
    assert.equal(plan.preview.poAuthority, "final-for-this-exact-project-policy-decision");
    assert.match(plan.preview.postcondition, /byte-identical original tool action/u);
    assert.equal(plan.policy.guards[0].guard, "guard-lifecycle-ready.mjs");
    const reason = "PO attended recovery for the exact notes write";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(prepared.status, "prepared");
    assert.equal(prepared.authorizeAction.mutation, true);
    assert.equal(prepared.authorizeAction.requiresConfirmation, true);
    assert.equal(prepared.authorizeAction.argv.includes("<human-reason>"), false);
    assert.deepEqual(prepared.decisionPreview, plan.preview);
    const armed = authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: reasonDigest(reason),
      activate: true,
      nowMs: 3000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(armed.status, "armed");
    const consumed = consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const audit = join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    const auditEvents = readFileSync(audit, "utf8").trim().split("\n").map((line) => JSON.parse(line).event);
    assert.deepEqual(auditEvents.map(({ type }) => type), ["denied", "authorized", "consumed"]);
    assert.equal(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 5000,
    }).status, "absent");
    assert.deepEqual(verifyHumanGuardOverrideAudit({ rootDir: root }), {
      schema: "pipeline.human-guard-override-audit-verification.v1",
      status: "valid",
      entries: 3,
      lastMac: verifyHumanGuardOverrideAudit({ rootDir: root }).lastMac,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a host-Git-unavailable hook can consume only the exact audited local plugin installation", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    mkdirSync(join(root, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "verify.mjs"), "// verify\n");
    writeFileSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), JSON.stringify({
      name: "pipeline-core",
      version: "0.0.0-test",
    }));
    writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({
      // ADR-0052: a legitimate Pipeline source checkout's OWN marketplace
      // self-names the published identity "agent-pipeline"; the
      // "agent-pipeline-local" name is reserved for the separate, external
      // local-marketplace root, never a committed file inside a checkout.
      name: "agent-pipeline",
      plugins: [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
    }));
    const toolInput = { command: "codex plugin add pipeline-core@agent-pipeline-local" };
    const noGit = () => ({ status: null, error: { code: "EPERM" }, stdout: "" });
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput,
      denials: denial,
      nowMs: 1_000,
      spawn: noGit,
    });
    assert.equal(request.status, "planned");
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2_000,
      spawn: noGit,
      scriptPath,
    });
    assert.equal(plan.mode, "global-plugin-install");
    assert.equal(plan.commandClass, "local-plugin-install");
    assert.match(plan.preview.expectedEffects.external, /pipeline-core@agent-pipeline-local/u);
    const reason = "PO approves the exact local Nova plugin candidate installation";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2_500,
      spawn: noGit,
      scriptPath,
    });
    // Unlike every other call in this fixture, `authorize` deliberately uses the REAL
    // default spawn (real git): it is the PO's own step, run from an ordinary terminal
    // with normal Git access, never through the host-Git-unavailable Codex adapter this
    // test otherwise simulates -- and it is also where ADR-0059 Decision 1's defense-in-
    // depth mode check now lives, which needs to read the fixture's own committed
    // `pipeline.user.yaml` via real Git.
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: reasonDigest(reason),
      activate: true,
      nowMs: 3_000,
      scriptPath,
    });
    assert.equal(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput,
      denials: denial,
      nowMs: 4_000,
      spawn: noGit,
    }).status, "consumed");
    assert.equal(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: { command: "codex plugin remove pipeline-core@agent-pipeline-local" },
      denials: denial,
      nowMs: 5_000,
      spawn: noGit,
    }).status, "absent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local plugin installation capability rejects a changed candidate source", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    mkdirSync(join(root, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "verify.mjs"), "// verify\n");
    writeFileSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), JSON.stringify({
      name: "pipeline-core",
      version: "0.0.0-test",
    }));
    writeFileSync(join(root, "plugins", "pipeline-core", "candidate.mjs"), "export const candidate = 1;\n");
    writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({
      // See the sibling fixture above: the checkout's OWN manifest self-names
      // "agent-pipeline" (ADR-0052), not "agent-pipeline-local".
      name: "agent-pipeline",
      plugins: [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
    }));
    const toolInput = { command: "codex plugin add pipeline-core@agent-pipeline-local" };
    const noGit = () => ({ status: null, error: { code: "EPERM" }, stdout: "" });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1_000, spawn: noGit,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2_000, spawn: noGit, scriptPath,
    });
    const reason = "PO approves the exact local candidate installation";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2_500, spawn: noGit, scriptPath,
    });
    // See the sibling fixture above: `authorize` uses the real default spawn (the PO's
    // own step, plus ADR-0059 Decision 1's defense-in-depth mode check).
    authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      nowMs: 3_000, scriptPath,
    });
    writeFileSync(join(root, "plugins", "pipeline-core", "candidate.mjs"), "export const candidate = 2;\n");
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 4_000, spawn: noGit,
    }), { status: "replan", code: "HGO-DRIFT" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit and exact in-root patch admission never execute the effect or claim success", () => {
  for (const [toolName, toolInput, expectedClass] of [
    ["Bash", { command: "git commit -m exact-retry" }, "git-commit"],
    ["apply_patch", {
      command: "*** Begin Patch\n*** Add File: notes.md\n+exact patch retry\n*** End Patch",
    }, "exact-in-root-patch"],
  ]) {
    const root = fixture();
    try {
      const originalHead = git(root, "rev-parse", "HEAD");
      const request = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: 1000,
      });
      assert.equal(request.status, "planned");
      const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
      const plan = planHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        nowMs: 2000,
        scriptPath,
      });
      assert.equal(plan.commandClass, expectedClass);
      const reason = `PO approved ${expectedClass}`;
      const prepared = prepareHumanGuardOverrideAuthorization({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        planSha256: plan.planSha256,
        reason,
        nowMs: 2500,
        scriptPath,
      });
      authorizeHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        planSha256: plan.planSha256,
        selectionSha256: prepared.selectionSha256,
        reason,
        reasonSha256: prepared.reasonSha256,
        activate: true,
        nowMs: 3000,
        scriptPath,
      });
      assert.equal(consumeHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: 4000,
      }).status, "consumed");
      const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
      const events = readFileSync(
        join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl"),
        "utf8",
      ).trim().split("\n").map((line) => JSON.parse(line).event.type);
      assert.equal(events.at(-1), "consumed", "audit must be durable before admission returns");
      assert.equal(git(root, "rev-parse", "HEAD"), originalHead, "override admission must not execute git commit");
      assert.equal(existsSync(join(root, "notes.md")), false, "override admission must not apply the patch");
      assert.match(plan.preview.postcondition, /ordinary effect readback/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("drift, expiry and concurrent consumption fail closed", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "bounded\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
      ttlMs: 10000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const reason = "Exact attended retry";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: reasonDigest(reason),
      activate: true,
      nowMs: 3000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const lockDir = join(common, "agent-pipeline", "human-guard-overrides", "locks");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, `${plan.planSha256}.lock`), "contender", { mode: 0o600 });
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }), { status: "invalid", code: "HGO-CONCURRENT-CONSUME" });
    rmSync(join(lockDir, `${plan.planSha256}.lock`));
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { ...toolInput, content: "drifted\n" },
      denials: denial,
      nowMs: 4000,
    }), { status: "absent" });
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 12000,
    }), { status: "replan", code: "HGO-EXPIRED" });
    const fresh = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 12001,
      ttlMs: 10000,
    });
    assert.equal(fresh.status, "planned");
    assert.notEqual(fresh.requestSha256, request.requestSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("security and authority boundaries return typed recovery without an ambient bypass", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "physical"), { recursive: true });
    symlinkSync(join(root, "physical"), join(root, "linked"), "dir");
    writeFileSync(join(root, "physical", "linked-source.txt"), "shared\n");
    linkSync(join(root, "physical", "linked-source.txt"), join(root, "hardlinked.txt"));
    for (const [expected, toolName, toolInput] of [
      ["planned", "Write", { file_path: ".claude/pipeline-state.json", content: "{}" }],
      ["planned", "Write", { file_path: ".claude/pipeline.yaml", content: "runtime: drift\n" }],
      ["author-repair-required", "Write", { file_path: "plugins/pipeline-core/lib/human-guard-override.mjs", content: "tamper\n" }],
      // ADR-0059 Decision 6 (2026-08-08): a genuine out-of-root escape is now the honestly-
      // scoped "cross-repository-target" eligible class, reversing the former blanket
      // HGO-NONOVERRIDABLE-CROSS-BOUNDARY refusal for exactly this row. The symlink- and
      // hardlink-attack rows immediately below stay "external-operator-required" -- they
      // fail safePath()'s IN-ROOT walk, never the escape test, so they are structurally
      // untouched by this change (see the eligibility() internals test further down).
      ["planned", "Write", { file_path: "../outside.txt", content: "x" }],
      ["external-operator-required", "Write", { file_path: "linked/escape.txt", content: "x" }],
      ["external-operator-required", "Write", { file_path: "hardlinked.txt", content: "x" }],
      ["narrower-recovery-required", "Bash", { command: "git push origin HEAD:refs/heads/main" }],
      ["narrower-recovery-required", "Bash", { command: "/usr/bin/git push origin HEAD:refs/heads/main" }],
      ["narrower-recovery-required", "Bash", { command: "/bin/sh -c 'git push origin HEAD:refs/heads/main'" }],
      ["planned", "Bash", { command: "git harmless-alias notes.md" }],
      ["planned", "Bash", { command: "python3 -c 'open(\"owned\", \"w\").write(\"x\")'" }],
      ["planned", "Bash", { command: "perl -e 'open my $fh, \">\", \"owned\"'" }],
      ["planned", "Bash", { command: "node safe.mjs" }],
      // ADR-0059 Decision 6: also now a genuine out-of-root escape, same reasoning as the
      // Write row above (the token-scanning loop classifies it before this command's own
      // dedicated `node --check` handling would even run).
      ["planned", "Bash", { command: "node --check ../../outside.mjs" }],
      ["planned", "Bash", { command: "node --check .claude/pipeline-state.json" }],
      ["external-operator-required", "Bash", { command: "node safe.mjs --tok" + "en=fixture-not-a-secret" }],
      ["planned", "Bash", { command: "touch safe && touch second" }],
      ["planned", "apply_patch", { command: "*** Begin Patch\n*** Update File: .claude/pipeline-state.json\n@@\n-{}\n+{\"x\":1}\n*** End Patch" }],
      ["author-repair-required", "apply_patch", { command: "*** Begin Patch\n*** Update File: plugins/pipeline-core/hooks/codex-pretool-guard.mjs\n@@\n-old\n+tampered\n*** End Patch" }],
      // ADR-0059 Decision 6: same reasoning, apply_patch's own "Move to" target.
      ["planned", "apply_patch", { command: "*** Begin Patch\n*** Update File: notes.md\n*** Move to: ../outside.md\n@@\n-old\n+new\n*** End Patch" }],
    ]) {
      const observed = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
      });
      assert.equal(
        observed.status,
        expected,
        `${toolName} ${JSON.stringify(toolInput)}`,
      );
      if (new Set(["narrower-recovery-required", "external-operator-required"]).has(observed.status)) {
        assert.equal(typeof observed.nextAction, "object");
        assert.equal(typeof observed.nextAction.action, "object");
      }
    }
    writeFileSync(join(root, "safe.mjs"), "export {};\n");
    const syntaxCheck = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: { command: "node --check safe.mjs" },
      denials: denial,
    });
    assert.equal(syntaxCheck.status, "planned");
    const syntaxPlan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: syntaxCheck.requestSha256,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.deepEqual(syntaxPlan.eligiblePaths, ["safe.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every push-guard denial routes to an exact publication preflight even through an alias", () => {
  const root = fixture();
  try {
    const observed = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: { command: "release-alias current" },
      denials: [{ guard: "guard-push.mjs", reason: "PG-CAPABILITY: publication authority required" }],
    });
    assert.equal(observed.status, "narrower-recovery-required");
    assert.equal(observed.code, "HGO-NARROWER-PUBLICATION-REQUIRED");
    assert.equal(observed.nextAction.kind, "typed-recovery");
    assert.equal(observed.nextAction.action.executable, process.execPath);
    assert.match(observed.nextAction.action.argv[0], /publication-executor\.mjs$/u);
    assert.equal(observed.nextAction.action.argv.includes("release-alias"), false);
    assert.equal(observed.nextAction.action.argv.includes(git(root, "rev-parse", "HEAD")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- GF-098: a denied push is routed by ITS OWN destination, never by a constant -------
// The publication executor's `--destination-ref` is the literal `refs/heads/main`. Until
// this block existed, every denied push was pointed at it -- so a session holding a valid,
// branch-bound approval for `refs/heads/<feature>` was shown the one recovery that
// contradicts its own signature, and had no route to its branch at all.

function pushDenial(root, command, denials) {
  return recordHumanGuardDenial({
    rootDir: root,
    pluginRoot: PLUGIN_ROOT,
    toolName: "Bash",
    toolInput: { command },
    denials,
  });
}

const PUSH_GUARD_DENIAL = [{ guard: "guard-push.mjs", reason: "PG-CAPABILITY: publication authority required" }];

test("GF-098: a denied push destined for main keeps the exact publication-executor route", () => {
  const root = fixture();
  try {
    for (const command of [
      "git push origin HEAD:refs/heads/main",
      "git push origin main",
      "/usr/bin/git push origin HEAD:refs/heads/main",
      "/bin/sh -c 'git push origin HEAD:refs/heads/main'",
    ]) {
      for (const denials of [PUSH_GUARD_DENIAL, denial]) {
        const observed = pushDenial(root, command, denials);
        assert.equal(observed.status, "narrower-recovery-required", command);
        assert.equal(observed.code, "HGO-NARROWER-PUBLICATION-REQUIRED", command);
        assert.equal(observed.nextAction.kind, "typed-recovery");
        assert.equal(observed.nextAction.action.executable, process.execPath);
        assert.match(observed.nextAction.action.argv[0], /publication-executor\.mjs$/u);
        assert.equal(observed.nextAction.action.mutation, false);
        const argv = observed.nextAction.action.argv;
        assert.equal(argv[argv.indexOf("--remote-name") + 1], "origin");
        assert.equal(argv[argv.indexOf("--destination-ref") + 1], "refs/heads/main");
        assert.equal(argv.includes(git(root, "rev-parse", "HEAD")), true);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GF-098: a denied push destined for a non-main branch names THAT branch's approve-push ceremony", () => {
  const root = fixture();
  try {
    for (const [command, remote, destination] of [
      ["git push origin HEAD:refs/heads/Rune_Test1_Codex_054_45", "origin", "refs/heads/Rune_Test1_Codex_054_45"],
      ["git -C . push upstream HEAD:refs/heads/feat/sprint-nova", "upstream", "refs/heads/feat/sprint-nova"],
      ["/bin/sh -c 'git push origin HEAD:refs/heads/Rune_Test1_Codex_054_45'", "origin", "refs/heads/Rune_Test1_Codex_054_45"],
    ]) {
      // Both entry paths: the guard-push denial (code HGO-PUBLICATION-REQUIRED) and any
      // other guard's denial of the same raw push (the command-regex disjunct).
      for (const denials of [PUSH_GUARD_DENIAL, denial]) {
        const observed = pushDenial(root, command, denials);
        assert.equal(observed.status, "narrower-recovery-required", command);
        assert.equal(observed.code, "HGO-NARROWER-BRANCH-PUSH-APPROVAL-REQUIRED", command);
        assert.equal(observed.nextAction.kind, "typed-recovery");
        assert.equal(observed.nextAction.action.executable, process.execPath);
        const argv = observed.nextAction.action.argv;
        assert.match(argv[0], /pipeline-state\.mjs$/u);
        assert.equal(argv[1], "approve-push");
        assert.equal(argv[argv.indexOf("--remote") + 1], remote, command);
        assert.equal(argv[argv.indexOf("--destination") + 1], destination, command);
        // The main-only publication route, and its constants, must be nowhere near this.
        assert.equal(argv.some((token) => /publication-executor/u.test(token)), false);
        assert.equal(argv.includes("refs/heads/main"), false, command);
        assert.equal(observed.nextAction.action.mutation, true);
        assert.match(observed.nextAction.limitation, /THIS remote and THIS destination ref/u);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GF-098: a denied push whose destination cannot be read is told so, never routed at main", () => {
  const root = fixture();
  try {
    for (const command of [
      "git push origin HEAD", // shorthand: names no destination
      "git push origin", // no refspec at all
      "git push --force origin HEAD:refs/heads/feature", // not approvable by this ceremony
      "git push origin HEAD:feature", // destination not fully qualified
      "git push origin HEAD:refs/tags/v1.2.3", // tags are out of scope for approve-push
      "git push origin +HEAD:refs/heads/feature", // forced refspec
      "git push origin :refs/heads/feature", // deletion
      "git push $REMOTE HEAD:refs/heads/feature", // expansion: argv is not the text we see
      "git push origin HEAD:refs/heads/feature && git status", // bundle
    ]) {
      const observed = pushDenial(root, command, PUSH_GUARD_DENIAL);
      assert.equal(observed.status, "narrower-recovery-required", command);
      assert.equal(observed.code, "HGO-NARROWER-PUSH-DESTINATION-REQUIRED", command);
      assert.equal(observed.nextAction.kind, "typed-recovery");
      assert.equal(typeof observed.nextAction.action, "object");
      assert.equal(JSON.stringify(observed.nextAction.action).includes("refs/heads/main"), false, command);
      assert.match(observed.nextAction.action.requiredChange, /refs\/heads\/<branch>/u);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pipeline author repair binds one exact source root and action without State readiness", () => {
  const root = fixture();
  try {
    const sourceRoot = join(root, "plugins", "pipeline-core");
    mkdirSync(join(sourceRoot, ".codex-plugin"), { recursive: true });
    mkdirSync(join(sourceRoot, "lib"), { recursive: true });
    writeFileSync(join(sourceRoot, ".codex-plugin", "plugin.json"), '{"name":"pipeline-core","version":"0.4.7"}\n');
    writeFileSync(join(sourceRoot, "lib", "repair.mjs"), "export const repaired = false;\n");
    mkdirSync(join(root, "outside-source"), { recursive: true });
    symlinkSync(join(root, "outside-source"), join(sourceRoot, "linked-outside"), "dir");
    assert.equal(humanGuardOverrideInternals.eligibility(
      root,
      "Write",
      { file_path: "plugins/pipeline-core/linked-outside/escape.mjs", content: "escape\n" },
      { selectedAuthorSourceRoot: sourceRoot },
    ).code, "HGO-NONOVERRIDABLE-CROSS-BOUNDARY");
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "pipeline-state.json"), "{damaged portable state\n");
    const toolInput = {
      command: "*** Begin Patch\n*** Update File: plugins/pipeline-core/lib/repair.mjs\n@@\n-export const repaired = false;\n+export const repaired = true;\n*** End Patch",
    };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "apply_patch",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    assert.equal(request.status, "author-repair-required");
    assert.equal(request.candidateSourceRoot, sourceRoot);
    assert.throws(
      () => planHumanGuardOverride({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
        nowMs: 2000, scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUTHOR-ROOT",
    );
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      authorSourceRoot: sourceRoot,
      nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(plan.mode, "pipeline-author-repair");
    assert.equal(plan.authorSourceRoot, sourceRoot);
    assert.equal(plan.repository.state.status, "malformed");
    assert.deepEqual(plan.eligiblePaths, ["plugins/pipeline-core/lib/repair.mjs"]);
    const reason = "PO-authorized exact Pipeline source repair";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      authorSourceRoot: sourceRoot,
      nowMs: 2500,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const armed = authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: prepared.reasonSha256,
      authorSourceRoot: sourceRoot,
      activate: true,
      nowMs: 3000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(armed.status, "armed");
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "apply_patch",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }).status, "consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tampered audit fails verification", () => {
  const root = fixture();
  try {
    recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { file_path: "notes.md", content: "x" },
      denials: denial,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const audit = join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    writeFileSync(audit, readFileSync(audit, "utf8").replace('"type":"denied"', '"type":"allowed"'), { mode: 0o600 });
    assert.throws(
      () => verifyHumanGuardOverrideAudit({ rootDir: root }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUDIT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deleted ledger, authenticated head, or their pair fails verification", () => {
  for (const deleted of ["audit.jsonl", "audit.head.json", "both"]) {
    const root = fixture();
    try {
      recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName: "Write",
        toolInput: { file_path: "notes.md", content: deleted },
        denials: denial,
      });
      const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
      const base = join(common, "agent-pipeline", "human-guard-overrides");
      if (deleted === "both") {
        unlinkSync(join(base, "audit.jsonl"));
        unlinkSync(join(base, "audit.head.json"));
      } else {
        unlinkSync(join(base, deleted));
      }
      assert.throws(
        () => verifyHumanGuardOverrideAudit({ rootDir: root }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUDIT",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("an armed capability is unusable when its authorization audit disappeared", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "audit-bound\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath,
    });
    const reason = "Audit-bound capability";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath,
    });
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: prepared.reasonSha256,
      activate: true,
      nowMs: 3000,
      scriptPath,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const base = join(common, "agent-pipeline", "human-guard-overrides");
    unlinkSync(join(base, "audit.jsonl"));
    unlinkSync(join(base, "audit.head.json"));
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }), { status: "invalid", code: "HGO-AUDIT" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("policy-library and override-CLI drift invalidate the loaded plugin identity", () => {
  for (const changed of [
    ["hooks", "guard-command-grammar.mjs"],
    ["lib", "human-guard-override.mjs"],
    ["lib", "windows-private-state.mjs"],
    ["scripts", "guard-human-override.mjs"],
  ]) {
    const root = fixture();
    const plugin = mkdtempSync(join(tmpdir(), "human-guard-plugin-"));
    try {
      for (const relative of [
        [".codex-plugin", "plugin.json"],
        ["hooks", "codex-pretool-guard.mjs"],
        ["hooks", "guard-command-grammar.mjs"],
        ["lib", "human-guard-override.mjs"],
        ["lib", "windows-private-state.mjs"],
        ["scripts", "guard-human-override.mjs"],
      ]) {
        mkdirSync(join(plugin, relative[0]), { recursive: true });
        copyFileSync(join(PLUGIN_ROOT, ...relative), join(plugin, ...relative));
      }
      const request = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: plugin,
        toolName: "Write",
        toolInput: { file_path: "notes.md", content: changed.join("/") },
        denials: denial,
        nowMs: 1000,
      });
      writeFileSync(join(plugin, ...changed), `${readFileSync(join(plugin, ...changed), "utf8")}\n// identity drift\n`);
      assert.throws(
        () => planHumanGuardOverride({
          rootDir: root,
          pluginRoot: plugin,
          requestSha256: request.requestSha256,
          nowMs: 2000,
          scriptPath: join(plugin, "scripts", "guard-human-override.mjs"),
        }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(plugin, { recursive: true, force: true });
    }
  }
});

test("missing or replaced audit keys fail closed without silent regeneration", () => {
  for (const mode of ["missing", "replaced"]) {
    const root = fixture();
    try {
      recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName: "Write",
        toolInput: { file_path: "notes.md", content: mode },
        denials: denial,
      });
      const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
      const key = join(common, "agent-pipeline", "human-guard-overrides", "audit.key");
      if (mode === "missing") unlinkSync(key);
      else writeFileSync(key, Buffer.alloc(32, 7), { mode: 0o600 });
      assert.throws(
        () => verifyHumanGuardOverrideAudit({ rootDir: root }),
        (error) => error instanceof HumanGuardOverrideError
          && new Set(["HGO-AUDIT-KEY", "HGO-AUDIT"]).has(error.code),
      );
      if (mode === "missing") assert.equal(existsSync(key), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a tampered one-action capability cannot be consumed", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "bounded\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath,
    });
    const reason = "Attended capability tamper regression";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath,
    });
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: prepared.reasonSha256,
      activate: true,
      nowMs: 3000,
      scriptPath,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const capability = join(
      common,
      "agent-pipeline",
      "human-guard-overrides",
      "capabilities",
      `${plan.planSha256}.json`,
    );
    const value = JSON.parse(readFileSync(capability, "utf8"));
    value.toolInputSha256 = "f".repeat(64);
    writeFileSync(capability, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }), { status: "invalid", code: "HGO-CAPABILITY" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authorization audit failure rolls back its newly created capability", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "audit rollback\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath,
    });
    const reason = "Audit failure rollback";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const base = join(common, "agent-pipeline", "human-guard-overrides");
    writeFileSync(join(base, "audit.head.json"), "{}\n", { mode: 0o600 });
    assert.throws(
      () => authorizeHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        planSha256: plan.planSha256,
        selectionSha256: prepared.selectionSha256,
        reason,
        reasonSha256: prepared.reasonSha256,
        activate: true,
        nowMs: 3000,
        scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUDIT",
    );
    assert.equal(existsSync(join(base, "capabilities", `${plan.planSha256}.json`)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native Windows private-state assurance is injected and fail-closed", () => {
  const root = mkdtempSync(join(tmpdir(), "human-guard-windows-assurance-"));
  try {
    const existing = join(root, "existing");
    mkdirSync(existing, { mode: 0o700 });
    assert.equal(humanGuardOverrideInternals.secureDirectory(existing, {
      platform: "win32",
      assessWindowsPrivatePathFn() { return { status: "secure" }; },
    }), existing);
    assert.throws(
      () => humanGuardOverrideInternals.secureDirectory(existing, {
        platform: "win32",
        assessWindowsPrivatePathFn() { return { status: "insecure" }; },
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DACL",
    );
    const created = join(root, "created");
    assert.equal(humanGuardOverrideInternals.secureDirectory(created, {
      platform: "win32",
      hardenWindowsPrivateDirectoryFn() { return { status: "secure" }; },
    }), created);
    const file = join(root, "private.json");
    writeFileSync(file, "{}\n", { mode: 0o600 });
    assert.throws(
      () => humanGuardOverrideInternals.safePrivateFile(file, {
        platform: "win32",
        assessWindowsPrivatePathFn() { return { status: "unknown" }; },
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DACL",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F1 (dispatch CRITIC-REMEDY-09): the local-plugin-install attestation succeeds against THIS repository's own, real marketplace manifest and plugin source tree", () => {
  // Every other local-plugin-install test above uses a synthetic fixture and
  // therefore can never observe a regression in the real, committed
  // .claude-plugin/marketplace.json or plugins/pipeline-core -- that
  // blindness let a marketplace-identity rename silently break the sanctioned
  // override for this repository while Full Verify stayed green. This test
  // exercises the same attestation the guard uses, directly against the real
  // checkout, so a future regression here fails Full Verify.
  const repoRoot = join(PLUGIN_ROOT, "..", "..");
  assert.equal(humanGuardOverrideInternals.isPipelineSourceRoot(repoRoot), true);
  const observation = humanGuardOverrideInternals.localPluginInstallSourceObservation({ root: repoRoot });
  assert.match(observation.statusSha256, /^[a-f0-9]{64}$/u);
  assert.match(observation.fingerprintSha256, /^[a-f0-9]{64}$/u);
});

// ---------------------------------------------------------------------------------
// NVA-BL-20: the admitted command `codex plugin add pipeline-core@agent-pipeline-local`
// installs through an EXTERNAL marketplace root (ADR-0052) that lives outside every
// checkout and links back into one. The attestation above hashes only this checkout,
// so a repointed or mutated external root used to be entirely outside what the
// override observed. These fixtures drive both outcomes through an injected registry
// reader: the machine's own Codex registry state is neither readable nor controllable
// from a test, and depending on it would make the assertion environmental rather than
// behavioural.
// ---------------------------------------------------------------------------------

// The capability gate for every link-shaped check in this block. Two properties
// matter, and the ad-hoc probe this constant replaced had neither:
//
//   1. It probes the link type these tests actually create. Every link below is
//      an explicit `"junction"` -- the one link type ADR-0052's target platform
//      (native Windows without Developer Mode) can create without elevation,
//      whereas an ordinary file/directory symlink there throws EPERM. An
//      UNTYPED probe therefore answers a different question than the one these
//      tests ask, and can disable this file's link-shaped coverage on exactly
//      the platform it exists to cover.
//   2. It is the shared, tested primitive (symlink-capability.mjs), which
//      treats ONLY EPERM/EACCES from the link operation itself as "capability
//      unavailable" and rethrows every other error class. The blanket
//      `try { symlinkSync(...) } catch { return false }` this replaced read a
//      broken fixture environment -- a full disk, a missing temp root -- as a
//      missing symlink capability, and silently dropped the assertions below.
//
// Hoisted to module scope: a typed probe is deliberately not memoized by the
// shared module, and node:test evaluates a `skip` option once per definition.
const JUNCTION_CAPABILITY = symlinkCapability({ type: "junction" });
const JUNCTION_SKIP = symlinkSkip(JUNCTION_CAPABILITY);

function pipelineCheckout(base, name) {
  const root = join(base, name);
  const sourceRoot = join(root, "plugins", "pipeline-core");
  mkdirSync(join(sourceRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(join(root, "harness", "scripts"), { recursive: true });
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, "harness", "scripts", "verify.mjs"), "// verify\n");
  writeFileSync(join(sourceRoot, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "pipeline-core",
    version: "0.0.0-test",
  }));
  writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({
    name: "agent-pipeline",
    plugins: [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
  }));
  return { root, sourceRoot };
}

function externalMarketplace(base, name, { marketplaceName = "agent-pipeline-local", plugins } = {}) {
  const root = join(base, name);
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  mkdirSync(join(root, "plugins"), { recursive: true });
  writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({
    name: marketplaceName,
    plugins: plugins ?? [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
  }));
  return root;
}

function externalRegistry(marketplaces) {
  return () => ({ marketplaces });
}

function localRegistry(root) {
  return externalRegistry([
    { name: "openai-curated", root: join(root, "irrelevant") },
    { name: "agent-pipeline-local", root, marketplaceSource: { sourceType: "local", source: root } },
  ]);
}

function externalFixture() {
  return realpathSync(mkdtempSync(join(tmpdir(), "human-guard-external-marketplace-")));
}

test("NVA-BL-20: this suite's junction-capability gate is the shared typed probe, not a blanket catch", () => {
  const calls = [];
  const recordingFs = {
    mkdirSync: (path) => { calls.push(["mkdirSync", path]); },
    mkdtempSync: (prefix) => { calls.push(["mkdtempSync", prefix]); return `${prefix}fixture`; },
    rmSync: (path) => { calls.push(["rmSync", path]); },
    symlinkSync: (target, path, type) => { calls.push(["symlinkSync", target, path, type]); },
    writeFileSync: (path) => { calls.push(["writeFileSync", path]); },
  };
  const probed = probeSymlinkCapability({ fs: recordingFs, tmpRoot: tmpdir(), type: "junction" });
  assert.equal(probed.available, true);
  // The probe creates the SAME link type the tests below create -- an untyped
  // symlink is a different capability on this block's target platform.
  assert.deepEqual(
    calls.filter(([operation]) => operation === "symlinkSync").map(([, , , type]) => type),
    ["junction"],
  );
  // A junction is a directory-only link type, so a junction probe's own target
  // must be a directory; the untyped probe's file target would fail for a
  // reason that has nothing to do with the privilege being probed.
  assert.equal(calls.some(([operation]) => operation === "mkdirSync"), true);
  assert.equal(calls.some(([operation]) => operation === "writeFileSync"), false);
  assert.equal(calls.some(([operation]) => operation === "rmSync"), true);
  // Only the two permission codes are read as "capability unavailable" ...
  for (const code of ["EPERM", "EACCES"]) {
    const denied = Object.assign(new Error(code), { code });
    const result = probeSymlinkCapability({
      fs: { ...recordingFs, symlinkSync() { throw denied; } }, tmpRoot: tmpdir(), type: "junction",
    });
    assert.equal(result.available, false);
    assert.equal(result.reason.includes(code), true);
    assert.equal(result.reason.includes("junction"), true);
    assert.equal(symlinkSkip(result), result.reason);
  }
  // ... every other failure class is a broken fixture environment and surfaces
  // as itself, instead of silently disabling the link-shaped coverage below.
  const enospc = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
  assert.throws(
    () => probeSymlinkCapability({
      fs: { ...recordingFs, symlinkSync() { throw enospc; } }, tmpRoot: tmpdir(), type: "junction",
    }),
    (error) => error === enospc,
  );
  assert.equal(symlinkSkip({ available: true, reason: null }), false);
});

test("NVA-BL-20: a correctly linked external agent-pipeline-local root is verified and folded into statusSha256", { skip: JUNCTION_SKIP }, () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const external = externalMarketplace(base, "external");
    symlinkSync(checkout.sourceRoot, join(external, "plugins", "pipeline-core"), "junction");
    const registryReader = localRegistry(external);
    const verified = humanGuardOverrideInternals.externalLocalMarketplaceObservation(
      { root: checkout.root },
      { registryReader },
    );
    assert.equal(verified.state, "verified");
    assert.equal(verified.entryKind, "link");
    assert.match(verified.rootSha256, /^[a-f0-9]{64}$/u);
    assert.match(verified.manifestSha256, /^[a-f0-9]{64}$/u);
    // The verification is not decorative: it reaches the attestation hash the
    // request/plan/capability chain is bound to.
    const observed = humanGuardOverrideInternals.localPluginInstallSourceObservation(
      { root: checkout.root, common: join(checkout.root, ".git") },
      { registryReader },
    );
    const unobserved = humanGuardOverrideInternals.localPluginInstallSourceObservation(
      { root: checkout.root, common: join(checkout.root, ".git") },
      { registryReader: () => null },
    );
    assert.match(observed.statusSha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(observed.statusSha256, unobserved.statusSha256);
    // A mutation of the external root's own manifest that keeps it valid still
    // changes the attestation, so the armed capability no longer matches (HGO-DRIFT).
    writeFileSync(join(external, ".claude-plugin", "marketplace.json"), JSON.stringify({
      name: "agent-pipeline-local",
      plugins: [
        { name: "pipeline-core", source: "./plugins/pipeline-core" },
        { name: "smuggled", source: "./plugins/smuggled" },
      ],
    }));
    const mutated = humanGuardOverrideInternals.localPluginInstallSourceObservation(
      { root: checkout.root, common: join(checkout.root, ".git") },
      { registryReader },
    );
    assert.notEqual(mutated.statusSha256, observed.statusSha256);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// The two link-shaped refusals live in their OWN test rather than behind a bare
// `if (capability)` inside the sibling below: a capability-gated branch inside a
// test reports a full pass while several of its assertions never ran, which in
// the reporter's output is indistinguishable from a real pass. As a separate,
// `skip`-gated unit, an unavailable capability is visible as a skip instead.
test("NVA-BL-20: a link-shaped external agent-pipeline-local root that points elsewhere, or nowhere, fails closed", { skip: JUNCTION_SKIP }, () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const decoy = pipelineCheckout(base, "decoy");
    const refuses = (registryReader, root = checkout.root) => assert.throws(
      () => humanGuardOverrideInternals.externalLocalMarketplaceObservation({ root }, { registryReader }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-EXTERNAL-MARKETPLACE",
    );
    // (a) the external root's plugins/pipeline-core points at a DIFFERENT checkout.
    const repointed = externalMarketplace(base, "repointed");
    symlinkSync(decoy.sourceRoot, join(repointed, "plugins", "pipeline-core"), "junction");
    refuses(localRegistry(repointed));
    // ... and the same root is accepted for the checkout it actually links to,
    // so the refusal above is the binding, not a blanket rejection.
    assert.equal(
      humanGuardOverrideInternals.externalLocalMarketplaceObservation(
        { root: decoy.root },
        { registryReader: localRegistry(repointed) },
      ).state,
      "verified",
    );
    // (b) a dangling link target resolves nowhere at all.
    const dangling = externalMarketplace(base, "dangling");
    symlinkSync(join(base, "absent", "plugins", "pipeline-core"), join(dangling, "plugins", "pipeline-core"), "junction");
    refuses(localRegistry(dangling));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("NVA-BL-20: a repointed or mutated external agent-pipeline-local root fails closed", () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const refuses = (registryReader, root = checkout.root) => assert.throws(
      () => humanGuardOverrideInternals.externalLocalMarketplaceObservation({ root }, { registryReader }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-EXTERNAL-MARKETPLACE",
    );
    // (c) a real directory in place of the link never resolves into this checkout.
    const copied = externalMarketplace(base, "copied");
    mkdirSync(join(copied, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
    writeFileSync(join(copied, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), "{}\n");
    refuses(localRegistry(copied));
    // (d) the external manifest no longer names the reserved marketplace identity.
    const renamed = externalMarketplace(base, "renamed", { marketplaceName: "agent-pipeline" });
    refuses(localRegistry(renamed));
    // (e) the external manifest no longer binds pipeline-core to its own source.
    const unbound = externalMarketplace(base, "unbound", {
      plugins: [{ name: "pipeline-core", source: "/somewhere/else" }],
    });
    refuses(localRegistry(unbound));
    // (f) the external manifest is missing or malformed.
    const malformed = externalMarketplace(base, "malformed");
    writeFileSync(join(malformed, ".claude-plugin", "marketplace.json"), "{ not json\n");
    refuses(localRegistry(malformed));
    const absent = join(base, "absent-root");
    refuses(localRegistry(absent));
    // (g) the reserved name is served from a non-local source, or twice over.
    const external = externalMarketplace(base, "external");
    refuses(externalRegistry([{
      name: "agent-pipeline-local",
      root: external,
      marketplaceSource: { sourceType: "git", source: "https://example.invalid/x.git" },
    }]));
    refuses(externalRegistry([
      { name: "agent-pipeline-local", root: external, marketplaceSource: { sourceType: "local", source: external } },
      { name: "agent-pipeline-local", root: base, marketplaceSource: { sourceType: "local", source: base } },
    ]));
    refuses(externalRegistry([{
      name: "agent-pipeline-local",
      root: external,
      marketplaceSource: { sourceType: "local", source: "relative/path" },
    }]));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("NVA-BL-20: an unobservable or unregistered marketplace registry is a typed, distinctly hashed state", () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const observe = (registryReader) => humanGuardOverrideInternals.externalLocalMarketplaceObservation(
      { root: checkout.root },
      { registryReader },
    );
    assert.deepEqual(observe(() => null), { state: "unobserved", reason: "registry-unavailable" });
    assert.deepEqual(observe(() => undefined), { state: "unobserved", reason: "registry-unavailable" });
    assert.deepEqual(observe(() => ({ marketplaces: "nope" })), { state: "unobserved", reason: "registry-unavailable" });
    assert.deepEqual(observe(externalRegistry([])), { state: "unobserved", reason: "not-registered" });
    assert.deepEqual(
      observe(externalRegistry([{ name: "agent-pipeline-local", root: base }])),
      { state: "unobserved", reason: "not-registered" },
    );
    const attest = (registryReader) => humanGuardOverrideInternals.localPluginInstallSourceObservation(
      { root: checkout.root, common: join(checkout.root, ".git") },
      { registryReader },
    ).statusSha256;
    assert.notEqual(attest(() => null), attest(externalRegistry([])));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// NOVA-HGOSIG-ROUTE-1 (ADR-0059 Decision 4): recordHumanGuardDenial() has three outcomes,
// and consuming guards used to render only one of them. `planned` printed a route; every
// other typed status and every throw printed NOTHING -- so a denial that could not be routed
// was byte-identical to a denial that was never eligible for one. Decision 4's claim is that
// every denial reports its next step; silence is the one outcome that makes it untrue.
//
// The renderer lives here, next to the statuses it describes, so the four consuming guards
// cannot drift apart on what a route-less denial says. Its disclosure bound is asserted
// against hostile inputs rather than trusted: only a typed status token and a typed code
// token ever reach the output.
//
// This block once also carried two CONSUMER checks that spawn a real guard binary, parked
// here only because guard-testpath.test.mjs (TP-2) and guard-gate-strength.test.mjs (TP-6)
// were locked. Under the signed maintenance window over TP-2/TP-6/TP-7 they moved to the
// suites that own the guards they exercise (guard-testpath.test.mjs TP12/TP13 and
// guard-gate-strength.test.mjs GST30), rewritten in those suites' own idioms. What stays
// here is exactly what belongs here: the renderer's own contract, asserted against the
// function directly rather than through a guard's stderr.
// ---------------------------------------------------------------------------------

test("a route-less denial reports the status the planner actually returned, with its typed code", () => {
  assert.equal(
    humanGuardRouteUnavailableReason("command", {
      planned: { status: "external-operator-required", code: "HGO-EXTERNAL-PROJECT-BOUNDARY" },
    }),
    "No human override route is offered for this exact command; the guard attempted to plan one.\n"
      + "Reason: the override planner returned status=external-operator-required, "
      + "code=HGO-EXTERNAL-PROJECT-BOUNDARY (the exact action must be carried out by an "
      + "attended operator outside this session).",
  );
  // author-repair-required carries no `code` at all, so none is invented for it.
  const authorRepair = humanGuardRouteUnavailableReason("edit", {
    planned: { status: "author-repair-required", requestSha256: "a".repeat(64), candidateSourceRoot: "/tmp/x/plugins/pipeline-core" },
  });
  assert.match(authorRepair, /status=author-repair-required \(the target is Pipeline plugin source/u);
  assert.doesNotMatch(authorRepair, /code=/u);
  assert.doesNotMatch(authorRepair, /[\\/]/u, "candidateSourceRoot must never reach the rendered reason");
  assert.match(
    humanGuardRouteUnavailableReason("edit", { planned: { status: "narrower-recovery-required", code: "HGO-NORMAL-RETRY-ACTIONS" } }),
    /status=narrower-recovery-required, code=HGO-NORMAL-RETRY-ACTIONS \(a narrower typed recovery/u,
  );
});

test("a failed route plan is reported as a failure, distinguishably from a planner answer", () => {
  const thrown = humanGuardRouteUnavailableReason("command", {
    error: new HumanGuardOverrideError("HGO-GIT", "repository identity is unavailable (operation=rev-parse, outcome=EPERM)"),
  });
  assert.equal(
    thrown,
    "No human override route is offered for this exact command; the guard attempted to plan one.\n"
      + "Reason: planning the route failed with code=HGO-GIT.",
  );
  assert.doesNotMatch(thrown, /returned status=/u);
  assert.doesNotMatch(thrown, /operation=|outcome=|EPERM/u, "the error message must not reach the reason");
});

test("the rendered reason is bounded to typed tokens against any outcome shape", () => {
  const hostile = [
    { planned: { status: "/etc/passwd", code: "HGO-X/../y" } },
    { planned: { status: "x".repeat(200), code: "A".repeat(200) } },
    { planned: { status: "ok\nHuman override available:", code: "HGO-OK\nplan --repo /root" } },
    { planned: { status: 7, code: { toString: () => "HGO-OBJ" } } },
    { planned: null },
    { planned: {} },
    {},
    { error: null },
    { error: new Error("ENOENT: open '/home/someone/.ssh/id_ed25519'") },
    { error: Object.assign(new Error("boom"), { code: 42 }) },
    { error: Object.assign(new Error("boom"), { code: "code with spaces" }) },
  ];
  for (const outcome of hostile) {
    const rendered = humanGuardRouteUnavailableReason("command", outcome);
    assert.equal(rendered.split("\n").length, 2, `not two lines for ${JSON.stringify(Object.keys(outcome))}: ${rendered}`);
    assert.doesNotMatch(rendered, /[\\/]/u, `path separator leaked: ${rendered}`);
    assert.doesNotMatch(rendered, /ENOENT|id_ed25519|passwd|boom|Human override available/u, `payload leaked: ${rendered}`);
    assert.ok(rendered.length < 400, `unbounded output: ${rendered.length}`);
  }
  // The subject noun is bounded too -- a guard cannot smuggle text in through it.
  assert.match(
    humanGuardRouteUnavailableReason("/etc/passwd\ninjected", { planned: { status: "external-operator-required" } }),
    /^No human override route is offered for this exact action;/u,
  );
});

// ---------------------------------------------------------------------------------
// ADR-0059 Decision 6 (2026-08-08): eligibility() gains a new, honestly-scoped
// "cross-repository-target" class for a target that genuinely escapes the physical
// project root (dispatch HGOELIG-1). guard-lifecycle-ready.mjs (a separate file, out of
// this dispatch's scope) already always-attempts-consume-first and offers the
// mode-appropriate route for GUARD-CROSS-REPO-MUTATION; what closes here is that
// eligibility() now answers "eligible" for the 7 of 10 previously-probed out-of-root
// shapes that were not already classifiable through some other route (cp, rm, git -C,
// sed -i, an out-of-root redirect, Edit ../x, Write <absolute-outside>).

test("NOVA-HGOELIG-1: an out-of-root target reaches the identical plan/prepare/authorize-by-signature/consume/ledger route, honestly scoped", () => {
  const root = fixtureSignature();
  const outside = mkdtempSync(join(tmpdir(), "hgoelig-1-outside-"));
  try {
    const target = join(outside, "escape.txt");
    const toolInput = { file_path: target, content: "outside\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    assert.equal(recorded.status, "planned");
    assert.equal(plan.commandClass, "cross-repository-target");
    assert.deepEqual(plan.eligiblePaths, [target]);
    // DoD 3: the record states explicitly what it proves and what it does not, rather
    // than reading like an ordinary in-root capability.
    assert.equal(plan.preview.scopeAttestation.schema, "pipeline.human-guard-override-scope-attestation.v1");
    assert.ok(plan.preview.scopeAttestation.proves.some((line) => /this repository's own physical root/u.test(line)));
    assert.ok(plan.preview.scopeAttestation.doesNotProve.some((line) => /identity, existence, or git status of the out-of-root target/u.test(line)));
    assert.match(plan.preview.expectedEffects.repository, /never inspects, and cannot attest/u);
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256,
      planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const audit = join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    const auditEvents = readFileSync(audit, "utf8").trim().split("\n").map((line) => JSON.parse(line).event);
    assert.deepEqual(auditEvents.map(({ type }) => type), ["denied", "authorized", "consumed"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// DoD 7: whether `chat` mode should reach the same out-of-root class with the same
// power as `signature` mode is a real design question, answered here explicitly rather
// than left implicit. ADR-0059 Decision 3's own standing principle ("every guard this
// repository ever adds that blocks an agent action gets the SAME lift shape... signature
// always, chat whenever the human has genuinely, committedly configured it... no file- or
// guard-specific exception") and Decision 6's own text ("it remains subject to the
// committed signature/chat mode") both draw no distinction for the cross-repository
// class. No code change was needed to implement this: `authorizeHumanGuardOverride()`'s
// existing signature-mode-required refusal and `consumeHumanGuardOverride()`'s
// mode-independent matching already apply uniformly to every commandClass, this one
// included -- so parity is the DEFAULT this dispatch inherited, not something it had to
// add. This test proves that default holds for the new class specifically, the same way
// NOVA-XREPO-HGO-3 already proves it for the previously-classifiable cross-repo shapes.
test("NOVA-HGOELIG-2: chat mode reaches the identical out-of-root class with the same reach as signature mode (ADR-0059 Decision 3/6 parity, no special-casing)", () => {
  const root = fixture(); // committed gates.push_approval: "chat"
  const outside = mkdtempSync(join(tmpdir(), "hgoelig-1-outside-chat-"));
  try {
    const target = join(outside, "chat-escape.txt");
    const toolInput = { file_path: target, content: "outside via chat\n" };
    const recorded = recordHumanGuardDenial({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000 });
    assert.equal(recorded.status, "planned");
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(plan.commandClass, "cross-repository-target");
    const reason = "PO attended recovery for the exact out-of-root write, via chat";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2500, scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const armed = authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      nowMs: 3000, scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(armed.status, "armed");
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("NOVA-HGOELIG-3: an out-of-root capability binds one exact command -- a different command is refused, and consumption is single-use", () => {
  const root = fixtureSignature();
  const outside = mkdtempSync(join(tmpdir(), "hgoelig-1-outside-bind-"));
  try {
    const boundCommand = `cp README.md ${join(outside, "a.txt")}`;
    const otherCommand = `cp README.md ${join(outside, "b.txt")}`;
    const boundInput = { command: boundCommand };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Bash", toolInput: boundInput, denials: denial });
    assert.equal(plan.commandClass, "cross-repository-target");
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256,
      planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");
    // A different out-of-root command, differing only in its destination path, does not
    // consume the armed capability -- toolInputSha256 binds the WHOLE command string.
    const mismatched = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput: { command: otherCommand }, denials: denial, nowMs: 3500,
    });
    assert.equal(mismatched.status, "absent");
    // The exact bound command still consumes it, exactly once.
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput: boundInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
    const second = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput: boundInput, denials: denial, nowMs: 4500,
    });
    assert.equal(second.status, "absent", "a consumed out-of-root capability admitted a second run");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// Security regression pin, at the classification unit rather than the full pipeline:
// a target that FAILS safePath()'s in-root symlink/hardlink walk must never be
// reclassified into the new class, however deep the symlink indirection -- only a
// candidate that genuinely escapes `root` (the same escape test safePath() itself
// applies) may become eligible. crossBoundaryTarget() re-derives that escape test
// independently rather than trusting "safePath() said no" as sufficient on its own.
test("NOVA-HGOELIG-4: an in-root symlink or hardlink attack is never reclassified as a cross-repository target", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "physical", "nested"), { recursive: true });
    symlinkSync(join(root, "physical"), join(root, "linked"), "dir");
    writeFileSync(join(root, "physical", "nested", "source.txt"), "shared\n");
    linkSync(join(root, "physical", "nested", "source.txt"), join(root, "hardlinked-deep.txt"));
    for (const filePath of [
      "linked/nested/escape.txt", // resolves in-root via a symlinked ancestor
      "hardlinked-deep.txt", // an in-root file with more than one hard link
    ]) {
      const result = humanGuardOverrideInternals.eligibility(root, "Write", { file_path: filePath, content: "x" });
      assert.equal(result.eligible, false, filePath);
      assert.equal(result.code, "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", filePath);
      assert.notEqual(result.commandClass, "cross-repository-target", filePath);
    }
    // A genuine escape, by contrast, IS the new class.
    const escaping = humanGuardOverrideInternals.eligibility(root, "Write", { file_path: "../genuinely-outside.txt", content: "x" });
    assert.equal(escaping.eligible, true);
    assert.equal(escaping.commandClass, "cross-repository-target");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository identity failures name the sanitized Git operation", () => {
  const root = fixture();
  try {
    assert.throws(
      () => planHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: "a".repeat(64),
        spawn() { return { status: null, error: Object.assign(new Error("blocked"), { code: "EPERM" }) }; },
        scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
      }),
      (error) => error instanceof HumanGuardOverrideError
        && error.code === "HGO-GIT"
        && error.message.includes("operation=rev-parse---show-toplevel")
        && error.message.includes("outcome=EPERM"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
