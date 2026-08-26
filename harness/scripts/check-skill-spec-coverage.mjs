#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-skill-spec-coverage — does the pipeline-start skill still carry the
 * obligations its own specification defines?
 *
 * `harness/session-bootstrap.md` is the specification; the skill directory
 * `plugins/pipeline-core/skills/pipeline-start/` (SKILL.md + references/) is
 * its executable form. Nothing else compares the two, so a restructure can
 * silently drop an obligation that every session then stops performing while
 * still reporting itself as correctly bootstrapped. This check closes exactly
 * that gap for a FIXED TABLE of literal obligation anchors.
 *
 * How a probe works: each entry names a `spec` anchor and a `skill` anchor.
 * The spec anchor must still be found in the ENGLISH part of the spec (the
 * German reference translation below the DE-REFERENCE-BELOW marker is cut off
 * and never searched) — otherwise the table itself is stale and the check
 * fails rather than passing silently. The skill anchor must be found either
 * anywhere in the skill directory (`scope: "dir"`, lazy-loading friendly) or
 * in SKILL.md itself (`scope: "core"`) where the spec demands the content be
 * embedded without a runtime file read.
 *
 * WHAT THIS CHECK DOES NOT DO — read this before trusting a green line:
 *  - It does not check semantics. A probe passes on a literal string match;
 *    an obligation reworded, negated, or made conditional around that string
 *    still passes.
 *  - It does not check paraphrases. An obligation restored in different words
 *    fails even though it is present.
 *  - It does not check completeness of the table. An obligation the spec
 *    defines but nobody entered here is not covered at all; the table is a
 *    curated list, not a derivation from the spec.
 *  - It does not check ordering, step numbering, cross-references, runtime
 *    behaviour, or whether an agent actually performs the obligation.
 *  - It does not check the reverse direction: skill content with no spec
 *    basis is not reported.
 *  - It does not check any other skill; only pipeline-start.
 *
 * Usage: node harness/scripts/check-skill-spec-coverage.mjs [--report <path>]
 * Exit 0 = every probe covered. Exit 1 = at least one gap or stale anchor.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const specPath = join(repoRoot, "harness", "session-bootstrap.md");
const skillDir = join(repoRoot, "plugins", "pipeline-core", "skills", "pipeline-start");
const corePath = join(skillDir, "SKILL.md");
const DE_MARKER = "DE-REFERENCE-BELOW";

const rawSpec = readFileSync(specPath, "utf8");
const markerAt = rawSpec.indexOf(DE_MARKER);
const spec = markerAt === -1 ? rawSpec : rawSpec.slice(0, markerAt);
const core = readFileSync(corePath, "utf8");
const refDir = join(skillDir, "references");
const refNames = readdirSync(refDir).filter((n) => n.endsWith(".md")).sort();
const refs = refNames.map((n) => readFileSync(join(refDir, n), "utf8")).join("\n");
const dir = `${core}\n${refs}`;

/**
 * step  — the specification step the obligation comes from.
 * spec  — proof the specification still defines it (English part only).
 * skill — proof the skill directory still carries it.
 * scope — "core": must live in SKILL.md (spec demands no runtime file read);
 *         "dir":  may live in SKILL.md or any reference file (lazy loading).
 */
const PROBES = [
  {
    id: "confirmation-line-format",
    step: "Step 6",
    spec: /Bootstrap check passed: ruleset/u,
    skill: /Bootstrap check passed: ruleset/u,
    scope: "core",
    note: "the mandatory, literally checked self-confirmation line",
  },
  {
    id: "confirmation-line-not-without-steps",
    step: "Step 6 (Prohibition)",
    spec: /emitting the line without steps 1[–-]5/u,
    skill: /Steps? 1[–-]5/u,
    scope: "core",
    note: "no confirmation line without the steps behind it",
  },
  {
    id: "role-prohibitions-line",
    step: "Step 1d / §6.1",
    spec: /Role prohibitions loaded: EL-01\/EL-02\/EL-03\/EL-04\/EL-16\/EL-18\/EL-19/u,
    skill: /Role prohibitions loaded: EL-01\/EL-02\/EL-03\/EL-04\/EL-16\/EL-18\/EL-19/u,
    scope: "core",
    note: "the third mandatory confirmation line, verbatim",
  },
  {
    id: "role-prohibitions-embedded-list",
    step: "Step 1d",
    spec: /NO extra file reading at runtime/u,
    skill: /EL-01[\s\S]*EL-02[\s\S]*EL-03[\s\S]*EL-04[\s\S]*EL-16[\s\S]*EL-18[\s\S]*EL-19/u,
    scope: "core",
    note: "all seven prohibitions embedded, not behind a lazy reference",
  },
  {
    id: "calibration-existence-first",
    step: "Step 3",
    spec: /calibration file \*\*exists\*\*/u,
    skill: /project\/pipeline\.json/u,
    scope: "dir",
    note: "calibration existence check at the resolved authority tier",
  },
  {
    id: "calibration-denies-elsewhere",
    step: "Step 3 (denies)",
    spec: /denies\*\* don't live in the calibration file/u,
    skill: /denies[\s\S]{0,200}settings\.json/u,
    scope: "dir",
    note: "denies are checked where they live, not in the calibration file",
  },
  {
    id: "handover-single-source",
    step: "Step 4",
    spec: /sole authoritative state source/u,
    skill: /sole authoritative state source/u,
    scope: "dir",
    note: "handover is the one state source; memory is a mirror",
  },
  {
    id: "handover-drift-threshold",
    step: "Step 4 (drift)",
    spec: /\$driftThreshold/u,
    skill: /\$driftThreshold/u,
    scope: "dir",
    note: "handover drift warning and its per-project override",
  },
  {
    id: "handover-forbidden-for-briefed-roles",
    step: "§6.2/§6.3",
    spec: /briefing replaces handover/u,
    skill: /briefing replaces the handover/u,
    scope: "dir",
    note: "Goldfish/Critic must not read handover or history",
  },
  {
    id: "verify-gate-availability",
    step: "Step 5",
    spec: /the project's \*\*one\*\* verify script exists/u,
    skill: /Verify availability/u,
    scope: "dir",
    note: "verify availability is established at bootstrap, not at task end",
  },
  {
    id: "operator-update-reminder",
    step: "Step 5b",
    spec: /`\/reload-plugins`/u,
    skill: /reload-plugins/u,
    scope: "dir",
    note: "runner-specific operator refresh boundary before the confirmation",
  },
  {
    id: "confirmation-addition-f3-offline",
    step: "Step 6 (additions)",
    spec: /Staleness unchecked \(offline, cache state\)/u,
    skill: /Staleness unchecked \(offline, cache state\)/u,
    scope: "dir",
    note: "the defined offline addition",
  },
  {
    id: "confirmation-addition-f4-missing",
    step: "Step 6 (additions)",
    spec: /MISSING \(F4\)/u,
    skill: /MISSING \(F4\)/u,
    scope: "dir",
    note: "F4 prints the line with MISSING (F4) plus its mandatory suffix",
  },
  {
    id: "confirmation-variant-goldfish",
    step: "§6.2",
    spec: /State briefing/u,
    skill: /State briefing/u,
    scope: "dir",
    note: "Goldfish State field carries the briefing reference",
  },
  {
    id: "confirmation-variant-critic",
    step: "§6.3",
    spec: /State n\/a \(Critic sees no history\)/u,
    skill: /State n\/a \(Critic sees no history\)/u,
    scope: "dir",
    note: "Critic State field is deliberately n/a",
  },
];

const lines = [];
const results = [];
for (const probe of PROBES) {
  const haystack = probe.scope === "core" ? core : dir;
  const specSeen = probe.spec.test(spec);
  const skillSeen = probe.skill.test(haystack);
  const status = !specSeen ? "STALE-ANCHOR" : skillSeen ? "covered" : "MISSING";
  results.push({ ...probe, status });
  lines.push(
    `${status.padEnd(12)} ${probe.id.padEnd(38)} ${probe.step.padEnd(20)} scope=${probe.scope}  ${probe.note}`,
  );
}

const missing = results.filter((r) => r.status === "MISSING");
const stale = results.filter((r) => r.status === "STALE-ANCHOR");
const covered = results.length - missing.length - stale.length;

lines.unshift(
  "skill-spec coverage — harness/session-bootstrap.md (English part) vs " +
    "plugins/pipeline-core/skills/pipeline-start/",
  `probes: ${results.length} · covered: ${covered} · missing: ${missing.length} · stale anchors: ${stale.length}`,
  `reference files scanned: ${refNames.join(", ")}`,
  "",
);

if (missing.length > 0) {
  lines.push("", "GAPS — the spec defines these, the skill directory does not carry them:");
  for (const m of missing) {
    lines.push(
      `  - ${m.id} (${m.step}, scope ${m.scope}): ${m.note}`,
      `    expected pattern: ${m.skill}`,
    );
  }
}
if (stale.length > 0) {
  lines.push("", "STALE ANCHORS — the spec no longer contains the probe's own anchor.");
  lines.push("  Fix the table deliberately; do not let it pass silently:");
  for (const s of stale) lines.push(`  - ${s.id} (${s.step}): ${s.spec}`);
}

const ok = missing.length === 0 && stale.length === 0;
lines.push(
  "",
  ok
    ? `skill-spec coverage: ${covered}/${results.length} literal obligation anchors present. ` +
        "Covered classes: confirmation-line contract and its defined additions, role " +
        "variants, embedded Elephant role prohibitions, calibration existence/denies, " +
        "handover authority and drift, verify availability, operator update reminder. " +
        "NOT covered: semantics, paraphrases, obligations absent from this table, " +
        "ordering, runtime behaviour, other skills."
    : `skill-spec coverage FAILED: ${missing.length} gap(s), ${stale.length} stale anchor(s).`,
);

const report = `${lines.join("\n")}\n`;
process.stdout.write(report);

const reportIdx = process.argv.indexOf("--report");
if (reportIdx !== -1 && process.argv[reportIdx + 1]) {
  writeFileSync(resolve(process.argv[reportIdx + 1]), report, "utf8");
}

process.exit(ok ? 0 : 1);
