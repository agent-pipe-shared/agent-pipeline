#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// commit-pipeline-owned.mjs --root <root> (--agent | --human) [--dry-run]
//
// PF-31, PF-36, PF-40 (D56 (2)): commits exactly the Pipeline's own dirty state files (the governed slice
// queue, and a tree guard-override audit log an older build left) so the clean-tree checks of push-prepare, push-init and the PO
// approval pass again. It refuses when another tracked file is modified, staged or deleted, naming those paths; an
// untracked foreign file is listed in `untouched` and left alone. It never commits, stashes or discards a file the
// Pipeline does not own. Runs from the agent's shell and from the PO's terminal.
// The caller states who runs it, and exactly one of the two flags is required: `--agent` adds the GIT-03
// provenance pair (`AI-Assisted: true`, `Dispatch: stage-0 (elephant)`) for an agent session; `--human`
// commits without provenance trailers, as a PO's own terminal commit does. A call naming neither is refused,
// so an agent that drops the flag gets a refusal, not an unmarked commit. Nothing is defaulted from a guess.
//
// Prints one JSON result. Exit 0: committed | nothing-to-commit | dry-run. Exit 2: refused.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { classifyDirtyTree, porcelainPaths } from "../lib/pipeline-owned-files.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import { ACKNOWLEDGE_TRAILER, runningGoldfishCommitNotice } from "../lib/running-goldfish-scope.mjs";

const SCHEMA = "pipeline.commit-pipeline-owned.v1";
const BODY = "chore(pipeline): commit the Pipeline's own state files\n\n"
  + "Committed by commit-pipeline-owned.mjs (PF-31/PF-36/PF-40): the governed slice queue,\n"
  + "and a tree guard-override audit log an older build left, are written by the Pipeline\n"
  + "itself and would otherwise keep the tree a push needs clean dirty.\n";
const AGENT_TRAILERS = "\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n";

const CARRIED_NOTE = "\nThe feature manifest in this commit lists candidate evidence that was not committed yet;\n"
  + "those files, with exactly the listed bytes, are committed with it.\n";

export function commitPipelineOwnedMessage({ agent, carried = false, acknowledged = [] }) {
  const body = carried ? BODY + CARRIED_NOTE : BODY;
  const trailers = acknowledged.map((id) => `${ACKNOWLEDGE_TRAILER}: ${id}\n`).join("");
  return (agent ? body + AGENT_TRAILERS : body) + (agent ? "" : trailers ? "\n" : "") + trailers;
}

function parse(argv) {
  const usage = "usage: commit-pipeline-owned.mjs --root <root> (--agent | --human) [--dry-run] [--acknowledge-goldfish <dispatch id>]...";
  const flags = { dryRun: false, agent: undefined, acknowledge: [] };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run" && !flags.dryRun) { flags.dryRun = true; continue; }
    // C28 RGC: the acknowledgement of a running Goldfish whose write scope this commit touches (the same step the commit guard takes as a message trailer).
    if (argv[index] === "--acknowledge-goldfish" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(argv[index + 1] ?? "") && !flags.acknowledge.includes(argv[index + 1])) { flags.acknowledge.push(argv[index + 1]); index += 1; continue; }
    if ((argv[index] === "--agent" || argv[index] === "--human") && flags.agent === undefined) { flags.agent = argv[index] === "--agent"; continue; }
    if (argv[index] === "--root" && flags.root === undefined && typeof argv[index + 1] === "string" && !argv[index + 1].startsWith("--")) { flags.root = argv[index + 1]; index += 1; continue; }
    return { error: usage };
  }
  if (flags.root === undefined) return { error: "--root <root> is required" };
  return flags.agent === undefined ? { error: `state who runs it: --agent (an agent session) or --human (a PO terminal commit); ${usage}` } : flags;
}

const FOREIGN_BASE = "other files are uncommitted; this command commits only the Pipeline's own state files";
const PUSH_APPROVAL_RECORD = "project/pipeline-state.json";

/** The refusal text: it names the working form for the one dirty file agents most often meet here. */
export function foreignChangesReason(others) {
  if (!Array.isArray(others) || !others.includes(PUSH_APPROVAL_RECORD)) return FOREIGN_BASE;
  return `${FOREIGN_BASE}. ${PUSH_APPROVAL_RECORD} is the push-approval record: the next push-prepare run folds it into a commit by itself, so do not commit it by hand and do not add it to a commit of other work. `
    + "To commit other work in the meantime, leave that file out of the pathspec and use the Elephant trailer form `Dispatch: stage-0 (elephant)` with `AI-Assisted: true`; "
    + "`Dispatch: administrative (elephant)` is refused without independently inspected evidence.";
}

export function commitPipelineOwned(argv,{ spawn = spawnSync } = {}) {
  const parsed = parse(argv);
  if (parsed.error) return { status: "refused", code: "CPO-ARGS", reason: parsed.error };
  let root;
  try { root = realpathSync(resolve(parsed.root)); if (!statSync(root).isDirectory()) throw new Error("not a directory"); }
  catch (error) { return { status: "refused", code: "CPO-ROOT", reason: `--root is not a directory: ${String(error?.message ?? error).slice(0, 200)}` }; }
  const git = (args) => spawn("git", ["-C", root, ...args], { encoding: "utf8" });
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!isSuccessfulSpawn(status) || typeof status.stdout !== "string") return { status: "refused", code: "CPO-GIT", reason: "git status failed" };
  const { owned, others } = classifyDirtyTree(status.stdout, root);
  // An untracked foreign file cannot enter the commit: `git add` and `git commit` below name only the owned paths,
  // so it is reported in `untouched`, never committed and never a reason to refuse. A modified, staged or deleted
  // tracked file still refuses, because the clean-tree checks this command serves would refuse it anyway.
  const untracked = new Set(porcelainPaths(status.stdout.split("\n").filter((line) => line.startsWith("?? ")).join("\n")));
  const blocking = others.filter((path) => !untracked.has(path));
  const untouched = others.filter((path) => untracked.has(path));
  if (blocking.length) {
    const left = untouched.length ? { untouched } : {};
    return { status: "refused", code: "CPO-FOREIGN-CHANGES", reason: foreignChangesReason(blocking), others: blocking, owned, ...left };
  }
  const evidence = manifestEvidence(root, owned, untracked, git);
  if (evidence.refusal) return { status: "refused", code: "CPO-MANIFEST-EVIDENCE", reason: evidence.refusal, owned, missing: evidence.missing };
  const carried = evidence.carried;
  const rest = untouched.filter((path) => !carried.includes(path));
  const left = { ...(rest.length ? { untouched: rest } : {}), ...(carried.length ? { carried } : {}) };
  if (!owned.length) return { status: "nothing-to-commit", owned: [], ...left };
  const paths = [...owned, ...carried];
  // C28 RGC: the same running-Goldfish check the commit guard makes; this command runs git from Node, so no Bash guard sees it as a commit.
  const running = runningGoldfishCommitNotice({ root, paths, acknowledged: parsed.acknowledge });
  if (running.block) {
    const ids = running.dispatches.filter((entry) => entry.touched.length > 0 && !parsed.acknowledge.includes(entry.dispatchId)).map((entry) => entry.dispatchId);
    return { status: "refused", code: "CPO-RUNNING-GOLDFISH", owned, reason: `${running.block} For this command the acknowledgement is: ${ids.map((id) => `--acknowledge-goldfish ${id}`).join(" ")}.` };
  }
  const warnings = running.warnings.length ? { warnings: running.warnings } : {};
  if (parsed.dryRun) return { status: "dry-run", owned, ...left, ...warnings };
  const acknowledged = running.dispatches.filter((entry) => entry.touched.length > 0 && parsed.acknowledge.includes(entry.dispatchId)).map((entry) => entry.dispatchId);
  const add = git(["add", "--", ...paths]);
  if (!isSuccessfulSpawn(add)) return { status: "refused", code: "CPO-GIT", reason: "git add failed", owned };
  const commit = git(["commit", "-m", commitPipelineOwnedMessage({ agent: parsed.agent, carried: carried.length > 0, acknowledged }), "--", ...paths]);
  if (!isSuccessfulSpawn(commit)) return { status: "refused", code: "CPO-GIT", reason: `git commit failed: ${String(commit.stderr ?? "").trim().slice(0, 300)}`, owned };
  const head = git(["rev-parse", "HEAD"]);
  return { status: "committed", owned, commit: isSuccessfulSpawn(head) ? head.stdout.trim() : null, ...left, ...warnings };
}

// Codex greenfield, candidate 27 (2026-11-10): the close route sent the agent here with a feature manifest that already
// listed `evidence/final-candidate-verify.json` while that file was still untracked. The manifest was committed alone,
// the evidence 46 s later; every later Critic course read walks each manifest revision and reads each listed evidence file
// at that revision, so the course of that feature could never resolve again (CCA-EVIDENCE-MODE / CCA-EVIDENCE-READ).
// An owned manifest therefore goes into a commit only together with every candidate-evidence file it lists: an untracked
// regular file whose bytes match the listed digest is carried into the same commit; anything else refuses, naming it.
const FEATURE_MANIFEST = /^specs\/([A-Za-z0-9][A-Za-z0-9._-]*)\/lifecycle\.json$/u;

function manifestEvidence(root, owned, untracked, git) {
  const carried = [];
  const missing = [];
  for (const manifestPath of owned) {
    const match = FEATURE_MANIFEST.exec(manifestPath);
    if (!match) continue;
    let manifest;
    try { manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8")); } catch { continue; }
    const listed = (Array.isArray(manifest?.artifacts) ? manifest.artifacts : [])
      .filter((entry) => entry?.class === "candidate-evidence" && typeof entry.path === "string");
    if (!listed.length) continue;
    const tracked = git(["ls-files", "-z", "--", `specs/${match[1]}`]);
    if (!isSuccessfulSpawn(tracked) || typeof tracked.stdout !== "string") return { refusal: "git ls-files failed", missing: [], carried: [] };
    const trackedPaths = new Set(tracked.stdout.split("\0").filter(Boolean));
    for (const entry of listed) {
      if (trackedPaths.has(entry.path) || carried.includes(entry.path)) continue;
      let ok = false;
      if (untracked.has(entry.path) && entry.path.startsWith(`specs/${match[1]}/evidence/`) && !entry.path.split("/").includes("..")) {
        try {
          const file = join(root, entry.path);
          const info = lstatSync(file);
          ok = info.isFile() && !info.isSymbolicLink()
            && createHash("sha256").update(readFileSync(file)).digest("hex") === entry.sha256;
        } catch { ok = false; }
      }
      if (ok) carried.push(entry.path); else missing.push(entry.path);
    }
  }
  if (missing.length) {
    return { carried: [], missing, refusal: `the feature manifest lists candidate evidence that is neither committed nor an untracked file with exactly the listed bytes (${missing.join(", ")}). `
      + "Committing the manifest without it would leave a manifest revision that names a file its own commit does not hold, and the Critic course of that feature could not be read again. "
      + "Restore or re-register that evidence first (register-feature-package.mjs), then rerun this command." };
  }
  return { carried, missing: [] };
}

if (isDirectInvocation(import.meta.url)) {
  const result = commitPipelineOwned(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...result })}\n`);
  process.exitCode = result.status === "refused" ? 2 : 0;
}
