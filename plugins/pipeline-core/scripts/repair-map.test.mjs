#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// The contract test for repair-map.mjs (REPAIRMAP-1, AC-1..AC-7): drives the
// REAL eligibility()/previewHumanGuardRecovery()/isNeverLiftableKernelPath()/
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
import { humanGuardOverrideInternals, previewHumanGuardRecovery, recordHumanGuardDenial } from "../lib/human-guard-override.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { isNeverLiftableKernelPath } from "../lib/guard-maintenance-window.mjs";

const { eligibility } = humanGuardOverrideInternals;
const ROOT = process.cwd();

// Codes the eligibility() source names that this file's fixed PROBES pool has
// NOT been empirically confirmed to reach. AC-4: a class added to
// eligibility() and not accounted for here (as either a covered row or a
// listed-and-accepted gap) fails this test.
const KNOWN_UNCOVERED_CODES = [];

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
    const fresh = eligibility(ROOT, probe.toolName, probe.toolInput, probe.eligibilityOptions);
    const expectedCode = fresh.eligible ? "HGO-ELIGIBLE" : fresh.code;
    const row = map.rows.find((candidate) => candidate.code === expectedCode);
    assert.ok(row, `probe "${probe.label}" resolved to ${expectedCode}, which has no row`);
    if (fresh.eligible) {
      assert.equal(row.liftable, "in-session-or-signed");
      const freshMode = readPushApprovalMode(ROOT)?.mode ?? "signature";
      assert.equal(row.approvalMode, freshMode, "the row's approval mode must track the live reader, not a stored value");
      // Slice A2 (PO decision 2026-10-27): signature mode is plan, prepare-for-signature,
      // authorize-by-signature (the former emit-signature-digest step and the proof placeholder are gone;
      // equivalent assertion on the new sequence); chat mode has no signing step and stays at 3.
      const expectedLength = 3;
      assert.ok(Array.isArray(row.command) && row.command.length === expectedLength,
        `expected ${expectedLength} commands for mode=${freshMode}, got ${row.command?.length}`);
      if (freshMode !== "chat") {
        assert.equal(row.command[1].argv[1], "prepare-for-signature",
          "signature mode's 2nd command must be prepare-for-signature, followed by authorize-by-signature");
        assert.equal(row.command[2].argv[1], "authorize-by-signature");
        assert.ok(!JSON.stringify(row.command).includes("<external-proof.json>"), "no proof placeholder in signature-mode map rows");
      }
    } else if (fresh.authorCandidate) {
      assert.equal(row.liftable, "author-repair-required");
      assert.equal(row.command, null);
    } else {
      const routed = previewHumanGuardRecovery({ rootDir: ROOT, pluginRoot: PLUGIN_ROOT, toolName: probe.toolName, toolInput: probe.toolInput, eligibilityOptions: probe.eligibilityOptions });
      assert.ok(routed, `${expectedCode}: the pure recovery preview must be available`);
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
  const lifecycle = { guard: "guard-lifecycle-ready.mjs", reason: "GUARD-LIFECYCLE-NOT-READY" };
  for (const denials of [[lifecycle], [{ guard: "guard-devplan.mjs", reason: "GUARD-DEVPLAN-NOT-READY" }, lifecycle]]) {
    const routed = recordHumanGuardDenial({
      rootDir: ROOT, pluginRoot: PLUGIN_ROOT, toolName: "Edit", toolInput: { file_path: "repair-map-lifecycle-probe.md" }, denials,
    });
    assert.equal(routed.status, "non-liftable-recovery-required");
    assert.equal(routed.code, "HGO-NONOVERRIDABLE-LIFECYCLE-NOT-READY");
  }
  assert.match(readyRow.reason, /non-liftable-recovery-required\/HGO-NONOVERRIDABLE-LIFECYCLE-NOT-READY/u);
  assert.equal(readyRow.liftable, "narrower-recovery");
  assert.equal(readyRow.by, "this-session-agent");
  assert.equal(readyRow.command.length, 1);
  assert.deepEqual(readyRow.command[0].argv.slice(1), ["plan-repair", "--root", ROOT]);
  assert.match(readyRow.reason, /returned action/u);
});

test("AC-2/AC-3: kernel and author boundaries remain distinct while lifecycle names its narrow repair", () => {
  const map = buildRepairMap({ rootDir: ROOT });
  const neverOrAuthor = map.rows.filter((row) => row.liftable === "never" || row.liftable === "author-repair-required");
  const codes = neverOrAuthor.map((row) => row.code);
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

test("AC-9: CAC-REGISTRATION-INVALID names the registration writer, and that code is really emitted by the reader", () => {
  const map = buildRepairMap({ rootDir: ROOT });
  const row = map.rows.find((candidate) => candidate.code === "CAC-REGISTRATION-INVALID");
  assert.ok(row, "the accepted-contract registration refusal must have a row");
  assert.equal(row.liftable, "narrower-recovery");
  assert.equal(row.by, "this-session-agent");
  assert.equal(row.command.length, 1);
  assert.equal(row.command[0].executable, process.execPath);
  const [script, ...rest] = row.command[0].argv;
  assert.deepEqual(rest, ["--root", ROOT]);
  assert.ok(script.endsWith("register-feature-package.mjs") && existsSync(script), "the named writer must be a shipped script");
  assert.match(row.reason, /commit the manifest/iu);
  assert.match(row.reason, /binding afterwards/u);
  const reader = readFileSync(join(PLUGIN_ROOT, "scripts", "pipeline-state.mjs"), "utf8");
  assert.ok(reader.includes('code:"CAC-REGISTRATION-INVALID"'), "the code must still be emitted by readAcceptedDeliveryContract");
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

// C30G-D3 (AC-108, fresh bounded attempt): a refusal after a plugin reload names the ONE recovery, spelled as the repair
// script spells it. The proofs of the registry and the hook renderer live here because this is the test file of the
// refusal-teaching surface that this dispatch may edit; the production code is in lib/session-authority-registry.mjs
// and lib/hook-currentness.mjs.
const D3_ROOT = "/work/<root>";
const D3_HEAL_OR_RELEASE = /\bheal\b|\brelease-lock\b|\bmove-aside\b/u;

test("C30G-D3 A: SDC-AUTHORITY-CAS windows-native-identity-drift names heal in the script's own spelling, with when it applies", async () => {
  const { sessionAuthorityRefusalRepair } = await import("../lib/session-authority-registry.mjs");
  const { sessionAuthorityRepairCommand } = await import("./session-authority-repair.mjs");
  assert.equal(typeof sessionAuthorityRefusalRepair, "function");
  const text = sessionAuthorityRefusalRepair("SDC-AUTHORITY-CAS", "windows-native-identity-drift", D3_ROOT);
  assert.equal(typeof text, "string");
  assert.ok(text.includes(sessionAuthorityRepairCommand(D3_ROOT, "heal")), "heal is spelled as sessionAuthorityRepairCommand spells it");
  assert.ok(text.includes(sessionAuthorityRepairCommand(D3_ROOT, "inspect")), "the read-only inspect is the fallback");
  assert.match(text, /no Goldfish/u, "the precondition is stated");
  assert.doesNotMatch(text, /release-lock|move-aside/u, "a repair this reason does not need is not named");
});

test("C30G-D3 A: a catalogue another plugin version wrote (SDC-AUTHORITY-UNAVAILABLE catalogue-source-closure, the reload case) names heal, which the repair script's own inspect also treats as healable", async () => {
  const { sessionAuthorityRefusalRepair } = await import("../lib/session-authority-registry.mjs");
  const { sessionAuthorityRepairCommand } = await import("./session-authority-repair.mjs");
  const text = sessionAuthorityRefusalRepair("SDC-AUTHORITY-UNAVAILABLE", "catalogue-source-closure", D3_ROOT);
  assert.equal(typeof text, "string");
  assert.ok(text.includes(sessionAuthorityRepairCommand(D3_ROOT, "heal")));
  assert.match(text, /no Goldfish/u);
  const repair = readFileSync(join(PLUGIN_ROOT, "scripts", "session-authority-repair.mjs"), "utf8");
  assert.match(repair, /reason === "catalogue-source-closure" \|\| drifted/u, "inspect lists this reason among the ones heal clears");
  assert.equal(sessionAuthorityRefusalRepair("SDC-AUTHORITY-UNAVAILABLE", "producer-record-bound", D3_ROOT), null, "another UNAVAILABLE reason keeps no repair");
});

test("C30G-D3 A: SDC-AUTHORITY-HELD names move-aside only for a registry left without its catalogue, and inspect (never heal or release) for every other reason", async () => {
  const { sessionAuthorityRefusalRepair } = await import("../lib/session-authority-registry.mjs");
  const { sessionAuthorityRepairCommand } = await import("./session-authority-repair.mjs");
  for (const reason of ["legacy-partial-registry", "legacy-retained-registry"]) {
    const text = sessionAuthorityRefusalRepair("SDC-AUTHORITY-HELD", reason, D3_ROOT);
    assert.ok(text.includes(`${sessionAuthorityRepairCommand(D3_ROOT, "move-aside")} --no-goldfish-running --reason "<why>"`), reason);
    assert.ok(text.includes(sessionAuthorityRepairCommand(D3_ROOT, "inspect")), reason);
    assert.doesNotMatch(text, /\bheal\b|release-lock/u, `${reason}: heal does not repair a registry without a catalogue`);
  }
  for (const reason of ["retired-terminal-entry-only", "domain-transition-foreign-or-lost-mutable-owner", "terminal-not-observed", "legacy-full-catalogue-missing"]) {
    const text = sessionAuthorityRefusalRepair("SDC-AUTHORITY-HELD", reason, D3_ROOT);
    assert.equal(typeof text, "string", reason);
    assert.ok(text.includes(sessionAuthorityRepairCommand(D3_ROOT, "inspect")), reason);
    assert.doesNotMatch(text.replace(sessionAuthorityRepairCommand(D3_ROOT, "inspect"), ""), D3_HEAL_OR_RELEASE, `${reason}: only inspect is named`);
  }
});

test("C30G-D3 A: a reason this table does not know and every other code get no invented repair; an unknown root is a placeholder, never a guess", async () => {
  const { sessionAuthorityRefusalRepair } = await import("../lib/session-authority-registry.mjs");
  assert.equal(typeof sessionAuthorityRefusalRepair, "function");
  assert.equal(sessionAuthorityRefusalRepair("SDC-AUTHORITY-CAS", "producer-source-binding", D3_ROOT), null, "an integrity fault is not healed away");
  assert.equal(sessionAuthorityRefusalRepair("SDC-AUTHORITY-UNAVAILABLE", "invalid-digest", D3_ROOT), null);
  assert.equal(sessionAuthorityRefusalRepair("SDC-LOCK-HELD", "registry-lock-held", D3_ROOT), null, "the lock refusal keeps its own, richer repair");
  assert.match(sessionAuthorityRefusalRepair("SDC-AUTHORITY-CAS", "windows-native-identity-drift", undefined), /--root <repository root>/u);
});

test("C30G-D3 A: the registry's fail helper routes through the repair table and never overwrites a repair already set", () => {
  const source = readFileSync(join(PLUGIN_ROOT, "lib", "session-authority-registry.mjs"), "utf8");
  const failLine = source.split("\n").find((line) => line.startsWith("const fail="));
  assert.ok(failLine, "the shared failure helper exists");
  assert.match(failLine, /sessionAuthorityRefusalRepair\(code,reason,/u);
  assert.match(failLine, /error\.code=code;error\.reason=reason;/u, "code and reason are unchanged: other code matches on them");
});

test("C30G-D3 A: HOOK-SNAPSHOT-STALE names the one refresh command in refresh-mandatory-hooks.mjs's own spelling and says what happens next", async () => {
  const { renderSnapshotStaleCheck } = await import("../lib/hook-currentness.mjs");
  const rendered = renderSnapshotStaleCheck({ sourcePluginLibDir: join(PLUGIN_ROOT, "lib"), installerName: "commit-msg-hook-install.mjs", rootDir: D3_ROOT });
  const command = JSON.parse(rendered.match(/const SNAPSHOT_REFRESH_COMMAND = (".*");/u)[1]);
  assert.equal(command, `node "${join(PLUGIN_ROOT, "scripts", "refresh-mandatory-hooks.mjs")}" --root "${D3_ROOT}"`);
  const script = readFileSync(join(PLUGIN_ROOT, "scripts", "refresh-mandatory-hooks.mjs"), "utf8");
  assert.ok(script.includes("usage: refresh-mandatory-hooks.mjs --root <repo>"), "the command is spelled as the script's usage prints it");
  assert.match(rendered, /HOOK-SNAPSHOT-STALE: [^\n]*then repeat the refused command/u, "the refusal says what to do once the refresh ran");
});
