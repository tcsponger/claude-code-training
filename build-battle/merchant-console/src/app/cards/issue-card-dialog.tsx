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

  function reset() {
    setNickname("")
    setMerchantId("")
    setLimitInput("")
    setCurrency("USD")
    setCategory(NO_CATEGORY)
    setError(null)
    setRevealed(null)
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Closing drops the full number out of client state for good.
      reset()
      router.refresh()
    }
  }

  /** Picking a merchant defaults the currency to the one they settle in. */
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
        headers: { "content-type": "application/json" },
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
                  <Select
                    value={currency}
                    onValueChange={(v) => setCurrency(v as Currency)}
                  >
                    <SelectTrigger
                      id="card-currency"
                      aria-label="Currency"
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
