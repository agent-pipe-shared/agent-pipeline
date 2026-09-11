# Guard signature role ceremony

Date: 2026-09-11

Implementation commit: `b10e9b4864898fe09504072361e35be07ae99500`

The signature-mode guidance emitted by the Codex, Antigravity, gate-strength
and lifecycle guard renderers now presents one executable sequence with clear
roles:

1. the agent session prepares the authorization and emits the bound intent
   digest;
2. the PO/operator runs the exact external `sign-intent` command with the
   human-held key and obtains `proof-manual.json` and `signer-manual.json`;
3. the agent session consumes the proof through `authorize-by-signature`
   without access to the private key.

Chat-mode, nonliftable and lifecycle-not-ready paths do not advertise a
signature ceremony. Only the external signing command retains dual-platform
copy-safe rendering; proof verification uses the current agent session's
known shell.

Focused host tests passed:

- `guard-lifecycle-ready`: 253/253
- Codex pretool guard focused ceremony probe: 1/1
- Antigravity pretool guard: 56/56
- gate-strength: 38/38

The final independent correction Critic returned PASS with no findings. It
confirmed the role order, private-key boundary, chat/nonliftable omissions and
the shell-rendering boundary across all eight changed guard and test files.
