// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.signed-quality-package-route-is-not-agent-operable-on-windows (AC-259).
// Acceptance points (backlog item Description/Proposal):
//   P1 disclosure: a quality package is labelled by its real kind and digest, never as an HGO/GMW guard override.
//   P2 guard lane: signedQualityPackageCommandAdmission admits native-Windows backslash path words (canonical rendering only)
//      for every materializer mode, including the one-shot prepare-commit; metacharacters stay refused.
//   P3 path spelling + mode bits: Git-reported `D:/x` and Node `D:\x` are the same physical path; the POSIX mode-bit term
//      applies only where the platform has mode bits; the receipt verifier carries an nlink check.
//   P4 one agent-runnable command: prepare-commit performs apply, stage, authorize in order and reports one typed result
//      (library and the real materializer CLI).
//   P5 pre-commit backstop: a verified package authorization is recognised pre-commit and post-commit; no human --no-verify.
//   P6 latency: the pre-prompt disclosure path is direct and bounded (the live passphrase prompt is not exercised here).
// Host limitation: directory mode bits and directory symlinks are unavailable on native Windows; the POSIX receipt-mode case
// is skipped there with owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7).
// RED proofs: scratch mirrors of the pre-hotfix behaviour (string path compare, unconditional mode-bit test) are shown to
// fail the same assertions; production is never edited.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SIGNED_QUALITY_PACKAGE_SCHEMA,
  applyCommittedQualityPackage,
  authorizeQualityPackageCommit,
  describeSignedQualityPackageIntent,
  gitReportedPathIsSamePhysicalPath,
  prepareCommittedQualityPackageCommit,
  qualityPackageIntentSha256,
  receiptModeBitsRefused,
  validateQualityPackageCommandArgs,
  verifyQualityPackageCommitAuthorization,
  verifyQualityPackageIntegrationPostCommit,
  verifyQualityPackageIntegrationPreCommit,
} from "../signed-quality-package.mjs";
import { signedQualityPackageCommandAdmission } from "../guard/gate-strength-lane.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..", "..");
const REPO_SCRATCH = join(PLUGIN_ROOT, "..", "..", "scratch");
const MATERIALIZER = realpathSync(join(PLUGIN_ROOT, "scripts", "quality-package-materializer.mjs"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
  return r.stdout.trim();
};

function fixture() {
  mkdirSync(REPO_SCRATCH, { recursive: true });
  const root = realpathSync(mkdtempSync(join(REPO_SCRATCH, "alf-qpw-")));
  git(root, ["init", "-q"]);
  for (const [k, v] of [["user.email", "test@example.invalid"], ["user.name", "Test"], ["core.autocrlf", "false"], ["commit.gpgsign", "false"]]) git(root, ["config", k, v]);
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(join(root, ".gitignore"), "scratch/\n");
  writeFileSync(join(root, "subject.txt"), "before\n");
  mkdirSync(join(root, "project"));
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "test-key", publicKeySha256: sha(publicKey) }] }));
  git(root, ["add", ".gitignore", "subject.txt", "project/critical-human-proof.json"]);
  git(root, ["commit", "-qm", "base"]);
  const record = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: git(root, ["rev-parse", "HEAD"]), unifiedDiff: "diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n", expectedDigests: { "subject.txt": sha("after\n") } };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(record.intentSha256), keys.privateKey).toString("base64") };
  mkdirSync(join(root, "scratch"));
  const intentPath = join(root, "scratch", "intent.json");
  const proofPath = join(root, "scratch", "proof.json");
  writeFileSync(intentPath, JSON.stringify(record));
  writeFileSync(proofPath, JSON.stringify(proof));
  const policyPath = join(root, "project", "critical-human-proof.json");
  const receiptPath = () => join(git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "agent-pipeline", "signed-quality-packages", "commit-authorizations", `${record.intentSha256}.json`);
  return { root, record, proof, intentPath, proofPath, policyPath, receiptPath };
}
const cleanup = (item) => rmSync(item.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

// ---- P1 disclosure -------------------------------------------------------------------------------------------------
test("P1: the disclosure names the real package kind, base commit, paths and digests, never an HGO/GMW override", () => {
  const item = fixture();
  try {
    const started = Date.now();
    const described = describeSignedQualityPackageIntent(item.record, item.record.intentSha256);
    assert.ok(Date.now() - started < 2000, "P6: direct disclosure is bounded (no store scan, no per-path spawn)");
    assert.equal(described.resolved, true);
    assert.equal(described.code, "QUALITY-PACKAGE-DISCLOSURE-RESOLVED");
    const text = described.lines.join("\n");
    assert.ok(text.startsWith(`recorded request: ${SIGNED_QUALITY_PACKAGE_SCHEMA}`));
    assert.ok(text.includes(item.record.baseCommit));
    assert.ok(text.includes(`subject.txt: ${sha("after\n")}`));
    assert.ok(!/HGO|GMW|guard-override|guard-lift|DIGEST-MISMATCH/u.test(text), "no guard-override label");
    assert.equal(describeSignedQualityPackageIntent(item.record, sha("other")), null, "a digest that does not bind the package never discloses");
  } finally { cleanup(item); }
});

test("P1: sign-intent routes a quality-package request through its own disclosure case before the HGO/GMW resolvers", () => {
  const source = readFileSync(join(PLUGIN_ROOT, "scripts", "po-human-approval.mjs"), "utf8");
  const qp = source.indexOf("case SIGNED_QUALITY_PACKAGE_SCHEMA:");
  const gmw = source.indexOf("record = describeGmw(");
  assert.ok(qp > 0 && gmw > qp);
  assert.ok(!/describeGmw|describeHgo/u.test(source.slice(qp, source.indexOf("break;", qp))));
});

// ---- P2 guard lane -------------------------------------------------------------------------------------------------
test("P2: the guard lane admits the one-shot and every materializer mode for this host's canonical paths, and refuses metacharacters", () => {
  const item = fixture();
  try {
    const words = (mode) => [process.execPath, MATERIALIZER, item.root, item.intentPath, item.proofPath, item.policyPath, mode];
    const single = (list) => list.map((w) => `'${w}'`).join(" ");
    const started = Date.now();
    for (const mode of ["verify", "apply", "authorize-commit", "prepare-commit"]) {
      assert.equal(signedQualityPackageCommandAdmission(single(words(mode)), item.root), true, `${mode} admitted`);
    }
    assert.ok(Date.now() - started < 5000, "P6: admission is bounded");
    assert.equal(signedQualityPackageCommandAdmission(single(words("push")), item.root), false, "unknown mode");
    const good = single(words("prepare-commit"));
    for (const meta of ["$", "`", ";", "&", "|", "<", ">", "\n"]) {
      assert.equal(signedQualityPackageCommandAdmission(`${good} ${meta} echo x`, item.root), false, JSON.stringify(meta));
    }
    assert.equal(validateQualityPackageCommandArgs(words("prepare-commit").slice(2), item.root), true);
    assert.equal(validateQualityPackageCommandArgs([item.root, item.intentPath, item.proofPath, join(item.root, "other.json"), "prepare-commit"], item.root), false, "policy must be the committed path");
  } finally { cleanup(item); }
});

test("P2: on native Windows backslash path words are admitted only as their exact canonical rendering",
  { skip: process.platform !== "win32" && "native Windows backslash path words exist only on a win32 host" }, () => {
    const item = fixture();
    try {
      assert.ok(item.root.includes("\\"), "fixture exercises backslash paths");
      const words = [process.execPath, MATERIALIZER, item.root, item.intentPath, item.proofPath, item.policyPath, "prepare-commit"];
      const single = words.map((w) => `'${w}'`).join(" ");
      const doubled = words.map((w) => JSON.stringify(w)).join(" ");
      assert.equal(signedQualityPackageCommandAdmission(single, item.root), true, "single-quoted");
      assert.equal(signedQualityPackageCommandAdmission(doubled, item.root), true, "double-quoted, doubled backslashes");
      assert.equal(signedQualityPackageCommandAdmission(single, item.root, { platform: "linux" }), false, "backslash stays refused off win32");
      assert.equal(signedQualityPackageCommandAdmission(single.replace(`'${item.intentPath}'`, item.intentPath), item.root), false, "unquoted native path");
      assert.equal(signedQualityPackageCommandAdmission(`${single}\\`, item.root), false, "trailing backslash");
    } finally { cleanup(item); }
  });

// The executed counterpart of the typed-skipped native test above: it drives the REAL lane through the injected `platform`
// seam. The node executable word is a synthetic native-Windows path (backslashes and a space) injected as the trusted execPath, so
// the win32 rendering gate is exercised end to end on any host. Every other word stays this host's canonical path: the physical-file
// half of the lane (realpath, link count, path grammar) is bound to the running host and has no seam, so native `D:\` root/intent/
// proof/policy words are admitted only on a real win32 host -- that variant remains the separately named native-host obligation.
test("P2: through the injected win32 platform seam a backslash-bearing word is admitted only as its exact canonical rendering, on any host", () => {
  const item = fixture();
  try {
    const winNode = "C:\\Program Files\\nodejs\\node.exe";
    const win32 = { platform: "win32", processExecPath: winNode };
    const linux = { platform: "linux", processExecPath: winNode };
    const rest = [MATERIALIZER, item.root, item.intentPath, item.proofPath, item.policyPath, "prepare-commit"];
    const render = (words, quote) => words.map(quote).join(" ");
    const single = render([winNode, ...rest], (w) => `'${w}'`);
    const doubled = render([winNode, ...rest], (w) => JSON.stringify(w));
    const admits = (command, dependencies) => signedQualityPackageCommandAdmission(command, item.root, dependencies);
    assert.equal(admits(single, win32), true, "single-quoted backslash word");
    assert.equal(admits(doubled, win32), true, "double-quoted, doubled backslashes");
    assert.equal(admits(single, linux), false, "the same command stays refused off win32");
    assert.equal(admits(doubled, linux), false, "double-quoted form stays refused off win32");
    assert.equal(admits(single, { processExecPath: winNode }), process.platform === "win32", "the host platform decides when no platform is injected");
    // Non-canonical renderings are refused even though a POSIX-dialect parse may yield the same words.
    assert.equal(admits(render([winNode, ...rest], (w) => `"${w}"`), win32), false, "double-quoted without doubled backslashes");
    assert.equal(admits(`${single}\\`, win32), false, "trailing backslash");
    assert.equal(admits(single.replace(`'${winNode}'`, winNode), win32), false, "unquoted native path");
    assert.equal(admits(single.replace(winNode, "C:\\Other\\node.exe"), win32), false, "a node word that is not the trusted execPath");
    // Path spelling of the interpreter: `node.exe` is a direct name on win32 only.
    const bareExe = render(["node.exe", ...rest], (w) => `'${w}'`);
    assert.equal(admits(bareExe, { platform: "win32" }), true, "node.exe is admitted on win32");
    assert.equal(admits(bareExe, { platform: "linux" }), false, "node.exe is not a direct node name off win32");
    // Every other metacharacter stays refused on win32 too.
    for (const meta of ["$", "`", ";", "&", "|", "<", ">", "\n", "\r"]) {
      assert.equal(admits(`${single} ${meta} echo x`, win32), false, JSON.stringify(meta));
    }
    const mirrorBlanketRefusal = (command) => !/[\\$`;&|<>\r\n]/u.test(command); // scratch mirror of the former lane: any backslash refused
    assert.equal(mirrorBlanketRefusal(single), false, "RED: the former blanket backslash refusal can never admit this command");
  } finally { cleanup(item); }
});

// ---- P3 path spelling, mode bits, nlink ----------------------------------------------------------------------------
test("P3: Git-reported and Node-resolved spellings of one directory compare by physical identity (RED: string compare fails)", () => {
  const item = fixture();
  try {
    const gitSpelling = git(item.root, ["rev-parse", "--show-toplevel"]);
    assert.equal(gitReportedPathIsSamePhysicalPath(gitSpelling, item.root), true);
    assert.equal(gitReportedPathIsSamePhysicalPath(dirname(item.root), item.root), false, "another directory is not the same path");
    assert.equal(gitReportedPathIsSamePhysicalPath("", item.root), false);
    assert.equal(gitReportedPathIsSamePhysicalPath("relative/path", item.root), false);
    assert.equal(gitReportedPathIsSamePhysicalPath(join(item.root, "does-not-exist"), item.root), false, "fails closed on error");
    if (process.platform === "win32") {
      const forward = item.root.replaceAll("\\", "/");
      assert.notEqual(forward, item.root);
      const mirrorPreHotfix = (a, b) => a === b; // scratch mirror of the pre-hotfix string comparison
      assert.equal(mirrorPreHotfix(forward, item.root), false, "RED: the pre-hotfix comparison rejects the same directory");
      assert.equal(gitReportedPathIsSamePhysicalPath(forward, item.root), true, "GREEN: physical identity accepts it");
      assert.equal(gitReportedPathIsSamePhysicalPath(forward.toUpperCase(), item.root), true, "NTFS letter case is irrelevant");
    }
  } finally { cleanup(item); }
});

test("P3: the POSIX mode-bit privacy term applies only where the platform has mode bits (RED: unconditional test refuses win32)", () => {
  assert.equal(receiptModeBitsRefused(0o666, "win32"), false, "win32 reports 0o666 for every file");
  assert.equal(receiptModeBitsRefused(0o666, "linux"), true);
  assert.equal(receiptModeBitsRefused(0o644, "darwin"), true);
  assert.equal(receiptModeBitsRefused(0o600, "linux"), false);
  assert.equal(receiptModeBitsRefused("0600", "linux"), true, "non-integer mode fails closed off win32");
  const mirrorUngated = (mode) => !Number.isInteger(mode) || (mode & 0o077) !== 0; // scratch mirror of the pre-hotfix test
  assert.equal(mirrorUngated(0o666), true, "RED: the ungated test would refuse a win32 receipt");
});

test("P3: a receipt this module wrote itself is accepted on this host, and a second hard link is refused (nlink)", () => {
  const item = fixture();
  try {
    assert.equal(prepareCommittedQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).ok, true);
    const receipt = item.receiptPath();
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-VERIFIED");
    const extra = `${receipt}.hardlink`;
    linkSync(receipt, extra);
    assert.equal(lstatSync(receipt).nlink, 2);
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-ABSENT", "nlink 2 receipt is not trusted");
    assert.equal(verifyQualityPackageIntegrationPreCommit({ repoRoot: item.root, intentSha256: item.record.intentSha256 }).code, "QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID", "pre-commit backstop refuses it too");
    rmSync(extra);
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-VERIFIED", "single link trusted again");
  } finally { cleanup(item); }
});

test("P3 host limitation: a POSIX receipt with group/other bits is refused by the verifier",
  { skip: process.platform === "win32" && "host-limitation: directory/file mode bits unavailable on native Windows; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)" }, () => {
    const item = fixture();
    try {
      assert.equal(prepareCommittedQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).ok, true);
      chmodSync(item.receiptPath(), 0o644);
      assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-ABSENT");
    } finally { cleanup(item); }
  });

test("P3: committed-policy authority works end to end with Git-reported paths on this host (apply and authorize)", () => {
  const item = fixture();
  try {
    assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-VERIFIED");
    assert.equal(applyCommittedQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: { ...item.proof, keyReference: "unknown-key" } }).code, "QUALITY-PACKAGE-COMMITTED-POLICY-INVALID");
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-INDEX-MISMATCH", "nothing staged yet");
  } finally { cleanup(item); }
});

// ---- P4 one command ------------------------------------------------------------------------------------------------
test("P4: prepare-commit performs apply, stage and authorize in order and reports one typed result", () => {
  const item = fixture();
  try {
    const result = prepareCommittedQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof });
    assert.deepEqual({ ...result }, { ok: true, code: "QUALITY-PACKAGE-COMMIT-PREPARED", intentSha256: item.record.intentSha256, stage: "authorized", effects: "applied-and-staged", commitPerformed: false });
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "after\n");
    assert.equal(git(item.root, ["diff", "--cached", "--name-only"]), "subject.txt");
    assert.equal(git(item.root, ["rev-parse", "HEAD"]), item.record.baseCommit, "never commits");
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-VERIFIED");
  } finally { cleanup(item); }
});

test("P4: a refusal is typed by the stage that failed and leaves no authorization", () => {
  const item = fixture();
  try {
    const result = prepareCommittedQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: { ...item.proof, signatureBase64: Buffer.alloc(64).toString("base64") } });
    assert.equal(result.ok, false);
    assert.equal(result.stage, "apply");
    assert.equal(result.effects, "inspect-required");
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "before\n", "nothing applied on a bad proof");
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).ok, false);
  } finally { cleanup(item); }
});

test("P4: the real materializer CLI runs prepare-commit as one agent command and prints one typed JSON result", () => {
  const item = fixture();
  try {
    const run = spawnSync(process.execPath, [MATERIALIZER, item.root, item.intentPath, item.proofPath, item.policyPath, "prepare-commit"], { cwd: item.root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout.trim());
    assert.equal(out.code, "QUALITY-PACKAGE-COMMIT-PREPARED");
    assert.equal(out.stage, "authorized");
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-VERIFIED");
  } finally { cleanup(item); }
});

// ---- P5 pre-commit backstop ----------------------------------------------------------------------------------------
test("P5: a verified package is recognised pre-commit and post-commit without any --no-verify import", () => {
  const item = fixture();
  try {
    assert.equal(verifyQualityPackageIntegrationPreCommit({ repoRoot: item.root, intentSha256: item.record.intentSha256 }).ok, false, "nothing authorized yet");
    assert.equal(prepareCommittedQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).ok, true);
    const pre = verifyQualityPackageIntegrationPreCommit({ repoRoot: item.root, intentSha256: item.record.intentSha256 });
    assert.equal(pre.code, "QUALITY-PACKAGE-INTEGRATION-PRECOMMIT-VERIFIED");
    assert.equal(verifyQualityPackageIntegrationPreCommit({ repoRoot: item.root, intentSha256: sha("other") }).ok, false, "a different digest is not authorized");
    writeFileSync(join(item.root, "extra.txt"), "extra\n");
    git(item.root, ["add", "extra.txt"]);
    assert.equal(verifyQualityPackageIntegrationPreCommit({ repoRoot: item.root, intentSha256: item.record.intentSha256 }).code, "QUALITY-PACKAGE-INTEGRATION-INDEX-MISMATCH", "extra staged path voids the backstop");
    git(item.root, ["restore", "--staged", "--", "extra.txt"]);
    rmSync(join(item.root, "extra.txt"));
    git(item.root, ["commit", "-qm", "quality package import"]);
    const post = verifyQualityPackageIntegrationPostCommit({ repoRoot: item.root, commitSha: git(item.root, ["rev-parse", "HEAD"]), intentSha256: item.record.intentSha256 });
    assert.equal(post.code, "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED");
  } finally { cleanup(item); }
});

test("P5: the commit-msg hook installer and guard-git both call the pre-commit package verifier", () => {
  for (const rel of [join("scripts", "commit-msg-hook-install.mjs"), join("hooks", "guard-git.mjs")]) {
    assert.match(readFileSync(join(PLUGIN_ROOT, rel), "utf8"), /verifyQualityPackageIntegrationPreCommit\(\{ repoRoot/u, rel);
  }
});
