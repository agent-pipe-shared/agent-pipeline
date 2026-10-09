// Elephant (pre-push 2026-10-09): park every uncommitted tracked edit as a patch in the tracked handover folder,
// and copy the CRITIC-CKPT-F2 critic.md post-image into tranche-2, so the tree can be cleaned without losing work.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";

const OUT = "specs/sprint-alfred-epic/evidence/handover-2026-10-09/parked-patches";
mkdirSync(OUT, { recursive: true });
mkdirSync("specs/sprint-alfred-epic/signed-package/tranche-2/agents", { recursive: true });
copyFileSync("plugins/pipeline-core/agents/critic.md", "specs/sprint-alfred-epic/signed-package/tranche-2/agents/critic.md");

const groups = {
  "MECH-HAIKU-F.patch": ["plugins/pipeline-core/config/runner-mappings.json", "plugins/pipeline-core/config/routing-authority.json",
    "plugins/pipeline-core/agents/goldfish-mechanic.md", "policies/model-policy.md"],
  "CRITIC-CKPT-F2-critic-md.patch": ["plugins/pipeline-core/agents/critic.md"],
  "foreign-uncommitted.patch": ["plugins/pipeline-core/scripts/pipeline-state.mjs", "plugins/pipeline-core/lib/guard/sanctioned-args-onboarding.mjs",
    "harness/scripts/pipeline-state.test.mjs"],
};
const run = (args) => spawnSync("git", args, { encoding: "utf8", maxBuffer: 1 << 26 }).stdout;
const lines = [];
for (const [name, paths] of Object.entries(groups)) {
  const unstaged = run(["diff", "--", ...paths]);
  const staged = run(["diff", "--cached", "--", ...paths]);
  writeFileSync(`${OUT}/${name}`, `# staged part\n${staged}\n# unstaged part (apply after the staged part)\n${unstaged}`);
  lines.push(`${name}: staged ${staged.length} bytes, unstaged ${unstaged.length} bytes`);
}
writeFileSync(`${OUT}/README.md`, `# Parked uncommitted edits (2026-10-09, before the checkpoint push)\n\nEach patch holds a staged part and an unstaged part (\`git apply\` each part in order after removing the \`#\` header lines).\n- MECH-HAIKU-F.patch — mechanic → Haiku/medium; after-capture RED (RP31, migration-v3), needs a test slice first.\n- CRITIC-CKPT-F2-critic-md.patch — critic.md 65 turns + Write/Edit; ships ONLY with the signed tranche-2 guard (post-image also at signed-package/tranche-2/agents/critic.md).\n- foreign-uncommitted.patch — edits present before this session's wave (pipeline-state import edit, sanctioned-args-onboarding, pipeline-state.test); provenance unknown, preserved verbatim.\n\n${lines.map((l) => "- " + l).join("\n")}\n`);
console.log(lines.join("\n"));
