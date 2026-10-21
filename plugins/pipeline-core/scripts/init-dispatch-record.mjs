#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Prints the opening dispatch record (`pipeline.dispatch-record.v4`) for one generated Goldfish briefing (AC-163,
 * first clause). Every identity and digest -- task id, agent type, model, effort, ruleset identity, candidate commit
 * and the Critic decision -- is read from the briefing's own binding block, never typed, and the record passes
 * `validateDispatchRecord` before it is printed. The opening shape is the one `templates/prompts/goldfish-task.md`
 * field 6 prescribes: `outcome: "in-progress"`, `kind: "authored-commit"`, empty `commits` and `log`,
 * `resultSha256: null`, `report: null`. Writes nothing; the caller writes the record to the printed path.
 *
 * Usage: init-dispatch-record.mjs --briefing <repo-relative briefing.md> [--dispatcher <role label>] [--root <dir>]
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CRITIC_REQUIRED_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { DISPATCH_RECORD_SCHEMA, OUTCOME_CLASSIFICATION_SCHEMA, validateDispatchRecord } from "../lib/dispatch-record.mjs";
import { parseNativeGoldfishBriefing } from "../lib/native-goldfish-host-return.mjs";

export const DISPATCH_RECORD_SKELETON_SCHEMA = "pipeline.dispatch-record-skeleton.v1";
const FLAGS = Object.freeze({ "--briefing": "briefing", "--dispatcher": "dispatcher", "--root": "root" });

class SkeletonRefusal extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const refuse = (code, message) => { throw new SkeletonRefusal(code, message); };

function parseArgv(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!Object.hasOwn(FLAGS, flag)) refuse("IDR-FLAG-UNKNOWN", `unknown argument ${JSON.stringify(flag)}; the flags are --briefing, --dispatcher and --root`);
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--")) refuse("IDR-FLAG-VALUE", `flag ${flag} needs a value`);
    if (Object.hasOwn(values, FLAGS[flag])) refuse("IDR-FLAG-REPEATED", `flag ${flag} may be given once`);
    values[FLAGS[flag]] = value;
    index++;
  }
  if (values.briefing === undefined) refuse("IDR-FLAG-MISSING", "required flag --briefing is missing; repair: name the generated briefing file (dispatch-briefing.mjs build --out)");
  return values;
}

function readBriefing(root, rel) {
  const absolute = resolve(root, rel);
  const inside = relative(root, absolute);
  try {
    if (inside === "" || inside.startsWith("..") || realpathSync(absolute) !== absolute || !lstatSync(absolute).isFile()) throw new Error("outside");
    return readFileSync(absolute, "utf8");
  } catch {
    return refuse("IDR-BRIEFING-UNREADABLE", `briefing ${rel} is not a readable regular file under --root; repair: render it with dispatch-briefing.mjs build --out`);
  }
}

/** The opening v4 record of one briefing's binding; throws a typed refusal when the record would not validate. */
export function openingDispatchRecord(binding, dispatcher = "Elephant") {
  const decisionKey = binding.criticDecision?.schema === CRITIC_REQUIRED_SCHEMA ? "criticRequired" : "criticSkip";
  const record = {
    schema: DISPATCH_RECORD_SCHEMA,
    taskId: binding.dispatchId,
    agentType: binding.agentType,
    model: binding.model,
    effort: binding.effort,
    rulesetSha: binding.rulesetSha,
    dispatcher,
    candidateCommit: binding.candidateCommit,
    resultSha256: null,
    outcome: "in-progress",
    outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "authored-commit" },
    commits: [],
    log: [],
    report: null,
    [decisionKey]: binding.criticDecision,
  };
  try { return validateDispatchRecord(record); }
  catch (error) { return refuse("IDR-RECORD-INVALID", `the opening record does not validate (${error.code ?? "record"}: ${error.message}); repair: regenerate the briefing from its package`); }
}

/** Argv in, result object out; never throws for a refusal. */
export function runInitDispatchRecord(argv) {
  try {
    const options = parseArgv(argv);
    let root;
    try { root = realpathSync(resolve(options.root ?? process.cwd())); } catch { refuse("IDR-ROOT-UNREADABLE", "--root cannot be resolved to a directory"); }
    const parsed = parseNativeGoldfishBriefing(readBriefing(root, options.briefing));
    if (!parsed.ok) refuse("IDR-BRIEFING-BINDING", `the briefing carries no valid native binding (${parsed.code}); repair: render it with dispatch-briefing.mjs build`);
    const record = openingDispatchRecord(parsed.binding, options.dispatcher);
    return { schema: DISPATCH_RECORD_SKELETON_SCHEMA, ok: true, path: `evidence/dispatch-record-${record.taskId}.json`, record };
  } catch (error) {
    return { schema: DISPATCH_RECORD_SKELETON_SCHEMA, ok: false, code: error instanceof SkeletonRefusal ? error.code : "IDR-INTERNAL", message: String(error?.message ?? error) };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runInitDispatchRecord(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}
