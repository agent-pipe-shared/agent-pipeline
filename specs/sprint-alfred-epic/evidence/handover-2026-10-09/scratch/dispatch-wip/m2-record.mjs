import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const p = "evidence/dispatch-record-ADR0085-M2-20261009.json";
const r = JSON.parse(readFileSync(p, "utf8"));
const text = [
  "Read-only measurement ADR0085-M2 at d8b5d5a64 (dirty tree). Both probes ran; no commit, no tracked change. independent review: pending.",
  "planApproval.schema: pipeline.plan-approval.v7",
  "probe1 rereadApprovedDesignWorkflowPackage: ok=true code=undefined mode=signature",
  "probe2 designAdvisoryAdmission: ok=true code=undefined mode=approved-workflow-package-signature",
  "Evidence: evidence/ADR0085-F3a-20261009/m2.txt via capture-evidence.mjs, wrapped exit code 0.",
].join("\n");
r.outcome = "read-only-completed";
r.outcomeClassification = { schema: "pipeline.dispatch-outcome-classification.v1", kind: "read-only" };
r.commits = [];
r.report = { text, changedFiles: [] };
r.resultSha256 = createHash("sha256").update(text, "utf8").digest("hex");
r.log.push({ phase: "closed", toolUses: 22 });
writeFileSync(p, JSON.stringify(r, null, 2) + "\n");
