// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
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
