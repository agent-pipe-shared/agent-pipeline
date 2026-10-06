// Throwaway analysis helper for S3PLAN (not shipped). Cluster edges, SCCs, run() case anatomy, verb sets.
import fs from "node:fs";

const FILE = "plugins/pipeline-core/scripts/pipeline-state.mjs";
const OUT = "scratch/S3PLAN";
const lines = fs.readFileSync(FILE, "utf8").split("\n");
if (lines[lines.length - 1] === "") lines.pop();

const DECL = /^(export\s+)?(default\s+)?(async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
const isComment = (l) => /^(\/\/|\/\*|\s\*|\*\/)/.test(l);
const starts = [];
lines.forEach((l, i) => {
  let m;
  if (/^import\b/.test(l)) starts.push({ i, kind: "import", name: "(import)" });
  else if ((m = DECL.exec(l))) starts.push({ i, kind: m[4], name: m[5], exported: Boolean(m[1]) });
});
const decls = starts.map((st, k) => {
  const nextI = k + 1 < starts.length ? starts[k + 1].i : lines.length;
  let e = nextI - 1;
  while (e > st.i && (lines[e].trim() === "" || isComment(lines[e]) || /^\s/.test(lines[e]) === false && false)) e--;
  // trim contiguous leading comments of the next decl
  let lead = nextI;
  while (lead - 1 > st.i && isComment(lines[lead - 1])) lead--;
  e = Math.min(e, lead - 1);
  while (e > st.i && lines[e].trim() === "") e--;
  return { ...st, codeStart: st.i + 1, end: e + 1, size: e + 1 - st.i };
}).filter((d) => d.kind !== "import");

const CL = [
  ["C00a-core-constants", 536, 546], ["C00b-recovery-bridge", 547, 645], ["C01-constants-and-command-list", 646, 814],
  ["C02-store-read-write", 816, 1006], ["C03-gate-action-marker-sync", 1008, 1136],
  ["C04-continuity-lock-io", 1138, 1401], ["C05-continuity-request-canonical", 1403, 1711],
  ["C06-continuity-result-transactions", 1713, 2611], ["C07-continuity-transition-events-run", 2613, 2946],
  ["C08-publication", 2948, 3274], ["C09-flag-parsers", 3276, 3318],
  ["C10-legacyv2-gate-estimate-verify-calibration", 3320, 3618],
  ["C11-push-inspect-profiles-next-action", 3620, 4446], ["C12-external-push-proof", 4448, 4648],
  ["C13-legacy-adoption", 4650, 4818], ["C14-result-rebind-case-migration", 4822, 5105],
  ["C15-authority-revision", 5107, 5664], ["C16-result-bootstrap-close", 5668, 6272],
  ["C17-po-authority", 6276, 7820], ["C18-feature-package", 7822, 8715],
  ["C19-plan-approval-presentation-prd", 8717, 9115], ["C20-closed-evidence", 9116, 9708],
  ["C21-po-gate-authority", 9710, 9865], ["C22-enrollment-retirement", 9867, 9993],
  ["C23-run-dispatch", 9995, 12366], ["C24-entry", 12367, 12377],
].map(([id, from, to]) => ({ id, from, to }));
const clusterOf = (line) => CL.find((c) => line >= c.from && line <= c.to)?.id ?? "??";

const named = decls.filter((d) => ["function", "const", "let", "var", "class"].includes(d.kind));
const nameToCluster = new Map(named.map((d) => [d.name, clusterOf(d.codeStart)]));
const stats = Object.fromEntries(CL.map((c) => [c.id, { decls: 0, lines: 0, exported: 0, out: new Map(), fanIn: new Set() }]));
const edgeNames = new Map();
for (const d of named) {
  const cid = clusterOf(d.codeStart);
  const s = stats[cid];
  if (!s) continue;
  s.decls++; s.lines += d.size; if (d.exported) s.exported++;
  const ids = new Set(lines.slice(d.codeStart - 1, d.end).join("\n").match(/[A-Za-z_$][\w$]*/g) ?? []);
  for (const id of ids) {
    if (id === d.name) continue;
    const tc = nameToCluster.get(id);
    if (tc && tc !== cid) {
      s.out.set(tc, (s.out.get(tc) ?? 0) + 1);
      stats[tc].fanIn.add(cid);
      const key = `${cid}->${tc}`;
      if (!edgeNames.has(key)) edgeNames.set(key, new Set());
      edgeNames.get(key).add(`${id}<-${d.name}`);
    }
  }
}
// Tarjan SCC excluding run/entry clusters
const nodes = CL.map((c) => c.id).filter((id) => !id.startsWith("C23") && !id.startsWith("C24"));
const adj = new Map(nodes.map((n) => [n, [...stats[n].out.keys()].filter((t) => nodes.includes(t))]));
let idx = 0; const ix = new Map(), low = new Map(), onS = new Set(), stk = [], sccs = [];
const strong = (v) => {
  ix.set(v, idx); low.set(v, idx); idx++; stk.push(v); onS.add(v);
  for (const w of adj.get(v)) {
    if (!ix.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
    else if (onS.has(w)) low.set(v, Math.min(low.get(v), ix.get(w)));
  }
  if (low.get(v) === ix.get(v)) { const comp = []; let w; do { w = stk.pop(); onS.delete(w); comp.push(w); } while (w !== v); sccs.push(comp); }
};
for (const n of nodes) if (!ix.has(n)) strong(n);

const out = [];
out.push(`total lines ${lines.length}; named top-level declarations ${named.length} (function ${named.filter((d) => d.kind === "function").length}, const/let ${named.filter((d) => d.kind !== "function").length}); exported ${named.filter((d) => d.exported).length}`);
out.push("--- CLUSTERS id | range | decls | codeLines | exported | fanInFrom | refsTo(distinct ids)");
for (const c of CL) {
  const s = stats[c.id];
  out.push(`${c.id} | ${c.from}-${c.to} | ${s.decls} | ${s.lines} | ${s.exported} | ${[...s.fanIn].map((x) => x.split("-")[0]).sort().join(",")} | ${[...s.out].map(([k, v]) => `${k.split("-")[0]}:${v}`).sort().join(",")}`);
}
out.push("--- SCCs (size>1) excluding C23/C24: " + (sccs.filter((s) => s.length > 1).map((s) => s.map((x) => x.split("-")[0]).join("+")).join(" ; ") || "none"));
for (const comp of sccs.filter((s) => s.length > 1)) {
  const names = comp.map((x) => x.split("-")[0]);
  for (const a of comp) for (const b of comp) {
    const k = `${a}->${b}`;
    if (edgeNames.has(k)) out.push(`  edge ${k.replace(/-[a-z0-9-]+->/, "->").replace(/-[a-z0-9-]+$/, "")}: ${[...edgeNames.get(k)].slice(0, 8).join(" ; ")}`);
  }
}
out.push("--- run() (C23) outgoing clusters: " + [...stats["C23-run-dispatch"].out].map(([k, v]) => `${k.split("-")[0]}:${v}`).join(","));
out.push("--- inbound to C23/C24 from other clusters: " + [...stats["C23-run-dispatch"].fanIn].join(",") + " | " + [...edgeNames.keys()].filter((k) => k.endsWith("->C23-run-dispatch")).map((k) => `${k}: ${[...edgeNames.get(k)].join(";")}`).join(" || "));

// run() anatomy
const RUN_FROM = 9995, RUN_TO = 12366;
const localNames = ["dir", "now", "gitHead", "gitCandidate", "poGateAuthority", "deps", "flags", "rest", "base", "existing", "sub", "argv"];
const caseStarts = [];
for (let i = RUN_FROM; i <= RUN_TO; i++) {
  const m = /^    (case "([^"]+)"(?:\s*,\s*)?|default):/.exec(lines[i - 1]) || /^    case "([^"]+)":\s*$/.exec(lines[i - 1]);
  if (m && /^    (case|default)/.test(lines[i - 1])) caseStarts.push({ line: i, label: lines[i - 1].trim().slice(0, 40) });
}
out.push("--- run() pre-switch routes (2-space `if (sub`/`.has(sub)` lines 10004-10083)");
for (let i = 10004; i <= 10083; i++) if (/^  if \(.*(sub|has\(sub\))/.test(lines[i - 1])) out.push(`${i}\t${lines[i - 1].trim().slice(0, 150)}`);
out.push("--- run() switch cases: label | range | size | usesRunLocals | breakAtCaseLevel | top-level helper clusters called (count of distinct names)");
const switchEnd = caseStarts.length ? caseStarts[caseStarts.length - 1].line : RUN_TO;
caseStarts.forEach((cs, k) => {
  const endLine = k + 1 < caseStarts.length ? caseStarts[k + 1].line - 1 : RUN_TO;
  const body = lines.slice(cs.line - 1, endLine).join("\n");
  const ids = new Set(body.match(/[A-Za-z_$][\w$]*/g) ?? []);
  const used = localNames.filter((n) => ids.has(n));
  const brk = /^      break;/m.test(body) || /^    break;/m.test(body);
  const byCl = new Map();
  for (const id of ids) { const c = nameToCluster.get(id); if (c) { if (!byCl.has(c)) byCl.set(c, new Set()); byCl.get(c).add(id); } }
  const inner = (body.match(/^ {4,8}(?:async )?function \w+/gm) ?? []).length;
  out.push(`${cs.label} | ${cs.line}-${endLine} | ${endLine - cs.line + 1} | ${used.join(",")} | ${brk ? "break" : "-"} | inner-fns=${inner} | ${[...byCl].map(([c, s]) => `${c.split("-")[0]}x${s.size}`).sort().join(",")}`);
});
// verb sets
const strs = (a, b) => (lines.slice(a - 1, b).join("\n").match(/"([a-z][a-z0-9-]+)"/g) ?? []).map((s) => s.slice(1, -1));
const listed = strs(709, 734);
const sets = {
  CONTINUITY_SUBCOMMANDS: strs(754, 766), PUBLICATION_SUBCOMMANDS: strs(767, 777),
  AUTHORITY_REVISION_SUBCOMMANDS: strs(5107, 5135),
  FEATURE_PACKAGE_READ_SUBCOMMANDS: strs(7822, 7844), FEATURE_PACKAGE_REBIND_MUTABLE_SUBCOMMAND: strs(8013, 8037),
  FEATURE_PACKAGE_WRITE_SUBCOMMANDS: strs(8083, 8115),
};
out.push("--- verb sets (string literals in the constants; may include non-verb strings)");
for (const [k, v] of Object.entries(sets)) out.push(`${k}: ${v.join(" ")}`);
const routed = new Set([...Object.values(sets).flat(), ...caseStarts.map((c) => (/"([^"]+)"/.exec(c.label) ?? [])[1]).filter(Boolean)]);
for (let i = 10004; i <= 10083; i++) for (const m of lines[i - 1].matchAll(/"([a-z][a-z0-9-]+)"/g)) routed.add(m[1]);
out.push(`PIPELINE_STATE_COMMANDS entries: ${listed.length}`);
out.push(`listed but no route found: ${listed.filter((v) => !routed.has(v)).join(" ") || "none"}`);
out.push(`routed but not listed: ${[...routed].filter((v) => !listed.includes(v)).join(" ") || "none"}`);
fs.writeFileSync(`${OUT}/analyze2.out.txt`, out.join("\n") + "\n");
console.log(`wrote ${OUT}/analyze2.out.txt lines=${out.length}`);
