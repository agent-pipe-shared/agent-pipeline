#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { prepareAntigravityNativeDispatch } from "../lib/antigravity-native-dispatch-coordinator.mjs";

export function prepareFromRequest(value, root = value?.root) {
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
  return prepareAntigravityNativeDispatch({ root, packets: value.packets, nativeSubagents, callShape });
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
  try { return { root, value: JSON.parse(readFileSync(path, "utf8")) }; }
  catch { return null; }
}

if (isDirectInvocation(import.meta.url)) {
  const selected = requestFromArgv(process.argv.slice(2));
  if (selected === null) {
    process.stdout.write(`${JSON.stringify({ status: "rejected", code: "AGY-NATIVE-REQUEST-JSON", modelCalls: 0, launcherCalls: 0 })}\n`);
    process.exit(2);
  }
  const result = prepareFromRequest(selected.value, selected.root);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.status === "prepared" ? 0 : 2);
}
