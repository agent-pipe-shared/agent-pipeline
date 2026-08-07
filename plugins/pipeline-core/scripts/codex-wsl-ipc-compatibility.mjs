#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyProfile,
  planProfile,
  runFixedIpcProbe,
} from "../lib/wsl-ipc-compatibility.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, (key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map((child) => [child, entry[child]]))
  : entry, 2)}\n`;

function output(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = code;
}

function exactArgs(argv, valueNames, booleanNames = new Set()) {
  const values = {};
  const booleans = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (typeof raw !== "string" || !raw.startsWith("--")) return null;
    const name = raw.slice(2);
    if (booleanNames.has(name)) {
      if (Object.hasOwn(booleans, name)) return null;
      booleans[name] = true;
      continue;
    }
    if (!valueNames.has(name) || Object.hasOwn(values, name)) return null;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) return null;
    values[name] = value;
    index += 1;
  }
  return { values, booleans };
}

function readJson(path) {
  const raw = readFileSync(path, "utf8");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("typed JSON input invalid");
  return value;
}

function probeBinding(path) {
  const value = readJson(path);
  const receipt = value.schema === "pipeline.codex-wsl-ipc-probe.v1" ? value.receipt : value;
  const receiptSha256 = value.receiptSha256 ?? sha256(canonical(receipt));
  return { receipt, receiptSha256 };
}

function profileInputs(values) {
  const codexHome = values["codex-home"];
  const configPath = join(codexHome, "config.toml");
  if (!existsSync(configPath)) throw new Error("Codex config is unavailable");
  const configBytes = readFileSync(configPath, "utf8");
  const probe = probeBinding(values["probe-receipt"]);
  return {
    configBytes,
    codexHome,
    configPath,
    codexPath: values.codex,
    probeReceipt: probe.receipt,
    probeReceiptSha256: probe.receiptSha256,
    approvalActor: values.actor,
  };
}

const [command, ...argv] = process.argv.slice(2);

try {
  if (command === "probe") {
    const parsed = exactArgs(argv, new Set(["scratch", "identity"]));
    if (!parsed || !parsed.values.scratch || !parsed.values.identity) throw new Error("probe requires exact --scratch and --identity arguments");
    const identity = readJson(parsed.values.identity);
    const result = await runFixedIpcProbe({
      scratchRoot: parsed.values.scratch,
      canaryPath: SCRIPT,
      identity,
    });
    output(result, result.status === "unavailable" ? 2 : 0);
  } else if (command === "plan-profile") {
    const parsed = exactArgs(argv, new Set(["codex-home", "codex", "probe-receipt", "actor"]));
    if (!parsed || !parsed.values["codex-home"] || !parsed.values.codex || !parsed.values["probe-receipt"] || !parsed.values.actor) throw new Error("plan-profile arguments invalid");
    const plan = planProfile(profileInputs(parsed.values));
    if (plan.planSha256) {
      plan.nextAction = {
        executable: process.execPath,
        argv: [
          SCRIPT,
          "apply-profile",
          "--codex-home", parsed.values["codex-home"],
          "--codex", parsed.values.codex,
          "--probe-receipt", parsed.values["probe-receipt"],
          "--plan-sha256", plan.planSha256,
          "--actor", parsed.values.actor,
          "--activate",
        ],
        mutation: true,
        requiresConfirmation: true,
        expected: { schema: "pipeline.codex-wsl-ipc-profile-apply.v1", statuses: ["applied"] },
      };
    }
    output(plan, plan.planSha256 ? 0 : 2);
  } else if (command === "apply-profile") {
    const parsed = exactArgs(
      argv,
      new Set(["codex-home", "codex", "probe-receipt", "plan-sha256", "actor"]),
      new Set(["activate"]),
    );
    if (!parsed || !parsed.booleans.activate || !parsed.values["plan-sha256"] || !parsed.values.actor) throw new Error("apply-profile arguments invalid");
    const inputs = profileInputs(parsed.values);
    const plan = planProfile(inputs);
    const result = applyProfile(plan, {
      configBytes: inputs.configBytes,
      planSha256: parsed.values["plan-sha256"],
      confirmed: true,
      write: true,
      actor: parsed.values.actor,
      probeReceipt: inputs.probeReceipt,
      probeReceiptSha256: inputs.probeReceiptSha256,
    });
    output(result, result.status === "applied" ? 0 : 2);
  } else {
    output({
      schema: "pipeline.codex-wsl-ipc-compatibility-cli.v1",
      status: "unsupported-command",
      command: command ?? null,
    }, 2);
  }
} catch (error) {
  output({
    schema: "pipeline.codex-wsl-ipc-compatibility-cli.v1",
    status: "unavailable",
    reason: error instanceof Error ? error.message : "compatibility command failed",
  }, 2);
}
