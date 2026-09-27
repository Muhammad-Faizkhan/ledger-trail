# LedgerTrail redesign plan

_Written 2026-09-27. Start here on the next development day._

## Why

The first version of the app works, but it follows how the data is stored, not how a
trader works. Review from the owner (a businessman): the GUI and the order-creation
procedure are "not up to the mark". The goal of this redesign is an app a shop owner can
use all day on a phone without thinking about it.

### Problems with the current version

| # | Problem | Why it matters in a real business |
|---|---------|-----------------------------------|
| 1 | One item per order | A real order is cement + steel + bricks together, not three orders |
| 2 | No units (bags, tons, kg, pcs…) | "50" means nothing without "bags" |
| 3 | New order is 3 clicks deep, inside a vendor page | Orders happen fast, often while on a call |
| 4 | Each payment belongs to exactly one order | Traders pay a lump sum against the vendor's account |
| 5 | No order numbers | You can't tell a vendor "PO-0042" |
| 6 | No list of all orders, no search or filters | You can't see what's pending, unpaid or to be received |
| 7 | No printable or PDF purchase order or statement | WhatsApp gets plain text only |
| 8 | Generic dark look, one long vendor page | Hard to read in a bright shop, too much scrolling |

## Decisions (confirmed 2026-09-27)

1. **Payments:** a lump sum against the vendor's account, applied to the oldest unpaid
   orders first. A payment can still be pinned to one order.
2. **Saved item list:** yes. Items keep their last rate, so typing "cem" fills in
   "Cement · Rs 1,450".
3. **Order numbers:** `PO-0001` per business, counting up, never reused, even after a
   delete.
4. **Units: dropped (2026-09-27).** The owner asked to remove the unit box from the
   order screen, so items are just name, quantity and rate. Put a unit in the item name
   when it matters ("Cement bag", "Sand truck").

## Ease of use comes first

Owner feedback (2026-09-27): the app is "getting tricky". Every screen in this plan must
pass these rules before it's done:

- **One main action per screen**, as one big button. Everything else is secondary.
- **No hidden steps.** Nothing important sits behind "Edit" links or inside another
  record. New order and Record payment are reachable from every screen in one tap.
- **Plain words.** "You owe", "Paid", "To receive", not "outstanding", "allocation"
  or "orphan".
- **Show the result before saving.** The order total, and which bills a payment clears,
  are visible while typing.
- **Fewer fields.** Sensible defaults (today's date, the last rate, "ordered"),
  and optional details folded under "More details".
- **Short pages.** Tabs instead of one long scroll; lists show about 20 rows with search.
- **Every empty screen says what to do next.**
- **Check at phone width (360px) first**, then desktop.

## What changes

### Data model

Nothing live exists yet (Blaze isn't on, so there's no real data), so no data migration is
needed. The emulator data can be thrown away.

**Orders** (`businesses/{id}/orders/{orderId}`):

```ts
interface Order {
  id: string;
  number: number;              // NEW: 1, 2, 3… shown as PO-0001
  vendorId: string;
  vendorName: string;
  items: OrderItem[];          // NEW: replaces description / qty / rate
  amount: number;              // sum of item amounts
  orderDate: string;
  expectedDate: string | null; // NEW: when the goods should arrive
  status: "ordered" | "confirmed" | "received";
  invoiceAmount: number | null;
  invoiceNo: string | null;    // NEW: the vendor's bill number
  invoiceDate: string | null;
  note: string;                // NEW: free text, e.g. "deliver to site 2"
  createdAt: Timestamp | null;
}

interface OrderItem {
  name: string;
  qty: number;
  rate: number;
  amount: number; // qty * rate
}
```

**Payments** (`businesses/{id}/payments/{paymentId}`):

- `orderId` becomes **optional** (`string | null`). When it's null, the payment counts
  against the vendor's account.
- **Allocation is calculated, not stored.** `derive.ts` applies unpinned payments to that
  vendor's oldest unpaid orders first (FIFO). Because nothing about allocation is saved,
  it can never go out of sync after an edit or a delete.
- All the bank / cheque / cash fields stay as they are.

**Item catalog** (only if decision 2 is yes), `businesses/{id}/items/{itemId}`:
`{ name, lastRate, updatedAt }`. It updates automatically when an order is saved.

### Where orders get created: move to a Cloud Function

Firestore rules can't loop over an array, so they can't check that every item's
`amount = qty × rate` or that the order total is the sum of the items. They also can't
safely hand out sequential order numbers.

**Decision:** create and edit orders through callable Cloud Functions, `saveOrder`
(create or update) and `deleteOrder`. Each one runs as a single transaction that:

- validates every item and the total on the server,
- takes the next number from `businesses/{id}/counters/orders`,
- writes the order and its edit-history entries.

The security rules then block clients from writing orders directly (read only).
Payments stay as direct client writes with rules, as now.

This needs Blaze to work live, but the app already needs Blaze for sign-up
(`provisionBusiness`). Locally everything runs in the emulators for free.

### Screens

A **bottom navigation bar** on phones (a top bar on desktop): **Home · Orders · Vendors ·
Payments**, plus a large **＋ New order** button that's always visible.

| Screen | Route | What's on it |
|--------|-------|--------------|
| Home | `/` | Totals you owe, "Needs attention", orders expected today or overdue, recent activity |
| New order | `/orders/new` (also opens as a sheet from anywhere) | Vendor picker (search, or add a new vendor inline) → item rows (item, qty, rate, amount) → live total → date, expected date, note → **Save** or **Save & send on WhatsApp** |
| Orders | `/orders` | All orders with search (PO number, vendor, item). Filters: Open / To receive / Unpaid / All. Status chips. Tap to open |
| Order detail | `/orders/[id]` | Items table, status steps (ordered → confirmed → received), invoice (number, amount, date, mismatch warning), payments applied to it, Edit / Delete, Print / Share |
| Vendors | `/vendors` | Search, balance per vendor, sort by highest balance |
| Vendor detail | `/vendors/[id]` | Tabs: **Orders · Payments · Statement**. Pay button, WhatsApp, share link, notes |
| Payments | `/payments` | All payments; filter by method; pending cheques first with **Mark cleared** |
| Record payment | sheet | Vendor → amount → method details → "Apply to: oldest unpaid first ▾ / specific order" → preview of which orders it clears |
| Print views | `/orders/[id]/print`, `/vendors/[id]/statement` | Clean A4 / mobile layout with the business name; browser "Save as PDF"; WhatsApp share |
| History | `/history` | Already built; add filters for entity and date |
| Settings | `/settings` | Business name and phone (moved from the dashboard), sign out |

### Look and feel

- **Light theme by default** (for a bright shop), with dark mode following the phone
  setting.
- Large touch targets (at least 44px). Rupee amounts right-aligned in a tabular-number
  font.
- Status colours used the same way everywhere: ordered = grey, confirmed = blue,
  received = green, overdue or mismatch = red.
- Forms: number keypad for quantities and amounts; Enter moves to the next item row;
  the last rate is remembered per item.
- Empty states that say what to do next ("No orders yet — tap ＋ New order").
- Urdu labels are out of scope for now, but all UI text should be kept in one place so
  they can be added later.

## Build order

Each phase ends with the tests passing and a commit.

### Phase 0 — Housekeeping (15 min)
- [x] Commit the uncommitted work from 2026-09-26: order and payment delete with edit
      history, the `/history` page, editing business details, orphan payments in
      "Needs attention".
- [x] Confirm the four decisions above and update this document.

### Phase 1 — Data and backend
- [x] `types.ts`: `OrderItem`, the new `Order` fields, `Payment.orderId` nullable.
- [x] `derive.ts`: FIFO allocation (`allocatePayments(orders, payments)` →
      per-order paid and balance), then update `orderBalance`, `vendorTotals`,
      `audit`, `vendorStatement` and `orderMessage` for multiple items.
- [x] Unit tests for the allocation edge cases:
  - overpayment
  - a pinned payment plus an unpinned one
  - deleting an order that has payments applied to it
  - a payment with no orders yet
- [x] Cloud Functions: `saveOrder`, `deleteOrder` (transaction, counter, validation,
      edit history). Update `resolveVendorLink` to return items.
- [x] `firestore.rules`: orders become read-only for clients; payments allow a null
      `orderId`; `counters` has no client access; `items` catalog rules.
- [x] Rules and e2e tests updated, plus new e2e tests for `saveOrder` numbering and
      validation.

### Phase 2 — App shell and visual refresh
- [x] Theme tokens (light default), typography, a shared components set (Sheet, Tabs,
      Chip, EmptyState, MoneyText).
- [x] Navigation bar and the always-visible ＋ New order button; `/settings`.

### Phase 3 — New order flow
- [x] Vendor picker with search and inline "add vendor".
- [x] Item rows, live totals and the catalog autocomplete.
- [x] Save, and Save & send on WhatsApp (formatted multi-item message with the PO number).

### Phase 4 — Orders
- [x] `/orders` list with search and filters.
- [x] `/orders/[id]` detail: edit, status steps, invoice number/amount/date, delete.

### Phase 5 — Payments
- [x] Record-payment sheet with account-level payments and an allocation preview.
- [x] `/payments` list; the pending-cheques view.
- [x] Vendor detail tabs.

### Phase 6 — Print and share
- [x] Printable purchase order and vendor statement (print CSS, Save as PDF).
- [x] Update the vendor link page for items and PO numbers.

### Phase 7 — Go live (needs Blaze)
- [ ] Owner: enable Blaze (with a budget alert), create Firestore (Standard, production
      mode; location `asia-south1` recommended), and enable Email/Password sign-in.
- [ ] Set the Functions region to match the Firestore location.
- [ ] `firebase deploy --project live` (rules, indexes, functions).
- [ ] Deploy the Next.js app (Vercel) with the variables from `.env.production.local`.
- [ ] Test the live app with a real signup.

## Current state (end of 2026-09-27)

Phases 0–6 are built. Phase 7 (going live) is next and needs the owner to enable Blaze.

**Changes from the plan, and why:**
- **New order and Record payment are full pages, not pop-up sheets.** On a phone a
  sheet this long is harder to use than a page, and the Back button works as expected.
- **One "Save order" button, not two.** After saving, the order page shows
  "Order PO-0007 saved" with a big **Send on WhatsApp** button. Opening WhatsApp
  straight from Save would be blocked as a pop-up by some browsers.
- **Deleting an order is always allowed.** Its pinned payments move to the vendor's
  account (logged in history), instead of blocking the delete.
- **Vendor tabs are Orders · Payments · Details.** Details holds the statement
  (WhatsApp and Print), phone and notes, and the vendor link.

**Not done yet:**
- UI text is not collected in one file yet (needed before adding Urdu).
- History has entity filters but no date filter.

**Code map:**
- Signed-in screens live under `src/app/(app)/` and share one layout
  (`AppShell`), so the ledger loads once and stays live while moving between pages.
- Orders are written only by the `saveOrder` / `deleteOrder` functions
  (`functions/src/index.ts`, input checks in `functions/src/orderInput.ts`).
- Which bills each payment paid is worked out by `allocatePayments` in
  `src/lib/derive.ts`; nothing about it is stored.
- **Tests:** 53 unit, 12 rules, 7 e2e. Tests need Java 21: set `JAVA_HOME` to
  `C:Program FilesMicrosoftjdk-21.0.12.101-hotspot` if a terminal still picks up 17.
- **Firebase:** the local emulators (`demo-ledgertrail`) are what `npm run dev` uses.
  The live project is `ledgertrailer` (alias `live`), with its web config in
  `.env.production.local` (git-ignored). Firestore and Auth aren't set up there yet.

### Running locally

```bash
npm run emulators   # terminal 1 (needs Java 21)
npm run dev         # terminal 2 → http://localhost:3000
npm run seed        # optional, emulators running: demo business (login in scripts/seed-emulator.ts)
npm test            # unit + rules + e2e
```

Next.js here is version 16. Read `node_modules/next/dist/docs/` before using any
Next API (see `AGENTS.md`). Route `params` are Promises.
