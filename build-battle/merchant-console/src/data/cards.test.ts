import { beforeEach, describe, expect, it } from "vitest"
import {
  cardById,
  createCard,
  listCards,
  setCardStatus,
  spendProgress,
} from "./cards"
import {
  CATEGORY_LABELS,
  isCurrency,
  isMerchantCategory,
  MERCHANT_CATEGORIES,
} from "./cardRules"
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
  for (const key of Object.keys(store.cardIssueKeys)) {
    delete store.cardIssueKeys[key]
  }
})

/** Issues a card, asserting it was a fresh issue rather than a replay. */
function issue(overrides: Partial<typeof input> & { idempotencyKey?: string } = {}) {
  const result = createCard({ ...input, ...overrides })
  if (result.replayed) throw new Error("expected a fresh issue, got a replay")
  return result
}

describe("createCard", () => {
  it("stores last four and a reference, never the full number", () => {
    const { card, number } = issue()

    expect(card.last4).toBe(number.slice(-4))
    expect(JSON.stringify(card)).not.toContain(number)
    expect(card.numberRef).not.toBe(number)
  })

  it("records the issue in the card's history", () => {
    const { card } = issue()
    expect(card.events).toEqual([{ type: "issued", at: card.createdAt }])
  })

  it("keeps the limit in the minor units it was given", () => {
    const { card } = issue({ limit: 25000 })
    expect(card.limit).toBe(25000)
    expect(Number.isInteger(card.limit)).toBe(true)
  })

  it("starts active with no spend", () => {
    const { card } = issue()
    expect(card.status).toBe("active")
    expect(card.spend).toBe(0)
  })

  it("adds the card to the store and hands back a distinct id each time", () => {
    const first = issue().card
    const second = issue().card

    expect(first.id).not.toBe(second.id)
    expect(listCards()).toHaveLength(2)
    expect(cardById(first.id)).toBe(first)
  })
})

describe("createCard idempotency", () => {
  it("issues one card when the same key arrives twice", () => {
    const first = createCard({ ...input, idempotencyKey: "key-1" })
    const second = createCard({ ...input, idempotencyKey: "key-1" })

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(second.card.id).toBe(first.card.id)
    expect(listCards()).toHaveLength(1)
  })

  it("does not reveal the number again on a replay", () => {
    createCard({ ...input, idempotencyKey: "key-1" })
    const replay = createCard({ ...input, idempotencyKey: "key-1" })

    expect(replay.replayed).toBe(true)
    expect(replay).not.toHaveProperty("number")
  })

  it("issues separate cards for different keys", () => {
    createCard({ ...input, idempotencyKey: "key-1" })
    createCard({ ...input, idempotencyKey: "key-2" })
    expect(listCards()).toHaveLength(2)
  })

  it("issues every time when no key is given", () => {
    issue()
    issue()
    expect(listCards()).toHaveLength(2)
  })
})

describe("card rule allowlists", () => {
  it("accepts only the categories we issue against", () => {
    expect(isMerchantCategory("ad_spend")).toBe(true)
    expect(isMerchantCategory("crypto")).toBe(false)
    expect(isMerchantCategory("")).toBe(false)
    expect(isMerchantCategory(null)).toBe(false)
  })

  it("accepts only the three settlement currencies", () => {
    expect(isCurrency("USD")).toBe(true)
    expect(isCurrency("GBP")).toBe(true)
    expect(isCurrency("JPY")).toBe(false)
    expect(isCurrency(250)).toBe(false)
  })

  it("has a label for every category it allows", () => {
    for (const category of MERCHANT_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy()
    }
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
    const { card } = issue()
    if (from !== "active") setCardStatus(card.id, from)

    const result = setCardStatus(card.id, to)
    expect(result).toEqual({ card: expect.objectContaining({ status: to }) })
    expect(cardById(card.id)?.status).toBe(to)
  })

  it.each<CardStatus>(["active", "frozen"])(
    "refuses cancelled → %s, because cancelled is terminal",
    (to) => {
      const { card } = issue()
      setCardStatus(card.id, "cancelled")

      expect(setCardStatus(card.id, to)).toEqual({
        error: "invalid_transition",
      })
      expect(cardById(card.id)?.status).toBe("cancelled")
    },
  )

  it("treats a no-op transition as a success without changing anything", () => {
    const { card } = issue()
    expect(setCardStatus(card.id, "active")).toEqual({ card })
    expect(card.status).toBe("active")
  })

  it("reports a missing card rather than throwing", () => {
    expect(setCardStatus("card_missing", "frozen")).toEqual({
      error: "not_found",
    })
  })
})

describe("card history", () => {
  it("records every state change in order", () => {
    const { card } = issue()
    setCardStatus(card.id, "frozen")
    setCardStatus(card.id, "active")
    setCardStatus(card.id, "cancelled")

    expect(card.events.map((e) => e.type)).toEqual([
      "issued",
      "frozen",
      "unfrozen",
      "cancelled",
    ])
  })

  it("does not record a transition the state machine refused", () => {
    const { card } = issue()
    setCardStatus(card.id, "cancelled")
    setCardStatus(card.id, "active")

    expect(card.events.map((e) => e.type)).toEqual(["issued", "cancelled"])
  })

  it("does not record a no-op transition", () => {
    const { card } = issue()
    setCardStatus(card.id, "active")
    expect(card.events).toHaveLength(1)
  })

  it("timestamps every event in UTC, oldest first", () => {
    const { card } = issue()
    setCardStatus(card.id, "frozen")

    for (const event of card.events) {
      expect(event.at).toMatch(/Z$/)
    }
    const timestamps = card.events.map((e) => e.at)
    expect([...timestamps].sort()).toEqual(timestamps)
  })
})
