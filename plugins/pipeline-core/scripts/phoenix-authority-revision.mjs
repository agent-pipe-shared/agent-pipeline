#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Proof-gated wrapper around the existing continuity authority revision writer. */
import { run as approve } from "./phoenix-authority-approval.mjs";
import { run as pipelineState } from "../../../harness/scripts/pipeline-state.mjs";

function parse(argv) {
  const [command, ...rest] = argv; const values = { command };
  for (let index = 0; index < rest.length; index += 2) { if (!rest[index]?.startsWith("--") || !rest[index + 1]) throw new Error("invalid arguments"); values[rest[index].slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = rest[index + 1]; }
  if (!new Set(["plan", "apply"]).has(command) || !values.repoRoot || !values.directory || !values.proposalFile) throw new Error("Usage: phoenix-authority-revision.mjs plan|apply --repo-root <repo> --directory <external-dir> --proposal-file <repo-file> [--request-file <repo-file> --request-sha256 <sha> --lock-token <token>]");
  return values;
}
export function run(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const verified = approve(["verify", "--repo-root", values.repoRoot, "--directory", values.directory, "--proposal", values.proposalFile]);
  if (!verified.ok) return 2;
  const deps = { dir: values.repoRoot, authorityRevisionApproval: ({ repoRoot, ...approval }) => JSON.stringify(approval) === JSON.stringify(verified.approval) ? { ok: true, value: approval } : { ok: false, code: "PHOENIX-AUTHORITY-PROOF-MISMATCH" } };
  return values.command === "plan"
    ? pipelineState(["continuity-authority-revision-plan", "--proposal-file", values.proposalFile], deps)
    : pipelineState(["continuity-authority-revision-apply", "--request-file", values.requestFile, "--request-sha256", values.requestSha256, "--lock-token", values.lockToken], deps);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) process.exitCode = run();
