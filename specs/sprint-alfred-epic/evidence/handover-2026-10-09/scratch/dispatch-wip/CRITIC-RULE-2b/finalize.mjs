import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const REC = "evidence/dispatch-record-CRITIC-RULE-2b-20261009.json";
const REPORT = "scratch/dispatch-wip/CRITIC-RULE-2b/report.txt";
const [mode, ...rest] = process.argv.slice(2);
const rec = JSON.parse(readFileSync(REC, "utf8"));
const changedOf = (sha) => spawnSync("git", ["show", "--name-only", "--format=", sha], { encoding: "utf8" }).stdout.split("\n").map((s) => s.trim()).filter(Boolean);
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const union = (shas) => [...new Set(shas.flatMap(changedOf))];

if (mode === "checkpoint") {
  const [toolUses, ...shas] = rest;
  const text = "Interim checkpoint: commit(s) landed, final report pending. independent review: pending.";
  rec.commits = shas;
  rec.outcome = "committed-pending-report";
  rec.report = { text, changedFiles: union(shas) };
  rec.resultSha256 = sha256(text);
  rec.log.push({ phase: "checkpoint after commit " + shas.join(","), toolUses: Number(toolUses) });
} else if (mode === "final") {
  const [outcome, toolUses, ...shas] = rest;
  const text = readFileSync(REPORT, "utf8");
  rec.commits = shas;
  rec.outcome = outcome;
  if (outcome === "stopped-without-commit") rec.outcomeClassification = { schema: "pipeline.dispatch-outcome-classification.v1", kind: "stopped-without-commit" };
  const uncommitted = ["harness/review-protocol.md", "roles/critic.md", "roles/elephant.md", "plugins/pipeline-core/skills/critic-review/SKILL.md", "docs/adr/0003-role-implementation-subagents.md", "docs/adr/0014-critic-contract.md", "templates/prompts/critic-review.md", "plugins/pipeline-core/templates/prompts/critic-review.md", "templates/prompts/goldfish-task.md", "plugins/pipeline-core/templates/prompts/goldfish-task.md", "policies/model-policy.md", "docs/state.md", "backlog/items/2026-10-09-opus-critic-only-batched-for-architecture-and-security.md"];
  rec.report = { text, changedFiles: shas.length ? union(shas) : uncommitted };
  rec.resultSha256 = sha256(text);
  rec.log.push({ phase: "final: outcome " + outcome, toolUses: Number(toolUses) });
} else if (mode === "dry") {
  console.log(JSON.stringify({ changedOfHead: changedOf("HEAD").slice(0, 3) }));
  process.exit(0);
} else {
  console.error("usage: finalize.mjs checkpoint <toolUses> <sha>... | final <outcome> <toolUses> <sha>...");
  process.exit(2);
}
writeFileSync(REC, JSON.stringify(rec, null, 2) + "\n");
console.log(JSON.stringify({ outcome: rec.outcome, commits: rec.commits, changedFiles: rec.report.changedFiles.length, resultSha256: rec.resultSha256 }));
