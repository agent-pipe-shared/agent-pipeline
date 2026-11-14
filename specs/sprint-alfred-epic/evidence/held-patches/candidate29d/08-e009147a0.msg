test(security-scan): the close postimage CLI stops on a real gitleaks finding (C2)

The one-shot close spawns security-scan.mjs --close-postimages <feature>;
the finish-feature tests stub that call. A new case runs the real CLI on
a real repository: a generated briefing copy under specs/<feature>/
holding a key-shaped value (generated at run time, so no secret-looking
literal lives in the test) makes the CLI exit 2 with exactly one finding
at its path and line; neither stdout nor stderr carries the value; the
scan copy under scratch/ is removed; after the source is redacted the
identical command exits 0 with status pass. On a host without a trusted
gitleaks the case prints a SKIP line with the reason (host limitation);
the parity block covers the verdict there.

AI-Assisted: true
Dispatch: stage-0 (elephant)
