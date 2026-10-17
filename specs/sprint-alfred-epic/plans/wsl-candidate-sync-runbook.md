# WSL candidate sync and Verify runbook (Sprint Alfred, 0.7.0 local candidate)

Status: working runbook, 2026-10-17. PO decision of the same day: the regular
Full Verify and the session-cleanup binding logic run under WSL/Linux; native
Windows runs only a lean set of Windows pins and a controller smoke test
([decisions](po-decisions-2026-10-12.md),
[backlog item](../../../backlog/items/2026-10-17-full-verify-on-windows-takes-hours.md)).

The PO runs every command in this runbook. The agent prepares the exact
candidate commit and reads back the returned evidence; it never writes to the
WSL clone.

## Placeholders

- `<win-checkout>`: the Windows checkout of this repository, seen from WSL
  under `/mnt/<drive>/...`.
- `<wsl-clone>`: the PO's WSL clone in the Linux filesystem (under `~/src`).
  It must live on the Linux filesystem, not under `/mnt`; that is where the
  speed comes from.
- `<candidate-sha>`: the exact commit the agent names for this round.

No machine-specific path is recorded in this repository.

## 1. Sync the WSL clone to the exact candidate, without a push

```sh
cd <wsl-clone>
git status --short
git fetch <win-checkout> feat/sprint-alfred
git switch --detach FETCH_HEAD
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

- `git status --short` must be empty before the fetch. If it is not, stop
  and report it; do not stash or reset on the agent's behalf.
- `git fetch` from a local path reads the Windows object database directly.
  Nothing is pushed, and no remote branch changes.
- `--detach` keeps the WSL clone's own branches untouched. To return, use
  `git switch -` or the PO's own branch.
- Both `rev-parse` lines must match the commit and tree the agent named. A
  mismatch means a wrong fetch source or a commit that came later; stop and
  report it.

## 2. Plugin state under WSL

The WSL plugin install is refreshed separately (PO plugin refresh procedure,
Windows and WSL). Verify itself runs from the repository source and does not
need the installed plugin. The guard hooks of an agent session under WSL do
need it.

## 3. Run the candidate Verify

```sh
cd <wsl-clone>
node --version
git --version
node harness/scripts/verify.mjs --mode candidate
```

- The preflight refuses a dirty tree, and untracked files count as dirty.
- Write down the wall time (start and end) and the exit code.
- On exit 0 the run writes `evidence/verify-latest.json` and private logs
  under the Git common directory (`.git/agent-pipeline/verify/runs/`).

## 4. Return the evidence

Hand these back to the agent. Copy them into `scratch/` of the Windows
checkout, or paste them into the chat:

1. Output of `git rev-parse HEAD` and `git rev-parse 'HEAD^{tree}'` from the
   WSL clone.
2. The exit code and the wall time.
3. `evidence/verify-latest.json`.
4. On red: the names of the failing suites from the terminal records. The
   agent then asks for single logs by name.

The agent checks commit and tree against the candidate and classifies each
red suite as host class or genuine defect. It records the result as a WSL
Verify on that exact commit. A WSL run is not a native Windows Full Verify,
and nothing may present it as one.

## 5. Windows pins on the native host

The agent runs the lean Windows set itself on the Windows checkout. That set
is the ACL and ancestor pins, the attestation host suite and the controller
smoke test, each sequentially and named, with counts. This is targeted
evidence, not a Full Verify.
