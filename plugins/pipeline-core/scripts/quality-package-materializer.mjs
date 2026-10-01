// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { applyCommittedQualityPackage, authorizeQualityPackageCommit, validateQualityPackageCommandArgs } from "../lib/signed-quality-package.mjs";

const args = process.argv.slice(2);
if (!validateQualityPackageCommandArgs(args, process.cwd())) {
  console.error("QUALITY-PACKAGE-COMMAND-INVALID");
  process.exitCode = 1;
} else {
  const [root, intentPath, proofPath, , mode] = args;
  try {
    const packageIntent = JSON.parse(readFileSync(intentPath, "utf8"));
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    const result = mode === "authorize-commit"
      ? authorizeQualityPackageCommit({ repoRoot: root, packageIntent, proof })
      : applyCommittedQualityPackage({ repoRoot: root, packageIntent, proof, applyToMain: mode === "apply" });
    if (!result.ok) { console.error(result.code); process.exitCode = 1; }
    else console.log(JSON.stringify(result));
  } catch { console.error("QUALITY-PACKAGE-INPUT-INVALID"); process.exitCode = 1; }
}
