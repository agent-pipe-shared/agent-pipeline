// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only Anthropic API catalogue observation. The credential stays in the
 * request header and is never copied into the result or a diagnostic. This
 * proves availability to that API credential, not to Claude Code OAuth.
 */
import { claudeApiAvailableModelIds } from "./model-role-session.mjs";

const ENDPOINT = "https://api.anthropic.com/v1/models";
const MAX_PAGES = 32;
const MAX_PAGE_BYTES = 262_144;

function unavailable(code) {
  return { ok: false, code, assurance: "api-credential-only", availableModelIds: [] };
}

async function readBoundedPage(response) {
  const reader = response?.body?.getReader?.();
  if (!reader) return null;
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) return null;
      bytes += item.value.byteLength;
      if (bytes > MAX_PAGE_BYTES) return null;
      chunks.push(Buffer.from(item.value));
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    return null;
  } finally {
    try { await reader.cancel(); } catch { /* A completed or failed stream needs no recovery. */ }
    try { reader.releaseLock(); } catch { /* Never surface transport text. */ }
  }
}

export async function observeAnthropicApiModels({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || apiKey.length < 1 || apiKey.length > 4096
    || /[\r\n\0]/u.test(apiKey) || typeof fetchImpl !== "function") {
    return unavailable("MODEL-ROLE-CLAUDE-API-CREDENTIAL-UNAVAILABLE");
  }
  const pages = [];
  let afterId = null;
  try {
    for (let index = 0; index < MAX_PAGES; index += 1) {
      const url = new URL(ENDPOINT);
      url.searchParams.set("limit", "1000");
      if (afterId !== null) url.searchParams.set("after_id", afterId);
      const response = await fetchImpl(url, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(10_000),
      });
      if (response?.status !== 200) return unavailable("MODEL-ROLE-CLAUDE-API-UNAVAILABLE");
      const page = await readBoundedPage(response);
      if (page === null) return unavailable("MODEL-ROLE-CLAUDE-API-RESPONSE-INVALID");
      pages.push({ requestAfterId: afterId, response: page });
      if (page.has_more === false) {
        const validated = claudeApiAvailableModelIds(pages);
        return validated.ok ? validated : unavailable(validated.code);
      }
      if (typeof page.last_id !== "string" || page.last_id.length === 0) {
        return unavailable("MODEL-ROLE-CLAUDE-API-RESPONSE-INVALID");
      }
      afterId = page.last_id;
    }
    return unavailable("MODEL-ROLE-CLAUDE-API-TRUNCATED");
  } catch {
    return unavailable("MODEL-ROLE-CLAUDE-API-UNAVAILABLE");
  }
}
