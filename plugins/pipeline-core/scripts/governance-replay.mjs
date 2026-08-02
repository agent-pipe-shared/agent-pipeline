#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only local replay from the verified canonical lifecycle stream. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { queryPortableGovernanceStream } from "../lib/governance-event-store.mjs";
import { projectGovernanceReplay } from "../lib/governance-replay.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parse(argv) { if (argv.length < 4 || argv.length > 6) fail("GRC-ARGUMENT", "Usage: governance-replay.mjs --repo <checkout> --repository-fingerprint <sha256> [--checkpoint-file <json>]"); const values = new Map(); for (let index = 0; index < argv.length; index += 2) { if (!["--repo", "--repository-fingerprint", "--checkpoint-file"].includes(argv[index]) || values.has(argv[index]) || argv[index + 1] === undefined) fail("GRC-ARGUMENT", "Replay arguments are invalid."); values.set(argv[index], argv[index + 1]); } if (!values.has("--repo") || !values.has("--repository-fingerprint")) fail("GRC-ARGUMENT", "Replay arguments are incomplete."); return { repositoryRoot: values.get("--repo"), repositoryFingerprint: values.get("--repository-fingerprint"), checkpointFile: values.get("--checkpoint-file") ?? null }; }
function slim(event) { return { sequence: event.sequence, eventDigest: event.eventDigest, occurredAtEpochMs: event.occurredAtEpochMs, candidate: event.candidate, payload: event.payload }; }
export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parse(argv); let checkpoint = undefined;
  if (options.checkpointFile !== null) { try { checkpoint = parseStrictJson(await (deps.readFile ?? readFile)(options.checkpointFile)); } catch { fail("GRC-CHECKPOINT", "Checkpoint must be strict JSON."); } }
  const queried = await (deps.query ?? queryPortableGovernanceStream)({ repositoryRoot: options.repositoryRoot, repositoryFingerprint: options.repositoryFingerprint, streamId: "lifecycle", checkpoint });
  if (queried.completeness !== "verified" || queried.integrity !== "valid") return Object.freeze({ schema: "pipeline.governance-replay-readback.v1", status: "unavailable", authority: "non-authoritative", reason: "stream-unverified", timelines: Object.freeze([]) });
  return Object.freeze({ schema: "pipeline.governance-replay-readback.v1", status: "observed", authority: "non-authoritative", reason: null, checkpoint: queried.checkpoint, timelines: projectGovernanceReplay(queried.events.map(slim)) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(await main())}\n`); } catch (error) { process.stderr.write(`${error.code ?? "GRC-FAILED"}: ${error.message}\n`); process.exitCode = 2; } }
