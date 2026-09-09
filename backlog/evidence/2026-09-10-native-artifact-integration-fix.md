# Native artifact integration fixture

Task: `NVA-NATIVE-CURRENT-ARTIFACT-REVIEW-FIX-1`

The existing native Critic host test now creates a real Git repository with an
artifact commit followed by an unrelated candidate commit. It obtains the
artifact scope and source coverage from `preflightCriticDispatch`, merges the
overlapping scoped/spec source record while retaining its regular-file mode,
and passes those records through the native host and its actual child process.

The fake executable is an app-server protocol backend only; no model is
invoked. The fixture checks the rendered artifact prompt, native wire, exact
candidate identities, and returned scope/source coverage. A missing mode on
the merged scoped/spec record is rejected before child creation.

Focused check: `node plugins/pipeline-core/scripts/codex-critic-host.test.mjs`
completed with 125 passing checks and exit status 0.
