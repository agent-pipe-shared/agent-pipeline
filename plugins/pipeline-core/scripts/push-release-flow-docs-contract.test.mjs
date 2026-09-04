#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// NVA-W4-04 (scratch/stripped-cli-docs-generated-from-parser.md,
// backlog/items/2026-08-09-push-approval-skill-reference-predates-adr-0061.md Direction 2):
// extracts every push/release command example shown in `docs/push-release-flow.md` into an
// argv fixture and contract-tests it against the real exported `run()` (pipeline-state.mjs)
// / `parseHumanArgs()` (po-human-approval.mjs, the flag-acceptance layer `runHumanApproval()`
// builds on) -- reusing the invoke()/fixture() pattern already established in
// `pipeline-state-result-case-migration.test.mjs`, never a hand-rolled shape of its own.
//
// This is precisely the class of drift that shipped live in this exact doc: the
// `materialize-push-threat-model` example carried a documented `--dir <repo>` flag that the
// actual command has never accepted (`parseExactFlags(rest, new Set())` -- see the "This used
// to name a `--dir` flag" comment at pipeline-state.mjs's materialize-push-threat-model case).
// This dispatch fixed that doc line as part of writing this file (see the commit); the test
// below pins BOTH shapes so the corrected example cannot silently regress back to the wrong
// one, and so the wrong one is proven wrong by the same harness rather than by inspection.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import { parseHumanArgs } from "./po-human-approval.mjs";
import { parseArgs as parsePushInitArgs, usage as pushInitUsage } from "./push-init.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const NOW = () => "2026-08-18T00:00:00.000Z";
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const FIXED_GIT_HEAD = () => ({ ok: true, commit: COMMIT });
const FIXED_GIT_CANDIDATE = () => ({ ok: true, commit: COMMIT, tree: TREE });

function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), `push-release-flow-docs-contract-${prefix}-`));
}

// Captures stderr so a test can tell a flag-SHAPE refusal (a renamed/missing documented flag)
// apart from a content-level refusal reached only once the argv shape was already accepted --
// the same distinction the drift class this dispatch targets turns on.
function invokeCapturingStderr(argv, deps) {
  const err = [];
  const error = console.error;
  console.error = (...x) => err.push(x.join(" "));
  try {
    return { status: run(argv, deps), err: err.join("\n") };
  } finally {
    console.error = error;
  }
}

// --- Layer 2/3 (current shape): `po-human-approval.mjs authorize-critical` -----------------
// docs/push-release-flow.md lines ~40-45 (kind push) and ~93-96 (kind release-preflight).
// parseHumanArgs() is the exact flag-acceptance layer runHumanApproval() builds on; testing at
// this seam catches a renamed/missing flag (the --dir-flag incident's shape) without needing to
// drive the interactive signing ceremony this command also performs.

test("documented `authorize-critical --kind push` argv is accepted by the real flag parser", () => {
  const argv = [
    "authorize-critical",
    "--repo-root", "/repo",
    "--directory", "/external-po-dir",
    "--feature-id", "cyb-4",
    "--plan", "specs/feature/prd_feature.md",
    "--spec", "specs/feature/spec.md",
    "--kind", "push",
    "--subject-sha256", "c".repeat(64),
    "--expires-at", "2026-08-19T00:00:00.000Z",
  ];
  const parsed = parseHumanArgs(argv);
  assert.equal(parsed.error, undefined, `documented push argv was rejected: ${parsed.error}`);
  assert.equal(parsed.command, "authorize-critical");
  assert.equal(parsed.kind, "push");
  assert.equal(parsed.subjectSha256, "c".repeat(64));
});

test("documented `authorize-critical --kind release-preflight` argv (with --subject, no --subject-sha256) is accepted", () => {
  const argv = [
    "authorize-critical",
    "--repo-root", "/repo",
    "--directory", "/external-po-dir",
    "--feature-id", "cyb-4",
    "--plan", "specs/feature/prd_feature.md",
    "--spec", "specs/feature/spec.md",
    "--kind", "release-preflight",
    "--subject", "evidence/release-preflight-subject.json",
    "--expires-at", "2026-08-19T00:00:00.000Z",
  ];
  const parsed = parseHumanArgs(argv);
  assert.equal(parsed.error, undefined, `documented release-preflight argv was rejected: ${parsed.error}`);
  assert.equal(parsed.kind, "release-preflight");
  assert.equal(parsed.subject, "evidence/release-preflight-subject.json");
});

// --- Layer 3 (superseded shape, still documented as "still supported"): `approve-critical` --
test("documented (superseded) `approve-critical` argv is still accepted by the real flag parser", () => {
  const argv = ["approve-critical", "--repo-root", "/repo", "--directory", "/external-po-dir", "--kind", "push"];
  const parsed = parseHumanArgs(argv);
  assert.equal(parsed.error, undefined, `documented approve-critical argv was rejected: ${parsed.error}`);
  assert.equal(parsed.kind, "push");
});

// --- Layer 4: `pipeline-state.mjs approve-push` ---------------------------------------------
// docs/push-release-flow.md lines ~196-201. Runs against the real `run()` with the exact
// six documented flags; asserts the failure (there is no real proof file in this fixture) is a
// CONTENT-level refusal reached only after the argv shape was accepted -- never the flag-shape
// refusal ("approve-push requires --by, --remote, --destination, --proof-request,
// --proof-authority and --proof") that a renamed/missing documented flag would produce.
test("documented `approve-push` argv (six flags) is accepted by the real flag parser and fails only on missing proof content", () => {
  const dir = freshDir("approve-push");
  try {
    const materialize = run(["materialize-push-threat-model"], { dir, now: NOW });
    assert.equal(materialize, 0, "fixture setup: materialize-push-threat-model must succeed to reach approve-push's content checks");
    const result = invokeCapturingStderr([
      "approve-push",
      "--by", "po-test",
      "--remote", "origin",
      "--destination", "refs/heads/main",
      "--proof-request", join(dir, "request-critical-push.json"),
      "--proof-authority", join(dir, "trust-policy.json"),
      "--proof", join(dir, "proof-critical-push.json"),
    ], { dir, now: NOW, gitHead: FIXED_GIT_HEAD, gitCandidate: FIXED_GIT_CANDIDATE });
    assert.equal(result.status, 2, "no real proof exists in this fixture; a content-level refusal is expected");
    assert.doesNotMatch(
      result.err,
      /requires --by, --remote, --destination, --proof-request, --proof-authority and --proof/,
      `documented flags were rejected at the flag-shape layer, not a content layer: ${result.err}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Layer 4 addendum: `materialize-push-threat-model` (the drift this dispatch fixed) ------
// docs/push-release-flow.md line ~143 (corrected by this dispatch to drop the never-real --dir
// flag). Pins the corrected shape AND proves the old, drifted shape this doc used to show is
// refused by the real parser -- the exact failure mode a doc/CLI drift produces undetected.
test("corrected documented `materialize-push-threat-model` argv (no flags) succeeds", () => {
  const dir = freshDir("materialize-ok");
  try {
    const code = run(["materialize-push-threat-model"], { dir, now: NOW });
    assert.equal(code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the historical drifted `materialize-push-threat-model --dir <repo>` argv is refused (proves the fixture would have caught the incident)", () => {
  const dir = freshDir("materialize-drift");
  try {
    const code = run(["materialize-push-threat-model", "--dir", dir], { dir, now: NOW });
    assert.equal(code, 2, "the never-real --dir flag must be refused by the closed parser");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- push-init: cross-check every documented invocation against the real usage()/parseArgs() -
// pipeline.no-check-holds-the-shipped-copies-of-push-release-flow-in-agreement (Direction option
// 2): `docs/push-release-flow.md` exists three times (the root copy, the vendored plugin copy,
// and the `push-approval.md` skill reference's own restatement of the same invocation), plus a
// fourth, abbreviated shape in the root doc's own summary table. `7d56917c` changed
// `push-init.mjs`'s argument contract and updated only the root copy; a full verify ran green
// because nothing here read the driver's own `usage()`/`parseArgs()`. This does: it extracts
// every documented `push-init.mjs` invocation, builds a concrete argv from its flags, and
// asserts (a) the real parser accepts it and (b) every flag it names is one `usage()` itself
// advertises -- so a doc that invents a flag the driver never had (the `--dir` incident's shape)
// or drops a flag the driver requires is refused here, even if the copies agree with each other
// and are both wrong. NOTE: byte-identity between the root and vendored `push-release-flow.md`
// copies is already enforced separately by
// `harness/scripts/generate-vendored-canon.mjs --check` (docs/push-release-flow.md is a
// UNIVERSAL_STANDALONE_FILE there); this suite is the one piece that mechanism does not cover.

const PUSH_INIT_DOC_SOURCES = [
  { label: "docs/push-release-flow.md (root)", path: join(REPO_ROOT, "docs", "push-release-flow.md") },
  {
    label: "plugins/pipeline-core/docs/push-release-flow.md (vendored)",
    path: join(REPO_ROOT, "plugins", "pipeline-core", "docs", "push-release-flow.md"),
  },
  {
    label: "plugins/pipeline-core/skills/pipeline-start/references/push-approval.md",
    path: join(REPO_ROOT, "plugins", "pipeline-core", "skills", "pipeline-start", "references", "push-approval.md"),
  },
];

// Real flags `push-init.mjs`'s own `usage()` advertises, derived once from the driver rather
// than hand-copied -- so this suite itself cannot silently drift from the parser it checks.
const REAL_PUSH_INIT_FLAGS = new Set([...pushInitUsage().matchAll(/--[a-z-]+/g)].map((m) => m[0]));
const REQUIRED_PUSH_INIT_FLAGS = ["--root", "--by", "--remote", "--destination"];

/** Every line in `text` that names a `push-init.mjs` invocation, flags extracted in order. */
function extractPushInitInvocations(text) {
  const invocations = [];
  for (const line of text.split("\n")) {
    if (!line.includes("push-init.mjs")) continue;
    const afterCommand = line.slice(line.indexOf("push-init.mjs") + "push-init.mjs".length);
    const flags = [...afterCommand.matchAll(/--[a-z-]+/g)].map((m) => m[0]);
    if (flags.length > 0) invocations.push({ line, flags });
  }
  return invocations;
}

for (const source of PUSH_INIT_DOC_SOURCES) {
  test(`every documented push-init.mjs invocation in ${source.label} matches the real usage()/parseArgs()`, () => {
    const text = readFileSync(source.path, "utf8");
    const invocations = extractPushInitInvocations(text);
    assert.ok(invocations.length > 0, `expected at least one push-init.mjs invocation line in ${source.label}`);
    for (const { line, flags } of invocations) {
      for (const flag of flags) {
        assert.ok(
          REAL_PUSH_INIT_FLAGS.has(flag),
          `${source.label} documents flag ${flag} that push-init.mjs's own usage() does not advertise: ${line}`,
        );
      }
      for (const required of REQUIRED_PUSH_INIT_FLAGS) {
        assert.ok(
          flags.includes(required),
          `${source.label} documents an invocation missing required flag ${required}: ${line}`,
        );
      }
      // Build a concrete argv (dummy values) from the documented flags and feed it to the real
      // parser -- catches a renamed/removed flag even when it happens to still be a substring of
      // usage() (e.g. a typo that still matches `--[a-z-]+`).
      const argv = [];
      for (const flag of flags) argv.push(flag, `test-value-${flag.replace(/^--/, "")}`);
      const parsed = parsePushInitArgs(argv);
      assert.equal(parsed.error, undefined, `${source.label}'s documented argv was rejected by the real parser: ${parsed.error} (line: ${line})`);
    }
  });
}
