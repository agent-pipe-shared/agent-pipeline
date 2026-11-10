#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * wait-host-commit.mjs -- wait in the same turn until a background Goldfish's stop has finished, then say how it ended.
 *
 * Usage: node <plugin-root>/scripts/wait-host-commit.mjs --root <project-root> --dispatch <dispatch id> --after <ISO time of the launch> [--timeout-seconds <1..170>]
 *
 * The launch notice of a background Goldfish prints this command complete. Run it when the child's hand-back arrives: the host commit lands 20 to 45 seconds after the hand-back,
 * and Claude Code's "Agent finished" notice starts no turn, so a turn that ends to wait for it stalls until a human writes. The default of 100 seconds fits the shell tool's
 * default time limit; run it a second time on `still-waiting`. After a compaction the launch notice is gone: the dispatch id is in the hand-back, and any time before the child's
 * stop serves as --after, such as the time the hand-back arrived.
 *
 * Status: `committed`, `checkpoint` (a budget checkpoint, nothing committed), `stop-failed` (the stop ended without a commit), `still-waiting`, `refused`.
 * Output: ONE JSON line. Exit 0 committed, checkpoint or still-waiting; 1 stop-failed or refused; 2 usage. It reads one private record and changes nothing.
 */
import { realpathSync, statSync } from "node:fs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { readNativeGoldfishStopOutcome } from "../lib/native-goldfish-stop-outcome.mjs";

const RESULT_SCHEMA = "pipeline.wait-host-commit-result.v1";
const USAGE = "usage: wait-host-commit.mjs --root <project-root> --dispatch <dispatch id> --after <ISO time of the launch> [--timeout-seconds <1..170>]\nAfter a compaction the launch notice is gone: any time before the child's stop serves as --after, such as the time the hand-back arrived.";
const DISPATCH = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const DEFAULT_SECONDS = 100, MAX_SECONDS = 170, POLL_MS = 1_500;
const CONTINUE = "Continue in this same turn with the next step; never end the turn to wait for a notice, because the \"Agent finished\" notice starts no turn.";
const sleep = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

function fromOutcome(outcome, waitedSeconds) {
  const common = { schema: RESULT_SCHEMA, dispatch: outcome.dispatchId, code: outcome.code, waitedSeconds };
  if (outcome.status === "authored-commit-recorded") return { exitCode: 0, result: { ...common, status: "committed", commit: outcome.commit, integration: outcome.integration, message: `The host commit is in and the stop has finished. ${CONTINUE}` } };
  // A continued child gets no new launch notice, and this record stays on disk: the next wait must start after it or it would answer "checkpoint" again before the real stop.
  if (outcome.status === "checkpoint-recorded") {
    const nextAfter = new Date(Date.parse(outcome.observedAt) + 1).toISOString();
    return { exitCode: 0, result: { ...common, status: "checkpoint", nextAfter, message: `The child stopped at a budget checkpoint and nothing was committed. Follow the checkpoint route of its hand-back, in this same turn. If you continue this same child, wait for its next stop with --after ${nextAfter}. ${outcome.message}`.trim() } };
  }
  return { exitCode: 1, result: { ...common, status: "stop-failed", commit: outcome.commit, message: `The stop finished without a recorded host commit. Follow this recovery before committing anything by hand: ${outcome.message}`.trim() } };
}

/** `deps` ({ commonDir, now, pause }) is for tests. */
export function waitForHostCommit({ root, dispatch, after, timeoutSeconds = DEFAULT_SECONDS }, deps = {}) {
  let commonDir = deps.commonDir;
  try { commonDir ??= resolveGitCommonDir(root); } catch { commonDir = null; }
  if (typeof commonDir !== "string" || commonDir === "") return { exitCode: 1, result: { schema: RESULT_SCHEMA, status: "refused", code: "WHC-REPOSITORY-UNREADABLE", reason: "the Git directory could not be read", repair: "repair the repository, then run this again" } };
  const now = deps.now ?? Date.now, pause = deps.pause ?? sleep, started = now();
  for (;;) {
    const elapsed = now() - started;
    const outcome = readNativeGoldfishStopOutcome({ commonDir, dispatchId: dispatch, after });
    if (outcome !== null) return fromOutcome(outcome, Math.round(elapsed / 1_000));
    if (elapsed >= timeoutSeconds * 1_000) return { exitCode: 0, result: { schema: RESULT_SCHEMA, status: "still-waiting", code: "WHC-NO-STOP-OUTCOME-YET", dispatch, waitedSeconds: Math.round(elapsed / 1_000),
      message: "The stop has not finished yet. Run this identical command once more in this same turn. If it answers still-waiting again, check whether the child is still running; if it has ended, inspect the working tree and recover with scripts/goldfish-host-commit-recover.mjs." } };
    pause(POLL_MS);
  }
}

function parse(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], next = argv[index + 1];
    if (!["--root", "--dispatch", "--after", "--timeout-seconds"].includes(flag) || next === undefined || next === "" || Object.hasOwn(value, flag)) return null;
    value[flag] = next;
  }
  const timeoutSeconds = value["--timeout-seconds"] === undefined ? DEFAULT_SECONDS : Number(value["--timeout-seconds"]);
  if (value["--root"] === undefined || !DISPATCH.test(value["--dispatch"] ?? "") || !ISO_TIME.test(value["--after"] ?? "") || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > MAX_SECONDS) return null;
  let root;
  try { root = realpathSync(value["--root"]); if (!statSync(root).isDirectory()) return null; } catch { return null; }
  return { root, dispatch: value["--dispatch"], after: value["--after"], timeoutSeconds };
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) { process.stdout.write(`${USAGE}\n`); process.exit(0); }
  const input = parse(argv);
  if (input === null) { process.stdout.write(`${JSON.stringify({ schema: RESULT_SCHEMA, status: "usage", code: "WHC-USAGE", message: USAGE })}\n`); process.exit(2); }
  const { exitCode, result } = waitForHostCommit(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(exitCode);
}
