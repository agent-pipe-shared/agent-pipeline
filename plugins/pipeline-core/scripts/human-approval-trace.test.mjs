// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeCriticalApproval } from "../lib/critical-action-authorization.mjs";
import { isSanctionedLifecycleCommand } from "../lib/guard/command-catalogue.mjs";

const script = fileURLToPath(new URL("./human-approval-trace.mjs", import.meta.url));
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
function repository() {
  const root = mkdtempSync(join(tmpdir(), "approval-trace-cli-"));
  git(root, "init", "-q"); git(root, "config", "user.email", "t@example.invalid"); git(root, "config", "user.name", "t");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [] })}\n`);
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "fixture");
  return { root, commit: git(root, "rev-parse", "HEAD") };
}
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("a candidate without any approval record is untraceable: the table names the break and the exit is 1", () => {
  const { root, commit } = repository(); const result = run("--repo", root);
  assert.equal(result.status, 1); assert.match(result.stdout, new RegExp(`candidate ${commit}`, "u")); assert.match(result.stdout, /NO-APPROVAL-RECORD/u); assert.match(result.stdout, /verdict: untraceable/u);
});

test("a chat-mode approval prints attribution-only and exits 0; the JSON form carries the typed verdict", () => {
  const { root, commit } = repository();
  const approval = { approvedBy: "Human", approvedAt: "2026-11-04T10:00:00.000Z", forCommit: commit, remote: "origin", destination: "refs/heads/main", threatModel: { path: "x.md", sha256: "a".repeat(64) }, criticalProof: null, criticalProofWaiver: { kind: "push", mode: "chat-attributed-unattested", source: "pipeline.user.yaml" } };
  assert.equal(writeCriticalApproval({ gitCommonDir: join(root, ".git"), kind: "push", approval }).ok, true);
  const table = run("--repo", root); assert.equal(table.status, 0); assert.match(table.stdout, /attribution-only/u); assert.match(table.stdout, /verdict: attribution-only/u);
  const json = JSON.parse(run("--repo", root, "--format", "json", "--commit", commit).stdout); assert.equal(json.status, "attribution-only"); assert.equal(json.rows[0].proofSha256, null);
});

test("the report is written create-only inside the repository and never anywhere else", () => {
  const { root } = repository();
  assert.equal(run("--repo", root, "--out", "scratch/trace.json").status, 1); assert.ok(existsSync(join(root, "scratch", "trace.json")));
  assert.equal(JSON.parse(readFileSync(join(root, "scratch", "trace.json"), "utf8")).schema, "pipeline.human-approval-trace.v1");
  for (const bad of ["scratch/trace.json", "../escape.json", "/abs.json"]) { const again = run("--repo", root, "--out", bad); assert.equal(again.status, 2, bad); }
});

test("the guard admits exactly the read-only argv shapes and never the --out write", () => {
  const { root, commit } = repository();
  const admitted = (...args) => isSanctionedLifecycleCommand(`node ${script} ${args.join(" ")}`, root);
  assert.equal(admitted("--repo", root), true); assert.equal(admitted("--repo", root, "--commit", commit, "--format", "json"), true);
  for (const bad of [["--repo", root, "--out", "scratch/x.json"], ["--repo", `${root}-other`], ["--repo", root, "--format", "xml"], ["--repo", root, "--commit", "HEAD"], ["--repo", root, "--format", "json", "--format", "table"], ["--repo"]]) assert.equal(admitted(...bad), false, bad.join(" "));
});

test("bad arguments are a command error (2), not a verdict", () => {
  const { root } = repository();
  for (const args of [[], ["--repo"], ["--repo", root, "--format", "xml"], ["--repo", root, "--commit", "HEAD"], ["--repo", root, "--bogus", "x"]]) assert.equal(run(...args).status, 2, args.join(" "));
});
