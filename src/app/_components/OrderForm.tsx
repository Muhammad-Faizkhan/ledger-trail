"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isIsoDate, money, parseNonNegativeNumber, parsePositiveNumber, today } from "@/lib/format";
import { UNITS, type CatalogItem, type Order } from "@/lib/types";
import { useSession } from "./Gate";
import { Button, ErrorText, Field, TextArea, useAction } from "./ui";
import { VendorPicker } from "./VendorPicker";
import { saveOrder, type OrderDraft } from "./writes";

interface Row {
  key: number;
  name: string;
  qty: string;
  unit: string;
  rate: string;
}

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, name: "", qty: "", unit: "", rate: "" });
const isBlank = (r: Row) => !r.name.trim() && !r.qty.trim() && !r.rate.trim();

/** Set after a new order is saved, so the order page can say so once. */
export const justSaved = { id: "" };

/**
 * New order, or edit an existing one. Vendor → items → Save. Everything
 * optional is folded under "More details".
 */
export function OrderForm({ order, initialVendorId }: { order?: Order; initialVendorId?: string }) {
  const router = useRouter();
  const { ledger } = useSession();
  const [vendorId, setVendorId] = useState<string | null>(order?.vendorId ?? initialVendorId ?? null);
  const [rows, setRows] = useState<Row[]>(() =>
    order
      ? order.items.map((it) => ({ key: nextKey++, name: it.name, qty: String(it.qty), unit: it.unit, rate: String(it.rate) }))
      : [blankRow()]);
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? today());
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? "");
  const [note, setNote] = useState(order?.note ?? "");
  const [more, setMore] = useState(Boolean(order?.expectedDate || order?.note));
  const { busy, error, setError, run } = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  const focusRow = useRef<number | null>(null);

  // Focus the name box of a row that was just added.
  useEffect(() => {
    if (focusRow.current == null) return;
    formRef.current?.querySelector<HTMLInputElement>(`[data-row="${focusRow.current}"][data-col="name"]`)?.focus();
    focusRow.current = null;
  }, [rows]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow() {
    const r = blankRow();
    focusRow.current = r.key;
    setRows((rs) => [...rs, r]);
  }

  const amounts = rows.map((r) => {
    const q = parsePositiveNumber(r.qty);
    const rate = parseNonNegativeNumber(r.rate);
    return q != null && rate != null ? Math.round(q * rate * 100) / 100 : null;
  });
  const total = amounts.reduce<number>((s, a) => s + (a ?? 0), 0);

  /** Enter moves to the next box; on the last box it adds a new item row. */
  function onItemsKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    const boxes = [...(formRef.current?.querySelectorAll<HTMLInputElement>("[data-col]") ?? [])];
    const i = boxes.indexOf(e.target);
    if (i >= 0 && i < boxes.length - 1) boxes[i + 1].focus();
    else addRow();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!vendorId) return setError("Pick a vendor first.");
    const filled = rows.filter((r) => !isBlank(r));
    if (filled.length === 0) return setError("Add at least one item.");
    const items: OrderDraft["items"] = [];
    for (const [i, r] of filled.entries()) {
      const qty = parsePositiveNumber(r.qty);
      const rate = parseNonNegativeNumber(r.rate);
      if (!r.name.trim()) return setError(`Item ${i + 1}: enter what you're ordering.`);
      if (qty == null) return setError(`${r.name.trim()}: enter a quantity above 0.`);
      if (rate == null) return setError(`${r.name.trim()}: enter the rate (0 if not known yet).`);
      items.push({ name: r.name.trim(), qty, unit: r.unit.trim(), rate });
    }
    if (!isIsoDate(orderDate)) return setError("Enter the order date.");

    let saved = "";
    const ok = await run(async () => {
      const res = await saveOrder({
        orderId: order?.id,
        vendorId,
        items,
        orderDate,
        expectedDate: isIsoDate(expectedDate) ? expectedDate : null,
        status: order?.status ?? "ordered",
        invoiceAmount: order?.invoiceAmount ?? null,
        invoiceNo: order?.invoiceNo ?? null,
        invoiceDate: order?.invoiceDate ?? null,
        note: note.trim(),
      });
      saved = res.id;
    });
    if (!ok) return;
    if (!order) justSaved.id = saved;
    router.push(`/orders/${saved}`);
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <StepTitle n={1} text="Who are you ordering from?" />
        <VendorPicker value={vendorId} onChange={setVendorId} allowAdd locked={Boolean(order)} />
      </section>

      <section className="flex flex-col gap-2">
        <StepTitle n={2} text="What are you ordering?" />
        <div className="flex flex-col gap-3" onKeyDown={onItemsKeyDown}>
          {rows.map((r, i) => (
            <ItemRow key={r.key} row={r} index={i} amount={amounts[i]} catalog={ledger.catalog}
              canRemove={rows.length > 1}
              onChange={(patch) => update(r.key, patch)}
              onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
          ))}
        </div>
        <Button variant="secondary" className="self-start" onClick={addRow}>＋ Add another item</Button>
        <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
      </section>

      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="Order date" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          {more && (
            <Field label="Deliver by (optional)" type="date" value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)} />
          )}
        </div>
        {more ? (
          <TextArea label="Note for the vendor (optional)" maxLength={1000} value={note}
            placeholder="e.g. Deliver to site 2, call before coming"
            onChange={(e) => setNote(e.target.value)} />
        ) : (
          <Button variant="ghost" className="self-start px-2" onClick={() => setMore(true)}>
            ＋ Delivery date or note
          </Button>
        )}
      </section>

      <div className="sticky bottom-20 z-10 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-2xl md:border">
        <ErrorText>{error}</ErrorText>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted">Total</p>
            <p className="text-xl font-bold tabular-nums">{money(total)}</p>
          </div>
          <div className="flex gap-2">
            {order && <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>}
            <Button type="submit" disabled={busy} className="min-w-32 text-base">
              {busy ? "Saving…" : order ? "Save changes" : "Save order"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function StepTitle({ n, text }: { n: number; text: string }) {
  return (
    <h2 className="flex items-center gap-2 font-semibold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">{n}</span>
      {text}
    </h2>
  );
}

const boxLook =
  "min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function ItemRow({ row, index, amount, catalog, canRemove, onChange, onRemove }: {
  row: Row; index: number; amount: number | null; catalog: CatalogItem[]; canRemove: boolean;
  onChange: (patch: Partial<Row>) => void; onRemove: () => void;
}) {
  const [suggest, setSuggest] = useState(false);
  const q = row.name.trim().toLowerCase();
  const matches = q
    ? catalog
        .filter((c) => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q)
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
        .slice(0, 6)
    : [];

  function pick(c: CatalogItem) {
    onChange({
      name: c.name,
      unit: row.unit || c.unit,
      rate: row.rate || String(c.lastRate),
    });
    setSuggest(false);
  }

  // Typing a saved item's full name also fills its unit and last rate.
  function onName(name: string) {
    const exact = catalog.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    onChange(exact ? { name, unit: row.unit || exact.unit, rate: row.rate || String(exact.lastRate) } : { name });
    setSuggest(true);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="grid grid-cols-6 gap-2 md:grid-cols-12 md:items-end">
        <label className="relative col-span-6 flex flex-col gap-1 text-sm md:col-span-5">
          <span className="font-medium text-muted">Item {index + 1}</span>
          <input data-row={row.key} data-col="name" value={row.name} maxLength={120} autoComplete="off"
            placeholder="e.g. Cement" className={boxLook}
            onChange={(e) => onName(e.target.value)}
            onFocus={() => setSuggest(true)} onBlur={() => setSuggest(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggest && matches.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                pick(matches[0]);
              }
            }} />
          {suggest && matches.length > 0 && (
            <ul className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left hover:bg-surface-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted">{c.unit ? `${c.unit} · ` : ""}{money(c.lastRate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-muted">Qty</span>
          <input data-row={row.key} data-col="qty" inputMode="decimal" autoComplete="off" value={row.qty}
            onChange={(e) => onChange({ qty: e.target.value })} className={`${boxLook} tabular-nums`} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-muted">Unit</span>
          <input data-row={row.key} data-col="unit" list="units" maxLength={20} autoComplete="off" value={row.unit}
            placeholder="bag" onChange={(e) => onChange({ unit: e.target.value })} className={boxLook} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-muted">Rate (Rs)</span>
          <input data-row={row.key} data-col="rate" inputMode="decimal" autoComplete="off" value={row.rate}
            onChange={(e) => onChange({ rate: e.target.value })} className={`${boxLook} tabular-nums`} />
        </label>
        <div className="col-span-6 flex items-center justify-between md:col-span-1 md:flex-col md:items-end md:justify-end">
          <span className="text-sm font-semibold tabular-nums md:hidden">{amount != null ? `= ${money(amount)}` : ""}</span>
          {canRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove item ${index + 1}`}
              className="flex h-11 min-w-11 items-center justify-center rounded-xl text-sm text-muted hover:bg-danger-soft hover:text-danger">
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 hidden text-right text-sm font-semibold tabular-nums md:block">
        {amount != null ? money(amount) : ""}
      </p>
    </div>
  );
}
