import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commitPipeline } from "./pipeline-commit.mjs";
function repo() { const root = mkdtempSync(join(tmpdir(), "pipeline-commit-")); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "Test"], { cwd: root }); writeFileSync(join(root, "file with spaces.txt"), "one\n"); execFileSync("git", ["add", "--", "file with spaces.txt"], { cwd: root }); execFileSync("git", ["commit", "-qm", "init"], { cwd: root }); writeFileSync(join(root, "file with spaces.txt"), "two\n"); execFileSync("git", ["add", "--", "file with spaces.txt"], { cwd: root }); return root; }
test("preview and execute use staged snapshot with deterministic trailers", () => { const root = repo(); const args = { root, type: "feat", scope: "core", message: "quoted message\nsecond", dispatchTask: "ALF-COMMIT-WRAPPER", dispatchRole: "goldfish" }; assert.equal(commitPipeline(args).status, "preview"); const result = commitPipeline({ ...args, execute: true }); assert.equal(result.status, "committed"); assert.match(execFileSync("git", ["log", "-1", "--format=%B"], { cwd: root, encoding: "utf8" }), /AI-Assisted: true/u); });
test("rejects invalid type and empty stage", () => { const root = repo(); assert.throws(() => commitPipeline({ root, type: "Bad", scope: "x", message: "x", dispatchTask: "X", dispatchRole: "goldfish" }), (error) => error.code === "PC-INPUT"); execFileSync("git", ["reset", "-q"], { cwd: root }); assert.throws(() => commitPipeline({ root, type: "fix", scope: "x", message: "x", dispatchTask: "X", dispatchRole: "goldfish" }), (error) => error.code === "PC-EMPTY-STAGE"); });
