#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Consumer-safe-path gate.
 *
 * Fails when a documentation artifact this repository ships to a consumer
 * project under `plugins/pipeline-core/` (skill instructions, their
 * references, agent definitions, plugin docs) names a path that resolves
 * only inside THIS repository's own source checkout and never inside an
 * installed plugin. Closes the class recorded in
 * `backlog/items/2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md`
 * (CB-1b, direction 4): "Add a check that fails the build when a shipped
 * artifact names a source-only path... this is the piece that matters most."
 *
 * Scope: every tracked file under `plugins/pipeline-core/` (AC-8's literal
 * scope) -- not just the shipped skill Markdown. A first pass scoped this
 * check to Markdown only; a coordinator-directed widening (CB-1b) found the
 * larger set matters too, because `harness/`-prefixed paths also appear in
 * RUNTIME MESSAGES an operator reads when a guard denies a command (e.g.
 * `guard-push.mjs`, `guard-devplan.mjs`, `guard-git.mjs`,
 * `stop-suggest.mjs`) -- exactly the defect class this item is about, not
 * merely a documentation nicety.
 *
 * Not every match is a defect. Three classes were found in the full sweep:
 *
 *   A. Runtime messages a consumer will read that name a source-only path --
 *      genuine instances of this item's defect class. NOT fixed by this
 *      dispatch (scope was narrowed by the coordinator mid-task); allowlisted
 *      here with the class stated, as the classified handoff inventory for
 *      the follow-up dispatch that fixes them.
 *   B. Legitimate references to this repository's own harness/ layout,
 *      correct as written: a bare citation to canon documentation not read
 *      as a command, or a step explicitly gated to run only inside the
 *      Pipeline's own source checkout (self-application, ADR-0015).
 *   C. Test fixtures, imports, and comments inside `*.test.mjs` files and
 *      analogous non-shipped internal tooling -- never read by a consumer as
 *      an instruction. The bulk of the raw hit count.
 *
 * The ALLOWLIST below carries a stated reason -- naming the class -- for
 * every entry, matched either by exact (file, substring) or by a
 * `filePattern` regex applied file-wide (used for the class-C bulk, to avoid
 * hundreds of near-duplicate per-line entries for files whose entire content
 * is non-shipped). An allowlist entry that stops matching anything is itself
 * reported as a finding -- a stale entry is exactly the kind of place a real
 * regression could hide.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const decoder = new TextDecoder("utf-8", { fatal: true });

const SCAN_PREFIX = "plugins/pipeline-core/";

// Minimum set from the backlog item's direction 4. Prefix matching, not
// exact-path matching: `harness/` also catches `harness/checklists/...` and
// `harness/definition-of-done.md`, both real citation classes found in the
// initial sweep.
export const SOURCE_ONLY_PREFIXES = Object.freeze(["harness/", "specs/sprint-nova-epic/", "setup.mjs"]);

export const ALLOWLIST = Object.freeze([
  {
    file: "plugins/pipeline-core/skills/close-feature/SKILL.md",
    match: "harness/scripts/usage-ledger.mjs",
    reason:
      "Content defect, not a path defect (CB-1b stop condition, field 5): usage-ledger.mjs " +
      "has no plugin-relative equivalent anywhere under plugins/pipeline-core/ -- no path " +
      "substitution makes this instruction consumer-correct. Reported as an open item for a " +
      "separate decision rather than silently left broken or silently rewritten.",
  },
  {
    file: "plugins/pipeline-core/skills/pipeline-start/SKILL.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Self-application only (ADR-0015): this exact command runs exclusively inside the " +
      "Pipeline's own source checkout, gated by \"Only a checkout carrying the Pipeline " +
      "source manifest is required\". The Consumer-project branch of the same step resolves " +
      "to not-applicable and explicitly instructs the agent never to look for, copy, or " +
      "repair this path there.",
  },
  {
    file: "plugins/pipeline-core/skills/pipeline-start/references/failure-cases.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Same self-application-only scoping as pipeline-start/SKILL.md's Observation " +
      "governance step: F6 is explicitly \"mandatory only in the Public source checkout\".",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/checklists/session-close.md",
    reason:
      "Bare citation to this repository's own canon documentation, explicitly labelled " +
      "\"(agent-pipeline repo -- canon pointers, not runtime reads)\" in the same sentence -- " +
      "never a command a consumer executes.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/definition-of-done.md",
    reason: "Bare parenthetical citation to the DoD source, not a runtime command.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/checklists/small-session.md",
    reason: "Bare parenthetical citation to the close-light companion checklist, not a runtime command.",
  },
  {
    file: "plugins/pipeline-core/skills/critic-review/SKILL.md",
    match: "harness/review-protocol.md",
    reason:
      "Bare citation in a list explicitly labelled \"Canon pointers (agent-pipeline repo, not " +
      "runtime reads)\" -- never a command a consumer executes.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Explicitly scoped \"(Agent-Pipeline checkout only)\" in the same sentence -- the same " +
      "self-application-only pattern as pipeline-start/SKILL.md's Observation governance step.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/scripts/usage-ledger.mjs",
    reason:
      "Content defect, not a path defect (CB-1b stop condition, field 5) -- same gap as " +
      "close-feature/SKILL.md's usage-ledger.mjs reference; no plugin-relative equivalent exists.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/scripts/model-prices.json",
    reason:
      "Companion data file of the same harness-only usage-ledger.mjs telemetry capability; " +
      "same content-defect gap, no plugin-relative equivalent exists.",
  },

  // --- Widened sweep (CB-1b, coordinator-directed): every tracked file under
  // plugins/pipeline-core/, not just Markdown. See the module doc comment for
  // the A/B/C taxonomy. Class A entries are real defects, NOT fixed by this
  // dispatch -- the reason says so explicitly and this is the handoff
  // inventory for the follow-up remediation dispatch.

  {
    filePattern: /\.test\.mjs$/u,
    reason:
      "Class C: test file (fixtures, imports of source-repo-only test helpers, or comments) -- " +
      "the bulk of the raw hit count. Never shipped as, or read by a consumer as, an instruction.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-devplan.mjs",
    match: "harness/scripts/pipeline-state.mjs, never by hand).",
    reason: "Class A: a real guard-denial message an operator reads, naming a path a consumer does not have. Not fixed by this dispatch (scope narrowed mid-task) -- deferred to a separate remediation dispatch.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-devplan.mjs",
    match: "this hook is a READER, never a writer.",
    reason: "Class B: source comment (`* ...`), not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-git.mjs",
    match: "R2 of specs/sprint-nova-epic/implementation/one-approval-all-layers-design.md",
    reason: "Class B: source comment (`// ...`), not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-git.mjs",
    match: "typed phrase (record one: node harness/scripts/pipeline-state.mjs approve-push",
    reason: "Class A: a real guard-denial message an operator reads, naming a path a consumer does not have. Not fixed by this dispatch -- deferred to a separate remediation dispatch.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/guard-lifecycle-ready\.mjs$/u,
    reason: "Class B: both occurrences are source comments (`// ...` / `* ...`) citing this repository's own Nova-sprint planning documents, not operator-facing messages.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/guard-push\.mjs$/u,
    reason: "Class A: every occurrence in this file is a real guard-denial or guidance message an operator reads on the push path (the path CB-1a made reachable for a consumer), naming harness/scripts/pipeline-state.mjs, which a consumer does not have. Not fixed by this dispatch (scope narrowed mid-task) -- deferred to a separate remediation dispatch; this whole-file entry is the handoff marker for it.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/guard-testpath\.mjs$/u,
    reason: "Class B: source comment citing roles/goldfish.md and harness/definition-of-done.md, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/hooks\.json$/u,
    reason: "Class B: the `$comment` metadata field documents hook wiring for a maintainer, citing `node setup.mjs`. Not an operator-facing message; setup.mjs's own consumer-reachability is tracked by a separate backlog item (2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md), not this check.",
  },
  {
    file: "plugins/pipeline-core/hooks/setup-check.mjs",
    match: "`node setup.mjs` (see SETUP.md)",
    reason: "Class A: the two constructed message branches this hook actually returns to the operator, naming setup.mjs. Whether a given consumer has setup.mjs is the separate backlog item named above; flagged here as this check's defect class regardless. Not fixed by this dispatch -- deferred.",
  },
  {
    file: "plugins/pipeline-core/hooks/setup-check.mjs",
    match: "setup.mjs",
    reason: "Class B: every other setup.mjs mention in this file is a doc comment explaining what the hook detects, not a constructed operator-facing message (those are the separate, more specific entry above).",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/stop-suggest\.mjs$/u,
    reason: "Class A: `PHASE_GATE_MAP[\"security-scan\"].command` is the literal string later surfaced verbatim in the Stop-hook's suggested-next-step message (pinned by stop-suggest.test.mjs), naming harness/scripts/security-scan.mjs. Not fixed by this dispatch -- deferred to a separate remediation dispatch.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/critic-packet-governance\.mjs$/u,
    reason: "Class B: `path.startsWith(\"harness/\")` is internal path-classification logic for this repository's own Critic-packet governance (used only when Critic reviews run inside this repo), not a path assumption about a consumer's tree.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/guard-maintenance-window\.mjs$/u,
    reason: "Class B: source comment citing this repository's own Nova-sprint design doc, not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/lib/human-guard-override.mjs",
    match: "harness/scripts/verify.mjs",
    reason: "Class B (coordinator-confirmed): deliberately requires harness/scripts/verify.mjs as a source-root marker -- correct self-application logic, not a consumer-facing path assumption.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/machine-plane\.mjs$/u,
    reason: "Class B: source comment citing this repository's own Nova-sprint planning document, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/nova-candidate-freeze\.mjs$/u,
    reason: "Class B: compares against a literal specs/sprint-nova-epic/... constant used only by this repository's own Nova-sprint candidate-freeze release tooling -- self-application-only, never invoked as a generic consumer command.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/nova-increment-receipt\.mjs$/u,
    reason: "Class B: an array of literal specs/sprint-nova-epic/... evidence paths used only by this repository's own Nova-sprint increment-receipt release tooling -- self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/observation-governance-bootstrap\.mjs$/u,
    reason: "Class B (coordinator-confirmed): names the checker (harness/scripts/check-observation-governance.mjs) that by design only exists in a source checkout; the bootstrap skill's own Observation-governance step already explains this to the agent.",
  },
  {
    file: "plugins/pipeline-core/lib/po-gate-authority.mjs",
    match: "project has the plugin but no setup.mjs",
    reason: "Class B: source comment, not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/lib/po-gate-authority.mjs",
    match: "Run node setup.mjs --publish-po-profile",
    reason: "Class unclear: a constructed repair message that names \"the canonical primary checkout\" rather than the current repo, which may or may not make it consumer-reachable in practice. Not confidently classified within this dispatch's budget -- left for the follow-up dispatch's judgment rather than guessed.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/security-evidence-evaluator\.mjs$/u,
    reason: "Class B: both occurrences are source comments citing harness/scripts/security-scan.mjs's schema shape, not operator-facing messages.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/security-evidence-fixture-matrix\.mjs$/u,
    reason: "Class B: source comments citing harness/scripts/security-scan.mjs and its adapters, not operator-facing messages.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/ai-assisted-hardening-gate\.mjs$/u,
    reason: "Class B: scope/policy/dependency constants for this repository's own internal AI-assisted-hardening gate (evaluates security deltas in THIS repo's own CI) -- self-application-only tooling, not a consumer-facing path.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/antigravity-alpha-adapter\.mjs$/u,
    reason: "Class B: a literal Nova-sprint-specific evidence path, this repository's own release data.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/check-state-budgets\.mjs$/u,
    reason: "Class B: a protected-paths list for this repository's own internal state-budget validation, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/codex-critic-isolation\.mjs$/u,
    reason: "Class B: a protected-artifact-paths list used by this repository's own internal Critic-isolation testing, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/codex-isolated-critic-protected-preimage\.v1\.json$/u,
    reason: "Class B: fixture data naming which paths an isolated Critic session may read, used only when Critic reviews run inside this repository -- self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/critic-bare\.mjs$/u,
    reason: "Class B: source comment citing harness/review-protocol.md, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/critic-verdict\.schema\.json$/u,
    reason: "Class B: a JSON-Schema \"description\" field citing harness/review-protocol.md as documentation, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/guard-maintenance-window\.mjs$/u,
    reason: "Class unclear: DEFAULT_PLAN/DEFAULT_SPEC constants defaulting to specs/sprint-nova-epic/... paths. Whether a consumer using this feature without overriding the defaults would hit a real gap was not confidently determined within this dispatch's budget -- left for the follow-up dispatch rather than guessed.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/pipeline-state\.mjs$/u,
    reason: "Class B: three doc comments -- one citing this file's own test path (possibly itself slightly stale; not independently verified), two explaining the now-superseded specs/sprint-nova-epic/... threat-model path CB-1a already fixed at runtime. pipeline-state.mjs is out of this dispatch's edit scope by explicit prohibition regardless of finer classification.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/po-human-approval\.mjs$/u,
    reason: "Class B: source comment citing this repository's own Nova-sprint planning document, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/public-baseline-diagnose\.mjs$/u,
    reason: "Class B: FULL_VERIFY_COMMAND is a constant used by this repository's own internal baseline-diagnose tooling, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/release-version-plan\.mjs$/u,
    reason: "Class B: source comment citing harness/scripts/check-pr-contributor-gates.mjs, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/run-codex-critic-probe-split\.mjs$/u,
    reason: "Class B: a protected-artifact-paths list used by this repository's own internal Codex-Critic-probe tooling, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/run-codex-isolation-control-decomposition\.mjs$/u,
    reason: "Class B: same self-application-only protected-artifact-paths pattern as run-codex-critic-probe-split.mjs.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/v3-bootstrap-authority\.mjs$/u,
    reason: "Class B: source comment explicitly discussing that consumer roots are not required to ship setup.mjs -- already self-aware of the consumer/source distinction.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/nova-b5-candidate-freeze-v2\.schema\.json$/u,
    reason: "Class B: a `const` binding path embedded in a JSON Schema used only by this repository's own Nova-sprint candidate-freeze release tooling, self-application-only.",
  },
]);

function posixPath(value) {
  return value.split(sep).join("/");
}

function gitListPlugin(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--", SCAN_PREFIX], { cwd: root, encoding: "buffer" });
  if (result.status !== 0) throw new Error(`git ls-files failed with exit ${result.status ?? "unknown"}`);
  return decoder
    .decode(result.stdout)
    .split("\0")
    .filter(Boolean)
    .map(posixPath)
    .sort();
}

function defaultReadText(file) {
  return decoder.decode(readFileSync(file));
}

function fileAllowed(filePath, allowlist, usedAllowlistIndices) {
  const index = allowlist.findIndex((entry) => entry.filePattern && entry.filePattern.test(filePath));
  if (index < 0) return false;
  usedAllowlistIndices.add(index);
  return true;
}

/**
 * Scan one file's already-read text for the banned prefixes, honoring the
 * allowlist. Exported separately so a caller (the test suite) can exercise
 * the line-matching logic without touching the filesystem or git.
 */
export function checkText(filePath, text, allowlist, usedAllowlistIndices) {
  const findings = [];
  if (fileAllowed(filePath, allowlist, usedAllowlistIndices)) return findings;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const prefix of SOURCE_ONLY_PREFIXES) {
      if (!line.includes(prefix)) continue;
      const allowIndex = allowlist.findIndex((entry) => entry.file === filePath && entry.match && line.includes(entry.match));
      if (allowIndex >= 0) {
        usedAllowlistIndices.add(allowIndex);
        continue;
      }
      findings.push(`${filePath}:${i + 1}: names source-only path prefix "${prefix}" -- ${line.trim()}`);
    }
  }
  return findings;
}

export function checkRepository(rootInput, options = {}) {
  const root = resolve(rootInput);
  const readText = options.readText ?? defaultReadText;
  const files = options.scanPaths ?? gitListPlugin(root);
  const allowlist = options.allowlist ?? ALLOWLIST;
  const usedAllowlistIndices = new Set();
  const findings = [];

  for (const file of files) {
    let text;
    try {
      text = readText(resolve(root, file));
    } catch (error) {
      findings.push(`${file}: could not read as UTF-8 text (${error.message}) -- excluded from this check, not silently passed`);
      continue;
    }
    findings.push(...checkText(file, text, allowlist, usedAllowlistIndices));
  }

  allowlist.forEach((entry, index) => {
    if (usedAllowlistIndices.has(index)) return;
    const label = entry.filePattern ? `filePattern ${entry.filePattern}` : `"${entry.match}" in ${entry.file}`;
    findings.push(`allowlist: entry for ${label} never matched anything -- remove it`);
  });

  findings.sort();
  return { findings, stats: { filesScanned: files.length, allowlistEntries: allowlist.length } };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex < 0 || rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-consumer-safe-paths.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const root = rootIndex === 0 ? args[1] : defaultRoot;
  try {
    const result = checkRepository(root);
    if (result.findings.length) {
      for (const item of result.findings) process.stderr.write(`CONSUMER-PATH ${item}\n`);
      process.stderr.write(`Consumer-safe-path check failed: ${result.findings.length} finding(s).\n`);
      process.exit(2);
    }
    process.stdout.write(
      `Consumer-safe-path check passed: ${result.stats.filesScanned} tracked file(s) under ${SCAN_PREFIX}, ` +
        `${result.stats.allowlistEntries} allowlist entr${result.stats.allowlistEntries === 1 ? "y" : "ies"} (all used).\n`,
    );
  } catch (error) {
    process.stderr.write(`Consumer-safe-path check unavailable: ${error.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
