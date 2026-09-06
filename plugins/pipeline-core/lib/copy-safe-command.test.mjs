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
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { boundedOpaqueCopyCommand as libBoundedOpaqueCopyCommand, renderProjectOnboardingAction } from "./project-onboarding-v3.mjs";
import {
  boundedCopySafeCommand,
  boundedOpaqueCopyCommand,
  forcedQuote,
  placeholder,
  renderHumanCopySafeCommand,
} from "./copy-safe-command.mjs";

test("boundedOpaqueCopyCommand is re-exported unchanged -- the same function object project-onboarding-v3.mjs already exported, not a reimplementation", () => {
  assert.strictEqual(boundedOpaqueCopyCommand, libBoundedOpaqueCopyCommand);
});

/**
 * NVA-B-HGOCOPYSAFE-1 (backlog/items/2026-08-28-po-facing-commands-are-not-
 * uniformly-rendered-break-safe.md): human-guard-override.mjs's disclosed-
 * command lane hands an ALREADY-ASSEMBLED, arbitrary Bash command string
 * (never an executable+argv pair) to this same re-exported function --
 * distinct from every boundedCopySafeCommand() test above, which builds its
 * opaque command line FROM an argv this module itself assembles. There is no
 * shadowable executable name to capture argv through for an arbitrary opaque
 * string (unlike the eval-based round-trip technique above), so this proves
 * the $CMD shell variable itself reconstructs byte-identical to the original
 * string -- the whole of what this renderer's contract promises for a value
 * it never parses.
 */
test("NVA-B-HGOCOPYSAFE-1: boundedOpaqueCopyCommand round-trips an already-assembled opaque command string containing a space, $, and non-ASCII characters through a real shell reconstruction, unexpanded", () => {
  const rawCommand = "node --check '/repo root/üöä-tool.mjs' --flag \"value with $HOME and a space\"";
  const built = boundedOpaqueCopyCommand(rawCommand);
  assert.equal(built.maxColumns, 72);
  if (process.platform === "win32") return;
  assert.ok(built.posix, "posix rendering must succeed for this input");
  const lines = built.posix.split("\n");
  assert.equal(lines.at(-1), 'eval "$CMD"');
  const assignments = lines.slice(0, -1).join("\n");
  const script = `${assignments}\nprintf '%s' "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout, rawCommand,
    "the posix opaque-copy rendering does not reconstruct the exact original command string");
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

/**
 * NVA-CF-BL24-DENIALBOILERPLATE: a short/fitting argv's inline `command`
 * already fits within the shared column bound, so the wrapped
 * posix/powershell/cmd renderings are all `null` -- only the one inline
 * `command` line is rendered. `maxColumns` is still present.
 */
test("a short argv (inline command fits the column bound) renders WITHOUT the wrapped posix/powershell/cmd forms", () => {
  const built = boundedCopySafeCommand({ executable: "node", argv: ["script.mjs", "--flag", "a value"] });
  assert.ok(built.command.length <= built.copyCommand.maxColumns,
    `test fixture must itself fit the bound: ${built.command}`);
  assert.equal(built.copyCommand.maxColumns, 72);
  assert.equal(built.copyCommand.posix, null);
  assert.equal(built.copyCommand.powershell, null);
  assert.equal(built.copyCommand.cmd, null);
});

/**
 * NVA-CF-BL24-DENIALBOILERPLATE: the inline `command` line itself is what a
 * caller with a short/fitting command is now expected to hand the human --
 * this proves that line still round-trips through a real bash eval, even
 * though no wrapped copyCommand rendering exists to prove it via.
 */
test("a short argv's bare inline command line still round-trips through a real bash eval to the exact intended argv", () => {
  const built = boundedCopySafeCommand({ executable: "node", argv: ["script.mjs", "--flag", "a value"] });
  if (process.platform === "win32") return;
  const script = `node() { printf '%s\\0' "$@"; }\n${built.command}`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, built.argv);
});

/**
 * NVA-CF-BL24-DENIALBOILERPLATE: a genuinely-too-long inline command (the
 * fixtureArgv() case used throughout this file, well over the 72-column
 * bound) still gets the full wrapped posix/powershell/cmd renderings -- the
 * conditional in boundedCopySafeCommand() only suppresses them when the
 * inline form actually fits.
 */
test("a genuinely-too-long argv still gets exact wrapped POSIX/PowerShell renderings and refuses an inexact cmd.exe rendering", () => {
  const built = boundedCopySafeCommand({ executable: "node", argv: fixtureArgv() });
  assert.ok(built.command.length > built.copyCommand.maxColumns,
    `test fixture must itself exceed the bound: ${built.command}`);
  assert.equal(typeof built.copyCommand.posix, "string");
  assert.equal(typeof built.copyCommand.powershell, "string");
  assert.equal(built.copyCommand.cmd, null,
    "cmd.exe does not treat POSIX single quotes as argv quoting, so a spaced argv must fail closed");
});

/**
 * NVA-CF-COPYSAFE: the placeholder() bug this task fixes. Both real callers
 * (guard-lifecycle-ready.mjs, guard-testpath.mjs) wrap LIVE data through
 * placeholder(JSON.stringify(<absolute path>)) -- never a genuine unresolved
 * template slot -- so it must never render verbatim: a path containing "$",
 * a backtick, or "$(" would otherwise be shell-expanded/command-substituted
 * the moment a human pastes the emitted command.
 */
test("boundedCopySafeCommand renders a placeholder()-wrapped JSON.stringify()'d path as a quoted literal, not verbatim -- a genuine template slot in the SAME command still renders verbatim", () => {
  const path = "/repo/root";
  const built = boundedCopySafeCommand({
    executable: "node",
    argv: ["script.mjs", "--repo", placeholder(JSON.stringify(path)), "--plan-sha256", placeholder("<plan-sha256>")],
  });
  // The live-data placeholder is recovered to its raw value in argv -- not the
  // JSON.stringify() wrapper, and not the shellWord()-quoted rendered text.
  assert.deepEqual(built.argv, ["script.mjs", "--repo", path, "--plan-sha256", "<plan-sha256>"]);
  // A safe path with no shell-special characters renders through shellWord() --
  // here that means bare/unquoted, since shellWord() only adds quotes when needed.
  assert.ok(built.command.includes(`--repo ${path} `), built.command);
  assert.ok(!built.command.includes(`"${path}"`), "the old verbatim JSON.stringify() quoting must be gone");
  // The genuine template slot in the SAME command still renders verbatim, unchanged.
  assert.ok(built.command.includes("--plan-sha256 <plan-sha256>"), built.command);
});

test("NVA-CF-COPYSAFE: a JSON.stringify()'d path containing $, a backtick, or $( survives a real bash -c round-trip through placeholder() unexpanded/unsubstituted", () => {
  const dangerousPath = "/repo/$HOME/`id`/$(id)/end";
  const built = boundedCopySafeCommand({
    executable: "node",
    argv: [
      "/plugin/scripts/guard-human-override.mjs",
      "plan",
      "--repo", placeholder(JSON.stringify(dangerousPath)),
      "--request-sha256", "a".repeat(64),
    ],
  });
  // argv recovers the raw dangerous path, not the JSON.stringify() wrapper.
  assert.deepEqual(built.argv, [
    "/plugin/scripts/guard-human-override.mjs", "plan", "--repo", dangerousPath, "--request-sha256", "a".repeat(64),
  ]);
  // The rendered command line must never contain the old verbatim (double-quoted,
  // shell-unsafe) JSON.stringify() form of the dangerous path.
  assert.ok(!built.command.includes(`"${dangerousPath}"`), built.command);
  if (process.platform === "win32") return;
  assert.ok(built.copyCommand.posix, "posix rendering must succeed for this input");
  const lines = built.copyCommand.posix.split("\n");
  assert.equal(lines.at(-1), 'eval "$CMD"');
  const assignments = lines.slice(0, -1).join("\n");
  // Same real-bash round-trip technique as the other tests in this file: a shell
  // function named "node" captures the exact argv a real shell reconstructs from
  // the bounded copy-safe rendering, WITHOUT ever invoking anything for real. If
  // "$HOME", the backtick command substitution, or "$(id)" were still live, the
  // captured tokens would differ from dangerousPath (or a subshell would run).
  const script = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, built.argv,
    "the dangerous path must round-trip through the bounded copy-safe rendering unexpanded/unsubstituted");
});

/**
 * NVA-CF-FORCEDQUOTE: the opt-in forced-quoting mode. codex-pretool-guard.mjs's
 * own test suite hard-pins `--repo "<path>"`-shaped exact double-quoted text,
 * which shellWord()'s conditional bare/single-quote choice cannot reproduce
 * for an ordinary path (shellWord() renders it bare). forcedQuote() forces the
 * double-quote character for that one argv entry without touching any other
 * entry's rendering, and without touching the default (no-forcedQuote) path.
 */
test("forcedQuote() requires a non-empty string", () => {
  assert.throws(() => forcedQuote(""), /non-empty string/u);
  assert.throws(() => forcedQuote(42), /non-empty string/u);
  assert.throws(() => forcedQuote(), /non-empty string/u);
});

test("forcedQuote() forces double-quoting for its own argv entry while ordinary entries render exactly as shellWord() would", () => {
  const built = boundedCopySafeCommand({
    executable: "node",
    argv: ["script.mjs", "--repo", forcedQuote("/some/root"), "--request-sha256", "a".repeat(64)],
  });
  // Byte-identical to the pre-NVA-CF-COPYSAFE convention this mode restores for its
  // one forced entry: `JSON.stringify("/some/root")` === '"/some/root"'.
  assert.ok(built.command.includes('--repo "/some/root"'), built.command);
  // The unforced request-sha256 value still renders bare, exactly as shellWord() alone would.
  assert.ok(built.command.includes(`--request-sha256 ${"a".repeat(64)}`), built.command);
  assert.ok(!built.command.includes(`'${"a".repeat(64)}'`), built.command);
  // The returned argv resolves forcedQuote() entries to their plain (unquoted) text.
  assert.deepEqual(built.argv, ["script.mjs", "--repo", "/some/root", "--request-sha256", "a".repeat(64)]);
});

test("forcedQuote() differs from shellWord()'s own choice for the same ordinary value -- proving the mode actually forces the quote character", () => {
  const asForced = boundedCopySafeCommand({ executable: "node", argv: ["script.mjs", "--repo", forcedQuote("/some/root")] });
  const asOrdinary = boundedCopySafeCommand({ executable: "node", argv: ["script.mjs", "--repo", "/some/root"] });
  assert.ok(asForced.command.includes('--repo "/some/root"'), asForced.command);
  assert.ok(asOrdinary.command.includes("--repo /some/root"), asOrdinary.command);
  assert.notEqual(asForced.command, asOrdinary.command);
});

test("boundedCopySafeCommand with no placeholder() and no forcedQuote() entries stays byte-identical to before either mode existed", () => {
  const argvWithForcedElsewhere = boundedCopySafeCommand({ executable: "node", argv: fixtureArgv() });
  assert.equal(argvWithForcedElsewhere.command, renderProjectOnboardingAction({ kind: "command", executable: "node", argv: fixtureArgv() }));
});

test("forcedQuote() and placeholder() may be combined in the same command, each rendering through its own rule", () => {
  const built = boundedCopySafeCommand({
    executable: "node",
    argv: ["script.mjs", "--repo", forcedQuote("/some/root"), "--plan-sha256", placeholder("<plan-sha256>")],
  });
  assert.ok(built.command.includes('--repo "/some/root"'), built.command);
  assert.ok(built.command.includes("--plan-sha256 <plan-sha256>"), built.command);
  assert.deepEqual(built.argv, ["script.mjs", "--repo", "/some/root", "--plan-sha256", "<plan-sha256>"]);
});

test("forcedQuote() escapes $, a backtick and a double quote inside its forced quoting -- it never reintroduces the verbatim-JSON.stringify() shell-injection class placeholder()'s own fix closed", () => {
  const dangerousPath = "/repo/$HOME/`id`/\"quoted\"/end";
  const built = boundedCopySafeCommand({
    executable: "node",
    argv: ["/plugin/scripts/guard-human-override.mjs", "plan", "--repo", forcedQuote(dangerousPath), "--request-sha256", "a".repeat(64)],
  });
  assert.deepEqual(built.argv, ["/plugin/scripts/guard-human-override.mjs", "plan", "--repo", dangerousPath, "--request-sha256", "a".repeat(64)]);
  // The rendered command must never contain the dangerous path with its "$"/backtick/quote live and unescaped.
  assert.ok(!built.command.includes(`"${dangerousPath}"`), built.command);
  if (process.platform === "win32") return;
  assert.ok(built.copyCommand.posix, "posix rendering must succeed for this input");
  const lines = built.copyCommand.posix.split("\n");
  assert.equal(lines.at(-1), 'eval "$CMD"');
  const assignments = lines.slice(0, -1).join("\n");
  const script = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, built.argv,
    "the dangerous path must round-trip through the forced-quote rendering unexpanded/unsubstituted");
});

test("boundedCopySafeCommand refuses an argv entry that is neither a string, a placeholder(), nor a forcedQuote() value", () => {
  assert.throws(() => boundedCopySafeCommand({ executable: "node", argv: ["a", {}] }), /non-empty argv/u);
  assert.throws(() => boundedCopySafeCommand({ executable: "node", argv: ["a", null] }), /non-empty argv/u);
});

test("renderHumanCopySafeCommand emits bounded POSIX and PowerShell blocks by default, plus cmd.exe when the argv is representable", () => {
  const rendered = renderHumanCopySafeCommand({
    label: "push",
    executable: "git",
    argv: ["push", "origin", `HEAD:refs/heads/${"release".repeat(12)}`],
  });
  assert.match(rendered.text, /^Step: push\nPOSIX:\n/u);
  assert.match(rendered.text, /\nPowerShell:\n/u);
  assert.match(rendered.text, /\ncmd\.exe:\r?\n/u);
  assert.equal(
    rendered.text.split(/\r?\n/u).every((line) => line.length <= rendered.copyCommand.maxColumns),
    true,
    rendered.text,
  );
  assert.ok(rendered.command.length > rendered.copyCommand.maxColumns, "fixture must exercise a wrapped command");
  assert.equal(rendered.text.includes(rendered.command), false, "the unsafe unbounded primary line must not be printed");
});

test("renderHumanCopySafeCommand preserves exact argv through every real shell available on this host", () => {
  const expected = ["/a very long/absolute path/with spaces/über/file.txt", "snowman-☃", "z".repeat(80)];
  const rendered = renderHumanCopySafeCommand({
    label: "round-trip",
    executable: process.execPath,
    argv: ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", ...expected],
  });
  const posix = spawnSync("bash", ["-c", rendered.copyCommand.posix], { encoding: "utf8" });
  assert.equal(posix.status, 0, posix.stderr);
  assert.deepEqual(JSON.parse(posix.stdout), expected);

  const powerShellProbe = spawnSync("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], { encoding: "utf8" });
  if (!powerShellProbe.error && powerShellProbe.status === 0) {
    const powershell = spawnSync("pwsh", ["-NoProfile", "-Command", rendered.copyCommand.powershell], { encoding: "utf8" });
    assert.equal(powershell.status, 0, powershell.stderr);
    assert.deepEqual(JSON.parse(powershell.stdout), expected);
  }

  if (process.platform === "win32" && rendered.copyCommand.cmd) {
    const cmd = spawnSync("cmd.exe", ["/d", "/s", "/c", rendered.copyCommand.cmd], { encoding: "utf8" });
    assert.equal(cmd.status, 0, cmd.stderr);
    assert.deepEqual(JSON.parse(cmd.stdout), expected);
  }
});

test("renderHumanCopySafeCommand keeps explicit placeholders visible while bounding every physical line", () => {
  const rendered = renderHumanCopySafeCommand({
    label: "authorize-by-signature",
    executable: process.execPath,
    argv: [
      "/a long plugin root/über/scripts/guard-human-override.mjs",
      "authorize-by-signature",
      "--repo", "/a long repository root/with spaces/über",
      "--request-sha256", "a".repeat(64),
      "--plan-sha256", placeholder("<plan-sha256>"),
      "--proof", placeholder("<external-proof.json>"),
    ],
  });
  assert.match(rendered.command, /--plan-sha256 <plan-sha256>/u);
  assert.match(rendered.command, /--proof <external-proof\.json>/u);
  assert.equal(rendered.text.split(/\r?\n/u).every((line) => line.length <= 72), true, rendered.text);
  assert.doesNotMatch(rendered.text, /available on demand|render-copy-safe/u);
});

const TESTPATH_GUARD = fileURLToPath(new URL("../hooks/guard-testpath.mjs", import.meta.url));

function testpathFixture(mode, prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{
      id: "TP-COPY-SAFE",
      pattern: "src/domain/important\\.test\\.mjs$",
      reason: "fixture protected project test",
    }],
  }));
  writeFileSync(
    join(root, "pipeline.user.yaml"),
    `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${mode}"\n`,
  );
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
  return root;
}

function testpathDenial(root) {
  const result = spawnSync(process.execPath, [TESTPATH_GUARD], {
    input: JSON.stringify({
      tool_name: "Edit",
      tool_input: {
        file_path: join(root, "src", "domain", "important.test.mjs"),
        old_string: "a",
        new_string: "b",
      },
    }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    timeout: 10_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 2, result.stderr);
  return result.stderr;
}

function handoffShellBlock(stderr, step, shell) {
  const lines = stderr.split(/\r?\n/u);
  const stepIndex = lines.indexOf(`Step: ${step}`);
  assert.notEqual(stepIndex, -1, stderr);
  const label = shell === "posix" ? "POSIX:" : shell === "powershell" ? "PowerShell:" : "cmd.exe:";
  const invocation = shell === "posix" ? 'eval "$CMD"' : shell === "powershell" ? "Invoke-Expression $CMD" : "%CMD%";
  const labelIndex = lines.indexOf(label, stepIndex + 1);
  assert.notEqual(labelIndex, -1, `${label} missing after Step: ${step}\n${stderr}`);
  const endIndex = lines.indexOf(invocation, labelIndex + 1);
  assert.notEqual(endIndex, -1, `${invocation} missing after ${label}\n${stderr}`);
  return lines.slice(labelIndex + 1, endIndex + 1).join(shell === "cmd" ? "\r\n" : "\n");
}

function assertBoundedTestpathDefault(stderr) {
  assert.match(stderr, /Step: plan\nPOSIX:/u);
  assert.match(stderr, /PowerShell:/u);
  assert.match(stderr, /Request binding \(not a command\): --request-sha256 [a-f0-9]{64}/u);
  assert.doesNotMatch(stderr, /available on demand|render-copy-safe/u);
  assert.doesNotMatch(
    stderr,
    /^(?:node|\S*node) .*guard-human-override\.mjs .*--repo /mu,
    "default output must not contain a flat primary command",
  );
  const commandLines = stderr.split(/\r?\n/u).filter((line) =>
    /^(?:Step: |POSIX:|PowerShell:|cmd\.exe:|CMD=|\$CMD (?:=|\+=) |set "CMD=|eval "\$CMD"|Invoke-Expression \$CMD|%CMD%)/u.test(line));
  assert.ok(commandLines.length > 10, stderr);
  assert.equal(commandLines.every((line) => line.length <= 72), true, commandLines.join("\n"));
}

test("test-path default hand-off round-trips the bounded POSIX/PowerShell plan command with spaces and Unicode", () => {
  const root = testpathFixture("signature", `guard testpath copy safe über ${"long-".repeat(8)}`);
  try {
    const stderr = testpathDenial(root);
    assertBoundedTestpathDefault(stderr);
    assert.match(stderr, /Step: authorize-by-signature/u);

    const posix = spawnSync("bash", ["-c", handoffShellBlock(stderr, "plan", "posix")], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(posix.status, 0, posix.stderr);
    const planned = JSON.parse(posix.stdout);
    assert.match(planned.requestSha256, /^[a-f0-9]{64}$/u);

    const probe = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    if (!probe.error && probe.status === 0) {
      const powershell = spawnSync(
        "pwsh",
        ["-NoProfile", "-NonInteractive", "-Command", handoffShellBlock(stderr, "plan", "powershell")],
        { encoding: "utf8", timeout: 10_000 },
      );
      assert.equal(powershell.status, 0, powershell.stderr);
      assert.deepEqual(JSON.parse(powershell.stdout), planned);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("test-path default chat hand-off includes cmd.exe when the exact argv is representable", () => {
  const root = testpathFixture("chat", "gcopy-");
  try {
    const stderr = testpathDenial(root);
    assertBoundedTestpathDefault(stderr);
    assert.match(stderr, /Step: authorize\n/u);
    assert.doesNotMatch(stderr, /Step: authorize-by-signature/u);
    assert.match(handoffShellBlock(stderr, "plan", "cmd"), /%CMD%$/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * NVA-B-COPYSAFE (backlog/items/2026-08-31-copy-safe-renderer-wrap-point-is-
 * path-length-sensitive.md): before this fix, boundedAssignmentLines()
 * (project-onboarding-v3.mjs) chunked the already-assembled opaque command
 * string purely by column count, with no notion of token or path-segment
 * boundaries -- so whether "guard-human-override.mjs" survived as one
 * contiguous, greppable string in the rendered denial depended only on the
 * incidental total length of the embedded absolute paths (i.e. the checkout
 * path length), not on anything a human did. Measured live: a single-assertion
 * regex failure (guard-lifecycle-ready.test.mjs, NOVA-LCR-HGO-1) reproduced at
 * ~60/~63-char checkout paths and NOT at a 41-char checkout path. Direct
 * measurement at the renderer level (never a whole clone) showed the effect
 * is periodic, not a simple "long path" threshold: splits occurred in bands
 * roughly every 62 characters of embedded path length. This test spans two
 * full such bands (synthetic checkout lengths 1..150) plus a third partial
 * band up to 250, so a future regression in the wrap point fails at EVERY
 * checkout depth in that range, not only in a deep checkout that happens to
 * fall inside one particular band.
 */
test("NVA-B-COPYSAFE: a script filename embedded in the copy-safe plan command stays one contiguous, greppable string across a range of checkout path lengths spanning the measured wrap-point-sensitive bands", () => {
  const failures = [];
  for (let checkoutLen = 1; checkoutLen <= 250; checkoutLen += 1) {
    const checkout = "/" + "c".repeat(Math.max(0, checkoutLen - 1));
    const script = `${checkout}/plugins/pipeline-core/scripts/guard-human-override.mjs`;
    const rendered = renderHumanCopySafeCommand({
      label: "plan",
      executable: "node",
      argv: [
        placeholder(JSON.stringify(script)), "plan", "--repo", placeholder(JSON.stringify(checkout)),
        "--request-sha256", "a".repeat(64),
      ],
    });
    if (!rendered.text.includes("guard-human-override.mjs")) failures.push(checkoutLen);
    // The bound itself must never be violated as a side effect of preferring
    // a delimiter-aligned wrap point.
    if (!rendered.text.split(/\r?\n/u).every((line) => line.length <= 72)) failures.push(`${checkoutLen}(bound)`);
  }
  assert.deepEqual(failures, [], `script filename split or bound exceeded at checkout lengths: ${failures.join(", ")}`);
});

/**
 * NVA-B-COPYSAFE, round-trip half of the same fix: the delimiter-preferring
 * wrap point must still reconstruct the EXACT original argv through a real
 * shell eval, at a checkout length previously inside a failing band (~60
 * chars measured live -- backlog item's own second data point).
 */
test("NVA-B-COPYSAFE: the delimiter-aligned wrap point still round-trips the exact argv through a real bash eval at a previously-splitting checkout length", () => {
  if (process.platform === "win32") return;
  const checkout = "/" + "c".repeat(59);
  const script = `${checkout}/plugins/pipeline-core/scripts/guard-human-override.mjs`;
  const rendered = renderHumanCopySafeCommand({
    label: "plan",
    executable: "node",
    argv: [
      placeholder(JSON.stringify(script)), "plan", "--repo", placeholder(JSON.stringify(checkout)),
      "--request-sha256", "a".repeat(64),
    ],
  });
  assert.ok(rendered.text.includes("guard-human-override.mjs"), rendered.text);
  const lines = rendered.copyCommand.posix.split("\n");
  assert.equal(lines.at(-1), 'eval "$CMD"');
  const assignments = lines.slice(0, -1).join("\n");
  const script2 = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script2], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, [script, "plan", "--repo", checkout, "--request-sha256", "a".repeat(64)]);
});

/**
 * NVA-B-COPYSAFE, the AC-3 fallback: a single path SEGMENT (no "/", no " ")
 * wider than one entire physical line has no delimiter to back off to, so it
 * still gets split mid-token -- this is the one case the column bound makes
 * avoidance genuinely impossible. That fallback stays DEFINED and TESTED
 * here (bound still holds; reconstruction stays byte-exact) rather than
 * incidental, per this backlog item's own AC-3.
 */
test("NVA-B-COPYSAFE: a single path segment wider than one whole line falls back to a mid-token split, defined and tested rather than incidental -- the bound still holds and reconstruction stays byte-exact", () => {
  const hugeFilename = `${"a".repeat(120)}.mjs`;
  const built = boundedCopySafeCommand({ executable: "node", argv: [`/root/${hugeFilename}`, "plan"] });
  assert.equal(typeof built.copyCommand.posix, "string");
  const lines = built.copyCommand.posix.split("\n");
  assert.equal(lines.every((line) => line.length <= 72), true, built.copyCommand.posix);
  // The huge segment does NOT survive as one contiguous string -- documented,
  // expected fallback behaviour, not a silent readability regression (there
  // was no shorter filename available to preserve).
  assert.ok(!built.copyCommand.posix.includes(hugeFilename), built.copyCommand.posix);
  if (process.platform === "win32") return;
  const assignments = lines.slice(0, -1).join("\n");
  const script = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, [`/root/${hugeFilename}`, "plan"]);
});

/**
 * NVA-B-COPYSAFE-FIX (AC-1; scratch/findings-registry-round-H.md F-1): the
 * delimiter predicate is three-armed (space, forward slash, backslash), but
 * every NVA-B-COPYSAFE test above builds POSIX-only (forward-slash) inputs,
 * so the backslash arm is never taken -- an edit that drops or mistypes it
 * would restore the pre-fix defect on the Windows half of the documented
 * dual-platform contract with every existing suite still green. This test
 * builds the same Windows-launcher-path shape the reviewer measured
 * (`C:\<root>\plugins\pipeline-core\scripts\guard-human-override.mjs`,
 * scanned over root lengths 1..60, where the reviewer measured the
 * space/forward-slash-only predicate re-splitting the filename at 23 of 60
 * lengths) and pins contiguity across that exact range.
 */
test("NVA-B-COPYSAFE-FIX (AC-1): a Windows backslash-delimited script path stays contiguous across a range of root lengths -- pins the backslash arm of the delimiter predicate", () => {
  const failures = [];
  for (let rootLen = 1; rootLen <= 60; rootLen += 1) {
    const root = `C:\\${"r".repeat(rootLen)}`;
    const script = `${root}\\plugins\\pipeline-core\\scripts\\guard-human-override.mjs`;
    const rendered = renderHumanCopySafeCommand({
      label: "plan",
      executable: "node",
      argv: [
        placeholder(JSON.stringify(script)), "plan", "--repo", placeholder(JSON.stringify(root)),
        "--request-sha256", "a".repeat(64),
      ],
    });
    if (!rendered.text.includes("guard-human-override.mjs")) failures.push(rootLen);
    if (!rendered.text.split(/\r?\n/u).every((line) => line.length <= 72)) failures.push(`${rootLen}(bound)`);
  }
  assert.deepEqual(failures, [], `Windows-delimited script filename split or bound exceeded at root lengths: ${failures.join(", ")}`);
});

/**
 * NVA-B-COPYSAFE-FIX (AC-2/AC-3; scratch/findings-registry-round-H.md F-2):
 * the NVA-B-COPYSAFE contiguity pin above asserts against the CONCATENATED
 * `rendered.text`. `renderHumanCopySafeCommand` assembles that text from
 * three INDEPENDENTLY chunked blocks (posix/powershell/cmd), and those
 * blocks do not share wrap points -- each renderer uses a different
 * per-line prefix, so the same value chunks differently in each. A
 * regression that re-splits the filename in exactly ONE renderer is
 * therefore masked by `includes()` on the concatenated text, which is
 * satisfied by any one surviving block. This test checks
 * `copyCommand.posix` / `.powershell` / `.cmd` SEPARATELY, spanning
 * checkout lengths 1..250 -- the same range the reviewer independently
 * re-measured per renderer (empty failure set), and the same range the
 * NVA-B-COPYSAFE test above spans for the concatenated property (two full
 * measured wrap-point-sensitive bands plus a third partial band).
 */
test("NVA-B-COPYSAFE-FIX (AC-2/AC-3): the script filename stays contiguous in EACH renderer separately -- posix, powershell and cmd -- across a range of checkout lengths spanning the measured wrap-point-sensitive bands", () => {
  const failures = [];
  for (let checkoutLen = 1; checkoutLen <= 250; checkoutLen += 1) {
    const checkout = "/" + "c".repeat(Math.max(0, checkoutLen - 1));
    const script = `${checkout}/plugins/pipeline-core/scripts/guard-human-override.mjs`;
    const rendered = renderHumanCopySafeCommand({
      label: "plan",
      executable: "node",
      argv: [
        placeholder(JSON.stringify(script)), "plan", "--repo", placeholder(JSON.stringify(checkout)),
        "--request-sha256", "a".repeat(64),
      ],
    });
    for (const [rendererLabel, block, lineSep] of [
      ["posix", rendered.copyCommand.posix, "\n"],
      ["powershell", rendered.copyCommand.powershell, "\n"],
      ["cmd", rendered.copyCommand.cmd, "\r\n"],
    ]) {
      // A per-renderer block may legitimately be null (that renderer cannot
      // safely represent this value at all) -- see the sibling suite's own
      // "may legitimately be null" note; skip only the null block, never the
      // whole checkoutLen iteration.
      if (block === null) continue;
      if (!block.includes("guard-human-override.mjs")) failures.push(`${checkoutLen}(${rendererLabel})`);
      if (!block.split(lineSep).every((line) => line.length <= rendered.copyCommand.maxColumns)) {
        failures.push(`${checkoutLen}(${rendererLabel},bound)`);
      }
    }
  }
  assert.deepEqual(failures, [], `script filename split or bound exceeded, per renderer, at: ${failures.join(", ")}`);
});
