#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkStateBudgets } from "./check-state-budgets.mjs";

const roots = [];
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}
function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}
function fixture({ humanBytes = 8192, machineBytes = 7168, archive = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "state-budgets-"));
  roots.push(root);
  write(root, "docs/state.md", "h".repeat(humanBytes));
  write(root, ".claude/pipeline-state.json", "m".repeat(machineBytes));
  write(root, "harness/scripts/verify.mjs", "verify\n");
  write(root, "plugins/pipeline-core/hooks/guard-push.mjs", "guard\n");
  if (archive) write(root, "docs/state-archive/history.md", "historical evidence\n");
  const metadata = {
    schema: "pipeline.artifact-lifecycle.v1",
    budgets: {
      normalBootstrapMaxBytes: 15360,
      operationalHeadMaxBytes: 8192,
      bootstrapPaths: ["docs/state.md", ".claude/pipeline-state.json"],
      archivePaths: archive ? ["docs/state-archive/history.md"] : [],
      protectedPaths: ["harness/scripts/verify.mjs", "plugins/pipeline-core/hooks/guard-push.mjs"],
    },
    status: { humanStatePath: "docs/state.md", machineStatePath: ".claude/pipeline-state.json" },
  };
  const result = { artifactLifecycle: metadata };
  const writeResult = () => write(root, "specs/result.md", `\`\`\`pipeline-result\n${JSON.stringify(result)}\n\`\`\`\n`);
  writeResult();
  return { root, metadata, writeResult };
}

{
  const { root } = fixture();
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB01 accepts exact 8,192-byte state and 15,360-byte bootstrap boundaries", outcome.ok, outcome.findings.join("; "));
}
{
  const { root } = fixture({ humanBytes: 8193, machineBytes: 7167 });
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB02 rejects a human hot head above its exact boundary", !outcome.ok && outcome.findings.some((f) => f.includes("human state head is 8193")), outcome.findings.join("; "));
}
{
  const { root } = fixture({ humanBytes: 7167, machineBytes: 8193 });
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB03 rejects a machine hot head above its exact boundary", !outcome.ok && outcome.findings.some((f) => f.includes("machine state head is 8193")), outcome.findings.join("; "));
}
{
  const { root } = fixture({ humanBytes: 8192, machineBytes: 7169 });
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB04 rejects a bootstrap total above its exact boundary", !outcome.ok && outcome.findings.some((f) => f.includes("normal bootstrap is 15361")), outcome.findings.join("; "));
}
{
  const { root, metadata, writeResult } = fixture();
  metadata.budgets.archivePaths = ["docs/state.md"];
  writeResult();
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB05 rejects treating the active hot head as an archive rotation", !outcome.ok && outcome.findings.some((f) => f.includes("archive must not")), outcome.findings.join("; "));
}
{
  const { root, metadata, writeResult } = fixture();
  metadata.budgets.archivePaths = [];
  writeResult();
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB06 requires a retained non-canonical archive", !outcome.ok && outcome.findings.some((f) => f.includes("archivePaths must preserve")), outcome.findings.join("; "));
}
{
  const { root, metadata, writeResult } = fixture();
  metadata.budgets.protectedPaths = ["harness/scripts/verify.mjs"];
  writeResult();
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB07 preserves the guard/Verify protected-depth declaration", !outcome.ok && outcome.findings.some((f) => f.includes("guard-push.mjs")), outcome.findings.join("; "));
}
{
  const { root, metadata, writeResult } = fixture();
  metadata.budgets.bootstrapPaths = ["docs/state.md"];
  writeResult();
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB08 prevents omitting a canonical state head from the normal bootstrap budget", !outcome.ok && outcome.findings.some((f) => f.includes("canonical normal bootstrap set")), outcome.findings.join("; "));
}
{
  const { root, metadata, writeResult } = fixture();
  write(root, "tiny/human.md", "tiny\n");
  write(root, "tiny/machine.json", "{}\n");
  metadata.status.humanStatePath = "tiny/human.md";
  metadata.status.machineStatePath = "tiny/machine.json";
  metadata.budgets.bootstrapPaths = ["tiny/human.md", "tiny/machine.json"];
  writeResult();
  const outcome = checkStateBudgets(root, "specs/result.md");
  check("SB09 rejects Result-selected decoy state and bootstrap paths", !outcome.ok && outcome.findings.some((f) => f.includes("canonical")), outcome.findings.join("; "));
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
