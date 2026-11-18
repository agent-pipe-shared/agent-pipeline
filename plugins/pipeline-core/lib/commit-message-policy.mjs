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
import { createHash } from "node:crypto";

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
const CHECKPOINT_KEY = "Checkpoint-Act";
const CHECKPOINT_VALUE = "elephant";
const DISPATCH_VALUE = /^(\S+) \((goldfish|critic|elephant-generated)\)$/u;
const PROVENANCE_SIGNAL = /^\s*(?:AI-Assisted|Dispatch)\s*:/imu;
export const ELEPHANT_EXCEPTION_DISPATCH = /^D[1-9][0-9]{0,3} \(elephant-exception\)$/u;

function admittedDispatchValue(value) {
  if (value === "stage-0 (elephant)" || value === "design (elephant)" || value === "administrative (elephant)") return true;
  if (/^quality-package-[a-f0-9]{64} \(integration\)$/u.test(value)) return true;
  // D55 (Q12): an Elephant-built commit under a recorded PO exception to EL-01 names that decision.
  if (ELEPHANT_EXCEPTION_DISPATCH.test(value)) return true;
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

/** The one-command spelling every GIT-03 refusal teaches first; the message file (`git commit -F`) is the fallback for a long body. */
export const ONE_COMMAND_TRAILER_FORM = 'git commit -m <subject> [-m <body>] --trailer "AI-Assisted: true" --trailer "Dispatch: <id>"';
const MESSAGE_FILE_FORM = "git commit -F scratch/<message-file>";

// Git (trailer.c, find_trailer_block_start) appends `--trailer` entries to the LAST paragraph, without a blank line, when that paragraph
// is itself a trailer block: every line is `Token: value` (token of letters, digits and `-`, optional blanks before the colon) or a
// continuation, or at least a quarter of them are trailers and one carries a Git-generated prefix. The first paragraph is the title and
// is never a trailer block. Only the built-in prefixes are modelled: a `trailer.*` key in the user's own Git config can recognise more,
// which the unchanged `commit-msg` backstop still judges on the finished bytes.
const GIT_GENERATED_TRAILER_PREFIXES = Object.freeze(["Signed-off-by: ", "(cherry picked from commit "]);

function gitTrailerSeparatorIndex(line) {
  let blankSeen = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === ":") return index;
    if (!blankSeen && /[A-Za-z0-9-]/u.test(char)) continue;
    if (index > 0 && (char === " " || char === "\t")) { blankSeen = true; continue; }
    break;
  }
  return -1;
}

/** Would `git commit --trailer ...` glue its entries to the last paragraph of this (already cleaned) message? */
export function gitReadsLastParagraphAsTrailerBlock(message) {
  const lines = String(message ?? "").split("\n");
  const titleEnd = lines.findIndex((line) => line.trim() === "");
  if (titleEnd < 0) return false;
  let trailerLines = 0;
  let nonTrailerLines = 0;
  let possibleContinuations = 0;
  let recognizedPrefix = false;
  let onlyBlanks = true;
  for (let index = lines.length - 1; index >= titleEnd; index -= 1) {
    const line = lines[index];
    if (line.startsWith("#")) { nonTrailerLines += possibleContinuations; possibleContinuations = 0; continue; }
    if (line.trim() === "") {
      if (onlyBlanks) continue;
      nonTrailerLines += possibleContinuations;
      return (recognizedPrefix && trailerLines * 3 >= nonTrailerLines) || (trailerLines > 0 && nonTrailerLines === 0);
    }
    onlyBlanks = false;
    if (GIT_GENERATED_TRAILER_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      trailerLines += 1; possibleContinuations = 0; recognizedPrefix = true; continue;
    }
    if (gitTrailerSeparatorIndex(line) >= 1 && !/\s/u.test(line[0])) { trailerLines += 1; possibleContinuations = 0; }
    else if (/\s/u.test(line[0])) possibleContinuations += 1;
    else { nonTrailerLines += 1 + possibleContinuations; possibleContinuations = 0; }
  }
  return false;
}

/** Git's `whitespace` cleanup, which `-m` and `-F` use: trailing blanks off each line, blank runs collapsed, outer blank lines dropped (an empty `-m ''` adds nothing). */
function gitWhitespaceCleanup(text) {
  const out = [];
  for (const raw of text.replace(/\r\n/gu, "\n").split("\n")) {
    const line = raw.replace(/[ \t]+$/u, "");
    if (line === "" && (out.length === 0 || out.at(-1) === "")) continue;
    out.push(line);
  }
  while (out.at(-1) === "") out.pop();
  return out.join("\n");
}

const INTEGRATION_DISPATCH = /^quality-package-([a-f0-9]{64}) \(integration\)$/u;
const messageDigest = (message) => createHash("sha256").update(String(message ?? "").replace(/\r\n/gu, "\n"), "utf8").digest("hex");

/** Closed parser for the signed-artifact integration role. */
export function parseIntegrationTrailerBlock(message) {
  const trailers = parseCommitTrailerBlock(message);
  if (trailers.length !== 2 || trailers[0]?.key !== "Dispatch" || trailers[1]?.key !== "AI-Assisted" || trailers[1]?.value !== "true") {
    return { ok: false, code: "GIT-03-INTEGRATION-TRAILER-MALFORMED" };
  }
  const match = INTEGRATION_DISPATCH.exec(trailers[0].value);
  return match ? { ok: true, intentSha256: match[1] } : { ok: false, code: "GIT-03-INTEGRATION-TRAILER-MALFORMED" };
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
  integrationAdmission,
  administrativeAdmission,
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
  // D52: the exact checkpoint pair needs no Dispatch entry. Path-neutral on purpose: path
  // enforcement belongs to dispatch-authorship-verify and checkpoint-commit.mjs.
  const checkpointPair = trailers.length === 2
    && trailers.some((entry) => entry.key === MARKER_KEY && entry.value === MARKER_VALUE)
    && trailers.some((entry) => entry.key === CHECKPOINT_KEY && entry.value === CHECKPOINT_VALUE);
  if ((requireDispatch || enforceProvenance) && !checkpointPair) {
    const dispatches = trailers.filter((entry) => entry.key === DISPATCH_KEY);
    if (dispatches.length === 0) {
      // Candidate 29 (AGY run 3, R8): `git commit -m <subject> -m <body> -m "AI-Assisted: true" -m "Dispatch: ..."` puts a blank line
      // between the two trailers, so the Dispatch line exists but is not in the final block. Say so and name the form that works.
      const splitAway = /^Dispatch:[ \t]*\S/mu.test(text);
      findings.push({
        code: "GIT-03-DISPATCH-MISSING",
        detail: splitAway
          ? `no \`Dispatch:\` entry in the final Git trailer block: a \`Dispatch:\` line is in the message but a blank line separates it from the last block (each \`-m\` flag starts a new paragraph); commit with \`${ONE_COMMAND_TRAILER_FORM}\` (one \`-m\` per paragraph, the two trailers only as \`--trailer\` flags), or, for a long or multi-paragraph body, write the whole message to a file under scratch/ and commit with \`${MESSAGE_FILE_FORM}\`, both trailers as the last lines with no blank line between them`
          : `no \`Dispatch:\` entry in the final Git trailer block; end the message with \`AI-Assisted: true\` and one \`Dispatch:\` line (\`Dispatch: <task-id> (goldfish)\` or \`Dispatch: stage-0 (elephant)\`) as the last lines, written with \`${ONE_COMMAND_TRAILER_FORM}\` (or, for a long or multi-paragraph body, \`${MESSAGE_FILE_FORM}\`)`,
      });
    } else if (dispatches.length > 1) {
      findings.push({ code: "GIT-03-DISPATCH-AMBIGUOUS", detail: "more than one `Dispatch:` entry in the final Git trailer block" });
    } else if (!admittedDispatchValue(dispatches[0].value)) {
      findings.push({
        code: "GIT-03-DISPATCH-MALFORMED",
        detail: `the final \`Dispatch: ${dispatches[0].value}\` entry is not an admitted work-package binding`,
      });
    }
  }
  if (trailers.some((entry) => entry.key === "Dispatch" && entry.value === "administrative (elephant)")) {
    const exact = trailers.length === 2 && trailers[0].key === "Dispatch" && trailers[1].key === "AI-Assisted" && trailers[1].value === "true";
    const admitted = exact && administrativeAdmission?.ok === true && administrativeAdmission.schema === "pipeline.administrative-commit-content.v1"
      && administrativeAdmission.code === "GIT-03-ADMINISTRATIVE-VERIFIED" && administrativeAdmission.messageSha256 === messageDigest(text);
    if (!admitted) findings.push({code:"GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED",detail:"administrative binding requires independently inspected exact Git paths and official projection bytes; no authorship or approval is inferred. The admitted Elephant form for a bounded commit of your own is `Dispatch: stage-0 (elephant)` with `AI-Assisted: true`"});
  }
  const integration = trailers.filter((entry) => entry.key === "Dispatch" && entry.value.startsWith("quality-package-"));
  if (integration.length > 0) {
    const parsed = parseIntegrationTrailerBlock(text);
    const admitted = parsed.ok && integrationAdmission !== null && typeof integrationAdmission === "object"
      && integrationAdmission.schema === "pipeline.signed-quality-package-integration-evidence.v1"
      && integrationAdmission.intentSha256 === parsed.intentSha256
      && integrationAdmission.messageSha256 === messageDigest(text)
      && ["precommit", "postcommit"].includes(integrationAdmission.phase)
      && ["QUALITY-PACKAGE-INTEGRATION-PRECOMMIT-VERIFIED", "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED"].includes(integrationAdmission.code);
    if (!parsed.ok) findings.push({ code: parsed.code, detail: "the integration trailer must be exactly one package intent dispatch followed by one AI-Assisted marker" });
    else if (!admitted) findings.push({ code: "GIT-03-INTEGRATION-EVIDENCE-REQUIRED", detail: "the exact signed authorization must be independently verified for this message and repository context" });
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

/** Locate an observable Git message verb; this does not admit the command. */
function gitMessageCommand(tokens) {
  let i = 0;
  // Leading `NAME=value` assignments are part of the command, not the command name. Skipping
  // them is not cosmetic: without this, `PIPELINE_GUARD_OVERRIDE=… git commit -F msg.txt` --
  // or any `FOO=bar` prefix at all -- made the first token something other than `git`, the
  // commit went uninspected, and the whole rule was one env assignment away from silent.
  // Found by GIT03-5, which was written to prove the override cannot open this rule and
  // instead proved something worse. `guard-push` carries the same defence as PG-HD4.
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? "")) i += 1;
  if (!/^(?:.*[/\\])?(?:env|git)(?:\.exe)?$/i.test(tokens[i] ?? "")) return null;
  // `env [-i] [NAME=value ...] git commit …` reaches the same place by another road.
  if (/^(?:.*[/\\])?env$/i.test(tokens[i])) {
    i += 1;
    while (tokens[i] !== undefined && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i].startsWith("-"))) i += 1;
    if (!/^(?:.*[/\\])?git(?:\.exe)?$/i.test(tokens[i] ?? "")) return null;
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
  return tokens[i] === "commit" || tokens[i] === "merge" ? { verb: tokens[i], index: i } : null;
}

/**
 * Project only explicit merge message operands into the existing message reader.
 * Repository topology is unknown here: a potential merge commit may fast-forward
 * or already be up to date. Explicit non-committing modes create no merge commit
 * (although --no-commit alone can still fast-forward HEAD), so do not read files.
 * Shell grammar, physical file admission and other Git guards remain separate.
 */
function mergeMessageOperands(tokens, index) {
  const operands = [];
  const valueOptions = new Set(["-s", "--strategy", "-X", "--strategy-option", "--into-name", "--cleanup"]);
  let commit = true;
  let squash = false;
  let nonCommitting = false;
  let stdinFile = false;
  for (let i = index + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--") break;
    if (token === "--commit") commit = true;
    else if (token === "--no-commit") commit = false;
    else if (token === "--squash") squash = true;
    else if (token === "--no-squash") squash = false;
    else if (["--ff-only", "--abort", "--quit"].includes(token)) nonCommitting = true;
    else if (valueOptions.has(token)) i += 1;
    else if (["-m", "--message", "-F", "--file"].includes(token)) {
      const value = tokens[i + 1];
      if (value !== undefined) {
        const file = token === "-F" || token === "--file";
        operands.push(file ? "-F" : "-m", value);
        if (file && value === "-") stdinFile = true;
        i += 1;
      }
    } else if (token.startsWith("--message=")) operands.push("-m", token.slice("--message=".length));
    else if (token.startsWith("--file=")) {
      const value = token.slice("--file=".length);
      operands.push("-F", value);
      if (value === "-") stdinFile = true;
    } else if (token.startsWith("-m") && token.length > 2) operands.push("-m", token.slice(2));
    else if (token.startsWith("-F") && token.length > 2) {
      const value = token.slice(2);
      operands.push("-F", value);
      if (value === "-") stdinFile = true;
    }
  }
  return !commit || squash || nonCommitting ? null : { operands, stdinFile };
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
  let tokens = tokenizeArgv(cmd);
  const command = gitMessageCommand(tokens);
  if (command === null) return { inspected: false, sources: [], findings: [], message: null };
  let messageCommand = cmd;
  if (command.verb === "merge") {
    const merge = mergeMessageOperands(tokens, command.index);
    if (merge === null) return { inspected: false, sources: [], findings: [], message: null };
    tokens = merge.operands;
    // Merge has no --trailer option. Trailers must come from actual message
    // bytes; only an explicit stdin file can make a heredoc a message source.
    if (!merge.stdinFile) messageCommand = "";
  }

  const parts = [];
  const trailers = [];
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
    } else if (token === "--trailer") {
      if (tokens[i + 1] !== undefined) { trailers.push(tokens[i + 1]); sources.push("--trailer"); i += 1; }
    } else if (token.startsWith("--trailer=")) {
      trailers.push(token.slice("--trailer=".length)); sources.push("--trailer=");
    }
  }
  for (const body of heredocBodies(messageCommand)) { parts.push(body); sources.push("heredoc"); }

  // No inspectable message and no named-but-unreadable source: an editor commit. The caller
  // must not treat this as clean -- it is "not looked at", which is a different thing and is
  // reported as such.
  if (parts.length === 0 && trailers.length === 0 && unreadable.length === 0) return { inspected: false, sources: [], findings: [], message: null };

  // Repeated `-m` values are paragraphs in the message Git creates, so keep
  // the required blank separator rather than concatenating them as adjacent
  // lines. A single `-F` or heredoc body is unchanged.
  // `git commit --trailer` appends every supplied entry as one contiguous
  // final trailer block.  Reconstruct precisely that shape so the pre-tool
  // inspection agrees with Git's finished commit and an agent need not pipe a
  // hand-built multi-line message through the shell just to satisfy GIT-03.
  // C30-19: the entries follow the cleaned message after a blank line, unless Git reads the last paragraph as a trailer block: then it
  // appends to that paragraph with no blank line (the bytes below are what Git writes, and that shape is refused further down).
  // A trailing run of blank and `#` lines is Git's comment footer: the entries go in front of it, not after it.
  const cleaned = trailers.length > 0 ? gitWhitespaceCleanup(parts.join("\n\n")) : parts.join("\n\n");
  const cleanedLines = cleaned.split("\n");
  let bodyEnd = cleanedLines.length;
  while (trailers.length > 0 && bodyEnd > 0 && (cleanedLines[bodyEnd - 1] === "" || cleanedLines[bodyEnd - 1].startsWith("#"))) bodyEnd -= 1;
  const body = trailers.length > 0 ? cleanedLines.slice(0, bodyEnd).join("\n") : cleaned;
  const footer = trailers.length > 0 && cleanedLines.slice(bodyEnd).some((line) => line.startsWith("#")) ? `\n${cleanedLines.slice(bodyEnd).join("\n")}` : "";
  const glued = trailers.length > 0 && body !== "" && gitReadsLastParagraphAsTrailerBlock(body);
  const message = `${body}${trailers.length > 0 ? `${body !== "" ? (glued ? "\n" : "\n\n") : ""}${trailers.join("\n")}${footer}` : ""}`;
  const findings = finishedCommitMessageFindings(message, { requireMarker, requireDispatch }).findings;
  if (glued) {
    findings.push({
      code: "GIT-03-TRAILERS-GLUED-TO-BODY",
      detail: `\`--trailer\` entries that Git would glue directly under the body: it reads the last body paragraph as a trailer block (every line looks like \`Key: value\`, or a \`Signed-off-by:\` line is among them), appends the entries with no blank line, and the body lines join the provenance block; end the body with a line of plain prose (not \`Key: value\`) or drop the body, and commit with \`${ONE_COMMAND_TRAILER_FORM}\`, or, for a long or multi-paragraph body, write the whole message to a file under scratch/ and commit with \`${MESSAGE_FILE_FORM}\``,
    });
  }

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
    message: parts.length > 0 || trailers.length > 0 ? message : null,
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
