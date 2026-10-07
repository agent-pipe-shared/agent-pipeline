// SPDX-License-Identifier: SUL-1.0
/** Preview-only, exact-path Git commands for legacy non-host Goldfish returns.
 *
 * Single-line rule (toil T29): every step's copyCommand is ONE line. The Bash guard refuses newlines in
 * commands, so a multi-line `CMD=...`/`eval` copy script is never admitted. posix is the step's own argv-exact
 * `command`; powershell is `& git` plus single-quoted argv words. maxColumns stays informational only. */
import { boundedCopySafeCommand } from "./copy-safe-command.mjs";
import { commitTypeFindings, finishedCommitMessageFindings } from "./commit-message-policy.mjs";
import { isSafeTaskId, normalizeDispatchRecordPath } from "./dispatch-record.mjs";

export const GOLDFISH_COMMIT_COMMAND_FLOW_SCHEMA = "pipeline.goldfish-commit-command-flow.v1";
const TYPES = new Set(["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"]);
const SCOPE = /^[a-z][a-z0-9-]{0,39}$/u;
const fail = (code) => ({ ok: false, code, steps: [] });

function oneLine(value, maxBytes) {
  return typeof value === "string" && value.trim() === value && value.length > 0
    && Buffer.byteLength(value, "utf8") <= maxBytes && !/[\0\r\n]/u.test(value);
}

const psQuote = (word) => `'${word.replaceAll("'", "''")}'`;
function singleLine(step, argv) {
  return { ...step, copyCommand: { ...step.copyCommand, posix: step.command,
    powershell: `& git ${argv.map(psQuote).join(" ")}` } };
}

/** No Git invocation and no authority grant. The caller executes each step separately. */
export function createGoldfishCommitCommandFlow({ taskId, type, scope, summary,
  bodyParagraphs, paths } = {}) {
  if (!isSafeTaskId(taskId) || taskId.length > 96 || !TYPES.has(type)
    || !SCOPE.test(scope ?? "") || !oneLine(summary, 120)
    || !Array.isArray(bodyParagraphs) || bodyParagraphs.length < 1 || bodyParagraphs.length > 4
    || !bodyParagraphs.every((part) => oneLine(part, 1000))
    || !Array.isArray(paths) || paths.length < 1 || paths.length > 64) return fail("GF-COMMAND-INPUT");
  let normalized;
  try { normalized = paths.map((path) => normalizeDispatchRecordPath(path, "commit path")); }
  catch { return fail("GF-COMMAND-PATH"); }
  if (normalized.join("\0") !== [...new Set(normalized)].sort().join("\0")) return fail("GF-COMMAND-PATH-ORDER");
  const subject = `${type}(${scope}): ${summary}`;
  const trailers = `Dispatch: ${taskId} (goldfish)\nAI-Assisted: true`;
  const message = `${subject}\n\n${bodyParagraphs.join("\n\n")}\n\n${trailers}\n`;
  if (commitTypeFindings(subject).findings.length > 0
    || finishedCommitMessageFindings(message, { requireMarker: true, requireDispatch: true }).findings.length > 0) {
    return fail("GF-COMMAND-MESSAGE");
  }
  const stageArgv = ["add", "--", ...normalized];
  const commitArgv = ["commit", "-m", subject,
    ...bodyParagraphs.flatMap((part) => ["-m", part]),
    "--trailer", `Dispatch: ${taskId} (goldfish)`, "--trailer", "AI-Assisted: true",
    "--", ...normalized];
  const stage = singleLine(boundedCopySafeCommand({ executable: "git", argv: stageArgv, forceCopyCommand: true }), stageArgv);
  const commit = singleLine(boundedCopySafeCommand({ executable: "git", argv: commitArgv, forceCopyCommand: true }), commitArgv);
  return { ok: true, schema: GOLDFISH_COMMIT_COMMAND_FLOW_SCHEMA,
    code: "GF-COMMAND-PREVIEW-ONLY", taskId, paths: normalized,
    steps: [{ kind: "stage-exact-paths", ...stage }, { kind: "commit-exact-paths", ...commit }],
    disclaimer: "Use each step's POSIX or PowerShell copyCommand for that shell, separately from the same repository root after reviewing the exact paths. The command field is POSIX only. This preview does not attest dispatch identity, stage files, commit, bypass hooks, or publish a dispatch record." };
}
