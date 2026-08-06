#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * A gate must be MANDATORY and SATISFIABLE. This suite asserts both, for both runners.
 *
 * Why it exists. `guard-lifecycle-ready.mjs` is what makes `pipeline-start` compulsory
 * in a repository the Pipeline governs: no bootstrap proof, no ordinary work. Two
 * defects hid behind a fully green 245-suite Verify:
 *
 *  1. **Not mandatory on Claude.** The guard appeared nowhere in `hooks.json`, which is
 *     the file Claude Code loads. It was reachable only through `codex-pretool-guard.mjs`
 *     and `guard-apply-patch.mjs --runner codex`. Codex sessions were gated at every
 *     tool call; Claude sessions were not gated at all.
 *  2. **Not satisfiable.** The refusal told the caller to re-run the typed onboarding
 *     inspection — and the allowlist accepted only the form WITHOUT `--runner`, the
 *     one ADR-0051 forbids because it silently defaults the runner. The guard refused
 *     the command it demanded and permitted only the identity-losing one.
 *
 * Unit tests could not see either: each component behaved exactly as written. Only
 * walking the gate reveals that its exit does not exist. That is the general lesson
 * recorded in `backlog/items/2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md`,
 * and this suite is its first instance.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HOOKS, "..");
const GUARD = join(HOOKS, "guard-lifecycle-ready.mjs");
const ONBOARDING = join(PLUGIN, "scripts", "project-onboarding-v3.mjs");
const PREFLIGHT = join(PLUGIN, "scripts", "pipeline-start-preflight.mjs");
const RUNNERS = ["claude", "codex"];
const roots = [];

/** A repository the Pipeline governs, with no bootstrap performed. */
function governedUnbootstrapped() {
  const base = mkdtempSync(join(tmpdir(), "lifecycle-gate-"));
  roots.push(base);
  const git = (...args) => spawnSync("git", args, { cwd: base, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  git("commit", "-q", "--allow-empty", "-m", "init");
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  return base;
}
function ungoverned() {
  const base = mkdtempSync(join(tmpdir(), "lifecycle-gate-plain-"));
  roots.push(base);
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: base });
  return base;
}

/** Ask the guard, running it IN the repository — it resolves its root from the cwd. */
function ask(root, runner, toolName, toolInput) {
  const result = spawnSync(process.execPath, [GUARD, "--runner", runner], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, cwd: root }),
    encoding: "utf8",
    cwd: root,
  });
  return { blocked: result.status !== 0, stderr: result.stderr ?? "" };
}
const bash = (root, runner, command) => ask(root, runner, "Bash", { command });

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("LGS01 the guard is wired into hooks.json for BOTH PreToolUse matcher groups", () => {
    // Absent here, the gate is not mandatory for Claude Code at all, whatever the
    // guard itself does. This is the "mandatory" half and it is a wiring assertion.
    const hooks = JSON.parse(readFileSync(join(HOOKS, "hooks.json"), "utf8"));
    const pre = hooks.hooks?.PreToolUse ?? [];
    const wired = pre.filter((entry) => (entry.hooks ?? []).some((hook) => String(hook.command).includes("guard-lifecycle-ready.mjs")));
    assert.ok(wired.length >= 2, `guard-lifecycle-ready appears in ${wired.length} PreToolUse entries`);
    // Asserted per tool name rather than against exact matcher strings: a newly
    // discovered write tool must be a one-line wiring change, not a test rewrite.
    // NotebookEdit was added on 2026-08-06 after it was found to reach no matcher at all,
    // which meant a .ipynb write never had to prove a ready bootstrap.
    const tools = new Set(wired.flatMap((entry) => String(entry.matcher).split("|")));
    for (const tool of ["Bash", "PowerShell", "Edit", "Write", "NotebookEdit"]) {
      assert.ok(tools.has(tool), `no PreToolUse matcher names ${tool}`);
    }
    for (const entry of wired) {
      assert.match(entry.hooks[0].command, /--runner\s+claude/u, "the Claude wiring must name its runner explicitly (ADR-0051)");
    }
  });

  for (const runner of RUNNERS) {
    check(`LGS02 ${runner}: ordinary work is refused before a bootstrap proof exists`, () => {
      const root = governedUnbootstrapped();
      assert.equal(ask(root, runner, "Edit", { file_path: "notes.md" }).blocked, true, "an Edit must be refused");
      assert.equal(bash(root, runner, "npm run build").blocked, true, "an ordinary command must be refused");
    });

    check(`LGS03 ${runner}: the gate is SATISFIABLE — its own remediation passes`, () => {
      const root = governedUnbootstrapped();
      const refusal = ask(root, runner, "Edit", { file_path: "notes.md" }).stderr;
      assert.match(refusal, /project-onboarding-v3/u, "the refusal must name the onboarding inspection");
      // The exact command the refusal points at, carrying the runner identity
      // ADR-0051 requires. If this is refused, the gate has no exit.
      const remediation = `${process.execPath} ${ONBOARDING} inspect --root ${root} --intent session --runner ${runner}`;
      assert.equal(bash(root, runner, remediation).blocked, false, "the remediation the guard prints must be permitted");
    });

    check(`LGS04 ${runner}: the whole sanctioned bootstrap path is permitted`, () => {
      const root = governedUnbootstrapped();
      for (const command of [
        `${process.execPath} ${PREFLIGHT}`,
        `${process.execPath} ${ONBOARDING} inspect --root ${root} --intent bootstrap --runner ${runner}`,
        `${process.execPath} ${ONBOARDING} plan --root ${root} --runner ${runner}`,
      ]) {
        assert.equal(bash(root, runner, command).blocked, false, `refused: ${command.slice(-70)}`);
      }
    });

    check(`LGS05 ${runner}: the identity-carrying and identity-less forms are both accepted`, () => {
      // The allowlist accepted only the identity-LESS form, so the guard actively
      // pushed callers onto the path that silently defaults the runner.
      const root = governedUnbootstrapped();
      const withId = `${process.execPath} ${ONBOARDING} inspect --root ${root} --intent session --runner ${runner}`;
      const without = `${process.execPath} ${ONBOARDING} inspect --root ${root} --intent session`;
      assert.equal(bash(root, runner, withId).blocked, false, "identity-carrying form must be permitted");
      assert.equal(bash(root, runner, without).blocked, false, "identity-less form stays permitted for compatibility");
    });

    check(`LGS06 ${runner}: an unrelated runner value is not smuggled through the allowlist`, () => {
      const root = governedUnbootstrapped();
      const bogus = `${process.execPath} ${ONBOARDING} inspect --root ${root} --intent session --runner antigravity`;
      assert.equal(bash(root, runner, bogus).blocked, true, "only registered runner values may be appended");
    });

    check(`LGS07 ${runner}: an ungoverned repository is left alone`, () => {
      const root = ungoverned();
      assert.equal(ask(root, runner, "Edit", { file_path: "notes.md" }).blocked, false);
    });
  }

  console.log(`\nlifecycle-gate-satisfiability: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
