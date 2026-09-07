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
import { consumeRuntimeReadback, issueLaunchTicket, readRestartBarrier, sha256 } from "../lib/codex-onboarding-runtime.mjs";

const hookDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(hookDir, "..");
const adapter = join(hookDir, "antigravity-pretool-guard.mjs");
const onboardingScript = join(pluginRoot, "scripts", "project-onboarding-v3.mjs");
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

function lifecycleCommand(root, ...args) {
  const result = spawnSync(process.execPath, [onboardingScript, ...args], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

function followLifecycleAction(root, result, name) {
  assert.equal(result.nextAction?.argv?.[1], name, JSON.stringify(result));
  return lifecycleCommand(root, ...result.nextAction.argv.slice(1));
}

function readyLifecycleFixture() {
  const root = mkdtempSync(join(tmpdir(), "agy-ready-hgo-"));
  followLifecycleAction(root, lifecycleCommand(root, "plan", "--root", root, "--runner", "antigravity"), "apply-portable-seed");
  const initialized = spawnSync(process.execPath, [join(pluginRoot, "scripts", "onboarding-init.mjs"), "--root", root, "--runner", "antigravity", "--git-author-name", "Test Fixture", "--git-author-email", "fixture@example.invalid", "--push-approval", "chat"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(initialized.status, 0, `${initialized.stderr}\n${initialized.stdout}`);
  for (const args of [["config", "user.name", "Test Fixture"], ["config", "user.email", "fixture@example.invalid"], ["add", "pipeline.user.yaml"], ["commit", "-m", "test fixture policy"]]) {
    const git = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
    assert.equal(git.status, 0, git.stderr);
  }
  const barrier = readRestartBarrier({ rootDir: root });
  if (barrier.status === "present") {
    const issued = issueLaunchTicket({ rootDir: root, barrierSha256: barrier.rawSha256 });
    consumeRuntimeReadback({ rootDir: root, ticketId: issued.ticketId, token: issued.token, receipt: { schema: "pipeline.codex-project-runtime-readback.v1", barrierSha256: barrier.rawSha256, repositoryFingerprint: barrier.barrier.repositoryFingerprint, sourceSha256: barrier.barrier.sourceSha256, runtimeTargetsSha256: barrier.barrier.runtimeTargetsSha256, readerGenerationSha256: sha256("test-agy-readback"), effectiveConfigSha256: sha256("test-agy-config"), validatedAgentsSha256: sha256("test-agy-agents"), ticketId: issued.ticketId, observedAtEpochMs: Date.now() } });
  }
  const collect = (result, values, material = null) => { const argv = result.nextAction.applyAction.argv.map((value) => values[value] ?? value); const index = argv.indexOf("--text-file"); if (material !== null && index >= 0) { const path = join(root, argv[index + 1]); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, material); } return lifecycleCommand(root, ...argv.slice(1)); };
  collect(lifecycleCommand(root, "inspect", "--root", root, "--runner", "antigravity"), { "<PO_INTAKE_GIT_AUTHOR_NAME>": "Test Fixture", "<PO_INTAKE_GIT_AUTHOR_EMAIL>": "fixture@example.invalid", "<PO_INTAKE_LANGUAGE>": "en", "<PO_INTAKE_PROFILE>": "feature" }, "AGY test fixture material.\n");
  collect(lifecycleCommand(root, "inspect", "--root", root, "--runner", "antigravity"), { "<PO_INTAKE_DESIGN_ANSWERS_JSON>": JSON.stringify([{ question: "Scope?", answer: "AGY fixture." }]) });
  const generated = followLifecycleAction(root, lifecycleCommand(root, "inspect", "--root", root, "--runner", "antigravity"), "intake-generate-plan");
  lifecycleCommand(root, "intake-generate-apply", "--root", root, "--plan-sha256", generated.planSha256, "--activate", "--runner", "antigravity");
  const bind = followLifecycleAction(root, lifecycleCommand(root, "inspect", "--root", root, "--runner", "antigravity"), "bootstrap-bind-plan");
  followLifecycleAction(root, bind, "bootstrap-bind-apply");
  assert.equal(lifecycleCommand(root, "inspect", "--root", root, "--runner", "antigravity").status, "ready");
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
  assert.match(res.reason, /GUARD-LIFECYCLE-NOT-READY/u);
  assert.doesNotMatch(res.reason, /Human override available|authorize-by-signature|verify-audit/u);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity GS-1 is liftable through its ordinary HGO path only after real lifecycle readiness", () => {
  const root = readyLifecycleFixture();
  try {
    const res = decision(run({
      toolCall: {
        name: "replace_file_content",
        args: { TargetFile: join(root, "pipeline.user.yaml"), TargetContent: "chat", ReplacementContent: "signature" },
      },
    }, root));
    assert.equal(res.decision, "deny");
    assert.match(res.reason, /guard-gate-strength|Rule ID: GS-1\b/);
    assert.match(res.reason, /Human override available for this exact action/u);
    assert.doesNotMatch(res.reason, /GUARD-LIFECYCLE-NOT-READY/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
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

const ROOT_CRITIC_TEMPLATE = readFileSync(join(pluginRoot, "..", "..", "templates", "prompts", "critic-review.md"), "utf8");
const VENDORED_CRITIC_TEMPLATE = readFileSync(join(pluginRoot, "templates", "prompts", "critic-review.md"), "utf8");
const AGY_ENVELOPE_START = "<!-- AGY-CRITIC-PROMPT-ENVELOPE:START -->";
const AGY_ENVELOPE_END = "<!-- AGY-CRITIC-PROMPT-ENVELOPE:END -->";
const agyEnvelopeRegion = ROOT_CRITIC_TEMPLATE.split(AGY_ENVELOPE_START)[1]?.split(AGY_ENVELOPE_END)[0];
assert.ok(agyEnvelopeRegion, "canonical Critic template must carry an Antigravity Prompt envelope");
const AGY_ENVELOPE = agyEnvelopeRegion.split("```text")[1]?.split("```")[0]?.trim();
assert.ok(AGY_ENVELOPE, "canonical Critic template envelope must contain a text code block");
const RENDERED_AGY_CRITIC_ENVELOPE = AGY_ENVELOPE
  .replace("{{SPEC_PATH}}", "specs/feat-1/prd.md")
  .replace("{{COMMIT_SHA}}", "0123456789abcdef0123456789abcdef01234567")
  .replace("{{GUARDRAIL_PATH}}", "guardrails/security.md")
  .replace("{{EVIDENCE_PATH}}", "evidence/verify-latest.json")
  .replace("{{TRIGGER_ROW}}", "T1")
  .replace("{{RULESET_SHA}}", "b6e2db657d078f023773853e8571a941bb29c2a5")
  .replace("{{MODEL}}", "gemini-3.7");

check("Antigravity Critic template carries a guard-admissible native envelope", () => {
  assert.equal(ROOT_CRITIC_TEMPLATE, VENDORED_CRITIC_TEMPLATE);
  assert.match(ROOT_CRITIC_TEMPLATE, /Antigravity native dispatch has a deliberately different carrier/);
  assert.ok(RENDERED_AGY_CRITIC_ENVELOPE.startsWith("templates/prompts/critic-review.md\n"));
  assert.doesNotMatch(RENDERED_AGY_CRITIC_ENVELOPE, /(?<![\w-])(you are|please|examine|look at|review)\b/i);
});

check("Antigravity pretool guard admits the actual rendered Critic envelope", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [{ TypeName: "critic", Role: "Critic", Prompt: RENDERED_AGY_CRITIC_ENVELOPE }],
      },
    },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard still rejects copying the full canonical Critic body into Prompt", () => {
  const root = fixture();
  const bodyStart = ROOT_CRITIC_TEMPLATE.indexOf("You are the **Critic**");
  assert.ok(bodyStart > 0, "canonical Critic body marker must remain present");
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [{ TypeName: "critic", Role: "Critic", Prompt: ROOT_CRITIC_TEMPLATE.slice(bodyStart) }],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Contamination Rule/);
  rmSync(root, { recursive: true, force: true });
});

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

// F1: the D2 regex tightening over-corrected -- it also stopped matching a trigger word
// preceded by markdown emphasis or a quote. These prompts carry a ruleset-sha and a model
// token (dispatch-policy.mjs's own, separate requirements for a critic-type dispatch) so that
// the ONLY thing that can produce a denial is the local Contamination Rule regex under test --
// pre-fix these are wrongly ALLOWED (the actual F1 bug); post-fix they must be DENIED with a
// Contamination Rule reason.
const F1_RULESET_AND_MODEL = [
  "ruleset-sha: b6e2db657d078f023773853e8571a941bb29c2a5",
  "model: sonnet",
].join("\n");

check("Antigravity pretool guard blocks a critic prompt with the trigger word inside markdown bold emphasis (F1)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          {
            TypeName: "critic",
            Role: "Critic",
            Prompt: `- **review** the tests\n${F1_RULESET_AND_MODEL}`,
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Contamination Rule/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks a critic prompt with the trigger word inside quotes (F1)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          {
            TypeName: "critic",
            Role: "Critic",
            Prompt: `"Review the diff."\n${F1_RULESET_AND_MODEL}`,
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Contamination Rule/);
  rmSync(root, { recursive: true, force: true });
});

// 4. Multi-subagent envelope inspection (D3)

check("Antigravity pretool guard blocks a critic dispatch carrying prose at index 1 of a multi-subagent envelope (D3)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          { TypeName: "goldfish", Role: "Goldfish Implementor", Prompt: "some other subagent, not the critic" },
          { TypeName: "critic", Role: "Critic", Prompt: "Please examine this file and review it." },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Contamination Rule/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard allows a multi-subagent envelope when the critic entry (index 1) carries a clean paths-only prompt (D3 neighbour case)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          { TypeName: "researcher", Role: "Researcher", Prompt: "irrelevant" },
          { TypeName: "critic", Role: "Critic", Prompt: CRITIC_TEMPLATE_PATH_FIXTURE_PROMPT },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

// F2: guard-dispatch.mjs (the SEPARATE nested guard spawned via canonicalPayload) previously
// only ever saw Subagents[0]'s shape, even after D3 fixed the LOCAL regex check to loop every
// entry. This prompt deliberately carries none of the LOCAL check's trigger words ("you are",
// "please", "examine", "look at", "review") -- so a denial here cannot come from the local
// regex (D3's own test already covers that path) -- but it does carry "pay attention to",
// which guard-dispatch.mjs's own contamination policy (dispatch-policy.mjs HUNT-LIST) flags
// independently of the local check. A ruleset-sha and model token are included so the only
// finding guard-dispatch.mjs can raise is HUNT-LIST, isolating the nested-guard coverage gap
// this test is about.
check("Antigravity pretool guard denies a multi-subagent envelope when guard-dispatch.mjs's own check (not the local regex) flags the critic entry at index 1 (F2)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: {
      name: "invoke_subagent",
      args: {
        Subagents: [
          { TypeName: "researcher", Role: "Researcher", Prompt: "irrelevant" },
          {
            TypeName: "critic",
            Role: "Critic",
            Prompt: [
              "specs/feat-1/prd.md",
              "ruleset-sha: b6e2db657d078f023773853e8571a941bb29c2a5",
              "model: sonnet",
              "Pay attention to the auth module changes in this diff.",
            ].join("\n"),
          },
        ],
      },
    },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /guard-dispatch|BLOCKED/);
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

// 5. Broadened inline-execution containment (D6)

check("Antigravity pretool guard blocks inline sh -c execution (containment, D6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "sh -c \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline bash -c execution (containment, D6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "bash -c \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline node --eval execution (containment, D6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "node --eval \"console.log(1)\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline node -p execution (containment, D6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "node -p \"1+1\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline node -pe execution (containment, D6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "node -pe \"1+1\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline env node -e execution (containment, already covered pre-D6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "env node -e \"console.log(1)\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

// F6: D6's `sh|bash` alternative matched a bare `-c` only, missing combined single-dash flag
// clusters ending in `c` and two shell names entirely.

check("Antigravity pretool guard blocks inline bash -lc execution (containment, F6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "bash -lc \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline sh -ec execution (containment, F6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "sh -ec \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline zsh -c execution (containment, F6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "zsh -c \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline dash -c execution (containment, F6)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "dash -c \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard allows a plain bash script invocation, not inline exec (neighbour case, F6)", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-pretool-bare-"));
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "bash script.sh" } },
  }, root));

  assert.equal(res.decision, "allow");
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline bash --login -c execution, a flag before -c (containment, delta-4 F4)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "bash --login -c \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("Antigravity pretool guard blocks inline bash -o pipefail -c execution, an option+argument before -c (containment, delta-4 F4)", () => {
  const root = fixture();
  const res = decision(run({
    toolCall: { name: "run_command", args: { CommandLine: "bash -o pipefail -c \"echo hi\"" } },
  }, root));

  assert.equal(res.decision, "deny");
  assert.match(res.reason, /Inline code execution/);
  rmSync(root, { recursive: true, force: true });
});

check("lifecycle-not-ready denial does not advertise a human override ceremony", () => {
  const root = fixture();
  try {
    for (const target of ["notes.md", join(root, "absolute-notes.md")]) {
      const denied = decision(run({ toolCall: { name: "replace_file_content", args: { TargetFile: target, TargetContent: "", ReplacementContent: "x" } } }, root));
      assert.equal(denied.decision, "deny");
      assert.match(denied.reason, /GUARD-LIFECYCLE-NOT-READY/u);
      assert.match(denied.reason, /Technical repair is required before retrying/u);
      assert.doesNotMatch(denied.reason, /Re-run the typed project-onboarding-v3 inspection/u);
      assert.doesNotMatch(denied.reason, /Human override available|authorize-by-signature|verify-audit/u);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log(`\nAll ${passed} antigravity-pretool-guard tests passed.`);
