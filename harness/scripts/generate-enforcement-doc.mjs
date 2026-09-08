#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Generate the user-facing registration reference in docs/enforcement.md.
 *
 * This reads manifest bytes only. It never invokes a hook or infers whether a
 * registered command allows or denies a tool call. The committed document is
 * intentionally byte-pinned by check-doc-contracts.mjs.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../../plugins/pipeline-core/lib/entrypoint.mjs";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ENFORCEMENT_PATH = join(REPO_ROOT, "docs", "enforcement.md");
export const MANIFEST_PATHS = Object.freeze({
  "Claude Code": "plugins/pipeline-core/hooks/hooks.json",
  Codex: "plugins/pipeline-core/hooks/codex-hooks.json",
  Antigravity: "plugins/pipeline-core/hooks.json",
});

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function object(value, path) {
  if (!value || Array.isArray(value) || typeof value !== "object") fail(path, "expected an object");
  return value;
}

function string(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(path, "expected a non-empty string");
  return value;
}

function optionalString(value, path) {
  if (value === undefined) return null;
  return string(value, path);
}

function normalizeMatcher(value, path) {
  if (value === undefined || value === "") return "(all)";
  if (typeof value !== "string") fail(path, "expected a string");
  return value;
}

function sourcePath(rootDir, path) {
  return join(rootDir, path);
}

function readManifest(rootDir, path) {
  let raw;
  try {
    raw = readFileSync(sourcePath(rootDir, path));
  } catch (error) {
    fail(path, `cannot read manifest (${error.code ?? error.message})`);
  }
  try {
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    fail(path, `invalid JSON (${error.message})`);
  }
}

function commandRegistration(runner, event, matcher, hook, path) {
  const value = object(hook, path);
  if (value.type !== undefined && value.type !== "command") fail(`${path}.type`, 'expected "command" when present');
  return {
    runner,
    event,
    matcher,
    command: string(value.command, `${path}.command`),
    commandWindows: optionalString(value.commandWindows, `${path}.commandWindows`),
  };
}

function nestedHooks(runner, manifest, source) {
  const hooks = object(manifest.hooks, `${source}.hooks`);
  const rows = [];
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries) || entries.length === 0) fail(`${source}.hooks.${event}`, "expected a non-empty array");
    for (const [index, entry] of entries.entries()) {
      const item = object(entry, `${source}.hooks.${event}[${index}]`);
      const matcher = normalizeMatcher(item.matcher, `${source}.hooks.${event}[${index}].matcher`);
      if (!Array.isArray(item.hooks) || item.hooks.length === 0) {
        fail(`${source}.hooks.${event}[${index}].hooks`, "expected a non-empty array");
      }
      for (const [hookIndex, hook] of item.hooks.entries()) {
        rows.push(commandRegistration(runner, event, matcher, hook, `${source}.hooks.${event}[${index}].hooks[${hookIndex}]`));
      }
    }
  }
  return rows;
}

function antigravityHooks(manifest, source) {
  const plugin = object(manifest["pipeline-core"], `${source}["pipeline-core"]`);
  const rows = [];
  for (const [event, entries] of Object.entries(plugin)) {
    if (event === "enabled") {
      if (typeof entries !== "boolean") fail(`${source}.pipeline-core.enabled`, "expected a boolean");
      continue;
    }
    if (!Array.isArray(entries) || entries.length === 0) fail(`${source}.pipeline-core.${event}`, "expected a non-empty array");
    for (const [index, entry] of entries.entries()) {
      const item = object(entry, `${source}.pipeline-core.${event}[${index}]`);
      const matcher = normalizeMatcher(item.matcher, `${source}.pipeline-core.${event}[${index}].matcher`);
      if (item.hooks !== undefined) {
        if (!Array.isArray(item.hooks) || item.hooks.length === 0) {
          fail(`${source}.pipeline-core.${event}[${index}].hooks`, "expected a non-empty array");
        }
        for (const [hookIndex, hook] of item.hooks.entries()) {
          rows.push(commandRegistration("Antigravity", event, matcher, hook, `${source}.pipeline-core.${event}[${index}].hooks[${hookIndex}]`));
        }
      } else {
        rows.push(commandRegistration("Antigravity", event, matcher, item, `${source}.pipeline-core.${event}[${index}]`));
      }
    }
  }
  return rows;
}

export function compareEnforcementRegistrations(left, right) {
  // UTF-8 byte order is explicit and independent of the host locale or ICU
  // version. JSON framing prevents an embedded separator from changing tuple
  // boundaries.
  return Buffer.compare(
    Buffer.from(JSON.stringify([left.runner, left.event, left.matcher, left.command, left.commandWindows ?? ""]), "utf8"),
    Buffer.from(JSON.stringify([right.runner, right.event, right.matcher, right.command, right.commandWindows ?? ""]), "utf8"),
  );
}

/** Parse the actual schemas for all three runner manifests. */
export function collectEnforcementRegistrations({ rootDir = REPO_ROOT } = {}) {
  const resolvedRoot = resolve(rootDir);
  const claude = readManifest(resolvedRoot, MANIFEST_PATHS["Claude Code"]);
  const codex = readManifest(resolvedRoot, MANIFEST_PATHS.Codex);
  const antigravity = readManifest(resolvedRoot, MANIFEST_PATHS.Antigravity);
  const manifests = [
    { runner: "Claude Code", path: MANIFEST_PATHS["Claude Code"], parsed: claude },
    { runner: "Codex", path: MANIFEST_PATHS.Codex, parsed: codex },
    { runner: "Antigravity", path: MANIFEST_PATHS.Antigravity, parsed: antigravity },
  ];
  const rows = [
    ...nestedHooks("Claude Code", claude.value, MANIFEST_PATHS["Claude Code"]),
    ...nestedHooks("Codex", codex.value, MANIFEST_PATHS.Codex),
    ...antigravityHooks(antigravity.value, MANIFEST_PATHS.Antigravity),
  ].sort(compareEnforcementRegistrations);
  return {
    rows,
    sources: manifests.map(({ runner, path, parsed }) => ({
      runner,
      path,
      sha256: createHash("sha256").update(parsed.raw).digest("hex"),
    })),
  };
}

export function escapeMarkdownCell(value) {
  // Numeric references keep untrusted manifest text on one physical table row
  // and prevent it from becoming Markdown or HTML syntax when rendered.
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\|/gu, "&#124;")
    .replace(/\x60/gu, "&#96;")
    .replace(/\r/gu, "&#13;")
    .replace(/\n/gu, "&#10;");
}

function sourceLink(path) {
  return `[\`${path}\`](../${path})`;
}

function commandCell(row) {
  const primary = escapeMarkdownCell(row.command);
  return row.commandWindows ? `${primary}; Windows: ${escapeMarkdownCell(row.commandWindows)}` : primary;
}

/** Render the complete, deterministic Markdown document from manifest bytes. */
export function renderEnforcementDocument({ rootDir = REPO_ROOT } = {}) {
  const { rows, sources } = collectEnforcementRegistrations({ rootDir });
  const lines = [];
  const put = (line = "") => lines.push(line);

  put("<!--");
  put("GENERATED FILE — do not edit by hand.");
  put("Produced by: harness/scripts/generate-enforcement-doc.mjs");
  put("Pinned by: harness/scripts/check-doc-contracts.mjs (byte equality).");
  put("-->");
  put();
  put("# Enforcement registrations");
  put();
  put("This page is a reproducible reference to the hook registrations in this source");
  put("checkout. It is for teams that need to inspect which runner event names which");
  put("command before they rely on a documented rail.");
  put();
  put("## What these registrations establish");
  put();
  put("Each derived row below establishes only that the named manifest registers the");
  put("shown command for that runner event and matcher. A registration does not prove");
  put("that a plugin is installed, loaded, enabled for a project, reached by a provider,");
  put("or delivered by a released build. It also does not say that the command blocks:");
  put("allow, deny, advisory, and failure behavior belong to the invoked adapter or guard.");
  put("A Claude Code row is not coverage for Codex or Antigravity.");
  put();
  put("## Derived registrations");
  put();
  put("The table is generated from the current manifest schemas. It deliberately carries");
  put("no hand-maintained guard count or command list.");
  put();
  put("| Runner | Event | Matcher | Registered invocation |");
  put("| --- | --- | --- | --- |");
  for (const row of rows) {
    put(`| ${escapeMarkdownCell(row.runner)} | ${escapeMarkdownCell(row.event)} | ${escapeMarkdownCell(row.matcher)} | ${commandCell(row)} |`);
  }
  put();
  put("## Maintained explanation and limits");
  put();
  put("This section is maintained prose, not a second registration inventory. It is kept");
  put("separate from the derived rows because the manifests describe invocation, while the");
  put("adapter source explains behavior.");
  put();
  put(`- **Direct hooks and native bridges.** Claude Code registers direct hook commands in ${sourceLink(MANIFEST_PATHS["Claude Code"])}. Codex and Antigravity register their own native bridge/wrapper commands in ${sourceLink(MANIFEST_PATHS.Codex)} and ${sourceLink(MANIFEST_PATHS.Antigravity)}; neither registration imports Claude Code coverage into another runner.`);
  put("- **Advisory slicing.** The slicing adapters are expressly advisory: [Codex](../plugins/pipeline-core/hooks/codex-slicing-hint.mjs), [Antigravity](../plugins/pipeline-core/hooks/antigravity-slicing-hint.mjs), and [the Claude Code slicing hook](../plugins/pipeline-core/hooks/guard-slicing.mjs). Their registrations therefore do not establish a blocking rail. The table does not classify any other registered command as blocking.");
  put("- **Missing or unavailable native coverage.** A missing row means only that this source manifest has no matching registration. It does not prove a provider lacks a hook API, that an adapter is absent elsewhere, or that a local installed plugin has the same bytes. Confirm installed delivery and candidate-specific behavior separately.");
  put();
  put("## Source hashes");
  put();
  put("The hashes bind this generated page to the exact manifest bytes it read.");
  put();
  put("| Runner | Manifest | SHA-256 |");
  put("| --- | --- | --- |");
  for (const source of sources) put(`| ${escapeMarkdownCell(source.runner)} | ${sourceLink(source.path)} | \`${source.sha256}\` |`);
  return `${lines.join("\n")}\n`;
}

/** Return byte-drift details without writing the checked document. */
export function checkEnforcementDocument({ rootDir = REPO_ROOT, documentPath = null } = {}) {
  const root = resolve(rootDir);
  const path = documentPath ? resolve(documentPath) : join(root, "docs", "enforcement.md");
  const expected = renderEnforcementDocument({ rootDir: root });
  let actual;
  try {
    actual = readFileSync(path, "utf8");
  } catch (error) {
    return { ok: false, expected, actual: null, reason: `cannot read ${relative(root, path) || path} (${error.code ?? error.message})` };
  }
  return actual === expected
    ? { ok: true, expected, actual }
    : { ok: false, expected, actual, reason: "document bytes differ from a fresh generation" };
}

export function parseEnforcementCliArgs(argv) {
  let action = null;
  let rootDir = REPO_ROOT;
  let rootSupplied = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (["--write", "--check", "--stdout"].includes(item)) {
      if (action !== null) throw new Error("exactly one of --write, --check, or --stdout is required");
      action = item;
      continue;
    }
    if (item === "--root") {
      if (rootSupplied || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error("--root requires exactly one directory value");
      }
      rootDir = argv[index + 1];
      rootSupplied = true;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${item}`);
  }
  if (action === null) throw new Error("exactly one of --write, --check, or --stdout is required");
  return { action, rootDir };
}

function cli(argv) {
  const { action, rootDir } = parseEnforcementCliArgs(argv);
  const root = resolve(rootDir);
  const output = join(root, "docs", "enforcement.md");
  if (action === "--stdout") {
    process.stdout.write(renderEnforcementDocument({ rootDir: root }));
    return 0;
  }
  if (action === "--check") {
    const result = checkEnforcementDocument({ rootDir: root, documentPath: output });
    if (!result.ok) {
      process.stderr.write(`Enforcement document drift: ${result.reason}. Run: node harness/scripts/generate-enforcement-doc.mjs --write\n`);
      return 2;
    }
    process.stdout.write(`Enforcement document valid: docs/enforcement.md (${Buffer.byteLength(result.expected, "utf8")} bytes)\n`);
    return 0;
  }
  const rendered = renderEnforcementDocument({ rootDir: root });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rendered, "utf8");
  process.stdout.write(`wrote docs/enforcement.md (${Buffer.byteLength(rendered, "utf8")} bytes)\n`);
  return 0;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    process.exitCode = cli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`generate-enforcement-doc: ${error.message}\n`);
    process.exitCode = 2;
  }
}
