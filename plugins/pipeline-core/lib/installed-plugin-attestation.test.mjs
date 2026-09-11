// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { cpSync, chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { validateInstalledProtectedFiles, verifyInstalledPluginAttestation } from "./installed-plugin-attestation.mjs";
import { createProvenanceAttestationPayload } from "./provenance-envelope.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const receiptId = (receipt) => hash(canonical(receipt));

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "installed-plugin-attestation-"));
  const sourceRoot = join(base, "source");
  const sourcePluginRoot = join(sourceRoot, "plugins", "pipeline-core");
  const manifest = `${JSON.stringify({
    name: "pipeline-core", version: "1.2.3-test.1", description: "fixture",
    hooks: "./hooks/codex-hooks.json", author: { name: "fixture" }, license: "SUL-1.0",
    interface: { displayName: "Fixture" },
  }, null, 2)}\n`;
  mkdirSync(join(sourcePluginRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(join(sourcePluginRoot, "hooks"));
  writeFileSync(join(sourcePluginRoot, ".codex-plugin", "plugin.json"), manifest);
  writeFileSync(join(sourcePluginRoot, "hooks", "codex-hooks.json"), "{}\n");
  writeFileSync(join(sourcePluginRoot, "entry.mjs"), "export const ready = true;\n");
  git(sourceRoot, ["init", "--initial-branch=feature/fixture"]);
  git(sourceRoot, ["remote", "add", "origin", "https://example.test/owner/plugin.git"]);
  git(sourceRoot, ["add", "."]);
  git(sourceRoot, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  const installedPluginRoot = join(base, "installed", "pipeline-core", "1.2.3-test.1");
  mkdirSync(dirname(installedPluginRoot), { recursive: true });
  cpSync(sourcePluginRoot, installedPluginRoot, { recursive: true });
  return {
    base, sourceRoot, sourcePluginRoot, installedPluginRoot,
    input(source = { class: "local-development", sourcePluginRoot }) {
      return { provider: "codex", plugin: { name: "pipeline-core", version: "1.2.3-test.1" }, installedPluginRoot, source, protectedPaths: ["entry.mjs", "hooks/codex-hooks.json"] };
    },
    cleanup() { rmSync(base, { recursive: true, force: true }); },
  };
}

function externalIdentity(path, bytes, uid) {
  return {
    physicalPath: path, physicalPathSha256: hash(path), dev: 1, ino: 2, mode: 0o100600,
    uid, gid: Number(lstatSync(path).gid), nlink: 1, size: bytes.length,
    mtimeNs: "1", ctimeNs: "1", contentSha256: hash(bytes),
  };
}

function localAuthority(repo, mutate = (value) => value) {
  return (request) => {
    const source = {
      class: "local-development", repository: "https://example.test/owner/plugin.git", branch: "feature/fixture",
      commit: git(repo.sourceRoot, ["rev-parse", "HEAD"]), tree: git(repo.sourceRoot, ["rev-parse", "HEAD^{tree}"]),
    };
    let unsigned = {
      schema: "pipeline.installed-plugin-attestation.v1", provider: request.provider, plugin: request.plugin,
      installed: { physicalRootPathSha256: request.physicalRootPathSha256, physicalRootIdentitySha256: request.physicalRootIdentitySha256, contentSha256: request.installedContentSha256 },
      source, protected: { graphSha256: request.protectedGraphSha256, files: [
        { path: "entry.mjs", sha256: hash("export const ready = true;\n") },
        { path: "hooks/codex-hooks.json", sha256: hash("{}\n") },
      ] },
    };
    unsigned = mutate(unsigned, request);
    const receipt = { ...unsigned, receiptId: receiptId(unsigned) };
    const bytes = Buffer.from(JSON.stringify(receipt));
    const path = join(repo.base, "installer-authority", "receipt.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { mode: 0o600 });
    return { receiptBytes: bytes, receiptIdentity: externalIdentity(path, bytes, Number(lstatSync(repo.installedPluginRoot).uid)), releaseAttestation: null };
  };
}

test("verifies an external local-development receipt against one clean source copy and complete stable tree", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  let authorityRequest;
  const result = verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt(request) { authorityRequest = request; return localAuthority(repo)(request); } });
  assert.equal(result.status, "verified", JSON.stringify(result));
  assert.equal(authorityRequest.provider, "codex");
  assert.equal(authorityRequest.sourceClass, "local-development");
  assert.match(authorityRequest.installedContentSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(Object.keys(result).sort(), ["externalReceiptIdentitySha256", "receiptId", "request", "schema", "status"]);
});

test("rejects replay across provider, version, physical root, source provenance, and protected graph", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const mutations = [
    (r) => ({ ...r, provider: "other" }),
    (r) => ({ ...r, plugin: { ...r.plugin, version: "9.9.9" } }),
    (r) => ({ ...r, installed: { ...r.installed, physicalRootPathSha256: "0".repeat(64) } }),
    (r) => ({ ...r, source: { ...r.source, commit: "a".repeat(40) } }),
    (r) => ({ ...r, protected: { ...r.protected, graphSha256: "0".repeat(64) } }),
  ];
  for (const mutate of mutations) {
    const result = verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt: localAuthority(repo, mutate) });
    assert.equal(result.status, "rejected", JSON.stringify(result));
  }
});

test("rejects package-local authority, permissive modes, dirty source, symlink and hardlink structures", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const local = localAuthority(repo);
  const packageLocal = verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt(request) {
    const authority = local(request); authority.receiptIdentity.physicalPath = join(repo.installedPluginRoot, "receipt.json"); authority.receiptIdentity.physicalPathSha256 = hash(authority.receiptIdentity.physicalPath); return authority;
  } });
  assert.equal(packageLocal.reasonCodes[0], "IPA-RECEIPT-LOCAL");
  const permissiveReceipt = verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt(request) {
    const authority = local(request); authority.receiptIdentity.mode = 0o100666; return authority;
  } });
  assert.equal(permissiveReceipt.reasonCodes[0], "IPA-RECEIPT-PERMISSIONS");
  chmodSync(join(repo.installedPluginRoot, "entry.mjs"), 0o666);
  assert.equal(verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt: local }).reasonCodes[0], "IPA-INSTALLED-PERMISSIONS");
  chmodSync(join(repo.installedPluginRoot, "entry.mjs"), 0o644);
  writeFileSync(join(repo.sourcePluginRoot, "dirty.txt"), "dirty");
  assert.equal(verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt: local }).reasonCodes[0], "IPA-LOCAL-SOURCE-UNVERIFIED");
  rmSync(join(repo.sourcePluginRoot, "dirty.txt"));
  const target = join(repo.installedPluginRoot, "entry.mjs");
  const hard = join(repo.installedPluginRoot, "hard.mjs");
  linkSync(target, hard);
  assert.equal(verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt: local }).status, "rejected");
  rmSync(hard);
  const symlink = join(repo.installedPluginRoot, "linked.mjs");
  try { symlinkSync(target, symlink); assert.equal(verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt: local }).status, "rejected"); } catch { /* platform lacks symlinks */ }
});

test("input cannot select a receipt, public key, or key policy and a tree change during authority read is rejected", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const local = localAuthority(repo);
  assert.equal(verifyInstalledPluginAttestation({ ...repo.input(), receiptPath: "/chosen" }, { readExternalReceipt: local }).reasonCodes[0], "IPA-INPUT");
  assert.equal(verifyInstalledPluginAttestation({ ...repo.input(), publicKey: "chosen" }, { readExternalReceipt: local }).reasonCodes[0], "IPA-INPUT");
  const changed = verifyInstalledPluginAttestation(repo.input(), { readExternalReceipt(request) {
    const authority = local(request);
    writeFileSync(join(repo.installedPluginRoot, "entry.mjs"), "export const ready = false;\n");
    return authority;
  } });
  assert.equal(changed.reasonCodes[0], "IPA-INSTALLED-CHANGED");
});

test("local-development rebinds source Git and source-installed equivalence after the authority read", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const beforeCommit = git(repo.sourceRoot, ["rev-parse", "HEAD"]);
  const result = verifyInstalledPluginAttestation(repo.input(), {
    readExternalReceipt(request) {
      const authority = localAuthority(repo)(request);
      const replacement = "export const ready = 'replacement';\n";
      writeFileSync(join(repo.sourcePluginRoot, "entry.mjs"), replacement);
      git(repo.sourceRoot, ["add", "plugins/pipeline-core/entry.mjs"]);
      git(repo.sourceRoot, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "replace source during authority read"]);
      writeFileSync(join(repo.installedPluginRoot, "entry.mjs"), replacement);
      return authority;
    },
  });
  const afterCommit = git(repo.sourceRoot, ["rev-parse", "HEAD"]);
  assert.notEqual(afterCommit, beforeCommit, "fixture must replace the declared source candidate");
  assert.equal(result.status, "rejected");
  assert.equal(result.reasonCodes[0], "IPA-INSTALLED-CHANGED");
  assert.equal(Object.hasOwn(result, "receiptId"), false, "must not return a verified receipt with the old candidate attribution");
});

test("a committed source-only replacement during authority read cannot retain the old candidate attribution", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const beforeCommit = git(repo.sourceRoot, ["rev-parse", "HEAD"]);
  const result = verifyInstalledPluginAttestation(repo.input(), {
    readExternalReceipt(request) {
      const authority = localAuthority(repo)(request);
      writeFileSync(join(repo.sourcePluginRoot, "entry.mjs"), "export const ready = 'new-source-only';\n");
      git(repo.sourceRoot, ["add", "plugins/pipeline-core/entry.mjs"]);
      git(repo.sourceRoot, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "replace source only during authority read"]);
      return authority;
    },
  });
  assert.notEqual(git(repo.sourceRoot, ["rev-parse", "HEAD"]), beforeCommit);
  assert.equal(result.status, "rejected");
  assert.equal(result.reasonCodes[0], "IPA-LOCAL-SOURCE-CHANGED");
  assert.equal(Object.hasOwn(result, "receiptId"), false);
});

function releaseReceipt(repo, request, keys, { keyReference = "release-key", builderDigest = "b".repeat(64), extra = null } = {}) {
    const installed = { physicalRootPathSha256: request.physicalRootPathSha256, physicalRootIdentitySha256: request.physicalRootIdentitySha256, contentSha256: request.installedContentSha256 };
    const protectedRecord = { graphSha256: request.protectedGraphSha256, files: [
      { path: "entry.mjs", sha256: hash("export const ready = true;\n") }, { path: "hooks/codex-hooks.json", sha256: hash("{}\n") },
    ] };
    const claims = { provider: request.provider, plugin: request.plugin, installed, protected: protectedRecord, sourceClass: "signed-release" };
    let envelope = {
      schema: "pipeline.provenance-envelope.v1", candidate: { commit: "a".repeat(40), tree: "c".repeat(40) },
      subject: { id: "installed-plugin-release", sha256: hash(canonical(claims)) },
      materials: [{ id: "protected-graph", kind: "installed-plugin", sha256: request.protectedGraphSha256 }],
      builder: { id: "release-builder", digest: builderDigest }, invocation: { id: "release", parametersSha256: "d".repeat(64) },
      environment: { kind: "release", identitySha256: "e".repeat(64) }, assurance: "verified",
      attestation: { keyReference, signatureSha256: "0".repeat(64), status: "verified" }, reproducibility: "repeatable-in-same-builder",
    };
    const initialPayload = createProvenanceAttestationPayload(envelope);
    const initialSignature = sign(null, Buffer.from(initialPayload), keys.privateKey);
    envelope = { ...envelope, attestation: { ...envelope.attestation, signatureSha256: hash(initialSignature) } };
    const payload = createProvenanceAttestationPayload(envelope);
    const signature = sign(null, Buffer.from(payload), keys.privateKey);
    envelope = { ...envelope, attestation: { ...envelope.attestation, signatureSha256: hash(signature) } };
    const unsigned = { schema: "pipeline.installed-plugin-attestation.v1", provider: request.provider, plugin: request.plugin, installed, source: { class: "signed-release", envelope }, protected: protectedRecord };
    const receipt = { ...unsigned, receiptId: receiptId(unsigned) };
    const bytes = Buffer.from(JSON.stringify(receipt)); const path = join(repo.base, "authority", "release.json"); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes, { mode: 0o600 });
    return extra === null ? {
      receiptBytes: bytes, receiptIdentity: externalIdentity(path, bytes, Number(lstatSync(repo.installedPluginRoot).uid)),
      releaseAttestation: { keyReference, payload, publicKey: keys.publicKey.export({ type: "spki", format: "pem" }), signatureBase64: signature.toString("base64") },
    } : {
      receiptBytes: bytes, receiptIdentity: externalIdentity(path, bytes, Number(lstatSync(repo.installedPluginRoot).uid)),
      releaseAttestation: { keyReference, payload, publicKey: keys.publicKey.export({ type: "spki", format: "pem" }), signatureBase64: signature.toString("base64") },
      ...extra,
    };
}

test("signed release requires the installer-supplied key policy and a signature over all release identity claims", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const builderDigest = "b".repeat(64);
  const input = repo.input({ class: "signed-release" });
  const trustedHostPolicy = {
    schema: "pipeline.installed-plugin-host-policy.v1", provider: "codex",
    plugin: { name: "pipeline-core", version: "1.2.3-test.1" },
    keyReference: "release-key", publicKeySha256: hash(publicKey), builderDigest,
  };
  const result = verifyInstalledPluginAttestation(input, { trustedHostPolicy, readExternalReceipt: (request) => releaseReceipt(repo, request, keys, { builderDigest }) });
  assert.equal(result.status, "verified", JSON.stringify(result));
});

test("release receipt cannot select its own arbitrary key or smuggle a key policy", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const trustedKeys = generateKeyPairSync("ed25519");
  const attackerKeys = generateKeyPairSync("ed25519");
  const trustedPublicKey = trustedKeys.publicKey.export({ type: "spki", format: "pem" });
  const trustedHostPolicy = {
    schema: "pipeline.installed-plugin-host-policy.v1", provider: "codex",
    plugin: { name: "pipeline-core", version: "1.2.3-test.1" }, keyReference: "trusted-key",
    publicKeySha256: hash(trustedPublicKey), builderDigest: "b".repeat(64),
  };
  const input = repo.input({ class: "signed-release" });
  const arbitrary = verifyInstalledPluginAttestation(input, {
    trustedHostPolicy,
    readExternalReceipt: (request) => releaseReceipt(repo, request, attackerKeys, { keyReference: "attacker-key" }),
  });
  assert.equal(arbitrary.reasonCodes[0], "IPA-RELEASE-PROVENANCE");
  const smuggled = verifyInstalledPluginAttestation(input, {
    trustedHostPolicy,
    readExternalReceipt: (request) => releaseReceipt(repo, request, attackerKeys, {
      keyReference: "attacker-key", extra: { releasePolicy: { keyReference: "attacker-key", publicKeySha256: hash(attackerKeys.publicKey.export({ type: "spki", format: "pem" })), builderDigest: "b".repeat(64) } },
    }),
  });
  assert.equal(smuggled.reasonCodes[0], "IPA-AUTHORITY");
  let called = false;
  const unavailable = verifyInstalledPluginAttestation(input, { readExternalReceipt() { called = true; return null; } });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.reasonCodes[0], "IPA-RELEASE-POLICY-UNAVAILABLE");
  assert.equal(called, false);
});

test("the structural schema explicitly delegates protected-file key uniqueness and ordering to the runtime verifier", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/installed-plugin-attestation.schema.json", import.meta.url), "utf8"));
  assert.match(schema.title, /Structural schema/u);
  assert.match(schema.description, /runtime verifier is authoritative/u);
  const filesSchema = schema.properties.protected.properties.files;
  const pathPattern = new RegExp(filesSchema.items.properties.path.pattern, "u");
  const schemaAccepts = (files) => Array.isArray(files) && files.length >= filesSchema.minItems
    && (!filesSchema.uniqueItems || new Set(files.map(canonical)).size === files.length)
    && files.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry)
      && Object.keys(entry).sort().join("\0") === ["path", "sha256"].sort().join("\0")
      && pathPattern.test(entry.path) && /^[0-9a-f]{64}$/u.test(entry.sha256));
  const a = { path: "a.mjs", sha256: "a".repeat(64) };
  const b = { path: "b.mjs", sha256: "b".repeat(64) };
  const corpus = [
    { files: [a, b], schema: true, runtime: "IPA-PROTECTED-FILES-VALID" },
    { files: [], schema: false, runtime: "IPA-PROTECTED-FILES-SCHEMA" },
    { files: [{ ...a, path: "../a.mjs" }], schema: false, runtime: "IPA-PROTECTED-FILES-SCHEMA" },
    { files: [a, a], schema: false, runtime: "IPA-PROTECTED-FILES-DUPLICATE-PATH" },
    // JSON Schema uniqueItems sees distinct objects; path-key uniqueness is runtime-owned.
    { files: [a, { ...a, sha256: "c".repeat(64) }], schema: true, runtime: "IPA-PROTECTED-FILES-DUPLICATE-PATH" },
    // JSON Schema has no portable code-point sorting keyword; canonical order is runtime-owned.
    { files: [b, a], schema: true, runtime: "IPA-PROTECTED-FILES-ORDER" },
  ];
  for (const sample of corpus) {
    assert.equal(schemaAccepts(sample.files), sample.schema, sample.runtime);
    assert.equal(validateInstalledProtectedFiles(sample.files).code, sample.runtime);
  }
});
