// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { discoverThreatModel } from "./threat-model.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(root, id, artifactPath) {
  const prefix = join(root, "specs", id);
  const threat = "{}\n";
  mkdirSync(join(prefix, artifactPath.split("/").slice(0, -1).join("/")), { recursive: true });
  writeFileSync(join(prefix, "prd.md"), "prd\n");
  writeFileSync(join(prefix, artifactPath), threat);
  writeFileSync(join(prefix, "lifecycle.json"), JSON.stringify({
    schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "draft", candidate: null, supersedes: null,
    artifacts: [
      { class: "prd", path: `specs/${id}/prd.md`, sha256: sha("prd\n"), authority: true, mutability: "mutable", retention: "active" },
      { class: "threat-model", path: `specs/${id}/${artifactPath}`, sha256: sha(threat), authority: false, mutability: "immutable", retention: "retain" },
    ],
  }));
}

const first = mkdtempSync(join(tmpdir(), "threat-one-"));
const second = mkdtempSync(join(tmpdir(), "threat-two-"));
fixture(first, "alpha", "evidence/model.json");
fixture(second, "beta", "records/immutable/model.json");
assert.equal(discoverThreatModel(first).artifact.path, "specs/alpha/evidence/model.json");
assert.equal(discoverThreatModel(second).artifact.path, "specs/beta/records/immutable/model.json");
fixture(first, "bravo", "other/model.json");
assert.equal(discoverThreatModel(first).code, "THREAT-AMBIGUOUS-REGISTRATION");
assert.equal(discoverThreatModel(first, { featureId: "alpha" }).artifact.path, "specs/alpha/evidence/model.json");
console.log("4 threat-model discovery checks passed");
