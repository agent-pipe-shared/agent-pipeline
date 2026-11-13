#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * goldfish-host-commit-recover.mjs -- the sanctioned way to land a Goldfish result that sits uncommitted after its host
 * commit did not land (AC-164, slice C18-1B). Replaces a hand-built orchestrator commit with a command that writes the
 * task-to-commit link itself.
 *
 *   plan  --root <root> [--dispatch-id <id>] [--allowed-path <p>]... [--path <p>]...        read-only
 *   apply --root <root> [same flags] --expect-sha256 <planSha256 printed by plan>           one ordinary commit
 *
 * Sources: the pending host-commit state while it exists (binding.dispatchId, candidateCommit, allowedPaths); otherwise
 * the explicit flags (--dispatch-id plus at least one --allowed-path). --path names the changed paths claimed; without it
 * the changed allowed paths are read from the tree. The newest stop-failure record (if any) is named in the commit body.
 * The commit is `git commit -F scratch/commit-msg/<id>.txt -- <exact paths>`, hooks enabled, never `git add -A`.
 * Exit 0 ready/committed, 2 refused. Output is JSON `pipeline.goldfish-host-commit-recover-plan.v1`.
 *
 * With `--briefing <file> --handback <file>` (repository-relative, under scratch/, evidence/ or specs/; the briefing is the
 * file dispatch-briefing.mjs wrote, the hand-back holds the text the Goldfish returned) the dispatch binding is read from the
 * briefing, the briefed check files must exist, and `apply` also writes the typed `orchestrator-attested` dispatch record of
 * the commit it made (dispatch-record-write.mjs, `--attested-request`). That record is authored by the Goldfish, committed
 * and verified by the orchestrator, and labelled as NOT host-observed evidence (`record.hostObserved: false`); a v4
 * authored-commit record without host observation stays refused by the writer. Plan binds HEAD, the paths and both inputs
 * into `planSha256`, so a moved HEAD or a changed input makes `apply` refuse before any commit.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { readNativeGoldfishStopFailure } from "../hooks/native-goldfish-host.mjs";
import { clearNativeGoldfishStopFailures } from "../lib/native-goldfish-host-finalizer.mjs";
import { scopesTouch } from "../lib/running-goldfish-scope.mjs";
import { attestedInputPath, readAttestedBriefingBlock, runAttestedRequest } from "./dispatch-record-write.mjs";
import { integratedResultCovers } from "./agy-native-integrate.mjs";

export const PLAN_SCHEMA = "pipeline.goldfish-host-commit-recover-plan.v1";
const DISPATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const SELF = fileURLToPath(import.meta.url);
const WRITER = fileURLToPath(new URL("./dispatch-record-write.mjs", import.meta.url));
const SYNTAX = "plan|apply --root <root> [--dispatch-id <id>] [--allowed-path <p>]... [--path <p>]... [--briefing <briefing file> --handback <hand-back file>] [--expect-sha256 <digest>]";
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTSIDE_LISTED = 20;

const git = (cwd, args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, timeout: 30_000, maxBuffer: 1 << 24 });
  return { ok: r.status === 0, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const refuse = (code, message, next) => ({ code, message, next });

/** Strict argv: verb, then flag/value pairs; --dispatch-id and --expect-sha256 once, --allowed-path and --path repeated. */
export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (verb !== "plan" && verb !== "apply") return { error: `unknown verb; usage: ${SYNTAX}` };
  const out = { verb, root: null, dispatchId: null, allowed: [], paths: [], expect: null, briefing: null, handback: null };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (typeof value !== "string" || value === "" || /[\u0000-\u001f\u007f]/u.test(value)) return { error: `flag ${flag} needs one value; usage: ${SYNTAX}` };
    if (flag === "--root" && out.root === null) out.root = value;
    else if (flag === "--dispatch-id" && out.dispatchId === null) out.dispatchId = value;
    else if (flag === "--briefing" && out.briefing === null) out.briefing = value;
    else if (flag === "--handback" && out.handback === null) out.handback = value;
    else if (flag === "--expect-sha256" && out.expect === null) out.expect = value;
    else if (flag === "--allowed-path") out.allowed.push(value);
    else if (flag === "--path") out.paths.push(value);
    else return { error: `unknown or repeated flag ${flag}; usage: ${SYNTAX}` };
  }
  if (out.root === null) return { error: `--root is required; usage: ${SYNTAX}` };
  return out;
}

/** A repository-relative POSIX path from a relative or absolute spelling, or null when it leaves the root or is unusable. */
export function normalizePath(root, value) {
  const rel = isAbsolute(value) ? relative(root, value).split(sep).join("/") : value.replaceAll("\\", "/");
  const clean = posix.normalize(rel);
  if (clean === "." || clean === "" || clean.startsWith("../") || clean === ".." || isAbsolute(clean) || clean.startsWith("-") || clean.startsWith(".git/")) return null;
  return clean;
}

/** Pending host-commit states carrying a binding, read tolerantly (diagnostic read; nothing is trusted beyond the binding). */
function readPendingBindings(commonDir) {
  const directory = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
  const found = [];
  let names = [];
  try { names = readdirSync(directory); } catch { return found; }
  for (const name of names.sort()) {
    if (!/^pending-.+\.json$/u.test(name)) continue;
    try {
      const state = JSON.parse(readFileSync(join(directory, name), "utf8"));
      const b = state?.binding;
      if (typeof b?.dispatchId === "string" && DISPATCH_ID.test(b.dispatchId) && OID.test(b.candidateCommit ?? "")
        && Array.isArray(b.allowedPaths) && b.allowedPaths.every((p) => typeof p === "string")) {
        found.push({ file: name, dispatchId: b.dispatchId, candidateCommit: b.candidateCommit, allowedPaths: b.allowedPaths, createdAtMs: Number(state.createdAtMs) || 0 });
      }
    } catch { /* unreadable pending state is not a source */ }
  }
  return found;
}

/** The bounded, already scrubbed cause fields of a stop-failure record: the reason (or the detail's own reason), the stage and the detail; absent fields are left out. */
export function stopFailureCause(record) {
  const reason = typeof record?.reason === "string" && record.reason !== "" ? record.reason
    : typeof record?.detail?.reason === "string" && record.detail.reason !== "" ? record.detail.reason : null;
  return {
    ...(reason ? { reason } : {}),
    ...(typeof record?.stage === "string" && record.stage !== "" ? { stage: record.stage } : {}),
    ...(record?.detail && typeof record.detail === "object" && !Array.isArray(record.detail) ? { detail: record.detail } : {}),
  };
}

/** The newest stop-failure record with its file name (the exported reader gives the content, not the file). */
function newestStopFailure(commonDir) {
  const record = readNativeGoldfishStopFailure({ commonDir });
  if (!record) return null;
  const directory = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
  for (const name of readdirSync(directory).sort()) {
    if (!/^stop-failure-.+\.json$/u.test(name)) continue;
    try {
      const entry = JSON.parse(readFileSync(join(directory, name), "utf8"));
      if (entry?.code === record.code && entry?.observedAt === record.observedAt) return { file: name, code: record.code, dispatchId: record.dispatchId, ...stopFailureCause(record) };
    } catch { /* skip */ }
  }
  return null;
}

function changedPaths(root) {
  const r = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!r.ok) return null;
  const changed = new Set();
  const parts = r.out.split("\0");
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    changed.add(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") i += 1; // the original path follows; the new path is the claim
  }
  return changed;
}

function untrackedPaths(root) {
  const r = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return r.ok ? r.out.split("\0").filter(Boolean) : [];
}

/**
 * C28: the newest commit that carries this dispatch's own `Dispatch: <id> (goldfish)` trailer between its candidate and HEAD (the host commit, or an earlier run of this
 * command), or null. The candidate must be an ancestor of HEAD, so an older delivery under a reused id is never mistaken for this one.
 */
function findLandedCommit(root, dispatchId, startCommit) {
  if (!dispatchId || !OID.test(startCommit ?? "")) return null;
  if (!git(root, ["merge-base", "--is-ancestor", startCommit, "HEAD"]).ok) return null;
  const escaped = dispatchId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const found = git(root, ["log", "-1", "--format=%H", "-E", `--grep=^Dispatch: ${escaped} \\(goldfish\\)$`, `${startCommit}..HEAD`]);
  const commit = found.ok ? found.out.trim() : "";
  return OID.test(commit) ? commit : null;
}

export function buildMessage({ dispatchId, stopFailure }) {
  const pointer = stopFailure
    ? `Stop failure record: ${stopFailure.file} (code ${stopFailure.code}).`
    : "Stop failure record: none; the stop left no diagnostic.";
  return `chore(dispatch): land ${dispatchId} result as an orchestrator commit\n\n`
    + `The host commit of this dispatch did not land; its result was committed from the working tree by the orchestrator.\n\n`
    + `${pointer}\n\nAI-Assisted: true\nDispatch: ${dispatchId} (goldfish)\nCommit-Act: orchestrator\n`;
}

const shellWord = (value) => (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(value) ? value : JSON.stringify(value));
/** The exact command that repeats this verb with the same inputs: every refusal that can be cured by planning again names it. */
function commandLine(verb, root, options, dispatchId, extra = []) {
  const flags = [...(dispatchId ? ["--dispatch-id", dispatchId] : []), ...(options.briefing ? ["--briefing", options.briefing] : []),
    ...(options.handback ? ["--handback", options.handback] : []), ...options.allowed.flatMap((p) => ["--allowed-path", p]),
    ...options.paths.flatMap((p) => ["--path", p]), ...extra];
  return ["node", SELF, verb, "--root", root, ...flags].map(shellWord).join(" ");
}

/**
 * The record route's inputs: the generated briefing (its host-commit block is the dispatch binding) and the Goldfish's returned
 * text. Both are read and digested here so that plan binds them; nothing is written. Returns null when neither flag is given.
 */
function loadRecordInputs(root, options, refusals) {
  if (!options.briefing && !options.handback) return null;
  const read = (value, label, flag) => {
    let rel;
    try { rel = attestedInputPath(value, label); } catch (error) {
      refusals.push(refuse("GHCR-INPUT-PATH", error.message, `pass ${flag} as a repository-relative path under scratch/, evidence/ or specs/`));
      return null;
    }
    try {
      const absolute = join(root, rel);
      const info = statSync(absolute);
      if (!info.isFile() || info.size === 0 || info.size > MAX_INPUT_BYTES) throw new Error("not a bounded file");
      const bytes = readFileSync(absolute);
      return { rel, sha256: sha(bytes), bytes };
    } catch {
      refusals.push(refuse("GHCR-INPUT-UNREADABLE", `${label} ${rel} is not a readable non-empty file`, `write ${label === "briefing" ? "the briefing file dispatch-briefing.mjs produced" : "the text the Goldfish returned"} to ${rel} (or pass the right path to ${flag}) and plan again`));
      return null;
    }
  };
  if (!options.briefing) {
    refusals.push(refuse("GHCR-BRIEFING-REQUIRED", "a hand-back file belongs to one briefing", "add --briefing <the briefing file dispatch-briefing.mjs wrote for this dispatch>"));
    return null;
  }
  const briefing = read(options.briefing, "briefing", "--briefing");
  if (!briefing) return null;
  let block;
  try { block = readAttestedBriefingBlock(briefing.bytes); } catch (error) {
    refusals.push(refuse("GHCR-BRIEFING-INVALID", `${error.message}`, "pass the briefing file that dispatch-briefing.mjs wrote for this dispatch (--briefing)"));
    return null;
  }
  if (!DISPATCH_ID.test(block.dispatchId)) { refusals.push(refuse("GHCR-DISPATCH-ID", "the briefing's dispatch id is not a safe token", "pass the briefing exactly as generated")); return null; }
  if (!options.handback) {
    refusals.push(refuse("GHCR-HANDBACK-REQUIRED", "the typed record binds the text the Goldfish returned",
      `write that text to scratch/handback-${block.dispatchId}.txt and add --handback scratch/handback-${block.dispatchId}.txt: ${commandLine("plan", root, { ...options, handback: `scratch/handback-${block.dispatchId}.txt` }, block.dispatchId)}`));
    return null;
  }
  const handback = read(options.handback, "hand-back", "--handback");
  if (!handback) return null;
  return { block, briefing: { rel: briefing.rel, sha256: briefing.sha256 }, handback: { rel: handback.rel, sha256: handback.sha256 } };
}

export function plan(options) {
  const refusals = [];
  let root;
  try { root = realpathSync(resolve(options.root)); } catch { return { status: "refused", code: "GHCR-ROOT", refusals: [refuse("GHCR-ROOT", "the root is not readable", `pass an existing repository with --root`)], paths: [] }; }
  const commonDir = resolveGitCommonDir(root);
  const head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!commonDir || !head.ok) return { status: "refused", code: "GHCR-NOT-A-REPOSITORY", paths: [], refusals: [refuse("GHCR-NOT-A-REPOSITORY", "the root is not a git repository with a HEAD", "run from the project root")] };
  const headSha = head.out.trim();

  // Source: the briefing (record route), else the pending binding while it exists, else the explicit flags.
  const inputs = loadRecordInputs(root, options, refusals);
  const pendings = readPendingBindings(commonDir);
  let candidates = options.dispatchId ? pendings.filter((p) => p.dispatchId === options.dispatchId) : pendings;
  let stop = null;
  try { stop = newestStopFailure(commonDir); } catch { stop = null; }
  if (!options.dispatchId && candidates.length > 1 && stop) candidates = candidates.filter((p) => p.dispatchId === stop.dispatchId);
  let dispatchId = null, candidateCommit = null, allowedRaw = null, source = null;
  if (inputs) {
    // The briefing is the binding. Its candidate commit is advisory (other work may have moved HEAD since it was generated);
    // the head that counts is the one this plan binds, and apply refuses when it has moved since.
    dispatchId = inputs.block.dispatchId; allowedRaw = inputs.block.allowedPaths; source = "briefing";
    if (options.dispatchId && options.dispatchId !== dispatchId) {
      refusals.push(refuse("GHCR-BRIEFING-MISMATCH", "--dispatch-id differs from the dispatch id in the briefing", `drop --dispatch-id or pass the briefing of ${options.dispatchId}`));
    }
  } else if (options.briefing || options.handback) {
    // loadRecordInputs refused; no other source may stand in for the record route the caller asked for.
  } else if (candidates.length === 1) {
    ({ dispatchId, candidateCommit } = candidates[0]);
    allowedRaw = candidates[0].allowedPaths;
    source = "pending-state";
  } else if (candidates.length > 1) {
    refusals.push(refuse("GHCR-PENDING-AMBIGUOUS", `${candidates.length} pending states match`, "pass --dispatch-id <id> to name one"));
  } else if (options.dispatchId && options.allowed.length > 0) {
    dispatchId = options.dispatchId; allowedRaw = options.allowed; source = "explicit-flags";
  } else {
    refusals.push(refuse("GHCR-NO-SOURCE", "no pending host-commit state and no explicit dispatch binding",
      "pass --dispatch-id <id> and at least one --allowed-path <briefed path> (and --path <changed path>)"));
  }
  if (dispatchId && !DISPATCH_ID.test(dispatchId)) { refusals.push(refuse("GHCR-DISPATCH-ID", "the dispatch id is not a safe token", "pass the dispatch id exactly as briefed")); dispatchId = null; }

  const allowed = [];
  for (const raw of allowedRaw ?? []) {
    const clean = normalizePath(root, raw);
    if (clean) allowed.push(clean);
  }
  const allowedSet = new Set(allowed);
  let paths = [], landed = null;
  if (source) {
    const changed = changedPaths(root);
    if (changed === null) refusals.push(refuse("GHCR-STATUS-UNREADABLE", "git status failed", "re-run in the repository root"));
    else if (options.paths.length > 0) {
      const claimed = options.paths.map((p) => normalizePath(root, p));
      const unique = [...new Set(claimed)];
      if (claimed.includes(null) || !unique.every((p) => allowedSet.has(p))) {
        refusals.push(refuse("GHCR-PATH-OUTSIDE-ALLOWED", "a claimed path is not inside the briefed allowed paths", "claim only paths from the briefed write scope"));
      } else if (!unique.every((p) => changed.has(p))) {
        // C28: the same claim repeated after the recovery landed (nothing in the tree is changed any more) is the dispatch's own commit, not a mistake.
        landed = unique.some((p) => changed.has(p)) ? null : findLandedCommit(root, dispatchId, candidateCommit ?? inputs?.block.candidateCommit ?? null);
        if (!landed) refusals.push(refuse("GHCR-PATH-UNCHANGED", "a claimed path has no change in the tree", "drop the unchanged path from --path"));
      } else paths = unique.sort();
    } else {
      paths = allowed.filter((p) => changed.has(p));
      paths = [...new Set(paths)].sort();
      // C28: nothing to commit is no refusal when the dispatch's own commit already exists; the lost steps after it are what is left to recover.
      if (paths.length === 0) {
        landed = findLandedCommit(root, dispatchId, candidateCommit ?? inputs?.block.candidateCommit ?? null);
        if (!landed) refusals.push(refuse("GHCR-NO-CHANGES", "none of the briefed allowed paths has a change in the tree and no commit of this dispatch exists in the history since its candidate", "nothing to land; check whether the result was already committed"));
      }
    }
  }
  // On Antigravity a code-writing child commits on its own branch and agy-native-integrate carries the result here. Without that take-over the
  // tree holds what the session wrote itself, and the record would attest a Goldfish that never ran (AGY greenfield 2026-11-08).
  if (inputs && inputs.block.runner === "antigravity" && paths.length > 0 && !integratedResultCovers({ root, commonDir, paths })) {
    refusals.push(refuse("GHCR-NO-NATIVE-RESULT", "these paths do not hold what a taken-over Antigravity child branch delivered, so no Goldfish result exists to land",
      "run the dispatch and take its branch over with scripts/agy-native-integrate.mjs plan|apply, leaving the result unchanged. If the host refuses the dispatch, follow references/antigravity-native-dispatch.md; the slice is not written in this session"));
  }
  // C28: HEAD that moved FORWARD from the candidate (the Elephant committed while the Goldfish ran, even inside its scope) is what the host commit refuses with
  // native-concurrent-advance-touches-scope; this command is its recovery route, so it plans on that HEAD and names the advance. HEAD anywhere else still refuses.
  let headAdvance = null;
  if (candidateCommit && candidateCommit !== headSha) {
    const descends = git(root, ["merge-base", "--is-ancestor", candidateCommit, headSha]).ok;
    if (!descends) refusals.push(refuse("GHCR-HEAD-MOVED", "HEAD differs from the pending binding's candidateCommit and does not descend from it", `restore HEAD to ${candidateCommit} or land the result by the ordinary commit route`));
    else {
      const advanced = git(root, ["diff", "--name-only", "-z", candidateCommit, headSha]);
      const scopePaths = advanced.ok ? advanced.out.split("\0").filter(Boolean).filter((file) => allowed.some((entry) => scopesTouch(entry, file))).sort() : [];
      headAdvance = { from: candidateCommit, to: headSha, touchesScope: scopePaths.length > 0, scopePaths: scopePaths.slice(0, MAX_OUTSIDE_LISTED) };
    }
  }
  const staged = git(root, ["diff", "--cached", "--name-only"]);
  if (!staged.ok || staged.out.trim() !== "") {
    const names = staged.ok ? staged.out.split("\n").map((name) => name.trim()).filter(Boolean) : [];
    refusals.push(refuse("GHCR-STAGED", "something is staged", names.length > 0
      ? `unstage it with git restore --staged -- ${names.map(shellWord).join(" ")} and plan again: ${commandLine("plan", root, options, dispatchId)}`
      : "git could not read the index; run git status, then plan again"));
  }
  // The briefed check files are part of the deliverable: a plan whose check is absent would commit work nobody can run.
  const checkFiles = [];
  if (inputs) {
    const checks = Array.isArray(inputs.block.itemDelivery?.checks) ? inputs.block.itemDelivery.checks : [];
    for (const entry of checks) {
      const clean = typeof entry?.path === "string" ? normalizePath(root, entry.path) : null;
      let exists = false;
      try { exists = clean !== null && statSync(join(root, clean)).isFile(); } catch { exists = false; }
      checkFiles.push({ path: clean ?? String(entry?.path), exists });
    }
    const missing = checkFiles.filter((entry) => !entry.exists).map((entry) => entry.path);
    if (missing.length > 0) refusals.push(refuse("GHCR-CHECK-MISSING", `the briefed check file is not in the tree: ${missing.join(", ")}`,
      `the Goldfish must deliver ${missing.join(", ")} (restore or recreate it in the tree), then plan again: ${commandLine("plan", root, options, dispatchId)}`));
  }
  // Informational only: dirt outside the allowed paths never rides along (the commit names exact paths), but it is shown.
  const outsideAllowed = source === null ? [] : [...(changedPaths(root) ?? [])].filter((path) => !allowedSet.has(path) && !path.startsWith("scratch/") && !path.startsWith("evidence/")).sort();
  const recordTarget = dispatchId ? `evidence/dispatch-record-${dispatchId}.json` : null;
  let recordPresent = false;
  if (inputs && recordTarget) {
    try { recordPresent = statSync(join(root, recordTarget)).isFile(); } catch { recordPresent = false; }
    // C28: a record that already exists beside the dispatch's own commit means the recovery was done; it is said, not refused, and nothing is rewritten.
    if (recordPresent && !landed) refusals.push(refuse("GHCR-RECORD-EXISTS", `${recordTarget} already exists and is never overwritten`, "inspect it; if it already records this delivery there is nothing to land, otherwise remove only your own failed attempt and plan again"));
  }

  const stopFailure = stop && (!dispatchId || stop.dispatchId === dispatchId) ? { file: stop.file, code: stop.code, ...stopFailureCause(stop) } : null;
  // C28: the dispatch's own commit exists. With the record route's inputs and no record yet, the only step left is the record (`record-only`); otherwise
  // everything is done and the answer is `already-recovered` (exit 0, nothing written).
  const recordOnly = refusals.length === 0 && landed !== null && inputs !== null && !recordPresent;
  const recovered = refusals.length === 0 && landed !== null && !recordOnly;
  const result = { schema: PLAN_SCHEMA, status: refusals.length > 0 ? "refused" : recovered ? "already-recovered" : "ready", code: refusals[0]?.code ?? (recovered ? "GHCR-ALREADY-RECOVERED" : "GHCR-READY"),
    dispatchId, source, candidateCommit, head: headSha, stopFailure, paths: refusals.length === 0 && !landed ? paths : [], refusals,
    ...(stopFailure ? {} : { stopFailureNote: "no stop-failure record for this dispatch; the stop left no diagnostic" }) };
  // K-33 (Glossover, 29c): a host commit refused by git's whitespace check names the files it flagged. Generated files (a framework's
  // SQL migration) are excused in the project's own .gitattributes, so the NEXT host commit of such a file passes without this route.
  if (/HOST-COMMIT-DIFF-CHECK$/u.test(stopFailure?.code ?? "")) {
    const flagged = Array.isArray(stopFailure.detail?.paths) ? stopFailure.detail.paths : [];
    result.diffCheckNote = `the host commit was refused by git diff --cached --check (whitespace)${flagged.length > 0 ? ` in ${flagged.join(", ")}` : ""}. `
      + "If these files are generated by a tool and must keep their bytes, add one line `<path pattern> -whitespace` for them to the project's .gitattributes in its own commit, so the next host commit of such a file passes; otherwise correct the whitespace before apply. This recovery commit does not run that check.";
  }
  if (headAdvance && !landed) result.headAdvance = headAdvance;
  if (landed) result.commit = landed;
  if (recordOnly) result.mode = "record-only";
  if (outsideAllowed.length > 0) result.outsideAllowed = outsideAllowed.slice(0, MAX_OUTSIDE_LISTED);
  if (inputs) {
    result.checkFiles = checkFiles;
    result.briefing = inputs.briefing.rel; result.handback = inputs.handback.rel;
    result.briefedCandidate = inputs.block.candidateCommit;
    // hostObserved is the typed statement that no host observation backs this commit; the record carries the same label.
    result.record = { kind: "orchestrator-attested", hostObserved: false, target: recordTarget };
  } else if (result.status === "ready") {
    result.recordNote = "no dispatch record is written; add --briefing <file> --handback <file> to also write the typed orchestrator-attested record (not host-observed evidence)";
  }
  if (result.status === "ready") {
    result.messagePath = `scratch/commit-msg/${dispatchId}.txt`;
    const sealed = recordOnly ? [] : paths;
    result.planSha256 = sha(JSON.stringify({ dispatchId, head: headSha, paths: sealed, stopFailure, message: buildMessage({ dispatchId, stopFailure }),
      ...(recordOnly ? { landed } : {}),
      ...(inputs ? { briefingSha256: inputs.briefing.sha256, handbackSha256: inputs.handback.sha256 } : {}) }));
    result.next = ["node", SELF, "apply", "--root", root, "--dispatch-id", dispatchId,
      ...(inputs ? ["--briefing", inputs.briefing.rel, "--handback", inputs.handback.rel] : []),
      ...sealed.flatMap((p) => ["--path", p]), ...(source === "explicit-flags" ? allowed.flatMap((p) => ["--allowed-path", p]) : []),
      "--expect-sha256", result.planSha256];
  }
  result.root = root;
  return result;
}

export function apply(options) {
  if (!options.expect || !/^[a-f0-9]{64}$/u.test(options.expect)) {
    return { schema: PLAN_SCHEMA, status: "refused", code: "GHCR-EXPECT-SHA256-REQUIRED", paths: [],
      refusals: [refuse("GHCR-EXPECT-SHA256-REQUIRED", "apply commits only what plan showed", "run plan and pass its planSha256 as --expect-sha256")] };
  }
  const planned = plan(options);
  // C28: a second run of a recovery that is done says so, changes nothing but the now-stale hint of that dispatch, and exits 0.
  if (planned.status === "already-recovered") { clearHints(planned); return planned; }
  if (planned.status !== "ready") return planned;
  if (planned.planSha256 !== options.expect) {
    return { ...planned, status: "refused", code: "GHCR-PLAN-DIGEST-MISMATCH", paths: [],
      refusals: [refuse("GHCR-PLAN-DIGEST-MISMATCH", "HEAD, the paths, the stop-failure record or a briefing/hand-back input changed since plan",
        `run plan again and use its new planSha256: ${commandLine("plan", planned.root, options, planned.dispatchId)}`)] };
  }
  // C28: the dispatch's own commit exists and only the record after it was lost: no commit is made, the record is written for exactly that commit.
  if (planned.mode === "record-only") return landRecord(planned, planned.commit, { schema: PLAN_SCHEMA, status: "recorded", code: "GHCR-RECORDED", dispatchId: planned.dispatchId, commit: planned.commit,
    paths: [], stopFailure: planned.stopFailure, messagePath: null, refusals: [] });
  const messageFile = join(planned.root, planned.messagePath);
  mkdirSync(join(planned.root, "scratch", "commit-msg"), { recursive: true });
  writeFileSync(messageFile, buildMessage({ dispatchId: planned.dispatchId, stopFailure: planned.stopFailure }), "utf8");
  // `git commit -- <path>` knows only tracked paths: new files get an intent-to-add entry by exact pathspec first (never `add -A`).
  const fresh = untrackedPaths(planned.root).filter((p) => planned.paths.includes(p));
  // K-32: every pathspec is literal, so `[...slug]` names that folder and never a sibling a glob would match.
  if (fresh.length > 0) git(planned.root, ["--literal-pathspecs", "add", "--intent-to-add", "--", ...fresh]);
  const committed = git(planned.root, ["--literal-pathspecs", "commit", "-F", planned.messagePath, "--", ...planned.paths]);
  if (!committed.ok) {
    if (fresh.length > 0) git(planned.root, ["--literal-pathspecs", "reset", "-q", "--", ...fresh]); // refused leaves no staged state behind
    return { ...planned, status: "refused", code: "GHCR-COMMIT-FAILED", refusals: [refuse("GHCR-COMMIT-FAILED", committed.err.trim().split("\n").slice(-3).join(" | "),
      "fix what the hook reported and run plan again; the message file is left in place")] };
  }
  const commit = git(planned.root, ["rev-parse", "HEAD"]).out.trim();
  return landRecord(planned, commit, { schema: PLAN_SCHEMA, status: "committed", code: "GHCR-COMMITTED", dispatchId: planned.dispatchId, commit,
    paths: planned.paths, stopFailure: planned.stopFailure, messagePath: planned.messagePath, refusals: [] });
}

/** The hint of a dispatch whose recovery is done is cleared (C28); records of other dispatches stay. */
function clearHints(planned) {
  try { clearNativeGoldfishStopFailures({ commonDir: resolveGitCommonDir(planned.root), dispatchId: planned.dispatchId }); } catch { /* a stale hint is never worth failing a recovery */ }
}

function landRecord(planned, commit, committedResult) {
  if (!planned.record) { clearHints(planned); return committedResult; }

  // Record route: the commit exists now, so the typed record is written for exactly that commit by the one writer that
  // re-opens the Git objects (trailer, single parent, files equal to the report). A fault here leaves the commit alone.
  const requestPath = `scratch/attested-${planned.dispatchId}.json`;
  try {
    writeFileSync(join(planned.root, requestPath), `${JSON.stringify({ schema: "pipeline.dispatch-attested-request.v1",
      briefingPath: planned.briefing, handbackPath: planned.handback, commits: [commit] }, null, 2)}\n`, "utf8");
    const receipt = runAttestedRequest({ repoRoot: planned.root, attestedRequestPath: requestPath });
    clearHints(planned);
    return { ...committedResult, record: { kind: "orchestrator-attested", hostObserved: false, target: receipt.target, sha256: receipt.sha256 },
      ...(receipt.criticCoverageAdvisory ? { criticCoverageAdvisory: receipt.criticCoverageAdvisory } : {}) };
  } catch (error) {
    return { ...committedResult, status: "committed-record-failed", code: "GHCR-RECORD-FAILED", record: { kind: "orchestrator-attested", hostObserved: false, target: planned.record.target },
      refusals: [refuse("GHCR-RECORD-FAILED", `${error?.code ?? "error"}: ${String(error?.message ?? error).split("\n")[0].slice(0, 300)}`,
        `commit ${commit} is already made; do not commit again. After repairing the cause named here, write the record: node ${WRITER} --repo-root ${planned.root} --attested-request ${requestPath}`)] };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.error
    ? { schema: PLAN_SCHEMA, status: "refused", code: "GHCR-ARGUMENTS", paths: [], refusals: [refuse("GHCR-ARGUMENTS", parsed.error, SYNTAX)] }
    : parsed.verb === "plan" ? plan(parsed) : apply(parsed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "refused" || result.status === "committed-record-failed" ? 2 : 0;
}
