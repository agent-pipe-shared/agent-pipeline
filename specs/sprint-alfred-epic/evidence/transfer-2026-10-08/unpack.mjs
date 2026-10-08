// Restores the bundled git-ignored working material: node specs/sprint-alfred-epic/evidence/transfer-2026-10-08/unpack.mjs
// Writes each bundled file to its original repository-relative path; never overwrites an existing file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1"));
const repo = process.cwd();
let written = 0, kept = 0;
for (const name of ["bundle-scratch.json", "bundle-evidence.json"]) {
  const bundle = JSON.parse(readFileSync(join(here, name), "utf8"));
  for (const [rel, text] of Object.entries(bundle.files)) {
    if (rel.includes("..") || !/^(scratch|evidence)\//u.test(rel)) throw new Error(`unsafe path ${rel}`);
    const dst = join(repo, ...rel.split("/"));
    if (existsSync(dst)) { kept += 1; continue; }
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, text);
    written += 1;
  }
}
console.log(JSON.stringify({ written, keptExisting: kept }));
