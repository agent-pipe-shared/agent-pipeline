#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { checkSecurityCompleteness } from "../../plugins/pipeline-core/lib/security-completeness-gate.mjs";
import { loadManifest, gateConfig } from "../../plugins/pipeline-core/lib/manifest.mjs";

export const RECEIPT_SCHEMA = "agent-pipeline.pr-contributor-gate.v2";
export const CLA_PATH = "CONTRIBUTOR_LICENSE_AGREEMENT.md";
export const ALLOWED_ACTIONS = new Set(["opened", "reopened", "synchronize", "edited"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const error = (code, detail = undefined) => detail === undefined ? { code } : { code, detail };

export function readClaContract(root) {
  const path = join(root, CLA_PATH);
  if (!existsSync(path)) return { error: error("CLA_FILE_MISSING") };
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const versions = [...text.matchAll(/^<!-- CLA-Version: ([0-9]+\.[0-9]+) -->$/gmu)];
  if (versions.length !== 1) return { error: error("CLA_VERSION_INVALID") };
  return { path: CLA_PATH, version: versions[0][1], sha256: sha256(bytes) };
}

export function expectedAcceptanceLine({ version, sha256: digest }, login, checked = true) {
  const mark = checked ? "x" : " ";
  return `- [${mark}] **CLA acceptance — Agent-Pipeline CLA v${version} (SHA-256: \`${digest}\`) — I, @${login}, have read and expressly accept this CLA for every contribution in this pull request and confirm that I have the rights needed to make its grants.**`;
}

function inspectAcceptance(event, cla, login, senderLogin) {
  const body = event?.pull_request?.body;
  const expected = expectedAcceptanceLine(cla, login, true);
  const lines = typeof body === "string" ? body.split(/\r?\n/u) : [];
  if (lines.filter((line) => line === expected).length === 1) {
    if (senderLogin !== login) return { accepted: false, error: error("CLA_ACCEPTANCE_PROXY_ACTOR") };
    if (event?.action === "opened") return { accepted: true, bodyTransition: "opened-by-author" };
    if (event?.action === "edited") {
      const previousBody = event?.changes?.body?.from;
      if (typeof previousBody !== "string") return { accepted: false, error: error("CLA_ACCEPTANCE_BODY_CHANGE_REQUIRED") };
      const previousLines = previousBody.split(/\r?\n/u);
      if (previousLines.includes(expected)) return { accepted: false, error: error("CLA_ACCEPTANCE_CHECK_TRANSITION_REQUIRED") };
      return { accepted: true, bodyTransition: "checked-by-author" };
    }
    return { accepted: false, error: error("CLA_ACCEPTANCE_REFRESH_REQUIRED") };
  }

  const candidates = lines.filter((line) => line.includes("CLA acceptance — Agent-Pipeline CLA"));
  if (candidates.length === 0) return { accepted: false, error: error("CLA_ACCEPTANCE_MISSING") };
  if (candidates.length !== 1) return { accepted: false, error: error("CLA_ACCEPTANCE_AMBIGUOUS") };
  if (candidates[0] === expectedAcceptanceLine(cla, login, false)) return { accepted: false, error: error("CLA_ACCEPTANCE_UNCHECKED") };

  const parsed = candidates[0].match(/^- \[([ x])\] \*\*CLA acceptance — Agent-Pipeline CLA v([0-9]+\.[0-9]+) \(SHA-256: `([a-f0-9]{64})`\) — I, @([A-Za-z0-9-]+), /u);
  if (!parsed) return { accepted: false, error: error("CLA_ACCEPTANCE_FORMAT_INVALID") };
  if (parsed[2] !== cla.version || parsed[3] !== cla.sha256) return { accepted: false, error: error("CLA_ACCEPTANCE_STALE") };
  if (parsed[4] !== login) return { accepted: false, error: error("CLA_ACCEPTANCE_LOGIN_MISMATCH") };
  return { accepted: false, error: error("CLA_ACCEPTANCE_STATEMENT_MISMATCH") };
}

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
}

export function checkDcoRange(root, baseSha, headSha) {
  const result = { status: "failed", checkedCommits: 0, failures: [] };
  const shallow = git(root, ["rev-parse", "--is-shallow-repository"]);
  if (shallow.status !== 0 || shallow.stdout.trim() !== "false") {
    result.failures.push(error("DCO_HISTORY_INCOMPLETE"));
    return result;
  }
  for (const sha of [baseSha, headSha]) {
    const probe = git(root, ["cat-file", "-e", `${sha}^{commit}`]);
    if (probe.status !== 0) {
      result.failures.push(error("DCO_COMMIT_UNAVAILABLE", sha));
      return result;
    }
  }
  const range = git(root, ["rev-list", "--reverse", `${baseSha}..${headSha}`]);
  if (range.status !== 0) {
    result.failures.push(error("DCO_RANGE_UNAVAILABLE"));
    return result;
  }
  const commits = range.stdout.trim() ? range.stdout.trim().split(/\r?\n/u) : [];
  if (commits.length === 0) {
    result.failures.push(error("DCO_RANGE_EMPTY"));
    return result;
  }
  result.checkedCommits = commits.length;
  for (const sha of commits) {
    const shown = git(root, ["show", "-s", "--format=%an%x00%ae%x00%B", sha]);
    if (shown.status !== 0) {
      result.failures.push(error("DCO_COMMIT_UNREADABLE", sha));
      continue;
    }
    const first = shown.stdout.indexOf("\0");
    const second = shown.stdout.indexOf("\0", first + 1);
    if (first < 0 || second < 0) {
      result.failures.push(error("DCO_COMMIT_FORMAT_INVALID", sha));
      continue;
    }
    const authorName = shown.stdout.slice(0, first).trim();
    const authorEmail = shown.stdout.slice(first + 1, second).trim();
    const message = shown.stdout.slice(second + 1);
    const signoffs = message.split(/\r?\n/u).map((line) => line.match(/^Signed-off-by:\s*(.+?)\s*<([^<>]+)>\s*$/iu)).filter(Boolean);
    if (!signoffs.some((match) => match[1].trim() === authorName && match[2].trim().toLowerCase() === authorEmail.toLowerCase())) {
      result.failures.push(error("DCO_SIGNOFF_MISSING_OR_MISMATCHED", sha));
    }
  }
  result.status = result.failures.length === 0 ? "passed" : "failed";
  return result;
}

export function validatePrContributorGates({ root, claRoot, event }) {
  const errors = [];
  const pr = event?.pull_request;
  const number = Number.isInteger(event?.number) && event.number > 0 ? event.number : null;
  const login = typeof pr?.user?.login === "string" && /^[A-Za-z0-9-]{1,39}$/u.test(pr.user.login) ? pr.user.login : null;
  const senderLogin = typeof event?.sender?.login === "string" && /^[A-Za-z0-9-]{1,39}$/u.test(event.sender.login) ? event.sender.login : null;
  const headSha = typeof pr?.head?.sha === "string" && /^[a-f0-9]{40}$/u.test(pr.head.sha) ? pr.head.sha : null;
  const baseSha = typeof pr?.base?.sha === "string" && /^[a-f0-9]{40}$/u.test(pr.base.sha) ? pr.base.sha : null;
  const baseRef = typeof pr?.base?.ref === "string" ? pr.base.ref : null;

  if (!ALLOWED_ACTIONS.has(event?.action)) errors.push(error("EVENT_ACTION_INVALID"));
  if (number === null) errors.push(error("PR_NUMBER_INVALID"));
  if (login === null) errors.push(error("PR_AUTHOR_LOGIN_INVALID"));
  if (senderLogin === null) errors.push(error("EVENT_SENDER_LOGIN_INVALID"));
  if (headSha === null) errors.push(error("PR_HEAD_SHA_INVALID"));
  if (baseSha === null) errors.push(error("PR_BASE_SHA_INVALID"));
  if (baseRef !== "main") errors.push(error("PR_BASE_REF_INVALID"));

  const claRootValid = typeof claRoot === "string" && claRoot.length > 0;
  const cla = claRootValid ? readClaContract(claRoot) : { error: error("CLA_ROOT_INVALID") };
  if (cla.error) errors.push(cla.error);
  const acceptance = !cla.error && login !== null && senderLogin !== null ? inspectAcceptance(event, cla, login, senderLogin) : { accepted: false };
  if (acceptance.error) errors.push(acceptance.error);
  const dco = baseSha && headSha ? checkDcoRange(root, baseSha, headSha) : { status: "failed", checkedCommits: 0, failures: [error("DCO_RANGE_IDENTIFIERS_INVALID")] };
  errors.push(...dco.failures);

  // Gate-activation guard (F2, CYB-2I-1R; re-rooted to `claRoot` per Critic finding N1,
  // CYB-2I-1R2): mirrors guard-push.mjs's/check-close-security-completeness.mjs's own "opt-in,
  // nothing configured -> skip" pattern, but the activation *decision* (whether the `security`
  // gate is on/off) is read from `claRoot` -- the trusted base checkout the PR author cannot
  // write to -- NOT from `root` (the untrusted PR candidate). Reading `root` here let a PR
  // author flip `gates.security.mode: off` (or delete `.claude/pipeline.yaml` entirely) in their
  // OWN branch to silently disable the very check meant to constrain them: every other AC8 call
  // site (Push/Close/Release) already reads a manifest the actor being gated does not control,
  // this call site now does too. The evidence being *evaluated* is UNCHANGED and correctly stays
  // bound to `root`/`headSha` (the candidate's own commit/tree) -- only the root supplying
  // `loadManifest`/`gateConfig` moves.
  //
  // Design decision (N1 follow-up, CYB-2I-1R2): a missing/invalid `claRoot` (the same
  // typeof/length check the CLA_ROOT_INVALID path above already applies) is NEVER treated as
  // "gate absent, skip" -- that would let an unreadable trusted root silently disable the gate
  // too, defeating the whole point of this fix. Instead it fails closed: `securityGateActive`
  // is forced `true`, so the completeness check below still runs against `root`/`headSha`'s own
  // evidence (and, absent a valid trusted root to prove otherwise, will in practice fail closed
  // on missing/unbound evidence) -- the same "unknown state -> treat as blocking" posture
  // `CLA_ROOT_INVALID` and `DCO_RANGE_IDENTIFIERS_INVALID` already take elsewhere in this file.
  const manifestResult = headSha && claRootValid ? loadManifest(claRoot) : null;
  const securityGate = manifestResult ? gateConfig(manifestResult.manifest, "security") : null;
  const securityGateActive = !claRootValid
    || (manifestResult
      && manifestResult.status !== "absent"
      && securityGate
      && securityGate.mode !== "off");
  if (headSha && securityGateActive) {
    const treeResult = git(root, ["rev-parse", `${headSha}^{tree}`]);
    const headTree = treeResult.status === 0 ? treeResult.stdout.trim() : null;
    const completenessFailures = checkSecurityCompleteness({ projectDir: root, commit: headSha, tree: headTree, subjectLabel: "the reviewed PR head" });
    errors.push(...completenessFailures.map((detail) => error("SECURITY_COMPLETENESS_BLOCKING", detail)));
  }

  return {
    schema: RECEIPT_SCHEMA,
    ok: errors.length === 0,
    event: { action: event?.action ?? null, senderLogin, bodyTransition: acceptance.bodyTransition ?? null },
    pullRequest: { number, authorLogin: login, headSha, baseRef, baseSha },
    cla: cla.error ? { path: CLA_PATH, version: null, sha256: null, accepted: false } : { ...cla, accepted: acceptance.accepted },
    dco: { status: dco.status, checkedCommits: dco.checkedCommits },
    errors,
  };
}

function parseArgs(argv) {
  const allowed = new Set(["root", "cla-root", "event", "receipt"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    const name = key?.startsWith("--") ? key.slice(2) : null;
    if (!name || !allowed.has(name) || value === undefined || Object.hasOwn(values, name)) return null;
    values[name] = value;
  }
  return values;
}

export function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const args = parseArgs(argv);
  if (!args?.root || !args?.["cla-root"] || !args?.event) {
    stderr.write("Usage: check-pr-contributor-gates.mjs --root <candidate> --cla-root <trusted-base> --event <event.json> [--receipt <path>]\n");
    return 2;
  }
  let event;
  try { event = JSON.parse(readFileSync(resolve(args.event), "utf8")); }
  catch { stderr.write("PR event is missing or invalid JSON.\n"); return 2; }
  const receipt = validatePrContributorGates({ root: resolve(args.root), claRoot: resolve(args["cla-root"]), event });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  stdout.write(serialized);
  if (args.receipt) {
    const path = resolve(args.receipt);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialized, { encoding: "utf8", mode: 0o600 });
  }
  return receipt.ok ? 0 : 1;
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) process.exitCode = runCli(process.argv.slice(2));
