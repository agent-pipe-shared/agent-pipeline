#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * po-human-approval.test.mjs — first test coverage for scripts/po-human-approval.mjs,
 * scoped to the new `sign-intent` subcommand only (NOVA-PO-SIGN-HELPER-1), plus the
 * plain-language pre-signature confirmation gate added on top of it in
 * NOVA-PO-CONFIRM-1. The pre-existing setup/prepare/approve/verify branches and their
 * -critical/-all variants are intentionally left uncovered here: `sign-intent` is
 * request-shape-agnostic (no --feature-id/--kind/request-file dependency at all), so
 * this suite proves only that it signs an already-computed 64-hex-char intent digest
 * with the same OpenSSL/proof-shape discipline the existing `approve` branch already
 * uses, and that neither branch can reach OpenSSL without an explicit, injected
 * confirmation. `approve`/`approve-critical` share the exact same
 * `requireExplicitConfirmation` gate exercised below; their own request-fixture setup
 * is covered elsewhere (plugins/pipeline-core/lib/threat-model-approval-request.test.mjs).
 *
 * ONECMD-1 widened this suite to the critical-action path: the single-invocation
 * `authorize-critical` command (prepare + sign in one transaction, so no request
 * left on disk by an earlier preparation can be the thing that gets signed), the
 * disclosure it prints before the passphrase prompt, and the field-naming
 * validation errors the two-step `prepare-critical` now returns. The two-step flow
 * is characterised here too, because both halves were refactored onto the shared
 * request-construction and signing helpers the new command uses.
 *
 * GF-105 widened it further to `authorizeCriticalPushCommand`, the bounded,
 * copy-safe RENDERING of that same `authorize-critical` command for a push
 * approval -- construction and rendering only, never anything that touches key
 * material or the signing flow itself.
 *
 * WP-K-AC05-REWORK1 adds a second scope to this file: the `*-fork-disposition`
 * commands (ADR-0072). Their central proof is deliberately end-to-end rather
 * than shape-level — a request this CLI builds, signed by a real OpenSSL round
 * trip, must be accepted by the store's OWN verifier (`authorizeForkDisposition`
 * via `recoverPortableGovernanceProjection`), because "the command runs" is
 * exactly what the previous, unusable `prepare-critical --kind
 * governance-fork-disposition` route could also claim. One regression test
 * pins that `push`/`deploy`/`publication` keep composing the same request from
 * the real candidate and real repository file bytes.
 *
 * WP-K-AC05-REWORK2 adds what that round left open: the OLD route
 * (`prepare-critical --kind governance-fork-disposition`) still parsed, still
 * built the unverifiable request, and wrote it over the correct command's own
 * artifact. Its refusal is proven below against a prepared, valid request — the
 * file must survive byte-identical — and the public half of the ceremony is
 * exercised through `po-approval-gate.mjs`, the script the lifecycle guard
 * allowlists as agent-executable, rather than only through the human-terminal
 * entry point.
 */
import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { authorizeCriticalPushCommand, describeArchitectureInheritedSourcesRequest, keyDirectoryUnsetFinding, outside, parseHumanArgs as parseHumanArgsUnguarded, persistExplicitDirectoryIntoMachinePlane, poHumanApprovalSetupCommand, readPoHumanApprovalAuthority, resolvePoKeyDirectory, runForkDispositionApproval as runForkDispositionApprovalUnguarded, runHumanApproval as runHumanApprovalUnguarded } from "./po-human-approval.mjs";
import { organizationArchitectureConfigIntentSha256 } from "../lib/organization-architecture-source-store.mjs";
import { run as runApprovalGate } from "./po-approval-gate.mjs";
import { canonical, createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";

/**
 * R7-6-T9 safety audit (decision AC): `setup --directory` and `set-po-key-directory` WRITE the
 * machine-wide plane at `<home>/.agent-pipeline/machine.json`, so no case in this file may reach the
 * real home. Every `runHumanApproval` / `parseHumanArgs` call below that injects no `homedirFn`
 * (all the `setup --directory` cases that used to run against the host's real home among them)
 * therefore gets a fixture home OUTSIDE every repository (the sign-intent probe needs one), emptied
 * before each call so no plane leaks from one case into another. A case that injects its own
 * `homedirFn` (every multi-step case, to keep its plane between calls) is passed through unchanged.
 */
const DEFAULT_FIXTURE_HOME = mkdtempSync(join(tmpdir(), "po-human-approval-default-home-"));
process.on("exit", () => rmSync(DEFAULT_FIXTURE_HOME, { recursive: true, force: true }));
function withFixtureHome(dependencies = {}) {
  if (dependencies.homedirFn !== undefined) return dependencies;
  rmSync(join(DEFAULT_FIXTURE_HOME, ".agent-pipeline"), { recursive: true, force: true });
  return { ...dependencies, homedirFn: () => DEFAULT_FIXTURE_HOME };
}
/**
 * TR-S1-T3 (Ruling 78): the central encrypted-key lever. After TR-S1-F, every verb that reads the
 * registered PO key refuses a key that is not passphrase-protected, so a fixture key is no longer
 * "an unencrypted keyFixture() key". Rather than ~60 per-case edits, this wrapper acts on each call
 * that reads a key. It finds the key directory the way production does (resolvePoKeyDirectory: flag,
 * environment, machine plane, legacy store) and, for setup --existing-key, the source key. Then:
 *  1. an UNENCRYPTED po-private.pem is re-encrypted IN PLACE with LEVER_PASSPHRASE, from the SAME
 *     keypair (po-public.pem, trust-policy.json and the committed trust anchors stay valid);
 *  2. `isTTY: true` is injected unless the case set its own (an encrypted key needs an attended
 *     terminal, po-human-approval.mjs assertAttendedTerminalWhenPassphraseKey);
 *  3. the spawn seam (the case's own, else real spawnSync) gets `-passin pass:<LEVER_PASSPHRASE>`
 *     appended to every openssl call that names the key (production has no -passin; real OpenSSL would
 *     prompt). Stubs that sign or derive with node:crypto (r76Spy, fakeSetupSpawn) honour `-passin`.
 * Nothing is injected unless a key encrypted under LEVER_PASSPHRASE was found, so keys of other
 * passphrases (encryptedKeyFixture), trap files and absent keys behave exactly as before. A case whose
 * SUBJECT is the unencrypted key opts out with plainKey(dependencies); tr1Spawn spawns carry the same
 * marker (the TR-S1-T pins' own setup helper). The original readFileSync is captured so the R7-6
 * "trap key is never opened" filesystem spy cannot see the lever.
 */
const LEVER_PASSPHRASE = "tr-s1-t3-lever-fixture-passphrase";
const KEEP_KEY_PLAIN = Symbol("tr-s1-t3-keep-key-plain");
const plainKey = (dependencies = {}) => ({ ...dependencies, [KEEP_KEY_PLAIN]: true });
const LEVER_VERBS = new Set(["setup", "sign-intent", "authorize-critical", "approve", "approve-critical", "approve-fork-disposition"]);
const leverReadFile = readFileSync;
function leverKeyPaths(argv, dependencies) {
  if (!LEVER_VERBS.has(argv[0])) return [];
  const flag = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  const paths = [];
  try {
    const found = resolvePoKeyDirectory({ explicit: flag("--directory"), repoRoot: flag("--repo-root"), dependencies });
    if (found.status === "resolved" && typeof found.directory === "string") paths.push(join(found.directory, "po-private.pem"));
  } catch { /* an unresolvable directory has no key for the lever to touch */ }
  const source = argv[0] === "setup" ? flag("--existing-key") : undefined;
  if (typeof source === "string" && source !== "") paths.push(resolve(source));
  return paths.filter((path) => existsSync(path));
}
function applyKeyLever(argv, dependencies) {
  if (dependencies[KEEP_KEY_PLAIN] === true || dependencies.spawn?.[KEEP_KEY_PLAIN] === true) return dependencies;
  const keyPaths = leverKeyPaths(argv, dependencies);
  let engaged = false;
  for (const keyPath of keyPaths) {
    let pem;
    try { pem = leverReadFile(keyPath, "utf8"); } catch { continue; }
    if (pem.includes("-----BEGIN PRIVATE KEY-----")) {
      writeFileSync(keyPath, createPrivateKey(pem).export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: LEVER_PASSPHRASE }));
      engaged = true;
    } else if (pem.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----")) {
      try { createPrivateKey({ key: pem, format: "pem", passphrase: LEVER_PASSPHRASE }); engaged = true; } catch { /* encrypted under the case's own passphrase: leave it alone */ }
    }
  }
  if (!engaged) return dependencies;
  const base = dependencies.spawn ?? spawnSync;
  const spawn = (executable, args, options) => {
    const list = Array.isArray(args) ? args : [];
    const namesKey = executable === "openssl" && !list.includes("-passin")
      && list.some((entry) => /po-private\.pem$/u.test(String(entry)) || keyPaths.includes(resolve(String(entry))));
    return base(executable, namesKey ? [...list, "-passin", `pass:${LEVER_PASSPHRASE}`] : args, options);
  };
  return { ...dependencies, isTTY: dependencies.isTTY ?? true, spawn, [LEVER_ENGAGED]: true };
}
/**
 * TR-S1-T4 disclosure adapter (Ruling 83). Opt-in per case with disclosureChannel(carrier); acts only when the case
 * is marked AND applyKeyLever re-encrypted its key (LEVER_ENGAGED). The lists of what moved (the five cases whose
 * "subject retired by TR-S1 (Ruling 78)", the 16 whose "channel moved from prompt to stdout disclosure (Ruling 83)",
 * the literal-word measurement) live in the TR-S1-T pin header further down this file, next to amendment A4.
 */
const LEVER_ENGAGED = Symbol("tr-s1-t4-lever-engaged");
const DISCLOSURE_CHANNEL = Symbol("tr-s1-t4-disclosure-channel");
const disclosureChannel = (carrier = {}) => { carrier[DISCLOSURE_CHANNEL] = true; return carrier; };
function callWithLever(argv, dependencies, unguarded) {
  const leveraged = applyKeyLever(argv, dependencies);
  const marked = dependencies?.[DISCLOSURE_CHANNEL] === true || dependencies?.spawn?.[DISCLOSURE_CHANNEL] === true;
  const stub = marked && leveraged[LEVER_ENGAGED] === true ? leveraged.readConfirmation : undefined;
  if (typeof stub !== "function") return unguarded(argv, leveraged);
  const hadOwnWrite = Object.hasOwn(process.stdout, "write");
  const priorWrite = process.stdout.write;
  process.stdout.write = function disclosureCapture(chunk, ...rest) {
    stub(String(chunk));
    const done = rest.find((entry) => typeof entry === "function");
    if (done) done();
    return true;
  };
  try { return unguarded(argv, leveraged); } finally {
    if (hadOwnWrite) process.stdout.write = priorWrite; else delete process.stdout.write;
  }
}
const runHumanApproval = (argv, dependencies) => callWithLever(argv, withFixtureHome(dependencies), runHumanApprovalUnguarded);
const runForkDispositionApproval = async (argv, dependencies = {}) => callWithLever(argv, dependencies, runForkDispositionApprovalUnguarded);
const parseHumanArgs = (argv, dependencies) => parseHumanArgsUnguarded(argv, withFixtureHome(dependencies));

function nestedDwpSigningRequest() {
  const packageSha256 = "d".repeat(64);
  const approvalIntent = createPoApprovalIntent({ kind: "design-workflow-package", featureId: "signing-fixture",
    planSha256: "1".repeat(64), specSha256: "2".repeat(64), candidate: { commit: "a".repeat(40), tree: "b".repeat(40) },
    policyRevision: "design-workflow-package-v1", subjectSha256: packageSha256, decision: "approve" });
  return { schema: "pipeline.design-workflow-package-approval-request.v1", packagePath: "specs/signing-fixture/evidence/package.json", packageSha256, approvalIntent };
}
test("DWP nested digest transport reaches the unchanged default complete-package validator without a top-level alias", () => {
  const dirs = fixtureDirs();try {
    keyFixture(dirs.directory);mkdirSync(join(dirs.repoRoot,"scratch"));const request=nestedDwpSigningRequest();assert.equal(Object.keys(request).length,4);assert.equal(Object.hasOwn(request,"intentSha256"),false);
    writeFileSync(join(dirs.repoRoot,"scratch","dwp-request-fixture.json"),JSON.stringify(request));let confirmations=0,signs=0,fallbacks=0;
    assert.throws(()=>runHumanApproval(["sign-intent","--repo-root",dirs.repoRoot,"--directory",dirs.directory,"--request","scratch/dwp-request-fixture.json"],{readConfirmation:()=>{confirmations++;return "approve";},spawn:()=>{signs++;throw Error("unexpected signing");},describeIntentRecord:()=>{fallbacks++;throw Error("unexpected generic fallback");}}),/design-workflow approval request does not bind a current, complete package/);
    assert.equal(confirmations,0);assert.equal(signs,0);assert.equal(fallbacks,0);assert.equal(existsSync(join(dirs.repoRoot,"scratch","dwp-proof-fixture.json")),false);
  }finally{cleanup(dirs);}
});
test("DWP nested digest transport rejects malformed nested hashes even when a generic top-level digest exists", () => {
  const dirs=fixtureDirs();try {
    keyFixture(dirs.directory);mkdirSync(join(dirs.repoRoot,"scratch"));for(const nested of [undefined,"bad","A".repeat(64)]){
      const request=nestedDwpSigningRequest();request.intentSha256="c".repeat(64);request.approvalIntent.sha256=nested;writeFileSync(join(dirs.repoRoot,"scratch","dwp-request-malformed.json"),JSON.stringify(request));let confirmations=0,signs=0;
      assert.throws(()=>runHumanApproval(["sign-intent","--repo-root",dirs.repoRoot,"--directory",dirs.directory,"--request","scratch/dwp-request-malformed.json"],{readConfirmation:()=>{confirmations++;return "approve";},spawn:()=>{signs++;throw Error("unexpected signing");}}),/approvalIntent.sha256/);assert.equal(confirmations,0);assert.equal(signs,0);
    }
  }finally{cleanup(dirs);}
});
test("DWP nested transport cannot bypass closed request or changed intent validation before confirmation/signing",()=>{
  const dirs=fixtureDirs();try {
    keyFixture(dirs.directory);mkdirSync(join(dirs.repoRoot,"scratch"));for(const mutate of [r=>{r.intentSha256=r.approvalIntent.sha256;},r=>{r.approvalIntent.sha256="e".repeat(64);},r=>{r.packageSha256="f".repeat(64);},r=>{r.approvalIntent.value.decision="reject";}]){
      const request=nestedDwpSigningRequest();mutate(request);writeFileSync(join(dirs.repoRoot,"scratch","dwp-request-changed.json"),JSON.stringify(request));let confirmations=0,signs=0;
      assert.throws(()=>runHumanApproval(["sign-intent","--repo-root",dirs.repoRoot,"--directory",dirs.directory,"--request","scratch/dwp-request-changed.json"],{readConfirmation:()=>{confirmations++;return "approve";},spawn:()=>{signs++;throw Error("unexpected signing");}}),/design-workflow approval request does not bind a current, complete package/);assert.equal(confirmations,0);assert.equal(signs,0);assert.equal(existsSync(join(dirs.repoRoot,"scratch","dwp-proof-changed.json")),false);
    }
  }finally{cleanup(dirs);}
});

test("AC-19 inherited source signing disclosure binds every source and rejects drift", () => {
  const dirs = fixtureDirs();
  try {
    mkdirSync(join(dirs.repoRoot, "project"), { recursive: true });
    const subject = { schema: "pipeline.organization-architecture-config.v1", expectedPriorSha256: null,
      sources: [{ sourceId: "team-architecture", layer: "team", required: true,
        trustAnchor: { keyReference: "team-adr-key", publicKeySha256: "a".repeat(64) } }] };
    const intentSha256 = organizationArchitectureConfigIntentSha256(subject);
    const request = { schema: "pipeline.organization-architecture-config-request.v1", subject, intentSha256 };
    const disclosure = describeArchitectureInheritedSourcesRequest(request, intentSha256, dirs.repoRoot);
    assert.equal(disclosure.resolved, true);
    assert.match(disclosure.lines.join("\n"), /team-architecture \| team \| mandatory/u);
    assert.match(disclosure.lines.join("\n"), /does not sign the source contents/u);
    assert.equal(describeArchitectureInheritedSourcesRequest({ ...request,
      subject: { ...subject, sources: [{ ...subject.sources[0], required: false }] } }, intentSha256, dirs.repoRoot), null);
    assert.equal(describeArchitectureInheritedSourcesRequest({ ...request, unexplained: true }, intentSha256, dirs.repoRoot), null);
    writeFileSync(join(dirs.repoRoot, "project", "architecture-inherited-sources.json"), "changed\n");
    assert.equal(describeArchitectureInheritedSourcesRequest(request, intentSha256, dirs.repoRoot), null);
  } finally { cleanup(dirs); }
});

test("AC-19 sign-intent presents the exact inherited registry before signing", {
  skip: spawnSync("openssl", ["version"], { stdio: "pipe" }).status !== 0
    ? "requires the production OpenSSL binary" : false,
}, () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    mkdirSync(join(dirs.repoRoot, "scratch"), { recursive: true });
    mkdirSync(join(dirs.repoRoot, "project"), { recursive: true });
    const subject = { schema: "pipeline.organization-architecture-config.v1", expectedPriorSha256: null,
      sources: [{ sourceId: "organization-adrs", layer: "organization", required: true,
        trustAnchor: { keyReference: "org-adr-owner", publicKeySha256: "b".repeat(64) } }] };
    const intentSha256 = organizationArchitectureConfigIntentSha256(subject);
    const path = "scratch/architecture-inherited-sources-request-fixture.json";
    writeFileSync(join(dirs.repoRoot, path), `${JSON.stringify({
      schema: "pipeline.organization-architecture-config-request.v1", subject, intentSha256,
    })}\n`);
    const prompts = [];
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--request", path], disclosureChannel({
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
    }));
    assert.equal(result.ok, true);
    assert.equal(result.intentSha256, intentSha256);
    assert.match(prompts[0], /organization-adrs \| organization \| mandatory/u);
    assert.match(prompts[0], /does not sign the source contents/u);
  } finally { cleanup(dirs); }
});
import { PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA, portableAgyAuthorshipExportPath,
  portableAgyAuthorshipIntent, portableAgyAuthorshipRequest } from "../lib/portable-agy-authorship-export.mjs";
import { PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA, portableCriticExportRequest } from "../lib/portable-critic-export.mjs";
import { CRITICAL_ACTION_KINDS, criticalActionSubjectSha256, createCriticalActionApprovalRequest, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import {
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { MACHINE_PLANE_SCHEMA, readMachinePlane, writeMachinePlane } from "../lib/machine-plane.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
// Namespace import ON PURPOSE (same reason as in lib/guard-maintenance-window.test.mjs):
// a not-yet-existing named export must fail the checks that use it, not ESM linking for
// the whole suite.
import * as gmw from "../lib/guard-maintenance-window.mjs";
import { canonicalSha256, canonicalizeJson, sealGovernanceEvent } from "../lib/governance-event.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { appendPortableGovernanceEvent, readLocalRepositoryFingerprint, recoverPortableGovernanceProjection } from "../lib/governance-event-store.mjs";

/**
 * The ceremony's PRODUCTION signing path shells out to `openssl pkeyutl -sign`
 * (po-human-approval.mjs:923) on purpose: the operator's private key is handed
 * to openssl and never read into this process. Tests that drive a real signature
 * therefore need the binary, and are gated on it rather than rewritten against
 * node crypto -- reimplementing the signature here would test a different thing
 * than the one that ships.
 *
 * Under CI's runner-free Core Verify the PATH holds only node/git/bash/sh, so
 * those tests report a typed skip naming the missing tool instead of a wall of
 * assertions that read like a broken ceremony (backlog:
 * pipeline.core-verify-cannot-pass-under-the-ci-trimmed-path). Everything that
 * does NOT reach the real signature -- argument parsing, fail-closed paths,
 * confirmation cancellation, disclosure text, symlink refusals -- stays active
 * on every host, and the fixture keypairs no longer need openssl at all.
 */
const opensslProbe = spawnSync("openssl", ["version"], { stdio: "pipe" });
const REQUIRES_OPENSSL = opensslProbe.error != null || opensslProbe.status !== 0
  ? "requires the openssl binary, which is not on PATH (the ceremony's production signing path shells out to it)"
  : false;

/**
 * Fixture keypair generation, in exactly the encodings openssl produces:
 * unencrypted PKCS#8 (`genpkey -algorithm ED25519`) or, with a passphrase,
 * aes-256-cbc-encrypted PKCS#8 carrying the "ENCRYPTED PRIVATE KEY" armor that
 * `isPrivateKeyPassphraseProtected` reads (`genpkey -aes-256-cbc`); the public
 * half is SPKI either way (`pkey -pubout`).
 *
 * Generated through node:crypto rather than by shelling out, because CI's
 * runner-free Core Verify step trims PATH to node/git/bash/sh and an openssl
 * fixture call fails there with a bare assertion (backlog:
 * pipeline.core-verify-cannot-pass-under-the-ci-trimmed-path). This is FIXTURE
 * material only -- what production's `setup` generates and what `sign-intent`
 * accepts is untouched.
 */
function writeEd25519KeyPair(privateKeyPath, publicKeyPath, passphrase = null) {
  const privateKeyEncoding = passphrase === null
    ? { type: "pkcs8", format: "pem" }
    : { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding,
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(privateKeyPath, privateKey);
  writeFileSync(publicKeyPath, publicKey);
}

/**
 * Throwaway, unencrypted, test-only Ed25519 keypair placed directly in the fixture's
 * external directory. This is fine for a test fixture only because a test cannot
 * supply an interactive passphrase; it does not change what the real `setup`
 * command (untouched by this task) generates or accepts.
 */
function keyFixture(directory) {
  const privateKey = join(directory, "po-private.pem");
  const publicKey = join(directory, "po-public.pem");
  writeEd25519KeyPair(privateKey, publicKey);
  const publicKeyPem = readFileSync(publicKey, "utf8");
  // `authority` stays the exact 2-key {keyReference, publicKeySha256} shape every
  // trustPolicy consumer (verifyPoApprovalProof, verifyCriticalActionApprovalRequest)
  // checks with an EXACT key match -- SETUP-1's `humanName` is added only to the LOCAL
  // trust-policy.json this fixture writes to disk (the shape po-human-approval.mjs's own
  // setup/signIntentIntoProof reads and checks), never to the object tests use as a
  // trustPolicy, mirroring the production split between the local authority record and
  // the shared proof-verification contract.
  const authority = { keyReference: "sign-intent-test-key", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Test Operator" }, null, 2)}\n`);
  return { publicKeyPem, authority };
}

/**
 * NVA-SIGNONCE-1: a passphrase-protected Ed25519 keypair, generated the same way
 * `setup`'s fresh-key-creation branch generates one in production (`openssl
 * genpkey -algorithm ED25519 -aes-256-cbc`). The only difference from that real
 * command is `-pass pass:<passphrase>` supplying the passphrase non-interactively
 * -- fine for a throwaway test fixture only (per this dispatch's hazard note: the
 * real `sign-intent` command is never invoked against a real key directory from
 * this suite; signing below goes through `fakeSignSpawn`, never real OpenSSL).
 * The resulting PEM carries the "ENCRYPTED PRIVATE KEY" PKCS#8 armor
 * `isPrivateKeyPassphraseProtected` reads.
 */
function encryptedKeyFixture(directory, passphrase) {
  const privateKey = join(directory, "po-private.pem");
  const publicKey = join(directory, "po-public.pem");
  writeEd25519KeyPair(privateKey, publicKey, passphrase);
  const privateKeyPem = readFileSync(privateKey, "utf8");
  const publicKeyPem = readFileSync(publicKey, "utf8");
  const authority = { keyReference: "sign-intent-test-key-encrypted", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Test Operator" }, null, 2)}\n`);
  return { privateKeyPem, publicKeyPem, authority };
}

/**
 * NVA-SIGNONCE-1: intercepts exactly the `openssl pkeyutl -sign` call
 * `signIntentIntoProof` shells out to, and signs the digest itself via
 * `node:crypto` using the encrypted fixture key and the passphrase this fixture
 * already knows -- in-process, so the real interactive OpenSSL passphrase prompt
 * is never reached. Every other command this suite might reach (genpkey/pkey
 * during `setup`, not exercised by `sign-intent`) stays real, unmodified
 * `openssl`.
 */
/**
 * R7-6-T3 (D3, Spec 22.6): sign-intent's own pre-prompt probe (R7-6-F) spawns the bare name
 * openssl for a harmless version call and an Ed25519 sign/verify round trip with a throwaway key,
 * before the signing spawn. The spies below answer those probe calls with the healthy node:crypto
 * stub the R7-6 block already defines (r76Spy, exit 0, plausible stdout), so no existing case
 * depends on a real openssl on PATH and none of them changes what it asserts about the signing
 * spawn itself.
 */
function answerOpensslProbe(executable, args) {
  return r76Spy("healthy").spawn(executable, args);
}

function fakeSignSpawn(privateKeyPem, passphrase) {
  return (executable, args) => {
    // R7-6-T3 (D3): only the signing spawn (the one carrying the PO key path) is signed here with the
    // fixture key; every other openssl call -- the pre-prompt probe (version, throwaway Ed25519
    // sign/verify round trip) -- is answered by the healthy stub below, never by a real openssl.
    if (executable === "openssl" && args[0] === "pkeyutl" && args.some((entry) => /po-private\.pem/u.test(String(entry)))) {
      const inIndex = args.indexOf("-in");
      const outIndex = args.indexOf("-out");
      const rawInput = readFileSync(args[inIndex + 1]);
      const keyObject = createPrivateKey({ key: privateKeyPem, format: "pem", passphrase });
      const signature = sign(null, rawInput, keyObject);
      writeFileSync(args[outIndex + 1], signature);
      return { status: 0 };
    }
    if (executable === "openssl") return answerOpensslProbe(executable, args);
    const result = spawnSync(executable, args, { stdio: "pipe" });
    return { status: result.status };
  };
}

function fixtureDirs() {
  return {
    repoRoot: mkdtempSync(join(tmpdir(), "po-sign-intent-repo-")),
    directory: mkdtempSync(join(tmpdir(), "po-sign-intent-external-")),
  };
}

function cleanup({ repoRoot, directory }) {
  rmSync(repoRoot, { recursive: true, force: true });
  rmSync(directory, { recursive: true, force: true });
}

test("terminal-template PO setup producer preserves argv and independently reads authority", () => {
  const dirs = fixtureDirs();
  try {
    const produced = poHumanApprovalSetupCommand({
      repoRoot: dirs.repoRoot, directory: dirs.directory, humanName: "Test Operator",
      keyReference: "sign-intent-test-key", launcher: "/plugin/scripts/po-human-approval.mjs",
    });
    assert.deepEqual(produced.argv, [
      "/plugin/scripts/po-human-approval.mjs", "setup", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--human-name", "Test Operator",
      "--key-reference", "sign-intent-test-key",
    ]);
    keyFixture(dirs.directory);
    assert.deepEqual(
      Object.fromEntries(Object.entries(readPoHumanApprovalAuthority(dirs)).filter(([key]) => key !== "digest")),
      { status: "verified", schema: "pipeline.po-human-authority-readback.v1", code: "PO-HUMAN-AUTHORITY-READY" },
    );
  } finally { cleanup(dirs); }
});

/* ------------------------------------------------------------------ *
 * ADOPT-SIGN-T: `sign-intent --request` signs an adoption request file.
 * Encrypted PKCS#8 fixture key throughout (Ruling 78); signing goes through
 * fakeSignSpawn exactly as in NVA-SIGNONCE-1 below.
 * ------------------------------------------------------------------ */
import { setupAdoptionFixture as adoptSignSetupFixture } from "./architecture-adoption-test-fixture.mjs";
import { prepareAdoptionAuthority as adoptSignPrepare } from "../lib/architecture-adoption-authority.mjs";

/** A genuine pipeline.adoption-approval-request.v1, prepared in its own throwaway git-backed root. */
function adoptSignRequest() {
  const adoptionRoot = mkdtempSync(join(tmpdir(), "po-adopt-sign-root-"));
  try {
    adoptSignSetupFixture(adoptionRoot);
    return adoptSignPrepare({ rootDir: adoptionRoot, decision: "approved-scoped", scope: ["src/", "docs/adr/"], rationale: "Adoption signing fixture decision", decidedAt: "2026-01-01T00:00:00.000Z", expiresAt: null, reviewDate: null, decisionRef: "ADOPT-SIGN-FIXTURE-1" });
  } finally { rmSync(adoptionRoot, { recursive: true, force: true }); }
}

test("ADOPT-SIGN-T: sign-intent --request signs an adoption request by its intent.sha256, discloses the adoption and writes the --intent-sha256 proof shape", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "adopt-sign-fixture-passphrase";
    const { privateKeyPem, authority } = encryptedKeyFixture(dirs.directory, passphrase);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const request = adoptSignRequest();
    const intentSha256 = request.intent.sha256;
    assert.equal(request.schema, "pipeline.adoption-approval-request.v1");
    assert.match(intentSha256, /^[a-f0-9]{64}$/u);
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(join(scratchDir, "adoption-request-1.json"), `${JSON.stringify(request, null, 2)}\n`);
    const dependencies = {
      spawn: fakeSignSpawn(privateKeyPem, passphrase),
      readConfirmation: () => { throw new Error("readConfirmation must not be called for a passphrase-protected key"); },
      isTTY: true,
    };
    let result;
    const output = captureStdout(() => {
      result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/adoption-request-1.json"], dependencies);
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(result.intentSha256, intentSha256, "the signed digest is the request's intent.sha256");

    // The adoption itself is disclosed, read out of the request: not the generic opaque-digest fallback.
    assert.match(output, new RegExp(intentSha256, "u"), "the digest being signed must be disclosed");
    assert.ok(output.includes(request.subject.decisionRef), "the decision ref must be disclosed");
    assert.ok(output.includes(request.subject.decision), "the decision state must be disclosed");
    for (const entry of [].concat(request.subject.scope)) assert.ok(output.includes(entry), `scope entry ${entry} must be disclosed`);
    assert.doesNotMatch(output, /no recorded request resolves/u, "an adoption request must not fall back to the opaque-digest disclosure");

    // Same proof shape as the --intent-sha256 route, mirrored next to the request.
    const proof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    assert.deepEqual(Object.keys(proof).sort(), ["intentSha256", "keyReference", "publicKey", "schema", "signatureBase64"]);
    assert.equal(proof.schema, "pipeline.po-approval-proof.v1");
    assert.equal(proof.intentSha256, intentSha256);
    assert.equal(proof.keyReference, authority.keyReference);
    assert.ok(String(result.scratchProofPath).endsWith("adoption-proof-1.json"), "the proof must be mirrored next to the request");
    assert.deepEqual(JSON.parse(readFileSync(result.scratchProofPath, "utf8")), proof);
    const verified = verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof });
    assert.equal(verified.verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("ADOPT-SIGN-T: sign-intent --request refuses an adoption request whose intent.sha256 does not match, before any confirmation or signing", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "adopt-sign-fixture-passphrase";
    const { privateKeyPem } = encryptedKeyFixture(dirs.directory, passphrase);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const tampered = structuredClone(adoptSignRequest());
    tampered.intent.sha256 = "a".repeat(64);
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(join(scratchDir, "adoption-request-tampered.json"), `${JSON.stringify(tampered, null, 2)}\n`);
    const inner = fakeSignSpawn(privateKeyPem, passphrase);
    let signs = 0; let confirmations = 0;
    const dependencies = {
      spawn: (executable, args) => {
        if (executable === "openssl" && args[0] === "pkeyutl" && args.some((entry) => /po-private\.pem/u.test(String(entry)))) signs += 1;
        return inner(executable, args);
      },
      readConfirmation: () => { confirmations += 1; return "approve"; },
      isTTY: true,
    };
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/adoption-request-tampered.json"], dependencies),
      (error) => {
        assert.match(error.message, /adoption.*request does not bind/u, "the refusal must be adoption-specific, not the generic missing-field refusal");
        assert.doesNotMatch(error.message, /must carry an intentSha256 field/u);
        return true;
      },
    );
    assert.equal(signs, 0, "a mismatched request must never reach the signing spawn");
    assert.equal(confirmations, 0, "a mismatched request must be refused before any confirmation");
    assert.equal(existsSync(join(scratchDir, "adoption-proof-tampered.json")), false);
    assert.equal(existsSync(join(dirs.directory, `proof-${"a".repeat(64)}.json`)), false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * ADOPT-SIGN-T2: every refusal branch of the adoption describer, and the
 * disclosure's resistance to hostile free text. The describer is one
 * short-circuit chain, so each case re-derives ONLY the digests its edit
 * would otherwise trip first (adoptSignForged); the unedited control (T2-0)
 * proves the helper adds no difference of its own. A refusal must carry the
 * adoption-specific sentence and happen before any confirmation or signing
 * spawn (production: the `fail` precedes assertSigningReadyBeforePrompt and
 * the passphrase check).
 * ------------------------------------------------------------------ */
const adoptSha256 = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const ADOPT_NOT_BOUND = /the adoption approval request does not bind its exact subject and intent digest/u;
const ADOPT_ALL_REBOUND = { rebindSubject: true, carrySubjectHash: true, rebindIntent: true };
let adoptSignGenuineMemo = null;
const adoptSignGenuineRequest = () => (adoptSignGenuineMemo ??= adoptSignRequest());

/** Edits a copy of `request`, then re-derives only the digests named in the options. */
function adoptSignForged(request, mutate, { rebindSubject = false, carrySubjectHash = false, rebindIntent = false } = {}) {
  const forged = structuredClone(request);
  mutate(forged);
  if (rebindSubject) forged.subjectSha256 = adoptSha256(forged.subject);
  if (carrySubjectHash) forged.intent.value.subjectSha256 = forged.subjectSha256;
  if (rebindIntent) forged.intent.sha256 = adoptSha256(forged.intent.value);
  return forged;
}

/** A signing root with the request written under scratch/, and dependencies that count spawns and confirmations. */
function adoptSignSession(name, forged) {
  const dirs = fixtureDirs();
  const passphrase = "adopt-sign-fixture-passphrase";
  const { privateKeyPem } = encryptedKeyFixture(dirs.directory, passphrase);
  anchorFixtureKey(dirs.repoRoot, dirs.directory);
  const scratchDir = join(dirs.repoRoot, "scratch");
  mkdirSync(scratchDir, { recursive: true });
  writeFileSync(join(scratchDir, `adoption-request-${name}.json`), `${JSON.stringify(forged, null, 2)}\n`);
  const inner = fakeSignSpawn(privateKeyPem, passphrase);
  const seen = { spawns: 0, confirmations: 0 };
  const dependencies = {
    spawn: (executable, args) => { seen.spawns += 1; return inner(executable, args); },
    readConfirmation: () => { seen.confirmations += 1; return "approve"; },
    isTTY: true,
  };
  const argv = ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", `scratch/adoption-request-${name}.json`];
  return { dirs, scratchDir, seen, dependencies, argv };
}

test("ADOPT-SIGN-T2-0: control: re-deriving every digest of an unedited adoption request reproduces them exactly", () => {
  const genuine = adoptSignGenuineRequest();
  assert.deepEqual(adoptSignForged(genuine, () => {}, ADOPT_ALL_REBOUND), genuine);
});

for (const [id, label, mutate, rebind] of [
  ["1", "an extra top-level key", (r) => { r.note = "extra"; }, {}],
  ["2", "an extra key inside intent", (r) => { r.intent.note = "extra"; }, {}],
  ["3", "an intent value edited while intent.sha256 is kept", (r) => { r.intent.value.note = "edited"; }, {}],
  ["4", "a subject edited while subjectSha256 is kept", (r) => { r.subject.rationale = "edited after hashing"; }, {}],
  ["5", "a subject swapped consistently while the intent still carries the old subject hash", (r) => { r.subject.rationale = "a different rationale"; }, { rebindSubject: true }],
  ["6", "the wrong intent kind", (r) => { r.intent.value.kind = "architecture-adoption-other"; }, { rebindIntent: true }],
  ["7", "the wrong policy revision", (r) => { r.intent.value.policyRevision = "adoption-authority-v0"; }, { rebindIntent: true }],
  ["8", "a decision that disagrees between the subject and the intent", (r) => { r.subject.decision = r.subject.decision === "deferred" ? "partial" : "deferred"; }, ADOPT_ALL_REBOUND],
  ["9", "a candidate that disagrees between the subject and the intent", (r) => { r.subject.candidate = { ...r.subject.candidate, commit: "b".repeat(40) }; }, ADOPT_ALL_REBOUND],
]) {
  test(`ADOPT-SIGN-T2-${id}: sign-intent --request refuses ${label} before any confirmation or signing`, () => {
    const name = `t2-${id}`;
    const forged = adoptSignForged(adoptSignGenuineRequest(), mutate, rebind);
    const { dirs, scratchDir, seen, dependencies, argv } = adoptSignSession(name, forged);
    try {
      assert.throws(() => runHumanApproval(argv, dependencies), (error) => {
        assert.match(error.message, ADOPT_NOT_BOUND, "the refusal must be the adoption-specific sentence");
        return true;
      });
      assert.equal(seen.spawns, 0, "a non-binding request must never reach a spawn (no key-using process at all)");
      assert.equal(seen.confirmations, 0, "a non-binding request must be refused before any confirmation");
      assert.equal(existsSync(join(scratchDir, `adoption-proof-${name}.json`)), false);
      assert.equal(existsSync(join(scratchDir, `adoption-signer-${name}.json`)), false);
      assert.equal(existsSync(join(dirs.directory, `proof-${forged.intent.sha256}.json`)), false);
    } finally {
      cleanup(dirs);
    }
  });
}

test("ADOPT-SIGN-T2-10: a hostile decision ref, rationale and scope entry cannot inject a disclosure line", () => {
  const hostile = {
    decisionRef: "REF-1\nINJECTED: decision: deferred",
    rationale: `fine\naction: wipe everything\r\nINJECTED: candidate commit: ${"f".repeat(40)}`,
    scope: ["src/", "docs/\nINJECTED: scope: everything", "x\rINJECTED: request mode: signature"],
  };
  const forged = adoptSignForged(adoptSignGenuineRequest(), (r) => {
    r.subject.decisionRef = hostile.decisionRef;
    r.subject.rationale = hostile.rationale;
    r.subject.scope = hostile.scope;
  }, ADOPT_ALL_REBOUND);
  const { dirs, seen, dependencies, argv } = adoptSignSession("t2-10", forged);
  try {
    let result;
    const output = captureStdout(() => { result = runHumanApproval(argv, dependencies); });
    assert.equal(result.ok, true, "a self-consistent request with hostile free text is still signable: the defence is in the rendering");
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(seen.confirmations, 0);
    const lines = output.split(/\r\n|\r|\n/u);
    assert.equal(lines.filter((line) => /^\W*action:/u.test(line)).length, 1, "the hostile text must not add an action line of its own");
    const injected = lines.filter((line) => line.includes("INJECTED"));
    assert.equal(injected.length, 4, "each hostile string stays on its own single disclosure line");
    for (const line of injected) assert.match(line, /^\W*(decision ref|rationale|scope): "/u, "a hostile string may appear only inside its own quoted, escaped line");
    assert.ok(output.includes(`decision ref: ${JSON.stringify(hostile.decisionRef)}`));
    assert.ok(output.includes(`rationale: ${JSON.stringify(hostile.rationale.trim())}`));
    for (const entry of hostile.scope) assert.ok(output.includes(`scope: ${JSON.stringify(entry)}`), `scope entry ${JSON.stringify(entry)} must be disclosed escaped`);
  } finally {
    cleanup(dirs);
  }
});

const PO_APPROVAL_DIRECTORY_ENV = "PIPELINE_PO_APPROVAL_DIRECTORY";

// SETUP-2b: this repository's own gitignored scratch/ tree, never system tmpdir and
// never the real $HOME -- every test that reaches the new machine-plane consultation
// (any call omitting --directory) must inject a fixture home, per the briefing's field-4
// constraint that nothing here ever reads or writes the real ~/.agent-pipeline/.
const SCRATCH_ROOT = fileURLToPath(new URL("../../../scratch/", import.meta.url));

/** A fixture home directory with no machine plane at all, so readMachinePlane()
 * resolves "absent" and the PODIR-1 (env-only) tests below observe exactly the
 * behaviour they did before this task. */
function noMachinePlaneHomeFixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  return mkdtempSync(join(SCRATCH_ROOT, "po-human-approval-no-plane-home-"));
}

/** A fixture home directory carrying a valid machine plane with the given
 * poKeyDirectory, written through the library's own writer (never hand-assembled
 * JSON) so the fixture matches the real on-disk contract. */
function machinePlaneHomeFixture(poKeyDirectory) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const home = mkdtempSync(join(SCRATCH_ROOT, "po-human-approval-plane-home-"));
  writeMachinePlane({
    schema: MACHINE_PLANE_SCHEMA,
    poKeyDirectory,
    pushApprovalDefault: "chat",
    routing: null,
    language: null,
    session: null,
    usage: null,
    updatedAt: new Date().toISOString(),
  }, { homedirFn: () => home });
  return home;
}

/** Runs `fn` with PIPELINE_PO_APPROVAL_DIRECTORY set to `value` (or removed for `undefined`),
 * restoring whatever the ambient environment had before, regardless of outcome. */
function withEnvDirectory(value, fn) {
  const had = Object.hasOwn(process.env, PO_APPROVAL_DIRECTORY_ENV);
  const previous = process.env[PO_APPROVAL_DIRECTORY_ENV];
  if (value === undefined) delete process.env[PO_APPROVAL_DIRECTORY_ENV];
  else process.env[PO_APPROVAL_DIRECTORY_ENV] = value;
  try { return fn(); }
  finally {
    if (had) process.env[PO_APPROVAL_DIRECTORY_ENV] = previous;
    else delete process.env[PO_APPROVAL_DIRECTORY_ENV];
  }
}

/** Captures a thrown error instead of letting it propagate, so its message can be inspected. */
function thrown(fn) {
  try { fn(); return null; } catch (error) { return error; }
}

/**
 * `setup`'s fresh-key-creation branch shells out to a real, interactive
 * `openssl genpkey -aes-256-cbc` that blocks on a passphrase this test cannot
 * supply. This fake `spawn` dependency intercepts that call and generates an
 * unencrypted key at the same `-out` path instead (fine for a test-only key that
 * is discarded with the fixture directory).
 *
 * It intercepts the following `pkey -pubout` too. That call needs no passphrase
 * and used to run through to real openssl unmodified, which made the whole test
 * depend on the binary being installed -- and under CI's runner-free Core Verify
 * the PATH holds only node/git/bash/sh (backlog:
 * pipeline.core-verify-cannot-pass-under-the-ci-trimmed-path). Deriving the
 * public half in-process is the same operation on the same key material, so the
 * interception widens by one command without weakening what is exercised: what
 * `setup` itself does with the resulting files is untouched.
 */
function fakeSetupSpawn(executable, args) {
  if (executable === "openssl" && args[0] === "genpkey") {
    const outIndex = args.indexOf("-out");
    // TR-S1-T3: the real command is `genpkey -aes-256-cbc`, so the stand-in key is encrypted too
    // (LEVER_PASSPHRASE, the one the central lever signs with).
    const { privateKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: LEVER_PASSPHRASE },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(args[outIndex + 1], privateKey);
    return { status: 0 };
  }
  if (executable === "openssl" && args[0] === "pkey" && args.includes("-pubout")) {
    const inPath = args[args.indexOf("-in") + 1];
    const outPath = args[args.indexOf("-out") + 1];
    // TR-S1-T3: an encrypted key is read with the `-passin` the lever appended, else LEVER_PASSPHRASE.
    const passinIndex = args.indexOf("-passin");
    const pem = readFileSync(inPath, "utf8");
    const publicKey = createPublicKey(createPrivateKey(pem.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----")
      ? { key: pem, format: "pem", passphrase: passinIndex >= 0 ? String(args[passinIndex + 1]).replace(/^pass:/u, "") : LEVER_PASSPHRASE }
      : pem))
      .export({ type: "spki", format: "pem" });
    writeFileSync(outPath, publicKey);
    return { status: 0 };
  }
  if (executable === "openssl") return answerOpensslProbe(executable, args);
  const result = spawnSync(executable, args, { stdio: "pipe" });
  return { status: result.status };
}

function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  let captured = "";
  process.stdout.write = (chunk, ...rest) => { captured += chunk; return original(chunk, ...rest); };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

test("setup fresh-key creation with a custom --key-reference prints the H-AC-11 O-4 privacy nudge", () => {
  const dirs = fixtureDirs();
  try {
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name", "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.authority.keyReference, "roa-full-name");
      assert.equal("recovered" in result, false);
    });
    assert.match(output, /--key-reference/u);
    assert.match(output, /H-AC-11 O-4/u);
  } finally {
    cleanup(dirs);
  }
});

test("setup fresh-key creation with the default --key-reference (local-po-key) does not print the nudge", () => {
  const dirs = fixtureDirs();
  try {
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.authority.keyReference, "local-po-key");
    });
    assert.equal(output, "");
  } finally {
    cleanup(dirs);
  }
});

test("setup's recovered branch (private+public key exist, no authority yet) does not print the nudge even with a custom --key-reference", () => {
  const dirs = fixtureDirs();
  try {
    // First run creates the key pair with the default reference; drop the
    // authority file it wrote so the next `setup` call takes the "recovered"
    // branch (privateKey && publicKey && !authority).
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
    rmSync(join(dirs.directory, "trust-policy.json"), { force: true });
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name", "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.recovered, true);
      assert.equal(result.authority.keyReference, "roa-full-name");
    });
    assert.equal(output, "");
  } finally {
    cleanup(dirs);
  }
});

// NVA-CF-KEYBOOTSTRAP (backlog: pipeline.onboarding-has-no-happy-path-for-an-
// existing-signing-key.md): --existing-key registers an already-existing key file
// (not yet known to this machine's --directory) as the trust anchor in ONE call --
// no separate manual repair step, no agent loop reconciling a half-registered
// state. `fakeSetupSpawn` already fakes the exact `pkey -in ... -pubout -out ...`
// shape this branch shells out to (the same interception the fresh-generation
// tests above already rely on), so this needs no new spawn fake.
test("NVA-CF-KEYBOOTSTRAP: setup --existing-key registers a pre-existing key file as the trust anchor with zero repair-command detours", () => {
  const dirs = fixtureDirs();
  const existingKeyDir = mkdtempSync(join(tmpdir(), "po-existing-key-source-"));
  try {
    // Simulate a key the PO already has on their machine, from before this
    // repository (or this --directory) ever existed -- generated independently of
    // po-human-approval.mjs's own genpkey call.
    const { privateKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const existingKeyPath = join(existingKeyDir, "already-had-this.pem");
    writeFileSync(existingKeyPath, privateKey);

    const result = runHumanApproval([
      "setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--existing-key", existingKeyPath, "--human-name", "Test Operator",
    ], { spawn: fakeSetupSpawn });

    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-AUTHORITY-READY");
    assert.equal(result.imported, true);
    assert.equal(result.authority.humanName, "Test Operator");
    assert.equal(result.authority.keyReference, "local-po-key");
    // The registered public key material actually matches the imported private key
    // -- not merely "some key got written somewhere".
    const registeredPublicKey = readFileSync(result.paths.publicKey, "utf8");
    const expectedPublicKey = createPublicKey(createPrivateKey(privateKey)).export({ type: "spki", format: "pem" });
    assert.equal(registeredPublicKey, expectedPublicKey);
    // No leftover repair step: the trust-policy authority file is immediately
    // usable, exactly like the fresh-generation branch's own output shape.
    const authorityOnDisk = JSON.parse(readFileSync(result.paths.authority, "utf8"));
    assert.equal(authorityOnDisk.publicKeySha256, result.authority.publicKeySha256);
  } finally {
    cleanup(dirs);
    rmSync(existingKeyDir, { recursive: true, force: true });
  }
});

test("NVA-CF-KEYBOOTSTRAP: setup --existing-key refuses to overwrite key material already present at --directory", () => {
  const dirs = fixtureDirs();
  const existingKeyDir = mkdtempSync(join(tmpdir(), "po-existing-key-source-"));
  try {
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
    const { privateKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const existingKeyPath = join(existingKeyDir, "already-had-this.pem");
    writeFileSync(existingKeyPath, privateKey);
    const error = thrown(() => runHumanApproval([
      "setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--existing-key", existingKeyPath, "--human-name", "Test Operator",
    ], { spawn: fakeSetupSpawn }));
    assert.match(error.message, /already carries key material/u);
  } finally {
    cleanup(dirs);
    rmSync(existingKeyDir, { recursive: true, force: true });
  }
});

test("NVA-CF-KEYBOOTSTRAP: setup --existing-key refuses cleanly when the named path does not exist", () => {
  const dirs = fixtureDirs();
  try {
    const error = thrown(() => runHumanApproval([
      "setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--existing-key", join(dirs.directory, "nope.pem"), "--human-name", "Test Operator",
    ], { spawn: fakeSetupSpawn }));
    assert.match(error.message, /--existing-key path does not exist/u);
  } finally {
    cleanup(dirs);
  }
});

test("setup's already-exists branch (matching trust policy already present) does not print the nudge even with a custom --key-reference", () => {
  const dirs = fixtureDirs();
  try {
    // First run creates the key pair and an authority bound to a custom
    // reference; a second `setup` call with the SAME reference must take the
    // "already exists" branch (all three present, values match).
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name", "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name"], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.recovered, false);
      assert.equal(result.authority.keyReference, "roa-full-name");
    });
    assert.equal(output, "");
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent fails closed before setup (no key material present)", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "a".repeat(64)], {}),
      /run setup before sign-intent/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent rejects an invalid --intent-sha256 (wrong length / non-hex)", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "z".repeat(64)], {}),
      /Usage:/,
      "non-hex characters must be rejected",
    );
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "a".repeat(63)], {}),
      /Usage:/,
      "wrong length must be rejected",
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent signs a digest end-to-end with a real OpenSSL round trip and the proof verifies, after an accepted confirmation naming the digest", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    const { publicKeyPem, authority } = keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-fixture").digest("hex");
    const confirmationPrompts = [];
    const dependencies = disclosureChannel({ readConfirmation: (prompt) => { confirmationPrompts.push(prompt); return "approve"; } });
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies);
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(result.intentSha256, intentSha256);
    // SETUP-1: the signer is recorded on every approval -- keyReference, publicKeySha256
    // and the human-supplied name, all present in this accepting case.
    assert.equal(result.signer.keyReference, authority.keyReference);
    assert.equal(result.signer.publicKeySha256, authority.publicKeySha256);
    assert.equal(result.signer.humanName, "Test Operator");
    const signerOnDisk = JSON.parse(readFileSync(result.paths.signer, "utf8"));
    assert.deepEqual(signerOnDisk, result.signer);

    assert.equal(confirmationPrompts.length, 1, "sign-intent must present exactly one disclosure before signing (Ruling 83: on the encrypted path it arrives on stdout, not through a typed prompt)");
    assert.match(confirmationPrompts[0], new RegExp(intentSha256, "u"), "the disclosure must name the exact digest being authorized");
    assert.match(confirmationPrompts[0], /guard-lift\/guard-override/u, "the disclosure must state the generic consequence class");
    // TR-S1-T4 (Ruling 78(b), :634 note): the typed-token instruction assertion is gone -- the encrypted path prints no confirmation.

    const proofPath = join(dirs.directory, `proof-${intentSha256}.json`);
    // NVA-CLI-FEEDBACK-1: the success result states the absolute paths it just
    // wrote, so an operator/agent never has to guess or poll for them.
    assert.deepEqual(result.paths, { proof: proofPath, signer: join(dirs.directory, `signer-${intentSha256}.json`) });
    assert.equal(existsSync(proofPath), true);
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(proof.schema, PO_APPROVAL_PROOF_SCHEMA);
    assert.equal(proof.intentSha256, intentSha256);
    assert.equal(proof.keyReference, authority.keyReference);
    assert.equal(proof.publicKey, publicKeyPem);
    assert.equal(typeof proof.signatureBase64, "string");

    const verified = verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof });
    assert.equal(verified.verified, true);
    assert.equal(verified.code, "PO-APPROVAL-PROOF-VERIFIED");

    // Temp signing artifacts are cleaned up in a `finally`; only the durable proof remains.
    assert.equal(existsSync(join(dirs.directory, `intent-${intentSha256}.txt`)), false);
    assert.equal(existsSync(join(dirs.directory, `signature-${intentSha256}.bin`)), false);

    // A second, distinct digest creates a new immutable artifact pair and does
    // not disturb the first proof or the shared key material.
    const otherIntentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-fixture-2").digest("hex");
    const secondResult = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", otherIntentSha256], dependencies);
    assert.notEqual(secondResult.paths.proof, proofPath);
    const firstProofAfterSecondSignature = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.deepEqual(firstProofAfterSecondSignature, proof);
    const secondProof = JSON.parse(readFileSync(secondResult.paths.proof, "utf8"));
    assert.equal(secondProof.intentSha256, otherIntentSha256);
    const secondVerified = verifyPoApprovalProof({ intent: { sha256: otherIntentSha256 }, trustPolicy: authority, proof: secondProof });
    assert.equal(secondVerified.verified, true);
  } finally {
    cleanup(dirs);
  }
});

// NVA-SWEEP-F2 (backlog/items/2026-08-16-gmw-reconcile-still-needs-a-manual-copy-after-
// the-po-signs.md, direction b): `--request` collapses the two manual `cp` steps the PO
// previously ran around a GMW/HGO reconcile sign-intent into the same command that signs
// -- reading the digest straight out of this repository's own scratch/ tree and mirroring
// the resulting proof/signer back into scratch/ next to the request, so the requesting
// agent session finds them on its own next turn with no PO-run copy step in between.
test("NVA-SWEEP-F2: sign-intent --request reads the digest from a repo-root scratch/ file and mirrors the proof/signer back into scratch/ next to it, with no external-directory copy in between", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.gmw-reconcile-request-fixture").digest("hex");
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    const requestPath = join(scratchDir, "reconcile-request-42.json");
    writeFileSync(requestPath, `${JSON.stringify({ intentSha256 }, null, 2)}\n`);
    const dependencies = { readConfirmation: () => "approve" };
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/reconcile-request-42.json"],
      dependencies,
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(result.intentSha256, intentSha256);

    const externalProof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    const externalSigner = JSON.parse(readFileSync(result.paths.signer, "utf8"));

    const scratchProofPath = join(scratchDir, "reconcile-proof-42.json");
    const scratchSignerPath = join(scratchDir, "reconcile-signer-42.json");
    assert.equal(result.scratchProofPath, scratchProofPath);
    assert.equal(result.scratchSignerPath, scratchSignerPath);
    // NVA-CLI-FEEDBACK-1: the nested `paths` field carries the same
    // information as the pre-existing top-level fields, plus the external
    // durable proof/signer paths -- additive, never a replacement.
    assert.deepEqual(result.paths, {
      proof: join(dirs.directory, `proof-${intentSha256}.json`),
      signer: join(dirs.directory, `signer-${intentSha256}.json`),
      scratchProofPath,
      scratchSignerPath,
    });
    assert.deepEqual(JSON.parse(readFileSync(scratchProofPath, "utf8")), externalProof);
    assert.deepEqual(JSON.parse(readFileSync(scratchSignerPath, "utf8")), externalSigner);
    assert.equal(externalSigner.keyReference, authority.keyReference);

    const verified = verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof: externalProof });
    assert.equal(verified.verified, true);
  } finally {
    cleanup(dirs);
  }
});

function portableAgySigningFixture() {
  const subject = { schema: PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA,
    purpose: "portable-agy-authorship", taskId: "AGY-SIGN-1", runner: "antigravity",
    model: "gemini-flash", effort: "high", candidateCommit: "a".repeat(40),
    authoredCommit: "b".repeat(40), authoredTree: "c".repeat(40), parentCommit: "a".repeat(40),
    changedPaths: ["src/feature.mjs"], routePolicySha256: "d".repeat(64),
    consentSubjectSha256: "e".repeat(64), consentRecordSha256: "f".repeat(64),
    resultSha256: "1".repeat(64), reportSha256: "2".repeat(64),
    recordSha256: "3".repeat(64), hostReceiptSha256: "4".repeat(64), localVerdict: "bound" };
  return portableAgyAuthorshipRequest({ ok: true,
    path: portableAgyAuthorshipExportPath(subject.taskId), subject,
    approvalIntent: portableAgyAuthorshipIntent(subject) });
}

test("sign-intent discloses the exact redacted Agy authorship export and its non-attestation boundary", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const request = portableAgySigningFixture();
    const path = "scratch/agy-authorship-export-request-fixture.json";
    mkdirSync(join(dirs.repoRoot, "scratch"), { recursive: true });
    writeFileSync(join(dirs.repoRoot, path), `${JSON.stringify(request)}\n`);
    const prompts = [];
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--request", path],
    disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
      checkPortableAgyAuthorshipRequest: () => true }));
    assert.equal(result.ok, true);
    assert.equal(result.intentSha256, request.intentSha256);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /AGY-SIGN-1/u);
    assert.ok(prompts[0].includes(request.subject.authoredCommit));
    assert.ok(prompts[0].includes(request.subject.model));
    assert.ok(prompts[0].includes(request.exportPath));
    assert.match(prompts[0], /NOT cryptographic provider model attestation/u);
  } finally { cleanup(dirs); }
});

test("sign-intent rejects a tampered portable Agy request before signing", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const request = portableAgySigningFixture();
    request.subject.model = "forged-model";
    const path = "scratch/agy-authorship-export-request-tampered.json";
    mkdirSync(join(dirs.repoRoot, "scratch"), { recursive: true });
    writeFileSync(join(dirs.repoRoot, path), `${JSON.stringify(request)}\n`);
    assert.throws(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--request", path],
    { readConfirmation: () => "approve" }), /does not bind its exact subject and intent digest/u);
  } finally { cleanup(dirs); }
});

test("sign-intent refuses a well-shaped portable Agy request without local host and Critic PASS", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const request = portableAgySigningFixture();
    const path = "scratch/agy-authorship-export-request-unbacked.json";
    mkdirSync(join(dirs.repoRoot, "scratch"), { recursive: true });
    writeFileSync(join(dirs.repoRoot, path), `${JSON.stringify(request)}\n`);
    assert.throws(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--request", path],
    { readConfirmation: () => { throw new Error("confirmation must not run"); } }),
    /not bound to a current local host and Critic PASS/u);
    assert.equal(existsSync(join(dirs.repoRoot, "scratch", "agy-authorship-export-proof-unbacked.json")), false);
  } finally { cleanup(dirs); }
});

function portableCriticSigningFixture() {
  const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
  const subject = { schema: PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA,
    purpose: "product-capability-final", inventoryPath: "docs/product-capability-inventory.json",
    candidate, producer: { kind: "consumed-session-critic", packetId: "c".repeat(32),
      packetDigest: "d".repeat(64), receiptSha256: "e".repeat(64), verdictSha256: "f".repeat(64),
      reviewRange: { base: "0".repeat(40), commit: candidate.commit, diffSha256: "1".repeat(64) },
      reviewPass: true } };
  const approvalIntent = createPoApprovalIntent({ kind: "critic-export", featureId: "sprint-alfred-epic",
    planSha256: "2".repeat(64), specSha256: "3".repeat(64), candidate,
    policyRevision: "v1", subjectSha256: createHash("sha256").update(canonical(subject)).digest("hex"),
    decision: "approve" });
  return portableCriticExportRequest({ subject, approvalIntent });
}

test("sign-intent discloses a bound portable Critic export and no release authority", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const request = portableCriticSigningFixture();
    const path = "scratch/portable-critic-export-request-fixture.json";
    mkdirSync(join(dirs.repoRoot, "scratch"), { recursive: true });
    writeFileSync(join(dirs.repoRoot, path), `${JSON.stringify(request)}\n`);
    const prompts = [];
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--request", path],
    disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
      checkPortableCriticExportRequest: () => true }));
    assert.equal(result.ok, true);
    assert.equal(result.intentSha256, request.intentSha256);
    assert.equal(prompts.length, 1);
    assert.ok(prompts[0].includes(request.subject.candidate.commit));
    assert.ok(prompts[0].includes(request.subject.producer.packetId));
    assert.ok(prompts[0].includes(request.exportPath));
    assert.match(prompts[0], /does not approve source changes, a release, a push/u);
  } finally { cleanup(dirs); }
});

test("sign-intent rejects a changed or unbacked portable Critic request before signing", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const request = portableCriticSigningFixture();
    const path = "scratch/portable-critic-export-request-fixture.json";
    mkdirSync(join(dirs.repoRoot, "scratch"), { recursive: true });
    request.subject.producer.verdictSha256 = "4".repeat(64);
    writeFileSync(join(dirs.repoRoot, path), `${JSON.stringify(request)}\n`);
    assert.throws(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--request", path],
    { readConfirmation: () => { throw new Error("must not ask for approval"); } }),
    /portable Critic export request does not bind its exact subject/u);
    const valid = portableCriticSigningFixture();
    writeFileSync(join(dirs.repoRoot, path), `${JSON.stringify(valid)}\n`);
    assert.throws(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot,
      "--directory", dirs.directory, "--request", path],
    { readConfirmation: () => { throw new Error("must not ask for approval"); } }),
    /not bound to a current consumed private Critic review/u);
  } finally { cleanup(dirs); }
});

test("sign-intent discloses the exact reviewed PRD, specification, and checkpoint for a bootstrap acknowledgement request", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const action = {
      kind: "bootstrap-plan-acknowledgement",
      decision: "content-sound-and-spec-consistent",
      root: dirs.repoRoot,
      featureId: "greenfield-42",
      checkpoint: { revision: 7, sha256: "a".repeat(64) },
      prd: { path: "specs/greenfield-42/prd.md", sha256: "b".repeat(64) },
      spec: { path: "specs/greenfield-42/spec.md", sha256: "c".repeat(64) },
    };
    const intentSha256 = createHash("sha256").update(JSON.stringify(action, Object.keys(action).sort())).digest("hex");
    // The implementation's canonical digest is deliberately not JSON.stringify
    // order dependent; request the real digest through a locally equivalent,
    // sorted canonical encoder so the signer cannot receive a fabricated view.
    const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
      : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
      : JSON.stringify(value);
    const exactIntent = createHash("sha256").update(canonical(action)).digest("hex");
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(join(scratchDir, `bootstrap-plan-acknowledgement-request-${exactIntent}.json`), `${JSON.stringify({
      schema: "pipeline.bootstrap-plan-acknowledgement-request.v1", intentSha256: exactIntent, action,
    }, null, 2)}\n`);
    const prompts = [];
    const result = runHumanApproval([
      "sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--request", `scratch/bootstrap-plan-acknowledgement-request-${exactIntent}.json`,
    ], disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }));
    assert.equal(result.ok, true);
    assert.equal(prompts.length, 1);
    const [prompt] = prompts;
    assert.ok(prompt.includes(action.prd.path) && prompt.includes(action.prd.sha256));
    assert.ok(prompt.includes(action.spec.path) && prompt.includes(action.spec.sha256));
    assert.ok(prompt.includes("revision 7") && prompt.includes(action.checkpoint.sha256));
    assert.ok(prompt.includes("content-sound and consistent"));
    assert.equal(intentSha256.length, 64, "sanity check: unrelated JSON ordering digest is not authority");
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent rejects a bootstrap acknowledgement request whose displayed action and intent digest disagree", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const action = {
      kind: "bootstrap-plan-acknowledgement",
      decision: "content-sound-and-spec-consistent",
      root: dirs.repoRoot,
      featureId: "greenfield-tampered",
      checkpoint: { revision: 7, sha256: "a".repeat(64) },
      prd: { path: "specs/greenfield-tampered/prd.md", sha256: "b".repeat(64) },
      spec: { path: "specs/greenfield-tampered/spec.md", sha256: "c".repeat(64) },
    };
    const tamperedIntent = "d".repeat(64);
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    const requestPath = `scratch/bootstrap-plan-acknowledgement-request-${tamperedIntent}.json`;
    writeFileSync(join(dirs.repoRoot, requestPath), `${JSON.stringify({
      schema: "pipeline.bootstrap-plan-acknowledgement-request.v1", intentSha256: tamperedIntent, action,
    }, null, 2)}\n`);
    assert.throws(
      () => runHumanApproval([
        "sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--request", requestPath,
      ], { readConfirmation: () => "approve" }),
      /bootstrap acknowledgement request does not bind its exact action and intent digest/,
    );
    assert.equal(existsSync(join(scratchDir, `bootstrap-plan-acknowledgement-proof-${tamperedIntent}.json`)), false);
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SWEEP-F2: sign-intent --request is rejected outside this repository's own scratch/ tree", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const outsideDir = join(dirs.repoRoot, "not-scratch");
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, "reconcile-request-1.json"), `${JSON.stringify({ intentSha256: "a".repeat(64) }, null, 2)}\n`);
    assert.throws(
      () => runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "not-scratch/reconcile-request-1.json"],
        { readConfirmation: () => "approve" },
      ),
      /--request must be a path inside this repository's own scratch\/ directory/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SWEEP-F2: sign-intent rejects supplying both --intent-sha256 and --request, and rejects supplying neither", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "a".repeat(64), "--request", "scratch/reconcile-request-1.json"],
        {},
      ),
      /Usage:/,
      "both flags together must be rejected",
    );
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], {}),
      /Usage:/,
      "neither flag must be rejected",
    );
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SWEEP-F2: sign-intent --request fails closed on malformed JSON, a missing intentSha256 field, and a basename that cannot derive a sibling proof/signer name", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    const dependencies = { readConfirmation: () => "approve" };

    writeFileSync(join(scratchDir, "reconcile-request-bad.json"), "not json");
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/reconcile-request-bad.json"], dependencies),
      /--request must contain valid JSON/,
    );

    writeFileSync(join(scratchDir, "reconcile-request-missing.json"), `${JSON.stringify({ other: "field" }, null, 2)}\n`);
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/reconcile-request-missing.json"], dependencies),
      /--request JSON must carry an intentSha256 field/,
    );

    writeFileSync(join(scratchDir, "unnamed-42.json"), `${JSON.stringify({ intentSha256: "a".repeat(64) }, null, 2)}\n`);
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/unnamed-42.json"], dependencies),
      /must contain "request" so sibling proof\/signer paths can be derived/,
    );
  } finally {
    cleanup(dirs);
  }
});

// NVA-SWEEP-F2f-REWORK (Critic finding 1): the same symlink/hardlink hardening
// artifactPath() already applies to every other write target of this command must also
// cover the two new scratch/ mirror write targets, and the --request READ path must be
// symmetrically hardened against a symlink pointing outside the repository's scratch/
// tree. Both fixture symlinks below point at a file OUTSIDE the repository (a separate
// tmpdir, never `dirs.repoRoot`/`dirs.directory`), so each test removes that tmpdir
// itself in its own `finally` -- `cleanup()` only knows about the two `fixtureDirs()`
// paths and would otherwise leave a dangling symlink target behind.
test("NVA-SWEEP-F2f-REWORK: sign-intent --request refuses to follow a symlink planted at the derived scratch proof/signer sibling path", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  const outsideDir = mkdtempSync(join(tmpdir(), "po-sign-intent-outside-target-"));
  try {
    keyFixture(dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.gmw-reconcile-symlink-sibling-fixture").digest("hex");
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    const requestPath = join(scratchDir, "reconcile-request-99.json");
    writeFileSync(requestPath, `${JSON.stringify({ intentSha256 }, null, 2)}\n`);

    const victimPath = join(outsideDir, "victim.json");
    writeFileSync(victimPath, "original content, must not be overwritten");
    // Plant a symlink at the exact DERIVED sibling path, pointing outside the repository.
    symlinkSync(victimPath, join(scratchDir, "reconcile-proof-99.json"));

    assert.throws(
      () => runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/reconcile-request-99.json"],
        { readConfirmation: () => "approve" },
      ),
      /scratch mirror artifacts must be unlinked regular files/,
    );
    assert.equal(readFileSync(victimPath, "utf8"), "original content, must not be overwritten", "the symlink target outside the repository must not be overwritten");
  } finally {
    cleanup(dirs);
    rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("NVA-SWEEP-F2f-REWORK: sign-intent --request rejects a symlink planted at the --request path itself, pointing outside scratch/", () => {
  const dirs = fixtureDirs();
  const outsideDir = mkdtempSync(join(tmpdir(), "po-sign-intent-outside-request-"));
  try {
    keyFixture(dirs.directory);
    const outsideRequestPath = join(outsideDir, "planted-request.json");
    writeFileSync(outsideRequestPath, `${JSON.stringify({ intentSha256: "a".repeat(64) }, null, 2)}\n`);
    const scratchDir = join(dirs.repoRoot, "scratch");
    mkdirSync(scratchDir, { recursive: true });
    // The --request path itself is a symlink resolving outside this repository entirely.
    symlinkSync(outsideRequestPath, join(scratchDir, "reconcile-request-77.json"));

    assert.throws(
      () => runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/reconcile-request-77.json"],
        { readConfirmation: () => "approve" },
      ),
      /--request must be a path inside this repository's own scratch\/ directory/,
    );
  } finally {
    cleanup(dirs);
    rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("NVA-SWEEP-F2f-REWORK: sign-intent --request fails with the pre-existing message, not a raw exception, when the request path does not exist yet", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    mkdirSync(join(dirs.repoRoot, "scratch"), { recursive: true });
    assert.throws(
      () => runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--request", "scratch/reconcile-request-missing-entirely.json"],
        { readConfirmation: () => "approve" },
      ),
      /--request could not be read/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SWEEP-F2f-REWORK: sign-intent rejects a malformed --intent-sha256 supplied together with --request as \"both flags together\", while the standalone malformed-digest rejection (no --request) still works", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "z".repeat(64), "--request", "scratch/reconcile-request-1.json"],
        {},
      ),
      /Usage:/,
      "a malformed --intent-sha256 supplied together with --request must be rejected as both flags together, not silently discarded",
    );
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "z".repeat(64)], {}),
      /Usage:/,
      "a standalone malformed --intent-sha256 (no --request) must still be rejected",
    );
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SIGDISCLOSE-1 Finding 3: sign-intent reports a missing --human-name specifically, distinct from a genuine key mismatch, when the trust-policy record predates --human-name but the key itself is correct", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    legacyKeyFixture(dirs.directory); // writes {keyReference, publicKeySha256} only, no humanName -- the SAME key sign-intent will use
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.sigdisclose-f3-legacy-fixture").digest("hex");
    const dependencies = { readConfirmation: () => "approve" };
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      dependencies,
    ));
    assert.ok(error, "a legacy-shape (no humanName) authority record must still refuse to sign");
    assert.match(error.message, /predates --human-name/u, "the message must diagnose the REAL problem (missing --human-name), not a key mismatch");
    assert.doesNotMatch(error.message, /does not match the local public key/u, "a matching key must never be reported as mismatched");
    assert.match(error.message, /setup/u, "the message must point at the real repair action");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SIGDISCLOSE-1 Finding 3: sign-intent still reports a genuine key-digest mismatch as a mismatch, not as a missing --human-name", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory); // writes a NAMED trust-policy.json (humanName: "Test Operator") for one key...
    const otherPrivateKey = join(dirs.directory, "po-private.pem");
    // ...but the private key on disk is now regenerated, so it no longer matches the
    // publicKeySha256 the trust-policy.json record was written against.
    writeEd25519KeyPair(otherPrivateKey, join(dirs.directory, "po-public.pem"));
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.sigdisclose-f3-mismatch-fixture").digest("hex");
    const dependencies = { readConfirmation: () => "approve" };
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      dependencies,
    ));
    assert.ok(error, "a key that no longer matches the recorded digest must still refuse to sign");
    r76AssertTyped({ threw: true, error }, { cls: "key-anchor-mismatch", findingId: "trust-anchor-match", status: "attended" });
    assert.match(error.message, /digest|public key found there/iu, "a genuine key-digest mismatch must keep the mismatch message");
    assert.doesNotMatch(error.message, /predates --human-name/u, "a genuine key mismatch must never be reported as a missing --human-name");
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent cancels on a mismatched confirmation: OpenSSL is never invoked and no artifact is written", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-cancel-fixture").digest("hex");
    const spy = r76Spy("healthy");
    // TR-S1-T5 (Ruling 78(b)): subject retired by TR-S1 -- the typed confirmation on an UNENCRYPTED key is refused
    // outright once the gate lands, so a mismatched answer now meets the typed gate refusal (A1). RED until TR-S1-F.
    const dependencies = plainKey({
      readConfirmation: () => "nope",
      spawn: spy.spawn,
    });
    const error = thrown(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies));
    tr1AssertTypedRefusal(error, "sign-intent (b): a mismatched confirmation on an unencrypted key");
    assert.deepEqual(r76KeyPathSpawns(spy), [], "OpenSSL must never be invoked once confirmation is cancelled");
    assert.equal(existsSync(join(dirs.directory, "proof-manual.json")), false);
    assert.equal(existsSync(join(dirs.directory, "signature-manual.bin")), false);
    assert.equal(existsSync(join(dirs.directory, `intent-${intentSha256}.txt`)), false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * NVA-SIGNONCE-1: one human decision, not two.
 * ------------------------------------------------------------------ */

test("NVA-SIGNONCE-1: sign-intent skips the typed confirmation for a passphrase-protected private key, but still prints the disclosure", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "sign-intent-fixture-passphrase";
    const { privateKeyPem, authority } = encryptedKeyFixture(dirs.directory, passphrase);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-passphrase-fixture").digest("hex");
    const dependencies = {
      spawn: fakeSignSpawn(privateKeyPem, passphrase),
      // A spy that throws rather than a silent no-op: if the passphrase-protected
      // branch ever regresses into still reading a confirmation, this test fails
      // loudly instead of quietly passing on an unread stub answer.
      readConfirmation: () => { throw new Error("readConfirmation must not be called for a passphrase-protected key"); },
      // NVA-W5-TTYSIGN: this test's `spawn` stub simulates a real, attended OpenSSL
      // round trip against a passphrase-protected key, so it must simulate an
      // attended terminal too -- the test process running this suite has none of its
      // own (`process.stdin.isTTY` is `undefined` under `node --test`).
      isTTY: true,
    };
    let result;
    const output = captureStdout(() => {
      result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies);
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(result.intentSha256, intentSha256);
    assert.equal(result.signer.keyReference, authority.keyReference);

    // The disclosure -- what is being signed -- is still printed, unconditionally,
    // even though no confirmation token is read from stdin.
    assert.match(output, new RegExp(intentSha256, "u"), "the digest being signed must still be disclosed");
    assert.match(output, /guard-lift\/guard-override/u, "the generic consequence class must still be disclosed");

    const proofPath = result.paths.proof;
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(proof.intentSha256, intentSha256);
    const verified = verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof });
    assert.equal(verified.verified, true, "the signature produced without a typed confirmation must still be a genuine, verifying one");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-W5-TTYSIGN: sign-intent for a passphrase-protected key fails closed with an attended-terminal message, and never spawns OpenSSL, when no TTY is attached", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "sign-intent-fixture-passphrase";
    encryptedKeyFixture(dirs.directory, passphrase);
    // R7-6-T7 (F5 alignment): with zero committed anchors the readiness check ends in key-anchor-mismatch
    // before the terminal precondition (case R7-6g(i)); a fixture meant to reach the attended-terminal
    // refusal therefore commits an anchor for its own key.
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.tty-sign-no-terminal-fixture").digest("hex");
    let spawnCalled = false;
    const dependencies = {
      isTTY: false,
      spawn: () => { spawnCalled = true; return { status: 0 }; },
      readConfirmation: () => { throw new Error("readConfirmation must not be called before the TTY precondition"); },
    };
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      dependencies,
    ));
    assert.ok(error, "signing must refuse before ever spawning OpenSSL when there is no controlling terminal");
    assert.match(error.message, /pipeline\.signing-requires-attended-terminal/u, "the message must carry the greppable marker");
    // NVA-CF-MINORPUSH-RETRY: the message names the ACTUAL condition
    // isAttendedTerminal() checks -- opening /dev/tty, not the unrelated
    // process.stdin.isTTY -- so a human reading it can tell what was really
    // tested rather than a claim the code never checked.
    assert.match(error.message, /could not open a controlling terminal \(\/dev\/tty\)/u, "the message must explicitly name the real cause it measured");
    assert.doesNotMatch(error.message, /passphrase/u, "the message must never mention a passphrase -- that is the exact confusion this item is filed about");
    assert.equal(spawnCalled, false, "OpenSSL must never be invoked once the TTY precondition has failed");
    assert.equal(existsSync(join(dirs.directory, "proof-manual.json")), false);
    assert.equal(existsSync(join(dirs.directory, "intent-manual.txt")), false, "the intent file must never be written before the TTY precondition passes");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-CF-MINORPUSH-RETRY: sign-intent accepts a REAL controlling terminal even when stdin itself is redirected/piped", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "sign-intent-fixture-passphrase";
    const { privateKeyPem, authority } = encryptedKeyFixture(dirs.directory, passphrase);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.tty-sign-redirected-stdin-fixture").digest("hex");
    const dependencies = {
      spawn: fakeSignSpawn(privateKeyPem, passphrase),
      readConfirmation: () => { throw new Error("readConfirmation must not be called for a passphrase-protected key"); },
      // Simulates exactly the bug this closes: `process.stdin.isTTY` would be
      // false/undefined here (redirected/piped stdin, same as every other
      // process in this suite) while a REAL controlling terminal is attached
      // -- the actual condition OpenSSL's own interactive prompt depends on.
      // No `isTTY` dependency is supplied at all, so isAttendedTerminal() must
      // fall through to probing openControllingTty()/isatty() itself.
      openControllingTty: () => 97,
      isatty: (fd) => fd === 97,
    };
    let result;
    captureStdout(() => {
      result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies);
    });
    assert.equal(result.ok, true, "a genuinely attended controlling terminal must be accepted even though stdin itself is redirected");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-CF-MINORPUSH-RETRY: sign-intent refuses when the controlling terminal cannot be opened at all (no isTTY dependency supplied)", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "sign-intent-fixture-passphrase";
    encryptedKeyFixture(dirs.directory, passphrase);
    // R7-6-T7 (F5 alignment): see the committed-anchor note in the NVA-W5-TTYSIGN case above.
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.tty-sign-no-controlling-tty-fixture").digest("hex");
    let spawnCalled = false;
    const dependencies = {
      spawn: () => { spawnCalled = true; return { status: 0 }; },
      readConfirmation: () => { throw new Error("readConfirmation must not be called before the TTY precondition"); },
      // /dev/tty is genuinely unavailable (e.g. a daemon or fully detached
      // session) -- opening it throws, exactly like the real ENXIO/ENODEV.
      openControllingTty: () => { throw new Error("ENXIO: no such device or address, open '/dev/tty'"); },
    };
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      dependencies,
    ));
    assert.ok(error, "signing must refuse before ever spawning OpenSSL when the controlling terminal cannot be opened");
    assert.match(error.message, /could not open a controlling terminal \(\/dev\/tty\)/u);
    assert.equal(spawnCalled, false, "OpenSSL must never be invoked once the TTY precondition has failed");
  } finally {
    cleanup(dirs);
  }
});

test("2026-08-30-signing-ceremony-tty-check-has-no-windows-fallback: on native Windows (dependencies.platform === \"win32\"), the controlling-terminal probe and its refusal message name the Windows console handle, not /dev/tty", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "sign-intent-fixture-passphrase";
    encryptedKeyFixture(dirs.directory, passphrase);
    // R7-6-T7 (F5 alignment): see the committed-anchor note in the NVA-W5-TTYSIGN case above.
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.tty-sign-windows-fixture").digest("hex");
    let spawnCalled = false;
    const dependencies = {
      // No isTTY/openControllingTty override supplied -- exercises the real
      // default, which must select the platform-appropriate path. This WSL
      // session genuinely has no "\\.\CONIN$" device, so the open still
      // fails and the ceremony still refuses -- honest, not a fabricated
      // Windows-native pass; what this test actually proves is that the
      // BRANCH-SELECTION logic picked the Windows path, visible in the
      // resulting message.
      platform: "win32",
      spawn: () => { spawnCalled = true; return { status: 0 }; },
      readConfirmation: () => { throw new Error("readConfirmation must not be called before the TTY precondition"); },
    };
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      dependencies,
    ));
    assert.ok(error, "signing must refuse when the controlling terminal cannot be opened, on Windows exactly as on POSIX");
    assert.match(error.message, /could not open a controlling terminal \(\\\\\.\\CONIN\$\)/u, "the message must name the Windows console handle, not /dev/tty, when platform is win32");
    assert.doesNotMatch(error.message, /\/dev\/tty/u, "a win32 refusal must never claim it tried the POSIX path");
    assert.equal(spawnCalled, false, "OpenSSL must never be invoked once the TTY precondition has failed");
  } finally {
    cleanup(dirs);
  }
});

test("2026-08-30-signing-ceremony-tty-check-has-no-windows-fallback: on native Windows, a real controlling terminal (injected openControllingTty/isatty) is accepted exactly like on POSIX", () => {
  const dirs = fixtureDirs();
  try {
    const passphrase = "sign-intent-fixture-passphrase";
    const { privateKeyPem } = encryptedKeyFixture(dirs.directory, passphrase);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.tty-sign-windows-attended-fixture").digest("hex");
    const dependencies = {
      platform: "win32",
      spawn: fakeSignSpawn(privateKeyPem, passphrase),
      readConfirmation: () => { throw new Error("readConfirmation must not be called for a passphrase-protected key"); },
      openControllingTty: () => 99,
      isatty: (fd) => fd === 99,
    };
    let result;
    captureStdout(() => {
      result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies);
    });
    assert.equal(result.ok, true, "an attended controlling terminal must be accepted on Windows too, once opened");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-W5-TTYSIGN: sign-intent for an UNPROTECTED key is unaffected by a missing TTY -- OpenSSL never prompts, so no terminal is required", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.tty-sign-unprotected-key-fixture").digest("hex");
    // TR-S1-T5 (Ruling 78(b)): subject retired by TR-S1 -- signing with an UNPROTECTED key is refused outright with a
    // typed code (A1), TTY or not, so the old "signing must succeed with no TTY" assertion is re-pointed. RED until TR-S1-F.
    const dependencies = plainKey({ isTTY: false, readConfirmation: () => "approve" });
    const error = thrown(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies));
    tr1AssertTypedRefusal(error, "sign-intent (b): an unprotected key with no TTY");
    assert.deepEqual(tr1ReadDirectory(dirs.directory).filter((name) => /^(proof|signer|signature|intent)/u.test(name)), [], "TR-S1-T sign-intent (b): no intent, signature, proof or signer artifact may be written for an unprotected key");
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * TR-S1-T (QG-04 test-only slice, class SECURITY): RED pins for the TR-S1 encrypted-key gate,
 * specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md section 3.4 "TR-S1" (a3).
 *
 * The gate: setup --existing-key, setup's recover branch and sign-intent refuse a private key that is
 * not passphrase-protected (isPrivateKeyPassphraseProtected, which is false for an UNREADABLE key too,
 * so the gate fails closed). Five pins: unencrypted --existing-key refused with nothing copied (1);
 * encrypted --existing-key accepted, regression guard, GREEN today (2); recover with an unencrypted
 * key refused (3); sign-intent with a registered unencrypted key refused before any spawn (4); an
 * unreadable key refused (5). Pins 1, 3, 4, 5 are RED today; pin 2 is green today.
 *
 * ASSUMPTIONS (the briefing leaves these undecided; the fix slice must confirm or amend them):
 *  A1. The refusal code is NOT decided. The note proposes PO-KEY-UNENCRYPTED [C]; it is recorded here as
 *      the assumption and is deliberately NOT asserted by name. What is asserted is a TYPED code: either
 *      error.code or a token inside error.message shaped like an uppercase hyphenated code (at least two
 *      segments). A raw Node errno (EISDIR, EACCES: one segment, no hyphen) is NOT a typed code, so a
 *      fix that merely lets the failing read throw does not satisfy pins 1, 3, 4 or 5.
 *  A2. Pin 4 is strict about "before any OpenSSL spawn": ZERO spawns of any kind (not only none that
 *      touches the PO key). If the fix places the gate after sign-intent's readiness probe, this pin goes
 *      red on that assertion and the placement (the note's [C] "near :1639-1649") must move earlier.
 *  A3. The unreadable key of pin 5 is exercised on the --existing-key route in two shapes: a directory
 *      where the key file should be (every read fails, no seam involved) and an injected readFile that
 *      denies exactly that path (EACCES). Both pass the existence check, so they reach the detector.
 *  A4 (amended by Rulings 78 and 83). Existing cases that register keyFixture() (an UNENCRYPTED key) and
 *      expect sign-intent or authorize-critical to proceed would be refused once the gate lands. They are
 *      moved onto an encrypted key by the central lever (applyKeyLever, TR-S1-T3, above), or re-pointed:
 *      the three lists below account for every case that did not simply move.
 *
 * subject retired by TR-S1 (Ruling 78): the typed confirmation on an UNENCRYPTED key. After TR-S1-F that
 * attended path is refused outright, so these five cases are NOT moved. Each runs under plainKey() and asserts
 * the typed gate refusal (A1 pattern) plus its old no-OpenSSL / no-artifact assertions; each stays RED until
 * TR-S1-F lands (pins 1, 3, 4, 5 and these five are the expected reds of an un-gated run):
 *   - "sign-intent cancels on a mismatched confirmation ..."
 *   - "NVA-W5-TTYSIGN: sign-intent for an UNPROTECTED key ..." (the old "signing succeeds with no TTY"
 *     assertion cannot coexist with the refusal and is replaced by it; a no-artifact assertion is added)
 *   - "NVA-SIGNONCE-1: an unencrypted private key still requires and can cancel ..."
 *   - "sign-intent cancels on an empty confirmation answer ..."
 *   - "NVA-BL-74: cancellation semantics are unchanged under the German prompt ..."
 *
 * channel moved from prompt to stdout disclosure (Ruling 83): on the encrypted path sign-intent prints the
 * disclosure (header, data lines, consequence) to stdout and never calls readConfirmation (NVA-SIGNONCE-1,
 * printDisclosureOnly in po-human-approval.mjs). These 16 cases keep their subject (disclosure content,
 * language frame, order) and opt in with disclosureChannel(): AC-19 inherited registry; sign-intent end-to-end;
 * Agy export; Critic export; bootstrap acknowledgement; NVA-SIGENTRY-1 (two); the four reason/scope/expiry
 * disclosure cases (states the reason, no record resolves, tampered record, bounded); NVA-BL-74 German frame,
 * English fallback and identical-data-lines; R7-6d(iii); R7-6f(i).
 * The adapter (callWithLever, above) is OPT-IN and per case. It acts only when the case is marked AND the lever
 * re-encrypted its key (so production genuinely skips the typed prompt); it swaps process.stdout.write for a
 * collector during the call and hands each captured chunk, verbatim, to the case's own readConfirmation stub at
 * the moment production wrote it (so the order against spawns is preserved), ignoring the stub's answer.
 * Unmarked cases never receive a prompt production did not present. The typed-token INSTRUCTION line is not part
 * of the disclosure on this channel (Ruling 91(b)); the assertions on that line alone (sign-intent end-to-end,
 * the reason/scope/expiry case, the German frame, the English fallback, the identical-data-lines loop) were
 * dropped or re-pointed at the consequence sentence. Every other assertion in those cases stays.
 *
 * Literal-word measurement (Ruling 78(b)): authorize-critical and approve/approve-critical call
 * requireExplicitConfirmation unconditionally (po-human-approval.mjs), encrypted key or not, so the two
 * "still requires the literal word approve" cases MOVE with the lever and are green without any edit.
 *
 * Acceptance shape (Ruling 91(a)): under a TYPED simulated gate the pins and the five retired-subject cases
 * assert exactly the typed refusal and turn GREEN; only NVA-SWEEP-F2f-REWORK stays red. Without a gate the
 * reds are pins 1, 3, 4, 5, the five retired-subject cases and NVA-SWEEP-F2f-REWORK.
 * Fixtures are throwaway node:crypto keys in mkdtemp directories: no real home, no real key directory,
 * no network, no real OpenSSL (every spawn goes through an injected stub).
 * ------------------------------------------------------------------------- */
import { readdirSync as tr1ReadDirectory } from "node:fs";

const TR1_PASSPHRASE = "tr-s1-t-fixture-passphrase";
const TR1_CODE_SHAPE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u;
const TR1_CODE_IN_MESSAGE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/u;

function tr1RefusalCode(error) {
  if (typeof error?.code === "string" && TR1_CODE_SHAPE.test(error.code)) return error.code;
  const embedded = String(error?.message ?? "").match(TR1_CODE_IN_MESSAGE);
  return embedded ? embedded[0] : null;
}

function tr1AssertTypedRefusal(error, label) {
  assert.ok(error, `TR-S1-T ${label}: must be refused with a typed code, but the call returned normally`);
  assert.ok(tr1RefusalCode(error), `TR-S1-T ${label}: the refusal must carry a typed code (A1), got code=${String(error.code)} message=${String(error.message).slice(0, 160)}`);
}

/** A throwaway Ed25519 key (unencrypted unless a passphrase is given) in `directory`, as <name>.pem + <name>.pub.pem. */
function tr1Key(directory, { passphrase = null, name = "key" } = {}) {
  mkdirSync(directory, { recursive: true });
  const privatePath = join(directory, `${name}.pem`);
  const publicPath = join(directory, `${name}.pub.pem`);
  writeEd25519KeyPair(privatePath, publicPath, passphrase);
  return { privatePath, publicPath };
}

/** Injected spawn for setup: derives the public key in-process (with the passphrase when the key is encrypted), records every call. */
function tr1Spawn(passphrase = null) {
  const calls = [];
  const spawn = (executable, args = []) => {
    const a = args.map(String);
    calls.push({ executable, args: a, touchesPoKey: a.some((entry) => /po-private\.pem/u.test(entry)) });
    if (executable === "openssl" && a[0] === "pkey" && a.includes("-pubout")) {
      const key = createPrivateKey({ key: readFileSync(a[a.indexOf("-in") + 1], "utf8"), format: "pem", ...(passphrase === null ? {} : { passphrase }) });
      writeFileSync(a[a.indexOf("-out") + 1], createPublicKey(key).export({ type: "spki", format: "pem" }));
      return { status: 0 };
    }
    return answerOpensslProbe(executable, a);
  };
  // TR-S1-T3: the pins' own setup helper keeps the central lever off: their SUBJECT is the unencrypted key.
  spawn[KEEP_KEY_PLAIN] = true;
  return { spawn, calls };
}

function tr1AssertNothingRegistered(directory, spawnCalls, label) {
  for (const name of ["po-private.pem", "po-public.pem", "trust-policy.json"]) {
    assert.equal(existsSync(join(directory, name)), false, `TR-S1-T ${label}: ${name} must not exist in the key directory -- nothing may be copied or registered`);
  }
  assert.deepEqual(spawnCalls.filter((call) => call.touchesPoKey), [], `TR-S1-T ${label}: no spawn may touch a registered PO key`);
}

test("TR-S1-T pin 1: setup --existing-key refuses an UNENCRYPTED key with a typed code and copies nothing", () => {
  const dirs = fixtureDirs();
  const source = mkdtempSync(join(tmpdir(), "po-tr1-source-"));
  try {
    const { privatePath } = tr1Key(source);
    const { spawn, calls } = tr1Spawn();
    const error = thrown(() => runHumanApproval([
      "setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--existing-key", privatePath, "--human-name", "Test Operator",
    ], { spawn }));
    tr1AssertTypedRefusal(error, "unencrypted --existing-key");
    tr1AssertNothingRegistered(dirs.directory, calls, "unencrypted --existing-key");
  } finally {
    cleanup(dirs);
    rmSync(source, { recursive: true, force: true });
  }
});

test("TR-S1-T pin 2 (regression guard, green today): setup --existing-key accepts an ENCRYPTED key and copies it verbatim", () => {
  const dirs = fixtureDirs();
  const source = mkdtempSync(join(tmpdir(), "po-tr1-source-"));
  try {
    const { privatePath, publicPath } = tr1Key(source, { passphrase: TR1_PASSPHRASE });
    assert.match(readFileSync(privatePath, "utf8"), /-----BEGIN ENCRYPTED PRIVATE KEY-----/u, "fixture sanity: the key must carry the encrypted PKCS#8 armor");
    const { spawn } = tr1Spawn(TR1_PASSPHRASE);
    const result = runHumanApproval([
      "setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--existing-key", privatePath, "--human-name", "Test Operator",
    ], { spawn });
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-AUTHORITY-READY");
    assert.equal(result.imported, true);
    assert.equal(readFileSync(result.paths.privateKey, "utf8"), readFileSync(privatePath, "utf8"), "the encrypted key is copied byte for byte");
    assert.equal(readFileSync(result.paths.publicKey, "utf8"), readFileSync(publicPath, "utf8"), "the registered public key is the encrypted key's own public half");
    assert.equal(existsSync(result.paths.authority), true);
  } finally {
    cleanup(dirs);
    rmSync(source, { recursive: true, force: true });
  }
});

test("TR-S1-T pin 3: setup's recover branch refuses an UNENCRYPTED key with a typed code and registers no authority", () => {
  const controlDirs = fixtureDirs();
  const dirs = fixtureDirs();
  try {
    // Control (green today): the same recover route with an ENCRYPTED key registers the authority, so
    // the refusal below can only be about the key's encryption, not about the fixture shape.
    writeEd25519KeyPair(join(controlDirs.directory, "po-private.pem"), join(controlDirs.directory, "po-public.pem"), TR1_PASSPHRASE);
    const control = runHumanApproval(["setup", "--repo-root", controlDirs.repoRoot, "--directory", controlDirs.directory, "--human-name", "Test Operator"], { spawn: tr1Spawn(TR1_PASSPHRASE).spawn });
    assert.equal(control.recovered, true, "control: an encrypted key at the directory is recovered");

    writeEd25519KeyPair(join(dirs.directory, "po-private.pem"), join(dirs.directory, "po-public.pem"));
    const { spawn, calls } = tr1Spawn();
    const error = thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"], { spawn }));
    tr1AssertTypedRefusal(error, "recover with an unencrypted key");
    assert.equal(existsSync(join(dirs.directory, "trust-policy.json")), false, "TR-S1-T recover: the authority record must not be written for an unencrypted key");
    assert.deepEqual(calls.filter((call) => call.touchesPoKey), [], "TR-S1-T recover: no spawn may touch the key");
  } finally {
    cleanup(controlDirs);
    cleanup(dirs);
  }
});

test("TR-S1-T pin 4: sign-intent refuses a REGISTERED unencrypted key with a typed code before any OpenSSL spawn", () => {
  const dirs = fixtureDirs();
  try {
    // keyFixture() registers an UNENCRYPTED key exactly as a pre-fix machine would have it on disk.
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.tr-s1-t-sign-intent-unencrypted-fixture").digest("hex");
    const spy = r76Spy("healthy");
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      plainKey({ readConfirmation: () => "approve", spawn: spy.spawn }),
    ));
    tr1AssertTypedRefusal(error, "sign-intent with a registered unencrypted key");
    assert.deepEqual(r76KeyPathSpawns(spy), [], "TR-S1-T sign-intent: OpenSSL must never be handed the unencrypted key");
    assert.deepEqual(spy.calls.map((call) => `${call.executable} ${call.args[0]}`), [], "TR-S1-T sign-intent (A2): no OpenSSL spawn of ANY kind may happen before the refusal");
    assert.deepEqual(tr1ReadDirectory(dirs.directory).filter((name) => /^(proof|signer|signature|intent)/u.test(name)), [], "TR-S1-T sign-intent: no intent, signature, proof or signer artifact may be written");
  } finally {
    cleanup(dirs);
  }
});

test("TR-S1-T pin 5: setup --existing-key refuses an UNREADABLE key with a typed code (the gate fails closed) and copies nothing", () => {
  const variants = [
    { label: "a directory where the key file should be", dependencies: () => ({}), make: (source) => { const path = join(source, "not-a-file.pem"); mkdirSync(path); return path; } },
    {
      label: "a key file whose read is denied (EACCES)",
      make: (source) => tr1Key(source, { name: "denied" }).privatePath,
      dependencies: (path) => ({
        readFile: (candidate, ...rest) => {
          if (String(candidate) === path) throw Object.assign(new Error("EACCES: permission denied, open"), { code: "EACCES" });
          return readFileSync(candidate, ...rest);
        },
      }),
    },
  ];
  for (const variant of variants) {
    const dirs = fixtureDirs();
    const source = mkdtempSync(join(tmpdir(), "po-tr1-source-"));
    try {
      const keyPath = variant.make(source);
      const { spawn, calls } = tr1Spawn();
      const error = thrown(() => runHumanApproval([
        "setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--existing-key", keyPath, "--human-name", "Test Operator",
      ], { spawn, ...variant.dependencies(keyPath) }));
      tr1AssertTypedRefusal(error, `unreadable --existing-key (${variant.label})`);
      tr1AssertNothingRegistered(dirs.directory, calls, `unreadable --existing-key (${variant.label})`);
    } finally {
      cleanup(dirs);
      rmSync(source, { recursive: true, force: true });
    }
  }
});

test("NVA-SIGNONCE-1: an unencrypted private key still requires and can cancel on a mismatched confirmation, OpenSSL never invoked", () => {
  const dirs = fixtureDirs();
  try {
    // Same key shape as the pre-existing mismatched-confirmation test above; this
    // test pins the NEW routing decision specifically -- that
    // isPrivateKeyPassphraseProtected() correctly resolves an unencrypted key to
    // `false` and still funnels sign-intent through the confirmation-required path.
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-signonce-unencrypted-fixture").digest("hex");
    const spy = r76Spy("healthy");
    // TR-S1-T5 (Ruling 78(b)): subject retired by TR-S1 -- an unencrypted key no longer reaches the typed confirmation;
    // the attended path is refused outright with a typed code (A1). RED until TR-S1-F.
    const dependencies = plainKey({
      readConfirmation: () => "definitely not approve",
      spawn: spy.spawn,
    });
    const error = thrown(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies));
    tr1AssertTypedRefusal(error, "sign-intent (b): NVA-SIGNONCE-1 a non-matching answer on an unencrypted key");
    assert.deepEqual(r76KeyPathSpawns(spy), [], "OpenSSL must never be invoked once confirmation is cancelled for a key with no passphrase");
    assert.equal(existsSync(join(dirs.directory, "proof-manual.json")), false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * WP-K-AC05-REWORK1 — fork-disposition ceremony fixtures.
 *
 * The forked-stream fixture is rebuilt here rather than imported from
 * lib/governance-event-store.test.mjs: importing a `node:test` file registers
 * its whole suite a second time. It reproduces that file's technique exactly —
 * two genuine appends, then a rogue `sealGovernanceEvent` written straight into
 * the canonical directory at an already-occupied sequence.
 * ------------------------------------------------------------------------- */
const FORK_CANDIDATE = { commit: "b".repeat(40), tree: "c".repeat(40) };
const UNAVAILABLE = { state: "not-applicable" };
const FAR_FUTURE = "2999-01-01T00:00:00.000Z";

function registryFixture(fingerprint) {
  return {
    schema: "pipeline.governance-stream-registry.v1",
    repositoryFingerprint: fingerprint,
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventDigestDomain: "pipeline.governance-event.v1\0",
    storageRoot: "governance/events",
    streams: [
      { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    ],
  };
}

function capturePolicyFixture() {
  return { schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: "c".repeat(64), defaultAction: "deny", streams: [
    { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
  ], sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false }, mandatoryEventClasses: [] };
}

function envelope(fingerprint, capturePolicyDigest, overrides = {}) {
  return {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.lifecycle-governance-event.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId: "evt-1",
    idempotencyKey: "idem-1",
    origin: "lifecycle",
    authorityClass: "non-authoritative",
    eventType: "lifecycle.dispatch",
    occurredAtEpochMs: 1,
    observedAtEpochMs: 1,
    timeAssurance: "locally-observed",
    repositoryFingerprint: fingerprint,
    sourceUri: `urn:pipeline:repository:${fingerprint}`,
    streamId: "lifecycle",
    correlation: { featureId: UNAVAILABLE, packageId: "phoenix-3", requestId: UNAVAILABLE, sessionId: UNAVAILABLE, dispatchId: "dispatch-1", traceId: UNAVAILABLE },
    candidate: FORK_CANDIDATE,
    artifacts: [UNAVAILABLE],
    policy: { policyDigest: UNAVAILABLE, configurationDigest: UNAVAILABLE, capturePolicyDigest, redactionPolicyDigest: UNAVAILABLE },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: { eventId: "lifecycle-1", kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 }, candidate: FORK_CANDIDATE, invalidatesEventId: null, supersedesEventId: null },
    ...overrides,
  };
}

async function forkedRepositoryFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), "po-fork-disposition-repo-"));
  execFileSync("git", ["init", "-q", repoRoot]);
  const repository = discoverRepository(repoRoot);
  // NVA-REPOID-3: two distinct fingerprints now serve two distinct needs.
  // `fingerprint` is the store's BOUND identity (governance-event-store.mjs's
  // `readLocalRepositoryFingerprint`, bind-on-first-use against this fresh
  // fixture checkout) -- every governance-store call (append, query, and the
  // CLI's own `--repository-fingerprint` argument, which flows straight into
  // `inspectForkedGovernanceStream`) now requires exactly this value.
  // `derivedFingerprint` is the unrelated, still-path-derived value
  // `po-human-approval.mjs` itself uses ONLY to namespace its request/proof
  // filenames (PO-KEYDIR-01(B)); that naming scheme was never changed by
  // NVA-REPOID-1/2 and still calls `derivePoGateRepositoryFingerprint`
  // directly, so filename assertions below must keep using it.
  const derivedFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: repoRoot });
  const capturePolicy = capturePolicyFixture();
  const capturePolicyDigest = canonicalSha256(capturePolicy);
  mkdirSync(join(repoRoot, "governance/events"), { recursive: true });
  writeFileSync(join(repoRoot, "governance/events/registry.json"), `${canonicalizeJson(registryFixture(fingerprint))}\n`);
  writeFileSync(join(repoRoot, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy)}\n`);
  const intent = (overrides = {}) => envelope(fingerprint, capturePolicyDigest, overrides);
  const first = await appendPortableGovernanceEvent({ repositoryRoot: repoRoot, repositoryFingerprint: fingerprint, intent: intent() });
  await appendPortableGovernanceEvent({ repositoryRoot: repoRoot, repositoryFingerprint: fingerprint, intent: intent({ eventId: "evt-2", idempotencyKey: "idem-2", occurredAtEpochMs: 2, observedAtEpochMs: 2, payload: { ...intent().payload, eventId: "lifecycle-2", reasonCode: "CONTINUED" } }) });
  const fork = sealGovernanceEvent({ ...intent({ eventId: "evt-fork", idempotencyKey: "idem-fork" }), sequence: 2, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  writeFileSync(join(repoRoot, "governance/events/lifecycle/2-evt-fork.json"), `${canonicalizeJson(fork)}\n`);
  const directory = mkdtempSync(join(tmpdir(), "po-fork-disposition-external-"));
  return { repoRoot, directory, fingerprint, derivedFingerprint };
}

/** Declares the fixture's own throwaway key as the repository's trust anchor — the
 * store accepts no caller-supplied one, exactly as the library tests establish.
 * RW1-TRUSTANCHOR: v3 (`trustAnchors`, plural), the schema the repository actually
 * ships, not the v1 legacy `trustAnchor` singular this fixture declared before — a v1
 * fixture never exercised the resolution bug the singular-field read had under v3. */
function declareTrustAnchor(repoRoot, authority) {
  mkdirSync(join(repoRoot, "project"), { recursive: true });
  writeFileSync(join(repoRoot, "project/critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["governance-fork-disposition"],
    waivedKinds: [],
    trustAnchors: [{ keyReference: authority.keyReference, publicKeySha256: authority.publicKeySha256 }],
  }));
}

/**
 * R7-6-T3 (D2, Spec 22.6): with no committed trust anchor no public key can match one, so
 * sign-intent's step (c) ends in key-anchor-mismatch before any prompt. A fixture that is meant to
 * reach the prompt or the signing spawn therefore declares a committed anchor whose digest equals
 * the digest of the public key currently in its key directory -- same helper, same v3 format as
 * the R7-6 block (declareTrustAnchor). Computed from the CURRENT po-public.pem and the record's
 * keyReference, so a fixture that regenerates its key calls this after the regeneration.
 */
function anchorFixtureKey(repoRoot, directory) {
  const publicKeyPem = readFileSync(join(directory, "po-public.pem"), "utf8");
  const record = JSON.parse(readFileSync(join(directory, "trust-policy.json"), "utf8"));
  const authority = { keyReference: record.keyReference, publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  declareTrustAnchor(repoRoot, authority);
  return authority;
}

const forkArgs = (dirs, extra = []) => [
  "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
  "--repository-fingerprint", dirs.fingerprint, "--stream-id", "lifecycle", "--sequence", "2",
  ...extra,
];

test("a fork-disposition request built by the CLI, signed with the PO key, is accepted by the store's own verifier", { skip: REQUIRES_OPENSSL }, async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);

    const prepared = await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    assert.equal(prepared.code, "PO-HUMAN-FORK-DISPOSITION-REQUEST-READY");
    assert.deepEqual([...prepared.acknowledgedEventIds].sort(), ["evt-2", "evt-fork"], "the acknowledged identifiers must come from the observed fork, not from the caller");
    assert.equal(prepared.forkedEventDigests.length, 2);
    assert.notDeepEqual(prepared.candidate, FORK_CANDIDATE, "the candidate must be the derived one, never a repository commit/tree");

    // dirs.derivedFingerprint is the SAME full derivePoGateRepositoryFingerprint() digest
    // po-human-approval.mjs computes for this real-git fixture (via discoverRepository's
    // commonDir/primaryRoot, mirrored by resolveGitCommonDir there); only the first 12
    // hex chars land in filenames (PO-KEYDIR-01(B)) -- repositoryFingerprintFor() below
    // assumes a non-git tmpdir fixture and would be wrong here. dirs.fingerprint (the
    // store's bound identity, NVA-REPOID-3) is a different value and never appears in a
    // filename.
    const forkFp = dirs.derivedFingerprint.slice(0, 12);
    const written = JSON.parse(readFileSync(join(dirs.directory, `request-${forkFp}-critical-governance-fork-disposition.json`), "utf8"));
    assert.equal(written.action.kind, "governance-fork-disposition");
    assert.equal(written.action.subjectSha256, prepared.subjectSha256);

    const confirmations = [];
    const dependencies = { readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; } };
    const approved = await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], dependencies);
    assert.equal(approved.code, "PO-HUMAN-PROOF-READY", "signing must run through the existing critical-approval branch, unchanged");
    assert.equal(confirmations.length, 1, "the human must confirm exactly once before OpenSSL is reached");
    assert.match(confirmations[0], new RegExp(prepared.subjectSha256, "u"), "the confirmation must name the exact subject being authorized");

    const verified = await runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {});
    assert.equal(verified.code, "PO-HUMAN-FORK-DISPOSITION-VERIFIED");
    assert.equal(verified.value.verified, true);

    // THE central proof: the store's own path, not this CLI's readback.
    const recovered = await recoverPortableGovernanceProjection({
      repositoryRoot: dirs.repoRoot,
      repositoryFingerprint: dirs.fingerprint,
      streamId: "lifecycle",
      disposition: {
        idempotencyKey: "fork-disp-cli",
        sequence: 2,
        acknowledgedEventIds: prepared.acknowledgedEventIds,
        reasonCode: "GOVERNED_ACK",
        disposedAtEpochMs: 1,
        approval: verified.approval,
      },
    });
    assert.equal(recovered.status, "fork-disposition-recorded", "authorizeForkDisposition must accept a request this CLI built and this key signed");
  } finally {
    cleanup(dirs);
  }
});

test("the fork-disposition commands refuse every self-minting shortcut", { skip: REQUIRES_OPENSSL }, async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    // A bare subject digest or a caller-chosen kind is exactly what ADR-0072 closes.
    for (const extra of [["--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE], ["--kind", "push", "--expires-at", FAR_FUTURE]]) {
      await assert.rejects(() => runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, extra)], {}), /Usage:/u);
    }
    // A sequence that is not actually forked cannot be prepared at all.
    await assert.rejects(
      () => runForkDispositionApproval(["prepare-fork-disposition", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--repository-fingerprint", dirs.fingerprint, "--stream-id", "lifecycle", "--sequence", "7", "--expires-at", FAR_FUTURE], {}),
      /no forked position at sequence 7/u,
    );
    // Verification is against the repository's declared anchor, so an undeclared key cannot self-verify.
    const { authority } = keyFixture(dirs.directory);
    await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve" });
    await assert.rejects(() => runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {}), /no usable trustAnchor/u);
    declareTrustAnchor(dirs.repoRoot, authority);
    assert.equal((await runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {})).value.verified, true, "the rejections above must not be a fixture that could never verify");
    // A synchronous caller must not silently reach a wrong branch.
    assert.throws(() => runHumanApproval(["verify-fork-disposition", ...forkArgs(dirs)], {}), /runForkDispositionApproval/u);
  } finally {
    cleanup(dirs);
  }
});

test("approve-fork-disposition refuses a tampered approvalIntent before any signing side effect (F2)", async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);
    await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    const requestPath = join(dirs.directory, `request-${dirs.derivedFingerprint.slice(0, 12)}-critical-governance-fork-disposition.json`);
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    // action.kind/action.subjectSha256 stay correct (they pass the earlier
    // check at :419-421); only the approvalIntent's own authority field is
    // tampered, exactly the gap F2 closes.
    request.approvalIntent.value.featureId = "tampered-feature-id";
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);

    const confirmations = [];
    await assert.rejects(
      () => runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; } }),
      /not issued for the fork-disposition authority/u,
    );
    assert.equal(confirmations.length, 0, "the confirmation prompt -- and therefore OpenSSL -- must never be reached once the intent is tampered");
    assert.equal(existsSync(join(dirs.directory, `proof-${dirs.derivedFingerprint.slice(0, 12)}-critical-governance-fork-disposition.json`)), false, "no signature may be produced for a request with a tampered approvalIntent");
  } finally {
    cleanup(dirs);
  }
});

test("prepare-critical keeps composing push/deploy/publication requests exactly as before", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    const fp = repositoryFingerprintFor(dirs.repoRoot);
    for (const kind of ["push", "deploy", "publication"]) {
      const result = runHumanApproval([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
        "--kind", kind, "--subject-sha256", subjectSha256, "--expires-at", FAR_FUTURE,
      ], { observeCandidate: () => observed });
      assert.equal(result.code, "PO-HUMAN-CRITICAL-REQUEST-READY");
      assert.deepEqual(result.candidate, observed, "the three original kinds still bind the observed git candidate");
      const expected = createCriticalActionApprovalRequest({
        candidate: observed,
        featureId: "cyb-4",
        planBytes: Buffer.from("plan bytes\n", "utf8"),
        specBytes: Buffer.from("spec bytes\n", "utf8"),
        action: { kind, subjectSha256, expiresAt: FAR_FUTURE },
      });
      assert.deepEqual(JSON.parse(readFileSync(join(dirs.directory, `request-${fp}-critical-${kind}.json`), "utf8")), expected, "real repository file bytes and the caller-supplied subject digest, unchanged");
    }
    // The fork-locating flags stay unknown to every pre-existing command.
    assert.throws(() => runHumanApproval([
      "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "push", "--subject-sha256", subjectSha256, "--expires-at", FAR_FUTURE, "--stream-id", "lifecycle",
    ], {}), /Usage:/u);
  } finally {
    cleanup(dirs);
  }
});

test("the -critical trio refuses the fork-disposition kind, so no operator route can build the unverifiable request or overwrite the correct one", { skip: REQUIRES_OPENSSL }, async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const prepared = await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    const requestPath = join(dirs.directory, `request-${dirs.derivedFingerprint.slice(0, 12)}-critical-governance-fork-disposition.json`);
    const before = readFileSync(requestPath, "utf8");

    // The exact escape route: the CORRECT receipt's subject digest, copied into
    // prepare-critical. The request that produced used to satisfy
    // approve-fork-disposition's kind/subject re-check while still carrying a
    // git candidate and repository plan/spec bytes, so the whole signing
    // ceremony ran before anything noticed.
    assert.throws(() => runHumanApproval([
      "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "governance-fork-disposition", "--subject-sha256", prepared.subjectSha256, "--expires-at", FAR_FUTURE,
    ], { observeCandidate: () => ({ commit: "d".repeat(40), tree: "e".repeat(40) }) }), /Usage:/u);
    assert.equal(readFileSync(requestPath, "utf8"), before, "a refused prepare-critical cannot clobber the prepared fork-disposition request");

    // Signing and readback are refused at the same point, so that re-check is no
    // longer the only thing standing between a copied digest and OpenSSL.
    for (const command of ["approve-critical", "verify-critical"]) {
      assert.throws(() => runHumanApproval([command, "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "governance-fork-disposition"], {}), /Usage:/u, `${command} must refuse the kind outright`);
    }

    // Whatever the shared family grows next has to be an explicit decision for
    // these three commands too, not automatic membership — which is exactly how
    // the fourth kind arrived here unnoticed. `feature-package-reconcile` was
    // added to CRITICAL_COMMAND_KINDS deliberately (PHX-WP-POHUMAN-SIGNING-ERGO
    // fix 2, 2026-08-18) and is exercised by its own positive-path test below,
    // so it is excluded from this negative loop. `release-preflight` was added
    // the same way (GF-105/ADR-0064 Decision 4) and is exercised by its own
    // positive-path tests further below, so it is excluded here too.
    for (const kind of CRITICAL_ACTION_KINDS.filter((entry) => !["push", "deploy", "publication", "feature-package-reconcile", "release-preflight"].includes(entry))) {
      assert.throws(() => runHumanApproval([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
        "--kind", kind, "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
      ], {}), /Usage:/u, `${kind} is not one of the three kinds these commands can compose`);
    }

    // The fork-disposition ceremony itself still works after the narrowing: its
    // approve step reaches the same signing branch the refused argv named.
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);
    const approved = await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve" });
    assert.equal(approved.code, "PO-HUMAN-PROOF-READY");
    assert.equal((await runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {})).value.verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("po-approval-gate.mjs drives the public half of the fork-disposition ceremony, and only the public half", { skip: REQUIRES_OPENSSL }, async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);

    const prepared = await runApprovalGate(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    assert.equal(prepared.code, "PO-HUMAN-FORK-DISPOSITION-REQUEST-READY", "the agent-executable control plane must be able to prepare the request");

    // The signing half is not the control plane's to run: it delegates to the
    // approve-critical branch and therefore reads the private key.
    assert.throws(() => runApprovalGate(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve", spawn: () => ({ status: 0 }) }), /Usage:/u);
    assert.equal(existsSync(join(dirs.directory, `proof-${dirs.derivedFingerprint.slice(0, 12)}-critical-governance-fork-disposition.json`)), false, "no proof may exist before the human has signed");

    await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve" });
    const verified = await runApprovalGate(["verify-fork-disposition", ...forkArgs(dirs)], {});
    assert.equal(verified.code, "PO-HUMAN-FORK-DISPOSITION-VERIFIED");
    assert.equal(verified.value.verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent cancels on an empty confirmation answer the same way as a mismatched one", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-empty-fixture").digest("hex");
    const spy = r76Spy("healthy");
    // TR-S1-T5 (Ruling 78(b)): subject retired by TR-S1 -- an empty answer on an UNENCRYPTED key meets the typed gate
    // refusal (A1) exactly as a mismatched one does. RED until TR-S1-F.
    const dependencies = plainKey({
      readConfirmation: () => "",
      spawn: spy.spawn,
    });
    const error = thrown(() => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies));
    tr1AssertTypedRefusal(error, "sign-intent (b): an empty answer on an unencrypted key");
    assert.deepEqual(r76KeyPathSpawns(spy), [], "OpenSSL must never be invoked once confirmation is cancelled");
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * ONECMD-1: the single-invocation critical-action ceremony.
 * ------------------------------------------------------------------ */

const CANDIDATE = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const STALE_CANDIDATE = Object.freeze({ commit: "c".repeat(40), tree: "d".repeat(40) });
const FEATURE_ID = "nova-onecmd";
const PLAN = "plan.md";
const SPEC = "spec.md";

/** A fixture repository (plan/spec only; the candidate is injected, never observed via git). */
function criticalDirs() {
  const dirs = {
    repoRoot: mkdtempSync(join(tmpdir(), "po-authorize-critical-repo-")),
    directory: mkdtempSync(join(tmpdir(), "po-authorize-critical-external-")),
  };
  writeFileSync(join(dirs.repoRoot, PLAN), "# plan fixture\n");
  writeFileSync(join(dirs.repoRoot, SPEC), "# spec fixture\n");
  return dirs;
}

const futureExpiry = () => new Date(Date.now() + 3_600_000).toISOString();
const subjectDigest = (label) => createHash("sha256").update(label).digest("hex");

function criticalArgv(command, dirs, { kind = "push", subjectSha256, expiresAt, plan = PLAN, spec = SPEC, featureId = FEATURE_ID } = {}) {
  return [
    command, "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
    "--feature-id", featureId, "--plan", plan, "--spec", spec,
    "--kind", kind, "--subject-sha256", subjectSha256, "--expires-at", expiresAt,
  ];
}

/* ------------------------------------------------------------------------- *
 * PHX-WP-POHUMAN-SIGNING-ERGO fix 1 — the 3-key trustPolicy/authority shape
 * (`{keyReference, publicKeySha256, humanName}`) must pass all three local
 * `own()`-gated call sites (`setup`'s already-exists branch, `sign-intent`,
 * `approve`/`approve-critical`), mirroring `po-approval-proof.mjs`'s already-
 * fixed and tested `ownTrustPolicy()` pattern.
 * ------------------------------------------------------------------------- */

test("setup's already-exists branch accepts a 3-key trust policy carrying humanName", () => {
  const dirs = fixtureDirs();
  try {
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
    const authorityPath = join(dirs.directory, "trust-policy.json");
    const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
    writeFileSync(authorityPath, `${JSON.stringify({ ...authority, humanName: "Nova the PO" }, null, 2)}\n`);
    const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn });
    assert.equal(result.ok, true);
    assert.equal(result.recovered, false);
    assert.equal(result.authority.humanName, "Nova the PO");
  } finally {
    cleanup(dirs);
  }
});

test("setup's already-exists branch still fails closed on an unrelated extra field (not humanName)", () => {
  const dirs = fixtureDirs();
  try {
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"], { spawn: fakeSetupSpawn });
    const authorityPath = join(dirs.directory, "trust-policy.json");
    const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
    writeFileSync(authorityPath, `${JSON.stringify({ ...authority, unexpectedField: "x" }, null, 2)}\n`);
    assert.throws(
      () => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn }),
      /existing trust policy does not match the local public key/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent accepts a 3-key trust policy carrying humanName", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    writeFileSync(join(dirs.directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Nova the PO" }, null, 2)}\n`);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-humanname-fixture").digest("hex");
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], { readConfirmation: () => "approve" });
    assert.equal(result.ok, true);
    const proof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    assert.equal(proof.keyReference, authority.keyReference);
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent still fails closed on an unrelated extra field (not humanName)", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    writeFileSync(join(dirs.directory, "trust-policy.json"), `${JSON.stringify({ ...authority, unexpectedField: "x" }, null, 2)}\n`);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-badfield-fixture").digest("hex");
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], { readConfirmation: () => "approve" }),
      /external trust policy does not match the local public key/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("approve-critical accepts a 3-key trust policy carrying humanName and the confirmation summary names the intent digest (fix 3)", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    const prepared = runHumanApproval([
      "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "push", "--subject-sha256", subjectSha256, "--expires-at", FAR_FUTURE,
    ], { observeCandidate: () => observed });
    const { authority } = keyFixture(dirs.directory);
    writeFileSync(join(dirs.directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Nova the PO" }, null, 2)}\n`);
    const confirmations = [];
    const result = runHumanApproval([
      "approve-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "push",
    ], { readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; } });
    assert.equal(result.ok, true);
    assert.equal(confirmations.length, 1);
    assert.match(confirmations[0], new RegExp(`intent sha256: ${prepared.intentSha256}`, "u"), "the confirmation must name the intent digest actually signed");
    const proof = JSON.parse(readFileSync(criticalArtifacts(dirs).proof, "utf8"));
    assert.equal(proof.keyReference, authority.keyReference);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * PHX-WP-POHUMAN-SIGNING-ERGO fix 2 — `feature-package-reconcile` is now an
 * accepted `--kind` for the `-critical` trio at the parser level;
 * `governance-fork-disposition` stays refused (regression guard).
 * ------------------------------------------------------------------------- */

test("parseHumanArgs accepts --kind feature-package-reconcile on the -critical commands", () => {
  for (const command of ["prepare-critical", "approve-critical", "verify-critical"]) {
    const parsed = parseHumanArgs([
      command, "--repo-root", "/repo", "--directory", "/external",
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "feature-package-reconcile", "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
    ]);
    assert.equal(parsed.error, undefined, `${command} --kind feature-package-reconcile must pass the parser gate`);
    assert.equal(parsed.kind, "feature-package-reconcile");
  }
});

test("parseHumanArgs still refuses --kind governance-fork-disposition on the -critical commands (regression guard)", () => {
  for (const command of ["prepare-critical", "approve-critical", "verify-critical"]) {
    const parsed = parseHumanArgs([
      command, "--repo-root", "/repo", "--directory", "/external",
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "governance-fork-disposition", "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
    ]);
    assert.match(parsed.error ?? "", /Usage:/u, `${command} --kind governance-fork-disposition must still be refused`);
  }
});

/* ------------------------------------------------------------------------- *
 * PHX-WP-PORT-ADR0061-AUTHORIZE-CRITICAL — porting origin/main's ADR-0061
 * single-command critical-action ceremony (`authorize-critical`), replacing
 * the two-step `prepare-critical`/`approve-critical` split for the human's
 * own act. The central proof, mirrored from origin/main's own regression
 * suite: a request left on disk by an earlier, DIFFERENT preparation (the
 * "stale request" failure mode that motivated ADR-0061 -- a failed
 * `prepare-critical` leaving a stale request that `approve-critical` then
 * silently signs) can never be the thing `authorize-critical` signs, because
 * it always writes and binds to the request it just built in the same call.
 * ------------------------------------------------------------------------- */

function criticalRequestArgs(dirs, { kind = "push", subjectSha256 = "a".repeat(64), expiresAt = FAR_FUTURE } = {}) {
  return [
    "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
    "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
    "--kind", kind, "--subject-sha256", subjectSha256, "--expires-at", expiresAt,
  ];
}

/**
 * PO-KEYDIR-01(B): mirrors production's own fallback exactly (runHumanApproval's
 * `gitCommonDir ?? repository`) -- these fixture repositories are plain tmpdirs, not
 * real Git checkouts, so `resolveGitCommonDir` (po-human-approval.mjs) always returns
 * null for them and the fingerprint falls back to the repository root itself for
 * both `gitCommonDir` and `primaryRoot`. Never hardcodes a hex value: computed the
 * same way production computes it, from the same derivePoGateRepositoryFingerprint()
 * this script reuses.
 */
function repositoryFingerprintFor(repoRoot) {
  const repository = resolve(repoRoot);
  return derivePoGateRepositoryFingerprint({ gitCommonDir: repository, primaryRoot: repository }).slice(0, 12);
}

function criticalArtifacts(dirs, kind = "push") {
  const fp = repositoryFingerprintFor(dirs.repoRoot);
  return {
    request: join(dirs.directory, `request-${fp}-critical-${kind}.json`),
    proof: join(dirs.directory, `proof-${fp}-critical-${kind}.json`),
    intent: join(dirs.directory, `intent-${fp}-critical-${kind}.txt`),
    signature: join(dirs.directory, `signature-${fp}-critical-${kind}.bin`),
    signer: join(dirs.directory, `signer-${fp}-critical-${kind}.json`),
  };
}

test("authorize-critical prepares and signs in ONE invocation, and the proof is bound to the request built in that same invocation", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = criticalDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-subject");
    const action = { kind: "push", subjectSha256, expiresAt };
    const writes = []; const prompts = [];
    const dependencies = {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
      writeFile: (path, data, options) => { writes.push({ path, data }); return writeFileSync(path, data, options); },
    };

    const result = runHumanApproval(criticalArgv("authorize-critical", dirs, { subjectSha256, expiresAt }), dependencies);
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
    assert.deepEqual(result.candidate, { ...CANDIDATE });
    assert.deepEqual(result.action, action);

    // Binding by construction: the first four writes are the durable external
    // request, exact digest, proof, and signer. The remaining four are public
    // mirrors for the following agent-side push approval; none names the
    // external key directory in that agent-facing command.
    const fp = repositoryFingerprintFor(dirs.repoRoot);
    assert.deepEqual(writes.map((entry) => basename(entry.path)), [
      `request-${fp}-critical-push.json`, `intent-${fp}-critical-push.txt`, `proof-${fp}-critical-push.json`, `signer-${fp}-critical-push.json`,
      `critical-push-request-${fp}.json`, `critical-push-proof-${fp}.json`, `critical-push-authority-${fp}.json`, `critical-push-signer-${fp}.json`,
    ]);
    const request = JSON.parse(writes[0].data);
    assert.equal(writes[1].data, request.approvalIntent.sha256, "the bytes signed by OpenSSL must be this invocation's own intent digest");
    assert.equal(JSON.parse(writes[2].data).intentSha256, request.approvalIntent.sha256);
    assert.equal(result.intentSha256, request.approvalIntent.sha256);
    // SETUP-1: the signer is recorded on this critical-action approval too.
    const signerWritten = JSON.parse(writes[3].data);
    assert.equal(signerWritten.keyReference, authority.keyReference);
    assert.equal(signerWritten.publicKeySha256, authority.publicKeySha256);
    assert.equal(signerWritten.humanName, "Test Operator");
    assert.deepEqual(result.signer, signerWritten);

    // The request is the library's construction of the declared inputs, not a re-derivation.
    const rebuilt = createCriticalActionApprovalRequest({
      candidate: { ...CANDIDATE },
      featureId: FEATURE_ID,
      planBytes: readFileSync(join(dirs.repoRoot, PLAN)),
      specBytes: readFileSync(join(dirs.repoRoot, SPEC)),
      action,
    });
    assert.equal(request.approvalIntent.sha256, rebuilt.approvalIntent.sha256);

    const paths = criticalArtifacts(dirs);
    assert.deepEqual(JSON.parse(readFileSync(paths.request, "utf8")), request, "the durable request must be the signed one");
    const proof = JSON.parse(readFileSync(paths.proof, "utf8"));
    assert.equal(proof.schema, PO_APPROVAL_PROOF_SCHEMA);
    assert.equal(proof.keyReference, authority.keyReference);
    const verified = verifyCriticalActionApprovalRequest({ request, trustPolicy: authority, proof, expectedCandidate: { ...CANDIDATE }, expectedAction: action });
    assert.equal(verified.verified, true);
    assert.equal(verified.code, "CRITICAL-ACTION-PROOF-VERIFIED");

    // Agent-side approval consumes the exact repo-local mirror, never a path
    // in the human's external key directory.
    const scratchPaths = {
      request: join(dirs.repoRoot, "scratch", `critical-push-request-${fp}.json`),
      proof: join(dirs.repoRoot, "scratch", `critical-push-proof-${fp}.json`),
      authority: join(dirs.repoRoot, "scratch", `critical-push-authority-${fp}.json`),
      signer: join(dirs.repoRoot, "scratch", `critical-push-signer-${fp}.json`),
    };
    assert.deepEqual(result.paths, scratchPaths);
    assert.deepEqual(JSON.parse(readFileSync(scratchPaths.request, "utf8")), request);
    assert.deepEqual(JSON.parse(readFileSync(scratchPaths.proof, "utf8")), proof);
    assert.equal(readFileSync(scratchPaths.authority, "utf8"), readFileSync(join(dirs.directory, "trust-policy.json"), "utf8"));

    // Temporary signing material is gone; only request + proof remain.
    assert.equal(existsSync(paths.intent), false);
    assert.equal(existsSync(paths.signature), false);

    // The artifacts are interchangeable with the two-invocation flow's: verify-critical reads them unchanged.
    const readback = runHumanApproval(["verify-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "push"], { observeCandidate: () => ({ ...CANDIDATE }) });
    assert.equal(readback.value.verified, true);
    assert.equal(readback.value.code, "CRITICAL-ACTION-PROOF-VERIFIED");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical states what it is about to authorize -- and what it does not cover -- before the passphrase prompt", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-disclosure");
    const prompts = [];
    runHumanApproval(criticalArgv("authorize-critical", dirs, { subjectSha256, expiresAt }), {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
    });
    assert.equal(prompts.length, 1, "exactly one human confirmation, per ADR-0061 Decision 1");
    const [prompt] = prompts;
    const facts = {
      "action kind": "action kind: push",
      "candidate commit": CANDIDATE.commit,
      "candidate tree": CANDIDATE.tree,
      "subject binding": subjectSha256,
      "expiry": expiresAt,
    };
    for (const [label, fact] of Object.entries(facts)) {
      assert.ok(prompt.includes(fact), `the disclosure must state the ${label}`);
    }
    assert.match(prompt, /does not cover/iu, "the disclosure must state what the approval does NOT cover");
    assert.match(prompt, /type exactly "approve"/iu, "the existing typed-token gate must still be the last thing asked");
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * ADR-0064: release-preflight as a fourth critical-action kind, and the
 * additive --subject preimage input (kind-agnostic, but load-bearing for
 * this kind's confirmation disclosure).
 * ------------------------------------------------------------------ */

const RELEASE_PREFLIGHT_SUBJECT = Object.freeze({
  schema: "pipeline.release-preflight-consent-subject.v1",
  version: "1.4.0",
  base: { commit: "e".repeat(40), tree: "f".repeat(40) },
  lifecycle: { featureId: "nova-a6", manifestPath: "specs/nova-a6/lifecycle.json", manifestSha256: "1".repeat(64) },
  retentionPolicySha256: "2".repeat(64),
});

test("authorize-critical --kind release-preflight with --subject derives --subject-sha256 and shows the decoded subject plus the kind-specific scope sentence", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    writeFileSync(join(dirs.repoRoot, "subject.json"), `${JSON.stringify(RELEASE_PREFLIGHT_SUBJECT, null, 2)}\n`);
    const expiresAt = futureExpiry();
    const expected = criticalActionSubjectSha256({ kind: "release-preflight", candidate: CANDIDATE, subject: RELEASE_PREFLIGHT_SUBJECT });
    const prompts = [];
    const result = runHumanApproval([
      "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC,
      "--kind", "release-preflight", "--subject", "subject.json", "--expires-at", expiresAt,
    ], {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.action.subjectSha256, expected, "--subject-sha256 must be DERIVED from --subject, not left unset");
    assert.equal(prompts.length, 1);
    const [prompt] = prompts;
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.version), "must decode the release version");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.base.commit), "must decode the base commit");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.lifecycle.featureId), "must decode the lifecycle feature id");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.lifecycle.manifestPath), "must decode the lifecycle manifest path");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.lifecycle.manifestSha256), "must decode the lifecycle manifest sha256");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.retentionPolicySha256), "must decode the retention policy sha256");
    assert.match(prompt, /not a release, not a publication authorization/u, "must state the kind-specific scope sentence");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical --subject refuses a --subject-sha256 that disagrees with the digest it recomputes, before any prompt or write", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    writeFileSync(join(dirs.repoRoot, "subject.json"), `${JSON.stringify(RELEASE_PREFLIGHT_SUBJECT, null, 2)}\n`);
    let confirmationAsked = false;
    const dependencies = {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: () => { confirmationAsked = true; return "approve"; },
    };
    assert.throws(
      () => runHumanApproval([
        "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC,
        "--kind", "release-preflight", "--subject", "subject.json",
        "--subject-sha256", subjectDigest("wrong-subject-digest"), "--expires-at", futureExpiry(),
      ], dependencies),
      /--subject-sha256 does not match the digest computed from --subject/u,
    );
    assert.equal(confirmationAsked, false);
    assert.equal(existsSync(criticalArtifacts(dirs, "release-preflight").request), false);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical --kind release-preflight without --subject still states the kind-specific scope sentence, undecoded", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const prompts = [];
    runHumanApproval(criticalArgv("authorize-critical", dirs, { kind: "release-preflight", subjectSha256: subjectDigest("bare-digest-only"), expiresAt }), {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
    });
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /not a release, not a publication authorization/u, "the scope sentence is a fact about the KIND, shown even without a decoded preimage");
    assert.ok(!prompts[0].includes("release version:"), "nothing to decode without --subject: no field lines invented");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical --subject is kind-agnostic: it works unchanged for --kind push too", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    const pushSubject = { source: CANDIDATE.commit, remote: "origin", destination: "refs/heads/main" };
    writeFileSync(join(dirs.repoRoot, "push-subject.json"), `${JSON.stringify(pushSubject, null, 2)}\n`);
    const expected = criticalActionSubjectSha256({ kind: "push", candidate: CANDIDATE, subject: pushSubject });
    const result = runHumanApproval([
      "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC,
      "--kind", "push", "--subject", "push-subject.json", "--expires-at", futureExpiry(),
    ], { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" });
    assert.equal(result.action.subjectSha256, expected);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical aborts on an input failure before the prompt and before any signing, writing neither artifact", () => {
  const cases = [
    // GF-080 Gap B: a non-canonical but genuinely valid ISO-8601 timestamp (e.g.
    // "2026-08-07T12:00:00Z", missing explicit milliseconds) is normalized rather than
    // rejected -- see the dedicated Gap B test -- so this table only keeps inputs that
    // stay genuinely invalid: free text, and an ISO-shaped-but-out-of-range value.
    { label: "--expires-at that is not a timestamp at all", overrides: { expiresAt: "next tuesday" }, message: /--expires-at/u },
    { label: "--expires-at that is ISO-shaped but out of range (hour 25)", overrides: { expiresAt: "2026-08-07T25:00:00.000Z" }, message: /--expires-at/u },
    { label: "unreadable --plan", overrides: { plan: "missing-plan.md" }, message: /ENOENT/u },
    { label: "unreadable --spec", overrides: { spec: "missing-spec.md" }, message: /ENOENT/u },
    { label: "malformed --subject-sha256", overrides: { subjectSha256: "not-a-sha256" }, message: /--subject-sha256/u },
  ];
  for (const scenario of cases) {
    const dirs = criticalDirs();
    try {
      keyFixture(dirs.directory);
      let spawnCalled = false; let confirmationAsked = false;
      const dependencies = {
        observeCandidate: () => ({ ...CANDIDATE }),
        readConfirmation: () => { confirmationAsked = true; return "approve"; },
        spawn: () => { spawnCalled = true; return { status: 0 }; },
      };
      const argv = criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-abort"), expiresAt: futureExpiry(), ...scenario.overrides });
      assert.throws(() => runHumanApproval(argv, dependencies), scenario.message, scenario.label);
      assert.equal(confirmationAsked, false, `${scenario.label}: the human must never be prompted for an invalid request`);
      assert.equal(spawnCalled, false, `${scenario.label}: OpenSSL must never be reached`);
      const paths = criticalArtifacts(dirs);
      assert.equal(existsSync(paths.request), false, `${scenario.label}: no request artifact`);
      assert.equal(existsSync(paths.proof), false, `${scenario.label}: no proof artifact`);
    } finally {
      cleanup(dirs);
    }
  }
});

test("authorize-critical never signs a stale request left in the external directory: it prepares its own and binds to that one", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = criticalDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    const paths = criticalArtifacts(dirs);
    const staleAction = { kind: "push", subjectSha256: subjectDigest("stale-subject"), expiresAt: futureExpiry() };
    const stale = createCriticalActionApprovalRequest({
      candidate: { ...STALE_CANDIDATE },
      featureId: "stale-feature",
      planBytes: Buffer.from("# stale plan\n"),
      specBytes: Buffer.from("# stale spec\n"),
      action: staleAction,
    });
    writeFileSync(paths.request, `${JSON.stringify(stale, null, 2)}\n`);

    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-fresh-subject");
    const action = { kind: "push", subjectSha256, expiresAt };
    const result = runHumanApproval(criticalArgv("authorize-critical", dirs, { subjectSha256, expiresAt }), {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: () => "approve",
    });

    const request = JSON.parse(readFileSync(paths.request, "utf8"));
    assert.deepEqual(request.candidate, { ...CANDIDATE }, "the stale request must have been replaced, not signed");
    assert.deepEqual(request.action, action);
    assert.equal(result.intentSha256, request.approvalIntent.sha256);
    assert.notEqual(result.intentSha256, stale.approvalIntent.sha256);

    const proof = JSON.parse(readFileSync(paths.proof, "utf8"));
    assert.equal(proof.intentSha256, request.approvalIntent.sha256);
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy: authority, proof, expectedCandidate: { ...CANDIDATE }, expectedAction: action }).verified, true);
    // The decisive assertion: the produced proof authorizes nothing about the stale request.
    const staleVerified = verifyCriticalActionApprovalRequest({ request: stale, trustPolicy: authority, proof, expectedCandidate: { ...STALE_CANDIDATE }, expectedAction: staleAction });
    assert.equal(staleVerified.verified, false);
    assert.equal(staleVerified.code, "CRITICAL-ACTION-EXTERNAL-AUTHORITY-REQUIRED");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical still requires the literal word approve: anything else cancels before OpenSSL and writes no proof", () => {
  for (const answer of ["nope", "", "APPROVE", "yes", "approve "]) {
    const dirs = criticalDirs();
    try {
      keyFixture(dirs.directory);
      let spawnCalled = false;
      const argv = criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-cancel"), expiresAt: futureExpiry() });
      assert.throws(
        () => runHumanApproval(argv, { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => answer, spawn: () => { spawnCalled = true; return { status: 0 }; } }),
        /approval cancelled: explicit confirmation was not given/u,
        `answer ${JSON.stringify(answer)} must cancel`,
      );
      assert.equal(spawnCalled, false);
      const paths = criticalArtifacts(dirs);
      assert.equal(existsSync(paths.proof), false, "a cancelled ceremony must leave no proof");
      assert.equal(existsSync(paths.signature), false);
      assert.equal(existsSync(paths.intent), false);
      // The request of THIS invocation stays on disk; it is this command's own, never a
      // signature, and the next authorize-critical overwrites it before reading anything.
      assert.deepEqual(JSON.parse(readFileSync(paths.request, "utf8")).candidate, { ...CANDIDATE });
    } finally {
      cleanup(dirs);
    }
  }
});

test("authorize-critical fails closed before setup and prepares nothing when key material is absent", () => {
  const dirs = criticalDirs();
  try {
    const argv = criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-nokey"), expiresAt: futureExpiry() });
    assert.throws(
      () => runHumanApproval(argv, { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" }),
      /run setup before authorize-critical/u,
    );
    const paths = criticalArtifacts(dirs);
    assert.equal(existsSync(paths.request), false);
    assert.equal(existsSync(paths.proof), false);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical fails closed before setup and prepares nothing when key material is absent (fixtureDirs variant)", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    assert.throws(
      () => runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs)], {}),
      /run setup before authorize-critical/u,
    );
    assert.equal(existsSync(criticalArtifacts(dirs).request), false, "no request may be written before key material is confirmed present");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical requires a feature id, exactly as prepare-critical does", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    assert.throws(
      () => runHumanApproval([
        "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--plan", PLAN, "--spec", SPEC, "--kind", "push",
        "--subject-sha256", subjectDigest("nova-onecmd-nofeature"), "--expires-at", futureExpiry(),
      ], { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" }),
      /critical approval requires a feature id/u,
    );
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical requires a feature id, exactly as prepare-critical does (fixtureDirs variant)", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    assert.throws(
      () => runHumanApproval([
        "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--plan", "plan.md", "--spec", "spec.md",
        "--kind", "push", "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
      ], {}),
      /critical approval requires a feature id/u,
    );
  } finally {
    cleanup(dirs);
  }
});

test("the agent-facing approval gate cannot invoke authorize-critical: signing stays on the human terminal", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    assert.throws(
      () => runApprovalGate(criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-gate"), expiresAt: futureExpiry() }), {}),
      /Usage: po-approval-gate\.mjs/u,
    );
    assert.equal(existsSync(criticalArtifacts(dirs).proof), false);
  } finally {
    cleanup(dirs);
  }
});

test("prepare-critical names the offending field instead of only saying the request is invalid", () => {
  const dirs = criticalDirs();
  try {
    const base = { subjectSha256: subjectDigest("nova-onecmd-fieldnames"), expiresAt: futureExpiry() };
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }) };

    // GF-080 Gap B: parsable ISO-8601 that is not already the exact `toISOString()` round
    // trip is normalized, not rejected (see the dedicated Gap B test below) -- the
    // remaining field-naming coverage here uses inputs that stay genuinely invalid either
    // way.
    assert.throws(
      () => runApprovalGate(criticalArgv("prepare-critical", dirs, { ...base, subjectSha256: "0xdeadbeef" }), dependencies),
      /critical approval request is invalid: --subject-sha256/u,
    );
    assert.throws(
      () => runApprovalGate([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--spec", SPEC, "--kind", "push",
        "--subject-sha256", base.subjectSha256, "--expires-at", base.expiresAt,
      ], dependencies),
      /critical approval request is invalid: --plan/u,
    );
    assert.throws(
      () => runApprovalGate([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--plan", PLAN, "--kind", "push",
        "--subject-sha256", base.subjectSha256, "--expires-at", base.expiresAt,
      ], dependencies),
      /critical approval request is invalid: --spec/u,
    );
    assert.throws(
      () => runApprovalGate([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC, "--kind", "push",
        "--subject-sha256", base.subjectSha256,
      ], dependencies),
      /critical approval request is invalid: --expires-at is required/u,
    );
  } finally {
    cleanup(dirs);
  }
});

test("GF-080 Gap B: --expires-at accepts any parseable ISO-8601 timestamp and normalizes it to the exact Date#toISOString() form used everywhere downstream", () => {
  const dirs = criticalDirs();
  const canonicalDirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    keyFixture(canonicalDirs.directory);
    const subjectSha256 = subjectDigest("gap-b-normalize-subject");
    // The exact input that cost a real PO round trip: valid ISO-8601, just without
    // explicit milliseconds -- previously rejected outright even though Date.parse
    // accepts it fine.
    const nonCanonical = "2026-08-10T03:00:00Z";
    const canonical = new Date(Date.parse(nonCanonical)).toISOString();
    assert.equal(canonical, "2026-08-10T03:00:00.000Z");
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }) };

    const viaNonCanonical = runApprovalGate(criticalArgv("prepare-critical", dirs, { subjectSha256, expiresAt: nonCanonical }), dependencies);
    assert.equal(viaNonCanonical.code, "PO-HUMAN-CRITICAL-REQUEST-READY");
    assert.equal(viaNonCanonical.action.expiresAt, canonical, "a non-canonical but valid timestamp must be normalized, never rejected");

    const stored = JSON.parse(readFileSync(criticalArtifacts(dirs).request, "utf8"));
    assert.equal(stored.action.expiresAt, canonical, "the stored request must carry the normalized value, not the human's original spelling");

    // Normalization happens before the digest is computed, not after: an already-canonical
    // input of the identical instant must produce the byte-identical digest.
    const viaCanonical = runApprovalGate(criticalArgv("prepare-critical", canonicalDirs, { subjectSha256, expiresAt: canonical }), dependencies);
    assert.equal(viaNonCanonical.intentSha256, viaCanonical.intentSha256, "a non-canonical and an already-canonical spelling of the same instant must bind to the identical digest");
  } finally {
    cleanup(dirs);
    cleanup(canonicalDirs);
  }
});

test("the two-invocation prepare-critical + approve-critical flow is unchanged and still yields a verifiable proof", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = criticalDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-two-step");
    const action = { kind: "push", subjectSha256, expiresAt };
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" };

    const prepared = runApprovalGate(criticalArgv("prepare-critical", dirs, { subjectSha256, expiresAt }), dependencies);
    assert.equal(prepared.code, "PO-HUMAN-CRITICAL-REQUEST-READY");
    assert.deepEqual(prepared.candidate, { ...CANDIDATE });
    assert.deepEqual(prepared.action, action);

    const approved = runHumanApproval(["approve-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "push"], dependencies);
    assert.equal(approved.code, "PO-HUMAN-PROOF-READY");
    assert.equal(approved.intentSha256, prepared.intentSha256);

    const paths = criticalArtifacts(dirs);
    const request = JSON.parse(readFileSync(paths.request, "utf8"));
    const proof = JSON.parse(readFileSync(paths.proof, "utf8"));
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy: authority, proof, expectedCandidate: { ...CANDIDATE }, expectedAction: action }).verified, true);
    assert.equal(existsSync(paths.intent), false);
    assert.equal(existsSync(paths.signature), false);

    // NVA-CLI-FEEDBACK-1: both halves of the two-invocation flow state the
    // paths they each just wrote.
    assert.deepEqual(prepared.paths, { request: paths.request });
    assert.deepEqual(approved.paths, { proof: paths.proof, signer: paths.signer });
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * CEREMONY-1: sign-intent tells the human what they are approving.
 *
 * The digest stays the only thing the signature covers. What changes is that the
 * command resolves the RECORDED request behind that digest and states its reason,
 * scope and expiry -- and, when it cannot resolve one, says exactly that instead of
 * inventing a description (ADR-0061 Decision 4).
 * ------------------------------------------------------------------ */

const WINDOW_REASON = "fix the release-preflight base-commit peel inside the live plugin tree";

/** A real git repository plus a synthetic live plugin root, the two things a GMW request binds. */
function windowFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), "po-gmw-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
  writeFileSync(join(repoRoot, "README.md"), "# fixture\n");
  execFileSync("git", ["add", "-A"], { cwd: repoRoot });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoRoot });
  const plugin = mkdtempSync(join(tmpdir(), "po-gmw-plugin-"));
  mkdirSync(join(plugin, "hooks"), { recursive: true });
  writeFileSync(join(plugin, "hooks", "guard-example.mjs"), "// example\n");
  return { repoRoot, directory: mkdtempSync(join(tmpdir(), "po-gmw-external-")), plugin };
}

function cleanupWindow(dirs) {
  cleanup(dirs);
  rmSync(dirs.plugin, { recursive: true, force: true });
}

function prepareWindow(dirs, { scopeRuleIds = ["GS-6", "TP-1"], reason = WINDOW_REASON, ttlSeconds = 900 } = {}) {
  return gmw.prepareGuardMaintenanceWindowRequest({
    rootDir: dirs.repoRoot,
    scopeRuleIds,
    ttlSeconds,
    reason,
    featureId: "sprint-nova-epic",
    planSha256: "a".repeat(64),
    specSha256: "b".repeat(64),
    policyRevision: "gmw-test-v1",
    livePluginRoot: dirs.plugin,
    authorshipMode: "goldfish-dispatch",
  });
}

/**
 * NVA-SIGENTRY-1: `sign-intent` resolving an HGO signature-mode selection, the second
 * half of the closed blind-signature gap (backlog/items/2026-08-08-the-signing-
 * ceremony-is-designed-for-the-verifier-not-the-signer.md finding 7).
 *
 * PLUGIN_ROOT here must be THIS checkout's own real `plugins/pipeline-core` directory
 * (never a synthetic fixture directory the way `windowFixture()`'s `plugin` root is for
 * GMW) -- `sign-intent`'s production code resolves its own `PLUGIN_ROOT` from
 * `import.meta.url` the same way `guard-human-override.mjs` does, so a fixture-recorded
 * HGO request must use the identical real plugin identity for pluginIdentity() to match
 * when `sign-intent` itself later re-plans the same request.
 */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HGO_SIGNATURE_INTENT_PLAN_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-plan.v1").digest("hex");
const HGO_SIGNATURE_INTENT_SPEC_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-spec.v1").digest("hex");

/** A real git repository committing signature mode, the topology an HGO request binds. */
function hgoFixtureDirs() {
  const repoRoot = mkdtempSync(join(tmpdir(), "po-hgo-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
  writeFileSync(join(repoRoot, "README.md"), "# fixture\n");
  writeFileSync(join(repoRoot, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  execFileSync("git", ["add", "-A"], { cwd: repoRoot });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoRoot });
  return { repoRoot, directory: mkdtempSync(join(tmpdir(), "po-hgo-external-")) };
}

/** denial -> plan -> prepare-authorization (fixed HGO_SIGNATURE_REASON) -> the independently-reconstructed intent digest sign-intent must resolve, mirroring lib/human-guard-override.test.mjs's prepareSignedArming() shape without calling into any of this module's own new exports. */
function armHgoRequest(repoRoot, toolInput) {
  const denials = [{ guard: "guard-devplan.mjs", reason: "GUARD-DEVPLAN-NOT-READY" }];
  const recorded = recordHumanGuardDenial({ rootDir: repoRoot, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials });
  assert.equal(recorded.status, "planned", `HGO fixture denial not plannable: ${JSON.stringify(recorded)}`);
  const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
  const plan = planHumanGuardOverride({ rootDir: repoRoot, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, scriptPath });
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir: repoRoot, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, scriptPath,
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
  return { requestSha256: recorded.requestSha256, planSha256: plan.planSha256, intent };
}

test("NVA-SIGENTRY-1: sign-intent resolves an HGO signature-mode intent digest and shows its eligible paths, denying rationale and expiry", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = hgoFixtureDirs();
  try {
    keyFixture(dirs.directory);
    const armed = armHgoRequest(dirs.repoRoot, { file_path: "notes.md", content: "hgo sign-intent\n" });
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", armed.intent.sha256],
      disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.intentSha256, armed.intent.sha256);
    assert.equal(prompts.length, 1, "still exactly one human confirmation (ADR-0061 Decision 1)");
    const [prompt] = prompts;
    assert.ok(prompt.includes(armed.intent.sha256), "the digest being signed must still be named");
    assert.ok(prompt.includes("notes.md"), "the eligible path must be shown");
    assert.ok(prompt.includes("GUARD-DEVPLAN-NOT-READY"), "the denying guard's rationale must be shown");
    assert.match(prompt, /expires at/iu, "the recorded expiry must be shown");
    assert.doesNotMatch(prompt, /no recorded request/iu, "must not fall into the cannot-describe fallback");

    const proof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    assert.equal(proof.intentSha256, armed.intent.sha256, "the signature still covers the digest, nothing the summary said");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SIGENTRY-1: a digest resolving to neither a GMW request nor an HGO request still falls into the honest fallback, unchanged", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = hgoFixtureDirs();
  try {
    keyFixture(dirs.directory);
    // A real, resolvable HGO request IS stored -- proving the new resolver is additive
    // (it enumerates a non-empty store) rather than the GMW-only-fallback case already
    // covered elsewhere, where nothing is stored at all.
    armHgoRequest(dirs.repoRoot, { file_path: "notes.md", content: "hgo present but unrelated\n" });
    const unrelated = createHash("sha256").update("neither gmw nor hgo resolves this").digest("hex");
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const prompts = [];
    runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", unrelated],
      disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
    );
    const [prompt] = prompts;
    assert.ok(prompt.includes(unrelated), "the digest is still named");
    assert.match(prompt, /no recorded request/iu, "the absence of a record must be stated explicitly");
    assert.equal(prompt.includes("notes.md"), false, "the unrelated stored HGO request's path must never be shown");
    assert.match(prompt, /guard-lift\/guard-override/u, "the generic consequence class stays stated when nothing better is known");
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent states the reason, scope and expiry of the request recorded behind the digest", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = windowFixture();
  try {
    keyFixture(dirs.directory);
    const prepared = prepareWindow(dirs);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", prepared.intent.sha256],
      disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(result.intentSha256, prepared.intent.sha256);
    assert.equal(result.signer.humanName, "Test Operator");
    assert.equal(prompts.length, 1, "still exactly one human confirmation (ADR-0061 Decision 1)");
    const [prompt] = prompts;
    assert.ok(prompt.includes(prepared.intent.sha256), "the digest being signed must still be named");
    assert.ok(prompt.includes(WINDOW_REASON), "the recorded reason must be shown");
    assert.ok(prompt.includes("GS-6") && prompt.includes("TP-1"), "the recorded scope must be shown");
    assert.ok(prompt.includes(new Date(prepared.subject.expiresAtMs).toISOString()), "the recorded expiry must be shown");
    assert.ok(prompt.includes("guard-lift"), "the recorded action kind must be shown");
    // TR-S1-T4 (Ruling 83): the typed-token instruction line is not part of the stdout disclosure, so its assertion is gone.

    const proof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    assert.equal(proof.intentSha256, prepared.intent.sha256, "the signature still covers the digest, nothing the summary said");
  } finally {
    cleanupWindow(dirs);
  }
});

test("sign-intent says so plainly when no record resolves for the digest, and invents nothing", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = windowFixture();
  try {
    keyFixture(dirs.directory);
    prepareWindow(dirs);
    const unrelated = createHash("sha256").update("some other intent entirely").digest("hex");
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const prompts = [];
    runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", unrelated],
      disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
    );
    const [prompt] = prompts;
    assert.ok(prompt.includes(unrelated), "the digest is still named");
    assert.match(prompt, /no recorded request/iu, "the absence of a record must be stated explicitly");
    assert.equal(prompt.includes(WINDOW_REASON), false, "another request's reason must never be shown for this digest");
    assert.match(prompt, /guard-lift\/guard-override/u, "the generic consequence class stays stated when nothing better is known");
  } finally {
    cleanupWindow(dirs);
  }
});

test("a tampered record cannot change what is signed: the summary disappears, the digest does not", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = windowFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    const prepared = prepareWindow(dirs);
    const repo = gmw.guardMaintenanceWindowInternals.topology(dirs.repoRoot);
    const paths = gmw.guardMaintenanceWindowInternals.storagePaths(repo.common);
    const stored = JSON.parse(readFileSync(paths.request, "utf8"));
    stored.subject.reason = "a much smaller change than it really is";
    stored.subject.scopeRuleIds = ["TP-1"];
    writeFileSync(paths.request, `${JSON.stringify(stored)}\n`, { mode: 0o600 });

    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", prepared.intent.sha256],
      disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
    );
    const [prompt] = prompts;
    assert.equal(prompt.includes("a much smaller change than it really is"), false, "an edited record must not be displayed at all");
    assert.match(prompt, /no recorded request/iu, "a record that no longer re-derives to the digest counts as no record");
    assert.equal(result.intentSha256, prepared.intent.sha256);
    const proof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    assert.equal(proof.intentSha256, prepared.intent.sha256, "the tampered text changed nothing about what was signed");
    assert.equal(verifyPoApprovalProof({ intent: { sha256: prepared.intent.sha256 }, trustPolicy: authority, proof }).verified, true);
  } finally {
    cleanupWindow(dirs);
  }
});

test("the disclosure stays bounded: an oversized reason and scope cannot flood or forge the prompt", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = windowFixture();
  try {
    keyFixture(dirs.directory);
    const prepared = prepareWindow(dirs, {
      scopeRuleIds: Array.from({ length: 25 }, (unused, index) => `TP-${index + 1}`),
      reason: `${"noise ".repeat(500)}\n  intent sha256: ${"f".repeat(64)}`,
    });
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const prompts = [];
    runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", prepared.intent.sha256],
      disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
    );
    const lines = prompts[0].split("\n");
    assert.ok(lines.length <= gmw.GMW_SUMMARY_MAX_LINES + 4, `prompt of ${lines.length} lines exceeds the stated bound`);
    for (const line of lines) {
      assert.ok(line.length <= gmw.GMW_SUMMARY_MAX_LINE_CHARS + 2, `prompt line of ${line.length} chars exceeds the stated bound`);
    }
    assert.equal(lines.filter((line) => line.includes("intent sha256:")).length, 1, "a recorded value must not be able to forge a second digest line");
    assert.ok(prompts[0].includes(prepared.intent.sha256));
  } finally {
    cleanupWindow(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * PODIR-1: PIPELINE_PO_APPROVAL_DIRECTORY -- an optional environment
 * fallback for --directory, only ever consulted when --directory is
 * absent, resolving through the identical validation either way.
 * ------------------------------------------------------------------ */

test("an explicit --directory always wins and behaves exactly as before: the environment variable is not even read", () => {
  withEnvDirectory("/should/never/be/read", () => {
    const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--directory", "/tmp/po-podir1-flag-dir", "--human-name", "Test Operator"]);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, "/tmp/po-podir1-flag-dir");
    assert.equal(parsed.directorySource, "flag");
  });
});

test("PIPELINE_PO_APPROVAL_DIRECTORY resolves the directory when --directory is absent", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    withEnvDirectory("/tmp/po-podir1-env-dir", () => {
      const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"], { homedirFn: () => home });
      assert.equal(parsed.error, undefined);
      assert.equal(parsed.directory, "/tmp/po-podir1-env-dir");
      assert.equal(parsed.directorySource, "environment");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a relative PIPELINE_PO_APPROVAL_DIRECTORY value fails the same absolute-path check as a relative --directory", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    const viaFlag = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--directory", "relative/dir"], { homedirFn: () => home });
    assert.match(viaFlag.error, /Usage:/u);

    const viaEnv = withEnvDirectory("relative/dir", () => parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo"], { homedirFn: () => home }));
    assert.match(viaEnv.error, /Usage:/u);
    assert.match(viaEnv.error, /must be an absolute path/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("NVA-SIGDISCLOSE-1 Finding 8: a bad --repo-root (e.g. '.') explains the problem and how to fix it, not only the bare usage dump", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    const dot = parseHumanArgs(["setup", "--repo-root", ".", "--directory", "/tmp/po-podir1-flag-dir"], { homedirFn: () => home });
    assert.match(dot.error, /Usage:/u);
    assert.match(dot.error, /repository root is required/u, "the error must explain WHAT is wrong, not only dump the usage string");
    assert.match(dot.error, /--repo-root/u, "the error must name the failing flag");
    assert.match(dot.error, /absolute path/u, "the error must state the valid way to supply it (an absolute path)");

    const missing = parseHumanArgs(["setup", "--directory", "/tmp/po-podir1-flag-dir"], { homedirFn: () => home });
    assert.match(missing.error, /repository root is required/u, "an entirely absent --repo-root gets the same explained message");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("when neither --directory nor the machine plane nor PIPELINE_PO_APPROVAL_DIRECTORY is present, the usage error names all three routes and prints no path", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    withEnvDirectory(undefined, () => {
      const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo"], { homedirFn: () => home });
      assert.match(parsed.error, /Usage:/u);
      assert.match(parsed.error, /--directory/u, "the usage error must name the flag");
      assert.match(parsed.error, /machine-scoped configuration plane/u, "the usage error must name the machine plane route (AC-15)");
      assert.match(parsed.error, new RegExp(PO_APPROVAL_DIRECTORY_ENV, "u"), "the usage error must name the environment variable as the alternative");
      assert.doesNotMatch(parsed.error, /\/tmp\//u, "there is nothing resolved yet, so no path may appear in the message");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("an unsafe directory fed through PIPELINE_PO_APPROVAL_DIRECTORY is refused exactly like the same unsafe value passed via --directory, and the refusal names its own source without printing the path", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    // "unsafe": a directory inside the repository, which externalDirectory()'s outside()
    // check must reject no matter which route the path arrived by -- there is no weaker
    // route for an environment-resolved value than for a flag-supplied one.
    const insideRepo = join(dirs.repoRoot, "not-outside-the-repo");
    mkdirSync(insideRepo, { recursive: true });

    const viaFlagError = thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", insideRepo, "--human-name", "Test Operator"], { homedirFn: () => home }));
    assert.ok(viaFlagError, "an unsafe --directory must be refused");
    assert.match(viaFlagError.message, /approval directory \(from --directory\) must be outside the repository/u);

    const viaEnvError = withEnvDirectory(insideRepo, () => thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"], { homedirFn: () => home })));
    assert.ok(viaEnvError, "the identical unsafe value must be refused when it arrives via the environment");
    assert.match(viaEnvError.message, new RegExp(`approval directory \\(from the ${PO_APPROVAL_DIRECTORY_ENV} environment variable\\) must be outside the repository`, "u"));

    // Same refusal reason either way -- the two messages differ only in which source is named.
    assert.equal(
      viaFlagError.message.replace("--directory", "SOURCE"),
      viaEnvError.message.replace(`the ${PO_APPROVAL_DIRECTORY_ENV} environment variable`, "SOURCE"),
    );
    assert.equal(viaEnvError.message.includes(insideRepo), false, "the resolved absolute path must never appear in the refusal message");
    assert.equal(viaFlagError.message.includes(insideRepo), false);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("PIPELINE_PO_APPROVAL_DIRECTORY runs a full sign-intent ceremony exactly like the same value passed via --directory", { skip: REQUIRES_OPENSSL }, () => {
  // Deliberately NOT `setup`: that subcommand's real branch shells out to
  // `openssl genpkey -aes-256-cbc`, which blocks on an interactive passphrase
  // prompt with no dependency-injection seam in this suite (every other test in
  // this file provisions key material through the non-interactive `keyFixture()`
  // helper instead, and this one does the same for the same reason).
  const dirsFlag = fixtureDirs();
  const dirsEnv = fixtureDirs();
  const home = outsideRepoHomeFixture(); // R7-6-T11 (decision AC): the sign-intent probe needs a home outside every repository
  try {
    const { authority: authorityFlag } = keyFixture(dirsFlag.directory);
    anchorFixtureKey(dirsFlag.repoRoot, dirsFlag.directory);
    const { authority: authorityEnv } = keyFixture(dirsEnv.directory);
    anchorFixtureKey(dirsEnv.repoRoot, dirsEnv.directory);
    const intentSha256Flag = createHash("sha256").update("podir-1-parity-flag-fixture").digest("hex");
    const intentSha256Env = createHash("sha256").update("podir-1-parity-env-fixture").digest("hex");
    const dependencies = { readConfirmation: () => "approve", homedirFn: () => home };

    const viaFlag = runHumanApproval(["sign-intent", "--repo-root", dirsFlag.repoRoot, "--directory", dirsFlag.directory, "--intent-sha256", intentSha256Flag], dependencies);
    assert.equal(viaFlag.ok, true);
    assert.equal(viaFlag.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(viaFlag.intentSha256, intentSha256Flag);

    const viaEnv = withEnvDirectory(dirsEnv.directory, () => runHumanApproval(["sign-intent", "--repo-root", dirsEnv.repoRoot, "--intent-sha256", intentSha256Env], dependencies));
    assert.equal(viaEnv.ok, true);
    assert.equal(viaEnv.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(viaEnv.intentSha256, intentSha256Env);

    const proofFlag = JSON.parse(readFileSync(viaFlag.paths.proof, "utf8"));
    const proofEnv = JSON.parse(readFileSync(viaEnv.paths.proof, "utf8"));
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256Flag }, trustPolicy: authorityFlag, proof: proofFlag }).verified, true);
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256Env }, trustPolicy: authorityEnv, proof: proofEnv }).verified, true);
  } finally {
    cleanup(dirsFlag);
    cleanup(dirsEnv);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * SETUP-2b: the machine-scoped configuration plane's poKeyDirectory,
 * resolved with the precedence AC-11 specifies -- flag, then plane, then
 * PIPELINE_PO_APPROVAL_DIRECTORY, then the "directory is required" error.
 * ------------------------------------------------------------------ */

// Realigned to PO decision AC (2026-10-07, specs/sprint-alfred-epic/plans/r7-6-multi-key-aa.md): the environment variable
// is the per-terminal selection of a non-default key and now wins over the machine plane; the plane resolves without it.
test("AC-11: PIPELINE_PO_APPROVAL_DIRECTORY wins over the machine plane's poKeyDirectory when --directory is absent; the plane resolves the directory only when the variable is unset", () => {
  const dirs = fixtureDirs();
  const envDirectory = mkdtempSync(join(tmpdir(), "po-env-wins-"));
  const home = machinePlaneHomeFixture(dirs.directory);
  try {
    const argv = ["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"];
    const viaEnv = withEnvDirectory(envDirectory, () => parseHumanArgs(argv, { homedirFn: () => home }));
    assert.equal(viaEnv.error, undefined);
    assert.equal(viaEnv.directory, envDirectory, "decision AC: the environment variable beats the machine plane");
    assert.equal(viaEnv.directorySource, "environment");
    const viaPlane = withEnvDirectory(undefined, () => parseHumanArgs(argv, { homedirFn: () => home }));
    assert.equal(viaPlane.error, undefined);
    assert.equal(viaPlane.directory, dirs.directory);
    assert.equal(viaPlane.directorySource, "machine-plane");
  } finally {
    cleanup(dirs);
    rmSync(envDirectory, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-11/AC-13: an explicit --directory still wins over a present, valid machine plane", () => {
  const dirs = fixtureDirs();
  const otherDirectory = mkdtempSync(join(tmpdir(), "po-machine-plane-unused-"));
  const home = machinePlaneHomeFixture(otherDirectory);
  try {
    const parsed = parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"],
      { homedirFn: () => home },
    );
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, dirs.directory);
    assert.equal(parsed.directorySource, "flag");
  } finally {
    cleanup(dirs);
    rmSync(otherDirectory, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

// Realigned to PO decision AC (2026-10-07): the plane is consulted only when no higher tier resolves, so an invalid plane
// fails closed there, while PIPELINE_PO_APPROVAL_DIRECTORY or --directory resolves without consulting it.
test("AC-12: an invalid machine plane fails closed, naming the plane as the cause, when no higher tier resolves; PIPELINE_PO_APPROVAL_DIRECTORY or --directory resolves without consulting it", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
    writeFileSync(join(home, ".agent-pipeline", "machine.json"), "{ not valid json");
    const argv = ["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"];
    const parsed = withEnvDirectory(undefined, () => parseHumanArgs(argv, { homedirFn: () => home }));
    assert.match(parsed.error, /machine-scoped configuration plane is invalid/u);
    assert.match(parsed.error, /MP-MALFORMED/u);
    assert.equal(parsed.directory, undefined, "nothing resolves from an invalid plane");
    const viaEnv = withEnvDirectory("/tmp/po-podir1-env-dir", () => parseHumanArgs(argv, { homedirFn: () => home }));
    assert.equal(viaEnv.error, undefined, "decision AC: the environment variable resolves without consulting the invalid plane");
    assert.equal(viaEnv.directory, "/tmp/po-podir1-env-dir");
    assert.equal(viaEnv.directorySource, "environment");
    const viaFlag = withEnvDirectory(undefined, () => parseHumanArgs([...argv, "--directory", "/tmp/po-podir1-flag-dir"], { homedirFn: () => home }));
    assert.equal(viaFlag.error, undefined, "an explicit --directory resolves without consulting the invalid plane");
    assert.equal(viaFlag.directory, "/tmp/po-podir1-flag-dir");
    assert.equal(viaFlag.directorySource, "flag");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-12: an unreadable machine plane (a directory at the leaf) is also reported as invalid, not silently absent", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    mkdirSync(join(home, ".agent-pipeline", "machine.json"), { recursive: true });
    const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"], { homedirFn: () => home });
    assert.match(parsed.error, /machine-scoped configuration plane is invalid/u);
    assert.match(parsed.error, /MP-UNREADABLE/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-11: a valid machine plane with no poKeyDirectory configured (null) falls through to the environment variable, exactly like an absent plane", () => {
  const home = machinePlaneHomeFixture(null);
  try {
    const parsed = withEnvDirectory("/tmp/po-podir1-env-dir", () => parseHumanArgs(
      ["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"],
      { homedirFn: () => home },
    ));
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, "/tmp/po-podir1-env-dir");
    assert.equal(parsed.directorySource, "environment");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-14: a plane-sourced directory runs through the identical unsafe-directory refusal as a flag- or environment-sourced one, naming the plane as its source and never printing the path", () => {
  const dirs = fixtureDirs();
  const insideRepo = join(dirs.repoRoot, "not-outside-the-repo");
  mkdirSync(insideRepo, { recursive: true });
  const home = machinePlaneHomeFixture(insideRepo);
  try {
    const viaPlaneError = thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"], { homedirFn: () => home }));
    assert.ok(viaPlaneError, "an unsafe plane-sourced directory must be refused");
    assert.match(viaPlaneError.message, /approval directory \(from the machine-scoped configuration plane \(poKeyDirectory\)\) must be outside the repository/u);
    assert.equal(viaPlaneError.message.includes(insideRepo), false, "the resolved absolute path must never appear in the refusal message");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-11/AC-14: a full sign-intent ceremony resolved entirely from the machine plane's poKeyDirectory behaves exactly like the same directory passed via --directory", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  const home = outsideRepoHomeFixture(dirs.directory); // R7-6-T11 (decision AC): plane written in a home outside every repository, as the probe requires
  try {
    const { authority } = keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const intentSha256 = createHash("sha256").update("setup-2b-plane-parity-fixture").digest("hex");
    const result = withEnvDirectory(undefined, () => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--intent-sha256", intentSha256],
      { readConfirmation: () => "approve", homedirFn: () => home },
    ));
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    const proof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof }).verified, true);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * NVA-V1-KEYDIRPTR (backlog: 2026-08-28-a-dead-key-directory-pointer-is-
 * permanent-and-silent.md): `persistExplicitDirectoryIntoMachinePlane`'s own
 * first-write-wins predicate, exercised directly. This function has no
 * wired CLI call site today -- PO-KEYDIR-01(A) below moved `setup`'s
 * auto-persist to the repo-scoped store instead -- but its logic is still
 * what governs the machine plane's `poKeyDirectory` field, which
 * `detectExistingLocalTrustAnchor()` (project-onboarding-v3.mjs) reads.
 * ------------------------------------------------------------------ */

test("NVA-V1-KEYDIRPTR: a recorded poKeyDirectory that no longer exists on disk IS replaced by a later call", () => {
  const home = machinePlaneHomeFixture(null);
  const dead = mkdtempSync(join(tmpdir(), "po-human-approval-dead-keydir-"));
  const alive = mkdtempSync(join(tmpdir(), "po-human-approval-alive-keydir-"));
  try {
    // Seed the plane with a directory, then remove it from disk -- exactly
    // the dangling-pointer shape measured live on the development machine
    // (scratch/probe-machine-plane.mjs).
    writeMachinePlane({
      schema: MACHINE_PLANE_SCHEMA, poKeyDirectory: dead, pushApprovalDefault: "signature",
      routing: null, language: null, session: null, usage: null, updatedAt: new Date().toISOString(),
    }, { homedirFn: () => home });
    rmSync(dead, { recursive: true, force: true });

    persistExplicitDirectoryIntoMachinePlane({ directorySource: "flag" }, alive, { homedirFn: () => home });

    const after = readMachinePlane({ homedirFn: () => home });
    assert.equal(after.status, "valid");
    assert.equal(after.plane.poKeyDirectory, alive, "a dangling pointer must be replaced by a later recordPoKeyDirectory call");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(alive, { recursive: true, force: true });
  }
});

test("NVA-V1-KEYDIRPTR: a recorded poKeyDirectory that DOES exist on disk is never replaced -- the property this change must not break", () => {
  const existing = mkdtempSync(join(tmpdir(), "po-human-approval-existing-keydir-"));
  const home = machinePlaneHomeFixture(existing);
  const other = mkdtempSync(join(tmpdir(), "po-human-approval-other-keydir-"));
  try {
    persistExplicitDirectoryIntoMachinePlane({ directorySource: "flag" }, other, { homedirFn: () => home });

    const after = readMachinePlane({ homedirFn: () => home });
    assert.equal(after.status, "valid");
    assert.equal(after.plane.poKeyDirectory, existing, "a directory that still exists must never be silently overwritten by a later call");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(existing, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test("2026-08-30-po-human-approval-setup-silently-swallows-writemachineplane-error: a writeMachinePlane() failure produces a visible warning and still does not throw", () => {
  const home = machinePlaneHomeFixture(null);
  const alive = mkdtempSync(join(tmpdir(), "po-human-approval-warn-keydir-"));
  try {
    let warned = null;
    const dependencies = {
      homedirFn: () => home,
      writeMachinePlaneFn: () => { throw new Error("simulated disk-full write failure"); },
      stderrWriteFn: (text) => { warned = text; },
    };
    // Must not throw -- the best-effort "never fails setup itself" contract is unchanged.
    persistExplicitDirectoryIntoMachinePlane({ directorySource: "flag" }, alive, dependencies);
    assert.ok(warned, "a writeMachinePlane() failure must produce a visible warning instead of being swallowed silently");
    assert.match(warned, /PO-HUMAN-APPROVAL-WARN/u);
    assert.match(warned, /simulated disk-full write failure/u, "the warning must name what failed and why");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(alive, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * PO-KEYDIR-01(A), 2026-08-11 PO decision (backlog/items/2026-08-10-po-key-
 * directory-default-should-be-repo-scoped-not-machine-wide.md): `setup`'s
 * auto-persist call now targets a NEW repo-scoped store instead of the
 * machine plane (superseding GF-080 Gap A's original tests below, which
 * asserted the OLD machine-plane write target this task deliberately
 * changes). `dependencies.gitCommonDirFn` supplies a distinct fake
 * git-common-dir per fixture repository, exactly like the production seam
 * `resolveGitCommonDir` (po-human-approval.mjs) exposes -- these fixture
 * repositories are plain tmpdirs, not real Git checkouts.
 * ------------------------------------------------------------------ */

/** A fresh, writable fake git-common-dir fixture (stands in for `.git` for the
 * repo-scoped store's own location, `<gitCommonDir>/agent-pipeline/
 * po-key-directory.json`). Never a real `.git`: injected only via
 * `dependencies.gitCommonDirFn`, which the production code never routes
 * through real `git`. */
function repoScopeCommonDirFixture() {
  return mkdtempSync(join(tmpdir(), "po-human-approval-repo-scope-common-"));
}

function repoScopeStorePath(gitCommonDir) {
  return join(gitCommonDir, "agent-pipeline", "po-key-directory.json");
}

/** R7-6-T3 (D1): writes the legacy per-repository private-state value directly (the exact
 * on-disk shape readRepoKeyDirectory accepts), so a case about resolution ORDER does not depend
 * on whether setup still writes that store. */
function legacyRepoStoreFixture(gitCommonDir, poKeyDirectory) {
  mkdirSync(dirname(repoScopeStorePath(gitCommonDir)), { recursive: true });
  writeFileSync(repoScopeStorePath(gitCommonDir), JSON.stringify({
    schema: "pipeline.po-key-directory.v1", poKeyDirectory, updatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}

/** R7-6-T11 (decision AC): a fixture home OUTSIDE every repository -- the sign-intent probe takes its working
 * directory from the home and refuses one inside a repository, which is where the scratch/ homes above live.
 * With `poKeyDirectory` the machine plane is written there through the library's own writer. */
function outsideRepoHomeFixture(poKeyDirectory) {
  const home = mkdtempSync(join(tmpdir(), "po-human-approval-outside-home-"));
  if (poKeyDirectory !== undefined) {
    writeMachinePlane({
      schema: MACHINE_PLANE_SCHEMA, poKeyDirectory, pushApprovalDefault: "chat",
      routing: null, language: null, session: null, usage: null, updatedAt: new Date().toISOString(),
    }, { homedirFn: () => home });
  }
  return home;
}

/** Sorted, forward-slash listing of everything under `root`, for "nothing was written here" pins. */
function treeListing(root) {
  return readdirSync(root, { recursive: true }).map((entry) => String(entry).replaceAll("\\", "/")).sort();
}

// R7-6-T11 (decision AC, r7-6-multi-key-aa.md): setup now writes the MACHINE-WIDE default; the legacy per-repository store is read-only.
test("PO-KEYDIR-01(A): setup with an explicit --directory persists it into the MACHINE PLANE (decision AC), never the legacy REPO-SCOPED store or the repository; a later command resolves it without repeating --directory in the SAME repo and, the plane being machine-wide, in a DIFFERENT repo too", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  const home = outsideRepoHomeFixture();
  const otherRepo = mkdtempSync(join(tmpdir(), "po-gapA-other-repo-"));
  const commonA = repoScopeCommonDirFixture();
  const commonOther = repoScopeCommonDirFixture();
  try {
    keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    const repoRootA = resolve(dirs.repoRoot);
    const gitCommonDirFn = (repository) => (repository === repoRootA ? commonA : commonOther);
    const repoBefore = treeListing(dirs.repoRoot);
    const setupResult = withEnvDirectory(undefined, () => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory],
      { homedirFn: () => home, gitCommonDirFn },
    ));
    assert.equal(setupResult.ok, true);

    // The machine plane carries it.
    const plane = readMachinePlane({ homedirFn: () => home });
    assert.equal(plane.status, "valid", "setup with an explicit --directory must write the machine plane (decision AC)");
    assert.equal(realpathSync(plane.plane.poKeyDirectory), realpathSync(dirs.directory));

    // Nothing in the repository or the git-common-dir; the legacy store stays untouched.
    assert.deepEqual(treeListing(dirs.repoRoot), repoBefore, "setup writes nothing into the repository");
    assert.deepEqual(treeListing(commonA), [], "setup writes nothing into the git-common-dir");
    assert.equal(existsSync(repoScopeStorePath(commonA)), false, "the legacy per-repository store is not written");

    // A LATER command in the SAME repo, omitting --directory, resolves it from the plane.
    const intentSha256Same = createHash("sha256").update("po-keydir-01-a-same-repo-fixture").digest("hex");
    const resultSame = withEnvDirectory(undefined, () => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--intent-sha256", intentSha256Same],
      { readConfirmation: () => "approve", homedirFn: () => home, gitCommonDirFn },
    ));
    assert.equal(resultSame.ok, true);
    assert.equal(resultSame.code, "PO-HUMAN-SIGN-INTENT-READY");

    // The plane is machine-wide: the SAME resolution in a DIFFERENT repo reaches the same directory.
    const otherParsed = withEnvDirectory(undefined, () => parseHumanArgs(
      ["sign-intent", "--repo-root", otherRepo, "--intent-sha256", intentSha256Same],
      { homedirFn: () => home, gitCommonDirFn },
    ));
    assert.equal(otherParsed.error, undefined);
    assert.equal(realpathSync(otherParsed.directory), realpathSync(dirs.directory));
    assert.equal(otherParsed.directorySource, "machine-plane");
    assert.equal(existsSync(repoScopeStorePath(commonOther)), false, "another repository's legacy store is never populated either");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
    rmSync(otherRepo, { recursive: true, force: true });
    rmSync(commonA, { recursive: true, force: true });
    rmSync(commonOther, { recursive: true, force: true });
  }
});

// R7-6-T11 (decision AC): the already-populated, different value is now the MACHINE-WIDE default; the legacy store is never written.
test("PO-KEYDIR-01(A): a subsequent setup --directory <other-dir> never silently overwrites an already-populated, different MACHINE-WIDE poKeyDirectory, and never writes the legacy REPO-SCOPED store (decision AC)", () => {
  const dirs = fixtureDirs();
  const otherDirs = fixtureDirs();
  const home = outsideRepoHomeFixture();
  const common = repoScopeCommonDirFixture();
  try {
    keyFixture(dirs.directory);
    const dependencies = { homedirFn: () => home, gitCommonDirFn: () => common };
    const first = withEnvDirectory(undefined, () => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], dependencies));
    assert.equal(first.ok, true);
    const afterFirst = readMachinePlane({ homedirFn: () => home });
    assert.equal(afterFirst.status, "valid", "the first setup --directory writes the machine plane (decision AC)");
    assert.equal(realpathSync(afterFirst.plane.poKeyDirectory), realpathSync(dirs.directory));

    keyFixture(otherDirs.directory);
    const repositoriesBefore = [treeListing(dirs.repoRoot), treeListing(otherDirs.repoRoot)];
    const second = withEnvDirectory(undefined, () => runHumanApproval(
      ["setup", "--repo-root", otherDirs.repoRoot, "--directory", otherDirs.directory], dependencies));
    assert.equal(second.ok, true, "setup itself must still succeed even though the plane write is skipped");

    const stored = readMachinePlane({ homedirFn: () => home });
    assert.deepEqual(stored, afterFirst, "a different, already-set machine-wide poKeyDirectory must never be silently overwritten");
    assert.equal(realpathSync(stored.plane.poKeyDirectory), realpathSync(dirs.directory));
    assert.deepEqual(treeListing(common), [], "the legacy per-repository store is never written");
    assert.deepEqual([treeListing(dirs.repoRoot), treeListing(otherDirs.repoRoot)], repositoriesBefore, "nothing is written into either repository");
  } finally {
    cleanup(dirs);
    cleanup(otherDirs);
    rmSync(home, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

// R7-6-T11 (decision AC): a plane-sourced directory leaves the plane alone and still writes neither the legacy store nor the repository.
test("PO-KEYDIR-01(A): a repo-scope-, plane- or environment-sourced --directory is never written back into the repo-scoped store either (nothing new to persist)", () => {
  const dirs = fixtureDirs();
  const home = machinePlaneHomeFixture(dirs.directory);
  const common = repoScopeCommonDirFixture();
  try {
    keyFixture(dirs.directory);
    const gitCommonDirFn = () => common;
    const before = readMachinePlane({ homedirFn: () => home });
    const repoBefore = treeListing(dirs.repoRoot);
    const result = withEnvDirectory(undefined, () => runHumanApproval(["setup", "--repo-root", dirs.repoRoot], { homedirFn: () => home, gitCommonDirFn }));
    assert.equal(result.ok, true);
    const after = readMachinePlane({ homedirFn: () => home });
    assert.deepEqual(after, before, "a directory resolved FROM the plane must not trigger a redundant write back to it");
    assert.equal(existsSync(repoScopeStorePath(common)), false, "a plane-sourced directory must not be written into the repo-scoped store either");
    assert.deepEqual(treeListing(common), [], "nothing at all is written into the git-common-dir");
    assert.deepEqual(treeListing(dirs.repoRoot), repoBefore, "nothing is written into the repository");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * PO-KEYDIR-01(A): precedence order, proved at each boundary. Decision AC (2026-10-07,
 * specs/sprint-alfred-epic/plans/r7-6-multi-key-aa.md): --directory >
 * PIPELINE_PO_APPROVAL_DIRECTORY > machine plane > legacy per-repository value
 * (read-only, marked legacy) > SIGN-KEY-DIRECTORY-UNSET.
 * The cases below prove the boundaries involving --directory and the legacy value; the
 * environment-above-plane boundary is the AC-11 case above, and the whole order is R7-6h.
 * ------------------------------------------------------------------ */

/* ======================================================================
 * R7-6-T11 (R7-6k; PO decision AC of 2026-10-07, specs/sprint-alfred-epic/plans/r7-6-multi-key-aa.md,
 * test list 5-7; Elephant ruling 5 in plans/0.7-execution-order.md): the writer of the machine-wide default.
 *
 *   po-human-approval.mjs set-po-key-directory --directory <absolute-dir> [--replace <current-value>]
 *
 * Writes only poKeyDirectory and updatedAt in the machine plane (creating a valid plane when absent), refuses a
 * relative path, a non-directory and a path inside a repository or .git, reports an invalid plane without
 * repairing it, and replaces a DIFFERENT existing value only when --replace names the current value exactly.
 * `setup --directory` shares the write rule: a fresh home gets the plane, a different existing default is left
 * alone and reported together with the repair command.
 *
 * Every refusal case carries a positive control in the SAME test (the identical command with a valid argument
 * succeeds), so a refusal that merely is "unknown command" cannot pass. Every home is a fresh directory under
 * the OS temporary directory, never the real home.
 * ====================================================================== */
const R7K_OTHER_FIELDS = { schema: MACHINE_PLANE_SCHEMA, pushApprovalDefault: "signature", routing: { tier: "keep" }, language: "en-test", session: { id: "keep" }, usage: { count: 1 } };

function r7kPlaneBytes(home) {
  const path = join(home, ".agent-pipeline", "machine.json");
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
function r7kSet(home, directory, extra = []) {
  return r76Outcome(() => withEnvDirectory(undefined, () => runHumanApproval(
    ["set-po-key-directory", "--directory", directory, ...extra], { homedirFn: () => home })));
}
const r7kRefused = (outcome) => outcome.threw === true || outcome.value?.ok === false;
function r7kAssertAccepted(outcome, label) {
  assert.equal(outcome.threw, false, `${label}: observed ${r76Describe(outcome)}`);
  assert.equal(outcome.value.ok, true, `${label}: observed ${r76Describe(outcome)}`);
}
const r7kMentions = (text, path) => text.includes(path) || text.includes(realpathSync(path));

test("R7-6k: set-po-key-directory on a home with no machine plane creates a valid plane that holds the directory, with every other field not configured and nothing else written (decision AC)", () => {
  const home = mkdtempSync(join(tmpdir(), "r7-6k-home-"));
  const directory = mkdtempSync(join(tmpdir(), "r7-6k-keys-"));
  try {
    assert.equal(r7kPlaneBytes(home), null, "harness: the home starts without a plane");
    r7kAssertAccepted(r7kSet(home, directory), "set-po-key-directory");
    const plane = readMachinePlane({ homedirFn: () => home });
    assert.equal(plane.status, "valid");
    assert.equal(realpathSync(plane.plane.poKeyDirectory), realpathSync(directory));
    for (const field of ["routing", "language", "session", "usage"]) assert.equal(plane.plane[field], null, `${field} stays not configured`);
    assert.deepEqual(treeListing(home).filter((entry) => !entry.startsWith(".agent-pipeline")), [], "nothing outside the plane directory is written into the home");
    assert.deepEqual(treeListing(directory), [], "the key directory itself is not written: the command creates no key and grants no trust");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});

test("R7-6k: set-po-key-directory replaces a different existing default only when --replace names the current value exactly: none and a wrong value are refused with the plane byte-identical, the exact value succeeds and changes only poKeyDirectory and updatedAt (decision AC, ruling 5)", () => {
  const home = mkdtempSync(join(tmpdir(), "r7-6k-home-"));
  const [first, second, third] = ["a", "b", "c"].map((name) => mkdtempSync(join(tmpdir(), `r7-6k-keys-${name}-`)));
  try {
    const seeded = { ...R7K_OTHER_FIELDS, poKeyDirectory: first, updatedAt: "2020-01-01T00:00:00.000Z" };
    writeMachinePlane(seeded, { homedirFn: () => home });
    const before = r7kPlaneBytes(home);
    assert.notEqual(before, null, "harness: the seeded plane exists");
    for (const [label, extra] of [["no --replace", []], ["a wrong --replace value", ["--replace", third]]]) {
      const refused = r7kSet(home, second, extra);
      assert.equal(r7kRefused(refused), true, `${label}: observed ${r76Describe(refused)}`);
      assert.equal(r7kPlaneBytes(home), before, `${label}: the plane is byte-identical`);
    }
    r7kAssertAccepted(r7kSet(home, second, ["--replace", first]), "positive control: --replace naming the exact current value");
    const after = readMachinePlane({ homedirFn: () => home });
    assert.equal(after.status, "valid");
    assert.equal(realpathSync(after.plane.poKeyDirectory), realpathSync(second));
    const { poKeyDirectory: newDirectory, updatedAt: newStamp, ...changedRest } = after.plane;
    const { poKeyDirectory: oldDirectory, updatedAt: oldStamp, ...seededRest } = seeded;
    assert.deepEqual(changedRest, seededRest, "every field other than poKeyDirectory and updatedAt is carried over unchanged");
    assert.ok(Date.parse(newStamp) > Date.parse(oldStamp), "updatedAt moves forward");
    assert.notEqual(newDirectory, oldDirectory);
  } finally {
    rmSync(home, { recursive: true, force: true });
    for (const directory of [first, second, third]) rmSync(directory, { recursive: true, force: true });
  }
});

function r7kRefusalCase(label, makeBadPath, reason) {
  test(`R7-6k: set-po-key-directory refuses ${label} and writes no plane; the identical command with a valid absolute directory succeeds (positive control) (decision AC)`, () => {
    const home = mkdtempSync(join(tmpdir(), "r7-6k-home-"));
    const good = mkdtempSync(join(tmpdir(), "r7-6k-keys-"));
    const workspace = mkdtempSync(join(tmpdir(), "r7-6k-bad-"));
    try {
      const refused = r7kSet(home, makeBadPath(workspace));
      assert.equal(r7kRefused(refused), true, `${label}: observed ${r76Describe(refused)}`);
      assert.match(r76Text(refused), reason, `${label}: the refusal names its reason`);
      assert.equal(r7kPlaneBytes(home), null, `${label}: a refused path writes no plane`);
      r7kAssertAccepted(r7kSet(home, good), "positive control");
      assert.equal(readMachinePlane({ homedirFn: () => home }).status, "valid");
    } finally {
      for (const directory of [home, good, workspace]) rmSync(directory, { recursive: true, force: true });
    }
  });
}
const r7kGitRepository = (workspace) => { const repository = join(workspace, "work"); mkdirSync(repository); execFileSync("git", ["init", "-q", repository]); return repository; };
r7kRefusalCase("a relative path", () => "relative-po-keys", /absolute/iu);
r7kRefusalCase("a path that is not a directory", (workspace) => { const file = join(workspace, "a-file"); writeFileSync(file, "not a directory\n"); return file; }, /director/iu);
r7kRefusalCase("a path inside a repository", (workspace) => { const keys = join(r7kGitRepository(workspace), "keys"); mkdirSync(keys); return keys; }, /repositor|\.git/iu);
r7kRefusalCase("a path inside .git", (workspace) => { const inside = join(r7kGitRepository(workspace), ".git", "po-keys"); mkdirSync(inside); return inside; }, /repositor|\.git/iu);

test("R7-6k: set-po-key-directory reports an invalid machine plane and leaves it byte-identical, never repairing it; the same command on a valid home succeeds (positive control) (decision AC)", () => {
  const goodHome = mkdtempSync(join(tmpdir(), "r7-6k-home-"));
  const badHome = mkdtempSync(join(tmpdir(), "r7-6k-home-"));
  const directory = mkdtempSync(join(tmpdir(), "r7-6k-keys-"));
  try {
    r7kAssertAccepted(r7kSet(goodHome, directory), "positive control");
    const garbage = "{ not valid json";
    mkdirSync(join(badHome, ".agent-pipeline"), { recursive: true });
    writeFileSync(join(badHome, ".agent-pipeline", "machine.json"), garbage);
    const refused = r7kSet(badHome, directory);
    assert.equal(r7kRefused(refused), true, `observed ${r76Describe(refused)}`);
    assert.match(r76Text(refused), /plane/iu, "the report names the machine plane");
    assert.match(r76Text(refused), /invalid/iu, "the report says the plane is invalid");
    assert.equal(r7kPlaneBytes(badHome), garbage, "an invalid plane is reported, never repaired or overwritten");
  } finally {
    for (const path of [goodHome, badHome, directory]) rmSync(path, { recursive: true, force: true });
  }
});

test("R7-6k: setup --directory on a home with no machine plane writes a new valid plane (poKeyDirectory and updatedAt set, every other field not configured) and nothing into the repository or the git-common-dir (decision AC, test-list 5)", () => {
  const dirs = fixtureDirs();
  const home = outsideRepoHomeFixture();
  const common = repoScopeCommonDirFixture();
  try {
    keyFixture(dirs.directory);
    const repoBefore = treeListing(dirs.repoRoot);
    const result = withEnvDirectory(undefined, () => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory],
      { homedirFn: () => home, gitCommonDirFn: () => common },
    ));
    assert.equal(result.ok, true);
    const plane = readMachinePlane({ homedirFn: () => home });
    assert.equal(plane.status, "valid", "setup --directory creates the machine plane when none exists");
    assert.equal(realpathSync(plane.plane.poKeyDirectory), realpathSync(dirs.directory));
    for (const field of ["routing", "language", "session", "usage"]) assert.equal(plane.plane[field], null, `${field} stays not configured`);
    assert.deepEqual(treeListing(home).filter((entry) => !entry.startsWith(".agent-pipeline")), [], "nothing outside the plane directory is written into the home");
    assert.deepEqual(treeListing(common), [], "nothing is written into the git-common-dir: the legacy store is read-only");
    assert.deepEqual(treeListing(dirs.repoRoot), repoBefore, "nothing is written into the repository");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

test("R7-6k: setup --directory with a different existing default leaves the plane byte-identical and reports the current default plus the set-po-key-directory --replace repair command (decision AC, test-list 6)", () => {
  const dirs = fixtureDirs();
  const other = fixtureDirs();
  const home = outsideRepoHomeFixture();
  const common = repoScopeCommonDirFixture();
  const reports = [];
  const originalWrite = process.stderr.write;
  try {
    keyFixture(dirs.directory);
    keyFixture(other.directory);
    const dependencies = { homedirFn: () => home, gitCommonDirFn: () => common, stderrWriteFn: (chunk) => reports.push(String(chunk)) };
    const control = withEnvDirectory(undefined, () => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], dependencies));
    assert.equal(control.ok, true);
    const created = readMachinePlane({ homedirFn: () => home });
    assert.equal(created.status, "valid", "positive control: setup --directory writes the default when none is recorded");
    assert.equal(realpathSync(created.plane.poKeyDirectory), realpathSync(dirs.directory));
    const bytes = r7kPlaneBytes(home);

    reports.length = 0;
    process.stderr.write = (chunk) => { reports.push(String(chunk)); return true; };
    const second = r76Outcome(() => withEnvDirectory(undefined, () => runHumanApproval(
      ["setup", "--repo-root", other.repoRoot, "--directory", other.directory], dependencies)));
    process.stderr.write = originalWrite;
    assert.equal(second.threw, false, `observed ${r76Describe(second)}`);
    assert.equal(second.value.ok, true, "setup itself still succeeds when it leaves the default alone");
    assert.equal(r7kPlaneBytes(home), bytes, "the existing default is left byte-identical");
    const report = [r76Text(second), ...reports].join("\n");
    assert.ok(r7kMentions(report, dirs.directory), "the report names the current default");
    assert.ok(r7kMentions(report, other.directory), "the report names the directory the repair would set");
    assert.match(report, /set-po-key-directory/u, "the report names the repair command");
    assert.match(report, /--replace/u, "the repair command carries --replace");
    assert.deepEqual(treeListing(common), [], "nothing is written into the git-common-dir");
  } finally {
    process.stderr.write = originalWrite;
    cleanup(dirs);
    cleanup(other);
    rmSync(home, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

test("R7-6k: the catalogue entry for set-po-key-directory is agent-runnable, with a non-null executable and an argv that names the command (decision AC, test-list 7)", () => {
  const { repair } = keyDirectoryUnsetFinding();
  assert.equal(repair.kind, "set-po-key-directory");
  assert.equal(typeof repair.executable, "string", `executable observed as ${JSON.stringify(repair.executable)}`);
  assert.ok(repair.executable.length > 0);
  assert.ok(Array.isArray(repair.argv) && repair.argv.length > 0 && repair.argv.every((entry) => typeof entry === "string"), `argv observed as ${JSON.stringify(repair.argv)}`);
  assert.ok(repair.argv.includes("set-po-key-directory"), "the argv names the subcommand");
  assert.equal(repair.mutation, true);
  assert.equal(repair.requiresConfirmation, false);
});

test("PO-KEYDIR-01(A): an explicit --directory still overrides a present, valid repo-scoped value", () => {
  const dirs = fixtureDirs();
  const otherDirectory = mkdtempSync(join(tmpdir(), "po-repo-scope-unused-"));
  const common = repoScopeCommonDirFixture();
  try {
    const gitCommonDirFn = () => common;
    keyFixture(otherDirectory);
    legacyRepoStoreFixture(common, realpathSync(otherDirectory));

    const parsed = parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"],
      { gitCommonDirFn },
    );
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, dirs.directory);
    assert.equal(parsed.directorySource, "flag");
  } finally {
    cleanup(dirs);
    rmSync(otherDirectory, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

test("PO-KEYDIR-01(A) / Spec 22.6 (R7-6-T3, D1): the machine-wide value resolves the directory when --directory is absent and wins over a present legacy repo-scoped value", () => {
  const dirs = fixtureDirs();
  const machineDirectory = mkdtempSync(join(tmpdir(), "po-machine-wins-"));
  const home = machinePlaneHomeFixture(machineDirectory);
  const common = repoScopeCommonDirFixture();
  try {
    legacyRepoStoreFixture(common, realpathSync(dirs.directory));
    const parsed = withEnvDirectory(undefined, () => parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"],
      { homedirFn: () => home, gitCommonDirFn: () => common },
    ));
    assert.equal(parsed.error, undefined);
    assert.equal(realpathSync(parsed.directory), realpathSync(machineDirectory), "Spec 22.6: the machine-wide value precedes the legacy per-repository value");
    assert.equal(parsed.directorySource, "machine-plane");
  } finally {
    cleanup(dirs);
    rmSync(machineDirectory, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

test("R7-6-T3 (Spec 22.6, D1): poKeyDirectory resolves explicit argument, then machine-wide value, then the legacy per-repository value, and the legacy result is marked legacy", () => {
  // CONTRACT FOR R7-6-F (legacy marker): the object returned by parseHumanArgs for a directory that
  // came from the legacy per-repository private-state value carries the boolean  legacy: true .
  // Every other source (flag, machine-plane, environment) leaves  legacy  absent or false.
  // directorySource keeps its existing values and is not pinned for the legacy case here.
  const dirs = fixtureDirs();
  const explicitDirectory = mkdtempSync(join(tmpdir(), "po-order-explicit-"));
  const machineDirectory = mkdtempSync(join(tmpdir(), "po-order-machine-"));
  const machineHome = machinePlaneHomeFixture(machineDirectory);
  const emptyHome = noMachinePlaneHomeFixture();
  const common = repoScopeCommonDirFixture();
  try {
    legacyRepoStoreFixture(common, realpathSync(dirs.directory));
    const parseWith = (extraArgv, home) => withEnvDirectory(undefined, () => parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, ...extraArgv, "--human-name", "Test Operator"],
      { homedirFn: () => home, gitCommonDirFn: () => common },
    ));

    const explicit = parseWith(["--directory", explicitDirectory], machineHome);
    assert.equal(explicit.error, undefined);
    assert.equal(explicit.directory, explicitDirectory, "explicit argument beats the machine-wide and the legacy value");
    assert.equal(explicit.directorySource, "flag");
    assert.notEqual(explicit.legacy, true);

    const machine = parseWith([], machineHome);
    assert.equal(machine.error, undefined);
    assert.equal(realpathSync(machine.directory), realpathSync(machineDirectory), "the machine-wide value beats the legacy per-repository value");
    assert.equal(machine.directorySource, "machine-plane");
    assert.notEqual(machine.legacy, true);

    const legacy = parseWith([], emptyHome);
    assert.equal(legacy.error, undefined);
    assert.equal(realpathSync(legacy.directory), realpathSync(dirs.directory), "the legacy per-repository value alone still resolves (read-only fallback)");
    assert.equal(legacy.legacy, true, "the legacy result must be reported as legacy (contract: legacy === true on the parsed result)");
  } finally {
    cleanup(dirs);
    rmSync(explicitDirectory, { recursive: true, force: true });
    rmSync(machineDirectory, { recursive: true, force: true });
    rmSync(machineHome, { recursive: true, force: true });
    rmSync(emptyHome, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * GF-104: `setup` against an EXISTING named authority record must not
 * silently keep supplied --human-name/--key-reference values that differ
 * from the persisted record, reporting an unqualified success as if the
 * new values had been applied.
 * ------------------------------------------------------------------ */

test("GF-104: setup fails loudly when an explicit --human-name differs from an existing named authority record", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    keyFixture(dirs.directory); // writes humanName: "Test Operator", keyReference: "sign-intent-test-key"
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "A Different Human"],
      { homedirFn: () => home },
    ));
    assert.ok(error, "a differing --human-name against an existing record must fail, not silently succeed");
    assert.match(error.message, /already exists under a different name\/key-reference/u);
    assert.match(error.message, /not something setup does silently/u);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-104: setup fails loudly when an explicit --key-reference differs from an existing named authority record", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    keyFixture(dirs.directory); // writes keyReference: "sign-intent-test-key"
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "a-different-key-reference"],
      { homedirFn: () => home },
    ));
    assert.ok(error, "a differing --key-reference against an existing record must fail, not silently succeed");
    assert.match(error.message, /already exists under a different name\/key-reference/u);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-104: setup against an existing named authority record stays unchanged (idempotent) when supplied values match, or when none are supplied at all", () => {
  const dirsNoFlags = fixtureDirs();
  const dirsMatching = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    keyFixture(dirsNoFlags.directory);
    const resultNoFlags = runHumanApproval(
      ["setup", "--repo-root", dirsNoFlags.repoRoot, "--directory", dirsNoFlags.directory],
      { homedirFn: () => home },
    );
    assert.equal(resultNoFlags.ok, true);
    assert.equal(resultNoFlags.code, "PO-HUMAN-AUTHORITY-READY");
    // NVA-CLI-FEEDBACK-1: even an idempotent re-run (nothing newly written)
    // states where the existing key material and authority record live.
    assert.deepEqual(resultNoFlags.paths, {
      privateKey: join(dirsNoFlags.directory, "po-private.pem"),
      publicKey: join(dirsNoFlags.directory, "po-public.pem"),
      authority: join(dirsNoFlags.directory, "trust-policy.json"),
    });

    keyFixture(dirsMatching.directory);
    const resultMatching = runHumanApproval(
      ["setup", "--repo-root", dirsMatching.repoRoot, "--directory", dirsMatching.directory, "--human-name", "Test Operator", "--key-reference", "sign-intent-test-key"],
      { homedirFn: () => home },
    );
    assert.equal(resultMatching.ok, true);
    assert.equal(resultMatching.code, "PO-HUMAN-AUTHORITY-READY");
  } finally {
    cleanup(dirsNoFlags);
    cleanup(dirsMatching);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * GF-112: `setup` against a LEGACY-shape authority record (predates
 * --human-name -- only {keyReference, publicKeySha256} on disk, no
 * humanName field at all) -- regression coverage for dd1eb9ee, which fixed
 * this branch to actually consume a supplied --human-name and perform the
 * upgrade instead of always failing.
 * ------------------------------------------------------------------ */

/** A legacy-shape authority record: only {keyReference, publicKeySha256}, no
 * humanName field -- the exact shape localAuthority() would have produced
 * before SETUP-1 added the humanName parameter, and the shape `namedShape`
 * (po-human-approval.mjs) requires be false for the upgrade branch to run. */
function legacyKeyFixture(directory) {
  const privateKey = join(directory, "po-private.pem");
  const publicKey = join(directory, "po-public.pem");
  writeEd25519KeyPair(privateKey, publicKey);
  const publicKeyPem = readFileSync(publicKey, "utf8");
  const authority = { keyReference: "legacy-test-key", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify(authority, null, 2)}\n`);
  return { publicKeyPem, authority };
}

test("GF-112: setup upgrades a legacy-shape (no humanName) authority record when --human-name is supplied", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    legacyKeyFixture(dirs.directory);
    const result = runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Ada Lovelace"],
      { homedirFn: () => home },
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-AUTHORITY-READY");
    assert.equal(result.recovered, true);
    assert.equal(result.authority.humanName, "Ada Lovelace");
    const onDisk = JSON.parse(readFileSync(join(dirs.directory, "trust-policy.json"), "utf8"));
    assert.equal(onDisk.humanName, "Ada Lovelace", "the upgrade must be persisted to disk, not only returned");
    assert.equal(onDisk.keyReference, "legacy-test-key");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-112: setup still refuses a legacy-shape record when --human-name is supplied together with a conflicting --key-reference", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    legacyKeyFixture(dirs.directory); // writes keyReference: "legacy-test-key"
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Ada Lovelace", "--key-reference", "a-different-key-reference"],
      { homedirFn: () => home },
    ));
    assert.ok(error, "an upgrade attempt with a conflicting --key-reference must still be refused, not silently rebound");
    assert.match(error.message, /already exists under a different name\/key-reference/u);
    const onDisk = JSON.parse(readFileSync(join(dirs.directory, "trust-policy.json"), "utf8"));
    assert.equal(Object.hasOwn(onDisk, "humanName"), false, "a refused upgrade must not touch the on-disk record");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-112: setup still fails with the original message for a legacy-shape record when no --human-name is supplied", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    legacyKeyFixture(dirs.directory);
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory],
      { homedirFn: () => home },
    ));
    assert.ok(error, "a legacy-shape record with no --human-name supplied must still fail");
    assert.match(error.message, /predates --human-name/u);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * PO-KEYDIR-01(B), 2026-08-11 PO decision (backlog/items/2026-08-11-shared-
 * external-po-signing-directory-lets-an-unrelated-project-overwrite-a-proof.md):
 * two DIFFERENT repositories sharing one external directory (the actual
 * incident) must get DISJOINT request/proof/signature/intent/signer filenames,
 * while the shared private/public key and trust-policy filenames stay
 * unsuffixed.
 * ------------------------------------------------------------------ */

test("PO-KEYDIR-01(B): two repositories sharing one external directory and the same feature id get DISJOINT request/proof/signer filenames (repository-fingerprint segment), while the shared key/authority filenames stay UNCHANGED and usable by both", { skip: REQUIRES_OPENSSL }, () => {
  const directory = mkdtempSync(join(tmpdir(), "po-fingerprint-shared-external-"));
  const dirsA = { repoRoot: mkdtempSync(join(tmpdir(), "po-fingerprint-repo-a-")), directory };
  const dirsB = { repoRoot: mkdtempSync(join(tmpdir(), "po-fingerprint-repo-b-")), directory };
  writeFileSync(join(dirsA.repoRoot, PLAN), "# plan A\n");
  writeFileSync(join(dirsA.repoRoot, SPEC), "# spec A\n");
  writeFileSync(join(dirsB.repoRoot, PLAN), "# plan B\n");
  writeFileSync(join(dirsB.repoRoot, SPEC), "# spec B\n");
  try {
    const { authority } = keyFixture(directory); // ONE shared key pair for both repositories
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("po-keydir-01-b-fixture");
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" };

    const resultA = runHumanApproval(criticalArgv("authorize-critical", dirsA, { subjectSha256, expiresAt }), dependencies);
    const resultB = runHumanApproval(criticalArgv("authorize-critical", dirsB, { subjectSha256, expiresAt }), dependencies);
    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);

    const fpA = repositoryFingerprintFor(dirsA.repoRoot);
    const fpB = repositoryFingerprintFor(dirsB.repoRoot);
    assert.notEqual(fpA, fpB, "two different repository roots must fingerprint differently");

    for (const name of ["request", "proof", "signer"]) {
      const pathA = join(directory, `${name}-${fpA}-critical-push.json`);
      const pathB = join(directory, `${name}-${fpB}-critical-push.json`);
      assert.notEqual(pathA, pathB);
      assert.equal(existsSync(pathA), true, `${name} for repo A must exist at its fingerprinted path`);
      assert.equal(existsSync(pathB), true, `${name} for repo B must exist at its fingerprinted path`);
    }
    // Both authorize-critical calls above ran end to end without the second
    // overwriting the first's request/intent mid-flight -- proving no collision.
    const requestA = JSON.parse(readFileSync(join(directory, `request-${fpA}-critical-push.json`), "utf8"));
    const requestB = JSON.parse(readFileSync(join(directory, `request-${fpB}-critical-push.json`), "utf8"));
    assert.notEqual(requestA.approvalIntent.sha256, requestB.approvalIntent.sha256);

    // The shared private/public key and trust-policy filenames carry NO fingerprint
    // segment and are the SAME, single key pair both repositories just used.
    assert.equal(existsSync(join(directory, "po-private.pem")), true);
    assert.equal(existsSync(join(directory, "po-public.pem")), true);
    assert.equal(existsSync(join(directory, "trust-policy.json")), true);
    assert.equal(resultA.signer.publicKeySha256, authority.publicKeySha256);
    assert.equal(resultB.signer.publicKeySha256, authority.publicKeySha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(dirsA.repoRoot, { recursive: true, force: true });
    rmSync(dirsB.repoRoot, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * GF-105: authorizeCriticalPushCommand -- a bounded, copy-safe RENDERING of
 * the human's one authorize-critical push-approval command
 * (references/push-approval.md, "The human's one command (current shape)"),
 * so the constructing agent relays it VERBATIM instead of hand-formatting a
 * long, multi-flag, hash-bearing command itself. Construction and rendering
 * only -- never anything that touches the private key or the signing flow.
 * ------------------------------------------------------------------ */

const OWN_SCRIPT_PATH = fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url));

/** A value with a space AND a value with non-ASCII characters -- the same
 * class of case that broke the earlier (already-fixed) kickoff bug this
 * session (Codex's own re-quoting of a multi-word, non-ASCII value). */
function pushCommandFixture(overrides = {}) {
  return {
    repoRoot: "/repo root",
    directory: null,
    featureId: "cyb-6",
    plan: "specs/x y/prd.md",
    spec: "specs/x/spec.md",
    subjectSha256: "a".repeat(64),
    expiresAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

test("GF-105: authorizeCriticalPushCommand omits the configured private directory and assembles the exact authorize-critical argv", () => {
  const built = authorizeCriticalPushCommand(pushCommandFixture());
  assert.equal(built.executable, "node");
  assert.equal(built.argv[0], OWN_SCRIPT_PATH,
    "launcher must default to this script's own resolved path, never a value the caller could get wrong");
  assert.deepEqual(built.argv.slice(1), [
    "authorize-critical",
    "--repo-root", "/repo root",
    "--feature-id", "cyb-6",
    "--plan", "specs/x y/prd.md",
    "--spec", "specs/x/spec.md",
    "--kind", "push",
    "--subject-sha256", "a".repeat(64),
    "--expires-at", "2026-08-10T12:00:00.000Z",
  ]);
  assert.equal(typeof built.command, "string");
  assert.ok(built.copyCommand);
});

test("GF-105: authorizeCriticalPushCommand refuses a missing/empty required value and only accepts null or a non-empty explicit directory", () => {
  for (const field of ["launcher", "repoRoot", "featureId", "plan", "spec", "subjectSha256", "expiresAt"]) {
    assert.throws(
      () => authorizeCriticalPushCommand(pushCommandFixture({ [field]: "" })),
      new RegExp(`requires a non-empty ${field}`),
      field,
    );
  }
  assert.throws(
    () => authorizeCriticalPushCommand(pushCommandFixture({ directory: "" })),
    /directory to be null or a non-empty string/u,
  );
});

test("GF-105: the copyCommand rendering is bounded on every shell, and the posix rendering round-trips through a real bash eval to the exact intended argv -- including a value with a space and a value with non-ASCII characters", () => {
  const built = authorizeCriticalPushCommand(pushCommandFixture());
  const copy = built.copyCommand;
  assert.deepEqual(Object.keys(copy).sort(), ["cmd", "maxColumns", "posix", "powershell"]);
  assert.equal(copy.maxColumns, 72);
  for (const [label, rendered, lineSep] of [
    ["posix", copy.posix, "\n"],
    ["powershell", copy.powershell, "\n"],
    ["cmd", copy.cmd, "\r\n"],
  ]) {
    // A per-shell rendering may legitimately be null (that shell cannot safely
    // represent this value at all) rather than thrown -- never required to be
    // non-null, but whichever renders must stay within the shared bound.
    if (rendered === null) continue;
    assert.equal(typeof rendered, "string", label);
    assert.equal(rendered.split(lineSep).every((line) => line.length <= copy.maxColumns), true,
      `${label} rendering exceeds ${copy.maxColumns} columns`);
  }
  if (process.platform === "win32") return;
  assert.ok(copy.posix, "posix rendering must succeed for this input");
  const lines = copy.posix.split("\n");
  assert.equal(lines.at(-1), 'eval "$CMD"');
  const assignments = lines.slice(0, -1).join("\n");
  // A shell FUNCTION named "node" shadows the real binary for an unqualified
  // call in bash, so this proves the exact argv a real shell reconstructs
  // from the bounded rendering WITHOUT ever invoking po-human-approval.mjs
  // for real -- this is a signing-adjacent command, so the round-trip proof
  // must never risk actually running it (no key material, no passphrase
  // prompt, no OpenSSL call reachable from this test).
  const script = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, built.argv,
    "the posix copyCommand rendering does not reconstruct the exact intended argv");
});

/* ------------------------------------------------------------------ *
 * NVA-BL-74: the confirmation PROMPT speaks the configured human-facing
 * language; the confirmation TOKEN does not.
 *
 * Additive only. Every assertion above stays exactly as it was, and keeps
 * passing for the same reason a real unconfigured checkout does: a fixture
 * repository with no project-state artifact resolves to English.
 * ------------------------------------------------------------------ */

/** Writes the neutral project-state artifact (`project/pipeline-state.json`, the
 * path lib/project-authority.mjs resolves) carrying exactly the continuity key
 * chain the resolver reads: continuity.runtime.humanFacingLanguage. `raw` writes
 * arbitrary bytes instead, for the malformed-file case. */
function stateFixture(repoRoot, { language, raw } = {}) {
  mkdirSync(join(repoRoot, "project"), { recursive: true });
  const body = raw ?? `${JSON.stringify({
    schema: "pipeline.state.v0",
    continuity: { schema: "pipeline.continuity.v0", runtime: { humanFacingLanguage: language, activeDuty: "Elephant", sessionCleanup: null } },
  }, null, 2)}\n`;
  writeFileSync(join(repoRoot, "project", "pipeline-state.json"), body);
}

const GERMAN_FRAME = /PO-FREIGABE BESTÄTIGEN/u;
const ENGLISH_FRAME = /PO APPROVAL CONFIRMATION/u;

test("NVA-BL-74: a repository configured for `de` gets the German prompt frame, while the typed token stays the English constant and the signature is produced exactly as before", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    anchorFixtureKey(dirs.repoRoot, dirs.directory);
    stateFixture(dirs.repoRoot, { language: "de" });
    const intentSha256 = createHash("sha256").update("nva-bl-74-de-fixture").digest("hex");
    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
    );
    assert.equal(result.ok, true);
    assert.equal(prompts.length, 1, "still exactly one human confirmation, in any language");
    assert.match(prompts[0], GERMAN_FRAME, "the configured language must select the German prompt frame");
    assert.doesNotMatch(prompts[0], ENGLISH_FRAME, "the English frame must not also be printed");
    assert.match(prompts[0], /Passphrase/u, "the German frame must still warn before the passphrase prompt");
    assert.match(prompts[0], /nicht mehr rückgängig/u, "the German frame must still state the irreversible consequence");
    // TR-S1-T4 (Ruling 83): the German typed-token instruction ("Tippen Sie exakt ...") is not part of the stdout
    // disclosure of the encrypted path, so its assertion is gone; the token itself was never translated.
    // The summary lines are caller-supplied data and stay language-independent.
    assert.match(prompts[0], new RegExp(intentSha256, "u"), "the digest must be named in every language");
    assert.match(prompts[0], /guard-lift\/guard-override/u, "the data lines are untranslated by design");
    // ... and the ceremony itself is unchanged: a real proof, verifiable as before.
    const proof = JSON.parse(readFileSync(result.paths.proof, "utf8"));
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof }).verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("NVA-BL-74: cancellation semantics are unchanged under the German prompt -- every non-token answer, including a plausible German translation of the token, cancels before OpenSSL and before any artifact exists", () => {
  for (const answer of ["nope", "", "genehmigen", "Genehmigen", "bestätigen", "ja", "APPROVE", "approved", " approve"]) {
    const dirs = fixtureDirs();
    try {
      keyFixture(dirs.directory);
      anchorFixtureKey(dirs.repoRoot, dirs.directory);
      stateFixture(dirs.repoRoot, { language: "de" });
      const intentSha256 = createHash("sha256").update(`nva-bl-74-cancel-${answer}`).digest("hex");
      const spy = r76Spy("healthy");
      // TR-S1-T4 (Ruling 78(b)): subject retired by TR-S1 -- the typed confirmation on an UNENCRYPTED key is refused
      // outright once the gate lands, so every answer now meets the typed gate refusal (A1) instead of the cancel.
      // RED until TR-S1-F.
      const error = thrown(() => runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
        plainKey({ readConfirmation: () => answer, spawn: spy.spawn }),
      ));
      tr1AssertTypedRefusal(error, `sign-intent (b): ${JSON.stringify(answer)} on an unencrypted key under the German frame`);
      assert.deepEqual(r76KeyPathSpawns(spy), [], `${JSON.stringify(answer)}: OpenSSL must never be handed the unencrypted key`);
      for (const artifact of [`proof-${intentSha256}.json`, `signature-${intentSha256}.bin`, `intent-${intentSha256}.txt`]) {
        assert.equal(existsSync(join(dirs.directory, artifact)), false, `${JSON.stringify(answer)}: no ${artifact} may exist after a cancelled confirmation`);
      }
    } finally {
      cleanup(dirs);
    }
  }
});

test("NVA-BL-74: English is the hard fallback -- an absent, unrecognised, malformed or unreadable language value still produces a complete English prompt, never no prompt", { skip: REQUIRES_OPENSSL }, () => {
  const scenarios = [
    { label: "no project-state artifact at all", prepare: () => {} },
    { label: "an unrecognised language value", prepare: (repoRoot) => stateFixture(repoRoot, { language: "fr" }) },
    { label: "a null language value", prepare: (repoRoot) => stateFixture(repoRoot, { language: null }) },
    { label: "a non-string language value", prepare: (repoRoot) => stateFixture(repoRoot, { language: 42 }) },
    { label: "a malformed state file", prepare: (repoRoot) => stateFixture(repoRoot, { raw: "{ not json" }) },
    { label: "a state file with no continuity block", prepare: (repoRoot) => stateFixture(repoRoot, { raw: `${JSON.stringify({ schema: "pipeline.state.v0" })}\n` }) },
    // The resolution itself failing (any reason at all) must land on English too,
    // rather than propagating and skipping the gate.
    { label: "a resolver that throws", prepare: () => {}, dependencies: { resolveHumanFacingLanguageFn: () => { throw new Error("locale lookup exploded"); } } },
    { label: "a resolver returning a language with no translation", prepare: () => {}, dependencies: { resolveHumanFacingLanguageFn: () => "xx" } },
  ];
  for (const scenario of scenarios) {
    const dirs = fixtureDirs();
    try {
      keyFixture(dirs.directory);
      anchorFixtureKey(dirs.repoRoot, dirs.directory);
      scenario.prepare(dirs.repoRoot);
      const intentSha256 = createHash("sha256").update(`nva-bl-74-fallback-${scenario.label}`).digest("hex");
      const prompts = [];
      const result = runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
        disclosureChannel({ ...(scenario.dependencies ?? {}), readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
      );
      assert.equal(result.ok, true, scenario.label);
      assert.equal(prompts.length, 1, `${scenario.label}: the gate must still ask exactly once`);
      assert.match(prompts[0], ENGLISH_FRAME, `${scenario.label}: must fall back to the English frame`);
      // TR-S1-T4 (Ruling 83): completeness is now judged on the disclosure itself (the typed-token instruction is not on this channel).
      assert.match(prompts[0], /cannot be undone once signed/u, `${scenario.label}: the English frame must be complete, not truncated`);
      assert.match(prompts[0], new RegExp(intentSha256, "u"), `${scenario.label}: the digest must still be named`);
    } finally {
      cleanup(dirs);
    }
  }
});

test("NVA-BL-74: the language selects only the frame -- the `de` and `en` prompts carry identical summary data lines and identical accepted-token semantics", { skip: REQUIRES_OPENSSL }, () => {
  const rendered = {};
  for (const language of ["de", "en"]) {
    const dirs = fixtureDirs();
    try {
      keyFixture(dirs.directory);
      anchorFixtureKey(dirs.repoRoot, dirs.directory);
      stateFixture(dirs.repoRoot, { language });
      const prompts = [];
      runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "c".repeat(64)],
        disclosureChannel({ readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } }),
      );
      rendered[language] = prompts[0];
    } finally {
      cleanup(dirs);
    }
  }
  // Everything between the first line and the last two frame lines is data: identical
  // in both languages, byte for byte. (TR-S1-T4, Ruling 83: the stdout disclosure is header + data + consequence
  // plus the trailing newline of the write, so slice(1, -2) still removes exactly the frame lines.)
  const dataLines = (prompt) => prompt.split("\n").slice(1, -2);
  assert.deepEqual(dataLines(rendered.de), dataLines(rendered.en),
    "the translated frame must not alter, reorder or drop a single summary line");
  assert.match(rendered.de, GERMAN_FRAME);
  assert.match(rendered.en, ENGLISH_FRAME);
  // TR-S1-T4 (Ruling 83): the "every language instructs the same English token" loop is gone with the typed-token instruction line.
});

/**
 * NVA-WINPATH-1 (backlog/items/2026-08-17-po-human-approval-outside-check-uses-a-posix-only-
 * separator-on-windows.md): outside()'s previous POSIX-only `rel.startsWith("../")` check
 * relied on the default (host-platform) node:path export, whose relative() returns
 * backslash-separated paths on win32 -- so a genuinely external, same-drive-letter path was
 * silently misclassified as "inside" there. `platform` is injected exactly as the sibling
 * guard-human-override.mjs `externalJson()` fix's own test does, so the win32 answer is
 * provable from either host.
 */
test("NVA-WINPATH-1: outside() classifies a same-drive external win32 path as outside, not as inside", () => {
  // A genuinely external, same-drive-letter path: this is the case the POSIX-only check
  // (`rel.startsWith("../")` against a backslash-separated relative()) silently misclassified
  // as "inside" -- before the fix this assertion fails (`false` instead of `true`).
  assert.equal(outside("C:\\Repo", "C:\\OtherDir", "win32"), true);
  // A genuine subdirectory of the root must still classify as NOT outside.
  assert.equal(outside("C:\\Repo", "C:\\Repo\\po-directory", "win32"), false);
  // A case-folded drive/root spelling of the very same directory is not outside either --
  // win32 path resolution folds case, exactly like guard-human-override.mjs's own fix.
  assert.equal(outside("C:\\Repo", "c:\\repo", "win32"), false);
  // An absolute cross-drive path is outside.
  assert.equal(outside("C:\\Repo", "D:\\po\\directory", "win32"), true);
});

test("NVA-WINPATH-1: outside() behavior on POSIX hosts is unchanged by the platform-selection fix", () => {
  const dirs = fixtureDirs();
  try {
    assert.equal(outside(dirs.repoRoot, dirs.directory, "linux"), true);
    assert.equal(outside(dirs.repoRoot, join(dirs.repoRoot, "sub"), "linux"), false);
    assert.equal(outside(dirs.repoRoot, dirs.repoRoot, "linux"), false);
    assert.equal(outside(dirs.repoRoot, "/some/other/absolute/dir", "linux"), true);
    // NVA-WINPATH-2 (Critic round-1 F1, backlog/items/2026-08-17-po-human-approval-outside-
    // check-uses-a-posix-only-separator-on-windows.md): a backslash is an ORDINARY filename
    // character on POSIX, never a path separator -- a directory literally named `..\keys`
    // directly under the repo root is a genuine child of the repo, not outside it. The
    // pre-fix code unconditionally normalized backslashes to forward slashes on BOTH the
    // win32 AND posix branches, so this legal POSIX name was rewritten to `../keys` and then
    // misclassified as "outside" -- a fail-open regression in the exact check that keeps
    // private Ed25519 signing-key material out of the repository working tree. This is the
    // property the test's own name claims ("unchanged by the platform-selection fix") but,
    // before this assertion, never actually exercised.
    const backslashNamedChild = `${dirs.repoRoot}/..\\keys`;
    assert.equal(outside(dirs.repoRoot, backslashNamedChild, "linux"), false,
      "a POSIX directory literally named '..\\keys' is a child of the repo root, not outside it");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical prepares and signs in ONE invocation, and the resulting proof verifies against the request built in that same invocation", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const { authority } = keyFixture(dirs.directory);
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    const confirmations = [];
    const dependencies = {
      observeCandidate: () => observed,
      readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; },
    };
    const result = runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs, { subjectSha256 })], dependencies);
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
    assert.deepEqual(result.candidate, observed);
    assert.equal(result.action.kind, "push");
    assert.equal(result.action.subjectSha256, subjectSha256);

    assert.equal(confirmations.length, 1, "authorize-critical must ask for exactly one explicit confirmation before signing");
    assert.match(confirmations[0], new RegExp(subjectSha256, "u"), "the confirmation must state the exact subject being authorized");
    assert.match(confirmations[0], /does NOT cover/u, "the confirmation must state the approval's bounds (ADR-0061 Decision 4)");

    const artifacts = criticalArtifacts(dirs);
    const request = JSON.parse(readFileSync(artifacts.request, "utf8"));
    const proof = JSON.parse(readFileSync(artifacts.proof, "utf8"));
    assert.equal(proof.keyReference, authority.keyReference);
    const verified = verifyCriticalActionApprovalRequest({
      request, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: request.action,
    });
    assert.equal(verified.verified, true, "the proof produced by authorize-critical must verify against the request it built in the same call");

    // Temp signing artifacts are cleaned up; only the durable request/proof remain.
    assert.equal(existsSync(artifacts.intent), false);
    assert.equal(existsSync(artifacts.signature), false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * PHX-WP-PUBLICATION-UNIFICATION -- ADR-0056 named publication's non-migration
 * onto the shared `pipeline.po-approval-proof.v1` contract as its own recorded
 * follow-up ("two shapes now exist where one would be better"). At THIS layer
 * -- the human-terminal signing ceremony `po-human-approval.mjs` owns -- kind
 * "publication" was already composed by the exact same `criticalApprovalRequest`
 * call site as "push"/"deploy" (see `CRITICAL_COMMAND_KINDS` and the "prepare-critical
 * keeps composing push/deploy/publication requests exactly as before" test above);
 * nothing here special-cases the kind. What was missing was proof that the FULL
 * sign+verify round trip -- not just request composition -- is byte-identical for
 * "publication": this test is the "publication" twin of "authorize-critical prepares
 * and signs in ONE invocation..." above, same assertions, same shape.
 * ------------------------------------------------------------------------- */
test("authorize-critical round-trips kind publication exactly like push: one invocation prepares and signs, and the proof verifies against the request built in that same call", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const { authority } = keyFixture(dirs.directory);
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    const confirmations = [];
    const dependencies = {
      observeCandidate: () => observed,
      readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; },
    };
    const result = runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs, { kind: "publication", subjectSha256 })], dependencies);
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
    assert.deepEqual(result.candidate, observed);
    assert.equal(result.action.kind, "publication");
    assert.equal(result.action.subjectSha256, subjectSha256);

    assert.equal(confirmations.length, 1, "authorize-critical must ask for exactly one explicit confirmation before signing");
    assert.match(confirmations[0], new RegExp(subjectSha256, "u"), "the confirmation must state the exact subject being authorized");
    assert.match(confirmations[0], /does NOT cover/u, "the confirmation must state the approval's bounds (ADR-0061 Decision 4)");

    const artifacts = criticalArtifacts(dirs, "publication");
    const request = JSON.parse(readFileSync(artifacts.request, "utf8"));
    const proof = JSON.parse(readFileSync(artifacts.proof, "utf8"));
    assert.equal(proof.schema, "pipeline.po-approval-proof.v1", "publication's proof uses the exact same shared schema as push/deploy");
    assert.equal(proof.keyReference, authority.keyReference);
    const verified = verifyCriticalActionApprovalRequest({
      request, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: request.action,
    });
    assert.equal(verified.verified, true, "the proof produced by authorize-critical for kind publication must verify against the request it built in the same call");

    // Temp signing artifacts are cleaned up; only the durable request/proof remain.
    assert.equal(existsSync(artifacts.intent), false);
    assert.equal(existsSync(artifacts.signature), false);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical never signs a stale request left in the external directory: it overwrites it with the request it just built and signs THAT one (the failure mode ADR-0061 removes)", { skip: REQUIRES_OPENSSL }, () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const { authority } = keyFixture(dirs.directory);
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };

    // Simulate exactly the failure mode ADR-0061's backlog item describes: an
    // EARLIER, unrelated preparation (a different subject/expiry -- as if for a
    // different push) left a stale request sitting at the fixed artifact path.
    const staleSubjectSha256 = "b".repeat(64);
    const staleRequest = runHumanApproval([
      "prepare-critical", ...criticalRequestArgs(dirs, { subjectSha256: staleSubjectSha256, expiresAt: "2030-01-01T00:00:00.000Z" }),
    ], { observeCandidate: () => observed });
    assert.equal(readFileSync(criticalArtifacts(dirs).request, "utf8").includes(staleSubjectSha256), true, "the stale request must actually be on disk before authorize-critical runs");

    // Now authorize-critical runs for the REAL, current subject. It must bind
    // to and sign ONLY the request it builds in this call -- never the stale
    // one already sitting at the same path.
    const currentSubjectSha256 = "c".repeat(64);
    const confirmations = [];
    const result = runHumanApproval([
      "authorize-critical", ...criticalRequestArgs(dirs, { subjectSha256: currentSubjectSha256 }),
    ], {
      observeCandidate: () => observed,
      readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; },
    });
    assert.equal(result.action.subjectSha256, currentSubjectSha256, "the signed action must be the current call's subject, never the stale one");
    assert.match(confirmations[0], new RegExp(currentSubjectSha256, "u"), "the human must be shown the CURRENT subject, not the stale one");
    assert.doesNotMatch(confirmations[0], new RegExp(staleSubjectSha256, "u"), "the stale subject must never appear in what the human is asked to confirm");

    const request = JSON.parse(readFileSync(criticalArtifacts(dirs).request, "utf8"));
    assert.equal(request.action.subjectSha256, currentSubjectSha256, "the request file on disk must have been overwritten with the current call's request");
    assert.notEqual(request.approvalIntent.sha256, staleRequest.intentSha256, "the signed intent digest must differ from the stale request's own digest");

    const proof = JSON.parse(readFileSync(criticalArtifacts(dirs).proof, "utf8"));
    const verifiedCurrent = verifyCriticalActionApprovalRequest({
      request, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: request.action,
    });
    assert.equal(verifiedCurrent.verified, true, "the proof must verify against the CURRENT request");

    // The decisive negative check: the proof must NOT verify against the stale
    // subject -- if it did, authorize-critical would have reproduced exactly
    // the bug ADR-0061 exists to remove (a stale request silently signed).
    const staleAction = { ...request.action, subjectSha256: staleSubjectSha256 };
    const verifiedStale = verifyCriticalActionApprovalRequest({
      request: { ...request, action: staleAction }, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: staleAction,
    });
    assert.equal(verifiedStale.verified, false, "the proof must not verify against the stale request's subject");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical still requires the literal word approve: anything else cancels before OpenSSL and writes no proof (fixtureDirs variant)", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    keyFixture(dirs.directory);
    let spawnCalled = false;
    const dependencies = {
      observeCandidate: () => ({ commit: "d".repeat(40), tree: "e".repeat(40) }),
      readConfirmation: () => "nope",
      spawn: () => { spawnCalled = true; return { status: 0 }; },
    };
    assert.throws(
      () => runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs)], dependencies),
      /approval cancelled: explicit confirmation was not given/,
    );
    assert.equal(spawnCalled, false, "OpenSSL must never be invoked once confirmation is cancelled");
    const artifacts = criticalArtifacts(dirs);
    assert.equal(existsSync(artifacts.proof), false);
    assert.equal(existsSync(artifacts.intent), false);
    // The request itself IS written before the prompt (it must exist for the
    // confirmation to describe it), but no signature/proof follows a refusal.
    assert.equal(existsSync(artifacts.request), true);
  } finally {
    cleanup(dirs);
  }
});

/* ====================================================================== *
 * R7-6-T (Spec section 22.6, R7-6, rows T14/T15): the `sign-intent`-level
 * signing-readiness contract, pinned as executable tests. RED BY DESIGN: these
 * cases describe behaviour `sign-intent` does not have yet (a pre-prompt probe,
 * typed results, a hardened spawn); the fix follows in R7-6-F. Only the part of
 * R7-6d that `sign-intent` itself owns (its own pre-prompt probe, defence in
 * depth) is covered here; install / bootstrap / prepare-for-signature are not.
 *
 * Safety of this block, by construction:
 *  - Every OpenSSL the flow starts is a stub: either the injectable
 *    `dependencies.spawn` seam (a spy that answers immediately) or, in exactly
 *    two cases, a real lookup that can only reach a decoy/empty PATH. No stub
 *    ever prompts, so no case can block on a passphrase.
 *  - Every confirmation is the injected `readConfirmation`, which answers at once
 *    and is counted, so "before any prompt" is measurable and stdin is never read.
 *  - Keys are throwaway node:crypto fixture keys, unencrypted, in per-test temp
 *    directories removed by the test (never the PO's key directory, never a real
 *    key, never a passphrase). Where a case needs a key that must never be
 *    opened, the file holds a non-key trap string instead.
 *  - Homes, git-common-dirs and key directories are injected per test, so the real
 *    machine plane, the real repository store and the real `.git` are never read.
 *
 * Result surface: the spec fixes the closed fields (findingId, status, cause,
 * repair) and the cause classes, not whether `sign-intent` throws or returns the
 * typed result, so these cases look for the finding on whichever surface
 * (returned value, thrown error and its properties) carries it.
 * ====================================================================== */
import fsNamespace, { chmodSync, copyFileSync, linkSync, readdirSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { isAbsolute, relative } from "node:path";
import { verify as cryptoVerify } from "node:crypto";

const R76_SELF = fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url));
const R76_STDERR_FIRST = "stub-openssl: simulated failure R76";
const R76_TRAP = "R76-TRAP-PRIVATE-KEY-BYTES-MUST-NEVER-BE-OPENED";
const R76_CLASSES = ["openssl-not-on-path", "openssl-no-ed25519", "key-directory-unset", "key-directory-missing", "key-directory-unreadable", "key-anchor-mismatch"];
const R76_INTENT = createHash("sha256").update("r7-6-t sign-intent fixture").digest("hex");

function r76Collect(root) {
  const seen = new Set();
  const objects = [];
  const strings = [];
  const walk = (value, depth) => {
    if (value === null || value === undefined || depth > 6) return;
    if (typeof value === "string") { strings.push(value); return; }
    if (typeof value === "number" || typeof value === "boolean") { strings.push(String(value)); return; }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    objects.push(value);
    if (value instanceof Error) { strings.push(String(value.message)); walk(value.cause, depth + 1); }
    for (const key of Object.keys(value)) walk(value[key], depth + 1);
  };
  walk(root, 0);
  return { objects, strings };
}
function r76Outcome(fn) {
  try { return { threw: false, value: fn() }; } catch (error) { return { threw: true, error }; }
}
const r76Surface = (outcome) => (outcome.threw ? outcome.error : outcome.value);
const r76Text = (outcome) => r76Collect(r76Surface(outcome)).strings.join("\n");
function r76Describe(outcome) {
  if (outcome.threw) return `threw: ${String(outcome.error?.message).slice(0, 160)}`;
  let shown;
  try { shown = JSON.stringify(outcome.value); } catch { shown = String(outcome.value); }
  return `returned: ${String(shown).slice(0, 160)}`;
}
function r76Finding(outcome, cls) {
  const { objects } = r76Collect(r76Surface(outcome));
  return objects.find((candidate) => typeof candidate.cause === "string" && candidate.cause.startsWith(cls)) ?? null;
}
function r76AnyFinding(outcome) {
  const { objects } = r76Collect(r76Surface(outcome));
  return objects.find((candidate) => typeof candidate.cause === "string" && R76_CLASSES.some((cls) => candidate.cause.startsWith(cls))) ?? null;
}
function r76AssertTyped(outcome, { cls, findingId, status }) {
  const finding = r76Finding(outcome, cls);
  assert.ok(finding, `R7-6: a typed '${cls}' result with the closed fields findingId/status/cause/repair is required; observed ${r76Describe(outcome)}`);
  assert.equal(finding.findingId, findingId);
  assert.equal(finding.status, status);
  assert.ok(finding.repair !== undefined && finding.repair !== null && finding.repair !== "", `a non-ok '${cls}' result must carry a repair (typed repair rule, spec 22.0)`);
  assert.deepEqual(R76_CLASSES.filter((other) => other !== cls && finding.cause.includes(other)), [], "the cause begins with exactly one class");
  return finding;
}
function r76AssertSetAction(finding) {
  assert.match(JSON.stringify(finding.repair), /set-po-key-directory/u);
  assert.equal(finding.repair.mutation, true);
  assert.equal(finding.repair.requiresConfirmation, false);
}

/** A stub OpenSSL behind the `dependencies.spawn` seam. It answers at once, never
 * prompts, and records every call (arguments, spawn options, whether a PO key path
 * was among the arguments). `healthy` really signs/verifies with node:crypto so a
 * correct implementation can complete the whole flow against it. */
function r76Spy(mode = "healthy", events = []) {
  const calls = [];
  const spawn = (executable, args = [], options = {}) => {
    const a = args.map(String);
    const touchesPoKey = a.some((entry) => /po-private\.pem/u.test(entry));
    calls.push({ executable, args: a, options, touchesPoKey });
    events.push({ kind: "spawn", touchesPoKey });
    const flag = (name) => { const index = a.indexOf(name); return index >= 0 ? a[index + 1] : undefined; };
    const isSign = a[0] === "pkeyutl" && a.includes("-sign");
    const isVerify = a[0] === "pkeyutl" && a.includes("-verify");
    if (mode === "not-on-path") return { status: null, error: Object.assign(new Error("spawn openssl ENOENT"), { code: "ENOENT" }) };
    if (mode === "fail-all") return { status: 87, stdout: "", stderr: `${R76_STDERR_FIRST}\n${"x".repeat(5000)}` };
    if (mode === "sign-nonzero" && isSign) return { status: 1, stdout: "", stderr: "pkeyutl: signing failed\n" };
    if (mode === "no-rawin" && isSign && a.includes("-rawin")) return { status: 1, stdout: "", stderr: "pkeyutl: Unknown option: -rawin\n" };
    if (mode === "verify-fails" && isVerify) return { status: 1, stdout: "", stderr: "Signature Verification Failure\n" };
    if (mode === "signing-spawn-fails" && isSign && touchesPoKey) return { status: 53, stdout: "", stderr: "" };
    try {
      if (isSign) {
        // TR-S1-T3: an encrypted key is opened with the `-passin pass:<x>` the central lever appended.
        const passin = flag("-passin");
        const keyPem = readFileSync(flag("-inkey"));
        writeFileSync(flag("-out"), sign(null, readFileSync(flag("-in")), createPrivateKey(passin === undefined ? keyPem : { key: keyPem, format: "pem", passphrase: passin.replace(/^pass:/u, "") })));
        return { status: 0, stdout: "", stderr: "" };
      }
      if (isVerify) {
        const verified = cryptoVerify(null, readFileSync(flag("-in")), createPublicKey(readFileSync(flag("-inkey"))), readFileSync(flag("-sigfile")));
        return { status: verified ? 0 : 1, stdout: verified ? "Signature Verified Successfully\n" : "", stderr: "" };
      }
      if (a[0] === "genpkey") {
        const { privateKey } = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
        writeFileSync(flag("-out"), privateKey);
        return { status: 0, stdout: "", stderr: "" };
      }
      if (a[0] === "pkey" && a.includes("-pubout")) {
        writeFileSync(flag("-out"), createPublicKey(createPrivateKey(readFileSync(flag("-in"), "utf8"))).export({ type: "spki", format: "pem" }));
        return { status: 0, stdout: "", stderr: "" };
      }
    } catch (error) {
      return { status: 1, stdout: "", stderr: `stub-openssl: ${error?.code ?? "error"}\n` };
    }
    return { status: 0, stdout: "OpenSSL 3.0.0 (r7-6-t stub)\n", stderr: "" };
  };
  return { spawn, calls, events };
}

/** One isolated machine: repo + external key directory (fixtureDirs), a fixture home
 * carrying the machine-wide plane, and an empty fixture git-common-dir. `plane` is
 * null (no machine-wide value), "own" (this fixture's key directory) or a path. */
function r76Env({ plane = null } = {}) {
  const dirs = fixtureDirs();
  const home = mkdtempSync(join(tmpdir(), "r76-home-"));
  writeMachinePlane({
    schema: MACHINE_PLANE_SCHEMA, poKeyDirectory: plane === "own" ? dirs.directory : plane,
    pushApprovalDefault: "chat", routing: null, language: null, session: null, usage: null,
    updatedAt: new Date().toISOString(),
  }, { homedirFn: () => home });
  return { dirs, home, common: repoScopeCommonDirFixture(), events: [] };
}
function r76Release(env) {
  cleanup(env.dirs);
  rmSync(env.home, { recursive: true, force: true });
  rmSync(env.common, { recursive: true, force: true });
}
/** Throwaway fixture keypair in the env's key directory plus a matching committed trust anchor. */
function r76KeyFixture(env, extraRepoRoots = []) {
  const { authority } = keyFixture(env.dirs.directory);
  for (const root of [env.dirs.repoRoot, ...extraRepoRoots]) declareTrustAnchor(root, authority);
  return authority;
}
function r76Sign(env, spy, { useFlag = true, platform, repoRoot } = {}) {
  const argv = ["sign-intent", "--repo-root", repoRoot ?? env.dirs.repoRoot, ...(useFlag ? ["--directory", env.dirs.directory] : []), "--intent-sha256", R76_INTENT];
  const dependencies = {
    readConfirmation: (prompt) => { env.events.push({ kind: "prompt", prompt }); return "approve"; },
    homedirFn: () => env.home,
    gitCommonDirFn: () => env.common,
    ...(spy ? { spawn: spy.spawn } : {}),
    ...(platform ? { platform } : {}),
  };
  return withEnvDirectory(undefined, () => r76Outcome(() => runHumanApproval(argv, dependencies)));
}
const r76Prompts = (env) => env.events.filter((event) => event.kind === "prompt").length;
const r76KeyPathSpawns = (spy) => spy.calls.filter((call) => call.touchesPoKey);
function r76WithPath(value, fn) {
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const had = Object.hasOwn(process.env, key);
  const previous = process.env[key];
  process.env[key] = value;
  try { return fn(); } finally { if (had) process.env[key] = previous; else delete process.env[key]; }
}
/** Filesystem spy for "a trap private key is never opened": wraps readFileSync/openSync
 * (what po-human-approval.mjs reads files through) for the duration of `fn`. */
function r76WithPrivateKeyReadSpy(fn) {
  const opened = [];
  const originals = { readFileSync: fsNamespace.readFileSync, openSync: fsNamespace.openSync };
  const watch = (name) => function watched(path, ...rest) {
    if (/po-private\.pem/u.test(String(path))) opened.push(name);
    return originals[name].call(this, path, ...rest);
  };
  fsNamespace.readFileSync = watch("readFileSync");
  fsNamespace.openSync = watch("openSync");
  syncBuiltinESMExports();
  try { return { result: fn(), opened }; } finally { Object.assign(fsNamespace, originals); syncBuiltinESMExports(); }
}
function r76OutsideEveryRepository(directory, fixtureRepoRoot) {
  try {
    let current = realpathSync(directory);
    const relation = relative(realpathSync(fixtureRepoRoot), current);
    if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) return false;
    for (;;) {
      if (existsSync(join(current, ".git"))) return false;
      const parent = dirname(current);
      if (parent === current) return true;
      current = parent;
    }
  } catch { return false; }
}
/** Makes `directory` unreadable to the current user, or reports that the host cannot
 * ("not-run", which the caller turns into a FAILURE, never a skip). */
function r76MakeUnreadable(directory) {
  const undo = [];
  try {
    if (process.platform === "win32") {
      const user = process.env.USERNAME;
      const who = user ? `${process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : ""}${user}` : null;
      if (who && spawnSync("icacls", [directory, "/deny", `${who}:(OI)(CI)(RD,REA)`], { stdio: "pipe" }).status === 0) {
        undo.push(() => spawnSync("icacls", [directory, "/remove:d", who, "/T"], { stdio: "pipe" }));
      }
    } else {
      chmodSync(directory, 0o000);
      undo.push(() => chmodSync(directory, 0o700));
    }
  } catch { /* the verification below decides */ }
  let created = false;
  try { readdirSync(directory); } catch { created = true; }
  return { created, restore: () => { for (const step of undo.reverse()) { try { step(); } catch { /* best effort */ } } } };
}

test("R7-6a(i): with the machine-wide key directory set and no repository value, a second repository on the same machine resolves it with no --directory", () => {
  const first = r76Env({ plane: "own" });
  const second = { dirs: fixtureDirs(), home: first.home, common: repoScopeCommonDirFixture(), events: [] };
  try {
    r76KeyFixture(first, [second.dirs.repoRoot]);
    for (const env of [first, second]) {
      const outcome = r76Sign(env, r76Spy("healthy", env.events), { useFlag: false });
      assert.equal(outcome.threw, false, `the machine-wide value must resolve the key directory; observed ${r76Describe(outcome)}`);
      assert.equal(outcome.value.code, "PO-HUMAN-SIGN-INTENT-READY");
      assert.equal(realpathSync(dirname(outcome.value.paths.proof)), realpathSync(first.dirs.directory));
    }
  } finally {
    cleanup(second.dirs);
    rmSync(second.common, { recursive: true, force: true });
    r76Release(first);
  }
});

test("R7-6a(ii): with the machine-wide and the repository value both unset the result is the typed SIGN-KEY-DIRECTORY-UNSET with the set-po-key-directory setup action", () => {
  const env = r76Env({ plane: null });
  const spy = r76Spy("healthy", env.events);
  try {
    const outcome = r76Sign(env, spy, { useFlag: false });
    assert.match(r76Text(outcome), /SIGN-KEY-DIRECTORY-UNSET/u, `observed ${r76Describe(outcome)}`);
    const finding = r76AssertTyped(outcome, { cls: "key-directory-unset", findingId: "po-key-directory", status: "repairable" });
    r76AssertSetAction(finding);
    assert.equal(spy.calls.length, 0, "no process is started when there is no key directory to check");
    assert.equal(r76Prompts(env), 0);
  } finally { r76Release(env); }
});

test("R7-6b(i): a spawn that cannot find openssl yields the typed openssl-not-on-path result before any prompt and no process receives a key path", () => {
  const env = r76Env();
  const spy = r76Spy("not-on-path", env.events);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy);
    const finding = r76AssertTyped(outcome, { cls: "openssl-not-on-path", findingId: "signing-toolchain", status: "attended" });
    assert.match(JSON.stringify(finding.repair), /PATH/u, "the generic repair names the PATH of the signing terminal");
    assert.equal(r76Prompts(env), 0, "the typed result ends the command before any prompt");
    assert.deepEqual(r76KeyPathSpawns(spy), [], "no process may be started with a key path");
  } finally { r76Release(env); }
});

test("R7-6b(i), real lookup: with a PATH holding no openssl at all the same typed openssl-not-on-path result ends sign-intent before any prompt", () => {
  const env = r76Env();
  const emptyPath = mkdtempSync(join(tmpdir(), "r76-emptypath-"));
  try {
    r76KeyFixture(env);
    const outcome = r76WithPath(emptyPath, () => r76Sign(env, null));
    r76AssertTyped(outcome, { cls: "openssl-not-on-path", findingId: "signing-toolchain", status: "attended" });
    assert.equal(r76Prompts(env), 0);
  } finally { rmSync(emptyPath, { recursive: true, force: true }); r76Release(env); }
});

test("R7-6b(iii): an openssl that fails the Ed25519 round trip (non-zero exit on sign, a signature that fails verification, no raw-sign support) yields the typed openssl-no-ed25519 result before any prompt", () => {
  for (const mode of ["sign-nonzero", "verify-fails", "no-rawin"]) {
    const env = r76Env();
    const spy = r76Spy(mode, env.events);
    try {
      r76KeyFixture(env);
      const outcome = r76Sign(env, spy);
      r76AssertTyped(outcome, { cls: "openssl-no-ed25519", findingId: "signing-toolchain", status: "attended" });
      assert.equal(r76Prompts(env), 0, `${mode}: no prompt`);
      assert.deepEqual(r76KeyPathSpawns(spy), [], `${mode}: no process may be started with a key path`);
    } finally { r76Release(env); }
  }
});

test("R7-6c: a failing openssl stub yields a typed result carrying the exit code and the stub's first stderr line, bounded and without any host path", () => {
  const env = r76Env();
  const spy = r76Spy("fail-all", env.events);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy);
    assert.ok(r76AnyFinding(outcome), `a typed result (one of the closed cause classes) is required; observed ${r76Describe(outcome)}`);
    const text = r76Text(outcome);
    assert.match(text, /\b87\b/u, "the exit code is reported");
    assert.ok(text.includes(R76_STDERR_FIRST), "the first stderr line is reported");
    assert.equal(text.includes("x".repeat(1000)), false, "the stderr head is bounded");
    for (const hostPath of [env.dirs.directory, env.dirs.repoRoot, tmpdir()]) assert.equal(text.includes(hostPath), false, "no unredacted host path");
    assert.equal(r76Prompts(env), 0);
    assert.deepEqual(r76KeyPathSpawns(spy), []);
  } finally { r76Release(env); }
});

test("R7-6c: a failing signing spawn reports its exit code", () => {
  const env = r76Env();
  const spy = r76Spy("signing-spawn-fails", env.events);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy);
    assert.equal(outcome.threw || outcome.value?.ok !== true, true, "a failed signing spawn never reports success");
    assert.match(r76Text(outcome), /\b53\b/u, `the signing spawn's exit code must be reported; observed ${r76Describe(outcome)}`);
  } finally { r76Release(env); }
});

test("R7-6d(iii) (sign-intent's own defence-in-depth probe): a probe spawn without any key path runs before the first prompt and before the signing spawn", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  disclosureChannel(spy.spawn);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy);
    assert.equal(outcome.threw, false, `a healthy stub must let the whole flow complete; observed ${r76Describe(outcome)}`);
    const indexOf = (predicate) => env.events.findIndex(predicate);
    const probe = indexOf((event) => event.kind === "spawn" && !event.touchesPoKey);
    const prompt = indexOf((event) => event.kind === "prompt");
    const signing = indexOf((event) => event.kind === "spawn" && event.touchesPoKey);
    assert.ok(probe >= 0, "sign-intent must run its own probe (steps a to c) before the signing spawn");
    assert.ok(prompt >= 0 && signing >= 0, "the healthy flow still prompts once and signs once");
    assert.ok(probe < prompt, "the probe must run before the first prompt");
    assert.ok(probe < signing, "the probe must run before any process receives the key path");
  } finally { r76Release(env); }
});

test("R7-6e (static): no code path in po-human-approval.mjs hands the injectable spawn an executable other than the constant bare name openssl", () => {
  const source = readFileSync(R76_SELF, "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
  const constants = new Set([...code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["']openssl["']\s*;/gu)].map((match) => match[1]));
  const references = [...code.matchAll(/\bdependencies\.spawn\b/gu)];
  const violations = [];
  assert.ok(references.length >= 1, "the signing flow must spawn through the injectable seam");
  for (const reference of references) {
    const enclosing = [...code.slice(0, reference.index).matchAll(/function\s+([\w$]+)\s*\(([^)]*)\)/gu)].pop();
    for (const parameter of (enclosing?.[2] ?? "").split(",").map((entry) => entry.trim().split("=")[0].trim())) {
      if (/^(executable|exe|exec|file|binary|bin|program|cmd|tool|openssl\w*)$/iu.test(parameter)) {
        violations.push(`${enclosing[1]}() takes an executable parameter '${parameter}', so a caller can hand the spawn another executable`);
      }
    }
    const immediate = /^\s*\?\?\s*spawnSync\s*\)\s*\(\s*([^,)]+?)\s*,/u.exec(code.slice(reference.index + reference[0].length));
    if (immediate && !(/^["']openssl["']$/u.test(immediate[1]) || constants.has(immediate[1]))) {
      violations.push(`a spawn is called with first argument '${immediate[1]}', not the constant bare name openssl`);
    }
  }
  if (/openssl\.(?:exe|com)\b/iu.test(code) || /["'`][^"'`\n]*[\\/]openssl["'`]/iu.test(code)) violations.push("an absolute or extension-qualified openssl path appears in code");
  if (/PIPELINE_[A-Z_]*(?:OPENSSL|SIGN\w*)_(?:PATH|BIN|EXE\w*)|\b(?:opensslPath|signingExecutable\w*)\b/u.test(code)) violations.push("a setting or variable that carries a signing-executable value appears in code");
  assert.deepEqual(violations, [], "R7-6e: the Pipeline chooses no signing executable");
});

test("R7-6e (dynamic): every spawn of sign-intent and its probe runs from an explicit working directory outside every repository, and the signing spawn from the PO key directory", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy);
    assert.equal(outcome.threw, false, `observed ${r76Describe(outcome)}`);
    assert.ok(spy.calls.some((call) => !call.touchesPoKey), "the probe must spawn too");
    for (const call of spy.calls) {
      const cwd = call.options?.cwd;
      assert.equal(typeof cwd, "string", `a spawn without an explicit cwd inherits the process's directory: ${call.args.slice(0, 2).join(" ")}`);
      assert.ok(isAbsolute(cwd), "the working directory is absolute");
      assert.ok(r76OutsideEveryRepository(cwd, env.dirs.repoRoot), "the working directory lies outside every repository working tree");
    }
    for (const call of r76KeyPathSpawns(spy)) assert.equal(realpathSync(call.options.cwd), realpathSync(env.dirs.directory), "the signing spawn runs from the PO key directory");
  } finally { r76Release(env); }
});

test("R7-6e (dynamic, win32 dialect): every spawn carries NoDefaultCurrentDirectoryInExePath in its child environment and keeps the PATH of the signing terminal", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy, { platform: "win32" });
    assert.equal(outcome.threw, false, `observed ${r76Describe(outcome)}`);
    assert.ok(spy.calls.some((call) => !call.touchesPoKey), "the probe must spawn too");
    const pathKey = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH");
    for (const call of spy.calls) {
      const childEnv = call.options?.env;
      assert.equal(typeof childEnv, "object", "an explicit child environment is required");
      assert.ok(childEnv !== null && typeof childEnv.NoDefaultCurrentDirectoryInExePath === "string" && childEnv.NoDefaultCurrentDirectoryInExePath !== "", "NoDefaultCurrentDirectoryInExePath must be set");
      const childPath = Object.entries(childEnv).find(([name]) => name.toUpperCase() === "PATH")?.[1];
      assert.equal(childPath, process.env[pathKey], "the PATH of the signing terminal stays the only source of the lookup");
    }
  } finally { r76Release(env); }
});

test("R7-6e (dynamic): the signing flow only ever names the constant bare executable openssl", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy);
    assert.equal(outcome.threw, false, `observed ${r76Describe(outcome)}`);
    assert.ok(spy.calls.length > 0);
    assert.deepEqual([...new Set(spy.calls.map((call) => call.executable))], ["openssl"]);
  } finally { r76Release(env); }
});

test("R7-6e (dynamic, decoy): a decoy openssl in the repository root and in the PO key directory is never started when sign-intent runs from the repository root with the real lookup", { skip: process.platform === "win32" ? "win32-known residual (PO decision R 2026-10-07): libuv resolves a bare name in the child cwd before PATH; the signing spawn's cwd is the PO key directory" : false }, () => {
  const env = r76Env();
  const aux = mkdtempSync(join(tmpdir(), "r76-decoy-aux-"));
  const startCwd = process.cwd();
  const previous = { options: process.env.NODE_OPTIONS, marker: process.env.R76_MARKER };
  try {
    r76KeyFixture(env);
    const marker = join(aux, "started.txt");
    const hook = join(aux, "marker.cjs");
    // win32 decoys are copies of the node binary (a bare-name lookup only starts a real PE
    // file); the preload hook records the start and exits at once, so nothing can prompt.
    writeFileSync(hook, 'require("node:fs").appendFileSync(process.env.R76_MARKER, "decoy-started\\n");\nprocess.exit(0);\n');
    const plant = (root, source) => {
      if (process.platform === "win32") {
        const exe = join(root, "openssl.exe");
        try { linkSync(source, exe); } catch { copyFileSync(source, exe); }
        try { linkSync(exe, join(root, "openssl.com")); } catch { copyFileSync(exe, join(root, "openssl.com")); }
        return exe;
      }
      writeFileSync(join(root, "openssl"), `#!/bin/sh\nprintf 'decoy-started\\n' >> "$R76_MARKER"\nexit 0\n`);
      chmodSync(join(root, "openssl"), 0o755);
      return source;
    };
    const planted = plant(env.dirs.repoRoot, process.execPath);
    plant(env.dirs.directory, planted);
    // The PO's signing terminal has the default lookup (current directory first); an ambient
    // NoDefaultCurrentDirectoryInExePath in THIS process would make the case vacuous, so it is
    // removed for the real run and restored right after it.
    previous.nodefault = process.env.NoDefaultCurrentDirectoryInExePath;
    delete process.env.NoDefaultCurrentDirectoryInExePath;
    process.env.R76_MARKER = marker;
    process.env.NODE_OPTIONS = `--require "${hook.replace(/\\/gu, "/")}"`;
    // Positive control: started by its explicit path, the planted decoy must leave its marker, or
    // this case could never fail (a vacuous pass is the failure mode of a decoy test).
    spawnSync(process.platform === "win32" ? planted : join(env.dirs.repoRoot, "openssl"), ["version"], { stdio: "pipe" });
    assert.equal(existsSync(marker), true, "harness defect: the planted decoy cannot report that it ran");
    rmSync(marker, { force: true });
    process.chdir(env.dirs.repoRoot);
    const outcome = r76Sign(env, null);
    if (previous.nodefault === undefined) delete process.env.NoDefaultCurrentDirectoryInExePath; else process.env.NoDefaultCurrentDirectoryInExePath = previous.nodefault;
    process.chdir(startCwd);
    assert.equal(existsSync(marker), false, `a decoy openssl was started (sign-intent ${r76Describe(outcome)})`);
  } finally {
    process.chdir(startCwd);
    for (const [name, value] of [["NODE_OPTIONS", previous.options], ["R76_MARKER", previous.marker]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(aux, { recursive: true, force: true });
    r76Release(env);
  }
});

test("R7-6f(i): a key directory whose public key matches the committed trust anchor yields ok: the probe passes and signing proceeds", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  disclosureChannel(spy.spawn);
  try {
    r76KeyFixture(env);
    const outcome = r76Sign(env, spy);
    assert.equal(outcome.threw, false, `observed ${r76Describe(outcome)}`);
    assert.equal(outcome.value.ok, true);
    assert.equal(outcome.value.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(r76KeyPathSpawns(spy).length, 1, "exactly one process receives the key path: the signing spawn");
    assert.equal(r76Prompts(env), 1);
  } finally { r76Release(env); }
});

test("R7-6f(i): a stored key directory value that names no directory yields the typed key-directory-missing result with the set-po-key-directory repair", () => {
  const missing = join(tmpdir(), `r76-missing-${process.pid}-${Date.now()}`);
  const env = r76Env({ plane: missing });
  const spy = r76Spy("healthy", env.events);
  try {
    const outcome = r76Sign(env, spy, { useFlag: false });
    const finding = r76AssertTyped(outcome, { cls: "key-directory-missing", findingId: "po-key-directory", status: "repairable" });
    r76AssertSetAction(finding);
    assert.equal(r76Prompts(env), 0);
    assert.deepEqual(r76KeyPathSpawns(spy), []);
    assert.equal(r76Text(outcome).includes(missing), false, "the stored path is redacted in the result");
  } finally { r76Release(env); }
});

test("R7-6f(i)/(ii): a key whose public key digest equals no committed trust anchor yields the typed key-anchor-mismatch result, opens no private key and starts no process with a key path", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  try {
    const { authority } = keyFixture(env.dirs.directory);
    writeFileSync(join(env.dirs.directory, "po-private.pem"), R76_TRAP);
    declareTrustAnchor(env.dirs.repoRoot, { keyReference: authority.keyReference, publicKeySha256: "e".repeat(64) });
    const spied = r76WithPrivateKeyReadSpy(() => r76Sign(env, spy));
    const finding = r76AssertTyped(spied.result, { cls: "key-anchor-mismatch", findingId: "trust-anchor-match", status: "attended" });
    assert.ok(finding.repair, "the repair names where the anchored key lives or the one-time key setup");
    assert.equal(r76Prompts(env), 0);
    assert.deepEqual(r76KeyPathSpawns(spy), []);
    assert.deepEqual(spied.opened, [], "the key-directory check never opens the private key file");
    const text = r76Text(spied.result);
    assert.equal(text.includes(R76_TRAP), false, "no key byte in the result");
    for (const hostPath of [env.dirs.directory, env.dirs.repoRoot]) assert.equal(text.includes(hostPath), false, "no unredacted host path");
  } finally { r76Release(env); }
});

test("R7-6f(i): an unreadable key directory yields the typed key-directory-unreadable result; a host that cannot create the condition reports not-run, which FAILS the case", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  let unreadable = null;
  try {
    r76KeyFixture(env);
    unreadable = r76MakeUnreadable(env.dirs.directory);
    if (!unreadable.created) assert.fail("not-run: this host cannot create an unreadable key directory (R7-6f: not-run fails the matrix and is never a skip)");
    const outcome = r76Sign(env, spy);
    r76AssertTyped(outcome, { cls: "key-directory-unreadable", findingId: "po-key-directory", status: "attended" });
    assert.equal(r76Prompts(env), 0);
    assert.deepEqual(r76KeyPathSpawns(spy), []);
  } finally { unreadable?.restore(); r76Release(env); }
});

/* ======================================================================
 * R7-6-T6 (R7-6g): three signing-readiness probe defects, pinned against
 * specs/sprint-alfred-epic/spec.md section 22.6 (Critic findings F5, F6, F8).
 *
 *  (i)   F5: with NO committed trust anchor, sign-intent reports
 *        key-anchor-mismatch WITHOUT opening the private key file ("what the
 *        probe never does": it never opens the private key).
 *  (ii)  F6: the probe child's working directory is the OS user's home
 *        directory, never the OS temporary directory. Section 22.6 closes its
 *        class list at six names and has no class for "no admissible working
 *        directory" or for "a local I/O failure while preparing the throwaway
 *        material"; these cases therefore pin only what the spec fixes (no
 *        temporary-directory fallback, never openssl-no-ed25519, no
 *        replace-OpenSSL repair, a repair is carried) and assert NO positive
 *        class name for those two situations.
 *  (iii) F8: an absolute host path that contains a space is fully redacted
 *        from the stderr-head detail (R7-6c, R7-6f(iii), section 22.0).
 *
 * Same safety rules as the R7-6 block above: every OpenSSL is a stub behind
 * the injectable spawn seam, no prompt can block, keys are throwaway fixtures
 * in per-test directories, the private key of the trap case is a non-key string.
 * ====================================================================== */
import { probeSigningReadiness } from "./po-human-approval.mjs";

const R76G_SPACED_PATHS = [String.raw`C:\Users\Jane Doe\keys\x`, "/Users/Jane Doe/Library/x"];
const R76G_SPACED_FRAGMENTS = ["Jane", "Doe", "Library", "Users"];
const R76G_STDERR_SHAPES = [
  { name: "path at the end of the line", line: (path) => `openssl: could not open ${path}` },
  { name: "path in double quotes followed by more text", line: (path) => `openssl: could not open "${path}" for reading` },
];

/** A stub OpenSSL that fails every call with exit code 87 and a caller-chosen first stderr line. */
function r76gStderrSpy(firstLine) {
  const calls = [];
  const spawn = (executable, args = [], options = {}) => {
    calls.push({ executable, args: args.map(String), options });
    return { status: 87, stdout: "", stderr: `${firstLine}\n` };
  };
  return { spawn, calls };
}

/** The read-only probe (steps a to c) against the env's key directory, with the home and temporary directories injected. */
function r76gProbe(env, { home, tmp, spy }) {
  return probeSigningReadiness({
    repository: env.dirs.repoRoot,
    directory: env.dirs.directory,
    dependencies: { homedirFn: () => home, tmpdirFn: () => tmp, spawn: spy.spawn },
  });
}

/** What section 22.6 fixes for a probe that could not run its round trip for a reason that is not the toolchain. */
function r76gAssertNotAToolchainReplacement(result, label) {
  assert.equal(result.ok, false, `${label}: a probe that could not complete its round trip never reports ok`);
  const failing = result.findings.find((entry) => entry.status !== "ok");
  assert.ok(failing, `${label}: a non-ok finding is required`);
  assert.equal(String(failing.cause).startsWith("openssl-no-ed25519"), false, `${label}: the cause must not be classified openssl-no-ed25519 (the openssl on the PATH was not the problem); observed '${String(failing.cause).slice(0, 140)}'`);
  assert.ok(failing.repair !== undefined && failing.repair !== null && failing.repair !== "", `${label}: a non-ok result carries its own repair (typed repair rule, section 22.0)`);
  assert.notEqual(failing.repair?.prerequisite, "openssl-with-ed25519", `${label}: the repair must not ask the PO to replace or reorder OpenSSL`);
  assert.equal(/ed25519/iu.test(JSON.stringify(failing.repair)), false, `${label}: the repair must not be the replace-OpenSSL repair; observed ${JSON.stringify(failing.repair).slice(0, 160)}`);
  // R7-6-T7 (decision AE, Spec 22.6 delta): the one new closed class. Both callers (R7-6g(ii)-b and -c) are
  // the two situations the class names: no admissible working directory outside every repository, and a
  // local I/O failure while preparing the throwaway material.
  assert.equal(String(failing.cause).startsWith("probe-environment-unavailable"), true, `${label}: the cause must begin with the closed class 'probe-environment-unavailable' (decision AE); observed '${String(failing.cause).slice(0, 140)}'`);
}

test("R7-6g(i) (F5): with NO committed trust anchor sign-intent reports key-anchor-mismatch without opening the private key file and without passing its path to any process", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  try {
    keyFixture(env.dirs.directory);
    writeFileSync(join(env.dirs.directory, "po-private.pem"), R76_TRAP);
    assert.equal(existsSync(join(env.dirs.repoRoot, "project/critical-human-proof.json")), false, "harness: the fixture repository declares no trust anchor");
    const spied = r76WithPrivateKeyReadSpy(() => r76Sign(env, spy));
    const finding = r76AssertTyped(spied.result, { cls: "key-anchor-mismatch", findingId: "trust-anchor-match", status: "attended" });
    assert.ok(finding.repair, "the repair names where the anchored key lives or the one-time key setup");
    assert.deepEqual(spied.opened, [], "with zero committed anchors the private key file is still never read or opened (spec 22.6, what the probe never does)");
    assert.deepEqual(r76KeyPathSpawns(spy), [], "no process may be started with the private key path");
    assert.deepEqual(spy.calls.filter((call) => call.args.some((entry) => entry.includes(env.dirs.directory))), [], "no process receives any path inside the PO key directory");
    assert.equal(r76Prompts(env), 0, "the typed result ends the command before any prompt");
    assert.equal(r76Text(spied.result).includes(R76_TRAP), false, "no key byte in the result");
  } finally { r76Release(env); }
});

test("R7-6g(ii)-a (F6): the probe child's working directory is the OS user's home directory, never the OS temporary directory", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  const scratch = mkdtempSync(join(tmpdir(), "r76g-"));
  try {
    r76KeyFixture(env);
    const tmp = join(scratch, "tmp");
    mkdirSync(tmp);
    const result = r76gProbe(env, { home: env.home, tmp, spy });
    assert.equal(result.ok, true, `harness: a healthy stub with a matching anchor must pass the whole probe; observed ${JSON.stringify(result.findings).slice(0, 200)}`);
    assert.ok(spy.calls.length > 0, "harness: the probe starts openssl");
    for (const call of spy.calls) {
      assert.equal(typeof call.options?.cwd, "string", "every probe spawn has an explicit working directory");
      const cwd = realpathSync(call.options.cwd);
      assert.equal(cwd, realpathSync(env.home), `the probe spawn ${call.args.slice(0, 2).join(" ")} must run from the home directory section 22.6 names`);
      assert.notEqual(cwd, realpathSync(tmp), "never the injected temporary directory");
      assert.notEqual(cwd, realpathSync(tmpdir()), "never the OS temporary directory");
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); r76Release(env); }
});

test("R7-6g(ii)-b (F6): with no admissible working directory outside every repository the probe never falls back to the OS temporary directory and is not classified openssl-no-ed25519", () => {
  for (const variant of ["home-inside-a-repository", "home-names-no-directory"]) {
    const env = r76Env();
    const spy = r76Spy("healthy", env.events);
    const scratch = mkdtempSync(join(tmpdir(), "r76g-"));
    try {
      const tmp = join(scratch, "tmp");
      mkdirSync(tmp);
      let home;
      if (variant === "home-inside-a-repository") {
        const fakeRepository = join(scratch, "repo");
        mkdirSync(join(fakeRepository, ".git"), { recursive: true });
        home = join(fakeRepository, "home");
        mkdirSync(home);
      } else {
        home = join(scratch, "no-such-home");
      }
      assert.equal(r76OutsideEveryRepository(tmp, env.dirs.repoRoot), true, "harness: the injected temporary directory itself is admissible, so a fallback to it is observable");
      const result = r76gProbe(env, { home, tmp, spy });
      for (const call of spy.calls) {
        assert.equal(typeof call.options?.cwd, "string", `${variant}: every probe spawn has an explicit working directory`);
        const cwd = realpathSync(call.options.cwd);
        assert.notEqual(cwd, realpathSync(tmp), `${variant}: the probe ran ${call.args.slice(0, 2).join(" ")} from the OS temporary directory; section 22.6 names the OS user's home directory and never the temporary one`);
        assert.ok(r76OutsideEveryRepository(cwd, env.dirs.repoRoot), `${variant}: the working directory lies outside every repository`);
      }
      r76gAssertNotAToolchainReplacement(result, variant);
    } finally { rmSync(scratch, { recursive: true, force: true }); r76Release(env); }
  }
});

test("R7-6g(ii)-c (F6): a local I/O failure while preparing the throwaway material is not classified openssl-no-ed25519", () => {
  const env = r76Env();
  const spy = r76Spy("healthy", env.events);
  const scratch = mkdtempSync(join(tmpdir(), "r76g-"));
  try {
    r76KeyFixture(env);
    const blocker = join(scratch, "not-a-directory");
    writeFileSync(blocker, "a regular file where the temporary directory should be, so preparing the throwaway directory fails locally");
    const result = r76gProbe(env, { home: env.home, tmp: blocker, spy });
    assert.ok(spy.calls.some((call) => call.args[0] === "version"), "harness: the openssl on the PATH answered its version call, so the failure is local and not a toolchain defect");
    r76gAssertNotAToolchainReplacement(result, "local I/O failure");
  } finally { rmSync(scratch, { recursive: true, force: true }); r76Release(env); }
});

test("R7-6g(iii) (F8): an absolute host path that contains a space is fully redacted from the stderr-head detail of a failing probe", () => {
  for (const path of R76G_SPACED_PATHS) {
    for (const shape of R76G_STDERR_SHAPES) {
      const label = `${path} (${shape.name})`;
      const env = r76Env();
      const spy = r76gStderrSpy(shape.line(path));
      try {
        r76KeyFixture(env);
        const text = r76Text(r76Sign(env, spy));
        assert.match(text, /\b87\b/u, `${label}: harness: the failing stub's exit code reaches the result`);
        assert.ok(text.includes("could not open"), `${label}: harness: the stderr head's own words reach the result, so the redaction is what is observed`);
        assert.equal(text.includes(path), false, `${label}: the whole path must be redacted`);
        for (const fragment of R76G_SPACED_FRAGMENTS) assert.equal(text.includes(fragment), false, `${label}: the fragment '${fragment}' of the path survived the redaction; observed '${text.split("\n").find((line) => line.includes(fragment))?.slice(0, 200)}'`);
      } finally { r76Release(env); }
    }
  }
});

/* ======================================================================
 * R7-6-T7 (PO decisions AC, AD and AE of 2026-10-07): several PO keys for one
 * repository, pinned against the accepted Spec 22.6 delta in
 * specs/sprint-alfred-epic/plans/r7-6-multi-key-aa.md (the chat decision that
 * replaces the first T14 bullet; spec.md itself is not edited).
 *
 *  R7-6h (AC): one resolution order for the key directory -- --directory, then
 *        PIPELINE_PO_APPROVAL_DIRECTORY, then the machine-wide poKeyDirectory,
 *        then the legacy per-repository value (read-only, reported legacy), then
 *        the typed SIGN-KEY-DIRECTORY-UNSET -- with the resolving tier reported.
 *        Test-list items 1, 2, 3 and 12 of the plan. Exercised through
 *        parseHumanArgs and runHumanApproval with the module's own injection
 *        seams: homedirFn (machine-wide plane), gitCommonDirFn (legacy store),
 *        and the process environment (withEnvDirectory).
 *  R7-6i (AD): the committed trust-anchor set is any-of on the PAIR keyReference
 *        + publicKeySha256 at the probe's step (c) and at sign-intent's
 *        pre-prompt check. Test-list items 8 and 9 (the protected items 10 and
 *        11, and the push-prepare / verifier surfaces of item 9, are not here).
 *  The class `probe-environment-unavailable` (AE) is pinned by changing the two
 *  existing cases R7-6g(ii)-b and R7-6g(ii)-c, not here.
 *
 * Same safety rules as the R7-6 blocks above: every OpenSSL is the r76Spy stub
 * behind the injectable spawn seam, no prompt can block, keys are throwaway
 * fixtures in per-test directories, a key whose private half must never be
 * opened holds the trap string instead. Homes and git-common-dirs are injected,
 * so the real machine plane, the real repository store and the real `.git` are
 * never read.
 * ====================================================================== */

const R76H_TIERS = Object.freeze(["flag", "env", "plane", "legacy"]);
// The existing directorySource labels (PODIR-1, SETUP-2b, PO-KEYDIR-01(A)); the legacy store also sets legacy === true.
const R76H_TIER_LABEL = Object.freeze({ flag: "flag", env: "environment", plane: "machine-plane", legacy: "repo-scope" });

/** Declares a SET of committed trust anchors (schema v3), same on-disk shape as declareTrustAnchor. */
function r76hDeclareAnchors(repoRoot, authorities) {
  mkdirSync(join(repoRoot, "project"), { recursive: true });
  writeFileSync(join(repoRoot, "project/critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["governance-fork-disposition"],
    waivedKinds: [],
    trustAnchors: authorities.map((authority) => ({ keyReference: authority.keyReference, publicKeySha256: authority.publicKeySha256 })),
  }));
}

/** keyFixture with a chosen keyReference, so several keys of one repository stay distinguishable. */
function r76hKeyFixture(directory, keyReference) {
  const { authority } = keyFixture(directory);
  const named = { keyReference, publicKeySha256: authority.publicKeySha256 };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({ ...named, humanName: "Test Operator" }, null, 2)}\n`);
  return named;
}

/** One distinct existing directory per resolution tier; parse() builds a fresh injected home and
 * git-common-dir for each call, with exactly the requested tiers present. present.plane is
 * true (valid value), "malformed" or "unreadable" (an invalid plane), or falsy (no plane). */
function r76hResolverFixture() {
  const made = [];
  const fresh = (prefix) => { const path = mkdtempSync(join(tmpdir(), prefix)); made.push(path); return path; };
  const repoRoot = fresh("r76h-repo-");
  const dirs = Object.fromEntries(R76H_TIERS.map((tier) => [tier, fresh(`r76h-${tier}-`)]));
  return {
    repoRoot,
    dirs,
    parse(present) {
      const home = present.plane === true ? machinePlaneHomeFixture(dirs.plane) : noMachinePlaneHomeFixture();
      made.push(home);
      if (present.plane === "malformed") {
        mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
        writeFileSync(join(home, ".agent-pipeline", "machine.json"), "{ not valid json");
      }
      if (present.plane === "unreadable") mkdirSync(join(home, ".agent-pipeline", "machine.json"), { recursive: true });
      const common = fresh("r76h-common-");
      if (present.legacy) legacyRepoStoreFixture(common, realpathSync(dirs.legacy));
      const argv = ["setup", "--repo-root", repoRoot, ...(present.flag ? ["--directory", dirs.flag] : []), "--human-name", "Test Operator"];
      return withEnvDirectory(present.env ? dirs.env : undefined, () => parseHumanArgs(argv, { homedirFn: () => home, gitCommonDirFn: () => common }));
    },
    release() { for (const path of made) rmSync(path, { recursive: true, force: true }); },
  };
}

function r76hAssertResolved(fixture, parsed, winner, label) {
  assert.equal(parsed.error, undefined, `${label}: the key directory must resolve; observed '${String(parsed.error).slice(0, 160)}'`);
  assert.equal(realpathSync(parsed.directory), realpathSync(fixture.dirs[winner]),
    `${label}: the '${winner}' tier must win; the directory came from another tier (reported source '${parsed.directorySource}')`);
  assert.equal(parsed.directorySource, R76H_TIER_LABEL[winner], `${label}: the resolving tier must be reported as '${R76H_TIER_LABEL[winner]}'`);
  assert.equal(parsed.legacy === true, winner === "legacy", `${label}: only the legacy per-repository value is reported as legacy`);
}

test("R7-6h: the key directory resolves --directory, then PIPELINE_PO_APPROVAL_DIRECTORY, then the machine-wide value, then the legacy per-repository value, reporting the tier, and finally the typed SIGN-KEY-DIRECTORY-UNSET (decision AC, test-list 1)", () => {
  const fixture = r76hResolverFixture();
  try {
    R76H_TIERS.forEach((winner, index) => {
      const present = Object.fromEntries(R76H_TIERS.map((tier, position) => [tier, position >= index]));
      r76hAssertResolved(fixture, fixture.parse(present), winner, `tiers present: ${R76H_TIERS.slice(index).join(" + ")}`);
    });
    const none = fixture.parse({});
    assert.equal(none.code, "SIGN-KEY-DIRECTORY-UNSET", `no tier present: the typed result is required; observed '${String(none.error).slice(0, 160)}'`);
    assert.match(none.error, /SIGN-KEY-DIRECTORY-UNSET/u);
    assert.equal(none.finding?.findingId, "po-key-directory");
    assert.equal(none.finding?.status, "repairable");
    assert.match(String(none.finding?.cause), /^key-directory-unset/u);
    assert.equal(none.directory, undefined, "nothing resolved");
  } finally { fixture.release(); }
});

test("R7-6h: PIPELINE_PO_APPROVAL_DIRECTORY beats the machine-wide value and the legacy per-repository value, and an explicit --directory still beats it (decision AC, test-list 2)", () => {
  const fixture = r76hResolverFixture();
  try {
    const rows = [
      { label: "environment over the machine-wide value", present: { env: true, plane: true }, winner: "env" },
      { label: "environment over the legacy per-repository value", present: { env: true, legacy: true }, winner: "env" },
      { label: "environment over the machine-wide and the legacy value", present: { env: true, plane: true, legacy: true }, winner: "env" },
      { label: "--directory over the environment", present: { flag: true, env: true }, winner: "flag" },
      { label: "--directory over every other tier", present: { flag: true, env: true, plane: true, legacy: true }, winner: "flag" },
    ];
    for (const row of rows) r76hAssertResolved(fixture, fixture.parse(row.present), row.winner, row.label);
  } finally { fixture.release(); }
});

test("R7-6h: an invalid machine-wide store is bypassed by --directory and by PIPELINE_PO_APPROVAL_DIRECTORY and is a reported failure otherwise, never absent and never a fall-through to the legacy value (decision AC, test-list 3)", () => {
  const fixture = r76hResolverFixture();
  try {
    for (const invalid of ["malformed", "unreadable"]) {
      r76hAssertResolved(fixture, fixture.parse({ plane: invalid, legacy: true, flag: true }), "flag", `${invalid} plane, --directory given`);
      r76hAssertResolved(fixture, fixture.parse({ plane: invalid, legacy: true, env: true }), "env", `${invalid} plane, environment value given`);
      for (const present of [{ plane: invalid, legacy: true }, { plane: invalid }]) {
        const label = `${invalid} plane, no --directory, no environment value${present.legacy ? ", legacy value present" : ""}`;
        const parsed = fixture.parse(present);
        assert.match(String(parsed.error), /machine-scoped configuration plane is invalid/u, `${label}: a reported failure naming the plane is required; observed '${String(parsed.error).slice(0, 160)}'`);
        assert.equal(parsed.directory, undefined, `${label}: nothing resolves, in particular not the legacy value`);
        assert.notEqual(parsed.code, "SIGN-KEY-DIRECTORY-UNSET", `${label}: an invalid consulted store is never reported as absent`);
      }
    }
  } finally { fixture.release(); }
});

/** sign-intent against a fixture machine. `flag` is an explicit --directory, `environment` the value of
 * PIPELINE_PO_APPROVAL_DIRECTORY for this one process; with neither, the machine-wide default resolves. */
function r76hSign(env, spy, { flag = null, environment = undefined } = {}) {
  const argv = ["sign-intent", "--repo-root", env.dirs.repoRoot, ...(flag === null ? [] : ["--directory", flag]), "--intent-sha256", R76_INTENT];
  const dependencies = {
    readConfirmation: (prompt) => { env.events.push({ kind: "prompt", prompt }); return "approve"; },
    homedirFn: () => env.home,
    gitCommonDirFn: () => env.common,
    spawn: spy.spawn,
  };
  return withEnvDirectory(environment, () => r76Outcome(() => runHumanApproval(argv, dependencies)));
}

/** Person A holds two keys; K1 is the machine-wide default, K2 arrives by `route`. Both anchors are committed. */
function r76hPersonAChoosesK2(route) {
  const env = r76Env({ plane: "own" });
  const directoryK2 = mkdtempSync(join(tmpdir(), "r76h-k2-"));
  try {
    const k1 = r76hKeyFixture(env.dirs.directory, "person-a-key-1");
    const k2 = r76hKeyFixture(directoryK2, "person-a-key-2");
    r76hDeclareAnchors(env.dirs.repoRoot, [k1, k2]);
    const planeFile = join(env.home, ".agent-pipeline", "machine.json");
    const planeBefore = readFileSync(planeFile, "utf8");
    const spy = r76Spy("healthy", env.events);
    const outcome = r76hSign(env, spy, route === "flag" ? { flag: directoryK2 } : route === "environment" ? { environment: directoryK2 } : {});
    const expected = route === "default" ? { authority: k1, directory: env.dirs.directory } : { authority: k2, directory: directoryK2 };
    assert.equal(outcome.threw, false, `${route}: sign-intent must complete; observed ${r76Describe(outcome)}`);
    assert.equal(outcome.value.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(outcome.value.signer.keyReference, expected.authority.keyReference,
      `${route}: the signature must come from ${expected.authority.keyReference}; observed signer ${outcome.value.signer.keyReference}`);
    assert.equal(realpathSync(dirname(outcome.value.paths.proof)), realpathSync(expected.directory), `${route}: the proof is written next to the key that signed`);
    const proof = JSON.parse(readFileSync(outcome.value.paths.proof, "utf8"));
    assert.equal(verifyPoApprovalProof({ intent: { sha256: R76_INTENT }, trustPolicy: expected.authority, proof }).verified, true,
      `${route}: the proof verifies against the chosen key's own anchor`);
    assert.equal(readFileSync(planeFile, "utf8"), planeBefore, `${route}: the machine-wide value is byte-identical after the ceremony`);
    assert.equal(existsSync(repoScopeStorePath(env.common)), false, `${route}: nothing is written into the legacy per-repository store`);
  } finally {
    rmSync(directoryK2, { recursive: true, force: true });
    r76Release(env);
  }
}

test("R7-6h: person A whose machine-wide default is K1 signs with K2 when K2 is given as --directory, and the machine-wide value is unchanged (decision AC, test-list 12)", () => {
  r76hPersonAChoosesK2("default");
  r76hPersonAChoosesK2("flag");
});

test("R7-6h: person A whose machine-wide default is K1 signs with K2 when K2 is given as PIPELINE_PO_APPROVAL_DIRECTORY for one process, and the machine-wide value is unchanged (decision AC, test-list 12)", () => {
  r76hPersonAChoosesK2("default");
  r76hPersonAChoosesK2("environment");
});

/** Every string anywhere in a result value, with its path, so a handed-over command cannot hide in a nested field. */
function r76oStrings(value, path = "result", found = []) {
  if (typeof value === "string") found.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((entry, index) => r76oStrings(entry, `${path}[${index}]`, found));
  else if (value !== null && typeof value === "object") for (const [key, entry] of Object.entries(value)) r76oStrings(entry, `${path}.${key}`, found);
  return found;
}

test("R7-6o: handed-over commands carry no --directory (decision AC, test-list 12)", () => {
  for (const route of ["default", "environment"]) {
    const env = r76Env({ plane: "own" });
    const directoryK2 = mkdtempSync(join(tmpdir(), "r76o-k2-"));
    try {
      const k1 = r76hKeyFixture(env.dirs.directory, "person-a-key-1");
      const k2 = r76hKeyFixture(directoryK2, "person-a-key-2");
      r76hDeclareAnchors(env.dirs.repoRoot, [k1, k2]);
      const outcome = r76hSign(env, r76Spy("healthy", env.events), route === "environment" ? { environment: directoryK2 } : {});
      assert.equal(outcome.threw, false, `${route}: sign-intent must complete; observed ${r76Describe(outcome)}`);
      const strings = r76oStrings(outcome.value);
      assert.ok(strings.length > 0, `${route}: the result carries strings to inspect`);
      const offenders = strings.filter((entry) => entry.text.includes("--directory")).map((entry) => `${entry.path}: ${entry.text.slice(0, 160)}`);
      assert.deepEqual(offenders, [], `${route}: no handed-over command may carry --directory; observed ${offenders.join(" | ")}`);
    } finally {
      rmSync(directoryK2, { recursive: true, force: true });
      r76Release(env);
    }
  }
});

/** The read-only probe (steps a to c) against one key directory, with the stub OpenSSL and an injected home. */
function r76iProbe(env, directory) {
  return probeSigningReadiness({
    repository: env.dirs.repoRoot,
    directory,
    dependencies: { homedirFn: () => env.home, spawn: r76Spy("healthy").spawn },
  });
}
function r76iAssertAnchorRefused(result, label) {
  assert.equal(result.ok, false, `${label}: the probe must not pass`);
  const match = result.findings.find((entry) => entry.findingId === "trust-anchor-match");
  assert.ok(match, `${label}: the trust-anchor-match finding is present`);
  assert.equal(match.status, "attended", `${label}: observed status '${match.status}'`);
  assert.equal(String(match.cause).startsWith("key-anchor-mismatch"), true, `${label}: the cause begins with the class key-anchor-mismatch; observed '${String(match.cause).slice(0, 140)}'`);
}

test("R7-6i: with two committed trust anchors A and B, the key directories of A and of B each pass step (c) of the readiness probe and the key of B signs (decision AD, test-list 8)", () => {
  const env = r76Env();
  const directoryB = mkdtempSync(join(tmpdir(), "r76i-b-"));
  try {
    const a = r76hKeyFixture(env.dirs.directory, "person-a-key");
    const b = r76hKeyFixture(directoryB, "person-b-key");
    r76hDeclareAnchors(env.dirs.repoRoot, [a, b]);
    for (const [name, directory] of [["A", env.dirs.directory], ["B", directoryB]]) {
      const result = r76iProbe(env, directory);
      assert.equal(result.findings.find((entry) => entry.findingId === "trust-anchor-match")?.status, "ok", `key ${name}: step (c) passes; observed ${JSON.stringify(result.findings).slice(0, 200)}`);
      assert.equal(result.ok, true, `key ${name}: the whole probe passes`);
    }
    const spy = r76Spy("healthy", env.events);
    const outcome = r76hSign(env, spy, { flag: directoryB });
    assert.equal(outcome.threw, false, `observed ${r76Describe(outcome)}`);
    assert.equal(outcome.value.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(outcome.value.signer.keyReference, b.keyReference, "the second person's key signed");
    assert.equal(realpathSync(dirname(outcome.value.paths.proof)), realpathSync(directoryB));
    assert.equal(r76KeyPathSpawns(spy).length, 1, "exactly one process receives the key path: the signing spawn");
  } finally { rmSync(directoryB, { recursive: true, force: true }); r76Release(env); }
});

test("R7-6i: a key C outside the committed anchor set fails key-anchor-mismatch at the probe and at sign-intent before its private key is read (decision AD, test-list 8)", () => {
  const env = r76Env();
  const directoryB = mkdtempSync(join(tmpdir(), "r76i-b-"));
  const directoryC = mkdtempSync(join(tmpdir(), "r76i-c-"));
  try {
    const a = r76hKeyFixture(env.dirs.directory, "person-a-key");
    const b = r76hKeyFixture(directoryB, "person-b-key");
    r76hKeyFixture(directoryC, "person-c-key");
    writeFileSync(join(directoryC, "po-private.pem"), R76_TRAP);
    r76hDeclareAnchors(env.dirs.repoRoot, [a, b]);

    const probed = r76WithPrivateKeyReadSpy(() => r76iProbe(env, directoryC));
    r76iAssertAnchorRefused(probed.result, "probe of key C");
    assert.deepEqual(probed.opened, [], "the probe never opens the private key");

    const spy = r76Spy("healthy", env.events);
    const spied = r76WithPrivateKeyReadSpy(() => r76hSign(env, spy, { flag: directoryC }));
    r76AssertTyped(spied.result, { cls: "key-anchor-mismatch", findingId: "trust-anchor-match", status: "attended" });
    assert.deepEqual(spied.opened, [], "sign-intent ends before the private key of C is read or opened");
    assert.deepEqual(r76KeyPathSpawns(spy), [], "no process receives a key path");
    assert.equal(r76Prompts(env), 0, "the typed result ends the command before any prompt");
    assert.equal(r76Text(spied.result).includes(R76_TRAP), false, "no key byte in the result");
  } finally {
    rmSync(directoryB, { recursive: true, force: true });
    rmSync(directoryC, { recursive: true, force: true });
    r76Release(env);
  }
});

/** Anchor sets that all carry the key's own digest and its own keyReference, but never as one pair. */
function r76iNonPairAnchorSets(key) {
  return [
    { name: "the key's digest under another keyReference", anchors: [{ keyReference: "someone-elses-key", publicKeySha256: key.publicKeySha256 }] },
    { name: "the key's keyReference over another digest", anchors: [{ keyReference: key.keyReference, publicKeySha256: "d".repeat(64) }] },
    { name: "the key's digest and the key's keyReference in two different anchors", anchors: [
      { keyReference: "someone-elses-key", publicKeySha256: key.publicKeySha256 },
      { keyReference: key.keyReference, publicKeySha256: "d".repeat(64) },
    ] },
  ];
}

test("R7-6i: pair matching at the readiness probe: the same public-key digest under a different keyReference is refused, as is a digest and a keyReference taken from two different anchors (decision AD, test-list 9)", () => {
  const env = r76Env();
  try {
    const a = r76hKeyFixture(env.dirs.directory, "person-a-key");
    r76hDeclareAnchors(env.dirs.repoRoot, [a]);
    const control = r76iProbe(env, env.dirs.directory);
    assert.equal(control.ok, true, `control: the matching pair passes step (c); observed ${JSON.stringify(control.findings).slice(0, 200)}`);
    for (const variant of r76iNonPairAnchorSets(a)) {
      r76hDeclareAnchors(env.dirs.repoRoot, variant.anchors);
      r76iAssertAnchorRefused(r76iProbe(env, env.dirs.directory), variant.name);
    }
  } finally { r76Release(env); }
});

test("R7-6i: pair matching at sign-intent's pre-prompt check: the same public-key digest under a different keyReference ends in key-anchor-mismatch before the private key is read, any prompt or any key-path spawn (decision AD, test-list 9)", () => {
  const env = r76Env();
  try {
    const a = r76hKeyFixture(env.dirs.directory, "person-a-key");
    r76hDeclareAnchors(env.dirs.repoRoot, [a]);
    const controlSpy = r76Spy("healthy", env.events);
    const control = r76hSign(env, controlSpy, { flag: env.dirs.directory });
    assert.equal(control.threw, false, `control: the matching pair signs; observed ${r76Describe(control)}`);
    assert.equal(control.value.code, "PO-HUMAN-SIGN-INTENT-READY");
    env.events.length = 0;
    writeFileSync(join(env.dirs.directory, "po-private.pem"), R76_TRAP);
    for (const variant of r76iNonPairAnchorSets(a)) {
      r76hDeclareAnchors(env.dirs.repoRoot, variant.anchors);
      const spy = r76Spy("healthy", env.events);
      const spied = r76WithPrivateKeyReadSpy(() => r76hSign(env, spy, { flag: env.dirs.directory }));
      r76AssertTyped(spied.result, { cls: "key-anchor-mismatch", findingId: "trust-anchor-match", status: "attended" });
      assert.deepEqual(spied.opened, [], `${variant.name}: the private key is never read or opened`);
      assert.deepEqual(r76KeyPathSpawns(spy), [], `${variant.name}: no process receives a key path`);
      assert.equal(r76Prompts(env), 0, `${variant.name}: the typed result ends the command before any prompt`);
    }
  } finally { r76Release(env); }
});

test("the agent-facing approval gate cannot invoke authorize-critical: signing stays on the human terminal (fixtureDirs variant)", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    assert.throws(
      () => runApprovalGate(["authorize-critical", ...criticalRequestArgs(dirs)], {}),
      /Usage:/u,
    );
    assert.equal(existsSync(criticalArtifacts(dirs).request), false, "the public control plane must not be able to reach authorize-critical at all");
  } finally {
    cleanup(dirs);
  }
});
