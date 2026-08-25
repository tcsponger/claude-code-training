"use client"

import { Button } from "@/components/Button"
import { CardStatusBadge } from "@/components/ui/cards/StatusBadge"
import { CardStatus } from "@/data/types"
import * as React from "react"

/**
 * Freeze/unfreeze from the list without a full page reload. The transition is
 * still enforced on the server (`src/data/cards.ts`); this only shows what the
 * server allows and reflects what it returns.
 */
export function CardStatusActions({
  cardId,
  nickname,
  initialStatus,
}: {
  cardId: string
  nickname: string
  initialStatus: CardStatus
}) {
  const [status, setStatus] = React.useState(initialStatus)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function change(next: CardStatus) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body?.message ?? "Could not update the card.")
        return
      }
      setStatus(body.status)
    } catch {
      setError("Could not reach the server.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <CardStatusBadge status={status} />
      {status !== "cancelled" && (
        <Button
          variant="secondary"
          className="px-2 py-1 text-xs"
          disabled={pending}
          onClick={() => change(status === "active" ? "frozen" : "active")}
        >
          {status === "active" ? "Freeze" : "Unfreeze"}
          <span className="sr-only"> {nickname}</span>
        </Button>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
