#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validateLicenseContract } from "./check-license-contract.mjs";

const fixture = mkdtempSync(join(tmpdir(), "license-contract-"));
const write = (path, value) => { const absolute = join(fixture, ...path.split("/")); mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, value); };
const usageBoundary = "Affiliates, employees, contractors, and service providers may use the software solely on the licensee's internal operations. Independent consulting, training, and support are permitted when Agent-Pipeline is not itself monetized. sale; paid licensing or distribution; paid hosting, SaaS, or managed service; white-label use; material embedding as a value component of a paid product; or commercial redistribution.";
const licenseText = `Sustainable Use License Version 1.0\nSPDX identifier: SUL-1.0\nAgent-Pipeline Additional Permission\nThis permission supplements the unmodified\nSustainable Use License Version 1.0 text above. ${usageBoundary}\nThis additional permission expands only the permitted\ninternal-operation and independent-service uses.\n`;
const noticeText = `internal commercial-company operations; modifying a fork for your own purposes. This repository uses SUL-1.0 with the repository-specific Agent-Pipeline Additional\nPermission; the canonical URL identifies only the base SUL-1.0 text. ${usageBoundary} André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\ncontent and the commercial/CLA contracting party; excludes\nthird-party material identified in \`third-party-licenses.json\`, including Contributor Covenant. On 2026-07-23, André Twachtmann,\nacting as the named human\nrightsholder reviewer, approved activation\n`;
write("LICENSE", licenseText);
write("LICENSE-DOCS", `same Sustainable Use License Version 1.0 with the Agent-Pipeline Additional Permission; the SPDX\nidentifier and canonical URL name the unmodified base license unless a file states a different\nthird-party license. ${usageBoundary}\n`);
write("NOTICE", noticeText);
write("docs/licensing.md", `${usageBoundary} 100% owner-controlled; André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\ncontent and the commercial/CLA contracting party. Third-party material listed\nin \`third-party-licenses.json\`, including Contributor Covenant, remains under upstream ownership and license. On 2026-07-23, André\nTwachtmann, acting as the named human\nrightsholder reviewer, approved activation; maintainer, bot, or submission automation cannot accept; contributor-gates / cla-and-dco is a required status check and require the PR\nbranch to be current with \`main\` before merge; no immutable long-term archive is asserted; does not purport to\nchange those grants retroactively\n`);
write("CONTRIBUTING.md", `${usageBoundary} André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\ncontent and the CLA contracting party. Third-party material remains under the\nownership and license recorded in \`third-party-licenses.json\`. 2026-07-23 named human reviewer approved activation of the CLA process. both\nits DCO sign-off and the Contributor's personally checked, current-version CLA\nacceptance. maintainer, bot, or submission automation cannot\naccept on the Contributor's behalf. contributor-gates / cla-and-dco is a status check; pull-request\nbranch to be up to date with \`main\` before merge; server-side read-back confirming them\n`);
write("README.md", "Sustainable Use License 1.0 (SUL-1.0) with the Agent-Pipeline Additional Permission\nSustainable Use License 1.0 (SUL-1.0) mit der Agent-Pipeline Additional Permission\n");
write("docs/contributor-gate-security.md", "on `opened` the sender must be the PR author; on `edited` the sender must be the PR author. `synchronize` and `reopened` intentionally fail with CLA_ACCEPTANCE_REFRESH_REQUIRED. `trusted-gate` and `candidate` are separate from the GitHub `pull_request` event. Both disable persisted credentials and the workflow consumes no secrets. The receipt contains PR number, public account logins and never writes an email address into the receipt. It uses runner-temporary storage and is not uploaded as an artifact. Named-human data-privacy sign-off is still required before\npublic activation. Freeze merges. Revert the bad checker. perform an authenticated server-side read-back. Re-run the gate.\n");
write("specs/2026-07-19-sprint-sentinel-epic/snt-1-activation-prerequisite.md", "blocked; no HAW-E Result intent, release consent, publication, or\nbacklog mutation is authorized. private license-gate receipt digest and neutral-public license-gate receipt digest. append-only history remains truthful and must not be edited or filled with invented values. applyBacklogTransition uses a recoverable transaction writer. already `closed`; no same-state evidence-amendment\noperation. `resultSha256`, `transitionSha256`, `privateLicenseGateSha256`, `neutralPublicLicenseGateSha256`.\n");
write("setup.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("setup.test.mjs", "#!/usr/bin/env node\n// SPDX-License-Identifier: SUL-1.0\n");
write("harness/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n");
write("plugins/pipeline-core/.claude-plugin/plugin.json", '{"license":"SUL-1.0"}\n'); write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"SUL-1.0"}\n');
write("third-party-licenses.json", JSON.stringify({ dependencies: [{ name: "Contributor Covenant Code of Conduct", version: "2.1", license: "CC-BY-SA-4.0", path: "CODE_OF_CONDUCT.md", source: "https://www.contributor-covenant.org/version/2/1/code_of_conduct.html" }] }));
write("CODE_OF_CONDUCT.md", "<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->\nContributor Covenant version 2.1\nMozilla's code of conduct enforcement ladder\n");
const cla = "<!-- CLA-Version: 1.0 -->\ndoes not guarantee effectiveness\nAndré Twachtmann, the legal rightsholder for Agent-Pipeline project-authored\ncontent, the recipient of the Contributor's grants under this Agreement, and\nthe CLA contracting party\ndoes not claim rights in third-party material identified in\n`third-party-licenses.json`\nOn 2026-07-23, André Twachtmann, acting as the\nnamed human rightsholder reviewer, approved activation\ngrant of rights\nof use (`Nutzungsrechte`)\nexclusive, worldwide, may transfer and sublicense\nSUL-1.0 and separate commercial\nlegally required\nseparate declaration, form\nboth the DCO sign-off and the Contributor's\npersonally checked, current-version CLA record\n";
write("CONTRIBUTOR_LICENSE_AGREEMENT.md", cla);
const claDigest = createHash("sha256").update(cla, "utf8").digest("hex");
write(".github/PULL_REQUEST_TEMPLATE.md", `identifies André Twachtmann as legal\nrightsholder for Agent-Pipeline project-authored content and CLA contracting\nparty, excluding inventoried third-party material\n- [ ] **CLA acceptance — Agent-Pipeline CLA v1.0 (SHA-256: \`${claDigest}\`) — I, @REPLACE_WITH_PR_AUTHOR_LOGIN, have read and expressly accept this CLA for every contribution in this pull request and confirm that I have the rights needed to make its grants.**\nchanging the CLA invalidates earlier acceptance\nmaintainer, bot, or\nsubmission automation must not check or rewrite it\n`);
write(".github/workflows/contributor-gates.yml", "on:\n  pull_request:\n    branches:\n      - main\n    types:\n      - opened\n      - reopened\n      - synchronize\n      - edited\npermissions:\n  contents: read\npersist-credentials: false\nnode trusted-gate/harness/scripts/check-pr-contributor-gates.mjs\n--root candidate\n--cla-root trusted-gate\n");

let result = validateLicenseContract(fixture); assert.equal(result.ok, true, result.findings.join("\n")); assert.equal(result.sourceCount, 4);
write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: Apache-2.0\n"); result = validateLicenseContract(fixture); assert.equal(result.ok, false); assert.match(result.findings.join("\n"), /example\.mjs lacks an SPDX SUL-1\.0 header|retains a current Apache-2\.0/);
write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"Apache-2.0"}\n'); result = validateLicenseContract(fixture); assert.equal(result.ok, false); assert.match(result.findings.join("\n"), /codex-plugin\/plugin\.json license must be SUL-1\.0/);
write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"SUL-1.0"}\n');
write("NOTICE", "André Twachtmann is not identified as the contracting party\n");
result = validateLicenseContract(fixture);
assert.equal(result.ok, false);
assert.match(result.findings.join("\n"), /NOTICE lacks project-authored legal rightsholder and contracting party/);
write("NOTICE", noticeText);
write("LICENSE", licenseText.replace("Agent-Pipeline Additional Permission", "Unlabelled permission"));
result = validateLicenseContract(fixture);
assert.equal(result.ok, false);
assert.match(result.findings.join("\n"), /LICENSE lacks separate Agent-Pipeline Additional Permission/);
write("LICENSE", licenseText.replace("contractors, and service providers", "contractors"));
result = validateLicenseContract(fixture);
assert.equal(result.ok, false);
assert.match(result.findings.join("\n"), /LICENSE lacks internal-operations delegation boundary/);
console.log("1..6\n# pass 6");
