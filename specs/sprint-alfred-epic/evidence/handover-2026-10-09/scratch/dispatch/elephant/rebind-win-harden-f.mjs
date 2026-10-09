import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = "evidence/dispatch-record-WIN-HARDEN-F-20261009.json";
const record = JSON.parse(readFileSync(path, "utf8"));
const wrong = "- Commit: c7abe2c1a, the production file only";
if (!record.report.text.includes(wrong)) throw new Error("expected wrong commit line not found");
record.report.text = record.report.text.replace(wrong, "- Commit: 5a72c9b61, the production file only");
record.commits = ["5a72c9b610938b58832d3f6d4ee58f6a6b6ff25d"];
record.report.changedFiles = ["plugins/pipeline-core/lib/windows-private-state.mjs"];
record.log.push({ phase: "Elephant rebind (Ruling 154): the dispatch's writer had read HEAD after a concurrent commit; commits, changedFiles and the Commit line corrected to 5a72c9b61, resultSha256 recomputed over the corrected text", toolUses: 50 });
record.resultSha256 = createHash("sha256").update(record.report.text, "utf8").digest("hex");
writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
console.log(record.resultSha256);
