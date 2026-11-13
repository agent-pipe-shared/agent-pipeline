test(agy-final-return): admit a framework route path as K-32 does

AFR08 still expected src/file[1].mjs to be refused. Since K-32 the path
rule admits brackets and parentheses, and the host stages such a path
with --literal-pathspecs. The case now admits a route path such as
src/app/(payload)/cms-api/[...slug]/route.ts and keeps * ? { } $ and the
backtick refused.

AI-Assisted: true
Dispatch: stage-0 (elephant)
