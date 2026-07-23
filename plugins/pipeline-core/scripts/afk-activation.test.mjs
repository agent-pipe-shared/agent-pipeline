// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { readFile as readFileDisk } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FINAL_GATE,
  INSTRUCTION_SCHEMA,
  REQUIRED_DENY_SET,
  SUPPORTED_ADAPTER,
  SUPPORTED_TOOLS,
  canonicalJsonFile,
  prepareAfkActivation,
  sha256Canonical,
  sha256Raw,
} from "../lib/afk-assumption-mode.mjs";
import { EXIT, activateFromBytes, main } from "./afk-activation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, "afk-activation.schema.json");
const ROOT = "/trusted/repository";
const NOW = "2026-07-18T12:00:00.000Z";
const STATE_PATH = `${ROOT}/.claude/pipeline-state.json`;

function fixture() {
  const files = {
    prd: { path: "specs/batman/prd.md", bytes: Buffer.from("prd\n") },
    spec: { path: "specs/batman/spec.md", bytes: Buffer.from("spec\n") },
    courseBrief: { path: "specs/batman/course.md", bytes: Buffer.from("course\n") },
  };
  const statePreimage = Buffer.from(`${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "sprint-batman-epic", planPath: files.prd.path, phase: "implementation" },
  })}\n`);
  const adapterBytes = Buffer.from("trusted adapter\n");
  const surface = {
    provider: "claude",
    adapterId: SUPPORTED_ADAPTER,
    adapterBytes,
    tools: [...SUPPORTED_TOOLS],
  };
  const instruction = {
    schema: INSTRUCTION_SCHEMA,
    attributedBy: "po",
    expiresAt: "2026-07-18T13:00:00.000Z",
    finalGate: FINAL_GATE,
    feature: { id: "sprint-batman-epic", ref: "refs/heads/feat/sprint-batman" },
    base: { commit: "a".repeat(40), tree: "b".repeat(40), objectFormat: "sha1" },
    statePreimageSha256: sha256Raw(statePreimage),
    authority: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, {
      path: value.path, sha256: sha256Raw(value.bytes),
    }])),
    packages: ["pipeline-core"],
    pathAllowlist: { read: ["plugins/pipeline-core"], write: ["plugins/pipeline-core/lib"] },
    surface: {
      provider: surface.provider,
      adapterId: surface.adapterId,
      adapterSha256: sha256Raw(adapterBytes),
      tools: [...surface.tools],
      toolInventorySha256: sha256Canonical(surface.tools),
    },
    budgets: { entries: 2, files: 3, bytes: 4096 },
    deny: [...REQUIRED_DENY_SET],
  };
  const git = {
    objectFormat: "sha1",
    head: instruction.base.commit,
    tree: instruction.base.tree,
    indexTree: instruction.base.tree,
    worktreeTree: instruction.base.tree,
    detached: true,
    clean: true,
    featureRefCheckouts: 0,
    worktreeInventory: Buffer.from("trusted worktree inventory\0"),
    worktreeCount: 2,
  };
  const byPath = new Map([[STATE_PATH, statePreimage]]);
  for (const artifact of Object.values(files)) byPath.set(`${ROOT}/${artifact.path}`, artifact.bytes);
  return { files, statePreimage, surface, instruction, git, byPath };
}

function dependencies(base, overrides = {}) {
  return {
    root: ROOT,
    readFile: async (path) => {
      if (!base.byPath.has(path)) throw new Error(`unexpected read ${path}`);
      return base.byPath.get(path);
    },
    observeSurface: async () => structuredClone(base.surface),
    observeGit: async () => structuredClone(base.git),
    readExistingActivation: async () => ({ receipt: null, state: "off" }),
    randomBytes: () => Buffer.from("5".repeat(32), "hex"),
    now: () => new Date(NOW),
    ...overrides,
  };
}

test("Claude remains the supported AFK activation lane and passes one fully bound receipt to A3", async () => {
  const base = fixture();
  const calls = [];
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    activationTransaction: async (request) => {
      calls.push(request);
      return { ok: true, status: "active" };
    },
  }));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "active");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receipt.activationId, "5".repeat(32));
  assert.equal(calls[0].expectedStatePreimageSha256, base.instruction.statePreimageSha256);
  assert.equal(Buffer.compare(calls[0].statePreimage, base.statePreimage), 0);
  assert.equal(Object.hasOwn(calls[0], "command"), false);
  assert.equal(Object.hasOwn(calls[0], "provider"), false);
});

test("invalid and noncanonical stdin performs no host observation or transaction", async () => {
  let touched = 0;
  const deps = {
    root: ROOT,
    readFile: async () => { touched += 1; throw new Error("must not read"); },
    activationTransaction: async () => { touched += 1; return { ok: true }; },
  };
  assert.equal((await activateFromBytes("{}\n", deps)).code, "AFK-INSTRUCTION-INVALID");
  const base = fixture();
  assert.equal((await activateFromBytes(`${JSON.stringify(base.instruction)}\n`, deps)).code, "AFK-INSTRUCTION-NONCANONICAL");
  assert.equal(touched, 0);
});

test("stale complete state preimage prevents A3 invocation", async () => {
  const base = fixture();
  base.byPath.set(STATE_PATH, Buffer.concat([base.statePreimage, Buffer.from(" ")]));
  let transactions = 0;
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    activationTransaction: async () => { transactions += 1; return { ok: true }; },
  }));
  assert.equal(outcome.code, "AFK-STATE-PREIMAGE-STALE");
  assert.equal(outcome.mutation, "none");
  assert.equal(transactions, 0);
});

test("stale authority file prevents A3 invocation", async () => {
  const base = fixture();
  base.byPath.set(`${ROOT}/${base.files.spec.path}`, Buffer.from("changed\n"));
  let transactions = 0;
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    activationTransaction: async () => { transactions += 1; return { ok: true }; },
  }));
  assert.equal(outcome.code, "AFK-AUTHORITY-DIGEST-STALE");
  assert.equal(transactions, 0);
});

test("Codex optional lane, unknown providers and unknown tool inventory never reach A3", async () => {
  for (const variant of ["codex", "provider", "tool"]) {
    const base = fixture();
    if (variant === "codex") {
      base.instruction.surface.provider = "codex";
      base.surface.provider = "codex";
    } else if (variant === "provider") {
      base.instruction.surface.provider = "other";
      base.surface.provider = "other";
    } else {
      base.instruction.surface.tools = [...SUPPORTED_TOOLS, "Write"].sort();
      base.instruction.surface.toolInventorySha256 = sha256Canonical(base.instruction.surface.tools);
      base.surface.tools = [...base.instruction.surface.tools];
    }
    let transactions = 0;
    const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
      activationTransaction: async () => { transactions += 1; return { ok: true }; },
    }));
    assert.equal(outcome.code, variant === "codex"
      ? "AFK-CODEX-CAPABILITY-UNAVAILABLE"
      : "AFK-PROVIDER-SURFACE-UNSUPPORTED");
    assert.equal(outcome.mutation, "none");
    assert.equal(transactions, 0);
  }
});

test("Codex unavailable returns before every host observation and transaction", async () => {
  const base = fixture();
  base.instruction.surface.provider = "codex";
  base.surface.provider = "codex";
  let touched = 0;
  const unexpected = async () => { touched += 1; throw new Error("must not observe or mutate"); };
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    readFile: unexpected,
    observeSurface: unexpected,
    observeGit: unexpected,
    readExistingActivation: unexpected,
    randomBytes: () => { touched += 1; throw new Error("must not allocate activation"); },
    activationTransaction: unexpected,
  }));
  assert.equal(outcome.code, "AFK-CODEX-CAPABILITY-UNAVAILABLE");
  assert.equal(outcome.mutation, "none");
  assert.equal(touched, 0);
});

test("creation at exact expiry never reaches A3", async () => {
  const base = fixture();
  let transactions = 0;
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    now: () => new Date(base.instruction.expiresAt),
    activationTransaction: async () => { transactions += 1; return { ok: true }; },
  }));
  assert.equal(outcome.code, "AFK-ACTIVATION-EXPIRED");
  assert.equal(transactions, 0);
});

test("exact existing receipt is a zero-transaction idempotent duplicate", async () => {
  const base = fixture();
  const prepared = prepareAfkActivation({
    instruction: base.instruction,
    activationId: "5".repeat(32),
    activatedAt: NOW,
    statePreimage: base.statePreimage,
    authority: base.files,
    surface: base.surface,
    git: base.git,
  });
  let transactions = 0;
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    readExistingActivation: async () => ({ receipt: prepared.receipt, state: "active" }),
    activationTransaction: async () => { transactions += 1; return { ok: true }; },
  }));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.action, "duplicate");
  assert.equal(outcome.mutation, "none");
  assert.equal(transactions, 0);
});

test("a different live activation is blocked before transaction", async () => {
  const base = fixture();
  const prepared = prepareAfkActivation({
    instruction: base.instruction,
    activationId: "6".repeat(32),
    activatedAt: NOW,
    statePreimage: base.statePreimage,
    authority: base.files,
    surface: base.surface,
    git: base.git,
  });
  let transactions = 0;
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    readExistingActivation: async () => ({ receipt: prepared.receipt, state: "active" }),
    activationTransaction: async () => { transactions += 1; return { ok: true }; },
  }));
  assert.equal(outcome.code, "AFK-LIVE-ACTIVATION-EXISTS");
  assert.equal(transactions, 0);
});

test("missing protected projection writer and A3 failure are explicit and fail closed", async () => {
  const base = fixture();
  const unavailable = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    activationTransaction: undefined,
  }));
  assert.equal(unavailable.code, "AFK-PROJECTION-WRITER-UNAVAILABLE");
  assert.equal(unavailable.mutation, "none");

  const failed = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    activationTransaction: async () => ({ ok: false, code: "AFK-LEDGER-CONFLICT", mutation: "none" }),
  }));
  assert.equal(failed.code, "AFK-LEDGER-CONFLICT");
  assert.equal(failed.mutation, "none");

  const partial = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    activationTransaction: async () => ({ ok: false, code: "AFK-REF-CONFLICT", mutation: "wal" }),
  }));
  assert.equal(partial.code, "AFK-REF-CONFLICT");
  assert.equal(partial.mutation, "wal", "A1 must not erase a durable A3 commit-point observation");
});

test("host observation error fails closed without calling A3", async () => {
  const base = fixture();
  let transactions = 0;
  const outcome = await activateFromBytes(canonicalJsonFile(base.instruction), dependencies(base, {
    observeGit: async () => { throw new Error("git failed"); },
    activationTransaction: async () => { transactions += 1; return { ok: true }; },
  }));
  assert.equal(outcome.code, "AFK-HOST-OBSERVATION-FAILED");
  assert.equal(transactions, 0);
});

test("CLI accepts only the literal activate subcommand and emits canonical JSON", async () => {
  let output = "";
  const stdout = new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
  const usageExit = await main(["other"], { stdin: Readable.from([]), stdout });
  assert.equal(usageExit, EXIT.BLOCKED);
  assert.equal(JSON.parse(output).code, "AFK-USAGE");

  const base = fixture();
  output = "";
  const exit = await main(["activate"], {
    stdin: Readable.from([Buffer.from(canonicalJsonFile(base.instruction))]),
    stdout,
    dependencies: dependencies(base, { activationTransaction: async () => ({ ok: true, status: "admitted" }) }),
  });
  assert.equal(exit, EXIT.OK);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "admitted");
  assert.equal(output, canonicalJsonFile(parsed));
});

test("activation schema is closed and names the runtime receipt fields", async () => {
  const schema = JSON.parse(await readFileDisk(SCHEMA_PATH, "utf8"));
  assert.equal(schema.$id, "pipeline.afk-activation.v1");
  assert.equal(schema.additionalProperties, false);
  const base = fixture();
  const receipt = prepareAfkActivation({
    ...base, authority: base.files, activationId: "5".repeat(32), activatedAt: NOW,
  }).receipt;
  assert.deepEqual(Object.keys(schema.properties).sort(), Object.keys(receipt).sort());
  assert.deepEqual([...schema.required].sort(), Object.keys(receipt).sort());
  for (const key of ["feature", "base", "authority", "pathAllowlist", "surface", "budgets", "worktree"]) {
    assert.equal(schema.properties[key].additionalProperties, false, key);
  }
});
