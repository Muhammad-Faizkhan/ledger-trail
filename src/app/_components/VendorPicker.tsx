"use client";

import { useState } from "react";
import type { Vendor } from "@/lib/types";
import { useSession } from "./Gate";
import { Button, ErrorText, Field, useAction } from "./ui";
import { addVendor } from "./writes";

/**
 * Search-as-you-type vendor chooser. With `allowAdd`, a name that isn't in the
 * list can be added as a new vendor right here, without leaving the form.
 */
export function VendorPicker({ value, onChange, allowAdd, locked, label = "Vendor", note }: {
  value: string | null;
  onChange: (vendorId: string | null) => void;
  allowAdd?: boolean;
  locked?: boolean;
  label?: string;
  note?: (v: Vendor) => React.ReactNode;
}) {
  const { businessId, ledger } = useSession();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const { busy, error, run } = useAction();
  const selected = value ? ledger.vendors.find((v) => v.id === value) : undefined;

  if (value) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted">{label}</span>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-accent bg-accent-soft px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">{selected?.name ?? "…"}</span>
            {selected && note ? <span className="block text-muted">{note(selected)}</span>
              : selected?.phone && <span className="block text-muted">{selected.phone}</span>}
          </span>
          {!locked && (
            <Button variant="ghost" className="shrink-0" onClick={() => { onChange(null); setQuery(""); }}>Change</Button>
          )}
        </div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const matches = ledger.vendors
    .filter((v) => !q || v.name.toLowerCase().includes(q)
      || (digits.length >= 3 && v.phone.replace(/\D/g, "").includes(digits)))
    .slice(0, 8);
  const exact = ledger.vendors.some((v) => v.name.trim().toLowerCase() === q);

  async function add() {
    await run(async () => {
      const id = await addVendor(businessId, { name: query, phone });
      setAdding(false);
      setPhone("");
      onChange(id);
    });
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-muted">{label}</span>
        <input type="search" autoFocus value={query} maxLength={120}
          onChange={(e) => { setQuery(e.target.value); setAdding(false); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (matches.length === 1) onChange(matches[0].id);
          }}
          placeholder={ledger.vendors.length ? "Type to search vendors" : "Type the vendor's name"}
          className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
      </label>

      {matches.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {matches.map((v) => (
            <li key={v.id} className="border-b border-border last:border-0">
              <button type="button" onClick={() => onChange(v.id)}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2">
                <span className="font-medium">{v.name}</span>
                <span className="text-muted">{v.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && matches.length === 0 && !allowAdd && <p className="text-muted">No vendor matches “{query.trim()}”.</p>}

      {allowAdd && q && !exact && !adding && (
        <Button variant="secondary" className="justify-start" onClick={() => setAdding(true)}>
          ＋ Add new vendor “{query.trim()}”
        </Button>
      )}
      {adding && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-3">
          <p className="font-semibold">New vendor: {query.trim()}</p>
          <Field label="Phone / WhatsApp (optional)" type="tel" maxLength={30} autoFocus value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={add}>{busy ? "Adding…" : "Add vendor"}</Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
