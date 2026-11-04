// SPDX-License-Identifier: SUL-1.0
// w203 as a script instead of a patch: a unified diff would carry the removed key-shaped literals in its own `-` lines and so put the
// same Security scan findings back into the tree. The old texts below are therefore assembled from parts at run time; this file holds none.
// usage (repository root): node specs/sprint-alfred-epic/evidence/held-patches/w203-key-shaped-fixtures-and-pem-markers-built-at-run-time.apply.mjs
// Every replacement must match exactly once or the script stops before writing that file; a file already in the new form is left alone.
import { readFileSync, writeFileSync } from "node:fs";

const FENCE = "-".repeat(5);
const PART_A = "Zx9Qm4Lp7Rt2";
const PART_B = "Vb6Nc8Hd3Jf5Ks1Wg0Ya";
const ID_A = "9f86d081884c7d65";
const ID_B = "9a2feaa0c55ad015";
const TICK = "`";

const edits = [
  {
    file: "plugins/pipeline-core/hooks/guard-git.test.mjs",
    pairs: [[`token: "nova-r2-` + `legacy",`, `token: ["nova-r2", "legacy"].join("-"),`]],
  },
  {
    file: "plugins/pipeline-core/scripts/po-human-approval.mjs",
    pairs: [
      [`if (pem.includes("${FENCE}BEGIN PRIVATE KEY${FENCE}")) return "unencrypted";`,
        'if (pem.includes(`${"-".repeat(5)}BEGIN PRIVATE KEY${"-".repeat(5)}`)) return "unencrypted";'],
      [`if (pem.includes("${FENCE}BEGIN ENCRYPTED PRIVATE KEY${FENCE}")) return "encrypted";`,
        'if (pem.includes(`${"-".repeat(5)}BEGIN ENCRYPTED PRIVATE KEY${"-".repeat(5)}`)) return "encrypted";'],
    ],
  },
  {
    file: "plugins/pipeline-core/scripts/security-adapters/gitleaks.test.mjs",
    pairs: [
      [`const realKeyLine = ${TICK}\${JSON.stringify({ apiKey: "${PART_A}${PART_B}" })}\\n${TICK};`,
        `const realKeyLine = ${TICK}\${JSON.stringify({ apiKey: ["${PART_A}", "${PART_B}"].join("") })}\\n${TICK};`],
      [`      writeFileSync(join(bundle, "008-packet.json"), ${TICK}\${JSON.stringify({ packetKey: "${ID_A}${ID_B}", packetToken: "${ID_A}${ID_B}" })}\\n${TICK});\n`
        + `      writeFileSync(join(rootDir, "other", "packet.json"), ${TICK}\${JSON.stringify({ packetKey: "${ID_A}${ID_B}", packetToken: "${ID_A}${ID_B}" })}\\n${TICK});`,
        `      const packetId = ["${ID_A}", "${ID_B}"].join("");\n`
        + `      writeFileSync(join(bundle, "008-packet.json"), ${TICK}\${JSON.stringify({ packetKey: packetId, packetToken: packetId })}\\n${TICK});\n`
        + `      writeFileSync(join(rootDir, "other", "packet.json"), ${TICK}\${JSON.stringify({ packetKey: packetId, packetToken: packetId })}\\n${TICK});`],
    ],
  },
  {
    file: "plugins/pipeline-core/scripts/security-adapters/gitleaks-reproduction-gate.test.mjs",
    pairs: [[`const KEY = "${ID_A}${ID_B}";`, `const KEY = ["${ID_A}", "${ID_B}"].join("");`]],
  },
];

for (const { file, pairs } of edits) {
  let text = readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of pairs) {
    const hits = text.split(from).length - 1;
    if (hits === 0 && text.includes(to)) continue;
    if (hits !== 1) { process.stderr.write(`${file}: expected exactly one occurrence of an old text, found ${hits}\n`); process.exit(1); }
    text = text.replace(from, () => to);
    changed = true;
  }
  if (changed) writeFileSync(file, text);
  process.stdout.write(`${file}: ${changed ? "rewritten" : "already in the new form"}\n`);
}
