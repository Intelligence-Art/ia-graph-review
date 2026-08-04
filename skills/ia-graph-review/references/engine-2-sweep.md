# Engine 2 — sweep over reachable states

Engine 2 does not read the diff. It reads the system, builds a map of what each
stage requires, and asks whether a reachable state exists in which the stage
runs and the requirement is absent.

## When it runs

- the diff touches a sentinel path → **mandatory**;
- the diff contains a migration → mandatory (with Engine 3);
- five slices since the last run → mandatory, because systems drift without
  anyone editing a requirement file;
- a dead end reached production → mandatory, and the map is rebuilt from
  scratch: a dead end escaping means the map was already wrong.

Otherwise skipped — **and the report says so explicitly.** "Engine 2 skipped: no
sentinel path touched" is part of the work. Silence reads as "it ran".

## Procedure

1. **Build the requirement map.** For each stage, what must exist for it to
   succeed: rows, fields, files, permissions, prior states.
2. **Enumerate the dimensions** that vary independently — the feature switches
   the record carries, how many parents it is attached to, whether it is inside
   or outside its time window, where the actor's access came from, whether
   optional media is present. Name yours explicitly; a dimension nobody wrote
   down is a dimension nobody walks.
3. **Walk the combinations**, pairwise by default. Escalate to three-way only
   where a pairwise walk found a dead end — three-way over every dimension
   explodes the count for little gain.
4. **List the combinations actually walked** at the end. A sweep that does not
   say what it covered cannot be trusted about what it did not find.

## The three shapes

**Dead end.** A stage demands an artifact that cannot exist in this state. A
common shape: an editor shows a setting that belongs to the *parent* while the
record being edited is shared by several parents with different values — the
author sets a number believing it applies, and it applies somewhere else too, or
nowhere.

**Retry-blind error.** One error shape covers "bad argument, retry helps" and
"structurally impossible, retry never helps". The caller burns its retry budget
against a wall.

**No exit.** Every action available in a state is refused or absent. The shape
that keeps recurring: a delete path, its in-use error and its force branch are
all written, documented and unit-tested — and no screen ever calls the action, so
a record can be created and unlinked but never removed. The unlinked record then
has no parent to open it through either, so it cannot even be inspected. Unit
tests pass throughout: they call the function the UI does not.

## The most valuable answer Engine 2 gives

Sometimes it is not a defect: it is **"this cannot be reached at all yet"**.

On one calibration run the sweep established that two resolver modules had zero
importers outside their own tests: every combination of the switches they
implemented was latent rather than live. That single fact reclassified a whole
group of findings and corrected how the team had been describing its own
system.

Record it as a finding with `REACHABLE: unreachable` and a severity of
`cosmetic`, with the explanation in `WHAT BREAKS`. It is not a bug; it is the
map being honest, and the format has a slot for it precisely so it does not have
to be smuggled into an appendix.
