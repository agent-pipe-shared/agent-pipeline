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
  readdirSync,
  readFileSync,
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
  prepareHumanGuardOverrideForSignature,
  recordHumanGuardDenial,
  refreezeHumanGuardOverridePlan,
  verifyHumanGuardOverrideAudit,
} from "./human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";

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

/**
 * Tamper one of pluginIdentity()'s six hashed files by changing its bytes. `.codex-plugin/
 * plugin.json` is the one file `pluginIdentity()` runs through `JSON.parse()`, so a raw `//`
 * comment append (fine for the other five, which are only ever read as raw bytes) breaks
 * parsing outright and throws HGO-PLUGIN ("malformed") instead of exercising the intended
 * *-DRIFT comparison the tests below assert. Trailing whitespace changes the file's bytes/
 * sha256 exactly the same way while JSON.parse still tolerates it, so it stays a faithful,
 * minimal tamper for plugin.json specifically.
 */
function tamperPluginFile(plugin, relative, label) {
  const path = join(plugin, ...relative);
  const original = readFileSync(path, "utf8");
  writeFileSync(path, relative[1] === "plugin.json" ? `${original}\n` : `${original}\n// ${label}\n`);
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

test("Part C: prepareHumanGuardOverrideForSignature() fails closed on the global-plugin-install denial class with HGO-SIGNATURE-INTENT-INVALID (not a silent pass-through)", () => {
  // Regression for a documented-but-untested claim (Critic finding, PHX-WP-HGO-FAILCLOSED-IMPL-C
  // round 1): the function's own docstring asserts createPoApprovalIntent()'s candidate
  // validation already throws for this mode because its repository observation carries no
  // head/tree -- this test is that discriminating check, not just the reasoning.
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
    assert.throws(
      () => prepareHumanGuardOverrideForSignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2_000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-SIGNATURE-INTENT-INVALID",
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
      ["external-operator-required", "Write", { file_path: "../outside.txt", content: "x" }],
      ["external-operator-required", "Write", { file_path: "linked/escape.txt", content: "x" }],
      ["external-operator-required", "Write", { file_path: "hardlinked.txt", content: "x" }],
      ["narrower-recovery-required", "Bash", { command: "git push origin HEAD:refs/heads/main" }],
      ["narrower-recovery-required", "Bash", { command: "/usr/bin/git push origin HEAD:refs/heads/main" }],
      ["narrower-recovery-required", "Bash", { command: "/bin/sh -c 'git push origin HEAD:refs/heads/main'" }],
      ["planned", "Bash", { command: "git harmless-alias notes.md" }],
      ["planned", "Bash", { command: "python3 -c 'open(\"owned\", \"w\").write(\"x\")'" }],
      ["planned", "Bash", { command: "perl -e 'open my $fh, \">\", \"owned\"'" }],
      ["planned", "Bash", { command: "node safe.mjs" }],
      ["external-operator-required", "Bash", { command: "node --check ../../outside.mjs" }],
      ["planned", "Bash", { command: "node --check .claude/pipeline-state.json" }],
      ["external-operator-required", "Bash", { command: "node safe.mjs --tok" + "en=fixture-not-a-secret" }],
      ["planned", "Bash", { command: "touch safe && touch second" }],
      ["planned", "apply_patch", { command: "*** Begin Patch\n*** Update File: .claude/pipeline-state.json\n@@\n-{}\n+{\"x\":1}\n*** End Patch" }],
      ["author-repair-required", "apply_patch", { command: "*** Begin Patch\n*** Update File: plugins/pipeline-core/hooks/codex-pretool-guard.mjs\n@@\n-old\n+tampered\n*** End Patch" }],
      ["external-operator-required", "apply_patch", { command: "*** Begin Patch\n*** Update File: notes.md\n*** Move to: ../outside.md\n@@\n-old\n+new\n*** End Patch" }],
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
    [".codex-plugin", "plugin.json"],
    ["hooks", "codex-pretool-guard.mjs"],
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
      tamperPluginFile(plugin, changed, "identity drift");
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

// ---------------------------------------------------------------------------------
// Part A regression coverage (design doc §1.7): planHumanGuardOverride() is now
// get-or-create, the arm-time freshness re-check is narrowed to exactly three
// things (3a/3b/3c), the signature path additionally binds signedCandidate/
// HGO-CANDIDATE-DRIFT, and refreezeHumanGuardOverridePlan() is the sole
// non-restart recovery path from that refusal.
// ---------------------------------------------------------------------------------

test("Part A (a): a benign statusSha256/head/tree-only repository change between plan and arm does not block (proves the narrowing)", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "narrowing a\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
    });
    // A benign, unrelated commit changes head/tree/statusSha256 but not
    // fingerprintSha256/policyIdentity -- exactly the class of change design doc
    // §1.1 identifies as the actual HGO-DRIFT cause (e.g. an append-before-arm
    // ledger write).
    writeFileSync(join(root, "unrelated.md"), "benign change\n");
    git(root, "add", "unrelated.md");
    git(root, "commit", "-q", "-m", "benign unrelated commit");
    // A second plan() call for the same (requestSha256, authorSourceRoot) reads
    // the cached plan back unchanged -- no new observation, no throw.
    const rePlan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2500, scriptPath,
    });
    assert.equal(rePlan.planSha256, plan.planSha256);
    assert.deepEqual(rePlan.repository, plan.repository);
    const reason = "Narrowing proof (a)";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 3000, scriptPath,
    });
    const armed = authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      nowMs: 3500, scriptPath,
    });
    assert.equal(armed.status, "armed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (b): a policyIdentity change between plan and arm still blocks with HGO-DRIFT (narrowing did not become no-check)", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "narrowing b\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
    });
    const reason = "Narrowing proof (b)";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2500, scriptPath,
    });
    // policyIdentity()'s "project" hashes include project/guard-config.json
    // (absent at plan time); creating it between plan and arm must still block.
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "guard-config.json"), '{"changed": true}\n');
    assert.throws(
      () => authorizeHumanGuardOverride({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
        selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
        nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (c): a hand-tampered byte in a pluginIdentity()-hashed file between plan and arm trips HGO-PLUGIN-DRIFT", () => {
  for (const changed of [
    [".codex-plugin", "plugin.json"],
    ["hooks", "codex-pretool-guard.mjs"],
    ["hooks", "guard-command-grammar.mjs"],
    ["lib", "human-guard-override.mjs"],
    ["lib", "windows-private-state.mjs"],
    ["scripts", "guard-human-override.mjs"],
  ]) {
    const root = fixture();
    const plugin = mkdtempSync(join(tmpdir(), "human-guard-plugin-armdrift-"));
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
      const toolInput = { file_path: "notes.md", content: `plugin-arm-drift ${changed.join("/")}\n` };
      const scriptPath = join(plugin, "scripts", "guard-human-override.mjs");
      const request = recordHumanGuardDenial({
        rootDir: root, pluginRoot: plugin, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
      });
      const plan = planHumanGuardOverride({
        rootDir: root, pluginRoot: plugin, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
      });
      const reason = "Plugin drift proof (c)";
      const prepared = prepareHumanGuardOverrideAuthorization({
        rootDir: root, pluginRoot: plugin, requestSha256: request.requestSha256, planSha256: plan.planSha256,
        reason, nowMs: 2500, scriptPath,
      });
      // Tamper AFTER plan, BEFORE arm -- exactly the window step 3c (re-)closes.
      tamperPluginFile(plugin, changed, "arm-time identity drift");
      assert.throws(
        () => authorizeHumanGuardOverride({
          rootDir: root, pluginRoot: plugin, requestSha256: request.requestSha256, planSha256: plan.planSha256,
          selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
          nowMs: 3000, scriptPath,
        }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-PLUGIN-DRIFT",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(plugin, { recursive: true, force: true });
    }
  }
});

test("Part A (d): a benign repository-only change between plan and arm does not trip HGO-PLUGIN-DRIFT (3c stayed narrow)", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "narrowing d\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
    });
    const reason = "Narrowing proof (d)";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2500, scriptPath,
    });
    writeFileSync(join(root, "unrelated-d.md"), "benign change\n");
    git(root, "add", "unrelated-d.md");
    git(root, "commit", "-q", "-m", "benign unrelated commit before arm");
    const armed = authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (e): a commit landing on HEAD between signing and arming trips HGO-CANDIDATE-DRIFT on the signature path only", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "candidate drift\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    // A commit lands AFTER the PO's signature was computed (over plan.repository's
    // frozen head/tree) but BEFORE this arm call.
    writeFileSync(join(root, "post-sign.md"), "landed after signing\n");
    git(root, "add", "post-sign.md");
    git(root, "commit", "-q", "-m", "post-signature commit");
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
        proof, nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-CANDIDATE-DRIFT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (e): the chat path has no signedCandidate concept and cannot trip HGO-CANDIDATE-DRIFT even when HEAD moves before arming", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "chat candidate drift\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
    });
    const reason = "Chat path candidate drift proof";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2500, scriptPath,
    });
    writeFileSync(join(root, "post-prepare.md"), "landed before arm\n");
    git(root, "add", "post-prepare.md");
    git(root, "commit", "-q", "-m", "commit before chat-path arm");
    const armed = authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const stored = JSON.parse(readFileSync(
      join(common, "agent-pipeline", "human-guard-overrides", "capabilities", `${plan.planSha256}.json`),
      "utf8",
    ));
    assert.equal(stored.signedCandidate, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (f): refreeze-plan succeeds on a benign drift, produces a new planSha256, and never arms or writes to the capabilities store", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "refreeze benign\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000, ttlMs: 60_000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
    });
    writeFileSync(join(root, "refreeze-benign.md"), "benign\n");
    git(root, "add", "refreeze-benign.md");
    git(root, "commit", "-q", "-m", "benign commit before refreeze");
    const refrozen = refreezeHumanGuardOverridePlan({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 3000,
    });
    assert.equal(refrozen.status, "refrozen");
    assert.equal(refrozen.requestSha256, request.requestSha256);
    assert.equal(refrozen.priorPlanSha256, plan.planSha256);
    assert.notEqual(refrozen.planSha256, plan.planSha256);
    // The next plan() call now reads the REFROZEN plan back, bound to the new HEAD.
    const rePlan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 3500, scriptPath,
    });
    assert.equal(rePlan.planSha256, refrozen.planSha256);
    assert.equal(rePlan.repository.head, git(root, "rev-parse", "HEAD"));
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const base = join(common, "agent-pipeline", "human-guard-overrides");
    assert.deepEqual(readdirSync(join(base, "capabilities")), []);
    const auditEvents = readFileSync(join(base, "audit.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line).event);
    assert.deepEqual(auditEvents.map(({ type }) => type), ["denied", "replanned"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (f): refreeze-plan still blocks with HGO-DRIFT when the project's guard/policy configuration changed (the gate is not relaxed for recovery)", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "refreeze policy drift\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000, ttlMs: 60_000,
    });
    planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
    });
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "guard-config.json"), '{"changed": true}\n');
    assert.throws(
      () => refreezeHumanGuardOverridePlan({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 3000,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (f): refreeze-plan fails HGO-EXPIRED once the underlying request has expired", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "refreeze expired\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000, ttlMs: 1000,
    });
    planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 1500, scriptPath,
    });
    assert.throws(
      () => refreezeHumanGuardOverridePlan({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 5000,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-EXPIRED",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A (f): refreeze-plan fails HGO-PLAN-ABSENT when no persisted plan exists yet for the pair", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "refreeze absent\n" };
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    assert.throws(
      () => refreezeHumanGuardOverridePlan({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 1500,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-PLAN-ABSENT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Part A step 6: after HGO-CANDIDATE-DRIFT, refreeze-plan plus a fresh signature recovers without a full ceremony restart", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "candidate drift recovery\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    writeFileSync(join(root, "post-sign.md"), "landed after signing\n");
    git(root, "add", "post-sign.md");
    git(root, "commit", "-q", "-m", "post-signature commit");
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
        proof, nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-CANDIDATE-DRIFT",
    );
    const refrozen = refreezeHumanGuardOverridePlan({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 3500,
    });
    // requestSha256 never changes -- the original denial is reused, never a restart.
    assert.equal(refrozen.requestSha256, recorded.requestSha256);
    assert.notEqual(refrozen.planSha256, plan.planSha256);
    const rePlanned = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 4000, scriptPath,
    });
    assert.equal(rePlanned.planSha256, refrozen.planSha256);
    const prepared2 = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: refrozen.planSha256,
      reason: HGO_SIGNATURE_REASON, nowMs: 4000, scriptPath,
    });
    const intent2 = createPoApprovalIntent({
      kind: "guard-override",
      featureId: "human-guard-override",
      planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256,
      specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
      candidate: { commit: rePlanned.repository.head, tree: rePlanned.repository.tree },
      policyRevision: "human-guard-override-signature-v1",
      subjectSha256: prepared2.selectionSha256,
      decision: "authorize",
    });
    const proof2 = {
      schema: PO_APPROVAL_PROOF_SCHEMA,
      intentSha256: intent2.sha256,
      keyReference: SIG_KEY_REFERENCE,
      publicKey: sigPair.publicKey.export({ type: "spki", format: "pem" }),
      signatureBase64: sign(null, Buffer.from(intent2.sha256, "utf8"), sigPair.privateKey).toString("base64"),
    };
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: refrozen.planSha256,
      proof: proof2, nowMs: 5000, scriptPath,
    });
    assert.equal(armed.status, "armed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// Critic finding 1 (major, commit 7473f6c9; design doc §1.4 step 6 Revision 4 /
// §1.11): refreezeHumanGuardOverridePlan() must verify a fresh pluginIdentity()
// against request.plugin BEFORE accepting it into the refrozen baseline, mirroring
// planHumanGuardOverride's own first-call check exactly.
// ---------------------------------------------------------------------------------
test("Finding 1: a plugin-code tamper between plan and refreeze fails HGO-DRIFT and never poisons the persisted plan", () => {
  for (const changed of [
    [".codex-plugin", "plugin.json"],
    ["hooks", "codex-pretool-guard.mjs"],
    ["hooks", "guard-command-grammar.mjs"],
    ["lib", "human-guard-override.mjs"],
    ["lib", "windows-private-state.mjs"],
    ["scripts", "guard-human-override.mjs"],
  ]) {
    const root = fixture();
    const plugin = mkdtempSync(join(tmpdir(), "human-guard-plugin-refreezedrift-"));
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
      const toolInput = { file_path: "notes.md", content: `refreeze-plugin-drift ${changed.join("/")}\n` };
      const scriptPath = join(plugin, "scripts", "guard-human-override.mjs");
      const request = recordHumanGuardDenial({
        rootDir: root, pluginRoot: plugin, toolName: "Write", toolInput, denials: denial, nowMs: 1000, ttlMs: 60_000,
      });
      const plan = planHumanGuardOverride({
        rootDir: root, pluginRoot: plugin, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
      });
      writeFileSync(join(root, "refreeze-plugin-drift.md"), "benign\n");
      git(root, "add", "refreeze-plugin-drift.md");
      git(root, "commit", "-q", "-m", "benign commit before refreeze");
      // Tamper the plugin's own code AFTER plan, BEFORE refreeze -- the exact window
      // Finding 1 closes: a second write path into the persisted-plan baseline.
      tamperPluginFile(plugin, changed, "refreeze-time plugin drift");
      assert.throws(
        () => refreezeHumanGuardOverridePlan({
          rootDir: root, pluginRoot: plugin, requestSha256: request.requestSha256, nowMs: 3000,
        }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
      );
      // The persisted plan must NOT have been overwritten with the tampered plugin
      // identity -- a later plan() cache read (no re-observation, no re-comparison)
      // must still return the exact pre-tamper baseline, proving the poisoning this
      // finding describes genuinely cannot happen.
      const rePlan = planHumanGuardOverride({
        rootDir: root, pluginRoot: plugin, requestSha256: request.requestSha256, nowMs: 3500, scriptPath,
      });
      assert.equal(rePlan.planSha256, plan.planSha256);
      assert.deepEqual(rePlan.plugin, plan.plugin);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(plugin, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------------
// Critic finding 3 (minor; design doc §1.7's own already-flagged open item): the
// persisted plans store is keyed by (requestSha256, authorSourceRoot) -- prove two
// different authorSourceRoot values for the SAME requestSha256 persist as two
// independent files that never collide or overwrite one another.
// ---------------------------------------------------------------------------------
test("Finding 3: two different non-null authorSourceRoot values for the same requestSha256 persist as independent, non-colliding plans", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "authorSourceRoot collision probe\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const plansDir = join(common, "agent-pipeline", "human-guard-overrides", "plans");
    // The plans store never deep-validates plugin/repository/policy/preview content
    // (validatedPlan() only checks the outer key set, schema, status and digest
    // self-consistency) -- so a directly-fabricated, self-consistent record is a
    // faithful, minimal probe of the storage keying itself, independent of the
    // author-repair eligibility gate (which forces exactly one resolved source root
    // per repository, and so cannot itself exercise two distinct persisted values).
    function fabricatedRecord(authorSourceRoot, tag) {
      const payload = {
        schema: "pipeline.human-guard-override-plan.v2",
        status: "planned",
        root,
        requestSha256: request.requestSha256,
        plugin: { tag },
        repository: { tag },
        toolName: "Write",
        toolInputSha256: humanGuardOverrideInternals.sha(`toolInput-${tag}`),
        commandClass: "exact-project-action",
        denials: [],
        policy: { tag },
        preview: { tag },
        eligiblePaths: [`plugins/pipeline-core/${tag}.mjs`],
        mode: "pipeline-author-repair",
        authorSourceRoot,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      const planSha256 = humanGuardOverrideInternals.sha(payload);
      return { ...payload, planSha256 };
    }
    const authorSourceRootA = join(root, "plugins", "pipeline-core-a");
    const authorSourceRootB = join(root, "plugins", "pipeline-core-b");
    const recordA = fabricatedRecord(authorSourceRootA, "a");
    const recordB = fabricatedRecord(authorSourceRootB, "b");
    assert.notEqual(recordA.planSha256, recordB.planSha256);
    const pathA = join(plansDir, `${humanGuardOverrideInternals.sha({ requestSha256: request.requestSha256, authorSourceRoot: authorSourceRootA })}.json`);
    const pathB = join(plansDir, `${humanGuardOverrideInternals.sha({ requestSha256: request.requestSha256, authorSourceRoot: authorSourceRootB })}.json`);
    assert.notEqual(pathA, pathB);
    writeFileSync(pathA, `${JSON.stringify(recordA)}\n`, { mode: 0o600 });
    writeFileSync(pathB, `${JSON.stringify(recordB)}\n`, { mode: 0o600 });
    const planA = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      authorSourceRoot: authorSourceRootA, nowMs: 2000, scriptPath,
    });
    const planB = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      authorSourceRoot: authorSourceRootB, nowMs: 2000, scriptPath,
    });
    assert.equal(planA.planSha256, recordA.planSha256);
    assert.equal(planB.planSha256, recordB.planSha256);
    assert.notEqual(planA.planSha256, planB.planSha256);
    assert.equal(planA.authorSourceRoot, authorSourceRootA);
    assert.equal(planB.authorSourceRoot, authorSourceRootB);
    // Re-reading A after B exists on disk must still return A's own, unmodified
    // record -- no overwrite/collision between the two independent keys.
    const rereadA = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      authorSourceRoot: authorSourceRootA, nowMs: 2500, scriptPath,
    });
    assert.equal(rereadA.planSha256, recordA.planSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("governance/events/ status lines are excluded from statusSha256 drift check", () => {
  const { filterGovernanceEventsStatus } = humanGuardOverrideInternals;
  const rawStatus = [
    " M plugins/pipeline-core/lib/human-guard-override.mjs",
    "?? governance/events/human/1-evt-test.jsonl",
    "?? governance/events/machine/2-evt-test.jsonl",
    "?? scratch/probe.txt",
  ].join("\n");
  const filtered = filterGovernanceEventsStatus(rawStatus);
  assert.equal(
    filtered,
    [
      " M plugins/pipeline-core/lib/human-guard-override.mjs",
      "?? scratch/probe.txt",
    ].join("\n"),
  );
});
