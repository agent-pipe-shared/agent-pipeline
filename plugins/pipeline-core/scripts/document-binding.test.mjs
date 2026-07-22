#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash as nodeCreateHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DocumentBindingError,
  issueDocumentBindingId,
  readPrivateDocumentBinding,
  resolvePrivateDocumentBinding,
  storePrivateDocumentBinding,
  validateTriggerPattern,
} from "./document-binding.mjs";
import {
  DocumentAdapterError,
  issueDocumentAdapterId,
  readPrivateDocumentAdapter,
  registerPrivateDocumentAdapter,
  resolvePrivateDocumentAdapter,
  validatePrivateDocumentAdapter,
} from "./document-adapter.mjs";
import {
  DocumentRenderControllerError,
  buildFixedRendererLaunch,
  probeRendererAvailability,
  startFixedRenderer,
} from "./document-render-controller.mjs";
import {
  DOCUMENT_RENDERER_MAX_HEADER_BYTES,
  DOCUMENT_RENDERER_MAX_PAYLOAD_BYTES,
  DocumentRenderProtocolError,
  encodeRendererRequest,
  encodeRendererResponseFrame,
  parseRendererResponseFrame,
  validateRendererRequest,
  validateRendererResponse,
} from "./document-render-protocol.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "document-binding.mjs");
const ADAPTER_CLI = join(HERE, "document-adapter.mjs");
const ADAPTER_ID = `da_${"a".repeat(26)}`;

function git(root, args) { execFileSync("git", args, { cwd: root, stdio: "pipe" }); }
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "document-binding-repo-"));
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.invalid"]);
  git(repo, ["config", "user.name", "Document Binding Test"]);
  writeFileSync(join(repo, "README.md"), "fixture\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "fixture"]);
  const privateRoot = mkdtempSync(join(tmpdir(), "document-binding-private-"));
  chmodSync(privateRoot, 0o700);
  const outputDirectory = join(privateRoot, "out");
  mkdirSync(outputDirectory, { mode: 0o700 });
  const dataPath = join(privateRoot, "data.json");
  const templatePath = join(privateRoot, "template.txt");
  writeFileSync(dataPath, "{}\n", { mode: 0o600 });
  writeFileSync(templatePath, "template\n", { mode: 0o600 });
  chmodSync(dataPath, 0o600); chmodSync(templatePath, 0o600); chmodSync(outputDirectory, 0o700);
  // On native Windows chmod cannot establish the owner-only DACL the private-root
  // contract requires; harden both the fixture's own root and its nested output
  // directory the way a real caller's private root would be (no-op on POSIX).
  if (process.platform === "win32") { hardenWindowsPrivateDirectory(privateRoot); hardenWindowsPrivateDirectory(outputDirectory); }
  return { repo, privateRoot, outputDirectory, dataPath, templatePath };
}
function binding(context, repoFingerprint, bindingId) {
  return {
    schema: "pipeline.private-document-binding.v1",
    repoFingerprint,
    bindingId,
    classId: "privacy",
    policySha256: "b".repeat(64),
    triggerPatterns: ["docs/**/*.md", "README.md"],
    adapterId: ADAPTER_ID,
    privateRoot: context.privateRoot,
    dataPath: context.dataPath,
    templatePath: context.templatePath,
    outputDirectory: context.outputDirectory,
    hmacKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    createdBy: "po",
    createdAt: "2026-07-19T12:00:00.000Z",
  };
}
function cli(repo, bindingId) {
  return execFileSync(process.execPath, [CLI, "read", "--repo", repo, "--binding-id", bindingId], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function adapterCli(repo, args) {
  return execFileSync(process.execPath, [ADAPTER_CLI, ...args], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

check("immutable owner-only binding persists once and reads only by exact issued ID", () => {
  const context = fixture();
  try {
    const issued = issueDocumentBindingId(context.repo);
    const target = resolvePrivateDocumentBinding(context.repo, issued.id);
    const request = binding(context, target.repoFingerprint, issued.id);
    const first = storePrivateDocumentBinding(context.repo, request);
    assert.equal(first.created, true);
    assert.equal(existsSync(target.path), true);
    assertPrivateFileMode(target.path);
    const replay = storePrivateDocumentBinding(context.repo, request);
    assert.equal(replay.created, false);
    assert.deepEqual(readPrivateDocumentBinding(context.repo, issued.id).binding, request);
    assert.throws(() => readPrivateDocumentBinding(context.repo, `dh_${"7".repeat(25)}4`), (error) => error instanceof DocumentBindingError && error.code === "DB-MISSING");
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("different immutable bytes and non-owner-only file modes fail closed", () => {
  const context = fixture();
  try {
    const issued = issueDocumentBindingId(context.repo);
    const target = resolvePrivateDocumentBinding(context.repo, issued.id);
    const original = binding(context, target.repoFingerprint, issued.id);
    storePrivateDocumentBinding(context.repo, original);
    const changed = { ...original, classId: "operations" };
    assert.throws(() => storePrivateDocumentBinding(context.repo, changed), /immutable/u);
    // A POSIX chmod-widened mode has no native Windows equivalent (chmod does not
    // grant a real extra Windows ACE); the DACL-drift fail-closed contract is
    // exercised natively by windows-private-state.test.mjs (WPS03) instead.
    if (process.platform !== "win32") {
      chmodSync(target.path, 0o640);
      assert.throws(() => readPrivateDocumentBinding(context.repo, issued.id), (error) => error instanceof DocumentBindingError && error.code === "DB-BOUNDARY");
    }
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("glob and CLI readback reject unsafe syntax and do not expose private coordinates", () => {
  const context = fixture();
  try {
    const issued = issueDocumentBindingId(context.repo);
    const target = resolvePrivateDocumentBinding(context.repo, issued.id);
    storePrivateDocumentBinding(context.repo, binding(context, target.repoFingerprint, issued.id));
    for (const pattern of ["/absolute", "docs/**part", "docs/[a].md", "docs/../secret", "not\\posix"]) assert.throws(() => validateTriggerPattern(pattern), /pattern|segment/u);
    const output = cli(context.repo, issued.id);
    const value = JSON.parse(output);
    assert.deepEqual(Object.keys(value).sort(), ["bindingId", "classId", "createdAt", "policySha256", "schema"]);
    assert.equal(output.includes(context.privateRoot), false);
    assert.equal(output.includes("hmacKeyBase64"), false);
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("binding creation requires a purpose-bound opaque reservation", () => {
  const context = fixture();
  try {
    const unissued = `dh_${"a".repeat(26)}`;
    const target = resolvePrivateDocumentBinding(context.repo, unissued);
    assert.throws(
      () => storePrivateDocumentBinding(context.repo, binding(context, target.repoFingerprint, unissued)),
      (error) => error instanceof DocumentBindingError && error.code === "DB-RESERVATION",
    );
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

function requireMode(path) { return lstatSync(path).mode & 0o777; }
// Native Windows mode is a synthetic constant (no POSIX permission bits), so the
// mode-0600 literal cannot be asserted there; the real Windows private-file
// assurance (owner-only DACL) is already exercised because production would have
// thrown "Windows assurance is unavailable or insecure" had it not held.
function assertPrivateFileMode(path) { if (process.platform !== "win32") assert.equal(requireMode(path), 0o600); }
let symlinkCapable = true;
function probeSymlinkCapability() {
  const probeDir = mkdtempSync(join(tmpdir(), "document-binding-symlink-probe-"));
  try {
    const target = join(probeDir, "target"); const link = join(probeDir, "link");
    writeFileSync(target, "x");
    symlinkSync(target, link);
  } catch { symlinkCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
}
probeSymlinkCapability();
if (!symlinkCapable) console.log("[capability: symlink unavailable] skipping symlink-specific assertions");

check("private adapter registration reserves an exact da ID and has stable immutable replay", () => {
  const context = fixture();
  const executable = join(context.privateRoot, "renderer");
  try {
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    chmodSync(executable, 0o700);
    const expectedSha256 = executableHash(executable);
    const issued = issueDocumentAdapterId(context.repo);
    const target = resolvePrivateDocumentAdapter(context.repo, issued.id);
    const first = registerPrivateDocumentAdapter(context.repo, {
      adapterId: issued.id, executablePath: executable, expectedSha256, registeredBy: "po",
      now: () => new Date("2026-07-20T01:02:03.000Z"),
    });
    assert.equal(first.created, true);
    assertPrivateFileMode(target.path);
    const replay = registerPrivateDocumentAdapter(context.repo, {
      adapterId: issued.id, executablePath: executable, expectedSha256, registeredBy: "po",
      now: () => new Date("2026-07-20T01:02:04.000Z"),
    });
    assert.equal(replay.created, false);
    assert.equal(replay.adapter.registeredAt, "2026-07-20T01:02:03.000Z");
    assert.deepEqual(readPrivateDocumentAdapter(context.repo, issued.id).adapter, first.adapter);
    assert.throws(() => readPrivateDocumentAdapter(context.repo, `da_${"7".repeat(25)}4`), (error) => error instanceof DocumentAdapterError && error.code === "DA-MISSING");
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("adapter registration fails closed for reservation, executable identity, digest and record-shape drift", () => {
  const context = fixture();
  const executable = join(context.privateRoot, "renderer");
  const hardlink = join(context.privateRoot, "renderer-hardlink");
  const symlink = join(context.privateRoot, "renderer-symlink");
  try {
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    chmodSync(executable, 0o700);
    const expectedSha256 = executableHash(executable);
    const unissued = `da_${"a".repeat(26)}`;
    assert.throws(() => registerPrivateDocumentAdapter(context.repo, {
      adapterId: unissued, executablePath: executable, expectedSha256, registeredBy: "po",
    }), (error) => error instanceof DocumentAdapterError && error.code === "DA-RESERVATION");
    const issued = issueDocumentAdapterId(context.repo);
    assert.throws(() => registerPrivateDocumentAdapter(context.repo, {
      adapterId: issued.id, executablePath: executable, expectedSha256: "0".repeat(64), registeredBy: "po",
    }), (error) => error instanceof DocumentAdapterError && error.code === "DA-DIGEST");
    linkSync(executable, hardlink);
    assert.throws(() => registerPrivateDocumentAdapter(context.repo, {
      adapterId: issued.id, executablePath: executable, expectedSha256, registeredBy: "po",
    }), (error) => error instanceof DocumentAdapterError && error.code === "DA-EXECUTABLE");
    rmSync(hardlink);
    if (symlinkCapable) {
      symlinkSync(executable, symlink);
      assert.throws(() => registerPrivateDocumentAdapter(context.repo, {
        adapterId: issued.id, executablePath: symlink, expectedSha256, registeredBy: "po",
      }), (error) => error instanceof DocumentAdapterError && error.code === "DA-EXECUTABLE");
    }
    const registered = registerPrivateDocumentAdapter(context.repo, {
      adapterId: issued.id, executablePath: executable, expectedSha256, registeredBy: "po",
    });
    writeFileSync(executable, "#!/bin/sh\necho drift\n", { mode: 0o700 });
    chmodSync(executable, 0o700);
    assert.throws(() => readPrivateDocumentAdapter(context.repo, issued.id), (error) => error instanceof DocumentAdapterError && error.code === "DA-DIGEST");
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    chmodSync(executable, 0o700);
    const target = resolvePrivateDocumentAdapter(context.repo, issued.id);
    writeFileSync(target.path, `${JSON.stringify({ ...registered.adapter, ignored: true }, null, 2)}\n`, { mode: 0o600 });
    chmodSync(target.path, 0o600);
    assert.throws(() => readPrivateDocumentAdapter(context.repo, issued.id), (error) => error instanceof DocumentAdapterError && error.code === "DA-SCHEMA");
    assert.throws(() => validatePrivateDocumentAdapter({ ...registered.adapter, ignored: true }), (error) => error instanceof DocumentAdapterError && error.code === "DA-SCHEMA");
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("adapter CLI permits only explicit issue, register and exact-ID read commands", () => {
  const context = fixture();
  const executable = join(context.privateRoot, "renderer");
  try {
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    chmodSync(executable, 0o700);
    const issued = JSON.parse(adapterCli(context.repo, ["issue-id", "--repo", context.repo]));
    assert.deepEqual(Object.keys(issued).sort(), ["adapterId", "schema"]);
    const expectedSha256 = executableHash(executable);
    const registration = JSON.parse(adapterCli(context.repo, ["register", "--repo", context.repo, "--adapter-id", issued.adapterId, "--executable", executable, "--expected-sha256", expectedSha256, "--by", "po"]));
    assert.deepEqual(registration, { schema: "pipeline.document-adapter-registration.v1", adapterId: issued.adapterId, created: true });
    const read = JSON.parse(adapterCli(context.repo, ["read", "--repo", context.repo, "--adapter-id", issued.adapterId]));
    assert.equal(read.executablePath, executable);
    assert.equal(read.protocol, "pipeline.document-renderer-stdio.v1");
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("renderer launch is Linux-user-systemd-only and preserves the closed systemd argv", () => {
  const context = fixture();
  const executable = join(context.privateRoot, "renderer");
  try {
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    chmodSync(executable, 0o700);
    const issued = issueDocumentAdapterId(context.repo);
    const adapter = registerPrivateDocumentAdapter(context.repo, {
      adapterId: issued.id, executablePath: executable, expectedSha256: executableHash(executable), registeredBy: "po",
    }).adapter;
    const unavailable = probeRendererAvailability({ platform: "darwin", systemdRunPath: "/unavailable" });
    assert.deepEqual(unavailable, { available: false, reason: "adapter-unavailable" });
    const unavailableManager = probeRendererAvailability({
      platform: "linux", systemdRunPath: "/usr/bin/systemd-run",
      stat: () => ({ isFile: () => true, isSymbolicLink: () => false }),
      userManagerProbe: () => ({ userManager: true, transientServiceCgroup: false }),
    });
    assert.deepEqual(unavailableManager, { available: false, reason: "adapter-unavailable" });
    const available = probeRendererAvailability({
      platform: "linux", systemdRunPath: "/usr/bin/systemd-run",
      stat: () => ({ isFile: () => true, isSymbolicLink: () => false }),
      userManagerProbe: () => ({ userManager: true, transientServiceCgroup: true }),
    });
    assert.deepEqual(available, { available: true, reason: null });
    const launch = buildFixedRendererLaunch(adapter, {
      requestId: `drq_${"a".repeat(26)}`,
      workingDirectory: context.privateRoot,
      availability: available,
      systemdRunPath: "/usr/bin/systemd-run",
    });
    assert.equal(launch.command, "/usr/bin/systemd-run");
    assert.deepEqual(launch.args, [
      "--user", "--pipe", "--wait", "--collect", "--quiet", "--unit", `agent-pipeline-document-drq_${"a".repeat(26)}.service`,
      "--property=RuntimeMaxSec=295s", "--property=KillMode=control-group", "--property=TimeoutStopSec=5s",
      "--", executable, "--stdio-v1",
    ]);
    assert.deepEqual(launch.options, {
      shell: false, cwd: context.privateRoot, env: { LANG: "C", PATH: "/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    const calls = [];
    const fake = (command, args, options) => { calls.push({ command, args, options }); return { pid: 42, stdin: {}, stdout: {}, stderr: {} }; };
    assert.equal(startFixedRenderer(adapter, {
      requestId: `drq_${"a".repeat(26)}`, workingDirectory: context.privateRoot, spawnChild: fake,
      platform: "linux", stat: () => ({ isFile: () => true, isSymbolicLink: () => false }),
      userManagerProbe: () => ({ userManager: true, transientServiceCgroup: true }),
    }).pid, 42);
    assert.equal(calls.length, 1);
    assert.throws(() => buildFixedRendererLaunch(adapter, {
      requestId: `drq_${"a".repeat(26)}`, workingDirectory: context.privateRoot, availability: unavailable,
    }), (error) => error instanceof DocumentRenderControllerError && error.code === "DR-UNAVAILABLE");
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

function rendererRequest(context, requestId = `drq_${"a".repeat(26)}`) {
  return {
    schema: "pipeline.document-renderer-request.v1", requestId, repoFingerprint: "f".repeat(64), classId: "privacy",
    bindingId: `dh_${"a".repeat(26)}`, event: "verify", candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40),
    dataPath: context.dataPath, dataSha256: "1".repeat(64), templatePath: context.templatePath, templateSha256: "2".repeat(64),
    outputMode: "framed-stdout-v1", deadlineAt: "2026-07-20T01:02:03.000Z",
  };
}
function renderedResponse(requestId) {
  return { schema: "pipeline.document-renderer-response.v1", requestId, status: "rendered", rendererSha256: "3".repeat(64), outputSha256: "4".repeat(64), errorClass: null };
}

check("private renderer request and response schemas are closed, canonical and request-bound", () => {
  const context = fixture();
  try {
    const request = rendererRequest(context);
    const encoded = encodeRendererRequest(request);
    // Compare via the JSON-decoded value, not raw bytes: on native Windows the
    // private path contains backslashes, which JSON-encoding escapes (\\), so a
    // literal-byte Buffer.includes search for the unescaped path never matches
    // even though the private coordinate is correctly present in the payload.
    assert.equal(JSON.parse(encoded.toString("utf8")).dataPath, context.dataPath, "private coordinates remain only in the private stdin body");
    assert.deepEqual(validateRendererRequest(request), request);
    assert.throws(() => validateRendererRequest({ ...request, unknown: true }), (error) => error instanceof DocumentRenderProtocolError && error.code === "DRP-REQUEST");
    assert.throws(() => validateRendererRequest({ ...request, dataPath: "relative" }), (error) => error instanceof DocumentRenderProtocolError && error.code === "DRP-REQUEST");
    const response = renderedResponse(request.requestId);
    assert.deepEqual(validateRendererResponse(response, { requestId: request.requestId }), response);
    assert.throws(() => validateRendererResponse({ ...response, requestId: `drq_${"b".repeat(26)}` }, { requestId: request.requestId }), /DRP-RESPONSE/u);
    assert.throws(() => validateRendererResponse({ ...response, errorClass: "timeout" }), (error) => error instanceof DocumentRenderProtocolError && error.code === "DRP-RESPONSE");
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("renderer stdout frame enforces bounded canonical header, exact payload and no public private paths", () => {
  const context = fixture();
  try {
    const request = rendererRequest(context);
    const frame = encodeRendererResponseFrame(renderedResponse(request.requestId), Buffer.from("artifact"), { requestId: request.requestId });
    const parsed = parseRendererResponseFrame(frame, { requestId: request.requestId });
    assert.deepEqual(parsed.response, renderedResponse(request.requestId));
    assert.equal(parsed.payload.toString("utf8"), "artifact");
    assert.equal(JSON.stringify(parsed).includes(context.privateRoot), false, "stdout parse result cannot leak request paths");
    assert.throws(() => parseRendererResponseFrame(Buffer.concat([frame, Buffer.from([0])]), { requestId: request.requestId }), (error) => error instanceof DocumentRenderProtocolError && error.code === "DRP-TRAILING");
    const oversizedHeader = Buffer.alloc(12); oversizedHeader.writeUInt32BE(DOCUMENT_RENDERER_MAX_HEADER_BYTES + 1, 0);
    assert.throws(() => parseRendererResponseFrame(oversizedHeader), (error) => error instanceof DocumentRenderProtocolError && error.code === "DRP-HEADER");
    const declaredOversize = Buffer.from(frame.subarray(0, 4 + frame.readUInt32BE(0) + 8));
    declaredOversize.writeBigUInt64BE(BigInt(DOCUMENT_RENDERER_MAX_PAYLOAD_BYTES) + 1n, declaredOversize.length - 8);
    assert.throws(() => parseRendererResponseFrame(declaredOversize, { requestId: request.requestId }), (error) => error instanceof DocumentRenderProtocolError && error.code === "DRP-PAYLOAD");
  } finally { rmSync(context.repo, { recursive: true, force: true }); rmSync(context.privateRoot, { recursive: true, force: true }); }
});

check("failed renderer frames carry no output payload", () => {
  const requestId = `drq_${"a".repeat(26)}`;
  const failed = { schema: "pipeline.document-renderer-response.v1", requestId, status: "failed", rendererSha256: "3".repeat(64), outputSha256: null, errorClass: "render-failed" };
  const frame = encodeRendererResponseFrame(failed, Buffer.alloc(0), { requestId });
  assert.equal(parseRendererResponseFrame(frame, { requestId }).payload.length, 0);
  assert.throws(() => encodeRendererResponseFrame(failed, Buffer.from("must-not-write"), { requestId }), (error) => error instanceof DocumentRenderProtocolError && error.code === "DRP-PAYLOAD");
});

function executableHash(path) {
  return nodeCreateHash("sha256").update(readFileSync(path)).digest("hex");
}

console.log(`\ndocument binding: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
