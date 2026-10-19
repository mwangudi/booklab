/**
 * What a cashier may do to a price at the till. Anyone holding the `sale.discount`
 * or `sale.tierPrice` capability (managers by default) is not limited here.
 *
 * The cap is sent to the till with the signed-in user (login and /me), so the
 * till applies the same rule offline and never queues a sale the server refuses.
 */

const DEFAULT_CASHIER_MAX_DISCOUNT_PCT = 10;

/** Largest basket discount a cashier may give, as a percentage of the subtotal. */
export function cashierMaxDiscountPct(): number {
  const v = Number(process.env.CASHIER_MAX_DISCOUNT_PCT ?? DEFAULT_CASHIER_MAX_DISCOUNT_PCT);
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 100) : DEFAULT_CASHIER_MAX_DISCOUNT_PCT;
}

/**
 * Wholesale and school prices are lower than retail. A cashier who could pick
 * them freely could charge retail, ring up wholesale and keep the difference.
 */
export const CASHIER_TIERS = ['RETAIL'] as const;
