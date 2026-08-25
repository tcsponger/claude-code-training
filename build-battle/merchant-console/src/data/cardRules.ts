import { Currency, MerchantCategory } from "./types"

/**
 * The card rules both sides of the wire need: the route handler enforces
 * them, the issue form reflects them. Kept free of store imports so the
 * client can read them without pulling the in-memory store into its bundle.
 */

export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

/** Integer minor units. $50,000.00 is the ceiling ops can issue against. */
export const MAX_LIMIT_MINOR_UNITS = 5_000_000

export const MERCHANT_CATEGORIES: readonly MerchantCategory[] = [
  "vendor_subscriptions",
  "ad_spend",
  "contractor_tools",
]

export const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  vendor_subscriptions: "Vendor subscriptions",
  ad_spend: "Ad spend",
  contractor_tools: "Contractor tools",
}

export function isMerchantCategory(value: unknown): value is MerchantCategory {
  return (
    typeof value === "string" &&
    MERCHANT_CATEGORIES.includes(value as MerchantCategory)
  )
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && CARD_CURRENCIES.includes(value as Currency)
}
