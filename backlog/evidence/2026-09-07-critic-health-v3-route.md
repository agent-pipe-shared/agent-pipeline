# Critic health V3 route evidence

`--critic-ready` resolves the high-risk Codex Critic model from validated V3
candidate authority before probing. Frozen review supplies `--root
<physical-project-root> --candidate-commit <full-candidate-commit>`; the plain
form remains compatible by resolving against its physical cwd and committed
HEAD. It accepts no model argument. An unavailable route returns
`CAS-MODEL-ROUTE-UNAVAILABLE` and does not spawn the model probe. The probe
receives the resolved model, requires its exact OpenAI response identity, and
starts only an ephemeral read-only thread with approval disabled.

The probe uses the host temporary directory as its thread cwd, so no project
repository is supplied to the probe thread. It sends
`allowProviderModelFallback: false`, `ephemeral: true`,
`approvalPolicy: "never"`, and `sandbox: "read-only"`; it does not start a
turn. The success fixture proves this protocol for the configured non-Sol model
`gpt-6-astra`, observes no `turn/start`, and observes child stdin closure. Its
2-second subprocess bound is a test deadline, not a production sleep. The
production probe has a 60-second protocol timeout and a 1 MiB stdout limit.

**Portability correction, R2 continuation:** the earlier R2 evidence
overstated portability. Its probe input gate accepted only POSIX absolute paths
and its route test asserted a POSIX root literal; the two inline fixture JSONL
readers also assumed every stdin chunk contained complete lines. The current
implementation uses Node's platform-native `isAbsolute`, retains fail-closed
rejection for relative executables, derives the expected test root with
`resolve("/project")`, and buffers fixture chunks through complete newline
records. No Windows execution was performed or claimed. Process launch remains
the executable check after absolute-path admission and reports its existing
typed execution failure when it cannot start.

**Termination boundary:** the success fixture proves cooperative closure only:
the probe calls `child.stdin.end()` after the accepted `thread/start` response,
and the fixture exits on EOF. The current timeout path does not prove a hard
kill, because it also ends stdin and clears its timer only after child close.
An EOF-ignoring child can therefore outlive the nominal 60-second probe timeout;
the outer health observation has its own 65-second synchronous bound but does
not establish cleanup of a surviving descendant. No adversarial bounded-cleanup
claim is made here. A later scoped repair may adapt the preflight payload's
TERM-then-KILL close observation, or its Linux owned-process-group helper, only
with an explicit cross-platform termination contract.

Machine evidence, all local fixtures/static analysis with no provider, daemon,
or health invocation:

- `node --test plugins/pipeline-core/scripts/codex-app-server-health.test.mjs plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs` exited 0: 11 health checks and 5 closure checks. The current portability-correction capture is `scratch/NVA-B-CRITIC-HEALTH-ROUTING-2/health-and-kernel-closure-portability-fix.txt`; the earlier R2 capture remains historical.
- `node --test plugins/pipeline-core/lib/guard-maintenance-window.test.mjs harness/scripts/check-consumer-safe-paths.test.mjs` exited 0: 62 GMW assertions and 10 Node test cases. The evidence wrapper correctly refused its Windows-path fixture literals twice rather than writing a potentially unsafe capture; this direct test output is therefore reported as uncaptured.
- `node harness/scripts/check-consumer-safe-paths.mjs` exited 0: 1,112 tracked plugin files and 130 used allowlist entries. Captured at `scratch/NVA-B-CRITIC-HEALTH-ROUTING-2/consumer-safe-paths.txt`.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` exited 0: 9 test cases after the correction. It is direct output only because its Windows-path fixture literals are intentionally rejected by the capture wrapper.

R1's earlier partial record and its focused evidence remain historical; this
entry preserves those historical results and records the corrected local
coverage without claiming a live provider, daemon, or Windows result.
