# State rotation for portable continuation

The current state entry exceeded the installed 30,000-byte handover cap.
The entry is now concise and points to the central handover and historical
archive. The pre-rotation bytes were captured before replacement, with SHA256
`6c7649fdc6e55ad93afaf2b6dd2c97f5aa1c52803542ec998c9c37485adde093`.

The first archive commit attempt was refused because that text contained one
machine-local Home prefix. Its public archive normalizes only that prefix to
`<host-home>` and adds an explanatory header. Counts, outcomes, holds and
historical dispositions are preserved. The original digest documents the
projection boundary; the archive is not a byte-exact raw execution receipt.
The installed privacy guard and size limit are retained, with no bypass.
