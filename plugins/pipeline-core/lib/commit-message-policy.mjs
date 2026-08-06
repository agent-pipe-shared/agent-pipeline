// SPDX-License-Identifier: SUL-1.0
/**
 * GIT-03 as executable rule instead of prose.
 *
 * WHY THIS EXISTS. `rg 'GIT-03|AI-Assisted'` across the harness, the hooks and the plugin
 * scripts returned nothing. The rule has been in `guardrails/git.md` since Sprint 0, it is
 * marked "mandatory, all projects", and it had no enforcement of any kind. In one session
 * 74 commits were authored carrying `Co-Authored-By: <provider>` trailers and session URLs;
 * 53 of them were already public and unrewritable by the time a human noticed by reading.
 * That was not a gate failing. There was no gate.
 *
 * The rule has two halves and they are NOT the same kind of rule, so they are not enforced
 * the same way:
 *
 *   1. **Correlation data must not enter commit metadata.** This is a privacy property, it
 *      cannot false-positive on an ordinary commit message, and a repository that leaks it
 *      has already lost something it cannot take back — public history is not editable.
 *      Enforced unconditionally, blocking.
 *
 *   2. **`AI-Assisted: true` must be present.** This is a convention. Switching it on
 *      unconditionally would refuse every ordinary commit in every consumer project that
 *      has not adopted the trailer, which is a large silent behaviour change shipped to
 *      people who did not ask for it. Config-gated (`commitTrailerPolicy` in the project
 *      guard-config), default off.
 *
 * WHAT IT CANNOT SEE, stated rather than discovered later. A commit whose message comes
 * from the editor (`git commit` with no `-m`/`-F`) has no message at the moment the hook
 * runs — the guard is a PreToolUse check on a command line, not a `commit-msg` hook. Those
 * are reported as `inspected: false` and the caller allows them. Closing that gap needs a
 * real `commit-msg` hook installed in the repository, which is a different mechanism with
 * its own install story. Anyone reading this should not mistake the check for total.
 *
 * OVERLAP, declared. `hooks/guard-push.mjs` carries an older, broader pattern set
 * (`TRAILER_DENY`, `PRIVATE_CORRELATION_IN_MESSAGE`) used to police the anonymous-public
 * delivery range. That set is deliberately more aggressive — it also refuses
 * `Signed-off-by:` and `Reviewed-by:`, which is right for anonymous public delivery and
 * wrong as a blanket commit rule. The two are not unified here because doing so would edit
 * a file under review in the same breath; unifying them is a follow-up, and this module is
 * the single definition for the commit lane meanwhile.
 */
import { tokenizeArgv } from "./git-cmd.mjs";

const MAX_MESSAGE_FILE_BYTES = 1_048_576;

/**
 * Provider- or model-specific co-authorship. Deliberately keyed on the VENDOR token rather
 * than on `Co-Authored-By:` as such: a human co-author is legitimate and common, and a rule
 * that refused all co-authorship would be refused by its users instead.
 */
const PROVIDER_COAUTHOR = /^\s*co-authored-by\s*:.*\b(?:claude|anthropic|openai|chatgpt|gpt-[0-9a-z.]+|codex|copilot|gemini|cursor|devin|windsurf)\b/im;

/** Session, run and trace correlation — the "turns public history into an index" half. */
const CORRELATION_TRAILER = /^\s*(?:claude-session|session|session-id|session-url|run-id|trace-id|thread-id|conversation-id|provider|model|account|operator)\s*:/im;

/** A session or conversation URL anywhere in the body, trailer or not. */
const SESSION_URL = /https?:\/\/(?:claude\.ai|chat\.openai\.com|chatgpt\.com|gemini\.google\.com)\/\S+/i;

const MARKER = /^AI-Assisted: true$/m;

const CORRELATION_RULES = Object.freeze([
  Object.freeze({
    code: "GIT-03-PROVIDER-COAUTHOR",
    test: PROVIDER_COAUTHOR,
    detail: "a provider- or model-specific co-author trailer",
  }),
  Object.freeze({
    code: "GIT-03-CORRELATION-TRAILER",
    test: CORRELATION_TRAILER,
    detail: "a session, run, trace, account or provider correlation trailer",
  }),
  Object.freeze({
    code: "GIT-03-SESSION-URL",
    test: SESSION_URL,
    detail: "a session or conversation URL",
  }),
]);

/** Is this command line a `git commit` at all? Global options may sit before the verb. */
function isGitCommit(tokens) {
  let i = 0;
  // Leading `NAME=value` assignments are part of the command, not the command name. Skipping
  // them is not cosmetic: without this, `PIPELINE_GUARD_OVERRIDE=… git commit -F msg.txt` --
  // or any `FOO=bar` prefix at all -- made the first token something other than `git`, the
  // commit went uninspected, and the whole rule was one env assignment away from silent.
  // Found by GIT03-5, which was written to prove the override cannot open this rule and
  // instead proved something worse. `guard-push` carries the same defence as PG-HD4.
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? "")) i += 1;
  if (!/^(?:.*[/\\])?(?:env|git)(?:\.exe)?$/i.test(tokens[i] ?? "")) return false;
  // `env [-i] [NAME=value ...] git commit …` reaches the same place by another road.
  if (/^(?:.*[/\\])?env$/i.test(tokens[i])) {
    i += 1;
    while (tokens[i] !== undefined && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i].startsWith("-"))) i += 1;
    if (!/^(?:.*[/\\])?git(?:\.exe)?$/i.test(tokens[i] ?? "")) return false;
  }
  i += 1;
  // Skip the global options git accepts before a subcommand. `-C`, `-c`, `--git-dir` and
  // friends take a value; the rest are flags. An unrecognised token ends the scan, which
  // means an unusual invocation reads as "not a commit" and is left alone.
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === "-C" || token === "-c" || token === "--git-dir" || token === "--work-tree" || token === "--namespace") {
      i += 2;
      continue;
    }
    if (token.startsWith("--git-dir=") || token.startsWith("--work-tree=") || token.startsWith("--namespace=")) {
      i += 1;
      continue;
    }
    break;
  }
  return tokens[i] === "commit";
}

/** Heredoc bodies, which is how a multi-line message reaches `git commit -F -`. */
function heredocBodies(cmd) {
  const bodies = [];
  const opener = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g;
  let match;
  while ((match = opener.exec(cmd)) !== null) {
    const tag = match[2];
    const rest = cmd.slice(opener.lastIndex);
    const terminator = new RegExp(`^[ \\t]*${tag}[ \\t]*$`, "m");
    const end = terminator.exec(rest);
    bodies.push(end === null ? rest : rest.slice(0, end.index));
  }
  return bodies;
}

/**
 * @param {string} cmd raw command line, quoting intact
 * @param {{projectDir: string, readFile: (path: string) => string, requireMarker?: boolean}} options
 * @returns {{inspected: boolean, sources: string[], findings: {code: string, detail: string}[]}}
 */
export function commitMessageFindings(cmd, { readFile, requireMarker = false } = {}) {
  if (typeof cmd !== "string" || cmd === "") return { inspected: false, sources: [], findings: [] };
  const tokens = tokenizeArgv(cmd);
  if (!isGitCommit(tokens)) return { inspected: false, sources: [], findings: [] };

  const parts = [];
  const sources = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-m" || token === "--message") {
      if (tokens[i + 1] !== undefined) { parts.push(tokens[i + 1]); sources.push("-m"); i += 1; }
    } else if (token.startsWith("--message=")) {
      parts.push(token.slice("--message=".length)); sources.push("--message=");
    } else if (token.startsWith("-m") && token.length > 2) {
      parts.push(token.slice(2)); sources.push("-m");
    } else if (token === "-F" || token === "--file") {
      const path = tokens[i + 1];
      if (path !== undefined && path !== "-") {
        // A message file the agent wrote a moment ago is the ordinary route in this
        // repository, so a check that ignored it would miss its own most likely violation.
        try { parts.push(readFile(path)); sources.push(path); } catch { /* unreadable -- see below */ }
        i += 1;
      }
    } else if (token.startsWith("--file=")) {
      const path = token.slice("--file=".length);
      try { parts.push(readFile(path)); sources.push(path); } catch { /* unreadable -- see below */ }
    }
  }
  for (const body of heredocBodies(cmd)) { parts.push(body); sources.push("heredoc"); }

  // No inspectable message: an editor commit, or a `-F` whose file could not be read. The
  // caller must not treat this as clean — it is "not looked at", which is a different thing
  // and is reported as such.
  if (parts.length === 0) return { inspected: false, sources: [], findings: [] };

  const message = parts.join("\n");
  const findings = CORRELATION_RULES
    .filter((rule) => rule.test.test(message))
    .map((rule) => ({ code: rule.code, detail: rule.detail }));

  if (requireMarker && !MARKER.test(message)) {
    findings.push({ code: "GIT-03-MARKER-MISSING", detail: "no `AI-Assisted: true` line" });
  }
  return { inspected: true, sources, findings };
}

export const COMMIT_MESSAGE_POLICY_MODES = Object.freeze(["off", "warn", "blocking"]);

/**
 * The project's chosen strength for the marker half. Unknown or absent reads as `off`,
 * because this half is a convention a project opts into — unlike the correlation half,
 * which is not configurable at all and does not pass through here.
 */
export function markerPolicyMode(config) {
  const configured = config?.commitTrailerPolicy;
  return COMMIT_MESSAGE_POLICY_MODES.includes(configured) ? configured : "off";
}
