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
 * TRUST BOUNDARY (`plugins/pipeline-core/lib/critical-human-proof-policy.mjs`): only content
 * that Git has actually committed at HEAD is ever treated as configuration; nothing read from
 * the mutable working tree is. Reimplemented locally rather than imported: `critical-human-
 * proof-policy.mjs`'s `committedBytes` helper is not exported and that file is out of scope for
 * this change (WP5-phx2-implementation field 4).
 *
 * WHY THIS IS NOT A BYTE-FOR-BYTE PORT OF `readPushApprovalMode` (WP5-phx2-rework-1, F4). That
 * reader's own "any working-tree divergence from HEAD -> fail closed" rule is safe there for a
 * reason that does not carry over: `readPushApprovalMode`'s absent-default and its fail-closed
 * default are the SAME value (`"signature"`), so collapsing every kind of divergence into one
 * bucket never changes the outcome. This module's absent-default (`"off"`, day-one safety, see
 * below) and its fail-closed default (`"required"`) are DIFFERENT values by design -- so the
 * same collapse is not merely conservative here, it is wrong: it would fail closed to
 * `"required"` for a working tree that is merely dirty for a reason that has nothing to do with
 * this key, even when HEAD's own committed content has no opinion at all or already says
 * `"off"`. The generalization that DOES carry over is the underlying trust boundary itself,
 * applied directly rather than through a byte-for-byte working-tree/HEAD comparison: resolve
 * the value from the committed blob's OWN content when Git has one at all (whatever it says --
 * `"off"`, `"required"`, absent-key, or malformed -- an uncommitted working-tree edit can
 * neither weaken NOR fabricate that answer, since it is never consulted for parsing), and only
 * when Git has no committed blob for this path at all does the day-one "off" default apply.
 * `git show HEAD:<path>` reads the OBJECT DATABASE, not the working-tree file, so this needs no
 * working-tree lstat/symlink check of its own for the "a committed blob exists" case: whatever
 * is currently on disk at `pipeline.user.yaml` (present, absent, a symlink, mid-edit) cannot
 * influence what HEAD's own blob says.
 *
 * `committedUserYamlBytes` therefore returns a THREE-WAY result, not a two-way one, and
 * `externalPushLedgerGate` branches on all three (this is the completed F4 fix, WP5-phx2-
 * rework-1 -- an earlier draft during the same fix collapsed the first two into one and broke
 * `harness/scripts/pipeline-state-external-push-ledger.test.mjs`'s PSXL05 case, which
 * deliberately runs `pipeline-state.mjs approve-push` against a directory that is not a git
 * repository at all to exercise `discoverRepository`'s own throw path):
 *   1. NO REPOSITORY could even be found at this path (`{ repoFound: false }`) -- Git itself
 *      could not be consulted, so nothing here is verifiable one way or the other. This is a
 *      genuine, key-presence-UNRELATED reason to distrust the source (the third bucket of the
 *      three-way distinction) -- but only when there is something to distrust: a working-tree
 *      file present here is an unverifiable CLAIM and fails closed to `"required"`; the
 *      complete absence of both a repository and a file is genuinely nothing to have an opinion
 *      about, `"off"`. An ordinary day-one project that has not opted in always HAS a real
 *      repository (this branch is not that case; see bucket 2).
 *   2. A repository exists, but HEAD has no blob at this path at all (`{ repoFound: true, bytes:
 *      null }`) -- never committed, including an untracked working-tree-only copy -- genuinely
 *      no committed opinion -> `"off"` (day-one safety, design §5, DoD case (a)), the OPPOSITE
 *      direction from ADR-0056's "absent resolves to strongest" -- because on day one of
 *      shipping this design, zero repositories have ever populated the write side, so a
 *      fail-closed default would break every push in every project the moment this code ships,
 *      with no operator action having caused it.
 *   3. A committed blob exists (`{ repoFound: true, bytes: Buffer }`) -- the fail-closed
 *      direction applies to its OWN content exactly as ADR-0056's does: anything other than the
 *      exact committed string `"off"` (an explicit `"required"`, an unrecognised value, or a
 *      blob that fails to parse as YAML at all) resolves to `"required"`, and an uncommitted
 *      working-tree edit can neither weaken NOR fabricate that answer, since it is never
 *      consulted for parsing (DoD cases (b)/(c)/(d)).
 *
 * `manifestOrDir` accepts a directory (string) -- read `pipeline.user.yaml`'s HEAD-committed
 * blob from underneath it -- or an already-parsed, caller-trusted `pipeline.user.yaml`-shaped
 * document (object) -- read `.gates.push_external_ledger` directly off it, no re-verification.
 * Both of this module's actual call sites (`guard-push.mjs`'s read side, `pipeline-state.mjs`'s
 * `approve-push` write side) pass the directory form: `guard-push.mjs`'s already-loaded
 * `manifest` variable is `project/pipeline.yaml`'s (or `.claude/pipeline.yaml`'s) parsed
 * content, a DIFFERENT file with a different, nested `gates.push.approval` shape than
 * `pipeline.user.yaml`'s flat `gates.push_external_ledger` -- passing it here would silently
 * never find the key. `guard-push.mjs` calls this with the governed SESSION ROOT
 * (`fallbackProjectDir()`, not the pushed repository's own `projectDir` -- WP5-phx2-rework-1,
 * F5: reading it from the pushed repository would let a pushed repository's own committed
 * `gates.push_external_ledger: "off"` stand this gate down for a session whose own root has it
 * required, exactly the flaw the ADR-0056 waiver check one function above already avoids and
 * documents its own reason for avoiding), same string form `pipeline-state.mjs`'s `approve-push`
 * uses for its `dir`. The object form is kept, disclosed and tested, purely so the exported
 * `manifestOrDir` signature is not a silent lie about what it accepts.
 *
 * VERIFY: node plugins/pipeline-core/lib/external-push-ledger.test.mjs
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
 * The bytes Git has for `pipeline.user.yaml` at HEAD, discriminated from WHY there might be
 * none: `{ repoFound: false }` when no repository could be found at `dir` at all (Git itself
 * could not be consulted, so nothing here is verifiable one way or the other); otherwise
 * `{ repoFound: true, bytes: Buffer|null }`, `bytes` being `null` when the repository exists
 * but HEAD simply has no blob at this path (never committed, or committed and later removed).
 * Mirrors `critical-human-proof-policy.mjs`'s `committedBytes` (not exported there, and that
 * file is out of scope here -- see header) for the underlying git plumbing, but returns the
 * repo-found/no-blob split that one collapses, because -- unlike that sibling's push_approval,
 * whose absent-default and fail-closed default are the SAME value -- this module's two
 * defaults differ (see the header's "WHY THIS IS NOT A BYTE-FOR-BYTE PORT" paragraph), so which
 * of the two null-causing situations happened is externally observable behavior here, not an
 * internal detail. Kept in step with that precedent's own hard-won fixes: the rev-spec path
 * resolves against the repository TOP LEVEL, not `-C`, and only the directory component is
 * realpath-resolved (a symlinked `pipeline.user.yaml` itself must not be followed).
 */
function committedUserYamlBytes(dir) {
  try {
    const top = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (top.error || top.status !== 0 || typeof top.stdout !== "string") return { repoFound: false };
    const repoRoot = top.stdout.trim();
    if (repoRoot === "") return { repoFound: false };
    // Only the DIRECTORY is realpath-resolved -- the `pipeline.user.yaml` path component is a
    // purely lexical join, never touched on disk here. `git show HEAD:<path>` reads the object
    // database by that path string; it does not traverse or dereference whatever currently sits
    // at that path in the working tree (present, absent, or a symlink), so a symlinked working-
    // tree copy cannot influence what this function returns either way.
    const relPath = relative(repoRoot, join(realpathSync(resolve(dir)), USER_SOURCE_PATH));
    if (relPath === "" || relPath.startsWith("..") || isAbsolute(relPath)) return { repoFound: false };
    const result = spawnSync("git", ["-C", dir, "show", `HEAD:${relPath.split(sep).join("/")}`], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0 || !result.stdout) return { repoFound: true, bytes: null };
    return { repoFound: true, bytes: Buffer.from(result.stdout) };
  } catch {
    return { repoFound: false };
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
  const committed = committedUserYamlBytes(dir);
  if (!committed.repoFound) {
    // No repository could even be found at this path -- Git could not be consulted at all, so
    // nothing here is verifiable one way or the other. That is a genuine, key-presence-
    // UNRELATED reason to distrust the source (the third bucket of the F4 fix's three-way
    // distinction), distinct from an ordinary day-one project that simply has not opted in yet
    // (which always has a real repository, see the `repoFound` branch below). A working-tree
    // file making an unverifiable claim here fails closed; the complete absence of both a
    // repository AND a file is genuinely nothing to have an opinion about at all.
    return existsSync(join(dir, USER_SOURCE_PATH)) ? "required" : "off";
  }
  if (committed.bytes === null) {
    // A real repository exists, but HEAD has no blob for pipeline.user.yaml at this path at
    // all (never committed, including an untracked working-tree-only copy) -- genuinely no
    // committed opinion -> "off" (day-one safety, design §5), regardless of what an untracked
    // working-tree copy happens to say (WP5-phx2-rework-1 F4, DoD case (a)).
    return "off";
  }
  // A committed blob exists -- resolve strictly from ITS content, never the working tree's.
  // This is the actual F4 fix: the previous version returned a hardcoded "required" the moment
  // the working tree merely differed from this blob for ANY reason, without ever parsing what
  // the blob itself says (DoD cases (b)/(c)). Reading straight from the committed blob makes an
  // uncommitted working-tree edit powerless either way: it can neither weaken an already
  // "required" committed gate (EPL16/EPL17/PGXL06, unchanged -- DoD case (d)) nor fabricate a
  // "required" out of a committed "off" or a committed absence (the bug F4 reported).
  try {
    return resolveGateValue(parseYaml(committed.bytes.toString("utf8"))?.gates?.push_external_ledger);
  } catch {
    return "required"; // committed blob does not even parse as this module's YAML subset
  }
}
