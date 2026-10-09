import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2];
const files = [
  "plugins/pipeline-core/scripts/check-routing-projections.test.mjs",
  "plugins/pipeline-core/lib/p3b-runner-conformance.test.mjs",
  "plugins/pipeline-core/lib/runner-profile-migration-v2.test.mjs",
  "plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.test.mjs",
  "plugins/pipeline-core/scripts/runner-contracts.schema.test.mjs",
];
mkdirSync("evidence/MECH-HAIKU-F-20261009", { recursive: true });
let txt = "";
for (const f of files) {
  const r = spawnSync(process.execPath, ["--test", f], { encoding: "utf8", maxBuffer: 1 << 28 });
  const o = (r.stdout || "") + (r.stderr || "");
  const keep = o.split("\n").filter((l) => /^# (tests|pass|fail)|^not ok|^\s+not ok/.test(l)).join("\n");
  txt += `=== ${f}\nexit ${r.status}\n${keep}\n\n`;
}
writeFileSync(out, txt);
console.log(txt);
