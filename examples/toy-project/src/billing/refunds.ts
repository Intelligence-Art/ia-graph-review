import { release } from "./ledger";

export function refund(reservationId: string): void {
  release(reservationId);
}
