#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expectedAcceptanceLine, readClaContract, runCli, validatePrContributorGates } from "./check-pr-contributor-gates.mjs";
import { runSecurityScan } from "./security-scan.mjs";

const AUTHOR_NAME = "External Contributor";
const AUTHOR_EMAIL = "contributor@example.invalid";
const LOGIN = "external-contributor";
const CLA_BYTES = "<!-- CLA-Version: 1.0 -->\n\n# CLA\n\nThe Project may transfer and sublicense these rights.\n";
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function commit(root, subject, signed = true) {
  writeFileSync(join(root, "change.txt"), `${subject}\n`, "utf8");
  git(root, "add", ".");
  const args = ["commit", "-q", "-m", subject];
  if (signed) args.push("-m", `Signed-off-by: ${AUTHOR_NAME} <${AUTHOR_EMAIL}>`);
  git(root, ...args);
  return git(root, "rev-parse", "HEAD");
}

/** Schema-shaped v2 envelope fixture; mirrors security-completeness-gate.test.mjs's `exactV2Envelope`. */
function exactV2Envelope({ commit, tree, capabilityId = "cap.secrets", status = "PASS", classification = "clean" }) {
  return {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: "e".repeat(64) },
    input: { commit, tree, inputSha256: "f".repeat(64) },
    environment: { platform: process.platform, nodeVersion: process.version },
    capabilities: [{
      capabilityId,
      tool: { name: "gitleaks", version: null },
      rulePack: { ref: "gitleaks-default", digest: null },
      status,
      classification,
      findings: [],
      coverage: {
        subject: "candidate-tree",
        exclusions: [],
        ignored: [],
        unsupportedScope: [],
        truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null },
        dataAge: { ageSeconds: 0, snapshotAt: null },
      },
      reason: null,
    }],
  };
}

/** Schema-shaped v2 verdict fixture; mirrors security-completeness-gate.test.mjs's `exactV2Verdict`. */
function exactV2Verdict({ capabilityId = "cap.secrets", outcome, blocking, offendingCapabilities = [] }) {
  return {
    schema: "pipeline.security-verdict.v2",
    producedFrom: "pipeline.security-evidence.v2",
    exitAuthority: "v1-blocking-logic",
    note: "fixture",
    v1ExitCode: 0,
    plan: { required: [capabilityId], optional: [], planDigest: "g".repeat(64), source: "fixture", resolvedPolicyDigest: "h".repeat(64) },
    capabilityOutcomes: { [capabilityId]: outcome },
    verdict: { blocking, offendingCapabilities },
    controls: [],
  };
}

/**
 * Writes a FRESH, BOUND (to `headSha` + its resolved tree) v2 evidence pair into `root`, mirroring
 * `security-completeness-gate.test.mjs`'s `writePair` shape (CYB-2I-1: PR call site consumes the
 * same shared gate against the untrusted PR head tree).
 */
function writeSecurityCompletenessEvidence(root, headSha, { blocking = false, status = "PASS", classification = "clean", outcome = "pass", offendingCapabilities = [] } = {}) {
  const tree = git(root, "rev-parse", `${headSha}^{tree}`);
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(
    join(root, "evidence", "security-latest.v2.json"),
    JSON.stringify(exactV2Envelope({ commit: headSha, tree, status, classification })),
    "utf8",
  );
  writeFileSync(
    join(root, "evidence", "security-latest.v2.verdict.json"),
    JSON.stringify(exactV2Verdict({ outcome, blocking, offendingCapabilities })),
    "utf8",
  );
}

/**
 * `security` selects the TRUSTED `claRoot`'s `.claude/pipeline.yaml` gate-activation shape (F2,
 * CYB-2I-1R; re-rooted to `claRoot` per Critic finding N1, CYB-2I-1R2): default `"blocking"`
 * writes an ACTIVE security gate so every pre-existing, zero-argument `fixture()` call below
 * keeps exercising today's unconditional checkSecurityCompleteness() behavior unchanged; `"off"`
 * writes an inactive gate; `"absent"` writes no manifest file at all (mirrors
 * check-close-security-completeness.test.mjs's own fixture() shape for the identical guard). The
 * manifest is written into `claRoot`, NEVER into `root` (the untrusted candidate) -- N1's fix is
 * exactly that `root`'s own manifest must have no effect on gate activation; a dedicated test
 * below proves a `root`-side manifest attempting to disable the gate has no effect.
 */
function fixture({ security = "blocking" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pr-contributor-gates-"));
  const claRoot = mkdtempSync(join(tmpdir(), "pr-contributor-gates-trusted-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", AUTHOR_NAME);
  git(root, "config", "user.email", AUTHOR_EMAIL);
  writeFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), CLA_BYTES, "utf8");
  writeFileSync(join(claRoot, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), CLA_BYTES, "utf8");
  writeFileSync(join(root, "change.txt"), "base\n", "utf8");
  if (security !== "absent") {
    mkdirSync(join(claRoot, ".claude"), { recursive: true });
    writeFileSync(
      join(claRoot, ".claude", "pipeline.yaml"),
      `schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: ${security}\n    type: automated\n`,
      "utf8",
    );
  }
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base", "-m", `Signed-off-by: ${AUTHOR_NAME} <${AUTHOR_EMAIL}>`);
  const baseSha = git(root, "rev-parse", "HEAD");
  const headSha = commit(root, "candidate");
  const cla = readClaContract(claRoot);
  const event = {
    action: "opened",
    number: 42,
    sender: { login: LOGIN },
    pull_request: {
      body: expectedAcceptanceLine(cla, LOGIN, true),
      user: { login: LOGIN },
      head: { sha: headSha },
      base: { sha: baseSha, ref: "main" },
    },
  };
  return { root, claRoot, cla, event };
}

// ---------------------------------------------------------------------------------------------
// N2 (Critic follow-up finding, CYB-2I-1R3): a real-evidence integration test. Every security-
// gate case ABOVE uses `writeSecurityCompletenessEvidence` (a synthetic envelope) -- this is
// exactly why F1's residual (a real, reproducible blocking verdict from this repo's own `cap.sca`
// capability) went undetected until a Critic ran the real chain by hand. The cases below instead
// drive the REAL `runSecurityScan()` (imported above from `./security-scan.mjs`, no synthetic
// helper) into the REAL `validatePrContributorGates()` chain.
// ---------------------------------------------------------------------------------------------

/**
 * A FIXTURE-LOCAL governance catalog -- entirely separate from, and never touching, this repo's
 * own real `governance/security-controls/catalog.json` (DoD 6). Deliberately minimal: one control
 * naming `cap.sca` (the osv-scanner capability) as REQUIRED (`defaultFailureMode: "block"`,
 * `module: null` so it activates unconditionally, mirroring this repo's own real
 * `ctl.base.sca.dependency-lockfile` entry's shape/intent) -- this is the exact CLASS of gap N1's
 * `cap.sca`/osv-scanner residual belongs to (`docs/state.md`'s F1 entry), reproduced here under
 * full test control rather than by depending on or modifying this repo's own real catalog.
 */
const FIXTURE_SECURITY_CATALOG = JSON.stringify({
  controls: [
    {
      id: "ctl.fixture.sca.required",
      capabilityRequirements: ["cap.sca"],
      defaultFailureMode: "block",
      applicability: { expression: "always", requiredInputs: [] },
    },
  ],
  moduleAttribution: [{ controlId: "ctl.fixture.sca.required", module: null, minAssuranceLevel: "baseline" }],
});

/**
 * N2's real-chain test needs exactly ONE fake scanner binary (osv-scanner) -- see
 * `realScanFixture`'s own doc comment for why gitleaks/semgrep/license-check need no fixture
 * binary here at all. Reproduces, in miniature, the SAME established fake-binary technique
 * `security-scan.test.mjs` already uses (`writeFixtureBinary`/`fixtureSpawnFn`/
 * `mockAssessFixtureBinary`) -- that file's own helpers are private to its module and not
 * exported, so this is a small, single-binary reproduction, not the "large fraction of fixture
 * infrastructure" the briefing's stop condition warns against duplicating.
 */
const REAL_SCAN_BIN_DIR = mkdtempSync(join(tmpdir(), "pr-gate-real-scan-bin-"));

function writeRealScanFixtureBinary(name, jsBody) {
  const mjsPath = join(REAL_SCAN_BIN_DIR, `${name}.mjs`);
  writeFileSync(mjsPath, jsBody);
  if (process.platform === "win32") {
    const cmdPath = join(REAL_SCAN_BIN_DIR, `${name}.cmd`);
    writeFileSync(cmdPath, `@echo off\r\nnode "${mjsPath}" %*\r\n`);
    return cmdPath;
  }
  const shPath = join(REAL_SCAN_BIN_DIR, name);
  writeFileSync(shPath, `#!/usr/bin/env node\n${jsBody}`);
  chmodSync(shPath, 0o755);
  return shPath;
}

const OSV_CLEAN_BIN = writeRealScanFixtureBinary(
  "osv-clean",
  `if (process.argv.includes("--version")) {
  process.stdout.write("osv-scanner version: 2.0.3\\n");
  process.exit(0);
}
process.stdout.write(JSON.stringify({ results: [] }));
process.exit(0);
`,
);

function realScanSpawnFn(cmd, args, opts) {
  // Same Windows `.cmd` shell requirement as security-scan.test.mjs's own `fixtureSpawnFn`
  // (Node's CVE-2024-27980 hardening); production adapters never set `shell: true` themselves.
  return spawnSync(cmd, args, { ...opts, shell: process.platform === "win32" && cmd !== process.execPath });
}

/** Test-only trust mock, same seam/rationale as security-scan.test.mjs's own `mockAssessFixtureBinary`. */
function mockAssessRealScanFixtureBinary(path) {
  return typeof path === "string" && path.startsWith(REAL_SCAN_BIN_DIR)
    ? { ok: true, path }
    : { ok: false, status: "untrusted_path" };
}

/**
 * Builds a candidate `root` + trusted `claRoot` pair like `fixture()`, but additionally: (a)
 * commits `FIXTURE_SECURITY_CATALOG` into `root` at `governance/security-controls/catalog.json`;
 * (b) runs the REAL, exported `runSecurityScan()` against `root`, writing REAL
 * `evidence/security-latest.json` + `.v2.json`/`.v2.verdict.json`, bound to `root`'s own real HEAD
 * commit/tree -- the exact same artifact production CI produces, not a synthetic envelope.
 * `osvAvailable` selects whether the one fake `osv-scanner` binary is on the scan's env (clean,
 * PASS) or entirely absent (SKIPPED/binary_missing). gitleaks/semgrep need no fixture binary at
 * all: neither `cap.secrets` nor `cap.sast` is named by `FIXTURE_SECURITY_CATALOG`, so their own
 * SKIPPED/binary_missing status is never in `plan.required` and can never block (mirrors how
 * `sourceCapabilityPlan` in security-scan.mjs activates only the capabilities the fixture's own
 * catalog actually names). license-check similarly needs no fixture files: its capability contract
 * has `controlRef: null`, so its control-lane `required` is always `false` regardless of status.
 */
async function realScanFixture({ osvAvailable }) {
  const root = mkdtempSync(join(tmpdir(), "pr-contributor-gates-realscan-"));
  const claRoot = mkdtempSync(join(tmpdir(), "pr-contributor-gates-realscan-trusted-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", AUTHOR_NAME);
  git(root, "config", "user.email", AUTHOR_EMAIL);
  writeFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), CLA_BYTES, "utf8");
  writeFileSync(join(claRoot, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), CLA_BYTES, "utf8");
  mkdirSync(join(claRoot, ".claude"), { recursive: true });
  writeFileSync(
    join(claRoot, ".claude", "pipeline.yaml"),
    "schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: blocking\n    type: automated\n",
    "utf8",
  );
  mkdirSync(join(root, "governance", "security-controls"), { recursive: true });
  writeFileSync(join(root, "governance", "security-controls", "catalog.json"), FIXTURE_SECURITY_CATALOG, "utf8");
  writeFileSync(join(root, "change.txt"), "base\n", "utf8");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base", "-m", `Signed-off-by: ${AUTHOR_NAME} <${AUTHOR_EMAIL}>`);
  const baseSha = git(root, "rev-parse", "HEAD");
  const headSha = commit(root, "candidate");

  const env = osvAvailable ? { PIPELINE_OSV_SCANNER_PATH: OSV_CLEAN_BIN } : {};
  const { evidence: scanEvidence, exitCode: scanExitCode } = await runSecurityScan({
    rootDir: root,
    env,
    spawnFn: realScanSpawnFn,
    timeoutMs: 5000,
    assessTrustedExecutablePath: mockAssessRealScanFixtureBinary,
  });

  const cla = readClaContract(claRoot);
  const event = {
    action: "opened",
    number: 42,
    sender: { login: LOGIN },
    pull_request: {
      body: expectedAcceptanceLine(cla, LOGIN, true),
      user: { login: LOGIN },
      head: { sha: headSha },
      base: { sha: baseSha, ref: "main" },
    },
  };
  return { root, claRoot, cla, event, scanEvidence, scanExitCode };
}

const hasCode = (receipt, code) => receipt.errors.some((entry) => entry.code === code);

test("valid receipt binds PR identity, head, current CLA, and signed commits", () => {
  const { root, claRoot, cla, event } = fixture();
  writeSecurityCompletenessEvidence(root, event.pull_request.head.sha, {});
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.schema, "agent-pipeline.pr-contributor-gate.v2");
  assert.deepEqual(receipt.event, { action: "opened", senderLogin: LOGIN, bodyTransition: "opened-by-author" });
  assert.deepEqual(receipt.pullRequest, { number: 42, authorLogin: LOGIN, headSha: event.pull_request.head.sha, baseRef: "main", baseSha: event.pull_request.base.sha });
  assert.deepEqual(receipt.cla, { path: "CONTRIBUTOR_LICENSE_AGREEMENT.md", version: "1.0", sha256: cla.sha256, accepted: true });
  assert.deepEqual(receipt.dco, { status: "passed", checkedCommits: 1 });
});

test("unchecked current acceptance fails closed", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, false);
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_UNCHECKED"), true);
});

test("a trusted-base CLA byte change makes the old acceptance stale", () => {
  const { root, claRoot, event } = fixture();
  writeFileSync(join(claRoot, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), `${readFileSync(join(claRoot, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), "utf8")}Changed.\n`, "utf8");
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_STALE"), true);
});

test("a candidate CLA rewrite cannot control trusted-base acceptance", () => {
  const { root, claRoot, cla, event } = fixture();
  writeFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), "<!-- CLA-Version: 99.0 -->\n\nAttacker-controlled candidate CLA.\n", "utf8");
  event.pull_request.head.sha = commit(root, "candidate-cla-rewrite");
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, true);
  writeSecurityCompletenessEvidence(root, event.pull_request.head.sha, {});
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.cla.version, "1.0");
  assert.equal(receipt.cla.sha256, cla.sha256);
});

test("acceptance bound to another login fails closed", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.body = expectedAcceptanceLine(cla, "different-user", true);
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_LOGIN_MISMATCH"), true);
});

test("missing and duplicate acceptance records fail closed", () => {
  const { root, claRoot, event } = fixture();
  const accepted = event.pull_request.body;
  event.pull_request.body = "No acceptance";
  assert.equal(hasCode(validatePrContributorGates({ root, claRoot, event }), "CLA_ACCEPTANCE_MISSING"), true);
  event.pull_request.body = `${accepted}\n${accepted}`;
  assert.equal(hasCode(validatePrContributorGates({ root, claRoot, event }), "CLA_ACCEPTANCE_AMBIGUOUS"), true);
});

test("every commit unique to the PR must carry an author-matching DCO signoff", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.head.sha = commit(root, "unsigned", false);
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, true);
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.dco.checkedCommits, 2);
  assert.equal(hasCode(receipt, "DCO_SIGNOFF_MISSING_OR_MISMATCHED"), true);
});

test("wrong event action or target branch fails closed", () => {
  const { root, claRoot, event } = fixture();
  event.action = "closed";
  event.pull_request.base.ref = "develop";
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "EVENT_ACTION_INVALID"), true);
  assert.equal(hasCode(receipt, "PR_BASE_REF_INVALID"), true);
});

test("a maintainer edit cannot accept the CLA for the PR author", () => {
  const { root, claRoot, cla, event } = fixture();
  event.action = "edited";
  event.sender.login = "maintainer";
  event.changes = { body: { from: expectedAcceptanceLine(cla, LOGIN, false) } };
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_PROXY_ACTOR"), true);
});

test("an author push invalidates a proxy checkbox until the author personally re-checks it", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.head.sha = commit(root, "author-push-after-proxy-checkbox");
  writeSecurityCompletenessEvidence(root, event.pull_request.head.sha, {});
  event.action = "synchronize";
  const synchronized = validatePrContributorGates({ root, claRoot, event });
  assert.equal(synchronized.ok, false);
  assert.equal(hasCode(synchronized, "CLA_ACCEPTANCE_REFRESH_REQUIRED"), true);

  event.action = "edited";
  event.changes = { body: { from: expectedAcceptanceLine(cla, LOGIN, false) } };
  const refreshed = validatePrContributorGates({ root, claRoot, event });
  assert.equal(refreshed.ok, true, JSON.stringify(refreshed.errors));
  assert.deepEqual(refreshed.event, { action: "edited", senderLogin: LOGIN, bodyTransition: "checked-by-author" });
});

test("CLI emits and writes the same machine-readable receipt without commit email", () => {
  const { root, claRoot, event } = fixture();
  writeSecurityCompletenessEvidence(root, event.pull_request.head.sha, {});
  const eventPath = join(root, "event.json");
  const receiptPath = join(root, "receipt.json");
  writeFileSync(eventPath, JSON.stringify(event), "utf8");
  let stdout = "";
  let stderr = "";
  const status = runCli(["--root", root, "--cla-root", claRoot, "--event", eventPath, "--receipt", receiptPath], { stdout: { write: (value) => { stdout += value; } }, stderr: { write: (value) => { stderr += value; } } });
  assert.equal(status, 0, stderr || stdout);
  const stdoutReceipt = JSON.parse(stdout);
  assert.deepEqual(JSON.parse(readFileSync(receiptPath, "utf8")), stdoutReceipt);
  assert.equal(stdout.includes(AUTHOR_EMAIL), false);
});

test("CLI rejects a missing trusted CLA root and unknown or duplicate arguments", () => {
  const { root, claRoot, event } = fixture();
  const eventPath = join(root, "event.json");
  writeFileSync(eventPath, JSON.stringify(event), "utf8");
  const io = { stdout: { write: () => {} }, stderr: { write: () => {} } };
  assert.equal(runCli(["--root", root, "--event", eventPath], io), 2);
  assert.equal(runCli(["--root", root, "--cla-root", claRoot, "--event", eventPath, "--extra", "value"], io), 2);
  assert.equal(runCli(["--root", root, "--cla-root", claRoot, "--cla-root", claRoot, "--event", eventPath], io), 2);
});

test("no v2 security evidence present at all is additive: SECURITY_COMPLETENESS_BLOCKING is reported while CLA/DCO are still independently evaluated", () => {
  const { root, claRoot, event } = fixture();
  // no evidence/ files written -> the shared gate fails closed with two "missing" reasons.
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  const completenessErrors = receipt.errors.filter((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING");
  assert.equal(completenessErrors.length, 2);
  assert.ok(completenessErrors.some((entry) => entry.detail === "evidence/security-latest.v2.json missing"));
  assert.ok(completenessErrors.some((entry) => entry.detail === "evidence/security-latest.v2.verdict.json missing"));
  // CLA and DCO are still independently, correctly evaluated (additive, not short-circuiting).
  assert.equal(receipt.cla.accepted, true);
  assert.equal(receipt.dco.status, "passed");
});

test("fresh, bound, non-blocking security evidence yields ok:true with no SECURITY_COMPLETENESS_BLOCKING entries", () => {
  const { root, claRoot, event } = fixture();
  writeSecurityCompletenessEvidence(root, event.pull_request.head.sha, {});
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.errors.some((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING"), false);
});

test("fresh, bound, BLOCKING security evidence yields ok:false with SECURITY_COMPLETENESS_BLOCKING entries, CLA/DCO unaffected", () => {
  const { root, claRoot, event } = fixture();
  writeSecurityCompletenessEvidence(root, event.pull_request.head.sha, {
    status: "SKIPPED",
    classification: "binary_missing",
    outcome: "required-capability-missing",
    blocking: true,
    offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "required-capability-missing" }],
  });
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  const completenessErrors = receipt.errors.filter((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING");
  assert.equal(completenessErrors.length, 1);
  assert.equal(
    completenessErrors[0].detail,
    "evidence/security-latest.v2.verdict.json: required capability cap.secrets did not reach an accepted state (outcome=required-capability-missing)",
  );
  assert.equal(receipt.cla.accepted, true);
  assert.equal(receipt.dco.status, "passed");
});

test("no security gate configured (manifest absent): completeness check is skipped, CLA/DCO evaluated normally, no missing-evidence failure (F2 gate-activation guard)", () => {
  const { root, claRoot, event } = fixture({ security: "absent" });
  // no .claude/pipeline.yaml and no evidence/ files -- with the security gate absent, the
  // completeness check must be skipped entirely (opt-in semantics, same as guard-push.mjs and
  // check-close-security-completeness.mjs), not fail closed on missing evidence.
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.errors.some((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING"), false);
  assert.equal(receipt.cla.accepted, true);
  assert.equal(receipt.dco.status, "passed");
});

test("security gate mode:off: completeness check is skipped, CLA/DCO evaluated normally, no missing-evidence failure (F2 gate-activation guard)", () => {
  const { root, claRoot, event } = fixture({ security: "off" });
  // no evidence/ files -- with the gate configured but mode:"off", the completeness check must
  // still be skipped, exactly like the other three AC8 call sites.
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.errors.some((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING"), false);
  assert.equal(receipt.cla.accepted, true);
  assert.equal(receipt.dco.status, "passed");
});

test("an untrusted root's own manifest cannot disable the security gate: only the trusted claRoot governs activation (Critic finding N1, CYB-2I-1R2)", () => {
  const { root, claRoot, event } = fixture({ security: "blocking" }); // claRoot: mode:"blocking" (trusted, governs).
  // Attacker-controlled candidate root sets its OWN manifest to mode:"off" -- the exact CYB-2I-1R2
  // bypass this test closes. Before the fix, loadManifest(root) would read THIS file and skip the
  // completeness check entirely; after the fix, root's manifest has no bearing on activation at
  // all, only claRoot's does.
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "pipeline.yaml"),
    "schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: off\n    type: automated\n",
    "utf8",
  );
  // No security evidence written for this headSha -- if the gate were (incorrectly) governed by
  // root's manifest, this would be a silent skip (ok:true, no missing-evidence errors, exactly
  // like the "security gate mode:off" case above). A correctly re-rooted guard must instead still
  // run the completeness check against claRoot's "blocking" configuration and fail closed.
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  const completenessErrors = receipt.errors.filter((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING");
  assert.equal(completenessErrors.length, 2);
  assert.ok(completenessErrors.some((entry) => entry.detail === "evidence/security-latest.v2.json missing"));
  assert.ok(completenessErrors.some((entry) => entry.detail === "evidence/security-latest.v2.verdict.json missing"));
  // CLA/DCO remain independently, correctly evaluated -- the attempted bypass affects nothing else.
  assert.equal(receipt.cla.accepted, true);
  assert.equal(receipt.dco.status, "passed");
});

test("N2: real runSecurityScan() -> real checkSecurityCompleteness chain -- clean fake scanners satisfy a fixture catalog's required cap.sca -> ok:true (no synthetic evidence-writer)", async () => {
  const { root, claRoot, event, scanEvidence, scanExitCode } = await realScanFixture({ osvAvailable: true });
  assert.equal(scanExitCode, 0, JSON.stringify(scanEvidence.scanners));
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.errors.some((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING"), false);
});

test("N2: real runSecurityScan() -> real checkSecurityCompleteness chain -- osv-scanner absent from PATH makes the fixture catalog's required cap.sca genuinely block (the class of gap N1's cap.sca residual belongs to)", async () => {
  const { root, claRoot, event } = await realScanFixture({ osvAvailable: false });
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  const completenessErrors = receipt.errors.filter((entry) => entry.code === "SECURITY_COMPLETENESS_BLOCKING");
  assert.equal(completenessErrors.length, 1, JSON.stringify(receipt.errors));
  assert.match(
    completenessErrors[0].detail,
    /required capability cap\.sca did not reach an accepted state \(outcome=required-capability-missing\)/,
  );
  // CLA/DCO remain independently, correctly evaluated -- the real chain's blocking behavior is
  // additive, exactly like every synthetic-evidence case above.
  assert.equal(receipt.cla.accepted, true);
  assert.equal(receipt.dco.status, "passed");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok - ${name}`); }
  catch (failure) { failed += 1; console.error(`not ok - ${name}\n${failure.stack ?? failure}`); }
}
console.log(`1..${tests.length}`);
if (failed > 0) process.exitCode = 1;
