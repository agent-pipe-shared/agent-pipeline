#!/usr/bin/env node
// Delivery remeasure: folds reader outputs into one dated snapshot and replaces the
// stable current-status pointer. Node built-ins only. Usage:
//   node delivery-remeasure.mjs --date YYYY-MM-DD --head <sha> --previous <snapshot.json>
//        --inputs <dir> [--adjudications <file>] [--out-root <dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute, join, sep } from "node:path";

const STAGES = ["25", "50", "75", "100", "UNKNOWN"];
const READER_STAGES = new Set(["25", "50", "75", "UNKNOWN"]);
const OWNERS = new Set(["agent", "critic", "verify-wsl", "native-host", "po-decision", "po-signature", "po-acceptance"]);

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith("--") || argv[i + 1] === undefined) throw new Error(`bad argument ${k}`);
    a[k.slice(2)] = argv[i + 1];
  }
  for (const req of ["date", "head", "previous", "inputs"]) if (!a[req]) throw new Error(`missing --${req}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new Error("--date must be YYYY-MM-DD");
  return a;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const posix = (p) => p.split(sep).join("/");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const emptyCounts = () => Object.fromEntries(STAGES.map((s) => [s, 0]));
const index = (c, n) => Number(((c["25"] * 25 + c["50"] * 50 + c["75"] * 75 + c["100"] * 100) / n).toFixed(2));
const cell = (v) => String(v ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ");

export function measure(argv) {
  const args = parseArgs(argv);
  const root = resolve(args["out-root"] ?? process.cwd());
  const rel = (p) => {
    const abs = resolve(p);
    const r = relative(root, abs);
    return r.startsWith("..") || isAbsolute(r) ? posix(p) : posix(r);
  };
  const inDir = resolve(args.inputs);
  const names = readdirSync(inDir);
  const outFiles = names.filter((n) => /^out-\d+\.json$/.test(n)).sort();
  const inputIds = [];
  const rows = [];
  for (const o of outFiles) {
    const n = o.slice(4, -5);
    const inFile = join(inDir, `input-${n}.json`);
    if (!existsSync(inFile)) throw new Error(`missing input-${n}.json for ${o}`);
    const input = readJson(inFile);
    for (const r of input.rows ?? []) inputIds.push(r.itemId);
    for (const r of readJson(join(inDir, o))) rows.push({ part: n, ...r });
  }
  for (const n of names.filter((x) => /^input-\d+\.json$/.test(x))) {
    if (!existsSync(join(inDir, `out-${n.slice(6)}`))) {
      for (const r of readJson(join(inDir, n)).rows ?? []) inputIds.push(r.itemId);
    }
  }
  const prevPath = resolve(args.previous);
  const prevBuf = readFileSync(prevPath);
  const prevStage = new Map((JSON.parse(prevBuf.toString("utf8")).rows ?? []).map((r) => [r.itemId, String(r.stage)]));
  const adjudications = args.adjudications ? readJson(resolve(args.adjudications)) : [];

  for (const r of rows) {
    r.readerBaselineStage = String(r.baselineStage);
    r.baselineStage = prevStage.get(r.itemId) ?? String(r.baselineStage);
    r.readerStage = String(r.stage);
    r.stage = String(r.stage);
    const adj = adjudications.find((a) => a.itemId === r.itemId);
    if (adj) { r.stage = String(adj.stage); r.adjudication = adj.basis; }
  }
  const byId = new Map(rows.map((r) => [r.itemId, r]));
  const inputSet = new Set(inputIds);
  const missing = inputIds.filter((id) => !byId.has(id));
  const extra = rows.filter((r) => !inputSet.has(r.itemId)).map((r) => r.itemId);
  const duplicate = rows.filter((r, i) => rows.findIndex((x) => x.itemId === r.itemId) !== i).map((r) => r.itemId);
  const badStage = rows.filter((r) => !READER_STAGES.has(r.stage)).map((r) => r.itemId);
  const badOwner = [];
  const emptyOpen = [];
  for (const r of rows) {
    const open = Array.isArray(r.open) ? r.open : [];
    for (const o of open) if (!OWNERS.has(o?.owner)) badOwner.push({ itemId: r.itemId, owner: o?.owner ?? null });
    if (r.stage !== "100" && open.length === 0) emptyOpen.push(r.itemId);
  }
  const integrity = { missing, extra, duplicate, badStage, badOwner, emptyOpen };
  if (Object.values(integrity).some((v) => v.length > 0)) {
    const err = new Error("integrity failure");
    err.integrity = integrity;
    throw err;
  }

  const total = inputIds.length;
  const count = (key) => {
    const c = emptyCounts();
    for (const id of inputIds) { const s = String(byId.get(id)[key]); c[STAGES.includes(s) ? s : "UNKNOWN"]++; }
    return c;
  };
  const was = count("baselineStage");
  const now = count("stage");
  const moves = rows.filter((r) => r.stage !== r.baselineStage)
    .map((r) => ({ itemId: r.itemId, from: r.baselineStage, to: r.stage, reason: r.reason }));
  const openByOwner = {};
  for (const r of rows) for (const o of r.open) openByOwner[o.owner] = (openByOwner[o.owner] ?? 0) + 1;

  const dirRel = `specs/sprint-alfred-epic/evidence/delivery-remeasure-${args.date}`;
  const dir = join(root, dirRel);
  const snapshot = {
    schema: "pipeline.alfred-delivery-snapshot.v1",
    measuredAt: args.date,
    head: args.head,
    previous: { path: rel(prevPath), sha256: sha256(prevBuf) },
    method: "read-only readers over the previous snapshot's stage meanings; no tests rerun; reader outputs adjudicated, 100 never accepted from a reader",
    total,
    baseline: { counts: was, index: index(was, total) },
    current: { counts: now, index: index(now, total) },
    integrity,
    moves,
    openByOwner,
    rows,
  };
  const json = JSON.stringify(snapshot, null, 2) + "\n";
  const snapSha = sha256(json);

  const md = [
    `# Delivery remeasure, ${args.date}`,
    "",
    `HEAD: \`${args.head}\`. Items: ${total}. Snapshot SHA256: \`${snapSha}\`. Previous: \`${snapshot.previous.path}\`.`,
    "",
    "Engineering progress, not acceptance.",
    "",
    "| Stage | Previous | Now |",
    "|---|---:|---:|",
    ...STAGES.map((s) => `| ${s} | ${was[s]} | ${now[s]} |`),
    `| Index | ${snapshot.baseline.index.toFixed(2)}% | ${snapshot.current.index.toFixed(2)}% |`,
    "",
    "## Moves",
    "",
    "| Item | From | To | Reason |",
    "|---|---|---|---|",
    ...moves.map((m) => `| ${m.itemId} | ${m.from} | ${m.to} | ${cell(m.reason)} |`),
    "",
    "## Open per item",
    "",
    "| Item | Stage | Owners | What |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.itemId} | ${r.stage} | ${[...new Set(r.open.map((o) => o.owner))].join(", ")} | ${cell(r.open.map((o) => o.what).join("; "))} |`),
    "",
  ].join("\n");

  mkdirSync(join(dir, "method"), { recursive: true });
  writeFileSync(join(dir, "snapshot.json"), json);
  writeFileSync(join(dir, "README.md"), md);
  for (const n of names.filter((x) => /^(out|input)-\d+\.json$/.test(x))) copyFileSync(join(inDir, n), join(dir, "method", n));
  if (existsSync(join(inDir, "reader-prompt.md"))) copyFileSync(join(inDir, "reader-prompt.md"), join(dir, "method", "reader-prompt.md"));
  if (args.adjudications) copyFileSync(resolve(args.adjudications), join(dir, "method", "adjudications.json"));

  const evDir = join(root, "specs/sprint-alfred-epic/evidence");
  const pointer = {
    schema: "pipeline.alfred-delivery-status-pointer.v1",
    snapshot: `${dirRel}/snapshot.json`,
    sha256: snapSha,
    measuredAt: args.date,
    head: args.head,
    counts: now,
    index: snapshot.current.index,
  };
  writeFileSync(join(evDir, "delivery-status-current.json"), JSON.stringify(pointer, null, 2) + "\n");
  writeFileSync(join(evDir, "delivery-status-current.md"), [
    "# Delivery status (current)",
    "",
    `Measured: ${args.date}. HEAD: \`${args.head}\`.`,
    "",
    `Counts: ${STAGES.map((s) => `${s}: ${now[s]}`).join(", ")}. Index: ${snapshot.current.index.toFixed(2)}%.`,
    "",
    `Snapshot: [${dirRel}/README.md](delivery-remeasure-${args.date}/README.md)`,
    "",
    "This file is replaced by every remeasure; history lives in the dated directories.",
    "",
  ].join("\n"));
  return pointer;
}

if (import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href || process.argv[1]?.endsWith("delivery-remeasure.mjs")) {
  try {
    console.log(JSON.stringify(measure(process.argv.slice(2))));
  } catch (e) {
    console.error(JSON.stringify({ error: e.message, integrity: e.integrity }));
    process.exit(1);
  }
}
