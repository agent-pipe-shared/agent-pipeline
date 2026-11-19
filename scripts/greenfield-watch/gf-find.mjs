// SPDX-License-Identifier: SUL-1.0
// Tracked source of a greenfield watch tool (docs/operating-tools.md, section "Greenfield watch"). Reads runner transcripts, never writes to a project.
// Read-only: list runner transcript files touched within the last N minutes (default 180). Names, size and mtime only, never content.
// usage: node scripts/greenfield-watch/gf-find.mjs [minutes]
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const minutes = Number(process.argv[2] ?? 180);
const since = Date.now() - minutes * 60_000;
// Homes: this WSL home plus every Windows profile visible under /mnt/c/Users (Claude Code runs under Windows, Antigravity and this Elephant under WSL).
const homes = [homedir()];
try { for (const u of readdirSync("/mnt/c/Users")) if (!/^(Public|Default|All Users|Default User|desktop\.ini)/u.test(u)) homes.push(join("/mnt/c/Users", u)); } catch { /* no Windows mount */ }
const roots = [];
for (const h of homes) {
  const where = h === homedir() ? "wsl" : "win";
  roots.push(
    { runner: `claude/${where}`, dir: join(h, ".claude", "projects"), skip: /model-probe|pipeline-test-tmp|pipeline-verify-tmp/u },
    { runner: `codex/${where}`, dir: join(h, ".codex", "sessions"), skip: null },
    { runner: `antigravity/${where}`, dir: join(h, ".gemini"), skip: /node_modules|[\\/]tmp[\\/]/u },
  );
}
function walk(dir, skip, depth, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (skip && skip.test(p)) continue;
    if (e.isDirectory()) { if (depth < 9) walk(p, skip, depth + 1, out); continue; }
    if (!/\.jsonl$/u.test(e.name)) continue;
    try { const s = statSync(p); if (s.mtimeMs >= since) out.push({ p, size: s.size, mtime: new Date(s.mtimeMs).toISOString() }); } catch { /* gone */ }
  }
}
for (const r of roots) {
  const out = [];
  walk(r.dir, r.skip, 0, out);
  out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  console.log(`== ${r.runner}: ${out.length} file(s) in the last ${minutes} min`);
  for (const f of out.slice(0, 15)) console.log(`${f.mtime} ${String(f.size).padStart(9)} ${f.p}`);
}
