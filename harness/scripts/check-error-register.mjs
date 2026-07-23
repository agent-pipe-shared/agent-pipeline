#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Fail-closed form checker for the public, sanitized error-register authority. */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_REGISTER = join(root, "backlog", "error-register.md");
const HEADER = "| Class | Category | Triage |";
const SEPARATOR = "| --- | --- | --- |";
const CATEGORIES = new Set(["process", "tooling", "quality", "safety"]);
const TRIAGE = /^(?:new|recurring -> (?:mechanism|template|lesson): [^|]+|recurring -> deferred: [^|]+)$/;
const DECLARED_BRIEFING_CONSUMERS = Object.freeze([
  "roles/goldfish.md",
  "roles/critic.md",
]);
const FORBIDDEN_ROW = /(?:\b(?:count|ranking|rank|frequency|priority)\b|\b(?:goldfish|critic)\s+briefing\b|\b20\d{2}-\d{2}-\d{2}\b|\b(?:incident|timeline|chronology|raw event|first seen|last seen|occurred)\b|\b(?:host|machine|account|repository|repo)\s*(?::|=|[-_][a-z0-9])|https?:\/\/|(?:token|password|secret)\s*[=:]|[A-Za-z]:[\\/]|\/(?:home|users)\/|@)/i;

function result(ok, errors = []) {
  return { ok, errors };
}

function tableRows(text) {
  const lines = text.split("\n");
  const start = lines.indexOf(HEADER);
  if (start < 0 || lines[start + 1] !== SEPARATOR) return null;
  const rows = [];
  for (let index = start + 2; index < lines.length && lines[index].startsWith("|"); index += 1) rows.push(lines[index]);
  return rows;
}

export function checkErrorRegister(text, { consumerTexts = [] } = {}) {
  if (typeof text !== "string") return result(false, ["authority is unreadable"]);
  const rows = tableRows(text);
  if (rows === null) return result(false, ["authority has an invalid table form"]);
  if (rows.length > 30) return result(false, ["authority exceeds the consolidated class cap"]);
  const seen = new Set();
  const errors = [];
  for (const [index, line] of rows.entries()) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 3 || cells.some((cell) => cell === "")) {
      errors.push(`row ${index + 1}: invalid cells`);
      continue;
    }
    const [name, category, triage] = cells;
    const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!normalized || seen.has(normalized)) errors.push(`row ${index + 1}: unconsolidated class`);
    seen.add(normalized);
    if (!CATEGORIES.has(category)) errors.push(`row ${index + 1}: invalid category`);
    if (!TRIAGE.test(triage)) errors.push(`row ${index + 1}: recurring class lacks disposition or reasoned deferral`);
    if (FORBIDDEN_ROW.test(line)) errors.push(`row ${index + 1}: forbidden count, ranking, injection, or sensitive signal`);
  }
  for (const consumer of consumerTexts) {
    if (typeof consumer === "string" && /(?:goldfish|critic).{0,80}error-register|error-register.{0,80}(?:goldfish|critic)/is.test(consumer)) {
      errors.push("briefing injection path detected");
    }
  }
  return result(errors.length === 0, errors);
}

export function checkDeclaredBriefingConsumers(readText) {
  const texts = DECLARED_BRIEFING_CONSUMERS.map((path) => `${path.includes("goldfish") ? "Goldfish" : "Critic"} briefing:\n${readText(path)}`);
  return checkErrorRegister("# synthetic\n\n| Class | Category | Triage |\n| --- | --- | --- |\n", { consumerTexts: texts });
}

function read(path) {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2] ? (isAbsolute(process.argv[2]) ? process.argv[2] : resolve(process.cwd(), process.argv[2])) : DEFAULT_REGISTER;
  const form = checkErrorRegister(read(target));
  const consumers = checkDeclaredBriefingConsumers((relativePath) => read(join(root, relativePath)));
  const verdict = result(form.ok && consumers.ok, [...form.errors, ...consumers.errors]);
  if (!verdict.ok) {
    for (const error of verdict.errors) console.error(`error-register: ${error}`);
    process.exit(2);
  }
  console.log("Error register valid.");
}
