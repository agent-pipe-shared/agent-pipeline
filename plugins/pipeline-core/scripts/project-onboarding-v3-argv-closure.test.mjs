#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md
// Direction 1: "for each Pipeline CLI proposed for an allowlist, establish that the guard
// admits a closed, positional argv set and refuses everything else." This proves that claim
// for `project-onboarding-v3.mjs`, the onboarding CLI whose refusal by the Claude Code
// harness classifier is this item's own trigger. A settings-layer prefix match like
// `Bash(node plugins/pipeline-core/scripts/project-onboarding-v3.mjs *)` admits any trailing
// argv; these tests prove the CLI's own `parse()` -- not the settings glob -- is what
// actually refuses anything outside its closed command/flag grammar: an unrecognized
// subcommand, an unrecognized flag, and a flag used where the grammar forbids it.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main as onboardingCli } from "./project-onboarding-v3.mjs";

function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), `project-onboarding-argv-${prefix}-`));
}

function invoke(args) {
  let output = "";
  const status = onboardingCli(args, {
    write: (chunk) => { output += chunk; },
    writeError: (chunk) => { output += chunk; },
    env: {},
  });
  return { status, output };
}

test("project-onboarding-v3 refuses an unrecognized subcommand (closed command set, not open)", () => {
  const dir = freshDir("bad-command");
  try {
    const { status, output } = invoke(["definitely-not-a-real-command", "--root", dir]);
    assert.equal(status, 2, `expected refusal (exit 2) for an unknown subcommand, got ${status}`);
    assert.match(output, /unknown argument: definitely-not-a-real-command/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 refuses an unrecognized flag on a known, read-only subcommand", () => {
  const dir = freshDir("bad-flag-inspect");
  try {
    // `plan-runtime` is the read-only step the source incident also reported refused by the
    // harness classifier -- the settings entry has to stay safe for it too, not only for the
    // mutating `--activate` commands.
    const { status, output } = invoke(["plan-runtime", "--root", dir, "--smuggled-flag", "value"]);
    assert.equal(status, 2, `expected refusal (exit 2) for an unrecognized flag, got ${status}`);
    assert.match(output, /unknown argument: --smuggled-flag/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 refuses --activate on a subcommand outside the apply-shaped set", () => {
  const dir = freshDir("activate-on-inspect");
  try {
    // --activate is only valid for the enumerated APPLY_SHAPED_COMMANDS. `inspect` is
    // read-only; the parser must refuse the combination even though every individual flag
    // (`--root`, `--activate`) is independently recognized.
    const { status, output } = invoke(["inspect", "--root", dir, "--activate"]);
    assert.equal(status, 2, `expected refusal (exit 2) for --activate outside the apply-shaped set, got ${status}`);
    assert.match(output, /--activate is only valid for an apply command/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 refuses an unrecognized flag value for a closed enum flag", () => {
  const dir = freshDir("bad-runner-enum");
  try {
    const { status, output } = invoke(["inspect", "--root", dir, "--runner", "not-a-real-runner"]);
    assert.equal(status, 2, `expected refusal (exit 2) for an out-of-enum --runner value, got ${status}`);
    assert.match(output, /--runner must be claude or codex/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
