#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// The contract test for repair-map.mjs (REPAIRMAP-1, AC-1..AC-7): drives the
// REAL eligibility()/recordHumanGuardDenial()/isNeverLiftableKernelPath()/
// readPushApprovalMode() a second time, independently of repair-map.mjs's own
// internals, and asserts the map's claim about each row is what those real
// functions actually say right now -- never a hand-typed expectation.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildRepairMap,
  extractEligibilityCodes,
  PROBES,
  PLUGIN_ROOT,
} from "./repair-map.mjs";
import { humanGuardOverrideInternals, recordHumanGuardDenial } from "../lib/human-guard-override.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { isNeverLiftableKernelPath } from "../lib/guard-maintenance-window.mjs";

const { eligibility } = humanGuardOverrideInternals;
const ROOT = process.cwd();

// Codes the eligibility() source names that this file's fixed PROBES pool has
// NOT been empirically confirmed to reach. AC-4: a class added to
// eligibility() and not accounted for here (as either a covered row or a
// listed-and-accepted gap) fails this test.
const KNOWN_UNCOVERED_CODES = [
  "HGO-AUTHOR-ROOT-MISMATCH",
  "HGO-AUTHOR-SCOPE-MISMATCH",
  "HGO-NONOVERRIDABLE-CROSS-BOUNDARY",
].sort();

test("AC-4: eligibility() enumeration is exactly covered rows plus the documented, accepted gap", () => {
  const codes = extractEligibilityCodes(PLUGIN_ROOT);
  const map = buildRepairMap({ rootDir: ROOT });
  assert.deepEqual([...map.uncoveredEligibilityCodes].sort(), KNOWN_UNCOVERED_CODES,
    "a code was added to or removed from eligibility() without updating this test's accepted-gap list");
  for (const code of codes) {
    const covered = map.rows.some((row) => row.code === code);
    assert.ok(covered, `${code} has no row in the map at all (covered or unknown)`);
  }
});

test("AC-7 (contract): every eligibility()-derived row matches a fresh, independent live call", () => {
  const map = buildRepairMap({ rootDir: ROOT });
  for (const probe of PROBES) {
    const fresh = eligibility(ROOT, probe.toolName, probe.toolInput);
    const expectedCode = fresh.eligible ? "HGO-ELIGIBLE" : fresh.code;
    const row = map.rows.find((candidate) => candidate.code === expectedCode);
    assert.ok(row, `probe "${probe.label}" resolved to ${expectedCode}, which has no row`);
    if (fresh.eligible) {
      assert.equal(row.liftable, "in-session-or-signed");
      const freshMode = readPushApprovalMode(ROOT)?.mode ?? "signature";
      assert.equal(row.approvalMode, freshMode, "the row's approval mode must track the live reader, not a stored value");
      // NVA-SIGENTRY-2 F2: signature mode's sequence grew a 4th command
      // (emit-signature-digest, run before the human signs anything out-of-band); chat
      // mode has no signing step at all and stays at 3.
      const expectedLength = freshMode === "chat" ? 3 : 4;
      assert.ok(Array.isArray(row.command) && row.command.length === expectedLength,
        `expected ${expectedLength} commands for mode=${freshMode}, got ${row.command?.length}`);
      if (freshMode !== "chat") {
        assert.equal(row.command[2].argv[1], "emit-signature-digest",
          "signature mode's 3rd command must be the digest-emission step, between prepare-authorization and authorize-by-signature");
      }
    } else if (fresh.authorCandidate) {
      assert.equal(row.liftable, "author-repair-required");
      assert.equal(row.command, null);
    } else {
      const denials = [{ guard: "contract-test-probe", reason: "contract test probe" }];
      const routed = recordHumanGuardDenial({ rootDir: ROOT, pluginRoot: PLUGIN_ROOT, toolName: probe.toolName, toolInput: probe.toolInput, denials });
      const hasExecutableStep = Boolean(routed.nextAction?.action?.executable) && Array.isArray(routed.nextAction?.action?.argv);
      if (hasExecutableStep) {
        assert.ok(Array.isArray(row.command) && row.command.length === 1, `${expectedCode}: map claims no command but the real planner offers one`);
        assert.equal(row.command[0].executable, routed.nextAction.action.executable);
        assert.deepEqual(row.command[0].argv, routed.nextAction.action.argv.map(String));
      } else {
        assert.equal(row.command, null, `${expectedCode}: map claims a command but the real planner offers none`);
      }
    }
  }
});

test("AC-7 (contract): the two structural rows match a fresh drive of their real predicates", () => {
  const map = buildRepairMap({ rootDir: ROOT });
  const kernelRow = map.rows.find((row) => row.code === "GS-6-NEVER-LIFTABLE-KERNEL-PATH");
  const fresh = isNeverLiftableKernelPath(
    "plugins/pipeline-core/hooks/guard-gate-strength.mjs",
    { rootDir: ROOT, livePluginRoot: PLUGIN_ROOT },
  );
  assert.equal(fresh, true, "the representative kernel path fixture must actually be a kernel path");
  assert.ok(kernelRow.reason.includes("true"), "the row's reason must reflect the live predicate result it observed");
  const readyRow = map.rows.find((row) => row.code === "GUARD-LIFECYCLE-NOT-READY");
  assert.equal(readyRow.command, null);
  assert.equal(readyRow.liftable, "never");
  const lifecycle = { guard: "guard-lifecycle-ready.mjs", reason: "GUARD-LIFECYCLE-NOT-READY" };
  for (const denials of [[lifecycle], [{ guard: "guard-devplan.mjs", reason: "GUARD-DEVPLAN-NOT-READY" }, lifecycle]]) {
    const routed = recordHumanGuardDenial({
      rootDir: ROOT, pluginRoot: PLUGIN_ROOT, toolName: "Edit", toolInput: { file_path: "repair-map-lifecycle-probe.md" }, denials,
    });
    assert.equal(routed.status, "non-liftable-recovery-required");
    assert.equal(routed.code, "HGO-NONOVERRIDABLE-LIFECYCLE-NOT-READY");
  }
  assert.match(readyRow.reason, /non-liftable-recovery-required\/HGO-NONOVERRIDABLE-LIFECYCLE-NOT-READY/u);
});

test("AC-2/AC-3: the three never-selectable reasons are distinct, and none offers a command", () => {
  const map = buildRepairMap({ rootDir: ROOT });
  const neverOrAuthor = map.rows.filter((row) => row.liftable === "never" || row.liftable === "author-repair-required");
  const codes = neverOrAuthor.map((row) => row.code);
  assert.ok(codes.includes("GUARD-LIFECYCLE-NOT-READY"));
  assert.ok(codes.includes("GS-6-NEVER-LIFTABLE-KERNEL-PATH"));
  assert.ok(codes.includes("HGO-AUTHOR-ROOT-REQUIRED"));
  for (const row of neverOrAuthor) assert.equal(row.command, null, `${row.code} must not offer a command`);
  // The briefing's "three never-liftable reasons" are specifically these three named
  // codes; other HGO-NONOVERRIDABLE-* codes can legitimately share recoveryRoute()'s
  // generic "external-operator-required" wording (e.g. GRAMMAR and TOOL both fall
  // through to the same adapter-boundary default) without violating AC-2/AC-3, which is
  // about THIS trio being distinguishable from one another, not about every no-command
  // row in the map being unique.
  const trio = ["GUARD-LIFECYCLE-NOT-READY", "GS-6-NEVER-LIFTABLE-KERNEL-PATH", "HGO-AUTHOR-ROOT-REQUIRED"]
    .map((code) => map.rows.find((row) => row.code === code));
  const trioReasons = new Set(trio.map((row) => row.reason));
  assert.equal(trioReasons.size, 3, "the three named never-liftable/author-repair reasons must each have their own wording");
  const authorRow = map.rows.find((row) => row.code === "HGO-AUTHOR-ROOT-REQUIRED");
  assert.match(authorRow.reason, /author source root/u);
  assert.match(authorRow.reason, /human's behalf/u);
  assert.notEqual(authorRow.liftable, "never", "author-repair-required must be its own answer, not folded into never");
});

test("AC-5: buildRepairMap writes nothing under this repository's own HGO storage", () => {
  const requestsDir = join(ROOT, ".git", "agent-pipeline", "human-guard-overrides", "requests");
  const before = existsSync(requestsDir) ? readdirSync(requestsDir).length : null;
  buildRepairMap({ rootDir: ROOT });
  buildRepairMap({ rootDir: ROOT });
  const after = existsSync(requestsDir) ? readdirSync(requestsDir).length : null;
  assert.equal(after, before, "buildRepairMap must never create a new override request file");
});

test("AC-6: every rendered command is a runner-neutral, platform-neutral argv array", () => {
  const map = buildRepairMap({ rootDir: ROOT });
  // An argv token is one of exactly two things: a literal the operator pastes
  // unchanged, or a `<placeholder>` they are meant to fill in. Angle brackets
  // are therefore admitted ONLY as a whole-token placeholder -- `<repo-root>`
  // is fine, `foo>bar` is a redirect wearing a token's clothes. Anything else
  // in the metacharacter set is refused outright: this map is read while a
  // session is already refused, so a printed command that needs a shell to
  // interpret it is a command the reader cannot run.
  // Placeholders are written for a human to read, so they carry spaces and
  // underscores (`<fixed HGO_SIGNATURE_REASON text>`). What they may never
  // carry is a nested angle bracket, which is what would let a redirect hide
  // inside one.
  const placeholder = /^<[A-Za-z0-9][A-Za-z0-9 ._-]*>$/u;
  const shellMeta = /[;&|<>`$(){}*?!\\]/u;
  for (const row of map.rows) {
    if (row.command === null) continue;
    for (const step of row.command) {
      assert.equal(step.executable, process.execPath, `${row.code}: executable must be the live process.execPath, never a hardcoded "node"`);
      for (const token of step.argv) {
        if (placeholder.test(token)) continue;
        assert.equal(shellMeta.test(token), false, `${row.code}: argv token "${token}" carries shell metacharacters and is not a whole-token <placeholder>`);
      }
    }
  }
});

test("AC-8: the emitted map validates against its own schema's required/enum shape", () => {
  const schema = JSON.parse(readFileSync(join(PLUGIN_ROOT, "scripts", "repair-map.schema.json"), "utf8"));
  const map = buildRepairMap({ rootDir: ROOT });
  for (const key of schema.required) assert.ok(Object.hasOwn(map, key), `map is missing required key "${key}"`);
  const rowSchema = schema.properties.rows.items;
  for (const row of map.rows) {
    for (const key of rowSchema.required) assert.ok(Object.hasOwn(row, key), `row ${row.code} is missing required key "${key}"`);
    assert.ok(rowSchema.properties.liftable.enum.includes(row.liftable), `row ${row.code} has an unrecognized liftable value`);
    assert.ok(rowSchema.properties.by.enum.includes(row.by), `row ${row.code} has an unrecognized by value`);
  }
});
