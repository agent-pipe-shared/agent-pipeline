// SPDX-License-Identifier: SUL-1.0
// FANOUT slice S1: contract tests for the slice-queue library.
// Pure library: nothing here writes a file or touches private state. File loading is
// exercised through injected readers, plus two real-filesystem reads of paths that
// are never created (absent) or are this very test file (not JSON).
import assert from "node:assert/strict";
import { devNull } from "node:os";
import { openSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_STALE_AFTER_MINUTES as LEDGER_STALE_MINUTES } from "./fanout-ledger.mjs";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_STALE_AFTER_MINUTES,
  loadSliceQueue,
  normalizeScope,
  protectedFlag,
  readyAndLive,
  scopesOverlap,
  validateSliceQueue,
} from "./slice-queue.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const MINUTE = 60_000;
const iso = (ms) => new Date(ms).toISOString();
const ago = (minutes) => NOW - minutes * MINUTE;
const LINUX = { platform: "linux" };
const WIN = { platform: "win32" };
const MAC = { platform: "darwin" };

const cases = [];
function check(name, run) {
  cases.push({ id: `SQ${String(cases.length + 1).padStart(2, "0")}`, name, run });
}

function slice(id, writeScope = [], extra = {}) {
  return {
    id,
    title: `slice ${id}`,
    state: "ready",
    dependsOn: [],
    writeScope,
    tier: "implementor",
    commitMode: "diff-only",
    loadClass: "light",
    briefing: { ref: `specs/unit/briefings/${id}.md` },
    ...extra,
  };
}
function queue(slices, extra = {}) {
  return {
    schema: "pipeline.slice-queue.v1",
    feature: "unit",
    defaults: { commitMode: "diff-only", tier: "implementor" },
    monoliths: [],
    slices,
    ...extra,
  };
}
const codes = (list) => list.map((entry) => entry.code);
const validate = (slices, extra = {}, options = LINUX) => validateSliceQueue(queue(slices, extra), options);
const find = (result, id) => result.slices.find((entry) => entry.id === id);
const statusOf = (result, id) => find(result, id)?.status;
const reasonsOf = (result, id) => codes(find(result, id)?.reasons ?? []);
const delivered = (taskId) => ({ taskId, outcome: "completed", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" } });
const liveEntry = (sliceId, extra = {}) => ({ sliceId, sources: ["launch"], agentType: null, launchedAt: iso(ago(5)), lastActivityAt: iso(ago(1)), silentMinutes: 1, stale: false, ...extra });

// ---------------------------------------------------------------- normalizeScope

check("normalizeScope: separators, dot segments, duplicate slashes and the directory marker are canonicalised", () => {
  assert.deepEqual(normalizeScope("plugins\\pipeline-core\\lib\\", LINUX).alternatives, ["plugins/pipeline-core/lib/"]);
  assert.deepEqual(normalizeScope("./a//b/./c.mjs", LINUX).alternatives, ["a/b/c.mjs"]);
  assert.deepEqual(normalizeScope("  lib/a.mjs  ", LINUX).alternatives, ["lib/a.mjs"]);
  assert.equal(normalizeScope(".", LINUX).ok, true);
  assert.deepEqual(normalizeScope("./", LINUX).alternatives, ["./"]);
  assert.equal(normalizeScope("lib/a.mjs", LINUX).ok, true);
});

check("normalizeScope: absolute, drive, UNC, home, parent and stream scopes are refused with SQ-SCOPE", () => {
  const refused = [
    "",
    "   ",
    5,
    null,
    "/" + "var/data/x.mjs",
    ["Q", ":", "/proj/a.mjs"].join(""),
    ["Q", ":", "\\proj\\a.mjs"].join(""),
    "//" + "server/share/x",
    "\\\\" + "server\\share\\x",
    "~/notes.md",
    "../x.mjs",
    "a/../b.mjs",
    "a/b/..",
    "file.txt:stream",
    "a/b\u0000c",
    "{,a}",
  ];
  for (const value of refused) {
    const result = normalizeScope(value, LINUX);
    assert.equal(result.ok, false, `must refuse ${JSON.stringify(value)}`);
    assert.equal(result.code, "SQ-SCOPE");
    assert.equal(typeof result.reason, "string");
  }
});

check("normalizeScope: case-folds on win32 and darwin only, with an explicit override", () => {
  assert.deepEqual(normalizeScope("Lib/A.mjs", LINUX).alternatives, ["Lib/A.mjs"]);
  assert.deepEqual(normalizeScope("Lib/A.mjs", WIN).alternatives, ["lib/a.mjs"]);
  assert.deepEqual(normalizeScope("Lib/A.mjs", MAC).alternatives, ["lib/a.mjs"]);
  assert.deepEqual(normalizeScope("Lib/A.mjs", { platform: "linux", foldCase: true }).alternatives, ["lib/a.mjs"]);
  assert.deepEqual(normalizeScope("Lib/A.mjs", { platform: "win32", foldCase: false }).alternatives, ["Lib/A.mjs"]);
});

check("normalizeScope: brace expansion (nested, literal single-element braces, bounds) and unterminated syntax", () => {
  assert.deepEqual(normalizeScope("a/{b,c}/d.mjs", LINUX).alternatives, ["a/b/d.mjs", "a/c/d.mjs"]);
  assert.deepEqual(normalizeScope("a/{b,{c,d}}.mjs", LINUX).alternatives, ["a/b.mjs", "a/c.mjs", "a/d.mjs"]);
  assert.deepEqual(normalizeScope("a/{x}/b", LINUX).alternatives, ["a/{x}/b"]);
  assert.deepEqual(normalizeScope("a/{b,b}.mjs", LINUX).alternatives, ["a/b.mjs"]);
  assert.equal(normalizeScope("a/{b", LINUX).ok, false);
  assert.equal(normalizeScope("a/b}", LINUX).ok, false);
  assert.equal(normalizeScope("a/[b", LINUX).ok, false);
  assert.equal(normalizeScope("{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}", LINUX).ok, false, "128 alternatives exceed the bound");
  assert.equal(normalizeScope("{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}", LINUX).ok, true, "64 alternatives are within the bound");
});

// ---------------------------------------------------------------- scopesOverlap

check("scopesOverlap: files, directory prefixes (trailing slash, dotless literal, dot-directory) and siblings", () => {
  const o = (a, b, options = LINUX) => scopesOverlap(a, b, options);
  assert.equal(o("plugins/pipeline-core/lib/a.mjs", "plugins/pipeline-core/lib/a.mjs"), true);
  assert.equal(o("plugins/pipeline-core/lib/a.mjs", "plugins/pipeline-core/lib/b.mjs"), false);
  assert.equal(o("plugins/pipeline-core/lib/", "plugins/pipeline-core/lib/a.mjs"), true);
  assert.equal(o("plugins/pipeline-core/lib", "plugins/pipeline-core/lib/a.mjs"), true, "a literal last segment without a dot is a directory prefix");
  assert.equal(o("plugins/pipeline-core/lib", "plugins/pipeline-core/lib2/a.mjs"), false);
  assert.equal(o("lib/a.mjs", "lib/a.mjs/x"), false, "a literal last segment with a dot is exactly one file");
  assert.equal(o(".claude", ".claude/settings.json"), true, "a leading dot is not an extension dot");
  assert.equal(o("docs/", "docs"), true);
  assert.equal(o("docs/", "docs/state.md"), true);
  assert.equal(o("Makefile", "Makefile"), true);
  assert.equal(o("./", "anything/at/all.mjs"), true, "the repository root contains everything");
});

check("scopesOverlap: globstar, star, question mark and character classes", () => {
  const o = (a, b) => scopesOverlap(a, b, LINUX);
  assert.equal(o("lib/*.mjs", "lib/a.mjs"), true);
  assert.equal(o("lib/*.mjs", "lib/a.json"), false);
  assert.equal(o("lib/*.mjs", "lib/sub/a.mjs"), false, "a single star never crosses a separator");
  assert.equal(o("lib/**", "lib/sub/deep/a.mjs"), true);
  assert.equal(o("lib/**", "lib"), true, "a trailing globstar matches zero further segments");
  assert.equal(o("lib/**/a.mjs", "lib/a.mjs"), true, "a globstar matches zero segments");
  assert.equal(o("lib/**/a.mjs", "lib/x/y/a.mjs"), true);
  assert.equal(o("lib/**/a.mjs", "lib/x/b.mjs"), false);
  assert.equal(o("**/*.test.mjs", "lib/x.test.mjs"), true);
  assert.equal(o("**/*.test.mjs", "lib/x.mjs"), false);
  assert.equal(o("a/*.mjs", "a/b*"), true, "two globs overlap when some name satisfies both");
  assert.equal(o("a/x*", "a/y*"), false);
  assert.equal(o("a/?.mjs", "a/bc.mjs"), false);
  assert.equal(o("a/?.mjs", "a/b.mjs"), true);
  assert.equal(o("a/[ab].mjs", "a/z.mjs"), true, "a character class is over-approximated as one arbitrary character");
  assert.equal(o("a/[ab].mjs", "a/zz.mjs"), false, "...but never as more than one character");
  assert.equal(o("lib/**", "docs/**"), false);
  assert.equal(o("lib/*", "lib/x/y.mjs"), false);
});

check("scopesOverlap: brace alternatives, scope lists and the conservative answer for an invalid scope", () => {
  assert.equal(scopesOverlap("a/{x,y}.mjs", "a/y.mjs", LINUX), true);
  assert.equal(scopesOverlap("a/{x,y}.mjs", "a/z.mjs", LINUX), false);
  assert.equal(scopesOverlap(["a/x.mjs", "b/y.mjs"], ["c/z.mjs", "b/"], LINUX), true);
  assert.equal(scopesOverlap(["a/x.mjs", "b/y.mjs"], ["c/z.mjs"], LINUX), false);
  assert.equal(scopesOverlap([], ["c/z.mjs"], LINUX), false);
  assert.equal(scopesOverlap("/" + "abs/x.mjs", "a/b.mjs", LINUX), true, "an unjudgeable scope overlaps (safe direction)");
  assert.equal(scopesOverlap("a/x.mjs", "../b.mjs", LINUX), true);
});

check("scopesOverlap: win32 and darwin fold case, linux does not", () => {
  assert.equal(scopesOverlap("Lib/A.mjs", "lib/a.mjs", WIN), true);
  assert.equal(scopesOverlap("Lib/A.mjs", "lib/a.mjs", MAC), true);
  assert.equal(scopesOverlap("Lib/A.mjs", "lib/a.mjs", LINUX), false);
  assert.equal(scopesOverlap("LIB/**", "lib/sub/a.mjs", WIN), true);
  assert.equal(scopesOverlap("LIB/**", "lib/sub/a.mjs", LINUX), false);
});

// ---------------------------------------------------------------- validateSliceQueue: schema and DAG

check("validateSliceQueue: a valid queue resolves defaults and exposes normalized slices", () => {
  const result = validateSliceQueue(queue([{ id: "A", title: "t", state: "ready", writeScope: ["lib\\a.mjs"] }]), LINUX);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(codes(result.warnings), ["SQ-WARN-NO-BRIEFING", "SQ-WARN-PROTECTED-UNCHECKED"]);
  const normalized = result.queue.slices[0];
  assert.equal(normalized.id, "A");
  assert.equal(normalized.tier, "implementor");
  assert.equal(normalized.commitMode, "diff-only");
  assert.equal(normalized.loadClass, "light");
  assert.deepEqual(normalized.dependsOn, []);
  assert.deepEqual(normalized.scopes, ["lib/a.mjs"]);
  assert.equal(normalized.protected, false);
  assert.equal(result.queue.limits.maxAttemptsPerSlice, DEFAULT_MAX_ATTEMPTS);
  assert.equal(DEFAULT_MAX_ATTEMPTS, 2);
});

check("validateSliceQueue: schema errors are closed (unknown keys, wrong schema, missing defaults, bad enums)", () => {
  assert.deepEqual(codes(validateSliceQueue({ ...queue([]), schema: "pipeline.slice-queue.v0" }, LINUX).errors), ["SQ-SCHEMA"]);
  assert.deepEqual(codes(validateSliceQueue({ ...queue([]), extra: 1 }, LINUX).errors), ["SQ-SCHEMA"]);
  assert.deepEqual(codes(validateSliceQueue(null, LINUX).errors), ["SQ-SCHEMA"]);
  assert.equal(validateSliceQueue(queue([]), LINUX).ok, true, "an empty queue is valid");
  assert.ok(codes(validate([slice("A", ["a.mjs"], { writScope: [] })]).errors).includes("SQ-SCHEMA"), "a typo'd key must not silently drop a field");
  const noDefaults = validateSliceQueue({ schema: "pipeline.slice-queue.v1", feature: "unit", slices: [{ id: "A", title: "t", state: "ready", writeScope: ["a.mjs"] }] }, LINUX);
  assert.ok(codes(noDefaults.errors).includes("SQ-SCHEMA"), "commitMode and tier need a slice value or a default");
  assert.ok(codes(validate([slice("A", ["a.mjs"], { commitMode: "yolo" })]).errors).includes("SQ-SCHEMA"));
  assert.ok(codes(validate([slice("A", ["a.mjs"], { state: "paused", holdReason: "x" })]).errors).includes("SQ-SCHEMA"));
  assert.ok(codes(validate([slice("A", ["a.mjs"], { loadClass: "huge" })]).errors).includes("SQ-SCHEMA"));
  assert.ok(codes(validate([slice("A", ["a.mjs"])], { limits: { maxAttemptsPerSlice: 0 } }).errors).includes("SQ-SCHEMA"));
  assert.ok(codes(validate([slice("A", ["a.mjs"])], { limits: { deadline: "tomorrow" } }).errors).includes("SQ-SCHEMA"));
  assert.equal(validate([slice("A", ["a.mjs"])], { limits: { deadline: "2026-10-06T04:45:00Z", maxAttemptsPerSlice: 3 } }).ok, true);
});

check("validateSliceQueue: ids are unique and safe, dependencies must exist", () => {
  assert.ok(codes(validate([slice("A", ["a.mjs"]), slice("A", ["b.mjs"])]).errors).includes("SQ-ID"));
  assert.ok(codes(validate([slice("bad id", ["a.mjs"])]).errors).includes("SQ-ID"));
  assert.ok(codes(validate([slice("a/b", ["a.mjs"])]).errors).includes("SQ-ID"));
  const unknown = validate([slice("A", ["a.mjs"], { dependsOn: ["NOPE"] })]);
  assert.deepEqual(codes(unknown.errors), ["SQ-DEP-UNKNOWN"]);
  assert.equal(unknown.errors[0].sliceId, "A");
});

check("validateSliceQueue: dependency cycles are refused (self, two, three) and a diamond is accepted", () => {
  const self = validate([slice("A", ["a.mjs"], { dependsOn: ["A"] })]);
  assert.deepEqual(codes(self.errors), ["SQ-DEP-CYCLE"]);
  const two = validate([slice("A", ["a.mjs"], { dependsOn: ["B"] }), slice("B", ["b.mjs"], { dependsOn: ["A"] })]);
  assert.deepEqual(codes(two.errors), ["SQ-DEP-CYCLE"]);
  assert.deepEqual([...two.errors[0].cycle].sort(), ["A", "A", "B"].sort().slice(0, 3));
  const three = validate([
    slice("A", ["a.mjs"], { dependsOn: ["C"] }),
    slice("B", ["b.mjs"], { dependsOn: ["A"] }),
    slice("C", ["c.mjs"], { dependsOn: ["B"] }),
  ]);
  assert.deepEqual(codes(three.errors), ["SQ-DEP-CYCLE"]);
  assert.equal(three.ok, false);
  const diamond = validate([
    slice("A", ["a.mjs"]),
    slice("B", ["b.mjs"], { dependsOn: ["A"] }),
    slice("C", ["c.mjs"], { dependsOn: ["A"] }),
    slice("D", ["d.mjs"], { dependsOn: ["B", "C"] }),
  ]);
  assert.equal(diamond.ok, true, JSON.stringify(diamond.errors));
});

check("validateSliceQueue: a non-ready declared state needs a holdReason, a ready slice must not carry one", () => {
  assert.ok(codes(validate([slice("A", ["a.mjs"], { state: "hold-po" })]).errors).includes("SQ-HOLD-REASON"));
  assert.ok(codes(validate([slice("A", ["a.mjs"], { state: "deferred", holdReason: "  " })]).errors).includes("SQ-HOLD-REASON"));
  assert.equal(validate([slice("A", ["a.mjs"], { state: "hold-po", holdReason: "PO signature needed" })]).ok, true);
  assert.equal(validate([slice("A", ["a.mjs"], { state: "blocked-external", holdReason: "upstream" })]).ok, true);
  assert.equal(validate([slice("A", ["a.mjs"], { state: "cancelled", holdReason: "superseded" })]).ok, true);
  assert.ok(codes(validate([slice("A", ["a.mjs"], { holdReason: "why" })]).errors).includes("SQ-HOLD-REASON"));
  assert.equal(validate([slice("A", ["a.mjs"], { holdReason: null })]).ok, true);
});

check("validateSliceQueue: unusable scopes are SQ-SCOPE errors naming the slice", () => {
  const abs = validate([slice("A", ["/" + "var/x.mjs"])]);
  assert.deepEqual(codes(abs.errors), ["SQ-SCOPE"]);
  assert.equal(abs.errors[0].sliceId, "A");
  assert.ok(codes(validate([slice("A", ["lib/../b.mjs"])]).errors).includes("SQ-SCOPE"));
  assert.ok(codes(validate([slice("A", ["a.mjs"], { readScope: ["../outside.md"] })]).errors).includes("SQ-SCOPE"));
  assert.ok(codes(validate([slice("A", ["a.mjs"])], { monoliths: ["/" + "x"] }).errors).includes("SQ-SCOPE"));
  assert.ok(codes(validate([slice("A", "a.mjs")]).errors).includes("SQ-SCHEMA"), "writeScope must be a list");
});

// ---------------------------------------------------------------- overlap matrix

check("SQ-OVERLAP: un-ordered slices must have disjoint scopes; ordering by the DAG (direct or transitive) makes sharing legal", () => {
  const unordered = validate([slice("A", ["lib/shared.mjs"]), slice("B", ["lib/shared.mjs"])]);
  assert.deepEqual(codes(unordered.errors), ["SQ-OVERLAP"]);
  assert.deepEqual(unordered.errors[0].slices, ["A", "B"]);
  assert.equal(validate([slice("A", ["lib/shared.mjs"]), slice("B", ["lib/shared.mjs"], { dependsOn: ["A"] })]).ok, true);
  const dirVsFile = validate([slice("A", ["lib/"]), slice("B", ["lib/a.mjs"])]);
  assert.deepEqual(codes(dirVsFile.errors), ["SQ-OVERLAP"]);
  assert.equal(validate([slice("A", ["lib/**"]), slice("B", ["plugins/**"])]).ok, true);
  const chain = validate([
    slice("A", ["lib/shared.mjs"]),
    slice("M", ["lib/mid.mjs"], { dependsOn: ["A"] }),
    slice("B", ["lib/shared.mjs"], { dependsOn: ["M"] }),
  ]);
  assert.equal(chain.ok, true, JSON.stringify(chain.errors));
  const throughTerminal = validateSliceQueue(queue([
    slice("A", ["lib/shared.mjs"]),
    slice("M", ["lib/mid.mjs"], { dependsOn: ["A"] }),
    slice("B", ["lib/shared.mjs"], { dependsOn: ["M"] }),
  ]), { ...LINUX, terminalIds: ["M"] });
  assert.equal(throughTerminal.ok, true, "ordering runs through a terminal slice too");
  const parallelBranches = validate([
    slice("R", ["lib/root.mjs"]),
    slice("A", ["lib/shared.mjs"], { dependsOn: ["R"] }),
    slice("B", ["lib/shared.mjs"], { dependsOn: ["R"] }),
  ]);
  assert.deepEqual(codes(parallelBranches.errors), ["SQ-OVERLAP"], "a common ancestor does not order siblings");
});

check("SQ-OVERLAP: terminal and cancelled slices are ignored; read-only slices never collide", () => {
  const terminalIgnored = validateSliceQueue(queue([slice("A", ["lib/shared.mjs"]), slice("B", ["lib/shared.mjs"])]), { ...LINUX, terminalIds: new Set(["A"]) });
  assert.equal(terminalIgnored.ok, true, JSON.stringify(terminalIgnored.errors));
  const cancelled = validate([slice("A", ["lib/shared.mjs"], { state: "cancelled", holdReason: "superseded" }), slice("B", ["lib/shared.mjs"])]);
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled.errors));
  const heldStillCounts = validate([slice("A", ["lib/shared.mjs"], { state: "hold-po", holdReason: "PO" }), slice("B", ["lib/shared.mjs"])]);
  assert.deepEqual(codes(heldStillCounts.errors), ["SQ-OVERLAP"], "a held slice can become ready, so it still reserves its scope");
  assert.equal(validate([slice("A", []), slice("B", [])]).ok, true);
  assert.equal(validate([slice("A", []), slice("B", ["lib/a.mjs"])]).ok, true);
});

check("SQ-OVERLAP: case-folding is an error on win32/darwin and a SQ-WARN-CASEFOLD warning on linux", () => {
  const slices = [slice("A", ["Lib/Shared.mjs"]), slice("B", ["lib/shared.mjs"])];
  const linux = validate(slices, {}, LINUX);
  assert.equal(linux.ok, true, JSON.stringify(linux.errors));
  assert.ok(codes(linux.warnings).includes("SQ-WARN-CASEFOLD"));
  for (const options of [WIN, MAC]) {
    const folded = validate(slices, {}, options);
    assert.deepEqual(codes(folded.errors), ["SQ-OVERLAP"], options.platform);
    assert.equal(codes(folded.warnings).includes("SQ-WARN-CASEFOLD"), false);
  }
  assert.equal(codes(validate([slice("A", ["lib/a.mjs"]), slice("B", ["lib/b.mjs"])], {}, LINUX).warnings).includes("SQ-WARN-CASEFOLD"), false);
});

// ---------------------------------------------------------------- monolith, shared surface, commit, tier, protected

check("SQ-MONOLITH: at most one non-terminal slice per monolith, even when ordered", () => {
  const monolith = "plugins/pipeline-core/lib/big-monolith.mjs";
  const ordered = validate([slice("A", [monolith]), slice("B", [monolith], { dependsOn: ["A"] })], { monoliths: [monolith] });
  assert.deepEqual(codes(ordered.errors), ["SQ-MONOLITH"]);
  assert.deepEqual(ordered.errors[0].slices, ["A", "B"]);
  assert.equal(validate([slice("A", [monolith]), slice("B", [monolith], { dependsOn: ["A"] })]).ok, true, "without the monolith declaration ordering is enough");
  const oneDone = validateSliceQueue(queue([slice("A", [monolith]), slice("B", [monolith], { dependsOn: ["A"] })], { monoliths: [monolith] }), { ...LINUX, terminalIds: ["A"] });
  assert.equal(oneDone.ok, true, JSON.stringify(oneDone.errors));
  const viaDirectory = validate([slice("A", ["plugins/pipeline-core/lib/"]), slice("B", [monolith], { dependsOn: ["A"] })], { monoliths: [monolith] });
  assert.deepEqual(codes(viaDirectory.errors), ["SQ-MONOLITH"], "a directory scope covering the monolith counts");
  assert.equal(validate([slice("A", [monolith]), slice("B", [], { dependsOn: ["A"] })], { monoliths: [monolith] }).ok, true, "a read-only slice does not hold the monolith");
});

check("SQ-SHARED-SURFACE: the single-integrator files appear in no writeScope (default list, directories, injection)", () => {
  for (const scope of ["docs/state.md", "docs\\adr\\README.md", "backlog/index.json", "backlog/transitions.ndjson", "docs/state-archive/old.md", "specs/sprint-x/", "specs/sprint-x/backlog-acceptance-matrix.md", "docs/0.7-local-test-handover-2026-10-02.md"]) {
    const result = validate([slice("A", [scope])]);
    const surface = result.errors.filter((error) => error.code === "SQ-SHARED-SURFACE");
    assert.equal(surface.length, 1, scope);
    assert.equal(surface[0].sliceId, "A");
    assert.equal(result.ok, false);
  }
  assert.equal(validate([slice("A", ["specs/sprint-x/design/"]), slice("B", ["docs/other.md"])]).ok, true);
  assert.equal(validate([slice("A", [], { readScope: ["docs/state.md"] })]).ok, true, "reading a shared surface is fine");
  const injected = validateSliceQueue(queue([slice("A", ["docs/state.md"]), slice("B", ["lib/frozen.mjs"])]), { ...LINUX, sharedSurfaces: ["lib/frozen.mjs"] });
  assert.deepEqual(codes(injected.errors), ["SQ-SHARED-SURFACE"]);
  assert.equal(injected.errors[0].sliceId, "B");
  assert.ok(codes(validate([slice("A", ["Docs/State.md"])], {}, WIN).errors).includes("SQ-SHARED-SURFACE"), "folded on win32");
});

check("SQ-COMMIT: at most one un-ordered self-commit slice; ordered or terminal ones are fine", () => {
  const two = validate([slice("A", ["a.mjs"], { commitMode: "self-commit" }), slice("B", ["b.mjs"], { commitMode: "self-commit" })]);
  assert.deepEqual(codes(two.errors), ["SQ-COMMIT"]);
  assert.deepEqual(two.errors[0].slices, ["A", "B"]);
  assert.equal(validate([slice("A", ["a.mjs"], { commitMode: "self-commit" }), slice("B", ["b.mjs"], { commitMode: "self-commit", dependsOn: ["A"] })]).ok, true);
  assert.equal(validate([slice("A", ["a.mjs"], { commitMode: "self-commit" }), slice("B", ["b.mjs"], { commitMode: "diff-only" }), slice("C", ["c.mjs"], { commitMode: "worktree" })]).ok, true);
  const oneDone = validateSliceQueue(queue([slice("A", ["a.mjs"], { commitMode: "self-commit" }), slice("B", ["b.mjs"], { commitMode: "self-commit" })]), { ...LINUX, terminalIds: ["A"] });
  assert.equal(oneDone.ok, true);
});

check("SQ-TIER: deep and critic need a tierReason; a guard/hook/security/architecture slice needs a critic follow-up", () => {
  assert.ok(codes(validate([slice("A", ["a.mjs"], { tier: "deep" })]).errors).includes("SQ-TIER"));
  assert.ok(codes(validate([slice("A", [], { tier: "critic" })]).errors).includes("SQ-TIER"));
  assert.ok(codes(validate([slice("A", ["a.mjs"], { tier: "wizard" })]).errors).includes("SQ-TIER"));
  assert.equal(validate([slice("A", ["a.mjs"], { tier: "deep", tierReason: "MP-07 design" })]).ok, true);
  assert.equal(validate([slice("A", ["a.mjs"], { tier: "mechanic" })]).ok, true);
  const hook = "plugins/pipeline-core/hooks/foo.mjs";
  const bare = validate([slice("H", [hook])]);
  assert.deepEqual(codes(bare.errors), ["SQ-TIER"]);
  assert.equal(bare.errors[0].sliceId, "H");
  const critic = (extra = {}) => slice("C", [], { tier: "critic", tierReason: "MP-07 guardrail review", ...extra });
  assert.equal(validate([slice("H", [hook]), critic({ dependsOn: ["H"] })]).ok, true);
  assert.equal(validate([slice("H", [hook]), slice("M", ["m.mjs"], { dependsOn: ["H"] }), critic({ dependsOn: ["M"] })]).ok, true, "transitive follow-up");
  assert.ok(codes(validate([slice("H", [hook]), critic()]).errors).includes("SQ-TIER"), "an unrelated critic slice is not a follow-up");
  assert.ok(codes(validate([slice("H", [hook]), critic({ dependsOn: ["H"], state: "cancelled", holdReason: "dropped" })]).errors).includes("SQ-TIER"), "a cancelled critic is no review");
  const disabled = validateSliceQueue(queue([slice("H", [hook])]), { ...LINUX, criticalPathPatterns: [] });
  assert.equal(disabled.ok, true);
  const custom = validateSliceQueue(queue([slice("H", ["lib/payments.mjs"])]), { ...LINUX, criticalPathPatterns: ["payments"] });
  assert.deepEqual(codes(custom.errors), ["SQ-TIER"]);
});

check("protectedFlag: injected patterns (literal files exact, globs and directories by literal-prefix over-approximation) and inventory", () => {
  const protectedPatterns = [
    "plugins/pipeline-core/hooks/guard-git\\.test\\.mjs$",
    { id: "TP-5", pattern: "(?:plugins/pipeline-core/hooks/guard-push(?:-v2)?|harness/scripts/pipeline-state)\\.test\\.mjs$" },
    "harness/verify-suites\\.json$",
  ];
  const flag = (scopes, extra = {}) => protectedFlag({ writeScope: scopes }, { ...LINUX, protectedPatterns, ...extra });
  const hit = flag(["plugins/pipeline-core/hooks/guard-git.test.mjs"]);
  assert.equal(hit.protected, true);
  assert.equal(hit.matches[0].via, "pattern");
  assert.equal(flag(["harness/verify-suites.json"]).protected, true);
  assert.equal(flag(["plugins/pipeline-core/hooks/guard-push-v2.test.mjs"]).matches[0].id, "TP-5");
  assert.equal(flag(["plugins/pipeline-core/hooks/guard-git.mjs"]).protected, false, "a literal sibling is not the protected file");
  assert.equal(flag(["plugins/pipeline-core/hooks/*.test.mjs"]).protected, true);
  assert.equal(flag(["plugins/pipeline-core/hooks/stop-*.mjs"]).protected, false);
  assert.equal(flag(["plugins/pipeline-core/hooks/"]).protected, true);
  assert.equal(flag(["plugins/pipeline-core/lib/"]).protected, false);
  assert.equal(flag(["harness/scripts/"]).protected, true, "a leading alternation group is expanded");
  assert.equal(flag(["docs/"]).protected, false);
  assert.equal(flag(["lib/a.mjs", "harness/verify-suites.json"]).protected, true);
  assert.equal(flag([]).protected, false);
  assert.equal(protectedFlag(["harness/verify-suites.json"], { ...LINUX, protectedPatterns }).protected, true, "a bare scope list is accepted");
  assert.equal(protectedFlag({ writeScope: ["Harness/Verify-Suites.json"] }, { ...WIN, protectedPatterns }).protected, true, "case-insensitive on win32");
  assert.equal(protectedFlag({ writeScope: ["Harness/Verify-Suites.json"] }, { ...LINUX, protectedPatterns }).protected, false);
  const inventory = { ...LINUX, protectedPaths: ["plugins/pipeline-core/protected-baseline.json"] };
  const viaInventory = protectedFlag({ writeScope: ["plugins/pipeline-core/"] }, inventory);
  assert.equal(viaInventory.protected, true);
  assert.equal(viaInventory.matches[0].via, "inventory");
  assert.equal(protectedFlag({ writeScope: ["plugins/pipeline-core/protected-baseline.json"] }, inventory).protected, true);
  assert.equal(protectedFlag({ writeScope: ["plugins/other/"] }, inventory).protected, false);
  assert.equal(protectedFlag({ writeScope: ["x.mjs"] }, LINUX).protected, false, "no patterns, no inventory: nothing is flagged");
});

check("SQ-PROTECTED: protected slices are flagged, un-ordered protected slices are refused, missing patterns warn", () => {
  const protectedPatterns = ["harness/verify-suites\\.json$", "templates/prompts/agent-obligations\\.md$"];
  const options = { ...LINUX, protectedPatterns };
  const one = validateSliceQueue(queue([slice("P", ["harness/verify-suites.json"]), slice("Q", ["lib/q.mjs"])]), options);
  assert.equal(one.ok, true, JSON.stringify(one.errors));
  assert.equal(one.queue.slices[0].protected, true);
  assert.equal(one.queue.slices[1].protected, false);
  assert.equal(codes(one.warnings).includes("SQ-WARN-PROTECTED-UNCHECKED"), false);
  const two = validateSliceQueue(queue([slice("P", ["harness/verify-suites.json"]), slice("Q", ["templates/prompts/agent-obligations.md"])]), options);
  assert.deepEqual(codes(two.errors), ["SQ-PROTECTED"]);
  assert.deepEqual(two.errors[0].slices, ["P", "Q"]);
  const sequenced = validateSliceQueue(queue([slice("P", ["harness/verify-suites.json"]), slice("Q", ["templates/prompts/agent-obligations.md"], { dependsOn: ["P"] })]), options);
  assert.equal(sequenced.ok, true, JSON.stringify(sequenced.errors));
  const oneDone = validateSliceQueue(queue([slice("P", ["harness/verify-suites.json"]), slice("Q", ["templates/prompts/agent-obligations.md"])]), { ...options, terminalIds: ["P"] });
  assert.equal(oneDone.ok, true, "a terminal protected slice is ignored");
  const missing = validateSliceQueue(queue([slice("P", ["lib/p.mjs"])]), LINUX);
  assert.ok(codes(missing.warnings).includes("SQ-WARN-PROTECTED-UNCHECKED"));
  const badPattern = validateSliceQueue(queue([slice("P", ["lib/p.mjs"])]), { ...LINUX, protectedPatterns: ["(unclosed"] });
  assert.ok(codes(badPattern.warnings).includes("SQ-WARN-PROTECTED-PATTERN"));
});

check("validateSliceQueue warnings: tool-call cliff, scope size, missing briefing, test-heavy without verify scope", () => {
  const warnings = (slices, extra = {}) => codes(validate(slices, extra).warnings);
  assert.ok(warnings([slice("A", ["a.mjs"], { estimatedToolCalls: 41 })]).includes("SQ-WARN-TOOLCALLS"));
  assert.equal(warnings([slice("A", ["a.mjs"], { estimatedToolCalls: 40 })]).includes("SQ-WARN-TOOLCALLS"), false);
  const nine = Array.from({ length: 9 }, (_, index) => `lib/f${index}.mjs`);
  assert.ok(warnings([slice("A", nine)]).includes("SQ-WARN-SCOPE-SIZE"));
  assert.equal(warnings([slice("A", nine.slice(0, 8))]).includes("SQ-WARN-SCOPE-SIZE"), false);
  const bare = { id: "A", title: "t", state: "ready", writeScope: ["a.mjs"] };
  assert.ok(codes(validateSliceQueue(queue([bare]), LINUX).warnings).includes("SQ-WARN-NO-BRIEFING"));
  assert.equal(warnings([slice("A", ["a.mjs"])]).includes("SQ-WARN-NO-BRIEFING"), false);
  assert.ok(warnings([slice("A", ["lib/a.mjs"], { loadClass: "test-heavy" })]).includes("SQ-WARN-NO-VERIFY"));
  assert.equal(warnings([slice("A", ["lib/a.mjs", "lib/a.test.mjs"], { loadClass: "test-heavy" })]).includes("SQ-WARN-NO-VERIFY"), false);
  assert.equal(warnings([slice("A", ["lib/a.mjs"], { loadClass: "test-heavy", readScope: ["lib/b.test.mjs"] })]).includes("SQ-WARN-NO-VERIFY"), false);
  const terminal = validateSliceQueue(queue([bare]), { ...LINUX, terminalIds: ["A"] });
  assert.equal(codes(terminal.warnings).includes("SQ-WARN-NO-BRIEFING"), false, "no quality warnings for finished work");
});

// ---------------------------------------------------------------- loadSliceQueue

check("loadSliceQueue: absent, unreadable, oversize, non-JSON, schema-invalid and valid inputs (injected reader)", () => {
  const enoent = () => { const error = new Error("missing"); error.code = "ENOENT"; throw error; };
  const absent = loadSliceQueue("specs/unit/slice-queue.json", { ...LINUX, readFile: enoent });
  assert.equal(absent.status, "absent");
  assert.equal(absent.queue, null);
  assert.deepEqual(absent.errors, []);
  const unreadable = loadSliceQueue("specs/unit/slice-queue.json", { ...LINUX, readFile: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); } });
  assert.equal(unreadable.status, "invalid");
  assert.deepEqual(codes(unreadable.errors), ["SQ-SCHEMA"]);
  const oversize = loadSliceQueue("specs/unit/slice-queue.json", { ...LINUX, readFile: () => " ".repeat(1024 * 1024 + 1) });
  assert.equal(oversize.status, "invalid");
  const notJson = loadSliceQueue("specs/unit/slice-queue.json", { ...LINUX, readFile: () => "{not json" });
  assert.equal(notJson.status, "invalid");
  assert.equal(notJson.raw, null);
  const schemaInvalid = loadSliceQueue("specs/unit/slice-queue.json", { ...LINUX, readFile: () => JSON.stringify({ schema: "nope" }) });
  assert.equal(schemaInvalid.status, "invalid");
  assert.deepEqual(schemaInvalid.raw, { schema: "nope" });
  const valid = loadSliceQueue("specs/unit/slice-queue.json", { ...LINUX, readFile: () => JSON.stringify(queue([slice("A", ["a.mjs"])])), mtimeMs: () => ago(10) });
  assert.equal(valid.status, "valid", JSON.stringify(valid.errors));
  assert.equal(valid.queue.slices.length, 1);
  assert.equal(valid.mtimeMs, ago(10));
  assert.deepEqual(valid.raw.slices[0].id, "A");
  assert.equal(loadSliceQueue(5, LINUX).status, "invalid");
});

check("loadSliceQueue: the default reader treats a missing file as absent and a non-JSON file as invalid", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const missing = loadSliceQueue(join(here, "no-such-slice-queue.json"), LINUX);
  assert.equal(missing.status, "absent");
  const notQueue = loadSliceQueue(fileURLToPath(import.meta.url), LINUX);
  assert.equal(notQueue.status, "invalid");
  assert.equal(typeof notQueue.mtimeMs === "number" || notQueue.mtimeMs === null, true);
});

// ---------------------------------------------------------------- readyAndLive

check("readyAndLive: dependencies, declared states and delivery records decide the ready set", () => {
  const raw = queue([
    slice("A", ["lib/a.mjs"]),
    slice("B", ["lib/b.mjs"], { dependsOn: ["A"] }),
    slice("C", ["lib/c.mjs"], { state: "hold-po", holdReason: "PO signature" }),
    slice("D", ["lib/d.mjs"], { state: "cancelled", holdReason: "dropped" }),
    slice("E", ["lib/e.mjs"], { dependsOn: ["D"] }),
    slice("F", ["lib/f.mjs"], { state: "deferred", holdReason: "later" }),
    slice("G", ["lib/g.mjs"], { state: "blocked-external", holdReason: "vendor" }),
  ]);
  const first = readyAndLive({ queue: raw, now: NOW }, LINUX);
  assert.equal(first.valid, true, JSON.stringify(first.errors));
  assert.deepEqual(first.ready, ["A"]);
  assert.equal(statusOf(first, "B"), "blocked");
  assert.deepEqual(reasonsOf(first, "B"), ["dependency"]);
  assert.deepEqual(find(first, "B").waitsOn, ["A"]);
  assert.equal(statusOf(first, "C"), "held");
  assert.deepEqual(reasonsOf(first, "C"), ["hold-po"]);
  assert.equal(statusOf(first, "D"), "cancelled");
  assert.deepEqual(reasonsOf(first, "E"), ["dependency-cancelled"]);
  assert.deepEqual(reasonsOf(first, "F"), ["deferred"]);
  assert.deepEqual(reasonsOf(first, "G"), ["blocked-external"]);
  assert.deepEqual(first.counts, { ready: 1, live: 0, done: 0, held: 3, blocked: 2, cancelled: 1 });

  const afterRecord = readyAndLive({ queue: raw, records: [delivered("A")], now: NOW }, LINUX);
  assert.equal(statusOf(afterRecord, "A"), "done");
  assert.deepEqual(afterRecord.ready, ["B"]);
  const afterIds = readyAndLive({ queue: raw, terminalIds: ["A"], now: NOW }, LINUX);
  assert.deepEqual(afterIds.ready, ["B"]);
  const afterOptions = readyAndLive({ queue: raw, now: NOW }, { ...LINUX, terminalIds: ["A"] });
  assert.deepEqual(afterOptions.ready, ["B"]);
});

check("readyAndLive: liveness is the union of ledger entries, non-terminal records and fresh heartbeats", () => {
  const raw = queue([slice("F", ["lib/f.mjs"]), slice("G", ["lib/g.mjs"]), slice("H", ["lib/h.mjs"]), slice("I", ["lib/i.mjs"]), slice("J", ["lib/j.mjs"]), slice("K", ["lib/k.mjs"])]);
  const result = readyAndLive({
    queue: raw,
    now: NOW,
    live: [liveEntry("F"), "J"],
    records: [{ taskId: "G", outcome: "in-progress" }],
    heartbeats: [{ sliceId: "H", at: iso(ago(5)) }, { sliceId: "I", at: ago(45) }],
  }, LINUX);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.live.map((entry) => entry.sliceId), ["F", "G", "H", "J"]);
  assert.deepEqual(find(result, "F").sources, ["ledger"]);
  assert.deepEqual(find(result, "G").sources, ["record"]);
  assert.deepEqual(find(result, "H").sources, ["heartbeat"]);
  assert.deepEqual(find(result, "J").sources, ["ledger"]);
  assert.deepEqual(result.ready, ["I", "K"], "a stale heartbeat alone does not make a slice live");
  assert.equal(result.counts.live, 4);
  const entry = result.live.find((item) => item.sliceId === "H");
  assert.equal(entry.silentMinutes, 5);
  assert.equal(entry.stale, false);
});

check("readyAndLive: a terminal record ends liveness unless a launch is newer than the record", () => {
  const raw = queue([slice("K", ["lib/k.mjs"]), slice("L", ["lib/l.mjs"]), slice("M", ["lib/m.mjs"])]);
  const handBack = (taskId, extra = {}) => ({ taskId, outcome: "partial", ...extra });
  const result = readyAndLive({
    queue: raw,
    now: NOW,
    live: [liveEntry("K"), liveEntry("L"), liveEntry("M", { launchedAt: iso(ago(2)) })],
    records: [delivered("K"), handBack("L"), handBack("M", { mtimeMs: ago(30) })],
  }, LINUX);
  assert.equal(statusOf(result, "K"), "done", "a delivered terminal record wins over a lingering ledger entry");
  assert.equal(statusOf(result, "L"), "ready", "a hand-back ends liveness and returns the slice to the ready set");
  assert.equal(find(result, "L").attempts, 1);
  assert.equal(statusOf(result, "M"), "live", "a relaunch newer than the terminal record keeps the slot");
  assert.deepEqual(result.live.map((item) => item.sliceId), ["M"]);
});

check("readyAndLive: a silent live slice is never freed, it is reported and keeps blocking conflicting work", () => {
  const raw = queue([
    slice("L", ["lib/shared.mjs"], { dependsOn: ["M"] }),
    slice("M", ["lib/shared.mjs"]),
    slice("N", ["lib/n.mjs"]),
  ]);
  const result = readyAndLive({
    queue: raw,
    now: NOW,
    live: [liveEntry("L", { silentMinutes: 90, stale: true, lastActivityAt: iso(ago(90)) })],
  }, LINUX);
  assert.equal(statusOf(result, "L"), "live");
  assert.equal(result.live.length, 1);
  assert.deepEqual(result.silent.map((item) => [item.sliceId, item.silentMinutes]), [["L", 90]]);
  assert.equal(statusOf(result, "M"), "blocked");
  assert.deepEqual(reasonsOf(result, "M"), ["scope-overlap"]);
  assert.deepEqual(find(result, "M").reasons[0].with, ["L"]);
  assert.deepEqual(result.ready, ["N"]);
  const derived = readyAndLive({ queue: queue([slice("S", ["lib/s.mjs"])]), now: NOW, live: ["S"], heartbeats: [{ sliceId: "S", at: iso(ago(60)) }] }, LINUX);
  assert.equal(statusOf(derived, "S"), "live", "silence computed from heartbeats never frees the slot either");
  assert.equal(derived.silent.length, 1);
  assert.equal(derived.silent[0].silentMinutes, 60);
  const lenient = readyAndLive({ queue: queue([slice("S", ["lib/s.mjs"])]), now: NOW, live: ["S"], heartbeats: [{ sliceId: "S", at: iso(ago(60)) }] }, { ...LINUX, staleAfterMinutes: 120 });
  assert.equal(lenient.silent.length, 0);
});

check("readyAndLive: attempts count hand-backs, the cap is 2 by default and the queue limit overrides", () => {
  const raw = queue([slice("N", ["lib/n.mjs"])]);
  const partial = { taskId: "N", outcome: "partial" };
  const stopped = { taskId: "N2", sliceId: "N", outcome: "stopped-without-commit", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "stopped-without-commit" } };
  const undelivered = { taskId: "N3", sliceId: "N", outcome: "completed", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" } };
  const noDelivery = { taskId: "N4", sliceId: "N", outcome: "completed-no-delivery" };
  const one = readyAndLive({ queue: raw, records: [partial], now: NOW }, LINUX);
  assert.equal(statusOf(one, "N"), "ready");
  assert.equal(find(one, "N").attempts, 1);
  const two = readyAndLive({ queue: raw, records: [partial, stopped], now: NOW }, LINUX);
  assert.equal(statusOf(two, "N"), "held");
  assert.deepEqual(reasonsOf(two, "N"), ["attempts-exhausted"]);
  assert.deepEqual(two.ready, []);
  assert.equal(find(two, "N").attempts, 2);
  assert.equal(readyAndLive({ queue: raw, records: [partial, undelivered], now: NOW }, LINUX).ready.length, 0);
  assert.equal(readyAndLive({ queue: raw, records: [partial, noDelivery], now: NOW }, LINUX).ready.length, 0);
  const lenient = readyAndLive({ queue: queue([slice("N", ["lib/n.mjs"])], { limits: { maxAttemptsPerSlice: 3 } }), records: [partial, stopped], now: NOW }, LINUX);
  assert.deepEqual(lenient.ready, ["N"]);
  const optionCap = readyAndLive({ queue: raw, records: [partial], now: NOW }, { ...LINUX, maxAttemptsPerSlice: 1 });
  assert.deepEqual(optionCap.ready, []);
  const queueWins = readyAndLive({ queue: queue([slice("N", ["lib/n.mjs"])], { limits: { maxAttemptsPerSlice: 3 } }), records: [partial, stopped], now: NOW }, { ...LINUX, maxAttemptsPerSlice: 1 });
  assert.deepEqual(queueWins.ready, ["N"], "the queue's own limit is the Elephant's declaration");
  const liveBeatsHold = readyAndLive({ queue: raw, records: [partial, stopped, { taskId: "N5", sliceId: "N", outcome: "in-progress" }], now: NOW }, LINUX);
  assert.equal(statusOf(liveBeatsHold, "N"), "live", "a running attempt is live, whatever the count");
});

check("readyAndLive: a protected or self-committing slice is not startable while another one is live", () => {
  const protectedPatterns = ["harness/verify-suites\\.json$", "templates/prompts/agent-obligations\\.md$"];
  const raw = queue([
    slice("P2", ["harness/verify-suites.json"]),
    slice("P1", ["templates/prompts/agent-obligations.md"], { dependsOn: ["P2"] }),
    slice("Q", ["lib/q.mjs"]),
    slice("C2", ["lib/c2.mjs"], { commitMode: "self-commit" }),
    slice("C1", ["lib/c1.mjs"], { commitMode: "self-commit", dependsOn: ["C2"] }),
  ]);
  const result = readyAndLive({ queue: raw, now: NOW, live: [liveEntry("P1"), liveEntry("C1")] }, { ...LINUX, protectedPatterns });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(reasonsOf(result, "P2"), ["protected-live"]);
  assert.deepEqual(find(result, "P2").reasons[0].with, ["P1"]);
  assert.deepEqual(reasonsOf(result, "C2"), ["commit-live"]);
  assert.deepEqual(result.ready, ["Q"], "unrelated work stays startable");
  assert.equal(find(result, "P2").protected, true);
  assert.equal(find(result, "Q").protected, false);
});

check("readyAndLive: an invalid queue yields no ready set, foreign live ids are reported, input order is preserved", () => {
  const cyclic = queue([slice("A", ["a.mjs"], { dependsOn: ["B"] }), slice("B", ["b.mjs"], { dependsOn: ["A"] })]);
  const invalid = readyAndLive({ queue: cyclic, now: NOW }, LINUX);
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.ready, []);
  assert.deepEqual(codes(invalid.errors), ["SQ-DEP-CYCLE"]);
  assert.equal(readyAndLive({ queue: null, now: NOW }, LINUX).valid, false);
  const ordered = queue([slice("Z", ["z.mjs"]), slice("A", ["a.mjs"]), slice("M", ["m.mjs"])]);
  const result = readyAndLive({ queue: ordered, now: NOW, live: [liveEntry("OTHER-QUEUE-1"), "A"] }, LINUX);
  assert.deepEqual(result.ready, ["Z", "M"], "queue order, not alphabetical");
  assert.deepEqual(result.foreignLive, ["OTHER-QUEUE-1"]);
  assert.equal(result.counts.live, 1);
  assert.equal(readyAndLive({ queue: ordered, now: () => NOW }, LINUX).ready.length, 3, "now may be a function");
});

check("the default stale-after threshold equals the ledger's, so liveSlices output is directly consumable", () => {
  assert.equal(DEFAULT_STALE_AFTER_MINUTES, 20);
  assert.equal(DEFAULT_STALE_AFTER_MINUTES, LEDGER_STALE_MINUTES);
});

assert.equal(cases.length, 34,"the complete slice-queue corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
