export const quickBidIncrements = [500, 1000, 2500] as const;
export type QuickBidIncrement = (typeof quickBidIncrements)[number];

/** Sugestão sobre o último valor confirmado; não valida nem executa uma licitação. */
export function quickBidValue(current: number, minimumIncrement: number, delta: QuickBidIncrement) {
  if (
    !Number.isSafeInteger(current) ||
    current < 0 ||
    !Number.isSafeInteger(minimumIncrement) ||
    minimumIncrement <= 0 ||
    !quickBidIncrements.includes(delta) ||
    delta < minimumIncrement
  )
    return undefined;
  const result = BigInt(current) + BigInt(delta);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : undefined;
}
