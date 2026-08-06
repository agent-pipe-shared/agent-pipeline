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
 * only reuses guard-git's SHARED normalization helpers (`stripQuotedSegments`,
 * `normalizeGlobalGitOptions` from `../lib/git-cmd.mjs`) so push-command detection
 * can never drift out of sync with guard-git's own understanding of what a "git push"
 * looks like (quoted prose, chained commands, global git options).
 *
 * PUSH DETECTION: `/\bgit\s+push\b/` tested against the quote-stripped, lowercased,
 * global-option-normalized command — no anchors, so it matches "in ANY command
 * segment" without needing an explicit split on `&&`/`;`/`|` (the same effect guard-
 * git.mjs achieves with its own segment-scoped `[^|&;]*` regexes, just for a single
 * "is there a push at all" question rather than per-segment flag matching).
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
 *      every reason at once instead of a frustrating fix-one-fail-next loop.
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
 *   7. Any check failed -> mode "blocking" -> exit 2; mode "warn" -> exit 1. Same
 *      collected message either way.
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
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { loadManifest, gateConfig, loadDeployPolicy } from "../lib/manifest.mjs";
import { authorizeRecordedDeploy, authorizeRecordedPush } from "../lib/critical-action-authorization.mjs";
import { criticalProofWaiverFor, readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { stripQuotedSegments, normalizeGlobalGitOptions, tokenizeArgv, refMatchesPattern } from "../lib/git-cmd.mjs";
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

function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
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
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  rawCommand = String(input?.tool_input?.command ?? "");
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!rawCommand) process.exit(0);

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

// ---- push detection (shared normalization with guard-git.mjs) ----------------------
const stripped = stripQuotedSegments(cmd);
const normalized = normalizeGlobalGitOptions(stripped.toLowerCase());
/**
 * Everything a here-document feeds to a command is DATA, not command text, but it
 * arrives inside the raw command string and survives quote-stripping. Remove each
 * heredoc body so push detection reads the command, not its payload.
 *
 * SAFETY PROPERTIES, each of which a previous version got wrong and shipped fail-OPEN:
 *  - the opener token itself is removed, so the same `<<TAG` can never be re-matched;
 *  - the scan continues past the removal instead of restarting, so it terminates;
 *  - a newline REPLACES every removed region, so `…<<EOF…EOF\ngit push` cannot be
 *    glued into `…git push` without a word boundary and slip past `\bgit\s+push\b`;
 *  - stripping happens ONLY for an opener whose terminator line actually exists. A
 *    `<<` with no terminator is NOT treated as a heredoc and nothing is removed, so a
 *    non-redirection `<<` -- an arithmetic left shift such as `$(( 1 << shift ))` --
 *    cannot swallow the rest of the command. An earlier version claimed the
 *    whitespace-prefix rule prevented this; it does not, because a spaced arithmetic
 *    shift has exactly that shape, and that version shipped fail-OPEN for it;
 *  - the loop is bounded, and on exhaustion the ORIGINAL string is used, so a
 *    pathological input degrades to over-detection (fail-closed), never under.
 */
const commandRegion = (() => {
  const opener = /(^|\s)<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/u;
  let text = normalized;
  for (let pass = 0; pass < 64; pass += 1) {
    const match = opener.exec(text);
    if (match === null) return text;
    const openerStart = match.index + match[1].length;
    const afterOpener = match.index + match[0].length;
    const bodyStart = text.indexOf("\n", afterOpener);
    if (bodyStart === -1) {
      // An opener with no body: drop the opener token only.
      text = `${text.slice(0, openerStart)}\n${text.slice(afterOpener)}`;
      continue;
    }
    const terminator = new RegExp(`\\n[ \\t]*${match[3]}[ \\t]*(?=\\n|$)`, "u");
    const rest = text.slice(bodyStart);
    const found = rest.match(terminator);
    // No terminator line: this is not a here-document. Treating it as one would let
    // any `<<` delete the remainder of the command -- the arithmetic-shift fail-open.
    // Strip nothing and detect against the whole command instead.
    if (found === null) return normalized;
    text = `${text.slice(0, openerStart)}\n${text.slice(bodyStart + found.index + found[0].length)}`;
  }
  // Bounded-scan exhaustion: fall back to the unstripped command. Over-detection is
  // the safe direction; this is the branch that must never silently open the gate.
  return normalized;
})();
const rawDetectionTokens = tokenizeArgv(cmd);
// Skip a leading `NAME=value` run and an optional `env`, so `FOO=bar git push` and
// `env git push` are still detected POSITIONALLY.  These were previously caught only
// by the whole-string substring test removed below; dropping that test without this
// would have weakened detection rather than narrowed it.
const detectionTokens = (() => {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(rawDetectionTokens[index] ?? "")) index += 1;
  if (/^env(?:\.exe)?$/i.test(rawDetectionTokens[index] ?? "")) {
    index += 1;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(rawDetectionTokens[index] ?? "")) index += 1;
  }
  return index === 0 ? rawDetectionTokens : rawDetectionTokens.slice(index);
})();
const directExecutable = /^(?:git|git\.exe)$/i.test(detectionTokens[0] ?? "");
const directPush =
  directExecutable &&
  (detectionTokens[1]?.toLowerCase() === "push" ||
    (detectionTokens[1] === "-C" && detectionTokens[2] && detectionTokens[3]?.toLowerCase() === "push"));
const shellWrapperPush = /^(?:(?:ba|z|da)?sh|pwsh|powershell|cmd|ssh)(?:\.exe)?$/i.test(detectionTokens[0] ?? "") &&
  detectionTokens.some((token) => /\bgit(?:\.exe)?(?:\s+-C\s+\S+)?\s+push\b/i.test(token));
// The whole-string test below is load-bearing: it catches forms the positional
// detectors cannot see, such as `git --git-dir=<path> push` and repeated `-C`
// overrides, which `normalizeGlobalGitOptions` folds away for exactly this purpose.
// It is applied to `commandRegion` rather than the raw normalization so that a
// heredoc BODY -- data, not command -- can no longer be mistaken for a push. That
// misclassification made it impossible to commit or document push policy in one
// command; it was fail-closed, so never unsafe, only obstructive.
const isPush = /\bgit\s+push\b/.test(commandRegion) || directPush || shellWrapperPush;
if (!isPush) process.exit(0); // fast path: not a push at all

/**
 * Bind one push invocation to one repository and one source commit.  This is
 * intentionally a small accepted grammar: a guard cannot prove evidence freshness
 * for a shell bundle, an implicit/default refspec, a bulk push, or repository
 * overrides with different git-dir/work-tree semantics.
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
  const destination = colon === -1 ? null : refspec.slice(colon + 1);
  if (!remote || !source || (colon !== -1 && !destination) || source.startsWith("+")) {
    return { ok: false, reason: "push refspec is deleting, forced, or otherwise source-ambiguous" };
  }

  const shellCwd = process.cwd();
  const candidateDir = gitC ? (isAbsolute(gitC) ? gitC : resolve(shellCwd, gitC)) : shellCwd;
  const rootResult = spawnSync("git", ["-C", candidateDir, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (rootResult.status !== 0 || !rootResult.stdout?.trim()) {
    return { ok: false, reason: "push repository cannot be resolved to a non-bare worktree" };
  }
  return { ok: true, projectDir: rootResult.stdout.trim(), source, destination, remote, refspec };
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
      let candidate = process.cwd();
      let pushIndex = gitIndex + 1;
      if (tokens[gitIndex + 1] === "-C" && tokens[gitIndex + 2]) {
        candidate = isAbsolute(tokens[gitIndex + 2]) ? tokens[gitIndex + 2] : resolve(process.cwd(), tokens[gitIndex + 2]);
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
 * The one thing that opens the main boundary: a detached proof, verified here.
 *
 * This runs BEFORE the manifest is read, which is why it is self-contained rather than
 * reusing the later state/candidate plumbing. That eagerness is deliberate and must not
 * be traded away for tidier code: the boundary below applies even to a repository with
 * no manifest and no push gate at all, so deferring it to the gate section would hand
 * every ungoverned checkout a free push to main.
 *
 * Deliberately narrower than the boundary it excepts. Only the EXPLICIT destination form
 * is admitted; `git push origin main`, where the destination is implied by the remote's
 * configuration rather than written down, stays refused. An attestation names a ref, and
 * a command that does not name one cannot be matched against it without guessing.
 *
 * Failure of any kind — no state, no anchor, unreadable candidate — is not an exception.
 */
function attestedMainPublication(binding) {
  if (!binding.ok || typeof binding.remote !== "string" || binding.destination !== "refs/heads/main") return false;
  const commit = resolveSourceCommit(binding);
  if (commit === null) return false;
  const tree = spawnSync("git", ["-C", binding.projectDir, "rev-parse", `${commit}^{tree}`], { encoding: "utf8", timeout: 5000 });
  if (tree.status !== 0 || !/^[0-9a-f]{40,64}$/i.test(tree.stdout?.trim() ?? "")) return false;
  let state;
  try {
    state = JSON.parse(readFileSync(join(binding.projectDir, projectStateRelPath(binding.projectDir)), "utf8"));
  } catch {
    return false;
  }
  return authorizeRecordedPush({
    projectDir: binding.projectDir,
    // The anchor comes from the GOVERNED session, never from the repository the command
    // named. T6 Critic F1: `<root>/sub/project/critical-human-proof.json` is not a
    // gate-strength path, so reading the anchor from the push target let an agent mint
    // its own. PG12s13 exited 0 before this line existed.
    anchorDir: fallbackProjectDir(),
    state,
    candidate: { commit, tree: tree.stdout.trim() },
    remote: binding.remote,
    destination: binding.destination,
    now: new Date().toISOString(),
  }).authorized === true;
}

const pushBinding = parsePushBinding(cmd);
if (pushBinding.ok
  && (pushBinding.destination === "refs/heads/main"
    || (pushBinding.destination === null && new Set(["main", "refs/heads/main"]).has(pushBinding.source)))
  // ADR-0056 §6. main was previously unreachable by any route except the fixed
  // publication executor, which made "push without a release" impossible on the branch
  // that matters most. It is now reachable by exactly one route: a push the key holder
  // signed for this commit, this tree, this remote and this ref. Nothing else changes —
  // the executor keeps its exclusive claim on exact-candidate publication authority, and
  // the anonymous-public delivery path refuses main independently a few hundred lines up.
  && !attestedMainPublication(pushBinding)) {
  emit(2, [
    "BLOCKED (guard-push publication boundary): raw Bash/Git cannot publish refs/heads/main.",
    "Only the plugin-owned fixed publication executor may consume exact-candidate main authority; GG-03 and Human Guard Override do not widen it.",
    "The one exception is a push the human attested for this exact commit, tree, remote and ref (ADR-0056 §6); no such proof verified here.",
  ]);
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
          `(rewrite only via harness/scripts/pipeline-state.mjs, never by hand).`,
      ]);
    }
    if (parsed && typeof parsed === "object" && parsed.deployApprovals !== undefined) {
      if (!Array.isArray(parsed.deployApprovals)) {
        emit(1, [
          `[guard-push] WARN: ${path} state.deployApprovals is not an array.`,
          `Deploy-approval check is being skipped (fail-open on a broken state file) -- please fix ` +
            `(rewrite only via harness/scripts/pipeline-state.mjs, never by hand).`,
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
  const policy = readCriticalHumanProofPolicy(fallbackProjectDir());
  if (!policy.ok) {
    return [`Deploy approval policy cannot be read (${policy.code}); a gate of unknown strength is treated as demanding proof.`];
  }
  const proofDemanded = policy.requiredKinds.has("deploy") && !policy.waivers.has("deploy");
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
          `node harness/scripts/pipeline-state.mjs approve-deploy --env ${req.environment} --artifact <tag-or-sha> --by <name>.`,
      );
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
      reasons.push(
        `Environment '${req.environment}': the deployApproval for artifact '${req.display}' is not externally attested ` +
          `for this exact candidate (${attested.code}). Re-record it with --proof-request/--proof-authority/--proof.`,
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

// ---- manifest: gate config (fail-open on absent, WARN on genuinely unreadable) -----
const manifestResult = loadManifest(projectDir);
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

const failures = [];

// (a) verify evidence -- always checked once the push gate is active.
failures.push(...checkEvidenceFreshness("evidence/verify-latest.json"));

// (b) security evidence -- only when a security gate is configured and not "off".
const securityGate = gateConfig(manifest, "security");
if (securityGate && securityGate.mode !== "off") {
  failures.push(...checkSecurityEvidenceBinding());

  // (b.2) v2 policy-complete verdict -- additive, same trigger as (b), never replacing
  // its severity-based authority (CYB-2F; see this file's header "V2 POLICY-COMPLETE
  // VERDICT" paragraph and `checkSecurityCompleteness`'s own header comment in
  // ../lib/security-completeness-gate.mjs, CYB-2I-0). Reuses the single
  // `resolveSourceTree()` computation `checkSecurityEvidenceBinding()` above may already
  // have triggered (Finding 5) -- never a second independent `git rev-parse`.
  failures.push(
    ...checkSecurityCompleteness({ projectDir: evidenceProjectDir, commit: sourceCommit, tree: resolveSourceTree() }),
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
        `Rewrite only via harness/scripts/pipeline-state.mjs; publication remains blocked.`,
      );
    }
    const approval = state?.pushApproval?.lastApproved;
    const forCommit = approval?.forCommit;
    if (!forCommit || forCommit !== sourceCommit) {
      failures.push(
        `Push approval missing or stale: state.pushApproval.lastApproved.forCommit=${JSON.stringify(
          forCommit ?? null,
        )}, expected pushed source commit=${JSON.stringify(sourceCommit)}. Record: node harness/scripts/pipeline-state.mjs approve-push --by <name> --remote <remote> --destination <full-ref>. NOTE: with gates.push.approval "required" this state record is NECESSARY BUT NOT SUFFICIENT -- the critical-proof check below is independent and also applies. A pushApproval in mutable state is never executable authority on its own.`,
      );
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
        failures.push(
          pushWaiver.code === null
            ? `Push approval is not externally attested for this exact action (${attested.code}). `
              + `Record one: node harness/scripts/pipeline-state.mjs approve-push --by <name> --remote ${pushBinding.remote} `
              + `--destination ${pushBinding.destination} --proof-request <path> --proof-authority <path> --proof <path>.`
            : `Push approval critical proof is unavailable: project/critical-human-proof.json is ${pushWaiver.code}.`,
        );
      }
    } else if (pushGate.approval === "required" && approval?.criticalProofWaiver?.kind !== "push") {
      // Waived by policy, but the recorded approval does not say so: it was recorded
      // under a different policy than the one in force now. Re-approve deliberately.
      failures.push(
        "Push approval predates the current critical-proof waiver; re-record it with " +
        "node harness/scripts/pipeline-state.mjs approve-push so the record states what backed it.",
      );
    }
  }
}

if (failures.length === 0) process.exit(0); // all-green -- allow

const message = [
  invalidityNote, // case B: non-null only for a semantic-invalid manifest with a release
  // section whose push is NOT deploy-triggering -- prepended, `emit`'s own
  // `.filter(Boolean)` drops it cleanly on every other path (`invalidityNote` stays null).
  `BLOCKED (guard-push, plugin pipeline-core): Push-Gate check failed (${failures.length} finding(s)):`,
  ...failures.map((f, i) => `  ${i + 1}. ${f}`),
];

if (pushGate.mode === "warn") emit(1, message);
emit(2, message); // mode "blocking" (or any unrecognized non-"off" value -- errs safe)
