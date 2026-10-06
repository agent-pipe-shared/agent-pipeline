// Throwaway analysis helper for S3PLAN (not shipped). Column-0 heuristic declaration scan.
// Usage: node scratch/S3PLAN/analyze.mjs list | edges <clusters.json>
import fs from "node:fs";

const FILE = "plugins/pipeline-core/scripts/pipeline-state.mjs";
const OUT = "scratch/S3PLAN";
const text = fs.readFileSync(FILE, "utf8");
const lines = text.split("\n");
if (lines[lines.length - 1] === "") lines.pop();

const DECL = /^(export\s+)?(default\s+)?(async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
const DECL_DESTRUCT = /^(export\s+)?(const|let|var)\s+[\[{]/;
const IMPORT = /^import\b/;
const EXPORT_LIST = /^export\s*(\{|\*)/;
const STMT = /^(if|for|while|try|switch|await|process|main|void|globalThis|return|throw|do)\b/;
const isComment = (l) => /^(\/\/|\/\*|\s\*|\*\/)/.test(l);

const starts = [];
const sideEffects = [];
const imports = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  let m;
  if (IMPORT.test(l)) { imports.push({ line: i + 1, text: l }); starts.push({ i, kind: "import", name: "(import)", exported: false }); continue; }
  if ((m = DECL.exec(l))) {
    starts.push({ i, kind: m[4].replace("*", ""), name: m[5], exported: Boolean(m[1]), async: Boolean(m[3]) });
    continue;
  }
  if (DECL_DESTRUCT.test(l)) { starts.push({ i, kind: "destructure", name: l.slice(0, 60), exported: l.startsWith("export") }); continue; }
  if (EXPORT_LIST.test(l)) { starts.push({ i, kind: "export-list", name: l.slice(0, 80), exported: true }); continue; }
  if (STMT.test(l)) { sideEffects.push({ line: i + 1, text: l.slice(0, 120) }); starts.push({ i, kind: "stmt", name: l.slice(0, 60), exported: false }); }
}

// attach contiguous leading comments to the following declaration
for (let k = 0; k < starts.length; k++) {
  let s = starts[k].i;
  const floor = k > 0 ? starts[k - 1].i + 1 : 0;
  while (s - 1 >= floor && isComment(lines[s - 1])) s--;
  starts[k].lead = s;
}
const decls = [];
for (let k = 0; k < starts.length; k++) {
  const st = starts[k];
  const nextLead = k + 1 < starts.length ? starts[k + 1].lead : lines.length;
  let e = nextLead - 1;
  while (e > st.i && (lines[e].trim() === "" || isComment(lines[e]))) e--;
  decls.push({ ...st, start: st.lead + 1, codeStart: st.i + 1, end: e + 1, size: e + 1 - (st.lead + 1) + 1 });
}

if (process.argv[2] === "list") {
  const out = [];
  out.push(`FILE ${FILE}`);
  out.push(`TOTAL_LINES ${lines.length}`);
  out.push(`TOP_LEVEL_UNITS ${decls.length} (imports ${decls.filter((d) => d.kind === "import").length}, function ${decls.filter((d) => d.kind === "function").length}, const/let/var ${decls.filter((d) => ["const", "let", "var", "destructure"].includes(d.kind)).length}, class ${decls.filter((d) => d.kind === "class").length}, stmt ${decls.filter((d) => d.kind === "stmt").length}, export-list ${decls.filter((d) => d.kind === "export-list").length})`);
  out.push(`EXPORTED_DECLS ${decls.filter((d) => d.exported && d.kind !== "export-list").length}`);
  out.push("--- SIDE-EFFECT STATEMENTS (col 0)");
  for (const s of sideEffects) out.push(`${s.line}\t${s.text}`);
  out.push("--- IMPORT SOURCES");
  for (const d of decls.filter((x) => x.kind === "import")) out.push(`${d.start}-${d.end}\t${lines[d.codeStart - 1].slice(0, 110)}`);
  out.push("--- DECLARATIONS start-end size kind exp name");
  for (const d of decls.filter((x) => x.kind !== "import")) out.push(`${d.start}-${d.end}\t${d.size}\t${d.kind}\t${d.exported ? "E" : "-"}${d.async ? "A" : ""}\t${d.name}`);
  out.push("--- CASE/VERB LINES");
  lines.forEach((l, i) => { if (/^\s*case "[a-z0-9-]+":/.test(l) || /process\.argv/.test(l) || /import\.meta\.url/.test(l)) out.push(`${i + 1}\t${l.trim().slice(0, 130)}`); });
  fs.writeFileSync(`${OUT}/decls.out.txt`, out.join("\n") + "\n");
  console.log(`wrote ${OUT}/decls.out.txt units=${decls.length}`);
} else if (process.argv[2] === "edges") {
  // clusters.json: [{id, from, to}] by line range; reports cross-cluster identifier references
  const clusters = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const named = decls.filter((d) => ["function", "const", "let", "var", "class"].includes(d.kind));
  const nameToCluster = new Map();
  const clusterOf = (line) => clusters.find((c) => line >= c.from && line <= c.to)?.id ?? "??";
  for (const d of named) nameToCluster.set(d.name, clusterOf(d.codeStart));
  const stats = {};
  for (const c of clusters) stats[c.id] = { decls: 0, lines: 0, refsTo: {}, fanIn: new Set() };
  for (const d of named) {
    const cid = clusterOf(d.codeStart);
    if (!stats[cid]) continue;
    stats[cid].decls++;
    stats[cid].lines += d.size;
    const body = lines.slice(d.codeStart - 1, d.end).join("\n");
    const ids = new Set(body.match(/[A-Za-z_$][\w$]*/g) ?? []);
    for (const id of ids) {
      if (id === d.name) continue;
      const tc = nameToCluster.get(id);
      if (tc && tc !== cid) {
        stats[cid].refsTo[tc] = (stats[cid].refsTo[tc] ?? 0) + 1;
        if (stats[tc]) stats[tc].fanIn.add(cid);
      }
    }
  }
  const out = [];
  for (const c of clusters) {
    const s = stats[c.id];
    out.push(`${c.id}\t${c.from}-${c.to}\tdecls=${s.decls}\tlines~${s.lines}\tfanInFrom=${[...s.fanIn].sort().join(",")}\trefsTo=${Object.entries(s.refsTo).sort().map(([k, v]) => `${k}:${v}`).join(",")}`);
  }
  fs.writeFileSync(`${OUT}/edges.out.txt`, out.join("\n") + "\n");
  console.log(`wrote ${OUT}/edges.out.txt`);
}
