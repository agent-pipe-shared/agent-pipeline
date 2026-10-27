# Held patch notes: D56 sanctioned-args admission of the attested writer argv (slice c1)

Candidate: a5e87f59bff6a359e2516f0d7b8a0b134a35f864. Patch: `w7-d56-attested-writer-guard-admission.patch` (git diff --binary, 4 files).
STACKING: the patch is a diff ON TOP of the held `w7-phoenix-reopen-design-dry-run-c4.patch` (it edits the same pin test file and `sanctioned-args-scripts.mjs`
neighbourhood). Apply the Phoenix c4 patch first; this patch applies on that state (apply check run in clone2 after Phoenix c4: exit 0).
Binding: generator binding only (AC-123); the real topic is D56 (companion of `w7-d56-attested-writer-cli.patch`).

## Cause

`scripts/dispatch-record-write.mjs --repo-root <root> --attested-request <json>` (CLI patch) is not a script the sanctioned-args guard knows, so the Elephant cannot run it.

## Changed lines

- `lib/guard/constants.mjs`: new `DISPATCH_RECORD_WRITE_SCRIPT` constant.
- `lib/guard/sanctioned-args-scripts.mjs`: new `sanctionedDispatchRecordAttestedWriterArgs(args, root)`: exactly 4 args; `matchFlagSpec` with required `--repo-root` (the root, or "." resolving to it with realpath containment) and `--attested-request` (repo-relative, `scratch/` first component, no empty/./.. component, no backslash/NUL, `.json`, max 256, same `isRealpathedWithinBoundary` + `isPhysicalScratchTarget` as the finalizer). `--request` is not in the spec, so the host route stays refused.
- `lib/guard/command-catalogue.mjs`: import + dispatch line next to the finalizer line.
- `lib/guard/devplan-shell-sanctioned-recovery.test.mjs`: DLR039-DLR052 (14 cases) appended; no existing case touched.

## RED / GREEN

- RED (clone, new cases vs unchanged code): 2 fail (DLR039 exact argv admitted, DLR040 order/"." admitted); the 12 negative/unchanged cases pass trivially before the change (they pin refusals that must stay).
- GREEN (patched clone): tests 52, pass 52, fail 0.
- Whole file, baseline (clone2, Phoenix c4 only): tests 38, pass 38, fail 0. Patched: 52/52/0. Failing-name sets: both empty, identical.
- Apply check in clone2: exit 0.
- Logs (untracked scratch): scratch/agent-out/w7qx/{red,green,base}.devplan-shell-sanctioned-recovery.test.mjs.log

## NOT done

- Other guard test files importing command-catalogue.mjs / constants.mjs: my single rg (glob form) returned no names; NOT searched further and NOT run. A pin elsewhere that lists the closed set of sanctioned scripts was not located (budget); the batch Verify must cover it.
- No end-to-end run with the real CLI; no refresh-mandatory-hooks run.
- Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Operator flow

Apply Phoenix c4 patch, then this one (`git apply`), `git add -u -- plugins/pipeline-core/lib/guard/constants.mjs plugins/pipeline-core/lib/guard/command-catalogue.mjs plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs plugins/pipeline-core/lib/guard/devplan-shell-sanctioned-recovery.test.mjs`, `git commit --no-verify`, stamp, install, then run refresh-mandatory-hooks (guard files change the installed hook set).
Protected-path classification observed: none of the four files matches TP-1..TP-13 (agent-obligations section 2); they are guard-surface code, edited only in the scratch clone as briefed.

Toolbox usage (Elephant): write the hand-back to `scratch/<id>-handback.txt`, write `scratch/<id>-attested.json`, run `node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo> --attested-request scratch/<id>-attested.json`, commit the record, rerun admit.

Proposed commit message: `feat(guard): admit the attested dispatch-record writer argv for the Elephant`
