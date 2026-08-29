#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * NVA-GF-COPYSAFE: copy-safe-command.mjs -- the ONE shared renderer for every
 * command the Pipeline hands a human to run externally.
 *
 * The round-trip technique below (a real bash eval reconstructing the exact
 * intended argv, including a value with a space and a value with non-ASCII
 * characters) reuses GF-105's own established proof
 * (scripts/po-human-approval.test.mjs, "the copyCommand rendering is bounded
 * on every shell, and the posix rendering round-trips through a real bash
 * eval to the exact intended argv") -- the coverage this backlog item asked
 * to widen, not a new technique.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { boundedOpaqueCopyCommand as libBoundedOpaqueCopyCommand, renderProjectOnboardingAction } from "./project-onboarding-v3.mjs";
import { boundedCopySafeCommand, boundedOpaqueCopyCommand, placeholder } from "./copy-safe-command.mjs";

test("boundedOpaqueCopyCommand is re-exported unchanged -- the same function object project-onboarding-v3.mjs already exported, not a reimplementation", () => {
  assert.strictEqual(boundedOpaqueCopyCommand, libBoundedOpaqueCopyCommand);
});

test("boundedCopySafeCommand assembles the exact executable+argv into one command line and a bounded copyCommand", () => {
  const built = boundedCopySafeCommand({
    executable: "node",
    argv: ["/plugin/scripts/example.mjs", "plan", "--repo", "/some/root", "--request-sha256", "a".repeat(64)],
  });
  assert.equal(built.executable, "node");
  assert.deepEqual(built.argv, ["/plugin/scripts/example.mjs", "plan", "--repo", "/some/root", "--request-sha256", "a".repeat(64)]);
  assert.equal(typeof built.command, "string");
  assert.ok(built.copyCommand);
  assert.equal(built.copyCommand.maxColumns, 72);
});

test("boundedCopySafeCommand refuses a missing/empty executable or argv instead of silently rendering a broken command", () => {
  assert.throws(() => boundedCopySafeCommand({ executable: "", argv: ["a"] }), /non-empty executable/u);
  assert.throws(() => boundedCopySafeCommand({ executable: "node", argv: [] }), /non-empty argv/u);
  assert.throws(() => boundedCopySafeCommand({ executable: "node", argv: ["a", 1] }), /non-empty argv/u);
  assert.throws(() => boundedCopySafeCommand({}), /non-empty executable/u);
});

/** A value with a space AND a value with non-ASCII characters -- the same class
 * of case that broke the Codex/WSL greenfield run this backlog item measures
 * (a key path corrupted, a hash mis-transcribed, a script path split by a
 * line break). */
function fixtureArgv() {
  return [
    "/ext/dir üöä/guard-human-override.mjs",
    "prepare-authorization",
    "--repo", "/repo root",
    "--request-sha256", "a".repeat(64),
    "--reason", "PO confirms the request contents match intent",
  ];
}

test("the copyCommand rendering is bounded on every shell, and the posix rendering round-trips through a real bash eval to the exact intended argv -- including a value with a space and a value with non-ASCII characters", () => {
  const built = boundedCopySafeCommand({ executable: "node", argv: fixtureArgv() });
  const copy = built.copyCommand;
  assert.deepEqual(Object.keys(copy).sort(), ["cmd", "maxColumns", "posix", "powershell"]);
  assert.equal(copy.maxColumns, 72);
  for (const [label, rendered, lineSep] of [
    ["posix", copy.posix, "\n"],
    ["powershell", copy.powershell, "\n"],
    ["cmd", copy.cmd, "\r\n"],
  ]) {
    // A per-shell rendering may legitimately be null (that shell cannot safely
    // represent this value at all) rather than thrown -- never required to be
    // non-null, but whichever renders must stay within the shared bound.
    if (rendered === null) continue;
    assert.equal(typeof rendered, "string", label);
    assert.equal(rendered.split(lineSep).every((line) => line.length <= copy.maxColumns), true,
      `${label} rendering exceeds ${copy.maxColumns} columns`);
  }
  if (process.platform === "win32") return;
  assert.ok(copy.posix, "posix rendering must succeed for this input");
  const lines = copy.posix.split("\n");
  assert.equal(lines.at(-1), 'eval "$CMD"');
  const assignments = lines.slice(0, -1).join("\n");
  // A shell FUNCTION named "node" shadows the real binary for an unqualified call
  // in bash, so this proves the exact argv a real shell reconstructs from the
  // bounded rendering WITHOUT ever invoking anything for real.
  const script = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  // The shell function captures "$@" -- the arguments passed TO node, which
  // excludes "node" itself (the function's own name/invocation word). built.argv
  // never contains "node" either (that is built.executable, held separately),
  // so this compares like for like -- exactly GF-105's own established shape.
  assert.deepEqual(tokens, built.argv,
    "the posix copyCommand rendering does not reconstruct the exact intended argv");
});

/**
 * NVA-W12-COPYSAFE: the placeholder-passthrough mode. A command containing an
 * unresolved placeholder like "<plan-sha256>" must render that text VERBATIM
 * -- never wrapped in the quotes shellWord() would add for a literal value of
 * the same shape -- while every real (non-placeholder) argv value in the
 * SAME command still renders exactly as shellWord() would render it alone.
 */
test("placeholder() requires a non-empty string", () => {
  assert.throws(() => placeholder(""), /non-empty string/u);
  assert.throws(() => placeholder(42), /non-empty string/u);
  assert.throws(() => placeholder(), /non-empty string/u);
});

test("boundedCopySafeCommand renders a placeholder() argv entry verbatim -- not shellWord()-quoted -- while real values around it are still safely quoted", () => {
  const withPlaceholder = boundedCopySafeCommand({
    executable: "node",
    argv: ["script.mjs", "--repo", "/repo root", "--plan-sha256", placeholder("<plan-sha256>"), "--reason", placeholder('"<human-reason>"')],
  });
  // The placeholder renders exactly as given, with no quotes added around it.
  assert.ok(withPlaceholder.command.includes("--plan-sha256 <plan-sha256> "), withPlaceholder.command);
  assert.ok(withPlaceholder.command.includes('--reason "<human-reason>"'), withPlaceholder.command);
  // A real value with a space in the SAME command is still shellWord()-quoted.
  assert.ok(withPlaceholder.command.includes("--repo '/repo root'"), withPlaceholder.command);
  // The returned argv resolves placeholder() entries to their plain text.
  assert.deepEqual(withPlaceholder.argv, ["script.mjs", "--repo", "/repo root", "--plan-sha256", "<plan-sha256>", "--reason", '"<human-reason>"']);
  // Compare against what shellWord-based quoting WOULD have produced for the same
  // literal text, to prove passthrough actually differs from ordinary quoting.
  const asLiteralValue = boundedCopySafeCommand({ executable: "node", argv: ["script.mjs", "--plan-sha256", "<plan-sha256>"] });
  assert.ok(asLiteralValue.command.includes("--plan-sha256 '<plan-sha256>'"), asLiteralValue.command);
  assert.ok(!withPlaceholder.command.includes("'<plan-sha256>'"), withPlaceholder.command);
});

test("boundedCopySafeCommand refuses an argv entry that is neither a string nor a placeholder() value", () => {
  assert.throws(() => boundedCopySafeCommand({ executable: "node", argv: ["a", {}] }), /non-empty argv/u);
  assert.throws(() => boundedCopySafeCommand({ executable: "node", argv: ["a", null] }), /non-empty argv/u);
});

test("a command containing a placeholder still produces a bounded copyCommand rendering (the placeholder becomes part of the one opaque command string boundedOpaqueCopyCommand chunks)", () => {
  const built = boundedCopySafeCommand({
    executable: "node",
    argv: ["/plugin/scripts/guard-human-override.mjs", "prepare-authorization", "--repo", "/some/root", "--request-sha256", "a".repeat(64), "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<human-reason>"')],
  });
  assert.equal(built.copyCommand.maxColumns, 72);
  for (const [label, rendered, lineSep] of [["posix", built.copyCommand.posix, "\n"], ["powershell", built.copyCommand.powershell, "\n"], ["cmd", built.copyCommand.cmd, "\r\n"]]) {
    if (rendered === null) continue;
    assert.equal(rendered.split(lineSep).every((line) => line.length <= built.copyCommand.maxColumns), true, `${label} rendering exceeds the bound`);
  }
});

test("boundedCopySafeCommand with no placeholder() entries is byte-identical to before this mode existed (delegates to renderProjectOnboardingAction unchanged)", () => {
  const built = boundedCopySafeCommand({ executable: "node", argv: fixtureArgv() });
  assert.equal(built.command, renderProjectOnboardingAction({ kind: "command", executable: "node", argv: fixtureArgv() }));
});

test("a short argv (no chunking needed) still round-trips through a real bash eval to the exact intended argv", () => {
  const built = boundedCopySafeCommand({ executable: "node", argv: ["script.mjs", "--flag", "a value"] });
  if (process.platform === "win32") return;
  assert.ok(built.copyCommand.posix);
  const lines = built.copyCommand.posix.split("\n");
  const assignments = lines.slice(0, -1).join("\n");
  const script = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, built.argv);
});
