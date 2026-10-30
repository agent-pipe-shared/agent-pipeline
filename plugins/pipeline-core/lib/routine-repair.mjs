// SPDX-License-Identifier: SUL-1.0
//
// D194 / D197: the runner-neutral core of the routine-repair verb. ONE closed list of the repairs the Elephant runs without
// asking the human; each is retained aside (never deleted), recorded in a ledger line, and requires a reason. Everything else is
// refused RR-OUTSIDE-LIST with the original tool's own command, because the human decides it. Runner adapters only translate:
// none carries its own list. The CLI is scripts/routine-repair.mjs.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROUTINE_REPAIR_RECORD_SCHEMA = "pipeline.routine-repair-record.v1";
export const ROUTINE_REPAIR_LIST_SCHEMA = "pipeline.routine-repair-list.v1";
const SAR = fileURLToPath(new URL("../scripts/session-authority-repair.mjs", import.meta.url));
const SLICE_QUEUE = fileURLToPath(new URL("../scripts/slice-queue.mjs", import.meta.url));

/** The closed list (D194). Frozen; nothing registers into it at runtime. */
export const ROUTINE_REPAIRS = Object.freeze([
  Object.freeze({ kind: "heal", usage: "run heal --root <root> --reason \"<why>\"", does: "session-authority-repair heal: re-anchors the scratch binding, heals drifted producers with nothing in flight, retires dead locks and stop-failure records aside" }),
  Object.freeze({ kind: "slice-cancel", usage: "run slice-cancel <slice id> --class <budget|integrated-elsewhere> [--started] --root <root> --reason \"<why>\"", does: "slice-queue cancel, restricted to the classes budget and integrated-elsewhere", classes: Object.freeze(["budget", "integrated-elsewhere"]) }),
  Object.freeze({ kind: "stop-failure-aside", usage: "run stop-failure-aside --root <root> --reason \"<why>\"", does: "moves each finalizer stop-failure record aside under session-authority-abandoned, unless its dispatch has an unsettled pending state" }),
  Object.freeze({ kind: "move-aside", usage: "run move-aside --no-goldfish-running --root <root> --reason \"<why>\"", does: "session-authority-repair move-aside, only when inspect reports nothing but unknown-registry-entry or native-managed-unknown-native-entry", findings: Object.freeze(["unknown-registry-entry", "native-managed-unknown-native-entry"]) }),
  Object.freeze({ kind: "settled-pending-aside", usage: "run settled-pending-aside --root <root> --reason \"<why>\"", does: "moves aside the pending states (with their authority-terminal and authority-integration siblings) of dispatches that session-authority-repair inspect reports settled (integrated, integrated-by-commit, cancelled), then the stop-failure records that no longer have an unsettled pending state; heal does the same before its delegate" }),
]);
const KINDS = new Set(ROUTINE_REPAIRS.map((row) => row.kind));
const SLICE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const STOP_FAILURE_NAME = /^stop-failure-[a-f0-9]{32}\.json$/u;

const short = (error) => String(error?.reason ?? error?.message ?? error).replace(/[\u0000-\u001f\u007f]+/gu, " ").slice(0, 240);
export const validRoutineReason = (reason) => typeof reason === "string" && reason.trim() !== "" && reason.length <= 500 && !/[\u0000-\u001f\u007f]/u.test(reason);
const stamp = (now) => new Date(now()).toISOString().replace(/[^0-9]/gu, "");

/**
 * The stop-failure rule shared by `heal` (legacy directory) and `stop-failure-aside` (current diagnostics directory): a record moves
 * aside (never deleted) unless it is a symlink, is not a valid pipeline.native-goldfish-host-stop-failure.v1 record, or its dispatch
 * has an unsettled pending state (a pending file with no authority-terminal record for its digest, or one that cannot be read).
 * The pending state of both namespaces lives in `pendingDir` (run/native-goldfish-host-commit).
 */
export function moveStopFailuresAside({ sourceDir, pendingDir, asideDir }) {
  const retired = [], kept = [];
  if (!existsSync(sourceDir)) return { retired, kept };
  const candidates = readdirSync(sourceDir).filter((name) => STOP_FAILURE_NAME.test(name));
  if (!candidates.length) return { retired, kept };
  const pendingNames = existsSync(pendingDir) ? readdirSync(pendingDir) : [];
  const unsettled = new Set(); let pendingProblem = null;
  for (const name of pendingNames.filter((row) => /^pending-(claude|codex)-[a-f0-9]{64}\.json$/u.test(row))) {
    try {
      const bytes = readFileSync(join(pendingDir, name));
      const dispatchId = JSON.parse(bytes.toString("utf8"))?.binding?.dispatchId;
      if (typeof dispatchId !== "string") throw new Error("no binding.dispatchId");
      if (!pendingNames.includes(`authority-terminal-${createHash("sha256").update(bytes).digest("hex")}.json`)) unsettled.add(dispatchId);
    } catch (error) { pendingProblem = `pending state ${name} cannot be read (${short(error)}), so in-flight cannot be decided`; }
  }
  for (const name of candidates) {
    const path = join(sourceDir, name);
    let record;
    try {
      if (lstatSync(path).isSymbolicLink()) { kept.push({ name, reason: "a symlink is never moved" }); continue; }
      record = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) { kept.push({ name, reason: `unreadable or malformed: ${short(error)}` }); continue; }
    if (record === null || typeof record !== "object" || Array.isArray(record) || record.schema !== "pipeline.native-goldfish-host-stop-failure.v1" || typeof record.dispatchId !== "string") { kept.push({ name, reason: "not a native-goldfish-host-stop-failure.v1 record" }); continue; }
    if (pendingProblem !== null) { kept.push({ name, reason: pendingProblem }); continue; }
    if (unsettled.has(record.dispatchId)) { kept.push({ name, reason: `dispatch ${record.dispatchId} has an unsettled pending state` }); continue; }
    mkdirSync(asideDir, { recursive: true, mode: 0o700 });
    renameSync(path, join(asideDir, name));
    retired.push({ name, dispatchId: record.dispatchId, code: record.code ?? null, observedAt: record.observedAt ?? null });
  }
  return { retired, kept };
}

const PENDING_NAME = /^pending-(claude|codex)-([a-f0-9]{64})\.json$/u;
const SETTLED_STATES = new Set(["integrated", "integrated-by-commit", "cancelled"]);
const SETTLED_SIBLINGS = ["authority-terminal", "authority-integration"];
const pendingDirOf = (commonDir) => join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
const diagnosticsDirOf = (commonDir) => join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");

/**
 * W7: which pending states of the reservation rows of `session-authority-repair inspect` may leave the authority namespace (read-only).
 * The settled rule itself is inspect's (integrated, integrated-by-commit, cancelled); it is not re-implemented here. A pending file is
 * retired only when its row is settled and it is a regular non-symlink file. The digest in a pending name is a key, not the sha256 of
 * its bytes; the authority-terminal and authority-integration siblings are named by the sha256 of the pending bytes (pendingSha256 in
 * native-goldfish-host-state), so those travel with it. Everything else is listed in `kept`.
 */
export function planSettledPending({ pendingDir, reservations }) {
  const retire = [], kept = [];
  for (const row of Array.isArray(reservations) ? reservations : []) {
    const name = typeof row?.pending === "string" ? row.pending : null;
    if (name === null) continue;
    const match = PENDING_NAME.exec(name);
    if (!match) { kept.push({ name: name.slice(0, 120), reason: "not a pending state file name" }); continue; }
    if (row.status === "unreadable") { kept.push({ name, reason: `status unreadable: ${short(row.reason ?? "no reason reported")}` }); continue; }
    if (!SETTLED_STATES.has(row.settled)) { kept.push({ name, reason: "not settled: its item reservation is open" }); continue; }
    const path = join(pendingDir, name);
    try {
      if (lstatSync(path).isSymbolicLink()) { kept.push({ name, reason: "a symlink is never moved" }); continue; }
      const pendingSha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      const siblings = [];
      let blocked = null;
      for (const prefix of SETTLED_SIBLINGS) {
        const sibling = `${prefix}-${pendingSha256}.json`;
        if (!existsSync(join(pendingDir, sibling))) continue;
        if (lstatSync(join(pendingDir, sibling)).isSymbolicLink()) blocked = `${sibling} is a symlink`; else siblings.push(sibling);
      }
      if (blocked !== null) { kept.push({ name, reason: blocked }); continue; }
      retire.push({ name, settled: row.settled, dispatchId: typeof row.dispatchId === "string" ? row.dispatchId : null, siblings });
    } catch (error) { kept.push({ name, reason: `cannot be checked: ${short(error)}` }); }
  }
  return { retire, kept };
}

/**
 * W7 (read-only, for dispatch-briefing build): how many pending states a settled-pending-aside run would retire, and the dispatch ids of
 * the current stop-failure records that would then leave (same rule as moveStopFailuresAside). null when inspect does not report.
 * `deps.spawn` (tests only).
 */
export function readSettledPendingPreview(root, deps = {}) {
  try {
    const resolved = resolve(root);
    const commonDir = commonDirOf(resolved);
    if (commonDir === null) return null;
    const run = (deps.spawn ?? defaultSpawn)(SAR, ["inspect", "--root", resolved], resolved);
    const inspect = run.status === 0 ? parseJson(run.stdout) : null;
    if (inspect === null) return null;
    const pendingDir = pendingDirOf(commonDir);
    const { retire } = planSettledPending({ pendingDir, reservations: inspect.reservations });
    const retiring = new Set(retire.flatMap((row) => [row.name]));
    const sourceDir = diagnosticsDirOf(commonDir);
    const records = existsSync(sourceDir) ? readdirSync(sourceDir).filter((name) => STOP_FAILURE_NAME.test(name)) : [];
    const leaving = new Set();
    if (records.length) {
      const names = existsSync(pendingDir) ? readdirSync(pendingDir) : [];
      const unsettled = new Set(); let problem = false;
      for (const name of names.filter((row) => PENDING_NAME.test(row) && !retiring.has(row))) {
        try {
          const bytes = readFileSync(join(pendingDir, name));
          const dispatchId = JSON.parse(bytes.toString("utf8"))?.binding?.dispatchId;
          if (typeof dispatchId !== "string") throw new Error("no binding.dispatchId");
          if (!names.includes(`authority-terminal-${createHash("sha256").update(bytes).digest("hex")}.json`)) unsettled.add(dispatchId);
        } catch { problem = true; }
      }
      if (!problem) {
        for (const name of records) {
          try {
            const path = join(sourceDir, name);
            if (lstatSync(path).isSymbolicLink()) continue;
            const record = JSON.parse(readFileSync(path, "utf8"));
            if (record?.schema === "pipeline.native-goldfish-host-stop-failure.v1" && typeof record.dispatchId === "string" && !unsettled.has(record.dispatchId)) leaving.add(record.dispatchId);
          } catch { /* an unreadable record is kept, so it does not leave */ }
        }
      }
    }
    return { settledCount: retire.length, leavingDispatchIds: [...leaving].sort() };
  } catch { return null; }
}

const refuse = (code, reason, next) => ({ ok: false, status: "refused", code, reason, ...(next ? { next } : {}) });

/** The typed next step of an outside-list refusal: the human decides, with the original tool's own command. */
function humanStep(kind, args = {}) {
  const sar = (verb) => `node ${SAR} ${verb} --root <root>`;
  if (kind === "release-lock") return `${sar("release-lock")} --no-pipeline-running --reason "<why>"`;
  if (kind === "take-over") return `${sar("take-over")} --from <session> --no-other-session-running --reason "<why>" --class <class>`;
  if (kind === "slice-cancel" || kind === "cancel") return `node ${SLICE_QUEUE} cancel <slice id> --reason "<why>" --class <class>${args.started ? " --started" : ""}`;
  return `${sar("inspect")} (it names the exact repair command for each finding)`;
}
const outside = (what, kind, args) => refuse("RR-OUTSIDE-LIST", `${what} is not on the closed routine-repair list (${ROUTINE_REPAIRS.map((row) => row.kind).join(", ")})`, `this repair is decided by the human; the original tool's own command: ${humanStep(kind, args)}`);

/** Validates a request and returns the plan; mutates nothing. */
export function planRoutineRepair({ kind, reason, root, sliceId, cancelClass, started } = {}) {
  if (typeof kind !== "string" || !KINDS.has(kind)) return outside(`repair kind ${JSON.stringify(String(kind).slice(0, 40))}`, kind);
  if (!validRoutineReason(reason)) return refuse("RR-REASON-REQUIRED", "a routine repair is recorded with its reason: pass --reason \"<one line, at most 500 characters>\"");
  if (typeof root !== "string" || root === "") return refuse("RR-ARGS", "--root <root> is required");
  if (kind === "slice-cancel") {
    if (typeof sliceId !== "string" || !SLICE_ID.test(sliceId)) return refuse("RR-ARGS", "slice-cancel needs one <slice id>");
    const allowed = ROUTINE_REPAIRS.find((row) => row.kind === kind).classes;
    if (!allowed.includes(cancelClass)) return outside(`cancel class ${JSON.stringify(String(cancelClass).slice(0, 40))}`, kind, { started });
  }
  return { ok: true, kind, reason: reason.trim(), root, ...(kind === "slice-cancel" ? { sliceId, cancelClass, started: started === true } : {}) };
}

/** Sorted finding names of one inspect result, each classified; used only by move-aside. */
export function classifyInspectFindings(inspect) {
  const rows = [];
  const text = (...parts) => parts.filter((part) => typeof part === "string" && part !== "").join(" ");
  const add = (source, haystack) => {
    const found = ROUTINE_REPAIRS.find((row) => row.kind === "move-aside").findings.find((name) => haystack.includes(name));
    rows.push({ source, finding: found ?? (haystack.slice(0, 120) || source), allowed: found !== undefined });
  };
  if (inspect?.lock?.status === "held") add("lock", text("registry-lock-held", inspect.lock.owner));
  for (const row of inspect?.reservations ?? []) if (row?.sliceId && row.settled === null) add("reservation", `open-item-reservation:${row.sliceId}`);
  if (inspect?.registry?.status === "unreadable") add("registry", text("registry-unreadable", inspect.registry.reason));
  for (const row of inspect?.registry?.producers ?? []) {
    if (row?.status === "ok") continue;
    add(`producer:${row?.producerId}`, text(row?.status, row?.code, row?.reason, ...(row?.drifted ?? [])));
  }
  if (inspect?.registry?.read?.status === "refused") add("registry-read", text(inspect.registry.read.code, inspect.registry.read.reason));
  return rows;
}

const parseJson = (stdout) => { try { return JSON.parse(String(stdout).trim().split("\n").filter(Boolean).pop()); } catch { return null; } };

function defaultSpawn(script, args, cwd) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", shell: false, maxBuffer: 1 << 26 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function commonDirOf(root) {
  const r = spawnSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8", shell: false });
  if (r.status !== 0) return null;
  const dir = r.stdout.trim();
  return isAbsolute(dir) ? dir : resolve(root, dir);
}

const abandonedRel = (name) => `agent-pipeline/session-authority-abandoned/${name}`;

/**
 * Runs one routine repair and records it. Returns { exit, result }: exit 0 done, 2 refused. `deps` (tests only): spawn(script, args, cwd),
 * now(). The ledger line is appended for every run whose repository resolves, refusals included.
 */
export function runRoutineRepair(request, deps = {}) {
  const now = deps.now ?? Date.now;
  const spawn = deps.spawn ?? defaultSpawn;
  const plan = planRoutineRepair(request);
  const reasonText = validRoutineReason(request?.reason) ? request.reason.trim() : null;
  let root = null, commonDir = null;
  if (typeof request?.root === "string" && request.root !== "") {
    try { root = resolve(request.root); commonDir = commonDirOf(root); } catch { commonDir = null; }
  }
  const moved = [], retained = [];
  let result;
  if (!plan.ok) result = plan;
  else if (commonDir === null) result = refuse("RR-ROOT", "--root is not a git repository");
  else {
    try { result = execute(plan, { root, commonDir, spawn, now, moved, retained }); }
    catch (error) { result = refuse("RR-FAILED", short(error)); }
  }
  const code = result.ok ? (result.code ?? "done") : result.code;
  let ledgerError = null;
  if (commonDir !== null) {
    const record = { schema: ROUTINE_REPAIR_RECORD_SCHEMA, kind: typeof request?.kind === "string" ? request.kind.slice(0, 40) : null, reason: reasonText, at: new Date(now()).toISOString(), result: code, moved, retained };
    try {
      const path = join(commonDir, "agent-pipeline", "routine-repair-ledger.jsonl");
      mkdirSync(join(commonDir, "agent-pipeline"), { recursive: true, mode: 0o700 });
      appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    } catch (error) { ledgerError = short(error); }
  }
  if (ledgerError !== null) return { exit: 2, result: { schema: ROUTINE_REPAIR_RECORD_SCHEMA, status: "refused", code: "RR-LEDGER-FAILED", reason: `the repair ran (${code}) but its ledger line could not be written: ${ledgerError}`, moved, retained } };
  const { ok, ...rest } = result;
  return { exit: ok ? 0 : 2, result: { schema: ROUTINE_REPAIR_RECORD_SCHEMA, status: ok ? "done" : "refused", code, ...rest, moved, retained, ledger: "agent-pipeline/routine-repair-ledger.jsonl" } };
}

function delegated(label, run, ctx) {
  const json = parseJson(run.stdout);
  for (const name of json?.retained ?? []) if (typeof name === "string") ctx.retained.push(abandonedRel(name));
  const ok = run.status === 0;
  return { ok, code: ok ? (json?.status ?? "done") : (json?.code ?? `RR-DELEGATE-EXIT-${run.status}`), delegate: label, ...(ok ? {} : { reason: json?.reason ?? String(run.stderr).slice(0, 240) }), ...(ok || !json?.repair ? {} : { next: json.repair }) };
}

/**
 * W7: moves the settled pending states aside (never deleted) under one `-settled-pending` directory, then the stop-failure records of the
 * current diagnostics directory that no longer have an unsettled pending state into the same directory. `inspect` is a parsed
 * session-authority-repair inspect result; its reservation rows decide what is settled.
 */
function retireSettledPending(ctx, inspect) {
  const { commonDir, now } = ctx;
  const pendingDir = pendingDirOf(commonDir), sourceDir = diagnosticsDirOf(commonDir);
  const asideName = `${stamp(now)}-${randomBytes(4).toString("hex")}-settled-pending`;
  const asideDir = join(commonDir, "agent-pipeline", "session-authority-abandoned", asideName);
  const rel = (path) => relative(commonDir, path).split("\\").join("/");
  const { retire, kept } = planSettledPending({ pendingDir, reservations: inspect?.reservations });
  const retiredPending = [];
  for (const row of retire) {
    mkdirSync(asideDir, { recursive: true, mode: 0o700 });
    for (const file of [row.name, ...row.siblings]) {
      renameSync(join(pendingDir, file), join(asideDir, file));
      ctx.moved.push({ from: rel(join(pendingDir, file)), to: `${abandonedRel(asideName)}/${file}` });
    }
    retiredPending.push(row);
  }
  for (const row of kept) ctx.retained.push(rel(join(pendingDir, row.name)));
  const stop = moveStopFailuresAside({ sourceDir, pendingDir, asideDir });
  for (const row of stop.retired) ctx.moved.push({ from: rel(join(sourceDir, row.name)), to: `${abandonedRel(asideName)}/${row.name}` });
  for (const row of stop.kept) ctx.retained.push(rel(join(sourceDir, row.name)));
  return { retiredPending, keptPending: kept, retiredStopFailures: stop.retired, keptStopFailures: stop.kept };
}

function execute(plan, ctx) {
  const { root, commonDir, spawn, now } = ctx;
  if (plan.kind === "heal") {
    // W7: the settled pending states leave BEFORE the delegate runs, so heal re-anchors the registry on the namespace as it stays.
    let settledPending;
    try {
      const run = spawn(SAR, ["inspect", "--root", root], root);
      const inspect = run.status === 0 ? parseJson(run.stdout) : null;
      settledPending = inspect === null ? { skipped: "session-authority-repair inspect did not report, so no pending state was classified" } : retireSettledPending(ctx, inspect);
    } catch (error) { settledPending = { skipped: short(error) }; }
    return { ...delegated("session-authority-repair heal", spawn(SAR, ["heal", "--root", root], root), ctx), settledPending };
  }
  if (plan.kind === "settled-pending-aside") {
    const run = spawn(SAR, ["inspect", "--root", root], root);
    const inspect = run.status === 0 ? parseJson(run.stdout) : null;
    if (inspect === null) return refuse("RR-INSPECT-FAILED", "session-authority-repair inspect did not report, so no pending state can be classified as settled", `node ${SAR} inspect --root <root>`);
    const step = retireSettledPending(ctx, inspect);
    return { ok: true, code: step.retiredPending.length || step.retiredStopFailures.length ? "moved-aside" : "nothing-to-move", ...step };
  }
  if (plan.kind === "slice-cancel") {
    const args = ["cancel", plan.sliceId, "--reason", plan.reason, "--class", plan.cancelClass, "--root", root, ...(plan.started ? ["--started"] : [])];
    return delegated("slice-queue cancel", spawn(SLICE_QUEUE, args, root), ctx);
  }
  if (plan.kind === "stop-failure-aside") {
    const asideName = `${stamp(now)}-${randomBytes(4).toString("hex")}-stop-failure`;
    const sourceDir = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
    const asideDir = join(commonDir, "agent-pipeline", "session-authority-abandoned", asideName);
    const { retired, kept } = moveStopFailuresAside({ sourceDir, pendingDir: join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit"), asideDir });
    for (const row of retired) ctx.moved.push({ from: relative(commonDir, join(sourceDir, row.name)).split("\\").join("/"), to: `${abandonedRel(asideName)}/${row.name}` });
    for (const row of kept) ctx.retained.push(relative(commonDir, join(sourceDir, row.name)).split("\\").join("/"));
    return { ok: true, code: retired.length ? "moved-aside" : "nothing-to-move", retiredStopFailures: retired, keptStopFailures: kept };
  }
  // move-aside: only for a registry that holds nothing but the two named findings.
  const inspectRun = spawn(SAR, ["inspect", "--root", root], root);
  const inspect = parseJson(inspectRun.stdout);
  if (inspectRun.status !== 0 || inspect === null) return refuse("RR-INSPECT-FAILED", "session-authority-repair inspect did not report, so no finding can be classified", `node ${SAR} inspect --root <root>`);
  const findings = classifyInspectFindings(inspect);
  if (!findings.length) return refuse("RR-OUTSIDE-LIST", "inspect reports no blocking finding, so there is nothing for move-aside to repair", humanStep("move-aside"));
  const other = findings.find((row) => !row.allowed);
  if (other) return refuse("RR-OUTSIDE-LIST", `finding ${other.finding} (${other.source}) is not on the closed list for move-aside (${ROUTINE_REPAIRS.find((row) => row.kind === "move-aside").findings.join(", ")})`, `this repair is decided by the human; the original tool's own command: ${humanStep("inspect")}`);
  return delegated("session-authority-repair move-aside", spawn(SAR, ["move-aside", "--root", root, "--no-goldfish-running", "--reason", plan.reason], root), ctx);
}
