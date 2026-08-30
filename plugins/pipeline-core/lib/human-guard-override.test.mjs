#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  authorizeHumanGuardOverride,
  authorizeHumanGuardOverrideBySignature,
  buildHumanGuardOverrideSignatureIntent,
  concurrentWorktreeAdvisory,
  consumeHumanGuardOverride,
  describeHumanGuardOverrideSelection,
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

// NVA-HGOTEST-1: `prepareHumanGuardOverrideAuthorization()`, `authorizeHumanGuardOverride()`
// and `authorizeHumanGuardOverrideBySignature()` re-derive the global-plugin-install plan
// internally and carry NO `codexSpawn` seam of their own (unlike `recordHumanGuardDenial`,
// `planHumanGuardOverride` and `consumeHumanGuardOverride`, the three entry points the
// sibling "spawn is injectable" test exercises) -- so mocking only `codexSpawn` at the call
// sites that accept it still leaves those three re-derivations reading the REAL,
// uncontrolled `codex` binary this HOST may or may not have registered under
// `agent-pipeline-local`. `codexMarketplaceRegistry()` resolves `codex` by spawning it with
// `env.PATH: process.env.PATH`, read fresh on every call (never captured at import time), so
// a temporary directory prepended to `process.env.PATH` for a test's duration reaches every
// call in the chain uniformly -- including the un-seamed ones -- without a production-code
// change. Every test below that needs the `global-plugin-install` shape to be host-
// independent wraps its body in this helper with an empty `marketplaces` array (the
// synthetic fixture never registers `agent-pipeline-local` itself, so "not registered" is
// the outcome consistent with what each of these tests actually builds).
function withFakeCodexRegistry(marketplaces, fn) {
  const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
  const scriptPath = join(dir, "codex");
  const payload = JSON.stringify({ marketplaces }).replace(/'/g, "'\\''");
  writeFileSync(scriptPath, `#!/bin/sh\nprintf '%s' '${payload}'\n`);
  chmodSync(scriptPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${originalPath ?? ""}`;
  try {
    return fn();
  } finally {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  }
}

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

// NVA-HGOFIX-1 regression fixture: the same signed-admission topology as
// fixtureSignature(), but committing the v3 `trustAnchors` SET schema instead of the
// legacy singular `trustAnchor` field. `anchors` is written verbatim -- `[]` reproduces
// the "committed, but explicitly empty" v3 posture (must still fail closed), and a
// populated array reproduces the "v3-only, no legacy singular field" posture the bug
// (reading only `policy.trustAnchor`, permanently `null` once a document is v3) never
// read at all.
function fixtureSignatureV3(anchors) {
  const root = mkdtempSync(join(tmpdir(), "human-guard-override-sig-v3-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"],
    waivedKinds: [],
    trustAnchors: anchors,
  }));
  git(root, "add", "README.md", "pipeline.user.yaml", "project/critical-human-proof.json");
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
  toolName, toolInput, denials, nowMs = 1000, ttlMs, keyPair = sigPair, keyReference = SIG_KEY_REFERENCE,
} = {}) {
  const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
  const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials, nowMs, ttlMs });
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

// NVA-SIGENTRY-1 DoD check 1: the extracted buildHumanGuardOverrideSignatureIntent()
// helper must produce the IDENTICAL digest this already-passing test's own,
// independently-reconstructed intent (prepareSignedArming() above builds it without
// calling into any exported library helper, exactly as an external signer would) --
// proving the authorizeHumanGuardOverrideBySignature() refactor changed nothing
// observable about what gets signed.
test("NVA-SIGENTRY-1: buildHumanGuardOverrideSignatureIntent() produces the same digest an existing signed-authorization test already expects", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "signed regression\n" };
    const { scriptPath, recorded, plan, prepared, intent } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    const rebuilt = buildHumanGuardOverrideSignatureIntent({ prepared, planned: plan });
    assert.equal(rebuilt.sha256, intent.sha256);
    assert.deepEqual(rebuilt.value, intent.value);
    // And the value the verifier itself gates on, for the same inputs, arms successfully --
    // the extracted helper's output is not merely equal, it is the same value in use.
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: recorded.requestSha256,
      planSha256: plan.planSha256,
      proof: {
        schema: PO_APPROVAL_PROOF_SCHEMA,
        intentSha256: rebuilt.sha256,
        keyReference: SIG_KEY_REFERENCE,
        publicKey: sigPublicKey,
        signatureBase64: sign(null, Buffer.from(rebuilt.sha256, "utf8"), sigPair.privateKey).toString("base64"),
      },
      nowMs: 3000,
      scriptPath,
    });
    assert.equal(armed.status, "armed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// NVA-SIGENTRY-1 DoD check 5: describeHumanGuardOverrideSelection() must never resolve
// to the first/only stored request found -- it must find the ONE whose recomputed
// digest actually equals the given intentSha256, even with multiple pending denials
// stored in the same repository at once.
test("NVA-SIGENTRY-1: describeHumanGuardOverrideSelection() resolves the exact matching stored request, never the wrong one among several", () => {
  const root = fixtureSignature();
  try {
    // describeHumanGuardOverrideSelection() re-plans/re-prepares using its OWN real
    // Date.now() (it accepts no injectable nowMs, exactly like
    // describeGuardMaintenanceWindowRequest()), so the fixture must use real,
    // current timestamps too -- an artificial epoch-relative nowMs (as most of this
    // suite's OTHER fixtures use, self-consistently, for the request/plan/authorize
    // calls they alone drive) would already read as expired against real wall-clock
    // time and never resolve.
    const base = Date.now();
    const first = prepareSignedArming(root, {
      toolName: "Write", toolInput: { file_path: "first-file.md", content: "first\n" }, denials: denial, nowMs: base,
    });
    const second = prepareSignedArming(root, {
      toolName: "Write", toolInput: { file_path: "second-file.md", content: "second\n" }, denials: denial, nowMs: base + 10,
    });
    assert.notEqual(first.intent.sha256, second.intent.sha256);

    const resolvedSecond = describeHumanGuardOverrideSelection({
      rootDir: root, pluginRoot: PLUGIN_ROOT, intentSha256: second.intent.sha256, scriptPath: second.scriptPath,
    });
    assert.equal(resolvedSecond.resolved, true);
    assert.equal(resolvedSecond.code, "HGO-RECORD-RESOLVED");
    const secondText = resolvedSecond.lines.join("\n");
    assert.ok(secondText.includes("second-file.md"), "must show the SECOND request's own eligible path");
    assert.equal(secondText.includes("first-file.md"), false, "must never show the first request's path for the second digest");

    const resolvedFirst = describeHumanGuardOverrideSelection({
      rootDir: root, pluginRoot: PLUGIN_ROOT, intentSha256: first.intent.sha256, scriptPath: first.scriptPath,
    });
    assert.equal(resolvedFirst.resolved, true);
    const firstText = resolvedFirst.lines.join("\n");
    assert.ok(firstText.includes("first-file.md"), "must show the FIRST request's own eligible path");
    assert.equal(firstText.includes("second-file.md"), false, "must never show the second request's path for the first digest");

    // The recorded denial's rationale and expiry are disclosed too (ADR-0059's "eligible
    // paths / denying guard's rationale / expiry").
    assert.ok(secondText.includes("GUARD-LIFECYCLE-NOT-READY"));
    assert.match(secondText, /expires at/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// NVA-SIGENTRY-1 DoD check 4: a digest resolving to no stored request at all -- neither
// GMW nor HGO -- must fall through unresolved, unchanged; this proves the new resolver
// is additive rather than a wider "always resolves something" behaviour.
test("NVA-SIGENTRY-1: describeHumanGuardOverrideSelection() stays unresolved for a digest that matches no stored request", () => {
  const root = fixtureSignature();
  try {
    prepareSignedArming(root, { toolName: "Write", toolInput: { file_path: "notes.md", content: "unrelated\n" }, denials: denial });
    const unrelated = createHash("sha256").update("some other intent entirely").digest("hex");
    const record = describeHumanGuardOverrideSelection({ rootDir: root, pluginRoot: PLUGIN_ROOT, intentSha256: unrelated, scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs") });
    assert.equal(record.resolved, false);
    assert.equal(record.code, "HGO-RECORD-DIGEST-MISMATCH");
    assert.deepEqual(record.lines, []);
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

// Regression for backlog/items/2026-08-28-an-expired-override-is-armed-instead-of-refused.md:
// the plan's own `expiresAt` freezes at plan first-creation, but the arm call can land much
// later (an external signature ceremony takes real wall-clock time) -- previously
// authorize-by-signature copied `planned.expiresAt` into the capability without ever
// comparing it to `nowMs`, so it happily armed a capability already past its own window.
test("NVA-G-EXPIREDARM: authorize-by-signature refuses to arm once the plan window has closed, writes no capability, and still arms an unexpired plan", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "expired arm\n" };
    // A short ttlMs (2000ms from nowMs: 1000) puts the plan's expiresAt at 3000ms --
    // well before the arm call below at nowMs: 9000.
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, {
      toolName: "Write", toolInput, denials: denial, nowMs: 1000, ttlMs: 2000,
    });
    assert.throws(
      () => authorizeHumanGuardOverrideBySignature({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 9000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-EXPIRED",
    );
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const capabilities = join(common, "agent-pipeline", "human-guard-overrides", "capabilities");
    assert.equal(
      existsSync(capabilities) ? readdirSync(capabilities).length : 0,
      0,
      "a refused arm must never write a capability file",
    );
    // The identical plan/proof pair, retried while the window is still open, still arms --
    // the fix only moves the answer earlier; it never narrows the ordinary in-window case.
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 2000, scriptPath,
    });
    assert.equal(armed.status, "armed");
    assert.equal(armed.mutated, true);
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
  // NVA-HGOTEST-1: this test's own subject is the signed-path refusal, orthogonal to
  // this host's real, uncontrolled `agent-pipeline-local` marketplace registration --
  // see withFakeCodexRegistry() above for why the whole body needs the shim, not only
  // the entry points that carry a `codexSpawn` parameter.
  withFakeCodexRegistry([], () => {
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
});

test("Part C: prepareHumanGuardOverrideForSignature() fails closed on the global-plugin-install denial class with HGO-SIGNATURE-INTENT-INVALID (not a silent pass-through)", () => {
  // Regression for a documented-but-untested claim (Critic finding, PHX-WP-HGO-FAILCLOSED-IMPL-C
  // round 1): the function's own docstring asserts createPoApprovalIntent()'s candidate
  // validation already throws for this mode because its repository observation carries no
  // head/tree -- this test is that discriminating check, not just the reasoning.
  // NVA-HGOTEST-1: wrapped in withFakeCodexRegistry() like every sibling
  // global-plugin-install test above -- recordHumanGuardDenial()'s external-marketplace
  // observation otherwise reads this HOST's real, uncontrolled `codex` registration.
  withFakeCodexRegistry([], () => {
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

// NVA-HGOFIX-1: the signed-admission path used to read ONLY the legacy singular
// `policy.trustAnchor` field, which is permanently `null` once `critical-human-proof.json`
// carries the v3 `trustAnchors` SET -- every signed override failed with
// HGO-TRUST-ANCHOR-MISSING regardless of how correctly it was signed. Same defect class
// already fixed in guard-maintenance-window.mjs (NVA-GMWFIX-1/NVA-GMWFIX-2).
test("NVA-HGOFIX-1: a v3-only trustAnchors array (no legacy singular trustAnchor) is honored -- previously failed with HGO-TRUST-ANCHOR-MISSING", () => {
  const root = fixtureSignatureV3([{ keyReference: SIG_KEY_REFERENCE, publicKeySha256: sigPublicKeySha256 }]);
  try {
    const toolInput = { file_path: "notes.md", content: "v3 trust anchors\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The negative case that proves this fix did NOT adopt verifyAgainstTrustAnchors()'s own
// "absent/empty anchors accepts any well-formed key" posture: an explicitly empty v3 set,
// with no legacy singular fallback either, must still fail closed -- HGO is a general
// override of an arbitrary guard denial (ADR-0059), the same risk class as GMW, not one of
// the four CRITICAL_ACTION_KINDS ceremonies that posture is deliberate for.
test("NVA-HGOFIX-1: an EMPTY v3 trustAnchors array with no legacy trustAnchor still fails closed with HGO-TRUST-ANCHOR-MISSING (never the any-well-formed-key posture)", () => {
  const root = fixtureSignatureV3([]);
  try {
    const toolInput = { file_path: "notes.md", content: "v3 empty trust anchors\n" };
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

// No regression: the pre-existing legacy-singular-only (v1/v2 schema) case must keep
// working unchanged under the new anchors-array resolution.
test("NVA-HGOFIX-1: the pre-existing legacy-singular-only trustAnchor case is unaffected by the v3 resolution fix (no regression)", () => {
  const root = fixtureSignature();
  try {
    const toolInput = { file_path: "notes.md", content: "legacy singular trust anchor\n" };
    const { scriptPath, recorded, plan, proof } = prepareSignedArming(root, { toolName: "Write", toolInput, denials: denial });
    const armed = authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
  // NVA-HGOTEST-1: see withFakeCodexRegistry() above -- this test's own subject is
  // host-Git-unavailability, orthogonal to this host's real marketplace registration.
  withFakeCodexRegistry([], () => {
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
});

test("local plugin installation capability rejects a changed candidate source", () => {
  // NVA-HGOTEST-1: see withFakeCodexRegistry() above -- this test's own subject is
  // changed-candidate-source rejection, orthogonal to this host's real marketplace
  // registration.
  withFakeCodexRegistry([], () => {
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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

// Regression for backlog/items/2026-08-28-an-expired-override-is-armed-instead-of-refused.md,
// chat-mode sibling of the signed-path test above: authorizeHumanGuardOverride()'s in-session
// `activate` path built the identical `capabilityCore` without checking `planned.expiresAt`
// against `nowMs` either.
test("NVA-G-EXPIREDARM: authorizeHumanGuardOverride (chat mode) refuses to arm once the plan window has closed, writes no capability, and still arms an unexpired plan", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "expired chat arm\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000, ttlMs: 2000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 1500, scriptPath,
    });
    const reason = "Exact attended retry";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256, reason, nowMs: 1800, scriptPath,
    });
    const activate = (nowMs) => authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: reasonDigest(reason),
      activate: true,
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
      nowMs,
      scriptPath,
    });
    // plan.expiresAt is 1000 + 2000 = 3000ms; 9000ms is well past the window.
    assert.throws(
      () => activate(9000),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-EXPIRED",
    );
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const capabilities = join(common, "agent-pipeline", "human-guard-overrides", "capabilities");
    assert.equal(
      existsSync(capabilities) ? readdirSync(capabilities).length : 0,
      0,
      "a refused arm must never write a capability file",
    );
    // The identical selection, retried while the window is still open, still arms.
    const armed = activate(1900);
    assert.equal(armed.status, "armed");
    assert.equal(armed.mutated, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Regression for backlog/items/2026-08-28-an-expired-override-is-armed-instead-of-refused.md's
// Acceptance criterion 2: "A denial that rejected an armed-but-unusable capability names the
// reason." The two shapes below must never collapse into the same rendering -- that collapse
// is exactly what turned a one-line cause into a multi-step investigation in the incident.
test("NVA-G-EXPIREDARM: a consumption denial that rejected an existing (but now-expired) armed capability is distinguishable from a first denial", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "distinguishable denial\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    // A first denial: no capability of any shape has ever existed for this exact command.
    const firstDenial = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    assert.deepEqual(firstDenial, { status: "absent" });

    // An armed capability that later expires unconsumed (armed inside its own window).
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 2000, ttlMs: 2000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2200, scriptPath,
    });
    const reason = "Exact attended retry";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256, reason, nowMs: 2400, scriptPath,
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
      nowMs: 2600,
      scriptPath,
    });
    const expiredDenial = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 5000,
    });
    assert.deepEqual(expiredDenial, { status: "replan", code: "HGO-EXPIRED" });
    assert.notDeepEqual(
      firstDenial,
      expiredDenial,
      "a denial rejecting an existing armed-but-expired capability must be distinguishable from a first denial",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-W3-16: a rejected drift audit entry names exactly which checks diverged", () => {
  // Regression for backlog/items/2026-08-18-pipeline-author-repair-signature-
  // mode-never-actually-admits-the-edit.md's recommended diagnostic step:
  // the coarse pre-filter (toolName/toolInputSha256/denials/status) cannot
  // distinguish WHICH of the finer-grained drift checks below it actually
  // failed on. Here the coarse filter still matches (same tool/input/denials)
  // but the repository itself changes between authorize and consume, so the
  // capability reaches the drift computation and rejects on "repository".
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
      nowMs: 3000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    git(root, "commit", "--allow-empty", "-q", "-m", "repository drifts after authorization");
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }), { status: "replan", code: "HGO-DRIFT" });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const auditPath = join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    const rejected = lines.map((line) => JSON.parse(line)).find((entry) => entry.event?.code === "HGO-DRIFT");
    assert.ok(rejected, "expected one HGO-DRIFT audit entry");
    assert.deepEqual(rejected.event.driftedChecks, ["repository"]);
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

// NVA-W4-01B: HGO-EXTERNAL-PROJECT-BOUNDARY's `nextAction.action` used to disclose only
// `toolInputSha256` for a Bash command reaching this branch, leaving the human operator no
// way to reconstruct the exact denied command without independently re-deriving it. It now
// also carries the literal `command` plus a bounded, copy-safe `copyCommand` rendering of it
// (boundedOpaqueCopyCommand()), mirroring codex-pretool-guard.mjs's own commandDisclosureFields()
// for its equivalent denial class. Non-Bash tools (Edit/Write) have no `command` field at
// all and keep the unchanged toolInputSha256-only disclosure.
test("NVA-W4-01B: HGO-EXTERNAL-PROJECT-BOUNDARY discloses a bounded copy-safe rendering of the exact denied Bash command", () => {
  const root = fixture();
  try {
    // Same in-root-symlink-escape shape as the "security and authority boundaries" test's
    // `linked/escape.txt` Write row above (a symlink whose real target stays inside root,
    // so it fails safePath()'s walk without qualifying as a genuine cross-repository
    // target) -- here reached through `node --check <path>`, the one Bash shape that
    // routes a single argument through classifyPath() the same way. `cat .git/config`
    // was tried first and does NOT reach this branch: protectedPath() matches every
    // `.git/`-prefixed path (human-guard-override.mjs:920), so recoveryRoute() always
    // takes the OTHER half of the `protectedTarget` branch (narrower-recovery-required,
    // HGO-NARROWER-WRITER-REQUIRED) for it, never HGO-EXTERNAL-PROJECT-BOUNDARY.
    mkdirSync(join(root, "physical"), { recursive: true });
    symlinkSync(join(root, "physical"), join(root, "linked"), "dir");
    writeFileSync(join(root, "physical", "escape.txt"), "shared\n");
    const toolInput = { command: "node --check linked/escape.txt" };
    const observed = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput,
      denials: denial,
    });
    assert.equal(observed.status, "external-operator-required");
    assert.equal(observed.code, "HGO-EXTERNAL-PROJECT-BOUNDARY");
    assert.equal(observed.nextAction.action.command, toolInput.command);
    assert.equal(typeof observed.nextAction.action.copyCommand, "object");
    assert.equal(observed.nextAction.action.copyCommand.maxColumns > 0, true);
    assert.equal(typeof observed.nextAction.action.copyCommand.posix, "string");
    assert.match(observed.nextAction.action.copyCommand.posix, /eval "\$CMD"/u);

    // A non-Bash tool (no `command` field at all) keeps the pre-existing disclosure shape:
    // both new fields present but explicitly null, never omitted or invented. Same hardlink
    // fixture the "security and authority boundaries" test above uses to reach this exact
    // status for a Write.
    mkdirSync(join(root, "physical"), { recursive: true });
    writeFileSync(join(root, "physical", "linked-source.txt"), "shared\n");
    linkSync(join(root, "physical", "linked-source.txt"), join(root, "hardlinked.txt"));
    const writeObserved = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { file_path: "hardlinked.txt", content: "x" },
      denials: denial,
    });
    assert.equal(writeObserved.status, "external-operator-required");
    assert.equal(writeObserved.nextAction.action.command, null);
    assert.equal(writeObserved.nextAction.action.copyCommand, null);
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
    // NVA-CROSSREPOGUIDANCE-1: the "author-repair-required" branch had the identical
    // missing-root gap as "planned"; its guidance line names --repo too, so it carries the
    // bound root as well. Author repair is never cross-repository, so this is the
    // coordinator's own root -- pinned here so the field cannot silently go missing again.
    assert.equal(request.root, git(root, "rev-parse", "--path-format=absolute", "--show-toplevel"));
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
    // NVA-SIGDISCLOSE-1 Finding 6: the tampered record is still never consumed (the
    // security property this test's own name asserts) -- but with only ONE capability in
    // the store, the loop now SKIPS the unvalidatable record and RECORDS which one and
    // why (`skippedInvalidRecords`), falling through to the ordinary "nothing usable
    // found" result, rather than reporting a whole-store `{status:"invalid"}` that names
    // no record at all. See "a tampered capability among several never poisons the
    // others" below for the multi-record case this finding actually targets.
    const result = consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    });
    assert.notEqual(result.status, "consumed", "a tampered capability must never be consumed");
    assert.deepEqual(result, {
      status: "absent",
      skippedInvalidRecords: [{ planSha256: plan.planSha256, code: "HGO-CAPABILITY" }],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-SIGDISCLOSE-1 Finding 6: a tampered capability among several never poisons the others -- the valid, armed one still consumes", () => {
  const root = fixture();
  try {
    const goodInput = { file_path: "good.md", content: "good\n" };
    const badInput = { file_path: "bad.md", content: "bad\n" };
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    function arm(toolInput, nowMs, reason) {
      const request = recordHumanGuardDenial({
        rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs,
      });
      const plan = planHumanGuardOverride({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: nowMs + 100, scriptPath,
      });
      const prepared = prepareHumanGuardOverrideAuthorization({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
        planSha256: plan.planSha256, reason, nowMs: nowMs + 200, scriptPath,
      });
      authorizeHumanGuardOverride({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
        planSha256: plan.planSha256, selectionSha256: prepared.selectionSha256, reason,
        reasonSha256: prepared.reasonSha256, activate: true,
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` }, nowMs: nowMs + 300, scriptPath,
      });
      return plan.planSha256;
    }
    // planSha256 values are content-addressed digests, not sequential -- the enumeration
    // loop's own readdirSync().sort() decides which of these two is visited first, not the
    // order they were armed in. Corrupt whichever ACTUALLY sorts first (determined here,
    // not assumed) so this test exercises the ordering finding 6 names -- a bad record
    // encountered before a good one -- regardless of how the two digests happen to compare.
    const inputByPlan = new Map();
    const planA = arm(badInput, 1000, "F6 candidate A"); inputByPlan.set(planA, badInput);
    const planB = arm(goodInput, 5000, "F6 candidate B"); inputByPlan.set(planB, goodInput);
    const [firstPlanSha256, secondPlanSha256] = [planA, planB].sort();

    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const badPath = join(common, "agent-pipeline", "human-guard-overrides", "capabilities", `${firstPlanSha256}.json`);
    const badValue = JSON.parse(readFileSync(badPath, "utf8"));
    badValue.schema = "pipeline.human-guard-override-capability.v1"; // stale/unsupported schema version
    writeFileSync(badPath, `${JSON.stringify(badValue)}\n`, { mode: 0o600 });

    const result = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput: inputByPlan.get(secondPlanSha256), denials: denial, nowMs: 9000,
    });
    assert.equal(result.status, "consumed", "the valid, armed capability that sorts AFTER the corrupted one must still be usable");
    assert.equal(result.planSha256, secondPlanSha256);
    assert.deepEqual(result.skippedInvalidRecords, [{ planSha256: firstPlanSha256, code: "HGO-CAPABILITY" }], "the skipped record must be named, not silently dropped");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-SIGDISCLOSE-1 Finding 6: a record that IS validated but is a legitimate non-match (wrong tool input) is still refused exactly as before -- no security regression", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "legit non-match\n" };
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000, scriptPath,
    });
    const reason = "F6 legitimate non-match regression guard";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      planSha256: plan.planSha256, reason, nowMs: 2500, scriptPath,
    });
    authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      planSha256: plan.planSha256, selectionSha256: prepared.selectionSha256, reason,
      reasonSha256: prepared.reasonSha256, activate: true,
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` }, nowMs: 3000, scriptPath,
    });
    // A DIFFERENT, unrelated tool call -- the armed capability is well-formed and valid,
    // it simply does not match. This must fall straight through to "absent", carrying no
    // skippedInvalidRecords at all: a legitimate non-match is not a validation failure.
    const result = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
      toolInput: { file_path: "unrelated.md", content: "unrelated\n" }, denials: denial, nowMs: 4000,
    });
    assert.deepEqual(result, { status: "absent" });
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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

test("secureDirectory hardens EVERY newly-created path component, not only the leaf (NVA-PAWINACL-2)", () => {
  const root = mkdtempSync(join(tmpdir(), "human-guard-multi-component-harden-"));
  try {
    // Neither "shared-parent" nor "leaf" exists yet -- a single recursive
    // mkdirSync creates both in one call, the exact shape that left a shared
    // intermediate (e.g. .git/agent-pipeline/) with the default inherited
    // Windows ACL before this fix.
    const parent = join(root, "shared-parent");
    const target = join(parent, "leaf");
    const hardened = [];
    const result = humanGuardOverrideInternals.secureDirectory(target, {
      platform: "win32",
      hardenWindowsPrivateDirectoryFn(candidate) {
        hardened.push(candidate);
        return { status: "secure" };
      },
    });
    assert.equal(result, target);
    assert.deepEqual(hardened, [parent, target]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("secureDirectory only ASSESSES an already-secure existing parent, never re-hardens it, when adding a new child (NVA-PAWINACL-2)", () => {
  const root = mkdtempSync(join(tmpdir(), "human-guard-existing-parent-new-child-"));
  try {
    const base = join(root, "base");
    mkdirSync(base, { mode: 0o700 });
    const child = join(base, "child");
    const assessed = [];
    const hardened = [];
    const result = humanGuardOverrideInternals.secureDirectory(child, {
      platform: "win32",
      assessWindowsPrivatePathFn(candidate) {
        assessed.push(candidate);
        return { status: "secure" };
      },
      hardenWindowsPrivateDirectoryFn(candidate) {
        hardened.push(candidate);
        return { status: "secure" };
      },
    });
    assert.equal(result, child);
    assert.deepEqual(assessed, []);
    assert.deepEqual(hardened, [child]);
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
  //
  // AGY-MKTATTEST-1 (Direction 3, PO-approved 2026-08-25; backlog:
  // 2026-08-24-verify-marketplace-attestation-blocks-normal-active-development.md):
  // the ONE live comparison this call drives -- this machine's actual external
  // local-marketplace copy against this checkout -- legitimately drifts on EVERY
  // ordinary commit touching plugins/pipeline-core/**, which is the normal shape
  // of work on this repository, not only on a real defect. That one failure code
  // (HGO-EXTERNAL-MARKETPLACE) is downgraded to a visible WARN here and no longer
  // fails this test or Full Verify. The underlying security property (an agent
  // cannot falsely claim the external marketplace matches the checkout) is now
  // enforced hard at push time instead -- see guard-push.mjs's
  // checkMarketplaceAttestation() and its own live-blocking coverage further down
  // in this file. Every OTHER failure this call can raise (e.g. HGO-PLUGIN-SOURCE,
  // a regression in THIS checkout's own manifest/tree) is NOT downgraded and still
  // fails this test.
  const repoRoot = join(PLUGIN_ROOT, "..", "..");
  assert.equal(humanGuardOverrideInternals.isPipelineSourceRoot(repoRoot), true);
  let observation;
  try {
    observation = humanGuardOverrideInternals.localPluginInstallSourceObservation({ root: repoRoot });
  } catch (error) {
    if (!(error instanceof HumanGuardOverrideError) || error.code !== "HGO-EXTERNAL-MARKETPLACE") throw error;
    console.warn(
      "[AGY-MKTATTEST-1] WARN: this machine's external local-marketplace copy does not match this checkout " +
      `(${error.message}). Expected during active development on plugins/pipeline-core/** -- the underlying ` +
      "security property is now enforced hard at push time instead (guard-push.mjs); Verify stays informative here, not blocking.",
    );
    // The internal checkout's own attestation must still be proven every run -- re-run
    // with the external registry read forced unreadable (never trusted from live machine
    // state inside a deterministic test) so the WARN above can never become an
    // assertion-free pass that silently stops covering a real regression in this
    // checkout's own manifest/tree (the failure mode F1 exists to catch).
    observation = humanGuardOverrideInternals.localPluginInstallSourceObservation(
      { root: repoRoot },
      { registryReader: () => null },
    );
  }
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

test("NVA-BL-20: the attestation exposes the external-marketplace state it hashed, without changing the hash", { skip: JUNCTION_SKIP }, () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const external = externalMarketplace(base, "external");
    symlinkSync(checkout.sourceRoot, join(external, "plugins", "pipeline-core"), "junction");
    const repo = { root: checkout.root, common: join(checkout.root, ".git") };
    const attest = (registryReader) =>
      humanGuardOverrideInternals.localPluginInstallSourceObservation(repo, { registryReader });
    // The value exposed is the SAME observation folded into statusSha256, not a
    // separately recomputed one that could drift from what was actually hashed.
    const verified = attest(localRegistry(external));
    assert.deepEqual(
      verified.externalMarketplace,
      humanGuardOverrideInternals.externalLocalMarketplaceObservation(
        { root: checkout.root },
        { registryReader: localRegistry(external) },
      ),
    );
    assert.equal(verified.externalMarketplace.state, "verified");
    // Each typed branch is legible from the return value alone -- previously
    // only an opaque digest difference distinguished them.
    assert.deepEqual(attest(() => null).externalMarketplace, { state: "unobserved", reason: "registry-unavailable" });
    assert.deepEqual(attest(externalRegistry([])).externalMarketplace, { state: "unobserved", reason: "not-registered" });
    // Hashes and typed tokens only: this object is persisted into the request,
    // plan and capability records, so a raw filesystem path would be disclosure.
    assert.deepEqual(
      Object.keys(verified.externalMarketplace).sort(),
      ["entryKind", "manifestSha256", "rootSha256", "state"],
    );
    assert.equal(JSON.stringify(verified.externalMarketplace).includes(base), false);
    // The exposure is additive: statusSha256's own preimage is untouched. This
    // digest is content-derived only (no temp path reaches it), so it is pinned
    // here against the value the attestation produced before the field existed.
    assert.equal(
      attest(() => null).statusSha256,
      "05f14cb8707b25d4f06714c3bea1354648d2cd6638b93b67caa83a79f440863e",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// NVA-MKTHASH-1: the PO's actual, deliberate local-development shape rsync-copies a
// REAL, independent directory to the external local-marketplace root's own
// plugins/pipeline-core entry, rather than symlinking it (ADR-0052's only
// documented arrangement so far). externalLocalMarketplaceObservation() ADDITIONALLY
// accepts that shape now, but ONLY when the copy's full content hash -- via the
// identical pluginSourceTreeSha256() walker used for this checkout's own
// attestation -- exactly equals this checkout's own hash. The existing
// symlink/junction path above is untouched; these tests cover only the new branch.
// ---------------------------------------------------------------------------------

test("NVA-MKTHASH-1: a real, content-identical directory copy at the external entry is verified via hash equality", () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const external = externalMarketplace(base, "external");
    cpSync(checkout.sourceRoot, join(external, "plugins", "pipeline-core"), { recursive: true });
    const registryReader = localRegistry(external);
    const checkoutTreeSha256 = humanGuardOverrideInternals.pluginSourceTreeSha256(checkout.sourceRoot);
    const verified = humanGuardOverrideInternals.externalLocalMarketplaceObservation(
      { root: checkout.root },
      { registryReader, checkoutTreeSha256 },
    );
    assert.equal(verified.state, "verified");
    assert.equal(verified.entryKind, "directory-copy");
    assert.match(verified.rootSha256, /^[a-f0-9]{64}$/u);
    assert.match(verified.manifestSha256, /^[a-f0-9]{64}$/u);
    // Omitting the comparison value entirely -- the default every OTHER direct
    // caller in this suite gets -- still fails closed: the new path is opt-in
    // via the threaded hash, never a blanket "any real directory here is fine".
    assert.throws(
      () => humanGuardOverrideInternals.externalLocalMarketplaceObservation(
        { root: checkout.root },
        { registryReader },
      ),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-EXTERNAL-MARKETPLACE",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("NVA-MKTHASH-1: a real directory copy whose content diverges from this checkout fails closed with a distinct message", () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const external = externalMarketplace(base, "external");
    cpSync(checkout.sourceRoot, join(external, "plugins", "pipeline-core"), { recursive: true });
    // One extra file is enough to diverge the tree hash -- a stale, tampered,
    // unrelated, or partially synced copy all reduce to this same shape.
    writeFileSync(join(external, "plugins", "pipeline-core", "smuggled.txt"), "not part of this checkout\n");
    const registryReader = localRegistry(external);
    const checkoutTreeSha256 = humanGuardOverrideInternals.pluginSourceTreeSha256(checkout.sourceRoot);
    assert.throws(
      () => humanGuardOverrideInternals.externalLocalMarketplaceObservation(
        { root: checkout.root },
        { registryReader, checkoutTreeSha256 },
      ),
      (error) => error instanceof HumanGuardOverrideError
        && error.code === "HGO-EXTERNAL-MARKETPLACE"
        && error.message === "external local marketplace plugin entry content does not match this checkout"
        // Distinct from the symlink-resolution failure message -- an operator
        // reading HGO-EXTERNAL-MARKETPLACE errors can tell which case they hit.
        && error.message !== "external local marketplace does not resolve to this checkout",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("NVA-MKTHASH-1/NVA-MKTHASH-2: an internal symlink planted inside the real directory copy still hard-fails, now reported as a distinct external-marketplace failure naming the external tree", { skip: JUNCTION_SKIP }, () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const external = externalMarketplace(base, "external");
    const copyRoot = join(external, "plugins", "pipeline-core");
    cpSync(checkout.sourceRoot, copyRoot, { recursive: true });
    // Plant a symlink INSIDE the copy -- pluginSourceTreeSha256() hard-fails on
    // ANY internal symlink it walks (reused here completely unmodified), so this
    // must still refuse exactly as it would for the internal checkout's own
    // tree. NVA-MKTHASH-2 (F4): the failure is now wrapped at the external call
    // site into a distinct HGO-EXTERNAL-MARKETPLACE error naming the external
    // tree, rather than surfacing the internal-checkout HGO-PLUGIN-SOURCE
    // wording verbatim -- pluginSourceTreeSha256()'s OWN error for its
    // pre-existing internal caller is unchanged (pinned elsewhere in this
    // suite).
    symlinkSync(join(copyRoot, ".codex-plugin"), join(copyRoot, "planted-link"), "junction");
    const registryReader = localRegistry(external);
    const checkoutTreeSha256 = humanGuardOverrideInternals.pluginSourceTreeSha256(checkout.sourceRoot);
    assert.throws(
      () => humanGuardOverrideInternals.externalLocalMarketplaceObservation(
        { root: checkout.root },
        { registryReader, checkoutTreeSha256 },
      ),
      (error) => error instanceof HumanGuardOverrideError
        && error.code === "HGO-EXTERNAL-MARKETPLACE"
        && error.message === "external local marketplace plugin entry contains a symbolic link",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("NVA-MKTHASH-2 (F3): a real directory copy whose entry count exceeds the bounded walk fails closed with a distinct message, before completing the hash", () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const external = externalMarketplace(base, "external");
    const copyRoot = join(external, "plugins", "pipeline-core");
    cpSync(checkout.sourceRoot, copyRoot, { recursive: true });
    // The bounded walk's own production limit
    // (EXTERNAL_MARKETPLACE_WALK_MAX_ENTRIES) is not exported -- deliberately,
    // so a test cannot silently rely on its exact numeric value drifting in
    // step with a future change to the constant. Instead this exceeds ANY
    // plausible bound by construction: enough loose files that no reasonably
    // sized external copy could legitimately contain them all, while the
    // synthetic checkout fixture above stays tiny (2 entries).
    for (let index = 0; index < 5_005; index += 1) {
      writeFileSync(join(copyRoot, `padding-${index}.txt`), "");
    }
    const registryReader = localRegistry(external);
    const checkoutTreeSha256 = humanGuardOverrideInternals.pluginSourceTreeSha256(checkout.sourceRoot);
    assert.throws(
      () => humanGuardOverrideInternals.externalLocalMarketplaceObservation(
        { root: checkout.root },
        { registryReader, checkoutTreeSha256 },
      ),
      (error) => error instanceof HumanGuardOverrideError
        && error.code === "HGO-EXTERNAL-MARKETPLACE"
        && error.message === "external local marketplace plugin entry exceeds the bounded walk"
        // Distinct from both the content-mismatch and the resolution-failure
        // messages -- an operator reading HGO-EXTERNAL-MARKETPLACE errors can
        // tell a bound trip apart from an honest content divergence.
        && error.message !== "external local marketplace plugin entry content does not match this checkout"
        && error.message !== "external local marketplace does not resolve to this checkout",
    );
    // The internal checkout's own unbounded attestation is unaffected by the
    // external bound -- same call, same value, proving pluginSourceTreeSha256's
    // pre-existing caller was not touched by this change.
    assert.equal(
      humanGuardOverrideInternals.pluginSourceTreeSha256(checkout.sourceRoot),
      checkoutTreeSha256,
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("NVA-MKTHASH-1: a real directory copy is folded into statusSha256, and a subsequent content mutation moves OUT of the verified state", () => {
  const base = externalFixture();
  try {
    const checkout = pipelineCheckout(base, "checkout");
    const external = externalMarketplace(base, "external");
    cpSync(checkout.sourceRoot, join(external, "plugins", "pipeline-core"), { recursive: true });
    const registryReader = localRegistry(external);
    const observed = humanGuardOverrideInternals.localPluginInstallSourceObservation(
      { root: checkout.root, common: join(checkout.root, ".git") },
      { registryReader },
    );
    assert.equal(observed.externalMarketplace.state, "verified");
    assert.equal(observed.externalMarketplace.entryKind, "directory-copy");
    const unobserved = humanGuardOverrideInternals.localPluginInstallSourceObservation(
      { root: checkout.root, common: join(checkout.root, ".git") },
      { registryReader: () => null },
    );
    assert.match(observed.statusSha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(observed.statusSha256, unobserved.statusSha256);
    // Unlike the sibling symlink-path test above (whose manifest mutation stays
    // WITHIN the "verified" state, so a second successful statusSha256 is
    // asserted there), a content mutation of the copy itself moves this
    // observation OUT of "verified" entirely -- the copy no longer hash-matches
    // this checkout, so the call THROWS instead of returning a new verified
    // value. This is an intentional, expected difference between the two
    // acceptance paths: a symlink's manifest is a file separate from the linked
    // tree it resolves to, but a directory copy's own tree IS the thing hashed.
    writeFileSync(join(external, "plugins", "pipeline-core", "smuggled.txt"), "not part of this checkout\n");
    assert.throws(
      () => humanGuardOverrideInternals.localPluginInstallSourceObservation(
        { root: checkout.root, common: join(checkout.root, ".git") },
        { registryReader },
      ),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-EXTERNAL-MARKETPLACE",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// NVA-BL-20 F5: every assertion above reaches the external-marketplace observation by
// calling the two INTERNAL functions directly. That proved the observation's own contract
// and nothing about whether the seam is reachable at all from the three exported entry
// points a guard actually calls -- and it was not: all three called
// `localPluginInstallSourceObservation(repo)` with no options, so the `spawn`/`registryReader`
// seam could never be driven from production. The `spawn` parameter those three already
// carry is the HOST-GIT topology adapter (`topology()`, `repositoryObservation()`), a
// different subprocess concern; routing it into the Codex registry lookup as well is what
// broke this suite's three global-plugin-install fixtures with HGO-DRIFT, because they
// deliberately stub git-unavailable at some stages and use the real `spawnSync` at others.
// Hence a SECOND, separately named parameter, `codexSpawn`, defaulting to the same real
// `spawnSync`, threaded down as the `spawn` OPTION of the observation only.
//
// Both arms of every comparison below are injected stubs. Comparing an injected stub
// against the real default would assert whether a `codex` binary exists on the machine
// running the suite -- environmental, not behavioural (see the block comment above
// JUNCTION_CAPABILITY). The stubs deliberately do NOT assert inside themselves either:
// `codexMarketplaceRegistry()` wraps the spawn call in `try { ... } catch { return null; }`,
// so a throwing stub would be silently read as an unavailable registry and both arms would
// collapse into the same state while the test still went green. The calls are recorded and
// asserted from outside instead.
test("NVA-BL-20 F5: the Codex marketplace-registry spawn is injectable from all three production entry points", () => {
  // NVA-HGOTEST-1: `prepareHumanGuardOverrideAuthorization()`/`authorizeHumanGuardOverride()`
  // below carry no `codexSpawn` seam (see withFakeCodexRegistry() above), so they always
  // read the REAL `codex` binary -- shimmed here to "not registered", the SAME state
  // `record(notRegistered)`/`plan(notRegistered)` inject explicitly via their own seam, so
  // the un-seamed calls stay consistent with the stored request/plan instead of drifting
  // against this host's real, uncontrolled marketplace registration. This does not weaken
  // this test's own subject: the codexSpawn-seam assertions below still exercise the real
  // `codexMarketplaceRegistry()` argv/parse path exactly as before, via their OWN explicit
  // injection at the three entry points that carry the parameter.
  withFakeCodexRegistry([], () => {
  const root = fixture();
  try {
    // The global-plugin-install shape, identical to the sibling fixtures above.
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
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    // The host-Git adapter this fixture simulates. It stays exactly what it is: nothing
    // below routes it into the Codex registry lookup.
    const noGit = () => ({ status: null, error: { code: "EPERM" }, stdout: "" });
    const codexCalls = [];
    // Drives the REAL codexMarketplaceRegistry() -- so the argv, the exit-status check and
    // the JSON parse are all on the proven path, which the `registryReader` seam bypasses.
    const notRegistered = (file, args) => {
      codexCalls.push(["not-registered", file, args]);
      return { status: 0, stdout: JSON.stringify({ marketplaces: [] }) };
    };
    const unreadable = (file, args) => {
      codexCalls.push(["registry-unavailable", file, args]);
      return { status: 1, stdout: "" };
    };
    const record = (codexSpawn) => recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial,
      nowMs: 1_000, spawn: noGit, codexSpawn,
    });
    // (1) recordHumanGuardDenial: the injected spawn reaches the registry lookup with the
    // exact documented argv ...
    const request = record(notRegistered);
    assert.equal(request.status, "planned");
    assert.deepEqual(codexCalls, [["not-registered", "codex", ["plugin", "marketplace", "list", "--json"]]]);
    // ... and the state it observes reaches the attestation the whole chain is bound to:
    // same fixture, same clock, same git adapter, different Codex spawn, different request.
    const other = record(unreadable);
    assert.equal(other.status, "planned");
    assert.equal(codexCalls.at(-1)[0], "registry-unavailable");
    assert.notEqual(other.requestSha256, request.requestSha256);
    const plan = (codexSpawn) => planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      nowMs: 2_000, spawn: noGit, scriptPath, codexSpawn,
    });
    // (2) planHumanGuardOverride: a different Codex spawn than the request was recorded
    // under is a drifted preimage, which is only observable if the seam is threaded.
    assert.throws(
      () => plan(unreadable),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
    );
    const planned = plan(notRegistered);
    assert.equal(planned.mode, "global-plugin-install");
    const reason = "PO approves the exact local candidate installation under an injected registry";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      planSha256: planned.planSha256, reason, nowMs: 2_500, spawn: noGit, scriptPath,
    });
    // `authorize` uses the real default git spawn for the same reason the sibling fixtures
    // above give: it is the PO's own step from an ordinary terminal. It never recomputes
    // the marketplace observation, so it takes no codexSpawn.
    authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
      planSha256: planned.planSha256, selectionSha256: prepared.selectionSha256, reason,
      reasonSha256: reasonDigest(reason), activate: true,
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` }, nowMs: 3_000, scriptPath,
    });
    const consume = (codexSpawn, nowMs) => consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial,
      nowMs, spawn: noGit, codexSpawn,
    });
    // (3) consumeHumanGuardOverride: the armed capability is refused under a different
    // Codex spawn ...
    assert.deepEqual(consume(unreadable, 4_000), { status: "replan", code: "HGO-DRIFT" });
    // ... and the refusal is the binding, not a blanket rejection: the same capability is
    // still consumable under the spawn it was armed with (a drifted consume leaves it
    // armed). Without this control, a seam that broke every consume would also pass.
    assert.deepEqual(
      consume(notRegistered, 5_000),
      { status: "consumed", planSha256: planned.planSha256, requestSha256: request.requestSha256 },
    );
    assert.equal(new Set(codexCalls.map(([, file]) => file)).size, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  });
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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

// ---------------------------------------------------------------------------------
// NVA-HGOFIX-1 (backlog/items/2026-08-17-human-guard-override-shares-the-po-human-
// approval-posix-normalization-bug.md; sibling fix ba562481 for po-human-approval.mjs's
// outside()): safePath() and crossBoundaryTarget() normalized backslashes to forward
// slashes UNCONDITIONALLY. On POSIX a backslash is an ordinary filename character, never
// a path separator, so a single path component literally named `..\x` was rewritten to
// `../x` and then read as an escape from root. The two tests below pin the two directions
// that misread produced -- one per affected function -- and both are POSIX-only by
// construction: on win32 a backslash IS a separator, so such a component cannot exist.
const POSIX_BACKSLASH_SKIP = process.platform === "win32"
  ? "a backslash is a path separator on win32; a single component containing one cannot exist there"
  : false;

// Direction 1 (safePath(), fail-CLOSED): a genuine in-root file under a directory whose
// name merely CONTAINS a backslash was denied its own in-root class.
test("NVA-HGOFIX-1: safePath() reads an in-root component literally named `..\\x` as in-root, not as an escape", { skip: POSIX_BACKSLASH_SKIP }, () => {
  const root = fixture();
  try {
    const directory = "..\\hgofix"; // ONE component containing a backslash, not a traversal
    mkdirSync(join(root, directory));
    writeFileSync(join(root, directory, "note.txt"), "in-root\n");
    const filePath = `${directory}/note.txt`;
    const result = humanGuardOverrideInternals.eligibility(root, "Write", { file_path: filePath, content: "x" });
    assert.equal(result.eligible, true, "a legitimate in-root path was refused");
    assert.equal(result.commandClass, "exact-in-root-write",
      "an in-root path whose first component merely contains a backslash was classified as leaving the repository");
    assert.deepEqual(result.paths, [filePath], "the in-root relative path must survive classification unrewritten");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Direction 2 (crossBoundaryTarget(), fail-OPEN -- the security-relevant one): its escape
// test is the ONLY gate into the cross-repository-target eligible class, and that class
// deliberately runs neither safePath()'s in-root symlink-safety walk nor eligibility()'s
// relative-path hardBoundaryPath() refusal (hardBoundaryPath()'s `.git`/`.codex`/
// `.agent-pipeline` arms anchor on the ENTIRE string and are inert for the absolute path
// crossBoundaryTarget() checks). Before the fix, an in-root symlink named `..\x` pointing
// at this repository's own `.git` was therefore rescued INTO that class: an in-repository
// hard-boundary target authorized as if it were an out-of-root one. This extends the
// NOVA-HGOELIG-4 pin above ("an in-root symlink attack is never reclassified") to the
// backslash-bearing name it did not exercise.
test("NVA-HGOFIX-1: crossBoundaryTarget() never rescues an in-root `..\\x` symlink attack into the cross-repository-target class", { skip: POSIX_BACKSLASH_SKIP }, () => {
  const root = fixture();
  try {
    symlinkSync(join(root, ".git"), join(root, "..\\hgofix-link"), "dir");
    const filePath = "..\\hgofix-link/hooks/pre-commit";
    const result = humanGuardOverrideInternals.eligibility(root, "Write", { file_path: filePath, content: "x" });
    assert.notEqual(result.commandClass, "cross-repository-target",
      "an in-root symlink into .git was classified as a cross-repository target");
    assert.equal(result.eligible, false, "an in-root symlink attack must stay refused");
    assert.equal(result.code, "HGO-NONOVERRIDABLE-CROSS-BOUNDARY");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// NVA-HGOFIX-2 (backlog/items/2026-08-17-hgofix-1-separatornormalized-has-no-injection-
// seam-and-line-792-has-no-test.md; backlog/items/2026-08-17-guard-human-override-cli-
// and-a-second-site-still-normalize-backslashes-unconditionally.md): separatorNormalized()
// itself had no platform-injection seam (only reachable/provable on a real win32 host),
// and eligibility()'s Bash argv-token normalization was a second, unrelated unconditional
// site. The tests below close both findings: an injectable `platform` seam on
// separatorNormalized(), safePath() and crossBoundaryTarget(), a regression test pinning
// the intentional POSIX-only behavioral delta crossBoundaryTarget()'s hardBoundaryPath()
// check already shipped under NVA-HGOFIX-1, and a win32-only test for eligibility()'s
// argv-token normalization.
// ---------------------------------------------------------------------------------

test("NVA-HGOFIX-2: separatorNormalized() and safePath() gain an injectable platform seam, provable from a POSIX host", () => {
  assert.equal(humanGuardOverrideInternals.separatorNormalized("a\\b"), "a\\b",
    "the default platform (POSIX on this host) must leave a backslash-bearing value untouched");
  assert.equal(humanGuardOverrideInternals.separatorNormalized("a\\b", { platform: "win32" }), "a/b",
    "the win32 branch must be reachable via the injected platform, without a real win32 host");

  const root = fixture();
  try {
    const directory = "..\\hgofix-seam"; // one component containing a backslash, legal on POSIX
    mkdirSync(join(root, directory));
    writeFileSync(join(root, directory, "note.txt"), "in-root\n");
    const filePath = `${directory}/note.txt`;
    const posix = humanGuardOverrideInternals.safePath(root, filePath);
    assert.notEqual(posix, null, "the default (POSIX) platform must still read this as in-root");
    assert.equal(posix.relative, filePath);
    assert.equal(humanGuardOverrideInternals.safePath(root, filePath, { platform: "win32" }), null,
      "forcing platform: win32 must reach the normalization branch and read the same value as an escape");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-HGOFIX-2: crossBoundaryTarget()'s :792 hardBoundaryPath() check is intentionally unnormalized on POSIX, and its platform seam reaches the win32 branch", () => {
  const root = fixture();
  try {
    // Genuinely escapes root; the final literal component is SHAPED like a secrets path
    // but contains a backslash, which is an ordinary filename character on POSIX.
    const candidate = "../..\\secrets";
    const posixTarget = humanGuardOverrideInternals.crossBoundaryTarget(root, candidate);
    assert.equal(posixTarget, resolve(root, candidate),
      "a POSIX-legal single-component name merely SHAPED like a secrets path must not be refused -- see the :792 comment for why this is intentional");
    assert.equal(humanGuardOverrideInternals.crossBoundaryTarget(root, candidate, { platform: "win32" }), null,
      "forcing platform: win32 must reach the normalization branch and refuse the same candidate once it reads as /secrets");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-HGOFIX-2: eligibility()'s Bash argv-token normalization (:1385) is win32-only; POSIX behavior is unchanged", () => {
  const root = fixture();
  try {
    // Single-quoted so the closed-shell tokenizer preserves the literal backslash (outside
    // quotes it is the tokenizer's own escape character, exactly like real POSIX shells).
    const command = "touch 'secrets\\backup.txt'";
    const posixResult = humanGuardOverrideInternals.eligibility(root, "Bash", { command });
    assert.equal(posixResult.eligible, true,
      "a token merely CONTAINING a backslash must not be misread as a hard-boundary path on POSIX");
    const win32Result = humanGuardOverrideInternals.eligibility(root, "Bash", { command }, { platform: "win32" });
    assert.equal(win32Result.eligible, false);
    assert.equal(win32Result.code, "HGO-NONOVERRIDABLE-PATH");
    assert.deepEqual(win32Result.paths, ["secrets/backup.txt"]);
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

// ---------------------------------------------------------------------------------
// NVA-HGOHEAD-1: an unborn HEAD (a freshly `git init`-ed repository with zero commits)
// is a completely normal, expected git state -- confirmed live: before this fix,
// `git rev-parse HEAD` failing on it (real shape observed: exit 128, stderr "fatal:
// ambiguous argument 'HEAD': unknown revision or path not in the working tree.") was
// indistinguishable, inside git()'s generic handling, from a genuinely broken
// repository, and repositoryObservation() propagated it as an uncaught
// HumanGuardOverrideError (code: "HGO-GIT") instead of handling the case at all.
// ---------------------------------------------------------------------------------

function fixtureUnborn() {
  const root = mkdtempSync(join(tmpdir(), "human-guard-override-unborn-"));
  git(root, "init", "-q", "-b", "main");
  return root;
}

// git's own well-known empty-tree object id -- reproduced independently here (never
// imported), matching the module's own UNBORN_TREE_OID.
const UNBORN_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

test("NVA-HGOHEAD-1: a fresh repository with no commits (unborn HEAD) does not crash recordHumanGuardDenial()/planHumanGuardOverride()", () => {
  const root = fixtureUnborn();
  try {
    const toolInput = { file_path: "notes.md", content: "unborn\n" };
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
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
    assert.equal(plan.repository.head, null, "unborn HEAD must be a defined sentinel, never a crash");
    assert.equal(plan.repository.tree, UNBORN_TREE_OID, "unborn HEAD's tree must be git's well-known empty-tree object id");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
      nowMs: 3500, scriptPath,
    });
    assert.equal(armed.status, "armed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-HGOHEAD-1: two unborn-HEAD observations of the same otherwise-unchanged repository compare equal (no spurious HGO-DRIFT)", () => {
  const root = fixtureUnborn();
  try {
    const toolInput = { file_path: "notes.md", content: "unborn\n" };
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    // planHumanGuardOverride() independently re-derives repositoryObservation() and compares
    // it, via canonical(), against the one recordHumanGuardDenial() already persisted. If the
    // unborn observation were not deterministic this would throw HGO-DRIFT even though
    // nothing about the repository actually changed between the two calls.
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(plan.status, "planned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-HGOHEAD-1: a repository that gains its first commit between record and plan is reported as drift, never as a silent match against the unborn observation", () => {
  const root = fixtureUnborn();
  try {
    const toolInput = { file_path: "notes.md", content: "unborn\n" };
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "commit", "--allow-empty", "-q", "-m", "first commit");
    assert.throws(
      () => planHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        nowMs: 2000,
        scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
    );
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
        dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
        nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NVA-HGOHEAD-1: a rev-parse HEAD failure that is NOT the unborn-branch shape still throws HGO-GIT unchanged (the special case stays narrowly scoped)", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "committed\n" };
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    assert.throws(
      () => planHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        nowMs: 2000,
        // Only the exact `rev-parse HEAD` call fails; `symbolic-ref -q HEAD` and
        // `rev-parse --verify -q HEAD` both still run for real against a repository that
        // DOES have a commit, so isUnbornBranch() correctly answers false and this reaches
        // the original, unweakened generic failure path.
        spawn(command, args, options) {
          if (args[0] === "rev-parse" && args[1] === "HEAD" && args.length === 2) {
            return { status: null, error: Object.assign(new Error("blocked"), { code: "EPERM" }) };
          }
          return spawnSync(command, args, options);
        },
        scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
      }),
      (error) => error instanceof HumanGuardOverrideError
        && error.code === "HGO-GIT"
        && error.message.includes("operation=rev-parse-HEAD")
        && error.message.includes("outcome=EPERM"),
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
          dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
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

// ---------------------------------------------------------------------------------
// NVA-CROSSREPOLEDGER-1 (backlog/items/2026-07-20-cross-repository-override-ledger-
// binding.md): codex-pretool-guard.mjs always calls recordHumanGuardDenial() and
// consumeHumanGuardOverride() with `rootDir: projectRoot` -- the coordinating session's
// own root -- even when the guarded command's actual target (eligibility()'s
// "cross-repository-target" class, ADR-0059 Decision 6) is a DIFFERENT physical
// repository. Before this fix, the ledger (request/audit/capability storage) still
// bound to the coordinator's own root regardless; these tests pin that it now binds to
// the SAME physical repository the guarded command actually targets, while an ordinary
// in-root command, or an out-of-root target with no repository of its own
// (NOVA-HGOELIG-1..4, unaffected by this fix), keeps binding to the coordinator exactly
// as before.
// ---------------------------------------------------------------------------------

test("NVA-CROSSREPOLEDGER-1a: an ordinary in-root command still binds its ledger to the coordinator's own root, unchanged", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "ordinary\n" };
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 1000,
    });
    assert.equal(recorded.status, "planned");
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const requestPath = join(common, "agent-pipeline", "human-guard-overrides", "requests", `${recorded.requestSha256}.json`);
    assert.ok(existsSync(requestPath), "the ordinary command's request must still be stored under the coordinator's own ledger");
    // Never authorized -- this pins only WHERE the ledger lives, not the arming
    // ceremony, which the rest of the suite already covers exhaustively.
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "absent");
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

test("NVA-CROSSREPOLEDGER-1b: a cross-repository `git -C` command binds command evaluation, token consumption and ledger append to the TARGET repository, not the coordinator's", () => {
  const root = fixture(); // the coordinating session's own root
  const target = fixture(); // the guarded command's actual, distinct physical target
  try {
    const command = `git -C ${target} status`;
    const toolInput = { command };
    // recordHumanGuardDenial() is always called with the COORDINATOR's own rootDir.
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1000,
    });
    assert.equal(recorded.status, "planned");

    const targetCommon = git(target, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const coordinatorCommon = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const requestPath = join(targetCommon, "agent-pipeline", "human-guard-overrides", "requests", `${recorded.requestSha256}.json`);
    assert.ok(existsSync(requestPath), "the cross-repository request must be stored under the TARGET repository's own ledger");
    // DoD 4: no cross-repository command text or coordinates land under the
    // coordinating checkout's own ledger -- no ledger directory is ever created there.
    assert.equal(existsSync(join(coordinatorCommon, "agent-pipeline")), false,
      "no ledger directory may be created under the coordinator's own checkout for this command");
    const requestBytes = readFileSync(requestPath, "utf8");
    assert.ok(!requestBytes.includes(root), "the persisted request must never quote the coordinator's own local path");

    // The operator plans/authorizes directly against the TARGET repository's own root
    // -- exactly the same contract planHumanGuardOverride() has always had for any
    // repository; no code change was needed there for this to work.
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 2000, scriptPath,
    });
    assert.equal(plan.commandClass, "cross-repository-target");
    assert.equal(plan.root, target);
    const reason = "PO attended recovery for the exact cross-repository command, via chat";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2500, scriptPath,
    });
    const armed = authorizeHumanGuardOverride({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
      nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");

    // consumeHumanGuardOverride() is ALSO always called with the coordinator's own
    // rootDir -- the agent retries the byte-identical command through the same
    // coordinator-rooted guard hook that denied it. It must still find and consume the
    // capability that lives in the TARGET repository's own ledger.
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");

    // DoD 5: one-time semantics are unchanged for the cross-repository class -- a
    // second retry of the identical command does not consume it again.
    const second = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 4500,
    });
    assert.equal(second.status, "absent", "a consumed cross-repository capability admitted a second run");

    // The full audit trail lives entirely under the TARGET repository's own ledger.
    const audit = join(targetCommon, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    const auditEvents = readFileSync(audit, "utf8").trim().split("\n").map((line) => JSON.parse(line).event);
    assert.deepEqual(auditEvents.map(({ type }) => type), ["denied", "authorized", "consumed"]);
    assert.equal(existsSync(join(coordinatorCommon, "agent-pipeline")), false,
      "no ledger directory was ever created under the coordinator's own checkout for this command");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("NVA-CROSSREPOLEDGER-1c: a cross-repository target capability still requires explicit double-confirmed activation -- no implicit override", () => {
  const root = fixture();
  const target = fixture();
  try {
    const command = `git -C ${target} status`;
    const toolInput = { command };
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 2000, scriptPath,
    });
    const reason = "PO attended recovery, activation omitted on purpose";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2500, scriptPath,
    });
    // activate is omitted (defaults to false) -- must be refused exactly like the
    // same-repository class; the cross-repository class gets no implicit pass.
    assert.throws(
      () => authorizeHumanGuardOverride({
        rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
        selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason),
        nowMs: 3000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-ACTIVATION",
    );
    // Never armed, so a retry of the identical command still finds nothing to consume.
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 3500,
    });
    assert.equal(consumed.status, "absent");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("NVA-CROSSREPOLEDGER-1d: a cross-repository target whose ledger root cannot be written fails closed before the guarded command runs, never falling back to the coordinator's ledger", () => {
  const root = fixture();
  const target = fixture();
  try {
    const targetCommon = git(target, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const coordinatorCommon = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    // Pre-create "agent-pipeline" as a FILE (not a directory) inside the target's own
    // git-common-dir -- storage()'s mkdirSync(..., {recursive:true}) can never create a
    // directory where a file already sits, regardless of process privilege, so this
    // portably reproduces "the target ledger root cannot be written".
    writeFileSync(join(targetCommon, "agent-pipeline"), "not a directory\n");
    const command = `git -C ${target} status`;
    const toolInput = { command };
    assert.throws(() => recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1000,
    }));
    // Fail-closed, never a silent fallback: no ledger directory was ever created under
    // the coordinator's own checkout for this command.
    assert.equal(existsSync(join(coordinatorCommon, "agent-pipeline")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// NVA-CROSSREPOLEDGER-2 (Critic F1 on NVA-CROSSREPOLEDGER-1, commit 1404eb28):
// crossRepositoryTargetRoot()'s discovery probe used to substitute a symlinked
// target's OWN CONTAINING DIRECTORY (`dirname(target)`) instead of following the
// symlink to its real destination, the way a real `git -C <target>` (an OS-level
// chdir) always does. If that containing directory happened to be a valid git
// repository of its own, the function silently returned THAT wrong-but-valid root
// -- nothing failed closed, because a normal, discoverable repository was found --
// reproducing, for symlinked targets specifically, the exact misbinding class
// NVA-CROSSREPOLEDGER-1 exists to close. These two tests pin the fix: a symlinked
// target now resolves through its REAL destination, and a symlink that resolves
// nowhere is handled explicitly and safely rather than silently mis-bound.
// ---------------------------------------------------------------------------------

test("NVA-CROSSREPOLEDGER-2a: a symlinked cross-repository target resolves the ledger binding through its REAL target, not the repository containing the symlink", { skip: JUNCTION_SKIP }, () => {
  const root = fixture(); // the coordinating session's own root
  const target = fixture(); // the guarded command's actual, distinct physical target
  // A third, independently valid git repository stands in for "a directory that
  // happens to sit inside a DIFFERENT valid git repository (plausibly the
  // coordinator's own)" (Critic F1): before this fix, `dirname(<symlink path>)`
  // would land HERE, and this repository's own root would be silently (and
  // wrongly) returned -- the bug never threw, it just found the wrong answer.
  const linkHolder = fixture();
  const symlinkPath = join(linkHolder, "link-to-target");
  symlinkSync(target, symlinkPath, "junction");
  try {
    const command = `git -C ${symlinkPath} status`;
    const toolInput = { command };
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1000,
    });
    assert.equal(recorded.status, "planned");

    const targetCommon = git(target, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const linkHolderCommon = git(linkHolder, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const coordinatorCommon = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const requestPath = join(targetCommon, "agent-pipeline", "human-guard-overrides", "requests", `${recorded.requestSha256}.json`);
    assert.ok(existsSync(requestPath),
      "the symlinked cross-repository request must be stored under the REAL (pointed-at) target repository's own ledger");
    // Never the wrong-but-valid repository the symlink merely sits inside...
    assert.equal(existsSync(join(linkHolderCommon, "agent-pipeline")), false,
      "no ledger directory may be created under the repository that merely contains the symlink");
    // ...nor the coordinator's.
    assert.equal(existsSync(join(coordinatorCommon, "agent-pipeline")), false,
      "no ledger directory may be created under the coordinator's own checkout for this command");

    // The full round-trip binds correctly too: plan/authorize against the REAL
    // target, then the coordinator-rooted retry still finds and consumes it there.
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 2000, scriptPath,
    });
    assert.equal(plan.commandClass, "cross-repository-target");
    assert.equal(plan.root, target);
    const reason = "PO attended recovery for the exact symlinked cross-repository command, via chat";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2500, scriptPath,
    });
    const armed = authorizeHumanGuardOverride({
      rootDir: target, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
      nowMs: 3000, scriptPath,
    });
    assert.equal(armed.status, "armed");
    const consumed = consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
    rmSync(linkHolder, { recursive: true, force: true });
  }
});

test("NVA-CROSSREPOLEDGER-2b: a symlinked cross-repository target pointing at a nonexistent path is handled safely, never binding to the repository containing the symlink", { skip: JUNCTION_SKIP }, () => {
  const root = fixture();
  const linkHolder = fixture(); // sits inside a valid, discoverable repository of its own
  const symlinkPath = join(linkHolder, "link-to-nowhere");
  symlinkSync(join(linkHolder, "does-not-exist"), symlinkPath, "junction");
  try {
    const command = `git -C ${symlinkPath} status`;
    const toolInput = { command };
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1000,
    });
    assert.equal(recorded.status, "planned");
    // No repository resolves for the dangling symlink, so this falls through to the
    // existing, unchanged coordinator-rooted behavior -- exactly as an ordinary
    // out-of-root, non-repository target already does (NOVA-HGOELIG-1..4).
    const coordinatorCommon = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const requestPath = join(coordinatorCommon, "agent-pipeline", "human-guard-overrides", "requests", `${recorded.requestSha256}.json`);
    assert.ok(existsSync(requestPath), "a dangling symlink target must fall through to the coordinator's own ledger");
    const linkHolderCommon = git(linkHolder, "rev-parse", "--path-format=absolute", "--git-common-dir");
    assert.equal(existsSync(join(linkHolderCommon, "agent-pipeline")), false,
      "no ledger directory may be created under the repository that merely contains the dangling symlink");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(linkHolder, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// NVA-CROSSREPOGUIDANCE-1 (backlog/items/2026-08-18-codex-pretool-guard-cross-repository-
// recovery-guidance-points-at-the-wrong-repo.md): after NVA-CROSSREPOLEDGER-1 rebound the
// ledger to the cross-repository TARGET, recordHumanGuardDenial()'s return payload still
// carried only `requestSha256`. Every guard hook that prints override-ceremony guidance
// therefore had no correct root to name and fell back to its own `projectRoot` -- which for
// this class is a repository where the request does not exist. These tests pin the returned
// `root` as the root the ceremony must actually be run against: not merely equal to some
// expected string, but the ONLY root planHumanGuardOverride() accepts for that request.
// ---------------------------------------------------------------------------------

test("NVA-CROSSREPOGUIDANCE-1a: an ordinary in-root denial returns the coordinator's own root, and the ceremony runs against exactly that root", () => {
  const root = fixture();
  try {
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const recorded = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { file_path: "notes.md", content: "ordinary\n" },
      denials: denial,
      nowMs: 1000,
    });
    assert.equal(recorded.status, "planned");
    const plan = planHumanGuardOverride({
      rootDir: recorded.root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 2000, scriptPath,
    });
    assert.equal(plan.root, recorded.root,
      "the returned root must be the one the ceremony resolves the request under");
    assert.equal(recorded.root, git(root, "rev-parse", "--path-format=absolute", "--show-toplevel"),
      "an ordinary in-root denial must still name the coordinator's own root, unchanged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------
// AGY-MKTATTEST-1 (Direction 3, PO-approved 2026-08-25; backlog: 2026-08-24-verify-
// marketplace-attestation-blocks-normal-active-development.md): the underlying
// security property F1's downgraded WARN above no longer enforces at Verify time --
// "an agent cannot falsely claim the external marketplace matches the checkout" --
// is now a hard, blocking check in guard-push.mjs's checkMarketplaceAttestation().
// These two tests spawn the REAL guard-push.mjs as its own subprocess (the same
// technique guard-push.test.mjs's own runGuard() uses -- that file is TP-5
// protected, so its live coverage for this new check lives here instead, in the
// suite this new function's dependency, human-guard-override.mjs, is already
// covered by and Verify already runs) and drive the marketplace comparison through
// a fake `codex` executable placed on the subprocess's PATH -- guard-push.mjs's
// default call path spawns the REAL `codex` binary by name, unlike the in-process
// externalLocalMarketplaceObservation() calls elsewhere in this file, which can
// inject a registryReader function directly.
// ---------------------------------------------------------------------------------

const GUARD_PUSH_PATH = join(PLUGIN_ROOT, "hooks", "guard-push.mjs");
const MKTATTEST_PUSH_CMD = "git push origin main:refs/heads/feature-test";

/** Writes a fake `codex` executable answering `plugin marketplace list --json` with `marketplaces`, on its own PATH-prependable directory. */
function fakeCodexBinDir(marketplaces) {
  const dir = mkdtempSync(join(tmpdir(), "mktattest-codex-"));
  const scriptPath = join(dir, "codex");
  const payload = JSON.stringify({ marketplaces }).replace(/'/g, "'\\''");
  writeFileSync(scriptPath, `#!/bin/sh\nprintf '%s' '${payload}'\n`);
  chmodSync(scriptPath, 0o755);
  return dir;
}

/** Spawns guard-push.mjs exactly the way guard-push.test.mjs's own runGuard() does. */
function runGuardPush(command, dir, env = {}) {
  const result = spawnSync(process.execPath, [GUARD_PUSH_PATH], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: dir },
    timeout: 15000,
  });
  return { code: result.status, stderr: result.stderr ?? "" };
}

/**
 * An otherwise fully green (verify evidence fresh, standing-approved, no security
 * gate, no publicPushIdentity, no release section) Pipeline-source-shaped push
 * fixture -- combines pipelineCheckout()'s marketplace/plugin-source shape (already
 * used by the NVA-BL-20/NVA-MKTHASH-1 tests above) with a real git repo and the
 * exact manifest/evidence shape guard-push.test.mjs's own PG10 ("standing-approved
 * passes without any state file") fixture uses, so the ONLY thing this fixture can
 * fail on is the new marketplace-attestation check.
 */
function pipelineSourcePushRepo(base, name) {
  const { root, sourceRoot } = pipelineCheckout(base, name);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "pipeline.yaml"),
    "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n",
  );
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  const head = git(root, "rev-parse", "HEAD");
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, "evidence", "verify-latest.json"), JSON.stringify({ exitCode: 0, commit: head }));
  return { root, sourceRoot, head };
}

test("AGY-MKTATTEST-1: guard-push BLOCKS a push from a Pipeline-source checkout whose external local-marketplace copy has drifted", () => {
  const base = externalFixture();
  try {
    const { root, sourceRoot } = pipelineSourcePushRepo(base, "checkout");
    const external = externalMarketplace(base, "external");
    cpSync(sourceRoot, join(external, "plugins", "pipeline-core"), { recursive: true });
    // One extra file is enough to diverge the tree hash -- the same shape
    // NVA-MKTHASH-1's own divergence test above uses.
    writeFileSync(join(external, "plugins", "pipeline-core", "smuggled.txt"), "not part of this checkout\n");
    const bin = fakeCodexBinDir([
      { name: "agent-pipeline-local", root: external, marketplaceSource: { sourceType: "local", source: external } },
    ]);
    try {
      const { code, stderr } = runGuardPush(MKTATTEST_PUSH_CMD, root, {
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      });
      assert.equal(code, 2, stderr);
      assert.match(stderr, /Marketplace attestation \(AGY-MKTATTEST-1\)/);
      assert.match(stderr, /does not match this checkout/);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("AGY-MKTATTEST-1: guard-push does NOT block an otherwise-green push from a Pipeline-source checkout whose external local-marketplace copy genuinely matches", () => {
  const base = externalFixture();
  try {
    const { root, sourceRoot } = pipelineSourcePushRepo(base, "checkout");
    const external = externalMarketplace(base, "external");
    cpSync(sourceRoot, join(external, "plugins", "pipeline-core"), { recursive: true });
    const bin = fakeCodexBinDir([
      { name: "agent-pipeline-local", root: external, marketplaceSource: { sourceType: "local", source: external } },
    ]);
    try {
      const { code, stderr } = runGuardPush(MKTATTEST_PUSH_CMD, root, {
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      });
      assert.equal(code, 0, stderr);
      assert.equal(stderr.trim(), "");
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("NVA-CROSSREPOGUIDANCE-1b: a cross-repository denial returns the TARGET root, which is the only root its ceremony can be run against", () => {
  const root = fixture(); // the coordinating session's own root
  const target = fixture(); // the guarded command's actual, distinct physical target
  try {
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const toolInput = { command: `git -C ${target} status` };
    // recordHumanGuardDenial() is always called with the COORDINATOR's own rootDir --
    // exactly how every guard hook calls it.
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1000,
    });
    assert.equal(recorded.status, "planned");
    assert.equal(recorded.root, git(target, "rev-parse", "--path-format=absolute", "--show-toplevel"),
      "a cross-repository denial must name the target repository, not the coordinator");
    assert.notEqual(recorded.root, root, "naming the coordinator here is exactly the defect under test");

    // The decisive part: the returned root is not a label, it is the only root under which
    // this request resolves. Guidance naming the coordinator cannot clear the gate at all.
    const plan = planHumanGuardOverride({
      rootDir: recorded.root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 2000, scriptPath,
    });
    assert.equal(plan.commandClass, "cross-repository-target");
    assert.equal(plan.root, recorded.root);
    assert.throws(
      () => planHumanGuardOverride({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, nowMs: 2000, scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError,
      "the coordinator root must not resolve a cross-repository request -- that is why the printed --repo has to be the target",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
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

// NVA-CF-HGOCANDIDATEDRIFT: concurrentWorktreeAdvisory() is a best-effort, advisory-only
// signal for scripts/guard-human-override.mjs's `plan` command (see the code comment at
// its own definition and the HGO-CANDIDATE-DRIFT fail() site above) -- never part of the
// request/plan/capability trust chain, so it is unit-tested directly here rather than only
// indirectly through the CLI's stderr output.
test("concurrentWorktreeAdvisory() reports zero other worktrees for an ordinary single-checkout repository", () => {
  const root = fixture();
  try {
    const advisory = concurrentWorktreeAdvisory(root);
    assert.equal(advisory.checked, true);
    assert.equal(advisory.otherWorktrees, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrentWorktreeAdvisory() counts an additional git worktree", () => {
  const root = fixture();
  const worktreeDir = join(tmpdir(), `human-guard-override-wt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    git(root, "worktree", "add", "-b", "hgo-advisory-wt", worktreeDir, "HEAD");
    const advisory = concurrentWorktreeAdvisory(root);
    assert.equal(advisory.checked, true);
    assert.equal(advisory.otherWorktrees, 1);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", worktreeDir], { cwd: root, encoding: "utf8", shell: false });
    rmSync(root, { recursive: true, force: true });
    rmSync(worktreeDir, { recursive: true, force: true });
  }
});

test("concurrentWorktreeAdvisory() never throws: a failing spawn reports checked:false rather than propagating", () => {
  const root = fixture();
  try {
    const advisory = concurrentWorktreeAdvisory(root, () => { throw new Error("spawn boundary broken"); });
    assert.deepEqual(advisory, { checked: false, otherWorktrees: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
