# Normal Codex Critic V3 route evidence

`NVA-B-CRITIC-NORMAL-ROUTING-1` replaces the normal compatibility host's
fixed Sol/xhigh route with the validated `critic_normal` Codex route from the
candidate commit's V3 authority.  Preparation stores the canonical model,
effort, V3 source digest, and candidate commit; finalization resolves the same
candidate authority again and rejects drift.  The host return and receipt are
compared to that bound route, while the closed identity, delegation, terminal,
cleanup, and receipt gates remain in force.

The reproducing RED capture is
`scratch/NVA-B-CRITIC-NORMAL-ROUTING-1/host-red.txt`: `node
plugins/pipeline-core/scripts/codex-critic-host.test.mjs` exited 1 because the
former route required `gpt-5.6-sol`/`xhigh`.

The final GREEN capture is
`scratch/NVA-B-CRITIC-NORMAL-ROUTING-1/host-green.txt`: `node
plugins/pipeline-core/scripts/codex-critic-host.test.mjs` exited 0 with 116
passing checks.  It includes normal host preparation/finalization, host-return
route mismatch checks, receipt binding checks, and the selected Critic consumer
path checks.  Both captures were made with
`node plugins/pipeline-core/scripts/capture-evidence.mjs`.

`plugins/pipeline-core/scripts/codex-critic-packet-host.mjs` is a separately
owned packet host with its own local return validator; it does not import or
call this compatibility host and was left unchanged.
