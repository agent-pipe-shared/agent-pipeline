#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.hgo-patch-preflight-before-signature (AC-201).
// Acceptance: a malformed hunk is rejected before human signing; a corrected patch signs
// once and applies against the same frozen preimage; a changed preimage requires a fresh
// signature; a failed attempt claims no edit or success.
// Real module, real git, real DACL/authority probes (nothing is stubbed). Fixtures live under
// the repository's scratch/ with their own `git init` and GIT_CEILING_DIRECTORIES so no git
// call can reach the project repository. On win32 one record+prepare flow costs about 78 fixed
// PowerShell DACL probes (about 1.4 s each), so each fixture is built once (lazily) and shared by
// every case that does not mutate it; the per-test timeout reflects that real cost.

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";

import {
  authorizeHumanGuardOverrideBySignature,
  consumeHumanGuardOverride,
  HGO_SIGNATURE_REASON,
  HumanGuardOverrideError,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  prepareHumanGuardOverrideForSignature,
  recordHumanGuardDenial,
} from "../human-guard-override.mjs";
import * as hgo from "../human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../po-approval-proof.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, "..", "..");
const PROJECT_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SCRIPT = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const APPROVAL_SCRIPT = join(PLUGIN_ROOT, "scripts", "po-human-approval.mjs");
const FIXTURE_AUTHOR = "HgoPinIsolatedAuthor";
const denial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }];
const TEST_TIMEOUT_MS = 600_000;
const PREFLIGHT_PENDING = "needs protected patch P21-07C";

const pair = generateKeyPairSync("ed25519");
const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
const sha = (value) => createHash("sha256").update(value).digest("hex");
const PLAN_SENTINEL = sha("pipeline.human-guard-override-signature-plan.v1");
const SPEC_SENTINEL = sha("pipeline.human-guard-override-signature-spec.v1");

const CLEAN_PREIMAGE = "alpha\n\nbeta\n";
// Old context omits the blank line between alpha and beta: exactly the 2026-09-27 failure.
const MALFORMED_PATCH = "*** Begin Patch\n*** Update File: notes.md\n@@\n alpha\n-beta\n+gamma\n*** End Patch";
const CORRECTED_PATCH = "*** Begin Patch\n*** Update File: notes.md\n@@\n alpha\n \n-beta\n+gamma\n*** End Patch";

function projectLog() {
  const r = spawnSync("git", ["log", "-3", "--format=%h%x20%an%x20%s"], { cwd: PROJECT_ROOT, encoding: "utf8", shell: false });
  return String(r.stdout);
}

// Containment: GIT_CEILING_DIRECTORIES is the parent of every fixture root for the whole file.
const SCRATCH = join(PROJECT_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const priorCeiling = process.env.GIT_CEILING_DIRECTORIES;
process.env.GIT_CEILING_DIRECTORIES = SCRATCH;
const logBefore = projectLog();
const roots = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  if (priorCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
  else process.env.GIT_CEILING_DIRECTORIES = priorCeiling;
  const logAfter = projectLog();
  // The operator may commit meanwhile (expected); a fixture-authored commit is the leak.
  assert.equal(logAfter.includes(FIXTURE_AUTHOR), false, `fixture-authored commit reached the project repository: ${logAfter}`);
  assert.equal(logBefore.includes(FIXTURE_AUTHOR), false);
});

function makeFixture() {
  const root = mkdtempSync(join(SCRATCH, "hgo-patch-preflight-pin-"));
  roots.push(root);
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, env: process.env });
    assert.equal(r.status, 0, r.stderr);
    return String(r.stdout).trim();
  };
  git("init", "-q", "-b", "main"); // own root before the first git write
  git("config", "user.name", FIXTURE_AUTHOR);
  git("config", "user.email", "pin@example.invalid");
  writeFileSync(join(root, "notes.md"), CLEAN_PREIMAGE);
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: "hgo-pin-key", publicKeySha256: sha(publicKeyPem) },
  }));
  git("add", "notes.md", "pipeline.user.yaml", "project/critical-human-proof.json");
  git("commit", "-q", "-m", "pin fixture preimage");
  return { root, git };
}

function capabilityFiles(root) {
  const dir = join(root, ".git", "agent-pipeline", "human-guard-overrides");
  if (!existsSync(dir)) return [];
  // Files only: the (empty) `capabilities` directory itself always exists and is not a capability.
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /capabilit/iu.test(join(entry.parentPath ?? entry.path ?? "", entry.name)))
    .map((entry) => entry.name);
}

function record(root, command) {
  const request = recordHumanGuardDenial({
    rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "apply_patch", toolInput: { command }, denials: denial, nowMs: 1000,
  });
  assert.equal(request.status, "planned", JSON.stringify(request));
  return request;
}

function prepare(root, request) {
  return prepareHumanGuardOverrideForSignature({
    rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2000,
    scriptPath: SCRIPT, humanApprovalScriptPath: APPROVAL_SCRIPT,
  });
}

function signedProof(root, request, nowMs) {
  const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: SCRIPT };
  const plan = planHumanGuardOverride({ ...shared, requestSha256: request.requestSha256, nowMs: nowMs + 500 });
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: request.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, nowMs: nowMs + 1000,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override", featureId: "human-guard-override", planSha256: PLAN_SENTINEL, specSha256: SPEC_SENTINEL,
    candidate: { commit: plan.repository.head, tree: plan.repository.tree },
    policyRevision: "human-guard-override-signature-v1", subjectSha256: prepared.selectionSha256, decision: "authorize",
  });
  return {
    plan,
    proof: {
      schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "hgo-pin-key", publicKey: publicKeyPem,
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
    },
  };
}

const memo = new Map();
function shared(key, build) {
  if (!memo.has(key)) memo.set(key, build());
  return memo.get(key);
}

// Fixture A: malformed patch, recorded once, prepare-for-signature attempted once.
// Not mutated afterwards; points 1 and 4 read it.
function malformedFixture() {
  return shared("malformed", () => {
    const fx = makeFixture();
    const request = record(fx.root, MALFORMED_PATCH);
    let outcome;
    try { outcome = { result: prepare(fx.root, request) }; } catch (error) { outcome = { error }; }
    return { ...fx, request, outcome };
  });
}

test(`AC-201 point 1 (${PREFLIGHT_PENDING}): a malformed hunk is rejected before a human signature is requested`, { timeout: TEST_TIMEOUT_MS }, () => {
  const { root, outcome } = malformedFixture();
  // The old context cannot apply to the frozen preimage (blank line missing).
  assert.equal(readFileSync(join(root, "notes.md"), "utf8"), CLEAN_PREIMAGE);
  assert.ok(
    outcome.error instanceof HumanGuardOverrideError,
    "prepare-for-signature must refuse a patch that does not apply, before emitting a signable intent",
  );
});

test("AC-201 point 4: a failed attempt arms no capability and claims no edit", { timeout: TEST_TIMEOUT_MS }, () => {
  const { root } = malformedFixture();
  assert.equal(readFileSync(join(root, "notes.md"), "utf8"), CLEAN_PREIMAGE);
  assert.deepEqual(capabilityFiles(root), []);
  const consumed = consumeHumanGuardOverride({
    rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "apply_patch", toolInput: { command: MALFORMED_PATCH }, denials: denial, nowMs: 3000,
  });
  assert.notEqual(consumed.status, "consumed");
});

test("AC-201 point 2: a corrected patch prepares, signs once and is redeemed once against the same frozen preimage", { timeout: TEST_TIMEOUT_MS }, () => {
  const { root, git } = makeFixture();
  const request = record(root, CORRECTED_PATCH);
  const headBefore = git("rev-parse", "HEAD");
  const signing = prepare(root, request);
  assert.equal(signing.status, "prepared");
  const { plan, proof } = signedProof(root, request, 2000);
  assert.equal(plan.planSha256, signing.planSha256, "the signed plan is the one prepared for signature");
  const armed = authorizeHumanGuardOverrideBySignature({
    rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath: SCRIPT,
  });
  assert.equal(armed.status, "armed");
  const redeem = (ms, command) => consumeHumanGuardOverride({
    rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "apply_patch", toolInput: { command }, denials: denial, nowMs: ms,
  });
  // Revised bytes never ride on the signature.
  assert.notEqual(redeem(3500, CORRECTED_PATCH.replace("+gamma", "+delta")).status, "consumed");
  assert.equal(redeem(4000, CORRECTED_PATCH).status, "consumed");
  assert.notEqual(redeem(4500, CORRECTED_PATCH).status, "consumed", "one signature redeems exactly once");
  assert.equal(git("rev-parse", "HEAD"), headBefore, "redemption is against the same frozen preimage");
});

test("AC-201 point 3: a changed preimage requires a fresh review and signature", { timeout: TEST_TIMEOUT_MS }, () => {
  const { root, git } = makeFixture();
  const request = record(root, CORRECTED_PATCH);
  prepare(root, request);
  const { plan, proof } = signedProof(root, request, 2000);
  writeFileSync(join(root, "notes.md"), "alpha\n\nbeta\nomega\n");
  git("add", "notes.md");
  git("commit", "-q", "-m", "pin fixture preimage drift");
  assert.throws(
    () => authorizeHumanGuardOverrideBySignature({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256, proof, nowMs: 3000, scriptPath: SCRIPT,
    }),
    (error) => error instanceof HumanGuardOverrideError && /^HGO-/u.test(error.code),
  );
  assert.deepEqual(capabilityFiles(root), []);
});

// ---------------------------------------------------------------------------------------------
// Cases for the stored-patch preflight (AC-201 / AC-264 point 1). These carry the RED title tag
// "[needs protected patch P21-07D]" until the signature-bound patch is applied to the module.
// The module lacks the new export on HEAD, so it is reached only through a namespace import: a
// named import would break module load and turn the cases above red.
// ---------------------------------------------------------------------------------------------
const P07D_PENDING = "[needs protected patch P21-07D]";
const hgoDir = (root) => join(root, ".git", "agent-pipeline", "human-guard-overrides");
const canonicalJson = (value) => (Array.isArray(value)
  ? `[${value.map(canonicalJson).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
    : JSON.stringify(value));
const requestsDirIsClean = (root) => readdirSync(join(hgoDir(root), "requests")).every((name) => /^[a-f0-9]{64}\.json$/u.test(name));
const wrapPatch = (body) => `*** Begin Patch\n${body}\n*** End Patch`;

// Fails loudly (never skips) while the module lacks the export.
function converter() {
  assert.equal(
    typeof hgo.convertPatchEnvelopeToUnifiedDiff,
    "function",
    "export missing: human-guard-override.mjs does not export convertPatchEnvelopeToUnifiedDiff (protected patch P21-07D not applied)",
  );
  return hgo.convertPatchEnvelopeToUnifiedDiff;
}

function correctedFixture() {
  return shared("corrected", () => {
    const fx = makeFixture();
    const request = record(fx.root, CORRECTED_PATCH);
    return { ...fx, request, signing: prepare(fx.root, request) };
  });
}

test(`${P07D_PENDING} AC-201 point 1 stored patch: the denial persists the exact patch privately, bound to toolInputSha256`, { timeout: TEST_TIMEOUT_MS }, () => {
  const { root, request } = malformedFixture();
  const stored = JSON.parse(readFileSync(join(hgoDir(root), "requests", `${request.requestSha256}.json`), "utf8"));
  assert.equal(stored.schema, "pipeline.human-guard-override-request.v5");
  assert.equal(stored.patchInput.command, MALFORMED_PATCH);
  assert.equal(sha(canonicalJson(stored.patchInput)), stored.toolInputSha256);
  assert.equal(sha(canonicalJson(stored)), request.requestSha256);
});

test(`${P07D_PENDING} AC-201 point 1 refusal: the refusal is typed, constant text and leaves no scratch file`, { timeout: TEST_TIMEOUT_MS }, () => {
  const { root, outcome } = malformedFixture();
  assert.ok(outcome.error instanceof HumanGuardOverrideError, "prepare-for-signature must refuse the malformed patch");
  assert.equal(outcome.error.code, "HGO-PATCH-PREFLIGHT");
  assert.equal(outcome.error.message, "patch does not apply to the frozen preimage");
  for (const leak of ["notes.md", "alpha", "beta", "gamma"]) assert.equal(outcome.error.message.includes(leak), false);
  assert.ok(requestsDirIsClean(root), "the private preflight scratch file is removed on the refusal path");
});

test(`${P07D_PENDING} AC-201 point 1 legacy request: a request without stored patch text is refused with a typed code`, { timeout: TEST_TIMEOUT_MS }, () => {
  const { root } = makeFixture();
  const fresh = record(root, CORRECTED_PATCH);
  const requestsDir = join(hgoDir(root), "requests");
  const legacy = JSON.parse(readFileSync(join(requestsDir, `${fresh.requestSha256}.json`), "utf8"));
  delete legacy.patchInput;
  legacy.schema = "pipeline.human-guard-override-request.v4";
  const legacySha = sha(canonicalJson(legacy));
  writeFileSync(join(requestsDir, `${legacySha}.json`), `${JSON.stringify(legacy)}\n`, { flag: "wx", mode: 0o600 });
  assert.throws(
    () => prepare(root, { requestSha256: legacySha }),
    (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-PATCH-LEGACY",
  );
  assert.deepEqual(capabilityFiles(root), []);
  assert.equal(readFileSync(join(root, "notes.md"), "utf8"), CLEAN_PREIMAGE);
});

test(`${P07D_PENDING} AC-201 point 2 preflight: a patch that applies prepares for signature and leaves no scratch file`, { timeout: TEST_TIMEOUT_MS }, () => {
  const { root, signing } = correctedFixture();
  assert.equal(signing.status, "prepared");
  assert.ok(requestsDirIsClean(root), "the private preflight scratch file is removed on the success path");
  assert.equal(readFileSync(join(root, "notes.md"), "utf8"), CLEAN_PREIMAGE, "preparing for signature edits nothing");
});

const fixtureTarget = (files) => (rawPath) => ({ path: rawPath, text: Object.hasOwn(files, rawPath) ? files[rawPath] : null });

test(`${P07D_PENDING} AC-201 converter: anything outside the closed grammar is refused with a typed code and constant text`, () => {
  const convert = converter();
  const files = { "notes.md": CLEAN_PREIMAGE, "crlf.txt": "a\r\nb\r\n" };
  const refuse = (command, code, resolver = fixtureTarget(files)) => {
    let caught = null;
    try { convert(command, resolver); } catch (error) { caught = error; }
    assert.ok(caught instanceof HumanGuardOverrideError, String(command));
    assert.equal(caught.code, code, String(command));
    for (const leak of ["notes.md", "crlf", "alpha", "zzz"]) assert.equal(caught.message.includes(leak), false, "refusal text never carries a path or patch content");
  };
  refuse(MALFORMED_PATCH, "HGO-PATCH-PREFLIGHT");
  refuse(wrapPatch("*** Update File: notes.md\n@@ nowhere\n-alpha\n+zzz"), "HGO-PATCH-PREFLIGHT");
  refuse(wrapPatch("*** Add File: notes.md\n+zzz"), "HGO-PATCH-PREFLIGHT");
  refuse(wrapPatch("*** Update File: absent.md\n@@\n-alpha\n+zzz"), "HGO-PATCH-PREFLIGHT");
  refuse(wrapPatch("*** Delete File: absent.md"), "HGO-PATCH-PREFLIGHT");
  refuse(wrapPatch("*** Update File: notes.md\n*** Move to: other.md\n@@\n-alpha\n+zzz"), "HGO-PATCH-UNSUPPORTED");
  refuse(wrapPatch("*** Update File: notes.md\n@@\n alpha\n?zzz"), "HGO-PATCH-UNSUPPORTED");
  refuse("*** Begin Patch\n*** Update File: notes.md\n@@\n-alpha\n+zzz", "HGO-PATCH-UNSUPPORTED");
  refuse(wrapPatch("*** Update File: notes.md\n@@\n-alpha\n+zzz\n*** Update File: notes.md\n@@\n-beta\n+zzz"), "HGO-PATCH-UNSUPPORTED");
  refuse(wrapPatch("*** Update File: notes.md\n@@"), "HGO-PATCH-UNSUPPORTED");
  refuse(wrapPatch("*** Update File: crlf.txt\n@@\n-a\n+zzz"), "HGO-PATCH-UNSUPPORTED");
  refuse(wrapPatch("*** Add File: ../escape.md\n+zzz"), "HGO-PATCH-UNSUPPORTED", (rawPath) => ({ path: rawPath, text: null }));
  refuse("not a patch", "HGO-PATCH-UNSUPPORTED");
  refuse(undefined, "HGO-PATCH-UNSUPPORTED");
});

function applyViaGit(files, command) {
  const root = mkdtempSync(join(SCRATCH, "hgo-patch-converter-"));
  roots.push(root);
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, env: process.env });
  assert.equal(git("init", "-q", "-b", "main").status, 0); // own root before any other git call
  assert.equal(git("config", "core.autocrlf", "false").status, 0); // byte-exact result files whatever the machine's global eol setting
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  const diff = converter()(command, fixtureTarget(files));
  const patchFile = join(root, ".git", "converter.patch");
  writeFileSync(patchFile, diff);
  return { root, result: git("apply", "--unidiff-zero", "--whitespace=nowarn", "--", patchFile) };
}

test(`${P07D_PENDING} AC-201 converter: converted diffs apply with real git and produce the exact expected files`, () => {
  converter();
  const cases = [
    {
      name: "two hunks with a header locator",
      files: { "src.txt": "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n" },
      patch: wrapPatch("*** Update File: src.txt\n@@\n l1\n-l2\n+L2\n l3\n@@ l5\n l6\n-l7\n+L7\n+L7b\n l8"),
      expect: { "src.txt": "l1\nL2\nl3\nl4\nl5\nl6\nL7\nL7b\nl8\n" },
    },
    {
      name: "add, delete and update together",
      files: { "gone.txt": "bye\n", "keep.txt": "one\ntwo\n" },
      patch: wrapPatch("*** Add File: new/dir.txt\n+hello\n+world\n*** Delete File: gone.txt\n*** Update File: keep.txt\n@@\n one\n-two\n+TWO"),
      expect: { "new/dir.txt": "hello\nworld\n", "keep.txt": "one\nTWO\n" },
      absent: ["gone.txt"],
    },
    {
      name: "pure insertion appends at end of file",
      files: { "f.txt": "a\nb\n" },
      patch: wrapPatch("*** Update File: f.txt\n@@\n+c\n+d"),
      expect: { "f.txt": "a\nb\nc\nd\n" },
    },
    {
      name: "pure insertion after an unterminated last line",
      files: { "f.txt": "a\nb" },
      patch: wrapPatch("*** Update File: f.txt\n@@\n+c"),
      expect: { "f.txt": "a\nb\nc\n" },
    },
    {
      name: "edit of an unterminated last line",
      files: { "f.txt": "x\ny" },
      patch: wrapPatch("*** Update File: f.txt\n@@\n x\n-y\n+z"),
      expect: { "f.txt": "x\nz\n" },
    },
    {
      name: "context that differs only in trailing whitespace",
      files: { "f.txt": "alpha  \nbeta\n" },
      patch: wrapPatch("*** Update File: f.txt\n@@\n alpha\n-beta\n+gamma"),
      expect: { "f.txt": "alpha  \ngamma\n" },
    },
    {
      name: "the end-of-file marker selects the last occurrence",
      files: { "f.txt": "a\nb\na\nb\n" },
      patch: wrapPatch("*** Update File: f.txt\n@@\n a\n-b\n+B\n*** End of File"),
      expect: { "f.txt": "a\nb\na\nB\n" },
    },
    {
      name: "delete of an unterminated file",
      files: { "f.txt": "q" },
      patch: wrapPatch("*** Delete File: f.txt"),
      expect: {},
      absent: ["f.txt"],
    },
  ];
  for (const item of cases) {
    const { root, result } = applyViaGit(item.files, item.patch);
    assert.equal(result.status, 0, `${item.name}: ${result.stderr}`);
    for (const [name, text] of Object.entries(item.expect)) assert.equal(readFileSync(join(root, name), "utf8"), text, item.name);
    for (const name of item.absent ?? []) assert.equal(existsSync(join(root, name)), false, item.name);
  }
});
