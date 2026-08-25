"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/Drawer"
import { DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMNS, ExportColumn } from "@/lib/csv"
import { cx, focusRing } from "@/lib/utils"
import { Download } from "lucide-react"
import { useEffect, useState } from "react"

type Scope = "current" | "all"

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created at",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

/**
 * Column picker and scope picker for the payments export (NWP-101). Built on
 * the existing Drawer primitive rather than a new dialog component, and on
 * plain checkbox/radio inputs since neither exists yet in `src/components/`.
 */
export function ExportDialog({ filterQuery }: { filterQuery: string }) {
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState<ExportColumn[]>(DEFAULT_EXPORT_COLUMNS)
  const [scope, setScope] = useState<Scope>("current")
  const [counts, setCounts] = useState<{ current: number | null; all: number | null }>(
    { current: null, all: null },
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function loadCounts() {
      const [currentRes, allRes] = await Promise.all([
        fetch(`/api/payments?${filterQuery}`),
        fetch(`/api/payments`),
      ])
      const [currentBody, allBody] = await Promise.all([
        currentRes.json(),
        allRes.json(),
      ])
      if (!cancelled) {
        setCounts({ current: currentBody.total, all: allBody.total })
      }
    }

    loadCounts()
    return () => {
      cancelled = true
    }
  }, [open, filterQuery])

  function toggleColumn(column: ExportColumn) {
    setColumns((current) =>
      current.includes(column)
        ? current.filter((c) => c !== column)
        : [...current, column],
    )
  }

  const exportHref = (() => {
    const params = new URLSearchParams(scope === "current" ? filterQuery : "")
    params.set("scope", scope)
    for (const column of columns) params.append("columns", column)
    return `/api/payments/export?${params.toString()}`
  })()

  const rowCount = scope === "current" ? counts.current : counts.all

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        className="w-full gap-2 py-1.5 sm:w-fit"
        onClick={() => setOpen(true)}
      >
        <Download
          className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
          aria-hidden="true"
        />
        Export
      </Button>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            {EXPORT_COLUMNS.map((column) => (
              <label
                key={column}
                className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-50"
              >
                <input
                  type="checkbox"
                  checked={columns.includes(column)}
                  onChange={() => toggleColumn(column)}
                  className={cx(
                    "size-4 rounded border-gray-300 bg-white text-blue-600 dark:border-gray-800 dark:bg-gray-950",
                    focusRing,
                  )}
                />
                {COLUMN_LABELS[column]}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Scope
            </legend>
            <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-50">
              <input
                type="radio"
                name="export-scope"
                checked={scope === "current"}
                onChange={() => setScope("current")}
                className={cx(
                  "size-4 border-gray-300 bg-white text-blue-600 dark:border-gray-800 dark:bg-gray-950",
                  focusRing,
                )}
              />
              Current filter
              {counts.current !== null && scope === "current" && (
                <span className="text-gray-500">
                  · {counts.current.toLocaleString()} rows
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-50">
              <input
                type="radio"
                name="export-scope"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                className={cx(
                  "size-4 border-gray-300 bg-white text-blue-600 dark:border-gray-800 dark:bg-gray-950",
                  focusRing,
                )}
              />
              All payments
              {counts.all !== null && scope === "all" && (
                <span className="text-gray-500">
                  · {counts.all.toLocaleString()} rows
                </span>
              )}
            </label>
          </fieldset>

          {rowCount !== null && (
            <p className="text-sm text-gray-500">
              {rowCount.toLocaleString()} row{rowCount === 1 ? "" : "s"} will be
              exported.
            </p>
          )}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={columns.length === 0}
            onClick={() => {
              // A real navigation, not fetch+Blob, so the browser still
              // handles the download via the route's Content-Disposition
              // header.
              window.location.href = exportHref
              setOpen(false)
            }}
          >
            Download
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
