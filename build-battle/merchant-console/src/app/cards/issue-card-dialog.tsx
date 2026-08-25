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
  DialogTrigger,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import {
  CARD_CURRENCIES,
  CATEGORY_LABELS,
  MAX_LIMIT_MINOR_UNITS,
  MERCHANT_CATEGORIES,
} from "@/data/cardRules"
import { Currency, MerchantCategory } from "@/data/types"
import { formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"

/** Radix Select has no empty value, so "no lock" needs a sentinel of its own. */
const NO_CATEGORY = "none"

interface MerchantOption {
  id: string
  name: string
  currency: Currency
}

export function IssueCardDialog({
  merchants,
}: {
  merchants: MerchantOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [nickname, setNickname] = React.useState("")
  const [merchantId, setMerchantId] = React.useState("")
  const [limitInput, setLimitInput] = React.useState("")
  const [currency, setCurrency] = React.useState<Currency>("USD")
  const [category, setCategory] = React.useState<
    MerchantCategory | typeof NO_CATEGORY
  >(NO_CATEGORY)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  /** The one-time reveal. Cleared when the dialog closes and never re-fetched. */
  const [revealed, setRevealed] = React.useState<{
    number: string
    nickname: string
  } | null>(null)
  /**
   * One key per dialog session. A double-click, a retry after a timeout, or a
   * resubmit all carry the same key, so the server issues one card rather than
   * one per click.
   */
  const idempotencyKey = React.useRef(crypto.randomUUID())

  function reset() {
    setNickname("")
    setMerchantId("")
    setLimitInput("")
    setCurrency("USD")
    setCategory(NO_CATEGORY)
    setError(null)
    setRevealed(null)
    // A new dialog session is a new card, so it gets a new key.
    idempotencyKey.current = crypto.randomUUID()
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Closing drops the full number out of client state for good.
      reset()
      router.refresh()
    }
  }

  const selectedMerchant = merchants.find((m) => m.id === merchantId)

  /** The merchant decides the currency; the form only reflects it. */
  function onMerchantChange(id: string) {
    setMerchantId(id)
    const merchant = merchants.find((m) => m.id === id)
    if (merchant) setCurrency(merchant.currency)
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    // Convert once, at the boundary. These checks are courtesy — the server
    // re-validates all of it and is the actual enforcement.
    const limit = parseAmountToMinorUnits(limitInput)
    if (limit === null || limit <= 0) {
      setError("Enter a spend limit like 250 or 250.00")
      return
    }
    if (limit > MAX_LIMIT_MINOR_UNITS) {
      setError(
        `Spend limit cannot exceed ${formatMoney(
          MAX_LIMIT_MINOR_UNITS,
          currency,
        )}`,
      )
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current,
        },
        body: JSON.stringify({
          nickname,
          merchantId,
          limit,
          currency,
          category: category === NO_CATEGORY ? null : category,
        }),
      })
      const body = await response.json()

      if (!response.ok) {
        setError(body?.message ?? "Could not issue the card. Try again.")
        return
      }

      if (body.replayed) {
        // This attempt already issued a card. The number was revealed on that
        // first response and is not shown twice.
        setError(
          `${body.card.nickname} was already issued. Its number was shown once and cannot be shown again — close this and open the card to check it.`,
        )
        return
      }

      setRevealed({ number: body.number, nickname: body.card.nickname })
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DialogTrigger>

      <DialogContent>
        {revealed ? (
          <>
            <DialogHeader>
              <DialogTitle>Card issued</DialogTitle>
              <DialogDescription>
                This is the only time the full number is shown. Copy it now — after
                you close this it is masked everywhere.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-gray-500">{revealed.nickname}</p>
              <p className="mt-2 font-mono text-xl tracking-wider text-gray-900 dark:text-gray-50">
                {revealed.number.replace(/(.{4})/g, "$1 ").trim()}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Issue a virtual card</DialogTitle>
              <DialogDescription>
                The number is generated when you submit and shown once.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-400/10 dark:text-red-400"
                >
                  {error}
                </p>
              )}

              <div>
                <label
                  htmlFor="card-nickname"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  name="nickname"
                  className="mt-2"
                  placeholder="Ad spend — Q3"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="card-merchant"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Merchant
                </label>
                <Select value={merchantId} onValueChange={onMerchantChange}>
                  {/* A <label for> does not name a button, and the trigger is
                      one — without this it announces only its current value. */}
                  <SelectTrigger
                    id="card-merchant"
                    aria-label="Merchant"
                    className="mt-2"
                  >
                    <SelectValue placeholder="Select a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="card-limit"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Spend limit
                  </label>
                  <Input
                    id="card-limit"
                    name="limit"
                    className="mt-2"
                    inputMode="decimal"
                    placeholder="250.00"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="card-currency"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Currency
                  </label>
                  {/* Set by the merchant, not chosen: a card that settles in a
                      currency its merchant does not is a limit nobody can
                      reconcile. The server rejects a mismatch either way. */}
                  <Select value={currency} disabled>
                    <SelectTrigger
                      id="card-currency"
                      aria-label="Currency, set by the merchant"
                      className="mt-2"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_CURRENCIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-gray-500">
                    {selectedMerchant
                      ? `${selectedMerchant.name} settles in ${currency}`
                      : "Set by the merchant you pick"}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="card-category"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Category lock{" "}
                  <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <Select
                  value={category}
                  onValueChange={(v) =>
                    setCategory(v as MerchantCategory | typeof NO_CATEGORY)
                  }
                >
                  <SelectTrigger
                    id="card-category"
                    aria-label="Category lock"
                    className="mt-2"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>No category lock</SelectItem>
                    {MERCHANT_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {CATEGORY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                className="mt-2 w-full sm:mt-0 sm:w-fit"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-fit"
                isLoading={submitting}
                loadingText="Issuing"
              >
                Issue card
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
