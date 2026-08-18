#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md
// Direction 1: "for each Pipeline CLI proposed for an allowlist, establish that the guard
// admits a closed, positional argv set and refuses everything else." This proves that
// claim for `approve-push` specifically -- the one `pipeline-state.mjs` subcommand that
// carries a settings-allowlist entry (`.claude/settings.json`), because it is the only
// subcommand whose entire argument surface is validated by the closed `parseExactFlags`
// parser (see the "Closed parser for commands whose entire argument surface is part of
// their CAS tuple" comment in pipeline-state.mjs). A settings-layer prefix match like
// `Bash(node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push *)` admits any
// trailing argv; these tests prove the CLI's own parser -- not the settings glob -- is what
// actually refuses anything outside the exact declared flag set.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";

const FIXED_NOW = () => "2026-08-18T00:00:00.000Z";
const FIXED_GIT_HEAD = () => ({ ok: true, commit: "abc123deadbeef" });

function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), `pipeline-state-approve-push-argv-${prefix}-`));
}

test("approve-push refuses an argv carrying an extra, undeclared flag (closed set, not open)", () => {
  const dir = freshDir("extra-flag");
  try {
    // Every flag `signature` mode (the default) declares, plus one the parser has never
    // heard of. A settings-layer prefix match would let this argv through unexamined; the
    // CLI's own parseExactFlags must refuse it, exit non-zero, because it is not the exact
    // declared set.
    const code = run([
      "approve-push",
      "--by", "po-test",
      "--remote", "origin",
      "--destination", "refs/heads/main",
      "--proof-request", "request.json",
      "--proof-authority", "authority.json",
      "--proof", "proof.json",
      "--unexpected-extra-flag", "smuggled-value",
    ], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
    assert.equal(code, 2, `expected refusal (exit 2) for an argv outside the closed flag set, got ${code}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("approve-push refuses an argv substituting an unrecognized flag name for a required one", () => {
  const dir = freshDir("renamed-flag");
  try {
    // `--by-name` is not `--by`: the exact required set is absent AND an unrecognized name
    // is present. Two independent reasons parseExactFlags must return { ok: false }.
    const code = run([
      "approve-push",
      "--by-name", "po-test",
      "--remote", "origin",
      "--destination", "refs/heads/main",
      "--proof-request", "request.json",
      "--proof-authority", "authority.json",
      "--proof", "proof.json",
    ], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
    assert.equal(code, 2, `expected refusal (exit 2) for a renamed required flag, got ${code}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("approve-push refuses a duplicated flag even when every declared name is present", () => {
  const dir = freshDir("dup-flag");
  try {
    // parseExactFlags rejects a repeated key (Object.prototype.hasOwnProperty.call(out, name))
    // -- proving the closed set is exact-cardinality, not just exact-membership: repeating a
    // legitimate flag to smuggle a second value past a naive glob is refused too.
    const code = run([
      "approve-push",
      "--by", "po-test",
      "--by", "second-value",
      "--remote", "origin",
      "--destination", "refs/heads/main",
      "--proof-request", "request.json",
      "--proof-authority", "authority.json",
      "--proof", "proof.json",
    ], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
    assert.equal(code, 2, `expected refusal (exit 2) for a duplicated flag, got ${code}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
