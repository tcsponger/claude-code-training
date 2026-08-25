import { createCard, listCards } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { Currency } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]
const MAX_LIMIT_MINOR_UNITS = 5_000_000

export function GET() {
  return NextResponse.json(listCards())
}

/**
 * Everything here comes from the client, so everything here is validated
 * against an allowlist before it reaches the store. Reject early and return.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 })
  }

  const { nickname, merchantId, limit, currency, category } = body as Record<
    string,
    unknown
  >

  if (typeof nickname !== "string" || nickname.trim().length === 0) {
    return NextResponse.json({ message: "Nickname is required" }, { status: 400 })
  }

  if (typeof merchantId !== "string" || !merchantById(merchantId)) {
    return NextResponse.json({ message: "Merchant is required" }, { status: 400 })
  }

  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    return NextResponse.json(
      { message: "Spend limit must be a positive whole number of minor units" },
      { status: 400 },
    )
  }

  if (limit > MAX_LIMIT_MINOR_UNITS) {
    return NextResponse.json(
      { message: `Spend limit cannot exceed ${MAX_LIMIT_MINOR_UNITS.toLocaleString()} minor units` },
      { status: 400 },
    )
  }

  if (typeof currency !== "string" || !CURRENCIES.includes(currency as Currency)) {
    return NextResponse.json(
      { message: "Currency must be one of USD, EUR, GBP" },
      { status: 400 },
    )
  }

  const { card, number } = createCard({
    nickname: nickname.trim(),
    merchantId,
    limit,
    currency: currency as Currency,
    category:
      typeof category === "string"
        ? (category as CreateCardInput["category"])
        : null,
  })

  return NextResponse.json({ card, number }, { status: 201 })
}

type CreateCardInput = Parameters<typeof createCard>[0]
