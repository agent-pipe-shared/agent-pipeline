// CRITIC-CKPT-T3-20261009 helper (scratch, not committed), derived from scratch/dispatch-wip/CRITIC-CKPT-T2/tool.mjs. Modes:
//   build <phase> <toolUses>   verifies the appended block against the base sha (the T2 post-image), writes the scratch redirect set +
//                              rebased test body + commit message, prints the shas, appends one log entry to the dispatch record
//   log <phase> <toolUses>     appends one log entry to the dispatch record
//   finalize <commitSha> <outcome> <kind> <reportFile> <toolUses>
//                              ONE write: v4 record fields, commits, changedFiles (from that commit), outcome + classification,
//                              report.text (the token @@COMMIT@@ becomes the short commit sha), resultSha256
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const HERE = `${ROOT}scratch/dispatch-wip/CRITIC-CKPT-T3/`;
const HOOKS = `${ROOT}specs/sprint-alfred-epic/signed-package/tranche-2/hooks/`;
const TEST_POST = `${HOOKS}guard-dispatch-budget.test.mjs`;
const GUARD_POST = `${HOOKS}guard-dispatch-budget.mjs`;
const RECORD = `${ROOT}evidence/dispatch-record-CRITIC-CKPT-T3-20261009.json`;
const MSG = `${ROOT}scratch/commit-msg/CRITIC-CKPT-T3-20261009.txt`;
const BASE_TEST_SHA = "1447a996c575658adcda46f4f6a26b8d5447bf3783b0b9cc319c4d7b8004a814";
const MARKER = "// CRITIC-CKPT-T3 (tranche-2 post-image, 2026-10-09)";
const CANDIDATE = "902fe1b74";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const readRecord = () => JSON.parse(readFileSync(RECORD, "utf8"));
const writeRecord = (record) => writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);
const appendLog = (phase, toolUses) => {
  const record = readRecord();
  record.log.push({ phase, toolUses: Number(toolUses) });
  writeRecord(record);
};
const once = (text, anchor, label) => {
  const parts = text.split(anchor);
  if (parts.length !== 2) throw new Error(`${label}: anchor must occur exactly once, found ${parts.length - 1}`);
  return parts;
};

const [mode, ...args] = process.argv.slice(2);

if (mode === "build") {
  const text = readFileSync(TEST_POST, "utf8");
  if (text.includes("\r\n")) throw new Error("test post-image has CRLF");
  const guard = readFileSync(GUARD_POST);
  const [before] = once(text, MARKER, "CRITIC-CKPT-T3 marker");
  const sepStart = before.lastIndexOf("\n", before.length - 2) + 1; // line start of the "// ----" separator above the marker
  const start = sepStart - 1; // the blank line that precedes the separator
  const base = text.slice(0, start);
  if (sha(base) !== BASE_TEST_SHA) throw new Error(`text before the appended block has sha ${sha(base)}, expected the base ${BASE_TEST_SHA}`);
  const block = text.slice(start);
  const startLine = base.split("\n").length; // 1-based line of the blank line that opens the block
  // scratch body: the test post-image with every ../lib/ specifier, the shipped critic.md URL and the guard URL re-pointed at the live plugin tree
  let body = text.replaceAll('"../lib/', '"../../../plugins/pipeline-core/lib/');
  const agentAnchor = 'new URL("../agents/critic.md", import.meta.url)';
  const [aa, ab] = once(body, agentAnchor, "shipped critic.md anchor");
  body = `${aa}new URL("../../../plugins/pipeline-core/agents/critic.md", import.meta.url)${ab}`;
  const guardAnchor = 'new URL("./guard-dispatch-budget.mjs", import.meta.url)';
  const [ga, gb] = once(body, guardAnchor, "guard url anchor");
  body = `${ga}new URL("../../../plugins/pipeline-core/hooks/guard-dispatch-budget.mjs", import.meta.url)${gb}`;
  const leftover = [...body.matchAll(/(?:from\s+|import\s*\(\s*|new URL\()["'](\.\.?\/[^"']*)["']/gu)].map((m) => m[1]).filter((p) => !p.startsWith("../../../plugins/pipeline-core/"));
  mkdirSync(`${HERE}post/hooks`, { recursive: true });
  writeFileSync(`${HERE}post/hooks/guard-dispatch-budget.mjs`, guard);
  writeFileSync(`${HERE}guard-dispatch-budget.ckpt3.body.mjs`, body);
  writeFileSync(`${HERE}redirect-hooks.mjs`, [
    "// CRITIC-CKPT-T3 scratch ESM load hook: serves the tranche-2 guard post-image bytes UNDER THE LIVE guard URL (TR-C-F method).",
    'import { appendFileSync, readFileSync } from "node:fs";',
    'const LIVE = new URL("../../../plugins/pipeline-core/hooks/guard-dispatch-budget.mjs", import.meta.url).href;',
    'const SOURCE = new URL("./post/hooks/guard-dispatch-budget.mjs", import.meta.url);',
    "export async function load(url, context, nextLoad) {",
    "  if (url !== LIVE) return nextLoad(url, context);",
    '  appendFileSync(new URL("./fired-guard-dispatch-budget.mjs.log", import.meta.url), url + "\\n");',
    '  return { format: "module", source: readFileSync(SOURCE), shortCircuit: true };',
    "}",
    "",
  ].join("\n"));
  writeFileSync(`${HERE}register.mjs`, 'import { register } from "node:module";\nregister("./redirect-hooks.mjs", import.meta.url);\n');
  writeFileSync(`${HERE}guard-dispatch-budget.ckpt3.test.mjs`, [
    "// CRITIC-CKPT-T3 scratch entry (the file the DoD command names). The runner child imports the guard by its live URL; NODE_OPTIONS",
    "// registers the load hook in every child so it receives the guard post-image bytes.",
    'import { existsSync, readFileSync, rmSync } from "node:fs";',
    'const sidecar = new URL("./fired-guard-dispatch-budget.mjs.log", import.meta.url);',
    "rmSync(sidecar, { force: true });",
    'process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS ?? "") + " --import=" + new URL("./register.mjs", import.meta.url).href).trim();',
    'process.on("exit", () => {',
    '  const loads = existsSync(sidecar) ? readFileSync(sidecar, "utf8").split("\\n").filter(Boolean).length : 0;',
    '  console.error(loads > 0 ? "CKPT3-REDIRECT-FIRED guard-dispatch-budget.mjs (" + loads + " runner-child loads served from the tranche-2 guard post-image)" : "CKPT3-REDIRECT-NOT-FIRED guard-dispatch-budget.mjs (the live guard ran)");',
    "});",
    'await import("./guard-dispatch-budget.ckpt3.body.mjs");',
    "",
  ].join("\n"));
  mkdirSync(`${ROOT}scratch/commit-msg`, { recursive: true });
  writeFileSync(MSG, [
    "test(guard-dispatch-budget): pin the Critic's confined Write lane at every call (tranche-2)",
    "",
    "Appends RED pins for Rulings 157 and 159 to the tranche-2 test post-image: before the cap, at",
    "call 1 and at call 20, a pipeline-core:critic subagent seeded from the shipped agents/critic.md",
    "is admitted for a Write and an Edit of scratch/dispatch/critic-<id>/critic-notes.md, and is",
    "refused with a typed DISPATCH-BUDGET-* code for every other path (the T2 (d) paths, a plugin",
    "source file, evidence/x.json, scratch/dispatch/other/critic-notes.md). A goldfish-deep source",
    "Write at call 1 stays admitted (control). The refusal cases are red today (the guard admits",
    "them); the admitted cases and the control are green. Test-only (QG-04); the change that turns",
    "them green is CRITIC-CKPT-F. CRITIC-CKPT-MANIFEST.md records the shas, block and commands.",
    "",
    "AI-Assisted: true",
    "Dispatch: CRITIC-CKPT-T3-20261009 (goldfish)",
    "",
  ].join("\n"));
  appendLog(args[0] ?? "build", args[1] ?? 0);
  console.log(JSON.stringify({
    testPostImageSha256: sha(text), testPostImageBytes: Buffer.byteLength(text), testPostImageLines: text.split("\n").length - 1,
    insertedBlockStartLine: startLine, insertedBlockLines: block.split("\n").length - 1,
    baseWithoutBlockSha256: sha(base), baseWithoutBlockEqualsBase: sha(base) === BASE_TEST_SHA, baseWithoutBlockBytes: Buffer.byteLength(base),
    guardPostImageSha256: sha(guard), guardPostImageBytes: guard.length,
    scratchBodySha256: sha(body), leftoverRelativeSpecifiers: leftover,
  }, null, 2));
} else if (mode === "log") {
  appendLog(args[0], args[1]);
  console.log("logged");
} else if (mode === "finalize") {
  const [commitSha, outcome, kind, reportFile, toolUses] = args;
  const full = git(["rev-parse", "--verify", `${commitSha}^{commit}`]);
  const changedFiles = git(["show", "--name-only", "--pretty=format:", full]).split("\n").filter(Boolean);
  const reportText = readFileSync(reportFile, "utf8").replaceAll("@@COMMIT@@", full.slice(0, 9));
  const record = readRecord();
  const out = {
    schema: record.schema,
    taskId: record.taskId,
    agentType: record.agentType,
    model: record.model,
    effort: record.effort,
    runner: record.runner,
    rulesetSha: record.rulesetSha,
    dispatcher: record.dispatcher,
    candidateCommit: git(["rev-parse", "--verify", `${CANDIDATE}^{commit}`]),
    resultSha256: sha(Buffer.from(reportText, "utf8")),
    outcome,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind },
    commits: [full],
    log: [...record.log, { phase: "terminal record written (commit, report, resultSha256 in one write)", toolUses: Number(toolUses) }],
    report: { text: reportText, changedFiles },
    criticRequired: record.criticRequired,
  };
  writeRecord(out);
  console.log(JSON.stringify({ commit: full, changedFiles, resultSha256: out.resultSha256, outcome, kind }));
} else {
  throw new Error(`unknown mode ${mode}`);
}
