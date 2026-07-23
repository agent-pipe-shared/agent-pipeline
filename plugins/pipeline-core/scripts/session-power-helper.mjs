#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Fixed Linux systemd-inhibit payload: it exits on controller loss/mismatch. */
import { readLinuxProcessIdentity, SESSION_POWER_LEASE_SECONDS } from "../lib/session-power.mjs";
import { pathToFileURL } from "node:url";

function parse(argv) {
  if (argv.length !== 6 || argv[0] !== "--controller-pid" || argv[2] !== "--controller-start" || argv[4] !== "--lease-seconds") throw new Error("fixed helper arguments are invalid");
  const pid = Number(argv[1]);
  if (!Number.isSafeInteger(pid) || pid < 1 || argv[5] !== String(SESSION_POWER_LEASE_SECONDS)) throw new Error("fixed helper arguments are invalid");
  return { pid, start: argv[3] };
}

function ownerIsExact(owner) {
  try { return readLinuxProcessIdentity(owner.pid).start === owner.start; } catch { return false; }
}

function main(argv = process.argv.slice(2)) {
  const owner = parse(argv);
  if (!ownerIsExact(owner)) return 3;
  const until = Date.now() + SESSION_POWER_LEASE_SECONDS * 1_000;
  setInterval(() => { if (Date.now() >= until || !ownerIsExact(owner)) process.exit(0); }, 2_000);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
export { main, ownerIsExact, parse };
