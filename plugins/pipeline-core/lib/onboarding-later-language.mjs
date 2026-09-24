// SPDX-License-Identifier: SUL-1.0
/** Project a later, explicitly confirmed intake language from durable consent. */
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveOnboardingPrivateState } from "./codex-onboarding-runtime.mjs";
import { readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";
import { INITIAL_ANSWERS_SCHEMA, resolveInitialAnswersState } from "./onboarding-initial-answers-state.mjs";
import { beginInitialAnswersJournal, completeInitialAnswersJournal } from "./onboarding-initial-answers-transaction.mjs";
import { MACHINE_PLANE_SCHEMA, machinePlaneFilePath, readMachinePlane, writeMachinePlane } from "./machine-plane.mjs";
import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { parseYaml } from "./yaml-lite.mjs";

export const LATER_LANGUAGE_AUDIT_SCHEMA = "pipeline.onboarding-language-decision.v1";
const LANGUAGES = new Set(["de", "en"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fail(code) { throw Object.assign(new Error(code), { code }); }

function physicalFile(path, { optional = false, maxBytes = 1024 * 1024 } = {}) {
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    fail("LATER-LANGUAGE-FILE-UNAVAILABLE");
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes) {
    fail("LATER-LANGUAGE-FILE-UNSAFE");
  }
  return { bytes: readFileSync(path), mode: stat.mode & 0o777 };
}

function atomicReplace(path, bytes, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.language-${randomBytes(12).toString("hex")}`;
  let fd;
  let created;
  try {
    fd = openSync(temporary, "wx", mode);
    created = fstatSync(fd);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
    let directoryFd;
    try {
      directoryFd = openSync(dirname(path), constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
      fsyncSync(directoryFd);
    } catch (error) {
      if (!["EINVAL", "ENOTSUP", "EOPNOTSUPP", "EBADF"].includes(error?.code)) throw error;
    } finally { if (directoryFd !== undefined) closeSync(directoryFd); }
  } catch (error) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* preserve first failure */ } }
    try {
      const current = lstatSync(temporary);
      if (created && current.dev === created.dev && current.ino === created.ino) unlinkSync(temporary);
    } catch { /* do not remove a foreign replacement */ }
    throw error;
  }
}

function correctedSource(bytes, language) {
  const source = bytes.toString("utf8");
  let parsed;
  try { parsed = parseYaml(source); }
  catch { fail("LATER-LANGUAGE-SOURCE-INVALID"); }
  if (!validatePipelineUserV3(parsed).ok || !LANGUAGES.has(parsed.language?.human_facing)) {
    fail("LATER-LANGUAGE-SOURCE-INVALID");
  }
  const pattern = /^([ \t]*human_facing:[ \t]*)(?:"(?:de|en)"|(?:de|en))[ \t]*$/gmu;
  if ([...source.matchAll(pattern)].length !== 1) fail("LATER-LANGUAGE-SOURCE-SHAPE");
  const corrected = source.replace(pattern, `$1${JSON.stringify(language)}`);
  let after;
  try { after = parseYaml(corrected); }
  catch { fail("LATER-LANGUAGE-SOURCE-INVALID"); }
  if (!validatePipelineUserV3(after).ok || after.language?.human_facing !== language) {
    fail("LATER-LANGUAGE-SOURCE-INVALID");
  }
  return Buffer.from(corrected, "utf8");
}

/** Read-only: never manufacture consent or mutate a missing private state. */
export function inspectConfirmedIntakeLanguageProjection({ rootDir, repositoryCapability, deps = {} } = {}) {
  try {
    if (!["local", "host-managed"].includes(repositoryCapability)) return { status: "invalid" };
    const root = realpathSync(rootDir);
    const first = physicalFile(resolveInitialAnswersState(root, repositoryCapability).receipt,
      { optional: true, maxBytes: 4096 });
    if (first === null) return { status: "not-required" };
    const firstValue = JSON.parse(first.bytes.toString("utf8"));
    if (firstValue?.schema !== INITIAL_ANSWERS_SCHEMA || firstValue.root !== root
      || !LANGUAGES.has(firstValue.language)) return { status: "invalid" };
    const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability });
    const language = checkpoint.status === "present" ? checkpoint.value.values.language : null;
    if (checkpoint.status !== "present" || checkpoint.value.consent?.granted !== true
      || !LANGUAGES.has(language) || firstValue.language === language) return { status: "not-required" };
    const directory = resolveOnboardingPrivateState(root, repositoryCapability).directory;
    const markerPath = join(directory, "language-projection-pending.json");
    try {
      const marker = lstatSync(markerPath);
      if (!marker.isFile() || marker.isSymbolicLink() || ![1, 2].includes(marker.nlink)) return { status: "invalid" };
      return { status: "pending", language };
    }
    catch (error) { if (error?.code !== "ENOENT") return { status: "invalid" }; }
    const auditFile = physicalFile(join(directory, "language-projection.json"),
      { optional: true, maxBytes: 4096 });
    const machine = readMachinePlane({ homedirFn: deps.homedir ?? homedir });
    const source = physicalFile(join(root, "pipeline.user.yaml"));
    const sourceLanguage = parseYaml(source.bytes.toString("utf8"))?.language?.human_facing;
    if (machine.status !== "valid" || !LANGUAGES.has(sourceLanguage)) return { status: "invalid" };
    if (auditFile === null) return { status: "required", language };
    const audit = JSON.parse(auditFile.bytes.toString("utf8"));
    if (audit?.schema !== LATER_LANGUAGE_AUDIT_SCHEMA || audit.root !== root
      || audit.repositoryCapability !== repositoryCapability
      || audit.firstReceiptSha256 !== sha256(first.bytes)
      || audit.initialLanguage !== firstValue.language || audit.intakeLanguage !== language
      || audit.consentAt !== checkpoint.value.consent.at) {
      return { status: "invalid" };
    }
    return sourceLanguage === language && machine.plane.language === language
      ? { status: "current", language } : { status: "invalid" };
  } catch { return { status: "invalid" }; }
}

/**
 * Consent is written by the existing intake coordinator first. Its private
 * checkpoint is the durable authorization for this derived projection. A
 * crash before journal publication is discoverable from that checkpoint;
 * after publication the exact-byte journal resumes all three target writes.
 */
export function projectConfirmedIntakeLanguage({
  rootDir, repositoryCapability, runner, deps = {}, afterPublication = null,
} = {}) {
  if (!["local", "host-managed"].includes(repositoryCapability) || typeof runner !== "string"
    || runner.length === 0 || (afterPublication !== null && typeof afterPublication !== "function")) {
    fail("LATER-LANGUAGE-ARGUMENTS-INVALID");
  }
  const root = realpathSync(rootDir);
  const firstPath = resolveInitialAnswersState(root, repositoryCapability).receipt;
  const first = physicalFile(firstPath, { optional: true, maxBytes: 4096 });
  if (first === null) return { status: "not-required", reason: "no-first-answer" };
  let firstValue;
  try { firstValue = JSON.parse(first.bytes.toString("utf8")); }
  catch { fail("LATER-LANGUAGE-FIRST-RECEIPT-INVALID"); }
  if (firstValue?.schema !== INITIAL_ANSWERS_SCHEMA || firstValue.root !== root
    || !LANGUAGES.has(firstValue.language)) fail("LATER-LANGUAGE-FIRST-RECEIPT-INVALID");

  const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability });
  const language = checkpoint.status === "present" ? checkpoint.value.values.language : null;
  if (checkpoint.status !== "present" || checkpoint.value.consent?.granted !== true
    || !LANGUAGES.has(language)) fail("LATER-LANGUAGE-CONSENT-UNAVAILABLE");
  if (firstValue.language === language) return { status: "not-required", reason: "unchanged" };

  const machineDependencies = { homedirFn: deps.homedir ?? homedir };
  const machinePath = machinePlaneFilePath(machineDependencies);
  const machine = readMachinePlane(machineDependencies);
  if (machinePath === null || machine.status !== "valid"
    || machine.plane.schema !== MACHINE_PLANE_SCHEMA
    || ![firstValue.language, language].includes(machine.plane.language)) {
    fail("LATER-LANGUAGE-MACHINE-INVALID");
  }
  const directory = resolveOnboardingPrivateState(root, repositoryCapability, { create: true }).directory;
  const markerPath = join(directory, "language-projection-pending.json");
  const auditPath = join(directory, "language-projection.json");
  const sourcePath = join(root, "pipeline.user.yaml");
  const targets = [
    { role: "source", path: sourcePath },
    { role: "machine", path: machinePath },
    { role: "receipt", path: auditPath },
  ];
  const firstReceiptSha256 = sha256(first.bytes);
  // The confirmed choice belongs to the repository, not to whichever runner
  // resumes it after a crash or a session handover.
  const answerSha256 = sha256(JSON.stringify({ root, repositoryCapability,
    firstReceiptSha256, initialLanguage: firstValue.language, intakeLanguage: language,
    consentAt: checkpoint.value.consent.at }));
  const journalArgs = { markerPath, root, runner: "language-projection", purpose: "later-language",
    repositoryCapability, answerSha256, targets };
  const publish = (role, path, bytes, mode) => {
    if (role === "machine") writeMachinePlane(JSON.parse(bytes.toString("utf8")), machineDependencies);
    else atomicReplace(path, bytes, mode);
    afterPublication?.(role);
  };
  if (!existsSync(markerPath)) {
    const existingAudit = physicalFile(auditPath, { optional: true, maxBytes: 4096 });
    if (existingAudit !== null) {
      let audit;
      try { audit = JSON.parse(existingAudit.bytes.toString("utf8")); }
      catch { fail("LATER-LANGUAGE-AUDIT-INVALID"); }
      if (audit?.schema !== LATER_LANGUAGE_AUDIT_SCHEMA || audit.root !== root
        || audit.repositoryCapability !== repositoryCapability
        || audit.firstReceiptSha256 !== firstReceiptSha256
        || audit.initialLanguage !== firstValue.language || audit.intakeLanguage !== language
        || audit.consentAt !== checkpoint.value.consent.at) {
        fail("LATER-LANGUAGE-AUDIT-CONFLICT");
      }
      const source = physicalFile(sourcePath);
      if (parseYaml(source.bytes.toString("utf8"))?.language?.human_facing !== language
        || machine.plane.language !== language) fail("LATER-LANGUAGE-READBACK-DRIFT");
      return { status: "replayed", audit };
    }
    const source = physicalFile(sourcePath);
    const nextSource = correctedSource(source.bytes, language);
    const nextMachine = { ...machine.plane, language, updatedAt: new Date().toISOString() };
    const audit = {
      schema: LATER_LANGUAGE_AUDIT_SCHEMA, root, repositoryCapability, runner,
      firstReceiptSha256, initialLanguage: firstValue.language, intakeLanguage: language,
      consentAt: checkpoint.value.consent.at,
    };
    targets[0] = { ...targets[0], postBytes: nextSource, postMode: source.mode,
      expectedPre: { bytes: source.bytes, mode: source.mode } };
    const machineFile = physicalFile(machinePath);
    targets[1] = { ...targets[1], postBytes: Buffer.from(`${JSON.stringify(nextMachine, null, 2)}\n`),
      postMode: 0o600, expectedPre: { bytes: machineFile.bytes, mode: machineFile.mode } };
    targets[2] = { ...targets[2], postBytes: Buffer.from(`${JSON.stringify(audit, null, 2)}\n`),
      postMode: 0o600, expectedPre: { bytes: null, mode: null } };
    beginInitialAnswersJournal(journalArgs);
  }
  const completed = completeInitialAnswersJournal({ ...journalArgs, publish });
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  return { status: completed.status, audit };
}
