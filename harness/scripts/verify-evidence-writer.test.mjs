#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// NVA-B-EVSLOTFIX-1: unit + real-concurrency proof for ./verify-evidence-writer.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { writeEvidenceAtomic } from "./verify-evidence-writer.mjs";

const writerModulePath = fileURLToPath(new URL("./verify-evidence-writer.mjs", import.meta.url));

test("writeEvidenceAtomic writes the exact pretty-JSON, newline-terminated shape", () => {
  const dir = mkdtempSync(join(tmpdir(), "evwrite-"));
  try {
    const target = join(dir, "evidence.json");
    const value = { schema: "pipeline.verify-evidence.v0", commit: "AAAA", exitCode: 0 };
    const returned = writeEvidenceAtomic(target, value);
    assert.equal(returned, target);
    const raw = readFileSync(target, "utf8");
    assert.equal(raw, `${JSON.stringify(value, null, 2)}\n`);
    assert.deepEqual(JSON.parse(raw), value);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeEvidenceAtomic creates a missing parent directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "evwrite-"));
  try {
    const target = join(dir, "nested", "deeper", "evidence.json");
    writeEvidenceAtomic(target, { a: 1 });
    assert.equal(JSON.parse(readFileSync(target, "utf8")).a, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeEvidenceAtomic leaves no temp file behind on success", () => {
  const dir = mkdtempSync(join(tmpdir(), "evwrite-"));
  try {
    const target = join(dir, "evidence.json");
    writeEvidenceAtomic(target, { a: 1 });
    assert.deepEqual(readdirSync(dir), ["evidence.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeEvidenceAtomic overwrites an existing file completely (no merge of old+new keys)", () => {
  const dir = mkdtempSync(join(tmpdir(), "evwrite-"));
  try {
    const target = join(dir, "evidence.json");
    writeEvidenceAtomic(target, { a: 1, onlyInFirst: true });
    writeEvidenceAtomic(target, { a: 2 });
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { a: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Real-process concurrency proof. Two REAL child processes hammer the SAME shared target path
// with writeEvidenceAtomic() in a tight loop, each writing a multi-kilobyte, easily-distinguished
// payload (large enough that a non-atomic write -- write-in-place without rename -- would very
// likely interleave under this much contention). While both children run, THIS process repeatedly
// re-reads and re-parses the shared target in its own tight loop. Every successful read must be
// complete, valid JSON, and byte-identical to a payload one of the two writers actually produced
// -- never a JSON.parse failure and never a hybrid of both writers' bytes. That is the atomicity
// claim: renameSync() only ever exposes a reader to a whole prior file or a whole new file.
test("two real processes racing writeEvidenceAtomic() on one path never expose a torn read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "evwrite-race-"));
  try {
    const target = join(dir, "verify-latest.json");
    const writerScript = join(dir, "writer.mjs");
    const iterations = 150;
    writeFileSync(
      writerScript,
      [
        `import { writeEvidenceAtomic } from ${JSON.stringify(writerModulePath)};`,
        `const [, , target, label, iterationsRaw] = process.argv;`,
        `const n = Number(iterationsRaw);`,
        `for (let i = 0; i < n; i++) {`,
        `  writeEvidenceAtomic(target, { schema: "pipeline.verify-evidence.v0", writer: label, iteration: i, payload: label.repeat(4096) });`,
        `}`,
      ].join("\n"),
    );

    function runChild(args) {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [writerScript, ...args], { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr || `writer exited ${code}`))));
        child.on("error", reject);
      });
    }

    const readErrors = [];
    let readCount = 0;
    let stop = false;
    const readLoop = (async () => {
      while (!stop) {
        if (existsSync(target)) {
          let raw;
          try {
            raw = readFileSync(target, "utf8");
          } catch {
            // A rename can transiently make the path briefly ENOENT between unlink-old and
            // link-new on some filesystems; that is not a torn READ (no bytes were observed),
            // so it is not counted as a failure here -- only a successful-but-corrupt read is.
            await new Promise((resolve) => setImmediate(resolve));
            continue;
          }
          readCount += 1;
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (error) {
            readErrors.push(`JSON.parse failed on a ${raw.length}-byte read: ${error.message}`);
            await new Promise((resolve) => setImmediate(resolve));
            continue;
          }
          const expectedPayload = typeof parsed.writer === "string" ? parsed.writer.repeat(4096) : undefined;
          if (parsed.schema !== "pipeline.verify-evidence.v0" || !["A", "B"].includes(parsed.writer) || typeof parsed.iteration !== "number" || parsed.payload !== expectedPayload) {
            readErrors.push(`unexpected/mixed shape: ${JSON.stringify({ schema: parsed.schema, writer: parsed.writer, iteration: parsed.iteration, payloadLength: parsed.payload?.length }).slice(0, 200)}`);
          }
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();

    await Promise.all([runChild([target, "A", String(iterations)]), runChild([target, "B", String(iterations)])]);
    stop = true;
    await readLoop;

    assert.ok(readCount > 0, "the reader loop never observed a written file -- test is not exercising the race");
    assert.deepEqual(readErrors, []);
    // Final state must also be a complete, valid write from one of the two writers.
    const final = JSON.parse(readFileSync(target, "utf8"));
    assert.ok(["A", "B"].includes(final.writer));
    assert.equal(final.payload, final.writer.repeat(4096));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Design-adjacent proof, independent of the shared-slot atomicity above: two DIFFERENT target
// paths (as verify.mjs's per-run evidence path is designed to be, one per runId) never contend
// at all -- both survive complete and untouched by the other writer, by construction of having
// distinct paths, not by any locking. This is the mechanism that lets "both runs' evidence
// survive" in the fix design (see the repro-evslotfix demonstration under backlog/evidence/).
test("writers on two distinct per-run paths never clobber each other", async () => {
  const dir = mkdtempSync(join(tmpdir(), "evwrite-distinct-"));
  try {
    const targetA = join(dir, "verify-run-AAAA.json");
    const targetB = join(dir, "verify-run-BBBB.json");
    await Promise.all([
      (async () => { await new Promise((r) => setTimeout(r, 5)); writeEvidenceAtomic(targetA, { commit: "AAAA" }); })(),
      (async () => { await new Promise((r) => setTimeout(r, 1)); writeEvidenceAtomic(targetB, { commit: "BBBB" }); })(),
    ]);
    assert.deepEqual(JSON.parse(readFileSync(targetA, "utf8")), { commit: "AAAA" });
    assert.deepEqual(JSON.parse(readFileSync(targetB, "utf8")), { commit: "BBBB" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
