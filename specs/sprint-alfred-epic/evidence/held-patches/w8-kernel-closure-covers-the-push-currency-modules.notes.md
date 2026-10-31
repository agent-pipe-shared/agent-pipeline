# w8-kernel-closure-covers-the-push-currency-modules (held patch, not applied)

Cause of the red `guard-maintenance-window-kernel-closure` suite (GMWKC01, three violations; red before and independent of the trace patch):

- `pre-push-hook-install.mjs` now has ten dynamic-import call sites, but `DYNAMIC_IMPORT_EDGES` declared eight. The two missing are `critical-action-authorization.mjs`
  (already kernel) and `published-tag-push.mjs`.
- `published-tag-push.mjs`, reached through that edge, and `architecture-push-currency.mjs`, imported statically by `push-init.mjs` and `critic-dispatch-preflight.mjs`,
  were not in `NEVER_LIFTABLE_KERNEL_PATHS`, so a maintenance window could have covered the code that decides what a push or a Critic dispatch admits.

Change: the edge table lists the two missing sites (comment: ten), `NEVER_LIFTABLE_KERNEL_PATHS` gains the two modules, and `docs/guard-maintenance-window-threat-model.md`
names them in its Protected-assets prose (GMWKC03 requires every entry to be mentioned there). The walk reaches no further unlisted module after these two.

Evidence (clean clone): the closure suite 11/11 (was 10 of 11), `guard-maintenance-window` lib 63/63, its script suite 16/16, the closure-masking pin 8/8 and the guard split
contract 5/5. This patch touches a never-liftable kernel list, so it is applied by the PO's apply script like every kernel patch. Applies to the repository HEAD.
