#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-gate-strength-origin-attestation.test.mjs — GS-8 and GS-9, the two
 * gate-strength rules that protect product source rather than project
 * configuration, plus the property that decides whether either of them protects
 * anything at all.
 *
 * SIBLING FILE, NOT AN EDIT TO `guard-gate-strength.test.mjs` -- that file is
 * `project/guard-config.json` `protectedTestPaths` rule TP-6, enforced live by
 * `guard-testpath.mjs`'s Edit/Write PreToolUse guard, with no in-session override
 * available while `gates.push_approval` is `signature` (this repository's
 * committed value). Same precedent as `guard-gate-strength-gmw.test.mjs` beside
 * it and `guard-push-external-ledger.test.mjs`. This filename does not match
 * TP-6's `guard-gate-strength\.test\.mjs$` regex. The case numbering continues
 * the main suite's GSTnn sequence rather than restarting, because these are one
 * family of cases over one guard and only the file boundary is administrative.
 *
 * WHAT IS NEW HERE, AND WHY IT IS NOT ALREADY COVERED. GST01 and GST17 in the
 * main suite iterate `GATE_STRENGTH_PATHS` and would pick up GS-8/GS-9 for free
 * -- but every one of those assertions derives the path it tests from the same
 * table it is testing, so a table entry naming a file that DOES NOT EXIST is
 * green under all of them and protects nothing: the write lane refuses a path
 * nobody writes, and the shell lane's needle (`basename(rule.path)`,
 * `guard-lifecycle-ready.mjs`) is a substring nobody's command contains. GST35
 * below is the case that can fail for that reason. The rest name GS-8 and GS-9
 * explicitly instead of deriving them, so deleting a row is a red suite and not
 * a quietly shorter loop, and cover the two branches the table-driven cases do
 * not reach: the read-only shell exemption and the governance-marker stand-down
 * (recorded gap: `backlog/items/2026-08-07-no-test-pins-the-ungoverned-path-rule-stand-down.md`).
 *
 * DELIBERATELY NOT ASSERTED. That GS-8's and GS-9's modules are absent from
 * `NEVER_LIFTABLE_KERNEL_PATHS`. It is true today and disclosed as residual 3 of
 * design `specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`
 * §I.1.3, but whether the kernel list should grow is an open ADR-0058 question
 * (§I.1.3 P5) covering both modules at once; pinning today's answer would turn
 * strengthening the guard into a red suite. GST36 pins the observable half of
 * that residual -- which rule fires for the enforcing copy -- without pinning
 * the kernel list.
 *
 * Run: node plugins/pipeline-core/hooks/guard-gate-strength-origin-attestation.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GATE_STRENGTH_PATHS, gateStrengthRuleFor } from "./guard-gate-strength.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS, "guard-gate-strength.mjs");
const LIFECYCLE_GUARD = join(HOOKS, "guard-lifecycle-ready.mjs");
const PLUGIN_ROOT = join(HOOKS, "..");
const REPO_ROOT = realpathSync(join(HOOKS, "..", "..", ".."));
const roots = [];

/**
 * The two rules under test, taken from the table by id rather than by position,
 * so a renumbering is a loud failure here instead of a silently different test.
 */
const SUBJECT_IDS = ["GS-8", "GS-9"];
const SUBJECTS = SUBJECT_IDS.map((id) => {
  const rule = GATE_STRENGTH_PATHS.find((entry) => entry.id === id);
  if (rule === undefined) throw new Error(`${id} is absent from GATE_STRENGTH_PATHS; this suite has no subject`);
  return rule;
});

/** Same shape as the main suite's `governed()`: the fixture markers, not the fixture contents, are what the guard reads. */
function governed() {
  const base = mkdtempSync(join(tmpdir(), "gate-strength-origin-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(base, "project", "guard-config.json"), '{"protectedTestPaths":[]}\n');
  writeFileSync(join(base, "project", "critical-human-proof.json"), '{"schema":"pipeline.critical-human-proof-policy.v1","requiredKinds":["push"]}\n');
  writeFileSync(join(base, "README.md"), "# fixture\n");
  return base;
}

/** A checkout carrying no governance marker of either lane's list. */
function ungoverned(prefix = "gate-strength-origin-plain-") {
  const base = mkdtempSync(join(tmpdir(), prefix));
  roots.push(base);
  writeFileSync(join(base, "README.md"), "# unrelated project\n");
  return base;
}

/** The write lane. `toolName` varies because NotebookEdit names its target `notebook_path`. */
function ask(root, filePath, { toolName = "Edit" } = {}) {
  const key = toolName === "NotebookEdit" ? "notebook_path" : "file_path";
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { [key]: filePath }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { blocked: result.status !== 0, stderr: result.stderr ?? "" };
}

/** The shell lane, asserted from the outside exactly as the main suite does. */
function shell(root, command) {
  const result = spawnSync(process.execPath, [LIFECYCLE_GUARD, "--runner", "claude"], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { blocked: result.status !== 0, stderr: result.stderr ?? "" };
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("GST31 GS-8 and GS-9 are refused by every write tool, in relative and absolute form", () => {
    const root = governed();
    for (const rule of SUBJECTS) {
      for (const toolName of ["Edit", "Write", "NotebookEdit"]) {
        for (const form of [rule.path, join(root, rule.path)]) {
          const { blocked, stderr } = ask(root, form, { toolName });
          assert.equal(blocked, true, `${rule.id} admitted a ${toolName} to ${form}`);
          assert.match(stderr, new RegExp(`Rule ID: ${rule.id}\\b`, "u"), `${toolName} ${form}`);
          assert.match(stderr, /the PO edits this file directly, outside an agent session/u);
        }
      }
    }
  });

  check("GST32 a non-read-only shell command naming GS-8's or GS-9's module is refused", () => {
    // The Edit refusal above is worth nothing on its own: this guard is wired for write
    // TOOLS only, so `touch <path>` never reaches it. The shell half lives in
    // guard-lifecycle-ready.mjs, which derives its needles as `basename(rule.path)` and
    // matches them as substrings -- including inside a quoted script argument, where token
    // matching sees one opaque word.
    const root = governed();
    for (const rule of SUBJECTS) {
      const commands = [
        `touch ${rule.path}`,
        `cp /tmp/evil.mjs ${rule.path}`,
        `git add ${rule.path}`,
        `git checkout -- ${rule.path}`,
        `node -e 'require("fs").writeFileSync("${rule.path}", "export const x = 1;\\n")'`,
      ];
      for (const command of commands) {
        const { blocked, stderr } = shell(root, command);
        assert.equal(blocked, true, `admitted: ${command}`);
        assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, `wrong refusal for: ${command}`);
        assert.match(stderr, new RegExp(`This command names ${basename(rule.path)}`, "u"), command);
      }
    }
  });

  check("GST33 reading GS-8's or GS-9's module from the shell is never claimed by this rule", () => {
    // A rule that stopped `cat` and `git diff` on these two files would make reviewing them
    // impossible -- and the PO-hand-edit escape hatch the refusal points at assumes an agent
    // can still read what it is asking the PO to change. `node --check` is named explicitly
    // because it is the one `node` shape the read-only classifier admits, and the design
    // (§I.1.6) lists it as still available after the needle binds.
    // Asserted as "not refused BY THIS RULE" rather than "admitted", mirroring GST14: a
    // governed fixture with no ready bootstrap has its own separate reasons to refuse.
    const root = governed();
    for (const rule of SUBJECTS) {
      for (const command of [
        `cat ${rule.path}`,
        `rg PUBLIC_SELF_APPLICATION_ORIGINS ${rule.path}`,
        `head -n 5 ${rule.path}`,
        `sha256sum ${rule.path}`,
        `git diff ${rule.path}`,
        `node --check ${rule.path}`,
      ]) {
        assert.doesNotMatch(shell(root, command).stderr, /GUARD-GATE-STRENGTH-SHELL/u,
          `read-only command claimed by the gate-strength rule: ${command}`);
      }
    }
  });

  check("GST34 an ungoverned checkout stands the GS-8/GS-9 path rules down on both lanes", () => {
    // The branch that turns the whole path table off, and the one most likely to be wrong in
    // the field rather than here: every marker file of this repository is tracked, so every
    // clone of it is governed and the stand-down never fires locally. Pinned as the specified
    // behaviour ("only defend a repository the Pipeline actually governs"), not challenged.
    // A regression here is silent -- writes that should be refused simply succeed.
    const root = ungoverned();
    for (const rule of SUBJECTS) {
      const write = ask(root, rule.path);
      assert.equal(write.blocked, false, `${rule.id} refused in a checkout carrying no governance marker`);
      assert.equal(write.stderr, "", `${rule.id} said something while standing down: ${write.stderr}`);
      const command = shell(root, `touch ${rule.path}`);
      assert.equal(command.blocked, false, `${rule.id} shell lane refused in an ungoverned checkout`);
      assert.doesNotMatch(command.stderr, /GUARD-GATE-STRENGTH-SHELL/u);
    }
  });

  check("GST35 the protection is not inert: every plugins/-scoped rule names a real file the resolver maps back to it", () => {
    // The one property no other case can fail on. GST01/GST17 and every case above derive the
    // path they test from the table, so an entry whose `path` names a file that does not exist
    // -- a typo, a rename that missed the table, a module moved between lib/ and scripts/ --
    // is green everywhere and protects nothing: the write lane refuses a path nobody writes and
    // the shell needle is a substring nobody's command contains. Only the tree can answer that,
    // so this case reads the tree.
    //
    // Scoped to `plugins/` deliberately: the configuration rules (GS-1..GS-5/GS-7) name files a
    // consumer project may legitimately not have, so their absence is not a defect. A rule
    // pointing INTO this plugin's own source is different -- the file is either here or the
    // rule is dead. Consequence, stated rather than hidden: this case reads the source checkout
    // the plugin sits in, exactly as GST08 does, and does not hold for a copy of the plugin
    // installed without its repository.
    const scoped = GATE_STRENGTH_PATHS.filter((rule) => rule.path.startsWith("plugins/"));
    assert.ok(scoped.length >= SUBJECT_IDS.length,
      `expected at least ${SUBJECT_IDS.length} plugins/-scoped rules, found ${scoped.length}`);
    for (const id of SUBJECT_IDS) {
      assert.ok(scoped.some((rule) => rule.id === id), `${id} is no longer a plugins/-scoped rule`);
    }
    for (const rule of scoped) {
      const absolute = join(REPO_ROOT, rule.path);
      assert.ok(existsSync(absolute),
        `${rule.id} protects ${rule.path}, which does not exist -- the rule refuses a path nobody writes`);
      assert.ok(statSync(absolute).isFile(),
        `${rule.id} protects ${rule.path}, which is not a file; the write lane matches whole file paths`);
      // Case-sensitively, from the directory listing rather than from the table: on a
      // case-insensitive filesystem existsSync() would accept a spelling the shell needle
      // (a lowercased substring test) and a case-sensitive checkout would not agree on.
      assert.ok(readdirSync(dirname(absolute)).includes(basename(rule.path)),
        `${rule.id}: the tree spells ${basename(rule.path)} differently than the table does`);
      // ... and the guard's own resolver, given that real path, still answers this rule.
      assert.equal(gateStrengthRuleFor(realpathSync(absolute), REPO_ROOT)?.id, rule.id,
        `${rule.id}: gateStrengthRuleFor() does not map the real file at ${rule.path} back to this rule`);
      assert.equal(gateStrengthRuleFor(rule.path, REPO_ROOT)?.id, rule.id,
        `${rule.id}: gateStrengthRuleFor() does not map ${rule.path} back to this rule`);
    }
  });

  check("GST36 for the enforcing copy the rule that fires is GS-6, not GS-8/GS-9", () => {
    // Residual 3 of design part-a-residuals-and-dispatch-template-drift.md §I.1.3, pinned as
    // OPEN because that is what the design specifies. The live-plugin rule is evaluated first
    // and independently of the path table, so for the installed copy -- and in a self-hosted
    // local-development install for the source copy too, since there they are the same file --
    // these two modules are GS-6 files. That matters because GS-6 is the one window-liftable
    // gate-strength rule while GS-8/GS-9 are not liftable at all: a signed GS-6 maintenance
    // window opened for any reason also unlocks these two in the enforcing copy.
    const root = governed();
    for (const rule of SUBJECTS) {
      const target = join(PLUGIN_ROOT, "lib", basename(rule.path));
      const { blocked, stderr } = ask(root, target);
      assert.equal(blocked, true, `${target} inside the live plugin must be refused`);
      assert.match(stderr, /Rule ID: GS-6\b/u, `${rule.id}: the live-plugin copy did not match GS-6`);
      assert.doesNotMatch(stderr, new RegExp(`Rule ID: ${rule.id}\\b`, "u"));
      assert.match(stderr, /no in-session override/u);
    }
  });

  check("GST37 the two lanes disagree about which checkouts are governed, in both directions", () => {
    // Residual 4 of §I.1.3, likewise pinned as OPEN. The write lane tests five inline markers,
    // the shell lane its own eleven-entry GOVERNANCE_MARKERS, and neither list contains the
    // other. Recorded here because the divergence is what makes "GS-8/GS-9 protect this module"
    // a per-lane claim: a checkout carrying only a guard config is Edit-refused but freely
    // touched from the shell, and a checkout carrying only .claude/settings.json -- which is
    // essentially every Claude Code project -- is the exact reverse.
    const writeLaneOnly = mkdtempSync(join(tmpdir(), "gate-strength-origin-wlane-"));
    roots.push(writeLaneOnly);
    mkdirSync(join(writeLaneOnly, "project"), { recursive: true });
    writeFileSync(join(writeLaneOnly, "project", "guard-config.json"), '{"protectedTestPaths":[]}\n');

    const shellLaneOnly = mkdtempSync(join(tmpdir(), "gate-strength-origin-slane-"));
    roots.push(shellLaneOnly);
    mkdirSync(join(shellLaneOnly, ".claude"), { recursive: true });
    writeFileSync(join(shellLaneOnly, ".claude", "settings.json"), "{}\n");

    for (const rule of SUBJECTS) {
      const writeOnly = ask(writeLaneOnly, rule.path);
      assert.equal(writeOnly.blocked, true, `${rule.id}: a write-lane marker did not govern the write lane`);
      assert.match(writeOnly.stderr, new RegExp(`Rule ID: ${rule.id}\\b`, "u"));
      assert.doesNotMatch(shell(writeLaneOnly, `touch ${rule.path}`).stderr, /GUARD-GATE-STRENGTH-SHELL/u,
        `${rule.id}: the shell lane claimed a checkout carrying only a write-lane marker`);

      assert.equal(ask(shellLaneOnly, rule.path).blocked, false,
        `${rule.id}: the write lane claimed a checkout carrying only a shell-lane marker`);
      const shellOnly = shell(shellLaneOnly, `touch ${rule.path}`);
      assert.equal(shellOnly.blocked, true, `${rule.id}: a shell-lane marker did not govern the shell lane`);
      assert.match(shellOnly.stderr, /GUARD-GATE-STRENGTH-SHELL/u);
    }
  });

  console.log(`\nguard-gate-strength-origin-attestation: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
