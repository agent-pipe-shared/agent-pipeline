#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-onboarding-consent-lock.mjs — hook-level suite (PHX-WP-ONBOARDING-CONSENT-LOCK).
 *
 * Unit-level marker rules live in ../lib/onboarding-consent-marker.test.mjs.
 * These cases prove the hook around them, at the exact boundary Claude Code
 * invokes: reads the real tool-input shape for Edit/Write/NotebookEdit,
 * blocks while the marker is present and blocking, allows once the marker
 * is cleared by a genuine onboarding completion or an explicit override,
 * and fails open on anything it cannot parse.
 *
 * GOCL5/GOCL6 are the exact DoD regression scenario from the
 * PHX-WP-ONBOARDING-CONSENT-LOCK briefing: consent given + onboarding
 * incomplete + attempted Write/Edit -> refused; onboarding genuinely
 * completed -> the same Write/Edit succeeds.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { recordConsentGiven, clearConsentMarker } from "../lib/onboarding-consent-marker.mjs";

const GUARD = fileURLToPath(new URL("./guard-onboarding-consent-lock.mjs", import.meta.url));

let pass = 0;
const failures = [];
function run(payload, projectDir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}
function check(id, payload, projectDir, expectExit, { stderrIncludes } = {}) {
  const { code, stderr } = run(payload, projectDir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- ${stderr.trim().slice(0, 200)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  if (problems.length === 0) { pass += 1; console.log(`PASS  ${id}`); }
  else { failures.push(`${id}: ${problems.join("; ")}`); console.log(`FAIL  ${id} -- ${problems.join("; ")}`); }
}

const BLOCK = 2, ALLOW = 0;
const EDIT_PAYLOAD = { tool_name: "Edit", tool_input: { file_path: "src/game.mjs", old_string: "a", new_string: "b" } };
const WRITE_PAYLOAD = { tool_name: "Write", tool_input: { file_path: "src/new-file.mjs", content: "x" } };
const NOTEBOOK_PAYLOAD = { tool_name: "NotebookEdit", tool_input: { notebook_path: "notebooks/a.ipynb", new_source: "x" } };

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "guard-onboarding-consent-lock-test-"));
}

// GOCL1 -- no marker at all (the common case) -> allow.
{
  const root = freshRoot();
  try {
    check("GOCL1 allow  Edit with no consent marker present", EDIT_PAYLOAD, root, ALLOW);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// GOCL2 -- blocking marker present -> Edit refused, naming the guard and the marker path.
{
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    check("GOCL2 block  Edit while consent given and onboarding incomplete", EDIT_PAYLOAD, root, BLOCK, {
      stderrIncludes: ["CONSENT-GIVEN-ONBOARDING-INCOMPLETE", "guard-onboarding-consent-lock"],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// GOCL3 -- Write is covered too, not just Edit.
{
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    check("GOCL3 block  Write while consent given and onboarding incomplete", WRITE_PAYLOAD, root, BLOCK);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// GOCL4 -- NotebookEdit's notebook_path is read too (the exact gap the sibling guards
// document paying for once already, see lib/tool-write-target.mjs).
{
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    check("GOCL4 block  NotebookEdit reads notebook_path, not just file_path", NOTEBOOK_PAYLOAD, root, BLOCK);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// GOCL5/GOCL6 -- the exact DoD regression scenario.
{
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    check("GOCL5 block  consent given + onboarding incomplete + attempted Edit -> refused", EDIT_PAYLOAD, root, BLOCK);
    clearConsentMarker({ rootDir: root, reason: "onboarding-complete" }); // simulates the real project-onboarding-v3.mjs completion call site
    check("GOCL6 allow  onboarding genuinely completed -> the same Edit succeeds", EDIT_PAYLOAD, root, ALLOW);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// GOCL7 -- the explicit PO-confirmed override path also clears and unblocks.
{
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    check("GOCL7a block  before the override", EDIT_PAYLOAD, root, BLOCK);
    clearConsentMarker({ rootDir: root, reason: "po-explicit-override" });
    check("GOCL7b allow  after the explicit PO-confirmed override clears the marker", EDIT_PAYLOAD, root, ALLOW);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// GOCL8/GOCL9 -- fail-open. A guard that cannot read its input has no opinion.
{
  const root = freshRoot();
  try {
    recordConsentGiven({ rootDir: root });
    check("GOCL8 allow  a payload with no tool_input", { tool_name: "Edit" }, root, ALLOW);
    check("GOCL9 allow  a payload with no usable path", { tool_name: "Edit", tool_input: {} }, root, ALLOW);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(`\n${pass}/${pass + failures.length} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
