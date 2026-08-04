/**
 * A toy ledger, present so the example config points at files that exist and a
 * smoke run has something to read. It is deliberately small and deliberately
 * imperfect — see examples/toy-diff.patch.
 */
export type Reservation = { id: string; userId: string; amount: number };

const reservations = new Map<string, Reservation>();

export function reserve(id: string, userId: string, amount: number): Reservation {
  const reservation = { id, userId, amount };
  reservations.set(id, reservation);
  return reservation;
}

export function settle(id: string): number {
  const reservation = reservations.get(id);
  if (!reservation) throw new Error(`no reservation ${id}`);
  reservations.delete(id);
  return reservation.amount;
}

export function release(id: string): void {
  reservations.delete(id);
}
