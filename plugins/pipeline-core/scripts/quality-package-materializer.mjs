// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "fs";
import { applyQualityPackage } from "../lib/signed-quality-package.mjs";

const root = process.argv[2];
const intentPath = process.argv[3];

if (!root || !intentPath) {
  console.error("Usage: quality-package-materializer <repo-root> <intent-json>");
  process.exit(1);
}

const intent = JSON.parse(readFileSync(intentPath, "utf8"));
const res = applyQualityPackage(root, intent, true);
if (!res.ok) {
  console.error("Failed to materialize:", res.error);
  process.exit(1);
}

console.log("Successfully materialized quality package!");
