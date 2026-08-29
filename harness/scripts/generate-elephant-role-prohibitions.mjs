#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Generate the "Role prohibitions" bootstrap-summary block that
 * `plugins/pipeline-core/skills/pipeline-start/SKILL.md` embeds, from
 * `roles/elephant.md`'s own numbered EL-NN headings and their `Rule:` text.
 *
 * WHY THIS EXISTS. The printed summary used to be typed directly into
 * SKILL.md as a fixed list of EL ids and hand-crafted paraphrases, with no
 * mechanism tying it to the role contract it summarizes -- a future edit to
 * `roles/elephant.md` (a new prohibition, a reworded one, a renumbered one)
 * had nothing that would propagate it into the printed line; the two files
 * could silently disagree indefinitely. See
 * `backlog/items/2026-08-29-pipeline-start-hardcodes-a-stale-copy-of-the-elephant-role-prohibitions.md`.
 * Same generated-artifact pattern as
 * `harness/scripts/generate-agent-obligations.mjs` (read that file's own
 * header first): produced from the source at generation time, committed
 * (agents read a file, not a program), pinned by a byte-equality test.
 *
 * SELECTION -- which EL ids appear in a SHORT, "read no file for this"
 * bootstrap summary, and which do not. `roles/elephant.md` defines roughly
 * three dozen MUST/MUST-NOT-tagged ids; most are operational dispatch-
 * pipeline duties (spec/PO gates, Critic triggers, ledger discipline,
 * scheduling, escalation, communication cadence) -- real MUST rules, but not
 * a bootstrap-time DO-NOT boundary a session needs to recite before starting
 * work. The selection below is not a second hand-picked list: it is derived
 * from the file's OWN classification (its literal "(MUST NOT)" tag, and its
 * own section titled "Hard prohibitions"), plus exactly one stated, visible
 * forced addition.
 *
 * INCLUDED, and why (in print order):
 *   - EL-01, EL-02, EL-03, EL-04, EL-16, EL-18: every id carrying a literal
 *     "(MUST NOT)" tag anywhere in the file. All six happen to live under
 *     "## 3. Hard prohibitions" -- the file's own section title is the
 *     selection criterion, not a boundary chosen by this generator.
 *   - EL-19: forced inclusion beyond the "(MUST NOT)" criterion (it is
 *     tagged "(MUST)", not "(MUST NOT)"). Reason, stated here because ACC-3
 *     of the originating backlog item requires it: EL-19 (the PO PRD gate)
 *     is the duty paired with EL-01 in practice -- printing it alongside the
 *     prohibitions warns the session about the one MUST duty whose omission
 *     turns an EL-01 breach (implementing without a PRD release) into an
 *     unrecoverable one. This also matches the confirmation line's existing,
 *     unrelated-to-this-generator hand-maintained tail clause ("PRD gate:
 *     present readably + wait for 'approved'"), which is meaningless without
 *     EL-19 present in the id list above it.
 *
 * EXCLUDED -- every OTHER id in the file carrying a MUST/MUST-NOT rule (or,
 * conservatively, a section-level id introduced only via a "## N. Title
 * (EL-NN)" heading with a `Rule:` bullet but no literal MUST tag, e.g.
 * EL-05, EL-13 -- included in this accounting rather than silently skipped
 * because the originating backlog item names EL-05 by name as an example of
 * what the old hand-typed summary omitted):
 *
 *   - EL-05, EL-06, EL-07, EL-08, EL-09, EL-10, EL-11, EL-12, EL-20, EL-21,
 *     EL-22, EL-23, EL-24, EL-25, EL-25a, EL-26, EL-27, EL-28, EL-29, EL-30,
 *     EL-31, EL-32, EL-33: reason "dispatch-pipeline-duty" below. Every one
 *     of these lives in `roles/elephant.md`'s "## 4./5. Briefing duty /
 *     Dispatch-pipeline duties" sections -- they describe HOW to run the
 *     pipeline (spec/PO gates other than EL-19, Critic trigger/framing/gate
 *     discipline, ledger, parallel scheduling, escalation, PO communication
 *     cadence, compact checkpoints, package sizing), not a prohibition
 *     boundary a fresh bootstrap needs recited before it may act.
 *   - EL-13, EL-13a, EL-13b, EL-14, EL-15, EL-17: reason
 *     "debugging-or-communication-guidance" below. These live in "## 6.
 *     Harness-first debugging" and "## 7. Communication rules" -- workflow
 *     advice for how to debug a failing agent or talk to the PO, not a
 *     prohibition.
 *
 * A DATA DEFECT DISCOVERED WHILE BUILDING THIS, NOT FIXED BY IT: the source
 * file itself reuses the ids EL-29, EL-30 and EL-31 for two DIFFERENT
 * prohibitions each (once under "## 5. Dispatch-pipeline duties", once under
 * "## 7. Communication rules"). This generator's accounting check treats
 * every occurrence of a reused id as excluded under the same
 * "dispatch-pipeline-duty" / "debugging-or-communication-guidance" reason as
 * its sibling and does not attempt to renumber or otherwise edit
 * `roles/elephant.md` -- out of this task's scope by explicit prohibition
 * (this task never edits the substance of an EL rule).
 *
 * Usage:
 *   node harness/scripts/generate-elephant-role-prohibitions.mjs            # write SKILL.md
 *   node harness/scripts/generate-elephant-role-prohibitions.mjs --stdout   # print the block, write nothing
 *   node harness/scripts/generate-elephant-role-prohibitions.mjs --root <dir>  # derive from another checkout (used by the drift test)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../../plugins/pipeline-core/lib/entrypoint.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ELEPHANT_ROLE_PATH = join(REPO_ROOT, "roles", "elephant.md");
export const SKILL_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "skills", "pipeline-start", "SKILL.md");

export const START_MARKER = "<!-- GENERATED FROM roles/elephant.md -- do not hand-edit this block; regenerate";
export const END_MARKER = "<!-- END GENERATED: role-prohibitions block -->";

/** Print order and forced membership. See the module doc comment above for the reason each id is here. */
export const INCLUDED_EL_IDS = Object.freeze(["EL-01", "EL-02", "EL-03", "EL-04", "EL-16", "EL-18", "EL-19"]);

const DISPATCH_PIPELINE_DUTY =
  "operational dispatch-pipeline duty (roles/elephant.md §4/5) -- describes HOW to run the pipeline, not a bootstrap-time prohibition boundary";
const DEBUGGING_OR_COMMUNICATION_GUIDANCE =
  "debugging/communication workflow guidance (roles/elephant.md §6/7), not a prohibition";

/** Every EL id the parser may encounter that is deliberately excluded, with its reason. Never silently dropped: renderRoleProhibitions() throws if an encountered id is in neither this map nor INCLUDED_EL_IDS. */
export const EXCLUDED_EL_IDS = Object.freeze({
  "EL-05": DISPATCH_PIPELINE_DUTY,
  "EL-06": DISPATCH_PIPELINE_DUTY,
  "EL-07": DISPATCH_PIPELINE_DUTY,
  "EL-08": DISPATCH_PIPELINE_DUTY,
  "EL-09": DISPATCH_PIPELINE_DUTY,
  "EL-10": DISPATCH_PIPELINE_DUTY,
  "EL-11": DISPATCH_PIPELINE_DUTY,
  "EL-12": DISPATCH_PIPELINE_DUTY,
  "EL-20": DISPATCH_PIPELINE_DUTY,
  "EL-21": DISPATCH_PIPELINE_DUTY,
  "EL-22": DISPATCH_PIPELINE_DUTY,
  "EL-23": DISPATCH_PIPELINE_DUTY,
  "EL-24": DISPATCH_PIPELINE_DUTY,
  "EL-25": DISPATCH_PIPELINE_DUTY,
  "EL-25a": DISPATCH_PIPELINE_DUTY,
  "EL-26": DISPATCH_PIPELINE_DUTY,
  "EL-27": DISPATCH_PIPELINE_DUTY,
  "EL-28": DISPATCH_PIPELINE_DUTY,
  "EL-29": DISPATCH_PIPELINE_DUTY, // reused id, both occurrences: see "A DATA DEFECT..." above
  "EL-30": DISPATCH_PIPELINE_DUTY, // reused id, both occurrences
  "EL-31": DISPATCH_PIPELINE_DUTY, // reused id, both occurrences (§5 AND §7 -- the §7 one is also caught via the "debugging-or-communication" heading match, same reason text applies)
  "EL-32": DISPATCH_PIPELINE_DUTY,
  "EL-33": DISPATCH_PIPELINE_DUTY,
  "EL-13": DEBUGGING_OR_COMMUNICATION_GUIDANCE,
  "EL-13a": DEBUGGING_OR_COMMUNICATION_GUIDANCE,
  "EL-13b": DEBUGGING_OR_COMMUNICATION_GUIDANCE,
  "EL-14": DEBUGGING_OR_COMMUNICATION_GUIDANCE,
  "EL-15": DEBUGGING_OR_COMMUNICATION_GUIDANCE,
  "EL-17": DEBUGGING_OR_COMMUNICATION_GUIDANCE,
});

// Hand-maintained tail of the confirmation blockquote line: this exact
// sentence is a literal-checked string ELSEWHERE in the repository (this
// same file text is asserted verbatim by roles/elephant.md's own §9
// Elephant confirmation-line spec) -- it is prose, not data any component
// exports, so it cannot be derived. Editing it here without also updating
// every other literal-checked carrier of the same string is a drift this
// generator cannot detect; grep for "Role prohibitions loaded" before
// touching it.
const CONFIRMATION_TAIL =
  " — implementation only via Goldfish dispatch (Tier-0 per roles/elephant.md — EL-01; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'";

const HEADING3_RE = /^### (EL-\d+[a-z]?) \((MUST(?: NOT)?)\)\s*(?:—|-)\s*(.+)$/u;
const HEADING2_RE = /^## \d+[a-zA-Z]?\.\s*.*\((EL-\d+[a-z]?)\)\s*$/u;
const RULE_RE = /^-\s+\*\*Rule:\*\*\s*(.+)$/u;

/**
 * Parse every EL-NN heading in `roles/elephant.md` (both the "### EL-NN
 * (MUST...)" subheading form used throughout §3/§5/§7, and the "## N. Title
 * (EL-NN)" section-heading form used for EL-05 and EL-13), each paired with
 * the first `- **Rule:**` bullet line that follows it. A reused id (EL-29,
 * EL-30, EL-31 -- see the module doc comment) appears as TWO separate
 * entries here, on purpose: this function reports what the file actually
 * contains, duplicates included, rather than silently collapsing them.
 */
export function parseElephantHeadings(text) {
  const lines = text.split("\n");
  const headings = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m3 = HEADING3_RE.exec(line);
    if (m3) {
      headings.push({ id: m3[1], tag: m3[2], title: m3[3].trim(), lineIndex: i });
      continue;
    }
    const m2 = HEADING2_RE.exec(line);
    if (m2) {
      const title = line
        .replace(/^## \d+[a-zA-Z]?\.\s*/u, "")
        .replace(/\s*\(EL-\d+[a-z]?\)\s*$/u, "")
        .trim();
      headings.push({ id: m2[1], tag: null, title, lineIndex: i });
    }
  }
  for (let h = 0; h < headings.length; h += 1) {
    const start = headings[h].lineIndex + 1;
    const end = h + 1 < headings.length ? headings[h + 1].lineIndex : lines.length;
    let rule = null;
    for (let i = start; i < end; i += 1) {
      const mr = RULE_RE.exec(lines[i]);
      if (mr) {
        rule = mr[1].trim();
        break;
      }
    }
    headings[h].rule = rule;
  }
  return headings;
}

/**
 * Extract a short, grammatically closed lead clause from a `Rule:` bullet's
 * text: the text up to the first sentence-ending `.`/`!`/`?` that is NOT
 * inside an odd (still-open) run of `"` quote characters or `` ` `` backtick
 * code-span characters -- so a period inside `` `docs/state.md` `` or inside
 * a `"..."` quoted clause never truncates mid-token. Falls back to the whole
 * line (trailing `:` stripped) when the line has no such boundary, which is
 * the shape of EL-03's Rule bullet (it introduces a lettered sub-list
 * instead of ending in a sentence).
 */
export function firstSentence(text) {
  let quoteCount = 0;
  let backtickCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') quoteCount += 1;
    else if (ch === "`") backtickCount += 1;
    else if (ch === "." || ch === "!" || ch === "?") {
      let end = i + 1;
      let effQuote = quoteCount;
      let effBacktick = backtickCount;
      if (text[end] === '"') {
        effQuote += 1;
        end += 1;
      }
      if (text[end] === "`") {
        effBacktick += 1;
        end += 1;
      }
      const atBoundary = end >= text.length || /\s/u.test(text[end]);
      if (effQuote % 2 === 0 && effBacktick % 2 === 0 && atBoundary) {
        return text.slice(0, end).trim();
      }
    }
  }
  return text.replace(/:\s*$/u, "").trim();
}

function wrap(text, width = 79) {
  const words = text.split(/\s+/u).filter(Boolean);
  const out = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width && line) {
      out.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) out.push(line);
  return out.join("\n");
}

export function renderRoleProhibitions({ rootDir = REPO_ROOT } = {}) {
  const roleText = readFileSync(join(rootDir, "roles", "elephant.md"), "utf8");
  const headings = parseElephantHeadings(roleText);

  // Accounting duty (backlog item ACC-3): every encountered id must be
  // either included or explicitly excluded with a reason -- never silently
  // dropped.
  for (const heading of headings) {
    const included = INCLUDED_EL_IDS.includes(heading.id);
    const excluded = Object.prototype.hasOwnProperty.call(EXCLUDED_EL_IDS, heading.id);
    if (!included && !excluded) {
      throw new Error(
        `generate-elephant-role-prohibitions: ${heading.id} (roles/elephant.md line ${heading.lineIndex + 1}, ` +
          `"${heading.title}") is accounted for in neither INCLUDED_EL_IDS nor EXCLUDED_EL_IDS -- ` +
          "add it to one, with a stated reason if excluded, per the originating backlog item's acceptance bar.",
      );
    }
  }

  const byId = new Map();
  for (const heading of headings) if (!byId.has(heading.id)) byId.set(heading.id, heading);

  const items = INCLUDED_EL_IDS.map((id) => {
    const heading = byId.get(id);
    if (!heading || !heading.rule) {
      throw new Error(`generate-elephant-role-prohibitions: ${id} is in INCLUDED_EL_IDS but has no Rule: text in roles/elephant.md at rootDir=${rootDir}`);
    }
    const short = firstSentence(heading.rule).replace(/\.$/u, "");
    return `${id} ${short}`;
  });

  const paragraph = wrap(
    `**Role prohibitions (Elephant, embedded — read no file for this):** ${items.join(" · ")}. Print verbatim under the Model/Effort line:`,
  );
  const confirmation = `> Role prohibitions loaded: ${INCLUDED_EL_IDS.join("/")}${CONFIRMATION_TAIL}`;

  const commentLines = [
    `${START_MARKER}`,
    "     it via this repository's own generator script (self-application-only,",
    "     ADR-0015). Which EL ids appear here, and why every other MUST/MUST-NOT",
    "     id in roles/elephant.md is excluded, is documented at the generator's",
    "     own source — never restated here, so there is exactly one place",
    "     selection can drift. -->",
  ].join("\n");

  return `${commentLines}\n${paragraph}\n\n${confirmation}\n${END_MARKER}\n`;
}

function replaceBlock(skillText, block) {
  const startIndex = skillText.indexOf(START_MARKER);
  const endIndex = skillText.indexOf(END_MARKER);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`generate-elephant-role-prohibitions: could not find ${START_MARKER} / ${END_MARKER} markers in SKILL.md`);
  }
  const endOfEnd = endIndex + END_MARKER.length;
  return `${skillText.slice(0, startIndex)}${block}${skillText.slice(endOfEnd)}`;
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rootDir = argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : REPO_ROOT;
  const block = renderRoleProhibitions({ rootDir });
  if (argv.includes("--stdout")) {
    process.stdout.write(block);
  } else {
    const skillPath = join(rootDir, "plugins", "pipeline-core", "skills", "pipeline-start", "SKILL.md");
    const current = readFileSync(skillPath, "utf8");
    const next = replaceBlock(current, block.replace(/\n$/u, ""));
    writeFileSync(skillPath, next, "utf8");
    process.stdout.write(`wrote role-prohibitions block into ${skillPath} (${Buffer.byteLength(block, "utf8")} bytes)\n`);
  }
}
