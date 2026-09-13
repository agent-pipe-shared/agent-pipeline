// SPDX-License-Identifier: SUL-1.0

/**
 * Repository-scoped PO signing-directory pointer.
 *
 * The human-terminal signer and runner-neutral onboarding must resolve this
 * single pointer identically. Keeping it here prevents one consumer from
 * silently falling back to the machine plane after `setup --directory` has
 * deliberately persisted only repository-local state.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const REPO_KEY_DIRECTORY_SCHEMA = "pipeline.po-key-directory.v1";

const hasExactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export function repoScopedKeyDirectoryPath(gitCommonDir) {
  return join(gitCommonDir, "agent-pipeline", "po-key-directory.json");
}

export function resolveGitCommonDir(repository, dependencies = {}) {
  if (typeof dependencies.gitCommonDirFn === "function") return dependencies.gitCommonDirFn(repository);
  let physical;
  try {
    physical = realpathSync(resolve(repository));
    const info = lstatSync(physical);
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
  } catch { return null; }
  let result;
  try { result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: physical, encoding: "utf8", shell: false, timeout: 5000 }); }
  catch { return null; }
  if (result?.status !== 0 || result?.error) return null;
  const raw = String(result.stdout ?? "").trim();
  if (raw === "") return null;
  try {
    const common = realpathSync(isAbsolute(raw) ? raw : resolve(physical, raw));
    const info = lstatSync(common);
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
    return common;
  } catch { return null; }
}

export function readRepoKeyDirectory(gitCommonDir, dependencies = {}) {
  const path = repoScopedKeyDirectoryPath(gitCommonDir);
  const exists = dependencies.existsSyncFn ?? existsSync;
  if (!exists(path)) return { status: "absent", directory: null };
  const read = dependencies.readFileSyncFn ?? readFileSync;
  let raw;
  try { raw = read(path, "utf8"); } catch { return { status: "invalid", directory: null, code: "RKD-UNREADABLE" }; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { status: "invalid", directory: null, code: "RKD-MALFORMED" }; }
  if (!hasExactKeys(parsed, ["schema", "poKeyDirectory", "updatedAt"]) || parsed.schema !== REPO_KEY_DIRECTORY_SCHEMA
    || typeof parsed.poKeyDirectory !== "string" || parsed.poKeyDirectory.length === 0 || !isAbsolute(parsed.poKeyDirectory)
    || typeof parsed.updatedAt !== "string" || parsed.updatedAt.length === 0) {
    return { status: "invalid", directory: null, code: "RKD-SHAPE" };
  }
  return { status: "valid", directory: parsed.poKeyDirectory };
}

export function resolveRepoScopedDirectory(repoRoot, dependencies = {}) {
  const gitCommonDir = resolveGitCommonDir(resolve(repoRoot), dependencies);
  if (gitCommonDir === null) return { status: "absent", directory: null };
  return (dependencies.readRepoKeyDirectoryFn ?? readRepoKeyDirectory)(gitCommonDir, dependencies);
}
