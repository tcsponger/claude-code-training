import { generateCardNumber } from "@/lib/cardNumber"
import { store } from "./store"
import { Card, CardStatus, Currency, MerchantCategory } from "./types"

/**
 * The one place `store.cards` is written. Payments/refunds/disputes/payouts
 * are read-only in this codebase — cards are the first mutable domain, so
 * every write goes through here rather than scattering `store.cards.push`
 * across route handlers.
 */

/**
 * Derived from the store, not a module-level counter: the dev server reloads
 * this module while `store` survives on `globalThis`, and a counter that
 * resets underneath a store that does not hands out duplicate ids.
 */
function nextId(): string {
  const highest = store.cards.reduce((max, card) => {
    const n = Number(card.id.slice("card_".length))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `card_${String(highest + 1).padStart(6, "0")}`
}

export function listCards(): Card[] {
  return store.cards
}

export function cardById(id: string): Card | null {
  return store.cards.find((c) => c.id === id) ?? null
}

export interface CreateCardInput {
  nickname: string
  merchantId: string
  limit: number
  currency: Currency
  category?: MerchantCategory | null
}

/**
 * Creates a card and returns it alongside the full generated number. The
 * full number is not part of the `Card` record — it exists only in this
 * return value, for the route handler to send back exactly once.
 */
export function createCard(
  input: CreateCardInput,
): { card: Card; number: string } {
  const { number, last4, numberRef } = generateCardNumber()

  const card: Card = {
    id: nextId(),
    nickname: input.nickname,
    merchantId: input.merchantId,
    last4,
    numberRef,
    limit: input.limit,
    currency: input.currency,
    status: "active",
    spend: 0,
    category: input.category ?? null,
    createdAt: new Date().toISOString(),
  }

  store.cards.push(card)
  return { card, number }
}

/** Past this share of the limit, the detail view warns rather than informs. */
export const SPEND_WARNING_PERCENT = 80

/**
 * Spend against a limit, for display. Integer minor units in, whole percent
 * out — the percentage is derived at the edge and never stored.
 */
export function spendProgress(
  spend: number,
  limit: number,
): { percent: number; nearLimit: boolean } {
  const percent =
    limit > 0 ? Math.min(100, Math.round((spend / limit) * 100)) : 0
  return { percent, nearLimit: percent >= SPEND_WARNING_PERCENT }
}

/** Legal status transitions. `cancelled` is terminal — nothing leaves it. */
const ALLOWED_TRANSITIONS: Record<CardStatus, CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export type SetCardStatusResult =
  | { card: Card }
  | { error: "not_found" | "invalid_transition" }

/** Guards the state machine server-side, per `cards.md`. */
export function setCardStatus(
  id: string,
  next: CardStatus,
): SetCardStatusResult {
  const card = cardById(id)
  if (!card) return { error: "not_found" }

  if (card.status === next) return { card }
  if (!ALLOWED_TRANSITIONS[card.status].includes(next)) {
    return { error: "invalid_transition" }
  }

  card.status = next
  return { card }
}
