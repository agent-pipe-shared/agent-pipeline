#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push — PreToolUse guard enforcing the Push-Gate for Bash|PowerShell.
 *
 * Plugin: pipeline-core (Agent-Pipeline). Canon: `.claude/pipeline.yaml`
 * gate "push" (this repo: blocking/human/standing-approved, E15/ADR-0017), `.claude/
 * plans/2026-07-07-ap1-pipeline-tuning.md` Governing Decision 3 ("Gates check EVIDENCE
 * freshness, never compute it themselves").
 *
 * WHY THIS FILE EXISTS
 *   `verify` and (later) the security scan produce evidence artifacts, but nothing
 *   stopped a `git push` from running against STALE or RED evidence, or without the
 *   approval the manifest's push gate demands. This hook runs strictly AFTER
 *   guard-git.mjs in the hook chain (deny-rule territory is guard-git's alone — see
 *   NOT DUPLICATED below); it adds evidence-freshness + approval gating on top of
 *   whatever guard-git already allowed through.
 *
 * NOT DUPLICATED (dedup confirmation, AP1-P3 briefing mandatory step 1): this hook
 * does NOT re-implement any guard-git.mjs deny rule (GG-01..GG-16 force-push/branch-
 * delete/reset --hard/etc.) — those stay guard-git's exclusive territory. This hook
 * reuses guard-git's SHARED normalization helpers (`stripQuotedSegments`,
 * `normalizeGlobalGitOptions` from `../lib/git-cmd.mjs`) so push-command detection
 * can never drift out of sync with guard-git's own understanding of what a "git push"
 * looks like (quoted prose, chained commands, global git options).
 *
 * PUSH DETECTION (NVA-A7FIX-2): the full three-branch decision — a heredoc-aware
 * whole-string `/\bgit\s+push\b/` test against the quote-stripped, lowercased,
 * global-option-normalized command; a `directPush` positional check; and a
 * `shellWrapperPush` positional check for `sh`/`bash`/`pwsh`/`ssh`/etc. wrappers — is
 * the single, shared `commandIsGitPush` function in `../lib/git-cmd.mjs`. This hook and
 * codex-pretool-guard.mjs both call that ONE function rather than each hand-maintaining
 * a partial reimplementation of it (Critic F-1: a partial reimplementation silently lost
 * detection for shapes like `git.exe -C repo push` or `sh -c "git push"`).
 *
 * EXIT SEMANTICS (shared with the guard family): 0 allow · 2 block (stderr reason,
 * mode "blocking") · 1 allow + non-blocking WARN (mode "warn", OR a malformed
 * manifest/state — "never silent-block, never silent-pass").
 *
 * ORDER OF EVALUATION
 *   1. Unparseable stdin / no command -> fail-open exit 0.
 *   2. Not a push command (after quote-stripping + option-normalization) -> exit 0
 *      fast path.
 *   3. Manifest absent -> exit 0 (whole feature is opt-in). Manifest present but
 *      genuinely unparseable YAML -> WARN exit 1 (malformed, never silent).
 *   4. Gate "push" absent, or `mode === "off"` -> exit 0.
 *   5. Otherwise (mode "blocking" or "warn"): evaluate ALL of the checks below,
 *      collect ALL failures, and report them TOGETHER in one English stderr message —
 *      never fail on the first mismatch alone, so a single push attempt surfaces
 *      every reason at once instead of a frustrating fix-one-fail-next loop. Each
 *      finding is dispatched under its OWN gate's mode (PUSHWARN-1): (a)/(c) and the
 *      anonymous-public-push check follow `gates.push.mode`; (b)/(b.2) follow
 *      `gates.security.mode` instead — a security gate configured "warn" stays
 *      advisory even when the push gate itself is "blocking", and a security gate
 *      configured "blocking" still hard-blocks even when the push gate itself is "warn".
 *        (a) the push is one standalone, explicit repo/source operation;
 *            `evidence/verify-latest.json` exists, `exitCode === 0`, and `commit`
 *            equals the resolved commit OID of that exact source ref.
 *        (b) `evidence/security-latest.json` — SAME freshness checks as (a) — but
 *            ONLY evaluated when `gates.security` exists in the manifest AND its
 *            `mode !== "off"` (skipped entirely otherwise).
 *        (b.2) `evidence/security-latest.v2.json` (candidate-bound envelope) +
 *            `evidence/security-latest.v2.verdict.json` (policy-complete verdict) —
 *            SAME trigger as (b), purely ADDITIVE: an independent completeness
 *            failure mode alongside (b), never a replacement for it (see "V2
 *            POLICY-COMPLETE VERDICT" below for the binding proof and fail-closed
 *            default this consults).
 *        (c) approval: `gates.push.approval === "standing-approved"` auto-passes
 *            (no state needed at all); `"required"` (or the field simply absent —
 *            treated as the safer default) requires
 *            `state.pushApproval.lastApproved.forCommit === source OID` — a malformed
 *            `.claude/pipeline-state.json` at THIS point (only reached when the
 *            state file is actually needed) is its own WARN exit 1, same as (3).
 *   6. All checks pass -> exit 0 (allow).
 *   7. Any check failed -> the mode of the bucket it failed under decides severity
 *      (step 5): "blocking" -> exit 2, "warn" -> exit 1. If failures span both buckets
 *      under different modes, "blocking" wins for the whole push. Same collected
 *      message either way.
 *
 * MECHANICS: stdin = `{ tool_input: { command } }` (PreToolUse contract). Wired via
 * plugins/pipeline-core/hooks/hooks.json in a LATER bundled wave — this delivery does
 * not touch hooks.json; tests invoke this script directly via stdin pipe.
 *
 * DEPLOY BRANCH (Release/Promotion phase): evaluated whenever the manifest carries a
 * `release` section (`manifestResult.manifest?.release`, available on `status:"ok"` AND
 * on semantic `status:"invalid"`), INDEPENDENT of and BEFORE both existing early-exits
 * above (the `gates.push` absent/off exit and the `status:"invalid"` warn-skip): a
 * release-declaring repo gets deploy enforcement even with no push gate configured, and
 * a precedence-invalid manifest can no longer fail-open through the warn-skip for a
 * deploy-triggering push. This is a SEPARATE, always-hard-block gate (exit 2
 * unconditionally on violation, never mode-gated by `gates.push.mode`, never satisfied
 * by `gates.push.approval === "standing-approved"` — the composition bypass this gate
 * exists to close) — see `runDeployBranch` below for the full fail-matrix
 * (semantic-invalid+triggering=BLOCK, semantic-invalid+non-triggering=fall-through-with-
 * a-prepended-WARN, no-release=inert-unchanged, unparseable-manifest=inert-unchanged,
 * declared-but-malformed-central-policy=BLOCK). When the deploy branch finds nothing to
 * block, execution falls through unchanged into the pre-existing evaluation below
 * (checks a/b/c) exactly as before this slice.
 *
 * V2 POLICY-COMPLETE VERDICT (CYB-2F, additive — PO decision 2026-07-29, docs/state.md):
 * evaluated under the EXACT SAME trigger as check (b) above (`gates.security` present and
 * `mode !== "off"`), this ADDS one independent failure mode on top of (b) — it never
 * replaces it, because the v2 aggregate verdict treats a capability's `findings` outcome as
 * ACCEPTED (v2 is a completeness check, "did every required capability run to some accepted
 * state", not a severity check — replacing v1 wholesale would silently stop blocking on real
 * high/critical-severity secret findings). `evidence/security-latest.v2.json` (the
 * candidate-bound envelope) must itself bind to the pushed source exactly like (b)'s
 * candidate binding (`input.commit`/`input.tree` === the same `sourceCommit`/`sourceTree`
 * already resolved once for this check, never a second `git rev-parse`); its companion
 * `evidence/security-latest.v2.verdict.json` (`verdict.blocking`/`verdict.
 * offendingCapabilities`) is then cross-checked for same-run consistency by recomputing the
 * aggregate verdict from the envelope's OWN capability records (via the same pure, exported
 * `evaluateAllCapabilities`/`aggregateVerdict` functions security-scan.mjs itself calls) and
 * requiring an exact match to what's persisted — a verdict.json produced by a
 * different/earlier run than the fresh envelope sitting next to it will not reconstruct to
 * the same aggregate, so this is a genuine staleness/tamper proof, not a schema-shape check.
 * Any binding failure (missing/malformed/mismatched/inconsistent) is its OWN Push-Gate
 * failure line, fail-closed, kept distinct from a `verdict.blocking === true` failure so an
 * operator can tell "the v2 evidence itself is untrustworthy" apart from "the v2 evidence is
 * trustworthy and says something is incomplete." The v2 pair being absent entirely (an older
 * security-scan.mjs invocation, or the files were never generated) is ALSO fail-closed — v2
 * emission is unconditional whenever security-scan.mjs runs at all post-CYB-2E, matching this
 * file's "never silent-block, never silent-pass" doctrine. The check logic itself (CYB-2I-0,
 * Wave 6 foundation) now lives in the shared, parameterized, exported
 * `checkSecurityCompleteness` function in `../lib/security-completeness-gate.mjs` — extracted
 * so CYB-2I-1/2/3 (PR/Close/Release) can each call the exact same evaluator instead of
 * hand-rolling their own copy (AC8); this file's own call site only resolves and passes in
 * `evidenceProjectDir`/`sourceCommit`/`resolveSourceTree()`.
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-push.test.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { loadManifest, gateConfig, loadDeployPolicy } from "../lib/manifest.mjs";
import { authorizeRecordedDeploy, authorizeRecordedPush } from "../lib/critical-action-authorization.mjs";
import { USER_SOURCE_PATH, criticalProofWaiverFor, readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
// AGY-MKTATTEST-1: reuses the SAME attestation `human-guard-override.test.mjs`'s F1 case
// exercises (via `humanGuardOverrideInternals.localPluginInstallSourceObservation`), rather
// than a second, independently written comparison -- see checkMarketplaceAttestation() below.
import { HumanGuardOverrideError, humanGuardOverrideInternals } from "../lib/human-guard-override.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { checkExternalPushLedgerConsumption, externalPushLedgerGate } from "../lib/external-push-ledger.mjs";
import { dualEvaluateDecisionReference } from "../lib/decision-reference-dual-evaluation.mjs";
import { stripQuotedSegments, normalizeGlobalGitOptions, tokenizeArgv, refMatchesPattern, commandIsGitPush } from "../lib/git-cmd.mjs";
import {
  LEGACY_CALIBRATION,
  LEGACY_MANIFEST,
  LEGACY_STATE,
  NEUTRAL_CALIBRATION,
  NEUTRAL_MANIFEST,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";

function projectAuthorityRelPath(rootDir, key, neutralPath, legacyPath) {
  const authority = resolveProjectAuthorityPaths({ rootDir });
  if (authority.status === "ready") return authority[key];
  if (existsSync(join(rootDir, neutralPath))) return neutralPath;
  return legacyPath;
}

function projectStateRelPath(rootDir) {
  return projectAuthorityRelPath(rootDir, "state", NEUTRAL_STATE, LEGACY_STATE);
}

function projectManifestRelPath(rootDir) {
  return projectAuthorityRelPath(rootDir, "manifest", NEUTRAL_MANIFEST, LEGACY_MANIFEST);
}

function projectCalibrationRelPath(rootDir) {
  return projectAuthorityRelPath(rootDir, "calibration", NEUTRAL_CALIBRATION, LEGACY_CALIBRATION);
}
import { checkSecurityCompleteness } from "../lib/security-completeness-gate.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";
// NVA-W1-SCRATCHBIND (backlog: 2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-
// calls-it.md, Point 3): read-only observer, no mkdirSync/physicalScratchRoot call -- see
// buildScratchOrphanAdvisory below for the full rationale.
import { planOrphanScratchRetirement } from "../lib/session-cleanup-recovery.mjs";

// The plugin root this guard is itself running from -- same self-location resolution
// guard-lifecycle-ready.mjs / guard-human-override.mjs already use (`resolve(dirname(
// fileURLToPath(import.meta.url)), "..")`), reused rather than a second mechanism, so a
// path this hook prints resolves inside a consumer's installed plugin, never a path
// that exists only in this repository's own source checkout (backlog: 2026-08-08-
// shipped-artifacts-assume-the-pipelines-own-repository.md).
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Runnable reference to pipeline-state.mjs under the plugin actually enforcing this
 * guard. Degrades to a locate-it hint (never a broken path or an empty string) if the
 * script cannot be found under PLUGIN_ROOT.
 */
function pipelineStateScriptRef() {
  const script = join(PLUGIN_ROOT, "scripts", "pipeline-state.mjs");
  return existsSync(script)
    ? script
    : "pipeline-state.mjs (locate it under your installed pipeline-core plugin's scripts directory)";
}

function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
}

/**
 * Reduces an escaped exception to a typed, sanitized diagnostic for the terminal
 * fault boundary around the blocking evaluation (PUSHBOUND-1, issue #100 AC3).
 * Deliberately never the raw `.message` or `.stack` -- those can carry a local
 * absolute path, a credential-bearing remote URL, or other operator-supplied text
 * that reached this evaluation (SEC-01; PG17i already redacts for the identical
 * reason at the one other place raw operand text would otherwise be echoed). Only a
 * constructor-style `.name` and a well-formed Node error CODE (already a short
 * uppercase identifier, e.g. ENOENT/ERR_INVALID_ARG_TYPE -- never free text) survive.
 */
function sanitizedFaultDiagnostic(error) {
  const name = error && typeof error === "object" && typeof error.name === "string" && error.name
    ? error.name
    : "non-Error exception";
  const code = error && typeof error === "object" && typeof error.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(error.code)
    ? error.code
    : null;
  return code ? `${name} (${code})` : name;
}

/** Mirrors validate-manifest's message-first rendering for semantic policy findings. */
function manifestFindingText(finding) {
  if (typeof finding?.message === "string") return finding.message;
  if (finding?.reason) return finding.reason;
  if (finding?.path) return finding.path;
  return "invalid manifest";
}

// ---- read tool input (fail-open) --------------------------------------------------
let rawCommand = "";
// The declared execution directory for THIS exact command, when the host adapter
// supplies one. Antigravity's `run_command` tool carries its own `Cwd` argument,
// distinct from the directory the adapter happens to spawn this guard process in
// -- neither Claude Code's nor Codex's Bash tool has an equivalent field, and
// their `process.cwd()` already IS the real execution directory. Left `null` for
// every existing caller that never populates it (AGY-FIX-PUSHGUARD route 1: without
// this, a declared execution directory that differs from the guard's own spawn cwd
// makes every check below evaluate the WRONG repository's evidence/approval state
// while the real push targets a different one).
let declaredCwd = null;
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  rawCommand = String(input?.tool_input?.command ?? "");
  const cwdCandidate = typeof input?.tool_input?.cwd === "string" && input.tool_input.cwd.trim() !== ""
    ? input.tool_input.cwd
    : (typeof input?.cwd === "string" && input.cwd.trim() !== "" ? input.cwd : null);
  declaredCwd = cwdCandidate;
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!rawCommand) process.exit(0);

/**
 * Resolve the directory THIS push command actually executes in. Prefers a host-
 * declared cwd over the guard process's own `process.cwd()` -- see `declaredCwd`
 * above for why the two can legitimately differ. Never anchors the critical-proof
 * boundary (`fallbackProjectDir`, further down) -- that function stays deliberately
 * pinned to the GOVERNED session's own directory (PG12s13), never to a declared
 * push target, which is exactly the widening this helper must not cause there.
 */
function resolveShellCwd() {
  if (typeof declaredCwd !== "string" || declaredCwd.trim() === "") return process.cwd();
  return isAbsolute(declaredCwd) ? declaredCwd : resolve(process.cwd(), declaredCwd);
}

/**
 * `guard-git` owns validation and one-time consumption of the documented
 * override. The push gate must inspect the command the shell will execute,
 * rather than treating that valid leading environment assignment as an
 * ambiguous executable. This preserves the strict one-push grammar for every
 * host adapter that invokes both guards on the same Bash input.
 */
function commandAfterDocumentedOverridePrefix(command) {
  const bash = command.match(/^PIPELINE_GUARD_OVERRIDE=(?:'([^']*)'|"([^"]*)"|([A-Za-z0-9_.:/-]+))\s+([\s\S]*)$/u);
  if (bash) {
    const [, singleQuoted, doubleQuoted, unquoted, remainder] = bash;
    if (singleQuoted !== undefined) return remainder;
    if (doubleQuoted !== undefined && !/[`$\\]/u.test(doubleQuoted)) return remainder;
    if (unquoted !== undefined) return remainder;
    return command;
  }
  const powerShell = command.match(/^\$env:PIPELINE_GUARD_OVERRIDE\s*=\s*(?:'([^']*)'|"([^"]*)")\s*;\s*([\s\S]*)$/iu);
  if (!powerShell) return command;
  const [, singleQuoted, doubleQuoted, remainder] = powerShell;
  if (singleQuoted !== undefined || (doubleQuoted !== undefined && !/[`$\\]/u.test(doubleQuoted))) return remainder;
  return command;
}

const cmd = commandAfterDocumentedOverridePrefix(rawCommand);
if (!cmd) process.exit(0);

// ---- push detection (single shared source of truth, lib/git-cmd.mjs) ---------------
// The three-branch decision (heredoc-aware whole-string regex + env-skipping
// positional `directPush` + `shellWrapperPush`) now lives once in
// `commandIsGitPush` (../lib/git-cmd.mjs) -- see that function's header for the full
// heredoc-safety property list this preserves verbatim. codex-pretool-guard.mjs calls
// the SAME function so the two guards' push detection can never independently drift
// (NVA-A7FIX-2, fixing Critic F-1: a caller that reimplemented only the whole-string
// branch silently lost detection for shapes like `git.exe -C repo push` or
// `sh -c "git push"`).
const isPush = commandIsGitPush(cmd);
if (!isPush) process.exit(0); // fast path: not a push at all

/**
 * `detectionTokens` below is a SEPARATE concern from push detection above:
 * `resolveDeclaredPushProject` and `declaresCrossRepositoryPush` further down reuse it
 * to resolve WHICH repository a declared push targets and to detect cross-repository
 * ambiguity, not to decide whether the command is a push at all. Recomputed locally
 * (same env-skip logic `commandIsGitPush` uses internally, kept separate rather than
 * exported/shared because it serves this unrelated purpose here).
 */
const rawDetectionTokens = tokenizeArgv(cmd);
const detectionTokens = (() => {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(rawDetectionTokens[index] ?? "")) index += 1;
  if (/^env(?:\.exe)?$/i.test(rawDetectionTokens[index] ?? "")) {
    index += 1;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(rawDetectionTokens[index] ?? "")) index += 1;
  }
  return index === 0 ? rawDetectionTokens : rawDetectionTokens.slice(index);
})();

/**
 * Bind one push invocation to one repository and one source commit.  This is
 * intentionally a small accepted grammar: a guard cannot prove evidence freshness
 * for a shell bundle, a bulk push, or repository overrides with different
 * git-dir/work-tree semantics. A colon-less (implicit-destination) refspec IS
 * accepted, and its destination is resolved below to `refs/heads/<branch>` for
 * the ordinary/default case only (PHX-WP-GUARDPUSH-REFSPEC-RESOLVE) -- see
 * `resolveImplicitPushDestination`.
 */
function parsePushBinding(rawCmd) {
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;
  for (const ch of rawCmd) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && !singleQuoted) {
      escaped = true;
      continue;
    }
    if (!singleQuoted && (ch === "$" || ch === "`" || "*?[]{}~".includes(ch))) {
      return { ok: false, reason: "push command contains shell expansion or glob syntax" };
    }
    if (ch === "'" && !doubleQuoted) singleQuoted = !singleQuoted;
    else if (ch === '"' && !singleQuoted) doubleQuoted = !doubleQuoted;
  }
  if (singleQuoted || doubleQuoted || escaped) return { ok: false, reason: "push command quoting is incomplete or ambiguous" };

  const shellShape = stripQuotedSegments(rawCmd);
  if (/&&|\|\||[;|\n\r`<>]|\$\(/.test(shellShape)) {
    return { ok: false, reason: "push must be a standalone command (no shell bundle, pipe, redirection, or substitution)" };
  }

  const tokens = tokenizeArgv(rawCmd);
  if (tokens[0]?.toLowerCase() !== "git") return { ok: false, reason: "push command prefix is ambiguous" };

  let i = 1;
  let gitC = null;
  if (tokens[i] === "-C") {
    gitC = tokens[i + 1];
    if (!gitC) return { ok: false, reason: "git -C requires one repository path" };
    i += 2;
  }
  if (tokens[i]?.toLowerCase() !== "push") {
    return { ok: false, reason: "only git [-C <path>] push is accepted; other global repository overrides are ambiguous" };
  }
  i += 1;

  const safeFlags = new Set(["--dry-run", "--porcelain", "--verbose", "-v", "--quiet", "-q", "--atomic", "--no-atomic", "--set-upstream", "-u"]);
  const positionals = [];
  for (; i < tokens.length; i++) {
    const token = tokens[i];
    if (safeFlags.has(token)) continue;
    if (token.startsWith("-")) {
      return { ok: false, reason: "push option cannot be bound to exactly one source commit" };
    }
    positionals.push(token);
  }
  if (positionals.length !== 2) {
    return { ok: false, reason: "push must name exactly one remote and one explicit source refspec" };
  }

  const [remote, refspec] = positionals;
  const colon = refspec.indexOf(":");
  const source = colon === -1 ? refspec : refspec.slice(0, colon);
  let destination = colon === -1 ? null : refspec.slice(colon + 1);
  if (!remote || !source || (colon !== -1 && !destination) || source.startsWith("+")) {
    return { ok: false, reason: "push refspec is deleting, forced, or otherwise source-ambiguous" };
  }

  const shellCwd = resolveShellCwd();
  const candidateDir = gitC ? (isAbsolute(gitC) ? gitC : resolve(shellCwd, gitC)) : shellCwd;
  const rootResult = spawnSync("git", ["-C", candidateDir, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (rootResult.status !== 0 || !rootResult.stdout?.trim()) {
    return { ok: false, reason: "push repository cannot be resolved to a non-bare worktree" };
  }
  const projectDir = rootResult.stdout.trim();
  if (destination === null) {
    destination = resolveImplicitPushDestination(projectDir, remote, source);
  }
  return { ok: true, projectDir, source, destination, remote, refspec };
}

/**
 * PHX-WP-GUARDPUSH-REFSPEC-RESOLVE. Mirrors git's own default push-refspec
 * resolution, but ONLY for the ordinary/unconfigured case: a bare (colon-less)
 * branch name pushed to a remote that has no `remote.<name>.push` override
 * resolves, on an ordinary unconfigured remote, to `refs/heads/<branch>` on
 * both sides -- so `git push origin <branch>` and
 * `git push origin <branch>:refs/heads/<branch>` are the same push. This
 * function does NOT attempt to reproduce git's full remote-refspec-config
 * resolution: if the remote HAS a configured push refspec (any
 * `remote.<name>.push` value), or the source is not an ordinary bare branch
 * name (already a full `refs/...` ref, which resolves to itself with no
 * guessing needed, or the symbolic ref `HEAD`, whose target depends on the
 * checkout this guard must not assume), this returns `null` unchanged --
 * exactly today's behavior -- rather than guess.
 *
 * A bare name is also not automatically a branch: git's own ref DWIM lookup for an
 * unqualified push source checks `refs/tags/<name>` before `refs/heads/<name>`, so
 * `git push origin <tagname>` writes `refs/tags/<tagname>`, never `refs/heads/<tagname>`
 * -- and a name that resolves to BOTH a tag and a branch is exactly as ambiguous. This
 * function therefore confirms `source` names an existing local branch, and that no
 * same-named local tag pre-empts it, before returning the `refs/heads/<source>` guess;
 * either way, "cannot be established as a branch" returns `null`, same as the other
 * declined cases above -- a binding this guard authorizes against must be observed, not
 * synthesised.
 */
function resolveImplicitPushDestination(projectDir, remote, source) {
  if (source.startsWith("refs/")) return source;
  if (source === "HEAD") return null;
  const configuredPush = spawnSync(
    "git", ["-C", projectDir, "config", "--get-all", `remote.${remote}.push`],
    { encoding: "utf8", timeout: 5000 },
  );
  // git config exit codes: 0 = at least one value found (a non-default push refspec IS
  // configured -- do not guess), 1 = the key is simply absent (the ordinary/default
  // case this function resolves). Any other status means the lookup itself failed
  // (e.g. an unreadable config) -- fail closed to "unresolved", same as today.
  if (configuredPush.status === 0 && configuredPush.stdout?.trim()) return null;
  if (configuredPush.status !== 1) return null;
  // Confirm `source` is actually a local branch (and not shadowed by a same-named local
  // tag, which git's own DWIM order would prefer) before guessing refs/heads/<source>.
  const headRef = spawnSync(
    "git", ["-C", projectDir, "show-ref", "--verify", "--quiet", `refs/heads/${source}`],
    { timeout: 5000 },
  );
  if (headRef.status !== 0) return null; // no local branch by this name -- cannot resolve as a branch push.
  const tagRef = spawnSync(
    "git", ["-C", projectDir, "show-ref", "--verify", "--quiet", `refs/tags/${source}`],
    { timeout: 5000 },
  );
  if (tagRef.status === 0) return null; // same-named local tag exists -- ambiguous; don't guess.
  return `refs/heads/${source}`;
}

function splitShellSegments(rawCmd) {
  const segments = [];
  let start = 0;
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < rawCmd.length; i++) {
    const ch = rawCmd[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && !single) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !double) {
      single = !single;
      continue;
    }
    if (ch === '"' && !single) {
      double = !double;
      continue;
    }
    if (single || double) continue;
    const two = rawCmd.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      segments.push(rawCmd.slice(start, i));
      i += 1;
      start = i + 1;
    } else if (ch === ";" || ch === "|" || ch === "\n" || ch === "\r") {
      segments.push(rawCmd.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(rawCmd.slice(start));
  return segments;
}

function gitInvocationIndex(tokens) {
  return tokens.findIndex((token) => /^(?:git|git\.exe)$/i.test(token));
}

function resolveDeclaredPushProject(rawCmd, allowWrapper = true) {
  for (const segment of splitShellSegments(rawCmd)) {
    const tokens = tokenizeArgv(segment.trim());
    const gitIndex = gitInvocationIndex(tokens);
    if (gitIndex !== -1) {
      let candidate = resolveShellCwd();
      let pushIndex = gitIndex + 1;
      if (tokens[gitIndex + 1] === "-C" && tokens[gitIndex + 2]) {
        candidate = isAbsolute(tokens[gitIndex + 2]) ? tokens[gitIndex + 2] : resolve(resolveShellCwd(), tokens[gitIndex + 2]);
        pushIndex = gitIndex + 3;
      }
      if (tokens[pushIndex]?.toLowerCase() === "push") {
        const result = spawnSync("git", ["-C", candidate, "rev-parse", "--show-toplevel"], {
          encoding: "utf8",
          timeout: 5000,
        });
        if (result.status === 0 && result.stdout?.trim()) return result.stdout.trim();
      }
    }
  }
  if (allowWrapper && /^(?:(?:ba|z|da)?sh|pwsh|powershell|cmd)(?:\.exe)?$/i.test(detectionTokens[0] ?? "")) {
    for (const token of detectionTokens.slice(1)) {
      if (/\bgit(?:\.exe)?(?:\s+-C\s+\S+)?\s+push\b/i.test(token)) {
        const nested = resolveDeclaredPushProject(token, false);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function declaresCrossRepositoryPush(rawCmd) {
  for (const segment of splitShellSegments(rawCmd)) {
    const tokens = tokenizeArgv(segment.trim());
    const gitIndex = gitInvocationIndex(tokens);
    if (gitIndex !== -1) {
      const pushIndex = tokens.findIndex((token, index) => index > gitIndex && token.toLowerCase() === "push");
      const globals = pushIndex === -1 ? [] : tokens.slice(gitIndex + 1, pushIndex);
      if (
        globals.some(
          (token) =>
            token === "-C" ||
            token === "--bare" ||
            token === "--git-dir" ||
            token.startsWith("--git-dir=") ||
            token === "--work-tree" ||
            token.startsWith("--work-tree=") ||
            token === "--namespace" ||
            token.startsWith("--namespace="),
        )
      ) return true;
    }
  }
  return detectionTokens.some(
    (token) => /\bgit(?:\.exe)?\b.*(?:\s-C\s|--git-dir|--work-tree|--namespace|--bare).*\bpush\b/i.test(token),
  );
}

function resolveSourceCommit(binding) {
  const result = spawnSync("git", ["-C", binding.projectDir, "rev-parse", "--verify", "--end-of-options", `${binding.source}^{commit}`], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/i.test(result.stdout?.trim() ?? "")) return null;
  return result.stdout.trim();
}

// ---- specialized anonymous Shared-push calibration ----------------------------------
// Generic projects do not carry this calibration and therefore retain the normal
// evidence/approval gate unchanged.  Self-application enables it deliberately in
// .claude/pipeline.json; it is a repository-local expected identity, never a global
// git default or a private account profile.
const PUBLIC_PUSH_IDENTITY_SCHEMA = "pipeline.public-push-identity.v1";
const SSH_HOST_ALIAS = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u;
const TRAILER_DENY = /^(?:co-authored-by|signed-off-by|reviewed-by|assisted-by|provider|model|session|run|trace|private(?:-account)?|account|operator|machine|host|workspace|worktree)\s*:/im;
const EMAIL_IN_MESSAGE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PRIVATE_CORRELATION_IN_MESSAGE = /\b(?:provider|model|session|account|operator|codex|claude|openai|anthropic|gpt(?:[-\s]?[a-z0-9.]+)?|gemini|machine|host|workspace|worktree|correlation|trace(?:[-\s]?id)?|run[-\s]?id)\b/i;
const PRIVATE_URL_IN_MESSAGE = /\b[a-z][a-z0-9+.-]*:\S+|\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+/i;
const MACHINE_ABSOLUTE_PATH_IN_MESSAGE = /(?:^|[^A-Za-z0-9._-])(?:\/[A-Za-z0-9._-]+(?:\/|$)|[A-Za-z]:[\\/]|\\\\[^\\\s]+[\\/])/m;
const SECRET_LIKE_VALUE_IN_MESSAGE = /\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{12,})\b/;

function localGitConfig(binding, key) {
  const result = spawnSync("git", ["-C", binding.projectDir, "config", "--local", "--get", key], {
    encoding: "utf8",
    timeout: 5000,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function effectiveGitConfig(binding, key) {
  const result = spawnSync("git", ["-C", binding.projectDir, "config", "--get", key], {
    encoding: "utf8",
    timeout: 5000,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function effectivePushUrls(binding) {
  const result = spawnSync("git", ["-C", binding.projectDir, "remote", "get-url", "--push", "--all", binding.remote], {
    encoding: "utf8",
    timeout: 5000,
  });
  return result.status === 0 ? result.stdout.split("\n").filter(Boolean) : [];
}

function readPublicPushIdentity(binding) {
  const path = join(binding.projectDir, projectCalibrationRelPath(binding.projectDir));
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { enabled: false };
  }
  const identity = parsed?.publicPushIdentity;
  if (identity === undefined) return { enabled: false };
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) return { enabled: true, error: "publicPushIdentity calibration is malformed" };
  const required = ["schema", "mode", "repositoryOwner", "repositoryName", "remoteName", "approvedFeatureBranch", "sshHostAlias", "sshAccount", "authorName", "authorEmail"];
  if (required.some((key) => typeof identity[key] !== "string" || identity[key].length === 0)) {
    return { enabled: true, error: "publicPushIdentity calibration is incomplete" };
  }
  if (identity.schema !== PUBLIC_PUSH_IDENTITY_SCHEMA || identity.mode !== "required") {
    return { enabled: true, error: "publicPushIdentity calibration is not a required v1 anonymous-public binding" };
  }
  if (!SSH_HOST_ALIAS.test(identity.sshHostAlias)) {
    return { enabled: true, error: "publicPushIdentity SSH host alias is malformed" };
  }
  return { enabled: true, identity };
}

function remoteCoordinates(remoteUrl) {
  // Self-application deliberately uses an SSH host alias.  HTTPS, a generic GitHub
  // hostname, and scp/URL variants cannot prove the selected dedicated key path.
  const match = /^git@([A-Za-z0-9.-]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(remoteUrl ?? "");
  return match ? { host: match[1], owner: match[2], repository: match[3] } : null;
}

function anonymousRange(binding, sourceCommit, expected) {
  if (!binding.destination || binding.destination !== `refs/heads/${expected.approvedFeatureBranch}`) {
    return { ok: false, reason: "anonymous-public pushes require an explicit refs/heads/<feature-branch> destination" };
  }
  const branch = expected.approvedFeatureBranch;
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch === "main") return { ok: false, reason: "anonymous-public destination branch is malformed" };
  const trackingRef = `refs/remotes/${binding.remote}/${branch}`;
  const base = spawnSync("git", ["-C", binding.projectDir, "rev-parse", "--verify", "--end-of-options", trackingRef], {
    encoding: "utf8",
    timeout: 5000,
  });
  const baseCommit = base.status === 0 ? base.stdout.trim() : null;
  if (!baseCommit || !/^[0-9a-f]{40,64}$/i.test(baseCommit)) {
    return { ok: false, reason: "anonymous-public range lacks the fetched destination tracking ref" };
  }
  const ancestry = spawnSync("git", ["-C", binding.projectDir, "merge-base", "--is-ancestor", baseCommit, sourceCommit], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (ancestry.status !== 0) return { ok: false, reason: "anonymous-public destination is not an ancestor of the pushed source" };
  const commits = spawnSync("git", ["-C", binding.projectDir, "rev-list", "--reverse", `${baseCommit}..${sourceCommit}`], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (commits.status !== 0) return { ok: false, reason: "anonymous-public commit range cannot be read" };
  const commitIds = commits.stdout.split("\n").filter(Boolean);
  if (commitIds.length === 0) return { ok: false, reason: "anonymous-public push contains no newly reachable commit" };
  const entries = [];
  for (const commit of commitIds) {
    const object = spawnSync("git", ["-C", binding.projectDir, "cat-file", "-p", commit], { encoding: "utf8", timeout: 5000 });
    const signature = spawnSync("git", ["-C", binding.projectDir, "log", "-1", "--format=%G?", "--no-notes", commit], { encoding: "utf8", timeout: 5000 });
    if (object.status !== 0 || signature.status !== 0) return { ok: false, reason: "anonymous-public commit range cannot be decoded" };
    const bodyAt = object.stdout.indexOf("\n\n");
    const headers = bodyAt === -1 ? object.stdout : object.stdout.slice(0, bodyAt);
    const message = bodyAt === -1 ? "" : object.stdout.slice(bodyAt + 2);
    const author = /^author (.*) <([^>\n]+)> \d+ [+-]\d{4}$/m.exec(headers);
    const committer = /^committer (.*) <([^>\n]+)> \d+ [+-]\d{4}$/m.exec(headers);
    if (!author || !committer) return { ok: false, reason: "anonymous-public commit identity headers cannot be decoded" };
    entries.push({
      commit,
      authorName: author[1],
      authorEmail: author[2],
      committerName: committer[1],
      committerEmail: committer[2],
      signature: signature.stdout.trim(),
      message,
    });
  }
  return { ok: true, entries };
}

function authenticatedSshAccount(identity) {
  // `ssh -T` intentionally returns exit 1 after successful GitHub public-key
  // authentication because GitHub exposes no shell.  The bounded greeting is
  // the account evidence; a configured host alias alone only proves selection.
  const result = spawnSync(
    "ssh",
    ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", identity.sshHostAlias],
    {
      encoding: "utf8",
      timeout: 7000,
      // Node does not directly execute a .cmd fixture on Windows. The host alias
      // is calibration-validated before this shell resolution is enabled.
      shell: process.platform === "win32",
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return output.includes(`Hi ${identity.sshAccount}!`)
    ? { ok: true }
    : { ok: false, reason: "anonymous-public SSH account evidence does not name the calibrated dedicated account" };
}

function checkAnonymousPublicPush(binding, sourceCommit) {
  const calibration = readPublicPushIdentity(binding);
  if (!calibration.enabled) return [];
  if (calibration.error) return [calibration.error];
  const expected = calibration.identity;
  const failures = [];
  const expectedConfig = {
    "user.useConfigOnly": "true",
    "commit.gpgSign": "false",
    "user.name": expected.authorName,
    "user.email": expected.authorEmail,
  };
  for (const [key, value] of Object.entries(expectedConfig)) {
    if (localGitConfig(binding, key) !== value) failures.push(`anonymous-public local ${key} must equal its calibrated value`);
  }
  if (binding.remote !== expected.remoteName) failures.push("anonymous-public push must use the calibrated remote name");
  const remote = remoteCoordinates(localGitConfig(binding, `remote.${binding.remote}.url`));
  if (!remote || remote.host !== expected.sshHostAlias || remote.owner !== expected.repositoryOwner || remote.repository !== expected.repositoryName) {
    failures.push("anonymous-public remote must bind the calibrated SSH host alias and repository owner");
  }
  const expectedPushUrl = `git@${expected.sshHostAlias}:${expected.repositoryOwner}/${expected.repositoryName}.git`;
  const effectiveUrls = effectivePushUrls(binding);
  if (effectiveUrls.length !== 1 || effectiveUrls[0] !== expectedPushUrl) {
    failures.push("anonymous-public effective push URL must be exactly the calibrated SSH endpoint");
  }
  if (process.env.GIT_SSH || process.env.GIT_SSH_COMMAND || effectiveGitConfig(binding, "core.sshCommand")) {
    failures.push("anonymous-public transport must not override the calibrated SSH host-alias path");
  }
  if (expected.sshAccount !== expected.repositoryOwner) failures.push("anonymous-public calibration must bind the dedicated SSH account to the repository owner");
  const ssh = authenticatedSshAccount(expected);
  if (!ssh.ok) failures.push(ssh.reason);
  const range = anonymousRange(binding, sourceCommit, expected);
  if (!range.ok) return [...failures, range.reason];
  for (const { commit, authorName, authorEmail, committerName, committerEmail, signature, message } of range.entries) {
    if (authorName !== expected.authorName || authorEmail !== expected.authorEmail) failures.push(`anonymous-public commit ${commit} has a non-neutral Author identity`);
    if (committerName !== expected.authorName || committerEmail !== expected.authorEmail) failures.push(`anonymous-public commit ${commit} has a non-neutral Committer identity`);
    if (signature !== "N") failures.push(`anonymous-public commit ${commit} carries a signature`);
    if (TRAILER_DENY.test(message ?? "")) failures.push(`anonymous-public commit ${commit} carries a forbidden personal/provider/private trailer`);
    if (EMAIL_IN_MESSAGE.test(message ?? "")) failures.push(`anonymous-public commit ${commit} carries an email address in its message`);
    if (PRIVATE_CORRELATION_IN_MESSAGE.test(message ?? "")) failures.push(`anonymous-public commit ${commit} carries forbidden private correlation metadata`);
    if (PRIVATE_URL_IN_MESSAGE.test(message ?? "")) failures.push(`anonymous-public commit ${commit} carries a non-canonical URL`);
    if (MACHINE_ABSOLUTE_PATH_IN_MESSAGE.test(message ?? "")) failures.push(`anonymous-public commit ${commit} carries a machine-specific absolute path`);
    if (SECRET_LIKE_VALUE_IN_MESSAGE.test(message ?? "")) failures.push(`anonymous-public commit ${commit} carries a credential-shaped value`);
  }
  return failures;
}

/**
 * Preserve the authorization primitive's primary refusal while also carrying the
 * compatibility diagnostic older operators/tests use for an unpinned v1/v2 policy.
 *
 * `*-TRUST-ANCHOR-MISSING` used to mean that this route was unavailable. Under the
 * machine-provenance TOFU contract, a registered operator key makes the route available,
 * so a proof-less action correctly fails first as `*-RECORD-INCOMPLETE`. The project still
 * has no committed anchor at that instant, though. Naming both facts is truthful provided
 * the latter is explicitly qualified as committed-project metadata rather than the primary
 * authorization verdict. A pinned policy and v3's intentional empty-set posture never get
 * this companion diagnostic.
 */
function attestationFailureDiagnostic(code, anchorDir) {
  const missingAnchorCode = code === "PUSH-PROOF-RECORD-INCOMPLETE"
    ? "PUSH-PROOF-TRUST-ANCHOR-MISSING"
    : code === "DEPLOY-PROOF-RECORD-INCOMPLETE"
      ? "DEPLOY-PROOF-TRUST-ANCHOR-MISSING"
      : null;
  if (missingAnchorCode === null) return code;

  const policy = readCriticalHumanProofPolicy(anchorDir);
  if (!policy.ok || policy.trustAnchor !== null || policy.trustAnchors !== null) return code;
  return `${code}; ${missingAnchorCode}: no committed project trust anchor exists yet, `
    + "while machine-plane TOFU remains available for a valid first proof";
}

/**
 * A policy waiver and a state record are deliberately different evidence: the
 * former proves that the repository selected the weak global posture, while the
 * latter says which exact action was chat-attributed.  Do not infer one from the
 * other.  In particular, legacy action-local chat retains its historical record
 * shape; only the committed global selector requires this explicit marker.
 */
function isTrustedGlobalChatWaiver(waiver, kind) {
  return waiver?.waived === true
    && waiver.waiver?.kind === kind
    && waiver.waiver?.mode === "chat-attributed-unattested"
    && waiver.waiver?.source === USER_SOURCE_PATH;
}

function hasGlobalChatAttribution(record, kind) {
  return record?.humanApproval?.mode === "chat-attributed-unattested"
    && record.humanApproval?.kind === kind;
}

function globalChatPushApprovalBound(approval, candidate, binding) {
  return hasGlobalChatAttribution(approval, "push")
    && approval?.criticalProofWaiver?.kind === "push"
    && approval.criticalProofWaiver?.mode === "chat-attributed-unattested"
    && approval.criticalProofWaiver?.source === USER_SOURCE_PATH
    && approval?.forCommit === candidate.commit
    && approval?.remote === binding.remote
    && approval?.destination === binding.destination;
}

/**
 * The one thing that opens the main boundary: a detached proof, verified here.
 *
 * This runs BEFORE the manifest is read, which is why it is self-contained rather than
 * reusing the later state/candidate plumbing. That eagerness is deliberate and must not
 * be traded away for tidier code: the boundary below applies even to a repository with
 * no manifest and no push gate at all, so deferring it to the gate section would hand
 * every ungoverned checkout a free push to main.
 *
 * Narrower than the boundary it excepts in exactly one respect: a destination that never
 * resolved at all stays refused here, because an attestation names a ref and a `null`
 * destination cannot be matched against it without guessing. That covers `HEAD` (a
 * symbolic ref whose target depends on the checkout) and a bare source
 * `resolveImplicitPushDestination` declined to resolve as a branch (see its own
 * docstring). It does NOT cover an ordinary `git push origin main`: since
 * PHX-WP-GUARDPUSH-REFSPEC-RESOLVE, that resolves its own destination to
 * `refs/heads/main` deterministically (no `remote.<name>.push` override, `main`
 * confirmed as a local branch, no same-named tag) before this runs, so it is admitted on
 * the same footing as the fully-qualified `git push origin main:refs/heads/main` --
 * both need a valid attestation for this exact commit, tree, remote and ref. When
 * resolution genuinely declines instead (a configured `remote.<name>.push`, a same-named
 * local tag, or a source not confirmed as a plain local branch), that stays refused here
 * too, but as a NAMED, distinct predicate (`PUSH-PROOF-DESTINATION-UNRESOLVED`) rather than
 * rendering identically to an attestation that was actually checked and failed
 * (NVA-N-PUSHDIAG) -- this boundary still does not guess at a destination it never
 * observed, it just says so plainly instead of collapsing into "no such proof verified".
 *
 * Failure of any kind — no state, no anchor, unreadable candidate — is not an exception.
 *
 * @returns {{authorized: boolean, code: string}} `code` is always a typed predicate name,
 * never free text — see the call site for how (and how NOT) it is rendered into the
 * operator-visible message. Every code below is either produced by `authorizeRecordedPush`
 * itself (`../lib/critical-action-authorization.mjs`, already documented and pinned there)
 * or, for a failure that never reached that call, one of this function's own local codes:
 * `PUSH-PROOF-BINDING-INVALID`, `PUSH-PROOF-DESTINATION-UNRESOLVED`,
 * `PUSH-PROOF-DESTINATION-MISMATCH`, `PUSH-PROOF-COMMIT-UNRESOLVED`,
 * `PUSH-PROOF-TREE-UNREADABLE`, `PUSH-PROOF-STATE-UNREADABLE`, or `PUSH-PROOF-WAIVED`
 * (the ADR-0056 §7 `chat`-mode fallback below, on success).
 */
function attestedMainPublication(binding) {
  if (!binding.ok || typeof binding.remote !== "string") return { authorized: false, code: "PUSH-PROOF-BINDING-INVALID" };
  if (binding.destination === null) return { authorized: false, code: "PUSH-PROOF-DESTINATION-UNRESOLVED" };
  if (binding.destination !== "refs/heads/main") return { authorized: false, code: "PUSH-PROOF-DESTINATION-MISMATCH" };
  const commit = resolveSourceCommit(binding);
  if (commit === null) return { authorized: false, code: "PUSH-PROOF-COMMIT-UNRESOLVED" };
  const tree = spawnSync("git", ["-C", binding.projectDir, "rev-parse", `${commit}^{tree}`], { encoding: "utf8", timeout: 5000 });
  if (tree.status !== 0 || !/^[0-9a-f]{40,64}$/i.test(tree.stdout?.trim() ?? "")) return { authorized: false, code: "PUSH-PROOF-TREE-UNREADABLE" };
  let state;
  try {
    state = JSON.parse(readFileSync(join(binding.projectDir, projectStateRelPath(binding.projectDir)), "utf8"));
  } catch {
    return { authorized: false, code: "PUSH-PROOF-STATE-UNREADABLE" };
  }
  // The anchor comes from the GOVERNED session, never from the repository the command
  // named. T6 Critic F1: `<root>/sub/project/critical-human-proof.json` is not a
  // gate-strength path, so reading the anchor from the push target let an agent mint
  // its own. PG12s13 exited 0 before this line existed.
  const anchorDir = fallbackProjectDir();
  const candidate = { commit, tree: tree.stdout.trim() };
  const waiver = criticalProofWaiverFor(anchorDir, "push");
  // The committed global chat selector resolves before any policy/anchor
  // verification.  Calling the signature verifier first would make this weak,
  // explicitly key-free route depend on the very anchor it is meant to bypass.
  if (isTrustedGlobalChatWaiver(waiver, "push")) {
    const approval = state?.pushApproval?.lastApproved;
    return globalChatPushApprovalBound(approval, candidate, binding)
      ? { authorized: true, code: "PUSH-PROOF-WAIVED" }
      : { authorized: false, code: "PUSH-PROOF-CHAT-ATTRIBUTION-MISSING" };
  }
  const attested = authorizeRecordedPush({
    projectDir: binding.projectDir,
    anchorDir,
    state,
    candidate,
    remote: binding.remote,
    destination: binding.destination,
    now: new Date().toISOString(),
  });
  if (attested.authorized === true) return { authorized: true, code: attested.code };

  // ADR-0056 §7: "every session must be able to push, on every branch and on main, when the
  // human clears it -- by signature or by chat, depending on the config." The Ed25519 lane
  // above is `signature` mode's clearance; `chat` mode clears the SAME boundary the same way
  // it already clears the ordinary branch route below -- a commit-bound approval record,
  // attributed rather than cryptographically proved, IF the record itself states it was
  // backed by this waiver. Before this, `chat` mode opened every branch except the one that
  // matters most (2026-08-06 Critic round, F4): this call was the only route into `main` and
  // it consulted no waiver at all.
  if (!waiver.waived) return { authorized: false, code: attested.code };
  const approval = state?.pushApproval?.lastApproved;
  const waiverBound = approval?.forCommit === candidate.commit
    && approval?.remote === binding.remote
    && approval?.destination === binding.destination
    && approval?.criticalProofWaiver?.kind === "push";
  return waiverBound ? { authorized: true, code: "PUSH-PROOF-WAIVED" } : { authorized: false, code: attested.code };
}

const pushBinding = parsePushBinding(cmd);
// ADR-0056 §6. main was previously unreachable by any route except the fixed
// publication executor, which made "push without a release" impossible on the branch
// that matters most. It is now reachable by exactly one route: a push the key holder
// signed for this commit, this tree, this remote and this ref. Nothing else changes —
// the executor keeps its exclusive claim on exact-candidate publication authority, and
// the anonymous-public delivery path refuses main independently a few hundred lines up.
const mainPublicationAttempt = pushBinding.ok
  && (pushBinding.destination === "refs/heads/main"
    || (pushBinding.destination === null && new Set(["main", "refs/heads/main"]).has(pushBinding.source)));
// Only evaluated when actually needed (attestedMainPublication does real git/fs work).
const mainAttestation = mainPublicationAttempt ? attestedMainPublication(pushBinding) : null;
if (mainPublicationAttempt && !mainAttestation.authorized) {
  // NVA-N-PUSHDIAG: the refusal names WHICH predicate refused, never just that one did.
  // `mainAttestation.code` is always a typed identifier (PUSH-PROOF-*), never free text --
  // it names the predicate that refused, not how to satisfy it, so it carries nothing an
  // unauthorized caller could use to learn about the anchor or key material.
  const attestationDiagnostic = attestationFailureDiagnostic(mainAttestation.code, fallbackProjectDir());
  const lines = [
    "BLOCKED (guard-push publication boundary): raw Bash/Git cannot publish refs/heads/main.",
    "Only the plugin-owned fixed publication executor may consume exact-candidate main authority; GG-03 and Human Guard Override do not widen it.",
    `The one exception is a push the human attested for this exact commit, tree, remote and ref (ADR-0056 §6); no such proof verified here (${attestationDiagnostic}).`,
  ];
  if (mainAttestation.code === "PUSH-PROOF-DESTINATION-UNRESOLVED") {
    // The colon-less form's destination could not be established at all (a configured
    // `remote.<name>.push` override, a same-named local tag, or a source not confirmed as
    // a plain local branch -- see resolveImplicitPushDestination's own docstring), so this
    // boundary never even reached an attestation check. Say so, and name the one form that
    // always resolves without guessing, rather than letting this render identically to an
    // attestation that was actually checked and failed.
    lines.push(
      "This push's destination ref could not be resolved from the colon-less form, so it was never checked against an attestation at all. Use the fully-qualified refspec instead: git push origin main:refs/heads/main.",
    );
  }
  emit(2, lines);
}
function fallbackProjectDir() {
  const candidate = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const result = spawnSync("git", ["-C", candidate, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    timeout: 5000,
  });
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : candidate;
}
const ambiguousDynamicCrossRepo =
  !pushBinding.ok &&
  pushBinding.reason === "push command contains shell expansion or glob syntax" &&
  declaresCrossRepositoryPush(cmd);
if (ambiguousDynamicCrossRepo) {
  emit(2, ["BLOCKED (guard-push, plugin pipeline-core): push target is not unambiguous; dynamic cross-repository target cannot be bound safely."]);
}
const declaredProjectDir = pushBinding.ok ? pushBinding.projectDir : resolveDeclaredPushProject(cmd);
if (!pushBinding.ok && !declaredProjectDir && declaresCrossRepositoryPush(cmd)) {
  emit(2, ["BLOCKED (guard-push, plugin pipeline-core): push target is not unambiguous; cross-repository target cannot be resolved safely."]);
}
const projectDir = declaredProjectDir ?? fallbackProjectDir();

// ---- Batman E1/E3: typed local publication authority ---------------------------------
//
// This is deliberately a READ-ONLY consumer.  `pipeline-state` is the sole writer
// for the local authorization and records the compact projection below in the normal
// tracked state file.  The full channel state stays in the local State-Writer-managed
// store; this projection contains no endpoint, identity, evidence path, or secret.
//
// A present `state.publication` is an explicit publication mode marker.  It therefore
// changes the default from the ordinary Push-Gate's configurable approval (including
// standing approval) to a closed, one-shot command grammar.  A malformed marker must
// not silently downgrade a delivery attempt into an ordinary push.
const PUBLICATION_PROJECTION_SCHEMA = "pipeline.publication-projection.v1";
const PUBLICATION_AUTHORITY_REFERENCE_SCHEMA = "pipeline.publication-authority-reference.v1";
const PUBLICATION_AUTHORIZATION_SCHEMA = "pipeline.publication-authorization.v1";
const PUBLICATION_CHANNELS = new Set(["private", "neutral-public"]);
const PUBLICATION_ID = /^[A-Za-z0-9._:@/-]{1,200}$/;
const PUBLICATION_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PUBLICATION_DIGEST = /^[0-9a-f]{64}$/;
const PUBLICATION_DESTINATION = /^refs\/heads\/[A-Za-z0-9._/-]+$/;

function exactObjectKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/**
 * Read the minimal public-to-guard projection.  The reader never repairs, consumes,
 * or otherwise mutates state: a successful writer CAS has already consumed the
 * approval before this hook can observe `push-authorized`.
 */
function readPublicationMode(dir) {
  const statePath = join(dir, projectStateRelPath(dir));
  let raw;
  try {
    raw = readFileSync(statePath, "utf8");
  } catch {
    return { active: false };
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    // A torn/corrupt State could have lost the only parseable indication that a
    // one-shot publication authorization was live.  Falling through to standing
    // approval would turn that uncertainty into an authorization bypass.
    return { active: true, error: "pipeline State is malformed; publication authority cannot be excluded" };
  }
  if (!Object.hasOwn(state, "publication")) return { active: false };
  const authority = state.publication;
  if (!exactObjectKeys(authority, ["schema", "channels", "authorizedPushes"])
    || authority.schema !== PUBLICATION_PROJECTION_SCHEMA
    || !exactObjectKeys(authority.channels, ["private", "neutral-public"])
    || !Array.isArray(authority.authorizedPushes)) {
    return { active: true, error: "publication authority marker is malformed" };
  }
  return { active: true, channels: authority.channels, authorizations: authority.authorizedPushes };
}

function publicationReferenceMatches(value, authorization) {
  if (!exactObjectKeys(value, ["schema", "transactionId", "channel", "phase", "candidateOid", "candidateTree", "destinationRef", "projectionRawSha256", "publicationStateSha256", "receiptDigest"])
    || value.schema !== PUBLICATION_AUTHORITY_REFERENCE_SCHEMA
    || value.transactionId !== authorization.transactionId
    || value.channel !== authorization.channel
    || value.phase !== "push-authorized"
    || value.publicationStateSha256 !== authorization.stateDigest
    || !PUBLICATION_OID.test(value.candidateOid ?? "")
    || !PUBLICATION_OID.test(value.candidateTree ?? "")
    || !PUBLICATION_DESTINATION.test(value.destinationRef ?? "")
    || value.destinationRef.includes("..")
    || !PUBLICATION_DIGEST.test(value.projectionRawSha256 ?? "")
    || value.receiptDigest !== null) return false;
  return authorization.command[4] === `${value.candidateOid}:${value.destinationRef}`;
}

function validatePublicationAuthorization(value) {
  if (!exactObjectKeys(value, ["schema", "channel", "transactionId", "revision", "stateDigest", "command", "authorization", "status"])
    || value.schema !== PUBLICATION_AUTHORIZATION_SCHEMA
    || !PUBLICATION_CHANNELS.has(value.channel)
    || !PUBLICATION_ID.test(value.transactionId ?? "")
    || !Number.isInteger(value.revision) || value.revision < 2
    || !PUBLICATION_DIGEST.test(value.stateDigest ?? "")
    || value.status !== "push-authorized") {
    return { ok: false, reason: "typed authorization shape is invalid" };
  }
  if (!Array.isArray(value.command) || value.command.length !== 5
    || value.command[0] !== "git" || value.command[1] !== "push"
    || value.command[2] !== "--porcelain"
    || !PUBLICATION_ID.test(value.command[3] ?? "")) {
    return { ok: false, reason: "typed authorization command is invalid" };
  }
  const refspec = value.command[4];
  const match = /^([0-9a-f]{40}|[0-9a-f]{64}):(refs\/heads\/[A-Za-z0-9._/-]+)$/.exec(refspec ?? "");
  if (!match || !PUBLICATION_OID.test(match[1]) || !PUBLICATION_DESTINATION.test(match[2]) || match[2].includes("..")) {
    return { ok: false, reason: "typed authorization refspec is invalid" };
  }
  if (!exactObjectKeys(value.authorization, ["approvalId", "consumedAt", "tupleDigest"])
    || !PUBLICATION_ID.test(value.authorization.approvalId ?? "")
    || !Number.isSafeInteger(value.authorization.consumedAt)
    || !PUBLICATION_DIGEST.test(value.authorization.tupleDigest ?? "")) {
    return { ok: false, reason: "typed authorization consumption is invalid" };
  }
  return { ok: true };
}

/** Return the semantic argv of the sole accepted publication push grammar. */
function publicationCommandFromInvocation(rawCmd, binding) {
  if (!binding?.ok) return { ok: false, reason: binding?.reason ?? "push target is not unambiguous" };
  const tokens = tokenizeArgv(rawCmd);
  let index = 1;
  if (tokens[0] !== "git") return { ok: false, reason: "publication push must invoke lowercase git directly" };
  if (tokens[index] === "-C") {
    if (!tokens[index + 1]) return { ok: false, reason: "publication git -C lacks its bound root" };
    index += 2;
  }
  const actual = [tokens[0], ...tokens.slice(index)];
  if (actual.length !== 5 || actual[1] !== "push" || actual[2] !== "--porcelain") {
    return { ok: false, reason: "publication push must be exactly git [-C <bound-root>] push --porcelain <remote> <candidate>:<full-ref>" };
  }
  if (actual[3] !== binding.remote || actual[4] !== binding.refspec) {
    return { ok: false, reason: "publication push parser binding drift" };
  }
  return { ok: true, command: actual };
}

function enforcePublicationAuthorization(mode, rawCmd, binding) {
  if (!mode.active) return;
  if (mode.error) {
    emit(2, [`BLOCKED (guard-push publication mode): ${mode.error}; ordinary/standing push approval is not a fallback.`]);
  }
  emit(2, [
    "BLOCKED (guard-push publication mode): raw Bash/Git cannot consume publication authority.",
    "Use the plugin-owned fixed publication executor; generic, standing, GG-03, and Human Guard Override authority remain closed.",
  ]);
  /*
   * The validation below remains intentionally unreachable during the schema
   * migration window. Keeping it here lets old projections receive a precise
   * malformed-state diagnosis above, while no raw command can cross the new
   * executor-only boundary.
   */
  const invocation = publicationCommandFromInvocation(rawCmd, binding);
  if (!invocation.ok) {
    emit(2, [
      `BLOCKED (guard-push publication mode): ${invocation.reason}.`,
      "Generic, standing, or differently shaped push approval cannot authorize a publication delivery.",
    ]);
  }
  const valid = [];
  for (const authorization of mode.authorizations) {
    const checked = validatePublicationAuthorization(authorization);
    if (!checked.ok) {
      emit(2, [`BLOCKED (guard-push publication mode): ${checked.reason}; typed authorization is fail-closed.`]);
    }
    const reference = mode.channels[authorization.channel];
    if (!publicationReferenceMatches(reference, authorization)) {
      emit(2, ["BLOCKED (guard-push publication mode): authorization is not bound to its redacted channel reference."]);
    }
    if (JSON.stringify(authorization.command) === JSON.stringify(invocation.command)) valid.push(authorization);
  }
  if (valid.length !== 1) {
    emit(2, [
      `BLOCKED (guard-push publication mode): exact typed authorization count is ${valid.length} (expected 1).`,
      "Generic, standing, or stale authorization cannot authorize this publication push.",
    ]);
  }
}

const publicationMode = readPublicationMode(projectDir);
enforcePublicationAuthorization(publicationMode, cmd, pushBinding);

// =====================================================================================
// DEPLOY BRANCH helpers. Pure/defensive helpers first, `runDeployBranch` (the entry
// point) last -- all `function` declarations, hoisted, order-independent.
// =====================================================================================

const TAG_REF_PREFIX = "refs/tags/";
const HEAD_REF_PREFIX = "refs/heads/";

/** A trigger pattern counts as a "tag pattern" iff it targets refs/tags/ (bare-push rule). Every other pattern is treated as a "branch pattern" (conservative: the manifest allows arbitrary strings). */
function isTagPattern(pattern) {
  return typeof pattern === "string" && pattern.startsWith(TAG_REF_PREFIX);
}

/** Dual tag/head expansion for a bare name or an unqualified `src:dst` destination. */
function dualExpansion(name) {
  return [`${TAG_REF_PREFIX}${name}`, `${HEAD_REF_PREFIX}${name}`];
}

/** Strips a known ref-type prefix for the BARE artifact-identity comparison (exact-string match against `deployApprovals[].forArtifact`). */
function bareArtifactName(qualifiedOrBare) {
  if (qualifiedOrBare.startsWith(TAG_REF_PREFIX)) return qualifiedOrBare.slice(TAG_REF_PREFIX.length);
  if (qualifiedOrBare.startsWith(HEAD_REF_PREFIX)) return qualifiedOrBare.slice(HEAD_REF_PREFIX.length);
  return qualifiedOrBare;
}

/**
 * Collects `release.adapters.<name>.trigger.refs` pattern arrays. Returns
 * `{ byAdapter: Map<adapterName, string[]>, uncertain }` -- `uncertain` is set when an
 * adapter DECLARES a `trigger` object whose `refs` cannot be read as a clean string
 * array (a corrupted trigger-pattern shape must fail TOWARD the gate, never be silently
 * read as "no patterns"). An adapter that declares NO `trigger` at all (e.g. a `local`
 * executor) contributes zero patterns WITHOUT setting `uncertain` -- that is a normal,
 * valid state, not corruption.
 */
function collectTriggerPatterns(release) {
  const byAdapter = new Map();
  let uncertain = false;
  const adapters = release?.adapters;
  if (!adapters || typeof adapters !== "object" || Array.isArray(adapters)) return { byAdapter, uncertain };
  for (const [name, adapter] of Object.entries(adapters)) {
    if (!adapter || typeof adapter !== "object") continue;
    if (adapter.trigger === undefined) continue; // no trigger declared at all -- valid, not uncertain.
    const trigger = adapter.trigger;
    const refs = trigger && typeof trigger === "object" ? trigger.refs : undefined;
    if (!Array.isArray(refs) || refs.some((r) => typeof r !== "string")) {
      uncertain = true;
      continue;
    }
    byAdapter.set(name, refs);
  }
  return { byAdapter, uncertain };
}

/** Adapter names whose trigger patterns match ANY of a candidate's expansion forms. */
function matchAdapters(expansions, byAdapter) {
  const matched = [];
  for (const [name, patterns] of byAdapter) {
    if (patterns.some((p) => expansions.some((e) => refMatchesPattern(e, p)))) matched.push(name);
  }
  return matched;
}

/** Environment names whose `release.environments.<env>.adapter` names `adapterName` AND carry `promotion: human-gate`. */
function humanGatedEnvsForAdapter(release, adapterName) {
  const envs = release?.environments;
  const result = [];
  if (!envs || typeof envs !== "object" || Array.isArray(envs)) return result;
  for (const [envName, env] of Object.entries(envs)) {
    if (!env || typeof env !== "object") continue;
    if (env.adapter === adapterName && env.promotion === "human-gate") result.push(envName);
  }
  return result;
}

/** Parses ONE refspec token (after `push`, options already skipped) into `{raw, dst, isDelete, unparseable}`. */
function parseRefspec(raw, isDelete) {
  // A leading `+` is refspec force-push syntax (`+refspec`), never part of a ref name --
  // strip it so a force-tag-push (`git push origin +v1.0.0` / `+refs/tags/v1.0.0`) is
  // trigger-classified AND artifact-matched exactly like its non-force form. guard-git
  // blocks every `+refspec` first, so this is defense-in-depth, not a live bypass.
  const ref = raw.startsWith("+") ? raw.slice(1) : raw;
  if (ref === "") return { raw, unparseable: true };
  const colonIdx = ref.indexOf(":");
  let dst;
  if (colonIdx === -1) {
    dst = ref; // bare name
  } else {
    dst = ref.slice(colonIdx + 1);
    if (dst === "") return { raw, unparseable: true }; // e.g. a delete-shorthand src-only form -- ambiguous, conservative
  }
  return { raw, dst, isDelete: Boolean(isDelete), unparseable: false };
}

/**
 * Parses the argv tokens of ONE isolated `git push …` segment (via `tokenizeArgv`) into
 * `{ candidates, tagsFlag, unparseableRefspec }`. Options are skipped by simple
 * `-`-prefix filtering (no deep per-flag-arity modeling) except the two option FORMS the
 * matching rules explicitly name: `--tags`/`--follow-tags` (tags-trigger flag) and
 * `--delete`/`-d` (excludes every candidate in this invocation from being a deploy
 * trigger -- protected-ref deletion stays guard-git territory).
 */
function parsePushSegmentTokens(tokens) {
  const pushIdx = tokens.findIndex((t) => t.toLowerCase() === "push");
  if (pushIdx === -1) return { candidates: [], tagsFlag: false, unparseableRefspec: true };

  const after = tokens.slice(pushIdx + 1);
  let tagsFlag = false;
  let deleteFlag = false;
  const positionals = [];
  for (const t of after) {
    const lower = t.toLowerCase();
    if (lower === "--tags" || lower === "--follow-tags") {
      tagsFlag = true;
      continue;
    }
    if (lower === "--delete" || lower === "-d") {
      deleteFlag = true;
      continue;
    }
    if (t.startsWith("-")) continue; // any other option token -- skipped ("options skipped")
    positionals.push(t);
  }

  if (positionals.length === 0) {
    return { candidates: [], tagsFlag, unparseableRefspec: false }; // bare push, or remote-only-no-refspec
  }
  const [, ...refspecs] = positionals; // positionals[0] = remote, unused beyond this point
  const candidates = refspecs.map((raw) => parseRefspec(raw, deleteFlag));
  const unparseableRefspec = candidates.some((c) => c.unparseable);
  return { candidates, tagsFlag, unparseableRefspec };
}

/** Splits `rawCmd` into rough shell segments and returns the ONE containing a `git push` (caller isolates the segment; `null` = zero or multiple matches -- multi-push chain). */
function isolatePushSegment(rawCmd) {
  const roughSegments = rawCmd.split(/&&|\|\||;|\|/);
  const pushSegments = roughSegments.filter((seg) => {
    const segNorm = normalizeGlobalGitOptions(stripQuotedSegments(seg).toLowerCase());
    return /\bgit\s+push\b/.test(segNorm);
  });
  return pushSegments.length === 1 ? pushSegments[0] : null;
}

/**
 * Reads `.claude/pipeline-state.json` and checks each `required` tuple
 * `{bareArtifact, environment, display}` against `state.deployApprovals`: a match needs
 * `forArtifact === bareArtifact && forEnvironment === environment` AND no `usedAt` mark.
 * Returns the list of human-readable failure lines (empty = all satisfied). A
 * malformed/unreadable state file WARNs (exit 1) immediately -- same "never
 * silent-block, never silent-pass" convention the existing approval check (c) already
 * uses for this same file elsewhere in this hook.
 */
/** The pushed candidate, resolved without the module-level bindings (see the call site). */
function deployCandidate() {
  const commit = resolveSourceCommit(pushBinding);
  if (commit === null) return null;
  const tree = spawnSync("git", ["-C", pushBinding.projectDir, "rev-parse", `${commit}^{tree}`], { encoding: "utf8", timeout: 5000 });
  return tree.status === 0 && /^[0-9a-f]{40,64}$/i.test(tree.stdout?.trim() ?? "")
    ? { commit, tree: tree.stdout.trim() }
    : null;
}

function checkDeployApprovals(required) {
  const path = join(projectDir, projectStateRelPath(projectDir));
  let raw = null;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // absent -- treated as "no approvals recorded at all" below, not malformed.
  }
  let deployApprovals = [];
  // Hoisted out of the block below: the attestation check further down needs the whole
  // state object, not just its `deployApprovals` array, because the signed intent binds
  // the plan/spec authority that lives elsewhere in the same file.
  let parsed = null;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      emit(1, [
        `[guard-push] WARN: ${path} contains invalid JSON (${e.message}).`,
        `Deploy-approval check is being skipped (fail-open on a broken state file) -- please fix ` +
          `(rewrite only via ${pipelineStateScriptRef()}, never by hand).`,
      ]);
    }
    if (parsed && typeof parsed === "object" && parsed.deployApprovals !== undefined) {
      if (!Array.isArray(parsed.deployApprovals)) {
        emit(1, [
          `[guard-push] WARN: ${path} state.deployApprovals is not an array.`,
          `Deploy-approval check is being skipped (fail-open on a broken state file) -- please fix ` +
            `(rewrite only via ${pipelineStateScriptRef()}, never by hand).`,
        ]);
      }
      deployApprovals = parsed.deployApprovals;
    }
  }
  // ADR-0056 §6, release half. The tuple match below is what this check has always been:
  // a recorded approval naming this artifact and environment, not yet consumed. What it
  // never did was look at `criticalProof` at all — so where the project demands a detached
  // proof for `deploy`, the strongest thing the release path could say about an approval
  // was that somebody had written one down. That is now the weaker of two conditions.
  //
  // Fails closed on an unreadable policy, unlike the state handling above. The two answer
  // different questions: a broken state file is a local accident and warns, while a policy
  // that cannot be read is a gate whose strength is unknown, and ADR-0055 already settles
  // that case as "required".
  // Read from the governed session root for the same reason the anchor is: a policy taken
  // from the pushed repository lets that repository decide whether it needs a proof, and a
  // nested one could simply omit `deploy` from requiredKinds. Not part of the T6 finding —
  // found while fixing it, and fixed here rather than left as the next report's F1.
  const waiver = criticalProofWaiverFor(fallbackProjectDir(), "deploy");
  const globalChat = isTrustedGlobalChatWaiver(waiver, "deploy");
  let proofDemanded = false;
  if (!globalChat) {
    const policy = readCriticalHumanProofPolicy(fallbackProjectDir());
    if (!policy.ok) {
      return [`Deploy approval policy cannot be read (${policy.code}); a gate of unknown strength is treated as demanding proof.`];
    }
    proofDemanded = policy.requiredKinds.has("deploy") && !policy.waivers.has("deploy");
  }
  // Resolved locally rather than through the module-level `sourceCommit`/`resolveSourceTree`
  // pair: this function runs from the deploy branch, which executes BEFORE either of those
  // bindings is initialized. Reaching for them here would be a temporal-dead-zone throw on
  // every deploy-triggering push, i.e. a crash rather than a decision.
  const candidate = proofDemanded ? deployCandidate() : null;
  const now = new Date().toISOString();

  const reasons = [];
  for (const req of required) {
    const match = deployApprovals.find(
      (a) => a && a.forArtifact === req.bareArtifact && a.forEnvironment === req.environment && !a.usedAt,
    );
    if (!match) {
      reasons.push(
        `Environment '${req.environment}': no unused deployApproval for artifact '${req.display}' -- record it: ` +
          `node ${pipelineStateScriptRef()} approve-deploy --env ${req.environment} --artifact <tag-or-sha> --by <name>.`,
      );
      continue;
    }
    if (globalChat) {
      if (!hasGlobalChatAttribution(match, "deploy")
        || match?.criticalProofWaiver?.kind !== "deploy"
        || match.criticalProofWaiver?.mode !== "chat-attributed-unattested"
        || match.criticalProofWaiver?.source !== USER_SOURCE_PATH) {
        reasons.push(
          `Environment '${req.environment}': the deployApproval for artifact '${req.display}' lacks the required chat-attributed-unattested record for this global chat configuration.`,
        );
      }
      continue;
    }
    if (!proofDemanded) continue;
    const attested = candidate === null || parsed === null
      ? { authorized: false, code: "DEPLOY-PROOF-CANDIDATE-UNRESOLVED" }
      : authorizeRecordedDeploy({
        projectDir,
        anchorDir: fallbackProjectDir(), // governed session root -- see attestedMainPublication
        state: parsed,
        candidate,
        artifact: req.bareArtifact,
        environment: req.environment,
        now,
      });
    if (!attested.authorized) {
      const attestationDiagnostic = attestationFailureDiagnostic(attested.code, fallbackProjectDir());
      reasons.push(
        `Environment '${req.environment}': the deployApproval for artifact '${req.display}' is not externally attested ` +
          `for this exact candidate (${attestationDiagnostic}). Re-record it with --proof-request/--proof-authority/--proof.`,
      );
    }
  }
  return reasons;
}

/**
 * The deploy branch entry point. Called ONLY when `release` is a present, well-shaped
 * object. May call `emit(2, …)` directly (never returns in that case); otherwise returns
 * `{ invalidityNote }`: non-null ONLY for fail-matrix case B (semantic-invalid
 * manifest, release present, push NOT deploy-triggering): the caller prepends this note
 * to whatever message the pre-existing checks (a)/(b)/(c) end up emitting, never
 * mode-gates or exits here itself ("fall through" case).
 */
function runDeployBranch(release, manifestResult, cmd) {
  const segment = isolatePushSegment(cmd);
  if (segment === null) {
    emit(2, [
      `BLOCKED (guard-push deploy branch, plugin pipeline-core): the push command cannot be split unambiguously ` +
        `into exactly ONE git-push segment in a release-declaring repo (release section present) (zero or more ` +
        `than one occurrence) -- conservatively blocked (fail-toward-the-gate).`,
      `Please use exactly one \`git push\` per command invocation (no second push chained via &&/;/|).`,
    ]);
  }

  const tokens = tokenizeArgv(segment);
  const parsed = parsePushSegmentTokens(tokens);
  if (parsed.unparseableRefspec) {
    emit(2, [
      `BLOCKED (guard-push deploy branch, plugin pipeline-core): the refspec in the push command cannot be ` +
        `evaluated deterministically in a release-declaring repo -- conservatively blocked (fail-toward-the-gate). ` +
        `Please name the source/destination ref explicitly and unambiguously.`,
    ]);
  }

  const { byAdapter, uncertain } = collectTriggerPatterns(release);
  const allPatterns = [...byAdapter.values()].flat();
  const hasBranchPattern = allPatterns.some((p) => !isTagPattern(p));
  const hasTagPattern = allPatterns.some(isTagPattern);

  if (parsed.candidates.length === 0 && !parsed.tagsFlag) {
    // Bare push, or remote given but no explicit refspec -- zero candidates.
    if (hasBranchPattern) {
      emit(2, [
        `BLOCKED (guard-push deploy branch, plugin pipeline-core): \`git push\` without an explicit remote/ref in ` +
          `a repo with a branch-shaped deploy trigger -- conservatively blocked.`,
        `Please name the remote and ref explicitly (e.g. \`git push origin <ref>\`).`,
      ]);
    }
    // else: tag-only trigger patterns (or none at all) -- a bare push never pushes tags, ALLOWED, not a trigger.
  }

  let isDeployTriggering = false;
  const requiredApprovals = []; // { bareArtifact, environment, display }

  if (parsed.tagsFlag && hasTagPattern) {
    for (const [name, patterns] of byAdapter) {
      if (!patterns.some(isTagPattern)) continue;
      isDeployTriggering = true;
      for (const env of humanGatedEnvsForAdapter(release, name)) {
        // No single named artifact for a bulk `--tags` push -- `bareArtifact: null` can
        // never match a stored deployApproval (the CLI refuses a blank/null --artifact),
        // so this always fails the approval check for a human-gated env: a deliberate,
        // conservative reading of an otherwise-unaddressed combination.
        requiredApprovals.push({ bareArtifact: null, environment: env, display: "--tags (all tags)" });
      }
    }
  }

  for (const c of parsed.candidates) {
    if (c.isDelete) continue; // --delete forms are NOT deploy triggers.
    const expansions =
      c.dst.startsWith(TAG_REF_PREFIX) || c.dst.startsWith(HEAD_REF_PREFIX) ? [c.dst] : dualExpansion(c.dst);
    const matchedAdapters = matchAdapters(expansions, byAdapter);
    if (matchedAdapters.length === 0) continue;
    isDeployTriggering = true;
    const bareArtifact = bareArtifactName(c.dst);
    for (const name of matchedAdapters) {
      for (const env of humanGatedEnvsForAdapter(release, name)) {
        requiredApprovals.push({ bareArtifact, environment: env, display: bareArtifact });
      }
    }
  }

  if (uncertain) isDeployTriggering = true; // corrupted trigger-pattern data -- fail toward the gate.

  if (manifestResult.status === "invalid") {
    if (isDeployTriggering) {
      // Case A: unconditional block -- no mode qualifier, no deployApproval carve-out
      // (an approval binds a config whose validity cannot be established).
      const reason = manifestFindingText(manifestResult.errors?.[0]);
      emit(2, [
        `BLOCKED (guard-push deploy branch, plugin pipeline-core): ${projectManifestRelPath(projectDir)} is semantically invalid ` +
          `(${reason}) AND this push is deploy-triggering (release section present) -- unconditional block, no ` +
          `mode exception.`,
        `Finding(s) (${manifestResult.errors?.length ?? 0}):`,
        ...(manifestResult.errors ?? []).map((e, i) => `  ${i + 1}. ${manifestFindingText(e)}`),
        `Fix: correct the manifest, or (in mandate mode) record a valid docs/risks.md deviation.`,
      ]);
    }
    // Case B: NOT deploy-triggering -- fall through to the normal push-gate checks; the
    // caller prepends this note to whatever message those checks end up emitting.
    const reason = manifestFindingText(manifestResult.errors?.[0]);
    return {
      invalidityNote:
        `[guard-push] WARN: ${projectManifestRelPath(projectDir)} is semantically invalid (${reason}) -- release section ` +
        `present, the push-gate check still runs normally instead of fail-opening.`,
    };
  }

  // manifestResult.status === "ok" -- the normal path.
  if (isDeployTriggering) {
    // A declared-but-malformed central policy fail-closes deploy-triggering pushes
    // unconditionally, with no mode inspection (loadDeployPolicy discards the parsed
    // object on failure, so `mode` is unrecoverable anyway).
    const policyResult = loadDeployPolicy(projectDir, manifestResult.manifest);
    if (policyResult.status === "malformed") {
      emit(2, [
        `BLOCKED (guard-push deploy branch, plugin pipeline-core): the central deploy policy is declared but ` +
          `unreadable/invalid (${policyResult.detail}) -- deploy-triggering push fail-closed blocked, ` +
          `unconditional (no mode carve-out).`,
        `Fix: repair deploy-policy.yaml (path: governance.policies_path from the manifest).`,
      ]);
    }
    // The deployApproval check -- evaluated EVEN under gates.push.approval ===
    // "standing-approved" (the standing push approval never covers a deploy trigger;
    // this branch never even reads gates.push, so the carve-out is automatic).
    if (requiredApprovals.length > 0) {
      const failures = checkDeployApprovals(requiredApprovals);
      if (failures.length > 0) {
        emit(2, [
          `BLOCKED (guard-push deploy branch, plugin pipeline-core): the push touches a deploy-triggering ref to ` +
            `a human-gated environment without a matching unused deployApproval (${failures.length} finding(s)):`,
          ...failures.map((f, i) => `  ${i + 1}. ${f}`),
        ]);
      }
    }
  }

  return { invalidityNote: null };
}

// ---- ADR-0078 D5: a release tag must be reachable from origin/main ------------------
//
// Deliberately UNCONDITIONAL -- evaluated for every recognized push regardless of
// manifest/push-gate configuration, exactly like the main-publication-boundary check
// above, and BEFORE the manifest-absent opt-in exit just below. `stable` (`ruleset-
// freshness.mjs`) selects the highest final release tag in the whole repository with no
// ancestry check of its own (that is D5's own reasoning for NOT adding one to the
// resolver); this is the write-time half that makes that read-time trust legitimate. The
// objects a release-tag push touches are already local, so this never costs a network
// round trip.
//
// Mirrors ruleset-freshness.mjs's `validTag` grammar exactly (same numeric definition --
// no leading zeros) so this hook and the channel resolver never drift into two different
// definitions of "release tag".
const RELEASE_TAG_NUMERIC = "(?:0|[1-9]\\d*)";
const RELEASE_TAG_REF = new RegExp(
  `^refs/tags/v${RELEASE_TAG_NUMERIC}\\.${RELEASE_TAG_NUMERIC}\\.${RELEASE_TAG_NUMERIC}(?:-beta\\.${RELEASE_TAG_NUMERIC})?$`,
  "u",
);

/**
 * `binding` is the module-level `pushBinding` (single, unambiguous remote+refspec).
 * `releaseSection` is `manifestResult.manifest?.release` (possibly `undefined`/`null` --
 * manifest absent, or absent/malformed release section; both mean "no adapters declared,
 * nothing to defer to"). A multi-refspec push, a bulk `--tags` push, and a `--delete`
 * push are all OUT OF SCOPE here for the same reason: `parsePushBinding` already refuses
 * to set `binding.ok` for any of them (an option outside its narrow safe-flag allowlist,
 * or more than one positional), so they fall through unaffected -- AC-4's branch/delete/
 * non-release-tag "nothing else changes" is therefore automatic rather than something
 * this function has to special-case.
 */
function checkReleaseTagAncestry(binding, releaseSection) {
  if (!binding.ok) return;
  const { dst } = parseRefspec(binding.refspec, false);
  if (!dst) return;

  let tagRef;
  if (dst.startsWith(TAG_REF_PREFIX)) {
    tagRef = dst;
  } else if (dst.startsWith(HEAD_REF_PREFIX)) {
    return; // explicit branch destination -- never a tag (AC-4).
  } else {
    // Bare name: git's own ref DWIM lookup for an unqualified push source checks
    // refs/tags/<name> BEFORE refs/heads/<name> (resolveImplicitPushDestination's own
    // docstring above records this precedence) -- mirror it instead of assuming branch.
    const localTag = spawnSync(
      "git", ["-C", binding.projectDir, "show-ref", "--verify", "--quiet", `${TAG_REF_PREFIX}${dst}`],
      { timeout: 5000 },
    );
    if (localTag.status !== 0) return; // no local tag by this name -- not a tag push here.
    tagRef = `${TAG_REF_PREFIX}${dst}`;
  }
  if (!RELEASE_TAG_REF.test(tagRef)) return; // AC-4: a non-release tag is unaffected.

  // Defer entirely to the pre-existing deploy-trigger / deployApproval mechanism when
  // this exact push ALSO matches a declared release adapter's trigger pattern: "who may
  // push this artifact to which environment" is that mechanism's own, independently
  // tested question, not this one, and D5 does not reach into it -- it only fills the gap
  // that mechanism leaves for the plain channel-tag case (no adapter cares about this ref
  // at all). This repo's own manifest (project/pipeline.yaml) declares no `release`
  // section, so this carve-out never applies to the actual self-application case D5
  // exists for; it only ever matters for a project that separately runs both mechanisms
  // over the same ref name.
  if (releaseSection) {
    const { byAdapter } = collectTriggerPatterns(releaseSection);
    if (matchAdapters([tagRef], byAdapter).length > 0) return;
  }

  // Peels an annotated tag object down to the commit it targets (AC-4) via the exact same
  // helper the ordinary source-commit check further below reuses, so there is only ONE
  // peeling rule in this file rather than two that could drift apart.
  const tagCommit = resolveSourceCommit(binding);
  if (!tagCommit) {
    emit(2, [
      `BLOCKED (guard-push release-tag ancestry, plugin pipeline-core): release tag '${tagRef}' does not resolve ` +
        `to a commit locally, so its reachability from refs/remotes/origin/main (ADR-0078 D5) cannot be verified.`,
      "A release-tag push whose own target cannot be established locally must never be waved through as if it had been checked.",
      "Fix: confirm the tag/commit exists locally (run `git fetch origin main` first if it was only ever seen on the remote), then retry.",
    ]);
  }

  const originMain = spawnSync(
    "git", ["-C", binding.projectDir, "show-ref", "--verify", "--quiet", "refs/remotes/origin/main"],
    { timeout: 5000 },
  );
  if (originMain.status !== 0) {
    // AC-2 (ADR-0078 D5 correction, NVA-B-TAGFIX -- replaces the earlier fail-closed
    // AC-3 comment here): absence of refs/remotes/origin/main means main is not the
    // published line in THIS repository, and D5 governs a repository where it is. This
    // hook ships in plugins/pipeline-core/ to every consumer project, and a guard must
    // not impose one repository's branch topology on another -- failing closed made a
    // legitimate release-tag push permanently impossible, with no working remedy, in
    // any repository whose remote has no main branch at all. Returning here instead of
    // refusing is the accepted trade, and its residual cost is recorded rather than
    // hidden: an operator who has simply never fetched origin/main in a repository
    // where main IS the published line loses this check for that one push.
    return;
  }

  const ancestry = spawnSync(
    "git", ["-C", binding.projectDir, "merge-base", "--is-ancestor", tagCommit, "refs/remotes/origin/main"],
    { timeout: 5000 },
  );
  if (ancestry.status === 0) return; // reachable from main -- ALLOWED, unchanged behaviour.

  if (ancestry.status === 1) {
    emit(2, [
      `BLOCKED (guard-push release-tag ancestry, plugin pipeline-core): release tag '${tagRef}' targets commit ` +
        `${tagCommit}, which is not reachable from refs/remotes/origin/main.`,
      "Under ADR-0078 D5, main is the only published channel and a release tag must sit on it -- otherwise " +
        "`stable` would select a commit that was never actually released.",
      "Fix: cut the tag from a commit that is already on main (land/merge it there first), then retag.",
    ]);
  }

  // Any other exit status -- the ancestry command itself failed to run cleanly (e.g. a
  // corrupted object). AC-3: the same fail-closed treatment as a missing origin/main,
  // never a silent pass.
  emit(2, [
    `BLOCKED (guard-push release-tag ancestry, plugin pipeline-core): the reachability check for release tag ` +
      `'${tagRef}' (commit ${tagCommit}) against refs/remotes/origin/main failed to run (ADR-0078 D5).`,
    "Fix: run `git fetch origin main` and retry.",
  ]);
}

// ---- manifest: gate config (fail-open on absent, WARN on genuinely unreadable) -----
const manifestResult = loadManifest(projectDir);
// Evaluated BEFORE the manifest-absent opt-in exit just below (unconditional, matching
// the main-publication-boundary check) -- `manifestResult.manifest?.release` is `undefined`
// when the manifest is absent or carries no release section, which the function above
// already treats as "no adapters declared, nothing to defer to".
checkReleaseTagAncestry(pushBinding, manifestResult.manifest?.release);
if (manifestResult.status === "absent") process.exit(0); // opt-in feature, nothing configured

const releaseSection = manifestResult.manifest?.release;
const hasRelease = Boolean(releaseSection) && typeof releaseSection === "object" && !Array.isArray(releaseSection);

if (manifestResult.status === "invalid" && !hasRelease) {
  const reason = manifestFindingText(manifestResult.errors?.[0]);
  emit(1, [
    `[guard-push] WARN: ${projectManifestRelPath(projectDir)} is invalid (${reason}).`,
    `Push-Gate is being skipped (fail-open, never silently marked blocking/passing) -- please fix.`,
  ]);
}

const manifest = manifestResult.manifest;
const pushGate = gateConfig(manifest, "push");
const guardActive = hasRelease || (pushGate && pushGate.mode !== "off");
if (!guardActive) process.exit(0);

if (!pushBinding.ok) {
  emit(2, [
    "BLOCKED (guard-push, plugin pipeline-core): push target is not unambiguous.",
    `Reason: ${pushBinding.reason}.`,
  ]);
}

let invalidityNote = null;
if (hasRelease) {
  const outcome = runDeployBranch(releaseSection, manifestResult, cmd);
  invalidityNote = outcome.invalidityNote;
}

const sourceCommit = resolveSourceCommit(pushBinding);
if (!sourceCommit) {
  emit(2, ["BLOCKED (guard-push, plugin pipeline-core): the explicit push source does not resolve to one commit."]);
}

function portableCleanupBaselineFailure(binding, commit) {
  const selectedState = projectStateRelPath(binding.projectDir);
  let shown = spawnSync(
    "git",
    ["-C", binding.projectDir, "show", `${commit}:${selectedState}`],
    { encoding: "utf8", timeout: 5000 },
  );
  if (shown.status !== 0) {
    const compatibilityState = selectedState === NEUTRAL_STATE ? LEGACY_STATE : NEUTRAL_STATE;
    shown = spawnSync(
      "git",
      ["-C", binding.projectDir, "show", `${commit}:${compatibilityState}`],
      { encoding: "utf8", timeout: 5000 },
    );
  }
  // Projects without portable Pipeline State retain the guard's historical
  // behavior. Once the State exists at the exact pushed commit, malformed
  // Continuity or a machine-local binding is a hard publication defect.
  if (shown.status !== 0) return null;
  let state;
  try {
    state = JSON.parse(String(shown.stdout));
  } catch {
    return "published Pipeline State is not valid JSON";
  }
  const continuity = state?.continuity;
  if (continuity === undefined || continuity === null) return null;
  if (!continuity || typeof continuity !== "object" || Array.isArray(continuity)
    || !continuity.runtime || typeof continuity.runtime !== "object"
    || Array.isArray(continuity.runtime)
    || !Object.hasOwn(continuity.runtime, "sessionCleanup")) {
    return "published Pipeline Continuity has no unambiguous runtime.sessionCleanup baseline";
  }
  return continuity.runtime.sessionCleanup === null
    ? null
    : "published Pipeline Continuity still binds a machine-local sessionCleanup handle";
}

const portableCleanupFailure = portableCleanupBaselineFailure(pushBinding, sourceCommit);
if (portableCleanupFailure) {
  emit(2, [`BLOCKED (guard-push, plugin pipeline-core): ${portableCleanupFailure}.`]);
}

/**
 * The hook host can run from the primary checkout even when the shell command
 * originates in a linked worktree.  An explicit attached branch is therefore
 * authoritative for evidence location: resolve it through Git's own worktree
 * registry and only use the matching worktree when it still resolves to the
 * exact pushed commit.  Detached/OID sources retain the bound command project.
 */
function resolveEvidenceProject(binding, commit) {
  const symbolic = spawnSync("git", ["-C", binding.projectDir, "rev-parse", "--symbolic-full-name", "--verify", "--end-of-options", binding.source], {
    encoding: "utf8",
    timeout: 5000,
  });
  const sourceRef = symbolic.status === 0 ? symbolic.stdout?.trim() : "";
  // Git's resolved symbolic ref, rather than the command spelling, determines
  // whether this is an attached branch source.  A short branch name therefore
  // receives the same exact-worktree/OID binding as refs/heads/<branch>, while
  // detached and literal-OID sources retain the bound command project.
  if (!sourceRef.startsWith("refs/heads/")) {
    return { ok: true, projectDir: binding.projectDir };
  }

  const listed = spawnSync("git", ["-C", binding.projectDir, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (listed.status !== 0) {
    return { ok: false, reason: "the explicit source branch worktree registry cannot be resolved" };
  }

  let worktree = null;
  for (const block of listed.stdout.split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    const branch = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length);
    if (path && branch === sourceRef) {
      worktree = path;
      break;
    }
  }
  if (!worktree) {
    return { ok: false, reason: "the explicit source branch has no matching attached worktree" };
  }
  const head = spawnSync("git", ["-C", worktree, "rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (head.status !== 0 || head.stdout?.trim() !== commit) {
    return { ok: false, reason: "the explicit source branch worktree does not resolve to the pushed source commit" };
  }
  return { ok: true, projectDir: worktree };
}

const evidenceProject = resolveEvidenceProject(pushBinding, sourceCommit);
if (!evidenceProject.ok) {
  emit(2, [`BLOCKED (guard-push, plugin pipeline-core): ${evidenceProject.reason}.`]);
}
const evidenceProjectDir = evidenceProject.projectDir;

if (!pushGate || pushGate.mode === "off") {
  // Fall-matrix case B with NO active push gate: still surface the semantic-invalidity
  // WARN instead of exiting silently (pre-existing behavior emitted WARN for any push on
  // an invalid manifest). `invalidityNote` is null on every non-case-B path, so a valid
  // manifest keeps exiting 0 unchanged.
  if (invalidityNote) emit(1, [invalidityNote]);
  process.exit(0);
}

/** Reads + JSON-parses an evidence file; returns {ok:true, data} | {ok:false, reason}. */
function readEvidence(relPath) {
  const p = join(evidenceProjectDir, relPath);
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return { ok: false, reason: `${relPath} missing` };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: `${relPath} is corrupted (invalid JSON: ${e.message})` };
  }
  return { ok: true, data, relPath };
}

/** Runs the shared exitCode===0 + commit===pushed-source check; returns failure reasons (empty = pass). */
function checkEvidenceFreshness(relPath) {
  const failures = [];
  const read = readEvidence(relPath);
  if (!read.ok) {
    failures.push(read.reason);
    return failures;
  }
  const { data } = read;
  if (data?.exitCode !== 0) {
    failures.push(`${relPath}: exitCode=${JSON.stringify(data?.exitCode)} (expected 0)`);
  }
  if (data?.commit !== sourceCommit) {
    failures.push(`${relPath}: commit=${JSON.stringify(data?.commit)} is stale (pushed source commit: ${sourceCommit})`);
  }
  return failures;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

// Memoized: `undefined` = not yet resolved. `checkSecurityEvidenceBinding` (v1, below)
// and the v2 call site (`checkSecurityCompleteness`'s caller, further down) both need "the
// pushed source commit's tree OID" -- this makes that ONE `git rev-parse ...^{tree}`
// call shared instead of each computing it independently (Finding 5, CYB-2F
// self-application Critic review 2026-07-30: the duplication was itself a hidden second
// source of truth for what "the pushed source tree" means, not just wasted work).
let cachedSourceTree;
function resolveSourceTree() {
  if (cachedSourceTree === undefined) {
    const tree = spawnSync("git", ["-C", evidenceProjectDir, "rev-parse", `${sourceCommit}^{tree}`], { encoding: "utf8", timeout: 5000 });
    cachedSourceTree = tree.status === 0 ? tree.stdout.trim() : null;
  }
  return cachedSourceTree;
}

function checkSecurityEvidenceBinding() {
  const failures = checkEvidenceFreshness("evidence/security-latest.json");
  const read = readEvidence("evidence/security-latest.json");
  if (!read.ok) return failures;
  const { data } = read;
  const sourceTree = resolveSourceTree();
  const candidate = data?.candidate;
  if (data?.schema !== "pipeline.security-evidence.v1") failures.push("evidence/security-latest.json: exact-candidate security evidence v1 is required");
  if (!candidate || candidate.status !== "clean") failures.push("evidence/security-latest.json: candidate binding is unavailable or dirty");
  if (candidate?.commit !== sourceCommit) failures.push("evidence/security-latest.json: candidate commit does not match the pushed source");
  if (!sourceTree || candidate?.tree !== sourceTree) failures.push("evidence/security-latest.json: candidate tree does not match the pushed source");
  if (!validSha256(candidate?.inputSha256)) failures.push("evidence/security-latest.json: candidate input digest is invalid");
  if (!validSha256(candidate?.repositorySha256)) failures.push("evidence/security-latest.json: candidate repository identity is invalid");
  if (!Number.isSafeInteger(candidate?.inventory?.entries) || candidate.inventory.entries < 0
    || candidate.inventory.symlinkPolicy !== "reject" || candidate.inventory.submodulePolicy !== "reject") {
    failures.push("evidence/security-latest.json: candidate inventory policy is invalid");
  }
  if (candidate?.snapshot?.method !== "git-detached-worktree.v1" || candidate.snapshot.verifiedBeforeAfter !== true) {
    failures.push("evidence/security-latest.json: immutable snapshot was not verified before and after scanning");
  }
  if (!validSha256(data?.policy?.configurationSha256) || !validSha256(data?.policy?.sha256)) {
    failures.push("evidence/security-latest.json: policy binding is invalid");
  }
  const { payloadSha256, ...payload } = data ?? {};
  if (!validSha256(payloadSha256) || payloadSha256 !== createHash("sha256").update(canonicalJson(payload)).digest("hex")) {
    failures.push("evidence/security-latest.json: payload digest is invalid");
  }
  return [...new Set(failures)];
}

/**
 * AGY-MKTATTEST-1 (Direction 3, backlog: 2026-08-24-verify-marketplace-attestation-
 * blocks-normal-active-development.md): the live comparison between THIS machine's
 * external local-marketplace copy (ADR-0052; typically
 * ~/agent-pipeline-local-marketplace/plugins/pipeline-core) and this checkout was
 * previously asserted inside `human-guard-override.test.mjs`'s F1 case (run by every
 * `verify.mjs` invocation) and therefore went red on every ordinary commit touching
 * `plugins/pipeline-core/**` during active development, not only on real drift. That
 * ONE assertion is now downgraded to a visible WARN inside the test file -- the
 * underlying security property (an agent cannot falsely claim the external marketplace
 * matches the checkout) still needs to be true at the moment it is actually
 * load-bearing, publication, so it becomes a hard push-time check here instead. Reuses
 * `externalLocalMarketplaceObservation()` (via `localPluginInstallSourceObservation()`,
 * which threads the checkout's own plugin-source tree hash into it) -- the SAME
 * attestation the test suite exercises, never a second, independently written
 * comparison.
 *
 * Only active for a Pipeline SOURCE checkout (`isPipelineSourceRoot`); a downstream
 * consumer project never registers `agent-pipeline-local` for itself, so this check is
 * inert there -- matching the backlog item's own "never for a downstream consumer
 * project" concern for the auto-sync direction it rejected.
 *
 * Deliberately does NOT reuse `criticalProofWaiverFor`/`readCriticalHumanProofPolicy`
 * (a considered deviation from the design doc's "adding a second instance of a pattern
 * that already exists" framing): that machinery models a human's detached proof of
 * INTENT, and there is no proof a human could sign for "the rsync copy on this machine
 * currently matches" -- it is a live environment fact, not an attested decision. This
 * check instead reuses the plainer collected-failure shape checks (a)/(b.1)/(c) above
 * already use, dispatched under the same `gates.push.mode`.
 *
 * A "verified" or typed "unobserved" (`registry-unavailable`/`not-registered`) result is
 * silent-pass -- neither is itself evidence of a mismatch, matching
 * `externalLocalMarketplaceObservation()`'s own documented semantics ("An entry that
 * records no source locates nothing. That is an ABSENT observation, not a mismatch").
 * Only a thrown `HGO-EXTERNAL-MARKETPLACE` (a genuine content/registration mismatch)
 * becomes a finding. Any OTHER exception (e.g. `HGO-PLUGIN-SOURCE` from this checkout's
 * OWN plugin-source tree being broken -- a distinct concern this dispatch was not
 * scoped to design a bespoke handler for) is deliberately let through uncaught, so the
 * existing terminal fault boundary (PUSHBOUND-1, the `catch (faultError)` below) maps it
 * through the SAME `gates.push.mode` dispatch every other unanticipated fault in this
 * evaluation already gets, rather than a second, ad-hoc failure path here.
 */
function checkMarketplaceAttestation() {
  if (!humanGuardOverrideInternals.isPipelineSourceRoot(evidenceProjectDir)) return [];
  let observation;
  try {
    observation = humanGuardOverrideInternals.localPluginInstallSourceObservation({ root: evidenceProjectDir });
  } catch (error) {
    if (error instanceof HumanGuardOverrideError && error.code === "HGO-EXTERNAL-MARKETPLACE") {
      return [
        `Marketplace attestation (AGY-MKTATTEST-1): this machine's external local-marketplace copy does not match ` +
        `this checkout's plugins/pipeline-core (${error.message}). Re-sync the external local-marketplace copy ` +
        `(ADR-0052) with this checkout before pushing, or confirm no stale local marketplace is registered.`,
      ];
    }
    throw error;
  }
  void observation; // "verified"/"unobserved" -- see header comment; neither is a finding.
  return [];
}

/**
 * NVA-W1-SCRATCHBIND (backlog: 2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-
 * calls-it.md, Point 3): a READ-ONLY, non-blocking advisory surfaced only on the all-green
 * push path -- never a new finding pushed into `failures`/`securityFailures`, and never able
 * to make a push block. Reuses `planOrphanScratchRetirement` exactly as it was already built
 * for this purpose (no `mkdirSync`, no `physicalScratchRoot` call -- read-only by construction,
 * mirroring this file's own `{ create: false }` discipline for other evidence reads).
 *
 * Operates on `fallbackProjectDir()` (the governed session root), not `projectDir` (the pushed
 * repository): scratch/ descriptors are bound to the session's own working repo -- the same
 * root every other piece of push-gate evidence in this file already resolves from (see the
 * ADR-0056 waiver / external-push-ledger comments above for the identical projectDir-vs-
 * fallbackProjectDir() distinction).
 *
 * Fails open unconditionally: any fault in the observer itself (not a git repo, no descriptor
 * directory yet, a malformed descriptor) is swallowed and yields no advisory, never a block --
 * this function can only ever return `null` or an advisory string, never throw.
 *
 * Surfaces only `sessionId` and the already-relative `scratchRelativePath` (e.g.
 * "scratch/abc-1234") -- never the absolute `descriptorPath` the observer also returns, which
 * would leak a machine-local directory layout into a message that travels into the session
 * transcript (SEC-01, the same discipline this file already applies to operand text elsewhere).
 */
function buildScratchOrphanAdvisory(rootDir) {
  let entries;
  try {
    entries = planOrphanScratchRetirement({ rootDir });
  } catch {
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const orphans = entries.filter((entry) => entry?.status === "orphan");
  if (orphans.length === 0) return null;
  const summary = orphans
    .map((entry) => `${entry.sessionId} (${entry.scratchRelativePath ?? "path unavailable"})`)
    .join(", ");
  return `[guard-push] ADVISORY (non-blocking): ${orphans.length} orphaned scratch descriptor(s) `
    + `found: ${summary}. These are swept automatically on a future pipeline-start bootstrap; `
    + "no action is required to push.";
}

const failures = [];
// PUSHWARN-1 (backlog: a warn security gate hard-blocks every push): security findings
// -- (b)/(b.2) below -- are collected separately so they can be dispatched under
// `gates.security.mode` instead of `gates.push.mode` (see header, step 5/7). `securityGate`
// itself is assigned inside the try block below but declared here so the final dispatch,
// which runs after that block, can still read its mode.
const securityFailures = [];
let securityGate = null;

// ---- terminal fault boundary (PUSHBOUND-1 / issue #100 AC3) --------------------------
// Everything below builds `failures` for THIS authority-bearing evaluation. An
// exception escaping any of it must never fall through to Node's own default
// uncaught-exception exit (code 1 -- a WARNING in this hook family's semantics,
// exactly the outcome a configured BLOCKING gate must never produce on an
// unanticipated fault). The catch below maps any escape through the SAME mode
// dispatch the normal all-checks-collected path further down already uses
// (`pushGate.mode === "warn"` stays non-blocking -- AC4 -- everything else fails
// closed), so a fault can never be MORE permissive than a genuine finding would
// have been.
try {
  // TEST-ONLY FAULT INJECTION (PUSHBOUND-1): guard-push.test.mjs invokes this file
  // as its own subprocess, so the only way to prove the catch below maps an
  // ARBITRARY escaped exception -- not merely one of the already-guarded bad shapes
  // the PG11* fixtures pin -- to the correct exit code is to make this exact
  // evaluation genuinely throw. Equivalent in spirit to the `deps.crashAt`
  // fault-injection seam already used the same way in
  // ../lib/onboarding-continuity.mjs, adapted for a hook that runs as its own
  // process rather than an imported function. Inert unless BOTH the exact env var
  // name AND the exact sentinel value are set; it can only route into the SAME
  // fail-closed/non-blocking dispatch a real fault would, never into an allow, so it
  // cannot be used to bypass the gate even if somehow set outside a test.
  if (process.env.PIPELINE_GUARD_PUSH_TEST_FAULT === "PUSHBOUND-1-inject") {
    throw new Error("PUSHBOUND-1 injected test fault");
  }

  // (a) verify evidence -- always checked once the push gate is active.
  failures.push(...checkEvidenceFreshness(VERIFY_EVIDENCE_DEFAULT_PATH));

  // (b) security evidence -- only when a security gate is configured and not "off".
  // PUSHWARN-1: pushed into securityFailures, NOT failures -- this bucket is dispatched
  // under gates.security.mode at the final dispatch below, independent of gates.push.mode.
  securityGate = gateConfig(manifest, "security");
  if (securityGate && securityGate.mode !== "off") {
    securityFailures.push(...checkSecurityEvidenceBinding());

    // (b.2) v2 policy-complete verdict -- additive, same trigger as (b), never replacing
    // its severity-based authority (CYB-2F; see this file's header "V2 POLICY-COMPLETE
    // VERDICT" paragraph and `checkSecurityCompleteness`'s own header comment in
    // ../lib/security-completeness-gate.mjs, CYB-2I-0). Reuses the single
    // `resolveSourceTree()` computation `checkSecurityEvidenceBinding()` above may already
    // have triggered (Finding 5) -- never a second independent `git rev-parse`.
    securityFailures.push(
      ...checkSecurityCompleteness({ projectDir: evidenceProjectDir, commit: sourceCommit, tree: resolveSourceTree() }),
    );
  }

  // Methodological Agent Guard: Block push if there are uncommitted files in specs/, docs/, or backlog/
  const uncommittedCheck = spawnSync("git", ["status", "--porcelain", "--", "specs", "docs", "backlog"], { encoding: "utf8", cwd: evidenceProjectDir });
  if (uncommittedCheck.status === 0 && uncommittedCheck.stdout.trim().length > 0) {
    failures.push(
      "Uncommitted changes detected in specs/, docs/, or backlog/. Agents often forget to commit new files because 'git commit -a' ignores untracked files. Review your 'git status' and commit these files before pushing."
    );
  }

  // (b.1) self-application-only anonymous public range and dedicated authenticated
  // SSH-account evidence. The close ritual repeats this preflight immediately before
  // the actual network operation, then fetches the pushed ref from a fresh repository.
  failures.push(...checkAnonymousPublicPush(pushBinding, sourceCommit));

  // (c) approval.
  if (pushGate.approval === "standing-approved") {
    // auto-pass, no state needed at all.
  } else {
    // "required", or the field absent entirely -- treated as the safer default (a push
    // gate that is active at all, with no explicit standing-approval, should not
    // silently skip the approval check).
    const stateRelPath = projectStateRelPath(projectDir);
    const statePath = join(projectDir, stateRelPath);
    let stateRaw;
    let stateExists = true;
    try {
      stateRaw = readFileSync(statePath, "utf8");
    } catch {
      stateExists = false;
    }
    if (!stateExists) {
      failures.push(`Push approval missing: ${stateRelPath} does not exist (never recorded via approve-push).`);
    } else {
      let state;
      try {
        state = JSON.parse(stateRaw);
      } catch (e) {
        failures.push(
          `Push approval state is malformed: ${stateRelPath} contains invalid JSON (${e.message}). ` +
          `Rewrite only via ${pipelineStateScriptRef()}; publication remains blocked.`,
        );
      }
      const approval = state?.pushApproval?.lastApproved;
      const forCommit = approval?.forCommit;
      if (!forCommit || forCommit !== sourceCommit) {
        failures.push(
          `Push approval missing or stale: state.pushApproval.lastApproved.forCommit=${JSON.stringify(
            forCommit ?? null,
          )}, expected pushed source commit=${JSON.stringify(sourceCommit)}. Record: node ${pipelineStateScriptRef()} approve-push --by <name> --remote <remote> --destination <full-ref>. NOTE: with gates.push.approval "required" this state record is NECESSARY BUT NOT SUFFICIENT -- the critical-proof check below is independent and also applies. A pushApproval in mutable state is never executable authority on its own.`,
        );
      } else if (approval?.remote !== pushBinding.remote || approval?.destination !== pushBinding.destination) {
        // PUSHBIND-1 (backlog: push-approval-general-mode-lane-does-not-bind-remote-or-destination,
        // 2026-08-18): this general-mode check used to test `forCommit` alone. The
        // stricter `authorizeRecordedPush` call below already binds remote/destination
        // for the non-waived lane, but a waived/chat approval (the fallthrough a few
        // lines down, once `pushWaiver.waived` is true and the record names it) never
        // reaches that call, so the SAME approved commit could authorize a push to a
        // DIFFERENT remote/destination than the one it was actually approved for.
        // `approve-push` always records `remote`/`destination` (chat mode included --
        // see pipeline-state.mjs's approve-push case), so this binding check is always
        // meaningful once `forCommit` itself already matches. Mirrors the identical
        // binding `attestedMainPublication`'s own chat fallback already performs for
        // `refs/heads/main` specifically (`approval?.remote === binding.remote &&
        // approval?.destination === binding.destination`), now enforced for every
        // destination, not only main.
        //
        // Operand text is deliberately NOT interpolated here, for the same SEC-01 reason
        // documented at the `authorizeRecordedPush` call below: `remote` is any positional
        // the command supplied, so it can be a credential-bearing URL that must not travel
        // into stderr/session transcript. The operator does not need the values echoed
        // back -- they are in the command and the approval record they already hold.
        failures.push(
          "Push approval is bound to a different remote or destination than this push: " +
          "state.pushApproval.lastApproved.remote/destination do not match this push's target. " +
          `Record a fresh approval bound to this exact remote and destination: node ${pipelineStateScriptRef()} ` +
          "approve-push --by <name> --remote <remote> --destination <full-ref>.",
        );
      }
      // H-AC-12 dual-evaluation, wired in `lib/change-control.mjs`'s exact opt-in shape: this
      // block is reached ONLY when the recorded approval carries a `decisionReference` key at
      // all (`Object.hasOwn`, same test `evaluateChangeControlGate` uses for its optional
      // `pipelineAuthority.decisionReference`). Absent -- which is every approval any writer
      // produces today -- nothing here runs and check (c) stays byte-for-byte what it was.
      //   `legacyOk` is the pre-existing commit-bound record verdict computed immediately
      // above (`forCommit === sourceCommit`), NOT a hardcoded true: it can be false, so the
      // two readers can genuinely disagree in EITHER direction and both directions fail closed.
      //   The second reader resolves the canonical decision reference against what this guard
      // can independently observe about the push actually being attempted: its candidate commit
      // AND tree (the legacy record binds the commit only), and the repository fingerprint of
      // the governed session root. `fallbackProjectDir()`, never `projectDir` -- reading the
      // fingerprint from the PUSHED repository would let a nested target repository mint its own
      // anchor, the same T6-F1 root cause the ADR-0055 waiver below and the external-ledger
      // check already read from the session root for.
      //   Shape validation lives inside the shared primitive (`isDecisionReference`), which
      // resolves a malformed reference as "the second reader disagrees" instead of throwing:
      // an uncaught throw in this hook exits 1, which this hook's harness treats as ALLOW,
      // silently discarding every other accumulated failure (same reasoning as the
      // `discoverRepository` catch below). The compatibility owner and expiry are read off the
      // evaluation result and named in the operator-visible failure, per H-AC-12's second
      // sentence -- carried, not silently enforced as a cutover (see the primitive's header).
      if (approval !== null && typeof approval === "object" && Object.hasOwn(approval, "decisionReference")) {
        const evaluation = dualEvaluateDecisionReference({
          legacyOk: Boolean(forCommit) && forCommit === sourceCommit,
          reference: approval.decisionReference,
          resolveReference: (reference) => {
            const referenceTree = resolveSourceTree();
            if (referenceTree === null) return false; // candidate unresolvable -> cannot confirm
            let fingerprint;
            try {
              const repository = discoverRepository(fallbackProjectDir(), { timeout: 5000 });
              fingerprint = derivePoGateRepositoryFingerprint({
                gitCommonDir: repository.commonDir,
                primaryRoot: repository.primaryRoot,
              });
            } catch {
              return false; // topology unresolved -> the second reader cannot confirm -> disagreement
            }
            return reference.candidate.commit === sourceCommit
              && reference.candidate.tree === referenceTree
              && reference.checkpoint.repositoryFingerprint === fingerprint;
          },
        });
        if (!evaluation.ok) {
          // Operand text is deliberately NOT interpolated (SEC-01, same as the attestation
          // failure below): only booleans and the compatibility metadata travel into the
          // transcript.
          failures.push(
            "Push approval decision reference disagrees with the recorded approval "
            + `(H-AC-12 dual-evaluation: legacy=${evaluation.legacyOk}, decision-reference=${evaluation.ledgerOk}; `
            + `compatibility owner "${evaluation.compat.owner}", expiry `
            + `${new Date(evaluation.compat.expiresAtEpochMs).toISOString()}). The canonical decision ID must `
            + "reference and validate THIS candidate commit, tree and repository before the push becomes "
            + `effective. Re-record it: node ${pipelineStateScriptRef()} approve-push ... `
            + "--decision-reference <repo-relative-json>.",
          );
        }
      }
      // ADR-0055: the project may stand the private-key proof down for `push` with an
      // explicit, reasoned waiver. The human gate itself still applies — the approval
      // above must still be recorded and bound to THIS commit — but a waived project
      // does not additionally need the detached proof, and therefore does not need the
      // publication executor to carry the push. An unreadable policy answers "required".
      // Governed session root, not the pushed repository. The waiver decides whether the
      // detached proof is demanded at all, so reading it from the target would let the target
      // stand its own gate down -- a `.v2` push waiver or a committed `push_approval: chat` in
      // a nested repository would do it. Same root cause as the anchor (T6 F1); the fix
      // belongs in both places or in neither.
      const pushWaiver = criticalProofWaiverFor(fallbackProjectDir(), "push");
      const globalChatPush = isTrustedGlobalChatWaiver(pushWaiver, "push");
      if (pushGate.approval === "required" && globalChatPush
        && !globalChatPushApprovalBound(approval, { commit: sourceCommit }, pushBinding)) {
        failures.push(
          "Push approval is not chat-attributed-unattested for this exact commit, remote and destination ref.",
        );
      }
      if (pushGate.approval === "required" && !pushWaiver.waived) {
        // ADR-0056 §6. This branch used to refuse EVERY agent-issued push and point at the
        // fixed publication executor. That was safe and unusable: publication is a release
        // path, and an ordinary feature branch needs to be pushable without one, so
        // `signature` mode meant "no session can ever push" rather than "a session can push
        // what the human signed".
        //
        // The permission is granted by verification, never by the record's word. See
        // ../lib/critical-action-authorization.mjs for why believing
        // `pushApproval.lastApproved` would have silently demoted `signature` to `chat`.
        // A policy failure keeps its own code so the operator sees which half is broken.
        const sourceTree = resolveSourceTree();
        const attested = sourceTree === null
          ? { authorized: false, code: "PUSH-PROOF-CANDIDATE-UNRESOLVED" }
          : authorizeRecordedPush({
            projectDir,
            anchorDir: fallbackProjectDir(), // governed session root -- see attestedMainPublication
            state,
            candidate: { commit: sourceCommit, tree: sourceTree },
            remote: pushBinding.remote,
            destination: pushBinding.destination,
            now: new Date().toISOString(),
          });
        if (!attested.authorized) {
          const attestationDiagnostic = attestationFailureDiagnostic(attested.code, fallbackProjectDir());
          failures.push(
            pushWaiver.code === null
              // Operand text is deliberately NOT interpolated here. `remote` is any positional
            // the command supplied, so it can be a credential-bearing URL, and this message
            // travels into the session transcript and from there into persisted artifacts
            // (SEC-01). The file already redacts elsewhere for exactly this reason (PG17i);
            // that fixture cannot reach this line, so PG12s15 covers it. The operator does
            // not need the values echoed back -- they are in the command they just ran.
            ? `Push approval is not externally attested for this exact action (${attestationDiagnostic}). `
                + `Record one for this commit, remote and destination ref: node ${pipelineStateScriptRef()} `
                + "approve-push --by <name> --remote <remote> --destination <full-ref> "
                + "--proof-request <path> --proof-authority <path> --proof <path>."
              : `Push approval critical proof is unavailable: project/critical-human-proof.json is ${pushWaiver.code}.`,
          );
        } else if (externalPushLedgerGate(fallbackProjectDir()) !== "off") {
          // PHX-2 additive external ledger (opt-in, see design doc §2/§5). AND-ed onto the
          // base signature attestation above -- evaluated only once `attested.authorized` is
          // already true, since there is nothing to consume-check if the base proof did not
          // verify. `fallbackProjectDir()` (not `manifest`, and NOT `projectDir` -- WP5-phx2-
          // rework-1, F5) is passed deliberately: `manifest` here is project/pipeline.yaml's
          // already-loaded content (nested `gates.push.approval` shape), a different file from
          // `pipeline.user.yaml`'s flat `gates.push_external_ledger` this gate actually lives
          // in -- passing `manifest` would silently never find the key. `projectDir` is the
          // PUSHED repository, not the governed session root -- exactly the same distinction
          // the ADR-0056 waiver check above (`pushWaiver`) already reads from
          // `fallbackProjectDir()`, not `projectDir`, for: reading it from the pushed
          // repository would let a pushed repository's own committed
          // `gates.push_external_ledger: "off"` stand this gate down for a session whose own
          // root has it required. Same root cause as the anchor (T6 F1) and the waiver above;
          // the fix belongs in both places or in neither.
          let repository = null;
          try {
            repository = discoverRepository(fallbackProjectDir(), { timeout: 5000 });
          } catch {
            // discoverRepository throws on >=7 paths (missing/symlinked start path, git spawn
            // failure/non-zero exit incl. WT-GIT-SPAWN, submodule/`--separate-git-dir` common-dir
            // shape, missing primary root -- worktree-lifecycle.mjs). This file has no ambient
            // try/catch around this integration point, and per hooks.json's own exit-code
            // contract (0 allow, 2 block, 1 allow+warn), an UNCAUGHT throw here exits the
            // process at 1 -- which this hook's own harness treats as ALLOW, silently
            // discarding every other already-accumulated failure in `failures`. This catch is
            // the fail-closed disposition that replaces that uncaught-throw path.
            failures.push(
              "External push ledger repository topology could not be resolved "
              + "(PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED). Push refused -- this is a fail-closed "
              + "disposition, never a silent pass-through and never an uncaught throw.",
            );
          }
          if (repository !== null) {
            const ledgerCheck = checkExternalPushLedgerConsumption({
              repositoryFingerprint: derivePoGateRepositoryFingerprint({
                gitCommonDir: repository.commonDir,
                primaryRoot: repository.primaryRoot,
              }),
              proofSha256: state.pushApproval.lastApproved.criticalProof.proofSha256,
              candidate: { commit: sourceCommit, tree: sourceTree },
            });
            if (!ledgerCheck.ok) {
              failures.push(
                `External push ledger consumption is ${ledgerCheck.code}. Record it with: `
                + `node ${pipelineStateScriptRef()} approve-push ... `
                + "(the same command that already records pushApproval now also writes this).",
              );
            }
          }
        }
      } else if (pushGate.approval === "required" && approval?.criticalProofWaiver?.kind !== "push") {
        // Waived by policy, but the recorded approval does not say so: it was recorded
        // under a different policy than the one in force now. Re-approve deliberately.
        failures.push(
          "Push approval predates the current critical-proof waiver; re-record it with " +
          `node ${pipelineStateScriptRef()} approve-push so the record states what backed it.`,
        );
      }
    }
  }

  // (d) marketplace attestation (AGY-MKTATTEST-1) -- see checkMarketplaceAttestation()
  // above for the full rationale and scope.
  failures.push(...checkMarketplaceAttestation());
} catch (faultError) {
  // The evaluation above faulted before producing a `failures` verdict at all. Map
  // it through the SAME mode dispatch the normal collected-findings path below uses
  // -- "warn" keeps its documented non-blocking semantics unchanged (AC4); anything
  // else (mode "blocking", or any future unrecognized non-"off" value -- the same
  // "errs safe" rule the pre-existing dispatch already applies) fails CLOSED. The
  // diagnostic never swallows the fault silently, and never carries the raw message
  // or stack (SEC-01) -- see `sanitizedFaultDiagnostic` above for why.
  const detail = sanitizedFaultDiagnostic(faultError);
  if (pushGate.mode === "warn") {
    emit(1, [
      `[guard-push] WARN: the Push-Gate evaluation faulted unexpectedly (${detail}).`,
      `Mode "warn" keeps this non-blocking; please investigate and re-run once fixed.`,
    ]);
  }
  emit(2, [
    `BLOCKED (guard-push, plugin pipeline-core): the Push-Gate evaluation faulted unexpectedly (${detail}).`,
    `This authority-bearing gate fails closed on an unanticipated fault -- the push is blocked until the underlying issue is fixed.`,
  ]);
}

const allFailures = [...failures, ...securityFailures];
if (allFailures.length === 0) {
  // NVA-W1-SCRATCHBIND: advisory only -- see buildScratchOrphanAdvisory's own doc comment.
  // emit(1, ...) still ALLOWS the push (hooks.json's own exit-code contract: 1 = allow +
  // config warning, shown to the user); the process.exit(0) below is reached only when there
  // is nothing to advise.
  const scratchAdvisory = buildScratchOrphanAdvisory(fallbackProjectDir());
  if (scratchAdvisory !== null) emit(1, [scratchAdvisory]);
  process.exit(0); // all-green -- allow
}

// PUSHWARN-1: each bucket's severity follows its OWN gate's mode, never the other
// gate's. `failures` (verify evidence, anonymous-public-push, approval) follows
// gates.push.mode, exactly as before this fix; `securityFailures` follows
// gates.security.mode instead. Either bucket demanding "blocking" makes the whole push
// block; only when every bucket carrying a finding is "warn" does the push stay
// non-blocking.
const pushBlocking = failures.length > 0 && pushGate.mode !== "warn";
const securityBlocking = securityFailures.length > 0 && securityGate?.mode !== "warn";

const message = [
  invalidityNote, // case B: non-null only for a semantic-invalid manifest with a release
  // section whose push is NOT deploy-triggering -- prepended, `emit`'s own
  // `.filter(Boolean)` drops it cleanly on every other path (`invalidityNote` stays null).
  `BLOCKED (guard-push, plugin pipeline-core): Push-Gate check failed (${allFailures.length} finding(s)):`,
  ...allFailures.map((f, i) => `  ${i + 1}. ${f}`),
];

if (pushBlocking || securityBlocking) emit(2, message); // some bucket demands blocking
emit(1, message); // every failing bucket here is configured "warn" -- non-blocking
