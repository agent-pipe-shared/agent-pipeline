// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.signature-ceremony-requires-operator-work-and-breaks (AC-258).
 * Item: backlog/items/2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md
 *
 * Cases tagged "RED:" assert the item's INTENDED behaviour and are expected to
 * FAIL while the named source gap exists. Fixtures live under scratch/ (native
 * Windows host rule), never the OS temp dir. No passphrase exists and no key is
 * persisted: the commit-scoped override-course cases at the end of this file sign
 * their own fixture request with an in-memory ephemeral Ed25519 pair, generated per
 * run and never written to disk.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test, { after, before, describe } from "node:test";

import { main } from "../../scripts/guard-human-override.mjs";
import { recordHumanGuardDenial } from "../human-guard-override.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..", "..");
const REPO_ROOT = join(PLUGIN_ROOT, "..", "..");
const FIXTURES = join(REPO_ROOT, "scratch", "ac258-pin-fixtures");
const DUMMY_ANCHOR = "0".repeat(64); // dummy digest, not a real key

function git(root, ...args) {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(r.status, 0, r.stderr);
}

function fixture({ born }) {
  mkdirSync(FIXTURES, { recursive: true });
  const root = mkdtempSync(join(FIXTURES, born ? "born-" : "unborn-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: "ac258-dummy", publicKeySha256: DUMMY_ANCHOR },
  }));
  if (born) {
    git(root, "commit", "-q", "--allow-empty", "-m", "initial");
    git(root, "add", "pipeline.user.yaml", "project/critical-human-proof.json");
    git(root, "commit", "-q", "-m", "fixture");
  }
  return root;
}

function io() {
  let stdout = "";
  let stderr = "";
  return {
    write: (c) => { stdout += c; return true; },
    writeError: (c) => { stderr += c; return true; },
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

function prepare(root) {
  const recorded = recordHumanGuardDenial({
    rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
    toolInput: { file_path: "notes.md", content: "ac258\n" },
    denials: [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }],
  });
  assert.equal(recorded.status, "planned");
  const out = io();
  const status = main(["prepare-for-signature", "--repo", root, "--request-sha256", recorded.requestSha256], out);
  return { status, out };
}

test("signature preparation works in an unborn-HEAD repository (AC-258; formerly HGO-SIGNATURE-INTENT-INVALID)", () => {
  const root = fixture({ born: false });
  try {
    const { status, out } = prepare(root);
    assert.equal(status, 0, `unborn HEAD must not break prepare-for-signature: ${out.stderr}`);
    assert.equal(JSON.parse(out.stdout).status, "prepared");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the agent prepares: one call yields both commands; only sign-intent is the human's external step", () => {
  const root = fixture({ born: true });
  try {
    const { status, out } = prepare(root);
    assert.equal(status, 0, out.stderr);
    const v = JSON.parse(out.stdout);
    assert.equal(v.status, "prepared");
    assert.equal(v.signIntentCommand.executionBoundary, "attended-external-terminal");
    assert.equal(v.signIntentCommand.mutation, false);
    // proof import is an agent-side local-process command, not human copy-back
    assert.equal(v.authorizeBySignatureCommand.executionBoundary, "local-process");
    assert.ok(v.authorizeBySignatureCommand.argv.includes("--proof"));
    assert.doesNotMatch(out.stdout, /Step:|POSIX:|PowerShell:/u, "stdout stays machine-readable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("signing command handed to the human is paste-safe for PowerShell and Bash: bounded lines, no continuation", () => {
  const root = fixture({ born: true });
  try {
    const { status, out } = prepare(root);
    assert.equal(status, 0, out.stderr);
    const lines = out.stderr.trimEnd().split(/\r?\n/u);
    assert.ok(lines.every((l) => l.length <= 72), "every line within the 72-column bound");
    assert.match(out.stderr, /POSIX:/u);
    assert.match(out.stderr, /PowerShell:/u);
    const offenders = lines.filter((l) => /\\$/u.test(l) || /`$/u.test(l));
    assert.deepEqual(offenders, [], "no backslash/backtick line continuation (the 2026-10-03 WSL paste failure)");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("RED: a commit refused by the git pre-commit hook seeds a human-override request and prints a signing command", () => {
  // Source of the gap: the generated hook impl in
  // plugins/pipeline-core/scripts/pre-commit-hook-install.mjs (renderImpl template; the
  // block([...]) at the "staged path(s) are protected" finding, ~line 869) only
  // prints text. A commit-scoped request bound to the staged index tree would have to be
  // seeded there via recordHumanGuardDenial().
  const src = readFileSync(join(PLUGIN_ROOT, "scripts", "pre-commit-hook-install.mjs"), "utf8");
  assert.match(src, /recordHumanGuardDenial/u);
});

// ---------------------------------------------------------------------------------------------
// PO-SIGNED CONFIGURATION OVERRIDE (last open clause of the item, PO decision 2026-10-17): the
// item offers two ways to close "override cancelled by the system it unblocks" -- the override
// becomes a durable layer later migrations respect, OR the override route is refused up front
// with the real alternative. The PO chose the second. So a signed override of pipeline.user.yaml
// must never be OFFERED: the denial is recorded as a typed refusal, no signing request is
// seeded, and the human is told the real alternative (a human edit committed to the repository)
// instead of burning a signature on a write the lifecycle later rewrites back.
//
// The refusal belongs where an override is first accepted: eligibility() in
// plugins/pipeline-core/lib/human-guard-override.mjs, which today classes pipeline.user.yaml as
// "writer-owned-project-policy-emergency" (eligible). That file is protected, so the fix is the
// signature-bound patch scratch/patches/ALF-C-AC258-REF.patch; the first case below is RED on the
// live tree until that patch lands, and the second proves the patch on a scratch mirror.
// ---------------------------------------------------------------------------------------------
const USER_CONFIG_REFUSAL_CODE = "HGO-NARROWER-USER-CONFIG-REFUSED";
const AC258_PROTECTED_PATCH = join(REPO_ROOT, "scratch", "patches", "ALF-C-AC258-REF.patch");
const USER_CONFIG_CASE_TIMEOUT_MS = 600_000; // own constant: the shared CASE_TIMEOUT_MS below is still in its TDZ when these cases register

/** Own `git init`, GIT_CEILING_DIRECTORIES on every git call, a born HEAD and an edited-routing yaml. */
function buildUserConfigFixture() {
  mkdirSync(FIXTURES, { recursive: true });
  const root = mkdtempSync(join(FIXTURES, "userconfig-"));
  fxMust(fxGit(root, ["init", "-q", "-b", "main"]), "git init");
  fxMust(fxGit(root, ["config", "user.name", "Fixture"]), "git config user.name");
  fxMust(fxGit(root, ["config", "user.email", "fixture@example.invalid"]), "git config user.email");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  fxMust(fxGit(root, ["add", "pipeline.user.yaml"]), "stage seed");
  fxMust(fxGit(root, ["commit", "-q", "-m", "seed"]), "commit seed");
  return root;
}

async function assertUserConfigOverrideRefusedUpFront(pluginRoot) {
  const hgo = await import(pathToFileURL(join(pluginRoot, "lib", "human-guard-override.mjs")).href);
  const root = buildUserConfigFixture();
  try {
    const edited = 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\nmodel_routes:\n  goldfish: "edited"\n';
    const writeInput = { file_path: "pipeline.user.yaml", content: edited };

    // Control: other protected configuration keeps its existing eligible class, so the refusal
    // below is specific to pipeline.user.yaml and not a blanket change of the override planner.
    const control = hgo.previewHumanGuardRecovery({ rootDir: root, pluginRoot, toolName: "Write", toolInput: { file_path: ".claude/settings.json", content: "{}\n" } });
    assert.equal(control, null, "control: a different protected configuration path must stay eligible for a signed override");

    const attempts = [
      ["Write", writeInput],
      ["Edit", { file_path: "pipeline.user.yaml", old_string: 'push_approval: "signature"', new_string: 'push_approval: "chat"' }],
      ["apply_patch", { command: '*** Begin Patch\n*** Update File: pipeline.user.yaml\n@@\n-  push_approval: "signature"\n+  push_approval: "chat"\n*** End Patch\n' }],
    ];
    for (const [toolName, toolInput] of attempts) {
      const route = hgo.previewHumanGuardRecovery({ rootDir: root, pluginRoot, toolName, toolInput });
      assert.notEqual(route, null, `${toolName} of pipeline.user.yaml is still eligible for a PO-signed override (no up-front refusal)`);
      assert.equal(route.status, "narrower-recovery-required", `${toolName}: ${JSON.stringify(route).slice(0, 300)}`);
      assert.equal(route.code, USER_CONFIG_REFUSAL_CODE, `${toolName}: the typed refusal code`);
      assert.match(route.nextAction.action.requiredChange, /human edit committed to the repository/u, `${toolName}: the real alternative is named`);
      assert.match(route.nextAction.limitation, /stale projection/u, `${toolName}: the reason is named`);
    }

    // The recorded denial (what a session actually triggers) is the same typed refusal and seeds
    // nothing: no request, hence nothing for the human to sign.
    const recorded = hgo.recordHumanGuardDenial({
      rootDir: root, pluginRoot, toolName: "Write", toolInput: writeInput,
      denials: [{ guard: "guard-gate-strength.mjs", reason: "GS-1: fixture" }],
    });
    assert.equal(recorded.status, "narrower-recovery-required", `a PO-signed override must not be planned: ${JSON.stringify(recorded).slice(0, 300)}`);
    assert.equal(recorded.code, USER_CONFIG_REFUSAL_CODE);
    assert.equal(recorded.requestSha256, undefined, "no signable request exists");
    const commonDir = fxMust(fxGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "git-common-dir");
    assert.deepEqual(jsonFiles(join(commonDir, "agent-pipeline", "human-guard-overrides", "requests")), [], "nothing was seeded for the human to sign");
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
}

test("RED: [needs protected patch ALF-C-AC258-REF] a PO-signed pipeline.user.yaml override is refused up front with a typed reason, not left to later migrations", { timeout: USER_CONFIG_CASE_TIMEOUT_MS }, async () => {
  await assertUserConfigOverrideRefusedUpFront(PLUGIN_ROOT);
});

test("mirror proof: the staged protected patch ALF-C-AC258-REF yields the up-front typed refusal on a scratch copy of the plugin", {
  timeout: USER_CONFIG_CASE_TIMEOUT_MS,
  skip: existsSync(AC258_PROTECTED_PATCH) ? false : "the protected patch is not staged under scratch/patches (nothing to prove)",
}, async () => {
  mkdirSync(FIXTURES, { recursive: true });
  const mirror = mkdtempSync(join(FIXTURES, "mirror-"));
  try {
    const pluginCopy = join(mirror, "plugins", "pipeline-core");
    cpSync(PLUGIN_ROOT, pluginCopy, { recursive: true });
    // The ceiling is the mirror's parent, so this is never resolved against the project repository.
    const apply = (args) => spawnSync("git", ["apply", ...args, AC258_PROTECTED_PATCH], {
      cwd: mirror, encoding: "utf8", shell: false, env: { ...process.env, GIT_CEILING_DIRECTORIES: FIXTURES },
    });
    const applied = apply([]);
    if (applied.status !== 0) {
      // Once the patch has landed in the live tree it no longer applies forward; then it must apply in reverse.
      const reverse = apply(["--reverse", "--check"]);
      assert.equal(reverse.status, 0, `patch neither applies nor is already present: ${applied.stderr} | ${reverse.stderr}`);
    }
    await assertUserConfigOverrideRefusedUpFront(pluginCopy);
  } finally { rmSync(mirror, { recursive: true, force: true, maxRetries: 3 }); }
});

// ---------------------------------------------------------------------------------------------
// UNBORN-HEAD SIGNATURE CEREMONY ON A MIRROR OF THE LIVE PLUGIN (acceptance clause "Signing works
// in an unborn-HEAD repository"; ALF-C-AC258-UNBORN2). The protected fix (commit 29df88cad,
// plugins/pipeline-core/lib/human-guard-override.mjs) has landed, so these cases run
// unconditionally: no patch file is needed or applied. Root cause it fixed: createPoApprovalIntent()
// rejects a null commit, so the unborn
// observation (`head: null`, tree === the empty-tree oid) is bound into the signed intent as the
// all-zero commit sentinel with a separate "-unborn" policy revision, and the same mapping is
// compared at arm time. The cases below run on a scratch COPY of the live plugin (fixture
// isolation) and pin the ceremony around the first commit:
//   (U1)  unborn prepare-for-signature returns status 0 and "prepared"
//   (U1b) a born repository still prepares on the same mirror                 [control]
//   (U2)  an intent prepared and signed while unborn is refused, typed, after the first commit
//   (U3a) arming while still unborn works and consuming while still unborn is admitted [control]
//   (U3b) arm unborn, first commit, consume -> replan HGO-DRIFT, capability never spent
// Every fixture git call carries GIT_CEILING_DIRECTORIES (the fixtures' parent) and every fixture
// runs its own `git init` first. The signing key is an in-memory ephemeral Ed25519 pair whose
// public digest is the fixture's committed-style trust anchor, exactly as in the course cases below.
// ---------------------------------------------------------------------------------------------
const UNBORN_CASE_TIMEOUT_MS = 600_000; // own constant: the shared CASE_TIMEOUT_MS below is still in its TDZ when these cases register
const UNBORN_KEY_REFERENCE = "ac258-unborn-fixture-key";
const UNBORN_DRIFT_CODES = ["HGO-CANDIDATE-DRIFT", "HGO-DRIFT"];
const UNBORN_DENIALS = [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }];
const UNBORN_TOOL_INPUT = { file_path: "notes.md", content: "ac258\n" };
const unbornCourse = { cleanup: [] };

function ubGit(dir, args) {
  return spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: dir, encoding: "utf8", shell: false, timeout: 240_000,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: FIXTURES },
  });
}

function ubIsUnborn(root) {
  return ubGit(root, ["rev-parse", "--verify", "-q", "HEAD"]).status !== 0;
}

/** Own `git init` under scratch/, an UNBORN branch, a signature-mode yaml and the ephemeral key's anchor. */
function ubFixture() {
  mkdirSync(FIXTURES, { recursive: true });
  const root = mkdtempSync(join(FIXTURES, "unborn-sign-"));
  unbornCourse.cleanup.push(root);
  fxMust(ubGit(root, ["init", "-q", "-b", "main"]), "git init");
  fxMust(ubGit(root, ["config", "user.name", "Fixture"]), "git config user.name");
  fxMust(ubGit(root, ["config", "user.email", "fixture@example.invalid"]), "git config user.email");
  const normalise = (p) => realpathSync(p).replace(/\\/gu, "/").toLowerCase();
  assert.equal(normalise(fxMust(ubGit(root, ["rev-parse", "--show-toplevel"]), "show-toplevel")), normalise(root), "containment: the fixture must be its own repository root");
  assert.ok(ubIsUnborn(root), "the fixture starts with an unborn HEAD");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: UNBORN_KEY_REFERENCE, publicKeySha256: createHash("sha256").update(unbornCourse.publicKeyPem).digest("hex") },
  }));
  return root;
}

/** The first commit: one unrelated file, so the staged anchor/yaml bytes stay exactly as prepared. */
function ubFirstCommit(root) {
  writeFileSync(join(root, "README.md"), "first commit\n");
  fxMust(ubGit(root, ["add", "--", "README.md"]), "stage README.md");
  fxMust(ubGit(root, ["commit", "-q", "-m", "first commit"]), "first commit");
  assert.ok(!ubIsUnborn(root), "the first commit was made: HEAD is born");
}

function ubPrepare(root) {
  const recorded = unbornCourse.hgo.recordHumanGuardDenial({
    rootDir: root, pluginRoot: unbornCourse.pluginCopy, toolName: "Write", toolInput: UNBORN_TOOL_INPUT, denials: UNBORN_DENIALS,
  });
  assert.equal(recorded.status, "planned", JSON.stringify(recorded).slice(0, 400));
  const out = io();
  const status = unbornCourse.cli.main(["prepare-for-signature", "--repo", root, "--request-sha256", recorded.requestSha256], out);
  return { status, out };
}

function ubPrepared(root) {
  const { status, out } = ubPrepare(root);
  assert.equal(status, 0, `prepare-for-signature: ${out.stderr}`);
  const prepared = JSON.parse(out.stdout);
  assert.equal(prepared.status, "prepared");
  return prepared;
}

function ubArm(root, prepared) {
  const proof = {
    schema: unbornCourse.proofSchema,
    intentSha256: prepared.intentSha256,
    keyReference: UNBORN_KEY_REFERENCE,
    publicKey: unbornCourse.publicKeyPem,
    signatureBase64: sign(null, Buffer.from(prepared.intentSha256, "utf8"), unbornCourse.keyPair.privateKey).toString("base64"),
  };
  return unbornCourse.hgo.authorizeHumanGuardOverrideBySignature({
    rootDir: root,
    pluginRoot: unbornCourse.pluginCopy,
    requestSha256: prepared.requestSha256,
    planSha256: prepared.planSha256,
    proof,
    scriptPath: join(unbornCourse.pluginCopy, "scripts", "guard-human-override.mjs"),
  });
}

function ubConsume(root) {
  return unbornCourse.hgo.consumeHumanGuardOverride({
    rootDir: root, pluginRoot: unbornCourse.pluginCopy, toolName: "Write", toolInput: UNBORN_TOOL_INPUT, denials: UNBORN_DENIALS,
  });
}

function ubStore(root) {
  const commonDir = fxMust(ubGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "git-common-dir");
  const base = join(commonDir, "agent-pipeline", "human-guard-overrides");
  return { capabilities: join(base, "capabilities"), audit: join(base, "audit.jsonl") };
}

function ubAuditEvents(root) {
  try { return readFileSync(ubStore(root).audit, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line).event); } catch { return []; }
}

describe("unborn-HEAD signature ceremony on a scratch mirror of the live plugin (AC-258, ALF-C-AC258-UNBORN landed)", () => {
  before(async () => {
    unbornCourse.previousCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = FIXTURES; // the library spawns git with the inherited environment
    mkdirSync(FIXTURES, { recursive: true });
    const mirror = mkdtempSync(join(FIXTURES, "unborn-mirror-"));
    unbornCourse.cleanup.push(mirror);
    unbornCourse.pluginCopy = join(mirror, "plugins", "pipeline-core");
    cpSync(PLUGIN_ROOT, unbornCourse.pluginCopy, { recursive: true });
    // The fix has landed in the live module: the mirror is a plain copy of the live plugin, no patch is applied.
    assert.match(readFileSync(join(unbornCourse.pluginCopy, "lib", "human-guard-override.mjs"), "utf8"), /HGO_SIGNATURE_INTENT_POLICY_REVISION_UNBORN/u, "the mirror carries the unborn mapping");
    const load = (relative) => import(pathToFileURL(join(unbornCourse.pluginCopy, relative)).href);
    unbornCourse.hgo = await load("lib/human-guard-override.mjs");
    unbornCourse.cli = await load("scripts/guard-human-override.mjs");
    unbornCourse.proofSchema = (await load("lib/po-approval-proof.mjs")).PO_APPROVAL_PROOF_SCHEMA;
    unbornCourse.keyPair = generateKeyPairSync("ed25519");
    unbornCourse.publicKeyPem = unbornCourse.keyPair.publicKey.export({ type: "spki", format: "pem" });
  }, { timeout: UNBORN_CASE_TIMEOUT_MS });

  after(() => {
    if (unbornCourse.previousCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = unbornCourse.previousCeiling;
    for (const target of unbornCourse.cleanup) rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  }, { timeout: UNBORN_CASE_TIMEOUT_MS });

  test("(U1) unborn prepare-for-signature returns status 0 and 'prepared' with a signable intent on the live-plugin mirror", { timeout: UNBORN_CASE_TIMEOUT_MS }, () => {
    const root = ubFixture();
    const prepared = ubPrepared(root);
    assert.match(prepared.intentSha256, /^[a-f0-9]{64}$/u);
    assert.ok(prepared.signIntentCommand.argv.includes(prepared.intentSha256), "the human is handed the digest the agent computed");
    assert.equal(prepared.signIntentCommand.executionBoundary, "attended-external-terminal");
    assert.equal(prepared.authorizeBySignatureCommand.executionBoundary, "local-process");
    assert.ok(ubIsUnborn(root), "preparing must not create a commit");
  });

  test("(U1b) control: a born repository still prepares on the same live-plugin mirror", { timeout: UNBORN_CASE_TIMEOUT_MS }, () => {
    const root = ubFixture();
    ubFirstCommit(root);
    const prepared = ubPrepared(root);
    assert.match(prepared.intentSha256, /^[a-f0-9]{64}$/u);
  });

  test("(U2) an intent prepared and signed while unborn is refused with a typed drift code after the first commit", { timeout: UNBORN_CASE_TIMEOUT_MS }, () => {
    const root = ubFixture();
    const prepared = ubPrepared(root);
    ubFirstCommit(root);
    let refusal = null;
    try { ubArm(root, prepared); } catch (error) { refusal = error; }
    assert.ok(refusal, "authorize-by-signature must refuse once the first commit landed after signing");
    assert.ok(UNBORN_DRIFT_CODES.includes(refusal.code), `typed drift refusal expected, got ${refusal.code}: ${refusal.message}`);
    assert.deepEqual(jsonFiles(ubStore(root).capabilities), [], "nothing was armed");
  });

  test("(U3a) control: arming while still unborn works and consuming while still unborn is admitted", { timeout: UNBORN_CASE_TIMEOUT_MS }, () => {
    const root = ubFixture();
    const prepared = ubPrepared(root);
    const armed = ubArm(root, prepared);
    assert.equal(armed.status, "armed", JSON.stringify(armed).slice(0, 400));
    assert.ok(ubIsUnborn(root), "arming must not create a commit");
    const verdict = ubConsume(root);
    assert.equal(verdict.status, "consumed", JSON.stringify(verdict).slice(0, 400));
  });

  test("(U3b) arm while unborn, make the first commit, then consume returns replan HGO-DRIFT and the capability is never spent", { timeout: UNBORN_CASE_TIMEOUT_MS }, () => {
    const root = ubFixture();
    const prepared = ubPrepared(root);
    const armed = ubArm(root, prepared);
    assert.equal(armed.status, "armed", JSON.stringify(armed).slice(0, 400));
    ubFirstCommit(root);
    const verdict = ubConsume(root);
    assert.deepEqual({ status: verdict.status, code: verdict.code }, { status: "replan", code: "HGO-DRIFT" }, JSON.stringify(verdict).slice(0, 400));
    const rejected = ubAuditEvents(root).filter((event) => event?.type === "rejected");
    assert.equal(rejected.length, 1, `exactly one authenticated rejection is audited: ${JSON.stringify(rejected).slice(0, 400)}`);
    assert.equal(rejected[0].code, "HGO-DRIFT");
    assert.ok(rejected[0].driftedChecks.includes("repository"), `the drift is the repository observation: ${JSON.stringify(rejected[0].driftedChecks)}`);
    const store = ubStore(root);
    const files = jsonFiles(store.capabilities);
    assert.equal(files.length, 1, "one capability exists");
    assert.equal(readJson(join(store.capabilities, files[0])).status, "armed", "the drifted capability was refused, not consumed");
  });
});

// ---------------------------------------------------------------------------------------------
// COMMIT-SCOPED OVERRIDE COURSE (ALF-C-P19-12F pins what ALF-C-P19-12E implemented in the
// generated hook of plugins/pipeline-core/scripts/pre-commit-hook-install.mjs).
//
// These cases drive a REAL generated pre-commit hook inside a contained fixture repository: its
// own `git init` under scratch/, GIT_CEILING_DIRECTORIES on every git call (so a lost `.git` can
// never resolve to this repository), and a frozen COPY of the plugin (so a concurrent edit of the
// live tree cannot make the installed runtime snapshot stale mid-run). The fixture key is an
// in-memory ephemeral Ed25519 pair: it signs only the fixture's own request and the committed
// trust anchor is merely its public digest.
//
// TIMING (measured on the native Windows host, accepted for 0.7.0): SEEDED 95-175 s, PENDING
// 31-62 s, consume+commit 42-46 s. So each case carries an explicit 600 s timeout, the cases run
// serially over ONE shared fixture, and none of them goes through the hook suite's 20 s commit()
// helper. Execution order is (1) (2) (4) (3) on purpose: SCOPE-DRIFT needs a still-LIVE record of
// ANOTHER scope, and the consume-once commit retires that record.
//
// RED on HEAD by construction: HEAD's generated hook prints no PB-COMMIT-OVERRIDE line at all, so
// cases (1)-(5) fail there; they are GREEN only against the 12E implementation.
// Machine-written evidence of the last run (stderr per commit attempt, timings.json) stays under
// scratch/ac258-pin-fixtures/last-run/.
// ---------------------------------------------------------------------------------------------
const CASE_TIMEOUT_MS = 600_000;
const GIT_TIMEOUT_MS = 540_000;
const CEILING = join(REPO_ROOT, "scratch");
const EVIDENCE_DIR = join(FIXTURES, "last-run");
const PROTECTED_FILE = "protected-suite.test.mjs";
const COMMIT_MESSAGE = "attempt protected rewrite";
const CONTENT_A = "// tampered\n";
const CONTENT_B = "// restaged\n";
const KEY_REFERENCE = "ac258-fixture-key";

const course = { timings: [], cleanup: [] };

function fxGit(dir, args, timeout = 240_000) {
  return spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: dir, encoding: "utf8", shell: false, timeout,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: CEILING },
  });
}

function fxMust(result, what) {
  assert.equal(result.status, 0, `${what} failed (status ${result.status}, signal ${result.signal}): ${result.stderr}`);
  return String(result.stdout).trim();
}

function jsonFiles(dir) {
  try { return readdirSync(dir).filter((name) => name.endsWith(".json")); } catch { return []; }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function countOf(text, needle) {
  return String(text).split(needle).length - 1;
}

function stageProtected(dir, content) {
  writeFileSync(join(dir, PROTECTED_FILE), content);
  fxMust(fxGit(dir, ["add", PROTECTED_FILE]), "stage protected file");
}

/** One contained fixture: own `git init`, a protected-path config, an enrolled scope and the REAL
 * generated pre-commit hook installed from the frozen plugin copy. */
function buildCourseFixture({ withTrustAnchor }) {
  mkdirSync(FIXTURES, { recursive: true });
  const dir = mkdtempSync(join(FIXTURES, withTrustAnchor ? "course-anchored-" : "course-unanchored-"));
  course.cleanup.push(dir);
  fxMust(fxGit(dir, ["init", "-q", "-b", "main"]), "git init");
  fxMust(fxGit(dir, ["config", "user.name", "Fixture"]), "git config user.name");
  fxMust(fxGit(dir, ["config", "user.email", "fixture@example.invalid"]), "git config user.email");
  const normalise = (p) => realpathSync(p).replace(/\\/gu, "/").toLowerCase();
  assert.equal(normalise(fxMust(fxGit(dir, ["rev-parse", "--show-toplevel"]), "show-toplevel")), normalise(dir), "containment: the fixture must be its own repository root");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "guard-config.json"), JSON.stringify({ protectedTestPaths: [{ pattern: "protected-suite\\.test\\.mjs$", reason: "fixture protected suite", id: "TP-1" }] }));
  writeFileSync(join(dir, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  writeFileSync(join(dir, PROTECTED_FILE), "// original\n");
  if (withTrustAnchor) {
    mkdirSync(join(dir, "project"), { recursive: true });
    writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["push"],
      trustAnchor: { keyReference: KEY_REFERENCE, publicKeySha256: createHash("sha256").update(course.publicKeyPem).digest("hex") },
    }));
  }
  fxMust(fxGit(dir, ["add", "-A"]), "stage seed");
  fxMust(fxGit(dir, ["commit", "-q", "-m", "seed"]), "commit seed");

  const governance = course.createGovernanceScopeController({ hostStateRoot: join(dir, "unused-host") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "ac258-pin" });
  governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  const install = course.installer.applyInstall({
    rootDir: dir,
    pluginLibDir: join(course.copy, "lib"),
    pluginHooksDir: join(course.copy, "hooks"),
    pluginScriptsDir: join(course.copy, "scripts"),
  });
  assert.equal(install.status, "installed", `hook install: ${JSON.stringify(install).slice(0, 400)}`);

  const commonDir = fxMust(fxGit(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "git-common-dir");
  return {
    dir,
    requestsDir: join(commonDir, "agent-pipeline", "human-guard-overrides", "requests"),
    scopeDir: join(commonDir, "agent-pipeline", "pre-commit-hook", "commit-scope"),
  };
}

/** `git commit` through the real hook, timed; stderr is kept as machine-written evidence. */
function attempt(fx, name) {
  const started = Date.now();
  const result = fxGit(fx.dir, ["commit", "-m", COMMIT_MESSAGE], GIT_TIMEOUT_MS);
  const out = {
    name,
    code: result.status,
    signal: result.signal,
    ms: Date.now() - started,
    stderr: String(result.stderr ?? ""),
    requests: jsonFiles(fx.requestsDir).length,
    records: jsonFiles(fx.scopeDir).length,
  };
  course.timings.push({ name, code: out.code, signal: out.signal, ms: out.ms, requests: out.requests, records: out.records });
  writeFileSync(join(EVIDENCE_DIR, `${name}.stderr.txt`), out.stderr);
  return out;
}

function why(out) {
  const lines = out.stderr.split(/\r?\n/u).filter((line) => /BLOCKED|PB-COMMIT-OVERRIDE|^Scope:/u.test(line)).join(" | ").slice(0, 900);
  return `${out.name}: exit ${out.code} signal ${out.signal} in ${out.ms} ms, ${out.requests} request(s), ${out.records} record(s); ${lines}`;
}

function assertSigningBlocks(out) {
  const note = why(out);
  assert.deepEqual([...out.stderr.matchAll(/^Step: (\S+)$/gmu)].map((m) => m[1]), ["sign-intent", "authorize-by-signature"], note);
  assert.equal(countOf(out.stderr, "POSIX:"), 2, note);
  assert.equal(countOf(out.stderr, "PowerShell:"), 2, note);
  assert.equal(countOf(out.stderr, 'eval "$CMD"'), 2, note);
  assert.equal(countOf(out.stderr, "Invoke-Expression $CMD"), 2, note);
}

describe("commit-scoped override course through the real pre-commit hook (AC-258)", () => {
  before(async () => {
    course.previousCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = CEILING;
    rmSync(EVIDENCE_DIR, { recursive: true, force: true });
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    course.copy = join(FIXTURES, `plugin-copy-${process.pid}-${Date.now()}`);
    course.cleanup.push(course.copy);
    cpSync(PLUGIN_ROOT, course.copy, { recursive: true });
    const load = (relative) => import(pathToFileURL(join(course.copy, relative)).href);
    course.installer = await load("scripts/pre-commit-hook-install.mjs");
    course.createGovernanceScopeController = (await load("lib/governance-scope.mjs")).createGovernanceScopeController;
    course.hgo = await load("lib/human-guard-override.mjs");
    course.proofSchema = (await load("lib/po-approval-proof.mjs")).PO_APPROVAL_PROOF_SCHEMA;
    course.keyPair = generateKeyPairSync("ed25519");
    course.publicKeyPem = course.keyPair.publicKey.export({ type: "spki", format: "pem" });
    course.anchored = buildCourseFixture({ withTrustAnchor: true });
  }, { timeout: CASE_TIMEOUT_MS });

  after(() => {
    try { writeFileSync(join(EVIDENCE_DIR, "timings.json"), JSON.stringify({ cases: course.timings }, null, 2) + "\n"); } catch { /* evidence only */ }
    if (course.previousCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = course.previousCeiling;
    for (const target of course.cleanup) rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  }, { timeout: CASE_TIMEOUT_MS });

  test("(1) the first protected-path refusal reports SEEDED: one request, POSIX and PowerShell signing blocks, no bypass flag", { timeout: CASE_TIMEOUT_MS }, () => {
    const fx = course.anchored;
    course.head = fxMust(fxGit(fx.dir, ["rev-parse", "HEAD"]), "rev-parse HEAD");
    stageProtected(fx.dir, CONTENT_A);
    course.treeA = fxMust(fxGit(fx.dir, ["write-tree"]), "write-tree");
    const first = attempt(fx, "commit-1-seeded");
    const note = why(first);
    assert.equal(first.code, 1, note);
    assert.match(first.stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/u, note);
    assert.ok(first.stderr.includes(`TP-1 ${PROTECTED_FILE}`), note);
    assert.equal(countOf(first.stderr, "PB-COMMIT-OVERRIDE-SEEDED"), 1, note);
    assert.doesNotMatch(first.stderr, /PB-COMMIT-OVERRIDE-(?:PENDING|SCOPE-DRIFT|UNAVAILABLE|NONOVERRIDABLE|DRIFT|EXPIRED|ALREADY-CONSUMED)/u, note);
    assertSigningBlocks(first);
    assert.doesNotMatch(first.stderr, /--no-verify/u, "the refusal must not hand out a bypass flag");
    assert.match(first.stderr, /HUMAN OPERATOR ONLY/u, note);
    assert.match(first.stderr, /agent MUST NOT/u, note);
    assert.equal(first.requests, 1, note);
    assert.equal(first.records, 1, note);
    const recordFile = jsonFiles(fx.scopeDir)[0];
    const record = readJson(join(fx.scopeDir, recordFile));
    assert.equal(record.status, "live");
    assert.deepEqual(record.scope.protectedPaths, [PROTECTED_FILE]);
    assert.equal(record.scope.head, course.head, "the scope binds the commit it was seeded on");
    assert.equal(record.scope.indexTree, course.treeA, "the scope binds the staged index tree");
    assert.match(record.requestSha256, /^[a-f0-9]{64}$/u);
    course.recordA = record;
  });

  test("(2) the identical second refusal reports PENDING and creates no second request", { timeout: CASE_TIMEOUT_MS }, () => {
    const fx = course.anchored;
    assert.ok(course.recordA, "case (1) must have seeded the first scope record");
    const second = attempt(fx, "commit-2-pending");
    const note = why(second);
    assert.equal(second.code, 1, note);
    assert.equal(countOf(second.stderr, "PB-COMMIT-OVERRIDE-PENDING"), 1, note);
    assert.doesNotMatch(second.stderr, /PB-COMMIT-OVERRIDE-(?:SEEDED|SCOPE-DRIFT|UNAVAILABLE|NONOVERRIDABLE|DRIFT|EXPIRED|ALREADY-CONSUMED)/u, note);
    assertSigningBlocks(second);
    assert.doesNotMatch(second.stderr, /--no-verify/u);
    assert.match(second.stderr, /HUMAN OPERATOR ONLY/u, note);
    assert.equal(second.requests, 1, `still exactly one request: ${note}`);
    assert.equal(second.records, 1, `still exactly one scope record: ${note}`);
    const record = readJson(join(fx.scopeDir, jsonFiles(fx.scopeDir)[0]));
    assert.equal(record.requestSha256, course.recordA.requestSha256, "the pending request is re-used, not replaced");
    assert.equal(record.seededAt, course.recordA.seededAt, "the original seeding time is kept");
    assert.equal(record.status, "live");
  });

  test("(4) restaged content reports SCOPE-DRIFT and seeds a fresh request while the earlier one stays live", { timeout: CASE_TIMEOUT_MS }, () => {
    const fx = course.anchored;
    assert.ok(course.recordA, "case (1) must have seeded the first scope record");
    stageProtected(fx.dir, CONTENT_B);
    const treeB = fxMust(fxGit(fx.dir, ["write-tree"]), "write-tree restaged");
    assert.notEqual(treeB, course.treeA, "restaged content must change the staged index tree");
    const drift = attempt(fx, "commit-4-scope-drift");
    const note = why(drift);
    assert.equal(drift.code, 1, note);
    assert.equal(countOf(drift.stderr, "PB-COMMIT-OVERRIDE-SCOPE-DRIFT"), 1, note);
    assert.doesNotMatch(drift.stderr, /PB-COMMIT-OVERRIDE-(?:SEEDED|PENDING|UNAVAILABLE|NONOVERRIDABLE|ALREADY-CONSUMED)/u, note);
    assertSigningBlocks(drift);
    assert.equal(drift.requests, 2, `a fresh request was seeded: ${note}`);
    assert.equal(drift.records, 2, `a second scope record exists: ${note}`);
    const records = jsonFiles(fx.scopeDir).map((name) => readJson(join(fx.scopeDir, name)));
    const recordB = records.find((record) => record.scope.indexTree === treeB);
    const recordA = records.find((record) => record.scope.indexTree === course.treeA);
    assert.ok(recordB && recordA, "one record per staged scope");
    assert.equal(recordB.status, "live");
    assert.notEqual(recordB.requestSha256, recordA.requestSha256, "the fresh request is a different request");
    assert.equal(recordA.requestSha256, course.recordA.requestSha256, "the earlier scope keeps its own request");
    assert.equal(recordA.status, "live", "the earlier scope stays pending");
  });

  test("(3) after a fixture-key authorize-by-signature the identical retry commits once and the index record is consumed", { timeout: CASE_TIMEOUT_MS }, () => {
    const fx = course.anchored;
    assert.ok(course.recordA, "case (1) must have seeded the first scope record");
    stageProtected(fx.dir, CONTENT_A);
    assert.equal(fxMust(fxGit(fx.dir, ["write-tree"]), "write-tree restored"), course.treeA, "restoring the first content must reproduce the first scope exactly");
    const recordFile = jsonFiles(fx.scopeDir).find((name) => readJson(join(fx.scopeDir, name)).scope.indexTree === course.treeA);
    assert.ok(recordFile, "the first scope record is still on disk");
    const record = readJson(join(fx.scopeDir, recordFile));
    assert.equal(record.status, "live");
    const proof = {
      schema: course.proofSchema,
      intentSha256: record.intentSha256,
      keyReference: KEY_REFERENCE,
      publicKey: course.publicKeyPem,
      signatureBase64: sign(null, Buffer.from(record.intentSha256, "utf8"), course.keyPair.privateKey).toString("base64"),
    };
    const armed = course.hgo.authorizeHumanGuardOverrideBySignature({
      rootDir: fx.dir,
      pluginRoot: course.copy,
      requestSha256: record.requestSha256,
      planSha256: record.planSha256,
      proof,
      scriptPath: join(course.copy, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(armed.status, "armed", `authorize-by-signature: ${JSON.stringify(armed).slice(0, 600)}`);

    const retry = attempt(fx, "commit-3-consume");
    const note = why(retry);
    assert.equal(retry.code, 0, note);
    assert.doesNotMatch(retry.stderr, /BLOCKED|PB-COMMIT-OVERRIDE/u, note);
    const headAfter = fxMust(fxGit(fx.dir, ["rev-parse", "HEAD"]), "rev-parse HEAD after");
    assert.notEqual(headAfter, course.head, "the retried commit advanced HEAD");
    assert.equal(fxMust(fxGit(fx.dir, ["log", "-1", "--format=%s"]), "log subject"), COMMIT_MESSAGE);
    assert.equal(fxMust(fxGit(fx.dir, ["show", `HEAD:${PROTECTED_FILE}`]), "show committed content"), CONTENT_A.trim(), "the protected content landed");
    const consumed = readJson(join(fx.scopeDir, recordFile));
    assert.equal(consumed.status, "consumed", "the index record is spent after the one admitted commit");
    assert.equal(typeof consumed.consumedAt, "string");
    assert.equal(consumed.requestSha256, record.requestSha256);
  });

  test("(5) without a committed trust anchor the course reports UNAVAILABLE, keeps the refusal and seeds nothing", { timeout: CASE_TIMEOUT_MS }, () => {
    const fx = buildCourseFixture({ withTrustAnchor: false });
    stageProtected(fx.dir, CONTENT_A);
    const out = attempt(fx, "commit-5-unavailable");
    const note = why(out);
    assert.equal(out.code, 1, note);
    assert.match(out.stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/u, note);
    assert.ok(out.stderr.includes(`TP-1 ${PROTECTED_FILE}`), `the original finding still stands: ${note}`);
    assert.equal(countOf(out.stderr, "PB-COMMIT-OVERRIDE-UNAVAILABLE"), 1, note);
    assert.match(out.stderr, /no committed human-proof trust anchor/u, note);
    assert.doesNotMatch(out.stderr, /PB-COMMIT-OVERRIDE-(?:SEEDED|PENDING|SCOPE-DRIFT|NONOVERRIDABLE|DRIFT|EXPIRED|ALREADY-CONSUMED)/u, note);
    assert.doesNotMatch(out.stderr, /^Step: |POSIX:|PowerShell:/mu, "no signing block is offered when nobody can sign");
    assert.doesNotMatch(out.stderr, /--no-verify/u);
    assert.equal(out.requests, 0, `nothing seeded: ${note}`);
    assert.equal(out.records, 0, `no scope record written: ${note}`);
    assert.equal(existsSync(fx.scopeDir), false, "the fail-fast leaves no commit-scope directory behind");
  });
});
