#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Compatibility-named launcher for one concrete on-demand Codex consultation.
 * Session bootstrap never invokes this command.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

import {
  advisoryEvidenceBundleSha256,
  buildAdvisoryEvidenceBundle,
  createAdvisoryDemand,
} from "../lib/advisory-lifecycle-v2.mjs";
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { validatePipelineUserV3 } from "../lib/runner-profiles-v3.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";
import { resolveSystemExecutable } from "./tool-identity.mjs";
import { runAdvisoryHostBridge } from "./advisory-host-bridge.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const USAGE = "usage: codex-advisory-bootstrap.mjs --profile <epic|feature> --reason <trigger> --evidence-sha256 <sha256> --dispatch-id <id> --queue-revision <n> --session-id <id> --expected-descriptor-sha256 <sha256> --receipt <path> --reference <repo-relative-path> [--reference <repo-relative-path> ...] < question.txt";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

async function readQuestionBytes(input) {
  const chunks = [];
  let total = 0;
  for await (const chunk of input) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > 262_144) throw new Error("advisory question exceeds the 262144-byte stdin limit");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function decodeQuestion(bytes) {
  const raw = Buffer.isBuffer(bytes) || ArrayBuffer.isView(bytes) ? Buffer.from(bytes) : null;
  if (raw === null || raw.length === 0 || raw.length > 262_144) throw new Error("advisory stdin must contain exactly one bounded UTF-8 question");
  let question;
  try { question = UTF8.decode(raw); } catch { throw new Error("advisory stdin is not valid UTF-8"); }
  if (question.trim().length === 0 || question.includes("\0")) throw new Error("advisory stdin must contain exactly one bounded UTF-8 question");
  return question;
}

function parseArgs(argv) {
  const value = { references: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]; const next = argv[++index];
    if (next === undefined) throw new Error(USAGE);
    if (token === "--reference") value.references.push(next);
    else if (token === "--profile") value.profile = next;
    else if (token === "--reason") value.reason = next;
    else if (token === "--evidence-sha256") value.evidenceSha256 = next;
    else if (token === "--dispatch-id") value.dispatchId = next;
    else if (token === "--queue-revision") value.queueRevision = Number(next);
    else if (token === "--session-id") value.sessionId = next;
    else if (token === "--expected-descriptor-sha256") value.descriptorSha256 = next;
    else if (token === "--receipt") value.receipt = next;
    else throw new Error(USAGE);
  }
  if (!["epic", "feature"].includes(value.profile)
    || !/^[a-z][a-z0-9-]{0,63}$/.test(value.reason ?? "") || !SHA256.test(value.evidenceSha256 ?? "")
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value.dispatchId ?? "")
    || !Number.isSafeInteger(value.queueRevision) || value.queueRevision < 0
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value.sessionId ?? "") || !SHA256.test(value.descriptorSha256 ?? "")
    || typeof value.receipt !== "string" || value.receipt.length === 0 || value.references.length === 0
    || value.references.some((entry) => typeof entry !== "string" || entry.startsWith("/") || entry.split("/").some((part) => !part || part === "." || part === ".."))) throw new Error(USAGE);
  return value;
}

export async function runCodexAdvisoryBootstrap(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  const repoRoot = realpathSync(dependencies.repoRoot ?? process.cwd());
  (dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({
    rootDir: repoRoot,
    intent: "dispatch",
  });
  const source = parseYaml(readFileSync(join(repoRoot, "pipeline.user.yaml"), "utf8"));
  const authority = validatePipelineUserV3(source, { source: "pipeline.user.yaml" });
  if (!authority.ok || authority.advisoryExport?.consent === "declined") throw new Error("pipeline.user.v3 advisor_export is explicitly declined");
  const topology = (dependencies.resolveTopologyFn ?? resolvePoGateRepositoryTopology)(repoRoot);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot });
  const evidenceBundle = buildAdvisoryEvidenceBundle(repoRoot, args.references);
  const evidenceSha256 = advisoryEvidenceBundleSha256(evidenceBundle);
  if (evidenceSha256 !== args.evidenceSha256) throw new Error("advisory evidence digest does not match the physical allowlisted bundle");
  const questionBytes = await (dependencies.readQuestionBytesFn ?? readQuestionBytes)(process.stdin);
  const question = decodeQuestion(questionBytes);
  const resolveExecutable = dependencies.resolveExecutableFn ?? resolveSystemExecutable;
  const resolvedCodex = resolveExecutable("codex");
  if (typeof resolvedCodex !== "string") throw new Error("Codex executable is unavailable");
  const codexPath = realpathSync(resolvedCodex);
  // Codex selects the compatible sandbox helper itself.  If the bundled file
  // is present, pass it only as diagnostic evidence; it is never placed in
  // sandbox state and never attested as the selected transport.
  const helperCandidate = join(dirname(dirname(codexPath)), "codex-resources", "bwrap");
  const observedHelperPath = existsSync(helperCandidate) && lstatSync(helperCandidate).isFile() ? realpathSync(helperCandidate) : null;
  const git = (values) => execFileSync("git", values, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const candidateCommit = git(["rev-parse", "HEAD"]);
  const candidateTree = git(["rev-parse", "HEAD^{tree}"]);
  const temp = realpathSync((dependencies.mkdtempFn ?? mkdtempSync)(join(tmpdir(), "pipeline-codex-advisory-")));
  const inputPath = join(temp, `${randomUUID()}.json`);
  try {
    const dispatch = { dispatchId: args.dispatchId, queueRevision: args.queueRevision, candidateCommit, candidateTree };
    const demand = createAdvisoryDemand({
      runner: "codex",
      profile: args.profile,
      reason: args.reason,
      question,
      evidenceSha256,
      dispatch,
    });
    if (!demand.ok) throw new Error(demand.code);
    const input = {
      profile: args.profile,
      runner: "codex",
      question,
      dispatch,
      demand: demand.demand,
      references: evidenceBundle.references.map(({ path }) => path),
      evidenceBundle,
      advisorExport: source.advisor_export ?? { consent: "default" },
      sandboxContext: { repoFingerprint, referenceSetSha256: evidenceSha256 },
      sandboxRuntime: { schema: "pipeline.codex-sandbox-runtime.v1", repoRoot, codexPath, observedHelperPath, sessionCleanup: { sessionId: args.sessionId, descriptorSha256: args.descriptorSha256 } },
    };
    writeFileSync(inputPath, JSON.stringify(input), { flag: "wx", mode: 0o600 });
    return await (dependencies.runAdvisoryHostBridgeFn ?? runAdvisoryHostBridge)(["--input", inputPath, "--receipt", resolve(repoRoot, args.receipt)]);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCodexAdvisoryBootstrap().then((code) => { process.exitCode = code; }, (error) => {
    const detail = error instanceof ProjectOnboardingReadyError
      ? `${error.code}: project onboarding readiness denied advisory dispatch`
      : error.message;
    process.stderr.write(`${detail}\n`);
    process.exitCode = error.message === USAGE ? 64 : 2;
  });
}
