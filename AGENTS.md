# ImmerseWord — Agent Instructions

## Branching & PR workflow

- `main` stays clean: never commit feature or bugfix work directly on `main`.
- Every feature or bugfix is implemented on its own branch, named `pr/NN-slug`
  (use the next free number: `git branch --list 'pr/*' | sort`).
- Deliver by pushing the branch, opening a PR against `main`, and merging the
  PR — never by committing or fast-forwarding `main` directly.
- Merge only with all gates green: `npm run typecheck`, `npm run test:unit`,
  `npm run test:e2e`.

## Bug-report workflow

When the user reports a bug:

1. **Record** the raw report verbatim in `docs/user_feedback/bugs.md` with a
   timestamp and a stable ID (`bug-YYYY-MM-DD-NNN`). Never edit past entries.
2. **Analyze** it and write a structured bugfix proposal (SBFP) in
   `docs/sbfp_logs.md`: symptom, root cause, evidence, fix, verification,
   risks, outcome.
3. **Implement** the fix on its own `pr/NN-slug` branch and deliver via PR
   (per the branching rule above); append the outcome to the SBFP entry when
   the PR merges.

## Feature-request workflow

When the user requests a new feature:

1. **Record** the raw request verbatim in `docs/user_feedback/feats.md` with a
   timestamp and a stable ID (`feat-YYYY-MM-DD-NNN`). Never edit past entries.
2. **Analyze** it and write a structured implementation proposal (SIP) in
   `docs/sip_logs.md`: motivation, scope, UX sketch, technical approach,
   test plan, risks, outcome.
3. **Update docs**: extend `docs/PRD.md` and add or amend the related ADR in
   `docs/adr/` as part of the same PR as the implementation.
4. **Implement** on its own `pr/NN-slug` branch and deliver via PR (per the
   branching rule above); append the outcome to the SIP entry when the PR
   merges.
