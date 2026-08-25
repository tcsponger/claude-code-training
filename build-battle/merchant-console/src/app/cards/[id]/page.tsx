import { Divider } from "@/components/Divider"
import { CardStatusBadge } from "@/components/ui/cards/StatusBadge"
import { cardById, spendProgress } from "@/data/cards"
import { CATEGORY_LABELS } from "@/data/cardRules"
import { merchantById } from "@/data/merchants"
import { formatDate, formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

/**
 * Tailwind only, so the bar snaps to a fixed scale rather than carrying an
 * inline width. Five-point steps are finer than the bar can show anyway; the
 * exact figure is in the text beside it.
 */
const BAR_WIDTHS = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
] as const

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)
  const { percent, nearLimit } = spendProgress(card.spend, card.limit)

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
          {card.nickname}
        </h1>
        <CardStatusBadge status={card.status} />
      </div>
      <p className="mt-1 font-mono text-sm text-gray-500">
        •••• {card.last4} · {card.id}
      </p>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Spend against limit
      </h2>
      <div className="mt-4 max-w-md">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
            {formatMoney(card.spend, card.currency)}
          </span>
          <span className="text-sm text-gray-500 tabular-nums">
            of {formatMoney(card.limit, card.currency)}
          </span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Spend against limit for ${card.nickname}`}
        >
          <div
            className={cx(
              "h-full rounded-full",
              BAR_WIDTHS[Math.round(percent / 5)],
              nearLimit
                ? "bg-amber-500 dark:bg-amber-500"
                : "bg-blue-500 dark:bg-blue-500",
            )}
          />
        </div>
        <p
          className={cx(
            "mt-2 text-sm",
            nearLimit
              ? "text-amber-700 dark:text-amber-500"
              : "text-gray-500",
          )}
        >
          {percent}% of the limit used
          {nearLimit && " — close to the limit"}
        </p>
      </div>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Merchant">
          {merchant ? (
            <>
              {merchant.name}
              <span className="ml-2 text-gray-500">{merchant.country}</span>
            </>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Card number">
          <span className="font-mono">•••• {card.last4}</span>
        </Field>
        <Field label="Spend limit">
          {formatMoney(card.limit, card.currency)}
        </Field>
        <Field label="Currency">{card.currency}</Field>
        <Field label="Status">
          <CardStatusBadge status={card.status} />
        </Field>
        <Field label="Category lock">
          {card.category ? CATEGORY_LABELS[card.category] : "None"}
        </Field>
        <Field label="Created (UTC)">
          <span className="font-mono text-sm">{card.createdAt}</span>
        </Field>
        {merchant && (
          <Field label={`Created (${merchant.timezone})`}>
            {formatInZone(card.createdAt, merchant.timezone)}
          </Field>
        )}
        <Field label="Issued">{formatDate(card.createdAt)}</Field>
      </dl>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">
        {children}
      </dd>
    </div>
  )
}
