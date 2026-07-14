#!/usr/bin/env node
/**
 * Fail-closed form checker for the Critic's deliberately narrow input boundary.
 * It validates reference categories only: artifact contents are never accepted
 * or inspected by this checker.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DECLARED_CONTRACT_PATHS = Object.freeze([
  "roles/critic.md",
  "templates/prompts/critic-review.md",
]);
const REQUIRED_KINDS = Object.freeze(["spec", "diff", "guardrail", "evidence"]);
const OPTIONAL_KINDS = new Set(["metadata"]);
const ALLOWED_KINDS = new Set([...REQUIRED_KINDS, ...OPTIONAL_KINDS]);
const FORBIDDEN_KINDS = new Set([
  "handover",
  "state",
  "history",
  "session",
  "chat",
  "implementor-explanation",
  "prior-verdict",
  "summary",
  "expectation",
  "replacement",
]);
const REQUIRED_MARKERS = Object.freeze([
  "CRITIC-FAIL-CLOSED: reference-only-stop",
  "substantive review stopped",
  "Do not read the prohibited content, search for a substitute",
]);

function stop(findingCategory) {
  return Object.freeze({ ok: false, findingCategory, action: "stop" });
}

/**
 * Validate only synthetic reference descriptors. Descriptors deliberately have
 * no artifact-content field: callers must resolve allowed references themselves.
 */
export function validateCriticReferences(references) {
  if (!Array.isArray(references)) return stop("invalid-reference-set");
  const seen = new Set();
  for (const reference of references) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return stop("invalid-reference");
    const keys = Object.keys(reference).sort();
    if (keys.length !== 2 || keys[0] !== "availability" || keys[1] !== "kind") return stop("forbidden-or-ambiguous-input");
    const { kind, availability } = reference;
    if (typeof kind !== "string" || typeof availability !== "string") return stop("invalid-reference");
    if (FORBIDDEN_KINDS.has(kind)) return stop("forbidden-input");
    if (!ALLOWED_KINDS.has(kind)) return stop("outside-declared-boundary");
    if (availability === "missing") return stop("missing-required-artifact");
    if (availability === "unreadable") return stop("unreadable-required-artifact");
    if (availability !== "available") return stop("ambiguous-required-artifact");
    seen.add(kind);
  }
  for (const kind of REQUIRED_KINDS) if (!seen.has(kind)) return stop("missing-required-artifact");
  return Object.freeze({ ok: true, action: "review" });
}

export function checkCriticFailClosedContract(contractTexts) {
  if (!contractTexts || typeof contractTexts !== "object") return { ok: false, errors: ["contract surface is unreadable"] };
  const errors = [];
  for (const path of DECLARED_CONTRACT_PATHS) {
    const text = contractTexts[path];
    if (typeof text !== "string") {
      errors.push(`${path}: unreadable`);
      continue;
    }
    const normalized = text.replace(/\s+/g, " ");
    for (const marker of REQUIRED_MARKERS) if (!normalized.includes(marker)) errors.push(`${path}: missing fail-closed rule`);
  }
  return { ok: errors.length === 0, errors };
}

function read(path) {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const texts = Object.fromEntries(DECLARED_CONTRACT_PATHS.map((path) => [path, read(join(root, path))]));
  const result = checkCriticFailClosedContract(texts);
  if (!result.ok) {
    for (const error of result.errors) console.error(`critic-fail-closed: ${error}`);
    process.exit(2);
  }
  console.log("Critic fail-closed contract valid.");
}
