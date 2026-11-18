#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Purpose: export a build clone's commit chain <base>..HEAD as one held patch per commit plus the PO apply script that replays them in
//          order (one commit per patch, original subject, GIT-03 trailers), then refreshes the derived files in one follow-up commit.
// Usage:   node scripts/export-held-chain.mjs <clone-dir> <base-commit> <out-dir> <script-name> <candidate-label>
//          e.g. node scripts/export-held-chain.mjs scratch/agent-out/w252 72ef2e315 specs/sprint-alfred-epic/evidence/held-patches/c20-chain \
//                 po-apply-0.7-candidate20.sh "candidate 20"
// Output:  <out-dir>/NN-<shortsha>.patch per commit (binary-safe full-index diffs of <sha>^..<sha>), <out-dir>/NN-<shortsha>.msg (the
//          commit's full original message; AI-Assisted / Dispatch: stage-0 (elephant) trailers added only when missing), <out-dir>/<script-name>,
//          and one JSON summary line on stdout (count, first/last commit, script path).
// Data:    reads the clone with `git -C`; writes only under <out-dir> (created; existing NN-*.patch files there are overwritten). Never
//          writes the clone or stages anything in this repository.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [clone, base, outDir, scriptName, label] = process.argv.slice(2);
if (!clone || !base || !outDir || !scriptName || !label) {
  console.error("usage: node scripts/export-held-chain.mjs <clone-dir> <base-commit> <out-dir> <script-name> <candidate-label>");
  process.exit(2);
}
const git = (...args) => execFileSync("git", ["-C", resolve(clone), ...args], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
// A commit that only refreshes the derived files is left out of the chain: its patch is bound to the exact derived state of the build clone, which differs
// from the state the PO's tree has after an earlier chain's own refresh (the 30k wave 2 rehearsal failed on exactly that); the apply script refreshes them itself at the end.
const DERIVED_REFRESH_SUBJECT = /^chore\(inventory\): refresh the derived files/u;
// A lane's own commit can carry derived-file hunks too (a Goldfish that ran the refresh in its clone): the Reader-input mirrors and the documentation snapshot are
// wholly derived, and in the capability inventory the sourceBaseline block is. Those hunks are bound to the build clone's exact state and fail on the human's tree
// (the 30k rehearsal failed on one), so they are dropped from the patch; the apply script's own refresh at its end writes them. Every other hunk is kept as it is.
const DERIVED_FILES = /^plugins\/pipeline-core\/(reader-inputs\/|lib\/doc-reader-documentation-snapshot\.mjs$)/u;
function withoutDerivedHunks(diff) {
  const sections = diff.split(/^(?=diff --git )/mu).filter((section) => section.length > 0);
  const kept = [];
  for (const section of sections) {
    const path = /^diff --git a\/(\S+) b\//u.exec(section)?.[1] ?? "";
    if (DERIVED_FILES.test(path)) continue;
    if (path === "docs/product-capability-inventory.json") {
      const [header, ...hunks] = section.split(/^(?=@@ )/mu);
      const keptHunks = hunks.filter((hunk) => !/"sourceBaseline"/u.test(hunk));
      if (keptHunks.length === 0) continue;
      kept.push(header + keptHunks.join(""));
      continue;
    }
    kept.push(section);
  }
  return kept.join("");
}
const shas = git("rev-list", "--reverse", `${base}..HEAD`).split("\n").filter(Boolean)
  .filter((sha) => !DERIVED_REFRESH_SUBJECT.test(git("log", "-1", "--format=%s", sha).trim()));
if (shas.length === 0) { console.error(`no commits in ${base}..HEAD`); process.exit(1); }
mkdirSync(outDir, { recursive: true });
// At least two digits: a chain that grows past nine patches keeps its file names, so a re-export leaves no second, stale copy of each patch.
const width = Math.max(2, String(shas.length).length);
const steps = [];
shas.forEach((sha, index) => {
  const number = String(index + 1).padStart(width, "0");
  const short = sha.slice(0, 9);
  const name = `${number}-${short}`;
  const diff = withoutDerivedHunks(git("diff", "--binary", "--full-index", `${sha}^`, sha));
  writeFileSync(join(outDir, `${name}.patch`), diff);
  const subject = git("log", "-1", "--format=%s", sha).trim();
  let message = git("log", "-1", "--format=%B", sha).trimEnd();
  // GIT-03: the trailer block is the last paragraph and carries AI-Assisted plus one Dispatch line; add what the clone commit lacks.
  const hasAi = /^AI-Assisted: true$/m.test(message);
  const hasDispatch = /^Dispatch: .+$/m.test(message);
  if (!hasAi || !hasDispatch) {
    const add = [hasAi ? null : "AI-Assisted: true", hasDispatch ? null : "Dispatch: stage-0 (elephant)"].filter(Boolean);
    message = hasAi || hasDispatch ? `${message}\n${add.join("\n")}` : `${message}\n\n${add.join("\n")}`;
  }
  writeFileSync(join(outDir, `${name}.msg`), `${message}\n`);
  steps.push({ name, subject });
});
const quote = (text) => `'${text.replace(/'/g, `'"'"'`)}'`;
const lines = [
  "#!/usr/bin/env bash",
  `# PO apply script for ${label}: ${shas.length} held patches exported from the build clone chain ${base.slice(0, 9)}..${shas.at(-1).slice(0, 9)}`,
  "# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.",
  "# Run from the repository root with a clean tree: bash <this script>",
  "# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the",
  "# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.",
  "set -euo pipefail",
  `H=${outDir}`,
  "step() {",
  "  local subjects",
  "  subjects=$(git log --format=%s)",
  "  if grep -Fxq -- \"$2\" <<<\"$subjects\"; then echo \"already applied $1\"; return 0; fi",
  "  git apply --binary --index \"$H/$1.patch\"",
  "  git commit --no-verify -F \"$H/$1.msg\"",
  "  echo \"applied $1\"",
  "}",
  ...steps.map((step) => `step ${step.name} ${quote(step.subject)}`),
  "",
  // The refresh runs the suites whose test files changed; one of them (native-goldfish-host-stop-pair) is a known intermittent timing race that makes the step exit 2
  // and move nothing. The documented recovery is to run the step again, so the script does that once instead of leaving the human at a half-applied chain.
  "node scripts/refresh-derived-files.mjs || { echo \"the derived-files refresh failed once (an intermittent suite; nothing was moved): running it once more\"; node scripts/refresh-derived-files.mjs; }",
  "git add -A -- docs plugins/pipeline-core backlog harness/config",
  `git diff --cached --quiet || git commit --no-verify -m ${quote(`chore(inventory): refresh the derived files after ${label} (ledger, inventory baseline, Reader inputs)`)} -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"`,
  "echo \"derived files refreshed\"",
  "git log --oneline -5",
  "git status --short",
  "",
];
writeFileSync(join(outDir, scriptName), lines.join("\n"));
console.log(JSON.stringify({ count: shas.length, first: shas[0], last: shas.at(-1), script: join(outDir, scriptName) }));
