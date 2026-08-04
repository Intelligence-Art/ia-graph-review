# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-08-04

First public release.

### Added

- **Engine 3, the migration drill** — a migration is applied forward and back
  against a copy of the production schema, and against a copy of production
  *data* wherever it repairs rows. It exists because a repair block can abort on
  exactly the databases that hold the data it repairs, and everything after it in
  the deploy — including the constraints it was installing — then never runs.
  Neither a diff review nor a state sweep can see this.
- **The budget ladder, encoded in config.** `budget.default` is `cheap` and the
  self-check refuses any other value. A `full` run is bought by a money-path diff
  or an explicit `[GRAPH-REVIEW:FULL]` mark, never inherited by qualifying.
  Measured cost: cheap ≈ 150k–250k tokens, full ≈ 700k–1M.
- **Two-tier kill economics.** Tier 1, reading the code at the write anchor, runs
  on every finding. Tier 2, an executable reproduction, runs only where the
  finding survived tier 1 **and** touches a sentinel or money path — both
  conditions, not either, or the kill phase eats the limit it exists to protect.
- **`REACHABLE: guarded`** as a distinct value from `latent`. They look alike and
  mean opposite things: guarded is blocked by something written on purpose that
  goes red if removed; latent is blocked by an accident of the current wiring.
  Only `guarded` may stay unfixed.
- **Quarantined regression tests.** A finding that buys an executable
  reproduction is committed as a *skipped* test carrying its finding id, and
  un-skipped in the same commit as the fix. The finding and its regression test
  are one artefact; the expensive part is paid once.
- **`bin/self-check.mjs`** — manifests, config shape, every configured path,
  state-file integrity and quarantine hygiene. Run first, every session. Exit 1
  is not advisory.
- **`guards/sentinel-paths.test.ts`** — fails when a configured path no longer
  exists, so a rename cannot silently stop triggering the sweep.
- **The private charter overlay.** `charters.local.md` in the repository root is
  merged into the shipped charters at run time, so a team can sharpen a charter
  with its own incidents without publishing them.
- **`test_command_must_match`** — an optional regular expression pinning a
  suite's non-negotiable precondition, so it cannot be dropped quietly.
- **`examples/`** — a toy project the self-check passes against, a toy diff, and
  a written account of what is wrong with it.

### Changed

- **`WHERE` is the write anchor**, defined as the deduplication key. A finding
  citing an observation site is not accepted into the list; it is resolved to the
  write site first, or it is a symptom whose defect nobody has found yet.
- **Charters are defect classes**, each stated with what it hunts, why the class
  exists and the smell that identifies a candidate — not review topics.
- **Stopping is a residual estimate** computed from reviewer overlap, replacing
  any self-assessed score.
- **State-file writing is part of DONE.** A run that did not write
  `graph-review-state.json` did not happen, and the self-check reads the file so
  the next run begins by noticing.
- Plugin manifests corrected to the schema: `owner` and `author` are objects, and
  the unsupported `skills` key is gone — skills are discovered from `skills/`.

[1.1.0]: https://github.com/Intelligence-Art/ia-graph-review/releases/tag/v1.1.0
