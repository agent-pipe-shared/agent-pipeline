#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validateLicenseContract } from "./check-license-contract.mjs";

const fixture = mkdtempSync(join(tmpdir(), "license-contract-"));
const write = (path, value) => { const absolute = join(fixture, ...path.split("/")); mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, value); };
write("LICENSE", "Sustainable Use License Version 1.0\nSPDX identifier: SUL-1.0\n");
write("LICENSE-DOCS", "same Sustainable Use License Version 1.0 unless a file states a different\nthird-party license\n");
write("NOTICE", "internal commercial-company operations; modifying a fork for your own purposes; only when Agent-Pipeline or a substantial derivative is itself monetized; legal identity has not yet been recorded. External pull requests may be discussed; no external contribution may be merged. Commercial intake, CLA/public activation, and commercial relicensing remain\nblocked\n");
write("docs/licensing.md", "100% owner-controlled; named human legal/rightsholder review remains required; does not purport to\nchange those grants retroactively\n");
write("setup.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("setup.test.mjs", "#!/usr/bin/env node\n// SPDX-License-Identifier: SUL-1.0\n");
write("harness/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n");
write("plugins/pipeline-core/.claude-plugin/plugin.json", '{"license":"SUL-1.0"}\n'); write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"SUL-1.0"}\n');
write("third-party-licenses.json", JSON.stringify({ dependencies: [{ name: "Contributor Covenant Code of Conduct", version: "2.1", license: "CC-BY-SA-4.0", path: "CODE_OF_CONDUCT.md", source: "https://www.contributor-covenant.org/version/2/1/code_of_conduct.html" }] }));
write("CODE_OF_CONDUCT.md", "<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->\nContributor Covenant version 2.1\nMozilla's code of conduct enforcement ladder\n");
write("CONTRIBUTOR_LICENSE_AGREEMENT.md", "does not guarantee effectiveness\ngrant of rights\nof use (`Nutzungsrechte`)\nexclusive, worldwide, may transfer and sublicense\nSUL-1.0 and separate commercial\nlegally required\nseparate declaration, form\nnamed human legal/rightsholder reviewer\n");
write(".github/PULL_REQUEST_TEMPLATE.md", "- [ ] **I have read and expressly accept the [Contributor License Agreement](../CONTRIBUTOR_LICENSE_AGREEMENT.md)**\nmust not be checked or inferred by a\nmaintainer, bot\n");

let result = validateLicenseContract(fixture); assert.equal(result.ok, true, result.findings.join("\n")); assert.equal(result.sourceCount, 4);
write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: Apache-2.0\n"); result = validateLicenseContract(fixture); assert.equal(result.ok, false); assert.match(result.findings.join("\n"), /example\.mjs lacks an SPDX SUL-1\.0 header|retains a current Apache-2\.0/);
write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"Apache-2.0"}\n'); result = validateLicenseContract(fixture); assert.equal(result.ok, false); assert.match(result.findings.join("\n"), /codex-plugin\/plugin\.json license must be SUL-1\.0/);
console.log("1..3\n# pass 3");
