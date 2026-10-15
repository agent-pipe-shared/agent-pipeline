// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.native-patch-rename-drops-protected-content-markers (AC-215).
// A native patch that renames a file (`*** Move to:`) must carry the protected
// acknowledgement-marker content fact to BOTH identities, isolate it per file
// operation, keep harmless renames admitted and keep inactive repositories a
// no-op. The real guard-apply-patch.mjs source and the real
// evaluateLifecycleReadyGuard are exercised; the parser is extracted from the
// production source with the same documented seam the adjacent test uses.
// Fixtures live under the repository scratch/ directory.
//
// Host limitation: none of these cases needs directory mode bits or directory
// symlinks, so no case is skipped on the native Windows host (the Linux/WSL
// run, owner Coordinator, due 2026-10-19, PO decision K7, adds nothing here).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import { recordConsentGiven } from "../onboarding-consent-marker.mjs";
import { observeGovernanceScope } from "../governance-scope.mjs";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, "..", "..");
const repoRoot = join(pluginRoot, "..", "..");
const guardPath = join(pluginRoot, "hooks", "guard-apply-patch.mjs");
const guardSource = readFileSync(guardPath, "utf8");
// Assembled at runtime: the literal marker is writer-only and must not be
// authored into any file by hand.
const MARKER = ["<!-- po-plan-acknowledged:", "content-sound-and-spec-consistent -->"].join(" ");
const WRITER_ONLY = /GUARD-BOOTSTRAP-ACKNOWLEDGEMENT-WRITER-ONLY/u;

mkdirSync(join(repoRoot, "scratch"), { recursive: true });

// A scratch directory that is its own (minimal) repository root, so governance
// scope resolves to the fixture and not to the enclosing checkout.
function scratchRepo(prefix) {
  const root = mkdtempSync(join(repoRoot, "scratch", prefix));
  mkdirSync(join(root, ".git", "objects"), { recursive: true });
  mkdirSync(join(root, ".git", "refs"), { recursive: true });
  writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
  return root;
}

function fixture() {
  const root = scratchRepo("rename-marker-pin-");
  mkdirSync(join(root, ".claude"), { recursive: true });
  recordConsentGiven({ rootDir: root });
  assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true);
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  return root;
}

// Run the real parser/translation section of a guard source (production by
// default; a scratch mirror for the RED proofs).
function parse(command, source = guardSource) {
  const start = source.indexOf("const lines = command.replace");
  const end = source.indexOf("let exitCode = 0;", start);
  const gs = source.indexOf("const GUARDS =");
  const ge = source.indexOf("const MAX_PARALLEL_GUARDS", gs);
  assert.ok(start >= 0 && end > start && gs >= 0 && ge > gs, "parser seam anchors present");
  const guards = source.slice(gs, ge).replaceAll("import.meta.url", JSON.stringify(pathToFileURL(guardPath).href));
  return vm.runInNewContext(`${guards}\n${source.slice(start, end)}\n({ paths, jobs })`, {
    command, input: { session_id: "rename-marker-pin" }, URL, fileURLToPath,
    block(reason) { throw new Error(reason); },
  });
}

const patch = (...body) => ["*** Begin Patch", ...body, "*** End Patch"].join("\n");
const facts = (parsed) => Array.from(parsed.paths, (p) => [p.filePath, p.patchContainsAcknowledgementMarker]);
const lifecycleJobs = (parsed) => parsed.jobs.filter((j) => j.path.endsWith("guard-lifecycle-ready.mjs"));

function lifecycle(job, root) {
  return evaluateLifecycleReadyGuard(JSON.parse(job.input), { projectDir: root, runner: "codex" });
}

test("the marker pinned here is the one the production guard scans for", () => {
  assert.ok(guardSource.includes(`line.includes(${JSON.stringify(MARKER)})`));
});

test("AC1a marker in a plain Update reaches the writer-only denial", () => {
  const root = fixture();
  try {
    const parsed = parse(patch("*** Update File: specs/plan.md", "@@", `+${MARKER}`));
    assert.deepEqual(facts(parsed), [["specs/plan.md", true]]);
    for (const job of lifecycleJobs(parsed)) {
      const r = lifecycle(job, root);
      assert.equal(r.exitCode, 2, JSON.stringify(r));
      assert.match(r.stderr, WRITER_ONLY);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const eof of [false, true]) {
  test(`AC1b marker after Move to reaches original AND destination, eof=${eof}`, () => {
    const root = fixture();
    try {
      const parsed = parse(patch("*** Update File: specs/plan.md", "*** Move to: specs/renamed-plan.md", "@@", `+${MARKER}`, ...(eof ? ["*** End of File"] : [])));
      assert.deepEqual(facts(parsed), [["specs/plan.md", true], ["specs/renamed-plan.md", true]]);
      const jobs = lifecycleJobs(parsed);
      assert.equal(jobs.length, 2);
      for (const job of jobs) {
        const r = lifecycle(job, root);
        assert.equal(r.exitCode, 2, JSON.stringify(r));
        assert.match(r.stderr, WRITER_ONLY);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("AC1c marker observed before Move to protects the destination too", () => {
  const root = fixture();
  try {
    const parsed = parse(patch("*** Update File: specs/plan.md", "@@", `+${MARKER}`, "*** Move to: specs/renamed-plan.md"));
    assert.deepEqual(facts(parsed), [["specs/plan.md", true], ["specs/renamed-plan.md", true]]);
    for (const job of lifecycleJobs(parsed)) assert.match(lifecycle(job, root).stderr, WRITER_ONLY);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC1d marker in an Add File also reaches the writer-only denial", () => {
  const root = fixture();
  try {
    const parsed = parse(patch("*** Add File: specs/new-plan.md", `+${MARKER}`));
    assert.deepEqual(facts(parsed), [["specs/new-plan.md", true]]);
    assert.match(lifecycle(lifecycleJobs(parsed)[0], root).stderr, WRITER_ONLY);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const eof of [false, true]) {
  test(`AC2a harmless rename claims no marker fact and is not writer-only denied, eof=${eof}`, () => {
    const root = fixture();
    try {
      const parsed = parse(patch("*** Update File: specs/plan.md", "*** Move to: specs/renamed-plan.md", "@@", "+ordinary staging prose", ...(eof ? ["*** End of File"] : [])));
      assert.deepEqual(facts(parsed), [["specs/plan.md", false], ["specs/renamed-plan.md", false]]);
      assert.equal(parsed.jobs.every((j) => JSON.parse(j.input).tool_input.patchContainsAcknowledgementMarker === false), true);
      for (const job of lifecycleJobs(parsed)) assert.doesNotMatch(lifecycle(job, root).stderr ?? "", WRITER_ONLY);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("AC2b facts are isolated per operation (rename, plain Update, Add, Delete neighbours)", () => {
  const parsed = parse(patch(
    "*** Update File: a/marked.md", "*** Move to: a/marked-renamed.md", "@@", `+${MARKER}`, "*** End of File",
    "*** Update File: b/ordinary.md", "*** Move to: b/ordinary-renamed.md", "@@", "+ordinary", "*** End of File",
    "*** Add File: c/added.md", "+ordinary",
    "*** Delete File: d/gone.md",
    "*** Update File: e/plain.md", "@@", "+ordinary",
  ));
  assert.deepEqual(facts(parsed), [
    ["a/marked.md", true], ["a/marked-renamed.md", true],
    ["b/ordinary.md", false], ["b/ordinary-renamed.md", false],
    ["c/added.md", false], ["d/gone.md", false], ["e/plain.md", false],
  ]);
});

test("AC2c a marker in a later operation does not leak back onto an earlier rename", () => {
  const parsed = parse(patch(
    "*** Update File: b/ordinary.md", "*** Move to: b/ordinary-renamed.md", "@@", "+ordinary", "*** End of File",
    "*** Update File: a/marked.md", "@@", `+${MARKER}`,
  ));
  assert.deepEqual(facts(parsed), [["b/ordinary.md", false], ["b/ordinary-renamed.md", false], ["a/marked.md", true]]);
});

test("AC2d inactive repository stays an unconditional no-op through the real CLI", () => {
  const root = scratchRepo("rename-marker-pin-inactive-");
  try {
    assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, false);
    const command = patch("*** Update File: specs/plan.md", "*** Move to: specs/renamed-plan.md", "@@", `+${MARKER}`, "*** End of File");
    const r = spawnSync(process.execPath, [guardPath], {
      cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8",
      input: JSON.stringify({ tool_name: "apply_patch", tool_input: { command } }),
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC3 the committed source keeps the carry-over (Move to extends the active identities)", () => {
  assert.match(guardSource, /activePaths\.push\(destination\)/u);
  assert.match(guardSource, /entry\.patchContainsAcknowledgementMarker = true/u);
  // The installed-plugin copy and integrated qualification are held by the
  // Coordinator; this pin covers the committed source only.
});

// RED proofs against in-memory scratch mirrors of the production function: the
// original defect and a cross-operation leak must each be detectable by the
// same assertions the pin makes. Production is never edited.
test("RED mirror: clearing the active path at Move to drops the destination fact", () => {
  const mirror = guardSource.replace("const move = line.match(/^\\*\\*\\* Move to:(.*)$/);", "const move = null;");
  assert.notEqual(mirror, guardSource, "mirror mutation applied");
  const command = patch("*** Update File: specs/plan.md", "*** Move to: specs/renamed-plan.md", "@@", `+${MARKER}`);
  assert.deepEqual(facts(parse(command)), [["specs/plan.md", true], ["specs/renamed-plan.md", true]]);
  assert.deepEqual(facts(parse(command, mirror)), [["specs/plan.md", false], ["specs/renamed-plan.md", false]]);
});

test("RED mirror: accumulating active paths leaks a marker fact onto another operation", () => {
  const needle = 'activePaths = raw.startsWith(" ") ? [raw.slice(1)] : [];';
  assert.ok(guardSource.includes(needle));
  const mirror = guardSource.replace(needle, 'activePaths = [...activePaths, raw.slice(1)];')
    .replace('if (line.startsWith("*** ")) { activePaths = []; continue; }', 'if (line.startsWith("*** ")) { continue; }');
  const command = patch("*** Update File: a/marked.md", "@@", `+${MARKER}`, "*** Update File: b/other.md", "@@", `+${MARKER}`);
  const crossLeak = patch("*** Update File: b/ordinary.md", "@@", "+ordinary", "*** Update File: a/marked.md", "@@", `+${MARKER}`);
  assert.deepEqual(facts(parse(crossLeak)), [["b/ordinary.md", false], ["a/marked.md", true]]);
  assert.deepEqual(facts(parse(crossLeak, mirror)), [["b/ordinary.md", true], ["a/marked.md", true]]);
  assert.ok(command);
});
