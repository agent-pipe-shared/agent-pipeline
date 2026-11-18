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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { courseEvidenceGapText } from "../lib/critic-course-admission.mjs";
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

// C30J-J7 (queue C30-24 item 9, AC-112): the refusal for a tracked file that is deleted or modified named no way back. The recovery is derived from the porcelain codes and only worded: nothing is committed, restored or deleted by this command.
// The push-approval record is left out (push-prepare folds it); an untracked file never refuses here.
export function foreignChangesRepair(statusOut, blocking) {
  const codes = new Map();
  for (const line of String(statusOut ?? "").split("\n")) { if (line === "" || line.startsWith("?? ")) continue; for (const path of porcelainPaths(line)) codes.set(path, line.slice(0, 2)); }
  const listed = (Array.isArray(blocking) ? blocking : []).filter((path) => path !== PUSH_APPROVAL_RECORD && codes.has(path));
  const deleted = listed.filter((path) => codes.get(path).includes("D"));
  const modified = listed.filter((path) => !codes.get(path).includes("D") && /[MT]/u.test(codes.get(path)));
  // A staged change needs the index restored as well; an unstaged one is the plain form.
  const restore = (paths) => `git restore ${paths.some((path) => codes.get(path)[0] !== " ") ? "--source=HEAD --staged --worktree " : ""}-- ${paths.join(" ")}`;
  const parts = [];
  if (deleted.length) {
    parts.push(`Deleted tracked file(s) (${bounded(deleted)}): put the ORIGINAL bytes back with ${restore(deleted)}; HEAD holds them. If HEAD no longer holds a file, git log --oneline --all -- <path> names it and git restore --source=<commit> -- <path> brings it back from that commit.`
      + (deleted.some((path) => /^specs\/[^/]+\/evidence\//u.test(path))
        ? ` A file the feature manifest lists as candidate evidence has a digest fixed at registration, so a new Verify run cannot stand in for it (FPR-VERIFY-IMMUTABLE). If the original bytes are gone for good: ${courseEvidenceGapText("CCA-EVIDENCE-READ", null)}`
        : ""));
  }
  if (modified.length) {
    const acceptance = modified.filter((path) => /^specs\/[^/]+\/acceptance\.md$/u.test(path));
    parts.push(`Modified tracked file(s) (${bounded(modified)}): if the change is not wanted, first copy the file outside the work tree (nothing is deleted), then run ${restore(modified)}.`
      + (acceptance.length ? ` ${acceptance.join(", ")} ${acceptance.length === 1 ? "is" : "are"} written by the close (the human's recorded answer): after the restore, rerun the identical close command (finish-feature.mjs --one-shot, with the arguments the stop printed), it writes the record again.` : "")
      + " If the change is wanted, it needs its own commit by the route that owns that file; this command commits only the Pipeline's own state files.");
  }
  return parts.length ? parts.join(" ") : undefined;
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
    const recovery = foreignChangesRepair(status.stdout, blocking);
    return { status: "refused", code: "CPO-FOREIGN-CHANGES", reason: `${foreignChangesReason(blocking)}${recovery === undefined ? "" : ` ${recovery}`}`, others: blocking, owned, ...(recovery === undefined ? {} : { repair: recovery }), ...left };
  }
  const evidence = manifestEvidence(root, owned, untracked, git);
  if (evidence.refusal) {
    // A refusal that is not about missing evidence (git ls-files failed) carries no groups and keeps its plain reason.
    const trackedDirty = porcelainPaths(status.stdout.split("\n").filter((line) => line !== "" && !line.startsWith("?? ")).join("\n"));
    const repair = Array.isArray(evidence.groups) && evidence.groups.length ? manifestEvidenceRepair({ root, groups: evidence.groups, trackedDirty, untracked, git }) : undefined;
    // The old closing sentence ("restore or re-register that evidence first") named no way a half-closed close could follow; it is replaced by the recovery, and kept only where no recovery could be built.
    return { status: "refused", code: "CPO-MANIFEST-EVIDENCE", reason: repair === undefined ? `${evidence.refusal} Restore or re-register that evidence first (register-feature-package.mjs), then rerun this command.` : `${evidence.refusal} ${repair}`, owned, missing: evidence.missing, ...(repair === undefined ? {} : { repair }) };
  }
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

// C30G-D2 (AC-108): the refusal below used to end in "restore or re-register that evidence", which nobody could follow when a close had stopped half way and a file was gone.
// The recovery is named from what Git shows: an UNCOMMITTED manifest is brought back to its committed revision (the close builds it and its evidence again), and when the COMMITTED
// manifest already lists the file, only the original bytes can stand in for it (a new Verify run is refused as FPR-VERIFY-IMMUTABLE), else the damaged course route of the course reader.
// Only text and the `repair` field: what is committed and when this refuses are unchanged.
const SELF = fileURLToPath(import.meta.url);
const bounded = (list) => `${list.slice(0, 8).join(", ")}${list.length > 8 ? ", ..." : ""}`;

function committedEvidencePaths(manifestPath, git) {
  const shown = git(["show", `HEAD:${manifestPath}`]);
  if (!isSuccessfulSpawn(shown) || typeof shown.stdout !== "string") return new Set();
  try { return new Set((JSON.parse(shown.stdout)?.artifacts ?? []).filter((entry) => entry?.class === "candidate-evidence" && typeof entry.path === "string").map((entry) => entry.path)); } catch { return new Set(); }
}

function manifestEvidenceRepair({ root, groups, trackedDirty, untracked, git }) {
  return groups.map(({ manifestPath, feature, missing }) => {
    const dir = `specs/${feature}/`;
    const restore = [manifestPath, `${dir}acceptance.md`].filter((path) => trackedDirty.includes(path));
    const away = [...untracked].filter((path) => path.startsWith(dir));
    const clean = `${restore.length ? `git restore -- ${restore.join(" ")}` : "leave the tracked files as they are"}${away.length ? `; move the ${away.length} untracked file(s) under ${dir} out of the work tree (${bounded(away)}), never delete them` : ""}`;
    const kept = missing.filter((path) => committedEvidencePaths(manifestPath, git).has(path));
    if (!kept.length) {
      return `The manifest ${manifestPath} is not committed (the close stopped half way) and lists evidence that is gone. Bring it back to the committed revision: ${clean}; then rerun the identical close command (finish-feature.mjs --one-shot, with the arguments the stop printed): it builds the manifest and its evidence again.`;
    }
    // Read in register-feature-package (lib/feature-package-registration.mjs addVerifyEvidence): a listed path whose bytes differ from the registered digest is FPR-VERIFY-IMMUTABLE, so a new Verify run cannot replace it.
    return `The committed manifest ${manifestPath} already lists ${bounded(kept)}, so a restore does not remove the entry. Its digest is fixed and registered evidence is never replaced (FPR-VERIFY-IMMUTABLE), so a new Verify run cannot stand in for the file. `
      + `If you still hold the original file, put it back at its path with exactly the listed bytes and run node ${SELF} --root ${root} --agent again: it commits the file together with the manifest. `
      // C30J-J7: Git may still hold the bytes in an earlier commit; the same command then carries them in.
      + `If Git held it once, git log --oneline --all -- ${kept[0]} names the commit that held them and git restore --source=<commit> -- ${kept[0]} puts them back (check the bytes against the listed digest), then run the same command again. `
      + "If the file is gone for good: " + courseEvidenceGapText("CCA-EVIDENCE-READ", null);
  }).join(" ");
}

function manifestEvidence(root, owned, untracked, git) {
  const carried = [];
  const missing = [];
  const groups = [];
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
    const group = { manifestPath, feature: match[1], missing: [] };
    groups.push(group);
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
      if (ok) carried.push(entry.path); else { missing.push(entry.path); group.missing.push(entry.path); }
    }
  }
  if (missing.length) {
    return { carried: [], missing, groups: groups.filter((group) => group.missing.length), refusal: `the feature manifest lists candidate evidence that is neither committed nor an untracked file with exactly the listed bytes (${missing.join(", ")}). `
      + "Committing the manifest without it would leave a manifest revision that names a file its own commit does not hold, and the Critic course of that feature could not be read again." };
  }
  return { carried, missing: [] };
}

if (isDirectInvocation(import.meta.url)) {
  const result = commitPipelineOwned(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...result })}\n`);
  process.exitCode = result.status === "refused" ? 2 : 0;
}
