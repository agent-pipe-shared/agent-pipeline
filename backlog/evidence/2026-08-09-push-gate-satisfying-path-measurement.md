# Closure evidence — the push gate's satisfying path, measured end to end

Item: `backlog/items/2026-08-09-the-push-gate-is-silent-in-every-consumer-project.md`
Date: 2026-08-09
Method: a real temporary root seeded with exactly what onboarding writes
(`freshManifestBytes()`, `freshCalibrationBytes()` at both authority tiers, a real
Git repository), then `guard-push.mjs` driven step by step with only shipped
commands used to satisfy what it demanded. Read off the running system, not off
the code — the standard the seeded `dev-plan` chapter set for itself.

## Step 1 — the reported defect, reproduced

Seed as-is. `pipeline.user.yaml` declares `gates.push: blocking`.

```
$ guard-push  <-- git push origin HEAD:refs/heads/feat/x
exit=0
```

The hook allows the push. `gateConfig(manifest, "push")` is null because the
seeded manifest chapter is a hardcoded string containing only `dev-plan`, and
guard-push's step 4 is "gate `push` absent → exit 0".

## Step 2 — with a `push` gate declared, nothing satisfied

```
exit=2
BLOCKED (guard-push, plugin pipeline-core): Push-Gate check failed (2 finding(s)):
  1. evidence/verify-latest.json missing
  2. Push approval missing: project/pipeline-state.json does not exist (never recorded via approve-push).
```

Both findings name what is missing. Neither names how to produce it — which is
why the seeded chapter now carries the command sequence in its own comments, the
same way the `dev-plan` chapter does.

## Step 3 — the seeded verify placeholder yields no evidence, correctly

```
$ verify-evidence-producer --out evidence/verify-latest.json
exit=2
verify-evidence-producer: VEP-VERIFY-FAILED: The configured verify command failed (exit 1) -- no evidence was written.
```

The producer refuses rather than recording a failure as a pass. An unconfigured
project cannot manufacture green evidence.

## Step 4 — a configured verify command produces candidate-bound evidence

With `verify` set to a real (here trivially passing) command:

```
exit=0  status "passed"
commit 3d08d7b9…  tree be1bbb84…   (both equal to HEAD)
exitCode 0
```

## Step 5 — evidence alone is not enough

```
exit=2
  1. Push approval missing: project/pipeline-state.json does not exist (never recorded via approve-push).
```

## Step 6 — `approve-push` as a fresh consumer would call it

```
exit=2
Error: approve-push requires --by, --remote, --destination, --proof-request, --proof-authority and --proof.
```

This is the exact refusal the PO's Claude greenfield run hit before it pushed
anyway. `gates.push_approval` defaults to `signature`, and at the time this
refusal named no alternative.

## Step 7-8 — `chat` mode, and the second defect

With `gates.push_approval: chat` committed in `pipeline.user.yaml`:

```
exit=2
Error: approve-push refused (CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE); no push
threat-model artifact exists yet at project/push-threat-model.md. Run the
"materialize-push-threat-model" subcommand …
```

The flag set narrowed correctly — chat mode WAS recognised. But after
materializing the threat model:

```
exit=2
Error: approve-push refused (CRITICAL-PROOF-POLICY-KIND-REQUIRED); external proof was not consumed.
```

**This is the closed door.** `verifyCriticalHumanProof` consulted the policy
file's `requiredKinds` before the operator's stand-down. A consumer project has
no `project/critical-human-proof.json` at all — the file is gate-strength
protected (GS-2) and has no materializer — so `requiredKinds` is empty and the
refusal demanded that the project declare push as proof-requiring in exactly the
configuration where its operator had committed the opposite. Chat mode, which
ADR-0056 created for a human without key management, was unreachable for every
fresh consumer. No test covered this code.

Two further interface defects surfaced in the same steps: `materialize-push-threat-model`
and the artifact-unavailable refusal both named a `--dir` flag that exists nowhere
in `pipeline-state.mjs` — the project directory comes from `CLAUDE_PROJECT_DIR` or
the cwd — so a consumer who obeyed the message got the same refusal back for
obeying it.

## After the ordering fix — the path is open

```
Step  9  materialize-push-threat-model              exit=0
Step 10  verify-evidence-producer (new HEAD)        exit=0
Step 11  approve-push --by --remote --destination   exit=0
         Push approved by "PO" for commit 97608b1e…
Step 12  guard-push                                 exit=0
```

## The path, and who walks each step

| # | Step | Who |
|---|---|---|
| 1 | configure a real verify command | human (already required; the placeholder exits 1 and says so) |
| 2 | `verify-evidence-producer --out evidence/verify-latest.json` | agent |
| 3 | `gates.push_approval`: `signature` (default) or `chat` | human |
| 4 | `materialize-push-threat-model` | agent |
| 5 | `approve-push --by --remote --destination` (+3 proof flags in `signature`) | human |

Three agent steps, two human decisions, every one with a shipped command. The
approval binds one commit: one further commit re-closes the gate, so an approval
never becomes a standing licence. PUSHSEED-2 in
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` drives all of it,
including that last property.
