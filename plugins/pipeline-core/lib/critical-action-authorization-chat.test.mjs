import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { after, test } from "node:test";

import { authorizeRecordedChatPush, authorizeRecordedPush } from "./critical-action-authorization.mjs";

const ROOT = mkdtempSync(join(process.cwd(), "scratch", "ha-chat-gg03-helper-"));
after(() => rmSync(ROOT, { recursive: true, force: true }));

function git(root, ...args) {
  return spawnSync("git", ["-C", root, "-c", "user.name=GG03", "-c", "user.email=gg03@example.invalid", ...args], { encoding: "utf8" });
}

function fixture(mode) {
  const root = mkdtempSync(join(ROOT, `${mode}-`));
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, "specs", "demo"), { recursive: true });
  git(root, "init", "--quiet");
  writeFileSync(join(root, "pipeline.user.yaml"), mode === "global"
    ? "schema: \"pipeline.user.v3\"\ngates:\n  human_approval: chat\n"
    : "schema: \"pipeline.user.v3\"\ngates:\n  push_approval: chat\n");
  // The legacy fixture has the old anchored policy with no waiver. This is
  // the real consumer migration case: chat must work without deleting it.
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify(mode === "global" ? {
    schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [],
  } : {
    schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"],
    trustAnchor: { keyReference: "historical-po-key", publicKeySha256: "a".repeat(64) },
  }) + "\n");
  const threat = "# GG03 threat model\n";
  writeFileSync(join(root, "specs", "demo", "threat-model.md"), threat);
  git(root, "add", "--", ".");
  git(root, "commit", "--quiet", "-m", "fixture");
  const commit = git(root, "rev-parse", "HEAD").stdout.trim();
  const tree = git(root, "rev-parse", "HEAD^{tree}").stdout.trim();
  const threatModel = { path: "specs/demo/threat-model.md", sha256: createHash("sha256").update(threat).digest("hex") };
  const approval = {
    approvedBy: "Human", approvedAt: "2099-01-01T00:00:00.000Z", forCommit: commit,
    remote: "origin", destination: "refs/heads/main", criticalProof: null, threatModel,
    criticalProofWaiver: mode === "global"
      ? { kind: "push", mode: "chat-attributed-unattested", source: "pipeline.user.yaml", reason: "gates.human_approval: chat (pipeline.user.yaml)" }
      : { kind: "push", mode: "chat", source: "pipeline.user.yaml", reason: "gates.push_approval: chat (pipeline.user.yaml)" },
    ...(mode === "global" ? { humanApproval: { kind: "push", mode: "chat-attributed-unattested" } } : {}),
  };
  const state = { pushApproval: { lastApproved: approval } };
  return { root, commit, tree, state, approval };
}

for (const mode of ["global", "legacy"]) {
  test(`authorizeRecordedChatPush accepts exact ${mode} chat attribution`, () => {
    const f = fixture(mode);
    const result = authorizeRecordedChatPush({ projectDir: f.root, anchorDir: f.root, state: f.state,
      candidate: { commit: f.commit, tree: f.tree }, remote: "origin", destination: "refs/heads/main" });
    assert.deepEqual(result, { authorized: true, code: "PUSH-PROOF-WAIVED", mode: mode === "global" ? "chat-attributed-unattested" : "chat" });
  });
}

test("authorizeRecordedChatPush rejects wrong binding and retains signature-only verifier", () => {
  const f = fixture("global");
  const wrongRemote = authorizeRecordedChatPush({ projectDir: f.root, anchorDir: f.root, state: f.state,
    candidate: { commit: f.commit, tree: f.tree }, remote: "upstream", destination: "refs/heads/main" });
  assert.equal(wrongRemote.code, "PUSH-PROOF-BINDING-MISMATCH");
  const signature = authorizeRecordedPush({ projectDir: f.root, anchorDir: f.root, state: f.state,
    candidate: { commit: f.commit, tree: f.tree }, remote: "origin", destination: "refs/heads/main", now: new Date().toISOString() });
  assert.equal(signature.authorized, false);
  assert.match(signature.code, /^PUSH-PROOF-(RECORD-INCOMPLETE|TRUST-ANCHOR)/u);
});
