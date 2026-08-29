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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * A fresh project root with just enough state for `captureResumeHint` to accept a write.
 *
 * NVA-R4-RESUMERECEIPT: also `git init`s the root. Without this, `resolvePrivateStateDir()`
 * (lib/resume-hint.mjs) would resolve `--git-common-dir` from a `cwd` nested inside THIS
 * repository's own real worktree checkout and happily write real card-digest/receipt files
 * into the outer, shared `.git/agent-pipeline/resume-hint/` -- polluting the actual
 * repository's private state on every test run, not a fixture. `git init -q` here (same
 * idiom as `lib/project-authority.test.mjs`'s own `privateAdoptionArchive` fixtures) gives
 * every test, old and new, its own isolated `.git` so digest/receipt writes stay inside the
 * disposable `WORK` directory the `after()` hook below already removes.
 */
function freshRoot(name) {
  const root = join(WORK, name);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n", "utf8");
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
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

/**
 * NVA-R4-RESUMERECEIPT regression suite: makes resume-card consumption observable.
 * `freshRoot()` now `git init`s (see its own doc above), so every case below resolves
 * its own isolated `.git/agent-pipeline/resume-hint/` -- never the outer repository's.
 * These cases are RED against the pre-dispatch code: `capture`/`inspect` carried no
 * `cardDigest` field, and the `consume`/`query` subcommands did not exist at all (the
 * usage error above names only inspect/capture/discard) -- every assertion below on
 * `cardDigest`, `outcome`, or the `consume`/`query` commands fails against that baseline.
 */
function receiptsDir(root) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  return join(common, "agent-pipeline", "resume-hint");
}

test("capture records a cardDigest, and inspect exposes the SAME value back", () => {
  const root = freshRoot("digest-basic");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(VALID_CARD), "utf8");

  const captured = JSON.parse(run(["capture", "--root", root, "--card-file", cardFile]).stdout);
  assert.equal(typeof captured.cardDigest, "string");
  assert.match(captured.cardDigest, /^[a-f0-9]{64}$/);

  const inspected = JSON.parse(run(["inspect", "--root", root]).stdout);
  assert.equal(inspected.cardDigest, captured.cardDigest, "inspect must expose the exact digest capture recorded, not a recomputation");
});

test("a materialInput chunk change alters the recorded cardDigest", () => {
  const rootA = freshRoot("digest-material-a");
  const cardFileA = join(rootA, "card.json");
  writeFileSync(cardFileA, JSON.stringify({ ...VALID_CARD, materialInput: ["first verbatim design chunk"] }), "utf8");
  const capturedA = JSON.parse(run(["capture", "--root", rootA, "--card-file", cardFileA]).stdout);

  const rootB = freshRoot("digest-material-b");
  const cardFileB = join(rootB, "card.json");
  writeFileSync(cardFileB, JSON.stringify({ ...VALID_CARD, materialInput: ["a completely different verbatim chunk"] }), "utf8");
  const capturedB = JSON.parse(run(["capture", "--root", rootB, "--card-file", cardFileB]).stdout);

  assert.notEqual(capturedA.cardDigest, capturedB.cardDigest, "differing materialInput must yield a differing cardDigest");
});

test("query before any capture reports the no-card outcome", () => {
  const root = freshRoot("query-no-card");
  const queried = JSON.parse(run(["query", "--root", root, "--session-id", "session-a"]).stdout);
  assert.equal(queried.outcome, "no-card");
});

test("query after capture but before consume reports not-consumed with an absent-receipt code", () => {
  const root = freshRoot("query-not-consumed");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(VALID_CARD), "utf8");
  run(["capture", "--root", root, "--card-file", cardFile]);

  const queried = JSON.parse(run(["query", "--root", root, "--session-id", "session-a"]).stdout);
  assert.equal(queried.outcome, "not-consumed");
  assert.equal(queried.code, "RH-RECEIPT-ABSENT");
});

test("consume then query reports consumed with a matching digest -- never from a caller-supplied assertion", () => {
  const root = freshRoot("query-consumed");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(VALID_CARD), "utf8");
  const captured = JSON.parse(run(["capture", "--root", root, "--card-file", cardFile]).stdout);

  const consumed = JSON.parse(run(["consume", "--root", root, "--session-id", "session-a"]).stdout);
  assert.equal(consumed.status, "recorded");
  assert.equal(consumed.cardDigest, captured.cardDigest, "the receipt's digest must be the one the tool itself read back, matching capture's");

  const queried = JSON.parse(run(["query", "--root", root, "--session-id", "session-a"]).stdout);
  assert.equal(queried.outcome, "consumed");
  assert.equal(queried.cardDigest, captured.cardDigest);

  // A DIFFERENT session, never having consumed, must not ride along on session-a's receipt.
  const otherQueried = JSON.parse(run(["query", "--root", root, "--session-id", "session-b"]).stdout);
  assert.equal(otherQueried.outcome, "not-consumed");
});

test("a corrupt receipt is reported via the query outcome, never fatal", () => {
  const root = freshRoot("query-corrupt-receipt");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(VALID_CARD), "utf8");
  run(["capture", "--root", root, "--card-file", cardFile]);
  run(["consume", "--root", root, "--session-id", "session-a"]);

  const dir = join(receiptsDir(root), "consumption-receipts");
  const [receiptFile] = readdirSync(dir);
  writeFileSync(join(dir, receiptFile), "{ not valid json", "utf8");

  const result = run(["query", "--root", root, "--session-id", "session-a"]);
  assert.equal(result.status, 0, "a corrupt receipt must not fail the process");
  const queried = JSON.parse(result.stdout);
  assert.equal(queried.outcome, "not-consumed");
  assert.equal(queried.code, "RH-RECEIPT-CORRUPT");
});

test("a receipt bound to a stale digest (the card changed after it was read) reports a digest mismatch, never fatal", () => {
  const root = freshRoot("query-digest-mismatch");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(VALID_CARD), "utf8");
  run(["capture", "--root", root, "--card-file", cardFile]);
  run(["consume", "--root", root, "--session-id", "session-a"]);

  const digestRecordPath = join(receiptsDir(root), "card-digest.json");
  const record = JSON.parse(readFileSync(digestRecordPath, "utf8"));
  writeFileSync(digestRecordPath, JSON.stringify({ ...record, cardDigest: "f".repeat(64) }), "utf8");

  const result = run(["query", "--root", root, "--session-id", "session-a"]);
  assert.equal(result.status, 0, "a digest mismatch must not fail the process");
  const queried = JSON.parse(result.stdout);
  assert.equal(queried.outcome, "not-consumed");
  assert.equal(queried.code, "RH-RECEIPT-DIGEST-MISMATCH");
  assert.equal(queried.cardDigest, "f".repeat(64));
  assert.notEqual(queried.receiptDigest, queried.cardDigest);
});

test("an unreadable card-digest record is reported via inspect/query, never fatal", () => {
  const root = freshRoot("digest-record-corrupt");
  const cardFile = join(root, "card.json");
  writeFileSync(cardFile, JSON.stringify(VALID_CARD), "utf8");
  run(["capture", "--root", root, "--card-file", cardFile]);

  writeFileSync(join(receiptsDir(root), "card-digest.json"), "{ not valid json", "utf8");

  const inspected = run(["inspect", "--root", root]);
  assert.equal(inspected.status, 0, "a corrupt digest record must not fail inspect");
  assert.equal(JSON.parse(inspected.stdout).cardDigest, null);

  const queried = run(["query", "--root", root, "--session-id", "session-a"]);
  assert.equal(queried.status, 0, "a corrupt digest record must not fail query");
  assert.equal(JSON.parse(queried.stdout).outcome, "no-card");
});
