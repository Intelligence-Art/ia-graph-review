# IA Graph Review

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-black.svg)](./CHANGELOG.md)

**A three-engine defect hunt for code that is about to be merged.**

Agents find. The owner decides. One worker fixes.

```
   ┌─ ENGINE 1: fan-out over the diff ────┐
   │                                       │
 ──┼─ ENGINE 2: sweep over reachable state ┼─► killer round ─► one list ─► owner
   │                                       │
   └─ ENGINE 3: migration drill ──────────┘
```

Engine 1 finds bugs in what was written. Engine 2 finds bugs in what was never
written — combinations that lead nowhere, states in which every available action
is refused. Engine 3 finds the bugs that exist only between two versions of a
database, including the migration that aborts before installing the safety net
it was carrying.

Then a killer round attacks every finding and **returns refuted when it cannot
decide**, because a model asked "is this a bug?" will build you a story in which
it is.

---

## Why not just loop a reviewer

A review loop and this are not the same tool, and the difference is worth being
concrete about.

| | a reviewer looped until it stops talking | ia-graph-review |
|---|---|---|
| what it reads | the diff | the diff, the reachable state space, and the migration running against real data |
| context | one context, accumulating | a fresh context per reviewer — the author's reasoning is not inherited |
| what stops it | it runs out of things to say | a residual estimate computed from reviewer overlap |
| confidence | agreement between passes | a separate agent whose job is to **refute**, defaulting to refuted |
| a defect in five files | five findings | one finding, `SHAPE: CLASS`, closed by one enumerating guard |
| memory between runs | none | `graph-review-state.json` — closed classes, declined findings, run costs |
| cost control | however long you let it run | a ladder encoded in config; `cheap` by default, `full` must be bought |
| migrations | read as text | applied forward and back against a copy of production |

The honest part: a loop is cheaper, simpler, and fine for most diffs. This is
built for the diff you cannot afford to be wrong about, and it says so in its
own rules — **it is forbidden to run on anything else.**

The other honest part: on a small diff a loop will often find the same top
finding this does. What it will not do is tell you the shape appears in four
other files, refuse to accept a finding anchored at a symptom, or notice that
the migration installing your new constraint aborts on exactly the databases
that need it.

---

## Install

One command each, from GitHub:

```bash
claude plugin marketplace add Intelligence-Art/ia-graph-review
```

```bash
claude plugin install ia-graph-review@intelligence-art
```

The skill is discovered from `skills/` — nothing to register, nothing to path.
Check it is there:

```bash
claude plugin list
```

## Quickstart

Prove the install against the bundled example before pointing it at your own
code:

```bash
cd examples/toy-project && node ../../bin/self-check.mjs --skill ../..
```

Five `ok` lines mean the manifests, config shape, every configured path, the
state file and the quarantine directory are all sound. Then set it up in your
repository:

```bash
mkdir -p tests/quarantine scripts
cp templates/config.example.json ./graph-review.config.json
cp templates/graph-review-state.json ./graph-review-state.json
cp guards/sentinel-paths.test.ts ./tests/
cp bin/self-check.mjs ./scripts/graph-review-self-check.mjs
```

Now edit `graph-review.config.json` — the placeholder paths in it are
placeholders, and the self-check fails until they name real files. That failure
is the setup step, not a bug.

Run the self-check **first, every session, before a single agent**:

```bash
node scripts/graph-review-self-check.mjs
```

Exit 1 is not advisory. The skill's own failure mode is silent rot — a renamed
sentinel, a state file broken by a merge — and a skill pointed at nothing still
produces a clean-looking report.

---

## Configuration

`graph-review.config.json` lives in the repository root. Two entries carry the
weight; everything else has a working default.

**`sentinel_paths`** — the files where *what needs what* is declared: access
rules, progression, structure, the migrations directory. Touching one makes the
state sweep mandatory. Keep the list under about twenty; past that the sweep
runs every time, which is the same as having no rule.

**`money_paths`** — touching one buys a `full` run automatically and requires an
executable reproduction for every `breaks_money` finding.

**The list is guarded.** `guards/sentinel-paths.test.ts` fails when a listed
path no longer exists — otherwise a rename stops triggering the sweep silently,
which is the exact failure the sentinel rule exists to prevent, one level up.

Optional: `test_command_must_match`, a regular expression the self-check
requires `test_command` to satisfy. Use it to pin a precondition — a real
database, a seeded fixture — so nobody can quietly degrade the suite to one that
runs without it.

Full field reference: [`references/config.md`](skills/ia-graph-review/references/config.md).

### Private charters — the overlay

The eight shipped charters are **defect classes**. They work, and they work
considerably better once they name your own incidents:

> *generic* — "a copy of another field acquires a second writer later."
>
> *sharpened* — "the title on a list row is a copy of the record's; the inline
> rename writes the copy while the editor reads the original, so the next save
> reverts the rename. Find the others."

The second finds the next instance. The first asks the reviewer to imagine it.

Incident-shaped charters describe what broke in a specific system, which is
rarely something a team wants to publish — so the skill reads an optional
overlay from your repository root:

```
charters.local.md
```

If it exists, its charters are used **in addition to** the eight, and a local
charter with the same number overrides the public one. Same format, same run,
same report. The file is in this repository's `.gitignore`; keep it beside your
config, and write a charter every time a defect reaches production. That is the
cheapest moment — the day it hurt.

---

## Budget: cheap by default, full is bought

The scarce resource is the weekly limit, so the ladder is **data in the config,
not a judgement call**. `budget.default` must be `cheap` and the self-check
refuses any other value.

| | CHEAP — the default | FULL — bought |
|---|---|---|
| Engine 1 | **2 reviewers**, charters picked by what the diff touches | 8 charters + second echelon |
| Engine 2 | only the sentinel paths this diff touched | the whole reachable-state map |
| Engine 3 | full drill if the slice has a migration | same |
| killer | tier 1 on everything, tier 2 where gated | same |
| residual estimate | none, and the report says so | computed |
| **≈ tokens** | **150k–250k** | **700k–1M** |

Those numbers are measured, not estimated. A cheap run on a moderate fix diff
came in at **225k tokens** across two reviewers in parallel; a full calibration
run across seven agents came in at **790k**.

**FULL runs only when** the diff touches a money path, or the task is explicitly
marked `[GRAPH-REVIEW:FULL]`. A sentinel path or a migration on its own buys
cheap — Engine 3 costs a database rather than a fleet of agents, and a sweep
restricted to the sentinels the diff actually touched is most of the value at a
fifth of the price. The fan-out is the expensive part, and the fan-out is what
money buys.

---

## The four non-negotiables

1. **Agents find. The owner decides. One worker fixes.** No agent edits code
   during a sweep. Parallel fixers overwrite each other, and a fix made under
   the pressure of a running loop is itself a common defect source.
2. **A finding without reproduction is not a finding.** Every finding is
   attacked by a separate killer that defaults to *refuted*. Agreement between
   reviewers is not evidence — a dozen agents will happily confirm a bug that
   does not exist.
3. **A class is never fixed one instance at a time.** The fix for a shape that
   appears in several places is an enumerating guard, not N patches.
4. **Stop on a residual estimate, not on a score.** "9.5/10" measures the
   reviewer's mood. Overlap between independent reviewers measures what is left.

## Findings

```
WHERE        file:line  — the WRITE ANCHOR: the line performing the wrong
                          action, not the line where the symptom shows.
                          This is also the deduplication key.
WHAT BREAKS  the concrete scenario, not "may cause issues"
PROOF        code quote or a reproduction another agent can replay
REACHABLE    today | guarded | latent | unreachable
SHAPE        CLASS (N instances, each listed with file:line) | INSTANCE
SEVERITY     breaks_money | breaks_safety | breaks_order | degrades_experience | cosmetic
```

`WHERE` is the write anchor so that four reviewers describing one defect land on
one anchor and consolidation is mechanical rather than a judgement call. **A
finding citing an observation site is not accepted into the list** — it is
resolved to the write site first, or it is a symptom whose defect nobody has
found yet.

`REACHABLE` decides urgency independently of severity, and two of its values
look alike while meaning opposite things:

- **`guarded`** — blocked by something written on purpose that goes red if
  removed. **This is the only value permitted to stay unfixed.**
- **`latent`** — blocked by an accident of the current wiring. Scheduled with
  its trigger named, never dismissed. Otherwise a known bug ships six weeks
  later with everybody believing it was considered.

`breaks_safety` deserves its own line: nothing a user sees breaks, and a guard
silently fails to exist or fails to fire. A migration that aborts before
installing its triggers is the canonical case.

**Executable reproductions are committed, not scratched.** Where the kill phase
buys one — the finding survived the reading kill *and* touches a sentinel or
money path — it lands in `tests/quarantine/` as a **skipped test carrying its
finding id**, and is un-skipped in the same commit as the fix. The finding and
its future regression test are one artefact: the expensive part, constructing
the failing state, is paid once.

## State: what the sweep remembers

Reviewers are stateless on purpose. Everything that must survive between runs
lives in `graph-review-state.json`, and **writing it is part of DONE** — a run
that did not write it did not happen. Its refutations will be re-reported, its
closed classes re-found, and its cost will exist in no record.

- `closed_classes` — shapes an enumerating guard already covers, each naming
  that guard. A closed class without a guard is a fix somebody remembered, and
  the self-check rejects it.
- `discarded_findings` — what the killer or the owner already declined, with the
  reason and the date, so no later sweep re-litigates a settled decision.
- `runs` — what was reviewed, in which mode, and what it cost.

## Documentation

| file | what is in it |
|---|---|
| [`SKILL.md`](skills/ia-graph-review/SKILL.md) | the method |
| [`charters.md`](skills/ia-graph-review/references/charters.md) | the eight defect classes, and the overlay |
| [`engine-1-fanout.md`](skills/ia-graph-review/references/engine-1-fanout.md) | fan-out procedure, reading the overlap |
| [`engine-2-sweep.md`](skills/ia-graph-review/references/engine-2-sweep.md) | state sweep, the three defect shapes |
| [`engine-3-migration.md`](skills/ia-graph-review/references/engine-3-migration.md) | the migration drill |
| [`adversarial.md`](skills/ia-graph-review/references/adversarial.md) | the killer round and its two tiers |
| [`finding-format.md`](skills/ia-graph-review/references/finding-format.md) | the format, and why `WHERE` is the write site |
| [`stopping.md`](skills/ia-graph-review/references/stopping.md) | guards, the residual estimate |
| [`state.md`](skills/ia-graph-review/references/state.md) | what the sweep remembers, and who writes it |
| [`config.md`](skills/ia-graph-review/references/config.md) | every configuration field |
| [`examples/`](examples/README.md) | a toy project, a toy diff, and what is wrong with it |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: the self-check must
pass, and a finding needs a reproduction.

## License

MIT — see [LICENSE](./LICENSE).
