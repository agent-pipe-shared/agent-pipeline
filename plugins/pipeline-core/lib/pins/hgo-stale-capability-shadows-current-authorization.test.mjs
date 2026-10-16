// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.hgo-stale-capability-shadows-current-authorization (AC-202).
// Every acceptance point of the item is exercised through the real
// consumeHumanGuardOverride() with real capability/audit authentication. The only
// seam used is the module's documented attended-chat injection (isattyFn/readLineFn),
// the same one the adjacent human-guard-override-capability-scan.test.mjs uses.
// PIPELINE_HGO_PIN_MODULE (a file URL) lets a RED run target a scratch mirror of the
// production function; it is never set by the real check.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../po-approval-proof.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, "..", "..");
const repoRoot = join(plugin, "..", "..");
const mod = await import(process.env.PIPELINE_HGO_PIN_MODULE ?? new URL("../human-guard-override.mjs", import.meta.url).href);
const { recordHumanGuardDenial, planHumanGuardOverride, prepareHumanGuardOverrideAuthorization,
  authorizeHumanGuardOverrideBySignature, HGO_SIGNATURE_REASON, consumeHumanGuardOverride, verifyHumanGuardOverrideAudit } = mod;

const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }];
const input = { file_path: "notes.md", content: "same exact tool input\n" };
// Capabilities are armed through the signature route (fixture Ed25519 key + committed
// fixture trust anchor): the attended chat gate refuses without a human terminal.
const sigPair = generateKeyPairSync("ed25519");
const sigPublicKey = sigPair.publicKey.export({ type: "spki", format: "pem" });
const SIG_KEY_REFERENCE = "hgo-pin-test-key";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const PLAN_SENTINEL = sha("pipeline.human-guard-override-signature-plan.v1");
const SPEC_SENTINEL = sha("pipeline.human-guard-override-signature-spec.v1");
const scratchBase = join(repoRoot, "scratch", "hgo-pin-fixtures");

function git(root, ...args) {
  // The ceiling keeps git from ever discovering a repository above the fixture.
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root) } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
// A native capability's repository comparison ignores statusSha256, so real drift
// needs a real commit (head and tree move) inside the fixture's own git root.
let driftCounter = 0;
function driftByCommit(root) {
  writeFileSync(join(root, `drift-${++driftCounter}.md`), "real commit drift\n");
  git(root, "add", `drift-${driftCounter}.md`);
  git(root, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture drift");
}
function fixture() {
  mkdirSync(scratchBase, { recursive: true });
  const root = mkdtempSync(join(scratchBase, "f-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: SIG_KEY_REFERENCE, publicKeySha256: sha(sigPublicKey) },
  }));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}
function arm(root, now, toolInput = input) {
  const scriptPath = join(plugin, "scripts", "guard-human-override.mjs");
  const common = { rootDir: root, pluginRoot: plugin, toolName: "Write", toolInput, denials };
  const req = recordHumanGuardDenial({ ...common, nowMs: now, ttlMs: 100000 });
  const plan = planHumanGuardOverride({ ...common, requestSha256: req.requestSha256, scriptPath, nowMs: now + 100 });
  const prep = prepareHumanGuardOverrideAuthorization({ ...common, requestSha256: req.requestSha256,
    planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, scriptPath, nowMs: now + 200 });
  const intent = createPoApprovalIntent({ kind: "guard-override", featureId: "human-guard-override",
    planSha256: PLAN_SENTINEL, specSha256: SPEC_SENTINEL, candidate: { commit: plan.repository.head, tree: plan.repository.tree },
    policyRevision: "human-guard-override-signature-v1", subjectSha256: prep.selectionSha256, decision: "authorize" });
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: SIG_KEY_REFERENCE,
    publicKey: sigPublicKey, signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), sigPair.privateKey).toString("base64") };
  const result = authorizeHumanGuardOverrideBySignature({ rootDir: root, pluginRoot: plugin, requestSha256: req.requestSha256,
    planSha256: plan.planSha256, proof, scriptPath, nowMs: now + 300 });
  assert.equal(result.status, "armed");
  return plan.planSha256;
}
function consume(root, nowMs = 9000, toolInput = input) {
  return consumeHumanGuardOverride({ rootDir: root, pluginRoot: plugin, toolName: "Write", toolInput, denials, nowMs });
}
function store(root) {
  return join(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"), "agent-pipeline", "human-guard-overrides");
}
function audit(root) {
  return readFileSync(join(store(root), "audit.jsonl"), "utf8").trim().split("\n").map((s) => JSON.parse(s).event);
}
function cap(root, sha) { return JSON.parse(readFileSync(join(store(root), "capabilities", `${sha}.json`), "utf8")); }
function locks(root) { return readdirSync(join(store(root), "locks")); }
// Two authentic matching capabilities with real worktree drift between them.
// `order` selects whether the stale (first-armed) record sorts lexically first or last.
function pair(order) {
  for (let i = 0; i < 40; i++) {
    const root = fixture();
    try {
      const head = git(root, "rev-parse", "HEAD");
      const stale = arm(root, 1000);
      driftByCommit(root);
      const moved = git(root, "rev-parse", "HEAD");
      const current = arm(root, 5000);
      assert.equal(git(root, "rev-list", "--count", `${head}..HEAD`), "1", "HEAD moved by exactly one commit");
      assert.equal(git(root, "rev-parse", "HEAD"), moved, "the current capability was armed after that commit");
      assert.ok(JSON.stringify(cap(root, current)).includes(moved), "current capability binds the moved HEAD");
      assert.ok(!JSON.stringify(cap(root, stale)).includes(moved), "stale capability predates the moved HEAD");
      if (order === "stale-first" ? stale < current : current < stale) return { root, stale, current };
    } catch (e) { rmSync(root, { recursive: true, force: true }); throw e; }
    rmSync(root, { recursive: true, force: true });
  }
  throw new Error("bounded fixture generation did not produce the requested digest order");
}
function withRoot(root, fn) { try { return fn(); } finally { rmSync(root, { recursive: true, force: true }); } }

test("AC1: stale authenticated match sorted first does not shadow the current one; stale rejected+audited, locks closed", () => {
  const { root, stale, current } = pair("stale-first");
  withRoot(root, () => {
    assert.ok(stale < current);
    assert.equal(cap(root, stale).toolInputSha256, cap(root, current).toolInputSha256);
    assert.ok(new Date(cap(root, stale).expiresAt).getTime() > 9000, "stale is unexpired");
    const result = consume(root);
    assert.equal(result.status, "consumed");
    assert.equal(result.planSha256, current);
    const events = audit(root);
    assert.deepEqual(events.filter((e) => e.type === "rejected").map((e) => ({ plan: e.planSha256, code: e.code, checks: e.driftedChecks })),
      [{ plan: stale, code: "HGO-DRIFT", checks: ["repository"] }]);
    assert.equal(events.filter((e) => e.type === "consumed").length, 1);
    assert.equal(cap(root, stale).status, "armed", "a drifted record is never consumed");
    assert.equal(cap(root, current).status, "consumed");
    assert.deepEqual(locks(root), []);
    assert.ok(verifyHumanGuardOverrideAudit({ rootDir: root }));
  });
});

test("AC2: selection is by currency, not by order (current sorted first is consumed, stale never touched)", () => {
  const { root, stale, current } = pair("current-first");
  withRoot(root, () => {
    assert.ok(current < stale);
    const result = consume(root);
    assert.equal(result.status, "consumed");
    assert.equal(result.planSha256, current);
    assert.equal(audit(root).some((e) => e.type === "rejected"), false);
    assert.equal(cap(root, stale).status, "armed");
    assert.deepEqual(locks(root), []);
  });
});

test("AC3: stale-only candidates keep typed HGO-DRIFT and are never consumed", () => {
  const root = fixture();
  withRoot(root, () => {
    const stale = arm(root, 1000);
    driftByCommit(root);
    assert.deepEqual(consume(root), { status: "replan", code: "HGO-DRIFT" });
    assert.equal(cap(root, stale).status, "armed");
    assert.equal(audit(root).some((e) => e.type === "consumed"), false);
    assert.deepEqual(locks(root), []);
  });
});

test("AC4: expired-only candidates keep typed HGO-EXPIRED and are never consumed", () => {
  const root = fixture();
  withRoot(root, () => {
    const only = arm(root, 1000);
    const afterExpiry = new Date(cap(root, only).expiresAt).getTime() + 1;
    assert.deepEqual(consume(root, afterExpiry), { status: "replan", code: "HGO-EXPIRED" });
    assert.equal(audit(root).filter((e) => e.type === "expired").length, 1);
    assert.equal(cap(root, only).status, "armed");
    assert.equal(audit(root).some((e) => e.type === "consumed"), false);
  });
});

test("AC5: mixed stale + expired precedence is explicit: HGO-DRIFT wins, nothing consumed", () => {
  const root = fixture();
  withRoot(root, () => {
    const expiring = arm(root, 1000);
    const e1 = new Date(cap(root, expiring).expiresAt).getTime();
    const later = arm(root, e1 + 1000); // armed on the same clean tree, outlives `expiring`
    const e2 = new Date(cap(root, later).expiresAt).getTime();
    driftByCommit(root);
    const now = e1 + 2000;
    assert.ok(e1 < now && now < e2, "first expired, second unexpired");
    assert.deepEqual(consume(root, now), { status: "replan", code: "HGO-DRIFT" });
    const events = audit(root);
    assert.equal(events.filter((e) => e.type === "expired").length, 1);
    assert.equal(events.filter((e) => e.type === "rejected").length, 1);
    assert.equal(events.some((e) => e.type === "consumed"), false);
    assert.deepEqual(locks(root), []);
  });
});

test("AC6: corrupt audit stays a global HGO-AUDIT failure even with a later current record", () => {
  const { root } = pair("stale-first");
  withRoot(root, () => {
    const path = join(store(root), "audit.jsonl");
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const first = JSON.parse(lines[0]);
    first.event.at = "2000-01-01T00:00:00.000Z";
    lines[0] = JSON.stringify(first);
    writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
    assert.deepEqual(consume(root), { status: "invalid", code: "HGO-AUDIT" });
    for (const name of readdirSync(join(store(root), "capabilities"))) {
      assert.equal(JSON.parse(readFileSync(join(store(root), "capabilities", name), "utf8")).status, "armed");
    }
    assert.deepEqual(locks(root), []);
  });
});

test("AC7: invalid capability files are still skipped and recorded; the current record is consumed", () => {
  const { root, current } = pair("stale-first");
  withRoot(root, () => {
    const bogus = "0".repeat(64);
    writeFileSync(join(store(root), "capabilities", `${bogus}.json`), "{not json", { mode: 0o600 });
    const result = consume(root);
    assert.equal(result.status, "consumed");
    assert.equal(result.planSha256, current);
    assert.ok(result.skippedInvalidRecords.some((r) => r.planSha256 === bogus));
  });
});

test("AC8: tool-input binding is still enforced per candidate (different input is not consumed)", () => {
  const { root, stale, current } = pair("stale-first");
  withRoot(root, () => {
    const result = consume(root, 9000, { file_path: "notes.md", content: "a different tool input\n" });
    assert.equal(result.status, "replan");
    assert.notEqual(result.status, "consumed");
    assert.equal(cap(root, current).status, "armed");
    assert.equal(cap(root, stale).status, "armed");
    assert.equal(audit(root).some((e) => e.type === "consumed"), false);
  });
});
