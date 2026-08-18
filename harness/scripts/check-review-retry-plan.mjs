#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Opt-in evidence-bound review-retry planner check.
 *
 * Backlog item `pipeline.evidence-bound-review-retry-economics`
 * (`backlog/items/2026-07-20-evidence-bound-review-retry-economics.md`): the
 * live-wiring half of that item's remaining scope. `planReviewRetry`
 * (`plugins/pipeline-core/lib/review-retry-planner.mjs`) is a pure, already
 * Critic-PASSed decision function (commit `4d23d8c2`) with no filesystem or
 * process I/O of its own -- this script is the thin, opt-in I/O shell around
 * it, mirroring `check-phase26-invariants.mjs`/`check-phase3-sdlc-coherence.mjs`'s
 * own `--result`-style opt-in shape exactly: no arguments deliberately skip
 * this check entirely (the common case -- most Verify runs are not a
 * review/dispatch-abort retry); `--review-retry-input <path>` reads a
 * caller-supplied planning request, validates it, calls `planReviewRetry`,
 * and records the resulting plan into a git-ignored evidence artifact for
 * audit -- exactly the "bounded attempt counts and per-stage reuse/rerun
 * decisions are recorded in machine evidence so retry cost is measurable"
 * acceptance-boundary bullet, which nothing before this script actually
 * wrote anywhere.
 *
 * This script never decides which Verify SUITES run or reuse across
 * candidates -- that is `verify-resume.mjs`'s separate, already-wired,
 * ADR-0065-governed mechanism for THIS repo's own test suites, deliberately
 * untouched here. `review-retry-planner.mjs`'s own header explains why the
 * two must stay independent (no `allowCrossCandidateReuse`-shaped switch
 * exists or should ever be added to the planner this script calls). A
 * present-but-invalid request fails this check closed (exit 1): a caller
 * who asked for a retry plan and got a broken one must know, rather than
 * this step silently no-op'ing past a malformed machine-evidence pipeline.
 */
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { planReviewRetry, validateReviewRetryPlan } from "../../plugins/pipeline-core/lib/review-retry-planner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
export const REVIEW_RETRY_PLAN_INPUT_SCHEMA = "pipeline.verify-review-retry-input.v1";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Same closed-path discipline as `check-phase26-invariants.mjs`'s `safeResultPath`. */
function safeInputPath(root, inputPath) {
  if (typeof inputPath !== "string" || inputPath.length < 1 || isAbsolute(inputPath) || inputPath.includes("\\") || inputPath.includes("\0")) return null;
  const candidate = resolve(root, inputPath);
  const rel = relative(realpathSync(root), candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  let stat;
  try { stat = lstatSync(candidate); } catch { return null; }
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(candidate) !== candidate) return null;
  return candidate;
}

export function reviewRetryInputArg(argv) {
  const index = argv.indexOf("--review-retry-input");
  return index === -1 ? null : argv[index + 1] ?? null;
}

/**
 * Reads, validates and plans one review-retry input file. Never throws --
 * every failure mode (unsafe path, unreadable, malformed JSON, wrong schema,
 * or a `planReviewRetry` rejection) returns `{ ok: false, findings, plan: null }`
 * so a caller (this file's own CLI tail, or a test) has one uniform shape to
 * check.
 */
export function checkReviewRetryPlan(root = DEFAULT_ROOT, inputPath) {
  const path = safeInputPath(root, inputPath);
  if (path === null) return { ok: false, findings: ["review-retry input path must be an existing non-symlink repository-relative file"], plan: null };
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch { return { ok: false, findings: ["review-retry input is unreadable"], plan: null }; }
  let input;
  try { input = JSON.parse(raw); } catch { return { ok: false, findings: ["review-retry input is not valid JSON"], plan: null }; }
  if (!isObject(input) || input.schema !== REVIEW_RETRY_PLAN_INPUT_SCHEMA) {
    return { ok: false, findings: [`review-retry input must be one object with schema ${REVIEW_RETRY_PLAN_INPUT_SCHEMA}`], plan: null };
  }
  let plan;
  try {
    plan = planReviewRetry({
      candidate: input.candidate,
      policyVersion: input.policyVersion,
      stages: input.stages,
      receipts: input.receipts ?? {},
      abort: input.abort,
      evaluatedAt: input.evaluatedAt,
      maxAttemptsPerStage: input.maxAttemptsPerStage,
      attempts: input.attempts ?? {},
    });
  } catch (error) {
    return { ok: false, findings: [`review-retry input could not be planned (${error instanceof Error ? error.message : "unknown error"})`], plan: null };
  }
  // Belt-and-braces: `planReviewRetry` already self-validates before returning
  // (review-retry-planner.mjs), so this can only fail if that invariant is
  // ever weakened -- this check must not go on to treat such a plan as usable.
  if (!validateReviewRetryPlan(plan).ok) return { ok: false, findings: ["planned review-retry plan failed its own re-validation"], plan: null };
  return { ok: true, findings: [], plan };
}

function writeEvidence(root, plan) {
  const evidenceDir = join(root, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, "review-retry-plan-latest.json"), `${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = reviewRetryInputArg(process.argv.slice(2));
  if (!inputPath) {
    console.log("SKIP review-retry plan: no --review-retry-input supplied (explicit retry opt-in only).");
    process.exit(0);
  }
  const checked = checkReviewRetryPlan(DEFAULT_ROOT, inputPath);
  if (!checked.ok) {
    for (const finding of checked.findings) console.error(`FAIL review-retry plan: ${finding}`);
    process.exit(1);
  }
  writeEvidence(DEFAULT_ROOT, checked.plan);
  console.log(`review-retry plan valid: ${checked.plan.retained.length} retained, ${checked.plan.rerun.length} rerun, ${checked.plan.exhausted.length} exhausted.`);
}
