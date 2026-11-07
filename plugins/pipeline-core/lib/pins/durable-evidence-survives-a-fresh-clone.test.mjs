// SPDX-License-Identifier: SUL-1.0
// Pin for Candidate 20, G20-29 (AC-108): dispatch records, briefing digests, the work-verify result and the signed approval
// proof reference survive a fresh clone. The private places (the git-ignored /evidence/ and /scratch/, the private approval store)
// are exactly what a clone does not have; the tracked audit/ mirror and its index are what it must have.
// Real modules, no mocks of the behaviour under test. The approval source is injected through the module's documented `trace`
// seam with a REAL Ed25519 proof (generated here), so the stored proof is cryptographically checkable; the default source
// (the read-only human-approval trace) is exercised on a fixture that has no approvals.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { reportSha256, validateDispatchRecord } from "../dispatch-record.mjs";
import { canonical } from "../po-approval-proof.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../critic-skip-decision.mjs";
import { writeDispatchRecordObject, writeOrchestratorAttestedDispatchRecord } from "../../scripts/dispatch-record-write.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "..", "scripts", "durable-evidence.mjs");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const load = () => import("../durable-evidence.mjs");
const SENTINEL = "PRIVATE-REPORT-SENTINEL-do-not-persist";

const trigger = { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } };
const skip = { schema: CRITIC_SKIP_SCHEMA, trigger: { ...trigger, rigorLevel: 0 }, appliedRow: "T5", reason: "fast path" };
const required = { schema: CRITIC_REQUIRED_SCHEMA, trigger, appliedRow: "T3" };
const AUTHORED_KIND = { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" };
const ATTESTED_KIND = { schema: "pipeline.dispatch-outcome-classification.v1", kind: "orchestrator-attested" };
const ATT_COMMIT = "c".repeat(40);
const v3 = (overrides = {}) => ({ schema: "pipeline.dispatch-record.v3", taskId: "FIX-V3", agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
  rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: "b".repeat(40), resultSha256: "d".repeat(64), outcome: "completed", commits: ["b".repeat(40)],
  log: [{ phase: "done", toolUseCount: 4 }], report: { text: `Done. ${SENTINEL}`, changedFiles: ["src/x.mjs"] }, criticSkip: skip, ...overrides });
function hostObserved() {
  const text = `Authored. ${SENTINEL}`;
  const { criticSkip: _skip, ...rest } = v3({ taskId: "FIX-HOST", candidateCommit: "e".repeat(40), commits: ["e".repeat(40)] });
  return { ...rest, schema: "pipeline.dispatch-record.v4", runner: "claude", resultSha256: reportSha256(text), report: { text, changedFiles: ["src/y.mjs"] }, criticRequired: required, outcomeClassification: AUTHORED_KIND };
}
function attested() {
  const text = `Orchestrator hand-back. ${SENTINEL}`;
  const { criticSkip: _skip, ...rest } = v3({ taskId: "FIX-ATT", candidateCommit: ATT_COMMIT, commits: [ATT_COMMIT] });
  return { ...rest, schema: "pipeline.dispatch-record.v4", outcome: "completed-orchestrator-attested", resultSha256: reportSha256(text), report: { text, changedFiles: ["src/z.mjs"] },
    log: [{ phase: "orchestrator-attested", toolUseCount: 0, note: "tool-use count and worker model not observed" }], criticRequired: required, outcomeClassification: ATTESTED_KIND,
    attestation: { schema: "pipeline.dispatch-orchestrator-attestation.v1", assurance: "orchestrator-attested", briefingSha256: "e".repeat(64), handbackSha256: "f".repeat(64) } };
}
const gitReaders = () => ({
  readCommitMessage: () => "feat(x): delivered\n\nDispatch: FIX-ATT (goldfish)\nAI-Assisted: true\n",
  readChangedPaths: () => ["src/z.mjs"], readParents: () => ["9".repeat(40)] });

const git = (root, ...args) => execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { encoding: "utf8" }).trim();
function signedRow(head) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" });
  const intentSha256 = sha("fixture-signed-payload");
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: "fixture-key", publicKey: publicPem,
    signatureBase64: sign(null, Buffer.from(intentSha256, "utf8"), privateKey).toString("base64") };
  return { privateBody: privateKey.export({ type: "pkcs8", format: "pem" }).split("\n")[1], proof,
    row: { kind: "push", source: "private-store:push/0001-abc.json", mode: "signature", forCommit: head, approvedAt: "2026-11-07T10:00:00.000Z", by: "PO",
      intentSha256, proofSha256: sha(canonical(proof)), keyReference: "fixture-key", publicKeySha256: sha(publicPem), proof, verdict: "traced", break: null } };
}

/** A project shaped like an onboarded consumer: /evidence/ and /scratch/ are git-ignored, everything else is tracked. */
function project() {
  const root = mkdtempSync(join(tmpdir(), "durable-evidence-"));
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, ".gitignore"), "/scratch/\n/evidence/\n/project/pipeline-state.json\n");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, "add", "--", ".gitignore", "README.md");
  git(root, "commit", "-q", "-m", "chore: seed");
  mkdirSync(join(root, "evidence")); mkdirSync(join(root, "scratch"));
  writeDispatchRecordObject({ repoRoot: root, target: "evidence/dispatch-record-FIX-V3.json", record: v3() });
  writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-FIX-ATT.json", record: attested() }, gitReaders());
  writeFileSync(join(root, "evidence/dispatch-record-FIX-HOST.json"), `${JSON.stringify(validateDispatchRecord(hostObserved()), null, 2)}\n`);
  writeFileSync(join(root, "evidence/dispatch-record-FIX-OPEN.json"), `${JSON.stringify(v3({ taskId: "FIX-OPEN", outcome: "in-progress", commits: [], log: [], report: null, resultSha256: null }), null, 2)}\n`);
  writeFileSync(join(root, "evidence/verify-latest.json"), `${JSON.stringify({ schema: "pipeline.verify-evidence.v0", project: "fixture", command: "node harness/scripts/verify.mjs --mode candidate",
    commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}"), candidate: { binding: "exact" }, startedAt: "2026-11-07T09:00:00.000Z", finishedAt: "2026-11-07T09:05:00.000Z",
    steps: [{ name: "unit", exitCode: 0, durationMs: 5, reused: false }, { name: "lint", exitCode: 0, durationMs: 2, reused: false }] }, null, 2)}\n`);
  writeFileSync(join(root, "scratch/briefing-host.md"), `# Briefing\n\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify({ dispatchId: "FIX-HOST", runner: "claude" })}\n-->\nbody\n`);
  const signed = signedRow(git(root, "rev-parse", "HEAD"));
  return { root, ...signed, trace: () => ({ rows: [signed.row] }) };
}
const cleanup = (...roots) => { for (const root of roots) rmSync(root, { recursive: true, force: true }); };
const auditFiles = (root) => readdirSync(join(root, "audit")).filter((name) => name.endsWith(".json"));
const codes = (result) => result.findings.map((finding) => finding.code);

test("D1 sync projects every completed dispatch, the work-verify and the approval into tracked audit/ files with the assurance label", async () => {
  const { syncDurableEvidence } = await load();
  const fixture = project();
  try {
    const result = syncDurableEvidence({ root: fixture.root, trace: fixture.trace });
    assert.equal(result.index.entries, 5, JSON.stringify(result));
    const read = (name) => JSON.parse(readFileSync(join(fixture.root, "audit", name), "utf8"));
    const host = read("dispatch-FIX-HOST.json");
    assert.equal(host.assurance, "host-observed"); assert.equal(host.runner, "claude"); assert.equal(host.model, "claude-sonnet-5");
    assert.equal(host.effort, "medium"); assert.equal(host.candidateCommit, "e".repeat(40)); assert.deepEqual(host.commits, ["e".repeat(40)]);
    assert.equal(host.outcome, "completed"); assert.equal(host.source.sha256, sha(readFileSync(join(fixture.root, "evidence/dispatch-record-FIX-HOST.json"))));
    assert.equal(host.briefing.sha256, sha(readFileSync(join(fixture.root, "scratch/briefing-host.md"))), "a briefing found for the dispatch id is digest-bound");
    assert.deepEqual(host.changedFiles, ["src/y.mjs"]);
    const att = read("dispatch-FIX-ATT.json");
    assert.equal(att.assurance, "orchestrator-attested"); assert.equal(att.briefing.sha256, "e".repeat(64)); assert.equal(att.briefing.source, "attestation");
    const legacy = read("dispatch-FIX-V3.json");
    assert.equal(legacy.assurance, "recorded-unlabelled"); assert.equal(legacy.briefing.sha256, null);
    assert.equal(existsSync(join(fixture.root, "audit/dispatch-FIX-OPEN.json")), false, "an in-progress record is not a completed dispatch");
    const verify = auditFiles(fixture.root).find((name) => name.startsWith("verify-"));
    const entry = read(verify);
    assert.equal(entry.commit, git(fixture.root, "rev-parse", "HEAD")); assert.equal(entry.passed, true); assert.equal(entry.stepCount, 2); assert.deepEqual(entry.failedSteps, []);
    assert.equal(entry.source.sha256, sha(readFileSync(join(fixture.root, "evidence/verify-latest.json"))));
    const approval = read(auditFiles(fixture.root).find((name) => name.startsWith("approval-")));
    assert.equal(approval.kind, "push"); assert.equal(approval.proofSha256, fixture.row.proofSha256); assert.equal(approval.intentSha256, fixture.row.intentSha256);
    assert.equal(approval.proof.signatureBase64, fixture.proof.signatureBase64);
    const index = JSON.parse(readFileSync(join(fixture.root, "audit/index.json"), "utf8"));
    assert.deepEqual(index.entries.map((e) => e.kind).sort(), ["approval", "dispatch", "dispatch", "dispatch", "verify"]);
  } finally { cleanup(fixture.root); }
});

test("D2 a fresh clone plus the auditor index reaches every record and the proof reference; the private places are absent there", async () => {
  const { syncDurableEvidence, checkDurableEvidence } = await load();
  const fixture = project();
  const clone = `${fixture.root}-clone`;
  try {
    syncDurableEvidence({ root: fixture.root, trace: fixture.trace });
    const before = checkDurableEvidence({ root: fixture.root });
    assert.ok(codes(before).includes("AUDIT-NOT-TRACKED"), "uncommitted audit files are not durable yet");
    assert.ok(before.findings.every((finding) => /\S/u.test(finding.repair)), "every finding names a runnable repair");
    git(fixture.root, "add", "--", "audit");
    git(fixture.root, "commit", "-q", "-m", "docs(audit): mirror the dispatch evidence");
    execFileSync("git", ["clone", "-q", fixture.root, clone]);
    assert.equal(existsSync(join(clone, "evidence")), false, "the clone has no git-ignored evidence/");
    assert.equal(existsSync(join(clone, "scratch")), false);
    const result = checkDurableEvidence({ root: clone });
    assert.deepEqual(result.findings, []); assert.equal(result.ok, true);
    assert.deepEqual(result.entries.map((e) => e.kind).sort(), ["approval", "dispatch", "dispatch", "dispatch", "verify"]);
    for (const entry of result.entries) assert.equal(sha(readFileSync(join(clone, entry.path))), entry.sha256);
    const approval = result.entries.find((e) => e.kind === "approval");
    const stored = JSON.parse(readFileSync(join(clone, approval.path), "utf8"));
    assert.equal(stored.proofSha256, fixture.row.proofSha256);
    assert.equal(sha(canonical(stored.proof)), stored.proofSha256, "the tracked public proof hashes to the referenced digest");
  } finally { cleanup(fixture.root, clone); }
});

test("D3 nothing private is in the tracked files: no report text, no absolute host path, no private key, no transcript field", async () => {
  const { syncDurableEvidence } = await load();
  const fixture = project();
  try {
    syncDurableEvidence({ root: fixture.root, trace: fixture.trace });
    for (const name of [...auditFiles(fixture.root)]) {
      const text = readFileSync(join(fixture.root, "audit", name), "utf8");
      assert.ok(!text.includes(SENTINEL), `${name} carries report prose`);
      assert.ok(!text.includes(fixture.root) && !text.includes(tmpdir()), `${name} carries an absolute host path`);
      assert.ok(!text.includes(fixture.privateBody) && !/PRIVATE KEY/u.test(text), `${name} carries private key material`);
      assert.ok(!/"(report|text|transcript|prompt|privateKey)"/u.test(text), `${name} carries a private field`);
    }
  } finally { cleanup(fixture.root); }
});

test("D4 check names the exact code and a runnable repair for each way the mirror breaks", async () => {
  const { syncDurableEvidence, checkDurableEvidence } = await load();
  const fixture = project();
  try {
    syncDurableEvidence({ root: fixture.root, trace: fixture.trace });
    git(fixture.root, "add", "--", "audit"); git(fixture.root, "commit", "-q", "-m", "docs(audit): mirror");
    const clean = checkDurableEvidence({ root: fixture.root }); assert.deepEqual(clean.findings, []);
    const attPath = join(fixture.root, "audit/dispatch-FIX-ATT.json");
    const original = readFileSync(attPath, "utf8");
    writeFileSync(attPath, original.replace('"FIX-ATT"', '"FIX-ATT" '));
    assert.ok(codes(checkDurableEvidence({ root: fixture.root })).includes("AUDIT-DIGEST-MISMATCH"));
    writeFileSync(attPath, original);
    rmSync(attPath);
    assert.ok(codes(checkDurableEvidence({ root: fixture.root })).includes("AUDIT-ENTRY-MISSING"));
    writeFileSync(attPath, original);
    const verifyName = auditFiles(fixture.root).find((name) => name.startsWith("verify-"));
    writeFileSync(join(fixture.root, "audit", verifyName), readFileSync(join(fixture.root, "audit", verifyName), "utf8").replace('"node harness', '"node /home/someone/harness'));
    const polluted = checkDurableEvidence({ root: fixture.root });
    assert.ok(codes(polluted).includes("AUDIT-PRIVATE-CONTENT") || codes(polluted).includes("AUDIT-DIGEST-MISMATCH"));
    git(fixture.root, "checkout", "-q", "--", "audit");
    const approvalName = auditFiles(fixture.root).find((name) => name.startsWith("approval-"));
    const approvalPath = join(fixture.root, "audit", approvalName);
    const stored = JSON.parse(readFileSync(approvalPath, "utf8"));
    stored.proof.signatureBase64 = Buffer.from("not-the-signature").toString("base64");
    writeFileSync(approvalPath, `${JSON.stringify(stored, null, 2)}\n`);
    assert.ok(codes(checkDurableEvidence({ root: fixture.root })).some((code) => ["AUDIT-DIGEST-MISMATCH", "AUDIT-PROOF-INVALID"].includes(code)));
    git(fixture.root, "checkout", "-q", "--", "audit");
    writeFileSync(join(fixture.root, "audit/dispatch-STRAY.json"), "{}\n");
    assert.ok(codes(checkDurableEvidence({ root: fixture.root })).includes("AUDIT-INDEX-STALE"));
    rmSync(join(fixture.root, "audit/dispatch-STRAY.json"));
    writeFileSync(join(fixture.root, "evidence/dispatch-record-FIX-LATE.json"), `${JSON.stringify(v3({ taskId: "FIX-LATE" }), null, 2)}\n`);
    const unsynced = checkDurableEvidence({ root: fixture.root });
    const gap = unsynced.findings.find((finding) => finding.code === "AUDIT-UNSYNCED");
    assert.ok(gap, "a completed dispatch with no mirror is a gap"); assert.match(gap.repair, /durable-evidence\.mjs sync --root /u);
    rmSync(join(fixture.root, "audit/index.json"));
    assert.ok(codes(checkDurableEvidence({ root: fixture.root })).includes("AUDIT-INDEX-MISSING"));
  } finally { cleanup(fixture.root); }
});

test("D5 sync is idempotent, never rewrites an existing entry, and a conflicting entry refuses before any write", async () => {
  const { syncDurableEvidence } = await load();
  const fixture = project();
  try {
    const first = syncDurableEvidence({ root: fixture.root, trace: fixture.trace });
    const second = syncDurableEvidence({ root: fixture.root, trace: fixture.trace });
    assert.deepEqual(second.written, []); assert.equal(second.unchanged.length, first.written.length - 1, "every entry file is unchanged; only the index is rederived");
    const before = Object.fromEntries(auditFiles(fixture.root).map((name) => [name, readFileSync(join(fixture.root, "audit", name), "utf8")]));
    writeFileSync(join(fixture.root, "evidence/dispatch-record-FIX-LATE.json"), `${JSON.stringify(v3({ taskId: "FIX-LATE" }), null, 2)}\n`);
    writeFileSync(join(fixture.root, "audit/dispatch-FIX-V3.json"), `${JSON.stringify({ ...JSON.parse(before["dispatch-FIX-V3.json"]), model: "other" }, null, 2)}\n`);
    assert.throws(() => syncDurableEvidence({ root: fixture.root, trace: fixture.trace }),
      (error) => error?.code === "AUDIT-ENTRY-DIFFERS" && /remove audit\/dispatch-FIX-V3\.json/u.test(error.message));
    assert.equal(existsSync(join(fixture.root, "audit/dispatch-FIX-LATE.json")), false, "a refused sync leaves no new file");
    assert.deepEqual(readdirSync(join(fixture.root, "audit")).filter((name) => name.startsWith(".")), [], "and no temporary file");
  } finally { cleanup(fixture.root); }
});

test("D6 the CLI syncs and checks from the project root with a typed exit and a repair on stderr", async () => {
  await load();
  const fixture = project();
  try {
    const run = (...args) => spawnSync(process.execPath, [CLI, ...args, "--root", fixture.root], { encoding: "utf8" });
    const bare = run("check");
    assert.equal(bare.status, 2, bare.stderr); assert.match(bare.stderr, /AUDIT-INDEX-MISSING/u); assert.match(bare.stderr, /repair: .*durable-evidence\.mjs sync --root /u);
    const synced = run("sync");
    assert.equal(synced.status, 0, synced.stderr); assert.equal(JSON.parse(synced.stdout).index.entries >= 4, true, "dispatches and the verify result are mirrored; no approval is invented");
    const refused = spawnSync(process.execPath, [CLI, "frobnicate", "--root", fixture.root], { encoding: "utf8" });
    assert.equal(refused.status, 2); assert.match(refused.stderr, /usage: durable-evidence\.mjs/u);
  } finally { cleanup(fixture.root); }
});
