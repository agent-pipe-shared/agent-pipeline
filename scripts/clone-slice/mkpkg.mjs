// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool mkpkg.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Compact slice description -> full pipeline.dispatch-briefing-package.v1 JSON (clone-slice route, held patch as the delivered artifact).
// usage: node scratch/agent-out/mkpkg.mjs <slice.json> <out package.json>
// slice.json keys: id, wave (e.g. "w76"), slug, title, goal, criterion, clone (scratch/agent-out/<name>), base (clone start sha),
//   write (clone-relative files the goldfish may change), context[], facts[], targeted[], forbidden[], stops[], estimatedToolCalls, agentType?
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const [inPath, outPath] = process.argv.slice(2);
const s = JSON.parse(readFileSync(resolve(inPath), "utf8"));
const held = "specs/sprint-alfred-epic/evidence/held-patches";
const stem = `${held}/${s.wave}-${s.slug}`;
const route = `CLONE-SLICE ROUTE (how this dispatch works; the Elephant verified it): you edit and test ONLY inside the scratch clone ${s.clone} (a shared clone of the applied chain at ${s.base}); plugin files are protected in the REAL checkout but are ordinary files inside the clone. Your deliverables in the real repository are exactly three new files: ${stem}.patch, ${stem}.notes.md and ${stem}.check.test.mjs. Never run a git command that writes; use the helper tools (each is one plain node command): \`node scratch/agent-out/test-in.mjs ${s.clone} <test file>\` runs a test file with a private TMPDIR (one suite at a time, never two in parallel); \`node scratch/agent-out/commit-in.mjs ${s.clone} "<conventional message>"\` commits everything inside the clone; \`node scratch/agent-out/save-patch.mjs ${s.clone} ${s.base} HEAD ${stem}.patch\` writes git diff --binary <base> HEAD into the real repository and prints \`apply --check on repo: exit 0\` when the patch applies to the real HEAD (it must).`;
// Optional chain: s.chain = { checkClone: "<clone dir with the earlier held patches applied>", on: "w76" }.
// The patch is then a delta ON TOP of earlier held patches: it is proven against checkClone, not the real HEAD.
const chainFact = s.chain ? `CHAIN SLICE: the clone ${s.clone} starts at ${s.base}, the repository state PLUS the already delivered held patch ${s.chain.on} (committed in the clone as its base commit), because this change edits the same files. Your patch is the delta ${s.base}..HEAD and therefore does NOT apply to the real checkout until ${s.chain.on} is applied first: save it with \`node scratch/agent-out/save-patch.mjs ${s.clone} ${s.base} HEAD ${stem}.patch ${s.chain.checkClone}\` and expect \`apply --check on ${s.chain.checkClone}: exit 0\`; an exit 1 against the real repository is expected and not an error.` : null;
const earlyFact =`BUDGET LESSON from the two previous dispatches of this kind (both reached the 80 % checkpoint with the patch still unwritten): write the deliverables EARLY and refine later. As soon as the first set of new cases is GREEN, immediately run commit-in.mjs and save-patch.mjs and write the .notes.md and .check.test.mjs; then continue (every further change = commit-in.mjs again and save-patch.mjs again to overwrite the patch). Never leave the three deliverables for the end. Run test suites strictly one at a time with test-in.mjs and READ each result before starting the next; do not start a background run.`;
const checkFact = s.chain
  ? `The ${s.wave}-${s.slug}.check.test.mjs is a plain node:test file (60 s limit, no producer or product run) asserting: (a) the .patch exists and is non-empty, (b) the patch touches only these files: ${s.write.join(", ")}. It does NOT run git apply against the repository (the patch is a delta on ${s.chain.on}); the notes state the required order.`
  : `The ${s.wave}-${s.slug}.check.test.mjs is a plain node:test file (60 s limit, no producer or product run) asserting: (a) the .patch exists and is non-empty, (b) \`git apply --check\` of it against the repository root exits 0 (spawnSync git, cwd = the repository root derived from import.meta.dirname, four levels up), (c) the patch touches only these files: ${s.write.join(", ")}.`;
const notesFact = `The ${s.wave}-${s.slug}.notes.md follows the shape of an existing notes file in ${held}/ (read ONE, e.g. w73-*.notes.md): what / why / not changed / not proven. No absolute host paths, no private names. State that the criterion binding ${s.criterion} is the closest existing accepted criterion and that the PRD and Spec are unchanged.`;
const pkg = {
  schema: "pipeline.dispatch-briefing-package.v1",
  id: s.id, item: s.slug, agentType: s.agentType ?? "goldfish-implementor", modelId: "claude-sonnet-5-5",
  criterion: s.criterion, estimatedToolCalls: s.estimatedToolCalls ?? 60,
  check: `${stem}.check.test.mjs`, title: s.title, ac: s.criterion,
  goal: `${s.goal} Delivered as the held patch ${stem}.patch (developed and tested in ${s.clone}).`,
  paths: [`${stem}.notes.md`],
  newFiles: [`${stem}.notes.md`, `${stem}.patch`, `${stem}.check.test.mjs`],  // slice-level s.newFiles are clone-only files, listed in write; not real-repo paths
  context: [...s.context, `${held}/ (read exactly one existing *.notes.md there for the notes shape)`],
  facts: [route, ...(chainFact ? [chainFact] : []), earlyFact, checkFact, notesFact, ...(s.facts ?? [])],
  targeted: [...s.targeted, `node --test ${stem}.check.test.mjs (the patch applies to the real HEAD and touches only the named files)`],
  forbidden: [...(s.forbidden ?? []), `Do not edit anything in the real checkout except the three new files ${stem}.{patch,notes.md,check.test.mjs}.`, `Inside the clone change only: ${s.write.join(", ")}.`],
  stops: s.stops ?? [],
};
writeFileSync(resolve(outPath), `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`wrote ${outPath}`);
