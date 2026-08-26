#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Acceptance coverage for the bootstrap source observation / origin-content
 * attestation: PX0-AC-09, PX0-AC-10, PX0-AC-11, PX0-AC-16 and PX0-AC-17 of
 * `specs/sprint-phoenix-epic/acceptance.md`. Every case name below cites the
 * criterion it pins.
 *
 * WHY THIS SUITE EXISTS AS A SEPARATE FILE. The five criteria are properties of
 * a chain, not of one module: the Codex host readback
 * (`./codex-host-plugin-list.mjs`), the closed runner-neutral contract
 * (`./ruleset-source.mjs`), the origin allowlist
 * (`./public-core-origin-allowlist.mjs`), the gate that combines them
 * (`./self-application-attestation-gate.mjs`) and the readiness decision that
 * consumes the gate (`../scripts/pipeline-start-preflight.mjs`). The per-module
 * suites pin each link; this one pins the acceptance-level properties that no
 * single module owns, and it is the coverage successor of the retired
 * `codex-host-plugin-list.test.mjs`, whose whole subject
 * (`observeCodexRulesetSource` and the ~270-line plugin-list-parsing /
 * `sourceClass`-computation machinery around it) is listed under "Explicitly not
 * revived" in design
 * `specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
 * §A.3.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED HERE (QG-05: a check states its blind
 * spots). `normalizeRulesetSource`'s loaded-vs-installed comparison is
 * TAUTOLOGICAL in the gate's self-referential calling pattern -- one observed
 * root supplies both operands, so it can never report a genuine
 * loaded-vs-installed mismatch there (design §A.4, PO-resolved: one observation,
 * no second host round-trip). The cases below therefore exercise that comparison
 * only where the two identities are supplied independently, as
 * `compareLoadedRulesetIdentity`'s remote comparison is, and never claim the
 * gate derives information from it beyond schema closure. What the gate's
 * guarantee actually rests on is the allowlisted origin plus the clean-tree /
 * host-path attestation inside `observeCodexPublicCoreIdentity` --
 * PX0-AC-16's cases are written against that, not against the tautology.
 *
 * No real `git` process and no real host binary is started anywhere in this
 * file: every observation, host readback and plugin list is injected.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { observeSelectedCodexPipelinePlugin } from "./codex-host-plugin-list.mjs";
import { PUBLIC_MARKETPLACE_URL, PUBLIC_SELF_APPLICATION_ORIGINS } from "./public-core-origin-allowlist.mjs";
import {
  RULESET_SOURCE_SCHEMA,
  compareLoadedRulesetIdentity,
  normalizeRulesetSource,
  validateRulesetSource,
} from "./ruleset-source.mjs";
import { evaluateSelfApplicationAttestation } from "./self-application-attestation-gate.mjs";
import { installedPipelineIdentity, observePipelineStartPreflight } from "../scripts/pipeline-start-preflight.mjs";

const VERSION = "0.5.4+acceptance.test";
const CONTENT_SHA = "d".repeat(64);
const SSH_ORIGIN = "git@github-public:agent-pipe-shared/agent-pipeline.git";
/** Synthetic, platform-neutral literals -- never a real host or home path. */
const HOST_PLUGIN_ROOT = "/opt/pipeline-fixture/plugins/pipeline-core";
const HOST_MARKETPLACE_ROOT = "/opt/pipeline-fixture";
const CODEX_BIN = "/opt/pipeline-fixture/bin/codex";

/** `<root>/plugins/pipeline-core`, with or without a `.git` entry at `<root>`. */
function fixtureRoot({ withGit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bootstrap-source-attestation-"));
  const pluginRoot = join(root, "plugins", "pipeline-core");
  mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
  if (withGit) mkdirSync(join(root, ".git"), { recursive: true });
  return {
    root,
    pluginRoot,
    scriptUrl: pathToFileURL(join(pluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    dispose() { rmSync(root, { recursive: true, force: true }); },
  };
}

/** The shape `observePublicCoreIdentity`/`observeCodexPublicCoreIdentity` return on success. */
function readyObservation({ repository = PUBLIC_MARKETPLACE_URL, contentSha256 = CONTENT_SHA, version = VERSION } = {}) {
  return {
    schema: "pipeline.public-core-observation.v1",
    status: "ready",
    candidate: { repository, branch: "main", commit: "a".repeat(40), tree: "b".repeat(40) },
    plugin: { name: "pipeline-core", version, manifestSha256: "c".repeat(64), contentSha256 },
  };
}

/** A valid, closed `pipeline.ruleset-source.v1` observation. */
function sourceObservation({ runner = "codex", sourceClass = "self-application", loaded, installed } = {}) {
  const identity = { status: "available", algorithm: "content-sha256", value: CONTENT_SHA };
  return {
    schema: RULESET_SOURCE_SCHEMA,
    runner,
    selectedPlugin: { id: "pipeline-core", version: VERSION },
    source: { class: sourceClass },
    loadedIdentity: loaded ?? identity,
    installedIdentity: installed ?? identity,
  };
}

/** One eligible entry of Codex's `plugin list --json` payload. */
function codexEntry({
  pluginId = "pipeline-core@agent-pipeline",
  version = VERSION,
  path = HOST_PLUGIN_ROOT,
  sourceType = "git",
  source = PUBLIC_MARKETPLACE_URL,
} = {}) {
  return {
    pluginId,
    name: "pipeline-core",
    marketplaceName: pluginId.slice("pipeline-core@".length),
    version,
    installed: true,
    enabled: true,
    source: { source: "local", path },
    marketplaceSource: { sourceType, source },
    installPolicy: "AVAILABLE",
    authPolicy: "ON_INSTALL",
  };
}

function codexHost(installed, { spawnCalls, realpathCalls } = {}) {
  return {
    resolveExecutable(name) {
      return name === "codex" ? { ok: true, path: CODEX_BIN } : { ok: false, status: "binary_missing" };
    },
    spawnSync(path, args, options) {
      spawnCalls?.push({ path, args, options });
      return { status: 0, signal: null, stdout: JSON.stringify({ installed, available: [] }), stderr: "" };
    },
    realpathSync(path) {
      realpathCalls?.push(path);
      return path;
    },
  };
}

/** Nothing a diagnostic renders may echo a private coordinate. */
function assertNoLeak(value, forbidden) {
  const serialized = JSON.stringify(value) ?? "";
  for (const secret of forbidden) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret} in ${serialized}`);
  }
}

// ---------------------------------------------------------------- PX0-AC-09

test("PX0-AC-09: a Codex-only consumer with no .claude/settings.json resolves its source from the native Codex registry", () => {
  const consumer = fixtureRoot();
  try {
    // Precondition, asserted rather than assumed: this consumer is Codex-only.
    assert.equal(existsSync(join(consumer.root, ".claude", "settings.json")), false);

    const spawnCalls = [];
    const realpathCalls = [];
    const selected = observeSelectedCodexPipelinePlugin(codexHost([codexEntry()], { spawnCalls, realpathCalls }));

    // Resolved -- not null, which is this function's only "unavailable" answer.
    assert.deepEqual(selected, { path: HOST_PLUGIN_ROOT, version: VERSION });
    // Resolved THROUGH the native registry: exactly one host readback, fixed
    // argv, closed environment. A fallback that read a Claude settings file
    // instead would have to change this assertion to pass.
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].path, CODEX_BIN);
    assert.deepEqual(spawnCalls[0].args, ["plugin", "list", "--json"]);
    assert.deepEqual(spawnCalls[0].options.env, {
      GIT_TERMINAL_PROMPT: "0", LANG: "C", LC_ALL: "C", NO_COLOR: "1",
    });
    assert.equal(spawnCalls[0].options.shell, false);
    // No filesystem lookup at all on the git-marketplace path.
    assert.deepEqual(realpathCalls, []);
  } finally {
    consumer.dispose();
  }
});

test("PX0-AC-09: an unavailable Codex registry fails closed to null instead of falling back to another source", () => {
  const selected = observeSelectedCodexPipelinePlugin({
    resolveExecutable: () => ({ ok: true, path: CODEX_BIN }),
    spawnSync: () => ({ status: 1, signal: null, stdout: "", stderr: "codex: no such command" }),
    realpathSync: (path) => path,
  });
  assert.equal(selected, null);
});

// ---------------------------------------------------------------- PX0-AC-10

test("PX0-AC-10: a pre-HEAD consumer repository is never consulted -- readiness compares the loaded plugin identity", () => {
  const plugin = fixtureRoot();
  const consumer = fixtureRoot({ withGit: false });
  try {
    // The consumer repository is pre-HEAD in the strongest sense: no git at all.
    assert.equal(existsSync(join(consumer.root, ".git")), false);

    const observeCalls = [];
    const result = observePipelineStartPreflight({
      env: {},
      cwd: consumer.root,
      scriptUrl: plugin.scriptUrl,
      read: () => JSON.stringify({ version: VERSION }),
      pluginList: () => JSON.stringify({ installed: [], available: [] }),
      observe: (input) => { observeCalls.push(input); return readyObservation(); },
    });

    assert.equal(result.status, "ready", "readiness required a consumer HEAD");
    // The identity that was compared is the LOADED PLUGIN's, twice -- the
    // consumer repository is not an operand of the attestation at all.
    assert.deepEqual(observeCalls, [{
      sourcePluginRoot: plugin.pluginRoot,
      installedPluginRoot: plugin.pluginRoot,
    }]);
  } finally {
    plugin.dispose();
    consumer.dispose();
  }
});

test("PX0-AC-10: a missing loaded or installed identity yields its own typed status, never an inferred equality", () => {
  const unavailable = { status: "unavailable" };
  assert.equal(normalizeRulesetSource(sourceObservation({ installed: unavailable })).status, "installed-identity-unavailable");
  assert.equal(normalizeRulesetSource(sourceObservation({ loaded: unavailable })).status, "loaded-identity-unavailable");
  assert.equal(normalizeRulesetSource(sourceObservation({ sourceClass: "unavailable" })).status, "source-unavailable");
  // Distinct statuses, and none of them is "ready".
  const statuses = [
    normalizeRulesetSource(sourceObservation({ installed: unavailable })).status,
    normalizeRulesetSource(sourceObservation({ loaded: unavailable })).status,
    normalizeRulesetSource(sourceObservation({ sourceClass: "unavailable" })).status,
    normalizeRulesetSource(sourceObservation()).status,
  ];
  assert.equal(new Set(statuses).size, 4);
  assert.equal(statuses[3], "ready");
});

// ---------------------------------------------------------------- PX0-AC-11

test("PX0-AC-11: Claude, Codex, self-application and local-development observations pass the same closed contract", () => {
  for (const runner of ["claude", "codex", "agy"]) {
    for (const sourceClass of ["self-application", "local-development", "marketplace-public", "marketplace-private"]) {
      const observation = sourceObservation({ runner, sourceClass });
      const validation = validateRulesetSource(observation);
      assert.deepEqual(validation, { valid: true, errors: [] }, `${runner}/${sourceClass}`);
      const normalized = normalizeRulesetSource(observation);
      assert.equal(normalized.status, "ready", `${runner}/${sourceClass}`);
      // The canonical public-safe projection is the SAME six closed keys for
      // every adapter -- no adapter gets to widen it.
      assert.deepEqual(Object.keys(normalized.observation).sort(), [
        "installedIdentity", "loadedIdentity", "runner", "schema", "selectedPlugin", "source",
      ], `${runner}/${sourceClass}`);
    }
  }
});

test("PX0-AC-11: the attestation gate routes every runner through that one contract, with one identical outcome", () => {
  const fixture = fixtureRoot();
  try {
    const results = ["claude", "codex"].map((runner) => evaluateSelfApplicationAttestation({
      pluginRoot: fixture.pluginRoot,
      runner,
      version: VERSION,
      observe: () => readyObservation(),
    }));
    assert.deepEqual(results[0], { attempted: true, failed: false });
    assert.deepEqual(results[0], results[1], "the two runners disagreed about the same observation");

    // And a shape the common contract rejects is rejected identically for both.
    const rejected = ["claude", "codex"].map((runner) => evaluateSelfApplicationAttestation({
      pluginRoot: fixture.pluginRoot,
      runner,
      // A version the closed contract's VERSION pattern refuses (whitespace).
      observe: () => readyObservation({ version: "0.5.4 rogue" }),
      version: VERSION,
    }));
    assert.deepEqual(rejected[0], { attempted: true, failed: true });
    assert.deepEqual(rejected[0], rejected[1]);
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------- PX0-AC-16

test("PX0-AC-16: only the two exact reviewed origins attest; every near miss is refused", () => {
  const fixture = fixtureRoot();
  try {
    for (const origin of [PUBLIC_MARKETPLACE_URL, SSH_ORIGIN]) {
      assert.equal(PUBLIC_SELF_APPLICATION_ORIGINS.has(origin), true, origin);
      assert.deepEqual(
        evaluateSelfApplicationAttestation({
          pluginRoot: fixture.pluginRoot, runner: "codex", version: VERSION,
          observe: () => readyObservation({ repository: origin }),
        }),
        { attempted: true, failed: false },
        origin,
      );
    }

    // Near misses: one character, one scheme, one host alias or one suffix away
    // from an allowlisted URL. Exact-string membership is the whole mechanism,
    // so anything weaker (prefix, substring, host-only) would admit these.
    const nearMisses = [
      "https://github.com/agent-pipe-shared/agent-pipeline",
      "https://github.com/agent-pipe-shared/agent-pipeline.git/",
      "https://github.com/agent-pipe-shared/agent-pipeline.git ",
      "http://github.com/agent-pipe-shared/agent-pipeline.git",
      "https://github.com/agent-pipe-shared/agent-pipeline-fork.git",
      "https://github.com.evil.invalid/agent-pipe-shared/agent-pipeline.git",
      "git@github.com:agent-pipe-shared/agent-pipeline.git",
      "git@github-public:agent-pipe-shared/agent-pipeline-fork.git",
      "git@github-public:agent-pipe-shared/agent-pipeline.git.evil",
    ];
    for (const origin of nearMisses) {
      assert.equal(PUBLIC_SELF_APPLICATION_ORIGINS.has(origin), false, origin);
      const result = evaluateSelfApplicationAttestation({
        pluginRoot: fixture.pluginRoot, runner: "codex", version: VERSION,
        observe: () => readyObservation({ repository: origin }),
      });
      assert.deepEqual(result, { attempted: true, failed: true }, origin);
      assertNoLeak(result, [origin]);
    }
  } finally {
    fixture.dispose();
  }
});

test("PX0-AC-16: a dirty or otherwise rejected working tree claims no equality, even at an allowlisted origin", () => {
  const fixture = fixtureRoot();
  try {
    for (const reason of ["SNT-A2-SOURCE-DIRTY", "SNT-A2-CONTENT-MISMATCH", "SNT-A2-CODEX-HOST-MISMATCH"]) {
      const result = evaluateSelfApplicationAttestation({
        pluginRoot: fixture.pluginRoot, runner: "codex", version: VERSION,
        // A rejected observation carries no `candidate`, so the allowlist has
        // nothing to match: the gate must not read the absent origin as clean.
        observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: [reason] }),
      });
      assert.deepEqual(result, { attempted: true, failed: true }, reason);
    }
  } finally {
    fixture.dispose();
  }
});

test("PX0-AC-16: an equality claim binds the exact loaded identity to the exact observed remote identity", () => {
  const available = (value, algorithm = "content-sha256") => ({ status: "available", algorithm, value });

  assert.equal(compareLoadedRulesetIdentity(sourceObservation(), available(CONTENT_SHA)).status, "equal");

  // One hex digit apart is not equal.
  const offByOne = `${"d".repeat(63)}e`;
  assert.equal(compareLoadedRulesetIdentity(sourceObservation(), available(offByOne)).status, "loaded-remote-mismatch");

  // Same 64-hex value, different algorithm, is not equal either: the claim is
  // bound to the algorithm as well as to the digest.
  assert.equal(
    compareLoadedRulesetIdentity(sourceObservation(), available(CONTENT_SHA, "git-sha256")).status,
    "loaded-remote-mismatch",
  );

  // No observed remote identity means no claim -- never an assumed match.
  const absent = compareLoadedRulesetIdentity(sourceObservation(), { status: "unavailable" });
  assert.equal(absent.status, "remote-identity-unavailable");
  assert.equal(absent.remoteIdentity, null);
});

// ---------------------------------------------------------------- PX0-AC-17

test("PX0-AC-17 (unknown keys): an adapter field outside the closed contract fails closed without echoing it", () => {
  const secret = "https://user:token@private.example.invalid/core.git";
  const cases = [
    ["observation-unknown-field", { ...sourceObservation(), privateRemote: secret }],
    ["selected-plugin-unknown-field", { ...sourceObservation(), selectedPlugin: { id: "pipeline-core", version: VERSION, cachePath: secret } }],
    ["source-unknown-field", { ...sourceObservation(), source: { class: "self-application", origin: secret } }],
    ["loaded-identity-unknown-field", { ...sourceObservation(), loadedIdentity: { status: "available", algorithm: "content-sha256", value: CONTENT_SHA, remote: secret } }],
  ];
  for (const [diagnostic, observation] of cases) {
    const result = normalizeRulesetSource(observation);
    assert.equal(result.status, "invalid-source-observation", diagnostic);
    assert.equal(result.observation, null, diagnostic);
    assert.ok(result.diagnostics.includes(diagnostic), `${diagnostic} missing from ${result.diagnostics.join(",")}`);
    assertNoLeak(result, [secret, "private.example.invalid", "token"]);
  }
});

test("PX0-AC-17 (unknown keys): a host record carrying an unexpected field is not accepted as a selection", () => {
  const secret = "/opt/pipeline-fixture/private/cache";
  const selected = observeSelectedCodexPipelinePlugin(codexHost([
    { ...codexEntry(), privateCache: secret },
  ]));
  assert.equal(selected, null);
});

test("PX0-AC-17 (ambiguous selector): a selector that does not exactly name the plugin's own root is refused", () => {
  // A local marketplace whose `source` is not precisely `dirname(dirname(path))`
  // names more than one possible tree; the host record is then ambiguous, not a
  // near-enough match to resolve.
  const ambiguous = observeSelectedCodexPipelinePlugin(codexHost([codexEntry({
    pluginId: "pipeline-core@agent-pipeline-local",
    sourceType: "local",
    source: "/opt/pipeline-fixture/elsewhere",
  })]));
  assert.equal(ambiguous, null);

  // A relative root is likewise no selector at all.
  const relative = observeSelectedCodexPipelinePlugin(codexHost([codexEntry({ path: "plugins/pipeline-core" })]));
  assert.equal(relative, null);

  // The exact local selector, by contrast, resolves -- so the case above fails
  // on ambiguity, not because every local marketplace is refused.
  const exact = observeSelectedCodexPipelinePlugin(codexHost([codexEntry({
    pluginId: "pipeline-core@agent-pipeline-local",
    sourceType: "local",
    source: HOST_MARKETPLACE_ROOT,
  })]));
  assert.deepEqual(exact, { path: HOST_PLUGIN_ROOT, version: VERSION });
});

test("PX0-AC-17 (more than one selected plugin): two enabled registrations fail closed on both runners", () => {
  // Two eligible entries of the SAME class (both official) -- a genuine registry
  // duplicate, never collapsed by the local-wins-over-official precedence rule
  // (NVA-PLUGIN-PRECEDENCE), which only ever resolves a MIXED official+attested-
  // local pair. This fixture stays ambiguous regardless of that rule.
  const both = [codexEntry(), codexEntry()];
  // The Codex host readback answers "no selection", never a preference.
  assert.equal(observeSelectedCodexPipelinePlugin(codexHost(both)), null);

  // The readiness path reports ambiguity as its own typed shape, on both runners.
  const codexIdentity = installedPipelineIdentity(() => JSON.stringify({ installed: both, available: [] }), "codex");
  assert.deepEqual(codexIdentity, { version: null, source: "unknown", ambiguous: true });
  const claudeIdentity = installedPipelineIdentity(
    () => JSON.stringify([
      { id: "pipeline-core@agent-pipeline", enabled: true, version: VERSION },
      { id: "pipeline-core@agent-pipeline-local", enabled: true, version: VERSION },
    ]),
    "claude",
    () => "{}",
  );
  assert.deepEqual(claudeIdentity, { version: null, source: "unknown", ambiguous: true });
});

test("PX0-AC-17 (more than one selected plugin): ambiguity blocks readiness, and stays distinct from absence", () => {
  const fixture = fixtureRoot({ withGit: false });
  try {
    const preflight = (installed) => observePipelineStartPreflight({
      env: {},
      cwd: fixture.root,
      scriptUrl: fixture.scriptUrl,
      read: () => JSON.stringify({ version: VERSION }),
      pluginList: () => JSON.stringify({ installed, available: [] }),
    });

    // Same-class duplicate (two official entries) -- see the comment on the
    // preceding PX0-AC-17 test for why the mixed official+attested-local pair
    // no longer represents ambiguity now that NVA-PLUGIN-PRECEDENCE resolves it.
    const ambiguous = preflight([codexEntry(), codexEntry()]);
    assert.equal(ambiguous.status, "plugin-refresh-required");
    assert.equal(ambiguous.installedVersion, null);
    // Soft, not a hard block: something to do, and a printable confirmation.
    assert.equal(ambiguous.nextAction.kind, "advisory");
    assert.equal(ambiguous.nextAction.mutation, false);

    // Absence is a different outcome from ambiguity -- the two are not conflated.
    const absent = preflight([]);
    assert.equal(absent.status, "ready");
    assert.equal(absent.installedVersion, null);
    assert.notEqual(absent.status, ambiguous.status);
  } finally {
    fixture.dispose();
  }
});
