// SPDX-License-Identifier: SUL-1.0
/** Resolve the live runner's session key; never invent a new one in bootstrap. */
const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const fail = (code) => ({ ok: false, code, sessionId: null });
const valid = (value) => typeof value === "string" && SESSION.test(value);

export function resolveModelRoleHostSessionIdentity({ runner, env = process.env,
  hostHookSessionId = null } = {}) {
  if (runner === "codex") {
    const session = env?.CODEX_SESSION_ID;
    const thread = env?.CODEX_THREAD_ID;
    if ((session !== undefined && !valid(session))
      || (thread !== undefined && !valid(thread))
      || (session !== undefined && thread !== undefined && session !== thread)) {
      return fail("MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
    }
    const sessionId = session ?? thread;
    return valid(sessionId)
      ? { ok: true, code: "MODEL-ROLE-SESSION-IDENTITY-OBSERVED", sessionId }
      : fail("MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE");
  }
  if (runner === "claude") {
    const sessionId = env?.CLAUDE_CODE_SESSION_ID;
    return valid(sessionId)
      ? { ok: true, code: "MODEL-ROLE-SESSION-IDENTITY-OBSERVED", sessionId }
      : fail("MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE");
  }
  if (runner === "antigravity") {
    return valid(hostHookSessionId)
      ? { ok: true, code: "MODEL-ROLE-SESSION-IDENTITY-OBSERVED", sessionId: hostHookSessionId }
      : fail("MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE");
  }
  return fail("MODEL-ROLE-SESSION-IDENTITY-RUNNER");
}
