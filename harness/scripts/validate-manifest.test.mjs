#!/usr/bin/env node
/**
 * validate-manifest.test.mjs -- standalone test suite for harness/scripts/validate-manifest.mjs
 * (CLI black-box cases, fixtures in a temp dir) and plugins/pipeline-core/lib/manifest.mjs
 * (direct-import unit cases for activePhases/loadManifestSafe/gateConfig).
 *
 * Canon: AP1-P2 "GLOIN" briefing. Same plain-assertion + "N/N cases passed." output
 * convention as plugins/pipeline-core/lib/yaml-lite.test.mjs /
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

import { loadManifest, loadManifestSafe, gateConfig, activePhases } from "../../plugins/pipeline-core/lib/manifest.mjs";

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

// =============================================================================================
// CLI black-box cases
// =============================================================================================

// ---- ABSENT -----------------------------------------------------------------------------------
checkCli("ABSENT  a nonexistent manifest path exits 0 with the opt-in message", join(SCRATCH, "does-not-exist.yaml"), 0, {
  stdoutIncludes: "Manifest not active (optional)",
});

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

// ---- Summary ------------------------------------------------------------------------------
rmSync(SCRATCH, { recursive: true, force: true });
rmSync(ROOT_ACTIVEPHASES_SUBSET, { recursive: true, force: true });
rmSync(ROOT_ACTIVEPHASES_NOPROFILE, { recursive: true, force: true });

const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
