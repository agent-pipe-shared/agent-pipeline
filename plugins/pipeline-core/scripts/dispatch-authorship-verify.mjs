#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Verify that a commit's authorship trailer BINDS to the dispatch record it names.
 *
 * WHY THIS EXISTS. Authorship of a production diff is supposed to be provable from
 * two artifacts: the `Dispatch: <TASK_ID> (goldfish)` commit trailer and the record
 * under `evidence/`. Three independent Critic rounds against the 0.5.4 candidate found
 * that the pair does not hold, in five shapes (backlog item
 * `2026-08-09-the-dispatch-record-does-not-bind-to-the-commit-it-vouches-for.md`).
 * The check that existed looked for the PRESENCE of a trailer. Every one of those
 * failures is about CORRESPONDENCE, and presence is the one property that carries no
 * information: a trailer costs one line and is written by the party being vouched for.
 *
 * This script checks correspondence. It is a standalone diagnostic — deliberately NOT
 * wired into `harness/scripts/verify.mjs` (TP-3) — so it can be run at close, in CI, or
 * by a Critic against a review set, without changing any gate's strength today.
 *
 * THE THREE DIMENSIONS, in decreasing order of evidential strength:
 *
 *   1. SHA binding (exact). If the record carries a `commit` field, it must prefix-match
 *      the commit under test. This is the only dimension that is proof rather than
 *      inference, and it is what catches a record naming a different commit entirely.
 *   2. Outcome terminality (exact). A record still at `in-progress` vouches for nothing.
 *      Terminality is decided by a DENYLIST, not an allowlist: the observed corpus already
 *      says `completed`, `success`, `done`, `completed-with-open-items`,
 *      `completed-by-elephant-finish` and `stopped-tool-budget`, and an allowlist would
 *      misclassify every new word someone reasonably invents.
 *   3. Path coverage (heuristic, and honestly the weakest). See LIMITS below.
 *   4. Recorded model vs. agent definition (NVA-BL-78, `lib/agent-model-registry.mjs`). Silent
 *      when the record predates the `agentType` convention (see LIMITS); where `agentType` IS
 *      declared, the record's `model`/`effort` are checked against that agent's own definition
 *      file rather than trusted as hand-typed text. A disagreement without a declared
 *      `modelOverride` (with a non-empty `rationale`, the MP-05/07 requirement) downgrades a
 *      would-be PASS to FAIL, classification `model-mismatch` — this is what makes the check
 *      have teeth rather than being an informational aside. A well-formed override is HONOURED
 *      (stays PASS) and reported as `model-override-declared`, distinguishable from both the
 *      ordinary "agrees" case and an accidental mismatch.
 *
 * A FIFTH, STRONGER FORM (Direction 3 Option B of the same item): `Dispatch:
 * <generator-script-path> (elephant-generated)`, e.g. `Dispatch:
 * harness/scripts/generate-agent-obligations.mjs (elephant-generated)`. Unlike every other
 * form above, this one is MECHANICAL PROOF rather than a self-reported heuristic: the id
 * must be on the closed `ELEPHANT_GENERATOR_ALLOWLIST`, the commit's changed paths must all
 * be covered by that entry's declared output path, and the named script is actually
 * RE-RUN — in an isolated checkout of the commit's PARENT tree, never the live working
 * tree (`runGeneratorInIsolatedParentTree`) — with its stdout asserted byte-identical to
 * what the commit changed the output path to. A mismatch is FAIL, never a silent PASS.
 *
 * THE FOUR VERDICTS.
 *
 *   PASS          the trailer resolves to a terminal record that does not contradict the
 *                 commit, the commit DECLARES itself Elephant-direct in the sanctioned
 *                 `stage-0 (elephant)` form AND stays inside the size bound below, or the
 *                 commit DECLARES `<allowlisted-script> (elephant-generated)` and re-running
 *                 that script against the parent tree reproduces the changed output exactly.
 *   FAIL          the trailer names a record that is absent, unfinished, or contradicts
 *                 the commit.
 *   UNVERIFIABLE  the evidence does not decide. Notably: a commit carrying NO `Dispatch:`
 *                 trailer at all. That is reported as `elephant-direct-undeclared` and it
 *                 is never a PASS — blessing silence would re-bless failure shape 1 of the
 *                 item (absent trailer on the two largest production diffs in the review
 *                 set) and weaken the fail-closed boundary Direction point 4 protects.
 *                 Declaring costs one line and earns a PASS; staying silent does not.
 *
 * LIMITS — what this script does NOT establish, stated plainly rather than implied away:
 *
 *   - PATH COVERAGE IS A HEURISTIC OVER PROSE. Records are heterogeneous. Some carry
 *     `report.changedFiles`; in others `report` is a bare string with no machine-readable
 *     path field at all. Where no structured path list exists the verdict is UNVERIFIABLE,
 *     never PASS — the script does not scrape free prose for path-like tokens and then
 *     call the result evidence.
 *   - IT DOES NOT DETECT A SEMANTIC CONTRADICTION. Failure shape 2 of the item — a record
 *     reading `stopped-tool-budget` and naming work it did not reach, while the commit
 *     performs exactly that work — passes dimension 2 here, because `stopped-tool-budget`
 *     IS terminal. Reading a record's prose against a diff's meaning is a Critic's job.
 *   - THE EVIDENCE REMAINS SELF-REPORTED. Both artifacts are written by the party being
 *     vouched for. This script raises the cost of an inconsistent story; it does not make
 *     the story externally observed.
 *   - ABSENT A `commit` FIELD, THERE IS NO SHA BINDING. Most existing records predate the
 *     convention, so dimension 1 is frequently silent rather than satisfied.
 *   - THE EVIDENCE IS READ FROM THE WORKING TREE, NEVER FROM THE COMMIT'S OWN GIT TREE.
 *     Records are resolved under `DEFAULT_EVIDENCE_DIR` in the CURRENT working tree, and
 *     `evidence/` is gitignored. A PASS is therefore a statement about this checkout at this
 *     moment, not a property of the commit: a second party who checks the same commit out
 *     fresh has no `evidence/` directory and gets `record-missing` for every commit that
 *     passed here. Nothing in this script makes the verdict reproducible by a third party.
 *   - THE ELEPHANT-DIRECT CHECK IS THIN, AND ITS SIZE BOUND IS THIS SCRIPT'S OWN CONVENTION.
 *     A `stage-0 (elephant)` commit has no record to bind, so exactly two things are
 *     checked: that the id IS the sanctioned `stage-0` (any other id under role `elephant`
 *     is UNVERIFIABLE, not a PASS), and that the diff touches at most
 *     `ELEPHANT_STAGE0_MAX_PATHS` files as a coarse stand-in for "small". The stage-0 fast
 *     path is described only qualitatively in the obligations text ("small, disclosed,
 *     judgment-light"); no source names a number, so the bound is chosen here and stated
 *     rather than derived. "Disclosed" and "judgment-light" are not mechanically checked at
 *     all — an in-bounds Elephant PASS asserts the declaration is well-formed and small,
 *     nothing more.
 *
 * EXIT CODES: 0 = every commit PASS. 1 = at least one FAIL. 2 = at least one UNVERIFIABLE
 * and no FAIL (with `--strict`, 2 is folded into 1). 3 = usage/environment error.
 *
 * Usage:
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs <sha> [<sha> ...]
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs --range main..HEAD
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs --json <sha>
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs --strict <sha>
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { compareRecordedModel } from "../lib/agent-model-registry.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const DEFAULT_EVIDENCE_DIR = join(REPO_ROOT, "evidence");

/**
 * Outcomes that vouch for nothing. Anything NOT in this set counts as terminal — see the
 * header on why this is a denylist. `stopped-*` outcomes are terminal: the run ended, and
 * the record is a truthful account of a run that stopped.
 */
export const NON_TERMINAL_OUTCOMES = Object.freeze(["in-progress", "in progress", "started", "pending", "running"]);

export const VERDICT = Object.freeze({ pass: "PASS", fail: "FAIL", unverifiable: "UNVERIFIABLE" });

/** The one sanctioned Elephant-direct form (`agent-obligations.md` §6). */
export const ELEPHANT_STAGE0_ID = "stage-0";

/**
 * The coarse "small" bound for a stage-0 Elephant commit. A convention of this script, not a
 * value any document exports — see the LIMITS header. It exists so the Elephant branch stops
 * minting a PASS on a diff of any size for the price of one self-written trailer line.
 */
export const ELEPHANT_STAGE0_MAX_PATHS = 10;

/**
 * Direction 3 Option B (`2026-08-09-the-dispatch-record-does-not-bind-to-the-commit-it-
 * vouches-for.md`): `Dispatch: <generator-script-path> (elephant-generated)` is verified by
 * MECHANICAL PROOF rather than trust — re-running the named script against the commit's
 * parent tree and asserting byte-identical output to what the commit changed.
 *
 * SECURITY. The trailer's id is commit text — attacker-influenced input, exactly like a
 * goldfish task id (see `SAFE_TASK_ID` above). A verifier that executes a script NAMED IN
 * THAT INPUT is a code-execution surface into the verification tool itself, so the id is
 * NEVER used to build a filesystem path or a command argument directly: it is only ever a
 * lookup key into this literal, closed allowlist. A `Map` (not a plain object) is used
 * specifically so a key like `"__proto__"` or `"constructor"` cannot resolve to something on
 * `Object.prototype` — `Map#get` never touches the prototype chain regardless of the key's
 * text. Growing this list is a code change to this script, reviewed like any other guardrail
 * change; it must never become data-driven from commit text, environment, or config.
 */
export const ELEPHANT_GENERATOR_ALLOWLIST = new Map([
  [
    "harness/scripts/generate-agent-obligations.mjs",
    Object.freeze({
      scriptPath: "harness/scripts/generate-agent-obligations.mjs",
      outputPath: "templates/prompts/agent-obligations.md",
      args: Object.freeze(["--stdout"]),
    }),
  ],
]);

/**
 * Re-run an allowlisted generator against an ISOLATED checkout of `parentRef` — never the
 * live working tree. `git worktree add` provisions a fresh directory from the repository's
 * own object store; the script executes with that directory as its `cwd`, so its own
 * relative imports resolve inside the sandbox and a relative write lands inside the sandbox,
 * never in the real checkout. The worktree and its containing temp directory are removed in
 * `finally` blocks, so a script bug or crash still cannot leave the sandbox mounted against
 * `repoRoot` for a later call to trip over.
 *
 * LIMIT, stated plainly rather than implied away: this isolates the FILESYSTEM working
 * directory, not the OS process. A script that shells out to `git` from inside the sandbox
 * worktree still shares this repository's object database and ref namespace (worktrees are
 * not separate repositories), so a script that deliberately ran e.g. `git branch -D main`
 * from inside the sandbox could still mutate shared refs. The allowlist is closed precisely
 * because this isolation is a working-directory boundary, not a full sandbox, and only
 * already-reviewed generator scripts (which read and write files, and do not invoke git) are
 * ever named in it.
 */
export function runGeneratorInIsolatedParentTree({ repoRoot, parentRef, scriptRelPath, args = [] }) {
  const base = mkdtempSync(join(tmpdir(), "dispatch-authorship-sandbox-"));
  const worktreeDir = join(base, "wt");
  try {
    execFileSync("git", ["worktree", "add", "--detach", "--quiet", worktreeDir, parentRef], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    try {
      return execFileSync(process.execPath, [join(worktreeDir, scriptRelPath), ...args], {
        cwd: worktreeDir,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
    } finally {
      try {
        execFileSync("git", ["worktree", "remove", "--force", worktreeDir], { cwd: repoRoot, encoding: "utf8" });
      } catch {
        // Best-effort: the outer rmSync below still purges the directory from disk even if
        // git's own worktree bookkeeping could not be cleaned (e.g. repoRoot itself is gone).
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/**
 * A task id is concatenated into a filename under the evidence directory, and it arrives from
 * a commit trailer — i.e. from the party being vouched for. Constrain it to a safe filename
 * fragment BEFORE it reaches the filesystem, so a crafted id (`../../..`) is refused as an
 * invalid trailer rather than resolving somewhere outside `evidenceDir`.
 */
export const SAFE_TASK_ID = /^[A-Za-z0-9._-]+$/u;

export function isSafeTaskId(taskId) {
  return typeof taskId === "string" && SAFE_TASK_ID.test(taskId);
}

/**
 * Parse the trailer block: the trailing contiguous run of `Key: value` lines. Anchoring on
 * the block rather than on `/^Dispatch:/m` anywhere means a `Dispatch:` mentioned in the
 * body prose cannot pose as authorship evidence.
 */
export function parseTrailerBlock(message) {
  const lines = String(message ?? "").replace(/\r\n/gu, "\n").split("\n");
  while (lines.length > 0 && lines.at(-1).trim() === "") lines.pop();
  const trailers = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/u.exec(lines[i]);
    if (!match) break;
    trailers.unshift({ key: match[1], value: match[2].trim() });
  }
  return trailers;
}

/**
 * `Dispatch: <ID> (<role>)`. The role lives in its own slot, so the Elephant form
 * (`Dispatch: stage-0 (elephant)`) falls out of the SAME grammar as the goldfish form and
 * classification is role-driven rather than a special-cased string.
 */
export function parseDispatchTrailer(message) {
  const entries = parseTrailerBlock(message).filter((entry) => entry.key.toLowerCase() === "dispatch");
  if (entries.length === 0) return null;
  if (entries.length > 1) {
    // Two authorship claims on one commit are not a case where the topmost wins: the
    // obligations text admits exactly one `Dispatch:` trailer, and picking silently would
    // let a second, contradicting claim ride along unread. Surfaced, never resolved here.
    return {
      raw: entries.map((entry) => entry.value).join(" | "),
      id: null,
      role: null,
      malformed: true,
      ambiguous: true,
      count: entries.length,
    };
  }
  const trailer = entries[0];
  const match = /^(\S+)\s*\(([^)]+)\)$/u.exec(trailer.value);
  if (!match) return { raw: trailer.value, id: null, role: null, malformed: true };
  return { raw: trailer.value, id: match[1], role: match[2].trim().toLowerCase(), malformed: false };
}

export function isTerminalOutcome(outcome) {
  if (typeof outcome !== "string") return false;
  const normalized = outcome.trim().toLowerCase();
  if (normalized === "") return false;
  return !NON_TERMINAL_OUTCOMES.includes(normalized);
}

/**
 * The SHAs a record claims. A dispatch that commits as soon as each piece is green — which
 * is exactly what the briefings ask for, because a commit that exists survives a truncated
 * run — produces SEVERAL commits under one task id, so a single `commit` field cannot bind
 * them all. Both `commit` (string) and `commits` (array) are read, and binding succeeds if
 * ANY declared sha binds. Returns null when the record declares none, which leaves this
 * dimension silent rather than failed: most existing records predate the convention.
 */
export function declaredCommits(record) {
  const raw = record?.commits ?? record?.commit;
  const list = (Array.isArray(raw) ? raw : [raw]).filter((entry) => typeof entry === "string" && entry.trim() !== "");
  return list.length > 0 ? list : null;
}

/** Two SHAs bind if either is a prefix of the other — records abbreviate inconsistently. */
export function shasBind(a, b) {
  const left = String(a ?? "").trim().toLowerCase();
  const right = String(b ?? "").trim().toLowerCase();
  if (left === "" || right === "") return false;
  return left.startsWith(right) || right.startsWith(left);
}

/**
 * Pull declared paths out of `report.changedFiles`. Entries are either objects with a
 * `path`, or strings shaped `"<path> - why it changed"` (the house style). Returns null —
 * distinct from an empty array — when the record has no machine-readable path field, which
 * is what makes the caller answer UNVERIFIABLE instead of FAIL.
 */
export function declaredPaths(record) {
  const changed = record?.report?.changedFiles ?? record?.changedFiles;
  if (!Array.isArray(changed)) return null;
  const paths = [];
  for (const entry of changed) {
    const text = typeof entry === "string" ? entry : entry?.path;
    if (typeof text !== "string") continue;
    const token = text.trim().replace(/^[`'"]+/u, "").split(/[\s`'",]+/u)[0];
    if (token) paths.push(token.replace(/[.,;:]+$/u, ""));
  }
  return paths;
}

/**
 * A commit path is covered by an exact match or by a declared DIRECTORY prefix. Basename
 * matching is deliberately not accepted: `test.mjs` covering any `test.mjs` anywhere would
 * make coverage mean nothing.
 */
export function coveringPath(commitPath, declared) {
  const target = commitPath.replace(/^\.\//u, "");
  return (
    declared.find((entry) => {
      const candidate = entry.replace(/^\.\//u, "").replace(/\/$/u, "");
      return candidate === target || target.startsWith(`${candidate}/`);
    }) ?? null
  );
}

function result(sha, verdict, classification, reason, extra = {}) {
  return { sha, verdict, classification, reason, ...extra };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** Truthy AND not merely an empty container (`""`, `[]`, `{}`) -- the "non-empty" half of the minimum shape. */
export function isNonEmptyValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

/**
 * The minimum shape a genuine dispatch record should carry, per this repository's own
 * template (`templates/prompts/goldfish-task.md`, "Dispatch record (standard evidence)"):
 * `model`, `rulesetSha`, and a non-empty `report`. Deliberately narrow -- only these three,
 * nothing stricter (e.g. `agentType`/`commits` are NOT required here even though a
 * fully-shaped record would carry them too); see
 * `backlog/items/2026-08-29-dispatch-evidence-record-shape-not-enforced-beyond-taskid-and-outcome.md`.
 */
export function missingBriefingFields(record) {
  const missing = [];
  if (!isNonEmptyString(record?.model)) missing.push("model");
  if (!isNonEmptyString(record?.rulesetSha)) missing.push("rulesetSha");
  if (!isNonEmptyValue(record?.report)) missing.push("report");
  return missing;
}

/**
 * The pure core. All I/O arrives through `deps` so the regression suite can drive synthetic
 * commits without building a git fixture repository.
 */
export function verifyCommit(sha, deps) {
  const { readCommitMessage, readChangedPaths, readRecord, readBlobAtCommit, runAllowlistedGenerator } = deps;
  let message;
  try {
    message = readCommitMessage(sha);
  } catch (error) {
    return result(sha, VERDICT.unverifiable, "commit-unreadable", `commit could not be read: ${error.message}`);
  }

  const dispatch = parseDispatchTrailer(message);
  if (!dispatch) {
    return result(
      sha,
      VERDICT.unverifiable,
      "elephant-direct-undeclared",
      "no `Dispatch:` trailer — unbound to any record; a stage-0 Elephant commit should declare `Dispatch: stage-0 (elephant)`",
    );
  }
  if (dispatch.ambiguous) {
    return result(
      sha,
      VERDICT.fail,
      "trailer-ambiguous",
      `${dispatch.count} \`Dispatch:\` trailers on one commit (\`${dispatch.raw}\`) — exactly one is admitted; the authorship claim is ambiguous and the topmost is deliberately NOT picked`,
    );
  }
  if (dispatch.malformed) {
    return result(sha, VERDICT.fail, "trailer-malformed", `\`Dispatch: ${dispatch.raw}\` does not match \`<ID> (<role>)\``);
  }
  if (dispatch.role === "elephant") {
    if (dispatch.id !== ELEPHANT_STAGE0_ID) {
      return result(
        sha,
        VERDICT.unverifiable,
        "elephant-direct-nonstandard-id",
        `role \`elephant\` with id \`${dispatch.id}\`; the only sanctioned Elephant form is \`${ELEPHANT_STAGE0_ID} (elephant)\`, and no record is looked up for any other id`,
        { taskId: dispatch.id },
      );
    }
    let elephantPaths;
    try {
      elephantPaths = readChangedPaths(sha);
    } catch (error) {
      return result(sha, VERDICT.unverifiable, "commit-paths-unreadable", `changed paths unreadable: ${error.message}`, { taskId: dispatch.id });
    }
    if (elephantPaths.length > ELEPHANT_STAGE0_MAX_PATHS) {
      return result(
        sha,
        VERDICT.unverifiable,
        "elephant-direct-oversized",
        `declared Elephant-direct but touches ${elephantPaths.length} path(s), over the stage-0 bound of ${ELEPHANT_STAGE0_MAX_PATHS}; "small" is the one stage-0 condition this script can check and it does not hold`,
        { taskId: dispatch.id, pathCount: elephantPaths.length },
      );
    }
    return result(
      sha,
      VERDICT.pass,
      "elephant-direct-declared",
      `declared Elephant-direct (\`${dispatch.raw}\`) in the sanctioned form, ${elephantPaths.length} path(s), within the stage-0 bound of ${ELEPHANT_STAGE0_MAX_PATHS}; no dispatch record expected. "Disclosed" and "judgment-light" stay unchecked`,
      { taskId: dispatch.id, pathCount: elephantPaths.length },
    );
  }
  if (dispatch.role === "elephant-generated") {
    // ALLOWLIST GATE FIRST, before anything that touches the filesystem or a subprocess.
    // `dispatch.id` is attacker-influenced commit text; it is used ONLY as a `Map` lookup
    // key here, never concatenated into a path or a command argument (see the allowlist's
    // own SECURITY docstring above).
    const entry = ELEPHANT_GENERATOR_ALLOWLIST.get(dispatch.id);
    if (!entry) {
      return result(
        sha,
        VERDICT.unverifiable,
        "elephant-generated-not-allowlisted",
        `role \`elephant-generated\` names \`${dispatch.id}\`, which is not on the closed generator allowlist; refusing to execute it`,
        { taskId: dispatch.id },
      );
    }
    let generatedPaths;
    try {
      generatedPaths = readChangedPaths(sha);
    } catch (error) {
      return result(sha, VERDICT.unverifiable, "commit-paths-unreadable", `changed paths unreadable: ${error.message}`, { taskId: dispatch.id });
    }
    const uncoveredByGenerator = generatedPaths.filter((path) => coveringPath(path, [entry.outputPath]) === null);
    if (uncoveredByGenerator.length > 0) {
      return result(
        sha,
        VERDICT.fail,
        "elephant-generated-paths-not-covered",
        `declared \`elephant-generated\` (\`${dispatch.raw}\`) but touches path(s) the allowlisted generator does not produce: ${uncoveredByGenerator.join(", ")}`,
        { taskId: dispatch.id, uncovered: uncoveredByGenerator },
      );
    }
    let regenerated;
    try {
      regenerated = runAllowlistedGenerator(entry, sha);
    } catch (error) {
      return result(
        sha,
        VERDICT.unverifiable,
        "elephant-generated-rerun-failed",
        `re-running \`${entry.scriptPath}\` in an isolated checkout of the parent tree failed: ${error.message}`,
        { taskId: dispatch.id },
      );
    }
    let committed;
    try {
      committed = readBlobAtCommit(sha, entry.outputPath);
    } catch (error) {
      return result(
        sha,
        VERDICT.unverifiable,
        "commit-blob-unreadable",
        `\`${entry.outputPath}\` at ${sha} unreadable: ${error.message}`,
        { taskId: dispatch.id },
      );
    }
    if (regenerated !== committed) {
      return result(
        sha,
        VERDICT.fail,
        "elephant-generated-mismatch",
        `re-running \`${entry.scriptPath}\` against the commit's parent tree does NOT byte-match \`${entry.outputPath}\` as the commit left it`,
        { taskId: dispatch.id },
      );
    }
    return result(
      sha,
      VERDICT.pass,
      "elephant-generated-verified",
      `mechanically verified: re-running \`${entry.scriptPath}\` against an isolated checkout of the commit's parent tree reproduces \`${entry.outputPath}\` byte-for-byte`,
      { taskId: dispatch.id },
    );
  }
  if (dispatch.role !== "goldfish") {
    return result(sha, VERDICT.unverifiable, "unknown-role", `unrecognised dispatch role \`${dispatch.role}\``, { taskId: dispatch.id });
  }

  const taskId = dispatch.id;
  if (!isSafeTaskId(taskId)) {
    return result(
      sha,
      VERDICT.fail,
      "trailer-taskid-unsafe",
      `task id \`${taskId}\` is not a safe filename fragment (\`${SAFE_TASK_ID.source}\`); refusing to resolve it into a path under the evidence directory`,
      { taskId },
    );
  }
  let record;
  try {
    record = readRecord(taskId);
  } catch (error) {
    return result(sha, VERDICT.fail, "record-unreadable", `record for \`${taskId}\` could not be read: ${error.message}`, { taskId });
  }
  if (record === null) {
    return result(sha, VERDICT.fail, "record-missing", `trailer names \`${taskId}\` but no dispatch-record-${taskId}.json exists`, { taskId });
  }
  if (typeof record.taskId === "string" && record.taskId.trim() !== "" && record.taskId.trim() !== taskId) {
    return result(sha, VERDICT.fail, "record-taskid-mismatch", `trailer names \`${taskId}\`, record's own taskId is \`${record.taskId}\``, { taskId });
  }
  if (!isTerminalOutcome(record.outcome)) {
    return result(sha, VERDICT.fail, "record-not-terminal", `record outcome \`${record.outcome ?? "(absent)"}\` is not terminal`, { taskId });
  }
  const declaredShas = declaredCommits(record);
  if (declaredShas !== null && !declaredShas.some((candidate) => shasBind(sha, candidate))) {
    return result(sha, VERDICT.fail, "record-names-different-commit", `record names commit(s) \`${declaredShas.join("`, `")}\``, { taskId, declaredShas });
  }

  let changed;
  try {
    changed = readChangedPaths(sha);
  } catch (error) {
    return result(sha, VERDICT.unverifiable, "commit-paths-unreadable", `changed paths unreadable: ${error.message}`, { taskId });
  }

  const declared = declaredPaths(record);
  if (declared === null) {
    return result(sha, VERDICT.unverifiable, "record-has-no-machine-readable-paths", `record for \`${taskId}\` is terminal but declares no changedFiles`, {
      taskId,
    });
  }
  const uncovered = changed.filter((path) => coveringPath(path, declared) === null);
  if (uncovered.length > 0) {
    return result(sha, VERDICT.fail, "record-paths-do-not-cover", `record does not declare ${uncovered.length} changed path(s): ${uncovered.join(", ")}`, {
      taskId,
      uncovered,
    });
  }

  // Dimension 4: the recorded model, checked against the dispatched agent's own definition
  // (NVA-BL-78). Silent (no effect on verdict) when the record predates `agentType`.
  const modelCheck = compareRecordedModel(record);
  if (modelCheck.classification === "model-mismatch" || modelCheck.classification === "model-override-malformed") {
    return result(
      sha,
      VERDICT.fail,
      "model-mismatch",
      `path coverage is fine, but the recorded model contradicts the dispatched agent's definition: ${modelCheck.reason}`,
      { taskId, modelCheck },
    );
  }
  // pipeline.dispatch-record-briefing-fields-enforced -- checked LAST, only once every other
  // dimension already agrees, so this gates the PASS itself rather than pre-empting a more
  // specific FAIL/UNVERIFIABLE classification earlier in this function. A record missing
  // `model`, `rulesetSha`, or a non-empty `report` does not evidence that a real six-field
  // briefing (goldfish-task.md) actually existed for this dispatch, even if the SHA/outcome/
  // path-coverage dimensions above all check out.
  const missingFields = missingBriefingFields(record);
  if (missingFields.length > 0) {
    return result(
      sha,
      VERDICT.unverifiable,
      "record-missing-briefing-fields",
      `record for \`${taskId}\` is missing the minimum dispatch-record shape (\`${missingFields.join("`, `")}\`); it does not evidence that a real six-field briefing existed`,
      { taskId, missingFields },
    );
  }

  return result(sha, VERDICT.pass, "bound", `bound to \`${taskId}\` (outcome \`${record.outcome}\`, ${changed.length} path(s) covered)`, {
    taskId,
    modelCheck,
  });
}

export function gitDeps({ repoRoot = REPO_ROOT, evidenceDir = DEFAULT_EVIDENCE_DIR } = {}) {
  const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return {
    readCommitMessage: (sha) => git(["show", "-s", "--format=%B", `${sha}^{commit}`]),
    readChangedPaths: (sha) =>
      git(["show", "--no-renames", "--name-only", "--format=", `${sha}^{commit}`])
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    readRecord: (taskId) => readRecordFile(evidenceDir, taskId),
    readBlobAtCommit: (sha, path) => git(["show", `${sha}:${path}`]),
    runAllowlistedGenerator: (entry, sha) =>
      runGeneratorInIsolatedParentTree({ repoRoot, parentRef: `${sha}^`, scriptRelPath: entry.scriptPath, args: entry.args }),
  };
}

/** The naming convention, confirmed against the real corpus: `dispatch-record-<TASK_ID>.json`. */
export function readRecordFile(evidenceDir, taskId) {
  // Second line of defence: `verifyCommit` refuses an unsafe id before it gets here, but this
  // function is exported and is what any other caller reaches for, so it never builds a path
  // out of an unvalidated id either.
  if (!isSafeTaskId(taskId)) {
    throw new Error(`unsafe task id \`${taskId}\`: expected \`${SAFE_TASK_ID.source}\``);
  }
  const path = join(evidenceDir, `dispatch-record-${taskId}.json`);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(raw);
}

export function exitCodeFor(results, { strict = false } = {}) {
  if (results.some((entry) => entry.verdict === VERDICT.fail)) return 1;
  if (results.some((entry) => entry.verdict === VERDICT.unverifiable)) return strict ? 1 : 2;
  return 0;
}

export function formatLine(entry) {
  return `${entry.verdict.padEnd(12)} ${String(entry.sha).slice(0, 12).padEnd(12)} ${entry.classification}: ${entry.reason}`;
}

function main(argv) {
  const strict = argv.includes("--strict");
  const json = argv.includes("--json");
  const deps = gitDeps();
  const revisions = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--range") {
      const range = argv[i + 1];
      i += 1;
      if (!range) {
        process.stderr.write("--range needs a revision range\n");
        return 3;
      }
      const listed = execFileSync("git", ["rev-list", range], { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
      revisions.push(...listed);
      continue;
    }
    if (argv[i].startsWith("--")) continue;
    revisions.push(argv[i]);
  }
  if (revisions.length === 0) {
    process.stderr.write("usage: dispatch-authorship-verify.mjs [--strict] [--json] <sha>... | --range <a>..<b>\n");
    return 3;
  }
  const results = revisions.map((sha) => verifyCommit(sha, deps));
  if (json) process.stdout.write(`${JSON.stringify({ schema: "pipeline.dispatch-authorship.v1", results }, null, 2)}\n`);
  else for (const entry of results) process.stdout.write(`${formatLine(entry)}\n`);
  return exitCodeFor(results, { strict });
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));
