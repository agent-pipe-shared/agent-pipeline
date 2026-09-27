#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read the admitted current-session model before a role packet is sealed. */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveModelRoleHostSessionIdentity } from "../lib/model-role-host-identity.mjs";
import { createModelRoleHostStore } from "../lib/model-role-host-store.mjs";
import { selectStoredModelRoleDispatch } from "../lib/model-role-host-session.mjs";
import { functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE } from "../lib/model-role-route-source.mjs";
import { loadRunnerProfilesV3Registry, validateRunnerProfilesV3Registry } from "../lib/runner-profiles-v3.mjs";

const fail = (code) => ({ ok: false, code, status: "unavailable" });
const legacy = ({ runner, taskRoute, sessionId = null, diagnostic = null, v3Route }) => ({
  ok: true, code: "MODEL-ROLE-SELECT-LEGACY-V3", status: "legacy-v3",
  runner, taskRoute, sessionId,
  ...(v3Route ? { v3Route: {
    selector: { kind: v3Route.selector.kind, value: v3Route.selector.value },
    effort: v3Route.effort,
  } } : {}),
  ...(diagnostic ? { diagnostic } : {}),
});

function readGitCommonDir(rootDir) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"],
    { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  return realpathSync(resolve(rootDir, common));
}

export function selectModelRoleForTask({ rootDir, runner, taskRoute,
  env = process.env, hostHookSessionId = null,
  routeSource = undefined, readRegistry = loadRunnerProfilesV3Registry,
  readCommonDir = readGitCommonDir, makeStore = createModelRoleHostStore } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) return fail("MODEL-ROLE-SELECT-SOURCE");
  // Functional model selection is optional. Establish the independently
  // registered V3 route before considering its derived role projection: a
  // damaged projection may not strand an otherwise usable approved route.
  let registry;
  try { registry = readRegistry(); }
  catch { return fail("MODEL-ROLE-SELECT-SOURCE"); }
  if (!validateRunnerProfilesV3Registry(registry).ok) return fail("MODEL-ROLE-SELECT-SOURCE");
  const parts = typeof taskRoute === "string" ? taskRoute.split(".") : [];
  const cell = ["claude", "codex", "antigravity"].includes(runner)
    ? parts.length === 3 && parts[0] === "profile"
      ? registry.profiles?.[parts[1]]?.[parts[2]]?.[runner]
      : taskRoute === CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE && runner === "claude"
        ? registry.duties?.advisory?.claude?.fallbacks?.find((entry) => entry.adapter === "consult" && entry.runner === "claude")
      : parts.length === 2 && parts[0] === "duty"
        ? registry.duties?.[parts[1]]?.[runner] : null
    : null;
  if (!cell || cell.state === "unavailable") return fail("MODEL-ROLE-SELECT-ROUTE-UNAVAILABLE");
  // V3 is the authorized non-blocking fallback. Return its exact selector and
  // effort with every optional-selection failure so dispatch construction can
  // use the fallback directly instead of silently inheriting or guessing.
  const v3Route = { selector: { kind: cell.selector.kind, value: cell.selector.value },
    effort: cell.effort };
  try { routeSource ??= registeredFunctionalTaskRoutes(registry); }
  catch { return legacy({ runner, taskRoute, v3Route, diagnostic: "MODEL-ROLE-SELECT-SOURCE" }); }
  if (!routeSource?.ok) return legacy({ runner, taskRoute, v3Route, diagnostic: "MODEL-ROLE-SELECT-SOURCE" });
  let scoped;
  try { scoped = functionalTaskRoutesForRunner(routeSource, runner); }
  catch { return legacy({ runner, taskRoute, v3Route, diagnostic: "MODEL-ROLE-SELECT-SOURCE" }); }
  if (!scoped?.ok) return legacy({ runner, taskRoute,
    v3Route, diagnostic: scoped?.code ?? "MODEL-ROLE-SELECT-SOURCE" });
  const matches = scoped.taskRoutes.filter((entry) => entry.taskRoute === taskRoute);
  if (matches.length !== 1 || matches[0].state === "unavailable")
    return legacy({ runner, taskRoute, v3Route, diagnostic: "MODEL-ROLE-SELECT-SOURCE" });
  const identity = resolveModelRoleHostSessionIdentity({ runner, env, hostHookSessionId });
  if (!identity.ok) return legacy({ runner, taskRoute, v3Route, diagnostic: identity.code });
  let store;
  try { store = makeStore(readCommonDir(rootDir), { rootDir }); }
  catch { return legacy({ runner, taskRoute, sessionId: identity.sessionId,
    v3Route, diagnostic: "MODEL-ROLE-SELECT-STORE-UNAVAILABLE" }); }
  let present;
  try { present = store.inspect(identity.sessionId); }
  catch { return legacy({ runner, taskRoute, sessionId: identity.sessionId,
    v3Route, diagnostic: "MODEL-ROLE-SELECT-STORE-UNAVAILABLE" }); }
  if (!present?.ok) return legacy({ runner, taskRoute, sessionId: identity.sessionId,
    v3Route, diagnostic: present?.code ?? "MODEL-ROLE-SELECT-STORE-UNAVAILABLE" });
  if (present.status === "absent") {
    return legacy({ runner, taskRoute, sessionId: identity.sessionId, v3Route });
  }
  if (present.status !== "present") return legacy({ runner, taskRoute,
    sessionId: identity.sessionId, v3Route, diagnostic: "MODEL-ROLE-SELECT-STORE-UNAVAILABLE" });
  let selected;
  try {
    selected = selectStoredModelRoleDispatch({ taskRoute, runner,
      sessionId: identity.sessionId, store, routeSource: scoped });
  } catch {
    return legacy({ runner, taskRoute, sessionId: identity.sessionId,
      v3Route, diagnostic: "MODEL-ROLE-SELECT-STORE-UNAVAILABLE" });
  }
  return selected?.ok
    ? { ...selected, status: "ready", sessionId: identity.sessionId }
    : legacy({ runner, taskRoute, sessionId: identity.sessionId,
      v3Route, diagnostic: selected.code });
}

function parseArgs(args) {
  const agy = args.length === 8 && args[6] === "--host-session-id";
  if ((args.length !== 6 && !agy) || args[0] !== "--repo-root"
    || args[2] !== "--runner" || args[4] !== "--task-route"
    || !["codex", "claude", "antigravity"].includes(args[3])
    || (args[3] === "antigravity") !== agy) {
    throw new Error("Usage: model-role-dispatch-select.mjs --repo-root <absolute-repo> --runner <codex|claude|antigravity> --task-route <route> [--host-session-id <native-hook-id>]");
  }
  return { rootDir: args[1], runner: args[3], taskRoute: args[5],
    hostHookSessionId: agy ? args[7] : null };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = parseArgs(process.argv.slice(2));
    if (input.runner === "antigravity") {
      // Keep the bootstrap/preflight graph out of read-only selector imports.
      const { observeAgyModelRoleHookSession } = await import("./model-role-bootstrap.mjs");
      const hook = observeAgyModelRoleHookSession({ rootDir: input.rootDir,
        sessionId: input.hostHookSessionId });
      if (!hook.ok) {
        // Native hook identity is required to admit a NEW role receipt, not to
        // keep the already-approved V3 task cell usable for this session.
        const selected = selectModelRoleForTask({ ...input, hostHookSessionId: null });
        process.stdout.write(`${JSON.stringify(selected.ok
          ? { ...selected, diagnostic: hook.code } : selected)}\n`);
        if (!selected.ok) process.exitCode = 2;
      }
      else {
        const selected = selectModelRoleForTask(input);
        process.stdout.write(`${JSON.stringify(selected)}\n`);
        if (!selected.ok) process.exitCode = 2;
      }
    } else {
      const selected = selectModelRoleForTask(input);
      process.stdout.write(`${JSON.stringify(selected)}\n`);
      if (!selected.ok) process.exitCode = 2;
    }
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 64; }
}
