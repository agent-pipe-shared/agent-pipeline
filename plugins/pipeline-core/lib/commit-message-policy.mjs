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
 * The rule has three parts and they are NOT the same kind of rule, so they are not enforced
 * the same way:
 *
 *   1. **Correlation data must not enter commit metadata.** This is a privacy property, it
 *      cannot false-positive on an ordinary commit message, and a repository that leaks it
 *      has already lost something it cannot take back — public history is not editable.
 *      Enforced unconditionally, blocking.
 *
 *   2. **`AI-Assisted: true` and one grounded `Dispatch:` binding must be present in the
 *      final Git trailer block.** The guard executes only for agent tool calls, so the
 *      mandatory all-project GIT-03 contract is the safe default. A project may select
 *      `warn` for a dated migration or explicitly select `off`; absence and unknown values
 *      fail closed to `blocking`.
 *
 * TWO BOUNDARIES. A commit whose message comes from the editor (`git commit` with no
 * `-m`/`-F`) has no message when the PreToolUse guard runs and is reported as
 * `inspected: false`. The onboarding-installed `commit-msg` hook later evaluates the
 * finished bytes. Git exposes no trustworthy agent-vs-human authorship bit, so that hook
 * always rejects correlation data and requires a complete provenance pair once either
 * Pipeline provenance key appears. The PreToolUse lane remains responsible for requiring
 * the pair on directly observable agent commands.
 *
 * A `-F`/`--file` reference IS a message source even when its content cannot be read (out of
 * bounds for the caller's `readFile`, gone, unreadable). That case must never collapse to the
 * same `inspected: false` as "no -m/-F/heredoc at all" -- an agent's scratch directory is the
 * ordinary place a commit message gets composed, is routinely outside the project root, and
 * "no override for this rule" is not true if pointing `-F` there silently passes. It is
 * therefore reported as its own blocking finding, `GIT-03-UNREADABLE-MESSAGE-FILE` (2026-08-06
 * Critic round, F3): an unverifiable message fails closed rather than certifying itself clean.
 *
 * OVERLAP, declared. `hooks/guard-push.mjs` carries an older, broader pattern set
 * (`TRAILER_DENY`, `PRIVATE_CORRELATION_IN_MESSAGE`) used to police the anonymous-public
 * delivery range. That set is deliberately more aggressive — it also refuses
 * `Signed-off-by:` and `Reviewed-by:`, which is right for anonymous public delivery and
 * wrong as a blanket commit rule. The two are not unified here because doing so would edit
 * a file under review in the same breath; unifying them is a follow-up, and this module is
 * the single definition for the commit lane meanwhile.
 *
 * GIT-01 (commit-message TYPE vocabulary), added separately below `commitTypeFindings`/
 * `commitTypeFindingsForRange`. Backstory: a Critic delta re-review found `6decf59` using
 * commit type `design`, which `guardrails/git.md:16` does not admit, and nothing
 * deterministic caught it — this module unit-tested GIT-03 only, and nothing walked a
 * commit range checking subjects at all
 * (`backlog/items/2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md`).
 * Deliberately a PURE function over a subject string (or an already-enumerated
 * `{sha, subject}` set for the range form) rather than a PreToolUse command-line check like
 * `commitMessageFindings` above: the type is decidable from the finished message alone, so
 * there is no reason to couple it to argv-tokenizing a `git commit` invocation, and it lets
 * a range walker (Critic, `verify.mjs`, or a future `commit-msg` hook) call it against
 * commits that already exist without re-deriving a shell command for each one.
 */
import { tokenizeArgv } from "./git-cmd.mjs";
import { SAFE_TASK_ID } from "./dispatch-record.mjs";

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

const MARKER_KEY = "AI-Assisted";
const MARKER_VALUE = "true";
const DISPATCH_KEY = "Dispatch";
const DISPATCH_VALUE = /^(\S+) \((goldfish|critic|elephant-generated)\)$/u;
const PROVENANCE_SIGNAL = /^\s*(?:AI-Assisted|Dispatch)\s*:/imu;

function admittedDispatchValue(value) {
  if (value === "stage-0 (elephant)") return true;
  const match = DISPATCH_VALUE.exec(value);
  if (!match) return false;
  if (match[2] === "elephant-generated") return /^[A-Za-z0-9._/-]+$/u.test(match[1]) && !match[1].split("/").includes("..");
  return SAFE_TASK_ID.test(match[1]);
}

/**
 * Parse only the final contiguous Git trailer block. A matching line in the
 * message body is prose, not provenance. The block also needs Git's blank-line
 * separator from the subject/body; otherwise `%(trailers:only=true)` will not
 * recognize it either.
 */
export function parseCommitTrailerBlock(message) {
  const lines = String(message ?? "").replace(/\r\n/gu, "\n").split("\n");
  while (lines.length > 0 && lines.at(-1).trim() === "") lines.pop();
  const entries = [];
  let start = lines.length;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/u.exec(lines[index]);
    if (!match) break;
    entries.unshift({ key: match[1], value: match[2].trim() });
    start = index;
  }
  if (entries.length === 0 || start === 0 || lines[start - 1].trim() !== "") return [];
  return entries;
}

/**
 * Inspect a finished commit message without depending on argv, files, Git or
 * process state. This is the shared policy seam for PreToolUse inspection and
 * the real `commit-msg` boundary.
 *
 * `requireProvenanceWhenSignaled` is intentionally narrower than an unconditional
 * marker requirement: Git does not expose whether a commit was authored by a
 * human or an agent. Once either Pipeline provenance key appears anywhere in the
 * message, however, the author has declared that this is a Pipeline provenance
 * block and both structural entries must be complete and grounded.
 */
export function finishedCommitMessageFindings(message, {
  requireMarker = false,
  requireDispatch = false,
  requireProvenanceWhenSignaled = false,
} = {}) {
  const text = String(message ?? "");
  const provenanceSignaled = PROVENANCE_SIGNAL.test(text);
  const enforceProvenance = requireProvenanceWhenSignaled && provenanceSignaled;
  const findings = CORRELATION_RULES
    .filter((rule) => rule.test.test(text))
    .map((rule) => ({ code: rule.code, detail: rule.detail }));
  const trailers = parseCommitTrailerBlock(text);

  if (requireMarker || enforceProvenance) {
    const markers = trailers.filter((entry) => entry.key === MARKER_KEY && entry.value === MARKER_VALUE);
    if (markers.length !== 1) {
      findings.push({
        code: markers.length === 0 ? "GIT-03-MARKER-MISSING" : "GIT-03-MARKER-AMBIGUOUS",
        detail: markers.length === 0
          ? "no exact `AI-Assisted: true` entry in the final Git trailer block"
          : "more than one `AI-Assisted: true` entry in the final Git trailer block",
      });
    }
  }
  if (requireDispatch || enforceProvenance) {
    const dispatches = trailers.filter((entry) => entry.key === DISPATCH_KEY);
    if (dispatches.length === 0) {
      findings.push({ code: "GIT-03-DISPATCH-MISSING", detail: "no `Dispatch:` entry in the final Git trailer block" });
    } else if (dispatches.length > 1) {
      findings.push({ code: "GIT-03-DISPATCH-AMBIGUOUS", detail: "more than one `Dispatch:` entry in the final Git trailer block" });
    } else if (!admittedDispatchValue(dispatches[0].value)) {
      findings.push({
        code: "GIT-03-DISPATCH-MALFORMED",
        detail: `the final \`Dispatch: ${dispatches[0].value}\` entry is not an admitted work-package binding`,
      });
    }
  }
  return { findings, trailers, provenanceSignaled };
}

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
 * @param {{projectDir: string, readFile: (path: string) => string, requireMarker?: boolean, requireDispatch?: boolean}} options
 * @returns {{inspected: boolean, sources: string[], findings: {code: string, detail: string}[], message: string|null}}
 */
export function commitMessageFindings(cmd, { readFile, requireMarker = false, requireDispatch = false } = {}) {
  if (typeof cmd !== "string" || cmd === "") return { inspected: false, sources: [], findings: [], message: null };
  const tokens = tokenizeArgv(cmd);
  if (!isGitCommit(tokens)) return { inspected: false, sources: [], findings: [], message: null };

  const parts = [];
  const sources = [];
  const unreadable = [];
  const readMessageFile = (path) => {
    // A message file the agent wrote a moment ago is the ordinary route in this repository,
    // so a check that ignored it would miss its own most likely violation. A path the caller
    // refuses to read (out of bounds, gone, unreadable) is still a named message source --
    // recorded as unreadable rather than dropped, so it becomes a finding, not a silent pass.
    try { parts.push(readFile(path)); sources.push(path); } catch (error) { unreadable.push({ path, reason: error?.message ?? "unreadable" }); }
  };
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
      if (path !== undefined && path !== "-") { readMessageFile(path); i += 1; }
    } else if (token.startsWith("--file=")) {
      readMessageFile(token.slice("--file=".length));
    }
  }
  for (const body of heredocBodies(cmd)) { parts.push(body); sources.push("heredoc"); }

  // No inspectable message and no named-but-unreadable source: an editor commit. The caller
  // must not treat this as clean -- it is "not looked at", which is a different thing and is
  // reported as such.
  if (parts.length === 0 && unreadable.length === 0) return { inspected: false, sources: [], findings: [], message: null };

  // Repeated `-m` values are paragraphs in the message Git creates, so keep
  // the required blank separator rather than concatenating them as adjacent
  // lines. A single `-F` or heredoc body is unchanged.
  const message = parts.join("\n\n");
  const findings = finishedCommitMessageFindings(message, { requireMarker, requireDispatch }).findings;

  for (const { path, reason } of unreadable) {
    findings.push({
      code: "GIT-03-UNREADABLE-MESSAGE-FILE",
      detail: `the message file "${path}" could not be verified (${reason}) — an unverifiable commit message is not certifiable clean`,
    });
  }

  return {
    inspected: true,
    sources: [...sources, ...unreadable.map((entry) => entry.path)],
    findings,
    message: parts.length > 0 ? message : null,
  };
}

/** GIT-01's admitted Conventional Commit types (`guardrails/git.md:16`), verbatim. */
export const GIT01_COMMIT_TYPES = Object.freeze([
  "feat", "fix", "docs", "refactor", "test", "chore", "build", "ci", "perf", "style",
]);

// `type` or `type(scope)`, an optional breaking-change `!` (Conventional Commits core,
// not itself a GIT-01 vocabulary item), then `: ` and at least one more character. Anchored
// at the start of the (trimmed) subject -- GIT-01 constrains how the subject STARTS, not
// the rest of the line.
const TYPE_PREFIX = new RegExp(`^(?:${GIT01_COMMIT_TYPES.join("|")})(?:\\([^)]*\\))?!?:\\s+\\S`);

/**
 * GIT-01 type-vocabulary check, pure and decidable: does the subject start with an admitted
 * Conventional Commit type? Nothing here reads a file, runs git, or depends on caller state.
 *
 * @param {string} subject the commit subject line (first line of the message)
 * @returns {{findings: {code: string, detail: string}[]}}
 */
export function commitTypeFindings(subject) {
  const trimmed = typeof subject === "string" ? subject.trim() : "";
  if (trimmed === "") {
    return { findings: [{ code: "GIT-01-EMPTY-SUBJECT", detail: "the commit subject is empty" }] };
  }
  if (TYPE_PREFIX.test(trimmed)) return { findings: [] };
  return {
    findings: [{
      code: "GIT-01-UNKNOWN-TYPE",
      detail: `subject "${trimmed}" does not start with an admitted Conventional Commit type (${GIT01_COMMIT_TYPES.join(", ")})`,
    }],
  };
}

/**
 * Range-mode entry point. Deliberately takes an already-enumerated commit set rather than
 * walking `git log` itself -- enumerating "the range" (delivery range, review range, a
 * single PR's commits) is the caller's own concern with its own edge cases, and a range
 * walker belongs in whatever wires this in (Critic tooling, `verify.mjs`, a future
 * `commit-msg` hook), not in this pure module. This function stays pure over data: same
 * input, same output, nothing observed but the array.
 *
 * @param {{sha: string, subject: string}[]} commits
 * @returns {{sha: string, subject: string, findings: {code: string, detail: string}[]}[]}
 *   one entry per input commit, in the same order, entries with findings=[] are clean
 */
export function commitTypeFindingsForRange(commits) {
  if (!Array.isArray(commits)) return [];
  return commits.map(({ sha, subject }) => ({
    sha,
    subject,
    findings: commitTypeFindings(subject).findings,
  }));
}

export const COMMIT_MESSAGE_POLICY_MODES = Object.freeze(["off", "warn", "blocking"]);

/**
 * The project's chosen strength for the marker half. Unknown or absent reads as
 * `blocking`, matching GIT-03's mandatory all-project scope. `warn` is a dated
 * migration mode and `off` is an explicit project opt-out. The correlation half
 * is not configurable and does not pass through here.
 */
export function markerPolicyMode(config) {
  const configured = config?.commitTrailerPolicy;
  return COMMIT_MESSAGE_POLICY_MODES.includes(configured) ? configured : "blocking";
}
