#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { normalizeAntigravityToolInput } from "./antigravity-pretool-guard.mjs";

const hookDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(hookDir, "..");
const adapter = join(hookDir, "antigravity-pretool-guard.mjs");
let passed = 0;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agy-pretool-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({
    project: "test", verify: "node verify.mjs",
  }));
  return root;
}

function run(input, root = fixture(), {
  claudeProjectDir = root,
  hookCwd = root,
} = {}) {
  const envelope = typeof input === "string" ? input : {
    workspacePaths: [root],
    ...input,
  };
  const inputRoot = mkdtempSync(join(tmpdir(), "agy-pretool-input-"));
  const inputPath = join(inputRoot, "input.json");
  writeFileSync(inputPath, typeof envelope === "string" ? envelope : JSON.stringify(envelope));
  const inputFd = openSync(inputPath, "r");
  try {
    return spawnSync(process.execPath, [adapter], {
      cwd: hookCwd,
      env: { ...process.env, CLAUDE_PROJECT_DIR: claudeProjectDir },
      encoding: "utf8",
      stdio: [inputFd, "pipe", "pipe"],
      timeout: 8_000,
    });
  } finally {
    closeSync(inputFd);
    rmSync(inputRoot, { recursive: true, force: true });
  }
}

function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function decision(result) {
  if (result.status === 2) {
    return { decision: "deny", reason: result.stderr };
  }
  assert.equal(result.status, 0, `Process failed: ${result.stderr}`);
  const trimmed = result.stdout.trim();
  assert.ok(trimmed !== "", `guard produced no decision output on stdout (stderr: ${result.stderr})`);
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    assert.fail(`guard produced unparseable decision output: ${trimmed}\n${error.message}`);
  }
}

// 1. Normalization tests
check("normalizeAntigravityToolInput: translates run_command", () => {
  const res = normalizeAntigravityToolInput({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "node harness/scripts/verify.mjs", Cwd: "/tmp" },
    },
  });
  assert.equal(res.toolName, "Bash");
  assert.equal(res.command, "node harness/scripts/verify.mjs");
  assert.equal(res.toolInput.command, "node harness/scripts/verify.mjs");
  assert.equal(res.isReadOnly, false);
});

check("normalizeAntigravityToolInput: translates write_to_file", () => {
  const res = normalizeAntigravityToolInput({
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: "/foo/bar.js", CodeContent: "console.log('hi');" },
    },
  });
  assert.equal(res.toolName, "Write");
  assert.equal(res.filePath, "/foo/bar.js");
  assert.equal(res.toolInput.file_path, "/foo/bar.js");
  assert.equal(res.toolInput.content, "console.log('hi');");
  assert.equal(res.isReadOnly, false);
});

check("normalizeAntigravityToolInput: translates replace_file_content", () => {
  const res = normalizeAntigravityToolInput({
    toolCall: {
      name: "replace_file_content",
      args: { TargetFile: "/foo/bar.js", TargetContent: "old", ReplacementContent: "new" },
    },
  });
  assert.equal(res.toolName, "Edit");
  assert.equal(res.filePath, "/foo/bar.js");
  assert.equal(res.toolInput.file_path, "/foo/bar.js");
  assert.equal(res.toolInput.old_string, "old");
  assert.equal(res.toolInput.new_string, "new");
  assert.equal(res.isReadOnly, false);
});

check("normalizeAntigravityToolInput: identifies read-only tools", () => {
  for (const name of ["view_file", "list_dir", "find_by_name", "grep_search", "read_url_content", "ask_question"]) {
    const res = normalizeAntigravityToolInput({ toolCall: { name, args: {} } });
    assert.equal(res.isReadOnly, true);
  }
});

// 2. Direct Guard Decisions
check("Antigravity pretool guard allows read-only tools immediately", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "view_file",
      args: { AbsolutePath: join(root, "README.md") },
    },
  }, root));
  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard rejects invalid JSON", () => {
  const root = fixture();
  const res = decision(run("not-json", root));
  assert.equal(res.decision, "deny");
  assert.match(res.reason, /not valid JSON/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks chained commands (&&, ;, pipes)", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({
    project: "test", verify: "node verify.mjs",
  }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: true,
    activeFeature: { id: "feat-1", phase: "implementation", planPath: "specs/feat-1/prd.md" },
  }));

  const res = decision(run({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "npm test && git status" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /GUARD-OPERATOR-UNAPPROVED|GUARD-PARSE-UNSUPPORTED|guard-command-grammar|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks writes outside project root (GUARD-CROSS-REPO-MUTATION)", () => {
  const root = fixture();
  const outsidePath = "/tmp/outside_repo_file.txt";

  const res = decision(run({
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: outsidePath, CodeContent: "test" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /GUARD-CROSS-REPO-MUTATION|outside this repository|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks write when Dev-Plan is not approved", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({
    project: "test", verify: "node verify.mjs",
  }));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "gates:\n  dev_plan:\n    mode: blocking\n");
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: false,
    activeFeature: { id: "feat-1", phase: "draft", planPath: "specs/feat-1/prd.md" },
  }));

  const res = decision(run({
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: join(root, "src", "code.js"), CodeContent: "const a = 1;" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /guard-devplan|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks unapproved git push", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({
    project: "test", verify: "node verify.mjs",
  }));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "gates:\n  push:\n    mode: blocking\n");
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: true,
    activeFeature: { id: "feat-1", phase: "implementation", planPath: "specs/feat-1/prd.md" },
  }));

  const res = decision(run({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "git push origin main" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /guard-push|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks invoke_subagent missing mandatory template fields", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          {
            TypeName: "goldfish",
            Role: "Goldfish Implementor",
            Prompt: "Just fix the bug please",
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /guard-dispatch|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks direct writes to pipeline-state.json", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({
    project: "test", verify: "node verify.mjs",
  }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: true,
    activeFeature: { id: "feat-1", phase: "implementation", planPath: "specs/feat-1/prd.md" },
  }));

  const res = decision(run({
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: join(root, "project", "pipeline-state.json"), CodeContent: "{}" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /protected-state-writer-only|guard-lifecycle-ready|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks replace_file_content outside project root", () => {
  const root = fixture();
  const outsidePath = "/tmp/outside_repo_file.txt";

  const res = decision(run({
    toolCall: {
      name: "replace_file_content",
      args: { TargetFile: outsidePath, TargetContent: "old", ReplacementContent: "new" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /GUARD-CROSS-REPO-MUTATION|outside this repository|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks shell redirects (> and >>)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "echo 'hello' > test.txt" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /GUARD-REDIRECT-UNAPPROVED|GUARD-PARSE-UNSUPPORTED|guard-command-grammar|BLOCKED/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks replace_file_content to pipeline.user.yaml (GS-1)", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');

  const res = decision(run({
    toolCall: {
      name: "replace_file_content",
      args: { TargetFile: join(root, "pipeline.user.yaml"), TargetContent: "signature", ReplacementContent: "chat" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /guard-gate-strength|Rule ID: GS-1\b/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks agent self-approval for approve-push", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push --by 'Agent' --remote origin --destination refs/heads/main" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /'approve-push' is an explicit Human\/PO decision/);
  rmSync(root, { recursive: true, force: true });
});

// 3. Restored Antigravity Hardening Layer (ADR-0014 read-only Critic contract)

check("Antigravity pretool guard blocks a critic subagent defined with write tools enabled", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "define_subagent",
      args: { name: "critic-reviewer", enable_write_tools: true },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /enable_write_tools: false/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard allows a non-critic subagent defined with write tools enabled (neighbour case)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "define_subagent",
      args: { name: "goldfish-implementor", enable_write_tools: true },
    },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard allows a critic subagent correctly defined with enable_write_tools: false", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "define_subagent",
      args: { name: "critic-reviewer", enable_write_tools: false },
    },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks a critic dispatch prompt carrying prose (Contamination Rule)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          {
            TypeName: "critic",
            Role: "Critic",
            Prompt: "Please examine this file and review it.",
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Contamination Rule/);
  rmSync(root, { recursive: true, force: true });
});

// Fixture: a minimal but guard-dispatch-compliant Critic briefing (paths + the ruleset-sha
// and model tokens dispatch-policy.mjs requires of every critic-type dispatch) that also names
// the canonical CLAUDE.md-mandated template path -- used to prove the D2 collision at the
// decision level (deny pre-fix, allow post-fix) rather than only at the reason-text level.
const CRITIC_TEMPLATE_PATH_FIXTURE_PROMPT = [
  "templates/prompts/critic-review.md",
  "specs/feat-1/prd.md",
  "docs/adr/0014-critic-contract.md",
  "ruleset-sha: b6e2db657d078f023773853e8571a941bb29c2a5",
  "model: sonnet",
].join("\n");

check("Antigravity pretool guard does not treat a paths-only critic dispatch as prose (neighbour case)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          {
            TypeName: "critic",
            Role: "Critic",
            Prompt: [
              "specs/feat-1/prd.md",
              "docs/adr/0014-critic-contract.md",
              "ruleset-sha: b6e2db657d078f023773853e8571a941bb29c2a5",
              "model: sonnet",
            ].join("\n"),
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard allows a Critic dispatch naming the canonical templates/prompts/critic-review.md path (D2)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          {
            TypeName: "critic",
            Role: "Critic",
            Prompt: CRITIC_TEMPLATE_PATH_FIXTURE_PROMPT,
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard still blocks genuine prose 'please review the code' after the D2 regex tightening", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          {
            TypeName: "critic",
            Role: "Critic",
            Prompt: "please review the code",
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Contamination Rule/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline node -e execution (containment)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "node -e \"console.log(1)\"" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline python -c execution (containment)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "python -c \"print(1)\"" },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard allows running a node script file, not inline code (neighbour case)", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-pretool-bare-"));
  const res = decision(run({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "node scratch/script.mjs" },
    },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

console.log(`\nAll ${passed} antigravity-pretool-guard tests passed.`);

