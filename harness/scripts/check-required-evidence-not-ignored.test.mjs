// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ACCEPTED_DEBT_PATH,
  buildAcceptedDebt,
  checkRequiredEvidenceNotIgnored,
  collectPathReferences,
} from "./check-required-evidence-not-ignored.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "required-evidence-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, contents = "x\n") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof contents === "string" ? contents : JSON.stringify(contents));
  };
  try {
    git("init", "-q");
    put(".gitignore", "/evidence/*\n/scratch/\n");
    return run({ root, git, put });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const index = (...paths) => ({ schema: "x.index.v1", entries: paths.map((recordPath) => ({ recordPath, note: "free text, not a path" })) });
const track = (f, ...paths) => { f.git("add", "-f", "--", ...paths); };
const codes = (result) => result.findings.map((entry) => `${entry.code}:${entry.path}`).sort();

test("collectPathReferences keeps only repo-relative path-shaped strings, nested at any depth", () => {
  assert.deepEqual(
    collectPathReferences({ a: "evidence/x.json", b: ["docs/y.md", { c: "scratch/z.txt" }], d: "free text", e: "https://h/p.json", f: "../up/x.json", g: "/abs/x.json", h: "no-slash.json" }).sort(),
    ["docs/y.md", "evidence/x.json", "scratch/z.txt"],
  );
});

test("an index naming an ignored, never-tracked record is reported with the matching ignore rule", () => fixture((f) => {
  f.put("evidence/the-index.json", index("evidence/dispatch-record-GONE.json"));
  track(f, "evidence/the-index.json");
  const result = checkRequiredEvidenceNotIgnored({ rootDir: f.root });
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ["REQ-EVIDENCE-IGNORED:evidence/dispatch-record-GONE.json"]);
  assert.equal(result.findings[0].source, "evidence/the-index.json");
  assert.match(result.findings[0].rule, /\/evidence\/\*/u);
  assert.equal(result.findings[0].exists, false);
}));

test("a tracked, non-ignored target is clean; an unignored untracked target is a distinct code", () => fixture((f) => {
  f.put("harness/data.json", "{}");
  f.put("harness/the-index.json", index("harness/data.json", "harness/untracked.json"));
  f.put("harness/untracked.json", "{}");
  track(f, "harness/the-index.json", "harness/data.json");
  assert.deepEqual(codes(checkRequiredEvidenceNotIgnored({ rootDir: f.root })), ["REQ-EVIDENCE-UNTRACKED:harness/untracked.json"]);
}));

test("a tracked target that an ignore rule would hide is advisory: reported, not failing", () => fixture((f) => {
  f.put("evidence/kept.json", "{}");
  f.put("evidence/the-index.json", index("evidence/kept.json"));
  track(f, "evidence/the-index.json", "evidence/kept.json");
  const result = checkRequiredEvidenceNotIgnored({ rootDir: f.root });
  assert.equal(result.ok, true);
  assert.deepEqual(codes(result), ["REQ-EVIDENCE-TRACKED-IGNORED:evidence/kept.json"]);
  assert.equal(result.findings[0].severity, "advisory");
}));

test("a reference into the git directory is machine-local by construction", () => fixture((f) => {
  f.put("harness/the-index.json", index(".git/agent-pipeline/signed-quality-packages/commit-authorizations/abc.json"));
  track(f, "harness/the-index.json");
  assert.deepEqual(codes(checkRequiredEvidenceNotIgnored({ rootDir: f.root })),
    ["REQ-EVIDENCE-GIT-DIR:.git/agent-pipeline/signed-quality-packages/commit-authorizations/abc.json"]);
}));

test("references from a non-index file are not scanned, and an untracked index is not a referrer", () => fixture((f) => {
  f.put("docs/notes.json", index("evidence/ignored-but-only-mentioned.json"));
  f.put("evidence/untracked-index.json", index("evidence/other.json"));
  track(f, "docs/notes.json");
  const result = checkRequiredEvidenceNotIgnored({ rootDir: f.root });
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
}));

// D106: the check is a gate with a named, expiring accepted baseline.
const GONE = "evidence/dispatch-record-GONE.json";
const OTHER = "evidence/dispatch-record-OTHER.json";
const debtEntry = (path, over = {}) => ({
  source: "evidence/the-index.json", path, code: "REQ-EVIDENCE-IGNORED",
  reason: "accepted until the 0.7.1 cleanup", owner: "Elephant", due: "2026-11-30", ...over,
});
const debtFile = (...entries) => ({ schema: "pipeline.required-evidence-accepted-debt.v1", entries });
const gated = (f, { refs = [GONE], debt = null, track: trackDebt = true } = {}) => {
  f.put("evidence/the-index.json", index(...refs));
  track(f, "evidence/the-index.json");
  if (debt !== null) {
    f.put(ACCEPTED_DEBT_PATH, typeof debt === "string" ? debt : debtFile(...debt));
    if (trackDebt) track(f, ACCEPTED_DEBT_PATH);
  }
};
const run = (f, today = "2026-10-22") => checkRequiredEvidenceNotIgnored({ rootDir: f.root, today });

test("an accepted pair is advisory and the check passes; the entry fields are carried into the finding", () => fixture((f) => {
  gated(f, { debt: [debtEntry(GONE)] });
  const result = run(f);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.deepEqual(codes(result), [`REQ-EVIDENCE-IGNORED:${GONE}`]);
  assert.equal(result.findings[0].severity, "accepted");
  assert.equal(result.findings[0].owner, "Elephant");
  assert.equal(result.findings[0].due, "2026-11-30");
}));

test("a pair that is not in the accepted list is an error, even when others are accepted", () => fixture((f) => {
  gated(f, { refs: [GONE, OTHER], debt: [debtEntry(GONE)] });
  const result = run(f);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.filter((entry) => entry.severity === "error").map((entry) => entry.path), [OTHER]);
  // The pair is exact: the same target from another referrer is a new reference.
  assert.equal(run(f).findings.find((entry) => entry.path === GONE).severity, "accepted");
}));

test("the exact referrer, target and code must match: a different source or code is not accepted", () => fixture((f) => {
  gated(f, { debt: [debtEntry(GONE, { source: "evidence/another-index.json" })] });
  const wrongSource = run(f);
  assert.equal(wrongSource.ok, false);
  assert.deepEqual(codes(wrongSource), [`REQ-EVIDENCE-DEBT-STALE:${GONE}`, `REQ-EVIDENCE-IGNORED:${GONE}`].sort());
}));

test("an accepted pair whose due date has passed is an error; the due day itself is still accepted", () => fixture((f) => {
  gated(f, { debt: [debtEntry(GONE)] });
  assert.equal(run(f, "2026-11-30").ok, true);
  const expired = run(f, "2026-12-01");
  assert.equal(expired.ok, false);
  assert.deepEqual(codes(expired), [`REQ-EVIDENCE-DEBT-EXPIRED:${GONE}`]);
}));

test("a listed pair that is no longer a finding is stale and fails, so the list can only shrink", () => fixture((f) => {
  f.put("harness/data.json", "{}");
  track(f, "harness/data.json");
  gated(f, { refs: ["harness/data.json"], debt: [debtEntry(GONE)] });
  const result = run(f);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), [`REQ-EVIDENCE-DEBT-STALE:${GONE}`]);
}));

test("an invalid or untracked accepted-debt file fails closed and accepts nothing", () => fixture((f) => {
  for (const bad of [
    "{ not json",
    JSON.stringify({ schema: "other", entries: [] }),
    JSON.stringify(debtFile({ ...debtEntry(GONE), extra: 1 })),
    JSON.stringify(debtFile(debtEntry(GONE, { owner: "" }))),
    JSON.stringify(debtFile(debtEntry(GONE, { due: "30.11.2026" }))),
    JSON.stringify(debtFile(debtEntry(GONE), debtEntry(GONE))),
    JSON.stringify(debtFile(debtEntry(".git/x/y.json", { code: "REQ-EVIDENCE-TRACKED-IGNORED" }))),
  ]) {
    gated(f, { debt: bad });
    const result = run(f);
    assert.equal(result.ok, false, bad);
    assert.ok(result.findings.some((entry) => entry.code === "REQ-EVIDENCE-DEBT-INVALID"), bad);
    assert.ok(result.findings.some((entry) => entry.code === "REQ-EVIDENCE-IGNORED" && entry.severity === "error"), bad);
  }
}));

test("an accepted-debt file that is not tracked is itself machine-local evidence and is refused", () => fixture((f) => {
  gated(f, { debt: [debtEntry(GONE)], track: false });
  const result = run(f);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === "REQ-EVIDENCE-DEBT-UNTRACKED"));
  assert.ok(result.findings.some((entry) => entry.code === "REQ-EVIDENCE-IGNORED" && entry.severity === "error"));
}));

test("buildAcceptedDebt is generated from the failing findings only, sorted, one entry per pair", () => {
  const findings = [
    { source: "evidence/b.json", path: "evidence/z.json", code: "REQ-EVIDENCE-IGNORED", severity: "error" },
    { source: "evidence/a.json", path: "evidence/y.json", code: "REQ-EVIDENCE-UNTRACKED", severity: "error" },
    { source: "evidence/a.json", path: "evidence/x.json", code: "REQ-EVIDENCE-TRACKED-IGNORED", severity: "advisory" },
    { source: "evidence/a.json", path: "evidence/y.json", code: "REQ-EVIDENCE-UNTRACKED", severity: "error" },
  ];
  const built = buildAcceptedDebt(findings, { due: "2026-11-30" });
  assert.equal(built.schema, "pipeline.required-evidence-accepted-debt.v1");
  assert.deepEqual(built.entries.map((entry) => `${entry.source} ${entry.path} ${entry.code}`),
    ["evidence/a.json evidence/y.json REQ-EVIDENCE-UNTRACKED", "evidence/b.json evidence/z.json REQ-EVIDENCE-IGNORED"]);
  for (const entry of built.entries) {
    assert.equal(entry.owner, "Elephant");
    assert.equal(entry.due, "2026-11-30");
    assert.ok(entry.reason.length > 20);
  }
});
