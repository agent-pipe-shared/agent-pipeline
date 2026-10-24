# Consumer proposal for AP_test_vox_codex_070_1 (inert; not applied)

Historical report P1-2 records a screenshot run writing
`voxel-scene.capture-check.v1` into `browser-check.json`, replacing a functional
report. The current read-only `tests/browser-check.mjs` has already separated
capture reports under `screenshots/<folder>/capture-<phase>.json` from the
functional `evidence/scene/browser-check.json`. These are consumer-owned writes.

For each future functional or capture run, make one exclusive immutable record:

```text
evidence/scene/runs/<run-id>/browser-check.v1.json
evidence/scene/runs/<run-id>/capture-check.v1.json
```

Each record should contain its own exact schema, `sourceSha256` of `index.html`,
`viewport` width/height, device scale factor, run ID, and tested capture phase
or functional test parameters. Write with an exclusive create (`wx`) or a
same-directory temporary file plus no-clobber link, then read back the bytes.
Refuse an existing run ID. Keep the record even when `ok` is false.

Publish `browser-check.latest.json` and `capture-check.latest.json` separately
as atomic pointers containing only `{ schema, runId, recordPath, recordSha256 }`.
Validate the record's schema and hash before moving a pointer. A capture run
must never choose the browser functional pointer or record path. A failed run
must not silently replace the last successful functional result; readers must
inspect the immutable run history for the latest attempt and its status.

This is a portable design proposal for that consumer's test script, not an
Agent-Pipeline guard. The shared `capture-evidence.mjs` repair only constrains
calls to that writer. It cannot prevent direct `writeFile` in consumer code or
establish global custody for arbitrary writers.
