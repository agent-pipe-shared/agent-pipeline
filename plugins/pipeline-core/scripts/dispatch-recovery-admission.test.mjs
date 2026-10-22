// SPDX-License-Identifier: SUL-1.0
/**
 * Guard admission of the dispatch recovery verb (AC-245, D139). Green only with the protected admission applied
 * (lib/guard/constants.mjs DISPATCH_RECOVERY_SCRIPT + lib/guard/command-catalogue.mjs sanctionedDispatchRecoveryArgs);
 * the file documents the contract. Suite name for registration (an operator step): dispatch-recovery-admission.
 */
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { isSanctionedLifecycleCommand } from "../lib/guard/command-catalogue.mjs";

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
const script = resolve(root, "plugins/pipeline-core/scripts/dispatch-recovery.mjs");
const run = (args) => isSanctionedLifecycleCommand(`node '${script}' ${args}`, root);
const base = (verb) => `${verb} --root '${root}'`;

test("the three exact argv shapes are admitted", () => {
  assert.equal(run(`${base("inspect")} --dispatch-id task-1`), true);
  assert.equal(run(`${base("clear")} --dispatch-id task-1`), true);
  assert.equal(run(`${base("clear")} --dispatch-id task-1 --discard-corrupt`), true);
  assert.equal(run(`${base("record")} --packet scratch/p.json --result scratch/r.json`), true);
  assert.equal(run(`${base("record")} --packet scratch/p.json --result evidence/r.json --expected-attempts 2`), true);
});

test("every other shape stays refused", () => {
  const refused = [
    "",
    `inspect --root '${root}/x' --dispatch-id task-1`,
    `${base("inspect")}`,
    `${base("inspect")} --dispatch-id ../x`,
    `${base("inspect")} --dispatch-id task-1 --extra`,
    `${base("clear")} --dispatch-id task-1 --force`,
    `${base("record")} --packet /etc/passwd --result scratch/r.json`,
    `${base("record")} --packet scratch/../p.json --result scratch/r.json`,
    `${base("record")} --packet scratch/p.json --result scratch/r.json --expected-attempts -1`,
    `${base("record")} --result scratch/r.json --packet scratch/p.json`,
    `${base("frobnicate")} --dispatch-id task-1`,
  ];
  for (const args of refused) assert.equal(run(args), false, args);
  assert.equal(isSanctionedLifecycleCommand(`node '${script}'`, root), false);
});
