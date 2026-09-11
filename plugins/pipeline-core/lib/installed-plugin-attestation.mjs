// SPDX-License-Identifier: SUL-1.0

/** Provider-neutral, read-only verifier for installer-owned plugin receipts. */
import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";
import { observePublicCoreIdentity, snapshotPhysicalPluginRoot } from "./public-core-observation.mjs";
import { evaluateProvenanceAdmission } from "./provenance-envelope.mjs";

export const INSTALLED_PLUGIN_ATTESTATION_SCHEMA = "pipeline.installed-plugin-attestation.v1";
const RESULT_SCHEMA = "pipeline.installed-plugin-attestation-verification.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?!.*\0)[^\r\n]+$/u;

const hash = (value) => createHash("sha256").update(value).digest("hex");
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const identityNumberKeys = ["dev", "ino", "mode", "uid", "gid", "nlink", "size"];
const identityTimeKeys = ["mtimeNs", "ctimeNs"];
const identityKeys = [...identityNumberKeys, ...identityTimeKeys];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rejected(code) {
  return Object.freeze({ schema: RESULT_SCHEMA, status: "rejected", reasonCodes: Object.freeze([code]) });
}

function unavailable(code) {
  return Object.freeze({ schema: RESULT_SCHEMA, status: "unavailable", reasonCodes: Object.freeze([code]) });
}

function pathOutside(root, candidate) {
  if (!isAbsolute(candidate)) return false;
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? false : rel !== "";
}

function capturedIdentity(info) {
  return {
    dev: Number(info.dev), ino: Number(info.ino), mode: Number(info.mode), uid: Number(info.uid),
    gid: Number(info.gid), nlink: Number(info.nlink), size: Number(info.size),
    mtimeNs: String(info.mtimeNs), ctimeNs: String(info.ctimeNs),
  };
}

function identityValid(value) {
  return exact(value, identityKeys)
    && identityNumberKeys.every((key) => safeInteger(value[key]))
    && identityTimeKeys.every((key) => /^(?:0|[1-9][0-9]*)$/u.test(value[key] ?? ""));
}

function identitySha256(value) {
  return hash(canonical(value));
}

function restrictive(identity, { directory = false } = {}) {
  if (!identityValid(identity) || (identity.mode & 0o022) !== 0) return false;
  return directory ? identity.nlink >= 1 : identity.nlink === 1;
}

function physicalTreeIdentity(snapshot) {
  return hash(canonical({
    root: capturedIdentity(snapshot.rootIdentity),
    directories: snapshot.directoryIdentities.map(({ path, identity }) => ({ path, identity: capturedIdentity(identity) })),
    files: snapshot.files.map(({ path, identity }) => ({ path, identity: capturedIdentity(identity) })),
  }));
}

function validateInput(input) {
  if (!exact(input, ["provider", "plugin", "installedPluginRoot", "source", "protectedPaths"])
    || !ID.test(input.provider ?? "")
    || !exact(input.plugin, ["name", "version"]) || !ID.test(input.plugin.name ?? "") || !VERSION.test(input.plugin.version ?? "")
    || typeof input.installedPluginRoot !== "string" || !isAbsolute(input.installedPluginRoot)
    || !Array.isArray(input.protectedPaths) || input.protectedPaths.length === 0
    || !input.protectedPaths.every((path) => typeof path === "string" && SAFE_PATH.test(path))
    || new Set(input.protectedPaths).size !== input.protectedPaths.length
    || [...input.protectedPaths].sort().join("\0") !== input.protectedPaths.join("\0")) return false;
  if (exact(input.source, ["class", "sourcePluginRoot"]) && input.source.class === "local-development") {
    return typeof input.source.sourcePluginRoot === "string" && isAbsolute(input.source.sourcePluginRoot);
  }
  return exact(input.source, ["class"]) && input.source.class === "signed-release";
}

function parseAuthority(value) {
  if (!exact(value, ["receiptBytes", "receiptIdentity", "releaseAttestation"])
    || !(typeof value.receiptBytes === "string" || Buffer.isBuffer(value.receiptBytes))
    || !exact(value.receiptIdentity, ["physicalPath", "physicalPathSha256", ...identityKeys, "contentSha256"])
    || typeof value.receiptIdentity.physicalPath !== "string" || !isAbsolute(value.receiptIdentity.physicalPath)
    || value.receiptIdentity.physicalPathSha256 !== hash(value.receiptIdentity.physicalPath)
    || !SHA256.test(value.receiptIdentity.contentSha256 ?? "")
    || !identityValid(Object.fromEntries(identityKeys.map((key) => [key, value.receiptIdentity[key]])))) return null;
  const bytes = Buffer.from(value.receiptBytes);
  if (hash(bytes) !== value.receiptIdentity.contentSha256 || bytes.length !== value.receiptIdentity.size) return null;
  let receipt;
  try { receipt = JSON.parse(bytes.toString("utf8")); } catch { return null; }
  return { ...value, receipt, bytes };
}

function releasePolicyValid(value, input) {
  return exact(value, ["schema", "provider", "plugin", "keyReference", "publicKeySha256", "builderDigest"])
    && value.schema === "pipeline.installed-plugin-host-policy.v1"
    && value.provider === input.provider
    && exact(value.plugin, ["name", "version"])
    && value.plugin.name === input.plugin.name && value.plugin.version === input.plugin.version
    && typeof value.keyReference === "string" && value.keyReference.length > 0
    && SHA256.test(value.publicKeySha256 ?? "") && SHA256.test(value.builderDigest ?? "");
}

function sourceValid(value, sourceClass) {
  if (sourceClass === "local-development") return exact(value, ["class", "repository", "branch", "commit", "tree"])
    && value.class === sourceClass && typeof value.repository === "string" && value.repository.length > 0
    && typeof value.branch === "string" && value.branch.length > 0 && OID.test(value.commit ?? "") && OID.test(value.tree ?? "");
  return exact(value, ["class", "envelope"]) && value.class === "signed-release";
}

/** Schema-covered item checks plus runtime-owned path-key/order semantics. */
export function validateInstalledProtectedFiles(files) {
  if (!Array.isArray(files) || files.length === 0
    || !files.every((entry) => exact(entry, ["path", "sha256"]) && SAFE_PATH.test(entry.path ?? "") && SHA256.test(entry.sha256 ?? ""))) {
    return Object.freeze({ valid: false, code: "IPA-PROTECTED-FILES-SCHEMA" });
  }
  if (new Set(files.map(({ path }) => path)).size !== files.length) return Object.freeze({ valid: false, code: "IPA-PROTECTED-FILES-DUPLICATE-PATH" });
  const ordered = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (ordered.map(({ path }) => path).join("\0") !== files.map(({ path }) => path).join("\0")) return Object.freeze({ valid: false, code: "IPA-PROTECTED-FILES-ORDER" });
  return Object.freeze({ valid: true, code: "IPA-PROTECTED-FILES-VALID" });
}

function receiptValid(receipt, sourceClass) {
  return exact(receipt, ["schema", "receiptId", "provider", "plugin", "installed", "source", "protected"])
    && receipt.schema === INSTALLED_PLUGIN_ATTESTATION_SCHEMA && SHA256.test(receipt.receiptId ?? "")
    && ID.test(receipt.provider ?? "")
    && exact(receipt.plugin, ["name", "version"]) && ID.test(receipt.plugin.name ?? "") && VERSION.test(receipt.plugin.version ?? "")
    && exact(receipt.installed, ["physicalRootPathSha256", "physicalRootIdentitySha256", "contentSha256"])
    && [receipt.installed.physicalRootPathSha256, receipt.installed.physicalRootIdentitySha256, receipt.installed.contentSha256].every((v) => SHA256.test(v ?? ""))
    && sourceValid(receipt.source, sourceClass)
    && exact(receipt.protected, ["graphSha256", "files"])
    && SHA256.test(receipt.protected.graphSha256 ?? "")
    && validateInstalledProtectedFiles(receipt.protected.files).valid;
}

function receiptPayload(receipt) {
  const { receiptId: _receiptId, ...payload } = receipt;
  return payload;
}

/**
 * Verifies one complete installed tree against an authority obtained without a
 * caller-supplied receipt/key path. `readExternalReceipt` is the future
 * installer receipt boundary and is invoked only with computed identity
 * claims. Signed releases additionally require a separately bound
 * `trustedHostPolicy`; the receipt reader cannot select its key or builder.
 */
export function verifyInstalledPluginAttestation(input = {}, {
  readExternalReceipt,
  trustedHostPolicy = null,
  observeLocal = observePublicCoreIdentity,
  snapshot = snapshotPhysicalPluginRoot,
} = {}) {
  try {
    if (!validateInput(input) || typeof readExternalReceipt !== "function" || typeof observeLocal !== "function" || typeof snapshot !== "function") return rejected("IPA-INPUT");
    if (input.source.class === "signed-release" && trustedHostPolicy === null) return unavailable("IPA-RELEASE-POLICY-UNAVAILABLE");
    if (input.source.class === "signed-release" && !releasePolicyValid(trustedHostPolicy, input)) return rejected("IPA-RELEASE-POLICY");
    if (input.source.class === "local-development" && trustedHostPolicy !== null) return rejected("IPA-LOCAL-AUTHORITY-SHAPE");
    const installed = snapshot(input.installedPluginRoot);
    const rootIdentity = capturedIdentity(installed.rootIdentity);
    const initialPhysicalTreeIdentity = physicalTreeIdentity(installed);
    const physicalEntries = [
      ...installed.directoryIdentities.map(({ path, identity }) => ({ path: `d:${path}`, identity: capturedIdentity(identity) })),
      ...installed.files.map(({ path, identity }) => ({ path: `f:${path}`, identity: capturedIdentity(identity) })),
    ];
    if (new Set(physicalEntries.map(({ path }) => path)).size !== physicalEntries.length
      || new Set(physicalEntries.map(({ identity }) => `${identity.dev}\0${identity.ino}`)).size !== physicalEntries.length) return rejected("IPA-DUPLICATE-STRUCTURE");
    if (!restrictive(rootIdentity, { directory: true })) return rejected("IPA-INSTALLED-PERMISSIONS");
    for (const directory of installed.directoryIdentities) {
      const identity = capturedIdentity(directory.identity);
      if (!restrictive(identity, { directory: true }) || identity.uid !== rootIdentity.uid || identity.gid !== rootIdentity.gid) return rejected("IPA-INSTALLED-PERMISSIONS");
    }
    for (const file of installed.files) {
      const identity = capturedIdentity(file.identity);
      if (!restrictive(identity) || identity.uid !== rootIdentity.uid || identity.gid !== rootIdentity.gid) return rejected("IPA-INSTALLED-PERMISSIONS");
    }
    const protectedFiles = input.protectedPaths.map((path) => {
      const entry = installed.files.find((file) => file.path === path);
      if (!entry) throw Object.assign(new Error("protected"), { code: "IPA-PROTECTED-MISSING" });
      return { path, sha256: entry.sha256 };
    });
    const protectedGraphSha256 = hash(canonical(protectedFiles));
    let localObservation = null;
    if (input.source.class === "local-development") {
      localObservation = observeLocal({ sourcePluginRoot: input.source.sourcePluginRoot, installedPluginRoot: input.installedPluginRoot });
      if (localObservation?.status !== "ready") return rejected("IPA-LOCAL-SOURCE-UNVERIFIED");
      if (localObservation.plugin.name !== input.plugin.name || localObservation.plugin.version !== input.plugin.version
        || localObservation.plugin.contentSha256 !== installed.contentSha256) return rejected("IPA-LOCAL-SOURCE-MISMATCH");
    }
    const request = Object.freeze({
      schema: "pipeline.installed-plugin-attestation-authority-request.v1",
      provider: input.provider,
      plugin: Object.freeze({ ...input.plugin }),
      sourceClass: input.source.class,
      physicalRootPathSha256: hash(installed.root),
      physicalRootIdentitySha256: identitySha256(rootIdentity),
      installedContentSha256: installed.contentSha256,
      protectedGraphSha256,
    });
    const authority = parseAuthority(readExternalReceipt(request));
    if (authority === null) return rejected("IPA-AUTHORITY");
    if (!pathOutside(installed.root, authority.receiptIdentity.physicalPath)
      || (input.source.class === "local-development" && !pathOutside(input.source.sourcePluginRoot, authority.receiptIdentity.physicalPath))) return rejected("IPA-RECEIPT-LOCAL");
    const receiptFileIdentity = Object.fromEntries(identityKeys.map((key) => [key, authority.receiptIdentity[key]]));
    if (!restrictive(receiptFileIdentity) || receiptFileIdentity.uid !== rootIdentity.uid || receiptFileIdentity.gid !== rootIdentity.gid) return rejected("IPA-RECEIPT-PERMISSIONS");
    const receipt = authority.receipt;
    if (!receiptValid(receipt, input.source.class) || receipt.receiptId !== hash(canonical(receiptPayload(receipt)))) return rejected("IPA-RECEIPT");
    if (receipt.provider !== input.provider || receipt.plugin.name !== input.plugin.name || receipt.plugin.version !== input.plugin.version) return rejected("IPA-IDENTITY-MISMATCH");
    if (receipt.installed.physicalRootPathSha256 !== request.physicalRootPathSha256
      || receipt.installed.physicalRootIdentitySha256 !== request.physicalRootIdentitySha256
      || receipt.installed.contentSha256 !== request.installedContentSha256) return rejected("IPA-INSTALLED-MISMATCH");
    if (receipt.protected.graphSha256 !== protectedGraphSha256 || canonical(receipt.protected.files) !== canonical(protectedFiles)) return rejected("IPA-PROTECTED-MISMATCH");
    if (input.source.class === "local-development") {
      if (authority.releaseAttestation !== null) return rejected("IPA-LOCAL-AUTHORITY-SHAPE");
      if (canonical(receipt.source) !== canonical({ class: "local-development", ...localObservation.candidate })) return rejected("IPA-LOCAL-PROVENANCE-MISMATCH");
    } else {
      const releaseClaimsSha256 = hash(canonical({
        provider: receipt.provider, plugin: receipt.plugin, installed: receipt.installed,
        protected: receipt.protected, sourceClass: receipt.source.class,
      }));
      const envelope = receipt.source.envelope;
      const admission = evaluateProvenanceAdmission({
        boundary: "readback", envelope,
        expected: {
          candidate: envelope?.candidate,
          subject: { id: "installed-plugin-release", sha256: releaseClaimsSha256 },
          materials: [{ id: "protected-graph", kind: "installed-plugin", sha256: protectedGraphSha256 }],
          builderDigest: trustedHostPolicy.builderDigest,
          attestation: { keyReference: trustedHostPolicy.keyReference, publicKeySha256: trustedHostPolicy.publicKeySha256 },
        },
        attestation: authority.releaseAttestation,
      });
      if (!admission.allowed) return rejected("IPA-RELEASE-PROVENANCE");
    }
    const finalInstalled = snapshot(input.installedPluginRoot);
    if (finalInstalled.contentSha256 !== installed.contentSha256
      || physicalTreeIdentity(finalInstalled) !== initialPhysicalTreeIdentity) return rejected("IPA-INSTALLED-CHANGED");
    if (input.source.class === "local-development") {
      // The installer authority call is outside this process and can take an
      // arbitrary amount of time. Re-observe Git cleanliness/candidate plus
      // complete source↔installed equivalence after it returns, and require
      // the result to be byte-for-byte the same authority we admitted above.
      // This prevents an old candidate from being attributed to a source (or
      // matching installed copy) replaced while the receipt was read.
      const finalLocalObservation = observeLocal({
        sourcePluginRoot: input.source.sourcePluginRoot,
        installedPluginRoot: input.installedPluginRoot,
      });
      if (finalLocalObservation?.status !== "ready"
        || canonical(finalLocalObservation) !== canonical(localObservation)) return rejected("IPA-LOCAL-SOURCE-CHANGED");
    }
    return Object.freeze({
      schema: RESULT_SCHEMA,
      status: "verified",
      request,
      receiptId: receipt.receiptId,
      externalReceiptIdentitySha256: hash(canonical(authority.receiptIdentity)),
    });
  } catch (error) {
    return rejected(error?.code === "IPA-PROTECTED-MISSING" ? error.code : "IPA-OBSERVATION");
  }
}
