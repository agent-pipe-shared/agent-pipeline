// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { realpathSync, lstatSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const SCHEMA = "pipeline.bound-design-line-endings-plan.v1";

function cleanGitEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    env: cleanGitEnv(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) return { ok: false, code: "LINE-ENDINGS-GIT-UNAVAILABLE", detail: result.error.code ?? result.error.message };
  if (result.status !== 0) return { ok: false, code: "LINE-ENDINGS-GIT-FAILED", detail: (result.stderr || "").trim(), exitCode: result.status };
  return { ok: true, stdout: result.stdout };
}

function validatePaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 64) return { ok: false, code: "LINE-ENDINGS-PATHS-INVALID" };
  const normalized = [];
  for (const value of paths) {
    if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.includes("\\") || value.includes(":") || value.startsWith("/") || value.split("/").some(part => part === "" || part === "." || part === "..")) {
      return { ok: false, code: "LINE-ENDINGS-PATH-INVALID" };
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(value)) return { ok: false, code: "LINE-ENDINGS-PATH-INVALID" };
    normalized.push(value);
  }
  if (new Set(normalized).size !== normalized.length) return { ok: false, code: "LINE-ENDINGS-PATHS-DUPLICATE" };
  return { ok: true, paths: normalized };
}

function verifyPhysicalPath(root, path) {
  const candidate = resolve(root, ...path.split("/"));
  const rel = relative(root, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { ok: false, code: "LINE-ENDINGS-PATH-ESCAPES-ROOT" };
  const segments = rel.split(sep);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (error.code === "ENOENT") break;
      return { ok: false, code: "LINE-ENDINGS-PATH-UNAVAILABLE", detail: error.code ?? error.message };
    }
    if (stat.isSymbolicLink()) return { ok: false, code: "LINE-ENDINGS-PATH-SYMLINK" };
    if (index < segments.length - 1 && !stat.isDirectory()) return { ok: false, code: "LINE-ENDINGS-PARENT-NOT-DIRECTORY" };
    if (index === segments.length - 1 && (!stat.isFile() || stat.nlink !== 1)) return { ok: false, code: stat.isFile() ? "LINE-ENDINGS-PATH-HARDLINKED" : "LINE-ENDINGS-PATH-NOT-REGULAR" };
    let physical;
    try { physical = realpathSync(current); } catch (error) { return { ok: false, code: "LINE-ENDINGS-PATH-UNAVAILABLE", detail: error.code ?? error.message }; }
    const physicalRel = relative(root, physical);
    if (physicalRel === ".." || physicalRel.startsWith(`..${sep}`) || isAbsolute(physicalRel)) return { ok: false, code: "LINE-ENDINGS-PATH-ESCAPES-ROOT" };
  }
  return { ok: true };
}

function readLocalAutocrlf(root) {
  const result = spawnSync("git", ["config", "--local", "--get-all", "core.autocrlf"], {
    cwd: root, env: cleanGitEnv(), encoding: "utf8", windowsHide: true, maxBuffer: 65536,
  });
  if (result.error) return { ok: false, code: "LINE-ENDINGS-GIT-UNAVAILABLE", detail: result.error.code ?? result.error.message };
  if (result.status === 1 && result.stdout === "") return { ok: true, present: false, value: null };
  if (result.status !== 0) return { ok: false, code: "LINE-ENDINGS-CONFIG-READ-FAILED", detail: (result.stderr || "").trim(), exitCode: result.status };
  const values = result.stdout.split(/\r?\n/).filter(Boolean);
  if (values.length !== 1) return { ok: false, code: "LINE-ENDINGS-CONFIG-MULTIPLE-VALUES" };
  return { ok: true, present: true, value: values[0] };
}

function inspectAttributes(root, paths) {
  const result = git(root, ["check-attr", "--all", "--", ...paths]);
  if (!result.ok) return result;
  const attributes = Object.fromEntries(paths.map(path => [path, {}]));
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const match = /^([^:]+): ([^:]+): (.*)$/.exec(line);
    if (!match || !Object.hasOwn(attributes, match[1])) return { ok: false, code: "LINE-ENDINGS-ATTRIBUTES-UNPARSEABLE" };
    attributes[match[1]][match[2]] = match[3];
  }
  for (const path of paths) {
    const attrs = attributes[path];
    for (const name of ["filter", "working-tree-encoding", "ident", "crlf"]) {
      if (attrs[name] && attrs[name] !== "unspecified" && attrs[name] !== "unset") return { ok: false, code: "LINE-ENDINGS-TRANSFORM-UNSUPPORTED", path, attribute: name, value: attrs[name] };
    }
    if (attrs.eol && !["unspecified", "lf"].includes(attrs.eol)) return { ok: false, code: "LINE-ENDINGS-EOL-UNSUPPORTED", path, value: attrs.eol };
    if (attrs.text && !["unspecified", "set", "unset", "auto"].includes(attrs.text)) return { ok: false, code: "LINE-ENDINGS-TEXT-UNSUPPORTED", path, value: attrs.text };
  }
  return { ok: true, attributes };
}

function planFingerprint(plan) {
  const body = {
    schema: plan.schema,
    root: plan.root,
    paths: plan.paths,
    attributes: plan.attributes,
    configBefore: plan.configBefore,
    configAfter: plan.configAfter,
    strippedGitEnvironment: plan.strippedGitEnvironment,
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export function planBoundDesignLineEndings({ projectDir, filePaths } = {}) {
  if (typeof projectDir !== "string" || projectDir.length === 0) return { ok: false, code: "LINE-ENDINGS-PROJECT-INVALID" };
  let requestedRoot;
  try { requestedRoot = realpathSync(projectDir); } catch (error) { return { ok: false, code: "LINE-ENDINGS-PROJECT-UNAVAILABLE", detail: error.code ?? error.message }; }
  const parsedPaths = validatePaths(filePaths);
  if (!parsedPaths.ok) return parsedPaths;
  const top = git(requestedRoot, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return top;
  let physicalTop;
  try { physicalTop = realpathSync(top.stdout.trim()); } catch (error) { return { ok: false, code: "LINE-ENDINGS-GIT-ROOT-UNAVAILABLE", detail: error.code ?? error.message }; }
  if (requestedRoot !== physicalTop) return { ok: false, code: "LINE-ENDINGS-ROOT-MISMATCH", requestedRoot, gitRoot: physicalTop };
  const inside = git(requestedRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") return { ok: false, code: "LINE-ENDINGS-NOT-WORKTREE" };
  for (const path of parsedPaths.paths) {
    const physical = verifyPhysicalPath(requestedRoot, path);
    if (!physical.ok) return { ...physical, path };
  }
  const attrs = inspectAttributes(requestedRoot, parsedPaths.paths);
  if (!attrs.ok) return attrs;
  const configBefore = readLocalAutocrlf(requestedRoot);
  if (!configBefore.ok) return configBefore;
  const plan = {
    schema: SCHEMA,
    ok: true,
    code: "LINE-ENDINGS-PLAN-READY",
    root: requestedRoot,
    paths: parsedPaths.paths,
    attributes: attrs.attributes,
    configBefore: { present: configBefore.present, value: configBefore.value },
    configAfter: "false",
    strippedGitEnvironment: true,
  };
  plan.planSha256 = planFingerprint(plan);
  return plan;
}

function restoreConfig(root, before) {
  const unset = spawnSync("git", ["config", "--local", "--unset-all", "core.autocrlf"], {
    cwd: root, env: cleanGitEnv(), encoding: "utf8", windowsHide: true, maxBuffer: 65536,
  });
  if (unset.error || ![0, 5].includes(unset.status)) return { ok: false, detail: unset.error?.message ?? (unset.stderr || "").trim() };
  if (before.present) {
    const set = spawnSync("git", ["config", "--local", "--add", "core.autocrlf", before.value], {
      cwd: root, env: cleanGitEnv(), encoding: "utf8", windowsHide: true, maxBuffer: 65536,
    });
    if (set.error || set.status !== 0) return { ok: false, detail: set.error?.message ?? (set.stderr || "").trim() };
  }
  const after = readLocalAutocrlf(root);
  if (!after.ok || after.present !== before.present || after.value !== before.value) return { ok: false, detail: "rollback readback mismatch" };
  return { ok: true };
}

export function applyBoundDesignLineEndings(plan) {
  const keys = ["schema", "ok", "code", "root", "paths", "attributes", "configBefore", "configAfter", "strippedGitEnvironment", "planSha256"];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)
    || Object.keys(plan).sort().join("\0") !== keys.sort().join("\0")
    || plan.schema !== SCHEMA || plan.ok !== true || plan.code !== "LINE-ENDINGS-PLAN-READY"
    || plan.configAfter !== "false" || plan.strippedGitEnvironment !== true
    || !plan.configBefore || typeof plan.configBefore !== "object" || Array.isArray(plan.configBefore)
    || Object.keys(plan.configBefore).sort().join("\0") !== ["present", "value"].sort().join("\0")
    || typeof plan.planSha256 !== "string" || planFingerprint(plan) !== plan.planSha256) return { ok: false, code: "LINE-ENDINGS-PLAN-INVALID" };
  const current = planBoundDesignLineEndings({ projectDir: plan.root, filePaths: plan.paths });
  if (!current.ok) return { ok: false, code: "LINE-ENDINGS-PLAN-STALE", cause: current.code };
  if (current.planSha256 !== plan.planSha256) return { ok: false, code: "LINE-ENDINGS-PLAN-STALE" };
  const set = spawnSync("git", ["config", "--local", "--replace-all", "core.autocrlf", "false"], {
    cwd: plan.root, env: cleanGitEnv(), encoding: "utf8", windowsHide: true, maxBuffer: 65536,
  });
  const after = readLocalAutocrlf(plan.root);
  if (!set.error && set.status === 0 && after.ok && after.present && after.value === "false") {
    return { ok: true, code: "LINE-ENDINGS-APPLIED", root: plan.root, paths: plan.paths, configBefore: plan.configBefore, configAfter: "false", rollbackPreimage: plan.configBefore };
  }
  const rollback = restoreConfig(plan.root, plan.configBefore);
  return {
    ok: false,
    code: rollback.ok ? "LINE-ENDINGS-APPLY-FAILED-ROLLED-BACK" : "LINE-ENDINGS-APPLY-FAILED-ROLLBACK-FAILED",
    detail: set.error?.message ?? ((set.stderr || "").trim() || after.code || "config readback mismatch"),
    rollbackPreimage: plan.configBefore,
    rollback,
  };
}
