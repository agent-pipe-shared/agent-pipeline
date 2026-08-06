#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { validateGitLabCiBroker } from "../lib/gitlab-ci-execution-broker.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const BROKER_SCHEMA = JSON.parse(readFileSync(new URL("./gitlab-ci-execution-broker.schema.json", import.meta.url), "utf8"));

function parseUniqueJson(text) {
  let at = 0;
  const fail = (message) => { throw new Error(message); };
  const whitespace = () => { while (/\s/u.test(text[at] ?? "")) at += 1; };
  const string = () => {
    if (text[at] !== "\"") fail(`invalid JSON string at byte ${at}`);
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") { at += 1; continue; }
      if (char === "\"") { try { return JSON.parse(text.slice(start, at)); } catch { fail(`invalid JSON string at byte ${start}`); } }
    }
    fail(`unterminated JSON string at byte ${start}`);
  };
  const value = () => {
    whitespace();
    if (text[at] === "{") {
      at += 1; whitespace();
      const keys = new Set();
      if (text[at] === "}") { at += 1; return; }
      while (true) {
        const key = string();
        if (keys.has(key)) fail(`duplicate JSON key: ${key}`);
        keys.add(key); whitespace();
        if (text[at++] !== ":") fail(`expected ':' at byte ${at - 1}`);
        value(); whitespace();
        const delimiter = text[at++];
        if (delimiter === "}") return;
        if (delimiter !== ",") fail(`expected ',' or '}' at byte ${at - 1}`);
        whitespace();
      }
    }
    if (text[at] === "[") {
      at += 1; whitespace();
      if (text[at] === "]") { at += 1; return; }
      while (true) {
        value(); whitespace();
        const delimiter = text[at++];
        if (delimiter === "]") return;
        if (delimiter !== ",") fail(`expected ',' or ']' at byte ${at - 1}`);
      }
    }
    if (text[at] === "\"") { string(); return; }
    const token = text.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0];
    if (!token) fail(`invalid JSON value at byte ${at}`);
    at += token.length;
  };
  value(); whitespace();
  if (at !== text.length) fail(`unexpected data after JSON at byte ${at}`);
  return JSON.parse(text);
}

export function runGitLabCiExecutionBroker(argv, { stdout, stderr, readFile = readFileSync } = {}) {
  const [path] = argv;
  if (!path || argv.length !== 1) { stderr.write("usage: gitlab-ci-execution-broker.mjs <record.json>\n"); return 2; }
  try { const record = parseUniqueJson(readFile(path, "utf8")); const structural = validateAgainstSchema(record, BROKER_SCHEMA); const result = structural.valid ? validateGitLabCiBroker(record) : { ok: false, code: "SCHEMA:broker" }; stdout.write(`${JSON.stringify(result)}\n`); return result.ok ? 0 : 2; } catch { stderr.write("invalid broker record\n"); return 2; }
}

if (isDirectInvocation(import.meta.url)) process.exitCode = runGitLabCiExecutionBroker(process.argv.slice(2), process);
