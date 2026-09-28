# Session notes — where we left off

_Last updated: 2026-09-27. Read this first when starting the next session, then
`docs/redesign-plan.md` for the full design and decisions._

## In one line

The redesign is built and working locally. **Next step: go live on Firebase + Vercel
(Phase 7).**

## What was done on 2026-09-27

| Commit | What |
|--------|------|
| `073b04e` | Committed the leftover work: deletes with edit history, `/history`, business details |
| `7fe204c` | Plan: the four decisions confirmed, plus "ease of use comes first" rules |
| `325ce49` | Backend: multi-item orders, PO numbers (`PO-0001`), payments against the vendor's account (oldest bills first), `saveOrder` / `deleteOrder` Cloud Functions, orders read-only to clients |
| `d1e8aaf` | New app: Home · Orders · Vendors · Payments with an always-visible ＋ New order, new order flow, order page, record payment with preview, payments list, vendor tabs, settings |
| `9241ba5` | **Units removed** from orders (owner's request). Qty/rate select on tap. Inline "add vendor" picks it instantly. Dev app works from a phone on the same Wi-Fi |
| `447bc7d` | **Edit button for vendors**, including renaming (`renameVendor` function updates their orders and payments too) |
| `9d2d8d6` | **Share PDF on WhatsApp** replaces Print / PDF for purchase orders and statements |

Tests at the end of the day: **53 unit, 12 rules, 8 e2e, all passing**; lint,
type-check and `next build` clean.

## Owner's requests this session (keep these in mind)

- The app must be **simple for a shop owner** — see "Ease of use comes first" in the plan.
- **No units** on items. Put a unit in the item name if needed ("Cement bag").
- Vendor details (name, phone, notes) must be **easy to find and edit**.
- Bills should go out as a **PDF on WhatsApp**, not printed.
- The **vendor link** (`/v/<token>`, vendor's own read-only page) is wanted for the
  demo; it will work for vendors once deployed on Vercel.

## Next steps

1. **Go live (Phase 7 in the plan).** Needs the owner:
   - Firebase project `ledgertrailer`: turn on **Blaze** (set a budget alert), create
     **Firestore** (production mode, location `asia-south1` suggested), enable
     **Email/Password** sign-in.
   - Done 2026-09-28: Firestore created in `asia-south1`, and the Cloud Functions
     now use the same region (`REGION` in `functions/src/index.ts`).
   - `firebase deploy --project live` (rules, indexes, functions).
   - Deploy the Next.js app on **Vercel** with the `NEXT_PUBLIC_FIREBASE_*` values from
     `.env.production.local`, and `NEXT_PUBLIC_USE_EMULATORS` unset or `false`.
   - Add the Vercel domain to Firebase Auth → **Authorized domains**.
   - Test with a real signup, then create a vendor link and open it on another phone.
2. **Try Share PDF on WhatsApp on a real phone** (only simulated so far; the phone's
   Share menu can't be tested headlessly).
3. Optional ideas offered but not asked for yet:
   - Put the vendor's link at the bottom of the WhatsApp order message.
   - A "Share vendor link" button on the order and vendor pages.

## Still open / known gaps

- UI text isn't in one file yet (needed before adding Urdu).
- History has entity filters but no date filter.
- Once, `/settings` sat on "Loading your ledger…" for 30s on first load in dev; not
  reproduced in 8 retries (likely first-time dev compile).
- Old emulator data from before units were removed may still show units — reseed.

## How to run it locally

```bash
npm run emulators   # terminal 1 — needs Java 21 (see below)
npm run dev         # terminal 2 → http://localhost:3000
npm run seed        # terminal 3, once the emulators are up: demo business "Faiz Traders"
npm test            # unit + rules + e2e (stop the emulators first; tests start their own)
```

- **Demo login:** `DEMO_EMAIL` / `DEMO_PASSWORD` at the top of `scripts/seed-emulator.ts`.
- **Emulator data is wiped** every time the emulators stop. Run `npm run seed` again.
- **From a phone** on the same Wi-Fi: `http://<this PC's IP>:3000` (it was
  `192.168.1.103`). This works because `firebase.json` makes the emulators listen on
  the network, `src/lib/firebase.ts` connects to them at the address the page was opened
  from, and `next.config.ts` allows `192.168.*.*` in dev. Windows Firewall may ask to
  allow Node.js the first time.
- **Java 21:** if a terminal picks up Java 17, set
  `JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`.
- **Next.js 16:** read `node_modules/next/dist/docs/` before using a Next API
  (see `AGENTS.md`). Route `params` / `searchParams` are Promises.

## Where things are

| What | Where |
|------|-------|
| Signed-in screens (shared layout, ledger loads once) | `src/app/(app)/` |
| App frame and navigation | `src/app/_components/AppShell.tsx` |
| New / edit order form | `src/app/_components/OrderForm.tsx` |
| Vendor search + inline add | `src/app/_components/VendorPicker.tsx` |
| PDF share button / PDF builder | `src/app/_components/SharePdfButton.tsx`, `src/lib/pdf.ts` |
| All client writes | `src/app/_components/writes.ts` |
| Ledger maths (which bills a payment paid, audit, messages) | `src/lib/derive.ts` |
| Cloud Functions (`saveOrder`, `deleteOrder`, `renameVendor`, vendor links, provisioning) | `functions/src/index.ts`, input checks in `functions/src/orderInput.ts` |
| Security rules | `firestore.rules` |
| Vendor's own page | `src/app/v/[token]/` |
| Demo data | `scripts/seed-emulator.ts` |
