#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  poGateProfileReceiptPath,
  validatePoGateAuthorityForRepository,
  validatePoGateProfileReceipt,
} from "./po-gate-authority.mjs";
import { publishPoGateProfileReceipt } from "./po-gate-profile-publisher.mjs";

const NOW = "2026-07-20T12:00:00.000Z";
const PRIVATE_MARKER = "private-overlay-value-must-not-escape";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH ?? "",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function source(language = "de") {
  return `schema: pipeline.user.v3\nlanguage:\n  human_facing: ${language}\n  agent_facing: en\n# ${PRIVATE_MARKER}\n`;
}

function runtime(language = "de") {
  return `schema: pipeline.manifest.v0\nlanguage:\n  human_facing: ${language}\n`;
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "po-profile-publisher-"));
  const root = join(base, "repository");
  mkdirSync(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Neutral Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  write(join(root, "pipeline.user.yaml"), source());
  write(join(root, ".claude", "pipeline.yaml"), runtime());
  write(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({ schema: "pipeline.state.v0" }, null, 2)}\n`);
  git(root, "add", ".");
  git(root, "commit", "-m", "neutral fixture");
  const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return {
    base,
    common,
    root,
    publish(overrides = {}, deps = {}) {
      return publishPoGateProfileReceipt({
        rootDir: root,
        userYamlText: source(),
        runtimeYamlText: runtime(),
        updatedAt: NOW,
        ...overrides,
      }, deps);
    },
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}

function withFixture(fn) {
  const value = fixture();
  try {
    return fn(value);
  } finally {
    value.cleanup();
  }
}

check("publishes a mode-0600 canonical v1 receipt accepted by the existing authority validator", () => {
  withFixture(({ common, root, publish }) => {
    const result = publish();
    assert.deepEqual(result, {
      ok: true,
      code: "PO-PROFILE-RECEIPT-PUBLISHED",
      humanFacing: "de",
      receiptSha256: result.receiptSha256,
    });
    assert.match(result.receiptSha256, /^[0-9a-f]{64}$/u);

    const receiptPath = poGateProfileReceiptPath(common);
    const bytes = readFileSync(receiptPath);
    const receipt = JSON.parse(bytes);
    assert.equal(validatePoGateProfileReceipt(receipt), true);
    assert.equal(receipt.canonicalPrimaryRoot, root);
    assert.equal(lstatSync(receiptPath).mode & 0o777, 0o600);
    assert.equal(lstatSync(dirname(receiptPath)).mode & 0o777, 0o700);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), result.receiptSha256);

    const authority = validatePoGateAuthorityForRepository({ repoRoot: root });
    assert.equal(authority.ok, true, JSON.stringify(authority));
    assert.equal(authority.value.schema, "pipeline.po-gate-authority-evidence.v1");
  });
});

check("keeps machine paths and private source content out of results and public evidence", () => {
  withFixture(({ base, common, root, publish }) => {
    const result = publish();
    const authority = validatePoGateAuthorityForRepository({ repoRoot: root });
    for (const output of [JSON.stringify(result), JSON.stringify(authority)]) {
      assert.equal(output.includes(base), false);
      assert.equal(output.includes(common), false);
      assert.equal(output.includes(root), false);
      assert.equal(output.includes(PRIVATE_MARKER), false);
    }
    assert.equal(readFileSync(poGateProfileReceiptPath(common), "utf8").includes(PRIVATE_MARKER), false);
  });
});

check("rejects an invalid language projection before observing repository topology", () => {
  let topologyCalls = 0;
  const result = publishPoGateProfileReceipt({
    rootDir: "/not-observed",
    userYamlText: source("de"),
    runtimeYamlText: runtime("en"),
    updatedAt: NOW,
  }, {
    resolveTopology() {
      topologyCalls += 1;
      throw new Error("must not run");
    },
  });
  assert.equal(result.code, "PO-PROFILE-PROJECTION-INVALID");
  assert.equal(topologyCalls, 0);
});

check("rejects a non-primary invocation and sanitizes topology exceptions", () => {
  withFixture(({ base, common, root }) => {
    const linked = join(base, "linked");
    mkdirSync(linked);
    const nonPrimary = publishPoGateProfileReceipt({
      rootDir: linked,
      userYamlText: source(),
      runtimeYamlText: runtime(),
      updatedAt: NOW,
    }, {
      resolveTopology: () => ({ repoRoot: linked, primaryRoot: root, gitCommonDir: common }),
    });
    assert.equal(nonPrimary.code, "PO-PROFILE-NOT-PRIMARY");
    assert.equal(JSON.stringify(nonPrimary).includes(base), false);

    const unavailable = publishPoGateProfileReceipt({
      rootDir: root,
      userYamlText: source(),
      runtimeYamlText: runtime(),
      updatedAt: NOW,
    }, {
      resolveTopology: () => { throw new Error(`sensitive ${base}`); },
    });
    assert.deepEqual(unavailable, {
      ok: false,
      code: "PO-PROFILE-TOPOLOGY-INVALID",
      reason: "repository topology is unavailable",
    });
  });
});

check("rejects symlinked receipt leaves and private-directory components", () => {
  withFixture(({ base, common, publish }) => {
    const target = poGateProfileReceiptPath(common);
    const outside = join(base, "outside.json");
    write(outside, "outside\n");
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(outside, target);
    const result = publish();
    assert.equal(result.code, "PO-PROFILE-RECEIPT-WRITE-FAILED");
    assert.equal(readFileSync(outside, "utf8"), "outside\n");
    assert.equal(JSON.stringify(result).includes(base), false);
  });

  withFixture(({ base, common, publish }) => {
    const outside = join(base, "outside-directory");
    mkdirSync(outside);
    symlinkSync(outside, join(common, "agent-pipeline"));
    const result = publish();
    assert.equal(result.code, "PO-PROFILE-RECEIPT-WRITE-FAILED");
    assert.equal(readdirSync(outside).length, 0);
  });
});

check("cleans an unpublished temporary after a pre-rename write failure", () => {
  withFixture(({ common, publish }) => {
    const result = publish({}, {
      randomUUID: () => "fixed-write-failure",
      io: {
        renameSync: () => { throw new Error("simulated rename failure"); },
      },
    });
    assert.equal(result.code, "PO-PROFILE-RECEIPT-WRITE-FAILED");
    const parent = dirname(poGateProfileReceiptPath(common));
    assert.deepEqual(readdirSync(parent), []);
  });
});

check("distinguishes post-rename directory durability uncertainty", () => {
  withFixture(({ common, publish }) => {
    let syncCalls = 0;
    const result = publish({}, {
      io: {
        fsyncSync(descriptor) {
          syncCalls += 1;
          if (syncCalls === 2) throw new Error("simulated directory fsync failure");
          return fsyncSync(descriptor);
        },
      },
    });
    assert.deepEqual(result, {
      ok: false,
      code: "PO-PROFILE-RECEIPT-DURABILITY-UNKNOWN",
      reason: "the atomic receipt rename succeeded but directory durability could not be confirmed",
    });
    assert.equal(lstatSync(poGateProfileReceiptPath(common)).isFile(), true);
    assert.equal(lstatSync(poGateProfileReceiptPath(common)).mode & 0o777, 0o600);
  });
});

check("supports deterministic per-call dependencies while rejecting an open dependency surface", () => {
  withFixture(({ publish }) => {
    const result = publish({ updatedAt: undefined }, {
      now: () => NOW,
      randomUUID: () => "deterministic",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(publish({}, { unexpected: () => {} }), {
      ok: false,
      code: "PO-PROFILE-DEPENDENCIES-INVALID",
      reason: "publisher dependencies are invalid",
    });
    assert.deepEqual(publish({}, { io: { chmodSync: "not-a-function" } }), {
      ok: false,
      code: "PO-PROFILE-DEPENDENCIES-INVALID",
      reason: "publisher dependencies are invalid",
    });
  });
});

process.stdout.write(`po-gate-profile-publisher: ${passed} checks passed\n`);
