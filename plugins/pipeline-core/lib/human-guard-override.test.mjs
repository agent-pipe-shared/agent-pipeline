#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  authorizeHumanGuardOverride,
  consumeHumanGuardOverride,
  HumanGuardOverrideError,
  humanGuardOverrideInternals,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
  verifyHumanGuardOverrideAudit,
} from "./human-guard-override.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "human-guard-override-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

function reasonDigest(reason) {
  return createHash("sha256").update(Buffer.from(reason, "utf8")).digest("hex");
}

const denial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-LIFECYCLE-NOT-READY" }];

test("one exact attended capability is audited, consumed once and cannot be replayed", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "attended recovery\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    assert.equal(request.status, "planned");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(plan.status, "planned");
    assert.equal(plan.toolInputSha256.length, 64);
    assert.deepEqual(plan.eligiblePaths, ["notes.md"]);
    assert.equal(plan.preview.poAuthority, "final-for-this-exact-project-policy-decision");
    assert.match(plan.preview.postcondition, /byte-identical original tool action/u);
    assert.equal(plan.policy.guards[0].guard, "guard-lifecycle-ready.mjs");
    const reason = "PO attended recovery for the exact notes write";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(prepared.status, "prepared");
    assert.equal(prepared.authorizeAction.mutation, true);
    assert.equal(prepared.authorizeAction.requiresConfirmation, true);
    assert.equal(prepared.authorizeAction.argv.includes("<human-reason>"), false);
    assert.deepEqual(prepared.decisionPreview, plan.preview);
    const armed = authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: reasonDigest(reason),
      activate: true,
      nowMs: 3000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(armed.status, "armed");
    const consumed = consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    });
    assert.equal(consumed.status, "consumed");
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const audit = join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    const auditEvents = readFileSync(audit, "utf8").trim().split("\n").map((line) => JSON.parse(line).event);
    assert.deepEqual(auditEvents.map(({ type }) => type), ["denied", "authorized", "consumed"]);
    assert.equal(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 5000,
    }).status, "absent");
    assert.deepEqual(verifyHumanGuardOverrideAudit({ rootDir: root }), {
      schema: "pipeline.human-guard-override-audit-verification.v1",
      status: "valid",
      entries: 3,
      lastMac: verifyHumanGuardOverrideAudit({ rootDir: root }).lastMac,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a host-Git-unavailable hook can consume only the exact audited local plugin installation", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    mkdirSync(join(root, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "verify.mjs"), "// verify\n");
    writeFileSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), JSON.stringify({
      name: "pipeline-core",
      version: "0.0.0-test",
    }));
    writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({
      // ADR-0052: a legitimate Pipeline source checkout's OWN marketplace
      // self-names the published identity "agent-pipeline"; the
      // "agent-pipeline-local" name is reserved for the separate, external
      // local-marketplace root, never a committed file inside a checkout.
      name: "agent-pipeline",
      plugins: [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
    }));
    const toolInput = { command: "codex plugin add pipeline-core@agent-pipeline-local" };
    const noGit = () => ({ status: null, error: { code: "EPERM" }, stdout: "" });
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput,
      denials: denial,
      nowMs: 1_000,
      spawn: noGit,
    });
    assert.equal(request.status, "planned");
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2_000,
      spawn: noGit,
      scriptPath,
    });
    assert.equal(plan.mode, "global-plugin-install");
    assert.equal(plan.commandClass, "local-plugin-install");
    assert.match(plan.preview.expectedEffects.external, /pipeline-core@agent-pipeline-local/u);
    const reason = "PO approves the exact local Nova plugin candidate installation";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2_500,
      spawn: noGit,
      scriptPath,
    });
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: reasonDigest(reason),
      activate: true,
      nowMs: 3_000,
      spawn: noGit,
      scriptPath,
    });
    assert.equal(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput,
      denials: denial,
      nowMs: 4_000,
      spawn: noGit,
    }).status, "consumed");
    assert.equal(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: { command: "codex plugin remove pipeline-core@agent-pipeline-local" },
      denials: denial,
      nowMs: 5_000,
      spawn: noGit,
    }).status, "absent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local plugin installation capability rejects a changed candidate source", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    mkdirSync(join(root, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "verify.mjs"), "// verify\n");
    writeFileSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), JSON.stringify({
      name: "pipeline-core",
      version: "0.0.0-test",
    }));
    writeFileSync(join(root, "plugins", "pipeline-core", "candidate.mjs"), "export const candidate = 1;\n");
    writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({
      // See the sibling fixture above: the checkout's OWN manifest self-names
      // "agent-pipeline" (ADR-0052), not "agent-pipeline-local".
      name: "agent-pipeline",
      plugins: [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
    }));
    const toolInput = { command: "codex plugin add pipeline-core@agent-pipeline-local" };
    const noGit = () => ({ status: null, error: { code: "EPERM" }, stdout: "" });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const request = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 1_000, spawn: noGit,
    });
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, nowMs: 2_000, spawn: noGit, scriptPath,
    });
    const reason = "PO approves the exact local candidate installation";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      reason, nowMs: 2_500, spawn: noGit, scriptPath,
    });
    authorizeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256, planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256, reason, reasonSha256: reasonDigest(reason), activate: true,
      nowMs: 3_000, spawn: noGit, scriptPath,
    });
    writeFileSync(join(root, "plugins", "pipeline-core", "candidate.mjs"), "export const candidate = 2;\n");
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Bash", toolInput, denials: denial, nowMs: 4_000, spawn: noGit,
    }), { status: "replan", code: "HGO-DRIFT" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit and exact in-root patch admission never execute the effect or claim success", () => {
  for (const [toolName, toolInput, expectedClass] of [
    ["Bash", { command: "git commit -m exact-retry" }, "git-commit"],
    ["apply_patch", {
      command: "*** Begin Patch\n*** Add File: notes.md\n+exact patch retry\n*** End Patch",
    }, "exact-in-root-patch"],
  ]) {
    const root = fixture();
    try {
      const originalHead = git(root, "rev-parse", "HEAD");
      const request = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: 1000,
      });
      assert.equal(request.status, "planned");
      const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
      const plan = planHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        nowMs: 2000,
        scriptPath,
      });
      assert.equal(plan.commandClass, expectedClass);
      const reason = `PO approved ${expectedClass}`;
      const prepared = prepareHumanGuardOverrideAuthorization({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        planSha256: plan.planSha256,
        reason,
        nowMs: 2500,
        scriptPath,
      });
      authorizeHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        planSha256: plan.planSha256,
        selectionSha256: prepared.selectionSha256,
        reason,
        reasonSha256: prepared.reasonSha256,
        activate: true,
        nowMs: 3000,
        scriptPath,
      });
      assert.equal(consumeHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: 4000,
      }).status, "consumed");
      const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
      const events = readFileSync(
        join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl"),
        "utf8",
      ).trim().split("\n").map((line) => JSON.parse(line).event.type);
      assert.equal(events.at(-1), "consumed", "audit must be durable before admission returns");
      assert.equal(git(root, "rev-parse", "HEAD"), originalHead, "override admission must not execute git commit");
      assert.equal(existsSync(join(root, "notes.md")), false, "override admission must not apply the patch");
      assert.match(plan.preview.postcondition, /ordinary effect readback/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("drift, expiry and concurrent consumption fail closed", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "bounded\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
      ttlMs: 10000,
    });
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const reason = "Exact attended retry";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: reasonDigest(reason),
      activate: true,
      nowMs: 3000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const lockDir = join(common, "agent-pipeline", "human-guard-overrides", "locks");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, `${plan.planSha256}.lock`), "contender", { mode: 0o600 });
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }), { status: "invalid", code: "HGO-CONCURRENT-CONSUME" });
    rmSync(join(lockDir, `${plan.planSha256}.lock`));
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { ...toolInput, content: "drifted\n" },
      denials: denial,
      nowMs: 4000,
    }), { status: "absent" });
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 12000,
    }), { status: "replan", code: "HGO-EXPIRED" });
    const fresh = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 12001,
      ttlMs: 10000,
    });
    assert.equal(fresh.status, "planned");
    assert.notEqual(fresh.requestSha256, request.requestSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("security and authority boundaries return typed recovery without an ambient bypass", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "physical"), { recursive: true });
    symlinkSync(join(root, "physical"), join(root, "linked"), "dir");
    writeFileSync(join(root, "physical", "linked-source.txt"), "shared\n");
    linkSync(join(root, "physical", "linked-source.txt"), join(root, "hardlinked.txt"));
    for (const [expected, toolName, toolInput] of [
      ["planned", "Write", { file_path: ".claude/pipeline-state.json", content: "{}" }],
      ["planned", "Write", { file_path: ".claude/pipeline.yaml", content: "runtime: drift\n" }],
      ["author-repair-required", "Write", { file_path: "plugins/pipeline-core/lib/human-guard-override.mjs", content: "tamper\n" }],
      ["external-operator-required", "Write", { file_path: "../outside.txt", content: "x" }],
      ["external-operator-required", "Write", { file_path: "linked/escape.txt", content: "x" }],
      ["external-operator-required", "Write", { file_path: "hardlinked.txt", content: "x" }],
      ["narrower-recovery-required", "Bash", { command: "git push origin HEAD:refs/heads/main" }],
      ["narrower-recovery-required", "Bash", { command: "/usr/bin/git push origin HEAD:refs/heads/main" }],
      ["narrower-recovery-required", "Bash", { command: "/bin/sh -c 'git push origin HEAD:refs/heads/main'" }],
      ["planned", "Bash", { command: "git harmless-alias notes.md" }],
      ["planned", "Bash", { command: "python3 -c 'open(\"owned\", \"w\").write(\"x\")'" }],
      ["planned", "Bash", { command: "perl -e 'open my $fh, \">\", \"owned\"'" }],
      ["planned", "Bash", { command: "node safe.mjs" }],
      ["external-operator-required", "Bash", { command: "node --check ../../outside.mjs" }],
      ["planned", "Bash", { command: "node --check .claude/pipeline-state.json" }],
      ["external-operator-required", "Bash", { command: "node safe.mjs --tok" + "en=fixture-not-a-secret" }],
      ["planned", "Bash", { command: "touch safe && touch second" }],
      ["planned", "apply_patch", { command: "*** Begin Patch\n*** Update File: .claude/pipeline-state.json\n@@\n-{}\n+{\"x\":1}\n*** End Patch" }],
      ["author-repair-required", "apply_patch", { command: "*** Begin Patch\n*** Update File: plugins/pipeline-core/hooks/codex-pretool-guard.mjs\n@@\n-old\n+tampered\n*** End Patch" }],
      ["external-operator-required", "apply_patch", { command: "*** Begin Patch\n*** Update File: notes.md\n*** Move to: ../outside.md\n@@\n-old\n+new\n*** End Patch" }],
    ]) {
      const observed = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
      });
      assert.equal(
        observed.status,
        expected,
        `${toolName} ${JSON.stringify(toolInput)}`,
      );
      if (new Set(["narrower-recovery-required", "external-operator-required"]).has(observed.status)) {
        assert.equal(typeof observed.nextAction, "object");
        assert.equal(typeof observed.nextAction.action, "object");
      }
    }
    writeFileSync(join(root, "safe.mjs"), "export {};\n");
    const syntaxCheck = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: { command: "node --check safe.mjs" },
      denials: denial,
    });
    assert.equal(syntaxCheck.status, "planned");
    const syntaxPlan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: syntaxCheck.requestSha256,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.deepEqual(syntaxPlan.eligiblePaths, ["safe.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every push-guard denial routes to an exact publication preflight even through an alias", () => {
  const root = fixture();
  try {
    const observed = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: { command: "release-alias current" },
      denials: [{ guard: "guard-push.mjs", reason: "PG-CAPABILITY: publication authority required" }],
    });
    assert.equal(observed.status, "narrower-recovery-required");
    assert.equal(observed.code, "HGO-NARROWER-PUBLICATION-REQUIRED");
    assert.equal(observed.nextAction.kind, "typed-recovery");
    assert.equal(observed.nextAction.action.executable, process.execPath);
    assert.match(observed.nextAction.action.argv[0], /publication-executor\.mjs$/u);
    assert.equal(observed.nextAction.action.argv.includes("release-alias"), false);
    assert.equal(observed.nextAction.action.argv.includes(git(root, "rev-parse", "HEAD")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pipeline author repair binds one exact source root and action without State readiness", () => {
  const root = fixture();
  try {
    const sourceRoot = join(root, "plugins", "pipeline-core");
    mkdirSync(join(sourceRoot, ".codex-plugin"), { recursive: true });
    mkdirSync(join(sourceRoot, "lib"), { recursive: true });
    writeFileSync(join(sourceRoot, ".codex-plugin", "plugin.json"), '{"name":"pipeline-core","version":"0.4.7"}\n');
    writeFileSync(join(sourceRoot, "lib", "repair.mjs"), "export const repaired = false;\n");
    mkdirSync(join(root, "outside-source"), { recursive: true });
    symlinkSync(join(root, "outside-source"), join(sourceRoot, "linked-outside"), "dir");
    assert.equal(humanGuardOverrideInternals.eligibility(
      root,
      "Write",
      { file_path: "plugins/pipeline-core/linked-outside/escape.mjs", content: "escape\n" },
      { selectedAuthorSourceRoot: sourceRoot },
    ).code, "HGO-NONOVERRIDABLE-CROSS-BOUNDARY");
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "pipeline-state.json"), "{damaged portable state\n");
    const toolInput = {
      command: "*** Begin Patch\n*** Update File: plugins/pipeline-core/lib/repair.mjs\n@@\n-export const repaired = false;\n+export const repaired = true;\n*** End Patch",
    };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "apply_patch",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    assert.equal(request.status, "author-repair-required");
    assert.equal(request.candidateSourceRoot, sourceRoot);
    assert.throws(
      () => planHumanGuardOverride({
        rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: request.requestSha256,
        nowMs: 2000, scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUTHOR-ROOT",
    );
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      authorSourceRoot: sourceRoot,
      nowMs: 2000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(plan.mode, "pipeline-author-repair");
    assert.equal(plan.authorSourceRoot, sourceRoot);
    assert.equal(plan.repository.state.status, "malformed");
    assert.deepEqual(plan.eligiblePaths, ["plugins/pipeline-core/lib/repair.mjs"]);
    const reason = "PO-authorized exact Pipeline source repair";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      authorSourceRoot: sourceRoot,
      nowMs: 2500,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const armed = authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: prepared.reasonSha256,
      authorSourceRoot: sourceRoot,
      activate: true,
      nowMs: 3000,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    assert.equal(armed.status, "armed");
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "apply_patch",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }).status, "consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tampered audit fails verification", () => {
  const root = fixture();
  try {
    recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { file_path: "notes.md", content: "x" },
      denials: denial,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const audit = join(common, "agent-pipeline", "human-guard-overrides", "audit.jsonl");
    writeFileSync(audit, readFileSync(audit, "utf8").replace('"type":"denied"', '"type":"allowed"'), { mode: 0o600 });
    assert.throws(
      () => verifyHumanGuardOverrideAudit({ rootDir: root }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUDIT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deleted ledger, authenticated head, or their pair fails verification", () => {
  for (const deleted of ["audit.jsonl", "audit.head.json", "both"]) {
    const root = fixture();
    try {
      recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName: "Write",
        toolInput: { file_path: "notes.md", content: deleted },
        denials: denial,
      });
      const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
      const base = join(common, "agent-pipeline", "human-guard-overrides");
      if (deleted === "both") {
        unlinkSync(join(base, "audit.jsonl"));
        unlinkSync(join(base, "audit.head.json"));
      } else {
        unlinkSync(join(base, deleted));
      }
      assert.throws(
        () => verifyHumanGuardOverrideAudit({ rootDir: root }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUDIT",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("an armed capability is unusable when its authorization audit disappeared", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "audit-bound\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath,
    });
    const reason = "Audit-bound capability";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath,
    });
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: prepared.reasonSha256,
      activate: true,
      nowMs: 3000,
      scriptPath,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const base = join(common, "agent-pipeline", "human-guard-overrides");
    unlinkSync(join(base, "audit.jsonl"));
    unlinkSync(join(base, "audit.head.json"));
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }), { status: "invalid", code: "HGO-AUDIT" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("policy-library and override-CLI drift invalidate the loaded plugin identity", () => {
  for (const changed of [
    ["hooks", "guard-command-grammar.mjs"],
    ["lib", "human-guard-override.mjs"],
    ["lib", "windows-private-state.mjs"],
    ["scripts", "guard-human-override.mjs"],
  ]) {
    const root = fixture();
    const plugin = mkdtempSync(join(tmpdir(), "human-guard-plugin-"));
    try {
      for (const relative of [
        [".codex-plugin", "plugin.json"],
        ["hooks", "codex-pretool-guard.mjs"],
        ["hooks", "guard-command-grammar.mjs"],
        ["lib", "human-guard-override.mjs"],
        ["lib", "windows-private-state.mjs"],
        ["scripts", "guard-human-override.mjs"],
      ]) {
        mkdirSync(join(plugin, relative[0]), { recursive: true });
        copyFileSync(join(PLUGIN_ROOT, ...relative), join(plugin, ...relative));
      }
      const request = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: plugin,
        toolName: "Write",
        toolInput: { file_path: "notes.md", content: changed.join("/") },
        denials: denial,
        nowMs: 1000,
      });
      writeFileSync(join(plugin, ...changed), `${readFileSync(join(plugin, ...changed), "utf8")}\n// identity drift\n`);
      assert.throws(
        () => planHumanGuardOverride({
          rootDir: root,
          pluginRoot: plugin,
          requestSha256: request.requestSha256,
          nowMs: 2000,
          scriptPath: join(plugin, "scripts", "guard-human-override.mjs"),
        }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DRIFT",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(plugin, { recursive: true, force: true });
    }
  }
});

test("missing or replaced audit keys fail closed without silent regeneration", () => {
  for (const mode of ["missing", "replaced"]) {
    const root = fixture();
    try {
      recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName: "Write",
        toolInput: { file_path: "notes.md", content: mode },
        denials: denial,
      });
      const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
      const key = join(common, "agent-pipeline", "human-guard-overrides", "audit.key");
      if (mode === "missing") unlinkSync(key);
      else writeFileSync(key, Buffer.alloc(32, 7), { mode: 0o600 });
      assert.throws(
        () => verifyHumanGuardOverrideAudit({ rootDir: root }),
        (error) => error instanceof HumanGuardOverrideError
          && new Set(["HGO-AUDIT-KEY", "HGO-AUDIT"]).has(error.code),
      );
      if (mode === "missing") assert.equal(existsSync(key), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a tampered one-action capability cannot be consumed", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "bounded\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath,
    });
    const reason = "Attended capability tamper regression";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath,
    });
    authorizeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      selectionSha256: prepared.selectionSha256,
      reason,
      reasonSha256: prepared.reasonSha256,
      activate: true,
      nowMs: 3000,
      scriptPath,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const capability = join(
      common,
      "agent-pipeline",
      "human-guard-overrides",
      "capabilities",
      `${plan.planSha256}.json`,
    );
    const value = JSON.parse(readFileSync(capability, "utf8"));
    value.toolInputSha256 = "f".repeat(64);
    writeFileSync(capability, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    assert.deepEqual(consumeHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 4000,
    }), { status: "invalid", code: "HGO-CAPABILITY" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authorization audit failure rolls back its newly created capability", () => {
  const root = fixture();
  try {
    const toolInput = { file_path: "notes.md", content: "audit rollback\n" };
    const request = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput,
      denials: denial,
      nowMs: 1000,
    });
    const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
    const plan = planHumanGuardOverride({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      nowMs: 2000,
      scriptPath,
    });
    const reason = "Audit failure rollback";
    const prepared = prepareHumanGuardOverrideAuthorization({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      requestSha256: request.requestSha256,
      planSha256: plan.planSha256,
      reason,
      nowMs: 2500,
      scriptPath,
    });
    const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
    const base = join(common, "agent-pipeline", "human-guard-overrides");
    writeFileSync(join(base, "audit.head.json"), "{}\n", { mode: 0o600 });
    assert.throws(
      () => authorizeHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: request.requestSha256,
        planSha256: plan.planSha256,
        selectionSha256: prepared.selectionSha256,
        reason,
        reasonSha256: prepared.reasonSha256,
        activate: true,
        nowMs: 3000,
        scriptPath,
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-AUDIT",
    );
    assert.equal(existsSync(join(base, "capabilities", `${plan.planSha256}.json`)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native Windows private-state assurance is injected and fail-closed", () => {
  const root = mkdtempSync(join(tmpdir(), "human-guard-windows-assurance-"));
  try {
    const existing = join(root, "existing");
    mkdirSync(existing, { mode: 0o700 });
    assert.equal(humanGuardOverrideInternals.secureDirectory(existing, {
      platform: "win32",
      assessWindowsPrivatePathFn() { return { status: "secure" }; },
    }), existing);
    assert.throws(
      () => humanGuardOverrideInternals.secureDirectory(existing, {
        platform: "win32",
        assessWindowsPrivatePathFn() { return { status: "insecure" }; },
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DACL",
    );
    const created = join(root, "created");
    assert.equal(humanGuardOverrideInternals.secureDirectory(created, {
      platform: "win32",
      hardenWindowsPrivateDirectoryFn() { return { status: "secure" }; },
    }), created);
    const file = join(root, "private.json");
    writeFileSync(file, "{}\n", { mode: 0o600 });
    assert.throws(
      () => humanGuardOverrideInternals.safePrivateFile(file, {
        platform: "win32",
        assessWindowsPrivatePathFn() { return { status: "unknown" }; },
      }),
      (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-DACL",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F1 (dispatch CRITIC-REMEDY-09): the local-plugin-install attestation succeeds against THIS repository's own, real marketplace manifest and plugin source tree", () => {
  // Every other local-plugin-install test above uses a synthetic fixture and
  // therefore can never observe a regression in the real, committed
  // .claude-plugin/marketplace.json or plugins/pipeline-core -- that
  // blindness let a marketplace-identity rename silently break the sanctioned
  // override for this repository while Full Verify stayed green. This test
  // exercises the same attestation the guard uses, directly against the real
  // checkout, so a future regression here fails Full Verify.
  const repoRoot = join(PLUGIN_ROOT, "..", "..");
  assert.equal(humanGuardOverrideInternals.isPipelineSourceRoot(repoRoot), true);
  const observation = humanGuardOverrideInternals.localPluginInstallSourceObservation({ root: repoRoot });
  assert.match(observation.statusSha256, /^[a-f0-9]{64}$/u);
  assert.match(observation.fingerprintSha256, /^[a-f0-9]{64}$/u);
});

test("repository identity failures name the sanitized Git operation", () => {
  const root = fixture();
  try {
    assert.throws(
      () => planHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        requestSha256: "a".repeat(64),
        spawn() { return { status: null, error: Object.assign(new Error("blocked"), { code: "EPERM" }) }; },
        scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
      }),
      (error) => error instanceof HumanGuardOverrideError
        && error.code === "HGO-GIT"
        && error.message.includes("operation=rev-parse---show-toplevel")
        && error.message.includes("outcome=EPERM"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
