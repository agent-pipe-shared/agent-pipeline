// SPDX-License-Identifier: SUL-1.0
// Purpose: cut the six reader input files for one delivery-matrix remeasure round (29 item rows per batch plus the commits since the last measurement).
// Usage:   node scripts/delivery-remeasure-inputs.mjs --base <sha> --prev <snapshot.json> --previous-inputs <method-dir> --out <dir> [--head <rev>] [--root <dir>]
//          node scripts/delivery-remeasure-inputs.mjs --check --previous-inputs <method-dir> --out <dir> [--root <dir>]
//          Run from the repository root. Every path argument is relative to --root (default "."), so a clone can be addressed with --root.
// Inputs:  --base      the commit of the last measurement; commits in <base>..<head> are the new evidence (head default: HEAD).
//          --prev      the last round's snapshot.json; its rows give stageBaseline (stage) and reasonBaseline (reason) per item.
//          --previous-inputs  the last round's method/ folder; its input-0N.json files fix batch membership and row order.
//          backlog/items/*-<id>.md for the item files a commit may have changed.
// Output:  <out>/input-01.json .. input-06.json, each { base, unmappedCommits, rows } with rows { itemId, stageBaseline, reasonBaseline, mappedCommits }.
//          mappedCommits = commits whose message names the item id (without the "pipeline." prefix) or that changed the item's backlog file.
//          unmappedCommits = every other commit in <base>..<head> with its Dispatch trailer value(s), oldest first (identical in all six files).
//          It prints the commit counts and the item-count check, then exits 1 if the check fails.
// Data:    git history and the previous round's evidence folder. Read-only toward the repository; writes only into <out>.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const root = opt("root", ".");
const at = (p) => join(root, p);
const previousInputs = opt("previous-inputs");
const outDir = opt("out");
const BATCHES = 6;
const ROWS_PER_BATCH = 29;
const batchName = (n) => `input-${String(n).padStart(2, "0")}.json`;
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function usage(message) {
  console.error(`${message}\nusage: node scripts/delivery-remeasure-inputs.mjs --base <sha> --prev <snapshot.json> --previous-inputs <method-dir> --out <dir> [--head <rev>] [--root <dir>]\n       node scripts/delivery-remeasure-inputs.mjs --check --previous-inputs <method-dir> --out <dir> [--root <dir>]`);
  process.exit(2);
}

// Item-count check: every itemId of the previous inputs exactly once, six batches of 29, valid keys.
function check() {
  const problems = [];
  const expected = [];
  const found = [];
  let total = 0;
  for (let n = 1; n <= BATCHES; n++) {
    let old;
    let cur;
    try {
      old = readJson(join(at(previousInputs), batchName(n)));
      cur = readJson(join(at(outDir), batchName(n)));
    } catch (e) {
      problems.push(`${batchName(n)}: ${e.message}`);
      continue;
    }
    if (JSON.stringify(Object.keys(cur)) !== JSON.stringify(Object.keys(old))) problems.push(`${batchName(n)}: top-level keys differ`);
    if (cur.rows.length !== ROWS_PER_BATCH) problems.push(`${batchName(n)}: ${cur.rows.length} rows, expected ${ROWS_PER_BATCH}`);
    old.rows.forEach((r) => expected.push(r.itemId));
    cur.rows.forEach((r) => {
      found.push(r.itemId);
      if (JSON.stringify(Object.keys(r)) !== JSON.stringify(Object.keys(old.rows[0]))) problems.push(`${batchName(n)}: row keys differ for ${r.itemId}`);
    });
    if (cur.rows.map((r) => r.itemId).join() !== old.rows.map((r) => r.itemId).join()) problems.push(`${batchName(n)}: membership or order differs from the previous batch`);
    total += cur.rows.length;
  }
  const seen = new Set(found);
  if (seen.size !== found.length) problems.push("duplicate itemId across batches");
  for (const id of expected) if (!seen.has(id)) problems.push(`missing ${id}`);
  console.log(`item-count check: ${total} items in ${BATCHES} batches of ${ROWS_PER_BATCH}, ${seen.size} distinct, ${problems.length === 0 ? "OK" : `${problems.length} problem(s)`}`);
  for (const p of problems) console.log(`  ${p}`);
  return problems.length === 0;
}

if (!previousInputs || !outDir) usage("--previous-inputs and --out are required");
if (flag("check")) process.exit(check() ? 0 : 1);

const base = opt("base");
const prev = opt("prev");
const head = opt("head", "HEAD");
if (!base || !prev) usage("--base and --prev are required");

// Commits oldest first: short sha, subject, body, then the changed paths.
const SEP_REC = "\u001e";
const SEP_FIELD = "\u001f";
const raw = execFileSync("git", ["-C", root, "log", "--reverse", "--abbrev=9", "--name-only", `--format=${SEP_REC}%h${SEP_FIELD}%s${SEP_FIELD}%b${SEP_FIELD}`, `${base}..${head}`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const commits = raw.split(SEP_REC).filter((r) => r.trim() !== "").map((rec) => {
  const [sha, subject, body, files] = rec.split(SEP_FIELD);
  const dispatch = [...body.matchAll(/^Dispatch:\s*(\S+)/gm)].map((m) => m[1]);
  return { sha, subject, message: `${subject}\n${body}`, dispatch, files: files.split("\n").map((f) => f.trim()).filter(Boolean) };
});

const backlogFiles = readdirSync(at("backlog/items")).filter((f) => f.endsWith(".md"));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const shortId = (itemId) => itemId.replace(/^pipeline\./, "");
const mappedFor = (itemId) => {
  const id = shortId(itemId);
  const mention = new RegExp(`(?<![A-Za-z0-9-])${escape(id)}(?![A-Za-z0-9-])`);
  const itemFile = backlogFiles.filter((f) => f.endsWith(`-${id}.md`)).map((f) => `backlog/items/${f}`);
  return commits.filter((c) => mention.test(c.message) || c.files.some((f) => itemFile.includes(f)));
};

const snapshot = readJson(at(prev));
const snapRow = new Map(snapshot.rows.map((r) => [r.itemId, r]));
const mappedShas = new Set();
const batches = [];
for (let n = 1; n <= BATCHES; n++) {
  const old = readJson(join(at(previousInputs), batchName(n)));
  const rows = old.rows.map((r) => {
    const s = snapRow.get(r.itemId);
    if (!s) throw new Error(`${r.itemId} is not in ${prev}`);
    const mapped = mappedFor(r.itemId);
    mapped.forEach((c) => mappedShas.add(c.sha));
    return { itemId: r.itemId, stageBaseline: s.stage, reasonBaseline: s.reason, mappedCommits: mapped.map((c) => ({ sha: c.sha, subject: c.subject })) };
  });
  batches.push({ old, rows });
}
const unmappedCommits = commits.filter((c) => !mappedShas.has(c.sha)).map((c) => ({ sha: c.sha, subject: c.subject, dispatch: c.dispatch }));

mkdirSync(at(outDir), { recursive: true });
batches.forEach(({ rows }, i) => {
  writeFileSync(join(at(outDir), batchName(i + 1)), `${JSON.stringify({ base, unmappedCommits, rows }, null, 1)}\n`);
});
console.log(`range ${base}..${head}: ${commits.length} commits, ${mappedShas.size} mapped to at least one item, ${unmappedCommits.length} unmapped`);
batches.forEach(({ rows }, i) => console.log(`  ${batchName(i + 1)}: ${rows.length} items, ${rows.filter((r) => r.mappedCommits.length).length} with mapped commits, ${rows.reduce((a, r) => a + r.mappedCommits.length, 0)} mapping links`));
process.exit(check() ? 0 : 1);
