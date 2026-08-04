import { settle } from "../billing/ledger";

/** Toy webhook handler. A real one needs an idempotency key — see charter 4. */
export function onPaid(reservationId: string): number {
  return settle(reservationId);
}
