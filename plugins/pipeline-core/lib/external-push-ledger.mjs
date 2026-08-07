#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * external-push-ledger.mjs — additive, external, single-use push-proof consumption
 * ledger (PHX-2). Design: specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md.
 *
 * WHY THIS EXISTS (design §1). ADR-0056's `signature`-mode push gate already verifies a
 * detached Ed25519 proof and refuses to consume the same `proofSha256` twice via
 * `state.criticalProofConsumption` -- but that single-use marker lives entirely inside
 * `project/pipeline-state.json`, a mutable Git working-tree file. Nothing about it survives
 * a `git checkout` to an earlier commit, a fresh worktree, or a fresh clone that predates the
 * consumption write. This module adds a SECOND, independently stored, independently checked
 * single-use marker outside the Git working tree entirely, so a bug or reset in the local
 * enforcement chain no longer suffices by itself to replay a proof.
 *
 * WHAT THIS IS NOT (design §1/§6): not a new proof of human identity, not encryption, not a
 * lock file, not a hash chain, not a recovery/replay journal, no revocation/expiry, no CLI. A
 * single-use consumption marker per `(repositoryFingerprint, proofSha256)` pair, nothing more.
 * Both path components are derivable from already-plaintext-visible data (design §3's closing
 * paragraph); this module does not claim tamper-resistance against a same-privilege adversary
 * with unrestricted filesystem access.
 *
 * SCHEMA (design §3): `pipeline.external-push-ledger.v1`, written to
 * `join(rootDir, ".pipeline", "push-ledger", repositoryFingerprint, `${proofSha256}.json`)`.
 * Exactly four keys: schema, repositoryFingerprint, proofSha256, consumedAt.
 *
 * WRITE (design §3/§4): `mkdirSync(dirname(path), { recursive: true, mode: 0o700 })` (idempotent,
 * covers the first-use-in-a-repository case where the directory does not exist yet) followed by
 * `writeFileSync(path, json, { flag: "wx", mode: 0o600 })`. `wx` is the single-use mechanism
 * itself: a second write for the same `proofSha256` fails atomically with `EEXIST`, surfaced as
 * its own distinct code `PUSH-EXTERNAL-LEDGER-ALREADY-CONSUMED` (design §4: this is the
 * mechanism working as designed, not a filesystem condition to retry). Any other mkdir/write
 * failure (permission denied, read-only/full filesystem, or -- per design §3's disclosed,
 * narrow caveat -- a lock-manager race on a non-local/NFS-style mount) returns the disclosed
 * `PUSH-EXTERNAL-LEDGER-WRITE-FAILED` instead.
 *
 * READ (design §3/§4): returns `{ ok: true }` only on an exact four-key schema match with a
 * matching `repositoryFingerprint`/`proofSha256`. Absent file, or unreadable for a reason
 * unrelated to content, is `PUSH-EXTERNAL-LEDGER-MISSING` -- an unreadable ledger is not
 * evidence of consumption. Present-but-wrong (malformed JSON, wrong/extra keys, a fingerprint
 * or proof mismatch) is `PUSH-EXTERNAL-LEDGER-MISMATCH`, deliberately the SAME disposition as
 * absent: a present-but-wrong record must never be treated as better than no record.
 *
 * `candidate` is accepted by `checkExternalPushLedgerConsumption` for interface symmetry with
 * `authorizeRecordedPush` (design §2) but is not part of the stored record and is not itself
 * checked here -- the marker is scoped to exactly `repositoryFingerprint + proofSha256`
 * (design §3), which is already bound to a specific commit/tree via `authorizeRecordedPush`'s
 * own, already-verified, `criticalProof.subjectSha256` binding upstream of this check.
 *
 * `externalPushLedgerGate(manifestOrDir)` (design §3/§5): reads `gates.push_external_ledger`
 * out of `pipeline.user.yaml`, modeled on `readPushApprovalMode`'s committed-content-verified
 * shape (`plugins/pipeline-core/lib/critical-human-proof-policy.mjs`) -- a working-tree copy
 * that differs from the blob committed at HEAD is never trusted, so an in-session edit can only
 * ever strengthen this gate, never weaken it (same asymmetry, same rationale as that module's
 * own header comment). Reimplemented locally rather than imported: `critical-human-proof-
 * policy.mjs`'s `committedBytes` helper is not exported and that file is out of scope for this
 * change (WP5-phx2-implementation field 4).
 *
 * ONE deliberate divergence from `readPushApprovalMode`'s own direction (design §5, day-one
 * safety): absent file or absent key resolves to `"off"` (not consulted at all), the OPPOSITE
 * direction from ADR-0056's "absent resolves to strongest" -- because on day one of shipping
 * this design, zero repositories have ever populated the write side, so a fail-closed default
 * would break every push in every project the moment this code ships, with no operator action
 * having caused it. Once a value is genuinely configured (or the source cannot be trusted --
 * unreadable, unsafe path shape, or an uncommitted working-tree divergence from HEAD), the
 * fail-closed direction re-applies exactly as ADR-0056's does: anything other than the exact
 * string `"off"` resolves to `"required"`.
 *
 * `manifestOrDir` accepts a directory (string) -- read `pipeline.user.yaml` from underneath it,
 * committed-content-verified -- or an already-parsed, caller-trusted `pipeline.user.yaml`-
 * shaped document (object) -- read `.gates.push_external_ledger` directly off it, no
 * re-verification. Both of this module's actual call sites (`guard-push.mjs`'s read side,
 * `pipeline-state.mjs`'s `approve-push` write side) pass the directory form: `guard-push.mjs`'s
 * already-loaded `manifest` variable is `project/pipeline.yaml`'s (or `.claude/pipeline.yaml`'s)
 * parsed content, a DIFFERENT file with a different, nested `gates.push.approval` shape than
 * `pipeline.user.yaml`'s flat `gates.push_external_ledger` -- passing it here would silently
 * never find the key. `guard-push.mjs` calls this with its own `projectDir` (already in scope,
 * same string form `pipeline-state.mjs`'s `approve-push` uses for its `dir`) instead. The object
 * form is kept, disclosed and tested, purely so the exported `manifestOrDir` signature is not a
 * silent lie about what it accepts.
 *
 * VERIFY: node plugins/pipeline-core/lib/external-push-ledger.test.mjs
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { parseYaml } from "./yaml-lite.mjs";
import { USER_SOURCE_PATH } from "./critical-human-proof-policy.mjs";

export const EXTERNAL_PUSH_LEDGER_SCHEMA = "pipeline.external-push-ledger.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const EXPECTED_KEYS = ["schema", "repositoryFingerprint", "proofSha256", "consumedAt"];

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(`${label} must be a lowercase sha256 hex digest`);
  }
}

function ledgerPath(rootDir, repositoryFingerprint, proofSha256) {
  return join(rootDir, ".pipeline", "push-ledger", repositoryFingerprint, `${proofSha256}.json`);
}

/**
 * Writes the single-use external consumption marker. `wx` is the whole mechanism: a second
 * call for the same `(repositoryFingerprint, proofSha256)` pair fails atomically with `EEXIST`.
 */
export function appendExternalPushLedgerConsumption({
  repositoryFingerprint, proofSha256, consumedAt, rootDir = homedir(),
}) {
  assertSha256(repositoryFingerprint, "repositoryFingerprint");
  assertSha256(proofSha256, "proofSha256");
  if (typeof consumedAt !== "string" || Number.isNaN(Date.parse(consumedAt))) {
    throw new TypeError("consumedAt must be an ISO-8601 timestamp string");
  }
  const path = ledgerPath(resolve(rootDir), repositoryFingerprint, proofSha256);
  const record = { schema: EXTERNAL_PUSH_LEDGER_SCHEMA, repositoryFingerprint, proofSha256, consumedAt };
  const json = `${JSON.stringify(record, null, 2)}\n`;
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, json, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") return { ok: false, code: "PUSH-EXTERNAL-LEDGER-ALREADY-CONSUMED" };
    // Any other mkdir/write failure: permission denied, read-only/full filesystem, or (design
    // §3's disclosed caveat) a lock-manager race on a non-local mount. Not the single-use
    // mechanism firing -- a genuine filesystem condition, documented here rather than a second
    // export, since the design intentionally leaves the exact code "of your choosing".
    return { ok: false, code: "PUSH-EXTERNAL-LEDGER-WRITE-FAILED" };
  }
  return { ok: true };
}

/**
 * Reads the marker back. `candidate` is accepted (interface symmetry, see header) but not
 * itself checked -- see header comment for why that is not a gap.
 */
export function checkExternalPushLedgerConsumption({
  repositoryFingerprint, proofSha256, candidate, rootDir = homedir(),
}) {
  void candidate;
  assertSha256(repositoryFingerprint, "repositoryFingerprint");
  assertSha256(proofSha256, "proofSha256");
  const path = ledgerPath(resolve(rootDir), repositoryFingerprint, proofSha256);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // Absent, or unreadable for a reason unrelated to content (permission error, rootDir
    // itself unreadable, etc.) -- both collapse to the same disposition (design §4): an
    // unreadable ledger is not evidence of consumption.
    return { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISSING" };
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISMATCH" };
  }
  const keys = record !== null && typeof record === "object" && !Array.isArray(record) ? Object.keys(record) : null;
  const shapeOk = keys !== null
    && keys.length === EXPECTED_KEYS.length
    && EXPECTED_KEYS.every((key) => Object.hasOwn(record, key))
    && record.schema === EXTERNAL_PUSH_LEDGER_SCHEMA
    && record.repositoryFingerprint === repositoryFingerprint
    && record.proofSha256 === proofSha256
    && typeof record.consumedAt === "string";
  if (!shapeOk) return { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISMATCH" };
  return { ok: true };
}

/**
 * The bytes Git has for `pipeline.user.yaml` at HEAD, or `null` when it has none. Mirrors
 * `critical-human-proof-policy.mjs`'s `committedBytes` (not exported there, and that file is
 * out of scope here -- see header). Kept in step with that precedent's own hard-won fixes: the
 * rev-spec path resolves against the repository TOP LEVEL, not `-C`, and only the directory
 * component is realpath-resolved (a symlinked `pipeline.user.yaml` itself must not be followed).
 */
function committedUserYamlBytes(dir) {
  try {
    const top = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (top.error || top.status !== 0 || typeof top.stdout !== "string") return null;
    const repoRoot = top.stdout.trim();
    if (repoRoot === "") return null;
    // Only the DIRECTORY is realpath-resolved -- a symlinked pipeline.user.yaml itself must
    // not be followed (readPushApprovalMode rejects that shape before this ever runs).
    const relPath = relative(repoRoot, join(realpathSync(resolve(dir)), USER_SOURCE_PATH));
    if (relPath === "" || relPath.startsWith("..") || isAbsolute(relPath)) return null;
    const result = spawnSync("git", ["-C", dir, "show", `HEAD:${relPath.split(sep).join("/")}`], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0 || !result.stdout) return null;
    return Buffer.from(result.stdout);
  } catch {
    return null;
  }
}

/** Resolves `gates.push_external_ledger` to exactly `"off"` or `"required"` (design §4/§5). */
function resolveGateValue(value) {
  if (value === undefined) return "off";
  if (value === "off") return "off";
  if (value === "required") return "required";
  return "required"; // unrecognised -> fails closed, mirrors ADR-0056 decision 2
}

export function externalPushLedgerGate(manifestOrDir) {
  if (manifestOrDir !== null && typeof manifestOrDir === "object") {
    return resolveGateValue(manifestOrDir?.gates?.push_external_ledger);
  }
  if (typeof manifestOrDir !== "string" || manifestOrDir === "") {
    throw new TypeError("externalPushLedgerGate requires a directory string or a parsed document object");
  }
  const dir = resolve(manifestOrDir);
  const path = join(dir, USER_SOURCE_PATH);
  const committed = committedUserYamlBytes(dir);
  if (!existsSync(path)) {
    // Nothing anywhere -> genuinely no opinion -> "off" (day-one safety, design §5). A
    // committed blob that the working tree deleted is an uncommitted divergence, not "no
    // opinion" -- fails closed instead of silently reading as "off".
    return committed === null ? "off" : "required";
  }
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return "required";
    const raw = readFileSync(path, "utf8");
    if (committed === null || Buffer.compare(committed, Buffer.from(raw, "utf8")) !== 0) {
      // Working tree disagrees with (or cannot be confirmed against) HEAD -> the same
      // "uncommitted" disposition readPushApprovalMode uses, fails closed here too.
      return "required";
    }
    return resolveGateValue(parseYaml(raw)?.gates?.push_external_ledger);
  } catch {
    return "required";
  }
}
