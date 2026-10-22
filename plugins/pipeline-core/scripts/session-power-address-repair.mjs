#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Repair route for the session-power address root named by the SP-ADDRESS refusal (D71, D72).
//
//   node <plugin-root>/scripts/session-power-address-repair.mjs plan
//   node <plugin-root>/scripts/session-power-address-repair.mjs apply --plan-sha256 <planSha256 from plan>
//
// `plan` is read-only. `apply` moves slots of repositories that no longer exist into
// `<home>/.apsp-aside/<UTC stamp>-<8 hex>/` and reads the result back; nothing is removed.
// The home is always the OS account's home (D72: no redirectable authority path), so this CLI has
// no option, environment variable or argument that selects another one.
// Exit 0 on success, 2 on a typed refusal, 1 on an unexpected failure.
import { realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AddressRepairError, applyAddressRootRepair, planAddressRootRepair } from "../lib/session-power-address-repair.mjs";

const USAGE = "usage: session-power-address-repair.mjs plan | session-power-address-repair.mjs apply --plan-sha256 <64 hex from plan>";

export function parseAddressRepairArgs(argv) {
  const [verb, ...rest] = argv;
  if (verb === "plan" && rest.length === 0) return { verb };
  if (verb === "apply" && rest.length === 2 && rest[0] === "--plan-sha256" && /^[a-f0-9]{64}$/.test(rest[1])) {
    return { verb, planSha256: rest[1] };
  }
  throw new AddressRepairError("ARR-USAGE", USAGE);
}

// The kept and absent-repository rows are already summarised by `counts` and `candidates`; only
// the entries that need a human decision (foreign) are listed again.
function printablePlan(plan) {
  const script = fileURLToPath(import.meta.url);
  return {
    ...plan,
    entries: plan.entries.filter((entry) => entry.class === "foreign"),
    entriesNote: "only foreign entries are listed here; kept and absent-repository rows are counted in counts and named in candidates",
    ...(plan.candidates.length > 0 ? { applyCommand: `node ${script} apply --plan-sha256 ${plan.planSha256}` } : {}),
  };
}

function main(argv) {
  let output;
  let exitCode = 0;
  try {
    const args = parseAddressRepairArgs(argv);
    const home = userInfo().homedir;
    output = args.verb === "plan"
      ? printablePlan(planAddressRootRepair({ home }))
      : applyAddressRootRepair({ home, expectedPlanSha256: args.planSha256 });
  } catch (error) {
    if (error instanceof AddressRepairError) {
      output = { status: "refused", code: error.code, message: error.message, details: error.details };
      exitCode = 2;
    } else {
      output = { status: "failed", code: "ARR-UNEXPECTED", message: String(error?.message ?? error).slice(0, 256) };
      exitCode = 1;
    }
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = exitCode;
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
