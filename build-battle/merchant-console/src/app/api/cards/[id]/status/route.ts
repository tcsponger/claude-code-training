import { setCardStatus } from "@/data/cards"
import { CardStatus } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

const STATUSES: readonly CardStatus[] = ["active", "frozen", "cancelled"]

/**
 * Freeze/unfreeze/cancel. The state machine is guarded in
 * `src/data/cards.ts`, not just here — this route only checks the shape of
 * the request.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const status = (body as Record<string, unknown> | null)?.status

  if (typeof status !== "string" || !STATUSES.includes(status as CardStatus)) {
    return NextResponse.json(
      { message: "Status must be one of active, frozen, cancelled" },
      { status: 400 },
    )
  }

  const result = setCardStatus(id, status as CardStatus)

  if ("error" in result) {
    if (result.error === "not_found") {
      return NextResponse.json({ message: "Card not found" }, { status: 404 })
    }
    return NextResponse.json(
      { message: "That status change is not allowed from the card's current status" },
      { status: 400 },
    )
  }

  return NextResponse.json(result.card)
}
