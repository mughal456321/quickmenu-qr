export type ReplayDecision = "create" | "return-existing";

/**
 * NFR-R5: a repeated Idempotency-Key must return the original order and must
 * not create a second one.
 */
export function decideOnReplay(existingOrder: unknown | null): ReplayDecision {
  return existingOrder ? "return-existing" : "create";
}
