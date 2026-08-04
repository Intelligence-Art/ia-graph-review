# Charters

A charter is not a topic. It is **a defect class**, stated precisely enough that
a reviewer hunts a known animal instead of surveying a landscape.

"Review the UI" returns opinions. "The framework resets a form after its action
resolves — find every control that trusts its own memory over the server's
answer" returns the fifth instance of a bug that has already shipped four times.

Each charter carries: what it hunts, why the class exists, and the smell that
identifies a candidate. The examples are illustrative — replace them with your
own the moment you have one (see **Sharpening** at the end).

---

## 1 — Form and view state after a server write

**Hunts:** controls that show one value while the store holds another.

**Why the class exists:** most UI frameworks re-render, reset or replay a form
around an async submit, and a control that keeps its own copy of the value
survives that reset holding the old one. The server is happy, the row is
correct, and the screen lies. It is invisible to every test that does not run a
real browser.

**Smell:** a controlled input inside a framework-managed submit; a component
that never adopts a changed value from the server; a save path that closes an
editor before the server has answered; a field disabled to mean "not
applicable" — a disabled input submits nothing, so the server reads *absent*.

**Ask:** after this save, what does the control show and what does the store
hold? Are they provably the same value, or the same value only when nothing
went wrong?

---

## 2 — Denormalised copies and their writers

**Hunts:** a field copied from another field, with more than one writer.

**Why the class exists:** a copy is added for a good reason — avoiding a join,
avoiding a fan-out — and its contract is always "one writer keeps it true". The
second writer arrives later, usually in a different file, written by somebody
who read the display path rather than the contract. Then the two values diverge
and whichever is read last wins.

**Smell:** a comment containing "the only writer", "single source", "kept in
sync"; a bulk update that fans a value out; any field written in two files.

**Ask:** enumerate every writer of this field by search, not by memory. Does the
count match what the comment claims? If a copy has two writers, the fix is
usually to delete the copy rather than to synchronise it harder — a divergence
that cannot be represented cannot happen.

---

## 3 — Check-then-act across a boundary

**Hunts:** a decision read in one place and acted on in another.

**Why the class exists:** the read and the write look adjacent in the source and
are not adjacent in time. Anything can commit between them. The gap is usually
invisible in single-user testing and reliably reachable in production.

**Smell:** a count or existence check above a transaction; a comment naming a
database constraint as the safety net while the code clears the way for it (if
the code deletes the referencing rows first, the constraint has nothing left to
constrain); a uniqueness rule enforced by a query rather than by an index.

**Ask:** what can commit between the read and the write? Does the constraint the
comment relies on still have anything to enforce?

---

## 4 — Money and idempotency

**Hunts:** double charges, lost paid work, reservations that never release.

**Why the class exists:** money paths are retried — by users, by clients, by
queues — and a step that is safe once is rarely safe twice unless it was
designed to be. The damage is asymmetric: an over-charge is a refund and an
apology, an under-charge is silent.

**Smell:** a settlement with no matching reservation; a retry wrapped around a
call that charges; an amount that changes type or unit between layers; an early
return on a failure path that skips a release; work delivered before payment is
final, or payment taken before the artefact is safely stored.

**Ask:** run it twice. Kill it between the two writes. Which figure is wrong
afterwards, and by how much?

---

## 5 — Object lifetime versus row lifetime

**Hunts:** stored files that outlive their rows, or die before them.

**Why the class exists:** object storage has no foreign keys. Every rule tying a
file to a record lives in application code, so the two drift in both directions:
orphaned bytes nobody pays attention to but everybody pays for, and rows
pointing at objects that were deleted.

**Smell:** a delete whose key came from the request rather than from a row the
request owns; a delete ordered before the row that points at it; a duplicate
that shares one object between two rows; a storage key built from a
caller-supplied identifier.

**Ask:** is this key proven to belong to this row? If the second step fails,
which is left — an orphaned object, or a broken row?

---

## 6 — Rules enforced in one layer only

**Hunts:** an invariant the application keeps and the database does not, or the
reverse.

**Why the class exists:** a rule written in the application is a rule that a
migration, a console session, an import script and a background job all walk
straight past. Rules that matter usually need to exist in both places — and then
they need to be *generated* from one source, because two hand-maintained copies
of a list diverge the first time somebody adds an item.

**Smell:** an authorisation check in a handler with no counterpart in the schema;
a trigger covering INSERT and UPDATE but not DELETE, or one direction of a
relationship but not the other; the same enumeration hard-coded in two
languages; an endpoint that trusts a field the UI happens not to send.

**Ask:** name every path that can write this row, including the ones with no
application in them. Which of them does the rule *not* cover?

---

## 7 — Framework contract violations

**Hunts:** work done in a place the framework forbids, or behaviour that depends
on the environment rather than on the code.

**Why the class exists:** every framework has a small set of things that must
not happen in a particular phase — writes during render, mutation of a
request-scoped object outside its handler, side effects in a pure hook. Breaking
one usually works in development and fails behind a proxy, in a container, or
for a user in a state the developer was never in.

**Smell:** a write in a render path; a redirect or an absolute URL built from a
request's own host; anything that "works locally"; a value read from the process
environment at module load and expected to change later.

**Ask:** which of this runs during render? What does it do behind a proxy, in a
container, for a signed-out visitor?

---

## 8 — Contracts: comments, docs and types against behaviour

**Hunts:** a promise the code no longer keeps.

**Why the class exists:** documentation is written when the code is written and
not when it changes. A stale absolute — "only", "never", "always", "cannot" — is
worse than no comment, because the next person places their invariant where the
comment says it is safe.

**Smell:** absolutes; a doc written in the same commit as the code it describes,
never revisited; a rollback script whose header enumerates one loss when the
script performs two; a type whose optionality no longer matches the data.

**Ask:** take each absolute literally and try to falsify it with a search. Which
survive?

---

## Choosing charters for a slice

A `full` run uses all eight. A `cheap` run uses two — pick by what the diff
touches:

| the diff touches | charters |
|---|---|
| money, payments, billing | 4, 3 |
| a migration | 3, 6 |
| a form, a panel, an admin screen | 1, 2 |
| authorisation, roles, access | 6, 3 |
| files, uploads, storage | 5, 3 |
| a refactor with no obvious centre | 2, 8 |

A charter aimed at territory the diff never touched returns invention, not
signal. Leave it out and say so in the report.

---

## Sharpening: the private overlay

The charters above are classes. They work. They work **considerably better**
once they name your own incidents.

Compare:

> *generic* — "a copy is added for a good reason and acquires a second writer
> later."
>
> *sharpened* — "the display title on a list row is a copy of the record's; the
> inline rename writes the copy while the editor reads the original, and the
> next save reverts the rename. Find the others."

The second one finds the next instance. The first one asks the reviewer to
imagine it.

But an incident-shaped charter is a description of what broke in a specific
system, which is rarely something a team wants to publish. So the skill reads an
optional overlay:

```
<repository root>/charters.local.md
```

If that file exists, its charters are used **in addition to** the eight above,
and where a local charter carries the same number as a public one, the local
version wins. Nothing else changes — same format, same run, same report.

`charters.local.md` is in this repository's `.gitignore`. Keep it in your own
project, alongside your `graph-review.config.json`, and write it as incidents
happen: every defect that reaches production is a charter that would have caught
it, and the cheapest moment to write it is the day it hurt.
