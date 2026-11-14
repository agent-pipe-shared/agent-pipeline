fix(pipeline-state): keep pipeline-state.mjs under the authority source bound

The 29d pre-export run found session-authority-registry-fewer-checks
red (C19I-W238-1/2/5, WIN-AUTH-SIZE): ADR-0100's replace route had grown
scripts/pipeline-state.mjs to 1,050,379 bytes, past the session
authority's 1 MiB source-entry bound (SESSION_AUTHORITY_LIMITS
.maxSourceEntryBytes), which the native Windows reader also clamps to.
- The route body moves unchanged into lib/verify-replacement.mjs
  (runConfigureVerifyReplaceRoute, already a kernel module);
  pipeline-state.mjs keeps a thin wrapper that passes its own internals,
  and the lib imports nothing from it. The file is now 1,040,728 bytes.
- New pin: every shipped plugin module stays at least 4 KiB below the
  bound, so the next overrun shows at the edit (registered as
  shipped-modules-stay-under-the-authority-source-bound-tests).

fewer-checks 8/8 (was 5/8), round trip 45/45. The bound itself is not
raised: it is an authority-kernel limit (a PO decision).

AI-Assisted: true
Dispatch: stage-0 (elephant)
