#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Canonical productive implementation route for an Elephant session.
 *
 * An Antigravity packet is not an instruction to silently substitute a local
 * subagent.  It selects the sealed AGY route only; absent, expired, or changed
 * session authority returns a typed non-success and leaves any alternate
 * dispatcher to a fresh PO decision.  The native Antigravity `invoke_subagent`
 * hook remains deliberately non-productive for implementation roles because
 * it has no authenticated parent-session identity.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dispatchElephantAgyImplementation,
  ELEPHANT_AGY_IMPLEMENTATION_REQUEST_SCHEMA,
  parseArgs as parseAgyArgs,
} from "./elephant-agy-implementation-dispatch.mjs";

export const ELEPHANT_IMPLEMENTATION_DISPATCH_SCHEMA = "pipeline.elephant-implementation-dispatch-receipt.v1";
const IMPLEMENTATION_ROLES = new Set(["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]);

function physicalRequestUnderRoot(root, path) {
  if (typeof root !== "string" || typeof path !== "string" || path.length === 0) return null;
  try {
    const realRoot = realpathSync(root);
    const absolute = resolve(path);
    const rel = relative(realRoot, absolute);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024 || realpathSync(absolute) !== absolute) return null;
    return { absolute, bytes: readFileSync(absolute) };
  } catch { return null; }
}

function receipt({ status, code, selected = false, inner = null } = {}) {
  return {
    schema: ELEPHANT_IMPLEMENTATION_DISPATCH_SCHEMA,
    status,
    code,
    selection: {
      selectedRoute: selected ? "antigravity-session-consent" : null,
      fallback: "not-attempted",
      fallbackRequirement: "new-po-decision",
    },
    inner,
  };
}

/**
 * The actual production selector.  Its dependencies are tests seams only;
 * callers cannot nominate a provider, model, effort, role, or fallback.
 */
export async function dispatchElephantImplementation(input = {}, dependencies = {}) {
  const request = physicalRequestUnderRoot(input.root, input.dispatchRequestPath);
  if (!request) return receipt({ status: "rejected", code: "ELEPHANT-IMPLEMENTATION-REQUEST-PHYSICAL" });
  let packet;
  try { packet = JSON.parse(request.bytes.toString("utf8")); } catch { return receipt({ status: "rejected", code: "ELEPHANT-IMPLEMENTATION-REQUEST-JSON" }); }
  if (packet?.schema !== ELEPHANT_AGY_IMPLEMENTATION_REQUEST_SCHEMA || !IMPLEMENTATION_ROLES.has(packet?.role)) {
    return receipt({ status: "rejected", code: "ELEPHANT-IMPLEMENTATION-ROLE-FORBIDDEN" });
  }
  if (packet.transport !== "antigravity") {
    return receipt({ status: "unavailable", code: "ELEPHANT-IMPLEMENTATION-ROUTE-NOT-SELECTED" });
  }
  const runAgy = dependencies.dispatchElephantAgyImplementation ?? dispatchElephantAgyImplementation;
  let inner;
  try { inner = await runAgy(input, dependencies); }
  catch {
    // The selected route may already have launched a child. Preserve a typed
    // recovery state, not an unstructured CLI error or a retry suggestion.
    return receipt({ status: "recovery-required", code: "ELEPHANT-IMPLEMENTATION-SELECTED-ROUTE-EXCEPTION", selected: true });
  }
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) {
    return receipt({ status: "recovery-required", code: "ELEPHANT-IMPLEMENTATION-SELECTED-ROUTE-INVALID", selected: true });
  }
  if (inner.modelCalls > 0 && !["authored-commit-recorded", "final-pending-host-commit", "completed-undelivered", "interrupted-recorded", "recovery-required"].includes(inner.status)) {
    return receipt({ status: "recovery-required", code: "ELEPHANT-IMPLEMENTATION-LAUNCHED-NONFINAL", selected: true });
  }
  return receipt({
    status: inner?.status === "authored-commit-recorded" ? "authored-commit-recorded" : inner?.status === "final-pending-host-commit" ? "final-pending-host-commit" : inner?.status === "completed-undelivered" ? "completed-undelivered" : inner?.status === "interrupted-recorded" ? "interrupted-recorded" : inner?.status === "recovery-required" ? "recovery-required" : inner?.status === "unavailable" ? "unavailable" : "rejected",
    code: inner?.code ?? "AGY-ELEPHANT-ROUTE-UNAVAILABLE",
    selected: true,
    inner,
  });
}

export function parseArgs(argv) {
  return parseAgyArgs(argv);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await dispatchElephantImplementation(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = ["succeeded", "authored-commit-recorded"].includes(result.status) ? 0 : 2;
  } catch {
    process.stderr.write("elephant-implementation-dispatch: request refused\n");
    process.exitCode = 64;
  }
}

export const elephantImplementationDispatchInternals = Object.freeze({ physicalRequestUnderRoot, receipt });
