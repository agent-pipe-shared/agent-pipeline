#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { prepareAntigravityNativeDispatch } from "../lib/antigravity-native-dispatch-coordinator.mjs";

const UNTRACKED_LISTED = 5;

/**
 * LOOP-A4. `Workspace: "branch"` cuts the child's worktree from the committed HEAD, so the parent's untracked files are not in it, and a
 * greenfield run lost a PO turn to them. Untracked and not ignored files, named before `prepared` with the step that resolves it. Information
 * only: the guard's own check ignores untracked files on purpose, so this never refuses. [] when git cannot say. `-z` keeps a path with a space,
 * a newline or a non-ASCII byte whole on every platform.
 */
function untrackedBeforeBranch(root, nativeSubagents, exceptRelativePath) {
  if (!nativeSubagents.some((entry) => entry?.Workspace === "branch")) return null;
  const listed = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", shell: false, timeout: 4_000, maxBuffer: 1024 * 1024 });
  if (listed.error || listed.status !== 0) return null;
  const files = String(listed.stdout).split("\0").filter((file) => file !== "" && file !== exceptRelativePath).sort();
  if (files.length === 0) return null;
  return {
    count: files.length,
    files: files.slice(0, UNTRACKED_LISTED),
    step: `the branch worktree is cut from the committed HEAD and will not contain these ${files.length} untracked file(s)${files.length > UNTRACKED_LISTED ? ` (${UNTRACKED_LISTED} named)` : ""}. If the host refuses Workspace: "branch" or the child needs one of them: commit them (the ordinary commit route), add scratch-only paths to .gitignore, or move them out of the repository, then prepare again. Nothing was refused here.`,
  };
}

export function prepareFromRequest(value, root = value?.root, { requestPath = null } = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { status: "rejected", code: "AGY-NATIVE-REQUEST-SHAPE", modelCalls: 0, launcherCalls: 0 };
  }
  const flatFields = ["TypeName", "Role", "Prompt", "Model", "Workspace"];
  const hasBatch = Object.hasOwn(value, "Subagents");
  const hasFlat = flatFields.some((field) => Object.hasOwn(value, field));
  const shapeKeys = Object.keys(value).sort();
  const baseKeys = ["packets", ...(Object.hasOwn(value, "root") ? ["root"] : [])].sort();
  let nativeSubagents;
  let callShape;
  if (hasBatch && !hasFlat
    && [JSON.stringify([...baseKeys, "Subagents"].sort())].includes(JSON.stringify(shapeKeys))) {
    nativeSubagents = value.Subagents;
    callShape = "batch";
  } else if (!hasBatch && ["TypeName", "Role", "Prompt"].every((field) => Object.hasOwn(value, field))
    && shapeKeys.length === baseKeys.length + flatFields.filter((field) => Object.hasOwn(value, field)).length
    && baseKeys.every((key) => shapeKeys.includes(key))
    && flatFields.every((field) => !Object.hasOwn(value, field) || shapeKeys.includes(field))) {
    nativeSubagents = [Object.fromEntries(flatFields.filter((field) => Object.hasOwn(value, field)).map((field) => [field, value[field]]))];
    callShape = "flat";
  } else {
    return { status: "rejected", code: hasBatch && hasFlat ? "AGY-NATIVE-SHAPE-MIXED" : "AGY-NATIVE-REQUEST-SHAPE", modelCalls: 0, launcherCalls: 0 };
  }
  const prepared = prepareAntigravityNativeDispatch({ root, packets: value.packets, nativeSubagents, callShape });
  if (prepared.status !== "prepared" || !Array.isArray(nativeSubagents)) return prepared;
  const exceptRelativePath = requestPath === null ? null : relative(root, requestPath).split(sep).join("/");
  const untracked = untrackedBeforeBranch(root, nativeSubagents, exceptRelativePath);
  return untracked === null ? prepared : { ...prepared, untrackedBeforeBranch: untracked };
}

function requestFromArgv(argv) {
  if (argv.length !== 5 || argv[0] !== "prepare" || argv[1] !== "--root" || argv[3] !== "--request") return null;
  let root;
  let path;
  try {
    root = realpathSync(resolve(argv[2]));
    const lexical = resolve(root, argv[4]);
    const rel = relative(root, lexical);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    const stat = lstatSync(lexical);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 1024 * 1024 || realpathSync(lexical) !== lexical) return null;
    path = lexical;
  } catch { return null; }
  try { return { root, requestPath: path, value: JSON.parse(readFileSync(path, "utf8")) }; }
  catch { return null; }
}

const USAGE = `Usage: antigravity-native-dispatch-prepare.mjs prepare --root <repository root> --request <scratch/ or evidence/ relative .json file>

Checks one native Antigravity dispatch and records its single-use preparation before invoke_subagent is called. Starts no child.

The request file holds one JSON object: "packets" (one per child), optional "root", and either "Subagents" (a batch of children)
or the flat fields "TypeName", "Role", "Prompt" and optional "Model" and "Workspace". The two shapes cannot be mixed.
Each packet: "schema" (pipeline.role-dispatch-request.v1), "dispatchId", "transport" ("antigravity"), "role", "prompt",
"candidate" {"commit","tree"}, "requiredPaths", "requiredPathSha256", "resultDestination" ({"kind":"return"}).

The whole route, with an example packet: skills/pipeline-start/references/antigravity-native-dispatch.md
`;

if (isDirectInvocation(import.meta.url)) {
  if (process.argv.length === 3 && ["--help", "-h"].includes(process.argv[2])) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const selected = requestFromArgv(process.argv.slice(2));
  if (selected === null) {
    process.stdout.write(`${JSON.stringify({ status: "rejected", code: "AGY-NATIVE-REQUEST-JSON", modelCalls: 0, launcherCalls: 0 })}\n`);
    process.exit(2);
  }
  const result = prepareFromRequest(selected.value, selected.root, { requestPath: selected.requestPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.status === "prepared" ? 0 : 2);
}
