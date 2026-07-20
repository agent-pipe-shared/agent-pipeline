// SPDX-License-Identifier: Apache-2.0
import { spawnSync as nodeSpawnSync } from "node:child_process";

const FORMATS = Object.freeze({ sha1: 40, sha256: 64 });

/** Observe the fixed Git source identity without a shell or caller-controlled environment. */
export function observeGitSource(root, { spawnFn = nodeSpawnSync, timeoutMs = 5000 } = {}) {
  const run = (args) => {
    let result;
    try {
      result = spawnFn("git", ["-C", root, ...args], {
        encoding: "utf8",
        env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
        maxBuffer: 1024 * 1024,
        shell: false,
        timeout: timeoutMs,
      });
    } catch (error) {
      return { ok: false, code: error?.code === "ETIMEDOUT" ? "SO-TIMEOUT" : "SO-SPAWN" };
    }
    if (result.error?.code === "ETIMEDOUT") return { ok: false, code: "SO-TIMEOUT" };
    if (result.error) return { ok: false, code: "SO-SPAWN" };
    if (result.status !== 0) return { ok: false, code: "SO-GIT" };
    return { ok: true, value: String(result.stdout ?? "").trim() };
  };
  const format = run(["rev-parse", "--show-object-format"]);
  if (!format.ok) return format;
  if (!Object.hasOwn(FORMATS, format.value)) return { ok: false, code: "SO-OBJECT-FORMAT" };
  const head = run(["rev-parse", "--verify", "HEAD"]);
  if (!head.ok) return head;
  if (!new RegExp(`^[a-f0-9]{${FORMATS[format.value]}}$`).test(head.value)) return { ok: false, code: "SO-SOURCE-OID" };
  return { ok: true, code: "SO-OBSERVED", objectFormat: format.value, sourceOid: head.value };
}
