import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import { PaymentFilters } from "@/data/types"
import { exportFilename, parseExportColumns, toCsv } from "@/lib/csv"
import { NextRequest } from "next/server"

type ExportScope = "current" | "all"

/**
 * NWP-101: the filename carries the scope so a file never looks like every
 * other file in the download folder. "all" for the whole table; the active
 * status when one is set, matching the ticket's own example
 * (`payments-disputed-2026-08-13.csv`); "filtered" for any other filter
 * combination; otherwise the plain date, as before.
 */
function filenameSlug(
  scope: ExportScope,
  filters: PaymentFilters,
): string | undefined {
  if (scope === "all") return "all"
  if (filters.status && filters.status !== "all") return filters.status
  const hasOtherFilter = Boolean(
    filters.merchantId || filters.search || filters.from || filters.to,
  )
  return hasOtherFilter ? "filtered" : undefined
}

/**
 * Exports the payments table as CSV.
 *
 * `scope` and `columns` are client input, so both are checked against an
 * allowlist before they reach the query builder or the filename: `scope` is
 * one of two known values, defaulting to "current", and `columns` is
 * validated by `parseExportColumns`. "All payments" still goes through
 * `filterPayments` — with an empty filter set — rather than a second read
 * path, so there is still exactly one query builder.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const filters = parseFilters(params)
  const scope: ExportScope = params.get("scope") === "all" ? "all" : "current"
  const columns = parseExportColumns(params.getAll("columns"))

  const rows = sortPayments(
    filterPayments(scope === "all" ? {} : filters),
    filters.sort,
    filters.direction,
  )

  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(new Date(), filenameSlug(scope, filters))}"`,
    },
  })
}
