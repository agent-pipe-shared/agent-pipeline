test(scanner-diagnostics): name the Unix socket path limit instead of failing in setup

G13D012 listens on a Unix socket at
<tmpdir>/g13-publish-XXXXXX/evidence/security-latest.diagnostics.json.
Under the parallel runner's private TMPDIR that path exceeds the
sun_path bound, listen fails in the setup, and the case was red on 29b
and 29c alike while green with a short TMPDIR. The case now computes the
path length up front and skips with a host-limitation reason above 107
bytes, the same form the win32 skip already uses.

AI-Assisted: true
Dispatch: stage-0 (elephant)
