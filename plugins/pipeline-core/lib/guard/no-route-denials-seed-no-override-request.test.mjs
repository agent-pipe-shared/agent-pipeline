// SPDX-License-Identifier: SUL-1.0
// Backlog pipeline.greenfield.r2.guard-denials-fill-the-override-request-namespace (AC-160): a guard refusal for which no
// human override route exists seeds no override request; a refusal that offers one seeds exactly one. Measured through
// the real lifecycle guard in a fresh git repository per case, counting the files under the request directory.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateLifecycleReadyGuard } from "./evaluate.mjs";

function seededRequests(toolName, toolInput) {
  const dir = mkdtempSync(join(tmpdir(), "ac160-seed-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, "a.txt"), "x\n");
    mkdirSync(join(dir, ".aws"), { recursive: true });
    writeFileSync(join(dir, ".aws", "credentials"), "synthetic fixture\n");
    mkdirSync(join(dir, "specs", "x", "evidence"), { recursive: true });
    const result = evaluateLifecycleReadyGuard({ tool_name: toolName, tool_input: toolInput }, {
      projectDir: dir,
      observeGovernanceScopeFn: () => ({ requiresEnforcement: true }),
      requireProjectOnboardingReadyFn() { throw Object.assign(new Error("not ready"), { code: "PORG-NOT-READY" }); },
    });
    const requests = join(dir, ".git", "agent-pipeline", "human-guard-overrides", "requests");
    return { result, seeded: existsSync(requests) ? readdirSync(requests).length : 0 };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("NRS01 refusals with no override route seed no request", () => {
  for (const [toolName, toolInput, code] of [
    ["Bash", { command: "cat /etc/hostname" }, "GUARD-READ-SCOPE-OUTSIDE-ROOT"],
    ["Bash", { command: "cat .aws/credentials" }, "GUARD-READ-CREDENTIAL-TARGET"],
    ["Bash", { command: "rg -A3 x a.txt" }, "GUARD-READ-COMMAND-UNSUPPORTED"],
    ["Bash", { command: "rm -rf scratch" }, "GUARD-LIFECYCLE-NOT-READY"],
    ["Bash", { command: "node -e \"process.exit(0)\"" }, "GUARD-LIFECYCLE-NOT-READY"],
  ]) {
    const { result, seeded } = seededRequests(toolName, toolInput);
    assert.equal(result.exitCode, 2, `${toolInput.command}`);
    assert.ok(result.stderr.includes(code), `${toolInput.command}: ${result.stderr}`);
    assert.equal(seeded, 0, `${code} (${toolInput.command}) must seed no request`);
  }
});

test("NRS02 refusals that offer a human override seed exactly one request", () => {
  for (const [toolName, toolInput, code] of [
    ["Bash", { command: "echo a; echo b" }, "GUARD-PARSE-UNSUPPORTED"],
    ["Bash", { command: "cat a.txt > b.txt" }, "GUARD-REDIRECT-UNAPPROVED"],
    ["Bash", { command: "cat a.txt | tee b.txt" }, "GUARD-OPERATOR-UNAPPROVED"],
    // A target outside the project root offers an override when the fixture's temporary parent is no other repository
    // (os.tmpdir(), as under Verify). Only a parent inside another repository is HGO-NONOVERRIDABLE-CROSS-BOUNDARY.
    ["Write", { file_path: "../outside.txt", content: "x" }, "GUARD-CROSS-REPO-MUTATION"],
  ]) {
    const { result, seeded } = seededRequests(toolName, toolInput);
    assert.equal(result.exitCode, 2, JSON.stringify(toolInput));
    assert.ok(result.stderr.includes(code), `${JSON.stringify(toolInput)}: ${result.stderr}`);
    assert.equal(seeded, 1, `${code} offers an override and seeds one request`);
  }
});
