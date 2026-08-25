import { createCard, listCards } from "@/data/cards"
import {
  isCurrency,
  isMerchantCategory,
  MAX_LIMIT_MINOR_UNITS,
} from "@/data/cardRules"
import { merchantById } from "@/data/merchants"
import { formatMoney } from "@/lib/money"
import { NextRequest, NextResponse } from "next/server"

export function GET() {
  return NextResponse.json(listCards())
}

/**
 * Everything here comes from the client, so everything here is checked
 * against an allowlist before it reaches the store. Reject early and return.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { message: "Invalid request body" },
      { status: 400 },
    )
  }

  const { nickname, merchantId, limit, currency, category } = body as Record<
    string,
    unknown
  >

  if (typeof nickname !== "string" || nickname.trim().length === 0) {
    return NextResponse.json(
      { message: "Nickname is required" },
      { status: 400 },
    )
  }

  const merchant =
    typeof merchantId === "string" ? merchantById(merchantId) : undefined
  if (!merchant) {
    return NextResponse.json(
      { message: "Merchant is required" },
      { status: 400 },
    )
  }

  // Checked before the limit so the ceiling can be quoted in the currency the
  // card is actually being issued in.
  if (!isCurrency(currency)) {
    return NextResponse.json(
      { message: "Currency must be one of USD, EUR, GBP" },
      { status: 400 },
    )
  }

  // A card that settles in a currency its merchant does not is a limit nobody
  // can reconcile. The merchant decides the currency; the client only echoes it.
  if (currency !== merchant.currency) {
    return NextResponse.json(
      {
        message: `${merchant.name} settles in ${merchant.currency}, so this card cannot be issued in ${currency}`,
      },
      { status: 400 },
    )
  }

  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) {
    return NextResponse.json(
      { message: "Spend limit must be greater than zero" },
      { status: 400 },
    )
  }

  if (limit > MAX_LIMIT_MINOR_UNITS) {
    return NextResponse.json(
      {
        message: `Spend limit cannot exceed ${formatMoney(
          MAX_LIMIT_MINOR_UNITS,
          currency,
        )}`,
      },
      { status: 400 },
    )
  }

  if (category != null && !isMerchantCategory(category)) {
    return NextResponse.json(
      { message: "That category lock is not one we issue against" },
      { status: 400 },
    )
  }

  const result = createCard({
    nickname: nickname.trim(),
    merchantId: merchant.id,
    limit,
    currency,
    category: isMerchantCategory(category) ? category : null,
    idempotencyKey: request.headers.get("idempotency-key"),
  })

  // A replay returns the card that already exists, without the number: it was
  // revealed on the original response, and the reveal is once.
  if (result.replayed) {
    return NextResponse.json({ card: result.card, replayed: true })
  }

  return NextResponse.json(
    { card: result.card, number: result.number },
    { status: 201 },
  )
}
