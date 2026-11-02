# Pending PO tiles (collected while the PO is AFK, 2026-11-01)

1. **D231 re-decision (blocks the Continuity close owner route).** The slice stopped: no shipped issuer gives a shell-started CLI a requester identity.
   Option A needs a NEW fixed issuer in `lib/session-requester-bridge.mjs` (a new root of authority for State writes; reverses "a binding is never created from
   a plain terminal"). Choices: (a) build the new issuer, with decisions A) may a plain-terminal process own State writes, B) close-route course predicate,
   C) owner identity (fresh per-invocation descriptor vs host session), D) release per entry; (b) take tile B (direct route for attended close entries,
   reopens the owner-bound write); (c) leave open. Notes: `specs/sprint-alfred-epic/evidence/held-patches/w11-continuity-close-owner-route-cli-d231.notes.md`.
2. Where was `ls` refused? (D232) The source grammar already admits `ls -l/-h/-lh` on an admitted directory. Need the exact command and denial text:
   installed hook older than the source, a Windows PowerShell session, or the native Glob tool (hidden or escaping listings are refused).
   Related, from `candidate11-follow-ups` item 6: the Toolbox consumer's native Glob on `project/` (the calibration directory) is refused; the refusal
   depends on the tree content (the recursive credential screen), so the consumer's exact denial text and a listing of that directory are needed.
3. Positive rg glob filters beyond `*.ext` / `*.test.ext` (`**/*.md`, `*.tar.gz`, `*.{md,txt}`): admit? They override ignore rules and can select hidden
   names. Recommendation: admit `**/*.ext` and multi-dot extensions only.
4. Marker rule of `lib/gh-cmd.mjs` does not name `gh run`: a `gh run` shape behind an UNLISTED wrapper reads as none. Widening it makes
   `git commit -m "... gh run ..."` an unclassified refusal. Recommendation: leave as is, documented.
5. `push-init` hint for push mode (N24): the working route for a consumer was release mode with a fresh output file; which mode should the hint name?
7. Built as answer to "glob and ls -lh are only reads" (w14, in 15c): native Glob now lists `json/jsonl/patch/log/sh/toml/csv` and one trailing brace group
   (`*.{md,mjs}`) of the allowed extensions; `ls -lh` was already admitted (measured). Open: native Glob negation does not exist; credential-shaped
   extensions (`pem`, `key`, `env`, `output`) stay refused. Is a broader list (any non-credential extension) wanted? Recommendation: no, keep the allowlist.
8. Found while rehearsing 15c: T77 (guard-lifecycle-ready) pinned the negated rg filter as refused; restated as w15 (test only). The D232 evidence had not
   run that 12k-line suite; the combined run now includes it (603 tests, 598 pass, 5 typed skips, scan clean, doc contracts valid).
9. N38 predicate (the delta verb picks its candidate with a different "evidence-only" test than the transport check uses; 15c only names the chosen commits in the refusal, w18).
   Choose one predicate: (a) a commit that changes the manifest core (a reconcile) is NOT evidence-only for the candidate choice, so it becomes the candidate; (b) the transport check
   accepts a PO-signed reconcile commit; (c) keep both and rely on the better refusal text. Recommendation: (a), because it keeps the transport check strict. Either choice changes
   which commit a Critic delta round reviews, hence the PO's call.
10. Architecture boundary ratchet (`architecture-boundary-check.mjs`, item 6 of `pre-existing-reds-hide-new-cases`): the 15c end state still reports about a hundred findings
   (over-line-bound files such as `session-critic-finalizer.test.mjs` 2251/1000 and `setup.test.mjs` 1407/1402; most top-level `scripts/` files unowned). A newly grown file hides among them.
   Choose: (a) re-baseline the ratchet in `architecture/boundary-policy.json` once, with one reason per group, and let growth fail from then on (Recommendation: it is the only way a new violation becomes visible);
   (b) split the largest files in slices (large, no behaviour change); (c) leave it. Either way it is a policy-file change, not a product change.
11. Wanted 3 of the Goldfish-stop item (integration-dependency hold next to a disjoint-scope slice) cannot be reproduced from the code; it needs the queue rows and the refusal text of the N27-next-to-N25 case.
12. D231 slice 2 (`close-feature` on the owner route) is not small: it touches kernel authority (retire the per-invocation owner descriptor before the entry, a retired terminal for a physical-readback requester) and no Critic may run now.
   Choose: (a) dispatch it as a held Goldfish-deep slice during the AFK window and review it only at the sitting (Recommendation: no, an unreviewed kernel change in a candidate you test locally); (b) build it after the sitting once Critics are allowed again;
   (c) keep the attended close as the only `close-feature` route for now.
13. Residual acceptance expiry (N36, `residual-acceptance-expires-after-the-signature-window`): `verifySignedAction` checks `expiresAt` on every read, so an acceptance signed yesterday is refused at feature close as `RESIDUAL-PROOF-EXPIRED`.
   Choose: (a) check the window only when the acceptance is captured (a consumed acceptance is a historical record; the consumption ledger already proves validity at that moment) (Recommendation: weakest change that fixes the loss of a signature);
   (b) keep the check and only make the refusal name the route (capture the acceptance again, then approve it again); (c) extend the window by policy. (a) loosens an authorization check, so it is your call.
6. Next apply sitting: PO names the time; until then small 0.7.x items are built into 15c.
14. Feature-close audit chain has a hole (confirmed by the Toolbox consumer on the installed 15c build): no shipped verb sets `manifest.candidate` or registers the Verify evidence as a candidate-evidence entry; `feature-package-plan --next-state completed` is rejected (invalid-transition) and `--next-state verifying` previews a manifest the topology check refuses (FTP-CANDIDATE). Backlog item `no-verb-sets-the-package-candidate-or-registers-the-verify-evidence`, release 0.7.1.
   Choose: (a) a new verb that sets the candidate and registers the Verify evidence for a package in verifying, in the next candidate (Recommendation: the route stays a sanctioned, bound verb and no hand edit of an authority artifact is needed); (b) a PO-signed hand edit of the manifest as the documented route (weaker: digests and guards bind the manifest bytes); (c) keep the attended close as the only route. The Toolbox lifecycle waits in checkpointed meanwhile.
15. Matrix scope: seven shipped 15c items carry `release: 0.7.1` and have no matrix row (D229 core pack, D230 CI rerun, D231 slice 1, D232 rg glob, N38 delta candidate, N39 part 1, N44 selection half).
   Choose: (a) add them as rows now (D231 at 50 because slice 2 is open) or (b) leave them to the 0.7.1 matrix (Recommendation: (b); the earlier rows were counted because their items were `release: 0.7.0`, counting 0.7.1 items is your scope call).
