#!/usr/bin/env node
/**
 * validate-manifest.test.mjs -- standalone test suite for harness/scripts/validate-manifest.mjs
 * (CLI black-box cases, fixtures in a temp dir) and plugins/pipeline-core/lib/manifest.mjs
 * (direct-import unit cases for activePhases/loadManifestSafe/gateConfig).
 *
 * Same plain-assertion + "N/N cases passed." output convention as
 * plugins/pipeline-core/lib/yaml-lite.test.mjs /
 * plugins/pipeline-core/scripts/critic-bare.test.mjs (CLI-level spawnSync pattern
 * copied from critic-bare.test.mjs's runCli()/checkCli() helpers).
 *
 * Run:   node harness/scripts/validate-manifest.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadManifest,
  loadManifestSafe,
  gateConfig,
  activePhases,
  loadDeployPolicy,
  readDeviations,
  checkDeployPrecedence,
} from "../../plugins/pipeline-core/lib/manifest.mjs";
import { formatError, formatWarning } from "./validate-manifest.mjs";

const CLI_SCRIPT = fileURLToPath(new URL("./validate-manifest.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}

// ---- scratch dir for fixture files --------------------------------------------------------
const SCRATCH = mkdtempSync(join(tmpdir(), "validate-manifest-test-"));
function fixture(name, content) {
  const path = join(SCRATCH, name);
  writeFileSync(path, content);
  return path;
}

// ---- CLI-level black-box helper (spawnSync, mirrors critic-bare.test.mjs's runCli()) ------
function runCli(path) {
  const res = spawnSync(process.execPath, [CLI_SCRIPT, path], { encoding: "utf8" });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
function checkCli(id, path, expectExit, { stdoutIncludes, stderrIncludes } = {}) {
  const { code, stdout, stderr } = runCli(path);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stdout=${stdout} stderr=${stderr}`);
  for (const needle of [].concat(stdoutIncludes ?? [])) {
    if (!stdout.includes(needle)) problems.push(`stdout missing "${needle}" (got: ${stdout})`);
  }
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" (got: ${stderr})`);
  }
  record(id, problems.length === 0, problems.join("; "));
}

// ---- whole-rootDir fixture helper for release/deploy-policy cases -------------------------
// Build the WHOLE rootDir in a temp dir -- the manifest AND the central
// `<policies_path>/deploy-policy.yaml` (and optionally `docs/risks.md`) live INSIDE that same
// temp dir, so loadDeployPolicy/readDeviations discover ONLY the fixture, never this repo's
// own governance/examples/policies. Each scenario gets its OWN fresh temp dir (never the
// shared SCRATCH above) since different scenarios need different central-policy/deviation
// content.
function yaml(...lines) {
  return lines.join("\n") + "\n";
}
const DEPLOY_ROOTS = [];
// `nested: true` places the manifest at the CANONICAL `<root>/.claude/pipeline.yaml` path
// instead of the flat `<root>/pipeline.yaml` every pre-existing fixture used --
// governance/policies_path and docs/risks.md stay PROJECT-ROOT-relative either way, which is
// exactly the discovery contract resolveTarget must honor on the canonical layout.
function buildReleaseRoot({
  manifest,
  policy,
  policyIsDirectory = false,
  risks,
  policiesRelPath = "policies",
  nested = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "manifest-deploy-"));
  DEPLOY_ROOTS.push(root);
  const manifestPath = nested ? join(root, ".claude", "pipeline.yaml") : join(root, "pipeline.yaml");
  if (nested) mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(manifestPath, manifest);
  if (policyIsDirectory) {
    mkdirSync(join(root, policiesRelPath, "deploy-policy.yaml"), { recursive: true });
  } else if (policy !== undefined) {
    mkdirSync(join(root, policiesRelPath), { recursive: true });
    writeFileSync(join(root, policiesRelPath, "deploy-policy.yaml"), policy);
  }
  if (risks !== undefined) {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "risks.md"), risks);
  }
  return manifestPath;
}

// =============================================================================================
// CLI black-box cases
// =============================================================================================

// ---- ABSENT -----------------------------------------------------------------------------------
checkCli("ABSENT  a nonexistent manifest path exits 0 with the opt-in message", join(SCRATCH, "does-not-exist.yaml"), 0, {
  stdoutIncludes: "Manifest not active (optional)",
});

{
  const unreadablePath = join(SCRATCH, "manifest-is-a-directory.yaml");
  mkdirSync(unreadablePath);
  checkCli("UNREADABLE  a non-readable manifest shape exits 2 instead of throwing", unreadablePath, 2, {
    stderrIncludes: "readable manifest and validation schema",
  });
}

// ---- MINIMAL VALID ------------------------------------------------------------------------------
checkCli("MINIMAL VALID  just `schema:` is a complete, valid manifest", fixture("minimal.yaml", "schema: pipeline.manifest.v0\n"), 0, {
  stdoutIncludes: "Manifest valid",
});

// ---- FULL VALID (the shipped example + this repo's own committed manifest) --------------------
checkCli("FULL VALID  templates/pipeline.yaml.example parses and validates clean", join(REPO_ROOT, "templates", "pipeline.yaml.example"), 0, {
  stdoutIncludes: "Manifest valid",
});
checkCli("FULL VALID  this repo's own committed .claude/pipeline.yaml parses and validates clean", join(REPO_ROOT, ".claude", "pipeline.yaml"), 0, {
  stdoutIncludes: "Manifest valid",
});

// ---- MISSING REQUIRED FIELD ---------------------------------------------------------------------
checkCli(
  "MISSING REQUIRED  a manifest without the top-level `schema` key is rejected",
  fixture("missing-required.yaml", "phases:\n  - name: design\n    enabled: true\n"),
  2,
  { stderrIncludes: 'Field "schema": expected present (required field), got missing' },
);

// ---- WRONG TYPE -----------------------------------------------------------------------------------
checkCli(
  "WRONG TYPE  phases[].enabled must be boolean, a non-bool string is rejected and both types named",
  fixture("wrong-type.yaml", "schema: pipeline.manifest.v0\nphases:\n  - name: design\n    enabled: yes-please\n"),
  2,
  { stderrIncludes: 'Field "phases[0].enabled": expected type "boolean", got type "string"' },
);

// ---- ENUM VIOLATION (gate mode: blocking|warn|off) ---------------------------------------------------
checkCli(
  "ENUM gate mode  an out-of-enum gates.<name>.mode value is rejected and the allowed set is named",
  fixture("enum-mode.yaml", "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: onlyloosely\n    type: human\n"),
  2,
  { stderrIncludes: 'Field "gates.dev-plan.mode": expected one of the values [blocking, warn, off], got "onlyloosely"' },
);

// ---- ENUM ACCEPT (gate mode: warn, off) --------------------------------------------------------------
checkCli(
  "ENUM gate mode ACCEPT warn  mode: warn is a valid gate mode",
  fixture("mode-warn.yaml", "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: warn\n    type: human\n"),
  0,
  { stdoutIncludes: "Manifest valid" },
);
checkCli(
  "ENUM gate mode ACCEPT off  mode: off is a valid gate mode",
  fixture("mode-off.yaml", "schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: off\n    type: automated\n"),
  0,
  { stdoutIncludes: "Manifest valid" },
);

// ---- ENUM VIOLATION (gate type: human|automated) ----------------------------------------------------
checkCli(
  "ENUM gate type  an out-of-enum gates.<name>.type value is rejected (human|automated)",
  fixture("enum-type.yaml", "schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: blocking\n    type: robot\n"),
  2,
  { stderrIncludes: 'Field "gates.security.type": expected one of the values [human, automated], got "robot"' },
);

// ---- GATE exemptPaths ACCEPT (array of strings) --------------------------------------------------
checkCli(
  "GATE exemptPaths ACCEPT  a gate declaring exemptPaths as a list of path-prefix strings is valid",
  fixture(
    "gate-exemptpaths-valid.yaml",
    "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n    exemptPaths:\n      - scratch/\n      - tmp/\n",
  ),
  0,
  { stdoutIncludes: "Manifest valid" },
);

// ---- GATE exemptPaths REJECT (plain string instead of array) ------------------------------------
checkCli(
  "GATE exemptPaths REJECT string  exemptPaths as a plain string (not an array) is rejected",
  fixture(
    "gate-exemptpaths-string.yaml",
    "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n    exemptPaths: scratch/\n",
  ),
  2,
  { stderrIncludes: 'Field "gates.dev-plan.exemptPaths": expected type "array", got type "string"' },
);

// ---- GATE exemptPaths REJECT (array of numbers instead of strings) ------------------------------
checkCli(
  "GATE exemptPaths REJECT numbers  exemptPaths as an array of numbers (not strings) is rejected",
  fixture(
    "gate-exemptpaths-numbers.yaml",
    "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n    exemptPaths:\n      - 1\n      - 2\n",
  ),
  2,
  { stderrIncludes: 'Field "gates.dev-plan.exemptPaths[0]": expected type "string", got type "number"' },
);

// ---- UNKNOWN TOP-LEVEL KEY -----------------------------------------------------------------------
checkCli(
  "UNKNOWN TOP-LEVEL KEY  a stray unrecognized top-level key is rejected",
  fixture("unknown-key.yaml", "schema: pipeline.manifest.v0\nbogus: true\n"),
  2,
  { stderrIncludes: 'Field "bogus": expected a known manifest field, got unknown field' },
);

// ---- DANGLING profiles.active ------------------------------------------------------------------
checkCli(
  "DANGLING active  profiles.active naming an undeclared profile is rejected",
  fixture("dangling-active.yaml", "schema: pipeline.manifest.v0\nprofiles:\n  active: ghost\n  quick:\n    phases: []\n"),
  2,
  { stderrIncludes: 'Field "profiles.active": expected a declared profile (quick), got "ghost" (unknown)' },
);

// ---- PROFILE REFERENCING UNKNOWN PHASE ------------------------------------------------------------
checkCli(
  "UNKNOWN PHASE REF  a profile's phases[] entry naming an undeclared phase is rejected",
  fixture(
    "unknown-phase-ref.yaml",
    "schema: pipeline.manifest.v0\nphases:\n  - name: design\n    enabled: true\nprofiles:\n  active: quick\n  quick:\n    phases:\n      - nonexistent-phase\n",
  ),
  2,
  {
    stderrIncludes:
      'Field "profiles.quick.phases[0]": expected a phase name declared under phases[], got "nonexistent-phase" (unknown)',
  },
);

// ---- CONDITION GRAMMAR VIOLATION (malformed -- not even a valid <flag> identifier) ---------------------
// NOTE: a bare identifier like "maybe" IS syntactically a valid <flag> reference per the grammar (any
// identifier can name a flag) -- it only fails semantically if undeclared (see the separate "unknown
// flag" case below). A TRUE grammar violation needs a string that isn't a valid identifier at all, e.g.
// one containing a hyphen (identifiers here are `[A-Za-z_][A-Za-z0-9_]*`, no hyphen).
checkCli(
  "CONDITION grammar  a condition outside always|never|<flag>|!<flag> is rejected",
  fixture(
    "condition-grammar.yaml",
    "schema: pipeline.manifest.v0\nphases:\n  - name: ui-design\n    enabled: true\n    condition: not-a-valid-flag\n",
  ),
  2,
  {
    stderrIncludes:
      'Field "phases[0].condition": expected "always", "never", "<flag>" or "!<flag>", got "not-a-valid-flag"',
  },
);

// ---- CONDITION GRAMMAR VIOLATION (unknown flag reference) ---------------------------------------------
checkCli(
  "CONDITION unknown flag  a condition naming a flag not declared under `flags` is rejected",
  fixture(
    "condition-unknown-flag.yaml",
    "schema: pipeline.manifest.v0\nphases:\n  - name: ui-design\n    enabled: true\n    condition: has_ui\nflags: {}\n",
  ),
  2,
  {
    stderrIncludes: 'Field "phases[0].condition": expected a flag declared under flags, got "has_ui" (unknown)',
  },
);

// ---- YAML SYNTAX ERROR (English wrapper, line number, yaml-lite reason passed through) ------------------
checkCli(
  "YAML syntax error  a yaml-lite rejection (anchor) surfaces as an English 'YAML error line N' line",
  fixture("yaml-syntax-error.yaml", "schema: &anchor pipeline.manifest.v0\n"),
  2,
  { stderrIncludes: ["YAML error line 1:", "anchor"] },
);

// ---- DUPLICATE PHASE NAME -----------------------------------------------------------------------
checkCli(
  "DUPLICATE phase name  two phases[] entries with the same name are rejected",
  fixture(
    "duplicate-phase.yaml",
    "schema: pipeline.manifest.v0\nphases:\n  - name: design\n    enabled: true\n  - name: design\n    enabled: true\n",
  ),
  2,
  {
    stderrIncludes: 'Field "phases[1].name": expected a phase name unique within the manifest, got "design" (duplicate of phases[0])',
  },
);

// =============================================================================================
// Release/Promotion phase: `release` schema + deploy-policy precedence engine
// =============================================================================================
// AC-1 regression: an existing manifest WITHOUT a `release` section validates exactly as
// before -- already covered above by the two FULL VALID cases (the shipped example and this
// repo's own manifest, neither of which declares `release`) and by every other pre-existing
// case in this file: none of them regressed after the additive change (confirmed by this
// whole suite staying green).

// ---- AC-2: malformed release fields -> a NAMED schema-lite error --------------------------
checkCli(
  "RELEASE unknown key at release level",
  fixture("release-unknown-key.yaml", "schema: pipeline.manifest.v0\nrelease:\n  bogus: true\n"),
  2,
  { stderrIncludes: 'Field "release.bogus": expected a known manifest field, got unknown field' },
);

checkCli(
  "RELEASE unknown key at environments.<ENV> level",
  fixture(
    "release-unknown-env-key.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "      bogus: true",
      "  adapters:",
      "    a1:",
      "      executor: ci",
      "      credentials: oidc",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.environments.test.bogus": expected a known manifest field, got unknown field' },
);

checkCli(
  "RELEASE unknown key at adapters.<NAME> level",
  fixture(
    "release-unknown-adapter-key.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    a1:",
      "      executor: ci",
      "      credentials: oidc",
      "      bogus: true",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.adapters.a1.bogus": expected a known manifest field, got unknown field' },
);

checkCli(
  "RELEASE executor enum violation",
  fixture(
    "release-executor-enum.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    a1:",
      "      executor: robot",
      "      credentials: oidc",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.adapters.a1.executor": expected one of the values [ci, local], got "robot"' },
);

checkCli(
  "RELEASE credentials enum violation (SEC-08 / AC-10 -- no inline secret representable)",
  fixture(
    "release-credentials-enum.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    a1:",
      "      executor: ci",
      "      credentials: plaintext-password",
    ),
  ),
  2,
  {
    stderrIncludes:
      'Field "release.adapters.a1.credentials": expected one of the values [oidc, ci-secret, external], got "plaintext-password"',
  },
);

checkCli(
  // A typo'd-key case at EVERY object level -- this is the 4th level
  // (release.adapters.<NAME>.trigger), which also has additionalProperties:false in the
  // schema but had no test asserting it.
  "RELEASE unknown key at adapters.<NAME>.trigger level (4th object level)",
  fixture(
    "release-unknown-trigger-key.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    a1:",
      "      executor: ci",
      "      trigger:",
      "        refs:",
      "          - refs/tags/v*",
      "        bogus: true",
      "      credentials: oidc",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.adapters.a1.trigger.bogus": expected a known manifest field, got unknown field' },
);

checkCli(
  "RELEASE promotion enum violation",
  fixture(
    "release-promotion-enum.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "      promotion: auto-approve",
      "  adapters:",
      "    a1:",
      "      executor: ci",
      "      credentials: oidc",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.environments.test.promotion": expected one of the values [human-gate], got "auto-approve"' },
);

checkCli(
  "RELEASE missing rollback (mandatory per environment)",
  fixture(
    "release-missing-rollback.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "  adapters:",
      "    a1:",
      "      executor: ci",
      "      credentials: oidc",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.environments.test.rollback": expected present (required field), got missing' },
);

checkCli(
  "RELEASE trigger wrong type",
  fixture(
    "release-trigger-type.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: a1",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    a1:",
      "      executor: ci",
      "      trigger: not-an-object",
      "      credentials: oidc",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.adapters.a1.trigger": expected type "object", got type "string"' },
);

// ---- checkReleaseIntegrity: adapter reference + local/ci executor coherence ----------------
checkCli(
  "RELEASE INTEGRITY undeclared adapter reference",
  fixture(
    "release-integrity-undeclared-adapter.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: ghost-adapter",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    real-adapter:",
      "      executor: ci",
      "      credentials: oidc",
    ),
  ),
  2,
  {
    stderrIncludes:
      'Field "release.environments.test.adapter": expected a declared adapter, got \'ghost-adapter\' (not declared)',
  },
);

checkCli(
  "RELEASE INTEGRITY executor:local carrying a trigger",
  fixture(
    "release-integrity-local-trigger.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: local-adapter",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    local-adapter:",
      "      executor: local",
      "      command: deploy.sh",
      "      trigger:",
      "        refs:",
      "          - refs/tags/v*",
      "      credentials: ci-secret",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.adapters.local-adapter.trigger": expected no trigger (executor: local), got present' },
);

checkCli(
  "RELEASE INTEGRITY executor:local without command",
  fixture(
    "release-integrity-local-no-command.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    test:",
      "      adapter: local-adapter",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "  adapters:",
      "    local-adapter:",
      "      executor: local",
      "      credentials: ci-secret",
    ),
  ),
  2,
  { stderrIncludes: 'Field "release.adapters.local-adapter.command": expected present (executor: local), got missing' },
);

checkCli(
  "RELEASE INTEGRITY executor:ci human-gated env without trigger.refs -> WARNING, exit 0",
  fixture(
    "release-integrity-ci-warning.yaml",
    yaml(
      "schema: pipeline.manifest.v0",
      "release:",
      "  environments:",
      "    prod:",
      "      adapter: ci-adapter",
      "      healthcheck: check.sh",
      "      rollback: rollback.sh",
      "      promotion: human-gate",
      "  adapters:",
      "    ci-adapter:",
      "      executor: ci",
      "      credentials: oidc",
    ),
  ),
  0,
  {
    stdoutIncludes: "Manifest valid",
    stderrIncludes:
      "Warning: Adapter 'ci-adapter' (executor: ci) for a human-gated environment has no trigger.refs -- not deploy-triggerable",
  },
);

// ---- D1 (AC-7): a declared-but-malformed/unreadable central policy -> WARNING, exit 0 -----
{
  const MANIFEST_WITH_RELEASE = yaml(
    "schema: pipeline.manifest.v0",
    "release:",
    "  environments:",
    "    prod:",
    "      adapter: a1",
    "      healthcheck: check.sh",
    "      rollback: rollback.sh",
    "  adapters:",
    "    a1:",
    "      executor: ci",
    "      credentials: oidc",
    "governance:",
    "  policies_path: policies",
  );

  checkCli(
    "D1 malformed central policy (bad YAML)  WARNING, exit 0, verify stays green",
    buildReleaseRoot({ manifest: MANIFEST_WITH_RELEASE, policy: "schema: &anchor pipeline.deploy-policy.v0\nmode: strict\n" }),
    0,
    {
      stdoutIncludes: "Manifest valid",
      stderrIncludes: [
        "Warning: central deploy-policy present but unreadable/invalid:",
        "deploy-triggering pushes are fail-closed by the guard until fixed",
      ],
    },
  );

  checkCli(
    "D1 unreadable central policy (a directory sits where the file is expected)  WARNING, exit 0",
    buildReleaseRoot({ manifest: MANIFEST_WITH_RELEASE, policyIsDirectory: true }),
    0,
    {
      stdoutIncludes: "Manifest valid",
      stderrIncludes: [
        "Warning: central deploy-policy present but unreadable/invalid:",
        "deploy-triggering pushes are fail-closed by the guard until fixed",
      ],
    },
  );

  checkCli(
    "D1 schema-invalid central policy (e.g. bad mode enum)  WARNING, exit 0",
    buildReleaseRoot({ manifest: MANIFEST_WITH_RELEASE, policy: "schema: pipeline.deploy-policy.v0\nmode: whenever\n" }),
    0,
    {
      stdoutIncludes: "Manifest valid",
      stderrIncludes: [
        "Warning: central deploy-policy present but unreadable/invalid:",
        "deploy-triggering pushes are fail-closed by the guard until fixed",
      ],
    },
  );
}

// ---- D2 (AC-8): `targets` is a HARD allowlist over EVERY declared env ---------------------
{
  const POLICY_TARGETS_STRICT = yaml("schema: pipeline.deploy-policy.v0", "mode: strict", "targets:", "  - production-eu");

  checkCli(
    "D2 PASS  a matching target satisfies a central targets allowlist",
    buildReleaseRoot({
      policy: POLICY_TARGETS_STRICT,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    prod:",
        "      adapter: a1",
        "      target: production-eu",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );

  checkCli(
    "D2 VIOLATION  a present target not in the central allowlist (exact worked-example CLI line)",
    buildReleaseRoot({
      policy: POLICY_TARGETS_STRICT,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    prod-eu:",
        "      adapter: a1",
        "      target: staging-eu",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    2,
    { stderrIncludes: "Environment 'prod-eu' target 'staging-eu' not in central targets allowlist" },
  );

  checkCli(
    "D2 VIOLATION  a MISSING target under a central targets allowlist is itself a violation (bypass case, exact worked-example CLI line)",
    buildReleaseRoot({
      policy: POLICY_TARGETS_STRICT,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    prod-eu:",
        "      adapter: a1",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    2,
    { stderrIncludes: "Environment 'prod-eu' declares no target under a central targets allowlist" },
  );

  checkCli(
    "D2 NO VIOLATION (anti-bloat)  no central targets allowlist, an env without target is fine",
    buildReleaseRoot({
      policy: yaml("schema: pipeline.deploy-policy.v0", "mode: strict"),
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    test:",
        "      adapter: a1",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );
}

// ---- D3 (AC-9): gate-type floor, field-based prod-intent definition -----------------------
{
  const POLICY_TYPEFLOOR_WITH_TARGETS = yaml(
    "schema: pipeline.deploy-policy.v0",
    "mode: strict",
    "targets:",
    "  - production-eu",
    "gates:",
    "  promote_prod:",
    "    type_floor: human",
  );

  checkCli(
    "D3 VIOLATION primary  a prod-intent env (target in targets) without promotion:human-gate (exact worked-example CLI line)",
    buildReleaseRoot({
      policy: POLICY_TYPEFLOOR_WITH_TARGETS,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    prod:",
        "      adapter: a1",
        "      target: production-eu",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    2,
    { stderrIncludes: "Environment 'prod' (deploys to central target 'production-eu') under central gate-type floor 'human'" },
  );

  checkCli(
    "D3 PASS primary  the same prod-intent env WITH promotion:human-gate satisfies the floor",
    buildReleaseRoot({
      policy: POLICY_TYPEFLOOR_WITH_TARGETS,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    prod:",
        "      adapter: a1",
        "      target: production-eu",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "      promotion: human-gate",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );

  const POLICY_TYPEFLOOR_NO_TARGETS = yaml(
    "schema: pipeline.deploy-policy.v0",
    "mode: strict",
    "gates:",
    "  promote_prod:",
    "    type_floor: human",
  );

  checkCli(
    "D3 VIOLATION fallback  no central targets, zero human-gate envs (exact worked-example CLI line)",
    buildReleaseRoot({
      policy: POLICY_TYPEFLOOR_NO_TARGETS,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    test:",
        "      adapter: a1",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    2,
    {
      stderrIncludes:
        "release config declares no human-gated promote environment, central floor requires gate type 'human'",
    },
  );

  checkCli(
    "D3 PASS fallback  no central targets, >=1 human-gate env satisfies the floor",
    buildReleaseRoot({
      policy: POLICY_TYPEFLOOR_NO_TARGETS,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    prod:",
        "      adapter: a1",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "      promotion: human-gate",
        "  adapters:",
        "    a1:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );
}

// ---- adapters ⊆ -----------------------------------------------------------------------------
{
  const POLICY_ADAPTERS_ALLOWLIST = yaml("schema: pipeline.deploy-policy.v0", "mode: strict", "adapters:", "  - vercel-prod");

  checkCli(
    "ADAPTERS VIOLATION  a project adapter name outside the central allowlist",
    buildReleaseRoot({
      policy: POLICY_ADAPTERS_ALLOWLIST,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    test:",
        "      adapter: other-adapter",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    other-adapter:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    2,
    { stderrIncludes: "Adapter 'other-adapter' not in central adapters allowlist" },
  );

  checkCli(
    "ADAPTERS PASS  a project adapter name inside the central allowlist",
    buildReleaseRoot({
      policy: POLICY_ADAPTERS_ALLOWLIST,
      manifest: yaml(
        "schema: pipeline.manifest.v0",
        "release:",
        "  environments:",
        "    test:",
        "      adapter: vercel-prod",
        "      healthcheck: check.sh",
        "      rollback: rollback.sh",
        "  adapters:",
        "    vercel-prod:",
        "      executor: ci",
        "      credentials: oidc",
        "governance:",
        "  policies_path: policies",
      ),
    }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );
}

// ---- Mode application (AC-3/4/5): advisory / mandate (+/- deviation) / strict --------------
{
  const VIOLATING_MANIFEST = yaml(
    "schema: pipeline.manifest.v0",
    "release:",
    "  environments:",
    "    prod-eu:",
    "      adapter: a1",
    "      target: staging-eu",
    "      healthcheck: check.sh",
    "      rollback: rollback.sh",
    "  adapters:",
    "    a1:",
    "      executor: ci",
    "      credentials: oidc",
    "governance:",
    "  policies_path: policies",
  );
  const TARGETS_VIOLATION_LINE = "Environment 'prod-eu' target 'staging-eu' not in central targets allowlist";
  const POLICY_TARGETS = (mode) => yaml("schema: pipeline.deploy-policy.v0", `mode: ${mode}`, "targets:", "  - production-eu");

  checkCli(
    "MODE advisory  a violation becomes a warning, never blocks (exit 0)",
    buildReleaseRoot({ policy: POLICY_TARGETS("advisory"), manifest: VIOLATING_MANIFEST }),
    0,
    { stdoutIncludes: "Manifest valid", stderrIncludes: `Warning: ${TARGETS_VIOLATION_LINE}` },
  );

  checkCli(
    "MODE mandate WITHOUT a covering deviation  blocks (exit 2, exact worked-example CLI line, no Warning: prefix)",
    buildReleaseRoot({ policy: POLICY_TARGETS("mandate"), manifest: VIOLATING_MANIFEST }),
    2,
    { stderrIncludes: TARGETS_VIOLATION_LINE },
  );

  const RISKS_CATEGORY_DEVIATION = yaml(
    "# Deviations",
    "",
    "```yaml",
    "id: DEV-CAT-001",
    "policy-rule: targets",
    "deviation: prod-eu temporarily deploys to staging-eu region",
    "justification: regional failover test",
    "owner: release-po",
    "expires: 2099-01-01",
    "approved-by: release-po",
    "```",
    "",
  );

  checkCli(
    "MODE mandate WITH a valid policy-rule CATEGORY deviation  the violation is dropped (exit 0)",
    buildReleaseRoot({ policy: POLICY_TARGETS("mandate"), manifest: VIOLATING_MANIFEST, risks: RISKS_CATEGORY_DEVIATION }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );

  const RISKS_INSTANCE_DEVIATION = yaml(
    "# Deviations",
    "",
    "```yaml",
    "id: DEV-INST-001",
    "policy-rule: targets:prod-eu",
    "deviation: prod-eu temporarily deploys to staging-eu region",
    "justification: regional failover test",
    "owner: release-po",
    "expires: 2099-01-01",
    "approved-by: release-po",
    "```",
    "",
  );

  checkCli(
    "MODE mandate WITH a valid <rule>:<subject> INSTANCE deviation  the violation is dropped (exit 0)",
    buildReleaseRoot({ policy: POLICY_TARGETS("mandate"), manifest: VIOLATING_MANIFEST, risks: RISKS_INSTANCE_DEVIATION }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );

  checkCli(
    "MODE strict  blocks regardless of a present (otherwise-valid) deviation record",
    buildReleaseRoot({ policy: POLICY_TARGETS("strict"), manifest: VIOLATING_MANIFEST, risks: RISKS_CATEGORY_DEVIATION }),
    2,
    { stderrIncludes: TARGETS_VIOLATION_LINE },
  );
}

// ---- FIX 1: governance discovery on the CANONICAL -------------------------------------------
// `.claude/`-nested manifest layout. Every case above puts the manifest at the temp root's
// TOP LEVEL (`<root>/pipeline.yaml`), which is exactly the gap that masked this bug:
// `resolveTarget` used to return `rootDir = dirname(manifestPath)`, which for the CANONICAL
// `<root>/.claude/pipeline.yaml` layout yields `rootDir = <root>/.claude` -- one directory
// too deep -- so `governance.policies_path` and `docs/risks.md` (both project-root-relative)
// were looked up at `<root>/.claude/governance/...` and NEVER FOUND through the CLI, silently
// disarming central-policy enforcement on the standard layout while the hook callers (which
// pass the true project root) stayed correctly enforced -- a split-brain.
{
  const NESTED_POLICIES_RELPATH = join("governance", "policies");
  const NESTED_MANIFEST_VIOLATING = yaml(
    "schema: pipeline.manifest.v0",
    "release:",
    "  environments:",
    "    prod-eu:",
    "      adapter: a1",
    "      target: staging-eu",
    "      healthcheck: check.sh",
    "      rollback: rollback.sh",
    "  adapters:",
    "    a1:",
    "      executor: ci",
    "      credentials: oidc",
    "governance:",
    "  policies_path: governance/policies",
  );
  const NESTED_TARGETS_VIOLATION_LINE = "Environment 'prod-eu' target 'staging-eu' not in central targets allowlist";

  checkCli(
    "FIX1 CANONICAL NESTED LAYOUT  strict-mode targets violation IS discovered when the manifest lives at <root>/.claude/pipeline.yaml (exit 2, exact worked-example line)",
    buildReleaseRoot({
      nested: true,
      policiesRelPath: NESTED_POLICIES_RELPATH,
      policy: yaml("schema: pipeline.deploy-policy.v0", "mode: strict", "targets:", "  - production-eu"),
      manifest: NESTED_MANIFEST_VIOLATING,
    }),
    2,
    { stderrIncludes: NESTED_TARGETS_VIOLATION_LINE },
  );

  checkCli(
    "FIX1 CANONICAL NESTED LAYOUT  mandate-mode violation WITHOUT a covering deviation blocks (exit 2) on the SAME nested layout",
    buildReleaseRoot({
      nested: true,
      policiesRelPath: NESTED_POLICIES_RELPATH,
      policy: yaml("schema: pipeline.deploy-policy.v0", "mode: mandate", "targets:", "  - production-eu"),
      manifest: NESTED_MANIFEST_VIOLATING,
    }),
    2,
    { stderrIncludes: NESTED_TARGETS_VIOLATION_LINE },
  );

  const NESTED_DEVIATION = yaml(
    "# Deviations",
    "",
    "```yaml",
    "id: DEV-NESTED-001",
    "policy-rule: targets",
    "deviation: prod-eu temporarily deploys to staging-eu region",
    "justification: regional failover test",
    "owner: release-po",
    "expires: 2099-01-01",
    "approved-by: release-po",
    "```",
    "",
  );

  checkCli(
    "FIX1 CANONICAL NESTED LAYOUT  a docs/risks.md deviation (also project-root-relative) is discovered and drops the mandate violation (exit 0)",
    buildReleaseRoot({
      nested: true,
      policiesRelPath: NESTED_POLICIES_RELPATH,
      policy: yaml("schema: pipeline.deploy-policy.v0", "mode: mandate", "targets:", "  - production-eu"),
      manifest: NESTED_MANIFEST_VIOLATING,
      risks: NESTED_DEVIATION,
    }),
    0,
    { stdoutIncludes: "Manifest valid" },
  );
}

// =============================================================================================
// Direct-import unit cases: activePhases, loadManifestSafe, gateConfig
// =============================================================================================

const ROOT_ACTIVEPHASES_SUBSET = mkdtempSync(join(tmpdir(), "manifest-activephases-subset-"));
mkdirSync(join(ROOT_ACTIVEPHASES_SUBSET, ".claude"), { recursive: true });
writeFileSync(
  join(ROOT_ACTIVEPHASES_SUBSET, ".claude", "pipeline.yaml"),
  [
    "schema: pipeline.manifest.v0",
    "phases:",
    "  - name: design",
    "    enabled: true",
    "  - name: implementation",
    "    enabled: true",
    "  - name: ui-design",
    "    enabled: true",
    "    condition: has_ui",
    "profiles:",
    "  active: quick",
    "  quick:",
    "    phases:",
    "      - implementation",
    "flags:",
    "  has_ui: true",
    "",
  ].join("\n"),
);
{
  const { manifest } = loadManifest(ROOT_ACTIVEPHASES_SUBSET);
  const active = activePhases(manifest);
  record(
    "activePhases PROFILE SUBSET  the active profile's phases[] list restricts the result even though ui-design's condition would otherwise pass",
    JSON.stringify(active) === JSON.stringify(["implementation"]),
    `got ${JSON.stringify(active)}`,
  );
}

const ROOT_ACTIVEPHASES_NOPROFILE = mkdtempSync(join(tmpdir(), "manifest-activephases-noprofile-"));
mkdirSync(join(ROOT_ACTIVEPHASES_NOPROFILE, ".claude"), { recursive: true });
writeFileSync(
  join(ROOT_ACTIVEPHASES_NOPROFILE, ".claude", "pipeline.yaml"),
  [
    "schema: pipeline.manifest.v0",
    "phases:",
    "  - name: design",
    "    enabled: true",
    "  - name: implementation",
    "    enabled: false",
    "  - name: ui-design",
    "    enabled: true",
    "    condition: has_ui",
    "flags:",
    "  has_ui: true",
    "",
  ].join("\n"),
);
{
  const { manifest } = loadManifest(ROOT_ACTIVEPHASES_NOPROFILE);
  const active = activePhases(manifest);
  record(
    "activePhases ENABLED:FALSE SKIP  no `profiles` section means no subset restriction, but enabled:false still excludes a phase",
    JSON.stringify(active) === JSON.stringify(["design", "ui-design"]),
    `got ${JSON.stringify(active)}`,
  );
}
{
  // Same manifest, has_ui flipped false -> ui-design's condition now excludes it too.
  const manifestFalse = JSON.parse(JSON.stringify(loadManifest(ROOT_ACTIVEPHASES_NOPROFILE).manifest));
  manifestFalse.flags.has_ui = false;
  const active = activePhases(manifestFalse);
  record(
    "activePhases CONDITION has_ui=false  a phase gated on a false flag is excluded",
    JSON.stringify(active) === JSON.stringify(["design"]),
    `got ${JSON.stringify(active)}`,
  );
}
{
  const manifestTrue = loadManifest(ROOT_ACTIVEPHASES_NOPROFILE).manifest;
  const active = activePhases(manifestTrue);
  record(
    "activePhases CONDITION has_ui=true  a phase gated on a true flag is included",
    active.includes("ui-design"),
    `got ${JSON.stringify(active)}`,
  );
}

// ---- loadManifestSafe: invalid -> null, no throw; valid -> the manifest; absent -> null --------
{
  const invalidRoot = mkdtempSync(join(tmpdir(), "manifest-safe-invalid-"));
  mkdirSync(join(invalidRoot, ".claude"), { recursive: true });
  writeFileSync(join(invalidRoot, ".claude", "pipeline.yaml"), "schema: &anchor pipeline.manifest.v0\n");
  let threw = false;
  let result;
  try {
    result = loadManifestSafe(invalidRoot);
  } catch {
    threw = true;
  }
  record("loadManifestSafe INVALID  a syntactically broken manifest returns null and never throws", !threw && result === null, `threw=${threw} result=${JSON.stringify(result)}`);
  rmSync(invalidRoot, { recursive: true, force: true });
}
{
  const validRoot = mkdtempSync(join(tmpdir(), "manifest-safe-valid-"));
  mkdirSync(join(validRoot, ".claude"), { recursive: true });
  writeFileSync(join(validRoot, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  const result = loadManifestSafe(validRoot);
  record("loadManifestSafe VALID  a valid manifest returns the parsed manifest object", result && result.schema === "pipeline.manifest.v0", `result=${JSON.stringify(result)}`);
  rmSync(validRoot, { recursive: true, force: true });
}
{
  const absentRoot = mkdtempSync(join(tmpdir(), "manifest-safe-absent-"));
  const result = loadManifestSafe(absentRoot);
  record("loadManifestSafe ABSENT  no manifest file at all returns null", result === null, `result=${JSON.stringify(result)}`);
  rmSync(absentRoot, { recursive: true, force: true });
}

// ---- loadManifest ABSENT WARNINGS -----------------------------------------------------------
// The absent-manifest return gains a `warnings: []` array like every other status, so a
// caller can uniformly read `result.warnings` regardless of `status`.
{
  const absentRoot = mkdtempSync(join(tmpdir(), "manifest-loadmanifest-absent-warnings-"));
  const result = loadManifest(absentRoot);
  record(
    "loadManifest ABSENT WARNINGS  an absent manifest returns warnings: [] alongside status:absent",
    result.status === "absent" && Array.isArray(result.warnings) && result.warnings.length === 0,
    `got ${JSON.stringify(result)}`,
  );
  rmSync(absentRoot, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), "manifest-total-read-error-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, ".claude", "pipeline.yaml"));
  let result;
  let threw = false;
  try {
    result = loadManifest(root);
  } catch {
    threw = true;
  }
  record(
    "loadManifest TOTAL  manifest read failures become structured invalid results",
    !threw && result?.status === "invalid" && result.errors?.[0]?.path === "manifest",
    `threw=${threw} result=${JSON.stringify(result)}`,
  );
  rmSync(root, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), "manifest-total-schema-error-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  const schemaPath = join(root, "schema-is-a-directory");
  mkdirSync(schemaPath);
  let result;
  let threw = false;
  try {
    result = loadManifest(root, { schemaPath });
  } catch {
    threw = true;
  }
  record(
    "loadManifest TOTAL  schema read failures become structured invalid results",
    !threw && result?.status === "invalid" && result.errors?.[0]?.path === "manifest",
    `threw=${threw} result=${JSON.stringify(result)}`,
  );
  rmSync(root, { recursive: true, force: true });
}

// ---- gateConfig ---------------------------------------------------------------------------------
{
  const { manifest } = loadManifest(join(REPO_ROOT));
  const push = gateConfig(manifest, "push");
  record(
    "gateConfig KNOWN  gateConfig(manifest, \"push\") returns this repo's committed push-gate config",
    push && push.mode === "blocking" && push.type === "human" && push.approval === "standing-approved",
    `push=${JSON.stringify(push)}`,
  );
  const missing = gateConfig(manifest, "does-not-exist");
  record("gateConfig UNKNOWN  gateConfig(manifest, \"does-not-exist\") returns null", missing === null, `missing=${JSON.stringify(missing)}`);
}

// ---- loadDeployPolicy -- direct-import, totality across all four outcomes ------------------
{
  const root = mkdtempSync(join(tmpdir(), "manifest-loaddeploypolicy-absent-"));
  const result = loadDeployPolicy(root, { governance: { policies_path: "policies" } });
  record("loadDeployPolicy ABSENT  no deploy-policy.yaml at the discovered path returns status:absent", result.status === "absent", `got ${JSON.stringify(result)}`);
  rmSync(root, { recursive: true, force: true });
}
{
  const root = mkdtempSync(join(tmpdir(), "manifest-loaddeploypolicy-nogovernance-"));
  const resultNoGovernance = loadDeployPolicy(root, { schema: "pipeline.manifest.v0" });
  const resultNoManifest = loadDeployPolicy(root, null);
  record(
    "loadDeployPolicy NO GOVERNANCE SECTION  an absent governance/policies_path returns status:absent, never throws",
    resultNoGovernance.status === "absent" && resultNoManifest.status === "absent",
    `got ${JSON.stringify(resultNoGovernance)} / ${JSON.stringify(resultNoManifest)}`,
  );
  rmSync(root, { recursive: true, force: true });
}
{
  const root = mkdtempSync(join(tmpdir(), "manifest-loaddeploypolicy-dir-"));
  mkdirSync(join(root, "policies", "deploy-policy.yaml"), { recursive: true });
  let threw = false;
  let result;
  try {
    result = loadDeployPolicy(root, { governance: { policies_path: "policies" } });
  } catch {
    threw = true;
  }
  record(
    "loadDeployPolicy UNREADABLE (a directory sits where the file is expected)  never throws, returns status:malformed",
    !threw && result.status === "malformed",
    `threw=${threw} got=${JSON.stringify(result)}`,
  );
  rmSync(root, { recursive: true, force: true });
}
{
  const root = mkdtempSync(join(tmpdir(), "manifest-loaddeploypolicy-badyaml-"));
  mkdirSync(join(root, "policies"), { recursive: true });
  writeFileSync(join(root, "policies", "deploy-policy.yaml"), "schema: &anchor pipeline.deploy-policy.v0\nmode: strict\n");
  let threw = false;
  let result;
  try {
    result = loadDeployPolicy(root, { governance: { policies_path: "policies" } });
  } catch {
    threw = true;
  }
  record(
    "loadDeployPolicy BAD YAML  a syntactically broken deploy-policy.yaml never throws, returns status:malformed",
    !threw && result.status === "malformed",
    `threw=${threw} got=${JSON.stringify(result)}`,
  );
  rmSync(root, { recursive: true, force: true });
}
{
  const root = mkdtempSync(join(tmpdir(), "manifest-loaddeploypolicy-ok-"));
  mkdirSync(join(root, "policies"), { recursive: true });
  writeFileSync(join(root, "policies", "deploy-policy.yaml"), "schema: pipeline.deploy-policy.v0\nmode: strict\n");
  const result = loadDeployPolicy(root, { governance: { policies_path: "policies" } });
  record(
    "loadDeployPolicy OK  a valid deploy-policy.yaml parses clean",
    result.status === "ok" && result.policy && result.policy.mode === "strict",
    `got ${JSON.stringify(result)}`,
  );
  rmSync(root, { recursive: true, force: true });
}

// ---- readDeviations -- direct-import with an INJECTED deterministic clock -----------------
{
  const root = mkdtempSync(join(tmpdir(), "manifest-deviations-absent-"));
  const deviations = readDeviations(root, new Date());
  record(
    "readDeviations ABSENT  no docs/risks.md at all returns []",
    Array.isArray(deviations) && deviations.length === 0,
    `got ${JSON.stringify(deviations)}`,
  );
  rmSync(root, { recursive: true, force: true });
}
{
  const root = mkdtempSync(join(tmpdir(), "manifest-deviations-validity-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  const risksContent = yaml(
    "# Risks",
    "",
    "```yaml",
    "id: DEV-100",
    "policy-rule: targets",
    "deviation: missing owner field",
    "justification: test",
    "expires: 2099-01-01",
    "approved-by: release-po",
    "```",
    "",
    "```yaml",
    "id: DEV-101",
    "policy-rule: targets",
    "deviation: expired record",
    "justification: test",
    "owner: release-po",
    "expires: 2000-01-01",
    "approved-by: release-po",
    "```",
    "",
    "```yaml",
    "id: &anchor DEV-102",
    "policy-rule: targets",
    "```",
    "",
    "```yaml",
    "id: DEV-103",
    "policy-rule: targets",
    "deviation: valid record",
    "justification: test",
    "owner: release-po",
    "expires: 2099-01-01",
    "approved-by: release-po",
    "```",
    "",
  );
  writeFileSync(join(root, "docs", "risks.md"), risksContent);
  const INJECTED_NOW = new Date("2026-07-11T00:00:00Z");
  const deviations = readDeviations(root, INJECTED_NOW);
  record(
    "readDeviations AC-6  missing-field, expired, and malformed-fenced-block records are all treated as absent -- only the valid record survives",
    deviations.length === 1 && deviations[0].id === "DEV-103",
    `got ${JSON.stringify(deviations)}`,
  );
  rmSync(root, { recursive: true, force: true });
}

// ---- checkDeployPrecedence (AC-11 + AC-15) -- pure function, direct-import ----------------
{
  const result = checkDeployPrecedence(
    { environments: { prod: { adapter: "a1", target: "x", healthcheck: "c", rollback: "r" } } },
    { status: "malformed", detail: "bad yaml" },
    [],
    new Date(),
  );
  record(
    "checkDeployPrecedence AC-11 MALFORMED POLICY  never throws, returns a warning, touches no filesystem",
    result.errors.length === 0 &&
      result.warnings.length === 1 &&
      typeof result.warnings[0] === "string" &&
      result.warnings[0].includes("bad yaml"),
    `got ${JSON.stringify(result)}`,
  );
}
{
  const result = checkDeployPrecedence(
    { environments: { prod: { adapter: "a1", healthcheck: "c", rollback: "r" } } },
    { status: "absent" },
    [],
    new Date(),
  );
  record(
    "checkDeployPrecedence NO CENTRAL POLICY  status:absent is a clean no-op (the project decides)",
    result.errors.length === 0 && result.warnings.length === 0,
    `got ${JSON.stringify(result)}`,
  );
}
{
  const mandateHumanFloorNoTargets = {
    status: "ok",
    policy: { schema: "pipeline.deploy-policy.v0", mode: "mandate", gates: { promote_prod: { type_floor: "human" } } },
  };
  const resultNullRelease = checkDeployPrecedence(null, mandateHumanFloorNoTargets, [], new Date());
  const resultEmptyEnvironments = checkDeployPrecedence({ environments: {} }, mandateHumanFloorNoTargets, [], new Date());
  const resultNoEnvironmentsKey = checkDeployPrecedence({ adapters: {} }, mandateHumanFloorNoTargets, [], new Date());
  record(
    "checkDeployPrecedence AC-15 NO-RELEASE NO-OP  a null projectRelease returns {errors:[],warnings:[]} even under a mandate/type_floor:human policy",
    resultNullRelease.errors.length === 0 && resultNullRelease.warnings.length === 0,
    `got ${JSON.stringify(resultNullRelease)}`,
  );
  record(
    "checkDeployPrecedence AC-15 EMPTY-ENVIRONMENTS NO-OP  a zero-key environments object is likewise a clean no-op",
    resultEmptyEnvironments.errors.length === 0 && resultEmptyEnvironments.warnings.length === 0,
    `got ${JSON.stringify(resultEmptyEnvironments)}`,
  );
  record(
    "checkDeployPrecedence AC-15 ABSENT-ENVIRONMENTS-KEY NO-OP  environments key entirely absent is likewise a clean no-op",
    resultNoEnvironmentsKey.errors.length === 0 && resultNoEnvironmentsKey.warnings.length === 0,
    `got ${JSON.stringify(resultNoEnvironmentsKey)}`,
  );
}

{
  // An unrecognized policy.mode must never silently drop violations. Hand-built
  // policyResult -- no `advisory`/`mandate`/`strict` branch applies.
  const policyResult = {
    status: "ok",
    policy: { schema: "pipeline.deploy-policy.v0", mode: "bogus", targets: ["production-eu"] },
  };
  const projectRelease = {
    environments: { "prod-eu": { adapter: "a1", target: "staging-eu", healthcheck: "c", rollback: "r" } },
  };
  const result = checkDeployPrecedence(projectRelease, policyResult, [], new Date());
  record(
    "checkDeployPrecedence FIX4 UNKNOWN MODE  an unrecognized policy.mode is treated as the strictest -- the violation becomes an error, never silently dropped",
    result.errors.length === 1 && result.errors[0].rule === "targets" && result.warnings.length === 0,
    `got ${JSON.stringify(result)}`,
  );
}

// ---- formatError / formatWarning (CLI render contract) -- exact worked examples -----------
{
  const msg = "Environment 'prod-eu' target 'staging-eu' not in central targets allowlist";
  const rendered = formatError({ rule: "targets", subject: "prod-eu", message: msg });
  record(
    "formatError MESSAGE-FIRST BRANCH  a deploy-precedence violation object renders its .message verbatim, no Field/expected/got wrapping",
    rendered === msg,
    `got ${JSON.stringify(rendered)}`,
  );
}
{
  const msg = "Environment 'prod-eu' declares no target under a central targets allowlist";
  const rendered = formatError({ rule: "targets", subject: "prod-eu", message: msg });
  record("formatError MESSAGE-FIRST BRANCH  missing-target worked example", rendered === msg, `got ${JSON.stringify(rendered)}`);
}
{
  const rendered = formatWarning({
    rule: "targets",
    subject: "prod-eu",
    message: "Environment 'prod-eu' target 'staging-eu' not in central targets allowlist",
  });
  const expected = "Warning: Environment 'prod-eu' target 'staging-eu' not in central targets allowlist";
  record(
    "formatWarning OBJECT BRANCH  an advisory-mode violation object renders as 'Warning: <message>'",
    rendered === expected,
    `got ${JSON.stringify(rendered)}`,
  );
}
{
  const input = "central deploy-policy present but unreadable/invalid: bad yaml; deploy-triggering pushes are fail-closed by the guard until fixed";
  const rendered = formatWarning(input);
  record(
    "formatWarning STRING BRANCH  a plain-string warning (D1 / WIP ci-adapter) renders as 'Warning: <string>'",
    rendered === `Warning: ${input}`,
    `got ${JSON.stringify(rendered)}`,
  );
}

// ---- Summary ------------------------------------------------------------------------------
rmSync(SCRATCH, { recursive: true, force: true });
rmSync(ROOT_ACTIVEPHASES_SUBSET, { recursive: true, force: true });
rmSync(ROOT_ACTIVEPHASES_NOPROFILE, { recursive: true, force: true });
for (const root of DEPLOY_ROOTS) rmSync(root, { recursive: true, force: true });

const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
