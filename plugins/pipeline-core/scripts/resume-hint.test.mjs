#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for `resume-hint.mjs capture --consume-card`.
 *
 * The script has no exported functions (CLI-only, no `if (import.meta.url === ...)`
 * guard, and `main()` runs unconditionally at module load against `process.argv`),
 * so every case here invokes it as a real subprocess via `execFileSync` rather than
 * importing it -- importing it would immediately execute a CLI run against this
 * test file's own argv.
 *
 * Run: node --test plugins/pipeline-core/scripts/resume-hint.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "resume-hint.mjs");
const REPO_ROOT = join(HERE, "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = mkdtempSync(join(SCRATCH, "resume-hint-cli-"));
after(() => rmSync(WORK, { recursive: true, force: true }));

/** A fresh project root with just enough state for `captureResumeHint` to accept a write. */
function freshRoot(name) {
  const root = join(WORK, name);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n", "utf8");
  return root;
}

const VALID_CARD = {
  intent: "regression test for resume hint capture ordering",
  scope: ["unit test"],
  constraints: ["no live git required beyond project/pipeline.yaml"],
  questions: ["does capture consume only after a successful write"],
};

/** Missing the required `questions` key -- fails contextCard()'s REQUIRED_CARD_KEYS check with RH-CARD-SCHEMA. */
const SCHEMA_INVALID_CARD = {
  intent: "regression test for the schema-rejection path",
  scope: ["unit test"],
  constraints: ["missing the required questions key on purpose"],
};

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("capture --consume-card leaves a schema-invalid card on disk and reports the schema error (RED before the fix)", () => {
  const root = freshRoot("schema-invalid");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(SCHEMA_INVALID_CARD), "utf8");

  const result = run(["capture", "--root", root, "--card-file", cardFile, "--consume-card"]);

  assert.notEqual(result.status, 0, "a schema-invalid card must not exit 0");
  assert.match(result.stderr, /RH-CARD-SCHEMA/, "the process must report the schema error on stderr");
  assert.equal(existsSync(cardFile), true, "the input card must still exist after a rejected capture");
  assert.deepEqual(JSON.parse(readFileSync(cardFile, "utf8")), SCHEMA_INVALID_CARD, "the surviving card must be byte-identical to what was written, not partially consumed");
});

test("capture --consume-card deletes the card only after a successful capture is observable via inspect", () => {
  const root = freshRoot("schema-valid");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(VALID_CARD), "utf8");

  const result = run(["capture", "--root", root, "--card-file", cardFile, "--consume-card"]);

  assert.equal(result.status, 0, `capture of a schema-valid card must exit 0; stderr: ${result.stderr}`);
  const captured = JSON.parse(result.stdout);
  assert.equal(captured.context.intent, VALID_CARD.intent);
  assert.equal(existsSync(cardFile), false, "the card must be consumed only after a successful capture");

  const inspected = JSON.parse(run(["inspect", "--root", root]).stdout);
  assert.equal(inspected.status, "available", "the captured hint must be readable back via inspect");
});

test("a card that fails validation AFTER contextCard() (invalid materialInput) also survives --consume-card", () => {
  const root = freshRoot("post-schema-invalid");
  const cardFile = join(root, "card.json");
  // Passes contextCard()'s top-level key-shape check (materialInput is an admitted
  // VERBATIM_CARD_KEYS key) but fails validMaterialInput() one step later --
  // exercising the same validate-before-consume ordering past the first check.
  writeFileSync(cardFile, JSON.stringify({ ...VALID_CARD, materialInput: [] }), "utf8");

  const result = run(["capture", "--root", root, "--card-file", cardFile, "--consume-card"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RH-CARD-SCHEMA/);
  assert.equal(existsSync(cardFile), true, "a card rejected past the first validation step must also survive");
});
