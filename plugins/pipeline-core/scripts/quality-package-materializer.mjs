// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { applyQualityPackage, authorizeQualityPackageCommit } from "../lib/signed-quality-package.mjs";

const [, , rootArg, intentPath, proofPath, policyPath, mode] = process.argv;
if (!rootArg || !intentPath || !proofPath || !policyPath || !isAbsolute(rootArg) || !["verify", "apply", "authorize-commit"].includes(mode)) {
  console.error("Usage: quality-package-materializer <absolute-repo-root> <intent-json> <proof-json> <critical-proof-policy-json> <verify|apply|authorize-commit>");
  process.exitCode = 1;
} else {
  const root = resolve(rootArg);
  try {
    const packageIntent = JSON.parse(readFileSync(intentPath, "utf8"));
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    const policy = JSON.parse(readFileSync(policyPath, "utf8"));
    const trustPolicy = policy?.trustAnchors?.find((anchor) => anchor?.keyReference === proof?.keyReference);
    const result = mode === "authorize-commit"
      ? authorizeQualityPackageCommit({ repoRoot: root, packageIntent, proof })
      : applyQualityPackage({ repoRoot: root, packageIntent, proof, trustPolicy, applyToMain: mode === "apply" });
    if (!result.ok) { console.error(result.code); process.exitCode = 1; }
    else console.log(JSON.stringify(result));
  } catch { console.error("QUALITY-PACKAGE-INPUT-INVALID"); process.exitCode = 1; }
}
