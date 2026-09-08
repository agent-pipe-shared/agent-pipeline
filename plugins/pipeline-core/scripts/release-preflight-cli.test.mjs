#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ReleasePreflightCliError, buildReleasePreflight } from "./release-preflight-cli.mjs";
import { criticalActionSubjectSha256, createCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { canonical as canonicalPoApprovalProof } from "../lib/po-approval-proof.mjs";

const POLICY = "c".repeat(64);
const CLI_PATH = fileURLToPath(new URL("./release-preflight-cli.mjs", import.meta.url));
const roots = [];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture({ version = "1.2.3", manifestVersion = null, consentStatus = "approved", dirty = false, dirtyDeleteMember = false, dirtyDeleteChecker = false, symlinkedCheckerParent = false, waiveReleasePreflight = true, globalHumanApproval = null, commitGlobalHumanApproval = true, source = false, omitSourceMember = false, candidateCalibration = "source", sourceCheckerResult = "passed" } = {}) {
  const base = mkdtempSync(join(tmpdir(), "release-preflight-cli-"));
  roots.push(base);
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: base, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const write = (path, value) => {
    mkdirSync(join(base, path, ".."), { recursive: true });
    writeFileSync(join(base, path), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");

  write("VERSION", `${version}\n`);
  const manifest = manifestVersion ?? version;
  write("plugins/pipeline-core/.codex-plugin/plugin.json", { name: "pipeline-core", version: manifest });
  write("plugins/pipeline-core/.claude-plugin/plugin.json", { name: "pipeline-core", version: manifest });
  for (const [kind, path] of Object.entries({ prd: "docs/prd.md", spec: "docs/spec.md", acceptance: "docs/acceptance.md", result: "docs/result.md" })) {
    write(path, `# ${kind}\n`);
  }
  write("consent.json", {
    authoritySha256: "a".repeat(64), decisionId: "b".repeat(64),
    evaluatedAt: "2026-08-06T10:00:00Z", expiresAt: "2026-08-07T10:00:00Z", status: consentStatus,
  });
  write("lifecycle.json", {
    featureId: "fixture-feature",
    documents: { prd: "docs/prd.md", spec: "docs/spec.md", acceptance: "docs/acceptance.md", result: "docs/result.md" },
  });
  if (globalHumanApproval !== null) {
    write("pipeline.user.yaml", `schema: "pipeline.user.v3"\ngates:\n  human_approval: "${globalHumanApproval}"\n`);
  }
  if (source) {
    // This committed typed stub exercises the producer boundary only. Domain
    // validity belongs to the real checker suite, which owns its Git fixtures.
    const checkerResult = sourceCheckerResult === "malformed"
      ? "process.stdout.write('{}\\n');"
      : sourceCheckerResult === "stale"
        ? "process.stdout.write(JSON.stringify({ schema: 'pipeline.doc-reader-binding-check.v1', status: 'failed', candidateCommit: values.get('--candidate'), featureId: values.get('--feature-id'), reviewedCommit: null, docsetSha256: null, findings: ['stale binding'], assurance: 'committed-state-and-evidence-presence-only' })); process.exitCode = 1;"
      : `const candidate = values.get('--candidate'); const featureId = values.get('--feature-id');\nconst result = { schema: 'pipeline.doc-reader-binding-check.v1', status: 'passed', candidateCommit: ${sourceCheckerResult === "mismatched" ? "'0'.repeat(40)" : "candidate"}, featureId: ${sourceCheckerResult === "feature-mismatch" ? "'other-feature'" : "featureId"}, reviewedCommit: candidate, docsetSha256: 'd'.repeat(64), findings: [], assurance: 'committed-state-and-evidence-presence-only' };\nprocess.stdout.write(JSON.stringify(result));`;
    write(".claude/pipeline.json", { project: "agent-pipeline", verify: "node harness/scripts/verify.mjs" });
    for (const path of [
      "harness/scripts/verify.mjs",
      "harness/scripts/check-doc-contracts.mjs",
      "harness/scripts/check-doc-reconciliation.mjs",
      "harness/reader-review-protocol.md",
      "governance/observation-doc-governance.json",
      "docs/product-capability-inventory.json",
    ]) write(path, "fixture source member\\n");
    write("harness/scripts/check-doc-reader-binding.mjs", `#!/usr/bin/env node\nconst values = new Map();\nfor (let index = 0; index < process.argv.length; index += 2) values.set(process.argv[index], process.argv[index + 1]);\n${checkerResult}\n`);
  }
  // ADR-0064 Decision 6: a hand-supplied --consent claiming "approved" now requires an
  // explicit, committed release-preflight waiver. Every fixture that exercises that
  // scenario as a SEPARATE, still-valid path (as opposed to the new proof-verified
  // path) needs one recorded, so this is the RIGHT fix for a test whose own purpose is
  // downstream repository-observation/reducer behavior, not "how was approval reached".
  // `waiveReleasePreflight: false` is the one deliberate exception -- it lets a test
  // reach `resolveHandSuppliedConsent`'s OWN refusal branch instead of pre-satisfying it.
  if (consentStatus === "approved" && waiveReleasePreflight) {
    write("project/critical-human-proof.json", {
      schema: "pipeline.critical-human-proof-policy.v2",
      requiredKinds: ["release-preflight"],
      waivedKinds: [{ kind: "release-preflight", reason: "fixture: hand-supplied consent exercised directly under ADR-0064 Decision 6" }],
    });
  }
  git("add", "-A");
  git("commit", "-qm", "base");
  const baseCommit = git("rev-parse", "HEAD");
  if (source && omitSourceMember) rmSync(join(base, "harness/scripts/check-doc-contracts.mjs"));
  if (source && candidateCalibration === "malformed") write(".claude/pipeline.json", "{");
  write("docs/result.md", "# result\n\nsecond revision\n");
  git("add", "-A");
  git("commit", "-qm", "candidate");
  const candidateCommit = git("rev-parse", "HEAD");
  const candidateTree = git("rev-parse", "HEAD^{tree}");
  if (globalHumanApproval !== null && !commitGlobalHumanApproval) {
    write("pipeline.user.yaml", `schema: "pipeline.user.v3"\ngates:\n  human_approval: "${globalHumanApproval}"\n# working tree only\n`);
  }
  if (dirty) write("docs/spec.md", "# spec\n\nuncommitted\n");
  if (dirtyDeleteMember) rmSync(join(base, "harness/scripts/verify.mjs"));
  if (dirtyDeleteChecker) rmSync(join(base, "harness/scripts/check-doc-reader-binding.mjs"));
  if (symlinkedCheckerParent) {
    const outside = mkdtempSync(join(tmpdir(), "release-preflight-reader-outside-"));
    roots.push(outside);
    mkdirSync(join(outside, "scripts"));
    writeFileSync(join(outside, "scripts/check-doc-reader-binding.mjs"), "#!/usr/bin/env node\n");
    rmSync(join(base, "harness"), { recursive: true, force: true });
    symlinkSync(outside, join(base, "harness"), "dir");
  }
  return { base, baseCommit, candidateCommit, candidateTree, git };
}

const build = ({ base, baseCommit }, over = {}) => buildReleasePreflight({
  rootDir: base, preflightId: "fixture-preflight", baseCommit,
  consentPath: "consent.json", lifecyclePath: "lifecycle.json", retentionPolicySha256: POLICY, ...over,
});

function runCli(context, outPath) {
  return spawnSync(process.execPath, [
    CLI_PATH, "--preflight-id", "fixture-preflight", "--base", context.baseCommit,
    "--consent", "consent.json", "--lifecycle", "lifecycle.json", "--retention-policy", POLICY,
    "--out", outPath, "--root", context.base,
  ], { encoding: "utf8" });
}

/** A fresh Ed25519 keypair, PEM-exported, exactly the shape `po-approval-proof.mjs`
 * demands -- the same convention `critical-action-approval-request.test.mjs` uses,
 * never a real operator key. */
function keypair() {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  return { keys, publicKey };
}

/** The exact ADR-0064 Decision 2 subject shape `release-preflight-cli.mjs` itself
 * rebuilds from its own observations -- mirrored here from the SAME fixture facts
 * (never re-derived independently) so a test's signed proof binds the real subject. */
function subjectFor(context, { retentionPolicySha256 = POLICY, lifecyclePath = "lifecycle.json" } = {}) {
  const baseTree = context.git("rev-parse", `${context.baseCommit}^{tree}`);
  const manifestSha256 = sha256(readFileSync(join(context.base, lifecyclePath)));
  const version = readFileSync(join(context.base, "VERSION"), "utf8").trim();
  return {
    schema: "pipeline.release-preflight-consent-subject.v1",
    version,
    base: { commit: context.baseCommit, tree: baseTree },
    lifecycle: { featureId: "fixture-feature", manifestPath: lifecyclePath, manifestSha256 },
    retentionPolicySha256,
  };
}

/** A real, verifiable critical-action request/proof pair -- the same construction
 * `critical-action-approval-request.test.mjs` already establishes as the convention. */
function signedProofPair({ candidate, subject, expiresAt, keys, publicKey, keyReference = "fixture-key", kind = "release-preflight" }) {
  const subjectSha256 = criticalActionSubjectSha256({ kind, candidate, subject });
  const action = { kind, subjectSha256, expiresAt };
  const request = createCriticalActionApprovalRequest({
    candidate, featureId: "fixture-feature", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action,
  });
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: request.approvalIntent.sha256,
    keyReference,
    publicKey,
    signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64"),
  };
  return { request, proof };
}

/** A directory OUTSIDE any fixture repository -- the ADR-0064 Decision 5 transport
 * every recorded request/proof pair must live in. */
function externalDir() {
  const dir = mkdtempSync(join(tmpdir(), "release-preflight-proof-"));
  roots.push(dir);
  return dir;
}
function writeExternal(dir, name, value) {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("RPC01 a clean candidate with agreeing surfaces and approved consent is ready", () => {
    const { record } = build(fixture());
    assert.deepEqual(record.reasons, []);
    assert.equal(record.status, "ready");
    assert.equal(record.schema, "pipeline.release-preflight.v1");
    assert.match(record.recordSha256, /^[0-9a-f]{64}$/u);
  });

  check("RPC-chat committed global chat creates a terminal-, key- and proof-free candidate-bound consent with an explicit marker", () => {
    const context = fixture({ globalHumanApproval: "chat" });
    const { record } = build(context, { consentPath: null });
    assert.equal(record.status, "ready", record.reasons.join(", "));
    assert.deepEqual(record.humanApproval, { mode: "chat-attributed-unattested", kind: "release-preflight" });
    assert.equal(record.consent.status, "approved");
    assert.equal(record.consent.evaluatedAt, record.consent.expiresAt);
  });

  check("RPC-chat uncommitted global chat remains signature-default and cannot omit proof or consent", () => {
    const context = fixture({ globalHumanApproval: "chat", commitGlobalHumanApproval: false });
    assert.throws(() => build(context, { consentPath: null }), (error) => {
      assert.ok(error instanceof ReleasePreflightCliError, error?.message);
      assert.equal(error.code, "RPC-USAGE");
      return true;
    });
  });

  // The load-bearing property: no input state can be talked into "ready".
  check("RPC02 an unapproved consent blocks, and the tool never substitutes approval", () => {
    const { record } = build(fixture({ consentStatus: "declined" }));
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("consent-not-approved"), record.reasons.join(", "));
    assert.equal(record.consent.status, "declined", "consent status must pass through verbatim");
  });

  check("RPC03 an uncommitted working tree blocks", () => {
    const { record } = build(fixture({ dirty: true }));
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("repository-not-clean"), record.reasons.join(", "));
  });

  check("RPC04 version surfaces that disagree block", () => {
    // Exactly this repository's release-time state: VERSION is stable while the
    // plugin manifests still carry a local-development build suffix.
    const { record } = build(fixture({ version: "1.2.3", manifestVersion: "1.2.3+claude.20260806.abcdefg" }));
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("version-decision-mismatch"), record.reasons.join(", "));
  });

  check("RPC05 a GG-03 binding naming another candidate blocks", () => {
    const context = fixture();
    writeFileSync(join(context.base, "gg03.json"), `${JSON.stringify({
      schema: "pipeline.gg-03-binding.v1", operation: "protected-main-fast-forward",
      candidateCommit: "0".repeat(40), candidateTree: "1".repeat(40),
      authoritySha256: "d".repeat(64), evidenceSha256: "e".repeat(64),
    }, null, 2)}\n`);
    const { record } = build(context, { gg03Path: "gg03.json" });
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("gg03-candidate-mismatch"), record.reasons.join(", "));
  });

  check("RPC06 an omitted GG-03 is recorded as not required, never as satisfied", () => {
    const { record } = build(fixture());
    assert.equal(record.gates.gg03.required, false);
    assert.equal(record.gates.gg03.binding, null);
  });

  check("RPC07 documentation digests are read from the tree, not supplied", () => {
    const context = fixture();
    const { record } = build(context);
    assert.equal(record.documentation.prd.path, "docs/prd.md");
    assert.equal(record.documentation.prd.sha256, sha256("# prd\n"));
  });

  check("RPC08 an absolute or escaping input path is refused", () => {
    const context = fixture();
    for (const consentPath of ["/etc/passwd", "../outside.json"]) {
      assert.throws(() => build(context, { consentPath }), (error) => {
        assert.ok(error instanceof ReleasePreflightCliError, error?.message);
        assert.equal(error.code, "RPC-PATH");
        return true;
      });
    }
  });

  check("RPC10 a tag ref as --base peels base.commit to the commit it points to, not the tag's own OID", () => {
    const context = fixture();
    const git = (...args) => {
      const r = spawnSync("git", args, { cwd: context.base, encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    git("tag", "-a", "v-fixture", context.baseCommit, "-m", "annotated tag for RPC10");
    const tagOid = git("rev-parse", "v-fixture");
    assert.notEqual(tagOid, context.baseCommit, "test setup invalid: tag OID must differ from the commit it points to");
    const { record } = build(context, { baseCommit: "v-fixture" });
    assert.equal(record.base.commit, context.baseCommit, "base.commit must be the peeled commit OID, not the tag OID");
    assert.notEqual(record.base.commit, tagOid);
  });

  check("RPC09 every final gate stays pending and separated by kind", () => {
    const { record } = build(fixture());
    assert.deepEqual(record.gates.inventory.map((gate) => gate.id), ["verify", "security", "critic", "remote", "human"]);
    assert.ok(record.gates.inventory.every((gate) => gate.status === "pending"));
    assert.deepEqual(
      record.gates.inventory.filter((gate) => gate.kind === "external").map((gate) => gate.id),
      ["remote", "human"],
    );
  });

  // ADR-0064 Decision 5: the additive --proof-request/--proof path.
  check("RPC11 a verified --proof-request/--proof pair derives an approved consent per the Decision 5 field mapping", () => {
    const context = fixture();
    const { keys, publicKey } = keypair();
    const subject = subjectFor(context);
    const candidate = { commit: context.candidateCommit, tree: context.candidateTree };
    const expiresAt = "2099-01-01T00:00:00.000Z";
    const { request, proof } = signedProofPair({ candidate, subject, expiresAt, keys, publicKey });
    const dir = externalDir();
    const proofRequestPath = writeExternal(dir, "request.json", request);
    const proofPath = writeExternal(dir, "proof.json", proof);
    const now = "2026-08-17T00:00:00.000Z";
    const { record } = build(context, { consentPath: null, proofRequestPath, proofPath, now });
    assert.equal(record.status, "ready", record.reasons.join(", "));
    assert.equal(record.consent.status, "approved");
    assert.equal(record.consent.decisionId, request.approvalIntent.sha256);
    assert.equal(record.consent.evaluatedAt, now);
    assert.equal(record.consent.expiresAt, expiresAt);
    assert.match(record.consent.authoritySha256, /^[0-9a-f]{64}$/u);
  });

  check("RPC12 --consent and --proof-request/--proof are mutually exclusive and exactly one is required (buildReleasePreflight layer)", () => {
    const common = { rootDir: "/nonexistent-rpc12", preflightId: "x", baseCommit: "y", lifecyclePath: "l.json", retentionPolicySha256: POLICY };
    const scenarios = [
      { over: { consentPath: "c.json", proofRequestPath: "p.json", proofPath: "q.json" }, note: "both consent and proof pair supplied" },
      { over: {}, note: "neither supplied" },
      { over: { proofRequestPath: "p.json" }, note: "--proof-request without --proof" },
      { over: { proofPath: "q.json" }, note: "--proof without --proof-request" },
    ];
    for (const { over, note } of scenarios) {
      assert.throws(() => buildReleasePreflight({ ...common, ...over }), (error) => {
        assert.ok(error instanceof ReleasePreflightCliError, `${note}: ${error?.message}`);
        assert.equal(error.code, "RPC-USAGE", note);
        return true;
      }, note);
    }
  });

  check("RPC13 --consent and --proof-request/--proof exclusivity is enforced at the CLI parseArgs layer", () => {
    const baseArgs = ["--preflight-id", "x", "--base", "y", "--lifecycle", "l.json", "--retention-policy", POLICY, "--out", "out.json"];
    const scenarios = [
      { extra: ["--consent", "c.json", "--proof-request", "p.json", "--proof", "q.json"], note: "both supplied" },
      { extra: [], note: "neither supplied" },
      { extra: ["--proof-request", "p.json"], note: "--proof-request without --proof" },
      { extra: ["--proof", "q.json"], note: "--proof without --proof-request" },
    ];
    for (const { extra, note } of scenarios) {
      const result = spawnSync("node", [CLI_PATH, ...baseArgs, ...extra], { encoding: "utf8" });
      assert.equal(result.status, 2, `${note}: stderr=${result.stderr}`);
      assert.match(result.stderr, /RPC-USAGE/u, note);
    }
  });

  // Negative corpus (ADR-0064 Risk section): each must be caught, never silently accepted.
  check("RPC14 a proof recorded for a different candidate is refused, not silently accepted", () => {
    const context = fixture();
    const { keys, publicKey } = keypair();
    const subject = subjectFor(context);
    const wrongCandidate = { commit: context.baseCommit, tree: context.git("rev-parse", `${context.baseCommit}^{tree}`) };
    const { request, proof } = signedProofPair({ candidate: wrongCandidate, subject, expiresAt: "2099-01-01T00:00:00.000Z", keys, publicKey });
    const dir = externalDir();
    const proofRequestPath = writeExternal(dir, "request.json", request);
    const proofPath = writeExternal(dir, "proof.json", proof);
    assert.throws(() => build(context, { consentPath: null, proofRequestPath, proofPath }), (error) => {
      assert.ok(error instanceof ReleasePreflightCliError, error?.message);
      assert.equal(error.code, "RPC-CONSENT-UNVERIFIED", error.message);
      return true;
    });
  });

  check("RPC15 cross-kind substitution stays refused for release-preflight, mirroring push/deploy/publication", () => {
    const context = fixture();
    const { keys, publicKey } = keypair();
    const candidate = { commit: context.candidateCommit, tree: context.candidateTree };
    // A subject shaped for "push" rather than "release-preflight" -- a real, signed
    // approval for a DIFFERENT kind, replayed against this gate.
    const pushSubject = { source: candidate.commit, remote: "origin", destination: "refs/heads/main" };
    const { request, proof } = signedProofPair({ candidate, subject: pushSubject, expiresAt: "2099-01-01T00:00:00.000Z", keys, publicKey, kind: "push" });
    const dir = externalDir();
    const proofRequestPath = writeExternal(dir, "request.json", request);
    const proofPath = writeExternal(dir, "proof.json", proof);
    assert.throws(() => build(context, { consentPath: null, proofRequestPath, proofPath }), (error) => {
      assert.ok(error instanceof ReleasePreflightCliError, error?.message);
      assert.equal(error.code, "RPC-CONSENT-UNVERIFIED", error.message);
      return true;
    });
  });

  check("RPC16 an expired proof yields consent.status \"expired\" and the record stays blocked, never approved", () => {
    const context = fixture();
    const { keys, publicKey } = keypair();
    const subject = subjectFor(context);
    const candidate = { commit: context.candidateCommit, tree: context.candidateTree };
    const expiresAt = "2020-01-01T00:00:00.000Z";
    const { request, proof } = signedProofPair({ candidate, subject, expiresAt, keys, publicKey });
    const dir = externalDir();
    const proofRequestPath = writeExternal(dir, "request.json", request);
    const proofPath = writeExternal(dir, "proof.json", proof);
    const { record } = build(context, { consentPath: null, proofRequestPath, proofPath, now: "2026-08-17T00:00:00.000Z" });
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("consent-not-approved"), record.reasons.join(", "));
    assert.equal(record.consent.status, "expired");
    assert.equal(record.consent.decisionId, request.approvalIntent.sha256);
    assert.equal(record.consent.evaluatedAt, expiresAt);
    // Finding 3 (ADR-0064 Decision 5 comment): `authoritySha256` here must be the
    // CONCRETE digest `po-approval-proof.mjs`'s own exported `canonical` produces for
    // this exact proof -- the identical formula `verifyPoApprovalProof` uses internally
    // for `proofSha256` -- not merely a hex-shaped string. Computed independently here
    // (never by re-importing the CLI's own call), so this closes the "same value
    // verification would have produced" claim rather than assuming it.
    const expectedAuthoritySha256 = createHash("sha256").update(canonicalPoApprovalProof(proof)).digest("hex");
    assert.equal(record.consent.authoritySha256, expectedAuthoritySha256);
  });

  // Critic finding F3 (record-fidelity, this dispatch): RPC16 above uses a GENUINELY
  // valid signature that merely arrived after its own expiry, so its authoritySha256
  // equalling the "verified" formula is not distinguishing -- a genuinely re-verified
  // proof and a naively-hashed raw proof produce the identical value for a well-signed
  // proof either way. This test is the one RPC16 cannot be: an expired proof whose
  // signature does NOT actually verify, proving the fix actually re-checks rather than
  // trusting the raw claim.
  check("RPC21 an expired proof whose signature does not actually verify still stays \"expired\"/blocked (unchanged), but authoritySha256 no longer claims a checked authority", () => {
    const context = fixture();
    const { keys, publicKey } = keypair();
    const subject = subjectFor(context);
    const candidate = { commit: context.candidateCommit, tree: context.candidateTree };
    const expiresAt = "2020-01-01T00:00:00.000Z";
    const { request, proof: signed } = signedProofPair({ candidate, subject, expiresAt, keys, publicKey });
    // Same well-formed request/proof shape as RPC16 (so it still reaches
    // CRITICAL-ACTION-PROOF-EXPIRED on the first, real-`now` verification pass, exactly
    // like RPC16), except the signature covers a DIFFERENT message than intentSha256 --
    // a well-formed Ed25519 signature that `verifyPoApprovalProof` reports as
    // PO-APPROVAL-PROOF-MISMATCH, never PO-APPROVAL-PROOF-VERIFIED.
    const proof = { ...signed, signatureBase64: sign(null, Buffer.from("not-the-real-intent-digest"), keys.privateKey).toString("base64") };
    const dir = externalDir();
    const proofRequestPath = writeExternal(dir, "request.json", request);
    const proofPath = writeExternal(dir, "proof.json", proof);
    const { record } = build(context, { consentPath: null, proofRequestPath, proofPath, now: "2026-08-17T00:00:00.000Z" });
    // Unchanged behaviour -- the exact DoD constraint: status/blocking are identical to
    // RPC16's genuinely-signed case regardless of whether the signature itself checks out.
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("consent-not-approved"), record.reasons.join(", "));
    assert.equal(record.consent.status, "expired");
    assert.equal(record.consent.evaluatedAt, expiresAt);
    // The fix itself: an invalid-signature expired proof must NOT carry the same
    // authoritySha256 a genuinely verified proof would (RPC16's value/formula) -- the
    // pre-fix code computed exactly that value regardless of whether the signature
    // actually checked out, which is the record-fidelity defect this closes.
    const wouldHaveBeenClaimedVerified = createHash("sha256").update(canonicalPoApprovalProof(proof)).digest("hex");
    assert.notEqual(record.consent.authoritySha256, wouldHaveBeenClaimedVerified, "an invalid-signature expired proof must not carry the same authoritySha256 a genuinely verified one would");
    assert.match(record.consent.authoritySha256, /^[0-9a-f]{64}$/u);
  });

  check("RPC17 an edited subject preimage -- any field the subject digest covers -- is caught, not silently accepted", () => {
    const context = fixture();
    const { keys, publicKey } = keypair();
    const signedSubject = subjectFor(context, { retentionPolicySha256: POLICY });
    const candidate = { commit: context.candidateCommit, tree: context.candidateTree };
    const { request, proof } = signedProofPair({ candidate, subject: signedSubject, expiresAt: "2099-01-01T00:00:00.000Z", keys, publicKey });
    const dir = externalDir();
    const proofRequestPath = writeExternal(dir, "request.json", request);
    const proofPath = writeExternal(dir, "proof.json", proof);
    // The CLI is invoked with a DIFFERENT retentionPolicySha256 than the one the proof
    // was signed over -- one field the subject digest covers (ADR-0064 Decision 2) --
    // simulating exactly the edited-subject-preimage attack the ADR's Risk section names.
    const tamperedPolicy = "d".repeat(64);
    assert.notEqual(tamperedPolicy, POLICY);
    assert.throws(() => build(context, { consentPath: null, proofRequestPath, proofPath, retentionPolicySha256: tamperedPolicy }), (error) => {
      assert.ok(error instanceof ReleasePreflightCliError, error?.message);
      assert.equal(error.code, "RPC-CONSENT-UNVERIFIED", error.message);
      return true;
    });
  });

  check("RPC18 a proof signed by a key outside the project's committed trust-anchor set is refused", () => {
    const context = fixture();
    const { keys, publicKey } = keypair();
    const subject = subjectFor(context);
    const candidate = { commit: context.candidateCommit, tree: context.candidateTree };
    const { request, proof } = signedProofPair({ candidate, subject, expiresAt: "2099-01-01T00:00:00.000Z", keys, publicKey, keyReference: "fixture-key" });
    mkdirSync(join(context.base, "project"), { recursive: true });
    writeFileSync(join(context.base, "project/critical-human-proof.json"), `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3",
      requiredKinds: ["release-preflight"],
      waivedKinds: [],
      trustAnchors: [{ keyReference: "operator-key", publicKeySha256: "0".repeat(64) }],
    }, null, 2)}\n`);
    const dir = externalDir();
    const proofRequestPath = writeExternal(dir, "request.json", request);
    const proofPath = writeExternal(dir, "proof.json", proof);
    assert.throws(() => build(context, { consentPath: null, proofRequestPath, proofPath }), (error) => {
      assert.ok(error instanceof ReleasePreflightCliError, error?.message);
      assert.equal(error.code, "RPC-CONSENT-UNVERIFIED", error.message);
      return true;
    });
  });

  check("RPC19 a missing proof or request artifact is refused, never treated as an absent-but-fine input", () => {
    const context = fixture();
    const dir = externalDir();
    assert.throws(() => build(context, {
      consentPath: null,
      proofRequestPath: join(dir, "missing-request.json"),
      proofPath: join(dir, "missing-proof.json"),
    }), (error) => {
      assert.ok(error instanceof ReleasePreflightCliError, error?.message);
      assert.equal(error.code, "RPC-INPUT", error.message);
      return true;
    });
  });

  // ADR-0064 Decision 6 (Finding 1): the tightening itself, exercised directly -- every
  // OTHER test that reaches an "approved" hand-supplied consent pre-writes the waiver
  // (via `fixture()`'s default `waiveReleasePreflight: true`), so none of them can
  // reach `resolveHandSuppliedConsent`'s own refusal branch. This one deliberately
  // withholds the waiver.
  check("RPC20 a hand-supplied --consent claiming \"approved\" without a recorded release-preflight waiver is refused", () => {
    const context = fixture({ consentStatus: "approved", waiveReleasePreflight: false });
    assert.throws(() => build(context), (error) => {
      assert.ok(error instanceof ReleasePreflightCliError, error?.message);
      assert.equal(error.code, "RPC-CONSENT-UNWAIVED", error.message);
      return true;
    });
  });

  check("RPC-reader a generic consumer fixture does not activate the Pipeline-source reader policy", () => {
    const { record } = build(fixture());
    assert.equal(record.status, "ready");
  });

  check("RPC-reader a committed source candidate invokes the typed reader checker before producing the preflight", () => {
    const { record } = build(fixture({ source: true }));
    assert.equal(record.status, "ready");
  });

  check("RPC-reader a source base cannot disable reader binding by deleting a required candidate member, and no artifact is written", () => {
    const context = fixture({ source: true, omitSourceMember: true });
    assert.throws(() => build(context), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
    const outPath = "source-reader-failure.json";
    const result = runCli(context, outPath);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /RPC-DOC-READER-BINDING/u);
    assert.equal(existsSync(join(context.base, outPath)), false);
  });

  check("RPC-reader a source checker result with a mismatched candidate is refused", () => {
    assert.throws(() => build(fixture({ source: true, sourceCheckerResult: "mismatched" })), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
  });

  check("RPC-reader a malformed source checker result is refused", () => {
    assert.throws(() => build(fixture({ source: true, sourceCheckerResult: "malformed" })), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
  });

  check("RPC-reader a stale source binding result is refused", () => {
    assert.throws(() => build(fixture({ source: true, sourceCheckerResult: "stale" })), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
  });

  check("RPC-reader a source base rejects a malformed candidate calibration", () => {
    assert.throws(() => build(fixture({ source: true, candidateCalibration: "malformed" })), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
  });

  check("RPC-reader a mismatched checker feature ID is refused", () => {
    assert.throws(() => build(fixture({ source: true, sourceCheckerResult: "feature-mismatch" })), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
  });

  check("RPC-reader a missing local checker is normalized to the reader-binding failure", () => {
    assert.throws(() => build(fixture({ source: true, dirtyDeleteChecker: true })), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
  });

  check("RPC-reader a checker resolved through an escaping parent symlink is refused", () => {
    assert.throws(() => build(fixture({ source: true, symlinkedCheckerParent: true })), (error) => error instanceof ReleasePreflightCliError && error.code === "RPC-DOC-READER-BINDING");
  });

  check("RPC-reader a dirty public document is still checked from committed source state and remains unclean", () => {
    const { record } = build(fixture({ source: true, dirty: true }));
    assert.equal(record.status, "blocked");
    assert.deepEqual(record.reasons, ["repository-not-clean"]);
  });

  check("RPC-reader a dirty deletion of a committed source member does not turn the source policy off", () => {
    const { record } = build(fixture({ source: true, dirtyDeleteMember: true }));
    assert.equal(record.status, "blocked");
    assert.deepEqual(record.reasons, ["repository-not-clean"]);
  });

  console.log(`\nrelease-preflight-cli: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
