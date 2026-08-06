#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReleasePreflightCliError, buildReleasePreflight } from "./release-preflight-cli.mjs";

const POLICY = "c".repeat(64);
const roots = [];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture({ version = "1.2.3", manifestVersion = null, consentStatus = "approved", dirty = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), "release-preflight-cli-"));
  roots.push(base);
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: base, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const write = (path, value) => {
    mkdirSync(join(base, path, ".."), { recursive: true });
    writeFileSync(join(base, path), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");

  write("VERSION", `${version}\n`);
  const manifest = manifestVersion ?? version;
  write("plugins/pipeline-core/.codex-plugin/plugin.json", { name: "pipeline-core", version: manifest });
  write("plugins/pipeline-core/.claude-plugin/plugin.json", { name: "pipeline-core", version: manifest });
  for (const [kind, path] of Object.entries({ prd: "docs/prd.md", spec: "docs/spec.md", acceptance: "docs/acceptance.md", result: "docs/result.md" })) {
    write(path, `# ${kind}\n`);
  }
  write("consent.json", {
    authoritySha256: "a".repeat(64), decisionId: "b".repeat(64),
    evaluatedAt: "2026-08-06T10:00:00Z", expiresAt: "2026-08-07T10:00:00Z", status: consentStatus,
  });
  write("lifecycle.json", {
    featureId: "fixture-feature",
    documents: { prd: "docs/prd.md", spec: "docs/spec.md", acceptance: "docs/acceptance.md", result: "docs/result.md" },
  });
  git("add", "-A");
  git("commit", "-qm", "base");
  const baseCommit = git("rev-parse", "HEAD");
  write("docs/result.md", "# result\n\nsecond revision\n");
  git("add", "-A");
  git("commit", "-qm", "candidate");
  if (dirty) write("docs/spec.md", "# spec\n\nuncommitted\n");
  return { base, baseCommit };
}

const build = ({ base, baseCommit }, over = {}) => buildReleasePreflight({
  rootDir: base, preflightId: "fixture-preflight", baseCommit,
  consentPath: "consent.json", lifecyclePath: "lifecycle.json", retentionPolicySha256: POLICY, ...over,
});

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("RPC01 a clean candidate with agreeing surfaces and approved consent is ready", () => {
    const { record } = build(fixture());
    assert.deepEqual(record.reasons, []);
    assert.equal(record.status, "ready");
    assert.equal(record.schema, "pipeline.release-preflight.v1");
    assert.match(record.recordSha256, /^[0-9a-f]{64}$/u);
  });

  // The load-bearing property: no input state can be talked into "ready".
  check("RPC02 an unapproved consent blocks, and the tool never substitutes approval", () => {
    const { record } = build(fixture({ consentStatus: "declined" }));
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("consent-not-approved"), record.reasons.join(", "));
    assert.equal(record.consent.status, "declined", "consent status must pass through verbatim");
  });

  check("RPC03 an uncommitted working tree blocks", () => {
    const { record } = build(fixture({ dirty: true }));
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("repository-not-clean"), record.reasons.join(", "));
  });

  check("RPC04 version surfaces that disagree block", () => {
    // Exactly this repository's release-time state: VERSION is stable while the
    // plugin manifests still carry a local-development build suffix.
    const { record } = build(fixture({ version: "1.2.3", manifestVersion: "1.2.3+claude.20260806.abcdefg" }));
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("version-decision-mismatch"), record.reasons.join(", "));
  });

  check("RPC05 a GG-03 binding naming another candidate blocks", () => {
    const context = fixture();
    writeFileSync(join(context.base, "gg03.json"), `${JSON.stringify({
      schema: "pipeline.gg-03-binding.v1", operation: "protected-main-fast-forward",
      candidateCommit: "0".repeat(40), candidateTree: "1".repeat(40),
      authoritySha256: "d".repeat(64), evidenceSha256: "e".repeat(64),
    }, null, 2)}\n`);
    const { record } = build(context, { gg03Path: "gg03.json" });
    assert.equal(record.status, "blocked");
    assert.ok(record.reasons.includes("gg03-candidate-mismatch"), record.reasons.join(", "));
  });

  check("RPC06 an omitted GG-03 is recorded as not required, never as satisfied", () => {
    const { record } = build(fixture());
    assert.equal(record.gates.gg03.required, false);
    assert.equal(record.gates.gg03.binding, null);
  });

  check("RPC07 documentation digests are read from the tree, not supplied", () => {
    const context = fixture();
    const { record } = build(context);
    assert.equal(record.documentation.prd.path, "docs/prd.md");
    assert.equal(record.documentation.prd.sha256, sha256("# prd\n"));
  });

  check("RPC08 an absolute or escaping input path is refused", () => {
    const context = fixture();
    for (const consentPath of ["/etc/passwd", "../outside.json"]) {
      assert.throws(() => build(context, { consentPath }), (error) => {
        assert.ok(error instanceof ReleasePreflightCliError, error?.message);
        assert.equal(error.code, "RPC-PATH");
        return true;
      });
    }
  });

  check("RPC09 every final gate stays pending and separated by kind", () => {
    const { record } = build(fixture());
    assert.deepEqual(record.gates.inventory.map((gate) => gate.id), ["verify", "security", "critic", "remote", "human"]);
    assert.ok(record.gates.inventory.every((gate) => gate.status === "pending"));
    assert.deepEqual(
      record.gates.inventory.filter((gate) => gate.kind === "external").map((gate) => gate.id),
      ["remote", "human"],
    );
  });

  console.log(`\nrelease-preflight-cli: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
