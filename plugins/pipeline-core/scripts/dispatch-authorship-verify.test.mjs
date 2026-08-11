#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for `dispatch-authorship-verify.mjs`.
 *
 * The acceptance criteria are behavioural, so the fixtures are behavioural: every case
 * writes a REAL `dispatch-record-<TASK_ID>.json` into a temporary evidence directory and
 * resolves it through the script's own `readRecordFile`, so the naming convention is under
 * test rather than assumed. Commits are synthetic — supplied through the injected readers —
 * because building a git fixture repository would test git, not the correspondence rule.
 * One smoke test at the end does exercise the real git-backed readers against this
 * repository's own HEAD, without pinning a verdict to mutable history.
 *
 * Run: node --test plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_EVIDENCE_DIR,
  ELEPHANT_STAGE0_MAX_PATHS,
  VERDICT,
  coveringPath,
  declaredCommits,
  declaredPaths,
  exitCodeFor,
  gitDeps,
  isTerminalOutcome,
  parseDispatchTrailer,
  readRecordFile,
  verifyCommit,
} from "./dispatch-authorship-verify.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const EVIDENCE = mkdtempSync(join(SCRATCH, "dispatch-authorship-"));
after(() => rmSync(EVIDENCE, { recursive: true, force: true }));

function writeRecord(taskId, record) {
  writeFileSync(join(EVIDENCE, `dispatch-record-${taskId}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

/** A synthetic commit: message plus changed paths, injected exactly where git would be. */
function commit({ message, paths = [] }) {
  return {
    readCommitMessage: () => message,
    readChangedPaths: () => paths,
    readRecord: (taskId) => readRecordFile(EVIDENCE, taskId),
  };
}

const TRAILERS = "\n\nDispatch: DOD-A (goldfish)\nAI-Assisted: true\n";

test("(a) correct trailer, terminal record, paths covered -> PASS", () => {
  writeRecord("DOD-A", {
    taskId: "DOD-A",
    outcome: "completed",
    commit: "abc1234",
    report: { changedFiles: ["src/thing.mjs - the change", "src/thing.test.mjs - its test"] },
  });
  const verdict = verifyCommit(
    "abc1234def",
    commit({ message: `feat(x): a thing\n\nWhy it matters.${TRAILERS}`, paths: ["src/thing.mjs", "src/thing.test.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.pass);
  assert.equal(verdict.classification, "bound");
  assert.equal(verdict.taskId, "DOD-A");
});

test("(b) trailer present, no record file -> FAIL record-missing", () => {
  const verdict = verifyCommit(
    "beef111",
    commit({ message: "feat(x): a thing\n\nDispatch: DOD-B-ABSENT (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-missing");
  assert.match(verdict.reason, /DOD-B-ABSENT/u);
});

test("(c) record still in-progress -> FAIL record-not-terminal", () => {
  writeRecord("DOD-C", { taskId: "DOD-C", outcome: "in-progress", log: [], report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit("cafe222", commit({ message: "feat(x): a thing\n\nDispatch: DOD-C (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-not-terminal");
});

test("(c2) a truncated record with no outcome at all is equally non-terminal", () => {
  writeRecord("DOD-C2", { taskId: "DOD-C2", log: [] });
  const verdict = verifyCommit("cafe333", commit({ message: "feat(x): a thing\n\nDispatch: DOD-C2 (goldfish)\nAI-Assisted: true\n", paths: ["a.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-not-terminal");
});

test("(d) no Dispatch trailer -> classified Elephant-direct, UNVERIFIABLE, never a missing-authorship FAIL", () => {
  const verdict = verifyCommit("d00d444", commit({ message: "docs(state): record a verdict\n\nWhy it matters.\n\nAI-Assisted: true\n", paths: ["docs/state.md"] }));
  assert.equal(verdict.classification, "elephant-direct-undeclared");
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.notEqual(verdict.verdict, VERDICT.fail, "an undeclared Elephant commit is not an authorship failure");
  assert.notEqual(verdict.verdict, VERDICT.pass, "silence must not mint a PASS -- that is failure shape 1 of the item");
  assert.match(verdict.reason, /stage-0 \(elephant\)/u);
});

test("(e) the new declared Elephant form PASSes without any record", () => {
  const verdict = verifyCommit(
    "e11e555",
    commit({ message: "chore(x): regenerate\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n", paths: ["templates/prompts/agent-obligations.md"] }),
  );
  assert.equal(verdict.verdict, VERDICT.pass);
  assert.equal(verdict.classification, "elephant-direct-declared");
  assert.equal(verdict.taskId, "stage-0");
});

test("(f) record naming a different commit -> FAIL (item failure shape 3)", () => {
  writeRecord("DOD-F", { taskId: "DOD-F", outcome: "done", commit: "e5a6a9b", report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit("f00f666", commit({ message: "feat(x): a thing\n\nDispatch: DOD-F (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-names-different-commit");
});

test("(f2) a multi-commit dispatch binds every sha it declares in `commits`", () => {
  writeRecord("DOD-F2", {
    taskId: "DOD-F2",
    outcome: "done",
    commits: ["6ad81155", "8161c31a"],
    report: { changedFiles: ["src/thing.mjs - x"] },
  });
  const fixture = { message: "feat(x): a thing\n\nDispatch: DOD-F2 (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] };
  for (const sha of ["6ad81155f000aa", "8161c31af6c5bb"]) {
    assert.equal(verifyCommit(sha, commit(fixture)).verdict, VERDICT.pass, sha);
  }
  const stranger = verifyCommit("deadbeef0000", commit(fixture));
  assert.equal(stranger.verdict, VERDICT.fail);
  assert.equal(stranger.classification, "record-names-different-commit");
});

test("declaredCommits reads both the singular and the plural field, and null when neither", () => {
  assert.deepEqual(declaredCommits({ commit: "abc1234" }), ["abc1234"]);
  assert.deepEqual(declaredCommits({ commits: ["abc1234", "def5678"] }), ["abc1234", "def5678"]);
  assert.equal(declaredCommits({ outcome: "done" }), null);
  assert.equal(declaredCommits({ commit: "   " }), null);
  assert.equal(declaredCommits({ commits: [] }), null);
});

test("(g) terminal record with no machine-readable paths -> UNVERIFIABLE, not PASS", () => {
  writeRecord("DOD-G", { taskId: "DOD-G", outcome: "success", report: "a prose report, as several real records carry" });
  const verdict = verifyCommit("a11a777", commit({ message: "feat(x): a thing\n\nDispatch: DOD-G (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-has-no-machine-readable-paths");
});

test("(h) declared paths that do not cover the diff -> FAIL, naming the uncovered paths", () => {
  writeRecord("DOD-H", { taskId: "DOD-H", outcome: "completed", report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit(
    "b22b888",
    commit({ message: "feat(x): a thing\n\nDispatch: DOD-H (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs", "harness/scripts/verify.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-paths-do-not-cover");
  assert.deepEqual(verdict.uncovered, ["harness/scripts/verify.mjs"]);
});

test("(i) record whose own taskId denies the trailer -> FAIL (item failure shape 2, structural half)", () => {
  writeRecord("DOD-I", { taskId: "SETUP-4", outcome: "done", report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit("c33c999", commit({ message: "feat(x): a thing\n\nDispatch: DOD-I (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-taskid-mismatch");
});

test("a Dispatch: mentioned in the body prose is not authorship evidence", () => {
  const verdict = verifyCommit(
    "d44d000",
    commit({ message: "docs: explain\n\nThe rule is Dispatch: SHIP-2 (goldfish) on every commit.\n\nAI-Assisted: true\n", paths: ["docs/x.md"] }),
  );
  assert.equal(verdict.classification, "elephant-direct-undeclared");
});

test("a malformed Dispatch value FAILs rather than being read as a task id", () => {
  const verdict = verifyCommit("e55e111", commit({ message: "feat(x): a thing\n\nDispatch: elephant-stage0\nAI-Assisted: true\n", paths: ["a.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "trailer-malformed");
});

test("parseDispatchTrailer reads both sanctioned forms through one grammar", () => {
  assert.deepEqual(parseDispatchTrailer("x\n\nDispatch: NVA-BL-34 (goldfish)\nAI-Assisted: true\n"), {
    raw: "NVA-BL-34 (goldfish)",
    id: "NVA-BL-34",
    role: "goldfish",
    malformed: false,
  });
  assert.deepEqual(parseDispatchTrailer("x\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n"), {
    raw: "stage-0 (elephant)",
    id: "stage-0",
    role: "elephant",
    malformed: false,
  });
  assert.equal(parseDispatchTrailer("x\n\nAI-Assisted: true\n"), null);
});

test("terminality is a denylist: the corpus vocabulary all counts as terminal", () => {
  for (const outcome of ["completed", "success", "done", "completed-with-open-items", "completed-by-elephant-finish", "stopped-tool-budget"]) {
    assert.equal(isTerminalOutcome(outcome), true, outcome);
  }
  for (const outcome of ["in-progress", "In-Progress", "", "   ", null, undefined, 7]) {
    assert.equal(isTerminalOutcome(outcome), false, String(outcome));
  }
});

test("path coverage accepts a declared directory prefix but never a bare basename", () => {
  assert.equal(coveringPath("plugins/pipeline-core/lib/a.mjs", ["plugins/pipeline-core/lib"]), "plugins/pipeline-core/lib");
  assert.equal(coveringPath("plugins/pipeline-core/lib/a.mjs", ["a.mjs"]), null);
  assert.equal(coveringPath("src/a.mjs", ["src/a.mjs - because"]), null, "the rationale suffix is stripped by declaredPaths, not here");
});

test("declaredPaths distinguishes 'no path field' from 'an empty list'", () => {
  assert.equal(declaredPaths({ outcome: "done", report: "prose" }), null);
  assert.deepEqual(declaredPaths({ report: { changedFiles: [] } }), []);
  assert.deepEqual(declaredPaths({ report: { changedFiles: ["`src/a.mjs` - why", { path: "src/b.mjs" }] } }), ["src/a.mjs", "src/b.mjs"]);
});

test("exit codes: 0 all pass, 1 any fail, 2 unverifiable-only, and --strict folds 2 into 1", () => {
  const pass = { verdict: VERDICT.pass };
  const fail = { verdict: VERDICT.fail };
  const unver = { verdict: VERDICT.unverifiable };
  assert.equal(exitCodeFor([pass, pass]), 0);
  assert.equal(exitCodeFor([pass, fail, unver]), 1);
  assert.equal(exitCodeFor([pass, unver]), 2);
  assert.equal(exitCodeFor([pass, unver], { strict: true }), 1);
});

test("(j) an Elephant trailer with an id other than stage-0 is UNVERIFIABLE, not a free PASS", () => {
  const verdict = verifyCommit(
    "f66f001",
    commit({ message: "feat(x): a thing\n\nDispatch: NVA-BL-99 (elephant)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "elephant-direct-nonstandard-id");
  assert.notEqual(verdict.verdict, VERDICT.pass, "an invented Elephant id must not mint a PASS with no record lookup");
});

test("(j2) a declared stage-0 commit over the size bound is UNVERIFIABLE and the count is named", () => {
  const many = Array.from({ length: ELEPHANT_STAGE0_MAX_PATHS + 1 }, (_unused, index) => `src/file-${index}.mjs`);
  const verdict = verifyCommit("f66f002", commit({ message: "chore(x): sweep\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n", paths: many }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "elephant-direct-oversized");
  assert.equal(verdict.pathCount, many.length);
  assert.match(verdict.reason, new RegExp(String(ELEPHANT_STAGE0_MAX_PATHS), "u"));
});

test("(j3) exactly at the bound still PASSes, so the bound is a bound and not an off-by-one", () => {
  const atBound = Array.from({ length: ELEPHANT_STAGE0_MAX_PATHS }, (_unused, index) => `src/file-${index}.mjs`);
  const verdict = verifyCommit("f66f003", commit({ message: "chore(x): sweep\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n", paths: atBound }));
  assert.equal(verdict.verdict, VERDICT.pass);
  assert.equal(verdict.classification, "elephant-direct-declared");
});

test("(k) two Dispatch trailers on one commit are surfaced, never silently resolved to the topmost", () => {
  const message = "feat(x): a thing\n\nDispatch: DOD-A (goldfish)\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n";
  const parsed = parseDispatchTrailer(message);
  assert.equal(parsed.ambiguous, true);
  assert.equal(parsed.count, 2);
  assert.equal(parsed.id, null, "no id may be picked out of two competing claims");
  const verdict = verifyCommit("f66f004", commit({ message, paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "trailer-ambiguous");
  assert.notEqual(verdict.taskId, "DOD-A", "the topmost trailer must not become the verdict's task id");
});

test("(k2) ambiguity is judged over the trailer block only: prose plus one real trailer stays unambiguous", () => {
  const message = "docs: explain\n\nThe rule is Dispatch: SHIP-2 (goldfish) on every commit.\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n";
  const parsed = parseDispatchTrailer(message);
  assert.equal(parsed.ambiguous, undefined);
  assert.equal(parsed.id, "stage-0");
  assert.equal(verifyCommit("f66f005", commit({ message, paths: ["docs/x.md"] })).verdict, VERDICT.pass);
});

test("(l) a task id that is not a safe filename fragment is refused before it reaches the filesystem", () => {
  const verdict = verifyCommit(
    "f77f001",
    commit({ message: "feat(x): a thing\n\nDispatch: ../../../../etc/passwd (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "trailer-taskid-unsafe");
  assert.match(verdict.reason, /safe filename fragment/u);
});

test("(l2) readRecordFile itself refuses an unsafe id rather than joining it into a path", () => {
  assert.throws(() => readRecordFile(EVIDENCE, "../../../../etc/passwd"), /unsafe task id/u);
  assert.throws(() => readRecordFile(EVIDENCE, "a/b"), /unsafe task id/u);
  assert.equal(readRecordFile(EVIDENCE, "NOT-WRITTEN-BY-ANY-TEST"), null, "a safe id that has no record is still a plain null");
});

test("the real git-backed readers work against this repository's own HEAD", () => {
  const deps = gitDeps({ evidenceDir: DEFAULT_EVIDENCE_DIR });
  assert.equal(typeof deps.readCommitMessage("HEAD"), "string");
  assert.ok(Array.isArray(deps.readChangedPaths("HEAD")));
  const verdict = verifyCommit("HEAD", deps);
  assert.ok([VERDICT.pass, VERDICT.fail, VERDICT.unverifiable].includes(verdict.verdict));
  assert.equal(typeof verdict.reason, "string");
});
