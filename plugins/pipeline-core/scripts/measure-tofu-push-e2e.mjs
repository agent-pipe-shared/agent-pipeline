#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * NVA-CF-BL16-TOFUE2E-RETRY: end-to-end measurement of Acceptance criterion 1 of
 * backlog item 2026-08-28-a-v1-trust-anchor-makes-the-signature-push-route-functionless.md
 * -- "a freshly onboarded project completes a signature push end to end" -- via the
 * trust-on-first-use mechanism landed in commit 85fefb99 (`pinTrustAnchorOnFirstUse`,
 * `lib/critical-action-authorization.mjs`), narrowed the same day by NVA-CF-TOFUFIX to
 * require local-machine key provenance (`resolveLocalOperatorKeyAnchor`,
 * `lib/machine-plane.mjs`) rather than accepting any well-formed key.
 *
 * Sibling to `measure-fresh-repo-onboarding-turns.mjs`, reusing its
 * `measureFreshRepoOnboardingTurns()` to reach "ready" on a genuinely fresh, disposable
 * repository, then drives the real signature-push ceremony end to end via real subprocess
 * CLI calls -- never a mocked dependency, this is a black-box measurement of the
 * installed-plugin CLI surface:
 *
 *   1. `po-human-approval.mjs setup` -- generates a real Ed25519 key and persists
 *      `poKeyDirectory` into the machine-scoped configuration plane automatically
 *      ("persisted automatically by 'setup --directory'", po-human-approval.mjs).
 *   2. `pipeline-state.mjs materialize-push-threat-model`.
 *   3. `pipeline-state.mjs prepare-push-subject` -- computes the real subject digest.
 *   4. `po-human-approval.mjs authorize-critical` -- real OpenSSL signing, answered via
 *      stdin exactly as a human operator types it. The FIRST verifying signature under
 *      an anchor-less policy is what step 5 pins as the trust anchor.
 *   5. `pipeline-state.mjs approve-push` -- verifies the proof and records
 *      `pushApproval.lastApproved`.
 *
 * "No local signing key": `HOME` and `PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE` both point at
 * a fresh temp directory for every subprocess in this walk, so `os.homedir()` -- which
 * `readMachinePlane()`/`resolveLocalOperatorKeyAnchor` use with no dependency injection
 * when invoked as a real CLI subprocess -- never resolves to the real operator's own
 * machine-plane state; this repository's actual `~/.agent-pipeline/machine.json` is never
 * read or written by this script.
 *
 * Never throws: every stop this function cannot drive past is reported in the returned
 * `outcome`, mirroring the sibling script's own contract.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { measureFreshRepoOnboardingTurns } from "./measure-fresh-repo-onboarding-turns.mjs";

export const SCHEMA = "pipeline.measure-tofu-push-e2e.v1";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const PIPELINE_STATE_SCRIPT = resolve(fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url)));
const PO_HUMAN_APPROVAL_SCRIPT = resolve(fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url)));

/** Runs one real command synchronously via spawnSync -- never a mocked dependency. */
function run(argv, cwd, env, input) {
  return spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", timeout: 180000, env, input });
}

function parseJsonStdout(result) {
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch {
    return { ok: false, error: result.stdout };
  }
}

/**
 * Drives a genuinely fresh, already-`git init`-ed repository at `rootDir` through
 * onboarding and then the real trust-on-first-use signature-push ceremony. Every step is a
 * real subprocess call against the installed CLI surface; `keyDir` is a fresh, disposable
 * directory standing in for the operator's own external PO-approval directory.
 */
export function measureTofuPushEndToEnd({ rootDir, keyDir, env } = {}) {
  const dir = resolve(rootDir);
  const steps = [];

  // Step 0: onboard the fresh repository to "ready" -- the sibling script's own walk.
  const onboarding = measureFreshRepoOnboardingTurns({ rootDir: dir, runner: "claude", env });
  steps.push({ step: "onboarding", outcome: onboarding.outcome, turns: onboarding.turns });
  if (onboarding.outcome !== "ready") {
    return { schema: SCHEMA, outcome: "onboarding-not-ready", steps, onboarding };
  }

  // Step 1: the real PO key ceremony -- generates a real Ed25519 key (openssl encrypts the
  // PEM with a passphrase, prompting Enter/Verify in that order) and persists
  // poKeyDirectory into the machine plane automatically.
  const PEM_PASSPHRASE = "turn-measurement-tofu-e2e";
  // Setup prompts the passphrase THREE times: Enter, Verify (key generation), then Enter
  // again immediately afterward (setup reads the private key back once, e.g. to derive/
  // confirm the public key) -- confirmed empirically, not assumed.
  const setup = run([process.execPath, PO_HUMAN_APPROVAL_SCRIPT, "setup",
    "--repo-root", dir, "--directory", keyDir, "--human-name", "Turn Measurement"], REPO_ROOT, env,
    `${PEM_PASSPHRASE}\n${PEM_PASSPHRASE}\n${PEM_PASSPHRASE}\n`);
  steps.push({ step: "setup", exitCode: setup.status, stderr: setup.stderr?.slice(0, 2000) });
  if (setup.status !== 0) return { schema: SCHEMA, outcome: "setup-failed", steps };

  const trustPolicyPath = join(keyDir, "trust-policy.json");
  if (!existsSync(trustPolicyPath)) return { schema: SCHEMA, outcome: "setup-no-trust-policy", steps };

  // Step 2: materialize the push threat-model artifact -- a precondition for both
  // prepare-push-subject and approve-push's own policy check.
  const threatModel = run([process.execPath, PIPELINE_STATE_SCRIPT, "materialize-push-threat-model"], dir, env);
  steps.push({ step: "materialize-push-threat-model", exitCode: threatModel.status, stderr: threatModel.stderr?.slice(0, 2000) });
  if (threatModel.status !== 0) return { schema: SCHEMA, outcome: "threat-model-failed", steps };

  // Step 3: the real subject digest for this exact candidate/target.
  const subject = run([process.execPath, PIPELINE_STATE_SCRIPT, "prepare-push-subject",
    "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], dir, env);
  steps.push({ step: "prepare-push-subject", exitCode: subject.status, stderr: subject.stderr?.slice(0, 2000) });
  if (subject.status !== 0) return { schema: SCHEMA, outcome: "prepare-push-subject-failed", steps };
  const subjectParsed = parseJsonStdout(subject);
  if (!subjectParsed.ok || typeof subjectParsed.value?.subjectSha256 !== "string") {
    return { schema: SCHEMA, outcome: "prepare-push-subject-unparseable", steps, raw: subject.stdout };
  }
  const subjectSha256 = subjectParsed.value.subjectSha256;

  // The active feature's plan/spec paths, read straight off onboarding's own state -- never
  // invented, using the same convention pipeline-state.mjs itself applies
  // (specPath = dirname(planPath) + "/spec.md").
  const statePath = join(dir, "project", "pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const planPath = state?.activeFeature?.planPath;
  const featureId = state?.activeFeature?.id;
  if (typeof planPath !== "string" || typeof featureId !== "string") {
    return { schema: SCHEMA, outcome: "no-active-feature-plan-path", steps, state };
  }
  const specPath = `${dirname(planPath)}/spec.md`;
  if (!existsSync(join(dir, planPath)) || !existsSync(join(dir, specPath))) {
    return { schema: SCHEMA, outcome: "plan-or-spec-file-missing", steps, planPath, specPath };
  }

  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

  // Step 4: the human's real signing ceremony -- real OpenSSL, answered via stdin exactly
  // as a human operator would type it. This is the call whose verifying signature
  // `pinTrustAnchorOnFirstUse` pins once step 5 actually authorizes.
  const authorize = run([process.execPath, PO_HUMAN_APPROVAL_SCRIPT, "authorize-critical",
    "--repo-root", dir, "--directory", keyDir,
    "--feature-id", featureId, "--plan", planPath, "--spec", specPath,
    "--kind", "push", "--subject-sha256", subjectSha256, "--expires-at", expiresAt,
  ], dir, env, `approve\n${PEM_PASSPHRASE}\n`);
  steps.push({ step: "authorize-critical", exitCode: authorize.status, stderr: authorize.stderr?.slice(0, 2000) });
  if (authorize.status !== 0) {
    return { schema: SCHEMA, outcome: "authorize-critical-failed", steps, stdout: authorize.stdout?.slice(0, 2000) };
  }
  const authorizeParsed = parseJsonStdout(authorize);
  if (!authorizeParsed.ok || !authorizeParsed.value?.paths) {
    return { schema: SCHEMA, outcome: "authorize-critical-unparseable", steps, raw: authorize.stdout?.slice(0, 4000) };
  }
  const { request: requestPath, proof: proofPath } = authorizeParsed.value.paths;

  // Step 5: the real push approval -- verifies the proof against the project's policy
  // file. On a genuinely anchor-less policy this is the moment `pinTrustAnchorOnFirstUse`
  // writes the verifying key back as a v3 trustAnchors entry (only after every other check
  // has passed).
  const approve = run([process.execPath, PIPELINE_STATE_SCRIPT, "approve-push",
    "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main",
    "--proof-request", requestPath, "--proof-authority", trustPolicyPath, "--proof", proofPath,
  ], dir, env);
  steps.push({ step: "approve-push", exitCode: approve.status, stderr: approve.stderr?.slice(0, 2000) });
  if (approve.status !== 0) {
    return { schema: SCHEMA, outcome: "approve-push-failed", steps, stdout: approve.stdout?.slice(0, 2000) };
  }

  // Verify the recorded push proof and the pinned trust anchor directly off disk -- real
  // assertions against real files, never the CLI's own self-report.
  const finalState = JSON.parse(readFileSync(statePath, "utf8"));
  const lastApproved = finalState?.pushApproval?.lastApproved ?? null;
  const policy = JSON.parse(readFileSync(join(dir, "project", "critical-human-proof.json"), "utf8"));
  const trustAnchorPinned = policy.schema === "pipeline.critical-human-proof-policy.v3"
    && Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0;

  if (lastApproved === null || !lastApproved.criticalProof) {
    return { schema: SCHEMA, outcome: "no-recorded-push-proof", steps, finalState, policy };
  }

  return { schema: SCHEMA, outcome: "signed-push-recorded", steps, lastApproved, trustAnchorPinned, policy };
}

export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
} = {}) {
  const scratchDir = join(REPO_ROOT, "scratch");
  const fixtureHome = mkdtempSync(join(scratchDir, "measure-tofu-e2e-home-"));
  const dir = mkdtempSync(join(scratchDir, "measure-tofu-e2e-fresh-"));
  const keyDir = mkdtempSync(join(scratchDir, "measure-tofu-e2e-key-"));
  const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: fixtureHome, HOME: fixtureHome };
  try {
    run(["git", "init", "--quiet", dir], scratchDir, env);
    run(["git", "-C", dir, "config", "user.name", "Turn Measurement"], scratchDir, env);
    run(["git", "-C", dir, "config", "user.email", "turn-measurement@example.invalid"], scratchDir, env);
    const result = measureTofuPushEndToEnd({ rootDir: dir, keyDir, env });
    write(`${JSON.stringify(result, null, 2)}\n`);
    return result.outcome === "signed-push-recorded" ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fixtureHome, { recursive: true, force: true });
    rmSync(keyDir, { recursive: true, force: true });
  }
}

if (isDirectInvocation(import.meta.url)) process.exit(main());
