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

  if (typeof merchantId !== "string" || !merchantById(merchantId)) {
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

  const { card, number } = createCard({
    nickname: nickname.trim(),
    merchantId,
    limit,
    currency,
    category: isMerchantCategory(category) ? category : null,
  })

  return NextResponse.json({ card, number }, { status: 201 })
}
