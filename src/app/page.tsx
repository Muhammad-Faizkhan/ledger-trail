"use client";

import { Dashboard } from "./_components/Dashboard";
import { Gate } from "./_components/Gate";

export default function Home() {
  return <Gate>{(s) => <Dashboard businessId={s.businessId} ledger={s.ledger} />}</Gate>;
}
