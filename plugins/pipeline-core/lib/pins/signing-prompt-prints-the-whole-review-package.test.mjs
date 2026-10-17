// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.signing-prompt-prints-the-whole-review-package (AC-261).
 * Acceptance points pinned through the real exported functions of
 * scripts/po-human-approval.mjs (compactSigningDisclosure, formatHumanApprovalCliResult):
 *  P1 compact, fixed-shape confirmation block (bounded lines, digest present)
 *  P2 full review material is referenced by path + sha256, never printed inline
 *  P3 hostile / multi-line free text cannot widen the block
 *  P4 post-sign output is one short line (status + proof path)
 *  P5 dispatch on the request schema to exactly one describer and an immediate
 *     progress line (structural pin on the source; the end-to-end sign-intent
 *     route is exercised by P7 below)
 *  P7 the real sign-intent route, run against a contained git-initialised fixture
 *     repository, prints only the compact disclosure for a 4000-line review record
 * RED mirrors below prove the assertions can fail.
 */
import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { GIT_NULL_DEVICE } from "../git-null-device.mjs";
import { compactSigningDisclosure, formatHumanApprovalCliResult, runHumanApproval } from "../../scripts/po-human-approval.mjs";

/**
 * Fixture placement (ALF-C-W2-03D). On native Windows the OS temporary root's DACL grants other principals
 * mutation rights, which the owned-authority ancestor inspection (run when the ceremony opens its private
 * state under the fixture repository's .git) refuses as WIN-AUTH-ANCESTOR-MUTATION; production assurance is
 * untouched and the fixtures move instead. The fixture repository and the key directory live under ONE
 * per-process subdirectory of this repository's gitignored scratch/ tree, removed in the after hook (and on
 * an abnormal exit). The fixture HOME is the one exception: the readiness probe takes its working directory
 * from the home and refuses one with a `.git` ancestor (outsideEveryRepository), and this repository's own
 * scratch/ sits inside its checkout, so the home stays in the OS temporary directory (outside every
 * repository). GIT_CEILING_DIRECTORIES is pinned to the per-process root for this whole process, so no git
 * process started from a fixture directory can ascend to this project's own checkout.
 */
const FIXTURE_SCRATCH_ROOT = join(fileURLToPath(new URL("../../../../scratch/", import.meta.url)), `pin-signing-prompt-fixtures-${process.pid}`);
mkdirSync(FIXTURE_SCRATCH_ROOT, { recursive: true });
process.env.GIT_CEILING_DIRECTORIES = realpathSync(FIXTURE_SCRATCH_ROOT);
function fixtureTemp(prefix) {
  mkdirSync(FIXTURE_SCRATCH_ROOT, { recursive: true });
  return mkdtempSync(join(FIXTURE_SCRATCH_ROOT, prefix));
}
function removeFixtureScratchRoot() {
  try { rmSync(FIXTURE_SCRATCH_ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* best effort: the root is gitignored and per-process */ }
}
after(removeFixtureScratchRoot);
process.on("exit", removeFixtureScratchRoot);

/**
 * P7 fixture (ALF-C-W2-03C): executeHumanApproval opens sign-intent with the signed-descriptor custody
 * inspection (worktree-lifecycle discoverRepository), which demands a REAL physical primary Git checkout
 * with a HEAD. The fixture repoRoot is therefore `git init` plus one fixture commit, and the custody
 * check itself runs unmodified. Containment: every git call pins GIT_CEILING_DIRECTORIES to the absolute
 * parent of the fixture root (no enclosing repository, such as this project's own checkout, is ever
 * discovered), uses an allowlisted environment with no inherited GIT_* variable, no global/system
 * config and no hooks, and the root is proven to be its own top level BEFORE the single commit.
 */
function fixtureGit(repoRoot, args) {
  const root = realpathSync(repoRoot);
  const env = {
    GIT_CEILING_DIRECTORIES: dirname(root),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Fixture Identity", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture Identity", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
  for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TMP", "TEMP", "TMPDIR", "LANG"]) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  const result = spawnSync("git", ["-c", `core.hooksPath=${GIT_NULL_DEVICE}`, "-c", "commit.gpgSign=false", "-C", root, ...args],
    { encoding: "utf8", env, shell: false, stdio: ["ignore", "pipe", "pipe"], timeout: 30000 });
  if (result.error || result.status !== 0) {
    throw new Error(`fixture git ${args[0]} failed (${result.status ?? result.error?.code}): ${String(result.stderr ?? "").trim().slice(0, 300)}`);
  }
  return String(result.stdout).trim();
}
function initFixtureGitRepository(repoRoot) {
  const root = realpathSync(repoRoot);
  fixtureGit(root, ["init", "-q"]);
  const fold = (path) => (process.platform === "win32" ? path.toLowerCase() : path);
  if (fold(realpathSync(fixtureGit(root, ["rev-parse", "--show-toplevel"]))) !== fold(root)) throw new Error("fixture git root is not its own top level");
  fixtureGit(root, ["commit", "-q", "--allow-empty", "--no-verify", "-m", "fixture: initial commit"]);
  return repoRoot;
}

const SCRIPT = fileURLToPath(new URL("../../scripts/po-human-approval.mjs", import.meta.url));
const INTENT = "a".repeat(64);
const MATERIAL = { path: "scratch/review-" + INTENT + "-" + "b".repeat(64) + ".json", sha256: "b".repeat(64) };
const bigRecord = () => ({ resolved: true, lines: Array.from({ length: 4000 }, (_, i) => `line ${i}: ${"x".repeat(2000)}`) });

test("P1: a 4000-line, multi-megabyte review record renders as a bounded block carrying the intent digest", () => {
  const lines = compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord(), materialArtifact: MATERIAL });
  assert.ok(lines.length <= 25, `rendered ${lines.length} lines`);
  assert.equal(lines[0], `intent sha256: ${INTENT}`);
  assert.ok(Buffer.byteLength(lines.join("\n")) < 8 * 1024, "block stays far below the ~100 KB dump");
  for (const line of lines) assert.ok(line.length <= 300, "every line is bounded");
});

test("P2: the full material is referenced by path and sha256 and the omission is stated", () => {
  const lines = compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord(), materialArtifact: MATERIAL });
  assert.ok(lines.includes("full review material: " + JSON.stringify(MATERIAL.path)));
  assert.ok(lines.includes("full review material sha256: " + MATERIAL.sha256));
  assert.ok(lines.some((l) => /additional validated review material is retained at the bound artifact/u.test(l)));
  assert.ok(!lines.some((l) => l.includes("line 3999")), "omitted lines are not printed");
  assert.throws(() => compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord(), materialArtifact: { path: MATERIAL.path, sha256: "zz" } }), /PO-SIGN-DISCLOSURE-MATERIAL/u);
  assert.throws(() => compactSigningDisclosure({ intentSha256: "nope", record: bigRecord() }), /PO-SIGN-DISCLOSURE-DIGEST/u);
  const withoutArtifact = compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord() });
  assert.ok(withoutArtifact.some((l) => /full review material is unavailable/u.test(l)), "no silent truncation without an artifact");
});

test("P3: control characters and embedded newlines cannot add lines to the block", () => {
  const record = { resolved: true, lines: ["ok\u001b[2J fact", "multi\nline smuggle", "tab\tand\u0007bell"] };
  const lines = compactSigningDisclosure({ intentSha256: INTENT, record, materialArtifact: MATERIAL });
  for (const line of lines) assert.doesNotMatch(line, /[\u0000-\u001f\u007f]/u);
  assert.ok(!lines.some((l) => l.includes("smuggle")), "a multi-line entry is dropped, not split");
  const unresolved = compactSigningDisclosure({ intentSha256: INTENT, record: { resolved: false, lines: [] } });
  assert.ok(unresolved.some((l) => /purpose unavailable/u.test(l)));
});

test("P4: the post-sign result for a human is exactly one short line; machine callers keep the full result", () => {
  const result = { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", intentSha256: INTENT, signer: { keyReference: "k", publicKey: "p".repeat(500) },
    paths: { proof: "/x/proof.json", signer: "/x/signer.json", scratchProofPath: "/r/p.json", scratchSignerPath: "/r/s.json" } };
  const human = formatHumanApprovalCliResult(result, { humanFacing: true });
  assert.equal(human.trimEnd().split("\n").length, 1);
  assert.deepEqual(JSON.parse(human), { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", proofPath: "/x/proof.json" });
  assert.ok(human.length < 200);
  assert.ok(formatHumanApprovalCliResult(result, { humanFacing: false }).split("\n").length > 5);
});

test("P5 (structural): sign-intent prints a progress line first, dispatches one describer per request schema and binds the review file digest", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const at = (needle) => { const i = src.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  assert.ok(at('progress("Preparing signing request...\\n")') < at("const requestSchema = scratchRequestRecord?.schema"));
  assert.ok(at("switch (requestSchema)") < at("publishSigningReviewMaterial(repository, portableRequestPath"));
  assert.ok(src.includes("const sha256 = designSigningHash(bytes);") && src.includes("review-${intentSha256}-${sha256}.json"), "file name embeds the digest of the written bytes");
  assert.ok(src.includes("actual.sha256 !== sha256 || !actual.bytes.equals(bytes)"), "readback proves digest equals written bytes");
  assert.ok(src.includes("materialArtifact.sha256) fail(\"PO-SIGN-REVIEW-DRIFT\")"), "digest re-checked before signing");
});

function healthyOpensslStub(executable, args) {
  const a = args.map(String);
  const flag = (name) => { const i = a.indexOf(name); return i >= 0 ? a[i + 1] : undefined; };
  if (a[0] === "pkeyutl" && a.includes("-sign")) {
    writeFileSync(flag("-out"), cryptoSign(null, readFileSync(flag("-in")), createPrivateKey(readFileSync(flag("-inkey")))));
    return { status: 0, stdout: "", stderr: "" };
  }
  if (a[0] === "pkeyutl" && a.includes("-verify")) {
    const ok = cryptoVerify(null, readFileSync(flag("-in")), createPublicKey(readFileSync(flag("-inkey"))), readFileSync(flag("-sigfile")));
    return { status: ok ? 0 : 1, stdout: ok ? "Signature Verified Successfully\n" : "", stderr: "" };
  }
  if (a[0] === "genpkey") {
    writeFileSync(flag("-out"), generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }));
    return { status: 0, stdout: "", stderr: "" };
  }
  if (a[0] === "pkey" && a.includes("-pubout")) {
    writeFileSync(flag("-out"), createPublicKey(createPrivateKey(readFileSync(flag("-in"), "utf8"))).export({ type: "spki", format: "pem" }));
    return { status: 0, stdout: "", stderr: "" };
  }
  return { status: 0, stdout: "OpenSSL 3.0.0 (pin stub)\n", stderr: "" };
}

test("P7 (behavioural): the real sign-intent route prints only the compact disclosure for a 4000-line review record", () => {
  const passphrase = "pin-fixture-passphrase";
  const repoRoot = initFixtureGitRepository(fixtureTemp("pin-sign-repo-"));
  const directory = fixtureTemp("pin-sign-key-");
  const home = mkdtempSync(join(tmpdir(), "pin-sign-home-")); // outside every repository: the probe's working directory
  const realWrite = process.stdout.write;
  try {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase }, publicKeyEncoding: { type: "spki", format: "pem" } });
    writeFileSync(join(directory, "po-private.pem"), privateKey);
    writeFileSync(join(directory, "po-public.pem"), publicKey);
    const authority = { keyReference: "pin-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
    writeFileSync(join(directory, "trust-policy.json"), JSON.stringify({ ...authority, humanName: "Pin Operator" }));
    mkdirSync(join(repoRoot, "project"), { recursive: true });
    writeFileSync(join(repoRoot, "project/critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["governance-fork-disposition"], waivedKinds: [], trustAnchors: [authority] }));
    const spawn = (executable, args = []) => {
      const a = args.map(String);
      if (executable === "openssl" && a[0] === "pkeyutl" && a.includes("-sign") && a.some((e) => /po-private\.pem/u.test(e))) {
        writeFileSync(a[a.indexOf("-out") + 1], cryptoSign(null, readFileSync(a[a.indexOf("-in") + 1]), createPrivateKey({ key: privateKey, format: "pem", passphrase })));
        return { status: 0 };
      }
      return healthyOpensslStub(executable, a);
    };
    let captured = "";
    process.stdout.write = (chunk, ...rest) => { captured += chunk; return true; };
    let result;
    try {
      result = runHumanApproval(["sign-intent", "--repo-root", repoRoot, "--directory", directory, "--intent-sha256", INTENT], {
        spawn, isTTY: true, homedirFn: () => home,
        readConfirmation: () => { throw new Error("encrypted key: no typed confirmation expected"); },
        describeIntentRecord: () => ({ ...bigRecord(), materialArtifact: MATERIAL }),
      });
    } finally { process.stdout.write = realWrite; }
    assert.equal(result.ok, true);
    assert.ok(Buffer.byteLength(captured) < 8 * 1024, `operator output is ${Buffer.byteLength(captured)} bytes`);
    assert.ok(captured.includes(INTENT), "digest-bound summary");
    assert.ok(captured.includes(MATERIAL.path) && captured.includes(MATERIAL.sha256), "path to the full package");
    assert.ok(!captured.includes("line 3999") && !captured.includes("line 100:"), "the whole review package is not printed inline");
  } finally {
    process.stdout.write = realWrite;
    for (const d of [repoRoot, directory, home]) rmSync(d, { recursive: true, force: true });
  }
});

test("P8: push/critical-action approve and the generic signing command share compactSigningDisclosure", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const approve = src.slice(src.indexOf('if (args.command === "approve" || args.command === "approve-critical")'));
  assert.ok(approve.slice(0, 1500).includes("compactSigningDisclosure({ intentSha256"), "approve/approve-critical route its summary through the compact disclosure");
  const hgo = src.slice(src.indexOf('case "pipeline.human-guard-override-signature-digest.v1"'));
  // The bound is the passphrase/confirmation step, not a fixed character count, so the HGO request must reach the shared compact disclosure before any signing step (ALF-C-SIGN-ORDER5).
  const signOnce = hgo.indexOf("NVA-SIGNONCE-1");
  assert.ok(signOnce > 0, "the passphrase/confirmation step follows the HGO case");
  assert.ok(hgo.slice(0, signOnce).includes("compactSigningDisclosure({ intentSha256, record, materialArtifact })"),"the human-guard-override signing request is rendered by sign-intent through the same compact disclosure");
});

test("P6 (host limitation): directory-mode / symlink custody cases of the review file", { skip: "host-limitation: Windows has no directory mode bits or directory symlinks; owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)" }, () => {});

test("RED mirror: an uncapped renderer fails the P1 bound, so the pin can fail", () => {
  const uncapped = ({ intentSha256, record }) => [`intent sha256: ${intentSha256}`, ...record.lines];
  assert.ok(uncapped({ intentSha256: INTENT, record: bigRecord() }).length > 25);
  const naiveHuman = (r) => JSON.stringify(r, null, 2) + "\n";
  assert.ok(naiveHuman({ ok: true, paths: { a: 1, b: 2 }, signer: {} }).split("\n").length > 1);
});
