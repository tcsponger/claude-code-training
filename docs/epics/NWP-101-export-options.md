# EPIC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/epic`, then edited by a human.
> Load it as context when you build: `@docs/epics/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** yuta
**Status:** draft

## Problem

Dana's ops team exports the payments table several times a day, and every export today ships every column — including the card last four — against whatever filter happens to be on screen. That means every file going to a merchant gets hand-edited first: 3–4 hours a month, and one near-miss last quarter where an unedited file almost reached the wrong merchant. Ops needs to choose which columns go out and whether the export covers the current filter or the whole table, before the file leaves the app.

## Current state

- `src/app/payments/page.tsx:68-76` — the Export control is a plain `<a href="/api/payments/export?${query}">`, where `query` is the page's own filter/sort/page params. No dialog, no choices.
- `src/app/api/payments/export/route.ts:11-25` — the `GET` handler runs `parseFilters` → `filterPayments` → `sortPayments` → `toCsv(rows)` and streams the result as `text/csv` with a `content-disposition` filename. Its own comment says the column set and scope "are fixed" and names NWP-101 as the fix.
- `src/lib/csv.ts:58-67` — `toCsv(payments, columns = EXPORT_COLUMNS)` **already accepts an arbitrary column subset**; the export route just never passes one. This ticket is mostly about getting a validated column list to a call site that already supports it, not about rewriting the serializer.
- `src/lib/csv.ts:13-24` — `EXPORT_COLUMNS` is the full, fixed list of 10 columns, `last4` included. There is no function today that checks a client-supplied column name against this list.
- `src/lib/csv.ts:69-71` — `exportFilename(date = new Date())` only ever produces `payments-<date>.csv`. It has no parameter for a scope/status slug, so today's filename can't reflect what's actually inside the file.
- `src/data/queries.ts:18-36` — `parseFilters` is the existing allowlist: every filter value from the client is checked before it reaches `filterPayments`. There is no `scope` concept in `PaymentFilters` today — "current filter" is just "whatever filters are set," and "all payments" doesn't exist as an option anywhere.
- `src/app/api/payments/route.ts:4-7` — `GET /api/payments` already returns `{ rows, total, page, pageCount, pageSize }` from `queryPayments(filters)`. `total` is the count *after* filtering but *before* pagination — exactly the row count ops needs to see before downloading, for both scopes, with no new endpoint required.
- `src/components/Drawer.tsx` — a Radix-dialog-based primitive already exists (`Drawer`/`DrawerTrigger`/`DrawerContent`) and is the natural home for the new options panel; there is no separate `Dialog` component to duplicate it with.
- `src/components/` has no `Checkbox` or `RadioGroup` primitive, and `@radix-ui/react-checkbox` / `@radix-ui/react-radio-group` are not in `package.json`. The column picker and scope picker will be native `<input type="checkbox">` / `<input type="radio">` styled with Tailwind, per the components rule below, rather than adding a dependency for two small controls.
- `src/lib/csv.test.ts` is the file the ticket's Definition of Done says to extend. It currently pins the header/row shape, escaping, quoting, the merchant-name fallback, and the UTC filename date — all of which must keep passing.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units, formatted once at the edge | `merchant-console/CLAUDE.md` convention 1; `src/lib/money.ts` | `toCsv`'s `cell()` already calls `formatMoney` for the `amount` column — leave that path untouched; don't format anywhere else |
| Storage and bucketing are UTC | `merchant-console/CLAUDE.md` convention 2 | `exportFilename` already stamps the UTC date (`csv.test.ts:80-84`); the new scope/status slug must not reintroduce a local-timezone date |
| One query builder — a second implementation is a bug | `merchant-console/CLAUDE.md` convention 3; `.claude/rules/api-routes.md` | "All payments" must go through `filterPayments`/`queryPayments` with an empty filter set, not a hand-written `store.payments` read |
| Validate everything from the client against an allowlist — column names, statuses, sort fields | `merchant-console/CLAUDE.md` convention 4; NWP-101 notes ("validate columns server-side... do not interpolate them into SQL") | An unvalidated `columns` query param lets a client request or inject arbitrary field names into the response |
| The paginated table must not leak into the export | NWP-101 notes | Building the export from the browser's current page exports the current page only — the exact bug NWP-101 exists to prevent |

## Approach

Give the export route two new, server-validated query params — `columns` (repeated, checked against `EXPORT_COLUMNS`) and `scope` (`"current"` or `"all"`) — and put the picker UI in a new client component built on the existing `Drawer` primitive, triggered from the Export button on `/payments`. The dialog fetches row counts for both scopes from the already-existing `GET /api/payments` (once with the page's current filter params, once with none), so no new counting endpoint is needed. "Current filter" continues to run today's `parseFilters → filterPayments` path unchanged; "all payments" runs the same builder with an empty filter set, so there is still exactly one query implementation. The filename gets a scope-aware slug: the active status when one is set (`payments-disputed-2026-08-13.csv`, matching the ticket's own example), `"filtered"` when some other filter is active without a status, `"all"` for the all-payments scope, and today's bare `payments-<date>.csv` when no filter is active at all — confirmed with yuta as the intended rule.

**Considered and rejected:** building the CSV client-side from the rows already on screen (fetch the JSON, filter/format in the browser, save a Blob). Rejected because it can only ever see the current page's rows — reintroducing the exact browser-pagination bug the ticket calls out — and because it would duplicate `formatMoney`/`toCsv` logic that already exists server-side.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | Change | Add `parseExportColumns(raw)` to validate a client column list against `EXPORT_COLUMNS`; extend `exportFilename(date, slug?)` to accept the scope/status slug |
| `src/lib/csv.test.ts` | Change | Extend, per the ticket's DoD, with cases for the new validator and the new filename slug — do not replace existing cases |
| `src/app/api/payments/export/route.ts` | Change | Read `columns` and `scope` from the query string, validate `columns` via `parseExportColumns`, branch `scope` between `filterPayments(filters)` and `filterPayments({})`, pass the derived slug to `exportFilename` |
| `src/app/payments/export-dialog.tsx` | Add | Client component: column checkboxes (last4 unchecked by default), scope radio (current filter default), row counts from `GET /api/payments`, Download disabled at zero columns |
| `src/app/payments/page.tsx` | Change | Swap the bare Export `<a>` for the dialog's trigger, passing through the current filter query string |
| `src/data/queries.ts` | No change | Confirms the "one query builder" rule — reused via an empty filter object for scope `"all"`, not a second read path |

## Plan

1. **Extend `src/lib/csv.ts`** with `parseExportColumns()` and a slug-aware `exportFilename()`. Done when: the new `csv.test.ts` cases for both pass under `npm test`.
2. **Update the export route** to read and validate `columns`/`scope`, branch the filter set, and pass the slug through. Done when: hitting `/api/payments/export?scope=all&columns=id&columns=amount` in the running dev server returns a two-column CSV covering the whole store, and an unknown column name in the query string is silently dropped rather than appearing in the output.
3. **Build `export-dialog.tsx`**: checkboxes, scope radio, the two `GET /api/payments` row-count calls, and a Download control wired to the validated route. Done when: opening the dialog on `/payments` in the browser shows both row counts and Download greys out once every column is unchecked.
4. **Wire it into `page.tsx`**, replacing the anchor with the dialog trigger. Done when: clicking Export opens the dialog instead of navigating straight to the CSV.
5. **Finish the `csv.test.ts` extension** called for in the ticket's Definition of Done and run the full suite. Done when: `npm test` passes end to end.
6. **Manual pass against the running dev server** for each acceptance criterion below. Done when: every row in the Verification table is checked off.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Ops can choose columns; `last4` off by default | Open the dialog on `/payments`, confirm the `last4` checkbox starts unchecked, toggle a few columns, download, and diff the CSV header against the selection |
| Scope: current filter (default) vs. all payments, row count visible before download | Apply a status filter on `/payments`, open the dialog, confirm the two counts differ and match `total` from `GET /api/payments` for each scope |
| Filename reflects scope and date | Export with a status filter set → filename matches `payments-<status>-<date>.csv`; export with `scope=all` → `payments-all-<date>.csv` |
| Amounts stay minor units internally, formatted once with currency in its own column | `csv.test.ts` cases for the `amount`/`currency` columns still pass unchanged; no new formatting call added outside `cell()` |
| Deselecting every column disables Download | Uncheck every box in the dialog and confirm the Download control is disabled, not producing an empty-body CSV |
| Unit test covers the column serializer; `npm test` passes | `csv.test.ts` extended with `parseExportColumns` and filename-slug cases; `npm test` green |

## Risks

- The filename-slug rule generalizes from the ticket's single `disputed` example; the rule above (status → `"filtered"` → `"all"` → plain date) was confirmed with yuta rather than assumed, but it's worth a second look once real filter combinations are tried.
- The two `GET /api/payments` calls the dialog makes on open add a small amount of latency; acceptable since `queryPayments` already scans the same in-memory array on every page load.
- "All payments" scope has no size limit — fine for this workshop's in-memory store, but would need attention (streaming, a hard cap) before this pattern moves to a real dataset.

## Out of scope

- Persisting a user's last-used column/scope choice across visits — not requested by the ticket.
- Streaming or chunking CSV generation for the `scope=all` case — the in-memory store is small enough that building the string in one pass, as `toCsv` does today, is fine.
- NWP-102 (linked ticket) — untouched here.

## Open questions

- None blocking. The filename-slug generalization above should get a quick look from Dana's team once they see real exports, since the ticket only specifies the one example.
