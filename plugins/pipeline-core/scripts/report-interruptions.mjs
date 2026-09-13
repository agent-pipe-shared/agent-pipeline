#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Local interruption reporting CLI script (C1 Slice 2).
 *
 * Reads receipts/snapshots from the local interruption store, aggregates them
 * using aggregateInterruptionReceipts, and prints either structured JSON or a
 * deterministic human summary.
 */
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { createInterruptionStore } from "../lib/interruption-receipt-store.mjs";
import {
  aggregateInterruptionReceipts,
  validateInterruptionReceipt,
} from "../lib/interruption-receipts.mjs";
import { canonicalInvocationJson } from "../lib/invocation-reliability.mjs";
import registry from "../../../policies/interruption-registry.v1.json" with { type: "json" };

export const REPORT_RESULT_SCHEMA = "pipeline.interruption-report-result.v1";
export const LOCAL_REPORT_SCHEMA = "pipeline.interruption-local-report.v1";
export const SNAPSHOT_SCHEMA = "pipeline.interruption-store-snapshot.v1";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const PRIVATE_ID = /(?:^|[._:+-])(?:sk-|gh[pousr]_|github_pat_|AKIA[0-9A-Z]{16})/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/u;

export const productionPorts = Object.freeze({
  storeFactory: createInterruptionStore,
  aggregate: aggregateInterruptionReceipts,
  validateReceipt: validateInterruptionReceipt,
  registry,
  io: fs,
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isValidIso(str) {
  if (typeof str !== "string" || str.length === 0) return false;
  const parsed = Date.parse(str);
  if (!Number.isFinite(parsed)) return false;
  return ISO_PATTERN.test(str);
}

function normalizeIso(str) {
  return new Date(str).toISOString();
}

function isValidId(str) {
  return typeof str === "string" && ID_PATTERN.test(str) && !PRIVATE_ID.test(str);
}

export function parseReportInterruptionsArgs(argv) {
  let root = null;
  let from = null;
  let through = null;
  let feature = null;
  let packageId = null;
  let dispatchId = null;
  let format = "json";
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--root") {
      i++;
      if (i >= argv.length || argv[i].startsWith("--")) {
        return { ok: false, code: "C1S-SHAPE", error: "--root requires a path" };
      }
      root = argv[i];
    } else if (arg === "--from") {
      i++;
      if (i >= argv.length || argv[i].startsWith("--")) {
        return { ok: false, code: "C1S-SHAPE", error: "--from requires an ISO timestamp" };
      }
      from = argv[i];
    } else if (arg === "--through") {
      i++;
      if (i >= argv.length || argv[i].startsWith("--")) {
        return { ok: false, code: "C1S-SHAPE", error: "--through requires an ISO timestamp" };
      }
      through = argv[i];
    } else if (arg === "--feature") {
      i++;
      if (i >= argv.length || argv[i].startsWith("--")) {
        return { ok: false, code: "C1S-SHAPE", error: "--feature requires an ID" };
      }
      feature = argv[i];
    } else if (arg === "--package") {
      i++;
      if (i >= argv.length || argv[i].startsWith("--")) {
        return { ok: false, code: "C1S-SHAPE", error: "--package requires an ID" };
      }
      packageId = argv[i];
    } else if (arg === "--dispatch") {
      i++;
      if (i >= argv.length || argv[i].startsWith("--")) {
        return { ok: false, code: "C1S-SHAPE", error: "--dispatch requires an ID" };
      }
      dispatchId = argv[i];
    } else if (arg === "--format") {
      i++;
      if (i >= argv.length || argv[i].startsWith("--")) {
        return { ok: false, code: "C1S-SHAPE", error: "--format requires a format value" };
      }
      format = argv[i];
    } else {
      return { ok: false, code: "C1S-SHAPE", error: `unrecognized argument: ${arg}` };
    }
  }

  if (help) {
    return { ok: true, help: true };
  }

  if (!root || typeof root !== "string" || root.trim() === "") {
    return { ok: false, code: "C1S-SHAPE", error: "--root is required" };
  }

  if (format !== "json" && format !== "text") {
    return { ok: false, code: "C1S-SHAPE", error: '--format must be "json" or "text"' };
  }

  if (feature !== null && !isValidId(feature)) {
    return { ok: false, code: "C1S-SHAPE", error: "invalid feature ID" };
  }
  if (packageId !== null && !isValidId(packageId)) {
    return { ok: false, code: "C1S-SHAPE", error: "invalid package ID" };
  }
  if (dispatchId !== null && !isValidId(dispatchId)) {
    return { ok: false, code: "C1S-SHAPE", error: "invalid dispatch ID" };
  }

  let fromIso = null;
  if (from !== null) {
    if (!isValidIso(from)) {
      return { ok: false, code: "C1S-SHAPE", error: "invalid --from ISO timestamp" };
    }
    fromIso = normalizeIso(from);
  }

  let throughIso = null;
  if (through !== null) {
    if (!isValidIso(through)) {
      return { ok: false, code: "C1S-SHAPE", error: "invalid --through ISO timestamp" };
    }
    throughIso = normalizeIso(through);
  }

  if (fromIso !== null && throughIso !== null && fromIso > throughIso) {
    return { ok: false, code: "C1S-SHAPE", error: "--from must precede or equal --through" };
  }

  return {
    ok: true,
    help: false,
    options: {
      root,
      from: fromIso,
      through: throughIso,
      feature,
      packageId,
      dispatchId,
      format,
    },
  };
}

export function formatDeterministicTextReport({ snapshot, aggregate }) {
  const lines = [
    "=== Interruption Report (local) ===",
    `Schema: ${LOCAL_REPORT_SCHEMA}`,
    `Store ID: ${snapshot.storeId}`,
    `Window: ${snapshot.window.start.value ?? "unknown"} .. ${snapshot.window.end.value ?? "unknown"}`,
    `Scope: feature=${snapshot.scope.featureId ?? "any"}, package=${snapshot.scope.packageId ?? "any"}, dispatch=${snapshot.scope.dispatchId ?? "any"}`,
    `Coverage: receipts=${snapshot.coverage.receipts}, followup=${snapshot.coverage.followup}`,
    "",
    "Totals:",
    `  Events: ${aggregate.totals.eventCount.value} (${aggregate.totals.eventCount.status})`,
    `  Episodes: ${aggregate.totals.episodeCount.value} (${aggregate.totals.episodeCount.status})`,
    `  Resolved: ${aggregate.totals.resolvedCount.value} (${aggregate.totals.resolvedCount.status})`,
    `  Unresolved: ${aggregate.totals.unresolvedCount.value} (${aggregate.totals.unresolvedCount.status})`,
    `  Terminal: ${aggregate.totals.terminalCount.value} (${aggregate.totals.terminalCount.status})`,
    `  Skipped: ${aggregate.totals.skippedCount.value} (${aggregate.totals.skippedCount.status})`,
    `  Unavailable: ${aggregate.totals.unavailableCount.value} (${aggregate.totals.unavailableCount.status})`,
    `  Unknown: ${aggregate.totals.unknownCount.value} (${aggregate.totals.unknownCount.status})`,
    `  Unassessed: ${aggregate.totals.unassessedCount.value} (${aggregate.totals.unassessedCount.status})`,
    "",
    "Categories:",
  ];
  if (!aggregate.categoryRanking || aggregate.categoryRanking.length === 0) {
    lines.push("  (none)");
  } else {
    for (const cat of aggregate.categoryRanking) {
      lines.push(`  - ${cat.category}: ${cat.episodeCount.value} (${cat.episodeCount.status}) episodes, ${cat.repeatCount.value} (${cat.repeatCount.status}) repeats`);
    }
  }
  return lines.join("\n") + "\n";
}

export function generateInterruptionReport(options, ports = productionPorts) {
  const { root, from, through, feature, packageId, dispatchId, format } = options;

  let store;
  try {
    store = ports.storeFactory({ root });
  } catch {
    return { ok: false, code: "C1S-SHAPE" };
  }

  const window = {
    start: { value: from ?? null, status: from ? "measured" : "unknown" },
    end: { value: through ?? null, status: through ? "measured" : "unknown" },
  };
  const scope = {
    featureId: feature ?? null,
    packageId: packageId ?? null,
    dispatchId: dispatchId ?? null,
  };

  let snapResult;
  try {
    snapResult = store.readSnapshot({ window, scope });
  } catch {
    return { ok: false, code: "C1S-IO" };
  }

  let snapshot;
  if (snapResult?.ok === true && snapResult.snapshot) {
    const rawReceipts = snapResult.snapshot.receipts;
    const filteredReceipts = rawReceipts.filter((receipt) => {
      if (feature !== null && receipt.scope?.featureId !== feature) return false;
      if (packageId !== null && receipt.scope?.packageId !== packageId) return false;
      if (dispatchId !== null && receipt.scope?.dispatchId !== dispatchId) return false;
      if (from !== null && receipt.observedThroughAt?.value !== null && receipt.observedThroughAt.value < from) return false;
      if (through !== null && receipt.observedThroughAt?.value !== null && receipt.observedThroughAt.value > through) return false;
      return true;
    });
    filteredReceipts.sort((a, b) => a.eventId.localeCompare(b.eventId));
    snapshot = {
      ...snapResult.snapshot,
      window,
      scope,
      receipts: filteredReceipts,
    };
    snapshot.snapshotSha256 = sha256(Buffer.from(canonicalInvocationJson(snapshot), "utf8"));
  } else {
    if (snapResult?.code && ["C1S-NOT-FOUND", "C1S-ROOT", "C1S-LOCKED", "C1S-PLATFORM", "C1S-IO"].includes(snapResult.code)) {
      return { ok: false, code: snapResult.code };
    }

    const storeCommitPath = join(root, "evidence/interruption-collection/store/commit.json");
    const storeMetaPath = join(root, "evidence/interruption-collection/store/metadata.json");
    const lockPath = join(root, "evidence/interruption-collection/.writer-lock");

    let lockExists = false;
    try {
      lockExists = ports.io.existsSync(lockPath);
    } catch {
      return { ok: false, code: "C1S-IO" };
    }
    if (lockExists) {
      return { ok: false, code: "C1S-LOCKED" };
    }

    let hasStoreCommit = false;
    try {
      hasStoreCommit = ports.io.existsSync(storeCommitPath);
    } catch {
      return { ok: false, code: "C1S-IO" };
    }
    if (!hasStoreCommit) {
      return { ok: false, code: snapResult?.code || "C1S-NOT-FOUND" };
    }

    let storeMeta;
    let storeCommitBytes;
    try {
      storeMeta = JSON.parse(ports.io.readFileSync(storeMetaPath, "utf8"));
      storeCommitBytes = ports.io.readFileSync(storeCommitPath);
    } catch {
      return { ok: false, code: "C1S-CORRUPT" };
    }
    if (!storeMeta || storeMeta.schema !== "pipeline.interruption-store.v1" || !storeMeta.storeId) {
      return { ok: false, code: "C1S-CORRUPT" };
    }

    const sourceEntries = [
      {
        kind: "store",
        id: "store-definition",
        entrySha256: sha256(storeCommitBytes),
      },
    ];

    const entriesDir = join(root, "evidence/interruption-collection/entries");
    if (ports.io.existsSync(entriesDir)) {
      let entryDirs;
      try {
        entryDirs = ports.io.readdirSync(entriesDir);
      } catch {
        return { ok: false, code: "C1S-IO" };
      }
      for (const dirName of entryDirs) {
        const dirPath = join(entriesDir, dirName);
        const metaPath = join(dirPath, "metadata.json");
        const commitPath = join(dirPath, "commit.json");
        if (ports.io.existsSync(commitPath) && ports.io.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(ports.io.readFileSync(metaPath, "utf8"));
            const commitBytes = ports.io.readFileSync(commitPath);
            if (meta && meta.operationId) {
              sourceEntries.push({
                kind: "operation",
                id: meta.operationId,
                entrySha256: sha256(commitBytes),
              });
            }
          } catch {
            return { ok: false, code: "C1S-CORRUPT" };
          }
        }
      }
    }

    const receiptsDir = join(root, "evidence/interruption-receipts");
    const allReceipts = [];
    const diagnostics = [];
    if (ports.io.existsSync(receiptsDir)) {
      let receiptDirs;
      try {
        receiptDirs = ports.io.readdirSync(receiptsDir);
      } catch {
        return { ok: false, code: "C1S-IO" };
      }
      for (const dirName of receiptDirs) {
        const dirPath = join(receiptsDir, dirName);
        const commitPath = join(dirPath, "commit.json");
        const receiptPath = join(dirPath, "receipt.json");
        if (!ports.io.existsSync(commitPath)) {
          if (!diagnostics.includes("C1S-INCOMPLETE")) diagnostics.push("C1S-INCOMPLETE");
          continue;
        }
        if (!ports.io.existsSync(receiptPath)) {
          return { ok: false, code: "C1S-CORRUPT" };
        }
        let receipt;
        let commitBytes;
        try {
          receipt = JSON.parse(ports.io.readFileSync(receiptPath, "utf8"));
          commitBytes = ports.io.readFileSync(commitPath);
        } catch {
          return { ok: false, code: "C1S-CORRUPT" };
        }
        const val = ports.validateReceipt(receipt, ports.registry);
        if (!val.ok) {
          return { ok: false, code: "C1S-CORRUPT" };
        }
        allReceipts.push(receipt);
        sourceEntries.push({
          kind: "receipt",
          id: receipt.eventId,
          entrySha256: sha256(commitBytes),
        });
      }
    }

    sourceEntries.sort((a, b) => {
      const k = a.kind.localeCompare(b.kind);
      return k !== 0 ? k : a.id.localeCompare(b.id);
    });
    const entrySetSha256 = sha256(Buffer.from(canonicalInvocationJson(sourceEntries), "utf8"));

    const filteredReceipts = allReceipts.filter((receipt) => {
      if (feature !== null && receipt.scope?.featureId !== feature) return false;
      if (packageId !== null && receipt.scope?.packageId !== packageId) return false;
      if (dispatchId !== null && receipt.scope?.dispatchId !== dispatchId) return false;
      if (from !== null && receipt.observedThroughAt?.value !== null && receipt.observedThroughAt.value < from) return false;
      if (through !== null && receipt.observedThroughAt?.value !== null && receipt.observedThroughAt.value > through) return false;
      return true;
    });
    filteredReceipts.sort((a, b) => a.eventId.localeCompare(b.eventId));

    snapshot = {
      schema: SNAPSHOT_SCHEMA,
      storeId: storeMeta.storeId,
      window,
      scope,
      receipts: filteredReceipts,
      coverage: { receipts: "unknown", followup: "unknown" },
      collection: {
        qualification: "unestablished",
        supportedSources: ["critic-dispatch-preflight"],
        unsupportedSourceKinds: [
          "authority-wait",
          "dispatch-observer",
          "guard-observation",
          "lifecycle-boundary",
          "readiness-observer",
          "terminal-decision",
        ],
        diagnostics: diagnostics.sort(),
        entrySetSha256,
      },
      sourceEntries,
    };
    snapshot.snapshotSha256 = sha256(Buffer.from(canonicalInvocationJson(snapshot), "utf8"));
  }

  let aggResult;
  try {
    aggResult = ports.aggregate({
      receipts: snapshot.receipts,
      window: snapshot.window,
      coverage: snapshot.coverage,
    }, ports.registry);
  } catch {
    return { ok: false, code: "C1S-AGGREGATE" };
  }

  if (!aggResult.ok) {
    return { ok: false, code: "C1S-AGGREGATE" };
  }

  const aggregate = aggResult.aggregate;
  const report = {
    schema: LOCAL_REPORT_SCHEMA,
    snapshot,
    aggregate,
  };

  const output = format === "text"
    ? formatDeterministicTextReport({ snapshot, aggregate })
    : `${JSON.stringify(report, null, 2)}\n`;

  return { ok: true, format, output, report };
}

export function main(argv = process.argv.slice(2), ports = productionPorts) {
  try {
    const parsed = parseReportInterruptionsArgs(argv);
    if (!parsed.ok) {
      process.stderr.write(`${JSON.stringify({ schema: REPORT_RESULT_SCHEMA, status: "rejected", code: parsed.code })}\n`);
      process.exitCode = 2;
      return 2;
    }

    if (parsed.help) {
      process.stdout.write("Usage: report-interruptions.mjs --root ROOT [--from ISO] [--through ISO] [--feature ID] [--package ID] [--dispatch ID] [--format json|text]\n");
      process.exitCode = 0;
      return 0;
    }

    const result = generateInterruptionReport(parsed.options, ports);
    if (!result.ok) {
      process.stderr.write(`${JSON.stringify({ schema: REPORT_RESULT_SCHEMA, status: "rejected", code: result.code })}\n`);
      process.exitCode = 2;
      return 2;
    }

    process.stdout.write(result.output);
    process.exitCode = 0;
    return 0;
  } catch {
    process.stderr.write(`${JSON.stringify({ schema: REPORT_RESULT_SCHEMA, status: "rejected", code: "C1S-IO" })}\n`);
    process.exitCode = 2;
    return 2;
  }
}

if (isDirectInvocation(import.meta.url)) main(process.argv.slice(2));
