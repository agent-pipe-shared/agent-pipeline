// SPDX-License-Identifier: SUL-1.0
/** Private, exclusive session receipt store. Not a provider attestation. */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseStrictJson } from "./governance-event.mjs";
import { admitModelRoleBootstrap } from "./model-role-session.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy } from "./critical-human-proof-policy.mjs";
import { verifyModelRoleApprovedPolicy } from "./model-role-approved-policy.mjs";
import { verifyV3BaselineAuthority } from "./model-role-v3-baseline.mjs";

const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_BYTES = 128 * 1024;
const PARTS = ["agent-pipeline", "run", "model-role-sessions"];
function rejected(code) { return { ok: false, code }; }
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

function parent(commonDir, create) {
  if (typeof commonDir !== "string" || !commonDir.startsWith("/")) throw new Error("MODEL-ROLE-STORE-ROOT");
  let path = resolve(commonDir);
  for (const part of [null, ...PARTS]) {
    if (part !== null) {
      path = join(path, part);
      if (create) {
        try { mkdirSync(path, { mode: 0o700 }); }
        catch (error) { if (error?.code !== "EEXIST") throw error; }
      }
    }
    const entry = lstatSync(path);
    if (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(path) !== path) {
      throw new Error("MODEL-ROLE-STORE-PARENT");
    }
  }
  return path;
}

function checkedPayload(value, verifyAuthority) {
  const authority = value?.authority;
  const source = authority?.routeSource;
  let verified;
  try { verified = verifyAuthority(authority, value?.runner); } catch { return false; }
  if (!verified?.ok || !source?.ok || !Array.isArray(source.configuredRoutes)
    || !Array.isArray(source.taskRoutes)
    || value?.schema !== "pipeline.model-role-host-store.v1"
    || !["codex", "claude", "antigravity"].includes(value.runner)
    || !SESSION.test(value.sessionId ?? "") || !Array.isArray(value.receipts)
    || !Array.isArray(value.previousReceipts)
    || value.receipts.length !== source.configuredRoutes.filter((route) => route.runner === value.runner).length) return false;
  const policies = verified.approvedPolicies.filter((entry) => entry.runner === value.runner);
  if (!Array.isArray(policies) || policies.length !== value.receipts.length
    || value.receipts.some((receipt) => !policies.some((entry) => entry.runner === receipt.runner
      && entry.role === receipt.role && entry.effort === receipt.effort
      && receipt.policySha256 === digest(entry.policy)))) return false;
  const configuredRoutes = source.configuredRoutes.filter((route) => route.runner === value.runner)
    .map(({ runner, role, effort }) => ({ runner, role, effort }));
  const admitted = admitModelRoleBootstrap({ sessionId: value.sessionId,
    configuredRoutes, receipts: value.receipts, previousReceipts: value.previousReceipts,
    acknowledgement: value.acknowledgement });
  return admitted.ok && value.admission?.ok === true
    && value.admission.code === admitted.code
    && value.admission.readbackSha256 === admitted.readbackSha256
    && JSON.stringify(value.admission.receiptSha256s) === JSON.stringify(admitted.receiptSha256s);
}

function exactFileName(sessionId) {
  if (!SESSION.test(sessionId ?? "")) throw new Error("MODEL-ROLE-STORE-SESSION");
  return `${sessionId}.json`;
}

function syncParent(path) {
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); fsyncSync(fd); }
  catch (error) {
    if (!["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP", "EBADF"].includes(error?.code)) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function createModelRoleHostStore(commonDir, { rootDir, verifyAuthority = null } = {}) {
  const verify = verifyAuthority ?? ((authority, runner) => {
    if (authority?.mode === "v3-baseline") {
      return verifyV3BaselineAuthority({ authority, runner });
    }
    if (typeof rootDir !== "string" || !rootDir.startsWith("/")) return rejected("MODEL-ROLE-STORE-ROOT");
    const trust = readCriticalHumanProofPolicy(rootDir);
    const trustAnchors = trust?.trustAnchors ?? (trust?.trustAnchor ? [trust.trustAnchor] : []);
    if (!trust?.ok || trustAnchors.length === 0) return rejected("MODEL-ROLE-STORE-TRUST");
    return verifyModelRoleApprovedPolicy({ bundle: authority?.bundle,
      routeSource: authority?.routeSource, trustAnchors, requiredRunner: runner });
  });
  return {
    latest(excludeSessionId = null, runner = null) {
      try {
        if (excludeSessionId !== null) exactFileName(excludeSessionId);
        if (runner !== null && !["codex", "claude", "antigravity"].includes(runner)) {
          return rejected("MODEL-ROLE-STORE-RUNNER");
        }
        const directory = parent(commonDir, false);
        const names = readdirSync(directory).filter((name) => !name.startsWith("."));
        if (names.length > 256 || names.some((name) => !name.endsWith(".json")
          || !SESSION.test(name.slice(0, -5)))) return rejected("MODEL-ROLE-STORE-CORPUS");
        let latest = null;
        let latestAt = null;
        for (const name of names) {
          const sessionId = name.slice(0, -5);
          if (sessionId === excludeSessionId) continue;
          const stored = this.read(sessionId);
          if (!stored.ok) return rejected("MODEL-ROLE-STORE-CORPUS");
          if (runner !== null && stored.runner !== runner) continue;
          const observedAt = stored.receipts[0]?.observedAt;
          if (typeof observedAt !== "string") return rejected("MODEL-ROLE-STORE-CORPUS");
          if (latestAt === observedAt) return rejected("MODEL-ROLE-STORE-AMBIGUOUS-LATEST");
          if (latestAt === null || observedAt > latestAt) { latest = stored; latestAt = observedAt; }
        }
        return { ok: true, code: "MODEL-ROLE-STORE-LATEST", sessionId: latest?.sessionId ?? null,
          receipts: latest?.receipts ?? [] };
      } catch (error) {
        return error?.code === "ENOENT"
          ? { ok: true, code: "MODEL-ROLE-STORE-LATEST", sessionId: null, receipts: [] }
          : rejected("MODEL-ROLE-STORE-UNAVAILABLE");
      }
    },
    inspect(sessionId) {
      try {
        const directory = parent(commonDir, false);
        lstatSync(join(directory, exactFileName(sessionId)));
        // Even an unsafe or dangling entry is present: the productive route
        // must read and reject it, never fall back to legacy V3 selection.
        return { ok: true, status: "present" };
      } catch (error) {
        return error?.code === "ENOENT" ? { ok: true, status: "absent" }
          : rejected("MODEL-ROLE-STORE-UNAVAILABLE");
      }
    },
    persist({ sessionId, runner, admission, receipts, previousReceipts = [], acknowledgement = null,
      authority } = {}) {
      const value = { schema: "pipeline.model-role-host-store.v1", sessionId, runner,
        admission, receipts, previousReceipts, acknowledgement, authority };
      if (!checkedPayload(value, verify)) return rejected("MODEL-ROLE-STORE-BINDING");
      const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
      if (bytes.length > MAX_BYTES) return rejected("MODEL-ROLE-STORE-SIZE");
      let temporary;
      try {
        const directory = parent(commonDir, true);
        const target = join(directory, exactFileName(sessionId));
        if (existsSync(target)) return rejected("MODEL-ROLE-STORE-EXISTS");
        temporary = join(directory, `.${sessionId}.${randomBytes(16).toString("hex")}.tmp`);
        const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
          | (constants.O_NOFOLLOW ?? 0), 0o600);
        try {
          let offset = 0;
          while (offset < bytes.length) {
            const count = writeSync(fd, bytes, offset, bytes.length - offset, offset);
            if (count < 1) throw new Error("MODEL-ROLE-STORE-WRITE");
            offset += count;
          }
          fsyncSync(fd);
          if (fstatSync(fd).size !== bytes.length) throw new Error("MODEL-ROLE-STORE-WRITE");
          linkSync(temporary, target);
        } finally { closeSync(fd); }
        unlinkSync(temporary); temporary = undefined;
        syncParent(directory);
        const readback = this.read(sessionId);
        return readback.ok && readback.admission.readbackSha256 === admission.readbackSha256
          ? { ok: true, code: "MODEL-ROLE-STORE-PUBLISHED" }
          : rejected("MODEL-ROLE-STORE-READBACK");
      } catch (error) {
        return rejected(error?.code === "EEXIST" ? "MODEL-ROLE-STORE-EXISTS" : "MODEL-ROLE-STORE-UNAVAILABLE");
      } finally { if (temporary) try { unlinkSync(temporary); } catch {} }
    },
    read(sessionId) {
      try {
        const target = join(parent(commonDir, false), exactFileName(sessionId));
        const before = lstatSync(target);
        if (!before.isFile() || before.isSymbolicLink() || before.size < 1
          || before.size > MAX_BYTES || (before.mode & 0o077) !== 0) return rejected("MODEL-ROLE-STORE-TARGET");
        const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          const pinned = fstatSync(fd);
          if (pinned.dev !== before.dev || pinned.ino !== before.ino || pinned.size !== before.size) {
            return rejected("MODEL-ROLE-STORE-RACE");
          }
          const bytes = readFileSync(fd);
          const after = fstatSync(fd);
          const named = lstatSync(target);
          if (after.dev !== pinned.dev || after.ino !== pinned.ino || after.size !== pinned.size
            || after.mtimeMs !== pinned.mtimeMs || bytes.length !== after.size
            || named.dev !== after.dev || named.ino !== after.ino || named.isSymbolicLink()) {
            return rejected("MODEL-ROLE-STORE-RACE");
          }
          const value = parseStrictJson(bytes);
          return value.sessionId === sessionId && checkedPayload(value, verify)
            ? { ok: true, code: "MODEL-ROLE-STORE-READBACK", ...value }
            : rejected("MODEL-ROLE-STORE-BINDING");
        } finally { closeSync(fd); }
      } catch { return rejected("MODEL-ROLE-STORE-UNAVAILABLE"); }
    },
  };
}
