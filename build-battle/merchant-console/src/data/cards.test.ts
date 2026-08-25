import { beforeEach, describe, expect, it } from "vitest"
import {
  cardById,
  createCard,
  listCards,
  setCardStatus,
  spendProgress,
} from "./cards"
import { store } from "./store"
import { CardStatus } from "./types"

/**
 * The state machine is the rule most likely to be broken quietly: a UI that
 * hides a button is not enforcement. Every transition, legal and illegal, has
 * a case here.
 */

const input = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  limit: 25000,
  currency: "USD" as const,
}

beforeEach(() => {
  store.cards.length = 0
})

describe("createCard", () => {
  it("stores last four and a reference, never the full number", () => {
    const { card, number } = createCard(input)

    expect(card.last4).toBe(number.slice(-4))
    expect(JSON.stringify(card)).not.toContain(number)
    expect(card.numberRef).not.toBe(number)
  })

  it("keeps the limit in the minor units it was given", () => {
    const { card } = createCard({ ...input, limit: 25000 })
    expect(card.limit).toBe(25000)
    expect(Number.isInteger(card.limit)).toBe(true)
  })

  it("starts active with no spend", () => {
    const { card } = createCard(input)
    expect(card.status).toBe("active")
    expect(card.spend).toBe(0)
  })

  it("adds the card to the store and hands back a distinct id each time", () => {
    const first = createCard(input).card
    const second = createCard(input).card

    expect(first.id).not.toBe(second.id)
    expect(listCards()).toHaveLength(2)
    expect(cardById(first.id)).toBe(first)
  })
})

describe("spendProgress", () => {
  it("reports whole percent from minor units", () => {
    expect(spendProgress(0, 25000)).toEqual({ percent: 0, nearLimit: false })
    expect(spendProgress(12500, 25000)).toEqual({
      percent: 50,
      nearLimit: false,
    })
  })

  it("turns amber at 80 percent, not before", () => {
    expect(spendProgress(19750, 25000)).toEqual({
      percent: 79,
      nearLimit: false,
    })
    expect(spendProgress(20000, 25000)).toEqual({
      percent: 80,
      nearLimit: true,
    })
  })

  it("threshold follows the percent shown, so a rounded 80% is amber too", () => {
    // 19_999 / 25_000 is 79.996%, which the card renders as 80%. The bar and
    // the number agree rather than disagreeing by a rounding step.
    expect(spendProgress(19999, 25000)).toEqual({
      percent: 80,
      nearLimit: true,
    })
  })

  it("caps at 100 percent when spend runs past the limit", () => {
    expect(spendProgress(30000, 25000)).toEqual({
      percent: 100,
      nearLimit: true,
    })
  })

  it("does not divide by a zero limit", () => {
    expect(spendProgress(0, 0)).toEqual({ percent: 0, nearLimit: false })
  })
})

describe("setCardStatus", () => {
  const legal: [CardStatus, CardStatus][] = [
    ["active", "frozen"],
    ["frozen", "active"],
    ["active", "cancelled"],
    ["frozen", "cancelled"],
  ]

  it.each(legal)("allows %s → %s", (from, to) => {
    const { card } = createCard(input)
    if (from !== "active") setCardStatus(card.id, from)

    const result = setCardStatus(card.id, to)
    expect(result).toEqual({ card: expect.objectContaining({ status: to }) })
    expect(cardById(card.id)?.status).toBe(to)
  })

  it.each<CardStatus>(["active", "frozen"])(
    "refuses cancelled → %s, because cancelled is terminal",
    (to) => {
      const { card } = createCard(input)
      setCardStatus(card.id, "cancelled")

      expect(setCardStatus(card.id, to)).toEqual({
        error: "invalid_transition",
      })
      expect(cardById(card.id)?.status).toBe("cancelled")
    },
  )

  it("treats a no-op transition as a success without changing anything", () => {
    const { card } = createCard(input)
    expect(setCardStatus(card.id, "active")).toEqual({ card })
    expect(card.status).toBe("active")
  })

  it("reports a missing card rather than throwing", () => {
    expect(setCardStatus("card_missing", "frozen")).toEqual({
      error: "not_found",
    })
  })
})
