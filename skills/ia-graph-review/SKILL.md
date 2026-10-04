---
name: ia-graph-review
description: Three-engine defect hunt for a codebase under active development. Engine 1 fans out reviewers with charters named after defect classes rather than review topics; Engine 2 enumerates reachable states and finds what no diff review can see; Engine 3 drills migrations forward and back against a copy of production. Every finding is then attacked by a killer that defaults to refuted. Agents find, the owner decides, one worker fixes. Use before merging a diff that touches money, a sentinel path, or a migration — and never otherwise.
license: MIT
---

# IA Graph Review

Built on one observation: **a reviewer reading a diff cannot see a state nobody
reached.** A single reviewer looped until it runs out of things to say converges
on style and misses whole categories.

```
   ┌─ ENGINE 1: fan-out over the diff ────┐
   │                                       │
 ──┼─ ENGINE 2: sweep over reachable state ┼─► killer round ─► one list ─► owner decides ─► one worker fixes
   │                                       │
   └─ ENGINE 3: migration drill ──────────┘
```

Engine 1 finds bugs in what was written. Engine 2 finds bugs in what was never
written. Engine 3 finds the bugs that only exist between two versions of a
database — including the ones that stop the deploy that was supposed to install
a safety net.

## Non-negotiables

1. **Agents find. The owner decides. One worker fixes.** No agent edits code
   during a sweep. Parallel fixers overwrite each other, and a fix made under
   the pressure of a running loop is itself a common defect source.
2. **A finding without reproduction is not a finding.** Every finding is
   attacked by a separate killer that defaults to *refuted* (see
   `references/adversarial.md`). Agreement between reviewers is not evidence —
   a dozen agents will happily confirm a bug that does not exist.
3. **A class is never fixed one instance at a time.** The fix for a shape that
   appears in several places is an enumerating guard, not N patches. See
   `references/stopping.md` for what makes a guard a guard.
4. **Stop on residual estimate, not on a score.** "9.5/10" measures the
   reviewer's mood. Overlap between independent reviewers measures what is left.

## When it runs — and when it must not

Write this into the consuming repository's own development rules, so that it
binds rather than suggests.

**A review is due before merge when:**
- the diff touches money — ledger, orders, gateways, admin expenses,
  subscriptions;
- the diff touches a **sentinel path** from `graph-review.config.json`;
- the diff contains a **migration**;
- the architect marked the task `[GRAPH-REVIEW]`.

**Forbidden otherwise.** Weekly capacity is finite. A run "just in case" spends
what next week's money diff needs. If a slice qualifies for none of the above,
the report says so in one line and no agent is spawned.

## The budget ladder — cheap by default, full is bought

**The scarce resource is the weekly limit, so the ladder is encoded in the
config, not left to judgement.** `budget.default` is `cheap` and the self-check
refuses any other value: a full run is something somebody decides to buy, never
something a slice inherits by qualifying.

| | CHEAP — the default | FULL — bought |
|---|---|---|
| Engine 1 | **2 reviewers**, charters picked by what the diff touches | 8 charters + second echelon |
| Engine 2 | **only over the sentinel paths the diff touched** | the whole reachable-state map |
| Engine 3 | full drill if the slice has a migration | same |
| killer | tier 1 on everything, tier 2 where gated | same |
| residual estimate | **none, and the report says so** | computed |
| ≈ tokens | ~150–250k | ~700k–1M |

**FULL runs only when one of these is true**, and nothing else:

1. the diff touches a **money path** (`money_paths` in the config), or
2. the architect marked the task **`[GRAPH-REVIEW:FULL]`**.

A sentinel path or a migration on its own buys **cheap**. That is deliberate:
Engine 3 costs a database rather than a fleet of agents, and Engine 2 restricted
to the sentinels the diff actually touched is most of the value at a fifth of
the price. The fan-out is the expensive part, and the fan-out is what money buys.

Expect heavy duplication in a FULL run — three reviewers finding the same top
defect is not waste, it is the overlap the residual estimate is computed from.
Say so in the report rather than trimming charters to look efficient.

**A cheap run that finds something alarming may be escalated**, once, to full —
by the owner, recorded in the state file as a second run. It is never escalated
by an agent mid-flight.

## Engine 1 — fan-out over the diff

Independent reviewers, each with a **fresh context** and a narrow charter. Fresh
context is the point: a reviewer who saw the author's reasoning inherits the
author's blind spots.

A charter is **a defect class**, not a review topic. "The framework resets a form
once its action resolves — find the controls that trust their own memory over the
server's answer" finds the fifth instance. "Review the UI" does not.

Eight charters ship with the skill: `references/charters.md`. They get sharper
when they name your own incidents — and incident-shaped charters are rarely
publishable, so the skill also reads **`charters.local.md`** from the repository
root when it is present, adding those charters to the eight and letting a local
charter override the public one carrying the same number. Write one every time a
defect reaches production.

**Second echelon.** If three or more findings from *different* reviewers point
at one subsystem, send three or four more reviewers into that subsystem
specifically. Width where it earns itself.

Procedure: `references/engine-1-fanout.md`

## Who is spawned as what

Every role that judges, attacks or fixes is spawned BY ITS AGENT TYPE, so it
resolves to the project's own definition of that agent (model and tools live
there, not here). A role spawned without its type runs as whatever the
session's default subagent is — which is not what the project chose for it.

| role | `subagent_type` |
|---|---|
| Engine 1 charter reviewer | `general-purpose` (no type of its own) |
| Engine 1 second echelon | `ia-second-echelon` |
| Engine 2, the state sweep | `ia-engine-2` |
| Engine 3, the migration drill | `ia-engine-3` |
| killer, one per finding | `ia-killer` |
| the one worker that fixes | `ia-worker` |

If the project defines no such agent, the spawn fails with «agent type not
found»: say so in the report and stop that role — do not fall back silently.

## Engine 2 — sweep over reachable states

Engine 2 does not read the diff. It builds a map of what each stage requires,
then asks whether a reachable state exists where the stage runs and the
requirement is absent.

Three shapes, all invisible to diff review:

- **Dead end** — a stage demands an artifact that cannot exist in this state.
- **Retry-blind error** — one error shape covers "bad argument, retry helps"
  and "structurally impossible, retry never helps"; the caller burns its budget
  against a wall.
- **No exit** — every available action in a state is refused or absent. The
  classic shape: a delete path is written, documented and tested, and no screen
  ever calls it, so a record can be created and unlinked but never removed.

Engine 2 is never limited to the diff. A dead end is born where old code meets
new state, and the function that fails may not have changed in months.

Procedure and the enumeration discipline: `references/engine-2-sweep.md`

## Engine 3 — the migration drill

**Why this engine exists:** a migration that repairs data can abort on exactly
the databases that hold the data it repairs — an empty development database
proves nothing. When it aborts, everything after it in the deploy never runs,
including the constraints and triggers it was installing to make the incident
impossible. Neither a diff review nor a state sweep can see that. Only running
it against real data can.

Mandatory whenever the slice contains a migration. It applies forward **and
back** against a copy of the production schema, and where the migration repairs
data, against a copy of production **data**.

Procedure: `references/engine-3-migration.md`

## The killer round

Every finding, from every engine, goes to a separate agent — spawned as
`ia-killer` — whose job is to
**refute** it — and which returns `refuted` when it cannot decide. Survivors are
promoted to the list; the rest go to `discarded_findings` in the state file with
the reason, so the next sweep does not re-litigate them.

This is not optional and not a footnote. It is the step that separates this from
eight agents generating confident plausible text.

Charter and rules: `references/adversarial.md`

## Finding format

Every finding, from any engine, in exactly this shape. A finding missing a field
is dropped by the agent that produced it, not passed on.

```
WHERE        file:line  — the WRITE ANCHOR: the line that performs the wrong
                          action, not the line where the symptom is noticed.
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

`REACHABLE` decides urgency independently of severity. `guarded` and `latent`
look alike and mean opposite things: guarded is blocked by something written on
purpose that goes red if removed, latent is blocked by an accident of the
current wiring. **Only `guarded` may stay unfixed.** A latent defect is
scheduled with its trigger named, never dismissed — that is how a known bug
ships six weeks later with everyone believing it was considered.

`SEVERITY`, in the owner's terms:
- `breaks_money` — a client is charged twice, or paid work is lost
- `breaks_safety` — nothing a user sees breaks, and a guard silently fails to
  exist or fails to fire. A migration that aborts before installing its triggers
  is the canonical case
- `breaks_order` — the job stops or produces the wrong thing
- `degrades_experience` — it works, but the client suffers
- `cosmetic` — the rest

**An executable reproduction is required where the kill phase buys one** — the
finding survived the reading kill AND touches a sentinel or money path. It is
**committed as a skipped quarantined test carrying its finding id**, and
un-skipped in the same commit as the fix. The finding and its future regression
test are one artefact; the expensive part is paid once.

Full rules: `references/finding-format.md`

## Consolidation and stopping

One pass merges: drop what the killer refuted, merge duplicates by `WHERE`,
group classes and sum their instances, sort classes first then by severity, then
compute the residual estimate.

Gates, the residual formula, and what closes a class:
`references/stopping.md`

## Self-check — first, every session

```bash
node bin/self-check.mjs --skill <plugin dir>
```

Manifests, config shape, every sentinel and money path, state-file integrity,
quarantine hygiene. **Run it before spawning a single agent.** The skill's own
failure mode is silent rot — a renamed sentinel, a state file broken by a merge —
and a skill pointed at nothing still produces a clean-looking report.

Exit 1 means fix that first. It is not advisory.

## State — what the sweep remembers

Reviewers are stateless on purpose. Everything that must survive between runs
lives in `graph-review-state.json`, and **this skill writes it** — the last step
of every run, not an aspiration:

- `closed_classes` — shapes an enumerating guard already covers, so reviewers
  stop re-reporting them
- `discarded_findings` — what the owner or the killer already declined, with the
  reason, so no sweep re-litigates a settled decision
- `runs` — what was reviewed, in which mode, and what it cost

**Updating the state file is part of DONE.** A run that did not write it did not
happen: its refutations will be re-reported, its closed classes re-found, and its
cost will not exist in any record. The self-check reads the file, so the next run
begins by noticing.

Schema and the write step: `references/state.md`

## Configuration

`graph-review.config.json` in the repository root. Sentinel paths are the entry
that matters; everything else has a working default.

**The sentinel list is guarded.** `guards/sentinel-paths.test.ts` fails when a
listed path no longer exists — a renamed file would otherwise stop triggering
Engine 2 silently, which is the very failure the sentinel rule exists to
prevent, one level up.

Fields, defaults and how to choose sentinel paths: `references/config.md`
