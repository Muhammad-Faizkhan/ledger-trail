"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { vendorTotals } from "@/lib/derive";
import { useSession } from "../../_components/Gate";
import {
  Button, Card, Chips, EmptyState, ErrorText, Field, Money, PageHeader, SearchBox, useAction,
} from "../../_components/ui";
import { addVendor } from "../../_components/writes";

type Sort = "owed" | "name";

export default function VendorsPage() {
  const { ledger } = useSession();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("owed");
  const [adding, setAdding] = useState(false);
  const totals = vendorTotals(ledger.orders, ledger.payments);
  const owed = (id: string) => totals.get(id)?.outstanding ?? 0;
  const q = query.trim().toLowerCase();

  const list = ledger.vendors
    .filter((v) => !q || v.name.toLowerCase().includes(q) || v.phone.includes(q))
    .sort((a, b) => (sort === "owed" ? owed(b.id) - owed(a.id) : 0) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader title="Vendors" action={!adding && <Button onClick={() => setAdding(true)}>＋ Add vendor</Button>} />
      {adding && <AddVendor onDone={() => setAdding(false)} />}

      {ledger.vendors.length === 0 ? (
        !adding && <EmptyState title="No vendors yet" text="Add the people and shops you buy from."
          action={<Button onClick={() => setAdding(true)}>＋ Add vendor</Button>} />
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search name or phone" />
          <Chips label="Sort" value={sort} options={[["owed", "Most owed first"], ["name", "A–Z"]]} onChange={setSort} />
          {list.length === 0 ? (
            <EmptyState title="No match" text={`No vendor matches “${query.trim()}”.`} />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((v) => {
                const o = owed(v.id);
                return (
                  <li key={v.id}>
                    <Link href={`/vendors/${v.id}`}
                      className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 hover:border-accent">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{v.name}</span>
                        {v.phone && <span className="block text-sm text-muted">{v.phone}</span>}
                      </span>
                      <span className="shrink-0 text-right text-sm">
                        {o > 0 ? (
                          <><span className="block text-xs text-muted">You owe</span><Money value={o} className="font-bold text-danger" /></>
                        ) : o < 0 ? (
                          <><span className="block text-xs text-muted">Advance</span><Money value={-o} className="font-semibold text-success" /></>
                        ) : (
                          <span className="text-muted">Settled</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function AddVendor({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { businessId } = useSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    let id = "";
    if (await run(async () => { id = await addVendor(businessId, { name, phone }); })) {
      onDone();
      router.push(`/vendors/${id}`);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="font-semibold">New vendor</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Phone / WhatsApp (optional)" type="tel" maxLength={30} value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save vendor"}</Button>
          <Button variant="secondary" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
