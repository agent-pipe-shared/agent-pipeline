#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Bounded D1 local-state setup; never launches a worker or reads credentials. */
import { planLocalSupervisorFilesystemRepair, repairLocalSupervisorState, resolveLocalSupervisorRoot } from "../lib/local-supervisor-state.mjs";
const apply = process.argv[2] === "--apply"; const [repositoryFingerprint, candidate, subject] = process.argv.slice(apply ? 3 : 2);
const root = resolveLocalSupervisorRoot({ repositoryFingerprint });
const result = root.ok ? (apply ? repairLocalSupervisorState({ root: root.root, repositoryFingerprint, candidate, subject }) : planLocalSupervisorFilesystemRepair({ root: root.root, repositoryFingerprint, candidate, subject })) : { ok: false, code: root.code, disposition: "unavailable", state: null };
process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.ok ? 0 : 2;
