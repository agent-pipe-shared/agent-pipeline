// SPDX-License-Identifier: SUL-1.0
/** Bind an admitted Codex session model to a separately valid V3 Critic duty. */
import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/u;

export function applyCriticSessionModelRoute(route, sessionSelection) {
  const fallback = { model: route.model, effort: route.effort,
    sourceSha256: route.sourceSha256 };
  if (sessionSelection?.ok !== true || sessionSelection.status !== "ready"
    || sessionSelection.runner !== "codex"
    || sessionSelection.taskRoute !== `duty.${route.dutyId}`
    || sessionSelection.effort !== route.effort
    || typeof sessionSelection.modelId !== "string"
    || sessionSelection.modelId.length === 0
    || sessionSelection.modelId.trim() !== sessionSelection.modelId
    || !SHA256.test(sessionSelection.readbackSha256 ?? "")
    || !SHA256.test(sessionSelection.receiptSha256 ?? "")) return fallback;
  return { model: sessionSelection.modelId, effort: route.effort,
    sourceSha256: createHash("sha256").update(JSON.stringify({
      v3SourceSha256: route.sourceSha256,
      admissionSha256: sessionSelection.readbackSha256,
      receiptSha256: sessionSelection.receiptSha256,
    })).digest("hex") };
}
