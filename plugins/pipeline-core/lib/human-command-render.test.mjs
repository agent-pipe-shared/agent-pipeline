// SPDX-License-Identifier: SUL-1.0
// C30J-J22 (AC-112, closest accepted criterion): every command printed for the human is shaped for its target shell by ONE renderer.
// The argv, the digests and the signing subject are never touched: only the displayed string changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { boundedCopySafeCommand, renderHumanCopySafeCommand } from "./copy-safe-command.mjs";
import { authorizeCriticalPushCommand, poHumanApprovalSetupCommand } from "../scripts/po-human-approval.mjs";
import { boundedCopySafeCommandForBash, humanCommandLine, posixPathArgv, renderHumanCommand, renderHumanStep } from "./human-command-render.mjs";

const WIN_SCRIPT = "C:\\Users\\someone\\.claude\\plugins\\pipeline-core\\scripts\\pipeline-state.mjs";
const WIN_PROOF = "C:\\work\\proj\\scratch\\critical-push-request-abcdef123456.json";
const SHA = "a".repeat(64);

test("a bash block for Windows-style paths carries forward-slash paths and no backslash", () => {
  const block = renderHumanCommand({ executable: "node", argv: [WIN_SCRIPT, "approve-push", "--proof-request", WIN_PROOF], shell: "bash" });
  assert.doesNotMatch(block, /\\/u);
  assert.match(block, /C:\/Users\/someone\/\.claude/u);
  assert.match(block, /eval "\$CMD"/u);
});

test("the bash block runs in a real bash and hands each path through as one exact word", { skip: process.platform === "win32" }, () => {
  const block = renderHumanCommand({ executable: "printf", argv: ["%s\\n", WIN_SCRIPT, WIN_PROOF], shell: "bash" });
  const run = spawnSync("bash", ["-c", block], { encoding: "utf8", shell: false, timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.split("\n").slice(0, 2), ["C:/Users/someone/.claude/plugins/pipeline-core/scripts/pipeline-state.mjs", "C:/work/proj/scratch/critical-push-request-abcdef123456.json"]);
});

test("a PowerShell block keeps the native backslash form unless the caller asks for the posix style", () => {
  const argv = [WIN_SCRIPT, "--proof-request", WIN_PROOF];
  assert.match(renderHumanCommand({ executable: "node", argv, shell: "powershell" }), /C:\\Users\\someone/u);
  assert.doesNotMatch(renderHumanCommand({ executable: "node", argv, shell: "powershell", pathStyle: "posix" }), /\\/u);
  assert.match(renderHumanCommand({ executable: "node", argv, shell: "bash", pathStyle: "native" }), /C:\\Users\\someone/u);
});

test("only absolute Windows paths are reshaped: hashes, flags, relative paths and any other backslash value stay as given", () => {
  const argv = ["--by", "po", "--subject-sha256", SHA, "scratch/a.json", "--note=keep\\this", "two words\\here", "--repo-root=C:\\work\\proj", "scratch\\b.json", "\\\\host\\share\\x.json", "DOMAIN\\user"];
  assert.deepEqual(posixPathArgv(argv), ["--by", "po", "--subject-sha256", SHA, "scratch/a.json", "--note=keep\\this", "two words\\here", "--repo-root=C:/work/proj", "scratch\\b.json", "//host/share/x.json", "DOMAIN\\user"]);
  const plain = ["--by", "po", "scratch/a.json"];
  assert.equal(posixPathArgv(plain), plain, "nothing to reshape returns the same array");
});

test("the renderer refuses an unknown shell or path style by name", () => {
  assert.throws(() => renderHumanCommand({ executable: "node", argv: ["x"], shell: "zsh" }), /shell must be "bash" or "powershell"/u);
  assert.throws(() => renderHumanCommand({ executable: "node", argv: ["x"], shell: "bash", pathStyle: "dos" }), /pathStyle must be "posix" or "native"/u);
});

test("a step without a Windows path is byte-identical to the shared copy-safe rendering", () => {
  const input = { label: "agent push", executable: "git", argv: ["push", "origin", "HEAD:refs/heads/feat/x"] };
  assert.deepEqual(renderHumanStep(input), renderHumanCopySafeCommand(input));
});

test("a step with Windows paths keeps its heading, PowerShell and cmd blocks and fixes only the POSIX block", () => {
  const input = { label: "agent approve-push", executable: "node", argv: [WIN_SCRIPT, "approve-push", "--proof-request", WIN_PROOF] };
  const original = renderHumanCopySafeCommand(input);
  const step = renderHumanStep(input);
  const [posixPart, rest] = step.text.split("\nPowerShell:\n");
  assert.match(posixPart, /^Step: agent approve-push\nPOSIX:\n/u);
  assert.doesNotMatch(posixPart, /\\/u);
  assert.equal(rest, original.text.split("\nPowerShell:\n")[1], "PowerShell and cmd.exe blocks are byte-identical to the shared rendering");
  assert.deepEqual({ ...step, text: null, copyCommand: { ...step.copyCommand, posix: null } }, { ...original, text: null, copyCommand: { ...original.copyCommand, posix: null } },
    "executable, argv, command and the PowerShell and cmd copy blocks are untouched");
  assert.doesNotMatch(step.copyCommand.posix, /\\/u);
});

test("po-human-approval prints the authorize-critical command with a posix block free of backslashes, argv and command untouched", () => {
  const input = { repoRoot: "C:\\work\\proj", featureId: "feat-1", plan: "specs/plan.md", spec: "specs/spec.md",
    subjectSha256: SHA, expiresAt: "2030-01-01T00:00:00.000Z", launcher: "C:\\Users\\someone\\plugin\\scripts\\po-human-approval.mjs" };
  const built = authorizeCriticalPushCommand(input);
  assert.doesNotMatch(built.copyCommand.posix, /\\/u);
  assert.match(built.copyCommand.powershell, /C:\\Users\\someone/u);
  assert.ok(built.argv.includes(input.plan) && built.command.includes("C:\\work\\proj"), "machine fields keep the exact values");
  assert.ok(built.copyCommand.posix.replaceAll("'\nCMD=${CMD}'", "").includes(SHA), "the subject digest is relayed exactly");
});

test("the first-machine setup command is not reshaped (a third builder, outside the two adopted sites)", () => {
  const input = { repoRoot: "C:\\work\\proj", directory: "C:\\Users\\someone\\keys", launcher: "C:\\Users\\someone\\plugin\\scripts\\po-human-approval.mjs" };
  assert.deepEqual(poHumanApprovalSetupCommand(input), boundedCopySafeCommand({ executable: "node", argv: [input.launcher, "setup", "--repo-root", input.repoRoot, "--directory", input.directory] }));
});

test("push-prepare reshapes only the human signing step: approve-push and push are printed exactly as built", () => {
  const source = readFileSync(new URL("../scripts/push-prepare.mjs", import.meta.url), "utf8");
  assert.equal([...source.matchAll(/= renderHumanStep\(\{\s*label: "([^"]+)"/gu)].map((m) => m[1]).join(","), "human authorize-critical");
  assert.equal([...source.matchAll(/= renderHumanCopySafeCommand\(\{\s*label: "agent approve-push"/gu)].length, 2);
});

test("the bounded helper hands back the input unchanged when no path needs reshaping", () => {
  const built = boundedCopySafeCommandForBash({ executable: "node", argv: ["/opt/plugin/scripts/x.mjs", "--by", "po"] });
  assert.equal(built.argv.length, 3);
  assert.equal(built.command, "node /opt/plugin/scripts/x.mjs --by po");
});

// C31-L9 (AC-112, closest accepted criterion): one single-line command for prose a human copies, in the same path style as the block renderer.
test("humanCommandLine shows Windows-style paths forward-slashed on one line and quotes only what needs it", () => {
  const line = humanCommandLine({ executable: "node", argv: [WIN_SCRIPT, "--root", "C:\\work\\proj", "--by", "Some One", "--resume-lifecycle-id", "abc-1"] });
  assert.equal(line, 'node C:/Users/someone/.claude/plugins/pipeline-core/scripts/pipeline-state.mjs --root C:/work/proj --by "Some One" --resume-lifecycle-id abc-1');
});

test("humanCommandLine leaves a POSIX command as a plain join would and escapes shell-live characters", () => {
  assert.equal(humanCommandLine({ executable: "node", argv: ["/opt/p/x.mjs", "--root", "/w/p"] }), "node /opt/p/x.mjs --root /w/p");
  assert.equal(humanCommandLine({ executable: "node", argv: ["x.mjs", "a$b`c\"d"] }), 'node x.mjs "a\\$b\\`c\\"d"');
});
