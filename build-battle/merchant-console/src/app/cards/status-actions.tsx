"use client"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import { CardStatusBadge } from "@/components/ui/cards/StatusBadge"
import { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import * as React from "react"

/**
 * Freeze, unfreeze and cancel without a full page reload. The transitions are
 * still enforced on the server (`src/data/cards.ts`); this only offers what
 * the server allows and reflects what it returns.
 */
export function CardStatusActions({
  cardId,
  nickname,
  initialStatus,
  onChanged,
}: {
  cardId: string
  nickname: string
  initialStatus: CardStatus
  /** Lets a detail view refresh the history the transition just appended to. */
  onChanged?: () => void
}) {
  const router = useRouter()
  const [status, setStatus] = React.useState(initialStatus)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = React.useState(false)

  // The row is rendered by a server component; if it re-renders with a newer
  // status, take it rather than holding a stale one.
  React.useEffect(() => setStatus(initialStatus), [initialStatus])

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
      setConfirmingCancel(false)
      onChanged?.()
      router.refresh()
    } catch {
      setError("Could not reach the server.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CardStatusBadge status={status} />

      {status !== "cancelled" && (
        <>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={pending}
            onClick={() => change(status === "active" ? "frozen" : "active")}
          >
            {status === "active" ? "Freeze" : "Unfreeze"}
            <span className="sr-only"> {nickname}</span>
          </Button>

          <Button
            variant="ghost"
            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-400/10"
            disabled={pending}
            onClick={() => setConfirmingCancel(true)}
          >
            Cancel
            <span className="sr-only"> {nickname}</span>
          </Button>
        </>
      )}

      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}

      {/* Cancelling is terminal, so it asks first. */}
      <Dialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {nickname}?</DialogTitle>
            <DialogDescription>
              Cancelling is permanent. The card stops working immediately and
              cannot be reactivated — you would have to issue a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-gray-500">
              Freezing instead keeps the card and can be undone at any time.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              className="mt-2 w-full sm:mt-0 sm:w-fit"
              onClick={() => setConfirmingCancel(false)}
            >
              Keep card
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-fit"
              isLoading={pending}
              loadingText="Cancelling"
              onClick={() => change("cancelled")}
            >
              Cancel card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
