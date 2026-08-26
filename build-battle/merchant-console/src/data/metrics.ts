import { lastUtcDays, utcDayKey } from "@/lib/dates"
import { sumMinorUnits } from "@/lib/money"
import { GENERATED_AT } from "./generate"
import { store } from "./store"

/**
 * Dashboard metrics, in integer minor units.
 *
 * KNOWN DEFECT: the headline totals below add USD, EUR and GBP amounts
 * together and the overview renders the result with a `$`. Summing across
 * currencies without converting is a bug even when the number looks right
 * (`.claude/rules/money.md`), and it overstates gross volume by roughly the
 * whole non-USD book. Fixing it needs either an FX rate source or a
 * per-currency breakdown on the overview, so it is a product decision rather
 * than a rename — left as-is deliberately, not overlooked.
 */

export interface DailyVolume {
  date: string
  captured: number
  refunded: number
}

export function dailyVolume(days = 30): DailyVolume[] {
  const keys = lastUtcDays(days, GENERATED_AT)
  const buckets = new Map<string, DailyVolume>(
    keys.map((date) => [date, { date, captured: 0, refunded: 0 }]),
  )

  for (const payment of store.payments) {
    // Bucket in UTC. The keys come from lastUtcDays, so reading the day in the
    // server's local zone puts payments in the wrong bucket — or, when the
    // shifted key falls outside the range, drops them entirely.
    const bucket = buckets.get(utcDayKey(payment.createdAt))
    if (!bucket) continue

    // Minor units stay integers. Accumulating in major units is float
    // arithmetic on money, even when a trailing round hides the drift.
    if (payment.status === "captured") {
      bucket.captured += payment.amount
    }
    if (payment.status === "refunded") {
      bucket.refunded += payment.amount
    }
  }

  return keys.map((date) => buckets.get(date)!)
}

export function headlineMetrics() {
  const captured = store.payments.filter((p) => p.status === "captured")
  const refunded = store.payments.filter((p) => p.status === "refunded")

  // Gross volume is everything that moved through the platform.
  const grossVolume = sumMinorUnits([
    ...captured.map((p) => p.amount),
    ...refunded.map((p) => p.amount),
  ])

  const authorized = store.payments.filter(
    (p) => p.status !== "failed",
  ).length
  const authRate = store.payments.length
    ? authorized / store.payments.length
    : 0

  const openDisputes = store.disputes.filter(
    (d) => d.status === "needs_response" || d.status === "under_review",
  )

  return {
    grossVolume,
    authRate,
    paymentCount: store.payments.length,
    openDisputes: openDisputes.length,
    disputedAmount: openDisputes.reduce((sum, d) => sum + d.amount, 0),
  }
}
