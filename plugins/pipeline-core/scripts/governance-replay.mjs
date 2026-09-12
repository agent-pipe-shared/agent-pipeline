#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only local replay from the verified canonical lifecycle stream. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { queryPortableGovernanceStream } from "../lib/governance-event-store.mjs";
import { projectGovernanceReplay } from "../lib/governance-replay.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function validCheckpoint(value, repositoryFingerprint, events) { const last = events.at(-1); return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 6 && ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"].every((key) => Object.hasOwn(value, key)) && /^[a-f0-9]{64}$/u.test(repositoryFingerprint) && value.repositoryFingerprint === repositoryFingerprint && value.streamId === "lifecycle" && Number.isSafeInteger(value.sequence) && value.sequence >= 1 && /^[a-f0-9]{64}$/u.test(value.eventDigest) && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.candidateCommit) && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.candidateTree) && last?.sequence === value.sequence && last.eventDigest === value.eventDigest && last.candidate?.commit === value.candidateCommit && last.candidate?.tree === value.candidateTree; }
function parse(argv) { if (argv.length < 4 || argv.length > 6) fail("GRC-ARGUMENT", "Usage: governance-replay.mjs --repo <checkout> --repository-fingerprint <sha256> [--checkpoint-file <json>]"); const values = new Map(); for (let index = 0; index < argv.length; index += 2) { if (!["--repo", "--repository-fingerprint", "--checkpoint-file"].includes(argv[index]) || values.has(argv[index]) || argv[index + 1] === undefined) fail("GRC-ARGUMENT", "Replay arguments are invalid."); values.set(argv[index], argv[index + 1]); } if (!values.has("--repo") || !values.has("--repository-fingerprint")) fail("GRC-ARGUMENT", "Replay arguments are incomplete."); return { repositoryRoot: values.get("--repo"), repositoryFingerprint: values.get("--repository-fingerprint"), checkpointFile: values.get("--checkpoint-file") ?? null }; }
function slim(event) { return { sequence: event.sequence, eventDigest: event.eventDigest, occurredAtEpochMs: event.occurredAtEpochMs, candidate: event.candidate, payloadSchema: event.payloadSchema, payload: event.payload }; }
export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parse(argv); let checkpoint = undefined;
  if (options.checkpointFile !== null) { try { checkpoint = parseStrictJson(await (deps.readFile ?? readFile)(options.checkpointFile)); } catch { fail("GRC-CHECKPOINT", "Checkpoint must be strict JSON."); } }
  const queried = await (deps.query ?? queryPortableGovernanceStream)({ repositoryRoot: options.repositoryRoot, repositoryFingerprint: options.repositoryFingerprint, streamId: "lifecycle", checkpoint });
  if (queried.completeness !== "verified" || queried.integrity !== "valid") return Object.freeze({ schema: "pipeline.governance-replay-readback.v2", status: "unavailable", authority: "non-authoritative", reason: "stream-unverified", dispatchTimelines: Object.freeze([]), actionTimelines: Object.freeze([]) });
  if (!validCheckpoint(queried.checkpoint, options.repositoryFingerprint, queried.events)) fail("GRC-CHECKPOINT", "Verified replay requires a complete lifecycle checkpoint.");
  const replay = projectGovernanceReplay(queried.events.map(slim));
  return Object.freeze({ schema: "pipeline.governance-replay-readback.v2", status: "observed", authority: "non-authoritative", reason: null, checkpoint: queried.checkpoint, dispatchTimelines: replay.dispatchTimelines, actionTimelines: replay.actionTimelines });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(await main())}\n`); } catch (error) { process.stderr.write(`${error.code ?? "GRC-FAILED"}: ${error.message}\n`); process.exitCode = 2; } }
