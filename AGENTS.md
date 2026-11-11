# ImmerseWord — Agent Instructions

## Branching & PR workflow

- `main` stays clean: never commit feature or bugfix work directly on `main`.
- Every feature or bugfix is implemented on its own branch, named `pr/NN-slug`
  (use the next free number: `git branch --list 'pr/*' | sort`).
- Deliver by pushing the branch, opening a PR against `main`, and merging the
  PR — never by committing or fast-forwarding `main` directly.
- Merge only with all gates green: `npm run typecheck`, `npm run test:unit`,
  `npm run test:e2e`.
