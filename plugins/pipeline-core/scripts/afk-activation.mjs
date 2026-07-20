#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { randomBytes as nodeRandomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile as nodeReadFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  SUPPORTED_ADAPTER,
  SUPPORTED_PROVIDER,
  SUPPORTED_TOOLS,
  canonicalJsonFile,
  describeAfkProviderCapability,
  isNormalizedRepoPath,
  parseCanonicalInstruction,
  prepareAfkActivation,
  sha256Canonical,
} from "../lib/afk-assumption-mode.mjs";
import { executeAfkActivationHostTransaction } from "../lib/afk-transaction-host.mjs";

export const EXIT = Object.freeze({ OK: 0, BLOCKED: 2 });
export const MAX_STDIN_BYTES = 262_144;

function denied(code, detail = null) {
  return { ok: false, code, detail, mutation: "none" };
}

function inside(root, relative) {
  if (!isNormalizedRepoPath(relative)) throw new Error("unsafe repository path");
  const absolute = resolve(root, relative);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!absolute.startsWith(prefix)) throw new Error("path escapes repository");
  return absolute;
}

function git(root, args, accepted = [0]) {
  const call = spawnSync("git", ["-C", root, "--no-optional-locks", ...args], {
    encoding: null,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_PAGER: "cat",
    },
    maxBuffer: 4 * 1024 * 1024,
  });
  if (!accepted.includes(call.status)) throw new Error("trusted Git observation failed");
  return call.stdout ?? Buffer.alloc(0);
}

function line(bytes) {
  return bytes.toString("utf8").trim();
}

export function observeGitActivation(root, featureRef) {
  const objectFormat = line(git(root, ["rev-parse", "--show-object-format"]));
  const head = line(git(root, ["rev-parse", "--verify", "HEAD"]));
  const tree = line(git(root, ["rev-parse", "--verify", "HEAD^{tree}"]));
  const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const symbolic = git(root, ["symbolic-ref", "-q", "HEAD"], [0, 1]);
  const inventory = git(root, ["worktree", "list", "--porcelain", "-z"]);
  const inventoryText = inventory.toString("utf8");
  const fields = inventoryText.split("\0").filter(Boolean);
  const branches = fields.filter((field) => field.startsWith("branch ")).map((field) => field.slice(7));
  const worktreeCount = fields.filter((field) => field.startsWith("worktree ")).length;
  const clean = status.length === 0;
  return {
    objectFormat,
    head,
    tree,
    indexTree: clean ? tree : "",
    worktreeTree: clean ? tree : "",
    detached: symbolic.length === 0,
    clean,
    featureRefCheckouts: branches.filter((branch) => branch === featureRef).length,
    worktreeInventory: inventory,
    worktreeCount,
  };
}

export async function observeSurface(root, readFile = nodeReadFile) {
  const adapterPath = "plugins/pipeline-core/agents/afk-claude-worker.md";
  const adapterBytes = await readFile(inside(root, adapterPath));
  return {
    provider: SUPPORTED_PROVIDER,
    adapterId: SUPPORTED_ADAPTER,
    adapterBytes,
    tools: [...SUPPORTED_TOOLS],
  };
}

function trustedRoot(cwd) {
  const root = line(git(cwd, ["rev-parse", "--show-toplevel"]));
  if (!isAbsolute(root)) throw new Error("repository root is not absolute");
  return resolve(root);
}

async function defaultExistingActivation() {
  return { receipt: null, state: "off" };
}

export async function activateFromBytes(rawInstruction, dependencies = {}) {
  const parsed = parseCanonicalInstruction(rawInstruction);
  if (!parsed.ok) return parsed;
  const instruction = parsed.value;
  const capability = describeAfkProviderCapability(instruction.surface.provider);
  if (capability.status !== "supported") return denied(capability.code);
  if (instruction.surface.adapterId !== SUPPORTED_ADAPTER
    || JSON.stringify(instruction.surface.tools) !== JSON.stringify(SUPPORTED_TOOLS)
    || instruction.surface.toolInventorySha256 !== sha256Canonical(SUPPORTED_TOOLS)) {
    return denied("AFK-PROVIDER-SURFACE-UNSUPPORTED");
  }
  const readFile = dependencies.readFile ?? nodeReadFile;
  let root;
  let statePreimage;
  let authority;
  let surface;
  let gitObservation;
  let existing;
  let activationId;
  let activatedAt;
  try {
    root = dependencies.root ? resolve(dependencies.root) : trustedRoot(dependencies.cwd ?? process.cwd());
    statePreimage = await readFile(inside(root, ".claude/pipeline-state.json"));
    authority = Object.fromEntries(await Promise.all(["prd", "spec", "courseBrief"].map(async (key) => {
      const path = instruction.authority[key].path;
      return [key, { path, bytes: await readFile(inside(root, path)) }];
    })));
    surface = dependencies.observeSurface
      ? await dependencies.observeSurface({ root, instruction })
      : await observeSurface(root, readFile);
    gitObservation = dependencies.observeGit
      ? await dependencies.observeGit({ root, instruction })
      : observeGitActivation(root, instruction.feature.ref);
    existing = await (dependencies.readExistingActivation ?? defaultExistingActivation)({ root, instruction });
    const random = (dependencies.randomBytes ?? nodeRandomBytes)(16);
    activationId = Buffer.from(random).toString("hex");
    activatedAt = (dependencies.now ? dependencies.now() : new Date()).toISOString();
  } catch {
    return denied("AFK-HOST-OBSERVATION-FAILED");
  }
  if (statePreimage.length > 4 * 1024 * 1024
    || !existing || !Object.hasOwn(existing, "receipt") || !Object.hasOwn(existing, "state")) {
    return denied("AFK-HOST-OBSERVATION-FAILED");
  }
  const prepared = prepareAfkActivation({
    instruction,
    activationId,
    activatedAt,
    statePreimage,
    authority,
    surface,
    git: gitObservation,
    existingReceipt: existing.receipt,
    existingState: existing.state,
  });
  if (!prepared.ok || prepared.action === "duplicate") return prepared;
  let transaction;
  try {
    const activationTransaction = dependencies.activationTransaction
      ?? ((input) => executeAfkActivationHostTransaction({
        root,
        ...input,
        recordedAt: activatedAt,
        refreshProjection: dependencies.refreshProjection,
      }));
    transaction = await activationTransaction({
      receipt: prepared.receipt,
      statePreimage,
      expectedStatePreimageSha256: prepared.expectedStatePreimageSha256,
      root,
      recordedAt: activatedAt,
    });
  } catch {
    return { ok: false, code: "AFK-A3-TRANSACTION-FAILED", detail: null, mutation: "unknown" };
  }
  if (!transaction || transaction.ok !== true) {
    const mutation = transaction?.mutation === "none" || transaction?.mutation === "wal"
      ? transaction.mutation : "unknown";
    return { ok: false, code: transaction?.code ?? "AFK-A3-TRANSACTION-FAILED", detail: null, mutation };
  }
  if (!["admitted", "active", "duplicate"].includes(transaction.status)) {
    return { ok: false, code: "AFK-A3-TRANSACTION-FAILED", detail: null, mutation: "unknown" };
  }
  return {
    ok: true,
    status: transaction.status,
    mutation: transaction.status === "duplicate" ? "none" : "wal",
    receipt: prepared.receipt,
  };
}

async function readStdin(stream) {
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_STDIN_BYTES) throw new Error("stdin too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdin = io.stdin ?? process.stdin;
  const stdout = io.stdout ?? process.stdout;
  if (argv.length !== 1 || argv[0] !== "activate") {
    stdout.write(canonicalJsonFile(denied("AFK-USAGE")));
    return EXIT.BLOCKED;
  }
  let raw;
  try {
    raw = await readStdin(stdin);
  } catch {
    stdout.write(canonicalJsonFile(denied("AFK-INSTRUCTION-INVALID")));
    return EXIT.BLOCKED;
  }
  const outcome = await activateFromBytes(raw, io.dependencies);
  stdout.write(canonicalJsonFile(outcome));
  return outcome.ok ? EXIT.OK : EXIT.BLOCKED;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
