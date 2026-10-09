// Elephant (handover 2026-10-09): copy the ignored intermediate results a fresh clone needs into a tracked folder,
// redacting host-specific paths, and write an index. Usage: node scratch/dispatch/elephant/persist-handover.mjs
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";

const ROOT = process.cwd();
const DEST = "specs/sprint-alfred-epic/evidence/handover-2026-10-09";
const MAX = 1_500_000; // bytes per file; larger files are listed, not copied
const SOURCES = [
  { dir: "evidence", filter: (p) => /20261009/.test(p) },
  { dir: "scratch/briefings", filter: (p) => /CONT(17|18|35|36)-20261009\.md$/.test(p) },
  { dir: "scratch/dispatch/elephant", filter: () => true },
  { dir: "scratch/dispatch-wip/CRITIC-RULE-2b", filter: (p) => /\.mjs$/.test(p) },
  { dir: "scratch/dispatch-wip/MECH-HAIKU-F", filter: (p) => /\.mjs$/.test(p) },
  { dir: "scratch/dispatch-wip/WIN-AP-S5-D", filter: () => true },
  { dir: "scratch/dispatch-wip", filter: (p) => /(f3a-m2|m2-record)\.mjs$/.test(p), shallow: true },
  { dir: "scratch/commit-msg", filter: (p) => /MECH-HAIKU-F\.txt$/.test(p) },
];

const home = process.env.USERPROFILE || process.env.HOME || "";
const rootFwd = ROOT.replace(/\\/g, "/");
const drive = rootFwd.match(/^([A-Za-z]):/)?.[1]?.toLowerCase();
const rootNoDrive = rootFwd.replace(/^[A-Za-z]:/, "");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REPLACEMENTS = [
  [new RegExp(esc(ROOT), "gi"), "<repo-root>"],
  [new RegExp(esc(rootFwd), "gi"), "<repo-root>"],
  ...(drive ? [[new RegExp(esc(`/mnt/${drive}${rootNoDrive}`), "gi"), "<repo-root-in-wsl>"],
               [new RegExp(esc(`/${drive}${rootNoDrive}`), "gi"), "<repo-root>"]] : []),
  ...(home ? [[new RegExp(esc(home), "gi"), "<home>"], [new RegExp(esc(home.replace(/\\/g, "/")), "gi"), "<home>"]] : []),
  [/<home>[\\/][^\s"'`)\]]*/g, "<home-path>"],
  [/\b(?:AppData|Local[\\/]Temp)[\\/][^\s"'`)\]]*/g, "<host-temp-path>"],
  [/\/home\/[A-Za-z0-9._-]+/g, "<wsl-home>"],
  [/\b[A-Za-z]:\\(?:Users|Dev)\\[^\s"'`)\]]*/g, "<host-path>"],
  [/\b[A-Za-z]:\/(?:Users|Dev)\/[^\s"'`)\]]*/g, "<host-path>"],
];
const redact = (t) => REPLACEMENTS.reduce((s, [re, to]) => s.replace(re, to), t);

function walk(dir, shallow) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!shallow) out.push(...walk(p, false)); }
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const index = [];
for (const s of SOURCES) {
  for (const abs of walk(join(ROOT, s.dir), s.shallow)) {
    const rel = relative(ROOT, abs).split(sep).join("/");
    if (!s.filter(rel)) continue;
    const size = statSync(abs).size;
    if (size > MAX) { index.push(`- \`${rel}\` — ${size} bytes, NOT copied (over cap)`); continue; }
    const target = join(ROOT, DEST, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, redact(readFileSync(abs, "utf8")));
    index.push(`- \`${DEST}/${rel}\` ← \`${rel}\` (${size} bytes)`);
  }
}
writeFileSync(join(ROOT, DEST, "INDEX.md"),
  `# Handover 2026-10-09 — persisted intermediate results\n\nCopies of ignored files (\`evidence/\`, \`scratch/\`) so a fresh clone (WSL) has them. Host paths are redacted\n(\`<repo-root>\`, \`<repo-root-in-wsl>\`, \`<home-path>`, \`<wsl-home>\`, \`<host-path>\`). Original path on the right.\nScripts that read their siblings by relative path must be copied back to their original location before use.\n\n${index.join("\n")}\n`);
console.log(`${index.length} entries → ${DEST}/INDEX.md`);
