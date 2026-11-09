// SPDX-License-Identifier: SUL-1.0
// Codex Critic launch route (C22, AC-108, PO decision 2026-11-09). `.codex/agents/*.toml` is byte-identical across machines, so whether a Critic can
// run in its read-only sandbox is decided at launch from THIS machine's sandbox preflight receipt (`codex-sandbox-preflight.mjs`), never in the file.
// A Critic is mandatory: every outcome ends in a Critic that can run. A host without a usable sandbox gets `default`, labelled instruction-only,
// never a refusal and never a thrown error. Pure decision: the only I/O is the injected receipt reader.
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

export const CRITIC_LAUNCH_ROLES = Object.freeze(["critic", "critic-high-risk"]);
export const PREFLIGHT_RECEIPT_SCHEMA = "pipeline.codex-sandbox-preflight.v1";
const SANDBOX_ELIGIBILITY = Object.freeze(["intermediate", "strong"]);

export const CRITIC_LAUNCH_FALLBACK_REASONS = Object.freeze([
  "no-receipt",
  "receipt-unreadable",
  "receipt-schema-mismatch",
  "eligibility-insufficient",
  "terminal-code-not-ok",
  "role-invalid",
  "route-error",
]);

function fallback(reason) {
  return { agentType: "default", sandboxed: false, protection: "instruction-only", reason };
}

/**
 * @param {{ role?: string, receiptPath?: string, readText?: (path: string) => string }} input
 * @returns {{ agentType: string, sandboxed: true } | { agentType: "default", sandboxed: false, protection: "instruction-only", reason: string }}
 */
export function decideCodexCriticLaunchRoute(input) {
  try {
    const { role, receiptPath, readText = (path) => readFileSync(path, "utf8") } = input;
    if (!CRITIC_LAUNCH_ROLES.includes(role)) return fallback("role-invalid");
    if (receiptPath === undefined || receiptPath === null) return fallback("no-receipt");
    if (typeof receiptPath !== "string" || !isAbsolute(receiptPath)) return fallback("receipt-unreadable");
    let text;
    try { text = readText(receiptPath); } catch { return fallback("receipt-unreadable"); }
    let receipt;
    try { receipt = JSON.parse(text); } catch { return fallback("receipt-schema-mismatch"); }
    if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt) || receipt.schema !== PREFLIGHT_RECEIPT_SCHEMA) return fallback("receipt-schema-mismatch");
    if (!SANDBOX_ELIGIBILITY.includes(receipt.eligibility)) return fallback("eligibility-insufficient");
    if (receipt.terminalCode !== "ok") return fallback("terminal-code-not-ok");
    return { agentType: role, sandboxed: true };
  } catch {
    return fallback("route-error");
  }
}
