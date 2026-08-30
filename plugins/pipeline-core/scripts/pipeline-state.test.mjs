// SPDX-License-Identifier: SUL-1.0
/**
 * Focused coverage for the push threat-model resolution CB-1a introduced
 * (`resolvePushThreatModelArtifact`, `materialize-push-threat-model`).
 * See evidence/cb-1a-measurement.md for the measurement this responds to.
 *
 * There is exactly ONE resolution path -- `project/push-threat-model.md` --
 * deliberately not configurable (see the comment above
 * `PUSH_THREAT_MODEL_DEFAULT_PATH` in `pipeline-state.mjs`), so there is no
 * "configured path" scenario left to cover here.
 *
 * Deliberately narrow otherwise: `critical-human-proof-gate.test.mjs`
 * already covers the rest of `approve-push`'s behaviour end to end (replay
 * refused, policy-kind refusal, etc.).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { PLAN_AUTHORITY_PRD_FRAMING_CODE, PO_ACK_APPLY_CONFIRMATION_TOKEN, SCHEMA_ID, continuityLockPath, externalPathIsOutsideRoot, resolvePoRebindRunner, run, statePath, statePhaseProjectionMarker } from "./pipeline-state.mjs";
import { INTAKE_STAGING_DIRNAME } from "../lib/onboarding-continuity.mjs";
import {
  PLAN_AUTHORITY_PROMOTION_SUBCOMMAND,
  PLAN_AUTHORITY_STAGING_CODE,
} from "../lib/plan-authority-staging-guard.mjs";
import { ONBOARDING_SUBCOMMANDS } from "./project-onboarding-v3.mjs";
import { isSanctionedLifecycleCommand } from "../hooks/guard-lifecycle-ready.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const planSha256 = createHash("sha256").update("plan").digest("hex");
const specSha256 = createHash("sha256").update("spec").digest("hex");
const now = "2026-08-08T18:40:00.000Z";

function mktempProjectDir() {
  return mkdtempSync(join(tmpdir(), "cb-1a-fixture-"));
}

function freshFixture() {
  const root = mktempProjectDir();
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0", planApproved: true,
    activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256, specSha256 } },
  }, null, 2));
  const deps = { dir: root, now: () => now, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };
  return { root, deps };
}

function capturedStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.join(" ")); };
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.error = original;
  }
}

function approvePushAttempt(root, deps, pushTarget = { remote: "origin", destination: "refs/heads/main" }) {
  return capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
    "--proof-request", join(root, "missing-request.json"), "--proof-authority", join(root, "missing-authority.json"), "--proof", join(root, "missing-proof.json")], deps));
}

// AC-1/AC-2/AC-6: a fixture project that is not this repository and has no
// sprint directory, and has never had any environment variable naming a
// path, still ends up with a resolvable artifact -- via the materializing
// command the refusal itself names -- and then completes a REAL signed
// approval end to end, binding the exact bytes materialize-push-threat-model
// wrote.
{
  const { root, deps } = freshFixture();
  assert.equal(existsSync(join(root, "specs")), false, "fixture must have no sprint directory");
  assert.equal(process.env.PIPELINE_PUSH_THREAT_MODEL_PATH, undefined, "no environment variable governs this route (Correction 1)");

  const beforeMaterialize = approvePushAttempt(root, deps);
  assert.equal(beforeMaterialize.result, 2);
  assert.ok(beforeMaterialize.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE")),
    "before materializing, the refusal must name the missing-artifact code");
  assert.ok(beforeMaterialize.lines.some((line) => line.includes("materialize-push-threat-model")),
    "AC-3b: the refusal must name the exact command that creates the artifact");

  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  const materializedPath = join(root, "project", "push-threat-model.md");
  assert.ok(existsSync(materializedPath), "materialize-push-threat-model must create project/push-threat-model.md");
  const materializedBytes = readFileSync(materializedPath);

  const afterMaterialize = approvePushAttempt(root, deps);
  assert.ok(!afterMaterialize.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE")),
    "AC-6: after materializing, the artifact resolves -- the refusal is no longer the artifact-unavailable one");

  // End-to-end: a real signed approval, over the artifact exactly as materialized.
  const external = mktempProjectDir();
  const pushTarget = { remote: "origin", destination: "refs/heads/main" };
  const expectedThreatModel = { path: "project/push-threat-model.md", sha256: createHash("sha256").update(materializedBytes).digest("hex") };
  const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, ...pushTarget, threatModel: expectedThreatModel } });
  const request = createCriticalActionApprovalRequest({ candidate, featureId: "sprint-nova-epic", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action: { kind: "push", subjectSha256, expiresAt: "2026-08-08T18:50:00.000Z" } });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const authority = { keyReference: "test-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64") };
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify(authority));
  writeFileSync(proofPath, JSON.stringify(proof));

  const approved = run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
    "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps);
  assert.equal(approved, 0, "AC-1/AC-6: the materialized artifact is fully bindable end to end, no sprint directory involved");
  const state = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.deepEqual(state.pushApproval.lastApproved.threatModel, expectedThreatModel);
}

// PUSHORDER-1. `gates.push_approval: chat` (ADR-0056) is the route for a human
// without key management, and until 2026-08-09 no consumer project could take it:
// `verifyCriticalHumanProof` consulted the policy file's `requiredKinds` BEFORE the
// operator's stand-down, so a project with no `project/critical-human-proof.json`
// -- which is every fresh consumer, the file being gate-strength protected with no
// materializer -- was refused with CRITICAL-PROOF-POLICY-KIND-REQUIRED. The refusal
// demanded the project declare push as proof-requiring in exactly the configuration
// where its operator had committed the opposite. Found by measuring the push gate's
// satisfying path end to end; nothing covered this code at all.
{
  const root = mktempProjectDir();
  const gitAt = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  gitAt("init", "-q", "-b", "main");
  gitAt("config", "user.email", "po@example.invalid");
  gitAt("config", "user.name", "PO");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0", planApproved: true,
    activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256, specSha256 } },
  }, null, 2));
  // Deliberately NO project/critical-human-proof.json: the fresh-consumer shape.
  assert.equal(existsSync(join(root, "project", "critical-human-proof.json")), false);
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\ngates:\n  push_approval: chat\n");
  const deps = { dir: root, now: () => now, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };
  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  gitAt("add", "-A");
  gitAt("commit", "-q", "-m", "chat approval mode");
  // AGY-CHATADAPTER-1's live-subprocess test below spawns the REAL script, which
  // resolves `head.commit` via the real `git rev-parse HEAD` in `root` -- not the
  // injected `deps.gitHead` above. `pendingPushChallenge.forCommit` has to match
  // whichever commit resolves the confirming call reaches, so both the in-process
  // `run()` calls and the live subprocess must agree on one real value.
  const realHeadCommit = gitAt("rev-parse", "HEAD").stdout.trim();
  deps.gitHead = () => ({ ok: true, commit: realHeadCommit });
  deps.gitCandidate = () => ({ ok: true, commit: realHeadCommit, tree: candidate.tree });

  // 1. Calling approve-push generates a challenge token and exits 1 -- there is
  // no `--challenge` flag any more (AGY-CHATADAPTER-1): confirming is done by
  // re-running this exact command from an attended terminal, never by an argv value.
  const initialAttempt = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], deps));
  assert.equal(initialAttempt.result, 1, `initial attempt must prompt for challenge: ${initialAttempt.lines.join(" ")}`);
  assert.ok(initialAttempt.lines.some((line) => line.includes("PO-CHALLENGE")));
  const intermediate = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.ok(intermediate.pendingPushChallenge?.code, "challenge code must be recorded in state");
  const challengeCode = intermediate.pendingPushChallenge.code;

  // AGY-CHATADAPTER-1 (the actual security proof, confirmed vulnerability closed):
  // a single automated actor re-running the EXACT SAME confirming call, with no
  // attended terminal on fd 0, must NOT be able to complete the ceremony -- even
  // though it already knows the correct code (it printed it in step 1 above).
  // `deps` here carries no `isattyFn` override, so `isAttendedTerminal()` falls
  // through to the real `process.stdin.isTTY`, which is falsy for this test
  // process too -- exactly the property an agent's own tool-calling harness has.
  const unattendedRetry = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], deps));
  assert.equal(unattendedRetry.result, 1, `a non-attended retry must be refused, not silently succeed: ${unattendedRetry.lines.join(" ")}`);
  assert.ok(unattendedRetry.lines.some((line) => line.includes("CHAT-GATE-NOT-ATTENDED")),
    `the refusal must name the not-attended code: ${unattendedRetry.lines.join(" ")}`);
  const stillPending = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.equal(stillPending.pushApproval, undefined, "an unattended retry must not record an approval");

  // A live, real-process proof of the same property (no injected seam at all): the
  // actual `pipeline-state.mjs` CLI, spawned as a genuinely separate process with a
  // plain (non-TTY) piped stdin -- exactly the shape an agent's Bash tool call has --
  // fed the CORRECT code on stdin and still refused, because the gate checks
  // TTY-ness before it ever reads anything.
  const scriptPath = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
  const livePipedAttempt = spawnSync(process.execPath, [scriptPath, "approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"],
    { cwd: root, encoding: "utf8", input: `${challengeCode}\n`, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  assert.notEqual(livePipedAttempt.status, 0, `a real piped-stdin process must be refused: ${livePipedAttempt.stderr}`);
  assert.ok(livePipedAttempt.stderr.includes("CHAT-GATE-NOT-ATTENDED"),
    `the live refusal must name the not-attended code: ${livePipedAttempt.stderr}`);

  // 2. A genuinely attended confirming call (simulated via the injectable seam,
  // matching this file family's own dependency-injection convention) succeeds.
  const attendedDeps = { ...deps, isattyFn: () => true, readLineFn: () => challengeCode };
  const chatApproval = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], attendedDeps));
  assert.equal(chatApproval.result, 0, `chat mode must be reachable from an attended terminal: ${chatApproval.lines.join(" ")}`);
  const recorded = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  // The record has to say on its face that no proof backed it -- guard-push refuses
  // an approval recorded under a different policy than the one now in force.
  assert.equal(recorded.pushApproval.lastApproved.criticalProofWaiver.kind, "push");
  assert.equal(recorded.pushApproval.lastApproved.criticalProofWaiver.mode, "chat");
  assert.equal(recorded.pendingPushChallenge, undefined, "challenge must be cleared on approval");

  // An attended call that types the WRONG value must still be refused, and must
  // not consume/clear the pending challenge (the human gets to retry).
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    ...recorded, pushApproval: undefined,
    pendingPushChallenge: { code: "PO-ABCD", forCommit: realHeadCommit, remote: "origin", destination: "refs/heads/main", expiresAt: new Date(Date.now() + 600000).toISOString() },
  }));
  const wrongTypedValue = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"],
    { ...deps, isattyFn: () => true, readLineFn: () => "PO-WRONG" }));
  assert.equal(wrongTypedValue.result, 1, `a mismatched typed value must be refused: ${wrongTypedValue.lines.join(" ")}`);
  assert.ok(wrongTypedValue.lines.some((line) => line.includes("CHAT-GATE-CONFIRMATION-MISMATCH")));

  // The other half of the ordering: with the stand-down absent, `signature` is the
  // default and the six-flag ceremony is still demanded. Moving the waiver check
  // ahead of `requiredKinds` must not have turned "no policy" into "no gate".
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\ngates:\n  push_approval: signature\n");
  gitAt("add", "-A");
  gitAt("commit", "-q", "-m", "signature approval mode");
  const signatureApproval = approvePushAttempt(root, deps);
  assert.equal(signatureApproval.result, 2, "signature mode must still refuse an unproven approval");
  assert.ok(signatureApproval.lines.some((line) => line.includes("CRITICAL-PROOF-POLICY-KIND-REQUIRED")),
    `the requiredKinds gate must survive for every non-waived kind: ${signatureApproval.lines.join(" ")}`);
}

// NVA-CF-BL13-PENDINGWRITETEST. Dedicated unit-level coverage, at the exact write
// site, for the NVA-PUSHFOLD-1 "hint" half (backlog/items/2026-08-26-push-approval-
// record-always-trails-the-signed-commit.md): `approve-push`'s success write must
// also set `pushApproval.lastApproved.pendingAuditWrite = true`, the upfront,
// immediately-visible marker the 2026-08-29 PO decision asked for. Until now this
// field was only proven end to end in `push-prepare.test.mjs` (that file's own
// comment explains why: this suite is TP-protected in general project checkouts,
// but the Pipeline's OWN repository -- this file -- is the one place a dedicated
// unit test at the write site can actually live). Mirrors the PUSHORDER-1 chat-mode
// fixture above (no external-key ceremony needed) rather than the full signed-proof
// path, since only the field on the resulting record is under test here.
{
  const root = mktempProjectDir();
  const gitAt = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  gitAt("init", "-q", "-b", "main");
  gitAt("config", "user.email", "po@example.invalid");
  gitAt("config", "user.name", "PO");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0", planApproved: true,
    activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256, specSha256 } },
  }, null, 2));
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\ngates:\n  push_approval: chat\n");
  const deps = { dir: root, now: () => now, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };
  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  gitAt("add", "-A");
  gitAt("commit", "-q", "-m", "pendingAuditWrite fixture baseline");
  const realHeadCommit = gitAt("rev-parse", "HEAD").stdout.trim();
  deps.gitHead = () => ({ ok: true, commit: realHeadCommit });
  deps.gitCandidate = () => ({ ok: true, commit: realHeadCommit, tree: candidate.tree });

  const challenge = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], deps));
  assert.equal(challenge.result, 1, `challenge step must succeed: ${challenge.lines.join(" ")}`);
  const challengeCode = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8")).pendingPushChallenge.code;

  const attendedDeps = { ...deps, isattyFn: () => true, readLineFn: () => challengeCode };
  const approval = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], attendedDeps));
  assert.equal(approval.result, 0, `attended confirming call must succeed: ${approval.lines.join(" ")}`);

  const state = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.equal(state.pushApproval.lastApproved.pendingAuditWrite, true,
    "approve-push's own write must set pendingAuditWrite = true on success (NVA-PUSHFOLD-1 hint half)");
}

// PUSHDIR-1. Both of these refusals used to name a `--dir` flag. There is no such
// flag anywhere in this script -- the project directory comes from
// CLAUDE_PROJECT_DIR or the cwd -- and `parseExactFlags` is closed, so a consumer
// who obeyed the message got the same refusal back for obeying it. Same class as
// the `--help` refusals both 2026-08-09 greenfield runs hit.
{
  const { root, deps } = freshFixture();
  const withPhantomFlag = capturedStderr(() => run(["materialize-push-threat-model", "--dir", root], deps));
  assert.equal(withPhantomFlag.result, 2);
  assert.ok(withPhantomFlag.lines.every((line) => !line.includes("--dir")),
    `a refusal must not name a flag this command rejects: ${withPhantomFlag.lines.join(" ")}`);
  const missingArtifact = approvePushAttempt(root, deps);
  assert.ok(missingArtifact.lines.every((line) => !line.includes("--dir")),
    `the artifact-unavailable refusal must not name a nonexistent flag: ${missingArtifact.lines.join(" ")}`);
  // NVA-R37-SIGWALKIT (backlog/items/2026-08-28-agents-talk-the-po-out-of-the-signature-
  // instead-of-walking-it.md): this refusal used to name `chat` as an alternative
  // ("or switch to chat mode"), which is exactly the fork-with-no-marker defect that
  // let agents lobby the PO to abandon the one real protection in the model. The
  // corrected contract is the opposite: exactly ONE route (sign it), the true PO cost
  // stated (one command, one passphrase), and no chat mention, no self-push
  // suggestion. This is the FLAG-SET refusal, reached by omitting the proof flags,
  // exactly what the 2026-08-09 Claude session did before it pushed anyway.
  const sixFlags = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], deps));
  assert.equal(sixFlags.result, 2);
  const sixFlagsText = sixFlags.lines.join(" ");
  assert.ok(!/gates\.push_approval:\s*chat|switch(?:ing)? to chat|chat mode instead|to let a human clear.*instead/i.test(sixFlagsText),
    `the signature-mode refusal must offer no chat alternative: ${sixFlagsText}`);
  assert.ok(!/push it yourself|you could push instead|push it .* instead of running|po push the commit/i.test(sixFlagsText),
    `the signature-mode refusal must offer no self-push suggestion: ${sixFlagsText}`);
  assert.ok(/one command/i.test(sixFlagsText) && /passphrase/i.test(sixFlagsText),
    `the signature-mode refusal must state the true PO cost (one command, one passphrase): ${sixFlagsText}`);
  assert.ok(/pure digest computation/i.test(sixFlagsText) && /needing no key/i.test(sixFlagsText),
    `the signature-mode refusal must state which steps the agent performs itself, needing no key: ${sixFlagsText}`);
}

// HELP-1. `--help` is a question, not an error. Both 2026-08-09 greenfield runs
// asked it and were told `unknown command "--help"` -- true and useless, since a
// reader who does not already know the verbs cannot ask for them without first
// guessing one wrong. And the verb list the refusal carried had already fallen
// behind: `materialize-push-threat-model` was absent from it while ANOTHER refusal
// names that exact command as the way out of a stuck approval. This test binds the
// three together -- help, refusal, and the real dispatch -- so they cannot drift
// again.
{
  const { root, deps } = freshFixture();
  const lines = [];
  const original = console.log;
  console.log = (...args) => { lines.push(args.join(" ")); };
  let helpExit;
  try { helpExit = run(["--help"], deps); } finally { console.log = original; }
  const help = lines.join("\n");
  assert.equal(helpExit, 0, "asking for help is not a failure");
  assert.ok(help.includes("materialize-push-threat-model"),
    "the command another refusal sends operators to must be listed");
  // The help says there is NO `--dir` flag rather than staying silent about it:
  // two refusals used to name one, so a reader who saw those needs the correction,
  // not just its absence.
  assert.match(help, /no --dir flag/u, "help must state that --dir does not exist");
  assert.ok(help.includes("CLAUDE_PROJECT_DIR"), "help must say where the project directory comes from");

  const unknown = capturedStderr(() => run(["definitely-not-a-command"], deps));
  assert.equal(unknown.result, 2);
  const refusal = unknown.lines.join("\n");
  assert.ok(refusal.includes("materialize-push-threat-model"));
  assert.ok(refusal.includes("--help"), "the refusal must point at the question that answers it");

  // Every name the two lists advertise must actually dispatch: an advertised verb
  // that falls through to `default` would be the same defect pointing the other way.
  for (const command of ["materialize-push-threat-model", "approve-push", "submit-plan"]) {
    const attempted = capturedStderr(() => run([command], deps));
    assert.ok(!attempted.lines.join("\n").includes(`unknown command "${command}"`),
      `${command} is advertised and must reach its own handler`);
  }
  assert.ok(existsSync(join(root, "project")));
}

// AC-3c: materialize-push-threat-model refuses to overwrite an existing artifact.
{
  const { root, deps } = freshFixture();
  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  const before = readFileSync(join(root, "project", "push-threat-model.md"), "utf8");
  const second = capturedStderr(() => run(["materialize-push-threat-model"], deps));
  assert.equal(second.result, 2);
  assert.ok(second.lines.some((line) => line.includes("already exists")));
  assert.equal(readFileSync(join(root, "project", "push-threat-model.md"), "utf8"), before, "an existing artifact must be byte-for-byte untouched");
}

// A non-UNAVAILABLE refusal (an unsafe file already at the conventional path)
// is reported plainly and does NOT steer the operator at
// materialize-push-threat-model, which would only refuse again there.
{
  const { root, deps } = freshFixture();
  const target = join(root, "project", "push-threat-model.md");
  const linkTarget = join(root, "project", "push-threat-model-real.md");
  writeFileSync(linkTarget, "not the real artifact\n");
  symlinkSync(linkTarget, target);
  const refused = approvePushAttempt(root, deps);
  assert.equal(refused.result, 2);
  assert.ok(refused.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNSAFE")));
  assert.ok(!refused.lines.some((line) => line.includes("materialize-push-threat-model")),
    "a symlink at the conventional path is not the missing-artifact case");
}

// SETUP1-1 (GF-067). `po-human-approval.mjs setup --human-name` writes local
// authority records with THREE fields -- {keyReference, publicKeySha256,
// humanName} -- and that is also the shape of the external `--proof-authority`
// file a consumer hands to `approve-push`. `verifyCriticalHumanProof` used to
// forward `authority.value` unnarrowed into `trustPolicy`, and the shared
// `own()` exact-key-set check (po-approval-proof.mjs) rejects any object whose
// key set is not EXACTLY {keyReference, publicKeySha256} -- so a fresh,
// correctly generated three-field authority file was refused outright, even
// with perfectly valid key material and signature.
// backlog/items/2026-08-09-approve-push-rejects-any-fresh-post-setup1-authority-file.md
{
  const { root, deps } = freshFixture();
  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  const materializedBytes = readFileSync(join(root, "project", "push-threat-model.md"));
  const external = mktempProjectDir();
  const pushTarget = { remote: "origin", destination: "refs/heads/main" };
  const expectedThreatModel = { path: "project/push-threat-model.md", sha256: createHash("sha256").update(materializedBytes).digest("hex") };
  const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, ...pushTarget, threatModel: expectedThreatModel } });
  const request = createCriticalActionApprovalRequest({ candidate, featureId: "sprint-nova-epic", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action: { kind: "push", subjectSha256, expiresAt: "2026-08-08T18:50:00.000Z" } });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  // The modern, SETUP-1 (three-field) authority shape `po-human-approval.mjs
  // setup --human-name` actually produces -- NOT the legacy two-field shape.
  const authority = { keyReference: "test-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex"), humanName: "Jordan PO" };
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64") };
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify(authority));
  writeFileSync(proofPath, JSON.stringify(proof));

  const approval = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
    "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps));
  assert.equal(approval.result, 0, `GF-067: a fresh three-field (SETUP-1) authority file must be accepted, not rejected as an exact-shape mismatch: ${approval.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.deepEqual(state.pushApproval.lastApproved.threatModel, expectedThreatModel);
}

// SETUP1-2 (GF-067). The legacy, pre-SETUP-1 two-field authority shape must
// keep working exactly as before -- this is a compatibility fix, not a schema
// migration, so the narrowing in `verifyCriticalHumanProof` must be a no-op
// for an authority file that already had exactly the two key-identity fields.
{
  const { root, deps } = freshFixture();
  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  const materializedBytes = readFileSync(join(root, "project", "push-threat-model.md"));
  const external = mktempProjectDir();
  const pushTarget = { remote: "origin", destination: "refs/heads/main" };
  const expectedThreatModel = { path: "project/push-threat-model.md", sha256: createHash("sha256").update(materializedBytes).digest("hex") };
  const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, ...pushTarget, threatModel: expectedThreatModel } });
  const request = createCriticalActionApprovalRequest({ candidate, featureId: "sprint-nova-epic", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action: { kind: "push", subjectSha256, expiresAt: "2026-08-08T18:50:00.000Z" } });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  // The legacy, pre-SETUP-1 shape -- exactly the two key-identity fields, no `humanName`.
  const authority = { keyReference: "test-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64") };
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify(authority));
  writeFileSync(proofPath, JSON.stringify(proof));

  const approval = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
    "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps));
  assert.equal(approval.result, 0, `a legacy two-field authority file must keep being accepted: ${approval.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.deepEqual(state.pushApproval.lastApproved.threatModel, expectedThreatModel);
}

// NVA-WINPATH-3 (backlog/items/2026-08-17-external-public-json-cross-drive-windows-paths-are-
// not-recognized-as-outside-the-project-root.md): externalPublicJson()'s containment check
// previously used the default (host-platform) relative(), whose win32 answer for two DIFFERENT
// drive letters is the unchanged absolute target path, never a ".."-prefixed one -- so a
// genuinely external cross-drive proof path was silently misclassified as "inside", and
// approve-push refused a real, correctly PO-signed proof with CRITICAL-PROOF-EXTERNAL-PATH.
// `externalPathIsOutsideRoot` is the extracted, platform-injectable containment check exercised
// directly here -- pure string logic, no filesystem access, so the win32 answer is provable on
// this (POSIX) CI host, exactly like the sibling fixes' own test seam (NVA-WINPATH-1/2 in
// po-human-approval.test.mjs, `outside()`).
{
  // The repro: root and path on different Windows drive letters. Before the fix this resolved
  // `false` (wrongly "inside"); the correct answer is `true` ("outside").
  assert.equal(externalPathIsOutsideRoot("D:\\proj", "C:\\Users\\x\\key.json", "win32"), true,
    "NVA-WINPATH-3: a cross-drive Windows path must be classified as outside the project root");

  // Regression guard: an ordinary same-drive path INSIDE the root must still classify as
  // inside, not outside -- the fix must not turn every path "outside" by accident.
  assert.equal(externalPathIsOutsideRoot("D:\\proj", "D:\\proj\\sub\\file.json", "win32"), false,
    "a same-drive path inside the root must still classify as inside");

  // Regression guard for the sibling fix's own shape (NVA-WINPATH-1/2): a genuinely external,
  // SAME-drive path must still classify as outside once win32's backslash-separated relative()
  // output is normalized.
  assert.equal(externalPathIsOutsideRoot("D:\\proj", "D:\\other\\key.json", "win32"), true,
    "a same-drive path outside the root must still classify as outside (NVA-WINPATH-1/2 shape)");

  // The root itself is never "outside" itself.
  assert.equal(externalPathIsOutsideRoot("D:\\proj", "D:\\proj", "win32"), false,
    "the root itself must never classify as outside itself");

  // POSIX behaviour is unaffected by the platform-selection fix.
  assert.equal(externalPathIsOutsideRoot("/repo", "/other/key.json", "linux"), true);
  assert.equal(externalPathIsOutsideRoot("/repo", "/repo/sub/key.json", "linux"), false);
  assert.equal(externalPathIsOutsideRoot("/repo", "/repo", "linux"), false);
}

// NVA-W4-2B. po-authority-acknowledge-plan/apply: an atomic route that inserts
// PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER into an already-bound PRD without
// releasing continuity's binding to it (no reopen-design/submit-plan/
// approve-plan round trip), mirroring po-authority-rebind-plan/apply's own
// transactional shape -- see the block comment above
// buildPoAuthorityAcknowledgePlan in pipeline-state.mjs. Fixture shape mirrors
// pipeline-state-rebind-runner.test.mjs's own seedPoAuthorityRebind-mirroring
// fixture (a state/continuity pair already bound to a PRD/spec pair), adapted
// for the pre-plan-approval state (planApproved: false) the acknowledgement
// marker belongs in, and mocking `poGateAuthority`/`v4Inspection` for the same
// reason that file does: the in-transaction postimage readback would otherwise
// need a fully onboarded project tree this fixture does not build.
function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function acknowledgeFixture(name, { prdText } = {}) {
  const root = mktempProjectDir();
  mkdirSync(join(root, "specs", "ack-feature"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  const planPath = "specs/ack-feature/prd_ack-feature.md";
  const specPath = "specs/ack-feature/spec.md";
  writeFileSync(join(root, specPath), "# Technical Spec\nSome content.\n");
  const specSha = sha256Hex(readFileSync(join(root, specPath)));
  writeFileSync(join(root, planPath), prdText ?? "# PRD\nSome content.\n");
  const planSha = sha256Hex(readFileSync(join(root, planPath)));
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64), repositoryFingerprint: "4".repeat(64),
  };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId: "ack-feature", revision: 2,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: planPath, sha256: planSha }, spec: { path: specPath, sha256: specSha }, result: null },
    queueHead: { packageId: "ack", actionId: "review", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const state = {
    schema: SCHEMA_ID, activeFeature: { id: "ack-feature", planPath, phase: "design" }, planApproved: false,
    continuity, updatedAt: "2026-08-18T10:00:00.000Z",
  };
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");
  const deps = {
    dir: root, now: () => "2026-08-18T10:05:00.000Z",
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: ({ expectedPlanSha256, expectedSpecSha256 }) => ({
      ok: true,
      value: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: expectedPlanSha256, specPath, specSha256: expectedSpecSha256 },
    }),
    v4Inspection: () => ({ status: "ready" }),
  };
  return { root, deps, planPath, specPath, planSha, specSha };
}

function invokeCaptured(argv, deps) {
  const originalLog = console.log;
  const originalError = console.error;
  const out = []; const err = [];
  console.log = (...args) => { out.push(args.join(" ")); };
  console.error = (...args) => { err.push(args.join(" ")); };
  try {
    return { status: run(argv, deps), out: out.join("\n"), err: err.join("\n") };
  } finally {
    console.log = originalLog; console.error = originalError;
  }
}

// Happy path: plan then apply inserts the marker as a new trailing PRD line,
// bumps continuity.revision, and rebinds continuity.authority.prd.sha256 to
// the new bytes -- without ever releasing the binding.
{
  const { root, deps, planPath } = acknowledgeFixture("happy");
  const planned = invokeCaptured(["po-authority-acknowledge-plan", "--by", "PO"], deps);
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  assert.equal(plan.schema, "pipeline.po-authority-acknowledge-plan.v1");
  // AGY-PRDGATE-1/AGY-CF-BL15: apply is gated by requireAttendedChatGateConfirmation();
  // a genuinely attended confirming call (simulated via the injectable seam)
  // must retype the fixed PO_ACK_APPLY_CONFIRMATION_TOKEN to succeed -- never
  // --by itself (backlog/items/2026-08-28-a-gate-should-not-demand-a-human-
  // name-typed-byte-exactly.md).
  const attendedDeps = { ...deps, isattyFn: () => true, readLineFn: () => PO_ACK_APPLY_CONFIRMATION_TOKEN };
  const applied = invokeCaptured(plan.applyAction.argv.slice(1), attendedDeps);
  assert.equal(applied.status, 0, applied.err);
  const prdAfter = readFileSync(join(root, planPath), "utf8");
  assert.match(prdAfter, /<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->/u,
    "the apply must insert the sanctioned marker line");
  const stateAfter = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.equal(stateAfter.continuity.revision, 3, "the apply must bump continuity.revision");
  assert.equal(stateAfter.continuity.authority.prd.sha256, sha256Hex(Buffer.from(prdAfter, "utf8")),
    "the apply must rebind continuity.authority.prd.sha256 to the marker-carrying bytes");
  // Critic F-A, 2026-08-19: the --by attribution must actually reach a
  // persisted artifact, not only the ephemeral plan payload.
  assert.deepEqual(stateAfter.poGateAcknowledgement, { by: "PO", at: plan.plannedAt },
    "the apply must durably record who acknowledged and when");

  // Re-running the plan against the now-acknowledged PRD must refuse: the
  // marker is already present, and the route is one-shot per PRD.
  const rePlanned = invokeCaptured(["po-authority-acknowledge-plan", "--by", "PO"], deps);
  assert.equal(rePlanned.status, 2);
  assert.ok(rePlanned.err.includes("PO-ACK-ALREADY-ACKNOWLEDGED"), rePlanned.err);
}

// Rejection: already acknowledged. Plan must refuse without mutating anything
// when the marker is already present exactly once.
{
  const { root, deps, planPath } = acknowledgeFixture("already-acknowledged", {
    prdText: "# PRD\nSome content.\n\n<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->\n",
  });
  const before = readFileSync(join(root, planPath), "utf8");
  const beforeState = readFileSync(statePath(root), "utf8");
  const refused = invokeCaptured(["po-authority-acknowledge-plan", "--by", "PO"], deps);
  assert.equal(refused.status, 2);
  assert.ok(refused.err.includes("PO-ACK-ALREADY-ACKNOWLEDGED"), refused.err);
  assert.equal(readFileSync(join(root, planPath), "utf8"), before, "an already-acknowledged PRD must be byte-for-byte untouched");
  assert.equal(readFileSync(statePath(root), "utf8"), beforeState, "an already-acknowledged plan refusal must not touch State either");
}

// Rejection: digest mismatch. A stale --plan-sha256 (the PRD/State moved on,
// or was simply mistyped) must refuse with zero mutation, exactly like the
// sibling rebind/decision routes it shares runPoAuthorityRebindApply with.
{
  const { root, deps, planPath } = acknowledgeFixture("digest-mismatch");
  const planned = invokeCaptured(["po-authority-acknowledge-plan", "--by", "PO"], deps);
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  const realArgv = plan.applyAction.argv.slice(1);
  const shaIndex = realArgv.indexOf("--plan-sha256") + 1;
  const wrongSha = realArgv[shaIndex] === "f".repeat(64) ? "e".repeat(64) : "f".repeat(64);
  const staleArgv = [...realArgv];
  staleArgv[shaIndex] = wrongSha;
  const before = readFileSync(join(root, planPath), "utf8");
  const beforeState = readFileSync(statePath(root), "utf8");
  // AGY-PRDGATE-1/AGY-CF-BL15: the attended confirmation types the fixed
  // token (independent of --by), passes the gate, and falls through to the
  // pre-existing stale-plan digest refusal below.
  const attendedDeps = { ...deps, isattyFn: () => true, readLineFn: () => PO_ACK_APPLY_CONFIRMATION_TOKEN };
  const rejected = invokeCaptured(staleArgv, attendedDeps);
  assert.equal(rejected.status, 2);
  assert.ok(rejected.err.toLowerCase().includes("stale"), rejected.err);
  assert.equal(readFileSync(join(root, planPath), "utf8"), before, "a stale-digest apply must leave the PRD untouched");
  assert.equal(readFileSync(statePath(root), "utf8"), beforeState, "a stale-digest apply must leave State untouched");
}

// Rejection (Critic F1, 2026-08-19): an unattributed acknowledgement must be
// refused before anything else is even read -- an agent cannot satisfy the
// PO plan gate without naming who reviewed the content.
{
  const { deps } = acknowledgeFixture("by-required-blank");
  const missing = invokeCaptured(["po-authority-acknowledge-plan"], deps);
  assert.equal(missing.status, 2);
  assert.ok(missing.err.includes("--by"), missing.err);
  const blank = invokeCaptured(["po-authority-acknowledge-plan", "--by", ""], deps);
  assert.equal(blank.status, 2);
  assert.ok(blank.err.includes("--by"), blank.err);
}

// F1 fix, structural proof: --by is part of the hashed plan payload, so an
// apply whose --by disagrees with what was planned is caught by the SAME
// stale-plan digest check every other preimage/postimage field already
// relies on -- not a separate, bolt-on comparison that could be forgotten.
{
  const { root, deps, planPath } = acknowledgeFixture("by-bound-to-digest");
  const planned = invokeCaptured(["po-authority-acknowledge-plan", "--by", "PO"], deps);
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  assert.equal(plan.by, "PO", "the plan payload must record who is attributed");
  const realArgv = plan.applyAction.argv.slice(1);
  const byIndex = realArgv.indexOf("--by") + 1;
  const mismatchedArgv = [...realArgv];
  mismatchedArgv[byIndex] = "Someone Else";
  const before = readFileSync(join(root, planPath), "utf8");
  const beforeState = readFileSync(statePath(root), "utf8");
  // AGY-CF-BL15: the confirmation gate compares against the fixed token, not
  // --by, so an attended retyping of the token still passes the gate
  // regardless of the (wrong, mismatched-attribution) --by value, and falls
  // through to the pre-existing stale-plan digest refusal below -- proving
  // --by's binding lives in the digest check, never in the confirmation gate.
  const mismatchedAttendedDeps = { ...deps, isattyFn: () => true, readLineFn: () => PO_ACK_APPLY_CONFIRMATION_TOKEN };
  const rejected = invokeCaptured(mismatchedArgv, mismatchedAttendedDeps);
  assert.equal(rejected.status, 2);
  assert.ok(rejected.err.toLowerCase().includes("stale"), rejected.err);
  assert.equal(readFileSync(join(root, planPath), "utf8"), before, "a mismatched-attribution apply must leave the PRD untouched");
  assert.equal(readFileSync(statePath(root), "utf8"), beforeState, "a mismatched-attribution apply must leave State untouched");
  // The exact --by the plan recorded still applies cleanly.
  const realAttendedDeps = { ...deps, isattyFn: () => true, readLineFn: () => PO_ACK_APPLY_CONFIRMATION_TOKEN };
  const applied = invokeCaptured(realArgv, realAttendedDeps);
  assert.equal(applied.status, 0, applied.err);
}

// NVA-G-ROLLBACKPREDICATE (backlog/items/2026-08-28-a-fail-closed-rollback-
// names-no-predicate-so-a-consumer-cannot-fix-it.md): a postimage readback
// failure must name WHICH predicate failed, with expected/observed values,
// not just "rollback verified" -- and must never leak an absolute host path.
// deps.v4Inspection is used ONLY inside the postimage readback (never during
// plan build/preimage), so failing exactly one intent there deterministically
// fails only the v4Intents predicate without disturbing anything else.
{
  const { root, deps, planPath } = acknowledgeFixture("postimage-predicate-named");
  const planned = invokeCaptured(["po-authority-acknowledge-plan", "--by", "PO"], deps);
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  const before = readFileSync(join(root, planPath), "utf8");
  const beforeState = readFileSync(statePath(root), "utf8");
  const observed = [];
  const failingDeps = {
    ...deps,
    isattyFn: () => true, readLineFn: () => PO_ACK_APPLY_CONFIRMATION_TOKEN,
    v4Inspection: (request) => request.intent === "dispatch"
      ? { status: "blocked", diagnostics: [{ code: "TEST-INJECTED-NOT-READY" }] }
      : { status: "ready" },
    observeRebindPostimageEvidence: (evidence) => { observed.push(evidence); },
  };
  const applied = invokeCaptured(plan.applyAction.argv.slice(1), failingDeps);
  assert.equal(applied.status, 2);
  assert.ok(applied.err.includes("postimage readback failed"), applied.err);
  assert.ok(applied.err.includes("v4Intents.dispatch"), applied.err);
  assert.ok(applied.err.includes("observed=blocked"), applied.err);
  // NVA-PS53J-1b: this assertion and the rendering it checks both arrived in
  // commit c16e40e1 (2026-08-28), contradicting PS53j
  // (harness/scripts/pipeline-state.test.mjs, standing since 2026-08-01),
  // which forbids the readback's own diagnostic codes from reaching the log.
  // PS53j is older and wins; the predicate naming above (v4Intents.dispatch,
  // observed=blocked) is this block's actual documented purpose and is
  // unaffected.
  assert.ok(!applied.err.includes("TEST-INJECTED-NOT-READY"), "the readback payload's diagnostic codes must not reach the log (harness/scripts/pipeline-state.test.mjs PS53j)");
  assert.ok(applied.err.includes("rollback verified"), applied.err);
  assert.ok(!applied.err.includes(root), "the message must not leak an absolute host path");
  assert.ok(!/[A-Za-z]:\\|\/home\/|\/Users\//u.test(applied.err), "the message must not leak an absolute host path");
  // The observation hook the fix reads from really did carry the failing
  // predicate -- the fix surfaces information already computed, it does not
  // invent it.
  assert.equal(observed.length, 1);
  assert.equal(observed[0].predicates.v4Intents.find((r) => r.intent === "dispatch").ok, false);
  // Fail-closed behaviour itself is unchanged: rollback actually happened.
  assert.equal(readFileSync(join(root, planPath), "utf8"), before, "a failed postimage readback must leave the PRD untouched");
  assert.equal(readFileSync(statePath(root), "utf8"), beforeState, "a failed postimage readback must leave State untouched");
}

// AGY-CF-BL15 (backlog/items/2026-08-28-a-gate-should-not-demand-a-human-name-
// typed-byte-exactly.md): the compared confirmation value must be a short,
// fixed ASCII token, independent of --by -- never the free-form name itself
// (arbitrary Unicode, arbitrary length, not reliably reproducible through
// every terminal's input path). Proven two ways: (1) the token itself is
// short, printable ASCII; (2) an attended confirmation that types the token
// succeeds for a --by value carrying non-ASCII bytes that could never
// themselves survive a byte-exact console retype, while typing that --by
// value back (the OLD comparison) is now refused.
{
  assert.ok(/^[\x21-\x7E]{1,32}$/u.test(PO_ACK_APPLY_CONFIRMATION_TOKEN),
    `the confirmation token must be short, printable ASCII: ${JSON.stringify(PO_ACK_APPLY_CONFIRMATION_TOKEN)}`);

  const { deps } = acknowledgeFixture("token-independent-of-by");
  const planned = invokeCaptured(["po-authority-acknowledge-plan", "--by", "André"], deps);
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  assert.equal(plan.by, "André", "a non-ASCII --by value must still be accepted and planned");

  // Typing the (non-ASCII, disclosed) --by value back is refused: the gate no
  // longer compares against it.
  const typedByValue = invokeCaptured(plan.applyAction.argv.slice(1),
    { ...deps, isattyFn: () => true, readLineFn: () => plan.by });
  assert.equal(typedByValue.status, 1, typedByValue.err);
  assert.ok(typedByValue.err.includes("CHAT-GATE-CONFIRMATION-MISMATCH"), typedByValue.err);

  // Typing the fixed token succeeds -- independent of what --by was.
  const typedToken = invokeCaptured(plan.applyAction.argv.slice(1),
    { ...deps, isattyFn: () => true, readLineFn: () => PO_ACK_APPLY_CONFIRMATION_TOKEN });
  assert.equal(typedToken.status, 0, typedToken.err);
}

// AGY-CF-BL15: the disclosure must still show the human's name unchanged,
// even though the COMPARED value no longer is it (acceptance criterion: "the
// disclosure still shows the human name, unchanged, so the audit trail is
// not reduced").
{
  const { deps } = acknowledgeFixture("disclosure-unchanged");
  const planned = invokeCaptured(["po-authority-acknowledge-plan", "--by", "Jordan Rivera"], deps);
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  let capturedPrompt = null;
  const attendedDeps = {
    ...deps, isattyFn: () => true,
    readLineFn: (prompt) => { capturedPrompt = prompt; return PO_ACK_APPLY_CONFIRMATION_TOKEN; },
  };
  const applied = invokeCaptured(plan.applyAction.argv.slice(1), attendedDeps);
  assert.equal(applied.status, 0, applied.err);
  assert.ok(capturedPrompt !== null, "the confirmation prompt must be built and shown");
  assert.ok(capturedPrompt.includes(`by: ${plan.by}`),
    `the disclosed human name must still appear unchanged in the confirmation summary: ${capturedPrompt}`);
  // Durable audit trail: the persisted acknowledgement still records the real
  // human name, never the fixed token.
  const stateAfter = JSON.parse(readFileSync(statePath(deps.dir), "utf8"));
  assert.equal(stateAfter.poGateAcknowledgement.by, "Jordan Rivera",
    "the durable acknowledgement record must keep the disclosed human name, not the confirmation token");
}

// NVA-STAGINGBOLT-1: a plan submission or approval whose plan or spec path
// resolves inside the onboarding staging directory must be refused -- the
// generated staging files' own banner says they are NOT yet bound as project
// authority (backlog:
// 2026-08-27-plan-approval-binds-a-staging-draft-as-project-authority.md).
// Fixture shape mirrors acknowledgeFixture() above: a state/continuity pair
// already bound to a plan/spec pair, deps mocking poGateAuthority/poGateProfile
// so no real onboarded project tree is needed.
function planAuthorityFixture({ featureId, planPath, specPath, now = "2026-08-27T10:00:00.000Z" }) {
  const root = mktempProjectDir();
  mkdirSync(join(root, "project"), { recursive: true });
  const planSha256 = sha256Hex(`plan:${planPath}`);
  const specSha256 = sha256Hex(`spec:${specPath}`);
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64), repositoryFingerprint: "4".repeat(64),
  };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId, revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: { prd: { path: planPath, sha256: planSha256 }, spec: { path: specPath, sha256: specSha256 }, result: null },
    queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const state = {
    schema: SCHEMA_ID, activeFeature: { id: featureId, planPath, phase: "design" }, planApproved: false,
    continuity, updatedAt: now,
  };
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");
  const deps = {
    dir: root, now: () => now,
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: () => ({
      ok: true,
      value: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256, specPath, specSha256 },
    }),
  };
  return { root, deps, planPath, specPath, planSha256, specSha256 };
}

// Scenario 1: submit-plan is refused when the plan path resolves inside the
// staging directory (both plan and spec staged -- the exact live shape).
{
  const featureId = "stagingbolt-submit-plan";
  const planPath = `${INTAKE_STAGING_DIRNAME}/prd_${featureId}.md`;
  const specPath = `${INTAKE_STAGING_DIRNAME}/spec.md`;
  const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath });
  const attempt = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  assert.equal(attempt.result, 2, attempt.lines.join(" "));
  assert.ok(attempt.lines.some((line) => line.includes(PLAN_AUTHORITY_STAGING_CODE)),
    `refusal must name the typed staging code: ${attempt.lines.join(" ")}`);
  assert.ok(attempt.lines.some((line) => line.includes(PLAN_AUTHORITY_PROMOTION_SUBCOMMAND)),
    `refusal must name the real promotion action: ${attempt.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.equal(state.planSubmission, undefined, "a refused submission must not be recorded");
}

// Scenario 2: submit-plan is refused when ONLY the spec path resolves inside
// staging -- the plan path is an ordinary specs/<feature>/ path. Proves the
// refusal checks both paths independently, not just the plan path.
{
  const featureId = "stagingbolt-submit-spec";
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `${INTAKE_STAGING_DIRNAME}/spec.md`;
  const { deps } = planAuthorityFixture({ featureId, planPath, specPath });
  const attempt = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  assert.equal(attempt.result, 2, attempt.lines.join(" "));
  assert.ok(attempt.lines.some((line) => line.includes(PLAN_AUTHORITY_STAGING_CODE)),
    `a staged spec path alone must also be refused: ${attempt.lines.join(" ")}`);
}

// Scenario 3: approve-plan refuses a staging-bound submission INDEPENDENTLY
// of submit-plan's own gate -- the submission here is bound directly into
// state (bypassing the submit-plan CLI), simulating a submission written
// before this bolt existed or by any other path. Defense in depth: each
// writer must refuse on its own, not rely on the other having refused first.
{
  const featureId = "stagingbolt-approve";
  const planPath = `${INTAKE_STAGING_DIRNAME}/prd_${featureId}.md`;
  const specPath = `${INTAKE_STAGING_DIRNAME}/spec.md`;
  const { root, deps, planSha256, specSha256 } = planAuthorityFixture({ featureId, planPath, specPath });
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  state.planSubmission = {
    schema: "pipeline.plan-submission.v1",
    featureId, planPath, planSha256, specPath, specSha256,
    profile: "feature", profileSha256: sha256Hex("profile"),
    submittedBy: "coordinator", submittedAt: "2026-08-27T10:01:00.000Z",
  };
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");
  const attempt = capturedStderr(() => run(["approve-plan", "--by", "po-test"], deps));
  assert.equal(attempt.result, 2, attempt.lines.join(" "));
  assert.ok(attempt.lines.some((line) => line.includes(PLAN_AUTHORITY_STAGING_CODE)),
    `approve-plan must independently refuse a staging-bound submission: ${attempt.lines.join(" ")}`);
  assert.ok(attempt.lines.some((line) => line.includes(PLAN_AUTHORITY_PROMOTION_SUBCOMMAND)),
    `refusal must name the real promotion action: ${attempt.lines.join(" ")}`);
  const after = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.equal(after.planApproved, false, "a refused approval must not flip planApproved");
}

// Scenario 4 (regression guard, DoD "would fail if the bolt were too
// broad"): an ordinary specs/<feature>/ plan+spec pair is unaffected --
// submit-plan and approve-plan both succeed end to end.
{
  const featureId = "stagingbolt-ordinary";
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath });
  const submitted = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  assert.equal(submitted.result, 0, `an ordinary path must not be refused by the staging bolt: ${submitted.lines.join(" ")}`);
  const presented = capturedStderr(() => run(["present-plan", "--by", "coordinator"], deps));
  assert.equal(presented.result, 0, `present-plan must succeed for a normal submitted plan: ${presented.lines.join(" ")}`);
  const approved = capturedStderr(() => run(["approve-plan", "--by", "po-test"], deps));
  assert.equal(approved.result, 0, `an ordinary path must not be refused by the staging bolt: ${approved.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.equal(state.planApproved, true, "an ordinary specs/ path must approve normally");
}

// NVA-R22-PLANSHOWN Scenario 5: approve-plan refuses when present-plan was
// NEVER called -- the exact gap the item names (a plan approved without a
// mechanical record it was shown first). Proves the DoD's core refusal case,
// isolated from the staging bolt above.
{
  const featureId = "planshown-no-presentation";
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath });
  const submitted = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  assert.equal(submitted.result, 0, submitted.lines.join(" "));
  const attempt = capturedStderr(() => run(["approve-plan", "--by", "po-test"], deps));
  assert.equal(attempt.result, 2, "approve-plan must refuse when never presented");
  assert.ok(attempt.lines.some((line) => line.includes("present-plan")),
    `refusal must name present-plan as the fix: ${attempt.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.equal(state.planApproved, false, "a refused approval must not flip planApproved");
}

// NVA-R22-PLANSHOWN Scenario 6: present-plan itself is refused unattributed,
// and refused before any submission exists -- mirrors approve-plan's own
// --by/lifecycle-match style exactly.
{
  const featureId = "planshown-present-preconditions";
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  const { deps } = planAuthorityFixture({ featureId, planPath, specPath });
  const blankBy = capturedStderr(() => run(["present-plan", "--by", ""], deps));
  assert.equal(blankBy.result, 2, "present-plan must refuse an unattributed caller");
  const noSubmission = capturedStderr(() => run(["present-plan", "--by", "coordinator"], deps));
  assert.equal(noSubmission.result, 2, "present-plan must refuse before any plan is submitted");
  assert.ok(noSubmission.lines.some((line) => line.includes("submit-plan")),
    `refusal must name submit-plan as the fix: ${noSubmission.lines.join(" ")}`);
}

// NVA-R22-PLANSHOWN Scenario 7: a presentation bound to an OLD submission
// does not authorize approval of a NEW (resubmitted) one -- the digest
// binding, not merely "was present-plan ever called once", is what gates.
{
  const featureId = "planshown-resubmission-invalidates";
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath, now: "2026-08-27T10:00:00.000Z" });
  assert.equal(capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps)).result, 0);
  assert.equal(capturedStderr(() => run(["present-plan", "--by", "coordinator"], deps)).result, 0);
  // Reopen and resubmit with a DIFFERENT timestamp -> a new submissionSha256,
  // simulating a revised plan re-entering the same gate.
  assert.equal(capturedStderr(() => run(["reopen-design", "--by", "po-test"], deps)).result, 0);
  const laterDeps = { ...deps, now: () => "2026-08-27T11:00:00.000Z" };
  assert.equal(capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], laterDeps)).result, 0);
  const staleAttempt = capturedStderr(() => run(["approve-plan", "--by", "po-test"], laterDeps));
  assert.equal(staleAttempt.result, 2, "an approval bound to a stale presentation must be refused");
  assert.ok(staleAttempt.lines.some((line) => line.includes("present-plan")),
    `refusal must name present-plan as the fix: ${staleAttempt.lines.join(" ")}`);
  // The correct remedy -- re-present, then approve -- succeeds.
  assert.equal(capturedStderr(() => run(["present-plan", "--by", "coordinator"], laterDeps)).result, 0);
  const reapproved = capturedStderr(() => run(["approve-plan", "--by", "po-test"], laterDeps));
  assert.equal(reapproved.result, 0, `re-presenting the resubmitted plan must unblock approval: ${reapproved.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.equal(state.planApproved, true);
}

// pipeline.prd-framing-precondition-check (backlog:
// 2026-08-29-prd-framing-precondition-is-prose-not-a-check.md): submit-plan
// refuses when the PRD document at the bound planPath still contains its own
// unmodified framing placeholder text, and succeeds once that section has
// been genuinely authored -- even with different prose that reuses some of
// the same vocabulary (a naive keyword/substring check would false-positive
// on that; an exact-phrase check must not).
{
  const featureId = "prdframing-refusal";
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath });
  mkdirSync(join(root, "specs", featureId), { recursive: true });
  writeFileSync(join(root, planPath), [
    "# PRD - PRD framing refusal fixture",
    "",
    "## Why",
    "<Problem/benefit/trigger; how success is measured.>",
    "",
    "Notes: framing must be authored and reviewed before the plan is submitted.",
  ].join("\n"));
  writeFileSync(join(root, specPath), "# spec\n");
  const attempt = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  assert.equal(attempt.result, 2, attempt.lines.join(" "));
  assert.ok(attempt.lines.some((line) => line.includes(PLAN_AUTHORITY_PRD_FRAMING_CODE)),
    `refusal must name the typed PRD-framing code: ${attempt.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.equal(state.planSubmission, undefined, "a refused submission must not be recorded");
}

// Success path: framing genuinely authored. The replacement prose reuses the
// words "framing" and "reviewed" and "submitted" -- an exact-phrase check
// must not be tripped by shared vocabulary, only by the literal unedited
// placeholder text.
{
  const featureId = "prdframing-success";
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  const { root, deps } = planAuthorityFixture({ featureId, planPath, specPath });
  mkdirSync(join(root, "specs", featureId), { recursive: true });
  writeFileSync(join(root, planPath), [
    "# PRD - PRD framing success fixture",
    "",
    "## Why",
    "The framing of this change was reviewed with the PO before it was submitted:",
    "onboarding turns cost too many tokens, and this shaves the worst offender.",
    "",
    "Notes: reviewed and ready.",
  ].join("\n"));
  writeFileSync(join(root, specPath), "# spec\n");
  const submitted = capturedStderr(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  assert.equal(submitted.result, 0, `genuinely authored framing must not be refused: ${submitted.lines.join(" ")}`);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  assert.ok(state.planSubmission, "a genuinely authored PRD must submit successfully");
}

// The refusal must point at a REAL registered action, not a plausible-looking
// fabrication: PLAN_AUTHORITY_PROMOTION_SUBCOMMAND has to be an actual member
// of project-onboarding-v3.mjs's own ONBOARDING_SUBCOMMANDS table.
{
  const names = ONBOARDING_SUBCOMMANDS.map((entry) => entry.name);
  assert.ok(names.includes(PLAN_AUTHORITY_PROMOTION_SUBCOMMAND),
    `the named promotion action "${PLAN_AUTHORITY_PROMOTION_SUBCOMMAND}" must be a real registered subcommand; got: ${names.join(", ")}`);
}

// NVA-V2-APPROVEREACH / NVA-V2B-APPROVERENDER: the `awaiting-approval` gate.
//
// The one durable fact worth keeping here: `--by` is deliberately NOT derived,
// even though the local Git author is readable at this point and the `draft`
// gate one step earlier derives exactly that. `--by` names the person asserting
// the approval, so filling it in would produce a command a session could run to
// approve the PO's plan for them -- and a gate an agent can satisfy for itself is
// not a gate. The four artifact-identity fields (`planSubmission.{planPath,
// planSha256,specPath,specSha256}`) are unconditionally present here, because
// `submit-plan` writes all four before a feature can reach this status, so unlike
// `draft` there is no not-yet-derivable case for them.
//
// Byte-shape coverage also lives in `pipeline-state-inspect.test.mjs`
// (NVA-Q2-DRAFTDERIVE, "awaiting-approval stays collect-input with no
// executable/argv"); these are additional, not a replacement.
function capturedStdout(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => { lines.push(args.join(" ")); };
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.log = original;
  }
}

function awaitingApprovalFixture() {
  const featureId = "widget-approvereach";
  const planPath = `specs/${featureId}/prd.md`;
  const specPath = `specs/${featureId}/spec.md`;
  const root = mktempProjectDir();
  const localNow = "2026-08-28T12:00:00.000Z";
  assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], { dir: root, now: () => localNow }), 0);
  const state = JSON.parse(readFileSync(statePath(root), "utf8"));
  state.planSubmission = {
    schema: "pipeline.plan-submission.v1",
    featureId, planPath,
    planSha256: sha256Hex(`plan:${planPath}`),
    specPath,
    specSha256: sha256Hex(`spec:${specPath}`),
    profile: "feature",
    profileSha256: sha256Hex("profile"),
    submittedBy: "coordinator", submittedAt: localNow,
  };
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");
  return { root, deps: { dir: root, now: () => localNow }, planPath, specPath, planSha256: state.planSubmission.planSha256, specSha256: state.planSubmission.specSha256 };
}

// This is the test that matters most in this package: no `nextAction` the
// `awaiting-approval` gate publishes may be an action an agent can execute
// to satisfy the plan approval on the PO's behalf.
{
  const { root, deps } = awaitingApprovalFixture();
  const inspected = capturedStdout(() => run(["inspect"], deps));
  assert.equal(inspected.result, 0, inspected.lines.join(" "));
  const payload = JSON.parse(inspected.lines.join("\n"));
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "collect-input",
    "awaiting-approval must never publish a runnable kind:\"command\" -- that would let a machine approve the PO's plan");
  assert.equal(payload.nextAction.executable, undefined,
    "the awaiting-approval gate must never carry an executable");
  assert.equal(payload.nextAction.argv, undefined,
    "the awaiting-approval gate must never carry an argv");
  assert.equal(payload.nextAction.input, undefined);
  assert.equal(payload.nextAction.inputs, undefined,
    "there is nothing an agent may fill in on the PO's behalf for this gate");
  void root;
}

// The command may PREPARE and PRESENT the artifacts (name them by path and
// digest) for the human's own judgement -- it must not stop at a bare
// refusal either.
{
  const { deps, planPath, specPath, planSha256, specSha256 } = awaitingApprovalFixture();
  const inspected = capturedStdout(() => run(["inspect"], deps));
  const payload = JSON.parse(inspected.lines.join("\n"));
  assert.equal(typeof payload.nextAction.guidance, "string");
  assert.ok(payload.nextAction.guidance.includes(planPath), "guidance must name the plan by path");
  assert.ok(payload.nextAction.guidance.includes(planSha256), "guidance must name the plan's sha256");
  assert.ok(payload.nextAction.guidance.includes(specPath), "guidance must name the spec by path");
  assert.ok(payload.nextAction.guidance.includes(specSha256), "guidance must name the spec's sha256");
  assert.ok(payload.nextAction.guidance.includes("approve-plan"),
    "guidance must point the PO at approve-plan themselves");
}

// NVA-V2B-APPROVERENDER: the command the guidance renders is EXECUTED here, not
// merely matched against an expected string. Naming a command the caller then
// cannot run is a failure this repository has shipped before -- a runner once
// handed the PO an invented `sign-digest` subcommand mid-ceremony -- and prose
// that merely describes a command ("run approve-plan with their own name as
// --by") leaves the reader to reconstruct the invocation, which is the same
// defect one step removed. So: pull the rendered command out of the guidance,
// substitute the placeholder the way a human would, run it, and require that it
// reaches the gate's own logic rather than dying in argv parsing.
{
  const { root, deps } = awaitingApprovalFixture();
  const inspected = capturedStdout(() => run(["inspect"], deps));
  const { guidance } = JSON.parse(inspected.lines.join("\n")).nextAction;

  const rendered = /running: (.+?) -- there is no command/s.exec(guidance)?.[1] ?? null;
  assert.ok(rendered, `guidance must render a runnable command, got: ${guidance}`);
  assert.ok(rendered.includes("approve-plan --by "),
    `the rendered command must be the approve-plan invocation, got: ${rendered}`);

  // Exactly the substitution a human performs: replace the placeholder, keep
  // everything else byte for byte.
  const parts = rendered.replace('"<the PO\'s own name>"', "Probe Person").split(" ");
  const [executable, scriptPath, subcommand, byFlag] = parts;
  assert.equal(executable, process.execPath, "the rendered executable must be this runtime");
  assert.equal(scriptPath, fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url)),
    "the rendered script path must be pipeline-state.mjs itself, not a guessed path");
  assert.equal(subcommand, "approve-plan");
  assert.equal(byFlag, "--by");

  const executed = spawnSync(executable, [scriptPath, subcommand, byFlag, "Probe Person", "--dir", root], { encoding: "utf8" });
  const stderr = executed.stderr ?? "";
  // The gate may legitimately refuse this fixture (missing PO-gate authority,
  // staging refusal, ...). What it must NOT do is fail to understand the
  // invocation -- that would mean the rendered command is not real.
  assert.ok(!/unknown subcommand|Usage:|requires --by/i.test(stderr),
    `the rendered command must parse; approve-plan rejected its own rendered argv: ${stderr}`);
  assert.ok(executed.status === 0 || /approve-plan (requires|blocked by)/.test(stderr),
    `the rendered command must reach approve-plan's own gate logic; got status ${executed.status}, stderr: ${stderr}`);
}

// NVA-V2-APPROVEREACH (PO's mandatory addendum, 2026-08-28): spelling a
// command correctly is not proof it runs -- this repository has shipped
// nextActions naming a command the readiness guard then refused. This test
// takes the EXACT rendered command NVA-V2B-APPROVERENDER's guidance emits
// (extracted from the live `inspect` payload, not a hand-typed copy of it,
// same regex extraction the NVA-V2B-APPROVERENDER test above already uses)
// and drives it straight into `guard-lifecycle-ready.mjs`'s own real
// admission function, `isSanctionedLifecycleCommand` -- the same pattern
// `guard-lifecycle-ready.test.mjs`'s "NVA-CODEXARGV-1 (AC-3)" test uses for
// the CLI's mutating-apply argv. This closes the loop the PO named: the
// guidance's rendered command is not merely well-typed prose, it is a
// command this repository's own readiness guard actually admits, proven
// against the guard's real function rather than asserted in a comment.
{
  const { root, deps } = awaitingApprovalFixture();
  const inspected = capturedStdout(() => run(["inspect"], deps));
  const { guidance } = JSON.parse(inspected.lines.join("\n")).nextAction;
  const rendered = /running: (.+?) -- there is no command/s.exec(guidance)?.[1] ?? null;
  assert.ok(rendered, `guidance must render a runnable command, got: ${guidance}`);

  const substituted = rendered.replace('"<the PO\'s own name>"', "'Probe Person'");
  const command = substituted.replace(process.execPath, `'${process.execPath}'`);
  assert.equal(isSanctionedLifecycleCommand(command, root), true,
    `the exact command this gate's guidance renders must be admitted by the readiness guard: ${command}`);

  // Regression pin (mirrors AC-4's shape one gate earlier): a command this gate
  // must NEVER be able to satisfy for the PO -- one with an invented/blank --by,
  // or the mutating auto-fill shape the sibling `draft` gate is allowed to emit
  // for itself -- stays refused. This is not a positive claim about what IS
  // rendered (this gate never emits an executable/argv of its own); it is proof
  // the guard's admission for THIS subcommand still refuses an unattributed run.
  const blankBy = `'${process.execPath}' '${fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url))}' approve-plan --by ''`;
  assert.equal(isSanctionedLifecycleCommand(blankBy, root), false,
    "an unattributed approve-plan must stay refused by the same guard");
}

// NVA-R31-STATEPHASEDRIFT (pipeline.state-phase-projection-atomicity):
// set-feature's existing best-effort docs resync must also write the
// statePhaseProjectionMarker() line into docs/state.md, atomically with the
// state file it derives from -- not leave the marker for a separate manual
// step that can lag behind. check-state-phase-consistency.test.mjs covers
// the checker end to end; this pins the emission point in pipeline-state.mjs
// itself, at the smallest single transition (set-feature, phase="design").
{
  const root = mktempProjectDir();
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs/state.md"), "# Project state\n\n## Next action\n\nplaceholder\n");
  const code = run(["set-feature", "--id", "marker-check", "--plan-path", "specs/marker-check/prd.md"], { dir: root, now: () => now });
  assert.equal(code, 0);
  const handover = readFileSync(join(root, "docs/state.md"), "utf8");
  const expectedMarker = statePhaseProjectionMarker({ activeFeature: { id: "marker-check", phase: "design" } });
  assert.ok(handover.includes(expectedMarker), `docs/state.md must carry the marker verbatim; got:\n${handover}`);
}

// NVA-CF-VERIFYDEADLOCK (backlog: pipeline.verify-contract-fails-until-configured-
// but-gs-10-blocks-configuring-it). Live reproduction: a fresh onboarded project
// (calibration seeded with the exact UNCONFIGURED_VERIFY placeholder text, twin
// tiers present) walks design -> the set-phase --phase implementation transition
// -> implementation, and the ONLY sanctioned route through is set-phase itself --
// never a GS-10 override, never a `git commit --no-verify` bypass (neither guard
// nor git are invoked by this test at all: `run()` is called in-process).
{
  const root = mktempProjectDir();
  const seededVerify = "node -e \"console.error('pipeline: the verify contract of this project is not configured. Replace the verify command in project/pipeline.json with the real verification command for this project (for example its test suite), then run verify again.'); process.exit(1)\"";
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  const calibration = { project: "new-project", verify: seededVerify, handover: "docs/state.md" };
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "verify-deadlock-repro", planPath: "specs/verify-deadlock-repro/prd.md", phase: "design" },
    planApproved: true,
    planApproval: { approvedBy: "PO", approvedAt: now },
  }, null, 2));
  const deps = { dir: root, now: () => now };

  // 1. Entering implementation with the placeholder still in place, and no
  // --verify-command supplied, is REFUSED -- not silently allowed through, and
  // not a case the old code even distinguished (this refusal did not exist before
  // this fix: the transition used to succeed regardless of the verify contract).
  const refused = capturedStderr(() => run(["set-phase", "--phase", "implementation"], deps));
  assert.equal(refused.result, 2, "must refuse to enter implementation while verify is still the seeded placeholder");
  assert.ok(refused.lines.some((line) => line.includes("verify-command")),
    `refusal must name the sanctioned escape (--verify-command): ${refused.lines.join(" ")}`);
  const stillDesign = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.equal(stillDesign.activeFeature.phase, "design", "a refused transition must not have moved the phase");
  assert.equal(JSON.parse(readFileSync(join(root, "project", "pipeline.json"), "utf8")).verify, seededVerify,
    "a refused transition must not have touched the calibration either");

  // 2. --verify-command carrying the placeholder text itself (or blank) is also
  // refused -- the deadlock's fix must never let the placeholder re-enter through
  // the new door it just opened.
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", seededVerify], deps), 2,
    "the placeholder text must be refused even when explicitly supplied via --verify-command");
  assert.equal(run(["set-phase", "--phase", "implementation", "--verify-command", "   "], deps), 2,
    "a blank --verify-command must be refused");

  // 3. Supplying a real command is the sanctioned route through: the SAME
  // transaction that unlocks implementation writes the real verify command,
  // before GS-10 would otherwise arm for that field (GS-10 itself is a
  // PreToolUse hook, not exercised by this in-process call at all).
  const realVerify = `${process.execPath} -e "process.exit(0)"`;
  const applied = run(["set-phase", "--phase", "implementation", "--verify-command", realVerify], deps);
  assert.equal(applied, 0, "set-phase --verify-command must succeed with a real command");
  const afterState = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.equal(afterState.activeFeature.phase, "implementation", "phase must now be implementation");
  const neutralCalibration = JSON.parse(readFileSync(join(root, "project", "pipeline.json"), "utf8"));
  const legacyCalibration = JSON.parse(readFileSync(join(root, ".claude", "pipeline.json"), "utf8"));
  assert.equal(neutralCalibration.verify, realVerify, "project/pipeline.json's verify field must hold the real command");
  assert.equal(legacyCalibration.verify, realVerify,
    "the legacy .claude/pipeline.json twin must be updated too (PA-CALIBRATION-DRIFT)");
  assert.equal(neutralCalibration.project, "new-project", "unrelated calibration fields must survive untouched");

  // 4. Regression pin for the always-green class 674b1c0c closed: the configured
  // command is neither the old silent-pass placeholder nor the new fail-by-design
  // one -- it is a real command that actually runs and reports its own result.
  assert.ok(!neutralCalibration.verify.includes("the verify contract of this project is not configured"),
    "the written command must not still be the UNCONFIGURED_VERIFY placeholder");
  const outcome = spawnSync(process.execPath, ["-e", "process.exit(0)"], { encoding: "utf8" });
  assert.equal(outcome.status, 0, "the configured command is a real, runnable command (not a vacuous always-pass check)");

  // 5. Idempotent replay: once configured, re-entering implementation (e.g. after
  // reopen-design) without --verify-command is no longer refused.
  const revertedToDesign = { ...afterState, activeFeature: { ...afterState.activeFeature, phase: "design" } };
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify(revertedToDesign, null, 2));
  assert.equal(run(["set-phase", "--phase", "implementation"], deps), 0,
    "once the calibration already carries a real verify command, --verify-command is optional on replay");
}

// backlog/items/2026-08-30-runner-fallback-defaults-to-codex-without-explicit-signal.md:
// resolvePoRebindRunner() must fail closed -- never silently guess "codex" --
// when no explicit --runner AND none of CLAUDECODE/ANTIGRAVITY_AGENT/AI_AGENT
// is set (exactly the case of a human typing the command directly in a plain
// terminal, not through any of the three supported AI runners).
{
  const noSignal = resolvePoRebindRunner(undefined, {});
  assert.equal(noSignal.ok, false, "no --runner and no runner env marker must refuse rather than resolve a runner");
  assert.equal(noSignal.code, "PO-REBIND-RUNNER-UNKNOWN", "the refusal must carry a distinct, actionable code");
  assert.notEqual(noSignal.runner, "codex", "the refusal object must never carry the old silent codex default");

  const explicit = resolvePoRebindRunner("codex", {});
  assert.deepEqual(explicit, { ok: true, runner: "codex" }, "an explicit --runner always wins, even with no env markers");

  const claudeEnv = resolvePoRebindRunner(undefined, { CLAUDECODE: "1" });
  assert.deepEqual(claudeEnv, { ok: true, runner: "claude" }, "CLAUDECODE=1 still resolves claude with no explicit --runner");

  const antigravityEnv1 = resolvePoRebindRunner(undefined, { ANTIGRAVITY_AGENT: "1" });
  assert.deepEqual(antigravityEnv1, { ok: true, runner: "antigravity" }, "ANTIGRAVITY_AGENT=1 still resolves antigravity");

  const antigravityEnv2 = resolvePoRebindRunner(undefined, { AI_AGENT: "antigravity" });
  assert.deepEqual(antigravityEnv2, { ok: true, runner: "antigravity" }, "AI_AGENT=antigravity still resolves antigravity");
}

console.log("pipeline-state.test.mjs (CB-1a): all checks passed");
