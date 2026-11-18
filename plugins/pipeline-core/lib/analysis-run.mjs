// SPDX-License-Identifier: SUL-1.0
/**
 * Analysis run (candidate 19, F2a; AC-108): runs the registered `verify` command
 * of one commit in a throwaway `git clone --no-hardlinks` under
 * `<git-common-dir>/agent-pipeline/analysis/<run-id>/clone` and records a labelled
 * `pipeline.analysis-run.v1` result next to it. The result is analysis, never
 * Verify evidence. The real working tree is only read (HEAD and the digest of
 * `git status --porcelain=v1 --untracked-files=all`, before and after); a run that
 * leaves either changed is refused.
 *
 * `deps` (all optional): `spawnSync`, `now` (ms clock), `random` (8 hex chars).
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync as realSpawnSync } from 'node:child_process';
import { classifyVerifyCommand } from '../scripts/pipeline-state.mjs';
import { CALIBRATION_PATHS } from './project-authority-read.mjs';

export const ANALYSIS_RESULT_SCHEMA = 'pipeline.analysis-run.v1';
export const OUTPUT_LIMIT_BYTES = 65536;
export const DEFAULT_TIMEOUT_SECONDS = 600;
export const MAX_TIMEOUT_SECONDS = 1800;
export const KEEP_RUNS = 5;
export const KEEP_DAYS = 7;
export const TREE_CHANGED_REPAIR = 'review and revert the change in the working tree';

const RUN_ID = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-[0-9a-f]{8}$/u;

const refuse = (code, detail) => ({ status: 'refused', code, ...(detail ? { detail } : {}) });
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function bounded(buffer) {
  const bytes = Buffer.from(buffer ?? []);
  return bytes.length > OUTPUT_LIMIT_BYTES
    ? { text: bytes.subarray(0, OUTPUT_LIMIT_BYTES).toString('utf8'), truncated: true }
    : { text: bytes.toString('utf8'), truncated: false };
}

export function runAnalysis({ root, commit = 'HEAD', timeoutSeconds = DEFAULT_TIMEOUT_SECONDS, deps = {} } = {}) {
  const spawn = deps.spawnSync ?? realSpawnSync;
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? (() => randomBytes(4).toString('hex'));
  if (typeof root !== 'string' || root === '') return refuse('ANALYSIS-USAGE');
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > MAX_TIMEOUT_SECONDS) return refuse('ANALYSIS-USAGE');
  const git = (cwd, args, options = {}) => spawn('git', args, { cwd, encoding: 'utf8', ...options });

  const top = existsSync(root) ? git(resolve(root), ['rev-parse', '--show-toplevel']) : { status: 1 };
  if (top.status !== 0) return refuse('ANALYSIS-NOT-A-REPOSITORY');
  const repo = realpathSync(top.stdout.trim());
  const common = git(repo, ['rev-parse', '--git-common-dir']);
  if (common.status !== 0) return refuse('ANALYSIS-NOT-A-REPOSITORY');
  const commonDir = realpathSync(isAbsolute(common.stdout.trim()) ? common.stdout.trim() : resolve(repo, common.stdout.trim()));

  const resolved = git(repo, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]);
  if (resolved.status !== 0) return refuse('ANALYSIS-COMMIT-UNRESOLVED');
  const sha = resolved.stdout.trim();

  let calibration = null;
  for (const file of CALIBRATION_PATHS) {
    const shown = git(repo, ['show', `${sha}:${file}`]);
    if (shown.status === 0) { calibration = shown.stdout; break; }
  }
  let command;
  try { command = JSON.parse(calibration ?? '').verify; } catch { command = undefined; }
  if (classifyVerifyCommand(command) !== 'configured') return refuse('ANALYSIS-VERIFY-NOT-CONFIGURED');

  const observe = () => ({
    head: git(repo, ['rev-parse', 'HEAD']).stdout?.trim() ?? '',
    status: sha256(git(repo, ['status', '--porcelain=v1', '--untracked-files=all']).stdout ?? ''),
  });
  const before = observe();

  const startedMs = now();
  const stamp = new Date(startedMs).toISOString().replace(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z');
  const runId = `${stamp}-${random()}`;
  const analysisDir = join(commonDir, 'agent-pipeline', 'analysis');
  const runDir = join(analysisDir, runId);
  const cloneDir = join(runDir, 'clone');
  mkdirSync(runDir, { recursive: true });
  const cloned = git(repo, ['clone', '--quiet', '--no-hardlinks', repo, cloneDir]);
  const checkedOut = cloned.status === 0 ? git(cloneDir, ['checkout', '--quiet', '--detach', sha]) : cloned;
  if (checkedOut.status !== 0) { rmSync(runDir, { recursive: true, force: true }); return refuse('ANALYSIS-CLONE-FAILED'); }

  const tmpDir = join(cloneDir, '.analysis-tmp');
  mkdirSync(tmpDir, { recursive: true });
  const ran = spawn(command, {
    cwd: cloneDir,
    shell: true,
    encoding: 'buffer',
    timeout: timeoutSeconds * 1000,
    killSignal: 'SIGKILL',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, TMPDIR: tmpDir, CLAUDE_PROJECT_DIR: cloneDir },
  });
  const timedOut = ran.error?.code === 'ETIMEDOUT';
  const after = observe();
  const unchanged = before.head === after.head && before.status === after.status;
  const out = bounded(ran.stdout);
  const err = bounded(ran.stderr);
  const exitCode = typeof ran.status === 'number' ? ran.status : null;
  const verdict = !unchanged ? 'refused-working-tree-changed' : timedOut ? 'timed-out' : exitCode === 0 ? 'passed' : 'failed';
  const result = {
    schema: ANALYSIS_RESULT_SCHEMA,
    kind: 'analysis',
    notVerifyEvidence: true,
    runId,
    commit: sha,
    command,
    exitCode,
    signal: ran.signal ?? null,
    timedOut,
    stdout: out.text,
    stderr: err.text,
    truncated: { stdout: out.truncated, stderr: err.truncated },
    workingTreeUnchanged: unchanged,
    verdict,
    ...(unchanged ? {} : { repair: TREE_CHANGED_REPAIR }),
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: new Date(now()).toISOString(),
  };
  const resultPath = join(runDir, 'result.json');
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

  return { status: unchanged ? 'ok' : 'refused-working-tree-changed', verdict, resultPath, deleted: retain(analysisDir, runId, now()), result };
}

/** Delete runs beyond the newest KEEP_RUNS and those older than KEEP_DAYS; never `current`. Returns the count. */
function retain(analysisDir, current, nowMs) {
  const runs = readdirSync(analysisDir).filter((name) => RUN_ID.test(name)).sort().reverse();
  let deleted = 0;
  runs.forEach((name, index) => {
    if (name === current) return;
    const [, y, mo, d, h, mi, s] = RUN_ID.exec(name);
    const ageMs = nowMs - Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
    if (index >= KEEP_RUNS || ageMs > KEEP_DAYS * 86400000) {
      rmSync(join(analysisDir, name), { recursive: true, force: true });
      deleted += 1;
    }
  });
  return deleted;
}
