#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// RV-S7-T: pins Spec RV-8 (specs/sprint-alfred-epic/spec.md, "the attended
// external CLI verifies the operator-selected signer anchor and the detached
// signature before any write ... each refuse with a typed code and leave every
// target byte-for-byte unchanged") for slice S7 ONLY: the verify-only part of
// the attended-recovery CLI, with no write path. Test-first (QG-04): the CLI
// does not exist yet, so every case below that loads it is RED at the dynamic
// import. The implementation slice is harness/scripts/attended-recovery.mjs.
//
// RV-S7-T assumptions (for ratification)
// The Spec fixes the refusal behaviour; the design note
// (specs/sprint-alfred-epic/design/recovery-availability-rv-2026-10-08.md,
// Q1/Q2/Q3/Q5) fixes the location, the repository identity and the four RV-8
// codes. It leaves the wire shapes open. Dispatcher ruling (37) proceeds
// provisionally on the note's recommendations (Q1 A, Q2 A, Q3 A) pending PO
// question N7. Everything below that the Spec and the note do not state is an
// assumption of this file and is listed here so it can be ratified or changed
// in one place:
//  A1. Module and entry point. harness/scripts/attended-recovery.mjs exports
//      `run(argv, { hooks })`. It returns the result object (a promise of it is
//      fine, the tests `await`). A refusal is a returned result, never a throw.
//      The thin `main()` and the process exit code are not exercised here.
//  A2. argv shape: `<verb> --repo <dir> --artifact <file> --anchor <file>
//      --authorization <file>`. S7 implements the verb `verify`. There is no
//      default for any flag (the note: "the anchor has no default").
//  A3. Result shape: `{ schema: "pipeline.attended-recovery-result.v1",
//      status, code, prerequisite, mutated }`. The note's status set
//      (applied | resumed | refused | unavailable) gains `verified` for the
//      verify-only verb. Pinned: on success `status: "verified"` and
//      `mutated: false`; on refusal `status: "refused"`, the typed `code` and
//      `mutated: false`. Not pinned: `code`/`prerequisite` of a success, and
//      `prerequisite` of a refusal (RV-11 owns that for `unavailable`).
//  A4. Package schema `pipeline.attended-recovery-package.v1`:
//      `{ schema, repository: { rootCommit, rootTree }, artifactSha256,
//      entries: [ { path, preimage: { state: "present"|"absent", sha256?,
//      size? }, postImage: { sha256, size } } ] }`, entries sorted by path.
//      S7 verification does not judge preimages or paths (RV-9, slice S8); the
//      fixture binds them truthfully so a stricter implementation also passes.
//  A5. Artifact schema `pipeline.attended-recovery-artifact.v1`, one JSON
//      bundle `{ schema, files: [ { path, contentBase64 } ] }`. The package
//      binds `artifactSha256` = sha256 of the artifact file's raw bytes.
//  A6. Authorization file: schema `pipeline.attended-recovery-authorization.v1`
//      = `{ schema, package, intent, proof }`. `intent` has the exact
//      `createPoApprovalIntent` shape of plugins/pipeline-core/lib/
//      po-approval-proof.mjs with `kind: "attended-recovery"`, `candidate:
//      { commit: <root commit OID>, tree: <its tree OID> }` and
//      `subjectSha256` = sha256(canonical(package)). `proof` is the
//      `pipeline.po-approval-proof.v1` envelope: Ed25519 over the UTF-8 hex
//      intent sha256, `publicKey` an SPKI PEM string. The CLI inlines that
//      recipe (it may import nothing from the plugin); the self-check case
//      below pins that this file builds signatures exactly as that source does.
//  A7. Anchor file: the trust-policy shape `{ keyReference, publicKeySha256 }`
//      (publicKeySha256 = sha256 of the signer's PEM string), selected by the
//      operator and kept outside the repository. A repository file such as
//      project/critical-human-proof.json is never a trust source.
//  A8. Repository identity (design note Q2 A) is the git root-commit OID
//      (`git rev-list --max-parents=0 HEAD`); package.repository and
//      intent.candidate both name it. The fixtures keep the two consistent, so
//      the refusal is attributable to the repository check alone.
//  A9. Codes: the four RV-8 codes of the note (ATR-REPOSITORY-MISMATCH,
//      ATR-ANCHOR-MISMATCH, ATR-SIGNATURE-INVALID, ATR-ARTIFACT-MISMATCH).
//      The Spec and the note name no code for a verb that has no write path in
//      S7; this file assumes ATR-VERB-UNSUPPORTED for `apply`.
// A10. Zero mutation is a byte snapshot (files, directories, symlink targets)
//      of the whole temporary root: the fixture repository including `.git`,
//      plus the external inputs. A verify-only CLI must not even refresh the
//      git index. `hooks.beforeStep` (the S9 crash-injection seam) must never
//      fire, because verify starts no journal step.
// A11. Each refusal fixture carries exactly ONE fault, so the precedence among
//      the four refusals is deliberately not pinned.
// A12. Isolation: GIT_* variables are cleared and the global git config points
//      at an empty file, so the real home and machine configuration are never
//      read. Key pairs are generated here per fixture; no real key is read.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const RESULT_SCHEMA = "pipeline.attended-recovery-result.v1";
const PACKAGE_SCHEMA = "pipeline.attended-recovery-package.v1";
const ARTIFACT_SCHEMA = "pipeline.attended-recovery-artifact.v1";
const AUTHORIZATION_SCHEMA = "pipeline.attended-recovery-authorization.v1";
const INTENT_SCHEMA = "pipeline.po-approval-intent.v1";
const PROOF_SCHEMA = "pipeline.po-approval-proof.v1";
const KEY_REFERENCE = "rv-s7-test-key";

const EXISTING_PATH = "plugins/pipeline-core/lib/guard/example-guard.mjs";
const NEW_PATH = "harness/scripts/example-recovered.test.mjs";
const PREIMAGE_TEXT = "export const guard = 1;\n";
const POST_IMAGES = [
  { path: NEW_PATH, text: "// recovered test\n" },
  { path: EXISTING_PATH, text: "export const guard = 2;\n" },
];
const ALTERED_POST_IMAGES = [
  { path: NEW_PATH, text: "// recovered test\n" },
  { path: EXISTING_PATH, text: "export const guard = 666;\n" },
];
const FOREIGN_IDENTITY = { commit: "a".repeat(40), tree: "b".repeat(40) };

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
// Mirrors canonical() of plugins/pipeline-core/lib/po-approval-proof.mjs; the
// self-check case compares the two so the mirror cannot drift silently.
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);

// The CLI does not exist yet: this import is the RED of every case that loads it.
const loadCli = () => import("./attended-recovery.mjs");

let sandboxRoot;
let savedGitEnv;

test.before(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), "rv-s7-sandbox-"));
  const emptyConfig = join(sandboxRoot, "gitconfig");
  writeFileSync(emptyConfig, "");
  savedGitEnv = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_")) {
      savedGitEnv[key] = process.env[key];
      delete process.env[key];
    }
  }
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "RV S7 Fixture",
    GIT_AUTHOR_EMAIL: "rv-s7@example.invalid",
    GIT_COMMITTER_NAME: "RV S7 Fixture",
    GIT_COMMITTER_EMAIL: "rv-s7@example.invalid",
    GIT_AUTHOR_DATE: "2026-10-08T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-10-08T00:00:00Z",
  });
});

test.after(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_")) delete process.env[key];
  }
  Object.assign(process.env, savedGitEnv);
  rmSync(sandboxRoot, { recursive: true, force: true, maxRetries: 5 });
});

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
}

function put(root, relativePath, text) {
  const full = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
}

function makeSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return { privateKey, publicKeyPem, publicKeySha256: sha256(publicKeyPem) };
}

function artifactBundle(postImages) {
  const bundle = {
    schema: ARTIFACT_SCHEMA,
    files: postImages.map(({ path, text }) => ({ path, contentBase64: Buffer.from(text, "utf8").toString("base64") })),
  };
  return Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`, "utf8");
}

const sizeOf = (text) => Buffer.byteLength(text, "utf8");

// Fixture repository in the OS temp dir: `git init` + one commit (+ optionally a
// second one, so the root commit and HEAD differ). The operator inputs live in a
// sibling directory, outside the repository under repair.
function buildFixture(t, { extraCommit = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "rv-s7-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5 }));
  const repo = join(root, "repo");
  const external = join(root, "external");
  mkdirSync(repo, { recursive: true });
  mkdirSync(external, { recursive: true });
  git(repo, "init", "-q");
  put(repo, EXISTING_PATH, PREIMAGE_TEXT);
  put(repo, "README.md", "fixture\n");
  git(repo, "add", "--", ".");
  git(repo, "commit", "-q", "-m", "fixture root commit");
  const rootCommit = git(repo, "rev-list", "--max-parents=0", "HEAD");
  const rootTree = git(repo, "rev-parse", `${rootCommit}^{tree}`);
  let headCommit = rootCommit;
  let headTree = rootTree;
  if (extraCommit) {
    put(repo, "docs/later.md", "later\n");
    git(repo, "add", "--", "docs/later.md");
    git(repo, "commit", "-q", "-m", "fixture second commit");
    headCommit = git(repo, "rev-parse", "HEAD");
    headTree = git(repo, "rev-parse", "HEAD^{tree}");
  }
  return {
    root,
    repo,
    external,
    rootCommit,
    rootTree,
    headCommit,
    headTree,
    rootIdentity: { commit: rootCommit, tree: rootTree },
    anchored: makeSigner(),
    foreign: makeSigner(),
    artifactBytes: artifactBundle(POST_IMAGES),
    alteredArtifactBytes: artifactBundle(ALTERED_POST_IMAGES),
  };
}

function buildPackage(fx, identity) {
  const entry = (path, preimage, text) => ({ path, preimage, postImage: { sha256: sha256(text), size: sizeOf(text) } });
  return {
    schema: PACKAGE_SCHEMA,
    repository: { rootCommit: identity.commit, rootTree: identity.tree },
    artifactSha256: sha256(fx.artifactBytes),
    entries: [
      entry(NEW_PATH, { state: "absent" }, POST_IMAGES[0].text),
      entry(
        EXISTING_PATH,
        { state: "present", sha256: sha256(PREIMAGE_TEXT), size: sizeOf(PREIMAGE_TEXT) },
        POST_IMAGES[1].text,
      ),
    ],
  };
}

function buildIntent(pkg, identity) {
  return {
    schema: INTENT_SCHEMA,
    kind: "attended-recovery",
    featureId: "sprint-alfred",
    planSha256: sha256("rv-s7-plan"),
    specSha256: sha256("rv-s7-spec"),
    candidate: { commit: identity.commit, tree: identity.tree },
    policyRevision: "rv-8",
    subjectSha256: sha256(canonical(pkg)),
    decision: "approve",
  };
}

function buildProof(intent, signer, { corrupt = false } = {}) {
  const intentSha256 = sha256(canonical(intent));
  const signature = Buffer.from(sign(null, Buffer.from(intentSha256, "utf8"), signer.privateKey));
  if (corrupt) signature[5] ^= 0xff; // still 64 well-formed bytes, but no longer a valid signature
  return {
    schema: PROOF_SCHEMA,
    intentSha256,
    keyReference: KEY_REFERENCE,
    publicKey: signer.publicKeyPem,
    signatureBase64: signature.toString("base64"),
  };
}

// Writes the operator inputs for one case and returns them. Every option is one
// single fault relative to the default, correctly signed, correctly anchored case.
function stageCase(
  fx,
  { signer = fx.anchored, anchorSigner = fx.anchored, identity = fx.rootIdentity, corruptSignature = false, suppliedArtifact = fx.artifactBytes } = {},
) {
  const pkg = buildPackage(fx, identity);
  const intent = buildIntent(pkg, identity);
  const proof = buildProof(intent, signer, { corrupt: corruptSignature });
  const authorization = { schema: AUTHORIZATION_SCHEMA, package: pkg, intent, proof };
  const paths = {
    artifact: join(fx.external, "artifact.json"),
    anchor: join(fx.external, "anchor.json"),
    authorization: join(fx.external, "authorization.json"),
  };
  writeFileSync(paths.artifact, suppliedArtifact);
  writeFileSync(
    paths.anchor,
    `${JSON.stringify({ keyReference: KEY_REFERENCE, publicKeySha256: anchorSigner.publicKeySha256 }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(paths.authorization, `${JSON.stringify(authorization, null, 2)}\n`, "utf8");
  return { paths, pkg, intent, proof, authorization };
}

const argvFor = (verb, fx, staged) => [
  verb,
  "--repo",
  fx.repo,
  "--artifact",
  staged.paths.artifact,
  "--anchor",
  staged.paths.anchor,
  "--authorization",
  staged.paths.authorization,
];

// Byte snapshot of a directory tree: files by size+sha256, directories, symlink targets.
function snapshot(dir, relative = "") {
  const out = {};
  for (const entry of readdirSync(join(dir, relative), { withFileTypes: true })) {
    const relativePath = relative === "" ? entry.name : `${relative}/${entry.name}`;
    const full = join(dir, relativePath);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      out[relativePath] = `link:${readlinkSync(full)}`;
    } else if (stat.isDirectory()) {
      out[relativePath] = "dir";
      Object.assign(out, snapshot(dir, relativePath));
    } else {
      out[relativePath] = `file:${stat.size}:${sha256(readFileSync(full))}`;
    }
  }
  return out;
}

// Runs the CLI with a spy on the S9 crash-injection seam: verify starts no journal step.
async function drive(run, argv) {
  const calls = [];
  const result = await run(argv, {
    hooks: {
      beforeStep: (...args) => {
        calls.push(args);
      },
    },
  });
  assert.deepEqual(calls, [], "verify-only: no journal step may start");
  return result;
}

function assertVerified(result) {
  assert.equal(result.schema, RESULT_SCHEMA);
  assert.equal(result.status, "verified");
  assert.equal(result.mutated, false);
}

function assertRefused(result, code) {
  assert.equal(result.schema, RESULT_SCHEMA);
  assert.equal(result.status, "refused");
  assert.equal(result.code, code);
  assert.equal(result.mutated, false);
}

function assertTargetsUntouched(fx, before) {
  assert.deepEqual(snapshot(fx.root), before, "every byte of the fixture tree must be unchanged");
  assert.equal(readFileSync(join(fx.repo, ...EXISTING_PATH.split("/")), "utf8"), PREIMAGE_TEXT);
  assert.equal(existsSync(join(fx.repo, ...NEW_PATH.split("/"))), false, "no signed path may be created");
}

test("RV-8: fixture signatures follow the po-approval-proof recipe (fixture self-check)", async (t) => {
  // Green by design: it validates the fixture builders against the real recipe so
  // the RED cases fail for the right reason once the CLI exists.
  const lib = await import("../../plugins/pipeline-core/lib/po-approval-proof.mjs");
  const fx = buildFixture(t, { extraCommit: true });
  assert.match(fx.rootCommit, /^[a-f0-9]{40,64}$/u);
  assert.notEqual(fx.rootCommit, fx.rootTree);
  assert.notEqual(fx.rootCommit, fx.headCommit, "the root commit and HEAD must differ in the two-commit fixture");

  const sample = { b: [1, { z: null, a: "x" }], a: true };
  assert.equal(canonical(sample), lib.canonical(sample));

  const valid = stageCase(fx);
  const libIntent = lib.createPoApprovalIntent({
    kind: valid.intent.kind,
    featureId: valid.intent.featureId,
    planSha256: valid.intent.planSha256,
    specSha256: valid.intent.specSha256,
    candidate: valid.intent.candidate,
    policyRevision: valid.intent.policyRevision,
    subjectSha256: valid.intent.subjectSha256,
    decision: valid.intent.decision,
  });
  assert.deepEqual(libIntent.value, valid.intent);
  assert.equal(libIntent.sha256, valid.proof.intentSha256);

  const verifyWith = (staged, anchorSigner) =>
    lib.verifyPoApprovalProof({
      intent: { sha256: staged.proof.intentSha256 },
      trustPolicy: { keyReference: KEY_REFERENCE, publicKeySha256: anchorSigner.publicKeySha256 },
      proof: staged.proof,
    });
  assert.equal(verifyWith(valid, fx.anchored).verified, true);
  assert.equal(valid.pkg.artifactSha256, sha256(readFileSync(valid.paths.artifact)));

  const foreignSigner = stageCase(fx, { signer: fx.foreign });
  assert.equal(verifyWith(foreignSigner, fx.anchored).code, "PO-APPROVAL-TRUST-MISMATCH");

  const corrupted = stageCase(fx, { corruptSignature: true });
  assert.equal(verifyWith(corrupted, fx.anchored).code, "PO-APPROVAL-PROOF-MISMATCH");

  const wrongRepository = stageCase(fx, { identity: FOREIGN_IDENTITY });
  assert.equal(verifyWith(wrongRepository, fx.anchored).verified, true, "only the repository identity is wrong");
  assert.notEqual(wrongRepository.intent.candidate.commit, fx.rootCommit);

  const altered = stageCase(fx, { suppliedArtifact: fx.alteredArtifactBytes });
  assert.equal(verifyWith(altered, fx.anchored).verified, true, "only the artifact bytes are wrong");
  assert.notEqual(sha256(readFileSync(altered.paths.artifact)), altered.pkg.artifactSha256);

  const before = snapshot(fx.root);
  assert.deepEqual(snapshot(fx.root), before, "the snapshot is stable on an untouched tree");
  writeFileSync(join(fx.external, "probe.txt"), "x");
  assert.notDeepEqual(snapshot(fx.root), before, "the snapshot detects an added file");
});

test("RV-8: a correctly signed recovery package for the fixture repository verifies with zero mutation", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t);
  const staged = stageCase(fx);
  const before = snapshot(fx.root);
  const result = await drive(run, argvFor("verify", fx, staged));
  assertVerified(result);
  assertTargetsUntouched(fx, before);
});

test("RV-8: repository identity is the root-commit OID, not HEAD", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t, { extraCommit: true });
  assert.notEqual(fx.headCommit, fx.rootCommit);

  const named = stageCase(fx);
  let before = snapshot(fx.root);
  assertVerified(await drive(run, argvFor("verify", fx, named)));
  assertTargetsUntouched(fx, before);

  const head = stageCase(fx, { identity: { commit: fx.headCommit, tree: fx.headTree } });
  before = snapshot(fx.root);
  assertRefused(await drive(run, argvFor("verify", fx, head)), "ATR-REPOSITORY-MISMATCH");
  assertTargetsUntouched(fx, before);
});

test("RV-8: a package naming another root-commit OID is refused with ATR-REPOSITORY-MISMATCH and zero mutation", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t);
  const staged = stageCase(fx, { identity: FOREIGN_IDENTITY });
  const before = snapshot(fx.root);
  const result = await drive(run, argvFor("verify", fx, staged));
  assertRefused(result, "ATR-REPOSITORY-MISMATCH");
  assertTargetsUntouched(fx, before);
});

test("RV-8: a signer key other than the operator-selected anchor is refused with ATR-ANCHOR-MISMATCH and zero mutation", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t);
  const staged = stageCase(fx, { signer: fx.foreign, anchorSigner: fx.anchored });
  const before = snapshot(fx.root);
  const result = await drive(run, argvFor("verify", fx, staged));
  assertRefused(result, "ATR-ANCHOR-MISMATCH");
  assertTargetsUntouched(fx, before);
});

test("RV-8: a trust file inside the repository under repair never substitutes for the operator anchor", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t);
  // The repository under repair pins the signer's own key. Trust comes only from
  // the operator-selected anchor, which still pins a different key.
  put(
    fx.repo,
    "project/critical-human-proof.json",
    `${JSON.stringify({ keyReference: KEY_REFERENCE, publicKeySha256: fx.foreign.publicKeySha256 }, null, 2)}\n`,
  );
  const staged = stageCase(fx, { signer: fx.foreign, anchorSigner: fx.anchored });
  const before = snapshot(fx.root);
  const result = await drive(run, argvFor("verify", fx, staged));
  assertRefused(result, "ATR-ANCHOR-MISMATCH");
  assert.deepEqual(snapshot(fx.root), before, "every byte of the fixture tree must be unchanged");
  assert.equal(existsSync(join(fx.repo, ...NEW_PATH.split("/"))), false, "no signed path may be created");
});

test("RV-8: a corrupted signature is refused with ATR-SIGNATURE-INVALID and zero mutation", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t);
  const staged = stageCase(fx, { corruptSignature: true });
  const before = snapshot(fx.root);
  const result = await drive(run, argvFor("verify", fx, staged));
  assertRefused(result, "ATR-SIGNATURE-INVALID");
  assertTargetsUntouched(fx, before);
});

test("RV-8: an artifact whose bytes differ from the signed digest is refused with ATR-ARTIFACT-MISMATCH and zero mutation", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t);
  const staged = stageCase(fx, { suppliedArtifact: fx.alteredArtifactBytes });
  const before = snapshot(fx.root);
  const result = await drive(run, argvFor("verify", fx, staged));
  assertRefused(result, "ATR-ARTIFACT-MISMATCH");
  assertTargetsUntouched(fx, before);
});

test("RV-8: S7 has no write path - an apply verb is refused with ATR-VERB-UNSUPPORTED and writes nothing", async (t) => {
  const { run } = await loadCli();
  const fx = buildFixture(t);
  const staged = stageCase(fx); // fully valid: the refusal is about the verb, not the package
  const before = snapshot(fx.root);
  const result = await drive(run, argvFor("apply", fx, staged));
  assertRefused(result, "ATR-VERB-UNSUPPORTED");
  assertTargetsUntouched(fx, before);
});
