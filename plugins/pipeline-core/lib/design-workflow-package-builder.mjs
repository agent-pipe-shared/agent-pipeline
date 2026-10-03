// SPDX-License-Identifier: SUL-1.0
/** Atomic, create-only builder for a canonically verified design-workflow v2 package. */
import { randomBytes, createHash } from "node:crypto";
import {
  closeSync, constants, fsyncSync, fstatSync, linkSync, lstatSync, openSync,
  readFileSync, realpathSync, unlinkSync, writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { SOURCE_NAMES } from "./design-advisor-course.mjs";
import { readAdvisorPhysicalBytes, observeAdvisorCandidate } from "./design-advisor-provenance.mjs";
import {
  readDesignReadinessPreparationFromRepository,
  readDesignWorkflowPackageV2FromRepository,
} from "./design-workflow-package-v2.mjs";
import { validateDesignReadinessReceipt } from "./design-workflow-package.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;
const fail = (code) => ({ ok: false, code });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (left, right) => canonicalizeJson(left) === canonicalizeJson(right);
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function sourceSet(value) {
  return exact(value, SOURCE_NAMES) && SOURCE_NAMES.every((name) => exact(value[name], ["path", "sha256"])
    && typeof value[name].path === "string" && SHA.test(value[name].sha256 ?? ""));
}

function physicalRoot(value) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error("DWP2-BUILDER-ROOT");
  const root = realpathSync.native(resolve(value));
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("DWP2-BUILDER-ROOT");
  return root;
}

function safeRepoPath(value) {
  return typeof value === "string" && value.length <= 256 && SAFE_PATH.test(value)
    && value.split("/").every((part) => part.length > 0 && !part.startsWith(".")
      && part !== "scratch" && part !== "node_modules");
}

function physicalParent(root, path) {
  if (!safeRepoPath(path)) throw new Error("DWP2-BUILDER-PATH");
  const parent = dirname(path);
  let cursor = root;
  if (parent !== ".") {
    for (const part of parent.split("/")) {
      cursor = join(cursor, part);
      const stat = lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(cursor) !== cursor) {
        throw new Error("DWP2-BUILDER-PARENT");
      }
    }
  }
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("DWP2-BUILDER-PATH");
  return { absolute, parent: resolve(root, parent), parentStat: lstatSync(resolve(root, parent === "." ? "" : parent)) };
}

function ignored(root, path) {
  const check = spawnSync("git", ["-C", root, "check-ignore", "--quiet", "--no-index", "--", path], {
    encoding: "utf8", maxBuffer: 4096, timeout: 3000, shell: false,
  });
  return !check.error && check.status === 0;
}

function syncDirectory(path) {
  let fd;
  try { fd = openSync(path, constants.O_RDONLY); fsyncSync(fd); }
  catch (error) {
    if (!new Set(["EINVAL", "EISDIR", "EPERM", "EBADF", "ENOTSUP"]).has(error?.code)) throw error;
  }
  finally { if (fd !== undefined) closeSync(fd); }
}

function writeExclusiveDurable(path, bytes) {
  let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
}

function inputFailure(error) {
  return fail(typeof error?.message === "string" && /^DWP2-[A-Z0-9-]+$/u.test(error.message)
    ? error.message : "DWP2-BUILDER-INPUT");
}

/**
 * Assemble only a v2 package from canonical preparation and readiness inputs.
 * The destination must already have a physical parent and be Git-ignored.
 * No approval request is created here; the coordinator does that after this
 * function returns a canonical package read.
 */
export function buildDesignWorkflowPackageV2({
  repoRoot,
  packagePath,
  preparationPath,
  readinessPath,
  readinessDispatchId,
  featureId,
  authoringDispatchId,
  expectedCandidate,
  expectedSources,
  trustedAdvisorExecutablePath,
  verifyReadinessExecution,
} = {}) {
  let root;
  let temporaryPath;
  let finalPath;
  let tempIdentity = null;
  try {
    root = physicalRoot(repoRoot);
    if (!safeRepoPath(packagePath) || !safeRepoPath(preparationPath) || !safeRepoPath(readinessPath)
      || !ID.test(featureId ?? "") || !ID.test(authoringDispatchId ?? "")
      || !ID.test(readinessDispatchId ?? "") || !exact(expectedCandidate, ["commit", "tree"])
      || !OID.test(expectedCandidate.commit ?? "") || !OID.test(expectedCandidate.tree ?? "")
      || !sourceSet(expectedSources)) return fail("DWP2-BUILDER-INPUT");
    if (packagePath === preparationPath || packagePath === readinessPath) return fail("DWP2-BUILDER-PATH-COLLISION");

    const prep = readDesignReadinessPreparationFromRepository({
      repoRoot: root,
      packagePath: preparationPath,
      trustedAdvisorExecutablePath,
    });
    if (!prep?.ok || prep.advisorObservation?.schema !== "pipeline.readiness-advisor-observation.v2") {
      return fail(prep?.code ?? "DWP2-BUILDER-PREPARATION");
    }
    const observation = prep.advisorObservation;
    const currentCandidate = observeAdvisorCandidate(root);
    if (!same(currentCandidate, expectedCandidate) || !same(observation.candidate, expectedCandidate)) return fail("DWP2-BUILDER-CANDIDATE");
    if (observation.featureId !== featureId || observation.authoringDispatchId !== authoringDispatchId
      || !same(observation.sources, expectedSources) || !sourceSet(observation.sources)
      || observation.initialContext?.featureId !== featureId
      || observation.initialContext?.authoringDispatchId !== authoringDispatchId) {
      return fail("DWP2-BUILDER-SOURCE-BINDING");
    }

    const readinessBytes = readAdvisorPhysicalBytes(root, readinessPath, 131072);
    const readiness = parseStrictJson(readinessBytes);
    const readinessCheck = validateDesignReadinessReceipt(readiness);
    if (!readinessCheck?.ok || readiness.outcome !== "ready-for-po-review"
      || readiness.findings?.some((finding) => finding.severity === "blocking")
      || readiness.dispatchId !== readinessDispatchId
      || [authoringDispatchId, observation.authoringDispatchId, observation.advisor?.initialContext?.authoringDispatchId].includes(readiness.dispatchId)
      || !same(readiness.candidate, expectedCandidate) || !same(readiness.sources, expectedSources)) {
      return fail(readinessCheck?.code ?? "DWP2-BUILDER-READINESS-BINDING");
    }

    const packageValue = {
      schema: "pipeline.design-workflow-package.v2",
      featureId,
      authoringDispatchId,
      candidate: observation.candidate,
      sources: observation.sources,
      advisor: observation.advisor,
      readiness: { path: readinessPath, sha256: sha(readinessBytes), dispatchId: readinessDispatchId },
      createdAt: observation.initialContext.createdAt,
    };
    const packageBytes = Buffer.from(`${canonicalizeJson(packageValue)}\n`, "utf8");
    if (packageBytes.length > 262144) return fail("DWP2-BUILDER-PACKAGE-BOUND");

    const target = physicalParent(root, packagePath);
    finalPath = target.absolute;
    if (!ignored(root, packagePath)) return fail("DWP2-BUILDER-OUTPUT-NOT-IGNORED");
    try { lstatSync(finalPath); return fail("DWP2-BUILDER-OUTPUT-EXISTS"); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }

    const tempName = `dwp2-${randomBytes(16).toString("hex")}.json`;
    const tempRelative = relative(root, join(target.parent, tempName)).split(sep).join("/");
    if (!ignored(root, tempRelative)) return fail("DWP2-BUILDER-TEMP-NOT-IGNORED");
    temporaryPath = join(target.parent, tempName);
    writeExclusiveDurable(temporaryPath, packageBytes);
    const tempStat = lstatSync(temporaryPath);
    if (!tempStat.isFile() || tempStat.isSymbolicLink() || tempStat.nlink !== 1 || tempStat.size !== packageBytes.length) {
      return fail("DWP2-BUILDER-TEMP-SHAPE");
    }
    tempIdentity = { dev: tempStat.dev, ino: tempStat.ino, size: tempStat.size };

    const verifiedTemp = readDesignWorkflowPackageV2FromRepository({
      repoRoot: root,
      packagePath: tempRelative,
      trustedAdvisorExecutablePath,
      ...(typeof verifyReadinessExecution === "function" ? { verifyReadinessExecution } : {}),
    });
    if (!verifiedTemp?.ok || !same(verifiedTemp.workflowPackage, packageValue)) return fail(verifiedTemp?.code ?? "DWP2-BUILDER-CANONICAL-VERIFY");
    const exactTempBytes = readAdvisorPhysicalBytes(root, tempRelative, 262144);
    if (!exactTempBytes.equals(packageBytes) || !same(observeAdvisorCandidate(root), expectedCandidate)) return fail("DWP2-BUILDER-DRIFT");

    const parentNow = lstatSync(target.parent);
    if (parentNow.dev !== target.parentStat.dev || parentNow.ino !== target.parentStat.ino
      || parentNow.isSymbolicLink() || realpathSync(target.parent) !== target.parent) return fail("DWP2-BUILDER-PARENT-DRIFT");
    linkSync(temporaryPath, finalPath);
    unlinkSync(temporaryPath);
    temporaryPath = null;
    syncDirectory(target.parent);

    const finalStat = lstatSync(finalPath);
    if (!finalStat.isFile() || finalStat.isSymbolicLink() || finalStat.nlink !== 1
      || finalStat.dev !== tempIdentity.dev || finalStat.ino !== tempIdentity.ino || finalStat.size !== tempIdentity.size) {
      return fail("DWP2-BUILDER-PUBLISHED-SHAPE");
    }
    const packageRead = readDesignWorkflowPackageV2FromRepository({
      repoRoot: root,
      packagePath,
      trustedAdvisorExecutablePath,
      ...(typeof verifyReadinessExecution === "function" ? { verifyReadinessExecution } : {}),
    });
    if (!packageRead?.ok || !same(packageRead.workflowPackage, packageValue)
      || !same(observeAdvisorCandidate(root), expectedCandidate)) {
      // Remove only the exact inode this invocation created. Never remove a
      // replacement or unrelated destination.
      const current = lstatSync(finalPath);
      if (current.dev === tempIdentity.dev && current.ino === tempIdentity.ino && current.nlink === 1) {
        unlinkSync(finalPath);
        syncDirectory(target.parent);
      }
      return fail(packageRead?.code ?? "DWP2-BUILDER-FINAL-VERIFY");
    }
    return {
      ok: true,
      code: "DWP2-PACKAGE-BUILT",
      packagePath,
      packageSha256: sha(packageBytes),
      candidate: packageRead.candidate,
      sources: packageRead.workflowPackage.sources,
      advisorStatus: packageRead.advisorStatus,
      advisorExceptionRequired: packageRead.advisorExceptionRequired === true,
      packageRead,
    };
  } catch (error) {
    return inputFailure(error);
  } finally {
    if (temporaryPath) {
      try {
        const stat = lstatSync(temporaryPath);
        if (tempIdentity === null || (stat.dev === tempIdentity.dev && stat.ino === tempIdentity.ino)) {
          unlinkSync(temporaryPath);
          syncDirectory(dirname(temporaryPath));
        }
      } catch {}
    }
  }
}
