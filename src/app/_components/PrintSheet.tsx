"use client";

import type { ReactNode } from "react";
import { useSession } from "./Gate";
import { Button, PageHeader } from "./ui";

/** A white A4-style sheet with the business name on top; the app frame is hidden when printing. */
export function PrintSheet({ title, back, children }: {
  title: string; back: { href: string; label: string }; children: ReactNode;
}) {
  const { ledger } = useSession();
  const business = ledger.business;
  return (
    <>
      <div className="no-print">
        <PageHeader title={title} back={back}
          subtitle="Use Print, then choose “Save as PDF” to get a file you can share."
          action={<Button onClick={() => window.print()}>Print / Save as PDF</Button>} />
      </div>
      <article className="mx-auto w-full max-w-[210mm] rounded-2xl border border-border bg-white p-6 text-sm text-black shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 border-b-2 border-black pb-3">
          <p className="text-xl font-bold">{business?.name}</p>
          {business?.phone && <p className="text-gray-600">{business.phone}</p>}
        </header>
        {children}
      </article>
    </>
  );
}

export const printTable = "w-full border-collapse [&_td]:border-b [&_td]:border-gray-300 [&_td]:py-1.5 [&_th]:border-b-2 [&_th]:border-black [&_th]:py-1.5 [&_th]:text-left";
