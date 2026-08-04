# Configuration

`graph-review.config.json` in the repository root.

## sentinel_paths — the entry that matters

The files where **what needs what** is declared: requirement registries, rule
resolvers, money paths, migrations. The rule they drive: a slice touching any of
them makes Engine 2 mandatory and unskippable.

The decision is made by fact rather than by memory. Six weeks in nobody
remembers when the sweep is needed, and it quietly stops running.

**How to choose.** Ask: if I changed this file, could a stage start requiring
something new, or stop requiring something? If yes, it is a sentinel path.

**Do not list the repository.** Forty paths means Engine 2 runs every time,
which is the same as having no rule. Thirteen is the working size here.

**The list is guarded.** `guards/sentinel-paths.test.ts` fails when a listed path
does not exist. A renamed file would otherwise stop triggering Engine 2 silently
— the exact failure the sentinel rule exists to prevent, one level up. Copy the
guard into the consuming repository's test suite; it runs in seconds.

## test_command

Must carry its own preconditions. If the suite needs a real database, a seeded
fixture or an environment variable, put it in the command — without it those
tests fail for a reason that is **not a finding**, and a skill reading those
failures as signal spends a scarce weekly run on the project's own setup.

Where a precondition is non-negotiable, name it in `test_command_must_match`: a
regular expression the self-check requires `test_command` to satisfy. Example:
`"test_command_must_match": "TEST_DATABASE_URL"` makes it impossible to quietly
degrade the suite to one that runs without a database. Omit the field and only
non-emptiness is enforced.

## mode

`scout` or `full`. See SKILL.md for what each costs and what each gives. The
mandatory cases are always `full`.

## fanout

`default_reviewers: 8` is the full charter set. Raise it only if charters stop
overlapping — more reviewers on the same territory return invention, not signal.

`second_echelon_trigger: 3` — findings from distinct reviewers pointing at one
subsystem before reinforcing it.

## engine_2

`force_after_n_slices: 5` guards against drift: systems change what needs what
without anyone editing a requirement file.

`default_strength: 2` is pairwise. Most interaction failures involve one or two
parameters. Escalate to three selectively, never globally.

## engine_3

`schema_dump` and `data_dump` are the commands that produce a copy of production
to drill against. `data_dump` is required whenever a migration contains a repair
block — a schema-only drill cannot find a repair that collides with real rows.
