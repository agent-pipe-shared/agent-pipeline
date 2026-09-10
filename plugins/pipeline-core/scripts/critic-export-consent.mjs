#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, realpathSync, rmdirSync, statSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { prepareCriticExportConsent, recordCriticExportConsent, revokeCriticExportConsent,
  checkCriticExportConsent, criticExportConsentPathAllowed } from "../lib/critic-export-policy.mjs";

import { resolveOnboardingPrivateState } from "../lib/codex-onboarding-runtime.mjs";
import { readPrivateJson, writePrivateJsonAtomic } from "../lib/private-boundary.mjs";

export function resolveCriticExportConsentState(root, create = false) {
  const state = resolveOnboardingPrivateState(root, "local", { create });
  const name = `critic-export-consent-${digest(JSON.stringify(physicalProject(root)))}.json`;
  return { directory: state.directory, path: join(state.directory, name) };
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => { throw new Error(code); };

// No shell or arbitrary executable input. Reject every symlink component,
// including aliases that resolve back into the project.
function localPath(root, relative, { createParents = false } = {}) {
  if (typeof relative !== "string" || !relative || relative.includes("\\")
    || /[\x00-\x1f\x7f]/u.test(relative)
    || relative.split("/").some((part) => !part || part === "." || part === "..")
    || relative.startsWith("/") || /^[A-Za-z]:/u.test(relative)) fail("consent-path-invalid");
  const parts = relative.split("/");
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    if (!existsSync(current)) {
      // existsSync follows symlinks, so dangling links need their own check.
      try { if (lstatSync(current).isSymbolicLink()) fail("consent-symlink"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (createParents && index < parts.length - 1) mkdirSync(current, { mode: 0o700 });
      else if (index < parts.length - 1) fail("consent-parent-missing");
    }
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) fail("consent-symlink");
      if (index < parts.length - 1 && !stat.isDirectory()) fail("consent-parent-invalid");
    }
  }
  return current;
}

function readBound(root, path) {
  const absolute = localPath(root, path);
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > 16n * 1024n * 1024n) fail("consent-input-invalid");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const current = lstatSync(localPath(root, path), { bigint: true });
    if (before.ino !== current.ino || before.dev !== current.dev || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) fail("consent-input-mutated");
    return bytes;
  } finally { closeSync(fd); }
}

function physicalProject(root) {
  const stat = statSync(root, { bigint: true });
  return { realPath: root, device: String(stat.dev), inode: String(stat.ino) };
}

export function readCriticExportConsentState(root) {
  const state = resolveCriticExportConsentState(root);
  if (!existsSync(state.directory)) return null;
  const path = localPath(state.directory, basename(state.path));
  return existsSync(path) ? readPrivateJson(path) : null;
}
const readState = readCriticExportConsentState;

function persist(root, consent, previous) {
  const state = resolveCriticExportConsentState(root, true);
  const target = localPath(state.directory, basename(state.path));
  const lock = `${target}.lock`;
  mkdirSync(lock, { mode: 0o700 });
  try {
    if (JSON.stringify(readState(root)) !== JSON.stringify(previous)) fail("consent-state-drift");
    writePrivateJsonAtomic(target, consent);
    if (JSON.stringify(readState(root)) !== JSON.stringify(consent)) fail("consent-state-readback-failed");
  } finally { rmdirSync(lock); }
}

function verifyInvocation(root, invocation) {
  // Pure validation precedes all candidate object reads. Scope coverage is
  // checked separately, and no raw content is emitted by this CLI.
  const git = (args) => execFileSync("git", ["-C", root, ...args], { maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const tree = git(["rev-parse", `${invocation.candidate.commit}^{tree}`]).toString().trim();
  if (tree !== invocation.candidate.tree) fail("consent-candidate-drift");
  for (const record of invocation.records) {
    if (!criticExportConsentPathAllowed(record.path)) fail("consent-path-invalid");
    localPath(root, record.path);
    let bytes;
    if (record.dataClass === "repository-candidate") {
      const listing = git(["ls-tree", invocation.candidate.commit, "--", record.path]).toString();
      if (!/^(?:100644|100755) blob [a-f0-9]+\t/u.test(listing) || listing.trimEnd().split("\t")[1] !== record.path) fail("consent-candidate-file-invalid");
      bytes = git(["show", `${invocation.candidate.commit}:${record.path}`]);
    } else bytes = readBound(root, record.path);
    if (digest(bytes) !== record.sha256) fail("consent-input-digest-drift");
  }
}

export function runCriticExportConsent(argv) {
  if (argv.includes("--help")) return { help: "critic-export-consent.mjs plan|check|record|revoke --root <physical-project> [--request <relative-json>] [--plan-sha256 <hash> --decision-reference <actual-reference> --decision-sha256 <actual-decision-hash>]\nplan/check are read-only. record requires an explicit attributed decision and current plan digest. revoke invalidates private state. No provider is invoked; no host permission is granted. State: namespaced owner-private file in the resolved Git common directory; linked worktrees supported. Request: {scope:{recipient:{provider,runner,service},purpose:'critic',sourceRoots:[],evidenceRoots:[]}, invocation:{candidate:{commit,tree},records:[{path,sha256,dataClass}]},hostGate?,providerGate?,observedEndpoint?}. plan/record need scope only. Project identity is observed locally." };
  const [command, ...rest] = argv;
  if (!["plan", "check", "record", "revoke"].includes(command) || rest.length % 2) fail("consent-cli-arguments");
  const flags = {};
  const allowed = new Set(["--root", "--request", ...(command === "record" ? ["--plan-sha256", "--decision-reference", "--decision-sha256"] : [])]);
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.has(rest[i]) || Object.hasOwn(flags, rest[i])) fail("consent-cli-arguments");
    flags[rest[i]] = rest[i + 1];
  }
  if (!flags["--root"]) fail("consent-root-required");
  const root = resolve(flags["--root"]);
  if (realpathSync(root) !== root) fail("consent-root-alias");
  const previous = readState(root);
  if (command === "revoke") {
    const result = revokeCriticExportConsent(previous);
    if (result.ok) persist(root, result.consent, previous);
    return result;
  }
  const requestBytes = readBound(root, flags["--request"]);
  const request = JSON.parse(requestBytes);
  if (!request || Object.keys(request).some((key) => !["scope", "invocation", "hostGate", "providerGate", "observedEndpoint"].includes(key))
    || Object.hasOwn(request.scope ?? {}, "project")) fail("consent-request-invalid");
  const scope = { ...request.scope, project: physicalProject(root) };
  const prepared = prepareCriticExportConsent(scope);
  if (!prepared.ok || command === "plan") return { ...prepared, externalGates: {
    host: request.hostGate ?? "not-observed", provider: request.providerGate ?? "not-observed" },
  observedEndpoint: request.observedEndpoint ?? null, hostApprovalGranted: false };
  if (command === "check") {
    const result = checkCriticExportConsent({ ...request, scope, consent: previous });
    if (result.coverage === "covered") verifyInvocation(root, request.invocation);
    if (!readBound(root, flags["--request"]).equals(requestBytes)) fail("consent-input-mutated");
    return result;
  }
  if (previous?.status === "active") fail("consent-already-recorded-revoke-before-amendment");
  if (previous && !revokeCriticExportConsent(previous).ok) fail("consent-invalid");
  const result = recordCriticExportConsent({ ...prepared, planSha256: flags["--plan-sha256"],
    decisionReference: flags["--decision-reference"], decisionSha256: flags["--decision-sha256"] });
  if (result.ok) {
    if (!readBound(root, flags["--request"]).equals(requestBytes)) fail("consent-input-mutated");
    persist(root, result.consent, previous);
  }
  return result;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const result = runCriticExportConsent(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result.ok === false) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.message?.startsWith("consent-") ? error.message : "consent-local-input-error", hostApprovalGranted: false }));
    process.exitCode = 1;
  }
}
