#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * project-onboarding-v3-pre-push-hook-offer.test.mjs — NVA-GF-PREPUSH (backlog:
 * 2026-08-28-the-pre-push-hook-is-offered-not-installed-so-the-git-backstop-can-be-absent.md).
 *
 * Covers `buildPrePushHookOfferAction()` (scripts/project-onboarding-v3.mjs): a repository
 * whose manifest declares `gates.push: blocking` while the pre-push hook is absent (never
 * offered/answered, or declined) must be reported carrying `unbackedGate: true` and a human-
 * readable `gap` -- never merely a bare state string. A repository with no manifest, or a
 * non-blocking push gate, must report `unbackedGate: false` and carry no `gap` field at all.
 *
 * Run: node plugins/pipeline-core/scripts/project-onboarding-v3-pre-push-hook-offer.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPrePushHookOfferAction } from "./project-onboarding-v3.mjs";
import { applyDecline, applyInstall } from "./pre-push-hook-install.mjs";

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `po-v3-prepush-offer-${prefix}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  return dir;
}

// Same shape/idiom as pre-push-hook-install.test.mjs's own `writeManifest` -- writes the
// LEGACY_MANIFEST fallback path (.claude/pipeline.yaml), which `loadManifest` reads when the
// NEUTRAL_MANIFEST path (project/pipeline.yaml) does not exist.
function writeManifest(dir, { mode = "blocking" } = {}) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: ${mode}\n    type: human\n`);
}

// ---- hook never offered/answered ("ready"), manifest declares blocking -----------------

test("buildPrePushHookOfferAction: hook absent + gates.push blocking -> unbackedGate true, gap text present", () => {
  const dir = freshRepo("ready-blocking");
  writeManifest(dir, { mode: "blocking" });
  const action = buildPrePushHookOfferAction({ rootDir: dir });
  assert.equal(action.kind, "command");
  assert.equal(action.unbackedGate, true);
  assert.match(action.gap, /UNBACKED GATE/);
  assert.match(action.gap, /gates\.push: blocking/);
});

test("buildPrePushHookOfferAction: hook absent + no manifest at all -> unbackedGate false, no gap field", () => {
  const dir = freshRepo("ready-no-manifest");
  const action = buildPrePushHookOfferAction({ rootDir: dir });
  assert.equal(action.kind, "command");
  assert.equal(action.unbackedGate, false);
  assert.equal("gap" in action, false);
});

test("buildPrePushHookOfferAction: hook absent + gates.push warn (not blocking) -> unbackedGate false", () => {
  const dir = freshRepo("ready-warn");
  writeManifest(dir, { mode: "warn" });
  const action = buildPrePushHookOfferAction({ rootDir: dir });
  assert.equal(action.unbackedGate, false);
  assert.equal("gap" in action, false);
});

test("buildPrePushHookOfferAction: hook absent + gates.push off -> unbackedGate false", () => {
  const dir = freshRepo("ready-off");
  writeManifest(dir, { mode: "off" });
  const action = buildPrePushHookOfferAction({ rootDir: dir });
  assert.equal(action.unbackedGate, false);
});

// ---- hook declined, manifest declares blocking -------------------------------------------

test("buildPrePushHookOfferAction: declined + gates.push blocking -> reported as unbacked gate, not merely 'declined'", () => {
  const dir = freshRepo("declined-blocking");
  writeManifest(dir, { mode: "blocking" });
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const action = buildPrePushHookOfferAction({ rootDir: dir });
  assert.equal(action.kind, "info");
  assert.equal(action.status, "declined");
  assert.equal(action.unbackedGate, true);
  assert.match(action.gap, /UNBACKED GATE/);
});

test("buildPrePushHookOfferAction: declined + no manifest -> unbackedGate false, no gap field", () => {
  const dir = freshRepo("declined-no-manifest");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const action = buildPrePushHookOfferAction({ rootDir: dir });
  assert.equal(action.status, "declined");
  assert.equal(action.unbackedGate, false);
  assert.equal("gap" in action, false);
});

// ---- hook actually installed: nothing to report, whatever the manifest says --------------

test("buildPrePushHookOfferAction: hook installed + gates.push blocking -> null (backed, nothing to offer or flag)", () => {
  const dir = freshRepo("installed-blocking");
  writeManifest(dir, { mode: "blocking" });
  const install = applyInstall({ rootDir: dir });
  assert.equal(install.status, "installed");
  const action = buildPrePushHookOfferAction({ rootDir: dir });
  assert.equal(action, null);
});
