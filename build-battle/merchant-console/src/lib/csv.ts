import { merchantById } from "@/data/merchants"
import { Payment } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * The column set is fixed. Ops has asked for control over it — that is
 * NWP-101 — but today everyone gets every column, including the card
 * last four, whether or not the file is going to a merchant.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/**
 * The safe default: every column except the card last four. Used both as the
 * export dialog's initial selection and as the server-side fallback when a
 * request supplies no valid columns, so last4 never ships unless someone
 * opts in.
 */
export const DEFAULT_EXPORT_COLUMNS = EXPORT_COLUMNS.filter(
  (column) => column !== "last4",
)

/**
 * Column names arrive from the client (NWP-101), so this is the one place
 * they get checked against the allowlist before reaching `toCsv`. An empty
 * or entirely unrecognized list falls back to `DEFAULT_EXPORT_COLUMNS`
 * rather than producing an empty file.
 */
export function parseExportColumns(raw: string[]): ExportColumn[] {
  const seen = new Set<string>()
  const columns: ExportColumn[] = []
  for (const value of raw) {
    if (
      (EXPORT_COLUMNS as readonly string[]).includes(value) &&
      !seen.has(value)
    ) {
      seen.add(value)
      columns.push(value as ExportColumn)
    }
  }
  return columns.length > 0 ? columns : DEFAULT_EXPORT_COLUMNS
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

export function exportFilename(date = new Date(), slug?: string): string {
  const stamp = date.toISOString().slice(0, 10)
  return slug ? `payments-${slug}-${stamp}.csv` : `payments-${stamp}.csv`
}
