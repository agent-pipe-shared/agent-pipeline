#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-v2.test.mjs — CYB-2F regression suite for `guard-push.mjs`'s v2
 * policy-complete verdict consult (`checkSecurityEvidenceV2`).
 *
 * SIBLING FILE, NOT AN EDIT TO `guard-push.test.mjs` (CYB-2F briefing Field 2/DoD 6
 * explicitly offers this as the choice, "extend guard-push.test.mjs or add a sibling
 * file — your choice, justify"): `guard-push.test.mjs` is itself a technically
 * protected test path (`.claude/guard-config.json` `protectedTestPaths` rule TP-5,
 * enforced by `guard-testpath.mjs`'s Edit/Write PreToolUse guard, with no override
 * mechanism available to an implementing agent — see that hook's own header comment,
 * "escape hatch: the PO edits ... directly, outside this session"). Adding a NEW file
 * exercises the exact same real `guard-push.mjs` binary end-to-end (same `spawnSync`
 * technique, same hermetic-fixture philosophy) without touching the protected file at
 * all. Run: node plugins/pipeline-core/hooks/guard-push-v2.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * KNOWN OPEN ITEM (reported, not fixed here — see the CYB-2F dispatch report): the
 * pre-existing `guard-push.test.mjs` case "PG13 allow all-green (verify + security
 * fresh, standing-approved)" predates this wave's mandatory v2 evidence and will now
 * correctly BLOCK (Field 1 item 4's fail-closed default working as designed) until its
 * fixture is extended with a fresh/bound/non-blocking v2 pair — a one-fixture-call fix
 * this suite's own PGV2-01 demonstrates in full, but which this session cannot apply to
 * the protected file itself (see above).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

const ALL_DIRS = [];

/** Fresh temp dir with a real git repo (one commit) so `git rev-parse HEAD` resolves. */
function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-v2-${prefix}-`));
  ALL_DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const tree = git("rev-parse", "HEAD^{tree}").stdout.trim();
  return { dir, head, tree };
}

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function writeManifest(dir, yamlText) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), yamlText);
}
function writeEvidence(dir, relPath, obj) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof obj === "string" ? obj : JSON.stringify(obj));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Mirrors guard-push.test.mjs's own `exactSecurityEvidence` v1 fixture exactly. */
function exactSecurityEvidence({ head, tree }) {
  const payload = {
    schema: "pipeline.security-evidence.v1",
    exitCode: 0,
    commit: head,
    candidate: {
      status: "clean", commit: head, tree, inputSha256: "a".repeat(64), repositorySha256: "b".repeat(64),
      inventory: { entries: 1, symlinkPolicy: "reject", submodulePolicy: "reject" },
      snapshot: { method: "git-detached-worktree.v1", verifiedBeforeAfter: true },
    },
    policy: { configurationSha256: "c".repeat(64), sha256: "d".repeat(64) },
  };
  return { ...payload, payloadSha256: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}

/**
 * CYB-2F fixture: a schema-shaped `evidence/security-latest.v2.json` envelope, bound to
 * `head`/`tree` via `input.commit`/`input.tree`. `capabilities` is an array of
 * `{ capabilityId, tool, status, classification, reason }` -- only the fields
 * `guard-push.mjs`'s `checkSecurityEvidenceV2` actually reads; every other v2 envelope
 * field is filled with schema-shaped placeholder content the guard never inspects.
 */
function exactV2Envelope({ head, tree, capabilities }) {
  return {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: "e".repeat(64) },
    input: { commit: head, tree, inputSha256: "f".repeat(64) },
    environment: { platform: process.platform, nodeVersion: process.version },
    capabilities: capabilities.map(
      ({ capabilityId, tool = "gitleaks", status = "PASS", classification = "clean", reason = null }) => ({
        capabilityId,
        tool: { name: tool, version: null },
        rulePack: { ref: `${tool}-default`, digest: null },
        status,
        classification,
        findings: [],
        coverage: {
          subject: "candidate-tree",
          exclusions: [],
          ignored: [],
          unsupportedScope: [],
          truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null },
          dataAge: { ageSeconds: 0, snapshotAt: null },
        },
        reason,
      }),
    ),
  };
}

/**
 * CYB-2F fixture: a schema-shaped `evidence/security-latest.v2.verdict.json`
 * policy-complete verdict. `required`/`optional` are capabilityId arrays (the plan);
 * `capabilityOutcomes` is the persisted `{ [capabilityId]: outcome }` map; `blocking`/
 * `offendingCapabilities` are the persisted `verdict` block guard-push.mjs reads.
 */
function exactV2Verdict({ required, optional = [], capabilityOutcomes, blocking, offendingCapabilities }) {
  return {
    schema: "pipeline.security-verdict.v2",
    producedFrom: "pipeline.security-evidence.v2",
    exitAuthority: "v1-blocking-logic",
    note: "fixture",
    v1ExitCode: 0,
    plan: { required, optional, planDigest: "g".repeat(64), source: "fixture", resolvedPolicyDigest: "h".repeat(64) },
    capabilityOutcomes,
    verdict: { blocking, offendingCapabilities },
    controls: [],
  };
}

/**
 * Writes a FRESH, BOUND, self-consistent v2 envelope+verdict pair for one required
 * capability (default "cap.secrets", status "PASS" -> outcome "pass" -> non-blocking).
 * Pass `status`/`classification`/`outcome`/`offendingCapabilities`/`blocking` to
 * construct a deliberately blocking (but still internally self-consistent) pair.
 */
function writeExactV2Pair(
  dir,
  {
    head,
    tree,
    capabilityId = "cap.secrets",
    tool = "gitleaks",
    status = "PASS",
    classification = "clean",
    outcome = "pass",
    blocking = false,
    offendingCapabilities = [],
  },
) {
  writeEvidence(
    dir,
    "evidence/security-latest.v2.json",
    exactV2Envelope({ head, tree, capabilities: [{ capabilityId, tool, status, classification }] }),
  );
  writeEvidence(
    dir,
    "evidence/security-latest.v2.verdict.json",
    exactV2Verdict({
      required: [capabilityId],
      capabilityOutcomes: { [capabilityId]: outcome },
      blocking,
      offendingCapabilities,
    }),
  );
}

function runGuard(command, dir, { cwd = dir, projectDir = dir, env = {} } = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: projectDir },
    timeout: 10000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, command, dir, expectExit, { stderrIncludes, stderrNotIncludes, stderrEmpty, cwd, projectDir, env } = {}) {
  const { code, stderr } = runGuard(command, dir, { cwd: cwd ?? dir, projectDir: projectDir ?? dir, env });
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 300)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 300)}`);
  }
  for (const needle of [].concat(stderrNotIncludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 200)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}
const BLOCK = 2,
  ALLOW = 0;

const PUSH_CMD = "git push origin main";

function manifestPush({ mode = "blocking", approval = "required", security = null }) {
  let y = `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: ${mode}\n    type: human\n    approval: ${approval}\n`;
  if (security) y += `  security:\n    mode: ${security}\n    type: automated\n`;
  return y;
}

/** Shared all-green base: verify fresh + v1 security fresh + standing-approved. */
function allGreenBase() {
  const { dir, head, tree } = freshRepo("all-green-base");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "blocking" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeEvidence(dir, "evidence/security-latest.json", exactSecurityEvidence({ head, tree }));
  return { dir, head, tree };
}

// ---- PGV2-01 fresh+bound+non-blocking v2 is a byte-identical no-op (DoD5/6a) -----------
{
  const { dir, head, tree } = allGreenBase();
  writeExactV2Pair(dir, { head, tree }); // default: cap.secrets PASS -> pass -> blocking:false
  check("PGV2-01 allow  fresh+bound+non-blocking v2 pair is a no-op alongside all-green v1", PUSH_CMD, dir, ALLOW, {
    stderrEmpty: true,
  });
}

// ---- PGV2-02 blocking verdict blocks the push, one line per offending capability (DoD4/6b) --
{
  const { dir, head, tree } = allGreenBase();
  writeExactV2Pair(dir, {
    head,
    tree,
    status: "SKIPPED",
    classification: "binary_missing",
    outcome: "required-capability-missing",
    blocking: true,
    offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "required-capability-missing" }],
  });
  check("PGV2-02 block  v2 blocking verdict produces one failure line per offending capability", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: [
      "evidence/security-latest.v2.verdict.json: required capability cap.secrets did not reach an accepted state (outcome=required-capability-missing)",
    ],
  });
}

// ---- PGV2-03 v2 evidence missing entirely is fail-closed (DoD3/6c) --------------------------
{
  const { dir } = allGreenBase();
  // v2 envelope/verdict intentionally absent entirely.
  check("PGV2-03 block  v2 evidence missing entirely is fail-closed, never silently skipped", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["evidence/security-latest.v2.json missing", "evidence/security-latest.v2.verdict.json missing"],
  });
}

// ---- PGV2-04 v2 envelope bound to a different commit/tree than the pushed source (DoD6d) ----
{
  const { dir } = allGreenBase();
  const wrongHead = "1".repeat(40);
  const wrongTree = "2".repeat(40);
  writeEvidence(
    dir,
    "evidence/security-latest.v2.json",
    exactV2Envelope({ head: wrongHead, tree: wrongTree, capabilities: [{ capabilityId: "cap.secrets", status: "PASS" }] }),
  );
  writeEvidence(
    dir,
    "evidence/security-latest.v2.verdict.json",
    exactV2Verdict({ required: ["cap.secrets"], capabilityOutcomes: { "cap.secrets": "pass" }, blocking: false, offendingCapabilities: [] }),
  );
  check("PGV2-04 block  v2 envelope bound to a different commit/tree is NOT silently ignored", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: [
      "evidence/security-latest.v2.json: input commit does not match the pushed source",
      "evidence/security-latest.v2.json: input tree does not match the pushed source",
    ],
  });
}

// ---- PGV2-05 verdict inconsistent with its companion envelope -> binding failure (DoD2/6e) ---
{
  const { dir, head, tree } = allGreenBase();
  writeEvidence(
    dir,
    "evidence/security-latest.v2.json",
    exactV2Envelope({ head, tree, capabilities: [{ capabilityId: "cap.secrets", status: "PASS" }] }),
  );
  // Verdict LIES about the envelope's own PASS capability: claims blocking with a
  // "findings" outcome that the fresh envelope's status (PASS) cannot support.
  writeEvidence(
    dir,
    "evidence/security-latest.v2.verdict.json",
    exactV2Verdict({
      required: ["cap.secrets"],
      capabilityOutcomes: { "cap.secrets": "findings" },
      blocking: true,
      offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "findings" }],
    }),
  );
  check(
    "PGV2-05 block  v2 verdict inconsistent with its companion envelope is caught as a binding failure",
    PUSH_CMD,
    dir,
    BLOCK,
    {
      stderrIncludes: [
        "evidence/security-latest.v2.verdict.json: verdict is not consistent with evidence/security-latest.v2.json's capability records (stale or mismatched pair)",
      ],
      stderrNotIncludes: ["did not reach an accepted state"],
    },
  );
}

// ---- PGV2-06 security gate off skips v2 consult entirely, matching existing v1 skip (DoD6f) --
{
  const { dir, head } = freshRepo("v2-gate-off");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "off" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  // Neither v1 nor v2 security evidence exists at all -- gate is off, must not matter.
  check("PGV2-06 allow  security gate off skips v2 consult entirely", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PGV2-07 v1 failure and v2 blocking failure both surface; v2 never suppresses v1 (DoD5) --
{
  const { dir, head, tree } = freshRepo("v1-and-v2-both-fail");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "blocking" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  const v1Evidence = exactSecurityEvidence({ head, tree });
  v1Evidence.candidate.snapshot.verifiedBeforeAfter = false; // pre-existing v1 tamper case (PG13a style)
  writeEvidence(dir, "evidence/security-latest.json", v1Evidence);
  writeExactV2Pair(dir, {
    head,
    tree,
    status: "SKIPPED",
    classification: "binary_missing",
    outcome: "required-capability-missing",
    blocking: true,
    offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "required-capability-missing" }],
  });
  check(
    "PGV2-07 block  v1 security failure and v2 blocking failure both surface together (additive, not replacing)",
    PUSH_CMD,
    dir,
    BLOCK,
    {
      stderrIncludes: [
        "immutable snapshot was not verified",
        "payload digest is invalid",
        "evidence/security-latest.v2.verdict.json: required capability cap.secrets did not reach an accepted state (outcome=required-capability-missing)",
      ],
    },
  );
}

// ---- Cleanup ----------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
