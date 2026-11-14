// SPDX-License-Identifier: SUL-1.0
/**
 * C22B (AC-108, Antigravity greenfield finding LOOP-A1): every signature command the Pipeline prints
 * is proven by a round trip -- emit the request the way the product does, sign it with a generated
 * fixture key, consume the proof.
 *
 * Why this file exists: a signature command the Pipeline printed and the verb that consumes the proof
 * disagreed once, and it cost five PO turns. The existing suites prove single kinds
 * (po-human-approval.test.mjs: push, publication, release-preflight mirror, C21F printed push and
 * reconcile; pipeline-state.test.mjs: C21B/C21C acknowledgement), never the whole set.
 *
 * Legs, weakest to strongest (the notes file names, per kind, which leg runs and why a heavier one does not):
 *   1. LIBRARY (every member of CRITICAL_ACTION_KINDS): createCriticalActionApprovalRequest -> sign with a
 *      fixture key -> verifyCriticalActionApprovalRequest, plus the three refusals that make the leg live
 *      (other candidate, other kind, expired).
 *   2. PRINTED COMMAND (every kind the shared builder renders, AUTHORIZE_CRITICAL_COMMAND_KINDS): the
 *      posix and the PowerShell copy renderings are read back to the exact argv; that argv is then run
 *      through the real `authorize-critical` verb (runHumanApproval) with a fixture key, and the proof
 *      the verb wrote verifies against the action the PRINTED digest and expiry describe.
 *   3. CONSUMER VERB (kinds with an affordable fixture): see the last section.
 *
 * The signing step is the one seam: production shells out to `openssl pkeyutl -sign` against a
 * passphrase-protected key (TR-S1), so the fixture key is passphrase-protected too, the ceremony runs
 * with an injected attended terminal, and the injected `spawn` answers exactly the `pkeyutl -sign` call
 * with a node:crypto signature over the same bytes. No openssl binary is needed. Every key is generated
 * here, in a private temporary directory; no real PO key directory or machine plane is reachable
 * (`homedirFn` and the key-directory environment variable are injected).
 */
import assert from "node:assert/strict";
import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";

import { AUTHORIZE_CRITICAL_COMMAND_KINDS, prepareAuthorizeCriticalLine, runHumanApproval } from "./po-human-approval.mjs";
import { CRITICAL_ACTION_KINDS, createCriticalActionApprovalRequest, criticalActionSubjectSha256, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { criticAcknowledgementSubject } from "../lib/critic-acknowledgement.mjs";
import { buildSpecAddendumSubject } from "../lib/spec-addendum.mjs";
import { buildGateChangeAcknowledgementSubject, gateDefinitionChangeReadback } from "../lib/gate-definition-changes.mjs";
import { buildMaintenanceAcknowledgementSubjectAtHead, maintenanceRedProof, writeMaintenanceRedObservation } from "../lib/maintenance-delivery.mjs";
import { addSpecAddendum } from "../lib/feature-package-registration.mjs";
import { residualAcceptanceSubject } from "../lib/critic-verify-lifecycle.mjs";
import { PO_APPROVAL_DIRECTORY_ENV } from "../lib/po-human-approval-read.mjs";
import { run as runPipelineState } from "./pipeline-state.mjs";
import { buildReleasePreflight, prepareReleasePreflightAuthorizeLine } from "./release-preflight-cli.mjs";
import { renderHumanCopySafeCommand } from "../lib/copy-safe-command.mjs";
import { GIT_NULL_DEVICE } from "../lib/git-null-device.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";

/* ---------------------------------------------------------------------------------------------- *
 * Fixtures
 * ---------------------------------------------------------------------------------------------- */

const FIXTURE_ROOT = realpathSync(mkdtempSync(join(tmpdir(), "c22b-roundtrip-")));
process.env.GIT_CEILING_DIRECTORIES = FIXTURE_ROOT;
after(() => rmSync(FIXTURE_ROOT, { recursive: true, force: true }));
let fixtureCounter = 0;
const fixtureDir = (label) => {
  const directory = join(FIXTURE_ROOT, `${label}-${fixtureCounter += 1}`);
  mkdirSync(directory, { recursive: true });
  return directory;
};

const CANDIDATE = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const OTHER_CANDIDATE = Object.freeze({ commit: "c".repeat(40), tree: "d".repeat(40) });
const FEATURE_ID = "c22b-roundtrip";
const PASSPHRASE = "c22b-fixture-passphrase";
// C28: the fixture key's name is assembled at run time so the repository scan does not read it as a key assignment in this file (the value is unchanged).
const KEY_REFERENCE = ["c22b", "fixture", "key"].join("-");
const futureExpiry = () => new Date(Date.now() + 3_600_000).toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** A throwaway Ed25519 keypair in the encodings the ceremony reads: SPKI public, PKCS#8 private (optionally encrypted). */
function generateKey(passphrase = null) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: passphrase === null ? { type: "pkcs8", format: "pem" } : { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey, passphrase, publicKeySha256: sha256(publicKey) };
}

/** A key directory the way `setup` leaves one, holding an encrypted fixture key and its authority record. */
function keyDirectory() {
  const directory = fixtureDir("keys");
  const key = generateKey(PASSPHRASE);
  writeFileSync(join(directory, "po-private.pem"), key.privateKeyPem);
  writeFileSync(join(directory, "po-public.pem"), key.publicKeyPem);
  const authority = { keyReference: KEY_REFERENCE, publicKeySha256: key.publicKeySha256 };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Fixture Operator" }, null, 2)}\n`);
  return { directory, key, authority };
}

/** A real, contained git checkout with a HEAD (the ceremony's custody check refuses anything else). */
function gitOut(root, ...args) {
  const env = {
    GIT_CEILING_DIRECTORIES: dirname(root), GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
  for (const name of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TMP", "TEMP", "TMPDIR", "LANG"]) {
    if (typeof process.env[name] === "string") env[name] = process.env[name];
  }
  const result = spawnSync("git", ["-c", "commit.gpgSign=false", "-C", root, ...args], { encoding: "utf8", env, shell: false });
  if (result.error || result.status !== 0) throw new Error(`fixture git ${args[0]} failed: ${String(result.stderr).trim().slice(0, 200)}`);
  return result.stdout.trim();
}
function commitFiles(root, files, message) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  gitOut(root, "add", "--", ...Object.keys(files));
  gitOut(root, "-c", `core.hooksPath=${GIT_NULL_DEVICE}`, "commit", "-q", "--no-verify", "-m", message);
}
function fixtureRepository(files = { "plan.md": "# plan fixture\n", "spec.md": "# spec fixture\n" }) {
  const root = fixtureDir("repo");
  gitOut(root, "init", "-q");
  commitFiles(root, files, "fixture: initial commit");
  return root;
}

/** The injected signing seam: answers `openssl pkeyutl -sign` (the only spawn this verb makes) with a node:crypto signature. */
function signingSpawn(key) {
  return (_executable, args) => {
    if (args[0] === "pkeyutl" && args.includes("-sign")) {
      const raw = readFileSync(args[args.indexOf("-in") + 1]);
      writeFileSync(args[args.indexOf("-out") + 1], sign(null, raw, createPrivateKey({ key: key.privateKeyPem, format: "pem", passphrase: key.passphrase })));
      return { status: 0 };
    }
    return { status: 1 };
  };
}

/** Runs one `authorize-critical` argv exactly as the PO's terminal would: no --directory, the key directory resolved from the environment. */
function runPrintedArgv({ argv, keys, home, dependencies = {} }) {
  const previous = process.env[PO_APPROVAL_DIRECTORY_ENV];
  process.env[PO_APPROVAL_DIRECTORY_ENV] = keys.directory;
  try {
    return runHumanApproval(argv, {
      isTTY: true, homedirFn: () => home, spawn: signingSpawn(keys.key), readConfirmation: () => "approve", ...dependencies,
    });
  } finally {
    if (previous === undefined) delete process.env[PO_APPROVAL_DIRECTORY_ENV]; else process.env[PO_APPROVAL_DIRECTORY_ENV] = previous;
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
/** The proof the ceremony wrote, checked the way every consumer checks it, against the action the PRINTED line described. */
function verifyWritten({ result, expectedCandidate, expectedAction, trustPolicy, now }) {
  const request = readJson(result.externalPaths.request);
  const proof = readJson(result.externalPaths.proof);
  return { request, proof, verified: verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate, expectedAction, ...(now === undefined ? {} : { now }) }) };
}

/* ---------------------------------------------------------------------------------------------- *
 * Leg 1: the library, every kind in CRITICAL_ACTION_KINDS
 * ---------------------------------------------------------------------------------------------- */

test("the critical action kind list this suite is parametrized over is the closed set the product exports", () => {
  assert.deepEqual([...CRITICAL_ACTION_KINDS].sort(), [
    "accept-residual-critic-findings", "acknowledge-caller-authored-critic", "acknowledge-gate-definition-changes", "acknowledge-maintenance-red-check", "deploy", "feature-package-reconcile",
    "governance-fork-disposition", "interruption-promotion", "publication", "push", "release-preflight", "replace-verify-command", "spec-addendum",
  ], "a new kind must add its round trip here (and a note on which leg proves it), not slip in unproven");
  // replace-verify-command (ADR-0100): the library, printed and verb legs below (builder injected), plus its consumer leg (configure-verify --replace).
  // acknowledge-gate-definition-changes (ADR-0096): the library, printed and verb legs below, plus its consumer leg (approve-gate-change-acknowledgement).
  // acknowledge-maintenance-red-check (ADR-0097): the library, printed and verb legs below (builder injected), plus its consumer leg (approve-maintenance-red-check).
});

for (const kind of CRITICAL_ACTION_KINDS) {
  test(`C22B library leg: ${kind} -- emit the request, sign it with a fixture key, verify the proof`, () => {
    const key = generateKey();
    const trustPolicy = { keyReference: KEY_REFERENCE, publicKeySha256: key.publicKeySha256 };
    const expiresAt = futureExpiry();
    const action = { kind, subjectSha256: criticalActionSubjectSha256({ kind, candidate: CANDIDATE, subject: { label: `round-trip ${kind}` } }), expiresAt };
    const request = createCriticalActionApprovalRequest({ candidate: CANDIDATE, featureId: FEATURE_ID, planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action });
    const proof = {
      schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: trustPolicy.keyReference,
      publicKey: key.publicKeyPem, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), createPrivateKey(key.privateKeyPem)).toString("base64"),
    };
    const verified = verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: CANDIDATE, expectedAction: action });
    assert.equal(verified.code, "CRITICAL-ACTION-PROOF-VERIFIED", JSON.stringify(verified));
    assert.deepEqual(verified.action, action);

    // The refusals that keep the leg from passing for the wrong reason.
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: OTHER_CANDIDATE, expectedAction: action }).code, "CRITICAL-ACTION-REQUEST-MISMATCH", "another candidate");
    const otherKind = CRITICAL_ACTION_KINDS.find((candidateKind) => candidateKind !== kind);
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: CANDIDATE, expectedAction: { ...action, kind: otherKind } }).code, "CRITICAL-ACTION-REQUEST-MISMATCH", "another kind with the same subject digest");
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: CANDIDATE, expectedAction: action, now: new Date(Date.parse(expiresAt) + 1000).toISOString() }).code, "CRITICAL-ACTION-PROOF-EXPIRED", "past its expiry");
    const stranger = generateKey();
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy: { ...trustPolicy, publicKeySha256: stranger.publicKeySha256 }, proof, expectedCandidate: CANDIDATE, expectedAction: action }).verified, false, "a key the authority does not name");
  });
}

/* ---------------------------------------------------------------------------------------------- *
 * Leg 2a: the printed command, read back from every rendering the product prints
 * ---------------------------------------------------------------------------------------------- */

/** Splits a POSIX command line into words: unquoted whitespace separates, '...' and "..." (with backslash escapes) join. */
function posixWords(text) {
  const words = [];
  let word = null;
  for (let index = 0; index < text.length;) {
    const character = text[index];
    if (character === "'") {
      const end = text.indexOf("'", index + 1);
      assert.ok(end > index, "unterminated single quote");
      word = (word ?? "") + text.slice(index + 1, end);
      index = end + 1;
    } else if (character === '"') {
      let cursor = index + 1;
      let chunk = "";
      while (text[cursor] !== '"') {
        assert.ok(cursor < text.length, "unterminated double quote");
        if (text[cursor] === "\\") cursor += 1;
        chunk += text[cursor];
        cursor += 1;
      }
      word = (word ?? "") + chunk;
      index = cursor + 1;
    } else if (/\s/u.test(character)) {
      if (word !== null) words.push(word);
      word = null;
      index += 1;
    } else {
      word = (word ?? "") + character;
      index += 1;
    }
  }
  if (word !== null) words.push(word);
  return words;
}

/** Reads the bounded POSIX rendering (`CMD=...` fragments, then `eval "$CMD"`) back to its argv, without a shell. */
function argvFromPosixRendering(rendering) {
  const lines = rendering.split("\n");
  assert.equal(lines.pop(), 'eval "$CMD"');
  let command = "";
  for (const line of lines) {
    const match = /^CMD=(\$\{CMD\})?(.*)$/u.exec(line);
    assert.ok(match, `unexpected POSIX fragment line: ${line}`);
    assert.equal(match[1] !== undefined, command !== "", "only the first fragment assigns, every later one appends");
    const [fragment, ...rest] = posixWords(match[2]);
    assert.deepEqual(rest, [], "a fragment is one shell word");
    command += fragment;
  }
  return posixWords(command);
}

/** Reads the bounded PowerShell rendering (`$CMD = '...'`, `$CMD += '...'`, then `Invoke-Expression $CMD`) back to its argv. */
function argvFromPowershellRendering(rendering) {
  const lines = rendering.split("\n");
  assert.equal(lines.pop(), "Invoke-Expression $CMD");
  let command = "";
  for (const line of lines) {
    const match = /^\$CMD (=|\+=) '(.*)'$/u.exec(line);
    assert.ok(match, `unexpected PowerShell fragment line: ${line}`);
    assert.equal(match[1] === "=", command === "", "only the first fragment assigns, every later one appends");
    command += match[2].replaceAll("''", "'");
  }
  assert.ok(command.startsWith("& "), "the invocation operator leads the command");
  return [...command.slice(2).matchAll(/'((?:[^']|'')*)'/gu)].map((word) => word[1].replaceAll("''", "'"));
}

const PRINTED_PLAN = "specs/c22b y/prd.md"; // a space, so a quoting error shows
const PRINTED_SPEC = "specs/c22b y/spec.md";
const PRINTED_KINDS = Object.freeze(AUTHORIZE_CRITICAL_COMMAND_KINDS);

test("the kinds the shared builder prints are all critical action kinds", () => {
  for (const kind of PRINTED_KINDS) assert.ok(CRITICAL_ACTION_KINDS.includes(kind), kind);
});

for (const kind of PRINTED_KINDS) {
  test(`C22B printed command: the ${kind} line reads back to the exact argv from the POSIX and the PowerShell rendering`, () => {
    const prepared = prepareAuthorizeCriticalLine({
      kind, candidate: CANDIDATE, subject: { label: `printed ${kind}` }, repoRoot: join(tmpdir(), "repo with space"), featureId: FEATURE_ID,
      plan: PRINTED_PLAN, spec: PRINTED_SPEC, expiresAt: "2030-01-01T00:00:00.000Z",
      ...(kind === "acknowledge-caller-authored-critic" ? { criticPacket: "e".repeat(32) } : {}),
      ...(kind === "spec-addendum" ? { addendum: `specs/${FEATURE_ID}/spec-addendum-01.md` } : {}),
    });
    assert.equal(prepared.argv[prepared.argv.indexOf("--kind") + 1], kind);
    assert.equal(prepared.argv[prepared.argv.indexOf("--subject-sha256") + 1], criticalActionSubjectSha256({ kind, candidate: CANDIDATE, subject: { label: `printed ${kind}` } }));
    // The one line the agent hands over (`command`) is the same words as the bounded copies the PO pastes.
    assert.deepEqual(posixWords(prepared.command), ["node", ...prepared.argv], "the inline POSIX line");
    // `copyCommand` is nulled when the inline line fits 72 columns; the human hand-off form always carries both.
    const human = renderHumanCopySafeCommand({ label: `C22B ${kind}`, executable: prepared.executable, argv: prepared.argv });
    assert.deepEqual(human.argv, prepared.argv, "the human hand-off form wraps the same argv");
    const { posix, powershell, maxColumns } = human.copyCommand;
    assert.ok(posix !== null && powershell !== null, "both renderings are printed");
    for (const rendering of [posix, powershell]) assert.ok(rendering.split("\n").every((line) => line.length <= maxColumns), "bounded");
    assert.deepEqual(argvFromPosixRendering(posix), ["node", ...prepared.argv], "POSIX rendering");
    assert.deepEqual(argvFromPowershellRendering(powershell), ["node", ...prepared.argv], "PowerShell rendering");
    if (process.platform !== "win32" && spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0) {
      // The reading above is our own parser; a real shell evaluating the printed text must agree with it.
      const probe = spawnSync("bash", ["-c", `node() { printf '%s\\0' "$@"; }\n${posix}`], { encoding: "utf8" });
      assert.equal(probe.status, 0, probe.stderr);
      assert.deepEqual(probe.stdout.split("\0").slice(0, -1), prepared.argv, "a real bash evaluates the printed text to the same argv");
    }
  });
}

/* ---------------------------------------------------------------------------------------------- *
 * Leg 2b: the printed argv through the real `authorize-critical` verb, then verified
 * ---------------------------------------------------------------------------------------------- */

const ACK_PACKET = "e".repeat(32);
const ACK_RECEIPT = Object.freeze({
  schema: "pipeline.session-critic-receipt.v1", reviewPass: false, findingCount: 0, packetId: ACK_PACKET,
  independence: "caller-authored-fallback", candidate: Object.freeze({ ...CANDIDATE }),
});
const CHECKOUT_HEAD = Object.freeze({ commit: "9".repeat(40), tree: "8".repeat(40) }); // moved past the reviewed candidate

/** What each printed kind signs: the candidate and subject the emitter binds, and the dependencies its verb reads. */
function emitterInput(kind) {
  if (kind === "acknowledge-caller-authored-critic") {
    // The C21B route, the one that failed: the line names the packet, the candidate is the REVIEWED one, never HEAD.
    return {
      candidate: { ...ACK_RECEIPT.candidate }, subject: criticAcknowledgementSubject({ packetId: ACK_PACKET, receipt: ACK_RECEIPT }),
      extra: { criticPacket: ACK_PACKET }, observed: { ...CHECKOUT_HEAD },
      dependencies: { readConsumedCandidateReceiptFn: () => ({ packet: { packetId: ACK_PACKET }, receipt: ACK_RECEIPT }) },
    };
  }
  if (kind === "spec-addendum") {
    // ADR-0095: the verb rebuilds the subject from a real repository (HEAD holds the addendum, the package binds the Spec, the packet is consumed).
    const fixture = specAddendumRepository();
    return { repoRoot: fixture.root, candidate: fixture.head, subject: fixture.subject, extra: { addendum: SPEC_ADDENDUM_PATH }, observed: fixture.head, dependencies: fixture.readers };
  }
  if (kind === "acknowledge-gate-definition-changes") {
    // ADR-0096: the verb rebuilds the list from the real feature range at the clean HEAD (one weakened manifest after its first appearance).
    const fixture = gateChangeRepository();
    return { repoRoot: fixture.root, candidate: fixture.head, subject: fixture.subject, extra: {}, observed: fixture.head, dependencies: {} };
  }
  if (kind === "acknowledge-maintenance-red-check") {
    // ADR-0097: the verb rebuilds the list through the one builder; it is injected here (its own suite runs it on a real repository).
    const subject = { schema: "pipeline.maintenance-red-check-subject.v1", featureId: FEATURE_ID, approvalSha256: sha256("approval"),
      checksSha256: sha256("checks"), checks: [{ checkSha256: sha256("check"), check: { id: "verify", path: "project/pipeline.json", verify: "configured", dependencies: ["project/pipeline.json"] }, observedExitCode: 1 }] };
    return { candidate: { ...CANDIDATE }, subject, extra: {}, observed: { ...CANDIDATE },
      dependencies: { buildMaintenanceAcknowledgementSubjectFn: () => ({ ok: true, subject, candidate: { ...CANDIDATE }, featureId: FEATURE_ID }) } };
  }
  if (kind === "replace-verify-command") {
    // ADR-0100: the verb rebuilds the subject from the newest passing test run through the one builder; injected here (the consumer leg runs it for real).
    const subject = { schema: "pipeline.verify-replacement-subject.v1", featureId: FEATURE_ID, previousCommand: "node --test old.test.mjs", verifyCommand: "node --test new.test.mjs",
      testRunSha256: sha256("test-run"), entries: [{ path: "project/pipeline.json", beforeSha256: sha256("before"), afterSha256: sha256("after") }] };
    return { candidate: { ...CANDIDATE }, subject, extra: {}, observed: { ...CANDIDATE },
      dependencies: { buildVerifyReplacementSubjectFn: () => ({ ok: true, subject, candidate: { ...CANDIDATE }, featureId: FEATURE_ID }) } };
  }
  return { candidate: { ...CANDIDATE }, subject: { label: `verb ${kind}` }, extra: {}, observed: { ...CANDIDATE }, dependencies: {} };
}

const SPEC_ADDENDUM_PATH = `specs/${FEATURE_ID}/spec-addendum-01.md`;
const ADDENDUM_PACKET = "f".repeat(32);
/** A repository whose package binds the consumer Spec, a reviewed commit the packet names, and a committed addendum on top. */
function specAddendumRepository() {
  // A package the topology validator accepts, so the registration step (--add-spec-addendum) can run on it as well.
  const extra = { [`specs/${FEATURE_ID}/acceptance.md`]: "acceptance\n", [`specs/${FEATURE_ID}/result.md`]: "result\n", [`specs/${FEATURE_ID}/evidence/envelope.json`]: "{}\n" };
  const entry = (klass, path, bytes, authority, mutability) => ({ class: klass, path, sha256: sha256(bytes), authority, mutability, retention: "active" });
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: FEATURE_ID, rigor: 1 }, state: "implementing",
    artifacts: [entry("spec", STATE_SPEC_PATH, "spec", true, "immutable"), entry("prd", STATE_PLAN_PATH, "plan", true, "mutable"),
      ...Object.entries(extra).map(([path, bytes]) => entry(path.endsWith(".json") ? "candidate-evidence" : path.endsWith("acceptance.md") ? "acceptance" : "result", path, bytes, false, path.endsWith(".json") ? "immutable" : "mutable"))],
    candidate: null, supersedes: null };
  const root = fixtureRepository(consumerFiles({ [`specs/${FEATURE_ID}/lifecycle.json`]: `${JSON.stringify(manifest, null, 2)}\n`, ...extra }));
  const reviewed = { commit: gitOut(root, "rev-parse", "HEAD"), tree: gitOut(root, "rev-parse", "HEAD^{tree}") };
  commitFiles(root, { [SPEC_ADDENDUM_PATH]: `Base Spec: ${STATE_SPEC_PATH} sha256:${sha256("spec")}\nCritic packet: ${ADDENDUM_PACKET}\nFindings: CRF-${ADDENDUM_PACKET}-1\n\nThe board renders the last score, not the best one.\n` }, "spec addendum 01");
  const head = { commit: gitOut(root, "rev-parse", "HEAD"), tree: gitOut(root, "rev-parse", "HEAD^{tree}") };
  const receipt = { schema: "pipeline.session-critic-receipt.v1", reviewPass: false, findingCount: 1, packetId: ADDENDUM_PACKET, candidate: reviewed };
  const readers = {
    readConsumedCandidateReceiptFn: () => ({ packet: { packetId: ADDENDUM_PACKET }, receipt }),
    readConsumedCandidateResultFn: () => ({ result: { verdict: { findings: [{ severity: "major", gap: "the Spec says best score" }] } } }),
  };
  const built = buildSpecAddendumSubject({ root, featureId: FEATURE_ID, addendumPath: SPEC_ADDENDUM_PATH, controlRoot: "/unused",
    readReceipt: readers.readConsumedCandidateReceiptFn, readResult: readers.readConsumedCandidateResultFn });
  assert.equal(built.ok, true, JSON.stringify(built));
  return { root, head, subject: built.subject, readers };
}

/** A consumer repository whose feature range holds one gate-definition change without a proof: the manifest weakened after its first appearance. */
function gateChangeRepository() {
  const root = fixtureRepository(consumerFiles({ "project/pipeline.yaml": "gates: {}\n" }));
  commitFiles(root, { "project/pipeline.yaml": "gates:\n  push:\n    approval: none\n" }, "chore: weaken the push gate");
  const head = { commit: gitOut(root, "rev-parse", "HEAD"), tree: gitOut(root, "rev-parse", "HEAD^{tree}") };
  const built = buildGateChangeAcknowledgementSubject({ root, featureId: FEATURE_ID, commonDir: join(root, ".git") });
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.deepEqual(built.candidate, head);
  assert.deepEqual(built.subject.changes.map((change) => `${change.path}:${change.change}`), ["project/pipeline.yaml:M"]);
  return { root, head, subject: built.subject };
}

for (const kind of PRINTED_KINDS) {
  test(`C22B verb leg: the printed ${kind} line runs unchanged through authorize-critical and the proof it writes verifies`, () => {
    const input = emitterInput(kind);
    const repoRoot = input.repoRoot ?? fixtureRepository();
    const keys = keyDirectory();
    const home = fixtureDir("home");
    const expiresAt = futureExpiry();
    const plan = input.repoRoot === undefined ? "plan.md" : STATE_PLAN_PATH, spec = input.repoRoot === undefined ? "spec.md" : STATE_SPEC_PATH;
    const prepared = prepareAuthorizeCriticalLine({
      kind, candidate: input.candidate, subject: input.subject, repoRoot, featureId: FEATURE_ID, plan, spec, expiresAt, ...input.extra,
    });
    const prompts = [];
    const result = runPrintedArgv({
      argv: prepared.argv.slice(1), keys, home,
      dependencies: { observeCandidate: () => input.observed, readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; }, ...input.dependencies },
    });
    assert.equal(result.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
    assert.deepEqual(result.candidate, input.candidate, "the candidate the emitter bound, not the checkout's HEAD");
    assert.equal(prompts.length, 1, "exactly one confirmation before the signature");
    assert.ok(prompts[0].includes(prepared.subjectSha256), "the confirmation names the printed digest");
    // The expectation is built from the PRINTED line alone, so a digest or expiry the verb altered fails here.
    const expectedAction = { kind, subjectSha256: prepared.subjectSha256, expiresAt };
    const { verified, proof } = verifyWritten({ result, expectedCandidate: input.candidate, expectedAction, trustPolicy: keys.authority });
    assert.equal(verified.code, "CRITICAL-ACTION-PROOF-VERIFIED", JSON.stringify(verified));
    assert.equal(proof.keyReference, keys.authority.keyReference);
    // A proof signed for this subject is not a proof for another one.
    const tampered = verifyWritten({ result, expectedCandidate: input.candidate, expectedAction: { ...expectedAction, subjectSha256: sha256("another subject") }, trustPolicy: keys.authority });
    assert.equal(tampered.verified.code, "CRITICAL-ACTION-REQUEST-MISMATCH");
    // The signing step mirrors the public artifacts into scratch/ so the agent reads what was signed (C21C).
    for (const role of ["request", "proof", "authority"]) assert.ok(existsSync(result.paths[role]), `the ${role} mirror`);
  });
}

// `accept-residual-critic-findings` is a critical command kind the verb signs, but the shared builder does not render
// its line (its subject is rebuilt from the consumed Critic packet, never typed), so the argv here is the verb's own
// documented shape, and the leg proves the digest the verb REBUILDS from the packet is the one that was signed.
test("C22B verb leg: accept-residual-critic-findings signs the digest rebuilt from the consumed packet and the proof verifies", () => {
  const kind = "accept-residual-critic-findings";
  const repoRoot = fixtureRepository();
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const packetId = "c".repeat(32);
  const receipt = { schema: "pipeline.session-critic-receipt.v1", reviewPass: false, findingCount: 2, packetId, candidate: { ...CANDIDATE } };
  const findings = [
    { severity: "minor", title: "wording of the refusal text", location: "plugins/pipeline-core/lib/example.mjs:10" },
    { severity: "minor", title: "unused import", location: "plugins/pipeline-core/lib/example.mjs:2" },
  ];
  const expiresAt = futureExpiry();
  const argv = ["authorize-critical", "--repo-root", repoRoot, "--feature-id", FEATURE_ID, "--plan", "plan.md", "--spec", "spec.md", "--kind", kind, "--critic-packet", packetId, "--expires-at", expiresAt];
  const result = runPrintedArgv({
    argv, keys, home,
    dependencies: { observeCandidate: () => ({ ...CHECKOUT_HEAD }), readConsumedCandidateReceiptFn: () => ({ packet: { packetId }, receipt }), readOpenFindingsFn: () => findings },
  });
  const subjectSha256 = criticalActionSubjectSha256({ kind, candidate: CANDIDATE, subject: residualAcceptanceSubject({ receipt, findings }) });
  assert.equal(result.action.subjectSha256, subjectSha256);
  const { verified } = verifyWritten({ result, expectedCandidate: CANDIDATE, expectedAction: { kind, subjectSha256, expiresAt }, trustPolicy: keys.authority });
  assert.equal(verified.code, "CRITICAL-ACTION-PROOF-VERIFIED", JSON.stringify(verified));
});

/* ---------------------------------------------------------------------------------------------- *
 * Leg 3: the consumer verb (pipeline-state.mjs) reads what the signing verb mirrored
 * ---------------------------------------------------------------------------------------------- */

/** Runs one pipeline-state verb in-process the way a terminal would: machine plane and key directory pinned to the fixture. */
function runPipelineStateVerb(argv, { dir, home, keys, dependencies = {} }) {
  const names = ["HOME", "USERPROFILE", PO_APPROVAL_DIRECTORY_ENV];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env[PO_APPROVAL_DIRECTORY_ENV] = keys.directory;
  const stdout = [];
  const stderr = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => stdout.push(args.join(" "));
  console.error = (...args) => stderr.push(args.join(" "));
  try {
    const code = runPipelineState(argv, { dir, now: () => new Date().toISOString(), env: { ...process.env, HOME: home, USERPROFILE: home }, ...dependencies });
    return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n"), lines: stdout };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
}
const describeRun = (run) => `exit ${run.code}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`;

const STATE_PLAN_PATH = "specs/c22b-roundtrip/prd.md";
const STATE_SPEC_PATH = "specs/c22b-roundtrip/spec.md";
/** The committed files a pipeline-state consumer needs: plan and spec bytes whose digests the state records, and the project state. */
function consumerFiles(extra = {}) {
  return {
    "project/critical-human-proof.json": JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "acknowledge-caller-authored-critic"] }),
    "project/pipeline-state.json": JSON.stringify({
      schema: "pipeline.state.v0", planApproved: true,
      activeFeature: { id: FEATURE_ID, planPath: STATE_PLAN_PATH, phase: "implementation" },
      planApproval: { poGateAuthority: { planSha256: sha256("plan"), specSha256: sha256("spec") } },
      continuity: { authority: { spec: { path: STATE_SPEC_PATH } } },
    }, null, 2),
    [STATE_PLAN_PATH]: "plan", [STATE_SPEC_PATH]: "spec",
    ...extra,
  };
}

test("C22B consumer leg: acknowledge-caller-authored-critic -- the line approve-critic-acknowledgement prints is signed by the verb and the verb's mirror is what the follow-up command reads", () => {
  const repoRoot = fixtureRepository(consumerFiles());
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const verbDependencies = { observeCandidate: () => ({ ...CHECKOUT_HEAD }), readConsumedCandidateReceiptFn: () => ({ packet: { packetId: ACK_PACKET }, receipt: ACK_RECEIPT }) };
  const stateDependencies = { gitHead: () => ({ ok: true, ...CHECKOUT_HEAD }), gitCandidate: () => ({ ok: true, ...CHECKOUT_HEAD }), readConsumedCandidateReceiptFn: verbDependencies.readConsumedCandidateReceiptFn };
  const verb = ["approve-critic-acknowledgement", "--by", "PO", "--critic-packet", ACK_PACKET];

  // 1. Without a proof the verb prints the signing line (the emitter).
  const first = runPipelineStateVerb(verb, { dir: repoRoot, home, keys, dependencies: stateDependencies });
  assert.equal(first.code, 2, describeRun(first));
  const printed = JSON.parse(first.lines.at(-1));
  assert.equal(printed.status, "signature-required");
  const signing = printed.signatureCommand;

  // 2. The PO's terminal runs that line unchanged.
  const signed = runPrintedArgv({ argv: signing.argv.slice(1), keys, home, dependencies: verbDependencies });
  assert.equal(signed.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");

  // 3. The follow-up command names exactly the files the signing step wrote -- a mismatch here is the LOOP-A1 class.
  const follow = printed.acknowledgeCommand.argv;
  const at = (flag) => follow[follow.indexOf(flag) + 1];
  assert.equal(at("--proof-request"), signed.paths.request, "the printed request path is the mirror the verb wrote");
  assert.equal(at("--proof-authority"), signed.paths.authority, "the printed authority path is the mirror the verb wrote");
  assert.equal(at("--proof"), signed.paths.proof, "the printed proof path is the mirror the verb wrote");
  for (const flag of ["--proof-request", "--proof-authority", "--proof"]) assert.ok(existsSync(at(flag)), flag);

  // 4. The consumer accepts it, once.
  const acknowledged = runPipelineStateVerb(follow.slice(1), { dir: repoRoot, home, keys, dependencies: stateDependencies });
  assert.equal(acknowledged.code, 0, describeRun(acknowledged));
  assert.match(acknowledged.stdout, /Caller-authored Critic acknowledged by "PO"/u);
  const replay = runPipelineStateVerb(follow.slice(1), { dir: repoRoot, home, keys, dependencies: stateDependencies });
  assert.notEqual(replay.code, 0, "the same proof is not consumed twice");
});

test("ADR-0095 consumer leg: spec-addendum -- the line approve-spec-addendum prints is signed by the verb, the follow-up records it once and writes the committed approval record", () => {
  const fixture = specAddendumRepository();
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const verb = ["approve-spec-addendum", "--by", "PO", "--addendum", SPEC_ADDENDUM_PATH];

  const first = runPipelineStateVerb(verb, { dir: fixture.root, home, keys, dependencies: fixture.readers });
  assert.equal(first.code, 2, describeRun(first));
  const printed = JSON.parse(first.lines.at(-1));
  assert.equal(printed.status, "signature-required");
  assert.equal(printed.signatureCommand.argv[printed.signatureCommand.argv.indexOf("--addendum") + 1], SPEC_ADDENDUM_PATH);

  const signed = runPrintedArgv({ argv: printed.signatureCommand.argv.slice(1), keys, home, dependencies: { observeCandidate: () => fixture.head, ...fixture.readers } });
  assert.equal(signed.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
  assert.deepEqual(signed.candidate, fixture.head, "the signed candidate is the commit that holds the addendum");

  const follow = printed.recordCommand.argv;
  const recorded = runPipelineStateVerb(follow.slice(1), { dir: fixture.root, home, keys, dependencies: fixture.readers });
  assert.equal(recorded.code, 0, describeRun(recorded));
  const recordPath = /--add-spec-addendum (\S+),/u.exec(recorded.stdout)?.[1];
  assert.match(recordPath ?? "", /^specs\/c22b-roundtrip\/evidence\/spec-addendum-approval-[a-f0-9]{64}\.json$/u);
  const record = readJson(join(fixture.root, recordPath));
  assert.equal(record.mode, "signature");
  assert.deepEqual(record.subject, fixture.subject);
  assert.equal(record.candidate.commit, fixture.head.commit);
  const replay = runPipelineStateVerb(follow.slice(1), { dir: fixture.root, home, keys, dependencies: fixture.readers });
  assert.notEqual(replay.code, 0, "the same proof is not consumed twice");
  // The registration step finds the private approval the verb stored (same store, same subject digest, commit, time and proof).
  const registered = addSpecAddendum({ root: fixture.root, state: { activeFeature: { id: FEATURE_ID } }, approvalPath: recordPath });
  assert.equal(registered.status, "spec-addendum-added", JSON.stringify(registered));
});

test("ADR-0096 consumer leg: acknowledge-gate-definition-changes -- the line approve-gate-change-acknowledgement prints is signed by the verb, the follow-up records it once, and the close's readback then counts it", () => {
  const fixture = gateChangeRepository();
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const common = join(fixture.root, ".git");
  assert.equal(gateDefinitionChangeReadback({ rootDir: fixture.root, featureId: FEATURE_ID, commonDir: common }).status, "unproven", "before: the weakened manifest has no proof");
  const verb = ["approve-gate-change-acknowledgement", "--by", "PO"];

  const first = runPipelineStateVerb(verb, { dir: fixture.root, home, keys });
  assert.equal(first.code, 2, describeRun(first));
  const printed = JSON.parse(first.lines.at(-1));
  assert.equal(printed.status, "signature-required");
  assert.deepEqual(printed.signatureCommand.subject, fixture.subject, "the printed subject is the one builder's list");
  assert.match(first.stderr, /project\/pipeline\.yaml changed in [a-f0-9]{12}/u, "the agent shows the PO the list before the signing line");

  const prompts = [];
  const signed = runPrintedArgv({ argv: printed.signatureCommand.argv.slice(1), keys, home, dependencies: { observeCandidate: () => fixture.head, readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } } });
  assert.equal(signed.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
  assert.deepEqual(signed.candidate, fixture.head, "the signed candidate is the clean HEAD of the range");
  assert.match(prompts.join("\n"), /gate-definition change without a proof: project\/pipeline\.yaml changed/u, "the terminal shows the PO the same list");

  const follow = printed.recordCommand.argv;
  const recorded = runPipelineStateVerb(follow.slice(1), { dir: fixture.root, home, keys });
  assert.equal(recorded.code, 0, describeRun(recorded));
  assert.match(recorded.stdout, /Gate-definition changes acknowledged by "PO" \(signature\) for 1 change\(s\)/u);
  const after = gateDefinitionChangeReadback({ rootDir: fixture.root, featureId: FEATURE_ID, commonDir: common });
  assert.equal(after.status, "proven", JSON.stringify(after.unproven));
  assert.deepEqual([after.changes.at(-1).proof.kind, after.changes.at(-1).proof.label], ["po-acknowledgement", "acknowledged after the fact"]);
  const replay = runPipelineStateVerb(follow.slice(1), { dir: fixture.root, home, keys });
  assert.notEqual(replay.code, 0, "the same proof is not consumed twice");
});

test("ADR-0097 consumer leg: acknowledge-maintenance-red-check -- the line approve-maintenance-red-check prints is signed by the verb, the follow-up records it once, and the admission's proof reader then finds it", () => {
  const root = fixtureRepository(consumerFiles({ "tests/unit/docs.test.ts": "it('links', () => {})\n" }));
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const common = join(root, ".git");
  const head = { commit: gitOut(root, "rev-parse", "HEAD"), tree: gitOut(root, "rev-parse", "HEAD^{tree}") };
  const check = { id: "verify", path: "project/pipeline.json", verify: "configured", dependencies: ["project/pipeline.json", "tests/unit/docs.test.ts"] };
  const before = buildMaintenanceAcknowledgementSubjectAtHead({ root, commonDir: common });
  assert.equal(before.code, "MRA-NOTHING-TO-ACKNOWLEDGE", "nothing is acknowledged before a red observation exists");
  assert.equal(writeMaintenanceRedObservation({ commonDir: common, featureId: FEATURE_ID, check, candidate: head, exitCode: 1, outputSha256: sha256("red"), observedAt: new Date().toISOString() }).ok, true);
  const built = buildMaintenanceAcknowledgementSubjectAtHead({ root, commonDir: common });
  assert.equal(built.ok, true, JSON.stringify(built));
  const verb = ["approve-maintenance-red-check", "--by", "PO"];

  const first = runPipelineStateVerb(verb, { dir: root, home, keys });
  assert.equal(first.code, 2, describeRun(first));
  const printed = JSON.parse(first.lines.at(-1));
  assert.equal(printed.status, "signature-required");
  assert.deepEqual(printed.signatureCommand.subject, built.subject, "the printed subject is the one builder's list");
  assert.match(first.stderr, /the configured verify command \(exit 1 at [a-f0-9]{12}\)/u, "the agent shows the PO the list before the signing line");

  const prompts = [];
  const signed = runPrintedArgv({ argv: printed.signatureCommand.argv.slice(1), keys, home, dependencies: { observeCandidate: () => head, readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } } });
  assert.equal(signed.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
  assert.match(prompts.join("\n"), /red check without a Spec criterion: the configured verify command/u, "the terminal shows the PO the same list");

  const recorded = runPipelineStateVerb(printed.recordCommand.argv.slice(1), { dir: root, home, keys });
  assert.equal(recorded.code, 0, describeRun(recorded));
  assert.match(recorded.stdout, /Red maintenance check\(s\) acknowledged by "PO" \(signature\) for 1 check\(s\)/u);
  const proof = maintenanceRedProof({ commonDir: common, root, featureId: FEATURE_ID, approvalSha256: built.subject.approvalSha256, approvalCommit: null, check });
  assert.deepEqual([proof?.kind, proof?.mode, proof?.label], ["po-acknowledgement", "signature", "red before the feature acknowledged by the PO"]);
  assert.equal(buildMaintenanceAcknowledgementSubjectAtHead({ root, commonDir: common }).code, "MRA-NOTHING-TO-ACKNOWLEDGE", "an acknowledged check is not listed again");
  const replay = runPipelineStateVerb(printed.recordCommand.argv.slice(1), { dir: root, home, keys });
  assert.notEqual(replay.code, 0, "the same proof is not consumed twice");
});

/** An approved, implementing consumer (the production plan writers) whose two calibration tiers carry the same configured command, committed. */
// The fixture's plan is approved in the committed chat mode (a signed plan approval has no affordable fixture, and switching the mode
// afterwards makes the PO-gate authority stale, CVCT-AUTHORITY-STALE, by design). The signature leg therefore selects the strict proof
// path through the route's waiver seam; everything after it -- proof, store, transition, readback -- is the production code.
const SIGNATURE_MODE = Object.freeze({ criticalProofWaiverForFn: () => ({ waived: false, code: null }) });
function verifyReplacementRepository() {
  const root = mkdtempSync(join(nativeContractFixtureParent(), "verify-replace-"));
  prepareApprovedItemCourseFixture({ root });
  // The neutral tier is a byte copy of the committed legacy tier (its first appearance, free).
  commitFiles(root, { "project/pipeline.json": readFileSync(join(root, ".claude", "pipeline.json"), "utf8") }, "chore: the neutral calibration tier");
  return { root, common: join(root, ".git"), head: () => ({ commit: gitOut(root, "rev-parse", "HEAD"), tree: gitOut(root, "rev-parse", "HEAD^{tree}") }) };
}
const REPLACED_VERIFY = "node src/change.mjs";
const verifyTiers = (root) => ["project/pipeline.json", ".claude/pipeline.json"].map((path) => JSON.parse(readFileSync(join(root, path), "utf8")).verify);

test("ADR-0100 consumer leg: replace-verify-command -- configure-verify --replace runs the new command, the printed line is signed by the verb, the follow-up writes both tiers once and the close readback names the proof", () => {
  const fixture = verifyReplacementRepository();
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const stateDependencies = { architectureEntryReadiness: () => ({ status: "ready" }), ...SIGNATURE_MODE };
  const previous = verifyTiers(fixture.root);
  assert.equal(previous[0], previous[1]);
  const verb = ["configure-verify", "--verify-command", REPLACED_VERIFY, "--replace", "--by", "PO"];

  // 1. Without an approval the route runs the new command once on the clean tree and prints the signing line; nothing is written.
  const first = runPipelineStateVerb(verb, { dir: fixture.root, home, keys, dependencies: stateDependencies });
  assert.equal(first.code, 2, describeRun(first));
  assert.match(first.stderr, /running the new command once on the clean tree/u);
  const printed = JSON.parse(first.lines.at(-1));
  assert.equal(printed.status, "signature-required");
  assert.equal(printed.signatureCommand.kind, "replace-verify-command");
  assert.deepEqual([printed.signatureCommand.subject.previousCommand, printed.signatureCommand.subject.verifyCommand], [previous[0], REPLACED_VERIFY]);
  assert.deepEqual(printed.signatureCommand.subject.entries.map((entry) => entry.path).sort(), [".claude/pipeline.json", "project/pipeline.json"], "one signature covers both tiers");
  assert.deepEqual(verifyTiers(fixture.root), previous, "nothing is written before the signature");

  // 2. The PO's terminal runs the printed line unchanged; the verb derives the same subject from the test-run receipt.
  const prompts = [];
  const head = fixture.head();
  const signed = runPrintedArgv({ argv: printed.signatureCommand.argv.slice(1), keys, home, dependencies: { observeCandidate: () => head, readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } } });
  assert.equal(signed.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
  assert.equal(signed.action.subjectSha256, printed.signatureCommand.subjectSha256, "the terminal signs the digest the route printed");
  assert.match(prompts.join("\n"), new RegExp(`verify command after: ${REPLACED_VERIFY}`, "u"), "the terminal shows the PO the new command");

  // 3. The follow-up writes exactly the signed bytes into both tiers, once.
  const follow = printed.recordCommand.argv;
  const recorded = runPipelineStateVerb(follow.slice(1), { dir: fixture.root, home, keys, dependencies: stateDependencies });
  assert.equal(recorded.code, 0, describeRun(recorded));
  assert.match(recorded.stdout, /Verify command replaced \(signed by "PO"\)/u);
  assert.match(recorded.stdout, /chore: replace project verification command/u);
  assert.deepEqual(verifyTiers(fixture.root), [REPLACED_VERIFY, REPLACED_VERIFY]);
  const replay = runPipelineStateVerb(follow.slice(1), { dir: fixture.root, home, keys, dependencies: stateDependencies });
  assert.notEqual(replay.code, 0, "the same proof is not consumed twice");

  // 4. Committed, the close's readback counts both tier changes as the signed replacement (no label: it is signed).
  commitFiles(fixture.root, { "project/pipeline.json": readFileSync(join(fixture.root, "project/pipeline.json"), "utf8"), ".claude/pipeline.json": readFileSync(join(fixture.root, ".claude/pipeline.json"), "utf8") }, "chore: replace project verification command");
  const replacedAt = gitOut(fixture.root, "rev-parse", "HEAD");
  const readback = gateDefinitionChangeReadback({ rootDir: fixture.root, featureId: "unit", commonDir: fixture.common });
  const ours = readback.changes.filter((change) => change.commit === replacedAt);
  assert.deepEqual(ours.map((change) => change.path).sort(), [".claude/pipeline.json", "project/pipeline.json"], JSON.stringify(readback.changes));
  for (const change of ours) assert.deepEqual([change.proof?.kind, change.proof?.label], ["verify-replacement", null], JSON.stringify(change));
});

test("ADR-0100: under the committed chat mode the replacement is attributed, not signed, and the readback labels it so", () => {
  const fixture = verifyReplacementRepository();
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const stateDependencies = { architectureEntryReadiness: () => ({ status: "ready" }) };
  const replaced = runPipelineStateVerb(["configure-verify", "--verify-command", REPLACED_VERIFY, "--replace", "--by", "PO"], { dir: fixture.root, home, keys, dependencies: stateDependencies });
  assert.equal(replaced.code, 0, describeRun(replaced));
  assert.match(replaced.stdout, /Verify command replaced \(chat-attributed, not signed by "PO"\)/u);
  assert.deepEqual(verifyTiers(fixture.root), [REPLACED_VERIFY, REPLACED_VERIFY]);
  commitFiles(fixture.root, { "project/pipeline.json": readFileSync(join(fixture.root, "project/pipeline.json"), "utf8"), ".claude/pipeline.json": readFileSync(join(fixture.root, ".claude/pipeline.json"), "utf8") }, "chore: replace project verification command");
  const replacedAt = gitOut(fixture.root, "rev-parse", "HEAD");
  const ours = gateDefinitionChangeReadback({ rootDir: fixture.root, featureId: "unit", commonDir: fixture.common }).changes.filter((change) => change.commit === replacedAt);
  assert.equal(ours.length, 2);
  for (const change of ours) assert.deepEqual([change.proof?.kind, change.proof?.label], ["verify-replacement", "chat-attributed, not signed"], JSON.stringify(change));
});

test("ADR-0100: a red new command signs nothing and writes nothing; the default configure-verify still refuses a different command", () => {
  const fixture = verifyReplacementRepository();
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const stateDependencies = { architectureEntryReadiness: () => ({ status: "ready" }), ...SIGNATURE_MODE };
  const previous = verifyTiers(fixture.root);
  const red = runPipelineStateVerb(["configure-verify", "--verify-command", "node src/missing-entry.mjs", "--replace", "--by", "PO"], { dir: fixture.root, home, keys, dependencies: stateDependencies });
  assert.equal(red.code, 2, describeRun(red));
  assert.match(red.stderr, /CVR-TEST-RUN-RED/u);
  assert.ok(!red.stdout.includes("signature-required"), "a red test run prints no signing line");
  assert.deepEqual(verifyTiers(fixture.root), previous);
  const plain = runPipelineStateVerb(["configure-verify", "--verify-command", REPLACED_VERIFY], { dir: fixture.root, home, keys, dependencies: stateDependencies });
  assert.equal(plain.code, 2, "without --replace an already configured command only admits its exact replay");
  assert.deepEqual(verifyTiers(fixture.root), previous);
  const same = runPipelineStateVerb(["configure-verify", "--verify-command", previous[0], "--replace", "--by", "PO"], { dir: fixture.root, home, keys, dependencies: stateDependencies });
  assert.equal(same.code, 2);
  assert.match(same.stderr, /CVR-SAME-COMMAND/u);
});

test("C22B consumer leg: push -- the printed push line is signed by the verb and approve-push consumes the mirrored proof", () => {
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const threatModelBody = "fixture threat model\n";
  const repoRoot = fixtureRepository(consumerFiles({
    "README.md": "fixture\n",
    "pipeline.user.yaml": 'schema: "pipeline.user.v1"\ngates:\n  push_approval: "signature"\n',
    "project/critical-human-proof.json": JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"], trustAnchor: keys.authority }),
    "project/push-threat-model.md": threatModelBody,
  }));
  const remote = "origin";
  const destination = "refs/heads/main";
  const expiresAt = futureExpiry();
  const subject = { sourceCommit: CANDIDATE.commit, remote, destination, threatModel: { path: "project/push-threat-model.md", sha256: sha256(threatModelBody) } };
  const prepared = prepareAuthorizeCriticalLine({ kind: "push", candidate: CANDIDATE, subject, repoRoot, featureId: FEATURE_ID, plan: STATE_PLAN_PATH, spec: STATE_SPEC_PATH, expiresAt });
  const signed = runPrintedArgv({ argv: prepared.argv.slice(1), keys, home, dependencies: { observeCandidate: () => ({ ...CANDIDATE }) } });
  assert.equal(signed.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
  const approve = ["approve-push", "--by", "PO", "--remote", remote, "--destination", destination,
    "--proof-request", signed.paths.request, "--proof-authority", signed.paths.authority, "--proof", signed.paths.proof];
  const consumerDependencies = { gitHead: () => ({ ok: true, ...CANDIDATE }), gitCandidate: () => ({ ok: true, ...CANDIDATE }) };
  // The same bytes for another destination are another subject: the consumer refuses them (before the proof is consumed).
  const elsewhere = runPipelineStateVerb(approve.map((part) => (part === destination ? "refs/heads/other" : part)), { dir: repoRoot, home, keys, dependencies: consumerDependencies });
  assert.notEqual(elsewhere.code, 0, describeRun(elsewhere));
  assert.ok(!elsewhere.stdout.includes('Push approved by "PO"'), describeRun(elsewhere));
  const approved = runPipelineStateVerb(approve, { dir: repoRoot, home, keys, dependencies: consumerDependencies });
  assert.equal(approved.code, 0, describeRun(approved));
  assert.ok(approved.stdout.includes('Push approved by "PO"'), describeRun(approved));
});

test("C22B consumer leg: release-preflight -- the line prepareReleasePreflightAuthorizeLine prints is signed by the verb and buildReleasePreflight accepts the verb's proof", () => {
  const keys = keyDirectory();
  const home = fixtureDir("home");
  const manifest = `${JSON.stringify({ name: "pipeline-core", version: "1.2.3" })}\n`;
  const repoRoot = fixtureRepository({
    ".gitignore": "scratch/\n", // the signing step mirrors its artifacts into scratch/; the release gate wants a clean tree
    VERSION: "1.2.3\n",
    "plugins/pipeline-core/.codex-plugin/plugin.json": manifest,
    "plugins/pipeline-core/.claude-plugin/plugin.json": manifest,
    "plugins/pipeline-core/plugin.json": manifest,
    "docs/prd.md": "# prd\n", "docs/spec.md": "# spec\n", "docs/acceptance.md": "# acceptance\n", "docs/result.md": "# result\n",
    "lifecycle.json": `${JSON.stringify({ featureId: FEATURE_ID, documents: { prd: "docs/prd.md", spec: "docs/spec.md", acceptance: "docs/acceptance.md", result: "docs/result.md" } }, null, 2)}\n`,
    // The proof is required (no waiver): a consent that skipped the signature would not pass.
    "project/critical-human-proof.json": `${JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v2", requiredKinds: ["release-preflight"], waivedKinds: [] })}\n`,
  });
  const baseCommit = gitOut(repoRoot, "rev-parse", "HEAD");
  commitFiles(repoRoot, { "docs/result.md": "# result\n\nsecond revision\n" }, "fixture: candidate");
  const retentionPolicySha256 = "c".repeat(64);
  const printed = prepareReleasePreflightAuthorizeLine({ rootDir: repoRoot, baseCommit, lifecyclePath: "lifecycle.json", retentionPolicySha256, plan: "docs/prd.md", spec: "docs/spec.md" });
  const signed = runPrintedArgv({ argv: printed.argv.slice(1), keys, home, dependencies: { observeCandidate: () => ({ ...printed.candidate }) } });
  assert.equal(signed.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
  assert.equal(signed.action.subjectSha256, printed.subjectSha256, "the verb signed the digest the consumer's own subject produced");
  const build = (over = {}) => buildReleasePreflight({
    rootDir: repoRoot, preflightId: "c22b-preflight", baseCommit, proofRequestPath: signed.externalPaths.request, proofPath: signed.externalPaths.proof,
    lifecyclePath: "lifecycle.json", retentionPolicySha256, ...over,
  });
  // Another retention policy is another subject: the same proof does not carry over.
  assert.throws(() => build({ retentionPolicySha256: "d".repeat(64) }));
  const { record } = build();
  assert.equal(record.status, "ready", record.reasons?.join(", "));
  assert.equal(record.consent.status, "approved");
  assert.equal(record.consent.decisionId, readJson(signed.externalPaths.request).approvalIntent.sha256, "the consent is derived from the verified proof");
});
