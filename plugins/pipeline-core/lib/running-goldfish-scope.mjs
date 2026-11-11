// SPDX-License-Identifier: SUL-1.0
/**
 * C28-HOST-COMMIT-RECOVERY (AC-108, PO decision 2026-11-10 on the WSL greenfield report): a native Goldfish's host commit fails when another commit
 * touches its write scope while it runs. The Elephant must hear that BEFORE it commits, not after the failed stop. This is the one check both
 * callers make: the commit guard (hooks/guard-git.mjs, every runner that reaches it) and the Pipeline's own commit commands that run git from Node and
 * therefore pass no Bash guard (scripts/commit-pipeline-owned.mjs).
 *
 * It never blocks for good: a commit that touches a running dispatch's scope is refused only until the caller acknowledges that dispatch by a
 * `Concurrent-Goldfish: <dispatchId>` trailer in the commit message (the Elephant's own step, recorded in the commit itself, no PO signature); a
 * commit outside the scope only warns. Every fault reads as "no running dispatch" -- this is a warning, never an authority.
 *
 * "Running" is read from the host-commit private state, tolerantly: a pending state of a claude or codex dispatch younger than RUNNING_MAX_AGE_MS whose stop
 * has not ended (no stop outcome other than a checkpoint, no stop-failure record, no dispatch record) and whose own commit this is not.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { readNativeGoldfishStopOutcome } from "./native-goldfish-stop-outcome.mjs";

export const RUNNING_MAX_AGE_MS = 6 * 3600 * 1000;
export const ACKNOWLEDGE_TRAILER = "Concurrent-Goldfish";
const DISPATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ACK_LINE = new RegExp(`^${ACKNOWLEDGE_TRAILER}: ([A-Za-z0-9][A-Za-z0-9._:-]{0,127})[ \\t]*$`, "gmu");

const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };
const clean = (path) => String(path).replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
/** Two scope entries overlap when they are the same path or one is a directory entry holding the other. */
export const scopesTouch = (a, b) => { const x = clean(a), y = clean(b); return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`); };

/** The dispatch ids a commit message acknowledges, in order. */
export function acknowledgedDispatches(message) {
  return typeof message === "string" ? [...message.matchAll(ACK_LINE)].map((match) => match[1]) : [];
}
/** The dispatch id a commit message claims as its own (`Dispatch: <id> (goldfish)`), or null. */
const ownDispatch = (message) => (typeof message === "string" ? /^Dispatch: (\S+) \(goldfish\)\s*$/mu.exec(message)?.[1] ?? null : null);

/** @returns {Array<{dispatchId:string, runner:string, scope:string[]}>} dispatches whose host commit is still to come, never throws. */
export function runningGoldfishDispatches({ root, now = Date.now() } = {}) {
  try {
    const commonDir = resolveGitCommonDir(root);
    if (typeof commonDir !== "string" || commonDir === "") return [];
    const base = join(commonDir, "agent-pipeline", "run");
    const directory = join(base, "native-goldfish-host-commit");
    const diagnostics = join(base, "native-goldfish-host-diagnostics");
    const failed = new Set();
    try {
      for (const name of readdirSync(diagnostics)) {
        if (!/^stop-failure-.+\.json$/u.test(name)) continue;
        const record = readJson(join(diagnostics, name));
        if (typeof record?.dispatchId === "string") failed.add(record.dispatchId);
      }
    } catch { /* no diagnostics */ }
    const found = [];
    for (const name of readdirSync(directory).sort()) {
      if (!/^pending-.+\.json$/u.test(name)) continue;
      const state = readJson(join(directory, name)), binding = state?.binding;
      if (!["claude", "codex"].includes(state?.runner) || typeof binding?.dispatchId !== "string" || !DISPATCH_ID.test(binding.dispatchId)
        || !Array.isArray(binding.allowedPaths) || !binding.allowedPaths.every((entry) => typeof entry === "string")) continue;
      const createdAtMs = Number(state.createdAtMs);
      if (!Number.isFinite(createdAtMs) || now - createdAtMs > RUNNING_MAX_AGE_MS || createdAtMs > now + 60_000) continue;
      if (failed.has(binding.dispatchId)) continue;
      const outcome = readNativeGoldfishStopOutcome({ commonDir, dispatchId: binding.dispatchId, after: new Date(createdAtMs).toISOString() });
      if (outcome !== null && outcome.status !== "checkpoint-recorded") continue;
      try { if (statSync(join(root, "evidence", `dispatch-record-${binding.dispatchId}.json`)).isFile()) continue; } catch { /* no record yet */ }
      const checks = Array.isArray(binding.itemDelivery?.checks) ? binding.itemDelivery.checks : [];
      const scope = [...binding.allowedPaths, ...checks.flatMap((check) => [check?.path, ...(Array.isArray(check?.dependencies) ? check.dependencies : [])])]
        .filter((entry) => typeof entry === "string" && entry !== "");
      found.push({ dispatchId: binding.dispatchId, runner: state.runner, scope: [...new Set(scope)].sort() });
    }
    return found;
  } catch { return []; }
}

/**
 * What a commit that changes `paths` owes the Elephant. `block` is a refusal text (the commit touches a running dispatch's scope and does not acknowledge it)
 * or null; `warnings` are the sentences for every other running dispatch, and the note for an acknowledged one. Never throws.
 */
export function runningGoldfishCommitNotice({ root, paths, message = null, acknowledged = acknowledgedDispatches(message), now } = {}) {
  const out = { block: null, warnings: [], dispatches: [] };
  try {
    const own = ownDispatch(message);
    const changed = Array.isArray(paths) ? paths.filter((path) => typeof path === "string" && path !== "") : [];
    const blocking = [];
    for (const dispatch of runningGoldfishDispatches({ root, ...(now === undefined ? {} : { now }) })) {
      if (dispatch.dispatchId === own) continue;
      const touched = changed.filter((path) => dispatch.scope.some((entry) => scopesTouch(entry, path))).sort();
      const shown = (list) => `${list.slice(0, 5).join(", ")}${list.length > 5 ? ` (+${list.length - 5} more)` : ""}`;
      const risk = `its host commit fails with SDC-AUTHORITY-UNAVAILABLE when a commit touches its write scope while it runs, and its result then has to be recovered with scripts/goldfish-host-commit-recover.mjs`;
      out.dispatches.push({ dispatchId: dispatch.dispatchId, touched });
      if (touched.length === 0) out.warnings.push(`WARNING (running Goldfish): dispatch ${dispatch.dispatchId} is running with write scope ${shown(dispatch.scope)}; this commit stays outside it, but ${risk}.`);
      else if (acknowledged.includes(dispatch.dispatchId)) out.warnings.push(`WARNING (running Goldfish): this commit touches ${shown(touched)} inside the write scope of the running dispatch ${dispatch.dispatchId}; the Concurrent-Goldfish trailer acknowledged it, so it proceeds. ${risk[0].toUpperCase()}${risk.slice(1)}.`);
      else blocking.push({ dispatch, touched, risk, shown });
    }
    if (blocking.length > 0) {
      const lines = blocking.map(({ dispatch, touched, risk, shown }) => `dispatch ${dispatch.dispatchId} is running and this commit touches ${shown(touched)} inside its write scope (${shown(dispatch.scope)}); ${risk}`);
      const ids = blocking.map(({ dispatch }) => dispatch.dispatchId);
      out.block = `BLOCKED once (running Goldfish): ${lines.join("; and ")}. This is a warning, not a lock: wait for the dispatch to stop, or acknowledge it deliberately by ending the commit message with ${ids.map((id) => `\`${ACKNOWLEDGE_TRAILER}: ${id}\``).join(" and ")} (a trailer line after \`AI-Assisted: true\` and the \`Dispatch:\` line; the commit then records that you knew). No PO signature is involved.`;
    }
  } catch { /* a warning is never an error */ }
  return out;
}

/**
 * The paths a `git commit` command line changes, as far as its text says: an explicit pathspec after `--`, else the staged paths (and, with -a/--all, the
 * modified tracked ones). `tokens` is the tokenized command (lib/git-cmd.mjs tokenizeArgv) and `run(args)` runs git in the repository and returns its
 * stdout as text or null. Returns null when the paths cannot be read.
 */
export function commitCommandPaths(tokens, run) {
  const valueFlags = new Set(["-m", "--message", "-F", "--file"]);
  let separator = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== "--" || (index > 0 && valueFlags.has(tokens[index - 1]))) continue;
    separator = index; break;
  }
  const explicit = separator === -1 ? [] : tokens.slice(separator + 1).map((token) => token.trim()).filter(Boolean);
  if (explicit.length > 0) return explicit;
  const lines = (text) => String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const staged = run(["diff", "--cached", "--name-only"]);
  if (staged === null) return null;
  const all = tokens.some((token) => token === "-a" || token === "--all" || /^-[A-Za-z]*a[A-Za-z]*$/u.test(token));
  const modified = all ? run(["diff", "--name-only"]) : "";
  return modified === null ? null : [...new Set([...lines(staged), ...lines(modified)])];
}
