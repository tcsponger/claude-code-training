# EPIC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/epic`, then edited by a human.
> Load it as context when you build: `@docs/epics/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** yuta@withfulcrum.com
**Status:** draft

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand — hours of turnaround, 12-20 times a week, and last month a limit typo in a Slack thread produced two wrong cards. Ops needs to issue a card, see the cards issued, and open one to check it, without leaving the console.

## Current state

- `src/data/types.ts` has no `Card` type yet — `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout` only. A `Card` type and a `CardStatus` union need to be added here.
- `src/data/store.ts` — the in-memory `Store` interface holds arrays for each entity, generated once at boot via `generate()` and cached on `globalThis.__northwindStore`. `cards: Card[]` needs to join that interface and be seeded as `[]` (no seed cards required by the ticket; the store starts empty and ops populates it).
- `src/data/merchants.ts` — `merchants` array and `merchantById(id)`, already used by every list/detail page. Card issuance reuses this for the merchant picker and for currency defaulting (`merchant.currency`).
- `src/data/queries.ts` — the pattern to follow for card queries: a `parseFilters`-style allowlist parser (not needed here, no filtering required by the ticket) plus simple accessors like `paymentById`. Cards need equivalent `cardById(id)` and a `listCards()`/`createCard()` mutator. There is no existing *write* path anywhere in `src/data/` — payments/refunds/disputes/payouts are all read-only today. Card issuance is the first mutation, so it needs its own store-mutating functions, colocated with the rest of the card domain logic rather than bolted onto `queries.ts` (which is payments-specific).
- `src/app/api/payments/route.ts` — the thin route-handler pattern: parse/validate, call a data-layer function, return JSON. Card routes (`POST /api/cards`, `GET /api/cards`, `GET /api/cards/[id]`, and a status-transition route) follow the same shape.
- `src/lib/money.ts` — `formatMoney`, `parseAmountToMinorUnits` already exist and must be reused for the limit input/display. No new money formatter.
- `src/lib/dates.ts` — has a `formatDate`/`formatInZone` pattern (used in payments pages) to reuse for "created date" in the card list.
- `src/components/` — `Button`, `Input`, `Select` (Radix-based, Tremor-styled), `Badge`, `Table*`, `Divider` all exist and are used by the payments pages (`src/app/payments/page.tsx`, `src/app/payments/[id]/page.tsx`). **No `Dialog` component exists yet** — `@radix-ui/react-dialog` is already a dependency (`package.json`) but unused; this epic adds `src/components/Dialog.tsx` as a new Tremor-style primitive, matching the conventions of the existing `Select.tsx`/`Input.tsx` wrappers, not a one-off.
- `src/components/ui/payments/StatusBadge.tsx` — maps a status union to label/dot-color/badge-variant. The card status badge should follow this same table-driven shape (new file `src/components/ui/cards/StatusBadge.tsx` or extend the existing one — extending risks coupling cards to payments' status union, so a sibling file is cleaner).
- `src/components/ui/navigation/AppSidebar.tsx` — the `navigation` array drives the sidebar; `siteConfig.baseLinks` (`src/app/siteConfig.ts`) holds route constants. Both need a `cards` entry.
- `src/app/payments/page.tsx` and `src/app/payments/[id]/page.tsx` are the direct structural models for `src/app/cards/page.tsx` and `src/app/cards/[id]/page.tsx` — server components reading from the data layer, `TableRoot`/`Table` for the list, a `Field` dt/dd pattern for detail.
- No Luhn/BIN generator exists anywhere in the repo — net new, server-only code (`src/lib/cardNumber.ts` per the `cards.md` rule "generate on the server").
- Ticket contradiction check: the ticket's stretch goals mention "merchant category lock" but no `merchantCategory` field exists on `Merchant` today — this would be a new field stored on the `Card` itself (chosen at issue time), not derived from `Merchant`, so no `Merchant`/type changes are needed for it.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units | `CLAUDE.md`, `.claude/rules/money.md`, `cards.md` ("Spend limits follow the money rule") | A `$250.00` limit stored as `250` or `"250.00"` silently corrupts every comparison against spend |
| Test BIN only, valid Luhn | `NWP-201.md`, `cards.md` | A number that doesn't start `4242` or fails Luhn resembles a real PAN or fails downstream validation |
| Generate on the server | `cards.md` ("A card number produced in the browser is a bug") | Client-generated numbers can't be trusted and break the reveal-once guarantee |
| Reveal once, mask everywhere else (`•••• 4242`) | `NWP-201.md`, `cards.md` | A full PAN persisted or re-returned in list/detail responses is a data leak, scored explicitly |
| Never return a full card number from a list or detail route | `.claude/rules/api-routes.md` | Same as above, enforced at the route layer, not just the UI |
| Status is a state machine: `active ⇄ frozen`, either → `cancelled`, `cancelled` terminal | `NWP-201.md`, `cards.md` | An invalid transition (e.g. `cancelled → active`) corrupts state; must be guarded server-side |
| Validate on the server against an allowlist | `.claude/rules/api-routes.md` | Client-side-only validation on merchant/limit/currency is bypassable |
| No database, no ORM, no migrations | `NWP-201.md`, `merchant-console/CLAUDE.md` | Out of scope; adding one wastes the clock and earns nothing |
| Reuse existing helpers (money, dates, query patterns) | `CLAUDE.md` ("a second implementation... costs points") | A second money formatter or a second filter path is a defect |

## Approach

Add a `Card` domain end to end: a `Card` type and `CardStatus` union in `src/data/types.ts`; a `cards: Card[]` array (starts empty) on the store; a new `src/data/cards.ts` module holding `listCards`, `cardById`, `createCard`, and `setCardStatus` (the only place that mutates `store.cards`, mirroring how `queries.ts` centralizes payment reads); a server-only Luhn generator in `src/lib/cardNumber.ts`; three route handlers under `src/app/api/cards/` (`POST /` + `GET /` combined in `route.ts`, `GET /[id]/route.ts`, and `PATCH /[id]/status/route.ts` for freeze/unfreeze/cancel); and two pages (`/cards` list, `/cards/[id]` detail) plus an issue-card dialog component, all modeled directly on the payments pages/components already in the repo. A new `Dialog` primitive is added to `src/components/` since none exists.

**Considered and rejected:** storing the full generated number on the `Card` record and redacting it in every response (rather than never storing it at all). Rejected because rule 2 in the ticket ("never persist... after creation") and `api-routes.md` ("never return a full card number from a list or detail route") both target the *record*, not just the response — persisting it doubles the ways a leak can happen (a forgotten redaction in one more route) for no benefit, since nothing downstream needs the full PAN after issuance. The generator returns the full number once to the route handler, which returns it once to the client and stores only `last4` + a `numberRef` (an opaque token, not reversible to the PAN) on the `Card`.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | Add `Card`, `CardStatus`, `MerchantCategory` (stretch) |
| `src/data/store.ts` | change | Add `cards: Card[]` to `Store`, seed as `[]` |
| `src/data/cards.ts` | add | `listCards`, `cardById`, `createCard`, `setCardStatus` — the one card data-layer module |
| `src/lib/cardNumber.ts` | add | Server-only 4242-BIN generator with Luhn check digit |
| `src/lib/cardNumber.test.ts` | add | Luhn validity + BIN prefix tests (stretch) |
| `src/data/cards.test.ts` | add | Status-transition tests (stretch) |
| `src/app/api/cards/route.ts` | add | `GET` list, `POST` create + validate |
| `src/app/api/cards/[id]/route.ts` | add | `GET` detail |
| `src/app/api/cards/[id]/status/route.ts` | add | `PATCH` status transition, server-guarded |
| `src/app/cards/page.tsx` | add | Card list route |
| `src/app/cards/[id]/page.tsx` | add | Card detail route |
| `src/app/cards/issue-card-dialog.tsx` | add | Client component: form + success (reveal-once) screen |
| `src/components/Dialog.tsx` | add | New Tremor-style Radix Dialog primitive (none exists yet) |
| `src/components/ui/cards/StatusBadge.tsx` | add | Card status → label/color, mirrors payments' `StatusBadge` |
| `src/components/ui/navigation/AppSidebar.tsx` | change | Add "Cards" nav entry |
| `src/app/siteConfig.ts` | change | Add `baseLinks.cards = "/cards"` |

## Plan

1. **Types + store** — add `Card`/`CardStatus` to `types.ts`, `cards: Card[]` to the store. Done when: `npm run build` type-checks with the new shape referenced nowhere yet.
2. **Luhn generator** — `src/lib/cardNumber.ts`, pure function, no store access. Done when: a quick manual check (or the stretch test) confirms `4242` prefix + valid Luhn on repeated calls.
3. **Card data layer** — `src/data/cards.ts` with `createCard` (assigns id, number ref, last4, status `active`, `createdAt`) and `setCardStatus` (enforces the state machine, throws/returns null on an illegal transition). Done when: calling `createCard` from a scratch script/route returns a card with no full number field.
4. **API routes** — `POST/GET /api/cards`, `GET /api/cards/[id]`, `PATCH /api/cards/[id]/status`, all server-validated (merchant exists, limit is a positive integer ≤ 5,000,000, currency in `USD|EUR|GBP`). Done when: `curl -X POST` with a bad currency/limit/missing merchant returns 4xx with a message; a valid POST returns the full number once.
5. **List + detail pages** — `/cards` and `/cards/[id]`, reusing `Table*`, `formatMoney`, `formatDate`, masked `•••• 4242` everywhere. Done when: pages render seeded-empty state, then a created card, with no full number anywhere in the rendered HTML or page source.
6. **Issue dialog + nav** — `Dialog` primitive, the issue form, the one-time reveal screen, sidebar/siteConfig entries. Done when: submitting the form in the browser creates a card, shows the number once, and it appears in the list masked.
7. **Stretch (time permitting, in this order)** — Luhn/status-transition tests, freeze/unfreeze from the list without reload, spend progress bar (amber >80%), category lock, written empty/error states.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card via form → appears in list | Manual: fill dialog, submit, see row in `/cards` |
| `/cards` list shows nickname, merchant, masked number, limit, status, created date | Manual screenshot / read_page of `/cards` |
| Card detail shows full record + spend vs. limit | Manual: open a card, check fields render |
| Server-generated 4242 + Luhn | `curl -X POST /api/cards` inspect response `number`; optional unit test on `cardNumber.ts` |
| Reveal once, masked elsewhere | Read source/DOM of list, detail, and a second GET of the same card — full number appears only in the create response body |
| Server-side validation | `curl` bad merchant / limit ≤0 / limit >5,000,000 / bad currency, expect 4xx each |
| `npm test` passes | Run `npm test` before push |

## Risks

- No existing write path in the store — mutating `globalThis.__northwindStore` needs to happen in one centralized module (`src/data/cards.ts`) to avoid a second mutation path appearing later.
- Freeze/unfreeze "without a reload" (stretch) requires client-side state sync after a `PATCH`; if time is short, cut this before cutting a core criterion.

## Out of scope

- Persistence, auth, real card network calls, editing a limit after issue — per the ticket, not built.
- Filtering/search/pagination on `/cards` — not required by the ticket's core criteria; add only if time remains after stretch goals.

## Open questions

- None blocking. Merchant category lock (stretch) will store category directly on `Card` at issue time rather than adding it to `Merchant`, since the ticket scopes it as chosen "at issue time."
