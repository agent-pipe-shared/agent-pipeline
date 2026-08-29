#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-push-hook-install — installs/removes a git-level `.git/hooks/pre-push` backstop
 * for guard-push.mjs's Push-Gate (NVA-PREPUSH-1).
 *
 * WHY THIS FILE EXISTS
 *   guard-push.mjs (plugins/pipeline-core/hooks/guard-push.mjs) only intercepts an
 *   agent's own Bash/PowerShell tool calls inside a live, supervised session. A push
 *   issued by a sub-process the session merely spawns, by a human running `git push`
 *   directly, or after the plugin hook layer has failed to load at all, is invisible to
 *   it -- see plugins/pipeline-core/lib/protected-test-paths.mjs ("NOT COVERED").
 *   Commit a8f861cc removed an earlier, broken attempt at exactly this same file: it
 *   fell open whenever no session env var was set, hardcoded a repo-relative guard
 *   path, and reconstructed `git push $1` from argv even though git's own pre-push
 *   contract delivers ref updates on stdin, not argv. This rebuild fixes all three
 *   (see generated hook's own header, `renderImpl` below, for the point-by-point fix).
 *
 * WHAT THIS INSTALLS
 *   Two files, both generated, both attributed to this script's own version:
 *     - `<git-common-dir>/hooks/pre-push` (or wherever `core.hooksPath` points): a tiny
 *       POSIX `/bin/sh` shim. A shim, not the real logic, because a bare hook file
 *       (no `.mjs` extension) has ambiguous Node module-type detection across the wide
 *       range of Node versions a consumer project might run; `exec`-ing a real `.mjs`
 *       file removes that ambiguity entirely regardless of Node version.
 *     - `<git-common-dir>/agent-pipeline/pre-push-hook/impl.mjs`: the actual ESM
 *       evaluation logic, importing the pipeline's OWN already-exported lib helpers
 *       (never a copy) from an absolute path fixed at this exact install.
 *   Plus an install marker at `<git-common-dir>/agent-pipeline/pre-push-hook/
 *   install-marker.json` recording what was written and its content hash, so removal
 *   can prove it is deleting exactly what THIS installer wrote and never a hook a human
 *   already had (`planInstall`/`planRemoval` below).
 *
 * NOT installed anywhere as a side effect of running this script directly -- callers
 * decide when to `applyInstall`. NVA-PREPUSH-1 explicitly does not install it into this
 * repository's own checkout (a release is mid-flight).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync, rmdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const INSTALLER_VERSION = "1";
export const MARKER_SCHEMA = "pipeline.pre-push-hook-install.v1";
// NVA-PREPUSHOFFER-1: a human declining the onboarding offer for this hook is
// recorded so a later bootstrap can report "not installed, declined on <date>"
// instead of asking indefinitely -- deliberately its own marker file, never
// folded into MARKER_SCHEMA's install marker, so an install and a decline can
// never be confused for one another and a later install never has to first
// erase a decline record to proceed (declining is not a permanent refusal).
export const DECLINE_MARKER_SCHEMA = "pipeline.pre-push-hook-decline.v1";

// This installer's own plugin root -- same self-location idiom guard-push.mjs and
// guard-lifecycle-ready.mjs already use (`resolve(dirname(fileURLToPath(import.meta.
// url)), "..")`), never a second mechanism.
const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_PLUGIN_LIB_DIR = join(PLUGIN_ROOT, "lib");

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Resolves the repository's own git-common-dir and hook path FROM THE REPOSITORY,
 * never from a session environment variable or an assumed cwd -- the second and
 * third defects the removed workaround (a8f861cc) carried. `git rev-parse` is asked
 * for the answer directly; if it cannot answer, installation/removal both refuse
 * rather than guess (fail-closed, matching the generated hook's own doctrine).
 */
function resolveGitPaths(rootDir) {
  // NVA-R9-PREPUSHHOOK: `stdio` pins stdin/stderr to "ignore" -- stdout stays piped
  // (captured into the returned string) unchanged. Onboarding now calls this
  // unconditionally on every apply (install-by-default), including against fixtures
  // whose `.git` is not a real repository; without this, git's own "fatal: not a git
  // repository" diagnostic leaked to the parent process's stderr on every such call,
  // even though it was already caught and handled as a plain resolution failure below.
  const run = (args) => execFileSync("git", args, { cwd: rootDir, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  let commonDir;
  let hookPath;
  try {
    commonDir = run(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    hookPath = run(["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"]);
  } catch {
    return null;
  }
  return { commonDir, hookPath };
}

function markerPath(commonDir) {
  return join(commonDir, "agent-pipeline", "pre-push-hook", "install-marker.json");
}
function implPath(commonDir) {
  return join(commonDir, "agent-pipeline", "pre-push-hook", "impl.mjs");
}
function declineMarkerPath(commonDir) {
  return join(commonDir, "agent-pipeline", "pre-push-hook", "decline-marker.json");
}

function readMarker(commonDir) {
  try {
    const parsed = JSON.parse(readFileSync(markerPath(commonDir), "utf8"));
    if (parsed?.schema !== MARKER_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readDeclineMarker(commonDir) {
  try {
    const parsed = JSON.parse(readFileSync(declineMarkerPath(commonDir), "utf8"));
    if (parsed?.schema !== DECLINE_MARKER_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The `/bin/sh` shim installed at the actual hook path. `implAbsPath` is DATA baked in
 * at install time (this exact repository's resolved impl.mjs location), not a guess. */
export function renderShim(implAbsPath) {
  return [
    "#!/bin/sh",
    "# GENERATED by plugins/pipeline-core/scripts/pre-push-hook-install.mjs -- do not hand-edit.",
    "# Re-run the installer to update; use its --remove verb to uninstall cleanly.",
    `exec node ${JSON.stringify(implAbsPath)} "$@"`,
    "",
  ].join("\n");
}

/** The real ESM evaluation logic. `pluginLibDir` is baked in as an absolute path fixed
 * at install time (DoD (b)) -- see this function's own generated header for the full
 * scope/fail-closed contract. Kept as one exported render function (never copied
 * inline at each call site) so the installed hook's content stays byte-identical to
 * whatever `pre-push-hook-install.test.mjs` exercises. */
export function renderImpl(pluginLibDir) {
  const lib = JSON.stringify(pluginLibDir);
  return `#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-push (agent-pipeline generated, installer v${INSTALLER_VERSION}) -- git-level
 * backstop for the Push-Gate guard-push.mjs enforces inside an agent session.
 *
 * GENERATED FILE. Installed by plugins/pipeline-core/scripts/pre-push-hook-install.mjs.
 * Do not hand-edit -- re-run the installer to update, or use its --remove verb.
 *
 * WHY THIS FILE EXISTS
 *   guard-push.mjs only intercepts an agent's OWN Bash/PowerShell tool calls inside a
 *   live session. A push issued by a spawned sub-process, by a human running \`git
 *   push\` directly, or after the plugin hook layer has failed to load at all, was never
 *   evaluated by anything (plugins/pipeline-core/lib/protected-test-paths.mjs, "NOT
 *   COVERED"; commit a8f861cc removed an earlier, broken attempt at this same file).
 *   This hook closes that gap at the one place every one of those paths must still
 *   pass through: git's own pre-push contract.
 *
 * SCOPE (deliberately narrower than guard-push.mjs -- see the NVA-PREPUSH-1 dispatch
 * report for the full reasoning; this is a backstop, not a full replacement):
 *   - (a) evidence/verify-latest.json freshness + exact pushed-commit binding.
 *   - (b) evidence/security-latest.json v1 candidate binding, when gates.security is
 *     configured and not "off".
 *   - (b.2) the v2 policy-complete verdict, via the SAME exported
 *     \`checkSecurityCompleteness\` guard-push.mjs itself calls -- reused, not copied.
 *   - (c) push approval, GENERAL MODE ONLY: gates.push.approval === "standing-approved"
 *     auto-passes; otherwise state.pushApproval.lastApproved.forCommit/destination must
 *     match this exact push. This is "necessary but not sufficient" under guard-
 *     push.mjs's own signature-mode contract -- NOT mirrored here: the Ed25519
 *     critical-proof chain, the refs/heads/main fixed-publication-executor boundary,
 *     the anonymous-public-push identity checks, the external push ledger, the H-AC-12
 *     decision-reference dual-evaluation, and the deploy-release branch. Those are
 *     self-application-specific, orchestration-specific, or session-anchored
 *     mechanisms that a bare git hook firing with no agent session cannot faithfully
 *     reconstruct. A repository relying on the critical-proof chain for real protection
 *     (this Pipeline repository included) still needs guard-push.mjs's in-session gate
 *     for that half -- this hook is the evidence/approval backstop, not a substitute.
 *
 * FAIL-CLOSED, DELIBERATELY UNLIKE THE PLUGIN GUARD FAMILY'S FAIL-OPEN CONVENTION
 *   Every plugin PreToolUse guard (guard-push.mjs included) fails OPEN on unparseable
 *   input or an unanticipated fault -- "never silent-block" is the documented contract,
 *   because that guard is a safety net layered on top of a live, supervised session.
 *   This hook exists precisely for the moment that supervision is gone, so here
 *   "cannot tell" must not mean "allow". An unresolved repository root, a manifest that
 *   IS present but unreadable/unparseable, missing or corrupt evidence, an unreadable
 *   push-approval state file, or any other unexpected exception all BLOCK the push.
 *
 * THE HUMAN ESCAPE, AND ITS OWN LIMIT
 *   \`git push --no-verify\` skips every git hook, this one included -- git's own
 *   documented behaviour, and the accepted operator escape so a human is never stuck.
 *   Precisely because git does not invoke the hook at all under --no-verify, this file
 *   CANNOT record a bypass -- nothing runs to record it. What it DOES do: append a
 *   durable record of every push it DOES see (allowed or blocked) to
 *   <git-common-dir>/agent-pipeline/pre-push-hook/log.jsonl. A later check comparing
 *   the remote's actual tip against these records is what would make a --no-verify
 *   push detectable after the fact (not built in this dispatch -- the record shape is
 *   designed to make that check possible later).
 *
 * INSTALL-TIME BINDING
 *   PLUGIN_LIB_DIR below is fixed by the installer at install time -- DATA, not a
 *   repo-relative guess. If that plugin copy later moves or is removed, every push
 *   blocks (fail-closed, per above) with a diagnostic naming the failure, until the
 *   hook is reinstalled or removed.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const PLUGIN_LIB_DIR = ${lib};
const HOOK_LOG_SCHEMA = "pipeline.pre-push-hook-log.v1";
const ZERO_OID = /^0{40}$|^0{64}$/;

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 10000 });
}

function resolveProjectRoot() {
  const result = git(["rev-parse", "--show-toplevel"], process.cwd());
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : null;
}

function resolveGitCommonDir() {
  const result = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd());
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : null;
}

function recordLog(commonDir, entry) {
  if (!commonDir) return;
  try {
    const dir = join(commonDir, "agent-pipeline", "pre-push-hook");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(
      join(dir, "log.jsonl"),
      \`\${JSON.stringify({ schema: HOOK_LOG_SCHEMA, at: new Date().toISOString(), ...entry })}\\n\`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    // The push verdict must never depend on the log write succeeding -- an unwritable
    // log is a durability problem, not grounds to revisit a fail-closed decision that
    // was already made either way by the time this runs.
  }
}

export function parseRefUpdates(stdinText) {
  const updates = [];
  for (const line of stdinText.split("\\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\\s+/);
    if (parts.length !== 4) continue; // malformed line -- ignored, never fabricated
    const [localRef, localSha, remoteRef, remoteSha] = parts;
    updates.push({ localRef, localSha, remoteRef, remoteSha, isDelete: ZERO_OID.test(localSha) });
  }
  return updates;
}

export function checkEvidenceFreshness(projectRoot, relPath, sourceCommit) {
  const failures = [];
  let raw;
  try {
    raw = readFileSync(join(projectRoot, relPath), "utf8");
  } catch {
    failures.push(\`\${relPath} missing.\`);
    return failures;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    failures.push(\`\${relPath} is corrupted (invalid JSON: \${error.message}).\`);
    return failures;
  }
  if (data?.exitCode !== 0) failures.push(\`\${relPath}: exitCode=\${JSON.stringify(data?.exitCode)} (expected 0).\`);
  if (data?.commit !== sourceCommit) failures.push(\`\${relPath}: commit=\${JSON.stringify(data?.commit)} is stale (pushed source commit: \${sourceCommit}).\`);
  return failures;
}

async function evaluateOneCommit({ projectRoot, commit, remoteRef }) {
  const { loadManifest, gateConfig } = await import(pathToFileURL(join(PLUGIN_LIB_DIR, "manifest.mjs")).href);
  const { VERIFY_EVIDENCE_DEFAULT_PATH } = await import(pathToFileURL(join(PLUGIN_LIB_DIR, "verify-evidence-path.mjs")).href);
  const { checkSecurityCompleteness } = await import(pathToFileURL(join(PLUGIN_LIB_DIR, "security-completeness-gate.mjs")).href);
  const { resolveProjectAuthorityPaths, NEUTRAL_STATE, LEGACY_STATE } = await import(pathToFileURL(join(PLUGIN_LIB_DIR, "project-authority.mjs")).href);

  const manifestResult = loadManifest(projectRoot);
  if (manifestResult.status === "absent") {
    // Mirrors guard-push.mjs step 3 exactly: the whole feature stays opt-in.
    return { hardBlock: null, failures: [], securityFailures: [], pushGateMode: "blocking", securityGateMode: "blocking", skipped: true };
  }
  if (manifestResult.status !== "ok") {
    // Present but unreadable/unparseable/semantically invalid: guard-push.mjs treats
    // this as a non-blocking WARN. This hook does NOT -- a manifest the repository
    // clearly tried to configure that this hook cannot read is a "cannot evaluate"
    // case per its own fail-closed doctrine (see file header), not a silent pass.
    return { hardBlock: "the Push-Gate manifest is present but could not be read (invalid or unparseable); cannot evaluate the Push-Gate.", failures: [], securityFailures: [], pushGateMode: "blocking", securityGateMode: "blocking", skipped: false };
  }
  const manifest = manifestResult.manifest;

  const pushGate = gateConfig(manifest, "push");
  if (!pushGate || pushGate.mode === "off") {
    return { hardBlock: null, failures: [], securityFailures: [], pushGateMode: "blocking", securityGateMode: "blocking", skipped: true };
  }
  const pushGateMode = pushGate.mode === "warn" ? "warn" : "blocking";

  const failures = [];
  const securityFailures = [];
  let securityGateMode = "blocking";

  const treeResult = git(["-C", projectRoot, "rev-parse", \`\${commit}^{tree}\`], projectRoot);
  const sourceTree = treeResult.status === 0 ? treeResult.stdout.trim() : null;

  // (a) verify evidence.
  failures.push(...checkEvidenceFreshness(projectRoot, VERIFY_EVIDENCE_DEFAULT_PATH, commit));

  // (b)/(b.2) security evidence, only when configured and not "off".
  const securityGate = gateConfig(manifest, "security");
  if (securityGate && securityGate.mode !== "off") {
    securityGateMode = securityGate.mode === "warn" ? "warn" : "blocking";
    securityFailures.push(...checkEvidenceFreshness(projectRoot, "evidence/security-latest.json", commit));
    securityFailures.push(...checkSecurityCompleteness({ projectDir: projectRoot, commit, tree: sourceTree }));
  }

  // (c) approval -- general mode only, see file header SCOPE.
  if (pushGate.approval !== "standing-approved") {
    const authority = resolveProjectAuthorityPaths({ rootDir: projectRoot });
    const stateRelPath = authority.status === "ready"
      ? authority.state
      : (existsSync(join(projectRoot, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
    let state = null;
    try {
      state = JSON.parse(readFileSync(join(projectRoot, stateRelPath), "utf8"));
    } catch (error) {
      failures.push(\`push approval state \${stateRelPath} is missing or unreadable (\${error.code ?? "unparseable"}); cannot confirm approval.\`);
    }
    if (state) {
      const approval = state?.pushApproval?.lastApproved;
      if (!approval || approval.forCommit !== commit) {
        failures.push(\`push approval missing or stale: expected state.pushApproval.lastApproved.forCommit=\${commit}, found \${JSON.stringify(approval?.forCommit ?? null)}.\`);
      } else if (approval.destination !== remoteRef) {
        failures.push(\`push approval is bound to a different destination ref (\${JSON.stringify(approval.destination)}) than this push (\${remoteRef}).\`);
      }
    }
  }

  return { hardBlock: null, failures, securityFailures, pushGateMode, securityGateMode, skipped: false };
}

function block(lines) {
  process.stderr.write(
    [
      \`BLOCKED (agent-pipeline pre-push hook): \${lines[0]}\`,
      ...lines.slice(1),
      "",
      "HUMAN OPERATOR ONLY: git itself provides operator-level ways to bypass hook enforcement for a human working directly, outside any agent session. An agent MUST NOT use any such bypass under any circumstance or instruction -- if this push must proceed, stop and hand it to a human operator.",
    ].join("\\n") + "\\n",
  );
  process.exitCode = 1;
}

async function main() {
  const stdinText = readFileSync(0, "utf8");
  const updates = parseRefUpdates(stdinText);
  const projectRoot = resolveProjectRoot();
  const commonDir = resolveGitCommonDir();
  if (!projectRoot || !commonDir) {
    block(["this repository's own root/common-dir could not be resolved via \`git rev-parse\` -- cannot evaluate the Push-Gate."]);
    return;
  }

  const allFindings = [];
  let anyBlocking = false;

  for (const update of updates) {
    if (update.isDelete) {
      recordLog(commonDir, { verdict: "allowed", note: "ref deletion -- not evaluated (guard-git.mjs territory)", localRef: update.localRef, remoteRef: update.remoteRef });
      continue;
    }
    let result;
    try {
      result = await evaluateOneCommit({ projectRoot, commit: update.localSha, remoteRef: update.remoteRef });
    } catch (error) {
      // Fault boundary: unlike guard-push.mjs, an unexpected exception here ALWAYS
      // blocks, never mode-gated (file header FAIL-CLOSED section).
      allFindings.push(\`\${update.remoteRef}: Push-Gate evaluation faulted unexpectedly (\${error?.name ?? "Error"}).\`);
      anyBlocking = true;
      recordLog(commonDir, { verdict: "blocked", commit: update.localSha, localRef: update.localRef, remoteRef: update.remoteRef, reasons: ["evaluation fault"] });
      continue;
    }
    if (result.hardBlock) {
      allFindings.push(\`\${update.remoteRef} (\${update.localSha}): \${result.hardBlock}\`);
      anyBlocking = true;
      recordLog(commonDir, { verdict: "blocked", commit: update.localSha, localRef: update.localRef, remoteRef: update.remoteRef, reasons: [result.hardBlock] });
      continue;
    }
    if (result.skipped) {
      recordLog(commonDir, { verdict: "allowed", commit: update.localSha, localRef: update.localRef, remoteRef: update.remoteRef, note: "push gate not configured or off" });
      continue;
    }
    const blocking = (result.failures.length > 0 && result.pushGateMode !== "warn")
      || (result.securityFailures.length > 0 && result.securityGateMode !== "warn");
    const all = [...result.failures, ...result.securityFailures];
    if (all.length > 0) allFindings.push(\`\${update.remoteRef} (\${update.localSha}):\`, ...all.map((f) => \`  - \${f}\`));
    if (blocking) anyBlocking = true;
    recordLog(commonDir, {
      verdict: blocking ? "blocked" : (all.length > 0 ? "allowed-with-warnings" : "allowed"),
      commit: update.localSha, localRef: update.localRef, remoteRef: update.remoteRef,
      reasons: all,
    });
  }

  if (anyBlocking) {
    block(allFindings.length ? allFindings : ["Push-Gate check failed."]);
    return;
  }
  if (allFindings.length > 0) {
    process.stderr.write(["[pre-push] WARN: Push-Gate findings are non-blocking (mode \\"warn\\"):", ...allFindings].join("\\n") + "\\n");
  }
}

// Guarded like plugins/pipeline-core/lib/entrypoint.mjs's isDirectInvocation() (not
// imported here so this generated file stays standalone/self-contained -- it must run
// in a project that never installed the pipeline-core plugin's own module graph): only
// runs main() when this exact file is the process entry point, so a test harness can
// \`import()\` it to reach its pure exported helpers without a live stdin read /
// process.exit as a side effect of import alone.
function isDirectlyInvoked() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(argv1);
  } catch {
    return false;
  }
}
if (isDirectlyInvoked()) {
  main().catch((error) => {
    block([\`this hook's own evaluation faulted before producing a verdict (\${error?.name ?? "Error"}).\`]);
  });
}
`;
}

/** Read-only: what an install would do, without writing anything. A hook actually
 * present on disk always wins over a decline record (checked first, below) -- a
 * stale decline marker left over from before an install, or from before a foreign
 * hook was placed, must never suppress reporting what is really there now. */
export function planInstall({ rootDir, pluginLibDir = DEFAULT_PLUGIN_LIB_DIR } = {}) {
  const paths = resolveGitPaths(rootDir);
  if (!paths) return { status: "repository-unresolved" };
  const { commonDir, hookPath } = paths;
  const marker = readMarker(commonDir);
  if (existsSync(hookPath) && !marker) {
    return { status: "foreign-hook-present", hookPath };
  }
  if (existsSync(hookPath) && marker) {
    let current;
    try {
      current = readFileSync(hookPath, "utf8");
    } catch {
      return { status: "foreign-hook-present", hookPath };
    }
    if (sha256(current) !== marker.hookSha256) {
      return { status: "foreign-hook-present", hookPath, detail: "existing hook was modified after this installer wrote it" };
    }
    return { status: "ready-to-upgrade", hookPath, commonDir, pluginLibDir };
  }
  const decline = readDeclineMarker(commonDir);
  if (decline) {
    return { status: "declined", hookPath, commonDir, pluginLibDir, declinedAt: decline.declinedAt };
  }
  return { status: "ready", hookPath, commonDir, pluginLibDir };
}

/** Read-only: whether a decline can be recorded (mirrors `planInstall`'s
 * fail-closed root resolution; declining never inspects hook content). */
export function planDecline({ rootDir } = {}) {
  const paths = resolveGitPaths(rootDir);
  if (!paths) return { status: "repository-unresolved" };
  return { status: "ready", commonDir: paths.commonDir };
}

/** Writes the decline marker only -- never touches the hook, its impl file, or the
 * install marker. Declining is always reversible: a later `applyInstall` call is
 * governed entirely by `planInstall`'s hook-presence checks above, which run before
 * the decline check and are therefore never blocked by a decline record. */
export function applyDecline({ rootDir } = {}) {
  const plan = planDecline({ rootDir });
  if (plan.status !== "ready") return plan;
  const { commonDir } = plan;
  const marker = {
    schema: DECLINE_MARKER_SCHEMA,
    declinedAt: new Date().toISOString(),
  };
  mkdirSync(join(commonDir, "agent-pipeline", "pre-push-hook"), { recursive: true, mode: 0o700 });
  writeFileSync(declineMarkerPath(commonDir), `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { status: "declined", declinedAt: marker.declinedAt };
}

/** Writes the hook, its impl file, and the install marker. Refuses (never overwrites) a
 * hook this installer did not write -- see `planInstall` above for the exact check. */
export function applyInstall({ rootDir, pluginLibDir = DEFAULT_PLUGIN_LIB_DIR } = {}) {
  const plan = planInstall({ rootDir, pluginLibDir });
  if (plan.status === "repository-unresolved") return { status: "repository-unresolved" };
  if (plan.status === "foreign-hook-present") return { status: "refused-foreign-hook", hookPath: plan.hookPath, detail: plan.detail };

  const { hookPath, commonDir } = plan;
  const impl = implPath(commonDir);
  const implContent = renderImpl(pluginLibDir);
  const shimContent = renderShim(impl);

  mkdirSync(join(commonDir, "agent-pipeline", "pre-push-hook"), { recursive: true, mode: 0o700 });
  writeFileSync(impl, implContent, { encoding: "utf8", mode: 0o600 });
  writeFileSync(hookPath, shimContent, { encoding: "utf8", mode: 0o700 });
  chmodSync(hookPath, 0o755);

  const marker = {
    schema: MARKER_SCHEMA,
    installerVersion: INSTALLER_VERSION,
    installedAt: new Date().toISOString(),
    hookPath,
    implPath: impl,
    pluginLibDir,
    hookSha256: sha256(shimContent),
    implSha256: sha256(implContent),
  };
  writeFileSync(markerPath(commonDir), `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  return { status: "installed", hookPath, implPath: impl, markerPath: markerPath(commonDir) };
}

/** Read-only: whether removal can safely proceed. */
export function planRemoval({ rootDir } = {}) {
  const paths = resolveGitPaths(rootDir);
  if (!paths) return { status: "repository-unresolved" };
  const { commonDir, hookPath } = paths;
  const marker = readMarker(commonDir);
  if (!marker) return { status: "nothing-to-remove", hookPath };
  if (!existsSync(hookPath)) return { status: "already-absent", hookPath };
  let current;
  try {
    current = readFileSync(hookPath, "utf8");
  } catch {
    return { status: "unreadable-hook", hookPath };
  }
  if (sha256(current) !== marker.hookSha256) {
    return { status: "refused-modified-hook", hookPath, detail: "the installed hook was modified since installation; removal refused" };
  }
  return { status: "ready", hookPath, commonDir, marker };
}

/** Deletes exactly what THIS installer wrote (hook, impl, marker) -- never a foreign or
 * human-modified hook. See `planRemoval` above for the exact refusal conditions. */
export function applyRemoval({ rootDir } = {}) {
  const plan = planRemoval({ rootDir });
  if (plan.status !== "ready") return plan;
  const { commonDir, hookPath } = plan;
  unlinkSync(hookPath);
  try { unlinkSync(implPath(commonDir)); } catch { /* already absent -- fine */ }
  try { unlinkSync(markerPath(commonDir)); } catch { /* already absent -- fine */ }
  try { rmdirSync(join(commonDir, "agent-pipeline", "pre-push-hook")); } catch { /* not empty or absent -- fine, never forced */ }
  return { status: "removed", hookPath };
}

// ---- CLI -----------------------------------------------------------------------------
if (isDirectInvocation(import.meta.url)) {
  const [verb] = process.argv.slice(2);
  const rootDir = process.cwd();
  if (verb === "--install") {
    const result = applyInstall({ rootDir });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "installed" ? 0 : 1);
  } else if (verb === "--remove") {
    const result = applyRemoval({ rootDir });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "removed" ? 0 : 1);
  } else if (verb === "--plan-install") {
    console.log(JSON.stringify(planInstall({ rootDir }), null, 2));
  } else if (verb === "--plan-remove") {
    console.log(JSON.stringify(planRemoval({ rootDir }), null, 2));
  } else if (verb === "--decline") {
    const result = applyDecline({ rootDir });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "declined" ? 0 : 1);
  } else {
    console.error("usage: pre-push-hook-install.mjs --plan-install|--install|--plan-remove|--remove|--decline");
    process.exit(2);
  }
}
