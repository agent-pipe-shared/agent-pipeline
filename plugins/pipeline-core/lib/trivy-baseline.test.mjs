// SPDX-License-Identifier: SUL-1.0
// C29e T8b (ADR-0103): a Trivy finding blocks only when the feature introduced it; an unavailable baseline exempts nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockingTrivyFindingFilter, existingTrivyFindings, formatTrivyBaselineLines, trivyFindingKey } from "./trivy-baseline.mjs";
import { blockingFindings } from "./semgrep-baseline.mjs";
import { runSecurityScan } from "../scripts/security-scan.mjs";

const f = (rule, path, line, severity = "high", tool = "trivy") => ({ tool, rule, path, line, severity, msg: rule });

test("identity is rule and path, never the line", () => {
  assert.equal(trivyFindingKey(f("DS-0002", "Dockerfile", 3)), trivyFindingKey(f("DS-0002", "Dockerfile", 9)));
  assert.notEqual(trivyFindingKey(f("DS-0002", "Dockerfile", 3)), trivyFindingKey(f("DS-0002", "svc/Dockerfile", 3)));
});

test("existing findings are counted per rule and path; a moved line stays existing, an extra one is new", () => {
  const base = [f("DS-0002", "Dockerfile", 2), f("AWS-0107", "infra/main.tf", 6), f("AWS-0107", "infra/main.tf", 9)];
  const candidate = [f("DS-0002", "Dockerfile", 5), f("AWS-0107", "infra/main.tf", 7), f("AWS-0107", "infra/main.tf", 12), f("AWS-0107", "infra/main.tf", 20), f("KSV-0014", "k8s/a.yaml", 1), f("DS-0026", "Dockerfile", null, "low")];
  const existing = existingTrivyFindings(candidate, base, ["critical", "high"]);
  assert.deepEqual(existing.map((x) => `${x.rule}:${x.path}:${x.line}`), ["DS-0002:Dockerfile:5", "AWS-0107:infra/main.tf:7", "AWS-0107:infra/main.tf:12"]);
  const record = { status: "applied", existing };
  const blocking = blockingFindings(candidate, ["critical", "high"]).filter(blockingTrivyFindingFilter(record));
  assert.deepEqual(blocking.map((x) => `${x.rule}:${x.line}`), ["AWS-0107:20", "KSV-0014:1"], "only what the feature added blocks");
});

test("an unavailable or absent baseline exempts nothing, and other tools are never exempted", () => {
  const candidate = [f("DS-0002", "Dockerfile", 1), f("DS-0002", "Dockerfile", 1, "high", "semgrep")];
  const existing = [{ rule: "DS-0002", path: "Dockerfile", line: 1, severity: "high" }, { rule: "DS-0002", path: "Dockerfile", line: 1, severity: "high" }];
  assert.equal(candidate.filter(blockingTrivyFindingFilter({ status: "unavailable", existing })).length, 2);
  assert.equal(candidate.filter(blockingTrivyFindingFilter(null)).length, 2);
  assert.deepEqual(candidate.filter(blockingTrivyFindingFilter({ status: "applied", existing })).map((x) => x.tool), ["semgrep"]);
});

test("a base without trigger files means every candidate finding is new", () => {
  assert.deepEqual(existingTrivyFindings([f("DS-0002", "Dockerfile", 1)], [], ["high"]), []);
});

test("summary lines: existing listed and non-blocking, or why everything blocks", () => {
  const lines = formatTrivyBaselineLines({ status: "applied", featureId: "probe-feature", commit: "b".repeat(40), existing: [{ rule: "DS-0002", path: "Dockerfile", line: 2, severity: "high" }], newCount: 1 });
  assert.match(lines[0], /1 finding\(s\) at a blocking severity existed before the feature/u);
  assert.match(lines[1], /existing high DS-0002 Dockerfile:2/u);
  assert.match(formatTrivyBaselineLines({ status: "unavailable", code: "TRIVY-BASELINE-NO-FEATURE", reason: "x" })[0], /Every Trivy finding at a blocking severity blocks/u);
  assert.deepEqual(formatTrivyBaselineLines({ status: "not-needed" }), []);
});

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}
function commitAll(root, message) {
  git(root, "add", "-A");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

const trivyAvailable = spawnSync("trivy", ["--version"], { encoding: "utf8", shell: false, timeout: 60000 }).status === 0;
const MANIFEST = "schema: pipeline.manifest.v0\n\ngates:\n  security:\n    mode: blocking\n    type: automated\n\nsecurity:\n  scanners:\n    gitleaks:\n      enabled: false\n    osv-scanner:\n      enabled: false\n    semgrep:\n      enabled: false\n    license-check:\n      enabled: false\n";

test("the real chain: no trigger file is not applicable; an older Trivy finding is listed and does not block; a new one blocks; no feature means all block", { skip: trivyAvailable ? false : "trivy is not installed" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "trivy-baseline-"));
  const evidenceDir = `${root}-evidence`;
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Baseline Fixture");
    git(root, "config", "user.email", "baseline-fixture@example.invalid");
    git(root, "config", "commit.gpgsign", "false");
    git(root, "remote", "add", "origin", "https://example.invalid/pipeline/trivy-baseline-fixture.git");
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.yaml"), MANIFEST);
    writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({ activeFeature: { id: "probe-feature" } })}\n`);
    writeFileSync(join(root, "README.md"), "# fixture\n");
    commitAll(root, "no infrastructure yet");
    const scanOnce = async () => runSecurityScan({ rootDir: root, env: process.env, timeoutMs: 120000, evidenceOutDir: evidenceDir });

    let { evidence, exitCode } = await scanOnce();
    let trivy = evidence.scanners.find((s) => s.tool === "trivy");
    assert.equal(trivy.status, "SKIPPED");
    assert.equal(trivy.reportStatus, "not-applicable");
    assert.equal(exitCode, 0);

    writeFileSync(join(root, "Dockerfile"), "FROM ubuntu:22.04\nRUN apt-get install -y curl\n");
    const base = commitAll(root, "legacy Dockerfile");
    mkdirSync(join(root, "specs", "probe-feature"), { recursive: true });
    writeFileSync(join(root, "specs", "probe-feature", "spec.md"), "# spec\n");
    commitAll(root, "feature start");
    writeFileSync(join(root, "Dockerfile"), "# moved by one line\nFROM ubuntu:22.04\nRUN apt-get install -y curl\n");
    commitAll(root, "feature moves the legacy finding");

    ({ evidence, exitCode } = await scanOnce());
    trivy = evidence.scanners.find((s) => s.tool === "trivy");
    let record = evidence.execution.trivyBaseline;
    assert.equal(trivy.status, "FINDINGS", JSON.stringify(trivy));
    assert.equal(record.status, "applied", JSON.stringify(record));
    assert.equal(record.commit, base);
    assert.equal(record.newCount, 0);
    assert.ok(record.existing.some((entry) => entry.rule === "DS-0002"));
    assert.equal(record.worktreeCleanup, "removed");
    assert.equal(exitCode, 0, "an older finding is listed and does not block");

    mkdirSync(join(root, "svc"), { recursive: true });
    writeFileSync(join(root, "svc", "Dockerfile"), "FROM ubuntu:22.04\nRUN apt-get install -y curl\n");
    commitAll(root, "feature adds a new Dockerfile");
    ({ evidence, exitCode } = await scanOnce());
    record = evidence.execution.trivyBaseline;
    assert.equal(record.status, "applied");
    assert.ok(record.newCount > 0);
    assert.equal(exitCode, 2, "the new finding blocks");

    writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({ activeFeature: null, closedFeatures: [] })}\n`);
    rmSync(join(root, "svc"), { recursive: true, force: true });
    commitAll(root, "no feature named");
    ({ evidence, exitCode } = await scanOnce());
    assert.equal(evidence.execution.trivyBaseline.code, "TRIVY-BASELINE-NO-FEATURE");
    assert.equal(exitCode, 2, "without a baseline every blocking-severity finding blocks");

    assert.equal(git(root, "worktree", "list", "--porcelain").split("\n").filter((line) => line.startsWith("worktree ")).length, 1, "no worktree is left behind");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(evidenceDir, { recursive: true, force: true });
  }
});
