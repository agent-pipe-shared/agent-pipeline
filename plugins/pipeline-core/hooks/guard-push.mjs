#!/usr/bin/env node
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
 * VERIFY: node plugins/pipeline-core/hooks/guard-push.test.mjs
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { loadManifest, gateConfig, loadDeployPolicy } from "../lib/manifest.mjs";
import { stripQuotedSegments, normalizeGlobalGitOptions, tokenizeArgv, refMatchesPattern } from "../lib/git-cmd.mjs";

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
let cmd = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  cmd = String(input?.tool_input?.command ?? "");
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!cmd) process.exit(0);

// ---- push detection (shared normalization with guard-git.mjs) ----------------------
const stripped = stripQuotedSegments(cmd);
const normalized = normalizeGlobalGitOptions(stripped.toLowerCase());
const detectionTokens = tokenizeArgv(cmd);
const directExecutable = /^(?:git|git\.exe)$/i.test(detectionTokens[0] ?? "");
const directPush =
  directExecutable &&
  (detectionTokens[1]?.toLowerCase() === "push" ||
    (detectionTokens[1] === "-C" && detectionTokens[2] && detectionTokens[3]?.toLowerCase() === "push"));
const shellWrapperPush = /^(?:(?:ba|z|da)?sh|pwsh|powershell|cmd|ssh)(?:\.exe)?$/i.test(detectionTokens[0] ?? "") &&
  detectionTokens.some((token) => /\bgit(?:\.exe)?(?:\s+-C\s+\S+)?\s+push\b/i.test(token));
const isPush = /\bgit\s+push\b/.test(normalized) || directPush || shellWrapperPush;
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
const TRAILER_DENY = /^(?:co-authored-by|signed-off-by|reviewed-by|assisted-by|provider|model|session|run|trace|private(?:-account)?|account|operator|machine|host|workspace|worktree)\s*:/im;
const EMAIL_IN_MESSAGE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PRIVATE_CORRELATION_IN_MESSAGE = /\b(?:provider|model|session|account|operator|codex|claude|openai|anthropic|gpt(?:[-\s]?[a-z0-9.]+)?|gemini|machine|host|workspace|worktree|correlation|trace(?:[-\s]?id)?|run[-\s]?id)\b/i;
const PRIVATE_URL_IN_MESSAGE = /\b[a-z][a-z0-9+.-]*:\/\/\S+|\b(?:git|ssh)@[A-Za-z0-9.-]+:[^\s]+/i;
const MACHINE_ABSOLUTE_PATH_IN_MESSAGE = /(?:^|[\s"'`])(?:\/[A-Za-z0-9._-]+(?:\/|$)|[A-Za-z]:[\\/]|\\\\[^\\\s]+[\\/])/m;
const SECRET_LIKE_VALUE_IN_MESSAGE = /\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{12,})\b/;

function localGitConfig(binding, key) {
  const result = spawnSync("git", ["-C", binding.projectDir, "config", "--local", "--get", key], {
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
  const path = join(binding.projectDir, ".claude", "pipeline.json");
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
  const log = spawnSync(
    "git",
    ["-C", binding.projectDir, "log", "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%G?%x1f%B%x1e", "--no-notes", `${baseCommit}..${sourceCommit}`],
    { encoding: "utf8", timeout: 5000 },
  );
  if (log.status !== 0) return { ok: false, reason: "anonymous-public commit range cannot be read" };
  const entries = log.stdout.split("\x1e").filter((entry) => entry.trim().length > 0).map((line) => line.split("\x1f"));
  if (entries.length === 0) return { ok: false, reason: "anonymous-public push contains no newly reachable commit" };
  return { ok: true, entries };
}

function authenticatedSshAccount(identity) {
  // `ssh -T` intentionally returns exit 1 after successful GitHub public-key
  // authentication because GitHub exposes no shell.  The bounded greeting is
  // the account evidence; a configured host alias alone only proves selection.
  const result = spawnSync(
    "ssh",
    ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", identity.sshHostAlias],
    { encoding: "utf8", timeout: 7000 },
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
  if (expected.sshAccount !== expected.repositoryOwner) failures.push("anonymous-public calibration must bind the dedicated SSH account to the repository owner");
  const ssh = authenticatedSshAccount(expected);
  if (!ssh.ok) failures.push(ssh.reason);
  const range = anonymousRange(binding, sourceCommit, expected);
  if (!range.ok) return [...failures, range.reason];
  for (const [commit, authorName, authorEmail, committerName, committerEmail, signature, message] of range.entries) {
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

const pushBinding = parsePushBinding(cmd);
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
function checkDeployApprovals(required) {
  const path = join(projectDir, ".claude", "pipeline-state.json");
  let raw = null;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // absent -- treated as "no approvals recorded at all" below, not malformed.
  }
  let deployApprovals = [];
  if (raw !== null) {
    let parsed;
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
        `BLOCKED (guard-push deploy branch, plugin pipeline-core): .claude/pipeline.yaml is semantically invalid ` +
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
        `[guard-push] WARN: .claude/pipeline.yaml is semantically invalid (${reason}) -- release section ` +
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
    `[guard-push] WARN: .claude/pipeline.yaml is invalid (${reason}).`,
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
  const p = join(projectDir, relPath);
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

const failures = [];

// (a) verify evidence -- always checked once the push gate is active.
failures.push(...checkEvidenceFreshness("evidence/verify-latest.json"));

// (b) security evidence -- only when a security gate is configured and not "off".
const securityGate = gateConfig(manifest, "security");
if (securityGate && securityGate.mode !== "off") {
  failures.push(...checkEvidenceFreshness("evidence/security-latest.json"));
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
  const statePath = join(projectDir, ".claude", "pipeline-state.json");
  let stateRaw;
  let stateExists = true;
  try {
    stateRaw = readFileSync(statePath, "utf8");
  } catch {
    stateExists = false;
  }
  if (!stateExists) {
    failures.push(`Push approval missing: .claude/pipeline-state.json does not exist (never recorded via approve-push).`);
  } else {
    let state;
    try {
      state = JSON.parse(stateRaw);
    } catch (e) {
      emit(1, [
        `[guard-push] WARN: .claude/pipeline-state.json contains invalid JSON (${e.message}).`,
        `Push-Gate is being skipped (fail-open, never silently marked blocking/passing) -- please fix ` +
          `(rewrite only via harness/scripts/pipeline-state.mjs, never by hand).`,
      ]);
    }
    const forCommit = state?.pushApproval?.lastApproved?.forCommit;
    if (!forCommit || forCommit !== sourceCommit) {
      failures.push(
        `Push approval missing or stale: state.pushApproval.lastApproved.forCommit=${JSON.stringify(
          forCommit ?? null,
        )}, expected pushed source commit=${JSON.stringify(sourceCommit)}. Record: node harness/scripts/pipeline-state.mjs approve-push --by <name>.`,
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
