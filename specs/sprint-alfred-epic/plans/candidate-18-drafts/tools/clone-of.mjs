// Scratch: make a shared clone of another scratch clone (the applied chain), detached at its HEAD.
// usage: node scratch/agent-out/clone-of.mjs <source clone dir> <new clone dir>
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
const [src, dst] = [resolve(process.argv[2]), resolve(process.argv[3])];
const sh = (args, cwd) => { const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 }); if (r.status !== 0) { console.error(args.join(" "), r.stderr); process.exit(1); } return r.stdout.trim(); };
const head = sh(["rev-parse", "HEAD"], src);
rmSync(dst, { recursive: true, force: true });
sh(["clone", "--shared", "--no-checkout", src, dst], src);
sh(["checkout", "--detach", head], dst);
console.log("clone at", head, "->", dst);
