import { describe, expect, it } from "vitest"
import { sortPayments } from "./queries"
import { Payment } from "./types"

/**
 * The one payment query builder backs every list, export, and metric, so the
 * order it returns is the order the whole console believes.
 */

const payment = (id: string, amount: number, createdAt: string): Payment => ({
  id,
  merchantId: "mch_01",
  amount,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt,
  description: "Online order",
})

// Amounts chosen so digit-order and numeric order disagree: as strings,
// "9500" sorts above "45000".
const rows = [
  payment("pay_1", 900, "2026-08-01T00:00:00.000Z"),
  payment("pay_2", 45000, "2026-08-03T00:00:00.000Z"),
  payment("pay_3", 9500, "2026-08-02T00:00:00.000Z"),
  payment("pay_4", 1000, "2026-08-04T00:00:00.000Z"),
]

describe("sortPayments by amount", () => {
  it("orders by value, not by the digits of the value", () => {
    const descending = sortPayments(rows, "amount", "desc")
    expect(descending.map((p) => p.amount)).toEqual([45000, 9500, 1000, 900])
  })

  it("ascends the same way", () => {
    const ascending = sortPayments(rows, "amount", "asc")
    expect(ascending.map((p) => p.amount)).toEqual([900, 1000, 9500, 45000])
  })

  it("puts the largest amount first when descending", () => {
    // $450.00 outranks $95.00. Comparing them as strings did not.
    const [first] = sortPayments(rows, "amount", "desc")
    expect(first.amount).toBe(45000)
  })

  it("does not mutate the array it was given", () => {
    const original = rows.map((p) => p.amount)
    sortPayments(rows, "amount", "desc")
    expect(rows.map((p) => p.amount)).toEqual(original)
  })
})

describe("sortPayments by createdAt", () => {
  it("defaults to newest first", () => {
    const sorted = sortPayments(rows)
    expect(sorted.map((p) => p.id)).toEqual([
      "pay_4",
      "pay_2",
      "pay_3",
      "pay_1",
    ])
  })

  it("ascends to oldest first", () => {
    const sorted = sortPayments(rows, "createdAt", "asc")
    expect(sorted.map((p) => p.id)).toEqual([
      "pay_1",
      "pay_3",
      "pay_2",
      "pay_4",
    ])
  })
})
