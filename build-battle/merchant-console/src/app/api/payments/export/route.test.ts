import { store } from "@/data/store"
import { DEFAULT_EXPORT_COLUMNS } from "@/lib/csv"
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { GET } from "./route"

/**
 * NWP-101: the export route is the one place `scope` and `columns` from the
 * client turn into a row set and a filename. These tests cover that
 * branching directly, rather than relying on the manual pass in the browser.
 */

function exportRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/payments/export?${query}`)
}

async function bodyOf(response: Response) {
  const text = await response.text()
  return text.split("\n")
}

describe("GET /api/payments/export", () => {
  it("defaults to the current filter and a plain filename when nothing is set", async () => {
    const response = GET(exportRequest(""))
    expect(response.headers.get("content-disposition")).toMatch(
      /filename="payments-\d{4}-\d{2}-\d{2}\.csv"/,
    )
    const [header] = await bodyOf(response)
    expect(header).toBe(DEFAULT_EXPORT_COLUMNS.join(","))
  })

  it("reflects the active status in the filename, matching the ticket's example", async () => {
    const response = GET(exportRequest("status=disputed"))
    expect(response.headers.get("content-disposition")).toMatch(
      /filename="payments-disputed-\d{4}-\d{2}-\d{2}\.csv"/,
    )
    const rows = await bodyOf(response)
    const expectedCount = store.payments.filter(
      (p) => p.status === "disputed",
    ).length
    expect(rows).toHaveLength(expectedCount + 1) // header + one row per match
  })

  it("uses 'filtered' when a non-status filter is active", async () => {
    const merchantId = store.payments[0].merchantId
    const response = GET(exportRequest(`merchantId=${merchantId}`))
    expect(response.headers.get("content-disposition")).toMatch(
      /filename="payments-filtered-\d{4}-\d{2}-\d{2}\.csv"/,
    )
  })

  it("scope=all ignores every other filter, covering the whole store", async () => {
    const response = GET(exportRequest("status=disputed&scope=all"))
    expect(response.headers.get("content-disposition")).toMatch(
      /filename="payments-all-\d{4}-\d{2}-\d{2}\.csv"/,
    )
    const rows = await bodyOf(response)
    expect(rows).toHaveLength(store.payments.length + 1)
  })

  it("falls back to the current filter for an unrecognized scope value", async () => {
    const response = GET(exportRequest("status=disputed&scope=bogus"))
    expect(response.headers.get("content-disposition")).toMatch(
      /filename="payments-disputed-\d{4}-\d{2}-\d{2}\.csv"/,
    )
  })

  it("validates columns against the allowlist and keeps the requested order", async () => {
    const response = GET(
      exportRequest("columns=amount&columns=id&columns=not_a_real_column"),
    )
    const [header] = await bodyOf(response)
    expect(header).toBe("amount,id")
  })

  it("falls back to the default columns, excluding last4, when none are given", async () => {
    const response = GET(exportRequest(""))
    const [header] = await bodyOf(response)
    expect(header.split(",")).not.toContain("last4")
    expect(header).toBe(DEFAULT_EXPORT_COLUMNS.join(","))
  })
})
