// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  INITIAL_ANSWERS_LOCAL_RECEIPT,
  resolveInitialAnswersState,
} from "./onboarding-initial-answers-state.mjs";

test("local first-answer receipt retains its historical path and never creates state", () => {
  const root = mkdtempSync(join(tmpdir(), "initial-local-"));
  try {
    const state = resolveInitialAnswersState(root, "local");
    assert.equal(state.receipt, join(root, INITIAL_ANSWERS_LOCAL_RECEIPT));
    assert.equal(state.pending, null);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.throws(() => resolveInitialAnswersState(root, "local", { create: true }), /existing local writer/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("host-managed first-answer paths stay in the private runtime, not reserved controls", () => {
  const root = mkdtempSync(join(tmpdir(), "initial-host-"));
  try {
    const state = resolveInitialAnswersState(root, "host-managed");
    assert.equal(state.receipt, join(root, ".claude/.runtime/agent-pipeline/onboarding/initial-answers.json"));
    assert.equal(state.pending, join(root, ".claude/.runtime/agent-pipeline/onboarding/initial-answers-pending.json"));
    assert.equal(existsSync(join(root, ".claude")), false);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(existsSync(join(root, ".codex")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unknown repository capabilities do not silently select local state", () => {
  const root = mkdtempSync(join(tmpdir(), "initial-unknown-"));
  try { assert.throws(() => resolveInitialAnswersState(root, "unknown"), /cannot host/u); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("host-managed creation owns only the private tree and rejects an alias", () => {
  const root = mkdtempSync(join(tmpdir(), "initial-host-create-"));
  const outside = mkdtempSync(join(tmpdir(), "initial-host-outside-"));
  try {
    const state = resolveInitialAnswersState(root, "host-managed", { create: true });
    assert.equal(existsSync(join(root, ".claude/.runtime/agent-pipeline/onboarding")), true);
    assert.equal(existsSync(state.receipt), false);
    assert.equal(existsSync(state.pending), false);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(existsSync(join(root, ".codex")), false);
    const aliasedRoot = mkdtempSync(join(tmpdir(), "initial-host-alias-"));
    try {
      symlinkSync(outside, join(aliasedRoot, ".claude"), "dir");
      assert.throws(() => resolveInitialAnswersState(aliasedRoot, "host-managed"));
    } finally { rmSync(aliasedRoot, { recursive: true, force: true }); }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
