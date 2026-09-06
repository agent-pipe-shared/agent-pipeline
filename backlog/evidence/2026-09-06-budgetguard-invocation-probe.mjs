#!/usr/bin/env node
// Bisects ONE question: when guard-dispatch-budget.mjs is handed a
// subagent-shaped PreToolUse payload, does it count?
//
// This separates two causes that look identical from the outside:
//   (a) the guard's own logic declines to count  -> a code defect
//   (b) the guard is never invoked for subagent tool calls -> a wiring defect
//
// Safety: the probe invents an agent id that no live dispatch owns, so the
// counter it may write cannot alter a running dispatch's budget. The fixture
// transcript lives under scratch/, never in the real projects directory.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const GUARD = join(REPO, "plugins", "pipeline-core", "hooks", "guard-dispatch-budget.mjs");

// An id no live agent has. Keep it obviously synthetic so an orphan file is
// recognisable if cleanup is ever missed.
const FAKE_ID = "probe0000000000000";
const fixtureDir = join(HERE, "budgetguard-probe-fixture", "subagents");
const transcript = join(fixtureDir, `agent-${FAKE_ID}.jsonl`);
const meta = join(fixtureDir, `agent-${FAKE_ID}.meta.json`);

mkdirSync(fixtureDir, { recursive: true });
writeFileSync(transcript, `${JSON.stringify({ type: "user", timestamp: new Date().toISOString() })}\n`, "utf8");
writeFileSync(meta, JSON.stringify({
  agentType: "pipeline-core:goldfish-deep",
  description: "budget guard probe",
  toolUseId: "toolu_probe",
  spawnDepth: 1,
  model: "sonnet",
}), "utf8");

const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
  cwd: REPO, encoding: "utf8",
}).trim();
const counterPath = join(commonDir, "agent-pipeline", "dispatch-budget", `${FAKE_ID}.json`);
const unresolvedPath = join(commonDir, "agent-pipeline", "dispatch-budget", "unresolved.jsonl");

const unresolvedBefore = existsSync(unresolvedPath) ? readFileSync(unresolvedPath, "utf8").length : 0;

const payload = JSON.stringify({
  tool_name: "Bash",
  tool_input: { command: "rg -n needle probe.txt" },
  transcript_path: transcript,
  cwd: REPO,
});

let exitCode = 0;
let stdout = "";
let stderr = "";
try {
  stdout = execFileSync("node", [GUARD], { input: payload, encoding: "utf8", cwd: REPO });
} catch (error) {
  exitCode = error.status ?? -1;
  stdout = error.stdout ?? "";
  stderr = error.stderr ?? "";
}

console.log(`guard exit code : ${exitCode}`);
console.log(`guard stdout    : ${JSON.stringify(stdout)}`);
console.log(`guard stderr    : ${JSON.stringify(stderr.slice(0, 400))}`);
console.log(`counter written : ${existsSync(counterPath)}  (${counterPath})`);
if (existsSync(counterPath)) console.log(`counter contents: ${readFileSync(counterPath, "utf8").trim()}`);
const unresolvedAfter = existsSync(unresolvedPath) ? readFileSync(unresolvedPath, "utf8").length : 0;
console.log(`unresolved grew : ${unresolvedAfter > unresolvedBefore}`);

console.log("");
if (existsSync(counterPath)) {
  console.log("VERDICT: the guard's own logic COUNTS a subagent-shaped payload.");
  console.log("         So the live absence of counters is a WIRING/INVOCATION problem,");
  console.log("         not a defect in this module's identity or counting logic.");
} else {
  console.log("VERDICT: the guard did NOT count even when handed a subagent-shaped payload");
  console.log("         directly. The defect is inside this module, upstream of counting.");
}

// Clean up: the synthetic counter must not linger as guard-owned state.
if (existsSync(counterPath)) rmSync(counterPath);
rmSync(join(HERE, "budgetguard-probe-fixture"), { recursive: true, force: true });
console.log("(probe fixture and any synthetic counter removed)");
